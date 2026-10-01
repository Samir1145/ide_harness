import { injectable, inject } from '@theia/core/shared/inversify';
import * as React from 'react';
import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { HAYAGRIVA_EMBLEM_DATA_URI } from './hayagriva-emblem';

@injectable()
export class HayagrivaChatWelcomeMessageProvider implements ChatWelcomeMessageProvider {
  readonly priority = 1000;

  constructor(
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry
  ) {}

  protected insertIntoInput(text: string): void {
    try {
      const textareas = document.querySelectorAll('.theia-ChatInput-Editor textarea, .theia-ChatInput-Editor .inputarea');
      const targetInput = textareas[0] as HTMLTextAreaElement;
      if (targetInput) {
        targetInput.focus();
        targetInput.value = text;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (_) {}
  }

  renderWelcomeMessage(): React.ReactNode {
    return (
      <div className="theia-WelcomeMessage theia-WelcomeMessage-Main hayagriva-welcome-banner" key="hayagriva-welcome">
        <style>{`
          /* Suppress duplicate generic Theia AI welcome screens and dividers */
          .theia-WelcomeMessage:not(.hayagriva-welcome-banner),
          .theia-WelcomeMessage-Compact,
          .theia-WelcomeMessage-Divider {
            display: none !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          .hayagriva-welcome-banner {
            display: flex;
            flex-direction: column;
            min-height: auto;
            padding: 10px 14px 14px 14px;
            box-sizing: border-box;
            width: 100%;
          }
          .theia-WelcomeMessage-Container-Inner {
            height: auto;
            display: flex;
            flex-direction: column;
          }
          .hayagriva-emblem-container {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 6px 0 12px 0;
            width: 100%;
          }
          .hayagriva-emblem-img {
            max-width: 150px;
            max-height: 190px;
            width: auto;
            height: auto;
            object-fit: contain;
            filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.06));
            transition: transform 0.2s ease;
          }
          .hayagriva-emblem-img:hover {
            transform: scale(1.02);
          }
          body.theia-dark .hayagriva-emblem-img {
            filter: invert(1) hue-rotate(180deg) drop-shadow(0 2px 12px rgba(255, 255, 255, 0.12));
          }
          .hayagriva-bottom-dock {
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding-top: 8px;
          }
          .hayagriva-welcome-coworkers {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
          }
          .hayagriva-coworker-chip {
            background: #ffffff;
            border: 1px solid var(--theia-border-color, #e2e8f0);
            border-radius: 6px;
            padding: 7px 9px;
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
          }
          body.theia-dark .hayagriva-coworker-chip {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: none;
          }
          .hayagriva-coworker-chip:hover {
            border-color: var(--theia-brand-color1, #0284c7);
            background: #f8fafc;
            transform: translateY(-1px);
          }
          body.theia-dark .hayagriva-coworker-chip:hover {
            background: rgba(255, 255, 255, 0.07);
            border-color: #38bdf8;
          }
          .hayagriva-coworker-name {
            font-weight: 700;
            font-size: 11px;
          }
          .hayagriva-coworker-desc {
            font-size: 10px;
            color: var(--theia-ui-font-color2, #64748b);
            margin-top: 2px;
          }
          .hayagriva-prompts-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--theia-ui-font-color2, #64748b);
            font-weight: 700;
            margin-bottom: 6px;
          }
          .hayagriva-prompts-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
          }
          .hayagriva-prompt-chip {
            background: #ffffff;
            border: 1px solid var(--theia-border-color, #e2e8f0);
            border-radius: 6px;
            padding: 6px 10px;
            font-size: 11px;
            color: var(--theia-ui-font-color1, #334155);
            cursor: pointer;
            transition: all 0.15s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
            line-height: 1.4;
          }
          body.theia-dark .hayagriva-prompt-chip {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #cbd5e1;
            box-shadow: none;
          }
          .hayagriva-prompt-chip:hover {
            background: #f1f5f9;
            border-color: var(--theia-brand-color1, #0284c7);
            color: var(--theia-ui-font-color0, #0f172a);
          }
          body.theia-dark .hayagriva-prompt-chip:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: #38bdf8;
            color: #f8fafc;
          }
        `}</style>

        {/* Top Section: Sacred Hayagriva AI Deity Emblem (All Chatbot Text Cleared) */}
        <div className="hayagriva-emblem-container">
          <img
            src={HAYAGRIVA_EMBLEM_DATA_URI}
            alt="Hayagriva Sacred AI Emblem"
            className="hayagriva-emblem-img"
          />
        </div>

        {/* Compact Bottom Docking Container: Coworker Routing + Suggested Inquiries */}
        <div className="hayagriva-bottom-dock">
          {/* Coworker Routing Chips */}
          <div className="hayagriva-welcome-coworkers">
            <div
              className="hayagriva-coworker-chip"
              onClick={() => this.insertIntoInput('@Advisor ')}
              title="Click to route inquiry to @Advisor"
            >
              <div className="hayagriva-coworker-name" style={{ color: '#0284c7' }}>@Advisor</div>
              <div className="hayagriva-coworker-desc">Legal grounds & order decoding</div>
            </div>
            <div
              className="hayagriva-coworker-chip"
              onClick={() => this.insertIntoInput('@Forms ')}
              title="Click to route inquiry to @Forms"
            >
              <div className="hayagriva-coworker-name" style={{ color: '#059669' }}>@Forms</div>
              <div className="hayagriva-coworker-desc">Fill & audit statutory forms</div>
            </div>
            <div
              className="hayagriva-coworker-chip"
              onClick={() => this.insertIntoInput('@Document ')}
              title="Click to route inquiry to @Document"
            >
              <div className="hayagriva-coworker-name" style={{ color: '#7c3aed' }}>@Document</div>
              <div className="hayagriva-coworker-desc">Draft petitions & affidavits</div>
            </div>
            <div
              className="hayagriva-coworker-chip"
              onClick={() => this.insertIntoInput('@Claims ')}
              title="Click to route inquiry to @Claims"
            >
              <div className="hayagriva-coworker-name" style={{ color: '#0891b2' }}>@Claims</div>
              <div className="hayagriva-coworker-desc">Audit proofs of debt & CoC %</div>
            </div>
          </div>

          {/* Suggested Inquiries */}
          <div className="hayagriva-welcome-prompts">
            <div className="hayagriva-prompts-label">
              Suggested Inquiries
            </div>
            <div className="hayagriva-prompts-list">
              {[
                'Explain limitation under Section 7 of IBC with Supreme Court ratios',
                'Summarize the key admission grounds and moratorium in this case',
                'Check Section 29A connected person eligibility for resolution applicants',
                'Analyze avoidance look-back periods under Sections 43 and 66'
              ].map((q, idx) => (
                <div
                  key={idx}
                  className="hayagriva-prompt-chip"
                  onClick={() => this.insertIntoInput(q)}
                  title="Click to insert this inquiry into chat prompt"
                >
                  ⚖️ {q}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
