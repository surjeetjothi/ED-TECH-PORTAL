# ClassBridge Backend API

Backend API for the ClassBridge EdTech platform, built with FastAPI and PostgreSQL.

## 🚀 Deployment on Render

This backend is designed to be deployed on [Render](https://render.com) with automatic deployment from GitHub.

### Quick Deploy

1. **Fork/Clone this repository**
2. **Create a new Web Service on Render**
   - Connect your GitHub repository
   - Use the settings below

3. **Render Configuration**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend:app --host 0.0.0.0 --port $PORT`
   - **Environment:** Python 3.11+

4. **Set Environment Variables** (Required)
   ```
   DATABASE_URL=<your-postgresql-connection-string>
   GROQ_API_KEY=<your-groq-api-key>
   GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
   SMTP_EMAIL=<your-email@gmail.com>
   SMTP_PASSWORD=<your-app-password>
   ```

## 📋 Features

- **Multi-tenant Architecture** - Support for multiple schools
- **Role-based Access Control** - Student, Teacher, Admin, Principal, Super Admin
- **AI Integration** - Powered by Groq for lesson planning, quiz generation, and chat
- **Real-time Features** - WebSocket support for live classes
- **LMS Capabilities** - Course management, assignments, quizzes
- **Student Management** - Comprehensive student records, health records, documents
- **Staff Management** - Faculty profiles, attendance, performance reviews
- **Authentication** - Google OAuth, Microsoft OAuth, traditional login with 2FA
- **Email Notifications** - Automated notifications for important events

## 🛠️ Tech Stack

- **Framework:** FastAPI
- **Database:** PostgreSQL (production) / SQLite (development)
- **AI:** Groq API (LLaMA 3.1)
- **Authentication:** OAuth 2.0, JWT
- **Email:** SMTP (Gmail)
- **File Processing:** PDF parsing, document uploads

## 📦 Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/surjeetjothi/nexuxbackend.git
   cd nexuxbackend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Create `.env` file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Run the server**
   ```bash
   uvicorn backend:app --reload --port 8000
   ```

6. **Access the API**
   - API: http://127.0.0.1:8000
   - Docs: http://127.0.0.1:8000/docs
   - Health Check: http://127.0.0.1:8000/api/health

## 🔧 Environment Variables

### Required for Production

These variables must be set in your production hosting environment (e.g., Render Dashboard).

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis Cache connection string | `rediss://red-xxxxxxxxxxx:password@host:port` |
| `GROQ_API_KEY` | Groq API key for AI features | `gsk_xxxxx` |
| `TEACHER_LOGIN_ALIAS` | Default email alias for teacher login | `teachernoblenexus@gmail.com` |
| `TEACHER_LOGIN_PASSWORD` | Password for default teacher account | `stronG_pAsSWord!` |
| `ADMIN_LOGIN_EMAIL` | Super admin login email | `admin@example.com` |
| `ADMIN_LOGIN_PASSWORD` | Password for admin login | `secureAdminPass99` |
| `STUDENT_G1_1_PASSWORD` | Default student password | `studentPass2026` |
| `STUDENT1_GRADE1_EMAIL` | Default student login alias | `student@example.com` |
| `PARENT_G1_1_PASSWORD` | Default parent password | `parentPass2026` |
| `PARENT1_EMAIL` | Default parent login alias | `parent@example.com` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | - |
| `SMTP_EMAIL` | Email for notifications | - |
| `SMTP_PASSWORD` | Email app password | - |
| `LESSON_PLANNER_API_KEY` | Separate API key for lesson planner | Uses GROQ_API_KEY |
| `GRADE_HELPER_API_KEY` | Separate API key for grade helper | Uses GROQ_API_KEY |

## 📡 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/google-login` - Google OAuth login
- `POST /api/auth/microsoft-login` - Microsoft OAuth login
- `POST /api/auth/verify-2fa` - Two-factor authentication
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Reset password with token

### Students
- `GET /api/students/all` - Get all students
- `GET /api/students/{student_id}/data` - Get student data
- `POST /api/students/add` - Add new student
- `PUT /api/students/{student_id}` - Update student
- `DELETE /api/students/{student_id}` - Delete student

### Teachers
- `GET /api/teacher/overview` - Teacher dashboard data
- `POST /api/teacher/export-grades-csv` - Export grades as CSV

### Groups (Classes)
- `GET /api/groups` - Get all groups
- `POST /api/groups` - Create new group
- `GET /api/groups/{group_id}/members` - Get group members
- `POST /api/groups/{group_id}/members` - Add members to group

### Assignments
- `GET /api/groups/{group_id}/assignments` - Get assignments
- `POST /api/groups/{group_id}/assignments` - Create assignment
- `POST /api/assignments/{assignment_id}/submit` - Submit assignment
- `PUT /api/assignments/{assignment_id}/submissions/{submission_id}` - Grade submission

### Quizzes
- `POST /api/groups/{group_id}/quizzes` - Create quiz
- `GET /api/groups/{group_id}/quizzes` - Get quizzes
- `POST /api/quizzes/{quiz_id}/submit` - Submit quiz answers

### AI Features
- `POST /api/ai/chat/{student_id}` - AI chat for students
- `POST /api/ai/teacher-chat/{teacher_id}` - AI chat for teachers
- `POST /api/ai/lesson-plan` - Generate lesson plan
- `POST /api/ai/generate-quiz` - Generate quiz with AI
- `POST /api/ai/grade-helper/{student_id}` - AI grading assistant

### Admin
- `GET /api/admin/schools` - Get all schools
- `POST /api/admin/schools` - Create new school
- `GET /api/admin/roles` - Get all roles
- `POST /api/admin/roles` - Create new role
- `GET /api/admin/permissions` - Get all permissions

### Health Check
- `GET /api/health` - Server health status

## 🔒 CORS Configuration

The backend automatically configures CORS based on the environment:

- **Production (Render):** Allows all `*.vercel.app` domains
- **Development:** Allows `localhost:8000` and `127.0.0.1:8000`

## 🗄️ Database Schema

The application uses a multi-tenant PostgreSQL database with the following main tables:

- `students` - Student records
- `activities` - Student activity logs
- `schools` - School/tenant information
- `groups` - Classes/groups
- `assignments` - Assignment records
- `submissions` - Assignment submissions
- `quizzes` - Quiz records
- `quiz_submissions` - Quiz answers
- `guardians` - Parent/guardian information
- `health_records` - Student health information
- `staff` - Faculty and staff records
- `departments` - Department information
- `roles` - User roles
- `permissions` - Permission definitions
- `user_roles` - User-role assignments

## 🧪 Testing

### Health Check
```bash
curl https://classbridge-backend-bqj3.onrender.com/api/health
```

### Test Connection
```bash
python test_connection.py
```

## 📝 Deployment Checklist

- [ ] Create PostgreSQL database on Render
- [ ] Set all required environment variables
- [ ] Connect GitHub repository to Render
- [ ] Configure build and start commands
- [ ] Deploy and verify health endpoint
- [ ] Test CORS with frontend
- [ ] Verify database connection
- [ ] Test AI features (if enabled)

## 🐛 Troubleshooting

### Backend not responding
- Check if service is active on Render dashboard
- Free tier services sleep after 15 minutes - first request takes 30-60 seconds
- Check Render logs for errors

### Database connection errors
- Verify `DATABASE_URL` is set correctly
- Ensure PostgreSQL database is created and accessible
- Check database is in the same region as web service

### CORS errors
- Verify backend is deployed with latest code
- Check frontend URL matches CORS configuration
- Clear browser cache and hard refresh

### AI features not working
- Verify `GROQ_API_KEY` is set
- Check Groq API quota and limits
- Review logs for API errors

## 📄 License

This project is part of the ClassBridge EdTech platform.

## 🤝 Contributing

This is a private educational project. For questions or issues, please contact the development team.

## 📞 Support

- **Health Check:** https://classbridge-backend-bqj3.onrender.com/api/health
- **API Documentation:** https://classbridge-backend-bqj3.onrender.com/docs
- **Frontend:** https://ed-tech-portal.vercel.app

---

**Last Updated:** 2026-02-07  
**Version:** 1.0.0  
**Status:** Production Ready
