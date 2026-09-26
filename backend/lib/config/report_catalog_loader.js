'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_CATALOG_PATH = path.resolve(__dirname, '../../config/report_catalog.json');
const SERVER_URL = process.env.LEXAI_API_URL || 'http://localhost:4000';

let cachedCatalog = null;
let lastSyncTime = null;

/**
 * Loads the report catalog, with offline-first fallback and background sync capability.
 *
 * @param {Object} [options]
 * @param {boolean} [options.forceSync=false] - Attempt fresh sync from server
 * @returns {Object} Catalog JSON object
 */
function loadReportCatalog(options = {}) {
  const { forceSync = false } = options;

  // If cached in memory and not forcing sync, return immediately
  if (cachedCatalog && !forceSync) {
    return cachedCatalog;
  }

  // Load from local disk first (guarantees zero latency and offline capability)
  if (fs.existsSync(LOCAL_CATALOG_PATH)) {
    try {
      const raw = fs.readFileSync(LOCAL_CATALOG_PATH, 'utf8');
      cachedCatalog = JSON.parse(raw);
    } catch (e) {
      console.warn('[ReportCatalogLoader] Warning reading local catalog file:', e.message);
    }
  }

  return cachedCatalog || { reports: [] };
}

/**
 * Asynchronously attempts to sync the catalog from the LEXAI server.
 * Updates local cache file on success.
 */
async function syncCatalogFromServer() {
  const catalogEndpoint = `${SERVER_URL}/api/v1/catalog`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second network timeout

    const res = await fetch(catalogEndpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.reports && Array.isArray(data.reports)) {
        cachedCatalog = data;
        lastSyncTime = new Date().toISOString();
        // Persist to local cache file
        try {
          fs.writeFileSync(LOCAL_CATALOG_PATH, JSON.stringify(data, null, 2), 'utf8');
          console.log(`[ReportCatalogLoader] Successfully synced ${data.reports.length} reports from ${catalogEndpoint}`);
        } catch (err) {
          console.warn('[ReportCatalogLoader] Could not persist catalog cache to disk:', err.message);
        }
        return data;
      }
    }
  } catch (err) {
    // Non-fatal: expected if server is offline or not running
  }
  return cachedCatalog;
}

/**
 * Retrieve metadata for a specific report ID or code.
 * @param {string} reportIdOrCode - e.g. "REPORT_11" or "RBZ-SEC29A-11"
 * @returns {Object|null}
 */
function getReportById(reportIdOrCode) {
  const catalog = loadReportCatalog();
  const target = (reportIdOrCode || '').toUpperCase().trim();
  return (catalog.reports || []).find(r => 
    r.report_id.toUpperCase() === target || 
    (r.code && r.code.toUpperCase() === target)
  ) || null;
}

/**
 * Retrieve all reports for a given lifecycle phase.
 * @param {number} lifecycleId - 0 through 5
 * @returns {Array}
 */
function getReportsByLifecycle(lifecycleId) {
  const catalog = loadReportCatalog();
  return (catalog.reports || []).filter(r => r.lifecycle_id === lifecycleId);
}

/**
 * Returns all reports in catalog.
 */
function getAllReports() {
  const catalog = loadReportCatalog();
  return catalog.reports || [];
}

module.exports = {
  loadReportCatalog,
  syncCatalogFromServer,
  getReportById,
  getReportsByLifecycle,
  getAllReports,
  LOCAL_CATALOG_PATH
};
