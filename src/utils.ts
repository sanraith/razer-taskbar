import { app } from 'electron';

export function assertNever(value: never, noThrow?: boolean): never {
    if (noThrow) {
        return value;
    }
    throw new Error(
        `Unhandled discriminated union member: ${JSON.stringify(value)}`,
    );
}

export const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;