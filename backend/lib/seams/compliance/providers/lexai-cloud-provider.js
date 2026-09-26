'use strict';

const path = require('path');
const { updateTaskStatus } = require('../../../gatekeeper/compliance_queue');
const StatutoryAuditor = require('../../../agents/subagents/statutory-auditor');

const DEFAULT_SERVER_URL = process.env.LEXAI_API_URL || 'http://localhost:4000';

/**
 * LexAICloudProvider (Service Provider)
 * Connects Hayagriva to the global LexAI Forensic Intelligence Desk (Port 4000).
 * Handles:
 * 1. Outbound Requisition Commissioning via HTTP API (with offline staged fallback).
 * 2. Inbound Dossier Ingestion (TiddlyWiki JSON tiddlers -> Standalone Wiki -> Monaco Audit Note -> Reg 36A(8) Cure Notice).
 */
class LexAICloudProvider {
  constructor() {
    this.name = 'LexAICloudProvider';
    this.tier = 'GLOBAL';
    this.auditor = new StatutoryAuditor();
  }

  /**
   * Commission a task via the LexAI API on port 4000.
   */
  async dispatch(matterDir, task, options = {}) {
    const taskId = task.task_id;
    const serverUrl = options.serverUrl || DEFAULT_SERVER_URL;
    const matterName = path.basename(matterDir);
    const commissionEndpoint = `${serverUrl}/api/v1/reports/commission`;

    const payload = {
      report_id: task.report_id,
      inputs: task.required_inputs || {},
      matter_id: matterName,
      requested_by: options.requestedBy || 'HAYAGRIVA_SEAM'
    };

    try {
      const res = await fetch(commissionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LexAI API responded with HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const dispatchResult = {
        server_task_id: data.task_id,
        receipt_id: data.receipt_id,
        server_url: serverUrl,
        server_status: data.status || 'QUEUED',
        dispatched_at: new Date().toISOString()
      };

      updateTaskStatus(matterDir, taskId, 'DISPATCHED', {
        dispatch_mode: 'API',
        dispatch_result: dispatchResult
      });

      console.log(`[LexAICloudProvider] 🚀 Successfully commissioned ${task.report_id} via API: Receipt ${data.receipt_id}`);
      return {
        success: true,
        mode: 'API',
        task_id: taskId,
        server_task_id: data.task_id,
        receipt_id: data.receipt_id,
        message: `Report commissioned via LexAI Cloud API (${data.receipt_id})`
      };
    } catch (err) {
      console.warn(`[LexAICloudProvider] API dispatch for ${taskId} encountered error:`, err.message);

      // Offline / Unreachable fallback: Generate staged receipt so practitioner workflow proceeds
      if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
        const offlineReceiptId = `LEXAI-STAGED-${Date.now().toString(36).toUpperCase()}`;
        const offlineTaskId = `srv_${Date.now().toString(36)}`;
        const dispatchResult = {
          server_task_id: offlineTaskId,
          receipt_id: offlineReceiptId,
          server_url: serverUrl,
          server_status: 'STAGED_OFFLINE',
          dispatched_at: new Date().toISOString(),
          note: 'Commissioned & staged locally. Requisition will sync upon connecting to LexAI network.'
        };

        updateTaskStatus(matterDir, taskId, 'DISPATCHED', {
          dispatch_mode: 'API_OFFLINE_STAGED',
          dispatch_result: dispatchResult
        });

        console.log(`[LexAICloudProvider] 📋 Staged ${task.report_id} locally with receipt: ${offlineReceiptId}`);
        return {
          success: true,
          mode: 'API_OFFLINE_STAGED',
          task_id: taskId,
          server_task_id: offlineTaskId,
          receipt_id: offlineReceiptId,
          message: `LexAI Server offline. Requisition staged locally (${offlineReceiptId}).`
        };
      }

      throw err;
    }
  }

  /**
   * Ingest completed LexAI report (delivered as TiddlyWiki JSON tiddlers).
   */
  async ingest(matterDir, payload, options = {}) {
    const taskId = payload.taskId || payload.task_id;
    if (!taskId) {
      throw new Error('[LexAICloudProvider] taskId is required for report ingestion');
    }

    const auditResult = this.auditor.auditReportAndDraftCure(matterDir, {
      taskId,
      reportId: payload.reportId || payload.report_id || 'REPORT_11',
      reportTitle: payload.reportTitle || payload.report_title || 'Section 29A Eligibility Dossier',
      tiddlers: payload.tiddlers || [],
      metadata: payload.metadata || {}
    });

    updateTaskStatus(matterDir, taskId, 'COMPLETED', {
      dispatch_mode: options.simulated ? 'SIMULATED_LEXAI_DELIVERY' : 'LEXAI_TIDDLYWIKI_AUDIT',
      dispatch_result: auditResult
    });

    try {
      const inboxManager = require('../../../agents/inbox-manager');
      inboxManager.resolveItem(matterDir, taskId, 'completed', 'LexAI + @statutory_auditor');
    } catch (_) {}

    // Record immutable fiduciary audit trail entry for ingested forensic dossier
    try {
      const auditTrail = require('../../../core/audit_trail');
      const artifacts = [];
      if (auditResult.reportFile) artifacts.push(auditResult.reportFile);
      if (auditResult.wikiHtmlFile) artifacts.push(auditResult.wikiHtmlFile);
      if (auditResult.noteFile) artifacts.push(auditResult.noteFile);
      if (auditResult.cureNoticeFile) artifacts.push(auditResult.cureNoticeFile);

      await auditTrail.appendEntry(matterDir, {
        actor: '@statutory_auditor',
        event: 'LEXAI_DOSSIER_INGESTED',
        matter: path.basename(matterDir),
        task_id: taskId,
        inputs: {
          tiddlers_count: (payload.tiddlers || []).length,
          report_id: payload.reportId || payload.report_id
        },
        verdict: auditResult.flagged_exceptions && auditResult.flagged_exceptions.length > 0
          ? 'STATUTORY_INELIGIBILITY_DETECTED'
          : 'STATUTORY_COMPLIANCE_SATISFIED',
        flagged_exceptions: auditResult.flagged_exceptions || [],
        artifacts_generated: artifacts,
        fiduciary_role: 'IN_CHAMBER_SENTINEL',
        metadata: {
          mode: options.simulated ? 'SIMULATED_LEXAI_DELIVERY' : 'LEXAI_TIDDLYWIKI_AUDIT',
          exceptions_count: (auditResult.flagged_exceptions || []).length
        }
      });
    } catch (auditErr) {
      console.warn(`[LexAICloudProvider] Audit trail logging error: ${auditErr.message}`);
    }

    return {
      success: true,
      completed: true,
      taskId,
      auditResult
    };
  }
}

module.exports = LexAICloudProvider;
