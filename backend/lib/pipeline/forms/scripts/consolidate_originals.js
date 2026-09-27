const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_OUT = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals';
const FOLDERS = {
  compendiums: path.join(BASE_OUT, 'compendiums'),
  standalone_drafts: path.join(BASE_OUT, 'standalone_drafts'),
  official_pdfs: path.join(BASE_OUT, 'official_pdfs')
};

for (const dir of Object.values(FOLDERS)) {
  fs.mkdirSync(dir, { recursive: true });
}

function getSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

const copyManifest = [];

function copyFileSafe(srcPath, destCategory, customName) {
  if (!fs.existsSync(srcPath)) return;
  const fileName = customName || path.basename(srcPath);
  const destPath = path.join(FOLDERS[destCategory], fileName);
  fs.copyFileSync(srcPath, destPath);
  const stat = fs.statSync(destPath);
  const sha = getSha256(destPath);
  const item = {
    fileName,
    category: destCategory,
    sourcePath: srcPath,
    destPath,
    sizeBytes: stat.size,
    sizeKb: (stat.size / 1024).toFixed(1),
    sha256: sha,
    copiedAt: new Date().toISOString()
  };
  copyManifest.push(item);
  console.log('[Copied -> ' + destCategory + '] ' + fileName + ' (' + item.sizeKb + ' KB)');
}

// 1. Files from Downloads
const dl = '/Users/atulgrover/Downloads';

// Compendiums from Downloads
copyFileSafe(path.join(dl, '20260915_CIRP_MASTER_COMPENDIUM_Second_Edition.docx'), 'compendiums');
copyFileSafe(path.join(dl, 'CIRP_Master_Compendium_Review_and_Update_Note_20260915.docx'), 'compendiums');
copyFileSafe(path.join(dl, '20260915_IBC_PartIII_VOL1_Individual_Insolvency_Resolution.docx'), 'compendiums');
copyFileSafe(path.join(dl, '20260915_IBC_PartIII_VOL2_Individual_Bankruptcy.docx'), 'compendiums');
copyFileSafe(path.join(dl, '20260915_IBC_PartIII_VOL3_Firm_Partner_Route.docx'), 'compendiums');
copyFileSafe(path.join(dl, '20260915_IBC_PartIII_VOL4_Master_Index_Update_Trust_Society.docx'), 'compendiums');
copyFileSafe(path.join(dl, 'Part III Compendium 15092026.zip'), 'compendiums');
copyFileSafe(path.join(dl, 'VL_Compendium_PartA_PartB (1).pdf'), 'compendiums', 'VL_Compendium_PartA_PartB.pdf');

// Standalone drafts from Downloads
copyFileSafe(path.join(dl, 'EPFO_Claims_IBC_Discussion_Note_CA_RK_Gupta.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, 'Liquidator_Reply_to_EPFO_Late_Claim_Template.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, 'Detailed_EOI_Generic_Template_Reg36A_CIRP.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, 'Monitoring_Committee_Note_and_Quarterly_Report_Template.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, 'CoC_Voting_Ready_Reckoner.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, 'CoC_Voting_E-Voting_or_Ballot_Paper.docx'), 'standalone_drafts');
copyFileSafe(path.join(dl, '400148829Form_B.docx'), 'standalone_drafts');

// Official PDFs from Downloads
copyFileSafe(path.join(dl, '111 new format for audit.pdf'), 'official_pdfs');
copyFileSafe(path.join(dl, '111 new format for audit-2.pdf'), 'official_pdfs');
copyFileSafe(path.join(dl, '111 new format for audit-3.pdf'), 'official_pdfs');
copyFileSafe(path.join(dl, '111 new format for audit-4.pdf'), 'official_pdfs');
copyFileSafe(path.join(dl, '111 new format for audit-5.pdf'), 'official_pdfs');

// 2. Files from Desktop/HAYAGRIVA/formats/sources/ca_rk_gupta/
const rkSrc = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/sources/ca_rk_gupta';
if (fs.existsSync(rkSrc)) {
  const files = fs.readdirSync(rkSrc);
  for (const f of files) {
    if (f.startsWith('.')) continue;
    const full = path.join(rkSrc, f);
    if (!fs.statSync(full).isFile()) continue;

    if (f.toLowerCase().includes('compendium') || f.toLowerCase().includes('master_index')) {
      copyFileSafe(full, 'compendiums', f.includes('Formats_Compendium') ? 'Formats_Compendium_Edition1.docx' : f);
    } else if (f.endsWith('.pdf')) {
      copyFileSafe(full, 'official_pdfs');
    } else {
      copyFileSafe(full, 'standalone_drafts');
    }
  }
}

// 3. Save MANIFEST.json
const manifestPath = path.join(BASE_OUT, 'MANIFEST.json');
fs.writeFileSync(manifestPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  totalFiles: copyManifest.length,
  files: copyManifest
}, null, 2));

console.log('\n✓ Successfully consolidated ' + copyManifest.length + ' master files into ' + BASE_OUT);
console.log('✓ Master manifest saved to ' + manifestPath);
