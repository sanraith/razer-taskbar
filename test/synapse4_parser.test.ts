import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LineAccumulator, parseLogLine, parseLogText, parseSynapseTimestamp } from '../src/main/watcher/synapse4_parser';
import { eventLine, noiseLine } from './helpers/log_lines';

test('parses timestamps as local time', () => {
    const t = new Date(parseSynapseTimestamp('2026/09/26 20:04:09.385'));
    assert.deepEqual([t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getMilliseconds()], [2026, 8, 26, 20, 4, 385]);
    assert.equal(parseSynapseTimestamp('garbage'), null);
});

test('maps power states', () => {
    const e = parseLogLine(eventLine('2026/09/26 20:00:00.000', [
        { serialNumber: 'A', chargingStatus: 'NoCharge_BatteryFull', level: 59 },
        { serialNumber: 'B', chargingStatus: 'Charging', level: 41 },
        { serialNumber: 'C', chargingStatus: 'off', level: 59 },
        { serialNumber: 'D', chargingStatus: 'NoCharge_BatteryFull', level: -1 },
    ]));
    assert.deepEqual(e.devices.map(d => [d.handle, d.batteryPercentage, d.isCharging, d.isOff]), [
        ['A', 59, false, false],
        ['B', 41, true, false],
        ['C', 59, false, true],
        ['D', null, false, false],
    ]);
});

test('ignores devices without a battery or power status', () => {
    const e = parseLogLine(eventLine('2026/09/26 20:00:00.000', [
        { serialNumber: 'KEYBOARD', hasBattery: false },
        { serialNumber: 'MOUSE', hasBattery: true },
        { serialNumber: 'HEADSET', level: 80 },
    ]));
    assert.deepEqual(e.devices.map(d => d.handle), ['HEADSET']);
});

test('rejects unrelated, truncated and malformed lines', () => {
    assert.equal(parseLogLine(noiseLine('2026/09/26 20:00:00.000')), null);
    assert.equal(parseLogLine('[2026/09/26 20:00:00.000] info: connectingDeviceData: [{"broken'), null);
    assert.deepEqual(parseLogLine('[2026/09/26 20:00:00.000] info: connectingDeviceData: []').devices, []);
});

test('LineAccumulator only yields complete lines, even across split UTF-8 characters', () => {
    const text = [noiseLine('2026/09/26 20:00:00.000'), eventLine('2026/09/26 20:00:01.000', [{ name: 'Razer Tést ✓', level: 7 }]), ''].join('\n');
    const bytes = Buffer.from(text, 'utf8');
    for (let chunk = 1; chunk < 50; chunk += 7) {
        const acc = new LineAccumulator();
        let out = '';
        for (let i = 0; i < bytes.length; i += chunk) { out += acc.push(bytes.subarray(i, i + chunk)); }
        assert.equal(out, text);
        assert.equal(parseLogText(out)[0].devices[0].name, 'Razer Tést ✓');
    }
});
