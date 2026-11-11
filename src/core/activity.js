'use strict';

const { J, dataDir, readJson, writeJson } = require('./util');

const LIMIT = 300;
let cache = null;
const file = () => J(dataDir(), 'activity.json');

function list() {
  if (!cache) {
    const raw = readJson(file(), []);
    cache = Array.isArray(raw) ? raw : [];
  }
  return cache;
}

function add(entry) {
  const e = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    ok: true,
    verified: null,
    rows: [],
    ...entry,
  };
  e.rows = (e.rows || []).slice(0, 2000);
  cache = [e, ...list()].slice(0, LIMIT);
  writeJson(file(), cache);
  return e;
}

function clear() {
  cache = [];
  writeJson(file(), []);
}

const row = (key, vars = {}, status = 'info') => ({ key, vars, status });

module.exports = { list, add, clear, row };
