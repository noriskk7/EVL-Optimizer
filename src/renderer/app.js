'use strict';

(function () {
  const { h, icon, clear } = UI;
  const Pages = {};
  window.Pages = Pages;

  const NAV = [
    ['nav.overview', [['home', 'home']]],
    ['nav.optimize', [['memory', 'memory'], ['cleaner', 'broom'], ['processes', 'activity'], ['startup', 'rocket']]],
    ['nav.programs', [['uninstaller', 'package'], ['debloat', 'sparkles']]],
    ['nav.system', [['tweaks', 'sliders'], ['gamemode', 'gamepad'], ['restore', 'history'], ['benchmark', 'gauge'], ['logs', 'list']]],
  ];

  const listeners = new Map();
  const state = { info: null, settings: null, metrics: null, page: null, current: null, freeing: false, game: null };

  const App = {
    state,
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => listeners.get(evt).delete(fn);
    },
    emit(evt, payload) {
      for (const fn of listeners.get(evt) || []) {
        try { fn(payload); } catch (err) { console.error(err); }
      }
    },
    invoke: (...args) => window.evl.invoke(...args),
    t: (...a) => I18N.t(...a),

    async start() {
      const [info, settings] = await Promise.all([App.invoke('app:info'), App.invoke('settings:get')]);
      state.info = info;
      state.settings = settings;
      I18N.set(settings.lang, info.locale);
      Theme.apply(settings.theme);
      buildChrome();
      window.evl.on('metrics', (snap) => {
        state.metrics = snap;
        state.game = snap.game;
        updateChrome(snap);
        const page = state.current && Pages[state.page];
        if (page && page.metrics) page.metrics(snap);
        App.emit('metrics', snap);
      });
      window.evl.on('memory:progress', (p) => App.emit('memory:progress', p));
      window.evl.on('memory:auto', (p) => {
        UI.toast({ title: t('home.act.auto'), text: `${UI.bytes(p.freed)} ${t('mem.result')}`, icon: 'memory' });
      });
      window.evl.on('gamemode', (e) => {
        state.game = e.state;
        if (e.type === 'enter') UI.toast({ title: t('gm.enter', { game: e.game }), icon: 'gamepad' });
        if (e.type === 'leave') UI.toast({ title: t('gm.leave', { game: e.game }), icon: 'gamepad' });
        App.emit('gamemode', e);
        renderTitlePills();
      });
      window.evl.on('settings:changed', (s) => { state.settings = s; App.emit('settings', s); });
      const latest = await App.invoke('metrics:latest');
      if (latest && latest.t) { state.metrics = latest; state.game = latest.game; updateChrome(latest); }
      App.navigate('home');
      if (!settings.welcomed) App.showScam(true);
      App.checkUpdate();
    },

    scamCard() {
      return h('div', { class: 'scam' }, h('div', { class: 'big-ico' }, icon('shield')),
        h('div', null, h('h3', null, t('scam.title')), h('p', null, t('scam.text1')), h('p', null, t('scam.text2'))));
    },

    showScam(first) {
      if (first) App.saveSettings({ welcomed: true });
      const m = UI.modal({ title: t('scam.title'), iconName: 'heart', body: App.scamCard() });
      m.setTitle('EVL Optimizer');
      m.setFoot(
        h('button', { class: 'btn', onClick: () => App.invoke('shell:openExternal', 'https://evlcorp.lol') }, icon('globe'), t('scam.site')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary', onClick: () => m.close() }, t('scam.ok')));
    },

    fmt(key, vars = {}) {
      const out = {};
      for (const [k, v] of Object.entries(vars || {})) {
        if (v === null || v === undefined) out[k] = t('logs.absent');
        else if (/Bytes$/.test(k)) out[k] = UI.bytes(v);
        else if (/Key$/.test(k)) out[k] = t(v);
        else if (typeof v === 'number' && !/^(pid|code|seq)$/.test(k)) out[k] = UI.num(v, Number.isInteger(v) ? 0 : 1);
        else out[k] = v;
      }
      if (key === 'log.journal.item' && I18N.lang !== 'pt' && vars.title_en) out.title = vars.title_en;
      return t(key, out);
    },

    logToast(result, opts) {
      const logId = result && (result.logId || (Array.isArray(result) && result[0] && result[0].logId));
      UI.toast({ ...opts, action: logId ? { label: t('common.viewLog'), onClick: () => App.navigate('logs', { open: logId }) } : undefined });
    },

    navigate(id, params) {
      if (!Pages[id]) return;
      const prev = state.current;
      if (prev && prev.leave) { try { prev.leave(); } catch (err) { console.error(err); } }
      state.page = id;
      const content = document.getElementById('content');
      clear(content);
      const el = h('section', { class: 'page' });
      content.appendChild(el);
      const page = Pages[id];
      state.current = page;
      for (const btn of document.querySelectorAll('.nav-item')) btn.classList.toggle('active', btn.dataset.page === id);
      try {
        page.render(el, params || {});
      } catch (err) {
        console.error(err);
        el.appendChild(UI.empty('alert', t('common.failed'), String(err && err.message)));
      }
      if (state.metrics && page.metrics) page.metrics(state.metrics);
    },

    rerender() {
      buildChrome();
      if (state.metrics) updateChrome(state.metrics);
      App.navigate(state.page || 'home');
    },

    async saveSettings(patch) {
      const next = await App.invoke('settings:set', patch);
      if (next && next.error) {
        UI.toast({ title: t('common.failed'), text: next.error === 'admin' ? t('common.adminRequired') : t('set.startupFailed'), kind: 'danger' });
      }
      state.settings = next;
      App.emit('settings', next);
      return next;
    },

    async freeMemory() {
      if (state.freeing) return null;
      state.freeing = true;
      App.emit('free:start');
      updateFreeButtons();
      try {
        const r = await App.invoke('memory:free');
        if (r && r.before) {
          App.logToast(r, {
            title: r.freed > 32 * 1048576 ? `${UI.bytes(r.freed)} ${t('mem.result')}` : t('mem.resultZero'),
            text: r.freed > 32 * 1048576 ? t('mem.resultSub', { s: r.settleMs / 1000, before: UI.bytes(r.before.inUse), after: UI.bytes(r.after.inUse) }) : t('mem.resultZeroSub'),
            icon: 'memory',
          });
        }
        App.emit('free:done', r);
        return r;
      } finally {
        state.freeing = false;
        updateFreeButtons();
      }
    },

    adminBanner(el) {
      if (state.info.elevated) return null;
      const b = h('div', { class: 'banner' }, icon('lock'), h('span', null, t('shell.adminBanner')),
        h('button', { class: 'btn sm', onClick: () => App.invoke('app:relaunchAdmin') }, icon('shield'), t('shell.adminBtn')));
      if (el) el.appendChild(b);
      return b;
    },

    async checkUpdate() {
      const cfg = state.settings;
      if (!cfg.updateCheck || Date.now() - (cfg.updateLast || 0) < 24 * 3600 * 1000) return;
      const r = await App.invoke('update:check');
      if (!r || !r.ok) return;
      await App.saveSettings({ updateLast: Date.now(), updateLatest: r.available ? r.latest : '' });
      if (state.page === 'home') App.navigate('home');
    },

    updateBanner(el) {
      const cfg = state.settings;
      const v = cfg.updateLatest;
      const newer = (a, b) => {
        const x = String(a).split('.').map(Number);
        const y = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
        return false;
      };
      if (!cfg.updateCheck || !v || cfg.updateIgnored === v || !newer(v, state.info.version)) return null;
      const b = h('div', { class: 'banner' }, icon('arrowDown'), h('span', null, t('upd.text', { v })),
        h('button', { class: 'btn sm', onClick: () => App.invoke('shell:openExternal', 'https://evlcorp.lol/releases#evl-optimizer') }, icon('external'), t('upd.get')),
        h('button', { class: 'btn sm ghost', onClick: async () => { await App.saveSettings({ updateIgnored: v }); b.remove(); } }, t('upd.ignore')));
      if (el) el.appendChild(b);
      return b;
    },

    pageHead(el, title, subtitle, actions) {
      el.appendChild(h('div', { class: 'page-head' },
        h('div', null, h('h1', null, title), subtitle ? h('p', null, subtitle) : null),
        actions ? h('div', { class: 'actions' }, actions) : null));
    },
  };
  window.App = App;

  let ramValue;
  let ramMeter;
  let ramSub;
  let freeBtn;

  function buildChrome() {
    const bar = clear(document.getElementById('titlebar'));
    bar.appendChild(h('div', { class: 'brand' }, UI.logo(), 'EVL Optimizer', h('small', null, `v${state.info.version}`)));
    bar.appendChild(h('div', { class: 'spacer' }));
    bar.appendChild(h('div', { id: 'title-pills', class: 'row' }));
    renderTitlePills();

    const side = clear(document.getElementById('sidebar'));
    for (const [group, items] of NAV) {
      side.appendChild(h('div', { class: 'nav-group' }, t(group)));
      for (const [id, ic] of items) {
        side.appendChild(h('button', { class: 'nav-item', dataset: { page: id }, onClick: () => App.navigate(id) },
          icon(ic), h('span', null, t(`nav.${id}`)), id === 'gamemode' ? h('span', { class: 'dot hidden', id: 'gm-dot' }) : null));
      }
    }
    side.appendChild(h('div', { class: 'grow' }));
    side.appendChild(h('button', { class: 'nav-item', dataset: { page: 'settings' }, onClick: () => App.navigate('settings') }, icon('settings'), h('span', null, t('nav.settings'))));

    ramValue = h('span', { class: 'value' }, '—');
    ramMeter = UI.meter(0);
    ramSub = h('div', { class: 'tiny muted num', style: { marginTop: '6px' } }, '');
    freeBtn = h('button', { class: 'btn sm outline-accent', onClick: () => App.freeMemory() }, icon('zap'), t('shell.freeNow'));
    side.appendChild(h('div', { class: 'ram-card' },
      h('div', { class: 'row' }, h('span', { class: 'label' }, t('shell.ram')), ramValue), ramMeter, ramSub, freeBtn));
    updateFreeButtons();
  }

  function renderTitlePills() {
    const host = document.getElementById('title-pills');
    if (!host) return;
    clear(host);
    if (state.game) host.appendChild(h('span', { class: 'pill accent' }, h('span', { class: 'pulse' }), t('shell.game', { game: state.game.game })));
    if (state.info.elevated) host.appendChild(h('span', { class: 'pill' }, icon('shield'), t('shell.admin')));
    else host.appendChild(h('button', { class: 'pill warn', style: { cursor: 'pointer' }, onClick: () => App.invoke('app:relaunchAdmin') }, icon('lock'), t('shell.adminBtn')));
    const dot = document.getElementById('gm-dot');
    if (dot) dot.classList.toggle('hidden', !state.game);
  }

  function updateChrome(snap) {
    if (!ramValue || !snap.ram) return;
    ramValue.textContent = UI.pct(snap.ram.load);
    ramMeter.set(snap.ram.load, UI.levelClass(snap.ram.load));
    ramSub.textContent = `${UI.bytes(snap.ram.used)} / ${UI.bytes(snap.ram.total)}`;
    if (!!state.game !== !!document.querySelector('#title-pills .pulse')) renderTitlePills();
  }

  function updateFreeButtons() {
    if (!freeBtn) return;
    freeBtn.disabled = state.freeing;
    clear(freeBtn);
    freeBtn.append(state.freeing ? UI.spinner() : icon('zap'), state.freeing ? t('shell.freeing') : t('shell.freeNow'));
  }
})();
