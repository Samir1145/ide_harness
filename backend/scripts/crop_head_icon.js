#!/usr/bin/env node
/**
 * crop_head_icon.js
 * Crops just the Hayagriva deity figure (without HAYA/GRIVA text)
 * from the master logo and saves a transparent PNG for use in the footer.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const repoRoot   = path.resolve(__dirname, '../..');
const masterPath = path.join(repoRoot, 'branding/hayagriva_logo.png');
const outDir     = path.join(repoRoot, 'branding/resources');
const portalDir  = '/Users/atulgrover/Desktop/haya_portal/resources';

async function cropHead() {
  const img = await loadImage(masterPath);
  const W = img.width;   // 1024
  const H = img.height;  // 400

  console.log(`Master: ${W}x${H}`);

  // ── Crop bounds: centre strip containing only the deity (no side text) ──
  // The "HAYA" block ends ~290px, "GRIVA" starts ~730px on a 1024-wide image.
  // Add a small margin to exclude any text bleed.
  const cropX = Math.round(W * 0.355);   // ~364 — past 'HAYA agentic'
  const cropW = Math.round(W * 0.258);   // ~264  → roughly 364–628 (deity only, no right text)
  const cropY = 0;
  const cropH = H;

  // Draw cropped region onto a new canvas
  const canvas = createCanvas(cropW, cropH);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // Make near-white pixels transparent
  const imgData = ctx.getImageData(0, 0, cropW, cropH);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 230 && d[i+1] > 230 && d[i+2] > 230) {
      d[i+3] = 0; // transparent
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const buf = canvas.toBuffer('image/png');

  // Save to branding/resources
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'hayagriva_head.png'), buf);
  console.log('✓ Saved branding/resources/hayagriva_head.png');

  // Also copy directly to portal
  fs.mkdirSync(portalDir, { recursive: true });
  fs.writeFileSync(path.join(portalDir, 'hayagriva_head.png'), buf);
  console.log('✓ Copied to haya_portal/resources/hayagriva_head.png');
}

cropHead().catch(err => { console.error(err); process.exit(1); });
