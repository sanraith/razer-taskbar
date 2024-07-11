import { createCanvas, loadImage, Image } from 'canvas';
import fs from 'fs';

async function main() {
    // Setup source images
    const imagesSrcMap: { maxPct: number, src: string; }[] = [
        { maxPct: 19, src: "battery0_wide.png" },
        { maxPct: 39, src: "battery25_wide.png" },
        { maxPct: 59, src: "battery50_wide.png" },
        { maxPct: 79, src: "battery75_wide.png" },
        { maxPct: 100, src: "battery100_wide.png" },
    ];
    const imagesMap: Map<string, Image> = new Map();
    for (const { src } of imagesSrcMap) {
        const image = await loadImage(`src/assets/${src}`);
        imagesMap.set(src, image);
    }
    const chargeOverlayImage = await loadImage("src/assets/chrg_overlay.png");

    // Create a canvas with the same dimensions as the image
    const initialImage = [...imagesMap.values()][0];
    const canvas = createCanvas(initialImage.width, initialImage.height);
    const ctx = canvas.getContext('2d');
    const bgColor = "#181B18";
    const fontSize = 26;

    console.log("Generating images...");
    const percentages = Array.from(Array(101).keys());
    for (const percentage of percentages) {
        const percentageStr = percentage.toString().padStart(2, "0");
        const fileName = `src/assets/numeric-icon/battery${percentageStr.padStart(3, "0")}.png`;
        const fileNameChrg = `src/assets/numeric-icon-chrg/battery${percentageStr.padStart(3, "0")}.png`;

        // Draw background image
        const imageData = imagesSrcMap.find(x => x.maxPct >= percentage);
        if (!imageData) { console.error(`could not find image for ${percentageStr}!!!`); continue; }
        const image = imagesMap.get(imageData.src);
        if (!image) { console.error(`could not find image for ${percentageStr}!!!`); continue; }
        ctx.clearRect(0, 0, 32, 32);
        ctx.drawImage(image, 0, 0);
        ctx.fillStyle = bgColor;
        ctx.fillRect(2, 4, 28, 26);

        // Draw text
        const point = ctx.getImageData(image.width / 2, 0, 1, 1).data;
        const textColor = rgbToHex(point[0], point[1], point[2]);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillStyle = textColor;
        const imageString = percentage === 100 ? "✔️" : percentageStr;
        const textWidth = ctx.measureText(imageString).width;
        if (percentage === 100) {
            ctx.fillText("✔️", (image.width - textWidth) / 2, 22);
        } else {
            ctx.fillText(imageString, (image.width - textWidth) / 2, 26);
        }

        // Save pixel data
        const modifiedBuffer = canvas.toBuffer('image/png');
        fs.writeFileSync(fileName, modifiedBuffer);

        // Save pixel data with charge icon
        ctx.drawImage(chargeOverlayImage, 0, 0);
        const chargingBuffer = canvas.toBuffer('image/png');
        fs.writeFileSync(fileNameChrg, chargingBuffer);
    }

    console.log("Done.");
}

function componentToHex(c: number) {
    const hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r: number, g: number, b: number) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

void main();
