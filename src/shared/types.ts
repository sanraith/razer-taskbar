/** Types shared between the main process, preload and the settings window. No runtime imports here. */

export interface RazerDevice {
    name: string;
    handle: string;
    batteryPercentage: number;
    isCharging: boolean;
    /** Device is known to Synapse (e.g. its dongle is plugged in). */
    isConnected: boolean;
    /** Device reports being powered off while its receiver is still connected. */
    isOff: boolean;
    /** When Synapse last reported this device's state (epoch ms), if known. */
    lastUpdated: number | null;
}

export type IconStyle = 'battery' | 'number';

export interface AppSettings {
    runAtStartup: boolean;
    /** Legacy name kept for compatibility: true = numeric icon, false = battery glyph. */
    showPercentage: boolean;
    pollingThrottleSeconds: number;
    displayChargingState: boolean;
    shownDeviceHandle: string;
    synapseVersion: 'auto' | 'v3' | 'v4';
    notifyLowBattery: boolean;
    lowBatteryThreshold: number;
    notifyCriticalBattery: boolean;
    criticalBatteryThreshold: number;
    notifyFullyCharged: boolean;
}

export interface IconPreviewRequest {
    style: IconStyle;
    percent: number | null;
    charging: boolean;
    off: boolean;
    low: boolean;
    lightTaskbar: boolean;
    size: number;
}

export interface AppInfo {
    version: string;
    supportsMica: boolean;
    isDarkMode: boolean;
    lightTaskbar: boolean;
}

export interface TrayAppApi {
    getSettings(): Promise<AppSettings>;
    updateSettings(changes: Partial<AppSettings>): Promise<void>;
    getDevices(): Promise<RazerDevice[]>;
    onDevicesChanged(callback: (devices: RazerDevice[]) => void): () => void;
    renderIcon(request: IconPreviewRequest): Promise<string>;
    getAppInfo(): Promise<AppInfo>;
    sendTestNotification(): Promise<void>;
    openExternal(target: 'github' | 'logs'): Promise<void>;
}
