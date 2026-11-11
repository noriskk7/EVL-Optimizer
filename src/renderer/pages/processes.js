'use strict';

(function () {
  const { h, icon, clear } = UI;

  Pages.processes = {
    render(el) {
      this.el = el;
      this.sort = { key: 'memory', dir: -1 };
      this.query = '';
      this.grouped = true;
      App.adminBanner(el);
      const search = h('input', { placeholder: t('proc.search') });
      search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.draw(); });
      const groupSw = UI.sw(true, (v) => { this.grouped = v; this.draw(); });
      this.countEl = h('span', { class: 'muted small num' }, '');
      App.pageHead(el, t('proc.title'), t('proc.subtitle'), [
        this.countEl,
        h('label', { class: 'row small dim', style: { gap: '8px', cursor: 'pointer' } }, groupSw, t('proc.group')),
        h('div', { class: 'search' }, icon('search'), search),
      ]);
      this.thead = h('thead');
      this.tbody = h('tbody');
      el.appendChild(h('div', { class: 'card nopad' }, h('table', { class: 'table' }, this.thead, this.tbody)));
      this.drawHead();
      this.load();
      this.timer = setInterval(() => this.load(), 2000);
    },

    leave() { clearInterval(this.timer); },

    async load() {
      const list = await App.invoke('processes:list');
      if (!Array.isArray(list) || !this.el.isConnected) return;
      this.list = list;
      this.draw();
    },

    drawHead() {
      clear(this.thead);
      const th = (key, label, cls = '') => {
        const on = this.sort.key === key;
        return h('th', { class: `${cls}${on ? ' sorted' : ''}`, onClick: () => {
          this.sort = { key, dir: on ? -this.sort.dir : key === 'name' ? 1 : -1 };
          this.drawHead();
          this.draw();
        } }, label, on ? (this.sort.dir > 0 ? ' ↑' : ' ↓') : '');
      };
      this.thead.appendChild(h('tr', null, th('name', t('proc.name')), th('cpu', t('proc.cpu'), 'num'), th('gpu', t('proc.gpu'), 'num'), th('memory', t('proc.memory'), 'num'), h('th', { style: { width: '170px' } }, '')));
    },

    rows() {
      let list = this.list || [];
      if (this.query) list = list.filter((p) => p.name.toLowerCase().includes(this.query) || String(p.pid) === this.query);
      if (!this.grouped) return list.map((p) => ({ ...p, items: [p], count: 1 }));
      const map = new Map();
      for (const p of list) {
        const key = p.name.toLowerCase();
        let g = map.get(key);
        if (!g) { g = { name: p.name, path: p.path, cpu: 0, gpu: 0, memory: 0, items: [], protected: false, noTrim: false, eco: true, self: false }; map.set(key, g); }
        g.cpu += p.cpu; g.gpu += p.gpu; g.memory += p.memory; g.items.push(p);
        g.protected = g.protected || p.protected;
        g.noTrim = g.noTrim || p.noTrim;
        g.eco = g.eco && p.eco;
        g.self = g.self || p.self;
        if (!g.path && p.path) g.path = p.path;
      }
      return [...map.values()].map((g) => ({ ...g, count: g.items.length, pid: g.items[0].pid }));
    },

    draw() {
      if (!this.list) return;
      const rows = this.rows();
      const { key, dir } = this.sort;
      rows.sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) * dir : ((a[key] || 0) - (b[key] || 0)) * dir));
      this.countEl.textContent = t('proc.count', { n: this.list.length });
      clear(this.tbody);
      const frag = document.createDocumentFragment();
      for (const r of rows.slice(0, 250)) {
        const heat = (v, scale) => {
          const a = Math.min(v / scale, 1);
          return h('span', { class: 'heat', style: { background: a > 0.02 ? `rgba(45,212,138,${0.06 + a * 0.3})` : 'transparent', color: a > 0.5 ? 'var(--text)' : '' } });
        };
        const cpu = heat(r.cpu, 0.5); cpu.textContent = UI.pct(r.cpu, 1);
        const gpu = heat(r.gpu / 100, 0.6); gpu.textContent = r.gpu ? `${UI.num(r.gpu, 1)}%` : '0%';
        const mem = heat(r.memory, 2 * 1073741824); mem.textContent = UI.bytes(r.memory);
        const actions = h('div', { class: 'row', style: { gap: '4px', justifyContent: 'flex-end' } },
          h('button', { class: 'btn sm ghost icon', title: t('proc.trim'), disabled: r.noTrim, onClick: () => this.trim(r) }, icon('memory')),
          h('button', { class: `btn sm ghost icon${r.eco ? ' outline-accent' : ''}`, title: r.eco ? t('proc.ecoOff') : t('proc.eco'), disabled: r.protected || r.self, onClick: () => this.eco(r) }, icon('leaf')),
          h('button', { class: 'btn sm ghost icon', title: t('proc.open'), disabled: !r.path, onClick: () => App.invoke('shell:showItem', r.path) }, icon('folder')),
          h('button', { class: 'btn sm ghost icon', title: r.protected ? t('proc.protected') : t('proc.kill'), disabled: r.protected || r.self, onClick: () => this.kill(r) }, icon('x')));
        frag.appendChild(h('tr', null,
          h('td', null, h('div', { class: 'row' }, UI.lazyIcon(r.path, r.name, 'sm'),
            h('div', { style: { minWidth: 0 } }, h('div', { class: 'strong ellipsis' }, r.name.replace(/\.exe$/i, ''), r.count > 1 ? h('span', { class: 'muted', style: { fontWeight: 500 } }, ` (${r.count})`) : null),
              h('div', { class: 'tiny muted' }, r.count > 1 ? '' : `PID ${r.pid}`)),
            r.eco ? h('span', { class: 'pill accent', style: { marginLeft: '6px' } }, icon('leaf'), 'eco') : null)),
          h('td', { class: 'num' }, cpu), h('td', { class: 'num' }, gpu), h('td', { class: 'num' }, mem), h('td', null, actions)));
      }
      this.tbody.appendChild(frag);
    },

    async trim(r) {
      const x = await App.invoke('process:trim', { pids: r.items.map((p) => p.pid), name: r.name });
      App.logToast(x, x && x.ok ? { title: t('proc.trimmed', { name: r.name }), text: x.freed ? `−${UI.bytes(x.freed)}` : '', icon: 'memory' } : { title: t('common.failed'), text: t('common.denied'), kind: 'warn' });
      this.load();
    },

    async eco(r) {
      const on = !r.eco;
      const x = await App.invoke('process:efficiency', { items: r.items.map((p) => ({ pid: p.pid, createTime: p.createTime })), on, name: r.name });
      const ok = x && x.ok;
      App.logToast(x, ok ? { title: on ? t('proc.eco') : t('proc.ecoOff'), text: on ? t('proc.ecoOn', { name: r.name }) : t('proc.ecoRemoved', { name: r.name }), icon: 'leaf' } : { title: t('common.failed'), text: t('common.denied'), kind: 'warn' });
      this.load();
    },

    async kill(r) {
      const ok = await UI.confirm({ title: t('proc.killConfirm', { name: r.name }), text: t('proc.killText'), ok: t('proc.kill'), danger: true });
      if (!ok) return;
      const x = await App.invoke('process:kill', { pids: r.items.map((p) => p.pid), name: r.name });
      App.logToast(x, x && x.ok ? { title: t('proc.killed', { name: r.name }) } : { title: t('common.failed'), text: x && x.reason === 'protected' ? t('proc.protected') : t('common.denied'), kind: 'warn' });
      this.load();
    },
  };
})();
