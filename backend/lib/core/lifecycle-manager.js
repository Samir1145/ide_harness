'use strict';

const path = require('path');
const { closeDb, closeAllDbs } = require('./sqlite-store');

/**
 * Disposable Matter Scope (Cordis-style Reversible Effect Container).
 * Tracks all effects (watchers, DB handles, timers, workers, listeners)
 * associated with a specific matter, guaranteeing deterministic reverse-order cleanup.
 */
class MatterScope {
    constructor(caseDir) {
        this.caseDir = caseDir;
        this.matterName = path.basename(caseDir);
        this.createdAt = new Date().toISOString();
        this.disposed = false;
        this._effects = []; // Array of { name, cleanupFn }
    }

    /**
     * Registers an arbitrary cleanup effect.
     * @param {Function} cleanupFn - Synchronous or asynchronous function returning a Promise.
     * @param {string} [name='anonymous_effect']
     * @returns {Function} Unregister function (to manually detach effect before disposal).
     */
    registerEffect(cleanupFn, name = 'anonymous_effect') {
        if (this.disposed) {
            console.warn(`[LifecycleScope] Cannot register effect "${name}" on already disposed scope: ${this.matterName}`);
            return () => {};
        }

        const effect = { name, cleanupFn };
        this._effects.push(effect);

        // Return unregister handle
        return () => {
            const idx = this._effects.indexOf(effect);
            if (idx !== -1) {
                this._effects.splice(idx, 1);
            }
        };
    }

    /**
     * Registers a file watcher (e.g. Chokidar).
     */
    registerWatcher(watcher, name = 'chokidar_watcher') {
        if (!watcher) return () => {};
        return this.registerEffect(async () => {
            if (typeof watcher.close === 'function') {
                await watcher.close();
            }
        }, name);
    }

    /**
     * Registers a timer or interval.
     */
    registerTimer(timerId, name = 'timer') {
        if (!timerId) return () => {};
        return this.registerEffect(() => {
            clearTimeout(timerId);
            clearInterval(timerId);
        }, name);
    }

    /**
     * Registers an event listener on an EventEmitter.
     */
    registerListener(emitter, event, handler, name = 'event_listener') {
        if (!emitter || !event || !handler) return () => {};
        return this.registerEffect(() => {
            if (typeof emitter.off === 'function') {
                emitter.off(event, handler);
            } else if (typeof emitter.removeListener === 'function') {
                emitter.removeListener(event, handler);
            }
        }, `${name}:${event}`);
    }

    /**
     * Registers a child process (e.g. llama-server or external helper).
     */
    registerChildProcess(proc, name = 'child_process') {
        if (!proc) return () => {};
        return this.registerEffect(() => {
            try {
                if (proc && !proc.killed && typeof proc.kill === 'function') {
                    proc.kill('SIGTERM');
                }
            } catch (_) {}
        }, name);
    }

    /**
     * Executes all registered cleanups in LIFO (reverse) order.
     */
    async dispose() {
        if (this.disposed) return;
        this.disposed = true;

        console.log(`[LifecycleScope] 🧹 Disposing scope for matter "${this.matterName}" (${this._effects.length} effects)...`);

        // LIFO unwind
        while (this._effects.length > 0) {
            const effect = this._effects.pop();
            try {
                const res = effect.cleanupFn();
                if (res && typeof res.then === 'function') {
                    await res;
                }
            } catch (err) {
                console.warn(`[LifecycleScope] Error executing cleanup for "${effect.name}":`, err.message);
            }
        }

        // Close SQLite DB connection for this case
        try {
            closeDb(this.caseDir);
        } catch (dbErr) {
            console.warn(`[LifecycleScope] Error closing SQLite DB for "${this.matterName}":`, dbErr.message);
        }

        console.log(`[LifecycleScope] ✓ Scope for matter "${this.matterName}" cleanly disposed.`);
    }

    get effectsCount() {
        return this._effects.length;
    }
}

/**
 * MatterLifecycleManager (Singleton Coordinator).
 * Manages all active matter scopes, handles matter switching, and registers
 * process-level teardown hooks (SIGINT, SIGTERM, exit).
 */
class MatterLifecycleManager {
    constructor() {
        this._scopes = new Map(); // caseDir -> MatterScope
        this._activeMatterDir = null;
        this._processHooksRegistered = false;
        this.registerProcessHooks();
    }

    /**
     * Retrieves or creates a MatterScope for a case directory.
     * @param {string} caseDir 
     * @returns {MatterScope}
     */
    getScope(caseDir) {
        if (!caseDir || typeof caseDir !== 'string') return null;
        const normalized = path.resolve(caseDir);
        const existing = this._scopes.get(normalized);
        if (existing && !existing.disposed) {
            return existing;
        }
        const scope = new MatterScope(normalized);
        this._scopes.set(normalized, scope);
        return scope;
    }

    /**
     * Sets the currently active matter in the workspace.
     */
    setActiveMatter(caseDir) {
        this._activeMatterDir = caseDir ? path.resolve(caseDir) : null;
        return this.getScope(this._activeMatterDir);
    }

    /**
     * Gets the currently active matter directory.
     */
    getActiveMatter() {
        return this._activeMatterDir;
    }

    /**
     * Teardown an individual matter cleanly.
     * Unwinds all watchers, timers, DB connections, and background tasks.
     * 
     * @param {string} caseDir 
     * @returns {Promise<boolean>}
     */
    async teardownMatter(caseDir) {
        if (!caseDir) return false;
        const normalized = path.resolve(caseDir);
        const scope = this._scopes.get(normalized);

        if (scope) {
            await scope.dispose();
            this._scopes.delete(normalized);
        } else {
            // Ensure DB is closed even if scope wasn't explicitly created
            try { closeDb(normalized); } catch (_) {}
        }

        if (this._activeMatterDir === normalized) {
            this._activeMatterDir = null;
        }

        return true;
    }

    /**
     * Cordis-Style Clean Matter Switch.
     * Tears down the previous matter completely and initializes the new matter.
     * 
     * @param {string} fromCaseDir - Previous matter to unwind.
     * @param {string} toCaseDir - Incoming matter to activate.
     * @returns {Promise<Object>}
     */
    async switchMatter(fromCaseDir, toCaseDir) {
        console.log(`[LifecycleManager] 🔄 Switching matter: "${fromCaseDir ? path.basename(fromCaseDir) : 'none'}" ➔ "${toCaseDir ? path.basename(toCaseDir) : 'none'}"`);

        // 1. Teardown previous matter if provided
        if (fromCaseDir && fromCaseDir !== toCaseDir) {
            await this.teardownMatter(fromCaseDir);
        }

        // 2. Initialize new active matter scope
        let newScope = null;
        if (toCaseDir) {
            newScope = this.setActiveMatter(toCaseDir);
        }

        return {
            success: true,
            previous_matter: fromCaseDir ? path.basename(fromCaseDir) : null,
            active_matter: toCaseDir ? path.basename(toCaseDir) : null,
            active_scope_ready: !!newScope
        };
    }

    /**
     * Teardown all matters and dispose the entire harness.
     * Used on application shutdown.
     */
    async teardownAll() {
        console.log(`[LifecycleManager] 🛑 Executing global teardown across ${this._scopes.size} active matter scopes...`);
        const promises = [];
        for (const [caseDir, scope] of this._scopes.entries()) {
            promises.push(scope.dispose().catch(e => console.warn(`Error disposing ${caseDir}:`, e.message)));
        }
        await Promise.all(promises);
        this._scopes.clear();
        this._activeMatterDir = null;

        // Close any remaining orphan DB connections
        try {
            closeAllDbs();
        } catch (_) {}

        console.log('[LifecycleManager] ✓ Global teardown completed successfully.');
    }

    /**
     * Returns a diagnostic telemetry summary of active scopes and effects.
     */
    getStatus() {
        const scopesData = [];
        for (const [caseDir, scope] of this._scopes.entries()) {
            scopesData.push({
                matter: scope.matterName,
                caseDir,
                effects_count: scope.effectsCount,
                disposed: scope.disposed,
                created_at: scope.createdAt
            });
        }

        return {
            active_matter: this._activeMatterDir,
            total_active_scopes: this._scopes.size,
            scopes: scopesData
        };
    }

    /**
     * Registers process-level signal handlers for graceful exit.
     */
    registerProcessHooks() {
        if (this._processHooksRegistered) return;
        this._processHooksRegistered = true;

        const onSignal = async (signal) => {
            console.log(`\n[LifecycleManager] Received ${signal}. Unwinding all matter lifecycles...`);
            await this.teardownAll();
        };

        // Note: We don't force process.exit here so existing CLI exit handlers can finish cleanly
        process.once('SIGINT', () => onSignal('SIGINT'));
        process.once('SIGTERM', () => onSignal('SIGTERM'));
    }
}

const lifecycleManagerInstance = new MatterLifecycleManager();
module.exports = lifecycleManagerInstance;
module.exports.MatterLifecycleManager = MatterLifecycleManager;
module.exports.MatterScope = MatterScope;
