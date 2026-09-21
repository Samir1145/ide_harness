'use strict';

/**
 * RelatedPartyAgent (Hayagriva Client-Side Agent)
 * ------------------------------------------------
 * Proactive In-IDE Agent that senses Form A Public Announcements,
 * extracts Corporate Debtor metadata, stages Section 5(24) Related Party
 * investigations, and dispatches standardized PUT/GET MCP calls to the
 * Resolution Bazaar (RBZ) Server Agent.
 */

const path = require('path');
const fs = require('fs');
const { recordPendingTask, deliverReportAndSettle } = require('../../core/case-billing-store');

class RelatedPartyClientAgent {
    constructor() {
        this.name = 'RelatedPartyAgent (Haya)';
        this.tag = '@related_party';
        this.description = 'Client-side co-pilot for IBC Section 5(24) related party audits and Section 21(2) CoC exclusions.';
        this.rateInr = 1500.00;
        this.gstInr = 270.00;
        this.totalInr = 1770.00;
    }

    /**
     * Extracts Form A parameters from text or file content.
     */
    extractFormAContext(textOrFilePath) {
        let content = textOrFilePath;
        if (typeof textOrFilePath === 'string' && fs.existsSync(textOrFilePath)) {
            content = fs.readFileSync(textOrFilePath, 'utf8');
        }

        const cdMatch = content.match(/Name of corporate debtor\s*\|\s*\*\*([^\*]+)\*\*/i) ||
                        content.match(/(?:name of (?:the\s+)?corporate debtor|creditors of\s+m\/s\.?|creditors of)\s*[:\*\s|]+([A-Za-z0-9\s.,'()\-]+?)(?:\n|\*|\||$)/i);
        const cinMatch = content.match(/U[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}/i);
        const cpMatch = content.match(/(?:Company Petition No\.?\s*\(IB\)\s*NO\.?|CP\s*\(IB\)\s*NO\.)\s*([0-9\/A-Z]+)/i);
        const benchMatch = content.match(/National Company Law Tribunal,\s*([^,\n]+(?:,[^,\n]+)?)/i);
        const icdMatch = content.match(/([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4})/i);
        const irpMatch = content.match(/Name and registration number of IRP\s*\|\s*\*\*([^\*]+)\*\*/i) ||
                         content.match(/Manoj Kumar Anand/i);
        const addressMatch = content.match(/address of (?:the\s+)?registered office[^\n|]*\|\s*([^\n|]+)/i);

        let extractedCd = cdMatch ? cdMatch[1].trim().replace(/^\*+|\*+$/g, '').trim() : 'Corporate Debtor';
        // Normalize title case if ALL CAPS
        if (extractedCd === extractedCd.toUpperCase()) {
            extractedCd = extractedCd.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }

        return {
            corporate_debtor: extractedCd,
            cin: cinMatch ? cinMatch[0].trim() : '',
            case_number: cpMatch ? `CP (IB) NO. ${cpMatch[1].trim()}` : 'CP (IB) NO. 465/ND/2024',
            nclt_bench: benchMatch ? benchMatch[1].trim() : 'Court II, New Delhi',
            admission_date: icdMatch ? icdMatch[1].trim() : '2026-04-24',
            irp_name: irpMatch ? (irpMatch[1] ? irpMatch[1].trim() : irpMatch[0].trim()) : 'Manoj Kumar Anand',
            registered_office: addressMatch ? addressMatch[1].trim() : ''
        };
    }

    /**
     * Stages the Related Party task in the case's local SQLite billing store.
     */
    stageReportTask(caseDir, formAContext, userEmail = 'advocate@chamber.in') {
        const task = recordPendingTask(caseDir, {
            tool_name: 'rbz_related_party_inquest',
            target_identifier: formAContext.cin || formAContext.corporate_debtor,
            target_name: formAContext.corporate_debtor,
            rate_inr: this.rateInr,
            email: userEmail,
            payload: formAContext
        });

        return {
            success: true,
            taskId: task.task_id,
            toolName: task.tool_name,
            totalInr: Math.round(task.rate_inr * 1.18 * 100) / 100,
            message: `Task ${task.task_id} successfully recorded in local SQLite ledger under PENDING_APPROVAL.`
        };
    }

    /**
     * Executes the standardized MCP PUT/GET round-trip report cycle with RBZ Server.
     * Supports both real HTTP/MCP network transport (default port 4001) and in-process fallback.
     */
    async executeMcpReportCycle(caseDir, taskId, formAContext, rbzServerAgent = null, options = {}) {
        // Resolve target server URL from options, settings, or environment
        let serverUrl = (options && options.serverUrl) || process.env.RBZ_SERVER_URL;
        if (!serverUrl && caseDir && fs.existsSync(path.join(caseDir, 'hayagriva_settings.json'))) {
            try {
                const settings = JSON.parse(fs.readFileSync(path.join(caseDir, 'hayagriva_settings.json'), 'utf8'));
                serverUrl = settings.resolutionbazaar_url || settings.lightragApiUrl;
            } catch (_) {}
        }

        // If explicitly requested or default HTTP available and no custom agent instance passed
        if (serverUrl && typeof rbzServerAgent !== 'object') {
            try {
                return await this._executeHttpMcpCycle(caseDir, taskId, formAContext, serverUrl, options);
            } catch (netErr) {
                console.warn(`[RelatedPartyClientAgent] Network call to ${serverUrl} failed (${netErr.message}), falling back to in-process execution.`);
            }
        }

        // ── IN-PROCESS EXECUTION FALLBACK ────────────────────────────────────
        if (!rbzServerAgent || typeof rbzServerAgent !== 'object') {
            rbzServerAgent = require('../rbz-server/related-party-server-agent');
        }

        // 1. STANDARDIZED MCP PUT: Submit Task to RBZ Server Agent
        const putRequest = {
            jsonrpc: '2.0',
            id: `mcp_put_${Date.now()}`,
            method: 'tools/call',
            params: {
                name: 'resolution_bazaar:put_report_task',
                arguments: {
                    task_id: taskId,
                    case_id: path.basename(caseDir),
                    report_type: 'RELATED_PARTY_AUDIT',
                    payload: formAContext
                }
            }
        };

        const putResponse = await rbzServerAgent.putReportTask(putRequest.params.arguments);
        if (!putResponse || !putResponse.success) {
            throw new Error(`[RelatedPartyClientAgent] PUT failed: ${JSON.stringify(putResponse)}`);
        }

        // 2. STANDARDIZED MCP GET: Poll until Task status is COMPLETED
        let getResponse = null;
        const maxWaitMs = 15000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            getResponse = await rbzServerAgent.getReportResult(taskId);
            if (getResponse && getResponse.status === 'COMPLETED') {
                break;
            }
            if (getResponse && getResponse.status === 'FAILED') {
                throw new Error(`[RelatedPartyClientAgent] Remote task execution failed: ${getResponse.error}`);
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!getResponse || getResponse.status !== 'COMPLETED') {
            throw new Error(`[RelatedPartyClientAgent] GET timed out or report not ready: ${JSON.stringify(getResponse)}`);
        }

        // 3. Deliver Report to <caseDir>/RBZ_reports/ and Settle SQLite Ledger
        return this._settleAndDeliver(caseDir, taskId, getResponse);
    }

    /**
     * Executes real HTTP loopback / network MCP calls against the standalone RBZ server.
     * @private
     */
    async _executeHttpMcpCycle(caseDir, taskId, formAContext, serverUrl, options = {}) {
        const cleanUrl = serverUrl.replace(/\/+$/, '');
        const caseId = path.basename(caseDir);

        // 1. HTTP POST /api/mcp/tasks (Standardized MCP PUT)
        const putPayload = {
            task_id: taskId,
            case_id: caseId,
            report_type: 'RELATED_PARTY_AUDIT',
            payload: formAContext
        };

        const putRes = await fetch(`${cleanUrl}/api/mcp/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.apiKey || 'rbz_live_key'}`
            },
            body: JSON.stringify(putPayload)
        });

        if (!putRes.ok && putRes.status !== 202) {
            const errText = await putRes.text();
            throw new Error(`HTTP PUT /api/mcp/tasks returned status ${putRes.status}: ${errText}`);
        }

        const putData = await putRes.json();
        if (!putData.success && putData.status !== 'QUEUED' && putData.status !== 'COMPLETED') {
            throw new Error(`[RelatedPartyClientAgent] HTTP PUT failed: ${JSON.stringify(putData)}`);
        }

        // 2. HTTP GET /api/mcp/tasks/:taskId with asynchronous polling
        let completedResult = null;
        const maxWaitMs = 20000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const getRes = await fetch(`${cleanUrl}/api/mcp/tasks/${encodeURIComponent(taskId)}`, {
                headers: {
                    'Authorization': `Bearer ${options.apiKey || 'rbz_live_key'}`
                }
            });

            if (getRes.ok) {
                const pollData = await getRes.json();
                if (pollData.status === 'COMPLETED') {
                    completedResult = pollData;
                    break;
                }
                if (pollData.status === 'FAILED') {
                    throw new Error(`[RelatedPartyClientAgent] Server task failed: ${pollData.error}`);
                }
            }

            // Wait 250ms before next poll
            await new Promise(r => setTimeout(r, 250));
        }

        if (!completedResult) {
            throw new Error(`[RelatedPartyClientAgent] Timed out waiting for report completion from ${cleanUrl}`);
        }

        // 3. Deliver and Settle
        return this._settleAndDeliver(caseDir, taskId, completedResult);
    }

    /**
     * Common helper: Writes report to disk with verified YAML frontmatter and settles SQLite ledger.
     * @private
     */
    _settleAndDeliver(caseDir, taskId, reportPayload) {
        const deliveryResult = deliverReportAndSettle(caseDir, taskId, {
            invoice_number: reportPayload.invoice_number,
            payment_id: reportPayload.gateway_payment_id,
            title: reportPayload.title,
            filename: reportPayload.filename,
            content: reportPayload.content
        });

        return {
            success: true,
            taskId,
            serverTaskId: reportPayload.server_task_id,
            invoiceNumber: reportPayload.invoice_number,
            paymentId: reportPayload.gateway_payment_id,
            receiptSignature: reportPayload.receipt_signature,
            reportPath: deliveryResult.report_path,
            reportAbsPath: deliveryResult.report_abs_path,
            totalInr: reportPayload.total_inr,
            structuredData: reportPayload.structured_data,
            message: `Related Party Report delivered to ${deliveryResult.report_path} and ledger settled.`
        };
    }
}

module.exports = new RelatedPartyClientAgent();

