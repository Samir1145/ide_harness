const fs = require('fs');
const crypto = require('crypto');

/**
 * Calculates a SHA-256 hash of a file.
 * To maintain high performance and avoid blocking the event loop on huge files,
 * it reads up to a maximum prefix limit (e.g. 1MB) for hashing.
 */
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(filePath)) {
                return resolve('');
            }
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                return resolve('');
            }

            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath, { end: 1024 * 1024 }); // Max 1MB prefix for speed

            stream.on('data', chunk => {
                hash.update(chunk);
            });

            stream.on('end', () => {
                // Incorporate file size in hash to ensure files of same prefix but different sizes differ
                hash.update(stats.size.toString());
                resolve(hash.digest('hex'));
            });

            stream.on('error', err => {
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function calculateFileHashSync(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return '';
        }
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            return '';
        }

        const hash = crypto.createHash('sha256');
        const fd = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(1024 * 1024); // 1MB prefix max
        const bytesRead = fs.readSync(fd, buffer, 0, 1024 * 1024, 0);
        fs.closeSync(fd);

        hash.update(buffer.subarray(0, bytesRead));
        hash.update(stats.size.toString());
        return hash.digest('hex');
    } catch (_) {
        return '';
    }
}

module.exports = {
    calculateFileHash,
    calculateFileHashSync
};
