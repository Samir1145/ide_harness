const assert = require('assert');
const routes = require('../lib/routes');
const { getTemplateManifest, getSkeletonContent } = require('../lib/vault/template-packs-registry');
const vaultLoader = require('../lib/utils/vault-loader');

async function testTemplateEndpoints() {
  console.log('--- Test 1: Test getTemplateManifest direct call ---');
  const manifest = getTemplateManifest();
  assert(manifest.success === true, 'Manifest should succeed');
  assert(manifest.packs.cirp_practice_pack, 'cirp_practice_pack should exist');
  assert(manifest.packs.personal_guarantors_pack, 'personal_guarantors_pack should exist');
  assert(manifest.packs.partnership_firms_pack, 'partnership_firms_pack should exist');
  assert(manifest.packs.voluntary_liquidation_pack, 'voluntary_liquidation_pack should exist');
  assert(manifest.packs.commercial_litigation_pack, 'commercial_litigation_pack should exist');
  assert(manifest.packs.regulatory_compliance_pack, 'regulatory_compliance_pack should exist');
  assert(manifest.stats.totalPacks === 6, 'Should have exactly 6 packs');
  assert(manifest.stats.totalSkeletons >= 240, `Should have >= 240 instruments, got ${manifest.stats.totalSkeletons}`);
  console.log(`Stats: ${manifest.stats.totalPacks} packs, ${manifest.stats.totalSkeletons} skeletons, ${manifest.stats.totalChamberOverlays} custom chamber overlays`);
  console.log('✓ Test 1 Passed');

  console.log('--- Test 2: Test getSkeletonContent for Order 38 Rule 5 & CIRP Form 1 ---');
  const skel = getSkeletonContent('cpc_order_38_rule_5_attachment', 'commercial_litigation_pack');
  assert(skel.success === true, 'Should find Order 38 skeleton');
  assert(skel.content.includes('ORDER XXXVIII RULE 5') || skel.content.includes('ATTACHMENT'), 'Content must contain Order 38 text');
  console.log(`Order 38 size: ${skel.content.length} bytes`);

  const cirpSkel = getSkeletonContent('CIRP-01_Section_7_Financial_Creditor_Form_1.md', 'cirp_practice_pack');
  assert(cirpSkel.success === true, 'Should find CIRP-01');
  assert(cirpSkel.content.includes('Section 7'), 'Must contain Section 7');
  console.log(`CIRP-01 size: ${cirpSkel.content.length} bytes`);
  console.log('✓ Test 2 Passed');

  console.log('--- Test 3: Test GET /api/hayagriva/templates/packs route ---');
  let mockResBody = '';
  let mockResStatusCode = 0;
  const mockRes = {
    writeHead: (code) => { mockResStatusCode = code; },
    end: (body) => { mockResBody = body; }
  };
  routes.GET['/api/hayagriva/templates/packs']({}, mockRes, { query: {} }, __dirname);
  assert.strictEqual(mockResStatusCode, 200);
  const data = JSON.parse(mockResBody);
  assert(data.success === true, 'Response must succeed');
  assert(data.packs.cirp_practice_pack, 'Must contain CIRP pack');
  assert(data.packs.commercial_litigation_pack, 'Must contain commercial pack');
  assert(data.stats.totalPacks === 6, 'Must report 6 packs');
  console.log('✓ Test 3 Passed');

  console.log('--- Test 4: Test GET /api/hayagriva/templates/view route ---');
  let viewResBody = '';
  const viewRes = {
    writeHead: (code) => { mockResStatusCode = code; },
    end: (body) => { viewResBody = body; }
  };
  routes.GET['/api/hayagriva/templates/view']({}, viewRes, { query: { key: 'cpc_order_38_rule_5_attachment.md' } }, __dirname);
  assert.strictEqual(mockResStatusCode, 200);
  const viewData = JSON.parse(viewResBody);
  assert(viewData.success === true, 'View must succeed');
  assert(viewData.content.length > 500, 'Content must have body');
  console.log('✓ Test 4 Passed');

  console.log('--- Test 5: Test AES-256 Vault Cartridge Chamber Decryption ---');
  vaultLoader.loadModularCartridges();
  const loadedCartridges = vaultLoader.listLoadedCartridges();
  assert(loadedCartridges.includes('cirp_practice_pack'), 'cirp_practice_pack must be loaded');
  assert(loadedCartridges.includes('commercial_litigation_pack'), 'commercial_litigation_pack must be loaded');
  assert(loadedCartridges.includes('personal_guarantors_pack'), 'personal_guarantors_pack must be loaded');

  const cirpDecrypted = vaultLoader.getLawText('cirp/cirp-01');
  assert(cirpDecrypted && cirpDecrypted.length > 1000, 'cirp/cirp-01 must decrypt');

  const cpcDecrypted = vaultLoader.getLawText('cca/cpc-order38');
  assert(cpcDecrypted && cpcDecrypted.length > 1000, 'cca/cpc-order38 must decrypt');
  console.log(`Vault decrypted CIRP-01 (${cirpDecrypted.length} bytes) and CPC Order 38 (${cpcDecrypted.length} bytes)`);
  console.log('✓ Test 5 Passed');

  console.log('\n✨ All 5 Form & Template Packs API and Vault Cartridge tests passed successfully!');
}

testTemplateEndpoints().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
