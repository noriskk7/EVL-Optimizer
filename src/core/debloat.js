'use strict';

const fs = require('fs');
const appx = require('./appx');
const tweaks = require('./tweaks');
const reg = require('./registry');
const { J, env, SYSTEM_ROOT, SYSTEM32, dataDir, now, run, powershell } = require('./util');
const { isElevated } = require('./win32');

const CDM = 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
const ORCH = 'SOFTWARE\\Microsoft\\WindowsUpdate\\Orchestrator\\UScheduler_Oobe';
const RUN = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const INBOX_KEY = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Appx\\AppxAllUserStore\\InboxApplications';

const ITEMS = [
  { id: 'bing-apps', group: 'apps', on: true, packages: ['Microsoft.BingNews', 'Microsoft.BingWeather', 'Microsoft.BingFinance', 'Microsoft.BingSports', 'Microsoft.BingTranslator', 'Microsoft.BingFoodAndDrink', 'Microsoft.BingHealthAndFitness', 'Microsoft.BingTravel', 'Microsoft.BingSearch', 'Microsoft.News'] },
  { id: 'office-hub', group: 'apps', on: true, packages: ['Microsoft.MicrosoftOfficeHub', 'Microsoft.Office.OneNote', 'Microsoft.Office.Sway'] },
  { id: 'solitaire', group: 'apps', on: true, packages: ['Microsoft.MicrosoftSolitaireCollection'] },
  { id: 'tips-help', group: 'apps', on: true, packages: ['Microsoft.GetHelp', 'Microsoft.Getstarted', 'Microsoft.WindowsFeedbackHub'] },
  { id: 'clipchamp', group: 'apps', on: true, packages: ['Clipchamp.Clipchamp'] },
  { id: 'people-maps', group: 'apps', on: true, packages: ['Microsoft.People', 'Microsoft.WindowsMaps', 'Microsoft.Messaging', 'Microsoft.OneConnect', 'Microsoft.Wallet'], services: ['MapsBroker', 'WalletService'] },
  { id: 'todo-automate', group: 'apps', on: true, packages: ['Microsoft.Todos', 'Microsoft.PowerAutomateDesktop', 'Microsoft.Windows.DevHome'], keys: [{ root: 'HKLM', path: `${ORCH}\\DevHomeUpdate` }] },
  { id: 'old-media', group: 'apps', on: true, packages: ['Microsoft.ZuneVideo', 'Microsoft.MixedReality.Portal', 'Microsoft.Microsoft3DViewer', 'Microsoft.MSPaint', 'Microsoft.Print3D', 'Microsoft.SkypeApp', 'Microsoft.NetworkSpeedTest'] },
  { id: 'cortana', group: 'apps', on: true, packages: ['Microsoft.549981C3F5F10'] },
  { id: 'family', group: 'apps', on: true, packages: ['MicrosoftCorporationII.MicrosoftFamily'], services: ['WpcMonSvc'] },
  { id: 'sponsored-games', group: 'apps', on: true, packages: ['*CandyCrush*', 'king.com.*', '*BubbleWitch*', '*MarchofEmpires*', '*Asphalt8*', '*HiddenCity*', '*FarmVille*', '*CaesarsSlots*', '*COOKINGFEVER*', '*RoyalRevolt*', '*DisneyMagicKingdoms*', '*Minecraft*Trial*', '*SolitaireCollection*'] },
  { id: 'sponsored-apps', group: 'apps', on: true, packages: ['*Netflix*', '*TikTok*', '*Instagram*', 'Facebook.*', '*Twitter*', '*LinkedIn*', 'AmazonVideo.PrimeVideo', '*Disney*', '*Hulu*', '*PicsArt*', '*Duolingo*', '*Flipboard*', '*Shazam*', 'AdobeSystemsIncorporated.AdobePhotoshopExpress', '*Plex*', '*SlingTV*', '*McAfee*', '*Booking*'], keys: [{ root: 'HKCU', path: `${CDM}\\Subscriptions` }, { root: 'HKCU', path: `${CDM}\\SuggestedApps` }] },
  { id: 'teams', group: 'apps', on: true, packages: ['MicrosoftTeams', 'MSTeams'] },
  { id: 'outlook-mail', group: 'apps', on: true, packages: ['Microsoft.OutlookForWindows', 'microsoft.windowscommunicationsapps'], keys: [{ root: 'HKLM', path: `${ORCH}\\OutlookUpdate` }] },
  { id: 'onedrive', group: 'apps', on: true, special: 'onedrive', keys: [{ root: 'HKCU', path: RUN, name: 'OneDriveSetup' }, { root: 'HKLM', path: `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run`, name: 'OneDriveSetup' }] },
  { id: 'xbox', group: 'apps', on: true, packages: ['Microsoft.GamingApp', 'Microsoft.XboxApp', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxGameOverlay', 'Microsoft.XboxSpeechToTextOverlay', 'Microsoft.Xbox.TCUI', 'Microsoft.XboxIdentityProvider', 'Microsoft.Edge.GameAssist'] },

  { id: 'copilot', group: 'ai', on: true, packages: ['Microsoft.Copilot', 'Microsoft.Windows.Ai.Copilot.Provider', 'MicrosoftWindows.Client.CoPilot'], tweaks: ['copilot-off'] },
  { id: 'recall', group: 'ai', on: true, tweaks: ['recall-off'], special: 'recall' },
  { id: 'edge-ai', group: 'ai', on: true, tweaks: ['edge-ai-off'] },
  { id: 'ai-apps', group: 'ai', on: true, tweaks: ['ai-apps-off'] },

  { id: 'widgets', group: 'ads', on: true, packages: ['MicrosoftWindows.Client.WebExperience'], tweaks: ['widgets-off'] },
  { id: 'start-ads', group: 'ads', on: true, tweaks: ['suggestions-off', 'consumer-features-off'], keys: [{ root: 'HKCU', path: `${CDM}\\Subscriptions` }, { root: 'HKCU', path: `${CDM}\\SuggestedApps` }] },
  { id: 'ads-id', group: 'ads', on: true, tweaks: ['ads-off'] },
  { id: 'bing-search', group: 'ads', on: true, tweaks: ['bing-search-off'] },
  { id: 'taskbar-clean', group: 'ads', on: true, tweaks: ['chat-icon-off'] },

  { id: 'telemetry', group: 'telemetry', on: true, tweaks: ['telemetry-min'], special: 'telemetry' },

  { id: 'phone-link', group: 'optional', on: false, packages: ['Microsoft.YourPhone', 'MicrosoftWindows.CrossDevice'], services: ['PhoneSvc'] },
  { id: 'spotify', group: 'optional', on: false, packages: ['SpotifyAB.SpotifyMusic'] },
  { id: 'sticky-notes', group: 'optional', on: false, packages: ['Microsoft.MicrosoftStickyNotes', 'Microsoft.MicrosoftJournal', 'Microsoft.Whiteboard'] },
];

const KEEP = ['Microsoft.WindowsNotepad'];

const TELEMETRY_SERVICES = ['DiagTrack', 'dmwappushservice', 'wisvc', 'RetailDemo'];
const TELEMETRY_TASKS = [
  '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
  '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClient',
  '\\Microsoft\\Windows\\Feedback\\Siuf\\DmClientOnScenarioDownload',
];

function oneDriveSetup() {
  const candidates = [J(SYSTEM32, 'OneDriveSetup.exe'), J(SYSTEM_ROOT, 'SysWOW64', 'OneDriveSetup.exe')];
  const local = J(env('LOCALAPPDATA'), 'Microsoft', 'OneDrive');
  try {
    for (const v of fs.readdirSync(local)) candidates.push(J(local, v, 'OneDriveSetup.exe'));
  } catch {  }
  return candidates.find((p) => fs.existsSync(p)) || '';
}

const oneDriveInstalled = () => fs.existsSync(J(env('LOCALAPPDATA'), 'Microsoft', 'OneDrive', 'OneDrive.exe'))
  || fs.existsSync(J(env('ProgramFiles'), 'Microsoft OneDrive', 'OneDrive.exe'));

async function status() {
  const elevated = isElevated();
  const patterns = [...new Set(ITEMS.flatMap((i) => i.packages || []))];
  const installed = await appx.installedMatching(patterns);
  const tw = new Map(tweaks.list().map((t) => [t.id, t]));
  const like = (name, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i').test(name);
  return ITEMS.map((item) => {
    const present = (item.packages || []).flatMap((p) => installed.filter((n) => like(n, p)));
    const pendingTweaks = (item.tweaks || []).filter((id) => tw.has(id) && !tw.get(id).applied);
    const lockedTweaks = (item.tweaks || []).filter((id) => tw.has(id) && tw.get(id).locked);
    let specialPending = false;
    if (item.special === 'onedrive') specialPending = oneDriveInstalled();
    if (item.special === 'telemetry') {
      specialPending = TELEMETRY_SERVICES.some((s) => {
        const v = reg.read('HKLM', `SYSTEM\\CurrentControlSet\\Services\\${s}`, 'Start');
        return v && v.value !== 4;
      });
    }
    const keyPending = (item.keys || []).some((k) => (k.name ? !!reg.read(k.root, k.path, k.name) : reg.exists(k.root, k.path)));
    const servicePending = (item.services || []).some((s) => {
      const v = reg.read('HKLM', `SYSTEM\\CurrentControlSet\\Services\\${s}`, 'Start');
      return !!v && v.value !== 4;
    });
    specialPending = specialPending || keyPending || servicePending;
    const needsAdmin = lockedTweaks.length > 0 || ['onedrive', 'telemetry', 'recall'].includes(item.special)
      || (item.keys || []).some((k) => k.root === 'HKLM') || (item.services || []).length > 0;
    return {
      id: item.id,
      group: item.group,
      on: item.on,
      present: [...new Set(present)],
      pendingTweaks,
      specialPending,
      done: present.length === 0 && pendingTweaks.length === 0 && !specialPending,
      locked: needsAdmin && !elevated,
    };
  });
}

async function runSpecial(kind, onProgress) {
  const steps = [];
  switch (kind) {
    case 'recall': {
      onProgress({ phase: 'recall' });
      const r = await powershell("$f = Get-WindowsOptionalFeature -Online -FeatureName 'Recall' -ErrorAction SilentlyContinue; if ($f -and $f.State -eq 'Enabled') { Disable-WindowsOptionalFeature -Online -FeatureName 'Recall' -NoRestart -Remove -ErrorAction SilentlyContinue | Out-Null; $f = Get-WindowsOptionalFeature -Online -FeatureName 'Recall' -ErrorAction SilentlyContinue }; if ($f) { [string]$f.State } else { 'absent' }", { timeout: 10 * 60_000 });
      const state = r.out.trim().split(/\r?\n/).pop() || 'absent';
      steps.push({ key: 'log.deb.recall', vars: { state }, ok: state !== 'Enabled' });
      break;
    }
    case 'telemetry': {
      onProgress({ phase: 'telemetry' });
      for (const s of TELEMETRY_SERVICES) {
        const path = `SYSTEM\\CurrentControlSet\\Services\\${s}`;
        if (!reg.exists('HKLM', path)) continue;
        tweaks.setValue('HKLM', path, 'Start', reg.REG_DWORD, 4, [`Serviço de telemetria: ${s}`, `Telemetry service: ${s}`]);
        await run(J(SYSTEM32, 'sc.exe'), ['stop', s], { timeout: 30_000 });
        const start = reg.read('HKLM', path, 'Start');
        steps.push({ key: 'log.deb.service', vars: { name: s }, ok: !!start && start.value === 4 });
      }
      for (const task of TELEMETRY_TASKS) {
        const r = await run(J(SYSTEM32, 'schtasks.exe'), ['/change', '/tn', task, '/disable'], { timeout: 30_000 });
        if (r.code === 0) {
          tweaks.rememberSpecial(`task:${task.toLowerCase()}`, 'task', { name: task },
            [`Tarefa de telemetria: ${task.split('\\').pop()}`, `Telemetry task: ${task.split('\\').pop()}`], [task, task]);
        }
        const q = await run(J(SYSTEM32, 'schtasks.exe'), ['/query', '/tn', task, '/fo', 'csv', '/nh'], { timeout: 30_000 });
        if (q.code !== 0) continue;
        const disabled = /disabled|desabilitad/i.test(q.out);
        steps.push({ key: 'log.deb.task', vars: { name: task.split('\\').pop() }, ok: disabled });
      }
      break;
    }
    case 'onedrive': {
      onProgress({ phase: 'onedrive' });
      await run(J(SYSTEM32, 'taskkill.exe'), ['/f', '/im', 'OneDrive.exe'], { timeout: 15_000 });
      const setup = oneDriveSetup();
      if (setup) await run(setup, ['/uninstall'], { timeout: 5 * 60_000 });
      steps.push({ key: 'log.deb.onedrive', vars: {}, ok: !oneDriveInstalled() });
      break;
    }
    default:
      break;
  }
  return { ok: steps.every((s) => s.ok), steps };
}

async function cleanupItems(chosen, report, onProgress) {
  const steps = report.cleanup;
  if (!isElevated()) return;
  onProgress({ phase: 'cleanup' });

  const targets = [];
  const seen = new Set();
  const add = (t) => {
    const id = `${t.root}\\${t.path}|${t.name || ''}`.toLowerCase();
    if (!seen.has(id)) { seen.add(id); targets.push(t); }
  };
  for (const item of chosen) for (const k of item.keys || []) add(k);

  const gone = new Set((report.removed || []).map((n) => String(n).toLowerCase()));
  const still = new Set((report.remaining || []).map((n) => String(n).toLowerCase()));
  for (const sub of reg.subkeys('HKLM', INBOX_KEY)) {
    const name = sub.split('_')[0].toLowerCase();
    if (gone.has(name) && !still.has(name)) add({ root: 'HKLM', path: `${INBOX_KEY}\\${sub}` });
  }

  const dir = J(dataDir(), 'backups');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {  }
  const stamp = now().replace(/[: ]/g, '-');
  let n = 0;
  const exported = new Set();
  for (const t of targets) {
    const present = t.name ? !!reg.read(t.root, t.path, t.name) : reg.exists(t.root, t.path);
    if (!present) continue;
    const full = `${t.root}\\${t.path}`;
    if (!exported.has(full)) {
      exported.add(full);
      await run(J(SYSTEM32, 'reg.exe'), ['export', full, J(dir, `${stamp} debloat ${++n}.reg`), '/y'], { timeout: 60_000 });
    }
    const ok = t.name ? reg.deleteValue(t.root, t.path, t.name) : reg.deleteTree(t.root, t.path);
    const stillThere = t.name ? !!reg.read(t.root, t.path, t.name) : reg.exists(t.root, t.path);
    steps.push({ key: t.name ? 'log.deb.value' : 'log.deb.key', vars: { name: t.name ? `${full}\\${t.name}` : full }, ok: ok && !stillThere });
  }

  for (const name of [...new Set(chosen.flatMap((i) => i.services || []))]) {
    const path = `SYSTEM\\CurrentControlSet\\Services\\${name}`;
    const start = reg.read('HKLM', path, 'Start');
    if (!start || start.value === 4) continue;
    tweaks.setValue('HKLM', path, 'Start', reg.REG_DWORD, 4, [`Serviço: ${name}`, `Service: ${name}`]);
    await run(J(SYSTEM32, 'sc.exe'), ['stop', name], { timeout: 30_000 });
    const after = reg.read('HKLM', path, 'Start');
    steps.push({ key: 'log.deb.service', vars: { name }, ok: !!after && after.value === 4 });
  }
}

async function runDebloat(ids, { onProgress = () => {} } = {}) {
  const chosen = ITEMS.filter((i) => ids.includes(i.id));
  const report = { removed: [], failed: [], remaining: [], tweaks: [], specials: [], cleanup: [] };

  const packages = [...new Set(chosen.flatMap((i) => i.packages || []))];
  if (packages.length) {
    const r = await appx.removePackages(packages, { onProgress, keep: KEEP });
    report.removed = r.removed;
    report.failed = r.failed;
    onProgress({ phase: 'verify' });
    report.remaining = (await appx.installedMatching(packages)).filter((n) => !KEEP.includes(n));
  }

  for (const item of chosen) {
    for (const id of item.tweaks || []) {
      onProgress({ phase: 'tweak', id });
      const r = await tweaks.apply(id);
      report.tweaks.push({ id, ok: r.ok, reason: r.reason, changes: r.changes || [] });
    }
  }

  for (const item of chosen.filter((i) => i.special)) {
    if (!isElevated()) { report.specials.push({ id: item.id, ok: false, reason: 'admin', steps: [] }); continue; }
    const r = await runSpecial(item.special, onProgress);
    report.specials.push({ id: item.id, ok: r.ok, steps: r.steps });
  }
  await cleanupItems(chosen, report, onProgress);
  tweaks.notifySettingsChanged();
  return report;
}

async function restartExplorer() {
  await run(J(SYSTEM32, 'taskkill.exe'), ['/f', '/im', 'explorer.exe'], { timeout: 15_000 });
  const { spawn } = require('child_process');
  spawn(J(SYSTEM_ROOT, 'explorer.exe'), [], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

module.exports = { ITEMS, status, runDebloat, restartExplorer };
