const assert = require('assert');

// Dynamically read extension.ts to extract convertToSnippet logic without importing TS files directly
const fs = require('fs');
const path = require('path');

function getSnippetFunction() {
    // Go up two directories from tests/ to reach workspace root, then into the frontend folder
    const extPath = path.join(__dirname, '../../frontend/theia-extensions/hayagriva/src/browser/extension.ts');
    const content = fs.readFileSync(extPath, 'utf8');
    
    // Extract the function body dynamically using regex
    const startIdx = content.indexOf('export function convertToSnippet');
    if (startIdx === -1) {
        throw new Error('Could not find convertToSnippet in extension.ts');
    }
    
    const funcText = content.substring(startIdx);
    
    // Evaluate the function body inside a sandbox context
    const cleanFunc = funcText
        .replace('export function convertToSnippet', 'function convertToSnippet')
        // Remove TypeScript type annotations
        .replace(/:\s*\{\s*snippet:\s*string,\s*hasSnippets:\s*boolean\s*\}/, '')
        .replace(/text:\s*string/, 'text');
        
    const fn = new Function(`${cleanFunc}; return convertToSnippet;`)();
    return fn;
}

async function run() {
    console.log('[Monaco Snippet & Tab-Stops Unit Tests]');

    const convertToSnippet = getSnippetFunction();

    // Test 1: Plain text with no placeholders
    console.log('  -> Testing plain text conversion (no placeholders)...');
    const t1 = 'This is a standard statutory section with no parameters.';
    const res1 = convertToSnippet(t1);
    assert.strictEqual(res1.snippet, t1, 'Snippet string should match original text');
    assert.strictEqual(res1.hasSnippets, false, 'hasSnippets should be false');

    // Test 2: Standard placeholder variables replacement
    console.log('  -> Testing variable conversions ([date], [amount], [name])...');
    const t2 = 'On [date], [name] agreed to pay [amount] to [company name].';
    const res2 = convertToSnippet(t2);
    
    console.log(`     Original: "${t2}"`);
    console.log(`     Snippet : "${res2.snippet}"`);
    
    assert.ok(res2.snippet.includes('${1:date}'), 'Should map [date] to first tabstop');
    assert.ok(res2.snippet.includes('${2:name}'), 'Should map [name] to second tabstop');
    assert.ok(res2.snippet.includes('${3:amount}'), 'Should map [amount] to third tabstop');
    assert.ok(res2.snippet.includes('${4:company_name}'), 'Should map [company name] to fourth tabstop');
    assert.strictEqual(res2.hasSnippets, true, 'hasSnippets should be true');

    // Test 3: Standard blank underscores replacement
    console.log('  -> Testing blank underscores replacement (_____)...');
    const t3 = 'The agreement is executed on this _____ day of _____ by _____.';
    const res3 = convertToSnippet(t3);
    
    console.log(`     Original: "${t3}"`);
    console.log(`     Snippet : "${res3.snippet}"`);
    
    assert.ok(res3.snippet.includes('${1:_____}'), 'Should map first underscore block to tabstop');
    assert.ok(res3.snippet.includes('${2:_____}'), 'Should map second underscore block to tabstop');
    assert.ok(res3.snippet.includes('${3:_____}'), 'Should map third underscore block to tabstop');
    assert.strictEqual(res3.hasSnippets, true, 'hasSnippets should be true');

    console.log('  ✓ SUCCESS: Snippet & Tab-Stops validations completed!');
}

module.exports = { run };
