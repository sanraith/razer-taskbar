import './helpers/electron_stub';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatteryNotifier } from '../src/main/notifier';
import type { AppSettings, RazerDevice } from '../src/shared/types';

const settings: AppSettings = {
    runAtStartup: false, showPercentage: false, pollingThrottleSeconds: 5, displayChargingState: true,
    shownDeviceHandle: '', synapseVersion: 'auto', notifyLowBattery: true, lowBatteryThreshold: 20,
    notifyCriticalBattery: true, criticalBatteryThreshold: 10, notifyFullyCharged: true,
};
const device = (batteryPercentage: number, isCharging = false, isOff = false): RazerDevice => ({
    name: 'Headset', handle: 'h', batteryPercentage, isCharging, isOff, isConnected: true, lastUpdated: 0,
});

test('each alert fires once per crossing and re-arms after charging', () => {
    const shown: string[] = [];
    const n = new BatteryNotifier(a => shown.push(a.kind));
    const run = (...states: RazerDevice[]) => states.forEach(d => n.onDevicesChanged([d], settings));
    run(device(50), device(21), device(20), device(19), device(15), device(10), device(9), device(9, false, true));
    assert.deepEqual(shown, ['low', 'critical']);
    run(device(9, true), device(60, true), device(100, true), device(100, true));
    assert.deepEqual(shown, ['low', 'critical', 'full']);
    run(device(99), device(30), device(24), device(20));
    assert.deepEqual(shown, ['low', 'critical', 'full', 'low']);
});

test('no alerts while off or disconnected, and respects toggles', () => {
    const shown: string[] = [];
    const n = new BatteryNotifier(a => shown.push(a.kind));
    n.onDevicesChanged([device(5, false, true)], settings);
    n.onDevicesChanged([{ ...device(5), isConnected: false }], settings);
    assert.deepEqual(shown, []);
    n.onDevicesChanged([device(5)], { ...settings, notifyCriticalBattery: false });
    assert.deepEqual(shown, []);
});
