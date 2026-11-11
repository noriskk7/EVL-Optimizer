'use strict';

(function () {
  const { h, icon, clear } = UI;
  const SCOPE = { HKCU: 'start.user', HKLM: 'start.all', HKLM32: 'start.all', UserFolder: 'start.folder', CommonFolder: 'start.folder' };

  Pages.startup = {
    render(el) {
      this.el = el;
      App.adminBanner(el);
      this.count = h('span', { class: 'pill' }, '…');
      App.pageHead(el, t('start.title'), t('start.subtitle'), [this.count, h('button', { class: 'btn', onClick: () => this.load() }, icon('refresh'), t('common.refresh'))]);
      this.list = h('div', { class: 'card nopad' });
      el.appendChild(this.list);
      this.load();
    },

    async load() {
      const items = await App.invoke('startup:list');
      if (!this.el.isConnected) return;
      clear(this.list);
      if (!Array.isArray(items) || !items.length) {
        this.list.appendChild(UI.empty('rocket', t('start.empty')));
        this.count.textContent = '0';
        return;
      }
      this.count.textContent = t('start.enabled', { n: items.filter((i) => i.enabled).length, total: items.length });
      for (const item of items) {
        const sw = UI.sw(item.enabled, async (v, input) => {
          const r = await App.invoke('startup:toggle', { id: item.id, enabled: v });
          if (r && r.ok) {
            App.logToast(r, { title: v ? t('start.on', { name: item.name }) : t('start.off', { name: item.name }), icon: 'rocket' });
            this.load();
          } else {
            input.checked = !v;
            UI.toast({ title: t('common.failed'), text: r && r.reason === 'admin' ? t('common.adminRequired') : t('common.denied'), kind: 'warn' });
          }
        }, !item.canToggle);
        this.list.appendChild(h('div', { class: `list-row${item.enabled ? '' : ' disabled'}` },
          UI.lazyIcon(item.exists ? item.exe : '', item.name),
          h('div', { class: 'grow' },
            h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'title ellipsis' }, item.name),
              h('span', { class: 'pill' }, t(SCOPE[item.scope] || 'start.user')),
              !item.exists ? h('span', { class: 'pill warn' }, t('start.missing')) : null,
              !item.canToggle ? h('span', { class: 'pill' }, icon('lock'), t('common.admin')) : null),
            h('div', { class: 'meta ellipsis selectable', title: item.command }, item.command)),
          h('div', { class: 'end' },
            item.exists ? h('button', { class: 'btn sm ghost icon', title: t('common.openFolder'), onClick: () => App.invoke('shell:showItem', item.exe) }, icon('folder')) : null,
            sw)));
      }
    },
  };
})();
