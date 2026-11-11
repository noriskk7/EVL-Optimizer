'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { koffi } = require('./win32');

const VERSION = 2;

const REF = {
  cpu1: [5400, 26000],
  cpuN: [29500, 600000],
  gpu: [100, 40000],
  ram: [6, 60],
  read: [80, 7000],
  write: [60, 6000],
};
const WEIGHTS = { cpu1: 0.22, cpuN: 0.23, gpu: 0.25, ram: 0.12, disk: 0.18 };

const TIERS = [
  [85, 'top'],
  [70, 'great'],
  [50, 'good'],
  [30, 'mid'],
  [0, 'basic'],
];

const logScore = (v, [lo, hi]) => (v > 0 ? Math.round(Math.max(0, Math.min(100, (Math.log(v / lo) / Math.log(hi / lo)) * 100))) : 0);

const CPU_WORKER = `
const { parentPort, workerData } = require('worker_threads');
function unit(seed) {
  let s = seed | 0;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const cr = x / 12 - 1.5, ci = y / 12 - 1;
    let zr = 0, zi = 0, i = 0;
    for (; i < 64 && zr * zr + zi * zi < 4; i++) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; }
    s += i;
  }
  let h = 2166136261 ^ s;
  for (let i = 0; i < 6000; i++) { h ^= i; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  const a = new Float64Array(512);
  for (let i = 0; i < 512; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507); a[i] = (h >>> 0) / 4294967296; }
  a.sort();
  const o = JSON.stringify({ v: [s, h, a[7]], t: 'evl' + (h & 1023) });
  return s + JSON.parse(o).v.length + o.length;
}
const start = Date.now();
const until = start + workerData.ms;
let n = 0, guard = 0, secStart = start, secN = 0;
while (Date.now() < until) {
  guard += unit(n);
  n++; secN++;
  const now = Date.now();
  if (now - secStart >= 1000) {
    parentPort.postMessage({ tick: (secN * 1000) / (now - secStart) });
    secStart = now; secN = 0;
  }
}
parentPort.postMessage({ rate: n / ((Date.now() - start) / 1000), guard });
`;

function cpuRun(threads, ms, onTick = () => {}) {
  return new Promise((resolve) => {
    const rates = [];
    const ticks = [];
    let pending = threads;
    for (let w = 0; w < threads; w++) {
      const worker = new Worker(CPU_WORKER, { eval: true, workerData: { ms } });
      let count = 0;
      worker.on('message', (m) => {
        if (m.tick !== undefined) {
          ticks[count] = (ticks[count] || 0) + m.tick;
          count++;
          if (w === 0) setTimeout(() => onTick(count, ticks[count - 1]), 50);
        } else {
          rates.push(m.rate);
          worker.terminate();
          if (--pending === 0) resolve({ rate: rates.reduce((a, b) => a + b, 0), per: ticks.filter((v) => Number.isFinite(v)) });
        }
      });
      worker.on('error', () => { if (--pending === 0) resolve({ rate: rates.reduce((a, b) => a + b, 0), per: ticks }); });
    }
  });
}

function ramRun() {
  const size = 256 * 1048576;
  const a = Buffer.alloc(size, 1);
  const b = Buffer.allocUnsafe(size);
  a.copy(b);
  const rounds = 6;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) a.copy(b);
  const s = Number(process.hrtime.bigint() - t0) / 1e9;
  return (size * rounds * 2) / s / 1073741824;
}

const kernel32 = koffi.load('kernel32.dll');
const CreateFileW = kernel32.func('uintptr_t CreateFileW(str16 name, uint32 access, uint32 share, void *sec, uint32 disp, uint32 flags, uintptr_t tmpl)');
const ReadFile = kernel32.func('int ReadFile(uintptr_t h, void *buf, uint32 len, _Out_ uint32 *read, void *ov)');
const CloseHandle = kernel32.func('int CloseHandle(uintptr_t h)');
const VirtualAlloc = kernel32.func('void *VirtualAlloc(void *addr, size_t size, uint32 type, uint32 protect)');
const VirtualFree = kernel32.func('int VirtualFree(void *addr, size_t size, uint32 type)');

function diskRun(dir) {
  const file = path.join(dir, `evl-bench-${process.pid}.tmp`);
  const chunk = Buffer.alloc(4 * 1048576, 0xa5);
  const total = 512 * 1048576;
  let write = 0;
  let read = 0;
  try {
    const fd = fs.openSync(file, 'w');
    const t0 = process.hrtime.bigint();
    for (let done = 0; done < total; done += chunk.length) fs.writeSync(fd, chunk);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    write = total / (Number(process.hrtime.bigint() - t0) / 1e9) / 1048576;
    const h = CreateFileW(file, 0x80000000, 1, null, 3, 0x20000000 | 0x08000000, 0);
    if (h !== 0xffffffffffffffffn && h !== 0) {
      const mem = VirtualAlloc(null, chunk.length, 0x3000, 0x04);
      const got = [0];
      const t1 = process.hrtime.bigint();
      let bytes = 0;
      while (ReadFile(h, mem, chunk.length, got, null) && got[0] > 0) bytes += got[0];
      read = bytes / (Number(process.hrtime.bigint() - t1) / 1e9) / 1048576;
      VirtualFree(mem, 0, 0x8000);
      CloseHandle(h);
    }
  } catch {  }
  try { fs.unlinkSync(file); } catch {  }
  return { write, read };
}

function stability(per) {
  const list = (per || []).filter((v) => Number.isFinite(v) && v > 0);
  if (list.length < 6) return null;
  const peak = Math.max(...list.slice(0, 5));
  const tail = list.slice(-5);
  const sustained = tail.reduce((a, b) => a + b, 0) / tail.length;
  return { peak, sustained, min: Math.min(...list), ratio: Math.min(sustained / peak, 1), per: list };
}

function grade(r) {
  const scores = {
    cpu1: logScore(r.cpuSingle, REF.cpu1),
    cpuN: logScore(r.cpuMulti, REF.cpuN),
    gpu: r.gpu && r.gpu.ok && !r.gpu.software ? logScore(r.gpu.gflops, REF.gpu) : null,
    ram: logScore(r.ram, REF.ram),
    disk: Math.round((logScore(r.diskRead, REF.read) + logScore(r.diskWrite, REF.write)) / 2),
  };
  let sum = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (scores[k] === null) continue;
    sum += scores[k] * w;
    weight += w;
  }
  const overall = Math.round(sum / weight);
  const tier = TIERS.find(([min]) => overall >= min)[1];
  const parts = Object.entries(scores).filter(([, v]) => v !== null).sort((a, b) => a[1] - b[1]);
  const bottleneck = parts.length && parts[0][1] < overall - 12 ? parts[0][0] : null;
  return { scores, overall, tier, bottleneck };
}

async function run({ onProgress = () => {}, gpuRunner = null, stress = true } = {}) {
  const threads = Math.max(os.cpus().length, 1);
  const r = { version: VERSION, at: Date.now(), threads, cpuName: os.cpus()[0] ? os.cpus()[0].model.trim() : '' };

  onProgress({ phase: 'cpu1', step: 1 });
  r.cpuSingle = (await cpuRun(1, 3000)).rate;
  onProgress({ phase: 'cpuN', step: 2 });
  r.cpuMulti = (await cpuRun(threads, 3000)).rate;
  onProgress({ phase: 'ram', step: 3 });
  await new Promise((res) => setImmediate(res));
  r.ram = ramRun();
  onProgress({ phase: 'disk', step: 4 });
  await new Promise((res) => setImmediate(res));
  const disk = diskRun(os.tmpdir());
  r.diskRead = disk.read;
  r.diskWrite = disk.write;
  onProgress({ phase: 'gpu', step: 5 });
  r.gpu = gpuRunner ? await gpuRunner(6) : { ok: false, reason: 'none' };

  if (stress) {
    const secs = 20;
    onProgress({ phase: 'stress', step: 6, second: 0, total: secs });
    const live = { cpu: [], gpu: [] };
    const [cpu, gpu] = await Promise.all([
      cpuRun(threads, secs * 1000, (second, value) => {
        live.cpu[second - 1] = value;
        onProgress({ phase: 'stress', step: 6, second, total: secs, cpu: value, gpu: live.gpu[live.gpu.length - 1] });
      }),
      gpuRunner ? gpuRunner(secs, (v) => { live.gpu.push(v); }) : Promise.resolve({ ok: false }),
    ]);
    r.stress = {
      seconds: secs,
      cpu: stability(cpu.per),
      gpu: gpu && gpu.ok && !gpu.software ? stability(gpu.per) : null,
    };
  }

  Object.assign(r, grade(r));
  r.score = r.overall;
  return r;
}

module.exports = { run, grade, VERSION, REF };
