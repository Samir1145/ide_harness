/**
 * indiacode-hydrator.js
 * ─────────────────────────────────────────────────────────────────
 * Sovereign India Code Statutory Hydration Engine
 * 
 * Automatically connects to the official India Code DSpace REST API
 * (indiacode.gov.in), fetches authentic bare act sections, schedule
 * orders, and subordinate rules, parses legislative footnotes & w.e.f.
 * effective dates, generates clean Markdown/JSON, and hydrates
 * PostgreSQL (ibclaw_db.ibc_laws) and local Law Vaults.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REGISTRY_PATH = path.join(__dirname, 'acts_registry.json');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', '..', 'vault', 'sources');

/**
 * Loads the current Sovereign Act Registry.
 */
function getRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { acts: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (e) {
    console.error('[IndiaCodeHydrator] Failed to read registry:', e.message);
    return { acts: {} };
  }
}

/**
 * Persists updates to the Sovereign Act Registry.
 */
function saveRegistry(reg) {
  try {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), 'utf8');
  } catch (e) {
    console.error('[IndiaCodeHydrator] Failed to save registry:', e.message);
  }
}

/**
 * Makes an HTTP(S) request and parses JSON response, following 3xx redirects.
 */
function fetchJson(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https:') ? https : http;
    
    const req = client.get(url, { headers: { 'User-Agent': 'Hayagriva-Legal-Hydrator/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const u = new URL(url);
          redirectUrl = `${u.protocol}//${u.host}${redirectUrl}`;
        }
        return fetchJson(redirectUrl, maxRedirects - 1).then(resolve, reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage} at ${url}`));
      }
      
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Request timed out at ${url}`));
    });
  });
}

/**
 * Cleans India Code HTML markup into structured Markdown.
 */
function cleanHtmlToMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<center[^>]*>(.*?)<\/center>/gi, '\n### $1\n')
    .replace(/<hr[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<sup>(.*?)<\/sup>/gi, '[$1]')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts legislative amendment citations and w.e.f. dates from footnotes.
 */
function extractFootnoteMetadata(footnotesText) {
  if (!footnotesText) return [];
  const entries = [];
  const lines = footnotesText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const wefMatch = trimmed.match(/w\.?e\.?f\.?\s*([0-9]{1,2}[-\/][0-9]{1,2}[-\/][0-9]{2,4})/i);
    const actMatch = trimmed.match(/Act\s+([0-9]+\s+of\s+[0-9]{4})/i);
    entries.push({
      raw: trimmed,
      wef_date: wefMatch ? wefMatch[1] : null,
      amending_act: actMatch ? actMatch[1] : null
    });
  }
  return entries;
}

/**
 * Fetches all objects for a given India Code Act ID across all pages.
 */
async function fetchActData(actId, onProgress) {
  const baseUrl = `https://indiacode.gov.in/server/api/discover/search/objects?f.act_id=${actId},equals`;
  
  if (onProgress) onProgress(`Fetching initial page for Act ${actId}...`);
  const firstPage = await fetchJson(`${baseUrl}&page=0`);
  
  const pageMeta = firstPage._embedded?.searchResult?.page || {};
  const totalPages = pageMeta.totalPages || 1;
  const totalElements = pageMeta.totalElements || 0;
  
  if (onProgress) onProgress(`Discovered ${totalElements} elements across ${totalPages} pages.`);
  
  const allObjects = [];
  if (firstPage._embedded?.searchResult?._embedded?.objects) {
    allObjects.push(...firstPage._embedded.searchResult._embedded.objects);
  }
  
  for (let p = 1; p < totalPages; p++) {
    if (onProgress) onProgress(`Fetching page ${p + 1} of ${totalPages}...`);
    const pageData = await fetchJson(`${baseUrl}&page=${p}`);
    if (pageData._embedded?.searchResult?._embedded?.objects) {
      allObjects.push(...pageData._embedded.searchResult._embedded.objects);
    }
  }
  
  // Deduplicate objects
  const seenIds = new Set();
  const dedupedObjects = [];
  for (const obj of allObjects) {
    const itemId = obj._embedded?.indexableObject?.id ||
                   obj._embedded?.indexableObject?.metadata?.['dc.identifier.id']?.[0]?.value ||
                   Math.random();
    if (!seenIds.has(itemId)) {
      seenIds.add(itemId);
      dedupedObjects.push(obj);
    }
  }
  
  // Categorize
  const sections = [];
  const scheduleItems = [];
  const rules = [];
  let actMeta = null;
  
  for (const obj of dedupedObjects) {
    const meta = obj._embedded?.indexableObject?.metadata || {};
    const col = meta['dc.identifier.collection']?.[0]?.value || '';
    const title = meta['dc.title']?.[0]?.value || '';
    const bodyHtml = meta['dc.identifier.section_page_note']?.[0]?.value || '';
    const footnoteHtml = meta['dc.identifier.section_footnote']?.[0]?.value || '';
    const orderNum = parseInt(meta['dc.identifier.order_number']?.[0]?.value || '999', 10);
    const secNum = meta['dc.identifier.section_number']?.[0]?.value || '';
    
    const body = cleanHtmlToMarkdown(bodyHtml);
    const footnotes = cleanHtmlToMarkdown(footnoteHtml);
    
    const item = {
      collection: col,
      order: orderNum,
      sectionNumber: secNum,
      title: title.trim(),
      body,
      footnotes,
      parsedFootnotes: extractFootnoteMetadata(footnotes)
    };
    
    if (col === 'ACT') {
      actMeta = {
        title: title.trim(),
        actName: meta['dc.identifier.act_name']?.[0]?.value || title.trim(),
        actYear: meta['dc.date.act_year']?.[0]?.value || '',
        actNumber: meta['dc.identifier.act_number']?.[0]?.value || '',
        ministry: meta['dc.identifier.ministry_name']?.[0]?.value || '',
        department: meta['dc.identifier.department_name']?.[0]?.value || ''
      };
    } else if (col === 'SECTION') {
      sections.push(item);
    } else if (col.startsWith('SCH')) {
      scheduleItems.push(item);
    } else if (col === 'RULE') {
      rules.push(item);
    }
  }
  
  sections.sort((a, b) => a.order - b.order);
  scheduleItems.sort((a, b) => a.order - b.order);
  
  return {
    actMeta,
    sections,
    scheduleItems,
    rules,
    totalProvisions: sections.length + scheduleItems.length + rules.length
  };
}

/**
 * Computes SHA-256 hash of all provisions for diff detection.
 */
function computeContentHash(sections, scheduleItems) {
  const hash = crypto.createHash('sha256');
  for (const s of sections) {
    hash.update(`${s.sectionNumber}:${s.title}:${s.body}\n`);
  }
  for (const sch of scheduleItems) {
    hash.update(`${sch.order}:${sch.title}:${sch.body}\n`);
  }
  return hash.digest('hex');
}

/**
 * Generates formatted Markdown for the complete Act.
 */
function generateMarkdown(actInfo, parsedData) {
  const meta = parsedData.actMeta || {};
  let md = `# ${meta.actName || actInfo.act_name}\n`;
  md += `*(Act No. ${meta.actNumber || actInfo.act_number} of ${meta.actYear || actInfo.year})*\n\n`;
  md += `> **Source:** Official India Code Legislative Repository (Ministry of Law and Justice, Govt of India)\n`;
  md += `> **Act ID:** ${actInfo.act_id} | **Last Hydrated:** ${new Date().toISOString()}\n\n`;
  md += `---\n\n`;
  
  md += `## TABLE OF PROVISIONS\n\n`;
  for (const sec of parsedData.sections) {
    const slug = (sec.sectionNumber || 'sec').toLowerCase().replace(/[^a-z0-9]/g, '-');
    md += `* [Section ${sec.sectionNumber} — ${sec.title}](#section-${slug})\n`;
  }
  if (parsedData.scheduleItems.length > 0) {
    md += `\n* [THE SCHEDULE](#the-schedule)\n`;
  }
  md += `\n---\n\n`;
  
  md += `## SECTIONS\n\n`;
  for (const sec of parsedData.sections) {
    md += `### Section ${sec.sectionNumber} — ${sec.title}\n\n`;
    if (sec.body) md += `${sec.body}\n\n`;
    if (sec.footnotes) md += `*Legislative Footnotes:*\n${sec.footnotes}\n\n`;
    md += `---\n\n`;
  }
  
  if (parsedData.scheduleItems.length > 0) {
    md += `## THE SCHEDULE\n\n`;
    for (const sch of parsedData.scheduleItems) {
      md += `### ${sch.title}\n\n`;
      if (sch.body) md += `${sch.body}\n\n`;
      if (sch.footnotes) md += `*Legislative Footnotes:*\n${sch.footnotes}\n\n`;
      md += `---\n\n`;
    }
  }
  
  if (parsedData.rules.length > 0) {
    md += `## ASSOCIATED STATUTORY RULES\n\n`;
    for (const r of parsedData.rules) {
      md += `### ${r.title}\n\n`;
      if (r.body) md += `${r.body}\n\n`;
      md += `---\n\n`;
    }
  }
  
  return md;
}

/**
 * Generates an atomic PostgreSQL transaction script and executes it into ibclaw_db.
 */
function syncToPostgres(actInfo, parsedData, dbName = 'ibclaw_db') {
  function escapeSql(str) {
    if (!str) return "''";
    return "'" + str.replace(/'/g, "''") + "'";
  }
  
  const actName = actInfo.act_name;
  const domain  = actInfo.domain || 'commercial_courts';
  
  let sql = `BEGIN;\n`;
  sql += `DELETE FROM ibc_laws WHERE act_name = ${escapeSql(actName)};\n`;
  
  let count = 0;
  
  // Sections
  for (const sec of parsedData.sections) {
    const lawId = `${actInfo.key}_sec_${(sec.sectionNumber || '0').toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    let body = sec.body || '';
    if (sec.footnotes) body += '\n\nFootnotes:\n' + sec.footnotes;
    
    sql += `INSERT INTO ibc_laws (law_id, act_name, section_number, title, body_text, domain) VALUES (` +
      `${escapeSql(lawId)}, ${escapeSql(actName)}, ${escapeSql(sec.sectionNumber)}, ${escapeSql(sec.title)}, ${escapeSql(body)}, ${escapeSql(domain)}) ` +
      `ON CONFLICT (law_id) DO UPDATE SET title = EXCLUDED.title, body_text = EXCLUDED.body_text, updated_at = NOW();\n`;
    count++;
  }
  
  // Schedule items
  for (const sch of parsedData.scheduleItems) {
    const lawId = `${actInfo.key}_sch_${sch.order}_${(sch.title || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}`;
    let body = sch.body || '';
    if (sch.footnotes) body += '\n\nFootnotes:\n' + sch.footnotes;
    
    sql += `INSERT INTO ibc_laws (law_id, act_name, section_number, title, body_text, domain) VALUES (` +
      `${escapeSql(lawId)}, ${escapeSql(actName)}, ${escapeSql(`Schedule Order ${sch.order}`)}, ${escapeSql(sch.title)}, ${escapeSql(body)}, ${escapeSql(domain)}) ` +
      `ON CONFLICT (law_id) DO UPDATE SET title = EXCLUDED.title, body_text = EXCLUDED.body_text, updated_at = NOW();\n`;
    count++;
  }
  
  // Rules
  for (const r of parsedData.rules) {
    const lawId = `${actInfo.key}_rule_${r.order || 0}_${(r.title || 'rule').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}`;
    sql += `INSERT INTO ibc_laws (law_id, act_name, section_number, title, body_text, domain) VALUES (` +
      `${escapeSql(lawId)}, ${escapeSql(actName)}, ${escapeSql('Rule')}, ${escapeSql(r.title)}, ${escapeSql(r.body || '')}, ${escapeSql(domain)}) ` +
      `ON CONFLICT (law_id) DO UPDATE SET title = EXCLUDED.title, body_text = EXCLUDED.body_text, updated_at = NOW();\n`;
    count++;
  }
  
  sql += `COMMIT;\n`;
  
  const tmpSqlPath = path.join(require('os').tmpdir(), `hydrate_${actInfo.key}_${Date.now()}.sql`);
  fs.writeFileSync(tmpSqlPath, sql, 'utf8');
  
  try {
    execSync(`psql -d ${dbName} -f "${tmpSqlPath}"`, { stdio: 'pipe' });
    try { fs.unlinkSync(tmpSqlPath); } catch (_) {}
    return { success: true, count };
  } catch (err) {
    try { fs.unlinkSync(tmpSqlPath); } catch (_) {}
    throw new Error(`Postgres hydration failed: ${err.message}`);
  }
}

/**
 * End-to-end sync for a single Act by its key.
 */
async function syncAct(actKey, options = {}) {
  const startTime = Date.now();
  const reg = getRegistry();
  const actInfo = reg.acts[actKey];
  if (!actInfo) {
    throw new Error(`Act key "${actKey}" not found in Sovereign Acts Registry.`);
  }
  
  const log = options.onProgress || console.log;
  log(`[IndiaCodeHydrator] Initiating hydration for ${actInfo.act_name} (${actInfo.act_id})...`);
  
  // 1. Fetch data from India Code API
  const parsedData = await fetchActData(actInfo.act_id, log);
  
  // 2. Compute content hash
  const contentHash = computeContentHash(parsedData.sections, parsedData.scheduleItems);
  const isModified = contentHash !== actInfo.content_hash;
  
  // 3. Save to disk (Markdown + JSON)
  const outDir = options.outputDir || DEFAULT_OUTPUT_DIR;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const mdContent = generateMarkdown(actInfo, parsedData);
  const mdPath = path.join(outDir, `${actKey}.md`);
  const jsonPath = path.join(outDir, `${actKey}.json`);
  
  fs.writeFileSync(mdPath, mdContent, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(parsedData, null, 2), 'utf8');
  log(`[IndiaCodeHydrator] Persisted clean Markdown (${(Buffer.byteLength(mdContent)/1024).toFixed(1)} KB) and JSON to ${outDir}`);
  
  // 4. Sync into PostgreSQL (purely optional opt-in via options.syncPostgres)
  let postgresCount = 0;
  if (options.syncPostgres) {
    try {
      const pgRes = syncToPostgres(actInfo, parsedData, options.dbName || 'ibclaw_db');
      postgresCount = pgRes.count;
      log(`[IndiaCodeHydrator] Successfully synced ${postgresCount} provisions to PostgreSQL!`);
    } catch (pgErr) {
      log(`[IndiaCodeHydrator] Warning: PostgreSQL sync skipped or failed (${pgErr.message})`);
    }
  }
  
  // 5. Update Registry metadata
  actInfo.last_sync = new Date().toISOString();
  actInfo.total_provisions = parsedData.totalProvisions;
  actInfo.sections_count = parsedData.sections.length;
  actInfo.schedule_count = parsedData.scheduleItems.length;
  actInfo.rules_count = parsedData.rules.length;
  actInfo.content_hash = contentHash;
  actInfo.sync_status = 'synced';
  saveRegistry(reg);
  
  const durationMs = Date.now() - startTime;
  log(`[IndiaCodeHydrator] Completed hydration for ${actInfo.act_name} in ${durationMs}ms.`);
  
  return {
    actKey,
    actName: actInfo.act_name,
    actId: actInfo.act_id,
    sectionsCount: parsedData.sections.length,
    scheduleCount: parsedData.scheduleItems.length,
    rulesCount: parsedData.rules.length,
    totalProvisions: parsedData.totalProvisions,
    postgresCount,
    contentHash,
    isModified,
    durationMs,
    markdownPath: mdPath,
    jsonPath
  };
}

/**
 * End-to-end sync for all registered Acts.
 */
async function syncAllActs(options = {}) {
  const reg = getRegistry();
  const keys = Object.keys(reg.acts);
  const results = [];
  const log = options.onProgress || console.log;
  
  log(`[IndiaCodeHydrator] Syncing all ${keys.length} registered acts...`);
  for (const key of keys) {
    try {
      const res = await syncAct(key, options);
      results.push({ key, success: true, ...res });
    } catch (err) {
      log(`[IndiaCodeHydrator] Failed to sync ${key}: ${err.message}`);
      results.push({ key, success: false, error: err.message });
    }
  }
  return results;
}

/**
 * Syncs and compiles all Acts in a registered Practice Suite in one shot.
 */
async function syncPracticeSuite(suiteKey, options = {}) {
  const reg = getRegistry();
  const suite = reg.practice_suites?.[suiteKey];
  if (!suite) {
    throw new Error(`Practice suite "${suiteKey}" not found in registry.`);
  }
  const log = options.onProgress || console.log;
  log(`[IndiaCodeHydrator] Initiating Practice Suite Sync: "${suite.title}" (${suite.included_acts.length} acts)...`);
  
  const results = [];
  const { buildCartridge } = require('./cartridge-builder');

  for (const actKey of suite.included_acts) {
    try {
      const res = await syncAct(actKey, options);
      let cartRes = null;
      if (fs.existsSync(res.jsonPath)) {
        const actData = JSON.parse(fs.readFileSync(res.jsonPath, 'utf8'));
        cartRes = await buildCartridge(actKey, actData);
      }
      results.push({ actKey, success: true, provisions: res.totalProvisions, cartRes });
    } catch (err) {
      log(`[IndiaCodeHydrator] Error syncing act ${actKey} in suite: ${err.message}`);
      results.push({ actKey, success: false, error: err.message });
    }
  }

  suite.last_synced = new Date().toISOString();
  saveRegistry(reg);

  return {
    suiteKey,
    suiteTitle: suite.title,
    syncedActs: results,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getRegistry,
  saveRegistry,
  cleanHtmlToMarkdown,
  extractFootnoteMetadata,
  fetchActData,
  computeContentHash,
  generateMarkdown,
  syncToPostgres,
  syncAct,
  syncAllActs,
  syncPracticeSuite
};
