import { injectable, inject } from '@theia/core/shared/inversify';
import { AgentCockpitManager } from './agent-cockpit-manager';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class AgentDirectoryModal {
  protected modalElement: HTMLElement | null = null;

  constructor(
    @inject(AgentCockpitManager) protected readonly cockpitManager: AgentCockpitManager,
    @inject(ILogger) protected readonly logger: ILogger
  ) {}

  open(): void {
    const existing = document.getElementById('hayagriva-manage-agents-modal');
    if (existing) {
      existing.remove();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'hayagriva-manage-agents-modal';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10010;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: hayagrivaFadeIn 0.15s ease-out;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      width: 720px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.98);
      border: 1px solid rgba(245, 158, 11, 0.4);
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px rgba(245, 158, 11, 0.15);
      padding: 24px;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    dialog.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 12px;">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 8px;">
            <span>👥</span> Chamber Coworker Directory
          </div>
          <div style="font-size: 12px; color: #94a3b8; margin-top: 3px;">
            Activate or park specialized in-chamber legal coworkers in the left activity bar for this matter.
          </div>
        </div>
        <button id="haya-close-agents-modal" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px;">✕</button>
      </div>

      <div id="haya-agents-list-container" style="display: flex; flex-direction: column; gap: 16px; margin-top: 4px;">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 14px; margin-top: 4px;">
        <button id="haya-done-agents-modal" style="padding: 7px 18px; background: #f59e0b; color: #000; font-weight: 600; font-size: 12.5px; border: none; border-radius: 6px; cursor: pointer;">
          Apply & Return to Chamber
        </button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.querySelector('#haya-close-agents-modal')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#haya-done-agents-modal')?.addEventListener('click', () => overlay.remove());

    overlay.addEventListener('click', (e: MouseEvent) => {
      if (e.target === overlay) overlay.remove();
    });

    this.renderCoworkerList(dialog);
  }

  protected renderCoworkerList(dialog: HTMLElement): void {
    const container = dialog.querySelector('#haya-agents-list-container');
    if (!container) return;

    const coworkers = this.cockpitManager.getAllCoworkers();
    const categories: Array<'Core Associates' | 'Statutory Auditors' | 'Forensic Specialists'> = [
      'Core Associates',
      'Statutory Auditors',
      'Forensic Specialists'
    ];

    container.innerHTML = categories.map(cat => {
      const catCoworkers = coworkers.filter(c => c.category === cat);
      if (catCoworkers.length === 0) return '';

      const categoryTitle = cat === 'Core Associates' ? '🏛️ Core Associates'
        : cat === 'Statutory Auditors' ? '⚖️ Statutory Auditors'
        : '🔍 Forensic Specialists';

      return `
        <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 12px;">
          <div style="font-size: 12px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
            ${categoryTitle}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${catCoworkers.map(c => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.07); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 32px; height: 32px; border-radius: 6px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); display: flex; align-items: center; justify-content: center; font-size: 14px;">
                    ${c.id === '@Advisor' ? '⚖️' : c.id === '@Document' ? '📝' : c.id === '@Forms' ? '📋' : c.id === '@Claims' ? '💰' : '🏦'}
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; color: #f1f5f9; font-size: 13px;">${c.id}</span>
                      <span style="color: #94a3b8; font-size: 12px;">— ${c.name}</span>
                      <span style="font-size: 10px; background: rgba(255,255,255,0.08); color: #cbd5e1; padding: 1px 6px; border-radius: 4px;">${c.version}</span>
                    </div>
                    <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                      ${c.role}
                    </div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <button class="haya-sync-btn" data-id="${c.id}" style="padding: 4px 8px; font-size: 11px; background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #94a3b8; border-radius: 4px; cursor: pointer;">
                    ${c.synced ? '✓ Synced' : '🔄 Sync'}
                  </button>
                  <button class="haya-toggle-agent-btn" data-id="${c.id}" style="
                    padding: 5px 12px;
                    font-size: 11.5px;
                    font-weight: 600;
                    border-radius: 14px;
                    border: 1px solid ${c.active ? 'rgba(245, 158, 11, 0.5)' : 'rgba(255,255,255,0.15)'};
                    background: ${c.active ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)'};
                    color: ${c.active ? '#fbbf24' : '#94a3b8'};
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.15s ease;
                  ">
                    <span>${c.active ? '● Active in Sidebar' : '○ Parked'}</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Wire up toggle buttons
    container.querySelectorAll('.haya-toggle-agent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          this.cockpitManager.toggleCoworker(id);
          this.renderCoworkerList(dialog);
        }
      });
    });

    // Wire up sync buttons
    container.querySelectorAll('.haya-sync-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) {
          btn.textContent = 'Syncing…';
          await this.cockpitManager.syncSkills(id);
          btn.textContent = '✓ Synced';
        }
      });
    });
  }
}
