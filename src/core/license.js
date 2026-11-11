'use strict';

const { powershell } = require('./util');
const reg = require('./registry');

const STATUS = { 0: 'unlicensed', 1: 'licensed', 2: 'grace', 3: 'grace', 4: 'grace', 5: 'notification', 6: 'grace' };

const SCRIPT = `
$all = @(Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL")
$p = $all | Sort-Object @{ e = { if ($_.LicenseStatus -eq 1) { 0 } else { 1 } } } | Select-Object -First 1
$s = Get-CimInstance SoftwareLicensingService
[pscustomobject]@{
  found = [bool]$p
  name = [string]$p.Name
  description = [string]$p.Description
  status = [int]$p.LicenseStatus
  partialKey = [string]$p.PartialProductKey
  graceMinutes = [int64]$p.GracePeriodRemaining
  kms = [string]$p.KeyManagementServiceMachine
  kmsDiscovered = [string]$p.DiscoveredKeyManagementServiceMachineName
  channel = [string]$p.ProductKeyChannel
  oemKey = -not [string]::IsNullOrEmpty($s.OA3xOriginalProductKey)
} | ConvertTo-Json -Compress`;

function channelOf(d) {
  const text = `${d.channel} ${d.description}`.toLowerCase();
  if (/kmsclient|gvlk/.test(text)) return 'kms';
  if (/mak/.test(text)) return 'mak';
  if (/oem/.test(text)) return 'oem';
  if (/retail/.test(text)) return 'retail';
  return 'other';
}

let cache = null;

async function check({ fresh = false } = {}) {
  if (cache && !fresh && Date.now() - cache.at < 10 * 60_000) return cache.value;
  const r = await powershell(SCRIPT, { timeout: 60_000 });
  let d = null;
  try { d = JSON.parse(r.out.trim().split(/\r?\n/).pop()); } catch { d = null; }
  const cv = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
  let edition = reg.readString('HKLM', cv, 'ProductName') || 'Windows';
  if (Number(reg.readString('HKLM', cv, 'CurrentBuild')) >= 22000) edition = edition.replace('Windows 10', 'Windows 11');
  if (!d || !d.found) {
    const value = { ok: !!d, status: d ? 'unlicensed' : 'unknown', edition, channel: null, partialKey: '', oemKey: d ? d.oemKey : false };
    cache = { at: Date.now(), value };
    return value;
  }
  const channel = channelOf(d);
  const kmsHost = d.kms || d.kmsDiscovered || '';
  const graceDays = d.graceMinutes > 0 ? Math.round(d.graceMinutes / 1440) : 0;
  const localKms = /^(127\.|localhost|::1|0\.0\.0\.0)/i.test(kmsHost);
  const value = {
    ok: true,
    status: STATUS[d.status] || 'unknown',
    code: d.status,
    edition,
    channel,
    partialKey: d.partialKey,
    graceDays,
    kmsHost,
    oemKey: !!d.oemKey,
    unofficial: channel === 'kms' && (localKms || graceDays > 200),
  };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { check };
