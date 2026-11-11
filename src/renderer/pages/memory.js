'use strict';

(function () {
  const { h, icon, clear } = UI;
  const SEG = {
    active: ['#5ba8ff', 'mem.inUse'],
    compressed: ['#a08cff', 'mem.compressed'],
    modified: ['#f3b64a', 'mem.modified'],
    standby: ['#19b8a3', 'mem.standby'],
    free: ['#2dd48a', 'mem.free'],
    available: ['#2dd48a', 'mem.available'],
  };

  Pages.memory = {
    render(el) {
      this.el = el;
      this.hist = [];
      App.adminBanner(el);
      App.pageHead(el, t('mem.title'), t('mem.subtitle'));

      this.bigUse = h('div', { class: 'big-stat' }, '—');
      this.bigSub = h('div', { class: 'muted small num' }, '');
      this.stack = h('div', { class: 'stack-bar', style: { marginTop: '16px' } });
      this.legend = h('div', { class: 'legend' });
      this.chart = h('canvas', { class: 'chart', style: { height: '120px', marginTop: '16px' } });
      this.extra = h('div', { class: 'row wrap small muted num', style: { marginTop: '12px', gap: '18px' } });
      const comp = h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-icon info' }, icon('memory')), h('h3', null, t('mem.inUse')), h('div', { class: 'right' }, this.bigSub)),
        this.bigUse, this.stack, this.legend, this.extra,
        h('div', { class: 'small muted', style: { marginTop: '18px' } }, t('mem.history')), this.chart);

      this.orbRing = UI.ring(210, 6);
      this.orbRing.classList.add('orb-ring');
      this.orbTitle = h('b', null, t('mem.button'));
      this.orbSub = h('span', null, '');
      this.orb = h('button', { class: 'free-orb', onClick: () => App.freeMemory() }, this.orbRing, h('div', { class: 'orb-label' }, icon('zap'), this.orbTitle, this.orbSub));
      this.result = h('div', { style: { width: '100%' } });
      const freeCard = h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' } },
        h('div', { style: { padding: '8px 0 0' } }, this.orb), this.result);

      el.appendChild(h('div', { class: 'grid g2' }, comp, freeCard));

      this.heavyEl = h('div', { class: 'list' });
      this.leaksEl = h('div', { class: 'list' });
      const cfg = App.state.settings;
      const label = h('span', { class: 'small num strong' }, t('mem.threshold', { n: cfg.autoFreeThreshold }));
      const range = h('input', { type: 'range', min: 60, max: 95, step: 1, value: cfg.autoFreeThreshold });
      range.style.setProperty('--p', `${((cfg.autoFreeThreshold - 60) / 35) * 100}%`);
      range.addEventListener('input', () => { label.textContent = t('mem.threshold', { n: range.value }); range.style.setProperty('--p', `${((range.value - 60) / 35) * 100}%`); });
      range.addEventListener('change', () => App.saveSettings({ autoFreeThreshold: Number(range.value) }));

      el.appendChild(h('div', { class: 'grid g3 mt' },
        h('div', { class: 'card nopad' },
          h('div', { class: 'card-head', style: { padding: '16px 18px 0' } }, h('div', { class: 'card-icon warn' }, icon('activity')), h('div', null, h('h3', null, t('mem.heavy')), h('div', { class: 'sub' }, t('mem.heavySub')))),
          this.heavyEl),
        h('div', { class: 'card' },
          h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', null, t('mem.auto')), h('span', null, t('mem.autoSub'))),
            UI.sw(cfg.autoFree, (v) => App.saveSettings({ autoFree: v }))),
          h('div', { style: { padding: '6px 0 14px' } }, h('div', { class: 'row', style: { marginBottom: '10px' } }, label), range),
          h('div', { class: 'setting' }, h('div', { class: 'txt' }, h('b', null, t('mem.deep')), h('span', null, t('mem.deepSub'))),
            UI.sw(cfg.deepFree, (v) => App.saveSettings({ deepFree: v }), !App.state.info.elevated))),
        h('div', { class: 'grid', style: { gap: '14px', alignContent: 'start' } },
          h('div', { class: 'card nopad' },
            h('div', { class: 'card-head', style: { padding: '16px 18px 0' } }, h('div', { class: 'card-icon danger' }, icon('flame')), h('div', null, h('h3', null, t('mem.leaks')), h('div', { class: 'sub' }, t('mem.leaksSub')))),
            this.leaksEl),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon('info')), h('h3', null, t('mem.why'))),
            h('p', { class: 'small dim', style: { margin: 0 } }, t('mem.whyText'))))));

      this.offs = [
        App.on('memory:progress', (p) => this.progress(p)),
        App.on('free:start', () => this.setBusy(true)),
        App.on('free:done', (r) => { this.setBusy(false); if (r && r.before) this.showResult(r); this.load(); }),
      ];
      this.setBusy(App.state.freeing);
      App.invoke('metrics:history').then((hst) => { if (hst && hst.short) this.hist = hst.short.ram.slice(); });
      this.load();
      this.timer = setInterval(() => this.load(), 4000);
    },

    leave() {
      clearInterval(this.timer);
      (this.offs || []).forEach((f) => f());
    },

    async load() {
      const d = await App.invoke('memory:detail');
      if (!d || !d.total || !this.el.isConnected) return;
      this.detail = d;
      this.renderComposition(d);
      if (!App.state.freeing) this.orbSub.textContent = t('mem.buttonSub', { n: d.candidates, size: UI.bytes(d.candidateBytes) });
      this.renderHeavy(d.top);
      this.renderLeaks(d.leaks);
    },

    renderComposition(d) {
      this.bigUse.innerHTML = '';
      this.bigUse.append(UI.bytes(d.inUse), h('small', null, `/ ${UI.bytes(d.total)}`));
      this.bigSub.textContent = UI.pct(d.inUse / d.total);
      const parts = [];
      if (d.lists) {
        const free = d.lists.free + d.lists.zero;
        parts.push(['active', Math.max(d.inUse - d.compressed - d.lists.modified, 0)], ['compressed', d.compressed], ['modified', d.lists.modified], ['standby', d.lists.standby], ['free', free]);
      } else {
        parts.push(['active', Math.max(d.inUse - d.compressed, 0)], ['compressed', d.compressed], ['available', d.available]);
      }
      clear(this.stack);
      clear(this.legend);
      for (const [k, v] of parts) {
        const [color, label] = SEG[k];
        this.stack.appendChild(h('i', { style: { width: `${(v / d.total) * 100}%`, background: color }, title: `${t(label)}: ${UI.bytes(v)}` }));
        this.legend.appendChild(h('div', { class: 'item' }, h('span', { class: 'sw', style: { background: color } }), t(label), h('b', null, UI.bytes(v))));
      }
      clear(this.extra);
      this.extra.append(
        h('span', null, `${t('mem.commit')}: ${UI.bytes(d.commit)} / ${UI.bytes(d.commitLimit)}`),
        h('span', null, `${t('mem.cached')}: ${UI.bytes(d.cached)}`));
      if (!d.elevated) this.extra.appendChild(h('span', { style: { color: 'var(--warn)' } }, t('mem.adminHint')));
    },

    renderHeavy(top) {
      clear(this.heavyEl);
      for (const p of (top || []).slice(0, 7)) {
        this.heavyEl.appendChild(h('div', { class: 'list-row' },
          UI.lazyIcon(p.path, p.name, 'sm'),
          h('div', { class: 'grow' }, h('div', { class: 'title ellipsis' }, p.name.replace(/\.exe$/i, '')), h('div', { class: 'meta num' }, UI.bytes(p.memory))),
          h('div', { class: 'end' },
            h('button', { class: 'btn sm ghost', title: t('mem.trimOne'), onClick: async () => {
              const r = await App.invoke('process:trim', { pids: [p.pid], name: p.name });
              App.logToast(r, r && r.ok ? { title: t('proc.trimmed', { name: p.name }), icon: 'memory' } : { title: t('common.failed'), text: t('common.denied'), kind: 'warn' });
              this.load();
            } }, icon('memory')),
            h('button', { class: 'btn sm ghost', title: t('proc.kill'), onClick: () => this.kill(p) }, icon('x')))));
      }
    },

    async kill(p) {
      const ok = await UI.confirm({ title: t('proc.killConfirm', { name: p.name }), text: t('proc.killText'), ok: t('proc.kill'), danger: true });
      if (!ok) return;
      const r = await App.invoke('process:kill', { pids: [p.pid], name: p.name });
      App.logToast(r, r && r.ok ? { title: t('proc.killed', { name: p.name }) } : { title: t('common.failed'), text: r && r.reason === 'protected' ? t('proc.protected') : t('common.denied'), kind: 'warn' });
      this.load();
    },

    renderLeaks(leaks) {
      clear(this.leaksEl);
      if (!leaks || !leaks.length) {
        this.leaksEl.appendChild(h('div', { class: 'list-row' }, h('span', { class: 'lv good', style: { width: '8px', height: '8px', borderRadius: '50%' } }), h('span', { class: 'muted small' }, t('mem.leaksNone'))));
        return;
      }
      for (const l of leaks.slice(0, 4)) {
        this.leaksEl.appendChild(h('div', { class: 'list-row' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, l.name), h('div', { class: 'meta' }, t('home.leakLine', { growth: UI.bytes(l.growth), min: l.minutes }))),
          h('button', { class: 'btn sm', onClick: () => this.kill({ pid: l.pid, name: l.name }) }, t('proc.kill'))));
      }
    },

    setBusy(busy) {
      if (!this.orb) return;
      this.orb.disabled = busy;
      this.orb.classList.toggle('busy', busy);
      if (busy) {
        this.orbTitle.textContent = t('shell.freeing');
        clear(this.result);
      } else {
        this.orbTitle.textContent = t('mem.button');
        this.orbRing.update(0);
      }
    },

    progress(p) {
      if (!this.orb) return;
      const map = { measure: 0.05, trim: 0.25, system: 0.5 };
      if (p.phase === 'settle') {
        const f = 1 - p.remaining / p.total;
        this.orbRing.update(0.55 + f * 0.45);
        this.orbSub.textContent = t('mem.phase.settle', { s: Math.ceil(p.remaining / 1000) });
      } else {
        this.orbRing.update(map[p.phase] || 0.1);
        this.orbSub.textContent = t(`mem.phase.${p.phase}`);
      }
    },

    showResult(r) {
      clear(this.result);
      const freed = r.freed > 32 * 1048576;
      const head = freed
        ? h('div', { style: { textAlign: 'center' } }, h('div', { class: 'result-big' }, `−${UI.bytes(r.freed)}`), h('div', { class: 'strong', style: { marginTop: '6px' } }, t('mem.result')),
          h('div', { class: 'small muted', style: { marginTop: '4px' } }, t('mem.resultSub', { s: r.settleMs / 1000, before: UI.bytes(r.before.inUse), after: UI.bytes(r.after.inUse) })))
        : h('div', { style: { textAlign: 'center' } }, h('div', { class: 'strong', style: { fontSize: '17px' } }, t('mem.resultZero')), h('div', { class: 'small muted', style: { marginTop: '4px' } }, t('mem.resultZeroSub')));
      const steps = h('div', { class: 'steps' });
      for (const s of r.steps) {
        let text;
        let value = s.bytes ? UI.bytes(s.bytes) : '';
        if (s.id === 'trim') text = s.count ? t('mem.step.trim', { n: s.count }) : t('mem.step.trimNone');
        else if (s.id === 'admin') { text = t('mem.step.admin'); value = ''; }
        else text = t(`mem.step.${s.id}`);
        steps.appendChild(h('div', { class: `step ${s.ok ? 'ok' : 'skip'}` }, icon(s.ok ? 'checkCircle' : s.id === 'admin' ? 'lock' : 'minusCircle'), h('span', null, text), value ? h('span', { class: 'v' }, value) : null));
        if (s.id === 'trim' && (s.skippedActive || s.skippedProtected)) {
          steps.appendChild(h('div', { class: 'step skip' }, icon('shield'), h('span', null, t('mem.step.skipped', { n: s.skippedActive + s.skippedProtected }))));
        }
      }
      this.result.append(head, steps);
    },

    metrics(snap) {
      if (!this.chart) return;
      this.hist.push(snap.ram.load);
      if (this.hist.length > 300) this.hist.shift();
      UI.chart(this.chart, [{ data: this.hist, color: '#5ba8ff' }], { max: 1, points: 300, grid: true });
    },
  };
})();
