import pytest
from app.core.auth_utils import verify_password

def test_login_success(client):
    # Default teacher account seeded in initialize_db
    # ID: teacher, Password: Teacher@123 (from config)
    payload = {
        "username": "teacher",
        "password": "Teacher@123",
        "role": "Teacher"
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == "teacher"
    assert data["role"] == "Teacher"

def test_login_wrong_password(client):
    payload = {
        "username": "teacher",
        "password": "WrongPassword123!",
        "role": "Teacher"
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 403
    assert "Invalid credentials" in response.json()["detail"]

def test_registration_hashes_password(client, db_conn):
    # Register a new student
    email = "teststudent@example.com"
    payload = {
        "name": "Test Student",
        "email": email,
        "password": "SecurePassword123!",
        "role": "Student",
        "grade": 10,
        "preferred_subject": "Math"
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200
    
    # Check DB directly to see if password is NOT plain text
    cursor = db_conn.cursor()
    user = cursor.execute("SELECT password FROM students WHERE id = ?", (email,)).fetchone()
    assert user is not None
    stored_password = user["password"]
    assert stored_password != "SecurePassword123!"
    assert stored_password.startswith("$2") # bcrypt prefix

def test_password_upgrade_on_login(client, db_conn):
    # Manually insert a plain-text user
    user_id = "legacyuser@example.com"
    plain_password = "LegacyPassword123!"
    cursor = db_conn.cursor()
    cursor.execute(
        "INSERT INTO students (id, name, password, role, school_id, email_verified) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, "Legacy User", plain_password, "Tag_Admin", 1, 1) # Using a role that matches our normalization
    )
    db_conn.commit()
    
    # Login should succeed and upgrade the password
    payload = {
        "username": user_id,
        "password": plain_password,
        "role": "Tag Admin" 
    }
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == 200
    
    # Check if upgraded
    user = cursor.execute("SELECT password FROM students WHERE id = ?", (user_id,)).fetchone()
    assert user["password"].startswith("$2")
    assert verify_password(plain_password, user["password"])
