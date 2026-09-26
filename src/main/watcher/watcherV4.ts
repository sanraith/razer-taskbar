import fs from 'fs';
import fsa from 'fs/promises';
import { WatchProcess } from './watch_process';
import { getSettings } from '../settings_manager';
import { getV4Candidates, LogFileInfo } from './synapse4_files';
import { ConnectingDevicesEvent, LineAccumulator, NO_SERIAL_NUMBER, parseLogText } from './synapse4_parser';

/** How many rotated log files to look back through when the newest one has no battery event yet. */
const MAX_FALLBACK_FILES = 5;

/**
 * Watches the newest Synapse 4 systray log.
 * - On start it reads the newest file once. If it has no battery event yet (fresh after a rotation),
 *   it falls back to older rotated files so the icon never goes blank.
 * - After that it only reads the bytes appended since the last read instead of the whole ~5 MB file.
 */
export class WatcherV4 extends WatchProcess {
    private logPath: string | null = null;
    private offset = 0;
    private readonly lines = new LineAccumulator();
    private retryTimeout: NodeJS.Timeout | null = null;
    private isReading = false;
    private readAgain = false;
    private stopped = true;

    start(): void {
        this.stop();
        this.stopped = false;
        void this.init();
    }

    stop(): void {
        this.stopped = true;
        if (this.logPath) { fs.unwatchFile(this.logPath); }
        this.logPath = null;
        if (this.retryTimeout) { clearTimeout(this.retryTimeout); }
        this.retryTimeout = null;
    }

    private async init(): Promise<void> {
        const settings = getSettings();
        try {
            const candidates = getV4Candidates();
            if (candidates.length === 0) {
                throw new Error('No Synapse 4 systray log found');
            }
            await this.loadInitialState(candidates);
            if (this.stopped) { return; }

            const logPath = candidates[0].fullPath;
            this.logPath = logPath;
            console.log(`Watching Synapse 4 log: ${logPath}`);
            // fs.watchFile polls stat(); fs.watch is unreliable for files another process appends to.
            fs.watchFile(logPath, { interval: Math.max(1, settings.pollingThrottleSeconds) * 1000 }, (curr, prev) => {
                if (curr.size !== prev.size || curr.mtimeMs !== prev.mtimeMs) {
                    void this.readAppended();
                }
            });
            // Catch anything written between the initial read and the watcher starting.
            void this.readAppended();
        } catch (e) {
            console.log(`Error starting Synapse 4 watcher: ${e}`);
            this.stop();
            this.stopped = false;
            this.retryTimeout = setTimeout(() => this.init(), Math.max(5, settings.pollingThrottleSeconds) * 1000);
        }
    }

    private async loadInitialState(candidates: LogFileInfo[]): Promise<void> {
        const newest = candidates[0];
        const buffer = await fsa.readFile(newest.fullPath);
        this.offset = buffer.length;
        this.lines.reset();
        // Newest file first; walk back through rotated files until a real battery level shows up.
        const chunks: ConnectingDevicesEvent[][] = [parseLogText(this.lines.push(buffer))];
        for (const older of candidates.slice(1, 1 + MAX_FALLBACK_FILES)) {
            if (chunks.some(events => events.some(hasKnownLevel))) { break; }
            try {
                chunks.push(parseLogText(await fsa.readFile(older.fullPath, 'utf8')));
                console.log(`Reading earlier battery state from ${older.fileName}`);
            } catch { /* rotated away meanwhile */ }
        }

        if (this.stopped) { return; }
        this.applyEvents(chunks.reverse().flat());
    }

    private async readAppended(): Promise<void> {
        if (this.isReading) { this.readAgain = true; return; }
        const logPath = this.logPath;
        if (!logPath || this.stopped) { return; }

        this.isReading = true;
        try {
            const { size } = await fsa.stat(logPath);
            if (size < this.offset) {
                // File was truncated or replaced: start over.
                this.offset = 0;
                this.lines.reset();
            }
            if (size > this.offset) {
                const length = size - this.offset;
                const buffer = Buffer.alloc(length);
                const handle = await fsa.open(logPath, 'r');
                let bytesRead = 0;
                try {
                    ({ bytesRead } = await handle.read(buffer, 0, length, this.offset));
                } finally {
                    await handle.close();
                }
                this.offset += bytesRead;
                const events = parseLogText(this.lines.push(buffer.subarray(0, bytesRead)));
                if (!this.stopped && this.logPath === logPath) {
                    this.applyEvents(events);
                }
            }
        } catch (e) {
            console.log(`Error reading Synapse 4 log: ${e}`);
        } finally {
            this.isReading = false;
            if (this.readAgain) {
                this.readAgain = false;
                void this.readAppended();
            }
        }
    }

    /** Replay events in order (needed to carry known levels over "unknown" ones), then notify once. */
    private applyEvents(events: ConnectingDevicesEvent[]): void {
        if (events.length === 0) { return; }
        events.forEach(e => this.applyEvent(e));
        this.notify();
    }

    private applyEvent(event: ConnectingDevicesEvent): void {
        const reported = new Set<string>();
        for (const d of event.devices) {
            // While reconnecting, Synapse may report a device without its serial number: map it to the known one.
            let handle = d.handle;
            if (handle === NO_SERIAL_NUMBER) {
                const known = [...this.devices.values()].find(x => x.name === d.name && x.handle !== NO_SERIAL_NUMBER);
                if (known) { handle = known.handle; }
            }
            const previous = this.devices.get(handle);
            // Level -1 = unknown: keep the last known level rather than showing 0% (and firing a false alert).
            const batteryPercentage = d.batteryPercentage ?? previous?.batteryPercentage;
            if (batteryPercentage === undefined) {
                if (!d.isOff) { continue; } // nothing useful to show yet
            }
            reported.add(handle);
            const next = {
                handle,
                name: d.name,
                batteryPercentage: batteryPercentage ?? 0,
                isCharging: d.isCharging,
                isOff: d.isOff,
                isConnected: true,
            };
            // Synapse re-logs the same state whenever its window opens or a device re-enumerates.
            // Only move "last change" when something actually changed.
            const unchanged = previous && previous.isConnected
                && previous.batteryPercentage === next.batteryPercentage
                && previous.isCharging === next.isCharging
                && previous.isOff === next.isOff;
            this.devices.set(handle, {
                ...next,
                lastUpdated: (unchanged || d.batteryPercentage === null) && previous ? previous.lastUpdated : event.timestamp,
            });
        }
        for (const [handle, device] of this.devices) {
            if (!reported.has(handle) && device.isConnected) {
                this.devices.set(handle, { ...device, isConnected: false });
            }
        }

        // A device may have been stored without a serial number first; drop that duplicate once the real one appears.
        const noSerial = this.devices.get(NO_SERIAL_NUMBER);
        if (noSerial && [...this.devices.values()].some(x => x.handle !== NO_SERIAL_NUMBER && x.name === noSerial.name)) {
            this.devices.delete(NO_SERIAL_NUMBER);
        }
    }
}

function hasKnownLevel(event: ConnectingDevicesEvent): boolean {
    return event.devices.some(d => d.batteryPercentage !== null);
}
