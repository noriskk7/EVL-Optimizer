'use strict';

(function () {
  const ACCENTS = [
    ['orange', '#ff8a3d'], ['yellow', '#f5c542'], ['green', '#2dd48a'], ['cyan', '#22d3ee'],
    ['blue', '#4f8cff'], ['purple', '#9b7bff'], ['pink', '#f472b6'], ['red', '#ff5c5c'],
  ];

  const BACKGROUNDS = {
    carbon: { bg: '#0c0a09', bg2: '#110e0c', panel: '#171311', panel2: '#1d1815', panel3: '#241e1a', hover: '#2a231e', tint: '255 214 180', text: '#f6efe9', text2: '#bdb1a6', text3: '#83776c', text4: '#5d534a' },
    forest: { bg: '#070b0a', bg2: '#0a100e', panel: '#0f1714', panel2: '#131d19', panel3: '#18241f', hover: '#1a2722', tint: '170 230 200', text: '#e9f4ef', text2: '#a7bcb2', text3: '#6c8379', text4: '#4b5f56' },
    graphite: { bg: '#0d0f12', bg2: '#111418', panel: '#161a1f', panel2: '#1b2026', panel3: '#21272e', hover: '#242b33', tint: '200 215 235', text: '#eef2f7', text2: '#aab4c0', text3: '#737e8b', text4: '#545e69' },
    midnight: { bg: '#070a14', bg2: '#0a0e1b', panel: '#0f1524', panel2: '#131a2c', panel3: '#192136', hover: '#1c2540', tint: '170 190 255', text: '#eaf0ff', text2: '#a8b3d1', text3: '#6b7697', text4: '#4b5573' },
    oled: { bg: '#000000', bg2: '#050505', panel: '#0b0b0b', panel2: '#111111', panel3: '#171717', hover: '#1b1b1b', tint: '255 255 255', text: '#f2f2f2', text2: '#b3b3b3', text3: '#777777', text4: '#555555' },
    light: { bg: '#eef1f0', bg2: '#f6f8f7', panel: '#ffffff', panel2: '#f4f7f6', panel3: '#e9eeec', hover: '#e3e9e6', tint: '20 50 40', text: '#0f1a15', text2: '#3e5249', text3: '#66786f', text4: '#93a39b', light: true },
  };

  const DEFAULT = { accent: '#ff8a3d', bg: 'carbon', scale: 1, radius: 'round', density: 'comfortable', motion: true, glow: true };

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    const n = parseInt(m ? m[1] : '2dd48a', 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }

  function hslToRgb([h, s, l]) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }

  function normalize(theme) {
    const t = { ...DEFAULT, ...(theme || {}) };
    if (!BACKGROUNDS[t.bg]) t.bg = DEFAULT.bg;
    t.scale = Math.min(Math.max(Number(t.scale) || 1, 0.85), 1.25);
    return t;
  }

  function apply(theme) {
    const t = normalize(theme);
    const bg = BACKGROUNDS[t.bg];
    const root = document.documentElement.style;
    const accent = hexToRgb(t.accent);
    const [h, s, l] = rgbToHsl(accent);
    const accent2 = hslToRgb([h - 18, s, Math.max(l - 0.06, 0.2)]);
    const hi = bg.light ? mix(accent, [0, 0, 0], 0.22) : mix(accent, [255, 255, 255], 0.22);
    const ink = hslToRgb([h, Math.min(s, 0.7), 0.08]);
    const set = (k, v) => root.setProperty(k, v);
    set('--accent', toHex(accent));
    set('--accent-rgb', accent.map(Math.round).join(' '));
    set('--accent-hi', toHex(hi));
    set('--accent-2', toHex(accent2));
    set('--accent2-rgb', accent2.map(Math.round).join(' '));
    set('--accent-ink', toHex(ink));
    set('--accent-soft', `rgb(${accent.map(Math.round).join(' ')} / ${bg.light ? 0.14 : 0.12})`);
    set('--accent-line', `rgb(${accent.map(Math.round).join(' ')} / 0.34)`);
    set('--bg', bg.bg);
    set('--bg-2', bg.bg2);
    set('--panel', bg.panel);
    set('--panel-2', bg.panel2);
    set('--panel-3', bg.panel3);
    set('--hover', bg.hover);
    set('--tint', bg.tint);
    set('--text', bg.text);
    set('--text-2', bg.text2);
    set('--text-3', bg.text3);
    set('--text-4', bg.text4);
    set('--shadow', bg.light ? '0 1px 2px rgba(0,0,0,0.05), 0 8px 24px rgba(20,40,30,0.08)' : '0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 32px rgba(0,0,0,0.32)');
    root.colorScheme = bg.light ? 'light' : 'dark';
    const square = t.radius === 'square';
    set('--radius', square ? '7px' : '16px');
    set('--radius-sm', square ? '5px' : '11px');
    set('--radius-xs', square ? '4px' : '8px');
    const body = document.body.classList;
    body.toggle('compact', t.density === 'compact');
    body.toggle('no-motion', !t.motion);
    body.toggle('no-glow', !t.glow);
    body.toggle('square', square);
    body.toggle('light', !!bg.light);
    if (window.evl) window.evl.invoke('app:theme', { zoom: t.scale, color: bg.bg, symbol: bg.text3 }).catch(() => {});
    return t;
  }

  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff8a3d';

  window.Theme = { ACCENTS, BACKGROUNDS, DEFAULT, apply, normalize, accent };
})();
