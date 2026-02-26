import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(dotenv_path=env_path, override=True)
except ImportError:
    pass

@dataclass(frozen=True)
class Settings:
    jwt_secret: str = os.getenv("RBAC_JWT_SECRET", os.getenv("JWT_SECRET", ""))
    jwt_algorithm: str = os.getenv("RBAC_JWT_ALGORITHM", "HS256")
    jwt_exp_minutes: int = int(os.getenv("RBAC_JWT_EXP_MINUTES", "60"))
    otp_exp_minutes: int = int(os.getenv("RBAC_OTP_EXP_MINUTES", "10"))
    root_admin_email: str = os.getenv("ROOT_ADMIN_EMAIL", "")
    smtp_host: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_EMAIL", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")

    def __post_init__(self):
        from app.core.config import IS_PRODUCTION
        if IS_PRODUCTION and not self.jwt_secret:
            raise ValueError("JWT_SECRET environment variable is missing but required in Production!")
        if not self.jwt_secret:
            object.__setattr__(self, 'jwt_secret', 'change-me-in-production')


settings = Settings()
