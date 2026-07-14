const fs = require('fs');
const https = require('https');

/**
 * Uploads a raw PDF binary directly to Google Gemini Multimodal API
 * to extract visual text flows, tables, and structures.
 */
async function convertPdfVisually(filePath, apiKey) {
    console.log(`[Multimodal Parser] Visually extracting PDF with Gemini: ${filePath}`);
    const pdfBase64 = fs.readFileSync(filePath).toString('base64');
    
    const postData = JSON.stringify({
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: pdfBase64
                        }
                    },
                    {
                        text: 'Analyze this PDF document. Transcribe all text, preserving tables, headings, lists, signatures, and document layout formatting. Output the result as clean Markdown.'
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
        }
    });

    const apiPath = `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: apiPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Gemini Multimodal API returned status ${res.statusCode}: ${body}`));
                }
                try {
                    const json = JSON.parse(body);
                    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (!text) {
                        return reject(new Error('No content returned from Gemini Multimodal API'));
                    }
                    resolve(text);
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

module.exports = { convertPdfVisually };
