import { Menu, MenuItem, MenuItemConstructorOptions, NativeImage, Tray, app, nativeImage } from 'electron';
import { RazerDevice } from './razer_watcher';
import { assertNever } from './utils';
import { BATTERY_CHARGING_IMAGE_PATHS, BATTERY_IMAGE_PATHS } from './resources';

interface TrayItem {
    tray: Tray;
    handle: string;
    devices: RazerDevice[];
}

type BatteryImages = { [Property in keyof typeof BATTERY_IMAGE_PATHS]: NativeImage };
const BATTERY_IMAGES = Object.fromEntries(Object.entries(BATTERY_IMAGE_PATHS).map(([k, v]) => [k, nativeImage.createFromPath(v)])) as BatteryImages;
const BATTERY_CHARGING_IMAGES = Object.fromEntries(Object.entries(BATTERY_CHARGING_IMAGE_PATHS).map(([k, v]) => [k, nativeImage.createFromPath(v)])) as BatteryImages;
const NO_DEVICE_HANDLE = 'HANDLE_NO_DEVICE';
const SINGLE_TRAY_HANDLE = 'HANDLE_SINGLE_TRAY';

export type TrayType = 'single' | 'multi';

export default class TrayManager {
    trayItems = new Map<string, TrayItem>();
    mode: TrayType = 'single';

    onDeviceUpdate(devices: Map<string, RazerDevice>) {
        const connectedDevices = new Map([...devices.entries()].filter(([, v]) => v.isConnected));
        // const connectedDevices = devices;
        // const connectedDevices = new Map();

        switch (this.mode) {
            case 'multi':
                this.onDeviceUpdateMultiTray(connectedDevices);
                break;
            case 'single':
                this.onDeviceUpdateSingleTray(connectedDevices);
                break;
            default:
                assertNever(this.mode);
        }
    }

    onDeviceUpdateSingleTray(connectedDevices: Map<string, RazerDevice>) {
        if (connectedDevices.size === 0) {
            this.removeTrayItem(SINGLE_TRAY_HANDLE);
        } else {
            [...this.trayItems.keys()].filter(h => h !== SINGLE_TRAY_HANDLE).forEach(h => this.removeTrayItem(h));
            if (!this.trayItems.has(SINGLE_TRAY_HANDLE)) {
                this.trayItems.set(SINGLE_TRAY_HANDLE, {
                    tray: new Tray(BATTERY_IMAGES.unknown),
                    handle: SINGLE_TRAY_HANDLE,
                    devices: []
                });
            }
            this.trayItems.get(SINGLE_TRAY_HANDLE).devices = [...connectedDevices.values()].sort((a, b) => a.name.localeCompare(b.name));
        }
        this.updateTrayContents();
    }

    onDeviceUpdateMultiTray(connectedDevices: Map<string, RazerDevice>) {
        const handlesToRemove = [...this.trayItems.keys()].filter(handle => !connectedDevices.has(handle));
        const handlesToAdd = [...connectedDevices.keys()].filter(handle => !this.trayItems.has(handle));

        for (const handle of handlesToRemove) {
            this.removeTrayItem(handle);
        }

        for (const handle of handlesToAdd) {
            this.trayItems.set(handle, {
                tray: new Tray(BATTERY_IMAGES.unknown),
                handle,
                devices: [connectedDevices.get(handle)]
            });
        }

        this.updateTrayContents();
    }

    updateTrayContents() {
        this.addRemoveEmptyTrayIfNeeded();

        for (const { tray, devices } of this.trayItems.values()) {
            const deviceStatusMenuItems: (MenuItemConstructorOptions | MenuItem)[] = devices.length === 0
                ? [{ label: 'No devices found.', type: 'normal', enabled: false }]
                : devices.map(device => ({ label: `🔗 ${device.name} - ${device.batteryPercentage}%${device.isCharging ? ' (charging)' : ''}`, type: 'normal', enabled: false }));

            const menu = Menu.buildFromTemplate([
                { label: '--- Razer Taskbar ---', type: 'normal', enabled: false },
                ...deviceStatusMenuItems,
                { type: 'separator' },
                { label: 'Quit', role: 'quit', type: 'normal', click: () => { if (process.platform !== 'darwin') { app.quit(); } } }
            ]);
            tray.setContextMenu(menu);

            const device = pickDeviceToDisplay(devices);
            if (device) {
                tray.setToolTip(`${device.name}: ${device.batteryPercentage}% ${device.isCharging ? '(charging)' : ''}`);
                tray.setImage(getTrayIcon(device));
            } else {
                tray.setToolTip(`No devices found.`);
            }
        }
    }

    private addRemoveEmptyTrayIfNeeded() {
        // TODO Use a persistent icon instead of re-creating

        if (this.trayItems.size === 0) {
            this.trayItems.set(NO_DEVICE_HANDLE, {
                tray: new Tray(BATTERY_IMAGES.unknown),
                handle: NO_DEVICE_HANDLE,
                devices: []
            });
        } else if ([...this.trayItems.values()].some(x => x.handle !== NO_DEVICE_HANDLE)) {
            this.removeTrayItem(NO_DEVICE_HANDLE);
        }
    }

    private removeTrayItem(handle: string) {
        this.trayItems.get(handle)?.tray.destroy();
        this.trayItems.delete(handle);
    }
}

/** Pick the device with the lowest battery, preferring ones that are not charging. */
function pickDeviceToDisplay(devices: RazerDevice[]): RazerDevice | undefined {
    return devices.sort((a, b) => a.batteryPercentage * (a.isCharging ? 100 : 1) - b.batteryPercentage * (b.isCharging ? 100 : 1))[0];
}

function getTrayIcon(device: RazerDevice) {
    const imagePercentage = Math.max(0, Math.min(4, Math.floor(device.batteryPercentage / 20))) * 25 as keyof BatteryImages;
    return device.isCharging ?
        BATTERY_CHARGING_IMAGES[imagePercentage] :
        BATTERY_IMAGES[imagePercentage];
}
