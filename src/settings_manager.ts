import fsa from 'fs/promises';
import { DATA_PATH as USER_DATA_PATH } from './resources';
import path from 'path';
import { ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import TypedEventEmitter from 'typed-emitter';

const SETTINGS_FILE_PATH = path.join(USER_DATA_PATH, 'settings.json');

let settings: AppSettings | null = null;

// Notify subscribers about settings changes
class SettingsEmitter extends EventEmitter { }
type MessageEvents = { [Property in keyof AppSettings]: (value: Property) => void };
export const settingsChanges = new SettingsEmitter() as TypedEventEmitter<MessageEvents>;

// Handle updates from renderer
ipcMain.handle('getSettings', async () => {
    return await getSettings();
});
ipcMain.handle('updateSettings', (_, updates: Partial<AppSettings>) => {
    return updateSettings(updates);
});

export interface AppSettings {
    runAtStartup: boolean;
    pollingThrottleSeconds: number;
}

export async function getSettings(): Promise<AppSettings> {
    if (!settings) {
        let settingsString = '';
        try {
            settingsString = await fsa.readFile(SETTINGS_FILE_PATH, { encoding: 'utf8' });
            settings = JSON.parse(settingsString);
            assertSettings(settings);
        } catch (e) {
            settings = createDefaultSettings();
            settingsString = JSON.stringify(settings);
            await fsa.writeFile(SETTINGS_FILE_PATH, settingsString);
        }
    }

    return { ...settings };
}

export function updateSettings(changes: Partial<AppSettings>) {
    console.log(changes);
    settings = { ...settings, ...changes };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.entries(changes).map(([k, v]) => settingsChanges.emit(k as keyof AppSettings, v as any));
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
        pollingThrottleSeconds: 15
    };
}