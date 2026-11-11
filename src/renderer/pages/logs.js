'use strict';

(function () {
  const { h, icon, clear } = UI;
  const KIND_ICON = {
    memory: 'memory', clean: 'broom', tweak: 'sliders', debloat: 'sparkles', uninstall: 'package', store: 'bag', process: 'activity',
    startup: 'rocket', power: 'power', hibernate: 'disk', network: 'wifi', restore: 'history', journal: 'undo', benchmark: 'gauge', game: 'gamepad',
  };
  const ROW_ICON = { ok: 'checkCircle', fail: 'xCircle', skip: 'minusCircle', info: 'info' };

  const when = (ms) => new Date(ms).toLocaleString(I18N.locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function badge(e) {
    const failed = (e.rows || []).some((r) => r.status === 'fail');
    if (failed) return h('span', { class: 'pill warn' }, icon('alert'), t('logs.failed'));
    if (e.verified) return h('span', { class: 'pill good' }, icon('check'), t('logs.verified'));
    return h('span', { class: 'pill' }, t('logs.notVerified'));
  }

  Pages.logs = {
    render(el, params) {
      this.el = el;
      this.filter = 'all';
      this.openId = params.open || null;
      App.pageHead(el, t('logs.title'), t('logs.subtitle'), [
        h('button', { class: 'btn', onClick: () => this.exportTxt() }, icon('file'), t('logs.export')),
        h('button', { class: 'btn ghost', onClick: () => this.clearAll() }, icon('trash'), t('logs.clear')),
      ]);
      this.chips = h('div', { class: 'chips', style: { marginBottom: '14px' } });
      this.list = h('div');
      el.append(this.chips, this.list);
      this.load();
    },

    async load() {
      const list = await App.invoke('activity:list');
      if (!this.el.isConnected) return;
      this.entries = Array.isArray(list) ? list : [];
      this.draw();
    },

    draw() {
      clear(this.chips);
      const kinds = [...new Set(this.entries.map((e) => e.kind))];
      const chip = (id, label, n) => h('button', { class: `chip${this.filter === id ? ' on' : ''}`, onClick: () => { this.filter = id; this.draw(); } }, label, h('span', { class: 'n' }, n));
      this.chips.appendChild(chip('all', t('logs.all'), this.entries.length));
      for (const k of kinds) this.chips.appendChild(chip(k, t(`logs.kind.${k}`), this.entries.filter((e) => e.kind === k).length));
      clear(this.list);
      const shown = this.entries.filter((e) => this.filter === 'all' || e.kind === this.filter);
      if (!shown.length) { this.list.appendChild(h('div', { class: 'card' }, UI.empty('list', t('logs.empty')))); return; }
      for (const e of shown.slice(0, 200)) {
        const body = h('div', { class: 'log-body' });
        const entry = h('div', { class: `log-entry${e.id === this.openId ? ' open' : ''}` },
          h('div', { class: 'log-head', onClick: () => {
            entry.classList.toggle('open');
            if (entry.classList.contains('open') && !body.firstChild) this.fillBody(body, e);
          } },
            h('div', { class: 'card-icon', style: { width: '30px', height: '30px', borderRadius: '9px' } }, icon(KIND_ICON[e.kind] || 'info')),
            h('div', { style: { minWidth: 0 } },
              h('div', { class: 'strong ellipsis' }, App.fmt(e.summary.key, e.summary.vars)),
              h('div', { class: 'tiny muted' }, `${t(`logs.kind.${e.kind}`)} · ${t('logs.rows', { n: (e.rows || []).length })}`)),
            h('span', { class: 'when' }, when(e.at)), badge(e), icon('chevronRight', 'chev')),
          body);
        if (e.id === this.openId) {
          this.fillBody(body, e);
          setTimeout(() => entry.scrollIntoView({ block: 'center' }), 50);
        }
        this.list.appendChild(entry);
      }
    },

    fillBody(body, e) {
      for (const r of e.rows || []) {
        body.appendChild(h('div', { class: `log-row ${r.status}` }, icon(ROW_ICON[r.status] || 'info'),
          h('code', null, App.fmt(r.key, r.vars), r.vars && r.vars.detail && !String(App.fmt(r.key, r.vars)).includes(r.vars.detail) ? ` (${r.vars.detail})` : '')));
      }
      if (!(e.rows || []).length) body.appendChild(h('div', { class: 'log-row info' }, icon('info'), h('code', null, '—')));
    },

    async exportTxt() {
      const mark = { ok: '[OK]', fail: '[X] ', skip: '[-] ', info: '[i] ' };
      const lines = [`EVL Optimizer ${App.state.info.version} · ${t('logs.title')}`, `${App.state.info.computer} · ${App.state.info.os}`, ''];
      for (const e of this.entries) {
        const status = (e.rows || []).some((r) => r.status === 'fail') ? t('logs.failed') : e.verified ? t('logs.verified') : t('logs.notVerified');
        lines.push(`${when(e.at)}  ${App.fmt(e.summary.key, e.summary.vars)}  [${status}]`);
        for (const r of e.rows || []) lines.push(`    ${mark[r.status] || ''} ${App.fmt(r.key, r.vars)}`);
        lines.push('');
      }
      const file = await App.invoke('activity:export', lines.join('\r\n'));
      if (file) UI.toast({ title: t('logs.exported'), text: file, icon: 'file' });
    },

    async clearAll() {
      const ok = await UI.confirm({ title: t('logs.clearConfirm'), text: t('logs.clearText'), ok: t('logs.clear'), danger: true });
      if (!ok) return;
      await App.invoke('activity:clear');
      this.load();
    },
  };
})();
