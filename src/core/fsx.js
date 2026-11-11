'use strict';

const { koffi } = require('./win32');

const kernel32 = koffi.load('kernel32.dll');
const FindFirstFileExW = kernel32.func('uintptr_t FindFirstFileExW(str16 path, int level, void *data, int op, void *filter, uint32 flags)');
const FindNextFileW = kernel32.func('int FindNextFileW(uintptr_t h, void *data)');
const FindClose = kernel32.func('int FindClose(uintptr_t h)');
const DeleteFileW = kernel32.func('int DeleteFileW(str16 path)');
const RemoveDirectoryW = kernel32.func('int RemoveDirectoryW(str16 path)');
const SetFileAttributesW = kernel32.func('int SetFileAttributesW(str16 path, uint32 attrs)');
const GetFileAttributesW = kernel32.func('uint32 GetFileAttributesW(str16 path)');
const GetLastError = kernel32.func('uint32 GetLastError()');

const INVALID = 0xffffffffffffffffn;
const ATTR_READONLY = 0x1;
const ATTR_DIRECTORY = 0x10;
const ATTR_REPARSE = 0x400;
const INVALID_ATTRS = 0xffffffff;

const BUSY = new Set([5, 32, 33, 145, 1224]);

const data = Buffer.alloc(600);

const longPath = (p) => (p.startsWith('\\\\?\\') ? p : '\\\\?\\' + p);

function list(dir) {
  const out = [];
  const h = FindFirstFileExW(longPath(dir) + '\\*', 1, data, 0, null, 2);
  if (h === INVALID || h === -1 || h === 0) return out;
  try {
    do {
      let end = 44;
      while (end < 564 && data.readUInt16LE(end) !== 0) end += 2;
      const name = data.toString('utf16le', 44, end);
      if (name === '.' || name === '..') continue;
      const attrs = data.readUInt32LE(0);
      const size = data.readUInt32LE(28) * 4294967296 + data.readUInt32LE(32);
      out.push({
        name,
        path: dir + '\\' + name,
        dir: (attrs & ATTR_DIRECTORY) !== 0,
        link: (attrs & ATTR_REPARSE) !== 0,
        readonly: (attrs & ATTR_READONLY) !== 0,
        size,
      });
    } while (FindNextFileW(h, data));
  } finally {
    FindClose(h);
  }
  return out;
}

function attributes(path) {
  const a = GetFileAttributesW(longPath(path));
  return a === INVALID_ATTRS ? null : a;
}

function entryOf(path) {
  const a = attributes(path);
  if (a === null) return null;
  const cut = path.lastIndexOf('\\');
  let size = 0;
  if (!(a & ATTR_DIRECTORY)) {
    const parent = list(path.slice(0, cut)).find((e) => e.name.toLowerCase() === path.slice(cut + 1).toLowerCase());
    size = parent ? parent.size : 0;
  }
  return { name: path.slice(cut + 1), path, dir: (a & ATTR_DIRECTORY) !== 0, link: (a & ATTR_REPARSE) !== 0, readonly: (a & ATTR_READONLY) !== 0, size };
}

const isDir = (path) => {
  const a = attributes(path);
  return a !== null && (a & ATTR_DIRECTORY) !== 0;
};

const exists = (path) => attributes(path) !== null;

const tick = () => new Promise((r) => setImmediate(r));

async function measure(entry, totals, cancelled) {
  const stack = [entry];
  let n = 0;
  while (stack.length) {
    if (cancelled()) return;
    const e = stack.pop();
    if (e.link) continue;
    if (e.dir) {
      for (const child of list(e.path)) stack.push(child);
    } else {
      totals.bytes += e.size;
      totals.files += 1;
    }
    if (++n % 1500 === 0) await tick();
  }
}

function removeOne(e, result) {
  if (e.readonly) SetFileAttributesW(longPath(e.path), 0x80);
  const ok = e.dir ? RemoveDirectoryW(longPath(e.path)) : DeleteFileW(longPath(e.path));
  if (ok) return true;
  const code = GetLastError();
  if (code === 2 || code === 3) return true;
  if (BUSY.has(code)) result.skipped++;
  else result.failures++;
  return false;
}

async function remove(entry, result, cancelled) {
  const order = [];
  const stack = [entry];
  let n = 0;
  while (stack.length) {
    if (cancelled()) break;
    const e = stack.pop();
    order.push(e);
    if (e.dir && !e.link) for (const child of list(e.path)) stack.push(child);
    if (++n % 1500 === 0) await tick();
  }
  for (let i = order.length - 1; i >= 0; i--) {
    if (cancelled()) { result.cancelled = true; return; }
    const e = order[i];
    if (removeOne(e, result)) {
      if (e.dir) result.directories++;
      else {
        result.files++;
        result.bytes += e.size;
      }
    }
    if (i % 1500 === 0) await tick();
  }
}

module.exports = { list, entryOf, isDir, exists, measure, remove, attributes, longPath };
