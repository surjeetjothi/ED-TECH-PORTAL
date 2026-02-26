import logging
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from app.core.config import DATABASE_URL, USE_POSTGRES
from app.models.domain import Base

logger = logging.getLogger(__name__)

if USE_POSTGRES and "postgres" in DATABASE_URL.lower():
    ASYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
elif USE_POSTGRES:
    raise ValueError("System is configured to use PostgreSQL (USE_POSTGRES=true), but a valid PostgreSQL DATABASE_URL was not provided. Refusing to fall back to ephemeral SQLite.")
else:
    # If forced offline by config, use SQLite fallback (also making it async with aiosqlite, though usually you just want postgres strictly)
    sqlite_db_path = os.getenv("DATABASE_URL", "class_bridge.db").strip().replace("sqlite:///", "")
    ASYNC_DB_URL = f"sqlite+aiosqlite:///{sqlite_db_path}"

# Create the Engine with connection pooling settings suitable for Gunicorn Workers
try:
    if "sqlite" in ASYNC_DB_URL:
        # SQLite doesn't use standard connection pooling tuning
        engine = create_async_engine(ASYNC_DB_URL, echo=False)
    else:
        engine = create_async_engine(
            ASYNC_DB_URL,
            echo=False,
            future=True,
            pool_size=10,        # 10 connections per Gunicorn worker process
            max_overflow=20,     # Allow up to 20 additional connections under heavy burst load
            pool_recycle=1800,   # Recycle connections after 30 minutes to prevent stale drops
            pool_pre_ping=True,  # Check if connection is alive before checking out of pool
            connect_args={
                "prepared_statement_cache_size": 0,
                "statement_cache_size": 0
            }
        )
    
    # Create the Session Factory
    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
except Exception as e:
    logger.error(f"Failed to initialize Async SQLAlchemy Engine: {e}")
    raise e

async def get_db():
    """
    FastAPI Dependency to yield a database session per request.
    It automatically closes the session (returning connection to the pool) after request completion.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            raise
        finally:
            await session.close()
            
async def initialize_db_schema():
    """
    Utility to initialize the database schema (create tables) using the domain Base.
    Recommended to run as part of the FastAPI lifespan event.
    """
    async with engine.begin() as conn:
        # If running Postgres, you'd usually use Alembic for migrations instead of create_all
        # But for startup consistency based on the Base models:
        await conn.run_sync(Base.metadata.create_all)

# --- Phase 1 Legacy Adapters (For unmigrated routes in backend.py) ---
import psycopg2
import psycopg2.extras
import sqlite3

class PostgresCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
    def execute(self, query, params=()):
        q = query.replace("?", "%s")
        self.cursor.execute(q, params)
        return self
    def fetchone(self):
        return self.cursor.fetchone()
    def fetchall(self):
        return self.cursor.fetchall()
    def close(self):
        self.cursor.close()

class PostgresConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
    def cursor(self):
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor))
    def execute(self, query, params=()):
        c = self.cursor()
        c.execute(query, params)
        return c
    def commit(self):
        self.conn.commit()
    def rollback(self):
        self.conn.rollback()
    def close(self):
        self.conn.close()

from psycopg2 import pool
PG_POOL = None

class PooledPostgresConnectionWrapper(PostgresConnectionWrapper):
    def close(self):
        if PG_POOL:
            PG_POOL.putconn(self.conn)
        else:
            self.conn.close()

def get_db_connection():
    global PG_POOL
    if USE_POSTGRES and "postgres" in DATABASE_URL.lower():
        pg_url = DATABASE_URL.replace("postgres://", "postgresql://", 1) if DATABASE_URL.startswith("postgres://") else DATABASE_URL
        if PG_POOL is None:
            try:
                PG_POOL = pool.ThreadedConnectionPool(1, 20, pg_url)
            except Exception as e:
                raise ValueError(f"Failed to initialize PostgreSQL connection pool: {e}")
        try:
            conn = PG_POOL.getconn()
            return PooledPostgresConnectionWrapper(conn)
        except Exception as e:
            raise ValueError(f"Failed to get connection from PostgreSQL pool: {e}")
    elif USE_POSTGRES:
        raise ValueError("System is configured to use PostgreSQL (USE_POSTGRES=true), but a valid PostgreSQL DATABASE_URL was not provided. Refusing to fall back to ephemeral SQLite.")
    else:
        sqlite_db_path = os.getenv("DATABASE_URL", "class_bridge.db").strip().replace("sqlite:///", "")
        conn = sqlite3.connect(sqlite_db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
