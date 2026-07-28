// Pipeline barrel — re-exports all format ingest handlers
// Used by daemon/watcher.js and lib/routes.js

const { ingestPdf } = require('./pdf/ingest');
const { ingestDocx } = require('./docx/ingest');
const { ingestXlsx } = require('./xls/ingest');
const { ingestWiki, ingestWikiCard } = require('./wiki/ingest');
const { ingestText } = require('./common/text_ingest');

module.exports = {
    ingestPdf,
    ingestDocx,
    ingestXlsx,
    ingestWiki,
    ingestWikiCard,
    ingestText,
};
