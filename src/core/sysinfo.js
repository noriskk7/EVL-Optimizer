'use strict';

const os = require('os');
const { koffi, fn, isElevated, enablePrivilege } = require('./win32');

const SystemProcessInformation = 5;
const SystemProcessorPerformanceInformation = 8;
const SystemMemoryListInformation = 80;
const STATUS_INFO_LENGTH_MISMATCH = -1073741820;
const PAGE = 4096;

let procBuffer = Buffer.alloc(1 << 20);

function query(cls, initial) {
  let buf = initial;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ret = [0];
    const status = fn.NtQuerySystemInformation(cls, buf, buf.length, ret);
    if (status === STATUS_INFO_LENGTH_MISMATCH) {
      buf = Buffer.alloc(Math.max(ret[0] + 65536, buf.length * 2));
      continue;
    }
    return status >= 0 ? buf : null;
  }
  return null;
}

function processes() {
  const buf = query(SystemProcessInformation, procBuffer);
  if (!buf) return [];
  procBuffer = buf;
  const base = BigInt(koffi.address(buf));
  const list = [];
  let offset = 0;
  for (;;) {
    const next = buf.readUInt32LE(offset);
    const pid = Number(buf.readBigUInt64LE(offset + 80));
    const nameLen = buf.readUInt16LE(offset + 56);
    const namePtr = buf.readBigUInt64LE(offset + 64);
    let name = pid === 0 ? 'System Idle Process' : '';
    if (nameLen && namePtr) {
      const start = Number(namePtr - base);
      if (start >= 0 && start + nameLen <= buf.length) name = buf.toString('utf16le', start, start + nameLen);
    }
    list.push({
      pid,
      ppid: Number(buf.readBigUInt64LE(offset + 88)),
      name,
      threads: buf.readUInt32LE(offset + 4),
      privateWs: Number(buf.readBigInt64LE(offset + 8)),
      createTime: buf.readBigInt64LE(offset + 32).toString(),
      cpuTime: Number(buf.readBigInt64LE(offset + 40)) + Number(buf.readBigInt64LE(offset + 48)),
      handles: buf.readUInt32LE(offset + 96),
      session: buf.readUInt32LE(offset + 100),
      workingSet: Number(buf.readBigUInt64LE(offset + 144)),
      privateBytes: Number(buf.readBigUInt64LE(offset + 184)),
    });
    if (!next) break;
    offset += next;
  }
  return list;
}

const cpuCount = os.cpus().length;
let cpuBuffer = Buffer.alloc(48 * Math.max(cpuCount, 1));

function processorTimes() {
  const buf = query(SystemProcessorPerformanceInformation, cpuBuffer);
  if (!buf) return [];
  cpuBuffer = buf;
  const cores = [];
  for (let i = 0; i < cpuCount && (i + 1) * 48 <= buf.length; i++) {
    const o = i * 48;
    const idle = Number(buf.readBigInt64LE(o));
    const kernel = Number(buf.readBigInt64LE(o + 8));
    const user = Number(buf.readBigInt64LE(o + 16));
    cores.push({ idle, total: kernel + user });
  }
  return cores;
}

function memoryLists() {
  if (!isElevated() || !enablePrivilege('SeProfileSingleProcessPrivilege')) return null;
  const buf = Buffer.alloc(176);
  const ret = [0];
  if (fn.NtQuerySystemInformation(SystemMemoryListInformation, buf, buf.length, ret) < 0) return null;
  const at = (i) => Number(buf.readBigUInt64LE(i * 8)) * PAGE;
  const standbyByPriority = [];
  for (let p = 0; p < 8; p++) standbyByPriority.push(at(5 + p));
  return {
    zero: at(0),
    free: at(1),
    modified: at(2),
    modifiedNoWrite: at(3),
    standby: standbyByPriority.reduce((a, b) => a + b, 0),
    standbyLow: standbyByPriority[0] + standbyByPriority[1],
    standbyByPriority,
  };
}

const MemoryCommand = {
  FlushModifiedList: 3,
  PurgeStandbyList: 4,
  PurgeLowPriorityStandbyList: 5,
};

function memoryCommand(command) {
  if (!isElevated() || !enablePrivilege('SeProfileSingleProcessPrivilege')) return { ok: false, status: 'admin' };
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(command);
  const status = fn.NtSetSystemInformation(SystemMemoryListInformation, buf, 4);
  return { ok: status >= 0, status };
}

function combineMemory() {
  if (!isElevated() || !enablePrivilege('SeProfileSingleProcessPrivilege')) return { ok: false, pages: 0 };
  const buf = Buffer.alloc(24);
  const status = fn.NtSetSystemInformation(130, buf, 24);
  return { ok: status >= 0, pages: status >= 0 ? Number(buf.readBigUInt64LE(8)) : 0, status };
}

function trimSystemFileCache() {
  if (!isElevated() || !enablePrivilege('SeIncreaseQuotaPrivilege')) return false;
  const all = 0xffffffffffffffffn;
  return !!fn.SetSystemFileCacheSize(all, all, 0);
}

module.exports = {
  PAGE,
  cpuCount,
  processes,
  processorTimes,
  memoryLists,
  MemoryCommand,
  memoryCommand,
  combineMemory,
  trimSystemFileCache,
};
