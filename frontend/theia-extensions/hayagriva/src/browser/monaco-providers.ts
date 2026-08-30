import { injectable, inject } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { HayagrivaLspClient } from './lsp-client';

import * as monaco from '@theia/monaco-editor-core';

const HAYAGRIVA_NS = 'hayagriva';

@injectable()
export class HayagrivaMonacoProviders {
  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
    @inject(ILogger) protected readonly logger: ILogger,
    @inject(HayagrivaLspClient) protected readonly lspClient: HayagrivaLspClient
  ) {}

  protected getBackendUrl(): string {
    const port = this.preferenceService.get<number>('hayagriva.apiPort', 3210);
    return `http://127.0.0.1:${port}`;
  }

  protected getHoverLimit(): number {
    return this.preferenceService.get<number>('hayagriva.hoverLimit', 5);
  }

  registerAllProviders(getCaseNameFn: () => string): void {
    this.registerLinkProvider();
    this.registerLawCompletion(getCaseNameFn);
    this.registerLawHoverProvider();
  }

  // ─── 1. Citation Link Provider ─────────────────────────────────────────────
  registerLinkProvider(): void {
    if (monaco && monaco.languages && monaco.languages.registerLinkProvider) {
      monaco.languages.registerLinkProvider('markdown', {
          provideLinks: (model: any) => {
            const links: any[] = [];
            const text = model.getValue();
            const regex = /\[\[([a-zA-Z0-9_\-.]+(?:\.pdf|\.docx|\.doc|\.xlsx|\.xls)?)(?:#page=(\d+))?\]\]/g;
            let match;

            while ((match = regex.exec(text)) !== null) {
              const startPos = model.getPositionAt(match.index);
              const endPos = model.getPositionAt(match.index + match[0].length);
              const docName = match[1];
              const pageNum = match[2] || '1';

              if (monaco.Range) {
                links.push({
                  range: new monaco.Range(
                    startPos.lineNumber,
                    startPos.column,
                    endPos.lineNumber,
                    endPos.column
                  ),
                  url: `hayagriva-citation://${encodeURIComponent(docName)}?page=${pageNum}`,
                  tooltip: `Open Citation Side-by-Side: ${docName} (Page ${pageNum})`
                });
              }
            }
            return { links };
          }
      });
      this.logger.info('[HAYAGRIVA] Successfully registered Monaco Link Provider for Citations.');
    }
  }

  // ─── 2. Autocompletions (@@ & /) + Inline Ghost Text ───────────────────────
  registerLawCompletion(getCaseNameFn: () => string): void {
    const cache = new Map<string, any[]>();

    const fetchCompletions = async (triggerText: string): Promise<any[]> => {
      if (cache.has(triggerText)) return cache.get(triggerText)!;
      try {
        const res = await fetch(
          `${this.getBackendUrl()}/api/laws/query?q=${encodeURIComponent(triggerText)}&n=${this.getHoverLimit()}`
        );
        if (!res.ok) return [];
        const json = await res.json();
        const results = json.results || [];
        cache.set(triggerText, results);
        if (cache.size > 200) {
          const firstKey = cache.keys().next().value;
          if (firstKey !== undefined) cache.delete(firstKey);
        }
        return results;
      } catch {
        return [];
      }
    };

    const LANGS = ['markdown', 'plaintext'];

    for (const lang of LANGS) {
      // ── Standard Completion Item Provider (@ and / triggers) ───────────────
      monaco.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['@', '/', ' ', ':', '-', '_'],
          provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
            const lineText: string = model.getLineContent(position.lineNumber);
            const textUpToCursor = lineText.substring(0, position.column - 1);
            const currentCase = getCaseNameFn();

            // ── A. Statutory Law & Concepts Trigger (@@ or @) ──────────────────────
            const atMatch = textUpToCursor.match(/(?:^|\s)@@?([\w\s./,-]*)$/);
            if (atMatch) {
              const atIdx = textUpToCursor.search(/(?:^|\s)@@?([\w\s./,-]*)$/);
              const matchStr = atMatch[0];
              const atSymbolIdx = matchStr.indexOf('@') + atIdx;
              const typedPrefix = textUpToCursor.substring(atSymbolIdx);

              const replaceRange = new monaco.Range(
                position.lineNumber,
                atSymbolIdx + 1,
                position.lineNumber,
                position.column
              );

              const rawAt = atMatch[1];
              const query = rawAt.trim();

              if (!query) {
                const categorySuggestions = [
                  {
                    label: `${typedPrefix}precedent/ - Search Court Precedents & Judgments`,
                    filterText: `${typedPrefix}precedent case rulings orders judgments supreme court nclat`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}precedent/`,
                    range: replaceRange,
                    detail: 'Case Law Vault (17,500+ Judgments)'
                  },
                  {
                    label: `${typedPrefix}ibc/ - Search Insolvency & Bankruptcy Code`,
                    filterText: `${typedPrefix}ibc`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}ibc/`,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  },
                  {
                    label: `${typedPrefix}mca/ - Search Companies Act & Rules`,
                    filterText: `${typedPrefix}mca`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}mca/`,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  },
                  {
                    label: `${typedPrefix}sec - Search Statutory Sections`,
                    filterText: `${typedPrefix}sec`,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: `${typedPrefix}sec `,
                    range: replaceRange,
                    detail: 'Statutory Law Vault'
                  }
                ];
                return { suggestions: categorySuggestions };
              }

              const rawAtLower = rawAt.toLowerCase();
              if (rawAtLower.startsWith('precedent') || rawAtLower.startsWith('case')) {
                const prefixLength = rawAtLower.startsWith('precedent') ? 9 : 4;
                const prefixCmd = rawAt.split(/[\s/]+/)[0] || 'precedent';
                const subQuery = rawAt.substring(prefixLength).replace(/^[\/\s]+/, '').trim();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/learning-curves?case=${encodeURIComponent(currentCase)}&query=${encodeURIComponent(subQuery)}`);
                  if (!token.isCancellationRequested && res.ok) {
                    const data = await res.json();
                    const list = data.learningCurves || [];
                    const suggestions = list.map((c: any) => ({
                      label: `${typedPrefix}${prefixCmd}: ${c.case_title}`,
                      filterText: `${typedPrefix}${rawAt} ${c.case_title.toLowerCase()}`,
                      kind: monaco.languages.CompletionItemKind.Reference,
                      insertText: c.content || `[${c.case_title}](${c.filename})`,
                      range: replaceRange,
                      detail: `${c.court_tribunal ? `[${c.court_tribunal}] ` : ''}${c.citation || 'Case Summary'}`,
                      documentation: `${c.case_title}\n\n${c.court_tribunal ? `Court: ${c.court_tribunal}\n` : ''}${c.date_of_order ? `Date: ${c.date_of_order}\n` : ''}${c.issue ? `Issue: ${c.issue}\n\n` : ''}${c.content ? c.content.substring(0, 300) + '...' : ''}`
                    }));
                    return { suggestions };
                  }
                } catch (_) {}
              }

              const results = await fetchCompletions(query);
              if (token.isCancellationRequested) return { suggestions: [] };

              const suggestions = results.map((r: any) => {
                const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                const { snippet, hasSnippets } = convertToSnippet(cleanText);

                return {
                  label: `${typedPrefix}${r.id} - ${r.title || `Section ${r.section}`}`,
                  filterText: `${typedPrefix}${query}`,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  insertText: snippet,
                  insertTextRules: hasSnippets
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : undefined,
                  range: replaceRange,
                  detail: r.id,
                  documentation: cleanText.substring(0, 200) + '...'
                };
              });

              return { suggestions };
            }

            // ── B. Slash Commands & Notion-style Drafting Trigger (/) ──────────────
            const slashMatch = textUpToCursor.match(/(?:^|\s)\/([\w\s./,-:_]*)$/);
            if (slashMatch) {
              const slashIdx = textUpToCursor.search(/(?:^|\s)\/([\w\s./,-:_]*)$/);
              const matchStr = slashMatch[0];
              const slashSymbolIdx = matchStr.indexOf('/') + slashIdx;

              const replaceRange = new monaco.Range(
                position.lineNumber,
                slashSymbolIdx + 1,
                position.lineNumber,
                position.column
              );

              const rawSlash = slashMatch[1];
              const rawSlashLower = rawSlash.trim().toLowerCase();
              const typedFromSlash = textUpToCursor.substring(slashSymbolIdx);

              const CLAUSES = [
                { id: 'arbitration', title: 'Arbitration Clause', text: 'Any dispute, controversy, or claim arising out of or relating to this contract, including its formation, breach, termination, or invalidity, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996. The tribunal shall consist of one arbitrator. The venue/seat of arbitration shall be New Delhi, and the language of the proceedings shall be English.' },
                { id: 'governing_law', title: 'Governing Law & Jurisdiction', text: 'This Agreement shall be governed by, construed, and enforced in accordance with the laws of India. The parties agree that the courts located in New Delhi shall have exclusive jurisdiction to settle any disputes arising under this Agreement.' },
                { id: 'severability', title: 'Severability Clause', text: 'If any provision of this Agreement is held to be illegal, invalid, or unenforceable under present or future laws, such provision shall be fully severable; and this Agreement shall be construed and enforced as if such illegal, invalid, or unenforceable provision had never comprised a part of this Agreement.' },
                { id: 'confidentiality', title: 'Confidentiality Clause', text: 'Each party agrees to maintain in strict confidence all Confidential Information disclosed by the other party and shall not disclose such information to any third party without prior written consent, except as required by applicable law or judicial process.' },
                { id: 'force_majeure', title: 'Force Majeure Clause', text: 'Neither party shall be liable for any failure or delay in performing its obligations under this Agreement if such failure or delay is caused by circumstances beyond its reasonable control, including acts of God, war, pandemic, government orders, or natural disasters.' },
                { id: 'limitation_of_liability', title: 'Limitation of Liability', text: 'To the maximum extent permitted by applicable law, neither party shall be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising out of this Agreement.' },
                { id: 'notices', title: 'Notices Clause', text: 'All notices, requests, demands, and other communications under this Agreement shall be in writing and shall be deemed to have been duly given if delivered personally, sent by registered post, or transmitted by confirmed electronic mail to the addresses specified herein.' },
                { id: 'entire_agreement', title: 'Entire Agreement Clause', text: 'This Agreement constitutes the entire understanding and agreement between the parties with respect to the subject matter hereof and supersedes all prior representations, negotiations, and agreements, whether oral or written.' },
                { id: 'waiver', title: 'Waiver Clause', text: 'No failure or delay by either party in exercising any right, power, or privilege hereunder shall operate as a waiver thereof, nor shall any single or partial exercise thereof preclude any other or further exercise thereof or the exercise of any other right.' },
                { id: 'counterparts', title: 'Counterparts Clause', text: 'This Agreement may be executed in one or more counterparts, each of which shall be deemed an original, but all of which together shall constitute one and the same instrument. Electronic signatures shall be deemed original signatures.' },
                { id: 'mae', title: 'Material Adverse Effect (MAE)', text: 'Material Adverse Effect means any event, change, circumstance, or development that has had, or could reasonably be expected to have, a material adverse effect on the business, financial condition, assets, or results of operations of the Corporate Debtor taken as a whole.' },
                { id: 'rpt', title: 'Related Party Transactions (Sec 188 / Sec 29A)', text: 'Except as approved in accordance with Section 188 of the Companies Act, 2013 and Section 29A of the Insolvency and Bankruptcy Code, 2016, no party shall enter into any transaction with a related party without obtaining all prior statutory and regulatory approvals.' },
                { id: 'moratorium', title: 'CIRP Moratorium Clause (Sec 14 IBC)', text: 'Pursuant to Section 14 of the Insolvency and Bankruptcy Code, 2016, a moratorium is declared prohibiting the institution of suits or continuation of pending proceedings against the Corporate Debtor, transferring or encumbering its assets, and enforcing security interests.' },
                { id: 'preferential', title: 'Avoidance: Preferential Transactions (Sec 43 IBC)', text: 'Any transfer of property or interest thereof of the Corporate Debtor for the benefit of a creditor on account of an antecedent financial debt that puts such creditor in a more beneficial position than in distribution under Section 53 shall be liable to be avoided under Section 43.' }
              ];

              const suggestions: any[] = [];

              // Top level command entries
              suggestions.push(
                {
                  label: '/law - Search Statutory Laws & Sections',
                  filterText: `${typedFromSlash} law statutes acts ibc mca sections`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '/law ',
                  range: replaceRange,
                  detail: 'AES Encrypted Law Vault (Statutes, Sections, Rules)'
                },
                {
                  label: '/precedent - Search Court Precedents & Judgments',
                  filterText: `${typedFromSlash} precedent case rulings orders judgments supreme court nclat`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '/precedent ',
                  range: replaceRange,
                  detail: 'Supreme Court & NCLAT Case Rulings'
                },
                {
                  label: '/fact - Link Case Facts & Concepts',
                  filterText: `${typedFromSlash} fact concept dictionary qna terms`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '/fact ',
                  range: replaceRange,
                  detail: 'Workspace Fact Dictionary & Q&A Nodes'
                },
                {
                  label: '/clause - Insert Drafting Boilerplate',
                  filterText: `${typedFromSlash} clause template boilerplate drafting`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '/clause ',
                  range: replaceRange,
                  detail: 'Interactive Legal Clause Templates'
                },
                {
                  label: '/export - Export to Supreme Court / NCLAT DOCX',
                  filterText: `${typedFromSlash} export sc docx word court format`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '',
                  range: replaceRange,
                  detail: 'Court Layout Formatted DOCX Compiler',
                  command: {
                    id: `${HAYAGRIVA_NS}:exportScDocx`,
                    arguments: [model.uri]
                  }
                },
                {
                  label: '/export-pdf - Export to Court PDF & Open Preview',
                  filterText: `${typedFromSlash} export-pdf pdf court print preview`,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  insertText: '',
                  range: replaceRange,
                  detail: 'Court & IBBI Formatted PDF Compiler with Live Preview',
                  command: {
                    id: `${HAYAGRIVA_NS}:exportCourtPdf`,
                    arguments: [model.uri]
                  }
                }
              );

              // All individual standard clause templates
              for (const c of CLAUSES) {
                const { snippet, hasSnippets } = convertToSnippet(c.text);
                suggestions.push({
                  label: `/clause: ${c.title}`,
                  filterText: `/clause ${c.id} ${c.title.toLowerCase()}`,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  insertText: snippet,
                  insertTextRules: hasSnippets
                    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                    : undefined,
                  range: replaceRange,
                  detail: `Standard Clause (${c.id})`,
                  documentation: c.text.substring(0, 160) + '...'
                });
              }

              // Dynamic Level 2 queries:
              // 1. /law <query> or /sec <query> or /ibc <query> or /mca <query>
              if (rawSlashLower.startsWith('law') || rawSlashLower.startsWith('ibc') || rawSlashLower.startsWith('mca') || rawSlashLower.startsWith('sec')) {
                let query = rawSlash.trim();
                const prefixCmd = rawSlash.split(/\s+/)[0] || 'law';
                if (rawSlashLower.startsWith('law')) {
                  query = rawSlash.substring(3).trim();
                }
                if (query.length >= 2) {
                  try {
                    const results = await fetchCompletions(query);
                    if (!token.isCancellationRequested) {
                      for (const r of results) {
                        const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                        const { snippet, hasSnippets } = convertToSnippet(cleanText);
                        suggestions.unshift({
                          label: `/${prefixCmd}: ${r.title || `Section ${r.section}`}`,
                          filterText: typedFromSlash,
                          kind: monaco.languages.CompletionItemKind.Snippet,
                          insertText: snippet,
                          insertTextRules: hasSnippets
                            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                            : undefined,
                          range: replaceRange,
                          detail: r.id,
                          documentation: cleanText.substring(0, 200) + '...'
                        });
                      }
                    }
                  } catch (_) {}
                }
              }

              // 2. /fact <query> or /concept <query>
              if (rawSlashLower.startsWith('fact') || rawSlashLower.startsWith('concept')) {
                const prefixLength = rawSlashLower.startsWith('fact') ? 4 : 7;
                const prefixCmd = rawSlash.split(/\s+/)[0] || 'fact';
                const query = rawSlash.substring(prefixLength).trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/concepts?case=${encodeURIComponent(currentCase)}`);
                  if (!token.isCancellationRequested && res.ok) {
                    const data = await res.json();
                    const list = data.concepts || [];
                    const filtered = query ? list.filter((c: any) => c.title.toLowerCase().includes(query)) : list;
                    for (const c of filtered) {
                      suggestions.unshift({
                        label: `/${prefixCmd}: ${c.title}`,
                        filterText: typedFromSlash,
                        kind: monaco.languages.CompletionItemKind.Reference,
                        insertText: `[${c.title}](${c.relativePath})`,
                        range: replaceRange,
                        detail: 'Concept Link',
                        documentation: `Path: ${c.relativePath}`
                      });
                    }
                  }
                } catch (_) {}
              }

              // 3. /precedent <query> or /case <query>
              if (rawSlashLower.startsWith('precedent') || rawSlashLower.startsWith('case')) {
                const prefixLength = rawSlashLower.startsWith('precedent') ? 9 : 4;
                const prefixCmd = rawSlash.split(/\s+/)[0] || 'precedent';
                const query = rawSlash.substring(prefixLength).trim().toLowerCase();
                try {
                  const res = await fetch(`${this.getBackendUrl()}/api/hayagriva/learning-curves?case=${encodeURIComponent(currentCase)}&query=${encodeURIComponent(query)}`);
                  if (!token.isCancellationRequested && res.ok) {
                    const data = await res.json();
                    const list = data.learningCurves || [];
                    for (const c of list) {
                      suggestions.unshift({
                        label: `/${prefixCmd}: ${c.case_title}`,
                        filterText: `${typedFromSlash} ${c.case_title.toLowerCase()} ${c.citation ? c.citation.toLowerCase() : ''}`,
                        kind: monaco.languages.CompletionItemKind.Reference,
                        insertText: c.content || `[${c.case_title}](${c.filename})`,
                        range: replaceRange,
                        detail: `${c.court_tribunal ? `[${c.court_tribunal}] ` : ''}${c.citation || 'Case Law'}`,
                        documentation: `${c.case_title}\n\n${c.court_tribunal ? `Court: ${c.court_tribunal}\n` : ''}${c.date_of_order ? `Date: ${c.date_of_order}\n` : ''}${c.citation ? `Citation: ${c.citation}\n` : ''}\n${c.issue ? `Issue: ${c.issue}\n\n` : ''}${c.content ? c.content.substring(0, 300) + '...' : ''}`
                      });
                    }
                  }
                } catch (_) {}
              }

              return { suggestions, incomplete: true };
            }

            return { suggestions: [] };
          }
        });

        // ── Inline Completions Provider (Ghost Text) ─────────────────────────
        if (monaco.languages.registerInlineCompletionsProvider) {
          monaco.languages.registerInlineCompletionsProvider(lang, {
            provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
              const lineText: string = model.getLineContent(position.lineNumber);
              const textUpToCursor = lineText.substring(0, position.column - 1);

              const CLAUSES = [
                { id: 'arbitration', title: 'arbitration clause', text: 'Any dispute, controversy, or claim arising out of or relating to this contract, including its formation, breach, termination, or invalidity, shall be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996. The tribunal shall consist of one arbitrator. The venue/seat of arbitration shall be New Delhi, and the language of the proceedings shall be English.' },
                { id: 'governing_law', title: 'governing law & jurisdiction', text: 'This Agreement shall be governed by, construed, and enforced in accordance with the laws of India. The parties agree that the courts located in New Delhi shall have exclusive jurisdiction to settle any disputes arising under this Agreement.' },
                { id: 'severability', title: 'severability clause', text: 'If any provision of this Agreement is held to be illegal, invalid, or unenforceable under present or future laws, such provision shall be fully severable; and this Agreement shall be construed and enforced as if such illegal, invalid, or unenforceable provision had never comprised a part of this Agreement.' },
                { id: 'confidentiality', title: 'confidentiality clause', text: 'Each party agrees to maintain in strict confidence all Confidential Information disclosed by the other party and shall not disclose such information to any third party without prior written consent, except as required by applicable law or judicial process.' },
                { id: 'force_majeure', title: 'force majeure clause', text: 'Neither party shall be liable for any failure or delay in performing its obligations under this Agreement if such failure or delay is caused by circumstances beyond its reasonable control, including acts of God, war, pandemic, government orders, or natural disasters.' },
                { id: 'limitation_of_liability', title: 'limitation of liability', text: 'To the maximum extent permitted by applicable law, neither party shall be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising out of this Agreement.' },
                { id: 'notices', title: 'notices clause', text: 'All notices, requests, demands, and other communications under this Agreement shall be in writing and shall be deemed to have been duly given if delivered personally, sent by registered post, or transmitted by confirmed electronic mail to the addresses specified herein.' },
                { id: 'entire_agreement', title: 'entire agreement clause', text: 'This Agreement constitutes the entire understanding and agreement between the parties with respect to the subject matter hereof and supersedes all prior representations, negotiations, and agreements, whether oral or written.' },
                { id: 'waiver', title: 'waiver clause', text: 'No failure or delay by either party in exercising any right, power, or privilege hereunder shall operate as a waiver thereof, nor shall any single or partial exercise thereof preclude any other or further exercise thereof or the exercise of any other right.' },
                { id: 'counterparts', title: 'counterparts clause', text: 'This Agreement may be executed in one or more counterparts, each of which shall be deemed an original, but all of which together shall constitute one and the same instrument. Electronic signatures shall be deemed original signatures.' },
                { id: 'mae', title: 'material adverse effect', text: 'Material Adverse Effect means any event, change, circumstance, or development that has had, or could reasonably be expected to have, a material adverse effect on the business, financial condition, assets, or results of operations of the Corporate Debtor taken as a whole.' },
                { id: 'rpt', title: 'related party transactions', text: 'Except as approved in accordance with Section 188 of the Companies Act, 2013 and Section 29A of the Insolvency and Bankruptcy Code, 2016, no party shall enter into any transaction with a related party without obtaining all prior statutory and regulatory approvals.' },
                { id: 'moratorium', title: 'cirp moratorium clause', text: 'Pursuant to Section 14 of the Insolvency and Bankruptcy Code, 2016, a moratorium is declared prohibiting the institution of suits or continuation of pending proceedings against the Corporate Debtor, transferring or encumbering its assets, and enforcing security interests.' },
                { id: 'preferential', title: 'preferential transactions', text: 'Any transfer of property or interest thereof of the Corporate Debtor for the benefit of a creditor on account of an antecedent financial debt that puts such creditor in a more beneficial position than in distribution under Section 53 shall be liable to be avoided under Section 43.' }
              ];

              const lowerTrim = textUpToCursor.trim().toLowerCase();
              if (lowerTrim.length < 4) return { items: [] };

              for (const c of CLAUSES) {
                if (c.title.startsWith(lowerTrim) || lowerTrim.endsWith(c.title)) {
                  return {
                    items: [{
                      insertText: c.text,
                      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                    }]
                  };
                }
              }

              return { items: [] };
            },
            disposeInlineCompletions: () => {}
          });
        }
      }

    this.logger.info('[HAYAGRIVA] Monaco Completion Items (@ and /) and Ghost Text Provider registered for markdown and plaintext.');
  }

  // ─── 3. Law Hover Preview Provider ────────────────────────────────────────
  registerLawHoverProvider(): void {
    const LANGS = ['markdown', 'plaintext'];

    for (const lang of LANGS) {
      monaco.languages.registerHoverProvider(lang, {
          provideHover: async (model: any, position: any, token: any) => {
            const docUri = model.uri.toString();
            const conn = this.lspClient.getConnection();

            // 1. Try out-of-process LSP server over WebSocket first
            if (conn) {
              try {
                const hoverResult: any = await conn.sendRequest('textDocument/hover', {
                  textDocument: { uri: docUri },
                  position: {
                    line: position.lineNumber - 1,
                    character: position.column - 1
                  }
                });
                if (token.isCancellationRequested) return undefined;
                if (hoverResult && hoverResult.contents) {
                  const value = typeof hoverResult.contents === 'string'
                    ? hoverResult.contents
                    : (hoverResult.contents.value || '');
                  if (value.trim()) {
                    let range = undefined;
                    if (hoverResult.range) {
                      range = new monaco.Range(
                        hoverResult.range.start.line + 1,
                        hoverResult.range.start.character + 1,
                        hoverResult.range.end.line + 1,
                        hoverResult.range.end.character + 1
                      );
                    }
                    return {
                      contents: [{ value }],
                      range
                    };
                  }
                }
              } catch (_) {}
            }

            // 2. Local Fallback for @@ law citations
            const lineText: string = model.getLineContent(position.lineNumber);
            const citationRegex = /@@?([\w/.\-]+)/g;
            let match: RegExpExecArray | null;

            while ((match = citationRegex.exec(lineText)) !== null) {
              const startCol = match.index + 1;
              const endCol = startCol + match[0].length;

              if (position.column >= startCol && position.column <= endCol) {
                const triggerText = match[1];
                try {
                  const res = await fetch(
                    `${this.getBackendUrl()}/api/laws/query?q=${encodeURIComponent(triggerText)}&n=1`
                  );
                  if (token.isCancellationRequested || !res.ok) return undefined;
                  const json = await res.json();
                  const results = json.results || [];
                  if (results.length === 0) return undefined;

                  const r = results[0];
                  const cleanText = (r.text as string).replace(/^---[\s\S]*?---\r?\n?/, '').trimStart();
                  return {
                    range: new monaco.Range(position.lineNumber, startCol, position.lineNumber, endCol),
                    contents: [
                      { value: `**§ ${r.id}** — *${r.title || `Section ${r.section}`}*\n\n---\n\n${cleanText}` }
                    ]
                  };
                } catch {
                  return undefined;
                }
              }
            }

            return undefined;
          }
        });
      }

    this.logger.info('[HAYAGRIVA] Law hover preview provider registered for markdown and plaintext.');
  }
}

// ── Helper: Snippet Conversion ──────────────────────────────────────────────
export function convertToSnippet(text: string): { snippet: string; hasSnippets: boolean } {
  let snippet = text;
  let index = 1;

  // Replace bracketed dates: [date], [insert date], [YYYY-MM-DD], [Date]
  snippet = snippet.replace(/\[\s*(date|yyyy-mm-dd|insert date)\s*\]/gi, () => `\${${index++}:date}`);

  // Replace bracketed names: [name], [insert name], [Name]
  snippet = snippet.replace(/\[\s*(name|insert name|party name)\s*\]/gi, () => `\${${index++}:name}`);

  // Replace bracketed amounts: [amount], [insert amount], [value]
  snippet = snippet.replace(/\[\s*(amount|value|sum|insert amount)\s*\]/gi, () => `\${${index++}:amount}`);

  // Replace bracketed company: [company], [company name]
  snippet = snippet.replace(/\[\s*(company|company name|corporate debtor)\s*\]/gi, () => `\${${index++}:company_name}`);

  // Replace bracketed generic place holders: [xxx], [insert]
  snippet = snippet.replace(/\[\s*(insert|xxx|fill|placeholder)\s*\]/gi, () => `\${${index++}:fill_in}`);

  // Replace generic underscores: _____
  snippet = snippet.replace(/_{3,}/g, () => `\${${index++}:_____}`);

  return { snippet, hasSnippets: index > 1 };
}
