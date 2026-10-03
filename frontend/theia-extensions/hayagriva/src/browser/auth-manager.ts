// frontend/theia-extensions/hayagriva/src/browser/auth-manager.ts
import { injectable, inject } from '@theia/core/shared/inversify';
import { Emitter, Event, PreferenceService } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    org?: string;
    role?: string;
    tier?: string;
}

export interface AuthSession {
    token: string;
    user: AuthUser;
    lastVerifiedAt: string;
    leaseExpiresAt: string;
}

export interface AuthStateChangeEvent {
    authenticated: boolean;
    user: AuthUser | null;
    isOfflineGrace: boolean;
    remainingGraceDays: number;
}

export const AUTH_STORAGE_KEY = 'haya_auth_session';
export const OFFLINE_GRACE_PERIOD_DAYS = 7;
export const OFFLINE_GRACE_PERIOD_MS = OFFLINE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

@injectable()
export class AuthManager {
    protected currentSession: AuthSession | null = null;
    protected isOfflineGrace = false;

    protected readonly onAuthStateChangedEmitter = new Emitter<AuthStateChangeEvent>();
    readonly onAuthStateChanged: Event<AuthStateChangeEvent> = this.onAuthStateChangedEmitter.event;

    constructor(
        @inject(PreferenceService) protected readonly preferenceService: PreferenceService,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.loadSessionFromStorage();
    }

    getApiBaseUrl(): string {
        const port = this.preferenceService.get<number>('hayagriva.apiPort', 3210);
        return `http://127.0.0.1:${port}`;
    }

    /**
     * Loads persisted session from localStorage
     */
    protected loadSessionFromStorage(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as AuthSession;
                    if (parsed && parsed.token && parsed.user) {
                        this.currentSession = parsed;
                        this.evaluateOfflineGraceStatus();
                    }
                }
            }
        } catch (err: any) {
            this.logger.error(`[AuthManager] Failed to read auth storage: ${err?.message || err}`);
        }
    }

    /**
     * Persists or clears session in localStorage
     */
    protected saveSessionToStorage(session: AuthSession | null): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                if (session) {
                    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
                } else {
                    window.localStorage.removeItem(AUTH_STORAGE_KEY);
                }
            }
        } catch (err: any) {
            this.logger.error(`[AuthManager] Failed to write auth storage: ${err?.message || err}`);
        }
    }

    /**
     * Evaluates whether the current session is within the 7-day offline grace window
     */
    protected evaluateOfflineGraceStatus(): boolean {
        if (!this.currentSession) {
            this.isOfflineGrace = false;
            return false;
        }
        const lastVerified = new Date(this.currentSession.lastVerifiedAt).getTime();
        const now = Date.now();
        const elapsed = now - lastVerified;

        if (elapsed <= OFFLINE_GRACE_PERIOD_MS) {
            this.isOfflineGrace = true;
            return true;
        } else {
            this.isOfflineGrace = false;
            this.currentSession = null;
            this.saveSessionToStorage(null);
            return false;
        }
    }

    /**
     * Synchronizes authenticated session from the local backend license state and practitioner profile.
     * Unlocks AI Agents and sets verified profile status if the device holds an active license.
     */
    async syncFromLocalLicense(): Promise<{ ok: boolean; isOfflineGrace: boolean; error?: string }> {
        const baseUrl = this.getApiBaseUrl();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const licRes = await fetch(`${baseUrl}/api/hayagriva/license/status`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (licRes.ok) {
                const licData = await licRes.json();
                const lic = licData?.license || licData;
                const isLicenseActive = licData?.success && (lic?.status === 'ACTIVE' || lic?.is_subscribed || lic?.in_trial);

                if (isLicenseActive) {
                    // Fetch verified practitioner profile
                    let practitionerName = lic?.licensee || 'Practitioner';
                    let email = 'licensed@hayagriva.local';
                    let org = 'Chamber Practice';
                    let role = 'Advocate & Insolvency Professional';

                    try {
                        const profCtrl = new AbortController();
                        const profTimeout = setTimeout(() => profCtrl.abort(), 2000);
                        const profRes = await fetch(`${baseUrl}/api/hayagriva/practitioner/profile`, { signal: profCtrl.signal });
                        clearTimeout(profTimeout);
                        if (profRes.ok) {
                            const profData = await profRes.json();
                            const pId = profData?.profile?.identity || {};
                            const pContact = profData?.profile?.contact || {};
                            if (pId.fullName) practitionerName = pId.fullName;
                            if (pContact.email) email = pContact.email;
                            if (pId.firmName) org = pId.firmName;
                            if (pId.designation) role = pId.designation;
                        }
                    } catch (_) {}

                    if (lic?.licensee && !lic.licensee.startsWith('usr_')) {
                        practitionerName = lic.licensee;
                    } else if (lic?.licensee === 'usr_adv_01') {
                        practitionerName = 'Adv. Rajeshwar Rao';
                        email = 'r.rao@insolvencylaw.in';
                        org = 'Rao & Partners Insolvency Advocates';
                    }

                    const tier = (lic?.tier || 'enterprise').toUpperCase();

                    this.currentSession = {
                        token: lic?.license_key || 'license_local_active',
                        user: {
                            id: lic?.licensee || 'usr_practitioner',
                            name: practitionerName,
                            email: email,
                            org: org,
                            role: role,
                            tier: tier
                        },
                        lastVerifiedAt: new Date().toISOString(),
                        leaseExpiresAt: lic?.valid_until || new Date(Date.now() + 365 * 86400000).toISOString()
                    };
                    this.isOfflineGrace = false;
                    this.saveSessionToStorage(this.currentSession);
                    this.notifyStateChanged();
                    return { ok: true, isOfflineGrace: false };
                }
            }
        } catch (err: any) {
            this.logger.warn(`[AuthManager] Could not sync local license: ${err?.message || err}`);
        }

        this.notifyStateChanged();
        return { ok: false, isOfflineGrace: false, error: 'No active license found' };
    }

    /**
     * Validates stored session with the backend/cloud server.
     * If online and valid, refreshes lease.
     * If offline or no session, falls back to local license sync or 7-day grace period.
     */
    async verifySession(): Promise<{ ok: boolean; isOfflineGrace: boolean; error?: string }> {
        if (!this.currentSession) {
            return await this.syncFromLocalLicense();
        }

        const baseUrl = this.getApiBaseUrl();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(`${baseUrl}/api/auth/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.currentSession.token}`
                },
                body: JSON.stringify({ token: this.currentSession.token }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                this.isOfflineGrace = false;
                this.currentSession.lastVerifiedAt = data.verifiedAt || new Date().toISOString();
                this.currentSession.leaseExpiresAt = data.leaseExpiresAt || new Date(Date.now() + OFFLINE_GRACE_PERIOD_MS).toISOString();
                if (data.user) {
                    this.currentSession.user = data.user;
                }
                this.saveSessionToStorage(this.currentSession);
                this.notifyStateChanged();
                return { ok: true, isOfflineGrace: false };
            } else {
                // If cloud token expired, check if device holds an active local license
                const localSync = await this.syncFromLocalLicense();
                if (localSync.ok) return localSync;

                this.currentSession = null;
                this.isOfflineGrace = false;
                this.saveSessionToStorage(null);
                this.notifyStateChanged();
                return { ok: false, isOfflineGrace: false, error: 'Session expired or invalidated by server' };
            }
        } catch (networkErr: any) {
            // Server offline / network unreachable -> evaluate 7-day grace window or local license
            const withinGrace = this.evaluateOfflineGraceStatus();
            if (withinGrace) {
                this.notifyStateChanged();
                return { ok: true, isOfflineGrace: true };
            }
            return await this.syncFromLocalLicense();
        }
    }

    /**
     * Authenticates user credentials with the backend
     */
    async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
        const baseUrl = this.getApiBaseUrl();
        try {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();
            if (!res.ok || !data.ok) {
                return { ok: false, error: data.error || 'Authentication failed' };
            }

            this.currentSession = {
                token: data.token,
                user: data.user,
                lastVerifiedAt: new Date().toISOString(),
                leaseExpiresAt: data.leaseExpiresAt || new Date(Date.now() + OFFLINE_GRACE_PERIOD_MS).toISOString()
            };
            this.isOfflineGrace = false;
            this.saveSessionToStorage(this.currentSession);
            this.notifyStateChanged();
            return { ok: true };
        } catch (err: any) {
            return { ok: false, error: `Could not connect to server: ${err?.message || err}` };
        }
    }

    /**
     * Logs out and clears local session
     */
    async logout(): Promise<void> {
        const baseUrl = this.getApiBaseUrl();
        if (this.currentSession) {
            try {
                fetch(`${baseUrl}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.currentSession.token}`
                    }
                }).catch(() => {});
            } catch (_) {}
        }
        this.currentSession = null;
        this.isOfflineGrace = false;
        this.saveSessionToStorage(null);
        this.notifyStateChanged();
    }

    isAuthenticated(): boolean {
        return !!this.currentSession;
    }

    isOfflineGraceMode(): boolean {
        return this.isOfflineGrace;
    }

    getUser(): AuthUser | null {
        return this.currentSession ? this.currentSession.user : null;
    }

    getToken(): string | null {
        return this.currentSession ? this.currentSession.token : null;
    }

    getRemainingGraceDays(): number {
        if (!this.currentSession) return 0;
        const lastVerified = new Date(this.currentSession.lastVerifiedAt).getTime();
        const elapsed = Date.now() - lastVerified;
        const remainingMs = OFFLINE_GRACE_PERIOD_MS - elapsed;
        return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    }

    isFeatureAllowed(feature: 'agents' | 'billing' | 'dms'): boolean {
        if (feature === 'dms') return true; // DMS / Documents & Editor is always open
        return this.isAuthenticated();
    }

    protected notifyStateChanged(): void {
        this.onAuthStateChangedEmitter.fire({
            authenticated: this.isAuthenticated(),
            user: this.getUser(),
            isOfflineGrace: this.isOfflineGrace,
            remainingGraceDays: this.getRemainingGraceDays()
        });
    }
}
