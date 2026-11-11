'use strict';

(function () {
  const { h, icon, clear } = UI;

  Pages.settings = {
    render(el) {
      this.el = el;
      this.tab = this.tab || 'general';
      App.pageHead(el, t('set.title'), t('set.subtitle'));
      this.tabsEl = h('div', { class: 'tabs' });
      this.body = h('div');
      el.append(this.tabsEl, this.body);
      this.draw();
    },

    draw() {
      clear(this.tabsEl);
      for (const [id, ic] of [['general', 'settings'], ['appearance', 'sparkles'], ['about', 'info']]) {
        this.tabsEl.appendChild(h('button', { class: this.tab === id ? 'on' : '', onClick: () => { this.tab = id; this.draw(); } }, icon(ic), t(`set.tab.${id}`)));
      }
      clear(this.body);
      if (this.tab === 'general') this.general();
      else if (this.tab === 'appearance') this.appearance();
      else this.about();
    },

    general() {
      const cfg = App.state.settings;
      const info = App.state.info;
      const save = async (patch) => {
        await App.saveSettings(patch);
        UI.toast({ title: t('set.saved'), icon: 'settings' });
      };
      const lang = UI.seg([['auto', t('set.lang.auto')], ['pt', 'Português'], ['en', 'English'], ['es', 'Español']], cfg.lang, async (v) => {
        await App.saveSettings({ lang: v });
        I18N.set(v, info.locale);
        App.rerender();
      });
      const row = (title, desc, control, badge) => h('div', { class: 'setting' },
        h('div', { class: 'txt' }, h('b', null, title), h('span', null, desc), badge ? h('div', { class: 'badges' }, badge) : null), control);
      this.body.appendChild(h('div', { class: 'card' },
        row(t('set.lang'), t('set.lang.d'), lang),
        row(t('set.tray'), t('set.tray.d'), UI.sw(cfg.trayOnClose, (v) => save({ trayOnClose: v }))),
        row(t('set.startup'), t('set.startup.d'), UI.sw(cfg.startWithWindows, (v) => save({ startWithWindows: v }), !info.elevated && !cfg.startWithWindows),
          !info.elevated ? h('span', { class: 'pill' }, icon('lock'), t('common.adminRequired')) : null),
        row(t('set.recycle'), t('set.recycle.d'), UI.sw(cfg.recycleLeftovers, (v) => save({ recycleLeftovers: v })))));
    },

    appearance() {
      const theme = Theme.normalize(App.state.settings.theme);
      const change = async (patch, redraw = true) => {
        const next = { ...Theme.normalize(App.state.settings.theme), ...patch };
        Theme.apply(next);
        await App.saveSettings({ theme: next });
        if (redraw) this.draw();
      };
      const card = h('div', { class: 'card' });

      const swatches = h('div', { class: 'swatches' });
      for (const [id, hex] of Theme.ACCENTS) {
        swatches.appendChild(h('button', { class: `swatch${theme.accent.toLowerCase() === hex ? ' on' : ''}`, title: t(`set.accent.${id}`), style: { background: hex }, onClick: () => change({ accent: hex }) }));
      }
      const custom = h('input', { type: 'color', value: theme.accent });
      custom.addEventListener('input', () => { Theme.apply({ ...theme, accent: custom.value }); });
      custom.addEventListener('change', () => change({ accent: custom.value }));
      const isCustom = !Theme.ACCENTS.some(([, hex]) => hex === theme.accent.toLowerCase());
      swatches.appendChild(h('label', { class: `swatch swatch-custom${isCustom ? ' on' : ''}`, title: t('set.custom') }, custom));

      const bgs = h('div', { class: 'bg-cards' });
      for (const [id, b] of Object.entries(Theme.BACKGROUNDS)) {
        bgs.appendChild(h('button', { class: `bg-card${theme.bg === id ? ' on' : ''}`, onClick: () => change({ bg: id }) },
          h('div', { class: 'pv', style: { background: b.bg } },
            h('i', { style: { width: '28%', background: b.panel } }),
            h('i', { style: { flex: 1, background: b.panel2 } }),
            h('i', { style: { width: '14%', background: theme.accent, opacity: 0.9 } })),
          h('b', null, t(`set.bg.${id}`))));
      }

      const row = (title, desc, control) => h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', null, title), desc ? h('span', null, desc) : null), control);
      card.append(
        h('div', { class: 'setting', style: { display: 'block' } }, h('b', null, t('set.accent')), h('div', { class: 'small muted', style: { margin: '2px 0 12px' } }, t('set.accent.d')), swatches),
        h('div', { class: 'setting', style: { display: 'block' } }, h('b', null, t('set.bg')), h('div', { style: { marginTop: '12px' } }, bgs)),
        row(t('set.scale'), null, UI.seg([[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.2, '120%']], theme.scale, (v) => change({ scale: v }, false))),
        row(t('set.radius'), null, UI.seg([['round', t('set.radius.round')], ['square', t('set.radius.square')]], theme.radius, (v) => change({ radius: v }, false))),
        row(t('set.density'), null, UI.seg([['comfortable', t('set.density.comfortable')], ['compact', t('set.density.compact')]], theme.density, (v) => change({ density: v }, false))),
        row(t('set.motion'), t('set.motion.d'), UI.sw(theme.motion, (v) => change({ motion: v }, false))),
        row(t('set.glow'), t('set.glow.d'), UI.sw(theme.glow, (v) => change({ glow: v }, false))),
        h('div', { style: { paddingTop: '14px' } }, h('button', { class: 'btn', onClick: () => change({ ...Theme.DEFAULT }) }, icon('undo'), t('set.reset'))));
      this.body.appendChild(card);
    },

    about() {
      const info = App.state.info;
      const logo = UI.logo();
      logo.style.width = '44px';
      logo.style.height = '44px';
      this.body.appendChild(h('div', { class: 'grid g2' },
        h('div', { class: 'card' }, App.scamCard(),
          h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn', onClick: () => App.invoke('shell:openExternal', 'https://evlcorp.lol') }, icon('globe'), t('scam.site')))),
        h('div', { class: 'card' },
          h('div', { class: 'card-head' }, logo, h('div', null, h('h3', null, 'EVL Optimizer'), h('div', { class: 'sub' }, `${t('set.version')} ${info.version}`))),
          h('dl', { class: 'kv' },
            h('dt', null, t('set.data')), h('dd', null, h('button', { class: 'link', style: { textAlign: 'left' }, onClick: () => App.invoke('shell:openPath', info.dataDir) }, info.dataDir)),
            h('dt', null, t('home.os')), h('dd', null, info.os),
            h('dt', null, t('shell.admin')), h('dd', null, info.elevated ? t('common.on') : t('common.off'))))));
    },
  };
})();
