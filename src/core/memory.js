'use strict';

const { fn, openProcess, isElevated, enablePrivilege, memoryStatus, performanceInfo, PROCESS_SET_QUOTA,
  PROCESS_SET_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION } = require('./win32');
const sys = require('./sysinfo');

const NEVER_TRIM = new Set([
  'system', 'system idle process', 'registry', 'memory compression', 'secure system',
  'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'lsaiso.exe',
  'dwm.exe', 'audiodg.exe', 'fontdrvhost.exe', 'explorer.exe', 'sihost.exe', 'ctfmon.exe',
  'textinputhost.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'searchhost.exe',
  'msmpeng.exe', 'mssense.exe', 'nissrv.exe', 'securityhealthservice.exe',
  'vmmem', 'vmmemwsl', 'vmwp.exe', 'vmcompute.exe', 'vmware-vmx.exe', 'virtualboxvm.exe',
  'qemu-system-x86_64.exe', 'qemu-system-aarch64.exe',
  'voicemeeter.exe', 'voicemeeterpro.exe', 'voicemeeter8.exe', 'voicemeeter8x64.exe',
]);

const PROFILES = {
  manual: { maxCpu: 0.05, idleMs: 20_000, minBytes: 10 * 1048576 },
  auto: { maxCpu: 0.01, idleMs: 300_000, minBytes: 50 * 1048576 },
  game: { maxCpu: 0.03, idleMs: 15_000, minBytes: 10 * 1048576 },
};

function sample() {
  const status = memoryStatus() || { total: 0, available: 0, load: 0 };
  const perf = performanceInfo() || {};
  const procs = sys.processes();
  const compression = procs.find((p) => p.name === 'Memory Compression');
  return {
    at: Date.now(),
    total: status.total,
    available: status.available,
    inUse: status.total - status.available,
    load: status.load,
    commit: perf.commitTotal || 0,
    commitLimit: perf.commitLimit || 0,
    cached: perf.systemCache || 0,
    compressed: compression ? compression.workingSet : 0,
    lists: sys.memoryLists(),
    procs,
  };
}

const strip = (s) => {
  const { procs, ...rest } = s;
  return rest;
};

function candidates(procs, stats, profileName, exclude = new Set()) {
  const profile = PROFILES[profileName] || PROFILES.manual;
  const self = fn.GetCurrentProcessId();
  const now = Date.now();
  const picked = [];
  let skippedActive = 0;
  let skippedProtected = 0;
  for (const p of procs) {
    if (p.pid <= 4 || p.pid === self || exclude.has(p.pid)) continue;
    if (NEVER_TRIM.has(p.name.toLowerCase())) { skippedProtected++; continue; }
    if (p.privateWs < profile.minBytes) continue;
    const st = stats ? stats.get(`${p.pid}:${p.createTime}`) : null;
    if (st) {
      if (st.cpu > profile.maxCpu) { skippedActive++; continue; }
      if (now - (st.lastForeground || 0) < profile.idleMs) { skippedActive++; continue; }
    }
    picked.push(p);
  }
  return { picked, skippedActive, skippedProtected };
}

function trimProcess(pid) {
  const h = openProcess(pid, PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION);
  if (h === null) return false;
  try {
    return !!fn.EmptyWorkingSet(h);
  } finally {
    fn.CloseHandle(h);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function freeMemory(options = {}) {
  const {
    profile = 'manual',
    stats = null,
    exclude = new Set(),
    deep = false,
    settleMs = 8000,
    onProgress = () => {},
  } = options;

  const elevated = isElevated();
  if (elevated) enablePrivilege('SeDebugPrivilege');

  onProgress({ phase: 'measure' });
  const before = sample();
  const steps = [];

  onProgress({ phase: 'trim' });
  const { picked, skippedActive, skippedProtected } = candidates(before.procs, stats, profile, exclude);
  let trimmed = 0;
  let denied = 0;
  const trimmedPids = new Map();
  for (const p of picked) {
    if (trimProcess(p.pid)) {
      trimmed++;
      trimmedPids.set(p.pid, p);
    } else {
      denied++;
    }
  }
  const afterTrim = sys.processes();
  let trimmedBytes = 0;
  const top = [];
  for (const p of afterTrim) {
    const was = trimmedPids.get(p.pid);
    if (!was || was.createTime !== p.createTime) continue;
    const delta = Math.max(was.privateWs - p.privateWs, 0);
    trimmedBytes += delta;
    top.push({ name: was.name, pid: p.pid, bytes: delta, before: was.privateWs, after: p.privateWs });
  }
  top.sort((a, b) => b.bytes - a.bytes);
  steps.push({ id: 'trim', ok: trimmed > 0, count: trimmed, bytes: trimmedBytes, denied, skippedActive, skippedProtected, top: top.slice(0, 6), processes: top });

  if (elevated) {
    onProgress({ phase: 'system' });
    const listsBefore = sys.memoryLists();

    const fileCache = sys.trimSystemFileCache();
    steps.push({ id: 'fileCache', ok: fileCache });

    const flush = sys.memoryCommand(sys.MemoryCommand.FlushModifiedList);
    const listsAfterFlush = sys.memoryLists();
    steps.push({
      id: 'modified',
      ok: flush.ok,
      bytes: listsBefore && listsAfterFlush ? Math.max(listsBefore.modified - listsAfterFlush.modified, 0) : 0,
    });

    const low = sys.memoryCommand(deep ? sys.MemoryCommand.PurgeStandbyList : sys.MemoryCommand.PurgeLowPriorityStandbyList);
    const listsAfterPurge = sys.memoryLists();
    steps.push({
      id: deep ? 'standbyAll' : 'standbyLow',
      ok: low.ok,
      bytes: listsAfterFlush && listsAfterPurge ? Math.max(listsAfterFlush.standby - listsAfterPurge.standby, 0) : 0,
    });

    const combined = sys.combineMemory();
    steps.push({ id: 'combine', ok: combined.ok, bytes: combined.pages * sys.PAGE });
  } else {
    steps.push({ id: 'admin', ok: false });
  }

  const immediate = sample();

  if (settleMs > 0) {
    const until = Date.now() + settleMs;
    while (Date.now() < until) {
      onProgress({ phase: 'settle', remaining: Math.max(until - Date.now(), 0), total: settleMs });
      await wait(Math.min(500, Math.max(until - Date.now(), 0)));
    }
  }
  const after = settleMs > 0 ? sample() : immediate;

  const heavy = after.procs
    .filter((p) => p.pid > 4 && !NEVER_TRIM.has(p.name.toLowerCase()))
    .sort((a, b) => b.privateWs - a.privateWs)
    .slice(0, 5)
    .map((p) => ({ pid: p.pid, name: p.name, bytes: p.privateWs }));

  return {
    profile,
    elevated,
    deep,
    settleMs,
    before: strip(before),
    immediate: strip(immediate),
    after: strip(after),
    freed: Math.max(before.inUse - after.inUse, 0),
    freedImmediate: Math.max(before.inUse - immediate.inUse, 0),
    steps,
    heavy,
  };
}

function setEfficiency(pid, on) {
  const h = openProcess(pid, PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION);
  if (h === null) return false;
  try {
    const throttle = Buffer.alloc(12);
    throttle.writeUInt32LE(1, 0);
    throttle.writeUInt32LE(1, 4);
    throttle.writeUInt32LE(on ? 1 : 0, 8);
    const a = fn.SetProcessInformation(h, 4, throttle, 12);
    const b = fn.SetPriorityClass(h, on ? 0x40 : 0x20);
    const prio = Buffer.alloc(4);
    prio.writeUInt32LE(on ? 2 : 5);
    fn.SetProcessInformation(h, 0, prio, 4);
    return !!(a || b);
  } finally {
    fn.CloseHandle(h);
  }
}

module.exports = { NEVER_TRIM, PROFILES, sample, candidates, trimProcess, freeMemory, setEfficiency };
