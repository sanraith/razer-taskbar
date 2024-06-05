import { WatchProcess } from './watch_process';
import { AppSettings, getSettings } from '../settings_manager';
import path from 'path';
import fs from 'fs';
import fsa from 'fs/promises';
import _ from 'lodash';

export const SynapseV3LogPath = path.resolve(process.env.LOCALAPPDATA, 'Razer', 'Synapse3', 'Log', 'Razer Synapse 3.log');

export class WatcherV3 extends WatchProcess {
    private watcher: fs.FSWatcher | null = null;
    private watcherRetryTimeout: NodeJS.Timeout | null = null;

    start(): void {
        const settings = getSettings();
        try {
            this.stop();
            console.log("init v3 change handler");
            const v3LogFunc = () => this.onLogChangedV3(settings);
            const throttledOnLogChanged = _.throttle(v3LogFunc, settings.pollingThrottleSeconds * 1000, { leading: true });
            this.watcher = fs.watch(SynapseV3LogPath, throttledOnLogChanged);
            v3LogFunc();
        } catch (e) {
            console.log(`Error during change handler init: ${e}`);
            this.stop();
            this.watcherRetryTimeout = setTimeout(() => this.start(), settings.pollingThrottleSeconds * 1000);
        }
    }

    stop(): void {
        this.watcher?.close();
        this.watcher = null;
        if (this.watcherRetryTimeout) { clearTimeout(this.watcherRetryTimeout); }
        this.watcherRetryTimeout = null;
    }

    private async onLogChangedV3(settings: AppSettings): Promise<void> {
        const shownDeviceHandle = settings.shownDeviceHandle;
        const batteryStateRegex = /^(?<dateTime>.+?) INFO.+?Battery Get By Device Handle[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)[\s\S]*?Battery Percentage: (?<level>\d+)[\s\S]*?Battery State: (?<isCharging>.+)/gm;
        const deviceLoadedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceLoaded[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;
        const deviceRemovedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceRemoved[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;

        try {
            const log = await fsa.readFile(SynapseV3LogPath, { encoding: 'utf8' });

            const batteryStateMatches = getLastMatchByHandleV3(batteryStateRegex, log);
            for (const [handle, match] of batteryStateMatches.entries()) {
                const { name, level, isCharging } = match.groups;
                this.devices.set(handle, {
                    name,
                    handle,
                    batteryPercentage: parseInt(level),
                    isCharging: isCharging == "Charging",
                    isConnected: false,
                    isSelected: shownDeviceHandle === handle || shownDeviceHandle === ''
                });
            }

            const deviceLoadedMatches = getLastMatchByHandleV3(deviceLoadedRegex, log);
            const deviceRemovedMatches = getLastMatchByHandleV3(deviceRemovedRegex, log);
            const connectionHandles = new Set([...deviceLoadedMatches.keys(), ...deviceRemovedMatches.keys()]);
            for (const handle of connectionHandles) {
                const loadedIndex = deviceLoadedMatches.get(handle)?.index ?? -1;
                const removedIndex = deviceRemovedMatches.get(handle)?.index ?? -1;
                const device = this.devices.get(handle);
                if (device) {
                    device.isConnected = loadedIndex > removedIndex;
                }
            }

            console.log(this.devices);
            this.trayManager.onDeviceUpdate(this.devices);
        } catch (e) {
            console.log(`Error during log read: ${e}`);
        }
    }

}

function getLastMatchByHandleV3(regex: RegExp, text: string): Map<string, RegExpExecArray> {
    const map: Map<string, RegExpExecArray> = new Map();
    let match;
    while ((match = regex.exec(text))) {
        const handle = match.groups.handle;
        map.set(handle, match);
    }

    return map;
}
