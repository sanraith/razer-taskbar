/**
 * Settings window. Runs sandboxed; talks to the main process only through `window.trayApp` (see preload.ts).
 */
import './index.css';
import type { AppInfo, AppSettings, RazerDevice, TrayAppApi } from '../shared/types';

declare global {
    interface Window { trayApp: TrayAppApi; }
}

const api = window.trayApp;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: AppSettings;
let devices: RazerDevice[] = [];
let appInfo: AppInfo;

async function main() {
    [settings, devices, appInfo] = await Promise.all([api.getSettings(), api.getDevices(), api.getAppInfo()]);

    if (appInfo.supportsMica) { document.body.classList.add('mica'); }
    $('app_version').textContent = `v${appInfo.version}`;

    fillThresholdSelect($('low_threshold'), [5, 10, 15, 20, 25, 30, 40, 50]);
    fillThresholdSelect($('critical_threshold'), [3, 5, 10, 15, 20]);

    bindSettings();
    renderDevices();
    void renderIconPreviews();

    api.onDevicesChanged(updated => {
        devices = updated;
        renderDevices();
        void renderIconPreviews();
    });

    // Keep "N min ago" fresh while the window is open.
    setInterval(renderDevices, 30_000);

    $('test_notification').addEventListener('click', async e => {
        const button = e.currentTarget as HTMLButtonElement;
        await api.sendTestNotification();
        button.textContent = 'Sent';
        button.dataset.done = 'true';
        setTimeout(() => { button.textContent = 'Send test'; delete button.dataset.done; }, 2000);
    });
    $('open_logs').addEventListener('click', () => api.openExternal('logs'));
    $('open_github').addEventListener('click', () => api.openExternal('github'));
}

// ---------- Settings ----------

function fillThresholdSelect(select: HTMLSelectElement, values: number[]) {
    select.replaceChildren(...values.map(v => new Option(`${v}%`, String(v))));
}

function ensureOption(select: HTMLSelectElement, value: string, label: string) {
    if (![...select.options].some(o => o.value === value)) {
        select.add(new Option(label, value));
    }
    select.value = value;
}

async function save(changes: Partial<AppSettings>) {
    settings = { ...settings, ...changes };
    await api.updateSettings(changes);
    syncDependentControls();
    void renderIconPreviews();
    renderDevices();
}

function bindToggle(id: string, key: keyof AppSettings) {
    const input = $<HTMLInputElement>(id);
    input.checked = settings[key] as boolean;
    input.addEventListener('change', () => save({ [key]: input.checked }));
}

function bindSelect(id: string, key: keyof AppSettings, numeric: boolean) {
    const select = $<HTMLSelectElement>(id);
    const value = String(settings[key]);
    ensureOption(select, value, numeric && key.endsWith('Threshold') ? `${value}%` : value);
    select.addEventListener('change', () => save({ [key]: numeric ? parseInt(select.value) : select.value }));
}

function bindSettings() {
    bindToggle('display_charging_state', 'displayChargingState');
    bindToggle('notify_low', 'notifyLowBattery');
    bindToggle('notify_critical', 'notifyCriticalBattery');
    bindToggle('notify_full', 'notifyFullyCharged');
    bindToggle('run_at_startup', 'runAtStartup');
    bindSelect('low_threshold', 'lowBatteryThreshold', true);
    bindSelect('critical_threshold', 'criticalBatteryThreshold', true);
    bindSelect('synapse_version', 'synapseVersion', false);
    bindSelect('polling_throttle', 'pollingThrottleSeconds', true);

    for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="icon_style"]')) {
        radio.checked = (radio.value === 'number') === settings.showPercentage;
        radio.addEventListener('change', () => { if (radio.checked) { void save({ showPercentage: radio.value === 'number' }); } });
    }

    $<HTMLSelectElement>('shown_device').addEventListener('change', e => {
        void save({ shownDeviceHandle: (e.target as HTMLSelectElement).value });
    });
    syncDependentControls();
}

function syncDependentControls() {
    $<HTMLSelectElement>('low_threshold').disabled = !settings.notifyLowBattery;
    $<HTMLSelectElement>('critical_threshold').disabled = !settings.notifyCriticalBattery;
}

// ---------- Devices ----------

/** Mirrors pickDeviceToDisplay() in tray_manager.ts. */
function displayedDevice(): RazerDevice | undefined {
    const connected = devices.filter(d => d.isConnected);
    const selected = connected.find(d => d.handle === settings.shownDeviceHandle);
    if (selected) { return selected; }
    const rank = (d: RazerDevice) => (d.isOff ? 1000 : 0) + (d.isCharging ? 200 : 0) + d.batteryPercentage;
    return [...connected].sort((a, b) => rank(a) - rank(b))[0];
}

function formatAgo(timestamp: number | null): string {
    if (!timestamp) { return ''; }
    const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60_000);
    if (minutes < 1) { return 'Last change just now'; }
    if (minutes < 60) { return `Last change ${minutes} min ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `Last change ${hours} h ${minutes % 60} min ago`; }
    return `Last change ${new Date(timestamp).toLocaleString()}`;
}

function stateOf(d: RazerDevice | undefined): 'unknown' | 'off' | 'charging' | 'on' {
    if (!d) { return 'unknown'; }
    if (d.isOff) { return 'off'; }
    return d.isCharging ? 'charging' : 'on';
}

function chipText(d: RazerDevice | undefined): string {
    switch (stateOf(d)) {
        case 'unknown': return 'Waiting for Razer Synapse';
        case 'off': return 'Turned off';
        case 'charging': return d.batteryPercentage >= 100 ? 'Fully charged' : 'Charging';
        default: return d.batteryPercentage <= settings.lowBatteryThreshold ? 'Low battery' : 'On battery';
    }
}

function renderDevices() {
    const device = displayedDevice();
    const hero = $('hero');
    const state = stateOf(device);
    hero.dataset.state = state;
    hero.dataset.level = device && !device.isCharging && device.batteryPercentage <= settings.lowBatteryThreshold ? 'low' : 'ok';

    $('hero_name').textContent = device?.name ?? 'No wireless Razer device found';
    $('hero_percent').textContent = device ? String(device.batteryPercentage) : '--';
    $('hero_fill').style.width = `${device ? device.batteryPercentage : 0}%`;
    $('hero_chip').textContent = chipText(device);
    $('hero_updated').textContent = device
        ? (device.isOff ? `Last seen at ${device.batteryPercentage}%. ` : '') + formatAgo(device.lastUpdated)
        : 'Make sure Razer Synapse is running and the device is connected.';

    // Other connected devices, compact
    const others = devices.filter(d => d.isConnected && d !== device && d.handle !== device?.handle);
    $('other_devices').replaceChildren(...others.map(d => {
        const row = document.createElement('div');
        row.className = 'card row';
        const name = document.createElement('strong');
        name.textContent = d.name;
        row.append(name, document.createTextNode(`  ·  ${d.isOff ? 'Off' : `${d.batteryPercentage}%`}${d.isCharging ? ' · Charging' : ''}`));
        return row;
    }));

    // Device picker
    const select = $<HTMLSelectElement>('shown_device');
    const options = [new Option('Automatic (needs attention most)', '')];
    const known = new Set<string>();
    for (const d of devices) {
        known.add(d.handle);
        options.push(new Option(d.isConnected ? d.name : `${d.name} (not connected)`, d.handle));
    }
    if (settings.shownDeviceHandle && !known.has(settings.shownDeviceHandle)) {
        options.push(new Option('Previously selected device', settings.shownDeviceHandle));
    }
    select.replaceChildren(...options);
    select.value = settings.shownDeviceHandle;
}

// ---------- Icon previews ----------

let previewSequence = 0;
async function renderIconPreviews() {
    const sequence = ++previewSequence;
    const device = displayedDevice();
    const percent = device?.batteryPercentage ?? 59;
    const low = !!device && !device.isCharging && percent <= settings.lowBatteryThreshold;
    const charging = settings.displayChargingState && !!device?.isCharging;
    const off = !!device?.isOff;
    const light = appInfo.lightTaskbar;

    for (const style of ['battery', 'number'] as const) {
        // Show the icon exactly as it looks now, plus a charging variant for comparison.
        const variants = [
            { percent, charging, off, low },
            { percent: 100, charging: true, off: false, low: false },
            { percent: 8, charging: false, off: false, low: true },
        ];
        const urls = await Promise.all(variants.map(v => api.renderIcon({ style, ...v, lightTaskbar: light, size: 48 })));
        if (sequence !== previewSequence) { return; }
        const swatch = $(`preview_${style}`);
        swatch.classList.toggle('light', light);
        swatch.classList.toggle('dark', !light);
        swatch.replaceChildren(...urls.map(url => {
            const img = new Image();
            img.src = url;
            img.alt = '';
            return img;
        }));
    }
}

void main();
