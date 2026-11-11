'use strict';

(function () {
  const { h, icon, clear } = UI;
  const GROUP_ICON = { apps: 'package', ai: 'bot', ads: 'megaphone', telemetry: 'eyeOff', optional: 'grid' };

  Pages.debloat = {
    render(el) {
      this.el = el;
      App.adminBanner(el);
      App.pageHead(el, t('deb.title'), t('deb.subtitle'), [h('button', { class: 'btn', onClick: () => this.load() }, icon('refresh'), t('common.refresh'))]);
      this.restore = App.state.info.elevated && App.state.settings.restorePointBeforeDebloat;
      this.pendingEl = h('div', { class: 'small muted', style: { marginTop: '10px' } }, t('common.loading'));
      this.runBtn = h('button', { class: 'btn primary xl', disabled: true, onClick: () => this.run() }, icon('sparkles'), t('deb.button'));
      const restoreBox = h('input', { type: 'checkbox', class: 'check', checked: this.restore, disabled: !App.state.info.elevated });
      restoreBox.addEventListener('change', () => { this.restore = restoreBox.checked; App.saveSettings({ restorePointBeforeDebloat: restoreBox.checked }); });
      el.appendChild(h('div', { class: 'card hero', style: { gridTemplateColumns: 'auto 1fr auto' } },
        h('div', { class: 'card-icon', style: { width: '72px', height: '72px', borderRadius: '20px' } }, icon('sparkles')),
        h('div', { style: { position: 'relative' } }, h('h2', null, t('deb.heroTitle')), h('p', null, t('deb.heroText')),
          h('label', { class: 'row small dim', style: { marginTop: '12px', gap: '8px', cursor: 'pointer' } }, restoreBox, t('deb.restore'))),
        h('div', { class: 'actions', style: { alignItems: 'flex-end' } }, this.runBtn, this.pendingEl)));
      this.groupsEl = h('div', { class: 'grid g2 mt' });
      el.appendChild(this.groupsEl);
      this.load();
    },

    async load() {
      clear(this.groupsEl).appendChild(h('div', { class: 'card span2' }, h('div', { class: 'skeleton', style: { height: '220px' } })));
      const [items, status] = await Promise.all([App.invoke('debloat:items'), App.invoke('debloat:status')]);
      if (!this.el.isConnected) return;
      this.items = items || [];
      this.status = new Map((status || []).map((s) => [s.id, s]));
      if (!this.chosen) this.chosen = new Set(this.items.filter((i) => i.on).map((i) => i.id));
      this.draw();
    },

    draw() {
      clear(this.groupsEl);
      for (const g of ['apps', 'ai', 'ads', 'telemetry', 'optional']) {
        const items = this.items.filter((i) => i.group === g);
        if (!items.length) continue;
        const open = items.filter((i) => { const st = this.status.get(i.id) || {}; return !st.done && !st.locked; });
        const allOn = open.length > 0 && open.every((i) => this.chosen.has(i.id));
        const toggleAll = open.length ? h('button', { class: 'btn sm ghost', onClick: () => { open.forEach((i) => (allOn ? this.chosen.delete(i.id) : this.chosen.add(i.id))); this.draw(); } }, icon(allOn ? 'x' : 'check'), allOn ? t('common.selectNone') : t('common.selectAll')) : null;
        const card = h('div', { class: `card${g === 'apps' ? ' span2' : ''}` },
          h('div', { class: 'card-head' }, h('div', { class: `card-icon ${g === 'optional' ? 'info' : g === 'ai' ? 'violet' : g === 'telemetry' ? 'warn' : ''}` }, icon(GROUP_ICON[g])), h('h3', null, t(`deb.group.${g}`)), h('div', { class: 'right' }, toggleAll)));
        const listEl = h('div', { class: g === 'apps' ? 'grid g2' : 'col', style: { gap: g === 'apps' ? '0 22px' : '0' } });
        for (const item of items) {
          const st = this.status.get(item.id) || {};
          const sub = st.done ? h('span', { style: { color: 'var(--accent)' } }, t('deb.done'))
            : st.present && st.present.length ? t('deb.present', { list: st.present.slice(0, 4).join(', ') + (st.present.length > 4 ? '…' : '') })
              : st.pendingTweaks && st.pendingTweaks.length ? t('deb.toApply') : item.special ? t('deb.toApply') : t('deb.notFound');
          const sw = UI.sw(this.chosen.has(item.id) && !st.done, (v) => { if (v) this.chosen.add(item.id); else this.chosen.delete(item.id); this.updatePending(); }, st.done || st.locked);
          listEl.appendChild(h('div', { class: 'setting' },
            h('div', { class: 'txt' }, h('b', null, t(`deb.item.${item.id}`)), h('span', { class: 'ellipsis' }, sub),
              st.locked ? h('div', { class: 'badges' }, h('span', { class: 'pill' }, icon('lock'), t('common.adminRequired'))) : null),
            st.done ? h('span', { class: 'card-icon', style: { width: '28px', height: '28px', borderRadius: '50%' } }, icon('check')) : sw));
        }
        card.appendChild(listEl);
        this.groupsEl.appendChild(card);
      }
      this.updatePending();
    },

    pendingIds() {
      return [...this.chosen].filter((id) => {
        const st = this.status.get(id);
        return st && !st.done && !st.locked;
      });
    },

    updatePending() {
      const n = this.pendingIds().length;
      this.pendingEl.textContent = n ? t('deb.pending', { n }) : t('deb.allDone');
      this.runBtn.disabled = !n || this.busy;
    },

    async run() {
      const ids = this.pendingIds();
      if (!ids.length) return;
      const names = ids.map((id) => `• ${t(`deb.item.${id}`)}`).join('\n');
      const ok = await UI.confirm({ title: t('deb.confirm', { n: ids.length }), text: `${t('deb.confirmText')}\n\n${names}`, ok: t('deb.button'), danger: true, iconName: 'sparkles' });
      if (!ok) return;
      this.busy = true;
      this.updatePending();
      const log = h('div', { class: 'log' });
      const phase = h('b', null, t('deb.phase.appx'));
      const m = UI.modal({ title: t('deb.button'), iconName: 'sparkles', closable: false, body: h('div', null, h('div', { class: 'empty', style: { paddingBottom: '16px' } }, UI.spinner(), phase), log) });
      const off = window.evl.on('debloat:progress', (p) => {
        const label = t(`deb.phase.${p.phase}`);
        phase.textContent = label;
        log.appendChild(h('div', null, p.id ? `${label} ${t(`tweak.${p.id}`)}` : label));
        log.scrollTop = log.scrollHeight;
      });
      let r = null;
      try {
        r = await App.invoke('debloat:run', { ids, restorePoint: this.restore });
      } finally {
        off();
        this.busy = false;
      }
      const apps = r && r.removed ? r.removed.length : 0;
      const tweaks = r && r.tweaks ? r.tweaks.filter((x) => x.ok).length : 0;
      m.setTitle(t('deb.result'));
      m.setClosable(true);
      m.setBody(h('div', { class: 'empty' }, h('div', { class: 'card-icon', style: { width: '56px', height: '56px', borderRadius: '16px' } }, icon('checkCircle')),
        h('b', null, t('deb.resultText', { apps, tweaks })), h('span', null, t('deb.restartHint'))),
        r && r.removed && r.removed.length ? h('div', { class: 'log' }, r.removed.map((n) => h('div', null, `✓ ${n}`))) : null,
        r && r.remaining && r.remaining.length ? h('div', { class: 'log', style: { marginTop: '8px', color: 'var(--warn)' } }, r.remaining.map((n) => h('div', null, `! ${n}`))) : null);
      m.setFoot(r && r.logId ? h('button', { class: 'btn', onClick: () => { m.close(); App.navigate('logs', { open: r.logId }); } }, icon('list'), t('common.viewLog')) : null,
        h('div', { class: 'spacer' }), h('button', { class: 'btn', onClick: async () => { await App.invoke('debloat:restartExplorer'); } }, icon('refresh'), t('deb.restartExplorer')),
        h('button', { class: 'btn primary', onClick: () => m.close() }, t('common.finish')));
      this.load();
    },
  };
})();
