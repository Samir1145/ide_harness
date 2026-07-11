const { validateFormRules } = require('../lib/ingestion-file/form_rules_validator');

function run() {
    console.log('[Form Rules Validator Unit Tests]');
    console.log('  -> Testing mathematical equation validations...');

    const rules = [
        {
            ruleId: 'rule_net_worth',
            formula: 'netWorth == shareCapital + reserves - accumulatedLosses',
            message: 'Net worth must equal share capital + reserves - accumulated losses.'
        },
        {
            ruleId: 'rule_date_seq',
            formula: 'boardDate <= signingDate',
            message: 'Board date must be chronologically before or equal to signing date.'
        }
    ];

    // Test Case 1: All rules passing
    const dataPassing = {
        netWorth: 150000,
        shareCapital: 100000,
        reserves: 60000,
        accumulatedLosses: 10000,
        boardDate: '05-06-2025',
        signingDate: '10-06-2025'
    };

    const fails1 = validateFormRules(dataPassing, rules);
    if (fails1.length !== 0) {
        throw new Error(`Expected zero validation failures, got: ${JSON.stringify(fails1)}`);
    }
    console.log('     ✓ Test case: passing mathematical and date rules passed.');

    // Test Case 2: Math rules failing
    const dataMathFailing = {
        netWorth: 120000, // Invalid math: 100k + 60k - 10k = 150k
        shareCapital: 100000,
        reserves: 60000,
        accumulatedLosses: 10000,
        boardDate: '05-06-2025',
        signingDate: '10-06-2025'
    };

    const fails2 = validateFormRules(dataMathFailing, rules);
    if (fails2.length !== 1 || fails2[0].ruleId !== 'rule_net_worth') {
        throw new Error(`Expected rule_net_worth to fail, got: ${JSON.stringify(fails2)}`);
    }
    console.log('     ✓ Test case: failing math rules detected and reported.');

    // Test Case 3: Date rules failing (chronologically backwards)
    const dataDateFailing = {
        netWorth: 150000,
        shareCapital: 100000,
        reserves: 60000,
        accumulatedLosses: 10000,
        boardDate: '25-06-2025', // Invalid order: board date is after signing date
        signingDate: '10-06-2025'
    };

    const fails3 = validateFormRules(dataDateFailing, rules);
    if (fails3.length !== 1 || fails3[0].ruleId !== 'rule_date_seq') {
        throw new Error(`Expected rule_date_seq to fail, got: ${JSON.stringify(fails3)}`);
    }
    console.log('     ✓ Test case: reverse date chronology detected and reported.');

    console.log('  ✓ SUCCESS: Form Rules Validator tests passed!');
}

module.exports = { run };
