# ClassBridge - Product Documentation

_Generated from current repository state (backend/backend.py, backend/app/routers/auth.py, backend/app/core/security.py, src/script.js, index.html). Requested paths `auth/auth.py` and `security/security.py` are not present in this repo; equivalent active files were used._

## 1. Product Overview
- **ClassBridge** is a multi-tenant school/university platform that combines administration, academics, communication, and governance workflows.
- **Target users**: institution owners, root/super admins, tenant admins, principals, teachers/staff, students, and parents/guardians.
- **Technology stack**:
  - **Backend**: Python + FastAPI (monolithic app in `backend/backend.py` plus modular routers in `backend/app/routers/*`)
  - **Frontend**: HTML + CSS + JavaScript (`index.html`, `src/script.js`)
  - **Database**: SQLite/PostgreSQL-compatible SQL patterns (RBAC tables + domain tables)

## 2. Architecture
### RBAC Model (Text Diagram)
```text
Tenant (school_id)
  -> User (students/users)
    -> UserRole (user_roles)
      -> Role (roles)
        -> RolePermission (role_permissions)
          -> Permission (permissions)
```
### Frontend/Backend Structure
- Frontend renders role-based UI, page modules, and dynamic permission-gated controls from `src/script.js`.
- Backend enforces permission checks through `_require_permission(...)` and `verify_permission(...)`.
- Multi-tenant scoping is applied by `school_id` and actor context resolution.

### Auth Flow Summary
1. User logs in via `POST /api/auth/login` (password + optional 2FA).
2. Backend resolves roles and permissions live from RBAC relations.
3. Frontend stores session + RBAC payload and initializes dashboard.
4. Frontend can refresh live permissions with `GET /api/auth/refresh-permissions`.
5. Logout clears session and frontend RBAC storage.

## 3. Modules Built
### 3.1 User Management
- Implemented features:
  - User listing with search/pagination, multi-role badges, status badges, and permission-gated actions.
  - Create User wizard with 5-step workflow and review summary.
  - Edit user with structured address, guardian add/remove, role assignment updates.
  - Read-only user view page with sections and role-permission display.
  - Deactivate/delete flow with confirmation modal and self-delete protection.

**User Management APIs**
| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | /api/admin/user-management-stats | view_user_management | User management dashboard stats |
| GET | /api/admin/users | view_users | List users with search/pagination and roles |
| POST | /api/admin/users/extended | add_users | Create user with 5-section payload |
| GET | /api/admin/users/{user_id} | view_users | View full user detail (read-only) |
| PUT | /api/admin/users/{user_id} | edit_users | Update user, roles, guardians, settings |
| DELETE | /api/admin/users/{user_id} | delete_users | Deactivate/soft delete user |

**Create User Wizard (Step 1-5)**
1. Primary Details (username, email, first name, last name, password, role selection)
2. Contact Info (phones, secondary email, structured address)
3. Guardian Details (0..n guardians, unique guardian emails)
4. Organizational Details (employee/job/department/manager/office)
5. Settings + Review (language, timezone, date format, final validation/submit)

### 3.2 Role Management
- Implemented features:
  - Tenant-scoped role listing with Root_Super_Admin filtering for non-root users.
  - Create role with auto-generated `role_code` and role-permission linking.
  - Edit role permissions via add/remove associations (no permission row deletion).
  - Delete guardrails including active-user association check.
  - Role detail includes `active_user_count` banner support for impact visibility.

**Role Management APIs**
| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | /api/admin/roles | view_role_management | List tenant-scoped roles (Root_Super_Admin filtered for non-root) |
| POST | /api/admin/roles | add_roles | Create role with auto role_code and permission links |
| GET | /api/admin/roles/{role_id} | view_role_management | Role detail + permissions + active_user_count |
| PUT | /api/admin/roles/{role_id} | edit_roles | Update status/description and role-permission links |
| DELETE | /api/admin/roles/{role_id} | delete_roles | Delete role after active user association checks |

- `role_code` format: `R-000x` (e.g., `R-0001`, `R-0100`)

### 3.3 Permission Setup
- Permissions are grouped (via `group_name` / category semantics) and assigned to roles through `role_permissions`.
- Role updates immediately affect effective user permissions on refresh/login.

**Permission Setup APIs**
| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | /api/admin/permissions | permission_management | Fetch grouped permissions for configuration |
| PUT | /api/admin/permissions/{perm_id} | permission_management | Update permission metadata/status |

### 3.4 RBAC Engine
- **Backend enforcement**: `verify_permission(...)` performs live DB resolution for each check.
- **Frontend engine**: `PermissionEngine` manages local permission/role state and checks (`has`, `hasAny`, `isRootSuperAdmin`).
- **Propagation model**:
  - Fast path: login response includes permissions/roles
  - Source-of-truth refresh: `refreshPermissions()` calls `/api/auth/refresh-permissions`
  - UI gates reapplied by `applyAllPermissions()` (menu/dashboard/buttons/page guards)

## 4. Database Schema
Key RBAC and user-related tables (as implemented in backend schema/migrations):

```sql
-- students (primary auth user table)
id TEXT PRIMARY KEY,
name TEXT, role TEXT, school_id INTEGER, password TEXT, is_super_admin BOOLEAN,
status TEXT, deleted_at TEXT, email TEXT, email_verified BOOLEAN,
failed_login_attempts INTEGER, locked_until TEXT, address TEXT, ...

-- optional PRD users table
users(
  user_id PK, username UNIQUE, first_name, last_name, email_address UNIQUE, password_hash,
  institution_id, status, primary_phone, mobile_phone, secondary_email,
  employee_id, job_title, department, manager_supervisor, office_location,
  preferred_language, timezone, date_format, deleted_at, created_at
)

-- roles
roles(
  id PK, role_code, name, description, status, school_id, is_system
)

-- permissions
permissions(
  id PK, code UNIQUE, description, group_name, status
)

-- junctions
role_permissions(role_id, permission_id, PRIMARY KEY(role_id, permission_id))
user_roles(user_id, role_id, PRIMARY KEY(user_id, role_id))

-- guardians
guardians(
  id PK, guardian_id, user_id, student_id, first_name, last_name,
  email_address, primary_phone, mobile_phone, address, created_at, ...
)
```

## 5. API Reference
Complete endpoint inventory extracted from current backend source (`backend/backend.py` + `backend/app/routers/auth.py`).

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/` | - | serve frontend |
| GET | `/.well-known/openid-configuration` | - | openid configuration |
| POST | `/api/activities/add` | - | add new activity |
| GET | `/api/admin/audit-logs` | - | get audit logs |
| GET | `/api/admin/compliance/access-logs` | - | get compliance access logs |
| GET | `/api/admin/compliance/audit-logs` | - | get compliance audit logs |
| GET | `/api/admin/compliance/retention` | - | get retention policies |
| POST | `/api/admin/compliance/retention` | - | update retention policies |
| GET | `/api/admin/institutions` | - | list institutions |
| POST | `/api/admin/institutions` | - | create institutions |
| GET | `/api/admin/institutions/{school_id}` | - | get institution details |
| PUT | `/api/admin/institutions/{school_id}` | - | update institution |
| POST | `/api/admin/institutions/{school_id}/branding/upload` | - | upload institution branding asset |
| GET | `/api/admin/permissions` | permission_management | get permissions |
| GET | `/api/admin/permissions/list` | - | get permissions list |
| GET | `/api/admin/permissions/summary` | - | get permissions summary |
| PUT | `/api/admin/permissions/{perm_id}` | - | update permission |
| GET | `/api/admin/roles` | view_role_management | get roles |
| POST | `/api/admin/roles` | add_roles | create role |
| DELETE | `/api/admin/roles/{role_id}` | delete_roles | delete role |
| GET | `/api/admin/roles/{role_id}` | view_role_management | get role details |
| PUT | `/api/admin/roles/{role_id}` | edit_roles | update role |
| GET | `/api/admin/schools` | - | list schools |
| POST | `/api/admin/schools` | - | create school |
| DELETE | `/api/admin/schools/{school_id}` | - | delete school |
| PUT | `/api/admin/schools/{school_id}` | - | update school |
| GET | `/api/admin/schools/{school_id}/stats` | - | get school stats |
| GET | `/api/admin/user-management-stats` | view_user_management | get user management stats |
| GET | `/api/admin/users` | view_users | list all users |
| POST | `/api/admin/users` | - | create new user |
| POST | `/api/admin/users/extended` | add_users | create extended user |
| DELETE | `/api/admin/users/{user_id}` | delete_users | delete user |
| GET | `/api/admin/users/{user_id}` | view_users | view user details |
| PUT | `/api/admin/users/{user_id}` | edit_users | edit user details |
| POST | `/api/ai/chat/course/{course_id}` | - | chat with course |
| POST | `/api/ai/chat/{student_id}` | - | chat with ai tutor |
| POST | `/api/ai/chat_with_file/{student_id}` | - | chat with ai tutor file |
| POST | `/api/ai/engagement-helper` | - | chat with engagement helper |
| POST | `/api/ai/generate-lesson-plan` | - | generate lesson plan v2 |
| POST | `/api/ai/generate-quiz` | - | generate quiz |
| POST | `/api/ai/grade-helper/{student_id}` | - | chat with grade helper |
| POST | `/api/ai/grade/short-answer` | - | grade quiz short answer |
| POST | `/api/ai/lesson-plan` | - | generate lesson plan |
| POST | `/api/ai/teacher-chat/{teacher_id}` | - | chat with ai teacher |
| POST | `/api/assignments` | - | create assignment |
| POST | `/api/assignments/submissions/{sub_id}/grade` | - | grade submission |
| POST | `/api/assignments/submissions/{sub_id}/reassign` | - | reassign submission |
| GET | `/api/assignments/teacher/pending` | - | get pending assignments |
| GET | `/api/assignments/{assignment_id}/submissions` | - | get assignment submissions |
| POST | `/api/assignments/{assignment_id}/submit` | - | submit assignment |
| POST | `/api/attendance/bulk` | - | take bulk attendance |
| GET | `/api/attendance/class/{grade}` | - | get class attendance |
| GET | `/api/attendance/student/my` | - | get my attendance |
| POST | `/api/auth/authenticator/setup` | - | setup authenticator |
| POST | `/api/auth/forgot-password` | - | forgot password |
| POST | `/api/auth/google-login` | - | google login |
| POST | `/api/auth/login` | - | login user |
| POST | `/api/auth/logout` | - | logout user |
| POST | `/api/auth/microsoft-login` | - | microsoft login |
| GET | `/api/auth/permissions` | - | get role permissions |
| GET | `/api/auth/refresh-permissions` | - | refresh user permissions |
| POST | `/api/auth/register` | - | register user |
| POST | `/api/auth/reset-password` | - | reset password |
| POST | `/api/auth/social-login` | - | generic social login |
| POST | `/api/auth/verify-2fa` | - | verify backup code |
| GET | `/api/auth/verify-email` | - | verify email |
| POST | `/api/class/end` | - | end class |
| POST | `/api/class/start` | - | start class |
| POST | `/api/classes` | - | schedule class endpoint |
| GET | `/api/classes/upcoming` | - | get upcoming classes |
| DELETE | `/api/classes/{class_id}` | - | delete class |
| GET | `/api/communication/announcements` | - | get announcements |
| POST | `/api/communication/announcements` | - | create announcement |
| POST | `/api/communication/emergency` | - | trigger emergency |
| GET | `/api/communication/events` | - | get events |
| POST | `/api/communication/events` | - | create event |
| GET | `/api/communication/messages` | - | get messages |
| POST | `/api/communication/messages` | - | send message |
| DELETE | `/api/documents/{doc_id}` | - | delete document |
| GET | `/api/email/inbox` | - | get email inbox |
| POST | `/api/email/send` | - | send internal email |
| GET | `/api/email/sent` | - | get email sent |
| PUT | `/api/email/{email_id}/read` | - | mark email read |
| POST | `/api/exam-schedules` | - | create exam schedule |
| GET | `/api/exam-schedules/all` | - | get all exam schedules |
| GET | `/api/exam-schedules/my` | - | get my exam schedules |
| PUT | `/api/exam-schedules/{schedule_id}` | - | update exam schedule |
| POST | `/api/exam-schedules/{schedule_id}/notify` | - | notify exam schedule |
| POST | `/api/exams/create-pdf` | - | create pdf exam |
| GET | `/api/exams/student/list` | - | get student exams |
| POST | `/api/exams/submit-pdf` | - | submit pdf exam |
| GET | `/api/groups` | - | get groups |
| POST | `/api/groups` | - | create group |
| DELETE | `/api/groups/{group_id}` | - | delete group |
| GET | `/api/groups/{group_id}/materials` | - | get group materials |
| POST | `/api/groups/{group_id}/materials` | - | add group material |
| GET | `/api/groups/{group_id}/members` | - | get group members |
| POST | `/api/groups/{group_id}/members` | - | update group members |
| GET | `/api/groups/{group_id}/quizzes` | - | get group quizzes |
| POST | `/api/groups/{group_id}/upload` | - | upload group material |
| DELETE | `/api/guardians/{id}` | - | delete guardian |
| GET | `/api/health` | - | health check |
| POST | `/api/invitations/generate` | - | generate invitation |
| POST | `/api/leave/apply` | - | apply leave |
| GET | `/api/leave/history` | - | get leave history |
| GET | `/api/leave/my-history` | - | get my leave history |
| GET | `/api/leave/pending` | - | get pending leaves |
| GET | `/api/leave/processed` | - | get processed leave history |
| GET | `/api/leave/student/pending` | - | get pending student leaves |
| PUT | `/api/leave/{leave_id}/status` | - | update leave status |
| POST | `/api/leave/{request_id}/action` | - | action leave request |
| GET | `/api/lms/courses` | - | get courses |
| POST | `/api/lms/courses` | - | create course |
| GET | `/api/lms/courses/{course_id}/full` | - | get course full |
| POST | `/api/lms/courses/{course_id}/sections` | - | add section |
| POST | `/api/lms/modules/{module_id}/complete` | - | complete module |
| POST | `/api/lms/sections/{section_id}/modules` | - | add module |
| POST | `/api/lti/launch` | - | get lti launch data |
| GET | `/api/moodle/assignments` | - | get moodle assignments |
| GET | `/api/moodle/grades` | - | get moodle grades |
| GET | `/api/notifications/inbox` | - | get notifications |
| PUT | `/api/notifications/{msg_id}/read` | - | mark notification read |
| POST | `/api/oauth/approve` | - | oauth approve |
| GET | `/api/progress-card/my` | - | get my progress card |
| GET | `/api/progress-card/{student_id}` | - | get progress card |
| POST | `/api/progress/marks/bulk` | - | save progress marks |
| POST | `/api/progress/publish` | - | publish progress marks |
| GET | `/api/progress/publish/preview` | - | preview publish marks |
| POST | `/api/progress/publish/student` | - | publish progress for student |
| GET | `/api/progress/roster` | - | get progress roster |
| GET | `/api/question-bank` | - | get question banks |
| POST | `/api/question-bank/upload` | - | upload question bank |
| POST | `/api/quizzes/create` | - | create quiz endpoint |
| GET | `/api/quizzes/{quiz_id}` | - | get quiz details |
| GET | `/api/quizzes/{quiz_id}/results` | - | get quiz results |
| POST | `/api/quizzes/{quiz_id}/submit` | - | submit quiz |
| GET | `/api/reports/summary` | - | get reports summary |
| GET | `/api/resources` | - | get resources |
| POST | `/api/resources` | - | create resource |
| GET | `/api/resources/form-templates` | - | get form templates |
| POST | `/api/resources/form-templates` | - | publish form template |
| DELETE | `/api/resources/{resource_id}` | - | delete resource |
| GET | `/api/root-admin/database` | - | root view database |
| GET | `/api/root-admin/schools` | - | root list schools |
| POST | `/api/root-admin/schools` | - | root create school account |
| POST | `/api/root-admin/schools/verify-otp` | - | root verify school otp |
| GET | `/api/root-admin/students` | - | root list students |
| POST | `/api/root-admin/students` | - | root add student |
| PATCH | `/api/root-admin/students/{student_id}/email` | - | root update student email |
| PATCH | `/api/root-admin/students/{student_id}/password` | - | root update student password |
| GET | `/api/sections` | - | get sections |
| POST | `/api/sections` | - | create section |
| GET | `/api/staff/attendance` | - | get staff attendance |
| POST | `/api/staff/attendance` | - | mark staff attendance |
| GET | `/api/staff/departments` | - | get departments |
| POST | `/api/staff/departments` | - | create department |
| POST | `/api/staff/performance` | - | create performance review |
| GET | `/api/staff/performance/{user_id}` | - | get staff performance |
| GET | `/api/staff/profiles` | - | get staff profiles |
| PUT | `/api/staff/profiles/{user_id}` | - | update staff profile |
| POST | `/api/students/add` | - | add new student |
| GET | `/api/students/all` | - | get all students list |
| DELETE | `/api/students/{student_id}` | - | delete student |
| PUT | `/api/students/{student_id}` | - | update student |
| POST | `/api/students/{student_id}/assign-section` | - | assign student section |
| GET | `/api/students/{student_id}/assignments` | - | get student assignments |
| GET | `/api/students/{student_id}/data` | - | get student data |
| GET | `/api/students/{student_id}/documents` | - | get documents |
| POST | `/api/students/{student_id}/documents` | - | upload document |
| POST | `/api/students/{student_id}/email-code` | - | send access code email |
| GET | `/api/students/{student_id}/groups` | - | get student groups |
| GET | `/api/students/{student_id}/guardians` | - | get guardians |
| POST | `/api/students/{student_id}/guardians` | - | add guardian |
| GET | `/api/students/{student_id}/health` | - | get health record |
| PUT | `/api/students/{student_id}/health` | - | update health record |
| GET | `/api/students/{student_id}/quiz-results` | - | get student quiz results |
| GET | `/api/teacher/assignments` | - | get teacher assignments |
| GET | `/api/teacher/export-grades-csv` | - | export grades csv |
| GET | `/api/teacher/overview` | - | get teacher overview |
| GET | `/api/teacher/quizzes` | - | get teacher quizzes |
| GET | `/api/teacher/students/{student_id}/codes` | - | get student codes |
| POST | `/api/teacher/students/{student_id}/regenerate-code` | - | regenerate student code |
| GET | `/api/timetable/student/my` | - | get my timetable |
| GET | `/api/timetable/student/my/pdfs` | - | get my timetable pdfs |
| GET | `/api/timetable/teacher/my/pdfs` | - | get teacher timetable pdfs |
| GET | `/api/timetable/teacher/{teacher_id}` | - | get teacher timetable |
| POST | `/api/timetable/upload-pdf` | - | upload timetable pdf |
| GET | `/frontend/modules/{filepath:path}` | - | serve frontend modules |
| GET | `/frontend/static/{filename:path}` | - | serve frontend static |
| GET | `/oauth/authorize` | - | oauth authorize |
| POST | `/oauth/token` | - | oauth token |
| GET | `/oauth/userinfo` | - | oauth userinfo |
| GET | `/script.js` | - | read script |

## 6. Current Status
- **Complete**:
  - RBAC core model (roles, permissions, mappings, live permission checks)
  - User Management CRUD flows with wizard + review + guardian handling
  - Role Management CRUD with protected/system-role logic and active user impact visibility
  - Frontend permission engine, menu/button/page gating, logout cleanup
- **In Progress / Evolving**:
  - Full harmonization of legacy and newer frontend modules in one script bundle
  - Standardization of endpoint response contracts across legacy/new paths
- **Known Issues**:
  - Monolithic `src/script.js` and `backend/backend.py` increase change-risk for regressions
  - Build warnings remain for non-module script tags in frontend HTML

## 7. Setup & Run
### Backend
```bash
python -m py_compile backend/backend.py
python backend/backend.py
```
- Default backend URL: `http://127.0.0.1:8000`

### Frontend
```bash
npm install
npm run dev
# or production build
npm run build
npm run preview
```
- Frontend entry: `index.html`
- API base is resolved in `src/script.js` (`API_BASE_URL`) for local/prod contexts.
