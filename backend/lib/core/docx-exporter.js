const fs = require('fs');
const path = require('path');
const docx = require('docx');
const MarkdownIt = require('markdown-it');

const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    HeadingLevel
} = docx;

// Layout specs in Twips (1 inch = 1440 twips; 1 cm = 566.9 twips)
const A4_WIDTH = 11906;              // 21 cm
const A4_HEIGHT = 16838;             // 29.7 cm
const MARGIN_TOP_BOTTOM = 1134;      // 2 cm
const MARGIN_LEFT_RIGHT = 2268;      // 4 cm

function compileMarkdownToDocx(markdownContent) {
    const md = new MarkdownIt();
    const tokens = md.parse(markdownContent, {});

    const paragraphs = [];
    let currentParagraphChildren = [];
    let inHeading = false;
    let headingLevel = 1;
    let inBlockquote = false;
    let inList = false;
    let listType = ''; // 'bullet' or 'ordered'
    let orderIndex = 1;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === 'heading_open') {
            inHeading = true;
            headingLevel = parseInt(token.tag.substring(1), 10);
            currentParagraphChildren = [];
        } else if (token.type === 'heading_close') {
            inHeading = false;
            // Spacing: 1.5 line spacing (360 twips)
            const headingPara = new Paragraph({
                children: currentParagraphChildren,
                heading: headingLevel === 1 ? HeadingLevel.HEADING_1 :
                         headingLevel === 2 ? HeadingLevel.HEADING_2 :
                         headingLevel === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4,
                spacing: { before: 240, after: 120, line: 360 },
            });
            paragraphs.push(headingPara);
            currentParagraphChildren = [];
        } else if (token.type === 'paragraph_open') {
            currentParagraphChildren = [];
        } else if (token.type === 'paragraph_close') {
            const spacing = inBlockquote ? 
                { before: 120, after: 120, line: 240 } : // 1.0 (single) line spacing for quotes (240 twips)
                { before: 120, after: 120, line: 360 }; // 1.5 line spacing for body (360 twips)

            const paraOpts = {
                children: currentParagraphChildren,
                spacing: spacing,
                alignment: AlignmentType.JUSTIFY,
            };

            if (inBlockquote) {
                paraOpts.indent = { left: 720, right: 720 }; 
            } else if (inList) {
                paraOpts.indent = { left: 720, hanging: 360 };
            }

            paragraphs.push(new Paragraph(paraOpts));
            currentParagraphChildren = [];
        } else if (token.type === 'blockquote_open') {
            inBlockquote = true;
        } else if (token.type === 'blockquote_close') {
            inBlockquote = false;
        } else if (token.type === 'bullet_list_open') {
            inList = true;
            listType = 'bullet';
        } else if (token.type === 'bullet_list_close') {
            inList = false;
        } else if (token.type === 'ordered_list_open') {
            inList = true;
            listType = 'ordered';
            orderIndex = 1;
        } else if (token.type === 'ordered_list_close') {
            inList = false;
        } else if (token.type === 'list_item_open') {
            currentParagraphChildren = [];
            if (listType === 'bullet') {
                currentParagraphChildren.push(new TextRun({
                    text: '•\t',
                    font: 'Times New Roman',
                    size: 24,
                }));
            } else {
                currentParagraphChildren.push(new TextRun({
                    text: `${orderIndex}.\t`,
                    font: 'Times New Roman',
                    size: 24,
                }));
                orderIndex++;
            }
        } else if (token.type === 'list_item_close') {
            paragraphs.push(new Paragraph({
                children: currentParagraphChildren,
                spacing: { before: 60, after: 60, line: 360 },
                indent: { left: 720, hanging: 360 },
            }));
            currentParagraphChildren = [];
        } else if (token.type === 'inline') {
            const children = token.children || [];
            let isBold = false;
            let isItalic = false;

            for (const child of children) {
                if (child.type === 'strong_open') {
                    isBold = true;
                } else if (child.type === 'strong_close') {
                    isBold = false;
                } else if (child.type === 'em_open') {
                    isItalic = true;
                } else if (child.type === 'em_close') {
                    isItalic = false;
                } else if (child.type === 'text') {
                    currentParagraphChildren.push(new TextRun({
                        text: child.content,
                        font: 'Times New Roman',
                        size: inBlockquote ? 20 : 24, // 10pt (20 half-pt) for quotes; 12pt (24 half-pt) for body
                        bold: isBold || inHeading,
                        italic: isItalic,
                    }));
                } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
                    currentParagraphChildren.push(new TextRun({
                        text: '\n',
                    }));
                }
            }
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    size: {
                        width: A4_WIDTH,
                        height: A4_HEIGHT,
                    },
                    margins: {
                        top: MARGIN_TOP_BOTTOM,
                        bottom: MARGIN_TOP_BOTTOM,
                        left: MARGIN_LEFT_RIGHT,
                        right: MARGIN_LEFT_RIGHT,
                    },
                },
            },
            children: paragraphs,
        }],
    });

    return doc;
}

async function exportMarkdownToDocxFile(mdPath, docxPath) {
    console.log(`[DOCX Exporter] Compiling "${mdPath}" to "${docxPath}"...`);
    const content = fs.readFileSync(mdPath, 'utf8');
    const doc = compileMarkdownToDocx(content);
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(docxPath, buffer);
    console.log(`[DOCX Exporter] ✓ Successfully generated Supreme Court formatted document at "${docxPath}"`);
}

module.exports = {
    compileMarkdownToDocx,
    exportMarkdownToDocxFile
};
