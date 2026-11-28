import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const bridge: SL.Bridge = {
  startAudit: (opts) => ipcRenderer.invoke('audit:start', opts),
  cancelAudit: () => ipcRenderer.invoke('audit:cancel'),
  onProgress: (cb) => {
    const fn = (_e: IpcRendererEvent, p: SL.Progress) => cb(p);
    ipcRenderer.on('audit:progress', fn);
    return () => ipcRenderer.removeListener('audit:progress', fn);
  },
  exportReport: (report, format) => ipcRenderer.invoke('report:export', report, format),
  exportTestCases: (report, cases, format) => ipcRenderer.invoke('testcases:export', report, cases, format),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  listHistory: () => ipcRenderer.invoke('history:list'),
  loadHistory: (id) => ipcRenderer.invoke('history:load', id),
  deleteHistory: (id) => ipcRenderer.invoke('history:delete', id),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  info: () => ipcRenderer.invoke('app:info'),
  terms: () => ipcRenderer.invoke('app:terms'),
  changelog: () => ipcRenderer.invoke('app:changelog'),
  checkUpdates: (force) => ipcRenderer.invoke('updates:check', force === true),
  quit: () => ipcRenderer.invoke('app:quit'),
};

contextBridge.exposeInMainWorld('sightline', bridge);
