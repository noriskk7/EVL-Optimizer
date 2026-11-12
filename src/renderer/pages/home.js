'use strict';

(function () {
  const { h, icon, clear } = UI;

  function health(snap, ctx) {
    const signals = [];
    let score = 100;
    const push = (sig) => {
      if (sig.level === 'attention') score -= sig.weight;
      if (sig.level === 'critical') score -= sig.weight * 2;
      signals.push(sig);
    };
    const level = (v, att, crit) => (v >= crit ? 'critical' : v >= att ? 'attention' : 'good');
    const adv = (key, lv) => t(`sig.${key}.${lv === 'good' ? 'good' : lv === 'attention' ? 'att' : 'crit'}`);

    const memLv = level(snap.ram.load, 0.8, 0.92);
    push({ area: t('sig.memory'), reading: t('sig.reading.memory', { pct: UI.pct(snap.ram.load), free: UI.bytes(snap.ram.available) }), advice: adv('memory', memLv), level: memLv, weight: 12 });
    const cpuAvg = ctx.cpuAvg !== undefined ? ctx.cpuAvg : snap.cpu;
    const cpuLv = level(cpuAvg, 0.6, 0.85);
    push({ area: t('sig.cpu'), reading: t('sig.reading.cpu', { pct: UI.pct(cpuAvg) }), advice: adv('cpu', cpuLv), level: cpuLv, weight: 8 });
    const used = snap.disk.total ? (snap.disk.total - snap.disk.free) / snap.disk.total : 0;
    const diskLv = level(used, 0.85, 0.93);
    push({ area: t('sig.disk'), reading: t('sig.reading.disk', { pct: UI.pct(used) }), advice: adv('disk', diskLv), level: diskLv, weight: 14 });
    const upLv = level(snap.uptime, 5 * 86400, 14 * 86400);
    push({ area: t('sig.uptime'), reading: UI.duration(snap.uptime), advice: adv('uptime', upLv), level: upLv, weight: 6 });
    const procLv = level(snap.processes, 240, 320);
    push({ area: t('sig.processes'), reading: t('sig.reading.processes', { n: snap.processes }), advice: adv('processes', procLv), level: procLv, weight: 6 });
    if (ctx.startup !== undefined) {
      const stLv = level(ctx.startup, 8, 15);
      push({ area: t('sig.startup'), reading: t('sig.reading.startup', { n: ctx.startup }), advice: adv('startup', stLv), level: stLv, weight: 8 });
    }
    if (ctx.leaks) {
      const lk = ctx.leaks[0];
      push({ area: t('sig.leaks'), reading: lk ? lk.name : '—', advice: lk ? t('sig.leaks.found', { name: lk.name, growth: UI.bytes(lk.growth) }) : t('sig.leaks.none'), level: lk ? 'attention' : 'good', weight: 6 });
    }
    if (ctx.license && ctx.license.status !== 'unknown') {
      const ok = ctx.license.status === 'licensed';
      push({ area: t('sig.license'), reading: t(`lic.${ctx.license.status}`), advice: ok ? (ctx.license.unofficial ? t('sig.license.kms') : t('sig.license.ok')) : t('sig.license.bad'), level: ok ? (ctx.license.unofficial ? 'attention' : 'good') : 'critical', weight: 4 });
    }
    push({ area: t('sig.admin'), reading: App.state.info.elevated ? t('shell.admin') : '—', advice: App.state.info.elevated ? t('sig.admin.yes') : t('sig.admin.no'), level: 'info', weight: 0 });
    score = Math.max(0, Math.min(100, score));
    const headline = score >= 85 ? t('home.healthy') : score >= 65 ? t('home.watch') : score >= 40 ? t('home.maintenance') : t('home.urgent');
    return { score, headline, signals };
  }

  const COLORS = { cpu: '#ff8a3d', ram: '#5ba8ff', gpu: '#a08cff', disk: '#22d3ee' };

  Pages.home = {
    render(el) {
      const st = App.state;
      this.el = el;
      this.ctx = {};
      this.hist = { cpu: [], ram: [], gpu: [], disk: [] };
      App.adminBanner(el);
      App.updateBanner(el);
      App.pageHead(el, t('home.title'), t('home.subtitle'));

      this.ring = UI.ring(148, 12);
      this.scoreNum = h('b', null, '—');
      this.ring.center.append(h('div', null, this.scoreNum, h('span', null, t('home.score'))));
      this.headline = h('h2', null, t('common.loading'));
      this.optBtn = h('button', { class: 'btn primary xl', onClick: () => this.optimize() }, icon('zap'), t('home.oneClick'));
      const quick = h('button', { class: 'btn lg', onClick: () => App.navigate('cleaner', { autoScan: true }) }, icon('broom'), t('home.quickClean'));
      this.heroChips = h('div', { class: 'chips', style: { marginTop: '14px' } });
      el.appendChild(h('div', { class: 'card hero' },
        this.ring,
        h('div', { style: { position: 'relative' } }, this.headline, h('p', null, t('home.heroText')), this.heroChips),
        h('div', { class: 'actions' }, this.optBtn, quick)));

      const tile = (key, ic, label) => {
        const val = h('div', { class: 'val' }, '—');
        const sub = h('div', { class: 'sub' }, ' ');
        const canvas = h('canvas');
        const card = h('div', { class: 'card metric' }, h('div', { class: 'top' }, icon(ic), label), val, sub, canvas);
        return { card, val, sub, canvas, key };
      };
      this.tiles = {
        cpu: tile('cpu', 'cpu', t('home.cpu')),
        ram: tile('ram', 'memory', t('home.ram')),
        gpu: tile('gpu', 'gpu', t('home.gpu')),
        disk: tile('disk', 'disk', t('home.disk')),
      };
      el.appendChild(h('div', { class: 'grid g4 mt' }, Object.values(this.tiles).map((x) => x.card)));

      this.signalsEl = h('div');
      this.machineEl = h('dl', { class: 'kv' });
      this.activityEl = h('div');
      el.appendChild(h('div', { class: 'grid g3 mt' },
        h('div', { class: 'card span2' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon('shield')), h('h3', null, t('home.signals'))), this.signalsEl),
        h('div', { class: 'grid', style: { gap: '14px', alignContent: 'start' } },
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon info' }, icon('windows')), h('h3', null, t('home.machine'))), this.machineEl),
          this.licenseCard = h('div', { class: 'card', dataset: { card: 'license' } }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon('key')), h('h3', null, t('lic.title')), h('div', { class: 'right' }, h('span', { class: 'pill' }, t('lic.checking'))))),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon violet' }, icon('clock')), h('h3', null, t('home.activity'))), this.activityEl))));

      this.renderMachine();
      this.renderActivity();
      App.invoke('startup:list').then((items) => { this.ctx.startup = Array.isArray(items) ? items.filter((i) => i.enabled).length : undefined; this.refreshHealth(); });
      App.invoke('memory:detail').then((d) => { this.ctx.leaks = d && d.leaks ? d.leaks : []; this.refreshHealth(); });
      App.invoke('license:get').then((lic) => { if (!this.el.isConnected || !lic) return; this.ctx.license = lic; this.renderLicense(lic); this.refreshHealth(); });
      App.invoke('metrics:history').then((hst) => {
        if (!hst || !hst.short) return;
        this.hist.cpu = hst.short.cpu.slice(-60);
        this.hist.ram = hst.short.ram.slice(-60);
        this.hist.gpu = hst.short.gpu.slice(-60);
        this.hist.disk = hst.short.disk.slice(-60);
      });
      this.offs = [App.on('free:done', () => this.renderActivity())];
    },

    leave() { (this.offs || []).forEach((f) => f()); },

    renderMachine() {
      const i = App.state.info;
      clear(this.machineEl);
      const row = (k, v) => [h('dt', null, k), h('dd', null, v)];
      this.uptimeEl = h('dd', null, '—');
      this.machineEl.append(
        ...row(t('home.os'), i.os), ...row(t('home.cpuName'), i.cpu), ...row(t('home.gpuName'), i.gpu || '—'),
        ...row(t('home.ramTotal'), UI.bytes(i.ram)), ...row(t('home.computer'), i.computer),
        h('dt', null, t('home.uptime')), this.uptimeEl);
    },

    renderLicense(lic) {
      const card = clear(this.licenseCard);
      const pill = lic.status === 'licensed' ? h('span', { class: 'pill good' }, icon('check'), t('lic.licensed'))
        : lic.status === 'unknown' ? h('span', { class: 'pill' }, t('lic.unknown'))
          : h('span', { class: `pill ${lic.status === 'unlicensed' ? 'danger' : 'warn'}` }, icon('alert'), t(`lic.${lic.status}`));
      card.appendChild(h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon('key')), h('h3', null, t('lic.title')), h('div', { class: 'right' }, pill)));
      const kv = h('dl', { class: 'kv' });
      const row = (k, v) => kv.append(h('dt', null, k), h('dd', null, v));
      row(t('lic.edition'), lic.edition);
      if (lic.channel) row(t('lic.channel'), t(`lic.channel.${lic.channel}`));
      if (lic.partialKey) row(t('lic.key'), `•••••-${lic.partialKey}`);
      row(t('lic.oemKey'), lic.oemKey ? t('lic.yes') : t('lic.no'));
      if (lic.channel === 'kms') {
        row(t('lic.kms'), lic.kmsHost || '—');
        if (lic.graceDays) row(t('lic.renews'), t('lic.days', { days: lic.graceDays }));
      }
      card.appendChild(kv);
      if (lic.unofficial) card.appendChild(h('div', { class: 'verdict' }, icon('alert'), h('div', { class: 'small' }, t('lic.unofficial'))));
      if (lic.status !== 'licensed' && lic.status !== 'unknown') card.appendChild(h('div', { class: 'verdict' }, icon('alert'), h('div', { class: 'small' }, t('lic.notActive'))));
      card.appendChild(h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn sm', onClick: () => App.invoke('shell:openSettings', 'activation') }, icon('external'), t('lic.open'))));
    },

    renderActivity() {
      App.invoke('settings:get').then((s) => {
        clear(this.activityEl);
        const items = (s.freeHistory || []).slice(0, 5);
        if (!items.length) { this.activityEl.appendChild(h('div', { class: 'muted small' }, t('home.noActivity'))); return; }
        for (const a of items) {
          this.activityEl.appendChild(h('div', { class: 'row', style: { padding: '6px 0' } },
            h('div', { class: 'card-icon', style: { width: '28px', height: '28px', borderRadius: '8px' } }, icon(a.profile === 'auto' ? 'refresh' : a.profile === 'game' ? 'gamepad' : 'zap')),
            h('div', { class: 'grow', style: { flex: 1 } }, h('div', { class: 'small strong' }, t(`home.act.${a.profile}`)), h('div', { class: 'tiny muted' }, UI.ago(a.at))),
            h('span', { class: 'small num strong', style: { color: 'var(--accent-hi)' } }, `−${UI.bytes(a.freed)}`)));
        }
      });
    },

    refreshHealth() {
      const snap = App.state.metrics;
      if (!snap || !snap.ram) return;
      const cpuHist = this.hist.cpu.slice(-10);
      this.ctx.cpuAvg = cpuHist.length ? cpuHist.reduce((a, b) => a + b, 0) / cpuHist.length : snap.cpu;
      const r = health(snap, this.ctx);
      this.scoreNum.textContent = r.score;
      this.ring.update(r.score / 100, r.score >= 85 ? 'var(--good)' : r.score >= 65 ? 'var(--warn)' : 'var(--danger)');
      this.headline.textContent = r.headline;
      clear(this.signalsEl);
      for (const s of r.signals) {
        this.signalsEl.appendChild(h('div', { class: 'sig' }, h('span', { class: `lv ${s.level}` }),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'row' }, h('b', null, s.area), h('span', { class: 'muted small num', style: { marginLeft: 'auto' } }, s.reading)),
            h('div', { class: 'small dim' }, s.advice))));
      }
      clear(this.heroChips);
      const bad = r.signals.filter((s) => s.level === 'attention' || s.level === 'critical');
      for (const s of bad.slice(0, 3)) this.heroChips.appendChild(h('span', { class: `pill ${s.level === 'critical' ? 'danger' : 'warn'}` }, s.area));
    },

    metrics(snap) {
      if (!this.tiles) return;
      const push = (k, v) => { this.hist[k].push(v); if (this.hist[k].length > 60) this.hist[k].shift(); };
      push('cpu', snap.cpu); push('ram', snap.ram.load); push('gpu', snap.gpu); push('disk', snap.disk.active);
      const T = this.tiles;
      T.cpu.val.textContent = UI.pct(snap.cpu);
      T.cpu.sub.textContent = t('home.cpuSub', { n: App.state.info.threads });
      T.ram.val.textContent = UI.pct(snap.ram.load);
      T.ram.sub.textContent = t('home.ramSub', { used: UI.bytes(snap.ram.used), total: UI.bytes(snap.ram.total) });
      T.gpu.val.textContent = UI.pct(snap.gpu);
      T.gpu.sub.textContent = App.state.info.vramTotal ? t('home.ramSub', { used: UI.bytes(snap.vram), total: UI.bytes(App.state.info.vramTotal) }) : t('home.gpuSub', { used: UI.bytes(snap.vram) });
      T.disk.val.textContent = UI.pct(snap.disk.active);
      T.disk.sub.textContent = t('home.diskSub', { free: UI.bytes(snap.disk.free), drive: 'C:' });
      for (const k of Object.keys(T)) UI.chart(T[k].canvas, [{ data: this.hist[k], color: k === 'cpu' ? Theme.accent() : COLORS[k] }], { max: 1, points: 60 });
      if (this.uptimeEl) this.uptimeEl.textContent = UI.duration(snap.uptime);
      this.tickN = (this.tickN || 0) + 1;
      if (this.tickN % 5 === 1) this.refreshHealth();
    },

    async optimize() {
      if (this.busy) return;
      this.busy = true;
      this.optBtn.disabled = true;
      clear(this.optBtn).append(UI.spinner(), t('home.optimizing'));
      try {
        const catalog = await App.invoke('cleaner:catalog');
        const safe = (catalog || []).filter((c) => c.safe && c.id !== 'browser-cache').map((c) => c.id);
        const [mem, clean] = await Promise.all([App.freeMemory(), App.invoke('cleaner:clean', safe)]);
        App.logToast(clean, { title: t('home.optimized'), text: t('home.optimizedText', { ram: UI.bytes(mem ? mem.freed : 0), disk: UI.bytes(clean ? clean.bytes : 0) }), icon: 'sparkles' });
      } finally {
        this.busy = false;
        this.optBtn.disabled = false;
        clear(this.optBtn).append(icon('zap'), t('home.oneClick'));
      }
    },
  };
})();
