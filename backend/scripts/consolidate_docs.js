const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const docsDir = path.join(repoRoot, 'docs');

function run() {
    console.log('[Doc Consolidation Tool] Starting documentation rationalisation...');

    // 1. Merge docs/agents/*.md into docs/agents_reference_guide.md
    const agentsDir = path.join(docsDir, 'agents');
    const referenceGuidePath = path.join(docsDir, 'agents_reference_guide.md');

    if (fs.existsSync(agentsDir)) {
        console.log('  -> Reading individual agent markdown files...');
        const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();
        
        let referenceContent = '# HAYAGRIVA Cognitive Agents Reference Guide\n\n';
        referenceContent += 'This guide details the specialized operational parameters, input/output structures, and decision flows for all 9 cognitive agents in the HAYAGRIVA workspace.\n\n---\n\n';

        for (const file of files) {
            const filePath = path.join(agentsDir, file);
            console.log(`     - Merging: ${file}`);
            const content = fs.readFileSync(filePath, 'utf8');
            referenceContent += content + '\n\n---\n\n';
        }

        fs.writeFileSync(referenceGuidePath, referenceContent, 'utf8');
        console.log(`  ✓ Successfully compiled unified guide: docs/agents_reference_guide.md`);
        
        // Remove individual files and directory
        for (const file of files) {
            fs.unlinkSync(path.join(agentsDir, file));
        }
        fs.rmdirSync(agentsDir);
        console.log('  ✓ Cleaned up docs/agents/ folder.');
    } else {
        console.log('  - docs/agents/ directory already removed or compiled.');
    }

    // 2. Merge docs/internal/product_roadmap.md into docs/future_roadmap.md
    const productRoadmapPath = path.join(docsDir, 'internal', 'product_roadmap.md');
    const futureRoadmapPath = path.join(docsDir, 'future_roadmap.md');

    if (fs.existsSync(productRoadmapPath) && fs.existsSync(futureRoadmapPath)) {
        console.log('  -> Merging unique product pillars into docs/future_roadmap.md...');
        const productContent = fs.readFileSync(productRoadmapPath, 'utf8');
        const futureContent = fs.readFileSync(futureRoadmapPath, 'utf8');

        // Extract "Core Product Pillars", "Out-of-the-Box Concept Adaptations", and "Monetisation" from product roadmap
        const sectionsToExtract = [];
        const lines = productContent.split('\n');
        
        let inSection = false;
        let sectionText = '';
        
        for (const line of lines) {
            if (line.startsWith('## Core Product Pillars') || 
                line.startsWith('## Out-of-the-Box (OOB) Concept Adaptations') || 
                line.startsWith('## Monetisation & Subscription Model')) {
                if (inSection) {
                    sectionsToExtract.push(sectionText);
                }
                inSection = true;
                sectionText = line + '\n';
            } else if (line.startsWith('## Feature Implementation Status Dashboard')) {
                if (inSection) {
                    sectionsToExtract.push(sectionText);
                }
                inSection = false;
                sectionText = '';
            } else if (inSection) {
                sectionText += line + '\n';
            }
        }
        if (inSection && sectionText) {
            sectionsToExtract.push(sectionText);
        }

        let updatedFutureContent = futureContent;
        if (sectionsToExtract.length > 0) {
            const insertionIndex = futureContent.indexOf('## Phase 1: Core Pipeline Stability');
            if (insertionIndex !== -1) {
                const prefix = futureContent.substring(0, insertionIndex);
                const suffix = futureContent.substring(insertionIndex);
                updatedFutureContent = prefix + '# Product Pillars & Commercial Strategy\n\n' + sectionsToExtract.join('\n\n') + '\n---\n\n' + suffix;
            }
        }

        fs.writeFileSync(futureRoadmapPath, updatedFutureContent, 'utf8');
        console.log('  ✓ Merged roadmap specifications successfully into docs/future_roadmap.md.');
        
        fs.unlinkSync(productRoadmapPath);
        console.log('  ✓ Removed docs/internal/product_roadmap.md.');
    }

    // 3. Clean up other stale files
    const staleFiles = [
        path.join(docsDir, 'internal', 'implementation_plan.md'),
        path.join(docsDir, 'technologies', 'step1_ingestion.md'),
        path.join(docsDir, 'technologies', 'step2_monaco.md'),
        path.join(docsDir, 'technologies', 'step3_agents.md'),
    ];

    staleFiles.forEach(f => {
        if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            console.log(`  ✓ Cleaned up stale file: ${path.relative(repoRoot, f)}`);
        }
    });

    const techDir = path.join(docsDir, 'technologies');
    if (fs.existsSync(techDir) && fs.readdirSync(techDir).length === 0) {
        fs.rmdirSync(techDir);
        console.log('  ✓ Cleaned up empty docs/technologies/ folder.');
    }

    console.log('[Doc Consolidation Tool] Finished rationalisation successfully!\n');
}

run();
