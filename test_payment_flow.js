/**
 * test_payment_flow.js
 * Comprehensive automated verification for:
 * 1. Hardware Fingerprinting (Anti-Piracy)
 * 2. Razorpay Order Creation with 15-Field Telemetry
 * 3. HMAC-SHA256 Payment Verification & Device-Bound License Signing
 * 4. License Expiration & Status Inspection
 */

const http = require('http');
const crypto = require('crypto');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    }).on('error', reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(respData) }); }
        catch (e) { resolve({ status: res.statusCode, raw: respData }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('=== TEST SUITE: ₹1 Token Verification & Razorpay 15-Field Telemetry ===\n');

  // Test 1: Hardware Fingerprint Module
  console.log('[Test 1] Testing Hardware Fingerprint & Telemetry...');
  const { getMachineId, getSystemTelemetry } = require('./backend/lib/utils/machine-fingerprint');
  const machineId = getMachineId();
  const sysInfo = getSystemTelemetry();
  console.log(`  ✓ Machine ID: ${machineId}`);
  console.log(`  ✓ Telemetry: RAM=${sysInfo.systemRamGB}GB, Cores=${sysInfo.cpuCores}, OS=${sysInfo.osPlatform}`);
  if (!machineId || !sysInfo.systemRamGB) throw new Error('Machine fingerprint failed');

  // Test 2: Pricing Plans & 15 Notes Validation
  console.log('\n[Test 2] Validating Pricing Plans Schema & 15-Field Notes Builder...');
  const { PRICING_PLANS, buildOrderNotes } = require('./backend/lib/config/pricing-plans');
  if (!PRICING_PLANS.free_core_6m || PRICING_PLANS.free_core_6m.amountPaise !== 100) {
    throw new Error('free_core_6m plan not configured at 100 paise');
  }
  const sampleNotes = buildOrderNotes('free_core_6m', {
    name: 'Advocate Rajesh Sharma',
    email: 'rajesh@sharmachambers.in',
    phone: '+919876543210',
    role: 'Insolvency Professional',
    bench: 'Mumbai Bench',
    firm: 'Sharma & Associates',
    city: 'Mumbai, MH',
    source: 'direct_zip'
  }, sysInfo, 2);
  const noteKeys = Object.keys(sampleNotes);
  console.log(`  ✓ Total notes fields: ${noteKeys.length}/15`);
  if (noteKeys.length > 15) throw new Error('Razorpay allows maximum 15 notes!');
  noteKeys.forEach(k => console.log(`    - ${k}: ${sampleNotes[k]}`));

  // Test 3: GET /api/hayagriva/license/status
  console.log('\n[Test 3] Testing GET /api/hayagriva/license/status...');
  const statusRes = await get('http://127.0.0.1:3210/api/hayagriva/license/status?case=demo_case');
  console.log(`  ✓ License Status Response (HTTP ${statusRes.status}):`, JSON.stringify(statusRes.body, null, 2));
  if (statusRes.status !== 200) throw new Error('Failed to get license status');

  // Test 4: POST /api/hayagriva/payments/create-order
  console.log('\n[Test 4] Testing POST /api/hayagriva/payments/create-order (₹1 Token Free Core)...');
  const orderRes = await post('http://127.0.0.1:3210/api/hayagriva/payments/create-order', {
    planId: 'free_core_6m',
    name: 'Advocate Rajesh Sharma',
    email: 'rajesh@sharmachambers.in',
    phone: '+919876543210',
    role: 'Insolvency Professional',
    bench: 'Mumbai Bench',
    firm: 'Sharma & Associates',
    city: 'Mumbai, MH',
    source: 'direct_zip'
  });
  console.log(`  ✓ Create Order Response (HTTP ${orderRes.status}):`, JSON.stringify(orderRes.body, null, 2));
  if (orderRes.status !== 200 || !orderRes.body.orderId) {
    throw new Error(`Order creation failed: ${JSON.stringify(orderRes.body)}`);
  }
  const orderId = orderRes.body.orderId;
  const keyId = orderRes.body.keyId;
  console.log(`  ✓ Razorpay Order Created: ${orderId}, Amount: ${orderRes.body.amount} paise (₹${orderRes.body.amount / 100})`);

  // Test 5: POST /api/hayagriva/payments/verify with HMAC check
  console.log('\n[Test 5] Testing POST /api/hayagriva/payments/verify...');
  const testPaymentId = `pay_${Date.now().toString().slice(-10)}`;
  const keySecret = 'h5uVAx66nJnP5Vk1SX8cj2Xr';
  const validSignature = crypto.createHmac('sha256', keySecret)
    .update(`${orderId}|${testPaymentId}`)
    .digest('hex');

  const verifyRes = await post('http://127.0.0.1:3210/api/hayagriva/payments/verify', {
    razorpay_order_id: orderId,
    razorpay_payment_id: testPaymentId,
    razorpay_signature: validSignature,
    planId: 'free_core_6m',
    userData: {
      name: 'Advocate Rajesh Sharma',
      email: 'rajesh@sharmachambers.in',
      phone: '+919876543210',
      role: 'Insolvency Professional',
      bench: 'Mumbai Bench',
      firm: 'Sharma & Associates'
    },
    case: 'demo_case'
  });
  console.log(`  ✓ Verify Response (HTTP ${verifyRes.status}):`, JSON.stringify(verifyRes.body, null, 2));
  if (verifyRes.status !== 200 || !verifyRes.body.success) {
    throw new Error(`Verification failed: ${JSON.stringify(verifyRes.body)}`);
  }
  console.log(`  ✓ Signed Device-Bound License Key: ${verifyRes.body.licenseKey.substring(0, 40)}...`);
  console.log(`  ✓ Days Remaining: ${verifyRes.body.daysRemaining} days (6 months)`);

  // Test 6: Verify updated license status reflects 180 days active
  console.log('\n[Test 6] Re-checking GET /api/hayagriva/license/status after activation...');
  const postStatusRes = await get('http://127.0.0.1:3210/api/hayagriva/license/status?case=demo_case');
  console.log(`  ✓ Active License Verified:`, JSON.stringify(postStatusRes.body, null, 2));
  if (!postStatusRes.body.activated || postStatusRes.body.daysRemaining < 179) {
    throw new Error('License status does not reflect active 180-day state!');
  }

  // Test 7: Tamper / Device Lock Protection
  console.log('\n[Test 7] Testing Anti-Piracy Device Lock Protection...');
  const { verifyMachineLock } = require('./backend/lib/utils/machine-fingerprint');
  const isMatch = verifyMachineLock(postStatusRes.body.deviceId);
  const isSpoofBlocked = !verifyMachineLock('MAC-DIFFERENT_LAPTOP_1234');
  console.log(`  ✓ Current machine recognized: ${isMatch}`);
  console.log(`  ✓ Copied/Spoofed device locked: ${isSpoofBlocked}`);
  if (!isMatch || !isSpoofBlocked) throw new Error('Device lock protection failed');

  console.log('\n🎉 ALL 7 TESTS PASSED SUCCESSFULLY! (100%)\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
