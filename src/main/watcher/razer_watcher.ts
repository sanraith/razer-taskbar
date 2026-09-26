import fs from 'fs';
import { getSettings, settingsChanges } from '../settings_manager';
import { WatcherV3 } from './watcherV3';
import { WatcherV4 } from './watcherV4';
import { getV4Candidates, SynapseV4LogDir } from './synapse4_files';
import { WatchProcess } from './watch_process';
import { SYNAPSE4_LOG_FILE_REGEX } from './synapse4_parser';
import type { RazerDevice } from '../../shared/types';

export type { RazerDevice } from '../../shared/types';

export type DevicesListener = (devices: Map<string, RazerDevice>) => void;

/** Owns the device state and picks/restarts the right Synapse log watcher. */
export class RazerWatcher {
    private ongoingProcess: WatchProcess | null = null;
    private dirWatcher: fs.FSWatcher | null = null;
    private dirWatchDebounce: NodeJS.Timeout | null = null;
    readonly devices: Map<string, RazerDevice> = new Map();

    constructor(private onDevicesChanged: DevicesListener) { }

    initialize(): void {
        this.watchV4LogDirForNewFiles();
        this.onDevicesChanged(this.devices);
        settingsChanges.on('pollingThrottleSeconds', () => this.stopAndStart());
        settingsChanges.on('synapseVersion', () => this.stopAndStart());
    }

    stopAndStart(): void {
        this.ongoingProcess?.stop();
        this.ongoingProcess = this.pickAndStartWatcherProcess();
    }

    dispose(): void {
        this.ongoingProcess?.stop();
        this.ongoingProcess = null;
        this.dirWatcher?.close();
        this.dirWatcher = null;
    }

    listDevices(): RazerDevice[] {
        return [...this.devices.values()];
    }

    private pickAndStartWatcherProcess(): WatchProcess | null {
        const notify = () => this.onDevicesChanged(this.devices);
        let wp: WatchProcess | null = null;
        switch (getSettings().synapseVersion) {
            case 'v3': wp = new WatcherV3(this.devices, notify); break;
            case 'v4': wp = new WatcherV4(this.devices, notify); break;
            case 'auto':
            default:
                wp = getV4Candidates().length > 0
                    ? new WatcherV4(this.devices, notify)
                    : new WatcherV3(this.devices, notify);
                break;
        }
        wp.start();
        return wp;
    }

    /**
     * Synapse 4 rotates its log (systray_systrayv2.log -> systray_systrayv23.log -> ...).
     * Restart the watcher whenever the newest log file changes.
     */
    private watchV4LogDirForNewFiles() {
        let newest = getV4Candidates()[0]?.fileName;
        try {
            this.dirWatcher = fs.watch(SynapseV4LogDir, (_event, fileName) => {
                if (fileName && !SYNAPSE4_LOG_FILE_REGEX.test(fileName.toString())) { return; }
                // Debounce: rotation produces a burst of rename/change events.
                if (this.dirWatchDebounce) { clearTimeout(this.dirWatchDebounce); }
                this.dirWatchDebounce = setTimeout(() => {
                    const current = getV4Candidates()[0]?.fileName;
                    if (current !== newest) {
                        console.log(`Synapse 4 log rotated: ${newest} -> ${current}`);
                        newest = current;
                        this.stopAndStart();
                    }
                }, 1000);
            });
        } catch (e) {
            console.warn(`Could not set up watcher on V4 log dir: ${SynapseV4LogDir}`);
        }
    }
}
