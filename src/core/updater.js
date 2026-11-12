'use strict';

const { net, app } = require('electron');

const REPO = 'noriskk7/EVL-Optimizer';
const DOWNLOAD_PAGE = 'https://evlcorp.lol/releases#evl-optimizer';

const parts = (v) => String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);

function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function redirectTarget() {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const req = net.request({ method: 'HEAD', url: `https://github.com/${REPO}/releases/latest`, redirect: 'manual' });
    const timer = setTimeout(() => { finish(''); try { req.abort(); } catch {  } }, 10_000);
    req.on('redirect', (_status, _method, url) => { finish(url); try { req.abort(); } catch {  } });
    req.on('response', (res) => { res.on('data', () => {}); res.on('end', () => finish('')); });
    req.on('error', () => finish(''));
    req.end();
  });
}

async function check() {
  const current = app.getVersion();
  try {
    const url = await redirectTarget();
    const m = /\/releases\/tag\/v?(\d+(?:\.\d+){0,3})$/.exec(url);
    if (!m) return { ok: false, current };
    return { ok: true, current, latest: m[1], available: isNewer(m[1], current), url: DOWNLOAD_PAGE };
  } catch {
    return { ok: false, current };
  }
}

module.exports = { check, isNewer };
