import { injectable, inject } from '@theia/core/shared/inversify';
import { Widget } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { CommandService } from '@theia/core/lib/common/command';
import { ILogger } from '@theia/core/lib/common/logger';
import { safeDecodeURI } from './tree-decorator';

export interface CaseDocItem {
  name: string;
  type: string;
  badge: string;
  path: string;
}

@injectable()
export class AgentWorkstationWidget extends Widget {
  static readonly ID = 'hayagriva-agent-workstation';
  static readonly LABEL = 'Coworker Chamber';

  protected activeCoworker = {
    id: '@Advisor',
    name: 'Strategy & CIRP Counsel',
    role: 'Master legal strategy, CIRP timeline planning & resolution guidance'
  };

  protected caseDocs: CaseDocItem[] = [
    { name: 'NCLT_Admission_Order.pdf', type: 'PDF', badge: 'Order § 7', path: 'raw/NCLT_Admission_Order.pdf' },
    { name: 'Form_C_SBI_Claim.pdf', type: 'Claim', badge: '₹42.5 Cr', path: 'raw/Form_C_SBI_Claim.pdf' },
    { name: 'Sanction_Letter_2018.docx', type: 'DOCX', badge: 'Loan Facility', path: 'raw/Sanction_Letter_2018.docx' },
    { name: 'Draft_Notice_1st_CoC.md', type: 'Draft', badge: 'Word View', path: 'drafts/Draft_Notice_1st_CoC.md' }
  ];

  constructor(
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
    @inject(CommandService) protected readonly commandService: CommandService,
    @inject(ILogger) protected readonly logger: ILogger
  ) {
    super();
    this.id = AgentWorkstationWidget.ID;
    this.title.label = AgentWorkstationWidget.LABEL;
    this.title.caption = 'Sovereign Legal Coworker Workstation';
    this.title.closable = false;
    this.addClass('hayagriva-agent-workstation-widget');
    this.render();
  }

  setCoworker(coworker: { id: string; name: string; role: string }): void {
    this.activeCoworker = coworker;
    this.render();
  }

  protected render(): void {
    this.node.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0b1120;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow-y: auto;
    `;

    this.node.innerHTML = `
      <!-- Header Banner -->
      <div style="padding: 12px 16px; background: rgba(15, 23, 42, 0.9); border-bottom: 1px solid rgba(245, 158, 11, 0.2); display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
            <span>👥</span> ${this.activeCoworker.name} (${this.activeCoworker.id})
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${this.activeCoworker.role}</div>
        </div>
        <span style="font-size: 10px; background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); padding: 2px 8px; border-radius: 9999px; font-weight: 600;">● Active</span>
      </div>

      <!-- Accordion Container -->
      <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 12px;">

        <!-- 1. Tier 1: 📁 Case Documents -->
        <div id="hayagriva-accordion-docs" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden;">
          <div class="accordion-header" data-target="docs-content" style="padding: 10px 14px; background: rgba(30, 41, 59, 0.7); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
            <div style="font-size: 12px; font-weight: 700; color: #e2e8f0; display: flex; align-items: center; gap: 6px;">
              <span class="chevron" style="font-size: 10px; transition: transform 0.2s;">▼</span>
              <span>📁 Case Documents</span>
              <span style="font-size: 10px; color: #64748b; font-weight: 400;">(${this.caseDocs.length})</span>
            </div>
            <button id="hayagriva-add-doc-btn" style="background: transparent; border: 1px dashed rgba(245, 158, 11, 0.5); color: #fbbf24; font-size: 10px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">+ Attach</button>
          </div>
          <div id="docs-content" class="accordion-body" style="padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;">
            ${this.caseDocs.map(doc => `
              <div class="doc-chip" data-path="${doc.path}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 10px; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.borderColor='rgba(245,158,11,0.4)'; this.style.background='rgba(30,41,59,0.9)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'; this.style.background='rgba(30,41,59,0.5)'">
                <div style="font-size: 11px; font-weight: 600; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                  <span>📄</span> ${doc.name}
                </div>
                <span style="font-size: 9px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 1px 6px; border-radius: 4px;">${doc.badge}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 2. Tier 2: 💬 Instructions -->
        <div id="hayagriva-accordion-instructions" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden;">
          <div class="accordion-header" data-target="instructions-content" style="padding: 10px 14px; background: rgba(30, 41, 59, 0.7); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
            <div style="font-size: 12px; font-weight: 700; color: #e2e8f0; display: flex; align-items: center; gap: 6px;">
              <span class="chevron" style="font-size: 10px; transition: transform 0.2s;">▼</span>
              <span>💬 Instructions</span>
            </div>
            <span style="font-size: 10px; color: #4ade80;">Air-Gapped Loop</span>
          </div>
          <div id="instructions-content" class="accordion-body" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
            <!-- Action Chips -->
            <div style="font-size: 10px; color: #94a3b8; font-weight: 600;">1-Click Statutory Actions:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button class="action-chip" data-prompt="Draft 1st CoC Meeting Notice and IBBI Reg 34B CIRP Budget" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); color: #fbbf24; border-radius: 6px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">Draft 1st CoC Notice & Reg 34B Budget</button>
              <button class="action-chip" data-prompt="Audit resolution applicant eligibility under IBC Section 29A" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 6px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">Audit Section 29A Disqualification</button>
              <button class="action-chip" data-prompt="Verify financial creditor Form C claim and compute voting share" style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.35); color: #4ade80; border-radius: 6px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">Verify Creditor Claims & Form C</button>
              <button class="action-chip" data-prompt="Identify preferential contra-sweep transactions under IBC Section 43" style="background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.35); color: #fb7185; border-radius: 6px; padding: 4px 8px; font-size: 10px; font-weight: 600; cursor: pointer;">Scan Bank Contra-Sweeps (§ 43 PUFE)</button>
            </div>

            <!-- Chat Transcript Mock -->
            <div id="hayagriva-instructions-transcript" style="background: rgba(11, 17, 32, 0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; font-size: 11px; line-height: 1.5; color: #cbd5e1; max-height: 140px; overflow-y: auto;">
              <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">@Advisor • In-Chamber Strategy Session</div>
              <div>Ready to assist with statutory analysis, document synthesis, or avoidance review. Select an action chip above or enter your instructions below.</div>
            </div>

            <!-- Input Bar -->
            <div style="display: flex; gap: 6px;">
              <input id="hayagriva-instructions-input" type="text" placeholder="Provide instructions to ${this.activeCoworker.id}…" style="flex: 1; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 10px; color: #f8fafc; font-size: 11px; outline: none;" />
              <button id="hayagriva-instructions-send" style="background: #f59e0b; border: none; color: #000; font-weight: 700; border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer;">Send</button>
            </div>
          </div>
        </div>

        <!-- 3. Tier 3: 🕸️ Relationship Chart -->
        <div id="hayagriva-accordion-chart" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; overflow: hidden;">
          <div class="accordion-header" data-target="chart-content" style="padding: 10px 14px; background: rgba(30, 41, 59, 0.7); display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
            <div style="font-size: 12px; font-weight: 700; color: #e2e8f0; display: flex; align-items: center; gap: 6px;">
              <span class="chevron" style="font-size: 10px; transition: transform 0.2s;">▼</span>
              <span>🕸️ Relationship Chart</span>
            </div>
            <button id="hayagriva-expand-chart-btn" style="background: transparent; border: 1px solid rgba(255, 255, 255, 0.15); color: #cbd5e1; font-size: 10px; padding: 2px 8px; border-radius: 4px; cursor: pointer;">↗ Full Screen</button>
          </div>
          <div id="chart-content" class="accordion-body" style="padding: 12px 14px; display: flex; flex-direction: column; align-items: center;">
            <svg viewBox="0 0 320 160" style="width: 100%; height: 140px; background: rgba(11, 17, 32, 0.7); border-radius: 6px;">
              <!-- Central Corporate Debtor Node -->
              <circle cx="160" cy="80" r="22" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
              <text x="160" y="84" text-anchor="middle" fill="#fbbf24" font-size="9" font-weight="700">Debtor</text>

              <!-- Node 1: Financial Creditor -->
              <circle cx="60" cy="50" r="16" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
              <text x="60" y="53" text-anchor="middle" fill="#38bdf8" font-size="8">SBI (CoC)</text>
              <line x1="76" y1="56" x2="138" y2="72" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3"/>

              <!-- Node 2: Suspended Director -->
              <circle cx="260" cy="50" r="16" fill="#1e293b" stroke="#fb7185" stroke-width="1.5"/>
              <text x="260" y="53" text-anchor="middle" fill="#fb7185" font-size="8">Director</text>
              <line x1="244" y1="56" x2="182" y2="72" stroke="#fb7185" stroke-width="1.5"/>

              <!-- Node 3: Resolution Applicant -->
              <circle cx="160" cy="140" r="14" fill="#1e293b" stroke="#4ade80" stroke-width="1.5"/>
              <text x="160" y="143" text-anchor="middle" fill="#4ade80" font-size="8">PRAs</text>
              <line x1="160" y1="102" x2="160" y2="126" stroke="#4ade80" stroke-width="1.5"/>
            </svg>
            <div style="font-size: 10px; color: #64748b; margin-top: 6px; width: 100%; display: flex; justify-content: space-between;">
              <span>4 Forensic Nodes</span>
              <span>3 Statutory Edges</span>
            </div>
          </div>
        </div>

      </div>
    `;

    this.attachEventListeners();
  }

  protected attachEventListeners(): void {
    // Accordion toggle handler
    const headers = this.node.querySelectorAll('.accordion-header');
    headers.forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        // Prevent toggle if clicking button inside header
        if ((e.target as HTMLElement).tagName.toLowerCase() === 'button') return;

        const targetId = hdr.getAttribute('data-target');
        if (!targetId) return;
        const body = this.node.querySelector(`#${targetId}`) as HTMLElement;
        const chevron = hdr.querySelector('.chevron') as HTMLElement;
        if (body) {
          const isCollapsed = body.style.display === 'none';
          body.style.display = isCollapsed ? 'flex' : 'none';
          if (chevron) {
            chevron.textContent = isCollapsed ? '▼' : '▶';
          }
        }
      });
    });

    // Document chip click: open file in Milkdown Word View
    const docChips = this.node.querySelectorAll('.doc-chip');
    docChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const filePath = chip.getAttribute('data-path');
        if (filePath) {
          this.commandService.executeCommand('hayagriva.openMilkdownSplit', filePath).catch(() => {});
        }
      });
    });

    // Action chip click: insert into input and simulate send
    const actionChips = this.node.querySelectorAll('.action-chip');
    const input = this.node.querySelector('#hayagriva-instructions-input') as HTMLInputElement;
    actionChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt && input) {
          input.value = prompt;
          input.focus();
        }
      });
    });

    // Send button handler
    const sendBtn = this.node.querySelector('#hayagriva-instructions-send');
    sendBtn?.addEventListener('click', () => {
      if (input && input.value.trim().length > 0) {
        const text = input.value.trim();
        input.value = '';
        const transcript = this.node.querySelector('#hayagriva-instructions-transcript');
        if (transcript) {
          transcript.innerHTML += `
            <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 6px;">
              <div style="color: #fbbf24; font-weight: 600;">You:</div>
              <div>${text}</div>
              <div style="color: #4ade80; font-size: 10px; margin-top: 3px;">✓ Processing through air-gapped critique loop…</div>
            </div>
          `;
          transcript.scrollTop = transcript.scrollHeight;
        }
      }
    });

    // Expand chart full-screen handler
    const expandBtn = this.node.querySelector('#hayagriva-expand-chart-btn');
    expandBtn?.addEventListener('click', () => {
      this.commandService.executeCommand('hayagriva.openEntityMapTab').catch(() => {});
    });
  }
}
