import { userDataDir } from './helpers/electron_stub';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { getSettings, loadSettings, updateSettings } from '../src/main/settings_manager';

test('settings from an older version keep their values and gain new defaults', async () => {
    fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify({
        runAtStartup: true, showPercentage: true, pollingThrottleSeconds: 15,
        displayChargingState: false, shownDeviceHandle: 'abc', synapseVersion: 'v4',
    }));
    await loadSettings();
    const s = getSettings();
    assert.equal(s.showPercentage, true);
    assert.equal(s.shownDeviceHandle, 'abc');
    assert.equal(s.synapseVersion, 'v4');
    assert.equal(s.lowBatteryThreshold, 20);
    assert.equal(s.notifyFullyCharged, true);
});

test('invalid values are ignored or clamped', async () => {
    await updateSettings({ lowBatteryThreshold: 500, synapseVersion: 'v9' as never, runAtStartup: 'yes' as never });
    const s = getSettings();
    assert.equal(s.lowBatteryThreshold, 99);
    assert.notEqual(s.synapseVersion, 'v9');
    assert.equal(typeof s.runAtStartup, 'boolean');
});
