from sqlalchemy.orm import Session

from .database import Base, get_engine
from .routes import router
from .services import seed_default_users


def init_rbac_module() -> None:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    db = Session(bind=engine)
    try:
        seed_default_users(db)
    finally:
        db.close()


__all__ = ["router", "init_rbac_module"]
