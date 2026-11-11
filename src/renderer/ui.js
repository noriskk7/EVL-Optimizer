'use strict';

(function () {
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
    memory: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    broom: '<path d="M15 3.5 20.5 9"/><path d="M14 5.5 18.5 10l-4.6 4.6a1.8 1.8 0 0 1-2.5 0l-2-2a1.8 1.8 0 0 1 0-2.5z"/><path d="m9.3 13.2-5.8 5.8 1.5 1.5 5.8-5.8"/><path d="M3 16.5 5 18.5M5.5 14l1 1"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3c1-4 4-8 10-9 0 0 1 0 2 1s1 2 1 2c-1 6-5 9-9 10z"/><circle cx="15" cy="9" r="1.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
    package: '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
    sparkles: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    gamepad: '<path d="M7 10h4M9 8v4"/><circle cx="15.5" cy="10.5" r=".9"/><circle cx="17.5" cy="13" r=".9"/><path d="M6.5 5.5h11A4.5 4.5 0 0 1 22 10l-1 6.5a3 3 0 0 1-5.2 1.6L14 16h-4l-1.8 2.1A3 3 0 0 1 3 16.5L2 10a4.5 4.5 0 0 1 4.5-4.5z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.5 18a10 10 0 1 1 17 0"/><circle cx="12" cy="14" r="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    minusCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    shortcut: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9 15l4-4M10 11h3v3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.4"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-6 10-8"/>',
    power: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r=".8"/>',
    disk: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5 13l2.5-8h9L19 13"/><path d="M7 16.5h.5M10 16.5h.5"/>',
    gpu: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><path d="M15 10h3M15 14h3M6 18v2M18 18v2"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.4L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.4L20 16"/><path d="M20 20v-4h-4"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13v1M15 13v1M9 17h6"/><circle cx="12" cy="3.5" r=".8"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.2 8.2 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    bag: '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.5M3.5 12h.5M3.5 18h.5"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 1 1 1 2 2 2 0-2.5 0-4.5 1-7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    windows: '<path d="M3.5 5.8 10.5 4.8v6.7h-7zM12 4.6 20.5 3.4v8.1H12zM3.5 13h7v6.7l-7-1zM12 13h8.5v8.1L12 19.9z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    service: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.5M7 17h.5"/>',
    task: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  };

  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="evl-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a211b"/><stop offset="1" stop-color="#0d0a08"/></linearGradient><linearGradient id="evl-arc" x1="60" y1="200" x2="200" y2="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffcf7a"/><stop offset="0.55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#e2461c"/></linearGradient><linearGradient id="evl-bolt" x1="0" y1="86" x2="0" y2="192" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd9b3"/></linearGradient></defs><rect x="4" y="4" width="248" height="248" rx="60" fill="url(#evl-bg)"/><rect x="6.5" y="6.5" width="243" height="243" rx="57.5" fill="none" stroke="#ff8a3d" stroke-opacity="0.25" stroke-width="5"/><path d="M77.09 188.91 A72 72 0 1 1 178.91 188.91" fill="none" stroke="#3a2c23" stroke-width="22" stroke-linecap="round"/><path d="M77.09 188.91 A72 72 0 1 1 194.52 110.45" fill="none" stroke="url(#evl-arc)" stroke-width="22" stroke-linecap="round"/><path d="M138 86 L98 146 H124 L114 192 L158 128 H132 Z" fill="url(#evl-bolt)"/></svg>';

  function icon(name, cls) {
    const wrap = document.createElement('span');
    wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="ic${cls ? ` ${cls}` : ''}">${ICONS[name] || ''}</svg>`;
    return wrap.firstChild;
  }

  function logo() {
    const wrap = document.createElement('span');
    wrap.innerHTML = LOGO;
    return wrap.firstChild;
  }

  function append(el, kids) {
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) append(el, kid);
      else if (kid instanceof Node) el.appendChild(kid);
      else el.appendChild(document.createTextNode(String(kid)));
    }
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'checked' || k === 'disabled' || k === 'value' || k === 'indeterminate' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }

  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  const locale = () => (window.I18N ? I18N.locale() : 'en-US');

  function bytes(n, digits) {
    const v = Math.max(Number(n) || 0, 0);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let x = v;
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
    const d = digits !== undefined ? digits : (i === 0 ? 0 : x >= 100 ? 0 : 1);
    return `${x.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })} ${units[i]}`;
  }

  const pct = (f, d = 0) => `${(Math.max(0, Math.min(1, f || 0)) * 100).toLocaleString(locale(), { maximumFractionDigits: d })}%`;
  const num = (n, d = 0) => (Number(n) || 0).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const rate = (bps) => `${bytes(bps)}/s`;

  function duration(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${hh}h`;
    if (hh) return `${hh}h ${mm}min`;
    return `${mm} min`;
  }

  function date(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function ago(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return I18N.t('time.now');
    if (s < 3600) return I18N.t('time.min', { n: Math.round(s / 60) });
    if (s < 86400) return I18N.t('time.hour', { n: Math.round(s / 3600) });
    return I18N.t('time.day', { n: Math.round(s / 86400) });
  }

  const levelColor = (f) => (f >= 0.9 ? 'var(--danger)' : f >= 0.75 ? 'var(--warn)' : 'var(--accent)');
  const levelClass = (f) => (f >= 0.9 ? 'danger' : f >= 0.75 ? 'warn' : '');

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    if (!w || !hgt) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    return { ctx, w, h: hgt };
  }

  function path(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
  }

  function chart(canvas, series, opts = {}) {
    const c = setupCanvas(canvas);
    if (!c) return;
    const { ctx, w, h: H } = c;
    const pad = opts.pad === undefined ? 2 : opts.pad;
    const points = opts.points || Math.max(...series.map((s) => s.data.length), 2);
    let max = opts.max;
    if (max === undefined) max = Math.max(1, ...series.flatMap((s) => s.data)) * 1.15;
    if (opts.grid) {
      ctx.strokeStyle = 'rgba(170,230,200,0.06)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = Math.round((H / 4) * i) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
    for (const s of series) {
      const data = s.data.slice(-points);
      if (data.length < 2) continue;
      const step = w / (points - 1);
      const offset = (points - data.length) * step;
      const pts = data.map((v, i) => [offset + i * step, H - pad - (Math.min(v, max) / max) * (H - pad * 2)]);
      if (s.fill !== false) {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, hexA(s.color, 0.32));
        g.addColorStop(1, hexA(s.color, 0));
        ctx.beginPath();
        path(ctx, pts);
        ctx.lineTo(pts[pts.length - 1][0], H);
        ctx.lineTo(pts[0][0], H);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.beginPath();
      path(ctx, pts);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }

  function ring(size = 150, stroke = 12) {
    const r = (size - stroke) / 2;
    const len = 2 * Math.PI * r;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    const mk = (cls) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', size / 2);
      c.setAttribute('cy', size / 2);
      c.setAttribute('r', r);
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke-width', stroke);
      c.setAttribute('class', cls);
      return c;
    };
    const track = mk('ring-track');
    const bar = mk('ring-bar');
    bar.setAttribute('stroke-dasharray', len);
    bar.setAttribute('stroke-dashoffset', len);
    bar.setAttribute('stroke', 'var(--accent)');
    svg.append(track, bar);
    const center = h('div', { class: 'center' });
    const el = h('div', { class: 'ring', style: { width: `${size}px`, height: `${size}px` } }, svg, center);
    el.update = (f, color) => {
      bar.setAttribute('stroke-dashoffset', len * (1 - Math.max(0, Math.min(1, f))));
      if (color) bar.setAttribute('stroke', color);
    };
    el.center = center;
    return el;
  }

  function meter(fraction, cls = '') {
    const bar = h('i', { style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` } });
    const el = h('div', { class: `meter ${cls}` }, bar);
    el.set = (f, c) => {
      bar.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`;
      if (c !== undefined) el.className = `meter ${c}`;
    };
    return el;
  }

  function sw(checked, onChange, disabled) {
    const input = h('input', { type: 'checkbox', checked: !!checked, disabled: !!disabled });
    input.addEventListener('change', () => onChange && onChange(input.checked, input));
    const el = h('label', { class: 'switch' }, input, h('span', { class: 'track' }), h('span', { class: 'thumb' }));
    el.input = input;
    return el;
  }

  function seg(options, value, onChange) {
    const el = h('div', { class: 'seg' });
    const render = (v) => {
      clear(el);
      for (const [val, label] of options) {
        el.appendChild(h('button', { class: val === v ? 'on' : '', onClick: () => { render(val); onChange(val); } }, label));
      }
    };
    render(value);
    return el;
  }

  function spinner() {
    return icon('refresh', 'spin');
  }

  function toast({ title, text, kind = 'ok', icon: ic, action }) {
    let host = document.querySelector('.toasts');
    if (!host) { host = h('div', { class: 'toasts' }); document.body.appendChild(host); }
    const name = ic || (kind === 'warn' ? 'alert' : kind === 'danger' ? 'xCircle' : 'checkCircle');
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
    const btn = action ? h('button', { class: 'btn sm act', onClick: (e) => { e.stopPropagation(); close(); action.onClick(); } }, action.label) : null;
    const el = h('div', { class: `toast ${kind}` }, icon(name), h('div', null, h('b', null, title), text ? h('span', null, text) : null, btn));
    host.appendChild(el);
    el.addEventListener('click', close);
    setTimeout(close, action ? 9000 : kind === 'danger' ? 8000 : 5000);
  }

  function modal({ title, iconName, iconKind, body, foot, wide, onClose, closable = true, steps }) {
    const bodyEl = h('div', { class: 'modal-body' });
    const footEl = h('div', { class: 'modal-foot' });
    const stepsEl = steps ? h('div', { class: 'wizard-steps' }) : null;
    const titleEl = h('h2', null, title);
    const closeBtn = closable ? h('button', { class: 'btn ghost icon x', onClick: () => api.close() }, icon('x')) : null;
    const box = h('div', { class: `modal${wide ? ' wide' : ''}` },
      h('div', { class: 'modal-head' }, iconName ? h('div', { class: `card-icon ${iconKind || ''}` }, icon(iconName)) : null, titleEl, closeBtn),
      stepsEl, bodyEl, footEl);
    const back = h('div', { class: 'modal-back' }, box);
    let closed = false;
    const api = {
      el: box,
      setBody(...nodes) { clear(bodyEl); append(bodyEl, nodes); },
      setFoot(...nodes) { clear(footEl); append(footEl, nodes); footEl.classList.toggle('hidden', !nodes.flat().filter(Boolean).length); },
      setTitle(t) { titleEl.textContent = t; },
      setStep(i, total) {
        if (!stepsEl) return;
        clear(stepsEl);
        for (let k = 0; k < total; k++) stepsEl.appendChild(h('i', { class: k <= i ? 'on' : '' }));
      },
      setClosable(v) { if (closeBtn) closeBtn.classList.toggle('hidden', !v); api.closable = v; },
      closable,
      close() {
        if (closed) return;
        closed = true;
        back.remove();
        document.removeEventListener('keydown', onKey);
        if (onClose) onClose();
      },
    };
    const onKey = (e) => { if (e.key === 'Escape' && api.closable) api.close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back && api.closable) api.close(); });
    api.setBody(body);
    api.setFoot(foot || []);
    if (steps) api.setStep(0, steps);
    document.body.appendChild(back);
    return api;
  }

  function confirm({ title, text, ok, cancel, danger, iconName }) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title,
        iconName: iconName || (danger ? 'alert' : 'info'),
        iconKind: danger ? 'danger' : 'info',
        body: typeof text === 'string' ? h('p', { class: 'dim', style: { margin: '0', whiteSpace: 'pre-line' } }, text) : text,
        onClose: () => { if (!done) resolve(false); },
      });
      m.setFoot(
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', onClick: () => { done = true; resolve(false); m.close(); } }, cancel || I18N.t('common.cancel')),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => { done = true; resolve(true); m.close(); } }, ok || I18N.t('common.ok')),
      );
    });
  }

  function empty(iconName, title, text, action) {
    return h('div', { class: 'empty' }, icon(iconName), h('b', null, title), text ? h('span', null, text) : null, action || null);
  }

  function appIcon(src, name, size = '') {
    const el = h('div', { class: `app-icon ${size}` });
    if (src) el.appendChild(h('img', { src, alt: '' }));
    else el.appendChild(h('span', { class: 'ph' }, (String(name || '?').trim()[0] || '?').toUpperCase()));
    return el;
  }

  const iconCache = new Map();
  const pending = new Set();
  let timer = null;
  const waiters = [];
  function loadIcon(file, cb) {
    if (!file) return cb('');
    if (iconCache.has(file)) return cb(iconCache.get(file));
    pending.add(file);
    waiters.push([file, cb]);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const files = [...pending];
      pending.clear();
      const list = waiters.splice(0);
      let res = {};
      try { res = await window.evl.invoke('icons:get', files); } catch { res = {}; }
      for (const f of files) iconCache.set(f, res[f] || '');
      for (const [f, fn] of list) fn(iconCache.get(f) || '');
    }, 30);
  }

  function lazyIcon(file, name, size) {
    const el = appIcon('', name, size);
    loadIcon(file, (src) => {
      if (!src) return;
      clear(el);
      el.appendChild(h('img', { src, alt: '' }));
    });
    return el;
  }

  window.UI = {
    h, icon, logo, clear, append, bytes, pct, num, rate, duration, date, ago, levelColor, levelClass,
    chart, ring, meter, sw, seg, spinner, toast, modal, confirm, empty, appIcon, lazyIcon, loadIcon, hexA,
  };
})();
