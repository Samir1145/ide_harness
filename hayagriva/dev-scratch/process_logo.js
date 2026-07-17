const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = '/Users/atulgrover/.gemini/antigravity-ide/brain/b1e834e3-b829-4b3f-bc99-a6ec23037c7f/media__1784293860225.png';
const outputDir = '/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources';

async function main() {
    if (!fs.existsSync(srcPath)) {
        console.error(`Source image not found at ${srcPath}`);
        process.exit(1);
    }

    console.log(`Processing logo from ${srcPath}...`);

    // 1. Load the image and get metadata
    const image = sharp(srcPath);
    const metadata = await image.metadata();
    console.log(`Source dimensions: ${metadata.width}x${metadata.height}`);

    // 2. Extract the alpha channel using threshold/negate.
    // The logo is black drawing on white background.
    // We want the black drawing to be opaque (alpha = 255) and white to be transparent (alpha = 0).
    // So alpha = 255 - grayscale.
    
    // We can do this by converting to greyscale, negating (inverting), and using it as the alpha channel.
    const negatedGrayscale = await sharp(srcPath)
        .greyscale()
        .negate()
        .toBuffer();

    // Create a solid color image of the same size
    // For white logo: solid white (255, 255, 255)
    const whiteLogo = await sharp({
        create: {
            width: metadata.width,
            height: metadata.height,
            channels: 3,
            background: { r: 255, g: 255, b: 255 }
        }
    })
    .joinChannel(negatedGrayscale) // join the negated grayscale buffer as alpha channel
    .png()
    .toBuffer();

    // For black logo: solid black (0, 0, 0)
    const blackLogo = await sharp({
        create: {
            width: metadata.width,
            height: metadata.height,
            channels: 3,
            background: { r: 0, g: 0, b: 0 }
        }
    })
    .joinChannel(negatedGrayscale)
    .png()
    .toBuffer();

    // Save white logo PNG
    const whiteLogoPath = path.join(outputDir, 'logo_white.png');
    fs.writeFileSync(whiteLogoPath, whiteLogo);
    console.log(`Saved white logo to ${whiteLogoPath}`);

    // Save black logo PNG
    const blackLogoPath = path.join(outputDir, 'logo_black.png');
    fs.writeFileSync(blackLogoPath, blackLogo);
    console.log(`Saved black logo to ${blackLogoPath}`);

    // Generate base64 for embedding in preload.html
    const base64White = whiteLogo.toString('base64');
    console.log(`Generated base64 white logo (length: ${base64White.length})`);
    
    // Also save the base64 text for easy reference
    fs.writeFileSync(path.join(outputDir, 'logo_white_base64.txt'), base64White);
}

main().catch(err => {
    console.error('Error processing logo:', err);
});
