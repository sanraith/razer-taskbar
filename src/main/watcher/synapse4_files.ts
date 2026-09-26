import fs from 'fs';
import path from 'path';
import { SYNAPSE4_LOG_FILE_REGEX } from './synapse4_parser';

export const SynapseV4LogDir = path.resolve(process.env.LOCALAPPDATA ?? '', 'Razer', 'RazerAppEngine', 'User Data', 'Logs');

export interface LogFileInfo {
    fileName: string;
    fullPath: string;
    modifyTime: Date;
    size: number;
    sequenceIndex: number;
}

/**
 * All Synapse 4 systray logs, newest first.
 * Synapse rotates at ~5 MB (systray_systrayv2.log, systray_systrayv23.log, ...), so sort by modification
 * time first and only use the rotation index as a tie breaker.
 */
export function getV4Candidates(dir: string = SynapseV4LogDir): LogFileInfo[] {
    try {
        if (!fs.existsSync(dir)) { return []; }
        const candidates: LogFileInfo[] = [];
        for (const fileName of fs.readdirSync(dir)) {
            const match = SYNAPSE4_LOG_FILE_REGEX.exec(fileName);
            if (!match) { continue; }
            const fullPath = path.resolve(dir, fileName);
            try {
                const stat = fs.statSync(fullPath);
                candidates.push({
                    fileName,
                    fullPath,
                    modifyTime: stat.mtime,
                    size: stat.size,
                    sequenceIndex: parseInt(match.groups.index || '-1'),
                });
            } catch { /* file vanished during rotation */ }
        }
        candidates.sort((a, b) => (b.modifyTime.getTime() - a.modifyTime.getTime()) || (b.sequenceIndex - a.sequenceIndex));
        return candidates;
    } catch (e) {
        console.log(`Error finding Synapse 4 log files: ${e}`);
    }
    return [];
}
