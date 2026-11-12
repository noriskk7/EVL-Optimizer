'use strict';

(function () {
  const { h, icon, clear } = UI;
  const GROUP_ICON = { system: 'windows', gpu: 'gpu', browsers: 'globe', games: 'gamepad', apps: 'grid', music: 'music', creative: 'sparkles', dev: 'cpu', windows: 'shield' };
  const GROUPS = ['system', 'browsers', 'games', 'apps', 'music', 'creative', 'gpu', 'dev', 'windows'];

  Pages.cleaner = {
    render(el) {
      this.el = el;
      this.scan = null;
      this.busy = false;
      this.tab = this.tab || 'all';
      App.adminBanner(el);
      this.scanBtn = h('button', { class: 'btn', onClick: () => this.runScan() }, icon('search'), t('clean.scan'));
      this.cleanBtn = h('button', { class: 'btn primary', onClick: () => this.runClean() }, icon('broom'), t('clean.clean'));
      App.pageHead(el, t('clean.title'), t('clean.subtitle'), [this.scanBtn, this.cleanBtn]);

      this.total = h('div', { class: 'big-stat' }, '—');
      this.selInfo = h('div', { class: 'muted small num' }, '');
      this.status = h('div', { class: 'small muted', style: { minHeight: '18px' } }, '');
      this.prog = h('div', { class: 'progress hidden' }, h('i', { style: { width: '0%' } }));
      el.appendChild(h('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '14px' } },
        h('div', { class: 'card-icon', style: { width: '52px', height: '52px', borderRadius: '15px' } }, icon('broom')),
        h('div', null, h('div', { class: 'row', style: { alignItems: 'baseline', gap: '10px' } }, this.total, h('span', { class: 'muted' }, t('clean.found'))), this.selInfo),
        h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '420px', marginLeft: 'auto' } }, this.status, this.prog)));

      this.resultEl = h('div');
      this.tabsEl = h('div', { class: 'tabs' });
      this.toolbar = h('div', { class: 'toolbar' });
      this.tableEl = h('div', { class: 'card nopad' });
      el.append(this.resultEl, this.tabsEl, this.toolbar, this.tableEl);
      this.off = window.evl.on('cleaner:progress', (p) => this.progress(p));
      App.invoke('cleaner:catalog').then((cat) => {
        this.catalog = cat || [];
        this.selected = new Set(this.catalog.filter((c) => c.safe).map((c) => c.id));
        this.draw();
        this.runScan();
      });
    },

    leave() {
      if (this.off) this.off();
      if (this.busy) App.invoke('cleaner:cancel');
    },

    entry(id) {
      return this.scan ? this.scan.entries.find((x) => x.id === id) : null;
    },

    visible() {
      return this.catalog.filter((c) => this.tab === 'all' || c.group === this.tab);
    },

    groupBytes(g) {
      return this.catalog.filter((c) => g === 'all' || c.group === g).reduce((a, c) => a + ((this.entry(c.id) || {}).bytes || 0), 0);
    },

    draw() {
      this.drawTabs();
      this.drawToolbar();
      this.drawTable();
      this.updateSummary();
    },

    drawTabs() {
      clear(this.tabsEl);
      for (const g of ['all', ...GROUPS]) {
        if (g !== 'all' && !this.catalog.some((c) => c.group === g)) continue;
        const bytes = this.groupBytes(g);
        this.tabsEl.appendChild(h('button', { class: this.tab === g ? 'on' : '', onClick: () => { this.tab = g; this.draw(); } },
          g === 'all' ? icon('grid') : icon(GROUP_ICON[g]), g === 'all' ? t('clean.tab.all') : t(`clean.group.${g}`),
          this.scan ? h('span', { class: 'sz' }, UI.bytes(bytes)) : null));
      }
    },

    drawToolbar() {
      clear(this.toolbar);
      const ids = this.visible().filter((c) => !c.locked).map((c) => c.id);
      this.toolbar.append(
        h('button', { class: 'btn sm', onClick: () => { ids.forEach((id) => this.selected.add(id)); this.drawTable(); this.updateSummary(); } }, icon('check'), t('common.selectAll')),
        h('button', { class: 'btn sm ghost', onClick: () => { this.visible().forEach((c) => { if (c.safe) this.selected.add(c.id); else this.selected.delete(c.id); }); this.drawTable(); this.updateSummary(); } }, icon('shield'), t('clean.selectSafe')),
        h('button', { class: 'btn sm ghost', onClick: () => { ids.forEach((id) => this.selected.delete(id)); this.drawTable(); this.updateSummary(); } }, icon('x'), t('common.selectNone')),
      );
    },

    drawTable() {
      clear(this.tableEl);
      const list = this.visible();
      const usable = list.filter((c) => !c.locked);
      const sel = usable.filter((c) => this.selected.has(c.id)).length;
      const all = h('input', { type: 'checkbox', class: 'check', checked: sel > 0 && sel === usable.length, indeterminate: sel > 0 && sel < usable.length });
      all.addEventListener('change', () => {
        usable.forEach((c) => (all.checked ? this.selected.add(c.id) : this.selected.delete(c.id)));
        this.drawTable();
        this.updateSummary();
      });
      const body = h('tbody');
      for (const c of list) {
        const e = this.entry(c.id);
        const check = h('input', { type: 'checkbox', class: 'check', checked: this.selected.has(c.id), disabled: c.locked });
        const risk = c.risk === 2 ? h('span', { class: 'pill danger' }, t('common.destructive'))
          : c.risk === 1 ? h('span', { class: 'pill warn' }, t('common.caution')) : h('span', { class: 'pill good' }, t('common.safe'));
        let size;
        let files = '';
        if (c.locked) size = h('span', { class: 'pill' }, icon('lock'), t('clean.locked'));
        else if (!e) size = this.busy ? '…' : '—';
        else if (!e.measurable) size = h('span', { class: 'small muted' }, t('clean.notMeasured'));
        else { size = UI.bytes(e.bytes); files = UI.num(e.files); }
        const row = h('tr', { class: `clickable${c.locked ? ' locked' : ''}` },
          h('td', { class: 'ck' }, check),
          h('td', null, h('div', { class: 'row', style: { gap: '12px' } }, h('span', { class: 'ico' }, icon(GROUP_ICON[c.group] || 'file')),
            h('div', { style: { minWidth: 0 } }, h('div', { class: 'strong' }, t(`cat.${c.id}`)), h('div', { class: 'desc' }, t(`cat.${c.id}.d`)),
              e && e.blocked && e.blocked.length ? h('div', { class: 'desc', style: { color: 'var(--warn)' } }, t('clean.blocked', { apps: e.blocked.join(', ') })) : null))),
          h('td', null, risk),
          h('td', { class: `num${files && e.files ? '' : ' zero'}` }, files || '—'),
          h('td', { class: `num ${e && e.bytes ? 'strong-num' : 'zero'}` }, size));
        const toggle = () => {
          if (c.locked) return;
          if (this.selected.has(c.id)) this.selected.delete(c.id); else this.selected.add(c.id);
          check.checked = this.selected.has(c.id);
          const s = usable.filter((x) => this.selected.has(x.id)).length;
          all.checked = s > 0 && s === usable.length;
          all.indeterminate = s > 0 && s < usable.length;
          this.updateSummary();
        };
        row.addEventListener('click', (ev) => { if (ev.target !== check) toggle(); });
        check.addEventListener('change', () => { if (check.checked !== this.selected.has(c.id)) toggle(); });
        body.appendChild(row);
      }
      this.tableEl.appendChild(h('table', { class: 'table' },
        h('thead', null, h('tr', null,
          h('th', { class: 'ck nosort' }, all), h('th', { class: 'nosort' }, t('clean.col.item')), h('th', { class: 'nosort' }, t('clean.col.risk')),
          h('th', { class: 'num nosort' }, t('clean.col.files')), h('th', { class: 'num nosort' }, t('clean.col.size')))),
        body));
    },

    selectedBytes() {
      let b = 0;
      for (const id of this.selected) { const e = this.entry(id); if (e) b += e.bytes; }
      return b;
    },

    updateSummary() {
      this.total.textContent = this.scan ? UI.bytes(this.scan.totalBytes) : '—';
      this.selInfo.textContent = `${t('clean.selectedSize', { size: UI.bytes(this.selectedBytes()) })} · ${t('common.selected', { n: this.selected.size })}`;
      this.cleanBtn.disabled = this.busy || !this.selected.size;
      this.scanBtn.disabled = this.busy;
    },

    setBusy(busy, label) {
      this.busy = busy;
      this.prog.classList.toggle('hidden', !busy);
      this.prog.firstChild.style.width = '0%';
      this.status.textContent = label || '';
      clear(this.scanBtn).append(busy ? UI.spinner() : icon('search'), this.scan ? t('clean.rescan') : t('clean.scan'));
      this.updateSummary();
    },

    progress(p) {
      if (!this.busy) return;
      this.prog.firstChild.style.width = `${(p.index / Math.max(p.total, 1)) * 100}%`;
      const key = p.phase === 'scan' ? 'clean.scanning' : p.phase === 'verify' ? 'clean.phase.verify' : 'clean.cleaning';
      this.status.textContent = t(key, { name: p.id ? t(`cat.${p.id}`) : '…' });
    },

    async runScan() {
      if (this.busy) return;
      this.setBusy(true, t('clean.scanning', { name: '…' }));
      this.drawTable();
      try {
        this.scan = await App.invoke('cleaner:scan', this.catalog.map((c) => c.id));
      } finally {
        this.setBusy(false);
        if (this.el.isConnected) this.draw();
      }
    },

    async runClean() {
      const ids = [...this.selected];
      if (!ids.length || this.busy) return;
      const risky = this.catalog.filter((c) => ids.includes(c.id) && c.risk === 2).map((c) => t(`cat.${c.id}`));
      const text = t('clean.confirmText') + (risky.length ? `\n\n${t('clean.confirmRisk', { list: risky.join(', ') })}` : '');
      const ok = await UI.confirm({ title: t('clean.confirm', { size: UI.bytes(this.selectedBytes()), n: ids.length }), text, ok: t('clean.clean'), danger: risky.length > 0, iconName: 'broom' });
      if (!ok) return;
      this.setBusy(true, t('clean.cleaning', { name: '…' }));
      let r = null;
      try {
        r = await App.invoke('cleaner:clean', ids);
      } finally {
        this.setBusy(false);
      }
      if (r && typeof r.bytes === 'number') {
        App.logToast(r, { title: t('clean.doneTitle'), text: t('clean.doneText', { size: UI.bytes(r.bytes), files: UI.num(r.files), skipped: UI.num(r.skipped) }), icon: 'broom' });
        this.showResult(r);
      }
      if (this.el.isConnected) this.runScan();
    },

    showResult(r) {
      clear(this.resultEl);
      const left = new Map(((r.after && r.after.entries) || []).map((e) => [e.id, e]));
      const body = h('tbody');
      let totals = { bytes: 0, files: 0, skipped: 0, left: 0 };
      for (const [id, p] of Object.entries(r.perAction || {})) {
        const l = left.get(id);
        const leftBytes = l ? l.bytes : 0;
        totals = { bytes: totals.bytes + p.bytes, files: totals.files + p.files, skipped: totals.skipped + p.skipped, left: totals.left + leftBytes };
        body.appendChild(h('tr', null,
          h('td', { class: 'ck' }, icon(p.bytes > 0 || leftBytes === 0 ? 'checkCircle' : 'minusCircle')),
          h('td', null, t(`cat.${id}`)),
          h('td', { class: `num ${p.bytes ? 'strong-num' : 'zero'}` }, UI.bytes(p.bytes)),
          h('td', { class: 'num' }, UI.num(p.files)),
          h('td', { class: `num${p.skipped ? '' : ' zero'}` }, UI.num(p.skipped)),
          h('td', { class: `num${leftBytes ? '' : ' zero'}` }, UI.bytes(leftBytes))));
      }
      const card = h('div', { class: 'card nopad', style: { marginBottom: '16px' } },
        h('div', { class: 'card-head', style: { padding: '16px 18px 4px' } }, h('div', { class: 'card-icon' }, icon('checkCircle')),
          h('div', null, h('h3', null, t('clean.result')), h('div', { class: 'sub' }, t('clean.verified'))),
          h('div', { class: 'right' },
            r.logId ? h('button', { class: 'btn sm', onClick: () => App.navigate('logs', { open: r.logId }) }, icon('list'), t('common.viewLog')) : null,
            h('button', { class: 'btn sm ghost icon', onClick: () => clear(this.resultEl) }, icon('x')))),
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', { class: 'ck nosort' }, ''), h('th', { class: 'nosort' }, t('clean.col.item')),
            h('th', { class: 'num nosort' }, t('clean.col.removed')), h('th', { class: 'num nosort' }, t('clean.col.files')),
            h('th', { class: 'num nosort' }, t('clean.col.inUse')), h('th', { class: 'num nosort' }, t('clean.col.left')))),
          body,
          h('tfoot', null, h('tr', null, h('td', { class: 'ck' }, ''), h('td', null, t('clean.total')), h('td', { class: 'num' }, UI.bytes(totals.bytes)),
            h('td', { class: 'num' }, UI.num(totals.files)), h('td', { class: 'num' }, UI.num(totals.skipped)), h('td', { class: 'num' }, UI.bytes(totals.left))))));
      this.resultEl.appendChild(card);
      card.querySelectorAll('td.ck svg').forEach((s) => { s.style.width = '16px'; s.style.height = '16px'; s.style.color = 'var(--good)'; });
    },
  };
})();
