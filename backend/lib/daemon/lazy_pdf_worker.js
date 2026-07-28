const fs = require('fs');
const path = require('path');
const converter = require('../core/converter');

const pendingPdfQueue = [];
const completedPdfSet = new Set();
let isPdfDaemonRunning = false;

function queuePdfTask(task) {
    // Clear duplicates in queue
    for (let i = pendingPdfQueue.length - 1; i >= 0; i--) {
        if (pendingPdfQueue[i].filePath === task.filePath) {
            pendingPdfQueue.splice(i, 1);
        }
    }
    pendingPdfQueue.push(task);
}

function startPdfIngestionDaemon() {
    if (isPdfDaemonRunning) return;
    isPdfDaemonRunning = true;
    console.log('[Lazy PDF Ingest] Background ingestion daemon started.');
    _runDaemonLoop();
}

async function _runDaemonLoop() {
    if (pendingPdfQueue.length > 0) {
        const task = pendingPdfQueue[0];
        const { caseDir, filePath, companionPath, totalPages } = task;
        const nextPage = task.nextPage;

        try {
            const endPage = Math.min(totalPages, nextPage + 2);
            console.log(`[Lazy PDF Ingest] Ingesting pages ${nextPage}-${endPage} of ${totalPages} for ${path.basename(filePath)}...`);

            const blockMd = await converter.convertPdfBlock(filePath, nextPage, endPage);

            let blockContent = '';
            const lines = blockMd.split(/\r?\n/);
            let activePage = nextPage;

            for (const line of lines) {
                const pageMatch = line.match(/^## Page (\d+)/i);
                if (pageMatch) {
                    activePage = parseInt(pageMatch[1], 10);
                    blockContent += `\n\n## Page ${activePage}\n\n`;
                } else {
                    blockContent += line + '\n';
                }
            }

            const cachePath = companionPath + '.cache';
            fs.appendFileSync(cachePath, '\n\n' + blockContent.trim(), 'utf8');
            console.log(`[Lazy PDF Ingest] Cached pages ${nextPage}-${endPage} to ${path.basename(cachePath)}`);

            task.nextPage = endPage + 1;
            if (task.nextPage > totalPages) {
                pendingPdfQueue.shift();
                completedPdfSet.add(filePath); // Prevent re-queuing on watcher re-trigger
                
                // Consolidation: stitch cache file to companion in a single write operation
                if (fs.existsSync(cachePath)) {
                    const cacheContent = fs.readFileSync(cachePath, 'utf8');
                    fs.appendFileSync(companionPath, cacheContent, 'utf8');
                    fs.unlinkSync(cachePath);
                }

                // Update sidecar: daemon complete, still companion_ready
                const statusPath = companionPath.replace(/\.md$/, '.status');
                fs.writeFileSync(statusPath, 'companion_ready', 'utf8');
                console.log(`[Lazy PDF Ingest] Completed full background ingestion of: ${path.basename(filePath)}`);
                
                // Trigger watcher sync only once at the end of full conversion
                const { ingestFile } = require('./watcher');
                await ingestFile(caseDir, companionPath, { conversionOnly: true });
            }
        } catch (e) {
            console.error(`[Lazy PDF Ingest] Block ingestion failed for ${path.basename(filePath)}:`, e.message);
            const cachePath = companionPath + '.cache';
            if (fs.existsSync(cachePath)) {
                try {
                    fs.unlinkSync(cachePath);
                } catch (err) {}
            }
            pendingPdfQueue.shift();
        }
    }

    // Schedule next iteration after a short pause
    setTimeout(_runDaemonLoop, 4000);
}

module.exports = {
    pendingPdfQueue,
    completedPdfSet,
    queuePdfTask,
    startPdfIngestionDaemon
};
