import { execFile } from 'child_process';
import { nativeTheme } from 'electron';

const PERSONALIZE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';

/**
 * The taskbar has its own light/dark setting ("Choose your default Windows mode"), separate from the
 * app mode that nativeTheme reports. Read it from the registry so icons contrast with the taskbar.
 */
export function isTaskbarLight(): Promise<boolean> {
    if (process.platform !== 'win32') {
        return Promise.resolve(!nativeTheme.shouldUseDarkColors);
    }
    return new Promise(resolve => {
        execFile('reg', ['query', PERSONALIZE_KEY, '/v', 'SystemUsesLightTheme'], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
            if (err) { resolve(false); return; } // Windows default: dark taskbar
            const match = /SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(stdout);
            resolve(match ? parseInt(match[1], 16) === 1 : false);
        });
    });
}

/** Calls `onChange` whenever the taskbar theme flips. Returns a stop function. */
export function watchTaskbarTheme(onChange: (light: boolean) => void): () => void {
    let last: boolean | null = null;
    const check = async () => {
        const light = await isTaskbarLight();
        if (light !== last) {
            last = light;
            onChange(light);
        }
    };
    void check();
    // nativeTheme fires on most Windows theme changes; the interval covers the taskbar-only switch.
    const onUpdated = (): void => { void check(); };
    nativeTheme.on('updated', onUpdated);
    const interval = setInterval(check, 60_000);
    return () => {
        nativeTheme.off('updated', onUpdated);
        clearInterval(interval);
    };
}
