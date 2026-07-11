const fs = require('fs');
const path = require('path');

const repoRoot = '/Users/atulgrover/Desktop/HAYAGRIVA';
const resourcesDir = path.join(repoRoot, 'resources/resources');

const whiteLogoPng = path.join(resourcesDir, 'logo_white.png');
const whiteIconPng = path.join(resourcesDir, 'icon_white_512.png');
const base64White = fs.readFileSync(path.join(resourcesDir, 'logo_white_base64.txt'), 'utf8');

function main() {
    console.log('Applying premium transparent Hayagriva branding (gradient-floating splash + pulsing glow loader)...');

    // 1. Update resources/resources/preload.html with glowing color-shift animation
    const preloadPath = path.join(resourcesDir, 'preload.html');
    let preloadContent = fs.readFileSync(preloadPath, 'utf8');
    
    // Replace SVG element with IMG tag using base64 src
    const svgRegex = /<svg id="spinner"[\s\S]*?<\/svg>/;
    const newImgTag = `<img id="spinner" src="data:image/png;base64,${base64White}" alt="Hayagriva Logo" />`;
    preloadContent = preloadContent.replace(svgRegex, newImgTag);

    // Replace the SVG CSS styling with IMG styling
    preloadContent = preloadContent.replace(
        /\.custom-spinner\s+img\s*\{[\s\S]*?\}/,
        `.custom-spinner img {
            width: 32vw;
            height: auto;
            max-width: 450px;
            animation-delay: 0;
            animation-duration: 3s;
            animation-iteration-count: infinite;
            animation-name: theia-ide-spinner;
            animation-timing-function: ease-in-out;
        }`
    );

    // Modify the animation to have a pulsing scale, fading opacity, and a shifting neon color glow
    preloadContent = preloadContent.replace(
        /@keyframes\s+theia-ide-spinner\s*\{[\s\S]*?\}/g,
        `@keyframes theia-ide-spinner {
            0% {
                transform: scale(1.0);
                opacity: 0.95;
                filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.7)) sepia(30%) saturate(1500%) hue-rotate(190deg);
            }
            50% {
                transform: scale(0.96);
                opacity: 0.65;
                filter: drop-shadow(0 0 24px rgba(6, 182, 212, 0.9)) sepia(30%) saturate(1500%) hue-rotate(145deg);
            }
            100% {
                transform: scale(1.0);
                opacity: 0.95;
                filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.7)) sepia(30%) saturate(1500%) hue-rotate(190deg);
            }
        }`
    );

    fs.writeFileSync(preloadPath, preloadContent, 'utf8');
    console.log(`- Updated preload.html: ${preloadPath}`);

    // 2. Generate new resources/resources/TheiaIDESplash.svg with transparent background and gradient mask
    const splashSvgPath = path.join(resourcesDir, 'TheiaIDESplash.svg');
    const splashSvgContent = `<?xml version="1.1" encoding="UTF-8" standalone="no"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1160 484" width="445.5" height="186">
  <defs>
    <!-- Define a premium linear gradient from Cyber Cyan to Neon Violet -->
    <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    
    <!-- Define a mask using the base64 white logo -->
    <mask id="logo-mask">
      <image href="data:image/png;base64,${base64White}" x="0" y="0" width="1160" height="484" />
    </mask>
  </defs>
  
  <!-- Transparent background: removed solid rect background -->
  
  <!-- Rect filled with our beautiful gradient, masked by the logo -->
  <rect x="0" y="0" width="1160" height="484" fill="url(#logo-gradient)" mask="url(#logo-mask)" />
</svg>`;
    fs.writeFileSync(splashSvgPath, splashSvgContent, 'utf8');
    console.log(`- Generated transparent gradient-masked splash screen: ${splashSvgPath}`);

    // 3. Copy files to ide/theia-extensions/product
    const productIconsDir = path.join(repoRoot, 'ide/theia-extensions/product/src/browser/icons');
    if (fs.existsSync(productIconsDir)) {
        // Copy product logos
        fs.copyFileSync(whiteLogoPng, path.join(productIconsDir, 'TheiaIDE.png'));
        fs.copyFileSync(whiteLogoPng, path.join(productIconsDir, 'TheiaIDE-next.png'));
        console.log(`- Copied product logos to ${productIconsDir}`);

        // Copy product icons
        fs.copyFileSync(whiteIconPng, path.join(productIconsDir, '512-512.png'));
        fs.copyFileSync(whiteIconPng, path.join(productIconsDir, '512-512-next.png'));
        console.log(`- Copied product icons to ${productIconsDir}`);
    }

    // 4. Copy files to resources/resources/icons
    fs.copyFileSync(whiteIconPng, path.join(resourcesDir, 'icons/512x512.png'));
    fs.copyFileSync(whiteIconPng, path.join(resourcesDir, 'icons/WindowIcon/512-512.png'));
    console.log(`- Copied window and launcher icons to resources/resources/icons`);

    // 5. Copy to all app resources directories in ide/applications
    const apps = ['electron', 'electron-next', 'browser'];
    apps.forEach(app => {
        const appResDir = path.join(repoRoot, `ide/applications/${app}/resources`);
        if (fs.existsSync(appResDir)) {
            // Copy preload.html
            fs.copyFileSync(preloadPath, path.join(appResDir, 'preload.html'));
            // Copy TheiaIDESplash.svg
            fs.copyFileSync(splashSvgPath, path.join(appResDir, 'TheiaIDESplash.svg'));
            
            // Safe copy icons
            const icon512 = path.join(appResDir, 'icons/512x512.png');
            if (fs.existsSync(path.dirname(icon512))) {
                fs.copyFileSync(whiteIconPng, icon512);
            }
            const windowIconPath = path.join(appResDir, 'icons/WindowIcon/512-512.png');
            if (fs.existsSync(path.dirname(windowIconPath))) {
                fs.copyFileSync(whiteIconPng, windowIconPath);
            }
            console.log(`- Copied branding resources to ${appResDir}`);
        }
    });

    console.log('Branding apply completed successfully.');
}

main();
