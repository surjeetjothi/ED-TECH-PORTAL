import uuid
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text

Base = declarative_base()

class School(Base):
    __tablename__ = "schools"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[str] = mapped_column(String)
    contact_email: Mapped[str] = mapped_column(String)

class Student(Base):
    __tablename__ = "students"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    grade: Mapped[str] = mapped_column(String, nullable=True)
    preferred_subject: Mapped[str] = mapped_column(String, nullable=True)
    attendance_rate: Mapped[float] = mapped_column(Float, default=100.0)
    home_language: Mapped[str] = mapped_column(String, nullable=True)
    math_score: Mapped[float] = mapped_column(Float, default=0.0)
    science_score: Mapped[float] = mapped_column(Float, default=0.0)
    english_language_score: Mapped[float] = mapped_column(Float, default=0.0)
    role: Mapped[str] = mapped_column(String, default="Student")
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=True)
    # Auth fields
    password: Mapped[str] = mapped_column(String, nullable=True)
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[str] = mapped_column(String, nullable=True)
    email_verification_token: Mapped[str] = mapped_column(String, nullable=True)
    email_verification_expires_at: Mapped[str] = mapped_column(String, nullable=True)

class Activity(Base):
    __tablename__ = "activities"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String)
    topic: Mapped[str] = mapped_column(String)
    difficulty: Mapped[str] = mapped_column(String)
    score: Mapped[float] = mapped_column(Float)
    time_spent_min: Mapped[int] = mapped_column(Integer)

class Group(Base):
    __tablename__ = "groups"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    subject: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id"), nullable=True)

class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    title: Mapped[str] = mapped_column(String)
    due_date: Mapped[str] = mapped_column(String)
    points: Mapped[int] = mapped_column(Integer)

class Submission(Base):
    __tablename__ = "submissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"))
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"))
    content: Mapped[str] = mapped_column(Text)
    grade: Mapped[float] = mapped_column(Float, nullable=True)

class Guardian(Base):
    __tablename__ = "guardians"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"))
    name: Mapped[str] = mapped_column(String)
    relationship: Mapped[str] = mapped_column(String)
    phone: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, nullable=True)

class HealthRecord(Base):
    __tablename__ = "health_records"
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), primary_key=True)
    blood_group: Mapped[str] = mapped_column(String, nullable=True)
    allergies: Mapped[str] = mapped_column(String, nullable=True)
    medical_conditions: Mapped[str] = mapped_column(String, nullable=True)
    medications: Mapped[str] = mapped_column(String, nullable=True)

class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    head_of_department_id: Mapped[str] = mapped_column(String, nullable=True)

class Staff(Base):
    __tablename__ = "staff"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), nullable=True)
    position_title: Mapped[str] = mapped_column(String, nullable=True)
    joining_date: Mapped[str] = mapped_column(String, nullable=True)
