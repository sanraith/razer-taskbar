import fsa from 'fs/promises';
import { USER_DATA_PATH } from './resources';
import path from 'path';
import { ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import TypedEventEmitter from 'typed-emitter';

const SETTINGS_FILE_PATH = path.join(USER_DATA_PATH, 'settings.json');

let _settings: AppSettings | null = null;

// Notify subscribers about settings changes
class SettingsEmitter extends EventEmitter { }
type MessageEvents = { [Property in keyof AppSettings]: (value: AppSettings[Property]) => void } & {
    '_defaultSettingsCreated': () => void;
};
export const settingsChanges = new SettingsEmitter() as TypedEventEmitter<MessageEvents>;

// Handle updates from renderer
ipcMain.handle('getSettings', () => getSettings());
ipcMain.handle('updateSettings', async (_, updates: Partial<AppSettings>) => {
    return await updateSettings(updates);
});

export interface AppSettings {
    runAtStartup: boolean;
    pollingThrottleSeconds: number;
    shownDeviceHandle: string;
    synapseVersion: 'auto' | 'v3' | 'v4';
}

export function getSettings(): AppSettings {
    return { ..._settings };
}

export async function updateSettings(changes: Partial<AppSettings>) {
    console.log(changes);
    _settings = { ...getSettings(), ...changes };
    Object.entries(changes).map(([k, v]) => settingsChanges.emit(k as keyof AppSettings, v));
    await saveSettings();
}

export async function loadSettings() {
    _settings = createDefaultSettings();

    let settingsString = '';
    try {
        settingsString = await fsa.readFile(SETTINGS_FILE_PATH, { encoding: 'utf8' });
        const loaded = JSON.parse(settingsString);
        assertSettings(loaded);
        await updateSettings(loaded);
    } catch (e) {
        await updateSettings(_settings);
        await saveSettings();
        settingsChanges.emit('_defaultSettingsCreated');
    }
}

async function saveSettings() {
    const settingsString = JSON.stringify(_settings);
    try {
        await fsa.writeFile(SETTINGS_FILE_PATH, settingsString);
    } catch (e) {
        console.error(e);
    }
}

function assertSettings(settings: AppSettings) {
    const requiredKeys = Object.keys(createDefaultSettings());
    const keys = Object.keys(settings);
    if (!requiredKeys.every(k => keys.includes(k))) {
        throw new Error('Invalid settings!');
    }
}

function createDefaultSettings(): AppSettings {
    return {
        runAtStartup: false,
        pollingThrottleSeconds: 15,
        shownDeviceHandle: '',
        synapseVersion: 'auto'
    };
}