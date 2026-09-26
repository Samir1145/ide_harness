'use strict';

const EventEmitter = require('events');

class LocalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Emits a statutory lifecycle event with standardized metadata.
   *
   * @param {string} eventType - e.g. 'EVENT_BIDDER_DETECTED', 'EVENT_CLAIMS_INGESTED'
   * @param {Object} payload - Event payload
   */
  emitStatutoryEvent(eventType, payload = {}) {
    const enrichedEvent = {
      event_type: eventType,
      timestamp: new Date().toISOString(),
      matter_dir: payload.matter_dir || payload.caseDir || null,
      matter_name: payload.matter_name || payload.caseName || null,
      data: payload
    };

    console.log(`[LocalEventBus] 📡 Dispatched event: ${eventType} for matter: ${enrichedEvent.matter_name || 'Global'}`);
    this.emit(eventType, enrichedEvent);
    this.emit('*', enrichedEvent);
    return enrichedEvent;
  }
}

// Global singleton event bus
const localEventBus = new LocalEventBus();

module.exports = {
  localEventBus,
  EVENT_TYPES: {
    BIDDER_DETECTED: 'EVENT_BIDDER_DETECTED',
    CLAIMS_INGESTED: 'EVENT_CLAIMS_INGESTED',
    BANK_STATEMENTS_AUDITED: 'EVENT_BANK_STATEMENTS_AUDITED',
    RESOLUTION_PLAN_RECEIVED: 'EVENT_RESOLUTION_PLAN_RECEIVED',
    PETITION_DETECTED: 'EVENT_PETITION_DETECTED',
    AFFIDAVIT_PARSED: 'EVENT_AFFIDAVIT_PARSED',
    ADMISSION_ORDER_DETECTED: 'EVENT_ADMISSION_ORDER_DETECTED',
    ORDER_INGESTED: 'EVENT_ORDER_INGESTED'
  }
};
