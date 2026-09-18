/**
 * pricing-plans.js
 * Dynamic pricing configuration and Razorpay 15-field telemetry notes builder.
 * Decoupled to allow instant addition of micro-pricing, credit packs, and case-metered tiers.
 */

const PRICING_PLANS = {
  free_core_6m: {
    id: 'free_core_6m',
    name: 'Free Core Lite (6-Month Verification)',
    amountPaise: 100, // ₹1.00
    displayPrice: '₹1',
    validityDays: 180, // 6 months
    tier: 'lite',
    activationType: 'token_verification_1rs',
    description: 'Statutory Bare Acts, Legal Skeletons, Local Document Ingest & Deterministic Drafting',
    allowedBrains: ['bare_acts', 'skeletons', 'companion_indexer']
  },
  pro_pilot: {
    id: 'pro_pilot',
    name: 'Professional Pilot (1-Year License)',
    amountPaise: 499900, // ₹4,999.00
    displayPrice: '₹4,999',
    validityDays: 365,
    tier: 'standard',
    activationType: 'pro_pilot_annual',
    description: 'LegalParam-2.9B Local Brain, Claims Auditor (@Auditor), Pleadings Formatter (@Formatter)',
    allowedBrains: ['legal_brain', 'claims_auditor', 'pleadings_formatter']
  },
  enterprise_pilot: {
    id: 'enterprise_pilot',
    name: 'Enterprise Pilot (1-Year License)',
    amountPaise: 1499900, // ₹14,999.00
    displayPrice: '₹14,999',
    validityDays: 365,
    tier: 'enterprise',
    activationType: 'enterprise_pilot_annual',
    description: 'Legal & Finance Brains, Avoidance Forensic (@Forensic), Live ResolutionBazaar Precedents (@Precedent)',
    allowedBrains: ['legal_brain', 'finance_brain', 'avoidance_forensic', 'precedent_cloud']
  }
};

/**
 * Builds the 15-field telemetry dictionary for Razorpay Order creation.
 * Strict limits: max 15 keys, key length <= 40, value length <= 500.
 */
function buildOrderNotes(planId, userData = {}, sysTelemetry = {}, caseCount = 0) {
  const plan = PRICING_PLANS[planId] || PRICING_PLANS.free_core_6m;
  const now = new Date();
  const expiryDate = new Date(now.getTime() + (plan.validityDays * 24 * 60 * 60 * 1000));

  const notes = {
    // 1. Hardware Fingerprint (Anti-Piracy)
    device_id: String(sysTelemetry.deviceId || 'UNKNOWN').substring(0, 40),

    // 2. Professional Role Persona
    practitioner_role: String(userData.role || 'Advocate').substring(0, 40),

    // 3. Primary NCLT Bench
    primary_nclt_bench: String(userData.bench || 'Mumbai Bench').substring(0, 40),

    // 4. Firm or Chamber Name
    firm_or_chamber: String(userData.firm || 'Independent Chamber').substring(0, 60),

    // 5. City and State
    city_state: String(userData.city || 'Mumbai, MH').substring(0, 40),

    // 6. Activation Cycle (New Install vs 6-Month Renewal)
    activation_type: String(userData.isRenewal ? '6m_renewal_1rs' : plan.activationType).substring(0, 40),

    // 7. Plan Tier ID
    plan_id: String(plan.id).substring(0, 40),

    // 8. License Expiration ISO Timestamp
    license_expires_at: expiryDate.toISOString().substring(0, 40),

    // 9. OS & Architecture Platform
    os_platform: String(sysTelemetry.osPlatform || 'macOS/Win').substring(0, 45),

    // 10. System RAM in GB
    system_ram_gb: String(sysTelemetry.systemRamGB || '16').substring(0, 10),

    // 11. CPU Cores Count
    cpu_cores: String(sysTelemetry.cpuCores || '8').substring(0, 10),

    // 12. App Version
    app_version: String(sysTelemetry.appVersion || 'v2.4.0').substring(0, 20),

    // 13. Active CIRP Case Count
    cases_active_count: String(caseCount || 1).substring(0, 10),

    // 14. Preferred LLM Mode
    preferred_llm_mode: String(userData.llmMode || 'lite_core').substring(0, 30),

    // 15. Marketing & Acquisition Source
    install_source: String(userData.source || 'direct_zip').substring(0, 40)
  };

  return notes;
}

module.exports = {
  PRICING_PLANS,
  buildOrderNotes
};
