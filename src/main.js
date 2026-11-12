'use strict';
if (process.argv.includes('--gpu-bench')) {
  require('./gpubench');
  return;
}

const { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

app.setPath('userData', path.join(app.getPath('appData'), 'Evl Optimizer', 'app'));
app.setAppUserModelId('com.evl.optimizer');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2');
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,CalculateNativeWinOcclusion');
const APP_VERSION = require('../package.json').version;

const core = {
  win32: require('./core/win32'),
  settings: require('./core/settings'),
  memory: require('./core/memory'),
  cleaner: require('./core/cleaner'),
  updater: require('./core/updater'),
  tweaks: require('./core/tweaks'),
  system: require('./core/system'),
  uninstaller: require('./core/uninstaller'),
  appx: require('./core/appx'),
  debloat: require('./core/debloat'),
  perf: require('./core/perf'),
  benchmark: require('./core/benchmark'),
  util: require('./core/util'),
  license: require('./core/license'),
};
const { Monitor } = require('./core/monitor');
const { GameMode } = require('./core/gamemode');
const activity = require('./core/activity');
const sysinfo = require('./core/sysinfo');
const logbook = require('./logbook');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let tray = null;
let quitting = false;
let trayHintShown = false;
const monitor = new Monitor();
const ecoPids = new Set();

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function systemLocale() {
  try {
    const list = app.getPreferredSystemLanguages();
    if (list && list.length) return list[0];
  } catch {  }
  return app.getLocale();
}

function lang() {
  const pref = core.settings.get().lang;
  if (['pt', 'en', 'es'].includes(pref)) return pref;
  const l = systemLocale().toLowerCase();
  return l.startsWith('pt') ? 'pt' : l.startsWith('es') ? 'es' : 'en';
}
const T = (pt, en, es) => ({ pt, en, es: es || en })[lang()];

const ICON = path.join(__dirname, '..', 'build', 'icon.png');

function createWindow() {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: '#0c0a09',
    title: 'EVL Optimizer',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0c0a09', symbolColor: '#83776c', height: 40 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (process.env.EVL_SELFTEST) {
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 5000));
      const out = process.env.EVL_SELFTEST;
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'selftest.png'), (await win.webContents.capturePage()).toPNG());
      const ram = app.getAppMetrics().map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) }));
      fs.writeFileSync(path.join(out, 'selftest.json'), JSON.stringify({ version: APP_VERSION, elevated: core.win32.isElevated(), packaged: app.isPackaged, ram }, null, 2));
      quitting = true;
      app.quit();
    });
  }
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  monitor.setInterval(1000);
  win.on('closed', () => {
    win = null;
    monitor.setInterval(2000);
    setTimeout(trimSelf, 3000);
    if (!quitting && core.settings.get().trayOnClose && !trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon({
        iconType: 'none',
        icon: nativeImage.createFromPath(ICON),
        title: 'EVL Optimizer',
        content: T('Continuo na bandeja cuidando do PC. Clique no ícone para abrir.', 'Still running in the tray. Click the icon to open.', 'Sigo en la bandeja cuidando la PC. Haz clic en el icono para abrir.'),
      });
    }
  });
}

let gc = null;
try {
  require('v8').setFlagsFromString('--expose_gc');
  gc = require('vm').runInNewContext('gc');
} catch { gc = null; }

function trimSelf() {
  if (win && !win.isDestroyed()) return;
  try { if (gc) gc(); } catch {  }
  core.win32.fn.EmptyWorkingSet(core.win32.fn.GetCurrentProcess());
  for (const m of app.getAppMetrics()) {
    if (m.pid !== process.pid) core.memory.trimProcess(m.pid);
  }
}

function buildTrayMenu() {
  if (!tray) return;
  const cfg = core.settings.get();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: T('Abrir EVL Optimizer', 'Open EVL Optimizer', 'Abrir EVL Optimizer'), click: createWindow },
    { label: T('Liberar memória agora', 'Free memory now', 'Liberar memoria ahora'), click: () => freeFromTray() },
    { type: 'separator' },
    { label: T('Modo Jogo automático', 'Automatic Game Mode', 'Modo Juego automático'), type: 'checkbox', checked: !!cfg.gameMode, click: (item) => { core.settings.set({ gameMode: item.checked }); send('settings:changed', core.settings.get()); } },
    { label: T('Liberar memória sozinho', 'Free memory automatically', 'Liberar memoria automáticamente'), type: 'checkbox', checked: !!cfg.autoFree, click: (item) => { core.settings.set({ autoFree: item.checked }); send('settings:changed', core.settings.get()); } },
    { type: 'separator' },
    { label: T('Sair', 'Quit', 'Salir'), click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('EVL Optimizer');
  tray.on('click', createWindow);
  buildTrayMenu();
}

const gb = (b) => `${(b / 1073741824).toFixed(1)} GB`;

async function freeFromTray() {
  const r = await runFree('manual');
  if (tray && (!win || !win.isVisible())) {
    tray.displayBalloon({
      iconType: 'none',
      icon: nativeImage.createFromPath(ICON),
      title: T('Memória liberada', 'Memory freed', 'Memoria liberada'),
      content: T(`${gb(r.freed)} a menos em uso (medido ${r.settleMs / 1000} s depois).`, `${gb(r.freed)} less in use (measured ${r.settleMs / 1000} s later).`, `${gb(r.freed)} menos en uso (medido ${r.settleMs / 1000} s después).`),
    });
  }
}

let freeing = null;
let lastAutoFree = 0;
let overThreshold = 0;

function runFree(profile, extra = {}) {
  if (freeing) return freeing;
  const cfg = core.settings.get();
  freeing = core.memory.freeMemory({
    profile,
    stats: monitor.stats,
    deep: profile === 'manual' && cfg.deepFree,
    settleMs: profile === 'manual' ? 8000 : 0,
    onProgress: (p) => send('memory:progress', p),
    ...extra,
  }).then((r) => {
    const hist = [{ at: Date.now(), profile, freed: r.freed, before: r.before.inUse, after: r.after.inUse }, ...(core.settings.get().freeHistory || [])].slice(0, 30);
    core.settings.set({ freeHistory: hist });
    r.logId = logbook.memory(r).id;
    send('memory:done', r);
    return r;
  }).finally(() => { freeing = null; });
  return freeing;
}

function autoFreeTick(snap) {
  const cfg = core.settings.get();
  if (!cfg.autoFree || freeing) { overThreshold = 0; return; }
  if (snap.ram.load * 100 >= cfg.autoFreeThreshold) overThreshold++;
  else overThreshold = 0;
  if (overThreshold >= 3 && Date.now() - lastAutoFree > 3 * 60_000) {
    lastAutoFree = Date.now();
    overThreshold = 0;
    runFree('auto').then((r) => send('memory:auto', { freed: r.freed, at: Date.now() }));
  }
}

const gameMode = new GameMode(monitor, (event) => {
  const { free, ...rest } = event;
  send('gamemode', { ...rest, state: gameMode.publicState() });
  if (event.type === 'active') {
    if (free) logbook.memory(free);
    logbook.simple('game', 'log.game.enter', { game: event.game }, true, [
      logbook.R('log.game.plan', {}, event.plan ? 'ok' : 'skip'),
      logbook.R('log.game.eco', { n: event.eco }, event.eco ? 'ok' : 'skip'),
    ]);
  }
  if (event.type === 'leave') {
    logbook.simple('game', 'log.game.leave', { game: event.game, minutes: event.minutes }, true, [
      logbook.R('log.game.planBack', {}, event.plan ? 'ok' : 'skip'),
      logbook.R('log.game.ecoBack', { n: event.eco }, event.eco ? 'ok' : 'skip'),
      logbook.R('log.game.purges', { n: event.purges || 0 }, 'info'),
    ]);
  }
  if (tray && (event.type === 'enter' || event.type === 'leave') && (!win || !win.isVisible())) {
    tray.displayBalloon({
      iconType: 'none',
      icon: nativeImage.createFromPath(ICON),
      title: T('Modo Jogo', 'Game Mode', 'Modo Juego'),
      content: event.type === 'enter'
        ? T(`${event.game}: PC preparado para o jogo.`, `${event.game}: PC ready for gaming.`, `${event.game}: PC lista para jugar.`)
        : T(`${event.game} fechou. Tudo voltou ao normal.`, `${event.game} closed. Everything is back to normal.`, `${event.game} se cerró. Todo volvió a la normalidad.`),
    });
  }
});

let tickCount = 0;
monitor.on((snap) => {
  tickCount++;
  if (tray && tickCount % 3 === 0) {
    const gm = gameMode.publicState();
    tray.setToolTip(`EVL Optimizer\nRAM ${Math.round(snap.ram.load * 100)}% · CPU ${Math.round(snap.cpu * 100)}%${gm ? `\n${T('Modo Jogo', 'Game Mode', 'Modo Juego')}: ${gm.game}` : ''}`);
  }
  autoFreeTick(snap);
  if (tickCount % 2 === 0) gameMode.tick().catch(() => {});
  if (win && !win.isDestroyed() && win.isVisible()) {
    send('metrics', { ...snap, game: gameMode.publicState(), freeing: !!freeing });
  }
});

const KILL_PROTECTED = new Set(['system', 'system idle process', 'registry', 'memory compression', 'secure system', 'smss.exe',
  'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'lsaiso.exe', 'svchost.exe', 'dwm.exe',
  'fontdrvhost.exe', 'explorer.exe', 'sihost.exe', 'ctfmon.exe', 'wudfhost.exe', 'spoolsv.exe', 'msmpeng.exe',
  'mssense.exe', 'nissrv.exe', 'securityhealthservice.exe', 'textinputhost.exe', 'startmenuexperiencehost.exe',
  'shellexperiencehost.exe', 'searchhost.exe', 'audiodg.exe']);
const isKillProtected = (pid, name) => pid <= 4 || pid === process.pid || KILL_PROTECTED.has(String(name || '').toLowerCase());

const pathCache = new Map();
function pathOf(p) {
  const key = `${p.pid}:${p.createTime}`;
  let v = pathCache.get(key);
  if (v === undefined) {
    v = p.pid > 4 ? core.win32.processImagePath(p.pid) : '';
    pathCache.set(key, v);
    if (pathCache.size > 2000) pathCache.delete(pathCache.keys().next().value);
  }
  return v;
}

const iconCache = new Map();
async function iconFor(file) {
  if (!file) return '';
  const key = file.toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);
  let url = '';
  try {
    if (/\.(png|jpg|jpeg|ico)$/i.test(file)) {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) url = img.resize({ width: 48, height: 48, quality: 'best' }).toDataURL();
    }
    if (!url && fs.existsSync(file)) {
      const img = await app.getFileIcon(file, { size: 'large' });
      if (!img.isEmpty()) url = img.toDataURL();
    }
  } catch { url = ''; }
  iconCache.set(key, url);
  return url;
}

function processList() {
  const self = process.pid;
  return monitor.procs.filter((p) => p.pid > 0).map((p) => {
    const lower = p.name.toLowerCase();
    return {
      pid: p.pid,
      ppid: p.ppid,
      name: p.name,
      path: pathOf(p),
      cpu: p.cpu || 0,
      gpu: p.gpu || 0,
      memory: p.privateWs,
      workingSet: p.workingSet,
      commit: p.privateBytes,
      threads: p.threads,
      handles: p.handles,
      session: p.session,
      protected: isKillProtected(p.pid, lower),
      noTrim: core.memory.NEVER_TRIM.has(lower),
      eco: ecoPids.has(`${p.pid}:${p.createTime}`),
      self: p.pid === self,
      createTime: p.createTime,
    };
  });
}

let cleanerCancel = false;
let uninstallJob = null;

function runGpuBench(seconds = 6, onTick = () => {}) {
  return new Promise((resolve) => {
    const args = app.isPackaged ? ['--gpu-bench', `--seconds=${seconds}`] : [path.resolve(__dirname, '..'), '--gpu-bench', `--seconds=${seconds}`];
    let child;
    try {
      child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      resolve({ ok: false, reason: 'spawn' });
      return;
    }
    let out = '';
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(() => { try { child.kill(); } catch {  } finish({ ok: false, reason: 'timeout' }); }, (seconds + 45) * 1000);
    child.stdout.on('data', (d) => {
      out += d.toString();
      let nl;
      while ((nl = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (line.startsWith('EVLGPUTICK:')) onTick(Number(line.slice(11)));
        else if (line.startsWith('EVLGPU:')) {
          try { finish(JSON.parse(line.slice(7))); } catch { finish({ ok: false, reason: 'parse' }); }
        }
      }
    });
    child.on('exit', () => { clearTimeout(timer); finish({ ok: false, reason: 'no-output' }); });
    child.on('error', () => { clearTimeout(timer); finish({ ok: false, reason: 'spawn' }); });
  });
}

function programById(id) {
  return core.uninstaller.listPrograms().find((p) => p.id === id) || null;
}

const readShortcut = (p) => {
  try { return shell.readShortcutLink(p); } catch { return null; }
};

async function relaunchAsAdmin() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const args = app.isPackaged ? [] : [path.resolve(__dirname, '..')];
  const quoted = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  app.releaseSingleInstanceLock();
  const ps = path.join(core.util.SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const cmd = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' ${quoted ? `-ArgumentList ${quoted}` : ''} -Verb RunAs`;
  const r = await core.util.run(ps, ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 60_000 });
  if (r.code === 0) {
    quitting = true;
    app.quit();
    return { ok: true };
  }
  app.requestSingleInstanceLock();
  return { ok: false, reason: 'cancelled' };
}

async function setStartWithWindows(on) {
  const schtasks = path.join(core.util.SYSTEM32, 'schtasks.exe');
  if (!on) {
    await core.util.run(schtasks, ['/delete', '/tn', 'EVL Optimizer', '/f']);
    return { ok: true };
  }
  if (!core.win32.isElevated()) return { ok: false, reason: 'admin' };
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const tr = app.isPackaged ? `"${exe}" --tray` : `"${exe}" "${path.resolve(__dirname, '..')}" --tray`;
  const r = await core.util.run(schtasks, ['/create', '/tn', 'EVL Optimizer', '/tr', tr, '/sc', 'onlogon', '/rl', 'highest', '/f']);
  return { ok: r.code === 0, detail: r.out.trim() };
}

const handlers = {
  'app:info': async () => {
    const os = require('os');
    const reg = require('./core/registry');
    const cv = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
    const build = reg.readString('HKLM', cv, 'CurrentBuild');
    let osName = reg.readString('HKLM', cv, 'ProductName') || 'Windows';
    if (Number(build) >= 22000) osName = osName.replace('Windows 10', 'Windows 11');
    const gpu = core.perf.gpuInfo();
    return {
      version: APP_VERSION,
      elevated: core.win32.isElevated(),
      packaged: app.isPackaged,
      locale: systemLocale(),
      os: `${osName} ${reg.readString('HKLM', cv, 'DisplayVersion')}`.trim(),
      build,
      cpu: reg.readString('HKLM', 'HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'ProcessorNameString') || os.cpus()[0].model,
      threads: os.cpus().length,
      gpu: gpu.name || core.win32.primaryGpuName(),
      vramTotal: gpu.vramTotal,
      ram: os.totalmem(),
      computer: os.hostname(),
      dataDir: core.util.dataDir(),
    };
  },
  'app:relaunchAdmin': relaunchAsAdmin,
  'app:quit': () => { quitting = true; app.quit(); },
  'settings:get': () => core.settings.get(),
  'settings:set': async (patch) => {
    if (patch && 'startWithWindows' in patch) {
      const r = await setStartWithWindows(!!patch.startWithWindows);
      if (!r.ok) return { ...core.settings.get(), error: r.reason || 'failed' };
    }
    const next = core.settings.set(patch);
    buildTrayMenu();
    return next;
  },

  'metrics:latest': () => ({ ...monitor.latest, game: gameMode.publicState() }),
  'metrics:history': () => ({ short: monitor.history, long: monitor.long }),

  'memory:free': () => runFree('manual'),
  'memory:detail': () => {
    const s = core.memory.sample();
    const { procs, ...rest } = s;
    const top = procs.filter((p) => p.pid > 4).sort((a, b) => b.privateWs - a.privateWs).slice(0, 12)
      .map((p) => ({ pid: p.pid, name: p.name, memory: p.privateWs, path: pathOf(p) }));
    const plan = core.memory.candidates(procs, monitor.stats, 'manual');
    return {
      ...rest,
      top,
      leaks: monitor.leaks(),
      candidates: plan.picked.length,
      candidateBytes: plan.picked.reduce((a, p) => a + p.privateWs, 0),
      elevated: core.win32.isElevated(),
    };
  },

  'processes:list': () => processList(),
  'process:kill': async ({ pids, name }) => {
    const w = core.win32;
    const rows = [];
    let done = 0;
    for (const pid of pids || []) {
      if (isKillProtected(pid, name)) { rows.push(logbook.R('log.proc.protected', { name, pid }, 'skip')); continue; }
      const h = w.openProcess(pid, w.PROCESS_TERMINATE | w.SYNCHRONIZE);
      if (h === null) { rows.push(logbook.R('log.proc.denied', { name, pid }, 'fail')); continue; }
      try {
        if (w.fn.TerminateProcess(h, 1)) { w.fn.WaitForSingleObject(h, 2000); done++; }
      } finally {
        w.fn.CloseHandle(h);
      }
    }
    const alive = new Set(sysinfo.processes().map((p) => p.pid));
    for (const pid of pids || []) {
      if (!isKillProtected(pid, name)) rows.push(logbook.R('log.proc.gone', { name, pid }, alive.has(pid) ? 'fail' : 'ok'));
    }
    const verified = (pids || []).every((pid) => isKillProtected(pid, name) || !alive.has(pid));
    const e = logbook.simple('process', 'log.proc.kill', { name, n: done }, done > 0, rows, verified);
    return { ok: done > 0, reason: done ? '' : rows.some((r) => r.key === 'log.proc.protected') ? 'protected' : 'denied', logId: e.id };
  },
  'process:trim': ({ pids, name }) => {
    const before = new Map(sysinfo.processes().map((p) => [p.pid, p]));
    let ok = 0;
    for (const pid of pids || []) if (core.memory.trimProcess(pid)) ok++;
    const after = new Map(sysinfo.processes().map((p) => [p.pid, p]));
    const rows = [];
    let freed = 0;
    for (const pid of pids || []) {
      const b = before.get(pid);
      const a = after.get(pid);
      if (!b || !a) continue;
      freed += Math.max(b.privateWs - a.privateWs, 0);
      rows.push(logbook.R('log.mem.proc', { name: b.name, pid, beforeBytes: b.privateWs, afterBytes: a.privateWs }, a.privateWs <= b.privateWs ? 'ok' : 'fail'));
    }
    const e = logbook.simple('process', 'log.proc.trim', { name, freedBytes: freed }, ok > 0, rows, ok > 0 && freed > 0);
    return { ok: ok > 0, freed, logId: e.id };
  },
  'process:efficiency': ({ items, on, name }) => {
    const rows = [];
    let ok = 0;
    for (const { pid, createTime } of items || []) {
      const done = core.memory.setEfficiency(pid, on);
      const key = `${pid}:${createTime}`;
      if (done) { ok++; if (on) ecoPids.add(key); else ecoPids.delete(key); }
      rows.push(logbook.R('log.proc.ecoItem', { name, pid }, done ? 'ok' : 'fail'));
    }
    const e = logbook.simple('process', on ? 'log.proc.ecoOn' : 'log.proc.ecoOff', { name }, ok > 0, rows);
    return { ok: ok > 0, logId: e.id };
  },
  'icons:get': async (files) => {
    const out = {};
    for (const f of (files || []).slice(0, 400)) out[f] = await iconFor(f);
    return out;
  },

  'cleaner:catalog': () => core.cleaner.catalog(),
  'cleaner:scan': async (ids) => {
    cleanerCancel = false;
    return core.cleaner.scan(ids, { onProgress: (p) => send('cleaner:progress', { phase: 'scan', ...p }), cancelled: () => cleanerCancel });
  },
  'cleaner:clean': async (ids) => {
    cleanerCancel = false;
    const r = await core.cleaner.clean(ids, { onProgress: (p) => send('cleaner:progress', { phase: 'clean', ...p }), cancelled: () => cleanerCancel });
    const cleaned = Object.keys(r.perAction || {});
    let after = { entries: [] };
    if (cleaned.length) {
      after = await core.cleaner.scan(cleaned, { onProgress: (p) => send('cleaner:progress', { phase: 'verify', ...p }) });
    }
    const e = logbook.clean(r, after);
    return { ...r, after, logId: e.id };
  },
  'cleaner:cancel': () => { cleanerCancel = true; return true; },

  'startup:list': () => core.system.startupItems(),
  'startup:toggle': ({ id, enabled }) => {
    const r = core.system.setStartupEnabled(id, enabled);
    const now = core.system.startupItems().find((i) => i.id === id);
    const name = now ? now.name : String(id).split('|').slice(1).join('|');
    const verified = !!now && now.enabled === enabled;
    const e = logbook.simple('startup', enabled ? 'log.start.on' : 'log.start.off', { name }, !!r.ok,
      [logbook.R('log.start.check', { name, stateKey: now && now.enabled ? 'common.on' : 'common.off' }, verified ? 'ok' : 'fail')], verified);
    return { ...r, logId: e.id };
  },

  'tweaks:list': () => core.tweaks.list(),
  'tweaks:apply': async (id) => {
    const r = await core.tweaks.apply(id);
    const e = logbook.tweak(id, true, r);
    return { ...r, logId: e.id };
  },
  'tweaks:revert': async (id) => {
    const r = await core.tweaks.revert(id);
    const e = logbook.tweak(id, false, r);
    return { ...r, logId: e.id };
  },
  'hibernate:get': () => core.tweaks.hibernateState(),
  'hibernate:set': async (mode) => {
    const r = await core.tweaks.setHibernate(mode);
    const rows = r.before && r.after
      ? [logbook.R('log.hib.mode', { beforeKey: `hib.${r.before.mode}`, afterKey: `hib.${r.after.mode}` }, r.ok ? 'ok' : 'fail'),
        logbook.R('log.hib.file', { beforeBytes: r.before.bytes, afterBytes: r.after.bytes })]
      : [logbook.R('log.adminNeeded', {}, 'fail')];
    const e = logbook.simple('hibernate', 'log.hib.sum', { modeKey: `hib.${mode}` }, !!r.ok, rows);
    return { ...r, logId: e.id };
  },
  'power:list': async () => ({ plans: await core.system.powerPlans(), copies: core.settings.get().planCopies || {} }),
  'power:set': async (guid) => {
    let target = guid;
    if (guid === core.system.ULTIMATE || guid === core.system.HIGH) {
      const plans = await core.system.powerPlans();
      const copies = core.settings.get().planCopies || {};
      if (plans.some((p) => p.guid === guid)) target = guid;
      else if (copies[guid] && plans.some((p) => p.guid === copies[guid])) target = copies[guid];
      else {
        target = await core.system.ensurePlan(guid);
        if (target && target !== guid) core.settings.set({ planCopies: { ...copies, [guid]: target } });
      }
    }
    if (!target) return { ok: false, reason: 'missing' };
    const r = await core.system.setPowerPlan(target);
    const active = (await core.system.powerPlans()).find((p) => p.active);
    const verified = !!active && active.guid === target;
    const e = logbook.simple('power', 'log.power.sum', { name: active ? active.name : target }, !!r.ok,
      [logbook.R('log.power.active', { name: active ? active.name : '—', guid: active ? active.guid : '' }, verified ? 'ok' : 'fail')], verified);
    return { ...r, logId: e.id };
  },
  'network:run': async (action) => {
    const r = await core.system.network(action);
    const e = logbook.simple('network', 'log.net.sum', { nameKey: `net.${action}` }, !!r.ok,
      r.out ? [logbook.R('log.raw', { text: r.out }, r.ok ? 'ok' : 'fail')] : [logbook.R('log.adminNeeded', {}, 'fail')]);
    return { ...r, logId: e.id };
  },

  'restore:list': () => core.system.restorePoints(),
  'restore:create': async () => {
    const r = await core.system.createRestorePoint();
    let point = null;
    if (r.ok) point = ((await core.system.restorePoints()).points || [])[0] || null;
    const verified = !!point && /EVL Optimizer/i.test(point.description);
    const e = logbook.simple('restore', 'log.rs.created', {}, !!r.ok,
      [point ? logbook.R('log.rs.point', { name: point.description, created: point.created, seq: point.sequence }, verified ? 'ok' : 'fail')
        : logbook.R('log.raw', { text: r.detail || r.reason || '' }, 'fail')], verified);
    return { ...r, logId: e.id };
  },
  'restore:to': (seq) => core.system.restoreTo(seq),
  'journal:list': () => core.tweaks.load(),
  'journal:revert': async (keys) => {
    const results = [];
    const rows = [];
    for (const entry of core.tweaks.load().filter((e) => keys.includes(e.key))) {
      const r = await core.tweaks.revertEntry(entry);
      results.push({ key: entry.key, ...r });
      rows.push(logbook.R('log.journal.item', { title: entry.title, title_en: entry.title_en || entry.title, target: entry.target }, r.ok ? 'ok' : 'fail'));
    }
    const ok = results.filter((x) => x.ok).length;
    const e = logbook.simple('journal', 'log.journal.sum', { n: ok }, ok > 0, rows, ok === results.length);
    return results.map((x) => ({ ...x, logId: e.id }));
  },

  'uninstall:list': () => core.uninstaller.listPrograms(),
  'uninstall:size': (location) => core.uninstaller.folderSize(location),
  'uninstall:running': (location) => core.uninstaller.runningFrom(location),
  'update:check': () => core.updater.check(),
  'uninstall:run': async ({ id, quiet }) => {
    const program = programById(id);
    if (!program) return { ok: false, reason: 'missing' };
    const job = core.uninstaller.runUninstaller(program, { quiet, onState: (s) => send('uninstall:state', { id, ...s }) });
    uninstallJob = job;
    try {
      const r = await job.promise;
      const e = logbook.uninstallRun(program, r.command, r);
      return { ...r, logId: e.id };
    } finally {
      uninstallJob = null;
    }
  },
  'uninstall:skip': () => { if (uninstallJob) uninstallJob.abort(); return true; },
  'uninstall:scan': async ({ id, mode, program: given }) => {
    const program = given || programById(id);
    if (!program) return [];
    return core.uninstaller.scanLeftovers(program, { mode, readShortcut });
  },
  'uninstall:delete': async ({ program, items }) => {
    const useTrash = core.settings.get().recycleLeftovers;
    const r = await core.uninstaller.deleteLeftovers(program, items, { trash: useTrash ? (p) => shell.trashItem(p) : null });
    const e = logbook.uninstallDelete(program, r);
    return { ...r, logId: e.id };
  },

  'store:list': (opts) => core.appx.listApps(opts || {}),
  'store:remove': async (names) => {
    const r = await core.appx.removePackages(names, { onProgress: (p) => send('store:progress', p) });
    const remaining = await core.appx.installedMatching(names);
    const e = logbook.store(r, remaining);
    return { ...r, remaining, logId: e.id };
  },

  'debloat:status': () => core.debloat.status(),
  'debloat:items': () => core.debloat.ITEMS.map((i) => ({ id: i.id, group: i.group, on: i.on, packages: i.packages || [], tweaks: i.tweaks || [], special: i.special || null })),
  'debloat:run': async ({ ids, restorePoint }) => {
    if (restorePoint && core.win32.isElevated()) {
      send('debloat:progress', { phase: 'restore' });
      await handlers['restore:create']();
    }
    const report = await core.debloat.runDebloat(ids, { onProgress: (p) => send('debloat:progress', p) });
    const e = logbook.debloat(report);
    return { ...report, logId: e.id };
  },
  'debloat:restartExplorer': () => core.debloat.restartExplorer(),

  'gamemode:state': () => gameMode.publicState(),
  'license:get': (opts) => core.license.check(opts || {}),
  'shell:openSettings': (page) => { if (/^[a-z-]+$/i.test(page)) shell.openExternal(`ms-settings:${page}`); return true; },
  'benchmark:run': async (opts) => {
    const r = await core.benchmark.run({ ...(opts || {}), gpuRunner: runGpuBench, onProgress: (p) => send('benchmark:progress', p) });
    const hist = [r, ...(core.settings.get().benchHistory || [])].slice(0, 20);
    core.settings.set({ benchHistory: hist });
    const e = logbook.benchmark(r);
    return { ...r, logId: e.id };
  },

  'activity:list': () => activity.list(),
  'activity:clear': () => { activity.clear(); return true; },
  'activity:export': (text) => {
    const stamp = core.util.now().replace(/[: ]/g, '-');
    const file = path.join(core.util.dataDir(), `registro-${stamp}.txt`);
    fs.writeFileSync(file, `﻿${String(text || '')}`, 'utf8');
    shell.showItemInFolder(file);
    return file;
  },
  'app:theme': ({ zoom, color, symbol }) => {
    if (!win || win.isDestroyed()) return false;
    const z = Math.min(Math.max(Number(zoom) || 1, 0.8), 1.3);
    win.webContents.setZoomFactor(z);
    try { win.setTitleBarOverlay({ color: color || '#0c0a09', symbolColor: symbol || '#83776c', height: Math.round(40 * z) }); } catch {  }
    return true;
  },

  'shell:showItem': (p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); return true; },
  'shell:openPath': (p) => (p && fs.existsSync(p) ? shell.openPath(p) : ''),
  'shell:openExternal': (url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return true; },
  'shell:openRegedit': async (keyPath) => {
    const reg = require('./core/registry');
    const full = `Computador\\${keyPath.replace(/^HKLM/, 'HKEY_LOCAL_MACHINE').replace(/^HKCU/, 'HKEY_CURRENT_USER')}`;
    reg.write('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit', 'LastKey', reg.REG_SZ, lang() === 'pt' ? full : full.replace(/^Computador/, 'Computer'));
    spawn(path.join(core.util.SYSTEM_ROOT, 'regedit.exe'), ['-m'], { detached: true, stdio: 'ignore' }).unref();
    return true;
  },
};

for (const [channel, fn] of Object.entries(handlers)) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  });
}

app.on('second-instance', () => createWindow());

app.whenReady().then(async () => {
  if (!gotLock) return;
  Menu.setApplicationMenu(null);
  await gameMode.recover().catch(() => {});
  monitor.start(1000);
  createTray();
  if (!process.argv.includes('--tray')) createWindow();
});

app.on('window-all-closed', () => {
  if (quitting || !core.settings.get().trayOnClose) {
    quitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  monitor.stop();
  if (gameMode.active) gameMode.leave().catch(() => {});
});

module.exports = { handlers, monitor };
