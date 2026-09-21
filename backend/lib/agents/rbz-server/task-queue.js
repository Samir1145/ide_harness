'use strict';

/**
 * TaskQueueManager: Asynchronous Worker Queue with Concurrency Throttling
 * ------------------------------------------------------------------------
 * Manages concurrent RBZ forensic and audit tasks without crashing PostgreSQL
 * or dropping client requests during high-volume CIRP filing spikes.
 */

class TaskQueueManager {
    /**
     * @param {Object} options
     * @param {number} [options.maxConcurrent=3] Maximum simultaneous worker executions
     * @param {number} [options.estimatedJobDurationSec=3] Estimated sec per job for queue ETA
     */
    constructor(options = {}) {
        this.maxConcurrent = options.maxConcurrent || 3;
        this.estimatedJobDurationSec = options.estimatedJobDurationSec || 3;
        this._queue = []; // Array of { taskId, taskData, processorFn, resolve, reject }
        this._tasks = new Map(); // taskId -> taskState
        this._activeWorkers = 0;
        this._totalProcessed = 0;
        this._totalFailed = 0;
    }

    /**
     * Enqueues a new task for background execution. Returns immediate confirmation.
     * @param {Object} taskData
     * @param {Function} processorFn async (taskData) => resultObject
     * @returns {Object} Immediate queue acknowledgment
     */
    enqueue(taskData, processorFn) {
        if (!taskData || !taskData.task_id) {
            throw new Error('[TaskQueueManager] taskData must include a task_id');
        }

        const taskId = taskData.task_id;
        const serverTaskId = taskData.server_task_id || `srv_rbz_${Date.now().toString().slice(-8)}`;

        // Check if task is already known
        const existing = this._tasks.get(taskId);
        if (existing && (existing.status === 'COMPLETED' || existing.status === 'PROCESSING')) {
            return {
                taskId,
                serverTaskId: existing.server_task_id,
                status: existing.status,
                message: `Task is already ${existing.status}`
            };
        }

        const now = new Date().toISOString();
        const taskState = {
            taskId,
            serverTaskId,
            toolName: taskData.tool_name || 'rbz_inquest',
            reportType: taskData.report_type || 'INQUEST',
            status: 'QUEUED',
            enqueuedAt: now,
            startedAt: null,
            completedAt: null,
            result: null,
            error: null,
            payload: taskData.payload || taskData
        };

        this._tasks.set(taskId, taskState);

        // Calculate queue position and estimated wait
        const queuePosition = this._queue.length + 1;
        const estimatedWaitSec = Math.ceil((queuePosition / this.maxConcurrent) * this.estimatedJobDurationSec);

        this._queue.push({
            taskId,
            serverTaskId,
            taskData,
            processorFn
        });

        // Trigger worker loop asynchronously
        setImmediate(() => this._processNext());

        return {
            taskId,
            serverTaskId,
            status: 'QUEUED',
            queuePosition,
            estimatedWaitSec,
            enqueuedAt: now
        };
    }

    /**
     * Retrieves the current status and result (if ready) of a task.
     * @param {string} taskId
     * @returns {Object|null}
     */
    getTask(taskId) {
        return this._tasks.get(taskId) || null;
    }

    /**
     * Returns summary statistics of the queue.
     */
    getStats() {
        let queued = 0;
        let processing = 0;
        let completed = 0;
        let failed = 0;

        for (const t of this._tasks.values()) {
            if (t.status === 'QUEUED') queued++;
            else if (t.status === 'PROCESSING') processing++;
            else if (t.status === 'COMPLETED') completed++;
            else if (t.status === 'FAILED') failed++;
        }

        return {
            queued,
            processing,
            completed,
            failed,
            activeWorkers: this._activeWorkers,
            maxConcurrent: this.maxConcurrent,
            totalProcessed: this._totalProcessed,
            totalFailed: this._totalFailed
        };
    }

    /**
     * Background worker dispatcher.
     * @private
     */
    async _processNext() {
        if (this._activeWorkers >= this.maxConcurrent || this._queue.length === 0) {
            return;
        }

        const item = this._queue.shift();
        if (!item) return;

        const taskState = this._tasks.get(item.taskId);
        if (!taskState) return;

        this._activeWorkers++;
        taskState.status = 'PROCESSING';
        taskState.startedAt = new Date().toISOString();

        try {
            const result = await item.processorFn(item.taskData);
            taskState.status = 'COMPLETED';
            taskState.completedAt = new Date().toISOString();
            taskState.result = result;
            this._totalProcessed++;
        } catch (err) {
            taskState.status = 'FAILED';
            taskState.completedAt = new Date().toISOString();
            taskState.error = err.message || String(err);
            this._totalFailed++;
            console.error(`[TaskQueueManager] Task ${item.taskId} failed:`, err);
        } finally {
            this._activeWorkers--;
            // Recursively pick up next job
            setImmediate(() => this._processNext());
        }
    }

    /**
     * Clears all tasks and queues (for test cleanup).
     */
    clear() {
        this._queue = [];
        this._tasks.clear();
        this._activeWorkers = 0;
        this._totalProcessed = 0;
        this._totalFailed = 0;
    }
}

// Global Singleton Queue for RBZ Server
const defaultTaskQueue = new TaskQueueManager({ maxConcurrent: 3, estimatedJobDurationSec: 2 });

module.exports = {
    TaskQueueManager,
    taskQueue: defaultTaskQueue
};
