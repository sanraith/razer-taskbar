/**
 * Pure parsing helpers for Razer Synapse 4 logs (systray_systrayv2*.log).
 * No Electron imports here so this file can be unit tested with plain node.
 *
 * Synapse 4 writes a `connectingDeviceData: [...]` line whenever the list of connected devices
 * or any of their battery states change. Each device carries a `powerStatus` object:
 *   { chargingStatus: 'Charging' | 'NoCharge_BatteryFull' | 'off' | ..., level: 0-100 }
 * - 'NoCharge_BatteryFull' is (despite its name) reported for any "on battery, not charging" state.
 * - 'off' is reported when a device (e.g. a headset) is powered down while its dongle stays plugged in.
 * - level -1 means "unknown" and shows up briefly while a device turns on or reconnects.
 * - A reconnecting device may first appear with serialNumber "NOSERIALNUMBER".
 */

export interface LoggedDeviceInfoV4 {
    serialNumber?: string;
    hasBattery?: boolean;
    deviceContainerId?: string;
    powerStatus?: {
        chargingStatus?: string;
        level?: number;
    };
    name?: { en?: string;[lang: string]: string | undefined; };
    productName?: { en?: string;[lang: string]: string | undefined; };
}

export interface DeviceSnapshotV4 {
    handle: string;
    name: string;
    /** null when Synapse reports level -1 (unknown), e.g. right after the headset turns on or reconnects. */
    batteryPercentage: number | null;
    isCharging: boolean;
    isOff: boolean;
}

export interface ConnectingDevicesEvent {
    /** Local time of the log line, in epoch milliseconds. */
    timestamp: number;
    /** Battery powered devices reported as connected in this event. */
    devices: DeviceSnapshotV4[];
}

export const NO_SERIAL_NUMBER = 'NOSERIALNUMBER';
export const SYNAPSE4_LOG_FILE_REGEX = /^systray_systrayv2(?<index>\d*)\.log$/;

const EVENT_REGEX = /^\[(?<timestamp>[^\]]+)\].*?connectingDeviceData: (?<json>\[.*\])\s*$/;

/** Parses "2026/09/26 20:04:09.385" as local time. */
export function parseSynapseTimestamp(value: string): number | null {
    const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value.trim());
    if (!m) { return null; }
    const [, y, mo, d, h, mi, s, ms] = m;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms.padEnd(3, '0') : 0).getTime();
}

/** Parse one log line. Returns null for lines that are not (valid) battery events. */
export function parseLogLine(line: string): ConnectingDevicesEvent | null {
    if (!line.includes('connectingDeviceData')) { return null; }
    const match = EVENT_REGEX.exec(line);
    if (!match) { return null; }

    let raw: unknown;
    try {
        raw = JSON.parse(match.groups.json);
    } catch {
        return null;
    }
    if (!Array.isArray(raw)) { return null; }

    const timestamp = parseSynapseTimestamp(match.groups.timestamp) ?? Date.now();
    const devices: DeviceSnapshotV4[] = [];
    for (const d of raw as LoggedDeviceInfoV4[]) {
        if (!d || !d.hasBattery || !d.powerStatus) { continue; }
        const level = Number(d.powerStatus.level);
        if (!Number.isFinite(level)) { continue; }
        const status = (d.powerStatus.chargingStatus ?? '').toLowerCase();
        devices.push({
            handle: d.serialNumber || d.deviceContainerId || NO_SERIAL_NUMBER,
            name: d.name?.en || d.productName?.en || 'Razer device',
            batteryPercentage: level < 0 ? null : Math.min(100, Math.round(level)),
            isCharging: status === 'charging',
            isOff: status === 'off',
        });
    }
    return { timestamp, devices };
}

/** Parse all battery events in a chunk of log text (complete lines only). */
export function parseLogText(text: string): ConnectingDevicesEvent[] {
    const events: ConnectingDevicesEvent[] = [];
    for (const line of text.split(/\r?\n/)) {
        const event = parseLogLine(line);
        if (event) { events.push(event); }
    }
    return events;
}

/**
 * Accumulates bytes appended to a log file and yields complete lines.
 * Keeps the trailing partial line (and partial UTF-8 sequences) until the rest arrives.
 */
export class LineAccumulator {
    private pending: Buffer = Buffer.alloc(0);

    push(chunk: Buffer): string {
        const data = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
        const lastNewline = data.lastIndexOf(0x0a);
        if (lastNewline === -1) {
            this.pending = data;
            return '';
        }
        this.pending = data.subarray(lastNewline + 1);
        return data.subarray(0, lastNewline + 1).toString('utf8');
    }

    reset(): void {
        this.pending = Buffer.alloc(0);
    }
}
