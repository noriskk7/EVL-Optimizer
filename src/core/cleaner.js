'use strict';

const fs = require('fs');
const { J, env, SYSTEM_ROOT, run, SYSTEM32 } = require('./util');
const fsx = require('./fsx');
const sys = require('./sysinfo');
const reg = require('./registry');
const { fn, isElevated, driveRoots, diskSpace } = require('./win32');

const CONTENTS = 'contents';
const DIRECTORY = 'directory';
const FILE = 'file';
const MATCH_FILES = 'files';
const MATCH_DIRS = 'dirs';
const RECYCLE = 'recycle';
const COMMAND = 'command';

const isAbs = (p) => /^[A-Za-z]:\\/.test(p || '');

function ctxPaths() {
  const local = env('LOCALAPPDATA');
  const roaming = env('APPDATA');
  const profile = env('USERPROFILE');
  return {
    local,
    roaming,
    profile,
    localLow: local ? J(local, '..', 'LocalLow') : '',
    programData: env('ProgramData') || 'C:\\ProgramData',
    temp: env('TEMP') || (local ? J(local, 'Temp') : ''),
    windows: SYSTEM_ROOT,
    systemDrive: (env('SystemDrive') || SYSTEM_ROOT.slice(0, 2)) + '\\',
  };
}

const subdirs = (dir) => {
  if (!isAbs(dir)) return [];
  return fsx.list(dir).filter((e) => e.dir && !e.link).map((e) => e.path);
};

const nameOf = (p) => p.slice(p.lastIndexOf('\\') + 1);

class Targets {
  constructor() { this.items = []; this.blocked = []; }
  add(path, mode = CONTENTS) { if (isAbs(path)) this.items.push({ path: J(path), mode }); }
  match(path, mode, prefix = '', suffix = '') { if (isAbs(path)) this.items.push({ path: J(path), mode, prefix, suffix }); }
  special(mode, extra = {}) { this.items.push({ path: '', mode, ...extra }); }
  unique() {
    const seen = new Set();
    return this.items.filter((t) => {
      const key = `${t.path.toLowerCase()}|${t.mode}|${(t.prefix || '').toLowerCase()}|${(t.suffix || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function chromiumProfile(t, profile) {
  for (const sub of ['Cache', 'Code Cache', 'GPUCache', 'Media Cache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
    J('Service Worker', 'CacheStorage'), J('Service Worker', 'ScriptCache')]) {
    t.add(J(profile, sub));
  }
}

function chromiumUserData(t, userData) {
  if (!fsx.isDir(userData)) return;
  for (const sub of ['GrShaderCache', 'ShaderCache', 'GraphiteDawnCache', 'component_crx_cache']) t.add(J(userData, sub));
  for (const dir of subdirs(userData)) {
    const name = nameOf(dir);
    if (name === 'Default' || name === 'Guest Profile' || name.toLowerCase().startsWith('profile ')) chromiumProfile(t, dir);
  }
}

function firefoxProfiles(t, root) {
  for (const dir of subdirs(root)) {
    t.add(J(dir, 'cache2'));
    t.add(J(dir, 'startupCache'));
    t.add(J(dir, 'shader-cache'));
    t.add(J(dir, 'thumbnails'));
  }
}

function electronApp(t, root) {
  for (const sub of ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'blob_storage', 'Crashpad']) t.add(J(root, sub));
}

function fivemApp(t, fivem) {
  for (const sub of [J('data', 'cache'), J('data', 'server-cache'), J('data', 'server-cache-priv'), J('data', 'nui-storage'), 'logs', 'crashes']) {
    t.add(J(fivem, sub));
  }
}

let discovery = null;

function steamLibraries(steam) {
  for (const vdf of [J(steam, 'steamapps', 'libraryfolders.vdf'), J(steam, 'config', 'libraryfolders.vdf')]) {
    let text;
    try { text = fs.readFileSync(vdf, 'utf8'); } catch { continue; }
    const paths = [...text.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)].map((m) => m[1]);
    return paths.map((p) => p.replace(/\\\\/g, '\\'));
  }
  return [];
}

function launcherInstalls() {
  if (discovery && Date.now() - discovery.at < 30_000) return discovery.found;
  const found = { steam: [], steamLibraries: [], riot: [], ubisoft: [], wow: [], fivem: [] };
  const keep = (bucket, p) => {
    if (!isAbs(p)) return;
    const k = J(p).toLowerCase();
    if (!found[bucket].some((x) => x.toLowerCase() === k)) found[bucket].push(J(p));
  };
  for (const [root, sub, value] of [['HKCU', 'Software\\Valve\\Steam', 'SteamPath'], ['HKLM', 'SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath']]) {
    const p = reg.readString(root, sub, value).replace(/\//g, '\\');
    if (p && fsx.isDir(p)) keep('steam', p);
  }
  const ubi = reg.readString('HKLM', 'SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher', 'InstallDir').replace(/\//g, '\\');
  if (ubi && fsx.isDir(ubi)) keep('ubisoft', ubi);
  const { local } = ctxPaths();
  if (local && fsx.isDir(J(local, 'FiveM', 'FiveM.app'))) keep('fivem', J(local, 'FiveM', 'FiveM.app'));

  for (const drive of driveRoots().filter((r) => fn.GetDriveTypeW(r) === 3)) {
    for (const parent of ['', 'Games', 'Jogos', 'Program Files', 'Program Files (x86)']) {
      const base = parent ? J(drive, parent) : drive.slice(0, 2) + '\\';
      if (fsx.isDir(J(base, 'FiveM.app'))) keep('fivem', J(base, 'FiveM.app'));
      for (const child of subdirs(base)) {
        const name = nameOf(child).toLowerCase();
        if (fsx.isDir(J(child, 'FiveM.app'))) keep('fivem', J(child, 'FiveM.app'));
        if (fsx.exists(J(child, 'steam.exe'))) keep('steam', child);
        if (fsx.isDir(J(child, 'steamapps'))) keep('steamLibraries', child);
        if (name === 'riot games') keep('riot', child);
        else if (name === 'ubisoft game launcher') keep('ubisoft', child);
        else if (name === 'ubisoft' && fsx.isDir(J(child, 'Ubisoft Game Launcher'))) keep('ubisoft', J(child, 'Ubisoft Game Launcher'));
        else if (name === 'world of warcraft') keep('wow', child);
      }
    }
  }
  for (const steam of [...found.steam]) {
    keep('steamLibraries', steam);
    for (const lib of steamLibraries(steam)) if (fsx.isDir(lib)) keep('steamLibraries', lib);
  }
  discovery = { at: Date.now(), found };
  return found;
}

const APP_CACHE_NAMES = new Set(['cache', 'code cache', 'gpucache', 'shadercache', 'grshadercache', 'graphitedawncache',
  'dawncache', 'dawngraphitecache', 'dawnwebgpucache', 'cacheddata', 'media cache']);
const APP_CACHE_SKIP = new Set(['microsoft', 'packages', 'programs', 'temp', 'node_modules', 'site-packages', 'extensions',
  '.git', 'evl optimizer']);

function findDirs(roots, { maxDepth, match, skip = () => false, owned = new Set() }) {
  const found = [];
  const stack = roots.filter(isAbs).map((r) => [r, 0]);
  while (stack.length) {
    const [dir, depth] = stack.pop();
    for (const child of subdirs(dir)) {
      if (owned.has(child.toLowerCase())) continue;
      const name = nameOf(child).toLowerCase();
      if (match(name, child)) { found.push(child); continue; }
      if (skip(name) || depth + 1 >= maxDepth) continue;
      stack.push([child, depth + 1]);
    }
  }
  return found.sort((a, b) => a.localeCompare(b));
}

const MUSIC_NAMES = new Set(['cache', 'caches', 'code cache', 'gpucache', 'dawncache', 'dawngraphitecache', 'dawnwebgpucache',
  'shadercache', 'grshadercache', 'webcache', 'htmlcache', 'cacheddata', 'media cache', 'http cache', 'image cache',
  'logs', 'log', 'crashdumps', 'crash dumps', 'crashpad', 'minidumps', 'crash reports', 'crashreports', 'crash-reports', 'dumps',
  'vst cache', 'vst3 cache', 'vstcache', 'vst3cache', 'plugin cache', 'plug-in cache', 'plugincache', 'plugin-cache', 'plugin-db',
  'plugin scan cache', 'scan cache']);
const CREATIVE_NAMES = new Set([...MUSIC_NAMES, 'media cache files', 'peak files', 'cacheclip', 'crashes', 'team projects cache']);

const VENDOR_NEVER = new Set(['projects', 'project', 'backup', 'backups', 'autosave', 'auto save', 'auto-save', 'recovery',
  'crash recovery', 'crashrecovery', 'recordings', 'recorded', 'user library', 'library', 'libraries', 'samples', 'sample',
  'sounds', 'soundpacks', 'soundbanks', 'instruments', 'presets', 'preset', 'patches', 'templates', 'template', 'licenses',
  'license', 'licence', 'authorization', 'authorisation', 'activation', 'content', 'user content', 'steam', 'extensions',
  'plug-ins', 'plugins', 'vstplugins', 'scenes', 'profiles', 'basic', 'workspaces', 'settings', 'snippets', 'documents',
  'exports', 'bounces', 'renders', 'resolve disk database', 'proxies', 'proxy',
  'catalogs', 'catalog', 'slstore', 'slcache', 'oobe', 'sentinel', 'adobegcclient', 'cep', 'uxp']);

const DAWS = [
  { n: 'Ableton Live', d: ['Ableton'], p: /^ableton live/, add: (c) => [J(c.local, 'Ableton', 'Live Reports', 'Usage'), J(c.local, 'Ableton', 'Live Reports', 'Crash')] },
  { n: 'Cubase / Nuendo / Steinberg', d: ['Steinberg'], p: /^(cubase|nuendo|wavelab|halion|dorico|spectralayers|groove agent|steinberg)/ },
  { n: 'FL Studio', d: ['Image-Line'], p: /^(fl64|fl|flstudio|fl studio|fl32)$/ },
  { n: 'Pro Tools / Sibelius', d: ['Avid'], p: /^(pro ?tools|sibelius|avid)/ },
  { n: 'Studio One', d: ['PreSonus'], p: /^(studio one|presonus)/ },
  { n: 'REAPER', d: ['REAPER', 'Cockos'], p: /^reaper/, files: (c) => [[J(c.roaming, 'REAPER'), 'reaper-vstplugins', '.ini'], [J(c.roaming, 'REAPER'), 'reaper-clap', '.ini'], [J(c.roaming, 'REAPER'), 'reaper-dxplugins', '.ini']] },
  { n: 'Guitar Pro / Finale', d: ['Arobas Music', 'MakeMusic', 'Finale'], p: /^(guitar pro|finale|makemusic)/ },
  { n: 'Bitwig Studio', d: ['Bitwig', 'Bitwig Studio'], p: /^bitwig/ },
  { n: 'Cakewalk / BandLab', d: ['Cakewalk', 'BandLab', 'BandLab Assistant'], p: /^(cakewalk|sonar|bandlab)/ },
  { n: 'Reason', d: ['Propellerhead Software', 'Propellerhead', 'Reason Studios'], p: /^(reason|propellerhead)/ },
  { n: 'MAGIX / Samplitude', d: ['MAGIX'], p: /^(samplitude|sequoia|music ?maker|magix)/ },
  { n: 'Waveform', d: ['Tracktion'], p: /^(waveform|tracktion)/ },
  { n: 'n-Track', d: ['n-Track'], p: /^n-?track/ },
  { n: 'Mixcraft', d: ['Acoustica'], p: /^(mixcraft|acoustica)/ },
  { n: 'Ardour', d: ['Ardour', 'ardour6', 'ardour7', 'ardour8', 'ardour9'], p: /^ardour/ },
  { n: 'LMMS', d: ['lmms', 'LMMS'], p: /^lmms/ },
  { n: 'MOTU', d: ['MOTU'], p: /^(digital performer|motu)/ },
  { n: 'Mixbus', d: ['Harrison', 'Mixbus'], p: /^(mixbus|harrison)/ },
  { n: 'MuseScore', d: ['MuseScore'], p: /^musescore/ },
  { n: 'Serato', d: ['Serato'], p: /^serato/ },
  { n: 'rekordbox', d: ['Pioneer'], p: /^(rekordbox|pioneer)/ },
  { n: 'VirtualDJ', d: ['VirtualDJ'], p: /^virtualdj/ },
  { n: 'Cycling 74 Max', d: ['Cycling \'74'], p: /^max$/ },
];

const PLUGINS = [
  { n: 'Native Instruments', d: ['Native Instruments'], p: /^(native access|kontakt|maschine|komplete|reaktor|massive|guitar rig|battery|traktor|service center|native instruments)/ },
  { n: 'Waves', d: ['Waves', 'Waves Audio', 'Waves Central', 'Waves Audio Ltd'], p: /^waves/ },
  { n: 'iZotope', d: ['iZotope'], p: /^(izotope|product portal|ozone|neutron|nectar)/ },
  { n: 'Arturia', d: ['Arturia'], p: /^arturia/ },
  { n: 'Plugin Alliance', d: ['Plugin Alliance'], p: /^(plugin alliance|installation manager)/ },
  { n: 'IK Multimedia', d: ['IK Multimedia'], p: /^(amplitube|t-racks|sampletank|ik product manager|ik multimedia)/ },
  { n: 'Softube', d: ['Softube'], p: /^softube/ },
  { n: 'XLN Audio', d: ['XLN Audio', 'XLN Online Installer'], p: /^(xln|addictive|xo$)/ },
  { n: 'UJAM', d: ['UJAM'], p: /^ujam/ },
  { n: 'Slate Digital', d: ['Slate Digital'], p: /^slate/ },
  { n: 'Universal Audio', d: ['Universal Audio', 'UA Connect'], p: /^(ua connect|universal audio|uad)/ },
  { n: 'Spitfire Audio', d: ['Spitfire Audio'], p: /^spitfire/ },
  { n: 'Orchestral Tools', d: ['Orchestral Tools'], p: /^orchestral/ },
  { n: 'Splice', d: ['Splice'], p: /^splice/ },
  { n: 'LANDR', d: ['LANDR', 'LANDR Studio'], p: /^landr/ },
  { n: 'Loopcloud', d: ['Loopmasters', 'Loopcloud'], p: /^loopcloud/ },
  { n: 'Focusrite', d: ['Focusrite', 'Focusrite Control'], p: /^focusrite/ },
  { n: 'Positive Grid', d: ['Positive Grid'], p: /^(positive grid|bias)/ },
  { n: 'Celemony / Antares', d: ['Celemony', 'Antares', 'Antares Audio Technologies'], p: /^(melodyne|celemony|auto-tune|antares)/ },
  { n: 'Soundtoys / FabFilter', d: ['Soundtoys', 'FabFilter'], p: /^(soundtoys|fabfilter)/ },
  { n: 'Kilohearts / Cableguys / Xfer', d: ['Kilohearts', 'Cableguys', 'Xfer', 'Xfer Records'], p: /^(kilohearts|cableguys|xfer)/ },
  { n: 'Toontrack / EastWest / Heavyocity', d: ['Toontrack', 'EastWest', 'East West', 'Heavyocity', 'Embertone', 'Best Service', 'Vienna'], p: /^(toontrack|eastwest|east west|heavyocity|embertone|best service|vienna)/ },
  { n: 'Korg / Roland / Yamaha / Akai / Novation / M-Audio', d: ['KORG', 'Korg', 'Roland', 'Roland Cloud', 'Roland Cloud Manager', 'Yamaha', 'Akai Pro', 'Akai', 'Novation', 'M-Audio', 'Moog Music', 'Teenage Engineering', 'Behringer', 'Mackie'], p: /^(korg|roland|yamaha|akai|novation|m-audio|moog|behringer|mackie)/ },
  { n: 'Cherry Audio / Valhalla / Plugin Boutique', d: ['Cherry Audio', 'Audiothing', 'Valhalla DSP', 'Klanghelm', 'Plugin Boutique', 'Surge Synth Team', 'Surge', 'Vital'], p: /^(cherry audio|valhalla|plugin boutique|surge|vital)/ },
  { n: 'Neural DSP / Overloud / Voxengo / Melda', d: ['Neural DSP', 'Overloud', 'Voxengo', 'MeldaProduction', 'Sonible', 'Eventide', 'u-he', 'Tone2'], p: /^(neural dsp|overloud|voxengo|melda|sonible|eventide|u-he|tone2)/ },
];

const CREATIVE = [
  { n: 'Adobe', d: ['Adobe'], p: /^(adobe|premiere|afterfx|after effects|audition|photoshop|illustrator|indesign|animate|media encoder|lightroom|creative cloud|acrobat|bridge)/ },
  { n: 'Blender', d: ['Blender Foundation'], p: /^blender/ },
  { n: 'DaVinci Resolve', d: ['Blackmagic Design'], p: /^(resolve|davinci|blackmagic)/ },
  { n: 'Unity', d: ['Unity', 'Unity Hub', 'UnityHub'], p: /^unity/ },
  { n: 'Maxon / Autodesk', d: ['Maxon', 'Autodesk'], p: /^(cinema|maxon|redshift|autodesk|3dsmax|maya)/ },
  { n: 'OBS Studio', d: ['obs-studio'], p: /^obs/ },
  { n: 'Streamlabs', d: ['slobs-client', 'Streamlabs Desktop', 'Streamlabs'], p: /^streamlabs/ },
  { n: 'Elgato', d: ['Elgato'], p: /^(elgato|wave link|stream deck|4k capture)/ },
  { n: 'vMix', d: ['vMix'], p: /^vmix/ },
];

const HARDWARE = [
  { n: 'NVIDIA', d: ['NVIDIA Corporation', 'NVIDIA'], p: /^(nvidia|nvcontainer|geforce)/ },
  { n: 'Razer', d: ['Razer', 'Razer Synapse 3', 'Razer Synapse'], p: /^razer/ },
  { n: 'Logitech', d: ['LogiOptionsPlus', 'Logitech', 'LGHUB', 'Logi'], p: /^(logi|lghub)/ },
  { n: 'Corsair', d: ['Corsair', 'iCUE'], p: /^(icue|corsair)/ },
  { n: 'SteelSeries', d: ['SteelSeries', 'SteelSeries GG'], p: /^steelseries/ },
  { n: 'ASUS', d: ['ASUS', 'Armoury Crate'], p: /^(asus|armoury)/ },
  { n: 'MSI', d: ['MSI', 'MSI Center'], p: /^msi/ },
  { n: 'Overwolf', d: ['Overwolf'], p: /^overwolf/ },
  { n: 'CurseForge', d: ['CurseForge', 'curseforge'], p: /^curseforge/ },
];

const VENDOR_DIRS = new Set([...DAWS, ...PLUGINS, ...CREATIVE, ...HARDWARE].flatMap((v) => v.d).map((d) => d.toLowerCase()));

const procName = (n) => String(n || '').toLowerCase().replace(/\.exe$/, '');
function runningProcs() {
  try { return sys.processes().map((p) => procName(p.name)); } catch { return []; }
}
const isOpen = (vendor, running) => !!vendor.p && running.some((n) => vendor.p.test(n));

function vendorCaches(t, vendors, names, running, elevated) {
  const c = ctxPaths();
  const bases = [c.roaming, c.local, elevated ? c.programData : ''].filter(Boolean);
  for (const v of vendors) {
    if (isOpen(v, running)) { t.blocked.push(v.n); continue; }
    for (const base of bases) {
      for (const dir of v.d) {
        const root = J(base, dir);
        if (!fsx.isDir(root)) continue;
        for (const cache of findDirs([root], { maxDepth: 5, match: (name) => names.has(name), skip: (name) => VENDOR_NEVER.has(name) })) t.add(cache);
      }
    }
    if (v.add) for (const extra of v.add(c)) t.add(extra);
    if (v.files) for (const [dir, prefix, suffix] of v.files(c)) t.match(dir, MATCH_FILES, prefix, suffix);
  }
}

const CATALOG = [
  { id: 'user-temp', group: 'system', risk: 0, admin: false },
  { id: 'thumbnail-cache', group: 'system', risk: 0, admin: false },
  { id: 'store-cache', group: 'system', risk: 0, admin: false },
  { id: 'webview-cache', group: 'system', risk: 0, admin: false },
  { id: 'crash-reports', group: 'system', risk: 1, admin: false },
  { id: 'explorer-history', group: 'system', risk: 1, admin: false },
  { id: 'recycle-bin', group: 'system', risk: 2, admin: false },
  { id: 'shader-cache', group: 'gpu', risk: 0, admin: false },
  { id: 'directx-cache', group: 'gpu', risk: 0, admin: false },
  { id: 'browser-cache', group: 'browsers', risk: 0, admin: false },
  { id: 'internet-cache', group: 'browsers', risk: 0, admin: false },
  { id: 'launcher-cache', group: 'games', risk: 0, admin: false },
  { id: 'game-logs', group: 'games', risk: 0, admin: false },
  { id: 'fivem-cache', group: 'games', risk: 1, admin: false },
  { id: 'chat-app-cache', group: 'apps', risk: 0, admin: false },
  { id: 'media-app-cache', group: 'apps', risk: 0, admin: false },
  { id: 'productivity-app-cache', group: 'apps', risk: 0, admin: false },
  { id: 'office-cache', group: 'apps', risk: 1, admin: false },
  { id: 'app-cache', group: 'apps', risk: 1, admin: false },
  { id: 'daw-cache', group: 'music', risk: 1, admin: false },
  { id: 'plugin-cache', group: 'music', risk: 1, admin: false },
  { id: 'creative-cache', group: 'creative', risk: 1, admin: false },
  { id: 'hardware-app-cache', group: 'apps', risk: 1, admin: false },
  { id: 'developer-cache', group: 'dev', risk: 0, admin: false },
  { id: 'windows-temp', group: 'windows', risk: 0, admin: true },
  { id: 'windows-update-cache', group: 'windows', risk: 1, admin: true },
  { id: 'delivery-optimization', group: 'windows', risk: 0, admin: true },
  { id: 'driver-leftovers', group: 'windows', risk: 0, admin: true },
  { id: 'system-logs', group: 'windows', risk: 1, admin: true },
  { id: 'memory-dumps', group: 'windows', risk: 1, admin: true },
  { id: 'prefetch', group: 'windows', risk: 1, admin: true },
  { id: 'font-cache', group: 'windows', risk: 1, admin: true },
  { id: 'upgrade-leftovers', group: 'windows', risk: 1, admin: true },
  { id: 'component-store', group: 'windows', risk: 1, admin: true, command: true },
  { id: 'windows-old', group: 'windows', risk: 2, admin: true },
];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));

function buildTargets(id, elevated) {
  const p = ctxPaths();
  const t = new Targets();
  const { local, roaming, localLow, programData, windows, profile } = p;

  switch (id) {
    case 'user-temp':
      t.add(p.temp);
      if (local) t.add(J(local, 'Temp'));
      break;

    case 'thumbnail-cache': {
      const explorer = J(local, 'Microsoft', 'Windows', 'Explorer');
      t.match(explorer, MATCH_FILES, 'thumbcache_', '.db');
      t.match(explorer, MATCH_FILES, 'iconcache_', '.db');
      t.add(J(local, 'IconCache.db'), FILE);
      break;
    }

    case 'store-cache':
      for (const pkg of subdirs(J(local, 'Packages'))) {
        t.add(J(pkg, 'AC', 'INetCache'));
        t.add(J(pkg, 'AC', 'Temp'));
      }
      break;

    case 'webview-cache': {
      const roots = [J(local, 'Packages'), local];
      const webviews = findDirs(roots, {
        maxDepth: 7,
        match: (name) => name === 'ebwebview',
        skip: (name) => name === 'temp' || name === 'node_modules' || name === 'evl optimizer',
      });
      for (const wv of webviews) chromiumUserData(t, wv);
      break;
    }

    case 'crash-reports':
      t.add(J(local, 'CrashDumps'));
      for (const sub of ['ReportArchive', 'ReportQueue', 'Temp']) t.add(J(local, 'Microsoft', 'Windows', 'WER', sub));
      if (elevated) for (const sub of ['ReportArchive', 'ReportQueue', 'Temp']) t.add(J(programData, 'Microsoft', 'Windows', 'WER', sub));
      break;

    case 'explorer-history': {
      const recent = J(roaming, 'Microsoft', 'Windows', 'Recent');
      t.add(J(recent, 'AutomaticDestinations'));
      t.add(J(recent, 'CustomDestinations'));
      t.match(recent, MATCH_FILES, '', '.lnk');
      break;
    }

    case 'recycle-bin':
      t.special(RECYCLE);
      break;

    case 'shader-cache':
      t.add(J(local, 'NVIDIA', 'DXCache'));
      t.add(J(local, 'NVIDIA', 'GLCache'));
      t.add(J(local, 'NVIDIA Corporation', 'NV_Cache'));
      t.add(J(local, 'AMD', 'DxCache'));
      t.add(J(local, 'AMD', 'DxcCache'));
      t.add(J(local, 'AMD', 'GLCache'));
      t.add(J(local, 'AMD', 'VkCache'));
      t.add(J(local, 'Intel', 'ShaderCache'));
      if (elevated) t.add(J(programData, 'NVIDIA Corporation', 'NV_Cache'));
      break;

    case 'directx-cache':
      t.add(J(local, 'D3DSCache'));
      t.add(J(local, 'Microsoft', 'DirectX Shader Cache'));
      t.add(J(local, 'Microsoft', 'Windows', 'DirectX Shader Cache'));
      break;

    case 'browser-cache':
      for (const ud of [
        J(local, 'Google', 'Chrome', 'User Data'),
        J(local, 'Google', 'Chrome Beta', 'User Data'),
        J(local, 'Microsoft', 'Edge', 'User Data'),
        J(local, 'Microsoft', 'Edge Beta', 'User Data'),
        J(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        J(local, 'Vivaldi', 'User Data'),
        J(local, 'Chromium', 'User Data'),
        J(local, 'Yandex', 'YandexBrowser', 'User Data'),
        J(local, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc', 'User Data'),
      ]) chromiumUserData(t, ud);
      for (const opera of ['Opera Stable', 'Opera GX Stable']) {
        chromiumProfile(t, J(roaming, 'Opera Software', opera));
        chromiumProfile(t, J(local, 'Opera Software', opera));
      }
      firefoxProfiles(t, J(roaming, 'Mozilla', 'Firefox', 'Profiles'));
      firefoxProfiles(t, J(local, 'Mozilla', 'Firefox', 'Profiles'));
      break;

    case 'internet-cache':
      t.add(J(local, 'Microsoft', 'Windows', 'INetCache', 'IE'));
      t.add(J(local, 'Microsoft', 'Windows', 'INetCache', 'Low', 'IE'));
      t.add(J(local, 'Microsoft', 'Windows', 'IECompatCache'));
      t.add(J(localLow, 'Microsoft', 'CryptnetUrlCache'));
      break;

    case 'launcher-cache': {
      t.add(J(local, 'EpicGamesLauncher', 'Saved', 'webcache'));
      t.match(J(local, 'EpicGamesLauncher', 'Saved'), MATCH_DIRS, 'webcache_');
      t.add(J(local, 'EpicGamesLauncher', 'Saved', 'Logs'));
      t.add(J(local, 'Battle.net', 'Cache'));
      t.add(J(roaming, 'Battle.net', 'Cache'));
      t.add(J(programData, 'Battle.net', 'Cache'));
      t.add(J(programData, 'Blizzard Entertainment', 'Battle.net', 'Cache'));
      t.add(J(local, 'Riot Games', 'Riot Client', 'Data', 'Cache'));
      t.add(J(local, 'Riot Games', 'Riot Client', 'Logs'));
      t.add(J(local, 'Steam', 'htmlcache'));
      t.add(J(roaming, 'Steam', 'htmlcache'));
      t.add(J(local, 'Ubisoft Game Launcher', 'cache'));
      t.add(J(roaming, 'EA Desktop', 'cache'));
      t.add(J(local, 'Electronic Arts', 'EA Desktop', 'Logs'));
      t.add(J(local, 'Electronic Arts', 'EA Desktop', 'CEF'));
      t.add(J(programData, 'GOG.com', 'Galaxy', 'webcache'));
      t.add(J(local, 'Rockstar Games', 'Launcher', 'Cache'));
      const found = launcherInstalls();
      for (const steam of found.steam) {
        t.add(J(steam, 'appcache', 'httpcache'));
        t.add(J(steam, 'config', 'htmlcache'));
        t.add(J(steam, 'logs'));
        t.add(J(steam, 'dumps'));
      }
      for (const lib of found.steamLibraries) {
        t.add(J(lib, 'steamapps', 'shadercache'));
        t.add(J(lib, 'steamapps', 'temp'));
      }
      for (const riot of found.riot) t.add(J(riot, 'League of Legends', 'Logs'));
      for (const ubi of found.ubisoft) { t.add(J(ubi, 'cache')); t.add(J(ubi, 'logs')); }
      for (const wow of found.wow) for (const flavor of ['_retail_', '_classic_', '_classic_era_']) t.add(J(wow, flavor, 'Cache'));
      break;
    }

    case 'game-logs':
      for (const game of subdirs(local)) {
        const saved = J(game, 'Saved');
        if (!fsx.isDir(saved)) continue;
        t.add(J(saved, 'Logs'));
        t.add(J(saved, 'Crashes'));
        t.match(saved, MATCH_DIRS, 'webcache');
      }
      t.add(J(local, 'CrashReportClient'));
      t.add(J(local, 'UnrealEngine', 'Common', 'DerivedDataCache'));
      for (const sub of ['logs', 'crash-reports', 'webcache2']) t.add(J(roaming, '.minecraft', sub));
      break;

    case 'fivem-cache':
      for (const fivem of launcherInstalls().fivem) fivemApp(t, fivem);
      break;

    case 'chat-app-cache':
      for (const app of ['discord', 'discordptb', 'discordcanary', 'Slack', J('Microsoft', 'Teams')]) electronApp(t, J(roaming, app));
      t.add(J(roaming, 'Microsoft', 'Teams', 'Service Worker', 'CacheStorage'));
      electronApp(t, J(roaming, 'Telegram Desktop', 'tdata', 'user_data'));
      t.add(J(roaming, 'Telegram Desktop', 'tdata', 'emoji'));
      for (const app of ['Signal', 'Element', 'Viber', 'Skype', 'WhatsApp', 'Guilded', 'Mattermost', 'Rocket.Chat', 'Wire']) electronApp(t, J(roaming, app));
      t.add(J(roaming, 'Zoom', 'logs'));
      t.add(J(local, 'Zoom', 'logs'));
      break;

    case 'media-app-cache':
      t.add(J(local, 'Spotify', 'Data'));
      t.add(J(local, 'Spotify', 'Browser', 'Cache'));
      t.add(J(roaming, 'Spotify', 'Data'));
      t.add(J(local, 'Packages', 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0', 'LocalCache'));
      for (const app of ['deezer-desktop', 'TIDAL']) electronApp(t, J(roaming, app));
      t.add(J(roaming, 'vlc', 'art'));
      break;

    case 'productivity-app-cache':
      for (const app of ['Notion', 'obsidian', 'Figma', 'Postman', 'Linear', 'Trello', 'Todoist', 'Evernote', 'Insomnia', 'GitHub Desktop',
        'joplin-desktop', 'logseq', 'Ferdium', 'Franz', 'Rambox', 'heroic', 'itch']) {
        electronApp(t, J(roaming, app));
      }
      t.add(J(local, 'Microsoft', 'OneDrive', 'logs'));
      t.add(J(local, 'Google', 'DriveFS', 'Logs'));
      t.add(J(local, 'Dropbox', 'logs'));
      break;

    case 'daw-cache':
      vendorCaches(t, DAWS, MUSIC_NAMES, runningProcs(), elevated);
      break;

    case 'plugin-cache': {
      const running = runningProcs();
      const open = DAWS.filter((v) => isOpen(v, running));
      if (open.length) { for (const v of open) t.blocked.push(v.n); break; }
      vendorCaches(t, PLUGINS, MUSIC_NAMES, running, elevated);
      break;
    }

    case 'creative-cache':
      vendorCaches(t, CREATIVE, CREATIVE_NAMES, runningProcs(), elevated);
      break;

    case 'hardware-app-cache':
      vendorCaches(t, HARDWARE, MUSIC_NAMES, runningProcs(), elevated);
      break;

    case 'office-cache':
      t.add(J(local, 'Microsoft', 'Office', '16.0', 'OfficeFileCache'));
      t.add(J(local, 'Microsoft', 'Windows', 'Temporary Internet Files', 'Content.MSO'));
      t.add(J(local, 'Microsoft', 'Windows', 'INetCache', 'Content.Outlook'));
      break;

    case 'app-cache': {
      const owned = new Set();
      for (const other of CATALOG) {
        if (other.id === 'app-cache' || other.command) continue;
        for (const target of buildTargets(other.id, elevated)) {
          if (target.mode === CONTENTS || target.mode === DIRECTORY) owned.add(target.path.toLowerCase());
        }
      }
      const roots = [local, roaming, localLow];
      for (const cache of findDirs(roots, {
        maxDepth: 6,
        owned,
        match: (name) => APP_CACHE_NAMES.has(name),
        skip: (name) => APP_CACHE_SKIP.has(name) || VENDOR_DIRS.has(name),
      })) t.add(cache);
      break;
    }

    case 'developer-cache':
      t.add(J(roaming, 'npm-cache', '_cacache'));
      t.add(J(local, 'npm-cache', '_cacache'));
      t.add(J(local, 'pip', 'cache'));
      t.add(J(local, 'Yarn', 'Cache'));
      t.add(J(local, 'NuGet', 'v3-cache'));
      t.add(J(local, 'Temp', 'NuGetScratch'));
      t.add(J(profile, '.gradle', 'caches', 'build-cache-1'));
      t.add(J(local, 'go-build'));
      t.add(J(profile, '.cargo', 'registry', 'cache'));
      t.add(J(profile, '.bun', 'install', 'cache'));
      t.add(J(local, 'electron', 'Cache'));
      t.add(J(local, 'electron-builder', 'Cache'));
      t.add(J(local, 'Microsoft', 'TypeScript'));
      for (const code of ['Code', 'Code - Insiders', 'Cursor']) {
        for (const sub of ['Cache', 'CachedData', 'CachedExtensionVSIXs', 'Code Cache', 'GPUCache', 'logs']) t.add(J(roaming, code, sub));
      }
      break;

    case 'windows-temp':
      if (!elevated) break;
      t.add(J(windows, 'Temp'));
      t.add(J(windows, 'SystemTemp'));
      t.add(J(windows, 'ServiceProfiles', 'LocalService', 'AppData', 'Local', 'Temp'));
      t.add(J(windows, 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Temp'));
      t.add(J(windows, 'System32', 'config', 'systemprofile', 'AppData', 'Local', 'Temp'));
      break;

    case 'windows-update-cache':
      if (elevated) t.add(J(windows, 'SoftwareDistribution', 'Download'));
      break;

    case 'delivery-optimization':
      if (elevated) t.add(J(windows, 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache'));
      break;

    case 'driver-leftovers':
      if (!elevated) break;
      t.add(J(p.systemDrive, 'AMD'));
      t.add(J(p.systemDrive, 'NVIDIA'));
      t.add(J(programData, 'NVIDIA Corporation', 'Downloader'));
      t.add(J(programData, 'AMD', 'PPC'));
      break;

    case 'system-logs':
      if (!elevated) break;
      for (const sub of ['CBS', 'DISM', 'WindowsUpdate', 'MoSetup', 'SIH', 'waasmedic', 'NetSetup', 'DPX', 'WinREAgent']) {
        t.add(J(windows, 'Logs', sub));
      }
      t.add(J(windows, 'Panther'));
      t.add(J(windows, 'SoftwareDistribution', 'DataStore', 'Logs'));
      t.add(J(windows, 'SoftwareDistribution', 'PostRebootEventCache.V2'));
      t.add(J(programData, 'Microsoft', 'Windows', 'WER', 'Temp'));
      break;

    case 'memory-dumps':
      if (!elevated) break;
      t.add(J(windows, 'MEMORY.DMP'), FILE);
      t.add(J(windows, 'Minidump'));
      t.add(J(windows, 'LiveKernelReports'));
      break;

    case 'prefetch':
      if (elevated) t.match(J(windows, 'Prefetch'), MATCH_FILES, '', '.pf');
      break;

    case 'font-cache':
      if (!elevated) break;
      t.match(J(windows, 'ServiceProfiles', 'LocalService', 'AppData', 'Local', 'FontCache'), MATCH_FILES, '', '.dat');
      t.add(J(local, 'FontCache'));
      break;

    case 'upgrade-leftovers':
      if (!elevated) break;
      for (const dir of ['$WINDOWS.~BT', '$WINDOWS.~WS', '$GetCurrent', '$SysReset', 'ESD']) t.add(J(p.systemDrive, dir), DIRECTORY);
      break;

    case 'component-store':
      if (elevated) t.special(COMMAND, { command: 'dism' });
      break;

    case 'windows-old':
      if (elevated) t.add(J(p.systemDrive, 'Windows.old'), DIRECTORY);
      break;

    default:
      break;
  }
  const out = t.unique();
  out.blocked = t.blocked;
  return out;
}

const path = require('path');
const PROTECTED = [path.dirname(process.execPath), process.resourcesPath || '', process.env.PORTABLE_EXECUTABLE_DIR || '']
  .filter(Boolean)
  .map((p) => J(p).toLowerCase());

function isProtected(p) {
  const lower = p.toLowerCase();
  return PROTECTED.some((keep) => keep === lower || keep.startsWith(lower + '\\'));
}

function matchName(name, prefix, suffix) {
  const n = name.toLowerCase();
  return n.length >= prefix.length + suffix.length && n.startsWith(prefix.toLowerCase()) && n.endsWith(suffix.toLowerCase());
}

function entriesOf(target) {
  return rawEntriesOf(target).filter((e) => !isProtected(e.path));
}

function rawEntriesOf(target) {
  switch (target.mode) {
    case CONTENTS:
      return fsx.isDir(target.path) ? fsx.list(target.path) : [];
    case DIRECTORY:
    case FILE: {
      const e = fsx.entryOf(target.path);
      return e ? [e] : [];
    }
    case MATCH_FILES:
    case MATCH_DIRS: {
      const wantDirs = target.mode === MATCH_DIRS;
      return fsx.isDir(target.path)
        ? fsx.list(target.path).filter((e) => e.dir === wantDirs && matchName(e.name, target.prefix || '', target.suffix || ''))
        : [];
    }
    default:
      return [];
  }
}

function recycleBin() {
  const info = { cbSize: 24 };
  if (fn.SHQueryRecycleBinW(null, info) < 0) return { bytes: 0, files: 0 };
  return { bytes: Math.max(Number(info.i64Size), 0), files: Math.max(Number(info.i64NumItems), 0) };
}

function availableIds(ids) {
  return (ids && ids.length ? ids : CATALOG.map((c) => c.id)).filter((id) => BY_ID.has(id));
}

async function scan(ids, { onProgress = () => {}, cancelled = () => false } = {}) {
  const elevated = isElevated();
  const list = availableIds(ids);
  const result = { totalBytes: 0, totalFiles: 0, entries: [] };
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) break;
    const id = list[i];
    onProgress({ id, index: i, total: list.length });
    const meta = BY_ID.get(id);
    const totals = { bytes: 0, files: 0 };
    let available = true;
    let measurable = true;
    let blocked = [];
    if (meta.admin && !elevated) {
      available = false;
    } else {
      const targets = buildTargets(id, elevated);
      blocked = targets.blocked || [];
      for (const target of targets) {
        if (cancelled()) break;
        if (target.mode === RECYCLE) {
          const rb = recycleBin();
          totals.bytes += rb.bytes;
          totals.files += rb.files;
        } else if (target.mode === COMMAND) {
          measurable = false;
        } else {
          for (const e of entriesOf(target)) await fsx.measure(e, totals, cancelled);
        }
      }
    }
    result.entries.push({ id, bytes: totals.bytes, files: totals.files, available, measurable, blocked });
    result.totalBytes += totals.bytes;
    result.totalFiles += totals.files;
  }
  return result;
}

async function clean(ids, { onProgress = () => {}, cancelled = () => false } = {}) {
  const elevated = isElevated();
  const list = availableIds(ids);
  const result = { bytes: 0, files: 0, directories: 0, skipped: 0, failures: 0, cancelled: false, notes: [], perAction: {} };
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) { result.cancelled = true; break; }
    const id = list[i];
    const meta = BY_ID.get(id);
    onProgress({ id, index: i, total: list.length });
    if (meta.admin && !elevated) { result.notes.push({ id, note: 'admin' }); continue; }
    const before = { bytes: result.bytes, files: result.files, dirs: result.directories, skipped: result.skipped, failures: result.failures };
    const targets = buildTargets(id, elevated);
    if (targets.blocked && targets.blocked.length) result.notes.push({ id, note: 'running', detail: targets.blocked.join(', ') });
    for (const target of targets) {
      if (cancelled()) { result.cancelled = true; break; }
      if (target.mode === RECYCLE) {
        const rb = recycleBin();
        const hr = fn.SHEmptyRecycleBinW(0, null, 0x1 | 0x2 | 0x4);
        if (hr < 0 && hr !== -2147418113) { result.failures++; result.notes.push({ id, note: 'recycle' }); }
        else { result.bytes += rb.bytes; result.files += rb.files; }
      } else if (target.mode === COMMAND) {
        const drive = ctxPaths().systemDrive;
        const freeBefore = (diskSpace(drive) || {}).free || 0;
        const r = await run(J(SYSTEM32, 'Dism.exe'), ['/Online', '/Cleanup-Image', '/StartComponentCleanup', '/NoRestart'], { timeout: 60 * 60_000 });
        const freeAfter = (diskSpace(drive) || {}).free || 0;
        if (r.code !== 0) { result.failures++; result.notes.push({ id, note: 'dism', detail: r.out.slice(-200) }); }
        result.bytes += Math.max(freeAfter - freeBefore, 0);
      } else {
        for (const e of entriesOf(target)) {
          if (cancelled()) { result.cancelled = true; break; }
          await fsx.remove(e, result, cancelled);
        }
      }
    }
    result.perAction[id] = {
      bytes: result.bytes - before.bytes,
      files: result.files - before.files,
      dirs: result.directories - before.dirs,
      skipped: result.skipped - before.skipped,
      failures: result.failures - before.failures,
    };
  }
  return result;
}

function catalog() {
  const elevated = isElevated();
  return CATALOG.map((c) => ({ ...c, locked: c.admin && !elevated, safe: c.risk === 0 && (!c.admin || elevated) }));
}

module.exports = { CATALOG, catalog, buildTargets, scan, clean, launcherInstalls };
