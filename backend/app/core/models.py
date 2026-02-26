from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# --- 2. DATA MODELS ---

class LoginRequest(BaseModel):
    username: str
    password: str
    role: str = "Student" # Default to Student to avoid breaking legacy clients if any, though frontend always sends it now

class LoginResponse(BaseModel):
    success: bool = True
    user_id: str
    name: Optional[str] = None
    role: Optional[str] = None
    roles: List[str] = []
    permissions: List[str] = []
    requires_2fa: bool = False 
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    is_super_admin: bool = False 
    related_student_id: Optional[str] = None 
    email_masked: Optional[str] = None 
    security_mode: Optional[str] = None

class Verify2FARequest(BaseModel):
    user_id: str
    code: str

class AuthenticatorSetupRequest(BaseModel):
    user_id: str

class AddStudentRequest(BaseModel):
    id: str
    name: str
    grade: int
    preferred_subject: str
    attendance_rate: float
    home_language: str
    math_score: float
    science_score: float
    english_language_score: float
    password: str = "Student@123" 
    school_id: Optional[int] = 1

class StudentHistory(BaseModel):
    date: str
    topic: str
    difficulty: str
    score: float
    time_spent_min: int

class StudentSummary(BaseModel):
    avg_score: float
    total_activities: int
    recommendation: Optional[str] = None
    math_score: float
    science_score: float
    english_language_score: float
    roles: List[str] = []

class StudentDataResponse(BaseModel):
    summary: StudentSummary
    history: List[StudentHistory]

class TeacherOverviewResponse(BaseModel):
    total_students: int
    class_attendance_avg: float
    class_score_avg: float
    roster: List[Dict[str, Any]] 
    school_name: Optional[str] = None
    total_teachers: int = 0

class AIChatRequest(BaseModel):
    prompt: str

class AIChatResponse(BaseModel):
    reply: str

class GenerateQuizRequest(BaseModel):
    topic: str
    difficulty: str = "Medium"
    question_count: int = 5
    type: str = "Multiple Choice" # or "Short Answer"
    description: Optional[str] = None

class GenerateQuizResponse(BaseModel):
    content: str
    
class AddActivityRequest(BaseModel):
    student_id: str
    date: str
    topic: str
    difficulty: str
    score: float
    time_spent_min: int

class UpdateStudentRequest(BaseModel):
    name: str
    grade: int
    preferred_subject: str
    attendance_rate: float
    home_language: str
    math_score: float
    science_score: float
    english_language_score: float
    password: Optional[str] = None 
    school_id: Optional[int] = None
    roles: Optional[List[str]] = None

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    grade: Optional[int] = 9
    preferred_subject: Optional[str] = "General"
    role: str = "Student" 
    invitation_token: Optional[str] = None 
    school_id: Optional[int] = 1

class ClassScheduleRequest(BaseModel):
    topic: str
    date: str
    meet_link: str
    target_students: Optional[List[str]] = None

class ClassResponse(BaseModel):
    id: int
    teacher_id: str
    topic: str
    date: str
    meet_link: str
    target_students: List[str] 
    
class GroupCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    subject: str 

class MaterialCreateRequest(BaseModel):
    title: str
    type: str 
    content: str 

class SchoolCreateRequest(BaseModel):
    name: str
    address: str
    contact_email: str
    admin_password: Optional[str] = "Admin@123"
    subscription_plan: Optional[str] = "Basic"

class RootAdminStudentCreateRequest(BaseModel):
    name: str
    email: str
    password: str
    school_id: Optional[int] = 1
    role: Optional[str] = "Student"
    grade: Optional[int] = 1
    preferred_subject: Optional[str] = "General"
    home_language: Optional[str] = "English"

class RootAdminStudentEmailUpdateRequest(BaseModel):
    email: str

class RootAdminStudentPasswordUpdateRequest(BaseModel):
    password: str

class RootAdminSchoolCreateRequest(BaseModel):
    name: str
    address: str
    contact_email: str
    account_password: str

class RootAdminSchoolActivateRequest(BaseModel):
    school_id: int
    otp: str

class SchoolResponse(BaseModel):
    id: int
    name: str
    address: str
    contact_email: str
    created_at: str 

class InstitutionAddressInput(BaseModel):
    address_line: str
    region: Optional[str] = ""
    timezone: Optional[str] = ""
    language: Optional[str] = "English"
    is_primary: Optional[bool] = True

class InstitutionKeyIndividualInput(BaseModel):
    individual_type: str
    custom_type: Optional[str] = ""
    first_name: str
    middle_name: Optional[str] = ""
    last_name: str
    email: str
    status: Optional[str] = "Active"
    contact_number: Optional[str] = ""
    mobile_number: Optional[str] = ""
    address: Optional[str] = ""

class InstitutionSecurityInput(BaseModel):
    auth_mode: Optional[str] = "password_only"
    recommendation_text: Optional[str] = ""

class InstitutionBrandingInput(BaseModel):
    logo_url: Optional[str] = ""
    color_theme: Optional[str] = ""
    default_course_image_url: Optional[str] = ""

class InstitutionLocaleInput(BaseModel):
    date_format: Optional[str] = "YYYY-MM-DD"
    time_format: Optional[str] = "24h"
    currency_code: Optional[str] = "USD"

class InstitutionCreateRequest(BaseModel):
    institution_official_name: str
    institution_visual_name: Optional[str] = ""
    institution_brief_details: Optional[str] = ""
    institution_type: str
    institution_structure: str
    state: Optional[str] = "Trial"
    addresses: List[InstitutionAddressInput]
    key_individuals: Optional[List[InstitutionKeyIndividualInput]] = []
    security: Optional[InstitutionSecurityInput] = InstitutionSecurityInput()
    branding: Optional[InstitutionBrandingInput] = InstitutionBrandingInput()
    locale: Optional[InstitutionLocaleInput] = InstitutionLocaleInput()

class InstitutionUpdateRequest(BaseModel):
    institution_official_name: Optional[str] = None
    institution_visual_name: Optional[str] = None
    institution_brief_details: Optional[str] = None
    institution_type: Optional[str] = None
    institution_structure: Optional[str] = None
    state: Optional[str] = None
    addresses: Optional[List[InstitutionAddressInput]] = None
    key_individuals: Optional[List[InstitutionKeyIndividualInput]] = None
    security: Optional[InstitutionSecurityInput] = None
    branding: Optional[InstitutionBrandingInput] = None
    locale: Optional[InstitutionLocaleInput] = None

INSTITUTION_TYPES = {"Pre school", "Primary School", "Secondary School", "K12 School", "College", "Company"}
INSTITUTION_STRUCTURES = {"Sole Entity", "Union"}
INSTITUTION_STATES = {"Trial", "Active", "Suspended", "Archived", "Deleted"}
SECURITY_AUTH_MODES = {"password_only", "email_otp", "authenticator_app"}

class GroupMemberUpdateRequest(BaseModel):
    student_ids: List[str]

class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    subject: Optional[str] = "General" 
    member_count: int

class MaterialResponse(BaseModel):
    id: int
    title: str
    type: str
    content: str
    date: str

class GenericSocialRequest(BaseModel):
    provider: str
    token: str

class LogoutRequest(BaseModel):
    user_id: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class InvitationRequest(BaseModel):
    role: str
    expiry_hours: int = 24

class InvitationResponse(BaseModel):
    link: str
    token: str
    expires_at: str

class SocialTokenRequest(BaseModel):
    token: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ClassSessionRequest(BaseModel):
    meet_link: str

class AuditLogResponse(BaseModel):
    id: int
    user_id: str
    event_type: str
    timestamp: str
    details: str
    logout_time: Optional[str] = None
    duration_minutes: Optional[int] = None

class QuizCreateRequest(BaseModel):
    group_id: Optional[int] = None
    title: str
    questions: list
    time_limit: Optional[int] = 0
    target_type: Optional[str] = "group"
    target_id: Optional[str] = None
    acknowledged: bool = False

class QuizSubmitRequest(BaseModel):
    student_id: str
    answers: Dict[str, str] # Question Index -> Answer

class QuizResponse(BaseModel):
    id: int
    group_id: Optional[int] = None
    title: str
    question_count: int
    created_at: str
    time_limit: Optional[int] = 0
    target_type: Optional[str] = 'group'
    target_id: Optional[str] = None

class AssignmentResponse(BaseModel):
    id: int
    group_id: int
    title: str
    description: str
    due_date: str
    type: str
    points: int

class AssignmentCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: str
    points: int = 100
    grade_level: Optional[int] = None
    section_id: Optional[int] = None

class SubmissionCreateRequest(BaseModel):
    student_id: str
    content: str # Text or Link

class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: str
    student_name: Optional[str] = None
    content: str
    submitted_at: str
    grade: Optional[float] = None
    feedback: Optional[str] = None

class GradeSubmissionRequest(BaseModel):
    grade: float
    feedback: str = ""


class LessonPlanResponse(BaseModel):
    content: str

class AddUserRequest(BaseModel):
    id: str
    name: str
    role: str
    password: str
    grade: Optional[int] = 0
    preferred_subject: Optional[str] = "All"

class RoleCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    status: str = "Active"
    permissions: List[str] # List of permission codes

class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: str
    status: str
    permissions: List[dict] # {id, code, description}
    is_system: bool = False

class PermissionResponse(BaseModel):
    id: int
    code: str
    description: str

class AssignRoleRequest(BaseModel):
    role_ids: List[int]
    
class UserResponse(BaseModel):
    id: str
    name: str
    role: str
    grade: Optional[int]
    preferred_subject: Optional[str]


# --- STUDENT MANAGEMENT MODELS ---
class SectionCreateRequest(BaseModel):
    name: str
    grade_level: int
    school_id: int

class SectionResponse(BaseModel):
    id: int
    school_id: int
    name: str
    grade_level: int
    created_at: str

class GuardianCreateRequest(BaseModel):
    name: str
    relationship: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    is_emergency_contact: bool = False

class GuardianResponse(BaseModel):
    id: int
    student_id: str
    name: str
    relationship: str
    phone: str
    email: Optional[str]
    address: Optional[str]
    is_emergency_contact: bool

class HealthRecordUpdateRequest(BaseModel):
    blood_group: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    allergies: Optional[str] = None
    medical_conditions: Optional[str] = None
    medications: Optional[str] = None
    doctor_name: Optional[str] = None
    doctor_phone: Optional[str] = None

class HealthRecordResponse(BaseModel):
    id: int
    student_id: str
    blood_group: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    allergies: Optional[str]
    medical_conditions: Optional[str]
    medications: Optional[str]
    doctor_name: Optional[str]
    doctor_phone: Optional[str]
    last_updated: Optional[str]

class DocumentResponse(BaseModel):
    id: int
    student_id: str
    document_type: str
    document_name: str
    file_path: str
    upload_date: str
    uploaded_by: Optional[str]

class ResourceCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str = "Policy" # Policy, Schedule, Form, Other
    file_path: str # For now, just a text input or mocked path
    school_id: Optional[int] = 1

class ResourceResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = ""
    category: str
    file_path: str
    uploaded_by: Optional[str] = "Admin"
    uploaded_at: str

class FormTemplatePublishRequest(BaseModel):
    template_key: str
    school_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None

class TimetablePdfResponse(BaseModel):
    id: Optional[int] = None
    class_grade: int
    section: Optional[str] = None
    title: str
    file_path: str
    uploaded_by: str
    uploaded_at: str


# --- STAFF MANAGEMENT MODELS ---
class DepartmentCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    head_of_department_id: Optional[str] = None

class DepartmentResponse(DepartmentCreateRequest):
    id: int

class StaffProfileUpdateRequest(BaseModel):
    department_id: Optional[int]
    position_title: Optional[str]
    joining_date: Optional[str]
    contract_type: Optional[str]
    salary: Optional[float]

class StaffResponse(BaseModel):
    id: str
    name: str
    role: str
    email: Optional[str] = None # Assuming email is mapped from ID or similar for now
    photo_url: Optional[str] = None
    # Profile Info
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    position_title: Optional[str] = None
    joining_date: Optional[str] = None
    contract_type: Optional[str] = None
    salary: Optional[float] = None

class StaffAttendanceRequest(BaseModel):
    user_id: str
    date: str
    status: str
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None

class StaffPerformanceRequest(BaseModel):
    user_id: str
    review_date: str
    rating: int
    comments: str
    goals: Optional[str] = ""

class StaffPerformanceResponse(StaffPerformanceRequest):
    id: int
    reviewer_id: str

# --- GENERAL LEDGER MODELS ---
class GLJournalLineInput(BaseModel):
    account_id: Optional[int] = None
    account_code: Optional[str] = None
    description: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    cost_center_id: Optional[int] = None
    tax_code_id: Optional[int] = None
    party_id: Optional[int] = None

class GLJournalCreateRequest(BaseModel):
    entry_date: str
    description: Optional[str] = None
    reference: Optional[str] = None
    period_id: Optional[int] = None
    lines: List[GLJournalLineInput]

class GLJournalReverseRequest(BaseModel):
    reversal_date: Optional[str] = None
    reversal_reason: Optional[str] = None

# --- LMS MODELS (MOODLE ALTERNATIVE) ---
class LMSCourseCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    category: str = "General"
    thumbnail_url: Optional[str] = None
    enrollment_key: Optional[str] = None

class LMSCourseResponse(BaseModel):
    id: int
    title: str
    description: str
    teacher_id: Optional[str]
    category: str
    thumbnail_url: Optional[str]
    created_at: str

class LMSSectionCreateRequest(BaseModel):
    title: str
    order_index: int = 0

class LMSSectionResponse(BaseModel):
    id: int
    course_id: int
    title: str
    order_index: int

class LMSModuleCreateRequest(BaseModel):
    title: str
    type: str # video, pdf, quiz, assignment, html
    content_url: Optional[str] = None
    content_text: Optional[str] = None
    order_index: int = 0

class LMSModuleResponse(BaseModel):
    id: int
    section_id: int
    title: str
    type: str
    content_url: Optional[str]
    content_text: Optional[str]
    order_index: int


