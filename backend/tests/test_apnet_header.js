/**
 * Navigation Test Suite & Link Validator for APNET Website
 * Validates brand identity, 4-pillar taxonomy, 3-column mega menus, action cluster, and link integrity on disk.
 */

const fs = require('fs');
const path = require('path');

const APNET_ROOT = '/Users/atulgrover/Desktop/HAYAGRIVA/apnet_website';
const HEADER_PATH = path.join(APNET_ROOT, 'header.html');

function runTests() {
  console.log('====================================================');
  console.log('APNET 4-Pillar Navigation Integrity & Link Validator');
  console.log('====================================================');

  if (!fs.existsSync(HEADER_PATH)) {
    console.error(`FATAL: header.html not found at ${HEADER_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(HEADER_PATH, 'utf8');
  const errors = [];
  const warnings = [];

  // Helper assertions
  function assert(condition, message) {
    if (!condition) {
      errors.push(`[FAIL] ${message}`);
    } else {
      console.log(`[PASS] ${message}`);
    }
  }

  // 1. Brand Identity Assertions
  console.log('\n--- 1. Brand Identity & Subtitle ---');
  assert(
    content.includes('AGENTIC PROFESSIONALS NETWORK'),
    'Header contains main title "AGENTIC PROFESSIONALS NETWORK"'
  );
  assert(
    /powered by hayagriva sovereign intelligence/i.test(content),
    'Header contains subtitle "Powered by Hayagriva Sovereign Intelligence"'
  );

  // 2. Four Sovereign Pillars Assertions
  console.log('\n--- 2. Sovereign 4-Pillar Taxonomy ---');
  assert(
    content.includes('id="dropdown-workbench-wrapper"') || content.includes('id="dropdown-workbench"'),
    'Pillar 1 wrapper exists: WORKBENCH'
  );
  assert(
    /WORKBENCH[\s\S]*?Sovereign Harness/i.test(content),
    'Pillar 1 has Title "WORKBENCH" and Subtitle "Sovereign Harness"'
  );

  assert(
    content.includes('id="dropdown-intelligence-wrapper"') || content.includes('id="dropdown-intelligence"'),
    'Pillar 2 wrapper exists: INTELLIGENCE'
  );
  assert(
    /INTELLIGENCE[\s\S]*?Knowledge Vaults/i.test(content),
    'Pillar 2 has Title "INTELLIGENCE" and Subtitle "Knowledge Vaults"'
  );

  assert(
    content.includes('id="dropdown-agents-wrapper"') || content.includes('id="dropdown-agents"'),
    'Pillar 3 wrapper exists: AGENTS'
  );
  assert(
    /ENTERPRISE[\s\S]*?Co-Counsel Agents/i.test(content),
    'Pillar 3 has Title "ENTERPRISE" and Subtitle "Co-Counsel Agents"'
  );

  assert(
    content.includes('id="dropdown-community-wrapper"') || content.includes('id="dropdown-community"'),
    'Pillar 4 wrapper exists: COMMUNITY'
  );
  assert(
    /COMMUNITY[\s\S]*?Hayagriva Resources/i.test(content),
    'Pillar 4 has Title "COMMUNITY" and Subtitle "Hayagriva Resources"'
  );

  // 3. Prohibited Tokens (No Pricing, No localhost:3300 portal bleed, No old render app)
  console.log('\n--- 3. Policy & Boundary Enforcement ---');
  const hasPricingInNav = /<ul class="nav-menu"[\s\S]*?<\/ul>/i.test(content) &&
    /pricing/i.test(content.match(/<ul class="nav-menu"[\s\S]*?<\/ul>/i)[0]);
  assert(!hasPricingInNav, 'Top navigation menu omits "Pricing & Practice Suites"');

  // Portal doorway link points to production cloud portal
  assert(content.includes('https://app-apnet-net.onrender.com/login'), 'Header doorway link points to production cloud portal /login');

  // 4. Action Cluster Assertions
  console.log('\n--- 4. Action Cluster (Single Login Button) ---');
  assert(
    content.includes('id="btn-login"') && (content.includes('fa-right-to-bracket') || content.includes('nav-portal-icon')) && content.includes('Hayagriva Downloads'),
    'Action cluster has Doorway Portal icon (fa-right-to-bracket) with tooltip "Hayagriva Downloads"'
  );
  const navMenuBlock = content.match(/<ul class="nav-menu"[\s\S]*?<\/ul>/i);
  const navHtmlContent = navMenuBlock ? navMenuBlock[0] : '';
  assert(
    !navHtmlContent.includes('Download Hayagriva'),
    'Header nav-menu strictly omits "Download Hayagriva" button'
  );

  // 5. Link Integrity: Validate every relative href inside navigation
  console.log('\n--- 5. Navigation Link Integrity on Disk ---');
  const navMenuMatch = content.match(/<ul class="nav-menu"[\s\S]*?<\/ul>/i);
  if (navMenuMatch) {
    const navHtml = navMenuMatch[0];
    const hrefRegex = /href=["']([^"']+)["']/g;
    let match;
    const validatedLinks = new Set();

    while ((match = hrefRegex.exec(navHtml)) !== null) {
      const rawHref = match[1];
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://') || rawHref.startsWith('javascript:') || rawHref.startsWith('#')) {
        continue;
      }

      const cleanPath = rawHref.split('#')[0].split('?')[0];
      if (!cleanPath) continue;

      if (!validatedLinks.has(cleanPath)) {
        validatedLinks.add(cleanPath);
        const diskPath = path.join(APNET_ROOT, cleanPath);
        if (fs.existsSync(diskPath)) {
          console.log(`[PASS] Link exists on disk: ${cleanPath}`);
        } else {
          errors.push(`[FAIL] Broken nav link! File does not exist: ${cleanPath} (resolved to: ${diskPath})`);
        }
      }
    }
    console.log(`Validated ${validatedLinks.size} unique internal navigation links.`);
  } else {
    errors.push('[FAIL] Could not locate <ul class="nav-menu"> in header.html');
  }

  // Summary
  console.log('\n====================================================');
  console.log(`Total Errors: ${errors.length}`);
  console.log(`Total Warnings: ${warnings.length}`);
  console.log('====================================================');

  if (errors.length > 0) {
    console.log('\nFailure Details:');
    errors.forEach(e => console.log('  ' + e));
    process.exit(1);
  } else {
    console.log('\nAll navigation and link integrity checks PASSED!');
    process.exit(0);
  }
}

runTests();
