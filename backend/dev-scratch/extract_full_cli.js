const fs = require('fs');
const readline = require('readline');

async function main() {
    const fileStream = fs.createReadStream('/Users/atulgrover/.gemini/antigravity-ide/brain/bd051f57-ea52-4bc3-abf6-263f2d9ea004/.system_generated/logs/transcript_full.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let index = 0;
    for await (const line of rl) {
        index++;
        try {
            const data = JSON.parse(line);
            if (data.tool_calls) {
                for (const call of data.tool_calls) {
                    if (call.name === 'write_to_file' && call.args.TargetFile && call.args.TargetFile.endsWith('/hayagriva/cli.js')) {
                        console.log(`\n--- [Step ${index}] Full write of hayagriva/cli.js ---`);
                        console.log(call.args.CodeContent.substring(0, 1500));
                        return;
                    }
                }
            }
        } catch (e) {}
    }
}

main();
