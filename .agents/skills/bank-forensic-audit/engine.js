/**
 * Skill Module: engine.js
 * Part of bank-forensic-audit Skill Package
 */

const { canonicalizeName } = require('../xbrl-intelligence');
const NarrationPreprocessor = require('./preprocessor');
const RuleStore = require('./rules');

function cleanNarration(narration) {
    return NarrationPreprocessor.clean(narration);
}

function isCashTransaction(narration) {
    if (!narration) return false;
    const n = String(narration).toUpperCase();
    return /\b(CASH|SELF|ATM|ATM-WDL|CWDR|BEARER|SELF CHQ|CASH WDL)\b/.test(n);
}

function isSubThresholdSmurfing(amount) {
    if (amount >= 950000 && amount < 1000000) return 'SUB_10L_PMLA';
    if (amount >= 4800000 && amount < 5000000) return 'SUB_50L_BANK_RISK';
    return null;
}

function runForensicAnalysis(transactionsOrBankData, xbrlProfile = {}, options = {}) {
    let transactions = [];
    let accounts = [];

    if (Array.isArray(transactionsOrBankData)) {
        transactions = transactionsOrBankData;
    } else if (transactionsOrBankData && Array.isArray(transactionsOrBankData.transactions)) {
        transactions = transactionsOrBankData.transactions;
        accounts = transactionsOrBankData.accounts || [];
    }

    if (options.accounts && accounts.length === 0) {
        accounts = options.accounts;
    }

    const minAmount = options.minAmount || 1000;
    const icdDate = options.icdDate || null;
    const caseDir = options.caseDir || null;
    if (caseDir) {
        RuleStore.loadCaseOverrides(caseDir);
    }

    const relatedParties = (xbrlProfile && xbrlProfile.relatedParties) || [];
    const disclosedLenders = (xbrlProfile && xbrlProfile.disclosedLenders) || [];

    let grossDebits = 0;
    let grossCredits = 0;
    let contraVolume = 0;

    // Mathematical integrity: Sum all transactions across ledgers
    for (const t of transactions) {
        if (t.type === 'DEBIT') {
            grossDebits += t.amount;
        } else {
            grossCredits += t.amount;
        }
    }

    const activeTxns = transactions;

    // Contra-Sweep Identification
    for (let i = 0; i < activeTxns.length; i++) {
        const t1 = activeTxns[i];
        if (t1.is_contra) continue;

        const isInternalNarration = /OWN A\/C|INTERNAL TRF|CONTRA|INTER-BANK|SWEEP/i.test(t1.narration);

        for (let j = 0; j < activeTxns.length; j++) {
            if (i === j) continue;
            const t2 = activeTxns[j];
            if (t2.is_contra) continue;

            if (t1.type !== t2.type && (t1.account_no !== t2.account_no || t1.bank !== t2.bank)) {
                const amountDiff = Math.abs(t1.amount - t2.amount);
                const hasMatchingRef = t1.chq_ref_no && t2.chq_ref_no && t1.chq_ref_no.toLowerCase() === t2.chq_ref_no.toLowerCase();
                const d1 = new Date(t1.date);
                const d2 = new Date(t2.date);
                const dateDiffDays = (!isNaN(d1) && !isNaN(d2)) ? Math.abs(d1 - d2) / (1000 * 60 * 60 * 24) : 999;

                if (amountDiff <= 1.0) {
                    if (hasMatchingRef || (isInternalNarration && dateDiffDays <= 3) || dateDiffDays <= 1) {
                        t1.is_contra = true;
                        t2.is_contra = true;
                        t1.contra_pair_id = t2.id;
                        t2.contra_pair_id = t1.id;
                        contraVolume += t1.amount;
                        break;
                    }
                }
            }
        }
    }

    const netExternalDebits = Math.max(0, grossDebits - contraVolume);
    const netExternalCredits = Math.max(0, grossCredits - contraVolume);

    // Mathematical Balance Proof (Opening + Credits - Debits = Closing)
    let aggregateOpening = 0;
    let aggregateClosing = 0;
    const accountBalances = {};

    if (Array.isArray(accounts)) {
        for (const a of accounts) {
            const accKey = `${a.bank}_${a.accountNo}`;
            accountBalances[accKey] = {
                openingBalance: a.openingBalance !== null && a.openingBalance !== undefined ? a.openingBalance : null,
                lastBalance: a.closingBalance !== null && a.closingBalance !== undefined ? a.closingBalance : null,
                totalDr: 0,
                totalCr: 0
            };
        }
    }


    for (const t of transactions) {
        const accKey = `${t.bank}_${t.account_no}`;
        if (!accountBalances[accKey]) {
            accountBalances[accKey] = {
                openingBalance: null,
                lastBalance: null,
                totalDr: 0,
                totalCr: 0
            };
        }
        if (t.balance !== null && t.balance !== undefined) {
            accountBalances[accKey].lastBalance = t.balance;
            if (accountBalances[accKey].openingBalance === null) {
                accountBalances[accKey].openingBalance = t.type === 'DEBIT'
                    ? (t.balance + t.amount)
                    : (t.balance - t.amount);
            }
        }
        if (t.type === 'DEBIT') accountBalances[accKey].totalDr += t.amount;
        else accountBalances[accKey].totalCr += t.amount;
    }

    for (const acc of Object.values(accountBalances)) {
        if (acc.openingBalance !== null) aggregateOpening += acc.openingBalance;
        if (acc.lastBalance === null && acc.openingBalance !== null) {
            acc.lastBalance = acc.openingBalance + acc.totalCr - acc.totalDr;
        }
        if (acc.lastBalance !== null) aggregateClosing += acc.lastBalance;
    }


    const calculatedClosing = aggregateOpening + grossCredits - grossDebits;
    const balanceVariance = Math.abs(calculatedClosing - aggregateClosing);
    const isBalanced = aggregateClosing > 0 ? balanceVariance < 100.0 : true;

    const balanceProof = {
        openingBalance: aggregateOpening,
        closingBalance: aggregateClosing,
        calculatedClosing,
        variance: balanceVariance,
        isBalanced,
        accountReconciliation: accountBalances
    };

    // Counterparty Clustering & Categorical Distribution
    const partyMap = {};
    const categoryTotals = {
        STATUTORY_DUES: { label: 'Statutory & Tax Remittances', total: 0, count: 0, statutorySection: '§53(1)(e)' },
        UTILITIES_DISCOMS: { label: 'Industrial Utilities & Power/Gas', total: 0, count: 0, statutorySection: 'Essential Operational Costs' },
        LENDERS_AND_ARCS: { label: 'Financial Creditors & ARCs', total: 0, count: 0, statutorySection: '§53(1)(b)/(d)' },
        INVESTMENT_SPECULATION: { label: 'Speculative Outflows & Capital Markets', total: 0, count: 0, statutorySection: '§66 (Diversion of Loan Funds)' },
        PERSONAL_PROMOTER_PERKS: { label: 'Promoter Perks & Luxury Expenses', total: 0, count: 0, statutorySection: '§45 (Undervalued) / §66' },
        CASH_DRAIN: { label: 'Physical Cash & Bearer Withdrawals', total: 0, count: 0, statutorySection: '§66 / PMLA Inquest' },
        LIQUIDITY_DISTRESS_AND_DISHONOR: { label: 'Dishonored Instruments & Penalties', total: 0, count: 0, statutorySection: '§43(4) (Twilight Insolvency Anchor) & NI Act §138' },
        RELATED_PARTY: { label: 'AS-18 Related Entities & KMPs', total: 0, count: 0, statutorySection: '§43 (Preference) / §45 (Undervalued)' },
        TRADE_OPERATIONAL: { label: 'Trade Operational Suppliers & Vendors', total: 0, count: 0, statutorySection: 'General Operational Dues' }
    };

    // Distress & Dishonored Instrument Inquest (Inspired by Akshat & IBC §43/45 twilight analysis)
    const dishonoredEvents = [];
    let totalDishonoredCount = 0;
    let totalDishonoredFees = 0;
    let earliestDishonorDate = null;
    const DISHONOR_REGEX = /\b(CHQ\s*RTN|CHEQUE\s*RETURN|CHQ\s*RET|INSUFFICIENT\s*FUNDS|FUNDS\s*INSUFFICIENT|BOUNCE\s*(?:CHG|FEE|CHARGE)|ECS\s*(?:RET|BOUNCE|RETURN)|NACH\s*(?:RTN|RETURN)|RETURN\s*CHARGES|RETURN\s*DR|ECS\s*DEBIT\s*RET|OVERDRAFT\s*PENAL|PENAL\s*INTEREST|LIMIT\s*EXCEEDED|UNPAID\s*CHQ|ITEM\s*PAID\s*NO\s*FUNDS|UNSUCCESSFUL)\b/i;

    for (const t of activeTxns) {
        if (t.is_contra) continue;

        if (DISHONOR_REGEX.test(t.narration)) {
            dishonoredEvents.push({
                date: t.date,
                rawDate: t.raw_date,
                bank: t.bank,
                accountNo: t.account_no,
                amount: t.amount,
                narration: t.narration,
                chqRef: t.chq_ref_no
            });
            totalDishonoredCount++;
            totalDishonoredFees += t.amount;
            if (!earliestDishonorDate || (t.date && t.date < earliestDishonorDate)) {
                earliestDishonorDate = t.date;
            }
        }

        const rawClean = cleanNarration(t.narration);
        const canon = canonicalizeName(rawClean) || 'UNKNOWN';

        let matchedRp = null;
        for (const rp of relatedParties) {
            if (canon.includes(rp.canonicalName) || rp.canonicalName.includes(canon)) {
                matchedRp = rp;
                break;
            }
        }

        const catInfo = RuleStore.classify(t.narration, !!matchedRp);
        t.category = catInfo.key;
        t.category_label = catInfo.label;

        if (t.type === 'DEBIT') {
            if (!categoryTotals[catInfo.key]) {
                categoryTotals[catInfo.key] = { label: catInfo.label, total: 0, count: 0, statutorySection: catInfo.statutorySection };
            }
            categoryTotals[catInfo.key].total += t.amount;
            categoryTotals[catInfo.key].count++;
        }

        if (!partyMap[canon]) {
            partyMap[canon] = {
                canonicalName: canon,
                sampleNarration: rawClean,
                category: catInfo.key,
                categoryLabel: catInfo.label,
                isRelatedParty: !!matchedRp,
                relatedPartyDetails: matchedRp,
                totalDebits: 0,
                totalCredits: 0,
                txnCount: 0,
                debitCount: 0,
                creditCount: 0,
                dates: []
            };
        }

        const entry = partyMap[canon];
        entry.txnCount++;
        entry.dates.push(t.date);
        if (t.type === 'DEBIT') {
            entry.totalDebits += t.amount;
            entry.debitCount++;
        } else {
            entry.totalCredits += t.amount;
            entry.creditCount++;
        }
    }

    const counterpartyList = Object.values(partyMap);
    const topDebits = [...counterpartyList].sort((a, b) => b.totalDebits - a.totalDebits).slice(0, 20);
    const topCredits = [...counterpartyList].sort((a, b) => b.totalCredits - a.totalCredits).slice(0, 20);

    const redFlags = [];

    // A. Round-Tripping
    for (const p of counterpartyList) {
        if (p.totalDebits > 500000 && p.totalCredits > 500000) {
            const minSide = Math.min(p.totalDebits, p.totalCredits);
            const maxSide = Math.max(p.totalDebits, p.totalCredits);
            const ratio = minSide / maxSide;
            if (ratio >= 0.70) {
                redFlags.push({
                    type: 'CIRCULAR_ROUND_TRIPPING',
                    severity: 'HIGH',
                    statutorySection: '§66 (Fraudulent Trading) / §43 (Preferential)',
                    title: `Circular Flow with [${p.sampleNarration}]`,
                    description: `Entity received ₹${(p.totalDebits / 100000).toFixed(2)}L and returned ₹${(p.totalCredits / 100000).toFixed(2)}L (${p.txnCount} transactions). High velocity bidirectional flow indicates artificial turnover or layering.`,
                    entity: p.sampleNarration,
                    totalVolume: p.totalDebits + p.totalCredits
                });
            }
        }
    }

    // B. Related Party High-Volume Transfers
    for (const p of counterpartyList) {
        if (p.isRelatedParty && p.totalDebits > 500000) {
            redFlags.push({
                type: 'RELATED_PARTY_SIPHONING',
                severity: 'CRITICAL',
                statutorySection: '§43 (Preference) / §45 (Undervalued) / §66 (Fraud)',
                title: `High Outflow to Related Entity: [${p.relatedPartyDetails.name}]`,
                description: `Company transferred ₹${(p.totalDebits / 100000).toFixed(2)}L to verified AS-18 related entity (${p.relatedPartyDetails.relationship}) across ${p.debitCount} debit transactions without verified operational consideration.`,
                entity: p.relatedPartyDetails.name,
                totalVolume: p.totalDebits
            });
        }
    }

    // C. Speculative / Capital Market Outflows
    if (categoryTotals.INVESTMENT_SPECULATION && categoryTotals.INVESTMENT_SPECULATION.total > 100000) {
        const invTotal = categoryTotals.INVESTMENT_SPECULATION.total;
        redFlags.push({
            type: 'SPECULATIVE_DIVERSION',
            severity: 'CRITICAL',
            statutorySection: '§66 (Fraudulent Trading / Diversion of Loan Funds)',
            title: 'Unsanctioned Capital Market & Speculative Outflows',
            description: `Identified ₹${(invTotal / 100000).toFixed(2)} Lakhs routed to brokers, mutual funds, crypto, or bullion jewellers from company accounts, constituting prima facie diversion of corporate debtor liquidity.`,
            entity: 'Capital Market / Speculative Brokers',
            totalVolume: invTotal
        });
    }

    // D. Personal & Promoter Perks
    if (categoryTotals.PERSONAL_PROMOTER_PERKS && categoryTotals.PERSONAL_PROMOTER_PERKS.total > 200000) {
        const perkTotal = categoryTotals.PERSONAL_PROMOTER_PERKS.total;
        redFlags.push({
            type: 'PROMOTER_PERSONAL_PERKS',
            severity: 'HIGH',
            statutorySection: '§45 (Undervalued Transactions) / §66',
            title: 'Promoter Luxury & Personal Expense Discharges',
            description: `Company funds totaling ₹${(perkTotal / 100000).toFixed(2)} Lakhs discharged towards luxury hotels, airlines, golf clubs, or promoter life insurance policies not justified by business operations.`,
            entity: 'Hospitality / Luxury Merchants',
            totalVolume: perkTotal
        });
    }

    // E. High-Velocity Cash Drain
    let totalCashWithdrawn = 0;
    let cashTxnCount = 0;

    for (const t of activeTxns) {
        if (t.type === 'DEBIT' && isCashTransaction(t.narration)) {
            totalCashWithdrawn += t.amount;
            cashTxnCount++;
        }
    }

    if (totalCashWithdrawn > 500000) {
        redFlags.push({
            type: 'HIGH_VELOCITY_CASH_DRAIN',
            severity: totalCashWithdrawn > 5000000 ? 'CRITICAL' : 'HIGH',
            statutorySection: '§66 (Fraudulent Trading) / PMLA Inquest',
            title: `Extensive Cash Withdrawals (Self/ATM/Bearer)`,
            description: `Total cash withdrawals of ₹${(totalCashWithdrawn / 100000).toFixed(2)} Lakhs across ${cashTxnCount} transactions. Physical cash drainage prior to default is a primary indicator of asset diversion.`,
            entity: 'Self / Bearer Instruments',
            totalVolume: totalCashWithdrawn
        });
    }

    // F. Sub-Threshold Structuring
    const smurfingTxns = [];
    for (const t of activeTxns) {
        const flag = isSubThresholdSmurfing(t.amount);
        if (flag) {
            smurfingTxns.push(t);
        }
    }

    if (smurfingTxns.length >= 3) {
        const smurfingSum = smurfingTxns.reduce((acc, x) => acc + x.amount, 0);
        redFlags.push({
            type: 'SUB_THRESHOLD_STRUCTURING',
            severity: 'MEDIUM',
            statutorySection: 'PMLA / RBI Suspicious Transaction Report (STR)',
            title: `Sub-Threshold Smurfing Pattern (${smurfingTxns.length} transactions)`,
            description: `Identified ${smurfingTxns.length} transfers totaling ₹${(smurfingSum / 100000).toFixed(2)} Lakhs structured immediately below mandatory ₹10 Lakh or ₹50 Lakh banking surveillance thresholds.`,
            entity: 'Multiple Transferees',
            totalVolume: smurfingSum
        });
    }

    // G. Commercial Insolvency & Dishonored Instruments (Akshat / IBC §43/45 Twilight Anchor)
    if (dishonoredEvents.length > 0) {
        redFlags.push({
            type: 'COMMERCIAL_INSOLVENCY_DISHONOR',
            severity: dishonoredEvents.length >= 3 ? 'CRITICAL' : 'HIGH',
            statutorySection: '§43(4) (Twilight Insolvency Default Anchor) & NI Act §138',
            title: `Banking Liquidity Distress: ${dishonoredEvents.length} Dishonored Instrument(s) / Return Penalties`,
            description: `Earliest recorded cheque bounce or NACH/ECS return occurred on ${earliestDishonorDate || 'Unspecified'}. Cumulative return penalties and bounced instruments total ₹${(totalDishonoredFees / 100000).toFixed(2)} Lakhs across ${dishonoredEvents.length} instances. This prima facie establishes commercial insolvency and default prior to formal CIRP admission, legally anchoring the lookback period for Section 43 Preferential avoidance petitions.`,
            entity: 'Banking Clearing Systems',
            totalVolume: totalDishonoredFees,
            earliestDishonorDate
        });
    }

    // H. PDF Document Forensics & Tampering Anomalies (Sebastien Rousseau / IBC §66 Inquest)
    const pdfForensics = options.pdfForensics || [];
    if (Array.isArray(pdfForensics)) {
        for (const pf of pdfForensics) {
            if (pf.isTampered || pf.verdict === 'HIGH_RISK_TAMPERED' || pf.verdict === 'SUSPICIOUS') {
                const reasons = (pf.findings || []).map(f => f.description).join('; ');
                redFlags.push({
                    type: 'PDF_TAMPERING_SUSPECTED',
                    severity: pf.isTampered ? 'CRITICAL' : 'HIGH',
                    statutorySection: '§66 (Fraudulent Statements / Concealment) & IPC §463/§465 (Document Forgery)',
                    title: `PDF Statement Manipulation Risk: ${pf.filename} (${pf.verdict})`,
                    description: `Automated byte-level forensics on '${pf.filename}' identified document alteration risk (Risk Score: ${pf.riskScore}). Indicators: ${reasons}`,
                    entity: pf.producer || pf.creator || 'Document Metadata',
                    totalVolume: 0,
                    forensicDetails: pf
                });
            }
        }
    }

    const distressMetrics = {
        totalDishonoredCount,
        totalDishonoredFees,
        earliestDishonorDate,
        dishonoredEvents
    };

    return {
        metrics: {
            totalTransactions: transactions.length,
            grossDebits,
            grossCredits,
            contraVolume,
            netExternalDebits,
            netExternalCredits,
            totalCashWithdrawn,
            cashTxnCount,
            uniqueCounterparties: counterpartyList.length,
            distressMetrics
        },
        balanceProof,
        categoryTotals,
        topDebits,
        topCredits,
        redFlags,
        distressMetrics,
        pdfForensics,
        contraCount: activeTxns.filter(t => t.is_contra).length
    };
}

module.exports = {
    runForensicAnalysis,
    cleanNarration,
    isCashTransaction,
    isSubThresholdSmurfing
};
