import { Notification } from 'electron';
import { APP_ICON_PATH } from './resources';
import type { AppSettings, RazerDevice } from '../shared/types';

interface AlertState {
    lowSent: boolean;
    criticalSent: boolean;
    fullSent: boolean;
}

/** Re-arm low battery alerts only after the level climbs this far above the threshold. */
const HYSTERESIS = 5;

export interface Alert {
    kind: 'low' | 'critical' | 'full';
    title: string;
    body: string;
}

/**
 * Decides when to show battery notifications. Each alert fires once per crossing and re-arms when the
 * device is charged back up (or unplugged, for "fully charged"), so nothing repeats every poll.
 */
export class BatteryNotifier {
    private readonly state = new Map<string, AlertState>();

    constructor(private show: (alert: Alert) => void = showNotification) { }

    onDevicesChanged(devices: Iterable<RazerDevice>, settings: AppSettings): void {
        for (const device of devices) {
            for (const alert of this.evaluate(device, settings)) {
                this.show(alert);
            }
        }
    }

    /** Pure decision logic, exposed for tests. */
    evaluate(device: RazerDevice, settings: AppSettings): Alert[] {
        const alerts: Alert[] = [];
        const s = this.state.get(device.handle) ?? { lowSent: false, criticalSent: false, fullSent: false };
        this.state.set(device.handle, s);

        if (!device.isConnected || device.isOff) { return alerts; }
        const level = device.batteryPercentage;
        const critical = Math.min(settings.criticalBatteryThreshold, settings.lowBatteryThreshold);
        const low = settings.lowBatteryThreshold;

        if (device.isCharging) {
            s.lowSent = false;
            s.criticalSent = false;
            if (level >= 100 && !s.fullSent) {
                s.fullSent = true;
                if (settings.notifyFullyCharged) {
                    alerts.push({ kind: 'full', title: `${device.name} is fully charged`, body: 'You can unplug it now.' });
                }
            }
            return alerts;
        }

        // Not charging
        if (level < 100) { s.fullSent = false; }
        if (level > low + HYSTERESIS) { s.lowSent = false; }
        if (level > critical + HYSTERESIS) { s.criticalSent = false; }

        if (level <= critical && !s.criticalSent) {
            s.criticalSent = true;
            s.lowSent = true;
            if (settings.notifyCriticalBattery) {
                alerts.push({ kind: 'critical', title: `${device.name}: ${level}% battery`, body: 'Battery is critically low. Plug it in soon.' });
            }
        } else if (level <= low && !s.lowSent) {
            s.lowSent = true;
            if (settings.notifyLowBattery) {
                alerts.push({ kind: 'low', title: `${device.name}: ${level}% battery`, body: 'Battery is getting low.' });
            }
        }
        return alerts;
    }
}

export function showNotification(alert: Pick<Alert, 'title' | 'body'>): void {
    if (!Notification.isSupported()) { return; }
    new Notification({ title: alert.title, body: alert.body, icon: APP_ICON_PATH }).show();
}
