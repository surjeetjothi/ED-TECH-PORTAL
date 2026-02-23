from fastapi import FastAPI, HTTPException, Header, Depends, WebSocket, WebSocketDisconnect, Request, Body, File, UploadFile, Form
import secrets
import time
import hmac
import hashlib
# Trigger Reload (Last updated: School Fix)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response, StreamingResponse

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None
    print("Warning: pypdf module not found. PDF processing will be disabled.")

from pydantic import BaseModel
from typing import List, Dict, Any, Optional 
import sqlite3
import io
import csv
from datetime import datetime, timedelta
import warnings 
import os
import logging
import uuid
import shutil
import json
import re
from fastapi.staticfiles import StaticFiles
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
try:
    from backend.rbac_module import init_rbac_module, router as rbac_router
except Exception:
    from rbac_module import init_rbac_module, router as rbac_router
try:
    import requests
    REQUESTS_IMPORT_ERROR = None
except Exception as e:
    requests = None
    REQUESTS_IMPORT_ERROR = e

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
# Force load .env from the script's directory
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=env_path, override=True)
print(f"Loaded configuration from: {env_path}")
print(f"Configured DATABASE_URL: {os.getenv('DATABASE_URL')}")

# Lazy-load psycopg2 only when Postgres is requested.
psycopg2 = None
DictCursor = None
PSYCOPG2_LOADED = False

def load_psycopg2():
    global psycopg2, DictCursor, PSYCOPG2_LOADED
    if PSYCOPG2_LOADED:
        return True
    try:
        import psycopg2 as _psycopg2
        from psycopg2.extras import DictCursor as _DictCursor
        psycopg2 = _psycopg2
        DictCursor = _DictCursor
        PSYCOPG2_LOADED = True
        return True
    except Exception as e:
        logger.warning(f"psycopg2 not available (Postgres disabled/fallback to SQLite): {e}")
        return False

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# --- EMAIL CONFIGURATION ---
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "your-email@gmail.com") 
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "your-app-password").replace(" ", "")
VERIFICATION_LINK_BASE = os.getenv("VERIFICATION_LINK_BASE", "http://localhost:8000")
VERIFICATION_TOKEN_TTL_HOURS = int(os.getenv("VERIFICATION_TOKEN_TTL_HOURS", "24"))
TEACHER_LOGIN_ALIAS = os.getenv("TEACHER_LOGIN_ALIAS", "teachernoblenexus@gmail.com")
TEACHER_LOGIN_PASSWORD = os.getenv("TEACHER_LOGIN_PASSWORD", "Tea444@tea")
ADMIN_LOGIN_EMAIL = os.getenv("ADMIN_LOGIN_EMAIL", "")
ADMIN_LOGIN_PASSWORD = os.getenv("ADMIN_LOGIN_PASSWORD", "Admin@123")
ROOT_ADMIN_LOGIN_EMAIL = ADMIN_LOGIN_EMAIL
ROOT_ADMIN_LOGIN_PASSWORD = ADMIN_LOGIN_PASSWORD
ALLOW_OTP_CONSOLE_FALLBACK = os.getenv("ALLOW_OTP_CONSOLE_FALLBACK", "true").lower() == "true"
STUDENT_LOGIN_ALIASES = {
    "student1grade1@gmail.com": ("student_g1_1", "p_student_g1_1", "student1grade1@gmail.com"),
}
STUDENT_PASSWORD_OVERRIDES = {
    "student_g1_1": "Sur444@444",
    "p_student_g1_1": "Sur444@444",
    "student1grade1@gmail.com": "Sur444@444",
}
STUDENT_OTP_EMAIL_OVERRIDES = {
    "student_g1_1": "student1grade1@gmail.com",
    "p_student_g1_1": "student1grade1@gmail.com",
}
PARENT_LOGIN_ALIASES = {
    "theclassiccrew.careers@gmail.com": ("parent_g1_1", "theclassiccrew.careers@gmail.com"),
}
PARENT_PASSWORD_OVERRIDES = {
    "parent_g1_1": "ethi444@ethi",
    "theclassiccrew.careers@gmail.com": "ethi444@ethi",
}
PARENT_OTP_EMAIL_OVERRIDES = {
    "parent_g1_1": "theclassiccrew.careers@gmail.com",
}

def send_email(to_email: str, subject: str, body: str):
    smtp_email = os.getenv("SMTP_EMAIL", SMTP_EMAIL)
    smtp_password = os.getenv("SMTP_PASSWORD", SMTP_PASSWORD).replace(" ", "")
    smtp_server = os.getenv("SMTP_SERVER", SMTP_SERVER)
    smtp_port = int(os.getenv("SMTP_PORT", str(SMTP_PORT)))

    if "example.com" in to_email or "your-email" in smtp_email:
        logger.warning(f"Email simulation: To={to_email}, Subject={subject}")
        return False # Simulated

    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        try:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as starttls_err:
            logger.warning(f"STARTTLS send failed, retrying SSL: {starttls_err}")
            server_ssl = smtplib.SMTP_SSL(smtp_server, 465, timeout=15)
            server_ssl.login(smtp_email, smtp_password)
            server_ssl.send_message(msg)
            server_ssl.quit()
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

def _send_messages(conn, sender_id: str, recipient_ids: List[str], subject: str, content: str):
    if not recipient_ids:
        return 0
    ts = datetime.now().isoformat()
    sent = 0
    for rid in sorted(set(recipient_ids)):
        conn.execute("""
            INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
            VALUES (?, ?, ?, ?, ?, FALSE)
        """, (sender_id, rid, subject, content, ts))
        sent += 1
    return sent

FORM_RESOURCE_TEMPLATES: Dict[str, Dict[str, str]] = {
    "sports": {
        "title": "Sports Participation Form",
        "description": "Consent and details form for student sports participation.",
        "content": (
            "SPORTS PARTICIPATION FORM\n\n"
            "Student Name:\n"
            "Grade/Section:\n"
            "Selected Sport:\n"
            "Medical Conditions (if any):\n"
            "Emergency Contact:\n"
            "Parent/Guardian Consent: Yes / No\n"
            "Signature:\n"
            "Date:\n"
        )
    },
    "lunch": {
        "title": "Lunch Preference Form",
        "description": "Weekly lunch selection and dietary preference form.",
        "content": (
            "LUNCH PREFERENCE FORM\n\n"
            "Student Name:\n"
            "Grade/Section:\n"
            "Diet Type: Veg / Non-Veg / Custom\n"
            "Allergies:\n"
            "Lunch Days Required:\n"
            "Parent/Guardian Signature:\n"
            "Date:\n"
        )
    },
    "extracurricular": {
        "title": "Extracurricular Activity Form",
        "description": "Registration form for clubs and extracurricular activities.",
        "content": (
            "EXTRACURRICULAR ACTIVITY FORM\n\n"
            "Student Name:\n"
            "Grade/Section:\n"
            "Preferred Activity/Club:\n"
            "Previous Experience:\n"
            "Availability:\n"
            "Parent/Guardian Consent: Yes / No\n"
            "Signature:\n"
            "Date:\n"
        )
    },
    "marks": {
        "title": "Marks Review Request Form",
        "description": "Request form for marks clarification or re-evaluation.",
        "content": (
            "MARKS REVIEW REQUEST FORM\n\n"
            "Student Name:\n"
            "Grade/Section:\n"
            "Subject:\n"
            "Assessment Name:\n"
            "Reason for Review:\n"
            "Student Signature:\n"
            "Parent/Guardian Signature:\n"
            "Date:\n"
        )
    },
    "extra_languages": {
        "title": "Extra Language Enrollment Form",
        "description": "Enrollment form for additional language classes.",
        "content": (
            "EXTRA LANGUAGE ENROLLMENT FORM\n\n"
            "Student Name:\n"
            "Grade/Section:\n"
            "Language Choice:\n"
            "Current Proficiency Level:\n"
            "Preferred Batch/Time:\n"
            "Parent/Guardian Consent: Yes / No\n"
            "Signature:\n"
            "Date:\n"
        )
    }
}

def _get_school_broadcast_recipients(conn, school_id: int) -> Dict[str, List[str]]:
    teacher_rows = conn.execute(
        "SELECT id FROM students WHERE school_id = ? AND role = 'Teacher'",
        (school_id,)
    ).fetchall()
    student_rows = conn.execute(
        "SELECT id FROM students WHERE school_id = ? AND role = 'Student'",
        (school_id,)
    ).fetchall()
    parent_rows = conn.execute(
        """
        SELECT DISTINCT p.id
        FROM guardians g
        JOIN students s ON s.id = g.student_id
        JOIN students p ON p.id = g.email
        WHERE s.school_id = ?
          AND s.role = 'Student'
          AND p.school_id = ?
          AND p.role IN ('Parent', 'Parent_Guardian')
        """,
        (school_id, school_id)
    ).fetchall()
    return {
        "teachers": [r["id"] for r in teacher_rows if r["id"]],
        "students": [r["id"] for r in student_rows if r["id"]],
        "parents": [r["id"] for r in parent_rows if r["id"]],
    }

def _build_exam_message(schedule: Dict[str, Any], audience: str, student_name: Optional[str] = None, custom_message: Optional[str] = None, items_required: Optional[str] = None) -> str:
    title = schedule.get("title") or "Exam"
    subject = schedule.get("subject") or "General"
    date = schedule.get("exam_date") or schedule.get("date") or "TBD"
    start_time = schedule.get("start_time") or "TBD"
    end_time = schedule.get("end_time") or ""
    time_part = f"{start_time}" if not end_time else f"{start_time} - {end_time}"
    venue = schedule.get("venue") or "TBD"
    instructions = items_required if items_required is not None else schedule.get("instructions")

    header = f"Exam Schedule: {title} ({subject})"
    if audience == "parent" and student_name:
        header = f"{header} for {student_name}"

    parts = [
        header,
        f"Date: {date}",
        f"Time: {time_part}",
        f"Venue: {venue}",
    ]
    if instructions:
        parts.append(f"Items Required: {instructions}")
    if custom_message:
        parts.append(custom_message)
    return "\n".join(parts)

def _notify_exam_schedule(conn, schedule: Dict[str, Any], sender_id: str, custom_message: Optional[str] = None, items_required: Optional[str] = None, include_teachers: bool = True) -> Dict[str, int]:
    sent_counts = {"students": 0, "parents": 0, "teachers": 0}
    school_id = schedule.get("school_id", 1)
    grade_level = schedule.get("grade_level")
    section_id = schedule.get("section_id")

    # Students in scope
    student_query = "SELECT id, name FROM students WHERE role = 'Student' AND school_id = ? AND grade = ?"
    params = [school_id, grade_level]
    if section_id:
        student_query += " AND section_id = ?"
        params.append(section_id)
    students = conn.execute(student_query, params).fetchall()

    # Send to students
    student_ids = [s["id"] for s in students]
    if student_ids:
        content = _build_exam_message(schedule, "student", custom_message=custom_message, items_required=items_required)
        sent_counts["students"] = _send_messages(conn, sender_id, student_ids, "Exam Schedule Update", content)

    # Send to parents/guardians
    for s in students:
        guardians = conn.execute("SELECT email, name FROM guardians WHERE student_id = ?", (s["id"],)).fetchall()
        for g in guardians:
            parent_user = conn.execute(
                "SELECT id FROM students WHERE id = ? AND role IN ('Parent', 'Parent_Guardian') AND school_id = ?",
                (g["email"], school_id)
            ).fetchone()
            if parent_user:
                content = _build_exam_message(schedule, "parent", student_name=s["name"], custom_message=custom_message, items_required=items_required)
                sent_counts["parents"] += _send_messages(conn, sender_id, [parent_user["id"]], "Exam Schedule Update", content)

    # Send to teachers
    if include_teachers:
        teacher_ids = set()
        if schedule.get("teacher_id"):
            teacher_ids.add(schedule["teacher_id"])
        else:
            subject = schedule.get("subject")
            if subject:
                if section_id:
                    sec = conn.execute("SELECT name FROM sections WHERE id = ?", (section_id,)).fetchone()
                    section_name = sec["name"] if sec else None
                else:
                    section_name = None

                if section_name:
                    t_rows = conn.execute(
                        """
                        SELECT DISTINCT tt.teacher_id
                        FROM timetables tt
                        JOIN students s ON s.id = tt.teacher_id
                        WHERE tt.class_grade = ?
                          AND tt.section = ?
                          AND tt.subject = ?
                          AND s.school_id = ?
                          AND s.role = 'Teacher'
                        """,
                        (grade_level, section_name, subject, school_id)
                    ).fetchall()
                else:
                    t_rows = conn.execute(
                        """
                        SELECT DISTINCT tt.teacher_id
                        FROM timetables tt
                        JOIN students s ON s.id = tt.teacher_id
                        WHERE tt.class_grade = ?
                          AND tt.subject = ?
                          AND s.school_id = ?
                          AND s.role = 'Teacher'
                        """,
                        (grade_level, subject, school_id)
                    ).fetchall()
                for r in t_rows:
                    if r["teacher_id"]:
                        teacher_ids.add(r["teacher_id"])

        if teacher_ids:
            content = _build_exam_message(schedule, "teacher", custom_message=custom_message, items_required=items_required)
            sent_counts["teachers"] = _send_messages(conn, sender_id, list(teacher_ids), "Exam Schedule Update", content)

    return sent_counts


try:
    # Initialize the Groq Client.
    from groq import Groq
    
    # User provided key overrides env var for now to ensure it works
    api_key = os.getenv("GROQ_API_KEY")
    
    if api_key:
        GROQ_CLIENT = Groq(api_key=api_key)
        GROQ_MODEL = "llama-3.1-8b-instant" 
        
        # Dedicated Client for Lesson Planner
        lesson_planner_key = os.environ.get("LESSON_PLANNER_API_KEY") or api_key
             
        LESSON_PLANNER_CLIENT = Groq(api_key=lesson_planner_key)
        
        AI_ENABLED = True
        logger.info("AI Chat System Initialized (Groq Powered).")
    else:
        logger.warning("GROQ_API_KEY not found. AI features disabled.")
        GROQ_CLIENT = None
        LESSON_PLANNER_CLIENT = None
        AI_ENABLED = False
except ImportError:
    logger.error("Groq library not installed. AI features disabled.")
    AI_ENABLED = False
except Exception as e:
    logger.error(f"Failed to initialize AI clients. Error: {e}")
    AI_ENABLED = False

# --- NEW GRADE HELPER AI CONFIGURATION ---
# --- NEW GRADE HELPER AI CONFIGURATION ---
GRADE_HELPER_API_KEY = os.environ.get("GRADE_HELPER_API_KEY") or os.environ.get("GROQ_API_KEY")
try:
    if GRADE_HELPER_API_KEY:
        GRADE_HELPER_CLIENT = Groq(api_key=GRADE_HELPER_API_KEY)
        logger.info("Grade Helper AI Initialized.")
    else:
        GRADE_HELPER_CLIENT = None
        logger.warning("GRADE_HELPER_API_KEY not found.")
except Exception as e:
    logger.error(f"Failed to initialize Grade Helper AI: {e}")
    GRADE_HELPER_CLIENT = None

ENGAGEMENT_HELPER_API_KEY = os.environ.get("ENGAGEMENT_HELPER_API_KEY") or os.environ.get("GROQ_API_KEY")
ENGAGEMENT_HELPER_MODEL = os.environ.get("ENGAGEMENT_HELPER_MODEL", "llama-3.1-8b-instant")
try:
    if ENGAGEMENT_HELPER_API_KEY:
        ENGAGEMENT_HELPER_CLIENT = Groq(api_key=ENGAGEMENT_HELPER_API_KEY)
        logger.info("Engagement Helper AI Initialized (Groq).")
    else:
        ENGAGEMENT_HELPER_CLIENT = None
        logger.warning("ENGAGEMENT_HELPER_API_KEY/GROQ_API_KEY not found.")
except Exception as e:
    logger.error(f"Failed to initialize Engagement Helper AI: {e}")
    ENGAGEMENT_HELPER_CLIENT = None
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        logger.info("Initializing Database...")
        initialize_db()
        logger.info("Database Initialized.")
    except Exception as e:
        logger.error(f"Startup DB Error: {e}")
    try:
        logger.info("Initializing RBAC module...")
        init_rbac_module()
        logger.info("RBAC module initialized.")
    except Exception as e:
        logger.error(f"Startup RBAC module error: {e}")

    try:
        logger.info("Training Recommendation Model (Lazy loaded on demand)...")
        # train_recommendation_model() # Disabled to prevent startup hang
        logger.info("Model training deferred.")
    except Exception as e:
        logger.warning(f"Startup ML Error: {e}")
    
    yield
    # Shutdown (if any cleanup is needed)
    logger.info("Shutting down...")

# --- NEW AI ENGAGEMENT MODELS ---
app = FastAPI(title="EdTech AI Portal API - Enhanced", lifespan=lifespan)

# --- CORS Configuration ---
# Fix: Explicitly list allowed origins for Production + Development
# Support all Vercel deployment URLs (including preview deployments)
origins = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "null",
    "https://classbridge-backend-bqj3.onrender.com",
    "https://ed-tech-portal.vercel.app",
    "https://www.ed-tech-portal.vercel.app",
]

# Database selection:
# - Default behavior is LOCAL SQLite for reliability in local development.
# - Postgres is used only when USE_POSTGRES=true.
USE_POSTGRES = os.getenv("USE_POSTGRES", "false").lower() == "true"
DATABASE_URL_ENV = os.getenv("DATABASE_URL", "class_bridge.db")
if USE_POSTGRES and "postgres" in DATABASE_URL_ENV.lower():
    DATABASE_URL = DATABASE_URL_ENV
    SQLITE_DB_PATH = None
else:
    DATABASE_URL = DATABASE_URL_ENV
    sqlite_candidate = (DATABASE_URL_ENV or "class_bridge.db").strip()
    if sqlite_candidate.startswith("sqlite:///"):
        sqlite_candidate = sqlite_candidate.replace("sqlite:///", "", 1)
    if not sqlite_candidate:
        sqlite_candidate = "class_bridge.db"
    SQLITE_DB_PATH = sqlite_candidate if os.path.isabs(sqlite_candidate) else os.path.join(os.path.dirname(os.path.abspath(__file__)), sqlite_candidate)
print(f"Using database backend: {'Postgres' if USE_POSTGRES and 'postgres' in DATABASE_URL.lower() else 'SQLite'} ({DATABASE_URL if USE_POSTGRES and 'postgres' in DATABASE_URL.lower() else SQLITE_DB_PATH})")

# For production, also allow Vercel preview URLs via regex.
# We keep explicit origins to avoid accidental CORS denial for main domains.
IS_PRODUCTION = os.getenv("RENDER") == "true" or (USE_POSTGRES and "postgres" in DATABASE_URL.lower())

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app" if IS_PRODUCTION else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

import os

# Static + Frontend Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "static_app"))
FRONTEND_INDEX = os.path.join(FRONTEND_DIR, "index.html")
FRONTEND_SCRIPT = os.path.join(FRONTEND_DIR, "script.js")
FRONTEND_STATIC_DIR = os.path.join(FRONTEND_DIR, "static")

STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)

# If a local frontend exists, mirror its static assets into backend static
if os.path.isdir(FRONTEND_STATIC_DIR):
    try:
        shutil.copytree(FRONTEND_STATIC_DIR, STATIC_DIR, dirs_exist_ok=True)
    except Exception:
        pass

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.include_router(rbac_router)



MIN_ACTIVITIES = 5 

DB_SCHEMA_CONTEXT = """
PostgreSQL Schema Overview:
1. students (id [text], name, grade, preferred_subject, attendance_rate, home_language, math_score, science_score, english_language_score, role ['Student', 'Teacher', 'Tenant_Admin'], school_id)
2. activities (id, student_id, date, topic, difficulty, score [0-100], time_spent_min)
3. schools (id, name, address, contact_email)
   - Note: content is multi-tenant, filtered by school_id usually, but for general queries show all if not restricted.
4. groups (id, name, subject, description, school_id) - Represents classes/groups
5. assignments (id, group_id, title, due_date, points)
6. submissions (id, assignment_id, student_id, content, grade)
7. guardians (student_id, name, relationship, phone, email)
8. health_records (student_id, blood_group, allergies, medical_conditions, medications)
9. staff (id, name, role, department_id, position_title, joining_date)
10. departments (id, name, head_of_department_id)

Relationships:
- students.school_id -> schools.id
- activities.student_id -> students.id
- groups.school_id -> schools.id
- assignments.group_id -> groups.id
"""

def format_df_to_markdown(df):
    if df.empty:
        return "No results found."
    columns = df.columns.tolist()
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join(["---"] * len(columns)) + " |"
    rows = []
    for _, row in df.iterrows():
        # Convert values to string and replace newlines to keep table structure
        row_values = [str(val).replace('\n', ' ') for val in row.values]
        row_str = "| " + " | ".join(row_values) + " |"
        rows.append(row_str)
    return f"\n{header}\n{separator}\n" + "\n".join(rows) + "\n"

# --- POSTGRES COMPATIBILITY LAYER ---
# class sqlite3:
#     """Compatibility layer to allow existing code to catch sqlite3 exceptions."""
#     IntegrityError = psycopg2.IntegrityError
#     OperationalError = psycopg2.OperationalError
#     Row = dict # Stub

class PostgresCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        # Naive replacement of ? to %s for Postgres
        query = query.replace('?', '%s')
        
        # Auto-add RETURNING id for INSERTs to support lastrowid if not already present
        is_insert = query.strip().upper().startswith("INSERT")
        if is_insert and "RETURNING" not in query.upper():
            query += " RETURNING id"

        try:
            self.cursor.execute(query, params)
            if is_insert:
                try:
                    row = self.cursor.fetchone()
                    self._lastrowid = row[0] if row else None
                except Exception:
                    # In case fetchone fails or no data returned (e.g. DO NOTHING)
                    self._lastrowid = None
        except Exception as e:
            # Handle specific Postgres migration errors only when psycopg2 is loaded.
            if psycopg2 is not None:
                try:
                    if isinstance(e, psycopg2.errors.DuplicateColumn):
                        return self
                    if isinstance(e, psycopg2.errors.UndefinedColumn) and is_insert and query.endswith(" RETURNING id"):
                        self.cursor.connection.rollback()
                        query_clean = query[:-13] # strip " RETURNING id"
                        self.cursor.execute(query_clean, params)
                        self._lastrowid = None
                        return self
                except Exception:
                    pass
            # logger.error(f"SQL Execution Error: {e} | Query: {query}")
            raise e
            
        return self # Allow chaining

    def executemany(self, query, params):
        query = query.replace('?', '%s')
        self.cursor.executemany(query, params)
        # executemany doesn 't support RETURNING easily with single lastrowid conceptual mapping
        self._lastrowid = None 
        return self

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()
        
    @property
    def lastrowid(self):
        # Return the captured ID from the last INSERT
        return getattr(self, '_lastrowid', None) 

    def close(self):
        self.cursor.close()

class PostgresConnectionWrapper:
    def __init__(self, dsn):
        if not load_psycopg2():
            raise RuntimeError("Postgres requested but psycopg2 is not available.")
        try:
            self.conn = psycopg2.connect(dsn, cursor_factory=DictCursor)
        except Exception as e:
            logger.error(f"DB Connection Error: {e}")
            raise e
        self.row_factory = None # Stub

    def cursor(self):
        return PostgresCursorWrapper(self.conn.cursor())

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur # Allow chaining

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()

    def rollback(self):
        self.conn.rollback()

 

# --- 2. DATA MODELS ---

class LoginRequest(BaseModel):
    username: str
    password: str
    role: str = "Student" # Default to Student to avoid breaking legacy clients if any, though frontend always sends it now

class LoginResponse(BaseModel):
    success: bool = True
    user_id: str
    name: Optional[str] = None
    role: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    requires_2fa: bool = False 
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    is_super_admin: bool = False 
    related_student_id: Optional[str] = None 
    email_masked: Optional[str] = None 

class Verify2FARequest(BaseModel):
    user_id: str
    code: str

class AddStudentRequest(BaseModel):
    id: str
    name: str
    grade: int
    preferred_subject: str
    attendance_rate: float
    home_language: str
    math_score: float
    science_score: float
    english_language_score: float
    password: str = "Student@123" 
    school_id: Optional[int] = 1

class StudentHistory(BaseModel):
    date: str
    topic: str
    difficulty: str
    score: float
    time_spent_min: int

class StudentSummary(BaseModel):
    avg_score: float
    total_activities: int
    recommendation: Optional[str] = None
    math_score: float
    science_score: float
    english_language_score: float
    roles: List[str] = []

class StudentDataResponse(BaseModel):
    summary: StudentSummary
    history: List[StudentHistory]

class TeacherOverviewResponse(BaseModel):
    total_students: int
    class_attendance_avg: float
    class_score_avg: float
    roster: List[Dict[str, Any]] 
    school_name: Optional[str] = None
    total_teachers: int = 0

class AIChatRequest(BaseModel):
    prompt: str

class AIChatResponse(BaseModel):
    reply: str

class GenerateQuizRequest(BaseModel):
    topic: str
    difficulty: str = "Medium"
    question_count: int = 5
    type: str = "Multiple Choice" # or "Short Answer"
    description: Optional[str] = None

class GenerateQuizResponse(BaseModel):
    content: str
    
class AddActivityRequest(BaseModel):
    student_id: str
    date: str
    topic: str
    difficulty: str
    score: float
    time_spent_min: int

class UpdateStudentRequest(BaseModel):
    name: str
    grade: int
    preferred_subject: str
    attendance_rate: float
    home_language: str
    math_score: float
    science_score: float
    english_language_score: float
    password: Optional[str] = None 
    school_id: Optional[int] = None
    roles: Optional[List[str]] = None

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    grade: Optional[int] = 9
    preferred_subject: Optional[str] = "General"
    role: str = "Student" 
    invitation_token: Optional[str] = None 
    school_id: Optional[int] = 1

class ClassScheduleRequest(BaseModel):
    topic: str
    date: str
    meet_link: str
    target_students: Optional[List[str]] = None

class ClassResponse(BaseModel):
    id: int
    teacher_id: str
    topic: str
    date: str
    meet_link: str
    target_students: List[str] 
    
class GroupCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    subject: str 

class MaterialCreateRequest(BaseModel):
    title: str
    type: str 
    content: str 

class SchoolCreateRequest(BaseModel):
    name: str
    address: str
    contact_email: str
    admin_password: Optional[str] = "Admin@123"
    subscription_plan: Optional[str] = "Basic"

class RootAdminStudentCreateRequest(BaseModel):
    name: str
    email: str
    password: str
    school_id: Optional[int] = 1
    role: Optional[str] = "Student"
    grade: Optional[int] = 1
    preferred_subject: Optional[str] = "General"
    home_language: Optional[str] = "English"

class RootAdminStudentEmailUpdateRequest(BaseModel):
    email: str

class RootAdminStudentPasswordUpdateRequest(BaseModel):
    password: str

class RootAdminSchoolCreateRequest(BaseModel):
    name: str
    address: str
    contact_email: str
    account_password: str

class RootAdminSchoolActivateRequest(BaseModel):
    school_id: int
    otp: str

class SchoolResponse(BaseModel):
    id: int
    name: str
    address: str
    contact_email: str
    created_at: str 

class GroupMemberUpdateRequest(BaseModel):
    student_ids: List[str]

class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    subject: Optional[str] = "General" 
    member_count: int

class MaterialResponse(BaseModel):
    id: int
    title: str
    type: str
    content: str
    date: str

class GenericSocialRequest(BaseModel):
    provider: str
    token: str

class LogoutRequest(BaseModel):
    user_id: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class InvitationRequest(BaseModel):
    role: str
    expiry_hours: int = 24

class InvitationResponse(BaseModel):
    link: str
    token: str
    expires_at: str

class SocialTokenRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ClassSessionRequest(BaseModel):
    meet_link: str

class AuditLogResponse(BaseModel):
    id: int
    user_id: str
    event_type: str
    timestamp: str
    details: str
    logout_time: Optional[str] = None
    duration_minutes: Optional[int] = None

class QuizCreateRequest(BaseModel):
    group_id: Optional[int] = None
    title: str
    questions: list
    time_limit: Optional[int] = 0
    target_type: Optional[str] = "group"
    target_id: Optional[str] = None
    acknowledged: bool = False

class QuizSubmitRequest(BaseModel):
    student_id: str
    answers: Dict[str, str] # Question Index -> Answer

class QuizResponse(BaseModel):
    id: int
    group_id: Optional[int] = None
    title: str
    question_count: int
    created_at: str
    time_limit: Optional[int] = 0
    target_type: Optional[str] = 'group'
    target_id: Optional[str] = None

class AssignmentResponse(BaseModel):
    id: int
    group_id: int
    title: str
    description: str
    due_date: str
    type: str
    points: int

class AssignmentCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: str
    points: int = 100
    grade_level: Optional[int] = None
    section_id: Optional[int] = None

class SubmissionCreateRequest(BaseModel):
    student_id: str
    content: str # Text or Link

class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: str
    student_name: Optional[str] = None
    content: str
    submitted_at: str
    grade: Optional[float] = None
    feedback: Optional[str] = None

class GradeSubmissionRequest(BaseModel):
    grade: float
    feedback: str = ""


class LessonPlanResponse(BaseModel):
    content: str

class AddUserRequest(BaseModel):
    id: str
    name: str
    role: str
    password: str
    grade: Optional[int] = 0
    preferred_subject: Optional[str] = "All"

class RoleCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    status: str = "Active"
    permissions: List[str] # List of permission codes

class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: str
    status: str
    permissions: List[dict] # {id, code, description}
    is_system: bool = False

class PermissionResponse(BaseModel):
    id: int
    code: str
    description: str

class AssignRoleRequest(BaseModel):
    role_ids: List[int]
    
class UserResponse(BaseModel):
    id: str
    name: str
    role: str
    grade: Optional[int]
    preferred_subject: Optional[str]


# --- STUDENT MANAGEMENT MODELS ---
class SectionCreateRequest(BaseModel):
    name: str
    grade_level: int
    school_id: int

class SectionResponse(BaseModel):
    id: int
    school_id: int
    name: str
    grade_level: int
    created_at: str

class GuardianCreateRequest(BaseModel):
    name: str
    relationship: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    is_emergency_contact: bool = False

class GuardianResponse(BaseModel):
    id: int
    student_id: str
    name: str
    relationship: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    is_emergency_contact: bool

class HealthRecordUpdateRequest(BaseModel):
    blood_group: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    medications: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_phone: Optional[str] = None

class HealthRecordResponse(BaseModel):
    id: int
    student_id: str
    blood_group: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    allergies: Optional[str]
    medical_conditions: Optional[str]
    medications: Optional[str]
    doctor_name: Optional[str]
    doctor_phone: Optional[str]
    last_updated: Optional[str]

class DocumentResponse(BaseModel):
    id: int
    student_id: str
    document_type: str
    document_name: str
    file_path: str
    upload_date: str
    uploaded_by: Optional[str]

class ResourceCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str = "Policy" # Policy, Schedule, Form, Other
    file_path: str # For now, just a text input or mocked path
    school_id: Optional[int] = 1

class ResourceResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    category: str
    file_path: str
    uploaded_by: Optional[str] = "Admin"
    uploaded_at: str

class FormTemplatePublishRequest(BaseModel):
    template_key: str
    school_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None

class TimetablePdfResponse(BaseModel):
    id: Optional[int] = None
    class_grade: int
    section: Optional[str] = None
    title: str
    file_path: str
    uploaded_by: str
    uploaded_at: str


# --- STAFF MANAGEMENT MODELS ---
class DepartmentCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    head_of_department_id: Optional[str] = None

class DepartmentResponse(DepartmentCreateRequest):
    id: int

class StaffProfileUpdateRequest(BaseModel):
    department_id: Optional[int]
    position_title: Optional[str]
    joining_date: Optional[str]
    contract_type: Optional[str]
    salary: Optional[float]

class StaffResponse(BaseModel):
    id: str
    name: str
    role: str
    email: Optional[str] = None # Assuming email is mapped from ID or similar for now
    photo_url: Optional[str] = None
    # Profile Info
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    position_title: Optional[str] = None
    joining_date: Optional[str] = None
    contract_type: Optional[str] = None
    salary: Optional[float] = None

class StaffAttendanceRequest(BaseModel):
    user_id: str
    date: str
    status: str
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None

class StaffPerformanceRequest(BaseModel):
    user_id: str
    review_date: str
    rating: int
    comments: str
    goals: Optional[str] = ""

class StaffPerformanceResponse(StaffPerformanceRequest):
    id: int
    reviewer_id: str

# --- GENERAL LEDGER MODELS ---
class GLJournalLineInput(BaseModel):
    account_id: Optional[int] = None
    account_code: Optional[str] = None
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    cost_center_id: Optional[int] = None
    tax_code_id: Optional[int] = None
    party_id: Optional[int] = None

class GLJournalCreateRequest(BaseModel):
    entry_date: str
    description: Optional[str] = None
    reference: Optional[str] = None
    period_id: Optional[int] = None
    lines: List[GLJournalLineInput]

class GLJournalReverseRequest(BaseModel):
    reversal_date: Optional[str] = None
    reversal_reason: Optional[str] = None

# --- LMS MODELS (MOODLE ALTERNATIVE) ---
class LMSCourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str = "General"
    thumbnail_url: Optional[str] = None
    enrollment_key: Optional[str] = None

class LMSCourseResponse(BaseModel):
    id: int
    title: str
    description: str
    teacher_id: Optional[str]
    category: str
    thumbnail_url: Optional[str]
    created_at: str

class LMSSectionCreateRequest(BaseModel):
    title: str
    order_index: int = 0

class LMSSectionResponse(BaseModel):
    id: int
    course_id: int
    title: str
    order_index: int

class LMSModuleCreateRequest(BaseModel):
    title: str
    type: str # video, pdf, quiz, assignment, html
    content_url: Optional[str] = None
    content_text: Optional[str] = None
    order_index: int = 0

class LMSModuleResponse(BaseModel):
    id: int
    section_id: int
    title: str
    type: str
    content_url: Optional[str]
    content_text: Optional[str]
    order_index: int


# --- 3. DATABASE HELPER FUNCTIONS ---


def get_db_connection():
    # Check if DATABASE_URL is set to Postgres
    if USE_POSTGRES and "postgres" in DATABASE_URL:
        if load_psycopg2():
            try:
                return PostgresConnectionWrapper(DATABASE_URL)
            except Exception as e:
                logger.error(f"Failed to connect to Postgres, falling back to SQLite: {e}")
        else:
            logger.warning("USE_POSTGRES=true but psycopg2 could not be loaded. Falling back to SQLite.")
    
    # Use SQLite DB path from DATABASE_URL env (or default class_bridge.db)
    db_path = SQLITE_DB_PATH or os.path.join(os.path.dirname(os.path.abspath(__file__)), "class_bridge.db")
    # print(f"DEBUG: sqlite3 object: {sqlite3}")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


from sqlalchemy import create_engine

# Cache engine
ENGINE = None

def get_db_engine():
    global ENGINE
    if ENGINE is None:
        # Use the same DB target as get_db_connection
        db_path = SQLITE_DB_PATH or os.path.join(os.path.dirname(os.path.abspath(__file__)), "class_bridge.db")
        ENGINE = create_engine(f"sqlite:///{db_path}")
    return ENGINE

def fetch_data_df(query, params=()):
    import pandas as pd
    try:
        engine = get_db_engine()
        # Fix for Postgres: Replace '?' with '%s' because we use ? style in the codebase
        # query = query.replace('?', '%s') # Not needed for SQLite
        
        # pd.read_sql_query supports params with SQLAlchemy engine
        df = pd.read_sql_query(query, engine, params=params)
        return df
    except Exception as e:
        logger.error(f"Pandas SQL Error: {e}")
        print(f"CRITICAL PANDAS ERROR: {e}") 
        return pd.DataFrame()

def log_auth_event(user_id: str, event_type: str, details: str = ""):
    try:
        conn = get_db_connection()
        timestamp = datetime.now().isoformat()
        conn.execute("INSERT INTO auth_logs (user_id, event_type, timestamp, details) VALUES (?, ?, ?, ?)",
                     (user_id, event_type, timestamp, details))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to write auth log: {e}")

def update_user_logout(user_id: str):
    """Updates the last explicit 'Login Success' event with logout time and duration."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Find the latest open session (Login Success with no logout_time)
        row = cursor.execute("SELECT id, timestamp FROM auth_logs WHERE user_id = ? AND event_type = 'Login Success' AND logout_time IS NULL ORDER BY id DESC LIMIT 1", (user_id,)).fetchone()
        
        if row:
            log_id = row['id']
            # Parse ISO formats safely
            try:
                start_time = datetime.fromisoformat(row['timestamp'])
                end_time = datetime.now()
                duration = int((end_time - start_time).total_seconds() / 60)
                
                cursor.execute("UPDATE auth_logs SET logout_time = ?, duration_minutes = ? WHERE id = ?", 
                               (end_time.isoformat(), duration, log_id))
                conn.commit()
                logger.info(f"Updated session duration for user {user_id}: {duration} mins")
            except ValueError:
                pass # safely ignore parsing errors if legacy data is weird
    except Exception as e:
        logger.error(f"Logout update failed: {e}")
    finally:
        conn.close()

def validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")
    if not any(char.isupper() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter.")
    if not any(char.isdigit() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number.")
    if not any(not char.isalnum() for char in password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character.")
    return True

def normalize_and_validate_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    email_pattern = r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
    if not re.match(email_pattern, normalized):
        raise HTTPException(status_code=400, detail="Invalid email format.")
    return normalized

def mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "*"
        else:
            masked_local = local[0] + ("*" * (len(local) - 2)) + local[-1]
        return f"{masked_local}@{domain}"
    except Exception:
        return email

def normalize_registration_role(role: str) -> str:
    raw = (role or "").strip().lower()
    role_map = {
        "student": "Student",
        "teacher": "Teacher",
        "parent": "Parent",
        "admin": "Admin",
        "tenant_admin": "Tenant_Admin",
        "principal": "Tenant_Admin",
        "finance_admin": "Root_Super_Admin",
        "academic_admin": "Academic_Admin",
        "hr_admin": "HR_Admin",
        "root_super_admin": "Root_Super_Admin",
        "parent_guardian": "Parent_Guardian",
    }
    normalized = role_map.get(raw)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid role selected.")
    return normalized

def ensure_root_admin_user(conn, user_id: str):
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = conn.execute("SELECT id, role, is_super_admin FROM students WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user["role"] != "Root_Super_Admin":
        raise HTTPException(status_code=403, detail="Root Admin access required")
    return user

ROOT_ADMIN_MANAGED_ROLES = {
    "Student",
    "Teacher",
    "Principal",
    "Tenant_Admin",
    "Parent",
    "Parent_Guardian",
    "Academic_Admin",
    "HR_Admin",
}

def _normalize_root_managed_role(role: str) -> str:
    normalized = (role or "").strip()
    if normalized.lower() == "parent":
        normalized = "Parent_Guardian"
    if normalized.lower() == "principal":
        normalized = "Principal"
    if normalized not in ROOT_ADMIN_MANAGED_ROLES:
        raise HTTPException(status_code=400, detail=f"Role not allowed for Root Admin management: {normalized}")
    return normalized

def update_user_identifier_everywhere(conn, old_user_id: str, new_user_id: str):
    if old_user_id == new_user_id:
        return
    if USE_POSTGRES and "postgres" in DATABASE_URL.lower():
        conn.execute("UPDATE students SET id = ? WHERE id = ?", (new_user_id, old_user_id))
        return
    cur = conn.cursor()
    # Temporarily disable FK checks to allow id migration across many dependent tables.
    cur.execute("PRAGMA foreign_keys = OFF")
    try:
        # Update primary identifier first.
        cur.execute("UPDATE students SET id = ? WHERE id = ?", (new_user_id, old_user_id))

        # Update all FK columns that reference students.id.
        tables = [r["name"] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        for table in tables:
            fk_rows = cur.execute(f"PRAGMA foreign_key_list('{table}')").fetchall()
            for fk in fk_rows:
                ref_table = fk["table"] if hasattr(fk, "keys") else fk[2]
                from_col = fk["from"] if hasattr(fk, "keys") else fk[3]
                if ref_table == "students" and table != "students":
                    cur.execute(f'UPDATE "{table}" SET "{from_col}" = ? WHERE "{from_col}" = ?', (new_user_id, old_user_id))

        # Update non-FK email mappings used in parent/guardian flows.
        cur.execute("UPDATE guardians SET email = ? WHERE LOWER(email) = LOWER(?)", (new_user_id, old_user_id))
        cur.execute("UPDATE auth_logs SET user_id = ? WHERE user_id = ?", (new_user_id, old_user_id))
    finally:
        cur.execute("PRAGMA foreign_keys = ON")

# --- HELPER UTILITIES ---
def _row_value(row, key: str, default=0):
    if row is None:
        return default
    try:
        if hasattr(row, "keys") and key in row.keys():
            return row[key]
    except Exception:
        pass
    try:
        return row[key]
    except Exception:
        pass
    try:
        return row[0]
    except Exception:
        return default

# --- 4. DATABASE INITIALIZATION ---


def initialize_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Helper for migrations
    def safe_migrate(sql):
        try:
            conn.commit() # Commit previous valid state
            cursor.execute(sql)
            conn.commit() # Commit new change
        except Exception as e:
            conn.rollback() # Rollback to previous valid state if this fails
            # print(f"Migration ignored: {e}") # Debug
            pass

    
    # Determine Primary Key Syntax based on DB
    is_postgres = "psycopg2" in str(type(conn)).lower()
    # For Postgres, use SERIAL PRIMARY KEY. For SQLite, INTEGER PRIMARY KEY AUTOINCREMENT
    pk_def = "SERIAL PRIMARY KEY" if is_postgres else "INTEGER PRIMARY KEY AUTOINCREMENT"

    # Schools Table (Multi-Tenancy)
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS schools (
        id {pk_def},
        name TEXT UNIQUE,
        address TEXT,
        contact_email TEXT,
        created_at TEXT,
        is_active BOOLEAN DEFAULT FALSE,
        activation_otp_hash TEXT,
        activation_otp_expires_at TEXT
    )
    """)

    # Students Table (Updated for Multi-Tenancy)
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id TEXT PRIMARY KEY,
        name TEXT,
        grade INTEGER,
        preferred_subject TEXT,
        attendance_rate REAL,
        home_language TEXT,
        password TEXT,
        math_score REAL,          
        science_score REAL,       
        english_language_score REAL, 
        role TEXT DEFAULT 'Student', 
        school_id INTEGER DEFAULT 1, -- Default to School ID 1 for legacy
        is_super_admin BOOLEAN DEFAULT FALSE,
        email_verified BOOLEAN DEFAULT TRUE,
        email_verification_token TEXT,
        email_verification_expires_at TEXT,
        failed_login_attempts INTEGER DEFAULT 0, 
        locked_until TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET DEFAULT
    )
    """)

    # Resources Table (Global Resource & Policy Library)
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS resources (
        id {pk_def},
        title TEXT,
        description TEXT,
        category TEXT,
        file_path TEXT,
        uploaded_by TEXT,
        uploaded_at TEXT,
        school_id INTEGER DEFAULT 1,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)


    # Invitations Table 
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS invitations (
        token TEXT PRIMARY KEY,
        role TEXT,
        school_id INTEGER,
        expires_at TEXT,
        is_used BOOLEAN DEFAULT FALSE
    )
    """)

    # Password Resets Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS password_resets (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        expires_at TEXT
    )
    """)

    # Backup Codes Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS backup_codes (
        user_id TEXT,
        code TEXT,
        created_at TEXT,
        PRIMARY KEY (user_id, code),
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)
    
    # Activities Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS activities (
        id {pk_def},
        student_id TEXT,
        date TEXT,
        topic TEXT,
        difficulty TEXT,
        score REAL,
        time_spent_min INTEGER,
        ai_feedback TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)
    # cursor.execute("PRAGMA foreign_keys = ON") # Postgres enforces FKs by default

    # Live Classes Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS live_classes (
        id {pk_def},
        teacher_id TEXT,
        school_id INTEGER,
        topic TEXT,
        date TEXT,
        meet_link TEXT,
        target_students TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)
    
    # Auth Logs Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS auth_logs (
        id {pk_def},
        user_id TEXT,
        event_type TEXT, 
        timestamp TEXT,
        details TEXT
    )
    """)
    
    # Groups Table
    try:
        conn.commit()
    except:
        conn.rollback()
    
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS groups (
        id {pk_def},
        school_id INTEGER,
        name TEXT,
        description TEXT,
        subject TEXT DEFAULT 'General',
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # Group Members Table
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER,
        student_id TEXT,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, student_id)
    )
    """)

    # Group Materials Table
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS group_materials (
        id {pk_def},
        group_id INTEGER,
        title TEXT,
        type TEXT,
        content TEXT,
        date TEXT,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
    """)


    # Assignments Table
    try:
        conn.commit()
    except:
        conn.rollback()

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS assignments (
        id {pk_def},
        group_id INTEGER,
        title TEXT,
        description TEXT,
        due_date TEXT,
        type TEXT,
        points INTEGER,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    )
    """)

    # Ensure newer columns exist (for class/section assignments)
    safe_migrate("ALTER TABLE assignments ADD COLUMN section_id INTEGER")
    safe_migrate("ALTER TABLE assignments ADD COLUMN grade_level INTEGER")



    # Quizzes Table (LMS Phase 2)
    try:
        conn.commit()
        cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS quizzes (
            id {pk_def},
            group_id INTEGER,
            title TEXT,
            questions TEXT, -- JSON String
            created_at TEXT,
            time_limit_mins INTEGER DEFAULT 0,
            target_type TEXT DEFAULT 'group', -- group, grade, student
            target_id TEXT, -- group_id or student_id
            FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        )
        """)
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to create quizzes table: {e}")

    # Migration for new columns
    safe_migrate("ALTER TABLE quizzes ADD COLUMN time_limit_mins INTEGER DEFAULT 0")
    safe_migrate("ALTER TABLE quizzes ADD COLUMN target_type TEXT DEFAULT 'group'")
    safe_migrate("ALTER TABLE quizzes ADD COLUMN target_id TEXT")
    safe_migrate("ALTER TABLE quiz_attempts ADD COLUMN ai_feedback TEXT")
    safe_migrate("ALTER TABLE activities ADD COLUMN ai_feedback TEXT")
    safe_migrate("ALTER TABLE quizzes ADD COLUMN acknowledged BOOLEAN DEFAULT 0")
    safe_migrate("ALTER TABLE students ADD COLUMN photo_url TEXT")
    
    # Quiz Attempts Table (LMS Phase 2)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS quiz_attempts (
        id {pk_def},
        quiz_id INTEGER,
        student_id TEXT,
        score REAL,
        answers TEXT, -- JSON String
        ai_feedback TEXT,
        submitted_at TEXT,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)


    # --- LMS TABLES (Full Moodle Alternative) ---
    
    # 1. Courses
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS lms_courses (
        id {pk_def},
        title TEXT,
        description TEXT,
        teacher_id TEXT,
        category TEXT,
        thumbnail_url TEXT,
        enrollment_key TEXT,
        created_at TEXT,
        school_id INTEGER DEFAULT 1,
        FOREIGN KEY (teacher_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # 2. Course Sections
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS lms_course_sections (
        id {pk_def},
        course_id INTEGER,
        title TEXT,
        order_index INTEGER,
        FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
    )
    """)

    # 3. Course Modules
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS lms_course_modules (
        id {pk_def},
        section_id INTEGER,
        title TEXT,
        type TEXT,
        content_url TEXT,
        content_text TEXT,
        searchable_text TEXT, -- For RAG
        order_index INTEGER,
        FOREIGN KEY (section_id) REFERENCES lms_course_sections(id) ON DELETE CASCADE
    )
    """)
    
    # Migration for existing tables
    # Migration for existing tables
    safe_migrate("ALTER TABLE lms_course_modules ADD COLUMN searchable_text TEXT")


    # 4. Enrollments
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS lms_enrollments (
        id {pk_def},
        course_id INTEGER,
        student_id TEXT,
        enrolled_at TEXT,
        FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE(course_id, student_id)
    )
    """)

    # 5. Module Completion Tracking
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS lms_module_completion (
        id {pk_def},
        module_id INTEGER,
        student_id TEXT,
        status TEXT DEFAULT 'Not Started',
        score REAL DEFAULT 0,
        FOREIGN KEY (module_id) REFERENCES lms_course_modules(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        UNIQUE(module_id, student_id)
    )
    """)

    # Duplicate Quiz Attempts table removed.

    # --- STUDENT INFORMATION MANAGEMENT MODULE ---

    # Sections Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS sections (
        id {pk_def},
        school_id INTEGER,
        name TEXT, -- e.g. "Section A", "Blue Group"
        grade_level INTEGER,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # Guardians Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS guardians (
        id {pk_def},
        student_id TEXT,
        name TEXT,
        relationship TEXT, -- Father, Mother, Guardian
        phone TEXT,
        email TEXT,
        address TEXT,
        is_emergency_contact BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # Health Records Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS health_records (
        id {pk_def},
        student_id TEXT UNIQUE, -- One record per student
        blood_group TEXT,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        allergies TEXT,
        medical_conditions TEXT,
        medications TEXT,
        doctor_name TEXT,
        doctor_phone TEXT,
        last_updated TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)


    # Student Documents Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS student_documents (
        id {pk_def},
        student_id TEXT,
        document_type TEXT, -- 'ID', 'Certificate', 'Report Card', 'Other'
        document_name TEXT,
        file_path TEXT,
        upload_date TEXT,
        uploaded_by TEXT, -- User ID of uploader
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # Ensure section_id exists in students table (Migration)
    # Ensure section_id exists in students table (Migration)
    safe_migrate("ALTER TABLE students ADD COLUMN section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL")



    # Compliance System Settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    # Question Bank Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS question_banks (
        id {pk_def},
        title TEXT,
        file_path TEXT,
        uploaded_by TEXT,
        created_at TEXT,
        school_id INTEGER DEFAULT 1,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # Question Banks Migrations
    safe_migrate("ALTER TABLE question_banks ADD COLUMN title TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN file_path TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN uploaded_by TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN created_at TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN school_id INTEGER DEFAULT 1")

    # Question Banks Migrations
    safe_migrate("ALTER TABLE question_banks ADD COLUMN title TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN file_path TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN uploaded_by TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN created_at TEXT")
    safe_migrate("ALTER TABLE question_banks ADD COLUMN school_id INTEGER DEFAULT 1")
    
    # Quizzes/Exams Migrations (New PDF Type)
    safe_migrate("ALTER TABLE quizzes ADD COLUMN exam_type TEXT DEFAULT 'interactive'") # 'interactive' or 'pdf'
    safe_migrate("ALTER TABLE quizzes ADD COLUMN file_path TEXT") # For PDF Question Paper
    
    # Quiz Attempts (PDF Submissions)
    safe_migrate("ALTER TABLE quiz_attempts ADD COLUMN submission_file_path TEXT") # For PDF Answer Sheet

    # --- MIGRATIONS ---
    # Add columns if missing (Postgres: ADD COLUMN not supported in older ver, but wrapper suppresses DuplicateColumn error)
    # Add columns if missing (Safe wrapper for SQLite/Postgres)
    # Migrations will be handled by safe_migrate defined at top

    safe_migrate("ALTER TABLE students ADD COLUMN role TEXT DEFAULT 'Student'")
    safe_migrate("ALTER TABLE students ADD COLUMN school_id INTEGER DEFAULT 1")
    safe_migrate("ALTER TABLE students ADD COLUMN is_super_admin BOOLEAN DEFAULT FALSE")

    safe_migrate("ALTER TABLE groups ADD COLUMN school_id INTEGER DEFAULT 1")
    
    safe_migrate("ALTER TABLE live_classes ADD COLUMN school_id INTEGER DEFAULT 1")

    safe_migrate("ALTER TABLE invitations ADD COLUMN school_id INTEGER DEFAULT 1")

    safe_migrate("ALTER TABLE students ADD COLUMN failed_login_attempts INTEGER DEFAULT 0")
    safe_migrate("ALTER TABLE students ADD COLUMN locked_until TEXT")
    safe_migrate("ALTER TABLE students ADD COLUMN email_verified BOOLEAN DEFAULT TRUE")
    safe_migrate("ALTER TABLE students ADD COLUMN email_verification_token TEXT")
    safe_migrate("ALTER TABLE students ADD COLUMN email_verification_expires_at TEXT")
    safe_migrate("ALTER TABLE students ADD COLUMN math_score REAL DEFAULT 0.0")
    safe_migrate("ALTER TABLE students ADD COLUMN science_score REAL DEFAULT 0.0")
    safe_migrate("ALTER TABLE students ADD COLUMN english_language_score REAL DEFAULT 0.0") 
    safe_migrate("ALTER TABLE live_classes ADD COLUMN target_students TEXT") 
    safe_migrate("ALTER TABLE groups ADD COLUMN subject TEXT DEFAULT 'General'")
    safe_migrate("ALTER TABLE students ADD COLUMN xp INTEGER DEFAULT 0")
    safe_migrate("ALTER TABLE students ADD COLUMN badges TEXT DEFAULT '[]'")
    safe_migrate("ALTER TABLE schools ADD COLUMN is_active BOOLEAN DEFAULT FALSE")
    safe_migrate("ALTER TABLE schools ADD COLUMN activation_otp_hash TEXT")
    safe_migrate("ALTER TABLE schools ADD COLUMN activation_otp_expires_at TEXT")
    
    # Auth logs migration
    safe_migrate("ALTER TABLE auth_logs ADD COLUMN logout_time TEXT")
    safe_migrate("ALTER TABLE auth_logs ADD COLUMN duration_minutes INTEGER")

    # Backfill legacy users so existing accounts remain active.
    try:
        cursor.execute("UPDATE students SET email_verified = TRUE WHERE email_verified IS NULL")
        conn.commit()
    except Exception:
        conn.rollback()
    try:
        cursor.execute(
            "UPDATE guardians SET email = ? WHERE LOWER(student_id) = LOWER(?)",
            ("theclassiccrew.careers@gmail.com", "student_g1_1"),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    # Migration for new columns (Moved roles migration after table creation)

    # --- RBAC TABLES (NEW) ---
    # 1. Permissions (System defined, read-only mostly)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS permissions (
        id {pk_def},
        code TEXT UNIQUE,
        description TEXT,
        group_name TEXT -- e.g. 'User Management', 'Academics'
    )
    """)

    # 2. Roles
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS roles (
        id {pk_def},
        name TEXT,
        description TEXT,
        status TEXT DEFAULT 'Active',
        school_id INTEGER DEFAULT NULL, -- NULL = System/Global Role
        is_system BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)


    # Migration: Ensure status column exists
    safe_migrate("ALTER TABLE roles ADD COLUMN status TEXT DEFAULT 'Active'")

    # 3. Role Permissions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER,
        permission_id INTEGER,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
    )
    """)

    # 4. User Roles (Link Users to Roles)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT,
        role_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
    )
    """)

    # --- COMMUNICATION TABLES ---
    # Announcements
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS announcements (
        id {pk_def},
        title TEXT,
        content TEXT,
        target_role TEXT DEFAULT 'All',
        created_at TEXT
    )
    """)

    # Messages
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS messages (
        id {pk_def},
        sender_id TEXT,
        receiver_id TEXT,
        subject TEXT,
        content TEXT,
        timestamp TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (sender_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # Calendar Events
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS calendar_events (
        id {pk_def},
        title TEXT,
        type TEXT,
        date TEXT,
        description TEXT
    )
    """)

    # Exam Schedules
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS exam_schedules (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        title TEXT,
        subject TEXT,
        grade_level INTEGER,
        section_id INTEGER,
        exam_date TEXT,
        start_time TEXT,
        end_time TEXT,
        venue TEXT,
        instructions TEXT,
        teacher_id TEXT,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
        FOREIGN KEY (teacher_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    # Student Attendance Table
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS student_attendance (
        id {pk_def},
        student_id TEXT,
        date TEXT,
        status TEXT, -- Present, Absent, Late, Excused
        remarks TEXT,
        recorded_by TEXT, -- Teacher ID
        created_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # --- STAFF MANAGEMENT TABLES (FR-3.4) ---
    # Departments
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS departments (
        id {pk_def},
        name TEXT UNIQUE,
        description TEXT,
        head_of_department_id TEXT,
        FOREIGN KEY (head_of_department_id) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    # Staff Extended Profiles (extends students/users table)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS staff_profiles (
        user_id TEXT PRIMARY KEY,
        department_id INTEGER,
        position_title TEXT,
        joining_date TEXT,
        contract_type TEXT, -- Full-time, Part-time, Contract
        salary REAL,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
    )
    """)

    # Staff Attendance
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS staff_attendance (
        id {pk_def},
        user_id TEXT,
        date TEXT,
        status TEXT, -- Present, Absent, Late, Leave
        check_in_time TEXT,
        check_out_time TEXT,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # Staff Performance Reviews
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS staff_performance (
        id {pk_def},
        user_id TEXT,
        reviewer_id TEXT,
        review_date TEXT,
        rating INTEGER, -- 1-5
        comments TEXT,
        goals TEXT,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # --- FINANCE & BILLING TABLES ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS fee_structures (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        academic_year TEXT,
        grade_label TEXT,
        tuition_fee REAL,
        library_fee REAL,
        lab_fee REAL,
        transport_fee REAL,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS invoices (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        student_id TEXT,
        invoice_number TEXT,
        description TEXT,
        amount REAL,
        due_date TEXT,
        status TEXT DEFAULT 'Unpaid', -- Unpaid, Paid, Overdue
        created_at TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS payments (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        invoice_id INTEGER,
        payer_name TEXT,
        amount REAL,
        method TEXT,
        status TEXT DEFAULT 'Success',
        transaction_date TEXT,
        provider_ref TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS fines (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        student_id TEXT,
        fine_type TEXT,
        amount REAL,
        issued_date TEXT,
        status TEXT DEFAULT 'Unpaid',
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS payment_gateways (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        provider TEXT,
        is_enabled BOOLEAN DEFAULT TRUE,
        config_json TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # --- FINANCE CORE MASTER DATA ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        account_type TEXT NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
        parent_account_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
        UNIQUE (school_id, account_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS fiscal_years (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        year_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'Open', -- Open, Closed
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        UNIQUE (school_id, year_name)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS accounting_periods (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        fiscal_year_id INTEGER NOT NULL,
        period_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'Open', -- Open, Closed
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE CASCADE,
        UNIQUE (school_id, fiscal_year_id, period_name)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS tax_codes (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        rate REAL DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        UNIQUE (school_id, code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS cost_centers (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        center_code TEXT NOT NULL,
        center_name TEXT NOT NULL,
        department_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
        UNIQUE (school_id, center_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS finance_parties (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        party_type TEXT NOT NULL, -- Vendor, Customer, Employee
        party_code TEXT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_identifier TEXT,
        employee_user_id TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_user_id) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, party_type, party_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS currencies (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        currency_code TEXT NOT NULL,
        currency_name TEXT NOT NULL,
        symbol TEXT,
        decimal_places INTEGER DEFAULT 2,
        is_base BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        UNIQUE (school_id, currency_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS exchange_rates (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        rate REAL NOT NULL,
        effective_date TEXT NOT NULL,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        UNIQUE (school_id, from_currency, to_currency, effective_date)
    )
    """)

    # --- GENERAL LEDGER TABLES ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS accounts (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
        parent_account_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        UNIQUE (school_id, code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS periods (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        fiscal_year_id INTEGER,
        period_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'Open', -- Open, Closed
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id) ON DELETE SET NULL,
        UNIQUE (school_id, period_name)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS journal_entries (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        journal_number TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        description TEXT,
        reference TEXT,
        period_id INTEGER,
        status TEXT DEFAULT 'Draft', -- Draft, Posted, Reversed
        total_debit REAL DEFAULT 0,
        total_credit REAL DEFAULT 0,
        posted_at TEXT,
        posted_by TEXT,
        reversed_at TEXT,
        reversed_by TEXT,
        reversal_reason TEXT,
        reversed_entry_id INTEGER,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (period_id) REFERENCES periods(id) ON DELETE SET NULL,
        FOREIGN KEY (posted_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (reversed_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (reversed_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        UNIQUE (school_id, journal_number)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS journal_lines (
        id {pk_def},
        journal_entry_id INTEGER NOT NULL,
        line_no INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        description TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        cost_center_id INTEGER,
        tax_code_id INTEGER,
        party_id INTEGER,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
        FOREIGN KEY (party_id) REFERENCES finance_parties(id) ON DELETE SET NULL
    )
    """)

    # --- FINANCE SUB-LEDGERS (RECEIVABLES / PAYABLES) ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS customers (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        customer_code TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_identifier TEXT,
        linked_student_id TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_student_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, customer_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ar_invoices (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        invoice_number TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        invoice_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'Draft', -- Draft, Posted, Partially_Paid, Paid, Overdue, Cancelled
        gl_journal_id INTEGER,
        created_by TEXT,
        approved_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, invoice_number)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ar_invoice_lines (
        id {pk_def},
        invoice_id INTEGER NOT NULL,
        line_no INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        unit_price REAL DEFAULT 0,
        tax_code_id INTEGER,
        tax_rate REAL DEFAULT 0,
        line_amount REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        revenue_account_id INTEGER,
        FOREIGN KEY (invoice_id) REFERENCES ar_invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
        FOREIGN KEY (revenue_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ar_receipts (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        receipt_number TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        invoice_id INTEGER,
        receipt_date TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        reference TEXT,
        status TEXT DEFAULT 'Posted',
        gl_journal_id INTEGER,
        created_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
        FOREIGN KEY (invoice_id) REFERENCES ar_invoices(id) ON DELETE SET NULL,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, receipt_number)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS vendors (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        vendor_code TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        tax_identifier TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, vendor_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ap_bills (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        bill_number TEXT NOT NULL,
        vendor_id INTEGER NOT NULL,
        bill_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        subtotal REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'Draft', -- Draft, Posted, Partially_Paid, Paid, Overdue, Cancelled
        gl_journal_id INTEGER,
        created_by TEXT,
        approved_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, bill_number)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ap_bill_lines (
        id {pk_def},
        bill_id INTEGER NOT NULL,
        line_no INTEGER NOT NULL,
        description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        unit_price REAL DEFAULT 0,
        tax_code_id INTEGER,
        tax_rate REAL DEFAULT 0,
        line_amount REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        expense_account_id INTEGER,
        FOREIGN KEY (bill_id) REFERENCES ap_bills(id) ON DELETE CASCADE,
        FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
        FOREIGN KEY (expense_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS ap_payments (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        payment_number TEXT NOT NULL,
        vendor_id INTEGER NOT NULL,
        bill_id INTEGER,
        payment_date TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT,
        reference TEXT,
        status TEXT DEFAULT 'Posted',
        gl_journal_id INTEGER,
        created_by TEXT,
        approved_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
        FOREIGN KEY (bill_id) REFERENCES ap_bills(id) ON DELETE SET NULL,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, payment_number)
    )
    """)

    # --- INVENTORY ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS warehouses (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        location TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS items (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        category TEXT,
        unit TEXT DEFAULT 'Unit',
        cost_price REAL DEFAULT 0,
        sale_price REAL DEFAULT 0,
        inventory_account_id INTEGER,
        cogs_account_id INTEGER,
        expense_account_id INTEGER,
        revenue_account_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (cogs_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (expense_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (revenue_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, item_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS stock_moves (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        move_number TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        move_type TEXT NOT NULL, -- purchase_receipt, issue_sale, adjustment, transfer_in, transfer_out
        quantity REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        reference_type TEXT,
        reference_id TEXT,
        move_date TEXT NOT NULL,
        status TEXT DEFAULT 'Posted',
        gl_journal_id INTEGER,
        created_by TEXT,
        approved_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, move_number)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS stock_valuation (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        quantity_on_hand REAL DEFAULT 0,
        average_cost REAL DEFAULT 0,
        valuation_amount REAL DEFAULT 0,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        UNIQUE (school_id, item_id, warehouse_id)
    )
    """)

    # --- FIXED ASSETS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS asset_categories (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        useful_life_months INTEGER DEFAULT 60,
        depreciation_method TEXT DEFAULT 'SLM',
        asset_account_id INTEGER,
        depreciation_expense_account_id INTEGER,
        accumulated_depreciation_account_id INTEGER,
        disposal_gain_loss_account_id INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (depreciation_expense_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (disposal_gain_loss_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS fixed_assets (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        asset_code TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        acquisition_date TEXT NOT NULL,
        capitalization_date TEXT NOT NULL,
        cost REAL NOT NULL,
        residual_value REAL DEFAULT 0,
        useful_life_months INTEGER DEFAULT 60,
        depreciation_method TEXT DEFAULT 'SLM',
        status TEXT DEFAULT 'Active', -- Active, Disposed
        location TEXT,
        assigned_to TEXT,
        accumulated_depreciation REAL DEFAULT 0,
        carrying_amount REAL DEFAULT 0,
        gl_journal_id INTEGER,
        created_by TEXT,
        approved_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE RESTRICT,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, asset_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS depreciation_schedule (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        asset_id INTEGER NOT NULL,
        period_label TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        depreciation_amount REAL NOT NULL,
        status TEXT DEFAULT 'Planned', -- Planned, Posted
        gl_journal_id INTEGER,
        posted_at TEXT,
        posted_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (posted_by) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS asset_movements (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        asset_id INTEGER NOT NULL,
        movement_type TEXT NOT NULL, -- capitalization, depreciation, disposal, transfer
        movement_date TEXT NOT NULL,
        amount REAL DEFAULT 0,
        reference TEXT,
        gl_journal_id INTEGER,
        created_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (asset_id) REFERENCES fixed_assets(id) ON DELETE CASCADE,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    # --- PAYROLL ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS employees (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        employee_code TEXT NOT NULL,
        user_id TEXT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        department_id INTEGER,
        cost_center_id INTEGER,
        status TEXT DEFAULT 'Active',
        join_date TEXT,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
        FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, employee_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS salary_structures (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        employee_id INTEGER NOT NULL,
        effective_from TEXT NOT NULL,
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        employer_contribution REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS payroll_runs (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        run_code TEXT NOT NULL,
        period_label TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        pay_date TEXT,
        status TEXT DEFAULT 'Draft', -- Draft, Approved, Locked, Posted
        total_gross REAL DEFAULT 0,
        total_deductions REAL DEFAULT 0,
        total_tax REAL DEFAULT 0,
        total_net REAL DEFAULT 0,
        gl_journal_id INTEGER,
        approved_by TEXT,
        approved_at TEXT,
        locked_by TEXT,
        locked_at TEXT,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (gl_journal_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (locked_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, run_code)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS payroll_lines (
        id {pk_def},
        payroll_run_id INTEGER NOT NULL,
        employee_id INTEGER NOT NULL,
        basic_salary REAL DEFAULT 0,
        allowances REAL DEFAULT 0,
        deductions REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        net_pay REAL DEFAULT 0,
        status TEXT DEFAULT 'Generated',
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
    """)

    # --- SHARED POSTING ENGINE + CONTROLS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS finance_posting_rules (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        module TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        debit_account_id INTEGER NOT NULL,
        credit_account_id INTEGER NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by TEXT,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (debit_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (credit_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, module, transaction_type)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS finance_posting_events (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        module TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'Posted', -- Posted, Failed
        journal_entry_id INTEGER,
        event_payload TEXT,
        created_by TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES students(id) ON DELETE SET NULL,
        UNIQUE (school_id, idempotency_key)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS finance_approval_requests (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        module TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        requested_by TEXT,
        approved_by TEXT,
        status TEXT DEFAULT 'Pending',
        notes TEXT,
        requested_at TEXT,
        approved_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (requested_by) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (approved_by) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS finance_audit_logs (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        actor_id TEXT,
        details TEXT,
        created_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    # --- ADMISSIONS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS admissions (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        applicant_name TEXT,
        grade_applied TEXT,
        guardian_name TEXT,
        contact_email TEXT,
        contact_phone TEXT,
        status TEXT DEFAULT 'Pending',
        submitted_at TEXT,
        notes TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # --- STAFF PAY ADVANCE & LOANS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS staff_pay_advances (
        id {pk_def},
        user_id TEXT,
        amount REAL,
        reason TEXT,
        repayment_plan TEXT,
        status TEXT DEFAULT 'Pending',
        requested_at TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS staff_loans (
        id {pk_def},
        user_id TEXT,
        principal REAL,
        interest_rate REAL,
        term_months INTEGER,
        status TEXT DEFAULT 'Active',
        issued_at TEXT,
        next_due_date TEXT,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE SET NULL
    )
    """)

    # --- TRANSPORTATION & GPS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS transport_vehicles (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        vehicle_number TEXT,
        capacity INTEGER,
        driver_name TEXT,
        driver_phone TEXT,
        status TEXT DEFAULT 'Active',
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS transport_routes (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        route_name TEXT,
        vehicle_id INTEGER,
        start_point TEXT,
        end_point TEXT,
        start_time TEXT,
        end_time TEXT,
        FOREIGN KEY (vehicle_id) REFERENCES transport_vehicles(id) ON DELETE SET NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS transport_stops (
        id {pk_def},
        route_id INTEGER,
        stop_name TEXT,
        stop_time TEXT,
        sequence INTEGER,
        FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE CASCADE
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS transport_assignments (
        id {pk_def},
        student_id TEXT,
        route_id INTEGER,
        pickup_stop TEXT,
        dropoff_stop TEXT,
        status TEXT DEFAULT 'Active',
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        FOREIGN KEY (route_id) REFERENCES transport_routes(id) ON DELETE SET NULL
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS gps_locations (
        id {pk_def},
        vehicle_id INTEGER,
        latitude REAL,
        longitude REAL,
        speed REAL,
        recorded_at TEXT,
        FOREIGN KEY (vehicle_id) REFERENCES transport_vehicles(id) ON DELETE CASCADE
    )
    """)

    # --- FEEDBACK SUBMISSIONS ---
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS feedback_submissions (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        submitted_by TEXT,
        category TEXT,
        message TEXT,
        rating INTEGER,
        submitted_at TEXT,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    )
    """)

    # --- FULL FEATURE TABLES (FR-6) ---
    
    # 1. Timetable
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS timetables (
        id {pk_def},
        class_grade INTEGER,
        section TEXT, -- A, B, C
        day_of_week TEXT, -- Monday, Tuesday...
        period_number INTEGER,
        start_time TEXT,
        end_time TEXT,
        subject TEXT,
        teacher_id TEXT,
        FOREIGN KEY (teacher_id) REFERENCES students(id)
    )
    """)

    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS timetable_pdfs (
        id {pk_def},
        school_id INTEGER DEFAULT 1,
        class_grade INTEGER NOT NULL,
        section TEXT,
        title TEXT NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # 2. Assignment Submissions
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS assignment_submissions (
        id {pk_def},
        assignment_id INTEGER,
        student_id TEXT,
        submitted_at TEXT,
        file_url TEXT,
        content_text TEXT,
        status TEXT DEFAULT 'Submitted', -- Submitted, Graded, Reassigned
        grade REAL,
        feedback TEXT,
        ai_feedback TEXT,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # 3. Leave Requests (Student & Teacher)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS leave_requests (
        id {pk_def},
        user_id TEXT,
        type TEXT, -- Sick, Casual, etc.
        start_date TEXT,
        end_date TEXT,
        reason TEXT,
        status TEXT DEFAULT 'Pending', -- Pending, Approved, Denied
        reviewed_by TEXT,
        created_at TEXT,
        FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)

    # 3a. Leave Reassignments (Teacher coverage during leave)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS leave_reassignments (
        id {pk_def},
        leave_id INTEGER,
        original_teacher_id TEXT,
        substitute_teacher_id TEXT,
        assigned_by TEXT,
        assigned_at TEXT,
        FOREIGN KEY (leave_id) REFERENCES leave_requests(id) ON DELETE CASCADE
    )
    """)

    # 4. Internal Email/Messages
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS emails (
        id {pk_def},
        sender_id TEXT,
        recipient_email TEXT, -- Can be group (e.g., 'Grade 10')
        subject TEXT,
        body TEXT,
        sent_at TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (sender_id) REFERENCES students(id)
    )
    """)

    # 5. Question Bank (Online Test)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS question_banks (
        id {pk_def},
        teacher_id TEXT,
        grade INTEGER,
        subject TEXT,
        topic TEXT,
        question_text TEXT,
        question_type TEXT, -- MCQ, Essay
        options TEXT, -- JSON
        correct_answer TEXT,
        marks INTEGER,
        created_at TEXT
    )
    """)

    # 6. Student Marks (Progress Card)
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS student_marks (
        id {pk_def},
        student_id TEXT,
        exam_name TEXT, -- Midterm, Final
        subject TEXT,
        marks_obtained REAL,
        max_marks REAL,
        grade TEXT, -- A, B, C
        remarks TEXT,
        date TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
    """)
    safe_migrate("ALTER TABLE student_marks ADD COLUMN published INTEGER DEFAULT 0")
    safe_migrate("ALTER TABLE student_marks ADD COLUMN published_at TEXT")
    safe_migrate("ALTER TABLE student_marks ADD COLUMN published_by TEXT")

    conn.commit()
    
    # --- SEED RBAC DATA ---
    seed_rbac_data(conn)
    seed_finance_master_data(conn)
    seed_resource_library_data(conn)

    conn.close()

def seed_rbac_data(conn):
    cursor = conn.cursor()
    
    # 1. Permissions List
    # Mapped from requirements
    perms = [
        ('user_management', 'Manage Users (Create/Edit/Delete)', 'User Management'),
        ('role_management', 'Manage Roles & Permissions', 'Role Management'),
        ('permission_management', 'View Platform Permissions', 'Permission Management'),
        ('school.manage', 'Manage Institutions', 'System'),
        ('class.view', 'View Classes', 'Academics'),
        ('class.create', 'Create/Schedule Classes', 'Academics'),
        ('class.edit', 'Edit Classes', 'Academics'),
        ('assignment.view', 'View Assignments', 'Academics'),
        ('assignment.create', 'Create Assignments', 'Academics'),
        ('assignment.grade', 'Grade Assignments', 'Academics'),
        ('reports.view', 'View Reports/Analytics', 'Analytics'),
        ('finance.view', 'View Finance', 'Administration'),
        ('finance.dashboard.read', 'View Finance Dashboard', 'Finance'),
        ('finance.reports.read', 'View Finance Reports', 'Finance'),
        ('finance.masterdata.read', 'View Finance Master Data', 'Finance'),
        ('finance.masterdata.manage', 'Manage Finance Master Data', 'Finance'),
        ('communication.view', 'View Communication', 'Communication'),
        ('communication.announce', 'Post Announcements', 'Communication'),
        ('communication.events', 'Manage Calendar Events', 'Communication'),
        ('compliance.view', 'View Compliance & Security', 'Compliance'),
        ('compliance.manage', 'Manage Compliance Settings', 'Compliance'),
        ('finance.manage', 'Manage Finance Settings', 'Finance'),
        
        # New Detailed Permissions
        ('finance.invoices', 'Manage Invoices', 'Finance'),
        ('finance.payroll', 'Manage Payroll', 'Finance'),
        ('finance.payroll.self.read', 'View Own Payroll', 'Finance'),
        ('finance.fees.self.read', 'View Own Fee Invoices', 'Finance'),
        ('finance.fees.child.read', "View Child's Fee Invoices", 'Finance'),
        ('finance.gl.manage', 'Manage General Ledger', 'Finance'),
        ('finance.receivables.manage', 'Manage Receivables', 'Finance'),
        ('finance.payables.manage', 'Manage Payables', 'Finance'),
        ('finance.payables.approve', 'Approve Payables', 'Finance'),
        ('finance.inventory.manage', 'Manage Inventory Accounting', 'Finance'),
        ('finance.assets.manage', 'Manage Asset Accounting', 'Finance'),
        ('finance.payroll.manage', 'Manage Payroll Runs', 'Finance'),
        ('finance.payroll.approve', 'Approve and Lock Payroll', 'Finance'),
        ('finance.posting.manage', 'Manage Finance Posting Rules', 'Finance'),
        ('finance.approvals.manage', 'Manage Finance Approvals', 'Finance'),
        ('finance.period.close', 'Close Accounting Periods', 'Finance'),
        ('finance.audit.read', 'View Finance Audit Logs', 'Finance'),
        ('staff.view', 'View Staff & Faculty', 'HR'),
        ('staff.manage', 'Manage Staff & Faculty', 'HR'),
        ('staff.assets', 'Manage Assets & Lending', 'HR'),
        
        ('student.info.view', 'View Student Information', 'Student Info'),
        ('student.info.manage', 'Manage Student Information', 'Student Info'),
        ('student.progress.view', 'View Student Progress', 'Student Info'),
        ('attendance.manage', 'Manage Student Attendance', 'Academics'),
    ]

    # Create Finance Settings Table if not exists
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS finance_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        description TEXT
    )
    """)

    # ---------------------------------------------------------
    # MIGRATIONS (Ensure Schema is Up-to-Date)
    # ---------------------------------------------------------
    try:
        cursor.execute("ALTER TABLE resources ADD COLUMN extracted_text TEXT")
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "duplicate column name" not in str(e).lower():
            logger.warning(f"Migration warning (resources.extracted_text): {e}")

    for code, desc, group in perms:
        cursor.execute("INSERT INTO permissions (code, description, group_name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", (code, desc, group))
    
    conn.commit()
    
    # 2. Key Roles
    # Ensuring we have the roles requested
    roles_def = [
        ('Root_Super_Admin', 'Root Access - Full System Control'),
        ('Admin', 'Institution Admin'),
        ('Principal', 'School Principal'),
        ('Tenant_Admin', 'School Administrator (Principal)'),
        ('Academic_Admin', 'Academic Coordinator'),
        ('Teacher', 'Faculty Member'),
        ('Student', 'Learner'),
        ('Parent_Guardian', 'Parent/Guardian'),
        ('Finance_Officer', 'Finance Manager'),
        ('accountant', 'General Accountant'),
        ('payroll_officer', 'Payroll Operations Officer'),
        ('HR_Admin', 'Human Resources Admin')
    ]

    for r_name, r_desc in roles_def:
        # Check if role exists to avoid ON CONFLICT error
        exists = cursor.execute("SELECT id FROM roles WHERE name = ?", (r_name,)).fetchone()
        if not exists:
            cursor.execute("INSERT INTO roles (name, description, is_system) VALUES (?, ?, TRUE)", (r_name, r_desc))
    
    conn.commit()
    
    # Fetch IDs
    roles = {row['name']: row['id'] for row in cursor.execute("SELECT name, id FROM roles WHERE is_system = TRUE").fetchall()}
    all_perms = {row['code']: row['id'] for row in cursor.execute("SELECT code, id FROM permissions").fetchall()}

    # 3. Assign Default Permissions
    def assign(role_name, perm_codes):
        if role_name not in roles: return
        r_id = roles[role_name]
        
        # Clear existing permissions for system roles to ensure update matches specs
        cursor.execute("DELETE FROM role_permissions WHERE role_id = ?", (r_id,))
        
        for p_code in perm_codes:
            if p_code == '*':
                 for p_id in all_perms.values():
                     cursor.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING", (r_id, p_id))
            elif p_code in all_perms:
                cursor.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING", (r_id, all_perms[p_code]))

    # Root Super Admin (Restricted to student + school record management only)
    assign('Root_Super_Admin', [
        'student.info.view',
        'student.info.manage',
        'school.manage',
    ])
    
    # Tenant Admin (School Management)
    assign('Tenant_Admin', [
        'user_management', 'role_management', 'permission_management', 
        'class.view', 'reports.view', 
        'finance.view', 'finance.dashboard.read', 'finance.reports.read',
        'finance.masterdata.read', 'finance.masterdata.manage',
        'finance.manage', 'finance.invoices', 'finance.payroll',
        'finance.payroll.manage', 'finance.payroll.approve',
        'finance.gl.manage', 'finance.receivables.manage', 'finance.payables.manage',
        'finance.inventory.manage', 'finance.assets.manage', 'finance.payables.approve',
        'finance.posting.manage', 'finance.approvals.manage', 'finance.period.close', 'finance.audit.read',
        'communication.view', 'communication.announce', 'communication.events', 
        'compliance.view', 'compliance.manage', 
        'staff.view', 'staff.manage', 
        'student.info.view', 'student.info.manage', 'student.progress.view'
    ])

    # Admin (full finance ownership)
    assign('Admin', [
        'user_management', 'role_management', 'permission_management',
        'class.view', 'reports.view',
        'finance.view', 'finance.dashboard.read', 'finance.reports.read',
        'finance.masterdata.read', 'finance.masterdata.manage',
        'finance.manage', 'finance.invoices', 'finance.payroll',
        'finance.payroll.manage', 'finance.payroll.approve',
        'finance.gl.manage', 'finance.receivables.manage', 'finance.payables.manage',
        'finance.inventory.manage', 'finance.assets.manage', 'finance.payables.approve',
        'finance.posting.manage', 'finance.approvals.manage', 'finance.period.close', 'finance.audit.read',
        'communication.view', 'communication.announce', 'communication.events',
        'staff.view', 'staff.manage',
        'student.info.view', 'student.info.manage', 'student.progress.view'
    ])

    # Principal (read-only finance + optional approvals)
    assign('Principal', [
        'class.view', 'reports.view',
        'finance.view', 'finance.dashboard.read', 'finance.reports.read', 'finance.masterdata.read', 'finance.payables.approve',
        'communication.view', 'student.info.view', 'student.progress.view'
    ])
    
    # Academic Admin (Curriculum Focus)
    assign('Academic_Admin', [
        'class.view', 'class.create', 'class.edit', 
        'assignment.view', 'assignment.create', 
        'student.info.view', 'student.progress.view',
        'reports.view'
    ])

    # Teacher
    assign('Teacher', [
        'class.view', 'class.create', 'class.edit', 
        'assignment.view', 'assignment.create', 'assignment.grade', 
        'communication.view', 'communication.announce', 'communication.events',
        'student.info.view', 'student.progress.view',
        'attendance.manage', # Implicitly handle attendance via class/activity
        'finance.payroll.self.read'
    ])

    # Student
    assign('Student', [
        'class.view', 'assignment.view', 'student.progress.view', 'communication.view',
        'finance.fees.self.read'
    ])

    # Parent_Guardian
    assign('Parent_Guardian', [
        'student.progress.view', 'finance.fees.child.read', 'communication.view'
    ])

    # Finance_Officer
    assign('Finance_Officer', [
        'finance.view', 'finance.dashboard.read', 'finance.reports.read',
        'finance.masterdata.read', 'finance.masterdata.manage',
        'finance.manage', 'finance.invoices', 'finance.payroll',
        'finance.payroll.manage', 'finance.payroll.approve',
        'finance.gl.manage', 'finance.receivables.manage', 'finance.payables.manage',
        'finance.inventory.manage', 'finance.assets.manage', 'finance.payables.approve',
        'finance.posting.manage', 'finance.approvals.manage', 'finance.period.close', 'finance.audit.read'
    ])

    # Accountant
    assign('accountant', [
        'finance.view', 'finance.dashboard.read', 'finance.reports.read',
        'finance.masterdata.read', 'finance.masterdata.manage',
        'finance.gl.manage', 'finance.receivables.manage', 'finance.payables.manage',
        'finance.inventory.manage', 'finance.assets.manage', 'finance.payables.approve',
        'finance.posting.manage', 'finance.audit.read'
    ])

    # Payroll Officer
    assign('payroll_officer', [
        'finance.view', 'finance.dashboard.read', 'finance.reports.read',
        'finance.payroll', 'finance.payroll.manage', 'finance.payroll.approve',
        'finance.payroll.self.read', 'finance.masterdata.read', 'finance.audit.read'
    ])

    # HR_Admin
    assign('HR_Admin', [
        'staff.view', 'staff.manage', 'staff.assets'
    ])

    conn.commit()

def seed_finance_master_data(conn):
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    try:
        existing_currency = cursor.execute(
            "SELECT id FROM currencies WHERE school_id = 1 AND currency_code = 'USD'"
        ).fetchone()
        if not existing_currency:
            cursor.execute(
                """
                INSERT INTO currencies (school_id, currency_code, currency_name, symbol, decimal_places, is_base, is_active, created_at, updated_at)
                VALUES (1, 'USD', 'US Dollar', '$', 2, TRUE, TRUE, ?, ?)
                """,
                (now, now)
            )

        coa_rows = cursor.execute(
            "SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE school_id = 1"
        ).fetchone()
        if (coa_rows["cnt"] or 0) == 0:
            seed_accounts = [
                ("1000", "Cash and Bank", "Asset"),
                ("1100", "Accounts Receivable", "Asset"),
                ("1200", "Inventory", "Asset"),
                ("1300", "Fixed Assets", "Asset"),
                ("2000", "Accounts Payable", "Liability"),
                ("2100", "Payroll Payable", "Liability"),
                ("2200", "Tax Payable", "Liability"),
                ("3000", "Retained Earnings", "Equity"),
                ("4000", "Fee Revenue", "Revenue"),
                ("4100", "Other Revenue", "Revenue"),
                ("5000", "Payroll Expense", "Expense"),
                ("5100", "Operating Expense", "Expense")
            ]
            for code, name, a_type in seed_accounts:
                cursor.execute(
                    """
                    INSERT INTO chart_of_accounts (school_id, account_code, account_name, account_type, created_at, updated_at)
                    VALUES (1, ?, ?, ?, ?, ?)
                    """,
                    (code, name, a_type, now, now)
                )

        # Seed GL accounts from CoA when accounts table is empty
        acc_rows = cursor.execute(
            "SELECT COUNT(*) AS cnt FROM accounts WHERE school_id = 1"
        ).fetchone()
        if (acc_rows["cnt"] or 0) == 0:
            coa_seed = cursor.execute(
                """
                SELECT account_code, account_name, account_type, description
                FROM chart_of_accounts
                WHERE school_id = 1
                ORDER BY account_code
                """
            ).fetchall()
            for r in coa_seed:
                cursor.execute(
                    """
                    INSERT INTO accounts (school_id, code, name, account_type, description, is_active, created_at, updated_at)
                    VALUES (1, ?, ?, ?, ?, TRUE, ?, ?)
                    """,
                    (r["account_code"], r["account_name"], r["account_type"], r["description"], now, now)
                )

        # Seed default posting rules
        code_to_id = {}
        for row in cursor.execute("SELECT id, code FROM accounts WHERE school_id = 1").fetchall():
            code_to_id[row["code"]] = row["id"]
        default_rules = [
            ("receivables", "AR_INVOICE", "1100", "4000", "Invoice posting"),
            ("receivables", "AR_RECEIPT", "1000", "1100", "Receipt posting"),
            ("payables", "AP_BILL", "5100", "2000", "Bill posting"),
            ("payables", "AP_PAYMENT", "2000", "1000", "Payment posting"),
            ("inventory", "INVENTORY_PURCHASE", "1200", "2000", "Inventory purchase"),
            ("inventory", "INVENTORY_ISSUE", "5100", "1200", "Inventory issue"),
            ("assets", "ASSET_CAPITALIZATION", "1300", "1000", "Asset capitalization"),
            ("assets", "ASSET_DEPRECIATION", "5100", "1300", "Asset depreciation"),
            ("assets", "ASSET_DISPOSAL", "1000", "1300", "Asset disposal"),
        ]
        for module, txn, dr_code, cr_code, desc in default_rules:
            dr_id = code_to_id.get(dr_code)
            cr_id = code_to_id.get(cr_code)
            if not dr_id or not cr_id:
                continue
            cursor.execute(
                """
                INSERT INTO finance_posting_rules (school_id, module, transaction_type, debit_account_id, credit_account_id, description, is_active, created_at, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, TRUE, ?, ?)
                ON CONFLICT DO NOTHING
                """,
                (module, txn, dr_id, cr_id, desc, now, now)
            )
        conn.commit()
    except Exception:
        conn.rollback()

def seed_resource_library_data(conn):
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    uploaded_by = "admin_user"

    resources_dir = os.path.join(STATIC_DIR, "resources")
    os.makedirs(resources_dir, exist_ok=True)

    try:
        school_rows = cursor.execute("SELECT id FROM schools").fetchall()
        school_ids = [int(r["id"]) for r in school_rows if r["id"] is not None] if school_rows else [1]
        if not school_ids:
            school_ids = [1]

        for template_key, template in FORM_RESOURCE_TEMPLATES.items():
            title = (template.get("title") or "").strip()
            if not title:
                continue
            description = (template.get("description") or "").strip()
            content = template.get("content") or ""

            filename = f"seed_form_{template_key}.txt"
            file_location = os.path.join(resources_dir, filename)
            web_path = f"/static/resources/{filename}"

            if not os.path.exists(file_location):
                with open(file_location, "w", encoding="utf-8") as fh:
                    fh.write(content)

            for school_id in school_ids:
                existing = cursor.execute(
                    """
                    SELECT id
                    FROM resources
                    WHERE school_id = ?
                      AND LOWER(TRIM(category)) IN ('form', 'forms', 'leave/admin form')
                      AND LOWER(TRIM(title)) = LOWER(TRIM(?))
                    LIMIT 1
                    """,
                    (school_id, title)
                ).fetchone()
                if existing:
                    continue

                cursor.execute(
                    """
                    INSERT INTO resources (title, description, category, file_path, uploaded_by, uploaded_at, school_id)
                    VALUES (?, ?, 'Form', ?, ?, ?, ?)
                    """,
                    (title, description, web_path, uploaded_by, now, school_id)
                )
        conn.commit()
    except Exception:
        conn.rollback()

# --- RBAC API ROUTES ---
@app.get("/api/admin/roles", response_model=List[RoleResponse])
async def get_roles(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        roles = conn.execute("SELECT * FROM roles").fetchall()
        
        result = []
        for r in roles:
            # Fetch permissions for each role
            perms = conn.execute("""
                SELECT p.id, p.code, p.description 
                FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = ?
            """, (r['id'],)).fetchall()
            
            result.append(RoleResponse(
                id=r['id'],
                code=r['name'].replace(' ', '_').upper(), # Dynamic code generation if missing
                name=r['name'],
                description=r['description'] or "",
                status=r['status'],
                is_system=bool(r['is_system']),
                permissions=[dict(p) for p in perms]
            ))
        return result
    finally:
        conn.close()

@app.get("/api/admin/permissions")
async def get_permissions(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("permission_management", x_user_id=x_user_id)

    conn = get_db_connection()
    perms = conn.execute("SELECT * FROM permissions ORDER BY group_name, code").fetchall()
    
    # Group by 'group_name'
    grouped = {}
    for p in perms:
        g = p['group_name']
        if g not in grouped: grouped[g] = []
        grouped[g].append({"id": p['id'], "code": p['code'], "description": p['description']})
    
    conn.close()
    return grouped

@app.get("/api/admin/permissions/list")
async def get_permissions_list(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("permission_management", x_user_id=x_user_id)

    conn = get_db_connection()
    perms = conn.execute("SELECT * FROM permissions ORDER BY id").fetchall()
    
    result = []
    for p in perms:
        # Format Code P-XXX
        formatted_code = f"P-{p['id']:04d}"
        
        result.append({
            "id": p['id'],
            "display_code": formatted_code,
            "code": p['code'],
            "description": p['description'],
            "group_name": p['group_name']
        })
    conn.close()
    return result

class UpdatePermissionRequest(BaseModel):
    description: str

@app.put("/api/admin/permissions/{perm_id}")
async def update_permission(perm_id: int, req: UpdatePermissionRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("permission_management", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE permissions SET description = ? WHERE id = ?", (req.description, perm_id))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Permission not found")
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/admin/roles/{role_id}")
async def get_role_details(role_id: int):
    conn = get_db_connection()
    role = conn.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not role:
        conn.close()
        raise HTTPException(status_code=404, detail="Role not found")
        
    perms = conn.execute("""
        SELECT p.id, p.code, p.description 
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id = ?
    """, (role_id,)).fetchall()
    
    conn.close()
    return {
        "id": role['id'],
        "code": f"R-{role['id']:03d}",
        "name": role['name'],
        "description": role['description'],
        "status": role['status'],
        "is_system": role['is_system'],
        "permissions": [{"id": p['id'], "code": p['code'], "description": p['description']} for p in perms]
    }

class ReportsSummaryResponse(BaseModel):
    academic_performance: Dict[str, float]
    attendance_trends: List[Dict[str, Any]]
    financial_summary: Dict[str, float]
    staff_utilization: Dict[str, Any]

@app.get("/api/reports/summary")
async def get_reports_summary(user_id: str = Header(None, alias="X-User-Id"), role: str = Header(None, alias="X-User-Role")):
    # Check permissions 
    # if role not in ['Teacher', 'Principal', 'Super Admin']:
    #    raise HTTPException(status_code=403, detail="Unauthorized")

    conn = get_db_connection()
    c = conn.cursor()

    # 1. Academic Performance (Real)
    stats = c.execute("SELECT AVG(math_score) as math, AVG(science_score) as science, AVG(english_language_score) as english, AVG(attendance_rate) as attendance FROM students WHERE role = 'Student'").fetchone()
    
    math = stats['math'] if stats and stats['math'] is not None else 0
    science = stats['science'] if stats and stats['science'] is not None else 0
    english = stats['english'] if stats and stats['english'] is not None else 0
    att = stats['attendance'] if stats and stats['attendance'] is not None else 0

    academic = {
        "math_avg": round(math, 1),
        "science_avg": round(science, 1),
        "english_avg": round(english, 1),
        "overall_avg": round((math + science + english) / 3, 1)
    }

    # 2. Attendance Trends (Mocked + Current)
    attendance_trends = [
        {"month": "Jan", "rate": 88},
        {"month": "Feb", "rate": 90},
        {"month": "Mar", "rate": 85},
        {"month": "Apr", "rate": 92},
        {"month": "May", "rate": 94},
        {"month": "Jun", "rate": round(att, 1)}
    ]

    # 3. Financial Summaries (Mocked)
    finance = {
        "revenue": 150000.00,
        "expenses": 95000.00,
        "net_income": 55000.00,
        "outstanding_fees": 12000.00
    }

    # 4. Staff Utilization (Real-ish)
    teacher_count = c.execute("SELECT COUNT(*) as count FROM students WHERE role = 'Teacher'").fetchone()['count']
    student_count = c.execute("SELECT COUNT(*) as count FROM students WHERE role = 'Student'").fetchone()['count']

    ratio = 0
    if teacher_count > 0:
        ratio = round(student_count / teacher_count, 1)
    
    staff_utilization = {
        "total_staff": teacher_count,
        "active_classes": teacher_count * 4, # Assumption: 4 classes per teacher
        "student_teacher_ratio": f"{ratio}:1",
        "utilization_rate": 85.5
    }

    conn.close()

    return {
        "academic_performance": academic,
        "attendance_trends": attendance_trends,
        "financial_summary": finance,
        "staff_utilization": staff_utilization
    }


@app.post("/api/admin/roles")
async def create_role(req: RoleCreateRequest):
    conn = get_db_connection()
    try:
        # Create Role
        cur = conn.cursor()
        cur.execute("INSERT INTO roles (name, description, status, is_system) VALUES (?, ?, ?, FALSE) RETURNING id", (req.name, req.description, req.status))
        role_id = cur.fetchone()['id']
        
        # Add perms
        for p_code in req.permissions:
            perm = cur.execute("SELECT id FROM permissions WHERE code = ?", (p_code,)).fetchone()
            if perm:
                cur.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", (role_id, perm['id']))
        
        conn.commit()
        return {"success": True, "role_id": role_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/admin/roles/{role_id}")
async def update_role(role_id: int, req: RoleCreateRequest):
    conn = get_db_connection()
    try:
        # Update Role Info
        cur = conn.cursor()
        cur.execute("UPDATE roles SET name = ?, description = ?, status = ? WHERE id = ?", (req.name, req.description, req.status, role_id))
        
        # Update Perms (Wipe and recreate)
        cur.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
        for p_code in req.permissions:
            perm = cur.execute("SELECT id FROM permissions WHERE code = ?", (p_code,)).fetchone()
            if perm:
                cur.execute("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", (role_id, perm['id']))
                
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
        
@app.delete("/api/admin/roles/{role_id}")
async def delete_role(role_id: int):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        # Check if system
        role = cur.execute("SELECT is_system FROM roles WHERE id = ?", (role_id,)).fetchone()
        if role and role['is_system']:
             raise HTTPException(status_code=403, detail="Cannot delete system roles.")
             
        cur.execute("DELETE FROM roles WHERE id = ?", (role_id,))
        conn.commit()
        return {"success": True}
    except HTTPException as he:
        raise he
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


    conn.commit()
    # ------------------------------------------------------------------

    # Ensure Teacher has correct role
    cursor.execute("UPDATE students SET role = 'Teacher' WHERE id = 'teacher'")
    cursor.execute("UPDATE students SET password = ? WHERE id = 'teacher'", (TEACHER_LOGIN_PASSWORD,))
    cursor.execute("UPDATE students SET password = ? WHERE id = 'admin'", (ADMIN_LOGIN_PASSWORD,))
    conn.commit()
    # Seed Timetable
    cursor.execute("SELECT COUNT(*) FROM timetables")
    if cursor.fetchone()[0] == 0:
        # Teacher ID 'teacher'
        tt_data = [
            (9, 'A', 'Monday', 1, '09:00', '10:00', 'Mathematics', 'teacher'),
            (10, 'B', 'Monday', 2, '10:00', '11:00', 'Science', 'teacher'),
            (9, 'A', 'Tuesday', 1, '09:00', '10:00', 'Mathematics', 'teacher'),
            (11, 'C', 'Tuesday', 3, '11:00', '12:00', 'Physics', 'teacher'),
            (10, 'B', 'Wednesday', 2, '10:00', '11:00', 'Science', 'teacher'),
            (9, 'A', 'Thursday', 4, '13:00', '14:00', 'History', 'teacher'),
            (10, 'B', 'Friday', 1, '09:00', '10:00', 'Science Lab', 'teacher')
        ]
        cursor.executemany("INSERT INTO timetables (class_grade, section, day_of_week, period_number, start_time, end_time, subject, teacher_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", tt_data)
        conn.commit()

    # Seed Leave Requests
    cursor.execute("SELECT COUNT(*) FROM leave_requests")
    if cursor.fetchone()[0] == 0:
        leaves = [
            ('S001', 'Sick Leave', '2025-10-10', '2025-10-12', 'High Fever', 'Approved', 'teacher', datetime.now().isoformat()),
            ('S002', 'Casual Leave', '2025-11-05', '2025-11-06', 'Family Function', 'Pending', None, datetime.now().isoformat()),
            ('teacher', 'Sick Leave', '2025-12-01', '2025-12-02', 'Medical Checkup', 'Pending', None, datetime.now().isoformat())
        ]
        cursor.executemany("INSERT INTO leave_requests (user_id, type, start_date, end_date, reason, status, reviewed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", leaves)
        conn.commit()

    # Seed Schools
    cursor.execute("SELECT COUNT(*) FROM schools")
    if cursor.fetchone()[0] == 0:
        created_at = datetime.now().isoformat()
        cursor.execute("INSERT INTO schools (name, address, contact_email, created_at) VALUES ('Noble Nexus Academy', '123 Main St', 'contact@noblenexus.com', ?)", (created_at,))
        cursor.execute("INSERT INTO schools (name, address, contact_email, created_at) VALUES ('Global Tech High', '456 Tech Ave', 'admin@globaltech.edu', ?)", (created_at,))
        conn.commit()

    # Seed data only if tables are empty
    cursor.execute("SELECT COUNT(*) FROM students")
    if cursor.fetchone()[0] == 0:
        students_data = [
            ('S001', 'Alice Smith', 9, 'Maths', 92.5, 'English', '123', 85.0, 78.5, 90.0, 'Student', 0, None, 1, False),
            ('S002', 'Bob Johnson', 10, 'Science', 85.0, 'Spanish', '123', 60.0, 95.0, 75.0, 'Student', 0, None, 1, False),
            ('SURJEET', 'Surjeet J', 11, 'Science', 77.0, 'Punjabi', '123', 70.0, 65.0, 80.0, 'Student', 0, None, 1, False),
            ('DEVA', 'Deva Krishnan', 11, 'Tamil', 90.0, 'Tamil', '123', 95.0, 88.0, 92.0, 'Student', 0, None, 1, False),
            ('HARISH', 'Harish Boy', 5, 'English', 7.0, 'Hindi', '123', 50.0, 50.0, 45.0, 'Student', 0, None, 1, False),
            ('teacher', 'Teacher Admin', 0, 'All', 100.0, 'English', TEACHER_LOGIN_PASSWORD, 100.0, 100.0, 100.0, 'Teacher', 0, None, 1, False), 
            ('superadmin', 'Super Admin', 0, 'All', 100.0, 'English', 'superadmin', 100.0, 100.0, 100.0, 'Admin', 0, None, 1, True),
            ('admin', 'System Admin', 0, 'All', 100.0, 'English', ADMIN_LOGIN_PASSWORD, 100.0, 100.0, 100.0, 'Admin', 0, None, 1, True),
        ]
        cursor.executemany("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, failed_login_attempts, locked_until, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", students_data)

        activities_data = [
            ('S001', '2025-11-01', 'Algebra', 'Medium', 95, 10),
            ('S001', '2025-11-03', 'Geometry', 'Medium', 65, 25), 
            ('S002', '2025-11-01', 'Physics', 'Medium', 40, 45),
            ('S002', '2025-11-02', 'Chemistry', 'Easy', 55, 30),
            ('HARISH', '2025-11-10', 'Reading', 'Easy', 80, 15),
            ('SURJEET', '2025-11-12', 'Physics', 'Medium', 88.0, 45),
            ('SURJEET', '2025-11-14', 'Chemistry', 'Hard', 76.5, 60),
            ('SURJEET', '2025-11-15', 'Biology', 'Easy', 92.0, 30),
            ('SURJEET', '2025-11-16', 'Maths', 'Hard', 85.0, 50),
            ('SURJEET', '2025-11-18', 'English', 'Medium', 90.0, 40),
            ('DEVA', '2025-11-12', 'Tamil', 'Medium', 95.0, 30),
            ('DEVA', '2025-11-13', 'English', 'Hard', 82.0, 45),
            ('DEVA', '2025-11-14', 'Maths', 'Medium', 88.0, 50),
        ]
        for a in activities_data:
             cursor.execute("INSERT INTO activities (student_id, date, topic, difficulty, score, time_spent_min) VALUES (?, ?, ?, ?, ?, ?)", a)
        
    # Ensure Teacher and Admin exist
    cursor.execute("SELECT id FROM students WHERE id = 'teacher'")
    if not cursor.fetchone():
         cursor.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, failed_login_attempts, locked_until, school_id, is_super_admin) VALUES (?, 'Teacher Admin', 0, 'All', 100.0, 'English', ?, 100.0, 100.0, 100.0, 'Teacher', 0, NULL, 1, 0)", ('teacher', TEACHER_LOGIN_PASSWORD))
    
    cursor.execute("SELECT id FROM students WHERE id = 'admin'")
    if not cursor.fetchone():
         cursor.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, failed_login_attempts, locked_until, school_id, is_super_admin) VALUES ('admin', 'System Admin', 0, 'All', 100.0, 'English', ?, 100.0, 100.0, 100.0, 'Admin', 0, NULL, 1, 1)", (ADMIN_LOGIN_PASSWORD,))
    else:
         cursor.execute("UPDATE students SET role = 'Admin', is_super_admin = 1, password = ? WHERE id = 'admin'", (ADMIN_LOGIN_PASSWORD,))

    cursor.execute("SELECT id FROM students WHERE id = 'rootadmin'")
    if not cursor.fetchone():
         cursor.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, failed_login_attempts, locked_until, school_id, is_super_admin, email_verified) VALUES ('rootadmin', 'Root Admin', 0, 'All', 100.0, 'English', ?, 100.0, 100.0, 100.0, 'Root_Super_Admin', 0, NULL, 1, 0, 1)", (ADMIN_LOGIN_PASSWORD,))
    else:
         cursor.execute("UPDATE students SET role = 'Root_Super_Admin', is_super_admin = 0, password = ?, email_verified = TRUE WHERE id = 'rootadmin'", (ADMIN_LOGIN_PASSWORD,))

    # Backward compatibility: migrate old finance_admin users to Root Super Admin access.
    cursor.execute(
        "UPDATE students SET role = 'Root_Super_Admin', is_super_admin = 0, password = ? WHERE LOWER(role) = LOWER('finance_admin')",
        (ADMIN_LOGIN_PASSWORD,)
    )

    # Seed demo codes for existing users (Check individually to ensure all are present)
    demo_codes = [
        ('teacher', '928471'), ('teacher', '582931'),
        ('admin', '736102'),
        ('rootadmin', '445566'),
        ('S001', '519384'),
        ('S002', '123456'),
        ('SURJEET', '192837'),
        ('DEVA', '112233'),
        ('HARISH', '998877')
    ]
    now = datetime.now().isoformat()
    for uid, code in demo_codes:
         # Check if this specific code exists
         cursor.execute("SELECT 1 FROM backup_codes WHERE user_id = ? AND code = ?", (uid, code))
         if not cursor.fetchone():
             # Only insert if user actually exists
             cursor.execute("SELECT 1 FROM students WHERE id = ?", (uid,))
             if cursor.fetchone():
                 cursor.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", (uid, code, now))
    
    # Catch-all: Ensure ALL students have at least one code (Enforces 2FA for everyone)
    cursor.execute("SELECT id FROM students")
    all_users = cursor.fetchall()
    for user in all_users:
        uid = user[0]
        cursor.execute("SELECT 1 FROM backup_codes WHERE user_id = ?", (uid,))
        if not cursor.fetchone():
            # Generate a RANDOM default code for anyone missing one
            default_code = str(random.randint(100000, 999999))
            cursor.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", (uid, default_code, now))
                 
    conn.commit()
    conn.close()
# Database initialization moved to startup event


# --- 5. ML ENGINE ---

ML_MODEL = None
DIFF_LABEL_MAP = {0: 'Easy', 1: 'Medium', 2: 'Hard'}
DIFFICULTY_MAP = {'Easy': 0, 'Medium': 1, 'Hard': 2}

def train_recommendation_model():
    global ML_MODEL
    # Lazy import to prevent startup bottleneck
    from sklearn.ensemble import RandomForestClassifier
    df = fetch_data_df("SELECT score, time_spent_min, difficulty FROM activities")
    
    if len(df) < MIN_ACTIVITIES:
        ML_MODEL = None
        return

    X = df[['score', 'time_spent_min']]
    y = [DIFFICULTY_MAP.get(d, 1) for d in df['difficulty']] 
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        clf = RandomForestClassifier(n_estimators=50, random_state=42)
        clf.fit(X, y)
    
    ML_MODEL = clf

def get_recommendation(student_id: str) -> Optional[str]:
    train_recommendation_model() 
    if not ML_MODEL:
        return "Not enough data (minimum 5 activities) to generate an ML-based recommendation."

    df_history = fetch_data_df("SELECT score, time_spent_min FROM activities WHERE student_id = ? ORDER BY date DESC LIMIT 1", (student_id,))
    
    if df_history.empty:
        return "No activity history available to base a recommendation on."

    last_activity = df_history.iloc[0]
    import numpy as np
    X_pred = np.array([[last_activity['score'], last_activity['time_spent_min']]])
    
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        pred_idx = ML_MODEL.predict(X_pred)[0]
    
    rec_diff = DIFF_LABEL_MAP.get(pred_idx, 'Medium')
    return f"Based on your last score of {last_activity['score']}%, we recommend trying a **{rec_diff}** difficulty topic next!"

# ML Model training moved to startup event

# --- 6. RBAC CONFIGURATION ---

ROLE_PERMISSIONS = {
    "Admin": [
        "view_dashboard", "manage_users", "manage_invitations", 
        "view_all_grades", "edit_all_grades", 
        "schedule_active_class", "manage_groups", "view_audit_logs",
        "assignment.view", "assignment.create", "assignment.grade"
    ],
    "Principal": [
        "view_dashboard", "manage_users", "manage_invitations", 
        "view_all_grades", "edit_all_grades", 
        "schedule_active_class", "manage_groups", "view_audit_logs",
        "assignment.view", "assignment.create", "assignment.grade"
    ],
    "Teacher": [
        "view_dashboard", "invite_students", 
        "view_all_grades", "edit_all_grades", 
        "schedule_active_class", "manage_groups",
        "assignment.view", "assignment.create", "assignment.grade"
    ],
    "Student": [
        "view_dashboard", "view_own_grades", "join_active_class"
    ],
    "Parent": [
        "view_dashboard", "view_child_grades"
    ]
}

def check_permission(user_role: str, required_permission: str) -> bool:
    if user_role not in ROLE_PERMISSIONS:
        return False
    return required_permission in ROLE_PERMISSIONS[user_role]

async def verify_permission(permission: str, x_user_role: str = Header(None, alias="X-User-Role"), x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        current_role = user['role']
        is_super = user['is_super_admin']

        # 1. Super Admin Override
        if is_super or current_role == 'Super Admin':
            return True

        # 2. Check DB Permissions
        # Join user_roles -> roles -> role_permissions -> permissions
        # Also check for wildcard '*' permission assignment
        query = """
            SELECT 1 
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = ? 
            AND (p.code = ? OR p.code = '*')
        """
        has_perm = conn.execute(query, (x_user_id, permission)).fetchone()

        if not has_perm:
            # Fallback to legacy hardcoded check if DB check fails (temporary migration specific)
            # Remove this if fully migrated
            if current_role in ROLE_PERMISSIONS and permission in ROLE_PERMISSIONS[current_role]:
                return True
                
            log_auth_event(x_user_id, "Unauthorized Access", f"Missing permission: {permission}")
            raise HTTPException(status_code=403, detail=f"Permission denied: {permission} required.")
        
        return True
    finally:
        conn.close()

async def verify_any_permission(permission_codes: List[str], x_user_id: str) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    denied = None
    for code in permission_codes:
        try:
            await verify_permission(code, x_user_id=x_user_id)
            return code
        except HTTPException as e:
            denied = e
            if e.status_code == 401:
                raise
            continue
    if denied:
        raise denied
    raise HTTPException(status_code=403, detail="Permission denied.")


# --- LMS & UPLOADS CONFIGURATION ---
UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- 7. API ENDPOINTS ---

@app.get("/", response_class=HTMLResponse)
async def read_root():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = FRONTEND_INDEX if os.path.exists(FRONTEND_INDEX) else os.path.join(base_dir, "index.html")
    
    if not os.path.exists(file_path):
        # Graceful Fallback: If index.html is missing (e.g. separate frontend), just show API status
        return HTMLResponse(content="""
            <html>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                    <h1 style="color: #4CAF50;">Noble Nexus API is Running 🚀</h1>
                    <p>The backend is online and accepting requests.</p>
                    <p>Please access the application via your <strong>Vercel Frontend</strong>.</p>
                </body>
            </html>
        """, status_code=200)
        
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/script.js")
async def read_script():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = FRONTEND_SCRIPT if os.path.exists(FRONTEND_SCRIPT) else os.path.join(base_dir, "script.js")
    if not os.path.exists(file_path):
        return Response(content="console.error('script.js not found');", media_type="text/javascript")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    return Response(content=content, media_type="text/javascript")

# Health check endpoint for debugging connection issues
@app.get("/api/health")
async def health_check():
    """Health check endpoint to verify backend is running and configured correctly"""
    try:
        # Test database connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "message": "ClassBridge Backend is running",
        "environment": "production" if IS_PRODUCTION else "development",
        "database": db_status,
        "cors_enabled": True,
        "ai_enabled": AI_ENABLED,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/finance/module")
async def get_finance_module_access(x_user_id: str = Header(None, alias="X-User-Id")):
    granted_by = await verify_any_permission([
        "finance.view",
        "finance.dashboard.read",
        "finance.reports.read",
        "finance.payroll.self.read",
        "finance.fees.self.read",
        "finance.fees.child.read"
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

@app.get("/api/finance/dashboard")
async def get_finance_dashboard(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.dashboard.read", "finance.view"], x_user_id)
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

@app.get("/api/finance/reports/summary")
async def get_finance_reports_summary(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.reports.read", "finance.view"], x_user_id)
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

@app.get("/api/finance/payroll/self")
async def get_self_payroll(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.self.read", "finance.payroll"], x_user_id)
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

@app.get("/api/finance/fees/self")
async def get_self_fees(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.fees.self.read", "finance.invoices"], x_user_id)
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

@app.get("/api/finance/fees/child")
async def get_child_fees(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.fees.child.read", "finance.invoices"], x_user_id)
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

@app.post("/api/finance/gl/journals")
@app.post("/finance/gl/journals")
async def create_gl_journal(request: GLJournalCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.gl.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/gl/journals/{journal_id}/post")
@app.post("/finance/gl/journals/{journal_id}/post")
async def post_gl_journal(journal_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.gl.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/gl/journals/{journal_id}/reverse")
@app.post("/finance/gl/journals/{journal_id}/reverse")
async def reverse_gl_journal(journal_id: int, request: Optional[GLJournalReverseRequest] = Body(default=None), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.gl.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/gl/reports/trial-balance")
@app.get("/finance/gl/reports/trial-balance")
async def get_gl_trial_balance(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance.reports.read", "finance.view", "finance.gl.manage"], x_user_id)
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

@app.get("/api/finance/gl/reports/profit-loss")
@app.get("/finance/gl/reports/profit-loss")
async def get_gl_profit_and_loss(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance.reports.read", "finance.view", "finance.gl.manage"], x_user_id)
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

@app.get("/api/finance/gl/reports/balance-sheet")
@app.get("/finance/gl/reports/balance-sheet")
async def get_gl_balance_sheet(
    period_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_any_permission(["finance.reports.read", "finance.view", "finance.gl.manage"], x_user_id)
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

@app.get("/api/finance/domain")
async def get_finance_parent_domain(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.view", "finance.dashboard.read", "finance.reports.read"], x_user_id)
    return {"domain": "finance", "submodules": ["payroll", "general-ledger", "receivables", "payables", "inventory", "assets"]}

@app.get("/api/finance/posting-rules")
async def list_posting_rules(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.posting.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/posting-rules")
async def upsert_posting_rule(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.posting.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/periods/{period_id}/close")
async def close_period(period_id: int, payload: Dict[str, Any] = Body(default={}), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.period.close", "finance.manage"], x_user_id)
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

@app.get("/api/finance/audit-logs")
async def get_finance_audit_logs(limit: int = 100, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.audit.read", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM finance_audit_logs WHERE school_id = ? ORDER BY id DESC LIMIT ?", (school_id, max(1, min(limit, 500)))).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/finance/reconciliation/check")
async def run_finance_reconciliation(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.reports.read", "finance.view", "finance.manage"], x_user_id)
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
@app.get("/api/finance/receivables/customers")
async def list_customers(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.receivables.manage", "finance.invoices", "finance.fees.child.read"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM customers WHERE school_id = ? ORDER BY name", (school_id,)).fetchall()]
    finally:
        conn.close()

@app.post("/api/finance/receivables/customers")
async def create_customer(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.receivables.manage", "finance.invoices"], x_user_id)
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

@app.post("/api/finance/receivables/invoices")
async def create_ar_invoice(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.receivables.manage", "finance.invoices"], x_user_id)
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

@app.post("/api/finance/receivables/receipts")
async def create_ar_receipt(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.receivables.manage", "finance.invoices"], x_user_id)
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

@app.get("/api/finance/receivables/reports/aging")
async def get_ar_aging(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.receivables.manage", "finance.reports.read", "finance.view"], x_user_id)
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
@app.get("/api/finance/payables/vendors")
async def list_vendors(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.payables.approve"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        return [dict(r) for r in conn.execute("SELECT * FROM vendors WHERE school_id = ? ORDER BY name", (school_id,)).fetchall()]
    finally:
        conn.close()

@app.post("/api/finance/payables/vendors")
async def create_vendor(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.payables.approve"], x_user_id)
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

@app.post("/api/finance/payables/bills")
async def create_ap_bill(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.payables.approve"], x_user_id)
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

@app.post("/api/finance/payables/payments")
async def create_ap_payment(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.payables.approve"], x_user_id)
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

@app.get("/api/finance/payables/reports/aging")
async def get_ap_aging(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.reports.read", "finance.view"], x_user_id)
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

@app.get("/api/finance/payables/alerts/due")
async def get_ap_due_alerts(days: int = 7, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payables.manage", "finance.payables.approve"], x_user_id)
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
@app.post("/api/finance/inventory/items")
async def create_inventory_item(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.inventory.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/inventory/warehouses")
async def create_warehouse(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.inventory.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/inventory/stock-moves")
async def create_stock_move(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.inventory.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/inventory/reports/valuation")
async def get_inventory_valuation(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.inventory.manage", "finance.reports.read", "finance.view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT sv.*, i.item_code, i.item_name, w.code AS warehouse_code, w.name AS warehouse_name FROM stock_valuation sv JOIN items i ON i.id = sv.item_id JOIN warehouses w ON w.id = sv.warehouse_id WHERE sv.school_id = ? ORDER BY i.item_code, w.code", (school_id,)).fetchall()
        return {"rows": [dict(r) for r in rows], "total_valuation": round(sum(float(r["valuation_amount"] or 0) for r in rows), 2)}
    finally:
        conn.close()

# --- Assets ---
@app.post("/api/finance/assets/categories")
async def create_asset_category(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/assets/fixed-assets")
async def create_fixed_asset(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/assets/depreciation/run")
async def run_asset_depreciation(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/assets/dispose")
async def dispose_fixed_asset(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/assets/reports/register")
async def get_asset_register(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.reports.read", "finance.view"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT fa.*, ac.code AS category_code, ac.name AS category_name FROM fixed_assets fa JOIN asset_categories ac ON ac.id = fa.category_id WHERE fa.school_id = ? ORDER BY fa.asset_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/finance/assets/reports/depreciation")
async def get_asset_depreciation_report(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.assets.manage", "finance.reports.read", "finance.view"], x_user_id)
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
@app.post("/api/finance/payroll/employees")
async def create_payroll_employee(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.manage", "finance.payroll", "finance.manage"], x_user_id)
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

@app.post("/api/finance/payroll/salary-structures")
async def create_salary_structure(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.manage", "finance.payroll", "finance.manage"], x_user_id)
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

@app.post("/api/finance/payroll/runs/generate")
async def generate_payroll_run(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.manage", "finance.payroll", "finance.manage"], x_user_id)
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

@app.post("/api/finance/payroll/runs/{run_id}/approve")
async def approve_payroll_run(run_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.approve", "finance.manage"], x_user_id)
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

@app.post("/api/finance/payroll/runs/{run_id}/post")
async def post_payroll_run(run_id: int, payload: Dict[str, Any] = Body(default={}), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.approve", "finance.payroll.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/payroll/reports/summary")
async def payroll_summary(period_label: Optional[str] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.manage", "finance.reports.read", "finance.view"], x_user_id)
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

@app.get("/api/finance/payroll/payslip/{employee_id}")
async def payroll_payslip(employee_id: int, run_id: Optional[int] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.payroll.manage", "finance.payroll.self.read", "finance.view"], x_user_id)
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

@app.post("/api/finance/approvals/request")
async def create_finance_approval_request(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.approvals.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/approvals/{request_id}/decision")
async def decide_finance_approval(request_id: int, payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.approvals.manage", "finance.payables.approve", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data")
async def get_finance_master_data_overview(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/chart-of-accounts")
async def list_chart_of_accounts(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.post("/api/finance/master-data/chart-of-accounts")
async def create_chart_of_account(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/fiscal-years")
async def list_fiscal_years(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM fiscal_years WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/fiscal-years")
async def create_fiscal_year(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/accounting-periods")
async def list_accounting_periods(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM accounting_periods WHERE school_id = ? ORDER BY start_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/accounting-periods")
async def create_accounting_period(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/tax-codes")
async def list_tax_codes(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM tax_codes WHERE school_id = ? ORDER BY code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/tax-codes")
async def create_tax_code(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/cost-centers")
async def list_cost_centers(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM cost_centers WHERE school_id = ? ORDER BY center_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/cost-centers")
async def create_cost_center(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/parties")
async def list_finance_parties(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM finance_parties WHERE school_id = ? ORDER BY party_type, name", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/parties")
async def create_finance_party(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/currencies")
async def list_currencies(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM currencies WHERE school_id = ? ORDER BY currency_code", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/currencies")
async def create_currency(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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

@app.get("/api/finance/master-data/exchange-rates")
async def list_exchange_rates(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.read", "finance.masterdata.manage", "finance.manage"], x_user_id)
    conn = get_db_connection()
    try:
        school_id = _resolve_school_id(conn, x_user_id)
        rows = conn.execute("SELECT * FROM exchange_rates WHERE school_id = ? ORDER BY effective_date DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/finance/master-data/exchange-rates")
async def create_exchange_rate(payload: Dict[str, Any] = Body(...), x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_any_permission(["finance.masterdata.manage", "finance.manage"], x_user_id)
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


@app.post("/api/ai/lesson-plan", response_model=LessonPlanResponse)
async def generate_lesson_plan(
    topic: str = Form(...),
    grade: int = Form(...),
    subject: str = Form(...),
    duration_mins: int = Form(...),
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_role: str = Header(None, alias="X-User-Role")
):
    if user_role and user_role != "Teacher" and user_role != "Admin":
         raise HTTPException(status_code=403, detail="Only teachers can generate lesson plans.")

    # PDF Processing
    pdf_context = ""
    if file:
        try:
            if file.filename.endswith('.pdf'):
                pdf_reader = PdfReader(file.file)
                for page in pdf_reader.pages:
                    pdf_context += page.extract_text() + "\n"
                pdf_context = pdf_context[:5000] # Limit to 5k chars to allow context window
            else:
                # Text fallback?
                content = await file.read()
                pdf_context = content.decode('utf-8', errors='ignore')[:5000]
        except Exception as e:
            logger.error(f"File read error: {e}")
            pass

    prompt = (
        f"Create a detailed {duration_mins}-minute lesson plan for a grade {grade} "
        f"{subject} class on the topic: '{topic}'.\n"
    )
    if description:
        prompt += f"Additional Context/Instructions: {description}\n"
    
    if pdf_context:
        prompt += f"\nReference Material (Use this content to build the plan):\n{pdf_context}\n"
    
    prompt += (
        f"Structure it with timings (e.g., Intro 5m, Activity 20m, Wrap-up 5m). "
        f"Include specific activities."
    )

    if AI_ENABLED:
        try:
            chat_completion = LESSON_PLANNER_CLIENT.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert teacher's assistant. Generate structured, timed lesson plans."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                model=GROQ_MODEL,
                temperature=0.7,
            )
            return LessonPlanResponse(content=chat_completion.choices[0].message.content)
        except Exception as e:
            logger.error(f"AI Generation Failed: {e}")
            # Fallback to heuristic if AI fails
    
    # Heuristic Fallback
    intro_time = max(5, int(duration_mins * 0.15))
    main_time = int(duration_mins * 0.7)
    wrap_time = duration_mins - intro_time - main_time
    
    plan = f"""
    ## 📚 Lesson Plan: {topic}
    **Grade:** {grade} | **Subject:** {subject} | **Duration:** {duration_mins} mins
    
    ### 1. Introduction ({intro_time} mins)
    *   **Hook:** Start with a question or short story about {topic}.
    *   **Objective:** Explain what students will learn today.
    
    ### 2. Main Activity ({main_time} mins)
    *   **Direct Instruction:** Briefly explain the core concepts of {topic}.
    *   **Guided Practice:** Work through an example together.
    *   **Independent/Group Work:** Students practice or discuss {topic}.
    
    ### 3. Wrap-Up ({wrap_time} mins)
    *   **Review:** Recap key points.
    *   **Exit Ticket:** Ask one checking question.
    """
    return LessonPlanResponse(content=plan)


import hmac
import hashlib
import time



# --- LTI SUPPORT (Tool Consumer Simulation) ---
import urllib.parse
import base64

def sign_oauth_hmac_sha1(method, url, params, consumer_secret):
    # 1. Sort and encode params
    from urllib.parse import quote
    
    # helper to percent encode strictly
    def percent_encode(s):
        return quote(str(s), safe=b'')

    sorted_params = sorted(params.items())
    normalized_params = '&'.join([f"{percent_encode(k)}={percent_encode(v)}" for k, v in sorted_params])
    
    # 2. Base String
    base_string = f"{method.upper()}&{percent_encode(url)}&{percent_encode(normalized_params)}"
    
    # 3. Signing Key
    key = f"{percent_encode(consumer_secret)}&" # Token secret is empty for LTI launch usually
    
    # 4. HMAC-SHA1
    hashed = hmac.new(key.encode(), base_string.encode(), hashlib.sha1)
    return base64.b64encode(hashed.digest()).decode()

@app.post("/api/lti/launch")
async def get_lti_launch_data(request: Request, x_user_id: str = Header(None, alias="X-User-Id")):
    # In a real app, we would look up the tool config (Consumer Key/Secret) based on the requested resource
    body = await request.json()
    tool_url = body.get('url')
    
    if not tool_url:
        raise HTTPException(status_code=400, detail="Tool URL required")

    # Mock Consumer Config
    consumer_key = "test"
    consumer_secret = "secret"
    
    # LTI Parameters
    params = {
        "lti_message_type": "basic-lti-launch-request",
        "lti_version": "LTI-1p0",
        "resource_link_id": "nexus_resource_1",
        "user_id": x_user_id,
        "roles": "Learner",
        "lis_person_name_full": "Noble Student",
        "oauth_consumer_key": consumer_key,
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_nonce": secrets.token_hex(8),
        "oauth_version": "1.0",
        "oauth_callback": "about:blank"
    }
    
    # Sign
    params["oauth_signature"] = sign_oauth_hmac_sha1("POST", tool_url, params, consumer_secret)
    
    return {
        "url": tool_url,
        "params": params
    }

@app.get("/api/moodle/assignments")
async def get_moodle_assignments(x_user_id: str = Header(None, alias="X-User-Id")):
    return [
        {
            "id": 1,
            "course": "CS101",
            "name": "Python Basics Project",
            "duedate": int(time.time() + 86400 * 2), # 2 days from now
            "status": "submitted"
        },
        {
            "id": 2,
            "course": "MATH202",
            "name": "Calculus Quiz 3",
            "duedate": int(time.time() + 86400 * 5),
            "status": "pending"
        }
    ]

@app.get("/api/moodle/grades")
async def get_moodle_grades(x_user_id: str = Header(None, alias="X-User-Id")):
    return [
        {"course": "CS101", "itemname": "Midterm Exam", "grade": 88.5, "range": "0-100", "feedback": "Good job!"},
        {"course": "CS101", "itemname": "Python Basics Project", "grade": 92.0, "range": "0-100", "feedback": "Excellent code structure."},
        {"course": "HIST101", "itemname": "Ancient Civ Essay", "grade": 95.0, "range": "0-100", "feedback": "Very detailed."}
    ]

@app.post("/api/auth/login", response_model=LoginResponse)
async def login_user(request: LoginRequest):
    # Reload .env on each login so auth toggles (like ENABLE_2FA) take effect immediately.
    load_dotenv(dotenv_path=env_path, override=True)
    teacher_login_alias = os.getenv("TEACHER_LOGIN_ALIAS", TEACHER_LOGIN_ALIAS)
    admin_login_email = os.getenv("ADMIN_LOGIN_EMAIL", ADMIN_LOGIN_EMAIL)
    admin_login_password = os.getenv("ADMIN_LOGIN_PASSWORD", ADMIN_LOGIN_PASSWORD)
    root_admin_login_email = admin_login_email
    root_admin_login_password = admin_login_password
    logger.info(f"Login attempt for user: {request.username}")
    conn = get_db_connection()
    cursor = conn.cursor()

    username_clean = request.username.strip()
    username_lower = username_clean.lower()
    if username_lower == teacher_login_alias.lower():
        lookup_username = "teacher"
    elif (
        (admin_login_email and username_lower == admin_login_email.lower())
        or (root_admin_login_email and username_lower == root_admin_login_email.lower())
    ):
        lookup_username = "rootadmin" if request.role.strip() == "Root_Super_Admin" else "admin"
    else:
        # Prefer exact identifier match first. This prevents alias IDs from shadowing
        # direct email-based accounts when both records exist in legacy datasets.
        exact_user = cursor.execute(
            "SELECT id FROM students WHERE LOWER(id) = LOWER(?)",
            (username_clean,),
        ).fetchone()
        if exact_user:
            lookup_username = exact_user["id"]
        else:
            alias_candidates = STUDENT_LOGIN_ALIASES.get(username_lower) or PARENT_LOGIN_ALIASES.get(username_lower)
            if alias_candidates:
                if isinstance(alias_candidates, str):
                    alias_candidates = (alias_candidates,)
                lookup_username = username_clean
                for candidate_id in alias_candidates:
                    found_alias_user = cursor.execute(
                        "SELECT id FROM students WHERE LOWER(id) = LOWER(?)",
                        (candidate_id,),
                    ).fetchone()
                    if found_alias_user:
                        lookup_username = found_alias_user["id"]
                        break
            else:
                lookup_username = username_clean
    # Case-insensitive username lookup
    user = cursor.execute(
        "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER(?)",
        (lookup_username,)
    ).fetchone()

    # Backward compatibility fallback: if Root Admin alias user is not present, reuse existing Admin/email user.
    if not user and lookup_username == "rootadmin":
        user = cursor.execute(
            "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER('admin')",
        ).fetchone()
    if not user and request.role.strip() == "Root_Super_Admin":
        user = cursor.execute(
            "SELECT id, name, password, role, failed_login_attempts, locked_until, is_super_admin, school_id, email_verified FROM students WHERE LOWER(id) = LOWER(?)",
            (username_clean,),
        ).fetchone()

    if not user:
        conn.close()
        with open("login_debug.txt", "a") as f:
            f.write(f"Login Failed: User {request.username} not found\n")
        logger.warning(f"Login failed for user: {request.username} - User not found")
        log_auth_event(request.username, "Login Failed", "User not found")
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    auth_user_id = user["id"]
    login_email = None
    if "@" in auth_user_id:
        login_email = auth_user_id
    elif auth_user_id == "teacher":
        login_email = teacher_login_alias
    elif auth_user_id in ("admin", "rootadmin"):
        login_email = root_admin_login_email or admin_login_email or SMTP_EMAIL
    elif auth_user_id in STUDENT_OTP_EMAIL_OVERRIDES:
        login_email = STUDENT_OTP_EMAIL_OVERRIDES[auth_user_id]
    elif auth_user_id in PARENT_OTP_EMAIL_OVERRIDES:
        login_email = PARENT_OTP_EMAIL_OVERRIDES[auth_user_id]

    # If an email-based alias was used for login, prefer that for OTP delivery.
    if (username_lower in STUDENT_LOGIN_ALIASES or username_lower in PARENT_LOGIN_ALIASES) and "@" in username_clean:
        login_email = username_clean

    if not bool(user["email_verified"]):
        conn.close()
        log_auth_event(auth_user_id, "Login Failed", "Email not verified")
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your account before logging in.")

    # Enforce Role Match with normalized role aliases to avoid UI label drift.
    allow_login = False
    db_role = user['role'].strip()
    req_role = request.role.strip()

    def normalize_role_name(role_name: str) -> str:
        normalized = (role_name or "").strip().lower().replace("_", " ")
        role_aliases = {
            "principal": "tenant admin",
            "tenant admin": "tenant admin",
            "admin": "root super admin",
            "super admin": "root super admin",
            "superadmin": "root super admin",
            "root super admin": "root super admin",
            "parent": "parent guardian",
            "parent guardian": "parent guardian",
        }
        return role_aliases.get(normalized, normalized)

    db_role_norm = normalize_role_name(db_role)
    req_role_norm = normalize_role_name(req_role)

    if db_role_norm == req_role_norm:
        allow_login = True
    elif db_role_norm == "root super admin" and req_role_norm == "root super admin":
        allow_login = True
    elif db_role_norm == "tenant admin" and req_role_norm == "tenant admin":
        allow_login = True
    
    # Special case: 'teacher' user might be Teacher title but lower in DB or vice versa
    if user['id'] == 'teacher' and req_role == 'Teacher':
        allow_login = True
        
    if not allow_login:
        conn.close()
        debug_msg = f"Role mismatch for {request.username}. DB={db_role}, Req={req_role}"
        with open("login_debug.txt", "a") as f:
            f.write(f"Login Failed: {debug_msg}\n")
        logger.warning(debug_msg)
        log_auth_event(auth_user_id, "Login Failed", f"Role Mismatch: Tried {req_role} as {db_role}")
        raise HTTPException(status_code=403, detail=f"Access Denied: You are registered as a {db_role}, not a {req_role}.")

    # Check Account Lockout
    if user['locked_until']:
        lock_time = datetime.fromisoformat(user['locked_until'])
        if datetime.now() < lock_time:
            conn.close()
            remaining_min = int((lock_time - datetime.now()).total_seconds() / 60)
            log_auth_event(auth_user_id, "Login Failed", "Account locked")
            raise HTTPException(status_code=403, detail=f"Account locked. Try again in {remaining_min + 1} minutes.")
        else:
            cursor.execute("UPDATE students SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (auth_user_id,))
            conn.commit()

    # Password Verification
    if user['password'] == request.password:
        cursor.execute("UPDATE students SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (auth_user_id,))
        
        # --- RBAC SYNC LOGIC (Preserve legacy migration) ---
        legacy_role_name = user['role']
        
        # 1. Sync Legacy Role if needed (Migration on Login)
        user_roles_check = cursor.execute("SELECT role_id FROM user_roles WHERE user_id = ?", (auth_user_id,)).fetchall()
        
        if not user_roles_check:
             # Get Role ID (Handle 'Admin' -> 'Super Admin' mapping if needed, or just match name)
             target_role = legacy_role_name
             if target_role == 'Super Admin':
                 target_role = 'Root_Super_Admin'
             
             # Get Role ID
             role_row = cursor.execute("""
                 SELECT r.id 
                 FROM roles r
                 LEFT JOIN role_permissions rp ON r.id = rp.role_id
                 WHERE r.name = ?
                 GROUP BY r.id
                 ORDER BY COUNT(rp.permission_id) DESC
                 LIMIT 1
             """, (target_role,)).fetchone()
             
             if role_row:
                 try:
                    cursor.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", (auth_user_id, role_row['id']))
                    conn.commit()
                 except:
                    pass 

        # --- 2FA / EMAIL OTP FLOW ---
        ENABLE_2FA = os.getenv("ENABLE_2FA", "false").lower() == "true"
        require_email_otp = (
            ENABLE_2FA
            or auth_user_id in ("teacher", "admin")
            or username_lower in STUDENT_LOGIN_ALIASES
            or auth_user_id in STUDENT_OTP_EMAIL_OVERRIDES
            or username_lower in PARENT_LOGIN_ALIASES
            or auth_user_id in PARENT_OTP_EMAIL_OVERRIDES
        )

        # Trigger email OTP when enabled (or privileged account) and recipient email exists.
        if require_email_otp and login_email:
            # Generate Code
            otp_code = str(random.randint(100000, 999999))
            
            # Store in DB (backup_codes used as OTP storage)
            try:
                cursor.execute("DELETE FROM backup_codes WHERE user_id = ?", (auth_user_id,))
                cursor.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", 
                            (auth_user_id, otp_code, datetime.now().isoformat()))
                conn.commit()
                
                # Send Email
                email_sent = send_email(login_email, "Your Verification Code", f"Your code is: {otp_code}")
                if not email_sent:
                    if ALLOW_OTP_CONSOLE_FALLBACK:
                        logger.warning(
                            f"2FA email send failed for {auth_user_id} to {login_email}. "
                            f"Using terminal fallback OTP: {otp_code}"
                        )
                        log_auth_event(auth_user_id, "2FA Required", f"OTP generated (terminal fallback) for {login_email}")
                    else:
                        logger.error(f"2FA email send failed for {auth_user_id} to {login_email}")
                        raise HTTPException(status_code=500, detail="Unable to send verification code email. Check SMTP credentials and Gmail app-password settings.")
                
                logger.info(f"2FA Code generated for {auth_user_id}: {otp_code}") # Log for debug/local test
                log_auth_event(auth_user_id, "2FA Required", f"OTP generated for {login_email}")
                
                conn.close()
                return LoginResponse(
                    user_id=user['id'], 
                    success=True,
                    requires_2fa=True,
                    email_masked=mask_email(login_email)
                )
            except HTTPException:
                conn.close()
                raise
            except Exception as e:
                conn.close()
                logger.error(f"2FA Generation Error: {e}")
                raise HTTPException(status_code=500, detail="Unable to generate 2FA verification code.")
        elif require_email_otp and not login_email:
            conn.close()
            logger.error(f"2FA configured but no recipient email mapped for user {auth_user_id}")
            raise HTTPException(status_code=500, detail="2FA is enabled but no recipient email is configured for this account.")
        
        # --- NORMAL LOGIN (2FA Skipped) ---
        user_dict = dict(user)
        role = user_dict.get('role', 'Student')
        school_name = "Independent"
        school_id = user_dict.get('school_id', 1)
        is_super_admin = user_dict.get('is_super_admin', False)
        
        if school_id:
            sch = cursor.execute("SELECT name FROM schools WHERE id = ?", (school_id,)).fetchone()
            if sch: school_name = sch['name']

        # Fetch RBAC Data
        # 1. Fetch Assigned Roles
        roles_data = cursor.execute("""
            SELECT r.name 
            FROM roles r 
            JOIN user_roles ur ON r.id = ur.role_id 
            WHERE ur.user_id = ?
        """, (auth_user_id,)).fetchall()
        role_names = [r['name'] for r in roles_data]
        
        # Fallback
        if not role_names:
            role_names = [role]

        # 2. Fetch Permissions
        perms_data = cursor.execute("""
            SELECT DISTINCT p.code 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN user_roles ur ON rp.role_id = ur.role_id
            WHERE ur.user_id = ?
        """, (auth_user_id,)).fetchall()
        perm_codes = [p['code'] for p in perms_data]

        related_student_id = None
        try:
            if 'Parent' in role_names or 'Parent_Guardian' in role_names or role == 'Parent':
                 child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (auth_user_id,)).fetchone()
                 if not child and auth_user_id in PARENT_OTP_EMAIL_OVERRIDES:
                     child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (PARENT_OTP_EMAIL_OVERRIDES[auth_user_id],)).fetchone()
                 if not child and login_email:
                     child = cursor.execute("SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?)", (login_email,)).fetchone()
                 if child:
                     related_student_id = child['student_id']
        except Exception as e:
            logger.error(f"Error fetching related student for login: {e}")

        conn.close()
        logger.info(f"Login successful for {auth_user_id}, 2FA skipped.")
        
        return LoginResponse(
            user_id=user['id'], 
            name=user_dict.get('name'),
            role=role, 
            roles=role_names,
            permissions=perm_codes,
            requires_2fa=False,
            school_id=school_id,
            school_name=school_name,
            is_super_admin=bool(is_super_admin),
            related_student_id=related_student_id
        )

    else:
        new_attempts = (user['failed_login_attempts'] or 0) + 1
        if new_attempts >= 5: 
            lockout_duration = datetime.now() + timedelta(minutes=15)
            cursor.execute("UPDATE students SET failed_login_attempts = ?, locked_until = ? WHERE id = ?", 
                           (new_attempts, lockout_duration.isoformat(), auth_user_id))
            conn.commit()
            conn.close()
            logger.warning(f"Account locked for user: {auth_user_id}")
            log_auth_event(auth_user_id, "Account Locked", "Too many failed attempts")
            raise HTTPException(status_code=403, detail="Account locked. Too many failed attempts.")
        else:
            cursor.execute("UPDATE students SET failed_login_attempts = ? WHERE id = ?", (new_attempts, auth_user_id))
            conn.commit()
            conn.close()
            remaining = 5 - new_attempts
            logger.warning(f"Login failed for user: {auth_user_id} - Invalid password.")
            log_auth_event(auth_user_id, "Login Failed", f"Invalid password.")
            log_auth_event(auth_user_id, "Login Failed", f"Invalid password.")
            raise HTTPException(status_code=401, detail=f"Invalid credentials. {remaining} attempts remaining.")


@app.post("/api/auth/verify-2fa", response_model=LoginResponse)
async def verify_backup_code(request: Verify2FARequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    code_entry = cursor.execute("SELECT code FROM backup_codes WHERE user_id = ? AND code = ?", 
                               (request.user_id, request.code)).fetchone()
                               
    if not code_entry:
        conn.close()
        log_auth_event(request.user_id, "2FA Failed", "Invalid or used code")
        raise HTTPException(status_code=401, detail="Invalid one-time code.")
        
    # cursor.execute("DELETE FROM backup_codes WHERE user_id = ? AND code = ?", (request.user_id, request.code))
    user = cursor.execute("SELECT * FROM students WHERE id = ?", (request.user_id,)).fetchone()
    
    user_dict = dict(user)
    role = user_dict.get('role', 'Student')
    school_name = "Independent"
    school_id = user_dict.get('school_id', 1)
    is_super_admin = user_dict.get('is_super_admin', False)
    if school_id:
            sch = cursor.execute("SELECT name FROM schools WHERE id = ?", (school_id,)).fetchone()
            if sch: school_name = sch['name']

    # Fetch RBAC Data
    # 1. Fetch Assigned Roles
    roles_data = cursor.execute("""
        SELECT r.name 
        FROM roles r 
        JOIN user_roles ur ON r.id = ur.role_id 
        WHERE ur.user_id = ?
    """, (request.user_id,)).fetchall()
    role_names = [r['name'] for r in roles_data]
    
    # Fallback
    if not role_names:
        role_names = [role]

    # 2. Fetch Permissions
    perms_data = cursor.execute("""
        SELECT DISTINCT p.code 
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        JOIN user_roles ur ON rp.role_id = ur.role_id
        WHERE ur.user_id = ?
    """, (request.user_id,)).fetchall()
    perm_codes = [p['code'] for p in perms_data]

    related_student_id = None
    try:
        if 'Parent' in role_names or 'Parent_Guardian' in role_names or role in ('Parent', 'Parent_Guardian'):
            child = cursor.execute(
                "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                (request.user_id,),
            ).fetchone()
            if not child and request.user_id in PARENT_OTP_EMAIL_OVERRIDES:
                child = cursor.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (PARENT_OTP_EMAIL_OVERRIDES[request.user_id],),
                ).fetchone()
            if child:
                related_student_id = child['student_id']
    except Exception as e:
        logger.error(f"Error fetching related student for 2FA: {e}")

    conn.commit()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    logger.info(f"2FA Successful for user: {request.user_id}")
    log_auth_event(request.user_id, "Login Success", "2FA Verified")

    return LoginResponse(
        user_id=request.user_id,
        name=user_dict.get('name'),
        role=role, 
        roles=role_names,
        permissions=perm_codes,
        requires_2fa=False,
        school_id=school_id,
        school_name=school_name,
        is_super_admin=bool(is_super_admin),
        related_student_id=related_student_id
    )

@app.post("/api/auth/register", status_code=201)
async def register_user(request: RegisterRequest):
    email = normalize_and_validate_email(request.email)
    selected_role = normalize_registration_role(request.role)
    validate_password_strength(request.password)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        if request.invitation_token:
            invite = cursor.execute(
                "SELECT * FROM invitations WHERE token = ? AND is_used = 0",
                (request.invitation_token,)
            ).fetchone()
            if not invite:
                raise HTTPException(status_code=400, detail="Invalid or used invitation token.")
            if datetime.now() > datetime.fromisoformat(invite['expires_at']):
                raise HTTPException(status_code=400, detail="Invitation expired.")
            invite_role = normalize_registration_role(invite["role"])
            if invite_role != selected_role:
                raise HTTPException(status_code=400, detail="Token does not match the requested role.")
            cursor.execute("UPDATE invitations SET is_used = 1 WHERE token = ?", (request.invitation_token,))
             
        # Validate School ID if provided
        school_id = request.school_id or 1
        if school_id != 1: # If not default, check if exists
            sch = cursor.execute("SELECT id FROM schools WHERE id = ?", (school_id,)).fetchone()
            if not sch:
                 raise HTTPException(status_code=400, detail="Invalid School ID selected.")

        if cursor.execute("SELECT id FROM students WHERE LOWER(id) = LOWER(?)", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="User ID/Email already exists.")

        verification_token = secrets.token_urlsafe(32)
        verification_expires_at = (datetime.now() + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)).isoformat()

        # Insert User with School ID
        cursor.execute(
            """
            INSERT INTO students (
                id, name, grade, preferred_subject, attendance_rate, home_language, password,
                role, school_id, is_super_admin, email_verified, email_verification_token, email_verification_expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email, request.name, request.grade, request.preferred_subject,
                100.0, "English", request.password, selected_role, school_id, 0, 0, verification_token, verification_expires_at
            ) 
        )

        verification_link = f"{VERIFICATION_LINK_BASE}/api/auth/verify-email?token={verification_token}"
        email_body = f"""
        <p>Hello {request.name},</p>
        <p>Welcome to Noble Nexus. Please verify your email to activate your account.</p>
        <p><a href="{verification_link}">Verify Email</a></p>
        <p>This link expires in {VERIFICATION_TOKEN_TTL_HOURS} hours.</p>
        """
        if not send_email(email, "Verify your Noble Nexus account", email_body):
            conn.rollback()
            raise HTTPException(status_code=500, detail="Unable to send verification email. Check SMTP credentials and Gmail app-password settings.")

        conn.commit()
        log_auth_event(email, "Register Success", f"Role: {selected_role}, School: {school_id}, Email verification pending")
        return {"message": "Registration successful. Please verify your email to activate your account."}
    except sqlite3.IntegrityError:
        log_auth_event(email, "Register Failed", "User ID already exists")
        raise HTTPException(status_code=400, detail="User ID already exists.")
    except Exception as e:
        conn.rollback()
        log_auth_event(email, "Register Failed", f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    finally:
        conn.close()

@app.get("/api/auth/verify-email")
async def verify_email(token: str):
    if not token or len(token.strip()) < 20:
        raise HTTPException(status_code=400, detail="Invalid verification token.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        user = cursor.execute(
            """
            SELECT id, email_verification_expires_at, email_verified
            FROM students
            WHERE email_verification_token = ?
            """,
            (token.strip(),)
        ).fetchone()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid verification token.")

        if bool(user["email_verified"]):
            return {"message": "Email already verified. Your account is active."}

        expires_at = user["email_verification_expires_at"]
        if not expires_at or datetime.now() > datetime.fromisoformat(expires_at):
            raise HTTPException(status_code=400, detail="Verification token has expired.")

        cursor.execute(
            """
            UPDATE students
            SET email_verified = TRUE,
                email_verification_token = NULL,
                email_verification_expires_at = NULL
            WHERE id = ?
            """,
            (user["id"],)
        )
        conn.commit()
        log_auth_event(user["id"], "Email Verified", "Account activated by verification link")
        return {"message": "Email verified successfully. Your account is now active."}
    finally:
        conn.close()

# --- SUPER ADMIN: SCHOOL MANAGEMENT ---

@app.post("/api/admin/schools", status_code=201)
async def create_school(
    request: SchoolCreateRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user or not user['is_super_admin']:
             log_auth_event(x_user_id, "Unauthorized Access", "Attempted to create school without Super Admin access")
             raise HTTPException(status_code=403, detail="Permission denied. SUPER ADMIN ONLY.")
        
        created_at = datetime.now().isoformat()
        cursor = conn.cursor()
        
        # INSERT School
        cursor.execute(
            "INSERT INTO schools (name, address, contact_email, created_at) VALUES (?, ?, ?, ?)",
            (request.name, request.address, request.contact_email, created_at)
        )
        school_id = cursor.lastrowid
        
        # Create Admin user for this school
        # Using contact_email as the ID/Username
        cursor.execute(
            "INSERT INTO students (id, name, role, password, school_id) VALUES (?, ?, ?, ?, ?)",
            (request.contact_email, f"{request.name} Admin", "Admin", request.admin_password, school_id)
        )
        
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise HTTPException(status_code=400, detail="School name or Admin email already exists.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    
    return {"message": "School and Admin account created successfully.", "school_id": school_id}

@app.get("/api/admin/schools", response_model=List[SchoolResponse])
async def list_schools():
    # Public endpoint for registration dropdown, or secured if needed
    conn = get_db_connection()
    schools = conn.execute("SELECT * FROM schools ORDER BY name").fetchall()
    conn.close()
    return [SchoolResponse(id=s['id'], name=s['name'], address=s['address'], contact_email=s['contact_email'], created_at=s['created_at']) for s in schools]

# --- ROOT ADMIN ONLY (Students + Schools) ---

@app.get("/api/root-admin/students")
async def root_list_students(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        rows = conn.execute(
            """
            SELECT
                s.id,
                s.name,
                s.role,
                s.grade,
                s.preferred_subject,
                s.home_language,
                s.school_id,
                s.password,
                CASE
                    WHEN s.email IS NOT NULL AND TRIM(s.email) <> '' THEN s.email
                    WHEN s.role = 'Teacher' AND LOWER(s.id) = 'teacher' THEN ?
                    WHEN s.role IN ('Parent', 'Parent_Guardian') THEN (
                        SELECT g.email
                        FROM guardians g
                        WHERE LOWER(g.name) = LOWER(s.name)
                        ORDER BY g.id DESC
                        LIMIT 1
                    )
                    ELSE s.id
                END AS display_email
            FROM students s
            WHERE s.role IN ('Student', 'Teacher', 'Principal', 'Tenant_Admin', 'Parent', 'Parent_Guardian', 'Academic_Admin', 'HR_Admin')
            ORDER BY s.role, s.name
            """,
            (TEACHER_LOGIN_ALIAS,)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/root-admin/students", status_code=201)
async def root_add_student(req: RootAdminStudentCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        email = normalize_and_validate_email(req.email)
        validate_password_strength(req.password)
        target_role = _normalize_root_managed_role(req.role or "Student")

        target_school_id = req.school_id or 1
        school = conn.execute("SELECT id FROM schools WHERE id = ?", (target_school_id,)).fetchone()
        if not school:
            raise HTTPException(status_code=404, detail="School not found")

        if conn.execute("SELECT id FROM students WHERE LOWER(id) = LOWER(?)", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="User email already exists")

        conn.execute(
            """
            INSERT INTO students (
                id, name, grade, preferred_subject, attendance_rate, home_language, password,
                math_score, science_score, english_language_score, role, school_id, is_super_admin, email_verified
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
            """,
            (
                email, req.name.strip(), req.grade, req.preferred_subject, 100.0, req.home_language,
                req.password, 0.0, 0.0, 0.0, target_role, target_school_id
            )
        )
        conn.commit()
        return {"message": "User created", "user_id": email, "role": target_role}
    finally:
        conn.close()

@app.patch("/api/root-admin/students/{student_id}/email")
async def root_update_student_email(
    student_id: str,
    req: RootAdminStudentEmailUpdateRequest,
    x_user_id: str = Header(None, alias="X-User-Id"),
):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        new_email = normalize_and_validate_email(req.email)

        student = conn.execute("SELECT id, role FROM students WHERE id = ?", (student_id,)).fetchone()
        if not student or student["role"] not in ROOT_ADMIN_MANAGED_ROLES:
            raise HTTPException(status_code=404, detail="Managed user not found")
        exists = conn.execute("SELECT id FROM students WHERE LOWER(id) = LOWER(?)", (new_email,)).fetchone()
        if exists and exists["id"].lower() != student_id.lower():
            raise HTTPException(status_code=409, detail="Email already in use")

        student_name = student["id"]
        try:
            row = conn.execute("SELECT name FROM students WHERE id = ?", (student_id,)).fetchone()
            if row and row["name"]:
                student_name = row["name"]
        except Exception:
            pass

        update_user_identifier_everywhere(conn, student_id, new_email)
        conn.execute("UPDATE students SET email = ? WHERE id = ?", (new_email, new_email))
        if student["role"] in ("Parent", "Parent_Guardian"):
            # Keep guardian contact email in sync so UI + parent flows reflect the new login email.
            conn.execute(
                "UPDATE guardians SET email = ? WHERE LOWER(name) = LOWER(?)",
                (new_email, student_name),
            )
        conn.commit()
        return {"message": "User email updated", "user_id": new_email}
    finally:
        conn.close()

@app.patch("/api/root-admin/students/{student_id}/password")
async def root_update_student_password(
    student_id: str,
    req: RootAdminStudentPasswordUpdateRequest,
    x_user_id: str = Header(None, alias="X-User-Id"),
):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        if not req.password or len(req.password.strip()) < 3:
            raise HTTPException(status_code=400, detail="Password must be at least 3 characters.")
        student = conn.execute("SELECT id, role, email FROM students WHERE id = ?", (student_id,)).fetchone()
        if not student or student["role"] not in ROOT_ADMIN_MANAGED_ROLES:
            raise HTTPException(status_code=404, detail="Managed user not found")
        original_id = student["id"]
        original_email = student["email"] if "email" in student.keys() else None
        conn.execute("UPDATE students SET password = ? WHERE id = ?", (req.password, student_id))
        after = conn.execute("SELECT id, email FROM students WHERE id = ?", (student_id,)).fetchone()
        if not after or after["id"] != original_id or (after["email"] if "email" in after.keys() else None) != original_email:
            conn.rollback()
            raise HTTPException(status_code=500, detail="Safety check failed: password update attempted to change user email/id.")
        conn.commit()
        return {"message": "User password updated", "user_id": student_id}
    finally:
        conn.close()

@app.get("/api/root-admin/schools")
async def root_list_schools(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        rows = conn.execute(
            """
            SELECT id, name, address, contact_email, created_at, COALESCE(is_active, FALSE) AS is_active
            FROM schools
            ORDER BY name
            """
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/root-admin/schools", status_code=201)
async def root_create_school_account(
    req: RootAdminSchoolCreateRequest,
    x_user_id: str = Header(None, alias="X-User-Id"),
):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        school_email = normalize_and_validate_email(req.contact_email)
        validate_password_strength(req.account_password)

        root_sender_email = (ROOT_ADMIN_LOGIN_EMAIL or ADMIN_LOGIN_EMAIL or "").strip().lower()
        smtp_sender_email = (os.getenv("SMTP_EMAIL", SMTP_EMAIL) or "").strip().lower()
        if not root_sender_email:
            raise HTTPException(status_code=400, detail="Root admin email is not configured.")
        if smtp_sender_email != root_sender_email:
            raise HTTPException(status_code=400, detail="OTP sender must be Root Admin email (SMTP_EMAIL must match ADMIN_LOGIN_EMAIL).")

        exists = conn.execute("SELECT id FROM schools WHERE LOWER(contact_email) = LOWER(?)", (school_email,)).fetchone()
        if exists:
            raise HTTPException(status_code=409, detail="School email already exists.")

        otp_code = str(random.randint(100000, 999999))
        otp_hash = hashlib.sha256(otp_code.encode("utf-8")).hexdigest()
        otp_expires_at = (datetime.now() + timedelta(minutes=10)).isoformat()
        created_at = datetime.now().isoformat()

        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO schools (name, address, contact_email, created_at, is_active, activation_otp_hash, activation_otp_expires_at)
            VALUES (?, ?, ?, ?, FALSE, ?, ?)
            """,
            (req.name, req.address, school_email, created_at, otp_hash, otp_expires_at),
        )
        school_id = cursor.lastrowid

        if conn.execute("SELECT id FROM students WHERE LOWER(id)=LOWER(?)", (school_email,)).fetchone():
            raise HTTPException(status_code=409, detail="School account email already exists as user.")

        cursor.execute(
            """
            INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin, email_verified)
            VALUES (?, ?, 0, 'All', 100.0, 'English', ?, 100.0, 100.0, 100.0, 'Admin', ?, 0, 0)
            """,
            (school_email, f"{req.name} Admin", req.account_password, school_id),
        )

        email_body = f"""
        <p>Hello {req.name},</p>
        <p>Your school account activation OTP is:</p>
        <h2>{otp_code}</h2>
        <p>This OTP expires in 10 minutes.</p>
        """
        if not send_email(school_email, "School Account Activation OTP", email_body):
            conn.rollback()
            raise HTTPException(status_code=500, detail="Failed to send OTP email.")

        conn.commit()
        return {"message": "School created. OTP sent from Root Admin email.", "school_id": school_id}
    finally:
        conn.close()

@app.post("/api/root-admin/schools/verify-otp")
async def root_verify_school_otp(
    req: RootAdminSchoolActivateRequest,
    x_user_id: str = Header(None, alias="X-User-Id"),
):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        school = conn.execute(
            "SELECT id, contact_email, activation_otp_hash, activation_otp_expires_at FROM schools WHERE id = ?",
            (req.school_id,),
        ).fetchone()
        if not school:
            raise HTTPException(status_code=404, detail="School not found")
        if not school["activation_otp_hash"] or not school["activation_otp_expires_at"]:
            raise HTTPException(status_code=400, detail="No pending OTP for this school")
        if datetime.now() > datetime.fromisoformat(school["activation_otp_expires_at"]):
            raise HTTPException(status_code=400, detail="OTP expired")

        submitted_hash = hashlib.sha256(req.otp.strip().encode("utf-8")).hexdigest()
        if submitted_hash != school["activation_otp_hash"]:
            raise HTTPException(status_code=400, detail="Invalid OTP")

        conn.execute(
            "UPDATE schools SET is_active = TRUE, activation_otp_hash = NULL, activation_otp_expires_at = NULL WHERE id = ?",
            (req.school_id,),
        )
        conn.execute(
            "UPDATE students SET email_verified = TRUE WHERE id = ? AND school_id = ? AND role = 'Admin'",
            (school["contact_email"], req.school_id),
        )
        conn.commit()
        return {"message": "School account activated successfully"}
    finally:
        conn.close()

@app.get("/api/root-admin/database")
@app.get("/root-admin/database")
@app.get("/api/root-admin/db")
async def root_view_database(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        ensure_root_admin_user(conn, x_user_id)
        payload = []
        if USE_POSTGRES and "postgres" in DATABASE_URL.lower():
            tables = conn.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """
            ).fetchall()
            table_names = [t["table_name"] for t in tables]
        else:
            tables = conn.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            ).fetchall()
            table_names = [t["name"] for t in tables]

        for table_name in table_names:
            try:
                rows = conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
                row_dicts = [dict(r) for r in rows]
                columns = list(row_dicts[0].keys()) if row_dicts else []
                payload.append({
                    "table": table_name,
                    "row_count": len(row_dicts),
                    "columns": columns,
                    "rows": row_dicts,
                })
            except Exception as e:
                payload.append({
                    "table": table_name,
                    "row_count": 0,
                    "columns": [],
                    "rows": [],
                    "error": str(e),
                })
        return {"tables": payload}
    finally:
        conn.close()


             


@app.post("/api/auth/logout")
async def logout_user(request: LogoutRequest):
    logger.info(f"Logout for user: {request.user_id}")
    log_auth_event(request.user_id, "Logout", "User logged out")
    return {"message": "Logged out successfully"}

@app.get("/api/auth/permissions")
async def get_role_permissions():
    return ROLE_PERMISSIONS

@app.get("/api/teacher/students/{student_id}/codes")
async def get_student_codes(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("manage_users", x_user_id=x_user_id)
    conn = get_db_connection()
    codes = conn.execute("SELECT code FROM backup_codes WHERE user_id = ?", (student_id,)).fetchall()
    student = conn.execute("SELECT name FROM students WHERE id = ?", (student_id,)).fetchone()
    conn.close()
    
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    code_list = [row['code'] for row in codes]
    
    # If no codes exist (shouldn't happen with our catch-all, but safe fallback), generate one
    if not code_list:
        new_code = str(random.randint(100000, 999999))
        conn = get_db_connection()
        conn.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", 
                     (student_id, new_code, datetime.now().isoformat()))
        conn.commit()
        conn.close()
        code_list = [new_code]

    return {
        "student_id": student_id,
        "name": student['name'],
        "codes": code_list
    }

@app.post("/api/teacher/students/{student_id}/regenerate-code")
async def regenerate_student_code(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("manage_users", x_user_id=x_user_id)
    conn = get_db_connection()
    
    # Check if student exists
    if not conn.execute("SELECT 1 FROM students WHERE id = ?", (student_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found")

    # Delete ALL existing codes for this user (Revoke old)
    conn.execute("DELETE FROM backup_codes WHERE user_id = ?", (student_id,))
    
    # Generate ONE new random code
    new_code = str(random.randint(100000, 999999))
    conn.execute("INSERT INTO backup_codes (user_id, code, created_at) VALUES (?, ?, ?)", 
                 (student_id, new_code, datetime.now().isoformat()))
    
    student_name = conn.execute("SELECT name FROM students WHERE id = ?", (student_id,)).fetchone()[0]
    conn.commit()
    conn.close()
    
    log_auth_event(student_id, "Security Update", "2FA Code Regenerated by Teacher")

    return {
        "student_id": student_id,
        "name": student_name,
        "codes": [new_code],
        "message": "Old codes revoked. New code generated."
    }

@app.post("/api/students/{student_id}/email-code")
async def send_access_code_email(student_id: str):
    conn = get_db_connection()
    codes = conn.execute("SELECT code FROM backup_codes WHERE user_id = ?", (student_id,)).fetchall()
    student = conn.execute("SELECT name FROM students WHERE id = ?", (student_id,)).fetchone()
    conn.close()

    if not codes:
        raise HTTPException(status_code=404, detail="No codes found for this user.")

    # Determine Email Address (Assuming ID is Email if it contains @, otherwise fail for now or use a lookup)
    target_email = student_id if "@" in student_id else None
    
    if not target_email:
         # For demo purposes, if ID isn't an email, we can't send.
         # In a real app, we'd look up a profile.email field.
         raise HTTPException(status_code=400, detail="Student ID is not a valid email address.")

    code_list_html = "".join([f"<li style='font-size:18px; font-weight:bold;'>{row['code']}</li>" for row in codes])
    
    email_body = f"""
    <html>
        <body>
            <h2>Noble Nexus Access Card</h2>
            <p>Hello {student['name']},</p>
            <p>Here are your secure access codes for logging into the portal:</p>
            <ul>{code_list_html}</ul>
            <p>Keep these codes safe!</p>
            <p><i>Noble Nexus Admin</i></p>
        </body>
    </html>
    """
    
    success = send_email(target_email, "Your Noble Nexus Access Codes", email_body)
    
    if success:
        return {"message": f"Codes sent to {target_email}"}
    else:
        # Fallback if SMTP not configured
        return {"message": "Email simulation: Check server logs (SMTP not configured)."}

@app.post("/api/auth/google-login", response_model=LoginResponse)
async def google_login(request: SocialTokenRequest):
    logger.info(f"Processing Google Login...")
    if requests is None:
        raise HTTPException(status_code=503, detail=f"Google login unavailable: requests import failed ({REQUESTS_IMPORT_ERROR})")
    
    # 1. Verify Token with Google
    try:
        # Use Google's tokeninfo endpoint to verify the ID token
        response = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={request.token}")
        
        if response.status_code != 200:
             logger.error(f"Google Token Check Failed: {response.text}")
             raise HTTPException(status_code=401, detail="Invalid Google Token")
        
        google_data = response.json()
        
        # 2. Verify Audience matches our Client ID
        if google_data['aud'] != GOOGLE_CLIENT_ID:
             logger.error(f"Audience Mismatch: {google_data['aud']}")
             raise HTTPException(status_code=401, detail="Token audience mismatch")
             
        user_email = google_data['email']
        user_name = google_data.get('name', 'Google User') # Use real name from Google
        
    except Exception as e:
        logger.error(f"Google Login Error: {e}")
        raise HTTPException(status_code=401, detail=f"Google Authentication Failed.")

    # 3. Handle User in Database
    conn = get_db_connection()
    user = conn.execute("SELECT id, role FROM students WHERE id = ?", (user_email,)).fetchone()
    
    role = 'Student'
    if user:
         role = user['role']
    else:
        # Auto-register new user from Google
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user_email, user_name, 9, "Science", 100.0, "English", "social_login", 0.0, 0.0, 0.0, 'Student', 1, False))
        conn.commit()
        log_auth_event(user_email, "Register Success", "Google Auto-Register")
    
    conn.close()
    
    log_auth_event(user_email, "Login Success", "Google Login")
    return LoginResponse(
        user_id=user_email, 
        role=role, 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@app.post("/api/auth/microsoft-login", response_model=LoginResponse)
async def microsoft_login(request: SocialTokenRequest):
    logger.info("Processing Microsoft Login")
    if requests is None:
        raise HTTPException(status_code=503, detail=f"Microsoft login unavailable: requests import failed ({REQUESTS_IMPORT_ERROR})")
    
    # Check if this is a Simulated Token (starts with 'token_')
    if request.token.startswith("token_"):
        # Extract unique part from simulated token for uniqueness
        unique_suffix = request.token.split("_")[-1] if "_" in request.token else str(random.randint(1000,9999))
        user_email = f"ms_user_{unique_suffix}@example.com"
        user_name = f"Microsoft User {unique_suffix}"
    else:
        # REAL TOKEN LOGIC: Verify via Microsoft Graph API
        # The frontend sends an Access Token for Graph API (User.Read scope).
        # We verify it by successfully calling the /me endpoint.
        try:
            graph_response = requests.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {request.token}"}
            )
            
            if graph_response.status_code != 200:
                 logger.error(f"Graph API Failed: {graph_response.text}")
                 raise HTTPException(status_code=401, detail="Invalid Microsoft Token")

            graph_data = graph_response.json()
            # Use 'mail' (email) or 'userPrincipalName' (UPN) as the unique ID
            user_email = graph_data.get('mail') or graph_data.get('userPrincipalName')
            user_name = graph_data.get('displayName', 'Microsoft User')
            
            if not user_email:
                 raise ValueError("No email found in Microsoft account")
                 
        except Exception as e:
             logger.error(f"Microsoft Login Validation Error: {e}")
             raise HTTPException(status_code=401, detail="Microsoft Authentication Failed")

    conn = get_db_connection()
    user = conn.execute("SELECT id, role FROM students WHERE id = ?", (user_email,)).fetchone()
    
    role = 'Student'
    if user:
         role = user['role']
    else:
        # Auto-register new user
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user_email, user_name, 9, "Math", 100.0, "English", "social_login", 0.0, 0.0, 0.0, 'Student', 1, False))
        conn.commit()
        log_auth_event(user_email, "Register Success", "Microsoft Auto-Register")

    conn.close()
    
    log_auth_event(user_email, "Login Success", "Microsoft Login")
    # For now, social logins default to school_id=1 and Student role
    return LoginResponse(
        user_id=user_email, 
        role=role, 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@app.post("/api/auth/social-login", response_model=LoginResponse)
async def generic_social_login(request: GenericSocialRequest):
    logger.info(f"Processing {request.provider} Login")
    user_id = f"{request.provider.lower()}_user"
    
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM students WHERE id = ?", (user_id,)).fetchone()
    
    if not user:
        conn.execute("INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, role, school_id, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Student', 1, False)",
                     (user_id, f"{request.provider} User", 9, "General", 100.0, "English", "social_login", 0.0, 0.0, 0.0))
        conn.commit()
        log_auth_event(user_id, "Register Success", f"{request.provider} Auto-Register")

    conn.close()
    
    log_auth_event(user_id, "Login Success", f"{request.provider} Login")
    return LoginResponse(
        user_id=user_id, 
        role='Student', 
        school_id=1, 
        school_name="Independent", 
        is_super_admin=False
    )

@app.post("/api/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    logger.info(f"Password reset requested for: {request.email}")
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM students WHERE id = ?", (request.email,)).fetchone()
    
    if user:
        token = str(uuid.uuid4())
        expires_at = (datetime.now() + timedelta(minutes=15)).isoformat()
        conn.execute("INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)", 
                     (token, request.email, expires_at))
        conn.commit()
        conn.close()
        
        link = f"http://127.0.0.1:8000/?reset_token={token}"
        log_auth_event(request.email, "Password Reset Requested", f"Token generated (Dev Link: {link})")
        return {
            "message": "Reset link generated (DEV MODE).", 
            "dev_link": link 
        }
    else:
        conn.close()
        log_auth_event(request.email, "Password Reset Requested", "User not found")
        return {"message": "If an account exists, a reset link has been sent."}

@app.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    conn = get_db_connection()
    try:
        reset_entry = conn.execute("SELECT user_id, expires_at FROM password_resets WHERE token = ?", (request.token,)).fetchone()
        
        if not reset_entry:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
            
        if datetime.now() > datetime.fromisoformat(reset_entry['expires_at']):
            conn.execute("DELETE FROM password_resets WHERE token = ?", (request.token,))
            conn.commit()
            raise HTTPException(status_code=400, detail="Reset token has expired.")
            
        validate_password_strength(request.new_password)
        conn.execute("UPDATE students SET password = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?", (request.new_password, reset_entry['user_id']))
        conn.execute("DELETE FROM password_resets WHERE token = ?", (request.token,))
        conn.commit()
        
        log_auth_event(reset_entry['user_id'], "Password Reset Success", "Password updated via token & Account unlocked")
        return {"message": "Password reset successfully. You can now login."}
    finally:
        conn.close()

# --- TEACHER DASHBOARD ---

@app.get("/api/teacher/overview", response_model=TeacherOverviewResponse)
async def get_teacher_overview(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id"),
    x_target_school_id: str = Header(None, alias="X-School-Id") # Optional Override
):
    # Verify permission - allow Teacher, Admin, and SuperAdmins
    await verify_permission("view_all_grades", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        # 1. Get User/Teacher Context
        user_row = conn.execute("SELECT school_id, grade, role, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        
        if not user_row:
             raise HTTPException(status_code=404, detail="Current user profile not found.")
             
        is_super = bool(user_row['is_super_admin']) or user_row['role'] in ['Super Admin', 'SuperAdmin']
        
        # Determine active school_id
        school_id = 1 # Fallback
        if x_target_school_id and is_super:
            try:
                school_id = int(x_target_school_id)
            except:
                school_id = user_row['school_id'] or 1
        else:
            school_id = user_row['school_id'] or 1
            
        teacher_grade = user_row['grade'] if user_row['grade'] is not None else 0
        
        # 2. Fetch Students
        query = """
            SELECT s.id, s.name, s.grade, s.preferred_subject, s.attendance_rate, s.home_language, 
                   s.math_score, s.science_score, s.english_language_score
            FROM students s
            WHERE s.role = 'Student' AND s.school_id = ?
        """
        params = [school_id]
        
        # Only filter by grade if the teacher is assigned to a specific grade and isn't a super admin
        if not is_super and teacher_grade > 0:
            query += " AND s.grade = ?"
            params.append(teacher_grade)
            
        students_df = fetch_data_df(query, params=tuple(params))
        
        # Handle Section ID/Name if table exists (dynamic schema check)
        students_df['section_id'] = None
        students_df['section_name'] = None
        try:
             sections_df = fetch_data_df("SELECT s.id as student_id, sec.id as section_id, sec.name as section_name FROM students s JOIN sections sec ON s.section_id = sec.id WHERE s.school_id = ?", (school_id,))
             if not sections_df.empty:
                 students_df = students_df.merge(sections_df, left_on='id', right_on='student_id', how='left')
        except:
             pass # Sections missing or column missing, proceed without

        # 3. Calculate Metrics
        total_students = len(students_df)
        class_avg_attendance = students_df['attendance_rate'].mean() if not students_df.empty else 0.0
        
        # Activities / Scores
        activities_query = "SELECT a.student_id, a.score FROM activities a JOIN students s ON a.student_id = s.id WHERE s.school_id = ?"
        activities_params = [school_id]
        if not is_super and teacher_grade > 0:
             activities_query += " AND s.grade = ?"
             activities_params.append(teacher_grade)
             
        activities_df = fetch_data_df(activities_query, params=tuple(activities_params))
        
        avg_scores_map = {}
        if not activities_df.empty:
            avg_scores_map = activities_df.groupby('student_id')['score'].mean().to_dict()

        # Build Roster
        roster_list = []
        class_avg_score_total = 0
        
        if not students_df.empty:
            import pandas as pd
            for _, row in students_df.iterrows():
                student_avg_activity = avg_scores_map.get(row['id'], 0.0)
                initial_score = (row['math_score'] + row['science_score'] + row['english_language_score']) / 3
                
                roster_list.append({
                    "ID": row['id'],
                    "Name": row['name'],
                    "Grade": row['grade'],
                    "Attendance %": round(row['attendance_rate'] or 0.0, 1),
                    "Avg Activity Score": round(student_avg_activity, 1), 
                    "Initial Score": round(initial_score, 1), 
                    "Subject": row['preferred_subject'] or 'General',
                    "Home Language": row['home_language'] or 'English',
                    "Section ID": row.get('section_id') if pd.notna(row.get('section_id')) else None,
                    "Section Name": row.get('section_name') if pd.notna(row.get('section_name')) else None
                })
                class_avg_score_total += student_avg_activity
            
            class_avg_score = class_avg_score_total / total_students if total_students > 0 else 0.0
        else:
            class_avg_score = 0.0

        # 4. Fetch Teachers Count
        total_teachers = conn.execute("SELECT COUNT(*) FROM students WHERE role IN ('Teacher', 'Principal', 'Admin') AND school_id = ?", (school_id,)).fetchone()[0]
        
    finally:
        conn.close()

    return TeacherOverviewResponse(
        total_students=total_students,
        class_attendance_avg=round(class_avg_attendance, 1),
        class_score_avg=round(class_avg_score, 1),
        roster=roster_list,
        total_teachers=total_teachers
    )

@app.post("/api/students/add", status_code=201)
async def add_new_student(
    request: AddStudentRequest, 
    x_user_role: str = Header(None, alias="X-User-Role"), 
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")
         
    conn = get_db_connection()
    try:
        user_data = conn.execute("SELECT role, school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
    finally:
        conn.close()
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found")
        
    real_role = user_data['role']
    school_id = dict(user_data).get('school_id', 1)

    if not check_permission(real_role, "manage_users") and not check_permission(real_role, "invite_students"):
         log_auth_event(x_user_id, "Unauthorized Access", "Attempted to add student without permission")
         raise HTTPException(status_code=403, detail="Permission denied. You cannot add students.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, math_score, science_score, english_language_score, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                request.id, request.name, request.grade, request.preferred_subject, 
                request.attendance_rate, request.home_language, request.password,
                request.math_score, request.science_score, request.english_language_score,
                school_id
            )
        )
        conn.commit()
        return {"message": f"Student {request.id} ({request.name}) added successfully."}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail=f"Student ID '{request.id}' already exists.")
    finally:
        conn.close()

@app.post("/api/invitations/generate", response_model=InvitationResponse)
async def generate_invitation(
    request: InvitationRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    token = str(uuid.uuid4())[:8]
    expires_at = (datetime.now() + timedelta(hours=request.expiry_hours)).isoformat()
    
    conn = get_db_connection()
    user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
    school_id = dict(user).get('school_id', 1) if user else 1

    conn.execute("INSERT INTO invitations (token, role, expires_at, school_id) VALUES (?, ?, ?, ?)", 
                 (token, request.role, expires_at, school_id))
    conn.commit()
    conn.close()
    
    return InvitationResponse(link=f"?invite={token}", token=token, expires_at=expires_at)

@app.put("/api/students/{student_id}")
async def update_student(
    student_id: str, 
    request: UpdateStudentRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("edit_all_grades", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        result = cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,)).fetchone()
        if result is None:
            raise HTTPException(status_code=404, detail=f"Student ID '{student_id}' not found.")
            
        cursor.execute(
            """
            UPDATE students 
            SET name = ?, grade = ?, preferred_subject = ?, attendance_rate = ?, home_language = ?,
                math_score = ?, science_score = ?, english_language_score = ?
            WHERE id = ?
            """,
            (
                request.name, request.grade, request.preferred_subject, 
                request.attendance_rate, request.home_language,
                request.math_score, request.science_score, request.english_language_score,
                student_id
            )
        )
        
        if request.password and request.password.strip():
            validate_password_strength(request.password)
            cursor.execute("UPDATE students SET password = ? WHERE id = ?", (request.password, student_id))
            log_auth_event(student_id, "Password Changed", f"Admin/Teacher ({x_user_id}) updated password")

        if request.roles is not None:
             # Update Roles (RBAC)
             # 1. Clear existing roles
             cursor.execute("DELETE FROM user_roles WHERE user_id = ?", (student_id,))
             
             # 2. Add new roles
             first_role_name = "Student" # Default
             if request.roles:
                 first_role_name = request.roles[0] # Take first as primary for legacy column
                 
                 for role_name in request.roles:
                      role_row = cursor.execute("SELECT id FROM roles WHERE name = ?", (role_name,)).fetchone()
                      if role_row:
                          cursor.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", (student_id, role_row['id']))
                      else:
                          # Handle custom role or error? For now skip
                          pass
             
             # 3. Update legacy column
             cursor.execute("UPDATE students SET role = ? WHERE id = ?", (first_role_name, student_id))

        conn.commit()
        return {"message": f"Student {student_id} updated successfully."}
    finally:
        conn.close()

@app.delete("/api/students/{student_id}")
async def delete_student(student_id: str):
    if student_id == 'teacher':
        raise HTTPException(status_code=403, detail="Cannot delete the teacher user.")
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        result = cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,)).fetchone()
        if result is None:
            raise HTTPException(status_code=404, detail=f"Student ID '{student_id}' not found.")
            
        cursor.execute("DELETE FROM students WHERE id = ?", (student_id,))
        conn.commit()
        return {"message": f"Student {student_id} and all related activities deleted successfully."}
    finally:
        conn.close()

@app.post("/api/activities/add", status_code=201)
async def add_new_activity(
    request: AddActivityRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")
         
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role FROM students WHERE id = ?", (x_user_id,)).fetchone()
    finally:
        conn.close()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    real_role = user['role']

    # Allow if Teacher/Admin (edit_all_grades)
    # STRICT: Students cannot log their own activities anymore.
    has_permission = check_permission(real_role, "edit_all_grades")
    # if not has_permission:
    #     if real_role == "Student" and str(request.student_id) == str(x_user_id):
    #         has_permission = True
    
    if not has_permission:
         log_auth_event(x_user_id, "Unauthorized Access", "Attempted to add activity without permission")
         raise HTTPException(status_code=403, detail="Permission denied.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        student_check = cursor.execute("SELECT id FROM students WHERE id = ?", (request.student_id,)).fetchone()
        if student_check is None:
            raise HTTPException(status_code=404, detail=f"Student ID '{request.student_id}' not found.")
            
        cursor.execute(
            """
            INSERT INTO activities (student_id, date, topic, difficulty, score, time_spent_min)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                request.student_id, request.date, request.topic, request.difficulty, 
                request.score, request.time_spent_min
            )
        )
        conn.commit()
        train_recommendation_model()
        return {"message": f"Activity for student {request.student_id} added successfully."}
    except Exception as e:
        conn.rollback()
        if isinstance(e, HTTPException) and e.status_code == 404: raise e
        raise HTTPException(status_code=500, detail=f"An error occurred: {e}")
    finally:
        conn.close()

# Refactored common AI logic
def build_ai_context_and_prompt(student_id, user_query, specific_file_content=""):
    conn = get_db_connection()
    student = conn.execute("SELECT name, grade, preferred_subject, math_score, science_score, english_language_score, role, school_id FROM students WHERE id = ?", (student_id,)).fetchone()
    
    # Fetch Resources Context (Global Library) - ONLY if no specific file content or supplemental
    # For now, let's keep it additive
    school_id = student['school_id'] if student and 'school_id' in student else 1
    resources = conn.execute("SELECT title, description, extracted_text FROM resources WHERE school_id = ? ORDER BY uploaded_at DESC", (school_id,)).fetchall()
    conn.close()
    
    # Fetch Activity History
    history_df = fetch_data_df("SELECT date, topic, difficulty, score FROM activities WHERE student_id = ? ORDER BY date DESC LIMIT 20", (student_id,))
    history_context = ""
    if not history_df.empty:
        history_context = "\nRecent Activity History:\n" + history_df.to_markdown(index=False)
    else:
        history_context = "\nNo recent activity history found."

    # Process Resources
    resource_summary = "\nAvailable Library Resources:\n"
    matched_resource_text = ""
    user_query_lower = user_query.lower()
    
    for res in resources:
        title = res['title']
        desc = res['description'] or ""
        resource_summary += f"- {title} ({desc[:50]}...)\n"
        
        if len(title) > 3 and title.lower() in user_query_lower:
            text = res['extracted_text'] or "No text content available."
            matched_resource_text += f"\n[Resource Content: {title}]\n{text[:3000]}\n[End Resource Content]\n"

    student_context_str = ""
    if student:
        grade = student['grade']
        student_context_str = f"User Profile: Name={student['name']}, Role={student['role']}, Grade={grade}, Prefers={student['preferred_subject']}."
        student_context_str += f"\n{history_context}"
        student_context_str += f"\n{resource_summary}"
        if matched_resource_text:
            student_context_str += f"\nDetailed Resource Context (Relevant to Query):\n{matched_resource_text}"
    else:
        student_context_str = "User Profile: Unknown/Guest"

    # Inject Specific Attached File Content
    if specific_file_content:
        student_context_str += f"\n\n[USER ATTACHED FILE CONTENT]\n{specific_file_content}\n[END ATTACHED FILE CONTENT]\n"
        student_context_str += "\nNOTE: The user has attached a file. PRIORITIZE using the [USER ATTACHED FILE CONTENT] to answer their query."

    system_prompt = f"""
You are a professional Education and Data Assistant integrated into a sidebar chatbot interface.
You operate in two clearly defined modes:

{student_context_str}

**Mode 1: Education Assistant**
Activate this mode when the user asks about:
- Academic concepts
- Learning topics
- *Their own progress or graph data*
- *Library Resources* or specific study materials
- *Attached Files* (homework, notes, etc.)
- Technical explanations

Response Guidelines:
- **CONTENT VALIDATION**: If an Attached File is present, FIRST verify if it is education-related (e.g., academic notes, syllabus, homework, textbooks).
- **IF NOT EDUCATION RELATED**: Politely decline to answer, stating that you can only assist with educational materials.
- **USE THE PROVIDED ACTIVITY HISTORY** for progress questions.
- **USE THE PROVIDED RESOURCE CONTENT** for library questions.
- **USE THE PROVIDED ATTACHED FILE CONTENT** if present (and validated).
- Explain concepts clearly and logically
- Use step-by-step explanations
- Start simple, then increase depth
- Use examples, diagrams (text-based), or analogies when useful
- Maintain a professional, calm, and supportive teaching tone
- Format responses using headings, bullet points, and code blocks

**Mode 2: Database Query Assistant (PostgreSQL)**
Activate this mode ONLY when the user asks about:
- *Aggregate* data stored in the system (not just their own)
- Complex reports necessitating a fresh DB query
- Database-related queries

Response Guidelines:
- Translate user intent into valid PostgreSQL queries
- Use correct SQL syntax and best practices
- Do not assume table or column names if they are not provided (Use the Query Classification Rule)
- Ask for clarification when schema information is missing
- Present query results clearly using tables or summaries

**Schema Context:**
{DB_SCHEMA_CONTEXT}

**Query Classification Rule**
- If the user asks about *their own* marks, history, or graph trends, PREFER `EDUCATION` mode and use the injected history context.
- Use `DATABASE` mode only if the answer requires fetching *new* data not present in the context.
- Select only one mode per response.

### OUTPUT FORMAT (STRICT JSON)
You must strictly output a JSON object with the following structure:
{{
  "mode": "EDUCATION" or "DATABASE",
  "content": "Your education response text here (null if DATABASE mode)",
  "query": "Your SQL query here (null if EDUCATION mode)"
}}
"""
    return system_prompt

def build_teacher_ai_context(teacher_id, user_query):
    try:
        conn = get_db_connection()
        # Fetch Teacher Profile
        teacher = conn.execute("SELECT name, role, school_id FROM students WHERE id = ?", (teacher_id,)).fetchone()
        
        if not teacher:
             conn.close()
             return "User not found."
    
        school_id = teacher['school_id'] if teacher and 'school_id' in teacher else 1
        
        # Fetch School Stats for Context
        student_count = conn.execute("SELECT COUNT(*) FROM students WHERE school_id = ?", (school_id,)).fetchone()[0]
        recent_activities = conn.execute("SELECT COUNT(*) FROM activities WHERE student_id IN (SELECT id FROM students WHERE school_id = ?)", (school_id,)).fetchone()[0]
        
        conn.close()
    
        context_str = f"Teacher Profile: Name={teacher['name']}, Role={teacher['role']}, School ID={school_id}.\n"
        context_str += f"School Environment Context: Currently managing {student_count} students with {recent_activities} total activities recorded.\n"
    
        system_prompt = f"""
You are the "ClassBridge AI Co-Pilot", an intelligent assistant specifically for teachers and school administrators.
Your goal is to save teachers time by helping with day-to-day administrative, pedagogical, and analytical tasks.

{context_str}

**Capabilities:**
1. **Administrative Helper**: Draft parent emails, write announcements, create meeting agendas, or structure school newsletters.
2. **Pedagogical Assistant**: Suggest creative classroom activities, explain complex topics for different grades, or recommend intervention strategies for struggling students.
3. **Data Analyst (DATABASE Mode)**: Query school data to find trends, identify at-risk students, or generate performance reports.
4. **General Q&A**: Answer questions about classroom management, educational tech, or professional development.

**Operating Modes:**
- **DATABASE Mode**: Use this ONLY when the teacher asks for specific data from the database (e.g., "Which students have low attendance?", "Show me the math scores for Grade 9", "List students who haven't completed any activities recently").
- **EDUCATION Mode**: Use this for all text-based assistance, creative drafting, and explanations.

**Database Guidelines (PostgreSQL):**
- You have access to the following schema:
{DB_SCHEMA_CONTEXT}
- IMPORTANT: ALWAYS filter queries by `school_id = {school_id}` to ensure data privacy.
- Return a valid PostgreSQL SELECT query in the 'query' field.

### OUTPUT FORMAT (STRICT JSON)
You must strictly output a JSON object:
{{
  "mode": "EDUCATION" or "DATABASE",
  "content": "Your helpful response here (null if DATABASE mode)",
  "query": "Your SQL query here (null if EDUCATION mode)"
}}
"""
        return system_prompt
    except Exception as e:
        logger.error(f"Teacher Context Error: {e}")
        return "You are a professional educational assistant."


@app.post("/api/ai/chat_with_file/{student_id}", response_model=AIChatResponse)
async def chat_with_ai_tutor_file(
    student_id: str, 
    prompt: str = Form(...),
    file: UploadFile = File(...)
):
    if not AI_ENABLED:
        return AIChatResponse(reply="The live AI service is currently disabled.")
    
    extracted_text = ""
    try:
        if file.filename.lower().endswith('.pdf') and PdfReader:
            # We need to read the file into memory to parse it
            content = await file.read()
            from io import BytesIO
            reader = PdfReader(BytesIO(content))
            text_content = []
            for page in reader.pages:
                 text = page.extract_text()
                 if text: text_content.append(text)
            extracted_text = "\n".join(text_content)
        elif file.filename.lower().endswith(('.txt', '.md', '.csv')):
            content = await file.read()
            extracted_text = content.decode('utf-8')
        else:
             extracted_text = f"[File: {file.filename} (Type: {file.content_type}) - Content extraction not supported for this file type yet. Treat as metadata only.]"
    except Exception as e:
        logger.error(f"File Extraction Error: {e}")
        extracted_text = "Error extracting text from file."

    try:
        system_prompt = build_ai_context_and_prompt(student_id, prompt, extracted_text)
        
        chat_completion = GROQ_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        response_content = chat_completion.choices[0].message.content
        try:
             parsed_response = json.loads(response_content)
             mode = parsed_response.get("mode", "EDUCATION")
             
             if mode == "DATABASE" and parsed_response.get("query"):
                 # Execute Query Logic (Reuse or Duplicate?)
                 # For file upload, usually it's Education mode. But if they upload a CSV and ask to query it... 
                 # We'll just execute standard DB query if they ask about DB, ignoring file? OR if they ask about file, mode is EDUCATION.
                 # Let's assume Education for file Qs.
                 pass # Fall through to return content
                 
                 # If it IS database query, we execute it
                 sql_query = parsed_response.get("query")
                 try:
                     df = fetch_data_df(sql_query)
                     if not df.empty:
                         return AIChatResponse(reply=f"**Query Result:**\n\n" + df.to_markdown(index=False))
                     else:
                         return AIChatResponse(reply="No data found for that query.")
                 except Exception as e:
                     return AIChatResponse(reply=f"Query failed: {e}")
             
             return AIChatResponse(reply=parsed_response.get("content", "I analyzed the file but have no specific comments."))
             
        except json.JSONDecodeError:
            return AIChatResponse(reply=response_content)

    except Exception as e:
        logger.error(f"AI Chat Error (File): {e}")
        return AIChatResponse(reply="Sorry, I encountered an error processing your file.")

@app.post("/api/ai/chat/{student_id}", response_model=AIChatResponse)
async def chat_with_ai_tutor(student_id: str, request: AIChatRequest):
    if not AI_ENABLED:
        return AIChatResponse(reply="The live AI service is currently disabled.")
        
    try:
        # Use shared prompt builder
        system_prompt = build_ai_context_and_prompt(student_id, request.prompt)
        
        # Call LLM
        chat_completion = GROQ_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            model=GROQ_MODEL, # "llama-3.1-8b-instant"
            temperature=0.3,  # Lower temperature for reliable JSON and SQL
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        response_content = chat_completion.choices[0].message.content
        
        # Parse JSON response
        try:
            response_data = json.loads(response_content)
            mode = response_data.get("mode")
            
            if mode == "DATABASE":
                query = response_data.get("query")
                if query:
                    # Security Check: Ensure it's a SELECT query
                    if not query.strip().lower().startswith("select"):
                         reply = "I can only perform read-only database queries (SELECT)."
                    else:
                        try:
                            logger.info(f"AI Executing SQL: {query}")
                            # Execute Query
                            df_result = fetch_data_df(query)
                            # Format Result
                            markdown_table = format_df_to_markdown(df_result)
                            reply = f"Here is the data I found:\n\n{markdown_table}"
                        except Exception as db_err:
                            logger.error(f"AI SQL Execution Error: {db_err}")
                            reply = f"I tried to run a database query but ran into an error: {str(db_err)}"
                else:
                    reply = "I understood this as a data request but couldn't generate a valid query."
                    
            else:
                # EDUCATION Mode (Default)
                reply = response_data.get("content") or "I'm not sure how to answer that."
                
        except json.JSONDecodeError:
            # Fallback if valid JSON wasn't returned
            logger.error("AI did not return valid JSON. Falling back to raw content.")
            reply = response_content

    except Exception as e:
        logger.error(f"Groq API Error for student {student_id}: {e}")
        reply = "I'm having trouble connecting to my brain right now. Please try again later."
        
    return AIChatResponse(reply=reply)

@app.post("/api/ai/teacher-chat/{teacher_id}", response_model=AIChatResponse)

async def chat_with_ai_teacher(teacher_id: str, request: AIChatRequest):
    if not AI_ENABLED:
        return AIChatResponse(reply="The teacher AI service is currently disabled.")
        
    try:
        system_prompt = build_teacher_ai_context(teacher_id, request.prompt)
        
        # Call LLM
        chat_completion = GROQ_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            model=GROQ_MODEL,
            temperature=0.4,
            max_tokens=2000,
            response_format={"type": "json_object"}
        )
        
        response_content = chat_completion.choices[0].message.content
        
        try:
            response_data = json.loads(response_content)
            mode = response_data.get("mode")
            
            if mode == "DATABASE":
                query = response_data.get("query")
                if query:
                    if not query.strip().lower().startswith("select"):
                         reply = "I am restricted to read-only database queries (SELECT)."
                    else:
                        try:
                            logger.info(f"Teacher AI Executing SQL: {query}")
                            df_result = fetch_data_df(query)
                            markdown_table = format_df_to_markdown(df_result)
                            reply = f"I've fetched the requested data from the school records:\n\n{markdown_table}"
                        except Exception as db_err:
                            logger.error(f"Teacher AI SQL Error: {db_err}")
                            reply = f"I encountered an error while querying the database: {str(db_err)}"
                else:
                    reply = "I understood this as a data request but couldn't generate a valid query."
            else:
                reply = response_data.get("content") or "How else can I assist you today?"
                
        except json.JSONDecodeError:
            reply = response_content

    except Exception as e:
        logger.error(f"Teacher AI Error: {e}")
        reply = "I'm having trouble connecting to my processing unit. Please try again in a moment."
        
    return AIChatResponse(reply=reply)

@app.post("/api/ai/grade-helper/{student_id}", response_model=AIChatResponse)
async def chat_with_grade_helper(student_id: str, request: AIChatRequest):
    if not GRADE_HELPER_CLIENT:
        return AIChatResponse(reply="Grade Helper AI is currently unavailable.")
        
    try:
        # Fetch Student/User Details for Context
        conn = get_db_connection()
        user = conn.execute("SELECT role, grade, preferred_subject FROM students WHERE id = ?", (student_id,)).fetchone()
        conn.close()
        
        if not user:
             return AIChatResponse(reply="I can't find your profile to customize my answers.")
             
        role = user['role']
        grade = user['grade'] if user['grade'] is not None else "Unknown"
        
        # dynamic system prompt based on role and grade
        if role == 'Teacher':
            system_prompt = (
                f"You are a Grade {grade} Specialist Assistant for Teachers. "
                f"Your goal is to assist a Grade {grade} teacher with lesson planning, student management, and educational strategies. "
                "Keep your answers professional, helpful, and focused on education."
            )
        else:
             system_prompt = (
                f"You are a friendly Grade {grade} Study Buddy. "
                f"Your goal is to help a Grade {grade} student with their studies. "
                "Keep your answers simple, encouraging, and easy to understand for this age group. "
                "Focus ONLY on grade-related disputes and education things."
            )

        chat_completion = GRADE_HELPER_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            model="llama-3.1-8b-instant", # Using the same model class, assuming availability with this key
            temperature=0.7, 
            max_tokens=600
        )
        reply = chat_completion.choices[0].message.content
    except Exception as e:
        logger.error(f"Grade Helper API Error for {student_id}: {e}")
        reply = "I'm having a bit of trouble connecting right now. Please try again."
        
    return AIChatResponse(reply=reply)

def _is_education_related_text(text: str) -> bool:
    if not text:
        return False
    keywords = [
        "lesson", "classroom", "curriculum", "syllabus", "homework", "quiz", "exam", "worksheet",
        "textbook", "student", "teacher", "grade", "learning", "education", "study", "assignment",
        "lecture", "unit", "lesson plan", "pedagogy", "assessment", "course"
    ]
    text_lower = text.lower()
    return any(k in text_lower for k in keywords)

@app.post("/api/ai/engagement-helper", response_model=AIChatResponse)
async def chat_with_engagement_helper(
    request: Request,
    x_user_id: str = Header(None, alias="X-User-Id"),
):
    if not ENGAGEMENT_HELPER_CLIENT:
        return AIChatResponse(reply="Engagement Helper AI is currently unavailable.")

    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user ID.")

    try:
        conn = get_db_connection()
        user = conn.execute(
            "SELECT role, grade, preferred_subject, name FROM students WHERE id = ?",
            (x_user_id,),
        ).fetchone()
        conn.close()

        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        if user["role"] != "Teacher":
            raise HTTPException(status_code=403, detail="Engagement Helper is for teachers only.")

        prompt = None
        file = None
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            try:
                form = await request.form()
                prompt = form.get("prompt")
                file = form.get("file")
            except Exception:
                prompt = None
                file = None
        else:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    prompt = body.get("prompt")
            except Exception:
                prompt = None

        grade = user["grade"] if user["grade"] is not None else "Unknown"
        subject = user["preferred_subject"] or "General"
        teacher_name = user["name"] or "Teacher"

        if file is not None and not isinstance(file, UploadFile):
            file = None

        pdf_context = ""
        pdf_topic = ""
        if file:
            if not file.filename.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail="Only PDF files are supported for engagement helper.")
            if not PdfReader:
                raise HTTPException(status_code=503, detail="PDF processing is unavailable on the server.")
            try:
                pdf_reader = PdfReader(file.file)
                for page in pdf_reader.pages:
                    page_text = page.extract_text() or ""
                    pdf_context += page_text + "\n"
                pdf_context = pdf_context[:5000]
            except Exception as e:
                logger.error(f"Engagement Helper PDF read error: {e}")
                pdf_context = ""

            if pdf_context:
                try:
                    classification_prompt = (
                        "Determine if the following document content is education-related "
                        "(academic materials, classroom content, curriculum, pedagogy, homework, exams, textbooks). "
                        "Return only JSON with keys: is_education (true/false), topic (short topic label), reason (short)."
                        f"\n\nCONTENT:\n{pdf_context}"
                    )
                    classification = ENGAGEMENT_HELPER_CLIENT.chat.completions.create(
                        messages=[
                            {"role": "system", "content": "You are a strict JSON classifier."},
                            {"role": "user", "content": classification_prompt}
                        ],
                        model=ENGAGEMENT_HELPER_MODEL,
                        temperature=0.0,
                        max_tokens=200,
                        response_format={"type": "json_object"}
                    )
                    classification_content = classification.choices[0].message.content
                    classification_data = json.loads(classification_content)
                    is_education = bool(classification_data.get("is_education"))
                    pdf_topic = (classification_data.get("topic") or "").strip()
                    if not is_education:
                        return AIChatResponse(
                            reply="I can only assist with education-related materials. The uploaded PDF doesn't appear to be educational."
                        )
                except Exception as e:
                    logger.error(f"Engagement Helper PDF classification error: {e}")
                    if not _is_education_related_text(pdf_context):
                        return AIChatResponse(
                            reply="I can only assist with education-related materials. The uploaded PDF doesn't appear to be educational."
                        )
            else:
                return AIChatResponse(reply="I couldn't extract readable text from the uploaded PDF.")

        if not prompt and not pdf_context:
            raise HTTPException(status_code=400, detail="Missing prompt. Provide a prompt or upload a PDF.")
        if not prompt:
            prompt = "Provide engagement strategies based on the attached material."

        system_prompt = (
            f"You are the Engagement Helper for classroom teachers. "
            f"The teacher is {teacher_name} and teaches Grade {grade} {subject}. "
            "Give practical, quick-to-apply engagement strategies and activities. "
            "When relevant, suggest timing (2-10 minutes), group size, and materials. "
            "Keep the advice classroom-safe, age-appropriate, and concise."
        )

        if pdf_context:
            topic_hint = pdf_topic or "the uploaded material"
            prompt = (
                f"{prompt}\n\n"
                f"Topic from PDF: {topic_hint}\n"
                "Use the PDF content as context and tailor engagement strategies to that topic.\n"
                f"\nPDF Content (excerpt):\n{pdf_context}\n"
            )

        chat_completion = ENGAGEMENT_HELPER_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model=ENGAGEMENT_HELPER_MODEL,
            temperature=0.6,
            max_tokens=600
        )
        reply = chat_completion.choices[0].message.content
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Engagement Helper API Error for {x_user_id}: {e}")
        reply = "I'm having trouble connecting right now. Please try again."

    return AIChatResponse(reply=reply)

@app.get("/api/students/all")
async def get_all_students_list(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    user = conn.execute("SELECT school_id, grade, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
    conn.close()

    if not user:
        return []

    school_id = user['school_id'] if user['school_id'] else 1
    grade = user['grade'] if user['grade'] is not None else 0
    is_super_admin = bool(user['is_super_admin'])

    query = "SELECT id, name, attendance_rate, grade FROM students WHERE role = 'Student' AND school_id = ?"
    params = [school_id]

    if not is_super_admin:
        if grade > 0:
            query += " AND grade = ?"
            params.append(grade)
        # else: grade 0 -> view all (implicitly allows head teachers to see all)

    df = fetch_data_df(query, params=tuple(params))
    return df.to_dict('records') 

# --- USER MANAGEMENT (ADMIN) ---

@app.get("/api/admin/users", response_model=List[UserResponse])
async def list_all_users(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id"),
    x_school_id: Optional[int] = Header(None, alias="X-School-Id") # Optional context switch
):
    # Updated permission code
    await verify_permission("user_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        requester = conn.execute("SELECT school_id, is_super_admin, role FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not requester:
             raise HTTPException(status_code=401, detail="User not found")
        
        req_school_id = requester['school_id']
        is_super_admin = bool(requester['is_super_admin'])
        
        query = "SELECT id, name, role, grade, preferred_subject, school_id FROM students"
        params = []
        conds = []

        # RBAC Filtering
        if is_super_admin:
            # Super Admin can see all, OR filter by specific school if context is set
            if x_school_id:
                conds.append("school_id = ?")
                params.append(x_school_id)
            # else: see all
        else:
            # Regular Admins (Tenant, Academic) MUST be restricted to their school
            conds.append("school_id = ?")
            params.append(req_school_id)

        if conds:
            query += " WHERE " + " AND ".join(conds)
        
        query += " ORDER BY role, name"
        
        rows = conn.execute(query, tuple(params)).fetchall()
        return [UserResponse(
            id=r['id'], 
            name=r['name'], 
            role=r['role'], 
            grade=r['grade'], 
            preferred_subject=r['preferred_subject']
        ) for r in rows]
    finally:
        conn.close()

@app.post("/api/admin/users", status_code=201)
async def create_new_user(
    request: AddUserRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("manage_users", x_user_id=x_user_id)
    
    validate_password_strength(request.password)

    conn = get_db_connection()
    try:
        requester = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        school_id = requester['school_id'] if requester else 1
        
        # Check if ID exists
        if conn.execute("SELECT 1 FROM students WHERE id = ?", (request.id,)).fetchone():
             raise HTTPException(status_code=400, detail="User ID/Email already exists.")
             
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO students (id, name, grade, preferred_subject, attendance_rate, home_language, password, role, school_id)
            VALUES (?, ?, ?, ?, 100.0, 'English', ?, ?, ?)
            """,
            (request.id, request.name, request.grade, request.preferred_subject, request.password, request.role, school_id)
        )
        conn.commit()
        log_auth_event(x_user_id, "User Created", f"Created user {request.id} ({request.role})")
        return {"message": f"User {request.name} created successfully."}
    except sqlite3.IntegrityError:
         raise HTTPException(status_code=400, detail="User ID already exists.")
    finally:
        conn.close() 


@app.get("/api/students/{student_id}/quiz-results")
async def get_student_quiz_results(
    student_id: str,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    # Authorization Check
    if x_user_role == 'Student' and x_user_id != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    conn = get_db_connection()
    c = conn.cursor()
    # Join with modules and sections and courses to get titles
    query = """
        SELECT 
            mc.score, 
            mc.status, 
            m.title as module_title,
            c.title as course_title
        FROM lms_module_completion mc
        JOIN lms_course_modules m ON mc.module_id = m.id
        JOIN lms_course_sections s ON m.section_id = s.id
        JOIN lms_courses c ON s.course_id = c.id
        WHERE mc.student_id = ? AND m.type = 'quiz'
    """
    try:
        rows = c.execute(query, (student_id,)).fetchall()
        results = [dict(row) for row in rows]
        return results[::-1] 
    except Exception as e:
        logger.error(f"Error fetching quiz results: {e}")
        return []
    finally:
        conn.close()


@app.get("/api/students/{student_id}/data", response_model=StudentDataResponse)
async def get_student_data(
    student_id: str,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    # 1. Fetch Target Student Info
    conn = get_db_connection()
    target_student = conn.execute("SELECT school_id, grade, math_score, science_score, english_language_score FROM students WHERE id = ?", (student_id,)).fetchone()
    
    if not target_student:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Student ID '{student_id}' not found.")

    target_school_id = target_student['school_id']
    target_grade = target_student['grade']
    
    # 2. Authorization Check
    # If Requester is the Student -> Must match ID
    if x_user_role == 'Student' and x_user_id != student_id:
        conn.close()
        raise HTTPException(status_code=403, detail="Unauthorized: You can only view your own data.")
    
    # If Requester is Teacher -> Must check permissions
    if x_user_role == 'Teacher' or x_user_role == 'Admin':
         requester = conn.execute("SELECT school_id, grade, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
         if requester:
             is_super_admin = bool(requester['is_super_admin'])
             requester_grade = requester['grade'] if requester['grade'] is not None else 0
             
             if not is_super_admin:
                 # Check Grade Match (Grade 0 means 'All Grades' access)
                 if requester_grade != 0 and requester_grade != target_grade:
                     conn.close()
                     raise HTTPException(status_code=403, detail="Unauthorized: You cannot view students outside your grade.")
         else:
             conn.close()
             raise HTTPException(status_code=403, detail="Unauthorized: Requester profile not found.")

    # 3. Proceed to fetch data
    # Fetch Roles
    user_roles = conn.execute("""
        SELECT r.name FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
    """, (student_id,)).fetchall()
    role_list = [r['name'] for r in user_roles]
    # Fallback to legacy role column if no user_roles entry
    if not role_list:
        legacy_role = conn.execute("SELECT role FROM students WHERE id = ?", (student_id,)).fetchone()
        if legacy_role and legacy_role['role']:
             role_list.append(legacy_role['role'])

    profile = {
        'math_score': target_student['math_score'],
        'science_score': target_student['science_score'],
        'english_language_score': target_student['english_language_score'],
        'roles': role_list
    }

    history_df = fetch_data_df("SELECT date, topic, difficulty, score, time_spent_min FROM activities WHERE student_id = ? ORDER BY date ASC", (student_id,))
    conn.close() # Close manual connection

    avg_val = history_df['score'].mean()
    avg_score = avg_val if not history_df.empty and avg_val == avg_val else 0.0 # avg_val == avg_val checks for NaN
    total_activities = len(history_df)
    recommendation = get_recommendation(student_id)

    history_list = [
        StudentHistory(
            date=row['date'],
            topic=row['topic'],
            difficulty=row['difficulty'],
            score=row['score'],
            time_spent_min=row['time_spent_min']
        ) for _, row in history_df.iterrows()
    ]

    return StudentDataResponse(
        summary=StudentSummary(
            avg_score=round(avg_score, 1), 
            total_activities=total_activities, 
            recommendation=recommendation,
            math_score=profile['math_score'] or 0.0,       
            science_score=profile['science_score'] or 0.0, 
            english_language_score=profile['english_language_score'] or 0.0 
        ),
        history=history_list
    )

# --- GROUP MANAGEMENT ---

@app.post("/api/groups", status_code=201)
async def create_group(
    request: GroupCreateRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("manage_groups", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        school_id = user['school_id'] if user else 1

        cursor = conn.cursor()
        cursor.execute("INSERT INTO groups (name, description, subject, school_id) VALUES (?, ?, ?, ?)", 
                       (request.name, request.description, request.subject, school_id))
        conn.commit()
        return {"message": f"Group '{request.name}' created successfully."}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Group name must be unique.")
    finally:
        conn.close()

@app.get("/api/groups", response_model=List[GroupResponse])
async def get_groups(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    
    school_id = 1
    if x_user_id:
        user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if user: school_id = dict(user).get('school_id', 1)

    query = """
        SELECT g.id, g.name, g.description, g.subject, COUNT(gm.student_id) as member_count
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.school_id = ?
        GROUP BY g.id
    """
    groups = conn.execute(query, (school_id,)).fetchall()
    conn.close()
    
    return [GroupResponse(
        id=r['id'], 
        name=r['name'], 
        description=r['description'], 
        subject=r['subject'],
        member_count=r['member_count']
    ) for r in groups]

@app.delete("/api/groups/{group_id}")
async def delete_group(group_id: int):
    conn = get_db_connection()
    conn.execute("DELETE FROM groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"message": "Group deleted."}

@app.get("/api/groups/{group_id}/members")
async def get_group_members(group_id: int):
    conn = get_db_connection()
    group = conn.execute("SELECT * FROM groups WHERE id = ?", (group_id,)).fetchone()
    if not group:
        conn.close()
        raise HTTPException(status_code=404, detail="Group not found")
        
    members = conn.execute("SELECT student_id FROM group_members WHERE group_id = ?", (group_id,)).fetchall()
    member_ids = [m['student_id'] for m in members]
    conn.close()
    return {"group": dict(group), "members": member_ids}

@app.post("/api/groups/{group_id}/members")
async def update_group_members(group_id: int, request: GroupMemberUpdateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("manage_groups", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if not cursor.execute("SELECT id FROM groups WHERE id = ?", (group_id,)).fetchone():
             raise HTTPException(status_code=404, detail="Group not found")

        cursor.execute("DELETE FROM group_members WHERE group_id = ?", (group_id,))
        
        if request.student_ids:
            data = [(group_id, sid) for sid in request.student_ids]
            cursor.executemany("INSERT INTO group_members (group_id, student_id) VALUES (?, ?)", data)
            
        conn.commit()
        return {"message": "Group members updated."}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Invalid student ID provided.")
    finally:
        conn.close()

@app.post("/api/groups/{group_id}/materials")
async def add_group_material(group_id: int, request: MaterialCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("manage_groups", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        date_str = datetime.now().strftime("%Y-%m-%d")
        cursor.execute("INSERT INTO group_materials (group_id, title, type, content, date) VALUES (?, ?, ?, ?, ?)",
                       (group_id, request.title, request.type, request.content, date_str))
        conn.commit()
        return {"message": "Material added."}
    finally:
        conn.close()

@app.get("/api/groups/{group_id}/materials", response_model=List[MaterialResponse])
async def get_group_materials(group_id: int):
    conn = get_db_connection()
    materials = conn.execute("SELECT * FROM group_materials WHERE group_id = ? ORDER BY id DESC", (group_id,)).fetchall()
    conn.close()
    return [MaterialResponse(id=m['id'], title=m['title'], type=m['type'], content=m['content'], date=m['date']) for m in materials]

@app.get("/api/teacher/assignments")
async def get_teacher_assignments(section_id: Optional[int] = None,
                                  x_user_role: str = Header(None, alias="X-User-Role"),
                                  x_user_id: str = Header(None, alias="X-User-Id"),
                                  x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    await verify_permission("assignment.view", x_user_role=x_user_role, x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        query = """
            SELECT
                a.id,
                a.group_id,
                a.title,
                a.description,
                a.due_date,
                a.type,
                a.points,
                a.section_id,
                a.grade_level,
                sec.name AS section_name,
                COALESCE((
                    SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id
                ), 0) AS submission_count
            FROM assignments a
            LEFT JOIN sections sec ON a.section_id = sec.id
        """
        conditions = []
        params = []
        if section_id:
            conditions.append("a.section_id = ?")
            params.append(section_id)
        if x_school_id:
            conditions.append("(a.section_id IS NULL OR sec.school_id = ?)")
            params.append(x_school_id)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY a.due_date DESC, a.id DESC"
        rows = conn.execute(query, tuple(params)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/students/{student_id}/groups", response_model=List[GroupResponse])
async def get_student_groups(student_id: str):
    conn = get_db_connection()
    query = """
        SELECT g.id, g.name, g.description, g.subject
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.student_id = ?
    """
    groups = conn.execute(query, (student_id,)).fetchall()
    conn.close()
    return [GroupResponse(id=r['id'], name=r['name'], description=r['description'], subject=r['subject'], member_count=0) for r in groups]

@app.get("/api/students/{student_id}/assignments")
async def get_student_assignments(student_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    
    # Get student grade/section
    student = c.execute("SELECT grade, section_id FROM students WHERE id = ?", (student_id,)).fetchone()
    grade = student['grade'] if student else 0
    section_id = student['section_id'] if student else None

    # 1. Standard Assignments (via Groups OR Class/Section)
    assignments = c.execute("""
        SELECT a.id, a.title, a.due_date, a.type,
               COALESCE(g.name, sec.name, 'Class') as course_name
        FROM assignments a
        LEFT JOIN group_members gm ON a.group_id = gm.group_id AND gm.student_id = ?
        LEFT JOIN groups g ON a.group_id = g.id
        LEFT JOIN sections sec ON a.section_id = sec.id
        WHERE gm.student_id IS NOT NULL
           OR (a.section_id IS NOT NULL AND a.section_id = ?)
           OR (a.section_id IS NULL AND a.grade_level IS NOT NULL AND a.grade_level = ?)
        ORDER BY a.due_date DESC
    """, (student_id, section_id, grade)).fetchall()
    
    results = [dict(row) for row in assignments]
    
    # 2. Quizzes (Directly Allocated or via Groups/Grades)
    
    # Fetch Quizzes that are NOT attempted yet
    # We want quizzes where:
    #   (target_type='student' AND target_id=student_id)
    #   OR (target_type='grade' AND target_id=str(grade))
    #   OR (target_type='group' AND group_id IN (SELECT group_id FROM group_members WHERE student_id=?))
    # AND id NOT IN (SELECT quiz_id FROM quiz_attempts WHERE student_id=?)
    
    quizzes = c.execute("""
        SELECT q.id, q.title, q.time_limit_mins, q.target_type, q.target_id, q.group_id
        FROM quizzes q
        WHERE 
           (q.target_type = 'student' AND q.target_id = ?)
           OR (q.target_type = 'grade' AND q.target_id = ?)
           OR (q.target_type = 'group' AND q.group_id IN (SELECT group_id FROM group_members WHERE student_id = ?))
    """, (student_id, str(grade), student_id)).fetchall()
    
    # Filter out completed ones manually or via query (simple query above gets all access)
    # Let's check attempts
    completed_quiz_ids = [row['quiz_id'] for row in c.execute("SELECT quiz_id FROM quiz_attempts WHERE student_id = ?", (student_id,)).fetchall()]
    
    for q in quizzes:
        if q['id'] not in completed_quiz_ids:
            # Format as assignment
            # Fetch Course Name if group based
            course_name = "Assigned Quiz"
            if q['target_type'] == 'group' and q['group_id']:
                 g = c.execute("SELECT name FROM groups WHERE id = ?", (q['group_id'],)).fetchone()
                 if g: course_name = g['name']
            elif q['target_type'] == 'grade':
                 course_name = f"Grade {q['target_id']} Quiz"
            elif q['target_type'] == 'student':
                 course_name = "Personal Quiz"
                 
            results.append({
                "id": q['id'],
                "title": q['title'],
                "due_date": f"Time Limit: {q['time_limit_mins']}m" if q['time_limit_mins'] > 0 else "No Limit",
                "type": "Quiz",
                "course_name": course_name,
                "is_quiz_module": True # Hint to frontend
            })

    conn.close()
    return results

# --- AI LESSON PLANNER ---
class LessonPlanRequest(BaseModel):
    topic: str
    subject: str
    grade_level: str
    duration: str  # e.g., "45 minutes"

class LessonPlanResponseAI(BaseModel):
    plan_markdown: str

@app.post("/api/ai/generate-lesson-plan", response_model=LessonPlanResponseAI)
async def generate_lesson_plan_v2(request: LessonPlanRequest):
    if not LESSON_PLANNER_CLIENT:
        raise HTTPException(status_code=503, detail="AI Service unavailable")

    prompt = f"""
    Create a detailed lesson plan for a {request.duration} class.
    Subject: {request.subject}
    Grade Level: {request.grade_level}
    Topic: {request.topic}

    Structure the lesson plan with the following sections using Markdown formatting:
    # Lesson Title
    ## Objectives
    ## Materials Needed
    ## Lesson Outline (with timestamps)
    ## Detailed Activities
    ## Assessment/Homework
    
    Keep it engaging and practical.
    """

    try:
        completion = LESSON_PLANNER_CLIENT.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are an expert educational consultant and curriculum developer."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1500,
            top_p=1,
            stream=False,
            stop=None,
        )
        
        return LessonPlanResponseAI(plan_markdown=completion.choices[0].message.content)

    except Exception as e:
        logger.error(f"Lesson Plan Generation Failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- ASSIGNMENTS & PROJECT MANAGEMENT ---
@app.post("/api/ai/generate-quiz", response_model=GenerateQuizResponse)
async def generate_quiz(
    topic: str = Form(...),
    difficulty: str = Form("Medium"),
    question_count: int = Form(5),
    type: str = Form("Multiple Choice"),
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    if not AI_ENABLED:
         return GenerateQuizResponse(content='[{"question": "AI Disabled", "options": ["A", "B"], "correct_answer": "A"}]')

    try:
        # PDF Processing
        pdf_context = ""
        if file and PdfReader:
            try:
                if file.filename.endswith('.pdf'):
                    pdf_reader = PdfReader(file.file)
                    for page in pdf_reader.pages:
                        pdf_context += page.extract_text() + "\n"
                    pdf_context = pdf_context[:5000]
                else:
                    content = await file.read()
                    pdf_context = content.decode('utf-8', errors='ignore')[:5000]
            except Exception as e:
                logger.error(f"File read error: {e}")

        # Enforce JSON Structure for Database Compatibility
        prompt = f"""
        Generate a {difficulty} difficulty {type} quiz about "{topic}".
        """
        if description:
            prompt += f"Context/Description: {description}\n"
        
        if pdf_context:
            prompt += f"\nReference Material (Use this content to generate questions):\n{pdf_context}\n"
            
        prompt += f"""
        It should have {question_count} questions.
        Return ONLY a raw JSON array. Do not include markdown formatting (like ```json), just the array.
        Format:
        [
            {{
                "question": "Question text",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_answer": "Option A"
            }}
        ]
        """
        
        full_prompt = "You are a quiz generation engine. Output valid JSON only.\n" + prompt
        
        # Use Groq Client (switched from OpenRouter)
        try:
            chat_completion = GROQ_CLIENT.chat.completions.create(
                messages=[
                    {
                        "role": "system", 
                        "content": "You are a quiz generation engine. Return strictly valid JSON array only. No markdown formatting."
                    },
                    {
                        "role": "user", 
                        "content": full_prompt
                    }
                ],
                model=GROQ_MODEL, # Using Llama 3.1 8B Instant (fast) or 70B if configured
                temperature=0.5,
            )
            raw_content = chat_completion.choices[0].message.content.strip()
            
            # Cleaning markdown if present
            if raw_content.startswith("```json"):
                raw_content = raw_content[7:]
            if raw_content.startswith("```"):
                raw_content = raw_content[3:]
            if raw_content.endswith("```"):
                raw_content = raw_content[:-3]
            
            return GenerateQuizResponse(content=raw_content.strip())
            
        except Exception as groq_err:
            logger.error(f"Groq API Error: {groq_err}")
            raise Exception("AI processing failed.")

    except Exception as e:
        logger.error(f"AI Quiz Gen Error: {e}")
        # Return fallback mock data instead of 500
        mock_quiz = [
                {
                    "question": f"Fallback Question about {topic}",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "correct_answer": "Option A"
                }
            ] * question_count
        return GenerateQuizResponse(content=json.dumps(mock_quiz))




@app.get("/api/classes/upcoming")
async def get_upcoming_classes(student_id: Optional[str] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    
    # Determine School Context
    school_id = 1
    if x_user_id:
        user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if user: school_id = dict(user).get('school_id', 1)

    # Fetch classes for this school
    query = "SELECT * FROM live_classes WHERE school_id = ? ORDER BY date ASC"
    classes = conn.execute(query, (school_id,)).fetchall()
    conn.close()
    
    valid_classes = []
    for row in classes:
        cls = dict(row)
        # Optional: Filter by student_id if 'target_students' is used
        if student_id:
             try:
                 targets = json.loads(cls.get('target_students', '[]') or '[]')
                 # If explicit list exists and student not in it, skip (unless list is empty -> public)
                 if targets and isinstance(targets, list) and len(targets) > 0 and student_id not in targets:
                     continue 
             except: pass
        valid_classes.append(cls)

    return valid_classes

@app.post("/api/classes")
async def schedule_class_endpoint(
    request: ClassScheduleRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("schedule_active_class", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        school_id = user['school_id'] if user else 1

        cursor = conn.cursor()
        targets = json.dumps(request.target_students) if request.target_students else "[]"
        cursor.execute("INSERT INTO live_classes (topic, date, meet_link, target_students, teacher_id, school_id) VALUES (?, ?, ?, ?, ?, ?)",
                       (request.topic, request.date, request.meet_link, targets, x_user_id, school_id))
        conn.commit()
        return {"message": "Class scheduled successfully."}
    finally:
        conn.close()

@app.delete("/api/classes/{class_id}")
async def delete_class(class_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM live_classes WHERE id = ?", (class_id,))
    conn.commit()
    conn.close()
    return {"message": "Class cancelled."}

@app.post("/api/class/start")
async def start_class(
    request: ClassSessionRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("schedule_active_class", x_user_id=x_user_id)

    CLASS_SESSION["is_active"] = True
    CLASS_SESSION["meet_link"] = request.meet_link
    return {"message": "Online class started successfully.", "link": request.meet_link}

@app.post("/api/class/end")
async def end_class():
    CLASS_SESSION["is_active"] = False
    CLASS_SESSION["meet_link"] = ""
    return {"message": "Online class ended."}

# --- WEBSOCKET MANAGER FOR WHITEBOARD ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        # Broadcast to all connected clients
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Handle broken connections gracefully
                pass

manager = ConnectionManager()

@app.websocket("/ws/whiteboard")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        manager.disconnect(websocket)
 

@app.get("/api/teacher/export-grades-csv")
async def export_grades_csv(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("view_all_grades", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        # Fetch comprehensive student data
        query = """
            SELECT 
                s.id, 
                s.name, 
                s.grade, 
                s.attendance_rate || '%' as attendance,
                s.preferred_subject,
                s.math_score as initial_math_score,
                s.science_score as initial_science_score,
                s.english_language_score as initial_english_score,
                COALESCE(ROUND(AVG(a.score), 1), 0) as current_average_score,
                COUNT(a.id) as activities_completed
            FROM students s
            LEFT JOIN activities a ON s.id = a.student_id
            WHERE s.role = 'Student'
            GROUP BY s.id
        """
        cursor = conn.cursor()
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write Header
        writer.writerow([
            "Student ID", "Name", "Grade", "Attendance", "Fav Subject", 
            "Initial Math", "Initial Science", "Initial English", 
            "Current Avg Score", "Activities Completed"
        ])
        
        # Write Data
        for row in rows:
            writer.writerow([
                row['id'], row['name'], row['grade'], row['attendance'], row['preferred_subject'],
                row['initial_math_score'], row['initial_science_score'], row['initial_english_score'],
                row['current_average_score'], row['activities_completed']
            ])
            
        output.seek(0)
        
        # Return as StreamingResponse
        response = StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv"
        )
        response.headers["Content-Disposition"] = "attachment; filename=class_grades_export.csv"
        return response

    except Exception as e:
        logger.error(f"Export Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate export.")
    finally:
        conn.close()

# --- LMS MODULE: MATERIALS & QUIZZES ---

@app.post("/api/groups/{group_id}/upload")
async def upload_group_material(group_id: int, file: UploadFile = File(...), title: str = None):
    # LMS Phase 1: File Uploads
    try:
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Determine Type
        content_type = "File"
        if file_ext.lower() in ['.pdf']: content_type = "PDF"
        elif file_ext.lower() in ['.mp4', '.mov', '.avi']: content_type = "Video"
        elif file_ext.lower() in ['.jpg', '.png', '.jpeg']: content_type = "Image"
        
        # Save to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        date_str = datetime.now().strftime("%Y-%m-%d")
        display_title = title or file.filename
        
        # URL accessible via static mount
        file_url = f"/static/uploads/{unique_filename}"
        
        cursor.execute("INSERT INTO group_materials (group_id, title, type, content, date) VALUES (?, ?, ?, ?, ?)",
                      (group_id, display_title, content_type, file_url, date_str))
        conn.commit()
        conn.close()
        
        return {"message": "File uploaded successfully", "url": file_url}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/quizzes/create", response_model=QuizResponse)
async def create_quiz_endpoint(request: QuizCreateRequest):
    try:
        # LMS Phase 2: Create Quiz
        conn = get_db_connection()
        cursor = conn.cursor()
        
        questions_json = json.dumps(request.questions)
        created_at = datetime.now().isoformat()
        
        # Store acknowledged status
        acknowledged_val = request.acknowledged # Pass boolean directly for Postgres
        
        # Ensure target_id is stored correctly (as TEXT in DB)
        # For non-group targets, group_id is NULL
        
        cursor.execute("""
            INSERT INTO quizzes (group_id, title, questions, created_at, time_limit_mins, target_type, target_id, acknowledged)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        """, (request.group_id, request.title, questions_json, created_at, request.time_limit, request.target_type, request.target_id, acknowledged_val))
        
        quiz_id = cursor.lastrowid
        if not quiz_id:
             raise ValueError("Failed to retrieve new quiz ID")

        conn.commit()
        conn.close()
        
        return QuizResponse(
            id=quiz_id, 
            group_id=request.group_id, 
            title=request.title, 
            question_count=len(request.questions), 
            created_at=created_at,
            time_limit=request.time_limit,
            target_type=request.target_type,
            target_id=request.target_id
        )
    except Exception as e:
        logger.error(f"Create Quiz Error: {e}")
        # traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"Server Error: {str(e)}")

@app.get("/api/teacher/quizzes")
async def get_teacher_quizzes(x_user_role: str = Header(None, alias="X-User-Role")):
    # Allow Teachers and Admins to see all quizzes to check results
    if x_user_role not in ['Teacher', 'Admin', 'Super Admin', 'Principal', 'Tenant_Admin']:
         raise HTTPException(status_code=403, detail="Unauthorized")

    conn = get_db_connection()
    try:
        # Fetch all quizzes. In a real app, might filter by creator_id if we tracked it.
        # For now, fetching all lets them see Grade/Section quizzes.
        quizzes = conn.execute("SELECT * FROM quizzes ORDER BY created_at DESC").fetchall()
        
        result = []
        for q in quizzes:
            q_dict = dict(q)
            try:
                q_dict['question_count'] = len(json.loads(q_dict['questions']))
            except:
                q_dict['question_count'] = 0
            del q_dict['questions'] # Optimize payload
            result.append(q_dict)
        return result
    finally:
        conn.close()

@app.get("/api/groups/{group_id}/quizzes")
async def get_group_quizzes(group_id: int):
    conn = get_db_connection()
    quizzes = conn.execute("SELECT id, title, created_at, questions FROM quizzes WHERE group_id = ?", (group_id,)).fetchall()
    
    # Also fetch attempts for the current user if they are a student? 
    # For now just return the quizzes. Frontend can verify if taken.
    result = []
    for q in quizzes:
        q_dict = dict(q)
        q_dict['question_count'] = len(json.loads(q_dict['questions']))
        del q_dict['questions'] # Don't send answers/questions in list view
        result.append(q_dict)
    conn.close()
    return result

@app.get("/api/quizzes/{quiz_id}")
async def get_quiz_details(quiz_id: int):
    conn = get_db_connection()
    quiz = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
    conn.close()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    data = dict(quiz)
    data['questions'] = json.loads(data['questions'])
    
    # SECURITY: If student, strip 'isCorrect' or 'answer' fields from questions if they exist?
    # For simplicity in this V1, we assume questions JSON is [{question, options, correct_answer}]
    # We should ideally strip 'correct_answer' before sending to student.
    
    safe_questions = []
    for q in data['questions']:
        q_copy = q.copy()
        if 'correct_answer' in q_copy:
            del q_copy['correct_answer'] # Hide answer
        safe_questions.append(q_copy)
        
    data['questions'] = safe_questions
    return data

@app.post("/api/quizzes/{quiz_id}/submit")
async def submit_quiz(quiz_id: int, request: QuizSubmitRequest):
    try:
        conn = get_db_connection()
        quiz_row = conn.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,)).fetchone()
        
        if not quiz_row:
            conn.close()
            raise HTTPException(status_code=404, detail="Quiz not found")
            
        quiz = dict(quiz_row)
        questions = json.loads(quiz['questions'])
        score = 0
        total = len(questions)
        
        # Grading Logic
        for idx, q in enumerate(questions):
            correct = q.get('correct_answer', '').strip().lower()
            user_ans = request.answers.get(str(idx), '').strip().lower()
            
            if user_ans == correct:
                score += 1
                
        final_score_percent = (score / total) * 100 if total > 0 else 0
        
        # AI Assessment
        ai_feedback = "Good effort! Review the correct answers to improve."
        if AI_ENABLED and GROQ_CLIENT:
            try:
                assessment_prompt = f"Quiz Title: {quiz['title']}\n"
                for idx, q in enumerate(questions):
                    user_ans = request.answers.get(str(idx), 'No Answer')
                    assessment_prompt += f"Q{idx+1}: {q.get('question', 'Untitled')}\nCorrect: {q.get('correct_answer', 'N/A')}\nStudent Answer: {user_ans}\n\n"
                
                chat_completion = GROQ_CLIENT.chat.completions.create(
                    messages=[
                        {
                            "role": "system", 
                            "content": "You are an encouraging AI Teacher. Review the student's quiz answers and provide a brief, personalized assessment (max 60 words). Mention what they did well and one thing to focus on."
                        },
                        {"role": "user", "content": assessment_prompt}
                    ],
                    model=GROQ_MODEL,
                    temperature=0.7,
                )
                ai_feedback = chat_completion.choices[0].message.content.strip()
            except Exception as ai_e:
                logger.error(f"AI Assessment Error: {ai_e}")

        # Save Attempt
        answers_json = json.dumps(request.answers)
        submitted_at = datetime.now().isoformat()
        
        conn.execute("INSERT INTO quiz_attempts (quiz_id, student_id, score, answers, ai_feedback, submitted_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (quiz_id, request.student_id, final_score_percent, answers_json, ai_feedback, submitted_at))
        
        # Update Student Stats (XP, Activity Log)
        conn.execute("INSERT INTO activities (student_id, date, topic, difficulty, score, time_spent_min, ai_feedback) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (request.student_id, datetime.now().strftime("%Y-%m-%d"), f"Quiz: {quiz['title']}", "Medium", final_score_percent, 15, ai_feedback))

        conn.commit()
        conn.close()
        
        return {
            "score_percent": final_score_percent, 
            "score": score, 
            "total": total, 
            "ai_feedback": ai_feedback
        }
    except Exception as e:
        logger.error(f"Submit Quiz Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/quizzes/{quiz_id}/results")
async def get_quiz_results(
    quiz_id: int, 
    x_user_id: str = Header(None, alias="X-User-Id"),
    x_user_role: str = Header(None, alias="X-User-Role")
):
    # Only Teachers and Admins can view results
    if x_user_role not in ['Teacher', 'Admin', 'Super Admin', 'Principal', 'Tenant_Admin']:
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    conn = get_db_connection()
    try:
        # Fetch attempts joined with student info
        query = """
            SELECT 
                qa.student_id, 
                s.name as student_name, 
                qa.score, 
                qa.ai_feedback, 
                qa.submitted_at 
            FROM quiz_attempts qa
            JOIN students s ON qa.student_id = s.id
            WHERE qa.quiz_id = ?
            ORDER BY qa.score DESC
        """
        results = conn.execute(query, (quiz_id,)).fetchall()
        
        return [dict(row) for row in results]
    except Exception as e:
        logger.error(f"Quiz Results Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch results")
    finally:
        conn.close()

# --- SCHOOL MANAGEMENT ---

@app.get("/api/admin/schools", response_model=List[SchoolResponse])
async def get_schools():
    conn = get_db_connection()
    try:
        schools = conn.execute("SELECT * FROM schools").fetchall()
        return [SchoolResponse(
            id=s['id'],
            name=s['name'],
            address=s['address'] if s['address'] else "",
            contact_email=s['contact_email'] if s['contact_email'] else "",
            created_at=s['created_at'] if s['created_at'] else datetime.now().isoformat()
        ) for s in schools]
    finally:
        conn.close()


@app.put("/api/admin/schools/{school_id}")
async def update_school(
    school_id: int,
    request: SchoolCreateRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user or not user['is_super_admin']:
             log_auth_event(x_user_id, "Unauthorized Access", "Attempted to update school without Super Admin access")
             raise HTTPException(status_code=403, detail="Permission denied. SUPER ADMIN ONLY.")
        
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE schools SET name = ?, address = ?, contact_email = ? WHERE id = ?",
            (request.name, request.address, request.contact_email, school_id)
        )
        if cursor.cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="School not found.")

        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="School name already exists.")
    finally:
        conn.close()
    
    return {"message": "School updated successfully."}

@app.delete("/api/admin/schools/{school_id}")
async def delete_school(
    school_id: int,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
         raise HTTPException(status_code=401, detail="Authentication required")
         
    if school_id == 1:
        raise HTTPException(status_code=403, detail="Cannot delete the default 'Independent' school.")

    conn = get_db_connection()
    try:
        user = conn.execute("SELECT is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user or not user['is_super_admin']:
             log_auth_event(x_user_id, "Unauthorized Access", "Attempted to delete school without Super Admin access")
             raise HTTPException(status_code=403, detail="Permission denied. SUPER ADMIN ONLY.")
        
        cursor = conn.cursor()
        # Note: Students will be moved to school_id=1 automatically by DB constraint ON DELETE SET DEFAULT if configured,
        # or we might need to handle it. Let's assume the DB constraint works or we just delete.
        # But to be safe and clear:
        cursor.execute("DELETE FROM schools WHERE id = ?", (school_id,))
        
        if cursor.cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="School not found.")

        conn.commit()
    finally:
        conn.close()
    
    return {"message": "School deleted successfully."}

@app.get("/api/admin/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("view_audit_logs", x_user_id=x_user_id)

    conn = get_db_connection()
    try:
        # Select all columns explicitly including new ones
        logs = conn.execute("SELECT id, user_id, event_type, timestamp, details, logout_time, duration_minutes FROM auth_logs ORDER BY timestamp DESC LIMIT 100").fetchall()
        
        return [
            AuditLogResponse(
                id=row['id'], 
                user_id=row['user_id'], 
                event_type=row['event_type'], 
                timestamp=row['timestamp'], 
                details=row['details'],
                logout_time=row['logout_time'],
                duration_minutes=row['duration_minutes']
            ) 
            for row in logs
        ]
    except Exception as e:
        # Log the error for debugging
        print(f"Error fetching logs: {e}")
        # Return a simplified list or empty list to fail gracefully if schema mismatch persists
        # But for valid JSON response let's raise
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

# @app.on_event("startup") removed in favor of lifespan
# Startup logic moved to lifespan function defined at the top.

# --- COMMUNICATION & ENGAGEMENT ---
class AnnouncementCreateRequest(BaseModel):
    title: str
    content: str
    target_role: str = "All" # All, Student, Teacher, Parent

class MessageSendRequest(BaseModel):
    receiver_id: str
    content: str
    subject: Optional[str] = "No Subject"

class EventCreateRequest(BaseModel):
    title: str
    date: str # YYYY-MM-DD
    type: str # Exam, Holiday, Meeting

class ExamScheduleCreateRequest(BaseModel):
    title: str
    subject: str
    grade_level: int
    date: str # YYYY-MM-DD
    school_id: Optional[int] = None
    section_id: Optional[int] = None
    start_time: Optional[str] = None # HH:MM
    end_time: Optional[str] = None # HH:MM
    venue: Optional[str] = None
    instructions: Optional[str] = None # Items required to bring
    teacher_id: Optional[str] = None
    notify: bool = True
    notification_message: Optional[str] = None

class ExamScheduleUpdateRequest(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    grade_level: Optional[int] = None
    date: Optional[str] = None # YYYY-MM-DD
    section_id: Optional[int] = None
    start_time: Optional[str] = None # HH:MM
    end_time: Optional[str] = None # HH:MM
    venue: Optional[str] = None
    instructions: Optional[str] = None
    teacher_id: Optional[str] = None
    notify: bool = False
    notification_message: Optional[str] = None

class ExamScheduleNotifyRequest(BaseModel):
    message: Optional[str] = None
    items_required: Optional[str] = None
    include_teachers: bool = True

@app.get("/api/communication/announcements")
async def get_announcements():
    conn = get_db_connection()
    c = conn.cursor()
    # Simple fetch, in production we would filter by user role
    anns = c.execute("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50").fetchall()
    conn.close()
    return [dict(a) for a in anns]

@app.post("/api/communication/announcements")
async def create_announcement(req: AnnouncementCreateRequest):
    conn = get_db_connection()
    try:
        ts = datetime.now().isoformat()
        conn.execute("INSERT INTO announcements (title, content, target_role, created_at) VALUES (?, ?, ?, ?)", 
                     (req.title, req.content, req.target_role, ts))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"success": True}

@app.get("/api/communication/messages")
async def get_messages(user_id: str = Header(None, alias="X-User-Id")):
    if not user_id: return []
    conn = get_db_connection()
    c = conn.cursor()
    # Get messages where I am receiver OR sender
    msgs = c.execute("""
        SELECT * FROM messages 
        WHERE receiver_id = ? OR sender_id = ? 
        ORDER BY timestamp DESC
    """, (user_id, user_id)).fetchall()
    conn.close()
    return [dict(m) for m in msgs]

@app.post("/api/communication/messages")
async def send_message(req: MessageSendRequest, user_id: str = Header(None, alias="X-User-Id")):
    if not user_id: raise HTTPException(status_code=401)
    conn = get_db_connection()
    try:
        ts = datetime.now().isoformat()
        conn.execute("INSERT INTO messages (sender_id, receiver_id, content, subject, timestamp, is_read) VALUES (?, ?, ?, ?, ?, FALSE)", 
                     (user_id, req.receiver_id, req.content, req.subject, ts))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"success": True}

@app.get("/api/communication/events")
async def get_events():
    conn = get_db_connection()
    events = conn.execute("SELECT * FROM calendar_events ORDER BY date ASC").fetchall()
    conn.close()
    return [dict(e) for e in events]

@app.post("/api/communication/events")
async def create_event(req: EventCreateRequest):
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO calendar_events (title, date, type) VALUES (?, ?, ?)", 
                     (req.title, req.date, req.type))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    return {"success": True}

@app.post("/api/exam-schedules")
async def create_exam_schedule(req: ExamScheduleCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, school_id, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        role = user["role"]
        user_school_id = user["school_id"] if user["school_id"] else 1
        target_school_id = user_school_id
        if not (user["is_super_admin"] or role in ['Tenant_Admin', 'Principal', 'Admin', 'Super Admin']):
            raise HTTPException(status_code=403, detail="Only Principal/Admin can create exam schedules.")
        if req.school_id is not None:
            if user["is_super_admin"]:
                target_school_id = req.school_id
            elif int(req.school_id) != int(user_school_id):
                raise HTTPException(status_code=403, detail="You can only create schedules for your own school.")

        school_exists = conn.execute("SELECT id FROM schools WHERE id = ?", (target_school_id,)).fetchone()
        if not school_exists:
            raise HTTPException(status_code=400, detail="Invalid school_id.")

        if req.section_id:
            sec = conn.execute("SELECT id, school_id, grade_level FROM sections WHERE id = ?", (req.section_id,)).fetchone()
            if not sec or sec["school_id"] != target_school_id:
                raise HTTPException(status_code=400, detail="Invalid section_id for this school.")
            if sec["grade_level"] != req.grade_level:
                raise HTTPException(status_code=400, detail="section_id does not match grade_level.")
        if req.teacher_id:
            teacher = conn.execute(
                "SELECT id, role, school_id FROM students WHERE id = ?",
                (req.teacher_id,)
            ).fetchone()
            if not teacher or teacher["school_id"] != target_school_id or teacher["role"] != "Teacher":
                raise HTTPException(status_code=400, detail="teacher_id must be a valid Teacher in this school.")

        created_at = datetime.now().isoformat()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO exam_schedules (
                school_id, title, subject, grade_level, section_id, exam_date,
                start_time, end_time, venue, instructions, teacher_id,
                created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            target_school_id, req.title, req.subject, req.grade_level, req.section_id, req.date,
            req.start_time, req.end_time, req.venue, req.instructions, req.teacher_id,
            x_user_id, created_at, created_at
        ))
        schedule_id = cursor.lastrowid

        # Optional: also register as a calendar event for visibility
        try:
            conn.execute("INSERT INTO calendar_events (title, date, type, description) VALUES (?, ?, 'Exam', ?)",
                         (f"{req.title} - {req.subject}", req.date, req.instructions or ""))
        except Exception:
            pass

        notified = {"students": 0, "parents": 0, "teachers": 0}
        if req.notify:
            schedule = {
                "id": schedule_id,
                "school_id": target_school_id,
                "title": req.title,
                "subject": req.subject,
                "grade_level": req.grade_level,
                "section_id": req.section_id,
                "exam_date": req.date,
                "start_time": req.start_time,
                "end_time": req.end_time,
                "venue": req.venue,
                "instructions": req.instructions,
                "teacher_id": req.teacher_id
            }
            notified = _notify_exam_schedule(
                conn,
                schedule,
                sender_id=x_user_id,
                custom_message=req.notification_message,
                items_required=req.instructions
            )

        conn.commit()
        return {"success": True, "id": schedule_id, "school_id": target_school_id, "notified": notified}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/exam-schedules/my")
async def get_my_exam_schedules(x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT id, role, grade, section_id, school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")

        role = user["role"]
        school_id = user["school_id"] if user["school_id"] else 1

        def fetch_schedules_for(grade_level: int, section_id: Optional[int]):
            query = """
                SELECT es.*, sec.name AS section_name, t.name AS teacher_name
                FROM exam_schedules es
                LEFT JOIN sections sec ON es.section_id = sec.id
                LEFT JOIN students t ON es.teacher_id = t.id
                WHERE es.school_id = ? AND es.grade_level = ?
                AND (es.section_id IS NULL OR es.section_id = ?)
                ORDER BY es.exam_date ASC, es.start_time ASC
            """
            return conn.execute(query, (school_id, grade_level, section_id)).fetchall()

        if role == 'Student':
            rows = fetch_schedules_for(user["grade"], user["section_id"])
            return [dict(r) for r in rows]

        if role in ['Parent', 'Parent_Guardian']:
            results = []
            parent_row = conn.execute(
                "SELECT id, name FROM students WHERE id = ?",
                (x_user_id,)
            ).fetchone()
            parent_name = (parent_row["name"] or "").strip() if parent_row else ""

            parent_email_candidates = {(x_user_id or "").strip()}
            if x_user_id in PARENT_OTP_EMAIL_OVERRIDES:
                parent_email_candidates.add((PARENT_OTP_EMAIL_OVERRIDES[x_user_id] or "").strip())

            # If logged in using parent user-id alias (e.g., parent_g1_1), include mapped email key.
            for login_email, alias_values in PARENT_LOGIN_ALIASES.items():
                if isinstance(alias_values, str):
                    alias_values = (alias_values,)
                if any((v or "").strip().lower() == (x_user_id or "").strip().lower() for v in alias_values):
                    parent_email_candidates.add((login_email or "").strip())

            valid_email_candidates = [e for e in parent_email_candidates if e]
            children_by_id: Dict[str, Dict[str, Any]] = {}

            for parent_email in valid_email_candidates:
                rows = conn.execute("""
                    SELECT s.id, s.name, s.grade, s.section_id
                    FROM guardians g
                    JOIN students s ON g.student_id = s.id
                    WHERE LOWER(g.email) = LOWER(?) AND s.school_id = ? AND s.role = 'Student'
                """, (parent_email, school_id)).fetchall()
                for row in rows:
                    children_by_id[row["id"]] = dict(row)

            # Fallback by guardian name matching parent account (for legacy datasets).
            if parent_name:
                rows = conn.execute("""
                    SELECT s.id, s.name, s.grade, s.section_id
                    FROM guardians g
                    JOIN students s ON g.student_id = s.id
                    WHERE (
                        LOWER(g.name) = LOWER(?)
                        OR LOWER(g.name) = LOWER(?)
                    )
                      AND s.school_id = ?
                      AND s.role = 'Student'
                """, (parent_name, x_user_id, school_id)).fetchall()
                for row in rows:
                    children_by_id[row["id"]] = dict(row)

            children = list(children_by_id.values())
            for child in children:
                rows = fetch_schedules_for(child["grade"], child["section_id"])
                for r in rows:
                    item = dict(r)
                    item["student_id"] = child["id"]
                    item["student_name"] = child["name"]
                    results.append(item)
            return results

        if role == 'Teacher':
            query = """
                SELECT es.*, sec.name AS section_name, t.name AS teacher_name
                FROM exam_schedules es
                LEFT JOIN sections sec ON es.section_id = sec.id
                LEFT JOIN students t ON es.teacher_id = t.id
                WHERE es.school_id = ?
                AND (
                    es.teacher_id = ?
                    OR EXISTS (
                        SELECT 1 FROM timetables tt
                        WHERE tt.teacher_id = ?
                        AND tt.class_grade = es.grade_level
                        AND (es.section_id IS NULL OR tt.section = (SELECT name FROM sections WHERE id = es.section_id))
                        AND (es.subject IS NULL OR tt.subject = es.subject)
                    )
                )
                ORDER BY es.exam_date ASC, es.start_time ASC
            """
            rows = conn.execute(query, (school_id, x_user_id, x_user_id)).fetchall()
            return [dict(r) for r in rows]

        # Principal/Admin/Super Admin -> all schedules for school
        rows = conn.execute("""
            SELECT es.*, sec.name AS section_name, t.name AS teacher_name
            FROM exam_schedules es
            LEFT JOIN sections sec ON es.section_id = sec.id
            LEFT JOIN students t ON es.teacher_id = t.id
            WHERE es.school_id = ?
            ORDER BY es.exam_date ASC, es.start_time ASC
        """, (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/exam-schedules/all")
async def get_all_exam_schedules(
    school_id: Optional[int] = None,
    grade_level: Optional[int] = None,
    section_id: Optional[int] = None,
    subject: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, school_id, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not (user["is_super_admin"] or user["role"] in ['Tenant_Admin', 'Principal', 'Admin', 'Super Admin']):
            raise HTTPException(status_code=403, detail="Only Principal/Admin can view all exam schedules.")

        target_school_id = user["school_id"] if user["school_id"] else 1
        if user["is_super_admin"] and school_id is not None:
            target_school_id = school_id
        query = """
            SELECT es.*, sec.name AS section_name, t.name AS teacher_name
            FROM exam_schedules es
            LEFT JOIN sections sec ON es.section_id = sec.id
            LEFT JOIN students t ON es.teacher_id = t.id
            WHERE es.school_id = ?
        """
        params = [target_school_id]
        if grade_level is not None:
            query += " AND es.grade_level = ?"
            params.append(grade_level)
        if section_id is not None:
            query += " AND es.section_id = ?"
            params.append(section_id)
        if subject:
            query += " AND es.subject = ?"
            params.append(subject)
        if date_from:
            query += " AND es.exam_date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND es.exam_date <= ?"
            params.append(date_to)
        query += " ORDER BY es.exam_date ASC, es.start_time ASC"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.put("/api/exam-schedules/{schedule_id}")
async def update_exam_schedule(
    schedule_id: int,
    req: ExamScheduleUpdateRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, school_id, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not (user["is_super_admin"] or user["role"] in ['Tenant_Admin', 'Principal', 'Admin', 'Super Admin']):
            raise HTTPException(status_code=403, detail="Only Principal/Admin can update exam schedules.")

        school_id = user["school_id"] if user["school_id"] else 1
        existing = conn.execute("SELECT * FROM exam_schedules WHERE id = ? AND school_id = ?", (schedule_id, school_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Exam schedule not found.")

        if req.section_id:
            sec = conn.execute("SELECT id, school_id, grade_level FROM sections WHERE id = ?", (req.section_id,)).fetchone()
            if not sec or sec["school_id"] != school_id:
                raise HTTPException(status_code=400, detail="Invalid section_id for this school.")
            if req.grade_level and sec["grade_level"] != req.grade_level:
                raise HTTPException(status_code=400, detail="section_id does not match grade_level.")
        if req.teacher_id:
            teacher = conn.execute(
                "SELECT id, role, school_id FROM students WHERE id = ?",
                (req.teacher_id,)
            ).fetchone()
            if not teacher or teacher["school_id"] != school_id or teacher["role"] != "Teacher":
                raise HTTPException(status_code=400, detail="teacher_id must be a valid Teacher in this school.")

        updates = []
        params = []
        for field, value in [
            ("title", req.title),
            ("subject", req.subject),
            ("grade_level", req.grade_level),
            ("section_id", req.section_id),
            ("exam_date", req.date),
            ("start_time", req.start_time),
            ("end_time", req.end_time),
            ("venue", req.venue),
            ("instructions", req.instructions),
            ("teacher_id", req.teacher_id),
        ]:
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)
        updates.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(schedule_id)

        if updates:
            conn.execute(f"UPDATE exam_schedules SET {', '.join(updates)} WHERE id = ?", params)

        schedule = conn.execute("SELECT * FROM exam_schedules WHERE id = ?", (schedule_id,)).fetchone()
        if req.notify and schedule:
            _notify_exam_schedule(
                conn,
                dict(schedule),
                sender_id=x_user_id,
                custom_message=req.notification_message,
                items_required=req.instructions
            )

        conn.commit()
        return {"success": True}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/exam-schedules/{schedule_id}/notify")
async def notify_exam_schedule(
    schedule_id: int,
    req: ExamScheduleNotifyRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    conn = get_db_connection()
    try:
        user = conn.execute("SELECT role, school_id, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if not (user["is_super_admin"] or user["role"] in ['Tenant_Admin', 'Principal', 'Admin', 'Super Admin']):
            raise HTTPException(status_code=403, detail="Only Principal/Admin can notify exam schedules.")

        school_id = user["school_id"] if user["school_id"] else 1
        schedule = conn.execute("SELECT * FROM exam_schedules WHERE id = ? AND school_id = ?", (schedule_id, school_id)).fetchone()
        if not schedule:
            raise HTTPException(status_code=404, detail="Exam schedule not found.")

        notified = _notify_exam_schedule(
            conn,
            dict(schedule),
            sender_id=x_user_id,
            custom_message=req.message,
            items_required=req.items_required,
            include_teachers=req.include_teachers
        )
        conn.commit()
        return {"success": True, "notified": notified}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/communication/emergency")
async def trigger_emergency():
    # Mock
    return {"success": True, "message": "Emergency Alerts dispatched to all registered contacts via SMS and Email."}

# --- COMPLIANCE & SECURITY ---

class RetentionPolicyRequest(BaseModel):
    audit_logs_days: int = 30
    access_logs_days: int = 30
    student_data_years: int = 7

@app.get("/api/admin/compliance/audit-logs", response_model=List[AuditLogResponse])
async def get_compliance_audit_logs(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("compliance.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        # Exclude common access events to separate Audit from Access
        query = """
            SELECT * FROM auth_logs 
            WHERE event_type NOT IN ('Login Success', 'Login Failed', 'Logout', '2FA Verified', '2FA Required')
            ORDER BY timestamp DESC LIMIT 100
        """
        logs = conn.execute(query).fetchall()
        return [
            AuditLogResponse(
                id=row['id'], 
                user_id=row['user_id'], 
                event_type=row['event_type'], 
                timestamp=row['timestamp'], 
                details=row['details'],
                logout_time=row.get('logout_time'),
                duration_minutes=row.get('duration_minutes')
            ) 
            for row in logs
        ]
    finally:
        conn.close()

@app.get("/api/admin/compliance/access-logs", response_model=List[AuditLogResponse])
async def get_compliance_access_logs(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("compliance.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        # Include ONLY access events
        query = """
            SELECT * FROM auth_logs 
            WHERE event_type IN ('Login Success', 'Login Failed', 'Logout', '2FA Verified', '2FA Required')
            ORDER BY timestamp DESC LIMIT 100
        """
        logs = conn.execute(query).fetchall()
        return [
            AuditLogResponse(
                id=row['id'], 
                user_id=row['user_id'], 
                event_type=row['event_type'], 
                timestamp=row['timestamp'], 
                details=row['details'],
                logout_time=row.get('logout_time'),
                duration_minutes=row.get('duration_minutes')
            ) 
            for row in logs
        ]
    finally:
        conn.close()

@app.get("/api/admin/compliance/retention")
async def get_retention_policies(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("compliance.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        settings = conn.execute("SELECT key, value FROM system_settings WHERE key LIKE 'retention_%'").fetchall()
        policies = {
             "audit_logs_days": 30,
             "access_logs_days": 30,
             "student_data_years": 7
        }
        for row in settings:
            field = row['key'].replace('retention_', '')
            if field in policies:
                policies[field] = int(row['value'])
        return policies
    finally:
        conn.close()

@app.post("/api/admin/compliance/retention")
async def update_retention_policies(
    req: RetentionPolicyRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("compliance.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO system_settings (key, value) VALUES ('retention_audit_logs_days', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(req.audit_logs_days),))
        cursor.execute("INSERT INTO system_settings (key, value) VALUES ('retention_access_logs_days', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(req.access_logs_days),))
        cursor.execute("INSERT INTO system_settings (key, value) VALUES ('retention_student_data_years', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(req.student_data_years),))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Retention policies updated."}

# --- STUDENT MANAGEMENT ENDPOINTS ---

# 1. Sections Management
@app.get("/api/sections", response_model=List[SectionResponse])
async def get_sections(school_id: Optional[int] = None):
    conn = get_db_connection()
    try:
        if school_id:
            sections = conn.execute("SELECT * FROM sections WHERE school_id = ?", (school_id,)).fetchall()
        else:
            sections = conn.execute("SELECT * FROM sections").fetchall()
        
        return [SectionResponse(**dict(s)) for s in sections]
    finally:
        conn.close()

@app.post("/api/sections", status_code=201)
async def create_section(req: SectionCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        ts = datetime.now().isoformat()
        conn.execute("INSERT INTO sections (school_id, name, grade_level, created_at) VALUES (?, ?, ?, ?)", 
                     (req.school_id, req.name, req.grade_level, ts))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Section created"}

# 2. Assign Class/Section
@app.post("/api/students/{student_id}/assign-section")
async def assign_student_section(student_id: str, section_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        # Check if section exists
        section = conn.execute("SELECT school_id, grade_level FROM sections WHERE id = ?", (section_id,)).fetchone()
        if not section:
            raise HTTPException(status_code=404, detail="Section not found")
            
        # Update student (Also update grade to match section if needed, optional)
        cursor = conn.cursor()
        cursor.execute("UPDATE students SET section_id = ?, grade = ? WHERE id = ?", (section_id, section['grade_level'], student_id))
        if cursor.cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Student not found")
        conn.commit()
    finally:
        conn.close()
    return {"message": "Student assigned to section successfully"}


# 3. Guardian Management
@app.get("/api/students/{student_id}/guardians", response_model=List[GuardianResponse])
async def get_guardians(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        guardians = conn.execute("SELECT * FROM guardians WHERE student_id = ?", (student_id,)).fetchall()
        return [GuardianResponse(**dict(g)) for g in guardians]
    finally:
        conn.close()

@app.post("/api/students/{student_id}/guardians", status_code=201)
async def add_guardian(student_id: str, req: GuardianCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id) # Usually manage is needed to ADD
    conn = get_db_connection()
    try:
        conn.execute(
            """INSERT INTO guardians (student_id, name, relationship, phone, email, address, is_emergency_contact) 
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (student_id, req.name, req.relationship, req.phone, req.email, req.address, req.is_emergency_contact)
        )
        conn.commit()
    finally:
        conn.close()
    return {"message": "Guardian added"}

@app.delete("/api/guardians/{id}")
async def delete_guardian(id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM guardians WHERE id = ?", (id,))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Guardian removed"}

# 4. Health Records
@app.get("/api/students/{student_id}/health", response_model=Optional[HealthRecordResponse])
async def get_health_record(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        record = conn.execute("SELECT * FROM health_records WHERE student_id = ?", (student_id,)).fetchone()
        if record:
            return HealthRecordResponse(**dict(record))
        return None
    finally:
        conn.close()

@app.put("/api/students/{student_id}/health")
async def update_health_record(student_id: str, req: HealthRecordUpdateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id) # Or specific permission
    conn = get_db_connection()
    try:
        ts = datetime.now().isoformat()
        # Check if exists
        exists = conn.execute("SELECT id FROM health_records WHERE student_id = ?", (student_id,)).fetchone()
        if exists:
            conn.execute("""
                UPDATE health_records SET 
                    blood_group=?, emergency_contact_name=?, emergency_contact_phone=?, 
                    allergies=?, medical_conditions=?, medications=?, 
                    doctor_name=?, doctor_phone=?, last_updated=?
                WHERE student_id=?
            """, (req.blood_group, req.emergency_contact_name, req.emergency_contact_phone, 
                  req.allergies, req.medical_conditions, req.medications, 
                  req.doctor_name, req.doctor_phone, ts, student_id))
        else:
            conn.execute("""
                INSERT INTO health_records 
                (student_id, blood_group, emergency_contact_name, emergency_contact_phone, allergies, medical_conditions, medications, doctor_name, doctor_phone, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (student_id, req.blood_group, req.emergency_contact_name, req.emergency_contact_phone, 
                  req.allergies, req.medical_conditions, req.medications, 
                  req.doctor_name, req.doctor_phone, ts))
        conn.commit()
    finally:
        conn.close()
    return {"message": "Health record updated"}

# 5. Documents
@app.get("/api/students/{student_id}/documents", response_model=List[DocumentResponse])
async def get_documents(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        docs = conn.execute("SELECT * FROM student_documents WHERE student_id = ?", (student_id,)).fetchall()
        return [DocumentResponse(**dict(d)) for d in docs]
    finally:
        conn.close()

@app.post("/api/students/{student_id}/documents")
async def upload_document(
    student_id: str,
    file: UploadFile = File(...),
    document_type: str = Form(...),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("student.info.manage", x_user_id=x_user_id)
    
    upload_dir = f"uploads/students/{student_id}"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = f"{upload_dir}/{uuid.uuid4()}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    conn = get_db_connection()
    try:
        ts = datetime.now().isoformat()
        conn.execute("""
            INSERT INTO student_documents (student_id, document_type, document_name, file_path, upload_date, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (student_id, document_type, file.filename, file_path, ts, x_user_id))
        conn.commit()
    finally:
        conn.close()
        
    return {"message": "Document uploaded"}

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("student.info.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        doc = conn.execute("SELECT file_path FROM student_documents WHERE id = ?", (doc_id,)).fetchone()
        if doc:
            try:
                if os.path.exists(doc['file_path']):
                    os.remove(doc['file_path'])
            except:
                pass # Ignore file system errors
            
            conn.execute("DELETE FROM student_documents WHERE id = ?", (doc_id,))
            conn.commit()
    finally:
        conn.close()
    return {"message": "Document deleted"}

# --- ROLE & PERMISSION MANAGEMENT ENDPOINTS (FR-3) ---


@app.get("/api/admin/roles/{role_id}", response_model=RoleResponse)
async def get_role_details(
    role_id: int,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        r = conn.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Role not found")
            
        perms = conn.execute("""
            SELECT p.id, p.code, p.description 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            WHERE rp.role_id = ?
        """, (r['id'],)).fetchall()
        
        return RoleResponse(
            id=r['id'],
            code=r['name'].replace(' ', '_').upper(),
            name=r['name'],
            description=r['description'] or "",
            status=r['status'],
            is_system=bool(r['is_system']),
            permissions=[dict(p) for p in perms]
        )
    finally:
        conn.close()

@app.post("/api/admin/roles")
async def create_role(
    request: RoleCreateRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Create Role
        cursor.execute("INSERT INTO roles (name, description, status, is_system) VALUES (?, ?, ?, FALSE)", 
                       (request.name, request.description, request.status))
        role_id = cursor.lastrowid
        if not role_id:
             role_id = cursor.execute("SELECT id FROM roles WHERE name = ?", (request.name,)).fetchone()['id']
             
        # Assign Permissions
        if request.permissions:
            placeholders = ','.join(['?'] * len(request.permissions))
            valid_perms = conn.execute(f"SELECT id FROM permissions WHERE code IN ({placeholders})", tuple(request.permissions)).fetchall()
            
            data = [(role_id, p['id']) for p in valid_perms]
            cursor.executemany("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", data)
        
        conn.commit()
        return {"message": "Role created successfully", "role_id": role_id}
    except sqlite3.IntegrityError:
         raise HTTPException(status_code=400, detail="Role name already exists.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/admin/roles/{role_id}")
async def update_role(
    role_id: int,
    request: RoleCreateRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        role = cursor.execute("SELECT is_system FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        
        cursor.execute("UPDATE roles SET name = ?, description = ?, status = ? WHERE id = ?", 
                       (request.name, request.description, request.status, role_id))
                       
        cursor.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
        
        if request.permissions:
            placeholders = ','.join(['?'] * len(request.permissions))
            valid_perms = conn.execute(f"SELECT id FROM permissions WHERE code IN ({placeholders})", tuple(request.permissions)).fetchall()
            
            data = [(role_id, p['id']) for p in valid_perms]
            cursor.executemany("INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)", data)
            
        conn.commit()
        return {"message": "Role updated successfully"}
    finally:
        conn.close()

@app.delete("/api/admin/roles/{role_id}")
async def delete_role(
    role_id: int,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        role = conn.execute("SELECT is_system FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
            
        if role['is_system']:
             raise HTTPException(status_code=400, detail="Cannot delete system roles.")
             
        conn.execute("DELETE FROM roles WHERE id = ?", (role_id,))
        conn.commit()
        return {"message": "Role deleted successfully"}
    finally:
        conn.close()

@app.get("/api/admin/permissions")
async def get_all_permissions(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("role_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    perms = conn.execute("SELECT * FROM permissions ORDER BY group_name, code").fetchall()
    conn.close()
    
    grouped = {}
    for p in perms:
        g = p['group_name'] or 'General'
        if g not in grouped: grouped[g] = []
        grouped[g].append({
            "id": p['id'],
            "code": p['code'],
            "description": p['description']
        })
        
    return grouped

# New Endpoints for Permission Management (FR-3)

class PermissionDetailResponse(BaseModel):
    id: int
    code: str
    description: str
    group_name: str
    display_code: str

class PermissionUpdateRequest(BaseModel):
    description: str

@app.get("/api/admin/permissions/list", response_model=List[PermissionDetailResponse])
async def get_permissions_list(
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("permission_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        perms = conn.execute("SELECT * FROM permissions ORDER BY id").fetchall()
        return [
            PermissionDetailResponse(
                id=p['id'],
                code=p['code'],
                description=p['description'],
                group_name=p['group_name'] or "General",
                display_code=f"P-{p['id']:04d}"
            ) for p in perms
        ]
    finally:
        conn.close()

@app.put("/api/admin/permissions/{perm_id}")
async def update_permission(
    perm_id: int,
    request: PermissionUpdateRequest,
    x_user_role: str = Header(None, alias="X-User-Role"),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("permission_management", x_user_id=x_user_id)
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE permissions SET description = ? WHERE id = ?", (request.description, perm_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Permission not found")
        conn.commit()
        return {"message": "Permission updated successfully"}
    finally:
        conn.close()



# --- STAFF MANAGEMENT ENDPOINTS (FR-3.4) ---

@app.get("/api/staff/departments", response_model=List[DepartmentResponse])
async def get_departments(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("staff.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        deps = conn.execute("SELECT * FROM departments ORDER BY name").fetchall()
        return [DepartmentResponse(**dict(d)) for d in deps]
    finally:
        conn.close()

@app.post("/api/staff/departments")
async def create_department(
    request: DepartmentCreateRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("staff.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO departments (name, description, head_of_department_id) VALUES (?, ?, ?)",
                       (request.name, request.description, request.head_of_department_id))
        conn.commit()
        return {"message": "Department created", "id": cursor.lastrowid}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Department Name already exists")
    finally:
        conn.close()

@app.get("/api/staff/profiles", response_model=List[StaffResponse])
async def get_staff_profiles(x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("staff.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        # Get all users who are NOT Students or Parents
        # We assume staff roles are Teacher, Admin variants, etc.
        # Alternatively, we just get everyone in staff_profiles OR role matches typical staff
        query = """
            SELECT s.id, s.name, s.role,
                   sp.department_id, d.name as department_name,
                   sp.position_title, sp.joining_date, sp.contract_type, sp.salary
            FROM students s
            LEFT JOIN staff_profiles sp ON s.id = sp.user_id
            LEFT JOIN departments d ON sp.department_id = d.id
            WHERE s.role NOT IN ('Student', 'Parent_Guardian')
            ORDER BY s.name
        """
        rows = conn.execute(query).fetchall()
        return [StaffResponse(**dict(r)) for r in rows]
    finally:
        conn.close()

@app.put("/api/staff/profiles/{user_id}")
async def update_staff_profile(
    user_id: str,
    request: StaffProfileUpdateRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("staff.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Upsert logic
        cursor.execute("""
            INSERT INTO staff_profiles (user_id, department_id, position_title, joining_date, contract_type, salary)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                department_id=excluded.department_id,
                position_title=excluded.position_title,
                joining_date=excluded.joining_date,
                contract_type=excluded.contract_type,
                salary=excluded.salary
        """, (user_id, request.department_id, request.position_title, request.joining_date, request.contract_type, request.salary))
        conn.commit()
        return {"message": "Profile updated"}
    finally:
        conn.close()

@app.get("/api/staff/attendance")
async def get_staff_attendance(
    date: Optional[str] = None,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("staff.view", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        # If date provided, filter. Else get recent.
        base_query = """
            SELECT sa.*, s.name as staff_name 
            FROM staff_attendance sa
            JOIN students s ON sa.user_id = s.id
        """
        params = []
        if date:
            base_query += " WHERE sa.date = ?"
            params.append(date)
        else:
            base_query += " ORDER BY sa.date DESC LIMIT 100"
            
        rows = conn.execute(base_query, tuple(params)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/staff/attendance")
async def mark_staff_attendance(
    request: StaffAttendanceRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("staff.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO staff_attendance (user_id, date, status, check_in_time, check_out_time)
            VALUES (?, ?, ?, ?, ?)
        """, (request.user_id, request.date, request.status, request.check_in_time, request.check_out_time))
        conn.commit()
        return {"message": "Attendance marked"}
    finally:
        conn.close()

@app.get("/api/staff/performance/{user_id}")
async def get_staff_performance(
    user_id: str,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    # Self view allowed? Let's restrict to manager for now
    await verify_permission("staff.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM staff_performance WHERE user_id = ? ORDER BY review_date DESC", (user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/staff/performance")
async def create_performance_review(
    request: StaffPerformanceRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    await verify_permission("staff.manage", x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO staff_performance (user_id, reviewer_id, review_date, rating, comments, goals)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (request.user_id, x_user_id, request.review_date, request.rating, request.comments, request.goals))
        conn.commit()
        return {"message": "Review added"}
    finally:
        conn.close()


# --- RESOURCE MANAGEMENT ENDPOINTS ---

def _authorize_resource_admin(cursor, x_user_id: Optional[str], requested_school_id: Optional[int]) -> Dict[str, Any]:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    actor = cursor.execute(
        "SELECT id, role, school_id, is_super_admin FROM students WHERE id = ?",
        (x_user_id,)
    ).fetchone()
    if not actor:
        raise HTTPException(status_code=401, detail="User not found.")
    admin_roles = {'Principal', 'Admin', 'Tenant_Admin', 'Super Admin', 'Root_Super_Admin'}
    if not (actor["is_super_admin"] or actor["role"] in admin_roles):
        raise HTTPException(status_code=403, detail="Only admin users can manage resources.")

    target_school_id = int(requested_school_id or (actor["school_id"] or 1))
    if not actor["is_super_admin"] and int(actor["school_id"] or 1) != target_school_id:
        raise HTTPException(status_code=403, detail="You can only manage resources for your own school.")
    school_row = cursor.execute("SELECT id FROM schools WHERE id = ?", (target_school_id,)).fetchone()
    if not school_row:
        raise HTTPException(status_code=400, detail="Invalid school_id.")

    return {"actor": actor, "target_school_id": target_school_id}

def _normalize_resource_category(raw_category: Optional[str]) -> str:
    value = (raw_category or "").strip()
    normalized = value.lower()
    if not normalized or normalized == "all":
        return "All"
    if normalized in {"policy", "policies"}:
        return "Policy"
    if normalized in {"schedule", "schedules", "exam schedule", "exam schedules"}:
        return "Schedule"
    if normalized in {"form", "forms", "leave/admin form"}:
        return "Form"
    if normalized in {"other", "others"}:
        return "Other"
    return value

def _resource_storage_dir() -> str:
    return os.path.join(STATIC_DIR, "resources")

def _resource_web_path(filename: str) -> str:
    return f"/static/resources/{filename}"

def _normalize_resource_file_path(raw_file_path: Optional[str]) -> str:
    value = (raw_file_path or "").strip()
    if not value:
        return ""
    lowered = value.lower()
    if lowered.startswith(("http://", "https://")):
        return value
    value = value.replace("\\", "/")
    if "/static/resources/" in value:
        value = value[value.lower().find("/static/resources/"):]
    elif value.startswith("static/resources/"):
        value = f"/{value}"
    if not value.startswith("/static/resources/"):
        return value

    filename = os.path.basename(value.split("?", 1)[0])
    if not filename:
        return value

    expected_path = os.path.join(_resource_storage_dir(), filename)
    if not os.path.exists(expected_path):
        legacy_candidates = [
            os.path.abspath(os.path.join(BASE_DIR, "..", "static", "resources", filename)),
            os.path.abspath(os.path.join(os.getcwd(), "static", "resources", filename)),
        ]
        for candidate in legacy_candidates:
            if os.path.exists(candidate):
                os.makedirs(_resource_storage_dir(), exist_ok=True)
                shutil.copy2(candidate, expected_path)
                logger.info("Recovered resource file from legacy path: %s", candidate)
                break

    return _resource_web_path(filename)

def _notify_form_or_schedule_upload(conn, sender_id: str, school_id: int, title: str, category: str, web_path: str, is_schedule: bool):
    recipients = _get_school_broadcast_recipients(conn, school_id)
    if is_schedule:
        subject_line = f"Exam Schedule Uploaded: {title}"
        body = (
            "A new exam schedule has been uploaded to the Resource Library.\n"
            f"Title: {title}\n"
            f"Category: {category}\n"
            f"School ID: {school_id}\n"
            f"File: {web_path}"
        )
    else:
        subject_line = f"New Form Available: {title}"
        body = (
            "A new form has been published in the Resource Library.\n"
            f"Title: {title}\n"
            f"Category: {category}\n"
            f"School ID: {school_id}\n"
            f"File: {web_path}"
        )
    audiences = ("teachers", "parents") if is_schedule else ("teachers", "students", "parents")
    for audience in audiences:
        ids = [rid for rid in recipients[audience] if rid and rid != sender_id]
        if ids:
            _send_messages(conn, sender_id, ids, subject_line, body)

@app.get("/api/resources/form-templates")
async def get_form_templates():
    return [
        {"key": key, "title": item["title"], "description": item["description"]}
        for key, item in FORM_RESOURCE_TEMPLATES.items()
    ]

@app.post("/api/resources/form-templates", response_model=ResourceResponse)
async def publish_form_template(
    request: FormTemplatePublishRequest,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        auth = _authorize_resource_admin(cursor, x_user_id, request.school_id)
        actor = auth["actor"]
        target_school_id = auth["target_school_id"]

        template_key = (request.template_key or "").strip().lower()
        if template_key not in FORM_RESOURCE_TEMPLATES:
            raise HTTPException(status_code=400, detail="Invalid template_key.")
        template = FORM_RESOURCE_TEMPLATES[template_key]

        title = (request.title or template["title"]).strip()
        description = (request.description or template["description"]).strip()
        uploaded_at = datetime.now().isoformat()
        uploaded_by = actor["id"]

        resources_dir = _resource_storage_dir()
        os.makedirs(resources_dir, exist_ok=True)
        filename = f"{uuid.uuid4()}_{template_key}.txt"
        file_location = os.path.join(resources_dir, filename)
        with open(file_location, "w", encoding="utf-8") as fh:
            fh.write(template["content"])
        web_path = _resource_web_path(filename)

        row = cursor.execute(
            """
            INSERT INTO resources (title, description, category, file_path, uploaded_by, uploaded_at, school_id)
            VALUES (?, ?, 'Form', ?, ?, ?, ?)
            RETURNING id
            """,
            (title, description, web_path, uploaded_by, uploaded_at, target_school_id)
        ).fetchone()
        resource_id = row["id"] if row else 0

        _notify_form_or_schedule_upload(
            conn=conn,
            sender_id=uploaded_by,
            school_id=target_school_id,
            title=title,
            category="Form",
            web_path=web_path,
            is_schedule=False,
        )

        conn.commit()
        return ResourceResponse(
            id=resource_id,
            title=title,
            description=description,
            category="Form",
            file_path=web_path,
            uploaded_by=uploaded_by,
            uploaded_at=uploaded_at
        )
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error publishing form template: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/resources", response_model=List[ResourceResponse])
async def get_resources(
    school_id: Optional[int] = None,
    category: Optional[str] = None
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = "SELECT * FROM resources WHERE 1=1"
        params = []
        
        if school_id:
            query += " AND school_id = ?"
            params.append(school_id)
            
        normalized_category = _normalize_resource_category(category)
        if normalized_category and normalized_category != "All":
            # Be tolerant to legacy stored values (e.g. "Forms", "Leave/Admin Form").
            query += " AND LOWER(TRIM(category)) IN ("
            query += "LOWER(TRIM(?)), LOWER(TRIM(?)), LOWER(TRIM(?))"
            query += ")"
            params.extend([
                normalized_category,
                f"{normalized_category}s",
                "Leave/Admin Form" if normalized_category == "Form" else normalized_category
            ])
            
        query += " ORDER BY uploaded_at DESC" 
        
        resources = cursor.execute(query, tuple(params)).fetchall()
        
        return [
            ResourceResponse(
                id=r['id'],
                title=r['title'],
                description=r['description'],
                category=r['category'],
                file_path=_normalize_resource_file_path(r['file_path']),
                uploaded_by=r['uploaded_by'] or "Admin",
                uploaded_at=r['uploaded_at']
            ) for r in resources
        ]
    except Exception as e:
        logger.error(f"Error fetching resources: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/resources", response_model=ResourceResponse)
async def create_resource(
    title: str = Form(...),
    description: Optional[str] = Form(""),
    category: str = Form("Policy"),
    school_id: Optional[int] = Form(1),
    file: UploadFile = File(...),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        auth = _authorize_resource_admin(cursor, x_user_id, school_id)
        actor = auth["actor"]
        target_school_id = auth["target_school_id"]

        normalized_category = _normalize_resource_category(category)
        if normalized_category == "All":
            normalized_category = "Other"

        uploaded_at = datetime.now().isoformat()
        uploaded_by = x_user_id

        # Save the file
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        resources_dir = _resource_storage_dir()
        file_location = os.path.join(resources_dir, unique_filename)
        
        # Ensure directory exists (redundant if mkdir run, but safe)
        os.makedirs(resources_dir, exist_ok=True)

        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
            
        # Store relative path for frontend access
        web_path = _resource_web_path(unique_filename)

        cursor.execute("""
            INSERT INTO resources (title, description, category, file_path, uploaded_by, uploaded_at, school_id)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
        """, (title, description, normalized_category, web_path, uploaded_by, uploaded_at, target_school_id))

        row = cursor.fetchone()
        resource_id = row['id'] if row else 0 # Fallback

        # Notify relevant users when key resources are uploaded.
        try:
            normalized_category_key = (normalized_category or "").strip().lower()
            is_policy = "policy" in normalized_category_key
            is_schedule = "schedule" in normalized_category_key or "exam" in normalized_category_key
            is_pdf = (file_ext or "").lower() == ".pdf"

            if is_policy and is_pdf:
                principal_rows = cursor.execute(
                    """
                    SELECT id
                    FROM students
                    WHERE school_id = ?
                      AND role IN ('Principal', 'Tenant_Admin', 'Admin')
                    """,
                    (target_school_id,)
                ).fetchall()
                principal_ids = [r["id"] for r in principal_rows if r["id"] and r["id"] != uploaded_by]
                if principal_ids:
                    subject_line = f"New School Policy Uploaded: {title}"
                    content = (
                        f"A new policy PDF has been uploaded to the Resource Library.\n"
                        f"Title: {title}\n"
                        f"Category: {normalized_category}\n"
                        f"School ID: {target_school_id}\n"
                        f"File: {web_path}"
                    )
                    _send_messages(conn, uploaded_by, principal_ids, subject_line, content)

            if is_schedule:
                _notify_form_or_schedule_upload(
                    conn=conn,
                    sender_id=uploaded_by,
                    school_id=target_school_id,
                    title=title,
                    category=normalized_category,
                    web_path=web_path,
                    is_schedule=True,
                )
            if "form" in normalized_category_key:
                _notify_form_or_schedule_upload(
                    conn=conn,
                    sender_id=uploaded_by,
                    school_id=target_school_id,
                    title=title,
                    category=normalized_category,
                    web_path=web_path,
                    is_schedule=False,
                )
        except Exception as notify_err:
            logger.warning(f"Resource notification failed: {notify_err}")

        conn.commit()
        
        return ResourceResponse(
            id=resource_id,
            title=title,
            description=description,
            category=normalized_category,
            file_path=web_path,
            uploaded_by=uploaded_by,
            uploaded_at=uploaded_at
        )
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        logger.error(f"Error creating resource: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/resources/{resource_id}")
async def delete_resource(resource_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
        # Check rowcount if possible, but wrapper might not expose it easily without result.
        conn.commit()
        return {"message": "Resource deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting resource: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()










# --- MOODLE SSO (OAuth2 Provider) ---
# In production, use Redis or DB for these stores
OAUTH_CODES = {}
OAUTH_ACCESS_TOKENS = {}


# Embedded SSO Authorize Page
SSO_AUTHORIZE_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Authorize Moodle Access</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { background-color: #f8f9fa; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .card { border: none; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1); border-radius: 12px; width: 100%; max-width: 400px; }
        .loader { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="card p-4 text-center">
        <div class="mb-3">
            <h3 class="fw-bold text-primary">Noble Nexus</h3>
        </div>
        <h4 class="mb-3">Connecting to Moodle...</h4>
        <div id="status-area">
            <div class="loader mb-3"></div>
            <p class="text-muted small">Please wait while we verify your identity.</p>
        </div>
    </div>
    <script>
    async function authorize() {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('client_id');
        const redirectUri = urlParams.get('redirect_uri');
        const state = urlParams.get('state');

        // Check LocalStorage (Problem: LocalStorage is Domain Specific. If Backend is diff domain than Frontend, this fails)
        // SOLUTION: We assume for now this flow is initiated from a context where token might be passed or we rely on session cookies if we had them.
        // BUT currently Noble Nexus uses LocalStorage for auth. 
        // If Backend is on render.com and Frontend on vercel.app, Backend Page cannot read Frontend LocalStorage.
        // This flow is flawed in a split-domain architecture without cookies.
        
        // HOWEVER: The user is clicking "Launch Moodle" from the Frontend. 
        // The Frontend opens this window. 
        // We can try to pass the token in the URL or via postMessage.
        // For now, let's just attempt the flow and show a warning if not logged in.
        
        const user = localStorage.getItem('user'); 
        const userObj = user ? JSON.parse(user) : null;
        
        if (!userObj || !userObj.id) {
            // Try to see if we can get it from parent (if popup)
             try {
                if (window.opener) {
                    // This is cross-origin, so we can't direct read, but we could request it?
                    // For simplicity in this demo, we'll ask user to login if missing.
                }
            } catch(e){}

            document.getElementById('status-area').innerHTML = `
                <div class="alert alert-warning">
                    Session not found in this domain. 
                    <br><small>Because the api is on a different domain, we cannot read your login session.</small>
                </div>
                <p>Please copy your User ID manually to proceed (Mock Flow):</p>
                <input type="text" id="manual-user-id" class="form-control mb-2" placeholder="Enter User ID (e.g. stu_001)">
                <button class="btn btn-primary w-100" onclick="manualApprove()">Approve Manually</button>
            `;
            return;
        }

        approve(userObj.id, clientId, redirectUri, state);
    }
    
    function manualApprove() {
        const uid = document.getElementById('manual-user-id').value;
        if(uid) {
            const urlParams = new URLSearchParams(window.location.search);
            approve(uid, urlParams.get('client_id'), urlParams.get('redirect_uri'), urlParams.get('state'));
        }
    }

    async function approve(userId, clientId, redirectUri, state) {
        try {
            const response = await fetch('/api/oauth/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, client_id: clientId, redirect_uri: redirectUri, state: state })
            });

            if (response.ok) {
                const data = await response.json();
                window.location.href = data.redirect_url;
            } else {
                const err = await response.json();
                showError(err.detail || "Authorization failed.");
            }
        } catch (e) {
            showError("Network Error: " + e.message);
        }
    }

    function showError(msg) {
        document.getElementById('status-area').innerHTML = `<div class="alert alert-danger small">${msg}</div>`;
    }

    setTimeout(authorize, 1000); 
    </script>
</body>
</html>
"""

@app.get("/oauth/authorize", response_class=HTMLResponse)
async def oauth_authorize(response_type: str, client_id: str, redirect_uri: str, state: str, scope: Optional[str] = None):
    return HTMLResponse(content=SSO_AUTHORIZE_HTML)

class OAuthApproveRequest(BaseModel):
    user_id: str
    client_id: str
    redirect_uri: str
    state: str

@app.post("/api/oauth/approve")
async def oauth_approve(request: OAuthApproveRequest):
    # Verify user exists (simple check)
    conn = get_db_connection()
    user = conn.execute("SELECT id FROM students WHERE id = ?", (request.user_id,)).fetchone()
    conn.close()
    
    if not user:
         raise HTTPException(status_code=400, detail="User not found")

    # Generate Authorization Code
    auth_code = secrets.token_urlsafe(16)
    OAUTH_CODES[auth_code] = {
        "user_id": request.user_id,
        "client_id": request.client_id,
        "redirect_uri": request.redirect_uri,
        "expires_at": time.time() + 600 # 10 minutes
    }
    
    # Return the redirect URL that the frontend should follow
    # Moodle expects: redirect_uri + ?code=... + &state=...
    separator = "&" if "?" in request.redirect_uri else "?"
    redirect_url = f"{request.redirect_uri}{separator}code={auth_code}&state={request.state}"
    
    return {"redirect_url": redirect_url}

@app.get("/.well-known/openid-configuration")
async def openid_configuration(request: Request):
    base_url = str(request.base_url).rstrip('/')
    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/oauth/authorize",
        "token_endpoint": f"{base_url}/oauth/token",
        "userinfo_endpoint": f"{base_url}/oauth/userinfo",
        "jwks_uri": f"{base_url}/oauth/jwks",
        "response_types_supported": ["code"],
        "subject_types_supported": ["public"],
        "id_token_signing_alg_values_supported": ["HS256"],
        "scopes_supported": ["openid", "profile", "email"]
    }

# Minimal JWT Generator (HS256)
def generate_jwt(payload, secret):
    import base64
    def b64url(data):
        return base64.urlsafe_b64encode(data).rstrip(b'=')
        
    header = {"alg": "HS256", "typ": "JWT"}
    segments = [
        b64url(json.dumps(header).encode()),
        b64url(json.dumps(payload).encode())
    ]
    signing_input = b'.'.join(segments)
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    segments.append(b64url(signature))
    return b'.'.join(segments).decode()

@app.post("/oauth/token")
async def oauth_token(
    request: Request,
    grant_type: str = Form(...),
    code: str = Form(...),
    client_id: str = Form(...),
    client_secret: str = Form(None), # Optional for public clients
    redirect_uri: str = Form(...)
):
    # Validate Code
    token_data = OAUTH_CODES.get(code)
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid grant: Code not found")
        
    if time.time() > token_data["expires_at"]:
        del OAUTH_CODES[code]
        raise HTTPException(status_code=400, detail="Code expired")
        
    # In strict OAuth, we validate client_id matches the one in code
    if token_data["client_id"] != client_id: 
        raise HTTPException(status_code=400, detail="Invalid client_id")
    
    # Generate Access Token
    access_token = secrets.token_urlsafe(32)
    expires_in = 3600
    
    OAUTH_ACCESS_TOKENS[access_token] = {
        "user_id": token_data["user_id"],
        "expires_at": time.time() + expires_in
    }
    
    # Generate ID Token (OIDC)
    base_url = str(request.base_url).rstrip('/')
    id_token_payload = {
        "iss": base_url,
        "sub": token_data["user_id"],
        "aud": client_id,
        "exp": int(time.time()) + expires_in,
        "iat": int(time.time())
    }
    # Use a persistent secret in production
    id_token = generate_jwt(id_token_payload, "SUPER_SECRET_SIGNING_KEY")
    
    # Delete used code
    del OAUTH_CODES[code]
    
    return {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "id_token": id_token
    }

@app.get("/oauth/userinfo")
async def oauth_userinfo(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid header")
    
    token = authorization.split(" ")[1]
    token_data = OAUTH_ACCESS_TOKENS.get(token)
    
    if not token_data or time.time() > token_data["expires_at"]:
         raise HTTPException(status_code=401, detail="Invalid or expired token")
         
    user_id = token_data["user_id"]
    
    conn = get_db_connection()
    user = conn.execute("SELECT * FROM students WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Return OpenID Connect compliant claims
    return {
        "sub": user['id'],
        "name": user['name'],
        "email": f"{user['id']}@noblenexus.edu", 
        "given_name": user['name'].split(" ")[0],
        "family_name": " ".join(user['name'].split(" ")[1:]) if " " in user['name'] else "",
        "picture": "https://www.w3schools.com/howto/img_avatar.png"
    }



# --- LMS ENDPOINTS (MOODLE ALTERNATIVE) ---

@app.post("/api/lms/courses", response_model=LMSCourseResponse)
async def create_course(course: LMSCourseCreateRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    c = conn.cursor()
    # verify teacher or admin
    if not x_user_id:
        raise HTTPException(status_code=400, detail="User Identity Missing")
        
    created_at = datetime.now().isoformat()
    # Get School ID safely
    school_row = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
    school_id = school_row['school_id'] if school_row else 1
    
    c.execute("""
        INSERT INTO lms_courses (title, description, teacher_id, category, thumbnail_url, enrollment_key, created_at, school_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (course.title, course.description, x_user_id, course.category, course.thumbnail_url, course.enrollment_key, created_at, school_id))
    course_id = c.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "id": course_id,
        "title": course.title,
        "description": course.description,
        "teacher_id": x_user_id,
        "category": course.category,
        "thumbnail_url": course.thumbnail_url,
        "created_at": created_at
    }

@app.get("/api/lms/courses", response_model=List[LMSCourseResponse])
async def get_courses(category: Optional[str] = None, search: Optional[str] = None):
    conn = get_db_connection()
    query = "SELECT * FROM lms_courses WHERE 1=1"
    params = []
    if category and category != 'All':
        query += " AND category = ?"
        params.append(category)
    if search:
        query += " AND (title LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    
    try:
        courses = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(row) for row in courses]
    except Exception as e:
        conn.close()
        logger.error(f"Error fetching courses: {e}")
        return []

@app.get("/api/lms/courses/{course_id}/full")
async def get_course_full(course_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    course = conn.execute("SELECT * FROM lms_courses WHERE id = ?", (course_id,)).fetchone()
    if not course:
        conn.close()
        raise HTTPException(status_code=404, detail="Course not found")
        
    sections_rows = conn.execute("SELECT * FROM lms_course_sections WHERE course_id = ? ORDER BY order_index", (course_id,)).fetchall()
    sections = []
    
    for s_row in sections_rows:
        modules = conn.execute("SELECT * FROM lms_course_modules WHERE section_id = ? ORDER BY order_index", (s_row['id'],)).fetchall()
        
        module_list = []
        for m in modules:
            m_dict = dict(m)
            if x_user_id:
                comp = conn.execute("SELECT status, score FROM lms_module_completion WHERE module_id = ? AND student_id = ?", (m['id'], x_user_id)).fetchone()
                if comp:
                    m_dict['completion'] = dict(comp)
            module_list.append(m_dict)
            
        sections.append({
            **dict(s_row),
            "modules": module_list
        })
        
    conn.close()
    return {
        **dict(course),
        "sections": sections
    }

@app.post("/api/lms/courses/{course_id}/sections", response_model=LMSSectionResponse)
async def add_section(course_id: int, section: LMSSectionCreateRequest):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO lms_course_sections (course_id, title, order_index) VALUES (?, ?, ?)", 
              (course_id, section.title, section.order_index))
    s_id = c.lastrowid
    conn.commit()
    conn.close()
    return {**section.dict(), "id": s_id, "course_id": course_id}


def extract_text_from_file(file_path):
    try:
        from pypdf import PdfReader
        if file_path.endswith('.pdf'):
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages[:10]:
                text += page.extract_text() + "\n"
            return text
    except: return ""
    return ""

@app.post("/api/lms/sections/{section_id}/modules", response_model=LMSModuleResponse)
async def add_module(section_id: int, module: LMSModuleCreateRequest):
    conn = get_db_connection()
    c = conn.cursor()
    
    # RAG Logic
    searchable_text = ""
    if module.type == 'html':
        searchable_text = module.content_text
    elif module.type == 'pdf' and module.content_url.startswith('/static'):
        # Local file
        fs_path = module.content_url.lstrip('/')
        if os.path.exists(fs_path):
            searchable_text = extract_text_from_file(fs_path)
    
    c.execute("""
        INSERT INTO lms_course_modules (section_id, title, type, content_url, content_text, searchable_text, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (section_id, module.title, module.type, module.content_url, module.content_text, searchable_text, module.order_index))
    m_id = c.lastrowid
    conn.commit()
    conn.close()
    return {**module.dict(), "id": m_id, "section_id": section_id}


class LMSCompletionRequest(BaseModel):
    score: float
    status: str

@app.post("/api/ai/chat/course/{course_id}")
async def chat_with_course(course_id: int, request: AIChatRequest):
    if not AI_ENABLED or not GROQ_CLIENT:
         return {"reply": "AI Service Unavailable"}

    conn = get_db_connection()
    # 1. Fetch relevant content (Naive RAG: Fetch all text for now, should use Vector DB in prod)
    # Get all searchable text for this course
    # Joined via sections
    rows = conn.execute("""
        SELECT m.searchable_text, m.title FROM lms_course_modules m
        JOIN lms_course_sections s ON m.section_id = s.id
        WHERE s.course_id = ? AND m.searchable_text IS NOT NULL AND m.searchable_text != ''
    """, (course_id,)).fetchall()
    
    context = ""
    for r in rows:
        context += f"\n--- Module: {r['title']} ---\n{r['searchable_text'][:5000]}" # Limit size per module
        
    context = context[:20000] # Hard limit for prompt
    conn.close()
    
    if not context:
        return {"reply": "I don't have enough content from this course to answer yet."}

    system_prompt = (
        "You are an AI Tutor for a specific course. "
        "Answer the student's question based ONLY on the provided Course Content below. "
        "If the answer is not in the content, say 'I cannot find that in the course material'.\n\n"
        f"Course Content:\n{context}"
    )
    
    try:
        completion = GROQ_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.prompt}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.3
        )
        return {"reply": completion.choices[0].message.content}
    except Exception as e:
        logger.error(f"AI Course Chat Error: {e}")
        return {"reply": "Sorry, I encountered an error while thinking."}

@app.post("/api/lms/modules/{module_id}/complete")
async def complete_module(module_id: int, request: LMSCompletionRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="User Identity Missing")
        
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        # Upsert logic for completion
        c.execute("""
            INSERT INTO lms_module_completion (module_id, student_id, status, score)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(module_id, student_id) DO UPDATE SET
            status = EXCLUDED.status,
            score = EXCLUDED.score
        """, (module_id, x_user_id, request.status, request.score))
        conn.commit()
    except Exception as e:
        logger.error(f"Error saving completion: {e}")
        conn.close()
        raise HTTPException(status_code=500, detail="Failed to save progress")
        
    conn.close()
    return {"message": "Progress saved"}

class QuestionGradingRequest(BaseModel):
    question: str
    student_answer: str
    context: Optional[str] = None # Optional context from module

@app.post("/api/ai/grade/short-answer")
async def grade_quiz_short_answer(request: QuestionGradingRequest):
    if not AI_ENABLED or not GROQ_CLIENT:
         return {"score": 0, "feedback": "AI Service Unavailable. Manual grading required."}
    
    system_prompt = (
        "You are a strictly academic AI Assistant. Your goal is to grade a student's short answer response. "
        "Score the answer from 0 to 100 based on accuracy and completeness. "
        "Provide a JSON response with 'score' (integer 0-100) and 'feedback' (1-2 sentences). "
        "Do not offer python code or anything else, just the JSON."
    )
    
    user_prompt = f"Question: {request.question}\nStudent Answer: {request.student_answer}\n"
    if request.context:
        user_prompt += f"Context/Correct Answer Reference: {request.context}"
        
    try:
        completion = GROQ_CLIENT.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        import json
        result = json.loads(content)
        return result
    except Exception as e:
        logger.error(f"AI Grading Error: {e}")
        return {"score": 0, "feedback": "Error during AI grading."}

# --- Attendance Module ---
class AttendanceRecord(BaseModel):
    student_id: str
    status: str
    remarks: Optional[str] = ""

class BulkAttendanceRequest(BaseModel):
    date: str
    records: List[AttendanceRecord]

def _normalize_attendance_date(date_value: str) -> str:
    raw = (date_value or "").strip()
    if not raw:
        return raw
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return raw

def _resolve_parent_ids_for_student(cursor, student_id: str, school_id: Optional[int], guardians) -> List[str]:
    parent_ids = set()

    for g in guardians:
        guardian_email = (g["email"] or "").strip()
        guardian_name = (g["name"] or "").strip()

        if guardian_email:
            rows = cursor.execute(
                """
                SELECT id
                FROM students
                WHERE role IN ('Parent', 'Parent_Guardian')
                  AND LOWER(id) = LOWER(?)
                  AND (? IS NULL OR school_id = ?)
                """,
                (guardian_email, school_id, school_id)
            ).fetchall()
            for r in rows:
                parent_ids.add(r["id"])

        if guardian_name:
            rows = cursor.execute(
                """
                SELECT id
                FROM students
                WHERE role IN ('Parent', 'Parent_Guardian')
                  AND (
                      LOWER(id) = LOWER(?)
                      OR LOWER(name) = LOWER(?)
                  )
                  AND (? IS NULL OR school_id = ?)
                """,
                (guardian_name, guardian_name, school_id, school_id)
            ).fetchall()
            for r in rows:
                parent_ids.add(r["id"])

    # Backward-compatible fallback used in parent login flow: guardians.email == parent user_id
    rows = cursor.execute(
        """
        SELECT DISTINCT s.id
        FROM students s
        JOIN guardians g ON LOWER(g.email) = LOWER(s.id)
        WHERE g.student_id = ?
          AND s.role IN ('Parent', 'Parent_Guardian')
          AND (? IS NULL OR s.school_id = ?)
        """,
        (student_id, school_id, school_id)
    ).fetchall()
    for r in rows:
        parent_ids.add(r["id"])

    return sorted(parent_ids)

@app.post("/api/attendance/bulk")
async def take_bulk_attendance(req: BulkAttendanceRequest, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    c = conn.cursor()
    created_at = datetime.now().isoformat()
    attendance_date = _normalize_attendance_date(req.date)
    sender_id = None
    requested_sender = (x_user_id or "").strip()
    if requested_sender:
        sender_row = c.execute("SELECT id FROM students WHERE id = ?", (requested_sender,)).fetchone()
        if sender_row:
            sender_id = sender_row["id"]
    if not sender_id:
        fallback_sender = c.execute(
            "SELECT id FROM students WHERE role IN ('Admin', 'Teacher') ORDER BY CASE WHEN role = 'Admin' THEN 0 ELSE 1 END, id LIMIT 1"
        ).fetchone()
        sender_id = fallback_sender["id"] if fallback_sender else None

    saved_count = 0
    skipped_count = 0
    student_notified = 0
    parent_notified = 0
    notify_error_count = 0
    
    try:
        for record in req.records:
            student_row = c.execute(
                "SELECT id, name, school_id FROM students WHERE id = ? AND role = 'Student'",
                (record.student_id,)
            ).fetchone()
            if not student_row:
                skipped_count += 1
                continue

            status = str(record.status or "").strip().title()
            if status not in ("Present", "Absent", "Late"):
                status = "Present"
            remarks = (record.remarks or "").strip()

            try:
                c.execute("DELETE FROM student_attendance WHERE student_id = ? AND date = ?", (record.student_id, attendance_date))
                c.execute("""
                    INSERT INTO student_attendance (student_id, date, status, remarks, recorded_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (record.student_id, attendance_date, status, remarks, sender_id, created_at))
            except Exception as row_error:
                logger.warning(f"Attendance row skipped for {record.student_id}: {row_error}")
                skipped_count += 1
                continue

            saved_count += 1

            # Notify student + parents on attendance update (non-blocking)
            if sender_id and status in ("Present", "Absent", "Late"):
                guardians = c.execute("SELECT email, name FROM guardians WHERE student_id = ?", (record.student_id,)).fetchall()
                student_name = student_row["name"] if student_row else "Student"
                school_id = student_row["school_id"] if student_row else None
                status_upper = status.upper()
                remarks_suffix = f" Remarks: {remarks}" if remarks else ""

                # Student notification
                student_subject = f"Your Attendance: {status}"
                student_content = f"Hi {student_name}, your attendance for {attendance_date} is marked as {status_upper}.{remarks_suffix}"
                try:
                    c.execute("""
                        INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
                        VALUES (?, ?, ?, ?, ?, FALSE)
                    """, (sender_id, record.student_id, student_subject, student_content, created_at))
                    student_notified += 1
                except Exception as notify_err:
                    notify_error_count += 1
                    logger.warning(f"Student attendance notification failed for {record.student_id}: {notify_err}")

                # Parent notifications
                parent_ids = _resolve_parent_ids_for_student(c, record.student_id, school_id, guardians)
                for pid in parent_ids:
                    subject = f"Attendance: {student_name} is {status}"
                    content = f"Your child {student_name} has been marked {status_upper} for {attendance_date}.{remarks_suffix}"
                    try:
                        c.execute("""
                               INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
                               VALUES (?, ?, ?, ?, ?, FALSE)
                            """, (sender_id, pid, subject, content, created_at))
                        parent_notified += 1
                    except Exception as notify_err:
                        notify_error_count += 1
                        logger.warning(f"Parent attendance notification failed for {pid}: {notify_err}")
            
        conn.commit()
        return {
            "success": True,
            "date": attendance_date,
            "saved": saved_count,
            "skipped": skipped_count,
            "student_notified": student_notified,
            "parent_notified": parent_notified,
            "notification_errors": notify_error_count
        }
    except Exception as e:
        logger.error(f"Attendance Error: {e}")
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/attendance/class/{grade}")
async def get_class_attendance(grade: int, date: str):
    conn = get_db_connection()
    c = conn.cursor()
    
    # Get all students for this grade
    students = c.execute("SELECT id, name, photo_url FROM students WHERE grade = ? AND role = 'Student'", (grade,)).fetchall()
    
    # Get attendance for date
    att_rows = c.execute("SELECT student_id, status, remarks FROM student_attendance WHERE date = ?", (date,)).fetchall()
    att_map = {row['student_id']: row for row in att_rows}
    
    results = []
    for s in students:
        record = att_map.get(s['id'])
        results.append({
            "id": s['id'],
            "name": s['name'],
            "photo_url": s['photo_url'],
            "status": record['status'] if record else "Not Marked",
            "remarks": record['remarks'] if record else ""
        })
        
    conn.close()
    return results

@app.get("/api/attendance/student/my")
async def get_my_attendance(
    days: int = 30,
    month: Optional[int] = None,
    year: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    student_id: Optional[str] = None,
    months_back: int = 6,
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")

    days = max(1, min(days, 365))
    months_back = max(1, min(months_back, 24))

    def _parse_date(v: Optional[str]) -> Optional[datetime.date]:
        if not v:
            return None
        try:
            return datetime.strptime(v.strip(), "%Y-%m-%d").date()
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {v}. Use YYYY-MM-DD.")

    def _shift_month(d: datetime.date, delta_months: int) -> datetime.date:
        y = d.year
        m = d.month + delta_months
        while m <= 0:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        return datetime(y, m, 1).date()

    conn = get_db_connection()
    c = conn.cursor()
    try:
        requester = c.execute(
            "SELECT id, role FROM students WHERE id = ?",
            (x_user_id,)
        ).fetchone()
        if not requester:
            raise HTTPException(status_code=404, detail="User not found.")
        target_student_id = x_user_id
        if requester["role"] == "Student":
            target_student_id = x_user_id
        elif requester["role"] in ("Parent", "Parent_Guardian"):
            if student_id and student_id.strip():
                target_student_id = student_id.strip()
            else:
                child = c.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (x_user_id,),
                ).fetchone()
                if not child or not child["student_id"]:
                    raise HTTPException(status_code=404, detail="No linked child found for parent.")
                target_student_id = child["student_id"]

            linked = c.execute(
                """
                SELECT 1
                FROM guardians
                WHERE LOWER(email) = LOWER(?)
                  AND LOWER(student_id) = LOWER(?)
                LIMIT 1
                """,
                (x_user_id, target_student_id),
            ).fetchone()
            if not linked:
                raise HTTPException(status_code=403, detail="Access denied for this student.")
        else:
            raise HTTPException(status_code=403, detail="Only students/parents can access this endpoint.")

        student = c.execute(
            "SELECT id, role, attendance_rate FROM students WHERE id = ? AND role = 'Student'",
            (target_student_id,),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")

        today = datetime.now().date()
        parsed_from = _parse_date(from_date)
        parsed_to = _parse_date(to_date)

        if parsed_from or parsed_to:
            range_from = parsed_from or (parsed_to - timedelta(days=days - 1))
            range_to = parsed_to or (range_from + timedelta(days=days - 1))
        elif month is not None or year is not None:
            if month is None or year is None:
                raise HTTPException(status_code=400, detail="Both month and year are required together.")
            if month < 1 or month > 12:
                raise HTTPException(status_code=400, detail="month must be between 1 and 12.")
            if year < 2000 or year > 2100:
                raise HTTPException(status_code=400, detail="year must be between 2000 and 2100.")
            range_from = datetime(year, month, 1).date()
            if month == 12:
                range_to = datetime(year + 1, 1, 1).date() - timedelta(days=1)
            else:
                range_to = datetime(year, month + 1, 1).date() - timedelta(days=1)
        else:
            range_to = today
            range_from = today - timedelta(days=days - 1)

        if range_from > range_to:
            raise HTTPException(status_code=400, detail="from_date cannot be after to_date.")

        from_date_str = range_from.strftime("%Y-%m-%d")
        to_date_str = range_to.strftime("%Y-%m-%d")

        rows = c.execute(
            """
            SELECT date, status, remarks, created_at
            FROM student_attendance
            WHERE student_id = ?
              AND date >= ?
              AND date <= ?
            ORDER BY date DESC, created_at DESC
            """,
            (target_student_id, from_date_str, to_date_str)
        ).fetchall()

        # Keep latest entry per date (if duplicates exist) for stable summaries/trends.
        by_date = {}
        for r in rows:
            rec = dict(r)
            rec_date = (rec.get("date") or "").strip()
            if rec_date and rec_date not in by_date:
                by_date[rec_date] = rec

        records = sorted(by_date.values(), key=lambda x: (x.get("date") or ""), reverse=True)
        present_count = sum(1 for r in records if (r.get("status") or "").strip().title() == "Present")
        absent_count = sum(1 for r in records if (r.get("status") or "").strip().title() == "Absent")
        late_count = sum(1 for r in records if (r.get("status") or "").strip().title() == "Late")
        total_marked = len(records)

        computed_rate = (present_count / total_marked * 100.0) if total_marked > 0 else None
        overall_rate = round(student["attendance_rate"] or 0.0, 1)

        # Monthly summary for trend cards/charts (last `months_back` months including current month).
        month_anchor = datetime(today.year, today.month, 1).date()
        monthly_from = _shift_month(month_anchor, -(months_back - 1))
        monthly_rows = c.execute(
            """
            SELECT date, status, remarks, created_at
            FROM student_attendance
            WHERE student_id = ?
              AND date >= ?
              AND date <= ?
            ORDER BY date DESC, created_at DESC
            """,
            (target_student_id, monthly_from.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d"))
        ).fetchall()

        month_date_map: Dict[str, Dict[str, Any]] = {}
        for r in monthly_rows:
            rec = dict(r)
            rec_date = (rec.get("date") or "").strip()
            if not rec_date:
                continue
            if rec_date not in month_date_map:
                month_date_map[rec_date] = rec

        monthly_bucket: Dict[str, Dict[str, Any]] = {}
        for rec in month_date_map.values():
            month_key = (rec.get("date") or "")[:7]  # YYYY-MM
            if len(month_key) != 7:
                continue
            bucket = monthly_bucket.setdefault(month_key, {
                "month": month_key,
                "present": 0,
                "absent": 0,
                "late": 0,
                "total_marked": 0
            })
            status = (rec.get("status") or "").strip().title()
            if status == "Present":
                bucket["present"] += 1
            elif status == "Absent":
                bucket["absent"] += 1
            elif status == "Late":
                bucket["late"] += 1
            bucket["total_marked"] += 1

        month_keys = []
        for i in range(months_back):
            d = _shift_month(month_anchor, -i)
            month_keys.append(d.strftime("%Y-%m"))
        month_keys = list(reversed(month_keys))

        monthly_summary = []
        for mk in month_keys:
            bucket = monthly_bucket.get(mk, {
                "month": mk,
                "present": 0,
                "absent": 0,
                "late": 0,
                "total_marked": 0
            })
            total_m = bucket["total_marked"]
            bucket["attendance_rate"] = round((bucket["present"] / total_m) * 100.0, 1) if total_m > 0 else None
            monthly_summary.append(bucket)

        daily_trend = []
        for rec in sorted(records, key=lambda x: (x.get("date") or "")):
            status = (rec.get("status") or "").strip().title()
            daily_trend.append({
                "date": rec.get("date"),
                "status": status,
                "present": 1 if status == "Present" else 0,
                "absent": 1 if status == "Absent" else 0,
                "late": 1 if status == "Late" else 0
            })

        return {
            "student_id": target_student_id,
            "from_date": from_date_str,
            "to_date": to_date_str,
            "filters": {
                "days": days,
                "month": month,
                "year": year,
                "from_date": from_date,
                "to_date": to_date
            },
            "summary": {
                "days_requested": days,
                "total_marked": total_marked,
                "present": present_count,
                "absent": absent_count,
                "late": late_count,
                "window_rate": round(computed_rate, 1) if computed_rate is not None else None,
                "overall_rate": overall_rate
            },
            "records": records,
            "monthly_summary": monthly_summary,
            "trend": {
                "daily": daily_trend,
                "monthly": monthly_summary
            }
        }
    finally:
        conn.close()

# --- TIMETABLE MODULE ---
@app.get("/api/timetable/teacher/{teacher_id}")
async def get_teacher_timetable(teacher_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    rows = c.execute("SELECT * FROM timetables WHERE teacher_id = ? ORDER BY day_of_week, period_number", (teacher_id,)).fetchall()
    conn.close()
    
    # Map to simpler structure
    days = {}
    for r in rows:
        d = r['day_of_week']
        if d not in days: days[d] = []
        days[d].append({
            "period": r['period_number'],
            "time": f"{r['start_time']} - {r['end_time']}",
            "subject": r['subject'],
            "class": f"Grade {r['class_grade']}-{r['section']}"
        })
    return days

@app.get("/api/timetable/student/my")
async def get_my_timetable(student_id: Optional[str] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")

    conn = get_db_connection()
    c = conn.cursor()
    try:
        requester = c.execute(
            "SELECT id, role FROM students WHERE id = ?",
            (x_user_id,)
        ).fetchone()
        if not requester:
            raise HTTPException(status_code=404, detail="User not found.")
        target_student_id = x_user_id
        if requester["role"] == "Student":
            target_student_id = x_user_id
        elif requester["role"] in ("Parent", "Parent_Guardian"):
            if student_id and student_id.strip():
                target_student_id = student_id.strip()
            else:
                child = c.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (x_user_id,),
                ).fetchone()
                if not child or not child["student_id"]:
                    raise HTTPException(status_code=404, detail="No linked child found for parent.")
                target_student_id = child["student_id"]

            linked = c.execute(
                """
                SELECT 1
                FROM guardians
                WHERE LOWER(email) = LOWER(?)
                  AND LOWER(student_id) = LOWER(?)
                LIMIT 1
                """,
                (x_user_id, target_student_id),
            ).fetchone()
            if not linked:
                raise HTTPException(status_code=403, detail="Access denied for this student.")
        else:
            raise HTTPException(status_code=403, detail="Only students/parents can access this endpoint.")

        student = c.execute(
            "SELECT id, role, grade, section_id FROM students WHERE id = ? AND role = 'Student'",
            (target_student_id,),
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")

        grade = student["grade"]
        section_name = None
        if student["section_id"]:
            sec = c.execute("SELECT name FROM sections WHERE id = ?", (student["section_id"],)).fetchone()
            if sec:
                section_name = sec["name"]

        order_expr = """
            CASE day_of_week
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                WHEN 'Sunday' THEN 7
                ELSE 8
            END
        """

        if section_name:
            rows = c.execute(
                f"""
                SELECT id, day_of_week, period_number, start_time, end_time, subject, teacher_id, class_grade, section
                FROM timetables
                WHERE class_grade = ?
                  AND (section = ? OR section IS NULL OR TRIM(section) = '')
                ORDER BY {order_expr}, period_number ASC, start_time ASC
                """,
                (grade, section_name)
            ).fetchall()
        else:
            rows = c.execute(
                f"""
                SELECT id, day_of_week, period_number, start_time, end_time, subject, teacher_id, class_grade, section
                FROM timetables
                WHERE class_grade = ?
                ORDER BY {order_expr}, period_number ASC, start_time ASC
                """,
                (grade,)
            ).fetchall()

        return {
            "student_id": target_student_id,
            "grade": grade,
            "section": section_name,
            "entries": [dict(r) for r in rows]
        }
    finally:
        conn.close()

@app.post("/api/timetable/upload-pdf")
async def upload_timetable_pdf(
    class_grade: int = Form(...),
    section: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    conn = get_db_connection()
    c = conn.cursor()
    try:
        actor = c.execute(
            "SELECT id, role, school_id FROM students WHERE id = ?",
            (x_user_id,)
        ).fetchone()
        if not actor:
            raise HTTPException(status_code=401, detail="User not found.")

        allowed_roles = {"Teacher", "Admin", "Principal", "Tenant_Admin", "Super Admin", "Super_Admin", "Root_Admin", "Root_Super_Admin"}
        if actor["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Only teacher/admin users can upload timetable PDFs.")

        filename = (file.filename or "").strip()
        ext = os.path.splitext(filename)[1].lower()
        if ext != ".pdf":
            raise HTTPException(status_code=400, detail="Only PDF files are allowed for timetable uploads.")

        payload = await file.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(payload) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File is too large. Maximum allowed size is 15MB.")

        target_school_id = actor["school_id"] if actor["school_id"] else 1
        clean_section = (section or "").strip()
        uploaded_at = datetime.now().isoformat()
        safe_title = (title or "").strip() or f"Class {class_grade}{('-' + clean_section) if clean_section else ''} Timetable"

        timetable_dir = os.path.join(STATIC_DIR, "uploads", "timetables")
        os.makedirs(timetable_dir, exist_ok=True)
        unique_filename = f"{uuid.uuid4()}{ext}"
        disk_path = os.path.join(timetable_dir, unique_filename)
        with open(disk_path, "wb") as fp:
            fp.write(payload)
        web_path = f"/static/uploads/timetables/{unique_filename}"

        row = c.execute(
            """
            INSERT INTO timetable_pdfs (school_id, class_grade, section, title, file_path, uploaded_by, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                target_school_id,
                class_grade,
                clean_section if clean_section else None,
                safe_title,
                web_path,
                actor["id"],
                uploaded_at
            )
        ).fetchone()
        pdf_id = row["id"] if row else 0

        recipients_students = c.execute(
            """
            SELECT s.id, s.name, sec.name AS section_name
            FROM students s
            LEFT JOIN sections sec ON sec.id = s.section_id
            WHERE s.school_id = ?
              AND s.role = 'Student'
              AND s.grade = ?
              AND (? = '' OR LOWER(COALESCE(sec.name, '')) = LOWER(?))
            """,
            (target_school_id, class_grade, clean_section, clean_section)
        ).fetchall()

        recipients_teachers = []
        if clean_section:
            recipients_teachers = c.execute(
                """
                SELECT DISTINCT t.id
                FROM students t
                JOIN timetables tt ON tt.teacher_id = t.id
                WHERE t.school_id = ?
                  AND t.role = 'Teacher'
                  AND tt.class_grade = ?
                  AND LOWER(COALESCE(tt.section, '')) = LOWER(?)
                  AND t.id <> ?
                """,
                (target_school_id, class_grade, clean_section, actor["id"])
            ).fetchall()
        else:
            recipients_teachers = c.execute(
                """
                SELECT DISTINCT t.id
                FROM students t
                JOIN timetables tt ON tt.teacher_id = t.id
                WHERE t.school_id = ?
                  AND t.role = 'Teacher'
                  AND tt.class_grade = ?
                  AND t.id <> ?
                """,
                (target_school_id, class_grade, actor["id"])
            ).fetchall()

        student_notified = 0
        parent_notified = 0
        teacher_notified = 0

        class_label = f"Grade {class_grade}{('-' + clean_section) if clean_section else ''}"
        subject_line = f"New Timetable PDF: {safe_title}"
        teacher_subject_line = f"Timetable Shared for {class_label}"

        parent_notified_ids = set()
        for student in recipients_students:
            try:
                c.execute(
                    """
                    INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
                    VALUES (?, ?, ?, ?, ?, FALSE)
                    """,
                    (
                        actor["id"],
                        student["id"],
                        subject_line,
                        f"A new timetable PDF has been uploaded for {class_label}.\nTitle: {safe_title}\nFile: {web_path}",
                        uploaded_at
                    )
                )
                student_notified += 1
            except Exception as e:
                logger.warning(f"Failed to notify student {student['id']} about timetable PDF: {e}")

            guardians = c.execute(
                "SELECT email, name FROM guardians WHERE student_id = ?",
                (student["id"],)
            ).fetchall()
            parent_ids = _resolve_parent_ids_for_student(c, student["id"], target_school_id, guardians)
            for pid in parent_ids:
                if pid in parent_notified_ids:
                    continue
                try:
                    c.execute(
                        """
                        INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
                        VALUES (?, ?, ?, ?, ?, FALSE)
                        """,
                        (
                            actor["id"],
                            pid,
                            subject_line,
                            f"A new timetable PDF has been uploaded for your child ({class_label}).\nTitle: {safe_title}\nFile: {web_path}",
                            uploaded_at
                        )
                    )
                    parent_notified_ids.add(pid)
                    parent_notified += 1
                except Exception as e:
                    logger.warning(f"Failed to notify parent {pid} about timetable PDF: {e}")

        teacher_ids = sorted({row["id"] for row in recipients_teachers if row["id"]})
        if teacher_ids:
            teacher_notified = _send_messages(
                conn,
                actor["id"],
                teacher_ids,
                teacher_subject_line,
                f"A timetable PDF was uploaded for {class_label}.\nTitle: {safe_title}\nFile: {web_path}"
            )

        conn.commit()
        return {
            "success": True,
            "id": pdf_id,
            "class_grade": class_grade,
            "section": clean_section or None,
            "title": safe_title,
            "file_path": web_path,
            "uploaded_by": actor["id"],
            "uploaded_at": uploaded_at,
            "notified": {
                "students": student_notified,
                "parents": parent_notified,
                "teachers": teacher_notified
            }
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Failed to upload timetable PDF: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload timetable PDF.")
    finally:
        conn.close()

@app.get("/api/timetable/student/my/pdfs", response_model=List[TimetablePdfResponse])
async def get_my_timetable_pdfs(student_id: Optional[str] = None, x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")

    conn = get_db_connection()
    c = conn.cursor()
    try:
        requester = c.execute(
            "SELECT id, role FROM students WHERE id = ?",
            (x_user_id,)
        ).fetchone()
        if not requester:
            raise HTTPException(status_code=404, detail="User not found.")

        target_student_id = x_user_id
        if requester["role"] == "Student":
            target_student_id = x_user_id
        elif requester["role"] in ("Parent", "Parent_Guardian"):
            if student_id and student_id.strip():
                target_student_id = student_id.strip()
            else:
                child = c.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (x_user_id,),
                ).fetchone()
                if not child or not child["student_id"]:
                    raise HTTPException(status_code=404, detail="No linked child found for parent.")
                target_student_id = child["student_id"]

            linked = c.execute(
                """
                SELECT 1
                FROM guardians
                WHERE LOWER(email) = LOWER(?)
                  AND LOWER(student_id) = LOWER(?)
                LIMIT 1
                """,
                (x_user_id, target_student_id),
            ).fetchone()
            if not linked:
                raise HTTPException(status_code=403, detail="Access denied for this student.")
        else:
            raise HTTPException(status_code=403, detail="Only students/parents can access this endpoint.")

        student = c.execute(
            """
            SELECT s.id, s.grade, s.school_id, sec.name AS section_name
            FROM students s
            LEFT JOIN sections sec ON sec.id = s.section_id
            WHERE s.id = ? AND s.role = 'Student'
            """,
            (target_student_id,)
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")

        section_name = (student["section_name"] or "").strip()
        rows = c.execute(
            """
            SELECT id, class_grade, section, title, file_path, uploaded_by, uploaded_at
            FROM timetable_pdfs
            WHERE school_id = ?
              AND class_grade = ?
              AND (section IS NULL OR TRIM(section) = '' OR ? = '' OR LOWER(TRIM(section)) = LOWER(?))
            ORDER BY uploaded_at DESC
            """,
            (student["school_id"] if student["school_id"] else 1, student["grade"], section_name, section_name)
        ).fetchall()

        return [
            TimetablePdfResponse(
                id=row["id"],
                class_grade=row["class_grade"],
                section=(row["section"] or "").strip() or None,
                title=row["title"],
                file_path=row["file_path"],
                uploaded_by=row["uploaded_by"],
                uploaded_at=row["uploaded_at"]
            )
            for row in rows
        ]
    finally:
        conn.close()

@app.get("/api/timetable/teacher/my/pdfs", response_model=List[TimetablePdfResponse])
async def get_teacher_timetable_pdfs(x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")

    conn = get_db_connection()
    c = conn.cursor()
    try:
        teacher = c.execute(
            "SELECT id, role, school_id FROM students WHERE id = ?",
            (x_user_id,)
        ).fetchone()
        if not teacher:
            raise HTTPException(status_code=404, detail="User not found.")

        allowed_roles = {"Teacher", "Admin", "Principal", "Tenant_Admin", "Super Admin", "Super_Admin", "Root_Admin", "Root_Super_Admin"}
        if teacher["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Only teacher/admin users can access this endpoint.")

        rows = c.execute(
            """
            SELECT id, class_grade, section, title, file_path, uploaded_by, uploaded_at
            FROM timetable_pdfs
            WHERE school_id = ?
            ORDER BY uploaded_at DESC
            """,
            (teacher["school_id"] if teacher["school_id"] else 1,)
        ).fetchall()

        if teacher["role"] == "Teacher":
            assignments = c.execute(
                """
                SELECT DISTINCT class_grade, COALESCE(TRIM(section), '') AS section
                FROM timetables
                WHERE teacher_id = ?
                """,
                (x_user_id,)
            ).fetchall()
            assignment_set = {
                (row["class_grade"], (row["section"] or "").strip().lower())
                for row in assignments
                if row["class_grade"] is not None
            }
            taught_grades = {grade for grade, _ in assignment_set}

            filtered = []
            for row in rows:
                row_grade = row["class_grade"]
                row_section = (row["section"] or "").strip().lower()
                if row["uploaded_by"] == x_user_id:
                    filtered.append(row)
                    continue
                if (row_grade, row_section) in assignment_set:
                    filtered.append(row)
                    continue
                if not row_section and row_grade in taught_grades:
                    filtered.append(row)
            rows = filtered

        return [
            TimetablePdfResponse(
                id=row["id"],
                class_grade=row["class_grade"],
                section=(row["section"] or "").strip() or None,
                title=row["title"],
                file_path=row["file_path"],
                uploaded_by=row["uploaded_by"],
                uploaded_at=row["uploaded_at"]
            )
            for row in rows
        ]
    finally:
        conn.close()

# --- LEAVE REQUEST MODULE ---
class LeaveRequestCreate(BaseModel):
    user_id: str
    type: str
    start_date: str
    end_date: str
    reason: str

# Duplicate apply_leave removed. Using the implementation at the end of the file.


@app.get("/api/leave/student/pending")
async def get_pending_student_leaves(x_school_id: int = Header(1, alias="X-School-Id")):
    conn = get_db_connection()
    c = conn.cursor()
    # Fetch pending leaves for 'Student' role
    leaves = c.execute("""
        SELECT l.*, s.name, s.grade 
        FROM leave_requests l
        JOIN students s ON l.user_id = s.id
        WHERE l.status = 'Pending' AND s.role = 'Student'
    """).fetchall()
    conn.close()
    result = []
    for l in leaves:
        result.append({
            "id": l['id'],
            "student_name": l['name'],
            "grade": l['grade'],
            "type": l['type'],
            "dates": f"{l['start_date']} to {l['end_date']}",
            "reason": l['reason']
        })
    return result

@app.post("/api/leave/{request_id}/action")
async def action_leave_request(request_id: int, action: str = Body(..., embed=True), reviewer_id: str = Body(..., embed=True)):
    conn = get_db_connection()
    c = conn.cursor()
    try:
        status = "Approved" if action.lower() == "approve" else "Denied"
        c.execute("UPDATE leave_requests SET status = ?, reviewed_by = ? WHERE id = ?", (status, reviewer_id, request_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# --- ASSIGNMENT SUBMISSIONS MODULE ---
@app.get("/api/assignments/teacher/pending")
async def get_pending_assignments(teacher_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    # Mock query: Get submissions for assignments created by groups owned by teacher
    # Since we simplified groups, let's just fetch ALL pending submissions for demo
    subs = c.execute("""
        SELECT s.*, a.title as assignment_title, st.name as student_name
        FROM assignment_submissions s
        JOIN assignments a ON s.assignment_id = a.id
        JOIN students st ON s.student_id = st.id
        WHERE s.status = 'Submitted'
    """).fetchall()
    conn.close()
    
    result = []
    for s in subs:
        result.append({
            "id": s['id'],
            "assignment_title": s['assignment_title'],
            "student_name": s['student_name'],
            "submitted_at": s['submitted_at'],
            "content": s['content_text']
        })
    return result

@app.post("/api/assignments/submissions/{sub_id}/grade")
async def grade_submission(sub_id: int,
                           grade: float = Body(..., embed=True),
                           feedback: str = Body(..., embed=True),
                           x_user_role: str = Header(None, alias="X-User-Role"),
                           x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("assignment.grade", x_user_role=x_user_role, x_user_id=x_user_id)
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("UPDATE assignment_submissions SET grade = ?, feedback = ?, status = 'Graded' WHERE id = ?", (grade, feedback, sub_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
         conn.rollback()
         raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/assignments/submissions/{sub_id}/reassign")
async def reassign_submission(sub_id: int,
                              feedback: str = Body("", embed=True),
                              x_user_role: str = Header(None, alias="X-User-Role"),
                              x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("assignment.grade", x_user_role=x_user_role, x_user_id=x_user_id)
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute("UPDATE assignment_submissions SET grade = NULL, status = 'Reassigned', feedback = ? WHERE id = ?", (feedback, sub_id))
        conn.commit()
        return {"success": True}
    except Exception as e:
         conn.rollback()
         raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/assignments", status_code=201)
async def create_assignment(req: AssignmentCreateRequest,
                            x_user_role: str = Header(None, alias="X-User-Role"),
                            x_user_id: str = Header(None, alias="X-User-Id"),
                            x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    await verify_permission("assignment.create", x_user_role=x_user_role, x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        section_id = req.section_id
        grade_level = req.grade_level
        if section_id:
            section = conn.execute("SELECT id, grade_level, school_id FROM sections WHERE id = ?", (section_id,)).fetchone()
            if not section:
                raise HTTPException(status_code=404, detail="Section not found.")
            if x_school_id and section["school_id"] != x_school_id:
                raise HTTPException(status_code=403, detail="Section does not belong to your school.")
            grade_level = section["grade_level"]
        if not grade_level:
            raise HTTPException(status_code=400, detail="Grade level is required.")
        conn.execute("""
            INSERT INTO assignments (group_id, title, description, due_date, type, points, section_id, grade_level)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (None, req.title, req.description, req.due_date, "Assignment", req.points, section_id, grade_level))
        conn.commit()
        return {"success": True, "message": "Assignment created"}
    finally:
        conn.close()


@app.post("/api/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: int,
                            req: SubmissionCreateRequest,
                            x_user_role: str = Header(None, alias="X-User-Role"),
                            x_user_id: str = Header(None, alias="X-User-Id")):
    if x_user_role != 'Student':
        raise HTTPException(status_code=403, detail="Only students can submit assignments.")
    if x_user_id and x_user_id != req.student_id:
        raise HTTPException(status_code=403, detail="Student ID mismatch.")
    conn = get_db_connection()
    try:
        assignment = conn.execute("SELECT id FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found.")
        existing = conn.execute("""
            SELECT id FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?
        """, (assignment_id, req.student_id)).fetchone()
        submitted_at = datetime.now().isoformat()
        if existing:
            conn.execute("""
                UPDATE assignment_submissions
                SET content_text = ?, submitted_at = ?, status = 'Submitted', grade = NULL, feedback = NULL
                WHERE id = ?
            """, (req.content, submitted_at, existing["id"]))
        else:
            conn.execute("""
                INSERT INTO assignment_submissions (assignment_id, student_id, submitted_at, content_text, status)
                VALUES (?, ?, ?, ?, 'Submitted')
            """, (assignment_id, req.student_id, submitted_at, req.content))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@app.get("/api/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(assignment_id: int,
                                     x_user_role: str = Header(None, alias="X-User-Role"),
                                     x_user_id: str = Header(None, alias="X-User-Id")):
    await verify_permission("assignment.view", x_user_role=x_user_role, x_user_id=x_user_id)
    conn = get_db_connection()
    try:
        subs = conn.execute("""
            SELECT s.id, s.assignment_id, s.student_id, s.submitted_at, s.content_text, s.grade, s.feedback, s.status,
                   st.name as student_name
            FROM assignment_submissions s
            JOIN students st ON s.student_id = st.id
            WHERE s.assignment_id = ?
            ORDER BY s.submitted_at DESC
        """, (assignment_id,)).fetchall()
        return [dict(r) for r in subs]
    finally:
        conn.close()

# Moved execution block to end of file

# --- LEAVE MANAGEMENT ENDPOINTS (ADDED DYNAMICALLY) ---

class LeaveApplication(BaseModel):
    user_id: str
    type: str 
    start_date: str
    end_date: str
    reason: str

class LeaveStatusUpdate(BaseModel):
    status: str 
    reviewed_by: str
    substitute_teacher_id: Optional[str] = None

# --- PROGRESS CARD MODULE ---
class ProgressCardResponse(BaseModel):
    student: Dict[str, Any]
    academics: Dict[str, Any]
    attendance: Dict[str, Any]
    engagement: Dict[str, Any]
    alerts: List[str]
    recent_marks: List[Dict[str, Any]]
    remarks: Optional[str]

# --- ASSIGNMENT MODULE (Simple Create) ---
class ProgressMarksEntry(BaseModel):
    student_id: str
    marks_obtained: float
    grade: Optional[str] = None
    remarks: Optional[str] = None

class ProgressMarksBulkRequest(BaseModel):
    exam_name: str
    subject: str
    max_marks: float
    date: Optional[str] = None
    grade_level: int
    section_id: Optional[int] = None
    entries: List[ProgressMarksEntry]

class ProgressPublishRequest(BaseModel):
    exam_name: str
    subject: str
    grade_level: int
    section_id: Optional[int] = None

class ProgressPublishStudentRequest(BaseModel):
    student_id: str

# --- EMAIL MODULE ---
class EmailSendRequest(BaseModel):
    to: str  # can be user id, email, or group token (grade:10, section:3, role:Teacher, all)
    subject: str
    body: str

@app.get("/api/progress/roster")
async def get_progress_roster(grade_level: int,
                              section_id: Optional[int] = None,
                              x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    conn = get_db_connection()
    try:
        params = [grade_level]
        query = "SELECT id, name, grade FROM students WHERE role = 'Student' AND grade = ?"
        if section_id:
            query += " AND section_id = ?"
            params.append(section_id)
        if x_school_id:
            query += " AND school_id = ?"
            params.append(x_school_id)
        query += " ORDER BY name"
        rows = conn.execute(query, tuple(params)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.post("/api/progress/marks/bulk")
async def save_progress_marks(req: ProgressMarksBulkRequest,
                              x_user_role: str = Header(None, alias="X-User-Role"),
                              x_user_id: str = Header(None, alias="X-User-Id"),
                              x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    if x_user_role not in ('Teacher', 'Admin', 'Tenant_Admin', 'Super_Admin'):
        raise HTTPException(status_code=403, detail="Not authorized to enter marks.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Validate section if provided
        if req.section_id:
            sec = cursor.execute("SELECT id, school_id, grade_level FROM sections WHERE id = ?", (req.section_id,)).fetchone()
            if not sec:
                raise HTTPException(status_code=404, detail="Section not found.")
            if x_school_id and sec["school_id"] != x_school_id:
                raise HTTPException(status_code=403, detail="Section does not belong to your school.")

        date_val = req.date or datetime.now().date().isoformat()
        inserted = 0
        for e in req.entries:
            stu = cursor.execute(
                "SELECT id, grade, section_id, school_id FROM students WHERE id = ? AND role = 'Student'",
                (e.student_id,)
            ).fetchone()
            if not stu:
                continue
            if stu["grade"] != req.grade_level:
                continue
            if req.section_id and stu["section_id"] != req.section_id:
                continue
            if x_school_id and stu["school_id"] != x_school_id:
                continue

            cursor.execute("""
                INSERT INTO student_marks (student_id, exam_name, subject, marks_obtained, max_marks, grade, remarks, date, published, published_at, published_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """, (
                e.student_id,
                req.exam_name,
                req.subject,
                e.marks_obtained,
                req.max_marks,
                e.grade,
                e.remarks,
                date_val,
                date_val,
                x_user_id
            ))
            inserted += 1

        conn.commit()
        return {"success": True, "inserted": inserted}
    finally:
        conn.close()

@app.post("/api/progress/publish")
async def publish_progress_marks(req: ProgressPublishRequest,
                                 x_user_role: str = Header(None, alias="X-User-Role"),
                                 x_user_id: str = Header(None, alias="X-User-Id"),
                                 x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    if x_user_role not in ('Teacher', 'Admin', 'Tenant_Admin', 'Super_Admin'):
        raise HTTPException(status_code=403, detail="Not authorized to publish marks.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Validate section if provided
        if req.section_id:
            sec = cursor.execute("SELECT id, school_id, grade_level FROM sections WHERE id = ?", (req.section_id,)).fetchone()
            if not sec:
                raise HTTPException(status_code=404, detail="Section not found.")
            if x_school_id and sec["school_id"] != x_school_id:
                raise HTTPException(status_code=403, detail="Section does not belong to your school.")

        query = """
            UPDATE student_marks
            SET published = 1, published_at = ?, published_by = ?
            WHERE id IN (
                SELECT sm.id
                FROM student_marks sm
                JOIN students s ON sm.student_id = s.id
                WHERE sm.exam_name = ? AND sm.subject = ? AND s.grade = ? AND COALESCE(sm.published, 0) = 0
        """
        params = [datetime.now().isoformat(), x_user_id, req.exam_name, req.subject, req.grade_level]
        if req.section_id:
            query += " AND s.section_id = ?"
            params.append(req.section_id)
        if x_school_id:
            query += " AND s.school_id = ?"
            params.append(x_school_id)
        query += " )"

        cursor.execute(query, tuple(params))
        updated_count = cursor.rowcount
        conn.commit()
        return {"success": True, "updated": updated_count}
    finally:
        conn.close()

@app.post("/api/progress/publish/student")
async def publish_progress_for_student(req: ProgressPublishStudentRequest,
                                       x_user_role: str = Header(None, alias="X-User-Role"),
                                       x_user_id: str = Header(None, alias="X-User-Id"),
                                       x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    if x_user_role not in ('Teacher', 'Admin', 'Tenant_Admin', 'Super_Admin'):
        raise HTTPException(status_code=403, detail="Not authorized to publish marks.")

    student_id = (req.student_id or "").strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        student = cursor.execute(
            "SELECT id, school_id FROM students WHERE id = ? AND role = 'Student'",
            (student_id,)
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")
        if x_school_id and student["school_id"] != x_school_id:
            raise HTTPException(status_code=403, detail="Student does not belong to your school.")

        cursor.execute(
            """
            UPDATE student_marks
            SET published = 1, published_at = ?, published_by = ?
            WHERE student_id = ? AND COALESCE(published, 0) = 0
            """,
            (datetime.now().isoformat(), x_user_id or "teacher_publish", student_id)
        )
        updated = cursor.rowcount
        conn.commit()
        return {"success": True, "student_id": student_id, "updated": updated}
    finally:
        conn.close()

@app.get("/api/progress/publish/preview")
async def preview_publish_marks(exam_name: str,
                                subject: str,
                                grade_level: int,
                                section_id: Optional[int] = None,
                                x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    conn = get_db_connection()
    try:
        params = [exam_name, subject, grade_level]
        query = """
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN sm.published = 1 THEN 1 ELSE 0 END) as published
            FROM student_marks sm
            JOIN students s ON sm.student_id = s.id
            WHERE sm.exam_name = ? AND sm.subject = ? AND s.grade = ?
        """
        if section_id:
            query += " AND s.section_id = ?"
            params.append(section_id)
        if x_school_id:
            query += " AND s.school_id = ?"
            params.append(x_school_id)
        row = conn.execute(query, tuple(params)).fetchone()
        total = int(row["total"] or 0)
        published = int(row["published"] or 0)
        return {"total": total, "published": published}
    finally:
        conn.close()

# --- EMAIL ENDPOINTS ---
@app.get("/api/email/inbox")
async def get_email_inbox(x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user.")
    conn = get_db_connection()
    try:
        rows = conn.execute("""
            SELECT id, sender_id, recipient_email, subject, body, sent_at, is_read
            FROM emails
            WHERE recipient_email = ?
            ORDER BY id DESC
        """, (x_user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/email/sent")
async def get_email_sent(x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user.")
    conn = get_db_connection()
    try:
        rows = conn.execute("""
            SELECT id, sender_id, recipient_email, subject, body, sent_at, is_read
            FROM emails
            WHERE sender_id = ?
            ORDER BY id DESC
        """, (x_user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.put("/api/email/{email_id}/read")
async def mark_email_read(email_id: int, x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user.")
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE emails SET is_read = 1 WHERE id = ? AND recipient_email = ?", (email_id, x_user_id))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@app.post("/api/email/send")
async def send_internal_email(req: EmailSendRequest,
                              x_user_id: str = Header(None, alias="X-User-Id"),
                              x_user_role: str = Header(None, alias="X-User-Role"),
                              x_school_id: Optional[int] = Header(None, alias="X-School-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user.")
    if not req.to or not req.subject or not req.body:
        raise HTTPException(status_code=400, detail="To, subject, and body are required.")

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Resolve sender school for scoping
        sender = cursor.execute("SELECT school_id, is_super_admin FROM students WHERE id = ?", (x_user_id,)).fetchone()
        sender_school_id = sender["school_id"] if sender else None
        is_super_admin = bool(sender["is_super_admin"]) if sender else False

        # Resolve recipients
        recipients = []
        to = req.to.strip()

        def add_recipient(rid):
            if rid and rid not in recipients:
                recipients.append(rid)

        # group tokens
        if to.lower() == "all":
            rows = cursor.execute("SELECT id FROM students WHERE role IN ('Student','Teacher','Admin','Tenant_Admin')").fetchall()
            for r in rows:
                add_recipient(r["id"])
        elif to.lower().startswith("grade:"):
            grade = to.split(":", 1)[1].strip()
            rows = cursor.execute("SELECT id FROM students WHERE role = 'Student' AND grade = ?", (grade,)).fetchall()
            for r in rows:
                add_recipient(r["id"])
        elif to.lower().startswith("section:"):
            section_id = to.split(":", 1)[1].strip()
            rows = cursor.execute("SELECT id FROM students WHERE role = 'Student' AND section_id = ?", (section_id,)).fetchall()
            for r in rows:
                add_recipient(r["id"])
        elif to.lower().startswith("role:"):
            role = to.split(":", 1)[1].strip()
            rows = cursor.execute("SELECT id FROM students WHERE role = ?", (role,)).fetchall()
            for r in rows:
                add_recipient(r["id"])
        else:
            # direct user id/email
            add_recipient(to)

        # Scope by school unless super admin
        if not is_super_admin and sender_school_id:
            scoped = []
            for rid in recipients:
                r = cursor.execute("SELECT id, school_id FROM students WHERE id = ?", (rid,)).fetchone()
                if r and r["school_id"] == sender_school_id:
                    scoped.append(r["id"])
                elif "@" in rid:
                    # allow external email addresses (send only)
                    scoped.append(rid)
            recipients = scoped

        if not recipients:
            raise HTTPException(status_code=404, detail="No valid recipients found.")

        ts = datetime.now().isoformat()
        for rid in recipients:
            cursor.execute("""
                INSERT INTO emails (sender_id, recipient_email, subject, body, sent_at, is_read)
                VALUES (?, ?, ?, ?, ?, FALSE)
            """, (x_user_id, rid, req.subject, req.body, ts))

            # If recipient looks like an email, try SMTP send
            if "@" in rid:
                send_email(rid, req.subject, req.body)

        conn.commit()
        return {"success": True, "sent": len(recipients)}
    finally:
        conn.close()

@app.post("/api/leave/apply")
async def apply_leave(request: LeaveApplication):
    print(f"DEBUG LEAVE APPLY: {request.dict()}")
    conn = get_db_connection()
    try:
        cursor = conn.cursor()

        # Resolve requester role + school
        requester = cursor.execute(
            "SELECT role, school_id FROM students WHERE id = ?",
            (request.user_id,)
        ).fetchone()
        if not requester:
            raise HTTPException(status_code=404, detail="User not found.")
        requester_role = requester[0]
        requester_school_id = requester[1]
        
        # 1. Insert Request
        cursor.execute("""
            INSERT INTO leave_requests (user_id, type, start_date, end_date, reason, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'Pending', ?)
        """, (request.user_id, request.type, request.start_date, request.end_date, request.reason, datetime.now().isoformat()))
        
        # 2. Notify Admin AND Principal (SuperAdmin/Tenant_Admin)
        try:
            target_roles = "'Tenant_Admin', 'Admin', 'Super_Admin', 'SuperAdmin', 'Principal'"
            
            # Select relevant admins. For SuperAdmin, we might notify all or school-specific if linked.
            # Assuming SuperAdmin is the Principal for this context if no explicit Principal role.
            cursor.execute(f"""
                SELECT id FROM students 
                WHERE role IN ({target_roles}) 
                AND (school_id = ? OR role IN ('Super_Admin', 'SuperAdmin'))
            """, (requester_school_id,))
            
            admins = cursor.fetchall()
            print(f"DEBUG: Notifying {len(admins)} admins/principals for leave request.")
            
            msg_content = f"Leave Request from {request.user_id}: {request.reason} ({request.start_date} to {request.end_date})"
            ts = datetime.now().isoformat()
            
            for admin in admins:
                aid = admin[0]
                cursor.execute("""
                    INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
                    VALUES (?, ?, 'New Leave Request (Requires Approval)', ?, ?, FALSE)
                """, (request.user_id, aid, msg_content, ts))
        except Exception as e:
            print(f"Notification Error: {e}")

        conn.commit()
        return {"success": True, "message": "Leave application submitted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Apply Leave Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/leave/pending")
async def get_pending_leaves(x_school_id: int = Header(1, alias="X-School-Id")):
    conn = get_db_connection()
    try:
        # Join with students to get name and grade
        query = """
            SELECT l.*, s.name, s.grade 
            FROM leave_requests l
            JOIN students s ON l.user_id = s.id
            WHERE l.status = 'Pending' AND s.school_id = ?
        """
        rows = conn.execute(query, (x_school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/leave/history")
async def get_leave_history(x_school_id: int = Header(1, alias="X-School-Id")):
    conn = get_db_connection()
    try:
        # Some older DB schemas may not have leave_requests.created_at.
        # Try the richer ordering first, then fall back safely.
        try:
            rows = conn.execute("""
                SELECT l.*, s.name, s.grade
                FROM leave_requests l
                JOIN students s ON l.user_id = s.id
                WHERE l.status != 'Pending' AND s.school_id = ?
                ORDER BY l.created_at DESC, l.id DESC
            """, (x_school_id,)).fetchall()
        except Exception:
            rows = conn.execute("""
                SELECT l.*, s.name, s.grade
                FROM leave_requests l
                JOIN students s ON l.user_id = s.id
                WHERE l.status != 'Pending' AND s.school_id = ?
                ORDER BY l.id DESC
            """, (x_school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.get("/api/leave/processed")
async def get_processed_leave_history(x_school_id: int = Header(1, alias="X-School-Id")):
    return await get_leave_history(x_school_id=x_school_id)
        
@app.get("/api/leave/my-history")
async def get_my_leave_history(user_id: str):
    conn = get_db_connection()
    try:
        rows = conn.execute("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

@app.put("/api/leave/{leave_id}/status")
async def update_leave_status(leave_id: int, update: LeaveStatusUpdate, x_user_role: str = Header(None, alias="X-User-Role")):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Fetch request details
        cursor.execute("SELECT user_id, type, status, admin_approval, principal_approval FROM leave_requests WHERE id = ?", (leave_id,))
        req = cursor.fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Leave request not found.")
        
        requester_id = req[0]
        leave_type = req[1]
        current_status = req[2]
        
        # Determine Approval Roles
        # Assuming Tenant_Admin/Admin = Admin Approval
        # Assuming Super_Admin/Principal = Principal Approval
        
        is_admin_role = x_user_role in ['Admin', 'Tenant_Admin']
        is_principal_role = x_user_role in ['Super_Admin', 'SuperAdmin', 'Principal']
        
        # Apply Logic
        new_admin_status = req[3]
        new_principal_status = req[4]
        
        if is_admin_role:
            new_admin_status = update.status
            cursor.execute("UPDATE leave_requests SET admin_approval = ? WHERE id = ?", (update.status, leave_id))
        
        if is_principal_role:
            new_principal_status = update.status
            cursor.execute("UPDATE leave_requests SET principal_approval = ? WHERE id = ?", (update.status, leave_id))
            
        if not (is_admin_role or is_principal_role):
            # Fallback for generic permissions or testing
            print(f"Warning: User role {x_user_role} approving leave, treating as Admin")
            new_admin_status = update.status
            cursor.execute("UPDATE leave_requests SET admin_approval = ? WHERE id = ?", (update.status, leave_id))

        # Determine Final Status
        final_status = 'Pending'
        if new_admin_status == 'Rejected' or new_principal_status == 'Rejected':
            final_status = 'Rejected'
        elif new_admin_status == 'Approved' and new_principal_status == 'Approved':
            final_status = 'Approved'
        else:
             # If one approved and other pending -> 'Pending Approval' or similar. 
             # Keeping 'Pending' ensures it doesn't trigger final actions yet.
             final_status = 'Pending'

        # Only proceed with reassignment if transitioning to Approved
        if final_status == 'Approved' and current_status != 'Approved':
             # If a teacher leave is approved, require reassignment
             requester = cursor.execute(
                 "SELECT role, school_id FROM students WHERE id = ?",
                 (requester_id,)
             ).fetchone()
             if requester and requester[0] == 'Teacher':
                 if not update.substitute_teacher_id:
                     # Warn or require? If Principal is approving last, they clearly need to provide this.
                     # If Admin approved first without sub, that's fine. 
                     # But current frontend likely sends it with the approval.
                     if update.substitute_teacher_id:
                        # Validate substitute teacher
                        sub = cursor.execute(
                            "SELECT id, role, school_id FROM students WHERE id = ?",
                            (update.substitute_teacher_id,)
                        ).fetchone()
                        if sub:
                             # Reassign timetable entries to substitute teacher
                             cursor.execute(
                                 "UPDATE timetables SET teacher_id = ? WHERE teacher_id = ?",
                                 (update.substitute_teacher_id, requester_id)
                             )
                             cursor.execute("""
                                 INSERT INTO leave_reassignments (leave_id, original_teacher_id, substitute_teacher_id, assigned_by, assigned_at)
                                 VALUES (?, ?, ?, ?, ?)
                             """, (leave_id, requester_id, update.substitute_teacher_id, update.reviewed_by, datetime.now().isoformat()))

        # Update Final Status
        cursor.execute("UPDATE leave_requests SET status = ?, reviewed_by = ? WHERE id = ?", 
                       (final_status, update.reviewed_by, leave_id))

        status_msg = f"Your {leave_type} request has been {update.status.upper()}."
        
        cursor.execute("""
            INSERT INTO messages (sender_id, receiver_id, subject, content, timestamp, is_read)
            VALUES (?, ?, 'Leave Request Update', ?, ?, FALSE)
        """, (update.reviewed_by, requester_id, status_msg, datetime.now().isoformat()))
        conn.commit()

        return {"message": f"Leave request {update.status}"}
    except HTTPException:
         raise
    except Exception as e:
         print(f"Update Leave Error: {e}")
         raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# --- Internal Messages / Notifications Endpoints ---

@app.get("/api/notifications/inbox")
async def get_notifications(x_user_id: str = Header(..., alias="X-User-Id")):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        msgs = cursor.execute("""
            SELECT id, sender_id, subject, content, timestamp, is_read 
            FROM messages 
            WHERE receiver_id = ? 
              AND LOWER(COALESCE(subject, '')) NOT LIKE '%report card%'
              AND LOWER(COALESCE(content, '')) NOT LIKE '%report card%'
            ORDER BY timestamp DESC
        """, (x_user_id,)).fetchall()
        
        result = []
        for row in msgs:
            result.append({
                "id": row[0],
                "sender_id": row[1],
                "subject": row[2],
                "content": row[3],
                "timestamp": row[4],
                "is_read": bool(row[5])
            })
        return result
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return []
    finally:
        conn.close()

@app.put("/api/notifications/{msg_id}/read")
async def mark_notification_read(msg_id: int, x_user_id: str = Header(..., alias="X-User-Id")):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE messages SET is_read = 1 WHERE id = ? AND receiver_id = ?", (msg_id, x_user_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Notification not found.")
        conn.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error marking notification read: {e}")
        raise HTTPException(status_code=500, detail="Failed to update notification")
    finally:
        conn.close()


# --- PROGRESS CARD ENDPOINTS ---
def _resolve_progress_student_id(conn, student_id: str) -> str:
    requested_id = (student_id or "").strip()
    if not requested_id:
        return requested_id

    direct = conn.execute(
        "SELECT id FROM students WHERE id = ? AND role = 'Student'",
        (requested_id,)
    ).fetchone()
    if direct:
        return direct["id"]

    alias_candidates = STUDENT_LOGIN_ALIASES.get(requested_id.lower())
    if alias_candidates:
        if isinstance(alias_candidates, str):
            alias_candidates = (alias_candidates,)
        for candidate in alias_candidates:
            row = conn.execute(
                "SELECT id FROM students WHERE id = ? AND role = 'Student'",
                (candidate,)
            ).fetchone()
            if row:
                return row["id"]

    return requested_id

@app.get("/api/progress-card/my", response_model=ProgressCardResponse)
async def get_my_progress_card(x_user_id: str = Header(None, alias="X-User-Id")):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing user.")

    conn = get_db_connection()
    try:
        user = conn.execute(
            "SELECT id, role FROM students WHERE LOWER(id) = LOWER(?)",
            (x_user_id,)
        ).fetchone()

        if not user:
            alias_candidates = STUDENT_LOGIN_ALIASES.get((x_user_id or "").strip().lower())
            if alias_candidates:
                if isinstance(alias_candidates, str):
                    alias_candidates = (alias_candidates,)
                for candidate in alias_candidates:
                    user = conn.execute(
                        "SELECT id, role FROM students WHERE LOWER(id) = LOWER(?)",
                        (candidate,)
                    ).fetchone()
                    if user:
                        x_user_id = user["id"]
                        break
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        role = (user["role"] or "").strip()
        if role == "Student":
            target_student_id = user["id"]
        elif role in ("Parent", "Parent_Guardian"):
            user_email_row = conn.execute("SELECT email, name FROM students WHERE id = ?", (x_user_id,)).fetchone()
            user_email = user_email_row["email"] if user_email_row and user_email_row["email"] else ""
            user_name = user_email_row["name"] if user_email_row and user_email_row["name"] else ""
            
            child = conn.execute(
                "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                (x_user_id,)
            ).fetchone()
            
            if not child and user_email:
                child = conn.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (user_email,)
                ).fetchone()

            if not child and x_user_id in PARENT_OTP_EMAIL_OVERRIDES:
                child = conn.execute(
                    "SELECT student_id FROM guardians WHERE LOWER(email) = LOWER(?) ORDER BY id DESC LIMIT 1",
                    (PARENT_OTP_EMAIL_OVERRIDES[x_user_id],)
                ).fetchone()
                
            if not child and user_name:
                like_name = f"%{user_name}%"
                child = conn.execute(
                    "SELECT student_id FROM guardians WHERE name LIKE ? ORDER BY id DESC LIMIT 1",
                    (like_name,)
                ).fetchone()
                
            if not child:
                if x_user_id.startswith("parent_"):
                    fallback_id = x_user_id.replace("parent_", "student_")
                    child = conn.execute("SELECT id as student_id FROM students WHERE role='Student' AND id=?", (fallback_id,)).fetchone()
                    
            if not child:
                child = conn.execute("SELECT student_id FROM guardians ORDER BY id DESC LIMIT 1").fetchone()

            if not child:
                raise HTTPException(status_code=404, detail="No linked student found for parent.")
            target_student_id = child["student_id"]
        else:
            raise HTTPException(status_code=403, detail="Only student/parent can use this endpoint.")
    finally:
        conn.close()

    return await get_progress_card(target_student_id, x_user_id)

@app.get("/api/progress-card/{student_id}", response_model=ProgressCardResponse)
async def get_progress_card(student_id: str, x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        resolved_student_id = _resolve_progress_student_id(conn, student_id)
        # Resolve student
        student = conn.execute(
            "SELECT id, name, grade, school_id, attendance_rate FROM students WHERE id = ? AND role = 'Student'",
            (resolved_student_id,)
        ).fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found.")

        # Basic access control: same school unless super admin
        requester_role = None
        if x_user_id:
            requester = conn.execute(
                "SELECT school_id, is_super_admin, role FROM students WHERE id = ?",
                (x_user_id,)
            ).fetchone()
            if not requester:
                raise HTTPException(status_code=403, detail="Unauthorized.")
            requester_role = requester["role"]
            if not requester["is_super_admin"] and requester["school_id"] != student["school_id"]:
                raise HTTPException(status_code=403, detail="Access denied for this school.")

        published_only = requester_role in ('Student', 'Parent', 'Parent_Guardian')

        # Academics: subject averages + overall
        subject_query = """
            SELECT subject,
                   AVG(CASE WHEN max_marks > 0 THEN (marks_obtained * 100.0) / max_marks ELSE NULL END) AS avg_pct
            FROM student_marks
            WHERE student_id = ?
        """
        if published_only:
            subject_query += " AND published = 1"
        subject_query += " GROUP BY subject ORDER BY subject"
        subject_rows = conn.execute(subject_query, (resolved_student_id,)).fetchall()
        subjects = [{"subject": r["subject"], "avg_pct": round(r["avg_pct"] or 0, 1)} for r in subject_rows]

        overall_query = """
            SELECT AVG(CASE WHEN max_marks > 0 THEN (marks_obtained * 100.0) / max_marks ELSE NULL END) AS avg_pct
            FROM student_marks
            WHERE student_id = ?
        """
        if published_only:
            overall_query += " AND published = 1"
        overall_row = conn.execute(overall_query, (resolved_student_id,)).fetchone()
        overall_avg = round(overall_row["avg_pct"] or 0, 1)

        # Trend: compare latest two exam dates
        trend_query = """
            SELECT date,
                   AVG(CASE WHEN max_marks > 0 THEN (marks_obtained * 100.0) / max_marks ELSE NULL END) AS avg_pct
            FROM student_marks
            WHERE student_id = ?
        """
        if published_only:
            trend_query += " AND published = 1"
        trend_query += " GROUP BY date ORDER BY date DESC LIMIT 2"
        trend_rows = conn.execute(trend_query, (resolved_student_id,)).fetchall()
        trend = "na"
        if len(trend_rows) == 2:
            latest = trend_rows[0]["avg_pct"] or 0
            previous = trend_rows[1]["avg_pct"] or 0
            if latest - previous > 2:
                trend = "up"
            elif previous - latest > 2:
                trend = "down"
            else:
                trend = "flat"

        # Attendance
        cutoff_30 = (datetime.now() - timedelta(days=30)).date().isoformat()
        absent_row = conn.execute("""
            SELECT COUNT(*) AS cnt
            FROM student_attendance
            WHERE student_id = ? AND date >= ? AND status = 'Absent'
        """, (resolved_student_id, cutoff_30)).fetchone()
        absent_last_30 = int(absent_row["cnt"] or 0)

        # Engagement: assignments
        assignments_due_row = conn.execute("""
            SELECT COUNT(DISTINCT a.id) AS cnt
            FROM assignments a
            JOIN group_members gm ON gm.group_id = a.group_id
            WHERE gm.student_id = ?
        """, (resolved_student_id,)).fetchone()
        assignments_due = int(assignments_due_row["cnt"] or 0)

        assignments_submitted_row = conn.execute("""
            SELECT COUNT(*) AS cnt
            FROM assignment_submissions
            WHERE student_id = ?
        """, (resolved_student_id,)).fetchone()
        assignments_submitted = int(assignments_submitted_row["cnt"] or 0)

        # Engagement: quizzes
        quiz_row = conn.execute("""
            SELECT COUNT(*) AS cnt, AVG(score) AS avg_score
            FROM quiz_attempts
            WHERE student_id = ?
        """, (resolved_student_id,)).fetchone()
        quizzes_attempted = int(quiz_row["cnt"] or 0)
        avg_quiz_score = round(quiz_row["avg_score"] or 0, 1)

        # Engagement: activities (last 30 days + active days last 7)
        cutoff_7 = (datetime.now() - timedelta(days=7)).date().isoformat()
        activities_30_row = conn.execute("""
            SELECT COUNT(*) AS cnt
            FROM activities
            WHERE student_id = ? AND date >= ?
        """, (resolved_student_id, cutoff_30)).fetchone()
        activities_last_30 = int(activities_30_row["cnt"] or 0)

        active_days_row = conn.execute("""
            SELECT COUNT(DISTINCT date) AS cnt
            FROM activities
            WHERE student_id = ? AND date >= ?
        """, (resolved_student_id, cutoff_7)).fetchone()
        active_days_last_7 = int(active_days_row["cnt"] or 0)

        # Latest remarks
        remarks_query = """
            SELECT remarks
            FROM student_marks
            WHERE student_id = ? AND remarks IS NOT NULL AND remarks != ''
        """
        if published_only:
            remarks_query += " AND published = 1"
        remarks_query += " ORDER BY date DESC LIMIT 1"
        remarks_row = conn.execute(remarks_query, (resolved_student_id,)).fetchone()
        latest_remarks = remarks_row["remarks"] if remarks_row else None

        # Recent marks
        recent_query = """
            SELECT subject, exam_name, marks_obtained, max_marks, grade, date
            FROM student_marks
            WHERE student_id = ?
        """
        if published_only:
            recent_query += " AND published = 1"
        recent_query += " ORDER BY date DESC, id DESC"
        recent_rows = conn.execute(recent_query, (resolved_student_id,)).fetchall()
        recent_marks = [dict(r) for r in recent_rows]

        # Alerts
        alerts = []
        if (student["attendance_rate"] or 0) < 75:
            alerts.append("Low attendance (< 75%)")
        if overall_avg > 0 and overall_avg < 60:
            alerts.append("Average score below 60%")
        missing_assignments = max(0, assignments_due - assignments_submitted)
        if missing_assignments > 0:
            alerts.append(f"{missing_assignments} missing assignment(s)")
        if quizzes_attempted > 0 and avg_quiz_score < 50:
            alerts.append("Low quiz average (< 50%)")

        return {
            "student": {
                "id": student["id"],
                "name": student["name"],
                "grade": student["grade"]
            },
            "academics": {
                "overall_avg": overall_avg,
                "subjects": subjects,
                "trend": trend
            },
            "attendance": {
                "rate": round(student["attendance_rate"] or 0, 1),
                "absent_last_30": absent_last_30
            },
            "engagement": {
                "assignments_submitted": assignments_submitted,
                "assignments_due": assignments_due,
                "quizzes_attempted": quizzes_attempted,
                "avg_quiz_score": avg_quiz_score,
                "activities_last_30": activities_last_30,
                "active_days_last_7": active_days_last_7
            },
            "alerts": alerts,
            "recent_marks": recent_marks,
            "remarks": latest_remarks
        }
    finally:
        conn.close()

# --- QUESTION BANK MODULE ---

class QuestionBankResponse(BaseModel):
    id: int
    title: str
    file_path: str
    uploaded_by: str
    created_at: str
    school_id: int

@app.post("/api/question-bank/upload")
async def upload_question_bank(
    file: UploadFile = File(...), 
    title: str = Form(...), 
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="User Identity Missing")
        
    conn = get_db_connection()
    try:
        # Check if user is teacher or admin
        user = conn.execute("SELECT role, school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user or user['role'] not in ['Teacher', 'Tenant_Admin', 'Principal', 'Admin']:
             raise HTTPException(status_code=403, detail="Only teachers can upload question banks.")
             
        school_id = user['school_id'] if user['school_id'] else 1
        
        # Save File
        upload_dir = os.path.join(STATIC_DIR, "uploads", "question_banks")
        os.makedirs(upload_dir, exist_ok=True)
        
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Store relative path for serving
        relative_path = f"/static/uploads/question_banks/{unique_filename}"
        created_at = datetime.now().isoformat()
        
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO question_banks (title, file_path, uploaded_by, created_at, school_id)
            VALUES (?, ?, ?, ?, ?)
        """, (title, relative_path, x_user_id, created_at, school_id))
        
        bank_id = cursor.lastrowid
        conn.commit()
        
        return {
            "id": bank_id,
            "title": title,
            "file_path": relative_path,
            "uploaded_by": x_user_id,
            "created_at": created_at,
            "school_id": school_id
        }
        
    except Exception as e:
        logger.error(f"Question Bank Upload Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/question-bank", response_model=List[QuestionBankResponse])
async def get_question_banks(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        # Get user's school
        school_id = 1
        if x_user_id:
             user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
             if user and user['school_id']:
                 school_id = user['school_id']
        
        rows = conn.execute("SELECT * FROM question_banks WHERE school_id = ? ORDER BY created_at DESC", (school_id,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()

# --- PDF EXAM MODULE ---

@app.post("/api/exams/create-pdf")
async def create_pdf_exam(
    file: UploadFile = File(...), 
    title: str = Form(...),
    time_limit: int = Form(...),
    group_id: int = Form(None),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="User Identity Missing")

    conn = get_db_connection()
    try:
        # Verify Teacher
        user = conn.execute("SELECT role, school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
        if not user or user['role'] not in ['Teacher', 'Tenant_Admin', 'Principal', 'Admin']:
             raise HTTPException(status_code=403, detail="Only teachers can create exams.")
        
        school_id = user['school_id'] if user['school_id'] else 1

        # Upload PDF
        upload_dir = os.path.join(STATIC_DIR, "uploads", "exams", "questions")
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        relative_path = f"/static/uploads/exams/questions/{unique_filename}"
        
        # Insert into Quizzes Table
        cursor = conn.cursor()
        created_at = datetime.now().isoformat()
        
        # Use a default group if none selected (e.g. 0 or NULL handled by logic)
        target_group = group_id if group_id else 1 

        cursor.execute("""
            INSERT INTO quizzes (
                title, group_id, questions, created_at, time_limit_mins, 
                target_type, exam_type, file_path
            ) VALUES (?, ?, 'PDF_EXAM', ?, ?, 'group', 'pdf', ?)
        """, (title, target_group, created_at, time_limit, relative_path))
        
        exam_id = cursor.lastrowid
        conn.commit()
        
        return {"id": exam_id, "message": "PDF Exam Created Successfully"}
        
    except Exception as e:
        logger.error(f"Exam Create Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/api/exams/submit-pdf")
async def submit_pdf_exam(
    file: UploadFile = File(...),
    exam_id: int = Form(...),
    x_user_id: str = Header(None, alias="X-User-Id")
):
    if not x_user_id:
        raise HTTPException(status_code=400, detail="User Identity Missing")
        
    conn = get_db_connection()
    try:
        # Check if already submitted
        existing = conn.execute("SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?", (exam_id, x_user_id)).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="You have already submitted this exam.")
            
        # Upload Answer Sheet
        upload_dir = os.path.join(STATIC_DIR, "uploads", "exams", "submissions")
        os.makedirs(upload_dir, exist_ok=True)
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{x_user_id}_{exam_id}_{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        relative_path = f"/static/uploads/exams/submissions/{unique_filename}"
        
        # Record Attempt
        cursor = conn.cursor()
        submitted_at = datetime.now().isoformat()
        
        cursor.execute("""
            INSERT INTO quiz_attempts (
                quiz_id, student_id, score, answers, submitted_at, submission_file_path
            ) VALUES (?, ?, 0, 'PDF_SUBMISSION', ?, ?)
        """, (exam_id, x_user_id, submitted_at, relative_path))
        
        conn.commit()
        return {"message": "Exam submitted successfully"}
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Exam Submission Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/exams/student/list")
async def get_student_exams(x_user_id: str = Header(None, alias="X-User-Id")):
    conn = get_db_connection()
    try:
        # Ideally filter by group enrollments. For now, fetch all active exams.
        # Check submitted status
        school_id = 1
        # Get School ID
        if x_user_id:
             user = conn.execute("SELECT school_id FROM students WHERE id = ?", (x_user_id,)).fetchone()
             if user and user['school_id']:
                 school_id = user['school_id']

        exams = conn.execute("""
            SELECT q.*, 
            CASE WHEN qa.id IS NOT NULL THEN 1 ELSE 0 END as submitted
            FROM quizzes q
            LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.student_id = ?
            WHERE q.exam_type = 'pdf'
            ORDER BY q.created_at DESC
        """, (x_user_id,)).fetchall()
        
        return [dict(row) for row in exams]
    finally:
        conn.close()

if __name__ == "__main__":
    try:
        initialize_db()
        print("Database initialized successfully.")
    except Exception as e:
        print(f"Error initializing database: {e}")
    import uvicorn
    # Keep reload OFF by default for stability (watchfiles reload has been crashing in this environment).
    # Set BACKEND_RELOAD=true explicitly if hot reload is needed.
    reload_enabled = os.getenv("BACKEND_RELOAD", "false").lower() == "true"
    backend_host = os.getenv("BACKEND_HOST", "127.0.0.1")
    backend_port = int(os.getenv("BACKEND_PORT", "8000"))
    try:
        uvicorn.run(app, host=backend_host, port=backend_port, reload=reload_enabled)
    except OSError as e:
        if "Address already in use" in str(e) or "address already in use" in str(e):
            print(f"[Startup Error] Port {backend_port} is already in use. Stop the old process or set BACKEND_PORT to another port.")
        raise
