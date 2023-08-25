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
const NO_DEVICE_HANDLE = '00000000_HANDLE_NO_DEVICE';
const SINGLE_TRAY_HANDLE = '00000001_HANDLE_SINGLE_TRAY';
const TRAY_TITLE = "Razer Taskbar";

export type TrayType = 'single' | 'multi';

export default class TrayManager {
    trayItems = new Map<string, TrayItem>();
    mode: TrayType = 'single';

    constructor(private staticMenuItems: (MenuItemConstructorOptions | MenuItem)[]) { }

    onDeviceUpdate(devices: Map<string, RazerDevice>) {
        const connectedDevices = new Map([...devices.entries()].filter(([, v]) => v.isConnected));
        // const connectedDevices = devices;
        // const connectedDevices = new Map();

        switch (this.mode) {
            case 'single':
                this.onDeviceUpdateSingleTray(connectedDevices);
                break;
            case 'multi':
                throw new Error("Not implemented.");
            // this.onDeviceUpdateMultiTray(connectedDevices);
            // break;
            default:
                assertNever(this.mode);
        }
    }

    onDeviceUpdateSingleTray(connectedDevices: Map<string, RazerDevice>) {
        // Make sure that there is one and only one tray item
        if (this.trayItems.size > 1) {
            [...this.trayItems.keys()].slice(1).forEach(h => this.removeTrayItem(h));
        } else if (this.trayItems.size === 0) {
            this.trayItems.set(NO_DEVICE_HANDLE, {
                tray: createTray(),
                handle: NO_DEVICE_HANDLE,
                devices: []
            });
        }

        const trayItem: TrayItem = this.trayItems.values().next().value;
        this.trayItems.delete(trayItem.handle);
        if (connectedDevices.size === 0) {
            trayItem.handle = NO_DEVICE_HANDLE;
            trayItem.devices = [];
        } else {
            trayItem.handle = SINGLE_TRAY_HANDLE;
            trayItem.devices = [...connectedDevices.values()].sort((a, b) => a.name.localeCompare(b.name));
        }
        this.trayItems.set(trayItem.handle, trayItem);
        this.updateTrayContents();
    }

    updateTrayContents() {
        for (const { tray, devices } of this.trayItems.values()) {
            const deviceStatusMenuItems: (MenuItemConstructorOptions | MenuItem)[] = devices.length === 0
                ? [{ label: 'No devices found.', type: 'normal', enabled: false }]
                : devices.map(device => ({ label: `🔗 ${device.name} - ${device.batteryPercentage}%${device.isCharging ? ' (charging)' : ''}`, type: 'normal', enabled: false }));

            const menu = Menu.buildFromTemplate([
                { label: '--- Razer Taskbar ---', type: 'normal', enabled: false },
                ...deviceStatusMenuItems,
                { type: 'separator' },
                ...this.staticMenuItems,
            ]);
            tray.setContextMenu(menu);

            const device = pickDeviceToDisplay(devices);
            tray.setImage(getTrayIcon(device));
            if (device) {
                tray.setToolTip(`${device.name}: ${device.batteryPercentage}% ${device.isCharging ? '(charging)' : ''}`);
            } else {
                tray.setToolTip(`No devices found.`);
            }
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

function getTrayIcon(device?: RazerDevice) {
    if (!device) {
        return BATTERY_IMAGES.unknown;
    }

    const imagePercentage = Math.max(0, Math.min(4, Math.floor(device.batteryPercentage / 20))) * 25 as keyof BatteryImages;
    return device.isCharging ?
        BATTERY_CHARGING_IMAGES[imagePercentage] :
        BATTERY_IMAGES[imagePercentage];
}

function createTray(): Tray {
    const tray = new Tray(BATTERY_IMAGES.unknown);
    tray.setTitle(TRAY_TITLE);

    return tray;
}