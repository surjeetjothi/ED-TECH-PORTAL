import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend import get_db_connection, hash_password

def setup_tenant_admin():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    email = "ethirajthiru472@gmail.com"
    pwd = "Dev444@dev"
    hashed_pwd = hash_password(pwd)
    
    try:
        cursor.execute("SELECT id FROM students WHERE id = ?", (email,))
        if cursor.fetchone():
            print(f"User {email} already exists. Updating...")
            cursor.execute("UPDATE students SET role = 'Principal', password = ?, is_super_admin = FALSE, school_id = 1 WHERE id = ?", (hashed_pwd, email))
        else:
            print(f"Creating user {email}...")
            cursor.execute("""
                INSERT INTO students 
                (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin, email_verified) 
                VALUES (?, 'Demo Tenant Admin', 0, 'All', 100.0, 'English', ?, 100.0, 100.0, 100.0, 'Principal', 1, FALSE, TRUE)
            """, (email, hashed_pwd))
        
        conn.commit()
        print("Successfully created/updated Tenant Admin in Database!")
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    setup_tenant_admin()
