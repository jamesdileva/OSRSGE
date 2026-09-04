import { contextBridge, ipcRenderer } from 'electron';
import { APP_GET_VERSION } from '../shared/ipc.js';
import type { OsrsApi } from '../shared/ipc.js';

/**
 * Deliberately small preload bridge (architecture §6, guide §7).
 * React gets exactly this API — raw ipcRenderer is never exposed.
 */
const api: OsrsApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(APP_GET_VERSION) as Promise<string>,
  },
};

contextBridge.exposeInMainWorld('osrsApi', api);
