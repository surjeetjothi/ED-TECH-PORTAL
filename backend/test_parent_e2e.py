#!/usr/bin/env python3
"""
End-to-end test for parent persona fixes.
Run this with server running: python3 test_parent_e2e.py
"""
import os, sys, json
import urllib.request
import urllib.error

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8000")

PARENT_ID = "theclassiccrew.careers@gmail.com"  # "Parent of Student G1-2"
EXPECTED_CHILD_ID = "muthujothi1112@gmail.com"  # "Student G1-2"
PARENT_ROLE = "Parent_Guardian"

headers = {
    "Content-Type": "application/json",
    "X-User-Id": PARENT_ID,
    "X-User-Role": PARENT_ROLE,
}

def api(path, method="GET", body=None):
    url = BASE_URL + "/api" + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return 0, {"error": str(e)}

def check(name, status, data, expect_ok=True):
    ok = (status in (200, 201)) == expect_ok
    icon = "✅" if ok else "❌"
    print(f"{icon} {name}: HTTP {status}")
    if not ok:
        print(f"   Detail: {data}")
    return ok

print("=" * 60)
print(f"Testing Parent: {PARENT_ID}")
print(f"Expected child: {EXPECTED_CHILD_ID}")
print("=" * 60)

# 1. Login
print("\n[1] Testing Login...")
login_body = {"username": PARENT_ID, "password": "ethi444@ethi", "role": "Parent_Guardian"}
req = urllib.request.Request(
    BASE_URL + "/api/auth/login",
    data=json.dumps(login_body).encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        login_data = json.loads(r.read())
    login_status = r.status
except urllib.error.HTTPError as e:
    login_data = json.loads(e.read().decode())
    login_status = e.code
except Exception as e:
    login_data = {"error": str(e)}
    login_status = 0

print(f"   Status: {login_status}")
related = login_data.get("related_student_id")
print(f"   related_student_id = {related}")
if related == EXPECTED_CHILD_ID:
    print(f"   ✅ Correct child found at login!")
elif related:
    print(f"   ⚠️  Got child {related} (expected {EXPECTED_CHILD_ID})")
else:
    print(f"   ❌ No related_student_id returned (will fallback to backend resolve)")

# 2. Students list (should return only child)
print("\n[2] Testing /api/students/all (parent view)...")
status, data = api("/students/all")
check("Students All", status, data)
if isinstance(data, list):
    print(f"   Returned {len(data)} student(s): {[s.get('id','?') + ' - ' + s.get('name','?') for s in data]}")

# 3. Attendance (no student_id param - should auto-resolve)
print("\n[3] Testing /api/attendance/student/my (no student_id)...")
status, data = api("/attendance/student/my?month=2&year=2026&months_back=3")
check("Attendance (auto-resolve)", status, data)

# 4. Attendance with explicit child ID
print("\n[4] Testing /api/attendance/student/my (with child's ID)...")
status, data = api(f"/attendance/student/my?month=2&year=2026&months_back=3&student_id={EXPECTED_CHILD_ID}")
check("Attendance (explicit child ID)", status, data)

# 5. Student data
print("\n[5] Testing /api/students/{child_id}/data...")
status, data = api(f"/students/{EXPECTED_CHILD_ID}/data")
check("Student Data (child ID)", status, data)

# 6. Progress card
print("\n[6] Testing /api/progress-card/my...")
status, data = api("/progress-card/my")
check("Progress Card (my)", status, data)

# 7. Timetable (no student_id)
print("\n[7] Testing /api/timetable/student/my (no student_id)...")
status, data = api("/timetable/student/my")
check("Timetable (auto-resolve)", status, data)

# 8. Test with PARENT's own ID as student_id (should auto-resolve to child)
print("\n[8] Testing attendance with PARENT's own ID as student_id (edge case)...")
status, data = api(f"/attendance/student/my?month=2&year=2026&student_id={PARENT_ID}")
check("Attendance (parent_id → child auto-resolve)", status, data)

# 9. Exams
print("\n[9] Testing /api/exams/student/list...")
status, data = api("/exams/student/list")
check("Exams (auto-resolve)", status, data)

print("\n" + "=" * 60)
print("Tests complete.")
