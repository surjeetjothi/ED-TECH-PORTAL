import pytest
from fastapi.testclient import TestClient
import os
import sqlite3
import sys

# Add backend to path so we can import initialize_db
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from backend import app, initialize_db

# Use a test database for all tests
TEST_DB_PATH = "test_class_bridge.db"

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    # Ensure we use the test database
    os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
    
    # Run the official initialization logic
    initialize_db()
    
    yield
    
    # Clean up after all tests
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except PermissionError:
            pass

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def db_conn():
    conn = sqlite3.connect(TEST_DB_PATH)
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()
