import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, NativeImage, nativeImage } from 'electron';
import { buildIco } from './ico';
import type { IconStyle } from '../shared/types';

export interface IconSpec {
    style: IconStyle;
    /** null = unknown / no device */
    percent: number | null;
    charging: boolean;
    off: boolean;
    low: boolean;
    /** true when the Windows taskbar uses the light theme (draw dark glyphs). */
    lightTaskbar: boolean;
}

/** Tray icon sizes per display scale factor (100% .. 200%). */
const TRAY_SIZES: [scaleFactor: number, size: number][] = [[1, 16], [1.25, 20], [1.5, 24], [1.75, 28], [2, 32]];
/** Sizes written into the Windows .ico: every tray size from 100% to 300% scaling. */
const ICO_SIZES = [16, 20, 24, 28, 32, 36, 40, 48];

/**
 * Renders Windows 11 style tray icons at runtime with a hidden, sandboxed window's <canvas>.
 * This gives crisp, per-DPI icons in the system font (Segoe UI Variable) for any percentage,
 * matched to the taskbar theme, instead of shipping hundreds of pre-rendered PNGs.
 */
export class IconRenderer {
    private window: BrowserWindow | null = null;
    private ready: Promise<void> | null = null;
    private readonly cache = new Map<string, NativeImage | string>();
    private readonly icoDir = path.join(app.getPath('userData'), 'tray-icons');

    init(): Promise<void> {
        if (!this.ready) {
            this.window = new BrowserWindow({
                show: false,
                width: 64,
                height: 64,
                skipTaskbar: true,
                webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
            });
            this.ready = this.window.loadURL('about:blank');
        }
        return this.ready;
    }

    dispose(): void {
        this.window?.destroy();
        this.window = null;
        this.ready = null;
    }

    /**
     * Tray image for the current platform. On Windows this is the path of a multi-size .ico file, so the shell
     * picks the exact pixel size for the display scaling (a NativeImage would be stretched from 16 px and blur).
     */
    async renderTrayImage(spec: IconSpec): Promise<NativeImage | string> {
        const key = JSON.stringify(normalize(spec));
        const cached = this.cache.get(key);
        if (cached) { return cached; }

        let result: NativeImage | string;
        if (process.platform === 'win32') {
            result = await this.renderIcoFile(spec, key);
        } else {
            const urls = await this.drawDataUrls(spec, TRAY_SIZES.map(([, size]) => size));
            const image = nativeImage.createEmpty();
            TRAY_SIZES.forEach(([scaleFactor], i) => image.addRepresentation({ scaleFactor, dataURL: urls[i] }));
            result = image;
        }

        if (this.cache.size > 256) { this.cache.clear(); }
        this.cache.set(key, result);
        return result;
    }

    private async renderIcoFile(spec: IconSpec, key: string): Promise<string> {
        const file = path.join(this.icoDir, `${crypto.createHash('md5').update(key).digest('hex')}.ico`);
        if (!fs.existsSync(file)) {
            await this.init();
            const script = `(${drawIcons.toString()})(${JSON.stringify(normalize(spec))}, ${JSON.stringify(ICO_SIZES)}, true)`;
            const raw: string[] = await this.window.webContents.executeJavaScript(script, true);
            const ico = buildIco(ICO_SIZES.map((size, i) => ({ size, rgba: Buffer.from(raw[i], 'base64') })));
            await fs.promises.mkdir(this.icoDir, { recursive: true });
            await fs.promises.writeFile(file, ico);
        }
        return file;
    }

    /** Remove cached .ico files from earlier runs (they are cheap to regenerate). */
    clearIconCache(): void {
        try { fs.rmSync(this.icoDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    /** Single size data URL, used for previews in the settings window. */
    async renderDataUrl(spec: IconSpec, size: number): Promise<string> {
        const [url] = await this.drawDataUrls(spec, [Math.max(8, Math.min(256, Math.round(size)))]);
        return url;
    }

    private async drawDataUrls(spec: IconSpec, sizes: number[]): Promise<string[]> {
        await this.init();
        const script = `(${drawIcons.toString()})(${JSON.stringify(normalize(spec))}, ${JSON.stringify(sizes)})`;
        return await this.window.webContents.executeJavaScript(script, true);
    }
}

function normalize(spec: IconSpec): IconSpec {
    return {
        style: spec.style,
        percent: spec.percent === null ? null : Math.max(0, Math.min(100, Math.round(spec.percent))),
        charging: !!spec.charging && !spec.off,
        off: !!spec.off,
        low: !!spec.low && !spec.charging && !spec.off,
        lightTaskbar: !!spec.lightTaskbar,
    };
}

/**
 * Runs inside the hidden renderer. Must be fully self-contained (no references to outer scope).
 * All shapes are drawn on whole pixels (no anti-aliasing) so they match the crisp shell icons in the tray.
 */
function drawIcons(spec: IconSpec, sizes: number[], rawRgba = false): string[] {
    const fg = spec.lightTaskbar ? '#1b1b1b' : '#ffffff';
    const red = spec.lightTaskbar ? '#c42b1c' : '#ff5b5b';
    const green = spec.lightTaskbar ? '#0f7b0f' : '#6ccb5f';
    const font = '"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

    /**
     * Pixel-exact battery in the style of the Windows tray icons next to it (network, volume):
     * 1 px strokes up to 150% scaling (2 px from 175%), square pixels, softened corners, no anti-aliasing.
     * Everything is drawn with whole-pixel fillRect calls so it is as sharp as the shell's own icons.
     */
    function drawBattery(ctx: CanvasRenderingContext2D, S: number) {
        const lw = S >= 28 ? 2 : 1;
        const bodyW = Math.round(S * 0.8);          // 16->13, 20->16, 24->19, 28->22, 32->26
        const bodyH = Math.round(S / 2 / 2) * 2;    // 16->8, 20->10, 24->12, 28->14, 32->16
        const tipW = Math.max(2, Math.round(S / 10));
        const tipH = Math.max(2, Math.round(bodyH * 0.45 / 2) * 2);
        const left = Math.floor((S - bodyW - tipW) / 2);
        const top = Math.floor((S - bodyH) / 2);
        const dim = spec.percent === null || spec.off;
        const px = (x: number, y: number, w: number, h: number) => ctx.fillRect(x, y, w, h);

        ctx.fillStyle = fg;
        ctx.globalAlpha = spec.off ? 0.4 : spec.percent === null ? 0.6 : 1;
        // Outline with the corner pixel left out, which reads as a small radius at tray sizes.
        const c = lw; // corner inset
        px(left + c, top, bodyW - 2 * c, lw);                      // top
        px(left + c, top + bodyH - lw, bodyW - 2 * c, lw);         // bottom
        px(left, top + c, lw, bodyH - 2 * c);                      // left
        px(left + bodyW - lw, top + c, lw, bodyH - 2 * c);         // right
        if (lw === 2) { // fill the inner corner pixel so 2 px strokes stay continuous
            px(left + 1, top + 1, 1, 1); px(left + bodyW - 2, top + 1, 1, 1);
            px(left + 1, top + bodyH - 2, 1, 1); px(left + bodyW - 2, top + bodyH - 2, 1, 1);
        }
        // Terminal
        px(left + bodyW, top + (bodyH - tipH) / 2, tipW - 1, tipH);
        px(left + bodyW + tipW - 1, top + (bodyH - tipH) / 2 + 1, 1, tipH - 2);

        // Level fill, 1 px gap inside the outline
        const gap = 1;
        const fx = left + lw + gap;
        const fy = top + lw + gap;
        const fullW = bodyW - 2 * (lw + gap);
        const fh = bodyH - 2 * (lw + gap);
        // While charging the bolt replaces the fill (a partly cut-out fill turns into noise at 16 px);
        // the exact level is in the tooltip.
        if (!dim && !spec.charging) {
            const pct = spec.percent as number;
            const fw = pct <= 0 ? 0 : Math.max(1, Math.round(fullW * pct / 100));
            if (fw > 0) { px(fx, fy, fw, fh); }
        }
        ctx.globalAlpha = 1;

        if (spec.charging) { drawPixelBolt(ctx, S, left + Math.floor(bodyW / 2), top, bodyH); }
    }

    /**
     * Lightning bolt overlaid on the battery centre, rasterised without anti-aliasing and cut out of the
     * battery by 1 px so it stays readable on top of the fill and outline.
     */
    function drawPixelBolt(ctx: CanvasRenderingContext2D, S: number, cx: number, top: number, bodyH: number) {
        const h = bodyH + (S >= 24 ? 4 : 2);
        const w = Math.max(5, Math.round(h * 0.6) | 1);
        const y0 = top + Math.floor((bodyH - h) / 2);
        const x0 = cx - Math.floor(w / 2);
        const pts = [[0.62, 0], [0.0, 0.58], [0.46, 0.58], [0.34, 1], [1.0, 0.40], [0.54, 0.40], [0.70, 0]];

        // Rasterise the bolt into a mask (threshold instead of anti-aliasing).
        const off = document.createElement('canvas');
        off.width = S; off.height = S;
        const o = off.getContext('2d');
        o.beginPath();
        pts.forEach(([u, v], i) => {
            const x = x0 + u * w; const y = y0 + v * h;
            if (i === 0) { o.moveTo(x, y); } else { o.lineTo(x, y); }
        });
        o.closePath();
        o.fillStyle = '#000';
        o.fill();
        const src = o.getImageData(0, 0, S, S).data;
        const mask: boolean[] = [];
        for (let i = 0; i < S * S; i++) { mask.push(src[i * 4 + 3] >= 110); }

        const img = ctx.getImageData(0, 0, S, S);
        const d = img.data;
        const [r, g, b] = fg === '#ffffff' ? [255, 255, 255] : [27, 27, 27];
        const inMask = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && mask[y * S + x];
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const i = (y * S + x) * 4;
                if (inMask(x, y)) {
                    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
                } else if (inMask(x - 1, y) || inMask(x + 1, y) || inMask(x, y - 1) || inMask(x, y + 1)) {
                    d[i + 3] = 0; // 1 px knockout around the bolt
                }
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    function drawNumber(ctx: CanvasRenderingContext2D, S: number) {
        if (spec.percent === null || spec.percent >= 100) {
            drawBattery(ctx, S);
            return;
        }
        const text = String(spec.percent);
        ctx.fillStyle = spec.charging ? green : spec.low ? red : fg;
        ctx.globalAlpha = spec.off ? 0.4 : 1;

        // Aim for digits ~75% of the icon height; allow up to 15% horizontal condensing so two digits
        // stay tall at 16 px, and shrink only if they still would not fit.
        const maxH = S * 0.75;
        const minScaleX = 0.85;
        let size = S;
        let m: TextMetrics;
        let inkW = 0;
        let inkH = 0;
        for (; size > 6; size -= 0.5) {
            ctx.font = `600 ${size}px ${font}`;
            m = ctx.measureText(text);
            inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
            inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
            if (inkH <= maxH && inkW * minScaleX <= S) { break; }
        }
        const scaleX = Math.min(1, S / inkW);
        const x = (S - inkW * scaleX) / 2 + m.actualBoundingBoxLeft * scaleX;
        const y = Math.round((S - inkH) / 2 + m.actualBoundingBoxAscent);
        ctx.save();
        ctx.translate(Math.round(x * 2) / 2, y);
        ctx.scale(scaleX, 1);
        ctx.fillText(text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    const canvas = document.createElement('canvas');
    canvas.getContext('2d', { willReadFrequently: true });
    return sizes.map(S => {
        canvas.width = S;
        canvas.height = S;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, S, S);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        if (spec.style === 'number') {
            drawNumber(ctx, S);
        } else {
            drawBattery(ctx, S);
        }
        if (!rawRgba) { return canvas.toDataURL('image/png'); }
        // Straight (non-premultiplied) RGBA as base64, for building .ico files in the main process.
        const bytes = ctx.getImageData(0, 0, S, S).data;
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
        }
        return btoa(binary);
    });
}
