import logging
import os
import time
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from fastapi import HTTPException
from app.core.config import DATABASE_URL, USE_POSTGRES
from app.models.domain import Base

logger = logging.getLogger(__name__)

if USE_POSTGRES and (not DATABASE_URL or "postgres" not in DATABASE_URL.lower()):
    logger.error("System is configured to use PostgreSQL (USE_POSTGRES=true), but a valid PostgreSQL DATABASE_URL was not provided. Falling back to default SQLite for diagnostics.")
    USE_POSTGRES = False
    ASYNC_DB_URL = "sqlite+aiosqlite:///class_bridge.db"
elif USE_POSTGRES:
    ASYNC_DB_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
else:
    # If forced offline by config, use SQLite fallback (also making it async with aiosqlite, though usually you just want postgres strictly)
    sqlite_db_path = os.getenv("DATABASE_URL", "class_bridge.db").strip().replace("sqlite:///", "")
    ASYNC_DB_URL = f"sqlite+aiosqlite:///{sqlite_db_path}"

# Create the Engine with connection pooling settings suitable for Gunicorn Workers
engine = None
AsyncSessionLocal = None
try:
    if "sqlite" in ASYNC_DB_URL:
        # SQLite doesn't use standard connection pooling tuning
        engine = create_async_engine(ASYNC_DB_URL, echo=False)
    else:
        engine = create_async_engine(
            ASYNC_DB_URL,
            echo=False,
            future=True,
            pool_size=5,        # Reduced for Render Free Tier (1 worker = 5-10 connections)
            max_overflow=10,
            pool_recycle=1800,
            pool_pre_ping=True,
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
    # We allow the module to load even if engine fails, so we can see logs
    engine = None
    AsyncSessionLocal = None

async def get_db():
    """
    FastAPI Dependency to yield a database session per request.
    It automatically closes the session (returning connection to the pool) after request completion.
    """
    if AsyncSessionLocal is None:
        raise HTTPException(status_code=500, detail="Database engine not initialized. Check logs.")
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
    if engine is None:
        logger.error("Cannot initialize DB: Engine is None")
        return

    # Smart check: If schools table exists, skip create_all
    try:
        async with engine.connect() as conn:
            # Use a short timeout for the check (if supported by driver, e.g., asyncpg)
            await conn.execute(text("SELECT 1 FROM schools LIMIT 1"))
            logger.info("Database schema already exists, skipping create_all.")
            return
    except Exception:
        logger.info("Database schema not found or inaccessible, proceeding with create_all.")

    try:
        async with engine.begin() as conn:
            # For PostgreSQL, set statement_timeout.
            if USE_POSTGRES:
                await conn.execute(text("SET statement_timeout = 30000")) # 30 seconds
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        logger.error(f"Failed to initialize database schema: {e}")

# --- Phase 1 Legacy Adapters (For unmigrated routes in backend.py) ---
# We move these imports inside the wrapper or make them lazy to prevent module-level crashes
PG_POOL = None

class PostgresCursorWrapper:
    def __init__(self, cursor, owner=None):
        self.cursor = cursor
        self.owner = owner
    def execute(self, query, params=()):
        import psycopg2

        q = query.replace("?", "%s")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                if params is None:
                    self.cursor.execute(q)
                else:
                    self.cursor.execute(q, params)
                return self
            except psycopg2.OperationalError as e:
                if attempt < max_retries - 1:
                    time.sleep(0.5)
                    try:
                        if self.owner is not None:
                            self.owner.reconnect()
                            self.cursor = self.owner._new_raw_cursor()
                    except Exception:
                        pass
                else:
                    raise e
    def executemany(self, query, param_list):
        import psycopg2

        q = query.replace("?", "%s")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                self.cursor.executemany(q, param_list)
                return self
            except psycopg2.OperationalError as e:
                if attempt < max_retries - 1:
                    time.sleep(0.5)
                    try:
                        if self.owner is not None:
                            self.owner.reconnect()
                            self.cursor = self.owner._new_raw_cursor()
                    except Exception:
                        pass
                else:
                    raise e
    def fetchone(self):
        return self.cursor.fetchone()
    def fetchall(self):
        return self.cursor.fetchall()
    def close(self):
        self.cursor.close()
    @property
    def description(self):
        return self.cursor.description
    @property
    def rowcount(self):
        return self.cursor.rowcount
    @property
    def lastrowid(self):
        return self.cursor.lastrowid

class PostgresConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn
    def _new_raw_cursor(self):
        import psycopg2.extras
        return self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    def cursor(self):
        return PostgresCursorWrapper(self._new_raw_cursor(), owner=self)
    def execute(self, query, params=()):
        c = self.cursor()
        c.execute(query, params)
        return c
    def reconnect(self):
        import psycopg2

        old_dsn = getattr(self.conn, "dsn", None)
        try:
            self.conn.close()
        except Exception:
            pass
        if old_dsn:
            self.conn = psycopg2.connect(old_dsn)
            return
        raise psycopg2.OperationalError("PostgreSQL reconnect failed: DSN unavailable")
    def commit(self):
        self.conn.commit()
    def rollback(self):
        self.conn.rollback()
    def close(self):
        self.conn.close()
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            try:
                self.rollback()
            except:
                pass
        self.close()

class PooledPostgresConnectionWrapper(PostgresConnectionWrapper):
    def reconnect(self):
        if not PG_POOL:
            return super().reconnect()
        try:
            PG_POOL.putconn(self.conn, close=True)
        except Exception:
            pass
        self.conn = PG_POOL.getconn()
    def close(self):
        if PG_POOL:
            PG_POOL.putconn(self.conn)
        else:
            self.conn.close()

def get_db_connection():
    global PG_POOL
    from app.core.config import DATABASE_URL, USE_POSTGRES

    def _sqlite_fallback():
        import sqlite3
        sqlite_candidate = os.getenv("DATABASE_URL", "class_bridge.db").strip()
        if sqlite_candidate.startswith("sqlite:///"):
            sqlite_candidate = sqlite_candidate.replace("sqlite:///", "", 1)
        if not sqlite_candidate or "postgres" in sqlite_candidate.lower():
            sqlite_candidate = "class_bridge.db"
        conn = sqlite3.connect(sqlite_candidate, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    if USE_POSTGRES and DATABASE_URL and "postgres" in DATABASE_URL.lower():
        pg_url = DATABASE_URL.replace("postgres://", "postgresql://", 1) if DATABASE_URL.startswith("postgres://") else DATABASE_URL
        if PG_POOL is None:
            try:
                from psycopg2 import pool
                # Use a smaller pool for local stability/Supabase free tier
                PG_POOL = pool.ThreadedConnectionPool(1, 3, pg_url)
            except Exception as e:
                logger.error(f"Failed to initialize PostgreSQL connection pool: {e}")
                logger.warning("Falling back to SQLite because PostgreSQL pool initialization failed.")
                return _sqlite_fallback()
        try:
            conn = PG_POOL.getconn()
            return PooledPostgresConnectionWrapper(conn)
        except Exception as e:
            logger.error(f"Failed to get connection from PostgreSQL pool: {e}")
            logger.warning("Falling back to SQLite because PostgreSQL connection checkout failed.")
            return _sqlite_fallback()
    else:
        try:
            return _sqlite_fallback()
        except Exception as e:
            logger.error(f"SQLite connection error: {e}")
            raise
