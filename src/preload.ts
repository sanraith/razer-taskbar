// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings } from './settings_manager';

contextBridge.exposeInMainWorld('trayApp', {
    updateSettings: async (changes: Partial<AppSettings>) => await ipcRenderer.invoke('updateSettings', changes),
    getSettings: async () => await ipcRenderer.invoke('getSettings'),

    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron
});