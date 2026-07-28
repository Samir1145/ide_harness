#!/usr/bin/env node
/**
 * process_branding.js
 * Canonical Node.js Branding & Logo Asset Processor for Hayagriva.
 *
 * Reads the master logo from branding/hayagriva_logo.png and generates:
 *   - Transparent PNG banners for UI panels (TheiaIDE.png / TheiaIDE-next.png) so they blend seamlessly with any background theme.
 *   - A solid white-background 512x512 square icon for window/dock/launcher use.
 *   - All destination copies across frontend/, branding/, backend/.
 *   - macOS .icns via iconutil (macOS only).
 *
 * Pure Node.js — uses @napi-rs/canvas (already installed in backend/).
 *
 * Usage: node backend/scripts/process_branding.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ── Path constants ────────────────────────────────────────────────────────────
const repoRoot = path.resolve(__dirname, '../..');
const masterLogoPath = path.join(repoRoot, 'branding/hayagriva_logo.png');
const resourcesDir = path.join(repoRoot, 'branding/resources');

// ── Helper: save canvas to PNG ────────────────────────────────────────────────
function saveCanvas(canvas, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = canvas.toBuffer('image/png');
    fs.writeFileSync(dest, buf);
}

// ── Generate square icon (white bg, logo centred with padding) ───────────────
async function makeSquareIcon(masterImg, size = 512, padding = 40) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // White background for app launcher icon
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Scale logo to fit inside padded area, maintaining aspect ratio
    const available = size - padding * 2;
    const scale = Math.min(available / masterImg.width, available / masterImg.height);
    const dw = Math.round(masterImg.width * scale);
    const dh = Math.round(masterImg.height * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);

    ctx.drawImage(masterImg, dx, dy, dw, dh);
    return canvas;
}

// ── Generate transparent banner for UI (light or dark theme variant) ───────────
async function makeTransparentBanner(masterImg, bw = 600, bh = 300, padH = 20, padV = 20, variant = 'black') {
    const canvas = createCanvas(bw, bh);
    const ctx = canvas.getContext('2d');

    // Scale logo to fit banner area
    const scale = Math.min((bw - padH * 2) / masterImg.width, (bh - padV * 2) / masterImg.height);
    const dw = Math.round(masterImg.width * scale);
    const dh = Math.round(masterImg.height * scale);
    const dx = Math.round((bw - dw) / 2);
    const dy = Math.round((bh - dh) / 2);

    ctx.drawImage(masterImg, dx, dy, dw, dh);

    // Manipulate pixels to make white background transparent
    const imgData = ctx.getImageData(0, 0, bw, bh);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a === 0 || (r > 235 && g > 235 && b > 235)) {
            // White or already transparent background
            data[i + 3] = 0;
        } else if (variant === 'white') {
            // Dark theme: turn artwork pixels into white
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function processBranding() {
    console.log('[Branding Processor] Reading master logo:', masterLogoPath);

    if (!fs.existsSync(masterLogoPath)) {
        console.error('[ERROR] Master logo not found:', masterLogoPath);
        process.exit(1);
    }

    const masterImg = await loadImage(masterLogoPath);
    console.log(`[Branding Processor] Master dimensions: ${masterImg.width}x${masterImg.height}`);

    // ── Generate assets ───────────────────────────────────────────────────────
    const squareCanvas = await makeSquareIcon(masterImg, 512, 40);
    const lightBannerCanvas = await makeTransparentBanner(masterImg, 600, 300, 20, 20, 'black');
    const darkBannerCanvas = await makeTransparentBanner(masterImg, 600, 300, 20, 20, 'white');

    // ── 1. Window / Dock icon destinations (512x512 square) ──────────────────
    const squareDestinations = [
        'frontend/applications/electron/resources/icons/WindowIcon/512-512.png',
        'frontend/applications/electron/resources/icon.png',
        'frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icon/Assets/icon.png',
        'frontend/applications/electron/resources/icons/LinuxLauncherIcons/512x512.png',
        'frontend/applications/electron/resources/icons/512x512.png',
        'frontend/applications/browser/resources/icon.png',
        'branding/resources/icons/WindowIcon/512-512.png',
        'branding/resources/icons/LinuxLauncherIcons/512x512.png',
        'branding/resources/icons/512x512.png',
        'branding/resources/icons/MacLauncherIcons/icon.icon/Assets/icon.png',
        'branding/resources/icon_black_512.png',
        'branding/resources/icon_white_512.png',
    ];

    for (const rel of squareDestinations) {
        saveCanvas(squareCanvas, path.join(repoRoot, rel));
    }
    console.log('✓ Synchronized square icon PNGs across all destinations');

    // ── 2. Product extension banners (Transparent backgrounds) ─────────────
    saveCanvas(lightBannerCanvas, path.join(repoRoot, 'frontend/theia-extensions/product/src/browser/icons/TheiaIDE.png'));
    saveCanvas(darkBannerCanvas, path.join(repoRoot, 'frontend/theia-extensions/product/src/browser/icons/TheiaIDE-next.png'));
    saveCanvas(lightBannerCanvas, path.join(repoRoot, 'branding/resources/logo_black.png'));
    saveCanvas(darkBannerCanvas, path.join(repoRoot, 'branding/resources/logo_white.png'));
    saveCanvas(lightBannerCanvas, path.join(repoRoot, 'docs/marketing/resources/hayagriva_logo_black.png'));
    saveCanvas(darkBannerCanvas, path.join(repoRoot, 'docs/marketing/resources/hayagriva_logo_white.png'));

    // Also copy 512x512 to product icons folder
    saveCanvas(squareCanvas, path.join(repoRoot, 'frontend/theia-extensions/product/src/browser/icons/512-512.png'));
    saveCanvas(squareCanvas, path.join(repoRoot, 'frontend/theia-extensions/product/src/browser/icons/512-512-next.png'));
    console.log('✓ Synchronized transparent product extension banners and icon PNGs');

    // ── 3. Backend assets ─────────────────────────────────────────────────────
    const backendAssetsDir = path.join(repoRoot, 'backend/lib/assets');
    fs.mkdirSync(backendAssetsDir, { recursive: true });
    fs.copyFileSync(masterLogoPath, path.join(backendAssetsDir, 'logo.png'));
    saveCanvas(squareCanvas, path.join(backendAssetsDir, 'icon.png'));
    console.log('✓ Synchronized backend assets');

    // ── 4. macOS .icns generation via iconutil (macOS only) ──────────────────
    const tmpIconset = path.join(resourcesDir, '.hayagriva_tmp.iconset');
    if (fs.existsSync(tmpIconset)) fs.rmSync(tmpIconset, { recursive: true });
    fs.mkdirSync(tmpIconset, { recursive: true });

    const sizes = [16, 32, 64, 128, 256, 512];
    for (const sz of sizes) {
        const c = await makeSquareIcon(masterImg, sz, Math.max(2, Math.round(sz * 0.08)));
        saveCanvas(c, path.join(tmpIconset, `icon_${sz}x${sz}.png`));
        const c2x = await makeSquareIcon(masterImg, sz * 2, Math.max(4, Math.round(sz * 0.16)));
        saveCanvas(c2x, path.join(tmpIconset, `icon_${sz}x${sz}@2x.png`));
    }

    const icnsOut = path.join(repoRoot, 'Hayagriva.app/Contents/Resources/hayagriva.icns');
    try {
        fs.mkdirSync(path.dirname(icnsOut), { recursive: true });
        execSync(`iconutil -c icns "${tmpIconset}" -o "${icnsOut}"`, { stdio: 'pipe' });

        const icnsDestinations = [
            'frontend/applications/electron/resources/icon.icns',
            'frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icns',
            'frontend/applications/browser/resources/icon.icns',
            'branding/resources/icons/MacLauncherIcons/icon.icns',
            'branding/resources/icon.icns',
        ];
        for (const rel of icnsDestinations) {
            const dest = path.join(repoRoot, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(icnsOut, dest);
        }
        console.log('✓ Generated macOS .icns icons');
    } catch (e) {
        console.warn('iconutil note (non-fatal):', e.message);
    } finally {
        fs.rmSync(tmpIconset, { recursive: true, force: true });
    }

    console.log('✓ All branding assets successfully compiled from master logo with transparent UI banners!');
}

if (require.main === module) {
    processBranding().catch(err => {
        console.error('[Branding Processor] Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { processBranding };
