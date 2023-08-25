import { app } from 'electron';
import path from 'path';

export const RESOURCES_PATH = app.isPackaged ? process.resourcesPath : __dirname;
export const ASSETS_PATH = path.join(RESOURCES_PATH, 'assets');
export const DATA_PATH = app.getPath('userData');

export const BATTERY_IMAGE_PATHS = {
    0: path.join(ASSETS_PATH, 'battery0_@2x.png'),
    25: path.join(ASSETS_PATH, 'battery25_@2x.png'),
    50: path.join(ASSETS_PATH, 'battery50_@2x.png'),
    75: path.join(ASSETS_PATH, 'battery75_@2x.png'),
    100: path.join(ASSETS_PATH, 'battery100_@2x.png'),
    'unknown': path.join(ASSETS_PATH, 'battery_unknown_@2x.png')
};

export const BATTERY_CHARGING_IMAGE_PATHS = {
    0: path.join(ASSETS_PATH, 'battery0_chrg_@2x.png'),
    25: path.join(ASSETS_PATH, 'battery25_chrg_@2x.png'),
    50: path.join(ASSETS_PATH, 'battery50_chrg_@2x.png'),
    75: path.join(ASSETS_PATH, 'battery75_chrg_@2x.png'),
    100: path.join(ASSETS_PATH, 'battery100_chrg_@2x.png'),
    'unknown': path.join(ASSETS_PATH, 'battery_unknown_@2x.png')
};