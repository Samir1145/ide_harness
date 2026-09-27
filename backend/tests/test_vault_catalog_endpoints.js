const assert = require('assert');
const http = require('http');
const path = require('path');

// Test the routes directly by importing routes.js handler
const routes = require('../lib/routes');
const { loadModularCartridges, listLoadedCartridges } = require('../lib/utils/vault-loader');

async function testEndpoints() {
  console.log('--- Phase 1: Test Modular Cartridge Loading ---');
  loadModularCartridges();
  const loaded = listLoadedCartridges();
  console.log('Chambered Cartridges:', loaded);
  assert(loaded.includes('commercial_courts'), 'commercial_courts should be chambered');
  assert(loaded.includes('arbitration'), 'arbitration should be chambered');
  assert(loaded.includes('limitation'), 'limitation should be chambered');
  console.log('✓ Phase 1 Passed');

  console.log('--- Phase 2: Test /api/hayagriva/vault/acts route handler ---');
  let mockResBody = '';
  let mockResHeaders = {};
  let mockResStatusCode = 0;
  const mockRes = {
    writeHead: (code, headers) => {
      mockResStatusCode = code;
      mockResHeaders = headers;
    },
    end: (body) => {
      mockResBody = body;
    }
  };

  const handler = routes.GET['/api/hayagriva/vault/acts'];
  assert(typeof handler === 'function', 'Route handler for /api/hayagriva/vault/acts should exist in routes.GET');
  handler({}, mockRes);
  assert.strictEqual(mockResStatusCode, 200);
  const data = JSON.parse(mockResBody);
  assert(data.success === true, 'Response should succeed');
  assert(data.acts && data.acts.commercial_courts, 'Acts should include commercial_courts');
  assert(data.practice_suites && data.practice_suites.commercial_recovery_suite, 'Suites should include commercial_recovery_suite');
  assert(data.diskCartridges && data.diskCartridges.commercial_courts, 'Disk cartridges should include commercial_courts');
  assert(data.stats.totalChambered >= 3, 'At least 3 cartridges chambered');
  console.log('Stats:', data.stats);
  console.log('✓ Phase 2 Passed');

  console.log('--- Phase 3: Test /api/hayagriva/vault/act/view route handler ---');
  let viewResBody = '';
  const viewRes = {
    writeHead: (code, headers) => { mockResStatusCode = code; },
    end: (body) => { viewResBody = body; }
  };
  const viewHandler = routes.GET['/api/hayagriva/vault/act/view'];
  viewHandler({}, viewRes, { query: { key: 'commercial_courts' } });
  const viewData = JSON.parse(viewResBody);
  assert(viewData.success === true, 'View should succeed');
  assert(viewData.markdown.includes('Commercial Courts'), 'Markdown should contain Commercial Courts text');
  console.log('View Markdown length:', viewData.markdown.length, 'bytes');
  console.log('✓ Phase 3 Passed');

  console.log('All Vault Catalog API route tests passed successfully!');
}

testEndpoints().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
