'use strict';

const fs = require('fs');
const { J, env, powershell, oneLine } = require('./util');
const { isElevated, loadIndirectString } = require('./win32');
const fsx = require('./fsx');

const PROTECTED = [
  'Microsoft.WindowsStore', 'Microsoft.StorePurchaseApp', 'Microsoft.DesktopAppInstaller', 'Microsoft.SecHealthUI',
  'Microsoft.Windows.ShellExperienceHost', 'Microsoft.Windows.StartMenuExperienceHost', 'Microsoft.AAD.BrokerPlugin',
  'Microsoft.AccountsControl', 'Microsoft.Windows.CloudExperienceHost', 'Microsoft.LockApp', 'Microsoft.UI.Xaml',
  'Microsoft.VCLibs', 'Microsoft.NET', 'Microsoft.WindowsAppRuntime', 'Microsoft.Windows.Search', 'MicrosoftWindows.Client.CBS',
  'MicrosoftWindows.Client.Core', 'Microsoft.Windows.SecHealthUI', 'Microsoft.WebExperience', 'windows.immersivecontrolpanel',
  'Microsoft.Windows.ContentDeliveryManager', 'Microsoft.Win32WebViewHost', 'Microsoft.Windows.Apprep.ChxApp',
  'Microsoft.Windows.AssignedAccessLockApp', 'Microsoft.Windows.OOBENetworkCaptivePortal', 'Microsoft.Windows.OOBENetworkConnectionFlow',
  'Microsoft.Windows.ParentalControls', 'Microsoft.Windows.PeopleExperienceHost', 'Microsoft.Windows.PinningConfirmationDialog',
  'Microsoft.Windows.XGpuEjectDialog', 'Microsoft.XboxGameCallableUI', 'MicrosoftWindows.UndockedDevKit', 'NcsiUwpApp',
  'Microsoft.WindowsAppSDK', 'Microsoft.Services.Store.Engagement', 'Microsoft.Advertising.Xaml', 'Microsoft.ECApp',
  'Microsoft.CredDialogHost', 'Microsoft.BioEnrollment', 'Microsoft.MicrosoftEdge', 'Microsoft.MicrosoftEdgeDevToolsClient',
  'Microsoft.Windows.NarratorQuickStart', 'Microsoft.Windows.CapturePicker', 'Microsoft.Windows.PrintQueueActionCenter',
  'MicrosoftWindows.Client.FileExp', 'Microsoft.Windows.CallingShellApp', 'Microsoft.WidgetsPlatformRuntime',
  'MicrosoftWindows.Client.AIX', 'MicrosoftWindows.Client.OOBE', 'Microsoft.ApplicationCompatibilityEnhancements',
];

const isProtected = (name) => PROTECTED.some((p) => name.toLowerCase() === p.toLowerCase() || name.toLowerCase().startsWith(p.toLowerCase() + '.'));

const prettify = (name) => name
  .replace(/^(Microsoft|MicrosoftCorporationII|MicrosoftWindows|Windows)\./i, '')
  .replace(/^[0-9A-F]{4,}\./i, '')
  .replace(/\./g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .trim();

function resolveName(raw, pkg) {
  if (!raw) return '';
  if (!raw.startsWith('ms-resource:')) return raw;
  const key = raw.slice('ms-resource:'.length);
  const tries = [];
  if (key.startsWith('//')) tries.push(`ms-resource:${key}`);
  else if (key.startsWith('/')) tries.push(`ms-resource://${pkg.Name}${key}`);
  else if (key.includes('/')) tries.push(`ms-resource://${pkg.Name}/${key}`, `ms-resource://${pkg.Name}/resources/${key}`);
  else tries.push(`ms-resource://${pkg.Name}/resources/${key}`, `ms-resource://${pkg.Name}/${key}`);
  for (const uri of tries) {
    const text = loadIndirectString(`@{${pkg.PackageFullName}?${uri}}`);
    if (text && !text.startsWith('ms-resource:')) return text;
  }
  return '';
}

function logoFile(location, relative) {
  if (!location || !relative) return '';
  const full = J(location, relative);
  if (fsx.exists(full)) return full;
  const dir = full.slice(0, full.lastIndexOf('\\'));
  const base = full.slice(full.lastIndexOf('\\') + 1).replace(/\.png$/i, '').toLowerCase();
  const files = fsx.list(dir).filter((e) => !e.dir && e.name.toLowerCase().startsWith(base) && e.name.toLowerCase().endsWith('.png'));
  if (!files.length) return '';
  const score = (n) => {
    const s = n.toLowerCase();
    if (s.includes('targetsize-48_altform-unplated')) return 0;
    if (s.includes('targetsize-48')) return 1;
    if (s.includes('scale-200')) return 2;
    if (s.includes('targetsize-64')) return 3;
    if (s.includes('scale-100')) return 4;
    if (s.includes('contrast')) return 9;
    return 5;
  };
  files.sort((a, b) => score(a.name) - score(b.name));
  return files[0].path;
}

function readManifest(location) {
  try {
    const xml = fs.readFileSync(J(location, 'AppxManifest.xml'), 'utf8');
    const display = /<Properties>[\s\S]*?<DisplayName>([\s\S]*?)<\/DisplayName>/i.exec(xml);
    const square = /Square44x44Logo="([^"]+)"/i.exec(xml);
    const logo = /<Properties>[\s\S]*?<Logo>([\s\S]*?)<\/Logo>/i.exec(xml);
    const visualName = /<uap:VisualElements[^>]*DisplayName="([^"]+)"/i.exec(xml);
    return {
      displayName: display ? display[1].trim() : '',
      visualName: visualName ? visualName[1].trim() : '',
      logo: square ? square[1] : logo ? logo[1].trim() : '',
      hasApp: /<Application\s/i.test(xml),
    };
  } catch {
    return { displayName: '', visualName: '', logo: '', hasApp: false };
  }
}

async function listApps({ includeSystem = false } = {}) {
  const script = `
$items = @(Get-AppxPackage -PackageTypeFilter Main | Where-Object { -not $_.IsFramework } | ForEach-Object {
  [pscustomobject]@{
    Name = $_.Name; PackageFullName = $_.PackageFullName; PackageFamilyName = $_.PackageFamilyName
    Publisher = $_.Publisher; Version = [string]$_.Version; InstallLocation = $_.InstallLocation
    NonRemovable = [bool]$_.NonRemovable; SignatureKind = [string]$_.SignatureKind
  }
})
ConvertTo-Json -InputObject $items -Compress -Depth 3`;
  const r = await powershell(script, { timeout: 120_000 });
  let raw = [];
  try { raw = JSON.parse(r.out.trim() || '[]'); } catch { return { ok: false, detail: oneLine(r.out), apps: [] }; }
  if (!Array.isArray(raw)) raw = [raw];
  const apps = [];
  for (const pkg of raw) {
    if (!pkg || !pkg.Name) continue;
    const component = /LanguageExperiencePack|Ink\.Handwriting|Winget\.Source|\.ShellExtension$|^Microsoft\.(HEIF|HEVC|VP9|AV1|WebMedia|WebpImage|RawImage|MPEG2)/i.test(pkg.Name);
    const system = pkg.SignatureKind === 'System' || pkg.NonRemovable || isProtected(pkg.Name) || component;
    if (system && !includeSystem) continue;
    const manifest = pkg.InstallLocation ? readManifest(pkg.InstallLocation) : {};
    if (!manifest.hasApp && !includeSystem) continue;
    const name = resolveName(manifest.displayName, pkg) || resolveName(manifest.visualName, pkg) || prettify(pkg.Name);
    let publisher = (/CN=([^,]+)/.exec(pkg.Publisher || '') || [, ''])[1].replace(/"/g, '');
    if (/^[0-9a-f-]{20,}$/i.test(publisher)) publisher = (/O=([^,]+)/.exec(pkg.Publisher || '') || [, ''])[1].replace(/"/g, '');
    if (/^[0-9a-f-]{20,}$/i.test(publisher)) publisher = '';
    apps.push({
      id: pkg.PackageFullName,
      name,
      packageName: pkg.Name,
      family: pkg.PackageFamilyName,
      publisher: /microsoft/i.test(publisher) ? 'Microsoft Corporation' : publisher,
      version: pkg.Version,
      location: pkg.InstallLocation,
      logo: logoFile(pkg.InstallLocation, manifest.logo),
      store: pkg.SignatureKind === 'Store',
      system,
      protected: isProtected(pkg.Name) || pkg.NonRemovable,
    });
  }
  apps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { ok: true, apps };
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function removePackages(names, { onProgress = () => {}, keep = [] } = {}) {
  const elevated = isElevated();
  const list = names.filter((n) => n && !isProtected(n.replace(/\*/g, '')));
  if (!list.length) return { ok: true, removed: [], failed: [] };
  onProgress({ phase: 'appx', total: list.length });
  const script = `
$names = @(${list.map(psQuote).join(',')})
$protected = @(${[...PROTECTED, ...keep].map(psQuote).join(',')})
$all = ${elevated ? '$true' : '$false'}
$out = @()
foreach ($n in $names) {
  $pkgs = if ($all) { @(Get-AppxPackage -AllUsers -Name $n) } else { @(Get-AppxPackage -Name $n) }
  foreach ($p in $pkgs) {
    if ($p.NonRemovable -or $p.IsFramework -or ($protected | Where-Object { $p.Name -eq $_ -or $p.Name -like ($_ + '.*') })) { continue }
    try {
      if ($all) { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop }
      else { Remove-AppxPackage -Package $p.PackageFullName -ErrorAction Stop }
      $out += [pscustomobject]@{ name = $p.Name; ok = $true; error = '' }
    } catch {
      $out += [pscustomobject]@{ name = $p.Name; ok = $false; error = $_.Exception.Message }
    }
  }
  if ($all) {
    Get-AppxProvisionedPackage -Online | Where-Object { $_.DisplayName -like $n -and $protected -notcontains $_.DisplayName } | ForEach-Object {
      try { Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -AllUsers -ErrorAction Stop | Out-Null } catch {}
    }
  }
}
ConvertTo-Json -InputObject @($out) -Compress`;
  const r = await powershell(script, { timeout: 30 * 60_000 });
  let rows = [];
  try { rows = JSON.parse(r.out.trim().split(/\r?\n/).pop() || '[]'); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [rows];
  const removed = rows.filter((x) => x && x.ok).map((x) => x.name);
  for (const name of removed) {
    for (const e of fsx.list(J(env('LOCALAPPDATA'), 'Packages'))) {
      if (e.dir && e.name.toLowerCase().startsWith(name.toLowerCase() + '_')) {
        await fsx.remove(e, { bytes: 0, files: 0, directories: 0, skipped: 0, failures: 0 }, () => false);
      }
    }
  }
  return { ok: r.code === 0, removed, failed: rows.filter((x) => x && !x.ok), detail: r.code === 0 ? '' : oneLine(r.out) };
}

async function installedMatching(patterns) {
  const script = `
$names = @(${patterns.map(psQuote).join(',')})
$found = @()
$pkgs = @(Get-AppxPackage${isElevated() ? ' -AllUsers' : ''})
foreach ($n in $names) { foreach ($p in $pkgs) { if ($p.Name -like $n) { $found += $p.Name } } }
ConvertTo-Json -InputObject @($found | Sort-Object -Unique) -Compress`;
  const r = await powershell(script, { timeout: 120_000 });
  try {
    const v = JSON.parse(r.out.trim() || '[]');
    return Array.isArray(v) ? v : [v];
  } catch {
    return [];
  }
}

module.exports = { listApps, removePackages, installedMatching, isProtected, PROTECTED };
