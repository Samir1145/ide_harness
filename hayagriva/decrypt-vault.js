const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index > -1) {
            const key = trimmed.slice(0, index).trim();
            const val = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
            process.env[key] = val;
        }
    }
}

const VAULT_DIR  = path.join(__dirname, 'vault');
const DATA_PATH  = path.join(VAULT_DIR, 'laws.vlt.data');
const MAN_PATH   = path.join(VAULT_DIR, 'manifest.json');
const OUT_PATH   = path.join(VAULT_DIR, 'laws-open.json');

const keyHex = process.env.VAULT_KEY || '';
const _vaultKey = Buffer.from(keyHex, 'hex');

function decryptChunk(key, buf) {
    const iv         = buf.slice(0, 12);
    const authTag    = buf.slice(12, 28);
    const ciphertext = buf.slice(28);
    const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const dataBuffer = fs.readFileSync(DATA_PATH);
const _index = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const openVault = [];

for (const entry of _index) {
    const lenPrefixEnd = entry.offset + 4;
    const blobEnd      = entry.offset + entry.length;

    const encBuf      = dataBuffer.slice(lenPrefixEnd, blobEnd);
    const compressed  = decryptChunk(_vaultKey, encBuf);
    const text        = zlib.gunzipSync(compressed).toString('utf8');
    
    openVault.push({
        id: entry.id,
        title: entry.title,
        section: entry.section,
        tokens: entry.tokens,
        text: text
    });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(openVault, null, 2));
console.log('Successfully wrote open vault to', OUT_PATH);
