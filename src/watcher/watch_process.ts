import TrayManager from '../tray_manager';
import { RazerDevice } from './razer_watcher';

export abstract class WatchProcess {
    constructor(protected trayManager: TrayManager) { }
    abstract start(): void;
    abstract stop(): void;
    devices: Map<string, RazerDevice> = new Map();
}
