/**
 * pricing-plans.js
 * Dynamic pricing configuration and Razorpay 15-field telemetry notes builder.
 * Decoupled to allow instant addition of micro-pricing, credit packs, and case-metered tiers.
 */

const PRICING_PLANS = {
  core_starter_90d: {
    id: 'core_starter_90d',
    name: 'Core Starter (90-Day Local AI Pilot + Perpetual DMS)',
    amountPaise: 100, // ₹1.00
    displayPrice: '₹1',
    validityDays: 90, // 3 months / 90 days
    tier: 'starter',
    activationType: 'token_verification_1rs',
    stage1_perpetual_dms: true,
    stage2_trial_days: 90,
    stage3_pay_per_use: true,
    description: 'Stage 1 Lifetime DMS + Stage 2 Local AI Pilot (90 Days) + Stage 3 Pay-Per-Use Global Precedents',
    allowedBrains: ['bare_acts', 'skeletons', 'companion_indexer', 'legal_brain', 'monaco_rag']
  },
  free_core_6m: {
    // Backwards-compatible alias to core_starter_90d
    id: 'core_starter_90d',
    name: 'Core Starter (90-Day Local AI Pilot + Perpetual DMS)',
    amountPaise: 100, // ₹1.00
    displayPrice: '₹1',
    validityDays: 90,
    tier: 'starter',
    activationType: 'token_verification_1rs',
    stage1_perpetual_dms: true,
    stage2_trial_days: 90,
    stage3_pay_per_use: true,
    description: 'Stage 1 Lifetime DMS + Stage 2 Local AI Pilot (90 Days) + Stage 3 Pay-Per-Use Global Precedents',
    allowedBrains: ['bare_acts', 'skeletons', 'companion_indexer', 'legal_brain', 'monaco_rag']
  },
  pro_pilot: {
    id: 'pro_pilot',
    name: 'Professional Pilot (1-Year Stage 2 Subscription)',
    amountPaise: 499900, // ₹4,999.00
    displayPrice: '₹4,999',
    validityDays: 365,
    tier: 'standard',
    activationType: 'pro_pilot_annual',
    stage1_perpetual_dms: true,
    stage2_subscription: true,
    stage3_pay_per_use: true,
    description: 'Stage 2 Local Intelligence: LegalParam-2.9B Local Brain, Claims Auditor (@Auditor), Pleadings Formatter (@Formatter), Monaco Semantic RAG & Vault Updates',
    allowedBrains: ['legal_brain', 'claims_auditor', 'pleadings_formatter', 'monaco_rag']
  },
  enterprise_pilot: {
    id: 'enterprise_pilot',
    name: 'Enterprise Pilot (1-Year Stage 2 Subscription)',
    amountPaise: 1499900, // ₹14,999.00
    displayPrice: '₹14,999',
    validityDays: 365,
    tier: 'enterprise',
    activationType: 'enterprise_pilot_annual',
    stage1_perpetual_dms: true,
    stage2_subscription: true,
    stage3_pay_per_use: true,
    description: 'Stage 2 Full Intelligence: Legal & Finance Brains, Avoidance Forensic (@Forensic), Monaco Semantic RAG + Priority Vault Updates',
    allowedBrains: ['legal_brain', 'finance_brain', 'avoidance_forensic', 'monaco_rag', 'precedent_cloud']
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
