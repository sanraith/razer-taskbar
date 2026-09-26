/**
 * Minimal .ico writer (32-bit BGRA DIB entries). No Electron imports so it can be tested with plain node.
 *
 * Why: on Windows, Electron's Tray converts a NativeImage to an HICON from its 1x bitmap only, so at 125%/150%
 * scaling Windows stretches the 16 px bitmap and the icon looks smudged. When the tray icon is loaded from an .ico
 * file, Windows picks the entry that exactly matches the tray size for the current DPI instead.
 */

export interface IcoEntry {
    size: number;
    /** Straight (non-premultiplied) RGBA pixels, top row first, size*size*4 bytes. */
    rgba: Buffer;
}

export function buildIco(entries: IcoEntry[]): Buffer {
    const sorted = [...entries].sort((a, b) => a.size - b.size);
    const images = sorted.map(e => encodeDib(e));
    const headerSize = 6 + 16 * sorted.length;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(sorted.length, 4);

    let offset = headerSize;
    sorted.forEach((e, i) => {
        const p = 6 + i * 16;
        header.writeUInt8(e.size >= 256 ? 0 : e.size, p);      // width
        header.writeUInt8(e.size >= 256 ? 0 : e.size, p + 1);  // height
        header.writeUInt8(0, p + 2);                           // palette colours
        header.writeUInt8(0, p + 3);                           // reserved
        header.writeUInt16LE(1, p + 4);                        // planes
        header.writeUInt16LE(32, p + 6);                       // bits per pixel
        header.writeUInt32LE(images[i].length, p + 8);         // bytes in resource
        header.writeUInt32LE(offset, p + 12);                  // offset
        offset += images[i].length;
    });
    return Buffer.concat([header, ...images]);
}

function encodeDib({ size, rgba }: IcoEntry): Buffer {
    if (rgba.length !== size * size * 4) {
        throw new Error(`ICO entry ${size}px: expected ${size * size * 4} bytes, got ${rgba.length}`);
    }
    const maskRowBytes = Math.ceil(size / 32) * 4;
    const pixelBytes = size * size * 4;
    const maskBytes = maskRowBytes * size;

    const info = Buffer.alloc(40);
    info.writeUInt32LE(40, 0);              // biSize
    info.writeInt32LE(size, 4);             // biWidth
    info.writeInt32LE(size * 2, 8);         // biHeight: XOR + AND masks
    info.writeUInt16LE(1, 12);              // biPlanes
    info.writeUInt16LE(32, 14);             // biBitCount
    info.writeUInt32LE(0, 16);              // BI_RGB
    info.writeUInt32LE(pixelBytes + maskBytes, 20);

    // Bottom-up rows, BGRA
    const pixels = Buffer.alloc(pixelBytes);
    for (let y = 0; y < size; y++) {
        const srcRow = y * size * 4;
        const dstRow = (size - 1 - y) * size * 4;
        for (let x = 0; x < size; x++) {
            const s = srcRow + x * 4;
            const d = dstRow + x * 4;
            pixels[d] = rgba[s + 2];
            pixels[d + 1] = rgba[s + 1];
            pixels[d + 2] = rgba[s];
            pixels[d + 3] = rgba[s + 3];
        }
    }
    // AND mask all zero: transparency comes from the alpha channel.
    const mask = Buffer.alloc(maskBytes);
    return Buffer.concat([info, pixels, mask]);
}
