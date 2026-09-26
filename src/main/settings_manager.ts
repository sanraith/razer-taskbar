import fsa from 'fs/promises';
import path from 'path';
import { ipcMain } from 'electron';
import { EventEmitter } from 'node:events';
import TypedEventEmitter from 'typed-emitter';
import { USER_DATA_PATH } from './resources';
import type { AppSettings } from '../shared/types';

export type { AppSettings } from '../shared/types';

const SETTINGS_FILE_PATH = path.join(USER_DATA_PATH, 'settings.json');

let _settings: AppSettings = createDefaultSettings();

// Notify subscribers about settings changes
class SettingsEmitter extends EventEmitter { }
type MessageEvents = { [Property in keyof AppSettings]: (value: AppSettings[Property]) => void } & {
    '_defaultSettingsCreated': () => void;
};
export const settingsChanges = new SettingsEmitter() as TypedEventEmitter<MessageEvents>;

// Handle updates from renderer
ipcMain.handle('getSettings', () => getSettings());
ipcMain.handle('updateSettings', async (_, updates: Partial<AppSettings>) => {
    await updateSettings(updates);
});

export function getSettings(): AppSettings {
    return { ..._settings };
}

export async function updateSettings(changes: Partial<AppSettings>) {
    const sanitized = sanitize(changes);
    const changedKeys = (Object.keys(sanitized) as (keyof AppSettings)[]).filter(k => sanitized[k] !== _settings[k]);
    _settings = { ..._settings, ...sanitized };
    await saveSettings();
    changedKeys.forEach(k => settingsChanges.emit(k, _settings[k] as never));
}

export async function loadSettings() {
    const defaults = createDefaultSettings();
    try {
        const loaded = JSON.parse(await fsa.readFile(SETTINGS_FILE_PATH, { encoding: 'utf8' }));
        if (!loaded || typeof loaded !== 'object') { throw new Error('Invalid settings file'); }
        // Merge with defaults so settings added in newer versions don't wipe the user's existing choices.
        _settings = { ...defaults, ...sanitize(loaded) };
        await saveSettings();
    } catch (e) {
        _settings = defaults;
        await saveSettings();
        settingsChanges.emit('_defaultSettingsCreated');
    }
    // Emit everything once so subscribers can apply the initial state.
    (Object.keys(_settings) as (keyof AppSettings)[]).forEach(k => settingsChanges.emit(k, _settings[k] as never));
}

async function saveSettings() {
    try {
        await fsa.writeFile(SETTINGS_FILE_PATH, JSON.stringify(_settings, null, 2));
    } catch (e) {
        console.error(e);
    }
}

/** Keep only known keys with the right types, clamp numbers. */
function sanitize(input: Partial<Record<keyof AppSettings, unknown>>): Partial<AppSettings> {
    const defaults = createDefaultSettings();
    const result: Partial<AppSettings> = {};
    for (const key of Object.keys(defaults) as (keyof AppSettings)[]) {
        if (!(key in input)) { continue; }
        const value = input[key];
        if (typeof value !== typeof defaults[key]) { continue; }
        (result as Record<string, unknown>)[key] = value;
    }
    if (result.synapseVersion && !['auto', 'v3', 'v4'].includes(result.synapseVersion)) { delete result.synapseVersion; }
    const clamp = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, v)));
    if (result.pollingThrottleSeconds !== undefined) { result.pollingThrottleSeconds = clamp(result.pollingThrottleSeconds, 1, 14400); }
    if (result.lowBatteryThreshold !== undefined) { result.lowBatteryThreshold = clamp(result.lowBatteryThreshold, 1, 99); }
    if (result.criticalBatteryThreshold !== undefined) { result.criticalBatteryThreshold = clamp(result.criticalBatteryThreshold, 1, 99); }
    return result;
}

function createDefaultSettings(): AppSettings {
    return {
        runAtStartup: false,
        showPercentage: false,
        pollingThrottleSeconds: 5,
        displayChargingState: true,
        shownDeviceHandle: '',
        synapseVersion: 'auto',
        notifyLowBattery: true,
        lowBatteryThreshold: 20,
        notifyCriticalBattery: true,
        criticalBatteryThreshold: 10,
        notifyFullyCharged: true,
    };
}
