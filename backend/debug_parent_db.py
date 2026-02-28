#!/usr/bin/env python3
"""Debug script to understand parent/guardian DB structure."""
import os
import sys

# Load env
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

print(f"USE_POSTGRES={USE_POSTGRES}")
print(f"DATABASE_URL={DATABASE_URL[:50]}...")

if USE_POSTGRES and "postgres" in DATABASE_URL.lower():
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor, connect_timeout=10)
        cur = conn.cursor()
        print("\n✅ Connected to PostgreSQL\n")
    except Exception as e:
        print(f"PostgreSQL connection failed: {e}")
        sys.exit(1)
else:
    import sqlite3
    db_path = DATABASE_URL.replace("sqlite:///", "") if DATABASE_URL else "class_bridge.db"
    if not os.path.isabs(db_path):
        db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), db_path)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    print(f"\n✅ Connected to SQLite: {db_path}\n")

print("=== PARENTS & PARENT_GUARDIANS ===")
cur.execute("SELECT id, name, role, school_id, grade FROM students WHERE role IN ('Parent', 'Parent_Guardian') LIMIT 20")
rows = cur.fetchall()
if not rows:
    print("  (none found)")
for r in rows:
    d = dict(r)
    print(f"  ID={d['id']} | NAME={d['name']} | ROLE={d['role']} | SCHOOL={d['school_id']} | GRADE={d['grade']}")

print("\n=== GUARDIANS TABLE ===")
try:
    cur.execute("SELECT * FROM guardians LIMIT 20")
    rows = cur.fetchall()
    if not rows:
        print("  (empty)")
    for r in rows:
        print(f"  {dict(r)}")
except Exception as e:
    print(f"  Error querying guardians: {e}")

print("\n=== STUDENTS (role=Student) ===")
cur.execute("SELECT id, name, role FROM students WHERE role = 'Student' LIMIT 15")
rows = cur.fetchall()
for r in rows:
    d = dict(r)
    print(f"  ID={d['id']} | NAME={d['name']}")

print("\n=== CHECK: access for parent_g1_1 on student_g1_1 ===")
parent_id = "parent_g1_1"
student_id = "student_g1_1"

# Check 1: guardians by email
cur.execute("SELECT 1 FROM guardians WHERE student_id = %s AND LOWER(email) = LOWER(%s)" if USE_POSTGRES else
            "SELECT 1 FROM guardians WHERE student_id = ? AND LOWER(email) = LOWER(?)",
            (student_id, parent_id))
r = cur.fetchone()
print(f"  Guardians email match: {bool(r)}")

# Check 2: guardians by name
cur.execute("SELECT 1 FROM guardians WHERE student_id = %s AND LOWER(name) = LOWER(%s)" if USE_POSTGRES else
            "SELECT 1 FROM guardians WHERE student_id = ? AND LOWER(name) = LOWER(?)",
            (student_id, parent_id))
r = cur.fetchone()
print(f"  Guardians name match: {bool(r)}")

# Check 3: parent record naming convention
ph = "%s" if USE_POSTGRES else "?"
cur.execute(f"SELECT name FROM students WHERE id = {ph} AND role IN ('Parent', 'Parent_Guardian')", (parent_id,))
r = cur.fetchone()
if r:
    p_name = dict(r)['name'].lower()
    print(f"  Parent name: '{p_name}'")
    cur.execute(f"SELECT name FROM students WHERE id = {ph}", (student_id,))
    sr = cur.fetchone()
    if sr:
        s_name = dict(sr)['name'].lower()
        print(f"  Student name: '{s_name}'")
        print(f"  s_name in p_name: {s_name in p_name}")
        print(f"  'parent of' in p_name: {'parent of' in p_name}")
else:
    print(f"  Parent '{parent_id}' not found in DB")

conn.close()
print("\nDone.")
