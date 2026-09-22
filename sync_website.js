const fs = require('fs');
const path = require('path');

const websiteCandidates = [
  path.join(require('os').homedir(), 'Desktop', 'WEBSITES', 'apnet'),
  path.join(require('os').homedir(), 'Desktop', 'website_apnet.co.in')
];
const websiteRoot = websiteCandidates.find(p => fs.existsSync(p)) || websiteCandidates[0];

console.log('Synchronizing website_apnet.co.in pages with Hayagriva IDE capabilities...');

// ─────────────────────────────────────────────────────────────────────────────
// 1. UPDATE pricing.html
// ─────────────────────────────────────────────────────────────────────────────
const pricingPath = path.join(websiteRoot, 'pricing.html');
if (fs.existsSync(pricingPath)) {
  let content = fs.readFileSync(pricingPath, 'utf8');

  // Update Tier 1 card features to emphasize Perpetual Free Core DMS & Dual-Pane
  content = content.replace(
    /<ul class="features-list">\s*<li class="feature-item">\s*<i class="fa-solid fa-check feature-icon-check"><\/i>\s*<span><strong>Hayagriva Desktop IDE<\/strong>[\s\S]*?<\/ul>/,
    `<ul class="features-list">
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>100% Perpetual Free Core DMS</strong>: Unlimited local document ingestion, hybrid FTS5 search &amp; Monaco editor</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Dual-Pane Live Authoring Mode</strong>: Split-view Monaco Markdown editing with real-time rendered HTML preview synced on Cmd+S</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>3-Dot Status Pipeline</strong>: Visual verification of companion markdown, AI memory indexing, and extracted case facts</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Local Document Parsing &amp; OCR</strong>: Fast local parsing for PDFs, Word, Excel sheets, and standalone Markdown</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>100% Air-Gapped &amp; Sovereign</strong>: Zero cloud leakage, no telemetry; works offline in courtrooms and chambers</span>
          </li>
        </ul>`
  );

  // Update Tier 2 card: ₹25,000 / year with 7-Day Free Trial
  content = content.replace(
    /<div class="price-card featured">[\s\S]*?<!-- TIER 3:/,
    `<div class="price-card featured">
        <div class="featured-ribbon"><i class="fa-solid fa-star"></i> 7-Day Free Trial Available</div>
        <div class="card-header-block">
          <span class="tier-badge tier-badge-sub"><i class="fa-solid fa-arrows-rotate"></i> Tier 2 · Pro Agentic Suite</span>
          <h2 class="tier-name">Living Vaults &amp; Agents</h2>
          <p class="tier-target">For active resolution professionals, insolvency teams &amp; corporate law chambers requiring specialized drafting agents and statutory vaults.</p>
          <div class="price-value-row">
            <span class="price-currency">₹</span>
            <span class="price-amount" id="tier2-price">25,000</span>
            <span class="price-period" id="tier2-period">/ year / seat</span>
          </div>
          <div class="price-meta" id="tier2-billing-text">7-Day Free Trial • Instant In-IDE Activation • Cancel anytime</div>
        </div>

        <ul class="features-list">
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Includes Everything in Tier 1</strong> + Full Agentic Suite</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Offline Monaco Law Vault</strong>: 4,026+ bare act provisions with instant inline <code style="color:#0284c7;">@@</code> / <code style="color:#0284c7;">@sec</code> auto-completion &amp; hovers</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Precedents Vault</strong>: 17,500+ court judgments searchable directly within the editor</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Autonomous Drafting Agents</strong>: <code style="color:#10b981;">@Advisor</code>, <code style="color:#10b981;">@Forms</code>, and <code style="color:#10b981;">@Document</code> subagents with self-auditing critique loops</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>Supreme Court &amp; NCLT Compilers</strong>: 1-click export to Supreme Court formatted DOCX (A4, 14pt, 1.5 spacing) and Court PDFs</span>
          </li>
          <li class="feature-item">
            <i class="fa-solid fa-check feature-icon-check"></i>
            <span><strong>1-Click Fortnightly Vault Sync</strong>: Bi-weekly delta packs with latest NCLT, NCLAT, High Court &amp; SC rulings</span>
          </li>
        </ul>

        <a href="#subscribe" onclick="alert('Start your 7-Day Free Trial inside Hayagriva IDE under Hayagriva ➔ Start 7-Day Free Trial, or enter your license key in Settings.'); return false;" class="btn-action-tier btn-tier-sub">
          <i class="fa-solid fa-bolt"></i> Start 7-Day Free Trial
        </a>
      </div>

      <!-- TIER 3:`
  );

  // Update setBillingCycle javascript logic
  content = content.replace(
    /if \(cycle === 'annual'\) \{[\s\S]*?priceEl\.innerText = '29,999';[\s\S]*?\} else \{[\s\S]*?priceEl\.innerText = '2,999';[\s\S]*?\}/,
    `if (cycle === 'annual') {
        btnAnnual.classList.add('active');
        btnMonthly.classList.remove('active');
        priceEl.innerText = '25,000';
        periodEl.innerText = '/ year / seat';
        textEl.innerText = 'Billed annually (Save ₹5,000) • 7-Day Free Trial Included';
      } else {
        btnMonthly.classList.add('active');
        btnAnnual.classList.remove('active');
        priceEl.innerText = '2,500';
        periodEl.innerText = '/ month / seat';
        textEl.innerText = 'Billed monthly • Cancel anytime';
      }`
  );

  // Update comparison table
  content = content.replace(
    /<td style="background: #f0f9ff; font-weight:700; color:#0284c7;">₹2,999\/mo or ₹29,999\/yr<\/td>/,
    '<td style="background: #f0f9ff; font-weight:700; color:#0284c7;">₹25,000/yr (7-Day Free Trial)</td>'
  );

  fs.writeFileSync(pricingPath, content, 'utf8');
  console.log('✓ pricing.html successfully updated.');
} else {
  console.error('pricing.html not found at', pricingPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. UPDATE harness_haya_ingest.html
// ─────────────────────────────────────────────────────────────────────────────
const ingestPath = path.join(websiteRoot, 'harness_haya_ingest.html');
if (fs.existsSync(ingestPath)) {
  let content = fs.readFileSync(ingestPath, 'utf8');

  // Add 3-Dot Status Pipeline section before formats table if not present
  if (!content.includes('id="three-dots-pipeline"')) {
    const pipelineSection = `
    <!-- 3-Dot Status Pipeline Showcase -->
    <div id="three-dots-pipeline" class="section-anchor" style="background:#fff;border:1px solid var(--border-color);border-radius:12px;padding:2rem;margin-bottom:2.5rem;box-shadow:0 2px 8px rgba(15,23,42,.04);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
        <div>
          <span class="badge badge-success" style="font-size:0.75rem;font-weight:700;"><i class="fa-solid fa-circle-nodes"></i> Real-Time Visual Feedback</span>
          <h3 style="font-size:1.35rem;font-weight:800;color:#0f172a;margin:0.4rem 0 0.2rem;">
            The 3-Dot Visual Ingestion Pipeline
          </h3>
          <p style="font-size:0.9rem;color:#64748b;margin:0;">
            Every file in the Hayagriva case tree displays three independent status indicators giving instant transparency over document readiness:
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#10b981;box-shadow:0 0 8px rgba(16,185,129,0.5);"></span>
            <strong style="font-size:0.95rem;color:#0f172a;">Dot 1: Companion Markdown Ready</strong>
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Shows whether the companion <code style="color:#0284c7;">.md</code> has been extracted and reviewed. Right-click ➔ <strong>"🟢 1. Review Companion"</strong> opens Dual-Pane Live Authoring Mode with rendered HTML preview.
          </p>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#10b981;box-shadow:0 0 8px rgba(16,185,129,0.5);"></span>
            <strong style="font-size:0.95rem;color:#0f172a;">Dot 2: Indexed in AI Memory</strong>
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Indicates whether document chunks are fully indexed into SQLite FTS5 (lexical search) and ONNX dense vector embeddings for hybrid RAG retrieval.
          </p>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#10b981;box-shadow:0 0 8px rgba(16,185,129,0.5);"></span>
            <strong style="font-size:0.95rem;color:#0f172a;">Dot 3: Facts &amp; Claims Extracted</strong>
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Confirms case facts, financial claims, and statutory dates have been extracted into <code style="color:#0284c7;">case_kv_dictionary.json</code> and synced to Monaco LSP autocompletion.
          </p>
        </div>
      </div>
    </div>
`;
    content = content.replace(
      '<!-- Format Support Table -->',
      `${pipelineSection}    <!-- Format Support Table -->`
    );
    fs.writeFileSync(ingestPath, content, 'utf8');
    console.log('✓ harness_haya_ingest.html successfully updated with 3-Dot Status Pipeline.');
  } else {
    console.log('harness_haya_ingest.html already contains 3-Dot Status Pipeline.');
  }
} else {
  console.error('harness_haya_ingest.html not found at', ingestPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. UPDATE harness_haya_workbench.html
// ─────────────────────────────────────────────────────────────────────────────
const workbenchPath = path.join(websiteRoot, 'harness_haya_workbench.html');
if (fs.existsSync(workbenchPath)) {
  let content = fs.readFileSync(workbenchPath, 'utf8');

  if (!content.includes('id="dual-pane-authoring"')) {
    const dualPaneSection = `
    <!-- Dual-Pane Live Authoring Mode & Focused Right-Click Menu -->
    <div id="dual-pane-authoring" class="section-anchor" style="background:#fff;border:1px solid var(--border-color);border-radius:12px;padding:2rem;margin-bottom:2.5rem;box-shadow:0 2px 8px rgba(15,23,42,.04);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
        <div>
          <span class="badge badge-primary" style="font-size:0.75rem;font-weight:700;"><i class="fa-solid fa-columns"></i> Focus &amp; Productivity</span>
          <h3 style="font-size:1.35rem;font-weight:800;color:#0f172a;margin:0.4rem 0 0.2rem;">
            Dual-Pane Live Authoring Mode &amp; Cleaned Legal Context Menu
          </h3>
          <p style="font-size:0.9rem;color:#64748b;margin:0;">
            Engineered specifically for advocates and insolvency practitioners reviewing pleadings, CIRP forms, and matter briefs.
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1.5rem;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.5rem;">
          <div style="font-size:1.1rem;font-weight:700;color:#0f172a;margin-bottom:0.75rem;display:flex;align-items:center;gap:8px;">
            <i class="fa-solid fa-table-columns" style="color:#2563eb;"></i> Side-by-Side Live HTML Preview
          </div>
          <p style="font-size:0.88rem;color:#475569;line-height:1.6;margin-bottom:1rem;">
            Opening a companion document automatically closes heavy PDF/Office tabs, positioning the <strong>Monaco Editor on the Left</strong> and a <strong>Live Rendered HTML Preview on the Right</strong>.
          </p>
          <ul style="font-size:0.85rem;color:#334155;padding-left:1.2rem;line-height:1.6;margin:0;">
            <li><strong>Auto-Sync on Cmd+S</strong>: Edits in Monaco re-render the preview instantly without page flicker.</li>
            <li><strong>Self-Healing Ingestion</strong>: Missing companions are automatically generated on demand.</li>
            <li><strong>Zero Clutter</strong>: Eliminates the overwhelming 3-pane stack (PDF + MD + Preview) for noob-friendly focus.</li>
          </ul>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.5rem;">
          <div style="font-size:1.1rem;font-weight:700;color:#0f172a;margin-bottom:0.75rem;display:flex;align-items:center;gap:8px;">
            <i class="fa-solid fa-list-check" style="color:#16a34a;"></i> Focused Legal Context Menu
          </div>
          <p style="font-size:0.88rem;color:#475569;line-height:1.6;margin-bottom:1rem;">
            Pruned generic developer clutter (Cut, Copy, Paste, Open With, Reveal in Finder) to provide clean 1-click legal actions:
          </p>
          <ul style="font-size:0.85rem;color:#334155;padding-left:1.2rem;line-height:1.6;margin:0;">
            <li><strong style="color:#16a34a;">🟢 1. Review Companion</strong> (Edit &amp; Live Preview)</li>
            <li><strong style="color:#16a34a;">🟢 2. Re-Index AI Memory</strong> (Vector &amp; FTS5)</li>
            <li><strong style="color:#16a34a;">🟢 3. Extract Facts &amp; Claims</strong> (K-V)</li>
            <li><strong style="color:#dc2626;">🗑 Delete File (Safe 7-day .trash/ soft delete)</strong></li>
            <li><strong style="color:#2563eb;">⚖️ Export to Supreme Court DOCX</strong> (A4, 14pt, 1.5 spacing)</li>
          </ul>
        </div>
      </div>
    </div>
`;
    content = content.replace(
      '<hr class="section-divider">',
      `${dualPaneSection}    <hr class="section-divider">`
    );
    fs.writeFileSync(workbenchPath, content, 'utf8');
    console.log('✓ harness_haya_workbench.html successfully updated with Dual-Pane Mode & Context Menu.');
  } else {
    console.log('harness_haya_workbench.html already contains Dual-Pane Mode.');
  }
} else {
  console.error('harness_haya_workbench.html not found at', workbenchPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UPDATE harness_haya_vaults.html
// ─────────────────────────────────────────────────────────────────────────────
const vaultsPath = path.join(websiteRoot, 'harness_haya_vaults.html');
if (fs.existsSync(vaultsPath)) {
  let content = fs.readFileSync(vaultsPath, 'utf8');

  // Update metrics to reflect 4,026+ Bare Act Sections & 17,500+ Judgments
  content = content.replace(
    /<div class="metric-value">[^<]*<\/div>\s*<div class="metric-label">Bare Act Sections<\/div>/,
    '<div class="metric-value">4,026+</div><div class="metric-label">Bare Act Sections</div>'
  );
  content = content.replace(
    /<div class="metric-value">[^<]*<\/div>\s*<div class="metric-label">Court Judgments<\/div>/,
    '<div class="metric-value">17,500+</div><div class="metric-label">Court Judgments</div>'
  );

  // Add Shortcuts & In-IDE Guides section if not present
  if (!content.includes('id="monaco-drafting-shortcuts"')) {
    const shortcutsSection = `
    <!-- In-IDE Monaco Drafting Shortcuts & Help Drawer -->
    <div id="monaco-drafting-shortcuts" class="section-anchor" style="background:#fff;border:1px solid var(--border-color);border-radius:12px;padding:2rem;margin-bottom:2.5rem;box-shadow:0 2px 8px rgba(15,23,42,.04);">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
        <div>
          <span class="badge badge-institutional" style="font-size:0.75rem;font-weight:700;"><i class="fa-solid fa-keyboard"></i> Monaco In-Editor Intelligence</span>
          <h3 style="font-size:1.35rem;font-weight:800;color:#0f172a;margin:0.4rem 0 0.2rem;">
            Drafting Shortcuts &amp; Built-in Interactive User Guides
          </h3>
          <p style="font-size:0.9rem;color:#64748b;margin:0;">
            Access 4,026+ statutory provisions and 17,500+ precedents directly while typing in Monaco without leaving your draft.
          </p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem;">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="font-weight:700;color:#0f172a;margin-bottom:6px;font-family:monospace;font-size:0.95rem;color:#2563eb;">
            @@ or @sec
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Triggers statutory law auto-completion across IBC, Companies Act 2013, SARFAESI, and NCLT Rules with instant full-text hovers.
          </p>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="font-weight:700;color:#0f172a;margin-bottom:6px;font-family:monospace;font-size:0.95rem;color:#7c3aed;">
            @precedent/
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Queries 17,500+ Supreme Court and NCLAT judgments, inserting authoritative citations and ratio decidendi snippets inline.
          </p>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:1.25rem;">
          <div style="font-weight:700;color:#0f172a;margin-bottom:6px;font-family:monospace;font-size:0.95rem;color:#16a34a;">
            /fact and /clause
          </div>
          <p style="font-size:0.85rem;color:#475569;line-height:1.5;margin:0;">
            Inserts verified case parameters (IRP name, CIRP initiation date, admitted claims) directly from the local matter dictionary.
          </p>
        </div>
      </div>

      <div style="margin-top:1.5rem;padding:1rem 1.25rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;display:flex;align-items:center;gap:12px;">
        <i class="fa-solid fa-circle-question" style="color:#2563eb;font-size:1.25rem;"></i>
        <div style="font-size:0.88rem;color:#1e40af;">
          <strong>Built-in IDE Guides:</strong> Access full documentation anytime inside Hayagriva via top menu <strong>Hayagriva ➔ ❓ Help &amp; User Guides</strong> for instant interactive reference.
        </div>
      </div>
    </div>
`;
    // Insert before the first catalog grid
    content = content.replace(
      '<div class="catalog-grid">',
      `${shortcutsSection}    <div class="catalog-grid">`
    );
    fs.writeFileSync(vaultsPath, content, 'utf8');
    console.log('✓ harness_haya_vaults.html successfully updated with Monaco drafting shortcuts & guide notice.');
  } else {
    console.log('harness_haya_vaults.html already contains drafting shortcuts.');
  }
} else {
  console.error('harness_haya_vaults.html not found at', vaultsPath);
}

console.log('Website sync completed successfully.');
