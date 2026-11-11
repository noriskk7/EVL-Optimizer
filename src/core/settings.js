'use strict';

const { J, dataDir, readJson, writeJson } = require('./util');

const DEFAULTS = {
  lang: 'auto',
  trayOnClose: true,
  startWithWindows: false,
  autoFree: false,
  autoFreeThreshold: 85,
  deepFree: false,
  gameMode: false,
  gmPower: true,
  gmFree: true,
  gmEco: true,
  gmStandby: true,
  gmGames: [],
  gmPreviousPlan: null,
  recycleLeftovers: true,
  restorePointBeforeDebloat: true,
  uninstallMode: 'moderate',
  welcomed: false,
  theme: { accent: '#ff8a3d', bg: 'carbon', scale: 1, radius: 'round', density: 'comfortable', motion: true, glow: true },
  planCopies: {},
  benchHistory: [],
  benchStress: true,
  freeHistory: [],
};

let cache = null;
const file = () => J(dataDir(), 'optimizer.json');

function get() {
  if (!cache) cache = { ...DEFAULTS, ...readJson(file(), {}) };
  return cache;
}

function set(patch) {
  const next = { ...get() };
  for (const [k, v] of Object.entries(patch || {})) if (k in DEFAULTS) next[k] = v;
  cache = next;
  writeJson(file(), next);
  return next;
}

module.exports = { get, set, DEFAULTS };
