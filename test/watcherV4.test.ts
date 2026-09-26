import './helpers/electron_stub';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { eventLine, noiseLine } from './helpers/log_lines';
import type { RazerDevice } from '../src/shared/types';

// WatcherV4 resolves the Synapse log dir from LOCALAPPDATA at import time.
const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'razer-taskbar-localappdata-'));
process.env.LOCALAPPDATA = localAppData;
const logDir = path.join(localAppData, 'Razer', 'RazerAppEngine', 'User Data', 'Logs');
fs.mkdirSync(logDir, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WatcherV4 } = require('../src/main/watcher/watcherV4');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const settings = require('../src/main/settings_manager');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor(check: () => boolean, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (check()) { return; } await sleep(50); }
    assert.fail('timed out waiting for watcher');
}
const write = (name: string, lines: string[], mtimeOffsetSec = 0) => {
    const file = path.join(logDir, name);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const t = new Date(Date.now() + mtimeOffsetSec * 1000);
    fs.utimesSync(file, t, t);
    return file;
};

test('WatcherV4: rotation fallback, unknown levels, incremental reads, stable "last change"', async () => {
    await settings.loadSettings();
    await settings.updateSettings({ pollingThrottleSeconds: 1 });

    // Older rotated file: 59% on battery -> turned off -> back on with unknown level
    write('systray_systrayv26.log', [
        eventLine('2026/09/26 18:40:00.000', [{ chargingStatus: 'NoCharge_BatteryFull', level: 59 }]),
        eventLine('2026/09/26 18:47:00.000', [{ chargingStatus: 'off', level: 59 }]),
        eventLine('2026/09/26 20:01:00.000', [{ chargingStatus: 'NoCharge_BatteryFull', level: -1 }]),
    ], -60);
    // Newest file (after rotation) has no battery event yet
    const newest = write('systray_systrayv27.log', [noiseLine('2026/09/26 20:02:00.000')]);

    const devices = new Map<string, RazerDevice>();
    let notified = 0;
    const watcher = new WatcherV4(devices, () => notified++);
    watcher.start();
    try {
        await waitFor(() => devices.size === 1);
        let d = devices.get('TESTSERIAL001');
        assert.equal(d.batteryPercentage, 59, 'unknown level keeps last known value');
        assert.equal(d.isOff, false);
        assert.equal(new Date(d.lastUpdated).getHours(), 18, 'last change stays at the last real change');

        // Append a new event in two halves: the partial line must not be parsed.
        const line = eventLine('2026/09/26 21:05:00.000', [{ level: 58 }]);
        fs.appendFileSync(newest, line.slice(0, 100));
        await sleep(1500);
        assert.equal(devices.get('TESTSERIAL001').batteryPercentage, 59);
        fs.appendFileSync(newest, line.slice(100) + '\n');
        await waitFor(() => devices.get('TESTSERIAL001').batteryPercentage === 58);
        d = devices.get('TESTSERIAL001');
        assert.equal(new Date(d.lastUpdated).getHours(), 21);

        // Same state logged again later (Synapse window opened): last change must not move.
        const before = notified;
        fs.appendFileSync(newest, eventLine('2026/09/26 23:30:00.000', [{ level: 58 }]) + '\n');
        await waitFor(() => notified > before);
        assert.equal(new Date(devices.get('TESTSERIAL001').lastUpdated).getHours(), 21);

        // Reconnect without serial number maps onto the known device instead of a duplicate.
        fs.appendFileSync(newest, eventLine('2026/09/26 23:40:00.000', [{ serialNumber: 'NOSERIALNUMBER', chargingStatus: 'off', level: -1 }]) + '\n');
        await waitFor(() => devices.get('TESTSERIAL001').isOff);
        assert.equal(devices.size, 1);
        assert.equal(devices.get('TESTSERIAL001').batteryPercentage, 58);

        // Device missing from the list = disconnected (dongle unplugged).
        fs.appendFileSync(newest, eventLine('2026/09/26 23:50:00.000', [{ serialNumber: 'KEYBOARD', hasBattery: false }]) + '\n');
        await waitFor(() => !devices.get('TESTSERIAL001').isConnected);
    } finally {
        watcher.stop();
    }
});
