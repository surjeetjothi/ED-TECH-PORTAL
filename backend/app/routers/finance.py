from fastapi import APIRouter, HTTPException, Depends, Header, Body, Query, Request, Response
from typing import List, Dict, Any, Optional
from datetime import datetime, date
import logging
from app.core.database import get_db_connection
from pydantic import BaseModel

import sys
# No longer importing backend here to avoid circular dependencies

from app.core.security import verify_any_permission
from app.core.models import *
# _resolve_school_id is defined below

router = APIRouter(tags=["Finance"])
logger = logging.getLogger(__name__)

@router.get("/api/finance/module")
async def get_finance_module_access(x_user_id: str = Header(None, alias="X-User-Id")):
    granted_by = await verify_any_permission([
        "finance_view",
        "finance_dashboard_read",
        "finance_reports_read",
        "finance_payroll_self_read",
        "finance_fees_self_read",
        "finance_fees_child_read"
    ], x_user_id)
    return {
        "module": "finance",
        "granted_by": granted_by,
        "submodules": [
            "payroll",
            "general-ledger",
            "receivables",
            "payables",
            "inventory",
            "assets"
        ]
    }

@router.get("/api/finance/dashboard")
async def get_finance_dashboard(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_dashboard_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        outstanding = cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE status IN ('Unpaid', 'Overdue')"
        ).fetchone()
        collected = cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'Success'"
        ).fetchone()
        overdue_count = cursor.execute(
            "SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'Overdue'"
        ).fetchone()
        return {
            "outstanding_total": float(outstanding["total"] or 0),
            "collections_total": float(collected["total"] or 0),
            "overdue_invoices": int(overdue_count["cnt"] or 0)
        }
    finally:
        conn.close()

@router.get("/api/finance/reports/summary")
async def get_finance_reports_summary(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        totals = cursor.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) AS paid_amount,
              COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN amount ELSE 0 END), 0) AS unpaid_amount,
              COALESCE(SUM(CASE WHEN status = 'Overdue' THEN amount ELSE 0 END), 0) AS overdue_amount
            FROM invoices
            """
        ).fetchone()
        return {
            "paid_amount": float(totals["paid_amount"] or 0),
            "unpaid_amount": float(totals["unpaid_amount"] or 0),
            "overdue_amount": float(totals["overdue_amount"] or 0)
        }
    finally:
        conn.close()

@router.get("/api/finance/payroll/self")
async def get_self_payroll(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_self_read", "finance_payroll"], x_user_id)
    conn = get_db_connection()
    try:
        row = conn.execute(
            """
            SELECT sp.user_id, s.name, sp.position_title, sp.salary, sp.department_id
            FROM staff_profiles sp
            JOIN students s ON s.id = sp.user_id
            WHERE sp.user_id = ?
            """,
            (x_user_id,)
        ).fetchone()
        if not row:
            return {"user_id": x_user_id, "salary": 0, "position_title": None, "department_id": None}
        return dict(row)
    finally:
        conn.close()

@router.get("/api/finance/fees/self")
async def get_self_fees(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_fees_self_read", "finance_invoices"], x_user_id)
    conn = get_db_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, invoice_number, description, amount, due_date, status, created_at
            FROM invoices
            WHERE student_id = ?
            ORDER BY due_date DESC, id DESC
            """,
            (x_user_id,)
        ).fetchall()
        return {"student_id": x_user_id, "invoices": [dict(r) for r in rows]}
    finally:
        conn.close()

@router.get("/api/finance/fees/child")
async def get_child_fees(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_fees_child_read", "finance_invoices"], x_user_id)
    conn = get_db_connection()
    try:
        child_rows = conn.execute(
            "SELECT DISTINCT student_id FROM guardians WHERE email = ?",
            (x_user_id,)
        ).fetchall()
        child_ids = [r["student_id"] for r in child_rows if r["student_id"]]
        if not child_ids:
            return {"child_ids": [], "invoices": []}
        placeholders = ",".join(["?"] * len(child_ids))
        invoices = conn.execute(
            f"""
            SELECT id, student_id, invoice_number, description, amount, due_date, status, created_at
            FROM invoices
            WHERE student_id IN ({placeholders})
            ORDER BY due_date DESC, id DESC
            """,
            tuple(child_ids)
        ).fetchall()
        return {"child_ids": child_ids, "invoices": [dict(r) for r in invoices]}
    finally:
        conn.close()

def _resolve_school_id(conn, user_id: str) -> int:
    row = conn.execute("SELECT school_id FROM students WHERE id = ?", (user_id,)).fetchone()
    if not row or not row["school_id"]:
        return 1
    return int(row["school_id"])

def _as_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y", "on")
    return default

def _gl_next_journal_number(conn, school_id: int, prefix: str = "GL") -> str:
    day = datetime.now().strftime("%Y%m%d")
    start = f"{prefix}-{day}-"
    row = conn.execute(
        "SELECT journal_number FROM journal_entries WHERE school_id = ? AND journal_number LIKE ? ORDER BY journal_number DESC LIMIT 1",
        (school_id, start + "%")
    ).fetchone()
    if not row:
        seq = 1
    else:
        last = row["journal_number"] or ""
        try:
            seq = int(last.split("-")[-1]) + 1
        except Exception:
            seq = 1
    return f"{start}{seq:04d}"

def _gl_resolve_account_id(conn, school_id: int, line: GLJournalLineInput) -> int:
    if line.account_id:
        row = conn.execute(
            "SELECT id FROM accounts WHERE id = ? AND school_id = ? AND is_active = TRUE",
            (line.account_id, school_id)
        ).fetchone()
        if row:
            return int(row["id"])
    if line.account_code:
        row = conn.execute(
            "SELECT id FROM accounts WHERE code = ? AND school_id = ? AND is_active = TRUE",
            (line.account_code, school_id)
        ).fetchone()
        if row:
            return int(row["id"])
    raise HTTPException(status_code=400, detail="Each journal line must reference an active account via account_id or account_code.")

def _gl_check_period_open(conn, school_id: int, period_id: Optional[int]) -> None:
    if not period_id:
        return
    period = conn.execute(
        "SELECT id, status FROM periods WHERE id = ? AND school_id = ?",
        (period_id, school_id)
    ).fetchone()
    if not period:
        raise HTTPException(status_code=400, detail="Invalid period_id for this school.")
    if (period["status"] or "").lower() == "closed":
        raise HTTPException(status_code=400, detail="Accounting period is closed. Posting is not allowed.")

def _gl_validate_lines(lines: List[GLJournalLineInput]) -> Dict[str, Any]:
    if not lines or len(lines) < 2:
        raise HTTPException(status_code=400, detail="At least two journal lines are required.")
    total_debit = 0.0
    total_credit = 0.0
    prepared = []
    for idx, line in enumerate(lines, start=1):
        debit = float(line.debit or 0)
        credit = float(line.credit or 0)
        if debit < 0 or credit < 0:
            raise HTTPException(status_code=400, detail=f"Line {idx}: debit/credit cannot be negative.")
        if (debit > 0 and credit > 0) or (debit == 0 and credit == 0):
            raise HTTPException(status_code=400, detail=f"Line {idx}: provide either debit or credit.")
        total_debit += debit
        total_credit += credit
        prepared.append({
            "line_no": idx,
            "description": line.description,
            "debit": debit,
            "credit": credit,
            "cost_center_id": line.cost_center_id,
            "tax_code_id": line.tax_code_id,
            "party_id": line.party_id,
            "account_id": None
        })
    if abs(total_debit - total_credit) > 0.0001:
        raise HTTPException(status_code=400, detail="Journal is not balanced. Debit total must equal credit total.")
    return {
        "total_debit": round(total_debit, 2),
        "total_credit": round(total_credit, 2),
        "prepared": prepared
    }

def _gl_fetch_lines(conn, journal_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT jl.*, a.code AS account_code, a.name AS account_name, a.account_type
        FROM journal_lines jl
        JOIN accounts a ON a.id = jl.account_id
        WHERE jl.journal_entry_id = ?
        ORDER BY jl.line_no, jl.id
        """,
        (journal_id,)
    ).fetchall()
    return [dict(r) for r in rows]

@router.post("/api/finance/gl/journals")
@router.post("/finance/gl/journals")
async def create_gl_journal(request: GLJournalCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_gl_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        _gl_check_period_open(conn, school_id, request.period_id)
        checked = _gl_validate_lines(request.lines)
        now = datetime.now().isoformat()
        journal_number = _gl_next_journal_number(conn, school_id, "GL")
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO journal_entries (
                school_id, journal_number, entry_date, description, reference, period_id,
                status, total_debit, total_credit, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?, ?, ?)
            """,
            (
                school_id, journal_number, request.entry_date, request.description, request.reference,
                request.period_id, checked["total_debit"], checked["total_credit"], x_user_id, now, now
            )
        )
        journal_id = cur.lastrowid
        for idx, line in enumerate(request.lines):
            prepared = checked["prepared"][idx]
            account_id = _gl_resolve_account_id(conn, school_id, line)
            cur.execute(
                """
                INSERT INTO journal_lines (
                    journal_entry_id, line_no, account_id, description, debit, credit, cost_center_id, tax_code_id, party_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    journal_id, prepared["line_no"], account_id, prepared["description"],
                    prepared["debit"], prepared["credit"], prepared["cost_center_id"],
                    prepared["tax_code_id"], prepared["party_id"]
                )
            )
        conn.commit()
        entry = conn.execute("SELECT * FROM journal_entries WHERE id = ?", (journal_id,)).fetchone()
        return {"journal": dict(entry), "lines": _gl_fetch_lines(conn, journal_id)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create journal: {str(e)}")
    finally:
        conn.close()

@router.post("/api/finance/gl/journals/{journal_id}/post")
@router.post("/finance/gl/journals/{journal_id}/post")
async def post_gl_journal(journal_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_gl_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        entry = conn.execute(
            "SELECT * FROM journal_entries WHERE id = ? AND school_id = ?",
            (journal_id, school_id)
        ).fetchone()
        if not entry:
            raise HTTPException(status_code=404, detail="Journal not found.")
        if (entry["status"] or "").lower() != "draft":
            raise HTTPException(status_code=400, detail="Posted entries are locked. Only Draft journals can be posted.")
        _gl_check_period_open(conn, school_id, entry["period_id"])
        totals = conn.execute(
            "SELECT COALESCE(SUM(debit),0) AS total_debit, COALESCE(SUM(credit),0) AS total_credit FROM journal_lines WHERE journal_entry_id = ?",
            (journal_id,)
        ).fetchone()
        total_debit = float(totals["total_debit"] or 0)
        total_credit = float(totals["total_credit"] or 0)
        if total_debit <= 0 and total_credit <= 0:
            raise HTTPException(status_code=400, detail="Journal has no lines.")
        if abs(total_debit - total_credit) > 0.0001:
            raise HTTPException(status_code=400, detail="Journal is not balanced. Debit total must equal credit total.")
        now = datetime.now().isoformat()
        conn.execute(
            """
            UPDATE journal_entries
            SET status = 'Posted', total_debit = ?, total_credit = ?, posted_at = ?, posted_by = ?, updated_at = ?
            WHERE id = ?
            """,
            (round(total_debit, 2), round(total_credit, 2), now, x_user_id, now, journal_id)
        )
        conn.commit()
        posted = conn.execute("SELECT * FROM journal_entries WHERE id = ?", (journal_id,)).fetchone()
        return {"journal": dict(posted), "lines": _gl_fetch_lines(conn, journal_id)}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to post journal: {str(e)}")
    finally:
        conn.close()

@router.post("/api/finance/gl/journals/{journal_id}/reverse")
@router.post("/finance/gl/journals/{journal_id}/reverse")
async def reverse_gl_journal(journal_id: int, request: Optional[GLJournalReverseRequest] = Body(default=None), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_gl_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        original = conn.execute(
            "SELECT * FROM journal_entries WHERE id = ? AND school_id = ?",
            (journal_id, school_id)
        ).fetchone()
        if not original:
            raise HTTPException(status_code=404, detail="Journal not found.")
        if (original["status"] or "").lower() != "posted":
            raise HTTPException(status_code=400, detail="Only posted journals can be reversed.")
        if original["reversed_entry_id"]:
            raise HTTPException(status_code=400, detail="Journal is already reversed.")

        lines = conn.execute(
            "SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_no, id",
            (journal_id,)
        ).fetchall()
        if not lines:
            raise HTTPException(status_code=400, detail="Cannot reverse a journal without lines.")

        reversal_date = (request.reversal_date if request else None) or datetime.now().date().isoformat()
        reason = (request.reversal_reason if request else None) or f"Reversal of {original['journal_number']}"
        now = datetime.now().isoformat()
        rev_number = _gl_next_journal_number(conn, school_id, "RV")
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO journal_entries (
                school_id, journal_number, entry_date, description, reference, period_id, status,
                total_debit, total_credit, posted_at, posted_by, reversed_entry_id,
                created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id, rev_number, reversal_date, f"Reversal: {original['description'] or ''}".strip(),
                original["reference"], original["period_id"], float(original["total_credit"] or 0),
                float(original["total_debit"] or 0), now, x_user_id, journal_id, x_user_id, now, now
            )
        )
        reversal_id = cur.lastrowid
        line_no = 1
        for l in lines:
            cur.execute(
                """
                INSERT INTO journal_lines (
                    journal_entry_id, line_no, account_id, description, debit, credit, cost_center_id, tax_code_id, party_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reversal_id, line_no, l["account_id"], l["description"], float(l["credit"] or 0),
                    float(l["debit"] or 0), l["cost_center_id"], l["tax_code_id"], l["party_id"]
                )
            )
            line_no += 1

        conn.execute(
            """
            UPDATE journal_entries
            SET status = 'Reversed', reversed_entry_id = ?, reversed_at = ?, reversed_by = ?, reversal_reason = ?, updated_at = ?
            WHERE id = ?
            """,
            (reversal_id, now, x_user_id, reason, now, journal_id)
        )
        conn.commit()
        return {
            "message": "Journal reversed successfully.",
            "original_journal_id": journal_id,
            "reversal_journal_id": reversal_id
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to reverse journal: {str(e)}")
    finally:
        conn.close()

def _gl_build_filters(period_id: Optional[int], date_from: Optional[str], date_to: Optional[str]) -> (str, List[Any]):
    clauses = ["je.status = 'Posted'"]
    params: List[Any] = []
    if period_id:
        clauses.append("je.period_id = ?")
        params.append(period_id)
    if date_from:
        clauses.append("je.entry_date >= ?")
        params.append(date_from)
    if date_to:
        clauses.append("je.entry_date <= ?")
        params.append(date_to)
    return " AND ".join(clauses), params

@router.get("/api/finance/gl/reports/trial-balance")
@router.get("/finance/gl/reports/trial-balance")
async def get_gl_trial_balance(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance_reports_read", "finance_view", "finance_gl_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        filter_sql, filter_params = _gl_build_filters(period_id, date_from, date_to)
        rows = conn.execute(
            f"""
            SELECT
                a.id AS account_id,
                a.code AS account_code,
                a.name AS account_name,
                a.account_type,
                COALESCE(SUM(jl.debit), 0) AS total_debit,
                COALESCE(SUM(jl.credit), 0) AS total_credit
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND {filter_sql}
            GROUP BY a.id, a.code, a.name, a.account_type
            ORDER BY a.code
            """,
            (school_id, *filter_params)
        ).fetchall()
        data = []
        debit_total = 0.0
        credit_total = 0.0
        for r in rows:
            td = float(r["total_debit"] or 0)
            tc = float(r["total_credit"] or 0)
            debit_total += td
            credit_total += tc
            data.append({
                "account_id": r["account_id"],
                "account_code": r["account_code"],
                "account_name": r["account_name"],
                "account_type": r["account_type"],
                "total_debit": round(td, 2),
                "total_credit": round(tc, 2),
                "net_balance": round(td - tc, 2)
            })
        return {
            "filters": {"period_id": period_id, "date_from": date_from, "date_to": date_to},
            "rows": data,
            "totals": {
                "debit_total": round(debit_total, 2),
                "credit_total": round(credit_total, 2),
                "is_balanced": abs(debit_total - credit_total) <= 0.0001
            }
        }
    finally:
        conn.close()

@router.get("/api/finance/gl/reports/profit-loss")
@router.get("/finance/gl/reports/profit-loss")
async def get_gl_profit_and_loss(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance_reports_read", "finance_view", "finance_gl_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        filter_sql, filter_params = _gl_build_filters(period_id, date_from, date_to)
        rows = conn.execute(
            f"""
            SELECT a.code, a.name, a.account_type,
                   COALESCE(SUM(jl.debit), 0) AS total_debit,
                   COALESCE(SUM(jl.credit), 0) AS total_credit
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND {filter_sql} AND a.account_type IN ('Revenue', 'Expense')
            GROUP BY a.code, a.name, a.account_type
            ORDER BY a.code
            """,
            (school_id, *filter_params)
        ).fetchall()
        revenues = []
        expenses = []
        total_revenue = 0.0
        total_expense = 0.0
        for r in rows:
            debit = float(r["total_debit"] or 0)
            credit = float(r["total_credit"] or 0)
            if r["account_type"] == "Revenue":
                amount = round(credit - debit, 2)
                revenues.append({"account_code": r["code"], "account_name": r["name"], "amount": amount})
                total_revenue += amount
            else:
                amount = round(debit - credit, 2)
                expenses.append({"account_code": r["code"], "account_name": r["name"], "amount": amount})
                total_expense += amount
        return {
            "filters": {"period_id": period_id, "date_from": date_from, "date_to": date_to},
            "revenues": revenues,
            "expenses": expenses,
            "totals": {
                "total_revenue": round(total_revenue, 2),
                "total_expense": round(total_expense, 2),
                "net_profit": round(total_revenue - total_expense, 2)
            }
        }
    finally:
        conn.close()

@router.get("/api/finance/gl/reports/balance-sheet")
@router.get("/finance/gl/reports/balance-sheet")
async def get_gl_balance_sheet(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance_reports_read", "finance_view", "finance_gl_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        filter_sql, filter_params = _gl_build_filters(period_id, date_from, date_to)
        rows = conn.execute(
            f"""
            SELECT a.code, a.name, a.account_type,
                   COALESCE(SUM(jl.debit), 0) AS total_debit,
                   COALESCE(SUM(jl.credit), 0) AS total_credit
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND {filter_sql}
              AND a.account_type IN ('Asset', 'Liability', 'Equity')
            GROUP BY a.code, a.name, a.account_type
            ORDER BY a.code
            """,
            (school_id, *filter_params)
        ).fetchall()
        assets = []
        liabilities = []
        equity = []
        total_assets = 0.0
        total_liabilities = 0.0
        total_equity = 0.0
        for r in rows:
            debit = float(r["total_debit"] or 0)
            credit = float(r["total_credit"] or 0)
            if r["account_type"] == "Asset":
                bal = round(debit - credit, 2)
                assets.append({"account_code": r["code"], "account_name": r["name"], "balance": bal})
                total_assets += bal
            elif r["account_type"] == "Liability":
                bal = round(credit - debit, 2)
                liabilities.append({"account_code": r["code"], "account_name": r["name"], "balance": bal})
                total_liabilities += bal
            else:
                bal = round(credit - debit, 2)
                equity.append({"account_code": r["code"], "account_name": r["name"], "balance": bal})
                total_equity += bal
        return {
            "filters": {"period_id": period_id, "date_from": date_from, "date_to": date_to},
            "assets": assets,
            "liabilities": liabilities,
            "equity": equity,
            "totals": {
                "total_assets": round(total_assets, 2),
                "total_liabilities": round(total_liabilities, 2),
                "total_equity": round(total_equity, 2),
                "balanced": abs(total_assets - (total_liabilities + total_equity)) <= 0.01
            }
        }
    finally:
        conn.close()

def _next_doc_number(conn, school_id: int, table_name: str, column_name: str, prefix: str) -> str:
    row = conn.execute(
        f"SELECT {column_name} AS val FROM {table_name} WHERE school_id = ? AND {column_name} LIKE ? ORDER BY {column_name} DESC LIMIT 1",
        (school_id, prefix + "%")
    ).fetchone()
    if not row or not row["val"]:
        return f"{prefix}0001"
    try:
        last_seq = int(str(row["val"]).replace(prefix, ""))
    except Exception:
        last_seq = 0
    return f"{prefix}{last_seq + 1:04d}"

def _finance_log_audit(conn, school_id: int, module: str, action: str, entity_type: str, entity_id: Any, actor_id: Optional[str], details: Dict[str, Any]):
    conn.execute(
        """
        INSERT INTO finance_audit_logs (school_id, module, action, entity_type, entity_id, actor_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (school_id, module, action, entity_type, str(entity_id) if entity_id is not None else None, actor_id, json.dumps(details or {}), datetime.now().isoformat())
    )

def _finance_account_id_by_code(conn, school_id: int, code: str) -> int:
    row = conn.execute("SELECT id FROM accounts WHERE school_id = ? AND code = ? AND is_active = TRUE", (school_id, code)).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail=f"Account code {code} not configured.")
    return int(row["id"])

def _finance_posting_service(
    conn,
    school_id: int,
    user_id: str,
    module: str,
    transaction_type: str,
    source_ref: str,
    amount: float,
    description: str,
    entry_date: Optional[str],
    idempotency_key: str,
    debit_account_id: Optional[int] = None,
    credit_account_id: Optional[int] = None
) -> Dict[str, Any]:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Posting amount must be greater than zero.")
    existing = conn.execute(
        "SELECT id, journal_entry_id, status FROM finance_posting_events WHERE school_id = ? AND idempotency_key = ?",
        (school_id, idempotency_key)
    ).fetchone()
    if existing:
        return {"already_posted": True, "event_id": existing["id"], "journal_entry_id": existing["journal_entry_id"], "status": existing["status"]}
    if debit_account_id is None or credit_account_id is None:
        rule = conn.execute(
            """
            SELECT debit_account_id, credit_account_id
            FROM finance_posting_rules
            WHERE school_id = ? AND module = ? AND transaction_type = ? AND is_active = TRUE
            """,
            (school_id, module, transaction_type)
        ).fetchone()
        if not rule:
            raise HTTPException(status_code=400, detail=f"No active posting rule for {module}:{transaction_type}")
        debit_account_id = int(rule["debit_account_id"])
        credit_account_id = int(rule["credit_account_id"])
    journal_number = _gl_next_journal_number(conn, school_id, "GL")
    now = datetime.now().isoformat()
    entry_dt = entry_date or datetime.now().date().isoformat()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO journal_entries (
            school_id, journal_number, entry_date, description, reference, status,
            total_debit, total_credit, posted_at, posted_by, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?, ?, ?)
        """,
        (school_id, journal_number, entry_dt, description, source_ref, amount, amount, now, user_id, user_id, now, now)
    )
    journal_id = cur.lastrowid
    cur.execute("INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit) VALUES (?, 1, ?, ?, ?, 0)", (journal_id, debit_account_id, description, amount))
    cur.execute("INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit) VALUES (?, 2, ?, ?, 0, ?)", (journal_id, credit_account_id, description, amount))
    cur.execute(
        """
        INSERT INTO finance_posting_events (
            school_id, module, transaction_type, source_ref, idempotency_key, amount, status, journal_entry_id, event_payload, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?)
        """,
        (school_id, module, transaction_type, source_ref, idempotency_key, amount, journal_id, json.dumps({"description": description}), user_id, now)
    )
    event_id = cur.lastrowid
    return {"already_posted": False, "event_id": event_id, "journal_entry_id": journal_id, "status": "Posted"}

def _group_aging(records: List[Dict[str, Any]], amount_key: str, date_key: str) -> Dict[str, float]:
    buckets = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
    today = datetime.now().date()
    for r in records:
        amt = float(r.get(amount_key) or 0)
        if amt <= 0:
            continue
        try:
            due = datetime.fromisoformat(str(r.get(date_key))).date()
        except Exception:
            due = today
        age = (today - due).days
        if age <= 30:
            buckets["0_30"] += amt
        elif age <= 60:
            buckets["31_60"] += amt
        elif age <= 90:
            buckets["61_90"] += amt
        else:
            buckets["90_plus"] += amt
    return {k: round(v, 2) for k, v in buckets.items()}

@router.get("/api/finance/domain")
async def get_finance_parent_domain(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_view", "finance_dashboard_read", "finance_reports_read"], x_user_id)
    return {"domain": "finance", "submodules": ["payroll", "general-ledger", "receivables", "payables", "inventory", "assets"]}

@router.get("/api/finance/posting-rules")
async def list_posting_rules(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_posting_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute(
            """
            SELECT pr.*, da.code AS debit_code, da.name AS debit_name, ca.code AS credit_code, ca.name AS credit_name
            FROM finance_posting_rules pr
            JOIN accounts da ON da.id = pr.debit_account_id
            JOIN accounts ca ON ca.id = pr.credit_account_id
            WHERE pr.school_id = ?
            ORDER BY pr.module, pr.transaction_type
            """,
            (school_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/posting-rules")
async def upsert_posting_rule(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_posting_manage", "finance_manage"], x_user_id)
    required = ["module", "transaction_type", "debit_account_id", "credit_account_id"]
    if any(payload.get(k) in (None, "") for k in required):
        raise HTTPException(status_code=400, detail="module, transaction_type, debit_account_id and credit_account_id are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        existing = conn.execute(
            "SELECT id FROM finance_posting_rules WHERE school_id = ? AND module = ? AND transaction_type = ?",
            (school_id, payload["module"], payload["transaction_type"])
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE finance_posting_rules SET debit_account_id = ?, credit_account_id = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?",
                (int(payload["debit_account_id"]), int(payload["credit_account_id"]), payload.get("description"), _as_bool(payload.get("is_active"), True), now, existing["id"])
            )
            rule_id = existing["id"]
        else:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO finance_posting_rules (school_id, module, transaction_type, debit_account_id, credit_account_id, description, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (school_id, payload["module"], payload["transaction_type"], int(payload["debit_account_id"]), int(payload["credit_account_id"]), payload.get("description"), _as_bool(payload.get("is_active"), True), x_user_id, now, now)
            )
            rule_id = cur.lastrowid
        _finance_log_audit(conn, school_id, "posting", "upsert_rule", "finance_posting_rules", rule_id, x_user_id, payload)
        conn.commit()
        return dict(conn.execute("SELECT * FROM finance_posting_rules WHERE id = ?", (rule_id,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/periods/{period_id}/close")
async def close_period(period_id: int, payload: Dict[str, Any] = Body(default={}), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_period_close", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        period = conn.execute("SELECT * FROM periods WHERE id = ? AND school_id = ?", (period_id, school_id)).fetchone()
        if not period:
            raise HTTPException(status_code=404, detail="Period not found.")
        conn.execute("UPDATE periods SET status = 'Closed', updated_at = ? WHERE id = ?", (datetime.now().isoformat(), period_id))
        _finance_log_audit(conn, school_id, "controls", "period_close", "periods", period_id, x_user_id, {"notes": payload.get("notes")})
        conn.commit()
        return {"message": "Period closed successfully.", "period_id": period_id}
    finally:
        conn.close()

@router.get("/api/finance/audit-logs")
async def get_finance_audit_logs(limit: int = 100, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_audit_read", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM finance_audit_logs WHERE school_id = ? ORDER BY id DESC LIMIT ?", (school_id, max(1, min(limit, 500)))).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/api/finance/reconciliation/check")
async def run_finance_reconciliation(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_reports_read", "finance_view", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        ar_subledger_row = conn.execute(
            """
            SELECT
              COALESCE((SELECT SUM(total_amount) FROM ar_invoices WHERE school_id = ? AND status IN ('Posted','Partially_Paid','Paid','Overdue')),0) -
              COALESCE((SELECT SUM(amount) FROM ar_receipts WHERE school_id = ?),0) AS val
            """,
            (school_id, school_id)
        ).fetchone()
        ap_subledger_row = conn.execute(
            """
            SELECT
              COALESCE((SELECT SUM(total_amount) FROM ap_bills WHERE school_id = ? AND status IN ('Posted','Partially_Paid','Paid','Overdue')),0) -
              COALESCE((SELECT SUM(amount) FROM ap_payments WHERE school_id = ?),0) AS val
            """,
            (school_id, school_id)
        ).fetchone()
        inv_subledger_row = conn.execute(
            "SELECT COALESCE(SUM(valuation_amount),0) AS val FROM stock_valuation WHERE school_id = ?",
            (school_id,)
        ).fetchone()
        ar_gl = conn.execute(
            """
            SELECT COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS val
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND je.status = 'Posted' AND a.code = '1100'
            """,
            (school_id,)
        ).fetchone()
        ap_gl = conn.execute(
            """
            SELECT COALESCE(SUM(jl.credit),0) - COALESCE(SUM(jl.debit),0) AS val
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND je.status = 'Posted' AND a.code = '2000'
            """,
            (school_id,)
        ).fetchone()
        inv_gl = conn.execute(
            """
            SELECT COALESCE(SUM(jl.debit),0) - COALESCE(SUM(jl.credit),0) AS val
            FROM journal_lines jl
            JOIN journal_entries je ON je.id = jl.journal_entry_id
            JOIN accounts a ON a.id = jl.account_id
            WHERE je.school_id = ? AND je.status = 'Posted' AND a.code = '1200'
            """,
            (school_id,)
        ).fetchone()
        ar_subledger = round(float(ar_subledger_row["val"] or 0), 2)
        ap_subledger = round(float(ap_subledger_row["val"] or 0), 2)
        inv_subledger = round(float(inv_subledger_row["val"] or 0), 2)
        ar_gl_val = round(float(ar_gl["val"] or 0), 2)
        ap_gl_val = round(float(ap_gl["val"] or 0), 2)
        inv_gl_val = round(float(inv_gl["val"] or 0), 2)
        return {
            "ar": {"subledger": ar_subledger, "gl_control": ar_gl_val, "difference": round(ar_subledger - ar_gl_val, 2), "matched": abs(ar_subledger - ar_gl_val) <= 0.01},
            "ap": {"subledger": ap_subledger, "gl_control": ap_gl_val, "difference": round(ap_subledger - ap_gl_val, 2), "matched": abs(ap_subledger - ap_gl_val) <= 0.01},
            "inventory": {"subledger": inv_subledger, "gl_control": inv_gl_val, "difference": round(inv_subledger - inv_gl_val, 2), "matched": abs(inv_subledger - inv_gl_val) <= 0.01}
        }
    finally:
        conn.close()

# --- Receivables ---
@router.get("/api/finance/receivables/customers")
async def list_customers(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_receivables_manage", "finance_invoices", "finance_fees_child_read"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM customers WHERE school_id = ? ORDER BY name", (school_id,)).fetchall()]
    finally:
        conn.close()

@router.post("/api/finance/receivables/customers")
async def create_customer(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_receivables_manage", "finance_invoices"], x_user_id)
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        code = payload.get("customer_code") or _next_doc_number(conn, school_id, "customers", "customer_code", "CUST-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO customers (school_id, customer_code, name, email, phone, address, tax_identifier, linked_student_id, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (school_id, code, payload["name"], payload.get("email"), payload.get("phone"), payload.get("address"), payload.get("tax_identifier"), payload.get("linked_student_id"), _as_bool(payload.get("is_active"), True), x_user_id, now, now)
        )
        cid = cur.lastrowid
        _finance_log_audit(conn, school_id, "receivables", "create_customer", "customers", cid, x_user_id, payload)
        conn.commit()
        return dict(conn.execute("SELECT * FROM customers WHERE id = ?", (cid,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/receivables/invoices")
async def create_ar_invoice(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_receivables_manage", "finance_invoices"], x_user_id)
    lines = payload.get("lines") or []
    if not payload.get("customer_id") or not payload.get("invoice_date") or not payload.get("due_date") or not lines:
        raise HTTPException(status_code=400, detail="customer_id, invoice_date, due_date, and lines are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        inv_no = payload.get("invoice_number") or _next_doc_number(conn, school_id, "ar_invoices", "invoice_number", "ARINV-")
        now = datetime.now().isoformat()
        subtotal = 0.0
        tax_total = 0.0
        prepared = []
        for idx, l in enumerate(lines, start=1):
            qty = float(l.get("quantity", 1))
            up = float(l.get("unit_price", 0))
            tr = float(l.get("tax_rate", 0))
            line_amt = round(qty * up, 2)
            tax_amt = round(line_amt * tr / 100.0, 2)
            total = round(line_amt + tax_amt, 2)
            subtotal += line_amt
            tax_total += tax_amt
            prepared.append((idx, l, line_amt, tax_amt, total))
        total_amount = round(subtotal + tax_total, 2)
        rev_acc = int(payload.get("revenue_account_id") or _finance_account_id_by_code(conn, school_id, "4000"))
        ar_acc = int(payload.get("ar_account_id") or _finance_account_id_by_code(conn, school_id, "1100"))
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO ar_invoices (school_id, invoice_number, customer_id, invoice_date, due_date, subtotal, tax_amount, total_amount, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)",
            (school_id, inv_no, int(payload["customer_id"]), payload["invoice_date"], payload["due_date"], round(subtotal, 2), round(tax_total, 2), total_amount, x_user_id, now, now)
        )
        invoice_id = cur.lastrowid
        for line_no, l, line_amt, tax_amt, total in prepared:
            cur.execute(
                "INSERT INTO ar_invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_code_id, tax_rate, line_amount, tax_amount, total_amount, revenue_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (invoice_id, line_no, l.get("description") or f"Line {line_no}", float(l.get('quantity', 1)), float(l.get('unit_price', 0)), l.get("tax_code_id"), float(l.get("tax_rate", 0)), line_amt, tax_amt, total, rev_acc)
            )
        post = _finance_posting_service(conn, school_id, x_user_id, "receivables", "AR_INVOICE", f"ARINV:{invoice_id}", total_amount, f"AR Invoice {inv_no}", payload["invoice_date"], payload.get("idempotency_key") or f"ar_invoice_{invoice_id}", ar_acc, rev_acc)
        conn.execute("UPDATE ar_invoices SET gl_journal_id = ?, updated_at = ? WHERE id = ?", (post["journal_entry_id"], now, invoice_id))
        _finance_log_audit(conn, school_id, "receivables", "create_invoice", "ar_invoices", invoice_id, x_user_id, {"invoice_number": inv_no, "total_amount": total_amount})
        conn.commit()
        return {"invoice": dict(conn.execute("SELECT * FROM ar_invoices WHERE id = ?", (invoice_id,)).fetchone()), "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.post("/api/finance/receivables/receipts")
async def create_ar_receipt(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_receivables_manage", "finance_invoices"], x_user_id)
    if not payload.get("customer_id") or not payload.get("receipt_date") or float(payload.get("amount", 0)) <= 0:
        raise HTTPException(status_code=400, detail="customer_id, receipt_date and positive amount are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rcpt_no = payload.get("receipt_number") or _next_doc_number(conn, school_id, "ar_receipts", "receipt_number", "ARRCPT-")
        amount = round(float(payload["amount"]), 2)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO ar_receipts (school_id, receipt_number, customer_id, invoice_id, receipt_date, amount, method, reference, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?)",
            (school_id, rcpt_no, int(payload["customer_id"]), payload.get("invoice_id"), payload["receipt_date"], amount, payload.get("method"), payload.get("reference"), x_user_id, now)
        )
        rid = cur.lastrowid
        cash_acc = int(payload.get("cash_account_id") or _finance_account_id_by_code(conn, school_id, "1000"))
        ar_acc = int(payload.get("ar_account_id") or _finance_account_id_by_code(conn, school_id, "1100"))
        post = _finance_posting_service(conn, school_id, x_user_id, "receivables", "AR_RECEIPT", f"ARRCPT:{rid}", amount, f"AR Receipt {rcpt_no}", payload["receipt_date"], payload.get("idempotency_key") or f"ar_receipt_{rid}", cash_acc, ar_acc)
        conn.execute("UPDATE ar_receipts SET gl_journal_id = ? WHERE id = ?", (post["journal_entry_id"], rid))
        if payload.get("invoice_id"):
            inv = conn.execute("SELECT total_amount FROM ar_invoices WHERE id = ?", (payload["invoice_id"],)).fetchone()
            paid = conn.execute("SELECT COALESCE(SUM(amount),0) AS paid FROM ar_receipts WHERE invoice_id = ?", (payload["invoice_id"],)).fetchone()
            new_status = "Paid" if inv and float(paid["paid"] or 0) >= float(inv["total_amount"] or 0) else "Partially_Paid"
            conn.execute("UPDATE ar_invoices SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, payload["invoice_id"]))
        _finance_log_audit(conn, school_id, "receivables", "create_receipt", "ar_receipts", rid, x_user_id, {"receipt_number": rcpt_no, "amount": amount})
        conn.commit()
        return {"receipt": dict(conn.execute("SELECT * FROM ar_receipts WHERE id = ?", (rid,)).fetchone()), "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.get("/api/finance/receivables/reports/aging")
async def get_ar_aging(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_receivables_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute(
            "SELECT ai.invoice_number, ai.due_date, ai.total_amount, COALESCE((SELECT SUM(amount) FROM ar_receipts r WHERE r.invoice_id = ai.id),0) AS paid_amount FROM ar_invoices ai WHERE ai.school_id = ? AND ai.status IN ('Posted','Partially_Paid','Overdue')",
            (school_id,)
        ).fetchall()
        data = []
        for r in rows:
            outstanding = round(float(r["total_amount"] or 0) - float(r["paid_amount"] or 0), 2)
            if outstanding > 0:
                data.append({"invoice_number": r["invoice_number"], "due_date": r["due_date"], "outstanding": outstanding})
        return {"rows": data, "aging": _group_aging(data, "outstanding", "due_date")}
    finally:
        conn.close()

# --- Payables ---
@router.get("/api/finance/payables/vendors")
async def list_vendors(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_payables_approve"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM vendors WHERE school_id = ? ORDER BY name", (school_id,)).fetchall()]
    finally:
        conn.close()

@router.post("/api/finance/payables/vendors")
async def create_vendor(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_payables_approve"], x_user_id)
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        code = payload.get("vendor_code") or _next_doc_number(conn, school_id, "vendors", "vendor_code", "VEND-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO vendors (school_id, vendor_code, name, email, phone, address, tax_identifier, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (school_id, code, payload["name"], payload.get("email"), payload.get("phone"), payload.get("address"), payload.get("tax_identifier"), _as_bool(payload.get("is_active"), True), x_user_id, now, now)
        )
        vid = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM vendors WHERE id = ?", (vid,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/payables/bills")
async def create_ap_bill(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_payables_approve"], x_user_id)
    lines = payload.get("lines") or []
    if not payload.get("vendor_id") or not payload.get("bill_date") or not payload.get("due_date") or not lines:
        raise HTTPException(status_code=400, detail="vendor_id, bill_date, due_date and lines are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        bill_no = payload.get("bill_number") or _next_doc_number(conn, school_id, "ap_bills", "bill_number", "APBILL-")
        now = datetime.now().isoformat()
        subtotal = tax_total = 0.0
        prepared = []
        for idx, l in enumerate(lines, start=1):
            qty = float(l.get("quantity", 1)); up = float(l.get("unit_price", 0)); tr = float(l.get("tax_rate", 0))
            line_amt = round(qty * up, 2); tax_amt = round(line_amt * tr / 100.0, 2); total = round(line_amt + tax_amt, 2)
            subtotal += line_amt; tax_total += tax_amt; prepared.append((idx, l, line_amt, tax_amt, total))
        total_amount = round(subtotal + tax_total, 2)
        exp_acc = int(payload.get("expense_account_id") or _finance_account_id_by_code(conn, school_id, "5100"))
        ap_acc = int(payload.get("ap_account_id") or _finance_account_id_by_code(conn, school_id, "2000"))
        cur = conn.cursor()
        cur.execute("INSERT INTO ap_bills (school_id, bill_number, vendor_id, bill_date, due_date, subtotal, tax_amount, total_amount, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)", (school_id, bill_no, int(payload["vendor_id"]), payload["bill_date"], payload["due_date"], round(subtotal, 2), round(tax_total, 2), total_amount, x_user_id, now, now))
        bid = cur.lastrowid
        for line_no, l, line_amt, tax_amt, total in prepared:
            cur.execute("INSERT INTO ap_bill_lines (bill_id, line_no, description, quantity, unit_price, tax_code_id, tax_rate, line_amount, tax_amount, total_amount, expense_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (bid, line_no, l.get("description") or f"Line {line_no}", float(l.get("quantity", 1)), float(l.get("unit_price", 0)), l.get("tax_code_id"), float(l.get("tax_rate", 0)), line_amt, tax_amt, total, exp_acc))
        post = _finance_posting_service(conn, school_id, x_user_id, "payables", "AP_BILL", f"APBILL:{bid}", total_amount, f"AP Bill {bill_no}", payload["bill_date"], payload.get("idempotency_key") or f"ap_bill_{bid}", exp_acc, ap_acc)
        conn.execute("UPDATE ap_bills SET gl_journal_id = ? WHERE id = ?", (post["journal_entry_id"], bid))
        conn.commit()
        return {"bill": dict(conn.execute("SELECT * FROM ap_bills WHERE id = ?", (bid,)).fetchone()), "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.post("/api/finance/payables/payments")
async def create_ap_payment(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_payables_approve"], x_user_id)
    if not payload.get("vendor_id") or not payload.get("payment_date") or float(payload.get("amount", 0)) <= 0:
        raise HTTPException(status_code=400, detail="vendor_id, payment_date and positive amount are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        pay_no = payload.get("payment_number") or _next_doc_number(conn, school_id, "ap_payments", "payment_number", "APPAY-")
        amount = round(float(payload["amount"]), 2)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO ap_payments (school_id, payment_number, vendor_id, bill_id, payment_date, amount, method, reference, status, created_by, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)", (school_id, pay_no, int(payload["vendor_id"]), payload.get("bill_id"), payload["payment_date"], amount, payload.get("method"), payload.get("reference"), x_user_id, payload.get("approved_by"), now))
        pid = cur.lastrowid
        ap_acc = int(payload.get("ap_account_id") or _finance_account_id_by_code(conn, school_id, "2000"))
        cash_acc = int(payload.get("cash_account_id") or _finance_account_id_by_code(conn, school_id, "1000"))
        post = _finance_posting_service(conn, school_id, x_user_id, "payables", "AP_PAYMENT", f"APPAY:{pid}", amount, f"AP Payment {pay_no}", payload["payment_date"], payload.get("idempotency_key") or f"ap_payment_{pid}", ap_acc, cash_acc)
        conn.execute("UPDATE ap_payments SET gl_journal_id = ? WHERE id = ?", (post["journal_entry_id"], pid))
        conn.commit()
        return {"payment": dict(conn.execute("SELECT * FROM ap_payments WHERE id = ?", (pid,)).fetchone()), "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.get("/api/finance/payables/reports/aging")
async def get_ap_aging(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT b.bill_number, b.due_date, b.total_amount, COALESCE((SELECT SUM(amount) FROM ap_payments p WHERE p.bill_id = b.id),0) AS paid_amount FROM ap_bills b WHERE b.school_id = ? AND b.status IN ('Posted','Partially_Paid','Overdue')", (school_id,)).fetchall()
        data = []
        for r in rows:
            outstanding = round(float(r["total_amount"] or 0) - float(r["paid_amount"] or 0), 2)
            if outstanding > 0:
                data.append({"bill_number": r["bill_number"], "due_date": r["due_date"], "outstanding": outstanding})
        return {"rows": data, "aging": _group_aging(data, "outstanding", "due_date")}
    finally:
        conn.close()

@router.get("/api/finance/payables/alerts/due")
async def get_ap_due_alerts(days: int = 7, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payables_manage", "finance_payables_approve"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        bills = conn.execute("SELECT b.*, v.name AS vendor_name FROM ap_bills b JOIN vendors v ON v.id = b.vendor_id WHERE b.school_id = ? AND b.status IN ('Posted','Partially_Paid') ORDER BY b.due_date", (school_id,)).fetchall()
        today = datetime.now().date()
        alerts = []
        for b in bills:
            try:
                delta = (datetime.fromisoformat(str(b["due_date"])).date() - today).days
            except Exception:
                continue
            if delta <= days:
                alerts.append({**dict(b), "days_to_due": delta})
        return alerts
    finally:
        conn.close()

# --- Inventory ---
@router.post("/api/finance/inventory/items")
async def create_inventory_item(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_inventory_manage", "finance_manage"], x_user_id)
    if not payload.get("item_name"):
        raise HTTPException(status_code=400, detail="item_name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        item_code = payload.get("item_code") or _next_doc_number(conn, school_id, "items", "item_code", "ITEM-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO items (school_id, item_code, item_name, category, unit, cost_price, sale_price, inventory_account_id, cogs_account_id, expense_account_id, revenue_account_id, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (school_id, item_code, payload["item_name"], payload.get("category"), payload.get("unit", "Unit"), float(payload.get("cost_price", 0)), float(payload.get("sale_price", 0)), payload.get("inventory_account_id"), payload.get("cogs_account_id"), payload.get("expense_account_id"), payload.get("revenue_account_id"), _as_bool(payload.get("is_active"), True), x_user_id, now, now)
        )
        item_id = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/inventory/warehouses")
async def create_warehouse(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_inventory_manage", "finance_manage"], x_user_id)
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        code = payload.get("code") or _next_doc_number(conn, school_id, "warehouses", "code", "WH-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO warehouses (school_id, code, name, location, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (school_id, code, payload["name"], payload.get("location"), _as_bool(payload.get("is_active"), True), x_user_id, now, now))
        wid = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM warehouses WHERE id = ?", (wid,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/inventory/stock-moves")
async def create_stock_move(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_inventory_manage", "finance_manage"], x_user_id)
    required = ["item_id", "warehouse_id", "move_type", "quantity", "move_date"]
    if any(payload.get(k) in (None, "") for k in required):
        raise HTTPException(status_code=400, detail="item_id, warehouse_id, move_type, quantity, move_date are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        move_no = payload.get("move_number") or _next_doc_number(conn, school_id, "stock_moves", "move_number", "SM-")
        qty = float(payload["quantity"])
        unit_cost = float(payload.get("unit_cost", 0))
        total_cost = round(qty * unit_cost, 2)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO stock_moves (school_id, move_number, item_id, warehouse_id, move_type, quantity, unit_cost, total_cost, reference_type, reference_id, move_date, status, created_by, approved_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?)", (school_id, move_no, int(payload["item_id"]), int(payload["warehouse_id"]), payload["move_type"], qty, unit_cost, total_cost, payload.get("reference_type"), payload.get("reference_id"), payload["move_date"], x_user_id, payload.get("approved_by"), now))
        move_id = cur.lastrowid
        val = conn.execute("SELECT * FROM stock_valuation WHERE school_id = ? AND item_id = ? AND warehouse_id = ?", (school_id, int(payload["item_id"]), int(payload["warehouse_id"]))).fetchone()
        old_qty = float(val["quantity_on_hand"]) if val else 0.0
        old_avg = float(val["average_cost"]) if val else 0.0
        move_type = payload["move_type"]
        if move_type in ("purchase_receipt", "transfer_in", "adjustment"):
            new_qty = old_qty + qty
            new_avg = ((old_qty * old_avg) + (qty * unit_cost)) / new_qty if new_qty > 0 else unit_cost
        else:
            new_qty = old_qty - qty
            new_avg = old_avg
        if new_qty < 0:
            raise HTTPException(status_code=400, detail="Insufficient stock.")
        valuation = round(new_qty * new_avg, 2)
        if val:
            conn.execute("UPDATE stock_valuation SET quantity_on_hand = ?, average_cost = ?, valuation_amount = ?, updated_at = ? WHERE id = ?", (round(new_qty, 4), round(new_avg, 4), valuation, now, val["id"]))
        else:
            conn.execute("INSERT INTO stock_valuation (school_id, item_id, warehouse_id, quantity_on_hand, average_cost, valuation_amount, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (school_id, int(payload["item_id"]), int(payload["warehouse_id"]), round(new_qty, 4), round(new_avg, 4), valuation, now))
        gl_link = None
        inv_acc = _finance_account_id_by_code(conn, school_id, "1200")
        cogs_acc = _finance_account_id_by_code(conn, school_id, "5100")
        ap_acc = _finance_account_id_by_code(conn, school_id, "2000")
        if move_type == "purchase_receipt":
            gl_link = _finance_posting_service(conn, school_id, x_user_id, "inventory", "INVENTORY_PURCHASE", f"STOCK:{move_id}", total_cost, f"Inventory purchase {move_no}", payload["move_date"], payload.get("idempotency_key") or f"inventory_purchase_{move_id}", inv_acc, ap_acc)
        elif move_type in ("issue_sale", "transfer_out", "adjustment"):
            gl_link = _finance_posting_service(conn, school_id, x_user_id, "inventory", "INVENTORY_ISSUE", f"STOCK:{move_id}", abs(total_cost), f"Inventory issue {move_no}", payload["move_date"], payload.get("idempotency_key") or f"inventory_issue_{move_id}", cogs_acc, inv_acc)
        if gl_link:
            conn.execute("UPDATE stock_moves SET gl_journal_id = ? WHERE id = ?", (gl_link["journal_entry_id"], move_id))
        conn.commit()
        return {"stock_move": dict(conn.execute("SELECT * FROM stock_moves WHERE id = ?", (move_id,)).fetchone()), "posting": gl_link}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.get("/api/finance/inventory/reports/valuation")
async def get_inventory_valuation(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_inventory_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT sv.*, i.item_code, i.item_name, w.code AS warehouse_code, w.name AS warehouse_name FROM stock_valuation sv JOIN items i ON i.id = sv.item_id JOIN warehouses w ON w.id = sv.warehouse_id WHERE sv.school_id = ? ORDER BY i.item_code, w.code", (school_id,)).fetchall()
        return {"rows": [dict(r) for r in rows], "total_valuation": round(sum(float(r["valuation_amount"] or 0) for r in rows), 2)}
    finally:
        conn.close()

# --- Assets ---
@router.post("/api/finance/assets/categories")
async def create_asset_category(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_manage"], x_user_id)
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        code = payload.get("code") or _next_doc_number(conn, school_id, "asset_categories", "code", "AC-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO asset_categories (school_id, code, name, useful_life_months, depreciation_method, asset_account_id, depreciation_expense_account_id, accumulated_depreciation_account_id, disposal_gain_loss_account_id, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (school_id, code, payload["name"], int(payload.get("useful_life_months", 60)), payload.get("depreciation_method", "SLM"), payload.get("asset_account_id"), payload.get("depreciation_expense_account_id"), payload.get("accumulated_depreciation_account_id"), payload.get("disposal_gain_loss_account_id"), _as_bool(payload.get("is_active"), True), x_user_id, now, now))
        cat_id = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM asset_categories WHERE id = ?", (cat_id,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/assets/fixed-assets")
async def create_fixed_asset(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_manage"], x_user_id)
    required = ["asset_name", "category_id", "acquisition_date", "capitalization_date", "cost"]
    if any(payload.get(k) in (None, "") for k in required):
        raise HTTPException(status_code=400, detail="asset_name, category_id, acquisition_date, capitalization_date and cost are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cost = round(float(payload["cost"]), 2)
        asset_code = payload.get("asset_code") or _next_doc_number(conn, school_id, "fixed_assets", "asset_code", "FA-")
        cur = conn.cursor()
        cur.execute("INSERT INTO fixed_assets (school_id, asset_code, asset_name, category_id, acquisition_date, capitalization_date, cost, residual_value, useful_life_months, depreciation_method, status, location, assigned_to, accumulated_depreciation, carrying_amount, created_by, approved_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, 0, ?, ?, ?, ?, ?)", (school_id, asset_code, payload["asset_name"], int(payload["category_id"]), payload["acquisition_date"], payload["capitalization_date"], cost, float(payload.get("residual_value", 0)), int(payload.get("useful_life_months", 60)), payload.get("depreciation_method", "SLM"), payload.get("location"), payload.get("assigned_to"), cost, x_user_id, payload.get("approved_by"), now, now))
        asset_id = cur.lastrowid
        asset_acc = int(payload.get("asset_account_id") or _finance_account_id_by_code(conn, school_id, "1300"))
        cash_acc = int(payload.get("cash_account_id") or _finance_account_id_by_code(conn, school_id, "1000"))
        post = _finance_posting_service(conn, school_id, x_user_id, "assets", "ASSET_CAPITALIZATION", f"FA:{asset_id}", cost, f"Asset capitalization {asset_code}", payload["capitalization_date"], payload.get("idempotency_key") or f"asset_cap_{asset_id}", asset_acc, cash_acc)
        conn.execute("UPDATE fixed_assets SET gl_journal_id = ? WHERE id = ?", (post["journal_entry_id"], asset_id))
        conn.execute("INSERT INTO asset_movements (school_id, asset_id, movement_type, movement_date, amount, reference, gl_journal_id, created_by, created_at) VALUES (?, ?, 'capitalization', ?, ?, ?, ?, ?, ?)", (school_id, asset_id, payload["capitalization_date"], cost, asset_code, post["journal_entry_id"], x_user_id, now))
        conn.commit()
        return {"asset": dict(conn.execute("SELECT * FROM fixed_assets WHERE id = ?", (asset_id,)).fetchone()), "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.post("/api/finance/assets/depreciation/run")
async def run_asset_depreciation(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_manage"], x_user_id)
    if not payload.get("asset_id") or not payload.get("period_label") or not payload.get("period_start") or not payload.get("period_end"):
        raise HTTPException(status_code=400, detail="asset_id, period_label, period_start and period_end are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        asset = conn.execute("SELECT * FROM fixed_assets WHERE id = ? AND school_id = ?", (int(payload["asset_id"]), school_id)).fetchone()
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found.")
        residual = float(asset["residual_value"] or 0); life = int(asset["useful_life_months"] or 60)
        monthly = round(max((float(asset["cost"]) - residual) / max(life, 1), 0), 2)
        dep_amt = round(float(payload.get("depreciation_amount", monthly)), 2)
        dep_exp_acc = int(payload.get("depreciation_expense_account_id") or _finance_account_id_by_code(conn, school_id, "5100"))
        accum_dep_acc = int(payload.get("accumulated_depreciation_account_id") or _finance_account_id_by_code(conn, school_id, "1300"))
        post = _finance_posting_service(conn, school_id, x_user_id, "assets", "ASSET_DEPRECIATION", f"DEP:{asset['id']}:{payload['period_label']}", dep_amt, f"Depreciation {asset['asset_code']} {payload['period_label']}", payload.get("posting_date") or payload["period_end"], payload.get("idempotency_key") or f"asset_dep_{asset['id']}_{payload['period_label']}", dep_exp_acc, accum_dep_acc)
        now = datetime.now().isoformat()
        conn.execute("INSERT INTO depreciation_schedule (school_id, asset_id, period_label, period_start, period_end, depreciation_amount, status, gl_journal_id, posted_at, posted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?)", (school_id, int(asset["id"]), payload["period_label"], payload["period_start"], payload["period_end"], dep_amt, post["journal_entry_id"], now, x_user_id, now))
        conn.execute("INSERT INTO asset_movements (school_id, asset_id, movement_type, movement_date, amount, reference, gl_journal_id, created_by, created_at) VALUES (?, ?, 'depreciation', ?, ?, ?, ?, ?, ?)", (school_id, int(asset["id"]), payload["period_end"], dep_amt, payload["period_label"], post["journal_entry_id"], x_user_id, now))
        new_acc = round(float(asset["accumulated_depreciation"] or 0) + dep_amt, 2)
        conn.execute("UPDATE fixed_assets SET accumulated_depreciation = ?, carrying_amount = ?, updated_at = ? WHERE id = ?", (new_acc, round(float(asset["cost"] or 0) - new_acc, 2), now, int(asset["id"])))
        conn.commit()
        return {"asset_id": asset["id"], "depreciation_amount": dep_amt, "posting": post}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.post("/api/finance/assets/dispose")
async def dispose_fixed_asset(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_manage"], x_user_id)
    if not payload.get("asset_id") or not payload.get("disposal_date"):
        raise HTTPException(status_code=400, detail="asset_id and disposal_date are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        asset = conn.execute("SELECT * FROM fixed_assets WHERE id = ? AND school_id = ?", (int(payload["asset_id"]), school_id)).fetchone()
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found.")
        proceeds = round(float(payload.get("sale_amount", 0)), 2)
        carrying = round(float(asset["carrying_amount"] or asset["cost"] or 0), 2)
        amount = carrying if carrying > 0 else max(proceeds, 0.01)
        cash_acc = int(payload.get("cash_account_id") or _finance_account_id_by_code(conn, school_id, "1000"))
        asset_acc = int(payload.get("asset_account_id") or _finance_account_id_by_code(conn, school_id, "1300"))
        post = _finance_posting_service(conn, school_id, x_user_id, "assets", "ASSET_DISPOSAL", f"DISP:{asset['id']}", amount, f"Asset disposal {asset['asset_code']}", payload["disposal_date"], payload.get("idempotency_key") or f"asset_disposal_{asset['id']}", cash_acc, asset_acc)
        now = datetime.now().isoformat()
        conn.execute("UPDATE fixed_assets SET status = 'Disposed', updated_at = ? WHERE id = ?", (now, int(asset["id"])))
        conn.execute("INSERT INTO asset_movements (school_id, asset_id, movement_type, movement_date, amount, reference, gl_journal_id, created_by, created_at) VALUES (?, ?, 'disposal', ?, ?, ?, ?, ?, ?)", (school_id, int(asset["id"]), payload["disposal_date"], proceeds, payload.get("reference"), post["journal_entry_id"], x_user_id, now))
        conn.commit()
        return {"message": "Asset disposed.", "asset_id": asset["id"], "posting": post}
    finally:
        conn.close()

@router.get("/api/finance/assets/reports/register")
async def get_asset_register(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT fa.*, ac.code AS category_code, ac.name AS category_name FROM fixed_assets fa JOIN asset_categories ac ON ac.id = fa.category_id WHERE fa.school_id = ? ORDER BY fa.asset_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/api/finance/assets/reports/depreciation")
async def get_asset_depreciation_report(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_assets_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute(
            """
            SELECT ds.*, fa.asset_code, fa.asset_name
            FROM depreciation_schedule ds
            JOIN fixed_assets fa ON fa.id = ds.asset_id
            WHERE ds.school_id = ?
            ORDER BY ds.period_end DESC, ds.id DESC
            """,
            (school_id,)
        ).fetchall()
        total = round(sum(float(r["depreciation_amount"] or 0) for r in rows), 2)
        return {"rows": [dict(r) for r in rows], "total_depreciation": total}
    finally:
        conn.close()

# --- Payroll ---
@router.post("/api/finance/payroll/employees")
async def create_payroll_employee(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_manage", "finance_payroll", "finance_manage"], x_user_id)
    if not payload.get("name"):
        raise HTTPException(status_code=400, detail="name is required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        emp_code = payload.get("employee_code") or _next_doc_number(conn, school_id, "employees", "employee_code", "EMP-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO employees (school_id, employee_code, user_id, name, email, phone, department_id, cost_center_id, status, join_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (school_id, emp_code, payload.get("user_id"), payload["name"], payload.get("email"), payload.get("phone"), payload.get("department_id"), payload.get("cost_center_id"), payload.get("status", "Active"), payload.get("join_date"), x_user_id, now, now))
        eid = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM employees WHERE id = ?", (eid,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/payroll/salary-structures")
async def create_salary_structure(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_manage", "finance_payroll", "finance_manage"], x_user_id)
    if not payload.get("employee_id") or not payload.get("effective_from"):
        raise HTTPException(status_code=400, detail="employee_id and effective_from are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO salary_structures (school_id, employee_id, effective_from, basic_salary, allowances, deductions, tax_amount, employer_contribution, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (school_id, int(payload["employee_id"]), payload["effective_from"], float(payload.get("basic_salary", 0)), float(payload.get("allowances", 0)), float(payload.get("deductions", 0)), float(payload.get("tax_amount", 0)), float(payload.get("employer_contribution", 0)), payload.get("status", "Active"), x_user_id, now, now))
        sid = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM salary_structures WHERE id = ?", (sid,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/payroll/runs/generate")
async def generate_payroll_run(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_manage", "finance_payroll", "finance_manage"], x_user_id)
    required = ["period_label", "period_start", "period_end"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="period_label, period_start, period_end are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        run_code = payload.get("run_code") or _next_doc_number(conn, school_id, "payroll_runs", "run_code", "PR-")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute("INSERT INTO payroll_runs (school_id, run_code, period_label, period_start, period_end, pay_date, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)", (school_id, run_code, payload["period_label"], payload["period_start"], payload["period_end"], payload.get("pay_date"), x_user_id, now, now))
        run_id = cur.lastrowid
        structs = conn.execute("SELECT ss.*, e.id AS employee_id FROM salary_structures ss JOIN employees e ON e.id = ss.employee_id WHERE ss.school_id = ? AND ss.status = 'Active' AND e.status = 'Active'", (school_id,)).fetchall()
        gross_total = ded_total = tax_total = net_total = 0.0
        for s in structs:
            basic = float(s["basic_salary"] or 0); allow = float(s["allowances"] or 0); ded = float(s["deductions"] or 0); tax = float(s["tax_amount"] or 0)
            net = round((basic + allow) - (ded + tax), 2); gross = round(basic + allow, 2)
            cur.execute("INSERT INTO payroll_lines (payroll_run_id, employee_id, basic_salary, allowances, deductions, tax_amount, net_pay, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'Generated', ?, ?)", (run_id, s["employee_id"], basic, allow, ded, tax, net, now, now))
            gross_total += gross; ded_total += ded; tax_total += tax; net_total += net
        conn.execute("UPDATE payroll_runs SET total_gross = ?, total_deductions = ?, total_tax = ?, total_net = ?, updated_at = ? WHERE id = ?", (round(gross_total, 2), round(ded_total, 2), round(tax_total, 2), round(net_total, 2), now, run_id))
        conn.commit()
        return {"run": dict(conn.execute("SELECT * FROM payroll_runs WHERE id = ?", (run_id,)).fetchone()), "line_count": len(structs)}
    finally:
        conn.close()

@router.post("/api/finance/payroll/runs/{run_id}/approve")
async def approve_payroll_run(run_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_approve", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        run = conn.execute("SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?", (run_id, school_id)).fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Payroll run not found.")
        now = datetime.now().isoformat()
        conn.execute("UPDATE payroll_runs SET status = 'Locked', approved_by = ?, approved_at = ?, locked_by = ?, locked_at = ?, updated_at = ? WHERE id = ?", (x_user_id, now, x_user_id, now, now, run_id))
        conn.commit()
        return {"message": "Payroll run approved and locked.", "run_id": run_id}
    finally:
        conn.close()

@router.post("/api/finance/payroll/runs/{run_id}/post")
async def post_payroll_run(run_id: int, payload: Dict[str, Any] = Body(default={}), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_approve", "finance_payroll_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        run = conn.execute("SELECT * FROM payroll_runs WHERE id = ? AND school_id = ?", (run_id, school_id)).fetchone()
        if not run:
            raise HTTPException(status_code=404, detail="Payroll run not found.")
        if run["status"] not in ("Locked", "Approved"):
            raise HTTPException(status_code=400, detail="Payroll run must be approved/locked first.")
        idempotency_key = payload.get("idempotency_key") or f"payroll_post_{run_id}"
        existing = conn.execute("SELECT journal_entry_id FROM finance_posting_events WHERE school_id = ? AND idempotency_key = ?", (school_id, idempotency_key)).fetchone()
        if existing:
            conn.execute("UPDATE payroll_runs SET status = 'Posted', gl_journal_id = ?, updated_at = ? WHERE id = ?", (existing["journal_entry_id"], datetime.now().isoformat(), run_id))
            conn.commit()
            return {"message": "Already posted.", "journal_entry_id": existing["journal_entry_id"]}
        net_pay = float(run["total_net"] or 0); tax_amt = float(run["total_tax"] or 0); debit_total = round(net_pay + tax_amt, 2)
        payroll_exp_acc = int(payload.get("payroll_expense_account_id") or _finance_account_id_by_code(conn, school_id, "5000"))
        payroll_payable_acc = int(payload.get("payroll_payable_account_id") or _finance_account_id_by_code(conn, school_id, "2100"))
        tax_payable_acc = int(payload.get("tax_payable_account_id") or _finance_account_id_by_code(conn, school_id, "2200"))
        now = datetime.now().isoformat()
        cur = conn.cursor()
        jn = _gl_next_journal_number(conn, school_id, "GL")
        cur.execute("INSERT INTO journal_entries (school_id, journal_number, entry_date, description, reference, status, total_debit, total_credit, posted_at, posted_by, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?, ?, ?)", (school_id, jn, payload.get("entry_date") or run["period_end"], f"Payroll Run {run['run_code']}", f"PAYROLL:{run_id}", debit_total, debit_total, now, x_user_id, x_user_id, now, now))
        jid = cur.lastrowid
        cur.execute("INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit) VALUES (?, 1, ?, 'Payroll Expense', ?, 0)", (jid, payroll_exp_acc, debit_total))
        cur.execute("INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit) VALUES (?, 2, ?, 'Payroll Payable (Net)', 0, ?)", (jid, payroll_payable_acc, net_pay))
        cur.execute("INSERT INTO journal_lines (journal_entry_id, line_no, account_id, description, debit, credit) VALUES (?, 3, ?, 'Tax Payable', 0, ?)", (jid, tax_payable_acc, tax_amt))
        cur.execute("INSERT INTO finance_posting_events (school_id, module, transaction_type, source_ref, idempotency_key, amount, status, journal_entry_id, event_payload, created_by, created_at) VALUES (?, 'payroll', 'PAYROLL_RUN', ?, ?, ?, 'Posted', ?, ?, ?, ?)", (school_id, f'PAYROLL:{run_id}', idempotency_key, debit_total, jid, json.dumps({"run_code": run["run_code"]}), x_user_id, now))
        conn.execute("UPDATE payroll_runs SET status = 'Posted', gl_journal_id = ?, updated_at = ? WHERE id = ?", (jid, now, run_id))
        conn.commit()
        return {"message": "Payroll posted.", "journal_entry_id": jid}
    except HTTPException:
        conn.rollback()
        raise
    finally:
        conn.close()

@router.get("/api/finance/payroll/reports/summary")
async def payroll_summary(period_label: Optional[str] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_manage", "finance_reports_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        if period_label:
            rows = conn.execute("SELECT * FROM payroll_runs WHERE school_id = ? AND period_label = ? ORDER BY id DESC", (school_id, period_label)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM payroll_runs WHERE school_id = ? ORDER BY id DESC LIMIT 24", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.get("/api/finance/payroll/payslip/{employee_id}")
async def payroll_payslip(employee_id: int, run_id: Optional[int] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_payroll_manage", "finance_payroll_self_read", "finance_view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        if run_id:
            row = conn.execute("SELECT pl.*, pr.run_code, pr.period_label, pr.period_start, pr.period_end, e.employee_code, e.name FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.payroll_run_id JOIN employees e ON e.id = pl.employee_id WHERE pr.school_id = ? AND pl.employee_id = ? AND pl.payroll_run_id = ?", (school_id, employee_id, run_id)).fetchone()
        else:
            row = conn.execute("SELECT pl.*, pr.run_code, pr.period_label, pr.period_start, pr.period_end, e.employee_code, e.name FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.payroll_run_id JOIN employees e ON e.id = pl.employee_id WHERE pr.school_id = ? AND pl.employee_id = ? ORDER BY pr.id DESC LIMIT 1", (school_id, employee_id)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Payslip not found.")
        return dict(row)
    finally:
        conn.close()

@router.post("/api/finance/approvals/request")
async def create_finance_approval_request(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_approvals_manage", "finance_manage"], x_user_id)
    required = ["module", "entity_type", "entity_id"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="module, entity_type and entity_id are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO finance_approval_requests (school_id, module, entity_type, entity_id, requested_by, approved_by, status, notes, requested_at, approved_at)
            VALUES (?, ?, ?, ?, ?, NULL, 'Pending', ?, ?, NULL)
            """,
            (school_id, payload["module"], payload["entity_type"], str(payload["entity_id"]), x_user_id, payload.get("notes"), now)
        )
        req_id = cur.lastrowid
        _finance_log_audit(conn, school_id, "controls", "approval_request", "finance_approval_requests", req_id, x_user_id, payload)
        conn.commit()
        return dict(conn.execute("SELECT * FROM finance_approval_requests WHERE id = ?", (req_id,)).fetchone())
    finally:
        conn.close()

@router.post("/api/finance/approvals/{request_id}/decision")
async def decide_finance_approval(request_id: int, payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_approvals_manage", "finance_payables_approve", "finance_manage"], x_user_id)
    action = str(payload.get("action", "")).strip().lower()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        req = conn.execute("SELECT * FROM finance_approval_requests WHERE id = ? AND school_id = ?", (request_id, school_id)).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Approval request not found.")
        if req["status"] != "Pending":
            raise HTTPException(status_code=400, detail="Approval request already processed.")
        now = datetime.now().isoformat()
        status = "Approved" if action == "approve" else "Rejected"
        conn.execute("UPDATE finance_approval_requests SET status = ?, approved_by = ?, approved_at = ?, notes = ? WHERE id = ?", (status, x_user_id, now, payload.get("notes"), request_id))
        _finance_log_audit(conn, school_id, "controls", f"approval_{action}", "finance_approval_requests", request_id, x_user_id, payload)
        conn.commit()
        return dict(conn.execute("SELECT * FROM finance_approval_requests WHERE id = ?", (request_id,)).fetchone())
    finally:
        conn.close()

@router.get("/api/finance/master-data")
async def get_finance_master_data_overview(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        return {
            "chart_of_accounts": [dict(r) for r in conn.execute("SELECT * FROM chart_of_accounts WHERE school_id = ? ORDER BY account_code", (school_id,)).fetchall()],
            "fiscal_years": [dict(r) for r in conn.execute("SELECT * FROM fiscal_years WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()],
            "accounting_periods": [dict(r) for r in conn.execute("SELECT * FROM accounting_periods WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()],
            "tax_codes": [dict(r) for r in conn.execute("SELECT * FROM tax_codes WHERE school_id = ? ORDER BY code", (school_id,)).fetchall()],
            "cost_centers": [dict(r) for r in conn.execute("SELECT * FROM cost_centers WHERE school_id = ? ORDER BY center_code", (school_id,)).fetchall()],
            "parties": [dict(r) for r in conn.execute("SELECT * FROM finance_parties WHERE school_id = ? ORDER BY party_type, name", (school_id,)).fetchall()],
            "currencies": [dict(r) for r in conn.execute("SELECT * FROM currencies WHERE school_id = ? ORDER BY currency_code", (school_id,)).fetchall()],
            "exchange_rates": [dict(r) for r in conn.execute("SELECT * FROM exchange_rates WHERE school_id = ? ORDER BY effective_date DESC", (school_id,)).fetchall()]
        }
    finally:
        conn.close()

@router.get("/api/finance/master-data/chart-of-accounts")
async def list_chart_of_accounts(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute(
            "SELECT * FROM chart_of_accounts WHERE school_id = ? ORDER BY account_code",
            (school_id,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/chart-of-accounts")
async def create_chart_of_account(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["account_code", "account_name", "account_type"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="account_code, account_name, and account_type are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, parent_account_id, is_active, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["account_code"]).strip(),
                str(payload["account_name"]).strip(),
                str(payload["account_type"]).strip(),
                payload.get("parent_account_id"),
                _as_bool(payload.get("is_active"), True),
                payload.get("description"),
                now,
                now
            )
        )
        conn.commit()
        new_id = cur.lastrowid
        row = conn.execute("SELECT * FROM chart_of_accounts WHERE id = ?", (new_id,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create chart of account: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/fiscal-years")
async def list_fiscal_years(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM fiscal_years WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/fiscal-years")
async def create_fiscal_year(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["year_name", "start_date", "end_date"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="year_name, start_date, and end_date are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO fiscal_years (school_id, year_name, start_date, end_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["year_name"]).strip(),
                payload["start_date"],
                payload["end_date"],
                payload.get("status", "Open"),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM fiscal_years WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create fiscal year: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/accounting-periods")
async def list_accounting_periods(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM accounting_periods WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/accounting-periods")
async def create_accounting_period(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["fiscal_year_id", "period_name", "start_date", "end_date"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="fiscal_year_id, period_name, start_date, and end_date are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO accounting_periods (school_id, fiscal_year_id, period_name, start_date, end_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                int(payload["fiscal_year_id"]),
                str(payload["period_name"]).strip(),
                payload["start_date"],
                payload["end_date"],
                payload.get("status", "Open"),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM accounting_periods WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create accounting period: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/tax-codes")
async def list_tax_codes(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM tax_codes WHERE school_id = ? ORDER BY code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/tax-codes")
async def create_tax_code(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["code", "name"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="code and name are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO tax_codes (school_id, code, name, rate, is_active, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["code"]).strip(),
                str(payload["name"]).strip(),
                float(payload.get("rate", 0)),
                _as_bool(payload.get("is_active"), True),
                payload.get("description"),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tax_codes WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create tax code: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/cost-centers")
async def list_cost_centers(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM cost_centers WHERE school_id = ? ORDER BY center_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/cost-centers")
async def create_cost_center(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["center_code", "center_name"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="center_code and center_name are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO cost_centers (school_id, center_code, center_name, department_id, is_active, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["center_code"]).strip(),
                str(payload["center_name"]).strip(),
                payload.get("department_id"),
                _as_bool(payload.get("is_active"), True),
                payload.get("description"),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM cost_centers WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create cost center: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/parties")
async def list_finance_parties(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM finance_parties WHERE school_id = ? ORDER BY party_type, name", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/parties")
async def create_finance_party(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["party_type", "name"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="party_type and name are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        party_type = str(payload["party_type"]).strip()
        if party_type not in ("Vendor", "Customer", "Employee"):
            raise HTTPException(status_code=400, detail="party_type must be Vendor, Customer, or Employee.")
        now = datetime.now().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO finance_parties (school_id, party_type, party_code, name, email, phone, address, tax_identifier, employee_user_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                party_type,
                payload.get("party_code"),
                str(payload["name"]).strip(),
                payload.get("email"),
                payload.get("phone"),
                payload.get("address"),
                payload.get("tax_identifier"),
                payload.get("employee_user_id"),
                _as_bool(payload.get("is_active"), True),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM finance_parties WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create finance party: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/currencies")
async def list_currencies(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM currencies WHERE school_id = ? ORDER BY currency_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/currencies")
async def create_currency(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["currency_code", "currency_name"]
    if any(not payload.get(k) for k in required):
        raise HTTPException(status_code=400, detail="currency_code and currency_name are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        is_base = _as_bool(payload.get("is_base"), False)
        cur = conn.cursor()
        if is_base:
            cur.execute("UPDATE currencies SET is_base = FALSE, updated_at = ? WHERE school_id = ?", (now, school_id))
        cur.execute(
            """
            INSERT INTO currencies (school_id, currency_code, currency_name, symbol, decimal_places, is_base, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["currency_code"]).strip().upper(),
                str(payload["currency_name"]).strip(),
                payload.get("symbol"),
                int(payload.get("decimal_places", 2)),
                is_base,
                _as_bool(payload.get("is_active"), True),
                now,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM currencies WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create currency: {str(e)}")
    finally:
        conn.close()

@router.get("/api/finance/master-data/exchange-rates")
async def list_exchange_rates(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_read", "finance_masterdata_manage", "finance_manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM exchange_rates WHERE school_id = ? ORDER BY effective_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@router.post("/api/finance/master-data/exchange-rates")
async def create_exchange_rate(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance_masterdata_manage", "finance_manage"], x_user_id)
    required = ["from_currency", "to_currency", "rate"]
    if any(payload.get(k) in (None, "") for k in required):
        raise HTTPException(status_code=400, detail="from_currency, to_currency, and rate are required.")
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        now = datetime.now().isoformat()
        effective_date = payload.get("effective_date") or datetime.now().date().isoformat()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO exchange_rates (school_id, from_currency, to_currency, rate, effective_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                school_id,
                str(payload["from_currency"]).strip().upper(),
                str(payload["to_currency"]).strip().upper(),
                float(payload["rate"]),
                effective_date,
                now
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM exchange_rates WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Unable to create exchange rate: {str(e)}")
    finally:
        conn.close()
