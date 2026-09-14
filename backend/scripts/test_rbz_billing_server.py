#!/usr/bin/env python3
import asyncio
import os
import sys

# Add rbz_reporting to sys.path
sys.path.insert(0, "/Users/atulgrover/Desktop/rbz_reporting")

from dotenv import load_dotenv
load_dotenv("/Users/atulgrover/Desktop/rbz_reporting/rbz_core/.env")

from rbz_core.gateway.billing_engine import (
    get_tool_rate,
    record_task_execution,
    get_case_billing_summary,
    create_case_invoice,
    settle_invoice
)
from rbz_core.db.pool import Database

async def test_billing_flow():
    print("=== Testing Resolution Bazaar Server Billing Engine ===")
    
    # 1. Test rate card lookup
    rate_29a = await get_tool_rate("screen_section_29a_entity")
    rate_cibil = await get_tool_rate("query_cibil_defaulters")
    print(f"1. Rate Card: Section 29A = ₹{rate_29a}, CIBIL = ₹{rate_cibil}")
    assert rate_29a == 250.00, f"Expected 250.00, got {rate_29a}"
    assert rate_cibil == 75.00, f"Expected 75.00, got {rate_cibil}"

    # Default test tenant
    test_tenant_id = "00000000-0000-0000-0000-000000000001"
    test_case_id = "test_cirp_telephone_cables_001"

    # 2. Record 2 billable tasks
    task1 = await record_task_execution(
        tenant_id=test_tenant_id,
        case_id=test_case_id,
        tool_name="screen_section_29a_entity",
        input_summary={"din": "01234567", "name": "Aman Grover"}
    )
    print(f"2. Recorded Task 1: {task1['task_id']} | Fee: ₹{task1['rate_inr']} | Sig: {task1['receipt_signature'][:12]}...")

    task2 = await record_task_execution(
        tenant_id=test_tenant_id,
        case_id=test_case_id,
        tool_name="query_cibil_defaulters",
        input_summary={"identifier": "AABCT1234D", "name": "Telephone Cables Ltd"}
    )
    print(f"3. Recorded Task 2: {task2['task_id']} | Fee: ₹{task2['rate_inr']} | Sig: {task2['receipt_signature'][:12]}...")

    # 3. Test case summary aggregation
    summary = await get_case_billing_summary(test_tenant_id, test_case_id)
    print(f"4. Case Summary: Unbilled count = {summary['unbilled_count']}, Subtotal = ₹{summary['subtotal_unbilled_inr']}, Total Due (incl 18% GST) = ₹{summary['total_due_inr']}")
    assert summary["unbilled_count"] >= 2, f"Expected >= 2 unbilled tasks, got {summary['unbilled_count']}"

    # 4. Test invoice creation
    inv = await create_case_invoice(test_tenant_id, test_case_id, "Telephone Cables CIRP Estate")
    print(f"5. Generated Invoice: {inv['invoice_number']} | Total = ₹{inv['total_inr']} | Order ID = {inv['gateway_order_id']}")
    assert inv["status"] == "PENDING"
    assert inv["invoice_id"] is not None

    # 5. Test settlement webhook
    mock_payment_id = "pay_rzp_mock_live_test_2026"
    settled = await settle_invoice(inv["invoice_id"], mock_payment_id, "UPI")
    print(f"6. Settled Invoice: {settled} (Gateway Payment ID: {mock_payment_id})")
    assert settled is True

    # 6. Verify summary after settlement
    final_summary = await get_case_billing_summary(test_tenant_id, test_case_id)
    print(f"7. Post-Settlement: Unbilled count = {final_summary['unbilled_count']}, Settled count = {len(final_summary['settled_tasks'])}")
    assert final_summary["unbilled_count"] == 0, f"Expected 0 unbilled tasks, got {final_summary['unbilled_count']}"

    print("=== All Resolution Bazaar Billing Tests PASSED Successfully! ===")
    await Database.close()

if __name__ == "__main__":
    asyncio.run(test_billing_flow())
