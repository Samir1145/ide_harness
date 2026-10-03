// frontend/theia-extensions/hayagriva/src/browser/profile-widget.ts
import { injectable, inject } from '@theia/core/shared/inversify';
import { AuthManager } from './auth-manager';
import { AuthModal } from './auth-modal';
import { ILogger } from '@theia/core/lib/common/logger';
import { CommandService } from '@theia/core/lib/common/command';

@injectable()
export class ProfileWidget {
    protected buttonElement: HTMLElement | null = null;
    protected popoverElement: HTMLElement | null = null;
    protected isPopoverOpen = false;

    constructor(
        @inject(AuthManager) protected readonly authManager: AuthManager,
        @inject(AuthModal) protected readonly authModal: AuthModal,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.authManager.onAuthStateChanged((e) => {
            this.updateButtonDisplay();
            if (this.isPopoverOpen) {
                this.renderPopoverContent();
            }
        });
    }

    initialize(): void {
        this.injectStyles();
        this.mountProfileButton();
        this.setupOutsideClickListener();
        if (!this.authManager.isAuthenticated()) {
            this.authManager.syncFromLocalLicense().catch(() => {});
        }
    }

    protected injectStyles(): void {
        if (document.getElementById('haya-profile-styles')) return;
        const style = document.createElement('style');
        style.id = 'haya-profile-styles';
        style.textContent = `
            #hayagriva-profile-anchor {
                position: fixed;
                bottom: 30px !important;
                left: 6px !important;
                z-index: 10000;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                user-select: none;
            }
            .haya-profile-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: rgba(30, 41, 59, 0.9);
                border: 1.5px solid rgba(212, 160, 23, 0.5);
                color: #d4a017;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11.5px;
                font-weight: 700;
                position: relative;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
            }
            #hayagriva-profile-anchor:hover .haya-profile-avatar {
                transform: scale(1.08);
                border-color: #d4a017;
                box-shadow: 0 0 12px rgba(212, 160, 23, 0.4);
            }
            .haya-profile-avatar.logged-out {
                border-color: rgba(148, 163, 184, 0.4);
                color: #94a3b8;
                background: rgba(15, 23, 42, 0.7);
            }
            .haya-status-pip {
                position: absolute;
                bottom: -1px;
                right: -1px;
                width: 9px;
                height: 9px;
                border-radius: 50%;
                border: 2px solid #0f172a;
            }
            .haya-status-pip.online {
                background: #10b981;
            }
            .haya-status-pip.offline-grace {
                background: #f59e0b;
            }
            .haya-status-pip.logged-out {
                background: #64748b;
            }

            /* Popover Card */
            #haya-profile-popover {
                position: fixed;
                bottom: 30px !important;
                left: 54px !important;
                width: 290px;
                background: rgba(22, 27, 46, 0.94);
                border: 1px solid rgba(212, 160, 23, 0.3);
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 20px rgba(212, 160, 23, 0.08);
                border-radius: 12px;
                padding: 18px 20px;
                color: #e2e8f0;
                z-index: 10001;
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: none;
                animation: hayaFadeIn 0.15s ease-out;
            }
            @keyframes hayaFadeIn {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .haya-popover-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 14px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .haya-popover-avatar-lg {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, rgba(212, 160, 23, 0.2), rgba(212, 160, 23, 0.05));
                border: 1.5px solid #d4a017;
                color: #d4a017;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 700;
            }
            .haya-popover-name {
                font-size: 14px;
                font-weight: 700;
                color: #f8fafc;
                margin: 0 0 2px;
            }
            .haya-popover-email {
                font-size: 11.5px;
                color: #94a3b8;
                margin: 0;
            }
            .haya-popover-badge {
                display: inline-block;
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 12px;
            }
            .haya-popover-badge.tier {
                background: rgba(212, 160, 23, 0.15);
                color: #d4a017;
                border: 1px solid rgba(212, 160, 23, 0.3);
            }
            .haya-popover-status-row {
                font-size: 11.5px;
                color: #cbd5e1;
                margin-bottom: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .haya-popover-btn {
                width: 100%;
                padding: 8px 12px;
                background: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.35);
                color: #fca5a5;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .haya-popover-btn:hover {
                background: rgba(239, 68, 68, 0.25);
                color: #fff;
                border-color: rgba(239, 68, 68, 0.6);
            }
            .haya-popover-signin-btn {
                width: 100%;
                padding: 9px 12px;
                background: linear-gradient(135deg, #d4a017, #b8860b);
                border: none;
                color: #0f172a;
                border-radius: 6px;
                font-size: 12.5px;
                font-weight: 700;
                cursor: pointer;
                transition: filter 0.15s ease;
            }
            .haya-popover-signin-btn:hover {
                filter: brightness(1.1);
            }
        `;
        document.head.appendChild(style);
    }

    protected mountProfileButton(): void {
        if (this.buttonElement) return;

        const container = document.createElement('div');
        container.id = 'hayagriva-profile-anchor';
        container.title = 'Account & Auth Status';
        
        container.innerHTML = `
            <div class="haya-profile-avatar" id="haya-profile-avatar-icon">
                <span id="haya-profile-initials">👤</span>
                <span class="haya-status-pip logged-out" id="haya-profile-pip"></span>
            </div>
        `;

        container.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePopover();
        });

        document.body.appendChild(container);
        this.buttonElement = container;

        // Popover DOM container
        const popover = document.createElement('div');
        popover.id = 'haya-profile-popover';
        popover.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(popover);
        this.popoverElement = popover;

        this.updateButtonDisplay();
    }

    protected getInitials(name: string): string {
        if (!name) return 'HG';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    updateButtonDisplay(): void {
        if (!this.buttonElement) return;
        const avatar = this.buttonElement.querySelector('#haya-profile-avatar-icon');
        const initials = this.buttonElement.querySelector('#haya-profile-initials');
        const pip = this.buttonElement.querySelector('#haya-profile-pip');

        if (!avatar || !initials || !pip) return;

        const isAuth = this.authManager.isAuthenticated();
        const user = this.authManager.getUser();
        const isOffline = this.authManager.isOfflineGraceMode();

        if (isAuth && user) {
            avatar.classList.remove('logged-out');
            initials.textContent = this.getInitials(user.name);
            pip.className = 'haya-status-pip ' + (isOffline ? 'offline-grace' : 'online');
            this.buttonElement.title = `Account: ${user.name} (${isOffline ? 'Offline Grace' : 'Connected'})`;
        } else {
            avatar.classList.add('logged-out');
            initials.textContent = '👤';
            pip.className = 'haya-status-pip logged-out';
            this.buttonElement.title = 'Account: Not Logged In (Click to Sign In)';
        }
    }

    togglePopover(): void {
        if (this.isPopoverOpen) {
            this.closePopover();
        } else {
            this.openPopover();
        }
    }

    openPopover(): void {
        if (!this.popoverElement) return;
        if (!this.authManager.isAuthenticated()) {
            this.authManager.syncFromLocalLicense().then(() => {
                if (this.isPopoverOpen) {
                    this.renderPopoverContent();
                }
            }).catch(() => {});
        }
        this.renderPopoverContent();
        this.popoverElement.style.display = 'block';
        this.isPopoverOpen = true;
    }

    closePopover(): void {
        if (!this.popoverElement) return;
        this.popoverElement.style.display = 'none';
        this.isPopoverOpen = false;
    }

    protected renderPopoverContent(): void {
        if (!this.popoverElement) return;
        const isAuth = this.authManager.isAuthenticated();
        const user = this.authManager.getUser();
        const isOffline = this.authManager.isOfflineGraceMode();
        const graceDays = this.authManager.getRemainingGraceDays();

        if (isAuth && user) {
            const initials = this.getInitials(user.name);
            const statusText = isOffline
                ? `⚠️ Offline Grace Mode (${graceDays} day${graceDays === 1 ? '' : 's'} remaining)`
                : `🟢 Connected & Verified (Online)`;

            this.popoverElement.innerHTML = `
                <div class="haya-popover-header">
                    <div class="haya-popover-avatar-lg">${initials}</div>
                    <div style="overflow: hidden;">
                        <h4 class="haya-popover-name">${user.name}</h4>
                        <p class="haya-popover-email">${user.email}</p>
                    </div>
                </div>
                ${user.org ? `<div style="font-size: 11.5px; color: #94a3b8; margin-bottom: 8px;">🏛️ ${user.org}</div>` : ''}
                <div class="haya-popover-badge tier">Plan: ${user.tier || 'Enterprise'} Tier</div>
                <div class="haya-popover-status-row">
                    <span>${statusText}</span>
                </div>
                <a href="https://app-apnet-net.onrender.com/dashboard/licenses" target="_blank" style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; box-sizing: border-box; padding: 7px 12px; margin-bottom: 8px; background: rgba(212, 160, 23, 0.12); border: 1px solid rgba(212, 160, 23, 0.35); color: #d4a017; border-radius: 6px; font-size: 11.5px; font-weight: 600; text-align: center; text-decoration: none; transition: all 0.15s ease;">
                    <span>🌐</span> Open Cloud Portal &amp; Licenses &rarr;
                </a>
                <button class="haya-popover-manage-btn" id="haya-popover-manage-btn" style="width: 100%; padding: 8px 12px; margin-bottom: 8px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease;">
                    <span>⚙️</span> Manage Identity &amp; Chamber
                </button>
                <button class="haya-popover-btn" id="haya-popover-signout-btn">
                    <span>🚪</span> Sign Out
                </button>
            `;

            const manageBtn = this.popoverElement.querySelector('#haya-popover-manage-btn');
            if (manageBtn) {
                manageBtn.addEventListener('click', () => {
                    this.closePopover();
                    this.commandService.executeCommand('hayagriva:openIdentitySettings');
                });
            }

            const signoutBtn = this.popoverElement.querySelector('#haya-popover-signout-btn');
            if (signoutBtn) {
                signoutBtn.addEventListener('click', async () => {
                    this.closePopover();
                    await this.authManager.logout();
                    this.authModal.show('You have been signed out. Enter credentials to sign back in.');
                });
            }
        } else {
            this.popoverElement.innerHTML = `
                <div class="haya-popover-header">
                    <div class="haya-popover-avatar-lg">👤</div>
                    <div>
                        <h4 class="haya-popover-name">Guest Advocate</h4>
                        <p class="haya-popover-email">Local DMS Access Only</p>
                    </div>
                </div>
                <div style="font-size: 12px; color: #94a3b8; line-height: 1.45; margin-bottom: 14px;">
                    Activate your Hayagriva License or configure your chamber credentials to unlock Autonomous AI Agents.
                </div>
                <div style="font-size: 11.5px; text-align: center; margin-bottom: 10px;">
                    <a href="https://app-apnet-net.onrender.com/register" target="_blank" style="color: #38bdf8; text-decoration: none;">Don't have an account? Register on Portal &rarr;</a>
                </div>
                <button class="haya-popover-manage-btn" id="haya-popover-guest-manage-btn" style="width: 100%; padding: 8px 12px; margin-bottom: 8px; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.15s ease;">
                    <span>⚙️</span> Practitioner &amp; Chamber Settings
                </button>
                <button class="haya-popover-signin-btn" id="haya-popover-signin-btn">
                    ⚡ Activate License / Sign In
                </button>
            `;

            const guestManageBtn = this.popoverElement.querySelector('#haya-popover-guest-manage-btn');
            if (guestManageBtn) {
                guestManageBtn.addEventListener('click', () => {
                    this.closePopover();
                    this.commandService.executeCommand('hayagriva:openIdentitySettings');
                });
            }

            const signinBtn = this.popoverElement.querySelector('#haya-popover-signin-btn');
            if (signinBtn) {
                signinBtn.addEventListener('click', () => {
                    this.closePopover();
                    this.authModal.show();
                });
            }
        }
    }

    protected setupOutsideClickListener(): void {
        window.addEventListener('click', (e) => {
            if (this.isPopoverOpen && this.popoverElement && !this.popoverElement.contains(e.target as Node)) {
                this.closePopover();
            }
        });
    }
}
