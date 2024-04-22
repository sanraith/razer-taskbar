import fs from 'fs';
import TrayManager from '../tray_manager';
import { getSettings, settingsChanges } from '../settings_manager';
import path from 'path';
import { WatcherV3 } from './watcherV3';
import { WatcherV4, SynapseV4LogDir } from './watcherV4';
import { WatchProcess } from './watch_process';

export interface RazerDevice {
    name: string;
    handle: string;
    batteryPercentage: number;
    isCharging: boolean;
    isConnected: boolean;
    isSelected: boolean;
}

interface LogFileInfo {
    fileName: string,
    modifyTime: Date,
    sequenceIndex: number;
}

export class RazerWatcher {
    ongoingProcess: WatchProcess | null = null;
    devices: Map<string, RazerDevice> = new Map();

    constructor(private trayManager: TrayManager) { }

    initialize(): void {
        this.watchV4LogDirForNewFiles();
        this.trayManager.onDeviceUpdate(this.devices);
        settingsChanges.on('pollingThrottleSeconds', () => this.stopAndStart());
        settingsChanges.on('shownDeviceHandle', () => this.stopAndStart());
        settingsChanges.on('synapseVersion', () => this.stopAndStart());
    }

    stopAndStart(): void {
        this.ongoingProcess?.stop();
        this.ongoingProcess = this.pickAndStartWatcherProcess();
    }

    listDevices(): RazerDevice[] {
        return [...this.devices.values()];
    }

    private pickAndStartWatcherProcess(): WatchProcess | null {
        let wp = null;
        switch (getSettings().synapseVersion) {
            case 'v3': wp = new WatcherV3(this.trayManager); break;
            case 'v4': wp = new WatcherV4(this.trayManager); break;
            case 'auto':
                if (this.getV4Candidates().length > 0) {
                    wp = new WatcherV4(this.trayManager);
                } else {
                    wp = new WatcherV3(this.trayManager);
                }
                break;
        }
        if (wp) {
            wp.devices = this.devices;
            wp.start();
        }
        return wp;
    }

    /**
     * Try watching the V4 log directory for new files. If there is a new file, restart the watcher with it.
     * If there is no V4 directory, this fails a single time and won't try again.
     */
    private watchV4LogDirForNewFiles() {
        let v4Candidates = this.getV4Candidates();
        try {
            fs.watch(SynapseV4LogDir, () => {
                const newV4Candidates = this.getV4Candidates();
                if (v4Candidates.length !== newV4Candidates.length || v4Candidates.some((x, i) => x.fileName !== newV4Candidates[i].fileName)) {
                    v4Candidates = newV4Candidates;
                    if (v4Candidates.length > 0) {
                        console.log('Synapse V4 candidates:\n' + v4Candidates.map(x => `- ${x.fileName} (${x.sequenceIndex}) ${x.modifyTime}`).join('\n'));
                    }
                    this.stopAndStart();
                }
            });
        } catch (e) {
            console.warn(`Could not set up watcher on V4 log dir: ${SynapseV4LogDir}`);
        }
    }

    private getV4Candidates(): LogFileInfo[] {
        try {
            if (!fs.existsSync(SynapseV4LogDir)) { return []; }

            const fileNameRegex = /^systray_systrayv\d(?<index>\d*).log$/;
            const candidates: LogFileInfo[] = fs.readdirSync(SynapseV4LogDir).filter(x => fileNameRegex.test(x)).map(x => ({
                fileName: x,
                modifyTime: fs.statSync(path.resolve(SynapseV4LogDir, x)).mtime,
                sequenceIndex: parseInt(fileNameRegex.exec(x).groups["index"] || "-1")
            }));

            candidates.sort((a, b) => b.sequenceIndex - a.sequenceIndex);
            return candidates;
        } catch (e) { console.log(`Error finding Synapse 4 log files: ${e}`); }
        return [];
    }
}
