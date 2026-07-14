const fs = require('fs');
const path = require('path');
const urllib = require('url');

/**
 * Prefills a form HTML template by injecting a client-side hydration script,
 * copies assets, and compiles a minified browser bookmarklet.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} formId - Identifier of the form (e.g. 'aoc-4')
 * @param {Object} populatedFields - Mapped fields from filled-<formId>.json
 * @returns {Promise<Object>} Paths to filled HTML and compiled bookmarklet text
 */
async function exportFormInstance(caseDir, formId, populatedFields) {
    console.log(`[Form Exporter] Exporting form "${formId}"...`);

    const formsRoot = path.join(__dirname, '..', '..', '..', '..', 'forms');
    const templateHtmlPath = path.join(formsRoot, formId, 'template.html');
    const bookmarkletTplPath = path.join(formsRoot, formId, 'bookmarklet_template.js');

    if (!fs.existsSync(templateHtmlPath)) {
        throw new Error(`Template HTML not found for form "${formId}": ${templateHtmlPath}`);
    }

    // Extract flat key-value dictionary
    const flatData = {};
    for (const key in populatedFields) {
        flatData[key] = populatedFields[key].value;
    }

    const exportsDir = path.join(caseDir, 'exports');
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    const filledHtmlName = `filled_${formId}.html`;
    const destHtmlPath = path.join(exportsDir, filledHtmlName);

    // 1. Copy template asset folders if present (e.g., template_files)
    const templateFilesPath = path.join(formsRoot, formId, 'template_files');
    const destFilesPath = path.join(exportsDir, 'template_files');
    if (fs.existsSync(templateFilesPath)) {
        fs.mkdirSync(destFilesPath, { recursive: true });
        // Recursive copy
        function copyDir(src, dest) {
            const files = fs.readdirSync(src);
            for (const file of files) {
                const srcFile = path.join(src, file);
                const destFile = path.join(dest, file);
                if (fs.statSync(srcFile).isDirectory()) {
                    fs.mkdirSync(destFile, { recursive: true });
                    copyDir(srcFile, destFile);
                } else {
                    fs.copyFileSync(srcFile, destFile);
                }
            }
        }
        copyDir(templateFilesPath, destFilesPath);
    }

    // 2. Read template HTML and inject client-side hydration script
    let htmlContent = fs.readFileSync(templateHtmlPath, 'utf8');

    const hydrationScript = `
<!-- HAYAGRIVA AUTOFILL HYDRATOR -->
<script>
(function() {
    const DATA = ${JSON.stringify(flatData, null, 2)};
    const RADIO_MAP = {
        'Yes': '-1_widget', 'No': '-2_widget', 'NA': '-3_widget',
        'Firm': '-2_widget', 'Individual': '-1_widget', 'Original': '-1_widget'
    };

    function hydrate() {
        console.log("[Hayagriva Hydrator] Starting DOM prefill...");
        hydrateDoc(document);

        const iframe = document.getElementById('aemFormFrame') || document.querySelector('iframe');
        if (iframe) {
            const runIframe = () => {
                try {
                    if (iframe.contentDocument) {
                        console.log("[Hayagriva Hydrator] Hydrating embedded iframe form...");
                        hydrateDoc(iframe.contentDocument);
                    }
                } catch (e) {
                    console.warn("[Hayagriva Hydrator] Iframe access error:", e);
                }
            };
            runIframe();
            iframe.onload = runIframe;
        }
        console.log("[Hayagriva Hydrator] Prefill complete.");
    }

    function hydrateDoc(doc) {
        for (const className in DATA) {
            const val = DATA[className];
            if (val === 'XXXX' || !val) continue;

            const wrappers = doc.getElementsByClassName(className);
            if (wrappers.length === 0) continue;

            for (const wrapper of wrappers) {
                // Check for select elements
                const select = wrapper.querySelector('select');
                if (select) {
                    select.value = val;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    continue;
                }

                // Check for radio buttons
                const radio = wrapper.querySelector('input[type="radio"]');
                if (radio) {
                    const suffix = RADIO_MAP[val];
                    if (suffix) {
                        const radios = wrapper.querySelectorAll('input[type="radio"]');
                        for (let i = 0; i < radios.length; i++) {
                            if (radios[i].id.endsWith(suffix)) {
                                radios[i].checked = true;
                                radios[i].dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }
                    }
                    continue;
                }

                // Check for standard text inputs/textareas
                const input = wrapper.querySelector('input, textarea');
                if (input) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hydrate);
    } else {
        hydrate();
    }
})();
</script>
`;

    // Inject before </body> tag if found, otherwise append at the end
    const bodyIdx = htmlContent.toLowerCase().lastIndexOf('</body>');
    if (bodyIdx !== -1) {
        htmlContent = htmlContent.substring(0, bodyIdx) + hydrationScript + htmlContent.substring(bodyIdx);
    } else {
        htmlContent += hydrationScript;
    }

    fs.writeFileSync(destHtmlPath, htmlContent, 'utf8');
    console.log(`[Form Exporter] Wrote prefilled HTML review form to: ${filledHtmlName}`);

    // 3. Compile bookmarklet if template exists
    let bookmarkletCode = '';
    const bkTxtName = `filled_${formId}_bookmarklet.txt`;
    const destBkPath = path.join(exportsDir, bkTxtName);

    if (fs.existsSync(bookmarkletTplPath)) {
        const tplJs = fs.readFileSync(bookmarkletTplPath, 'utf8');
        const fieldsJson = JSON.stringify(flatData, null, 2);
        
        let compiledJs = tplJs.replace('__FIELDS_JSON__', fieldsJson);
        compiledJs = compiledJs.replace('AOC-4', formId.toUpperCase());

        // Simple Minifier: Remove single line comments, multi-line comments, and extra spaces
        let minified = compiledJs.replace(/\/\/.*?\n/g, '\n');
        minified = minified.replace(/\/\*.*?\*\//gs, '');
        minified = minified.replace(/\s+/g, ' ').trim();

        // URI encode for bookmarklet
        const encoded = encodeURIComponent(minified);
        bookmarkletCode = 'javascript:' + encoded;

        fs.writeFileSync(destBkPath, bookmarkletCode, 'utf8');
        console.log(`[Form Exporter] Compiled browser bookmarklet: ${bkTxtName}`);
    }

    return {
        filledHtmlPath: destHtmlPath,
        filledHtmlName,
        bookmarkletPath: destBkPath,
        bookmarkletName: bkTxtName,
        bookmarkletCode
    };
}

module.exports = { exportFormInstance };
