'use strict';

(function () {
  const { h, icon, clear } = UI;

  Pages.restore = {
    render(el) {
      this.el = el;
      App.adminBanner(el);
      App.pageHead(el, t('rs.title'), t('rs.subtitle'));
      this.createBtn = h('button', { class: 'btn primary', disabled: !App.state.info.elevated, onClick: () => this.create() }, icon('plus'), t('rs.create'));
      this.pointsEl = h('div', { class: 'list' });
      this.journalEl = h('div', { class: 'list' });
      this.revertBtn = h('button', { class: 'btn', disabled: true, onClick: () => this.revert() }, icon('undo'), t('rs.revert', { n: 0 }));
      el.appendChild(h('div', { class: 'grid g2' },
        h('div', { class: 'card nopad' },
          h('div', { class: 'card-head', style: { padding: '16px 18px 4px' } }, h('div', { class: 'card-icon' }, icon('history')), h('h3', null, t('rs.points')),
            h('div', { class: 'right' }, this.createBtn)),
          this.pointsEl,
          h('div', { style: { padding: '12px 18px' } }, h('button', { class: 'link', onClick: () => App.invoke('shell:openPath', 'C:\\Windows\\System32\\rstrui.exe') }, t('rs.open')))),
        h('div', { class: 'card nopad' },
          h('div', { class: 'card-head', style: { padding: '16px 18px 4px' } }, h('div', { class: 'card-icon info' }, icon('undo')),
            h('div', null, h('h3', null, t('rs.journal')), h('div', { class: 'sub' }, t('rs.journalSub'))), h('div', { class: 'right' }, this.revertBtn)),
          this.journalEl)));
      this.loadPoints();
      this.loadJournal();
    },

    async loadPoints() {
      clear(this.pointsEl).appendChild(h('div', { class: 'list-row' }, h('div', { class: 'skeleton', style: { height: '20px', flex: 1 } })));
      if (!App.state.info.elevated) { clear(this.pointsEl).appendChild(UI.empty('lock', t('rs.adminList'))); return; }
      const r = await App.invoke('restore:list');
      if (!this.el.isConnected) return;
      clear(this.pointsEl);
      const points = r && r.points ? r.points : [];
      if (!points.length) { this.pointsEl.appendChild(UI.empty('history', t('rs.noPoints'))); return; }
      for (const p of points) {
        this.pointsEl.appendChild(h('div', { class: 'list-row' }, h('div', { class: 'card-icon', style: { width: '30px', height: '30px', borderRadius: '9px' } }, icon('clock')),
          h('div', { class: 'grow' }, h('div', { class: 'title ellipsis' }, p.description), h('div', { class: 'meta num' }, p.created)),
          h('button', { class: 'btn sm', onClick: () => this.restoreTo(p) }, t('rs.restore'))));
      }
    },

    async create() {
      this.createBtn.disabled = true;
      clear(this.createBtn).append(UI.spinner(), t('rs.creating'));
      const r = await App.invoke('restore:create');
      App.logToast(r, r && r.ok ? { title: t('rs.created'), icon: 'history' } : { title: t('common.failed'), text: r && r.detail, kind: 'warn' });
      this.createBtn.disabled = false;
      clear(this.createBtn).append(icon('plus'), t('rs.create'));
      this.loadPoints();
    },

    async restoreTo(p) {
      const ok = await UI.confirm({ title: t('rs.restoreConfirm', { name: p.description }), text: t('rs.restoreText'), ok: t('rs.restore'), danger: true });
      if (!ok) return;
      const r = await App.invoke('restore:to', p.sequence);
      if (!r || !r.ok) UI.toast({ title: t('common.failed'), text: r && r.detail, kind: 'danger' });
    },

    async loadJournal() {
      const entries = await App.invoke('journal:list');
      if (!this.el.isConnected) return;
      this.selected = new Set();
      clear(this.journalEl);
      if (!Array.isArray(entries) || !entries.length) { this.journalEl.appendChild(UI.empty('checkCircle', t('rs.journalEmpty'))); this.updateBtn(); return; }
      const boxes = [];
      const all = h('input', { type: 'checkbox', class: 'check' });
      all.addEventListener('change', () => {
        for (const [box, key] of boxes) { box.checked = all.checked; if (all.checked) this.selected.add(key); else this.selected.delete(key); }
        this.updateBtn();
      });
      this.journalEl.appendChild(h('label', { class: 'list-row clickable', style: { minHeight: '40px' } }, all, h('span', { class: 'small dim strong' }, t('common.selectAll'))));
      for (const e of entries) {
        const box = h('input', { type: 'checkbox', class: 'check' });
        boxes.push([box, e.key]);
        box.addEventListener('change', () => {
          if (box.checked) this.selected.add(e.key); else this.selected.delete(e.key);
          all.checked = this.selected.size === entries.length;
          all.indeterminate = this.selected.size > 0 && this.selected.size < entries.length;
          this.updateBtn();
        });
        const title = I18N.lang !== 'pt' ? (e.title_en || e.title) : e.title;
        const target = I18N.lang !== 'pt' ? (e.target_en || e.target) : e.target;
        this.journalEl.appendChild(h('label', { class: 'list-row clickable' }, box,
          h('div', { class: 'grow' }, h('div', { class: 'title ellipsis' }, title), h('div', { class: 'meta ellipsis selectable', title: target }, target)),
          h('span', { class: 'tiny muted num' }, e.applied_at || '')));
      }
      this.updateBtn();
    },

    updateBtn() {
      const n = this.selected ? this.selected.size : 0;
      this.revertBtn.disabled = !n;
      clear(this.revertBtn).append(icon('undo'), t('rs.revert', { n }));
    },

    async revert() {
      const keys = [...this.selected];
      const r = await App.invoke('journal:revert', keys);
      const ok = Array.isArray(r) ? r.filter((x) => x.ok).length : 0;
      App.logToast(r, { title: t('rs.reverted', { n: ok }), kind: ok === keys.length ? 'ok' : 'warn', icon: 'undo' });
      this.loadJournal();
    },
  };
})();
