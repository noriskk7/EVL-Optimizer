'use strict';

const fs = require('fs');
const reg = require('./registry');
const tweaks = require('./tweaks');
const { J, env, runConsole, powershell, oneLine } = require('./util');
const { isElevated } = require('./win32');

const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';
const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*\(([^)]*)\)\s*(\*)?/i;

async function powerPlans() {
  const r = await runConsole('powercfg /list', { timeout: 15_000 });
  const plans = [];
  for (const line of r.out.split(/\r?\n/)) {
    const m = GUID.exec(line);
    if (m) plans.push({ guid: m[1].toLowerCase(), name: m[2].trim(), active: !!m[3] });
  }
  return plans;
}

async function setPowerPlan(guid) {
  const plans = await powerPlans();
  const previous = plans.find((p) => p.active);
  const target = plans.find((p) => p.guid === guid.toLowerCase());
  const r = await runConsole(`powercfg /setactive ${guid}`, { timeout: 15_000 });
  const ok = r.code === 0;
  if (ok && previous && previous.guid !== guid.toLowerCase()) {
    const entries = tweaks.load();
    const existing = entries.find((e) => e.key === 'power_plan');
    if (existing) {
      if ((existing.data.guid || '').toLowerCase() === guid.toLowerCase()) tweaks.forget('power_plan');
    } else {
      tweaks.rememberSpecial('power_plan', 'power_plan', { guid: previous.guid, name: previous.name },
        [`Perfil de energia: ${target ? target.name : guid}`, `Power plan: ${target ? target.name : guid}`],
        [`perfil de energia anterior: ${previous.name}`, `previous power plan: ${previous.name}`]);
    }
  }
  return { ok, detail: ok ? '' : oneLine(r.out, 160) };
}

async function ensurePlan(base) {
  const plans = await powerPlans();
  const exact = plans.find((p) => p.guid === base);
  if (exact) return exact.guid;
  const r = await runConsole(`powercfg -duplicatescheme ${base}`, { timeout: 15_000 });
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(r.out);
  return m ? m[1].toLowerCase() : null;
}

async function network(action) {
  switch (action) {
    case 'flush-dns': {
      const r = await runConsole('ipconfig /flushdns', { timeout: 20_000 });
      return { ok: r.code === 0, detail: r.code === 0 ? '' : oneLine(r.out), out: oneLine(r.out, 400) };
    }
    case 'renew-ip': {
      await runConsole('ipconfig /release', { timeout: 30_000 });
      const r = await runConsole('ipconfig /renew', { timeout: 60_000 });
      return { ok: r.code === 0, detail: r.code === 0 ? '' : oneLine(r.out), out: oneLine(r.out, 400) };
    }
    case 'reset-winsock': {
      if (!isElevated()) return { ok: false, reason: 'admin' };
      const r = await runConsole('netsh winsock reset', { timeout: 30_000 });
      return { ok: r.code === 0, restart: true, detail: r.code === 0 ? '' : oneLine(r.out), out: oneLine(r.out, 400) };
    }
    case 'reset-tcp': {
      if (!isElevated()) return { ok: false, reason: 'admin' };
      const r = await runConsole('netsh int ip reset', { timeout: 30_000 });
      return { ok: r.code === 0, restart: true, detail: r.code === 0 ? '' : oneLine(r.out), out: oneLine(r.out, 400) };
    }
    default:
      return { ok: false, reason: 'unknown' };
  }
}

const CREATE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore'
$name = 'SystemRestorePointCreationFrequency'
$old = (Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue).$name
Enable-ComputerRestore -Drive ($env:SystemDrive + '\\')
Set-ItemProperty -Path $key -Name $name -Value 0 -Type DWord
try {
    Checkpoint-Computer -Description 'EVL Optimizer' -RestorePointType MODIFY_SETTINGS
} finally {
    if ($null -eq $old) { Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -Path $key -Name $name -Value $old -Type DWord }
}
`;

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$points = @(Get-ComputerRestorePoint | ForEach-Object {
    [pscustomobject]@{
        sequence = [int]$_.SequenceNumber
        description = [string]$_.Description
        created = ([Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime)).ToString('yyyy-MM-dd HH:mm')
    }
})
ConvertTo-Json -InputObject $points -Compress
`;

async function createRestorePoint() {
  if (!isElevated()) return { ok: false, reason: 'admin' };
  const r = await powershell(CREATE_SCRIPT, { timeout: 300_000 });
  return { ok: r.code === 0, detail: r.code === 0 ? '' : oneLine(r.out) };
}

async function restorePoints() {
  if (!isElevated()) return { ok: false, reason: 'admin', points: [] };
  const r = await powershell(LIST_SCRIPT, { timeout: 60_000 });
  if (r.code !== 0) return { ok: false, detail: oneLine(r.out), points: [] };
  try {
    const raw = JSON.parse(r.out.trim() || '[]');
    const points = (Array.isArray(raw) ? raw : [raw]).filter((p) => p && p.sequence).sort((a, b) => b.sequence - a.sequence);
    return { ok: true, points };
  } catch {
    return { ok: false, detail: 'parse', points: [] };
  }
}

async function restoreTo(sequence) {
  if (!isElevated()) return { ok: false, reason: 'admin' };
  const r = await powershell(`$ErrorActionPreference='Stop'; Restore-Computer -RestorePoint ${Number(sequence) | 0} -Confirm:$false`, { timeout: 120_000 });
  return { ok: r.code === 0, detail: r.code === 0 ? '' : oneLine(r.out) };
}

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
const SOURCES = [
  { scope: 'HKCU', root: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', approved: 'Run', kind: 'registry' },
  { scope: 'HKLM', root: 'HKLM', key: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', approved: 'Run', kind: 'registry' },
  { scope: 'HKLM32', root: 'HKLM', key: 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', approved: 'Run32', kind: 'registry' },
];

function approvedState(root, approved, name) {
  const v = reg.read(root, `${APPROVED}\\${approved}`, name);
  if (!v || !Buffer.isBuffer(v.value) || !v.value.length) return true;
  return (v.value[0] & 0x01) === 0;
}

function exeFromCommand(command) {
  const text = String(command || '').trim();
  if (text.startsWith('"')) return text.slice(1, text.indexOf('"', 1) > 0 ? text.indexOf('"', 1) : undefined);
  const m = /^(.+?\.(exe|bat|cmd|com|lnk))\b/i.exec(text);
  return m ? m[1] : text.split(' ')[0];
}

function expandEnv(p) {
  return String(p || '').replace(/%([^%]+)%/g, (_, name) => env(name) || `%${name}%`);
}

function startupItems() {
  const elevated = isElevated();
  const items = [];
  for (const src of SOURCES) {
    for (const v of reg.values(src.root, src.key)) {
      if (!v.name || (v.type !== reg.REG_SZ && v.type !== reg.REG_EXPAND_SZ)) continue;
      const exe = expandEnv(exeFromCommand(v.value));
      items.push({
        id: `${src.scope}|${v.name}`,
        name: v.name,
        command: String(v.value),
        exe,
        scope: src.scope,
        enabled: approvedState(src.root, src.approved, v.name),
        canToggle: src.root === 'HKCU' || elevated,
        exists: !!exe && fs.existsSync(exe),
      });
    }
  }
  const folders = [
    { scope: 'UserFolder', root: 'HKCU', dir: J(env('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') },
    { scope: 'CommonFolder', root: 'HKLM', dir: J(env('ProgramData') || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') },
  ];
  for (const f of folders) {
    let names = [];
    try { names = fs.readdirSync(f.dir); } catch { continue; }
    for (const file of names) {
      if (file.toLowerCase() === 'desktop.ini') continue;
      const full = J(f.dir, file);
      items.push({
        id: `${f.scope}|${file}`,
        name: file.replace(/\.(lnk|url|exe|bat|cmd)$/i, ''),
        command: full,
        exe: full,
        scope: f.scope,
        enabled: approvedState(f.root, 'StartupFolder', file),
        canToggle: f.root === 'HKCU' || elevated,
        exists: true,
        file,
      });
    }
  }
  items.sort((a, b) => (a.enabled === b.enabled ? a.name.localeCompare(b.name) : a.enabled ? -1 : 1));
  return items;
}

function setStartupEnabled(id, enabled) {
  const [scope, ...rest] = String(id).split('|');
  const name = rest.join('|');
  const map = {
    HKCU: ['HKCU', 'Run'], HKLM: ['HKLM', 'Run'], HKLM32: ['HKLM', 'Run32'],
    UserFolder: ['HKCU', 'StartupFolder'], CommonFolder: ['HKLM', 'StartupFolder'],
  };
  const target = map[scope];
  if (!target) return { ok: false, reason: 'unknown' };
  const [root, approved] = target;
  if (root === 'HKLM' && !isElevated()) return { ok: false, reason: 'admin' };
  const blob = Buffer.alloc(12);
  blob[0] = enabled ? 0x02 : 0x03;
  if (!enabled) blob.writeBigUInt64LE(BigInt(Date.now() + 11644473600000) * 10000n, 4);
  const ok = tweaks.setValue(root, `${APPROVED}\\${approved}`, name, reg.REG_BINARY, blob,
    [`Inicialização: ${name}`, `Startup: ${name}`]);
  return { ok };
}

module.exports = {
  BALANCED, HIGH, ULTIMATE,
  powerPlans, setPowerPlan, ensurePlan,
  network,
  createRestorePoint, restorePoints, restoreTo,
  startupItems, setStartupEnabled, exeFromCommand, expandEnv,
};
