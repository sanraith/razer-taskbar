import fs from 'fs';
import fsa from 'fs/promises';
import _ from 'lodash';
import TrayManager from './tray_manager';
import { AppSettings, getSettings, settingsChanges } from './settings_manager';
import path from 'path';

export interface RazerDevice {
    name: string;
    handle: string;
    batteryPercentage: number;
    isCharging: boolean;
    isConnected: boolean;
    isSelected: boolean;
}

interface LoggedDeviceInfoV4 {
    serialNumber: string;
    hasBattery: boolean;
    deviceContainerId: string;
    powerStatus: {
        chargingStatus: 'NoCharge_BatteryFull' | 'Charging';
        level: number;
    };
    name: {
        en: string;
        [lang: string]: string;
    };
    productName: {
        en: string;
        [lang: string]: string;
    };
}

const SynapseV3LogPath = path.resolve(process.env.LOCALAPPDATA, 'Razer', 'Synapse3', 'Log', 'Razer Synapse 3.log');
const SynapseV4LogDir = path.resolve(process.env.LOCALAPPDATA, 'Razer', 'RazerAppEngine', 'User Data', 'Logs');
const devices: Map<string, RazerDevice> = new Map();

export default class RazerWatcher {
    private watcher: fs.FSWatcher | null = null;
    private watcherRetryTimeout: NodeJS.Timeout | null = null;
    private synapseV4LogPath: string | null = null;

    constructor(private trayManager: TrayManager) {
        this.trayManager.onDeviceUpdate(devices);
        settingsChanges.on('pollingThrottleSeconds', () => this.start());
        settingsChanges.on('shownDeviceHandle', () => this.start());
        settingsChanges.on('synapseVersion', () => this.start());
    }

    start() {
        getSettings().then(async settings => {
            try {
                this.stop();
                this.startChangeHandler(settings);
            } catch (e) {
                console.log(`Error during change handler init: ${e}`);
                this.stop();
                this.watcherRetryTimeout = setTimeout(() => this.start(), settings.pollingThrottleSeconds * 1000);
            }
        });
    }

    stop() {
        if (this.synapseV4LogPath) { fs.unwatchFile(this.synapseV4LogPath); }
        this.watcher?.close();
        this.watcher = null;
        if (this.watcherRetryTimeout) { clearTimeout(this.watcherRetryTimeout); }
        this.watcherRetryTimeout = null;
    }

    listDevices(): RazerDevice[] {
        return [...devices.values()];
    }

    private findLatestSynapseV4LogFile(): void {
        this.synapseV4LogPath = null;
        try {
            if (!fs.existsSync(SynapseV4LogDir)) {
                return;
            }

            const fileNameRegex = /^systray_systrayv2(?<index>\d*).log$/;
            const candidates = fs.readdirSync(SynapseV4LogDir).filter(x => fileNameRegex.test(x)).map(x => ({
                fileName: x,
                modifyTime: fs.statSync(path.resolve(SynapseV4LogDir, x)).mtime,
                index: parseInt(fileNameRegex.exec(x).groups["index"] || "-1")
            }));
            if (candidates.length > 0) {
                candidates.sort((a, b) => b.index - a.index);
                console.log('Synapse V4 candidates:\n' + candidates.map(x => `- ${x.fileName} (${x.index}) ${x.modifyTime}`).join('\n'));

                const fileName = candidates[0].fileName;
                this.synapseV4LogPath = path.resolve(SynapseV4LogDir, fileName);
                console.log(`Found Synapse 4 logFile: ${this.synapseV4LogPath}`);
            }
        } catch (e) {
            console.log(`Error finding Synapse 4 log file: ${e}`);
        }
    }

    private startChangeHandler(settings: AppSettings) {
        const v3InitFunc = () => {
            console.log("init v3 change handler");
            const v3LogFunc = () => this.onLogChangedV3(settings);
            const throttledOnLogChanged = _.throttle(v3LogFunc, settings.pollingThrottleSeconds * 1000, { leading: true });

            this.watcher = fs.watch(SynapseV3LogPath, throttledOnLogChanged);
            v3LogFunc();
        };

        const v4InitFunc = () => {
            console.log("init v4 change handler");
            if (!this.synapseV4LogPath) { throw new Error("Cannot start V4 change handler because V4 log path could not be resolved"); }

            // use fs.watchFile instead of fs.watch for V4 logs. We need polling here to get notified about the changes in time.
            const v4LogFunc = () => this.onLogChangedV4(settings);
            fs.watchFile(this.synapseV4LogPath, { interval: settings.pollingThrottleSeconds * 1000 }, (curr) => {
                console.log(`V4 log change detected ${curr.mtime}`);
                v4LogFunc();
            });
            v4LogFunc();
        };

        this.findLatestSynapseV4LogFile();
        switch (settings.synapseVersion) {
            case 'auto':
                if (this.synapseV4LogPath) { v4InitFunc(); }
                else { v3InitFunc(); }
                break;
            case 'v3': v3InitFunc(); break;
            case 'v4': v4InitFunc(); break;
        }
    }

    private async onLogChangedV3(settings: AppSettings): Promise<void> {
        const shownDeviceHandle = settings.shownDeviceHandle;
        const batteryStateRegex = /^(?<dateTime>.+?) INFO.+?_OnBatteryLevelChanged[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)[\s\S]*?level (?<level>\d+) state (?<isCharging>\d+)/gm;
        const deviceLoadedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceLoaded[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;
        const deviceRemovedRegex = /^(?<dateTime>.+?) INFO.+?_OnDeviceRemoved[\s\S]*?Name: (?<name>.*)[\s\S]*?Handle: (?<handle>\d+)/gm;

        try {
            const log = await fsa.readFile(SynapseV3LogPath, { encoding: 'utf8' });

            const batteryStateMatches = getLastMatchByHandleV3(batteryStateRegex, log);
            for (const [handle, match] of batteryStateMatches.entries()) {
                const { name, level, isCharging } = match.groups;
                devices.set(handle, {
                    name,
                    handle,
                    batteryPercentage: parseInt(level),
                    isCharging: parseInt(isCharging) !== 0,
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
                const device = devices.get(handle);
                if (device) {
                    device.isConnected = loadedIndex > removedIndex;
                }
            }

            console.log(devices);
            this.trayManager.onDeviceUpdate(devices);
        } catch (e) {
            console.log(`Error during log read: ${e}`);
        }
    }

    private latestParsedTimeStamp = '';
    private async onLogChangedV4(settings: AppSettings): Promise<void> {
        const start = performance.now();
        const shownDeviceHandle = settings.shownDeviceHandle;
        const batteryStateRegex = /^\[(?<timestamp>.+?)\].*connectingDeviceData: (?<json>.+)$/gm;
        try {
            const matches: { timestamp: string, jsonStr: string; info: LoggedDeviceInfoV4[]; }[] = [];
            const log = await fsa.readFile(this.synapseV4LogPath, { encoding: 'utf8' });

            // Find log messages
            let match;
            while ((match = batteryStateRegex.exec(log))) {
                matches.push({ timestamp: match.groups.timestamp, jsonStr: match.groups.json, info: null });
            }
            const lastMatch = matches.at(-1);
            lastMatch.info = JSON.parse(lastMatch.jsonStr);
            if (this.latestParsedTimeStamp === lastMatch.timestamp) {
                console.log(`No new changes detected in V4 log file. Last change is at ${lastMatch.timestamp}`);
                return;
            }
            this.latestParsedTimeStamp = lastMatch.timestamp;

            // Parse log messages
            for (const { jsonStr, info } of matches) {
                try {
                    const lastDevices: LoggedDeviceInfoV4[] = info ?? JSON.parse(jsonStr);
                    lastDevices.filter(x => x.hasBattery).forEach(x => {
                        const handle = x.serialNumber ?? x.deviceContainerId;
                        devices.set(handle, {
                            name: x.name.en,
                            handle: handle,
                            isConnected: lastMatch.info.some(x => x.serialNumber === handle || x.deviceContainerId === handle),
                            batteryPercentage: x.powerStatus.level,
                            isCharging: x.powerStatus.chargingStatus === 'Charging',
                            isSelected: shownDeviceHandle === handle || shownDeviceHandle === '',
                        });
                    });
                } catch (e) {
                    console.error(`Error parsing log message: ${e}`);
                }
            }

            // Remove possible duplicate device if it's serial number eventually got resolved
            const noSerial = 'NOSERIALNUMBER';
            const noSerialDevice = devices.get(noSerial);
            if (noSerialDevice && [...devices.values()].some(x => x.handle !== noSerial && x.name === noSerialDevice.name)) {
                devices.delete(noSerial);
            }

            console.log(`Parsed battery changes until ${lastMatch.timestamp} in ${(performance.now() - start).toFixed(2)} ms`);
            console.log(devices);
            this.trayManager.onDeviceUpdate(devices);
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
