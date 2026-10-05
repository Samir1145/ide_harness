const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Task 1 Test: Option 3B Emblem Asset Verification ---');

const pngPath = path.resolve(__dirname, '../../branding/resources/hayagriva_bust_no_crown.png');
const b64Path = path.resolve(__dirname, '../../branding/resources/hayagriva_bust_no_crown_base64.txt');

assert.strictEqual(fs.existsSync(pngPath), true, 'FAIL: hayagriva_bust_no_crown.png must exist');
assert.strictEqual(fs.existsSync(b64Path), true, 'FAIL: hayagriva_bust_no_crown_base64.txt must exist');

const b64Content = fs.readFileSync(b64Path, 'utf8').trim();
assert.strictEqual(b64Content.length > 500, true, 'FAIL: Base64 string must be non-empty and valid');

console.log('✅ Emblem asset test PASSED.');
