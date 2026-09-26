/**
 * Lets main-process modules be imported under plain node: replaces `electron` with a tiny stub.
 * Import this first in any test that (transitively) imports electron.
 */
import fs from 'fs';
import Module from 'module';
import os from 'os';
import path from 'path';

export const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'razer-taskbar-test-'));

const stub = {
    app: { isPackaged: false, getPath: () => userDataDir },
    ipcMain: { handle: (): void => undefined },
    Notification: class { static isSupported(): boolean { return false; } show(): void { return undefined; } },
};

type Loader = (request: string, ...rest: unknown[]) => unknown;
const mod = Module as unknown as { _load: Loader };
const originalLoad = mod._load;
mod._load = function (request: string, ...rest: unknown[]) {
    return request === 'electron' ? stub : originalLoad.call(this, request, ...rest);
};
