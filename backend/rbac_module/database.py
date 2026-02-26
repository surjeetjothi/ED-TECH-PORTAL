import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "class_bridge.db")
# Prefer main project database settings
DATABASE_URL_RAW = os.getenv("DATABASE_URL", f"sqlite:///{DB_PATH}")
USE_POSTGRES = os.getenv("USE_POSTGRES", "false").lower() == "true"

if USE_POSTGRES and "postgres" in DATABASE_URL_RAW.lower():
    # Ensure postgresql:// prefix for SQLAlchemy
    if DATABASE_URL_RAW.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL_RAW.replace("postgres://", "postgresql://", 1)
    else:
        DATABASE_URL = DATABASE_URL_RAW
else:
    # Use SQLite
    sqlite_path = DATABASE_URL_RAW
    if sqlite_path.startswith("sqlite:///"):
        DATABASE_URL = sqlite_path
    else:
        DATABASE_URL = f"sqlite:///{sqlite_path}"

_engine = None
_SessionLocal = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, future=True)
    return _engine

def get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, future=True)
    return _SessionLocal

Base = declarative_base()


def get_db_session():
    db = get_session_local()()
    try:
        yield db
    finally:
        db.close()
