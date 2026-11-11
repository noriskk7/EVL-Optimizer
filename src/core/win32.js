'use strict';

const koffi = require('koffi');

const kernel32 = koffi.load('kernel32.dll');
const advapi32 = koffi.load('advapi32.dll');
const psapi = koffi.load('psapi.dll');
const ntdll = koffi.load('ntdll.dll');
const user32 = koffi.load('user32.dll');
const shell32 = koffi.load('shell32.dll');
const shlwapi = koffi.load('shlwapi.dll');
const pdh = koffi.load('pdh.dll');

koffi.struct('MEMORYSTATUSEX', {
  dwLength: 'uint32',
  dwMemoryLoad: 'uint32',
  ullTotalPhys: 'uint64',
  ullAvailPhys: 'uint64',
  ullTotalPageFile: 'uint64',
  ullAvailPageFile: 'uint64',
  ullTotalVirtual: 'uint64',
  ullAvailVirtual: 'uint64',
  ullAvailExtendedVirtual: 'uint64',
});

koffi.struct('PERFORMANCE_INFORMATION', {
  cb: 'uint32',
  CommitTotal: 'uintptr_t',
  CommitLimit: 'uintptr_t',
  CommitPeak: 'uintptr_t',
  PhysicalTotal: 'uintptr_t',
  PhysicalAvailable: 'uintptr_t',
  SystemCache: 'uintptr_t',
  KernelTotal: 'uintptr_t',
  KernelPaged: 'uintptr_t',
  KernelNonpaged: 'uintptr_t',
  PageSize: 'uintptr_t',
  HandleCount: 'uint32',
  ProcessCount: 'uint32',
  ThreadCount: 'uint32',
});

koffi.struct('FILETIME', { dwLowDateTime: 'uint32', dwHighDateTime: 'uint32' });
koffi.struct('LUID', { LowPart: 'uint32', HighPart: 'int32' });
koffi.struct('LUID_AND_ATTRIBUTES', { Luid: 'LUID', Attributes: 'uint32' });
koffi.struct('TOKEN_PRIVILEGES', { PrivilegeCount: 'uint32', Privileges: koffi.array('LUID_AND_ATTRIBUTES', 1) });
koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: 'RECT', rcWork: 'RECT', dwFlags: 'uint32' });
koffi.struct('SHQUERYRBINFO', { cbSize: 'uint32', i64Size: 'int64', i64NumItems: 'int64' });
koffi.struct('PROCESS_POWER_THROTTLING_STATE', { Version: 'uint32', ControlMask: 'uint32', StateMask: 'uint32' });
koffi.struct('MEMORY_PRIORITY_INFORMATION', { MemoryPriority: 'uint32' });
koffi.struct('DISPLAY_DEVICEW', {
  cb: 'uint32',
  DeviceName: koffi.array('char16_t', 32),
  DeviceString: koffi.array('char16_t', 128),
  StateFlags: 'uint32',
  DeviceID: koffi.array('char16_t', 128),
  DeviceKey: koffi.array('char16_t', 128),
});

const fn = {
  GetCurrentProcess: kernel32.func('uintptr_t GetCurrentProcess()'),
  GetCurrentProcessId: kernel32.func('uint32 GetCurrentProcessId()'),
  OpenProcess: kernel32.func('uintptr_t OpenProcess(uint32 access, int inherit, uint32 pid)'),
  CloseHandle: kernel32.func('int CloseHandle(uintptr_t h)'),
  TerminateProcess: kernel32.func('int TerminateProcess(uintptr_t h, uint32 code)'),
  WaitForSingleObject: kernel32.func('uint32 WaitForSingleObject(uintptr_t h, uint32 ms)'),
  QueryFullProcessImageNameW: kernel32.func('int QueryFullProcessImageNameW(uintptr_t h, uint32 flags, void *buf, _Inout_ uint32 *size)'),
  GlobalMemoryStatusEx: kernel32.func('int GlobalMemoryStatusEx(_Inout_ MEMORYSTATUSEX *status)'),
  GetSystemTimes: kernel32.func('int GetSystemTimes(_Out_ FILETIME *idle, _Out_ FILETIME *kernel, _Out_ FILETIME *user)'),
  GetTickCount64: kernel32.func('uint64 GetTickCount64()'),
  GetLogicalDrives: kernel32.func('uint32 GetLogicalDrives()'),
  GetDriveTypeW: kernel32.func('uint32 GetDriveTypeW(str16 root)'),
  GetDiskFreeSpaceExW: kernel32.func('int GetDiskFreeSpaceExW(str16 root, _Out_ uint64 *freeCaller, _Out_ uint64 *total, _Out_ uint64 *free)'),
  GetVolumeInformationW: kernel32.func('int GetVolumeInformationW(str16 root, void *name, uint32 nameSize, void *serial, void *maxLen, void *flags, void *fs, uint32 fsSize)'),
  SetProcessInformation: kernel32.func('int SetProcessInformation(uintptr_t h, int infoClass, void *info, uint32 size)'),
  SetPriorityClass: kernel32.func('int SetPriorityClass(uintptr_t h, uint32 cls)'),
  GetPriorityClass: kernel32.func('uint32 GetPriorityClass(uintptr_t h)'),
  SetSystemFileCacheSize: kernel32.func('int SetSystemFileCacheSize(uintptr_t min, uintptr_t max, uint32 flags)'),
  GetLastError: kernel32.func('uint32 GetLastError()'),

  EmptyWorkingSet: psapi.func('int EmptyWorkingSet(uintptr_t h)'),
  GetPerformanceInfo: psapi.func('int GetPerformanceInfo(_Inout_ PERFORMANCE_INFORMATION *info, uint32 cb)'),

  OpenProcessToken: advapi32.func('int OpenProcessToken(uintptr_t h, uint32 access, _Out_ uintptr_t *token)'),
  LookupPrivilegeValueW: advapi32.func('int LookupPrivilegeValueW(str16 system, str16 name, _Out_ LUID *luid)'),
  AdjustTokenPrivileges: advapi32.func('int AdjustTokenPrivileges(uintptr_t token, int disableAll, TOKEN_PRIVILEGES *state, uint32 len, void *prev, void *retLen)'),
  RegOpenKeyExW: advapi32.func('int32 RegOpenKeyExW(uintptr_t root, str16 sub, uint32 options, uint32 sam, _Out_ uintptr_t *result)'),
  RegCreateKeyExW: advapi32.func('int32 RegCreateKeyExW(uintptr_t root, str16 sub, uint32 reserved, void *cls, uint32 options, uint32 sam, void *sec, _Out_ uintptr_t *result, _Out_ uint32 *disposition)'),
  RegCloseKey: advapi32.func('int32 RegCloseKey(uintptr_t key)'),
  RegQueryInfoKeyW: advapi32.func('int32 RegQueryInfoKeyW(uintptr_t key, void *cls, void *clsLen, void *reserved, _Out_ uint32 *subKeys, _Out_ uint32 *maxSubKeyLen, _Out_ uint32 *maxClassLen, _Out_ uint32 *values, _Out_ uint32 *maxValueNameLen, _Out_ uint32 *maxValueLen, void *sec, _Out_ FILETIME *lastWrite)'),
  RegEnumKeyExW: advapi32.func('int32 RegEnumKeyExW(uintptr_t key, uint32 index, void *name, _Inout_ uint32 *nameLen, void *reserved, void *cls, void *clsLen, void *lastWrite)'),
  RegEnumValueW: advapi32.func('int32 RegEnumValueW(uintptr_t key, uint32 index, void *name, _Inout_ uint32 *nameLen, void *reserved, _Out_ uint32 *type, void *data, _Inout_ uint32 *dataLen)'),
  RegQueryValueExW: advapi32.func('int32 RegQueryValueExW(uintptr_t key, str16 name, void *reserved, _Out_ uint32 *type, void *data, _Inout_ uint32 *dataLen)'),
  RegSetValueExW: advapi32.func('int32 RegSetValueExW(uintptr_t key, str16 name, uint32 reserved, uint32 type, void *data, uint32 len)'),
  RegDeleteValueW: advapi32.func('int32 RegDeleteValueW(uintptr_t key, str16 name)'),
  RegDeleteTreeW: advapi32.func('int32 RegDeleteTreeW(uintptr_t key, str16 sub)'),
  RegDeleteKeyExW: advapi32.func('int32 RegDeleteKeyExW(uintptr_t key, str16 sub, uint32 sam, uint32 reserved)'),

  NtQuerySystemInformation: ntdll.func('int32 NtQuerySystemInformation(int cls, void *buf, uint32 len, _Out_ uint32 *retLen)'),
  NtSetSystemInformation: ntdll.func('int32 NtSetSystemInformation(int cls, void *buf, uint32 len)'),

  GetForegroundWindow: user32.func('uintptr_t GetForegroundWindow()'),
  GetWindowThreadProcessId: user32.func('uint32 GetWindowThreadProcessId(uintptr_t hwnd, _Out_ uint32 *pid)'),
  GetWindowRect: user32.func('int GetWindowRect(uintptr_t hwnd, _Out_ RECT *rect)'),
  MonitorFromWindow: user32.func('uintptr_t MonitorFromWindow(uintptr_t hwnd, uint32 flags)'),
  GetMonitorInfoW: user32.func('int GetMonitorInfoW(uintptr_t monitor, _Inout_ MONITORINFO *info)'),
  GetShellWindow: user32.func('uintptr_t GetShellWindow()'),
  GetDesktopWindow: user32.func('uintptr_t GetDesktopWindow()'),
  EnumDisplayDevicesW: user32.func('int EnumDisplayDevicesW(str16 device, uint32 index, _Inout_ DISPLAY_DEVICEW *dd, uint32 flags)'),

  IsUserAnAdmin: shell32.func('int IsUserAnAdmin()'),
  SHQueryRecycleBinW: shell32.func('int32 SHQueryRecycleBinW(str16 root, _Inout_ SHQUERYRBINFO *info)'),
  SHEmptyRecycleBinW: shell32.func('int32 SHEmptyRecycleBinW(uintptr_t hwnd, str16 root, uint32 flags)'),

  SHLoadIndirectString: shlwapi.func('int32 SHLoadIndirectString(str16 source, void *out, uint32 cch, void *reserved)'),

  PdhOpenQueryW: pdh.func('uint32 PdhOpenQueryW(str16 source, uintptr_t user, _Out_ uintptr_t *query)'),
  PdhAddEnglishCounterW: pdh.func('uint32 PdhAddEnglishCounterW(uintptr_t query, str16 path, uintptr_t user, _Out_ uintptr_t *counter)'),
  PdhCollectQueryData: pdh.func('uint32 PdhCollectQueryData(uintptr_t query)'),
  PdhGetFormattedCounterArrayW: pdh.func('uint32 PdhGetFormattedCounterArrayW(uintptr_t counter, uint32 format, _Inout_ uint32 *size, _Out_ uint32 *count, void *buf)'),
  PdhCloseQuery: pdh.func('uint32 PdhCloseQuery(uintptr_t query)'),
};

const PROCESS_TERMINATE = 0x0001;
const PROCESS_SET_INFORMATION = 0x0200;
const PROCESS_SET_QUOTA = 0x0100;
const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SYNCHRONIZE = 0x00100000;

const isNull = (h) => h === 0 || h === 0n || h === null || h === undefined;

function openProcess(pid, access) {
  const h = fn.OpenProcess(access, 0, pid);
  return isNull(h) ? null : h;
}

function withProcess(pid, access, body) {
  const h = openProcess(pid, access);
  if (h === null) return null;
  try {
    return body(h);
  } finally {
    fn.CloseHandle(h);
  }
}

function processImagePath(pid) {
  return withProcess(pid, PROCESS_QUERY_LIMITED_INFORMATION, (h) => {
    const buf = Buffer.alloc(2048);
    const size = [1024];
    if (!fn.QueryFullProcessImageNameW(h, 0, buf, size)) return '';
    return buf.toString('utf16le', 0, size[0] * 2);
  }) || '';
}

let elevatedCache = null;
function isElevated() {
  if (elevatedCache === null) elevatedCache = !!fn.IsUserAnAdmin();
  return elevatedCache;
}

const enabledPrivileges = new Set();
function enablePrivilege(name) {
  if (enabledPrivileges.has(name)) return true;
  const token = [0];
  if (!fn.OpenProcessToken(fn.GetCurrentProcess(), 0x0020 | 0x0008, token)) return false;
  try {
    const luid = {};
    if (!fn.LookupPrivilegeValueW(null, name, luid)) return false;
    const state = { PrivilegeCount: 1, Privileges: [{ Luid: luid, Attributes: 0x2 }] };
    fn.AdjustTokenPrivileges(token[0], 0, state, 0, null, null);
    const ok = fn.GetLastError() === 0;
    if (ok) enabledPrivileges.add(name);
    return ok;
  } finally {
    fn.CloseHandle(token[0]);
  }
}

function memoryStatus() {
  const status = { dwLength: koffi.sizeof('MEMORYSTATUSEX') };
  if (!fn.GlobalMemoryStatusEx(status)) return null;
  return {
    load: status.dwMemoryLoad,
    total: Number(status.ullTotalPhys),
    available: Number(status.ullAvailPhys),
    pageTotal: Number(status.ullTotalPageFile),
    pageAvailable: Number(status.ullAvailPageFile),
  };
}

function performanceInfo() {
  const info = { cb: koffi.sizeof('PERFORMANCE_INFORMATION') };
  if (!fn.GetPerformanceInfo(info, info.cb)) return null;
  const page = Number(info.PageSize);
  return {
    commitTotal: Number(info.CommitTotal) * page,
    commitLimit: Number(info.CommitLimit) * page,
    systemCache: Number(info.SystemCache) * page,
    kernelPaged: Number(info.KernelPaged) * page,
    kernelNonpaged: Number(info.KernelNonpaged) * page,
    handles: info.HandleCount,
    processes: info.ProcessCount,
    threads: info.ThreadCount,
  };
}

const filetime = (ft) => ft.dwHighDateTime * 4294967296 + ft.dwLowDateTime;

function systemTimes() {
  const idle = {}; const kernel = {}; const user = {};
  if (!fn.GetSystemTimes(idle, kernel, user)) return null;
  return { idle: filetime(idle), kernel: filetime(kernel), user: filetime(user) };
}

function diskSpace(root) {
  const freeCaller = [0]; const total = [0]; const free = [0];
  if (!fn.GetDiskFreeSpaceExW(root, freeCaller, total, free)) return null;
  return { total: Number(total[0]), free: Number(free[0]) };
}

function volumeLabel(root) {
  const buf = Buffer.alloc(522);
  if (!fn.GetVolumeInformationW(root, buf, 261, null, null, null, null, 0)) return '';
  return buf.toString('utf16le').replace(/\0.*$/s, '');
}

function driveRoots() {
  const mask = fn.GetLogicalDrives();
  const roots = [];
  for (let i = 0; i < 26; i++) if (mask & (1 << i)) roots.push(String.fromCharCode(65 + i) + ':\\');
  return roots;
}

function foregroundProcessId() {
  const hwnd = fn.GetForegroundWindow();
  if (isNull(hwnd)) return 0;
  const pid = [0];
  fn.GetWindowThreadProcessId(hwnd, pid);
  return pid[0];
}

function foregroundFullscreen() {
  const hwnd = fn.GetForegroundWindow();
  if (isNull(hwnd)) return { pid: 0, fullscreen: false };
  const pid = [0];
  fn.GetWindowThreadProcessId(hwnd, pid);
  const shell = fn.GetShellWindow();
  const desktop = fn.GetDesktopWindow();
  if (hwnd === shell || hwnd === desktop) return { pid: pid[0], fullscreen: false };
  const rect = {};
  if (!fn.GetWindowRect(hwnd, rect)) return { pid: pid[0], fullscreen: false };
  const monitor = fn.MonitorFromWindow(hwnd, 2);
  const info = { cbSize: koffi.sizeof('MONITORINFO') };
  if (isNull(monitor) || !fn.GetMonitorInfoW(monitor, info)) return { pid: pid[0], fullscreen: false };
  const m = info.rcMonitor;
  const fullscreen = rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
  return { pid: pid[0], fullscreen };
}

function primaryGpuName() {
  for (let i = 0; i < 16; i++) {
    const dd = { cb: koffi.sizeof('DISPLAY_DEVICEW') };
    if (!fn.EnumDisplayDevicesW(null, i, dd, 0)) break;
    if (dd.StateFlags & 0x1) return String(dd.DeviceString).replace(/\0.*$/s, '');
  }
  return '';
}

function loadIndirectString(source) {
  const buf = Buffer.alloc(1024);
  if (fn.SHLoadIndirectString(source, buf, 512, null) !== 0) return '';
  return buf.toString('utf16le').replace(/\0.*$/s, '');
}

module.exports = {
  koffi,
  fn,
  isNull,
  openProcess,
  withProcess,
  processImagePath,
  isElevated,
  enablePrivilege,
  memoryStatus,
  performanceInfo,
  systemTimes,
  diskSpace,
  volumeLabel,
  driveRoots,
  foregroundProcessId,
  foregroundFullscreen,
  primaryGpuName,
  loadIndirectString,
  PROCESS_TERMINATE,
  PROCESS_SET_INFORMATION,
  PROCESS_SET_QUOTA,
  PROCESS_QUERY_INFORMATION,
  PROCESS_QUERY_LIMITED_INFORMATION,
  SYNCHRONIZE,
};
