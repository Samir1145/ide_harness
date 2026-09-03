/**
 * bifurcation-guard.js
 * ─────────────────────────────────────────────────────────────────
 * Anti-Bifurcation Defense Guardrail & Tactical Advisory Skill.
 * 
 * Protects creditors against the "IP Form F Downgrade Trap" in:
 *   - Sale-and-leaseback models
 *   - Assured return & guaranteed rental agreements
 *   - Fractional asset ownership (cloud servers, real estate, hardware)
 *   - Tripartite / multi-entity promoter structures
 * 
 * Functions:
 *   - detectBifurcationTrap(userMessage, caseContext)
 *   - getBifurcationWarning(details)
 *   - getAggressiveLegalRider(claimantData)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

/**
 * Heuristically inspects a query or claim context to detect if an IP/RP
 * or counterparty is attempting to split a composite financial debt into Form F.
 * 
 * @param {string} text - User message or contract excerpt
 * @param {Object} [claimData] - Optional claim details (principal, lease arrears, etc.)
 * @returns {Object|null}
 */
function detectBifurcationTrap(text = '', claimData = {}) {
  const lower = String(text).toLowerCase();

  // Keyword indicators of Form F split suggestion
  const mentionsFormF = /\b(form[-_ ]?f|other creditor|residual claim)\b/i.test(lower);
  const mentionsFormCA = /\b(form[-_ ]?ca|form[-_ ]?c|class of creditor|financial creditor)\b/i.test(lower);
  const mentionsSplit = /\b(split|bifurcat|separat|suggest|asking me to file|file \d+ in form)\b/i.test(lower);
  const mentionsAssetStructure = /\b(sale[- ]?and[- ]?leaseback|assured return|rental|particle|cloud|vuenow|zebyte|hardware|fractional)\b/i.test(lower);

  // Pattern A: Explicit query about filing in Form F vs Form CA or splitting amounts
  if (mentionsFormF && (mentionsFormCA || mentionsSplit || mentionsAssetStructure)) {
    return {
      triggered: true,
      pattern: 'EXPLICIT_SPLIT_QUERY',
      hasFormF: true,
      hasFormCA: mentionsFormCA,
      hasAssetStructure: mentionsAssetStructure
    };
  }

  // Pattern B: Claim data contains both principal and lease arrears, and user asks about Form F
  if (mentionsFormF && (claimData.principalAmount || claimData.leaseArrears || (claimData.claimType && claimData.claimType.includes('leaseback')))) {
    return {
      triggered: true,
      pattern: 'CLAIM_DATA_DOWNGRADE',
      hasFormF: true,
      hasFormCA: false,
      hasAssetStructure: true
    };
  }

  return null;
}

/**
 * Returns a high-visibility, legally precise tactical warning banner.
 */
function getBifurcationWarning() {
  return `> 🚨 **CRITICAL TACTICAL ALERT: IP Form F Downgrade Trap Detected**
> 
> **Do NOT surrender your claim into Form F!**
> 
> * **The IP's Trap:** The Resolution Professional is attempting to bifurcate your claim into:
>   1. *Accrued Lease/Rentals $\rightarrow$ Form CA (Financial Debt in Class)*
>   2. *Core Capital Investment $\rightarrow$ Form F (Other Creditors)*
> * **The Devastating Consequences:**
>   - **Loss of Voting Share:** Form F creditors have **ZERO seats and ZERO votes** in the Committee of Creditors (CoC). This instantly cuts your collective voting power in half.
>   - **Near-Zero Financial Recovery:** Under IBC Regulation 38 & Section 53, Form F ("Other Creditors") are at the bottom of the liquidation waterfall and routinely receive **₹0 or pennies on the dollar**.
> * **The Established Law (Supreme Court):**
>   - Under *Pioneer Urban Land & Infrastructure Ltd. v. UOI (2019)* and *Nikhil Mehta & Sons v. AMR Infrastructure Ltd. (2017)*, an assured-return sale-and-leaseback scheme is an **indivisible, composite financial borrowing** under Section 5(8)(f).
>   - Under the *Single Economic Unit* doctrine, the corporate veil between the equipment seller and the corporate debtor lessee is pierced.
> * **Recommended Action:**
>   - **File ONLY Form CA for the ENTIRE composite amount** (Core Capital + Accrued Rentals).
>   - Attach the **Preemptive Aggressive Legal Rider** directly into Item 6 and Annexure-E to legally compel full admission.`;
}

/**
 * Generates the Aggressive Legal Rider to be inserted directly into Form CA (Item 6, Item 8, and Annexures).
 * 
 * @param {Object} data
 * @returns {string}
 */
function getAggressiveLegalRider(data = {}) {
  const cdName = data.corporateDebtorName || 'the Corporate Debtor';
  const totalClaim = data.totalClaimFormatted || 'the total claim amount';
  const principal = data.principalFormatted || 'the principal consideration';
  const arrears = data.arrearsFormatted || 'the contractual lease arrears';

  return `### SPECIAL PLEADINGS & STATUTORY LEGAL RIDER: COMPOSITE FINANCIAL DEBT UNDER SECTION 5(8)(f)

1. **Indivisible Sale-and-Leaseback Financial Transaction:**
   The Claimant's disbursement of ${principal} was inextricably linked with the concurrent execution of the Asset Monetising Program Agreement (AMPA) with ${cdName}. The transaction was structured from inception as an **Assured Return / Sale-and-Leaseback financing facility** having the commercial effect of a borrowing under **Section 5(8)(f)** of the Insolvency and Bankruptcy Code, 2016. The purchase of the underlying equipment and the simultaneous leaseback to ${cdName} are two limbs of an integrated, indivisible transaction; one could not exist without the other (*Pioneer Urban Land & Infrastructure Ltd. v. Union of India [2019] SCC OnLine SC 1005*).

2. **Single Economic Enterprise & Piercing of Corporate Veil:**
   The equipment vendor and ${cdName} operate as a **Single Economic Unit** under common control, shared promoter shareholding, and integrated cashflows. Under established NCLAT jurisprudence (*Videocon Industries CIRP*, *Amrapali Group*), the corporate veil cannot be employed as an instrument to isolate the principal capital obligation while treating the lease component as debt. The liability for the full composite sum of ${totalClaim} (${principal} principal + ${arrears} accrued arrears) is the direct joint and several financial liability of ${cdName}.

3. **Judicial Estoppel by Public Announcement (Form A):**
   The Interim Resolution Professional, in the statutory Public Announcement (Form A) published under Regulation 6, has specifically and unequivocally identified the class of creditors as:
   > *"Financial Creditor in Class (Cloud Particle Owner under Sale and Lease Back Model)"* under Section 21(6A)(b).
   The Corporate Debtor and the Resolution Professional are judicially estopped from disowning the capital basis of the "Particle Owners" whose very ownership status and lease calculations form the subject matter of the admitted class.

4. **Exclusive Submission under Form CA (Regulation 8A):**
   The entire composite claim of ${totalClaim} is hereby submitted exclusively under **Form CA** as a Financial Debt in Class. Any suggestion to relegate the capital component to Form F is contrary to Section 5(8)(f), prejudicial to the Claimant's statutory voting rights in the Committee of Creditors under Section 21(6A)(b), and rejected as legally untenable.`;
}

module.exports = {
  detectBifurcationTrap,
  getBifurcationWarning,
  getAggressiveLegalRider
};
