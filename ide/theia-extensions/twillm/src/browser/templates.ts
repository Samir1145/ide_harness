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
          const uploadRes = await fetch('http://127.0.0.1:3210/api/twillm/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, filename: filename, content: base64 })
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

          // Step 2: Run conversion, layout parsing, and indexing immediately
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Converting & Ingesting...</p>';
          
          const ingestRes = await fetch('http://127.0.0.1:3210/api/twillm/ingest', {
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
        const res = await fetch('http://127.0.0.1:3210/api/twillm/wiki-cards?case=' + currentCase);
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
  <div id="concepts-container">Loading concepts and chunks...</div>

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
    });

    async function loadConcepts() {
      try {
        const res = await fetch('http://127.0.0.1:3210/api/twillm/read-file?path=' + currentCase + '/concepts/index.json');
        if (!res.ok) {
          document.getElementById('concepts-container').innerHTML = '<div class="empty">No concepts indexed yet. Ingest a document to start.</div>';
          return;
        }
        const index = await res.json();
        const container = document.getElementById('concepts-container');
        container.innerHTML = '';
        
        if (!index.documents || index.documents.length === 0) {
          container.innerHTML = '<div class="empty">No concepts indexed yet. Ingest a document to start.</div>';
          return;
        }
        
        index.documents.forEach(doc => {
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
              // Display title cleanly (removing path elements)
              const title = shadow.title;
              pageItem.innerHTML = \`💡 \${title}\`;
              pageItem.title = "Double-click to open page chunk";
              pageItem.ondblclick = () => {
                window.parent.postMessage({
                  type: 'open-concept-chunk',
                  absolutePath: shadow.path
                }, '*');
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
        });
      } catch (e) {
        document.getElementById('concepts-container').innerHTML = '<div style="opacity: 0.6; text-align: center; padding-top: 20px;">Connecting to concepts server...</div>';
        setTimeout(loadConcepts, 2000);
      }
    }
    loadConcepts();
  </script>
</body>
</html>`;
}
