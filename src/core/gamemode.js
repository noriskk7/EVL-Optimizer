'use strict';

const { foregroundFullscreen, processImagePath, isElevated } = require('./win32');
const sys = require('./sysinfo');
const memory = require('./memory');
const system = require('./system');
const settings = require('./settings');
const { runConsole } = require('./util');

const GAME_DIRS = /\\(steamapps\\common|epic games|riot games|xboxgames|windowsapps\\microsoft\.(minecraft|gaming)|ubisoft game launcher\\games|ea games|gog galaxy\\games|battle\.net\\games|rockstar games|fivem\.app|games)\\/i;
const LAUNCHERS = new Set(['steam.exe', 'steamwebhelper.exe', 'epicgameslauncher.exe', 'epicwebhelper.exe', 'riotclientservices.exe',
  'riotclientux.exe', 'riotclientuxrender.exe', 'battle.net.exe', 'agent.exe', 'eadesktop.exe', 'galaxyclient.exe',
  'ubisoftconnect.exe', 'upc.exe', 'rockstarlauncher.exe', 'xboxpcapp.exe', 'gamingservices.exe', 'crashreportclient.exe']);
const NOT_GAMES = new Set(['explorer.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe',
  'vlc.exe', 'mpc-hc64.exe', 'mpc-hc.exe', 'potplayermini64.exe', 'potplayermini.exe', 'mpv.exe', 'wmplayer.exe',
  'video.ui.exe', 'microsoft.media.player.exe', 'applicationframehost.exe', 'obs64.exe', 'powerpnt.exe', 'evl optimizer.exe',
  'electron.exe', 'searchhost.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'lockapp.exe',
  'textinputhost.exe', 'mstsc.exe', 'msrdc.exe', 'vmconnect.exe', 'parsecd.exe', 'moonlight.exe', 'evl videosystem.exe',
  'discord.exe', 'spotify.exe', 'netflix.exe', 'code.exe', 'windowsterminal.exe', 'claude.exe', 'chatgpt.exe']);

const ECO = new Set(['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'steamwebhelper.exe',
  'epicgameslauncher.exe', 'epicwebhelper.exe', 'battle.net.exe', 'eadesktop.exe', 'ealauncher.exe', 'galaxyclient.exe',
  'upc.exe', 'ubisoftconnect.exe', 'onedrive.exe', 'ms-teams.exe', 'teams.exe', 'msteams.exe', 'outlook.exe', 'olk.exe',
  'msedgewebview2.exe', 'widgets.exe', 'searchapp.exe', 'phoneexperiencehost.exe', 'googledrivefs.exe', 'dropbox.exe',
  'microsoftedgeupdate.exe', 'googleupdate.exe', 'adobeupdateservice.exe', 'creative cloud.exe', 'acrotray.exe']);

class GameMode {
  constructor(monitor, emit) {
    this.monitor = monitor;
    this.emit = emit;
    this.active = null;
    this.paths = new Map();
    this.lastStandby = 0;
    this.busy = false;
  }

  pathOf(p) {
    const key = `${p.pid}:${p.createTime}`;
    if (!this.paths.has(key)) {
      this.paths.set(key, processImagePath(p.pid));
      if (this.paths.size > 600) this.paths.delete(this.paths.keys().next().value);
    }
    return this.paths.get(key);
  }

  isGame(p, fullscreen) {
    const name = p.name.toLowerCase();
    const user = (settings.get().gmGames || []).map((g) => String(g).toLowerCase());
    if (user.includes(name)) return true;
    if (NOT_GAMES.has(name) || LAUNCHERS.has(name)) return false;
    const path = this.pathOf(p);
    if (path && GAME_DIRS.test(path)) return true;
    return fullscreen && !!path && !/\\windows\\/i.test(path);
  }

  async tick() {
    const cfg = settings.get();
    if (this.busy) return;
    if (!cfg.gameMode) {
      if (this.active) await this.leave();
      return;
    }
    const procs = this.monitor.procs;
    if (this.active) {
      const still = procs.find((p) => p.pid === this.active.pid && p.createTime === this.active.createTime);
      if (!still) { await this.leave(); return; }
      this.keepStandbyLow(cfg);
      return;
    }
    const fg = foregroundFullscreen();
    if (!fg.pid) return;
    const proc = procs.find((p) => p.pid === fg.pid);
    if (!proc || !this.isGame(proc, fg.fullscreen)) return;
    await this.enter(proc, cfg);
  }

  async enter(proc, cfg) {
    this.busy = true;
    try {
      const state = { pid: proc.pid, createTime: proc.createTime, name: proc.name, since: Date.now(), eco: [], plan: null, freed: 0, purges: 0 };
      this.active = state;
      this.emit({ type: 'enter', game: proc.name });

      if (cfg.gmPower) {
        const plans = await system.powerPlans();
        const current = plans.find((p) => p.active);
        const target = plans.find((p) => p.guid === system.ULTIMATE) || plans.find((p) => p.guid === system.HIGH)
          || { guid: await system.ensurePlan(system.HIGH) };
        if (current && target.guid && target.guid !== current.guid) {
          const r = await runConsole(`powercfg /setactive ${target.guid}`);
          if (r.code === 0) {
            state.plan = current.guid;
            settings.set({ gmPreviousPlan: current.guid });
          }
        }
      }

      const tree = new Set([proc.pid]);
      for (const p of this.monitor.procs) if (tree.has(p.ppid)) tree.add(p.pid);

      if (cfg.gmFree) {
        const r = await memory.freeMemory({ profile: 'game', stats: this.monitor.stats, exclude: tree, settleMs: 0, deep: false });
        state.freed = r.freed;
        state.freeResult = r;
      }

      if (cfg.gmEco) {
        for (const p of this.monitor.procs) {
          if (tree.has(p.pid) || !ECO.has(p.name.toLowerCase())) continue;
          if (memory.setEfficiency(p.pid, true)) state.eco.push({ pid: p.pid, createTime: p.createTime });
        }
      }
      this.emit({ type: 'active', game: proc.name, state: this.publicState(), free: state.freeResult || null, eco: state.eco.length, plan: !!state.plan });
    } finally {
      this.busy = false;
    }
  }

  keepStandbyLow(cfg) {
    if (!cfg.gmStandby || !isElevated() || Date.now() - this.lastStandby < 30_000) return;
    const lists = sys.memoryLists();
    if (!lists || lists.free + lists.zero > 1024 * 1048576 || lists.standbyLow < 256 * 1048576) return;
    this.lastStandby = Date.now();
    if (sys.memoryCommand(sys.MemoryCommand.PurgeLowPriorityStandbyList).ok) this.active.purges++;
  }

  async leave() {
    const state = this.active;
    if (!state) return;
    this.busy = true;
    try {
      for (const e of state.eco) {
        const alive = this.monitor.procs.find((p) => p.pid === e.pid && p.createTime === e.createTime);
        if (alive) memory.setEfficiency(e.pid, false);
      }
      if (state.plan) {
        await runConsole(`powercfg /setactive ${state.plan}`);
        settings.set({ gmPreviousPlan: null });
      }
      this.emit({ type: 'leave', game: state.name, minutes: Math.round((Date.now() - state.since) / 60_000), eco: state.eco.length, plan: !!state.plan, purges: state.purges });
    } finally {
      this.active = null;
      this.busy = false;
    }
  }

  async recover() {
    const prev = settings.get().gmPreviousPlan;
    if (prev) {
      await runConsole(`powercfg /setactive ${prev}`);
      settings.set({ gmPreviousPlan: null });
    }
  }

  publicState() {
    if (!this.active) return null;
    const s = this.active;
    return { game: s.name, since: s.since, eco: s.eco.length, freed: s.freed, purges: s.purges, plan: !!s.plan };
  }
}

module.exports = { GameMode };
