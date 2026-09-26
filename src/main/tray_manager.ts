import { Menu, MenuItem, MenuItemConstructorOptions, Tray } from 'electron';
import { IconRenderer, IconSpec } from './icon_renderer';
import { getSettings } from './settings_manager';
import type { AppSettings, RazerDevice } from '../shared/types';

const APP_TITLE = 'Razer Taskbar';
/** Windows truncates tray tooltips at 127 characters. */
const MAX_TOOLTIP_LENGTH = 127;

export default class TrayManager {
    private tray: Tray | null = null;
    private devices: RazerDevice[] = [];
    private lightTaskbar = false;
    private renderSequence = 0;
    private tooltipTimer: NodeJS.Timeout | null = null;

    constructor(
        private icons: IconRenderer,
        private staticMenuItems: (MenuItemConstructorOptions | MenuItem)[],
        private onClick: () => void,
    ) { }

    async init(): Promise<void> {
        const image = await this.icons.renderTrayImage(buildIconSpec(undefined, getSettings(), this.lightTaskbar));
        this.tray = new Tray(image);
        this.tray.setToolTip(APP_TITLE);
        this.tray.on('click', () => this.onClick());
        // Keep "last change N min ago" fresh.
        this.tooltipTimer = setInterval(() => this.updateTooltip(), 30_000);
        await this.update();
    }

    dispose(): void {
        if (this.tooltipTimer) { clearInterval(this.tooltipTimer); }
        this.tray?.destroy();
        this.tray = null;
    }

    setDevices(devices: Map<string, RazerDevice>): void {
        this.devices = [...devices.values()].sort((a, b) => a.name.localeCompare(b.name));
        void this.update();
    }

    setLightTaskbar(light: boolean): void {
        if (this.lightTaskbar === light) { return; }
        this.lightTaskbar = light;
        void this.update();
    }

    async update(): Promise<void> {
        if (!this.tray) { return; }
        const sequence = ++this.renderSequence;
        const settings = getSettings();
        const device = pickDeviceToDisplay(this.devices, settings);

        const image = await this.icons.renderTrayImage(buildIconSpec(device, settings, this.lightTaskbar));
        if (sequence !== this.renderSequence || !this.tray) { return; } // a newer update won the race
        this.tray.setImage(image);
        this.updateTooltip(device);
        this.tray.setContextMenu(this.buildMenu());
    }

    private updateTooltip(device = pickDeviceToDisplay(this.devices, getSettings())): void {
        if (!this.tray) { return; }
        let text: string;
        if (!device) {
            text = `${APP_TITLE}\nNo device found. Is Razer Synapse running?`;
        } else {
            const lines = [device.name, describeState(device)];
            if (device.lastUpdated) { lines.push(`Last change ${formatAgo(device.lastUpdated)}`); }
            text = lines.join('\n');
        }
        this.tray.setToolTip(text.length > MAX_TOOLTIP_LENGTH ? text.slice(0, MAX_TOOLTIP_LENGTH - 1) + '…' : text);
    }

    private buildMenu(): Menu {
        const connected = this.devices.filter(d => d.isConnected);
        const deviceItems: MenuItemConstructorOptions[] = connected.length === 0
            ? [{ label: 'No devices found', enabled: false }]
            : connected.map(d => ({ label: `${d.name}  —  ${describeState(d)}`, enabled: false }));

        return Menu.buildFromTemplate([
            { label: APP_TITLE, enabled: false },
            { type: 'separator' },
            ...deviceItems,
            { type: 'separator' },
            ...this.staticMenuItems,
        ]);
    }
}

export function buildIconSpec(device: RazerDevice | undefined, settings: AppSettings, lightTaskbar: boolean): IconSpec {
    const style = settings.showPercentage ? 'number' : 'battery';
    if (!device) {
        return { style, percent: null, charging: false, off: false, low: false, lightTaskbar };
    }
    const charging = settings.displayChargingState && device.isCharging;
    return {
        style,
        percent: device.batteryPercentage,
        charging,
        off: device.isOff,
        low: !device.isCharging && device.batteryPercentage <= settings.lowBatteryThreshold,
        lightTaskbar,
    };
}

/**
 * The device selected in settings if connected; otherwise the connected device that most needs attention:
 * powered on before off, not charging before charging, then lowest battery.
 */
export function pickDeviceToDisplay(devices: RazerDevice[], settings: AppSettings): RazerDevice | undefined {
    const connected = devices.filter(d => d.isConnected);
    const selected = connected.find(d => d.handle === settings.shownDeviceHandle);
    if (selected) { return selected; }
    const rank = (d: RazerDevice) => (d.isOff ? 1000 : 0) + (d.isCharging ? 200 : 0) + d.batteryPercentage;
    return [...connected].sort((a, b) => rank(a) - rank(b))[0];
}

export function describeState(device: RazerDevice): string {
    if (device.isOff) { return `Off · last seen at ${device.batteryPercentage}%`; }
    if (device.isCharging) { return device.batteryPercentage >= 100 ? 'Fully charged' : `${device.batteryPercentage}% · Charging`; }
    return `${device.batteryPercentage}% remaining`;
}

export function formatAgo(timestamp: number, now = Date.now()): string {
    const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
    if (minutes < 1) { return 'just now'; }
    if (minutes < 60) { return `${minutes} min ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `${hours} h ${minutes % 60} min ago`; }
    return `on ${new Date(timestamp).toLocaleString()}`;
}
