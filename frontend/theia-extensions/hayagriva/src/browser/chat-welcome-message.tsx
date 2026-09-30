import { injectable, inject } from '@theia/core/shared/inversify';
import * as React from 'react';
import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { CommandRegistry } from '@theia/core/lib/common/command';

@injectable()
export class HayagrivaChatWelcomeMessageProvider implements ChatWelcomeMessageProvider {
  readonly priority = 1000;

  constructor(
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry
  ) {}

  renderWelcomeMessage(): React.ReactNode {
    return (
      <div className="theia-WelcomeMessage theia-WelcomeMessage-Main hayagriva-welcome-banner" key="hayagriva-welcome">
        <div className="hayagriva-welcome-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div className="hayagriva-welcome-orb-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2.5L16.5 7.5C17.2 9 16.5 10 12 10C7.5 10 6.8 9 7.5 7.5Z" strokeWidth="1.4"/>
              <polygon points="12,4.8 13.8,7 12,9.2 10.2,7" strokeWidth="1"/>
              <path d="M11.4 11V13C11.4 13.5 12.6 13.5 12.6 13V11" strokeWidth="1.2"/>
              <circle cx="12" cy="14.2" r="0.6" fill="#fbbf24"/>
              <path d="M7.8 10.8C6.2 12.2 6.5 13.8 8.2 14.5C8.8 17.5 9.8 20 10.2 21.2C10.5 22.2 13.5 22.2 13.8 21.2C14.2 20 15.2 17.5 15.8 14.5C17.5 13.8 17.8 12.2 16.2 10.8" strokeWidth="1.3"/>
              <path d="M16 13.5C18.8 15 19.5 18 17.8 20.2C19.2 20.8 19.5 23 17.2 23.5" strokeWidth="1.3"/>
            </svg>
          </div>
          <div className="hayagriva-welcome-titles">
            <h2 style={{ margin: '0 0 2px 0', fontSize: '16px', fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.01em' }}>
              AskHaya
            </h2>
            <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 500 }}>
              Senior Legal Partner & Coworker Orchestrator
            </div>
          </div>
        </div>

        <div className="hayagriva-welcome-body" style={{ margin: '10px 0', fontSize: '11.5px', lineHeight: 1.55, color: '#94a3b8' }}>
          Direct legal inquiry across case perimeter, bare statutes, and <strong>17,500+ Supreme Court & NCLAT rulings</strong>.
          Ask any question directly, or route to specialist coworkers:
        </div>

        <div className="hayagriva-welcome-coworkers" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', margin: '10px 0' }}>
          <div className="hayagriva-coworker-chip" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px' }}>
            <div style={{ fontWeight: 600, color: '#38bdf8', fontSize: '11px' }}>@Advisor</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Legal grounds & order decoding</div>
          </div>
          <div className="hayagriva-coworker-chip" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px' }}>
            <div style={{ fontWeight: 600, color: '#10b981', fontSize: '11px' }}>@Forms</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Fill & audit statutory forms</div>
          </div>
          <div className="hayagriva-coworker-chip" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px' }}>
            <div style={{ fontWeight: 600, color: '#c084fc', fontSize: '11px' }}>@Document</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Draft petitions & affidavits</div>
          </div>
          <div className="hayagriva-coworker-chip" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '6px 8px' }}>
            <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '11px' }}>@Claims</div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>Audit proofs of debt & CoC %</div>
          </div>
        </div>

        <div className="hayagriva-welcome-prompts" style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
            Suggested Inquiries
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {[
              'Explain limitation under Section 7 of IBC with Supreme Court ratios',
              'Summarize the key admission grounds and moratorium in this case',
              'Check Section 29A connected person eligibility for resolution applicants',
              'Analyze avoidance look-back periods under Sections 43 and 66'
            ].map((q, idx) => (
              <div
                key={idx}
                className="hayagriva-prompt-chip"
                style={{
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: '5px',
                  padding: '5px 8px',
                  fontSize: '11px',
                  color: '#fbbf24',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  try {
                    const textareas = document.querySelectorAll('.theia-ChatInput-Editor textarea, .theia-ChatInput-Editor .inputarea');
                    const targetInput = textareas[0] as HTMLTextAreaElement;
                    if (targetInput) {
                      targetInput.focus();
                      targetInput.value = q;
                      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                  } catch (_) {}
                }}
              >
                ⚖️ {q}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
