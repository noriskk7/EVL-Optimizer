'use strict';

(function () {
  const { h, icon, clear } = UI;
  const GROUP_OF = { dir: 'files', file: 'files', regkey: 'registry', regvalue: 'registry', service: 'system', task: 'system' };
  const KIND_ICON = { dir: 'folder', file: 'file', regkey: 'database', regvalue: 'key', service: 'service', task: 'task' };

  const itemLabel = (i) => {
    if (i.kind === 'regkey') return `${i.root}\\${i.path}`;
    if (i.kind === 'regvalue') return `${i.root}\\${i.path}  ›  ${i.name}`;
    if (i.kind === 'service') return `${i.name}  (${i.path})`;
    if (i.kind === 'task') return i.name;
    return i.path;
  };

  Pages.uninstaller = {
    render(el) {
      this.el = el;
      this.tab = this.tab || 'programs';
      this.sort = { key: 'name', dir: 1 };
      this.filter = 'all';
      this.query = '';
      this.checked = new Set();
      this.focus = null;
      this.storeChecked = new Set();
      this.showSystem = false;
      App.adminBanner(el);
      App.pageHead(el, t('un.title'), t('un.subtitle'), [h('button', { class: 'btn', onClick: () => this.load(true) }, icon('refresh'), t('common.refresh'))]);
      this.tabsEl = h('div', { class: 'tabs' });
      this.body = h('div');
      el.append(this.tabsEl, this.body);
      this.load();
    },

    async load(force) {
      this.drawTabs();
      if (!this.programs || force) {
        clear(this.body).appendChild(h('div', { class: 'card' }, h('div', { class: 'skeleton', style: { height: '320px' } })));
        const list = await App.invoke('uninstall:list');
        this.programs = Array.isArray(list) ? list : [];
        this.sizesFor();
      }
      if (this.tab === 'store' && (!this.store || force)) this.loadStore();
      this.drawTabs();
      this.draw();
    },

    async loadStore() {
      this.store = null;
      this.draw();
      const r = await App.invoke('store:list', { includeSystem: true });
      this.store = r && r.apps ? r.apps : [];
      this.drawTabs();
      if (this.tab === 'store') this.draw();
    },

    async sizesFor() {
      for (const p of this.programs.filter((x) => !x.size && x.location)) {
        if (!this.el.isConnected) return;
        p.size = await App.invoke('uninstall:size', p.location);
        if (p.size && this.tab === 'programs' && this.rowEls && this.rowEls.has(p.id)) this.rowEls.get(p.id).querySelector('.sz').textContent = UI.bytes(p.size);
      }
    },

    drawTabs() {
      clear(this.tabsEl);
      const tab = (id, label, n, ic) => h('button', { class: this.tab === id ? 'on' : '', onClick: () => { this.tab = id; this.load(); } },
        icon(ic), label, n !== undefined ? h('span', { class: 'n' }, n) : null);
      this.tabsEl.append(
        tab('programs', t('un.programs'), this.programs ? this.programs.length : undefined, 'package'),
        tab('store', t('un.store'), this.store ? this.store.filter((a) => this.showSystem || !a.system).length : undefined, 'bag'));
    },

    draw() {
      clear(this.body);
      if (this.tab === 'store') this.drawStore(); else this.drawPrograms();
    },

    filtered() {
      const now = Date.now();
      let list = this.programs || [];
      if (this.query) list = list.filter((p) => `${p.name} ${p.publisher}`.toLowerCase().includes(this.query));
      if (this.filter === 'large') list = list.filter((p) => p.size >= 500 * 1048576);
      if (this.filter === 'recent') list = list.filter((p) => p.installDate && now - new Date(p.installDate).getTime() < 30 * 86400000);
      if (this.filter === 'broken') list = list.filter((p) => !p.hasUninstaller);
      const { key, dir } = this.sort;
      return [...list].sort((a, b) => {
        if (key === 'size') return ((a.size || 0) - (b.size || 0)) * dir;
        if (key === 'date') return String(a.installDate).localeCompare(String(b.installDate)) * dir;
        if (key === 'publisher') return a.publisher.localeCompare(b.publisher) * dir;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) * dir;
      });
    },

    drawPrograms() {
      const search = h('input', { placeholder: t('un.search'), value: this.query });
      search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.drawList(); });
      const chips = h('div', { class: 'chips' });
      const counts = {
        all: this.programs.length,
        large: this.programs.filter((p) => p.size >= 500 * 1048576).length,
        recent: this.programs.filter((p) => p.installDate && Date.now() - new Date(p.installDate).getTime() < 30 * 86400000).length,
        broken: this.programs.filter((p) => !p.hasUninstaller).length,
      };
      for (const f of ['all', 'large', 'recent', 'broken']) {
        chips.appendChild(h('button', { class: `chip${this.filter === f ? ' on' : ''}`, onClick: () => { this.filter = f; this.draw(); } }, t(`un.filter.${f}`), h('span', { class: 'n' }, counts[f])));
      }
      const selAll = h('button', { class: 'btn sm', onClick: () => {
        this.filtered().filter((p) => !p.noRemove).forEach((p) => this.checked.add(p.id));
        this.drawList();
      } }, icon('check'), t('common.selectAll'));
      this.body.appendChild(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('div', { class: 'search' }, icon('search'), search), selAll, h('div', { class: 'spacer' }), chips));

      this.listEl = h('div');
      this.detailEl = h('div', { class: 'card detail' });
      this.selBar = h('div');
      this.body.appendChild(h('div', { class: 'uninst' }, h('div', { class: 'card nopad listwrap' }, this.listEl), this.detailEl));
      this.body.appendChild(this.selBar);
      this.drawList();
      this.drawDetail();
      setTimeout(() => search.focus(), 0);
    },

    drawList() {
      clear(this.listEl);
      const head = h('div', { class: 'prog-head' });
      const all = h('input', { type: 'checkbox', class: 'check' });
      const list = this.filtered();
      const sel = list.filter((p) => this.checked.has(p.id)).length;
      all.checked = sel > 0 && sel === list.length;
      all.indeterminate = sel > 0 && sel < list.length;
      all.addEventListener('change', () => { for (const p of list) { if (all.checked) this.checked.add(p.id); else this.checked.delete(p.id); } this.drawList(); });
      const col = (key, label, cls = '') => h('button', { class: `${cls}${this.sort.key === key ? ' on' : ''}`, onClick: () => {
        this.sort = { key, dir: this.sort.key === key ? -this.sort.dir : key === 'name' || key === 'publisher' ? 1 : -1 };
        this.drawList();
      } }, label, this.sort.key === key ? (this.sort.dir > 0 ? ' ↑' : ' ↓') : '');
      head.append(all, h('span'), col('name', t('un.col.name')), h('span', { class: 'c' }, t('un.col.version')), col('size', t('un.col.size'), 'c'), col('date', t('un.col.date'), 'c'));
      this.listEl.appendChild(head);
      this.rowEls = new Map();
      if (!list.length) { this.listEl.appendChild(UI.empty('search', t('un.storeEmpty'))); this.drawSelBar(); return; }
      const frag = document.createDocumentFragment();
      for (const p of list) {
        const check = h('input', { type: 'checkbox', class: 'check', checked: this.checked.has(p.id), disabled: p.noRemove });
        check.addEventListener('click', (e) => e.stopPropagation());
        check.addEventListener('change', () => { if (check.checked) this.checked.add(p.id); else this.checked.delete(p.id); row.classList.toggle('sel', check.checked); this.drawSelBar(); });
        const row = h('div', { class: `prog-row${this.checked.has(p.id) ? ' sel' : ''}${this.focus === p.id ? ' focus' : ''}`, onClick: () => { this.focus = p.id; for (const r of this.listEl.querySelectorAll('.prog-row.focus')) r.classList.remove('focus'); row.classList.add('focus'); this.drawDetail(); } },
          check,
          UI.lazyIcon(p.icon, p.name),
          h('div', { style: { minWidth: 0 } }, h('div', { class: 'name ellipsis' }, p.name), h('div', { class: 'pub ellipsis' }, p.publisher || t('un.unknown'), !p.hasUninstaller ? h('span', { style: { color: 'var(--warn)' } }, ` · ${t('un.noUninstaller')}`) : null)),
          h('span', { class: 'c ellipsis' }, p.version || '—'),
          h('span', { class: 'c sz' }, p.size ? UI.bytes(p.size) : '—'),
          h('span', { class: 'c' }, UI.date(p.installDate)));
        row.addEventListener('dblclick', () => this.uninstall(p));
        this.rowEls.set(p.id, row);
        frag.appendChild(row);
      }
      this.listEl.appendChild(frag);
      this.drawSelBar();
    },

    drawDetail() {
      const el = clear(this.detailEl);
      const p = (this.programs || []).find((x) => x.id === this.focus);
      if (!p) { el.appendChild(UI.empty('package', t('un.pick'), t('un.pickText'))); return; }
      el.appendChild(h('div', { class: 'big' }, UI.lazyIcon(p.icon, p.name, 'lg'), h('h3', { class: 'selectable' }, p.name), h('div', { class: 'muted small' }, p.publisher || t('un.unknown'))));
      const kv = h('dl', { class: 'kv' });
      const row = (k, v) => kv.append(h('dt', null, k), h('dd', null, v));
      row(t('un.version'), p.version || '—');
      row(t('un.size'), p.size ? UI.bytes(p.size) : '—');
      row(t('un.installed'), UI.date(p.installDate));
      row(t('un.arch'), t(`un.arch.${p.arch}`));
      if (p.location) row(t('un.location'), h('button', { class: 'link', style: { textAlign: 'left', wordBreak: 'break-all' }, onClick: () => App.invoke('shell:openPath', p.location) }, p.location));
      row(t('un.registry'), h('button', { class: 'link', style: { textAlign: 'left', wordBreak: 'break-all' }, onClick: () => App.invoke('shell:openRegedit', `${p.root}\\${p.key}`) }, `${p.root}\\…\\${p.keyName}`));
      if (p.uninstallString) row(t('un.command'), h('span', { class: 'muted', style: { fontSize: '11.5px' } }, p.uninstallString));
      el.appendChild(kv);
      const btns = h('div', { class: 'col', style: { marginTop: '18px', gap: '8px' } },
        h('button', { class: 'btn primary', style: { justifyContent: 'center' }, disabled: p.noRemove, onClick: () => this.uninstall(p) }, icon('trash'), t('un.uninstall')),
        h('button', { class: 'btn', style: { justifyContent: 'center' }, title: t('un.forceHint'), onClick: () => this.uninstall(p, { force: true }) }, icon('zap'), t('un.force')),
        p.url ? h('button', { class: 'btn ghost', style: { justifyContent: 'center' }, onClick: () => App.invoke('shell:openExternal', p.url) }, icon('external'), t('un.website')) : null);
      el.appendChild(btns);
      el.appendChild(h('p', { class: 'tiny muted', style: { marginTop: '12px' } }, t('un.forceHint')));
    },

    drawSelBar() {
      clear(this.selBar);
      const list = (this.programs || []).filter((p) => this.checked.has(p.id));
      if (!list.length) return;
      const size = list.reduce((a, p) => a + (p.size || 0), 0);
      this.selBar.appendChild(h('div', { class: 'selbar' },
        h('div', { class: 'card-icon' }, icon('package')),
        h('div', null, h('b', null, t('common.selected', { n: list.length })), h('div', { class: 'small muted num' }, UI.bytes(size))),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', onClick: () => { this.checked.clear(); this.drawList(); } }, t('common.selectNone')),
        h('button', { class: 'btn danger', onClick: () => this.batch(list) }, icon('trash'), t('un.batch', { n: list.length }))));
    },

    uninstall(p, { force = false } = {}) {
      const st = App.state;
      let mode = st.settings.uninstallMode || 'moderate';
      let restore = st.info.elevated;
      let quiet = false;
      const m = UI.modal({ title: force ? t('un.wiz.forceTitle', { name: p.name }) : t('un.wiz.prepare', { name: p.name }), iconName: force ? 'zap' : 'trash', iconKind: force ? 'warn' : 'danger', steps: 4, body: null, wide: false });

      const modeDesc = h('div', { class: 'small muted', style: { marginTop: '8px' } }, t(`un.mode.${mode}.d`));
      const restoreCheck = h('input', { type: 'checkbox', class: 'check', checked: restore, disabled: !st.info.elevated });
      restoreCheck.addEventListener('change', () => { restore = restoreCheck.checked; });
      const quietCheck = h('input', { type: 'checkbox', class: 'check', checked: false });
      quietCheck.addEventListener('change', () => { quiet = quietCheck.checked; });
      m.setBody(
        h('div', { class: 'row', style: { gap: '16px', marginBottom: '16px' } }, UI.lazyIcon(p.icon, p.name, 'lg'),
          h('div', null, h('div', { class: 'strong', style: { fontSize: '15px' } }, p.name), h('div', { class: 'small muted' }, [p.publisher, p.version, p.size ? UI.bytes(p.size) : ''].filter(Boolean).join(' · ')))),
        h('p', { class: 'dim', style: { marginTop: 0 } }, force ? t('un.wiz.forceText') : t('un.wiz.prepareText')),
        h('label', { class: 'setting', style: { cursor: 'pointer' } }, restoreCheck, h('div', { class: 'txt' }, h('b', null, t('un.wiz.restore')), h('span', null, st.info.elevated ? t('un.wiz.restoreSub') : t('common.adminRequired')))),
        !force && p.hasUninstaller ? h('label', { class: 'setting', style: { cursor: 'pointer' } }, quietCheck, h('div', { class: 'txt' }, h('b', null, t('un.wiz.quiet')))) : null,
        h('div', { class: 'setting', style: { display: 'block' } }, h('b', null, t('un.wiz.mode')), h('div', { style: { marginTop: '10px' } },
          UI.seg([['safe', t('un.mode.safe')], ['moderate', t('un.mode.moderate')], ['advanced', t('un.mode.advanced')]], mode, (v) => { mode = v; modeDesc.textContent = t(`un.mode.${v}.d`); App.saveSettings({ uninstallMode: v }); })), modeDesc));
      m.setFoot(h('div', { class: 'spacer' }), h('button', { class: 'btn ghost', onClick: () => m.close() }, t('common.cancel')),
        h('button', { class: `btn ${force ? 'danger' : 'primary'}`, onClick: () => this.runWizard(m, p, { mode, restore, quiet, force }) }, icon('play'), t('un.wiz.start')));
    },

    async runWizard(m, p, { mode, restore, quiet, force }) {
      m.setClosable(false);
      m.setStep(1, 4);
      const status = h('div', { class: 'muted small', style: { minHeight: '18px' } }, '');
      if (restore) {
        m.setBody(h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.wiz.restoring'))));
        m.setFoot();
        await App.invoke('restore:create');
      }
      if (!force && p.hasUninstaller) {
        const skip = h('button', { class: 'btn', onClick: () => App.invoke('uninstall:skip') }, icon('chevronRight'), t('un.wiz.skip'));
        m.setBody(h('div', { class: 'empty' }, h('div', { class: 'card-icon', style: { width: '56px', height: '56px', borderRadius: '16px' } }, UI.spinner()),
          h('b', null, t('un.wiz.running')), h('span', null, t('un.wiz.runningText')), status));
        m.setFoot(h('div', { class: 'spacer' }), skip);
        const off = window.evl.on('uninstall:state', (s) => { if (s.names && s.names.length) status.textContent = t('un.wiz.processes', { list: s.names.join(', ') }); });
        await App.invoke('uninstall:run', { id: p.id, quiet });
        off();
      }
      m.setStep(2, 4);
      m.setBody(h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.wiz.scanning'))));
      m.setFoot();
      const items = await App.invoke('uninstall:scan', { id: p.id, mode, program: p });
      this.showLeftovers(m, [{ program: p, items: Array.isArray(items) ? items : [] }]);
    },

    showLeftovers(m, groups) {
      m.setStep(2, 4);
      m.setClosable(true);
      const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, _program: g.program })));
      m.setTitle(all.length ? t('un.wiz.leftovers') : t('un.wiz.none'));
      if (!all.length) {
        m.setStep(3, 4);
        m.setBody(h('div', { class: 'empty' }, h('div', { class: 'card-icon', style: { width: '56px', height: '56px', borderRadius: '16px' } }, icon('checkCircle')), h('b', null, t('un.wiz.none')), h('span', null, t('un.wiz.noneText'))));
        m.setFoot(h('div', { class: 'spacer' }), h('button', { class: 'btn primary', onClick: () => { m.close(); this.load(true); } }, t('common.finish')));
        return;
      }
      const checked = new Set(all.filter((i) => i.checked).map((i, n) => all.indexOf(i)));
      const delBtn = h('button', { class: 'btn danger' });
      const updateBtn = () => {
        clear(delBtn).append(icon('trash'), t('un.wiz.delete', { n: checked.size }));
        delBtn.disabled = !checked.size;
      };
      const body = h('div');
      body.appendChild(h('p', { class: 'dim', style: { marginTop: 0 } }, t('un.wiz.leftoversText')));
      const allBox = h('input', { type: 'checkbox', class: 'check', checked: checked.size === all.length });
      allBox.addEventListener('change', () => {
        checked.clear();
        if (allBox.checked) all.forEach((_, n) => checked.add(n));
        for (const [n, box] of boxes) box.checked = checked.has(n);
        updateBtn();
      });
      body.appendChild(h('label', { class: 'row small dim', style: { gap: '8px', marginBottom: '10px', cursor: 'pointer' } }, allBox, t('common.selectAll')));
      const boxes = new Map();
      for (const g of ['files', 'registry', 'system']) {
        const items = all.map((i, n) => [i, n]).filter(([i]) => GROUP_OF[i.kind] === g);
        if (!items.length) continue;
        const wrap = h('div', { class: 'leftover-group' }, h('h4', null, icon(g === 'files' ? 'folder' : g === 'registry' ? 'database' : 'service'), t(`un.lo.${g}`), h('span', { class: 'muted' }, `(${items.length})`)));
        for (const [i, n] of items) {
          const box = h('input', { type: 'checkbox', class: 'check', checked: checked.has(n) });
          box.addEventListener('change', () => { if (box.checked) checked.add(n); else checked.delete(n); updateBtn(); });
          boxes.set(n, box);
          const conf = i.confidence === 'high' ? 'accent' : i.confidence === 'medium' ? 'warn' : 'danger';
          const row = h('label', { class: 'leftover' }, box, icon(KIND_ICON[i.kind] || 'file'),
            h('span', { class: 'p ellipsis selectable', title: itemLabel(i) }, groups.length > 1 ? `[${i._program.name}] ` : '', itemLabel(i)),
            h('span', { class: 'small muted num' }, i.size ? UI.bytes(i.size) : ''),
            h('span', { class: `pill ${conf}` }, t(`un.conf.${i.confidence}`)));
          wrap.appendChild(row);
        }
        body.appendChild(wrap);
      }
      m.setBody(body);
      delBtn.addEventListener('click', () => this.deleteLeftovers(m, groups, all.filter((_, n) => checked.has(n))));
      updateBtn();
      m.setFoot(h('button', { class: 'btn ghost', onClick: () => { m.close(); this.load(true); } }, t('un.wiz.keep')), h('div', { class: 'spacer' }), delBtn);
    },

    async deleteLeftovers(m, groups, chosen) {
      m.setClosable(false);
      m.setBody(h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.wiz.deleting'))));
      m.setFoot();
      const total = { bytes: 0, keys: 0, failures: 0, backups: [], logId: null };
      for (const g of groups) {
        const items = chosen.filter((i) => i._program === g.program).map(({ _program, ...rest }) => rest);
        if (!items.length) continue;
        const r = await App.invoke('uninstall:delete', { program: g.program, items });
        if (!r || r.ok === false) continue;
        total.bytes += r.bytes;
        total.keys += r.keys + r.values;
        total.failures += r.failures.length;
        if (r.backup) total.backups.push(r.backup);
        if (r.logId) total.logId = r.logId;
      }
      m.setStep(3, 4);
      m.setClosable(true);
      m.setTitle(t('un.wiz.done'));
      const body = h('div', { class: 'empty', style: { paddingBottom: '20px' } },
        h('div', { class: 'card-icon', style: { width: '56px', height: '56px', borderRadius: '16px' } }, icon('checkCircle')),
        h('b', null, t('un.wiz.done')), h('span', null, t('un.wiz.doneText', { size: UI.bytes(total.bytes), keys: total.keys })));
      const extra = h('div', { class: 'col', style: { marginTop: '6px' } });
      if (App.state.settings.recycleLeftovers) extra.appendChild(h('div', { class: 'small muted' }, t('un.wiz.recycle')));
      if (total.failures) extra.appendChild(h('div', { class: 'small', style: { color: 'var(--warn)' } }, t('un.wiz.failures', { n: total.failures })));
      for (const b of total.backups) {
        extra.appendChild(h('div', { class: 'small muted' }, t('un.wiz.backup'), ' ', h('button', { class: 'link', onClick: () => App.invoke('shell:showItem', b) }, b.split('\\').pop())));
      }
      m.setBody(body, extra);
      m.setFoot(total.logId ? h('button', { class: 'btn', onClick: () => { m.close(); App.navigate('logs', { open: total.logId }); } }, icon('list'), t('common.viewLog')) : null,
        h('div', { class: 'spacer' }), h('button', { class: 'btn primary', onClick: () => { m.close(); this.checked.clear(); this.load(true); } }, t('common.finish')));
    },

    async batch(list) {
      const quietCheck = h('input', { type: 'checkbox', class: 'check', checked: true });
      const names = h('div', { class: 'log', style: { marginTop: '12px' } }, list.map((p) => h('div', null, `• ${p.name}`)));
      const m = UI.modal({ title: t('un.batchTitle', { n: list.length }), iconName: 'package', iconKind: 'danger', steps: 4, body: h('div', null, h('p', { class: 'dim', style: { marginTop: 0 } }, t('un.batchText')), names,
        h('label', { class: 'setting', style: { cursor: 'pointer' } }, quietCheck, h('div', { class: 'txt' }, h('b', null, t('un.wiz.quiet'))))) });
      m.setFoot(h('div', { class: 'spacer' }), h('button', { class: 'btn ghost', onClick: () => m.close() }, t('common.cancel')),
        h('button', { class: 'btn danger', onClick: async () => {
          m.setClosable(false);
          m.setStep(1, 4);
          const groups = [];
          const mode = App.state.settings.uninstallMode || 'moderate';
          if (App.state.info.elevated) {
            m.setBody(h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.wiz.restoring'))));
            m.setFoot();
            await App.invoke('restore:create');
          }
          for (const [n, p] of list.entries()) {
            const status = h('div', { class: 'muted small' }, '');
            m.setBody(h('div', { class: 'empty' }, UI.lazyIcon(p.icon, p.name, 'lg'), h('b', null, `${n + 1}/${list.length} · ${p.name}`), h('span', null, t('un.wiz.runningText')), status));
            m.setFoot(h('div', { class: 'spacer' }), h('button', { class: 'btn', onClick: () => App.invoke('uninstall:skip') }, t('un.wiz.skip')));
            const off = window.evl.on('uninstall:state', (s) => { if (s.names && s.names.length) status.textContent = t('un.wiz.processes', { list: s.names.join(', ') }); });
            if (p.hasUninstaller) await App.invoke('uninstall:run', { id: p.id, quiet: quietCheck.checked });
            off();
            const items = await App.invoke('uninstall:scan', { id: p.id, mode, program: p });
            groups.push({ program: p, items: Array.isArray(items) ? items : [] });
          }
          this.showLeftovers(m, groups);
        } }, icon('trash'), t('un.batch', { n: list.length })));
    },

    drawStore() {
      if (!this.store) {
        this.body.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.loadingStore')))));
        return;
      }
      const search = h('input', { placeholder: t('un.storeSearch'), value: this.storeQuery || '' });
      search.addEventListener('input', () => { this.storeQuery = search.value.trim().toLowerCase(); this.drawStoreGrid(); });
      const sys = UI.sw(this.showSystem, (v) => { this.showSystem = v; this.drawTabs(); this.drawStoreGrid(); });
      const selAll = h('button', { class: 'btn sm', onClick: () => {
        let apps = this.store.filter((a) => (this.showSystem || !a.system) && !a.protected);
        if (this.storeQuery) apps = apps.filter((a) => `${a.name} ${a.packageName} ${a.publisher}`.toLowerCase().includes(this.storeQuery));
        apps.forEach((a) => this.storeChecked.add(a.id));
        this.drawStoreGrid();
      } }, icon('check'), t('common.selectAll'));
      this.body.appendChild(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('div', { class: 'search' }, icon('search'), search), selAll, h('div', { class: 'spacer' }),
        h('label', { class: 'row small dim', style: { gap: '8px', cursor: 'pointer' } }, sys, t('un.storeSystem'))));
      this.storeGrid = h('div', { class: 'store-grid' });
      this.storeBar = h('div');
      this.body.append(this.storeGrid, this.storeBar);
      this.drawStoreGrid();
    },

    drawStoreGrid() {
      clear(this.storeGrid);
      let apps = this.store.filter((a) => this.showSystem || !a.system);
      if (this.storeQuery) apps = apps.filter((a) => `${a.name} ${a.packageName} ${a.publisher}`.toLowerCase().includes(this.storeQuery));
      if (!apps.length) this.storeGrid.appendChild(UI.empty('bag', t('un.storeEmpty')));
      for (const a of apps) {
        const box = h('input', { type: 'checkbox', class: 'check', checked: this.storeChecked.has(a.id), disabled: a.protected });
        const card = h('div', { class: `store-card${this.storeChecked.has(a.id) ? ' sel' : ''}${a.protected ? ' prot' : ''}` },
          box, UI.lazyIcon(a.logo, a.name),
          h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { class: 'strong ellipsis', title: a.name }, a.name), h('div', { class: 'tiny muted ellipsis' }, a.protected ? t('un.storeProtected') : [a.publisher, a.version].filter(Boolean).join(' · '))));
        const toggle = () => {
          if (a.protected) return;
          if (this.storeChecked.has(a.id)) this.storeChecked.delete(a.id); else this.storeChecked.add(a.id);
          box.checked = this.storeChecked.has(a.id);
          card.classList.toggle('sel', box.checked);
          this.drawStoreBar();
        };
        card.addEventListener('click', (e) => { if (e.target !== box) toggle(); });
        box.addEventListener('change', () => { if (box.checked !== this.storeChecked.has(a.id)) toggle(); });
        this.storeGrid.appendChild(card);
      }
      this.drawStoreBar();
    },

    drawStoreBar() {
      clear(this.storeBar);
      const list = this.store.filter((a) => this.storeChecked.has(a.id));
      if (!list.length) return;
      this.storeBar.appendChild(h('div', { class: 'selbar' }, h('div', { class: 'card-icon' }, icon('bag')), h('b', null, t('common.selected', { n: list.length })),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost', onClick: () => { this.storeChecked.clear(); this.drawStoreGrid(); } }, t('common.selectNone')),
        h('button', { class: 'btn danger', onClick: () => this.removeStore(list) }, icon('trash'), t('un.storeRemove', { n: list.length }))));
    },

    async removeStore(list) {
      const ok = await UI.confirm({ title: t('un.storeConfirm', { n: list.length }), text: `${t('un.storeConfirmText')}\n\n${list.map((a) => `• ${a.name}`).join('\n')}`, ok: t('un.storeRemove', { n: list.length }), danger: true, iconName: 'bag' });
      if (!ok) return;
      const m = UI.modal({ title: t('un.storeRemoving'), iconName: 'bag', closable: false, body: h('div', { class: 'empty' }, UI.spinner(), h('b', null, t('un.storeRemoving'))) });
      const r = await App.invoke('store:remove', list.map((a) => a.packageName));
      m.close();
      const removed = r && r.removed ? r.removed.length : 0;
      const failed = r && r.failed ? r.failed.length : 0;
      App.logToast(r, { title: t('un.storeDone', { n: removed }), text: failed ? t('un.storeFailed', { n: failed }) : '', kind: failed ? 'warn' : 'ok', icon: 'bag' });
      this.storeChecked.clear();
      this.loadStore();
    },
  };
})();
