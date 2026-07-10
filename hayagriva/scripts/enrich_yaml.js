const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { getChatResponse } = require('../lib/llm-client');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const index = trimmed.indexOf('=');
        if (index > -1) {
            const key = trimmed.slice(0, index).trim();
            const val = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
            process.env[key] = val;
        }
    }
}

const LAWS_DIR = '/Users/atulgrover/Desktop/laws';

const SYSTEM_PROMPT = `You are an expert legal AI. Read the following text from a legal section.
Return ONLY valid JSON in this exact format, with no markdown formatting or extra text:
{
  "summary": "A clear, 2-sentence plain English summary of the core concepts.",
  "questions": ["How do I...", "What is the penalty for...", "Who can..."]
}`;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getAllMarkdownFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory() && !file.startsWith('.')) {
            results = results.concat(getAllMarkdownFiles(filePath));
        } else if (file.endsWith('.md')) {
            results.push(filePath);
        }
    }
    return results;
}

async function processFile(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const parsed = matter(fileContent);

        if (parsed.data && parsed.data.Summary && parsed.data.Questions) {
            return { skipped: true, reason: 'Already enriched' };
        }

        // Only take the first 3000 chars to avoid token limits for small local models
        const textToAnalyze = parsed.content.substring(0, 3000);
        
        if (textToAnalyze.trim().length < 50) {
            return { skipped: true, reason: 'Text too short' };
        }

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Text to analyze:\n${textToAnalyze}` }
        ];

        const { streamGemini } = require('../lib/llm-client');
        let responseText = '';
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('GEMINI_API_KEY missing in .env');
        for await (const chunk of streamGemini(messages, geminiKey)) {
            responseText += chunk;
        }
        
        // Clean JSON response
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
        if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
        cleanJson = cleanJson.trim();

        const result = JSON.parse(cleanJson);

        if (result.summary && result.questions) {
            parsed.data.Summary = result.summary;
            parsed.data.Questions = result.questions;
            
            const newContent = matter.stringify(parsed.content, parsed.data);
            fs.writeFileSync(filePath, newContent);
            return { skipped: false };
        } else {
            return { skipped: true, reason: 'Invalid JSON structure' };
        }

    } catch (e) {
        return { skipped: true, reason: `Error: ${e.message}` };
    }
}

async function main() {
    console.log(`[Enricher] Scanning ${LAWS_DIR} for markdown files...`);
    const files = getAllMarkdownFiles(LAWS_DIR);
    console.log(`[Enricher] Found ${files.length} files. Commencing AI Enrichment...`);

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = path.relative(LAWS_DIR, file);
        process.stdout.write(`[${i + 1}/${files.length}] ${relativePath} ... `);
        
        const result = await processFile(file);
        
        if (result.skipped) {
            skipped++;
            console.log(`SKIP (${result.reason})`);
        } else {
            processed++;
            console.log(`SUCCESS`);
            // Add a 1.5 second delay after successful generations to prevent API rate limits / thermal throttling
            await sleep(1500); 
        }
    }

    console.log(`\n[Enricher] COMPLETE!`);
    console.log(`Processed: ${processed}`);
    console.log(`Skipped/Failed: ${skipped}`);
}

main().catch(console.error);
