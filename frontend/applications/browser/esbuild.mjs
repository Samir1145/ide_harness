/**
 * This file can be edited to adjust the ESBuild build process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch, __dirname, join } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { copy } from 'esbuild-plugin-copy';
import fs from 'node:fs';
import path from 'node:path';

import esbuild from 'esbuild';

// serve favicon from root and inject link tag into index.html
browserOptions.plugins.push(
    copy({
        assets: [{
            from: join(__dirname, 'ico', '**', '*'),
            to: join(__dirname, 'lib', 'frontend')
        }]
    }),
    {
        name: 'favicon-link',
        setup(build) {
            build.onEnd(() => {
                const indexPath = path.join(__dirname, 'lib', 'frontend', 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    let modified = false;
                    if (!html.includes('rel="icon"')) {
                        html = html.replace('</head>', '  <link rel="icon" type="image/x-icon" href="./favicon.ico">\n</head>');
                        modified = true;
                    }
                    if (!html.includes('theia-ChatInput-Editor-Box')) {
                        const styleBlock = `  <style>\n    .theia-WelcomeMessage:not(.hayagriva-welcome-banner),\n    .theia-WelcomeMessage-Main:not(.hayagriva-welcome-banner),\n    .theia-WelcomeMessage-Compact,\n    .theia-WelcomeMessage-Divider {\n      display: none !important;\n      height: 0 !important;\n      margin: 0 !important;\n      padding: 0 !important;\n      overflow: hidden !important;\n    }\n    .theia-ChatInput-Editor-Box {\n      display: grid !important;\n      grid-template-columns: auto 1fr auto !important;\n      align-items: center !important;\n      min-height: 42px !important;\n      border-radius: 22px !important;\n      padding: 4px 8px !important;\n      margin: 0 10px 10px 10px !important;\n      box-sizing: border-box !important;\n    }\n    .theia-ChatInputOptions { display: contents !important; }\n    .theia-ChatInputOptions .codicon-attach, .theia-ChatInput-ModeSelector, .theia-ChatInputOptions .codicon-tools, .theia-ChatInput-ModelSelector-container { display: none !important; width: 0 !important; height: 0 !important; }\n    .theia-ChatInputOptions .theia-ChatInputOptions-left { grid-column: 1 !important; grid-row: 1 !important; }\n    .theia-ChatInput-Editor { grid-column: 2 !important; grid-row: 1 !important; min-height: 24px !important; }\n    .theia-ChatInputOptions .theia-ChatInputOptions-right { grid-column: 3 !important; grid-row: 1 !important; }\n  </style>\n</head>`;
                        html = html.replace('</head>', styleBlock);
                        modified = true;
                    }
                    if (modified) {
                        fs.writeFileSync(indexPath, html);
                    }
                }
            });
        }
    }
);

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);


if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch(),
    ]);
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
    } catch {
        process.exit(1);
    }
}
