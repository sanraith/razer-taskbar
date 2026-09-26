// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { AppSettings, IconPreviewRequest, RazerDevice, TrayAppApi } from './shared/types';

const api: TrayAppApi = {
    getSettings: () => ipcRenderer.invoke('getSettings'),
    updateSettings: (changes: Partial<AppSettings>) => ipcRenderer.invoke('updateSettings', changes),
    getDevices: () => ipcRenderer.invoke('getDevices'),
    onDevicesChanged: (callback: (devices: RazerDevice[]) => void) => {
        const listener = (_: IpcRendererEvent, devices: RazerDevice[]) => callback(devices);
        ipcRenderer.on('devicesChanged', listener);
        return () => { ipcRenderer.removeListener('devicesChanged', listener); };
    },
    renderIcon: (request: IconPreviewRequest) => ipcRenderer.invoke('renderIcon', request),
    getAppInfo: () => ipcRenderer.invoke('getAppInfo'),
    sendTestNotification: () => ipcRenderer.invoke('sendTestNotification'),
    openExternal: (target: 'github' | 'logs') => ipcRenderer.invoke('openExternal', target),
};

contextBridge.exposeInMainWorld('trayApp', api);
