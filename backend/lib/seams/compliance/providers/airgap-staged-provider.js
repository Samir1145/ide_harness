'use strict';

const fs = require('fs');
const path = require('path');
const { updateTaskStatus } = require('../../../gatekeeper/compliance_queue');

/**
 * AirGappedStagedProvider (Service Provider)
 * For 100% physically isolated chambers with zero network connectivity.
 * Stages signed statutory requisitions in `<matter_dir>/01_dossier/outbox/` for thumbdrive/manual export.
 */
class AirGappedStagedProvider {
  constructor() {
    this.name = 'AirGappedStagedProvider';
    this.tier = 'AIRGAP';
  }

  async dispatch(matterDir, task, options = {}) {
    const taskId = task.task_id;
    const outboxDir = path.join(matterDir, '01_dossier', 'staged_outbox');
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }

    const receiptId = `AIRGAP-STAGED-${Date.now().toString(36).toUpperCase()}`;
    const outboxFileName = `${taskId}.requisition.json`;
    const outboxPath = path.join(outboxDir, outboxFileName);

    const requisitionEnvelope = {
      protocol_version: '1.0',
      airgap_receipt_id: receiptId,
      staged_at: new Date().toISOString(),
      matter: path.basename(matterDir),
      task_id: taskId,
      report_id: task.report_id,
      report_code: task.report_code,
      title: task.title,
      subject: task.subject,
      statutory_citation: task.statutory_citation,
      statutory_trigger: task.statutory_trigger,
      required_inputs: task.required_inputs || {},
      fiduciary_instruction: 'Export this JSON envelope to forensic analysis desk via authorized encrypted media.'
    };

    fs.writeFileSync(outboxPath, JSON.stringify(requisitionEnvelope, null, 2), 'utf8');

    const dispatchResult = {
      receipt_id: receiptId,
      staged_file: `01_dossier/staged_outbox/${outboxFileName}`,
      staged_path: outboxPath,
      staged_at: new Date().toISOString(),
      mode: 'AIRGAP_OUTBOX'
    };

    updateTaskStatus(matterDir, taskId, 'DISPATCHED', {
      dispatch_mode: 'AIRGAP_OUTBOX',
      dispatch_result: dispatchResult
    });

    // Record immutable fiduciary audit trail entry for staged outbox envelope
    try {
      const auditTrail = require('../../../core/audit_trail');
      await auditTrail.appendEntry(matterDir, {
        actor: 'AIRGAP_SENTINEL',
        event: 'AIRGAP_REQUISITION_STAGED',
        matter: path.basename(matterDir),
        task_id: taskId,
        inputs: task.required_inputs || {},
        verdict: 'REQUISITION_ENVELOPE_SEALED',
        artifacts_generated: [
          `01_dossier/staged_outbox/${outboxFileName}`
        ],
        fiduciary_role: 'IN_CHAMBER_SENTINEL',
        metadata: {
          receipt_id: receiptId,
          report_code: task.report_code
        }
      });
    } catch (auditErr) {
      console.warn(`[AirGappedStagedProvider] Audit trail logging error: ${auditErr.message}`);
    }

    return {
      success: true,
      mode: 'AIRGAP_OUTBOX',
      task_id: taskId,
      receipt_id: receiptId,
      stagedPath: outboxPath,
      message: `Requisition staged for air-gapped export at 01_dossier/staged_outbox/${outboxFileName}`
    };
  }

  async ingest(matterDir, payload, options = {}) {
    // Air-gapped delivery uses the standard local StatutoryAuditor pipeline
    const LexAICloudProvider = require('./lexai-cloud-provider');
    const delegate = new LexAICloudProvider();
    return await delegate.ingest(matterDir, payload, options);
  }
}

module.exports = AirGappedStagedProvider;
