'use strict';

(function () {
  const { h, icon, clear } = UI;
  const PARTS = [['cpu1', 'cpu'], ['cpuN', 'cpu'], ['gpu', 'gpu'], ['ram', 'memory'], ['disk', 'disk']];
  const TIER_COLOR = { basic: 'var(--danger)', mid: 'var(--warn)', good: 'var(--good)', great: 'var(--info)', top: 'var(--violet)' };
  const level = (s) => (s >= 80 ? 'great' : s >= 55 ? 'good' : s >= 30 ? 'ok' : 'weak');
  const levelClass = (s) => (s >= 55 ? 'good' : s >= 30 ? 'warn' : 'danger');

  Pages.benchmark = {
    render(el) {
      this.el = el;
      this.stress = App.state.settings.benchStress !== false;
      App.pageHead(el, t('bm.title'), t('bm.subtitle'), [
        h('label', { class: 'row small dim', style: { gap: '8px', cursor: 'pointer' } }, UI.sw(this.stress, (v) => { this.stress = v; }), t('bm.includeStress')),
      ]);
      this.ring = UI.ring(170, 12);
      this.scoreEl = h('b', null, '—');
      this.ring.center.append(h('div', null, this.scoreEl, h('span', null, t('bm.of100'))));
      this.tierEl = h('div', { class: 'tier' }, '');
      this.tierDesc = h('p', { style: { margin: '6px 0 0' } }, '');
      this.specs = h('div', { class: 'small muted', style: { marginTop: '10px' } }, '');
      this.runBtn = h('button', { class: 'btn primary xl', onClick: () => this.run() }, icon('play'), t('bm.run'));
      this.phase = h('div', { class: 'small muted', style: { minHeight: '18px', textAlign: 'right' } }, t('bm.hint'));
      this.prog = h('div', { class: 'progress hidden', style: { width: '260px' } }, h('i', { style: { width: '0%' } }));
      el.appendChild(h('div', { class: 'card hero' }, this.ring,
        h('div', { style: { position: 'relative', minWidth: 0 } }, this.tierEl, this.tierDesc, this.specs),
        h('div', { class: 'actions', style: { alignItems: 'flex-end' } }, this.runBtn, this.prog, this.phase)));

      this.partsEl = h('div');
      this.verdictEl = h('div');
      this.stressEl = h('div');
      el.appendChild(h('div', { class: 'grid g2 mt' },
        h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon' }, icon('gauge')), h('h3', null, t('bm.parts'))), this.partsEl),
        h('div', { class: 'grid', style: { gap: '14px', alignContent: 'start' } },
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon warn' }, icon('target')), h('h3', null, t('bm.verdict'))), this.verdictEl),
          h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('div', { class: 'card-icon danger' }, icon('flame')), h('div', null, h('h3', null, t('bm.stress')), h('div', { class: 'sub' }, t('bm.stressSub')))), this.stressEl))));
      this.histEl = h('div', { class: 'list' });
      el.appendChild(h('div', { class: 'card nopad mt' }, h('div', { class: 'card-head', style: { padding: '16px 18px 4px' } }, h('div', { class: 'card-icon info' }, icon('history')), h('h3', null, t('bm.history'))), this.histEl));
      this.off = window.evl.on('benchmark:progress', (p) => this.progress(p));
      const hist = App.state.settings.benchHistory || [];
      this.showHistory(hist);
      const last = hist.find((r) => r.version >= 2);
      if (last) this.showResult(last);
      else this.showEmpty();
    },

    leave() { if (this.off) this.off(); },

    showEmpty() {
      this.tierEl.textContent = t('bm.notRun');
      this.tierEl.className = 'tier';
      this.tierDesc.textContent = t('bm.notRunSub');
      const info = App.state.info;
      this.specs.textContent = `${info.cpu} · ${UI.bytes(info.ram)} RAM${info.gpu ? ` · ${info.gpu}` : ''}`;
      clear(this.partsEl).appendChild(UI.empty('gauge', t('bm.none')));
      clear(this.verdictEl).appendChild(h('div', { class: 'small muted' }, '—'));
      clear(this.stressEl).appendChild(h('div', { class: 'small muted' }, '—'));
    },

    showResult(r) {
      this.scoreEl.textContent = r.overall;
      this.ring.update(r.overall / 100, TIER_COLOR[r.tier]);
      this.tierEl.textContent = t(`bm.tier.${r.tier}`);
      this.tierEl.className = `tier tier-${r.tier}`;
      this.tierDesc.textContent = t(`bm.tier.${r.tier}.d`);
      const info = App.state.info;
      const gpuName = r.gpu && r.gpu.renderer ? r.gpu.renderer.replace(/^ANGLE \(([^,]+), (.+?) \(0x[0-9a-f]+\).*$/i, '$2').replace(/^ANGLE \((.+)\)$/i, '$1') : info.gpu;
      this.specs.textContent = `${info.cpu} · ${UI.bytes(info.ram)} RAM · ${gpuName || '—'}`;

      clear(this.partsEl);
      const raw = {
        cpu1: `${UI.num(r.cpuSingle)} pts`,
        cpuN: `${UI.num(r.cpuMulti)} pts · ${t('home.cpuSub', { n: r.threads })}`,
        gpu: r.gpu && r.gpu.ok && !r.gpu.software ? `${UI.num(r.gpu.gflops)} GFLOPS` : '—',
        ram: `${UI.num(r.ram, 1)} GB/s`,
        disk: `${UI.num(r.diskRead)} / ${UI.num(r.diskWrite)} MB/s`,
      };
      for (const [k, ic] of PARTS) {
        const s = r.scores[k];
        const missing = s === null || s === undefined;
        this.partsEl.appendChild(h('div', { class: 'score-row' },
          h('div', { class: 'card-icon', style: { width: '30px', height: '30px', borderRadius: '9px' } }, icon(ic)),
          h('div', { style: { minWidth: 0 } }, h('div', { class: 'lbl' }, t(`bm.part.${k}`), missing ? '' : h('span', { class: 'muted', style: { fontWeight: 500 } }, ` · ${t(`bm.level.${level(s)}`)}`)),
            h('div', { class: 'raw ellipsis' }, raw[k])),
          UI.meter(missing ? 0 : s / 100, missing ? '' : levelClass(s)),
          h('div', { class: 'num-big' }, missing ? '—' : s)));
      }

      clear(this.verdictEl);
      const vText = r.bottleneck ? t(`bm.advice.${r.bottleneck}`) : t('bm.balanced');
      this.verdictEl.appendChild(h('div', { class: 'verdict', style: { marginTop: 0 } }, icon(r.bottleneck ? 'alert' : 'checkCircle'), h('div', null, vText)));
      if (r.gpu && (!r.gpu.ok || r.gpu.software)) this.verdictEl.appendChild(h('div', { class: 'verdict' }, icon('info'), h('div', null, t('bm.gpuSoftware'))));
      else if (r.gpu && r.gpu.renderer) this.verdictEl.appendChild(h('div', { class: 'small muted', style: { marginTop: '10px' } }, t('bm.gpuOn', { renderer: r.gpu.renderer })));

      clear(this.stressEl);
      if (!r.stress) { this.stressEl.appendChild(h('div', { class: 'small muted' }, '—')); return; }
      const line = (label, s) => {
        if (!s) return h('div', { class: 'step skip' }, icon('minusCircle'), h('span', null, `${label}: —`));
        const pct = Math.round(s.ratio * 100);
        const kind = pct >= 95 ? 'stable' : pct >= 85 ? 'dip' : 'throttle';
        return h('div', { class: `step ${kind === 'stable' ? 'ok' : ''}` }, icon(kind === 'stable' ? 'checkCircle' : 'alert'),
          h('span', null, h('b', null, `${label}: ${t(`bm.${kind}`)}`), ` · ${t(`bm.${kind}.d`, { pct })}`));
      };
      this.stressEl.append(line('CPU', r.stress.cpu), line(t('bm.part.gpu'), r.stress.gpu));
      const canvas = h('canvas', { class: 'bm-live' });
      this.stressEl.appendChild(canvas);
      const norm = (s) => (s && s.per ? s.per.map((v) => v / Math.max(...s.per)) : []);
      requestAnimationFrame(() => UI.chart(canvas, [{ data: norm(r.stress.cpu), color: Theme.accent() }, { data: norm(r.stress.gpu), color: '#a08cff' }], { max: 1.05, grid: true }));
    },

    showHistory(list) {
      clear(this.histEl);
      if (!list.length) { this.histEl.appendChild(UI.empty('gauge', t('bm.none'))); return; }
      for (const r of list) {
        const v2 = r.version >= 2;
        this.histEl.appendChild(h('div', { class: 'list-row' }, h('div', { class: 'card-icon', style: { width: '30px', height: '30px', borderRadius: '9px' } }, icon('gauge')),
          h('div', { class: 'grow' },
            h('div', { class: 'title num' }, v2 ? h('span', { style: { color: TIER_COLOR[r.tier] } }, `${r.overall} · ${t(`bm.tier.${r.tier}`)}`) : `${UI.num(r.score)} (${t('bm.oldRun')})`),
            h('div', { class: 'meta num' }, v2
              ? `CPU ${r.scores.cpu1}/${r.scores.cpuN} · GPU ${r.scores.gpu === null ? '—' : r.scores.gpu} · RAM ${r.scores.ram} · ${t('bm.part.disk')} ${r.scores.disk}`
              : `CPU ${UI.num(r.cpuSingle)} / ${UI.num(r.cpuMulti)} · RAM ${UI.num(r.ram, 1)} GB/s`)),
          h('span', { class: 'tiny muted' }, new Date(r.at).toLocaleString(I18N.locale()))));
      }
    },

    progress(p) {
      const total = this.stress ? 6 : 5;
      let f = (p.step - 1) / total;
      if (p.phase === 'stress') {
        f = (5 + (p.second || 0) / (p.total || 20)) / total;
        this.phase.textContent = t('bm.phase.stress', { s: p.second || 0, total: p.total || 20 });
        if (p.cpu) this.live.cpu.push(p.cpu);
        if (p.gpu) this.live.gpu.push(p.gpu);
        if (this.liveCanvas) {
          const norm = (a) => a.map((v) => v / Math.max(...a));
          UI.chart(this.liveCanvas, [{ data: norm(this.live.cpu), color: Theme.accent() }, { data: norm(this.live.gpu), color: '#a08cff' }], { max: 1.05, points: 20, grid: true });
        }
      } else {
        this.phase.textContent = t(`bm.phase.${p.phase}`);
      }
      this.prog.firstChild.style.width = `${Math.min(f, 1) * 100}%`;
    },

    async run() {
      this.runBtn.disabled = true;
      clear(this.runBtn).append(UI.spinner(), t('bm.running'));
      this.prog.classList.remove('hidden');
      this.live = { cpu: [], gpu: [] };
      if (this.stress) {
        clear(this.stressEl);
        this.liveCanvas = h('canvas', { class: 'bm-live' });
        this.stressEl.appendChild(this.liveCanvas);
      }
      App.saveSettings({ benchStress: this.stress });
      try {
        const r = await App.invoke('benchmark:run', { stress: this.stress });
        const s = await App.invoke('settings:get');
        App.state.settings = s;
        if (r && r.version) {
          this.showResult(r);
          App.logToast(r, { title: `${r.overall} · ${t(`bm.tier.${r.tier}`)}`, text: t(`bm.tier.${r.tier}.d`), icon: 'gauge' });
        }
        this.showHistory(s.benchHistory || []);
      } finally {
        this.liveCanvas = null;
        this.runBtn.disabled = false;
        clear(this.runBtn).append(icon('play'), t('bm.run'));
        this.prog.classList.add('hidden');
        this.phase.textContent = t('bm.hint');
      }
    },
  };
})();
