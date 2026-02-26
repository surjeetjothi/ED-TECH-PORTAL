from app.core.config import DATABASE_URL, USE_POSTGRES
print(f"USE_POSTGRES config: {USE_POSTGRES}")
print(f"DATABASE_URL config: {DATABASE_URL}")

from app.core.database import get_db_connection
conn = get_db_connection()
print(f"Connection class: {type(conn).__name__}")
