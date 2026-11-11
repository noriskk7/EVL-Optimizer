'use strict';

const os = require('os');
const sys = require('./sysinfo');
const perf = require('./perf');
const { memoryStatus, performanceInfo, systemTimes, foregroundProcessId, diskSpace } = require('./win32');
const { SYSTEM_ROOT } = require('./util');

const HISTORY = 300;
const LONG_STEP = 60_000;
const LONG_HISTORY = 24 * 60;
const LEAK_STEP = 10_000;
const LEAK_WINDOW = 30 * 60_000;

class Monitor {
  constructor() {
    this.stats = new Map();
    this.history = { t: [], cpu: [], ram: [], gpu: [], disk: [], netIn: [], netOut: [] };
    this.long = { t: [], cpu: [], ram: [], gpu: [] };
    this.longAcc = null;
    this.prevCpu = null;
    this.prevCores = null;
    this.prevTick = 0;
    this.lastLeak = 0;
    this.latest = null;
    this.procs = [];
    this.listeners = new Set();
    this.timer = null;
  }

  start(interval = 1000) {
    if (this.timer) return;
    this.interval = interval;
    this.tick();
    this.timer = setInterval(() => this.tick(), interval);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  setInterval(ms) {
    if (!this.timer || this.interval === ms) { this.interval = ms; return; }
    clearInterval(this.timer);
    this.interval = ms;
    this.timer = setInterval(() => this.tick(), ms);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  tick() {
    const nowMs = Date.now();
    const dt = this.prevTick ? nowMs - this.prevTick : 1000;
    this.prevTick = nowMs;

    let cpu = 0;
    const st = systemTimes();
    if (st && this.prevCpu) {
      const idle = st.idle - this.prevCpu.idle;
      const total = (st.kernel - this.prevCpu.kernel) + (st.user - this.prevCpu.user);
      if (total > 0) cpu = Math.min(Math.max(1 - idle / total, 0), 1);
    }
    if (st) this.prevCpu = st;

    const coresNow = sys.processorTimes();
    const cores = [];
    if (this.prevCores && this.prevCores.length === coresNow.length) {
      for (let i = 0; i < coresNow.length; i++) {
        const total = coresNow[i].total - this.prevCores[i].total;
        const idle = coresNow[i].idle - this.prevCores[i].idle;
        cores.push(total > 0 ? Math.min(Math.max(1 - idle / total, 0), 1) : 0);
      }
    }
    this.prevCores = coresNow;

    const mem = memoryStatus() || { total: 0, available: 0, load: 0, pageTotal: 0, pageAvailable: 0 };
    const pi = performanceInfo() || {};

    const procs = sys.processes();
    const fg = foregroundProcessId();
    const seen = new Set();
    let compressed = 0;
    const ncpu = sys.cpuCount || os.cpus().length || 1;
    for (const p of procs) {
      const key = `${p.pid}:${p.createTime}`;
      seen.add(key);
      let s = this.stats.get(key);
      if (!s) {
        s = { name: p.name, pid: p.pid, cpu: 0, cpuNow: 0, lastCpuTime: p.cpuTime, lastForeground: 0, priv: [], firstSeen: nowMs };
        this.stats.set(key, s);
      } else {
        const core = Math.max(p.cpuTime - s.lastCpuTime, 0) / (dt * 10_000);
        s.cpuNow = core / ncpu;
        s.cpu = s.cpu * 0.7 + core * 0.3;
        s.lastCpuTime = p.cpuTime;
      }
      if (p.pid === fg) s.lastForeground = nowMs;
      p.cpu = s.cpuNow;
      if (p.name === 'Memory Compression') compressed = p.workingSet;
    }
    for (const key of this.stats.keys()) if (!seen.has(key)) this.stats.delete(key);
    const fgKeys = new Set(procs.filter((p) => p.pid === fg).map((p) => p.pid));
    if (fgKeys.size) {
      for (const p of procs) {
        if (fgKeys.has(p.ppid)) {
          const s = this.stats.get(`${p.pid}:${p.createTime}`);
          if (s) s.lastForeground = nowMs;
        }
      }
    }
    this.procs = procs;

    if (nowMs - this.lastLeak >= LEAK_STEP) {
      this.lastLeak = nowMs;
      for (const p of procs) {
        const s = this.stats.get(`${p.pid}:${p.createTime}`);
        if (!s) continue;
        s.priv.push([nowMs, p.privateBytes]);
        while (s.priv.length && nowMs - s.priv[0][0] > LEAK_WINDOW) s.priv.shift();
      }
    }

    const pf = perf.sample() || { gpu: 0, vram: 0, diskRead: 0, diskWrite: 0, diskActive: 0, netIn: 0, netOut: 0, gpuByPid: new Map() };
    for (const p of procs) p.gpu = pf.gpuByPid.get(p.pid) || 0;

    const sysDrive = diskSpace(SYSTEM_ROOT.slice(0, 2) + '\\') || { total: 0, free: 0 };

    const snap = {
      t: nowMs,
      cpu,
      cores,
      ram: {
        total: mem.total,
        available: mem.available,
        used: mem.total - mem.available,
        load: mem.total ? (mem.total - mem.available) / mem.total : 0,
        commit: pi.commitTotal || 0,
        commitLimit: pi.commitLimit || 0,
        cached: pi.systemCache || 0,
        compressed,
        pagedPool: pi.kernelPaged || 0,
        nonPagedPool: pi.kernelNonpaged || 0,
      },
      gpu: pf.gpu / 100,
      vram: pf.vram,
      disk: { read: pf.diskRead, write: pf.diskWrite, active: pf.diskActive / 100, total: sysDrive.total, free: sysDrive.free },
      net: { in: pf.netIn, out: pf.netOut },
      processes: procs.length,
      threads: pi.threads || 0,
      handles: pi.handles || 0,
      uptime: Math.floor(os.uptime()),
    };
    this.latest = snap;

    const h = this.history;
    h.t.push(nowMs); h.cpu.push(cpu); h.ram.push(snap.ram.load); h.gpu.push(snap.gpu);
    h.disk.push(snap.disk.active); h.netIn.push(pf.netIn); h.netOut.push(pf.netOut);
    for (const k of Object.keys(h)) if (h[k].length > HISTORY) h[k].shift();

    const acc = this.longAcc || (this.longAcc = { start: nowMs, n: 0, cpu: 0, ram: 0, gpu: 0 });
    acc.n++; acc.cpu += cpu; acc.ram += snap.ram.load; acc.gpu += snap.gpu;
    if (nowMs - acc.start >= LONG_STEP) {
      const l = this.long;
      l.t.push(nowMs); l.cpu.push(acc.cpu / acc.n); l.ram.push(acc.ram / acc.n); l.gpu.push(acc.gpu / acc.n);
      for (const k of Object.keys(l)) if (l[k].length > LONG_HISTORY) l[k].shift();
      this.longAcc = null;
    }

    for (const fn of this.listeners) {
      try { fn(snap); } catch {  }
    }
  }

  leaks() {
    const out = [];
    for (const s of this.stats.values()) {
      const pts = s.priv;
      if (pts.length < 30) continue;
      const first = pts[0][1];
      const last = pts[pts.length - 1][1];
      let min = Infinity;
      for (const [, v] of pts) min = Math.min(min, v);
      const growth = last - min;
      if (growth < 300 * 1048576 || last < min * 1.5) continue;
      let ups = 0;
      for (let i = 1; i < pts.length; i++) if (pts[i][1] >= pts[i - 1][1]) ups++;
      if (ups / (pts.length - 1) < 0.7) continue;
      out.push({
        pid: s.pid,
        name: s.name,
        growth,
        from: first,
        now: last,
        minutes: Math.round((pts[pts.length - 1][0] - pts[0][0]) / 60_000),
      });
    }
    return out.sort((a, b) => b.growth - a.growth);
  }
}

module.exports = { Monitor };
