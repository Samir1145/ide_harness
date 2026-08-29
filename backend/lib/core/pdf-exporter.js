const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const MarkdownIt = require('markdown-it');

/**
 * Finds available Chromium / Chrome / Edge browser executable on the host system.
 */
function findBrowserExecutable() {
    const candidatePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
    ];
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

/**
 * Compiles a Markdown file into a court/IBBI compliant A4 PDF document.
 * 
 * @param {string} mdPath - Absolute path to the source Markdown file.
 * @param {string} pdfPath - Absolute destination path for the PDF file.
 * @param {Object} options - Custom header/title options.
 */
async function exportMarkdownToPdfFile(mdPath, pdfPath, options = {}) {
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    const htmlBody = md.render(mdContent);

    const title = options.title || path.basename(mdPath, '.md').replace(/_/g, ' ');

    const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <style>
        @page {
            size: A4;
            margin: 20mm 15mm 20mm 15mm;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.5;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }
        .header-badge {
            text-align: center;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 10px;
            margin-bottom: 16px;
        }
        .header-badge h1 {
            color: #0369a1;
            font-size: 15pt;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .header-badge p {
            color: #64748b;
            font-size: 8.5pt;
            margin: 0;
            font-weight: 500;
        }
        h1, h2, h3, h4 {
            color: #0f172a;
            margin-top: 12pt;
            margin-bottom: 6pt;
        }
        h1 { font-size: 13pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        h2 { font-size: 11.5pt; color: #0369a1; }
        h3 { font-size: 10.5pt; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10pt 0;
            font-size: 9pt;
            page-break-inside: auto;
        }
        tr {
            page-break-inside: avoid;
            page-break-after: auto;
        }
        th, td {
            border: 1px solid #cbd5e1;
            padding: 5pt 7pt;
            vertical-align: top;
            text-align: left;
        }
        th {
            background-color: #f1f5f9;
            color: #334155;
            font-weight: 600;
        }
        tr:nth-child(even) td {
            background-color: #f8fafc;
        }
        p {
            margin: 5pt 0;
            text-align: justify;
        }
        ul, ol {
            margin: 5pt 0 5pt 18pt;
            padding: 0;
        }
        li {
            margin-bottom: 3pt;
        }
        blockquote {
            margin: 8pt 0;
            padding: 6pt 10pt;
            background: #f8fafc;
            border-left: 3px solid #0284c7;
            color: #334155;
        }
        hr {
            border: none;
            border-top: 1px solid #cbd5e1;
            margin: 12pt 0;
        }
    </style>
    </head>
    <body>
        <div class="header-badge">
            <h1>${title}</h1>
            <p>HAYAGRIVA LEGAL INTELLIGENCE • STATUTORY CIRP COMPLIANCE</p>
        </div>
        ${htmlBody}
    </body>
    </html>
    `;

    const executablePath = findBrowserExecutable();
    if (!executablePath) {
        throw new Error('No supported Chromium/Chrome browser executable found for PDF generation.');
    }

    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
        
        const parentDir = path.dirname(pdfPath);
        if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
        }

        await page.pdf({
            path: pdfPath,
            format: 'A4',
            margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
            printBackground: true,
            displayHeaderFooter: true,
            footerTemplate: '<div style="font-size:8pt; font-family: -apple-system, sans-serif; width:100%; text-align:right; padding-right:15mm; color:#94a3b8;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> • Generated by Hayagriva AI</div>',
            headerTemplate: '<div></div>'
        });

        console.log(`[PDF Exporter] ✓ Successfully generated PDF at "${pdfPath}"`);
    } finally {
        await browser.close();
    }
}

module.exports = {
    exportMarkdownToPdfFile,
    findBrowserExecutable
};
