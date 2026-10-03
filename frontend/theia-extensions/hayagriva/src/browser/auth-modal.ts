// frontend/theia-extensions/hayagriva/src/browser/auth-modal.ts
import { injectable, inject } from '@theia/core/shared/inversify';
import { AuthManager } from './auth-manager';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class AuthModal {
    protected overlayElement: HTMLElement | null = null;
    protected isVisibleState = false;

    constructor(
        @inject(AuthManager) protected readonly authManager: AuthManager,
        @inject(ILogger) protected readonly logger: ILogger
    ) {}

    isVisible(): boolean {
        return this.isVisibleState;
    }

    show(alertMessage?: string): void {
        if (this.isVisibleState && this.overlayElement) {
            if (alertMessage) {
                this.setError(alertMessage);
            }
            return;
        }

        this.ensureModalDom();
        if (this.overlayElement) {
            this.overlayElement.style.display = 'flex';
            // Trigger reflow for CSS animation
            void this.overlayElement.offsetWidth;
            this.overlayElement.classList.add('active');
            this.isVisibleState = true;

            if (alertMessage) {
                this.setError(alertMessage);
            } else {
                this.clearError();
            }

            const emailInput = this.overlayElement.querySelector<HTMLInputElement>('#haya-auth-email');
            if (emailInput) {
                emailInput.focus();
            }
        }
    }

    hide(): void {
        if (!this.overlayElement) return;
        this.overlayElement.classList.remove('active');
        setTimeout(() => {
            if (this.overlayElement) {
                this.overlayElement.style.display = 'none';
            }
            this.isVisibleState = false;
        }, 200);
    }

    protected setError(msg: string): void {
        if (!this.overlayElement) return;
        const errBox = this.overlayElement.querySelector<HTMLElement>('#haya-auth-error');
        if (errBox) {
            errBox.textContent = msg;
            errBox.style.display = 'block';
        }
    }

    protected clearError(): void {
        if (!this.overlayElement) return;
        const errBox = this.overlayElement.querySelector<HTMLElement>('#haya-auth-error');
        if (errBox) {
            errBox.textContent = '';
            errBox.style.display = 'none';
        }
    }

    protected ensureModalDom(): void {
        if (this.overlayElement) return;

        const overlay = document.createElement('div');
        overlay.id = 'hayagriva-auth-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: none;
            align-items: center;
            justify-content: center;
            background: rgba(10, 15, 29, 0.72);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            opacity: 0;
            transition: opacity 0.22s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        `;

        overlay.innerHTML = `
            <style>
                #hayagriva-auth-overlay.active {
                    opacity: 1 !important;
                }
                #hayagriva-auth-card {
                    width: 440px;
                    max-width: 92vw;
                    background: rgba(22, 27, 46, 0.88);
                    border: 1px solid rgba(212, 160, 23, 0.35);
                    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 0 32px rgba(212, 160, 23, 0.12);
                    border-radius: 14px;
                    padding: 32px 36px;
                    color: #e2e8f0;
                    position: relative;
                    transform: scale(0.95);
                    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
                }
                #hayagriva-auth-overlay.active #hayagriva-auth-card {
                    transform: scale(1);
                }
                .haya-auth-close {
                    position: absolute;
                    top: 16px;
                    right: 18px;
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 20px;
                    line-height: 1;
                    cursor: pointer;
                    padding: 6px 10px;
                    border-radius: 6px;
                    transition: all 0.15s ease;
                }
                .haya-auth-close:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.1);
                }
                .haya-auth-header {
                    text-align: center;
                    margin-bottom: 24px;
                }
                .haya-auth-icon {
                    width: 48px;
                    height: 48px;
                    margin: 0 auto 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, rgba(212, 160, 23, 0.25), rgba(212, 160, 23, 0.05));
                    border: 1px solid rgba(212, 160, 23, 0.4);
                    border-radius: 50%;
                    color: #d4a017;
                    font-size: 22px;
                }
                .haya-auth-title {
                    font-size: 19px;
                    font-weight: 700;
                    color: #f8fafc;
                    margin: 0 0 6px;
                    letter-spacing: -0.2px;
                }
                .haya-auth-subtitle {
                    font-size: 12.5px;
                    color: #94a3b8;
                    margin: 0;
                    line-height: 1.45;
                }
                .haya-auth-error-box {
                    background: rgba(239, 68, 68, 0.15);
                    border: 1px solid rgba(239, 68, 68, 0.4);
                    color: #fca5a5;
                    padding: 10px 14px;
                    border-radius: 8px;
                    font-size: 12.5px;
                    margin-bottom: 18px;
                    display: none;
                    line-height: 1.4;
                }
                .haya-auth-field {
                    margin-bottom: 16px;
                }
                .haya-auth-label {
                    display: block;
                    font-size: 12px;
                    font-weight: 600;
                    color: #cbd5e1;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .haya-auth-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 10px 14px;
                    background: rgba(15, 23, 42, 0.85);
                    border: 1px solid rgba(148, 163, 184, 0.25);
                    border-radius: 8px;
                    color: #f8fafc;
                    font-size: 13.5px;
                    outline: none;
                    transition: border-color 0.15s ease, box-shadow 0.15s ease;
                }
                .haya-auth-input:focus {
                    border-color: #d4a017;
                    box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.2);
                }
                .haya-auth-btn {
                    width: 100%;
                    padding: 11px;
                    margin-top: 10px;
                    background: linear-gradient(135deg, #d4a017, #b8860b);
                    color: #0b1120;
                    font-weight: 700;
                    font-size: 14px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: filter 0.15s ease, transform 0.1s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
                .haya-auth-btn:hover {
                    filter: brightness(1.1);
                }
                .haya-auth-btn:active {
                    transform: scale(0.99);
                }
                .haya-auth-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .haya-auth-footer {
                    margin-top: 20px;
                    padding-top: 16px;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    font-size: 11.5px;
                    color: #64748b;
                    text-align: center;
                    line-height: 1.45;
                }
            </style>
            <div id="hayagriva-auth-card">
                <button class="haya-auth-close" id="haya-auth-close-btn" title="Close (Explore Workspace)">✖</button>
                <div class="haya-auth-header">
                    <div class="haya-auth-icon">⚖️</div>
                    <h2 class="haya-auth-title" id="haya-auth-modal-title">Activate Hayagriva License</h2>
                    <p class="haya-auth-subtitle" id="haya-auth-modal-subtitle">Enter your license key from the portal to unlock Autonomous AI Agents.</p>
                </div>
                
                <!-- Tab Switcher -->
                <div style="display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
                    <button type="button" id="tabBtnLicense" style="flex: 1; padding: 7px; background: rgba(212,160,23,0.18); border: 1px solid #d4a017; color: #f8fafc; font-weight: 700; border-radius: 6px; cursor: pointer; font-size: 12.5px;">⚡ License Key</button>
                    <button type="button" id="tabBtnAccount" style="flex: 1; padding: 7px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; font-weight: 600; border-radius: 6px; cursor: pointer; font-size: 12.5px;">🔑 Account Sign In</button>
                </div>

                <div class="haya-auth-error-box" id="haya-auth-error"></div>

                <!-- Form 1: License Key Activation -->
                <form id="haya-license-form">
                    <div class="haya-auth-field">
                        <label class="haya-auth-label" for="haya-auth-license-key">License Key or Envelope</label>
                        <input class="haya-auth-input" type="text" id="haya-auth-license-key" placeholder="e.g. HAYA-STR-7B9E2K4M or paste envelope" required />
                    </div>
                    <div style="font-size: 11.5px; color: #94a3b8; margin: -6px 0 14px 0; display: flex; justify-content: space-between;">
                        <span>Don't have a key yet?</span>
                        <a href="https://app-apnet-net.onrender.com/login" target="_blank" style="color: #38bdf8; text-decoration: none;">Get License on Portal &rarr;</a>
                    </div>
                    <button type="submit" class="haya-auth-btn" id="haya-license-submit-btn">
                        <span id="haya-license-btn-text">Verify Key &amp; Activate</span>
                    </button>
                </form>

                <!-- Form 2: Account Login -->
                <form id="haya-auth-form" style="display: none;">
                    <div class="haya-auth-field">
                        <label class="haya-auth-label" for="haya-auth-email">Email Address</label>
                        <input class="haya-auth-input" type="email" id="haya-auth-email" placeholder="advocate@chambers.in" />
                    </div>
                    <div class="haya-auth-field">
                        <label class="haya-auth-label" for="haya-auth-password">Password</label>
                        <input class="haya-auth-input" type="password" id="haya-auth-password" placeholder="••••••••" />
                    </div>
                    <div style="font-size: 11.5px; color: #94a3b8; margin: -6px 0 14px 0; display: flex; justify-content: space-between;">
                        <a href="https://app-apnet-net.onrender.com/register" target="_blank" style="color: #38bdf8; text-decoration: none;">Create Account &rarr;</a>
                        <a href="https://app-apnet-net.onrender.com/login" target="_blank" style="color: #94a3b8; text-decoration: none;">Web Portal &rarr;</a>
                    </div>
                    <button type="submit" class="haya-auth-btn" id="haya-auth-submit-btn">
                        <span id="haya-auth-btn-text">Sign In</span>
                    </button>
                </form>

                <div class="haya-auth-footer">
                    Local document browsing, ingestion, and editing in Monaco remain 100% free forever without sign-in.
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.overlayElement = overlay;

        // Tab switching
        const tabLicense = overlay.querySelector<HTMLButtonElement>('#tabBtnLicense');
        const tabAccount = overlay.querySelector<HTMLButtonElement>('#tabBtnAccount');
        const formLicense = overlay.querySelector<HTMLFormElement>('#haya-license-form');
        const formAccount = overlay.querySelector<HTMLFormElement>('#haya-auth-form');
        const modalTitle = overlay.querySelector<HTMLElement>('#haya-auth-modal-title');
        const modalSubtitle = overlay.querySelector<HTMLElement>('#haya-auth-modal-subtitle');

        if (tabLicense && tabAccount && formLicense && formAccount) {
            tabLicense.addEventListener('click', () => {
                tabLicense.style.background = 'rgba(212,160,23,0.18)';
                tabLicense.style.borderColor = '#d4a017';
                tabLicense.style.color = '#f8fafc';
                tabAccount.style.background = 'transparent';
                tabAccount.style.borderColor = 'rgba(255,255,255,0.1)';
                tabAccount.style.color = '#94a3b8';
                formLicense.style.display = 'block';
                formAccount.style.display = 'none';
                if (modalTitle) modalTitle.textContent = 'Activate Hayagriva License';
                if (modalSubtitle) modalSubtitle.textContent = 'Enter your license key from the portal to unlock Autonomous AI Agents.';
                this.clearError();
            });

            tabAccount.addEventListener('click', () => {
                tabAccount.style.background = 'rgba(212,160,23,0.18)';
                tabAccount.style.borderColor = '#d4a017';
                tabAccount.style.color = '#f8fafc';
                tabLicense.style.background = 'transparent';
                tabLicense.style.borderColor = 'rgba(255,255,255,0.1)';
                tabLicense.style.color = '#94a3b8';
                formAccount.style.display = 'block';
                formLicense.style.display = 'none';
                if (modalTitle) modalTitle.textContent = 'Sign In to Link Main Server';
                if (modalSubtitle) modalSubtitle.textContent = 'Sign in to sync your chamber profile, billing ledger, and shared settings.';
                this.clearError();
            });
        }

        // Close button listener
        const closeBtn = overlay.querySelector('#haya-auth-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisibleState) {
                this.hide();
            }
        });

        // License form submission
        if (formLicense) {
            formLicense.addEventListener('submit', async (e) => {
                e.preventDefault();
                const keyInput = overlay.querySelector<HTMLInputElement>('#haya-auth-license-key');
                const submitBtn = overlay.querySelector<HTMLButtonElement>('#haya-license-submit-btn');
                const btnText = overlay.querySelector<HTMLElement>('#haya-license-btn-text');
                const key = (keyInput?.value || '').trim();

                if (!key) {
                    this.setError('Please enter a license key.');
                    return;
                }

                if (submitBtn && btnText) {
                    submitBtn.disabled = true;
                    btnText.textContent = 'Verifying with Cloud Server...';
                }
                this.clearError();

                try {
                    const baseUrl = this.authManager.getApiBaseUrl();
                    const res = await fetch(`${baseUrl}/api/hayagriva/license/activate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ licenseKey: key }),
                        signal: AbortSignal.timeout(15000)
                    });
                    const data = await res.json();
                    if (data.success) {
                        this.hide();
                        if (keyInput) keyInput.value = '';
                    } else if (data.error === 'DEVICE_LIMIT_EXCEEDED') {
                        this.setError(`Device limit reached (${data.activeDevices || 1}/${data.maxDevices || 1}). Deactivate an old machine at https://app-apnet-net.onrender.com/dashboard/licenses`);
                    } else {
                        this.setError(data.message || data.error || 'Activation failed.');
                    }
                } catch (err: any) {
                    this.setError(`Connection error: ${err?.message || err}`);
                } finally {
                    if (submitBtn && btnText) {
                        submitBtn.disabled = false;
                        btnText.textContent = 'Verify Key & Activate';
                    }
                }
            });
        }

        // Account form submission listener
        if (formAccount) {
            formAccount.addEventListener('submit', async (e) => {
                e.preventDefault();
                const emailInput = overlay.querySelector<HTMLInputElement>('#haya-auth-email');
                const passInput = overlay.querySelector<HTMLInputElement>('#haya-auth-password');
                const submitBtn = overlay.querySelector<HTMLButtonElement>('#haya-auth-submit-btn');
                const btnText = overlay.querySelector<HTMLElement>('#haya-auth-btn-text');

                const email = emailInput?.value || '';
                const password = passInput?.value || '';

                if (!email || !password) {
                    this.setError('Please enter both email and password.');
                    return;
                }

                if (submitBtn && btnText) {
                    submitBtn.disabled = true;
                    btnText.textContent = 'Verifying with Main Server...';
                }
                this.clearError();

                try {
                    const result = await this.authManager.login(email, password);
                    if (result.ok) {
                        this.hide();
                        if (passInput) passInput.value = '';
                    } else {
                        this.setError(result.error || 'Authentication failed. Check credentials.');
                    }
                } catch (err: any) {
                    this.setError(`Connection error: ${err?.message || err}`);
                } finally {
                    if (submitBtn && btnText) {
                        submitBtn.disabled = false;
                        btnText.textContent = 'Sign In';
                    }
                }
            });
        }
    }
}
