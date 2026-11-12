'use strict';

const activity = require('./core/activity');

const R = activity.row;
const st = (ok) => (ok ? 'ok' : 'fail');

function memory(r) {
  const rows = [
    R('log.mem.inuse', { beforeBytes: r.before.inUse, afterBytes: r.after.inUse }, r.after.inUse <= r.before.inUse ? 'ok' : 'fail'),
    R('log.mem.available', { beforeBytes: r.before.available, afterBytes: r.after.available }),
    R('log.mem.compressed', { beforeBytes: r.before.compressed, afterBytes: r.after.compressed }),
    R('log.mem.commit', { beforeBytes: r.before.commit, afterBytes: r.after.commit }),
  ];
  if (r.before.lists && r.after.lists) {
    rows.push(R('log.mem.standby', { beforeBytes: r.before.lists.standby, afterBytes: r.after.lists.standby }));
    rows.push(R('log.mem.free', { beforeBytes: r.before.lists.free + r.before.lists.zero, afterBytes: r.after.lists.free + r.after.lists.zero }));
  }
  for (const s of r.steps) {
    if (s.id === 'trim') {
      rows.push(R('log.mem.trim', { n: s.count, freedBytes: s.bytes }, s.count ? 'ok' : 'skip'));
      for (const p of s.processes || []) rows.push(R('log.mem.proc', { name: p.name, pid: p.pid, beforeBytes: p.before, afterBytes: p.after }, 'ok'));
      if (s.skippedActive) rows.push(R('log.mem.skipActive', { n: s.skippedActive }, 'skip'));
      if (s.skippedProtected) rows.push(R('log.mem.skipProtected', { n: s.skippedProtected }, 'skip'));
      if (s.denied) rows.push(R('log.mem.denied', { n: s.denied }, 'skip'));
    } else if (s.id === 'admin') {
      rows.push(R('log.mem.admin', {}, 'skip'));
    } else {
      rows.push(R(`log.mem.step.${s.id}`, { freedBytes: s.bytes || 0 }, st(s.ok)));
    }
  }
  return activity.add({
    kind: 'memory',
    ok: true,
    verified: r.after.inUse < r.before.inUse,
    summary: { key: `log.mem.sum.${r.profile}`, vars: { freedBytes: r.freed, s: r.settleMs / 1000 } },
    rows,
  });
}

function clean(result, after) {
  const left = new Map((after && after.entries ? after.entries : []).map((e) => [e.id, e]));
  const rows = [];
  for (const [id, p] of Object.entries(result.perAction || {})) {
    const l = left.get(id);
    const leftBytes = l ? l.bytes : 0;
    const status = p.bytes > 0 || leftBytes === 0 ? 'ok' : 'skip';
    rows.push(R('log.clean.cat', { catKey: `cat.${id}`, freedBytes: p.bytes, files: p.files, skipped: p.skipped, leftBytes }, status));
  }
  for (const n of result.notes || []) rows.push(R(`log.clean.note.${n.note}`, { catKey: `cat.${n.id}`, apps: n.detail || '' }, 'skip'));
  return activity.add({
    kind: 'clean',
    ok: !result.cancelled,
    verified: !!after,
    summary: { key: 'log.clean.sum', vars: { freedBytes: result.bytes, files: result.files, skipped: result.skipped } },
    rows,
  });
}

function tweak(id, applied, r) {
  const rows = (r.changes || []).map((c) => R('log.tweak.value', { target: c.target, before: c.before, after: c.after }, st(c.ok)));
  if (r.reason === 'admin') rows.push(R('log.adminNeeded', {}, 'fail'));
  return activity.add({
    kind: 'tweak',
    ok: !!r.ok,
    verified: rows.length ? rows.every((x) => x.status === 'ok') : false,
    summary: { key: applied ? 'log.tweak.on' : 'log.tweak.off', vars: { nameKey: `tweak.${id}` } },
    rows,
  });
}

function debloat(report) {
  const rows = [];
  const remaining = new Set(report.remaining || []);
  for (const name of report.removed || []) rows.push(R('log.deb.removed', { name }, st(!remaining.has(name))));
  for (const f of report.failed || []) rows.push(R('log.deb.failed', { name: f.name, error: String(f.error || '').slice(0, 160) }, 'fail'));
  for (const name of remaining) if (!(report.removed || []).includes(name)) rows.push(R('log.deb.still', { name }, 'fail'));
  for (const t of report.tweaks || []) {
    rows.push(R('log.deb.tweak', { nameKey: `tweak.${t.id}` }, t.reason === 'admin' ? 'skip' : st(t.ok)));
    for (const c of t.changes || []) rows.push(R('log.tweak.value', { target: c.target, before: c.before, after: c.after }, st(c.ok)));
  }
  for (const s of report.specials || []) {
    if (s.reason === 'admin') rows.push(R('log.adminNeeded', { itemKey: `deb.item.${s.id}` }, 'skip'));
    for (const step of s.steps || []) rows.push(R(step.key, step.vars, st(step.ok)));
  }
  for (const step of report.cleanup || []) rows.push(R(step.key, step.vars, st(step.ok)));
  const tweaksOk = (report.tweaks || []).filter((t) => t.ok).length;
  return activity.add({
    kind: 'debloat',
    ok: true,
    verified: remaining.size === 0 && rows.every((x) => x.status !== 'fail'),
    summary: { key: 'log.deb.sum', vars: { apps: (report.removed || []).length, tweaks: tweaksOk } },
    rows,
  });
}

function uninstallRun(program, cmd, r) {
  const rows = [];
  if (cmd) rows.push(R('log.un.command', { cmd }));
  if (r.exitCode !== undefined && r.exitCode !== null) rows.push(R('log.un.exit', { code: r.exitCode }, r.exitCode === 0 ? 'ok' : 'info'));
  if (r.aborted) rows.push(R('log.un.skipped', {}, 'skip'));
  if (r.reason) rows.push(R(`log.un.fail.${r.reason}`, { detail: r.detail || '' }, 'fail'));
  if (r.removed !== undefined) rows.push(R('log.un.gone', {}, st(r.removed)));
  return activity.add({
    kind: 'uninstall',
    ok: !!r.ok,
    verified: !!r.removed,
    summary: { key: 'log.un.runSum', vars: { name: program.name } },
    rows,
  });
}

function uninstallDelete(program, r) {
  const rows = [];
  for (const c of r.checks || []) {
    const label = c.kind === 'regkey' ? `${c.root}\\${c.path}` : c.kind === 'regvalue' ? `${c.root}\\${c.path} › ${c.name}` : c.kind === 'service' || c.kind === 'task' ? c.name : c.path;
    rows.push(R(`log.un.item.${c.kind}`, { path: label, sizeBytes: c.size, detail: c.detail }, st(c.gone)));
  }
  if (r.backup) rows.push(R('log.un.backup', { path: r.backup }));
  const gone = (r.checks || []).filter((c) => c.gone).length;
  return activity.add({
    kind: 'uninstall',
    ok: !(r.failures || []).length,
    verified: gone === (r.checks || []).length,
    summary: { key: 'log.un.delSum', vars: { name: program.name, n: gone, total: (r.checks || []).length, freedBytes: r.bytes } },
    rows,
  });
}

function store(r, remaining) {
  const still = new Set(remaining || []);
  const rows = [];
  for (const name of r.removed || []) rows.push(R('log.store.removed', { name }, st(!still.has(name))));
  for (const f of r.failed || []) rows.push(R('log.deb.failed', { name: f.name, error: String(f.error || '').slice(0, 160) }, 'fail'));
  return activity.add({
    kind: 'store',
    ok: !(r.failed || []).length,
    verified: still.size === 0,
    summary: { key: 'log.store.sum', vars: { n: (r.removed || []).length } },
    rows,
  });
}

function benchmark(r) {
  const s = r.scores || {};
  const rows = [
    R('log.bm.cpu1', { value: Math.round(r.cpuSingle), score: s.cpu1 }),
    R('log.bm.cpuN', { value: Math.round(r.cpuMulti), threads: r.threads, score: s.cpuN }),
    r.gpu && r.gpu.ok && !r.gpu.software
      ? R('log.bm.gpu', { value: Math.round(r.gpu.gflops), renderer: r.gpu.renderer, score: s.gpu })
      : R('log.bm.gpuNone', { renderer: (r.gpu && r.gpu.renderer) || '', reason: (r.gpu && r.gpu.reason) || '' }, 'skip'),
    R('log.bm.ram', { value: Math.round(r.ram * 10) / 10, score: s.ram }),
    R('log.bm.disk', { read: Math.round(r.diskRead), write: Math.round(r.diskWrite), score: s.disk }),
  ];
  if (r.stress) {
    if (r.stress.cpu) rows.push(R('log.bm.stressCpu', { pct: Math.round(r.stress.cpu.ratio * 100) }, r.stress.cpu.ratio >= 0.9 ? 'ok' : 'fail'));
    if (r.stress.gpu) rows.push(R('log.bm.stressGpu', { pct: Math.round(r.stress.gpu.ratio * 100) }, r.stress.gpu.ratio >= 0.9 ? 'ok' : 'fail'));
  }
  if (r.bottleneck) rows.push(R('log.bm.bottleneck', { partKey: `bm.part.${r.bottleneck}` }, 'info'));
  return activity.add({ kind: 'benchmark', ok: true, verified: true, summary: { key: 'log.bm.sum', vars: { score: r.overall, tierKey: `bm.tier.${r.tier}` } }, rows });
}

const simple = (kind, key, vars, ok, rows = [], verified = ok) => activity.add({ kind, ok, verified, summary: { key, vars }, rows });

module.exports = { memory, clean, tweak, debloat, uninstallRun, uninstallDelete, store, benchmark, simple, R };
