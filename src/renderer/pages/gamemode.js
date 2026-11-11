'use strict';

(function () {
  const { h, icon, clear } = UI;

  Pages.gamemode = {
    render(el) {
      this.el = el;
      App.adminBanner(el);
      App.pageHead(el, t('gm.title'), t('gm.subtitle'));
      const cfg = App.state.settings;

      this.gmIcon = h('div', { class: 'gm-icon' }, icon('gamepad'));
      this.gmTitle = h('h2', { style: { margin: 0, fontSize: '20px' } }, '');
      this.gmSub = h('div', { class: 'muted', style: { marginTop: '4px' } }, '');
      this.mainSw = UI.sw(cfg.gameMode, async (v) => { await App.saveSettings({ gameMode: v }); this.updateStatus(); });
      el.appendChild(h('div', { class: 'card hero', style: { gridTemplateColumns: 'auto 1fr auto' } },
        this.gmIcon, h('div', { style: { position: 'relative' } }, this.gmTitle, this.gmSub),
        h('label', { class: 'row strong', style: { gap: '12px', cursor: 'pointer', position: 'relative' } }, t('gm.toggle'), this.mainSw)));

      const opts = h('div', { class: 'card' });
      for (const [key, setting, needsAdmin] of [['power', 'gmPower'], ['free', 'gmFree'], ['eco', 'gmEco'], ['standby', 'gmStandby', true]]) {
        const locked = needsAdmin && !App.state.info.elevated;
        opts.appendChild(h('div', { class: 'setting' },
          h('div', { class: 'txt' }, h('b', null, t(`gm.opt.${key}`)), h('span', null, t(`gm.opt.${key}.d`)),
            locked ? h('div', { class: 'badges' }, h('span', { class: 'pill' }, icon('lock'), t('common.adminRequired'))) : null),
          UI.sw(cfg[setting], (v) => App.saveSettings({ [setting]: v }), locked)));
      }

      this.gamesEl = h('div', { class: 'chips', style: { marginTop: '12px' } });
      const input = h('input', { class: 'input', placeholder: t('gm.placeholder'), style: { flex: '1 1 220px' } });
      const add = () => {
        const name = input.value.trim().toLowerCase();
        if (!name) return;
        this.addGame(/\.exe$/.test(name) ? name : `${name}.exe`);
        input.value = '';
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const games = h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-icon violet' }, icon('target')), h('div', null, h('h3', null, t('gm.games')), h('div', { class: 'sub' }, t('gm.gamesSub')))),
        h('div', { class: 'row wrap' }, input, h('button', { class: 'btn', onClick: add }, icon('plus'), t('gm.add')),
          h('button', { class: 'btn ghost', onClick: () => this.pickRunning() }, icon('list'), t('gm.fromRunning'))),
        this.gamesEl);

      const how = h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon info' }, icon('info')), h('h3', null, t('gm.how'))));
      ['gm.how1', 'gm.how2', 'gm.how3', 'gm.how4'].forEach((k, i) => how.appendChild(h('div', { class: 'step ok' },
        h('span', { class: 'pill accent', style: { width: '24px', justifyContent: 'center', padding: 0 } }, String(i + 1)), h('span', null, t(k)))));

      el.appendChild(h('div', { class: 'grid g2 mt' }, opts, h('div', { class: 'grid', style: { gap: '14px', alignContent: 'start' } }, games, how)));
      this.drawGames();
      this.updateStatus();
      this.offs = [App.on('gamemode', () => this.updateStatus()), App.on('settings', () => this.drawGames())];
      this.timer = setInterval(() => this.updateStatus(), 5000);
    },

    leave() { clearInterval(this.timer); (this.offs || []).forEach((f) => f()); },

    updateStatus() {
      const g = App.state.game;
      const on = App.state.settings.gameMode;
      this.gmIcon.classList.toggle('on', !!g);
      if (g) {
        this.gmTitle.textContent = t('gm.active', { game: g.game.replace(/\.exe$/i, '') });
        this.gmSub.textContent = t('gm.activeSub', { time: UI.duration((Date.now() - g.since) / 1000), eco: g.eco, freed: UI.bytes(g.freed) });
      } else if (on) {
        this.gmTitle.textContent = t('gm.waiting');
        this.gmSub.textContent = t('gm.waitingSub');
      } else {
        this.gmTitle.textContent = t('gm.off');
        this.gmSub.textContent = t('gm.offSub');
      }
    },

    drawGames() {
      clear(this.gamesEl);
      const list = App.state.settings.gmGames || [];
      if (!list.length) { this.gamesEl.appendChild(h('span', { class: 'small muted' }, t('gm.none'))); return; }
      for (const g of list) {
        this.gamesEl.appendChild(h('span', { class: 'chip on' }, icon('gamepad'), g,
          h('button', { class: 'btn sm ghost icon', style: { width: '20px', height: '20px' }, onClick: () => this.removeGame(g) }, icon('x'))));
      }
    },

    async addGame(name) {
      const list = new Set(App.state.settings.gmGames || []);
      list.add(name);
      await App.saveSettings({ gmGames: [...list] });
      this.drawGames();
    },

    async removeGame(name) {
      await App.saveSettings({ gmGames: (App.state.settings.gmGames || []).filter((g) => g !== name) });
      this.drawGames();
    },

    async pickRunning() {
      const procs = await App.invoke('processes:list');
      const seen = new Map();
      for (const p of procs || []) {
        if (p.protected || p.session === 0 || !p.path || /\\windows\\/i.test(p.path)) continue;
        const key = p.name.toLowerCase();
        if (!seen.has(key)) seen.set(key, { ...p, mem: 0 });
        seen.get(key).mem += p.memory;
      }
      const list = [...seen.values()].sort((a, b) => b.mem - a.mem).slice(0, 30);
      const body = h('div', { class: 'list' });
      const m = UI.modal({ title: t('gm.fromRunning'), iconName: 'list', body });
      for (const p of list) {
        body.appendChild(h('div', { class: 'list-row clickable', onClick: () => { this.addGame(p.name.toLowerCase()); m.close(); } },
          UI.lazyIcon(p.path, p.name, 'sm'), h('div', { class: 'grow' }, h('div', { class: 'title' }, p.name), h('div', { class: 'meta ellipsis' }, p.path)),
          h('span', { class: 'small muted num' }, UI.bytes(p.mem))));
      }
    },
  };
})();
