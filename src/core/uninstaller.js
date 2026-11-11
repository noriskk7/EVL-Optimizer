'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const reg = require('./registry');
const fsx = require('./fsx');
const sys = require('./sysinfo');
const { J, env, SYSTEM_ROOT, SYSTEM32, dataDir, run, now } = require('./util');
const { isElevated } = require('./win32');

const UNINSTALL_KEYS = [
  { root: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall', arch: 'x64' },
  { root: 'HKLM', path: 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall', arch: 'x86' },
  { root: 'HKCU', path: 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall', arch: 'user' },
];

const GUID_RE = /\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}/i;

const unquote = (s) => String(s || '').trim().replace(/^"(.*)"$/, '$1');

function iconPath(displayIcon) {
  let p = unquote(String(displayIcon || '').replace(/,\s*-?\d+\s*$/, ''));
  p = p.replace(/%([^%]+)%/g, (_, n) => env(n) || `%${n}%`);
  return /^[A-Za-z]:\\/.test(p) ? p : '';
}

function splitCommand(command) {
  const text = String(command || '').trim().replace(/%([^%]+)%/g, (_, n) => env(n) || `%${n}%`);
  if (!text) return null;
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end < 0) return { file: text.slice(1), args: '' };
    return { file: text.slice(1, end), args: text.slice(end + 1).trim() };
  }
  const parts = text.split(' ');
  for (let i = 1; i <= parts.length; i++) {
    const candidate = parts.slice(0, i).join(' ');
    if (/\.(exe|com|bat|cmd)$/i.test(candidate) && fsx.exists(candidate)) return { file: candidate, args: parts.slice(i).join(' ') };
  }
  return { file: parts[0], args: parts.slice(1).join(' ') };
}

function parseDate(v) {
  const s = String(v || '');
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = Date.parse(s);
  return Number.isNaN(d) ? '' : new Date(d).toISOString().slice(0, 10);
}

function guessLocation(values, uninstall) {
  const direct = unquote(values.InstallLocation || values['Inno Setup: App Path'] || '');
  if (direct && fsx.isDir(direct)) return direct.replace(/\\+$/, '');
  const icon = iconPath(values.DisplayIcon);
  if (icon && !/\\(system32|syswow64|installer|package cache)\\/i.test(icon)) {
    const dir = icon.slice(0, icon.lastIndexOf('\\'));
    if (fsx.isDir(dir) && !isRootLike(dir)) return dir;
  }
  if (uninstall && !/msiexec/i.test(uninstall.file) && !/rundll32/i.test(uninstall.file)) {
    const dir = uninstall.file.slice(0, uninstall.file.lastIndexOf('\\'));
    if (dir && fsx.isDir(dir) && !isRootLike(dir) && !/\\(package cache|installer|temp)\b/i.test(dir)) return dir;
  }
  return '';
}

function exeIn(location, name) {
  if (!location) return '';
  const exes = fsx.list(location).filter((e) => !e.dir && /\.exe$/i.test(e.name) && !/^(unins|uninst|setup|update)/i.test(e.name));
  if (!exes.length) return '';
  const want = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const best = exes.find((e) => want.includes(e.name.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, ''))) || exes.sort((a, b) => b.size - a.size)[0];
  return best.path;
}

function listPrograms() {
  const out = [];
  const seen = new Set();
  for (const src of UNINSTALL_KEYS) {
    for (const keyName of reg.subkeys(src.root, src.path)) {
      const keyPath = `${src.path}\\${keyName}`;
      const v = reg.valueMap(src.root, keyPath);
      const name = String(v.DisplayName || '').trim();
      if (!name) continue;
      if (Number(v.SystemComponent) === 1) continue;
      if (v.ParentKeyName || v.ParentDisplayName) continue;
      if (/^(update|hotfix|security update)$/i.test(String(v.ReleaseType || ''))) continue;
      if (/^(KB\d{6,}|Security Update for|Update for Microsoft)/i.test(name)) continue;
      const dedupe = `${name.toLowerCase()}|${String(v.DisplayVersion || '').toLowerCase()}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const uninstallString = String(v.UninstallString || '');
      const msi = Number(v.WindowsInstaller) === 1 || (/msiexec/i.test(uninstallString) && GUID_RE.test(keyName + uninstallString));
      const uninstall = splitCommand(uninstallString);
      const location = guessLocation(v, uninstall);
      out.push({
        id: `${src.root}|${keyPath}`,
        root: src.root,
        key: keyPath,
        keyName,
        arch: src.arch,
        name,
        version: String(v.DisplayVersion || ''),
        publisher: String(v.Publisher || '').trim(),
        installDate: parseDate(v.InstallDate),
        size: Number(v.EstimatedSize) > 0 ? Number(v.EstimatedSize) * 1024 : 0,
        icon: iconPath(v.DisplayIcon) || exeIn(location, name),
        location,
        uninstallString,
        quietUninstallString: String(v.QuietUninstallString || ''),
        msi,
        productCode: msi ? ((GUID_RE.exec(keyName) || GUID_RE.exec(uninstallString) || [''])[0]) : '',
        noRemove: Number(v.NoRemove) === 1,
        hasUninstaller: !!uninstallString,
        url: String(v.URLInfoAbout || v.HelpLink || ''),
      });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

async function folderSize(dir) {
  if (!dir || !fsx.isDir(dir) || isRootLike(dir)) return 0;
  const totals = { bytes: 0, files: 0 };
  for (const e of fsx.list(dir)) await fsx.measure(e, totals, () => false);
  return totals.bytes;
}

function quietArgs(program, cmd) {
  if (program.quietUninstallString) return splitCommand(program.quietUninstallString);
  if (/unins\d{3}\.exe$/i.test(cmd.file)) return { file: cmd.file, args: `${cmd.args} /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`.trim() };
  return null;
}

function commandFor(program, quiet) {
  if (program.msi && program.productCode) {
    return { file: J(SYSTEM32, 'msiexec.exe'), args: `/x ${program.productCode}${quiet ? ' /qb- /norestart' : ''}` };
  }
  const cmd = splitCommand(program.uninstallString);
  if (!cmd) return null;
  if (quiet) return quietArgs(program, cmd) || cmd;
  return cmd;
}

function runUninstaller(program, { quiet = false, onState = () => {} } = {}) {
  const cmd = commandFor(program, quiet);
  let stop = false;
  const promise = new Promise((resolve) => {
    if (!cmd) { resolve({ ok: false, reason: 'no-uninstaller' }); return; }
    const started = Date.now();
    let child;
    try {
      child = spawn(cmd.file, cmd.args ? [cmd.args] : [], {
        windowsVerbatimArguments: true,
        detached: false,
        windowsHide: false,
        cwd: fsx.isDir(cmd.file.slice(0, cmd.file.lastIndexOf('\\'))) ? cmd.file.slice(0, cmd.file.lastIndexOf('\\')) : undefined,
      });
    } catch (err) {
      resolve({ ok: false, reason: 'spawn', detail: String(err.message || err) });
      return;
    }
    let exitCode = null;
    child.on('error', (err) => { exitCode = -1; resolve({ ok: false, reason: 'spawn', detail: String(err.message || err) }); });
    child.on('exit', (code) => { exitCode = code; });

    const tree = new Set([child.pid]);
    const startFt = BigInt(started + 11644473600000) * 10000n - 50_000_000n;
    const poll = setInterval(() => {
      const procs = sys.processes();
      for (const p of procs) {
        if (tree.has(p.ppid) && BigInt(p.createTime) >= startFt) tree.add(p.pid);
      }
      const alive = procs.filter((p) => tree.has(p.pid));
      onState({ running: alive.length, names: [...new Set(alive.map((p) => p.name))] });
      if ((alive.length === 0 && exitCode !== null) || stop) {
        clearInterval(poll);
        resolve({ ok: true, exitCode, aborted: stop, removed: !reg.exists(program.root, program.key), command: `${cmd.file} ${cmd.args}`.trim() });
      }
    }, 700);
  });
  return { promise, abort: () => { stop = true; } };
}

const GENERIC = new Set(['update', 'updater', 'common', 'common files', 'shared', 'data', 'app', 'apps', 'program', 'programs',
  'microsoft', 'windows', 'system', 'tools', 'software', 'games', 'temp', 'cache', 'local', 'locallow', 'roaming', 'user',
  'users', 'config', 'settings', 'drivers', 'driver', 'runtime', 'redistributable', 'sdk', 'x64', 'x86', 'bin', 'lib',
  'google', 'intel', 'nvidia', 'amd', 'apple', 'adobe', 'oracle', 'realtek', 'mozilla', 'packages', 'classes', 'policies',
  'wow6432node', 'clients', 'default', 'setup', 'installer', 'install', 'uninstall', 'documents', 'downloads', 'desktop',
  'music', 'pictures', 'videos', 'public', 'programdata', 'appdata', 'launcher', 'client', 'service', 'services', 'helper',
  'plugins', 'plugin', 'logs', 'log', 'crashpad', 'crashreports', 'team', 'studio', 'player', 'browser', 'driverstore']);

const BIG_PUBLISHERS = new Set(['microsoft', 'google', 'intel', 'nvidia', 'amd', 'advancedmicrodevices', 'apple', 'adobe',
  'oracle', 'realtek', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'samsung', 'logitech', 'mozilla', 'valve', 'electronicarts',
  'ubisoft', 'epicgames', 'riotgames', 'blizzard', 'activisionblizzard', 'tencent', 'jetbrains', 'python', 'pythonsoftwarefoundation']);

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

function cleanName(name) {
  return String(name || '')
    .replace(/[®™©]/g, '')
    .replace(/\((x64|x86|64[- ]?bit|32[- ]?bit|amd64|arm64)[^)]*\)/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\bv?\d+(\.\d+){1,4}\b.*$/i, '')
    .replace(/\b(version|versão)\b.*$/i, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanPublisher(pub) {
  return String(pub || '')
    .replace(/[®™©,.]/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|s\.?a|ag|bv|sro|software|technologies|technology|team|foundation|labs|studio|studios|games|entertainment|international|group|holdings|plc)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function criticalDirs() {
  const list = [
    SYSTEM_ROOT, env('ProgramFiles'), env('ProgramFiles(x86)'), env('ProgramW6432'), env('ProgramData'), env('USERPROFILE'),
    env('APPDATA'), env('LOCALAPPDATA'), env('PUBLIC'), env('CommonProgramFiles'), env('CommonProgramFiles(x86)'),
    J(env('LOCALAPPDATA'), 'Programs'), J(env('LOCALAPPDATA'), '..', 'LocalLow'), J(env('LOCALAPPDATA'), 'Packages'),
    J(env('USERPROFILE'), 'Desktop'), J(env('USERPROFILE'), 'Documents'), J(env('USERPROFILE'), 'Downloads'),
    J(env('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), J(env('ProgramData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    J(env('PUBLIC'), 'Desktop'), J(env('ProgramData'), 'Microsoft'), J(env('APPDATA'), 'Microsoft'), J(env('LOCALAPPDATA'), 'Microsoft'),
    J(env('LOCALAPPDATA'), 'Temp'),
  ];
  return new Set(list.filter(Boolean).map((p) => J(p).toLowerCase().replace(/\\+$/, '')));
}

function isRootLike(dir) {
  const d = J(dir).toLowerCase().replace(/\\+$/, '');
  if (/^[a-z]:$/.test(d)) return true;
  if (d.startsWith(J(SYSTEM_ROOT).toLowerCase())) return true;
  return criticalDirs().has(d);
}

const CRITICAL_KEYS = /^(software|software\\microsoft|software\\classes|software\\policies|software\\wow6432node|software\\wow6432node\\microsoft|software\\clients|software\\registeredapplications|system|system\\currentcontrolset)$/i;

function tokensFor(program) {
  const names = new Map();
  const add = (value, confidence) => {
    const n = norm(value);
    if (n.length < 3 || GENERIC.has(String(value).toLowerCase().trim()) || GENERIC.has(n)) return;
    const prev = names.get(n);
    if (!prev || prev === 'medium') names.set(n, confidence);
  };
  const clean = cleanName(program.name);
  add(clean, 'high');
  const pub = cleanPublisher(program.publisher);
  if (pub && clean.toLowerCase().startsWith(pub.toLowerCase() + ' ')) add(clean.slice(pub.length + 1), 'medium');
  if (program.location) add(program.location.slice(program.location.lastIndexOf('\\') + 1), 'high');
  if (program.icon && /\.exe$/i.test(program.icon)) add(program.icon.slice(program.icon.lastIndexOf('\\') + 1).replace(/\.exe$/i, ''), 'medium');
  if (!GUID_RE.test(program.keyName) && !/_is1$/i.test(program.keyName)) add(program.keyName, 'medium');
  if (/_is1$/i.test(program.keyName)) add(program.keyName.replace(/_is1$/i, ''), 'medium');
  return names;
}

function locationFromShortcuts(tokens, readShortcut) {
  const roots = [
    J(env('ProgramData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    J(env('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
  for (const root of roots) {
    const stack = [[root, 0]];
    while (stack.length) {
      const [dir, depth] = stack.pop();
      for (const e of fsx.list(dir)) {
        if (e.dir && !e.link) { if (depth < 1) stack.push([e.path, depth + 1]); continue; }
        if (!/\.lnk$/i.test(e.name) || !tokens.has(norm(e.name.replace(/\.lnk$/i, '')))) continue;
        let target = '';
        try { target = (readShortcut(e.path) || {}).target || ''; } catch { target = ''; }
        if (!/\.exe$/i.test(target) || !fsx.exists(target)) continue;
        const folder = target.slice(0, target.lastIndexOf('\\'));
        if (folder && !isRootLike(folder) && !/\\(system32|syswow64)\b/i.test(folder)) return folder;
      }
    }
  }
  return '';
}

function within(path, dir) {
  if (!dir) return false;
  const p = J(path).toLowerCase();
  const d = J(dir).toLowerCase().replace(/\\+$/, '');
  return p === d || p.startsWith(d + '\\');
}

async function scanLeftovers(program, { mode = 'moderate', readShortcut = null } = {}) {
  const tokens = tokensFor(program);
  const pubNorm = norm(cleanPublisher(program.publisher));
  const pubIsBig = !pubNorm || BIG_PUBLISHERS.has(pubNorm) || GENERIC.has(pubNorm);
  let loc = program.location && !isRootLike(program.location) ? program.location : '';
  if (!loc && readShortcut) loc = locationFromShortcuts(tokens, readShortcut);
  if (loc) tokens.set(norm(loc.slice(loc.lastIndexOf('\\') + 1)), 'high');
  const exeName = program.icon && /\.exe$/i.test(program.icon) ? program.icon.slice(program.icon.lastIndexOf('\\') + 1).toLowerCase() : '';
  const items = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.kind}|${(item.path || '').toLowerCase()}|${(item.name || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };
  const confidenceOf = (name) => tokens.get(norm(name)) || null;

  if (loc && fsx.isDir(loc)) push({ kind: 'dir', path: loc, confidence: 'high', reason: 'install' });

  const bases = [
    env('ProgramFiles'), env('ProgramFiles(x86)'), env('ProgramData'), env('APPDATA'), env('LOCALAPPDATA'),
    J(env('LOCALAPPDATA'), 'Programs'), J(env('LOCALAPPDATA'), '..', 'LocalLow'), env('CommonProgramFiles'),
    env('CommonProgramFiles(x86)'),
  ].filter(Boolean);
  if (mode === 'advanced') bases.push(J(env('USERPROFILE'), 'Documents'), env('USERPROFILE'));

  for (const base of bases) {
    if (!fsx.isDir(base)) continue;
    for (const e of fsx.list(base)) {
      if (!e.dir || e.link) continue;
      const conf = confidenceOf(e.name);
      if (conf && !isRootLike(e.path)) push({ kind: 'dir', path: e.path, confidence: conf, reason: 'name' });
      if (!pubIsBig && norm(e.name) === pubNorm) {
        const children = fsx.list(e.path).filter((c) => c.dir && !c.link);
        let matched = 0;
        for (const c of children) {
          const cc = confidenceOf(c.name);
          if (cc) { push({ kind: 'dir', path: c.path, confidence: cc, reason: 'publisher' }); matched++; }
        }
        if (matched && matched === children.length && fsx.list(e.path).every((c) => c.dir)) {
          push({ kind: 'dir', path: e.path, confidence: 'low', reason: 'publisher-empty' });
        }
      }
    }
  }

  const shortcutDirs = [
    J(env('APPDATA'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    J(env('ProgramData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    J(env('USERPROFILE'), 'Desktop'),
    J(env('PUBLIC'), 'Desktop'),
    J(env('APPDATA'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
  ];
  for (const dir of shortcutDirs) {
    if (!fsx.isDir(dir)) continue;
    const stack = [[dir, 0]];
    while (stack.length) {
      const [d, depth] = stack.pop();
      for (const e of fsx.list(d)) {
        if (e.dir && !e.link) {
          const conf = confidenceOf(e.name);
          if (conf && depth === 0 && dir.toLowerCase().includes('start menu')) push({ kind: 'dir', path: e.path, confidence: conf, reason: 'startmenu' });
          else if (depth < 2) stack.push([e.path, depth + 1]);
          continue;
        }
        if (!/\.(lnk|url)$/i.test(e.name)) continue;
        let target = '';
        if (readShortcut && /\.lnk$/i.test(e.name)) {
          try { target = (readShortcut(e.path) || {}).target || ''; } catch { target = ''; }
        }
        if (loc && target && within(target, loc)) push({ kind: 'file', path: e.path, confidence: 'high', reason: 'shortcut', size: e.size });
        else if (confidenceOf(e.name.replace(/\.(lnk|url)$/i, ''))) push({ kind: 'file', path: e.path, confidence: 'medium', reason: 'shortcut', size: e.size });
      }
    }
  }

  if (reg.exists(program.root, program.key)) push({ kind: 'regkey', root: program.root, path: program.key, confidence: 'high', reason: 'uninstall' });

  const softwareRoots = [['HKCU', 'Software'], ['HKLM', 'SOFTWARE'], ['HKLM', 'SOFTWARE\\WOW6432Node']];
  for (const [root, base] of softwareRoots) {
    for (const name of reg.subkeys(root, base)) {
      const conf = confidenceOf(name);
      const path = `${base}\\${name}`;
      if (conf && !CRITICAL_KEYS.test(path)) push({ kind: 'regkey', root, path, confidence: conf, reason: 'name' });
      if (!pubIsBig && norm(name) === pubNorm) {
        const children = reg.subkeys(root, path);
        let matched = 0;
        for (const child of children) {
          const cc = confidenceOf(child);
          if (cc) { push({ kind: 'regkey', root, path: `${path}\\${child}`, confidence: cc, reason: 'publisher' }); matched++; }
        }
        if (matched && matched === children.length && reg.values(root, path).length === 0) {
          push({ kind: 'regkey', root, path, confidence: 'low', reason: 'publisher-empty' });
        }
      }
    }
  }

  const runKeys = [
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Run'], ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce'],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'], ['HKLM', 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'],
  ];
  for (const [root, path] of runKeys) {
    for (const v of reg.values(root, path)) {
      const cmd = String(v.value || '');
      const target = (splitCommand(cmd) || {}).file || '';
      if ((loc && within(target, loc)) || (exeName && target.toLowerCase().endsWith('\\' + exeName))) {
        push({ kind: 'regvalue', root, path, name: v.name, confidence: 'high', reason: 'run' });
      } else if (confidenceOf(v.name)) {
        push({ kind: 'regvalue', root, path, name: v.name, confidence: 'medium', reason: 'run' });
      }
    }
  }

  for (const root of ['HKLM', 'HKCU']) {
    const base = root === 'HKLM' ? 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths' : 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths';
    for (const name of reg.subkeys(root, base)) {
      const target = unquote(reg.readString(root, `${base}\\${name}`, ''));
      if ((loc && target && within(target, loc)) || (exeName && name.toLowerCase() === exeName && !target)) {
        push({ kind: 'regkey', root, path: `${base}\\${name}`, confidence: 'high', reason: 'apppath' });
      }
    }
  }

  if (loc) {
    const mui = 'Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache';
    for (const v of reg.values('HKCU', mui)) {
      if (within(v.name.replace(/\.(FriendlyAppName|ApplicationCompany)$/i, ''), loc)) {
        push({ kind: 'regvalue', root: 'HKCU', path: mui, name: v.name, confidence: 'high', reason: 'muicache' });
      }
    }
  }

  if (mode !== 'safe' && loc) {
    for (const name of reg.subkeys('HKLM', 'SYSTEM\\CurrentControlSet\\Services')) {
      const image = String(reg.readString('HKLM', `SYSTEM\\CurrentControlSet\\Services\\${name}`, 'ImagePath'));
      const file = (splitCommand(image) || {}).file || '';
      if (file && within(file, loc)) push({ kind: 'service', name, path: file, confidence: 'medium', reason: 'service' });
    }
  }
  if (mode === 'advanced') {
    const tasksRoot = J(SYSTEM32, 'Tasks');
    const stack = [tasksRoot];
    while (stack.length) {
      const d = stack.pop();
      for (const e of fsx.list(d)) {
        if (e.dir && !e.link) {
          if (!/\\microsoft$/i.test(e.path)) stack.push(e.path);
          continue;
        }
        let hit = !!confidenceOf(e.name);
        if (!hit && loc && e.size < 256 * 1024) {
          try {
            const xml = fs.readFileSync(e.path, 'utf16le');
            hit = xml.toLowerCase().includes(J(loc).toLowerCase());
          } catch { hit = false; }
        }
        if (hit) push({ kind: 'task', name: e.path.slice(tasksRoot.length).replace(/^\\/, ''), path: e.path, confidence: 'low', reason: 'task' });
      }
    }
  }

  for (const item of items) {
    if (item.kind === 'dir') item.size = await folderSize(item.path);
  }
  const allowed = mode === 'safe' ? new Set(['high']) : mode === 'moderate' ? new Set(['high', 'medium']) : new Set(['high', 'medium', 'low']);
  return items.filter((i) => allowed.has(i.confidence)).map((i, n) => ({ ...i, id: n, checked: i.confidence === 'high' }));
}

async function deleteLeftovers(program, items, { trash = null } = {}) {
  const result = { files: 0, dirs: 0, keys: 0, values: 0, services: 0, tasks: 0, bytes: 0, failures: [], backup: '' };
  const regItems = items.filter((i) => i.kind === 'regkey' || i.kind === 'regvalue');
  if (regItems.length) {
    const dir = J(dataDir(), 'backups');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {  }
    const safeName = cleanName(program.name).replace(/[^\w\- ]+/g, '').slice(0, 40) || 'app';
    const stamp = now().replace(/[: ]/g, '-');
    const parts = [];
    for (const [n, item] of regItems.entries()) {
      const file = J(dir, `${stamp} ${safeName} ${n}.reg`);
      const r = await run(J(SYSTEM32, 'reg.exe'), ['export', `${item.root}\\${item.path}`, file, '/y'], { timeout: 30_000 });
      if (r.code === 0) parts.push(file);
    }
    if (parts.length) {
      const merged = J(dir, `${stamp} ${safeName}.reg`);
      try {
        const bodies = parts.map((p, i) => {
          const text = fs.readFileSync(p, 'utf16le').replace(/^\uFEFF/, '');
          fs.unlinkSync(p);
          return i === 0 ? text : text.replace(/^Windows Registry Editor Version 5\.00\r?\n/, '');
        });
        fs.writeFileSync(merged, '\uFEFF' + bodies.join('\r\n'), 'utf16le');
        result.backup = merged;
      } catch { result.backup = parts[0]; }
    }
  }

  for (const item of items.filter((i) => i.kind === 'service')) {
    await run(J(SYSTEM32, 'sc.exe'), ['stop', item.name], { timeout: 30_000 });
    const r = await run(J(SYSTEM32, 'sc.exe'), ['delete', item.name], { timeout: 30_000 });
    if (r.code === 0) result.services++; else result.failures.push({ item, detail: r.out.trim().slice(-160) });
  }
  for (const item of items.filter((i) => i.kind === 'task')) {
    const r = await run(J(SYSTEM32, 'schtasks.exe'), ['/delete', '/tn', '\\' + item.name, '/f'], { timeout: 30_000 });
    if (r.code === 0) result.tasks++; else result.failures.push({ item, detail: r.out.trim().slice(-160) });
  }
  for (const item of items.filter((i) => i.kind === 'file' || i.kind === 'dir')) {
    if (isRootLike(item.path)) { result.failures.push({ item, detail: 'protected' }); continue; }
    let ok = false;
    if (trash) {
      try { await trash(item.path); ok = true; } catch { ok = false; }
    }
    if (!ok) {
      const entry = fsx.entryOf(item.path);
      if (!entry) { ok = true; } else {
        const r = { bytes: 0, files: 0, directories: 0, skipped: 0, failures: 0 };
        await fsx.remove(entry, r, () => false);
        ok = !fsx.exists(item.path);
      }
    }
    if (ok) {
      if (item.kind === 'dir') result.dirs++; else result.files++;
      result.bytes += item.size || 0;
    } else {
      result.failures.push({ item, detail: 'in-use' });
    }
  }
  for (const item of regItems) {
    if (item.kind === 'regkey') {
      if (CRITICAL_KEYS.test(item.path)) { result.failures.push({ item, detail: 'protected' }); continue; }
      if (reg.deleteTree(item.root, item.path)) result.keys++; else result.failures.push({ item, detail: 'denied' });
    } else if (reg.deleteValue(item.root, item.path, item.name)) {
      result.values++;
    } else {
      result.failures.push({ item, detail: 'denied' });
    }
  }
  const failed = new Set(result.failures.map((f) => f.item));
  result.checks = items.map((item) => {
    let gone;
    if (item.kind === 'file' || item.kind === 'dir') gone = !fsx.exists(item.path);
    else if (item.kind === 'regkey') gone = !reg.exists(item.root, item.path);
    else if (item.kind === 'regvalue') gone = !reg.read(item.root, item.path, item.name);
    else if (item.kind === 'service') gone = !reg.exists('HKLM', `SYSTEM\\CurrentControlSet\\Services\\${item.name}`);
    else gone = !fs.existsSync(item.path);
    const f = result.failures.find((x) => x.item === item);
    return { kind: item.kind, root: item.root, path: item.path, name: item.name, size: item.size || 0, gone, detail: failed.has(item) && f ? f.detail : '' };
  });
  return result;
}

module.exports = {
  listPrograms,
  folderSize,
  runUninstaller,
  scanLeftovers,
  deleteLeftovers,
  splitCommand,
  cleanName,
  isRootLike,
  elevated: isElevated,
};
