import os
import logging

logger = logging.getLogger(__name__)

# --- DATABASE CONFIG ---
USE_POSTGRES = os.getenv("USE_POSTGRES", "false").lower() == "true"
DATABASE_URL_ENV = os.getenv("DATABASE_URL", "class_bridge.db")

if USE_POSTGRES and (not DATABASE_URL_ENV or "postgres" not in DATABASE_URL_ENV.lower()):
    logger.error("System is configured to use PostgreSQL (USE_POSTGRES=true), but a valid PostgreSQL DATABASE_URL was not provided. Falling back to default SQLite for diagnostics.")
    USE_POSTGRES = False
    DATABASE_URL = "class_bridge.db"
else:
    DATABASE_URL = DATABASE_URL_ENV

# --- SQLITE CONFIG ---
sqlite_candidate = (DATABASE_URL_ENV or "class_bridge.db").strip()
if sqlite_candidate.startswith("sqlite:///"):
    sqlite_candidate = sqlite_candidate.replace("sqlite:///", "", 1)
if not sqlite_candidate or "postgres" in sqlite_candidate.lower():
    sqlite_candidate = "class_bridge.db"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SQLITE_DB_PATH = sqlite_candidate if os.path.isabs(sqlite_candidate) else os.path.join(BASE_DIR, sqlite_candidate)

IS_PRODUCTION = os.getenv("RENDER") == "true" or (USE_POSTGRES and "postgres" in (DATABASE_URL_ENV or "").lower())

REDIS_URL = os.getenv("REDIS_URL")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# --- EMAIL CONFIGURATION ---
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "your-email@gmail.com") 
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "your-app-password").replace(" ", "")

VERIFICATION_LINK_BASE = os.getenv("VERIFICATION_LINK_BASE", "http://localhost:8000")
VERIFICATION_TOKEN_TTL_HOURS = int(os.getenv("VERIFICATION_TOKEN_TTL_HOURS", "24"))

# --- DEFAULT ACCOUNTS ---
TEACHER_LOGIN_ALIAS = os.getenv("TEACHER_LOGIN_ALIAS", "teachernoblenexus@gmail.com")
TEACHER_LOGIN_PASSWORD = os.getenv("TEACHER_LOGIN_PASSWORD", "Teacher@123")

ADMIN_LOGIN_EMAIL = os.getenv("ADMIN_LOGIN_EMAIL", "info@noblenexus-ie.com")
ADMIN_LOGIN_PASSWORD = os.getenv("ADMIN_LOGIN_PASSWORD", "KingCross@17")
ROOT_ADMIN_LOGIN_EMAIL = ADMIN_LOGIN_EMAIL
ROOT_ADMIN_LOGIN_PASSWORD = ADMIN_LOGIN_PASSWORD

ALLOW_OTP_CONSOLE_FALLBACK = os.getenv("ALLOW_OTP_CONSOLE_FALLBACK", str(not IS_PRODUCTION).lower()).lower() == "true"

STUDENT_LOGIN_ALIASES = {
    os.getenv("STUDENT1_GRADE1_EMAIL", "student1grade1@gmail.com"): ("student_g1_1", "p_student_g1_1", os.getenv("STUDENT1_GRADE1_EMAIL", "student1grade1@gmail.com")),
}
STUDENT_PASSWORD_OVERRIDES = {
    "student_g1_1": os.getenv("STUDENT_G1_1_PASSWORD", "Sur444@444"),
    "p_student_g1_1": os.getenv("STUDENT_G1_1_PASSWORD", "Sur444@444"),
    os.getenv("STUDENT1_GRADE1_EMAIL", "student1grade1@gmail.com"): os.getenv("STUDENT_G1_1_PASSWORD", "Sur444@444"),
}
STUDENT_OTP_EMAIL_OVERRIDES = {
    "student_g1_1": os.getenv("STUDENT1_GRADE1_EMAIL", "student1grade1@gmail.com"),
    "p_student_g1_1": os.getenv("STUDENT1_GRADE1_EMAIL", "student1grade1@gmail.com"),
}
PARENT_LOGIN_ALIASES = {
    os.getenv("PARENT1_EMAIL", "theclassiccrew.careers@gmail.com"): ("parent_g1_1", os.getenv("PARENT1_EMAIL", "theclassiccrew.careers@gmail.com")),
}
PARENT_PASSWORD_OVERRIDES = {
    "parent_g1_1": os.getenv("PARENT_G1_1_PASSWORD", "ethi444@ethi"),
    os.getenv("PARENT1_EMAIL", "theclassiccrew.careers@gmail.com"): os.getenv("PARENT_G1_1_PASSWORD", "ethi444@ethi"),
}
PARENT_OTP_EMAIL_OVERRIDES = {
    "parent_g1_1": os.getenv("PARENT1_EMAIL", "theclassiccrew.careers@gmail.com"),
}

