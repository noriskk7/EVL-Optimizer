'use strict';

const { fn } = require('./win32');

const ROOTS = {
  HKCR: 0x80000000,
  HKCU: 0x80000001,
  HKLM: 0x80000002,
  HKU: 0x80000003,
};

const KEY_READ = 0x20019;
const KEY_WRITE = 0x20006;
const KEY_ALL = 0xf003f;
const KEY_WOW64_64KEY = 0x0100;

const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_BINARY = 3;
const REG_DWORD = 4;
const REG_MULTI_SZ = 7;
const REG_QWORD = 11;

const rootOf = (root) => (typeof root === 'string' ? ROOTS[root] : root);

function open(root, path, access = KEY_READ) {
  const out = [0];
  const status = fn.RegOpenKeyExW(rootOf(root), path, 0, access | KEY_WOW64_64KEY, out);
  return status === 0 ? out[0] : null;
}

function create(root, path) {
  const out = [0];
  const disposition = [0];
  const status = fn.RegCreateKeyExW(rootOf(root), path, 0, null, 0, KEY_ALL | KEY_WOW64_64KEY, null, out, disposition);
  return status === 0 ? out[0] : null;
}

function withKey(root, path, access, body, fallback = null) {
  const key = open(root, path, access);
  if (key === null) return fallback;
  try {
    return body(key);
  } finally {
    fn.RegCloseKey(key);
  }
}

function decode(type, buf, len) {
  switch (type) {
    case REG_SZ:
    case REG_EXPAND_SZ:
      return buf.toString('utf16le', 0, len).replace(/\0+$/, '').replace(/\0.*$/s, '');
    case REG_MULTI_SZ:
      return buf.toString('utf16le', 0, len).replace(/\0+$/, '').split('\0').filter(Boolean);
    case REG_DWORD:
      return len >= 4 ? buf.readUInt32LE(0) : 0;
    case REG_QWORD:
      return len >= 8 ? Number(buf.readBigUInt64LE(0)) : 0;
    default:
      return Buffer.from(buf.subarray(0, len));
  }
}

function encode(type, value) {
  switch (type) {
    case REG_SZ:
    case REG_EXPAND_SZ:
      return Buffer.from(String(value) + '\0', 'utf16le');
    case REG_MULTI_SZ:
      return Buffer.from((Array.isArray(value) ? value : [value]).join('\0') + '\0\0', 'utf16le');
    case REG_DWORD: {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(Number(value) >>> 0);
      return b;
    }
    case REG_QWORD: {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(BigInt(value));
      return b;
    }
    default:
      return Buffer.isBuffer(value) ? value : Buffer.from(value || []);
  }
}

function queryKey(key, name) {
  const type = [0];
  const size = [0];
  if (fn.RegQueryValueExW(key, name, null, type, null, size) !== 0) return null;
  const buf = Buffer.alloc(Math.max(size[0], 2) + 2);
  size[0] = buf.length;
  if (fn.RegQueryValueExW(key, name, null, type, buf, size) !== 0) return null;
  return { type: type[0], value: decode(type[0], buf, size[0]) };
}

function read(root, path, name) {
  return withKey(root, path, KEY_READ, (key) => queryKey(key, name));
}

function readString(root, path, name) {
  const v = read(root, path, name);
  return v && typeof v.value === 'string' ? v.value.trim() : '';
}

function info(key) {
  const subKeys = [0]; const maxSub = [0]; const maxClass = [0];
  const values = [0]; const maxName = [0]; const maxValue = [0];
  const lastWrite = {};
  if (fn.RegQueryInfoKeyW(key, null, null, null, subKeys, maxSub, maxClass, values, maxName, maxValue, null, lastWrite) !== 0) {
    return null;
  }
  return { subKeys: subKeys[0], maxSub: maxSub[0], values: values[0], maxName: maxName[0], maxValue: maxValue[0] };
}

function subkeysOf(key) {
  const meta = info(key);
  if (!meta) return [];
  const names = [];
  const buf = Buffer.alloc((meta.maxSub + 2) * 2);
  for (let i = 0; i < meta.subKeys; i++) {
    const len = [meta.maxSub + 1];
    if (fn.RegEnumKeyExW(key, i, buf, len, null, null, null, null) !== 0) break;
    names.push(buf.toString('utf16le', 0, len[0] * 2));
  }
  return names;
}

function subkeys(root, path) {
  return withKey(root, path, KEY_READ, subkeysOf, []);
}

function valuesOf(key) {
  const meta = info(key);
  if (!meta) return [];
  const list = [];
  const nameBuf = Buffer.alloc((meta.maxName + 2) * 2);
  const dataBuf = Buffer.alloc(meta.maxValue + 4);
  for (let i = 0; i < meta.values; i++) {
    const nameLen = [meta.maxName + 1];
    const type = [0];
    const dataLen = [dataBuf.length];
    if (fn.RegEnumValueW(key, i, nameBuf, nameLen, null, type, dataBuf, dataLen) !== 0) break;
    list.push({ name: nameBuf.toString('utf16le', 0, nameLen[0] * 2), type: type[0], value: decode(type[0], dataBuf, dataLen[0]) });
  }
  return list;
}

function values(root, path) {
  return withKey(root, path, KEY_READ, valuesOf, []);
}

function valueMap(root, path) {
  const map = {};
  for (const v of values(root, path)) map[v.name] = v.value;
  return map;
}

function exists(root, path) {
  const key = open(root, path, KEY_READ);
  if (key === null) return false;
  fn.RegCloseKey(key);
  return true;
}

function write(root, path, name, type, value) {
  const key = create(root, path);
  if (key === null) return false;
  try {
    const data = encode(type, value);
    return fn.RegSetValueExW(key, name, 0, type, data, data.length) === 0;
  } finally {
    fn.RegCloseKey(key);
  }
}

function deleteValue(root, path, name) {
  return withKey(root, path, KEY_ALL, (key) => {
    const status = fn.RegDeleteValueW(key, name);
    return status === 0 || status === 2;
  }, true);
}

function deleteTree(root, path) {
  const cut = path.lastIndexOf('\\');
  if (cut <= 0) return false;
  const parent = path.slice(0, cut);
  const leaf = path.slice(cut + 1);
  return withKey(root, parent, KEY_ALL, (key) => {
    let status = fn.RegDeleteTreeW(key, leaf);
    if (status === 0 || status === 2) {
      const again = fn.RegDeleteKeyExW(key, leaf, KEY_WOW64_64KEY, 0);
      status = again === 0 || again === 2 ? 0 : again;
    }
    return status === 0 || status === 2;
  }, true);
}

module.exports = {
  ROOTS,
  REG_SZ,
  REG_EXPAND_SZ,
  REG_BINARY,
  REG_DWORD,
  REG_MULTI_SZ,
  REG_QWORD,
  read,
  readString,
  subkeys,
  values,
  valueMap,
  exists,
  write,
  deleteValue,
  deleteTree,
  encode,
  decode,
};
