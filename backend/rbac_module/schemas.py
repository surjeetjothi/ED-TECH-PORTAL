from datetime import datetime

from pydantic import BaseModel, Field

from .models import UserRole


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole


class UserOut(BaseModel):
    id: int
    email: str
    role: UserRole


class StudentCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8)
    school_id: int


class StudentEmailUpdateRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class StudentPasswordUpdateRequest(BaseModel):
    password: str = Field(min_length=8)


class StudentOut(BaseModel):
    id: int
    full_name: str
    email: str
    school_id: int


class SchoolCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8)


class SchoolActivateRequest(BaseModel):
    school_email: str = Field(min_length=5, max_length=255)
    otp: str = Field(min_length=4, max_length=10)


class SchoolOut(BaseModel):
    id: int
    name: str
    email: str
    is_active: bool
    created_at: datetime


class RoleRouteResponse(BaseModel):
    message: str
    acting_role: UserRole
