import type { RazerDevice } from '../../shared/types';

export abstract class WatchProcess {
    /**
     * @param devices shared device state, owned by RazerWatcher. Watchers replace entries instead of mutating them.
     * @param notify call after the device state changed.
     */
    constructor(protected devices: Map<string, RazerDevice>, protected notify: () => void) { }
    abstract start(): void;
    abstract stop(): void;
}
