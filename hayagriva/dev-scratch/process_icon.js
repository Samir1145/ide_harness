const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = '/Users/atulgrover/Desktop/Screenshot 2026-07-11 at 4.07.34 PM.png';
const outputDir = '/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources';

async function main() {
    if (!fs.existsSync(srcPath)) {
        console.error(`Source image not found at ${srcPath}`);
        process.exit(1);
    }

    console.log(`Processing icon from ${srcPath}...`);

    // We crop a square in the center of the 1160x484 image to extract the horse head
    // width: 484, height: 484, left: (1160 - 484) / 2 = 338, top: 0
    const cropWidth = 484;
    const cropHeight = 484;
    const cropLeft = 338;
    const cropTop = 0;

    // Get the cropped grayscale negation buffer for alpha channel
    const negatedGrayscaleCropped = await sharp(srcPath)
        .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
        .greyscale()
        .negate()
        .resize(512, 512)
        .toBuffer();

    // Create 512x512 solid white image with alpha channel from the mask
    const whiteIcon = await sharp({
        create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .joinChannel(negatedGrayscaleCropped)
    .png()
    .toBuffer();

    // Create 512x512 solid black icon
    const blackIcon = await sharp({
        create: {
            width: 512,
            height: 512,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    })
    .joinChannel(negatedGrayscaleCropped)
    .png()
    .toBuffer();

    // Save white icon PNG
    const whiteIconPath = path.join(outputDir, 'icon_white_512.png');
    fs.writeFileSync(whiteIconPath, whiteIcon);
    console.log(`Saved white 512x512 icon to ${whiteIconPath}`);

    // Save black icon PNG
    const blackIconPath = path.join(outputDir, 'icon_black_512.png');
    fs.writeFileSync(blackIconPath, blackIcon);
    console.log(`Saved black 512x512 icon to ${blackIconPath}`);
}

main().catch(err => {
    console.error('Error processing icon:', err);
});
