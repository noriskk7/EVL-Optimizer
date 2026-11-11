'use strict';

const fs = require('fs');
const reg = require('./registry');
const { J, dataDir, readJson, writeJson, now, runConsole, powershell, run, SYSTEM32, oneLine } = require('./util');
const { isElevated, koffi } = require('./win32');
const fsx = require('./fsx');

const journalFile = () => J(dataDir(), 'tweaks.json');

function load() {
  const raw = readJson(journalFile(), []);
  return Array.isArray(raw) ? raw.filter((e) => e && e.key) : [];
}

function save(entries) {
  return writeJson(journalFile(), entries);
}

function forget(key) {
  save(load().filter((e) => e.key !== key));
}

const encodeValue = (v) => (Buffer.isBuffer(v) ? { hex: v.toString('hex') } : v);
const decodeValue = (v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.hex === 'string' ? Buffer.from(v.hex, 'hex') : v);
const sameValue = (a, b) => {
  if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) return Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b);
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b || String(a) === String(b);
};

const regKey = (root, subkey, name) => `reg:${root}\\${subkey}\\${name}`.toLowerCase();

function rememberRegistry(root, subkey, name, title, newValue) {
  const key = regKey(root, subkey, name);
  const current = reg.read(root, subkey, name);
  const entries = load();
  const existing = entries.find((e) => e.key === key);
  if (existing) {
    if (existing.data.exists && sameValue(decodeValue(existing.data.value), newValue)) forget(key);
    return;
  }
  if (current && sameValue(current.value, newValue)) return;
  const target = `${root}\\${subkey}\\${name}`;
  entries.push({
    key,
    title: title[0],
    title_en: title[1],
    target,
    target_en: target,
    kind: 'registry',
    data: { root, subkey, name, exists: !!current, type: current ? current.type : 0, value: current ? encodeValue(current.value) : null },
    applied_at: now(),
  });
  save(entries);
}

function setValue(root, subkey, name, type, value, title) {
  rememberRegistry(root, subkey, name, title, value);
  return reg.write(root, subkey, name, type, value);
}

function rememberSpecial(key, kind, data, title, target) {
  const entries = load();
  if (entries.some((e) => e.key === key)) return;
  entries.push({ key, title: title[0], title_en: title[1], target: target[0], target_en: target[1], kind, data, applied_at: now() });
  save(entries);
}

async function revertEntry(entry) {
  const needsAdmin = entry.kind === 'memory_compression' || entry.kind === 'hibernate' || entry.kind === 'task'
    || (entry.kind === 'registry' && entry.data.root === 'HKLM');
  if (needsAdmin && !isElevated()) return { ok: false, reason: 'admin' };
  let ok = false;
  let detail = '';
  switch (entry.kind) {
    case 'registry': {
      const d = entry.data;
      ok = d.exists ? reg.write(d.root, d.subkey, d.name, d.type, decodeValue(d.value)) : reg.deleteValue(d.root, d.subkey, d.name);
      const svc = /^SYSTEM\\CurrentControlSet\\Services\\([^\\]+)$/i.exec(d.subkey);
      if (ok && svc && d.name === 'Start' && d.exists && Number(decodeValue(d.value)) !== 4) {
        await run(J(SYSTEM32, 'sc.exe'), ['start', svc[1]], { timeout: 30_000 });
      }
      break;
    }
    case 'power_plan': {
      const r = await runConsole(`powercfg /setactive ${entry.data.guid}`);
      ok = r.code === 0;
      detail = ok ? '' : oneLine(r.out, 160);
      break;
    }
    case 'memory_compression': {
      const r = await powershell('Disable-MMAgent -MemoryCompression', { timeout: 60_000 });
      ok = r.code === 0;
      detail = ok ? '' : oneLine(r.out, 160);
      break;
    }
    case 'hibernate': {
      const r = await runConsole(`powercfg /hibernate ${entry.data.enabled ? 'on' : 'off'}`);
      ok = r.code === 0;
      if (ok && entry.data.enabled && entry.data.type) await runConsole(`powercfg /hibernate /type ${entry.data.type}`);
      detail = ok ? '' : oneLine(r.out, 160);
      break;
    }
    case 'task': {
      const r = await run(J(SYSTEM32, 'schtasks.exe'), ['/change', '/tn', entry.data.name, '/enable'], { timeout: 30_000 });
      ok = r.code === 0;
      detail = ok ? '' : oneLine(r.out, 160);
      break;
    }
    default:
      detail = 'unknown';
  }
  if (ok) forget(entry.key);
  return { ok, detail };
}

const D = reg.REG_DWORD;
const S = reg.REG_SZ;
const ADV = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const CDM = 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';

const TWEAKS = [
  { id: 'game-mode', group: 'performance', title: ['Ativar Modo de Jogo do Windows', 'Enable Windows Game Mode'], values: [
    ['HKCU', 'Software\\Microsoft\\GameBar', 'AllowAutoGameMode', D, 1],
    ['HKCU', 'Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', D, 1],
  ] },
  { id: 'game-dvr-off', group: 'performance', title: ['Desligar gravação em segundo plano (Game DVR)', 'Turn off background recording (Game DVR)'], values: [
    ['HKCU', 'System\\GameConfigStore', 'GameDVR_Enabled', D, 0],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', D, 0],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AudioCaptureEnabled', D, 0],
  ] },
  { id: 'games-priority', group: 'performance', admin: true, title: ['Prioridade de CPU e GPU para jogos', 'CPU and GPU priority for games'], values: [
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'GPU Priority', D, 8],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Priority', D, 6],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'Scheduling Category', S, 'High'],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', 'SFIO Priority', S, 'High'],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness', D, 10],
  ] },
  { id: 'hags', group: 'performance', admin: true, restart: true, title: ['Agendamento de GPU por hardware (HAGS)', 'Hardware-accelerated GPU scheduling (HAGS)'], values: [
    ['HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', D, 2],
  ] },
  { id: 'menu-delay', group: 'performance', title: ['Menus abrindo sem atraso', 'Menus open without delay'], values: [
    ['HKCU', 'Control Panel\\Desktop', 'MenuShowDelay', S, '100'],
  ] },
  { id: 'transparency-off', group: 'performance', title: ['Desligar transparência das janelas', 'Turn off window transparency'], values: [
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', D, 0],
  ] },

  { id: 'background-apps-off', group: 'memory', title: ['Impedir apps da Store em segundo plano', 'Stop Store apps running in the background'], values: [
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', D, 1],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BackgroundAppGlobalToggle', D, 0],
  ] },
  { id: 'browser-memory-saver', group: 'memory', title: ['Economia de memória no Chrome, Edge e Brave', 'Memory saver in Chrome, Edge and Brave'], values: [
    ['HKCU', 'Software\\Policies\\Google\\Chrome', 'HighEfficiencyModeEnabled', D, 1],
    ['HKCU', 'Software\\Policies\\BraveSoftware\\Brave', 'HighEfficiencyModeEnabled', D, 1],
    ['HKCU', 'Software\\Policies\\Microsoft\\Edge', 'SleepingTabsEnabled', D, 1],
    ['HKCU', 'Software\\Policies\\Microsoft\\Edge', 'SleepingTabsTimeout', D, 900],
    ['HKCU', 'Software\\Policies\\Microsoft\\Edge', 'StartupBoostEnabled', D, 0],
    ['HKCU', 'Software\\Policies\\Microsoft\\Edge', 'BackgroundModeEnabled', D, 0],
  ] },
  { id: 'sysmain-off', group: 'memory', admin: true, title: ['Desligar o SysMain (Superfetch)', 'Turn off SysMain (Superfetch)'], values: [
    ['HKLM', 'SYSTEM\\CurrentControlSet\\Services\\SysMain', 'Start', D, 4],
  ], after: async () => { await run(J(SYSTEM32, 'sc.exe'), ['stop', 'SysMain'], { timeout: 30_000 }); } },

  { id: 'ads-off', group: 'privacy', title: ['Desligar ID de anúncios e experiências personalizadas', 'Turn off advertising ID and tailored experiences'], values: [
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', D, 0],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', D, 0],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'Start_TrackProgs', D, 0],
  ] },
  { id: 'suggestions-off', group: 'privacy', title: ['Sem sugestões, dicas e apps instalados sozinhos', 'No suggestions, tips or silently installed apps'], values: [
    ['HKCU', CDM, 'SilentInstalledAppsEnabled', D, 0],
    ['HKCU', CDM, 'SystemPaneSuggestionsEnabled', D, 0],
    ['HKCU', CDM, 'SoftLandingEnabled', D, 0],
    ['HKCU', CDM, 'PreInstalledAppsEnabled', D, 0],
    ['HKCU', CDM, 'OemPreInstalledAppsEnabled', D, 0],
    ['HKCU', CDM, 'RotatingLockScreenOverlayEnabled', D, 0],
    ['HKCU', CDM, 'SubscribedContent-338387Enabled', D, 0],
    ['HKCU', CDM, 'SubscribedContent-338388Enabled', D, 0],
    ['HKCU', CDM, 'SubscribedContent-338389Enabled', D, 0],
    ['HKCU', CDM, 'SubscribedContent-353694Enabled', D, 0],
    ['HKCU', CDM, 'SubscribedContent-353696Enabled', D, 0],
    ['HKCU', ADV, 'Start_IrisRecommendations', D, 0],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', 'ScoobeSystemSettingEnabled', D, 0],
  ] },
  { id: 'bing-search-off', group: 'privacy', title: ['Tirar a Bing da pesquisa do Iniciar', 'Remove Bing from Start search'], values: [
    ['HKCU', 'Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', D, 1],
    ['HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BingSearchEnabled', D, 0],
  ] },
  { id: 'telemetry-min', group: 'privacy', admin: true, title: ['Telemetria no mínimo', 'Telemetry at the minimum'], values: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'DoNotShowFeedbackNotifications', D, 1],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowDeviceNameInTelemetry', D, 0],
  ] },
  { id: 'consumer-features-off', group: 'privacy', admin: true, title: ['Bloquear apps patrocinados do Windows', 'Block sponsored Windows apps'], values: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsConsumerFeatures', D, 1],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableConsumerAccountStateContent', D, 1],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableCloudOptimizedContent', D, 1],
  ] },

  { id: 'copilot-off', group: 'ai', title: ['Desligar o Copilot do Windows', 'Turn off Windows Copilot'], values: [
    ['HKCU', 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', D, 1],
    ['HKCU', ADV, 'ShowCopilotButton', D, 0],
  ], adminValues: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', D, 1],
  ] },
  { id: 'recall-off', group: 'ai', title: ['Desligar Recall e Click to Do', 'Turn off Recall and Click to Do'], values: [
    ['HKCU', 'Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', D, 1],
  ], adminValues: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', D, 1],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'AllowRecallEnablement', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableClickToDo', D, 1],
  ] },
  { id: 'edge-ai-off', group: 'ai', admin: true, title: ['Tirar o Copilot e as compras do Edge', 'Remove Copilot and shopping from Edge'], values: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'HubsSidebarEnabled', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'CopilotPageContext', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'EdgeShoppingAssistantEnabled', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'PersonalizationReportingEnabled', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Edge', 'ShowRecommendationsEnabled', D, 0],
  ] },
  { id: 'ai-apps-off', group: 'ai', admin: true, title: ['Desligar a IA do Paint e do Bloco de Notas', 'Turn off AI in Paint and Notepad'], values: [
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint', 'DisableCocreator', D, 1],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint', 'DisableGenerativeFill', D, 1],
    ['HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Paint', 'DisableImageCreator', D, 1],
    ['HKLM', 'SOFTWARE\\Policies\\WindowsNotepad', 'DisableAIFeatures', D, 1],
  ] },
  { id: 'widgets-off', group: 'ai', admin: true, title: ['Desligar Widgets e notícias da barra', 'Turn off Widgets and taskbar news'], values: [
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', D, 0],
    ['HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Feeds', 'EnableFeeds', D, 0],
  ] },
  { id: 'chat-icon-off', group: 'ai', title: ['Tirar Chat e Visão de Tarefas da barra', 'Remove Chat and Task View from the taskbar'], values: [
    ['HKCU', ADV, 'TaskbarMn', D, 0],
    ['HKCU', ADV, 'ShowTaskViewButton', D, 0],
  ] },
];

const BY_ID = new Map(TWEAKS.map((t) => [t.id, t]));

function valuesFor(tweak, elevated) {
  return [...tweak.values, ...(elevated && tweak.adminValues ? tweak.adminValues : [])];
}

function isApplied(tweak) {
  return valuesFor(tweak, true).every(([root, sub, name, , value]) => {
    const cur = reg.read(root, sub, name);
    return cur && sameValue(cur.value, value);
  });
}

function hasJournal(tweak, entries) {
  return valuesFor(tweak, true).some(([root, sub, name]) => entries.some((e) => e.key === regKey(root, sub, name)));
}

function list() {
  const elevated = isElevated();
  const entries = load();
  return TWEAKS.map((t) => ({
    id: t.id,
    group: t.group,
    admin: !!t.admin,
    restart: !!t.restart,
    locked: !!t.admin && !elevated,
    applied: isApplied(t),
    revertible: hasJournal(t, entries),
  }));
}

function show(v) {
  if (!v) return null;
  const x = v.value;
  if (Buffer.isBuffer(x)) return `hex:${x.toString('hex').slice(0, 24)}${x.length > 12 ? '…' : ''}`;
  if (Array.isArray(x)) return x.join(' | ');
  return String(x);
}

async function apply(id) {
  const tweak = BY_ID.get(id);
  if (!tweak) return { ok: false, reason: 'unknown' };
  const elevated = isElevated();
  if (tweak.admin && !elevated) return { ok: false, reason: 'admin' };
  const changes = [];
  for (const [root, sub, name, type, value] of valuesFor(tweak, elevated)) {
    const before = reg.read(root, sub, name);
    setValue(root, sub, name, type, value, tweak.title);
    const after = reg.read(root, sub, name);
    changes.push({ target: `${root}\\${sub}\\${name}`, before: show(before), after: show(after), ok: !!after && sameValue(after.value, value) });
  }
  const ok = changes.every((c) => c.ok);
  if (ok && tweak.after) await tweak.after();
  notifySettingsChanged();
  return { ok, restart: !!tweak.restart, changes };
}

async function revert(id) {
  const tweak = BY_ID.get(id);
  if (!tweak) return { ok: false, reason: 'unknown' };
  const keys = new Set(valuesFor(tweak, true).map(([root, sub, name]) => regKey(root, sub, name)));
  const changes = [];
  for (const entry of load().filter((e) => keys.has(e.key))) {
    const d = entry.data;
    const before = reg.read(d.root, d.subkey, d.name);
    const r = await revertEntry(entry);
    const after = reg.read(d.root, d.subkey, d.name);
    const verified = d.exists ? !!after && sameValue(after.value, decodeValue(d.value)) : !after;
    changes.push({ target: `${d.root}\\${d.subkey}\\${d.name}`, before: show(before), after: show(after), ok: r.ok && verified });
  }
  notifySettingsChanged();
  return { ok: changes.every((c) => c.ok), changes };
}

let sendMessageTimeout = null;
function notifySettingsChanged() {
  try {
    if (!sendMessageTimeout) {
      sendMessageTimeout = koffi.load('user32.dll').func('uintptr_t SendMessageTimeoutW(uintptr_t hwnd, uint32 msg, uintptr_t w, str16 l, uint32 flags, uint32 timeout, void *result)');
    }
    for (const area of ['Policy', 'TraySettings', 'ImmersiveColorSet']) sendMessageTimeout(0xffff, 0x001a, 0, area, 0x0002, 1000, null);
  } catch {  }
}

function hibernateState() {
  const power = 'SYSTEM\\CurrentControlSet\\Control\\Power';
  const enabled = reg.read('HKLM', power, 'HibernateEnabled');
  const type = reg.read('HKLM', power, 'HiberFileType');
  const drive = (process.env.SystemDrive || 'C:') + '\\';
  const file = fsx.list(drive.slice(0, 2)).find((e) => e.name.toLowerCase() === 'hiberfil.sys');
  const on = enabled ? enabled.value !== 0 : !!file;
  const mode = !on ? 'off' : type && type.value === 1 ? 'reduced' : 'full';
  return { mode, enabled: on, bytes: file ? file.size : 0, ram: require('os').totalmem(), locked: !isElevated() };
}

async function setHibernate(mode) {
  if (!isElevated()) return { ok: false, reason: 'admin' };
  const before = hibernateState();
  if (before.mode === mode) return { ok: true, before, after: before };
  const commands = mode === 'off' ? ['powercfg /hibernate off']
    : ['powercfg /hibernate on', `powercfg /hibernate /type ${mode === 'reduced' ? 'reduced' : 'full'}`];
  let out = '';
  let ok = true;
  for (const c of commands) {
    const r = await runConsole(c);
    out += r.out;
    ok = ok && r.code === 0;
  }
  const after = hibernateState();
  ok = ok && after.mode === mode;
  if (ok) {
    const entries = load();
    const saved = entries.find((e) => e.key === 'hibernate');
    if (!saved) {
      rememberSpecial('hibernate', 'hibernate', { enabled: before.enabled, type: before.mode === 'reduced' ? 'reduced' : 'full' },
        ['Hibernação', 'Hibernation'], [`hibernação antes: ${before.mode}`, `hibernation before: ${before.mode}`]);
    } else if ((saved.data.enabled ? (saved.data.type || 'full') : 'off') === mode) {
      forget('hibernate');
    }
  }
  return { ok, before, after, detail: ok ? '' : oneLine(out, 160) };
}

module.exports = {
  load,
  forget,
  setValue,
  rememberRegistry,
  rememberSpecial,
  revertEntry,
  list,
  apply,
  revert,
  isApplied,
  TWEAKS,
  hibernateState,
  setHibernate,
  notifySettingsChanged,
  fsExists: (p) => fs.existsSync(p),
};
