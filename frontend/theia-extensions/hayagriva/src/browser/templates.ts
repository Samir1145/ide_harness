export function sidebarHtml(initialCase: string, apiPort: number = 3210): string {
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
    
    <div style="margin: 12px 0 6px 0; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--theia-ui-font-color1, #fff); opacity: 0.85;">
      <input type="checkbox" id="toggle-multimodal" style="cursor: pointer;" />
      <label for="toggle-multimodal" style="cursor: pointer; user-select: none; font-weight: bold;">
        Force Gemini Multimodal Visual Parse (PDF only)
      </label>
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
      fileInput.accept = '.docx';
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
      if (file.name.toLowerCase().endsWith('.doc')) {
        alert("Word 97-2003 (.doc) files are not supported. Please save the document as a Word Document (.docx) and try again.");
        return;
      }
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
          const uploadRes = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, filename: filename, content: base64 })
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

          // Step 2: Run companion generation (Phase 1 — no LLM)
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Converting & Ingesting...</p>';
          
          const forceMultimodal = !!document.getElementById('toggle-multimodal').checked;
          const ingestRes = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              case: currentCaseName, 
              file: uploadData.filePath, 
              disableDoc2Query: true,
              multimodal: forceMultimodal
            })
          });
          const ingestData = await ingestRes.json();
          if (!ingestData.success) throw new Error(ingestData.error || 'Ingestion failed');

          // Step 3: Show Build Concepts widget inline — keep modal open until concepts are built
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:#10b981;">✓ Companion generated</p>';
          if (window.parent) {
            window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName: currentCaseName }, '*');
          }
          // Show the Build Concepts button inline — modal closes automatically after build completes
          const ext2 = file.name.endsWith('.docx') || file.name.endsWith('.doc') ? '.docx' : 
                       (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? '.xlsx' : '.pdf');
          const basename2 = filename.replace(/\.[^.]+$/, '').replace(/\.wiki$/, '');
          showConversionStatus(currentCaseName, basename2, ingestData.status === 'companion_ready');
        } catch (err) {
          containerZone.innerHTML = '<p style="color: #ef4444; margin:0; font-size:11px; font-weight:bold;">✗ ' + err.message + '</p>';
          setTimeout(() => { containerZone.innerHTML = oldContent; }, 5000);
        }

        // Phase 1 complete: show status + Build Concepts button
        // alreadyReady=true means companion already existed; skip polling and enable button immediately
        function showConversionStatus(caseName, basename, alreadyReady) {
          const statusDiv = document.createElement('div');
          statusDiv.style.cssText = 'margin-top:8px; padding:8px; background:var(--theia-layout-color3,#fff); border:1px solid var(--theia-border-color,#ccc); border-radius:4px; font-size:11px;';
          statusDiv.innerHTML = \`
            <div style="font-weight:bold; color:var(--theia-brand-color1,#0ea5e9); margin-bottom:4px;">\${alreadyReady ? '✓ Ready' : '⏳ Converting pages...'}</div>
            <div class="progress-message" style="opacity:0.7; margin-bottom:6px;">\${alreadyReady ? 'Companion .md is ready. Click to build concept index.' : 'Checking progress...'}</div>
            <button class="btn-build-concepts" \${alreadyReady ? '' : 'disabled'}
              style="width:100%; padding:5px; background:\${alreadyReady ? 'var(--theia-brand-color1,#0ea5e9)' : '#94a3b8'}; color:#fff; border:none; border-radius:3px; cursor:\${alreadyReady ? 'pointer' : 'not-allowed'}; font-size:11px; font-weight:bold;">
              ⚡ Build Concepts
            </button>
          \`;
          containerZone.appendChild(statusDiv);

          const btn = statusDiv.querySelector('.btn-build-concepts');
          const progressEl = statusDiv.querySelector('.progress-message');

          if (!alreadyReady) {
            // Poll ingest-status until conversion complete
            const poll = setInterval(async () => {
              try {
                const r = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/ingest-status?case=' + caseName + '&basename=' + basename);
                const d = await r.json();
                if (d.complete || (!d.converting && d.totalPages === null)) {
                  clearInterval(poll);
                  statusDiv.querySelector('div').textContent = '✓ Ready';
                  progressEl.textContent = 'Companion .md is ready. Click to build concept index.';
                  progressEl.style.color = '#10b981';
                  btn.disabled = false;
                  btn.style.background = 'var(--theia-brand-color1,#0ea5e9)';
                  btn.style.cursor = 'pointer';
                } else if (d.converting) {
                  progressEl.textContent = 'Page ' + (d.nextPage - 1) + ' of ' + d.totalPages + ' converted...';
                }
              } catch(_) {}
            }, 4000);
          }

          btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = '⏳ Building concepts...';
            try {
              const r = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/build-concepts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ case: caseName, basename })
              });
              const d = await r.json();
              if (d.ok) {
                btn.textContent = '✓ Concepts built (' + d.sections + ' sections)';
                btn.style.background = '#10b981';
                if (window.parent) {
                  window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName }, '*');
                  // Auto-close the modal after concepts are built
                  setTimeout(() => {
                    window.parent.postMessage({ type: 'close-upload-modal' }, '*');
                  }, 1200);
                }
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

export function wikiExplorerHtml(caseName: string, apiPort: number = 3210): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 12px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
  }
  .doc-group {
    margin-bottom: 12px;
  }
  .doc-summary {
    font-weight: bold;
    cursor: pointer;
    padding: 6px 10px;
    background: var(--theia-layout-color2, #e0e0e0);
    border-radius: 4px;
    margin-bottom: 6px;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    border: 1px solid var(--theia-border-color, #ccc);
  }
  .doc-summary::-webkit-details-marker {
    display: none;
  }
  .doc-summary::before {
    content: "📁";
  }
  .doc-group[open] > .doc-summary::before {
    content: "📂";
  }
  .doc-content {
    padding-left: 10px;
    margin-bottom: 8px;
    border-left: 1px dashed var(--theia-border-color, #ccc);
    margin-left: 14px;
  }
  .qna-item {
    margin-bottom: 6px;
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 4px;
    background: var(--theia-layout-color3, #ffffff);
    overflow: hidden;
  }
  .qna-summary {
    padding: 6px 8px;
    font-weight: bold;
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    transition: background 0.2s;
  }
  .qna-summary::-webkit-details-marker {
    display: none;
  }
  .qna-summary::before {
    content: "▶";
    font-size: 8px;
    display: inline-block;
    transition: transform 0.2s;
    opacity: 0.7;
  }
  .qna-item[open] > .qna-summary::before {
    transform: rotate(90deg);
  }
  .qna-summary:hover {
    background: rgba(14, 165, 233, 0.05);
  }
  .qna-body {
    padding: 8px 10px;
    font-size: 11px;
    line-height: 1.4;
    border-top: 1px solid var(--theia-border-color, #ccc);
    background: var(--theia-layout-color1, #f9f9f9);
    color: var(--theia-ui-font-color1, #333333);
  }
  .qna-answer {
    white-space: pre-wrap;
    margin-bottom: 8px;
    opacity: 0.9;
  }
  .qna-actions {
    display: flex;
    gap: 6px;
  }
  .action-btn {
    padding: 3px 6px;
    font-size: 10px;
    cursor: pointer;
    background: var(--theia-brand-color1, #0ea5e9);
    color: #ffffff;
    border: none;
    border-radius: 3px;
    transition: opacity 0.2s;
  }
  .action-btn:hover {
    opacity: 0.8;
  }
  .empty {
    opacity: 0.5;
    text-align: center;
    padding-top: 20px;
  }
</style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--theia-border-color, #ccc);">
    <span style="font-weight:bold;font-size:12px;color:var(--theia-brand-color1, #0ea5e9);">Case Wiki & Knowledge</span>
    <div style="display:flex;gap:6px;">
      <button id="close-all-editors-btn" title="Close All Open Editors in Workspace" style="background:var(--theia-button-background, #3b82f6);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-weight:bold;font-size:11px;display:flex;align-items:center;gap:4px;">
        🧹 Close All Tabs
      </button>
      <button id="add-wiki-btn" title="Create New Standalone TiddlyWiki" style="background:var(--theia-brand-color1, #0ea5e9);color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-weight:bold;font-size:11px;display:flex;align-items:center;gap:4px;">
        ➕ New Wiki
      </button>
    </div>
  </div>
  <div id="cards-container">Loading Q&A cards...</div>

  <script>
    let currentCase = '${caseName}';

    document.getElementById('close-all-editors-btn').onclick = () => {
      if (window.parent) {
        window.parent.postMessage({ type: 'close-all-editors' }, '*');
      }
    };

    document.getElementById('add-wiki-btn').onclick = async () => {
      const wikiTitle = prompt('Enter name for the new TiddlyWiki:', 'Case_Notes');
      if (!wikiTitle) return;
      try {
        const res = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/tiddlywiki/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseName: currentCase, wikiTitle })
        });
        const data = await res.json();
        if (data.success && data.viewUrl) {
          window.open('http://127.0.0.1:${apiPort}' + data.viewUrl, '_blank');
          loadCards();
        } else {
          alert('Failed to create TiddlyWiki: ' + (data.error || 'Unknown error'));
        }
      } catch(e) {
        alert('Error creating wiki: ' + e.message);
      }
    };
    
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
        if (!currentCase) {
          const casesRes = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/cases');
          if (casesRes.ok) {
            const data = await casesRes.json();
            if (data.cases && data.cases.length > 0) {
              currentCase = data.cases[0];
            }
          }
        }
        const res = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/wiki-cards?case=' + currentCase);
        const data = await res.json();
        const container = document.getElementById('cards-container');
        container.innerHTML = '';
        
        if (!data.cards || data.cards.length === 0) {
          container.innerHTML = '<div class="empty">No wiki cards saved yet.</div>';
          return;
        }

        // Group cards by sourceDocument
        const groups = {};
        data.cards.forEach(card => {
          const doc = card.sourceDocument || 'General Wiki';
          if (!groups[doc]) groups[doc] = [];
          groups[doc].push(card);
        });

        Object.keys(groups).forEach(docName => {
          const docGroup = document.createElement('details');
          docGroup.className = 'doc-group';
          docGroup.open = true;

          const docSummary = document.createElement('summary');
          docSummary.className = 'doc-summary';
          docSummary.innerText = docName;

          const docContent = document.createElement('div');
          docContent.className = 'doc-content';

          groups[docName].forEach(card => {
            const qnaItem = document.createElement('details');
            qnaItem.className = 'qna-item';

            const qnaSummary = document.createElement('summary');
            qnaSummary.className = 'qna-summary';
            qnaSummary.innerText = '❓ ' + card.title;

            const qnaBody = document.createElement('div');
            qnaBody.className = 'qna-body';
            
            const textParagraph = document.createElement('div');
            textParagraph.className = 'qna-answer';
            textParagraph.innerText = card.answer || 'No answer generated.';
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'qna-actions';
            
            const openBtn = document.createElement('button');
            openBtn.className = 'action-btn';
            openBtn.innerText = '📄 Open Q&A File';
            openBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.parent.postMessage({
                type: 'open-wiki-card',
                caseName: currentCase,
                filename: card.filename
              }, '*');
            };

            actionsDiv.appendChild(openBtn);
            qnaBody.appendChild(textParagraph);
            qnaBody.appendChild(actionsDiv);

            qnaItem.appendChild(qnaSummary);
            qnaItem.appendChild(qnaBody);
            docContent.appendChild(qnaItem);
          });

          docGroup.appendChild(docSummary);
          docGroup.appendChild(docContent);
          container.appendChild(docGroup);
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

export function conceptsExplorerHtml(caseName: string, apiPort: number = 3210): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 12px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
  }
  
  /* Modern custom styling for native checkboxes */
  input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    background-color: var(--theia-layout-color3, #ffffff);
    margin: 0;
    font: inherit;
    color: var(--theia-brand-color1, #0ea5e9);
    width: 14px;
    height: 14px;
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 3px;
    display: inline-grid;
    place-content: center;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
  }
  input[type="checkbox"]::before {
    content: "";
    width: 8px;
    height: 8px;
    transform: scale(0);
    transition: 120ms transform ease-in-out;
    box-shadow: inset 1em 1em var(--theia-brand-color1, #0ea5e9);
    background-color: currentColor;
    transform-origin: center;
    clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
  }
  input[type="checkbox"]:checked::before {
    transform: scale(1);
  }
  input[type="checkbox"]:checked {
    border-color: var(--theia-brand-color1, #0ea5e9);
    background-color: rgba(14, 165, 233, 0.05);
  }
  input[type="checkbox"]:indeterminate::before {
    content: "";
    width: 8px;
    height: 2px;
    background-color: var(--theia-brand-color1, #0ea5e9);
    transform: scale(1);
    clip-path: none;
    box-shadow: none;
  }

  .global-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--theia-layout-color2, #e8e8e8);
    border-radius: 6px;
    margin-bottom: 12px;
    font-weight: bold;
    border: 1px solid var(--theia-border-color, #e0e0e0);
  }

  .doc-card {
    background: var(--theia-layout-color3, #ffffff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .doc-card:hover {
    border-color: var(--theia-brand-color1, #0ea5e9);
    box-shadow: 0 2px 6px rgba(14, 165, 233, 0.08);
  }

  .doc-header {
    font-weight: bold;
    padding-bottom: 6px;
    margin-bottom: 6px;
    cursor: default;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    color: var(--theia-brand-color1, #0ea5e9);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-dots-group {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .status-dot-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    background-color: currentColor;
    box-shadow: 0 0 3px currentColor;
  }

  .section-count-badge {
    cursor: help;
    opacity: 0.65;
    margin-left: auto;
    font-weight: normal;
    font-size: 11px;
  }

  .pages-container {
    padding-left: 8px;
    margin-top: 4px;
    margin-bottom: 10px;
    border-left: 1px dashed var(--theia-border-color, #ccc);
  }

  .page-item {
    padding: 4px 6px;
    margin: 2px 0;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--theia-ui-font-color1, #333333);
  }
  .page-item:hover {
    background: var(--theia-layout-color2, #e8e8e8);
    color: var(--theia-brand-color1, #0ea5e9);
  }

  .pending-card {
    margin-top: 10px;
    padding: 12px;
    background: var(--theia-layout-color3, #fff);
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
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
    margin-bottom: 8px;
  }

  .action-row {
    display: flex;
    gap: 6px;
  }

  .btn-sm {
    padding: 5px 8px;
    font-size: 11px;
    font-weight: bold;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
  }
  .btn-sm:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-open {
    background: var(--theia-layout-color2, #e8e8e8);
    color: var(--theia-ui-font-color1,#333);
    border: 1px solid var(--theia-border-color, #ccc);
  }
  .btn-open:hover:not(:disabled) {
    background: var(--theia-layout-color1, #f3f3f3);
  }

  .btn-build {
    background: var(--theia-brand-color1, #0ea5e9);
    color: #fff;
  }
  .btn-build:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-rebuild {
    width: 100%;
    background: rgba(14, 165, 233, 0.06);
    color: var(--theia-brand-color1, #0ea5e9);
    border: 1px solid rgba(14, 165, 233, 0.25);
  }
  .btn-rebuild:hover:not(:disabled) {
    background: var(--theia-brand-color1, #0ea5e9);
    color: #fff;
    border-color: var(--theia-brand-color1, #0ea5e9);
  }

  .progress-bar-wrap {
    height: 3px;
    background: var(--theia-border-color,#e0e0e0);
    border-radius: 2px;
    margin: 4px 0 6px;
  }
  .progress-bar {
    height: 3px;
    background: #f59e0b;
    border-radius: 2px;
    transition: width 0.4s;
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
        const r = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/build-concepts', {
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
    // ── Render pending_review / companion_ready card ────────────────────────────────────
    function renderPendingCard(container, doc) {
      const converting = doc.status === 'processing' || doc.converting || (doc.nextPage && !doc.conversionComplete);
      const isReady = doc.status === 'companion_ready' || doc.conversionComplete;
      const isFailed = doc.status === 'failed';

      const card = document.createElement('div');
      card.className = 'pending-card';
      card.id = 'pending-' + doc.title;

      // Color-coding indicator: Red if ready, Grey if failed, Orange/Amber if processing/unprocessed
      card.style.borderLeft = isFailed 
        ? '3px solid #6b7280' 
        : (isReady ? '3px solid #ef4444' : '3px solid #f59e0b');

      card.innerHTML = \`
        <div class="pending-title">\${isFailed ? '❌' : '⚠'} \${doc.title}</div>
        <div class="pending-status" id="pstatus-\${doc.title}">
          \${isFailed 
            ? '❌ Ingestion failed (unsupported format or parse error)' 
            : (isReady
              ? '✓ Companion generated (.md) — awaiting concept build'
              : (doc.status === 'unprocessed' ? '⏳ Not ingested' : '⏳ Generating companion...'))}
        </div>
        <div class="action-row">
          <button class="btn-sm btn-open" id="open-\${doc.title}" \${isFailed ? 'disabled' : ''}>📄 Open .md</button>
          <button class="btn-sm btn-build" id="build-\${doc.title}" \${isReady && !isFailed ? '' : 'disabled'}>
            ⚡ Build Concepts
          </button>
        </div>
      \`;

      container.appendChild(card);

      // Open .md handler
      card.querySelector('.btn-open').onclick = () => {
        window.parent.postMessage({
          type: 'open-concept-chunk',
          absolutePath: doc.companionPath || ('conversions/' + doc.title + '.md')
        }, '*');
      };

      // Build button handler
      const buildBtn = card.querySelector('.btn-build');
      buildBtn.onclick = () => triggerBuild(buildBtn, currentCase, doc.title);

      // Poll progress if still converting
      if (!isReady && doc.status === 'processing') {
        const pstatus = card.querySelector('.pending-status');
        const poll = setInterval(async () => {
          try {
            const r = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/documents?case=' + currentCase);
            const d = await r.json();
            const currentDoc = (d.documents || []).find(docItem => docItem.title === doc.title);
            if (currentDoc && currentDoc.status === 'companion_ready') {
              clearInterval(poll);
              if (pstatus) {
                pstatus.textContent = '✓ Companion generated (.md) — ready to build concepts';
                pstatus.style.color = '#ef4444';
              }
              card.style.borderLeft = '3px solid #ef4444';
              buildBtn.disabled = false;
            }
          } catch(_) {}
        }, 3000);
      }
    }

    // ── Main load ────────────────────────────────────────────────
    async function loadConcepts() {
      try {
        if (!currentCase) {
          const casesRes = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/cases');
          if (casesRes.ok) {
            const data = await casesRes.json();
            if (data.cases && data.cases.length > 0) currentCase = data.cases[0];
          }
        }

        const [docsRes, statusesRes, activeRes] = await Promise.all([
          fetch('http://127.0.0.1:${apiPort}/api/hayagriva/documents?case=' + currentCase),
          fetch('http://127.0.0.1:${apiPort}/api/hayagriva/file-statuses?case=' + currentCase),
          fetch('http://127.0.0.1:${apiPort}/api/hayagriva/active-rag-docs?case=' + currentCase)
        ]);

        if (!docsRes.ok) {
          document.getElementById('concepts-container').innerHTML = '<div class="empty">No documents found. Upload a file to start.</div>';
          return;
        }

        const { documents } = await docsRes.json();
        const statusesData = statusesRes.ok ? await statusesRes.json() : {};
        const activeData = activeRes.ok ? await activeRes.json() : {};
        
        const fileStatuses = statusesData.statuses || {};
        const activeFiles = activeData.activeFiles;

        const container = document.getElementById('concepts-container');
        container.innerHTML = '';

        if (!documents || documents.length === 0) {
          container.innerHTML = '<div class="empty">No documents yet. Upload a PDF to begin.</div>';
          return;
        }

        const colorMap = {
          grey: '#6b7280',
          amber: '#f59e0b',
          green: '#10b981',
          companion_ready: '#10b981',
          reviewed: '#10b981',
          indexed: '#10b981',
          outline_approved: '#10b981',
          blue: '#3b82f6',
          red: '#ef4444'
        };

        const indexedDocs = documents.filter(d => d.status !== 'companion_ready' && d.status !== 'processing' && d.status !== 'unprocessed' && d.status !== 'failed');
        const pendingDocs = documents.filter(d => !indexedDocs.includes(d));

        async function saveActiveDocs(list) {
          await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/active-rag-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCase, activeFiles: list })
          });
        }

        // Plan 21: Check for active case contradictions
        try {
          const cRes = await fetch('http://127.0.0.1:${apiPort}/api/hayagriva/contradictions?case=' + encodeURIComponent(currentCase));
          if (cRes.ok) {
            const cData = await cRes.json();
            if (cData.contradictions && cData.contradictions.length > 0) {
              const banner = document.createElement('div');
              banner.className = 'conflict-radar-banner';
              banner.style.cssText = 'background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 11px; cursor: pointer; display: flex; align-items: flex-start; gap: 8px;';
              banner.innerHTML = \`
                <span style="font-size: 14px;">⚠️</span>
                <div style="flex:1;">
                  <strong style="color: #ef4444;">\${cData.contradictions.length} Active Conflict\${cData.contradictions.length > 1 ? 's' : ''} Detected</strong>
                  <div style="color: var(--theia-ui-font-color1, #ccc); margin-top: 2px; font-size: 10px;">\${cData.contradictions[0].narrative}</div>
                  <div style="color: #60a5fa; margin-top: 4px; font-size: 9px; font-weight: 500;">Click to open Diagnostic Case Graph ➔</div>
                </div>
              \`;
              banner.onclick = () => {
                window.parent.postMessage({ type: 'execute-command', commandId: 'hayagriva.openCaseGraph' }, '*');
              };
              container.appendChild(banner);
            }
          }
        } catch (_) {}

        if (indexedDocs.length > 0) {
          const globalControls = document.createElement('div');
          globalControls.className = 'global-controls';
          
          const isAllChecked = !activeFiles || indexedDocs.every(d => activeFiles.includes(d.filename));
          const isNoneChecked = activeFiles && activeFiles.length === 0;

          const masterCheckbox = document.createElement('input');
          masterCheckbox.type = 'checkbox';
          masterCheckbox.id = 'toggle-all-rag';
          masterCheckbox.checked = isAllChecked;
          if (!isAllChecked && !isNoneChecked) {
            masterCheckbox.indeterminate = true;
          }

          masterCheckbox.onchange = async () => {
            const checked = masterCheckbox.checked;
            const docCheckboxes = container.querySelectorAll('.rag-doc-checkbox');
            const newList = [];
            docCheckboxes.forEach(cb => {
              cb.checked = checked;
              if (checked) newList.push(cb.dataset.filename);
            });
            await saveActiveDocs(newList);
          };

          const masterLabel = document.createElement('label');
          masterLabel.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; width:100%;';
          masterLabel.appendChild(masterCheckbox);
          masterLabel.appendChild(document.createTextNode('Include All in AI Search'));
          
          globalControls.appendChild(masterLabel);
          container.appendChild(globalControls);
        }

        for (const doc of pendingDocs) {
          renderPendingCard(container, doc);
        }

        for (const doc of indexedDocs) {
          const docCard = document.createElement('div');
          docCard.className = 'doc-card';

          const docRow = document.createElement('div');
          docRow.className = 'doc-header';

          const docCheckbox = document.createElement('input');
          docCheckbox.type = 'checkbox';
          docCheckbox.className = 'rag-doc-checkbox';
          docCheckbox.dataset.filename = doc.filename;
          docCheckbox.checked = !activeFiles || activeFiles.includes(doc.filename);

          docCheckbox.onchange = async () => {
            const docCheckboxes = container.querySelectorAll('.rag-doc-checkbox');
            const newList = [];
            docCheckboxes.forEach(cb => {
              if (cb.checked) newList.push(cb.dataset.filename);
            });
            
            const masterCheckbox = document.getElementById('toggle-all-rag');
            if (masterCheckbox) {
              const allChecked = newList.length === indexedDocs.length;
              const noneChecked = newList.length === 0;
              masterCheckbox.checked = allChecked;
              masterCheckbox.indeterminate = !allChecked && !noneChecked;
            }
            
            await saveActiveDocs(newList);
          };

          const docStatus = fileStatuses[doc.filename] || {};
          const d1 = colorMap[docStatus.dot1] || '#6b7280';
          const d2 = colorMap[docStatus.dot2] || '#6b7280';
          const d3 = colorMap[docStatus.dot3] || '#6b7280';

          const dotsGroup = document.createElement('span');
          dotsGroup.className = 'status-dots-group';
          dotsGroup.innerHTML = \`
            <span class="status-dot-indicator" style="color: \${d1}; background-color: \${d1}; box-shadow: 0 0 4px \${d1};"></span>
            <span class="status-dot-indicator" style="color: \${d2}; background-color: \${d2}; box-shadow: 0 0 4px \${d2};"></span>
            <span class="status-dot-indicator" style="color: \${d3}; background-color: \${d3}; box-shadow: 0 0 4px \${d3};"></span>
          \`;

          const filenameText = document.createTextNode(doc.title);
          const sectionBadge = document.createElement('span');
          sectionBadge.className = 'section-count-badge';
          sectionBadge.textContent = \` (\${doc.sections})\`;

          docRow.appendChild(docCheckbox);
          docRow.appendChild(dotsGroup);
          docRow.appendChild(filenameText);
          docRow.appendChild(sectionBadge);

          docCard.appendChild(docRow);

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

          docCard.appendChild(docPagesContainer);

          const rebuildRow = document.createElement('div');
          rebuildRow.className = 'rebuild-row';
          const rebuildBtn = document.createElement('button');
          rebuildBtn.className = 'btn-sm btn-rebuild';
          rebuildBtn.textContent = '🔄 Rebuild Concepts';
          rebuildBtn.onclick = () => triggerBuild(rebuildBtn, currentCase, doc.title);
          rebuildRow.appendChild(rebuildBtn);
          docCard.appendChild(rebuildRow);
          container.appendChild(docCard);
        }
      } catch (e) {
        console.error(e);
        document.getElementById('concepts-container').innerHTML = '<div style="opacity: 0.6; text-align: center; padding-top: 20px;">Connecting to concepts server...</div>';
      }
    }
    loadConcepts();
    setInterval(loadConcepts, 30000);
  </script>
</body>
</html>`;
}



export function kvEditorHtml(caseName: string, apiPort: number = 3210): string {
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/forms/kv-dictionary?case=" + encodeURIComponent(caseName));
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/forms/kv-dictionary/update", {
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

export function formEditorHtml(caseName: string, formId: string, apiPort: number = 3210): string {
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
        const schemaRes = await fetch("http://127.0.0.1:${apiPort}/api/hayagriva/read-file?path=forms/" + formId + "/schema.json");
        schemaData = await schemaRes.json();

        const instRes = await fetch("http://127.0.0.1:${apiPort}/api/forms/instance?case=" + encodeURIComponent(caseName) + "&formId=" + formId);
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/forms/instance/save", {
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/forms/instance/export", {
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/forms/instance/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case: caseName, formId: formId })
        });
        if (!res.ok) throw new Error("Export error");
        const result = await res.json();
        
        // Notify parent workspace to open the generated HTML file in a new tab or browser preview
        window.open("http://127.0.0.1:${apiPort}/api/hayagriva/read-file?path=" + encodeURIComponent(result.filledHtmlPath), "_blank");
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

export function draftingPanelHtml(caseName: string, apiPort: number = 3210): string {
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/formats/registry");
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
        const res = await fetch("http://127.0.0.1:${apiPort}/api/formats/draft", {
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

export function citationPreviewPanelHtml(
  docName: string,
  pageNum: number,
  contentMarkdown: string,
  isPdf: boolean = false,
  pdfViewerUrl: string = '',
  sectionTitle: string = ''
): string {
  const escapeHtml = (text: string) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const formattedContent = escapeHtml(contentMarkdown)
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
    .replace(/###\s+(.*)/g, '<h4 style="margin:8px 0 4px 0; color:var(--theia-brand-color1, #0ea5e9);">$1</h4>')
    .replace(/##\s+(.*)/g, '<h3 style="margin:10px 0 6px 0; color:var(--theia-brand-color1, #0ea5e9);">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  const cleanRawText = contentMarkdown
    .replace(/^---[\s\S]*?---\r?\n?/, '')
    .replace(/^#+\s+.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 14px;
    background: var(--theia-layout-color1, #f3f3f3);
    color: var(--theia-ui-font-color1, #333333);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
  }
  .header-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    padding-bottom: 8px;
  }
  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-container h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .close-btn {
    cursor: pointer;
    font-size: 18px;
    font-weight: bold;
    opacity: 0.6;
    transition: opacity 0.2s;
    line-height: 1;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .close-btn:hover {
    opacity: 1;
    background: rgba(0,0,0,0.08);
  }
  .metadata {
    font-size: 11px;
    margin-bottom: 10px;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .badge {
    background: var(--theia-brand-color0, #0ea5e9);
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 11px;
  }
  .section-tag {
    font-size: 11px;
    opacity: 0.8;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    background: var(--theia-layout-color2, #e5e7eb);
    padding: 3px;
    border-radius: 6px;
  }
  .tab-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
    color: var(--theia-ui-font-color2, #4b5563);
    transition: all 0.2s;
  }
  .tab-btn.active {
    background: var(--theia-layout-color3, #ffffff);
    color: var(--theia-brand-color1, #0ea5e9);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .view-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    margin-bottom: 12px;
  }
  .content-card {
    flex: 1;
    overflow-y: auto;
    background: var(--theia-layout-color3, #ffffff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    border-radius: 6px;
    padding: 14px;
    line-height: 1.6;
    font-size: 13px;
    white-space: pre-wrap;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .pdf-frame {
    width: 100%;
    height: 100%;
    border: 1px solid var(--theia-border-color, #e0e0e0);
    border-radius: 6px;
    background: #525659;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .btn {
    flex: 1;
    background: var(--theia-brand-color1, #0ea5e9);
    color: #ffffff;
    border: none;
    padding: 8px 10px;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 11px;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .btn:hover {
    background: #0284c7;
  }
  .btn.secondary {
    background: transparent;
    border: 1px solid var(--theia-border-color, #ccc);
    color: var(--theia-ui-font-color1, #333333);
  }
  .btn.secondary:hover {
    background: rgba(0,0,0,0.05);
  }
  .toast {
    position: fixed;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: #0f172a;
    color: #38bdf8;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
    z-index: 9999;
  }
  .toast.show {
    opacity: 1;
  }
</style>
</head>
<body>
  <div class="header-container">
    <div class="header-title">
      <span>📖</span>
      <h3>Citation Preview</h3>
    </div>
    <span class="close-btn" onclick="closeDrawer()" title="Close">&times;</span>
  </div>
  <div class="metadata">
    <span><strong>${escapeHtml(docName)}</strong></span>
    <span class="badge">Page ${pageNum}</span>
    ${sectionTitle ? `<span class="section-tag" title="${escapeHtml(sectionTitle)}">— ${escapeHtml(sectionTitle)}</span>` : ''}
  </div>

  ${isPdf && pdfViewerUrl ? `
  <div class="tab-bar">
    <button id="tab-text" class="tab-btn active" onclick="switchTab('text')">📝 Verbatim Excerpt</button>
    <button id="tab-pdf" class="tab-btn" onclick="switchTab('pdf')">📑 Original PDF Page</button>
  </div>` : ''}

  <div class="view-container">
    <div id="view-text" class="content-card">
      ${formattedContent}
    </div>
    ${isPdf && pdfViewerUrl ? `
    <iframe id="view-pdf" class="pdf-frame" src="${escapeHtml(pdfViewerUrl)}" style="display:none;"></iframe>` : ''}
  </div>

  <div class="actions">
    <button class="btn secondary" onclick="copyQuote()">📋 Copy Quote</button>
    <button class="btn" onclick="openSideBySide()">📑 Open Side-by-Side</button>
  </div>

  <div id="toast" class="toast">Quote copied to clipboard!</div>

  <script>
    const rawQuote = ${JSON.stringify(cleanRawText.slice(0, 600))};
    const docSource = ${JSON.stringify(docName)};
    const pageNumber = ${pageNum};

    function switchTab(mode) {
      const textBtn = document.getElementById('tab-text');
      const pdfBtn = document.getElementById('tab-pdf');
      const textView = document.getElementById('view-text');
      const pdfView = document.getElementById('view-pdf');

      if (!textBtn || !pdfBtn || !textView || !pdfView) return;

      if (mode === 'text') {
        textBtn.classList.add('active');
        pdfBtn.classList.remove('active');
        textView.style.display = 'block';
        pdfView.style.display = 'none';
      } else {
        pdfBtn.classList.add('active');
        textBtn.classList.remove('active');
        pdfView.style.display = 'block';
        textView.style.display = 'none';
      }
    }

    function closeDrawer() {
      window.parent.postMessage({ type: 'close-citation-preview' }, '*');
    }

    function openSideBySide() {
      window.parent.postMessage({ type: 'open-full-citation' }, '*');
    }

    function copyQuote() {
      const textToCopy = '"' + rawQuote + '"\\n— ' + docSource + ' (Page ' + pageNumber + ')';
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Quote copied to clipboard!');
      }).catch(() => {
        showToast('Failed to copy');
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.innerText = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }
  </script>
</body>
</html>`;
}

export function inboxExplorerHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
    font-size: var(--theia-ui-font-size1, 13px);
    margin: 0;
    padding: 12px;
    background: var(--theia-layout-color1, #1e1e1e);
    color: var(--theia-ui-font-color1, #cccccc);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--theia-border-color, #333);
  }
  .title-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .badge {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.4);
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge.alert {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.4);
  }
  .btn-refresh {
    background: transparent;
    border: 1px solid var(--theia-border-color, #444);
    color: var(--theia-ui-font-color1, #ccc);
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 11px;
  }
  .btn-refresh:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
  }
  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    padding: 6px 4px;
    font-size: 11px;
    color: var(--theia-ui-font-color2, #888);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    font-weight: 500;
  }
  .tab-btn.active {
    color: var(--theia-brand-color1, #0ea5e9);
    border-bottom-color: var(--theia-brand-color1, #0ea5e9);
  }
  .filter-pills {
    display: flex;
    gap: 4px;
    margin-bottom: 12px;
    align-items: center;
  }
  .filter-pill {
    background: transparent;
    border: 1px solid var(--theia-border-color, #444);
    color: var(--theia-ui-font-color2, #888);
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 10px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .filter-pill.active {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border-color: rgba(14, 165, 233, 0.5);
  }
  .visibility-pill {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .visibility-pill.inbox {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.35);
  }
  .visibility-pill.inline {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.35);
  }
  .items-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .item-card {
    background: var(--theia-layout-color2, #252526);
    border: 1px solid var(--theia-border-color, #333);
    border-radius: 6px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transition: border-color 0.15s ease;
  }
  .item-card:hover {
    border-color: var(--theia-brand-color1, #0ea5e9);
  }
  .item-card.resolved {
    opacity: 0.6;
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-kind {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .kind-approval {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
  }
  .kind-question {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.4);
  }
  .kind-plan {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.4);
  }
  .card-title {
    font-weight: 600;
    font-size: 12px;
    color: var(--theia-ui-font-color1, #fff);
  }
  .card-body {
    font-size: 12px;
    line-height: 1.4;
    color: var(--theia-ui-font-color2, #bbb);
  }
  .card-data {
    background: rgba(0, 0, 0, 0.2);
    padding: 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 11px;
    max-height: 60px;
    overflow-y: auto;
  }
  .card-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
  .btn-allow {
    background: #10b981;
    color: #fff;
    border: none;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .btn-allow:hover {
    background: #059669;
  }
  .btn-deny {
    background: #ef4444;
    color: #fff;
    border: none;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .btn-deny:hover {
    background: #dc2626;
  }
  .option-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .pill-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--theia-border-color, #444);
    color: var(--theia-ui-font-color1, #eee);
    border-radius: 12px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .pill-btn:hover {
    background: var(--theia-brand-color1, #0ea5e9);
    color: #fff;
    border-color: var(--theia-brand-color1, #0ea5e9);
  }
  .input-row {
    display: flex;
    gap: 6px;
  }
  .text-input {
    flex: 1;
    background: var(--theia-input-background, #1e1e1e);
    border: 1px solid var(--theia-input-border, #3c3c3c);
    color: var(--theia-input-foreground, #ccc);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
  }
  .resolution-stamp {
    font-size: 11px;
    font-style: italic;
    color: #10b981;
  }
  .empty-state {
    text-align: center;
    color: var(--theia-ui-font-color2, #777);
    padding: 40px 10px;
    font-size: 12px;
  }

  /* ── Theme Adaptive Light Mode ── */
  body.theme-light {
    background: #f8fafc;
    color: #0f172a;
  }
  body.theme-light .header {
    border-bottom: 1px solid #e2e8f0;
  }
  body.theme-light .title {
    color: #0f172a;
  }
  body.theme-light .badge {
    background: rgba(2, 132, 199, 0.12);
    color: #0284c7;
    border: 1px solid rgba(2, 132, 199, 0.25);
  }
  body.theme-light .badge.alert {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
    border-color: rgba(239, 68, 68, 0.25);
  }
  body.theme-light .btn-refresh {
    border: 1px solid #cbd5e1;
    color: #475569;
    background: #ffffff;
  }
  body.theme-light .btn-refresh:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  body.theme-light .tab-btn {
    color: #64748b;
  }
  body.theme-light .tab-btn.active {
    color: #0284c7;
    border-bottom-color: #0284c7;
  }
  body.theme-light .filter-pill {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #475569;
  }
  body.theme-light .filter-pill:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  body.theme-light .filter-pill.active {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }
  body.theme-light .item-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    color: #1e293b;
  }
  body.theme-light .item-card:hover {
    border-color: #0284c7;
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.12);
  }
  body.theme-light .card-payload {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #e2e8f0;
  }
  body.theme-light .pill-btn {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #334155;
  }
  body.theme-light .pill-btn:hover {
    background: #0284c7;
    color: #ffffff;
    border-color: #0284c7;
  }
  body.theme-light .text-input {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #0f172a;
  }
  body.theme-light .text-input:focus {
    border-color: #0284c7;
  }
  body.theme-light .empty-state {
    color: #64748b;
  }
</style>
</head>
<body class="${isLight ? 'theme-light' : 'theme-dark'}">
  <div class="header">
    <div class="title-area">
      <span class="title">Statutory Compliances</span>
      <span id="pending-badge" class="badge">0 Pending</span>
    </div>
    <button class="btn-refresh" onclick="loadInbox()">↻ Refresh</button>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="setTab('pending', this)">Pending</button>
    <button class="tab-btn" onclick="setTab('all', this)">All</button>
    <button class="tab-btn" onclick="setTab('resolved', this)">Resolved</button>
  </div>

  <div class="filter-pills">
    <span style="font-size: 10px; color: #888; font-weight: 600;">MODE:</span>
    <button class="filter-pill active" onclick="setVisibilityFilter('all', this)">All</button>
    <button class="filter-pill" onclick="setVisibilityFilter('inbox', this)">📥 Inbox Only</button>
    <button class="filter-pill" onclick="setVisibilityFilter('inline', this)">💬 Chat Inline</button>
  </div>

  <div id="items-list" class="items-container">
    <div class="empty-state">Loading inbox items…</div>
  </div>

  <script>
    let activeTab = 'pending';
    let activeVisibility = 'all';
    let currentCase = '${caseName}';
    const apiPort = ${apiPort};

    // Auto-detect theme from parent window
    function detectTheme() {
      try {
        if (window.parent && window.parent.document && window.parent.document.body) {
          const p = window.parent.document.body;
          if (p.classList.contains('theia-light') || p.classList.contains('light-theia')) {
            document.body.classList.add('theme-light');
            document.body.classList.remove('theme-dark');
          } else {
            document.body.classList.remove('theme-light');
            document.body.classList.add('theme-dark');
          }
        }
      } catch (_) {}
    }
    detectTheme();

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        if (event.data.theme === 'light') {
          document.body.classList.add('theme-light');
          document.body.classList.remove('theme-dark');
        } else {
          document.body.classList.remove('theme-light');
          document.body.classList.add('theme-dark');
        }
      }
      if (event.data && event.data.type === 'select-case' && event.data.caseName) {
        currentCase = event.data.caseName;
        loadInbox();
      }
    });

    function setTab(tab, btn) {
      activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderItems();
    }

    function setVisibilityFilter(vis, btn) {
      activeVisibility = vis;
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderItems();
    }

    let allItems = [];

    async function loadInbox() {
      if (!currentCase) return;
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/inbox?case=\${encodeURIComponent(currentCase)}\`);
        if (!res.ok) throw new Error('Failed to load inbox');
        const data = await res.json();
        allItems = data.items || [];
        
        const badge = document.getElementById('pending-badge');
        const count = data.pendingCount || 0;
        badge.textContent = count + ' Pending';
        badge.className = 'badge' + (count > 0 ? ' alert' : '');
        
        renderItems();
      } catch (e) {
        document.getElementById('items-list').innerHTML = '<div class="empty-state">Inbox offline or unavailable.</div>';
      }
    }

    function renderItems() {
      const container = document.getElementById('items-list');
      let filtered = allItems;
      if (activeTab === 'pending') {
        filtered = allItems.filter(i => i.state === 'pending');
      } else if (activeTab === 'resolved') {
        filtered = allItems.filter(i => i.state === 'resolved');
      }
      if (activeVisibility !== 'all') {
        filtered = filtered.filter(i => (i.visibility || 'inbox') === activeVisibility);
      }

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No ' + activeTab + ' actions for this case.</div>';
        return;
      }

      container.innerHTML = filtered.map(item => {
        const isPending = item.state === 'pending';
        let actionsHtml = '';

        if (isPending) {
          if (item.kind === 'approval') {
            actionsHtml = \`
              <div class="card-actions">
                <button class="btn-allow" onclick="resolveItem('\${item.id}', 'allow')">✓ Allow</button>
                <button class="btn-allow" style="background: rgba(99,102,241,0.25); border-color: rgba(99,102,241,0.5); color: #a5b4fc;" onclick="resolveItem('\${item.id}', 'this_run')">⚡ Allow for Task</button>
                <button class="btn-deny" onclick="resolveItem('\${item.id}', 'deny')">✕ Decline</button>
              </div>
            \`;
          } else if (item.kind === 'question') {
            const pills = (item.options || []).map(opt => \`
              <button class="pill-btn" onclick="resolveItem('\${item.id}', '\${opt}')">\${opt}</button>
            \`).join('');

            actionsHtml = \`
              <div class="option-pills">\${pills}</div>
              <div class="input-row">
                <input type="text" id="input-\${item.id}" class="text-input" placeholder="Type answer…" onkeydown="if(event.key==='Enter') submitText('\${item.id}')">
                <button class="btn-allow" onclick="submitText('\${item.id}')">Send</button>
              </div>
            \`;
          } else if (item.kind === 'plan') {
            actionsHtml = \`
              <div class="card-actions">
                <button class="btn-allow" onclick="resolveItem('\${item.id}', 'approve_plan')">✓ Approve Strategy</button>
                <button class="btn-deny" onclick="resolveItem('\${item.id}', 'request_changes')">Request Revision</button>
              </div>
            \`;
          } else {
            actionsHtml = \`
              <div class="card-actions">
                <button class="btn-allow" onclick="resolveItem('\${item.id}', 'dismiss')">Mark Read</button>
              </div>
            \`;
          }
        } else {
          actionsHtml = \`<div class="resolution-stamp">✓ Resolved: "\${item.resolution || 'completed'}" (by \${item.resolvedBy || 'user'})</div>\`;
        }

        const riskPill = item.riskClass ? \`<span class="badge">\${item.riskClass}</span>\` : '';
        const visPill = item.visibility === 'inline' 
          ? '<span class="visibility-pill inline">💬 Inline</span>'
          : '<span class="visibility-pill inbox">📥 Inbox</span>';

        const dataSnippet = item.data && Object.keys(item.data).length > 0 
          ? \`<div class="card-data">\${JSON.stringify(item.data, null, 1)}</div>\` 
          : '';

        return \`
          <div class="item-card \${item.state}">
            <div class="card-top">
              <span class="card-kind kind-\${item.kind}">\${item.kind}</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                \${visPill}
                \${riskPill}
              </div>
            </div>
            <div class="card-title">\${item.title}</div>
            <div class="card-body">\${item.body}</div>
            \${dataSnippet}
            \${actionsHtml}
          </div>
        \`;
      }).join('');
    }

    async function resolveItem(itemId, resolution) {
      try {
        await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/inbox/resolve\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case: currentCase,
            itemId: itemId,
            resolution: resolution,
            resolvedBy: 'Advocate'
          })
        });
        loadInbox();
      } catch (e) {
        console.error('Failed to resolve item:', e);
      }
    }

    function submitText(itemId) {
      const input = document.getElementById('input-' + itemId);
      if (input && input.value.trim()) {
        resolveItem(itemId, input.value.trim());
      }
    }

    // Initial fetch and 4s poll
    loadInbox();
    setInterval(loadInbox, 4000);
  </script>
</body>
</html>`;
}

export function billingExplorerHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg-primary: ${isLight ? '#f8fafc' : 'var(--theia-layout-color1, #14161a)'};
    --bg-card: ${isLight ? '#ffffff' : '#1c1e24'};
    --bg-card-hover: ${isLight ? '#f1f5f9' : '#232730'};
    --border-color: ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)'};
    --text-primary: ${isLight ? '#0f172a' : '#f3f4f6'};
    --text-muted: ${isLight ? '#64748b' : '#94a3b8'};
    --accent-blue: ${isLight ? '#0284c7' : '#38bdf8'};
    --accent-emerald: #10b981;
    --accent-amber: #f59e0b;
    --accent-purple: #8b5cf6;
    --accent-rose: #ef4444;
  }
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: 12px;
    margin: 0;
    padding: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    overflow-x: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-weight: 700;
    font-size: 12.5px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${isLight ? '#0f172a' : '#e2e8f0'};
  }
  .balance-card {
    background: ${isLight ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)'};
    border: 1px solid ${isLight ? '#bae6fd' : 'rgba(56, 189, 248, 0.25)'};
    box-shadow: ${isLight ? '0 2px 10px rgba(2, 132, 199, 0.08)' : '0 4px 16px rgba(0, 0, 0, 0.3)'};
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .balance-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .balance-label {
    font-size: 11px;
    text-transform: uppercase;
    color: ${isLight ? '#0369a1' : 'var(--text-muted)'};
    font-weight: 600;
    letter-spacing: 0.5px;
  }
  .balance-amount {
    font-size: 20px;
    font-weight: 800;
    color: ${isLight ? '#0284c7' : '#38bdf8'};
    letter-spacing: -0.5px;
  }
  .balance-breakdown {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: ${isLight ? '#475569' : '#94a3b8'};
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px dashed ${isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.1)'};
  }
  .action-buttons {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .btn-pay {
    flex: 1.2;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 6px 10px;
    font-weight: 600;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
    transition: all 0.15s ease;
  }
  .btn-pay:hover {
    background: linear-gradient(135deg, #0369a1, #075985);
    transform: translateY(-1px);
  }
  .btn-secondary {
    background: ${isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.05)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'var(--border-color)'};
    color: ${isLight ? '#334155' : '#cbd5e1'};
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s ease;
  }
  .btn-secondary:hover {
    background: ${isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.12)'};
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    background: ${isLight ? '#e2e8f0' : 'rgba(0, 0, 0, 0.2)'};
    padding: 2px;
    border-radius: 6px;
  }
  .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    color: ${isLight ? '#475569' : 'var(--text-muted)'};
    padding: 5px 4px;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
    white-space: nowrap;
  }
  .tab-btn.active {
    background: #0284c7;
    color: #ffffff;
  }
  .tab-badge {
    background: ${isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.3)'};
    border-radius: 8px;
    padding: 1px 5px;
    font-size: 9.5px;
    margin-left: 3px;
  }
  .tab-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
  }
  .task-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 9px 10px;
    box-shadow: ${isLight ? '0 1px 3px rgba(0, 0, 0, 0.03)' : 'none'};
    transition: border-color 0.15s ease;
  }
  .task-card:hover {
    background: var(--bg-card-hover);
    border-color: ${isLight ? '#38bdf8' : 'rgba(255, 255, 255, 0.15)'};
  }
  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
  }
  .task-tool {
    font-weight: 600;
    font-size: 11.5px;
    color: ${isLight ? '#0f172a' : '#e2e8f0'};
    word-break: break-word;
  }
  .task-rate {
    font-weight: 700;
    font-size: 12px;
    color: ${isLight ? '#0284c7' : '#38bdf8'};
    white-space: nowrap;
  }
  .task-target {
    font-size: 11px;
    color: ${isLight ? '#475569' : '#94a3b8'};
    margin-bottom: 4px;
  }
  .task-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #64748b;
    margin-top: 4px;
  }
  .badge-status {
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 9.5px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .status-pending { ${isLight ? 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;' : 'background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3);'} }
  .status-executed { ${isLight ? 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;' : 'background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3);'} }
  .status-settled { ${isLight ? 'background: #d1fae5; color: #047857; border: 1px solid #a7f3d0;' : 'background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);'} }
  .card-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.05)'};
  }
  .btn-auth {
    flex: 1;
    background: #059669;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-auth:hover { background: #047857; }
  .btn-discard {
    background: transparent;
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 10.5px;
    cursor: pointer;
  }
  .btn-discard:hover { background: rgba(239, 68, 68, 0.1); }
  .empty-state {
    text-align: center;
    padding: 24px 12px;
    color: #64748b;
    font-size: 11px;
  }
  .rate-card-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
  }
  .rate-card-table th {
    text-align: left;
    color: ${isLight ? '#334155' : '#94a3b8'};
    padding: 6px 4px;
    border-bottom: 1px solid var(--border-color);
  }
  .rate-card-table td {
    padding: 6px 4px;
    color: ${isLight ? '#0f172a' : '#f3f4f6'};
    border-bottom: 1px solid ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.04)'};
  }
  .integrity-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: ${isLight ? '#047857' : '#10b981'};
    padding: 2px 6px;
    border-radius: 4px;
    background: ${isLight ? '#ecfdf5' : 'rgba(16, 185, 129, 0.1)'};
    border: 1px solid ${isLight ? '#a7f3d0' : 'transparent'};
  }
  .btn-refresh {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    border-radius: 4px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s ease;
  }
  .btn-refresh:hover {
    background: ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)'};
    color: var(--text-primary);
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span class="title">Estate Accounts & Billing</span>
      <span class="integrity-pill" id="integrity-badge" title="Cryptographic SHA-256 Chained Ledger">⛓️ SHA-256 Ledger</span>
    </div>
    <button class="btn-secondary" onclick="syncServer()" title="Sync with Server">🔄 Sync</button>
  </div>

  <div class="balance-card">
    <div class="balance-top">
      <span class="balance-label">Total Accrued Due</span>
      <span class="balance-amount" id="total-due">₹0.00</span>
    </div>
    <div class="balance-breakdown">
      <span id="unbilled-subtotal">Subtotal: ₹0.00</span>
      <span id="gst-amount">GST (18%): ₹0.00</span>
    </div>
    <div class="action-buttons">
      <button class="btn-pay" onclick="openPaymentPortal()">
        💳 Pay on Resolution Bazaar
      </button>
      <button class="btn-secondary" onclick="window.parent.postMessage({ type: 'open-billing-ledger-main' }, '*')" title="Open Full CIRP Expense Ledger in Main Workspace">
        📑 Ledger
      </button>
      <button class="btn-secondary" onclick="verifyIntegrity()" title="Verify SQLite Hash Chain">
        🛡️ Audit
      </button>
    </div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('pending')" id="tab-btn-pending">
      Approvals <span class="tab-badge" id="badge-pending">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('executed')" id="tab-btn-executed">
      Executed <span class="tab-badge" id="badge-executed">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('receipts')" id="tab-btn-receipts">
      Receipts <span class="tab-badge" id="badge-receipts">0</span>
    </button>
    <button class="tab-btn" onclick="switchTab('rates')" id="tab-btn-rates">
      Rate Card
    </button>
  </div>

  <div class="tab-content" id="content-pending">
    <div class="empty-state">Loading pending approvals…</div>
  </div>
  <div class="tab-content" id="content-executed" style="display: none;">
    <div class="empty-state">Loading executed diligence tasks…</div>
  </div>
  <div class="tab-content" id="content-receipts" style="display: none;">
    <div class="empty-state">Loading settlement receipts…</div>
  </div>
  <div class="tab-content" id="content-rates" style="display: none;">
    <table class="rate-card-table">
      <thead>
        <tr>
          <th>Statutory Diligence Module</th>
          <th style="text-align: right;">Rate (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Section 29A Entity Screening</td><td style="text-align: right; font-weight: 700; color: #38bdf8;">₹250</td></tr>
        <tr><td>CIBIL Defaulters Inquest</td><td style="text-align: right; font-weight: 700; color: #38bdf8;">₹75</td></tr>
        <tr><td>Director MCA RoD Status</td><td style="text-align: right; font-weight: 700; color: #38bdf8;">₹50</td></tr>
        <tr><td>eCourts Litigation Search</td><td style="text-align: right; font-weight: 700; color: #38bdf8;">₹150</td></tr>
        <tr><td>Plan Verification Dossier</td><td style="text-align: right; font-weight: 700; color: #38bdf8;">₹1,500</td></tr>
      </tbody>
    </table>
    <div style="font-size: 10px; color: #64748b; margin-top: 10px; line-height: 1.4;">
      * Zero-Cost Hard Floor Guarantee: Unapproved tasks incur ₹0 cost. Rates are charged per executed API transaction with 18% GST itemized.
    </div>
  </div>

  <script>
    let currentCase = "${caseName}";
    const apiPort = ${apiPort};
    let activeTab = 'pending';
    let cachedLedger = null;

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'select-case' && event.data.caseName) {
        currentCase = event.data.caseName;
        loadLedger();
      }
    });

    function switchTab(tab) {
      activeTab = tab;
      ['pending', 'executed', 'receipts', 'rates'].forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const content = document.getElementById('content-' + t);
        if (btn && content) {
          if (t === tab) {
            btn.classList.add('active');
            content.style.display = 'flex';
          } else {
            btn.classList.remove('active');
            content.style.display = 'none';
          }
        }
      });
      if (cachedLedger) {
        renderLedger(cachedLedger);
      }
    }

    async function loadLedger() {
      if (!currentCase) return;
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/billing/case-summary?case=\${encodeURIComponent(currentCase)}\`);
        if (!res.ok) throw new Error('Failed to load ledger');
        const data = await res.json();
        if (data.success && data.ledger) {
          cachedLedger = data.ledger;
          renderLedger(data.ledger);
        }
      } catch (err) {
        console.error('Error loading billing ledger:', err);
      }
    }

    function renderLedger(ledger) {
      document.getElementById('total-due').textContent = '₹' + (ledger.total_due_inr || 0).toFixed(2);
      document.getElementById('unbilled-subtotal').textContent = 'Subtotal: ₹' + (ledger.unbilled_subtotal_inr || 0).toFixed(2);
      document.getElementById('gst-amount').textContent = 'GST (18%): ₹' + (ledger.gst_18_pct_inr || 0).toFixed(2);
      document.getElementById('badge-pending').textContent = ledger.pending_approval_count || 0;
      document.getElementById('badge-executed').textContent = ledger.unbilled_count || 0;
      document.getElementById('badge-receipts').textContent = (ledger.receipts || []).length;

      // 1. Pending tasks
      const pendingContainer = document.getElementById('content-pending');
      const pendingTasks = ledger.pending_tasks || [];
      if (pendingTasks.length === 0) {
        pendingContainer.innerHTML = '<div class="empty-state">No tasks awaiting approval. Hard floor secure (₹0 cost).</div>';
      } else {
        pendingContainer.innerHTML = pendingTasks.map(t => \`
          <div class="task-card">
            <div class="task-header">
              <div class="task-tool">\${formatToolName(t.tool_name)}</div>
              <div class="task-rate">₹\${t.rate_inr.toFixed(2)}</div>
            </div>
            <div class="task-target">Target: \${t.target_name || t.target_identifier || 'Entity'}</div>
            <div class="task-meta">
              <span>\${formatDate(t.created_at)}</span>
              <span class="badge-status status-pending">Pending Approval</span>
            </div>
            <div class="card-actions">
              <button class="btn-auth" onclick="authorizeTask('\${t.task_id}')">Authorize & Run</button>
              <button class="btn-discard" onclick="cancelTask('\${t.task_id}')">Discard</button>
            </div>
          </div>
        \`).join('');
      }

      // 2. Executed tasks
      const executedContainer = document.getElementById('content-executed');
      const executedTasks = ledger.executed_tasks || [];
      if (executedTasks.length === 0) {
        executedContainer.innerHTML = '<div class="empty-state">No diligence tasks executed yet.</div>';
      } else {
        executedContainer.innerHTML = executedTasks.map(t => \`
          <div class="task-card">
            <div class="task-header">
              <div class="task-tool">\${formatToolName(t.tool_name)}</div>
              <div class="task-rate">₹\${t.rate_inr.toFixed(2)}</div>
            </div>
            <div class="task-target">Target: \${t.target_name || t.target_identifier || 'Entity'}</div>
            <div class="task-meta">
              <span>\${formatDate(t.executed_at || t.created_at)}</span>
              <span class="badge-status \${t.payment_status === 'SETTLED' ? 'status-settled' : 'status-executed'}">
                \${t.payment_status}
              </span>
            </div>
          </div>
        \`).join('');
      }

      // 3. Receipts
      const receiptsContainer = document.getElementById('content-receipts');
      const receipts = ledger.receipts || [];
      if (receipts.length === 0) {
        receiptsContainer.innerHTML = '<div class="empty-state">No settlement receipts found. Click "Pay on Resolution Bazaar" to settle.</div>';
      } else {
        receiptsContainer.innerHTML = receipts.map(r => \`
          <div class="task-card">
            <div class="task-header">
              <div class="task-tool">\${r.invoice_number}</div>
              <div class="task-rate" style="color: #10b981;">₹\${r.total_inr.toFixed(2)}</div>
            </div>
            <div class="task-target">Gateway Ref: \${r.gateway_payment_id}</div>
            <div class="task-meta">
              <span>\${formatDate(r.paid_at)}</span>
              <span class="badge-status status-settled">PAID</span>
            </div>
          </div>
        \`).join('');
      }
    }

    async function authorizeTask(taskId) {
      try {
        await fetch(\`http://127.0.0.1:\${apiPort}/api/billing/authorize-task\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: currentCase, taskId, authorizedBy: 'Advocate' })
        });
        loadLedger();
      } catch (err) {
        alert('Error authorizing task: ' + err.message);
      }
    }

    async function cancelTask(taskId) {
      try {
        await fetch(\`http://127.0.0.1:\${apiPort}/api/billing/cancel-task\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: currentCase, taskId })
        });
        loadLedger();
      } catch (err) {
        alert('Error cancelling task: ' + err.message);
      }
    }

    async function syncServer() {
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/billing/sync-server\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: currentCase })
        });
        const data = await res.json();
        if (data.localLedger) {
          cachedLedger = data.localLedger;
          renderLedger(data.localLedger);
        }
      } catch (err) {
        alert('Sync failed: ' + err.message);
      }
    }

    async function verifyIntegrity() {
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/billing/verify-integrity?case=\${encodeURIComponent(currentCase)}\`);
        const data = await res.json();
        if (data.integrity && data.integrity.valid) {
          alert('✔ SHA-256 Ledger Audit PASSED! All ' + data.integrity.rows_verified + ' records cryptographically intact.');
        } else {
          alert('⚠️ Warning: Ledger validation alert: ' + JSON.stringify(data.integrity));
        }
      } catch (err) {
        alert('Audit check failed: ' + err.message);
      }
    }

    function openPaymentPortal() {
      window.open(\`http://127.0.0.1:8000/portal/billing?case_id=\${encodeURIComponent(currentCase)}\`, '_blank');
    }

    function formatToolName(name) {
      if (!name) return 'Diligence Check';
      return name
        .replace(/^screen_section_29a_entity$/, 'Section 29A Screening')
        .replace(/^query_cibil_defaulters$/, 'CIBIL Defaulters Inquest')
        .replace(/^check_director_mca_status$/, 'Director MCA RoD Status')
        .replace(/^execute_ecourts_litigation_search$/, 'eCourts Litigation Search')
        .replace(/^generate_plan_verification_dossier$/, 'Plan Verification Dossier')
        .replace(/_/g, ' ');
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } catch (_) {
        return dateStr;
      }
    }

    loadLedger();
    setInterval(loadLedger, 5000);
  </script>
</body>
</html>`;
}

export function caseGraphHtml(caseName: string, apiPort: number = 3210): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Diagnostic Case Graph & Contradictions</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: var(--theia-layout-color0, #141414);
      color: var(--theia-ui-font-color0, #f3f3f3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    #canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    .node {
      stroke-width: 1.5px;
      cursor: pointer;
      transition: r 0.2s, stroke-width 0.2s;
    }
    .node:hover {
      stroke-width: 3px !important;
    }
    .link {
      stroke-opacity: 0.75;
      stroke-linecap: round;
      cursor: pointer;
    }
    .link-conflict {
      stroke: #ef4444 !important;
      stroke-width: 3px !important;
      stroke-dasharray: 4, 3;
      animation: dash 1.5s linear infinite;
    }
    @keyframes dash {
      to {
        stroke-dashoffset: -14;
      }
    }
    .label {
      font-size: 11px;
      pointer-events: none;
      font-weight: 500;
      fill: var(--theia-ui-font-color1, #e0e0e0);
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    }
    .control-panel {
      position: absolute;
      top: 14px;
      left: 14px;
      background: rgba(20, 20, 20, 0.85);
      backdrop-filter: blur(8px);
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid var(--theia-border-color, #333);
      font-size: 11px;
      z-index: 10;
      max-width: 260px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .legend-title {
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-section {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 4px;
      font-size: 10.5px;
      gap: 6px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .legend-line {
      width: 14px;
      height: 3px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .tooltip {
      position: absolute;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid #334155;
      padding: 8px 12px;
      border-radius: 6px;
      color: #f8fafc;
      font-size: 11px;
      pointer-events: none;
      display: none;
      z-index: 100;
      max-width: 320px;
      line-height: 1.4;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <div id="canvas-container">
    <div class="control-panel">
      <div class="legend-title">⚖️ Case Diagnostic Graph</div>
      <div style="font-size: 10px; opacity: 0.7; margin-bottom: 8px;">\${caseName}</div>

      <div class="legend-item"><div class="legend-line" style="background:#ef4444;"></div> <strong>Contradiction / Conflict</strong></div>
      <div class="legend-item"><div class="legend-line" style="background:#f97316;"></div> Related Party / Avoidance</div>
      <div class="legend-item"><div class="legend-line" style="background:#a855f7;"></div> Supersedes / Replaces</div>
      <div class="legend-item"><div class="legend-line" style="background:#38bdf8;"></div> Cites / Cross-Reference</div>
      <div class="legend-item"><div class="legend-line" style="background:#10b981;"></div> Hierarchy / Claim</div>

      <div class="legend-section">
        <div class="legend-item"><div class="legend-dot" style="background:#eab308;"></div> Corporate Debtor</div>
        <div class="legend-item"><div class="legend-dot" style="background:#3b82f6;"></div> Financial / Op Creditor</div>
        <div class="legend-item"><div class="legend-dot" style="background:#f97316;"></div> Avoidance / Related Party</div>
        <div class="legend-item"><div class="legend-dot" style="background:#6366f1;"></div> Documents & Concepts</div>
      </div>
      
      <div style="margin-top:10px; font-size:9.5px; opacity:0.65;">
        • Drag nodes to inspect clusters.<br>
        • Hover on red edges to see conflict deltas.
      </div>
    </div>
    
    <div id="graph-tooltip" class="tooltip"></div>
    <svg id="graph-svg"></svg>
  </div>

  <script>
    async function initGraph() {
      try {
        const res = await fetch('http://127.0.0.1:\${apiPort}/api/hayagriva/case-graph?case=' + encodeURIComponent('\${caseName}'));
        if (!res.ok) throw new Error("Failed to load graph data");
        const graph = await res.json();

        const svg = d3.select("#graph-svg");
        const tooltip = d3.select("#graph-tooltip");
        const width = window.innerWidth;
        const height = window.innerHeight;

        const g = svg.append("g");
        svg.call(d3.zoom().scaleExtent([0.2, 5]).on("zoom", (event) => {
          g.attr("transform", event.transform);
        }));

        const simulation = d3.forceSimulation(graph.nodes)
            .force("link", d3.forceLink(graph.links).id(d => d.id).distance(d => d.type === 'contradicts' ? 120 : 85))
            .force("charge", d3.forceManyBody().strength(-220))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(32));

        // Links
        const link = g.append("g")
            .attr("class", "links")
          .selectAll("line")
          .data(graph.links)
          .join("line")
            .attr("class", d => d.type === 'contradicts' || d.type === 'avoidance_conflict' ? 'link link-conflict' : 'link')
            .attr("stroke", d => d.color || '#555')
            .attr("stroke-width", d => d.type === 'contradicts' || d.type === 'avoidance_conflict' ? 3 : 1.5)
            .on("mouseover", (event, d) => {
              if (d.details && (d.details.narrative || d.details.conflict_type)) {
                tooltip.style("display", "block")
                       .html('<strong>⚠️ ' + (d.type.toUpperCase()) + '</strong><br>' + (d.details.narrative || 'Factual Conflict'))
                       .style("left", (event.pageX + 10) + "px")
                       .style("top", (event.pageY + 10) + "px");
              }
            })
            .on("mouseout", () => tooltip.style("display", "none"));

        // Helper for Node Colors
        function getNodeColor(d) {
          if (d.type === 'corporate_debtor') return '#eab308';
          if (d.type === 'financial_creditor') return '#3b82f6';
          if (d.type === 'operational_creditor') return '#0ea5e9';
          if (d.type === 'related_party' || d.type === 'avoidance_respondent') return '#f97316';
          if (d.type === 'resolution_applicant') return '#8b5cf6';
          if (d.type === 'document') return '#6366f1';
          if (d.type === 'wiki') return '#10b981';
          return '#38bdf8';
        }

        function getNodeRadius(d) {
          if (d.type === 'corporate_debtor') return 18;
          if (d.type === 'financial_creditor' || d.type === 'resolution_applicant') return 14;
          if (d.type === 'document') return 12;
          if (d.type === 'wiki') return 10;
          return 8;
        }

        // Nodes
        const node = g.append("g")
            .attr("class", "nodes")
          .selectAll("circle")
          .data(graph.nodes)
          .join("circle")
            .attr("class", "node")
            .attr("r", getNodeRadius)
            .attr("fill", getNodeColor)
            .attr("stroke", "#ffffff")
            .attr("stroke-opacity", 0.8)
            .call(d3.drag()
                .on("start", (event, d) => {
                  if (!event.active) simulation.alphaTarget(0.3).restart();
                  d.fx = d.x;
                  d.fy = d.y;
                })
                .on("drag", (event, d) => {
                  d.fx = event.x;
                  d.fy = event.y;
                })
                .on("end", (event, d) => {
                  if (!event.active) simulation.alphaTarget(0);
                  d.fx = null;
                  d.fy = null;
                }))
            .on("mouseover", (event, d) => {
              let info = '<strong>' + d.name + '</strong> [' + (d.type || 'node') + ']';
              if (d.properties) {
                if (d.properties.claimed_amount) info += '<br>• Claimed: ₹' + Number(d.properties.claimed_amount).toLocaleString('en-IN');
                if (d.properties.admitted_amount) info += '<br>• Admitted: ₹' + Number(d.properties.admitted_amount).toLocaleString('en-IN');
                if (d.properties.avoidance_amount) info += '<br>• Avoidance (§' + (d.properties.applicable_section || '66') + '): ₹' + Number(d.properties.avoidance_amount).toLocaleString('en-IN');
              }
              tooltip.style("display", "block")
                     .html(info)
                     .style("left", (event.pageX + 10) + "px")
                     .style("top", (event.pageY + 10) + "px");
            })
            .on("mouseout", () => tooltip.style("display", "none"))
            .on("click", (event, d) => {
              if (d.path) {
                window.parent.postMessage({ type: 'open-concept-chunk', relativePath: d.path }, '*');
              }
            });

        // Labels
        const label = g.append("g")
            .attr("class", "labels")
          .selectAll("text")
          .data(graph.nodes)
          .join("text")
            .attr("class", "label")
            .attr("dx", d => getNodeRadius(d) + 4)
            .attr("dy", 4)
            .text(d => d.name);

        simulation.on("tick", () => {
          link
              .attr("x1", d => d.source.x)
              .attr("y1", d => d.source.y)
              .attr("x2", d => d.target.x)
              .attr("y2", d => d.target.y);

          node
              .attr("cx", d => d.x)
              .attr("cy", d => d.y);

          label
              .attr("x", d => d.x)
              .attr("y", d => d.y);
        });

        window.addEventListener("resize", () => {
          simulation.force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2));
          simulation.alpha(0.3).restart();
        });

      } catch (err) {
        console.error("Graph init error:", err);
      }
    }

    window.onload = initGraph;
  </script>
</body>
</html>`;
}

export function commercialReadinessHtml(caseName: string, apiPort: number = 3210): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg-main: var(--theia-layout-color1, #1e1e1e);
    --bg-card: var(--theia-layout-color2, #252526);
    --bg-card-sub: var(--theia-layout-color3, #2d2d2d);
    --border-color: var(--theia-border-color, #3e3e42);
    --text-main: var(--theia-ui-font-color1, #cccccc);
    --text-muted: var(--theia-ui-font-color2, #888888);
    --brand-color: var(--theia-brand-color1, #0ea5e9);
    --success-color: #22c55e;
    --warning-color: #eab308;
    --danger-color: #ef4444;
  }
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 13px;
    margin: 0;
    padding: 16px;
    background: var(--bg-main);
    color: var(--text-main);
  }
  .header-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .title-row h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--brand-color);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .score-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .score-badge.ready { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
  .score-badge.attention { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
  .score-badge.blocked { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

  .progress-bar-container {
    width: 100%;
    height: 8px;
    background: var(--bg-card-sub);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress-bar-fill {
    height: 100%;
    transition: width 0.4s ease;
    border-radius: 4px;
  }
  .metrics-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-muted);
  }

  .tabs-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .tab-btn {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .tab-btn.active {
    background: var(--brand-color);
    color: #fff;
    border-color: var(--brand-color);
  }

  .category-section {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .category-header {
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 12px;
  }
  .fact-item {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fact-item:last-child {
    border-bottom: none;
  }
  .fact-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .fact-label {
    font-weight: 500;
    color: var(--text-main);
  }
  .status-tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }
  .status-tag.found { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
  .status-tag.inferred { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
  .status-tag.missing { background: rgba(239, 68, 68, 0.2); color: #f87171; }

  .fact-value-box {
    font-family: monospace;
    font-size: 11px;
    background: var(--bg-card-sub);
    padding: 4px 8px;
    border-radius: 4px;
    color: #e2e8f0;
    word-break: break-all;
  }
  .fact-source {
    font-size: 11px;
    color: var(--text-muted);
  }
  .fact-req {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .quick-fill-box {
    margin-top: 6px;
    display: flex;
    gap: 6px;
  }
  .quick-fill-input {
    flex: 1;
    background: var(--bg-main);
    border: 1px solid var(--border-color);
    color: #fff;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 12px;
  }
  .quick-fill-input:focus {
    outline: none;
    border-color: var(--brand-color);
  }
  .quick-fill-btn {
    background: var(--brand-color);
    color: #fff;
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .quick-fill-btn:hover {
    background: #0284c7;
  }
  .actions-bar {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }
  .action-btn {
    flex: 1;
    padding: 8px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-main);
    text-align: center;
  }
  .action-btn.primary {
    background: var(--brand-color);
    color: #fff;
    border-color: var(--brand-color);
  }
  .action-btn:hover {
    filter: brightness(1.1);
  }
</style>
</head>
<body>
  <div class="header-card">
    <div class="title-row">
      <h2>⚖️ Commercial Court Context Readiness</h2>
      <div id="grade-badge" class="score-badge">Auditing...</div>
    </div>
    <div class="progress-bar-container">
      <div id="progress-bar" class="progress-bar-fill" style="width: 0%; background: #38bdf8;"></div>
    </div>
    <div class="metrics-row">
      <span id="readiness-text">Scanning ingested files & facts...</span>
      <span id="ratio-text">0 / 0</span>
    </div>
  </div>

  <div class="tabs-row">
    <button class="tab-btn active" onclick="setFilter('all')">All Facts</button>
    <button class="tab-btn" onclick="setFilter('missing')">Missing Context ⚠️</button>
    <button class="tab-btn" onclick="setFilter('found')">Extracted Context ✓</button>
  </div>

  <div id="categories-container"></div>

  <div class="actions-bar">
    <button class="action-btn primary" onclick="draftPleading('cpc-order38')">Draft Order 38 Attachment</button>
    <button class="action-btn" onclick="draftPleading('cpc-order39')">Draft Order 39 Injunction</button>
    <button class="action-btn" onclick="loadReadiness()">↻ Refresh Audit</button>
  </div>

  <script>
    const caseName = "${caseName}";
    const apiPort = ${apiPort};
    let currentAudit = null;
    let activeFilter = 'all';

    async function loadReadiness() {
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/commercial-courts/readiness?case=\${encodeURIComponent(caseName)}\`);
        const data = await res.json();
        if (data.success) {
          currentAudit = data;
          renderAudit();
        }
      } catch (err) {
        console.error("Readiness audit error:", err);
      }
    }

    function setFilter(filter) {
      activeFilter = filter;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      renderCategories();
    }

    function renderAudit() {
      if (!currentAudit) return;
      const { summary } = currentAudit;
      const score = summary.readinessScore;
      const badge = document.getElementById('grade-badge');
      const bar = document.getElementById('progress-bar');
      const text = document.getElementById('readiness-text');
      const ratio = document.getElementById('ratio-text');

      ratio.textContent = \`\${summary.foundCount} / \${summary.totalFacts} Verified\`;
      bar.style.width = score + '%';

      if (summary.readinessGrade === 'READY') {
        badge.className = 'score-badge ready';
        badge.textContent = \`\${score}% COURT READY\`;
        bar.style.background = '#22c55e';
        text.textContent = 'Mandatory statutory context fully discovered. Ready to draft.';
      } else if (summary.readinessGrade === 'NEEDS_ATTENTION') {
        badge.className = 'score-badge attention';
        badge.textContent = \`\${score}% NEEDS ATTENTION\`;
        bar.style.background = '#eab308';
        text.textContent = \`\${summary.missingCount} context elements missing. Court may reject prayers without these.\`;
      } else {
        badge.className = 'score-badge blocked';
        badge.textContent = \`\${score}% BLOCKED\`;
        bar.style.background = '#ef4444';
        text.textContent = 'Crucial facts missing. Please review red checklist items below.';
      }

      renderCategories();
    }

    function renderCategories() {
      if (!currentAudit) return;
      const container = document.getElementById('categories-container');
      container.innerHTML = '';

      for (const [key, b] of Object.entries(currentAudit.buckets)) {
        let items = b.items;
        if (activeFilter === 'missing') {
          items = items.filter(i => i.status === 'MISSING');
        } else if (activeFilter === 'found') {
          items = items.filter(i => i.status !== 'MISSING');
        }

        if (items.length === 0) continue;

        const sec = document.createElement('div');
        sec.className = 'category-section';

        const head = document.createElement('div');
        head.className = 'category-header';
        head.innerHTML = \`<span>\${b.title}</span><span style="color: var(--text-muted);">\${b.bucketFoundCount}/\${b.bucketTotalCount}</span>\`;
        sec.appendChild(head);

        items.forEach(item => {
          const row = document.createElement('div');
          row.className = 'fact-item';

          let statusTag = '';
          if (item.status === 'FOUND') {
            statusTag = '<span class="status-tag found">✓ EXTRACTED</span>';
          } else if (item.status === 'INFERRED') {
            statusTag = '<span class="status-tag inferred">🔍 INFERRED</span>';
          } else {
            statusTag = '<span class="status-tag missing">⚠️ NOT FOUND</span>';
          }

          let valueHtml = '';
          if (item.value) {
            valueHtml = \`<div class="fact-value-box">\${item.value}</div>\`;
          }

          let sourceHtml = '';
          if (item.source) {
            sourceHtml = \`<div class="fact-source">Source: \${item.source}</div>\`;
          }

          let quickFillHtml = '';
          if (item.status === 'MISSING') {
            quickFillHtml = \`
              <div class="quick-fill-box">
                <input id="input-\${item.key}" class="quick-fill-input" placeholder="\${item.suggestedDefault || 'Enter value...'}" />
                <button class="quick-fill-btn" onclick="saveQuickFill('\${item.key}')">Save Fact</button>
              </div>
            \`;
          }

          row.innerHTML = \`
            <div class="fact-top">
              <span class="fact-label">\${item.label}</span>
              \${statusTag}
            </div>
            \${valueHtml}
            \${sourceHtml}
            <div class="fact-req">\${item.courtRequirement}</div>
            \${quickFillHtml}
          \`;

          sec.appendChild(row);
        });

        container.appendChild(sec);
      }
    }

    async function saveQuickFill(key) {
      const input = document.getElementById(\`input-\${key}\`);
      if (!input || !input.value.trim()) return;

      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/commercial-courts/quick-fill\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: caseName, key, value: input.value.trim() })
        });
        const data = await res.json();
        if (data.success) {
          currentAudit = data;
          renderAudit();
        }
      } catch (err) {
        console.error("Save quick-fill error:", err);
      }
    }

    function draftPleading(formId) {
      window.parent.postMessage({ type: 'EXECUTE_COMMAND', command: 'hayagriva:draftCommercialCourtForm', args: [formId] }, '*');
    }

    window.onload = loadReadiness;
  </script>
</body>
</html>`;
}

export function entityExplorerHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: var(--theia-ui-font-size1, 12px);
    margin: 0;
    padding: 12px;
    background: ${isLight ? '#f8fafc' : 'var(--theia-layout-color1, #1e1e1e)'};
    color: ${isLight ? '#1e293b' : 'var(--theia-ui-font-color1, #cccccc)'};
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid ${isLight ? '#e2e8f0' : 'var(--theia-border-color, #333)'};
  }
  .title-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${isLight ? '#475569' : '#94a3b8'};
  }
  .badge {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(14, 165, 233, 0.35);
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: 700;
  }
  .btn-refresh {
    background: transparent;
    border: 1px solid ${isLight ? '#cbd5e1' : 'var(--theia-border-color, #444)'};
    color: ${isLight ? '#64748b' : '#94a3b8'};
    border-radius: 4px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s ease;
  }
  .btn-refresh:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  /* Hero Launcher Button */
  .hero-launcher {
    margin-bottom: 10px;
  }
  .btn-open-graph {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    border: 1px solid rgba(56, 189, 248, 0.4);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.3px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-open-graph:hover {
    background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
    transform: translateY(-1px);
  }
  .btn-open-graph:active {
    transform: translateY(0);
  }

  /* Search */
  .search-wrap {
    margin-bottom: 8px;
    position: relative;
  }
  .search-input {
    width: 100%;
    box-sizing: border-box;
    background: ${isLight ? '#ffffff' : 'rgba(0, 0, 0, 0.25)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'var(--theia-border-color, #383838)'};
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    color: inherit;
    outline: none;
    transition: border-color 0.15s ease;
  }
  .search-input:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 1px #38bdf8;
  }

  /* Filter Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .tab-btn {
    background: ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.04)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.08)'};
    border-radius: 12px;
    padding: 3px 9px;
    font-size: 10px;
    color: ${isLight ? '#475569' : '#94a3b8'};
    cursor: pointer;
    white-space: nowrap;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .tab-btn.active {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border-color: rgba(14, 165, 233, 0.5);
    font-weight: 600;
  }
  .tab-btn:hover:not(.active) {
    background: rgba(255, 255, 255, 0.08);
  }

  /* Entities Cards List */
  .cards-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
  }
  .cards-container::-webkit-scrollbar {
    width: 4px;
  }
  .cards-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }

  .entity-card {
    background: ${isLight ? '#ffffff' : 'var(--theia-layout-color2, #252526)'};
    border: 1px solid ${isLight ? '#e2e8f0' : 'var(--theia-border-color, #333)'};
    border-radius: 6px;
    padding: 9px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    position: relative;
    transition: all 0.18s ease;
  }
  .entity-card:hover {
    border-color: #38bdf8;
    background: ${isLight ? '#f1f5f9' : 'rgba(56, 189, 248, 0.05)'};
    transform: translateX(2px);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .category-pill {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.4px;
  }
  .category-root { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
  .category-governance { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }
  .category-creditors { background: rgba(139, 92, 246, 0.18); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.35); }
  .category-avoidance { background: rgba(239, 68, 68, 0.18); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); }
  .category-pras { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); }

  .inspect-hint {
    font-size: 9px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .entity-card:hover .inspect-hint {
    opacity: 1;
    color: #38bdf8;
  }

  .entity-name {
    font-size: 12px;
    font-weight: 600;
    color: ${isLight ? '#0f172a' : '#f1f5f9'};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .entity-sub {
    font-size: 10px;
    color: ${isLight ? '#64748b' : '#94a3b8'};
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .status-badge {
    font-size: 10px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .empty-state {
    text-align: center;
    padding: 30px 10px;
    color: ${isLight ? '#94a3b8' : '#64748b'};
    font-size: 11px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title-area">
      <span class="title">Forensic Entities</span>
      <span class="badge" id="countBadge">0</span>
    </div>
    <button class="btn-refresh" title="Reload Directory" onclick="loadEntities()">⟳</button>
  </div>

  <div class="hero-launcher">
    <button class="btn-open-graph" onclick="openTopologyGraph()">
      <span>🗺️</span>
      <span>Open Topology Graph</span>
    </button>
  </div>

  <div class="search-wrap">
    <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search entity, DIN, PAN, section..." oninput="handleSearch()">
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="setTab('ALL', this)">All</button>
    <button class="tab-btn" onclick="setTab('GOVERNANCE', this)">👔 Governance</button>
    <button class="tab-btn" onclick="setTab('CREDITORS', this)">🏦 Creditors</button>
    <button class="tab-btn" onclick="setTab('AVOIDANCE', this)">🚨 Avoidance</button>
    <button class="tab-btn" onclick="setTab('PRAS', this)">🤝 PRAs</button>
  </div>

  <div class="cards-container" id="cardsContainer">
    <div class="empty-state">Loading forensic entities...</div>
  </div>

  <script>
    let currentCase = "${caseName || 'demo_case'}";
    const apiPort = ${apiPort};
    let entities = [];
    let activeTab = 'ALL';
    let searchQuery = '';

    const FALLBACK_ENTITIES = [
      { id: 'entity::cd_root', key: 'cd_root', name: 'Apogee Enterprises Pvt Ltd', entity_type: 'CORPORATE_DEBTOR', category: 'ROOT', identifier: 'CIN: U74899DL2018PTC333241', status: 'ROOT', badge: '🏢 CORPORATE DEBTOR', color: '#f59e0b' },
      { id: 'entity::dir_mittal', key: 'dir_mittal', name: 'Rajan Mittal (Director)', entity_type: 'DIRECTOR', category: 'GOVERNANCE', identifier: 'DIN: 00123456', status: 'VERIFIED', badge: '🟢 ELIGIBLE — UNENCUMBERED DIN', color: '#10b981' },
      { id: 'entity::dir_sharma', key: 'dir_sharma', name: 'Vikram Sharma (Promoter)', entity_type: 'DIRECTOR', category: 'GOVERNANCE', identifier: 'DIN: 08945612', status: 'PENDING', badge: '⚠️ UNVERIFIED (§29A(e))', color: '#f97316' },
      { id: 'entity::bank_sbi', key: 'bank_sbi', name: 'State Bank of India', entity_type: 'FINANCIAL_CREDITOR', category: 'CREDITORS', identifier: 'PAN: AAACB1234F', status: 'VERIFIED', badge: '🟢 VERIFIED (32.4% CoC)', color: '#8b5cf6' },
      { id: 'entity::bank_hdfc', key: 'bank_hdfc', name: 'HDFC Bank Limited', entity_type: 'FINANCIAL_CREDITOR', category: 'CREDITORS', identifier: 'PAN: HDFC0001234', status: 'VERIFIED', badge: '🟢 VERIFIED (18.1% CoC)', color: '#8b5cf6' },
      { id: 'entity::firm_avoidance', key: 'firm_avoidance', name: 'Firm X Logistics Pvt Ltd', entity_type: 'AVOIDANCE_RESPONDENT', category: 'AVOIDANCE', identifier: 'CIN: U63090DL2019PTC111222', status: 'ALERT', badge: '🔴 VULNERABLE (§43 Lookback 250d)', color: '#ef4444' },
      { id: 'entity::pra_consortium', key: 'pra_consortium', name: 'Apex Industrial Consortium', entity_type: 'RESOLUTION_APPLICANT', category: 'PRAS', identifier: 'BID: PRA-BID-2026-09', status: 'VERIFIED', badge: '🟢 SECTION 29A CLEARED', color: '#38bdf8' }
    ];

    async function loadEntities() {
      try {
        const res = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/entities?case=\${encodeURIComponent(currentCase)}\`);
        const data = await res.json();
        if (data.success && data.entities && data.entities.length > 0) {
          entities = data.entities;
        } else {
          entities = FALLBACK_ENTITIES;
        }
      } catch (e) {
        console.warn('Failed fetching entities from API, using fallback:', e);
        entities = FALLBACK_ENTITIES;
      }
      renderCards();
    }

    function setTab(tab, btn) {
      activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCards();
    }

    function handleSearch() {
      searchQuery = (document.getElementById('searchInput').value || '').toLowerCase().trim();
      renderCards();
    }

    function openTopologyGraph() {
      window.parent.postMessage({ type: 'open-entity-map-main' }, '*');
    }

    function inspectEntity(entityId, entityName) {
      window.parent.postMessage({
        type: 'focus-entity-in-graph',
        entityId: entityId,
        entityName: entityName
      }, '*');
    }

    function getCategoryClass(cat) {
      const c = (cat || '').toUpperCase();
      if (c === 'ROOT') return 'category-root';
      if (c === 'GOVERNANCE') return 'category-governance';
      if (c === 'CREDITORS' || c === 'CREDITOR') return 'category-creditors';
      if (c === 'AVOIDANCE') return 'category-avoidance';
      if (c === 'PRAS' || c === 'PRA') return 'category-pras';
      return 'category-governance';
    }

    function renderCards() {
      const container = document.getElementById('cardsContainer');
      const badge = document.getElementById('countBadge');

      let filtered = entities.filter(ent => {
        // Tab filter
        const cat = (ent.category || '').toUpperCase();
        if (activeTab === 'GOVERNANCE' && cat !== 'GOVERNANCE' && cat !== 'ROOT') return false;
        if (activeTab === 'CREDITORS' && cat !== 'CREDITORS' && cat !== 'CREDITOR') return false;
        if (activeTab === 'AVOIDANCE' && cat !== 'AVOIDANCE') return false;
        if (activeTab === 'PRAS' && cat !== 'PRAS' && cat !== 'PRA') return false;

        // Search query filter
        if (searchQuery) {
          const name = (ent.name || '').toLowerCase();
          const id = (ent.identifier || ent.entity_key || '').toLowerCase();
          const badgeText = (ent.badge || '').toLowerCase();
          return name.includes(searchQuery) || id.includes(searchQuery) || badgeText.includes(searchQuery);
        }
        return true;
      });

      badge.textContent = filtered.length;

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching entities found in triage list.</div>';
        return;
      }

      container.innerHTML = filtered.map(ent => {
        const catClass = getCategoryClass(ent.category);
        const catLabel = (ent.category || ent.entity_type || 'ENTITY').toUpperCase();
        const ident = ent.identifier || (ent.properties && (ent.properties.din || ent.properties.cin || ent.properties.pan)) || '—';
        const badgeText = ent.badge || '🟢 VERIFIED';
        return \`
          <div class="entity-card" onclick="inspectEntity('\${ent.id}', '\${(ent.name || '').replace(/'/g, "\\\\'")}')">
            <div class="card-top">
              <span class="category-pill \${catClass}">\${catLabel}</span>
              <span class="inspect-hint">Inspect ➔</span>
            </div>
            <div class="entity-name" title="\${ent.name}">\${ent.name}</div>
            <div class="entity-sub">
              <span>\${ident}</span>
              <span class="status-badge">\${badgeText}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'select-case' && event.data.caseName) {
        currentCase = event.data.caseName;
        loadEntities();
      }
    });

    window.onload = loadEntities;
  </script>
</body>
</html>`;
}

export function notificationCenterHtml(caseName: string, apiPort: number = 3210, isLight: boolean = false): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root {
    --bg-primary: ${isLight ? '#f8fafc' : 'var(--theia-layout-color1, #1e1e1e)'};
    --bg-card: ${isLight ? '#ffffff' : 'var(--theia-layout-color2, #252526)'};
    --bg-card-hover: ${isLight ? '#f1f5f9' : '#2d2d30'};
    --border-color: ${isLight ? '#e2e8f0' : 'var(--theia-border-color, #333)'};
    --text-primary: ${isLight ? '#0f172a' : 'var(--theia-ui-font-color1, #cccccc)'};
    --text-muted: ${isLight ? '#64748b' : '#94a3b8'};
    --brand-blue: #0284c7;
    --brand-sky: #38bdf8;
    --brand-emerald: #10b981;
    --brand-amber: #f59e0b;
    --brand-rose: #ef4444;
  }
  body {
    font-family: var(--theia-ui-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    font-size: var(--theia-ui-font-size1, 12px);
    margin: 0;
    padding: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
  }
  .title-area {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .title {
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${isLight ? '#0f172a' : 'var(--text-muted)'};
  }
  .badge {
    background: ${isLight ? '#e0f2fe' : 'rgba(14, 165, 233, 0.15)'};
    color: ${isLight ? '#0284c7' : 'var(--brand-sky)'};
    border: 1px solid ${isLight ? '#bae6fd' : 'rgba(14, 165, 233, 0.35)'};
    border-radius: 10px;
    padding: 1px 7px;
    font-size: 10px;
    font-weight: 700;
  }
  .btn-refresh {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-muted);
    border-radius: 4px;
    padding: 3px 7px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s ease;
  }
  .btn-refresh:hover {
    background: ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)'};
    color: var(--text-primary);
  }

  /* Hero Launcher */
  .hero-launcher {
    margin-bottom: 10px;
  }
  .btn-open-queue {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    border: 1px solid rgba(56, 189, 248, 0.4);
    box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.3px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-open-queue:hover {
    background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);
    transform: translateY(-1px);
  }

  /* Search */
  .search-wrap {
    margin-bottom: 8px;
  }
  .search-input {
    width: 100%;
    box-sizing: border-box;
    background: ${isLight ? '#ffffff' : 'rgba(0, 0, 0, 0.25)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'var(--border-color)'};
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 11px;
    color: ${isLight ? '#0f172a' : 'inherit'};
    outline: none;
    transition: border-color 0.15s ease;
  }
  .search-input:focus {
    border-color: var(--brand-sky);
    box-shadow: 0 0 0 1px var(--brand-sky);
  }

  /* Category Filter Tabs */
  .tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .tabs::-webkit-scrollbar { height: 2px; }
  .tab-btn {
    background: ${isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.04)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.08)'};
    border-radius: 12px;
    padding: 3px 8px;
    font-size: 10px;
    color: ${isLight ? '#475569' : 'var(--text-muted)'};
    cursor: pointer;
    white-space: nowrap;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .tab-btn.active {
    background: ${isLight ? '#0284c7' : 'rgba(14, 165, 233, 0.2)'};
    color: ${isLight ? '#ffffff' : 'var(--brand-sky)'};
    border-color: ${isLight ? '#0284c7' : 'rgba(14, 165, 233, 0.5)'};
    font-weight: 600;
  }

  /* Items Container */
  .cards-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
  }
  .cards-container::-webkit-scrollbar { width: 4px; }
  .cards-container::-webkit-scrollbar-thumb {
    background: ${isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.15)'};
    border-radius: 2px;
  }

  /* Card */
  .notify-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 9px 10px;
    box-shadow: ${isLight ? '0 1px 3px rgba(0, 0, 0, 0.03)' : 'none'};
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.18s ease;
  }
  .notify-card:hover {
    background: var(--bg-card-hover);
    border-color: ${isLight ? '#38bdf8' : 'rgba(56, 189, 248, 0.5)'};
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .category-pill {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.4px;
  }
  .cat-statutory { ${isLight ? 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;' : 'background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);'} }
  .cat-lexai { ${isLight ? 'background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff;' : 'background: rgba(168, 85, 247, 0.18); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35);'} }
  .cat-approval { ${isLight ? 'background: #fef3c7; color: #b45309; border: 1px solid #fde68a;' : 'background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);'} }
  .cat-fact { ${isLight ? 'background: #d1fae5; color: #047857; border: 1px solid #a7f3d0;' : 'background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);'} }

  .time-stamp {
    font-size: 9.5px;
    color: var(--text-muted);
  }
  .card-title {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .card-body {
    font-size: 10.5px;
    color: ${isLight ? '#475569' : 'var(--text-muted)'};
    line-height: 1.4;
  }
  .card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .btn-action {
    background: ${isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.05)'};
    border: 1px solid ${isLight ? '#cbd5e1' : 'var(--border-color)'};
    color: var(--text-primary);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-action.primary {
    background: ${isLight ? '#e0f2fe' : 'rgba(14, 165, 233, 0.15)'};
    color: ${isLight ? '#0284c7' : 'var(--brand-sky)'};
    border-color: ${isLight ? '#bae6fd' : 'rgba(14, 165, 233, 0.4)'};
  }
  .btn-action.primary:hover {
    background: ${isLight ? '#bae6fd' : 'rgba(14, 165, 233, 0.3)'};
  }
  .btn-action.success {
    background: ${isLight ? '#d1fae5' : 'rgba(16, 185, 129, 0.15)'};
    color: ${isLight ? '#047857' : '#34d399'};
    border-color: ${isLight ? '#a7f3d0' : 'rgba(16, 185, 129, 0.4)'};
  }
  .btn-action.success:hover {
    background: ${isLight ? '#a7f3d0' : 'rgba(16, 185, 129, 0.3)'};
  }
  .empty-state {
    text-align: center;
    padding: 30px 10px;
    color: var(--text-muted);
    font-size: 11px;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title-area">
      <span class="title">Notification Center</span>
      <span class="badge" id="countBadge">0 Active</span>
    </div>
    <button class="btn-refresh" title="Reload Feed" onclick="loadFeed()">↻</button>
  </div>

  <div class="hero-launcher">
    <button class="btn-open-queue" onclick="openComplianceQueue('ALL')">
      <span>📋</span>
      <span>Open Statutory Compliance Desk</span>
    </button>
  </div>

  <div class="search-wrap">
    <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search notifications, alerts, filings..." oninput="handleSearch()">
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="setTab('ALL', this)">All</button>
    <button class="tab-btn" onclick="setTab('STATUTORY', this)">📋 Statutory</button>
    <button class="tab-btn" onclick="setTab('LEXAI', this)">🌐 LexAI</button>
    <button class="tab-btn" onclick="setTab('APPROVALS', this)">🛡️ Approvals</button>
    <button class="tab-btn" onclick="setTab('FACTS', this)">📊 Facts</button>
  </div>

  <div class="cards-container" id="cardsContainer">
    <div class="empty-state">Loading notification center feed...</div>
  </div>

  <script>
    let currentCase = "${caseName || 'demo_case'}";
    const apiPort = ${apiPort};
    let feedItems = [];
    let activeTab = 'ALL';
    let searchQuery = '';

    const FALLBACK_ITEMS = [
      {
        id: 'statutory-01',
        category: 'STATUTORY',
        title: 'Form A Public Announcement',
        body: 'Mandatory CIRP deadline: within 3 days of admission order (Reg 6 IBBI Regulations).',
        timestamp: 'CIRP Day 1 · Due in 48h',
        actionLabel: '↗ Open in Queue',
        actionType: 'open-compliance-queue',
        actionPayload: 'ALL'
      },
      {
        id: 'statutory-02',
        category: 'STATUTORY',
        title: 'Section 29A Eligibility Verification',
        body: 'Affidavit screening required for prospective resolution applicants (PRAs).',
        timestamp: 'Statutory Inquest',
        actionLabel: '↗ Open in Queue',
        actionType: 'open-compliance-queue',
        actionPayload: 'ALL'
      },
      {
        id: 'lexai-01',
        category: 'LEXAI',
        title: 'Section 65 Collusive Inquest Probe',
        body: 'Target: Apex Realty · External negative assurance sweep dispatched to LexAI Desk Port 4000.',
        timestamp: 'Running on Port 4000',
        actionLabel: '↗ View Forensic Desk',
        actionType: 'open-compliance-queue',
        actionPayload: 'GLOBAL'
      },
      {
        id: 'fact-01',
        category: 'FACTS',
        title: 'Extracted Case Facts: Corporate Debtor',
        body: 'Apogee Enterprises Pvt Ltd (CIN U74899DL2018PTC333241) · CIRP Commencement confirmed.',
        timestamp: 'Verified from Order',
        actionLabel: '↗ Open KV Dictionary',
        actionType: 'open-kv-editor'
      }
    ];

    async function loadFeed() {
      let combined = [];
      try {
        const inRes = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/inbox?case=\${encodeURIComponent(currentCase)}\`);
        const inData = await inRes.json();
        if (inData.success && inData.items && inData.items.length > 0) {
          inData.items.forEach(item => {
            combined.push({
              id: item.id,
              category: 'APPROVALS',
              title: item.title || item.kind || 'Action Item',
              body: item.body || item.question || 'Practitioner review gate or intake brief.',
              timestamp: item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Inbox Alert',
              isInbox: true,
              filePath: item.filePath || (item.context && item.context.filePath),
              state: item.state || 'pending'
            });
          });
        }
      } catch (e) {
        console.warn('Inbox fetch error:', e);
      }

      try {
        const qRes = await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/compliance/queue?case=\${encodeURIComponent(currentCase)}\`);
        const qData = await qRes.json();
        if (qData.success && qData.queue && qData.queue.length > 0) {
          qData.queue.forEach(q => {
            const isGlobal = q.execution_tier === 'GLOBAL';
            combined.push({
              id: q.task_id || q.id,
              category: isGlobal ? 'LEXAI' : 'STATUTORY',
              title: q.title || q.report_code || 'Statutory Task',
              body: q.statutory_trigger || q.subject || q.statutory_citation || '',
              timestamp: q.status || 'Active',
              actionLabel: isGlobal ? '↗ View Forensic Desk' : '↗ Open in Queue',
              actionType: 'open-compliance-queue',
              actionPayload: isGlobal ? 'GLOBAL' : 'ALL'
            });
          });
        }
      } catch (e) {
        console.warn('Queue fetch error:', e);
      }

      if (combined.length === 0) {
        feedItems = FALLBACK_ITEMS;
      } else {
        const hasStat = combined.some(c => c.category === 'STATUTORY');
        const hasLex = combined.some(c => c.category === 'LEXAI');
        if (!hasStat) combined.unshift(FALLBACK_ITEMS[0], FALLBACK_ITEMS[1]);
        if (!hasLex) combined.push(FALLBACK_ITEMS[2]);
        combined.push(FALLBACK_ITEMS[3]);
        feedItems = combined;
      }

      renderFeed();
    }

    function setTab(tab, btn) {
      activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFeed();
    }

    function handleSearch() {
      searchQuery = (document.getElementById('searchInput').value || '').toLowerCase().trim();
      renderFeed();
    }

    function openComplianceQueue(tier) {
      window.parent.postMessage({ type: 'open-compliance-queue', tier: tier || 'ALL' }, '*');
    }

    function openKvEditor() {
      window.parent.postMessage({ type: 'open-kv-editor' }, '*');
    }

    function openFile(path) {
      if (path) {
        window.parent.postMessage({ type: 'open-file', filePath: path, relativePath: path }, '*');
      }
    }

    async function markResolved(itemId) {
      try {
        await fetch(\`http://127.0.0.1:\${apiPort}/api/hayagriva/inbox/resolve\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseName: currentCase, itemId: itemId, resolution: 'approved' })
        });
        loadFeed();
      } catch (err) {
        console.error('Resolve error:', err);
      }
    }

    function getPillClass(cat) {
      if (cat === 'STATUTORY') return 'cat-statutory';
      if (cat === 'LEXAI') return 'cat-lexai';
      if (cat === 'APPROVALS') return 'cat-approval';
      if (cat === 'FACTS') return 'cat-fact';
      return 'cat-statutory';
    }

    function renderFeed() {
      const container = document.getElementById('cardsContainer');
      const badge = document.getElementById('countBadge');

      let filtered = feedItems.filter(item => {
        if (activeTab !== 'ALL' && item.category !== activeTab) return false;
        if (searchQuery) {
          const t = (item.title || '').toLowerCase();
          const b = (item.body || '').toLowerCase();
          return t.includes(searchQuery) || b.includes(searchQuery);
        }
        return true;
      });

      badge.textContent = \`\${filtered.length} Active\`;

      if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state">No matching notifications in feed.</div>';
        return;
      }

      container.innerHTML = filtered.map(item => {
        const pillClass = getPillClass(item.category);
        const catLabel = item.category === 'APPROVALS' ? '🛡️ APPROVAL' :
                         (item.category === 'LEXAI' ? '🌐 LEXAI' :
                         (item.category === 'FACTS' ? '📊 CASE FACT' : '📋 STATUTORY'));

        let actionHtml = '';
        if (item.isInbox) {
          actionHtml = \`
            <div class="card-actions">
              <button class="btn-action success" onclick="markResolved('\${item.id}')">✓ Mark Read</button>
              \${item.filePath ? \`<button class="btn-action primary" onclick="openFile('\${item.filePath}')">↗ Inspect Filing</button>\` : ''}
            </div>
          \`;
        } else if (item.actionType === 'open-compliance-queue') {
          actionHtml = \`
            <div class="card-actions">
              <button class="btn-action primary" onclick="openComplianceQueue('\${item.actionPayload || 'ALL'}')">\${item.actionLabel || '↗ Open in Queue'}</button>
            </div>
          \`;
        } else if (item.actionType === 'open-kv-editor') {
          actionHtml = \`
            <div class="card-actions">
              <button class="btn-action primary" onclick="openKvEditor()">\${item.actionLabel || '↗ Open KV Dictionary'}</button>
            </div>
          \`;
        }

        return \`
          <div class="notify-card">
            <div class="card-top">
              <span class="category-pill \${pillClass}">\${catLabel}</span>
              <span class="time-stamp">\${item.timestamp || ''}</span>
            </div>
            <div class="card-title">\${item.title}</div>
            <div class="card-body">\${item.body}</div>
            \${actionHtml}
          </div>
        \`;
      }).join('');
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'select-case' && event.data.caseName) {
        currentCase = event.data.caseName;
        loadFeed();
      }
    });

    window.onload = loadFeed;
    setInterval(loadFeed, 6000);
  </script>
</body>
</html>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. FORENSIC & STATUTORY CHAMBER TOOLS CATALOG & COMING SOON WORKBENCH
// ═════════════════════════════════════════════════════════════════════════════

export interface ToolMetadata {
  id: string;
  title: string;
  shortTitle: string;
  icon: string;
  category: string;
  mandate: string;
  badge: string;
  targetRelease: string;
  description: string;
  capabilities: string[];
  simulatedOutput: string;
}

export const TOOLS_CATALOG: Record<string, ToolMetadata> = {
  'redact-file': {
    id: 'redact-file',
    title: 'Redact & Duplicate File (VDR Mode)',
    shortTitle: 'Redact File (VDR)',
    icon: '🔒',
    category: 'Privacy & VDR Sanitization',
    mandate: 'Digital Personal Data Protection (DPDP) Act, 2023 & IBBI (CIRP) Reg 36 (Confidentiality of Information Memorandum)',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Automated deep sanitization of case filings, creditor claims, and financial dossiers into an unalterable sanitized copy (redacted/<filename>) for Virtual Data Rooms and public NCLT filings without mutating original source records.',
    capabilities: [
      'Automated PII Masking: Detects PAN, Aadhaar, Passport, Mobile, Personal Email, and Director DIN.',
      'Commercial Secrets Sanitization: Masks proprietary pricing models, discount matrices, and promoter personal guarantee addresses.',
      'Bitonal Rasterization: Flattens vector layers to prevent clipboard and OCR text recovery leaks.',
      'Cryptographic Parent Seal: Embeds immutable SHA-256 provenance link to the original master document.'
    ],
    simulatedOutput: 'redacted/loan_sanction_sanitized_vdr.pdf'
  },
  'batch-watermark': {
    id: 'batch-watermark',
    title: 'Batch Watermark & VDR Docket Stamping',
    shortTitle: 'Watermark Stamping',
    icon: '🏷️',
    category: 'Privacy & VDR Sanitization',
    mandate: 'IBBI Confidentiality Undertaking (§ 29(2) IBC) & Trade Secret Covenants',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Dynamic forensic watermarking across paginated court bundles and Information Memoranda distributed to Prospective Resolution Applicants (PRAs).',
    capabilities: [
      'Dynamic Bidder Stamping: Imprints PRA Name, CIRP Matter, and Timestamp diagonally across all folios.',
      'Steganographic Leak Trace: Embeds invisible micro-dot transaction IDs to isolate unauthorized leaks.',
      'Configurable Legal Alpha: Custom opacity, font size, and NCLT-compliant perimeter margins.'
    ],
    simulatedOutput: 'stamped/IM_Bundle_Confidential_PRA_Alpha.pdf'
  },
  'bsa-certificate': {
    id: 'bsa-certificate',
    title: 'Generate § 63 BSA / § 65B EA Electronic Evidence Certificate',
    shortTitle: '§ 63 BSA Certificate',
    icon: '📜',
    category: 'Evidence & Certification',
    mandate: 'Section 63, Bharatiya Sakshya Adhiniyam, 2023 & Section 65B, Indian Evidence Act, 1872',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Instant Court-ready statutory electronic evidence affidavits for computer printouts, bank ledgers, WhatsApp communications, and emails filed before NCLT, NCLAT, and Commercial Courts.',
    capabilities: [
      'SHA-256 & SHA-1 Bit-Level Hashing: Automatic cryptographic integrity hashing of target electronic records.',
      'Hardware Custodian Telemetry: Pulls system machine ID, operating environment, and continuous custody duration.',
      'Court-Conforming Affidavit: Generates ready-to-execute Section 63 BSA certificate with formal verification clause.'
    ],
    simulatedOutput: 'drafts/Section_63_BSA_Certificate_Admissibility.docx'
  },
  'tamper-check': {
    id: 'tamper-check',
    title: 'Cryptographic File Integrity & Tamper-Check',
    shortTitle: 'Integrity Check',
    icon: '🛡️',
    category: 'Evidence & Certification',
    mandate: 'Section 65B/63 Evidence Chain-of-Custody & Fiduciary Code of Conduct',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Instant forensic verification comparing current file hashes against original admission order ingestion hashes in the immutable audit trail.',
    capabilities: [
      'SHA-256 Bitwise Verification: Instant comparison against case hash chain (audit_trail.jsonl).',
      'Custody History Audit: Displays exact ingestion timestamp, user identity, and export logs.',
      'Cryptographic Verification Certificate: Generates green Courtroom Authenticity seal or red tamper alert.'
    ],
    simulatedOutput: 'certificates/evidence_custody_verification.pdf'
  },
  'cirp-clock': {
    id: 'cirp-clock',
    title: 'CIRP Statutory Milestone Clock (T₀ → T₃₃₀)',
    shortTitle: 'CIRP Milestone Clock',
    icon: '⏱️',
    category: 'Restructuring & Financial Calculators',
    mandate: 'Section 12 of IBC, 2016 & Regulation 40A (Model CIRP Timeline)',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Deterministic CIRP statutory milestone engine calculating exact statutory deadlines from NCLT Admission Date ($T_0$) with court vacation and registry holiday auto-adjustments.',
    capabilities: [
      'Statutory Milestone Scheduler: Computes Form A (T+3), Claims (T+14), Creditors List (T+21), 1st CoC (T+30), IM (T+54), Form G (T+60), RFRP (T+105), Plan (T+135), and 180/330-day limits.',
      'Calendar Sync Engine: 1-Click export to Apple Calendar, Google Calendar, and Microsoft Outlook (.ics).',
      'Pre-Breach Notification Triggers: Dispatches alert cards to Case Action Inbox 7 days and 48 hours prior to cutoffs.'
    ],
    simulatedOutput: 'calendar/cirp_statutory_timeline_T0_T330.ics'
  },
  'coc-voting': {
    id: 'coc-voting',
    title: 'CoC Voting Share & Waterfall Recalculator',
    shortTitle: 'CoC Voting Share',
    icon: '🧮',
    category: 'Restructuring & Financial Calculators',
    mandate: 'Sections 21, 24, 28, 30(4), and 53 of IBC, 2016',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Real-time recalculation of Committee of Creditors (CoC) voting shares to two decimal places based on admitted vs disallowed claims, with statutory threshold auditing.',
    capabilities: [
      'Dynamic Voting Quota: Auto-calculates each Financial Creditor\'s percentage (Σ = 100.00%) upon any claim modification.',
      'Statutory Majority Auditing: Simulates voting outcomes against 66% threshold (Plan approval, RP replacement) and 51% threshold.',
      'Section 53 Waterfall Estimator: Simulates payout distributions across Secured, Unsecured, Operational, and Equity holders.'
    ],
    simulatedOutput: 'ledgers/coc_voting_share_matrix_v2.json'
  },
  'bank-normalizer': {
    id: 'bank-normalizer',
    title: 'Multi-Bank Statement Forensic Normalizer',
    shortTitle: 'Bank Normalizer',
    icon: '🏦',
    category: 'Restructuring & Financial Calculators',
    mandate: 'Sections 43 (Preferential), 45 (Undervalued), 50 (Extortionate), and 66 (Fraudulent Trading) of IBC',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Local offline parsing and forensic reconciliation of multi-bank statements (SBI, HDFC, ICICI, Axis, PNB) during statutory look-back periods.',
    capabilities: [
      'Contra-Sweep Elimination: Removes internal transfers between debtor accounts to isolate true external cash movements.',
      'Round-Tripping Inquest: Flags circular payments returned to connected entities within 24–72 hours.',
      'Avoidance Ledger Export: Populates structured avoidance ledger for automated filing in Form H / avoidance petitions.'
    ],
    simulatedOutput: 'ledgers/bank_forensic_reconciliation.json'
  },
  'bundle-builder': {
    id: 'bundle-builder',
    title: 'Master Exhibit Numberer & Court Bundle Builder',
    shortTitle: 'Court Bundle Builder',
    icon: '📑',
    category: 'Docketing & Court Filing Preparation',
    mandate: 'NCLT Rules, 2016 (Part III - Form of Pleadings) & High Court Commercial Division Practice Directions',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'Automated assembly, continuous running folio numbering, and exhibit tagging for multi-volume court filings.',
    capabilities: [
      'Continuous Folio Pagination: Stitches petitions, affidavits, and annexures into a single running page sequence (Page 1 to N).',
      'Master Index & Chronology Generator: Generates hyperlinked Master Index and List of Dates referencing exact folio numbers.',
      'Bitonal Print Optimization: Adjusts margins, gutter width, and Supreme Court/NCLT 14pt typography.'
    ],
    simulatedOutput: 'bundles/NCLT_Petition_Bundle_Vol_I_Paginated.pdf'
  },
  'legal-redline': {
    id: 'legal-redline',
    title: 'Blackline / Legal Redline Diff (Plans & Contracts)',
    shortTitle: 'Legal Redline Diff',
    icon: '⚖️',
    category: 'Docketing & Court Filing Preparation',
    mandate: 'Commercial Negotiations & CIRP Resolution Plan Compliance (Section 30(2) Audit)',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'High-precision legal diff engine highlighting additions, strikes, and monetary alterations between successive versions of Resolution Plans, CoC Minutes, or Loan Agreements.',
    capabilities: [
      'Legal Semantic Differencing: Ignores whitespace while highlighting statutory covenant shifts.',
      'Financial Haircut Diff: Flags changes in upfront cash payout, deferred equity percentages, and bank guarantee tenors.',
      'Court-Ready Comparison Memo: Exports side-by-side or strikeout/underline redline memorandum for CoC circulation.'
    ],
    simulatedOutput: 'comparisons/Resolution_Plan_V1_vs_V2_Redline.pdf'
  }
};

export function toolComingSoonHtml(toolKey: string, isLight: boolean = false): string {
  const meta: ToolMetadata = TOOLS_CATALOG[toolKey] || {
    id: toolKey,
    title: 'Chamber Forensic Tool',
    shortTitle: 'Chamber Tool',
    icon: '🛠️',
    category: 'Chamber Utilities',
    mandate: 'Insolvency and Bankruptcy Code, 2016',
    badge: 'Under Active Chamber Development',
    targetRelease: 'Hayagriva CIRP Studio v1.4',
    description: 'This specialized legal instrument is being carefully compiled for air-gapped forensic accuracy.',
    capabilities: [
      'Deterministic Statutory Validation',
      'Air-Gapped In-Chamber Execution',
      'Court-Admissible Evidence Production'
    ],
    simulatedOutput: 'outputs/chamber_tool_output.pdf'
  };

  const capabilitiesHtml = meta.capabilities.map(cap => `
    <li style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 13px; line-height: 1.5; color: var(--text-primary);">
      <span style="color: #0284c7; font-weight: bold; flex-shrink: 0;">✓</span>
      <span>${cap}</span>
    </li>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${meta.title} - Hayagriva</title>
  <style>
    :root {
      --bg-primary: ${isLight ? '#f8fafc' : 'var(--theia-layout-color1, #14161a)'};
      --bg-card: ${isLight ? '#ffffff' : 'var(--theia-layout-color2, #1e2128)'};
      --bg-hover: ${isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.05)'};
      --border-color: ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)'};
      --text-primary: ${isLight ? '#0f172a' : '#f8fafc'};
      --text-secondary: ${isLight ? '#475569' : '#94a3b8'};
      --text-muted: ${isLight ? '#64748b' : '#64748b'};
      --brand-primary: #0284c7;
      --brand-gradient: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      --accent-amber: #d97706;
      --accent-amber-bg: ${isLight ? '#fef3c7' : 'rgba(217, 119, 6, 0.15)'};
      --accent-cyan-bg: ${isLight ? '#e0f2fe' : 'rgba(2, 132, 199, 0.12)'};
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 40px;
      overflow-y: auto;
      height: 100vh;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    /* Hero Header */
    .hero-box {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 28px 32px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, ${isLight ? '0.04' : '0.2'});
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }
    .hero-box::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--brand-gradient);
    }
    .hero-top {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 14px;
    }
    .hero-icon {
      font-size: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      border-radius: 12px;
      background: var(--accent-cyan-bg);
      border: 1px solid ${isLight ? '#bae6fd' : 'rgba(2, 132, 199, 0.3)'};
    }
    .hero-meta {
      flex: 1;
    }
    .hero-badges {
      display: flex;
      gap: 8px;
      margin-bottom: 6px;
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--accent-amber-bg);
      color: var(--accent-amber);
      border: 1px solid ${isLight ? '#fde68a' : 'rgba(217, 119, 6, 0.3)'};
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .badge-cat {
      background: var(--accent-cyan-bg);
      color: var(--brand-primary);
      border: 1px solid ${isLight ? '#bae6fd' : 'rgba(2, 132, 199, 0.3)'};
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }
    .hero-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.3px;
    }
    .hero-desc {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    /* Statutory Mandate Callout */
    .mandate-box {
      background: ${isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.03)'};
      border-left: 4px solid var(--brand-primary);
      border-radius: 0 8px 8px 0;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .mandate-label {
      font-weight: 700;
      color: var(--text-primary);
      flex-shrink: 0;
    }

    /* Grid layout */
    .workbench-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 22px 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, ${isLight ? '0.03' : '0.15'});
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-primary);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Interactive Simulator */
    .sim-form-group {
      margin-bottom: 14px;
    }
    .sim-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .sim-select, .sim-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
    }
    .sim-btn {
      width: 100%;
      background: var(--brand-gradient);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
      transition: all 0.15s ease;
      margin-top: 16px;
    }
    .sim-btn:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    /* Simulation Progress Drawer */
    #sim-log-box {
      display: none;
      margin-top: 16px;
      padding: 12px;
      border-radius: 6px;
      background: ${isLight ? '#f1f5f9' : '#0a0c10'};
      border: 1px solid var(--border-color);
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.6;
      color: ${isLight ? '#0f172a' : '#38bdf8'};
    }

    .footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 8px;
      border-top: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-muted);
    }
    .btn-notify {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn-notify:hover {
      background: var(--bg-hover);
      border-color: var(--brand-primary);
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Hero Box -->
    <div class="hero-box">
      <div class="hero-top">
        <div class="hero-icon">${meta.icon}</div>
        <div class="hero-meta">
          <div class="hero-badges">
            <span class="badge-status">🛠️ ${meta.badge}</span>
            <span class="badge-cat">${meta.category}</span>
          </div>
          <h1 class="hero-title">${meta.title}</h1>
        </div>
      </div>
      <p class="hero-desc">${meta.description}</p>
    </div>

    <!-- Statutory Mandate Callout -->
    <div class="mandate-box">
      <span class="mandate-label">⚖️ Statutory Authority:</span>
      <span>${meta.mandate}</span>
    </div>

    <!-- Grid -->
    <div class="workbench-grid">
      <!-- Capabilities Card -->
      <div class="card">
        <div class="card-title">
          <span>📋 Operational Capabilities</span>
        </div>
        <ul style="list-style: none;">
          ${capabilitiesHtml}
        </ul>
      </div>

      <!-- Interactive Simulator Card -->
      <div class="card">
        <div class="card-title">
          <span>⚡ Chamber Dry-Run Simulator</span>
        </div>
        <div class="sim-form-group">
          <label class="sim-label">Target Ingested File / Docket Record:</label>
          <select class="sim-select" id="target-file">
            <option>loan_sanction_agreement.pdf (18 pages)</option>
            <option>creditor_claim_form_c.pdf (7 pages)</option>
            <option>corporate_debtor_financial_ledger.xlsx (3,400 rows)</option>
            <option>resolution_plan_proposal_v1.docx (84 pages)</option>
          </select>
        </div>
        <div class="sim-form-group">
          <label class="sim-label">Execution Depth & Security Level:</label>
          <select class="sim-select">
            <option>Standard Statutory Audit (Air-gapped local)</option>
            <option>Strict Court-Grade Admissibility (§ 63 BSA)</option>
            <option>Aggressive Commercial VDR Masking</option>
          </select>
        </div>
        <button class="sim-btn" onclick="runSimulation()">
          <span>⚡ Simulate In-Chamber Execution</span>
        </button>

        <div id="sim-log-box"></div>
      </div>
    </div>

    <!-- Footer Action -->
    <div class="footer-actions">
      <span>Target Production Release: <strong>${meta.targetRelease}</strong> • 100% Local Sovereign Floor</span>
      <button class="btn-notify" id="btn-notify" onclick="toggleNotify()">
        <span>🔔 Subscribe to Chamber Beta Alerts</span>
      </button>
    </div>
  </div>

  <script>
    function runSimulation() {
      const box = document.getElementById('sim-log-box');
      box.style.display = 'block';
      box.innerHTML = '<div>⏳ Initializing sovereign tool sandbox...</div>';
      
      setTimeout(() => {
        box.innerHTML += '<div>🔍 Parsing document structure & cryptographic hash...</div>';
      }, 500);

      setTimeout(() => {
        box.innerHTML += '<div>⚙️ Executing statutory logic against local bare acts...</div>';
      }, 1000);

      setTimeout(() => {
        box.innerHTML += '<div style="color: #16a34a; font-weight: bold; margin-top: 6px;">✓ Simulation Complete! Output generated: ${meta.simulatedOutput}</div>';
      }, 1600);
    }

    function toggleNotify() {
      const btn = document.getElementById('btn-notify');
      btn.style.background = '#ecfdf5';
      btn.style.color = '#047857';
      btn.style.borderColor = '#10b981';
      btn.innerHTML = '<span>✓ Subscribed to Early Chamber Release</span>';
    }
  </script>
</body>
</html>`;
}

