#!/usr/bin/env python3
import os
import shutil

RBZ_CORE_DIR = "/Users/atulgrover/Desktop/rbz_reporting/rbz_core"

BILLING_ENGINE_CODE = '''# rbz_core/gateway/billing_engine.py
import hashlib
import time
import uuid
import json
import logging
from typing import Dict, Any, List, Optional
from rbz_core.db.pool import get_db_pool

logger = logging.getLogger("rbz_billing")

DEFAULT_RATES = {
    "screen_section_29a_entity": 250.00,
    "query_cibil_defaulters": 75.00,
    "check_director_mca_status": 50.00,
    "execute_ecourts_litigation_search": 150.00,
    "generate_plan_verification_dossier": 1500.00
}

_RATE_CACHE: Dict[str, float] = {}
_LAST_CACHE_TIME: float = 0

async def get_tool_rate(tool_name: str) -> float:
    global _RATE_CACHE, _LAST_CACHE_TIME
    now = time.time()
    if _RATE_CACHE and (now - _LAST_CACHE_TIME < 300):
        return _RATE_CACHE.get(tool_name, DEFAULT_RATES.get(tool_name, 100.00))
    
    try:
        pool = await get_db_pool()
        rows = await pool.fetch("SELECT tool_name, base_rate_inr FROM rbz_rate_cards WHERE is_active = TRUE")
        _RATE_CACHE = {r["tool_name"]: float(r["base_rate_inr"]) for r in rows}
        _LAST_CACHE_TIME = now
        return _RATE_CACHE.get(tool_name, DEFAULT_RATES.get(tool_name, 100.00))
    except Exception as e:
        logger.warning(f"Could not fetch rates from database, using defaults: {e}")
        return DEFAULT_RATES.get(tool_name, 100.00)

async def record_task_execution(
    tenant_id: str,
    case_id: str,
    tool_name: str,
    input_summary: Dict[str, Any],
    api_key_id: Optional[str] = None
) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    rate_inr = await get_tool_rate(tool_name)
    now_epoch = time.time()
    raw_receipt = f"{task_id}:{tenant_id}:{case_id}:{tool_name}:{rate_inr}:{now_epoch}"
    receipt_sig = hashlib.sha256(raw_receipt.encode("utf-8")).hexdigest()

    try:
        pool = await get_db_pool()
        query = """
            INSERT INTO rbz_tasks (
                id, tenant_id, api_key_id, case_id, tool_name,
                input_summary, rate_charged_inr, status, billing_status, receipt_signature
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
        """
        await pool.execute(
            query,
            uuid.UUID(task_id),
            uuid.UUID(tenant_id),
            uuid.UUID(api_key_id) if api_key_id else None,
            case_id or "default_case",
            tool_name,
            json.dumps(input_summary),
            rate_inr,
            "COMPLETED",
            "UNBILLED",
            receipt_sig
        )
        logger.info(f"[Billing] Recorded task {task_id} for case {case_id} (Fee: ₹{rate_inr})")
    except Exception as e:
        logger.error(f"[Billing] Failed to persist task {task_id} in rbz_tasks: {e}", exc_info=True)

    return {
        "task_id": task_id,
        "tool_name": tool_name,
        "case_id": case_id,
        "rate_inr": rate_inr,
        "billing_status": "UNBILLED",
        "receipt_signature": receipt_sig,
        "timestamp": now_epoch
    }

async def get_case_billing_summary(tenant_id: str, case_id: str) -> Dict[str, Any]:
    pool = await get_db_pool()
    t_uuid = uuid.UUID(tenant_id)
    
    tasks_query = """
        SELECT 
            id::text AS task_id,
            tool_name,
            input_summary,
            rate_charged_inr,
            status,
            billing_status,
            receipt_signature,
            executed_at
        FROM rbz_tasks
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY executed_at DESC
    """
    rows = await pool.fetch(tasks_query, t_uuid, case_id)
    
    unbilled_tasks = []
    settled_tasks = []
    total_unbilled = 0.0
    total_settled = 0.0
    
    for r in rows:
        item = {
            "task_id": r["task_id"],
            "tool_name": r["tool_name"],
            "input_summary": r["input_summary"],
            "rate_inr": float(r["rate_charged_inr"]),
            "status": r["status"],
            "billing_status": r["billing_status"],
            "receipt_signature": r["receipt_signature"],
            "executed_at": r["executed_at"].isoformat() if r["executed_at"] else None
        }
        if r["billing_status"] == "UNBILLED":
            unbilled_tasks.append(item)
            total_unbilled += float(r["rate_charged_inr"])
        else:
            settled_tasks.append(item)
            total_settled += float(r["rate_charged_inr"])

    inv_query = """
        SELECT id::text AS invoice_id, invoice_number, total_inr, status, paid_at, created_at
        FROM rbz_invoices
        WHERE tenant_id = $1 AND case_id = $2
        ORDER BY created_at DESC LIMIT 5
    """
    inv_rows = await pool.fetch(inv_query, t_uuid, case_id)
    invoices = [{
        "invoice_id": ir["invoice_id"],
        "invoice_number": ir["invoice_number"],
        "total_inr": float(ir["total_inr"]),
        "status": ir["status"],
        "paid_at": ir["paid_at"].isoformat() if ir["paid_at"] else None,
        "created_at": ir["created_at"].isoformat() if ir["created_at"] else None
    } for ir in inv_rows]

    gst_amount = round(total_unbilled * 0.18, 2)
    grand_total = round(total_unbilled + gst_amount, 2)

    return {
        "tenant_id": tenant_id,
        "case_id": case_id,
        "unbilled_count": len(unbilled_tasks),
        "subtotal_unbilled_inr": round(total_unbilled, 2),
        "gst_18_pct_inr": gst_amount,
        "total_due_inr": grand_total,
        "unbilled_tasks": unbilled_tasks,
        "settled_tasks": settled_tasks,
        "invoices": invoices,
        "currency": "INR"
    }

async def create_case_invoice(tenant_id: str, case_id: str, case_title: str = "") -> Dict[str, Any]:
    pool = await get_db_pool()
    t_uuid = uuid.UUID(tenant_id)
    
    row = await pool.fetchrow("""
        SELECT COALESCE(SUM(rate_charged_inr), 0) AS subtotal, COUNT(*) AS count
        FROM rbz_tasks
        WHERE tenant_id = $1 AND case_id = $2 AND billing_status = 'UNBILLED'
    """, t_uuid, case_id)
    
    subtotal = float(row["subtotal"])
    count = int(row["count"])
    
    if count == 0:
        return {"status": "NO_UNBILLED_TASKS", "message": "No unbilled tasks pending for this case."}
        
    gst = round(subtotal * 0.18, 2)
    total = round(subtotal + gst, 2)
    
    invoice_id = uuid.uuid4()
    rand_suffix = uuid.uuid4().hex[:6].upper()
    now_str = time.strftime("%Y%m")
    inv_num = f"RBZ-INV-{now_str}-{rand_suffix}"
    
    mock_order_id = f"order_rbz_{uuid.uuid4().hex[:14]}"
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
                INSERT INTO rbz_invoices (
                    id, invoice_number, tenant_id, case_id, case_title,
                    subtotal_inr, gst_inr, total_inr, status, gateway_order_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
            """, invoice_id, inv_num, t_uuid, case_id, case_title, subtotal, gst, total, mock_order_id)
            
            await conn.execute("""
                UPDATE rbz_tasks
                SET billing_status = 'INVOICED', invoice_id = $1
                WHERE tenant_id = $2 AND case_id = $3 AND billing_status = 'UNBILLED'
            """, invoice_id, t_uuid, case_id)
            
    return {
        "invoice_id": str(invoice_id),
        "invoice_number": inv_num,
        "case_id": case_id,
        "subtotal_inr": subtotal,
        "gst_inr": gst,
        "total_inr": total,
        "status": "PENDING",
        "gateway_order_id": mock_order_id,
        "tasks_count": count
    }

async def settle_invoice(invoice_id: str, payment_id: str, payment_method: str = "UPI") -> bool:
    pool = await get_db_pool()
    inv_uuid = uuid.UUID(invoice_id)
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
                UPDATE rbz_invoices
                SET status = 'PAID', gateway_payment_id = $1, payment_method = $2, paid_at = NOW(), updated_at = NOW()
                WHERE id = $3
            """, payment_id, payment_method, inv_uuid)
            
            await conn.execute("""
                UPDATE rbz_tasks
                SET billing_status = 'SETTLED'
                WHERE invoice_id = $1
            """, inv_uuid)
            
    logger.info(f"[Billing] Invoice {invoice_id} settled successfully (Payment ID: {payment_id})")
    return True
'''

BILLING_ROUTER_CODE = '''# rbz_core/gateway/routes/billing.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional, Dict, Any

from rbz_core.gateway.auth import verify_api_key, TenantContext
from rbz_core.gateway.billing_engine import (
    get_case_billing_summary,
    create_case_invoice,
    settle_invoice,
    get_tool_rate,
    DEFAULT_RATES
)

router = APIRouter(prefix="/v1/billing", tags=["Billing & Payments"])

class CreateInvoiceRequest(BaseModel):
    case_id: str
    case_title: Optional[str] = ""

class SettlementWebhookRequest(BaseModel):
    invoice_id: str
    gateway_payment_id: str
    payment_method: Optional[str] = "UPI"
    signature: Optional[str] = ""

@router.get("/rate-card")
async def get_active_rate_card(tenant: TenantContext = Depends(verify_api_key)):
    """
    Returns active rate card schedule for client-side fee estimation.
    """
    rates = {}
    for tool_name in DEFAULT_RATES.keys():
        rates[tool_name] = await get_tool_rate(tool_name)
    return {
        "currency": "INR",
        "rates": rates
    }

@router.get("/case-summary")
async def get_billing_summary(
    case_id: str = Query(..., description="Active case folder identifier"),
    tenant: TenantContext = Depends(verify_api_key)
):
    """
    Returns unbilled tasks, accrued balance, and payment receipts for this case.
    """
    summary = await get_case_billing_summary(tenant.tenant_id, case_id)
    return summary

@router.post("/create-invoice")
async def generate_invoice_for_case(
    req: CreateInvoiceRequest,
    tenant: TenantContext = Depends(verify_api_key)
):
    """
    Locks unbilled tasks into a pending invoice and returns a checkout order.
    """
    result = await create_case_invoice(tenant.tenant_id, req.case_id, req.case_title or req.case_id)
    return result

@router.post("/razorpay-webhook")
async def razorpay_payment_webhook(payload: Dict[str, Any]):
    """
    Captures payments from Razorpay and marks the invoice as SETTLED.
    """
    event = payload.get("event")
    if event == "payment.captured" or payload.get("status") == "PAID":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        invoice_id = payment_entity.get("notes", {}).get("invoice_id") or payload.get("invoice_id")
        payment_id = payment_entity.get("id") or payload.get("payment_id", f"pay_mock_{int(time.time())}")
        method = payment_entity.get("method", "UPI")

        if invoice_id:
            await settle_invoice(invoice_id, payment_id, method)
            return {"status": "SUCCESS", "message": f"Invoice {invoice_id} settled."}

    return {"status": "ACKNOWLEDGED"}
'''

PORTAL_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Resolution Bazaar — Case Billing & Settlement</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --accent: #238636;
      --accent-hover: #2ea043;
      --text: #c9d1d9;
      --text-bright: #ffffff;
      --gold: #d29922;
    }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .logo {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      background: #1f6feb22;
      color: #58a6ff;
      border: 1px solid #1f6feb;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .stat-val {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-bright);
      margin-top: 4px;
    }
    .stat-label {
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    th {
      background: #21262d;
      color: #8b949e;
      font-weight: 600;
    }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover {
      background: var(--accent-hover);
    }
    .btn-secondary {
      background: #21262d;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .action-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      align-items: center;
    }
    .status-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-unbilled { background: #d2992222; color: #d29922; border: 1px solid #d29922; }
    .status-settled { background: #23863622; color: #3fb950; border: 1px solid #238636; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <span>🏛️</span> Resolution Bazaar
        <span class="badge">CIRP Expense Settlement</span>
      </div>
      <div id="case-header-badge" class="badge">Case: Loading...</div>
    </div>

    <div class="summary-grid">
      <div class="stat-card">
        <div class="stat-label">Pending Billable Tasks</div>
        <div id="unbilled-count" class="stat-val">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Subtotal (INR)</div>
        <div id="subtotal-val" class="stat-val">₹0.00</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Due (incl. 18% GST)</div>
        <div id="total-val" class="stat-val" style="color: #58a6ff;">₹0.00</div>
      </div>
    </div>

    <h3 style="color: var(--text-bright); margin-bottom: 12px;">Itemized Case Diligence Audit Trail</h3>
    <table>
      <thead>
        <tr>
          <th>Task ID</th>
          <th>Tool / Diligence Service</th>
          <th>Target / Subject</th>
          <th>Fee</th>
          <th>Status</th>
          <th>Executed At</th>
        </tr>
      </thead>
      <tbody id="tasks-table-body">
        <tr><td colspan="6" style="text-align: center; color: #8b949e;">Loading tasks...</td></tr>
      </tbody>
    </table>

    <div class="action-bar">
      <button class="btn btn-secondary" onclick="window.close()">Back to Theia IDE</button>
      <button id="pay-btn" class="btn" onclick="executeMockPayment()">Proceed to Razorpay (₹0.00)</button>
    </div>
  </div>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('case_id') || 'case_001_telephone_cables';
    const apiKey = urlParams.get('api_key') || 'rbz_live_test_ip_key_2026';

    document.getElementById('case-header-badge').textContent = 'Case: ' + caseId;

    let currentSummary = null;

    async function fetchSummary() {
      try {
        const res = await fetch(`/api/v1/billing/case-summary?case_id=${encodeURIComponent(caseId)}`, {
          headers: { 'X-API-Key': apiKey }
        });
        const data = await res.json();
        currentSummary = data;
        renderData(data);
      } catch (e) {
        console.error('Failed to load summary:', e);
      }
    }

    function renderData(data) {
      document.getElementById('unbilled-count').textContent = data.unbilled_count;
      document.getElementById('subtotal-val').textContent = '₹' + data.subtotal_unbilled_inr.toFixed(2);
      document.getElementById('total-val').textContent = '₹' + data.total_due_inr.toFixed(2);
      document.getElementById('pay-btn').textContent = `Pay via Razorpay (₹${data.total_due_inr.toFixed(2)})`;
      document.getElementById('pay-btn').disabled = data.unbilled_count === 0;

      const tbody = document.getElementById('tasks-table-body');
      tbody.innerHTML = '';

      const allTasks = [...(data.unbilled_tasks || []), ...(data.settled_tasks || [])];
      if (allTasks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8b949e;">No tasks recorded for this case yet.</td></tr>';
        return;
      }

      allTasks.forEach(t => {
        const tr = document.createElement('tr');
        const isUnbilled = t.billing_status === 'UNBILLED';
        const pillClass = isUnbilled ? 'status-unbilled' : 'status-settled';
        const pillText = isUnbilled ? 'UNBILLED' : 'SETTLED';

        const summaryObj = typeof t.input_summary === 'string' ? JSON.parse(t.input_summary || '{}') : (t.input_summary || {});
        const target = summaryObj.name || summaryObj.identifier || summaryObj.din || 'Case Query';

        tr.innerHTML = `
          <td><code>${t.task_id.substring(0, 8)}...</code></td>
          <td><b>${t.tool_name}</b></td>
          <td>${target}</td>
          <td>₹${t.rate_inr.toFixed(2)}</td>
          <td><span class="status-pill ${pillClass}">${pillText}</span></td>
          <td style="color: #8b949e;">${t.executed_at ? new Date(t.executed_at).toLocaleString() : 'N/A'}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    async function executeMockPayment() {
      if (!currentSummary || currentSummary.unbilled_count === 0) return;
      const btn = document.getElementById('pay-btn');
      btn.disabled = true;
      btn.textContent = 'Creating Invoice Order...';

      try {
        const invRes = await fetch('/api/v1/billing/create-invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ case_id: caseId })
        });
        const invData = await invRes.json();
        
        btn.textContent = 'Processing Payment...';
        // Simulate Razorpay payment capture callback
        const payRes = await fetch('/api/v1/billing/razorpay-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment.captured',
            invoice_id: invData.invoice_id,
            payment_id: 'pay_rzp_' + Math.random().toString(36).substring(2, 10),
            status: 'PAID'
          })
        });

        alert(`✅ Payment of ₹${invData.total_inr.toFixed(2)} Successful!\\nInvoice: ${invData.invoice_number}\\n\\nAll tasks are marked SETTLED for CIRP accounts.`);
        await fetchSummary();
      } catch (e) {
        alert('Payment processing failed: ' + e.message);
        btn.disabled = false;
      }
    }

    fetchSummary();
  </script>
</body>
</html>
'''

def patch_main_and_mcp():
    main_py_path = os.path.join(RBZ_CORE_DIR, "gateway", "main.py")
    with open(main_py_path, "r") as f:
        main_code = f.read()

    if "billing_router" not in main_code:
        insert_marker = "app.include_router(jobs_router)"
        new_routes = """app.include_router(jobs_router)

from rbz_core.gateway.routes.billing import router as billing_router
app.include_router(billing_router, prefix="/api")

from fastapi.responses import FileResponse
@app.get("/portal/billing", response_class=FileResponse)
async def serve_billing_portal():
    portal_path = os.path.join(os.path.dirname(__file__), "..", "portal", "billing.html")
    return FileResponse(portal_path)
"""
        main_code = main_code.replace(insert_marker, new_routes)
        with open(main_py_path, "w") as f:
            f.write(main_code)
        print("Patched gateway/main.py with billing router and /portal/billing")

    # Patch mcp_server.py to auto-record task billing
    mcp_server_path = os.path.join(RBZ_CORE_DIR, "gateway", "mcp_server.py")
    with open(mcp_server_path, "r") as f:
        mcp_code = f.read()

    if "record_task_execution" not in mcp_code:
        import_marker = "from rbz_core.db.pool import get_db_pool"
        new_import = """from rbz_core.db.pool import get_db_pool
from rbz_core.gateway.billing_engine import record_task_execution"""
        mcp_code = mcp_code.replace(import_marker, new_import)

        # Patch screen_section_29a_entity
        target_screen = """        result = await run_instant_screening(
            identifier=identifier,
            name=name,
            tenant_id=tenant_id,
            ip_reg_no=ip_reg_no
        )
        return json.dumps(result, indent=2, default=str)"""
        
        replacement_screen = """        result = await run_instant_screening(
            identifier=identifier,
            name=name,
            tenant_id=tenant_id,
            ip_reg_no=ip_reg_no
        )
        # Record billable task in master PostgreSQL ledger
        receipt = await record_task_execution(
            tenant_id=tenant_id,
            case_id=case_id or "default_case",
            tool_name="screen_section_29a_entity",
            input_summary={"identifier": identifier, "name": name}
        )
        if isinstance(result, dict):
            result["_billing"] = receipt
        return json.dumps(result, indent=2, default=str)"""
        
        mcp_code = mcp_code.replace("async def screen_section_29a_entity(identifier: str, name: str) -> str:", "async def screen_section_29a_entity(identifier: str, name: str, case_id: str = \"default_case\") -> str:")
        mcp_code = mcp_code.replace(target_screen, replacement_screen)

        with open(mcp_server_path, "w") as f:
            f.write(mcp_code)
        print("Patched gateway/mcp_server.py with task metering")

def deploy():
    # 1. Write billing_engine.py
    with open(os.path.join(RBZ_CORE_DIR, "gateway", "billing_engine.py"), "w") as f:
        f.write(BILLING_ENGINE_CODE)
    print("Deployed billing_engine.py")

    # 2. Write billing.py router
    with open(os.path.join(RBZ_CORE_DIR, "gateway", "routes", "billing.py"), "w") as f:
        f.write(BILLING_ROUTER_CODE)
    print("Deployed routes/billing.py")

    # 3. Write portal HTML
    portal_dir = os.path.join(RBZ_CORE_DIR, "portal")
    os.makedirs(portal_dir, exist_ok=True)
    with open(os.path.join(portal_dir, "billing.html"), "w") as f:
        f.write(PORTAL_HTML)
    print("Deployed portal/billing.html")

    # 4. Patch main and mcp server
    patch_main_and_mcp()

if __name__ == "__main__":
    deploy()

