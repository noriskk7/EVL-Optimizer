'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const J = path.win32.join;
const env = (name) => process.env[name] || '';
const SYSTEM_ROOT = env('SystemRoot') || env('windir') || 'C:\\Windows';
const SYSTEM32 = J(SYSTEM_ROOT, 'System32');

function dataDir() {
  const dir = J(env('APPDATA') || J(env('USERPROFILE'), 'AppData', 'Roaming'), 'Evl Optimizer');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {  }
  return dir;
}

const CP850 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00AD±‗¾¶§÷¸°¨·¹³²■\u00A0';
function decodeOutput(b) {
  if (!b || !b.length) return '';
  const text = b.toString('utf8');
  if (!text.includes('\uFFFD') || CP850.length !== 128) return text;
  let out = '';
  for (const byte of b) out += byte < 128 ? String.fromCharCode(byte) : CP850[byte - 128];
  return out;
}

function run(file, args = [], { timeout = 60_000, cwd } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }, (error, stdout, stderr) => {
      const decode = (b) => decodeOutput(b);
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : -1) : 0,
        timedOut: !!(error && error.killed),
        out: decode(stdout) + decode(stderr),
      });
    });
  });
}

function runConsole(command, { timeout = 60_000 } = {}) {
  return run(J(SYSTEM32, 'cmd.exe'), ['/d', '/s', '/c', `chcp 65001>nul & ${command}`], { timeout });
}

function powershell(script, { timeout = 120_000 } = {}) {
  const prefix = "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);";
  return run(J(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', prefix + script], { timeout });
}

const oneLine = (text, max = 240) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

const now = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

module.exports = { J, env, SYSTEM_ROOT, SYSTEM32, dataDir, run, runConsole, powershell, oneLine, readJson, writeJson, now };
