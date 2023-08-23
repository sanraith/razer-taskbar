import fs from 'fs';
import fsa from 'fs/promises';
import _ from 'lodash';
import TrayManager from './tray_manager';

export interface RazerDevice {
    name: string;
    handle: string;
    batteryPercentage: number;
    isCharging: boolean;
    isConnected: boolean;
}

export default class RazerWatcher {
    private watcher: fs.FSWatcher | null = null;

    constructor(private trayManager: TrayManager, private logPath: string) { }

    start() {
        const throttledOnLogChanged = _.throttle(() => this.onLogChanged(), 30000, { leading: true });
        this.watcher = fs.watch(this.logPath, throttledOnLogChanged);
        this.onLogChanged();
    }

    stop() {
        this.watcher?.close();
        this.watcher = null;
    }

    private async onLogChanged(): Promise<RazerDevice[]> {
        const batteryStateRegex = /^(?<dateTime>.+?) INFO.+?_OnBatteryLevelChanged[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)[\s\S]*?level (?<level>\d+) state (?<isCharging>\d+)/gm;
        const deviceLoadedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceLoaded[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;
        const deviceRemovedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceRemoved[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;

        const devices: Map<string, RazerDevice> = new Map();
        const log = await fsa.readFile(this.logPath, { encoding: 'utf8' });

        const batteryStateMatches = getLastMatchByHandle(batteryStateRegex, log);
        for (const [handle, match] of batteryStateMatches.entries()) {
            const { name, level, isCharging } = match.groups;
            devices.set(handle, {
                name,
                handle,
                batteryPercentage: parseInt(level),
                isCharging: parseInt(isCharging) !== 0,
                isConnected: false
            });
        }

        const deviceLoadedMatches = getLastMatchByHandle(deviceLoadedRegex, log);
        const deviceRemovedMatches = getLastMatchByHandle(deviceRemovedRegex, log);
        const connectionHandles = new Set([...deviceLoadedMatches.keys(), ...deviceRemovedMatches.keys()]);
        for (const handle of connectionHandles) {
            const loadedIndex = deviceLoadedMatches.get(handle)?.index ?? 0;
            const removedIndex = deviceRemovedMatches.get(handle)?.index ?? 0;
            const device = devices.get(handle);
            if (device) {
                device.isConnected = loadedIndex > removedIndex;
            }
        }

        console.log(devices);
        this.trayManager.onDeviceUpdate(devices);

        return [...devices.values()];
    }
}

function getLastMatchByHandle(regex: RegExp, text: string): Map<string, RegExpExecArray> {
    const map: Map<string, RegExpExecArray> = new Map();
    let match;
    while ((match = regex.exec(text))) {
        const handle = match.groups.handle;
        map.set(handle, match);
    }

    return map;
}
