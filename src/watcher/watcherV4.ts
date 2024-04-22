import { WatchProcess } from './watch_process';
import { AppSettings, getSettings } from '../settings_manager';
import path from 'path';
import fs from 'fs';
import fsa from 'fs/promises';

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

export const SynapseV4LogDir = path.resolve(process.env.LOCALAPPDATA, 'Razer', 'RazerAppEngine', 'User Data', 'Logs');

export class WatcherV4 extends WatchProcess {
    private watcher: fs.FSWatcher | null = null;
    private synapseV4LogPath: string | null = null;
    private watcherRetryTimeout: NodeJS.Timeout | null = null;

    start(): void {
        const settings = getSettings();
        try {
            this.stop();

            console.log("init v4 change handler");
            this.findLatestSynapseV4LogFile();
            if (!this.synapseV4LogPath) {
                throw new Error("Cannot start V4 change handler because V4 log path could not be resolved");
            }

            // use fs.watchFile instead of fs.watch for V4 logs. We need polling here to get notified about the changes in time.
            const v4LogFunc = () => this.onLogChangedV4(settings);
            fs.watchFile(this.synapseV4LogPath, { interval: settings.pollingThrottleSeconds * 1000 }, (curr) => {
                console.log(`V4 log change detected ${curr.mtime}`);
                v4LogFunc();
            });
            v4LogFunc();
        } catch (e) {
            console.log(`Error during change handler init: ${e}`);
            this.stop();
            this.watcherRetryTimeout = setTimeout(() => this.start(), settings.pollingThrottleSeconds * 1000);
        }
    }

    stop() {
        if (this.synapseV4LogPath) { fs.unwatchFile(this.synapseV4LogPath); }
        this.watcher?.close();
        this.watcher = null;
        if (this.watcherRetryTimeout) { clearTimeout(this.watcherRetryTimeout); }
        this.watcherRetryTimeout = null;
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
                        this.devices.set(handle, {
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
            const noSerialDevice = this.devices.get(noSerial);
            if (noSerialDevice && [...this.devices.values()].some(x => x.handle !== noSerial && x.name === noSerialDevice.name)) {
                this.devices.delete(noSerial);
            }

            console.log(`Parsed battery changes until ${lastMatch.timestamp} in ${(performance.now() - start).toFixed(2)} ms`);
            console.log(this.devices);
            this.trayManager.onDeviceUpdate(this.devices);
        } catch (e) {
            console.log(`Error during log read: ${e}`);
        }
    }
}
