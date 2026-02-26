import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
load_dotenv(dotenv_path=env_path, override=True)

DATABASE_URL_ENV = os.getenv("DATABASE_URL", "class_bridge.db")
USE_POSTGRES = os.getenv("USE_POSTGRES", "false").lower() == "true"
DATABASE_URL = DATABASE_URL_ENV

sqlite_candidate = (DATABASE_URL_ENV or "class_bridge.db").strip()

if USE_POSTGRES and "postgres" not in DATABASE_URL_ENV.lower():
    raise ValueError("System is configured to use PostgreSQL (USE_POSTGRES=true), but a valid PostgreSQL DATABASE_URL was not provided. Refusing to fall back to ephemeral SQLite.")

if sqlite_candidate.startswith("sqlite:///"):
    sqlite_candidate = "class_bridge.db"
SQLITE_DB_PATH = sqlite_candidate if os.path.isabs(sqlite_candidate) else os.path.join(os.path.dirname(os.path.abspath(__file__)), sqlite_candidate)

IS_PRODUCTION = os.getenv("RENDER") == "true" or (USE_POSTGRES and "postgres" in DATABASE_URL_ENV.lower())

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
TEACHER_LOGIN_ALIAS = os.getenv("TEACHER_LOGIN_ALIAS", "")
TEACHER_LOGIN_PASSWORD = os.getenv("TEACHER_LOGIN_PASSWORD", "")

ADMIN_LOGIN_EMAIL = os.getenv("ADMIN_LOGIN_EMAIL", "")
ADMIN_LOGIN_PASSWORD = os.getenv("ADMIN_LOGIN_PASSWORD", "")
ROOT_ADMIN_LOGIN_EMAIL = ADMIN_LOGIN_EMAIL
ROOT_ADMIN_LOGIN_PASSWORD = ADMIN_LOGIN_PASSWORD

ALLOW_OTP_CONSOLE_FALLBACK = os.getenv("ALLOW_OTP_CONSOLE_FALLBACK", str(not IS_PRODUCTION).lower()).lower() == "true"

STUDENT_LOGIN_ALIASES = {
    os.getenv("STUDENT1_GRADE1_EMAIL", ""): ("student_g1_1", "p_student_g1_1", os.getenv("STUDENT1_GRADE1_EMAIL", "")),
}
STUDENT_PASSWORD_OVERRIDES = {
    "student_g1_1": os.getenv("STUDENT_G1_1_PASSWORD", ""),
    "p_student_g1_1": os.getenv("STUDENT_G1_1_PASSWORD", ""),
    os.getenv("STUDENT1_GRADE1_EMAIL", ""): os.getenv("STUDENT_G1_1_PASSWORD", ""),
}
STUDENT_OTP_EMAIL_OVERRIDES = {
    "student_g1_1": os.getenv("STUDENT1_GRADE1_EMAIL", ""),
    "p_student_g1_1": os.getenv("STUDENT1_GRADE1_EMAIL", ""),
}
PARENT_LOGIN_ALIASES = {
    os.getenv("PARENT1_EMAIL", ""): ("parent_g1_1", os.getenv("PARENT1_EMAIL", "")),
}
PARENT_PASSWORD_OVERRIDES = {
    "parent_g1_1": os.getenv("PARENT_G1_1_PASSWORD", ""),
    os.getenv("PARENT1_EMAIL", ""): os.getenv("PARENT_G1_1_PASSWORD", ""),
}
PARENT_OTP_EMAIL_OVERRIDES = {
    "parent_g1_1": os.getenv("PARENT1_EMAIL", ""),
}
