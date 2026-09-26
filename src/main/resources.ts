import { app } from 'electron';
import path from 'path';

/** Packaged: resources/assets (copied by forge `extraResource`). Dev: .webpack/main/assets (copied by webpack). */
export const RESOURCES_PATH = app.isPackaged ? process.resourcesPath : __dirname;
export const ASSETS_PATH = path.join(RESOURCES_PATH, 'assets');
export const APP_ICON_PATH = path.join(ASSETS_PATH, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
export const USER_DATA_PATH = app.getPath('userData');
