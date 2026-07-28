/**
 * AgentLogger - In-memory Telemetry & Log Collector for Hayagriva Subagents
 */

class AgentLogger {
    constructor() {
        this.activeContexts = new Map(); // requestId -> log events array
    }

    /**
     * Start a telemetry tracking context for a query request.
     */
    startContext(requestId) {
        this.activeContexts.set(requestId, []);
    }

    /**
     * Log a subagent event.
     */
    log(requestId, agent, phase, message, metadata = null) {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });
        const event = {
            timestamp: timeStr,
            agent: agent || 'AgentCoordinator',
            phase: phase || 'INFO',
            message,
            metadata
        };

        if (requestId && this.activeContexts.has(requestId)) {
            this.activeContexts.get(requestId).push(event);
        }

        // Also print to server console
        console.log(`[${timeStr}] [${event.agent}:${event.phase}] ${message}`);
        return event;
    }

    /**
     * Get all logs for a request context.
     */
    getLogs(requestId) {
        return this.activeContexts.get(requestId) || [];
    }

    /**
     * End and retrieve logs for a context.
     */
    endContext(requestId) {
        const logs = this.getLogs(requestId);
        this.activeContexts.delete(requestId);
        return logs;
    }

    /**
     * Format a list of log events into a collapsible GFM Markdown disclosure block.
     */
    formatMarkdownAccordion(logs) {
        if (!logs || logs.length === 0) return '';

        const iconMap = {
            'INIT': '🚀',
            'CLASSIFY': '🧭',
            'DETECT_TEMPLATE': '📑',
            'RAG_SEARCH': '🔍',
            'DELEGATE': '🔄',
            'AUDIT': '⚠️',
            'COMPILE': '✍️',
            'COMPLETE': '✅',
            'INFO': 'ℹ️'
        };

        const listItems = logs.map(l => {
            const icon = iconMap[l.phase] || 'ℹ️';
            return `<li><b>${l.timestamp}</b> [${l.agent}] ${icon} ${l.message}</li>`;
        }).join('\n');

        return `<details><summary>🧠 <b>Agent Thought Process & Audit Trail</b> (${logs.length} steps)</summary>\n<br/>\n<ul>\n${listItems}\n</ul>\n</details>\n\n`;
    }
}

module.exports = new AgentLogger();
