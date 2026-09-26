import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIco } from '../src/main/ico';

test('writes a valid multi-size 32-bit ICO', () => {
    const rgba = (size: number) => {
        const b = Buffer.alloc(size * size * 4);
        b.writeUInt32BE(0x11223344, 0); // top-left pixel R=11 G=22 B=33 A=44
        return b;
    };
    const ico = buildIco([{ size: 20, rgba: rgba(20) }, { size: 16, rgba: rgba(16) }]);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 2);
    assert.equal(ico.readUInt8(6), 16, 'entries sorted by size');
    const offset = ico.readUInt32LE(6 + 12);
    assert.equal(ico.readUInt32LE(offset), 40, 'BITMAPINFOHEADER');
    assert.equal(ico.readInt32LE(offset + 8), 32, 'height doubled for the AND mask');
    // Top-left pixel lives in the last row (bottom-up), stored as BGRA.
    const pixel = offset + 40 + (16 - 1) * 16 * 4;
    assert.deepEqual([...ico.subarray(pixel, pixel + 4)], [0x33, 0x22, 0x11, 0x44]);
    assert.throws(() => buildIco([{ size: 16, rgba: Buffer.alloc(3) }]));
});
