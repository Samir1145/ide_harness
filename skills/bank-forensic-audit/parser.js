/**
 * Skill Module: parser.js
 * Part of bank-forensic-audit Skill Package
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const xlsx = require('xlsx');
const NarrationPreprocessor = require('./preprocessor');

const COLUMN_SYNONYMS = {
    date: [
        'date', 'txn date', 'transaction date', 'txn_date', 'trans date', 
        'value date', 'post date', 'booking date'
    ],
    narration: [
        'narration', 'description', 'particulars', 'transaction remarks', 
        'remarks', 'details', 'transaction details', 'tran details'
    ],
    chq_ref: [
        'chq/ref no', 'chq / ref no', 'chq no', 'cheque no', 'ref no', 'reference no', 
        'utr', 'utr no', 'txn id', 'transaction id', 'instrument no'
    ],
    debit: [
        'debit', 'withdrawal', 'dr', 'debit amount', 'withdrawal amount', 
        'debit (inr)', 'withdrawal (inr)', 'dr amount'
    ],
    credit: [
        'credit', 'deposit', 'cr', 'credit amount', 'deposit amount', 
        'credit (inr)', 'deposit (inr)', 'cr amount'
    ],
    balance: [
        'balance', 'closing balance', 'running balance', 'net balance', 
        'balance (inr)', 'balance amount'
    ]
};

function normalizeDate(rawVal, context = {}) {
    if (!rawVal) return null;
    if (rawVal instanceof Date) {
        const y = rawVal.getFullYear();
        const m = String(rawVal.getMonth() + 1).padStart(2, '0');
        const d = String(rawVal.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(rawVal).trim();
    if (!str) return null;

    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(str)) {
        const parts = str.split(/[-/.]/);
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }

    const monthMap = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };

    // 1. Full DD/MM/YYYY or DD-MMM-YYYY or DD.MM.YYYY
    const dmy = str.match(/^(\d{1,2})[-/.\s]([a-zA-Z]+|\d{1,2})[-/.\s](\d{2,4})/);
    if (dmy) {
        let day = parseInt(dmy[1], 10);
        let month = dmy[2];
        let year = parseInt(dmy[3], 10);
        if (year < 100) year += 2000;

        if (isNaN(month)) {
            const mKey = month.toLowerCase().substring(0, 3);
            month = monthMap[mKey] || 1;
        } else {
            month = parseInt(month, 10);
        }
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // 2. Month-only formats e.g. "28 Dec", "28-Dec", "Dec 28", "28/12" (Teller Dec -> Jan Year Rollover Support)
    const dmNoYear = str.match(/^(\d{1,2})[-/.\s]([a-zA-Z]+|\d{1,2})$/) ||
                     str.match(/^([a-zA-Z]+)[-/.\s](\d{1,2})$/);
    if (dmNoYear) {
        let day, month;
        if (/^[a-zA-Z]+$/.test(dmNoYear[1])) {
            month = dmNoYear[1];
            day = parseInt(dmNoYear[2], 10);
        } else {
            day = parseInt(dmNoYear[1], 10);
            month = dmNoYear[2];
        }

        if (isNaN(month)) {
            const mKey = month.toLowerCase().substring(0, 3);
            month = monthMap[mKey] || 1;
        } else {
            month = parseInt(month, 10);
        }

        let year = context.currentYear || context.baseYear || new Date().getFullYear();

        // Rollover: If we previously saw Dec (12) and now see Jan (1), advance year!
        if (context.lastSeenMonth === 12 && month === 1) {
            context.yearOffset = (context.yearOffset || 0) + 1;
            context.currentYear = (context.baseYear || year) + context.yearOffset;
            year = context.currentYear;
        } else if (context.yearOffset) {
            year = (context.baseYear || year) + context.yearOffset;
        }

        context.lastSeenMonth = month;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return str;
}

function cleanAmount(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return 0;
    if (typeof rawVal === 'number') return Math.abs(rawVal);
    let str = String(rawVal).trim();
    
    // Handle SWIFT / European decimal comma e.g. "500000,00"
    if (/,\d{2}$/.test(str) && !str.includes('.')) {
        str = str.replace(',', '.');
    } else if (str.includes(',') && str.includes('.')) {
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            str = str.replace(/,/g, '');
        }
    } else {
        str = str.replace(/,/g, '');
    }

    const cleaned = str.replace(/[^\d.-]/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : Math.abs(parsed);
}


function parseAmountWithDirection(rawVal, defaultType = null) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return { amount: 0, type: defaultType };
    if (typeof rawVal === 'number') {
        if (rawVal < 0) return { amount: Math.abs(rawVal), type: 'DEBIT' };
        return { amount: rawVal, type: defaultType };
    }

    const str = String(rawVal).trim();
    const isParenthesized = /^\s*\(.+\)\s*$/.test(str);
    const hasDr = /\b(?:DR|DEBIT)\b/i.test(str) || str.endsWith('Dr') || str.endsWith('DR');
    const hasCr = /\b(?:CR|CREDIT)\b/i.test(str) || str.endsWith('Cr') || str.endsWith('CR');
    const hasMinus = /^-/.test(str);

    const amount = cleanAmount(str);
    let type = defaultType;

    if (isParenthesized || hasDr || hasMinus) {
        type = 'DEBIT';
    } else if (hasCr) {
        type = 'CREDIT';
    }

    return { amount, type };
}

const INDIAN_BANKS = [
    { name: 'State Bank of India', patterns: [/State Bank of India/i, /\bSBI\b/i, /SBIN\d{7}/i] },
    { name: 'HDFC Bank', patterns: [/HDFC Bank/i, /\bHDFC\b/i, /HDFC\d{7}/i] },
    { name: 'ICICI Bank', patterns: [/ICICI Bank/i, /\bICICI\b/i, /ICIC\d{7}/i] },
    { name: 'Punjab National Bank', patterns: [/Punjab National Bank/i, /\bPNB\b/i, /PUNB\d{7}/i] },
    { name: 'Bank of Baroda', patterns: [/Bank of Baroda/i, /\bBOB\b/i, /BARB\d{7}/i] },
    { name: 'Axis Bank', patterns: [/Axis Bank/i, /\bAXIS\b/i, /UTIB\d{7}/i] },
    { name: 'Canara Bank', patterns: [/Canara Bank/i, /\bCANARA\b/i, /CNRB\d{7}/i] },
    { name: 'Kotak Mahindra Bank', patterns: [/Kotak Mahindra Bank/i, /\bKOTAK\b/i, /KKBK\d{7}/i] },
    { name: 'Union Bank of India', patterns: [/Union Bank of India/i, /\bUNION BANK\b/i, /\bUBI\b/i, /UBIN\d{7}/i] },
    { name: 'IndusInd Bank', patterns: [/IndusInd Bank/i, /\bINDUSIND\b/i, /INDB\d{7}/i] },
    { name: 'Indian Bank', patterns: [/Indian Bank/i, /IDIB\d{7}/i] },
    { name: 'Yes Bank', patterns: [/Yes Bank/i, /\bYES BANK\b/i, /YESB\d{7}/i] },
    { name: 'IDBI Bank', patterns: [/IDBI Bank/i, /\bIDBI\b/i, /IBKL\d{7}/i] },
    { name: 'Central Bank of India', patterns: [/Central Bank of India/i, /CBIN\d{7}/i] },
    { name: 'Federal Bank', patterns: [/Federal Bank/i, /FDRL\d{7}/i] },
    { name: 'Bank of India', patterns: [/Bank of India/i, /\bBOI\b/i, /BKID\d{7}/i] },
    { name: 'Indian Overseas Bank', patterns: [/Indian Overseas Bank/i, /\bIOB\b/i, /IOBA\d{7}/i] },
    { name: 'UCO Bank', patterns: [/UCO Bank/i, /UCBA\d{7}/i] }
];

function detectBankMetadata(filePath, rawHeaderRows = []) {
    const baseName = path.basename(filePath).toUpperCase();
    let bankName = 'Unknown Bank';
    let accountNo = 'Unspecified';

    for (const b of INDIAN_BANKS) {
        if (b.patterns.some(p => p.test(baseName))) {
            bankName = b.name;
            break;
        }
    }

    for (const row of rawHeaderRows) {
        const text = Object.values(row).join(' ');
        const accMatch = text.match(/(?:account\s*(?:no|number)?|a\/c\s*(?:no)?|acc)[:\s-]*([0-9Xx]{8,18})/i) ||
                         text.match(/(?:account\s*(?:no|number)?|a\/c\s*(?:no)?|acc)[:\s-]*([0-9Xx]{4,18})/i);
        if (accMatch) {
            accountNo = accMatch[1];
            break;
        }
    }

    if (accountNo === 'Unspecified') {
        const fnAccMatch = baseName.match(/(?:ACC|A_C|AC|NO)?_?(\d{4,18})/);
        if (fnAccMatch) {
            accountNo = fnAccMatch[1];
        }
    }

    for (const row of rawHeaderRows) {
        const text = Object.values(row).join(' ');
        if (bankName === 'Unknown Bank') {
            for (const b of INDIAN_BANKS) {
                if (b.patterns.some(p => p.test(text))) {
                    bankName = b.name;
                    break;
                }
            }
        }
    }

    let baseYear = null;
    const fnYear = baseName.match(/\b(20[12]\d)\b/);
    if (fnYear) baseYear = parseInt(fnYear[1], 10);

    for (const row of rawHeaderRows) {
        const text = Object.values(row).join(' ');
        if (!baseYear) {
            const allYears = text.match(/\b(20[12]\d)\b/g);
            if (allYears && allYears.length > 0) {
                baseYear = parseInt(allYears[0], 10);
            }
        }
    }

    return { bankName, accountNo, baseYear };
}

function findHeaderRowIndex(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;
        const lowerCells = row.map(c => String(c || '').trim().toLowerCase());
        
        const hasDate = lowerCells.some(c => COLUMN_SYNONYMS.date.includes(c));
        const hasNarration = lowerCells.some(c => COLUMN_SYNONYMS.narration.includes(c));
        const hasAmount = lowerCells.some(c => 
            COLUMN_SYNONYMS.debit.includes(c) || 
            COLUMN_SYNONYMS.credit.includes(c) || 
            c === 'amount'
        );

        if ((hasDate && hasNarration) || (hasDate && hasAmount)) {
            return i;
        }
    }
    return 0;
}

function parseExcelOrCsv(filePath, options = {}) {
    const isCsv = filePath.toLowerCase().endsWith('.csv');
    const readOpts = { raw: isCsv, cellDates: !isCsv };
    if (options.password) {
        readOpts.password = options.password;
    }

    const workbook = xlsx.readFile(filePath, readOpts);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawData || rawData.length === 0) return { metadata: {}, transactions: [] };

    const headerIdx = findHeaderRowIndex(rawData);
    const metaRows = rawData.slice(0, headerIdx);
    const headerRow = rawData[headerIdx].map(c => String(c || '').trim());
    const dataRows = rawData.slice(headerIdx + 1);

    const metadata = detectBankMetadata(filePath, metaRows);

    const colMap = {};
    headerRow.forEach((col, idx) => {
        const norm = col.toLowerCase();
        for (const [key, syns] of Object.entries(COLUMN_SYNONYMS)) {
            if (syns.includes(norm) && colMap[key] === undefined) {
                colMap[key] = idx;
            }
        }
    });

    if (colMap.date === undefined) colMap.date = 0;
    if (colMap.narration === undefined) colMap.narration = 1;

    const transactions = [];
    const dateContext = {
        baseYear: metadata.baseYear || null,
        currentYear: metadata.baseYear || null,
        lastSeenMonth: null,
        yearOffset: 0
    };

    dataRows.forEach((row, rIdx) => {
        if (!Array.isArray(row) || row.length === 0) return;
        const rawDate = row[colMap.date];
        const rawNarration = String(row[colMap.narration] || '').trim();
        if (!rawDate && !rawNarration) return;

        if (NarrationPreprocessor.isFurniture(rawNarration)) {
            return;
        }

        const date = normalizeDate(rawDate, dateContext);
        if (!date) return;

        let debit = colMap.debit !== undefined ? cleanAmount(row[colMap.debit]) : 0;
        let credit = colMap.credit !== undefined ? cleanAmount(row[colMap.credit]) : 0;
        const balance = colMap.balance !== undefined ? cleanAmount(row[colMap.balance]) : null;
        const chqRef = colMap.chq_ref !== undefined ? String(row[colMap.chq_ref] || '').trim() : '';

        if (colMap.debit === undefined && colMap.credit === undefined) {
            const amountIdx = headerRow.findIndex(h => /amount/i.test(h));
            if (amountIdx !== -1) {
                const amtVal = row[amountIdx];
                const typeHint = String(amtVal || '') + ' ' + rawNarration;
                const parsed = parseAmountWithDirection(amtVal);
                if (parsed.type === 'CREDIT' || /CR|CREDIT|DEP/i.test(typeHint)) {
                    credit = parsed.amount;
                } else {
                    debit = parsed.amount;
                }
            }
        }

        if (/OPENING\s*(?:BAL|BALANCE)|B\/F|BROUGHT\s*(?:FWD|FORWARD)|BAL\s*B\/F/i.test(rawNarration)) {
            if (balance !== null && !isNaN(balance) && metadata.openingBalance === undefined) {
                metadata.openingBalance = balance;
            }
        }

        if (debit === 0 && credit === 0) return;

        const cleanedNarration = NarrationPreprocessor.clean(rawNarration);

        transactions.push({
            id: `TXN_${path.basename(filePath, path.extname(filePath))}_${rIdx + 1}`,
            date,
            raw_date: String(rawDate),
            bank: metadata.bankName,
            account_no: metadata.accountNo,
            source_file: path.basename(filePath),
            narration: rawNarration,
            cleaned_narration: cleanedNarration,
            chq_ref_no: chqRef,
            debit,
            credit,
            amount: debit > 0 ? debit : credit,
            type: debit > 0 ? 'DEBIT' : 'CREDIT',
            balance
        });
    });

    return { metadata, transactions };
}

/**
 * Parse SWIFT MT940/MT942 Field 86 narrative into structured components.
 * Extracts /EREF/, /BENM/, /REMI/, /ORDP/, /TRF/, /CHGS/.
 * @param {string} narrative 
 * @returns {object}
 */
function parseField86(narrative) {
    if (!narrative || typeof narrative !== 'string') {
        return { raw_narrative: '' };
    }
    const text = narrative.trim();
    const res = {
        raw_narrative: text,
        end_to_end_id: null,
        beneficiary_name: null,
        ordering_customer: null,
        remittance_info: null,
        transaction_code: null,
        charges: null
    };

    const slashMatches = text.match(/\/([A-Z0-9]{2,8})\/([^/]+)/g);
    if (slashMatches) {
        for (const part of slashMatches) {
            const m = part.match(/\/([A-Z0-9]{2,8})\/([^/]+)/);
            if (m) {
                const tag = m[1].toUpperCase();
                const val = m[2].trim();
                if (['EREF', 'ENDTOENDID', 'UTR', 'REF'].includes(tag)) res.end_to_end_id = val;
                else if (['BENM', 'BENE', 'NAME', 'CDTRNM', 'PAYEE'].includes(tag)) res.beneficiary_name = val;
                else if (['ORDP', 'DBTRNM', 'ORDER', 'REMITTER'].includes(tag)) res.ordering_customer = val;
                else if (['REMI', 'COMM', 'DETAILS', 'MEMO'].includes(tag)) res.remittance_info = val;
                else if (['TRF', 'CODE', 'TXNTYPE'].includes(tag)) res.transaction_code = val;
                else if (['CHGS', 'FEE'].includes(tag)) res.charges = cleanAmount(val);
            }
        }
    }
    return res;
}

/**
 * Parse SWIFT MT940 / MT942 bank statement files (.mt940, .sta, .mt942)
 * @param {string|Buffer} filePathOrContent 
 * @param {object} options 
 * @returns {object} { metadata, transactions }
 */
function parseMt940(filePathOrContent, options = {}) {
    let text = '';
    let fileName = 'mt940_statement.sta';
    if (typeof filePathOrContent === 'string') {
        if (fs.existsSync(filePathOrContent)) {
            text = fs.readFileSync(filePathOrContent, 'utf8');
            fileName = path.basename(filePathOrContent);
        } else {
            text = filePathOrContent;
        }
    } else if (Buffer.isBuffer(filePathOrContent)) {
        text = filePathOrContent.toString('utf8');
    }

    const metadata = {
        bankName: 'SWIFT MT940 Bank',
        accountNo: 'UNKNOWN_MT940',
        openingBalance: undefined,
        closingBalance: undefined,
        currency: 'INR'
    };

    const lines = text.split(/\r?\n/);
    const transactions = [];
    let currentTxn = null;
    let currentAccount = null;
    let inTag86 = false;

    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx].trim();
        if (!line) continue;

        if (line.startsWith(':25:')) {
            inTag86 = false;
            currentAccount = line.substring(4).trim();
            metadata.accountNo = currentAccount;
            const bankHint = detectBankMetadata(line, fileName);
            if (bankHint.bankName !== 'Indian Commercial Bank') {
                metadata.bankName = bankHint.bankName;
            }
        } else if (line.startsWith(':60F:') || line.startsWith(':60M:')) {
            inTag86 = false;
            // e.g. :60F:C231001INR1000000,00
            const m = line.match(/^:60[FM]:([CD])(\d{6})([A-Z]{3})([0-9,.]+)/);
            if (m) {
                const mark = m[1];
                const ccy = m[3];
                const amt = cleanAmount(m[4]);
                metadata.currency = ccy;
                const sign = mark === 'C' ? 1 : -1;
                if (metadata.openingBalance === undefined) {
                    metadata.openingBalance = sign * amt;
                }
            }
        } else if (line.startsWith(':62F:') || line.startsWith(':62M:')) {
            inTag86 = false;
            const m = line.match(/^:62[FM]:([CD])(\d{6})([A-Z]{3})([0-9,.]+)/);
            if (m) {
                const mark = m[1];
                const amt = cleanAmount(m[4]);
                const sign = mark === 'C' ? 1 : -1;
                metadata.closingBalance = sign * amt;
            }
        } else if (line.startsWith(':61:')) {
            inTag86 = false;
            // e.g. :61:2310151015D50000,00NTRFNONREF//UTR12345
            const m = line.match(/^:61:(\d{6})(?:\d{4})?([A-Z]{1,2})([0-9,.]+)(.*)/);
            if (m) {
                const yymmdd = m[1];
                const year = 2000 + parseInt(yymmdd.substring(0, 2), 10);
                const month = yymmdd.substring(2, 4);
                const day = yymmdd.substring(4, 6);
                const isoDate = `${year}-${month}-${day}`;
                const mark = m[2].toUpperCase();
                const isDebit = ['D', 'RD', 'ED'].includes(mark);
                const amount = cleanAmount(m[3]);
                const rest = m[4] || '';

                const refMatch = rest.match(/\/\/(.+)$/);
                const chqRef = refMatch ? refMatch[1].trim() : '';

                currentTxn = {
                    id: `TXN_MT940_${transactions.length + 1}`,
                    date: isoDate,
                    raw_date: yymmdd,
                    bank: metadata.bankName,
                    account_no: metadata.accountNo,
                    source_file: fileName,
                    narration: rest.trim(),
                    cleaned_narration: NarrationPreprocessor.clean(rest),
                    chq_ref_no: chqRef,
                    debit: isDebit ? amount : 0,
                    credit: isDebit ? 0 : amount,
                    amount: amount,
                    type: isDebit ? 'DEBIT' : 'CREDIT',
                    balance: null
                };
                transactions.push(currentTxn);
            }
        } else if (line.startsWith(':86:') && currentTxn) {
            const rawNarr = line.substring(4).trim();
            currentTxn.narration = rawNarr;
            const parsed86 = parseField86(rawNarr);
            if (parsed86.end_to_end_id && !currentTxn.chq_ref_no) {
                currentTxn.chq_ref_no = parsed86.end_to_end_id;
            }
            if (parsed86.beneficiary_name) {
                currentTxn.cleaned_narration = parsed86.beneficiary_name;
            } else if (parsed86.ordering_customer) {
                currentTxn.cleaned_narration = parsed86.ordering_customer;
            } else {
                currentTxn.cleaned_narration = NarrationPreprocessor.clean(rawNarr);
            }
            inTag86 = true;
        } else if (inTag86 && currentTxn) {
            if (!line.startsWith(':')) {
                currentTxn.narration += ' ' + line;
                const parsed86 = parseField86(currentTxn.narration);
                if (parsed86.end_to_end_id) currentTxn.chq_ref_no = parsed86.end_to_end_id;
                if (parsed86.beneficiary_name) currentTxn.cleaned_narration = parsed86.beneficiary_name;
            } else {
                inTag86 = false;
            }
        }
    }

    return { metadata, transactions };
}

/**
 * Compute stable SHA-256 fingerprint for a transaction
 * @param {object} txn 
 * @returns {string} hex hash
 */
function computeTxnHash(txn) {
    const acc = String(txn.account_no || txn.bank || '').trim();
    const dt = String(txn.date || '').trim();
    const amt = Number(txn.amount || 0).toFixed(2);
    const typ = String(txn.type || '').trim().toUpperCase();
    const narr = (txn.cleaned_narration || txn.narration || '').trim().toLowerCase();
    return crypto.createHash('sha256').update(`${acc}|${dt}|${amt}|${typ}|${narr}`).digest('hex');
}

/**
 * Idempotent occurrence-counted deduplication (<hash>:<n>).
 * Preserves genuine identical same-day transactions while discarding duplicate statement uploads.
 * @param {Array} transactions 
 * @param {Set} [seenHashes] 
 * @returns {object} { unique, skippedHashes, seenHashes }
 */
function deduplicateWithOccurrenceCount(transactions, seenHashes = new Set()) {
    const unique = [];
    const skippedHashes = [];
    const occurrences = new Map();

    for (const tx of transactions) {
        const hash = computeTxnHash(tx);
        const count = occurrences.get(hash) || 0;
        occurrences.set(hash, count + 1);
        const occurrenceKey = `${hash}:${count}`;

        if (seenHashes.has(occurrenceKey)) {
            skippedHashes.push(hash);
            continue;
        }

        seenHashes.add(occurrenceKey);
        unique.push(tx);
    }

    return { unique, skippedHashes, seenHashes };
}

function ingestBankStatements(caseDir, options = {}) {
    const candidates = [
        path.join(caseDir, 'docs', 'bank_statements'),
        path.join(caseDir, 'bank_statements'),
        path.join(caseDir, 'docs')
    ];

    let targetDir = null;
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            targetDir = c;
            break;
        }
    }

    if (!targetDir) {
        return { accounts: [], transactions: [], fileCount: 0, summary: 'No bank statements directory found.' };
    }

    const files = fs.readdirSync(targetDir).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.xlsx', '.xls', '.csv', '.mt940', '.sta', '.mt942'].includes(ext);
    });

    const rawTransactions = [];
    const accounts = [];

    for (const file of files) {
        const fullPath = path.join(targetDir, file);
        const ext = path.extname(file).toLowerCase();
        try {
            let metadata, transactions;
            if (['.mt940', '.sta', '.mt942'].includes(ext)) {
                const parsed = parseMt940(fullPath, options);
                metadata = parsed.metadata;
                transactions = parsed.transactions;
            } else {
                const parsed = parseExcelOrCsv(fullPath, options);
                metadata = parsed.metadata;
                transactions = parsed.transactions;
            }

            if (transactions.length > 0) {
                rawTransactions.push(...transactions);
                accounts.push({
                    file,
                    bank: metadata.bankName,
                    accountNo: metadata.accountNo,
                    openingBalance: metadata.openingBalance !== undefined ? metadata.openingBalance : null,
                    closingBalance: metadata.closingBalance !== undefined ? metadata.closingBalance : null,
                    txnCount: transactions.length
                });
            }
        } catch (err) {
            console.warn(`[BankStatementParser] Error parsing ${file}:`, err.message);
        }
    }

    // Apply idempotent occurrence-counted deduplication (<hash>:<n>)
    const { unique: allTransactions, skippedHashes } = deduplicateWithOccurrenceCount(rawTransactions);
    if (skippedHashes.length > 0) {
        console.log(`[BankStatementParser] Occurrence deduplication skipped ${skippedHashes.length} duplicate transaction(s) across uploads.`);
    }

    allTransactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return {
        accounts,
        transactions: allTransactions,
        fileCount: files.length,
        summary: `Ingested ${allTransactions.length} transactions across ${accounts.length} bank account statements.`
    };
}

module.exports = {
    ingestBankStatements,
    parseExcelOrCsv,
    parseMt940,
    parseField86,
    computeTxnHash,
    deduplicateWithOccurrenceCount,
    normalizeDate,
    cleanAmount,
    detectBankMetadata
};

