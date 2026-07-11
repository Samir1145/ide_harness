export function sidebarHtml(initialCase: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 15px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
  }
  h3 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    color: var(--theia-brand-color1, #0ea5e9);
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    padding-bottom: 6px;
  }
  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    padding-bottom: 6px;
  }
  .header-container h3 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
  }
  .close-btn {
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    color: var(--theia-ui-font-color1, #333);
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  .close-btn:hover {
    opacity: 1;
  }
  .section {
    margin-bottom: 15px;
  }
  label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
  }
  select {
    width: 100%;
    padding: 6px;
    background: var(--theia-layout-color3, #ffffff);
    color: var(--theia-ui-font-color1, #333333);
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 4px;
    box-sizing: border-box;
  }
  select:focus {
    outline: none;
    border-color: var(--theia-brand-color1, #0ea5e9);
  }
  .btn {
    background: var(--theia-brand-color1, #0ea5e9);
    color: #ffffff;
    border: none;
    padding: 7px 10px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    transition: background 0.2s;
    margin-top: 6px;
    font-size: var(--theia-ui-font-size1, 13px);
  }
  .btn:hover {
    background: #0284c7;
  }
  .upload-box {
    border: 2px dashed var(--theia-border-color, #ccc);
    border-radius: 6px;
    padding: 15px 10px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 8px;
    color: var(--theia-ui-font-color1, #333333);
  }
  .zone-pdf { background: rgba(239, 68, 68, 0.02); }
  .zone-pdf:hover { background: rgba(239, 68, 68, 0.05); border-color: #ef4444; }
  .zone-word { background: rgba(59, 130, 246, 0.02); }
  .zone-word:hover { background: rgba(59, 130, 246, 0.05); border-color: #3b82f6; }
  .zone-excel { background: rgba(16, 185, 129, 0.02); }
  .zone-excel:hover { background: rgba(16, 185, 129, 0.05); border-color: #10b981; }
  .zone-wiki { background: rgba(139, 92, 246, 0.02); }
  .zone-wiki:hover { background: rgba(139, 92, 246, 0.05); border-color: #8b5cf6; }
  .hidden { display: none !important; }
  .btn-secondary {
    background: #e2e8f0;
    color: #334155;
    border: 1px solid var(--theia-border-color, #ccc);
  }
  .btn-secondary:hover {
    background: #cbd5e1;
  }
  .btn-danger {
    background: #ef4444;
    color: #ffffff;
  }
  .btn-danger:hover {
    background: #dc2626;
  }
</style>
</head>
<body>
  
  <div class="header-container">
    <h3>Upload Document</h3>
    <div class="close-btn" id="close-modal" title="Close">✕</div>
  </div>

  <div class="section">
    
    <div id="zone-pdf" class="upload-box zone-pdf" style="border-color: rgba(239, 68, 68, 0.4); margin-bottom: 8px;">
      <p style="margin: 0; font-weight: bold; color: #ef4444;">PDF Document</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.7;">Upload layouts or scanned pages</p>
    </div>

    <div id="zone-word" class="upload-box zone-word" style="border-color: rgba(59, 130, 246, 0.4); margin-bottom: 8px;">
      <p style="margin: 0; font-weight: bold; color: #3b82f6;">Word Document</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.7;">Upload Word .docx / .doc files</p>
    </div>

    <div id="zone-excel" class="upload-box zone-excel" style="border-color: rgba(16, 185, 129, 0.4); margin-bottom: 8px;">
      <p style="margin: 0; font-weight: bold; color: #10b981;">Excel Spreadsheet</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.7;">Upload tabular sheets .xlsx / .xls</p>
    </div>

    <div id="zone-wiki" class="upload-box zone-wiki" style="border-color: rgba(139, 92, 246, 0.4); margin-bottom: 8px;">
      <p style="margin: 0; font-weight: bold; color: #8b5cf6;">TiddlyWiki Report</p>
      <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.7;">Upload 29A or other .html wikis</p>
    </div>
    
    <input type="file" id="file-input" class="hidden" />
  </div>

  <script>
    function syncTheme() {
      if (window.parent) {
        const parentStyle = window.parent.getComputedStyle(window.parent.document.documentElement);
        const docStyle = document.documentElement.style;
        const vars = [
          '--theia-layout-color1', '--theia-layout-color2', '--theia-layout-color3',
          '--theia-ui-font-color1', '--theia-ui-font-color2', '--theia-border-color',
          '--theia-brand-color1', '--theia-ui-font-family', '--theia-ui-font-size1'
        ];
        vars.forEach(v => {
          const val = parentStyle.getPropertyValue(v);
          if (val) docStyle.setProperty(v, val);
        });
      }
    }
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    if (window.parent && window.parent.document.documentElement) {
      observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    const fileInput = document.getElementById('file-input');
    const zonePdf = document.getElementById('zone-pdf');
    const zoneWord = document.getElementById('zone-word');
    const zoneExcel = document.getElementById('zone-excel');
    const zoneWiki = document.getElementById('zone-wiki');
    const closeBtn = document.getElementById('close-modal');

    closeBtn.onclick = () => {
      if (window.parent) {
        window.parent.postMessage({ type: 'close-upload-modal' }, '*');
      }
    };

    let currentCaseName = '${initialCase}';

    window.addEventListener('message', (event) => {
      if (event.data) {
        if (event.data.type === 'select-case') {
          currentCaseName = event.data.caseName;
        }
      }
    });

    zonePdf.onclick = () => {
      fileInput.accept = '.pdf';
      fileInput.click();
    };
    zoneWord.onclick = () => {
      fileInput.accept = '.docx,.doc';
      fileInput.click();
    };
    zoneExcel.onclick = () => {
      fileInput.accept = '.xlsx,.xls';
      fileInput.click();
    };
    zoneWiki.onclick = () => {
      fileInput.accept = '.html';
      fileInput.click();
    };

    fileInput.onchange = (e) => {
      if (e.target.files.length) {
        processFile(e.target.files[0]);
      }
    };

    function processFile(file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        
        let containerZone = zonePdf;
        if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) containerZone = zoneWord;
        else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) containerZone = zoneExcel;
        else if (file.name.endsWith('.html') || file.name.endsWith('.wiki.html')) containerZone = zoneWiki;
        
        let filename = file.name;
        if (filename.endsWith('.html') && !filename.endsWith('.wiki.html')) {
          filename = filename.replace(/\.html$/, '.wiki.html');
        }

        const oldContent = containerZone.innerHTML;
        containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Uploading...</p>';
        
        try {
          // Step 1: Upload raw binary to server
          const uploadRes = await fetch('http://127.0.0.1:3210/api/hayagriva/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, filename: filename, content: base64 })
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

          // Step 2: Run conversion, layout parsing, and indexing immediately
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Converting & Ingesting...</p>';
          
          const ingestRes = await fetch('http://127.0.0.1:3210/api/hayagriva/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, file: uploadData.filePath, disableDoc2Query: true })
          });
          const ingestData = await ingestRes.json();
          if (!ingestData.success) throw new Error(ingestData.error || 'Ingestion failed');

          // Step 3: Complete & refresh UI
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:#10b981;">✓ Ingested Successfully</p>';
          if (window.parent) {
            window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName: currentCaseName }, '*');
            setTimeout(() => {
              window.parent.postMessage({ type: 'close-upload-modal' }, '*');
            }, 1500);
          }
          setTimeout(() => { containerZone.innerHTML = oldContent; }, 4000);
        } catch (err) {
          containerZone.innerHTML = '<p style="color: #ef4444; margin:0; font-size:11px; font-weight:bold;">✗ ' + err.message + '</p>';
          setTimeout(() => { containerZone.innerHTML = oldContent; }, 5000);
        }

        // Phase 1 complete: show status + Build Concepts button (disabled until daemon finishes)
        function showConversionStatus(caseName, basename) {
          const statusDiv = document.createElement('div');
          statusDiv.style.cssText = 'margin-top:8px; padding:8px; background:var(--theia-layout-color3,#fff); border:1px solid var(--theia-border-color,#ccc); border-radius:4px; font-size:11px;';
          statusDiv.innerHTML = \`
            <div style="font-weight:bold; color:var(--theia-brand-color1,#0ea5e9); margin-bottom:4px;">⏳ Converting pages...</div>
            <div id="conv-progress-\${basename}" style="opacity:0.7; margin-bottom:6px;">Checking progress...</div>
            <button id="build-btn-\${basename}" disabled
              style="width:100%; padding:5px; background:#94a3b8; color:#fff; border:none; border-radius:3px; cursor:not-allowed; font-size:11px; font-weight:bold;">
              ⚡ Build Concepts
            </button>
          \`;
          containerZone.appendChild(statusDiv);

          // Poll ingest-status until conversion complete
          const btn = statusDiv.querySelector('#build-btn-' + basename);
          const progressEl = statusDiv.querySelector('#conv-progress-' + basename);
          const poll = setInterval(async () => {
            try {
              const r = await fetch('http://127.0.0.1:3210/api/hayagriva/ingest-status?case=' + caseName + '&basename=' + basename);
              const d = await r.json();
              if (d.complete || (!d.converting && d.totalPages === null)) {
                clearInterval(poll);
                progressEl.textContent = '✓ All pages converted. Ready to build concepts.';
                progressEl.style.color = '#10b981';
                btn.disabled = false;
                btn.style.background = 'var(--theia-brand-color1,#0ea5e9)';
                btn.style.cursor = 'pointer';
              } else if (d.converting) {
                progressEl.textContent = 'Page ' + (d.nextPage - 1) + ' of ' + d.totalPages + ' converted...';
              }
            } catch(_) {}
          }, 4000);

          btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = '⏳ Building concepts...';
            try {
              const r = await fetch('http://127.0.0.1:3210/api/hayagriva/build-concepts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName, basename })
              });
              const d = await r.json();
              if (d.ok) {
                btn.textContent = '✓ Concepts built (' + d.sections + ' sections)';
                btn.style.background = '#10b981';
                if (window.parent) window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName }, '*');
              } else {
                btn.textContent = '✗ ' + (d.error || 'Failed');
                btn.style.background = '#ef4444';
                btn.disabled = false;
              }
            } catch(e) {
              btn.textContent = '✗ Error: ' + e.message;
              btn.style.background = '#ef4444';
              btn.disabled = false;
            }
          };
        }
      };
      reader.readAsDataURL(file);
    }
  </script>
</body>
</html>`;
}

export function wikiExplorerHtml(caseName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 15px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
  }
  h3 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    color: var(--theia-brand-color1, #0ea5e9);
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    padding-bottom: 6px;
  }
  .card-item {
    padding: 8px 10px;
    margin-bottom: 6px;
    background: var(--theia-layout-color3, #ffffff);
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .card-item:hover {
    border-color: var(--theia-brand-color1, #0ea5e9);
    background: rgba(14, 165, 233, 0.02);
  }
  .card-title {
    font-weight: bold;
    margin-bottom: 4px;
  }
  .card-tags {
    font-size: 10px;
    opacity: 0.7;
  }
  .empty {
    opacity: 0.5;
    text-align: center;
    padding-top: 20px;
  }
</style>
</head>
<body>
  <div id="cards-container">Loading wiki cards...</div>

  <script>
    let currentCase = '${caseName}';
    
    function syncTheme() {
      if (window.parent) {
        const parentStyle = window.parent.getComputedStyle(window.parent.document.documentElement);
        const docStyle = document.documentElement.style;
        const vars = [
          '--theia-layout-color1', '--theia-layout-color2', '--theia-layout-color3',
          '--theia-ui-font-color1', '--theia-ui-font-color2', '--theia-border-color',
          '--theia-brand-color1', '--theia-ui-font-family', '--theia-ui-font-size1'
        ];
        vars.forEach(v => {
          const val = parentStyle.getPropertyValue(v);
          if (val) docStyle.setProperty(v, val);
        });
      }
    }
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    if (window.parent && window.parent.document.documentElement) {
      observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'select-case') {
        currentCase = event.data.caseName;
        loadCards();
      }
    });

    async function loadCards() {
      try {
        if (currentCase === 'TWILLM-OKF-PAGED' || currentCase === 'HAYAGRIVA' || !currentCase) {
          const casesRes = await fetch('http://127.0.0.1:3210/api/hayagriva/cases');
          if (casesRes.ok) {
            const data = await casesRes.json();
            if (data.cases && data.cases.length > 0) {
              currentCase = data.cases[0];
            }
          }
        }
        const res = await fetch('http://127.0.0.1:3210/api/hayagriva/wiki-cards?case=' + currentCase);
        const data = await res.json();
        const container = document.getElementById('cards-container');
        container.innerHTML = '';
        
        if (!data.cards || data.cards.length === 0) {
          container.innerHTML = '<div class="empty">No wiki cards saved yet.</div>';
          return;
        }
        
        data.cards.forEach(card => {
          const div = document.createElement('div');
          div.className = 'card-item';
          div.innerHTML = \`
            <div class="card-title">📖 \\\${card.title}</div>
            <div class="card-tags">Tags: \\\${card.tags.join(', ')}</div>
          \`;
          div.ondblclick = () => {
            window.parent.postMessage({
              type: 'open-wiki-card',
              caseName: currentCase,
              filename: card.filename
            }, '*');
          };
          container.appendChild(div);
        });
      } catch (e) {
        document.getElementById('cards-container').innerHTML = '<div style="opacity: 0.6; text-align: center; padding-top: 20px;">Connecting to Case Wiki server...</div>';
        setTimeout(loadCards, 2000);
      }
    }
    loadCards();
  </script>
</body>
</html>`;
}

export function conceptsExplorerHtml(caseName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 15px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
  }
  .doc-header {
    font-weight: bold;
    padding: 8px 4px 6px 4px;
    margin-top: 12px;
    cursor: default;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    color: var(--theia-brand-color1, #0ea5e9);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pages-container {
    padding-left: 14px;
    margin-top: 4px;
    margin-bottom: 8px;
    border-left: 1px dashed var(--theia-border-color, #ccc);
  }
  .page-item {
    padding: 5px 8px;
    margin: 3px 0;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .page-item:hover {
    background: var(--theia-layout-color3, #ffffff);
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .pending-card {
    margin-top: 10px;
    padding: 10px;
    background: var(--theia-layout-color3, #fff);
    border: 1px solid var(--theia-border-color, #ccc);
    border-left: 3px solid #f59e0b;
    border-radius: 4px;
  }
  .pending-title {
    font-weight: bold;
    margin-bottom: 4px;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pending-status {
    font-size: 11px;
    opacity: 0.7;
    margin-bottom: 6px;
  }
  .action-row {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .btn-sm {
    flex: 1;
    padding: 4px 6px;
    font-size: 11px;
    font-weight: bold;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .btn-sm:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn-open { background: var(--theia-layout-color2, #e8e8e8); color: var(--theia-ui-font-color1,#333); }
  .btn-build { background: var(--theia-brand-color1, #0ea5e9); color: #fff; }
  .btn-rebuild { background: transparent; color: var(--theia-brand-color1,#0ea5e9); border: 1px solid var(--theia-brand-color1,#0ea5e9); }
  .progress-bar-wrap { height: 3px; background: var(--theia-border-color,#e0e0e0); border-radius: 2px; margin: 4px 0 6px; }
  .progress-bar { height: 3px; background: #f59e0b; border-radius: 2px; transition: width 0.4s; }
  .empty {
    opacity: 0.5;
    text-align: center;
    padding-top: 20px;
  }
  .empty-pages {
    opacity: 0.5;
    font-style: italic;
    cursor: default;
  }
</style>
</head>
<body>
  <div id="concepts-container">Loading concepts...</div>

  <script>
    let currentCase = '${caseName}';

    function syncTheme() {
      if (window.parent) {
        const parentStyle = window.parent.getComputedStyle(window.parent.document.documentElement);
        const docStyle = document.documentElement.style;
        const vars = [
          '--theia-layout-color1', '--theia-layout-color2', '--theia-layout-color3',
          '--theia-ui-font-color1', '--theia-ui-font-color2', '--theia-border-color',
          '--theia-brand-color1', '--theia-ui-font-family', '--theia-ui-font-size1'
        ];
        vars.forEach(v => {
          const val = parentStyle.getPropertyValue(v);
          if (val) docStyle.setProperty(v, val);
        });
      }
    }
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    if (window.parent && window.parent.document.documentElement) {
      observer.observe(window.parent.document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'select-case') {
        currentCase = event.data.caseName;
        loadConcepts();
      }
      if (event.data && event.data.type === 'refresh-wiki-explorer') {
        loadConcepts();
      }
    });

    // ── Build / Rebuild trigger ────────────────────────────────────────
    async function triggerBuild(btn, caseName, basename) {
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Building...';
      try {
        const r = await fetch('http://127.0.0.1:3210/api/hayagriva/build-concepts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: caseName, basename })
        });
        const d = await r.json();
        if (d.ok) {
          btn.textContent = '✓ Done (' + d.sections + ' sections)';
          setTimeout(() => loadConcepts(), 800);
        } else {
          btn.textContent = '✗ ' + (d.error || 'Failed');
          btn.style.background = '#ef4444';
          btn.disabled = false;
        }
      } catch(e) {
        btn.textContent = '✗ Error';
        btn.style.background = '#ef4444';
        btn.disabled = false;
      }
    }

    // ── Render pending_review card ────────────────────────────────────
    function renderPendingCard(container, doc) {
      const converting = doc.converting || (doc.nextPage && !doc.conversionComplete);
      const pct = (doc.totalPages && doc.nextPage)
        ? Math.round(((doc.nextPage - 1) / doc.totalPages) * 100)
        : (doc.conversionComplete ? 100 : 0);

      const card = document.createElement('div');
      card.className = 'pending-card';
      card.id = 'pending-' + doc.title;

      card.innerHTML = \`
        <div class="pending-title">⚠ \\\${doc.title}</div>
        <div class="pending-status" id="pstatus-\\\${doc.title}">
          \\\${doc.conversionComplete
            ? '✓ Conversion complete — awaiting review'
            : (converting ? 'Converting page ' + (doc.nextPage - 1) + ' of ' + doc.totalPages + '...' : '⏳ Queued for conversion...')}
        </div>
        \\\${doc.totalPages ? \\\`
          <div class="progress-bar-wrap">
            <div class="progress-bar" id="pbar-\\\${doc.title}" style="width:\\\${pct}%"></div>
          </div>
        \\\` : ''}
        <div class="action-row">
          <button class="btn-sm btn-open" id="open-\\\${doc.title}">📄 Open .md</button>
          <button class="btn-sm btn-build" id="build-\\\${doc.title}" \\\${doc.conversionComplete ? '' : 'disabled'}>
            ⚡ Build Concepts
          </button>
        </div>
      \`;

      container.appendChild(card);

      // Open .md handler
      card.querySelector('#open-' + doc.title).onclick = () => {
        window.parent.postMessage({
          type: 'open-concept-chunk',
          absolutePath: doc.companionPath
        }, '*');
      };

      // Build button handler
      const buildBtn = card.querySelector('#build-' + doc.title);
      buildBtn.onclick = () => triggerBuild(buildBtn, currentCase, doc.title);

      // Poll progress if still converting
      if (!doc.conversionComplete) {
        const pbar = card.querySelector('#pbar-' + doc.title);
        const pstatus = card.querySelector('#pstatus-' + doc.title);
        const poll = setInterval(async () => {
          try {
            const r = await fetch('http://127.0.0.1:3210/api/hayagriva/ingest-status?case=' + currentCase + '&basename=' + doc.title);
            const d = await r.json();
            if (d.complete || (!d.converting && d.totalPages === null)) {
              clearInterval(poll);
              pstatus.textContent = '✓ Conversion complete — ready to build concepts';
              pstatus.style.color = '#10b981';
              if (pbar) pbar.style.width = '100%';
              buildBtn.disabled = false;
            } else if (d.converting && d.totalPages) {
              const p = Math.round(((d.nextPage - 1) / d.totalPages) * 100);
              if (pbar) pbar.style.width = p + '%';
              pstatus.textContent = 'Converting page ' + (d.nextPage - 1) + ' of ' + d.totalPages + '...';
            }
          } catch(_) {}
        }, 4000);
      }
    }

    // ── Main load ────────────────────────────────────────────────
    async function loadConcepts() {
      try {
        if (currentCase === 'TWILLM-OKF-PAGED' || currentCase === 'HAYAGRIVA' || !currentCase) {
          const casesRes = await fetch('http://127.0.0.1:3210/api/hayagriva/cases');
          if (casesRes.ok) {
            const data = await casesRes.json();
            if (data.cases && data.cases.length > 0) currentCase = data.cases[0];
          }
        }

        const res = await fetch('http://127.0.0.1:3210/api/hayagriva/documents?case=' + currentCase);
        if (!res.ok) {
          document.getElementById('concepts-container').innerHTML = '<div class="empty">No documents found. Upload a file to start.</div>';
          return;
        }
        const { documents } = await res.json();
        const container = document.getElementById('concepts-container');
        container.innerHTML = '';

        if (!documents || documents.length === 0) {
          container.innerHTML = '<div class="empty">No documents yet. Upload a PDF to begin.</div>';
          return;
        }

        for (const doc of documents) {
          if (doc.status === 'pending_review') {
            renderPendingCard(container, doc);
            continue;
          }

          // ── Indexed document ──
          const docHeader = document.createElement('div');
          docHeader.className = 'doc-header';
          docHeader.innerHTML = \`📁 <strong>\${doc.title}</strong> (\${doc.sections} sections)\`;
          container.appendChild(docHeader);

          const docPagesContainer = document.createElement('div');
          docPagesContainer.className = 'pages-container';

          if (doc.shadowDocuments && doc.shadowDocuments.length > 0) {
            doc.shadowDocuments.forEach(shadow => {
              const pageItem = document.createElement('div');
              pageItem.className = 'page-item';
              pageItem.innerHTML = \`💡 \${shadow.title}\`;
              pageItem.title = 'Double-click to open page chunk';
              pageItem.ondblclick = () => {
                window.parent.postMessage({ type: 'open-concept-chunk', absolutePath: shadow.path }, '*');
              };
              docPagesContainer.appendChild(pageItem);
            });
          } else {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'page-item empty-pages';
            emptyItem.textContent = 'No page chunks';
            docPagesContainer.appendChild(emptyItem);
          }

          container.appendChild(docPagesContainer);

          // Rebuild Concepts button (always available for indexed docs)
          const rebuildRow = document.createElement('div');
          rebuildRow.style.cssText = 'padding: 0 0 10px 14px;';
          const rebuildBtn = document.createElement('button');
          rebuildBtn.className = 'btn-sm btn-rebuild';
          rebuildBtn.style.width = '100%';
          rebuildBtn.textContent = '🔄 Rebuild Concepts';
          rebuildBtn.onclick = () => triggerBuild(rebuildBtn, currentCase, doc.title);
          rebuildRow.appendChild(rebuildBtn);
          container.appendChild(rebuildRow);
        }
      } catch (e) {
        document.getElementById('concepts-container').innerHTML = '<div style="opacity: 0.6; text-align: center; padding-top: 20px;">Connecting to concepts server...</div>';
    loadConcepts();
    setInterval(loadConcepts, 30000); // Refresh every 30s to pick up background changes
  </script>
</body>
</html>`;
}

export function kvEditorHtml(caseName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--theia-ui-font-size1, 13px);
      color: var(--theia-ui-font-color1, #333);
      background-color: var(--theia-layout-color1, #fafafa);
      margin: 20px;
      padding: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--theia-border-color, #e5e7eb);
      padding-bottom: 10px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .btn {
      background-color: var(--theia-brand-color1, #8b5cf6);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--theia-layout-color2, #fff);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--theia-border-color, #e5e7eb);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--theia-border-color, #f3f4f6);
    }
    th {
      background: var(--theia-layout-color3, #f9fafb);
      font-weight: 600;
      color: var(--theia-ui-font-color2, #6b7280);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      background: var(--theia-layout-color1, #fff);
      color: var(--theia-ui-font-color1);
      border: 1px solid var(--theia-border-color, #d1d5db);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      transition: border-color 0.15s;
    }
    input:focus {
      outline: none;
      border-color: var(--theia-brand-color1, #8b5cf6);
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      font-size: 10px;
      font-weight: 700;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-high { background: #dcfce7; color: #166534; }
    .badge-medium { background: #fef9c3; color: #854d0e; }
    .badge-low { background: #fee2e2; color: #991b1b; }
    .citation {
      color: var(--theia-brand-color1, #8b5cf6);
      cursor: pointer;
      text-decoration: none;
      font-weight: 500;
    }
    .citation:hover {
      text-decoration: underline;
    }
    .explanation {
      font-size: 11px;
      opacity: 0.65;
      margin-top: 4px;
      display: block;
    }
    .status-msg {
      margin-left: 10px;
      font-size: 12px;
      color: #10b981;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>🏢 Case Key-Value Dictionary &mdash; <code>${caseName}</code></h2>
    <div>
      <span id="save-status" class="status-msg"></span>
      <button id="save-btn" class="btn">💾 Save Changes</button>
    </div>
  </div>

  <table id="kv-table">
    <thead>
      <tr>
        <th style="width: 25%;">Variable Key</th>
        <th style="width: 35%;">Extracted Value</th>
        <th style="width: 10%;">Confidence</th>
        <th style="width: 30%;">Source Citation & Explanation</th>
      </tr>
    </thead>
    <tbody id="kv-body">
      <tr>
        <td colspan="4" style="text-align: center; opacity: 0.6;">Loading KV Dictionary...</td>
      </tr>
    </tbody>
  </table>

  <script>
    let dictionaryData = {};
    const caseName = "${caseName}";

    async function loadDictionary() {
      try {
        const res = await fetch("http://127.0.0.1:3210/api/forms/kv-dictionary?case=" + encodeURIComponent(caseName));
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        dictionaryData = data.dictionary || {};
        renderTable();
      } catch (e) {
        document.getElementById("kv-body").innerHTML = \`<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error loading dictionary: \${e.message}</td></tr>\`;
      }
    }

    function renderTable() {
      const tbody = document.getElementById("kv-body");
      tbody.innerHTML = "";
      
      const keys = Object.keys(dictionaryData).sort();
      if (keys.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="4" style="text-align: center; opacity: 0.6; padding: 20px;">No facts extracted yet. Upload financial files to populate.</td></tr>\`;
        return;
      }

      keys.forEach(key => {
        const item = dictionaryData[key];
        const tr = document.createElement("tr");

        // Key Name
        const tdKey = document.createElement("td");
        tdKey.style.fontWeight = "600";
        tdKey.textContent = key;
        tr.appendChild(tdKey);

        // Editable value
        const tdVal = document.createElement("td");
        const input = document.createElement("input");
        input.value = item.value !== undefined ? item.value : "";
        input.onchange = (e) => {
          dictionaryData[key].value = e.target.value;
          dictionaryData[key].modifiedBy = 'user';
        };
        tdVal.appendChild(input);
        tr.appendChild(tdVal);

        // Confidence badge
        const tdConf = document.createElement("td");
        const conf = (item.confidence || "medium").toLowerCase();
        tdConf.innerHTML = \`<span class="badge badge-\${conf}">\${conf}</span>\`;
        tr.appendChild(tdConf);

        // Citation / Explanation
        const tdCitation = document.createElement("td");
        if (item.source && item.source !== 'N/A') {
          const parts = item.source.split(':');
          const docName = parts[0];
          const textExcerpt = parts.slice(1).join(':').trim();
          
          const a = document.createElement("a");
          a.className = "citation";
          a.textContent = docName;
          a.title = "Click to jump to source segment";
          a.onclick = () => {
            // Find text match anchor
            const anchor = textExcerpt.substring(0, 30);
            window.parent.postMessage({ type: 'open-citation', filePath: docName, anchor }, '*');
          };
          tdCitation.appendChild(a);
        } else {
          tdCitation.appendChild(document.createTextNode("System default"));
        }

        const expl = document.createElement("span");
        expl.className = "explanation";
        expl.textContent = item.explanation || "";
        tdCitation.appendChild(expl);
        tr.appendChild(tdCitation);

        tbody.appendChild(tr);
      });
    }

    document.getElementById("save-btn").onclick = async () => {
      const btn = document.getElementById("save-btn");
      const status = document.getElementById("save-status");
      btn.disabled = true;
      status.textContent = "Saving...";

      try {
        const res = await fetch("http://127.0.0.1:3210/api/forms/kv-dictionary/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, dictionary: dictionaryData })
        });
        if (!res.ok) throw new Error("Save error");
        status.textContent = "✓ Saved Successfully";
        setTimeout(() => { status.textContent = ""; }, 3000);
      } catch (e) {
        status.textContent = "✗ Failed to save: " + e.message;
        status.style.color = "#ef4444";
      } finally {
        btn.disabled = false;
      }
    };

    loadDictionary();
  </script>
</body>
</html>`;
}

export function formEditorHtml(caseName: string, formId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--theia-ui-font-size1, 13px);
      color: var(--theia-ui-font-color1, #333);
      background-color: var(--theia-layout-color1, #fafafa);
      margin: 20px;
      padding: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--theia-border-color, #e5e7eb);
      padding-bottom: 10px;
    }
    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .tabs {
      display: flex;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--theia-border-color, #e5e7eb);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-weight: 500;
      color: var(--theia-ui-font-color2, #6b7280);
      font-size: 12px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover {
      color: var(--theia-brand-color1, #8b5cf6);
    }
    .tab.active {
      color: var(--theia-brand-color1, #8b5cf6);
      border-bottom-color: var(--theia-brand-color1, #8b5cf6);
      font-weight: 600;
    }
    .tab-content {
      display: none;
      background: var(--theia-layout-color2, #fff);
      border: 1px solid var(--theia-border-color, #e5e7eb);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .tab-content.active {
      display: block;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      margin-bottom: 16px;
    }
    .form-group label {
      font-weight: 600;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
    }
    .field-row {
      display: flex;
      gap: 16px;
    }
    .field-input {
      flex: 3;
    }
    .field-meta {
      flex: 2;
      background: var(--theia-layout-color3, #f9fafb);
      border: 1px solid var(--theia-border-color, #e5e7eb);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 11px;
      color: var(--theia-ui-font-color2, #4b5563);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      background: var(--theia-layout-color1, #fff);
      color: var(--theia-ui-font-color1);
      border: 1px solid var(--theia-border-color, #d1d5db);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 13px;
      transition: border-color 0.15s;
    }
    input:focus {
      outline: none;
      border-color: var(--theia-brand-color1, #8b5cf6);
    }
    .btn {
      background-color: var(--theia-brand-color1, #8b5cf6);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-right: 8px;
    }
    .btn:hover { opacity: 0.9; }
    .btn:active { transform: scale(0.98); }
    .btn-secondary {
      background-color: var(--theia-layout-color3, #e5e7eb);
      color: var(--theia-ui-font-color1, #333);
      border: 1px solid var(--theia-border-color, #d1d5db);
    }
    .validation-alert {
      background-color: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      padding: 6px 10px;
      border-radius: 4px;
      margin-top: 6px;
      font-size: 11px;
      font-weight: 500;
    }
    .citation {
      color: var(--theia-brand-color1, #8b5cf6);
      cursor: pointer;
      text-decoration: underline;
    }
    .badge {
      display: inline-block;
      padding: 1px 5px;
      font-size: 9px;
      font-weight: 700;
      border-radius: 9999px;
      text-transform: uppercase;
      margin-left: 6px;
    }
    .badge-high { background: #dcfce7; color: #166534; }
    .badge-medium { background: #fef9c3; color: #854d0e; }
    .badge-low { background: #fee2e2; color: #991b1b; }
    .badge-user { background: #e0f2fe; color: #0369a1; }
    .status-msg {
      margin-left: 10px;
      font-size: 12px;
      color: #10b981;
      font-weight: 500;
    }
    .bookmarklet-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.4);
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .bookmarklet-content {
      background: var(--theia-layout-color2, #fff);
      padding: 20px;
      border-radius: 8px;
      width: 450px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .code-box {
      background: #f1f5f9;
      color: #334155;
      padding: 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      word-break: break-all;
      max-height: 120px;
      overflow-y: auto;
      border: 1px solid #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>📄 Form Review Dashboard: <code>${formId.toUpperCase()}</code></h2>
    <div>
      <span id="save-status" class="status-msg"></span>
      <button id="save-btn" class="btn">💾 Save Review</button>
      <button id="bookmarklet-btn" class="btn btn-secondary">📋 Copy Bookmarklet</button>
      <button id="export-btn" class="btn btn-secondary">🖨️ Export Preview (HTML)</button>
    </div>
  </div>

  <div id="tabs-container" class="tabs"></div>
  <div id="sections-container"></div>

  <div id="bk-modal" class="bookmarklet-modal">
    <div class="bookmarklet-content">
      <h3 style="margin-top:0;">📋 Copy Autofill Bookmarklet</h3>
      <p style="font-size:11px; opacity:0.8;">Drag this link code to your bookmarks bar, or click Copy Code to paste it into the Chrome Console on the live MCA portal:</p>
      <div id="bk-code" class="code-box">Loading code...</div>
      <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
        <button id="copy-bk-btn" class="btn">Copy Code</button>
        <button id="close-bk-btn" class="btn btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <script>
    let fieldsData = {};
    let schemaData = {};
    const caseName = "${caseName}";
    const formId = "${formId}";

    async function loadFormInstance() {
      try {
        const schemaRes = await fetch("http://127.0.0.1:3210/api/hayagriva/read-file?path=forms/" + formId + "/schema.json");
        schemaData = await schemaRes.json();

        const instRes = await fetch("http://127.0.0.1:3210/api/forms/instance?case=" + encodeURIComponent(caseName) + "&formId=" + formId);
        const instData = await instRes.json();
        fieldsData = instData.fields || {};
        
        renderTabs();
      } catch (e) {
        document.getElementById("sections-container").innerHTML = \`<div style="color:#ef4444; text-align:center;">Error initializing dashboard: \${e.message}</div>\`;
      }
    }

    function renderTabs() {
      const tabContainer = document.getElementById("tabs-container");
      const sectionContainer = document.getElementById("sections-container");
      tabContainer.innerHTML = "";
      sectionContainer.innerHTML = "";

      const sections = schemaData.sections || [];
      sections.forEach((sec, idx) => {
        // Tab button
        const t = document.createElement("div");
        t.className = "tab" + (idx === 0 ? " active" : "");
        t.textContent = sec.displayName;
        t.onclick = () => {
          document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
          document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
          t.classList.add("active");
          document.getElementById("sec-" + sec.sectionId).classList.add("active");
        };
        tabContainer.appendChild(t);

        // Content panel
        const contentDiv = document.createElement("div");
        contentDiv.id = "sec-" + sec.sectionId;
        contentDiv.className = "tab-content" + (idx === 0 ? " active" : "");

        (sec.fields || []).forEach(field => {
          const item = fieldsData[field.key] || { value: "" };
          const group = document.createElement("div");
          group.className = "form-group";

          // Label row
          const label = document.createElement("label");
          label.innerHTML = field.label;
          const conf = (item.modifiedBy === 'user' ? 'user' : item.confidence || "medium").toLowerCase();
          label.innerHTML += \`<span class="badge badge-\${conf}">\${conf}</span>\`;
          group.appendChild(label);

          // Field Row
          const row = document.createElement("div");
          row.className = "field-row";

          // Input element
          const divInput = document.createElement("div");
          divInput.className = "field-input";
          const input = document.createElement("input");
          input.value = item.value !== undefined ? item.value : "";
          input.onchange = (e) => {
            fieldsData[field.key].value = e.target.value;
            fieldsData[field.key].modifiedBy = 'user';
          };
          divInput.appendChild(input);

          // Validation warning alert
          if (item.validationError) {
            const alert = document.createElement("div");
            alert.className = "validation-alert";
            alert.innerHTML = "⚠️ " + item.validationError;
            divInput.appendChild(alert);
          }
          row.appendChild(divInput);

          // Meta explanations panel
          const divMeta = document.createElement("div");
          divMeta.className = "field-meta";
          
          const expl = document.createElement("div");
          expl.style.cssText = "font-style: italic; margin-bottom: 4px;";
          expl.textContent = item.explanation || "No explanation provided.";
          divMeta.appendChild(expl);

          if (item.source && item.source !== 'N/A') {
            const parts = item.source.split(':');
            const docName = parts[0];
            const textExcerpt = parts.slice(1).join(':').trim();
            
            const a = document.createElement("a");
            a.className = "citation";
            a.textContent = "Source: " + docName;
            a.onclick = () => {
              const anchor = textExcerpt.substring(0, 30);
              window.parent.postMessage({ type: 'open-citation', filePath: docName, anchor }, '*');
            };
            divMeta.appendChild(a);
          }
          row.appendChild(divMeta);
          
          group.appendChild(row);
          contentDiv.appendChild(group);
        });

        sectionContainer.appendChild(contentDiv);
      });
    }

    // Buttons actions
    document.getElementById("save-btn").onclick = async () => {
      const btn = document.getElementById("save-btn");
      const status = document.getElementById("save-status");
      btn.disabled = true;
      status.textContent = "Saving & Validating...";

      try {
        const res = await fetch("http://127.0.0.1:3210/api/forms/instance/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, formId: formId, fields: fieldsData })
        });
        if (!res.ok) throw new Error("Save error");
        const result = await res.json();
        fieldsData = result.fields || fieldsData;
        
        // Re-render
        const activeTabIdx = Array.from(document.querySelectorAll(".tab")).findIndex(t => t.classList.contains("active"));
        renderTabs();
        if (activeTabIdx !== -1) {
          document.querySelectorAll(".tab")[activeTabIdx].click();
        }

        status.textContent = result.validationErrors.length > 0 
          ? "⚠️ Saved with " + result.validationErrors.length + " warnings" 
          : "✓ Saved and fully compliant!";
        status.style.color = result.validationErrors.length > 0 ? "#eab308" : "#10b981";
      } catch (e) {
        status.textContent = "✗ Failed to save: " + e.message;
        status.style.color = "#ef4444";
      } finally {
        btn.disabled = false;
      }
    };

    document.getElementById("bookmarklet-btn").onclick = async () => {
      const modal = document.getElementById("bk-modal");
      const codeBox = document.getElementById("bk-code");
      modal.style.display = "flex";
      codeBox.textContent = "Compiling bookmarklet code...";

      try {
        const res = await fetch("http://127.0.0.1:3210/api/forms/instance/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, formId: formId })
        });
        if (!res.ok) throw new Error("Export failure");
        const data = await res.json();
        codeBox.textContent = data.bookmarkletCode || "No bookmarklet template defined.";
      } catch (e) {
        codeBox.textContent = "Error compiling bookmarklet: " + e.message;
      }
    };

    document.getElementById("copy-bk-btn").onclick = () => {
      const code = document.getElementById("bk-code").textContent;
      navigator.clipboard.writeText(code);
      document.getElementById("copy-bk-btn").textContent = "Copied!";
      setTimeout(() => { document.getElementById("copy-bk-btn").textContent = "Copy Code"; }, 2000);
    };

    document.getElementById("close-bk-btn").onclick = () => {
      document.getElementById("bk-modal").style.display = "none";
    };

    document.getElementById("export-btn").onclick = async () => {
      const btn = document.getElementById("export-btn");
      btn.disabled = true;
      try {
        const res = await fetch("http://127.0.0.1:3210/api/forms/instance/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, formId: formId })
        });
        if (!res.ok) throw new Error("Export error");
        const result = await res.json();
        
        // Notify parent workspace to open the generated HTML file in a new tab or browser preview
        window.open("http://127.0.0.1:3210/api/hayagriva/read-file?path=" + encodeURIComponent(result.filledHtmlPath), "_blank");
      } catch (e) {
        alert("Failed to export HTML form: " + e.message);
      } finally {
        btn.disabled = false;
      }
    };

    loadFormInstance();
  </script>
</body>
</html>`;
}

export function draftingPanelHtml(caseName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
      font-size: var(--theia-ui-font-size1, 12px);
      color: var(--theia-ui-font-color1, #222);
      background-color: var(--theia-layout-color2, #fafafa);
      margin: 12px;
      padding: 0;
    }
    h3 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      border-bottom: 1px solid var(--theia-border-color, #e5e7eb);
      padding-bottom: 6px;
    }
    .list-item {
      padding: 10px;
      border: 1px solid var(--theia-border-color, #e5e7eb);
      border-radius: 6px;
      background: var(--theia-layout-color1, #fff);
      margin-bottom: 8px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.15s, border-color 0.15s;
    }
    .list-item:hover {
      background: var(--theia-layout-color3, #f9fafb);
      border-color: var(--theia-brand-color1, #8b5cf6);
    }
    .item-name {
      font-weight: 600;
    }
    .badge {
      font-size: 9px;
      background: #e0f2fe;
      color: #0369a1;
      padding: 1px 4px;
      border-radius: 4px;
      font-weight: bold;
    }
    .draft-btn {
      background: var(--theia-brand-color1, #8b5cf6);
      color: white;
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      font-size: 11px;
    }
    .placeholder-panel {
      margin-top: 16px;
      background: var(--theia-layout-color1, #fff);
      border: 1px solid var(--theia-border-color, #e5e7eb);
      border-radius: 6px;
      padding: 12px;
      display: none;
    }
    .placeholder-title {
      font-weight: bold;
      color: #b91c1c;
      margin-bottom: 8px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .placeholder-item {
      padding: 4px 6px;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #991b1b;
      margin-bottom: 4px;
      font-size: 10px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
    }
    .placeholder-item:hover {
      background: #fee2e2;
    }
    .spinner {
      border: 2px solid rgba(0,0,0,0.1);
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border-left-color: var(--theia-brand-color1, #8b5cf6);
      animation: spin 1s linear infinite;
      display: inline-block;
      margin-right: 6px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .loading-overlay {
      display: none;
      align-items: center;
      justify-content: center;
      padding: 10px;
      background: #fef9c3;
      border: 1px solid #fef08a;
      color: #854d0e;
      border-radius: 6px;
      margin-bottom: 12px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <h3>🪄 Document Drafting Sidebar</h3>

  <div id="loader" class="loading-overlay">
    <div class="spinner"></div>
    <span id="loader-msg">Drafting document... Please wait.</span>
  </div>

  <div id="templates-list">
    <div style="text-align:center; opacity:0.6; padding-top:20px;">Scanning registered formats...</div>
  </div>

  <div id="placeholder-box" class="placeholder-panel">
    <div class="placeholder-title">⚠️ Unresolved Placeholders (<span id="pl-count">0</span>)</div>
    <div id="placeholders-list"></div>
  </div>

  <script>
    const caseName = "${caseName}";
    let formatsList = [];

    async function loadFormats() {
      try {
        const res = await fetch("http://127.0.0.1:3210/api/formats/registry");
        if (!res.ok) throw new Error();
        const data = await res.json();
        formatsList = data.formats || [];
        renderList();
      } catch (e) {
        document.getElementById("templates-list").innerHTML = \`<div style="color:#ef4444; text-align:center;">Failed to contact registry.</div>\`;
      }
    }

    function renderList() {
      const container = document.getElementById("templates-list");
      container.innerHTML = "";

      if (formatsList.length === 0) {
        container.innerHTML = \`<div style="text-align:center; opacity:0.6; padding-top:20px;">No templates found in formats/</div>\`;
        return;
      }

      formatsList.forEach(fmt => {
        const item = document.createElement("div");
        item.className = "list-item";

        const nameDiv = document.createElement("div");
        nameDiv.className = "item-name";
        nameDiv.textContent = fmt.name;
        item.appendChild(nameDiv);

        const btn = document.createElement("button");
        btn.className = "draft-btn";
        btn.textContent = "Draft";
        btn.onclick = (e) => {
          e.stopPropagation();
          triggerDraft(fmt.formatId);
        };
        item.appendChild(btn);

        container.appendChild(item);
      });
    }

    async function triggerDraft(formatId) {
      const loader = document.getElementById("loader");
      loader.style.display = "flex";
      document.getElementById("placeholder-box").style.display = "none";

      try {
        const res = await fetch("http://127.0.0.1:3210/api/formats/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, formatId })
        });
        if (!res.ok) throw new Error("Drafting failed");
        const data = await res.json();

        // 1. Open the created file in the workspace
        window.parent.postMessage({
          type: 'open-concept-chunk',
          relativePath: data.draftName
        }, '*');

        // 2. Display placeholders
        renderPlaceholders(data.placeholders, data.draftName, data.version);
      } catch (e) {
        alert("Error drafting document: " + e.message);
      } finally {
        loader.style.display = "none";
      }
    }

    function renderPlaceholders(list, draftName, version) {
      const box = document.getElementById("placeholder-box");
      const listContainer = document.getElementById("placeholders-list");
      box.style.display = "block";
      document.getElementById("pl-count").textContent = list.length;
      listContainer.innerHTML = "";

      // Add a diff button if version is > 1
      if (version > 1) {
        const diffBtn = document.createElement("button");
        diffBtn.className = "btn";
        diffBtn.style.cssText = "width:100%; margin-bottom:8px; background:#4b5563; font-size:10px; padding:4px;";
        diffBtn.innerHTML = "🔍 Compare with previous draft (Diff)";
        diffBtn.onclick = () => {
          // Send redline comparison message
          window.parent.postMessage({
            type: 'compare-draft-versions',
            draftName,
            version
          }, '*');
        };
        listContainer.appendChild(diffBtn);
      }

      if (list.length === 0) {
        listContainer.innerHTML = \`<div style="color:#10b981; font-weight:bold; font-size:10px; text-align:center; padding:10px;">✓ No placeholders left! Draft is complete.</div>\`;
        return;
      }

      list.forEach(p => {
        const item = document.createElement("div");
        item.className = "placeholder-item";
        item.innerHTML = \`<span>\${p.text}</span> <span style="opacity:0.6;">Line \${p.line}</span>\`;
        item.onclick = () => {
          // Focus specific line in editor
          window.parent.postMessage({
            type: 'focus-editor-line',
            relativePath: draftName,
            line: p.line
          }, '*');
        };
        listContainer.appendChild(item);
      });
    }

    loadFormats();
  </script>
</body>
</html>`;
}
