# RBAC & Permissions — Negative Testing Report
**Date:** 2026-02-28  
**Tester:** Antigravity AI  
**App:** ClassBridge EdTech Portal  
**Backend:** FastAPI + PostgreSQL/SQLite (Supabase)  
**Frontend:** Vanilla JS Single-Page App

---

## 🔴 CRITICAL BUGS FOUND (Must Fix)

### BUG-01 — Student/Parent/Guest get `401` instead of `403` on Admin endpoints
**Severity:** HIGH (misleads clients, reveals no session vs. session-but-denied)  
**Affected:** Students (`S001`), Parents, non-DB-seeded users  
**Root Cause:** `verify_permission()` in `security.py` does `SELECT role, is_super_admin FROM students WHERE id = ?`. When the student ID exists only in the **Postgres database** but is tested from a **fresh/local run using SQLite**, the lookup returns nothing → raises `401 "User not found"` instead of `403 "Permission denied"`.  
**Fix Needed:** Ensure the student seeding runs in Postgres on first startup, OR change the response to differentiate clearly.

```
❌ FAIL | GET /admin/roles (Student S001)        | Expected:403 Got:401
❌ FAIL | GET /admin/permissions/list (S001)     | Expected:403 Got:401
❌ FAIL | POST /admin/roles (Student)            | Expected:403 Got:401
❌ FAIL | GET /admin/roles/1 (Student)           | Expected:403 Got:401
❌ FAIL | GET /admin/roles (Parent)              | Expected:403 Got:401
❌ FAIL | GET /admin/permissions/list (Parent)   | Expected:403 Got:401
❌ FAIL | POST /admin/roles (Parent)             | Expected:403 Got:401
```

---

### BUG-02 — `/api/root-admin/students` returns `500 Internal Server Error` for `rootadmin`
**Severity:** CRITICAL — Root admin's own panel crashes  
**Route:** `GET /api/root-admin/students`  
**Root Cause:** `ensure_root_admin_user()` does NOT have the same `if x_user_id == "rootadmin": return True` bypass as `verify_permission()`. When `rootadmin` is not in the `students` table (e.g., the seeding hasn't applied in this DB run), the query finds no user and raises `401`, which then causes an unhandled exception at the caller level or an unexpected 500.

**Fix Needed:** Add the same hardcoded `rootadmin` bypass in `ensure_root_admin_user()`:
```python
def ensure_root_admin_user(conn, user_id: str):
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    # Special bypass for hardcoded root admin
    if user_id == "rootadmin":
        return {"id": "rootadmin", "role": "Root_Super_Admin", "is_super_admin": False}
    ...
```

---

### BUG-03 — X-User-Role Header Is NOT Validated Server-Side (Spoofable!)
**Severity:** HIGH — Security Vulnerability  
**Evidence:**
```
❌ FAIL | Wrong role header (Admin user, HACKER_ROLE role header) | Expected:403 Got:200
```
**Root Cause:** `verify_permission()` reads `x_user_role` from the header but then **ignores it** and fetches the role from the DB. However, some legacy endpoints and the finance module may still **trust the X-User-Role header for access decisions** without cross-checking the DB. An attacker who has any valid `X-User-Id` could potentially pass `X-User-Role: Admin` to gain higher access on those legacy routes.

**Fix Needed:** Audit all endpoints that use `x_user_role` from the header. Ensure **only** `verify_permission()` (which re-fetches role from DB) is used for all access control decisions.

---

### BUG-04 — `POST /api/auth/login` Returns `422` for Wrong Credentials
**Severity:** MEDIUM — Wrong HTTP Status Code  
**Expected:** `401 Unauthorized`  
**Got:** `422 Unprocessable Entity`  
**Root Cause:** Login endpoint likely has body validation before auth logic. If the body passes validation, auth should return 401. The 422 may indicate the login body structure is not matching what the endpoint expects.

---

### BUG-05 — Student Cannot Access `/api/students/all` (Returns 401)
**Severity:** MEDIUM  
**Evidence:** `GET /students/all (Student S001) → got 401 "User not found"`  
**Root Cause:** Same as BUG-01 — `S001` doesn't exist in the Postgres DB (seeding issue), so the permission check fails with "User not found" (401) instead of proceeding to return their own data.  
**Fix Needed:** Students' data seeding must run against the connected database.

---

## 🟡 GAPS — Missing Frontend Protection (Menu Level)

### GAP-01 — Student Sidebar Shows `test-question-bank-view`
**Location:** `getSidebarConfig('Student')` in `script.js` line 6053  
**Issue:** The question bank (line `{ label: 'sidebar_question_bank', ... view: 'test-question-bank-view' }`) is shown in the Student sidebar, but in `VIEW_LOADERS`, `test-question-bank-view` has `roles: TEACHER_ROLES` only.  
**Result:** Student clicks it → `showAccessDeniedView()` fires, but the **menu item is still visible**, which is confusing UX.  
**Fix Needed:** Remove from Student config OR add to `STUDENT_ROLES` in VIEW_LOADERS.

---

### GAP-02 — No Permission Guard on "Create Class" and "Manage Classes" for Principals
**Location:** `getSidebarConfig()` default (Admin/Principal) path  
**Issue:** `Principal` role gets the default Admin sidebar config (including "Create Class", "Add Student") without any `permission:` check. A Principal should have read-only access per the DB seeding (`Principal` has only `class_view`, not `class_create`).  
**Fix Needed:** Add `permission: () => hasPermission('class_create')` to the Create Class item.

---

### GAP-03 — Teacher Sidebar Has No Permission Gate on Finance (Payroll)  
**Location:** `getSidebarConfig('Teacher')` lines 6107-6124  
**Issue:** Finance/Salary Slips uses `|| appState.role === 'Teacher'` as a bypass — meaning **any Teacher** can see it regardless of their `finance_payroll_self_read` DB permission.  
**Fix Needed:** Rely on DB permission only, do not use role as a blanket bypass.

---

### GAP-04 — `/parent/child-profile` and `/parent/attendance` Backend Routes Return 404
**Evidence:**
```
❌ FAIL | GET /parent/child-profile (Teacher) | Expected:403 Got:404
❌ FAIL | GET /parent/attendance (Teacher)    | Expected:403 Got:404
```
**Issue:** The parent-specific API routes don't exist at those paths. Frontend may be hitting the right views but the backend API paths need to be verified/created.

---

### GAP-05 — Hash URL Direct Navigation Not Protected for Parent/Student
**Issue:** A logged-in Parent could manually type `#role-management-view` in the URL bar. The `switchView()` function DOES check `VIEW_LOADERS`, but `role-management-view` is NOT registered in `VIEW_LOADERS` — it's only controlled by `roles-view`. This means the access-denied check may not fire for some custom view IDs.

---

## ✅ TESTS THAT PASSED (Working Correctly)

| Test | Result |
|------|--------|
| GET /admin/roles (No Auth) | ✅ 401 |
| POST /admin/roles (No Auth) | ✅ 401 |
| DELETE /admin/roles (No Auth) | ✅ 401 |
| GET /admin/roles (Teacher) | ✅ 403 |
| POST /admin/roles (Teacher) | ✅ 403 |
| PUT /admin/roles/1 (Teacher) | ✅ 403 |
| DELETE /admin/roles/1 (Teacher) | ✅ 403 |
| DELETE system role (Admin) | ✅ 403 (System roles protected) |
| GET /admin/roles (Admin) | ✅ 200 |
| GET /admin/permissions/list (Admin) | ✅ 200 |
| GET /admin/roles (RootAdmin) | ✅ 200 |
| GET /root-admin/students (Teacher) | ✅ 403 |
| GET /teacher/overview (Teacher) | ✅ 200 |
| GET /students/all (Parent) | ✅ 200 (filtered to children) |
| GET /finance/dashboard (Teacher) | ✅ 403 |
| GET /finance/dashboard (Admin) | ✅ 200 |
| SQL Injection in X-User-Id | ✅ 401 (Blocked) |
| Empty role header w/ valid user | ✅ 200 (DB fallback works) |
| Invalid user ID | ✅ 401 |

---

## 🔧 WHAT NEEDS TO BE IMPLEMENTED FURTHER

### PRIORITY 1 — Bug Fixes (Blocking)

1. **Fix `ensure_root_admin_user()` to bypass for `rootadmin` ID** (BUG-02)
2. **Fix Student database seeding for Postgres** — students `S001`, `S002`, etc. must be seeded into the Postgres DB on startup (BUG-01, BUG-05)
3. **Standardize HTTP status codes** — 401 vs 403 distinction must be consistent: 401=not authenticated, 403=authenticated but no permission (BUG-01)
4. **Fix login endpoint 422 issue** — ensure wrong credentials return 401, not 422 (BUG-04)

### PRIORITY 2 — Security Hardening

5. **Audit all legacy endpoints for X-User-Role header trust** — Replace usage of `x_user_role` header for access decisions with DB lookups (BUG-03)
6. **Add `permission_required` decorator/dependency** — Create a reusable FastAPI dependency for permission checking to avoid repetitive boilerplate and missed guards
7. **Add rate limiting to ALL auth endpoints** — Currently only login has it; password reset, profile update, etc. need it too
8. **Input validation on all body parameters** — Use Pydantic strictly to prevent 422s that leak schema info

### PRIORITY 3 — Frontend RBAC Hardening

9. **Remove `test-question-bank-view` from Student sidebar** OR add Student to VIEW_LOADERS for that view (GAP-01)
10. **Add `permission:` guard to "Create Class" in Principal/Admin sidebar** (GAP-02)
11. **Remove `|| appState.role === 'Teacher'` role bypass in Finance sidebar items** — use DB permissions only (GAP-03)
12. **Register ALL views in `VIEW_LOADERS`** — Views like `role-management-view`, `compliance-view` etc. that are NOT in VIEW_LOADERS bypass the role-check gate. Add them all (GAP-05)
13. **Block "roles-view" from Teacher and below** — The `roles-view` itself is not in VIEW_LOADERS, so accessing it via URL hash would not trigger an access-denied

### PRIORITY 4 — Missing Features to Implement

14. **Parent API routes missing** — `/api/parent/child-profile` and `/api/parent/attendance` return 404 (GAP-04). Need to implement or fix path
15. **Audit Log for Permission Denials** — The `log_auth_event` is only called in some places; it should be called every time a 403 is issued
16. **Session token validation** — Currently permission checks rely only on the `X-User-Id` header, which could be spoofed. Implement JWT or session token validation
17. **Role-based data filtering** — Confirm Parent's `/students/all` returns ONLY their linked child (verified ✅ working), but Teacher's `/students/all` should only return students of their school
18. **Tenant isolation** — Verify that Admin of School A cannot access data of School B via `X-User-Id` header manipulation
19. **2FA bypass test** — Test if users can skip 2FA by directly hitting dashboard endpoints post-login without completing 2FA step

---

## 📋 SUMMARY TABLE

| Category | Status |
|----------|--------|
| Unauthenticated access blocked | ✅ PASS |
| Teacher blocked from Admin endpoints | ✅ PASS |
| System roles protected from deletion | ✅ PASS |
| Admin access to role management | ✅ PASS |
| Root admin full access | ⚠️ PARTIAL (500 on /root-admin/students) |
| Student access control (API) | ❌ FAIL (DB seeding issue → 401 not 403) |
| Parent access control (API) | ❌ FAIL (DB seeding issue) |
| Finance endpoint gating | ⚠️ PARTIAL (Teacher blocked, Student buggy) |
| Frontend menu-level gating (Admin) | ✅ PASS |
| Frontend menu-level gating (Teacher) | ⚠️ PARTIAL (Finance bypass) |
| Frontend menu-level gating (Student) | ⚠️ PARTIAL (Question bank visible) |
| Frontend menu-level gating (Parent) | ✅ PASS |
| SQL Injection protection | ✅ PASS |
| Role header spoofing | ❌ FAIL (verify_permission robust, but legacy routes may not be) |
