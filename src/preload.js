const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'app:info', 'app:relaunchAdmin', 'app:quit', 'settings:get', 'settings:set',
  'metrics:latest', 'metrics:history', 'memory:free', 'memory:detail',
  'processes:list', 'process:kill', 'process:trim', 'process:efficiency', 'icons:get',
  'cleaner:catalog', 'cleaner:scan', 'cleaner:clean', 'cleaner:cancel',
  'startup:list', 'startup:toggle',
  'tweaks:list', 'tweaks:apply', 'tweaks:revert', 'hibernate:get', 'hibernate:set', 'power:list', 'power:set', 'network:run',
  'restore:list', 'restore:create', 'restore:to', 'journal:list', 'journal:revert',
  'uninstall:list', 'uninstall:size', 'uninstall:run', 'uninstall:skip', 'uninstall:scan', 'uninstall:delete',
  'store:list', 'store:remove', 'debloat:status', 'debloat:items', 'debloat:run', 'debloat:restartExplorer',
  'gamemode:state', 'benchmark:run', 'activity:list', 'activity:clear', 'activity:export', 'app:theme', 'license:get', 'shell:openSettings',
  'shell:showItem', 'shell:openPath', 'shell:openExternal', 'shell:openRegedit',
]);

const EVENTS = new Set([
  'metrics', 'memory:progress', 'memory:done', 'memory:auto', 'cleaner:progress', 'uninstall:state',
  'store:progress', 'debloat:progress', 'gamemode', 'benchmark:progress', 'settings:changed',
]);

contextBridge.exposeInMainWorld('evl', {
  invoke: (channel, ...args) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`canal desconhecido: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, cb) => {
    if (!EVENTS.has(channel)) return () => {};
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
