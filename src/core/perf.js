'use strict';

const { koffi, fn } = require('./win32');
const reg = require('./registry');

const PDH_FMT_DOUBLE = 0x200 | 0x8000;
const PDH_MORE_DATA = 0x800007d2;

const COUNTERS = {
  gpu: '\\GPU Engine(*)\\Utilization Percentage',
  vram: '\\GPU Adapter Memory(*)\\Dedicated Usage',
  diskRead: '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec',
  diskWrite: '\\PhysicalDisk(_Total)\\Disk Write Bytes/sec',
  diskIdle: '\\PhysicalDisk(_Total)\\% Idle Time',
  netIn: '\\Network Interface(*)\\Bytes Received/sec',
  netOut: '\\Network Interface(*)\\Bytes Sent/sec',
};

let query = null;
const handles = {};

function open() {
  if (query !== null) return query !== 0;
  const q = [0];
  if (fn.PdhOpenQueryW(null, 0, q) !== 0) { query = 0; return false; }
  query = q[0];
  for (const [key, path] of Object.entries(COUNTERS)) {
    const c = [0];
    if (fn.PdhAddEnglishCounterW(query, path, 0, c) === 0) handles[key] = c[0];
  }
  fn.PdhCollectQueryData(query);
  return true;
}

function readArray(counter) {
  const size = [0];
  const count = [0];
  let status = fn.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, size, count, null);
  if (status !== PDH_MORE_DATA || !size[0]) return [];
  const buf = Buffer.alloc(size[0]);
  status = fn.PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, size, count, buf);
  if (status !== 0) return [];
  const base = BigInt(koffi.address(buf));
  const items = [];
  for (let i = 0; i < count[0]; i++) {
    const o = i * 24;
    const ptr = buf.readBigUInt64LE(o);
    const cstatus = buf.readUInt32LE(o + 8);
    const value = buf.readDoubleLE(o + 16);
    let name = '';
    const start = Number(ptr - base);
    if (start >= 0 && start < buf.length) {
      let end = start;
      while (end + 1 < buf.length && buf.readUInt16LE(end) !== 0) end += 2;
      name = buf.toString('utf16le', start, end);
    }
    if (cstatus === 0 || cstatus === 1) items.push({ name, value });
  }
  return items;
}

const sum = (items) => items.reduce((a, b) => a + (Number.isFinite(b.value) ? b.value : 0), 0);

function sample() {
  if (!open()) return null;
  fn.PdhCollectQueryData(query);
  const out = { gpu: 0, vram: 0, diskRead: 0, diskWrite: 0, diskActive: 0, netIn: 0, netOut: 0, gpuByPid: new Map() };
  if (handles.gpu) {
    const engines = new Map();
    for (const { name, value } of readArray(handles.gpu)) {
      const m = /pid_(\d+)_luid_(\w+)_(\w+)_phys_(\d+)_eng_(\d+)_engtype_(\w+)/i.exec(name);
      if (!m) continue;
      const engine = `${m[2]}_${m[3]}_${m[4]}_${m[5]}`;
      engines.set(engine, (engines.get(engine) || 0) + value);
      if (/^3d$/i.test(m[6])) {
        const pid = Number(m[1]);
        out.gpuByPid.set(pid, (out.gpuByPid.get(pid) || 0) + value);
      }
    }
    for (const v of engines.values()) out.gpu = Math.max(out.gpu, v);
    out.gpu = Math.min(out.gpu, 100);
  }
  if (handles.vram) out.vram = sum(readArray(handles.vram));
  if (handles.diskRead) out.diskRead = sum(readArray(handles.diskRead));
  if (handles.diskWrite) out.diskWrite = sum(readArray(handles.diskWrite));
  if (handles.diskIdle) {
    const idle = readArray(handles.diskIdle);
    if (idle.length) out.diskActive = Math.max(0, Math.min(100, 100 - idle[0].value));
  }
  if (handles.netIn) out.netIn = sum(readArray(handles.netIn).filter((i) => !/isatap|loopback|teredo/i.test(i.name)));
  if (handles.netOut) out.netOut = sum(readArray(handles.netOut).filter((i) => !/isatap|loopback|teredo/i.test(i.name)));
  return out;
}

function gpuInfo() {
  const cls = 'SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}';
  let best = null;
  for (const sub of reg.subkeys('HKLM', cls)) {
    if (!/^\d{4}$/.test(sub)) continue;
    const v = reg.valueMap('HKLM', `${cls}\\${sub}`);
    const name = String(v.DriverDesc || '');
    if (!name || /remote display|basic display|basic render|virtual|indirect/i.test(name)) continue;
    let mem = Number(v['HardwareInformation.qwMemorySize'] || 0);
    if (!mem) {
      const m = v['HardwareInformation.MemorySize'];
      mem = Buffer.isBuffer(m) && m.length >= 4 ? m.readUInt32LE(0) : Number(m || 0);
    }
    if (!best || mem > best.vramTotal) best = { name, vramTotal: mem };
  }
  return best || { name: '', vramTotal: 0 };
}

module.exports = { sample, gpuInfo };
