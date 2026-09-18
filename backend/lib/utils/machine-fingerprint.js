/**
 * machine-fingerprint.js
 * Generates a deterministic, hardware-locked identifier for anti-piracy
 * and extracts system capacity telemetry (RAM, CPU, OS) for Razorpay analytics.
 */

const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

function getRawPlatformUUID() {
  try {
    if (process.platform === 'darwin') {
      // macOS: IOPlatformUUID
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { encoding: 'utf8', timeout: 3000 });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        return `mac_${match[1].trim()}`;
      }
    } else if (process.platform === 'win32') {
      // Windows: CSPRODUCT UUID or MachineGuid
      try {
        const out = execSync('powershell.exe -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', { encoding: 'utf8', timeout: 3000 });
        if (out && out.trim()) {
          return `win_${out.trim()}`;
        }
      } catch (e) {
        // Fallback to wmic
        const out = execSync('wmic csproduct get uuid', { encoding: 'utf8', timeout: 3000 });
        const lines = out.split('\r\n').filter(line => line.trim() !== '' && !line.includes('UUID'));
        if (lines.length > 0 && lines[0].trim()) {
          return `win_${lines[0].trim()}`;
        }
      }
    } else {
      // Linux: machine-id
      const fs = require('fs');
      if (fs.existsSync('/etc/machine-id')) {
        return `nix_${fs.readFileSync('/etc/machine-id', 'utf8').trim()}`;
      }
    }
  } catch (err) {
    // Fallback if permission/command fails
  }

  // Fallback: hash of CPU model, host, and network interface MAC
  const networkInterfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }

  const rawSeed = `${os.hostname()}_${os.cpus()[0]?.model || 'cpu'}_${mac}`;
  return `hash_${crypto.createHash('sha256').update(rawSeed).digest('hex').substring(0, 24)}`;
}

let _cachedMachineId = null;

function getMachineId() {
  if (!_cachedMachineId) {
    const raw = getRawPlatformUUID();
    // Normalize to consistent prefix + 16-character alphanumeric hash for neat display
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
    const prefix = process.platform === 'darwin' ? 'MAC' : (process.platform === 'win32' ? 'WIN' : 'NIX');
    _cachedMachineId = `${prefix}-${hash}`;
  }
  return _cachedMachineId;
}

function getSystemTelemetry() {
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpuCores = os.cpus().length;
  const platform = `${process.platform}_${process.arch} (${os.type()} ${os.release()})`;
  
  let appVersion = 'v2.4.0';
  try {
    const pkg = require('../../../package.json');
    if (pkg && pkg.version) appVersion = `v${pkg.version}`;
  } catch (e) {}

  return {
    deviceId: getMachineId(),
    systemRamGB: String(totalRamGB),
    cpuCores: String(cpuCores),
    osPlatform: platform.substring(0, 45), // keep under 50 chars for Razorpay note
    appVersion: appVersion
  };
}

function verifyMachineLock(licensedDeviceId) {
  if (!licensedDeviceId) return false;
  const currentId = getMachineId();
  return currentId === licensedDeviceId;
}

module.exports = {
  getMachineId,
  getSystemTelemetry,
  verifyMachineLock
};
