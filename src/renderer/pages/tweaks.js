'use strict';

(function () {
  const { h, icon, clear } = UI;
  const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';
  const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
  const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
  const TABS = [
    ['power', 'power'], ['performance', 'zap'], ['memory', 'memory'], ['privacy', 'eyeOff'], ['ai', 'bot'], ['disk', 'disk'], ['network', 'wifi'],
  ];

  Pages.tweaks = {
    render(el) {
      this.el = el;
      this.tab = this.tab || 'power';
      App.adminBanner(el);
      App.pageHead(el, t('tw.title'), t('tw.subtitle'));
      this.tabsEl = h('div', { class: 'tabs' });
      this.body = h('div');
      el.append(this.tabsEl, this.body);
      this.drawTabs();
      this.load();
    },

    async load() {
      const [list] = await Promise.all([App.invoke('tweaks:list')]);
      this.tweaks = Array.isArray(list) ? list : [];
      if (!this.el.isConnected) return;
      this.drawTabs();
      this.drawBody();
    },

    drawTabs() {
      clear(this.tabsEl);
      for (const [id, ic] of TABS) {
        const items = (this.tweaks || []).filter((x) => x.group === id);
        const on = items.filter((x) => x.applied).length;
        this.tabsEl.appendChild(h('button', { class: this.tab === id ? 'on' : '', onClick: () => { this.tab = id; this.drawTabs(); this.drawBody(); } },
          icon(ic), t(`tw.${id}`), items.length ? h('span', { class: 'n' }, `${on}/${items.length}`) : null));
      }
    },

    drawBody() {
      clear(this.body);
      if (this.tab === 'power') this.drawPower();
      else if (this.tab === 'disk') this.drawDisk();
      else if (this.tab === 'network') this.drawNetwork();
      else this.drawTweaks(this.tab);
    },

    async drawPower() {
      const card = h('div', { class: 'card' }, h('div', { class: 'skeleton', style: { height: '120px' } }));
      this.body.appendChild(card);
      const r = await App.invoke('power:list');
      if (!card.isConnected || !r) return;
      clear(card);
      const plans = r.plans || [];
      const copies = r.copies || {};
      const active = plans.find((p) => p.active);
      const isActive = (base) => !!active && (active.guid === base || active.guid === copies[base]);
      const cards = h('div', { class: 'grid g3' });
      for (const [guid, key, ic] of [[BALANCED, 'balanced', 'leaf'], [HIGH, 'high', 'zap'], [ULTIMATE, 'ultimate', 'rocket']]) {
        cards.appendChild(h('button', { class: `plan-card${isActive(guid) ? ' on' : ''}`, onClick: () => this.setPlan(guid) },
          icon(ic), isActive(guid) ? h('span', { class: 'pill accent' }, t('common.on')) : null,
          h('b', null, t(`plan.${key}`)), h('span', null, t(`plan.${key}.d`))));
      }
      card.appendChild(cards);
      const known = new Set([BALANCED, HIGH, ULTIMATE, ...Object.values(copies)]);
      const others = plans.filter((p) => !known.has(p.guid));
      if (others.length) {
        const chips = h('div', { class: 'chips', style: { marginTop: '12px' } }, h('span', { class: 'small muted', style: { alignSelf: 'center', marginRight: '4px' } }, t('plan.other')));
        for (const p of others) chips.appendChild(h('button', { class: `chip${p.active ? ' on' : ''}`, onClick: () => this.setPlan(p.guid) }, p.name));
        card.appendChild(chips);
      }
    },

    async setPlan(guid) {
      const r = await App.invoke('power:set', guid);
      App.logToast(r, r && r.ok ? { title: t('plan.set'), icon: 'power' } : { title: t('common.failed'), text: r && r.detail, kind: 'warn' });
      if (this.tab === 'power') this.drawBody();
    },

    drawTweaks(group) {
      const items = (this.tweaks || []).filter((x) => x.group === group);
      const card = h('div', { class: 'card' });
      for (const tw of items) {
        const sw = UI.sw(tw.applied, async (v, input) => {
          input.disabled = true;
          const r = await App.invoke(v ? 'tweaks:apply' : 'tweaks:revert', tw.id);
          if (r && r.ok) App.logToast(r, { title: v ? t('tw.applied') : t('tw.reverted'), text: `${t(`tweak.${tw.id}`)}${r.restart ? ` · ${t('common.restart')}` : ''}`, icon: 'sliders' });
          else App.logToast(r, { title: t('common.failed'), text: r && r.reason === 'admin' ? t('common.adminRequired') : '', kind: 'warn' });
          this.load();
        }, tw.locked || (tw.applied && !tw.revertible));
        card.appendChild(h('div', { class: 'setting' },
          h('div', { class: 'txt' }, h('b', null, t(`tweak.${tw.id}`)), h('span', null, t(`tweak.${tw.id}.d`)),
            tw.locked || tw.restart || tw.revertible ? h('div', { class: 'badges' },
              tw.locked ? h('span', { class: 'pill' }, icon('lock'), t('common.admin')) : null,
              tw.restart ? h('span', { class: 'pill info' }, icon('refresh'), t('common.restart')) : null,
              tw.revertible ? h('span', { class: 'pill accent' }, icon('undo'), t('common.revertible')) : null) : null),
          sw));
      }
      this.body.appendChild(card);
    },

    async drawDisk() {
      const card = h('div', { class: 'card' }, h('div', { class: 'skeleton', style: { height: '160px' } }));
      this.body.appendChild(card);
      const hib = await App.invoke('hibernate:get');
      if (!card.isConnected || !hib) return;
      clear(card);
      const desc = h('div', { class: 'small muted', style: { marginTop: '10px', minHeight: '18px' } }, t(`hib.${hib.mode}.d`));
      const seg = UI.seg([['off', t('hib.off')], ['reduced', t('hib.reduced')], ['full', t('hib.full')]], hib.mode, async (mode) => {
        desc.textContent = t(`hib.${mode}.d`);
        const r = await App.invoke('hibernate:set', mode);
        App.logToast(r, r && r.ok
          ? { title: t('hib.changed', { mode: t(`hib.${mode}`) }), text: r.after ? t('hib.size', { size: UI.bytes(r.after.bytes), ram: UI.bytes(r.after.ram) }) : '', icon: 'disk' }
          : { title: t('common.failed'), text: r && r.reason === 'admin' ? t('common.adminRequired') : r && r.detail, kind: 'warn' });
        this.drawBody();
      });
      if (hib.locked) seg.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      card.append(
        h('div', { class: 'card-head' }, h('div', { class: 'card-icon warn' }, icon('disk')), h('div', null, h('h3', null, t('hib.title')),
          h('div', { class: 'sub num' }, t('hib.size', { size: UI.bytes(hib.bytes), ram: UI.bytes(hib.ram) }))),
          hib.locked ? h('div', { class: 'right' }, h('span', { class: 'pill' }, icon('lock'), t('common.adminRequired'))) : null),
        h('p', { class: 'dim', style: { margin: '0 0 8px' } }, t('hib.what')),
        h('p', { class: 'small muted', style: { margin: '0 0 16px' } }, t('hib.ssd')),
        seg, desc);
    },

    drawNetwork() {
      const card = h('div', { class: 'card' });
      for (const action of ['flush-dns', 'renew-ip', 'reset-winsock', 'reset-tcp']) {
        const adminOnly = action.startsWith('reset');
        const btn = h('button', { class: 'btn sm', disabled: adminOnly && !App.state.info.elevated }, icon('play'), t('net.run'));
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          clear(btn).append(UI.spinner(), t('net.run'));
          const r = await App.invoke('network:run', action);
          App.logToast(r, r && r.ok ? { title: `${t(`net.${action}`)}: ${t('net.done')}`, text: r.restart ? t('common.restart') : '', icon: 'wifi' }
            : { title: t('common.failed'), text: r && (r.reason === 'admin' ? t('common.adminRequired') : r.detail), kind: 'warn' });
          btn.disabled = false;
          clear(btn).append(icon('play'), t('net.run'));
        });
        card.appendChild(h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', null, t(`net.${action}`)), h('span', null, t(`net.${action}.d`)),
          adminOnly && !App.state.info.elevated ? h('div', { class: 'badges' }, h('span', { class: 'pill' }, icon('lock'), t('common.admin'))) : null), btn));
      }
      this.body.appendChild(card);
    },
  };
})();
