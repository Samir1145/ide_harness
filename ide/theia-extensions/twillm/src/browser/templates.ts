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
  
  <div class="section">
    <label>Select Document Type</label>
    
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
    
    <input type="file" id="file-input" class="hidden" />

    <div style="margin-top: 15px; display: flex; align-items: center; gap: 8px;">
      <input type="checkbox" id="chk-disable-doc2query" style="margin: 0; cursor: pointer; width: auto;" />
      <span style="font-size: 11px; font-weight: normal; cursor: pointer; opacity: 0.85;" onclick="document.getElementById('chk-disable-doc2query').click()">
        Disable LLM Ingestion Questions (Fast Upload)
      </span>
    </div>
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
        
        const oldContent = containerZone.innerHTML;
        containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Uploading...</p>';
        
        try {
          // Step 1: Upload raw binary to server
          const uploadRes = await fetch('http://127.0.0.1:3210/api/twillm/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, filename: file.name, content: base64 })
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) throw new Error(uploadData.error || 'Upload failed');

          // Step 2: Run conversion, layout parsing, and indexing immediately
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:var(--theia-brand-color1,#0ea5e9);">Converting & Ingesting...</p>';
          
          const ingestRes = await fetch('http://127.0.0.1:3210/api/twillm/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case: currentCaseName, file: uploadData.filePath, disableDoc2Query: document.getElementById('chk-disable-doc2query').checked })
          });
          const ingestData = await ingestRes.json();
          if (!ingestData.success) throw new Error(ingestData.error || 'Ingestion failed');

          // Step 3: Complete & refresh UI
          containerZone.innerHTML = '<p style="margin:0; font-size:12px; font-weight:bold; color:#10b981;">✓ Ingested Successfully</p>';
          if (window.parent) {
            window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName: currentCaseName }, '*');
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

export function chatHtml(currentCase: string): string {
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
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
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
  #log {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--theia-border-color, #ccc);
    background: var(--theia-layout-color3, #ffffff);
    padding: 10px;
    border-radius: 6px;
    margin-bottom: 12px;
    min-height: 0;
  }
  .message {
    margin-bottom: 12px;
    line-height: 1.5;
  }
  .user {
    font-weight: bold;
    color: var(--theia-brand-color1, #0ea5e9);
    margin-bottom: 4px;
  }
  .assistant {
    margin-bottom: 8px;
    white-space: pre-wrap;
  }
  .sources-panel {
    font-size: 11px;
    opacity: 0.8;
    background: var(--theia-layout-color1, #f9f9f9);
    padding: 6px 10px;
    border-radius: 4px;
    margin-top: 6px;
    border: 1px solid var(--theia-border-color, #eee);
  }
  .citation-link {
    color: var(--theia-brand-color1, #0ea5e9);
    text-decoration: underline;
    cursor: pointer;
    margin-right: 8px;
  }
  .input-panel {
    display: flex;
    gap: 8px;
  }
  #input {
    flex: 1;
    padding: 8px;
    background: var(--theia-layout-color3, #ffffff);
    color: var(--theia-ui-font-color1, #333333);
    border: 1px solid var(--theia-border-color, #ccc);
    border-radius: 4px;
    box-sizing: border-box;
    font-size: var(--theia-ui-font-size1, 13px);
  }
  #input:focus {
    outline: none;
    border-color: var(--theia-brand-color1, #0ea5e9);
  }
  .btn {
    background: var(--theia-brand-color1, #0ea5e9);
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn:hover {
    background: #0284c7;
  }
  .wiki-btn {
    background: #10b981;
    font-size: 11px;
    padding: 3px 8px;
    margin-top: 6px;
    border-radius: 3px;
    color: #fff;
    border: none;
    cursor: pointer;
    display: inline-block;
  }
  .wiki-btn:hover {
    background: #059669;
  }
</style>
</head>
<body>
  <div id="log"></div>
  <div class="input-panel">
    <input id="input" placeholder="Ask about this case..." autocomplete="off" />
    <button id="send" class="btn">Send</button>
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

    const log = document.getElementById('log');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    
    let currentCase = '${currentCase}';

    window.addEventListener('message', (event) => {
      if (event.data) {
        if (event.data.type === 'prefill-query') {
          input.value = event.data.query;
          input.focus();
        } else if (event.data.type === 'select-case') {
          currentCase = event.data.caseName;
        }
      }
    });

    function navigateCitation(filePath, anchor) {
      window.parent.postMessage({
        type: 'open-citation',
        filePath: filePath,
        anchor: anchor
      }, '*');
    }

    async function saveToWiki(question, answer, sources) {
      const title = prompt('Enter a title for this case wiki card:', question);
      if (!title) return;

      const safeTitle = title.toLowerCase().replace(/[^a-z0-9\\s-_]/g, '').trim().substring(0, 40).replace(/\\s+/g, '_');
      
      const mdContent = \`---
title: "\${title.replace(/"/g, '\\\\"')}"
question: "\${question.replace(/"/g, '\\\\"')}"
sources: \${JSON.stringify(sources)}
savedAt: "\${new Date().toISOString()}"
tags: ["wiki-card", "\${currentCase}"]
---
# \${title}

\${answer}

\${sources.map(s => \`[\${s}](\${s.replace(/\\.(pdf|docx|xlsx|doc|xls)$/i, '.md')})\`).join(' | ')}
\`;

      try {
        const b64 = btoa(unescape(encodeURIComponent(mdContent)));
        const res = await fetch('http://127.0.0.1:3210/api/twillm/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case: currentCase,
            filename: 'wiki/' + safeTitle + '.md',
            content: b64
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to save');
        
        alert('Wiki card saved successfully!');
        window.parent.postMessage({ type: 'refresh-wiki-explorer', caseName: currentCase }, '*');
      } catch (e) {
        alert('Failed to save to wiki: ' + e.message);
      }
    }

    async function send() {
      const q = input.value.trim();
      if (!q) return;

      const userHeader = document.createElement('div');
      userHeader.className = 'user';
      userHeader.textContent = 'You';
      const userText = document.createElement('div');
      userText.className = 'message';
      userText.textContent = q;
      log.appendChild(userHeader);
      log.appendChild(userText);
      
      input.value = '';
      sendBtn.disabled = true;

      const assistantHeader = document.createElement('div');
      assistantHeader.className = 'user';
      assistantHeader.style.color = '#10b981';
      assistantHeader.textContent = 'RAG Assistant';
      const assistantText = document.createElement('div');
      assistantText.className = 'assistant message';
      assistantText.textContent = 'Thinking...';
      
      log.appendChild(assistantHeader);
      log.appendChild(assistantText);
      log.scrollTop = log.scrollHeight;

      try {
        const response = await fetch('http://127.0.0.1:3210/api/twillm/query-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case: currentCase, query: q })
        });

        if (!response.ok) throw new Error('Failed to query local server');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let answerText = '';
        assistantText.textContent = ''; // Clear thinking

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(cleanLine.slice(6));
              if (data.content) {
                answerText += data.content;
                assistantText.textContent = answerText;
              }
              if (data.done) {
                if (data.sources && data.sources.length > 0) {
                  const sourcesPanel = document.createElement('div');
                  sourcesPanel.className = 'sources-panel';
                  sourcesPanel.innerHTML = '<strong>Citations:</strong> ';
                  
                  data.sources.forEach(src => {
                    const span = document.createElement('span');
                    span.className = 'citation-link';
                    span.textContent = src;
                    
                    let anchor = 'Page_1';
                    const pageMatch = answerText.match(/Page\\s+(\\d+)/i);
                    if (pageMatch) anchor = 'Page_' + pageMatch[1];
                    
                    span.onclick = () => navigateCitation(src, anchor);
                    sourcesPanel.appendChild(span);
                  });
                  assistantText.appendChild(sourcesPanel);
                }

                const wikiBtn = document.createElement('button');
                wikiBtn.className = 'wiki-btn';
                wikiBtn.textContent = '💾 Save to Case Wiki';
                wikiBtn.onclick = () => saveToWiki(q, answerText, data.sources || []);
                assistantText.appendChild(wikiBtn);
              }
            } catch (e) {
              console.error('Failed to parse line:', cleanLine, e.message);
            }
          }
        }
      } catch (e) {
        assistantText.textContent = 'Error: ' + e.message;
      } finally {
        sendBtn.disabled = false;
        log.scrollTop = log.scrollHeight;
      }
    }

    sendBtn.onclick = send;
    input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
  </script>
</body>
</html>`;
}


