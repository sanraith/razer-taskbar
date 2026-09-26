/** Builds Synapse 4 systray log lines in the real format, with made-up devices. */

export interface FakeDevice {
    serialNumber?: string;
    name?: string;
    hasBattery?: boolean;
    chargingStatus?: string;
    level?: number;
}

export function eventLine(timestamp: string, devices: FakeDevice[]): string {
    const payload = devices.map(d => ({
        serialNumber: d.serialNumber ?? 'TESTSERIAL001',
        deviceContainerId: '{00000000-0000-0000-0000-000000000001}',
        hasBattery: d.hasBattery ?? true,
        name: { en: d.name ?? 'Razer Test Headset' },
        productName: { en: d.name ?? 'Razer Test Headset' },
        ...(d.chargingStatus !== undefined || d.level !== undefined
            ? { powerStatus: { chargingStatus: d.chargingStatus ?? 'NoCharge_BatteryFull', level: d.level ?? 50 } }
            : {}),
    }));
    return `[${timestamp}] info: [getConnectingDevices] ~ file: Synapse.js:55 ~ connectingDeviceData: ${JSON.stringify(payload)}`;
}

export const noiseLine = (timestamp: string) => `[${timestamp}] info: RazerApp RazerApp.getUserApps(Synapse) = []`;
