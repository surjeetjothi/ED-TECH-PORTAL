#!/usr/bin/env python3
"""Deep debug: trace what the frontend sends and what backend does."""
import os, sys

env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_file):
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = os.environ.get("USE_POSTGRES", "false").lower() == "true"

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor, connect_timeout=10)
    cur = conn.cursor()
    print("✅ Connected")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

# The parent who is logged in
PARENT_ID = "theclassiccrew.careers@gmail.com"
# From the screenshot name: "Parent of Student G1-2"
# The student is "Student G1-2" → muthujothi1112@gmail.com

print(f"\n=== Testing parent: {PARENT_ID} ===")

# What does the frontend send as student_id?
# The frontend stores appState.activeStudentId — let's find what related_student_id was set at login

# Check what login returns for this parent
cur.execute("SELECT id, name, role FROM students WHERE id = %s", (PARENT_ID,))
parent = cur.fetchone()
print(f"Parent record: {dict(parent) if parent else 'NOT FOUND'}")

# Guardians check
cur.execute("SELECT * FROM guardians WHERE LOWER(email) = LOWER(%s)", (PARENT_ID,))
g_rows = cur.fetchall()
print(f"Guardians (email match): {[dict(r) for r in g_rows]}")

cur.execute("SELECT * FROM guardians WHERE LOWER(name) = LOWER(%s)", (PARENT_ID,))
g_rows2 = cur.fetchall()
print(f"Guardians (name match): {[dict(r) for r in g_rows2]}")

# Naming convention check
parent_rec = cur.fetchone()
cur.execute("SELECT name FROM students WHERE id = %s", (PARENT_ID,))
parent_row = cur.fetchone()
if parent_row:
    p_name = parent_row['name'].lower()
    print(f"Parent name: '{p_name}'")
    has_parent_of = "parent of" in p_name
    print(f"  Contains 'parent of': {has_parent_of}")
    if has_parent_of:
        s_name = p_name.split("parent of")[-1].strip()
        print(f"  Extracted student name: '{s_name}'")
        cur.execute("SELECT id, name FROM students WHERE LOWER(name) = LOWER(%s) AND role = 'Student'", (s_name,))
        child = cur.fetchone()
        print(f"  Found student: {dict(child) if child else 'NOT FOUND'}")
        if child:
            child_id = child['id']
            print(f"\n=== Now test check_student_access for parent={PARENT_ID}, student={child_id} ===")
            
            # The full check_student_access logic
            # 1. guardians email
            cur.execute("SELECT 1 FROM guardians WHERE student_id = %s AND LOWER(email) = LOWER(%s)", (child_id, PARENT_ID))
            r = cur.fetchone()
            print(f"  Step1 guardians email: {bool(r)}")
            
            # 2. guardians name
            cur.execute("SELECT 1 FROM guardians WHERE student_id = %s AND LOWER(name) = LOWER(%s)", (child_id, PARENT_ID))
            r = cur.fetchone()
            print(f"  Step2 guardians name: {bool(r)}")
            
            # 3. naming convention on parent record
            cur.execute("SELECT name FROM students WHERE id = %s AND role IN ('Parent', 'Parent_Guardian')", (PARENT_ID,))
            parent_record = cur.fetchone()
            if parent_record:
                p = parent_record['name'].lower()
                cur.execute("SELECT name FROM students WHERE id = %s", (child_id,))
                student_rec = cur.fetchone()
                if student_rec:
                    s = student_rec['name'].lower()
                    check = s in p or "parent of" in p
                    print(f"  Step3 naming convention: s_name='{s}', p_name='{p}', result={check}")
            else:
                print("  Step3: parent_record not found!")

print("\n\n=== What does resolve_student_id() return? ===")
# If parent logs in without specifying student_id,
# the guardians table is empty, so it falls to naming convention
# But what student_id does the frontend actually pass?

# Check what related_student_id the login endpoint returns
cur.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(%s) ORDER BY id DESC LIMIT 1", (PARENT_ID,))
child_from_guardians = cur.fetchone()
print(f"Login: related_student_id from guardians = {dict(child_from_guardians) if child_from_guardians else 'None (guardians empty!)'}")

print("\nConclusion: Since guardians is empty, login returns related_student_id=None")
print("So appState.activeStudentId is likely None or the parent's own ID.")
print("Frontend then calls /api/attendance/my with student_id=<that value>")

conn.close()
