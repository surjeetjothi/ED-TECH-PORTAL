import re

with open("app/routers/auth.py", "r") as f:
    content = f.read()

imports = """
from app.models.schemas import (
    LoginResponse, LoginRequest, Verify2FARequest, RegisterRequest,
    GenericSocialRequest, ForgotPasswordRequest, ResetPasswordRequest
)
from backend import (
    log_auth_event, validate_password_strength, normalize_and_validate_email,
    normalize_registration_role, send_verification_email
)
"""

if "from app.models.schemas import" not in content:
    idx = content.find("logger = logging.getLogger(__name__)")
    new_content = content[:idx] + imports + "\n" + content[idx:]
    with open("app/routers/auth.py", "w") as f:
        f.write(new_content)
