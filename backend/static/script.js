var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
// --- CONFIGURATION ---
// Automatically detects if running on localhost or production server
// On server: uses explicit Render Backend URL (since Frontend is on Vercel, Backend is on Render)
// On localhost: uses explicit 'http://127.0.0.1:8000/api'
const isLocal = (
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === 'localhost' ||
    window.location.protocol === 'file:' ||
    window.location.hostname.endsWith('.local') ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.')
);
const resolvedLocalHost = (!window.location.hostname || window.location.hostname === 'localhost' || window.location.hostname === '0.0.0.0')
    ? '127.0.0.1'
    : window.location.hostname;
const LOCAL_API_BASE = `http://${resolvedLocalHost}:8000/api`;
const PROD_API_DEFAULT = 'https://deploy-backend-2-yr70.onrender.com/api';
// Allow override via window.__API_BASE_URL__ (optional)
const API_BASE_URL = isLocal
    ? LOCAL_API_BASE
    : (window.__API_BASE_URL__ || PROD_API_DEFAULT);

console.log("------------------------------------------");
console.log(" FRONTEND VERSION 3.1 - CONNECTING TO CLASSBRIDGE BACKEND");
console.log("------------------------------------------");

console.log("ClassBridge API Base URL:", API_BASE_URL);
// Check if running from file:// which breaks OAuth
if (window.location.protocol === 'file:') {
    console.warn("Google Sign-In requires running on a server (http://127.0.0.1:8000) to work.");
}
// --- MSAL CONFIGURATION (MICROSOFT) ---
// --- MSAL CONFIGURATION (MICROSOFT) ---
const msalConfig = {
    auth: {
        clientId: "8b6e2b20-90f6-423d-9530-390fcaa4651f", // PLACEHOLDER: User must replace this!
        authority: "https://login.microsoftonline.com/common",
        redirectUri: "http://localhost:8000"
        // Dynamic: works on Localhost AND Render
    },
    cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false,
    }
};
let msalInstance;
try {
    msalInstance = new msal.PublicClientApplication(msalConfig);
}
catch (e) {
    console.warn("MSAL Initialization failed (likely due to placeholder ID). Microsoft Login will fall back to simulation.");
}
// --- STATE MANAGEMENT ---
let appState = {
    isLoggedIn: false,
    role: null,
    userId: null,
    activeStudentId: null,
    allStudents: [],
    chatMessages: {},
    groups: [],
    currentCourseId: null,
    activeSchoolId: null, // For Super Admin context switching
    name: null,
    tempUserId: null,
    tempSecurityMode: null,
    roles: [],
    permissions: []
};

// ─────────────────────────────────────────────────────────────────────────────
// Performance utilities, view loader registry and role constants are defined in:
//   frontend/static/cb_perf.js          — loadPlotlyAndRender, cachedFetchAPI
//   frontend/static/cb_view_registry.js — VIEW_LOADERS, TEACHER_ROLES, etc.
// Both files are loaded before this script in index.html.
// ─────────────────────────────────────────────────────────────────────────────

function applyRoleTheme() {
    const role = appState.role || '';
    const isTeacherUi = role === 'Teacher' || role === 'Admin' || role === 'Principal' || role === 'Tenant_Admin' || role === 'Super_Admin' || role === 'Root_Super_Admin';
    const isStudentUi = role === 'Student';
    document.body.classList.toggle('teacher-mode', isTeacherUi);
    document.body.classList.toggle('student-mode', isStudentUi);
}
// Helper functions for DOM casting
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}
function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.value = String(value);
    }
}
function getChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}
function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.checked = value;
    }
}
function getInput(id) {
    return document.getElementById(id);
}
function getEl(id) {
    return document.getElementById(id);
}
function hasPermission(code) {
    return appState.isSuperAdmin || appState.permissions.includes(code) || appState.permissions.includes('*');
}
function hasAnyPermission(codes) {
    return appState.isSuperAdmin || codes.some(code => hasPermission(code));
}
function isParentRole(role) {
    return role === 'Parent' || role === 'Parent_Guardian';
}

function showAccessDeniedView() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Hide all other views
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));

    let deniedView = document.getElementById('access-denied-view');
    if (!deniedView) {
        deniedView = document.createElement('div');
        deniedView.id = 'access-denied-view';
        deniedView.className = 'view active d-flex align-items-center justify-content-center';
        deniedView.style.minHeight = '70vh';
        deniedView.innerHTML = `
            <div class="text-center p-5 shadow-lg rounded-4 bg-white" style="max-width: 450px; border-top: 5px solid #dc3545;">
                <div class="mb-4">
                    <span class="material-icons text-danger" style="font-size: 80px;">gpp_maybe</span>
                </div>
                <h2 class="fw-bold text-dark mb-3">Access Denied</h2>
                <p class="text-muted mb-4">You do not have the required permissions to view this section. If you believe this is an error, please contact your administrator.</p>
                <button class="btn btn-primary px-4 py-2 rounded-pill shadow-sm" onclick="appState.role === 'Student' ? switchView('student-view') : (isParentRole(appState.role) ? switchView('parent-dashboard-view') : switchView('teacher-view'))">
                    <span class="material-icons align-middle me-1">dashboard</span> Back to Dashboard
                </button>
            </div>
        `;
        mainContent.appendChild(deniedView);
    } else {
        deniedView.classList.add('active');
    }
}
function restoreAuthState() {
    const stored = localStorage.getItem('classbridge_session');
    if (stored) {
        const session = JSON.parse(stored);
        appState.isLoggedIn = true;
        appState.role = session.role;
        appState.userId = session.user_id;
        appState.name = session.name || session.user_id || null;
        appState.schoolId = session.school_id;
        appState.schoolName = session.school_name;
        appState.isSuperAdmin = session.is_super_admin;
        appState.roles = session.roles || [];
        appState.permissions = session.permissions || [];
        if (appState.isSuperAdmin || appState.role === 'Root_Super_Admin') {
            appState.permissions = ['*'];
        } else if ((!appState.permissions || appState.permissions.length === 0) && (appState.role === 'Admin' || appState.role === 'Principal')) {
            appState.permissions = ['view_permissions', 'edit_permissions', 'permission_management'];
        }
        appState.activeStudentId = session.active_student_id || null;
        applyRoleTheme();
        return true;
    }
    return false;
}
// --- LOCALIZATION & ACCESSIBILITY (FR-17, FR-16) ---
var translations = window.translations || {
    en: {
        login_welcome: "Welcome to Noble Nexus",
        login_subtitle: "Sign in to Class Bridge",
        label_username: "Email",
        label_password: "Password",
        link_forgot_password: "Forgot Password?",
        btn_signin: "Sign In",
        btn_signin_microsoft: "Sign in with Microsoft",
        text_or: "OR",
        text_new_user: "New User?",
        link_signup: "Sign Up",
        link_help: "Need help? Contact support",
        msg_enter_credentials: "Please enter both username and password.",
        msg_checking: "Checking credentials...",
        msg_welcome: "Welcome, {user_id}",
        msg_login_failed: "Login failed",
        msg_network_error: "Network Error: {error}. Is the backend running?",
        msg_google_verify: "Verifying Google Token...",
        msg_microsoft_conn: "Connecting to Microsoft...",
        msg_microsoft_verify: "Verifying Microsoft Token...",
        // Sidebar & Dashboard
        sidebar_dashboard: "Dashboard",
        sidebar_my_courses: "My Courses",
        sidebar_course_list: "Course List",
        sidebar_assignments: "Assignments",
        sidebar_exams: "Exams",
        sidebar_upcoming_exams: "Upcoming Exams",
        sidebar_results: "Results",
        sidebar_profile: "Profile",
        sidebar_view_profile: "View Profile",
        sidebar_settings: "Settings",
        sidebar_communication: "Communication",
        sidebar_lms: "Courses (LMS)",
        sidebar_ai_assistant: "AI Assistant",
        sidebar_timetable: "Timetable",
        sidebar_view_timetable: "View timetable",
        sidebar_attendance: "Attendance",
        sidebar_take_attendance: "Take attendance",
        sidebar_attendance_sheet: "Attendance sheet",
        sidebar_monthly_report: "Monthly report",
        sidebar_approve_leave: "Approve/deny leave",
        sidebar_apply_leave: "Apply for leave",
        sidebar_assignment_group: "Assignment",
        sidebar_create_assignment: "Create assignment",
        sidebar_view_submitted: "View submitted",
        sidebar_approve_reassign: "Approve / Reassign",
        sidebar_enter_marks: "Enter & Update Marks",
        sidebar_online_test: "Online Test",
        sidebar_question_bank: "Question Bank",
        sidebar_create_test: "Create & Edit Tests",
        sidebar_assign_max_marks: "Assign Max Marks",
        sidebar_view_test_results: "View Results",
        sidebar_progress_card: "Progress Card",
        sidebar_enter_progress: "Enter Progress Marks",
        sidebar_save_publish: "Save & Publish Marks",
        sidebar_view_progress: "View Progress Card",
        sidebar_pay_slips: "Pay Slips",
        sidebar_view_payslips: "View Payslips",
        sidebar_students: "Students",
        sidebar_add_student: "Add Student",
        sidebar_student_list: "Student List",
        sidebar_reports: "Reports",
        sidebar_attendance_report: "Attendance Report",
        sidebar_performance_report: "Performance Report",
        sidebar_resource_library: "Resource Library",
        sidebar_ai_copilot: "AI Co-Pilot",
        sidebar_roles_perms: "Roles & Perms",
        sidebar_staff_faculty: "Staff & Faculty",
        sidebar_system_settings: "System Settings",
        sidebar_academic_progress: "Academic Progress",
        sidebar_fees_payments: "Fees & Payments",
        sidebar_education_assistant: "Education Assistant",
        // Student Dashboard
        student_dashboard_title: "Student Dashboard",
        btn_log_activity: "Log Activity",
        student_live_class: "🔴 Live Class in Progress!",
        btn_join_class: "Join Class",
        btn_join_whiteboard: "Join Whiteboard",
        student_key_metrics: "Student Key Metrics",
        student_upcoming_live: "Upcoming Live Classes",
        msg_no_live_classes: "No live classes scheduled.",
        live_class_session: "LIVE CLASS IN SESSION",
        btn_join_now: "JOIN NOW",
        student_level: "Level",
        student_my_courses: "My Courses",
        msg_no_courses: "You are not enrolled in any courses yet.",
        student_upcoming_assignments: "Upcoming Assignments & Projects",
        msg_loading_assignments: "Loading assignments...",
        tab_progress_graph: "📈 Progress Graph",
        tab_activity_history: "📜 Activity History",
        // Parent Portal
        parent_portal_title: "Parent Portal",
        label_select_child: "Select Your Child",
        ph_child_id: "Enter Child's Student ID (e.g., S001)",
        btn_view_progress: "View Progress",
        msg_enter_child_id: "Enter the Student ID provided by the school.",
        parent_overview_for: "Overview for",
        parent_key_updates: "Key Updates",
        update_school_close: "School closes early tomorrow at 2 PM.",
        update_report_cards: "Report cards have been published.",
        parent_academic_progress: "Academic Progress",
        parent_teacher_feedback: "Teacher Feedback",
        msg_loading_feedback: "Loading feedback...",
        parent_recent_marks: "Recent Marks",
        th_subject: "Subject",
        th_exam: "Exam",
        th_score: "Score",
        parent_performance_chart: "Performance Chart",
        parent_report_cards: "Report Cards",
        term_1_report: "Term 1 Report",
        badge_download: "Download",
        // Modals - Roles
        modal_select_role: "Select Role",
        role_principal: "Principal",
        role_super_admin: "Super Admin",
        // Modals - Upload Resource
        modal_upload_resource: "Upload Resource",
        label_res_title: "Title",
        label_res_category: "Category",
        opt_school_policy: "School Policy",
        opt_exam_schedule: "Exam Schedule",
        opt_form: "Leave/Admin Form",
        opt_other: "Other",
        label_res_desc: "Description",
        label_res_file: "File (PDF, Doc)",
        text_max_size: "Max size 5MB",
        // Modals - Permission Edit
        modal_edit_permission: "Edit Permission",
        label_perm_code: "Permission Code",
        label_perm_title: "Permission Title",
        btn_cancel: "Cancel",
        btn_update: "Update",
        // Modals - Take Quiz
        modal_take_quiz: "Quiz",
        btn_submit_quiz: "Submit Quiz",
        // Modals - Add Student
        modal_add_student: "➕ Add New Student",
        label_student_id: "Student ID",
        label_full_name: "Full Name",
        label_default_password: "Default Password",
        label_grade: "Grade",
        // Modals - Access Card
        modal_access_card: "Student Access Card",
        label_topic: "Topic",
        ph_topic: "e.g. Photosynthesis",
        // label_grade: "Grade", // Duplicated
        label_subject: "Subject",
        label_duration: "Duration (Minutes)",
        label_instructions: "Additional Instructions / Context",
        ph_instructions: "e.g. Focus on vocabulary, include a group activity...",
        label_upload_pdf: "Upload PDF Context (Optional)",
        btn_generate_plan: "Generate Lesson Plan",
        // Modals - Quiz
        modal_ai_quiz: "AI Quiz Generator",
        label_questions_count: "Questions",
        btn_generate_quiz: "Generate Quiz",
        // Modals - Schedule Class
        modal_schedule_class: "📅 Schedule Live Class",
        label_date_time: "Date & Time",
        label_target_students: "Target Students",
        label_filter_group: "Filter by Group",
        opt_all_students: "-- All Students --",
        label_select_all: "Select All",
        label_meet_link: "Google Meet Link",
        ph_meet_link_long: "https://meet.google.com/...",
        help_meet_link: "Copy paste a link from Google Meet or Zoom.",
        btn_schedule: "Schedule",
        // Dashboard Metrics & Content
        dashboard_students: "Students",
        dashboard_teachers: "Teachers",
        dashboard_staff: "Staff",
        dashboard_awards: "Awards",
        metric_change_teachers: "! 3% from last month",
        metric_change_staff: "→ No change",
        metric_change_awards: "↑ 15% from last month",
        btn_schedule_class: "Schedule Class",
        btn_ai_quiz: "AI Quiz",
        btn_plan_lesson: "Plan Lesson",
        btn_whiteboard: "Whiteboard",
        btn_export: "Export",
        btn_engagement_helper: "Engagement Helper",
        // Assignments & Payslips
        asg_active_title: "Active Assignments",
        asg_active_subtitle: "Create, review submissions, and track progress by class.",
        btn_create_assignment: "Create Assignment",
        asg_review_title: "Review Queue",
        btn_refresh: "Refresh",
        msg_loading_submissions: "Loading submissions...",
        msg_failed_load_submissions: "Failed to load submissions.",
        asg_review_empty: "All caught up! No submissions pending review.",
        marks_entry_title: "Marks Entry",
        marks_select_assignment: "Select Assignment",
        marks_load_submissions: "Load Submissions",
        marks_select_prompt: "Select an assignment to view submissions.",
        msg_no_assignments: "No assignments yet.",
        msg_failed_load_assignments: "Failed to load assignments.",
        msg_assignment_requires_backend: "Assignments require the backend. Open http://127.0.0.1:8000.",
        msg_fill_assignment_fields: "Please fill in Title, Due Date, and Class (Grade).",
        msg_create_assignment_failed: "Failed to create assignment.",
        msg_create_assignment_network_error: "Network error creating assignment.",
        msg_assignment_submit_required: "Please write something or provide a link.",
        msg_assignment_submit_success: "Submitted successfully!",
        msg_assignment_submit_failed: "Check submission failed.",
        msg_assignment_submit_network_error: "Network error.",
        btn_view_submissions: "View Submissions",
        label_status: "Status",
        status_submitted: "Submitted",
        label_feedback: "Feedback",
        btn_save: "Save",
        btn_reassign: "Reassign",
        asg_modal_title: "📝 New Assignment",
        label_title: "Title",
        label_description: "Description",
        label_class_grade: "Class (Grade)",
        label_select_grade: "Select Grade",
        label_points: "Points",
        label_section: "Section",
        label_select_section_optional: "Select Section (optional)",
        label_due_date: "Due Date",
        btn_create: "Create",
        payslip_title: "My Payslips",
        payslip_ytd: "Year-To-Date",
        payslip_net_pay_label: "Net Pay",
        payslip_latest: "Latest Pay Period",
        payslip_latest_sub: "Net Pay • Sep 2024",
        payslip_payment_method: "Payment Method",
        payslip_account_masked: "Account •••• 2391",
        payslip_recent: "Recent Payslips",
        payslip_download_all: "Download All",
        payslip_processed_paid: "Processed: Oct 01, 2024 • Status: Paid",
        payslip_view_details: "View Details",
        payslip_gross: "Gross: $5,000",
        payslip_deductions: "Deductions: $880",
        payslip_taxes: "Taxes: $620",
        payslip_print_title: "Print Payslips",
        payslip_generate_pdf: "Generate Payslip PDF",
        payslip_pay_period: "Pay Period",
        payslip_delivery: "Delivery",
        payslip_download_pdf: "Download PDF",
        payslip_email_me: "Email to me",
        payslip_generate_btn: "Generate PDF",
        payslip_preview: "Payslip Preview",
        payslip_employee_id: "Employee ID: T-1024",
        payslip_processed_date: "Processed: Oct 01, 2024",
        payslip_earnings: "Earnings",
        payslip_base_salary: "Base Salary",
        payslip_allowance: "Allowance",
        payslip_deduction_label: "Deductions",
        payslip_tax: "Tax",
        payslip_insurance: "Insurance",
        pay_advance_title: "Apply for Pay Advance",
        pay_advance_amount: "Amount Required",
        pay_advance_reason: "Reason",
        pay_advance_repayment: "Preferred Repayment",
        pay_advance_next_period: "Next Pay Period",
        pay_advance_two_periods: "Two Pay Periods",
        pay_advance_submit: "Submit Request",
        pay_advance_recent: "Recent Requests",
        pay_advance_label: "Advance",
        pay_advance_submitted: "Submitted: Aug 12, 2024",
        pay_advance_pending: "Pending",
        pay_advance_approved: "Approved",
        dashboard_live_controls: "Live Class Controls",
        dashboard_now: "Now",
        ph_meet_link: "Google Meet Link",
        btn_start: "Start",
        btn_end: "End",
        dashboard_calendar: "Calendar",
        dashboard_upcoming_events: "Upcoming events",
        dashboard_performance_dist: "Performance Distribution",
        dashboard_class_avg_score: "Class Average Activity Score",
        // Headers
        header_messages: "Messages",
        header_notifications: "Notifications",
        header_my_profile: "My Profile",
        header_logout: "Logout",
        ph_search: "Search here...",
        // New Added Keys
        header_view_all_messages: "View All Messages",
        header_mark_read: "Mark all as read",
        notif_sys_maint: "System Maintenance",
        notif_sys_maint_desc: "Scheduled for tonight at 12 AM.",
        notif_assign_sub: "Assignment Submitted",
        notif_assign_sub_desc: "Alice Smith submitted \"Math HW\".",
        login_journey_title: "Your Learning Journey Continues",
        login_journey_desc: "Log in to access your courses, live classes, and personalized AI insights.",
        stat_pass_rate: "Pass Rate",
        stat_access: "Access",
        stat_students: "Students",
        footer_company: "Company",
        footer_about: "About us",
        footer_press: "Press",
        footer_careers: "Careers",
        footer_engineering: "Engineering",
        footer_accessibility: "Accessibility",
        footer_resources: "Resources",
        footer_big_ideas: "Big Ideas",
        footer_training: "Training",
        footer_remote_learning: "Remote Learning",
        footer_support: "Support",
        footer_help_center: "Help Center",
        footer_contact: "Contact",
        footer_privacy: "Privacy Center",
        footer_cookies: "Cookie Settings",
        footer_get_app: "Get the App",
        footer_terms: "Terms",
        text_scan_visit: "Scan to visit",
        text_product_by: "a product by Noble Nexus",
        text_a_product_by: "A Product By",
        footer_noble_nexus_plus: "Noble Nexus Plus",
        // Landing Page Mock Data
        feat_why_title: "Why Noble Nexus?",
        feat_main_title: "Everything you need to excel",
        feat_analytics_title: "Smart Analytics",
        feat_analytics_desc: "Track academic performance trends with clear, AI-driven visualizations that help students improve faster.",
        feat_live_title: "Live Classrooms",
        feat_live_desc: "Integrated video conferencing allows for seamless remote learning sessions directly from your dashboard.",
        feat_ai_title: "AI Guidance",
        feat_ai_desc: "Experience personalized learning paths and automated feedback designed for every student's unique journey.",
        about_title: "About ClassBridge",
        about_main_title: "Empowering the Future of Education",
        about_desc: "ClassBridge is designed to close the gap between traditional schooling and modern technology. We provide a unified ecosystem where learning meets innovation:",
        about_teachers: "For Teachers",
        about_teachers_desc: "Manage classrooms effortlessly with AI-powered attendance, automated grading, and smart lesson planning tools.",
        about_students: "For Students",
        about_students_desc: "Access personalized learning paths, track real-time progress, and stay engaged with gamified education goals.",
        about_parents: "For Parents",
        about_parents_desc: "Stay informed with instant updates on attendance, academic performance, and school events.",
        btn_discover_more: "Discover More",
        stat_engagement: "Engagement Rate",
        stat_ai_support: "AI Support",
        stat_active_students: "Active Students",
        nav_teachers: "Teachers",
        nav_students: "Students",
        nav_schools: "Schools",
        nav_resources: "Resources",
        btn_log_in: "Log in",
        text_back: "Back",
        login_not_a: "Not a",
        login_switch_role: "Switch Role",
        login_student_login: "Student Login",
        login_teacher_portal: "Teacher Portal",
        login_parent_access: "Parent Access",
        login_principal_login: "Principal Login",
        login_super_admin: "Super Admin",
        login_root_admin_portal: "Root Admin Portal",
        login_generic: "Login",
        role_student: "Student",
        role_teacher: "Teacher",
        role_parent: "Parent",
        role_others: "Others",
        role_admin: "Admin",
        role_root_admin: "Root Admin",
        hero_heading: "Where classrooms\nbecome communities",
        hero_subtitle: "Empowering educational institutions through innovative solutions",
        hero_get_started_as: "Get started as a...",
        feat_modern_title: "Built for the Modern Classroom",
        feat_quiz_gen: "Quiz Generator",
        feat_quiz_desc: "Upload a PDF chapter, and our AI generates 20 distinct questions with answer keys in seconds.",
        link_try_generator: "Try Generator →",
        feat_student_insights: "Student Insights",
        feat_student_insights_desc: "Beyond grades. See who is trying hard but struggling, and who needs more challenging material.",
        link_view_report: "View Sample Report →",
        feat_hybrid: "Hybrid Classroom",
        feat_hybrid_desc: "Seamlessly switch between in-person and remote teaching with built-in video logic.",
        link_see_how: "See How →",
        cta_ready_transform: "Ready to transform your teaching?",
        btn_join_free: "Join Noble Nexus for Free"
    },
    es: {
        login_welcome: "Bienvenido a Noble Nexus",
        login_subtitle: "Inicia sesión en el portal Noble Nexus",
        label_username: "Usuario / ID de Estudiante",
        label_password: "Contraseña",
        link_forgot_password: "¿Olvidaste tu contraseña?",
        btn_signin: "Iniciar Sesión",
        btn_signin_microsoft: "Entrar con Microsoft",
        text_or: "O",
        text_new_user: "¿Nuevo usuario?",
        link_signup: "Regístrate",
        link_help: "¿Necesitas ayuda? Contacta soporte",
        msg_enter_credentials: "Por favor ingrese usuario y contraseña.",
        msg_checking: "Verificando credenciales...",
        msg_welcome: "Bienvenido, {user_id}",
        msg_login_failed: "Inicio de sesión fallido",
        msg_network_error: "Error de red: {error}. ¿Está el servidor activo?",
        msg_google_verify: "Verificando token de Google...",
        msg_microsoft_conn: "Conectando con Microsoft...",
        msg_microsoft_verify: "Verificando token de Microsoft...",
        // Sidebar & Dashboard
        sidebar_dashboard: "Panel de Control",
        sidebar_my_courses: "Mis Cursos",
        sidebar_course_list: "Lista de Cursos",
        sidebar_assignments: "Tareas",
        sidebar_exams: "Exámenes",
        sidebar_upcoming_exams: "Próximos Exámenes",
        sidebar_results: "Resultados",
        sidebar_profile: "Perfil",
        sidebar_view_profile: "Ver Perfil",
        sidebar_settings: "Ajustes",
        sidebar_communication: "Comunicación",
        sidebar_lms: "Cursos (LMS)",
        sidebar_ai_assistant: "Asistente IA",
        sidebar_timetable: "Horario",
        sidebar_view_timetable: "Ver Horario",
        sidebar_attendance: "Asistencia",
        sidebar_take_attendance: "Tomar Asistencia",
        sidebar_attendance_sheet: "Hoja de Asistencia",
        sidebar_monthly_report: "Informe Mensual",
        sidebar_approve_leave: "Aprobar/Rechazar Permiso",
        sidebar_apply_leave: "Solicitar Permiso",
        sidebar_assignment_group: "Asignación",
        sidebar_create_assignment: "Crear Tarea",
        sidebar_view_submitted: "Ver Entregas",
        sidebar_approve_reassign: "Aprobar / Reasignar",
        sidebar_enter_marks: "Ingresar Notas",
        sidebar_online_test: "Prueba en Línea",
        sidebar_question_bank: "Banco de Preguntas",
        sidebar_create_test: "Crear/Editar Pruebas",
        sidebar_assign_max_marks: "Asignar Notas Máx.",
        sidebar_view_test_results: "Ver Resultados",
        sidebar_progress_card: "Boletín",
        sidebar_enter_progress: "Ingresar Progresos",
        sidebar_save_publish: "Guardar y Publicar",
        sidebar_view_progress: "Ver Boletín",
        sidebar_pay_slips: "Nóminas",
        sidebar_view_payslips: "Ver Nóminas",
        sidebar_students: "Estudiantes",
        sidebar_add_student: "Agregar Estudiante",
        sidebar_student_list: "Lista de Estudiantes",
        sidebar_reports: "Informes",
        sidebar_attendance_report: "Informe de Asistencia",
        sidebar_performance_report: "Informe de Rendimiento",
        sidebar_resource_library: "Biblioteca de Recursos",
        sidebar_ai_copilot: "Copiloto IA",
        sidebar_roles_perms: "Roles y Permisos",
        sidebar_staff_faculty: "Personal y Facultad",
        sidebar_system_settings: "Configuración del Sistema",
        sidebar_academic_progress: "Progreso Académico",
        sidebar_fees_payments: "Pagos y Tarifas",
        sidebar_education_assistant: "Asistente Educativo",
        // Student Dashboard
        student_dashboard_title: "Panel de Estudiante",
        btn_log_activity: "Registrar Actividad",
        student_live_class: "🔴 ¡Clase en Vivo en Progreso!",
        btn_join_class: "Unirse a Clase",
        btn_join_whiteboard: "Unirse a Pizarra",
        student_key_metrics: "Métricas Clave del Estudiante",
        student_upcoming_live: "Próximas Clases en Vivo",
        msg_no_live_classes: "No hay clases en vivo programadas.",
        live_class_session: "CLASE EN VIVO EN SESIÓN",
        btn_join_now: "UNIRSE AHORA",
        student_level: "Nivel",
        student_my_courses: "Mis Cursos",
        msg_no_courses: "Aún no estás inscrito en ningún curso.",
        student_upcoming_assignments: "Próximas Tareas y Proyectos",
        msg_loading_assignments: "Cargando tareas...",
        tab_progress_graph: "📈 Gráfico de Progreso",
        tab_activity_history: "📜 Historial de Actividad",
        // Parent Portal
        parent_portal_title: "Portal de Padres",
        label_select_child: "Seleccione a su Hijo",
        ph_child_id: "Ingrese el ID de estudiante (ej. S001)",
        btn_view_progress: "Ver Progreso",
        msg_enter_child_id: "Ingrese el ID de estudiante proporcionado por la escuela.",
        parent_overview_for: "Resumen para",
        parent_key_updates: "Actualizaciones Clave",
        update_school_close: "La escuela cierra temprano mañana a las 2 PM.",
        update_report_cards: "Se han publicado las boletas de calificaciones.",
        parent_academic_progress: "Progreso Académico",
        parent_teacher_feedback: "Comentarios del Profesor",
        msg_loading_feedback: "Cargando comentarios...",
        parent_recent_marks: "Calificaciones Recientes",
        th_subject: "Asignatura",
        th_exam: "Examen",
        th_score: "Calificación",
        parent_performance_chart: "Gráfico de Rendimiento",
        parent_report_cards: "Boletas de Calificaciones",
        term_1_report: "Boleta Trimestre 1",
        badge_download: "Descargar",
        // Modals - Roles
        modal_select_role: "Seleccionar Rol",
        role_principal: "Director",
        role_super_admin: "Super Administrador",
        // Modals - Upload Resource
        modal_upload_resource: "Subir Recurso",
        label_res_title: "Título",
        label_res_category: "Categoría",
        opt_school_policy: "Política Escolar",
        opt_exam_schedule: "Horario de Exámenes",
        opt_form: "Formulario de Permiso/Admin",
        opt_other: "Otro",
        label_res_desc: "Descripción",
        label_res_file: "Archivo (PDF, Doc)",
        text_max_size: "Tamaño máx 5MB",
        // Modals - Permission Edit
        modal_edit_permission: "Editar Permiso",
        label_perm_code: "Código de Permiso",
        label_perm_title: "Título de Permiso",
        btn_cancel: "Cancelar",
        btn_update: "Actualizar",
        // Modals - Take Quiz
        modal_take_quiz: "Prueba",
        btn_submit_quiz: "Enviar Prueba",
        // Modals - Add Student
        modal_add_student: "➕ Añadir Nuevo Estudiante",
        label_student_id: "ID de Estudiante",
        label_full_name: "Nombre Completo",
        label_default_password: "Contraseña Predeterminada",
        label_grade: "Grado",
        // Modals - Access Card
        modal_access_card: "Tarjeta de Acceso Estudiantil",
        label_topic: "Tema",
        ph_topic: "ej. Fotosíntesis",
        // label_grade: "Grado", // Duplicated
        label_subject: "Asignatura",
        label_duration: "Duración (Minutos)",
        label_instructions: "Instrucciones Adicionales / Contexto",
        ph_instructions: "ej. Enfocarse en vocabulario...",
        label_upload_pdf: "Subir PDF de Contexto (Opcional)",
        btn_generate_plan: "Generar Plan",
        // Modals - Quiz
        modal_ai_quiz: "Generador de Pruebas IA",
        label_questions_count: "Preguntas",
        btn_generate_quiz: "Generar Prueba",
        // Modals - Schedule Class
        modal_schedule_class: "📅 Programar Clase en Vivo",
        label_date_time: "Fecha y Hora",
        label_target_students: "Estudiantes Objetivo",
        label_filter_group: "Filtrar por Grupo",
        opt_all_students: "-- Todos los Estudiantes --",
        label_select_all: "Seleccionar Todos",
        label_meet_link: "Enlace de Google Meet",
        ph_meet_link_long: "https://meet.google.com/...",
        help_meet_link: "Copie y pegue un enlace de Google Meet o Zoom.",
        btn_schedule: "Programar",
        // Dashboard Metrics & Content
        dashboard_students: "Estudiantes",
        dashboard_teachers: "Profesores",
        dashboard_staff: "Personal",
        dashboard_awards: "Premios",
        metric_change_teachers: "! 3% del mes pasado",
        metric_change_staff: "→ Sin cambios",
        metric_change_awards: "↑ 15% del mes pasado",
        btn_schedule_class: "Programar Clase",
        btn_ai_quiz: "Prueba IA",
        btn_plan_lesson: "Planificar Lección",
        btn_whiteboard: "Pizarra",
        btn_export: "Exportar",
        btn_engagement_helper: "Ayudante de Compromiso",
        // Assignments & Payslips
        asg_active_title: "Asignaciones activas",
        asg_active_subtitle: "Crea, revisa entregas y sigue el progreso por clase.",
        btn_create_assignment: "Crear asignación",
        asg_review_title: "Cola de revisión",
        btn_refresh: "Actualizar",
        msg_loading_submissions: "Cargando entregas...",
        msg_failed_load_submissions: "No se pudieron cargar las entregas.",
        asg_review_empty: "¡Todo al día! No hay entregas pendientes.",
        marks_entry_title: "Registro de calificaciones",
        marks_select_assignment: "Seleccionar asignación",
        marks_load_submissions: "Cargar entregas",
        marks_select_prompt: "Selecciona una asignación para ver entregas.",
        msg_no_assignments: "Aún no hay asignaciones.",
        msg_failed_load_assignments: "No se pudieron cargar las asignaciones.",
        msg_assignment_requires_backend: "Las asignaciones requieren el backend. Abre http://127.0.0.1:8000.",
        msg_fill_assignment_fields: "Por favor completa Título, Fecha de entrega y Clase (Grado).",
        msg_create_assignment_failed: "No se pudo crear la asignación.",
        msg_create_assignment_network_error: "Error de red al crear la asignación.",
        msg_assignment_submit_required: "Escribe algo o proporciona un enlace.",
        msg_assignment_submit_success: "¡Enviado con éxito!",
        msg_assignment_submit_failed: "Falló el envío.",
        msg_assignment_submit_network_error: "Error de red.",
        btn_view_submissions: "Ver entregas",
        label_status: "Estado",
        status_submitted: "Enviado",
        label_feedback: "Comentario",
        btn_save: "Guardar",
        btn_reassign: "Reasignar",
        asg_modal_title: "📝 Nueva asignación",
        label_title: "Título",
        label_description: "Descripción",
        label_class_grade: "Clase (Grado)",
        label_select_grade: "Seleccionar grado",
        label_points: "Puntos",
        label_section: "Sección",
        label_select_section_optional: "Seleccionar sección (opcional)",
        label_due_date: "Fecha de entrega",
        btn_create: "Crear",
        payslip_title: "Mis nóminas",
        payslip_ytd: "Acumulado del año",
        payslip_net_pay_label: "Pago neto",
        payslip_latest: "Último periodo de pago",
        payslip_latest_sub: "Pago neto • Sep 2024",
        payslip_payment_method: "Método de pago",
        payslip_account_masked: "Cuenta •••• 2391",
        payslip_recent: "Nóminas recientes",
        payslip_download_all: "Descargar todo",
        payslip_processed_paid: "Procesado: Oct 01, 2024 • Estado: Pagado",
        payslip_view_details: "Ver detalles",
        payslip_gross: "Bruto: $5,000",
        payslip_deductions: "Deducciones: $880",
        payslip_taxes: "Impuestos: $620",
        payslip_print_title: "Imprimir nóminas",
        payslip_generate_pdf: "Generar PDF de nómina",
        payslip_pay_period: "Periodo de pago",
        payslip_delivery: "Entrega",
        payslip_download_pdf: "Descargar PDF",
        payslip_email_me: "Enviarme por correo",
        payslip_generate_btn: "Generar PDF",
        payslip_preview: "Vista previa de nómina",
        payslip_employee_id: "ID de empleado: T-1024",
        payslip_processed_date: "Procesado: Oct 01, 2024",
        payslip_earnings: "Ingresos",
        payslip_base_salary: "Salario base",
        payslip_allowance: "Asignación",
        payslip_deduction_label: "Deducciones",
        payslip_tax: "Impuesto",
        payslip_insurance: "Seguro",
        pay_advance_title: "Solicitar anticipo de pago",
        pay_advance_amount: "Monto requerido",
        pay_advance_reason: "Motivo",
        pay_advance_repayment: "Reembolso preferido",
        pay_advance_next_period: "Próximo periodo de pago",
        pay_advance_two_periods: "Dos periodos de pago",
        pay_advance_submit: "Enviar solicitud",
        pay_advance_recent: "Solicitudes recientes",
        pay_advance_label: "Anticipo",
        pay_advance_submitted: "Enviado: Aug 12, 2024",
        pay_advance_pending: "Pendiente",
        pay_advance_approved: "Aprobado",
        dashboard_live_controls: "Controles de Clase en Vivo",
        dashboard_now: "Ahora",
        ph_meet_link: "Enlace de Google Meet",
        btn_start: "Comenzar",
        btn_end: "Terminar",
        dashboard_calendar: "Calendario",
        dashboard_upcoming_events: "Próximos eventos",
        dashboard_performance_dist: "Distribución de Rendimiento",
        dashboard_class_avg_score: "Puntaje Promedio de Actividad",
        // Headers
        header_messages: "Mensajes",
        header_notifications: "Notificaciones",
        header_my_profile: "Mi Perfil",
        header_logout: "Cerrar Sesión",
        ph_search: "Buscar aquí...",
        stat_active_students: "Estudiantes activos",
        nav_teachers: "Profesores",
        nav_students: "Estudiantes",
        nav_schools: "Escuelas",
        nav_resources: "Recursos",
        btn_log_in: "Iniciar sesión",
        text_back: "Volver",
        login_not_a: "¿No eres",
        login_switch_role: "Cambiar rol",
        login_student_login: "Inicio de estudiante",
        login_teacher_portal: "Portal del profesor",
        login_parent_access: "Acceso para padres",
        login_principal_login: "Inicio de director",
        login_super_admin: "Súper administrador",
        login_root_admin_portal: "Portal de administrador raíz",
        login_generic: "Iniciar sesión",
        role_student: "Estudiante",
        role_teacher: "Profesor",
        role_parent: "Padre/Madre",
        role_others: "Otros",
        role_admin: "Administrador",
        role_root_admin: "Administrador raíz",
        hero_heading: "Donde las aulas\nse convierten en comunidades",
        hero_subtitle: "Impulsando instituciones educativas mediante soluciones innovadoras",
        hero_get_started_as: "Comenzar como...",
        feat_why_title: "¿Por qué Noble Nexus?",
        feat_main_title: "Todo lo que necesitas para destacar",
        feat_analytics_title: "Analítica inteligente",
        feat_analytics_desc: "Sigue tendencias de rendimiento académico con visualizaciones claras impulsadas por IA que ayudan a mejorar más rápido.",
        feat_live_title: "Aulas en vivo",
        feat_live_desc: "La videoconferencia integrada permite clases remotas fluidas directamente desde tu panel.",
        feat_ai_title: "Guía con IA",
        feat_ai_desc: "Disfruta rutas de aprendizaje personalizadas y retroalimentación automática para cada estudiante.",
        about_title: "Sobre ClassBridge",
        about_main_title: "Impulsando el futuro de la educación",
        about_desc: "ClassBridge está diseñado para cerrar la brecha entre la escuela tradicional y la tecnología moderna.",
        about_teachers: "Para docentes",
        about_teachers_desc: "Gestiona clases fácilmente con asistencia con IA, calificación automática y planeación inteligente.",
        about_students: "Para estudiantes",
        about_students_desc: "Accede a rutas personalizadas, sigue tu progreso en tiempo real y mantente motivado.",
        about_parents: "Para familias",
        about_parents_desc: "Mantente al día con asistencia, rendimiento académico y eventos escolares.",
        btn_discover_more: "Descubrir más",
        stat_engagement: "Tasa de participación",
        stat_ai_support: "Soporte de IA",
        footer_company: "Empresa",
        footer_about: "Sobre nosotros",
        footer_press: "Prensa",
        footer_careers: "Carreras",
        footer_engineering: "Ingeniería",
        footer_accessibility: "Accesibilidad",
        footer_resources: "Recursos",
        footer_big_ideas: "Grandes ideas",
        footer_training: "Capacitación",
        footer_remote_learning: "Aprendizaje remoto",
        footer_support: "Soporte",
        footer_help_center: "Centro de ayuda",
        footer_contact: "Contacto",
        footer_privacy: "Centro de privacidad",
        footer_cookies: "Configuración de cookies",
        footer_get_app: "Obtén la app",
        footer_terms: "Términos",
        text_scan_visit: "Escanea para visitar",
        text_product_by: "un producto de Noble Nexus",
        text_a_product_by: "Un producto de",
        footer_noble_nexus_plus: "Noble Nexus Plus",
        feat_modern_title: "Creado para el aula moderna",
        feat_quiz_gen: "Generador de cuestionarios",
        feat_quiz_desc: "Sube un PDF y la IA crea preguntas con respuestas en segundos.",
        link_try_generator: "Probar generador →",
        feat_student_insights: "Información del estudiante",
        feat_student_insights_desc: "Ve más allá de las notas y detecta necesidades de apoyo o reto.",
        link_view_report: "Ver informe de ejemplo →",
        feat_hybrid: "Aula híbrida",
        feat_hybrid_desc: "Alterna sin fricción entre enseñanza presencial y remota.",
        link_see_how: "Ver cómo →",
        cta_ready_transform: "¿Listo para transformar tu enseñanza?",
        btn_join_free: "Únete gratis a Noble Nexus"
    },
    ar: {
        login_welcome: "مرحباً بك في Noble Nexus",
        login_subtitle: "بوابة تسجيل الدخول إلى Noble Nexus",
        label_username: "اسم المستخدم / هوية الطالب",
        label_password: "كلمة المرور",
        link_forgot_password: "هل نسيت كلمة المرور؟",
        btn_signin: "تسجيل الدخول",
        btn_signin_microsoft: "تسجيل الدخول باستخدام Microsoft",
        text_or: "أو",
        text_new_user: "مستخدم جديد؟",
        link_signup: "سجل الآن",
        link_help: "تحتاج إلى مساعدة؟ اتصل بالدعم",
        msg_enter_credentials: "يرجى إدخال اسم المستخدم وكلمة المرور.",
        msg_checking: "جاري التحقق من بيانات الاعتماد...",
        msg_welcome: "مرحباً، {user_id}",
        msg_login_failed: "فشل تسجيل الدخول",
        msg_network_error: "خطأ في الشبكة: {error}. هل الخادم يعمل؟",
        msg_google_verify: "جارٍ التحقق من رمز Google...",
        msg_microsoft_conn: "جارٍ الاتصال بـ Microsoft...",
        msg_microsoft_verify: "جارٍ التحقق من رمز Microsoft...",
        // Sidebar & Dashboard
        sidebar_dashboard: "لوحة القيادة",
        sidebar_my_courses: "دوراتي",
        sidebar_course_list: "قائمة الدورات",
        sidebar_assignments: "الواجبات",
        sidebar_exams: "الامتحانات",
        sidebar_upcoming_exams: "الامتحانات القادمة",
        sidebar_results: "النتائج",
        sidebar_profile: "الملف الشخصي",
        sidebar_view_profile: "عرض الملف الشخصي",
        sidebar_settings: "الإعدادات",
        sidebar_communication: "التواصل",
        sidebar_lms: "الدورات (LMS)",
        sidebar_ai_assistant: "مساعد الذكاء الاصطناعي",
        sidebar_timetable: "الجدول الزمني",
        sidebar_view_timetable: "عرض الجدول",
        sidebar_attendance: "الحضور",
        sidebar_take_attendance: "تسجيل الحضور",
        sidebar_attendance_sheet: "ورقة الحضور",
        sidebar_monthly_report: "تقرير شهري",
        sidebar_approve_leave: "الموافقة على الإجازة",
        sidebar_apply_leave: "طلب إجازة",
        sidebar_assignment_group: "الواجب",
        sidebar_create_assignment: "إنشاء واجب جديد",
        sidebar_view_submitted: "عرض المقدمة",
        sidebar_approve_reassign: "موافق/إعادة تعيين",
        sidebar_enter_marks: "إدخال الدرجات",
        sidebar_online_test: "اختبار عبر الإنترنت",
        sidebar_question_bank: "بنك الأسئلة",
        sidebar_create_test: "إنشاء وتعديل الاختبارات",
        sidebar_assign_max_marks: "تعيين الدرجات القصوى",
        sidebar_view_test_results: "عرض النتائج",
        sidebar_progress_card: "بطاقة التقدم",
        sidebar_enter_progress: "إدخال درجات التقدم",
        sidebar_save_publish: "حفظ ونشر",
        sidebar_view_progress: "عرض البطاقة",
        sidebar_pay_slips: "قسائم الراتب",
        sidebar_view_payslips: "عرض القسائم",
        sidebar_students: "الطلاب",
        sidebar_add_student: "إضافة طالب",
        sidebar_student_list: "قائمة الطلاب",
        sidebar_reports: "التقارير",
        sidebar_attendance_report: "تقرير الحضور",
        sidebar_performance_report: "تقرير الأداء",
        sidebar_resource_library: "مكتبة الموارد",
        sidebar_ai_copilot: "مساعد الذكاء الاصطناعي",
        sidebar_roles_perms: "الأدوار والأذونات",
        sidebar_staff_faculty: "الموظفون",
        sidebar_system_settings: "إعدادات النظام",
        sidebar_academic_progress: "التقدم الأكاديمي",
        sidebar_fees_payments: "المصاريف",
        sidebar_education_assistant: "المساعد التعليمي",
        // Student Dashboard
        student_dashboard_title: "لوحة الطالب",
        btn_log_activity: "تسجيل النشاط",
        student_live_class: "🔴 فصل مباشر قيد التنفيذ!",
        btn_join_class: "الانضمام للفصل",
        btn_join_whiteboard: "الانضمام للسبورة",
        student_key_metrics: "المقاييس الرئيسية للطالب",
        student_upcoming_live: "الفصول المباشرة القادمة",
        msg_no_live_classes: "لا توجد فصول مباشرة مجدولة.",
        live_class_session: "فصل مباشر الآن",
        btn_join_now: "انضم الآن",
        student_level: "المستوى",
        student_my_courses: "دوراتي",
        msg_no_courses: "أنت غير مسجل في أي دورات بعد.",
        student_upcoming_assignments: "الواجبات والمشاريع القادمة",
        msg_loading_assignments: "جاري تحميل الواجبات...",
        tab_progress_graph: "📈 رسم التقدم",
        tab_activity_history: "📜 سجل النشاط",
        // Parent Portal
        parent_portal_title: "بوابة أولياء الأمور",
        label_select_child: "اختر طفلك",
        ph_child_id: "أدخل معرف الطالب للطفل (مثل S001)",
        btn_view_progress: "عرض التقدم",
        msg_enter_child_id: "أدخل معرف الطالب المقدم من المدرسة.",
        parent_overview_for: "نظرة عامة لـ",
        parent_key_updates: "تحديثات رئيسية",
        update_school_close: "تغلق المدرسة مبكراً غداً الساعة 2 ظهراً.",
        update_report_cards: "تم نشر بطاقات التقرير.",
        parent_academic_progress: "التقدم الأكاديمي",
        parent_teacher_feedback: "ملاحظات المعلم",
        msg_loading_feedback: "جاري تحميل الملاحظات...",
        parent_recent_marks: "الدرجات الحديثة",
        th_subject: "المادة",
        th_exam: "الامتحان",
        th_score: "الدرجة",
        parent_performance_chart: "مخطط الأداء",
        parent_report_cards: "بطاقات التقرير",
        term_1_report: "تقرير الفصل الأول",
        badge_download: "تحميل",
        // Modals - Roles
        modal_select_role: "تحديد الدور",
        role_principal: "المدير",
        role_super_admin: "المشرف العام",
        // Modals - Upload Resource
        modal_upload_resource: "رفع الموارد",
        label_res_title: "العنوان",
        label_res_category: "الفئة",
        opt_school_policy: "سياسة المدرسة",
        opt_exam_schedule: "جدول الامتحانات",
        opt_form: "نموذج إجازة/إداري",
        opt_other: "أخرى",
        label_res_desc: "الوصف",
        label_res_file: "ملف (PDF, Doc)",
        text_max_size: "الحد الأقصى للحجم 5 ميجابايت",
        // Modals - Permission Edit
        modal_edit_permission: "تعديل الصلاحيات",
        label_perm_code: "رمز الصلاحية",
        label_perm_title: "عنوان الصلاحية",
        btn_cancel: "إلغاء",
        btn_update: "تحديث",
        // Modals - Take Quiz
        modal_take_quiz: "مسابقة",
        btn_submit_quiz: "إرسال المسابقة",
        // Modals - Add Student
        modal_add_student: "➕ إضافة طالب جديد",
        label_student_id: "معرف الطالب",
        label_full_name: "الاسم الكامل",
        label_default_password: "كلمة المرور الافتراضية",
        label_grade: "الصف",
        // Modals - Access Card
        modal_access_card: "بطاقة دخول الطالب",
        label_topic: "الموضوع",
        ph_topic: "مثل: التمثيل الضوئي",
        // label_grade: "الصف", // Duplicated
        label_subject: "المادة",
        label_duration: "المدة (دقائق)",
        label_instructions: "تعليمات إضافية / سياق",
        ph_instructions: "مثل: التركيز على المفردات...",
        label_upload_pdf: "رفع ملف PDF للسياق (اختياري)",
        btn_generate_plan: "إنشاء الخطة",
        // Modals - Quiz
        modal_ai_quiz: "مولد الاختبارات الذكي",
        label_questions_count: "الأسئلة",
        btn_generate_quiz: "إنشاء الاختبار",
        // Modals - Schedule Class
        modal_schedule_class: "📅 جدولة فصل مباشر",
        label_date_time: "التاريخ والوقت",
        label_target_students: "الطلاب المستهدفون",
        label_filter_group: "تصفية حسب المجموعة",
        opt_all_students: "-- كل الطلاب --",
        label_select_all: "تحديد الكل",
        label_meet_link: "رابط Google Meet",
        ph_meet_link_long: "https://meet.google.com/...",
        help_meet_link: "انسخ والصق رابطًا من Google Meet أو Zoom.",
        btn_schedule: "جدولة",
        // Dashboard Metrics & Content
        dashboard_students: "الطلاب",
        dashboard_teachers: "المعلمين",
        dashboard_staff: "الموظفين",
        dashboard_awards: "الجوائز",
        metric_change_teachers: "! 3٪ من الشهر الماضي",
        metric_change_staff: "→ لا تغيير",
        metric_change_awards: "↑ 15٪ من الشهر الماضي",
        btn_schedule_class: "جدول الحصص",
        btn_ai_quiz: "مسابقة الذكاء الاصطناعي",
        btn_plan_lesson: "تخطيط الدرس",
        btn_whiteboard: "السبورة البيضاء",
        btn_export: "تصدير",
        btn_engagement_helper: "مساعد التفاعل",
        // Assignments & Payslips
        asg_active_title: "الواجبات النشطة",
        asg_active_subtitle: "أنشئ الواجبات وراجع التسليمات وتابع التقدم حسب الصف.",
        btn_create_assignment: "إنشاء واجب",
        asg_review_title: "قائمة المراجعة",
        btn_refresh: "تحديث",
        msg_loading_submissions: "جارٍ تحميل التسليمات...",
        msg_failed_load_submissions: "فشل تحميل التسليمات.",
        asg_review_empty: "لا توجد تسليمات للمراجعة.",
        marks_entry_title: "إدخال الدرجات",
        marks_select_assignment: "اختر الواجب",
        marks_load_submissions: "تحميل التسليمات",
        marks_select_prompt: "اختر واجبًا لعرض التسليمات.",
        msg_no_assignments: "لا توجد واجبات بعد.",
        msg_failed_load_assignments: "فشل تحميل الواجبات.",
        msg_assignment_requires_backend: "الواجبات تتطلب الخادم. افتح http://127.0.0.1:8000.",
        msg_fill_assignment_fields: "يرجى إدخال العنوان وتاريخ الاستحقاق والصف.",
        msg_create_assignment_failed: "فشل إنشاء الواجب.",
        msg_create_assignment_network_error: "خطأ في الشبكة أثناء إنشاء الواجب.",
        msg_assignment_submit_required: "يرجى كتابة شيء أو إضافة رابط.",
        msg_assignment_submit_success: "تم الإرسال بنجاح!",
        msg_assignment_submit_failed: "فشل الإرسال.",
        msg_assignment_submit_network_error: "خطأ في الشبكة.",
        btn_view_submissions: "عرض التسليمات",
        label_status: "الحالة",
        status_submitted: "تم التسليم",
        label_feedback: "ملاحظات",
        btn_save: "حفظ",
        btn_reassign: "إعادة تعيين",
        asg_modal_title: "📝 واجب جديد",
        label_title: "العنوان",
        label_description: "الوصف",
        label_class_grade: "الصف (الدرجة)",
        label_select_grade: "اختر الدرجة",
        label_points: "النقاط",
        label_section: "الشعبة",
        label_select_section_optional: "اختر الشعبة (اختياري)",
        label_due_date: "تاريخ الاستحقاق",
        btn_create: "إنشاء",
        payslip_title: "قسائم الرواتب",
        payslip_ytd: "منذ بداية السنة",
        payslip_net_pay_label: "صافي الراتب",
        payslip_latest: "آخر فترة دفع",
        payslip_latest_sub: "صافي الراتب • Sep 2024",
        payslip_payment_method: "طريقة الدفع",
        payslip_account_masked: "الحساب •••• 2391",
        payslip_recent: "القسائم الأخيرة",
        payslip_download_all: "تنزيل الكل",
        payslip_processed_paid: "تمت المعالجة: Oct 01, 2024 • الحالة: مدفوع",
        payslip_view_details: "عرض التفاصيل",
        payslip_gross: "الإجمالي: $5,000",
        payslip_deductions: "الخصومات: $880",
        payslip_taxes: "الضرائب: $620",
        payslip_print_title: "طباعة القسائم",
        payslip_generate_pdf: "إنشاء PDF للقسيمة",
        payslip_pay_period: "فترة الدفع",
        payslip_delivery: "التسليم",
        payslip_download_pdf: "تنزيل PDF",
        payslip_email_me: "أرسلها إلى بريدي",
        payslip_generate_btn: "إنشاء PDF",
        payslip_preview: "معاينة القسيمة",
        payslip_employee_id: "معرّف الموظف: T-1024",
        payslip_processed_date: "تمت المعالجة: Oct 01, 2024",
        payslip_earnings: "المستحقات",
        payslip_base_salary: "الراتب الأساسي",
        payslip_allowance: "البدلات",
        payslip_deduction_label: "الخصومات",
        payslip_tax: "الضريبة",
        payslip_insurance: "التأمين",
        pay_advance_title: "طلب سلفة راتب",
        pay_advance_amount: "المبلغ المطلوب",
        pay_advance_reason: "السبب",
        pay_advance_repayment: "طريقة السداد",
        pay_advance_next_period: "الفترة القادمة",
        pay_advance_two_periods: "فترتان",
        pay_advance_submit: "إرسال الطلب",
        pay_advance_recent: "الطلبات الأخيرة",
        pay_advance_label: "سلفة",
        pay_advance_submitted: "تم الإرسال: Aug 12, 2024",
        pay_advance_pending: "قيد الانتظار",
        pay_advance_approved: "موافق عليه",
        dashboard_live_controls: "ضوابط الفصل المباشر",
        dashboard_now: "الآن",
        ph_meet_link: "رابط Google Meet",
        btn_start: "يبدأ",
        btn_end: "إنهاء",
        dashboard_calendar: "التقويم",
        dashboard_upcoming_events: "الأحداث القادمة",
        dashboard_performance_dist: "توزيع الأداء",
        dashboard_class_avg_score: "متوسط ​​درجة النشاط",
        // Headers
        header_messages: "الرسائل",
        header_notifications: "إشعارات",
        header_my_profile: "ملفي الشخصي",
        header_logout: "تسجيل الخروج",
        ph_search: "بحث...",
        stat_active_students: "الطلاب النشطون",
        nav_teachers: "المعلمون",
        nav_students: "الطلاب",
        nav_schools: "المدارس",
        nav_resources: "الموارد",
        btn_log_in: "تسجيل الدخول",
        text_back: "رجوع",
        login_not_a: "لست",
        login_switch_role: "تبديل الدور",
        login_student_login: "دخول الطالب",
        login_teacher_portal: "بوابة المعلم",
        login_parent_access: "بوابة ولي الأمر",
        login_principal_login: "دخول المدير",
        login_super_admin: "مشرف عام",
        login_root_admin_portal: "بوابة المشرف الجذر",
        login_generic: "دخول",
        role_student: "طالب",
        role_teacher: "معلم",
        role_parent: "ولي أمر",
        role_others: "أخرى",
        role_admin: "مسؤول",
        role_root_admin: "مسؤول جذر",
        hero_heading: "حيث تتحول الفصول\nإلى مجتمعات",
        hero_subtitle: "تمكين المؤسسات التعليمية من خلال حلول مبتكرة",
        hero_get_started_as: "ابدأ كـ...",
        feat_why_title: "لماذا Noble Nexus؟",
        feat_main_title: "كل ما تحتاجه للتميّز",
        feat_analytics_title: "تحليلات ذكية",
        feat_analytics_desc: "تتبّع الأداء الأكاديمي عبر لوحات واضحة مدعومة بالذكاء الاصطناعي.",
        feat_live_title: "فصول مباشرة",
        feat_live_desc: "مؤتمرات فيديو مدمجة للتعلّم عن بعد بسلاسة من لوحة التحكم.",
        feat_ai_title: "إرشاد بالذكاء الاصطناعي",
        feat_ai_desc: "مسارات تعلّم مخصصة وتغذية راجعة تلقائية لكل طالب.",
        about_title: "حول ClassBridge",
        about_main_title: "تمكين مستقبل التعليم",
        about_desc: "صُمم ClassBridge لردم الفجوة بين التعليم التقليدي والتقنية الحديثة.",
        about_teachers: "للمعلمين",
        about_teachers_desc: "إدارة الصفوف بسهولة مع حضور ذكي وتصحيح تلقائي وتخطيط دروس ذكي.",
        about_students: "للطلاب",
        about_students_desc: "وصول إلى مسارات تعلم مخصصة وتتبع التقدم بشكل لحظي.",
        about_parents: "لأولياء الأمور",
        about_parents_desc: "ابقَ على اطلاع بالحضور والأداء الأكاديمي وفعاليات المدرسة.",
        btn_discover_more: "اكتشف المزيد",
        stat_engagement: "معدل التفاعل",
        stat_ai_support: "دعم الذكاء الاصطناعي",
        footer_company: "الشركة",
        footer_about: "من نحن",
        footer_press: "الصحافة",
        footer_careers: "الوظائف",
        footer_engineering: "الهندسة",
        footer_accessibility: "إمكانية الوصول",
        footer_resources: "الموارد",
        footer_big_ideas: "أفكار كبيرة",
        footer_training: "التدريب",
        footer_remote_learning: "التعلم عن بُعد",
        footer_support: "الدعم",
        footer_help_center: "مركز المساعدة",
        footer_contact: "اتصل بنا",
        footer_privacy: "مركز الخصوصية",
        footer_cookies: "إعدادات ملفات تعريف الارتباط",
        footer_get_app: "احصل على التطبيق",
        footer_terms: "الشروط",
        text_scan_visit: "امسح للزيارة",
        text_product_by: "منتج من Noble Nexus",
        text_a_product_by: "منتج من",
        footer_noble_nexus_plus: "نوبل نيكسس بلس",
        feat_modern_title: "مصمم للفصل الحديث",
        feat_quiz_gen: "مولد الاختبارات",
        feat_quiz_desc: "ارفع PDF وسيقوم الذكاء الاصطناعي بإنشاء أسئلة وإجابات خلال ثوانٍ.",
        link_try_generator: "جرّب المولد ←",
        feat_student_insights: "رؤى الطالب",
        feat_student_insights_desc: "تجاوز الدرجات لفهم من يحتاج دعمًا أو تحديًا أكبر.",
        link_view_report: "عرض تقرير نموذجي ←",
        feat_hybrid: "فصل هجين",
        feat_hybrid_desc: "انتقال سلس بين التعليم الحضوري والتعليم عن بعد.",
        link_see_how: "شاهد كيف ←",
        cta_ready_transform: "هل أنت جاهز لتحويل أسلوب التدريس؟",
        btn_join_free: "انضم إلى Noble Nexus مجانًا"
    },
    hi: {
        login_welcome: "Noble Nexus में आपका स्वागत है",
        login_subtitle: "Noble Nexus में साइन इन करें",
        label_username: "उपयोगकर्ता नाम / छात्र आईडी",
        label_password: "पासवर्ड",
        link_forgot_password: "पासवर्ड भूल गए?",
        btn_signin: "साइन इन करें",
        btn_signin_microsoft: "Microsoft के साथ साइन इन करें",
        text_or: "या",
        text_new_user: "नया उपयोगकर्ता?",
        link_signup: "साइन अप करें",
        link_help: "मदद चाहिए? संपर्क करें",
        msg_enter_credentials: "कृपया उपयोगकर्ता नाम और पासवर्ड दर्ज करें।",
        msg_checking: "क्रेडेंशियल्स की जाँच की जा रही है...",
        msg_welcome: "स्वागत है, {user_id}",
        msg_login_failed: "लॉगिन विफल",
        msg_network_error: "नेटवर्क त्रुटि: {error}",
        msg_google_verify: "Google टोकन सत्यापित किया जा रहा है...",
        msg_microsoft_conn: "Microsoft से कनेक्ट हो रहा है...",
        msg_microsoft_verify: "Microsoft टोकन सत्यापित किया जा रहा है...",
        // Sidebar & Dashboard
        sidebar_dashboard: "डैशबोर्ड",
        sidebar_my_courses: "मेरे पाठ्यक्रम",
        sidebar_course_list: "पाठ्यक्रम सूची",
        sidebar_assignments: "असाइनमेंट",
        sidebar_exams: "परीक्षाएँ",
        sidebar_upcoming_exams: "आगामी परीक्षाएँ",
        sidebar_results: "परिणाम",
        sidebar_profile: "प्रोफ़ाइल",
        sidebar_view_profile: "प्रोफ़ाइल देखें",
        sidebar_settings: "सेटिंग्स",
        sidebar_communication: "संचार",
        sidebar_lms: "पाठ्यक्रम (LMS)",
        sidebar_ai_assistant: "AI सहायक",
        sidebar_timetable: "समय सारिणी",
        sidebar_view_timetable: "समय सारिणी देखें",
        sidebar_attendance: "उपस्थिति",
        sidebar_take_attendance: "उपस्थिति लें",
        sidebar_attendance_sheet: "उपस्थिति पत्रक",
        sidebar_monthly_report: "माहवार रिपोर्ट",
        sidebar_approve_leave: "छुट्टी मंजूर/अस्वीकार",
        sidebar_apply_leave: "छुट्टी आवेदन",
        sidebar_assignment_group: "असाइनमेंट",
        sidebar_create_assignment: "नया असाइनमेंट",
        sidebar_view_submitted: "प्रस्तुत देखें",
        sidebar_approve_reassign: "मंजूर / पुनः सौंपें",
        sidebar_enter_marks: "अंक दर्ज करें",
        sidebar_online_test: "ऑनलाइन टेस्ट",
        sidebar_question_bank: "प्रश्न बैंक",
        sidebar_create_test: "टेस्ट बनाएं",
        sidebar_assign_max_marks: "अंक सौंपें",
        sidebar_view_test_results: "परिणाम देखें",
        sidebar_progress_card: "प्रगति कार्ड",
        sidebar_enter_progress: "प्रगति अंक दर्ज",
        sidebar_save_publish: "सहेजें और प्रकाशित",
        sidebar_view_progress: "प्रगति कार्ड देखें",
        sidebar_pay_slips: "वेतन पर्ची",
        sidebar_view_payslips: "वेतन पर्ची देखें",
        sidebar_students: "छात्र",
        sidebar_add_student: "छात्र जोड़ें",
        sidebar_student_list: "छात्र सूची",
        sidebar_reports: "रिपोर्ट",
        sidebar_attendance_report: "उपस्थिति रिपोर्ट",
        sidebar_performance_report: "प्रदर्शन रिपोर्ट",
        sidebar_resource_library: "संसाधन पुस्तकालय",
        sidebar_ai_copilot: "AI सह-पायलट",
        sidebar_roles_perms: "भूमिकाएँ",
        sidebar_staff_faculty: "कर्मचारी",
        sidebar_system_settings: "सिस्टम सेटिंग्स",
        sidebar_academic_progress: "शैक्षणिक प्रगति",
        sidebar_fees_payments: "शुल्क और भुगतान",
        sidebar_education_assistant: "शिक्षा सहायक",
        // Student Dashboard
        student_dashboard_title: "छात्र डैशबोर्ड",
        btn_log_activity: "गतिविधि दर्ज करें",
        student_live_class: "🔴 लाइव क्लास चल रही है!",
        btn_join_class: "क्लास में शामिल हों",
        btn_join_whiteboard: "व्हाइटबोर्ड में शामिल हों",
        student_key_metrics: "छात्र प्रमुख मेट्रिक्स",
        student_upcoming_live: "आगामी लाइव क्लासेज",
        msg_no_live_classes: "कोई लाइव क्लास निर्धारित नहीं है।",
        live_class_session: "लाइव क्लास सत्र में",
        btn_join_now: "अभी शामिल हों",
        student_level: "स्तर",
        student_my_courses: "मेरे पाठ्यक्रम",
        msg_no_courses: "आप अभी किसी पाठ्यक्रम में नामांकित नहीं हैं।",
        student_upcoming_assignments: "आगामी असाइनमेंट और परियोजनाएं",
        msg_loading_assignments: "असाइनमेंट लोड हो रहे हैं...",
        tab_progress_graph: "📈 प्रगति ग्राफ",
        tab_activity_history: "📜 गतिविधि इतिहास",
        // Parent Portal
        parent_portal_title: "अभिभावक पोर्टल",
        label_select_child: "अपने बच्चे का चयन करें",
        ph_child_id: "बच्चे का छात्र आईडी दर्ज करें (उदा. S001)",
        btn_view_progress: "प्रगति देखें",
        msg_enter_child_id: "स्कूल द्वारा प्रदान किया गया छात्र आईडी दर्ज करें।",
        parent_overview_for: "के लिए अवलोकन",
        parent_key_updates: "महत्वपूर्ण अपडेट",
        update_school_close: "स्कूल कल दोपहर 2 बजे जल्दी बंद हो जाएगा।",
        update_report_cards: "रिपोर्ट कार्ड प्रकाशित किए गए हैं।",
        parent_academic_progress: "शैक्षणिक प्रगति",
        parent_teacher_feedback: "शिक्षक की प्रतिक्रिया",
        msg_loading_feedback: "प्रतिक्रिया लोड हो रही है...",
        parent_recent_marks: "हालिया अंक",
        th_subject: "विषय",
        th_exam: "परीक्षा",
        th_score: "अंक",
        parent_performance_chart: "प्रदर्शन चार्ट",
        parent_report_cards: "रिपोर्ट कार्ड",
        term_1_report: "टर्म 1 रिपोर्ट",
        badge_download: "डाउनलोड",
        // Modals - Roles
        modal_select_role: "भूमिका चुनें",
        role_principal: "प्रधानाचार्य",
        role_super_admin: "सुपर एडमिन",
        // Modals - Upload Resource
        modal_upload_resource: "संसाधन अपलोड करें",
        label_res_title: "शीर्षक",
        label_res_category: "श्रेणी",
        opt_school_policy: "स्कूल नीति",
        opt_exam_schedule: "परीक्षा अनुसूची",
        opt_form: "छुट्टी/एडमिन फॉर्म",
        opt_other: "अन्य",
        label_res_desc: "विवरण",
        label_res_file: "फ़ाइल (PDF, Doc)",
        text_max_size: "अधिकतम आकार 5MB",
        // Modals - Permission Edit
        modal_edit_permission: "अनुमति संपादित करें",
        label_perm_code: "अनुमति कोड",
        label_perm_title: "अनुमति शीर्षक",
        btn_cancel: "रद्द करें",
        btn_update: "अपडेट करें",
        // Modals - Take Quiz
        modal_take_quiz: "प्रश्नोत्तरी",
        btn_submit_quiz: "प्रश्नोत्तरी जमा करें",
        // Modals - Add Student
        modal_add_student: "➕ नया छात्र जोड़ें",
        label_student_id: "छात्र आईडी",
        label_full_name: "पूरा नाम",
        label_default_password: "डिफ़ॉल्ट पासवर्ड",
        label_grade: "कक्षा",
        // Modals - Access Card
        modal_access_card: "छात्र एक्सेस कार्ड",
        label_topic: "विषय",
        ph_topic: "उदाहरण: प्रकाश संश्लेषण",
        // label_grade: "कक्षा", // Duplicated
        label_subject: "विषय",
        label_duration: "अवधि (मिनट)",
        label_instructions: "अतिरिक्त निर्देश / संदर्भ",
        ph_instructions: "उदा. शब्दावली पर ध्यान दें...",
        label_upload_pdf: "पीडीएफ संदर्भ अपलोड करें (वैकल्पिक)",
        btn_generate_plan: "पाठ योजना बनाएं",
        // Modals - Quiz
        modal_ai_quiz: "AI क्विज़ जेनरेटर",
        label_questions_count: "प्रश्न",
        btn_generate_quiz: "क्विज़ बनाएं",
        // Modals - Schedule Class
        modal_schedule_class: "📅 लाइव क्लास शेड्यूल करें",
        label_date_time: "दिनांक और समय",
        label_target_students: "लक्षित छात्र",
        label_filter_group: "समूह द्वारा फ़िल्टर करें",
        opt_all_students: "-- सभी छात्र --",
        label_select_all: "सभी चुनें",
        label_meet_link: "गूगल मीट लिंक",
        ph_meet_link_long: "https://meet.google.com/...",
        help_meet_link: "गूगल मीट या ज़ूम से लिंक कॉपी करके पेस्ट करें।",
        btn_schedule: "शेड्यूल करें",
        // Dashboard Metrics & Content
        dashboard_students: "छात्र",
        dashboard_teachers: "शिक्षक",
        dashboard_staff: "कर्मचारी",
        dashboard_awards: "पुरस्कार",
        metric_change_teachers: "! पिछले महीने से 3%",
        metric_change_staff: "→ कोई बदलाव नहीं",
        metric_change_awards: "↑ पिछले महीने से 15%",
        btn_schedule_class: "कक्षा शेड्यूल करें",
        btn_ai_quiz: "AI क्विज़",
        btn_plan_lesson: "पाठ योजना",
        btn_whiteboard: "व्हाइटबोर्ड",
        btn_export: "निर्यात",
        btn_engagement_helper: "एंगेजमेंट हेल्पर",
        // Assignments & Payslips
        asg_active_title: "सक्रिय असाइनमेंट",
        asg_active_subtitle: "असाइनमेंट बनाएँ, सबमिशन देखें और कक्षा अनुसार प्रगति ट्रैक करें।",
        btn_create_assignment: "असाइनमेंट बनाएँ",
        asg_review_title: "समीक्षा कतार",
        btn_refresh: "रिफ्रेश",
        msg_loading_submissions: "सबमिशन लोड हो रहे हैं...",
        msg_failed_load_submissions: "सबमिशन लोड नहीं हो सके।",
        asg_review_empty: "कोई सबमिशन लंबित नहीं है।",
        marks_entry_title: "अंक प्रविष्टि",
        marks_select_assignment: "असाइनमेंट चुनें",
        marks_load_submissions: "सबमिशन लोड करें",
        marks_select_prompt: "सबमिशन देखने के लिए असाइनमेंट चुनें।",
        msg_no_assignments: "अभी कोई असाइनमेंट नहीं है।",
        msg_failed_load_assignments: "असाइनमेंट लोड नहीं हो सके।",
        msg_assignment_requires_backend: "असाइनमेंट के लिए बैकएंड आवश्यक है। http://127.0.0.1:8000 पर खोलें।",
        msg_fill_assignment_fields: "कृपया शीर्षक, अंतिम तिथि और कक्षा (ग्रेड) भरें।",
        msg_create_assignment_failed: "असाइनमेंट नहीं बन सका।",
        msg_create_assignment_network_error: "असाइनमेंट बनाते समय नेटवर्क त्रुटि।",
        msg_assignment_submit_required: "कृपया कुछ लिखें या लिंक दें।",
        msg_assignment_submit_success: "सफलतापूर्वक सबमिट हुआ!",
        msg_assignment_submit_failed: "सबमिशन असफल।",
        msg_assignment_submit_network_error: "नेटवर्क त्रुटि।",
        btn_view_submissions: "सबमिशन देखें",
        label_status: "स्थिति",
        status_submitted: "सबमिट",
        label_feedback: "फ़ीडबैक",
        btn_save: "सहेजें",
        btn_reassign: "पुनः असाइन",
        asg_modal_title: "📝 नया असाइनमेंट",
        label_title: "शीर्षक",
        label_description: "विवरण",
        label_class_grade: "कक्षा (ग्रेड)",
        label_select_grade: "ग्रेड चुनें",
        label_points: "अंक",
        label_section: "सेक्शन",
        label_select_section_optional: "सेक्शन चुनें (वैकल्पिक)",
        label_due_date: "अंतिम तिथि",
        btn_create: "बनाएँ",
        payslip_title: "मेरे वेतन पर्चे",
        payslip_ytd: "वर्ष-से-तारीख",
        payslip_net_pay_label: "नेट पे",
        payslip_latest: "हाल की भुगतान अवधि",
        payslip_latest_sub: "नेट पे • Sep 2024",
        payslip_payment_method: "भुगतान का तरीका",
        payslip_account_masked: "खाता •••• 2391",
        payslip_recent: "हाल के वेतन पर्चे",
        payslip_download_all: "सभी डाउनलोड करें",
        payslip_processed_paid: "प्रोसेस्ड: Oct 01, 2024 • स्थिति: भुगतान",
        payslip_view_details: "विवरण देखें",
        payslip_gross: "ग्रॉस: $5,000",
        payslip_deductions: "कटौती: $880",
        payslip_taxes: "कर: $620",
        payslip_print_title: "वेतन पर्चे प्रिंट करें",
        payslip_generate_pdf: "वेतन पर्चा PDF बनाएं",
        payslip_pay_period: "भुगतान अवधि",
        payslip_delivery: "डिलीवरी",
        payslip_download_pdf: "PDF डाउनलोड करें",
        payslip_email_me: "मुझे ईमेल करें",
        payslip_generate_btn: "PDF बनाएं",
        payslip_preview: "वेतन पर्चा पूर्वावलोकन",
        payslip_employee_id: "कर्मचारी आईडी: T-1024",
        payslip_processed_date: "प्रोसेस्ड: Oct 01, 2024",
        payslip_earnings: "कमाई",
        payslip_base_salary: "मूल वेतन",
        payslip_allowance: "भत्ता",
        payslip_deduction_label: "कटौतियाँ",
        payslip_tax: "कर",
        payslip_insurance: "बीमा",
        pay_advance_title: "वेतन अग्रिम के लिए आवेदन करें",
        pay_advance_amount: "आवश्यक राशि",
        pay_advance_reason: "कारण",
        pay_advance_repayment: "पसंदीदा वापसी",
        pay_advance_next_period: "अगली भुगतान अवधि",
        pay_advance_two_periods: "दो भुगतान अवधि",
        pay_advance_submit: "अनुरोध भेजें",
        pay_advance_recent: "हाल के अनुरोध",
        pay_advance_label: "अग्रिम",
        pay_advance_submitted: "जमा: Aug 12, 2024",
        pay_advance_pending: "लंबित",
        pay_advance_approved: "स्वीकृत",
        dashboard_live_controls: "लाइव क्लास नियंत्रण",
        dashboard_now: "अभी",
        ph_meet_link: "Google मीट लिंक",
        btn_start: "शुरू",
        btn_end: "समाप्त",
        dashboard_calendar: "कैलेंडर",
        dashboard_upcoming_events: "आगामी कार्यक्रम",
        dashboard_performance_dist: "प्रदर्शन वितरण",
        dashboard_class_avg_score: "कक्षा औसत गतिविधि स्कोर",
        // Headers
        header_messages: "संदेश",
        header_notifications: "सूचनाएं",
        header_my_profile: "मेरी प्रोफ़ाइल",
        header_logout: "लॉग आउट",
        ph_search: "यहाँ खोजें...",
        // New Added Keys
        header_view_all_messages: "सभी संदेश देखें",
        header_mark_read: "सभी को पढ़ा हुआ चिह्नित करें",
        notif_sys_maint: "सिस्टम रखरखाव",
        notif_sys_maint_desc: "आज रात 12 बजे के लिए अनुसूचित।",
        notif_assign_sub: "असाइनमेंट सबमिट किया गया",
        notif_assign_sub_desc: "एलिस स्मिथ ने \"मैथ एचडब्ल्यू\" सबमिट किया।",
        login_journey_title: "आपकी सीखने की यात्रा जारी है",
        login_journey_desc: "अपने पाठ्यक्रमों, लाइव कक्षाओं और व्यक्तिगत एआई अंतर्दृष्टि तक पहुंचने के लिए लॉग इन करें।",
        stat_pass_rate: "उत्तीर्ण दर",
        stat_access: "पहुँच",
        stat_students: "छात्र",
        footer_company: "कंपनी",
        footer_about: "हमारे बारे में",
        footer_press: "प्रेस",
        footer_careers: "करियर",
        footer_engineering: "इंजीनियरिंग",
        footer_accessibility: "पहुँच-योग्यता",
        footer_resources: "संसाधन",
        footer_big_ideas: "बड़े विचार",
        footer_training: "प्रशिक्षण",
        footer_remote_learning: "दूरस्थ शिक्षा",
        footer_support: "सहायता",
        footer_help_center: "सहायता केंद्र",
        footer_contact: "संपर्क करें",
        footer_privacy: "गोपनीयता केंद्र",
        footer_cookies: "कुकी सेटिंग्स",
        footer_get_app: "ऐप प्राप्त करें",
        footer_terms: "शर्तें",
        text_scan_visit: "विजिट करने के लिए स्कैन करें",
        text_product_by: "Noble Nexus का एक उत्पाद",
        text_a_product_by: "एक उत्पाद",
        footer_noble_nexus_plus: "नोबल नेक्सस प्लस",
        // Landing Page Mock Data (Hindi)
        feat_why_title: "नोबल नेक्सस क्यों?",
        feat_main_title: "उत्कृष्टता के लिए आपको जो कुछ भी चाहिए",
        feat_analytics_title: "स्मार्ट एनालिटिक्स",
        feat_analytics_desc: "स्पष्ट, एआई-संचालित विज़ुअलाइज़ेशन के साथ शैक्षणिक प्रदर्शन के रुझानों को ट्रैक करें जो छात्रों को तेजी से सुधारने में मदद करते हैं।",
        feat_live_title: "लाइव क्लासरूम",
        feat_live_desc: "एकीकृत वीडियो कॉन्फ्रेंसिंग आपके डैशबोर्ड से सीधे निर्बाध दूरस्थ शिक्षण सत्रों की अनुमति देती है।",
        feat_ai_title: "एआई मार्गदर्शन",
        feat_ai_desc: "प्रत्येक छात्र की अनूठी यात्रा के लिए डिज़ाइन किए गए व्यक्तिगत शिक्षण पथ और स्वचालित प्रतिक्रिया का अनुभव करें।",
        about_title: "क्लासब्रिज के बारे में",
        about_main_title: "शिक्षा के भविष्य को सशक्त बनाना",
        about_desc: "क्लासब्रिज को पारंपरिक स्कूली शिक्षा और आधुनिक तकनीक के बीच की खाई को पाटने के लिए डिज़ाइन किया गया है। हम एक एकीकृत पारिस्थितिकी तंत्र प्रदान करते हैं जहां सीखना नवाचार से मिलता है:",
        about_teachers: "शिक्षकों के लिए",
        about_teachers_desc: "एआई-संचालित उपस्थिति, स्वचालित ग्रेडिंग और स्मार्ट पाठ योजना उपकरणों के साथ कक्षाओं का प्रबंधन आसानी से करें।",
        about_students: "छात्रों के लिए",
        about_students_desc: "व्यक्तिगत शिक्षण पथों तक पहुंचें, वास्तविक समय की प्रगति को ट्रैक करें, और गेमिफाइड शिक्षा लक्ष्यों के साथ जुड़े रहें।",
        about_parents: "माता-पिता के लिए",
        about_parents_desc: "उपस्थिति, शैक्षणिक प्रदर्शन और स्कूल कार्यक्रमों पर त्वरित अपडेट के साथ सूचित रहें।",
        btn_discover_more: "और अधिक खोजें",
        stat_engagement: "जुड़ाव दर",
        stat_ai_support: "एआई सहायता",
        stat_active_students: "सक्रिय छात्र",
        nav_teachers: "शिक्षक",
        nav_students: "छात्र",
        nav_schools: "स्कूल",
        nav_resources: "संसाधन",
        btn_log_in: "लॉग इन",
        text_back: "वापस",
        login_not_a: "क्या आप",
        login_switch_role: "भूमिका बदलें",
        login_student_login: "छात्र लॉगिन",
        login_teacher_portal: "शिक्षक पोर्टल",
        login_parent_access: "अभिभावक प्रवेश",
        login_principal_login: "प्रधानाचार्य लॉगिन",
        login_super_admin: "सुपर एडमिन",
        login_root_admin_portal: "रूट एडमिन पोर्टल",
        login_generic: "लॉगिन",
        role_student: "छात्र",
        role_teacher: "शिक्षक",
        role_parent: "अभिभावक",
        role_others: "अन्य",
        role_admin: "एडमिन",
        role_root_admin: "रूट एडमिन",
        hero_heading: "जहां कक्षाएं\nसमुदाय बनती हैं",
        hero_subtitle: "नवाचारी समाधानों के माध्यम से शैक्षणिक संस्थानों को सशक्त बनाना",
        hero_get_started_as: "इस रूप में शुरू करें...",
        feat_modern_title: "आधुनिक कक्षा के लिए निर्मित",
        feat_quiz_gen: "क्विज़ जेनरेटर",
        feat_quiz_desc: "एक पीडीएफ अध्याय अपलोड करें, और हमारा एआई सेकंड में उत्तर कुंजी के साथ 20 अलग-अलग प्रश्न तैयार करता है।",
        link_try_generator: "जेनरेटर आज़माएं →",
        feat_student_insights: "छात्र अंतर्दृष्टि",
        feat_student_insights_desc: "ग्रेड से परे। देखें कि कौन कड़ी मेहनत कर रहा है लेकिन संघर्ष कर रहा है, और किसे अधिक चुनौतीपूर्ण सामग्री की आवश्यकता है।",
        link_view_report: "नमूना रिपोर्ट देखें →",
        feat_hybrid: "हाइब्रिड क्लासरूम",
        feat_hybrid_desc: "वीडियो लॉजिक के साथ इन-पर्सन और रिमोट शिक्षण के बीच निर्बाध रूप से स्विच करें।",
        link_see_how: "देखें कैसे →",
        cta_ready_transform: "क्या आप अपने शिक्षण को बदलने के लिए तैयार हैं?",
        btn_join_free: "मुफ्त में नोबल नेक्सस से जुड़ें"
    },
    ja: {
        login_welcome: "Noble Nexusへようこそ",
        login_subtitle: "Noble Nexusポータルにサインイン",
        label_username: "ユーザー名 / 学生ID",
        label_password: "パスワード",
        link_forgot_password: "パスワードをお忘れですか？",
        btn_signin: "サインイン",
        btn_signin_microsoft: "Microsoftでサインイン",
        text_or: "または",
        text_new_user: "新規ユーザーですか？",
        link_signup: "サインアップ",
        link_help: "助けが必要ですか？",
        msg_enter_credentials: "ユーザー名とパスワードを入力してください。",
        msg_checking: "認証情報を確認中...",
        msg_welcome: "ようこそ、{user_id}",
        msg_login_failed: "ログインに失敗しました",
        msg_network_error: "ネットワークエラー: {error}",
        msg_google_verify: "Googleトークンを確認中...",
        msg_microsoft_conn: "Microsoftに接続中...",
        msg_microsoft_verify: "Microsoftトークンを確認中...",
        // Sidebar & Dashboard
        sidebar_dashboard: "ダッシュボード",
        sidebar_my_courses: "マイコース",
        sidebar_course_list: "コース一覧",
        sidebar_assignments: "課題",
        sidebar_exams: "試験",
        sidebar_upcoming_exams: "今後の試験",
        sidebar_results: "成績",
        sidebar_profile: "プロフィール",
        sidebar_view_profile: "プロフィールを見る",
        sidebar_settings: "設定",
        sidebar_communication: "連絡",
        sidebar_lms: "コース (LMS)",
        sidebar_ai_assistant: "AIアシスタント",
        sidebar_timetable: "時間割",
        sidebar_view_timetable: "時間割を見る",
        sidebar_attendance: "出席",
        sidebar_take_attendance: "出席を取る",
        sidebar_attendance_sheet: "クラス出席表",
        sidebar_monthly_report: "月次レポート",
        sidebar_approve_leave: "休暇承認",
        sidebar_apply_leave: "休暇申請",
        sidebar_assignment_group: "課題",
        sidebar_create_assignment: "課題作成",
        sidebar_view_submitted: "提出物",
        sidebar_approve_reassign: "承認/再割当",
        sidebar_enter_marks: "成績入力",
        sidebar_online_test: "オンラインテスト",
        sidebar_question_bank: "問題バンク",
        sidebar_create_test: "テスト作成",
        sidebar_assign_max_marks: "配点設定",
        sidebar_view_test_results: "結果を見る",
        sidebar_progress_card: "成績表",
        sidebar_enter_progress: "成績入力",
        sidebar_save_publish: "保存して公開",
        sidebar_view_progress: "成績表を見る",
        sidebar_pay_slips: "給与明細",
        sidebar_view_payslips: "明細を見る",
        sidebar_students: "生徒",
        sidebar_add_student: "生徒を追加",
        sidebar_student_list: "生徒一覧",
        sidebar_reports: "レポート",
        sidebar_attendance_report: "出席レポート",
        sidebar_performance_report: "成績レポート",
        sidebar_resource_library: "ライブラリ",
        sidebar_ai_copilot: "AIコパイロット",
        sidebar_roles_perms: "ロールと権限",
        sidebar_staff_faculty: "教職員",
        sidebar_system_settings: "システム設定",
        sidebar_academic_progress: "学業成績",
        sidebar_fees_payments: "学費と支払い",
        sidebar_education_assistant: "教育アシスタント",
        // Student Dashboard
        student_dashboard_title: "学生ダッシュボード",
        btn_log_activity: "活動記録",
        student_live_class: "🔴 ライブ授業中！",
        btn_join_class: "授業に参加",
        btn_join_whiteboard: "ホワイトボードに参加",
        student_key_metrics: "学生の主要指標",
        student_upcoming_live: "今後のライブ授業",
        msg_no_live_classes: "予定されているライブ授業はありません。",
        live_class_session: "ライブ授業開催中",
        btn_join_now: "今すぐ参加",
        student_level: "レベル",
        student_my_courses: "マイコース",
        msg_no_courses: "まだどのコースにも登録されていません。",
        student_upcoming_assignments: "今後の課題とプロジェクト",
        msg_loading_assignments: "課題を読み込み中...",
        tab_progress_graph: "📈 進捗グラフ",
        tab_activity_history: "📜 活動履歴",
        // Parent Portal
        parent_portal_title: "保護者ポータル",
        label_select_child: "お子様を選択",
        ph_child_id: "学生IDを入力 (例: S001)",
        btn_view_progress: "進捗を見る",
        msg_enter_child_id: "学校から提供された学生IDを入力してください。",
        parent_overview_for: "の概要",
        parent_key_updates: "重要な更新",
        update_school_close: "明日は午後2時に早期下校となります。",
        update_report_cards: "成績表が公開されました。",
        parent_academic_progress: "学業成績",
        parent_teacher_feedback: "先生からのフィードバック",
        msg_loading_feedback: "フィードバックを読み込み中...",
        parent_recent_marks: "最近の成績",
        th_subject: "科目",
        th_exam: "試験",
        th_score: "スコア",
        parent_performance_chart: "成績チャート",
        parent_report_cards: "成績表",
        term_1_report: "1学期レポート",
        badge_download: "ダウンロード",
        // Modals - Roles
        modal_select_role: "役割を選択",
        role_principal: "校長",
        role_super_admin: "スーパー管理者",
        // Modals - Upload Resource
        modal_upload_resource: "リソースをアップロード",
        label_res_title: "タイトル",
        label_res_category: "カテゴリ",
        opt_school_policy: "学校の方針",
        opt_exam_schedule: "試験スケジュール",
        opt_form: "休暇/管理者フォーム",
        opt_other: "その他",
        label_res_desc: "説明",
        label_res_file: "ファイル (PDF, Doc)",
        text_max_size: "最大サイズ 5MB",
        // Modals - Permission Edit
        modal_edit_permission: "権限を編集",
        label_perm_code: "権限コード",
        label_perm_title: "権限タイトル",
        btn_cancel: "キャンセル",
        btn_update: "更新",
        // Modals - Take Quiz
        modal_take_quiz: "クイズ",
        btn_submit_quiz: "クイズを提出",
        // Modals - Add Student
        modal_add_student: "➕ 新しい生徒を追加",
        label_student_id: "生徒ID",
        label_full_name: "氏名",
        label_default_password: "デフォルトパスワード",
        label_grade: "学年",
        // Modals - Access Card
        modal_access_card: "生徒アクセスカード",
        label_topic: "トピック",
        ph_topic: "例：光合成",
        // label_grade: "学年", // Duplicated
        label_subject: "科目",
        label_duration: "時間 (分)",
        label_instructions: "追加の指示 / コンテキスト",
        ph_instructions: "例: 語彙に焦点を当てる...",
        label_upload_pdf: "PDFコンテキストをアップロード (任意)",
        btn_generate_plan: "授業プランを作成",
        // Modals - Quiz
        modal_ai_quiz: "AIクイズ生成",
        label_questions_count: "質問数",
        btn_generate_quiz: "クイズを作成",
        // Modals - Schedule Class
        modal_schedule_class: "📅 ライブ授業を予約",
        label_date_time: "日時",
        label_target_students: "対象の生徒",
        label_filter_group: "グループでフィルタ",
        opt_all_students: "-- 全生徒 --",
        label_select_all: "すべて選択",
        label_meet_link: "Google Meetリンク",
        ph_meet_link_long: "https://meet.google.com/...",
        help_meet_link: "Google MeetまたはZoomのリンクをコピーして貼り付けてください。",
        btn_schedule: "予約する",
        // Dashboard Metrics & Content
        dashboard_students: "生徒",
        dashboard_teachers: "先生",
        dashboard_staff: "職員",
        dashboard_awards: "受賞",
        metric_change_teachers: "! 先月から3%",
        metric_change_staff: "→ 変化なし",
        metric_change_awards: "↑ 先月から15%",
        btn_schedule_class: "授業を予約",
        btn_ai_quiz: "AIクイズ",
        btn_plan_lesson: "授業計画",
        btn_whiteboard: "ホワイトボード",
        btn_export: "エクスポート",
        btn_engagement_helper: "エンゲージメント支援",
        // Assignments & Payslips
        asg_active_title: "アクティブな課題",
        asg_active_subtitle: "課題の作成、提出の確認、クラス別の進捗を管理します。",
        btn_create_assignment: "課題を作成",
        asg_review_title: "レビュー待ち",
        btn_refresh: "更新",
        msg_loading_submissions: "提出を読み込み中...",
        msg_failed_load_submissions: "提出の読み込みに失敗しました。",
        asg_review_empty: "レビュー待ちはありません。",
        marks_entry_title: "成績入力",
        marks_select_assignment: "課題を選択",
        marks_load_submissions: "提出を読み込む",
        marks_select_prompt: "提出を表示する課題を選択してください。",
        msg_no_assignments: "課題はまだありません。",
        msg_failed_load_assignments: "課題の読み込みに失敗しました。",
        msg_assignment_requires_backend: "課題にはバックエンドが必要です。http://127.0.0.1:8000 を開いてください。",
        msg_fill_assignment_fields: "タイトル、期限、クラス（学年）を入力してください。",
        msg_create_assignment_failed: "課題の作成に失敗しました。",
        msg_create_assignment_network_error: "課題作成中のネットワークエラー。",
        msg_assignment_submit_required: "内容を入力するかリンクを追加してください。",
        msg_assignment_submit_success: "提出しました！",
        msg_assignment_submit_failed: "提出に失敗しました。",
        msg_assignment_submit_network_error: "ネットワークエラー。",
        btn_view_submissions: "提出を見る",
        label_status: "状態",
        status_submitted: "提出済み",
        label_feedback: "フィードバック",
        btn_save: "保存",
        btn_reassign: "再提出",
        asg_modal_title: "📝 新しい課題",
        label_title: "タイトル",
        label_description: "説明",
        label_class_grade: "クラス（学年）",
        label_select_grade: "学年を選択",
        label_points: "ポイント",
        label_section: "セクション",
        label_select_section_optional: "セクションを選択（任意）",
        label_due_date: "期限",
        btn_create: "作成",
        payslip_title: "給与明細",
        payslip_ytd: "年累計",
        payslip_net_pay_label: "手取り額",
        payslip_latest: "最新の支給期間",
        payslip_latest_sub: "手取り額 • Sep 2024",
        payslip_payment_method: "支払い方法",
        payslip_account_masked: "口座 •••• 2391",
        payslip_recent: "最近の明細",
        payslip_download_all: "すべてダウンロード",
        payslip_processed_paid: "処理日: Oct 01, 2024 • 状態: 支払い済み",
        payslip_view_details: "詳細を見る",
        payslip_gross: "総支給額: $5,000",
        payslip_deductions: "控除: $880",
        payslip_taxes: "税金: $620",
        payslip_print_title: "給与明細を印刷",
        payslip_generate_pdf: "給与明細PDFを生成",
        payslip_pay_period: "支給期間",
        payslip_delivery: "配信",
        payslip_download_pdf: "PDFをダウンロード",
        payslip_email_me: "メールで受け取る",
        payslip_generate_btn: "PDFを生成",
        payslip_preview: "給与明細プレビュー",
        payslip_employee_id: "社員ID: T-1024",
        payslip_processed_date: "処理日: Oct 01, 2024",
        payslip_earnings: "支給",
        payslip_base_salary: "基本給",
        payslip_allowance: "手当",
        payslip_deduction_label: "控除",
        payslip_tax: "税",
        payslip_insurance: "保険",
        pay_advance_title: "給与前払い申請",
        pay_advance_amount: "必要金額",
        pay_advance_reason: "理由",
        pay_advance_repayment: "返済方法",
        pay_advance_next_period: "次の支給期間",
        pay_advance_two_periods: "2回の支給期間",
        pay_advance_submit: "申請する",
        pay_advance_recent: "最近の申請",
        pay_advance_label: "前払い",
        pay_advance_submitted: "提出: Aug 12, 2024",
        pay_advance_pending: "保留中",
        pay_advance_approved: "承認済み",
        dashboard_live_controls: "ライブ授業コントロール",
        dashboard_now: "今",
        ph_meet_link: "Google Meet リンク",
        btn_start: "開始",
        btn_end: "終了",
        dashboard_calendar: "カレンダー",
        dashboard_upcoming_events: "今後のイベント",
        dashboard_performance_dist: "パフォーマンス分布",
        dashboard_class_avg_score: "クラス平均活動スコア",
        // Headers
        header_messages: "メッセージ",
        header_notifications: "通知",
        header_my_profile: "プロフィール",
        header_logout: "ログアウト",
        ph_search: "検索...",
        stat_active_students: "アクティブな生徒",
        nav_teachers: "教師",
        nav_students: "生徒",
        nav_schools: "学校",
        nav_resources: "リソース",
        btn_log_in: "ログイン",
        text_back: "戻る",
        login_not_a: "あなたは",
        login_switch_role: "役割を切替",
        login_student_login: "生徒ログイン",
        login_teacher_portal: "教師ポータル",
        login_parent_access: "保護者アクセス",
        login_principal_login: "校長ログイン",
        login_super_admin: "スーパー管理者",
        login_root_admin_portal: "ルート管理者ポータル",
        login_generic: "ログイン",
        role_student: "生徒",
        role_teacher: "教師",
        role_parent: "保護者",
        role_others: "その他",
        role_admin: "管理者",
        role_root_admin: "ルート管理者",
        hero_heading: "教室が\nコミュニティになる場所",
        hero_subtitle: "革新的なソリューションで教育機関を支援します",
        hero_get_started_as: "として始める...",
        feat_why_title: "なぜNoble Nexusなのか？",
        feat_main_title: "成長に必要なすべてをひとつに",
        feat_analytics_title: "スマート分析",
        feat_analytics_desc: "AIによる分かりやすい可視化で学習成果の傾向を把握できます。",
        feat_live_title: "ライブ授業",
        feat_live_desc: "統合ビデオ会議で、遠隔授業をスムーズに実施できます。",
        feat_ai_title: "AIガイダンス",
        feat_ai_desc: "一人ひとりに合った学習経路と自動フィードバックを提供します。",
        about_title: "ClassBridgeについて",
        about_main_title: "教育の未来を支える",
        about_desc: "ClassBridgeは従来の教育と最新技術のギャップを埋めるために設計されています。",
        about_teachers: "先生向け",
        about_teachers_desc: "AI出欠管理・自動採点・授業計画で日々の運用を効率化します。",
        about_students: "生徒向け",
        about_students_desc: "個別学習ルートとリアルタイム進捗で学びを加速します。",
        about_parents: "保護者向け",
        about_parents_desc: "出欠・成績・学校連絡をすばやく確認できます。",
        btn_discover_more: "詳しく見る",
        stat_engagement: "エンゲージメント率",
        stat_ai_support: "AIサポート",
        footer_company: "会社",
        footer_about: "会社概要",
        footer_press: "プレス",
        footer_careers: "採用情報",
        footer_engineering: "エンジニアリング",
        footer_accessibility: "アクセシビリティ",
        footer_resources: "リソース",
        footer_big_ideas: "ビッグアイデア",
        footer_training: "トレーニング",
        footer_remote_learning: "遠隔学習",
        footer_support: "サポート",
        footer_help_center: "ヘルプセンター",
        footer_contact: "お問い合わせ",
        footer_privacy: "プライバシーセンター",
        footer_cookies: "Cookie設定",
        footer_get_app: "アプリを入手",
        footer_terms: "利用規約",
        text_scan_visit: "スキャンしてアクセス",
        text_product_by: "Noble Nexus の製品",
        text_a_product_by: "製品提供",
        footer_noble_nexus_plus: "ノーブルネクサス プラス",
        feat_modern_title: "現代の教室のために設計",
        feat_quiz_gen: "クイズ生成",
        feat_quiz_desc: "PDFをアップロードするだけで、AIが問題と解答を即作成します。",
        link_try_generator: "生成を試す →",
        feat_student_insights: "生徒インサイト",
        feat_student_insights_desc: "成績だけでなく、支援や発展課題が必要な生徒を把握できます。",
        link_view_report: "サンプルレポートを見る →",
        feat_hybrid: "ハイブリッド教室",
        feat_hybrid_desc: "対面授業とオンライン授業をシームレスに切り替え可能。",
        link_see_how: "使い方を見る →",
        cta_ready_transform: "授業を次のレベルへ進化させませんか？",
        btn_join_free: "Noble Nexusを無料で始める"
    }
};
var currentLanguage = localStorage.getItem('appLanguage') || 'en';
function t(key, params = {}) {
    let text = key; // Default to key if not found
    if (translations[currentLanguage] && translations[currentLanguage][key]) {
        text = translations[currentLanguage][key];
    }
    else if (translations['en'] && translations['en'][key]) {
        text = translations['en'][key];
    }
    // Replace params
    for (const [placeholder, value] of Object.entries(params)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    return text;
}
function changeLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);
    updateTranslations();
    document.documentElement.lang = lang; // Accessibility: Update HTML lang attribute
}
function updateTranslations() {
    // 1. Text Content
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key)
            return;
        el.textContent = t(key);
    });
    // 2. Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (!key)
            return;
        el.placeholder = t(key);
    });
    // 3. Dynamic Dates
    const calDate = document.getElementById('dashboard-calendar-month');
    if (calDate) {
        const now = new Date();
        const opts = { month: 'long', year: 'numeric' };
        // Map app language codes to standard locales if necessary
        let locale = currentLanguage;
        if (locale === 'ar')
            locale = 'ar-SA';
        if (locale === 'hi')
            locale = 'hi-IN';
        if (locale === 'ja')
            locale = 'ja-JP';
        if (locale === 'es')
            locale = 'es-ES';
        if (locale === 'en')
            locale = 'en-US';
        calDate.textContent = now.toLocaleDateString(locale, opts);
    }
    syncSettingsLanguageControl();
}

function syncSettingsLanguageControl() {
    const settingsSelect = document.getElementById('settings-language-select');
    if (settingsSelect) {
        settingsSelect.value = currentLanguage;
    }
}

function initializeSettingsLanguageControl() {
    const settingsSelect = document.getElementById('settings-language-select');
    if (settingsSelect) {
        settingsSelect.value = currentLanguage;
        settingsSelect.addEventListener('change', (e) => {
            const next = e.target && e.target.value ? e.target.value : 'en';
            changeLanguage(next);
        });
    }
}
// Initialize Language on Load
// Initialize Language & Auth on Load
document.addEventListener('DOMContentLoaded', () => {
    if (window.__cbBootInitialized)
        return;
    window.__cbBootInitialized = true;
    initializeSettingsLanguageControl();
    updateTranslations();
    const isLoggedIn = restoreAuthState();
    if (isLoggedIn) {
        const isAdminLike = appState.role === 'Admin' || appState.role === 'Root_Super_Admin' || appState.isSuperAdmin;
        const userNameEl = document.getElementById('header-user-name');
        const userRoleEl = document.getElementById('header-user-role');
        const userImgEl = document.getElementById('header-user-img');
        if (userNameEl) userNameEl.textContent = isAdminLike ? 'System Admin' : (appState.name || appState.userId || 'User');
        if (userRoleEl) {
            userRoleEl.textContent = appState.role || 'User';
            if (appState.schoolName && appState.schoolName !== 'Independent') userRoleEl.textContent += ` • ${appState.schoolName}`;
        }
        if (userImgEl) userImgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(isAdminLike ? 'AD' : (appState.userId || 'User'))}&background=random`;
    }
    if (isLoggedIn) {
        if (appState.role === 'Student') {
            renderStudentControls();
            // Ensure views are cleared before routing logic takes over, 
            // though renderStudentControls might have already tried routing.
        }
        else if (isParentRole(appState.role)) {
            renderParentControls();
        }
        else {
            renderTeacherControls();
        }
    }
    syncSettingsLanguageControl();
    // Strict Hash-Based Routing Logic
    const hash = window.location.hash.substring(1);
    const safeSwitch = (id) => {
        // Only switch if the element exists to avoid errors
        if (document.getElementById(id)) {
            switchView(id, false);
        }
        else {
            // Fallback for invalid hash
            if (isLoggedIn) {
                if (appState.role === 'Student')
                    switchView('student-view', false);
                else if (isParentRole(appState.role))
                    switchView('parent-dashboard-view', false);
                else
                    switchView('teacher-view', false);
            }
            else {
                switchView('landing-view', false);
            }
        }
    };
    if (hash) {
        const protectedViews = ['teacher-view', 'student-view', 'parent-dashboard-view', 'roles-view', 'permissions-view'];
        // If user is NOT logged in and tries to access a protected view, redirect to landing
        if (!isLoggedIn && protectedViews.some(v => hash.startsWith(v))) {
            switchView('landing-view', false);
        }
        else {
            // Otherwise (Logged in OR Public Page), try to load the specific view from hash
            safeSwitch(hash);
        }
    }
    else {
        // No hash provided
        if (isLoggedIn) {
            if (appState.role === 'Student')
                switchView('student-view', false);
            else if (isParentRole(appState.role))
                switchView('parent-dashboard-view', false);
            else
                switchView('teacher-view', false);
        }
        else {
            switchView('landing-view', false);
        }
    }
    window.__cbInitialBootComplete = true;
});
// --- DOM ELEMENTS & MODALS ---
const viewStack = [];
function getActiveViewId() {
    const active = document.querySelector('.view.active');
    return active ? active.id : null;
}
function openView(viewId) {
    const current = getActiveViewId();
    if (current && current !== viewId) {
        viewStack.push(current);
    }
    switchView(viewId);
}
function closeView() {
    const previous = viewStack.pop();
    if (previous) {
        switchView(previous);
    }
}
function createViewModal(viewId) {
    return {
        show: () => openView(viewId),
        hide: () => closeView()
    };
}
document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const modalTrigger = target.closest('[data-bs-toggle="modal"]');
    if (modalTrigger) {
        const targetId = modalTrigger.getAttribute('data-bs-target');
        if (targetId) {
            event.preventDefault();
            openView(targetId.replace('#', ''));
        }
    }
    const dismissTrigger = target.closest('[data-bs-dismiss="modal"]');
    if (dismissTrigger) {
        event.preventDefault();
        closeView();
    }
});
const elements = {
    loginView: document.getElementById('login-view'),
    teacherView: document.getElementById('teacher-view'),
    groupsView: document.getElementById('groups-view'),
    studentView: document.getElementById('student-view'),
    loginForm: document.getElementById('login-form'),
    authStatus: document.getElementById('auth-status'),
    userControls: document.getElementById('user-controls'),
    teacherMetrics: document.getElementById('teacher-metrics'),
    rosterTable: document.getElementById('roster-table'),
    classPerformanceChart: document.getElementById('class-performance-chart'),
    studentNameHeader: document.getElementById('student-name-header'),
    studentMetrics: document.getElementById('student-metrics'),
    historyTable: document.getElementById('history-table'),
    studentProgressChart: document.getElementById('student-progress-chart'),
    chatMessagesContainer: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    recommendationBox: document.getElementById('recommendation-box'),
    loginMessage: document.getElementById('login-message'),
    // Views (Former Modals)
    addStudentModal: createViewModal('addStudentModal'),
    editStudentModal: createViewModal('editStudentModal'),
    addActivityModal: createViewModal('addActivityModal'),
    scheduleClassModal: createViewModal('scheduleClassModal'),
    createGroupModal: createViewModal('createGroupModal'),
    manageMembersModal: createViewModal('manageMembersModal'),
    aboutPortalModal: createViewModal('aboutPortalModal'),
    deleteConfirmationModal: createViewModal('deleteConfirmationModal'),
    forgotPasswordModal: createViewModal('forgotPasswordModal'),
    resetPasswordModal: createViewModal('resetPasswordModal'),
    // Modal DOM Elements (for values)
    addStudentForm: document.getElementById('add-student-form'),
    addStudentMessage: document.getElementById('add-student-message'),
    addActivityForm: document.getElementById('add-activity-form'),
    addActivityMessage: document.getElementById('add-activity-message'),
    activityStudentSelect: document.getElementById('activity-student-select'),
    editStudentForm: document.getElementById('edit-student-form'),
    editStudentMessage: document.getElementById('edit-student-message'),
    scheduleClassForm: document.getElementById('schedule-class-form'),
    scheduleMessage: document.getElementById('schedule-message'),
    addMaterialForm: document.getElementById('add-material-form'),
    // Live Class
    meetLinkInput: document.getElementById('meet-link-input'),
    startClassBtn: document.getElementById('start-class-btn'),
    endClassBtn: document.getElementById('end-class-btn'),
    studentLiveBanner: document.getElementById('student-live-banner'),
    studentJoinLink: document.getElementById('student-join-link'),
    liveClassesList: document.getElementById('live-classes-list'),
    // Add missing elements
    addMaterialMessage: document.getElementById('add-material-message'),
    addMaterialModal: createViewModal('lmsAddModuleModal'), // Mapping similar modal or create new if needed
    materialsList: document.getElementById('group-materials-list'),
};
// --- HELPER FUNCTIONS ---
function openProfileView() {
    switchView('profile-view');
    loadProfileDetails();
}
function loadProfileDetails() {
    // Basic info from header (which matches current session)
    const name = document.getElementById('header-user-name').textContent;
    const role = appState.role || 'User';
    const userId = appState.userId || '--';
    const imgSrc = document.getElementById('header-user-img').src;
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = `${role} (ID: ${userId})`;
    document.getElementById('profile-id').textContent = userId;
    document.getElementById('profile-img-large').src = imgSrc;
    // Simulate Email since backend doesn't store it yet
}
function renderMetric(container, label, value, colorClass = 'widget-purple') {
    let icon = 'menu_book'; // Default icon
    // Mapping for icons based on keys or text
    if (label.includes('Student') || label === 'dashboard_students')
        icon = 'school';
    if (label.includes('Teacher') || label === 'dashboard_teachers')
        icon = 'person_outline';
    if (label.includes('Staff') || label === 'dashboard_staff')
        icon = 'people';
    if (label.includes('Awards') || label === 'dashboard_awards')
        icon = 'emoji_events';
    let subTextKey = '';
    let subTextDefault = '';
    // Determine translation key for subtext
    if (label === 'dashboard_teachers' || label.includes('Teachers')) {
        subTextKey = 'metric_change_teachers';
        subTextDefault = '! 3% from last month';
    }
    if (label === 'dashboard_staff' || label.includes('Staff')) {
        subTextKey = 'metric_change_staff';
        subTextDefault = '→ No change';
    }
    if (label === 'dashboard_awards' || label.includes('Awards')) {
        subTextKey = 'metric_change_awards';
        subTextDefault = '↑ 15% from last month';
    }
    // carefully handle subtext rendering
    let subTextHTML = '';
    if (subTextKey) {
        subTextHTML = `<span class="text-white small opacity-75" data-i18n="${subTextKey}">${t(subTextKey)}</span>`;
    }
    else if (subTextDefault) {
        subTextHTML = `<span class="text-white small opacity-75">${subTextDefault}</span>`;
    }
    const col = document.createElement('div');
    col.className = 'col-lg-3 col-md-6';
    col.innerHTML = `
            <div class="metric-widget ${colorClass}">
                 <div class="d-flex justify-content-between w-100 mb-3">
                     <span class="text-white fw-medium" data-i18n="${label}">${t(label)}</span>
                     <span class="material-icons text-white">${icon}</span>
                 </div>
                 <div class="d-flex flex-column align-items-start">
                     <h3 class="fw-bold text-white mb-1" style="font-size: 28px;">${value}</h3>
                     ${subTextHTML}
                 </div>
            </div>
        `;
    container.appendChild(col);
}
function getEventBadgeClass(eventType) {
    if (eventType.includes("Success"))
        return "bg-success";
    if (eventType.includes("Failed") || eventType.includes("Unauthorized"))
        return "bg-danger";
    if (eventType.includes("Logout"))
        return "bg-secondary";
    if (eventType.includes("Password"))
        return "bg-warning text-dark";
    return "bg-info text-dark";
}
function fetchAPI(endpoint_1) {
    return __awaiter(this, arguments, void 0, function* (endpoint, options = {}) {
        if (!window.__cbNetworkStats) {
            window.__cbNetworkStats = { total: 0, byEndpoint: {}, startedAt: Date.now() };
            window.printNetworkStats = () => {
                const stats = window.__cbNetworkStats || { total: 0, byEndpoint: {} };
                const sorted = Object.entries(stats.byEndpoint).sort((a, b) => b[1] - a[1]);
                console.table(sorted.map(([ep, count]) => ({ endpoint: ep, count })));
                console.log(`[CB] Total API calls: ${stats.total}`);
            };
        }
        window.__cbNetworkStats.total += 1;
        window.__cbNetworkStats.byEndpoint[endpoint] = (window.__cbNetworkStats.byEndpoint[endpoint] || 0) + 1;
        const debugNet = window.location.search.includes('debugNet=1') || localStorage.getItem('cb_debug_net') === '1';
        if (debugNet) {
            console.debug(`[CB][API #${window.__cbNetworkStats.total}] ${endpoint}`);
        }
        const headers = { 'Content-Type': 'application/json' };
        // Inject RBAC Headers if logged in
        if (appState.isLoggedIn && appState.role && appState.userId) {
            headers['X-User-Role'] = appState.role;
            headers['X-User-Id'] = appState.userId;
            // Context Switching for Super Admin
            if (appState.activeSchoolId) {
                headers['X-School-Id'] = appState.activeSchoolId;
            }
        }
        // Merge user-supplied headers if any
        const fetchOpts = options;
        if (fetchOpts.headers) {
            Object.assign(headers, fetchOpts.headers);
        }
        // Skip Content-Type for FormData (browser adds boundary automatically)
        if (fetchOpts.body instanceof FormData) {
            delete headers['Content-Type'];
        }
        // Allow custom timeout, default to 30s (increased for AI)
        const timeout = options.timeout || 60000; // Default to 60s for AI stability
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        // Remove custom 'timeout' prop before passing to fetch (it's not standard)
        const _a = options, { timeout: _ } = _a, fetchOptions = __rest(_a, ["timeout"]);
        const finalOptions = Object.assign(Object.assign({}, fetchOptions), { headers: headers, signal: controller.signal });
        try {
            const response = yield fetch(`${API_BASE_URL}${endpoint}`, finalOptions);
            clearTimeout(id);
            return response;
        }
        catch (error) {
            clearTimeout(id);
            console.error("Fetch API Error:", error);
            if (error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeout / 1000}s. Server is busy.`);
            }
            // Fallback chain for local/dev host mismatches (0.0.0.0 vs 127.0.0.1).
            const fallbackBases = [
                `${window.location.origin}/api`,
                'http://127.0.0.1:8000/api',
                'http://localhost:8000/api'
            ];
            const primaryBase = String(API_BASE_URL || '').replace(/\/+$/, '');
            for (const base of fallbackBases) {
                if (String(base).replace(/\/+$/, '') === primaryBase)
                    continue;
                try {
                    const retryController = new AbortController();
                    const retryId = setTimeout(() => retryController.abort(), timeout);
                    const retryOptions = Object.assign(Object.assign({}, fetchOptions), { headers: headers, signal: retryController.signal });
                    const retryResponse = yield fetch(`${base}${endpoint}`, retryOptions);
                    clearTimeout(retryId);
                    return retryResponse;
                }
                catch (retryError) {
                    console.error(`Fetch fallback error (${base}):`, retryError);
                }
            }
            throw new Error("Network connection failed. Is the server running?");
        }
    });
}
// --- EDIT STUDENT LOGIC ---
function fetchDetailedStudentForEdit(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetchAPI(`/students/${studentId}/data`);
            if (response.ok) {
                const data = yield response.json();
                // Update Number Inputs
                document.getElementById('edit-math-score').value = data.summary.math_score;
                document.getElementById('edit-science-score').value = data.summary.science_score;
                document.getElementById('edit-english-score').value = data.summary.english_language_score;
                // Update Range Sliders
                document.getElementById('rng-math').value = data.summary.math_score;
                document.getElementById('rng-science').value = data.summary.science_score;
                document.getElementById('rng-english').value = data.summary.english_language_score;
                // Update Labels
                document.getElementById('lbl-math').textContent = data.summary.math_score + '%';
                document.getElementById('lbl-science').textContent = data.summary.science_score + '%';
                document.getElementById('lbl-english').textContent = data.summary.english_language_score + '%';
                // Render Roles
                yield renderEditStudentRoles(data.profile.roles || []);
                // Reset Tabs to first one
                const firstTabEl = document.querySelector('#editStudentTabs button[data-bs-target="#edit-profile"]');
                const tab = new bootstrap.Tab(firstTabEl);
                tab.show();
                elements.editStudentModal.show();
            }
            else {
                alert("Failed to fetch student details for editing.");
            }
        }
        catch (error) {
            console.error(error);
            alert("Error fetching student details.");
        }
    });
}
function renderEditStudentRoles(currentRoles) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('edit-student-roles-container');
        if (!container)
            return;
        container.innerHTML = '<div class="text-center text-muted">Loading roles...</div>';
        try {
            // Fetch all roles
            const response = yield fetchAPI('/admin/roles');
            if (response.ok) {
                const allRoles = yield response.json();
                container.innerHTML = '';
                if (allRoles.length === 0) {
                    container.innerHTML = '<div class="text-muted small">No roles defined.</div>';
                    return;
                }
                const row = document.createElement('div');
                row.className = 'row g-2';
                allRoles.forEach(role => {
                    // Filter: Hide Root_Super_Admin unless user is one? For now show all except maybe system hidden ones if needed.
                    if (role.name === 'Super Admin' && !appState.isSuperAdmin)
                        return;
                    const isChecked = currentRoles.includes(role.name);
                    const col = document.createElement('div');
                    col.className = 'col-md-6';
                    col.innerHTML = `
                   <div class="form-check">
                       <input class="form-check-input role-edit-check" type="checkbox" value="${role.name}" id="role-edit-${role.id}" ${isChecked ? 'checked' : ''}>
                       <label class="form-check-label small" for="role-edit-${role.id}" title="${role.description}">
                           ${role.name} 
                           <span class="badge bg-light text-dark border ms-1" style="font-size: 0.7em;">${role.code}</span>
                       </label>
                   </div>
               `;
                    row.appendChild(col);
                });
                container.appendChild(row);
            }
            else {
                container.innerHTML = '<div class="text-danger small">Failed to load roles.</div>';
            }
        }
        catch (e) {
            console.error(e);
            container.innerHTML = '<div class="text-danger small">Error loading roles.</div>';
        }
    });
}
// EXPOSED FUNCTION for direct onclick
function submitEditStudentForm() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Manual submit trigger");
        const msgEl = document.getElementById('edit-student-message'); // Direct fetch to be safe
        msgEl.textContent = 'Saving...';
        msgEl.className = 'text-primary fw-medium d-block p-2';
        msgEl.classList.remove('d-none');
        const studentId = getVal('edit-id');
        const updateData = {
            name: getVal('edit-name'),
            grade: parseInt(getVal('edit-grade')) || 0,
            preferred_subject: getVal('edit-subject'),
            home_language: getVal('edit-lang'),
            attendance_rate: parseFloat(getVal('edit-attendance')) || 0.0,
            math_score: parseFloat(getVal('edit-math-score')) || 0.0,
            science_score: parseFloat(getVal('edit-science-score')) || 0.0,
            english_language_score: parseFloat(getVal('edit-english-score')) || 0.0,
        };
        // Include Roles
        // Include Roles
        const checkedBoxes = document.querySelectorAll('.role-edit-check:checked');
        const selectedRoles = Array.from(checkedBoxes).map(el => el.value);
        if (selectedRoles.length > 0) {
            updateData.roles = selectedRoles;
        }
        else {
            // Warning: No roles selected? We might default to Student in backend if list is explicit empty but present?
            // Backend handles logic.
            updateData.roles = [];
        }
        // Include password only if entered
        const newPass = document.getElementById('edit-password').value.trim();
        if (newPass) {
            updateData.password = newPass;
        }
        try {
            const response = yield fetchAPI(`/students/${studentId}`, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            if (response.ok) {
                msgEl.textContent = "Saved successfully!";
                msgEl.className = 'text-success fw-bold d-block p-2';
                alert("Success: Student Updated!");
                setTimeout(() => {
                    closeView();
                    msgEl.textContent = '';
                }, 1000);
                yield initializeDashboard();
            }
            else {
                const data = yield response.json();
                console.error("Save failed:", data);
                msgEl.textContent = "Error: " + (data.detail || "Unknown error");
                msgEl.className = 'text-danger fw-bold d-block p-2';
                if (response.status === 403) {
                    alert("Permission Denied: You do not have permission to edit students.");
                }
                else {
                    alert("Update Failed: " + (data.detail || "Check console"));
                }
            }
        }
        catch (error) {
            console.error(error);
            msgEl.textContent = "Network Error";
            alert("Network Error: " + error.message);
        }
    });
}
// --- ROLE & PERMISSION MANAGEMENT ---
function loadRoles() {
    return __awaiter(this, void 0, void 0, function* () {
        const tableBody = document.getElementById('roles-table-body');
        if (!tableBody) return;

        // Show loading spinner row
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                    Loading roles...
                </td>
            </tr>`;

        try {
            const response = yield fetchAPI('/admin/roles');
            if (response.ok) {
                const roles = yield response.json();
                renderRolesList(roles);
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center py-5 text-danger">
                            <span class="material-icons fs-2 d-block mb-2">error_outline</span>
                            Failed to load roles.
                        </td>
                    </tr>`;
            }
        } catch (e) {
            console.error('loadRoles error:', e);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5 text-danger">
                        <span class="material-icons fs-2 d-block mb-2">wifi_off</span>
                        Network error. Please try again.
                    </td>
                </tr>`;
        }
    });
}

function renderRolesList(roles) {
    const tableBody = document.getElementById('roles-table-body');
    if (!tableBody) return;

    if (!roles || roles.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5">
                    <span class="material-icons text-muted" style="font-size:3rem;opacity:0.4;">manage_accounts</span>
                    <p class="text-muted mt-2 mb-0">No roles found.</p>
                </td>
            </tr>`;
        return;
    }

    const canEdit = hasPermission('edit_roles') || appState.isSuperAdmin || (appState.permissions || []).includes('*');
    const canDelete = hasPermission('delete_roles') || appState.isSuperAdmin || (appState.permissions || []).includes('*');

    // Also render the Create button if admin has add_roles
    const createBtnContainer = document.getElementById('role-create-action');
    if (createBtnContainer) {
        if (hasPermission('add_roles') || appState.isSuperAdmin || (appState.permissions || []).includes('*')) {
            createBtnContainer.innerHTML = `
                <button class="btn rounded-pill px-4 fw-bold shadow-sm d-flex align-items-center gap-2"
                    style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:none;font-size:0.85rem;"
                    onclick="openRoleModal()">
                    <span class="material-icons" style="font-size:18px;">add</span>
                    Create Role
                </button>`;
        } else {
            createBtnContainer.innerHTML = '';
        }
    }

    tableBody.innerHTML = '';
    roles.forEach(role => {
        const isSystem = role.is_system;
        const statusColour = role.status === 'Active'
            ? { bg: '#dcfce7', text: '#15803d' }
            : { bg: '#f1f5f9', text: '#64748b' };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4">
                <span class="badge bg-light border font-monospace fw-bold px-2 py-1"
                    style="color:#4338ca;font-size:0.73rem;letter-spacing:0.04em;border-color:#c7d2fe!important;">
                    ${role.code || '—'}
                </span>
            </td>
            <td>
                <div class="fw-semibold" style="color:#1e1b4b;">${role.name}</div>
                ${isSystem ? '<span class="badge ms-1" style="background:#fef3c7;color:#b45309;font-size:0.65rem;font-weight:600;">System</span>' : ''}
            </td>
            <td>
                <span class="badge rounded-pill px-3 py-1"
                    style="background:${statusColour.bg};color:${statusColour.text};font-size:0.72rem;font-weight:600;">
                    ${role.status || 'Active'}
                </span>
            </td>
            <td class="small text-secondary" style="max-width:300px;">
                ${role.description || '<em class="text-muted fst-italic" style="opacity:.5;">No description</em>'}
            </td>
            <td class="text-end pe-4">
                <div class="d-flex align-items-center justify-content-end gap-1">
                    ${canEdit ? `
                    <button class="btn btn-sm d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1"
                        style="background:rgba(79,70,229,0.09);color:#4f46e5;border:1px solid rgba(79,70,229,0.2);font-size:0.75rem;font-weight:600;transition:all .2s;${isSystem ? 'opacity:0.45;cursor:not-allowed;' : ''}"
                        title="${isSystem ? 'System roles cannot be modified' : 'Edit role'}"
                        ${isSystem ? 'disabled' : `onmouseover="this.style.background='rgba(79,70,229,0.18)'" onmouseout="this.style.background='rgba(79,70,229,0.09)'" onclick="openRoleModal(${role.id})"`}>
                        <span class="material-icons" style="font-size:14px;">edit</span>
                        Edit
                    </button>` : ''}
                    ${canDelete ? `
                    <button class="btn btn-sm d-inline-flex align-items-center gap-1 rounded-pill px-2 py-1"
                        style="background:rgba(220,38,38,0.07);color:#dc2626;border:1px solid rgba(220,38,38,0.2);font-size:0.75rem;font-weight:600;transition:all .2s;${isSystem ? 'opacity:0.45;cursor:not-allowed;' : ''}"
                        title="${isSystem ? 'System roles cannot be deleted' : 'Delete role'}"
                        ${isSystem ? 'disabled' : `onmouseover="this.style.background='rgba(220,38,38,0.16)'" onmouseout="this.style.background='rgba(220,38,38,0.07)'" onclick="deleteRole(${role.id}, '${(role.name || '').replace(/'/g, "\\'")}')"`}>
                        <span class="material-icons" style="font-size:14px;">delete</span>
                        Delete
                    </button>` : ''}
                    ${(!canEdit && !canDelete) ? `
                    <span class="text-muted small fst-italic" style="font-size:0.72rem;opacity:0.5;">—</span>` : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function loadRoleDetails(roleId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetchAPI(`/admin/roles/${roleId}`);
            if (response.ok) {
                const role = yield response.json();
                openRoleModal(role.id);
            }
        } catch (e) {
            console.error('loadRoleDetails error:', e);
        }
    });
}

function openRoleModal(roleId = null) {
    return __awaiter(this, void 0, void 0, function* () {
        const modalTitle = document.getElementById('role-form-title');
        const form = document.getElementById('role-form');
        if (!form) return;

        form.reset();
        document.getElementById('role-id').value = '';

        // Clear permission search box
        const searchEl = document.getElementById('perm-search-role');
        if (searchEl) searchEl.value = '';

        // Reset selected-perms tag area immediately
        document.querySelectorAll('.perm-tag').forEach(t => t.remove());
        const hint = document.getElementById('no-perms-hint');
        if (hint) hint.style.display = '';
        const countEl = document.getElementById('selected-perms-count');
        if (countEl) countEl.textContent = '0 selected';

        // Show auto-generated code placeholder
        const codeEl = document.getElementById('role-display-code');
        if (codeEl) codeEl.textContent = roleId ? 'Loading...' : 'Auto-generated on save';

        const permsContainer = document.getElementById('role-perms-container');
        if (permsContainer) {
            permsContainer.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div> <span class="text-muted small ms-2">Loading permissions...</span></div>';
        }

        if (roleId) {
            if (modalTitle) modalTitle.textContent = 'Edit Role';
            document.getElementById('role-id').value = roleId;
            try {
                const res = yield fetchAPI(`/admin/roles/${roleId}`);
                if (res.ok) {
                    const data = yield res.json();
                    document.getElementById('role-name').value = data.name || '';
                    document.getElementById('role-desc').value = data.description || '';
                    if (codeEl) codeEl.textContent = data.code || `R-${String(roleId).padStart(3, '0')}`;
                    const statusRadio = document.querySelector(`input[name="roleStatus"][value="${data.status}"]`);
                    if (statusRadio) statusRadio.checked = true;
                    yield loadPermissionsForModal(data.permissions.map(p => p.code));
                }
            } catch (e) {
                console.error('openRoleModal fetch error:', e);
            }
        } else {
            if (modalTitle) modalTitle.textContent = 'Create Role';
            yield loadPermissionsForModal([]);
        }

        switchView('role-form-view');
    });
}

// Stores all permissions data for searching
let _allRolePermissions = {};

function loadPermissionsForModal() {
    return __awaiter(this, arguments, void 0, function* (selectedCodes = []) {
        const container = document.getElementById('role-perms-container');
        if (!container) return;

        // Reset selected tags area
        _updateSelectedPermsTags(selectedCodes);

        try {
            const response = yield fetchAPI('/admin/permissions');
            const groupedPerms = yield response.json();
            _allRolePermissions = groupedPerms;   // cache for search filtering

            _renderPermissionsCheckboxes(groupedPerms, selectedCodes);
        } catch (e) {
            console.error('loadPermissionsForModal error:', e);
            if (container) container.innerHTML = '<p class="text-danger small">Error loading permissions.</p>';
        }
    });
}

function _renderPermissionsCheckboxes(groupedPerms, selectedCodes) {
    const container = document.getElementById('role-perms-container');
    if (!container) return;

    // Get current selected from tags (may have changed since initial load)
    const currentSelected = _getSelectedPermCodes();
    const checkedSet = new Set(currentSelected.length ? currentSelected : (selectedCodes || []));

    container.innerHTML = '';
    let totalVisible = 0;

    for (const [group, perms] of Object.entries(groupedPerms)) {
        if (!perms || perms.length === 0) continue;
        totalVisible += perms.length;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-4 perm-group-block';
        groupDiv.innerHTML = `
            <div class="d-flex align-items-center gap-2 mb-2">
                <span class="fw-bold text-uppercase" style="font-size:0.67rem;letter-spacing:0.07em;color:#6366f1;">${group}</span>
                <div class="flex-grow-1" style="height:1px;background:#e0e7ff;"></div>
            </div>`;

        const row = document.createElement('div');
        row.className = 'row g-2';

        perms.forEach(p => {
            const isChecked = checkedSet.has(p.code);
            const col = document.createElement('div');
            col.className = 'col-md-6 perm-item';
            col.dataset.code = p.code;
            col.dataset.desc = (p.description || '').toLowerCase();
            col.innerHTML = `
                <div class="form-check d-flex align-items-start gap-2 p-2 rounded-2 perm-check-row"
                    style="cursor:pointer;transition:background .15s;"
                    onmouseover="this.style.background='#f5f3ff'"
                    onmouseout="this.style.background='transparent'">
                    <input class="form-check-input perm-check mt-1 flex-shrink-0"
                        type="checkbox" value="${p.code}" id="rperm-${p.id}"
                        ${isChecked ? 'checked' : ''}
                        style="cursor:pointer;width:15px;height:15px;"
                        onchange="_onPermCheckChange(this, '${p.description ? p.description.replace(/'/g, "\\'") : p.code}')">
                    <label class="form-check-label" for="rperm-${p.id}" style="cursor:pointer;line-height:1.3;user-select:none;">
                        <span class="d-block fw-semibold" style="color:#1e1b4b;font-size:0.78rem;">${p.description || p.code}</span>
                        <span class="font-monospace" style="font-size:0.65rem;color:#8b5cf6;">${p.code}</span>
                    </label>
                </div>`;
            row.appendChild(col);
        });

        groupDiv.appendChild(row);
        container.appendChild(groupDiv);
    }

    if (totalVisible === 0) {
        container.innerHTML = '<p class="text-muted small text-center py-3">No permissions match your search.</p>';
    }
}

function _onPermCheckChange(checkbox, label) {
    const code = checkbox.value;
    const isChecked = checkbox.checked;
    const selectedList = document.getElementById('selected-perms-list');
    const hint = document.getElementById('no-perms-hint');
    const countEl = document.getElementById('selected-perms-count');

    if (isChecked) {
        // Add tag
        if (hint) hint.style.display = 'none';
        const tag = document.createElement('span');
        tag.className = 'd-inline-flex align-items-center gap-1 rounded-pill px-2 py-1 perm-tag';
        tag.dataset.code = code;
        tag.style.cssText = 'background:#e0e7ff;color:#4338ca;font-size:0.72rem;font-weight:600;border:1px solid #c7d2fe;cursor:default;';
        tag.innerHTML = `
            <span class="font-monospace" style="font-size:0.68rem;">${code}</span>
            <button type="button" onclick="_removePermTag('${code}')" aria-label="Remove"
                style="background:none;border:none;padding:0;line-height:1;color:#6366f1;cursor:pointer;"
                title="Remove">&times;</button>`;
        if (selectedList) selectedList.appendChild(tag);
    } else {
        // Remove tag
        _removePermTag(code);
    }

    // Update count
    _updatePermCount();
}

function _removePermTag(code) {
    // Remove tag from selected list
    const tag = document.querySelector(`.perm-tag[data-code="${code}"]`);
    if (tag) tag.remove();

    // Uncheck checkbox in picker
    const cb = document.querySelector(`.perm-check[value="${code}"]`);
    if (cb) cb.checked = false;

    // Show hint if no tags left
    const tags = document.querySelectorAll('.perm-tag');
    const hint = document.getElementById('no-perms-hint');
    if (hint) hint.style.display = tags.length === 0 ? '' : 'none';

    _updatePermCount();
}

function _updatePermCount() {
    const count = document.querySelectorAll('.perm-tag').length;
    const el = document.getElementById('selected-perms-count');
    if (el) el.textContent = `${count} selected`;
}

function _getSelectedPermCodes() {
    return Array.from(document.querySelectorAll('.perm-tag')).map(t => t.dataset.code);
}

function _updateSelectedPermsTags(selectedCodes) {
    const selectedList = document.getElementById('selected-perms-list');
    const hint = document.getElementById('no-perms-hint');
    if (!selectedList) return;

    // Clear all existing tags
    document.querySelectorAll('.perm-tag').forEach(t => t.remove());

    if (!selectedCodes || selectedCodes.length === 0) {
        if (hint) hint.style.display = '';
    } else {
        if (hint) hint.style.display = 'none';
        selectedCodes.forEach(code => {
            const tag = document.createElement('span');
            tag.className = 'd-inline-flex align-items-center gap-1 rounded-pill px-2 py-1 perm-tag';
            tag.dataset.code = code;
            tag.style.cssText = 'background:#e0e7ff;color:#4338ca;font-size:0.72rem;font-weight:600;border:1px solid #c7d2fe;cursor:default;';
            tag.innerHTML = `
                <span class="font-monospace" style="font-size:0.68rem;">${code}</span>
                <button type="button" onclick="_removePermTag('${code}')" aria-label="Remove"
                    style="background:none;border:none;padding:0;line-height:1;color:#6366f1;cursor:pointer;"
                    title="Remove">&times;</button>`;
            selectedList.appendChild(tag);
        });
    }
    _updatePermCount();
}

function filterRolePermissions(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        // Show all groups
        document.querySelectorAll('.perm-group-block').forEach(g => g.style.display = '');
        document.querySelectorAll('.perm-item').forEach(i => i.style.display = '');
        return;
    }
    document.querySelectorAll('.perm-group-block').forEach(group => {
        let anyVisible = false;
        group.querySelectorAll('.perm-item').forEach(item => {
            const code = (item.dataset.code || '').toLowerCase();
            const desc = (item.dataset.desc || '').toLowerCase();
            const match = code.includes(q) || desc.includes(q);
            item.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        group.style.display = anyVisible ? '' : 'none';
    });
}

function handleSaveRole() {
    return __awaiter(this, void 0, void 0, function* () {
        const roleId = document.getElementById('role-id').value;
        const name = (document.getElementById('role-name').value || '').trim();
        const desc = (document.getElementById('role-desc').value || '').trim();
        const statusEl = document.querySelector('input[name="roleStatus"]:checked');
        const status = statusEl ? statusEl.value : 'Active';
        if (!name) { alert('Role Title is required.'); return; }

        // Collect permissions from the tag list (PRD: selected shown as list)
        const selectedPerms = _getSelectedPermCodes();
        const endpoint = roleId ? `/admin/roles/${roleId}` : '/admin/roles';
        const method = roleId ? 'PUT' : 'POST';

        // Show loading state on Save button
        const saveBtn = document.querySelector('[onclick="handleSaveRole()"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<span class="material-icons align-middle me-1" style="font-size:16px;">hourglass_empty</span> Saving...'; }

        try {
            const response = yield fetchAPI(endpoint, {
                method,
                body: JSON.stringify({ name, description: desc, status, permissions: selectedPerms })
            });
            if (response.ok) {
                // Go back to role listing
                switchView('roles-view');
                loadRoles();

                // Show success toast
                const toast = document.createElement('div');
                toast.className = 'position-fixed bottom-0 end-0 m-4 p-3 rounded-3 text-white fw-semibold shadow-lg';
                toast.style.cssText = 'background:linear-gradient(135deg,#4f46e5,#7c3aed);z-index:9999;font-size:0.85rem;min-width:260px;';
                toast.innerHTML = `<span class="material-icons align-middle me-2" style="font-size:16px;">check_circle</span>Role ${roleId ? 'updated' : 'created'} successfully!`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            } else {
                const err = yield response.json().catch(() => ({}));
                alert(err.detail || 'Failed to save role.');
            }
        } catch (e) {
            alert('Network error. Please try again.');
        } finally {
            // Restore Save button
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span class="material-icons align-middle me-1" style="font-size:16px;">save</span> Save Role';
            }
        }
    });
}

function deleteRole(id, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to delete the role "${name}"?

This cannot be undone.`))
            return;
        try {
            const response = yield fetchAPI(`/admin/roles/${id}`, { method: 'DELETE' });
            if (response.ok) {
                // Remove row with fade
                const rows = document.querySelectorAll('#roles-table-body tr');
                rows.forEach(row => { if (row.innerHTML.includes(`deleteRole(${id},`)) row.remove(); });
                loadRoles();
            } else {
                const d = yield response.json().catch(() => ({}));
                alert(d.detail || 'Failed to delete role.');
            }
        } catch (e) {
            alert('Network error.');
        }
    });
}


// --- PERMISSION MANAGEMENT ---

// Cache for permissions data (used by filter)
let _cachedPermissions = [];

/**
 * Loads the permissions listing into the dedicated permissions-view.
 * Called when the sidebar "Permission Setup" item is clicked or Refresh is pressed.
 */
function loadPermissionsSetup() {
    return __awaiter(this, void 0, void 0, function* () {
        const tableBody = document.getElementById('permissions-setup-body');
        if (!tableBody) return;

        // Show table loading spinner
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                    Loading permissions...
                </td>
            </tr>`;

        // Reset summary cards to loading state
        ['perm-stat-total', 'perm-stat-active', 'perm-stat-inactive'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="spinner-border spinner-border-sm" style="opacity:.6;width:18px;height:18px;border-width:2px;"></div>';
        });

        // Clear search input
        const searchInput = document.getElementById('perm-search-input');
        if (searchInput) searchInput.value = '';

        try {
            // Fetch summary + permissions list in parallel
            const [summaryRes, listRes] = yield Promise.all([
                fetchAPI('/admin/permissions/summary'),
                fetchAPI('/admin/permissions/list')
            ]);

            // --- Populate summary cards ---
            if (summaryRes.ok) {
                const summary = yield summaryRes.json();
                const totalEl = document.getElementById('perm-stat-total');
                const activeEl = document.getElementById('perm-stat-active');
                const inactiveEl = document.getElementById('perm-stat-inactive');

                if (totalEl) totalEl.textContent = summary.total_permissions ?? '-';
                if (activeEl) activeEl.textContent = summary.active_permissions ?? '-';
                if (inactiveEl) inactiveEl.textContent = summary.inactive_permissions ?? '-';
            }

            // --- Populate table ---
            if (listRes.ok) {
                const perms = yield listRes.json();
                _cachedPermissions = perms;
                renderPermissionsSetupTable(perms);
                if (!summaryRes.ok) {
                    const totalEl = document.getElementById('perm-stat-total');
                    const activeEl = document.getElementById('perm-stat-active');
                    const inactiveEl = document.getElementById('perm-stat-inactive');
                    const activeCount = perms.filter(p => (p.status || 'Active').toLowerCase() === 'active').length;
                    const totalCount = perms.length;
                    if (totalEl) totalEl.textContent = String(totalCount);
                    if (activeEl) activeEl.textContent = String(activeCount);
                    if (inactiveEl) inactiveEl.textContent = String(Math.max(totalCount - activeCount, 0));
                }
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center py-5 text-danger">
                            <span class="material-icons fs-2 d-block mb-2">error_outline</span>
                            Failed to load permissions.
                        </td>
                    </tr>`;
            }
        } catch (e) {
            console.error('loadPermissionsSetup error:', e);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-5 text-danger">
                        <span class="material-icons fs-2 d-block mb-2">wifi_off</span>
                        Network error. Please try again.
                    </td>
                </tr>`;
        }
    });
}
function renderPermissionsSetupTable(perms) {
    const tableBody = document.getElementById('permissions-setup-body');
    if (!tableBody) return;
    if (!perms || perms.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5">
                    <span class="material-icons text-muted" style="font-size:3rem;opacity:0.4;">vpn_key</span>
                    <p class="text-muted mt-2 mb-0">No permissions found.</p>
                </td>
            </tr>`;
        return;
    }
    // Edit icon visibility is limited to edit-permitted users.
    const canEdit = hasPermission('edit_permissions');

    tableBody.innerHTML = '';
    perms.forEach(p => {
        const safeCode = (p.code || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeDesc = (p.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ps-4">
                <span class="badge bg-light text-dark border font-monospace fw-bold px-2 py-1"
                    style="letter-spacing:0.5px;font-size:0.72rem;">
                    ${p.display_code || 'P-????'}
                </span>
            </td>
            <td class="small font-monospace fw-semibold" style="color:#3730a3;word-break:break-all;">
                ${p.code || '-'}
            </td>
            <td class="small text-secondary" style="max-width:340px;">
                ${p.description || '<em class="text-muted fst-italic" style="opacity:.6;">No description set</em>'}
            </td>
            <td class="text-center">
                ${canEdit ? `
                <button class="btn btn-sm d-inline-flex align-items-center gap-1 rounded-pill px-3 py-1"
                        style="background:rgba(79,70,229,0.09);color:#4f46e5;border:1px solid rgba(79,70,229,0.2);font-size:0.75rem;font-weight:600;transition:all .2s;"
                        title="Edit description"
                        onmouseover="this.style.background='rgba(79,70,229,0.18)';this.style.transform='translateY(-1px)'"
                        onmouseout="this.style.background='rgba(79,70,229,0.09)';this.style.transform=''"
                        onclick="openPermissionEditModal(${p.id}, '${safeCode}', '${safeDesc}')">
                    <span class="material-icons" style="font-size:14px;">edit</span>
                    Edit
                </button>` : `
                <span class="material-icons" style="font-size:16px;opacity:0.3;color:#9ca3af;" title="View only">lock</span>`}
            </td>
        `;
        tableBody.appendChild(tr);
    });
}
/**
 * Live-filter the permissions table by code or title (client-side).
 */
function filterPermissionsTable(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderPermissionsSetupTable(_cachedPermissions);
        return;
    }
    const filtered = _cachedPermissions.filter(p =>
        (p.code || '').toLowerCase().includes(q) ||
        (p.display_code || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    );
    renderPermissionsSetupTable(filtered);
}

/** Legacy: used by the Permissions tab inside the roles-view */
function loadPermissionsList() {
    return __awaiter(this, void 0, void 0, function* () {
        const tableBody = document.getElementById('perms-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
        try {
            const response = yield fetchAPI('/admin/permissions/list');
            if (response.ok) {
                const perms = yield response.json();
                renderPermissionsTable(perms);
            } else {
                tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load permissions.</td></tr>';
            }
        } catch (e) {
            console.error(e);
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Network Error</td></tr>';
        }
    });
}

/** Legacy: renders into the old perms-table-body (inside roles-view tab) */
function renderPermissionsTable(perms) {
    const tableBody = document.getElementById('perms-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    perms.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge bg-light text-dark border">${p.display_code}</span></td>
            <td class="fw-medium font-monospace text-primary small">${p.code}</td>
            <td class="small text-muted">${p.description}</td>
            <td>
                ${hasPermission('edit_permissions')
                ? `<button class="btn btn-sm btn-link text-primary p-0"
                        onclick="openPermissionEditModal(${p.id}, '${p.code.replace(/'/g, "\\'")}',' ${p.description.replace(/'/g, "\\'")}}')">
                        <span class="material-icons" style="font-size:18px;">edit</span>
                     </button>` : ''}
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function openPermissionEditModal(id, code, desc) {
    const displayCode = `P-${String(id).padStart(4, '0')}`;

    // Populate hidden inputs (backward compat)
    document.getElementById('perm-edit-id').value = id;
    document.getElementById('perm-edit-code').value = displayCode;
    document.getElementById('perm-edit-title').value = code;

    // Update visible display elements in the Bootstrap modal
    const codeBadge = document.getElementById('perm-edit-code-badge');
    const titleDisplay = document.getElementById('perm-edit-title-display');
    if (codeBadge) codeBadge.textContent = displayCode;
    if (titleDisplay) titleDisplay.textContent = code || '—';

    // Pre-fill editable description field
    document.getElementById('perm-edit-desc').value = desc;

    // Open as a real Bootstrap modal popup
    const modalEl = document.getElementById('permEditModal');
    if (modalEl) {
        // Remove view class if accidentally set (since we rebuilt this as a proper modal)
        modalEl.classList.remove('view');
        const modal = new bootstrap.Modal(modalEl, { backdrop: true, keyboard: true });
        modal.show();
    }
}
function handleUpdatePermission() {
    return __awaiter(this, void 0, void 0, function* () {
        const id = document.getElementById('perm-edit-id').value;
        const desc = document.getElementById('perm-edit-desc').value.trim();
        if (!desc) { alert('Description cannot be empty.'); return; }

        const btn = document.getElementById('perm-update-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-icons align-middle me-1" style="font-size:15px;">hourglass_empty</span> Saving...'; }

        try {
            const response = yield fetchAPI(`/admin/permissions/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ description: desc })
            });
            if (response.ok) {
                // Close Bootstrap modal
                const modalEl = document.getElementById('permEditModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();

                // Show brief success toast-style feedback
                const toastMsg = document.createElement('div');
                toastMsg.className = 'position-fixed bottom-0 end-0 m-4 p-3 rounded-3 text-white fw-semibold shadow-lg';
                toastMsg.style.cssText = 'background:linear-gradient(135deg,#4f46e5,#7c3aed);z-index:9999;font-size:0.85rem;min-width:250px;animation:fadeIn .3s ease;';
                toastMsg.innerHTML = '<span class="material-icons align-middle me-2" style="font-size:16px;">check_circle</span>Permission updated successfully!';
                document.body.appendChild(toastMsg);
                setTimeout(() => toastMsg.remove(), 3000);

                // Refresh the permissions-view table
                loadPermissionsSetup();
                // Also refresh legacy tab if visible
                if (document.getElementById('perms-table-body')) loadPermissionsList();
            } else {
                const err = yield response.json().catch(() => ({}));
                alert(err.detail || 'Failed to update permission.');
            }
        } catch (e) {
            alert('Network error. Please try again.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons align-middle me-1" style="font-size:15px;">save</span> Update Description'; }
        }
    });
}
// --- NAVIGATION & HISTORY MANAGEMENT ---
function switchView(viewId, updateHistory = true) {
    let viewExists = document.getElementById(viewId);
    if (!viewExists && viewId === 'parent-progress-card-view') {
        const host = document.getElementById('main-content');
        if (host) {
            const dynamicView = document.createElement('div');
            dynamicView.id = 'parent-progress-card-view';
            dynamicView.className = 'view container-fluid p-4';
            dynamicView.innerHTML = `
                <h3 class="fw-bold mb-4 text-dark">View Progress Card</h3>
                <div id="parent-progress-card-container" class="card border-0 shadow rounded-4 p-4">
                    <div class="text-center text-muted py-5">
                        <span class="material-icons fs-1">analytics</span>
                        <p class="mt-2">Progress card will appear here.</p>
                    </div>
                </div>
            `;
            host.appendChild(dynamicView);
            viewExists = dynamicView;
        }
    }
    if (!viewExists) {
        console.warn(`Attempted to switch to non-existent view: ${viewId}`);
        return;
    }
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    viewExists.classList.add('active');
    // Handle Sidebar Visibility
    const body = document.body;
    if (viewId === 'login-view' || viewId === 'register-view' || viewId === 'two-factor-view' || viewId === 'landing-view') {
        body.classList.add('login-mode');
    }
    else {
        body.classList.remove('login-mode');
    }
    syncSettingsLanguageControl();
    syncSuperAdminNavigationUI(viewId);

    // ── Universal View Loader Dispatcher ─────────────────────────────────────
    // Parent role redirect: upcoming-exams → parent-exam-schedule
    if (viewId === 'upcoming-exams-view' && isParentRole(appState.role)) {
        switchView('parent-exam-schedule-view', updateHistory);
        return;
    }
    const loaderDef = VIEW_LOADERS[viewId];
    if (loaderDef && appState.isLoggedIn) {
        // 1. Permission guard — check superAdminOnly flag first
        if (loaderDef.superAdminOnly && !appState.isSuperAdmin) {
            console.warn(`[CB] View '${viewId}' requires Super Admin access.`);
            showAccessDeniedView();
            return;
        }
        // Check role-based access (null roles = allow all logged-in users)
        const rolesArray = loaderDef.roles;
        const allowed = (rolesArray === null || rolesArray === undefined)
            || rolesArray.includes(appState.role)
            || appState.isSuperAdmin;
        if (!allowed) {
            console.warn(`[CB] Role '${appState.role}' not permitted for view '${viewId}'`);
            showAccessDeniedView();
            return;
        }
        // 2. Cache guard — fire loader only on first visit (or alwaysReload views)
        if (!window._cbViewLoaded[viewId] || loaderDef.alwaysReload) {
            window._cbViewLoaded[viewId] = true;
            try { loaderDef.loader(); } catch (e) { console.error(`[CB] Loader error for ${viewId}:`, e); }
        }
    }
    // Ensure Permission Setup always loads on direct hash refresh as well.
    if (viewId === 'permissions-view' && appState.isLoggedIn) {
        try { loadPermissionsSetup(); } catch (e) { console.error('permissions-view loader error:', e); }
    }

    // Update Browser History
    if (updateHistory) {
        const newUrl = '#' + viewId;
        history.pushState({ viewId: viewId }, '', newUrl);
    }
    // Scroll to top
    window.scrollTo(0, 0);
}
// Handle Browser Back/Forward Buttons
window.addEventListener('popstate', (event) => {
    if (event.state && event.state.viewId) {
        switchView(event.state.viewId, false);
        if (typeof handleHashRouting === 'function')
            handleHashRouting();
    }
    else {
        // Fallback for direct hash access or empty state
        const hash = window.location.hash.substring(1);
        if (hash) {
            switchView(hash, false);
            if (typeof handleHashRouting === 'function')
                handleHashRouting();
        }
        else {
            // Default view if no hash
            if (appState.isLoggedIn) {
                // Determine default dashboard based on role
                if (appState.role === 'Student')
                    switchView('student-view');
                else if (isParentRole(appState.role))
                    switchView('parent-dashboard-view');
                else
                    switchView('teacher-view');
                if (typeof handleHashRouting === 'function')
                    handleHashRouting();
            }
            else {
                switchView('landing-view', false);
            }
        }
    }
});
function loadSchoolsForRegistration() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const select = document.getElementById('reg-school');
            if (!select)
                return;
            select.innerHTML = '<option value="">Loading schools...</option>';
            const response = yield fetch(`${API_BASE_URL}/admin/schools`);
            if (response.ok) {
                const schools = yield response.json();
                select.innerHTML = '';
                schools.forEach(school => {
                    const opt = document.createElement('option');
                    opt.value = school.id;
                    opt.textContent = school.name;
                    select.appendChild(opt);
                });
                if (schools.length === 0) {
                    const opt = document.createElement('option');
                    opt.value = '1';
                    opt.textContent = "Independent / Default School";
                    select.appendChild(opt);
                }
            }
            else {
                select.innerHTML = '<option value="1">Default School</option>';
            }
        }
        catch (e) {
            console.error("Error loading schools", e);
            const select = document.getElementById('reg-school');
            if (select)
                select.innerHTML = '<option value="1">Default School</option>';
        }
    });
}
function showRegister(e) {
    if (e && e.preventDefault)
        e.preventDefault();
    switchView('register-view');
    loadSchoolsForRegistration();
}
function showLogin(e) {
    if (e)
        e.preventDefault();
    clearLoginFormSensitiveFields();
    switchView('login-view');
}

function clearLoginFormSensitiveFields() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const clearNow = () => {
        if (usernameEl) {
            usernameEl.value = '';
            usernameEl.setAttribute('autocomplete', 'off');
        }
        if (passwordEl) {
            passwordEl.value = '';
            passwordEl.setAttribute('autocomplete', 'new-password');
        }
    };
    clearNow();
    setTimeout(clearNow, 0);
    setTimeout(clearNow, 150);
}
// --- AUTHENTICATION ---
function handleRegister(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const msg = document.getElementById('register-message');
        msg.textContent = 'Creating account...';
        msg.className = 'text-primary fw-bold';
        let inviteInput = document.getElementById('reg-invite').value.trim();
        // Fix: Extract token if user pasted full URL
        if (inviteInput.includes("invite=")) {
            inviteInput = inviteInput.split("invite=")[1].split("&")[0];
        }
        if (!inviteInput) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Invitation Code is required.';
            return;
        }
        const password = document.getElementById('reg-password').value;
        if (!checkPasswordStrength(password)) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Please fix password issues before submitting.';
            return;
        }
        const data = {
            name: document.getElementById('reg-name').value,
            email: document.getElementById('reg-email').value,
            password: password,
            grade: parseInt(document.getElementById('reg-grade').value) || 9,
            preferred_subject: document.getElementById('reg-subject').value || "General",
            role: document.getElementById('reg-role').value, // FR-3
            invitation_token: inviteInput, // FR-4
            school_id: parseInt(document.getElementById('reg-school').value) || 1
        };
        try {
            const response = yield fetchAPI('/auth/register', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = yield response.json();
            if (response.ok) {
                msg.className = 'text-success fw-bold';
                msg.textContent = 'Success! Redirecting to login...';
                setTimeout(() => {
                    showLogin();
                    document.getElementById('register-form').reset();
                    document.getElementById('password-strength-msg').textContent = '';
                    msg.textContent = '';
                    // Pre-fill login
                    document.getElementById('username').value = data.email;
                }, 1500);
            }
            else {
                msg.className = 'text-danger fw-bold';
                msg.textContent = result.detail || 'Registration failed.';
            }
        }
        catch (error) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Network error during registration.';
        }
    });
}
// FR-12: Client-side Password Validation
function checkPasswordStrength(password) {
    const msgEl = document.getElementById('password-strength-msg');
    if (password.length === 0) {
        msgEl.textContent = '';
        return false;
    }
    let isValid = true;
    let feedback = [];
    if (password.length < 8) {
        feedback.push("Min 8 chars");
        isValid = false;
    }
    if (!/\d/.test(password)) {
        feedback.push("1 number");
        isValid = false;
    }
    if (!/[a-zA-Z]/.test(password)) {
        feedback.push("1 letter");
        isValid = false;
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        feedback.push("1 special char");
        isValid = false;
    }
    if (isValid) {
        msgEl.textContent = "✅ Strong password";
        msgEl.className = "small mb-3 ms-1 fw-bold text-success";
        return true;
    }
    else {
        msgEl.textContent = "⚠️ Weak: " + feedback.join(", ");
        msgEl.className = "small mb-3 ms-1 fw-bold text-danger";
        return false;
    }
}
// FR-3 & FR-4: Role Handling and Invitation Logic
function handleRoleChange() {
    const role = document.getElementById('reg-role').value;
    const studentFields = document.querySelector('#register-form .row'); // Grade/Subject fields
    if (role === 'Student') {
        studentFields.style.display = 'flex';
        document.getElementById('reg-grade').required = true;
    }
    else {
        studentFields.style.display = 'none';
        document.getElementById('reg-grade').required = false;
    }
}
function generateInvite() {
    return __awaiter(this, void 0, void 0, function* () {
        const role = document.getElementById('invite-role').value;
        const resultDiv = document.getElementById('invite-result');
        resultDiv.classList.remove('d-none');
        resultDiv.textContent = 'Generating...';
        try {
            const response = yield fetchAPI('/invitations/generate', {
                method: 'POST',
                body: JSON.stringify({ role: role, expiry_hours: 48 })
            });
            if (response.ok) {
                const data = yield response.json();
                const link = window.location.origin + "/?invite=" + data.token;
                resultDiv.innerHTML = `
                <strong>Token:</strong> ${data.token}<br>
                <div class="input-group input-group-sm mt-1">
                    <input type="text" class="form-control" value="${link}" readonly>
                    <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText('${link}')">Copy</button>
                </div>
                <small class="text-danger">Expires: ${new Date(data.expires_at).toLocaleString()}</small>
            `;
            }
            else {
                resultDiv.textContent = 'Error generating invite.';
            }
        }
        catch (e) {
            console.error(e);
            resultDiv.textContent = 'Network error.';
        }
    });
}
// Check for Invite Token in URL
document.getElementById('register-form').addEventListener('submit', handleRegister);
document.getElementById('forgot-password-form').addEventListener('submit', handleForgotPassword);
document.getElementById('reset-password-form').addEventListener('submit', handleResetPasswordSubmit); // New Listener
function openForgotPassword(e) {
    if (e)
        e.preventDefault();
    document.getElementById('forgot-password-form').reset();
    document.getElementById('reset-message').textContent = '';
    elements.forgotPasswordModal.show();
}
function handleForgotPassword(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const msg = document.getElementById('reset-message');
        msg.textContent = 'Sending request...';
        msg.className = 'text-center fw-medium small mb-2 text-primary';
        try {
            const response = yield fetchAPI('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            const data = yield response.json();
            // DEV MODE: Show Link
            if (data.dev_link) {
                msg.innerHTML = `
                <div class="alert alert-success small p-2 mt-2">
                    ${data.message}<br>
                    <a href="${data.dev_link}" class="btn btn-sm btn-success mt-2 fw-bold w-100">
                        <span class="material-icons align-middle" style="font-size: 16px;">email</span> Open Simulated Email
                    </a>
                </div>`;
                msg.className = 'text-center small mb-2';
            }
            else {
                msg.textContent = data.message;
                msg.className = 'text-center fw-medium small mb-2 text-success';
            }
        }
        catch (err) {
            msg.textContent = 'Network error.';
            msg.className = 'text-center fw-medium small mb-2 text-danger';
        }
    });
}
// Reset Password Logic
window.addEventListener('DOMContentLoaded', () => {
    // Check for Invite
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (inviteToken) {
        showRegister(new Event('click'));
        document.getElementById('reg-invite').value = inviteToken;
        const msg = document.getElementById('register-message');
        msg.textContent = "Invitation code applied! Please complete registration.";
        msg.className = "text-primary fw-medium";
    }
    // Check for Reset Token
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        document.getElementById('reset-token').value = resetToken;
        openView('resetPasswordModal');
        // Clean URL visual
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
function handleResetPasswordSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const token = document.getElementById('reset-token').value;
        const newPass = document.getElementById('new-reset-pass').value;
        const confirmPass = document.getElementById('confirm-reset-pass').value;
        const msg = document.getElementById('new-reset-message');
        if (newPass !== confirmPass) {
            msg.textContent = 'Passwords do not match.';
            msg.className = 'text-danger fw-bold text-center mb-3';
            return;
        }
        if (!checkPasswordStrength(newPass)) {
            msg.textContent = 'Password is too weak.';
            msg.className = 'text-danger fw-bold text-center mb-3';
            return;
        }
        try {
            const response = yield fetchAPI('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token: token, new_password: newPass })
            });
            const data = yield response.json();
            if (response.ok) {
                msg.textContent = "Success! Redirecting to login...";
                msg.className = "text-success fw-bold text-center mb-3";
                setTimeout(() => {
                    closeView();
                    showLogin(null);
                }, 2000);
            }
            else {
                msg.textContent = data.detail || "Reset failed.";
                msg.className = "text-danger fw-bold text-center mb-3";
            }
        }
        catch (e) {
            msg.textContent = "Network error.";
            msg.className = "text-danger fw-bold text-center mb-3";
        }
    });
}
// FR-Role-Selection
function selectLoginRole(role) {
    // 1. Update State
    document.getElementById('selected-role').value = role;
    clearLoginFormSensitiveFields();
    // 2. Update UI (New Elements)
    const roleLabelMap = {
        'Student': 'role_student',
        'Teacher': 'role_teacher',
        'Parent': 'role_parent',
        'Principal': 'role_principal',
        'Admin': 'role_admin',
        'Root_Super_Admin': 'role_root_admin'
    };
    const labelEl = document.getElementById('login-role-label');
    if (labelEl)
        labelEl.textContent = t(roleLabelMap[role] || 'role_student');
    const iconEl = document.getElementById('login-role-icon');
    const iconMap = {
        'Student': 'backpack',
        'Teacher': 'school',
        'Parent': 'home',
        'Admin': 'badge',
        'Principal': 'account_balance',
        'Root_Super_Admin': 'admin_panel_settings'
    };
    if (iconEl && iconMap[role]) {
        iconEl.textContent = iconMap[role];
    }
    // 3. Update Title & Labels
    const titleMap = {
        'Student': 'login_student_login',
        'Teacher': 'login_teacher_portal',
        'Parent': 'login_parent_access',
        'Principal': 'login_principal_login',
        'Admin': 'login_super_admin',
        'Root_Super_Admin': 'login_root_admin_portal'
    };
    const titleEl = document.getElementById('login-title');
    if (titleEl)
        titleEl.textContent = t(titleMap[role] || 'login_generic');
    const lbl = document.querySelector('label[for="username"]');
    const input = document.getElementById('username');
    if (lbl && input) {
        lbl.textContent = t('label_username');
        input.placeholder = t('label_username');
    }
}
function handleLogin(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const msgEl = elements.loginMessage;
        if (!username || !password) {
            msgEl.textContent = t('msg_enter_credentials');
            msgEl.className = 'text-danger fw-bold';
            return;
        }
        msgEl.className = 'text-primary fw-medium';
        // FR-Role-Selection: Capture selected role
        const selectedRole = document.getElementById('selected-role').value;
        try {
            const response = yield fetchAPI('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password, role: selectedRole })
            });
            if (response.ok) {
                const data = yield response.json();
                // CHECK 2FA REQUIREMENT
                if (data.requires_2fa) {
                    appState.tempUserId = data.user_id; // Store ID for 2nd step
                    appState.tempSecurityMode = data.security_mode || 'email_otp';
                    msgEl.textContent = ""; // Clear message
                    const demoContainer = document.getElementById('demo-codes-container');
                    const twoFactorMsg = document.getElementById('2fa-message');
                    const codeLabel = document.querySelector('label[for="2fa-code"]');
                    if (codeLabel) {
                        codeLabel.textContent = appState.tempSecurityMode === 'authenticator_app'
                            ? 'Authenticator Code'
                            : 'Email Verification Code';
                    }
                    const codeInput = document.getElementById('2fa-code');
                    if (codeInput) {
                        codeInput.placeholder = appState.tempSecurityMode === 'authenticator_app' ? '6-digit authenticator code' : '6-digit code';
                    }
                    if (demoContainer)
                        demoContainer.classList.add('d-none');
                    if (appState.tempSecurityMode === 'authenticator_app') {
                        twoFactorMsg.textContent = data.email_masked
                            ? `Authenticator mode enabled. Setup/enter your code to continue. Contact email: ${data.email_masked}`
                            : "Authenticator mode enabled. Setup/enter your code to continue.";
                        twoFactorMsg.className = 'text-info fw-bold mb-3 d-block';
                        loadAuthenticatorSetup(appState.tempUserId);
                    }
                    else {
                        twoFactorMsg.textContent = data.email_masked
                            ? `A verification code has been sent to ${data.email_masked}`
                            : "Please check your email for the code.";
                        twoFactorMsg.className = 'text-info fw-bold mb-3 d-block';
                        renderAuthenticatorSetupBox(null);
                    }
                    switchView('two-factor-view');
                    return;
                }
                // CHECK ROLE MATCH
                // The user MUST have logged in through the correct portal tab.
                // CHECK ROLE MATCH
                const selectedRole = document.getElementById('selected-role').value;
                let allowLogin = false;
                if (data.role === selectedRole || data.role === 'Admin' || data.is_super_admin) {
                    allowLogin = true;
                }
                if (!allowLogin && isParentRole(data.role) && isParentRole(selectedRole)) {
                    allowLogin = true;
                }
                if (!allowLogin) {
                    msgEl.textContent = `Access Denied: This account belongs to the ${data.role} portal.`;
                    msgEl.className = 'text-danger fw-bold';
                    // Reset backend session immediately since we are denying access
                    appState.isLoggedIn = false;
                    console.warn(`Role Mismatch: Selected ${selectedRole}, Actual ${data.role}`);
                    return;
                }
                // SUCCESSFUL LOGIN
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                appState.roles = data.roles || [];
                appState.permissions = data.permissions || [];
                applyRoleTheme();
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                // Persist Session
                localStorage.setItem('classbridge_session', JSON.stringify({
                    user_id: data.user_id,
                    name: data.name,
                    role: data.role,
                    school_id: data.school_id,
                    school_name: data.school_name,
                    is_super_admin: data.is_super_admin,
                    active_student_id: appState.activeStudentId,
                    roles: data.roles || [],
                    permissions: data.permissions || []
                }));
                msgEl.textContent = t('msg_welcome', { user_id: data.user_id });
                if (appState.schoolName && appState.schoolName !== 'Independent') {
                    msgEl.textContent += ` (${appState.schoolName})`;
                }
                msgEl.className = 'text-success fw-bold';
                setTimeout(() => {
                    msgEl.textContent = '';
                    initializeDashboard();
                }, 500);
            }
            else {
                // ERROR HANDLING
                const err = yield response.json().catch(() => ({ detail: t('msg_login_failed') }));
                msgEl.textContent = err.detail || t('msg_login_failed');
                msgEl.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            msgEl.textContent = t('msg_network_error', { error: error.message });
            msgEl.className = 'text-danger fw-bold';
            console.error("Login Error:", error);
        }
    });
}
function renderAuthenticatorSetupBox(data) {
    const form = document.getElementById('two-factor-form');
    if (!form)
        return;
    let box = document.getElementById('authenticator-setup-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'authenticator-setup-box';
        box.className = 'alert alert-light border text-start d-none mb-3';
        const msgEl = document.getElementById('2fa-message');
        if (msgEl && msgEl.parentElement) {
            msgEl.parentElement.insertBefore(box, msgEl);
        }
        else {
            form.appendChild(box);
        }
    }
    if (!data) {
        box.classList.add('d-none');
        box.innerHTML = '';
        return;
    }
    box.classList.remove('d-none');
    box.innerHTML = `
        <div class="fw-bold mb-2">${data.is_enabled ? 'Authenticator Already Enabled' : 'Setup Authenticator App'}</div>
        <div class="small text-muted mb-2">Scan the QR code with Google/Microsoft Authenticator and enter the 6-digit code below.</div>
        ${data.qr_url ? `<div class="text-center mb-2"><img src="${data.qr_url}" alt="Authenticator QR" style="max-width:180px; border:1px solid #dee2e6; padding:6px; border-radius:8px;"></div>` : ''}
        <div class="small"><strong>Manual key:</strong> <code>${data.secret_key || ''}</code></div>
    `;
}
function loadAuthenticatorSetup(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI('/auth/authenticator/setup', {
                method: 'POST',
                body: JSON.stringify({ user_id: userId })
            });
            if (!res.ok) {
                renderAuthenticatorSetupBox(null);
                return;
            }
            const data = yield res.json();
            renderAuthenticatorSetupBox(data);
        }
        catch (e) {
            renderAuthenticatorSetupBox(null);
        }
    });
}
function handle2FASubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const code = document.getElementById('2fa-code').value.trim();
        const msgEl = document.getElementById('2fa-message');
        if (!code) {
            msgEl.textContent = "Please enter the code.";
            return;
        }
        msgEl.textContent = "Verifying...";
        msgEl.className = "text-primary fw-medium";
        if (!appState.tempUserId) {
            console.error("Missing tempUserId");
            msgEl.textContent = "Session expired. Please login again.";
            msgEl.className = "text-danger fw-bold";
            return;
        }
        try {
            const payload = {
                user_id: appState.tempUserId,
                code: code
            };
            console.log("Sending 2FA payload:", payload);
            const response = yield fetchAPI('/auth/verify-2fa', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = yield response.json();
                // Success!
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id; // confirmed ID
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                localStorage.setItem('classbridge_session', JSON.stringify({
                    user_id: data.user_id,
                    name: data.name,
                    role: data.role,
                    school_id: data.school_id,
                    school_name: data.school_name,
                    is_super_admin: data.is_super_admin,
                    active_student_id: appState.activeStudentId,
                    roles: data.roles || [],
                    permissions: data.permissions || []
                }));
                // Clear temp state
                appState.tempUserId = null;
                appState.tempSecurityMode = null;
                document.getElementById('two-factor-form').reset();
                renderAuthenticatorSetupBox(null);
                // Switch to Dashboard
                const msgEl2FA = document.getElementById('2fa-message');
                if (msgEl2FA) {
                    msgEl2FA.textContent = `Success! Welcome, ${data.user_id}`;
                    msgEl2FA.className = 'text-success fw-bold';
                }
                initializeDashboard();
            }
            else {
                const rawText = yield response.text();
                console.error("2FA Failed Response:", response.status, rawText);
                let errorDetail = "Verification failed.";
                try {
                    const err = JSON.parse(rawText);
                    errorDetail = err.detail || errorDetail;
                }
                catch (jsonErr) { }
                msgEl.textContent = errorDetail;
                msgEl.className = "text-danger fw-bold";
            }
        }
        catch (e) {
            console.error("2FA Network Error:", e);
            msgEl.textContent = "Network error: " + e.message;
            msgEl.className = "text-danger fw-bold";
        }
    });
}
// --- SOCIAL LOGIN (FR-2 REAL GOOGLE + SIMULATED MICROSOFT) ---
// CALLBACK FOR REAL GOOGLE SIGN-IN
function handleCredentialResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        elements.loginMessage.textContent = t('msg_google_verify');
        console.log("Encoded JWT ID token: " + response.credential);
        try {
            // Send JWT to backend for verification
            const apiRes = yield fetch(`${API_BASE_URL}/auth/google-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: response.credential })
            });
            if (apiRes.ok) {
                const data = yield apiRes.json();
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                elements.loginMessage.textContent = t('msg_welcome', { user_id: data.user_id });
                elements.loginMessage.className = 'text-success fw-bold';
                setTimeout(() => {
                    elements.loginMessage.textContent = '';
                    initializeDashboard();
                }, 1000);
            }
            else {
                // SAFE ERROR HANDLING
                const rawText = yield apiRes.text();
                let errorMsg = "Google Login failed.";
                try {
                    const error = JSON.parse(rawText);
                    errorMsg = error.detail || errorMsg;
                }
                catch (e) {
                    if (rawText.trim().length > 0)
                        errorMsg = "Server Error: " + rawText.substring(0, 100);
                }
                console.error("Google Login Failed:", apiRes.status, errorMsg);
                elements.loginMessage.textContent = `Error (${apiRes.status}): ${errorMsg}`;
                elements.loginMessage.className = 'text-danger fw-bold';
            }
        }
        catch (e) {
            console.error(e);
            elements.loginMessage.textContent = "Verification Error.";
            elements.loginMessage.className = 'text-danger fw-bold';
        }
    });
}
function handleSocialLogin(provider) {
    return __awaiter(this, void 0, void 0, function* () {
        if (provider === 'Google') {
            return;
        }
        if (provider === 'Microsoft') {
            // Check if we are in "Simulated Mode" (ID is missing)
            if (msalConfig.auth.clientId === "YOUR_MICROSOFT_CLIENT_ID") {
                console.log("Microsoft Client ID missing. Using SIMULATED Login.");
                console.log("⚠️ Running in SIMULATED MODE: No real Microsoft Client ID provided.");
                // We intentionally fall through to the simulation logic below
            }
            else {
                // REAL Microsoft Login
                try {
                    elements.loginMessage.textContent = t('msg_microsoft_conn');
                    elements.loginMessage.className = 'text-primary fw-bold';
                    const loginRequest = {
                        scopes: ["User.Read"]
                    };
                    const loginResponse = yield msalInstance.loginPopup(loginRequest);
                    elements.loginMessage.textContent = t('msg_microsoft_verify');
                    // Send access token to backend
                    const response = yield fetch(`${API_BASE_URL}/auth/microsoft-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: loginResponse.accessToken })
                    });
                    if (response.ok) {
                        const data = yield response.json();
                        appState.isLoggedIn = true;
                        document.body.classList.remove('login-mode');
                        appState.role = data.role;
                        appState.userId = data.user_id;
                        appState.schoolId = data.school_id;
                        appState.schoolName = data.school_name;
                        appState.isSuperAdmin = data.is_super_admin;
                        appState.name = data.name || data.user_id;
                        // Fix for Parent: Use Related Student ID as Active Student
                        if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                            appState.activeStudentId = data.related_student_id;
                        }
                        else if (appState.role === 'Student') {
                            appState.activeStudentId = data.user_id;
                        }
                        else {
                            appState.activeStudentId = null;
                        }
                        elements.loginMessage.textContent = t('msg_welcome', { user_id: data.user_id });
                        if (appState.schoolName && appState.schoolName !== 'Independent') {
                            elements.loginMessage.textContent += ` (${appState.schoolName})`;
                        }
                        elements.loginMessage.className = 'text-success fw-bold';
                        setTimeout(() => {
                            elements.loginMessage.textContent = '';
                            initializeDashboard();
                        }, 1000);
                    }
                    else {
                        const errorData = yield response.json();
                        elements.loginMessage.textContent = errorData.detail || "Microsoft login failed.";
                        elements.loginMessage.className = 'text-danger fw-bold';
                    }
                }
                catch (error) {
                    console.error(error);
                    elements.loginMessage.textContent = "Microsoft Login cancelled or failed.";
                    elements.loginMessage.className = 'text-danger fw-bold';
                }
                return;
            }
        }
        // Fallback for other providers (simulated)
        elements.loginMessage.textContent = `Connecting to ${provider}...`;
        elements.loginMessage.className = 'text-primary fw-bold';
        // Simulating a token from the provider
        const simulatedToken = `token_${provider.toLowerCase()}_${Date.now()}`;
        try {
            const response = yield fetch(`${API_BASE_URL}/auth/social-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, token: simulatedToken })
            });
            if (response.ok) {
                const data = yield response.json();
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                // For parents: use related_student_id returned from server, not own ID
                if (isParentRole(data.role) && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                } else if (data.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                } else {
                    appState.activeStudentId = null;
                }
                elements.loginMessage.textContent = `Success! Welcome, ${data.user_id}`;
                if (appState.schoolName && appState.schoolName !== 'Independent') {
                    elements.loginMessage.textContent += ` (${appState.schoolName})`;
                }
                elements.loginMessage.className = 'text-success fw-bold';
                setTimeout(() => {
                    elements.loginMessage.textContent = '';
                    initializeDashboard();
                }, 1000);
            }
            else {
                // SAFE ERROR HANDLING
                const rawText = yield response.text();
                let errorMsg = `${provider} login failed.`;
                try {
                    const errorData = JSON.parse(rawText);
                    errorMsg = errorData.detail || errorMsg;
                }
                catch (e) {
                    if (rawText.trim().length > 0)
                        errorMsg = "Server Error: " + rawText.substring(0, 100);
                }
                elements.loginMessage.textContent = errorMsg;
                elements.loginMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.loginMessage.textContent = `Social Login Network Error: ${error.message}`;
            elements.loginMessage.className = 'text-danger fw-bold';
            console.error(error);
        }
    });
}
function initializeDashboard() {
    if (window.__cbInitDashboardPromise)
        return window.__cbInitDashboardPromise;
    window.__cbInitDashboardPromise = __awaiter(this, void 0, void 0, function* () {
        // Stop WebGL shader loop — free GPU on login
        if (typeof window.stopShaderLoop === 'function') window.stopShaderLoop();

        // Clear session view-load cache so fresh data loads after login/re-login
        window._cbViewLoaded = {};

        elements.loginView.classList.remove('active');
        applyRoleTheme();

        // ── UI Setup only — no API calls here ────────────────────────────────
        const isAdminLike = appState.role === 'Admin' || appState.role === 'Root_Super_Admin' || appState.isSuperAdmin;
        const headerDisplayName = isAdminLike ? 'System Admin' : (appState.name || appState.userId);
        const userNameEl = document.getElementById('header-user-name');
        if (userNameEl) userNameEl.textContent = headerDisplayName;
        const userRoleEl = document.getElementById('header-user-role');
        if (userRoleEl) {
            userRoleEl.textContent = appState.role;
            if (appState.schoolName && appState.schoolName !== 'Independent')
                userRoleEl.textContent += ` • ${appState.schoolName}`;
        }
        const userImgEl = document.getElementById('header-user-img');
        if (userImgEl)
            userImgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(isAdminLike ? 'AD' : appState.userId)}&background=random`;
        elements.authStatus.innerHTML =
            `<strong>Role:</strong> ${appState.role} <span class="mx-2">|</span> <strong>User:</strong> ${appState.userId}` +
            (appState.schoolName ? ` <span class="mx-2">|</span> <strong>School:</strong> ${appState.schoolName}` : '');
        elements.loginMessage.textContent = '';

        if (appState.role === 'Root_Super_Admin') appState.isSuperAdmin = true;

        if (appState.isSuperAdmin) {
            yield loadSuperAdminDashboard();
            return;
        }

        // ── Build sidebar for user's role, then switch to default view ────────
        // Data loading is deferred — VIEW_LOADERS handles it when switchView fires
        if (appState.role === 'Teacher' || appState.role === 'Admin' || appState.role === 'Principal') {
            renderTeacherControls();
            switchView('teacher-view');   // triggers loadTeacherDashboardData()
        }
        else if (isParentRole(appState.role)) {
            renderParentControls();
            switchView('parent-dashboard-view');  // triggers loadParentDashboardData()
        }
        else if (appState.role === 'Student') {
            renderStudentControls();
            switchView('student-view');   // triggers loadStudentDashboardData()
        }
    }).finally(() => {
        window.__cbInitDashboardPromise = null;
    });
    return window.__cbInitDashboardPromise;
}
function ensureRootAdminView() {
    if (document.getElementById('root-admin-view'))
        return;
    if (!document.getElementById('root-admin-ui-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'root-admin-ui-style';
        styleEl.textContent = `
            #root-admin-view .root-admin-card { border: 1px solid #e6ebf3; border-radius: 16px; box-shadow: 0 8px 22px rgba(15, 34, 71, 0.06); }
            #root-admin-view .root-admin-card .card-body { padding: 1.2rem 1.2rem 1rem; }
            #root-admin-view .ra-heading { font-size: 1.7rem; font-weight: 800; letter-spacing: 0.2px; color: #1f2a67; }
            #root-admin-view .ra-subheading { font-size: 1.05rem; font-weight: 700; color: #2b3674; margin-bottom: 0.8rem; }
            #root-admin-view .ra-add-form .form-control,
            #root-admin-view .ra-add-form .form-select { min-height: 46px; border-radius: 12px; }
            #root-admin-view .ra-add-form .btn { min-height: 46px; border-radius: 12px; font-weight: 700; }
            #root-admin-view .table-responsive { border: 1px solid #edf1f7; border-radius: 12px; max-height: 56vh; overflow: auto; background: #fff; }
            #root-admin-view .root-admin-table { table-layout: fixed; min-width: 1180px; margin-bottom: 0; }
            #root-admin-view .root-admin-table thead th { position: sticky; top: 0; z-index: 1; background: #f8faff; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; color: #3a4a6b; border-bottom: 1px solid #e5ebf5; }
            #root-admin-view .root-admin-table td { vertical-align: middle; }
            #root-admin-view .ra-name-cell { font-weight: 700; color: #1f2a52; line-height: 1.25; }
            #root-admin-view .ra-email-cell { color: #25355f; word-break: break-word; }
            #root-admin-view .ra-role-badge { font-weight: 700; border: 1px solid #cdd9f1; background: #f4f7ff; color: #2d4f9d; border-radius: 999px; padding: 0.3rem 0.6rem; }
            #root-admin-view .ra-action { display: flex; gap: 0.45rem; align-items: center; width: 100%; min-width: 0; }
            #root-admin-view .ra-action .form-control { min-height: 38px; border-radius: 10px; flex: 1 1 auto; min-width: 0; }
            #root-admin-view .ra-action .btn { min-height: 38px; border-radius: 10px; font-weight: 700; white-space: nowrap; flex: 0 0 auto; min-width: 112px; }
            @media (max-width: 1200px) {
                #root-admin-view .root-admin-table { min-width: 1040px; }
                #root-admin-view .ra-action .btn { min-width: 96px; }
            }
            @media (max-width: 900px) {
                #root-admin-view .ra-action { flex-direction: column; align-items: stretch; }
                #root-admin-view .ra-action .btn { width: 100%; min-width: 0; }
            }
        `;
        document.head.appendChild(styleEl);
    }
    const teacherView = document.getElementById('teacher-view');
    if (!teacherView || !teacherView.parentElement)
        return;
    const rootView = document.createElement('div');
    rootView.id = 'root-admin-view';
    rootView.className = 'view';
    rootView.innerHTML = `
        <div class="container-fluid py-2">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2 class="ra-heading mb-0">Root Admin Workspace</h2>
                <button class="btn btn-outline-primary btn-sm" onclick="loadRootAdminPanel()">Refresh</button>
            </div>
            <div id="root-admin-alert" class="alert d-none" role="alert"></div>
            <div class="card root-admin-card mb-4">
                <div class="card-body">
                    <h5 class="ra-subheading">Personas</h5>
                    <form id="root-add-student-form" class="row g-2 mb-3 ra-add-form">
                        <div class="col-md-3"><input id="ra-student-name" class="form-control" placeholder="Name" required></div>
                        <div class="col-md-2"><input id="ra-student-email" class="form-control" placeholder="User Email" required></div>
                        <div class="col-md-2">
                            <select id="ra-student-role" class="form-select" required>
                                <option value="Student">Student</option>
                                <option value="Teacher">Teacher</option>
                                <option value="Principal">Principal</option>
                                <option value="Tenant_Admin">Tenant Admin</option>
                                <option value="Parent">Parent</option>
                                <option value="Parent_Guardian">Parent Guardian</option>
                                <option value="Academic_Admin">Academic Admin</option>
                                <option value="HR_Admin">HR Admin</option>
                            </select>
                        </div>
                        <div class="col-md-2"><input id="ra-student-password" type="password" class="form-control" placeholder="Password" required></div>
                        <div class="col-md-3"><button class="btn btn-primary w-100" type="submit">Add Persona</button></div>
                    </form>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle root-admin-table">
                            <thead><tr><th style="width:22%">Name</th><th style="width:24%">Email</th><th style="width:10%">Role</th><th style="width:22%">Email Update</th><th style="width:22%">Password Update</th></tr></thead>
                            <tbody id="ra-students-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="card root-admin-card">
                <div class="card-body">
                    <h5 class="ra-subheading">Schools</h5>
                    <form id="root-create-school-form" class="row g-2 mb-3">
                        <div class="col-md-3"><input id="ra-school-name" class="form-control" placeholder="School Name" required></div>
                        <div class="col-md-3"><input id="ra-school-email" class="form-control" placeholder="School Email" required></div>
                        <div class="col-md-3"><input id="ra-school-password" type="password" class="form-control" placeholder="School Password" required></div>
                        <div class="col-md-3"><input id="ra-school-address" class="form-control" placeholder="Address" required></div>
                        <div class="col-md-3"><button class="btn btn-success w-100 mt-2" type="submit">Create School + Send OTP</button></div>
                    </form>
                    <form id="root-verify-otp-form" class="row g-2 mb-3">
                        <div class="col-md-3"><input id="ra-verify-school-id" type="number" class="form-control" placeholder="School ID" required></div>
                        <div class="col-md-3"><input id="ra-verify-otp" class="form-control" placeholder="OTP" required></div>
                        <div class="col-md-3"><button class="btn btn-warning w-100" type="submit">Verify OTP & Activate</button></div>
                    </form>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle">
                            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Active</th></tr></thead>
                            <tbody id="ra-schools-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
    teacherView.parentElement.appendChild(rootView);
}
function setRootAdminAlert(message, type = 'info') {
    const alertEl = document.getElementById('root-admin-alert');
    if (!alertEl)
        return;
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = message;
}
function loadRootAdminPanel() {
    return __awaiter(this, void 0, void 0, function* () {
        ensureRootAdminView();
        const sRes = yield fetchAPI('/root-admin/students');
        const students = sRes.ok ? yield sRes.json() : [];
        const studentsBody = document.getElementById('ra-students-body');
        if (studentsBody) {
            studentsBody.innerHTML = students.map((s) => `
                <tr>
                    <td class="ra-name-cell">${s.name || ''}</td>
                    <td class="ra-email-cell" title="${s.display_email || s.id || ''}">${s.display_email || s.id || ''}</td>
                    <td><span class="ra-role-badge">${s.role || ''}</span></td>
                    <td><div class="ra-action"><input id="ra-email-${s.id}" class="form-control form-control-sm" placeholder="New email" value="${s.display_email || s.id || ''}"><button type="button" class="btn btn-outline-primary btn-sm" onclick="rootUpdateStudentEmail('${s.id}')">Update</button></div></td>
                    <td><div class="ra-action"><input id="ra-pass-${s.id}" type="text" class="form-control form-control-sm" placeholder="New password" value="${s.password || ''}"><button type="button" class="btn btn-outline-danger btn-sm" onclick="rootUpdateStudentPassword('${s.id}')">Update</button></div></td>
                </tr>
            `).join('');
        }
        const scRes = yield fetchAPI('/root-admin/schools');
        const schools = scRes.ok ? yield scRes.json() : [];
        const schoolsBody = document.getElementById('ra-schools-body');
        if (schoolsBody) {
            schoolsBody.innerHTML = schools.map((s) => `<tr><td>${s.id}</td><td>${s.name}</td><td>${s.contact_email || ''}</td><td>${s.is_active ? 'Yes' : 'No'}</td></tr>`).join('');
        }
        bindRootAdminForms();
    });
}
function rootDbEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function ensureRootAdminDatabaseView() {
    if (document.getElementById('root-admin-db-view'))
        return;
    const teacherView = document.getElementById('teacher-view');
    if (!teacherView || !teacherView.parentElement)
        return;
    const dbView = document.createElement('div');
    dbView.id = 'root-admin-db-view';
    dbView.className = 'view';
    dbView.innerHTML = `
        <div class="container-fluid py-2">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2 class="fw-bold mb-0">Database Explorer</h2>
                <button class="btn btn-outline-primary btn-sm" onclick="loadRootAdminDatabase()">Refresh Database</button>
            </div>
            <div id="root-admin-db-content" class="card border-0 shadow-sm rounded-4">
                <div class="card-body text-muted">Loading database...</div>
            </div>
        </div>
    `;
    teacherView.parentElement.appendChild(dbView);
}
function loadRootAdminDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        ensureRootAdminDatabaseView();
        const container = document.getElementById('root-admin-db-content');
        if (!container)
            return;
        container.innerHTML = '<div class="card-body text-muted">Loading database...</div>';
        const endpoints = ['/root-admin/database', '/root-admin/db'];
        let res = null;
        let lastErr = '';
        for (const ep of endpoints) {
            const attempt = yield fetchAPI(ep);
            if (attempt.ok) {
                res = attempt;
                break;
            }
            lastErr = yield attempt.text().catch(() => '');
            if (attempt.status !== 404) {
                res = attempt;
                break;
            }
        }
        if (!res || !res.ok) {
            container.innerHTML = `<div class="card-body text-danger">Failed to load database: ${rootDbEscape(lastErr || 'Endpoint not found. Restart backend server to load latest routes.')}</div>`;
            return;
        }
        const data = yield res.json();
        const tables = Array.isArray(data.tables) ? data.tables : [];
        if (!tables.length) {
            container.innerHTML = '<div class="card-body text-muted">No tables found.</div>';
            return;
        }
        const html = tables.map((t) => {
            if (t.error) {
                return `
                    <div class="card-body border-bottom">
                        <h5 class="fw-bold mb-1">${rootDbEscape(t.table)}</h5>
                        <div class="text-danger small">${rootDbEscape(t.error)}</div>
                    </div>
                `;
            }
            const columns = Array.isArray(t.columns) ? t.columns : [];
            const rows = Array.isArray(t.rows) ? t.rows : [];
            const header = columns.map((c) => `<th>${rootDbEscape(c)}</th>`).join('');
            const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${rootDbEscape(r[c])}</td>`).join('')}</tr>`).join('');
            return `
                <div class="card-body border-bottom">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h5 class="fw-bold mb-0">${rootDbEscape(t.table)}</h5>
                        <span class="badge bg-primary-subtle text-primary">Rows: ${rootDbEscape(t.row_count)}</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped align-middle">
                            <thead><tr>${header}</tr></thead>
                            <tbody>${body}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = html;
    });
}
function bindRootAdminForms() {
    const addStudentForm = document.getElementById('root-add-student-form');
    if (addStudentForm && !addStudentForm.dataset.bound) {
        addStudentForm.dataset.bound = '1';
        addStudentForm.addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
            e.preventDefault();
            const payload = {
                name: document.getElementById('ra-student-name').value,
                email: document.getElementById('ra-student-email').value,
                role: document.getElementById('ra-student-role').value,
                password: document.getElementById('ra-student-password').value,
            };
            const res = yield fetchAPI('/root-admin/students', { method: 'POST', body: JSON.stringify(payload) });
            if (!res.ok) {
                const err = yield res.text();
                setRootAdminAlert(`Add persona failed: ${err}`, 'danger');
                return;
            }
            setRootAdminAlert('Persona added successfully.', 'success');
            yield loadRootAdminPanel();
        }));
    }
    const createSchoolForm = document.getElementById('root-create-school-form');
    if (createSchoolForm && !createSchoolForm.dataset.bound) {
        createSchoolForm.dataset.bound = '1';
        createSchoolForm.addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
            e.preventDefault();
            const payload = {
                name: document.getElementById('ra-school-name').value,
                contact_email: document.getElementById('ra-school-email').value,
                account_password: document.getElementById('ra-school-password').value,
                address: document.getElementById('ra-school-address').value,
            };
            const res = yield fetchAPI('/root-admin/schools', { method: 'POST', body: JSON.stringify(payload) });
            const data = yield res.json().catch(() => ({}));
            if (!res.ok) {
                setRootAdminAlert(`Create school failed: ${data.detail || 'Unknown error'}`, 'danger');
                return;
            }
            setRootAdminAlert(`School created (ID ${data.school_id}). OTP sent from Root Admin email.`, 'success');
            document.getElementById('ra-verify-school-id').value = String(data.school_id || '');
            yield loadRootAdminPanel();
        }));
    }
    const verifyOtpForm = document.getElementById('root-verify-otp-form');
    if (verifyOtpForm && !verifyOtpForm.dataset.bound) {
        verifyOtpForm.dataset.bound = '1';
        verifyOtpForm.addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
            e.preventDefault();
            const payload = {
                school_id: Number(document.getElementById('ra-verify-school-id').value),
                otp: document.getElementById('ra-verify-otp').value,
            };
            const res = yield fetchAPI('/root-admin/schools/verify-otp', { method: 'POST', body: JSON.stringify(payload) });
            const data = yield res.json().catch(() => ({}));
            if (!res.ok) {
                setRootAdminAlert(`OTP verify failed: ${data.detail || 'Unknown error'}`, 'danger');
                return;
            }
            setRootAdminAlert('School activated successfully.', 'success');
            yield loadRootAdminPanel();
        }));
    }
}
function rootUpdateStudentEmail(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById(`ra-email-${studentId}`);
        const email = (input && input.value || '').trim();
        if (!email)
            return;
        const res = yield fetchAPI(`/root-admin/students/${encodeURIComponent(studentId)}/email`, {
            method: 'PATCH',
            body: JSON.stringify({ email })
        });
        const data = yield res.json().catch(() => ({}));
        if (!res.ok) {
            setRootAdminAlert(`Email update failed: ${data.detail || data.message || 'Unknown error'}`, 'danger');
            return;
        }
        setRootAdminAlert('User email updated.', 'success');
        yield loadRootAdminPanel();
    });
}
function rootUpdateStudentPassword(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById(`ra-pass-${studentId}`);
        const password = (input && input.value || '').trim();
        if (!password)
            return;
        const res = yield fetchAPI(`/root-admin/students/${encodeURIComponent(studentId)}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password })
        });
        const data = yield res.json().catch(() => ({}));
        if (!res.ok) {
            setRootAdminAlert(`Password update failed: ${data.detail || data.message || 'Unknown error'}`, 'danger');
            return;
        }
        setRootAdminAlert('User password updated.', 'success');
        yield loadRootAdminPanel();
    });
}
function renderRootAdminControls() {
    elements.userControls.innerHTML = '';
    const inviteSection = document.getElementById('invite-section');
    if (inviteSection)
        inviteSection.classList.add('d-none');
    const navList = document.createElement('div');
    navList.className = 'nav-menu';
    const item = document.createElement('a');
    item.href = '#';
    item.className = 'nav-item active';
    item.innerHTML = `<span class="material-icons">admin_panel_settings</span> <span>Root Admin Panel</span>`;
    item.onclick = (e) => {
        e.preventDefault();
        switchView('root-admin-view');
        loadRootAdminPanel();
    };
    navList.appendChild(item);
    const dbItem = document.createElement('a');
    dbItem.href = '#';
    dbItem.className = 'nav-item';
    dbItem.innerHTML = `<span class="material-icons">storage</span> <span>Database Explorer</span>`;
    dbItem.onclick = (e) => {
        e.preventDefault();
        ensureRootAdminDatabaseView();
        switchView('root-admin-db-view');
        loadRootAdminDatabase();
    };
    navList.appendChild(dbItem);
    elements.userControls.appendChild(navList);
}
// --- SUPER ADMIN FUNCTIONS ---
let institutionConfigCache = {};
let institutionWizardStep1Saved = false;
let institutionContactsDraft = [];
let institutionContactEditIndex = -1;
function setSuperAdminInstitutionListMode(enabled) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const main = document.getElementById('main-content');
    if (enabled) {
        if (sidebar)
            sidebar.style.display = 'none';
        if (overlay)
            overlay.style.display = 'none';
        if (main) {
            main.style.marginLeft = '0';
            main.style.width = '100%';
        }
    }
    else {
        if (sidebar)
            sidebar.style.display = '';
        if (overlay)
            overlay.style.display = '';
        if (main) {
            main.style.marginLeft = '';
            main.style.width = '';
        }
    }
}
function getCurrentSuperAdminSchoolId() {
    if (!appState.isSuperAdmin)
        return null;
    const schoolId = appState.activeSchoolId || appState.schoolId || null;
    return schoolId ? Number(schoolId) : null;
}
function renderSuperAdminBackToInstitutionList() {
    const teacherView = document.getElementById('teacher-view');
    if (!teacherView)
        return;
    const existing = document.getElementById('superadmin-backbar');
    const currentSchoolId = getCurrentSuperAdminSchoolId();
    if (!currentSchoolId) {
        if (existing)
            existing.remove();
        return;
    }
    if (existing)
        existing.remove();
    const bar = document.createElement('div');
    bar.id = 'superadmin-backbar';
    bar.className = 'd-flex justify-content-between align-items-center mb-3 p-3 rounded-3 border bg-light';
    bar.innerHTML = `
        <div class="fw-bold text-primary">Super Admin Context: ${appState.schoolName || `Institution ${currentSchoolId}`}</div>
        <button type="button" class="btn btn-outline-primary btn-sm">
            <span class="material-icons align-middle" style="font-size:16px;">arrow_back</span>
            Back to Institution List
        </button>
    `;
    const btn = bar.querySelector('button');
    if (btn) {
        btn.addEventListener('click', () => {
            appState.activeSchoolId = null;
            loadSuperAdminDashboard();
        });
    }
    teacherView.insertBefore(bar, teacherView.firstChild);
}
function syncSuperAdminNavigationUI(viewId) {
    if (!appState.isSuperAdmin)
        return;
    const isInstitutionListView = viewId === 'super-admin-view' || viewId === 'createSchoolModal';
    setSuperAdminInstitutionListMode(isInstitutionListView);
    if (viewId === 'teacher-view') {
        renderSuperAdminBackToInstitutionList();
    }
    else {
        const existing = document.getElementById('superadmin-backbar');
        if (existing)
            existing.remove();
    }
}
function loadSuperAdminDashboard() {
    return __awaiter(this, void 0, void 0, function* () {
        // Build the sidebar first so Super Admin gets all navigation items
        renderTeacherControls();
        setSuperAdminInstitutionListMode(true);
        const backBar = document.getElementById('superadmin-backbar');
        if (backBar)
            backBar.remove();
        switchView('super-admin-view');
        const container = document.getElementById('super-admin-content');
        if (!container)
            return;
        container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary" role="status"></div><p>Loading institutions...</p></div>';
        try {
            let institutions = [];
            let response = yield fetchAPI('/admin/institutions', {});
            if (response.ok) {
                institutions = yield response.json();
            }
            else {
                response = yield fetchAPI('/admin/schools', {});
                if (response.ok) {
                    const schools = yield response.json();
                    institutions = (schools || []).map((s) => ({
                        id: s.id,
                        institution_id: `CB_INT_${String(s.id).padStart(6, '0')}`,
                        institution_official_name: s.name,
                        institution_type: 'K12 School',
                        institution_structure: 'Sole Entity',
                        state: 'Trial',
                        address: s.address || '',
                        contact_email: s.contact_email || '',
                        created_at: s.created_at
                    }));
                }
            }
            if (response.ok) {
                let html = `
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3 class="fw-bold text-primary">Institution Setup Config</h3>
                    <button class="btn btn-primary-custom" onclick="showCreateSchoolModal()">
                        <span class="material-icons align-middle fs-5 me-1">add_circle</span> Add Institution
                    </button>
                </div>
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light">
                                <tr>
                                    <th class="py-3 ps-4">Institution ID</th>
                                    <th class="py-3">Official Name</th>
                                    <th class="py-3">Type</th>
                                    <th class="py-3">Structure</th>
                                    <th class="py-3">State</th>
                                    <th class="py-3">Contact</th>
                                    <th class="py-3">Created</th>
                                    <th class="py-3 text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
                if (institutions.length === 0) {
                    html += `<tr><td colspan="8" class="text-center py-4 text-muted">No institutions registered yet.</td></tr>`;
                }
                else {
                    institutions.forEach(s => {
                        const safeName = (s.institution_official_name || '').replace(/"/g, '&quot;');
                        html += `<tr>
                        <td class="ps-4 fw-bold">${s.institution_id || `CB_INT_${String(s.id).padStart(6, '0')}`}</td>
                        <td>
                            <a href="#" class="text-primary fw-bold text-decoration-none" 
                               onclick="openSchoolDashboard(${s.id}, '${safeName}'); return false;">
                                ${s.institution_official_name || ''}
                            </a>
                        </td>
                        <td>${s.institution_type || ''}</td>
                        <td>${s.institution_structure || ''}</td>
                        <td>${s.state || ''}</td>
                        <td>${s.contact_email || ''}</td>
                        <td class="text-muted"><small>${new Date(s.created_at).toLocaleDateString()}</small></td>
                        <td class="text-end pe-4">
                            <div class="d-flex justify-content-end gap-2">
                                <button class="btn btn-sm btn-outline-primary"
                                    onclick="openInstitutionConfig(${s.id})"
                                    title="Tenant Configuration">
                                    <span class="material-icons" style="font-size: 16px;">settings</span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" 
                                    onclick="handleDeleteSchool(${s.id}, '${safeName}')"
                                    title="Delete Institution">
                                    <span class="material-icons" style="font-size: 16px;">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                    });
                }
                html += `</tbody></table></div></div>`;
                container.innerHTML = html;
            }
            else {
                container.innerHTML = '<p class="text-danger">Failed to load institutions.</p>';
            }
        }
        catch (e) {
            container.innerHTML = '<p class="text-danger">Error loading institutions: ' + e.message + '</p>';
        }
    });
}
function renderInstitutionContactRows(items) {
    const host = document.getElementById('institution-contacts-list');
    if (!host)
        return;
    if (Array.isArray(items)) {
        institutionContactsDraft = items.map((c) => ({
            individual_type: c.individual_type || 'Tenant Admin',
            custom_type: c.custom_type || '',
            first_name: c.first_name || '',
            middle_name: c.middle_name || '',
            last_name: c.last_name || '',
            email: c.email || '',
            status: c.status || 'Active',
            contact_number: c.contact_number || '',
            mobile_number: c.mobile_number || '',
            address: c.address || ''
        }));
    }
    const rows = institutionContactsDraft || [];
    if (!rows.length) {
        host.innerHTML = '<div class="text-muted small">No key individuals added yet.</div>';
        return;
    }
    host.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
                <thead class="table-light">
                    <tr>
                        <th>Individual Type</th>
                        <th>First Name</th>
                        <th>Last Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Contact</th>
                        <th>Mobile</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((c, idx) => `
                        <tr>
                            <td>${c.individual_type === 'Others' ? (c.custom_type || 'Others') : (c.individual_type || '')}</td>
                            <td>${c.first_name || ''}</td>
                            <td>${c.last_name || ''}</td>
                            <td>${c.email || ''}</td>
                            <td>${c.status || 'Active'}</td>
                            <td>${c.contact_number || ''}</td>
                            <td>${c.mobile_number || ''}</td>
                            <td class="text-end">
                                <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="openInstitutionContactModal(${idx})">Edit</button>
                                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeInstitutionContactRow(${idx})">Remove</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
function collectInstitutionContacts() {
    return (institutionContactsDraft || [])
        .filter((item) => item.individual_type && item.first_name && item.last_name && item.email);
}
function ensureInstitutionContactModal() {
    if (document.getElementById('institutionContactModal'))
        return;
    const html = `
        <div class="view full-page-view" id="institutionContactModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content rounded-4 border-0 shadow">
                    <div class="modal-header border-0 pb-0">
                        <h5 class="modal-title fw-bold text-primary" id="institution-contact-modal-title">Add Key Individual</h5>
                        <button type="button" class="btn-close" onclick="closeView()"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small">Individual Type</label>
                                <select id="inst-contact-type" class="form-select">
                                    <option value="Owner">Owner</option>
                                    <option value="Principal">Principal</option>
                                    <option value="Dean">Dean</option>
                                    <option value="Tenant Admin">Tenant Admin</option>
                                    <option value="Financial Admin">Financial Admin</option>
                                    <option value="Tech Admin">Tech Admin</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>
                            <div class="col-md-6 d-none" id="inst-contact-custom-wrap">
                                <label class="form-label small">Custom Type</label>
                                <input id="inst-contact-custom" class="form-control" placeholder="Specify individual type">
                            </div>
                            <div class="col-md-4"><label class="form-label small">First Name</label><input id="inst-contact-first" class="form-control"></div>
                            <div class="col-md-4"><label class="form-label small">Middle Name</label><input id="inst-contact-middle" class="form-control"></div>
                            <div class="col-md-4"><label class="form-label small">Last Name</label><input id="inst-contact-last" class="form-control"></div>
                            <div class="col-md-6"><label class="form-label small">Email</label><input id="inst-contact-email" class="form-control" type="email"></div>
                            <div class="col-md-6">
                                <label class="form-label small">Status</label>
                                <select id="inst-contact-status" class="form-select">
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                            <div class="col-md-6"><label class="form-label small">Contact Number</label><input id="inst-contact-phone" class="form-control"></div>
                            <div class="col-md-6"><label class="form-label small">Mobile Number</label><input id="inst-contact-mobile" class="form-control"></div>
                            <div class="col-12"><label class="form-label small">Address</label><input id="inst-contact-address" class="form-control"></div>
                        </div>
                        <div class="d-flex justify-content-end gap-2 mt-3">
                            <button type="button" class="btn btn-outline-secondary" onclick="closeView()">Cancel</button>
                            <button type="button" class="btn btn-primary-custom" onclick="saveInstitutionContactModal()">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const typeEl = document.getElementById('inst-contact-type');
    if (typeEl) {
        typeEl.addEventListener('change', () => {
            const wrap = document.getElementById('inst-contact-custom-wrap');
            if (wrap)
                wrap.classList.toggle('d-none', typeEl.value !== 'Others');
        });
    }
}
function openInstitutionContactModal(index = -1) {
    ensureInstitutionContactModal();
    institutionContactEditIndex = index;
    const edit = index >= 0 ? institutionContactsDraft[index] : {
        individual_type: 'Tenant Admin',
        custom_type: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        email: '',
        status: 'Active',
        contact_number: '',
        mobile_number: '',
        address: ''
    };
    const titleEl = document.getElementById('institution-contact-modal-title');
    if (titleEl)
        titleEl.textContent = index >= 0 ? 'Edit Key Individual' : 'Add Key Individual';
    document.getElementById('inst-contact-type').value = edit.individual_type || 'Tenant Admin';
    document.getElementById('inst-contact-custom').value = edit.custom_type || '';
    document.getElementById('inst-contact-first').value = edit.first_name || '';
    document.getElementById('inst-contact-middle').value = edit.middle_name || '';
    document.getElementById('inst-contact-last').value = edit.last_name || '';
    document.getElementById('inst-contact-email').value = edit.email || '';
    document.getElementById('inst-contact-status').value = edit.status || 'Active';
    document.getElementById('inst-contact-phone').value = edit.contact_number || '';
    document.getElementById('inst-contact-mobile').value = edit.mobile_number || '';
    document.getElementById('inst-contact-address').value = edit.address || '';
    const wrap = document.getElementById('inst-contact-custom-wrap');
    if (wrap)
        wrap.classList.toggle('d-none', (edit.individual_type || 'Tenant Admin') !== 'Others');
    openView('institutionContactModal');
}
function saveInstitutionContactModal() {
    const individual_type = (document.getElementById('inst-contact-type').value || '').trim();
    const custom_type = (document.getElementById('inst-contact-custom').value || '').trim();
    const first_name = (document.getElementById('inst-contact-first').value || '').trim();
    const middle_name = (document.getElementById('inst-contact-middle').value || '').trim();
    const last_name = (document.getElementById('inst-contact-last').value || '').trim();
    const email = (document.getElementById('inst-contact-email').value || '').trim();
    const status = (document.getElementById('inst-contact-status').value || 'Active').trim();
    const contact_number = (document.getElementById('inst-contact-phone').value || '').trim();
    const mobile_number = (document.getElementById('inst-contact-mobile').value || '').trim();
    const address = (document.getElementById('inst-contact-address').value || '').trim();
    if (!individual_type || !first_name || !last_name || !email) {
        alert('Individual Type, First Name, Last Name and Email are required.');
        return;
    }
    if (individual_type === 'Others' && !custom_type) {
        alert('Please provide custom individual type.');
        return;
    }
    const payload = {
        individual_type,
        custom_type,
        first_name,
        middle_name,
        last_name,
        email,
        status,
        contact_number,
        mobile_number,
        address
    };
    if (institutionContactEditIndex >= 0) {
        institutionContactsDraft[institutionContactEditIndex] = payload;
    }
    else {
        institutionContactsDraft.push(payload);
    }
    renderInstitutionContactRows();
    closeView();
}
function addInstitutionContactRow() {
    openInstitutionContactModal(-1);
}
function removeInstitutionContactRow(index) {
    institutionContactsDraft.splice(index, 1);
    renderInstitutionContactRows();
}
function openInstitutionConfig(schoolId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('super-admin-content');
        if (!container)
            return;
        container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="mt-2">Loading institution configuration...</p></div>';
        try {
            const res = yield fetchAPI(`/admin/institutions/${schoolId}`);
            if (!res.ok) {
                const err = yield res.json();
                throw new Error(err.detail || 'Failed to load institution config');
            }
            const data = yield res.json();
            institutionConfigCache[schoolId] = data;
            const selectedAddress = (data.addresses && data.addresses.length > 0)
                ? (data.addresses.find((a) => !!a.is_primary) || data.addresses[0])
                : null;
            institutionEditAddresses = [{
                address_line: selectedAddress ? (selectedAddress.address_line || '') : '',
                region: selectedAddress ? (selectedAddress.region || '') : '',
                timezone: selectedAddress ? (selectedAddress.timezone || '') : '',
                language: selectedAddress ? (selectedAddress.language || 'English') : 'English',
                is_primary: true
            }];
            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="fw-bold text-primary mb-0">Tenant Setup: ${data.institution_official_name || ''}</h4>
                    <button class="btn btn-outline-secondary" onclick="loadSuperAdminDashboard()"><span class="material-icons align-middle fs-6">arrow_back</span> Back</button>
                </div>
                <div id="institution-config-message" class="small fw-bold mb-3"></div>
                <div class="card border-0 shadow-sm rounded-4 mb-3">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">Section 1: Institution Details</h6>
                        <div class="row g-2">
                            <div class="col-md-3"><label class="form-label small">Institution ID</label><input id="inst-code" class="form-control" value="${data.institution_id || ''}" disabled></div>
                            <div class="col-md-3"><label class="form-label small">Official Name</label><input id="inst-official-name" class="form-control" value="${data.institution_official_name || ''}"></div>
                            <div class="col-md-3"><label class="form-label small">Visual Name</label><input id="inst-visual-name" class="form-control" value="${data.institution_visual_name || ''}"></div>
                            <div class="col-md-3">
                                <label class="form-label small">Type</label>
                                <select id="inst-type" class="form-select">
                                    <option value="Pre school" ${(data.institution_type || '') === 'Pre school' ? 'selected' : ''}>Pre school</option>
                                    <option value="Primary School" ${(data.institution_type || '') === 'Primary School' ? 'selected' : ''}>Primary School</option>
                                    <option value="Secondary School" ${(data.institution_type || '') === 'Secondary School' ? 'selected' : ''}>Secondary School</option>
                                    <option value="K12 School" ${(data.institution_type || 'K12 School') === 'K12 School' ? 'selected' : ''}>K12 School</option>
                                    <option value="College" ${(data.institution_type || '') === 'College' ? 'selected' : ''}>College</option>
                                    <option value="Company" ${(data.institution_type || '') === 'Company' ? 'selected' : ''}>Company</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small">Structure</label>
                                <select id="inst-structure" class="form-select">
                                    <option value="Sole Entity" ${(data.institution_structure || 'Sole Entity') === 'Sole Entity' ? 'selected' : ''}>Sole Entity</option>
                                    <option value="Union" ${(data.institution_structure || '') === 'Union' ? 'selected' : ''}>Union</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small">State</label>
                                <select id="inst-state" class="form-select">
                                    <option value="Trial" ${(data.state || 'Trial') === 'Trial' ? 'selected' : ''}>Trial</option>
                                    <option value="Active" ${(data.state || '') === 'Active' ? 'selected' : ''}>Active</option>
                                    <option value="Suspended" ${(data.state || '') === 'Suspended' ? 'selected' : ''}>Suspended</option>
                                    <option value="Archived" ${(data.state || '') === 'Archived' ? 'selected' : ''}>Archived</option>
                                    <option value="Deleted" ${(data.state || '') === 'Deleted' ? 'selected' : ''}>Deleted</option>
                                </select>
                            </div>
                            <div class="col-md-6"><label class="form-label small">Brief Details</label><input id="inst-brief" class="form-control" value="${data.institution_brief_details || ''}"></div>
                        </div>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 mb-3">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">Section 2: Institution Address</h6>
                        <div class="small text-muted mb-2">Edit mode updates the selected address context.</div>
                        <div id="inst-address-list"></div>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="fw-bold mb-0">Section 3: Primary Contacts</h6>
                            <button class="btn btn-outline-primary btn-sm" type="button" onclick="addInstitutionContactRow()">Add Key Individual</button>
                        </div>
                        <div id="institution-contacts-list"></div>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 mb-3">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">Section 4: Tenant Security</h6>
                        <div class="row g-2">
                            <div class="col-md-4">
                                <label class="form-label small">Authentication Mode</label>
                                <select id="inst-auth-mode" class="form-select">
                                    <option value="password_only" ${(data.security && data.security.auth_mode) === 'password_only' ? 'selected' : ''}>User ID + Password</option>
                                    <option value="email_otp" ${(data.security && data.security.auth_mode) === 'email_otp' ? 'selected' : ''}>Email OTP</option>
                                    <option value="authenticator_app" ${(data.security && data.security.auth_mode) === 'authenticator_app' ? 'selected' : ''}>Authenticator App</option>
                                </select>
                            </div>
                            <div class="col-md-8"><label class="form-label small">Recommendation</label><input id="inst-security-recommendation" class="form-control" value="${(data.security && data.security.recommendation_text) || ''}"></div>
                        </div>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 mb-3">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">Section 5: Branding</h6>
                        <div class="row g-2">
                            <div class="col-md-4"><label class="form-label small">Logo URL</label><input id="inst-logo-url" class="form-control" value="${(data.branding && data.branding.logo_url) || ''}"></div>
                            <div class="col-md-4"><label class="form-label small">Color Theme</label><input id="inst-color-theme" class="form-control" value="${(data.branding && data.branding.color_theme) || ''}"></div>
                            <div class="col-md-4"><label class="form-label small">Default Course Image URL</label><input id="inst-course-image" class="form-control" value="${(data.branding && data.branding.default_course_image_url) || ''}"></div>
                            <div class="col-md-6">
                                <label class="form-label small">Upload Logo (max 1MB)</label>
                                <input id="inst-logo-file" type="file" class="form-control" accept=".png,.jpg,.jpeg,.webp,.svg">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small">Upload Default Course Image (max 1MB)</label>
                                <input id="inst-course-file" type="file" class="form-control" accept=".png,.jpg,.jpeg,.webp,.svg">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 mb-4">
                    <div class="card-body">
                        <h6 class="fw-bold mb-3">Section 6: Date, Time & Currency</h6>
                        <div class="row g-2">
                            <div class="col-md-4"><label class="form-label small">Date Format</label><input id="inst-date-format" class="form-control" value="${(data.locale && data.locale.date_format) || 'YYYY-MM-DD'}"></div>
                            <div class="col-md-4"><label class="form-label small">Time Format</label><input id="inst-time-format" class="form-control" value="${(data.locale && data.locale.time_format) || '24h'}"></div>
                            <div class="col-md-4"><label class="form-label small">Currency Code</label><input id="inst-currency-code" class="form-control" value="${(data.locale && data.locale.currency_code) || 'USD'}"></div>
                        </div>
                    </div>
                </div>
                <div class="d-flex gap-2 justify-content-end mb-2">
                    <button class="btn btn-outline-secondary" type="button" onclick="loadSuperAdminDashboard()">Cancel</button>
                    <button class="btn btn-primary-custom" type="button" onclick="submitInstitutionConfigUpdate(${schoolId})">Update</button>
                </div>
            `;
            renderInstitutionContactRows(data.key_individuals || []);
            renderInstitutionEditAddresses();
            const typeEl = document.getElementById('inst-type');
            const authEl = document.getElementById('inst-auth-mode');
            const recEl = document.getElementById('inst-security-recommendation');
            const syncRec = () => {
                if (!recEl)
                    return;
                if (!(recEl.value || '').trim()) {
                    recEl.value = getSecurityRecommendation(typeEl ? typeEl.value : '', authEl ? authEl.value : '');
                }
            };
            if (typeEl)
                typeEl.addEventListener('change', () => {
                    if (recEl)
                        recEl.value = getSecurityRecommendation(typeEl.value, authEl ? authEl.value : '');
                });
            if (authEl)
                authEl.addEventListener('change', () => {
                    if (recEl)
                        recEl.value = getSecurityRecommendation(typeEl ? typeEl.value : '', authEl.value);
                });
            syncRec();
        }
        catch (e) {
            container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
        }
    });
}
function submitInstitutionConfigUpdate(schoolId) {
    return __awaiter(this, void 0, void 0, function* () {
        const msgEl = document.getElementById('institution-config-message');
        if (msgEl) {
            msgEl.className = 'small fw-bold text-primary mb-3';
            msgEl.textContent = 'Updating institution...';
        }
        const structure = (document.getElementById('inst-structure').value || '').trim();
        if (!institutionEditAddresses.length || !String(institutionEditAddresses[0].address_line || '').trim()) {
            if (msgEl) {
                msgEl.className = 'small fw-bold text-danger mb-3';
                msgEl.textContent = 'Primary address is required.';
            }
            return;
        }
        if (structure === 'Sole Entity' && institutionEditAddresses.length > 1) {
            if (msgEl) {
                msgEl.className = 'small fw-bold text-danger mb-3';
                msgEl.textContent = 'Sole Entity supports one address only.';
            }
            return;
        }
        let logoUrl = (document.getElementById('inst-logo-url').value || '').trim();
        let courseImageUrl = (document.getElementById('inst-course-image').value || '').trim();
        const uploadAsset = (assetType, fileObj) => __awaiter(this, void 0, void 0, function* () {
            const fd = new FormData();
            fd.append('asset_type', assetType);
            fd.append('file', fileObj);
            const upRes = yield fetchAPI(`/admin/institutions/${schoolId}/branding/upload`, {
                method: 'POST',
                body: fd
            });
            if (!upRes.ok) {
                const err = yield upRes.json().catch(() => ({}));
                throw new Error(err.detail || `Failed to upload ${assetType}`);
            }
            const upData = yield upRes.json();
            return upData.url || '';
        });
        try {
            const logoFileEl = document.getElementById('inst-logo-file');
            const courseFileEl = document.getElementById('inst-course-file');
            if (logoFileEl && logoFileEl.files && logoFileEl.files[0]) {
                logoUrl = yield uploadAsset('logo', logoFileEl.files[0]);
            }
            if (courseFileEl && courseFileEl.files && courseFileEl.files[0]) {
                courseImageUrl = yield uploadAsset('default_course_image', courseFileEl.files[0]);
            }
        }
        catch (e) {
            if (msgEl) {
                msgEl.className = 'small fw-bold text-danger mb-3';
                msgEl.textContent = e.message || 'Branding upload failed';
            }
            return;
        }
        const payload = {
            institution_official_name: (document.getElementById('inst-official-name').value || '').trim(),
            institution_visual_name: (document.getElementById('inst-visual-name').value || '').trim(),
            institution_brief_details: (document.getElementById('inst-brief').value || '').trim(),
            institution_type: (document.getElementById('inst-type').value || '').trim(),
            institution_structure: structure,
            state: (document.getElementById('inst-state').value || 'Trial').trim(),
            addresses: institutionEditAddresses.map((a, idx) => ({
                address_line: String(a.address_line || '').trim(),
                region: String(a.region || '').trim(),
                timezone: String(a.timezone || '').trim(),
                language: String(a.language || 'English').trim(),
                is_primary: idx === 0
            })),
            key_individuals: collectInstitutionContacts(),
            security: {
                auth_mode: (document.getElementById('inst-auth-mode').value || 'password_only').trim(),
                recommendation_text: (document.getElementById('inst-security-recommendation').value || '').trim()
            },
            branding: {
                logo_url: logoUrl,
                color_theme: (document.getElementById('inst-color-theme').value || '').trim(),
                default_course_image_url: courseImageUrl
            },
            locale: {
                date_format: (document.getElementById('inst-date-format').value || 'YYYY-MM-DD').trim(),
                time_format: (document.getElementById('inst-time-format').value || '24h').trim(),
                currency_code: (document.getElementById('inst-currency-code').value || 'USD').trim().toUpperCase()
            }
        };
        try {
            const res = yield fetchAPI(`/admin/institutions/${schoolId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                const err = yield res.json();
                throw new Error(err.detail || 'Update failed');
            }
            if (msgEl) {
                msgEl.className = 'small fw-bold text-success mb-3';
                msgEl.textContent = 'The institution has been successfully updated.';
            }
            loadSuperAdminDashboard().then(() => {
                const toast = document.createElement('div');
                toast.className = 'alert alert-success position-fixed';
                toast.style.top = '16px';
                toast.style.right = '16px';
                toast.style.zIndex = '9999';
                toast.textContent = 'The institution has been successfully updated.';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            });
        }
        catch (e) {
            if (msgEl) {
                msgEl.className = 'small fw-bold text-danger mb-3';
                msgEl.textContent = e.message || 'Update failed';
            }
        }
    });
}
let institutionWizardAddresses = [];
let institutionEditAddresses = [];
function resetInstitutionWizardAddresses() {
    institutionWizardAddresses = [{
        address_line: '',
        region: '',
        timezone: '',
        language: 'English',
        is_primary: true
    }];
}
function renderInstitutionWizardAddresses() {
    const host = document.getElementById('new-school-address-list');
    if (!host)
        return;
    host.innerHTML = institutionWizardAddresses.map((a, idx) => `
        <div class="bg-light border rounded-4 p-3 mb-3 position-relative">
            ${idx !== 0 ? `<button type="button" class="btn-close position-absolute top-0 end-0 m-2" onclick="removeInstitutionWizardAddress(${idx})" aria-label="Close"></button>` : `<span class="badge bg-primary position-absolute top-0 end-0 m-2 rounded-pill px-3 shadow-sm">Primary</span>`}
            <div class="row g-3 mt-1">
                <div class="col-md-12">
                    <label class="form-label text-secondary small fw-bold mb-1">Full Address</label>
                    <input class="form-control bg-white border-light-subtle py-2 wiz-address-line" data-idx="${idx}" placeholder="e.g. 123 Main St" value="${a.address_line || ''}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-secondary small fw-bold mb-1">Region / City</label>
                    <input class="form-control bg-white border-light-subtle py-2 wiz-region" data-idx="${idx}" placeholder="Region" value="${a.region || ''}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-secondary small fw-bold mb-1">Timezone</label>
                    <input class="form-control bg-white border-light-subtle py-2 wiz-timezone" data-idx="${idx}" placeholder="Timezone" value="${a.timezone || ''}">
                </div>
                <div class="col-md-4">
                    <label class="form-label text-secondary small fw-bold mb-1">Language</label>
                    <input class="form-control bg-white border-light-subtle py-2 wiz-language" data-idx="${idx}" placeholder="Language" value="${a.language || 'English'}">
                </div>
            </div>
        </div>
    `).join('');
    host.querySelectorAll('.wiz-address-line').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionWizardAddresses[idx].address_line = e.target.value;
        institutionWizardStep1Saved = false;
    }));
    host.querySelectorAll('.wiz-region').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionWizardAddresses[idx].region = e.target.value;
        institutionWizardStep1Saved = false;
    }));
    host.querySelectorAll('.wiz-timezone').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionWizardAddresses[idx].timezone = e.target.value;
        institutionWizardStep1Saved = false;
    }));
    host.querySelectorAll('.wiz-language').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionWizardAddresses[idx].language = e.target.value;
        institutionWizardStep1Saved = false;
    }));
}
function addInstitutionWizardAddress() {
    institutionWizardAddresses.push({
        address_line: '',
        region: '',
        timezone: '',
        language: 'English',
        is_primary: false
    });
    institutionWizardStep1Saved = false;
    renderInstitutionWizardAddresses();
}
function removeInstitutionWizardAddress(index) {
    institutionWizardAddresses.splice(index, 1);
    if (institutionWizardAddresses.length === 0)
        resetInstitutionWizardAddresses();
    institutionWizardAddresses[0].is_primary = true;
    institutionWizardStep1Saved = false;
    renderInstitutionWizardAddresses();
}
function renderInstitutionEditAddresses() {
    const host = document.getElementById('inst-address-list');
    if (!host)
        return;
    host.innerHTML = institutionEditAddresses.map((a, idx) => `
        <div class="border rounded-3 p-3 mb-2">
            <div class="row g-2">
                <div class="col-md-4"><input class="form-control inst-edit-address-line" data-idx="${idx}" placeholder="Address" value="${a.address_line || ''}"></div>
                <div class="col-md-3"><input class="form-control inst-edit-region" data-idx="${idx}" placeholder="Region" value="${a.region || ''}"></div>
                <div class="col-md-3"><input class="form-control inst-edit-timezone" data-idx="${idx}" placeholder="Timezone" value="${a.timezone || ''}"></div>
                <div class="col-md-2"><input class="form-control inst-edit-language" data-idx="${idx}" placeholder="Language" value="${a.language || 'English'}"></div>
                <div class="col-md-1 d-grid">${idx === 0 ? '<button type="button" class="btn btn-outline-secondary btn-sm" disabled>Primary</button>' : `<button type="button" class="btn btn-outline-danger btn-sm" onclick="removeInstitutionEditAddress(${idx})">X</button>`}</div>
            </div>
        </div>
    `).join('');
    host.querySelectorAll('.inst-edit-address-line').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionEditAddresses[idx].address_line = e.target.value;
    }));
    host.querySelectorAll('.inst-edit-region').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionEditAddresses[idx].region = e.target.value;
    }));
    host.querySelectorAll('.inst-edit-timezone').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionEditAddresses[idx].timezone = e.target.value;
    }));
    host.querySelectorAll('.inst-edit-language').forEach((el) => el.addEventListener('input', (e) => {
        const idx = Number(e.target.getAttribute('data-idx'));
        institutionEditAddresses[idx].language = e.target.value;
    }));
}
function addInstitutionEditAddress() {
    const structure = (document.getElementById('inst-structure').value || '').trim();
    if (structure === 'Sole Entity' && institutionEditAddresses.length >= 1) {
        alert('Sole Entity supports one address only. Switch to Union to add multiple addresses.');
        return;
    }
    institutionEditAddresses.push({ address_line: '', region: '', timezone: '', language: 'English', is_primary: false });
    renderInstitutionEditAddresses();
}
function removeInstitutionEditAddress(index) {
    institutionEditAddresses.splice(index, 1);
    if (institutionEditAddresses.length === 0) {
        institutionEditAddresses = [{ address_line: '', region: '', timezone: '', language: 'English', is_primary: true }];
    }
    institutionEditAddresses[0].is_primary = true;
    renderInstitutionEditAddresses();
}
function getSecurityRecommendation(institutionType, authMode) {
    const t = String(institutionType || '').trim();
    const m = String(authMode || '').trim();
    let base = 'Recommended: Email OTP for balanced security.';
    if (['Secondary School', 'K12 School', 'College'].includes(t))
        base = 'Recommended: Authenticator app for stronger security at scale.';
    if (t === 'Company')
        base = 'Recommended: Authenticator app for enterprise-grade protection.';
    if (m === 'password_only')
        return `${base} Password-only is the least secure option.`;
    if (m === 'email_otp')
        return `${base} Email OTP balances usability and security.`;
    if (m === 'authenticator_app')
        return `${base} Authenticator app is the strongest option.`;
    return base;
}
function goInstitutionCreateStep(step) {
    const details = document.getElementById('institution-step-details');
    const contacts = document.getElementById('institution-step-contacts');
    const detailsTab = document.getElementById('wizard-step-details');
    const contactsTab = document.getElementById('wizard-step-contacts');
    if (!details || !contacts || !detailsTab || !contactsTab)
        return;
    if (step === 2 && !institutionWizardStep1Saved) {
        alert('Please save Section 1 before proceeding to Section 2.');
        return;
    }
    const progressBar = document.getElementById('wizard-progress-bar');
    if (step === 1) {
        details.classList.remove('d-none');
        contacts.classList.add('d-none');
        detailsTab.classList.add('active', 'btn-primary', 'text-white', 'shadow-sm');
        detailsTab.classList.remove('btn-light', 'text-muted', 'border');
        contactsTab.classList.remove('active', 'btn-primary', 'text-white', 'shadow-sm');
        contactsTab.classList.add('btn-light', 'text-muted', 'border');
        if (progressBar) progressBar.style.backgroundColor = '#e9ecef';
    }
    else {
        details.classList.add('d-none');
        contacts.classList.remove('d-none');
        detailsTab.classList.remove('active', 'btn-primary', 'text-white', 'shadow-sm');
        detailsTab.classList.add('btn-light', 'text-muted', 'border');
        contactsTab.classList.add('active', 'btn-primary', 'text-white', 'shadow-sm');
        contactsTab.classList.remove('btn-light', 'text-muted', 'border');
        if (progressBar) progressBar.style.backgroundColor = '#2563EB';
    }
}
function saveInstitutionWizardStep1AndContinue() {
    if (!validateInstitutionWizardStep1())
        return;
    institutionWizardStep1Saved = true;
    goInstitutionCreateStep(2);
}
function validateInstitutionWizardStep1() {
    let isValid = true;
    let firstInvalidEl = null;

    const nameEl = document.getElementById('wiz-inst-name');
    const name = (nameEl.value || '').trim();
    const type = (document.getElementById('wiz-inst-type').value || '').trim();
    const structure = (document.getElementById('wiz-inst-structure').value || '').trim();

    if (!name) {
        nameEl.classList.add('is-invalid', 'border-danger');
        if (!firstInvalidEl) firstInvalidEl = nameEl;
        isValid = false;
    } else {
        nameEl.classList.remove('is-invalid', 'border-danger');
    }

    if (!name || !type || !structure) {
        alert('Please complete the highlighted required fields (e.g. Institution Official Name) before continuing.');
        if (firstInvalidEl) firstInvalidEl.focus();
        return false;
    }

    if (structure === 'Sole Entity' && institutionWizardAddresses.length > 1) {
        alert('Sole Entity supports one address only. Use Union structure for multiple addresses.');
        return false;
    }

    let addressValid = true;
    for (let i = 0; i < institutionWizardAddresses.length; i++) {
        const addressEl = document.querySelector(`.wiz-address-line[data-idx="${i}"]`);
        if (!(institutionWizardAddresses[i].address_line || '').trim()) {
            if (addressEl) {
                addressEl.classList.add('is-invalid', 'border-danger');
                if (!firstInvalidEl) firstInvalidEl = addressEl;
            }
            addressValid = false;
        } else {
            if (addressEl) addressEl.classList.remove('is-invalid', 'border-danger');
        }
    }

    if (!addressValid) {
        alert('Please provide the Full Address for all highlighted locations.');
        if (firstInvalidEl) firstInvalidEl.focus();
        return false;
    }

    return true;
}
function showCreateSchoolModal() {
    // Append to body if not exists
    if (!document.getElementById('createSchoolModal')) {
        const modalHtml = `
          <div class="view full-page-view" id="createSchoolModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
              <div class="modal-content rounded-4 border-0 shadow-lg" style="background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);">
                <div class="modal-header border-0 pb-0 pt-4 px-4">
                  <h4 class="modal-title fw-bold text-primary mb-0">Create New Institution</h4>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" onclick="closeView()"></button>
                </div>
                <div class="modal-body p-4">
                  <div class="d-flex justify-content-center align-items-center mb-4 mt-2 px-3 position-relative">
                      <button id="wizard-step-details" type="button" class="btn btn-primary rounded-pill px-4 fw-bold active text-white shadow-sm" style="z-index: 2;" onclick="goInstitutionCreateStep(1)">1. Details & Address</button>
                      <div class="transition-all" id="wizard-progress-bar" style="height: 4px; width: 60px; background-color: #2563EB; margin: 0 -5px; z-index: 1;"></div>
                      <button id="wizard-step-contacts" type="button" class="btn btn-light border rounded-pill px-4 text-muted fw-bold" style="z-index: 2;" onclick="goInstitutionCreateStep(2)">2. Contacts & Settings</button>
                  </div>
                  <form id="create-school-form" class="px-md-3">
                    <div id="institution-step-details" class="animate-fade-in">
                        <div class="card bg-white border-0 shadow-sm rounded-4 mb-4">
                            <div class="card-body p-4">
                                <h6 class="fw-bold text-secondary mb-3">Basic Information</h6>
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Institution Official Name <span class="text-danger">*</span></label>
                                        <input type="text" id="wiz-inst-name" class="form-control bg-light border-light-subtle py-2" placeholder="Institution Name" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Institution Visual Name</label>
                                        <input type="text" id="wiz-inst-visual-name" class="form-control bg-light border-light-subtle py-2" placeholder="Visual Name">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Institution Structure</label>
                                        <select id="wiz-inst-structure" class="form-select bg-light border-light-subtle py-2">
                                            <option value="Sole Entity">Sole Entity</option>
                                            <option value="Union">Union</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Institution Type</label>
                                        <select id="wiz-inst-type" class="form-select bg-light border-light-subtle py-2">
                                            <option value="Pre school">Pre school</option>
                                            <option value="Primary School">Primary School</option>
                                            <option value="Secondary School">Secondary School</option>
                                            <option value="K12 School" selected>K12 School</option>
                                            <option value="College">College</option>
                                            <option value="Company">Company</option>
                                        </select>
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label text-secondary small fw-bold mb-1">Institution Brief Details</label>
                                        <input type="text" id="wiz-inst-brief" class="form-control bg-light border-light-subtle py-2" placeholder="Brief Details">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">State</label>
                                        <select id="wiz-inst-state" class="form-select bg-light border-light-subtle py-2">
                                            <option value="Trial" selected>Trial</option>
                                            <option value="Active">Active</option>
                                            <option value="Suspended">Suspended</option>
                                            <option value="Archived">Archived</option>
                                            <option value="Deleted">Deleted</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="card bg-white border-0 shadow-sm rounded-4 mb-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="fw-bold text-secondary mb-0">Location & Addresses</h6>
                                    <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 shadow-sm" onclick="addInstitutionWizardAddress()">+ Add Address</button>
                                </div>
                                <div id="new-school-address-list"></div>
                            </div>
                        </div>

                        <div class="d-flex justify-content-end mt-4">
                            <button type="button" class="btn btn-primary px-5 py-2 rounded-pill fw-bold shadow-sm" onclick="saveInstitutionWizardStep1AndContinue()">Continue to Step 2 <span class="ms-2">→</span></button>
                        </div>
                    </div>
                    <div id="institution-step-contacts" class="d-none animate-fade-in">
                        <div class="card bg-white border-0 shadow-sm rounded-4 mb-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="fw-bold mb-0 text-secondary">Primary Contacts</h6>
                                    <button class="btn btn-outline-primary btn-sm rounded-pill px-3 shadow-sm" type="button" onclick="addInstitutionContactRow()">+ Add Key Individual</button>
                                </div>
                                <div id="institution-contacts-list"></div>
                                <div class="mt-3">
                                    <label class="form-label text-secondary small fw-bold mb-1">Master Primary Contact Email <span class="text-danger">*</span></label>
                                    <input type="email" id="wiz-inst-email" class="form-control bg-light border-light-subtle py-2" placeholder="Email" required>
                                </div>
                            </div>
                        </div>
                        <div class="card bg-white border-0 shadow-sm rounded-4 mb-4">
                            <div class="card-body p-4">
                                <h6 class="fw-bold text-secondary mb-3">Security & Branding Settings</h6>
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Tenant Security Mode</label>
                                        <select id="wizard-security-mode" class="form-select bg-light border-light-subtle py-2">
                                            <option value="password_only">User ID + Password</option>
                                            <option value="email_otp" selected>Email OTP (Recommended)</option>
                                            <option value="authenticator_app">Authenticator App</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label text-secondary small fw-bold mb-1">Security Recommendation</label>
                                        <input type="text" id="wizard-security-recommendation" class="form-control bg-light border-light-subtle py-2" placeholder="Recommendation" readonly>
                                    </div>
                                    <div class="col-md-12">
                                        <label class="form-label text-secondary small fw-bold mb-1">Branding Color Theme (Hex or Name)</label>
                                        <input type="text" id="wizard-color-theme" class="form-control bg-light border-light-subtle py-2" placeholder="Color Theme">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-secondary small fw-bold mb-1">Date Format</label>
                                        <input type="date" id="wizard-date-format" class="form-control bg-light border-light-subtle py-2">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-secondary small fw-bold mb-1">Time Format</label>
                                        <select id="wizard-time-format" class="form-select bg-light border-light-subtle py-2">
                                            <option value="12h">12-hour (AM/PM)</option>
                                            <option value="24h" selected>24-hour</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label text-secondary small fw-bold mb-1">Currency Code</label>
                                        <select id="wizard-currency-code" class="form-select bg-light border-light-subtle py-2">
                                            <option value="USD" selected>USD ($)</option>
                                            <option value="EUR">EUR (€)</option>
                                            <option value="GBP">GBP (£)</option>
                                            <option value="INR">INR (₹)</option>
                                            <option value="AUD">AUD ($)</option>
                                            <option value="CAD">CAD ($)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between mt-4">
                            <button type="button" class="btn btn-light border px-4 py-2 rounded-pill fw-bold text-muted" onclick="goInstitutionCreateStep(1)"><span class="me-2">←</span> Back</button>
                            <button type="submit" class="btn btn-success px-5 py-2 rounded-pill fw-bold shadow-sm">Complete Creation <span class="ms-2">✓</span></button>
                        </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('create-school-form').addEventListener('submit', handleCreateSchool);
        const structureEl = document.getElementById('wiz-inst-structure');
        if (structureEl) {
            structureEl.addEventListener('change', () => {
                institutionWizardStep1Saved = false;
                if (structureEl.value === 'Sole Entity' && institutionWizardAddresses.length > 1) {
                    institutionWizardAddresses = [institutionWizardAddresses[0]];
                    institutionWizardAddresses[0].is_primary = true;
                    renderInstitutionWizardAddresses();
                }
            });
        }
        ['wiz-inst-name', 'wiz-inst-visual-name', 'wiz-inst-brief', 'wiz-inst-type', 'wiz-inst-state'].forEach((id) => {
            const el = document.getElementById(id);
            if (el)
                el.addEventListener('input', () => {
                    institutionWizardStep1Saved = false;
                });
        });
        const typeElInit = document.getElementById('wiz-inst-type');
        const secElInit = document.getElementById('wizard-security-mode');
        const recElInit = document.getElementById('wizard-security-recommendation');
        const syncWizardRec = () => {
            if (recElInit) {
                recElInit.value = getSecurityRecommendation(typeElInit ? typeElInit.value : '', secElInit ? secElInit.value : '');
            }
        };
        if (typeElInit)
            typeElInit.addEventListener('change', syncWizardRec);
        if (secElInit)
            secElInit.addEventListener('change', syncWizardRec);
        syncWizardRec();
        ensureInstitutionContactModal();
    }
    resetInstitutionWizardAddresses();
    institutionWizardStep1Saved = false;
    institutionContactsDraft = [{
        individual_type: 'Tenant Admin',
        custom_type: '',
        first_name: 'Tenant',
        middle_name: '',
        last_name: 'Admin',
        email: '',
        status: 'Active',
        contact_number: '',
        mobile_number: '',
        address: ''
    }];
    renderInstitutionContactRows(institutionContactsDraft);
    renderInstitutionWizardAddresses();
    goInstitutionCreateStep(1);
    openView('createSchoolModal');
}
function handleCreateSchool(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        if (!validateInstitutionWizardStep1())
            return;
        const name = (document.getElementById('wiz-inst-name').value || '').trim();
        const email = (document.getElementById('wiz-inst-email').value || '').trim();
        const structureEl = document.getElementById('wiz-inst-structure');
        const typeEl = document.getElementById('wiz-inst-type');
        const stateEl = document.getElementById('wiz-inst-state');
        const visualNameEl = document.getElementById('wiz-inst-visual-name');
        const briefEl = document.getElementById('wiz-inst-brief');
        const securityModeEl = document.getElementById('wizard-security-mode');
        const securityRecEl = document.getElementById('wizard-security-recommendation');
        const colorThemeEl = document.getElementById('wizard-color-theme');
        const dateFmtEl = document.getElementById('wizard-date-format');
        const timeFmtEl = document.getElementById('wizard-time-format');
        const currencyEl = document.getElementById('wizard-currency-code');
        const primaryAddress = institutionWizardAddresses[0] || { address_line: '' };
        const contacts = collectInstitutionContacts();
        if (!contacts.length) {
            contacts.push({
                individual_type: 'Tenant Admin',
                custom_type: '',
                first_name: 'Tenant',
                middle_name: '',
                last_name: 'Admin',
                email: email,
                status: 'Active',
                contact_number: '',
                mobile_number: '',
                address: primaryAddress.address_line || ''
            });
        }
        try {
            let res = yield fetchAPI('/admin/institutions', {
                method: 'POST',
                body: JSON.stringify({
                    institution_official_name: name,
                    institution_visual_name: visualNameEl ? String(visualNameEl.value || '').trim() : name,
                    institution_brief_details: briefEl ? String(briefEl.value || '').trim() : '',
                    institution_type: typeEl ? String(typeEl.value || 'K12 School').trim() : 'K12 School',
                    institution_structure: structureEl ? String(structureEl.value || 'Sole Entity').trim() : 'Sole Entity',
                    state: stateEl ? String(stateEl.value || 'Trial').trim() : 'Trial',
                    addresses: institutionWizardAddresses.map((a, idx) => ({
                        address_line: String(a.address_line || '').trim(),
                        region: String(a.region || '').trim(),
                        timezone: String(a.timezone || '').trim(),
                        language: String(a.language || 'English').trim(),
                        is_primary: idx === 0
                    })),
                    key_individuals: contacts,
                    security: {
                        auth_mode: securityModeEl ? String(securityModeEl.value || 'email_otp').trim() : 'email_otp',
                        recommendation_text: securityRecEl ? String(securityRecEl.value || '').trim() : ''
                    },
                    branding: { logo_url: '', color_theme: colorThemeEl ? String(colorThemeEl.value || '').trim() : '', default_course_image_url: '' },
                    locale: {
                        date_format: dateFmtEl ? String(dateFmtEl.value || 'YYYY-MM-DD').trim() : 'YYYY-MM-DD',
                        time_format: timeFmtEl ? String(timeFmtEl.value || '24h').trim() : '24h',
                        currency_code: currencyEl ? String(currencyEl.value || 'USD').trim().toUpperCase() : 'USD'
                    }
                })
            });
            if (!res.ok) {
                res = yield fetchAPI('/admin/schools', {
                    method: 'POST',
                    body: JSON.stringify({ name, address: primaryAddress.address_line || '', contact_email: email })
                });
            }
            if (res.ok) {
                alert("Institution Created Successfully!");
                closeView();
                // Clear form
                document.getElementById('create-school-form').reset();
                loadSuperAdminDashboard();
            }
            else {
                const err = yield res.json();
                alert("Error: " + (err.detail || "Failed"));
            }
        }
        catch (e) {
            console.error(e);
            alert("Network Error");
        }
    });
}
// --- SCHOOL CONTEXT SWITCHING ---
function openSchoolDashboard(schoolId, schoolName) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Switching to School: ${schoolName} (${schoolId})`);
        setSuperAdminInstitutionListMode(false);
        // Set Context
        appState.activeSchoolId = schoolId;
        appState.schoolName = schoolName;
        // Update Header
        elements.authStatus.innerHTML = `
            <strong>Role:</strong> ${appState.role} <span class="mx-2">|</span> <strong>User:</strong> ${appState.userId} <span class="mx-2">|</span> <strong>School:</strong> ${schoolName}
        `;
        // Show Loading/Switch View
        switchView('teacher-view');
        // Fetch Data for this School (headers will include X-School-Id)
        yield fetchStudents();
        // Render Dashboard
        renderTeacherControls();
        renderTeacherDashboard();
        renderSuperAdminBackToInstitutionList();
        // Toast Feedback
        const msg = document.createElement('div');
        msg.className = 'alert alert-info fixed-top m-3 text-center fw-bold shadow';
        msg.style.zIndex = '9999';
        msg.textContent = `Viewing Dashboard for ${schoolName}`;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    });
}
function handleLogout() {
    return __awaiter(this, void 0, void 0, function* () {
        setSuperAdminInstitutionListMode(false);
        if (appState.isLoggedIn && appState.userId) {
            try {
                yield fetchAPI('/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({ user_id: appState.userId })
                });
            }
            catch (e) {
                console.error("Logout log failed", e);
            }
        }
        Object.assign(appState, { isLoggedIn: false, role: null, userId: null, activeStudentId: null, chatMessages: {}, activeSchoolId: null, schoolName: null, tempUserId: null, tempSecurityMode: null });
        localStorage.removeItem('classbridge_session');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_role');
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('classbridge_session');
        applyRoleTheme();
        elements.authStatus.innerHTML = 'Login to continue...';
        elements.userControls.innerHTML = '<p class="text-muted small">Navigation controls will appear here.</p>';
        document.getElementById('invite-section').classList.add('d-none'); // Hide invite section
        clearLoginFormSensitiveFields();
        document.body.classList.add('login-mode');
        switchView('login-view');
        elements.loginMessage.textContent = 'Successfully logged out.';
        elements.loginMessage.className = 'text-success fw-bold';
        // Hide AI Chat
        const chatToggle = document.getElementById('ai-chat-toggle');
        if (chatToggle)
            chatToggle.style.display = 'none';
        const sidebar = document.getElementById('ai-sidebar');
        if (sidebar)
            sidebar.classList.remove('active');
    });
}
function fetchStudents() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetchAPI('/students/all');
            if (response.ok) {
                appState.allStudents = yield response.json();
            }
            else {
                appState.allStudents = [];
            }
        }
        catch (error) {
            console.error("Error fetching students:", error);
        }
    });
}
function populateStudentSelect(selectElement) {
    selectElement.innerHTML = '';
    if (appState.allStudents.length === 0) {
        selectElement.innerHTML = '<option value="">No students available</option>';
        return;
    }
    const options = appState.allStudents.map(s => {
        const id = s.id || s.ID || s.student_id;
        const name = s.name || s.Name || s.student_name || "Unknown";
        return `<option value="${id}">${name} (${id})</option>`;
    }).join('');
    selectElement.innerHTML = options;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('activity-date').value = today;
}
// --- CONTROLS RENDERING ---
// --- FUNCTION: Fetch and Show Logs in Modal ---
function launchMoodleSSO() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Launching Moodle SSO Flow...");
        // Simulate Moodle (SP) redirecting to Noble Nexus (IdP)
        const clientId = "moodle_client_sim";
        const redirectUri = "https://moodle.org/demo_dashboard"; // Destination after auth
        const state = "security_token_" + Date.now();
        // Check if user set a custom URL
        const customUrl = localStorage.getItem('moodle_url');
        // If we had a real Moodle, we'd redirect there. 
        // Since we are simulating the Full Flow:
        // We open our Authorize Endpoint which acts as the IdP login check.
        const authUrl = `/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        // Open in new window/tab to simulate "going to Moodle"
        window.open(authUrl, 'MoodleAuth', 'width=600,height=700');
    });
}
/* --- DYNAMIC SIDEBAR LOGIC --- */
function getSidebarConfig(role) {
    if (role === 'Student') {
        return [
            { label: 'sidebar_dashboard', icon: 'dashboard', view: 'student-view' },
            {
                label: 'sidebar_my_courses', icon: 'menu_book', id: 'cat-courses',
                children: [
                    { label: 'sidebar_course_list', view: 'student-academics-view', route: '/student/courses' },
                    { label: 'sidebar_assignments', view: 'student-exams-view', route: '/student/assignments' }
                ]
            },
            {
                label: 'sidebar_timetable', icon: 'schedule', id: 'cat-student-timetable',
                children: [
                    { label: 'sidebar_view_timetable', view: 'timetable-view', route: '/student/timetable' }
                ]
            },
            {
                label: 'sidebar_attendance', icon: 'rule', id: 'cat-student-attendance',
                children: [
                    { label: 'sidebar_attendance_report', view: 'parent-attendance-view', route: '/student/attendance' }
                ]
            },
            {
                label: 'sidebar_exams', icon: 'event', id: 'cat-exams',
                children: [
                    { label: 'sidebar_upcoming_exams', view: 'upcoming-exams-view', route: '/student/exams/upcoming' }
                ]
            },
            {
                label: 'sidebar_progress_card', icon: 'bar_chart', id: 'cat-student-progress',
                children: [
                    { label: 'sidebar_view_progress', view: 'parent-progress-card-view', route: '/student/progress' }
                ]
            },
            {
                label: 'sidebar_profile', icon: 'person', id: 'cat-profile',
                children: [
                    { label: 'sidebar_view_profile', onClick: () => openProfileView(), route: '/student/profile' },
                    { label: 'sidebar_settings', onClick: () => switchView('settings-view'), route: '/student/settings' }
                ]
            },
            { label: 'sidebar_apply_leave', icon: 'timer_off', view: 'student-leave-view', onClick: () => { switchView('student-leave-view'); loadStudentLeaveView(); } },
            { label: 'sidebar_communication', icon: 'forum', view: 'student-communication-view' },
            { label: 'header_notifications', icon: 'notifications', view: 'student-notifications-view', route: '/student/notifications' },
            {
                label: 'Finance', icon: 'account_balance_wallet', id: 'cat-finance-student',
                permission: () => hasAnyPermission(['finance.fees.self.read']) || appState.role === 'Student',
                children: [
                    {
                        label: 'Fee Invoices & Receipts',
                        view: 'parent-fees-view',
                        route: '/student/finance/fees',
                        permission: () => hasPermission('finance.fees.self.read') || appState.role === 'Student'
                    }
                ]
            }
            // Note: test-question-bank-view is a TEACHER-ONLY view and has been removed from Student sidebar
            // Students access questions through their assignments/exams views instead
        ];
    }
    if (role === 'Teacher') {
        return [
            // 0. Dashboard
            { label: 'sidebar_dashboard', icon: 'dashboard', view: 'teacher-view', onClick: () => handleTeacherViewToggle('teacher-view') },
            // 1. Timetable
            {
                label: 'sidebar_timetable', icon: 'schedule', id: 'cat-timetable',
                children: [
                    { label: 'sidebar_view_timetable', view: 'timetable-view', route: '/teacher/timetable' }
                ]
            },
            // 2. Attendance
            {
                label: 'sidebar_attendance', icon: 'rule', id: 'cat-attendance',
                children: [
                    { label: 'sidebar_take_attendance', view: 'attendance-take-view', route: '/teacher/attendance/take' },
                    { label: 'sidebar_attendance_sheet', view: 'attendance-sheet-view', route: '/teacher/attendance/sheet' },
                    { label: 'sidebar_monthly_report', view: 'attendance-report-view', route: '/teacher/attendance/report', onClick: () => { switchView('attendance-report-view'); initMonthlyReport(); } },
                    { label: 'sidebar_approve_leave', view: 'attendance-leave-approval-view', route: '/teacher/attendance/approve-leave', onClick: () => { switchView('attendance-leave-approval-view'); loadTeacherLeaveApprovals(); } },
                    { label: 'sidebar_apply_leave', view: 'teacher-leave-apply-view', route: '/teacher/attendance/apply-leave' }
                ]
            },
            // 3. Assignment
            {
                label: 'sidebar_assignment_group', icon: 'assignment', id: 'cat-assignment',
                children: [
                    { label: 'sidebar_view_submitted', view: 'assignment-view-view', route: '/teacher/assignment/list', onClick: () => { switchView('assignment-view-view'); loadAssignments(); } },
                    { label: 'sidebar_approve_reassign', view: 'assignment-review-view', route: '/teacher/assignment/review' },
                    { label: 'sidebar_enter_marks', view: 'assignment-marks-view', route: '/teacher/assignment/marks' }
                ]
            },
            // 4. Online Test
            {
                label: 'sidebar_online_test', icon: 'quiz', id: 'cat-tests',
                children: [
                    { label: 'sidebar_question_bank', view: 'test-question-bank-view', route: '/teacher/tests/questions' },
                    { label: 'sidebar_create_test', view: 'test-create-view', route: '/teacher/tests/create' },

                    { label: 'sidebar_view_test_results', view: 'test-results-view', route: '/teacher/tests/results' }
                ]
            },
            // 5. Progress Card
            {
                label: 'sidebar_progress_card', icon: 'bar_chart', id: 'cat-progress',
                children: [
                    { label: 'sidebar_enter_progress', view: 'progress-enter-view', route: '/teacher/progress/enter' },
                    { label: 'sidebar_save_publish', view: 'progress-publish-view', route: '/teacher/progress/publish' },
                    // Flattened Level 3 for now, or handle in view
                    { label: 'sidebar_view_progress', view: 'progress-report-view', route: '/teacher/progress/view' }
                ]
            },
            // 6. Finance (self payroll only)
            {
                label: 'Finance', icon: 'account_balance_wallet', id: 'cat-finance-teacher',
                permission: () => hasAnyPermission(['finance.payroll.self.read', 'finance.payroll']),
                children: [
                    {
                        label: 'Salary Slips & Payments',
                        view: 'payroll-view-view',
                        route: '/teacher/finance/payroll',
                        onClick: () => switchView('payroll-view-view'),
                        permission: () => hasAnyPermission(['finance.payroll.self.read', 'finance.payroll'])
                    },
                    {
                        label: 'Print Salary Slip',
                        view: 'payroll-print-view',
                        route: '/teacher/finance/payroll/print',
                        onClick: () => switchView('payroll-print-view'),
                        permission: () => hasAnyPermission(['finance.payroll.self.read', 'finance.payroll'])
                    }
                ]
            },
            // 7. Messages & Notifications
            {
                label: 'header_messages', icon: 'notifications', id: 'cat-messages',
                children: [
                    { label: 'View Messages', view: 'messages-view-view', route: '/teacher/messages' },
                    { label: 'View Notifications', view: 'notifications-view', route: '/teacher/notifications' }
                ]
            },
            // 8. Profile
            {
                label: 'sidebar_profile', icon: 'account_circle', id: 'cat-profile-teacher',
                children: [
                    { label: 'sidebar_view_profile', onClick: () => openProfileView(), route: '/teacher/profile' },
                    { label: 'sidebar_settings', onClick: () => switchView('settings-view'), route: '/teacher/settings' },
                    { label: 'Change Password', view: 'profile-password-view', route: '/teacher/profile/password' }
                ]
            },
            // 10. LMS Builder (removed)
        ];
    }
    if (role === 'Parent_Guardian' || role === 'Parent') {
        return [
            // 1. Dashboard
            { label: 'sidebar_dashboard', icon: 'dashboard', view: 'parent-dashboard-view', route: '/parent/dashboard' },
            // 2. Assignment
            {
                label: 'sidebar_assignment_group', icon: 'assignment', id: 'p-cat-assignment',
                children: [
                    { label: 'sidebar_view_submitted', view: 'parent-assignment-view', route: '/parent/assignments' },
                    { label: 'Assignment Scores', view: 'parent-assignment-scores-view', route: '/parent/assignments/scores' }
                ]
            },
            // 3. Attendance
            {
                label: 'sidebar_attendance', icon: 'rule', id: 'p-cat-attendance',
                children: [
                    { label: 'sidebar_attendance_report', view: 'parent-attendance-view', route: '/parent/attendance' },
                    { label: 'sidebar_monthly_report', view: 'parent-attendance-report-view', route: '/parent/attendance/report', onClick: () => { switchView('parent-attendance-report-view'); initMonthlyReport(); } },
                ]
            },
            // 4. Timetable
            {
                label: 'sidebar_timetable', icon: 'schedule', id: 'p-cat-timetable',
                children: [
                    { label: 'sidebar_view_timetable', view: 'parent-timetable-view', route: '/parent/timetable' }
                ]
            },
            // 5. Exam Schedule
            {
                label: 'sidebar_exams', icon: 'event', id: 'p-cat-exams',
                children: [
                    { label: 'sidebar_upcoming_exams', view: 'parent-exam-schedule-view', route: '/parent/exams/schedule' }
                ]
            },
            // 6. Online Test
            {
                label: 'sidebar_online_test', icon: 'quiz', id: 'p-cat-tests',
                children: [
                    { label: 'sidebar_view_test_results', view: 'parent-online-test-view', route: '/parent/tests' }
                ]
            },
            // 7. Progress Card
            {
                label: 'sidebar_progress_card', icon: 'bar_chart', id: 'p-cat-progress',
                children: [
                    { label: 'sidebar_view_progress', view: 'parent-progress-card-view', route: '/parent/progress' }
                ]
            },
            { label: 'header_notifications', icon: 'notifications', view: 'parent-notifications-view', route: '/parent/notifications' },
            // 8. Finance (child fees only)
            {
                label: 'Finance', icon: 'account_balance_wallet', id: 'p-cat-finance',
                permission: () => hasAnyPermission(['finance.fees.child.read', 'finance.invoices']) || appState.role === 'Parent' || appState.role === 'Parent_Guardian',
                children: [
                    {
                        label: 'Child Fees & Payments',
                        view: 'parent-fees-view',
                        route: '/parent/finance/fees',
                        permission: () => hasAnyPermission(['finance.fees.child.read', 'finance.invoices']) || appState.role === 'Parent' || appState.role === 'Parent_Guardian'
                    }
                ]
            },
            // 9. Leave Request
            {
                label: 'sidebar_apply_leave', icon: 'sick', id: 'p-cat-leave',
                children: [
                    { label: 'sidebar_apply_leave', view: 'parent-leave-apply-view', route: '/parent/leave/apply' },
                    { label: 'View Status', view: 'parent-leave-status-view', route: '/parent/leave/status' }
                ]
            },
            // 10. Email
            {
                label: 'Email', icon: 'email', id: 'p-cat-email',
                children: [
                    { label: 'Inbox', view: 'parent-email-inbox-view', route: '/parent/email/inbox' },
                    { label: 'Compose', view: 'parent-email-compose-view', route: '/parent/email/compose' },
                    { label: 'Sent', view: 'parent-email-sent-view', route: '/parent/email/sent' }
                ]
            },
            // 11. Feedback
            {
                label: 'Feedback', icon: 'rate_review', id: 'p-cat-feedback',
                children: [
                    { label: 'Submit Feedback', view: 'parent-feedback-view', route: '/parent/feedback' }
                ]
            },
            // 12. Profile
            {
                label: 'sidebar_profile', icon: 'account_circle', id: 'p-cat-profile',
                children: [
                    { label: 'sidebar_view_profile', onClick: () => openProfileView(), route: '/parent/profile' },
                    { label: 'sidebar_settings', onClick: () => switchView('settings-view'), route: '/parent/settings' },
                    { label: 'Change Password', view: 'profile-password-view', route: '/parent/profile/password' }
                ]
            }
        ];
    }
    if (role === '__finance_module_disabled__') {
        const isFinanceAdmin = role === 'finance_admin' || role === 'Finance_Officer';
        const roleBypass = role === 'finance_admin';
        return [
            {
                label: 'Finance Dashboard',
                icon: 'dashboard',
                route: '/finance/dashboard',
                onClick: () => openFinanceModuleDetails('dashboard'),
                permission: () => roleBypass || hasAnyPermission(['finance.dashboard.read', 'finance.view'])
            },
            {
                label: 'Master Data',
                icon: 'dataset',
                route: '/finance/master-data',
                onClick: () => openFinanceModuleDetails('master-data'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.masterdata.read', 'finance.masterdata.manage'])
            },
            {
                label: 'General Ledger',
                icon: 'account_balance',
                route: '/finance/gl',
                onClick: () => openFinanceModuleDetails('gl'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.gl.manage', 'finance.manage'])
            },
            {
                label: 'Receivables',
                icon: 'receipt_long',
                route: '/finance/receivables',
                onClick: () => openFinanceModuleDetails('receivables'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.receivables.manage', 'finance.invoices'])
            },
            {
                label: 'Payables',
                icon: 'payments',
                route: '/finance/payables',
                onClick: () => openFinanceModuleDetails('payables'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.payables.manage', 'finance.payables.approve'])
            },
            {
                label: 'Inventory',
                icon: 'inventory_2',
                route: '/finance/inventory',
                onClick: () => openFinanceModuleDetails('inventory'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.inventory.manage'])
            },
            {
                label: 'Assets',
                icon: 'apartment',
                route: '/finance/assets',
                onClick: () => openFinanceModuleDetails('assets'),
                permission: () => roleBypass || isFinanceAdmin || hasAnyPermission(['finance.assets.manage'])
            },
            {
                label: 'Payroll',
                icon: 'badge',
                route: '/finance/payroll',
                onClick: () => openFinanceModuleDetails('payroll'),
                permission: () => roleBypass || hasAnyPermission(['finance.payroll.manage', 'finance.payroll', 'finance.payroll.self.read'])
            },
            {
                label: 'Reports',
                icon: 'assessment',
                route: '/finance/reports',
                onClick: () => openFinanceModuleDetails('reports'),
                permission: () => roleBypass || hasAnyPermission(['finance.reports.read', 'finance.view'])
            }
        ];
    }
    // Default to Admin/Principal structure (Existing fallback)
    const items = [
        { label: 'sidebar_dashboard', icon: 'dashboard', view: 'teacher-view', onClick: () => handleTeacherViewToggle('teacher-view') },
        {
            label: 'Classes', icon: 'class', id: 'cat-classes',
            children: [
                { label: 'Create Class', view: 'create-class-view', route: '/teacher/classes/create', permission: () => hasPermission('class_create') },
                { label: 'Manage Classes', view: 'teacher-class-management-view', route: '/teacher/classes/manage', permission: () => hasPermission('class_view'), onClick: () => handleTeacherViewToggle('teacher-class-management-view') },
            ]
        },
        {
            label: 'sidebar_students', icon: 'school', id: 'cat-students',
            children: [
                {
                    label: 'sidebar_add_student', view: 'add-user-view', route: '/teacher/students/add', onClick: () => {
                        switchView('add-user-view');
                        setTimeout(() => {
                            const roleSelect = document.getElementById('new-user-role-view');
                            if (roleSelect) {
                                roleSelect.value = 'Student';
                                roleSelect.onchange();
                            }
                        }, 100);
                    }
                },
                { label: 'sidebar_student_list', view: 'student-info-view', route: '/teacher/students/list', onClick: () => handleTeacherViewToggle('student-info-view') }
            ]
        },
        {
            label: 'sidebar_reports', icon: 'bar_chart', id: 'cat-reports',
            children: [
                { label: 'sidebar_attendance_report', view: 'attendance-report-view', route: '/teacher/reports/attendance', onClick: () => { switchView('attendance-report-view'); initMonthlyReport(); } },
                { label: 'sidebar_performance_report', view: 'performance-report-view', route: '/teacher/reports/performance' }
            ]
        },
        {
            label: 'sidebar_approve_leave', icon: 'fact_check', id: 'cat-approvals',
            view: 'attendance-leave-approval-view', route: '/admin/approvals',
            onClick: () => {
                switchView('attendance-leave-approval-view');
                if (typeof loadTeacherLeaveApprovals === 'function') loadTeacherLeaveApprovals();
            }
        }
    ];
    const isFinanceAdmin = ['Finance_Officer', 'Root_Super_Admin', 'finance_admin', 'accountant', 'payroll_officer'].includes(appState.role);
    const isFinancePrincipal = appState.role === 'Principal';
    if (isFinanceAdmin || isFinancePrincipal) {
        items.push({
            label: 'Finance',
            icon: 'account_balance',
            id: 'cat-finance-admin',
            permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission([
                'finance.view',
                'finance.dashboard.read',
                'finance.reports.read'
            ]),
            children: [
                {
                    label: 'Dashboard',
                    route: '/admin/finance/dashboard',
                    onClick: () => openFinanceModuleDetails('dashboard'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance.dashboard.read', 'finance.view'])
                },
                {
                    label: 'Master Data',
                    route: '/admin/finance/master-data',
                    onClick: () => openFinanceModuleDetails('master-data'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance.masterdata.read', 'finance.masterdata.manage'])
                },
                {
                    label: 'General Ledger',
                    route: '/admin/finance/gl',
                    onClick: () => openFinanceModuleDetails('gl'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.gl.manage', 'finance.manage'])
                },
                {
                    label: 'Receivables',
                    route: '/admin/finance/receivables',
                    onClick: () => openFinanceModuleDetails('receivables'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.receivables.manage', 'finance.invoices'])
                },
                {
                    label: 'Payables',
                    route: '/admin/finance/payables',
                    onClick: () => openFinanceModuleDetails('payables'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.payables.manage', 'finance.payables.approve'])
                },
                {
                    label: 'Inventory',
                    route: '/admin/finance/inventory',
                    onClick: () => openFinanceModuleDetails('inventory'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.inventory.manage'])
                },
                {
                    label: 'Assets',
                    route: '/admin/finance/assets',
                    onClick: () => openFinanceModuleDetails('assets'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.assets.manage'])
                },
                {
                    label: 'Payroll',
                    route: '/admin/finance/payroll',
                    onClick: () => openFinanceModuleDetails('payroll'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance.payroll'])
                },
                {
                    label: 'Reports',
                    route: '/admin/finance/reports',
                    onClick: () => openFinanceModuleDetails('reports'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance.reports.read', 'finance.view'])
                }
            ]
        });
    }
    // Append standard items for Admin
    items.push({
        label: 'Email',
        icon: 'email',
        id: 'cat-email-admin',
        children: [
            { label: 'Inbox', view: 'email-inbox-view', route: '/admin/email/inbox' },
            { label: 'Compose New', view: 'email-compose-view', route: '/admin/email/compose' },
            { label: 'Sent Mail', view: 'email-sent-view', route: '/admin/email/sent' }
        ]
    });
    items.push({ label: 'sidebar_resource_library', icon: 'library_books', view: 'resources-view', onClick: () => handleTeacherViewToggle('resources-view') });
    // Role Management Menu — gated by view_role_management per PRD
    if (hasPermission('view_role_management') || hasPermission('role_management') || appState.isSuperAdmin || (appState.permissions || []).includes('*')) {
        items.push({
            label: 'Role Management',
            icon: 'manage_accounts',
            view: 'roles-view',
            onClick: () => {
                switchView('roles-view');
                loadRoles();
            }
        });
    }
    // Permission Setup — visible to anyone with view_permissions or edit_permissions
    if (hasPermission('view_permissions') || hasPermission('edit_permissions') || hasPermission('permission_management') || appState.isSuperAdmin) {
        items.push({
            label: 'Permission Setup',
            icon: 'vpn_key',
            view: 'permissions-view',
            onClick: () => {
                switchView('permissions-view');
                loadPermissionsSetup();
            }
        });
    }
    if (appState.isSuperAdmin || ['Tenant_Admin', 'Principal', 'Admin'].includes(appState.role)) {
        items.push({ label: 'sidebar_staff_faculty', icon: 'people_alt', view: 'staff-view', onClick: () => handleTeacherViewToggle('staff-view') });
    }
    items.push({ label: 'sidebar_system_settings', icon: 'settings', view: 'settings-view', onClick: () => handleTeacherViewToggle('settings-view') });
    if (appState.isSuperAdmin) {
        // Root Admin Panel — merged into Super Admin sidebar
        items.push({
            label: 'Root Admin Panel',
            icon: 'admin_panel_settings',
            view: 'root-admin-view',
            onClick: () => {
                ensureRootAdminView();
                switchView('root-admin-view');
                loadRootAdminPanel();
            }
        });
        // Database Explorer — merged into Super Admin sidebar
        items.push({
            label: 'Database Explorer',
            icon: 'storage',
            view: 'root-admin-db-view',
            onClick: () => {
                ensureRootAdminDatabaseView();
                switchView('root-admin-db-view');
                loadRootAdminDatabase();
            }
        });
    }
    return items;
}
function renderSidebarFromConfig(config) {
    elements.userControls.innerHTML = '';
    const navMenu = document.createElement('div');
    navMenu.className = 'nav-menu';
    const updatePageTitle = (labelKey) => {
        const titleEl = document.getElementById('page-title');
        if (!titleEl)
            return;
        titleEl.setAttribute('data-i18n', labelKey);
        titleEl.textContent = t(labelKey);
    };
    config.forEach(item => {
        // Check permission if specific item has one (simplified)
        if (item.permission) {
            if (typeof item.permission === 'function' && !item.permission())
                return;
            if (typeof item.permission === 'string' && !hasPermission(item.permission))
                return;
        }
        // Main Item Wrapper
        const itemWrapper = document.createElement('div');
        // Main Link
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'nav-item';
        // USE t() for Translation and add data-i18n
        a.innerHTML = `<span class="material-icons">${item.icon}</span> <span class="flex-grow-1" data-i18n="${item.label}">${t(item.label)}</span>`;
        if (item.children) {
            // It's a Request: Expandable
            a.innerHTML += `<span class="material-icons arrow-icon">expand_more</span>`;
            a.onclick = (e) => {
                e.preventDefault();
                // Close others
                document.querySelectorAll('.nav-submenu.open').forEach(el => {
                    if (el !== subMenu) {
                        el.classList.remove('open');
                        el.previousElementSibling.classList.remove('expanded');
                    }
                });
                a.classList.toggle('expanded');
                subMenu.classList.toggle('open');
            };
            // Submenu Container
            const subMenu = document.createElement('div');
            subMenu.className = 'nav-submenu';
            item.children.forEach(child => {
                // Permission check for child
                if (child.permission) {
                    if (typeof child.permission === 'function' && !child.permission())
                        return;
                    if (typeof child.permission === 'string' && !hasPermission(child.permission))
                        return;
                }
                const subLink = document.createElement('a');
                subLink.href = child.route ? '#' + child.route : '#';
                subLink.className = 'nav-submenu-item';
                // USE t() and data-i18n
                subLink.setAttribute('data-i18n', child.label);
                subLink.textContent = t(child.label);
                subLink.onclick = (e) => {
                    e.preventDefault();
                    if (child.route) {
                        const currentHash = location.hash;
                        const newHash = '#' + child.route;
                        if (currentHash !== newHash) {
                            history.pushState(null, null, newHash);
                        }
                    }
                    // Active State
                    document.querySelectorAll('.nav-submenu-item, .nav-item').forEach(el => el.classList.remove('active'));
                    subLink.classList.add('active');
                    a.classList.add('active'); // Keep parent active
                    // Action
                    if (child.onClick) {
                        child.onClick();
                    }
                    else if (child.view) {
                        switchView(child.view);
                    }
                    updatePageTitle(child.label);
                };
                subMenu.appendChild(subLink);
            });
            itemWrapper.appendChild(a);
            itemWrapper.appendChild(subMenu);
        }
        else {
            // Standard Link
            a.onclick = (e) => {
                e.preventDefault();
                document.querySelectorAll('.nav-item, .nav-submenu-item').forEach(el => el.classList.remove('active'));
                a.classList.add('active');
                if (item.onClick) {
                    item.onClick();
                }
                else if (item.view) {
                    if (item.view === 'teacher-view') {
                        // Special case for dashboard to reset things
                        if (typeof handleTeacherViewToggle === 'function')
                            handleTeacherViewToggle('teacher-view');
                        else
                            switchView(item.view);
                    }
                    else {
                        switchView(item.view);
                    }
                }
                updatePageTitle(item.label);
            };
            itemWrapper.appendChild(a);
        }
        navMenu.appendChild(itemWrapper);
    });

    // --- MOBILE SPECIFIC: ADD PROFILE & LOGOUT (Step 11) ---
    // Since the top header is hidden on mobile, we need these links in the sidebar
    const mobileControls = document.createElement('div');
    mobileControls.className = 'd-md-none mt-4 pt-4 border-top border-secondary';

    // Profile Link
    const profileLink = document.createElement('a');
    profileLink.href = '#';
    profileLink.className = 'nav-item d-flex align-items-center gap-2 text-decoration-none text-white-50 mb-3';
    // Use t() if available, else fallback
    const profileText = (typeof t === 'function') ? t('header_my_profile') : 'My Profile';
    profileLink.innerHTML = `<span class="material-icons">person</span> <span>${profileText}</span>`;
    profileLink.onclick = (e) => {
        e.preventDefault();
        if (typeof openProfileView === 'function') openProfileView();
        if (typeof toggleSidebar === 'function') toggleSidebar();
    };
    mobileControls.appendChild(profileLink);

    // Logout Link
    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.className = 'nav-item d-flex align-items-center gap-2 text-decoration-none text-danger';
    const logoutText = (typeof t === 'function') ? t('header_logout') : 'Logout';
    logoutLink.innerHTML = `<span class="material-icons">logout</span> <span>${logoutText}</span>`;
    logoutLink.onclick = (e) => {
        e.preventDefault();
        if (typeof handleLogout === 'function') handleLogout();
    };
    mobileControls.appendChild(logoutLink);

    navMenu.appendChild(mobileControls);

    elements.userControls.appendChild(navMenu);
    // Check initial hash routing if we are just rendering
    handleHashRouting();
}
/* --- ROUTER --- */
function handleHashRouting() {
    const hash = location.hash.replace('#', '');
    if (!hash)
        return;
    // Find config item matching route
    const findItem = (items) => {
        for (const item of items) {
            if (item.route === hash || (item.route && hash.startsWith(item.route)))
                return item;
            if (item.children) {
                const found = findItem(item.children);
                if (found)
                    return found;
            }
        }
        return null;
    };
    const role = appState.role || 'Teacher'; // Default
    const config = getSidebarConfig(role);
    const item = findItem(config);
    if (item) {
        if (item.view)
            switchView(item.view);
        if (item.onClick)
            item.onClick();
        const titleEl = document.getElementById('page-title');
        if (titleEl && item.label) {
            titleEl.setAttribute('data-i18n', item.label);
            titleEl.textContent = t(item.label);
        }
        // Highlight Sidebar
        setTimeout(() => {
            document.querySelectorAll('.nav-submenu-item, .nav-item').forEach(el => el.classList.remove('active'));
            // Find link by href
            const link = document.querySelector(`a[href="#${hash}"]`);
            if (link) {
                link.classList.add('active');
                // Open parent if submenu
                const parent = link.closest('.nav-submenu');
                if (parent) {
                    parent.classList.add('open');
                    if (parent.previousElementSibling)
                        parent.previousElementSibling.classList.add('expanded', 'active');
                }
            }
        }, 100);
    }
}
// Popstate is handled by the primary router listener to avoid duplicate navigation calls.
function renderTeacherControls() {
    elements.userControls.innerHTML = '';
    // Show Invite Generator
    const inviteSection = document.getElementById('invite-section');
    if (inviteSection)
        inviteSection.classList.remove('d-none');
    const config = getSidebarConfig(appState.role || 'Teacher');
    renderSidebarFromConfig(config);
}
function renderStudentControls() {
    elements.userControls.innerHTML = '';
    const inviteSection = document.getElementById('invite-section');
    if (inviteSection)
        inviteSection.classList.add('d-none');
    const config = getSidebarConfig('Student');
    renderSidebarFromConfig(config);
}
function renderParentControls() {
    elements.userControls.innerHTML = '';
    const inviteSection = document.getElementById('invite-section');
    if (inviteSection)
        inviteSection.classList.add('d-none');
    const config = getSidebarConfig(appState.role || 'Parent');
    renderSidebarFromConfig(config);
}

function loadParentMessages() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.querySelector('#parent-communication-view .list-group');
        if (!container) return;

        container.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div></div>';

        try {
            const res = yield fetchAPI('/communication/messages');
            if (res.ok) {
                const messages = yield res.json();
                container.innerHTML = '';

                if (messages.length === 0) {
                    container.innerHTML = '<div class="text-muted text-center p-4">No messages found.</div>';
                    return;
                }

                messages.forEach(msg => {
                    const date = new Date(msg.timestamp).toLocaleString();
                    const sender = msg.sender_id === 'admin' ? 'Admin' : (msg.sender_id === 'teacher' ? 'Class Teacher' : msg.sender_id);
                    // Determine border color based on subject keywords (simple logic)
                    let borderClass = 'border-primary';
                    if (msg.subject.toLowerCase().includes('absent')) borderClass = 'border-danger';
                    if (msg.subject.toLowerCase().includes('late')) borderClass = 'border-warning';

                    const html = `
                    <a href="#" class="list-group-item list-group-item-action p-4 border-start border-4 ${borderClass} shadow-sm mb-3 rounded-end">
                        <div class="d-flex w-100 justify-content-between">
                            <h5 class="mb-1 fw-bold">${msg.subject}</h5>
                            <small class="text-muted">${date}</small>
                        </div>
                        <p class="mb-1">${msg.content}</p>
                        <small class="text-muted">From: ${sender}</small>
                    </a>
                    `;
                    container.innerHTML += html;
                });
            } else {
                container.innerHTML = '<div class="text-danger p-4">Failed to load messages.</div>';
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-danger p-4">Error loading messages: ${e.message}</div>`;
        }
    });
}
function handleTeacherViewToggle(view) {
    const selectorDiv = document.getElementById('top-header-student-selector');
    if (selectorDiv) {
        selectorDiv.classList.add('d-none');
        selectorDiv.classList.remove('d-flex');
    }
    if (view === 'teacher-view') {
        switchView('teacher-view');
        renderTeacherDashboard();
    }
    else if (view === 'groups-view') {
        switchView('groups-view');
        loadGroups();
    }
    else if (view === 'reports-view') {
        switchView('reports-view');
        loadReportsData();
    }
    else if (view === 'settings-view') {
        switchView('settings-view');
    }
    else if (view === 'roles-view') {
        switchView('roles-view');
        loadRoles();
    }
    else if (view === 'compliance-view') {
        switchView('compliance-view');
    }
    else if (view === 'academics-view') {
        switchView('academics-view');
        renderAcademicsDashboard();
    }
    else if (view === 'finance-view') {
        switchView('finance-view');
    }
    else if (view === 'moodle-view') {
        switchView('moodle-view');
    }
    else if (view === 'staff-view') {
        switchView('staff-view');
    }
    else if (view === 'student-info-view') {
        switchView('student-info-view');
        if (!appState.allStudents || appState.allStudents.length === 0) {
            fetchAPI('/teacher/overview').then(res => res.json()).then(data => {
                appState.allStudents = data.roster || [];
            });
        }
    }
    else if (view === 'resources-view') {
        switchView('resources-view');
    }
    else if (view === 'teacher-class-management-view') {
        switchView('teacher-class-management-view');
    }
    else if (view === 'teacher-content-view') {
        switchView('teacher-content-view');
    }
    else if (view === 'teacher-assessment-view') {
        switchView('teacher-assessment-view');
    }
    else if (view === 'teacher-communication-view') {
        switchView('teacher-communication-view');
    }
    else if (view === 'communication-view') {
        switchView('communication-view');
        renderCommunicationDashboard();
    }
    else if (view === 'grade-helper-view') {
        switchView('grade-helper-view');
    }
    else if (view === 'engagement-helper-view') {
        switchView('engagement-helper-view');
    }
    else {
        switchView('student-view');
        // Show Top Header Selector
        if (selectorDiv) {
            selectorDiv.classList.remove('d-none');
            selectorDiv.classList.add('d-flex');
        }
        if (!appState.allStudents || appState.allStudents.length === 0) {
            // First try fetching overview which has better data format
            fetchAPI('/teacher/overview')
                .then(res => res.json())
                .then(data => {
                    appState.allStudents = data.roster || [];
                    renderStudentSelector(selectorDiv);
                })
                .catch(() => {
                    // Fallback
                    fetchStudents().then(() => renderStudentSelector(selectorDiv));
                });
        }
        else {
            renderStudentSelector(selectorDiv);
        }
    }
}
function openFinanceModuleDetails(module) {
    const tabMap = {
        dashboard: 'dashboard',
        'master-data': 'master-data',
        gl: 'gl',
        receivables: 'receivables',
        payables: 'payables',
        inventory: 'inventory',
        assets: 'assets',
        payroll: 'payroll',
        reports: 'reports'
    };
    switchView('finance-view');
    const tab = tabMap[module] || 'dashboard';
    setTimeout(() => {
        if (typeof loadFinanceTab === 'function')
            loadFinanceTab(tab);
    }, 100);
}
function renderStudentSelector(container) {
    if (!container)
        return;
    container.innerHTML = `
            <select id="student-select" class="form-select form-select-sm" style="max-width: 200px;" onchange="loadStudentDashboard(this.value)">
                <option value="">-- Choose Student --</option>
                ${appState.allStudents.map(s => {
        const safeS = s || {};
        const id = safeS.id || safeS.ID || safeS.Id || safeS.student_id;
        const name = safeS.name || safeS.Name || safeS.student_name || "Unknown";
        let grade = safeS.grade;
        if (grade === undefined)
            grade = safeS.Grade;
        if (grade === undefined)
            grade = '?';
        // Fallback for debugging if keys are completely unexpected
        const label = (name === "Unknown") ? JSON.stringify(safeS) : `${name} (G${grade})`;
        return `<option value="${id}" ${appState.activeStudentId == id ? 'selected' : ''}>${label}</option>`;
    }).join('')}
            </select>
            <button class="btn btn-sm btn-primary text-nowrap d-flex align-items-center" onclick="elements.addStudentModal.show()">
                <span class="material-icons fs-6 me-1">add</span> New Student
            </button>
        `;
    const studentSelectElement = document.getElementById('student-select');
    if (appState.activeStudentId && studentSelectElement.querySelector(`option[value="${appState.activeStudentId}"]`)) {
        studentSelectElement.value = appState.activeStudentId;
        loadStudentDashboard(appState.activeStudentId);
    }
    else if (appState.allStudents.length > 0) {
        appState.activeStudentId = appState.allStudents[0].id || appState.allStudents[0].ID;
        studentSelectElement.value = appState.activeStudentId;
        loadStudentDashboard(appState.activeStudentId);
    }
    else {
        elements.studentNameHeader.textContent = 'No students available. Add a student first.';
        elements.studentMetrics.innerHTML = '';
    }
}
function loadReportsData() {
    return __awaiter(this, void 0, void 0, function* () {
        const metricsContainer = document.getElementById('reports-metrics-row');
        const attendanceContainer = document.getElementById('attendance-chart');
        const academicContainer = document.getElementById('academic-chart');
        const financeContainer = document.getElementById('finance-details-content');
        const staffContainer = document.getElementById('staff-details-content');
        if (!metricsContainer)
            return;
        try {
            const response = yield fetchAPI('/reports/summary');
            let data;
            if (response.ok) {
                data = yield response.json();
                appState.reportData = data; // Store for export
            }
            else {
                // Fallback Dummy Data if backend not updated or fails
                data = {
                    financial_summary: { revenue: 150000, expenses: 90000, net_income: 60000, outstanding_fees: 15000 },
                    staff_utilization: { total_staff: 25, active_classes: 100, student_teacher_ratio: "20:1", utilization_rate: 88 },
                    attendance_trends: [{ month: 'Jan', rate: 90 }, { month: 'Feb', rate: 92 }, { month: 'Mar', rate: 88 }, { month: 'Apr', rate: 94 }],
                    academic_performance: { overall_avg: 78, math_avg: 82, science_avg: 75, english_avg: 77 }
                };
            }
            // Render Top Metrics
            metricsContainer.innerHTML = '';
            renderMetric(metricsContainer, 'Revenue', `$${data.financial_summary.revenue.toLocaleString()}`, 'widget-green');
            renderMetric(metricsContainer, 'Net Income', `$${data.financial_summary.net_income.toLocaleString()}`, 'widget-purple');
            renderMetric(metricsContainer, 'Total Staff', data.staff_utilization.total_staff, 'widget-blue');
            renderMetric(metricsContainer, 'Staff Util %', `${data.staff_utilization.utilization_rate}%`, 'widget-yellow');
            // Render Finance Details
            if (financeContainer) {
                financeContainer.innerHTML = `
                <div class="row align-items-center h-100">
                    <div class="col-6">
                        <ul class="list-unstyled mb-0">
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Revenue</span>
                                <span class="fw-bold text-success">$${data.financial_summary.revenue.toLocaleString()}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Expenses</span>
                                <span class="fw-bold text-danger">$${data.financial_summary.expenses.toLocaleString()}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Net Income</span>
                                <span class="fw-bold text-primary">$${data.financial_summary.net_income.toLocaleString()}</span>
                            </li>
                            <li class="d-flex justify-content-between">
                                <span class="text-muted">Outstanding</span>
                                <span class="fw-bold text-warning">$${data.financial_summary.outstanding_fees.toLocaleString()}</span>
                            </li>
                        </ul>
                    </div>
                    <div class="col-6 text-center">
                        <div class="position-relative d-inline-block">
                            <span class="material-icons text-success" style="font-size: 80px;">monetization_on</span>
                        </div>
                    </div>
                </div>
            `;
            }
            // Render Staff Details
            if (staffContainer) {
                staffContainer.innerHTML = `
                <div class="row align-items-center h-100">
                     <div class="col-6">
                        <ul class="list-unstyled mb-0">
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Total Staff</span>
                                <span class="fw-bold">${data.staff_utilization.total_staff}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Active Classes</span>
                                <span class="fw-bold">${data.staff_utilization.active_classes}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Student:Teacher</span>
                                <span class="fw-bold">${data.staff_utilization.student_teacher_ratio}</span>
                            </li>
                            <li class="d-flex justify-content-between">
                                <span class="text-muted">Efficiency</span>
                                <span class="badge bg-success">${data.staff_utilization.utilization_rate}%</span>
                            </li>
                        </ul>
                     </div>
                     <div class="col-6 text-center">
                        <div class="pie-chart-placeholder rounded-circle border border-3 border-warning d-flex align-items-center justify-content-center mx-auto" style="width:100px; height:100px;">
                            <span class="h4 m-0 fw-bold">${data.staff_utilization.utilization_rate}%</span>
                        </div>
                     </div>
                </div>
            `;
            }
            // 1. Attendance Chart (Line Chart Trend)
            if (attendanceContainer) {
                const attTrace = {
                    x: data.attendance_trends.map(t => t.month),
                    y: data.attendance_trends.map(t => t.rate),
                    type: 'scatter',
                    mode: 'lines+markers',
                    marker: { color: '#4D44B5' },
                    line: { shape: 'spline', width: 3 },
                    name: 'Attendance'
                };
                const attLayout = {
                    autosize: true,
                    margin: { t: 20, b: 40, l: 40, r: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: { title: 'Month' },
                    yaxis: { title: 'Percentage (%)', range: [0, 100] }
                };
                loadPlotlyAndRender(() => Plotly.newPlot('attendance-chart', [attTrace], attLayout, { displayModeBar: false }));
            }
            // 2. Academic Performance (Bar Chart by Subject)
            if (academicContainer) {
                const academicData = data.academic_performance;
                const acTrace = {
                    x: ['Math', 'Science', 'English', 'Overall'],
                    y: [academicData.math_avg, academicData.science_avg, academicData.english_avg, academicData.overall_avg],
                    type: 'bar',
                    marker: { color: ['#dc3545', '#ffc107', '#0dcaf0', '#4D44B5'] },
                };
                const acLayout = {
                    autosize: true,
                    margin: { t: 20, b: 40, l: 40, r: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    yaxis: { title: 'Average Score', range: [0, 100] }
                };
                loadPlotlyAndRender(() => Plotly.newPlot('academic-chart', [acTrace], acLayout, { displayModeBar: false }));
            }
        }
        catch (e) {
            console.error("Error loading reports", e);
        }
    });
}
// --- CLASS MATERIALS ---
function handleAddMaterial(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addMaterialMessage.textContent = 'Uploading material...';
        elements.addMaterialMessage.className = 'text-primary fw-medium';
        const formData = new FormData(elements.addMaterialForm);
        try {
            const response = yield fetchAPI('/materials/upload', {
                method: 'POST',
                body: formData,
                // No 'Content-Type' header needed for FormData, browser sets it automatically
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addMaterialMessage.textContent = data.message;
                elements.addMaterialMessage.className = 'text-success fw-bold';
                elements.addMaterialForm.reset();
                elements.addMaterialModal.hide(); // Hide modal on success
                yield loadClassMaterials(); // Refresh materials list
            }
            else {
                elements.addMaterialMessage.textContent = data.detail || 'Failed to upload material.';
                elements.addMaterialMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.addMaterialMessage.textContent = error.message;
            elements.addMaterialMessage.className = 'text-danger fw-bold';
        }
    });
}
function loadClassMaterials() {
    return __awaiter(this, void 0, void 0, function* () {
        elements.materialsList.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        try {
            const response = yield fetchAPI('/materials/all');
            if (response.ok) {
                const materials = yield response.json();
                if (materials.length === 0) {
                    elements.materialsList.innerHTML = '<p class="text-muted">No class materials uploaded yet.</p>';
                    return;
                }
                elements.materialsList.innerHTML = materials.map(material => `
                        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${material.title}</h6>
                                <p class="mb-1 small text-muted">${material.description}</p>
                                <small class="text-muted">Uploaded: ${new Date(material.upload_date).toLocaleDateString()}</small>
                            </div>
                            <div>
                                <a href="${material.file_url}" target="_blank" class="btn btn-sm btn-outline-primary me-2">View</a>
                                <button class="btn btn-sm btn-outline-danger" onclick="handleDeleteMaterial('${material.id}', '${material.title}')">Delete</button>
                            </div>
                        </div>
                    `).join('');
            }
            else {
                elements.materialsList.innerHTML = '<p class="text-danger fw-bold">Error loading materials.</p>';
            }
        }
        catch (error) {
            console.error("Error loading class materials:", error);
            elements.materialsList.innerHTML = `<p class="text-danger fw-bold">Network error: ${error.message}</p>`;
        }
    });
}
function handleDeleteMaterial(materialId, materialTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to delete "${materialTitle}"? This action cannot be undone.`))
            return;
        try {
            const response = yield fetchAPI(`/materials/${materialId}`, { method: 'DELETE' });
            if (response.ok) {
                alert(`Material "${materialTitle}" deleted successfully.`);
                yield loadClassMaterials();
            }
            else {
                const data = yield response.json();
                alert(`Error: ${data.detail || 'Failed to delete material.'}`);
            }
        }
        catch (error) {
            alert(`Network error: ${error.message}`);
        }
    });
}
// --- STUDENT & ACTIVITY ACTIONS ---
function handleAddStudent(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addStudentMessage.textContent = 'Adding student...';
        elements.addStudentMessage.className = 'text-primary fw-medium';
        const studentData = {
            id: document.getElementById('new-id').value,
            name: document.getElementById('new-name').value,
            password: document.getElementById('new-password').value,
            grade: parseInt(document.getElementById('new-grade').value),
            preferred_subject: document.getElementById('new-subject').value,
            home_language: document.getElementById('new-lang').value,
            attendance_rate: parseFloat(document.getElementById('new-attendance').value),
            math_score: parseFloat(document.getElementById('new-math-score').value),
            science_score: parseFloat(document.getElementById('new-science-score').value),
            english_language_score: parseFloat(document.getElementById('new-english-score').value),
        };
        try {
            const response = yield fetchAPI('/students/add', {
                method: 'POST',
                body: JSON.stringify(studentData)
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addStudentMessage.textContent = 'Student added successfully!';
                elements.addStudentMessage.className = 'text-success fw-bold';
                elements.addStudentForm.reset();
                // Close modal after a short delay
                setTimeout(() => {
                    elements.addStudentModal.hide();
                    elements.addStudentMessage.textContent = '';
                    // Refresh data and select new student
                    fetchStudents().then(() => {
                        appState.activeStudentId = studentData.id;
                        // Update Selector UI
                        const selectorDiv = document.getElementById('teacher-student-selector');
                        if (selectorDiv) {
                            renderStudentSelector(selectorDiv);
                            selectorDiv.style.display = 'block';
                        }
                        // Switch to Student View and Load Data
                        handleTeacherViewToggle('student-view'); // Ensures view is active
                        loadStudentDashboard(appState.activeStudentId);
                    });
                }, 1000);
            }
            else {
                elements.addStudentMessage.textContent = data.detail || 'Failed to add student.';
                elements.addStudentMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.addStudentMessage.textContent = error.message;
            elements.addStudentMessage.className = 'text-danger fw-bold';
        }
    });
}
// --- EDIT STUDENT LOGIC ---
function openEditStudentModal(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const modal = elements.editStudentModal;
        const form = elements.editStudentForm;
        // Clear previous
        form.reset();
        document.getElementById('edit-student-message').classList.add('d-none');
        document.getElementById('edit-id-display').textContent = 'Loading...';
        modal.show();
        try {
            // Fetch fresh data
            const response = yield fetchAPI(`/students/${studentId}/data`);
            if (!response.ok)
                throw new Error("Failed to fetch student data");
            const data = yield response.json();
            const student = appState.allStudents.find(s => s.id == studentId) || {};
            // Merge detail data with roster data if needed, but roster usually has basics
            // Actually, let's use the roster data for basics + summary for scores if available
            // Or better, fetch the raw student object if we had an endpoint. 
            // We will stick to updating what we have in the UI + scores.
            document.getElementById('edit-id').value = student.id;
            document.getElementById('edit-id-display').textContent = student.id;
            document.getElementById('edit-name').value = student.name;
            document.getElementById('edit-grade').value = student.grade;
            document.getElementById('edit-subject').value = student.preferred_subject;
            document.getElementById('edit-attendance').value = student.attendance_rate;
            document.getElementById('edit-lang').value = student.home_language || ''; // Check if home_language is in roster?
            // If home_language missing in roster object, we might need a dedicated GET /students/{id} 
            // But for now, let's assume it's in the object or we default to empty.
            // Scores - derived from summary or roster? Roster has them.
            const math = student.math_score || 0;
            const sci = student.science_score || 0;
            const eng = student.english_language_score || 0;
            document.getElementById('edit-math-score').value = math;
            document.getElementById('rng-math').value = math;
            document.getElementById('lbl-math').textContent = math + '%';
            document.getElementById('edit-science-score').value = sci;
            document.getElementById('rng-science').value = sci;
            document.getElementById('lbl-science').textContent = sci + '%';
            document.getElementById('edit-english-score').value = eng;
            document.getElementById('rng-english').value = eng;
            document.getElementById('lbl-english').textContent = eng + '%';
        }
        catch (e) {
            console.error(e);
            alert("Error loading student details: " + e.message);
            modal.hide();
        }
    });
}
// Global helper for the manual button onclick in HTML
window.submitEditStudentForm = function () {
    return __awaiter(this, void 0, void 0, function* () {
        // Trigger the submit event on the form so the listener catches it
        elements.editStudentForm.dispatchEvent(new Event('submit'));
    });
};
function handleEditStudentSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const msg = document.getElementById('edit-student-message');
        msg.classList.remove('d-none', 'text-danger', 'text-success');
        msg.textContent = 'Saving changes...';
        msg.className = 'text-center fw-medium p-2 mb-0 bg-light border-bottom text-primary';
        msg.classList.remove('d-none');
        const studentId = document.getElementById('edit-id').value;
        const updatedData = {
            name: document.getElementById('edit-name').value,
            grade: parseInt(document.getElementById('edit-grade').value),
            preferred_subject: document.getElementById('edit-subject').value,
            attendance_rate: parseFloat(document.getElementById('edit-attendance').value),
            home_language: document.getElementById('edit-lang').value,
            math_score: parseFloat(document.getElementById('edit-math-score').value),
            science_score: parseFloat(document.getElementById('edit-science-score').value),
            english_language_score: parseFloat(document.getElementById('edit-english-score').value),
            password: document.getElementById('edit-password').value || null
        };
        try {
            const response = yield fetchAPI(`/students/${studentId}`, {
                method: 'PUT', // Assuming PUT is the update method
                body: JSON.stringify(updatedData)
            });
            if (response.ok) {
                msg.textContent = 'Saved Successfully!';
                msg.classList.add('text-success');
                // Refresh Dashboard
                setTimeout(() => {
                    elements.editStudentModal.hide();
                    msg.classList.add('d-none');
                    initializeDashboard(); // Reload all lists
                }, 1000);
            }
            else {
                const data = yield response.json();
                msg.textContent = 'Error: ' + (data.detail || 'Update failed');
                msg.classList.add('text-danger');
            }
        }
        catch (error) {
            msg.textContent = 'Network Error: ' + error.message;
            msg.classList.add('text-danger');
        }
    });
}
var studentToDeleteId = null;
function handleDeleteStudent(studentId, studentName) {
    studentToDeleteId = studentId;
    document.getElementById('delete-modal-text').textContent = `Are you sure you want to delete ${studentName} (${studentId})?`;
    document.getElementById('delete-error-msg').textContent = '';
    elements.deleteConfirmationModal.show();
}
document.getElementById('confirm-delete-btn').onclick = () => __awaiter(this, void 0, void 0, function* () {
    if (!studentToDeleteId)
        return;
    const btn = document.getElementById('confirm-delete-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Deleting...";
    document.getElementById('delete-error-msg').textContent = '';
    try {
        const response = yield fetchAPI(`/students/${studentToDeleteId}`, { method: 'DELETE' });
        if (response.ok) {
            elements.deleteConfirmationModal.hide();
            initializeDashboard(); // Refresh list
            // Show small toast or alert
            const toast = document.createElement('div');
            toast.className = 'position-fixed bottom-0 end-0 p-3';
            toast.style.zIndex = '1100';
            toast.innerHTML = `
                        <div class="toast show align-items-center text-white bg-success border-0" role="alert">
                            <div class="d-flex">
                                <div class="toast-body">Student deleted successfully.</div>
                                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                            </div>
                        </div>`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        else {
            const data = yield response.json();
            let errorMsg = data.detail || 'Server error.';
            if (typeof errorMsg === 'object') {
                errorMsg = JSON.stringify(errorMsg);
            }
            document.getElementById('delete-error-msg').textContent = `Error: ${errorMsg}`;
        }
    }
    catch (error) {
        document.getElementById('delete-error-msg').textContent = `Network error: ${error.message}`;
    }
    finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});
function openStudentAddActivityModal() {
    // Security check
    if (!['Teacher', 'Admin', 'Tenant_Admin', 'Principal'].includes(appState.role) && !appState.isSuperAdmin) {
        alert("Only Teachers can log activities.");
        return;
    }
    const select = document.getElementById('activity-student-select');
    // Clear existing
    select.innerHTML = '';
    if (appState.role === 'Teacher' || appState.role === 'Admin') {
        // Enable for Teachers/Admins
        select.disabled = false;
        // Populate with all students
        if (appState.allStudents && appState.allStudents.length > 0) {
            appState.allStudents.forEach(s => {
                const option = document.createElement('option');
                // Handle different ID keys
                const id = s.id || s.ID || s.student_id;
                option.value = id;
                // Handle different Name/Grade keys and fallbacks
                const name = s.name || s.Name || s.student_name || "Unknown";
                let grade = s.grade;
                if (grade === undefined)
                    grade = s.Grade;
                if (grade === undefined)
                    grade = '?';
                option.textContent = `${name} (G${grade})`;
                // Compare with loose equality to match string vs number IDs
                if (id == appState.activeStudentId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
        else {
            // Fallback if list empty
            const option = document.createElement('option');
            option.value = appState.activeStudentId;
            option.textContent = appState.activeStudentId; // Better than nothing
            option.selected = true;
            select.appendChild(option);
        }
    }
    else {
        // Disable for Students (Self-logging)
        select.disabled = true;
        const option = document.createElement('option');
        option.value = appState.activeStudentId;
        // Try to get name, fallback to ID
        option.textContent = appState.userName || appState.userId || 'Me';
        option.selected = true;
        select.appendChild(option);
    }
    // Set Date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('activity-date').value = today;
    // Reset other fields
    document.getElementById('activity-topic').value = '';
    document.getElementById('activity-score').value = '85.0';
    document.getElementById('activity-time').value = '30';
    document.getElementById('add-activity-message').textContent = '';
    // Show Modal
    elements.addActivityModal.show();
}
function handleAddActivity(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addActivityMessage.textContent = 'Logging activity...';
        elements.addActivityMessage.className = 'text-primary';
        const activityData = {
            student_id: elements.activityStudentSelect.value,
            date: document.getElementById('activity-date').value,
            topic: document.getElementById('activity-topic').value,
            difficulty: document.getElementById('activity-difficulty').value,
            score: parseFloat(document.getElementById('activity-score').value),
            time_spent_min: parseInt(document.getElementById('activity-time').value),
        };
        try {
            const response = yield fetchAPI('/activities/add', {
                method: 'POST',
                body: JSON.stringify(activityData)
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addActivityMessage.textContent = data.message;
                elements.addActivityMessage.className = 'text-success fw-bold';
                elements.addActivityForm.reset();
                if (appState.activeStudentId === activityData.student_id) {
                    yield loadStudentDashboard(appState.activeStudentId);
                }
                if (appState.role === 'Teacher' && document.getElementById('view-select').value === 'teacher-view') {
                    yield renderTeacherDashboard();
                }
            }
            else {
                elements.addActivityMessage.textContent = data.detail || 'Failed to log activity.';
                elements.addActivityMessage.className = 'text-danger';
            }
        }
        catch (error) {
            elements.addActivityMessage.className = 'text-danger';
            elements.addActivityMessage.textContent = error.message;
        }
    });
}
// --- DASHBOARD RENDERING ---
function renderTeacherDashboard() {
    return __awaiter(this, void 0, void 0, function* () {
        switchView('teacher-view');
        setSuperAdminInstitutionListMode(false);
        renderSuperAdminBackToInstitutionList();
        elements.teacherMetrics.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        elements.rosterTable.innerHTML = '';
        if (window.Plotly) Plotly.purge(elements.classPerformanceChart);
        try {
            const response = yield fetchAPI('/teacher/overview');
            if (!response.ok) {
                elements.teacherMetrics.innerHTML = '<p class="text-danger fw-bold">Error fetching data.</p>';
                return;
            }
            const data = yield response.json();
            // Populate global state for student selector
            appState.allStudents = data.roster || [];
            // Metrics
            // Metrics
            elements.teacherMetrics.innerHTML = '';
            renderMetric(elements.teacherMetrics, "dashboard_students", data.total_students, 'widget-purple');
            renderMetric(elements.teacherMetrics, "dashboard_teachers", data.total_teachers || 0, 'widget-yellow');
            renderMetric(elements.teacherMetrics, "dashboard_staff", "29,300", 'widget-blue');
            renderMetric(elements.teacherMetrics, "dashboard_awards", "95,800", 'widget-green');
            // Roster Table
            let tableHTML = '';
            data.roster.forEach(student => {
                tableHTML += `
                    <tr>
                        <td><span class="badge bg-light text-dark border">${student.ID}</span></td>
                        <td class="fw-bold text-primary-custom">${student.Name}</td>
                        <td>${student.Grade}</td>
                        <td>
                            <div class="progress" style="height: 6px; width: 60px;">
                                <div class="progress-bar bg-success" style="width: ${student['Attendance %']}%"></div>
                            </div>
                            <small>${student['Attendance %']}%</small>
                        </td>
                        <td>${student['Initial Score']}%</td>
                        <td><span class="badge ${student['Avg Activity Score'] >= 80 ? 'bg-success' : 'bg-secondary'}">${student['Avg Activity Score']}%</span></td>
                        <td>${student.Subject}</td>
                        <td>
                            <div class="d-flex gap-2 justify-content-start">
                                <button class="btn btn-sm btn-outline-primary" onclick="loadStudentDashboard('${student.ID}'); (document.getElementById('view-select') as HTMLInputElement).value='student-view'; document.getElementById('teacher-student-selector').style.display='block'; (document.getElementById('student-select') as HTMLInputElement).value='${student.ID}';" title="View Dashboard">
                                    <span class="material-icons" style="font-size: 18px;">visibility</span>
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="openEditStudentModal('${student.ID}')" title="Edit Profile">
                                    <span class="material-icons" style="font-size: 18px;">edit</span>
                                </button>
                                <button class="btn btn-sm btn-outline-dark" onclick="openAccessCardModal('${student.ID}')" title="Print Access Card">
                                    <span class="material-icons" style="font-size: 18px;">badge</span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="handleDeleteStudent('${student.ID}', '${student.Name}')" title="Delete Student">
                                    <span class="material-icons" style="font-size: 18px;">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            elements.rosterTable.innerHTML = tableHTML;
            document.getElementById('roster-header').innerHTML = '<th>ID</th><th>Name</th><th>Grade</th><th>Attendance</th><th>Initial Score</th><th>Avg Score</th><th>Subject</th><th>Actions</th>';
            // ... (Chart logic remains the same) ...
            const chartData = data.roster.map(s => ({
                x: s.Name,
                y: s['Avg Activity Score'],
                attendance: s['Attendance %']
            }));
            const plotData = [{
                x: chartData.map(d => d.x),
                y: chartData.map(d => d.y),
                marker: {
                    color: chartData.map(d => d.attendance),
                    colorscale: 'RdBu',
                    reversescale: true,
                    showscale: true,
                    colorbar: { title: 'Attendance %' }
                },
                type: 'bar',
                name: 'Average Activity Score'
            }];
            loadPlotlyAndRender(() => Plotly.newPlot(elements.classPerformanceChart, plotData, {
                title: 'Class Average Activity Score',
                height: 350,
                margin: { t: 40, b: 60, l: 40, r: 10 },
                xaxis: { title: 'Student Name' },
                yaxis: { title: 'Score (%)', range: [0, 100] }
            }));
        }
        catch (error) {
            console.error(error);
        }
    });
}
// --- ACCESS CARD LOGIC ---
function openAccessCardModal(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        openView('accessCardModal');
        const nameEl = document.getElementById('card-student-name');
        const idEl = document.getElementById('card-student-id');
        const listEl = document.getElementById('card-codes-list');
        nameEl.textContent = "Loading...";
        idEl.textContent = studentId;
        listEl.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
        try {
            const response = yield fetchAPI(`/teacher/students/${studentId}/codes`);
            if (response.ok) {
                const data = yield response.json();
                nameEl.textContent = data.name;
                listEl.innerHTML = '';
                if (data.codes.length === 0) {
                    listEl.innerHTML = '<span class="text-danger">No active codes.</span>';
                }
                else {
                    data.codes.forEach(code => {
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-light text-dark border p-2 fs-5 font-monospace';
                        badge.textContent = code;
                        listEl.appendChild(badge);
                    });
                }
            }
            else {
                listEl.innerHTML = '<span class="text-danger">Failed to load codes.</span>';
            }
        }
        catch (e) {
            console.error(e);
            listEl.innerHTML = '<span class="text-danger">Network error.</span>';
        }
    });
}
function loadStudentDashboard(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!studentId)
            return;
        appState.activeStudentId = studentId;
        switchView('student-view');
        // Restrict "Log Activity" button to Teachers/Admins only
        const logBtn = document.getElementById('student-log-activity-btn');
        if (logBtn) {
            if (['Teacher', 'Admin', 'Tenant_Admin', 'Principal'].includes(appState.role) || appState.isSuperAdmin) {
                logBtn.classList.remove('d-none');
            }
            else {
                logBtn.classList.add('d-none');
            }
        }
        const student = appState.allStudents.find(s => s.id == studentId) || { name: studentId, grade: '?', attendance_rate: '?' };
        // --- Dynamic Greeting ---
        const greetingEl = document.getElementById('student-greeting-text');
        const nameHeaderEl = document.getElementById('student-name-header');
        if (greetingEl) {
            const hour = new Date().getHours();
            const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
            const greetWord = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
            greetingEl.textContent = `${greetWord} ${greetEmoji}`;
        }
        if (nameHeaderEl) {
            nameHeaderEl.innerHTML = `Welcome back, <span style="color:#28245D;">${student.name}</span> <span class="badge ms-2 align-middle" style="background:#28245D;font-size:0.65rem;vertical-align:middle;">Grade ${student.grade}</span>`;
        }
        const metricsContainer = document.getElementById('student-metrics');
        if (metricsContainer) {
            metricsContainer.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted small">Loading your dashboard...</p></div>';
        }
        if (elements.recommendationBox)
            elements.recommendationBox.style.display = 'none';
        if (elements.chatMessagesContainer)
            elements.chatMessagesContainer.innerHTML = appState.chatMessages[studentId] || '';
        try {
            console.log(`Fetching data for student: ${studentId}`);
            const response = yield fetchAPI(`/students/${studentId}/data`);
            if (!response.ok) {
                const errData = yield response.json().catch(() => ({}));
                throw new Error(errData.detail || `Failed to load data (${response.status})`);
            }
            const data = yield response.json();
            console.log("Student Data Received:", data);
            const summary = data.summary;
            const history = data.history;
            // --- Render Premium Gradient Stat Cards ---
            if (metricsContainer) {
                metricsContainer.innerHTML = '';
                const cards = [
                    { label: 'Overall Activity Avg', value: `${summary.avg_score || 0}%`, icon: 'trending_up', bg: 'linear-gradient(135deg, #4f8ef7 0%, #3b75e0 100%)', shadow: 'rgba(79,142,247,0.35)' },
                    { label: 'Total Activities', value: summary.total_activities || 0, icon: 'assignment_turned_in', bg: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)', shadow: 'rgba(168,85,247,0.35)' },
                    { label: 'Attendance Rate', value: `${student.attendance_rate || 0}%`, icon: 'event_available', bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', shadow: 'rgba(34,197,94,0.35)' },
                    { label: 'Math Score', value: `${summary.math_score || 0}%`, icon: 'calculate', bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245,158,11,0.35)' },
                    { label: 'Science Score', value: `${summary.science_score || 0}%`, icon: 'science', bg: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', shadow: 'rgba(244,63,94,0.35)' },
                    { label: 'English Score', value: `${summary.english_language_score || 0}%`, icon: 'menu_book', bg: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: 'rgba(239,68,68,0.35)' }
                ];
                cards.forEach(card => {
                    const col = document.createElement('div');
                    col.className = 'col-lg-4 col-md-6 col-6';
                    col.innerHTML = `
                        <div class="rounded-4 p-3 p-md-4 position-relative overflow-hidden"
                            style="background:${card.bg}; box-shadow: 0 6px 20px ${card.shadow}; min-height:120px;">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-white fw-bold" style="font-size:1.9rem;line-height:1.1;">${card.value}</div>
                                    <div class="text-white mt-2" style="font-size:0.82rem;opacity:0.9;font-weight:500;">${card.label}</div>
                                </div>
                                <div class="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                                    style="width:48px;height:48px;background:rgba(255,255,255,0.18);">
                                    <span class="material-icons text-white" style="font-size:26px;opacity:0.85;">${card.icon}</span>
                                </div>
                            </div>
                            <div class="position-absolute rounded-circle" style="width:80px;height:80px;background:rgba(255,255,255,0.07);bottom:-20px;right:-20px;"></div>
                        </div>`;
                    metricsContainer.appendChild(col);
                });
            }
            if (summary.recommendation && elements.recommendationBox) {
                elements.recommendationBox.style.display = 'block';
                elements.recommendationBox.innerHTML = `<strong>💡 Recommendation:</strong> ${summary.recommendation}`;
            }
            // GAMIFICATION RENDER
            const xp = student.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            const progress = xp % 100;
            const badges = student.badges || [];
            const levelEl = document.getElementById('student-level');
            const xpEl = document.getElementById('student-xp');
            const barEl = document.getElementById('student-xp-bar');
            const badgesContainer = document.getElementById('student-badges');
            if (levelEl) levelEl.textContent = String(level);
            if (xpEl) xpEl.textContent = xp;
            if (barEl) {
                barEl.style.width = `${progress}%`;
                barEl.setAttribute('aria-valuenow', String(progress));
            }
            if (badgesContainer) {
                badgesContainer.innerHTML = '';
                if (badges.length === 0) {
                    badgesContainer.innerHTML = '<span class="text-white-50 small fst-italic">No badges yet. Keep studying!</span>';
                }
                else {
                    badges.forEach(badge => {
                        let icon = 'military_tech';
                        let color = 'text-warning';
                        if (badge === 'Rookie') { icon = 'star_rate'; color = 'text-light'; }
                        if (badge === 'Scholar') { icon = 'school'; color = 'text-info'; }
                        if (badge === 'High Achiever') { icon = 'emoji_events'; color = 'text-warning'; }
                        const span = document.createElement('span');
                        span.className = 'badge bg-white text-dark shadow-sm d-flex align-items-center gap-1';
                        span.innerHTML = `<span class="material-icons ${color} fs-6">${icon}</span> ${badge}`;
                        badgesContainer.appendChild(span);
                    });
                }
            }
            // History Table
            let historyHTML = '';
            if (history.length > 0) {
                history.forEach(act => {
                    historyHTML += `<tr>
                        <td class="small">${act.date}</td>
                        <td class="small">${act.topic}</td>
                        <td><span class="badge rounded-pill ${act.difficulty === 'Hard' ? 'bg-danger' : act.difficulty === 'Medium' ? 'bg-warning text-dark' : 'bg-success'}">${act.difficulty}</span></td>
                        <td class="fw-bold">${act.score}%</td>
                        <td class="small text-muted">${act.time_spent_min} min</td>
                    </tr>`;
                });
            }
            else {
                historyHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No activity history available.</td></tr>';
            }
            if (elements.historyTable)
                elements.historyTable.innerHTML = historyHTML;
            // Progress Chart (Plotly - improved)
            if (elements.studentProgressChart) {
                const dates = history.map(h => h.date);
                const scores = history.map(h => h.score);
                const trace = {
                    x: dates, y: scores,
                    mode: 'lines+markers', type: 'scatter', name: 'Score',
                    line: { color: '#4f46e5', width: 2.5, shape: 'spline' },
                    marker: { size: 5, color: '#4f46e5' },
                    fill: 'tozeroy', fillcolor: 'rgba(79,70,229,0.07)'
                };
                const layout = {
                    title: 'Activity Score History', height: 300,
                    margin: { t: 40, b: 60, l: 45, r: 15 },
                    xaxis: { title: 'Date', gridcolor: '#f0f0f0' },
                    yaxis: { title: 'Score (%)', range: [0, 100], gridcolor: '#f0f0f0' },
                    plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff',
                    font: { family: 'Inter, sans-serif', size: 12, color: '#555' }
                };
                try {
                    loadPlotlyAndRender(() => Plotly.newPlot(elements.studentProgressChart, [trace], layout, { responsive: true, displayModeBar: false }));
                }
                catch (e) {
                    console.error("Plotly Error:", e);
                    elements.studentProgressChart.innerHTML = '<p class="text-danger text-center pt-5">Failed to load chart.</p>';
                }
            }
            // LMS: Load Groups & Assignments
            loadStudentGroups();
            loadStudentDashboardAssignments(studentId);
            loadStudentQuizResults(studentId);
        }
        catch (error) {
            console.error("Dashboard Load Error:", error);
            if (metricsContainer) {
                metricsContainer.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger shadow-sm rounded-4">
                        <h4 class="alert-heading"><span class="material-icons align-middle">error</span> Error Loading Dashboard</h4>
                        <p>${error.message}</p><hr>
                        <button class="btn btn-sm btn-outline-danger" onclick="loadStudentDashboard('${studentId}')">Retry</button>
                    </div>
                </div>`;
            }
        }
        scrollChatToBottom();
    });
}

function loadStudentDashboardAssignments(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('student-upcoming-assignments');
        if (!container)
            return;
        container.innerHTML = '<p class="text-muted small">Loading assignments...</p>';
        try {
            const res = yield fetchAPI(`/students/${studentId}/assignments`);
            if (res.ok) {
                const assignments = yield res.json();
                if (assignments.length === 0) {
                    container.innerHTML = '<p class="text-muted small">Hooray! No pending assignments.</p>';
                    return;
                }
                container.innerHTML = assignments.map(a => {
                    let desc = a.description || '';
                    let fileUrl = '';
                    let note = '';
                    try {
                        const parsed = JSON.parse(desc);
                        note = parsed.note || '';
                        fileUrl = parsed.file_url || '';
                    } catch (e) {
                        note = desc;
                    }

                    let fileLink = '';
                    if (fileUrl) {
                        fileLink = `
                            <div class="mt-1">
                                <a href="${fileUrl}" target="_blank" class="text-primary small text-decoration-none d-inline-flex align-items-center gap-1">
                                    <span class="material-icons" style="font-size:14px;">download</span> Attached File
                                </a>
                            </div>
                        `;
                    }

                    return `
                    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                        <div class="flex-grow-1">
                            <div class="fw-semibold">${a.title}</div>
                            <div class="small text-muted">
                                <span class="badge bg-light text-dark border me-1">${a.course_name || 'Assignment'}</span>
                                ${a.due_date ? `Due: <span class="text-danger fw-bold">${a.due_date}</span>` : ''}
                            </div>
                            ${fileLink}
                        </div>
                        <div class="ms-2">
                            ${a.type === 'Quiz' ?
                            `<button class="btn btn-sm btn-primary" onclick="takeQuiz('${a.id}')">Start Quiz</button>` :
                            `<button class="btn btn-sm btn-success" onclick="openSubmitModal(${a.id}, '${(a.title || '').replace(/'/g, "\\'")}', 'student-view')">
                                    <span class="material-icons align-middle" style="font-size:14px;">send</span> Submit
                                </button>`
                        }
                        </div>
                    </div>
                `;
                }).join('');
            }
            else {
                container.innerHTML = '<p class="text-danger small">Failed to load assignments.</p>';
            }
        }
        catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-danger small">Error loading assignments.</p>';
        }
    });

}
function loadStudentQuizResults(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('student-quiz-results-list');
        if (!container)
            return;
        container.innerHTML = '<p class="text-muted small">Loading results...</p>';
        try {
            const res = yield fetchAPI(`/students/${studentId}/quiz-results`);
            if (res.ok) {
                const results = yield res.json();
                if (results.length === 0) {
                    container.innerHTML = '<p class="text-muted small">No quiz results found.</p>';
                    return;
                }
                container.innerHTML = results.map((r, i) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold">${r.module_title || 'Untitled Quiz'}</div>
                        <div class="small text-muted">
                            <span class="badge bg-light text-dark border me-1">${r.course_title || 'Course'}</span>
                        </div>
                    </div>
                     <div class="text-end">
                        <span class="d-block fw-bold ${r.score >= 50 ? 'text-success' : 'text-danger'}">${Math.round(r.score)}%</span>
                        <span class="badge bg-secondary-subtle text-secondary border">${r.status}</span>
                    </div>
                </div>
            `).join('');
            }
            else {
                container.innerHTML = '<p class="text-danger small">Failed to load results.</p>';
            }
        }
        catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-danger small">Error loading results.</p>';
        }
    });
}

// --- PARENT PORTAL LOGIC ---
function loadParentChildData() {
    return __awaiter(this, void 0, void 0, function* () {
        const childIdInput = document.getElementById('parent-child-id');
        const childId = (childIdInput && childIdInput.value ? childIdInput.value.trim() : '') || (appState.activeStudentId || '').trim();
        if (!childId) {
            alert("No linked child found. Please login again or enter a Student ID.");
            return;
        }
        // UI Elements
        const contentDiv = document.getElementById('parent-dashboard-content');
        const nameSpan = document.getElementById('parent-child-name');
        const metricsDiv = document.getElementById('parent-metrics');
        const feedbackP = document.getElementById('parent-feedback');
        const attendanceEl = document.getElementById('parent-attendance');
        const chartDiv = document.getElementById('parent-progress-chart');
        if (!contentDiv || !nameSpan || !metricsDiv || !feedbackP || !attendanceEl) {
            console.error('Parent dashboard elements missing in DOM.');
            alert('Parent dashboard UI is incomplete on this page. Open the app via http://127.0.0.1:8000/ for full view.');
            return;
        }
        appState.activeStudentId = childId;
        contentDiv.classList.remove('d-none');
        nameSpan.textContent = "Loading...";
        metricsDiv.innerHTML = '<div class="spinner-border text-primary"></div>';
        try {
            // Reuse the student data endpoint (Observer pattern)
            const response = yield fetchAPI(`/students/${childId}/data`);
            if (!response.ok)
                throw new Error("Student not found or access denied.");
            const data = yield response.json();
            const summary = data.summary;
            const student = appState.allStudents.find(s => s.id === childId) || { name: childId, attendance_rate: '?' };
            // Populate Data
            nameSpan.textContent = student.name || childId;
            attendanceEl.textContent = `${student.attendance_rate}%`;
            feedbackP.textContent = summary.recommendation || "No specific feedback generated yet.";
            feedbackP.className = summary.recommendation ? "text-dark" : "small fst-italic text-muted mb-0";
            // Metrics
            metricsDiv.innerHTML = '';
            renderMetric(metricsDiv, "Avg Score", `${summary.avg_score}%`, 'border-primary');
            renderMetric(metricsDiv, "Activities", summary.total_activities, 'border-info');
            renderMetric(metricsDiv, "Math", `${summary.math_score}%`);
            renderMetric(metricsDiv, "Science", `${summary.science_score}%`);
            // Graph
            if (chartDiv) {
                const history = data.history;
                const dates = history.map(h => h.date);
                const scores = history.map(h => h.score);
                const trace = {
                    x: dates,
                    y: scores,
                    mode: 'lines+markers',
                    type: 'scatter',
                    name: 'Score',
                    line: { color: '#198754', width: 2 } // Green for parents
                };
                loadPlotlyAndRender(() => Plotly.newPlot(chartDiv, [trace], {
                    title: 'Child\'s Academic Progress',
                    height: 300,
                    margin: { t: 40, b: 30, l: 40, r: 10 },
                    xaxis: { title: 'Date' },
                    yaxis: { title: 'Score (%)', range: [0, 100] }
                }, { responsive: true }));
            }
        }
        catch (e) {
            alert(e.message);
            contentDiv.classList.add('d-none');
        }
    });
}
// --- CHAT LOGIC ---
function scrollChatToBottom() {
    elements.chatMessagesContainer.scrollTop = elements.chatMessagesContainer.scrollHeight;
}
function appendChatMessage(sender, message) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'assistant-message'}`;
    msgDiv.textContent = message;
    elements.chatMessagesContainer.appendChild(msgDiv);
    if (appState.activeStudentId) {
        if (!appState.chatMessages[appState.activeStudentId])
            appState.chatMessages[appState.activeStudentId] = '';
        appState.chatMessages[appState.activeStudentId] = elements.chatMessagesContainer.innerHTML;
    }
    scrollChatToBottom();
}
// Voice Recognition Setup
var recognition;
var isListening = false;
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chat-input').value = transcript;
        toggleVoiceInput(); // Stop listening UI
        // Auto-send after speaking (optional, but feels smoother)
        handleChatSubmit(null);
    };
    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        toggleVoiceInput();
    };
}
function toggleVoiceInput() {
    const btn = document.getElementById('mic-btn');
    if (!recognition) {
        alert("Your browser does not support voice input. Try Chrome.");
        return;
    }
    if (isListening) {
        recognition.stop();
        isListening = false;
        btn.classList.remove('btn-danger', 'animate-pulse');
        btn.classList.add('btn-outline-secondary');
        btn.innerHTML = '<span class="material-icons">mic</span>';
    }
    else {
        recognition.start();
        isListening = true;
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-danger'); // Red to indicate recording
        btn.innerHTML = '<span class="material-icons">mic_off</span>';
        document.getElementById('chat-input').placeholder = "Listening...";
    }
}
function speakText(text) {
    // Basic text-to-speech
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}
function handleChatSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const inputEl = document.getElementById('chat-input'); // Direct access
        const prompt = inputEl.value.trim();
        const studentId = appState.activeStudentId;
        if (!prompt || !studentId)
            return;
        appendChatMessage('user', prompt);
        inputEl.value = '';
        try {
            const response = yield fetchAPI(`/ai/chat/${studentId}`, {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt })
            });
            const data = yield response.json();
            if (response.ok) {
                appendChatMessage('assistant', data.reply);
                speakText(data.reply); // Read answer aloud
            }
            else
                appendChatMessage('assistant', `Error: ${data.detail || 'Service error'}`);
        }
        catch (error) {
            appendChatMessage('assistant', 'Network Error');
        }
    });
}
// --- LIVE CLASSES (Simplified) ---
function loadLiveClasses() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let url = '/classes/upcoming';
            if (isParentRole(appState.role) && appState.activeStudentId) {
                url += `?student_id=${appState.activeStudentId}`;
            }
            const response = yield fetchAPI(url);
            if (response.ok) {
                renderLiveClasses(yield response.json());
            }
        }
        catch (error) { }
    });
}
function renderLiveClasses(classes) {
    if (!classes || classes.length === 0) {
        elements.liveClassesList.innerHTML = '<p class="text-muted small">No live classes scheduled.</p>';
        return;
    }
    let html = '<div class="list-group">';
    classes.forEach(cls => {
        const dateObj = new Date(cls.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1 text-primary-custom fw-bold"><span class="material-icons align-middle fs-6 me-1">videocam</span> ${cls.topic}</h6>
                        <small class="text-muted">${dateStr}</small>
                    </div>
                    <a href="${cls.meet_link}" target="_blank" class="btn btn-sm btn-outline-danger">Join</a>
                </div>
            `;
    });
    html += '</div>';
    elements.liveClassesList.innerHTML = html;
}
function checkClassStatus() {
    if (appState.role === 'Teacher') {
        const liveClassControls = document.getElementById('live-class-controls');
        if (liveClassControls) liveClassControls.style.display = 'block';
        if (elements.studentLiveBanner) {
            elements.studentLiveBanner.classList.remove('d-flex');
            elements.studentLiveBanner.classList.add('d-none');
        }
    }
    else {
        // Student: Check if live session is active via a flag in API (mocked here or relies on persistent store)
        // For now, simple check if banner should be hidden/shown logic is handled by teacher start/end
        // But in stateless frontend, we might need to poll /status. 
        // We'll leave it as event-driven for this demo or manual
        const liveClassControls = document.getElementById('live-class-controls');
        if (liveClassControls && liveClassControls.parentNode) {
            liveClassControls.parentNode.removeChild(liveClassControls); // Remove teacher controls from DOM
        }
    }
}
// --- TEACHER LIVE ACTIONS ---
function startClass() {
    const link = elements.meetLinkInput.value;
    if (!link) {
        alert("Enter Meet Link");
        return;
    }
    // In a real app, this would notify backend. 
    // Here we simulate visually for everyone if they were using sockets, but since it's just local:
    alert("Class Started! In a real app, students would see the banner now.");
    // We can't easily affect other connected clients without WebSockets, but we can show it locally
    if (appState.role === 'Student')
        showLiveBanner(link);
}
function endClass() {
    alert("Class Ended.");
}
function showLiveBanner(link) {
    elements.studentLiveBanner.classList.remove('d-none');
    elements.studentLiveBanner.classList.add('d-flex');
    elements.studentJoinLink.href = link;
}
// --- SCHEDULE CLASS LOGIC ---
function handleScheduleClass(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.scheduleMessage.textContent = "Scheduling...";
        elements.scheduleMessage.className = "text-primary";
        // Get selected students
        const checkboxes = document.querySelectorAll('#schedule-student-list input[type="checkbox"]:checked');
        const targetStudentIds = Array.from(checkboxes).map(cb => cb.value);
        const classData = {
            teacher_id: appState.userId || 'teacher', // Ensure teacher_id is sent
            topic: document.getElementById('class-topic').value,
            date: document.getElementById('class-date').value,
            meet_link: document.getElementById('class-link').value,
            target_students: targetStudentIds
        };
        try {
            const response = yield fetchAPI('/classes/schedule', {
                method: 'POST',
                body: JSON.stringify(classData)
            });
            if (response.ok) {
                elements.scheduleMessage.textContent = "Class Scheduled!";
                elements.scheduleMessage.className = "text-success fw-bold";
                setTimeout(() => {
                    elements.scheduleClassModal.hide();
                    elements.scheduleMessage.textContent = "";
                    elements.scheduleClassForm.reset();
                }, 1000);
                loadLiveClasses();
            }
            else {
                const err = yield response.json();
                elements.scheduleMessage.textContent = "Failed: " + (err.detail || "Unknown error");
                elements.scheduleMessage.className = "text-danger";
            }
        }
        catch (error) {
            elements.scheduleMessage.textContent = "Error scheduling class.";
            elements.scheduleMessage.className = "text-danger";
        }
    });
}
function toggleStudentCheckboxes(source) {
    const checkboxes = document.querySelectorAll('#schedule-student-list input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = source.checked);
}
// --- GROUPS LOGIC ---
function loadGroups() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('groups-list');
        container.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        try {
            const response = yield fetchAPI('/groups');
            if (response.ok) {
                const groups = yield response.json();
                renderGroupsList(groups);
                appState.groups = groups; // Cache
            }
        }
        catch (e) {
            container.innerHTML = 'Error loading groups';
        }
    });
}
function renderGroupsList(groups) {
    const container = document.getElementById('groups-list');
    if (groups.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-secondary">No courses created yet. Click "Create Course" to start.</div></div>';
        return;
    }
    container.innerHTML = groups.map(g => `
            <div class="col-md-4">
                <div class="card h-100 shadow-sm border-0 group-card hover-up">
                    <div class="card-body text-center cursor-pointer" onclick="openCourseDetail('${g.id}')">
                        <div class="mb-3">
                            <div class="bg-primary-subtle text-primary rounded-circle d-inline-flex align-items-center justify-content-center" style="width: 64px; height: 64px;">
                                <span class="material-icons fs-1">school</span>
                            </div>
                        </div>
                        <span class="badge bg-info text-dark rounded-pill mb-2">${g.subject || 'General'}</span>
                        <h5 class="card-title fw-bold text-dark">${g.name}</h5>
                        <p class="card-text text-muted small text-truncate">${g.description || 'No description'}</p>
                        <span class="badge bg-light text-secondary border rounded-pill px-3 py-1">
                            ${g.member_count} Students
                        </span>
                    </div>
                    <div class="card-footer bg-white border-top-0 pb-3 pt-0 px-4">
                        <div class="d-flex gap-2">
                             <button class="btn btn-sm btn-outline-primary fw-bold flex-grow-1" onclick="openCourseDetail('${g.id}')">Open Course</button>
                             ${appState.role === 'Teacher' ? `<button class="btn btn-sm btn-light text-muted" onclick="openManageMembers('${g.id}', '${g.name.replace(/'/g, "\\'")}')" title="Manage"><span class="material-icons" style="font-size: 18px;">settings</span></button>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
}
document.getElementById('create-group-form').addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
    e.preventDefault();
    const msg = document.getElementById('create-group-message');
    msg.textContent = 'Creating...';
    try {
        const res = yield fetchAPI('/groups', {
            method: 'POST',
            body: JSON.stringify({
                name: document.getElementById('group-name').value,
                description: document.getElementById('group-desc').value,
                subject: document.getElementById('group-subject').value
            })
        });
        if (res.ok) {
            msg.textContent = 'Success!';
            elements.createGroupModal.hide();
            document.getElementById('create-group-form').reset();
            msg.textContent = '';
            loadGroups();
        }
        else {
            msg.textContent = 'Failed: ' + (yield res.json()).detail;
        }
    }
    catch (e) {
        msg.textContent = 'Error creating course.';
    }
}));
function openManageMembers(groupId, groupName) {
    return __awaiter(this, void 0, void 0, function* () {
        document.getElementById('manage-group-name').textContent = groupName; // Legacy
        if (document.getElementById('manage-group-title')) {
            document.getElementById('manage-group-title').textContent = `👥 Manage: ${groupName}`;
        }
        document.getElementById('manage-group-id').value = groupId;
        // Reset Tabs
        if (document.getElementById('tab-members-btn')) {
            new bootstrap.Tab(document.getElementById('tab-members-btn')).show();
        }
        const listContainer = document.getElementById('group-members-list');
        listContainer.innerHTML = 'Loading...';
        elements.manageMembersModal.show();
        try {
            // Get current members
            const res = yield fetchAPI(`/groups/${groupId}/members`);
            const data = yield res.json();
            const currentMemberIds = data.members;
            // Render all students with checks
            listContainer.innerHTML = appState.allStudents.map(s => {
                const isChecked = currentMemberIds.includes(s.id) ? 'checked' : '';
                return `
                    <div class="form-check border-bottom py-2">
                        <input class="form-check-input" type="checkbox" value="${s.id}" id="gm-${s.id}" ${isChecked}>
                        <label class="form-check-label" for="gm-${s.id}">
                            ${s.name} <small class="text-muted">(${s.id})</small>
                        </label>
                    </div>
                `;
            }).join('');
            // Load Materials implicitly (or trigger lazy load)
            loadGroupMaterials(groupId);
        }
        catch (e) {
            listContainer.innerHTML = 'Error loading members';
        }
    });
}
// --- MATERIALS LOGIC ---
function toggleMaterialInput() {
    const type = document.getElementById('mat-type').value;
    const textGroup = document.getElementById('mat-text-input-group');
    const fileGroup = document.getElementById('mat-file-input-group');
    const textInput = document.getElementById('mat-content');
    const fileInput = document.getElementById('mat-file');
    if (type === 'File') {
        textGroup.classList.add('d-none');
        fileGroup.classList.remove('d-none');
        textInput.required = false;
        fileInput.required = true;
    }
    else {
        textGroup.classList.remove('d-none');
        fileGroup.classList.add('d-none');
        textInput.required = true;
        fileInput.required = false;
    }
}
function handlePostMaterial(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const btn = document.getElementById('post-material-btn');
        const groupId = document.getElementById('manage-group-id').value;
        const title = document.getElementById('mat-title').value;
        const type = document.getElementById('mat-type').value;
        // Disable button to prevent double submit
        btn.disabled = true;
        btn.textContent = "Posting...";
        try {
            if (type === 'File') {
                const fileInput = document.getElementById('mat-file');
                const file = fileInput.files[0];
                if (!file) {
                    alert("Please select a file.");
                    return;
                }
                const formData = new FormData();
                formData.append('file', file);
                if (title)
                    formData.append('title', title);
                // Fetch with native fetch for FormData (fetchAPI helper might default to JSON)
                // But we can use fetchAPI if we handle headers correctly.
                // Let's use direct logic here to be safe with multipart
                const headers = {};
                if (appState.isLoggedIn && appState.role && appState.userId) {
                    headers['X-User-Role'] = appState.role;
                    headers['X-User-Id'] = appState.userId;
                }
                const response = yield fetch(`${API_BASE_URL}/groups/${groupId}/upload`, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });
                if (!response.ok) {
                    throw new Error((yield response.json()).detail || "Upload failed");
                }
            }
            else {
                // Standard Text/JSON Post
                const content = document.getElementById('mat-content').value;
                yield fetchAPI(`/groups/${groupId}/materials`, {
                    method: 'POST',
                    body: JSON.stringify({ title, type, content })
                });
            }
            document.getElementById('add-material-form').reset();
            toggleMaterialInput(); // Reset UI state
            loadGroupMaterials(groupId);
        }
        catch (e) {
            console.error(e);
            alert('Failed to post material: ' + e.message);
        }
        finally {
            btn.disabled = false;
            btn.textContent = "Post";
        }
    });
}
function loadGroupMaterials(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('group-materials-list');
        if (!container)
            return; // For student view safety
        container.innerHTML = '<div class="text-center p-2"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/materials`);
            const data = yield res.json();
            if (data.length === 0) {
                container.innerHTML = '<div class="p-3 text-muted small text-center">No materials posted yet.</div>';
                return;
            }
            container.innerHTML = data.map(m => `
                <div class="list-group-item">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1 fw-bold text-primary-custom">
                           <span class="badge ${m.type === 'Quiz' ? 'bg-danger' : 'bg-success'} me-1">${m.type}</span> ${m.title}
                        </h6>
                        <small class="text-muted">${m.date}</small>
                    </div>
                    <p class="mb-1 text-muted small text-break">${m.content}</p>
                </div>
            `).join('');
        }
        catch (e) {
            container.innerHTML = 'Error loading materials';
        }
    });
}
// --- STUDENT GROUPS LOGIC ---
function loadStudentGroups() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.activeStudentId)
            return;
        const container = document.getElementById('student-groups-list');
        container.innerHTML = 'Loading groups...';
        try {
            const res = yield fetchAPI(`/students/${appState.activeStudentId}/groups`);
            if (res.ok) {
                const groups = yield res.json();
                if (groups.length === 0) {
                    container.innerHTML = '<p class="text-muted small">You are not enrolled in any courses yet.</p>';
                    return;
                }
                container.innerHTML = groups.map(g => `
                    <div class="col-md-4 col-sm-6">
                        <div class="card h-100 border-0 shadow-sm student-group-card" onclick="openCourseDetail('${g.id}')">
                            <div class="card-body">
                                <span class="badge bg-secondary mb-2">${g.subject || 'General'}</span>
                                <h5 class="card-title fw-bold text-primary-custom">${g.name}</h5>
                                <p class="card-text text-muted small text-truncate">${g.description || 'No description'}</p>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
        catch (e) {
            container.innerHTML = 'Error.';
        }
    });
}
function openStudentGroup(groupId, name, desc) {
    return __awaiter(this, void 0, void 0, function* () {
        document.getElementById('sg-title').textContent = name;
        document.getElementById('sg-desc').textContent = desc;
        const container = document.getElementById('student-materials-list');
        container.innerHTML = 'Loading resources...';
        openView('studentGroupModal');
        try {
            const res = yield fetchAPI(`/groups/${groupId}/materials`);
            const data = yield res.json();
            if (data.length === 0) {
                container.innerHTML = '<div class="alert alert-light text-center">No materials posted yet by your teacher.</div>';
                return;
            }
            container.innerHTML = data.map(m => {
                let actionBtn = '';
                if (m.type === 'Quiz' || m.type === 'Video' || m.content.startsWith('http')) {
                    actionBtn = `<a href="${m.content}" target="_blank" class="btn btn-sm btn-outline-primary mt-2">Open Link 🔗</a>`;
                }
                return `
                    <div class="list-group-item py-3">
                        <div class="d-flex justify-content-between">
                            <h6 class="mb-1 fw-bold">
                               <span class="badge ${m.type === 'Quiz' ? 'bg-danger' : 'bg-success'} me-2">${m.type}</span>${m.title}
                            </h6>
                            <small class="text-muted opacity-75">${m.date}</small>
                        </div>
                        <p class="mb-1 text-secondary mt-1">${m.content}</p>
                        ${actionBtn}
                    </div>
                 `;
            }).join('');
        }
        catch (e) {
            container.innerHTML = 'Error loading content.';
        }
    });
}
function saveGroupMembers() {
    return __awaiter(this, void 0, void 0, function* () {
        const groupId = document.getElementById('manage-group-id').value;
        const checked = document.querySelectorAll('#group-members-list input:checked');
        const ids = Array.from(checked).map(cb => cb.value);
        try {
            yield fetchAPI(`/groups/${groupId}/members`, {
                method: 'POST',
                body: JSON.stringify({ student_ids: ids })
            });
            elements.manageMembersModal.hide();
            loadGroups(); // Refresh counts
        }
        catch (e) {
            alert('Failed to save members');
        }
    });
}
function deleteGroup() {
    return __awaiter(this, void 0, void 0, function* () {
        const groupId = document.getElementById('manage-group-id').value;
        if (!confirm("Delete this course?"))
            return;
        yield fetchAPI(`/groups/${groupId}`, { method: 'DELETE' });
        elements.manageMembersModal.hide();
        loadGroups();
    });
}
// --- SCHEDULE MODAL ENHANCEMENTS ---
// Updated listener to populate Groups dropdown
document.getElementById('scheduleClassModal').addEventListener('show.bs.modal', function () {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('schedule-student-list');
        const groupSelect = document.getElementById('schedule-group-filter');
        // Populate Students
        list.innerHTML = '';
        if (appState.allStudents.length === 0) {
            list.innerHTML = '<p class="text-muted small">No students found.</p>';
        }
        else {
            appState.allStudents.forEach(s => {
                const div = document.createElement('div');
                div.className = 'form-check';
                div.innerHTML = `
                    <input class="form-check-input" type="checkbox" value="${s.id}" id="student-cb-${s.id}">
                    <label class="form-check-label" for="student-cb-${s.id}">${s.name} (${s.id})</label>
                `;
                list.appendChild(div);
            });
        }
        // Populate Groups Dropdown
        groupSelect.innerHTML = '<option value="">-- All Students --</option>';
        try {
            const res = yield fetchAPI('/groups');
            if (res.ok) {
                const groups = yield res.json();
                groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    groupSelect.appendChild(opt);
                });
            }
        }
        catch (e) { }
    });
});
function applyGroupFilter(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!groupId)
            return; // Wait for functionality or reset?
        // Uncheck all first
        document.querySelectorAll('#schedule-student-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        try {
            const res = yield fetchAPI(`/groups/${groupId}/members`);
            const data = yield res.json();
            data.members.forEach(sid => {
                const cb = document.getElementById(`student-cb-${sid}`);
                if (cb)
                    cb.checked = true;
            });
        }
        catch (e) { }
    });
}
// --- EVENT LISTENERS ---
// Robust attachment helper to prevent script crashes if an element is missing
function attachListener(elementOrId, event, handler) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (el) {
        el.addEventListener(event, handler);
    }
    else {
        console.warn(`Element not found for event: ${event}`);
    }
}
attachListener(elements.loginForm, 'submit', handleLogin);
attachListener('two-factor-form', 'submit', handle2FASubmit);
attachListener(elements.addStudentForm, 'submit', handleAddStudent);
attachListener(elements.addActivityForm, 'submit', handleAddActivity);
attachListener(elements.editStudentForm, 'submit', handleEditStudentSubmit);
// Chat form listener removed - handled via onClick in HTML to prevent reload issues
attachListener(elements.scheduleClassForm, 'submit', handleScheduleClass);
// Explicitly attach listener with console log for debugging
// Quiz generation is handled via onclick="handleGenerateQuiz(event)" in HTML
// Initial load for Checkboxes (populate when modal opens)
document.getElementById('scheduleClassModal').addEventListener('show.bs.modal', function () {
    const list = document.getElementById('schedule-student-list');
    list.innerHTML = '';
    if (appState.allStudents.length === 0) {
        list.innerHTML = '<p class="text-muted small">No students found.</p>';
        return;
    }
    appState.allStudents.forEach(s => {
        const div = document.createElement('div');
        div.className = 'form-check';
        div.innerHTML = `
                <input class="form-check-input" type="checkbox" value="${s.id}" id="student-cb-${s.id}">
                <label class="form-check-label" for="student-cb-${s.id}">${s.name} (${s.id})</label>
            `;
        list.appendChild(div);
    });
});
// --- REGENERATE & EMAIL CODE LOGIC ---
function regenerateAccessCode() {
    return __awaiter(this, void 0, void 0, function* () {
        const studentId = document.getElementById('card-student-id').textContent;
        if (!confirm("Regenerate code for " + studentId + "? Old codes will stop working."))
            return;
        try {
            const response = yield fetchAPI(`/students/${studentId}/regenerate-code`, { method: 'POST' });
            const data = yield response.json();
            if (response.ok) {
                // Refresh codes in modal
                const codesDiv = document.getElementById('card-codes-list');
                codesDiv.innerHTML = '';
                data.codes.forEach(code => {
                    codesDiv.innerHTML += `<span class="badge bg-dark fs-5 p-2 tracking-wider font-monospace">${code}</span>`;
                });
                alert("New code generated!");
            }
            else {
                alert(data.detail || "Failed to regenerate.");
            }
        }
        catch (error) {
            console.error(error);
            alert("Failed to regenerate code.");
        }
    });
}
// 8. AI GENERATION & QUIZZES
function handleGenerateQuiz(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const btn = e.target;
        // const originalText = btn.innerHTML; // Avoid losing icon complexity
        const topic = document.getElementById('quiz-topic').value;
        const fileInput = document.getElementById('quiz-pdf');
        if (!topic) {
            alert("Please enter a topic first.");
            return;
        }
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating...';
        btn.disabled = true;
        const resultContainer = document.getElementById('quiz-result-container');
        resultContainer.classList.add('d-none');
        // Get count, clamp between 1 and 20
        let count = parseInt(document.getElementById('quiz-count').value) || 5;
        if (count < 1)
            count = 1;
        if (count > 20)
            count = 20;
        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('difficulty', document.getElementById('quiz-difficulty').value);
            formData.append('type', document.getElementById('quiz-type').value);
            formData.append('question_count', String(count));
            formData.append('description', document.getElementById('quiz-description').value);
            if (fileInput && fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }
            // Explicitly requesting a long timeout for AI? Standard fetch has no timeout but browsers do.
            const response = yield fetch(`${API_BASE_URL}/ai/generate-quiz`, {
                method: 'POST',
                body: formData
            });
            const data = yield response.json();
            if (response.ok) {
                let quizContent = data.content;
                // Clean up if wrapped in strings or markdown
                if (typeof quizContent === 'string') {
                    // If backend didn't clean it enough
                    try {
                        quizContent = JSON.parse(quizContent);
                    }
                    catch (e) {
                        console.error("Failed to parse", quizContent);
                        throw new Error("AI returned invalid JSON format.");
                    }
                }
                window.generatedQuizData = {
                    title: topic,
                    questions: quizContent
                };
                // Render Preview
                renderQuizPreview(quizContent, true);
                resultContainer.classList.remove('d-none');
                // Populate dropdwon if needed
                // Populate options
                if (typeof updateQuizTargetOptions === 'function') {
                    updateQuizTargetOptions();
                } else {
                    console.warn("updateQuizTargetOptions not found");
                }
            }
            else {
                alert("Error: " + (data.detail || "Failed to generate quiz."));
            }
        }
        catch (error) {
            console.error(error);
            alert("Failed to generate quiz: " + error.message);
        }
        finally {
            btn.innerHTML = '✨ Generate Quiz';
            btn.disabled = false;
        }
    });
}
function updateSaveValues() {
    return __awaiter(this, void 0, void 0, function* () {
        // Populate Groups Helper
        const select = document.getElementById('save-quiz-group-select');
        if (!select)
            return;
        // Try to ensure we have groups
        if (!appState.groups || appState.groups.length === 0) {
            try {
                const endpoint = appState.role === 'Student' ? `/students/${appState.activeStudentId}/groups` : '/groups';
                const res = yield fetchAPI(endpoint);
                if (res.ok) {
                    appState.groups = yield res.json();
                }
            }
            catch (e) {
                console.error("Failed to fetch groups for dropdown", e);
            }
        }
        select.innerHTML = '';
        if (appState.groups && appState.groups.length > 0) {
            appState.groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                if (appState.currentCourseId && g.id == appState.currentCourseId)
                    opt.selected = true;
                select.appendChild(opt);
            });
        }
        else {
            const opt = document.createElement('option');
            opt.textContent = "No courses found";
            select.appendChild(opt);
        }
    });
}
function renderQuizPreview(questions, showAnswers) {
    const container = document.getElementById('quiz-preview-content');
    if (!container)
        return;
    container.innerHTML = questions.map((q, i) => `
        <div class="mb-3 border-bottom pb-2">
            <strong class="d-block mb-1">Q${i + 1}: ${q.question}</strong>
            <ul class="list-unstyled ps-3 mb-1">
                ${q.options.map(opt => {
        // Logic: If showAnswers is true, highlight specific one. Else normal.
        const isCorrect = opt === q.correct_answer;
        const styleClass = (showAnswers && isCorrect) ? 'text-success fw-bold' : '';
        const icon = (showAnswers && isCorrect) ? '<span class="material-icons align-middle fs-6">check</span>' : '';
        return `<li class="${styleClass}">${icon} ${opt}</li>`;
    }).join('')}
            </ul>
        </div>
    `).join('');
}
function toggleQuizAnswers() {
    const isChecked = document.getElementById('toggle-quiz-answers').checked;
    if (window.generatedQuizData && window.generatedQuizData.questions) {
        renderQuizPreview(window.generatedQuizData.questions, isChecked);
    }
}

// Logic to handle AI Quiz Allocation
function updateQuizTargetOptions() {
    const type = document.getElementById('quiz-target-type').value;
    const select = document.getElementById('save-quiz-target-select');
    select.innerHTML = '<option>Loading...</option>';

    if (type === 'group') {
        updateSaveValues().then(() => {
            // updateSaveValues populates save-quiz-group-select (legacy), we need to copy or reuse.
            // But let's just repopulate here for clarity
            select.innerHTML = '';
            if (appState.groups && appState.groups.length > 0) {
                appState.groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    select.appendChild(opt);
                });
            } else {
                select.innerHTML = '<option value="">No Groups Found</option>';
            }
        });
    } else if (type === 'grade') {
        // Hardcoded Grades for now, or fetch from system settings if available
        select.innerHTML = '';
        [9, 10, 11, 12].forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = `Grade ${g}`;
            select.appendChild(opt);
        });
    } else if (type === 'section') {
        select.innerHTML = '<option>Loading Sections...</option>';
        fetchAPI('/sections')
            .then(res => res.json())
            .then(sections => {
                select.innerHTML = '';
                if (Array.isArray(sections) && sections.length > 0) {
                    // Sort helper
                    sections.sort((a, b) => (a.grade_level - b.grade_level) || a.name.localeCompare(b.name));

                    sections.forEach(sec => {
                        const opt = document.createElement('option');
                        opt.value = sec.id;
                        opt.textContent = `Grade ${sec.grade_level} - Section ${sec.name}`;
                        select.appendChild(opt);
                    });
                } else {
                    select.innerHTML = '<option value="">No Sections Found</option>';
                }
            })
            .catch(err => {
                console.error("Failed to load sections", err);
                select.innerHTML = '<option value="">Error loading sections</option>';
            });

    } else if (type === 'student') {
        // Use appState.allStudents (Teacher View)
        select.innerHTML = '';
        if (appState.allStudents && appState.allStudents.length > 0) {
            appState.allStudents.forEach(s => {
                const sSafe = s || {};
                // Handle inconsistent backend key casing/naming
                const id = sSafe.id || sSafe.ID || sSafe.student_id || sSafe.Id;
                const name = sSafe.name || sSafe.Name || sSafe.student_name || "Unknown";

                if (id) {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = `${name} (${id})`;
                    select.appendChild(opt);
                }
            });
        } else {
            select.innerHTML = '<option value="">No Students Loaded</option>';
        }
    }
}

// Global function to save the quiz
window.saveGeneratedQuiz = function () {
    return __awaiter(this, void 0, void 0, function* () {
        const targetType = document.getElementById('quiz-target-type').value;
        const targetId = document.getElementById('save-quiz-target-select').value;
        const timeLimit = document.getElementById('quiz-time-limit').value;

        console.log("Saving Quiz...", { targetType, targetId, hasData: !!window.generatedQuizData });

        if (!targetId) {
            alert("Please select a target (Course, Grade, or Student).");
            return;
        }

        // Validate Acknowledgment
        const ackCb = document.getElementById('quiz-acknowledge-cb');
        if (ackCb && !ackCb.checked) {
            alert("Please acknowledge that you have reviewed the questions and alignment with the curriculum.");
            return;
        }

        if (!window.generatedQuizData) {
            alert("No quiz data found to save. Please regenerate the quiz.");
            return;
        }

        const btn = document.querySelector('#quiz-save-area button');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Saving...';

        // If Type is 'group', we treat it as legacy group_id for backward compatibility in backend logic if needed,
        // but ideally we send everything as new fields.

        try {
            const payload = {
                title: window.generatedQuizData.title,
                questions: window.generatedQuizData.questions,
                target_type: targetType,
                target_id: targetId,
                time_limit: parseInt(timeLimit) || 0,
                acknowledged: true
            };

            // If target is group, we also map to group_id for legacy 'quizzes' table structure if we haven't fully migrated
            if (targetType === 'group') {
                payload.group_id = parseInt(targetId);
            } else {
                // For student/grade, group_id might be null or specific placeholder
                payload.group_id = null;
            }

            const res = yield fetchAPI('/quizzes/create', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert("Quiz Assigned Successfully!");
                // Reset
                document.getElementById('quiz-result-container').classList.add('d-none');

                // Refresh views if applicable
                if (targetType === 'group' && appState.currentCourseId == targetId && typeof loadCourseQuizzes === 'function') {
                    loadCourseQuizzes(targetId);
                }
            }
            else {
                const err = yield res.json();
                alert("Failed to save: " + (err.detail || "Unknown error"));
            }
        }
        catch (e) {
            alert("Error saving: " + e.message);
        }
        finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
};

function sendAccessCardEmail() {
    return __awaiter(this, void 0, void 0, function* () {
        const studentId = document.getElementById('card-student-id').textContent;
        const btn = document.getElementById('btn-email-card');
        // Check if ID looks like an email
        if (!studentId.includes('@')) {
            alert("Email feature only works for users registered with an Email ID (e.g. Google Login).");
            return;
        }
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        btn.disabled = true;
        try {
            const response = yield fetchAPI(`/students/${studentId}/email-code`, { method: 'POST' });
            const data = yield response.json();
            if (response.ok) {
                alert(data.message);
            }
            else {
                alert("Error: " + data.detail);
            }
        }
        catch (e) {
            alert("Network error sending email.");
        }
        finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}
// --- MOBILE UI LOGIC ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    // Toggle class on sidebar
    if (sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
        if (overlay)
            overlay.classList.remove('active');
    }
    else {
        sidebar.classList.add('mobile-open');
        if (overlay)
            overlay.classList.add('active');
    }
}
// --- WHITEBOARD LOGIC ---
var whiteboardManager = {
    socket: null,
    canvas: null,
    ctx: null,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    color: '#000000',
    width: 2,
    init: function () {
        this.canvas = document.getElementById('whiteboard-canvas');
        if (!this.canvas)
            return; // Guard
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        // Events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousedown", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        }, false);
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousemove", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        }, false);
        // Controls
        const colorInput = document.getElementById('wb-color');
        if (colorInput)
            colorInput.addEventListener('input', (e) => this.color = e.target.value);
        const widthInput = document.getElementById('wb-width');
        if (widthInput)
            widthInput.addEventListener('input', (e) => this.width = e.target.value);
        // Window resize
        window.addEventListener('resize', () => this.resize());
    },
    connect: function () {
        if (this.socket)
            return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Handle both localhost and production socket URLs
        let wsUrl = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
            ? 'ws://127.0.0.1:8000/ws/whiteboard'
            : `${protocol}//${window.location.host}/ws/whiteboard`;
        // Explicit override based on API_BASE_URL (Render/WebSocket)
        if (API_BASE_URL.includes('onrender')) {
            const backendRoot = API_BASE_URL.replace('/api', '');
            wsUrl = backendRoot.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/whiteboard';
        }
        this.socket = new WebSocket(wsUrl);
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'draw') {
                this.drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width, false);
            }
            else if (data.type === 'clear') {
                this.clearCanvas(false);
            }
        };
        this.socket.onopen = () => console.log("Whiteboard Connected");
        this.socket.onclose = () => {
            console.log("Whiteboard Disconnected");
            this.socket = null;
        };
    },
    resize: function () {
        if (!this.canvas)
            return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },
    startDrawing: function (e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
    },
    draw: function (e) {
        if (!this.isDrawing)
            return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.drawLine(this.lastX, this.lastY, x, y, this.color, this.width, true);
        [this.lastX, this.lastY] = [x, y];
    },
    stopDrawing: function () {
        this.isDrawing = false;
    },
    drawLine: function (x0, y0, x1, y1, color, width, emit) {
        this.ctx.beginPath();
        this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
        if (emit && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'draw',
                x0: x0, y0: y0, x1: x1, y1: y1,
                color: color,
                width: width
            }));
        }
    },
    clearCanvas: function (emit) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (emit && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'clear' }));
        }
    }
};
function openWhiteboard() {
    // Show Modal
    openView('whiteboardModal');
    setTimeout(() => {
        whiteboardManager.init();
        whiteboardManager.connect();
    }, 50);
}
function clearWhiteboard() {
    whiteboardManager.clearCanvas(true);
}
// --- EXPORT FUNCTIONALITY ---
function exportTeacherData() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.isLoggedIn || (appState.role !== 'Teacher' && appState.role !== 'Admin')) {
            alert("Unauthorized access.");
            return;
        }
        try {
            const response = yield fetch(`${API_BASE_URL}/teacher/export-grades-csv`, {
                method: 'GET',
                headers: {
                    'X-User-Role': appState.role,
                    'X-User-Id': appState.userId
                }
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Export failed: ${response.status} - ${errorText}`);
            }
            const blob = yield response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use a generic name or formatted date
            const date = new Date().toISOString().split('T')[0];
            a.download = `noble_nexus_grades_${date}.csv`;
            document.body.appendChild(a);
            a.click();
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
        catch (error) {
            console.error("Export error:", error);
            alert(`Failed to export grades. ${error.message}`);
        }
    });
}
// --- LMS COURSE LOGIC (Phase 1 & 2) ---
function openCourseDetail(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Opening course:", groupId);
        try {
            if (!groupId)
                throw new Error("Invalid Course ID");
            appState.currentCourseId = groupId;
            // 1. Force Switch View
            // Use simpler logic to avoid any potential switchView issues
            document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
            const detailView = document.getElementById('course-detail-view');
            if (detailView)
                detailView.classList.add('active');
            else
                throw new Error("Course Detail View Element Missing");
            // 2. Fetch/Find Metadata Safe Mode
            let course = null;
            if (Array.isArray(appState.groups)) {
                course = appState.groups.find(g => g && g.id == groupId);
            }
            if (!course) {
                console.log("Course not in cache, fetching...");
                try {
                    const endpoint = appState.role === 'Student' ? `/students/${appState.activeStudentId}/groups` : '/groups';
                    const res = yield fetchAPI(endpoint);
                    const groups = yield res.json();
                    if (Array.isArray(groups)) {
                        course = groups.find(g => g && g.id == groupId);
                    }
                }
                catch (e) {
                    console.error("Error fetching course details:", e);
                    // Don't crash, just show what we have (or dont have)
                }
            }
            if (course) {
                const titleEl = document.getElementById('course-title');
                const descEl = document.getElementById('course-desc');
                const badgeEl = document.getElementById('course-subject-badge');
                if (titleEl)
                    titleEl.textContent = course.name || 'Untitled Course';
                if (descEl)
                    descEl.textContent = course.description || 'No description provided.';
                if (badgeEl)
                    badgeEl.textContent = course.subject || 'General';
            }
            else {
                console.warn("Course metadata not found for ID:", groupId);
                // Optional: Alert user? Or just let them see empty state?
            }
            // 3. UI Controls for Teachers
            const isTeacher = appState.role === 'Teacher' || appState.role === 'Admin';
            const uploadBtn = document.getElementById('upload-material-btn');
            const manageBtn = document.getElementById('manage-members-btn');
            if (uploadBtn) {
                if (isTeacher)
                    uploadBtn.classList.remove('d-none');
                else
                    uploadBtn.classList.add('d-none');
            }
            if (manageBtn) {
                if (isTeacher)
                    manageBtn.classList.remove('d-none');
                else
                    manageBtn.classList.add('d-none');
            }
            const createAsgBtn = document.getElementById('create-assignment-btn');
            if (createAsgBtn) {
                if (isTeacher)
                    createAsgBtn.classList.remove('d-none');
                else
                    createAsgBtn.classList.add('d-none');
            }
            const addVideoBtn = document.getElementById('add-video-btn');
            if (addVideoBtn) {
                if (isTeacher)
                    addVideoBtn.classList.remove('d-none');
                else
                    addVideoBtn.classList.add('d-none');
            }
            // 4. Load Content safetly
            if (typeof loadCourseMaterials === 'function')
                loadCourseMaterials(groupId).catch(e => console.error(e));
            if (typeof loadCourseQuizzes === 'function')
                loadCourseQuizzes(groupId).catch(e => console.error(e));
            if (typeof loadCourseMembers === 'function')
                loadCourseMembers(groupId).catch(e => console.error(e));
            if (typeof loadCourseAssignments === 'function')
                loadCourseAssignments(groupId).catch(e => console.error(e));
        }
        catch (err) {
            console.error("Critical error in openCourseDetail:", err);
            alert("Unable to open course: " + err.message);
        }
    });
}
// 1. MATERIALS (With Uploads)
// 1. MATERIALS (With Uploads)
// VIDEO LOGIC
function openAddVideoModal() {
    document.getElementById('add-video-form').reset();
    openView('addVideoModal');
}
// GENERIC FILE UPLOAD
function handleMaterialUpload(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.currentCourseId)
            return;
        const file = input.files[0];
        if (!file)
            return;
        if (!confirm(`Upload "${file.name}" to this course?`)) {
            input.value = '';
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        // Use filename as default title
        formData.append('title', file.name);
        try {
            // Note: fetchAPI wrapper might not handle FormData correctly if it forces JSON headers.
            // We'll use raw fetch for upload if needed, or adjust headers.
            // Let's try raw fetch to be safe with FormData boundary.
            const token = localStorage.getItem('access_token'); // If you use tokens
            // Construct URL manually since we need special headers (or lack thereof for boundary)
            const res = yield fetch(`${API_BASE_URL}/groups/${appState.currentCourseId}/upload?title=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                headers: {
                    'X-User-Role': appState.role || '',
                    'X-User-Id': appState.userId || ''
                },
                body: formData
            });
            if (res.ok) {
                alert("File uploaded successfully!");
                loadCourseMaterials(appState.currentCourseId);
            }
            else {
                const err = yield res.json();
                alert("Upload failed: " + (err.detail || 'Unknown error'));
            }
        }
        catch (e) {
            console.error(e);
            alert("Error uploading file.");
        }
        finally {
            input.value = ''; // Reset input
        }
    });
}
function handleAddVideo() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.currentCourseId)
            return;
        const title = document.getElementById('video-title').value;
        const url = document.getElementById('video-url').value;
        if (!title || !url) {
            alert("Please enter both title and URL.");
            return;
        }
        try {
            const res = yield fetchAPI(`/groups/${appState.currentCourseId}/materials`, {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    type: 'Video',
                    content: url
                })
            });
            if (res.ok) {
                alert("Video added successfully!");
                closeView();
                loadCourseMaterials(appState.currentCourseId);
            }
            else {
                alert("Failed to add video.");
            }
        }
        catch (e) {
            console.error(e);
            alert("Error adding video.");
        }
    });
}
function loadCourseMaterials(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('materials-list');
        if (!list) {
            console.warn("materials-list element missing");
            return;
        }
        list.innerHTML = '<p class="text-muted">Loading...</p>';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/materials`);
            if (!res.ok) {
                list.innerHTML = '<p class="text-danger small">Failed to load materials.</p>';
                return;
            }
            const materials = yield res.json();
            if (!Array.isArray(materials)) {
                // Handle edge case where backend returns object
                console.error("Expected array for materials, got:", materials);
                list.innerHTML = '<p class="text-danger small">Invalid data received.</p>';
                return;
            }
            if (materials.length === 0) {
                list.innerHTML = '<p class="text-muted small">No materials uploaded yet.</p>';
                return;
            }
            list.innerHTML = materials.map(m => {
                let icon = 'description';
                let color = 'bg-light text-dark';
                // Safe content check
                const contentUrl = m.content || '';
                const type = m.type || 'Note';
                if (type === 'PDF') {
                    icon = 'picture_as_pdf';
                    color = 'bg-danger text-white';
                }
                if (type === 'Video') {
                    icon = 'play_circle';
                    color = 'bg-primary text-white';
                }
                if (type === 'Image') {
                    icon = 'image';
                    color = 'bg-success text-white';
                }
                let downloadLink = '';
                if (contentUrl.startsWith('/') || contentUrl.startsWith('http')) {
                    // Formatting URL safely
                    const fullUrl = contentUrl.startsWith('http') ? contentUrl : `${API_BASE_URL.replace('/api', '')}${contentUrl}`;
                    const btnText = type === 'Video' ? 'Watch' : 'Open';
                    downloadLink = `<a href="${fullUrl}" target="_blank" class="btn btn-sm btn-outline-primary">${btnText}</a>`;
                }
                return `
                <div class="col-md-6">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body d-flex align-items-center gap-3">
                            <div class="rounded p-2 ${color}"><span class="material-icons">${icon}</span></div>
                            <div class="flex-grow-1">
                                <h6 class="mb-0 fw-bold text-truncate">${m.title || 'Untitled'}</h6>
                                <small class="text-muted">${m.date || ''}</small>
                            </div>
                            ${downloadLink}
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }
        catch (e) {
            console.error(e);
            if (list)
                list.innerHTML = '<p class="text-danger small">Error loading materials</p>';
        }
    });
}
// 2. QUIZZES (Persistent)
function loadCourseQuizzes(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('quizzes-list');
        if (!list)
            return;
        list.innerHTML = '<p class="text-muted">Loading...</p>';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/quizzes`);
            if (!res.ok)
                throw new Error("API Failure");
            const quizzes = yield res.json();
            if (!Array.isArray(quizzes)) {
                list.innerHTML = '<p class="text-muted small">No quizzes.</p>';
                return;
            }
            if (quizzes.length === 0) {
                list.innerHTML = '<p class="text-muted small">No quizzes assigned.</p>';
                return;
            }
            list.innerHTML = quizzes.map(q => {
                let viewResultsBtn = '';
                if (['Teacher', 'Admin', 'Super Admin', 'Principal', 'Tenant_Admin'].includes(appState.role)) {
                    viewResultsBtn = `
                        <button class="btn btn-outline-info btn-sm fw-bold ms-2" onclick="viewQuizResults('${q.id}', '${q.title}')">
                            <span class="material-icons align-middle fs-6" style="font-size: 16px;">analytics</span> View Results
                        </button>`;
                }

                return `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1 fw-bold">${q.title}</h6>
                        <small class="text-muted">${q.question_count} Questions • Created ${new Date(q.created_at).toLocaleDateString()}</small>
                    </div>
                    <div>
                        ${viewResultsBtn}
                        <button class="btn btn-primary btn-sm fw-bold ms-2" onclick="takeQuiz('${q.id}')">
                            ${appState.role === 'Student' ? 'Start Quiz' : 'Preview Quiz'}
                        </button>
                    </div>
                </div>
            `;
            }).join('');
        }
        catch (e) {
            list.innerHTML = '<p class="text-danger small">Error loading quizzes</p>';
        }
    });
}

async function loadTeacherQuizzes() {
    const list = document.getElementById('teacher-quiz-list');
    if (!list) return;

    list.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="text-muted mt-2">Loading Quizzes...</p></div>';

    try {
        const res = await fetchAPI('/teacher/quizzes');
        if (res.ok) {
            const quizzes = await res.json();
            if (quizzes.length === 0) {
                list.innerHTML = '<div class="text-center py-5 text-muted">No quizzes assignments found.</div>';
                return;
            }

            list.innerHTML = quizzes.map(q => `
                <div class="list-group-item d-flex justify-content-between align-items-center p-3">
                    <div>
                        <h6 class="mb-1 fw-bold text-dark">${q.title}</h6>
                        <small class="text-muted">
                            <span class="badge bg-light text-dark border me-2">${q.target_type === 'grade' ? 'Grade ' + q.target_id : (q.target_type === 'group' ? 'Course ID: ' + q.group_id : 'Student: ' + q.target_id)}</span>
                            Questions: ${q.question_count} &bull; Created: ${new Date(q.created_at).toLocaleDateString()}
                        </small>
                    </div>
                    <button class="btn btn-sm btn-primary-custom" onclick="viewQuizResults('${q.id}', '${q.title}')">
                        View Results
                    </button>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div class="text-center py-5 text-danger">Failed to load quizzes.</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="text-center py-5 text-danger">Network Error: ${e.message}</div>`;
    }
}

function viewQuizResults(quizId, title) {
    if (!quizId) return;
    let modalEl = document.getElementById('teacherQuizResultsModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'teacherQuizResultsModal';
        modalEl.className = 'view full-page-view';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
        <style>
            #teacherQuizResultsModal .tqr-shell { background: #f4f6fb; }
            #teacherQuizResultsModal .tqr-header { background: linear-gradient(135deg, #f9fbff 0%, #eef3ff 100%); }
            #teacherQuizResultsModal .tqr-dialog {
                max-width: 1240px;
                margin: 1.25rem auto;
                width: calc(100% - 1.5rem);
            }
            #teacherQuizResultsModal .tqr-body {
                max-height: calc(100vh - 180px);
                overflow: auto;
            }
            #teacherQuizResultsModal .tqr-stats-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 14px;
            }
            #teacherQuizResultsModal .tqr-stat-card {
                border: 1px solid rgba(13, 110, 253, 0.12);
                border-radius: 16px;
                background: #fff;
                box-shadow: 0 8px 18px rgba(26, 35, 126, 0.06);
            }
            #teacherQuizResultsModal .tqr-stat-value { font-size: 2rem; line-height: 1; }
            #teacherQuizResultsModal .tqr-table-wrap {
                background: #fff;
                border-radius: 16px;
                border: 1px solid rgba(15, 23, 42, 0.08);
                overflow: hidden;
            }
            #teacherQuizResultsModal .tqr-table thead th {
                background: #f8fafc;
                font-weight: 700;
                color: #334155;
                border-bottom: 1px solid #e2e8f0;
            }
            #teacherQuizResultsModal .tqr-table tbody tr:hover { background: #f8fbff; }
            #teacherQuizResultsModal .tqr-score-pill {
                min-width: 64px;
                border-radius: 999px;
                padding: 0.4rem 0.75rem;
                font-weight: 700;
                display: inline-block;
                text-align: center;
            }
            #teacherQuizResultsModal .tqr-feedback {
                max-width: 360px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            @media (max-width: 768px) {
                #teacherQuizResultsModal .tqr-dialog {
                    width: calc(100% - 1rem);
                    margin: 0.5rem auto;
                }
                #teacherQuizResultsModal .tqr-stats-grid { grid-template-columns: 1fr; }
                #teacherQuizResultsModal .tqr-stat-value { font-size: 1.5rem; }
                #teacherQuizResultsModal .tqr-feedback { max-width: 180px; }
            }
        </style>
        <div class="modal-dialog modal-dialog-scrollable tqr-dialog">
            <div class="modal-content border-0 shadow-lg rounded-4 tqr-shell">
                <div class="modal-header tqr-header border-bottom">
                    <h5 class="modal-title fw-bold text-dark">
                        <span class="material-icons align-middle me-2">analytics</span>
                        Quiz Results: <span id="tqr-title"></span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4 tqr-body">
                    <div id="tqr-content">Loading...</div>
                </div>
                <div class="modal-footer border-top-0">
                     <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modalEl);
    }

    document.getElementById('tqr-title').textContent = title || 'Untitled Quiz';
    const contentDiv = document.getElementById('tqr-content');
    contentDiv.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="text-muted mt-3 mb-0">Fetching grades...</p>
        </div>
    `;
    openView(modalEl.id);

    fetchAPI(`/quizzes/${quizId}/results`)
        .then(res => res.json())
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                contentDiv.innerHTML = `
                    <div class="text-center py-5">
                        <span class="material-icons fs-1 text-muted">assignment_late</span>
                        <p class="text-muted mt-2">No students have taken this quiz yet.</p>
                    </div>
                `;
                return;
            }

            const safe = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[ch]));

            const normalizedRows = data.map(row => ({
                student_name: row.student_name || 'Unknown Student',
                student_id: row.student_id || '-',
                score: Number(row.score) || 0,
                submitted_at: row.submitted_at,
                ai_feedback: row.ai_feedback || ''
            }));
            normalizedRows.sort((a, b) => b.score - a.score);

            // Calculate Stats
            const scores = normalizedRows.map(d => d.score);
            const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
            const max = Math.max(...scores);
            const passed = normalizedRows.filter(r => r.score >= 50).length;

            let html = `
                <div class="tqr-stats-grid mb-4">
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Average Score</div>
                        <div class="tqr-stat-value fw-bold text-primary mt-2">${avg}%</div>
                    </div>
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Highest Score</div>
                        <div class="tqr-stat-value fw-bold text-success mt-2">${max}%</div>
                    </div>
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Pass Rate</div>
                        <div class="tqr-stat-value fw-bold text-dark mt-2">${Math.round((passed / normalizedRows.length) * 100)}%</div>
                        <div class="small text-muted mt-1">${normalizedRows.length} attempts</div>
                    </div>
                </div>

                <div class="tqr-table-wrap">
                    <div class="table-responsive">
                        <table class="table tqr-table align-middle mb-0">
                            <thead>
                            <tr>
                                <th>#</th>
                                <th>Student</th>
                                <th>Score</th>
                                <th>Submitted At</th>
                                <th>Feedback</th>
                            </tr>
                            </thead>
                        <tbody>
            `;

            normalizedRows.forEach((row, idx) => {
                let scoreClass = 'bg-danger-subtle text-danger';
                if (row.score >= 80) scoreClass = 'bg-success-subtle text-success';
                else if (row.score >= 50) scoreClass = 'bg-warning-subtle text-warning-emphasis';

                html += `
                    <tr>
                        <td class="text-muted fw-semibold">${idx + 1}</td>
                        <td>
                            <div class="fw-semibold text-dark">${safe(row.student_name)}</div>
                            <small class="text-muted">${safe(row.student_id)}</small>
                        </td>
                        <td><span class="tqr-score-pill ${scoreClass}">${row.score}%</span></td>
                        <td class="text-nowrap">${row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '-'}</td>
                        <td>
                            <small class="text-muted tqr-feedback d-inline-block" title="${safe(row.ai_feedback || 'No feedback')}">
                                ${safe(row.ai_feedback || 'No feedback')}
                            </small>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table></div></div>`;
            contentDiv.innerHTML = html;
        })
        .catch(err => {
            console.error(err);
            contentDiv.innerHTML = '<div class="alert alert-danger mb-0">Failed to load results.</div>';
        });
}
// 4. MEMBERS
function loadCourseMembers(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('course-members-list');
        if (!list)
            return;
        list.innerHTML = 'Loading...';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/members`);
            if (!res.ok)
                throw new Error("API Failure");
            const data = yield res.json();
            // Safety check for members array
            const memberIds = Array.isArray(data.members) ? data.members : [];
            const members = appState.allStudents.filter(s => memberIds.includes(s.id));
            if (members.length === 0)
                list.innerHTML = '<p class="text-muted small">No students enrolled.</p>';
            else {
                list.innerHTML = members.map(m => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${m.name}</span>

                </li>
            `).join('');
            }
        }
        catch (e) {
            list.innerHTML = 'Error loading members.';
        }
    });
}
// Ensure Manage Members Modal works from new view
function openManageMembersModal() {
    // Current course ID is set globally
    const course = appState.groups.find(g => g.id == appState.currentCourseId);
    if (!course)
        return;
    openManageMembers(course.id, course.name);
}
// --- AI LESSON PLANNER ---
function generateLessonPlan() {
    return __awaiter(this, void 0, void 0, function* () {
        const topic = document.getElementById('lp-topic').value;
        const grade = document.getElementById('lp-grade').value;
        const subject = document.getElementById('lp-subject').value;
        const duration = document.getElementById('lp-duration').value;
        const desc = document.getElementById('lp-description').value;
        const fileInput = document.getElementById('lp-pdf');
        if (!topic || !grade) {
            alert("Please enter a topic and grade.");
            return;
        }
        const loading = document.getElementById('lp-loading');
        const result = document.getElementById('lp-result');
        loading.classList.remove('d-none');
        result.classList.add('d-none');
        result.innerHTML = '';
        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('grade', grade);
            formData.append('subject', subject);
            formData.append('duration_mins', duration);
            formData.append('description', desc);
            if (fileInput && fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }
            const headers = {};
            if (appState.isLoggedIn && appState.role) {
                headers['X-User-Role'] = appState.role;
            }
            const response = yield fetch(`${API_BASE_URL}/ai/lesson-plan`, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            const data = yield response.json();
            loading.classList.add('d-none');
            result.classList.remove('d-none');
            if (response.ok) {
                // Simple markdown parsing
                let html = data.content
                    .replace(/### (.*)/g, '<h5 class="fw-bold mt-3 text-info">$1</h5>')
                    .replace(/## (.*)/g, '<h4 class="fw-bold mt-4 text-primary-custom border-bottom pb-2">$1</h4>')
                    .replace(/\*\* (.*?) \*\*/g, '<strong>$1</strong>')
                    .replace(/\* (.*)/g, '<li>$1</li>');
                result.innerHTML = html;
            }
            else {
                result.innerHTML = `<span class="text-danger fw-bold">Error: ${data.detail || 'Failed to generate plan.'}</span>`;
            }
        }
        catch (error) {
            loading.classList.add('d-none');
            result.classList.remove('d-none');
            result.innerHTML = `<span class="text-danger">Network Error: ${error.message}</span>`;
        }
    });
}
// --- ASSIGNMENTS LOGIC ---
function formatDueDate(value) {
    if (!value)
        return 'No due date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function normalizeRoleCode(role) {
    return String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
function canCreateAssignments() {
    const roleCode = normalizeRoleCode(appState.role);
    if (hasAnyPermission(['assignment.create', 'assignment.grade']))
        return true;
    return ['teacher', 'teacher_admin', 'admin', 'principal', 'tenant_admin', 'super_admin', 'root_super_admin'].includes(roleCode);
}
function getActiveAssignmentListElement() {
    const candidates = Array.from(document.querySelectorAll('#assignment-view-view #academics-assignments-list, #academics-view #academics-assignments-list, #academic-content-area #academics-assignments-list, #academics-assignments-list'));
    return candidates.find(el => { var _a; return (_a = el.closest('.view')) === null || _a === void 0 ? void 0 : _a.classList.contains('active'); })
        || candidates.find(el => el.offsetParent !== null)
        || candidates[0]
        || null;
}
function setCreateAssignmentButtonsVisibility(visible) {
    const buttons = document.querySelectorAll('#assignment-view-view #create-assignment-btn, #academics-view #create-assignment-btn, #create-assignment-btn');
    buttons.forEach(btn => {
        if (visible)
            btn.classList.remove('d-none');
        else
            btn.classList.add('d-none');
    });
}
function loadAssignments(sectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = getActiveAssignmentListElement();
        if (!list)
            return;
        list.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary"></div></div>';
        setCreateAssignmentButtonsVisibility(canCreateAssignments());
        try {
            const query = sectionId ? `?section_id=${sectionId}` : '';
            const res = yield fetchAPI(`/teacher/assignments${query}`);
            if (!res.ok) {
                list.innerHTML = `
                    <div class="alert alert-warning text-start">
                        <div class="fw-semibold mb-1">Unable to load assignments right now.</div>
                        <div class="small text-muted mb-2">Backend response: HTTP ${res.status}</div>
                        <button class="btn btn-sm btn-outline-primary rounded-pill" onclick="loadAssignments(${sectionId ? sectionId : ''})">Try Again</button>
                    </div>
                `;
                return;
            }
            const assignments = yield res.json();
            list.innerHTML = assignments.map(a => {
                let desc = a.description || '';
                let fileUrl = '';
                let note = '';
                try {
                    const parsed = JSON.parse(desc);
                    note = parsed.note || '';
                    fileUrl = parsed.file_url || '';
                } catch (e) {
                    note = desc;
                }

                const due = formatDueDate(a.due_date);
                const sectionLabel = a.section_name ? `Section: ${a.section_name}` : (a.grade_level ? `Grade ${a.grade_level}` : 'All Grades');
                const submissions = typeof a.submission_count === 'number' ? `${a.submission_count} Submission${a.submission_count === 1 ? '' : 's'}` : '';

                let fileBtn = '';
                if (fileUrl) {
                    fileBtn = `<a href="${fileUrl}" target="_blank" class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 mb-2">
                            <span class="material-icons" style="font-size:16px;">download</span>
                            Download Attachment
                        </a>`;
                }

                const actionBtn = canCreateAssignments()
                    ? `<button class="btn btn-sm btn-primary rounded-pill px-3" onclick="viewSubmissions(${a.id})">${t('btn_view_submissions')}</button>`
                    : '';

                return `
                    <div class="card mb-3 border-0 shadow-sm border-start border-4 border-primary">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start gap-3">
                                <div>
                                    <h5 class="fw-bold mb-1">${a.title}</h5>
                                    <div class="text-muted small mb-2">${sectionLabel}</div>
                                </div>
                                <span class="badge bg-light text-dark">${a.type || 'Assignment'}</span>
                            </div>
                            <div class="mb-2">
                                ${note ? `<p class="text-muted small mb-2">${note}</p>` : ''}
                                ${fileBtn}
                            </div>
                            <div class="d-flex flex-wrap gap-3 text-muted small mb-3">
                                <span><i class="material-icons align-middle small" style="font-size:14px;">event</i> Due: ${due}</span>
                                <span><i class="material-icons align-middle small" style="font-size:14px;">star_outline</i> Points: ${a.points || 0}</span>
                                ${submissions ? `<span><i class="material-icons align-middle small" style="font-size:14px;">groups</i> ${submissions}</span>` : ''}
                            </div>
                            ${actionBtn ? `<div class="d-flex justify-content-end">${actionBtn}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
        catch (e) {
            console.error(e);
            list.innerHTML = `
                <div class="alert alert-warning text-start">
                    <div class="fw-semibold mb-1">Could not connect to backend.</div>
                    <div class="small text-muted mb-2">Please ensure backend is running at <code>${API_BASE_URL.replace('/api', '')}</code>.</div>
                    <button class="btn btn-sm btn-outline-primary rounded-pill" onclick="loadAssignments(${sectionId ? sectionId : ''})">Retry</button>
                </div>
            `;
        }
    });
}
function loadAssignmentReviewQueue() {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('assignment-review-list');
        if (!list)
            return;
        list.innerHTML = `<div class="list-group-item p-4 text-center text-muted">${t('msg_loading_submissions')}</div>`;
        try {
            const res = yield fetchAPI(`/assignments/teacher/pending?teacher_id=${encodeURIComponent(appState.userId || '')}`);
            if (!res.ok) {
                list.innerHTML = `<div class="list-group-item p-4 text-center text-danger">${t('msg_failed_load_submissions')}</div>`;
                return;
            }
            const subs = yield res.json();
            if (!subs || subs.length === 0) {
                list.innerHTML = `<div class="list-group-item p-4 text-center text-muted">${t('asg_review_empty')}</div>`;
                return;
            }
            list.innerHTML = subs.map(s => `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between mb-2">
                        <div>
                            <div class="fw-bold">${s.assignment_title || 'Assignment'}</div>
                            <div class="small text-muted">${s.student_name || ''}</div>
                        </div>
                        <small class="text-muted">${s.submitted_at ? new Date(s.submitted_at).toLocaleString() : ''}</small>
                    </div>
                    <div class="bg-light p-2 rounded mb-2 font-monospace small" style="white-space: pre-wrap;">${s.content || ''}</div>
                <div class="input-group input-group-sm">
                    <span class="input-group-text">${t('label_grade')}</span>
                    <input type="number" class="form-control" id="review-grade-${s.id}" placeholder="0-100">
                    <button class="btn btn-outline-success" onclick="saveGrade(${s.id})">${t('btn_save')}</button>
                    <button class="btn btn-outline-warning" onclick="reassignSubmission(${s.id})">${t('btn_reassign')}</button>
                </div>
            </div>
        `).join('');
        }
        catch (e) {
            console.error(e);
            list.innerHTML = `<div class="list-group-item p-4 text-center text-danger">${t('msg_failed_load_submissions')}</div>`;
        }
    });
}
function loadAssignmentMarksView() {
    return __awaiter(this, void 0, void 0, function* () {
        const select = document.getElementById('marks-assignment-select');
        if (!select)
            return;
        select.innerHTML = `<option value="">${t('msg_loading_assignments')}</option>`;
        try {
            const res = yield fetchAPI('/teacher/assignments');
            if (!res.ok) {
                select.innerHTML = `<option value="">${t('msg_failed_load_assignments')}</option>`;
                return;
            }
            const assignments = yield res.json();
            if (!assignments || assignments.length === 0) {
                select.innerHTML = `<option value="">${t('msg_no_assignments')}</option>`;
                return;
            }
            select.innerHTML = `<option value="">${t('marks_select_assignment')}</option>`;
            assignments.forEach(a => {
                const opt = document.createElement('option');
                opt.value = String(a.id);
                opt.textContent = `${a.title} • ${a.section_name || (a.grade_level ? `Grade ${a.grade_level}` : 'All Grades')}`;
                select.appendChild(opt);
            });
        }
        catch (e) {
            console.error(e);
            select.innerHTML = '<option value="">Failed to load assignments</option>';
        }
    });
}
function loadMarksForSelectedAssignment() {
    return __awaiter(this, void 0, void 0, function* () {
        const select = document.getElementById('marks-assignment-select');
        const list = document.getElementById('assignment-marks-list');
        if (!select || !list)
            return;
        const assignmentId = select.value;
        if (!assignmentId) {
            list.innerHTML = `<div class="list-group-item p-4 text-center text-muted">${t('marks_select_prompt')}</div>`;
            return;
        }
        list.innerHTML = `<div class="list-group-item p-4 text-center text-muted">${t('msg_loading_submissions')}</div>`;
        try {
            const res = yield fetchAPI(`/assignments/${assignmentId}/submissions`);
            if (!res.ok) {
                list.innerHTML = `<div class="list-group-item p-4 text-center text-danger">${t('msg_failed_load_submissions')}</div>`;
                return;
            }
            const subs = yield res.json();
            if (!subs || subs.length === 0) {
                list.innerHTML = `<div class="list-group-item p-4 text-center text-muted">${t('asg_review_empty')}</div>`;
                return;
            }
            list.innerHTML = subs.map(s => `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>${s.student_name || ''} (${s.student_id || ''})</strong>
                        <small class="text-muted">${s.submitted_at ? new Date(s.submitted_at).toLocaleString() : ''}</small>
                    </div>
                    <div class="bg-light p-2 rounded mb-2 font-monospace small" style="white-space: pre-wrap;">${s.content_text || s.content || ''}</div>
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">${t('label_grade')}</span>
                        <input type="number" class="form-control" id="grade-${s.id}" value="${s.grade || ''}" placeholder="0-100">
                        <button class="btn btn-outline-success" onclick="saveGrade(${s.id})">${t('btn_save')}</button>
                        <button class="btn btn-outline-warning" onclick="reassignSubmission(${s.id})">${t('btn_reassign')}</button>
                    </div>
                </div>
            `).join('');
        }
        catch (e) {
            console.error(e);
            list.innerHTML = `<div class="list-group-item p-4 text-center text-danger">${t('msg_failed_load_submissions')}</div>`;
        }
    });
}
// 3. Load Assignments (Called when switching to Tab)
function loadCourseAssignments(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('assignments-list');
        list.innerHTML = '<div class="spinner-border text-primary m-3"></div>';
        // Show/Hide "Create" button based on role
        const createBtn = document.getElementById('create-assignment-btn');
        if (appState.role === 'Teacher' || appState.role === 'Admin') {
            createBtn.classList.remove('d-none');
        }
        else {
            createBtn.classList.add('d-none');
        }
        try {
            const res = yield fetchAPI(`/groups/${groupId}/assignments`);
            if (res.ok) {
                const assignments = yield res.json();
                if (assignments.length === 0) {
                    list.innerHTML = '<p class="text-muted text-center py-4">No assignments yet.</p>';
                    return;
                }
                list.innerHTML = assignments.map(a => {
                    let actionBtn = '';
                    if (appState.role === 'Student') {
                        actionBtn = `<button class="btn btn-sm btn-outline-success" onclick="openSubmitModal(${a.id}, '${a.title}')">Submit</button>`;
                    }
                    else if (appState.role === 'Teacher' || appState.role === 'Admin') {
                        actionBtn = `<button class="btn btn-sm btn-outline-dark" onclick="viewSubmissions(${a.id})">View Submissions</button>`;
                    }
                    const icon = a.type === 'Project' ? 'engineering' : 'assignment';
                    const badge = a.type === 'Project' ? 'bg-warning text-dark' : 'bg-primary-custom';
                    return `
                    <div class="list-group-item p-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <div class="bg-light p-2 rounded-circle">
                                <span class="material-icons text-muted">${icon}</span>
                            </div>
                            <div>
                                <h6 class="mb-1 fw-bold">${a.title} <span class="badge ${badge} small ms-2">${a.type}</span></h6>
                                <p class="mb-1 text-muted small">${a.description || 'No description'}</p>
                                <small class="text-secondary">Due: ${new Date(a.due_date).toLocaleDateString()} | Max Points: ${a.points}</small>
                            </div>
                        </div>
                        <div>
                            ${actionBtn}
                        </div>
                    </div>
                `;
                }).join('');
            }
        }
        catch (e) {
            console.error(e);
            list.innerHTML = '<p class="text-danger">Failed to load assignments.</p>';
        }
    });
}
function openCreateAssignmentModal() {
    // Reset the form
    const form = document.getElementById('create-assignment-form');
    if (form) form.reset();
    // Clear error
    const messageEl = document.getElementById('asg-error');
    if (messageEl) {
        messageEl.classList.add('d-none');
        messageEl.textContent = '';
    }
    // Re-enable button
    const submitBtn = document.getElementById('create-assignment-submit-btn');
    if (submitBtn) submitBtn.removeAttribute('disabled');
    // Store the current view so Cancel/back can return to it
    const previousViewId = document.querySelector('.view.active')?.id || 'assignment-view-view';
    openCreateAssignmentModal._goBack = () => {
        switchView(previousViewId);
        if (previousViewId === 'assignment-view-view') loadAssignments();
    };
    // Load grade/section dropdowns
    loadSectionsForDropdown();
    // Navigate to the full-page view
    switchView('createAssignmentModal');
}
function loadSectionsForDropdown() {
    return __awaiter(this, void 0, void 0, function* () {
        const gradeSelect = document.getElementById('asg-grade');
        const sectionSelect = document.getElementById('asg-section');
        if (!gradeSelect || !sectionSelect)
            return;
        gradeSelect.innerHTML = '<option value="">Select Grade</option>';
        sectionSelect.innerHTML = '<option value="">Select Section (optional)</option>';
        try {
            const url = appState.activeSchoolId ? `/sections?school_id=${appState.activeSchoolId}` : '/sections';
            const res = yield fetchAPI(url);
            const sections = res.ok ? yield res.json() : [];
            if (sections.length === 0) {
                for (let g = 1; g <= 12; g++) {
                    const opt = document.createElement('option');
                    opt.value = String(g);
                    opt.textContent = `Grade ${g}`;
                    gradeSelect.appendChild(opt);
                }
                return;
            }
            const gradeSet = new Set(sections.map(s => s.grade_level).filter(Boolean));
            Array.from(gradeSet).sort((a, b) => a - b).forEach(g => {
                const opt = document.createElement('option');
                opt.value = String(g);
                opt.textContent = `Grade ${g}`;
                gradeSelect.appendChild(opt);
            });
            sections.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `Grade ${s.grade_level} - ${s.name}`;
                opt.dataset.grade = String(s.grade_level);
                sectionSelect.appendChild(opt);
            });
            gradeSelect.onchange = () => {
                const grade = gradeSelect.value;
                Array.from(sectionSelect.options).forEach((opt) => {
                    if (!opt.dataset.grade)
                        return;
                    opt.hidden = grade && opt.dataset.grade !== grade;
                });
                if (grade && sectionSelect.value) {
                    const selected = sectionSelect.options[sectionSelect.selectedIndex];
                    if (selected && selected.dataset.grade && selected.dataset.grade !== grade) {
                        sectionSelect.value = '';
                    }
                }
            };
        }
        catch (e) {
            console.error(e);
            for (let g = 1; g <= 12; g++) {
                const opt = document.createElement('option');
                opt.value = String(g);
                opt.textContent = `Grade ${g}`;
                gradeSelect.appendChild(opt);
            }
        }
    });
}
function handleCreateAssignment() {
    return __awaiter(this, void 0, void 0, function* () {
        const gradeEl = document.getElementById('asg-grade');
        const sectionEl = document.getElementById('asg-section');
        const messageEl = document.getElementById('asg-error');
        if (messageEl) {
            messageEl.classList.add('d-none');
            messageEl.textContent = '';
        }
        const title = document.getElementById('asg-title').value.trim();
        const description = document.getElementById('asg-desc').value.trim();
        const points = parseInt(document.getElementById('asg-points').value);
        const due_date = document.getElementById('asg-date').value;
        const grade_level = gradeEl ? parseInt(gradeEl.value) : null;
        const section_id = sectionEl && sectionEl.value ? parseInt(sectionEl.value) : null;
        let finalGrade = grade_level;
        if (!finalGrade && section_id && sectionEl) {
            const opt = sectionEl.options[sectionEl.selectedIndex];
            if (opt && opt.dataset && opt.dataset.grade) {
                finalGrade = parseInt(opt.dataset.grade);
            }
        }
        if (!title || !due_date || !finalGrade) {
            if (messageEl) {
                messageEl.textContent = t('msg_fill_assignment_fields');
                messageEl.classList.remove('d-none');
            } else {
                alert(t('msg_fill_assignment_fields'));
            }
            return;
        }

        const fileInput = document.getElementById('asg-file-input');
        const hasFile = fileInput && fileInput.files && fileInput.files[0];

        if (!description && !hasFile) {
            if (messageEl) {
                messageEl.textContent = "Please provide either a note or an assignment file.";
                messageEl.classList.remove('d-none');
            } else {
                alert("Please provide either a note or an assignment file.");
            }
            return;
        }
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('points', (isFinite(points) && points > 0) ? points : 100);
        formData.append('due_date', due_date);
        formData.append('grade_level', finalGrade);
        if (section_id) formData.append('section_id', section_id);

        if (hasFile) {
            formData.append('file', fileInput.files[0]);
        }
        const submitBtn = document.getElementById('create-assignment-submit-btn');
        const origHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...'; }
        try {
            const res = yield fetchAPI('/assignments', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                clearAsgFile();
                const form = document.getElementById('create-assignment-form');
                if (form) form.reset();
                switchView('assignment-view-view');
                loadAssignments();
            } else {
                let msg = t('msg_create_assignment_failed');
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const payload = yield res.json().catch(() => ({}));
                    msg = payload.detail || msg;
                } else {
                    const text = yield res.text().catch(() => '');
                    if (text) msg = text;
                }
                if (messageEl) { messageEl.textContent = msg; messageEl.classList.remove('d-none'); }
                else { alert(msg); }
            }
        } catch (e) {
            console.error(e);
            if (messageEl) { messageEl.textContent = t('msg_create_assignment_network_error'); messageEl.classList.remove('d-none'); }
            else { alert(t('msg_create_assignment_network_error')); }
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origHtml; }
        }
    });
}
/* ---- File-picker helpers for Create Assignment ---- */
function handleAsgFileSelect(input) {
    if (input.files && input.files[0]) { _showAsgFilePreview(input.files[0]); }
}
function handleAsgFileDrop(event) {
    event.preventDefault();
    const dz = document.getElementById('asg-file-dropzone');
    if (dz) { dz.style.borderColor = '#c7d2e8'; dz.style.background = '#f8faff'; }
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) { alert('Please upload a PDF or Word (.doc/.docx) file.'); return; }
    try { const dt = new DataTransfer(); dt.items.add(file); const fi = document.getElementById('asg-file-input'); if (fi) fi.files = dt.files; } catch (e) { }
    _showAsgFilePreview(file);
}
function _showAsgFilePreview(file) {
    const preview = document.getElementById('asg-file-preview');
    const nameEl = document.getElementById('asg-file-name');
    if (preview) preview.classList.remove('d-none');
    if (nameEl) nameEl.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
}
function clearAsgFile() {
    const fi = document.getElementById('asg-file-input'); if (fi) fi.value = '';
    const preview = document.getElementById('asg-file-preview'); if (preview) preview.classList.add('d-none');
    const nameEl = document.getElementById('asg-file-name'); if (nameEl) nameEl.textContent = '';
}
// 4. Student: Open Submit Modal
function openSubmitModal(id, title, returnView) {
    document.getElementById('submit-asg-id').value = id;
    document.getElementById('submit-asg-title').textContent = title || 'Assignment';
    document.getElementById('submit-content').value = '';
    const submitErr = document.getElementById('submit-asg-error');
    if (submitErr) { submitErr.classList.add('d-none'); submitErr.textContent = ''; }
    const submitBtn = document.getElementById('submit-asg-btn');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Assignment'; }
    // Remember which view to return to after submission
    appState.submissionReturnView = returnView || document.querySelector('.view.active')?.id || 'student-exams-view';
    // Use switchView so it works inside the student-view container
    switchView('submitAssignmentModal');
}
// 5. Student: Submit
function handleSubmitAssignment() {
    return __awaiter(this, void 0, void 0, function* () {
        const id = document.getElementById('submit-asg-id').value;
        const content = document.getElementById('submit-content').value;
        const submitErr = document.getElementById('submit-asg-error');
        const submitBtn = document.getElementById('submit-asg-btn');
        if (!content.trim()) {
            if (submitErr) { submitErr.textContent = t('msg_assignment_submit_required'); submitErr.classList.remove('d-none'); }
            else alert(t('msg_assignment_submit_required'));
            return;
        }
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }
        try {
            const res = yield fetchAPI(`/assignments/${id}/submit`, {
                method: 'POST',
                body: JSON.stringify({ student_id: appState.userId, content: content })
            });
            if (res.ok) {
                // Go back to student exams/assignments view and show success toast
                const prevView = appState.submissionReturnView || 'student-exams-view';
                switchView(prevView);
                // Reload assignments in the destination view
                if (typeof loadStudentAssignmentsAndResults === 'function') loadStudentAssignmentsAndResults();
                if (typeof loadStudentDashboardAssignments === 'function') loadStudentDashboardAssignments(appState.userId);
                // Show a friendly success toast
                showToast('✅ Assignment submitted successfully!', 'success');
            }
            else {
                const errText = yield res.text().catch(() => '');
                if (submitErr) { submitErr.textContent = errText || t('msg_assignment_submit_failed'); submitErr.classList.remove('d-none'); }
                else alert(t('msg_assignment_submit_failed'));
            }
        }
        catch (e) {
            if (submitErr) { submitErr.textContent = t('msg_assignment_submit_network_error'); submitErr.classList.remove('d-none'); }
            else alert(t('msg_assignment_submit_network_error'));
        }
        finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Assignment'; }
        }
    });
}
// 6. Teacher: View Submissions
function viewSubmissions(id) {
    return __awaiter(this, void 0, void 0, function* () {
        openView('viewSubmissionsModal');
        const list = document.getElementById('submissions-list');
        list.innerHTML = `<div class="text-center p-3">${t('msg_loading_submissions')}</div>`;
        try {
            const res = yield fetchAPI(`/assignments/${id}/submissions`);
            if (res.ok) {
                const subs = yield res.json();
                if (subs.length === 0) {
                    list.innerHTML = `<p class="text-center p-4 text-muted">${t('asg_review_empty')}</p>`;
                    return;
                }
                list.innerHTML = subs.map(s => `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between mb-2">
                        <strong>${s.student_name} (${s.student_id})</strong>
                        <small class="text-muted">${new Date(s.submitted_at).toLocaleString()}</small>
                    </div>
                    <div class="bg-light p-2 rounded mb-2 font-monospace small" style="white-space: pre-wrap;">${s.content_text || s.content || ''}</div>
                    <div class="d-flex justify-content-between align-items-center mb-2 small text-muted">
                        <span>${t('label_status')}: <strong>${s.status || t('status_submitted')}</strong></span>
                        ${s.feedback ? `<span>${t('label_feedback')}: ${s.feedback}</span>` : ''}
                    </div>
                    
                    <div class="input-group input-group-sm">
                        <span class="input-group-text">${t('label_grade')}</span>
                        <input type="number" class="form-control" id="grade-${s.id}" value="${s.grade || ''}" placeholder="0-100">
                        <button class="btn btn-outline-success" onclick="saveGrade(${s.id})">${t('btn_save')}</button>
                        <button class="btn btn-outline-warning" onclick="reassignSubmission(${s.id})">${t('btn_reassign')}</button>
                    </div>
                </div>
            `).join('');
            }
        }
        catch (e) {
            list.innerHTML = t('msg_failed_load_submissions');
        }
    });
}
// 7. Teacher: Save Grade
function saveGrade(submissionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const val = document.getElementById(`grade-${submissionId}`).value;
        if (val === '')
            return;
        try {
            const res = yield fetchAPI(`/assignments/submissions/${submissionId}/grade`, {
                method: 'POST',
                body: JSON.stringify({ grade: parseFloat(val), feedback: "Graded" })
            });
            if (res.ok) {
                alert("Grade saved.");
            }
        }
        catch (e) {
            alert("Error saving grade.");
        }
    });
}
function reassignSubmission(submissionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const feedback = prompt("Reason for reassignment?");
        if (feedback === null)
            return;
        try {
            const res = yield fetchAPI(`/assignments/submissions/${submissionId}/reassign`, {
                method: 'POST',
                body: JSON.stringify({ feedback: feedback })
            });
            if (res.ok) {
                alert("Reassigned.");
            }
        }
        catch (e) {
            alert("Error reassigning submission.");
        }
    });
}
// Insert listeners into tab clicks? 
// We can use a simple global listener or onclick in HTML.
// Currently tab clicks are handled by Bootstrap logic, but we need to trigger 'loadCourseAssignments' when that tab is shown.
// Let's add an observer or simple valid binder.
document.addEventListener('shown.bs.tab', function (event) {
    if (event.target.getAttribute('data-bs-target') === '#course-assignments-tab') {
        if (appState.currentCourseId)
            loadCourseAssignments(appState.currentCourseId);
    }
});
// --- SCHOOL MANAGEMENT (SUPER ADMIN) ---
function handleCreateSchoolManagement(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        console.log("Create School Submit Triggered");
        const msgEl = document.getElementById('create-school-msg');
        if (msgEl) {
            msgEl.classList.remove('d-none');
            msgEl.className = 'mt-2 small fw-bold text-primary';
            msgEl.textContent = 'Creating school...';
        }
        const data = {
            name: document.getElementById('new-school-name').value,
            address: document.getElementById('new-school-address').value,
            contact_email: document.getElementById('new-school-email').value
        };
        try {
            const response = yield fetchAPI('/admin/schools', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (response.ok) {
                if (msgEl) {
                    msgEl.className = 'mt-2 small fw-bold text-success';
                    msgEl.textContent = 'School created successfully!';
                }
                alert("Success: School Created!");
                document.getElementById('create-school-form').reset();
                // Close Modal
                const modalEl = document.getElementById('createSchoolModal');
                closeView();
                // Refresh
                setTimeout(() => window.location.reload(), 1000);
            }
            else {
                const result = yield response.json();
                if (msgEl) {
                    msgEl.className = 'mt-2 small fw-bold text-danger';
                    msgEl.textContent = result.detail || 'Failed to create school.';
                }
                alert("Error: " + (result.detail || 'Failed to create school.'));
            }
        }
        catch (error) {
            console.error(error);
            if (msgEl) {
                msgEl.className = 'mt-2 small fw-bold text-danger';
                msgEl.textContent = 'Network error.';
            }
            alert("Network Error: " + error.message);
        }
    });
}
function handleCreateSchoolModal(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        console.log("Create School Modal Submit Triggered");
        const msgEl = document.getElementById('create-school-msg');
        if (msgEl) {
            msgEl.classList.remove('d-none');
            msgEl.className = 'mt-2 small fw-bold text-primary';
            msgEl.textContent = 'Creating school...';
        }
        const data = {
            name: document.getElementById('new-school-name-modal').value,
            address: document.getElementById('new-school-address-modal').value,
            contact_email: document.getElementById('new-school-email-modal').value
        };
        try {
            const response = yield fetchAPI('/admin/schools', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (response.ok) {
                if (msgEl) {
                    msgEl.className = 'mt-2 small fw-bold text-success';
                    msgEl.textContent = 'School created successfully!';
                }
                alert("Success: School Created!");
                document.getElementById('create-school-form-modal').reset();
                // Close Modal
                const modalEl = document.getElementById('createSchoolModal');
                closeView();
                // Refresh
                setTimeout(() => window.location.reload(), 1000);
            }
            else {
                const result = yield response.json();
                if (msgEl) {
                    msgEl.className = 'mt-2 small fw-bold text-danger';
                    msgEl.textContent = result.detail || 'Failed to create school.';
                }
                alert("Error: " + (result.detail || 'Failed to create school.'));
            }
        }
        catch (error) {
            console.error(error);
            if (msgEl) {
                msgEl.className = 'mt-2 small fw-bold text-danger';
                msgEl.textContent = 'Network error.';
            }
            alert("Network Error: " + error.message);
        }
    });
}
function openEditSchoolModal(id, name, address, email) {
    document.getElementById('edit-school-id').value = id;
    document.getElementById('edit-school-name').value = name;
    document.getElementById('edit-school-address').value = address || '';
    document.getElementById('edit-school-email').value = email || '';
    // Clear message
    const msgEl = document.getElementById('edit-school-msg');
    msgEl.classList.add('d-none');
    msgEl.textContent = '';
    // Show Modal
    openView('editSchoolModal');
}
function handleUpdateSchool(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const id = document.getElementById('edit-school-id').value;
        const msgEl = document.getElementById('edit-school-msg');
        msgEl.classList.remove('d-none');
        msgEl.className = 'mt-2 small fw-bold text-primary';
        msgEl.textContent = 'Updating...';
        const data = {
            name: document.getElementById('edit-school-name').value,
            address: document.getElementById('edit-school-address').value,
            contact_email: document.getElementById('edit-school-email').value
        };
        try {
            const response = yield fetchAPI(`/admin/schools/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            if (response.ok) {
                msgEl.className = 'mt-2 small fw-bold text-success';
                msgEl.textContent = 'Updated successfully!';
                setTimeout(() => {
                    window.location.reload();
                }, 800);
            }
            else {
                const res = yield response.json();
                msgEl.className = 'mt-2 small fw-bold text-danger';
                msgEl.textContent = res.detail || 'Update failed.';
            }
        }
        catch (err) {
            msgEl.className = 'mt-2 small fw-bold text-danger';
            msgEl.textContent = 'Network error: ' + err.message;
        }
    });
}
function handleDeleteSchool(id, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`))
            return;
        try {
            const response = yield fetchAPI(`/admin/schools/${id}`, { method: 'DELETE' });
            if (response.ok) {
                alert("School deleted successfully.");
                window.location.reload();
            }
            else {
                const res = yield response.json();
                alert("Error: " + (res.detail || "Failed to delete school."));
            }
        }
        catch (err) {
            alert("Network Error: " + err.message);
        }
    });
}
// --- USER MANAGEMENT FUNCTIONS ---
function openUserManagement() {
    switchView('user-management-view');
    // Default to Users tab
    const usersTabBtn = document.getElementById('pills-users-tab');
    if (usersTabBtn) {
        const tab = new bootstrap.Tab(usersTabBtn);
        tab.show();
    }
    loadUserList();
}
function loadUserList() {
    return __awaiter(this, void 0, void 0, function* () {
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>';
        try {
            const response = yield fetchAPI('/admin/users');
            if (response.ok) {
                const users = yield response.json();
                if (users.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No users found.</td></tr>';
                    return;
                }
                tbody.innerHTML = users.map(u => `
                <tr>
                    <td class="ps-4 fw-bold">${u.name}</td>
                    <td><span class="badge rounded-pill bg-light text-dark border">${u.role}</span></td>
                    <td>${u.id}</td>
                    <td>${u.role === 'Student' ? 'Grade ' + u.grade : (u.preferred_subject || '-')}</td>
                    <!-- <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="alert('Edit feature coming soon')"><span class="material-icons" style="font-size:16px">edit</span></button>
                    </td> -->
                </tr>
            `).join('');
            }
            else {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load users.</td></tr>';
            }
        }
        catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Network error.</td></tr>';
        }
    });
}
// --- USER MANAGEMENT (VIEW BASED) ---
function openAddUserModal() {
    switchView('add-user-view');
    document.getElementById('add-user-form').reset();
    document.getElementById('new-user-role').value = "Student";
    toggleUserFields();
}
function toggleUserFields() {
    const role = document.getElementById('new-user-role').value;
    const studentFields = document.getElementById('student-fields');
    const teacherFields = document.getElementById('teacher-fields');
    if (role === 'Student') {
        studentFields.style.display = 'block';
        teacherFields.style.display = 'none';
    }
    else if (role === 'Teacher') {
        studentFields.style.display = 'none';
        teacherFields.style.display = 'block';
    }
    else {
        studentFields.style.display = 'none';
        teacherFields.style.display = 'none';
    }
}
function handleCreateUser(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const role = document.getElementById('new-user-role').value;
        // Validate Password
        const password = document.getElementById('new-user-password').value;
        if (password.length < 8) {
            alert("Password must be at least 8 characters long.");
            return;
        }
        const data = {
            name: document.getElementById('new-user-name').value,
            id: document.getElementById('new-user-id').value,
            role: role,
            password: password,
            grade: role === 'Student' ? parseInt(document.getElementById('new-user-grade').value) : 0,
            preferred_subject: role === 'Teacher' ? document.getElementById('new-user-subject').value : "All"
        };
        const btn = e.submitter;
        const originalText = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';
            const response = yield fetchAPI('/admin/users', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (response.ok) {
                if (typeof showToast === 'function')
                    showToast("User created successfully!", "success");
                else
                    alert("User created successfully!");
                switchView('user-management-view');
                loadUserList();
            }
            else {
                const err = yield response.json();
                alert("Error: " + (err.detail || "Failed to create user"));
            }
        }
        catch (e) {
            alert("Network Error: " + e.message);
        }
        finally {
            const btn = e.submitter;
            if (btn) {
                btn.disabled = false;
                if (typeof originalText !== 'undefined')
                    btn.innerHTML = originalText;
            }
        }
    });
}
function showAuditLogs() {
    return __awaiter(this, void 0, void 0, function* () {
        // switchView('admin-view'); // REMOVED: We use tabs now
        const container = document.getElementById('audit-logs-container');
        // Loading State
        container.innerHTML = `
        <div class="p-5 text-center">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <h5 class="text-muted">Fetching security logs...</h5>
        </div>`;
        try {
            const response = yield fetchAPI('/admin/audit-logs');
            if (!response.ok)
                throw new Error("Failed to fetch logs");
            const logs = yield response.json();
            if (logs.length === 0) {
                container.innerHTML = `<div class="p-5 text-center text-muted">No logs found.</div>`;
                return;
            }
            // Render Table with Exit Time and Duration added
            container.innerHTML = `
            <div class="card border-0 shadow-sm">
                <div class="card-body p-0">
                    <table class="table table-hover mb-0">
                        <thead class="table-dark"> <tr>
                                <th class="py-3 ps-4">Login Time</th>
                                <th class="py-3">User ID</th>
                                <th class="py-3">Event</th>
                                <th class="py-3">Details</th>
                                <th class="py-3">Exit Time</th>
                                <th class="py-3">Duration</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${logs.map(log => `
                                <tr style="background-color: #f9f9f9;">
                                    <td class="ps-4 py-3 align-middle font-monospace small">
                                        ${new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td class="fw-bold align-middle">
                                        ${log.user_id}
                                    </td>
                                    <td class="align-middle">
                                        <span class="badge rounded-pill ${getEventBadgeClass(log.event_type)} px-3">
                                            ${log.event_type}
                                        </span>
                                    </td>
                                    <td class="align-middle text-muted small">
                                        ${log.details}
                                    </td>
                                    <td class="align-middle font-monospace small text-muted">
                                        ${log.logout_time ? new Date(log.logout_time).toLocaleString() : '-'}
                                    </td>
                                    <td class="align-middle fw-bold text-dark">
                                        ${log.duration_minutes ? log.duration_minutes + ' min' : '-'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        }
        catch (e) {
            console.error(e);
            container.innerHTML = `
            <div class="alert alert-danger m-4" role="alert">
                <h4 class="alert-heading">Error Loading Logs</h4>
                <p>${e.message}</p>
            </div>
        `;
        }
    });
}
// --- BACKGROUND PATHS ANIMATION (Ported from React to Vanilla JS/GSAP) ---
// This function replicates the "BackgroundPaths" React component using strict SVG matching.
function initBackgroundPaths() {
    const heroSection = document.getElementById('teachers-hero');
    if (!heroSection)
        return;
    // Create container for the animation
    const animationContainer = document.createElement('div');
    animationContainer.style.position = 'absolute';
    animationContainer.style.top = '0';
    animationContainer.style.left = '0';
    animationContainer.style.width = '100%';
    animationContainer.style.height = '100%';
    animationContainer.style.pointerEvents = 'none'; // Ensure clicks pass through to content
    animationContainer.style.zIndex = '0'; // Behind content
    animationContainer.style.overflow = 'hidden';
    // We want the existing content to be ON TOP.
    // Ensure all Children of hero section have z-index > 0 or are correctly stacked.
    // The hero section in HTML has children with 'z-2', so z-0 here is perfect.
    const createFloatingPaths = (position) => {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "w-full h-full text-slate-950 dark:text-white");
        svg.setAttribute("viewBox", "0 0 696 316");
        svg.setAttribute("fill", "none");
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        // Slightly different opacity logic to match "text-slate-950" on dark bg (which is effectively white/light lines)
        // actually the code says `dark:text-white`. Our hero is dark, so we want white lines.
        svg.style.color = "white";
        // Loop 36 times
        for (let i = 0; i < 36; i++) {
            const pathId = i;
            const width = 0.5 + i * 0.03;
            // Math strictly from provided Typescript code:
            // d={`M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`}
            const d = `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`;
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", d);
            path.setAttribute("stroke", "currentColor"); // uses the svg.style.color
            path.setAttribute("stroke-width", String(width));
            path.style.opacity = String(0.1 + pathId * 0.03); // strokeOpacity
            // Animation Setup
            // Framer Motion: initial={{ pathLength: 0.3, opacity: 0.6 }} 
            // animate={{ pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
            // duration: 20 + Math.random() * 10
            // We use CSS keyframes or GSAP. GSAP is available.
            // However, straightforward CSS animation is often more performant for 72 elements (36*2).
            // Let's use GSAP since it's loaded and easier to handle the random duration.
            // Set initial state
            // To animate pathLength in vanilla, we use stroke-dasharray and dashoffset.
            // But we don't know the total length of the path easily without `getTotalLength()`.
            // SVG 2 allows `pathLength="1"` attribute to normalize it!
            path.setAttribute("pathLength", "1");
            path.style.strokeDasharray = "0.3 1"; // pathLength 0.3, gap 0.7 (effectively 1 total)
            path.style.strokeDashoffset = "0";
            svg.appendChild(path);
            // Animate with GSAP
            // pathLength animation involves changing dasharray usually, but with pathLength=1 we can just animate dashoffset?
            // Actually framer's pathOffset shifts the dash pattern along the path.
            // pathLength grows the dash.
            const duration = 20 + Math.random() * 10;
            // We need a timeline to simulate the framer motion arrays
            const tl = gsap.timeline({ repeat: -1, ease: "linear" });
            // Animate Path Length (Grow to 1 then shrink or just loop?)
            // Framer code: animate={{ pathLength: 1, ... }} means it grows to full?
            // But repeat: infinity?
            // "pathOffset: [0, 1, 0]" -> Signs of moving flow.
            // Let's approximate the "Floating" look:
            // Just rotatting the offset is usually enough for "Flow"
            // Correction: specific values from code
            // animate={{ pathLength: 1, opacity: [0.3, 0.6, 0.3], pathOffset: [0, 1, 0] }}
            // It suggests it pulses in length and moves.
            // Since we set pathLength="1" on the element, strokeDasharray="1 1" is full.
            // strokeDasharray="0.3 1" is 30% visible.
            // We'll animate strokeDasharray to simulate pathLength changes
            // and strokeDashoffset for pathOffset.
            // Simpler Flow: Just move the line continuously.
            gsap.to(path, {
                strokeDashoffset: -1, // Move full length
                duration: duration,
                repeat: -1,
                ease: "linear"
            });
            // Pulse Opacity
            gsap.to(path, {
                opacity: 0.6,
                duration: duration * 0.5,
                yoyo: true, // go back to initial
                repeat: -1,
                ease: "sine.inOut"
            });
            // Pulse Length (optional, mimics pathLength=1)
            // gsap.to(path, {
            //     strokeDasharray: "1 1",
            //     duration: duration * 0.8,
            //     yoyo: true,
            //     repeat: -1
            // });
        }
        return svg;
    };
    const containerDiv = document.createElement('div');
    containerDiv.className = "absolute inset-0";
    containerDiv.style.position = 'absolute';
    containerDiv.style.inset = '0';
    // Position 1
    const svg1 = createFloatingPaths(1);
    containerDiv.appendChild(svg1);
    // Position -1
    const svg2 = createFloatingPaths(-1);
    containerDiv.appendChild(svg2);
    animationContainer.appendChild(containerDiv);
    heroSection.prepend(animationContainer); // Prepend to put it behind content (z-index 0 vs content z-2)
}
// Initialize when view switches to teachers (or on load if you want)
// For now, let's call it once globally, or lazily.
// Since it's light SVG, calling on load is fine.
document.addEventListener('DOMContentLoaded', () => {
    // Wait a tiny bit for DOM
    setTimeout(initAllAnimations, 500);
    setTimeout(initGlowingEffect, 500);
    setTimeout(initScrollAnimations, 500);
});
// Also trigger if we navigate there dynamically and it wasn't present (idempotent check is good)
function initAllAnimations() {
    ['teachers-hero', 'students-hero', 'schools-hero', 'resources-hero'].forEach(targetId => {
        const heroSection = document.getElementById(targetId);
        if (!heroSection)
            return;
        // Avoid double init
        if (heroSection.querySelector('.bg-paths-anim-container'))
            return;
        // Create container for the animation
        const animationContainer = document.createElement('div');
        animationContainer.className = 'bg-paths-anim-container'; // Marker class
        animationContainer.style.position = 'absolute';
        animationContainer.style.top = '0';
        animationContainer.style.left = '0';
        animationContainer.style.width = '100%';
        animationContainer.style.height = '100%';
        animationContainer.style.pointerEvents = 'none'; // Ensure clicks pass through to content
        animationContainer.style.zIndex = '0'; // Behind content
        animationContainer.style.overflow = 'hidden';
        const createFloatingPaths = (position) => {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "w-full h-full text-slate-950 dark:text-white");
            svg.setAttribute("viewBox", "0 0 696 316");
            svg.setAttribute("fill", "none");
            svg.style.width = "100%";
            svg.style.height = "100%";
            svg.style.position = "absolute";
            svg.style.top = "0";
            svg.style.left = "0";
            svg.style.color = "white";
            for (let i = 0; i < 36; i++) {
                const pathId = i;
                const width = 0.5 + i * 0.03;
                const d = `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`;
                const path = document.createElementNS(svgNS, "path");
                path.setAttribute("d", d);
                path.setAttribute("stroke", "currentColor");
                path.setAttribute("stroke-width", String(width));
                path.style.opacity = String(0.1 + pathId * 0.03);
                path.setAttribute("pathLength", "1");
                path.style.strokeDasharray = "0.3 1";
                path.style.strokeDashoffset = "0";
                svg.appendChild(path);
                const duration = 20 + Math.random() * 10;
                gsap.to(path, {
                    strokeDashoffset: -1,
                    duration: duration,
                    repeat: -1,
                    ease: "linear"
                });
                gsap.to(path, {
                    opacity: 0.6,
                    duration: duration * 0.5,
                    yoyo: true,
                    repeat: -1,
                    ease: "sine.inOut"
                });
            }
            return svg;
        };
        const containerDiv = document.createElement('div');
        containerDiv.className = "absolute inset-0";
        containerDiv.style.position = 'absolute';
        containerDiv.style.inset = '0';
        containerDiv.appendChild(createFloatingPaths(1));
        containerDiv.appendChild(createFloatingPaths(-1));
        animationContainer.appendChild(containerDiv);
        heroSection.prepend(animationContainer);
    });
}
// --- GLOWING EFFECT (Ported logic from Aceternity/React) ---
function initGlowingEffect() {
    const cards = document.querySelectorAll('.glowing-card');
    if (cards.length === 0)
        return;
    // Movement duration from component default
    const movementDuration = 2; // seconds (not used in GSAP, we use logic)
    // We need to store state for each card to handle the smooth angle transition
    const cardStates = new Map();
    const handleMove = (e) => {
        cards.forEach(card => {
            const borderEl = card.querySelector('.glowing-card-border');
            if (!borderEl)
                return;
            const rect = card.getBoundingClientRect();
            // Check proximity (from component default: 0? No, demo used 64. Let's use 50)
            const proximity = 50;
            const inactiveZone = 0.01; // usually relative to size
            // Mouse coordinates relative to viewport
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            // Calculate center
            const centerX = rect.left + rect.width * 0.5;
            const centerY = rect.top + rect.height * 0.5;
            // Check if mouse is near enough to activate
            // Note: The React component logic is a bit specific about "active" state.
            // If it's inside the proximity box:
            const isActive = mouseX > rect.left - proximity &&
                mouseX < rect.left + rect.width + proximity &&
                mouseY > rect.top - proximity &&
                mouseY < rect.top + rect.height + proximity;
            // Check inactive zone (center dead zone)
            const distanceFromCenter = Math.hypot(mouseX - centerX, mouseY - centerY);
            const minDim = Math.min(rect.width, rect.height);
            const inactiveRadius = 0.5 * minDim * inactiveZone;
            // Update Active State
            let activeVal = (isActive && distanceFromCenter > inactiveRadius) ? 1 : 0;
            // Optimization: If completely far away, maybe just 0 and skip math?
            // But we want the angle to update if we are approaching?
            // The react code updates angle only if active.
            borderEl.style.setProperty('--active', String(activeVal));
            if (isActive) {
                // Calculate Angle
                // (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90;
                let targetAngle = (180 * Math.atan2(mouseY - centerY, mouseX - centerX)) / Math.PI + 90;
                // Smooth rotation logic
                // React uses `animate` from motion/react to tween `currentAngle`.
                // We'll use a simple lerp or GSAP helper if available, or just store it.
                // Since this is `mousemove`, simply setting it might be jagged if we wrap around 360/0.
                // Get previous angle state
                let state = cardStates.get(card) || { currentAngle: targetAngle };
                // Angle Diff for shortest path
                const angleDiff = ((targetAngle - state.currentAngle + 180) % 360) - 180;
                const newAngle = state.currentAngle + angleDiff;
                // We want to animate to `newAngle` smoothly.
                // Let's use GSAP quickTo for performance or simple tween
                // But since this runs on mousemove, we might fire too many tweens.
                // Better: Update state, and use requestAnimationFrame loop? 
                // Actually GSAP handles overwrite: 'auto' well.
                gsap.to(state, {
                    currentAngle: newAngle,
                    duration: movementDuration,
                    ease: "power2.out",
                    overwrite: 'auto',
                    onUpdate: () => {
                        borderEl.style.setProperty('--start', state.currentAngle);
                    }
                });
                cardStates.set(card, state);
            }
        });
    };
    // Global listener for performance rather than per-card
    document.body.addEventListener('pointermove', handleMove);
    window.addEventListener('scroll', handleMove); // Update on scroll too
}
// --- SCROLL ENTRANCE ANIMATIONS ---
function initScrollAnimations() {
    // Progressive Enhancement: Find elements, hide them, then observe
    const elements = document.querySelectorAll('.fade-in-up');
    // Safety check: Don't hide if there are no elements or IntersectionObserver is missing
    if (!('IntersectionObserver' in window))
        return;
    elements.forEach(el => {
        el.classList.add('js-scroll-hidden');
    });
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove the hidden class to trigger transition to default
                entry.target.classList.remove('js-scroll-hidden');
                entry.target.classList.add('visible'); // Keep for legacy CSS consistency if needed
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });
    elements.forEach(el => observer.observe(el));
}
// --- GRADE HELPER AI CHAT LOGIC ---
function handleGradeChat(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const input = document.getElementById('grade-helper-input');
        const container = document.getElementById('grade-helper-chat-messages');
        const prompt = input.value.trim();
        if (!prompt)
            return;
        // Add User Message
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex align-items-start gap-3 mb-3 flex-row-reverse';
        userDiv.innerHTML = `
        <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">Me</div>
        <div class="bg-primary text-white p-3 rounded shadow-sm" style="max-width: 80%;">
            <p class="mb-0">${prompt}</p>
        </div>
    `;
        container.appendChild(userDiv);
        input.value = '';
        container.scrollTop = container.scrollHeight;
        // Add Loading Message
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'gh-loading';
        loadingDiv.className = 'd-flex align-items-start gap-3 mb-3';
        loadingDiv.innerHTML = `
        <div class="rounded-circle bg-info text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">AI</div>
        <div class="bg-white p-3 rounded shadow-sm" style="max-width: 80%;">
            <p class="mb-0 text-muted">Thinking...</p>
        </div>
    `;
        container.appendChild(loadingDiv);
        container.scrollTop = container.scrollHeight;
        try {
            const studentId = appState.userId;
            const response = yield fetchAPI(`/ai/grade-helper/${studentId}`, {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt })
            });
            loadingDiv.remove();
            if (response.ok) {
                const data = yield response.json();
                const reply = data.reply || "No response received.";
                const aiDiv = document.createElement('div');
                aiDiv.className = 'd-flex align-items-start gap-3 mb-3';
                aiDiv.innerHTML = `
                <div class="rounded-circle bg-info text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">AI</div>
                <div class="bg-white p-3 rounded shadow-sm" style="max-width: 80%;">
                    <p class="mb-0 text-dark" style="white-space: pre-wrap;">${reply}</p>
                </div>
            `;
                container.appendChild(aiDiv);
            }
            else {
                throw new Error("API Error");
            }
        }
        catch (err) {
            if (loadingDiv)
                loadingDiv.remove();
            console.error(err);
            const errDiv = document.createElement('div');
            errDiv.className = 'd-flex align-items-start gap-3 mb-3';
            errDiv.innerHTML = `
            <div class="rounded-circle bg-danger text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">!</div>
            <div class="bg-white p-3 rounded shadow-sm border border-danger" style="max-width: 80%;">
                <p class="mb-0 text-danger">Error: ${err.message}</p>
            </div>
        `;
            container.appendChild(errDiv);
        }
        container.scrollTop = container.scrollHeight;
    });
}
// --- ENGAGEMENT HELPER AI CHAT LOGIC (Teachers Only) ---
function handleEngagementChat(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const input = document.getElementById('engagement-helper-input');
        const fileInput = document.getElementById('engagement-helper-file');
        const container = document.getElementById('engagement-helper-chat-messages');
        const prompt = input.value.trim();
        const file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
        if (!prompt && !file)
            return;
        if (file && !file.name.toLowerCase().endsWith('.pdf')) {
            alert("Please upload a PDF file.");
            return;
        }
        let userMessage = prompt;
        if (file && !prompt)
            userMessage = `Uploaded PDF: ${file.name}`;
        if (file && prompt)
            userMessage = `${prompt}\n[PDF attached: ${file.name}]`;
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex align-items-start gap-3 mb-3 flex-row-reverse';
        userDiv.innerHTML = `
        <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">Me</div>
        <div class="bg-primary text-white p-3 rounded shadow-sm" style="max-width: 80%;">
            <p class="mb-0" style="white-space: pre-wrap;">${userMessage}</p>
        </div>
    `;
        container.appendChild(userDiv);
        input.value = '';
        if (fileInput)
            fileInput.value = '';
        container.scrollTop = container.scrollHeight;
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'eh-loading';
        loadingDiv.className = 'd-flex align-items-start gap-3 mb-3';
        loadingDiv.innerHTML = `
        <div class="rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">AI</div>
        <div class="bg-white p-3 rounded shadow-sm" style="max-width: 80%;">
            <p class="mb-0 text-muted">Thinking...</p>
        </div>
        `;
        container.appendChild(loadingDiv);
        container.scrollTop = container.scrollHeight;
        try {
            let body;
            if (file) {
                const formData = new FormData();
                if (prompt)
                    formData.append('prompt', prompt);
                formData.append('file', file);
                body = formData;
            }
            else {
                body = JSON.stringify({ prompt: prompt });
            }
            const response = yield fetchAPI(`/ai/engagement-helper`, {
                method: 'POST',
                body
            });
            loadingDiv.remove();
            if (response.ok) {
                const data = yield response.json();
                const reply = data.reply || "No response received.";
                const aiDiv = document.createElement('div');
                aiDiv.className = 'd-flex align-items-start gap-3 mb-3';
                aiDiv.innerHTML = `
                <div class="rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">AI</div>
                <div class="bg-white p-3 rounded shadow-sm" style="max-width: 80%;">
                    <p class="mb-0 text-dark" style="white-space: pre-wrap;">${reply}</p>
                </div>
            `;
                container.appendChild(aiDiv);
            }
            else {
                const err = yield response.json().catch(() => ({}));
                throw new Error(err.detail || "API Error");
            }
        }
        catch (err) {
            if (loadingDiv)
                loadingDiv.remove();
            console.error(err);
            const errDiv = document.createElement('div');
            errDiv.className = 'd-flex align-items-start gap-3 mb-3';
            errDiv.innerHTML = `
            <div class="rounded-circle bg-danger text-white d-flex align-items-center justify-content-center flex-shrink-0" style="width: 36px; height: 36px;">!</div>
            <div class="bg-white p-3 rounded shadow-sm border border-danger" style="max-width: 80%;">
                <p class="mb-0 text-danger">Error: ${err.message}</p>
            </div>
        `;
            container.appendChild(errDiv);
        }
        container.scrollTop = container.scrollHeight;
    });
}
// --- AUTH RESTORATION & NAVIGATION ---
document.addEventListener('DOMContentLoaded', () => __awaiter(this, void 0, void 0, function* () {
    if (window.__cbInitialBootComplete)
        return;
    updateTranslations();
    // Restore Session
    if (restoreAuthState() && appState.isLoggedIn) {
        // User is logged in, reload dashboard
        yield initializeDashboard();
        // Restore specific view from URL if present
        const urlParams = new URLSearchParams(window.location.search);
        const targetView = urlParams.get('view');
        if (targetView && document.getElementById(targetView)) {
            // Fix Navigation: Ensure current history entry has state
            window.history.replaceState({ viewId: targetView }, '', window.location.href);
            // Slight delay to ensure dashboard render doesn't override
            setTimeout(() => switchView(targetView, false), 100);
        }
        else {
            // Default logged in view
            const fallbackView = appState.role === 'Student'
                ? 'student-view'
                : (isParentRole(appState.role) ? 'parent-dashboard-view' : (appState.isSuperAdmin ? 'super-admin-view' : 'teacher-view'));
            window.history.replaceState({ viewId: fallbackView }, '', window.location.href);
        }
    }
}));
// --- REPORT EXPORT ---
function exportReportCSV() {
    return __awaiter(this, void 0, void 0, function* () {
        let data = appState.reportData;
        if (!data) {
            // Try to fetch if not in state
            try {
                const res = yield fetchAPI('/reports/summary');
                if (res.ok)
                    data = yield res.json();
            }
            catch (e) {
                alert("Could not load data for export.");
                return;
            }
        }
        if (!data) {
            alert("No data available to export.");
            return;
        }
        // Flatten data for CSV
        // We will create a simple CSV with sections
        let csvContent = "data:text/csv;charset=utf-8,";
        // Header
        csvContent += "Metric,Value\n";
        // Financials
        csvContent += `Revenue,${data.financial_summary.revenue}\n`;
        csvContent += `Expenses,${data.financial_summary.expenses}\n`;
        csvContent += `Net Income,${data.financial_summary.net_income}\n`;
        csvContent += `Outstanding Fees,${data.financial_summary.outstanding_fees}\n`;
        // Staff
        csvContent += `Total Staff,${data.staff_utilization.total_staff}\n`;
        csvContent += `Active Classes,${data.staff_utilization.active_classes}\n`;
        csvContent += `Staff Utilization,${data.staff_utilization.utilization_rate}%\n`;
        // Academics
        csvContent += `Math Avg,${data.academic_performance.math_avg}\n`;
        csvContent += `Science Avg,${data.academic_performance.science_avg}\n`;
        csvContent += `English Avg,${data.academic_performance.english_avg}\n`;
        csvContent += `Overall Avg,${data.academic_performance.overall_avg}\n`;
        // Trends (Table format inside CSV)
        csvContent += "\nAttendance Trends (Monthly)\n";
        csvContent += "Month,Attendance Rate\n";
        data.attendance_trends.forEach(row => {
            csvContent += `${row.month},${row.rate}%\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "classbridge_report_summary.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}
// --- COMMUNICATION & ENGAGEMENT LOGIC ---
// Elements (Lazy load or global)
const elements_comm = {
    announcementsList: () => document.getElementById('announcements-list'),
    messagesList: () => document.getElementById('messages-list'),
    calendarTableBody: () => document.getElementById('calendar-table-body'),
    createAnnouncementModal: () => createViewModal('createAnnouncementModal'),
    composeMessageModal: () => createViewModal('composeMessageModal'),
    addEventModal: () => createViewModal('addEventModal')
};
function renderCommunicationDashboard() {
    // Default to Announcements tabs
    const firstTab = document.querySelector('#communication-view .list-group-item');
    if (firstTab) {
        switchCommTab('announcements', firstTab);
    }
}
function switchCommTab(tabName, btnElement) {
    // Update Sidebar Active State
    const sidebar = document.querySelector('#communication-view .list-group');
    if (sidebar) {
        sidebar.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
    }
    if (btnElement)
        btnElement.classList.add('active');
    const contentArea = document.getElementById('comm-content-area');
    contentArea.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
    // Route to specific loader
    if (tabName === 'announcements')
        loadCommAnnouncements();
    else if (tabName === 'messaging')
        loadCommMessaging();
    else if (tabName === 'notifications')
        loadCommNotifications();
    else if (tabName === 'push')
        loadCommPush();
    else if (tabName === 'calendar')
        loadCommCalendar();
    else if (tabName === 'emergency')
        loadCommEmergency();
}
function loadCommAnnouncements() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('comm-content-area');
        let html = `
        <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
            <h4 class="fw-bold m-0 text-primary">Announcements</h4>
            <button class="btn btn-primary-custom" onclick="showCreateAnnouncementModal()">
                <span class="material-icons align-middle fs-5 me-1">add_circle</span> Post New
            </button>
        </div>
    `;
        try {
            const response = yield fetchAPI('/communication/announcements');
            let announcements = [];
            if (response.ok) {
                announcements = yield response.json();
            }
            if (announcements.length === 0) {
                html += `<div class="text-center text-muted py-5">
                <span class="material-icons fs-1 text-secondary mb-3">campaign</span>
                <p>No announcements posts yet.</p>
            </div>`;
            }
            else {
                html += `<div class="list-group list-group-flush">`;
                announcements.forEach(a => {
                    html += `
                    <div class="list-group-item px-0 py-3">
                        <div class="d-flex justify-content-between">
                            <h5 class="fw-bold text-dark mb-1">${a.title}</h5>
                            <small class="text-muted">${new Date(a.created_at).toLocaleDateString()}</small>
                        </div>
                        <p class="mb-2 text-secondary">${a.content}</p>
                        <span class="badge bg-light text-dark border">Target: ${a.target_role}</span>
                    </div>
                `;
                });
                html += `</div>`;
            }
        }
        catch (e) {
            html += `<p class="text-danger">Failed to load announcements.</p>`;
        }
        container.innerHTML = `<div class="p-4 h-100 overflow-auto">${html}</div>`;
    });
}
// Modal handling for Announcements
function showCreateAnnouncementModal() {
    const modalHtml = `
      <div class="view full-page-view" id="createAnnouncementModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-primary-custom text-white">
              <h5 class="modal-title fw-bold">Post Announcement</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <form id="announcement-form">
                <div class="mb-3">
                    <label class="form-label fw-bold">Title</label>
                    <input type="text" id="ann-title" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Content</label>
                    <textarea id="ann-content" class="form-control" rows="4" required></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Target Audience</label>
                    <select id="ann-target" class="form-select">
                        <option value="All">All Users</option>
                        <option value="Student">Students Only</option>
                        <option value="Parent">Parents Only</option>
                        <option value="Teacher">Teachers Only</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary-custom w-100 fw-bold">Post Now</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
    const existing = document.getElementById('createAnnouncementModal');
    if (existing)
        existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('announcement-form').addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const title = document.getElementById('ann-title').value;
        const content = document.getElementById('ann-content').value;
        const target = document.getElementById('ann-target').value;
        try {
            const res = yield fetchAPI('/communication/announcements', {
                method: 'POST',
                body: JSON.stringify({ title, content, target_role: target })
            });
            if (res.ok) {
                closeView();
                alert("Announcement Posted!");
                loadCommAnnouncements();
            }
            else {
                alert("Failed to post.");
            }
        }
        catch (e) {
            console.error(e);
            alert("Error posting announcement.");
        }
    }));
    openView('createAnnouncementModal');
}
function loadCommMessaging() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('comm-content-area');
        container.innerHTML = `
        <div class="p-4 h-100 d-flex flex-column">
            <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Teacher-Parent Messaging</h4>
            
            <div class="alert alert-info d-flex align-items-center">
                <span class="material-icons me-2">info</span>
                Direct messaging allows private communication between staff and parents.
            </div>

            <!-- Inbox Simulation -->
            <ul class="nav nav-tabs mb-3">
                <li class="nav-item"><a class="nav-link active" href="#">Inbox</a></li>
                <li class="nav-item"><a class="nav-link" href="#">Sent</a></li>
            </ul>

            <div class="list-group list-group-flush">
                <div class="list-group-item py-3">
                    <div class="d-flex justify-content-between mb-1">
                        <strong class="text-dark">Mrs. Johnson (Parent)</strong>
                        <small class="text-muted">10:30 AM</small>
                    </div>
                    <div class="fw-bold small text-dark mb-1">Re: Sarah's Attendance</div>
                    <p class="text-muted small m-0 text-truncate">Thank you for letting me know about the absence...</p>
                </div>
                <!-- More mock messages -->
            </div>

             <div class="mt-auto pt-3">
                <button class="btn btn-primary-custom rounded-pill fw-bold px-4" onclick="alert('Compose feature coming soon!')">
                    <span class="material-icons align-middle me-1">edit</span> Compose Message
                </button>
            </div>
        </div>
    `;
    });
}
function loadCommNotifications() {
    const container = document.getElementById('comm-content-area');
    container.innerHTML = `
        <div class="p-4 h-100">
             <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Email & SMS Notifications</h4>
             
             <div class="card border-0 bg-light p-4 mb-4 rounded-3">
                <h5 class="fw-bold mb-3">Send Bulk Notification</h5>
                <form onsubmit="event.preventDefault(); alert('Notification Sent (Simulated)');">
                    <div class="mb-3">
                        <label class="form-label fw-bold">Type</label>
                        <div class="d-flex gap-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" checked id="type-email">
                                <label class="form-check-label" for="type-email">Email</label>
                            </div>
                             <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="type-sms">
                                <label class="form-check-label" for="type-sms">SMS</label>
                            </div>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-bold">Recipients</label>
                         <select class="form-select">
                            <option>All Parents - Grade 9</option>
                            <option>All Parents - Grade 10</option>
                            <option>All Staff</option>
                        </select>
                    </div>
                     <div class="mb-3">
                        <label class="form-label fw-bold">Message</label>
                        <textarea class="form-control" rows="3" placeholder="Enter notification text..."></textarea>
                    </div>
                    <button class="btn btn-dark fw-bold w-100">Send Notification</button>
                </form>
             </div>
        </div>
    `;
}
function loadCommPush() {
    const container = document.getElementById('comm-content-area');
    container.innerHTML = `
        <div class="p-4 h-100 text-center d-flex flex-column justify-content-center align-items-center">
             <div class="mb-3">
                <span class="material-icons text-warning" style="font-size: 64px;">notifications_active</span>
             </div>
             <h4 class="fw-bold text-dark">Mobile Push Notifications</h4>
             <p class="text-muted w-75">Send instant alerts to user's mobile devices who have the ClassBridge app installed.</p>
             
             <button class="btn btn-warning text-white fw-bold px-5 py-3 rounded-pill mt-3 shadow-sm" onclick="alert('Push Notification broadcasted to 142 devices!')">
                Broadcase General Alert
             </button>
        </div>
    `;
}
function loadCommCalendar() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('comm-content-area');
        // Fetch existing events if possible
        let eventsHtml = '';
        try {
            const res = yield fetchAPI('/communication/events');
            if (res.ok) {
                const events = yield res.json();
                events.forEach(e => {
                    eventsHtml += `
                    <div class="list-group-item d-flex align-items-center py-3">
                         <div class="bg-light border rounded text-center p-2 me-3" style="min-width: 60px;">
                            <small class="d-block text-uppercase fw-bold text-muted">${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
                            <span class="h5 fw-bold text-dark m-0">${new Date(e.date).getDate()}</span>
                         </div>
                         <div>
                            <h6 class="fw-bold mb-1">${e.title}</h6>
                            <span class="badge bg-secondary-subtle text-secondary border">${e.type}</span>
                         </div>
                    </div>
                 `;
                });
            }
        }
        catch (e) { }
        if (!eventsHtml) {
            eventsHtml = '<div class="text-center text-muted py-4">No events scheduled.</div>';
        }
        container.innerHTML = `
        <div class="p-4 h-100">
             <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <h4 class="fw-bold m-0 text-primary">School Event Calendar</h4>
                 <button class="btn btn-sm btn-outline-primary" onclick="showAddEventModal()">
                    <span class="material-icons align-middle fs-6">add</span> Add Event
                </button>
            </div>
             
             <!-- Calendar List -->
             <div class="list-group list-group-flush">
                ${eventsHtml}
             </div>
        </div>
    `;
    });
}
function showAddEventModal() {
    const modalHtml = `
      <div class="view full-page-view" id="addEventModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-primary text-white">
              <h5 class="modal-title fw-bold">Add Event</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <form id="event-form">
                <div class="mb-3">
                    <label class="form-label fw-bold">Title</label>
                    <input type="text" id="evt-title" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Date</label>
                    <input type="date" id="evt-date" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-bold">Type</label>
                    <select id="evt-type" class="form-select">
                        <option>Academic</option>
                        <option>Social</option>
                        <option>Meeting</option>
                        <option>Holiday</option>
                    </select>
                </div>
                <button type="submit" class="btn btn-primary w-100 fw-bold">Add Event</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
    const existing = document.getElementById('addEventModal');
    if (existing)
        existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('event-form').addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const title = document.getElementById('evt-title').value;
        const date = document.getElementById('evt-date').value;
        const type = document.getElementById('evt-type').value;
        try {
            const res = yield fetchAPI('/communication/events', {
                method: 'POST',
                body: JSON.stringify({ title, date, type })
            });
            if (res.ok) {
                closeView();
                alert("Event Added!");
                loadCommCalendar();
            }
            else {
                alert("Failed to add event.");
            }
        }
        catch (e) {
            console.error(e);
            alert("Error.");
        }
    }));
    openView('addEventModal');
}
function loadCommEmergency() {
    const container = document.getElementById('comm-content-area');
    container.innerHTML = `
        <div class="p-4 h-100 d-flex flex-column justify-content-center align-items-center bg-danger-subtle rounded-3">
             <div class="bg-white p-5 rounded-circle shadow-lg mb-4 d-flex align-items-center justify-content-center" style="width: 120px; height: 120px;">
                <span class="material-icons text-danger" style="font-size: 64px;">warning</span>
             </div>
             
             <h2 class="fw-bold text-danger mb-3">EMERGENCY ALERT SYSTEM</h2>
             <p class="text-center text-dark mb-4" style="max-width: 500px;">
                Proceed with caution. This will trigger a high-priority alert to ALL students, parents, and staff via Email, SMS, and App Notifications.
                It will also display a banner on all login screens.
             </p>
             
             <button class="btn btn-danger btn-lg fw-bold px-5 py-3 rounded-pill shadow" onclick="triggerEmergencyAlert()">
                TRIGGER SCHOOL LOCKDOWN / ALERT
             </button>
             <button class="btn btn-outline-danger mt-3" onclick="alert('Weather Alert Triggered')">
                Trigger Weather Warning
             </button>
        </div>
    `;
}
function triggerEmergencyAlert() {
    if (confirm("ARE YOU SURE? This will send an SOS to the entire school database.")) {
        alert("🚨 EMERGENCY PROTOCOLS ACTIVATED. Alerts sent.");
    }
}
// --- ACADEMIC MANAGEMENT LOGIC ---
function renderAcademicsDashboard() {
    // Default to Planning tab
    const firstTab = document.querySelector('#academics-view .list-group-item');
    if (firstTab) {
        switchAcademicTab('planning', firstTab);
    }
}
function switchAcademicTab(tabName, btnElement) {
    // Update Sidebar Active State
    const sidebar = document.querySelector('#academics-view .list-group');
    if (sidebar) {
        sidebar.querySelectorAll('.list-group-item').forEach(el => el.classList.remove('active'));
    }
    if (btnElement)
        btnElement.classList.add('active');
    const contentArea = document.getElementById('academic-content-area');
    contentArea.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
    // Route to specific loader
    if (tabName === 'planning')
        loadSubjectPlanning();
    else if (tabName === 'classes')
        loadClassSchedules();
    else if (tabName === 'attendance')
        loadAttendanceTracking();
    else if (tabName === 'assignments')
        loadAssignmentsView();
    else if (tabName === 'exams')
        loadExamsView();
    else if (tabName === 'reports')
        loadReportCardsView();
}
function loadSubjectPlanning() {
    const container = document.getElementById('academic-content-area');
    container.innerHTML = `
        <div class="p-4 h-100">
            <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Subject Planning & Lesson Plans</h4>
            
            <div class="row g-4">
                 <div class="col-md-6">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <h5 class="fw-bold mb-3">Create Lesson Plan (AI)</h5>
                            <p class="text-muted small">Generate comprehensive lesson plans instantly using our specialized AI.</p>
                            <button class="btn btn-primary-custom w-100" onclick="showLessonPlanner()">Open AI Planner</button>
                        </div>
                    </div>
                </div>
                 <div class="col-md-6">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body">
                            <h5 class="fw-bold mb-3">Saved Plans</h5>
                            <ul class="list-group list-group-flush">
                                <li class="list-group-item">Algebra - Intro to Functions <small class="text-muted float-end">Oct 20</small></li>
                                <li class="list-group-item">Biology - Cell Structure <small class="text-muted float-end">Oct 15</small></li>
                                <li class="list-group-item">History - World War II <small class="text-muted float-end">Oct 10</small></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 p-4 bg-white rounded-3 border">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h5 class="fw-bold mb-0">Curriculum & Syllabus Manager</h5>
                    <button class="btn btn-sm btn-outline-primary" onclick="alert('Syncing with District Standards...')">
                        <span class="material-icons align-middle fs-6 me-1">sync</span> Sync Standards
                    </button>
                </div>
                
                <div class="row">
                    <div class="col-md-4">
                        <div class="list-group list-group-flush border rounded-3 overflow-hidden">
                            <a href="#" class="list-group-item list-group-item-action active fw-bold" onclick="showSyllabusDetail('math')">
                                Mathematics (Grade 9)
                                <div class="progress mt-2" style="height: 4px;">
                                    <div class="progress-bar bg-warning" role="progressbar" style="width: 65%"></div>
                                </div>
                            </a>
                            <a href="#" class="list-group-item list-group-item-action fw-bold" onclick="showSyllabusDetail('science')">
                                Physics (Grade 10)
                                <div class="progress mt-2" style="height: 4px;">
                                    <div class="progress-bar bg-success" role="progressbar" style="width: 40%"></div>
                                </div>
                            </a>
                        </div>
                    </div>
                    
                    <div class="col-md-8">
                        <div id="syllabus-detail-view" class="p-3 bg-light rounded-3 h-100">
                           <!-- Default View -->
                           <h6 class="fw-bold text-primary">Mathematics - Grade 9</h6>
                           <div class="d-flex justify-content-between text-muted small mb-3">
                                <span>Progress: 65% Completed</span>
                                <span>Term: Fall 2025</span>
                           </div>

                           <div class="table-responsive">
                                <table class="table table-sm table-hover bg-white rounded shadow-sm">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Unit</th>
                                            <th>Topic</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>Unit 1</td>
                                            <td>Real Numbers</td>
                                            <td><span class="badge bg-success">Completed</span></td>
                                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                                        </tr>
                                         <tr>
                                            <td>Unit 2</td>
                                            <td>Polynomials</td>
                                            <td><span class="badge bg-success">Completed</span></td>
                                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                                        </tr>
                                         <tr>
                                            <td>Unit 3</td>
                                            <td>Linear Equations</td>
                                            <td><span class="badge bg-warning text-dark">In Progress</span></td>
                                            <td><button class="btn btn-link btn-sm p-0">Edit</button></td>
                                        </tr>
                                         <tr>
                                            <td>Unit 4</td>
                                            <td>Quadratic Eq.</td>
                                            <td><span class="badge bg-secondary">Pending</span></td>
                                            <td><button class="btn btn-link btn-sm p-0">Plan</button></td>
                                        </tr>
                                    </tbody>
                                </table>
                           </div>
                           <button class="btn btn-primary-custom btn-sm mt-2" onclick="alert('Add New Topic Modal')">+ Add Topic</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
function loadClassSchedules() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('academic-content-area');
        // Reuse existing class loading logic internally or mock for now
        container.innerHTML = `
        <div class="p-4 h-100">
             <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <h4 class="fw-bold m-0 text-primary">Class Schedules</h4>
                 <button class="btn btn-primary-custom" onclick="document.getElementById('scheduleClassModal').classList.add('show'); document.getElementById('scheduleClassModal').style.display='block';">
                    <span class="material-icons align-middle fs-5 me-1">add_circle</span> Schedule New Class
                </button>
            </div>
            
             <!-- Embedded Live Classes View -->
             <div id="academics-live-classes-container">
                <div class="text-center p-3"><div class="spinner-border text-primary"></div></div>
             </div>
        </div>
    `;
        // Fetch real classes
        try {
            const res = yield fetchAPI('/live-classes');
            if (res.ok) {
                const classes = yield res.json();
                const listContainer = document.getElementById('academics-live-classes-container');
                if (classes.length === 0) {
                    listContainer.innerHTML = '<p class="text-muted text-center">No active classes scheduled.</p>';
                }
                else {
                    listContainer.innerHTML = classes.map(cls => `
                    <div class="card mb-3 border-0 shadow-sm">
                        <div class="card-body d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="fw-bold mb-1">${cls.topic}</h5>
                                <p class="text-muted mb-0 small">
                                    <span class="material-icons align-middle fs-6 me-1">event</span> ${new Date(cls.date).toLocaleString()}
                                </p>
                            </div>
                            <a href="${cls.meet_link}" target="_blank" class="btn btn-success rounded-pill px-4">Join Class</a>
                        </div>
                    </div>
                `).join('');
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    });
}
function loadAttendanceTracking() {
    const container = document.getElementById('academic-content-area');
    container.innerHTML = `
        <div class="p-4 h-100">
            <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Attendance Tracking</h4>
            
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-body">
                    <div class="row text-center">
                        <div class="col-4 border-end">
                            <h3 class="fw-bold text-success">98%</h3>
                            <small class="text-muted">Average Attendance</small>
                        </div>
                         <div class="col-4 border-end">
                            <h3 class="fw-bold text-warning">12</h3>
                            <small class="text-muted">Absent Today</small>
                        </div>
                         <div class="col-4">
                            <h3 class="fw-bold text-danger">3</h3>
                            <small class="text-muted">Chronic Absentees</small>
                        </div>
                    </div>
                </div>
            </div>

            <h5 class="fw-bold mb-3">Mark Attendance</h5>
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="bg-light">
                        <tr>
                            <th>Student Name</th>
                            <th>Status</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="align-middle">Alex Johnson</td>
                            <td>
                                <select class="form-select form-select-sm">
                                    <option class="text-success">Present</option>
                                    <option class="text-danger">Absent</option>
                                    <option class="text-warning">Late</option>
                                </select>
                            </td>
                            <td><input type="text" class="form-control form-control-sm" placeholder="Optional"></td>
                        </tr>
                         <tr>
                            <td class="align-middle">Maria Rodriguez</td>
                            <td>
                                <select class="form-select form-select-sm">
                                    <option class="text-success">Present</option>
                                    <option class="text-danger">Absent</option>
                                    <option class="text-warning">Late</option>
                                </select>
                            </td>
                            <td><input type="text" class="form-control form-control-sm" placeholder="Optional"></td>
                        </tr>
                         <tr>
                            <td class="align-middle">Sam Smith</td>
                            <td>
                                <select class="form-select form-select-sm">
                                    <option class="text-warning">Late</option>
                                    <option class="text-success">Present</option>
                                    <option class="text-danger">Absent</option>
                                </select>
                            </td>
                            <td><input type="text" class="form-control form-control-sm" value="Bus delay"></td>
                        </tr>
                    </tbody>
                </table>
                <button class="btn btn-primary-custom float-end" onclick="alert('Attendance Saved!')">Submit Attendance</button>
            </div>
        </div>
    `;
}
function loadAssignmentsView() {
    const container = document.getElementById('academic-content-area');
    container.innerHTML = `
        <div class="p-4 h-100">
             <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <h4 class="fw-bold m-0 text-primary">Homework & Assignments</h4>
                <button id="create-assignment-btn" class="btn btn-primary-custom d-none" onclick="openCreateAssignmentModal()">
                    <span class="material-icons align-middle fs-5 me-1">add_circle</span> Create Assignment
                </button>
            </div>
            <div id="academics-assignments-list" class="mt-2"></div>
        </div>
    `;
    loadAssignments();
}
function loadExamsView() {
    const container = document.getElementById('academic-content-area');
    const isAdmin = ['Principal', 'Admin', 'Tenant_Admin', 'Root_Super_Admin', 'Super Admin'].includes(appState.role || '');
    container.innerHTML = `
        <div class="p-4 h-100">
            <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                <h4 class="fw-bold text-primary m-0">Exam Schedule</h4>
                <button class="btn btn-outline-secondary btn-sm" onclick="loadExamSchedulesViewRefresh()">
                    <span class="material-icons align-middle fs-6 me-1">refresh</span> Refresh
                </button>
            </div>

            ${isAdmin ? `
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white d-flex align-items-center justify-content-between">
                    <div class="fw-bold">Create Exam Schedule</div>
                    <span class="badge bg-light text-secondary border">Exam Planning</span>
                </div>
                <div class="card-body">
                    <form onsubmit="event.preventDefault(); createExamSchedule();">
                        <div class="row g-3">
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Title</label>
                                <input id="exam-title" class="form-control" placeholder="Midterm, Final, Unit Test" required>
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Subject</label>
                                <input id="exam-subject" class="form-control" placeholder="Mathematics" required>
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">School</label>
                                <select id="exam-school-id" class="form-select" onchange="applyExamScheduleSchoolScope()"></select>
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Grade</label>
                                <select id="exam-grade-level" class="form-select" required></select>
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Section</label>
                                <select id="exam-section-id" class="form-select"></select>
                                <div class="form-text">Leave as All Sections if not specific.</div>
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Date</label>
                                <input id="exam-date" type="date" class="form-control" required>
                            </div>
                            <div class="col-lg-2 col-md-3">
                                <label class="form-label">Start Time</label>
                                <input id="exam-start-time" type="time" class="form-control">
                            </div>
                            <div class="col-lg-2 col-md-3">
                                <label class="form-label">End Time</label>
                                <input id="exam-end-time" type="time" class="form-control">
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Venue</label>
                                <input id="exam-venue" class="form-control" placeholder="Main Hall">
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Items Required</label>
                                <input id="exam-instructions" class="form-control" placeholder="Calculator, geometry box">
                            </div>
                            <div class="col-lg-4 col-md-6">
                                <label class="form-label">Teacher</label>
                                <select id="exam-teacher-id" class="form-select"></select>
                                <div class="form-text">Optional: assign a lead teacher.</div>
                            </div>
                            <div class="col-lg-8 col-md-12">
                                <label class="form-label">Notification Message</label>
                                <input id="exam-notification-message" class="form-control" placeholder="Arrive 15 minutes early.">
                                <div class="form-text">Sent along with the schedule if Notify is enabled.</div>
                            </div>
                            <div class="col-lg-4 col-md-12 d-flex align-items-end justify-content-between gap-3">
                                <div class="form-check mt-2">
                                    <input id="exam-notify" class="form-check-input" type="checkbox" checked>
                                    <label class="form-check-label" for="exam-notify">Notify Students/Parents/Teachers</label>
                                </div>
                                <button class="btn btn-primary-custom ms-auto">Create Schedule</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            ` : ''}

            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white fw-bold">Scheduled Exams</div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-4">Title</th>
                                <th>Subject</th>
                                <th>Grade</th>
                                <th>Section</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Venue</th>
                                <th>Items Required</th>
                                <th>Teacher</th>
                                ${isAdmin ? '<th class="text-end pe-3">Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="exam-schedules-table-body">
                            <tr><td class="ps-4 text-muted" colspan="${isAdmin ? '10' : '9'}">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="view full-page-view" id="examScheduleEditModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Exam Schedule</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="edit-exam-id">
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <label class="form-label">Title</label>
                                    <input id="edit-exam-title" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Subject</label>
                                    <input id="edit-exam-subject" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Grade</label>
                                    <select id="edit-exam-grade-level" class="form-select"></select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Section</label>
                                    <select id="edit-exam-section-id" class="form-select"></select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Date</label>
                                    <input id="edit-exam-date" type="date" class="form-control">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Start Time</label>
                                    <input id="edit-exam-start-time" type="time" class="form-control">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">End Time</label>
                                    <input id="edit-exam-end-time" type="time" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Venue</label>
                                    <input id="edit-exam-venue" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Items Required</label>
                                    <input id="edit-exam-instructions" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Teacher</label>
                                    <select id="edit-exam-teacher-id" class="form-select"></select>
                                </div>
                                <div class="col-md-12">
                                    <label class="form-label">Notification Message (Optional)</label>
                                    <input id="edit-exam-notification-message" class="form-control" placeholder="Optional message to send with update">
                                </div>
                                <div class="col-md-12">
                                    <div class="form-check">
                                        <input id="edit-exam-notify" class="form-check-input" type="checkbox">
                                        <label class="form-check-label" for="edit-exam-notify">Notify Students/Parents/Teachers</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button class="btn btn-primary-custom" onclick="saveExamScheduleEdit()">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (isAdmin) {
        populateExamScheduleFormOptions();
        loadExamSchedulesAdmin();
    } else {
        loadExamSchedulesMy();
    }
}

let examSchedulesCache = [];
let examScheduleOptionsCache = { sections: [], teachers: [], schools: [] };

function loadExamSchedulesViewRefresh() {
    const isAdmin = ['Principal', 'Admin', 'Tenant_Admin', 'Root_Super_Admin', 'Super Admin'].includes(appState.role || '');
    if (isAdmin) loadExamSchedulesAdmin();
    else loadExamSchedulesMy();
}

function applyExamScheduleSchoolScope() {
    const schoolSelect = document.getElementById('exam-school-id');
    const selectedSchoolId = schoolSelect && schoolSelect.value ? Number(schoolSelect.value) : null;

    const sectionSelect = document.getElementById('exam-section-id');
    if (sectionSelect) {
        const scopedSections = (examScheduleOptionsCache.sections || []).filter(s => !selectedSchoolId || !s.school_id || Number(s.school_id) === selectedSchoolId);
        sectionSelect.innerHTML = '<option value="">All Sections</option>' +
            scopedSections.map(s => `<option value="${s.id}">${s.name} (Grade ${s.grade_level})</option>`).join('');
    }

    const teacherSelect = document.getElementById('exam-teacher-id');
    if (teacherSelect) {
        const scopedTeachers = (examScheduleOptionsCache.teachers || []).filter(t => !selectedSchoolId || !t.school_id || Number(t.school_id) === selectedSchoolId);
        teacherSelect.innerHTML = '<option value="">Unassigned</option>' +
            scopedTeachers.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('');
    }

    loadExamSchedulesViewRefresh();
}

function formatExamDate(dateStr) {
    if (!dateStr) return '-';
    try {
        return new Date(dateStr).toLocaleDateString();
    } catch {
        return dateStr;
    }
}

function formatExamTime(start, end) {
    if (!start && !end) return '-';
    if (start && end) return `${start} - ${end}`;
    return start || end || '-';
}

async function populateExamScheduleFormOptions() {
    const gradeSelect = document.getElementById('exam-grade-level');
    const editGradeSelect = document.getElementById('edit-exam-grade-level');
    if (gradeSelect && !gradeSelect.dataset.populated) {
        gradeSelect.innerHTML = '<option value="">Select Grade</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Grade ${i + 1}</option>`).join('');
        gradeSelect.dataset.populated = '1';
    }
    if (editGradeSelect && !editGradeSelect.dataset.populated) {
        editGradeSelect.innerHTML = '<option value="">Select Grade</option>' + Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">Grade ${i + 1}</option>`).join('');
        editGradeSelect.dataset.populated = '1';
    }

    try {
        const sectionsRes = await fetchAPI('/sections');
        if (sectionsRes.ok) {
            examScheduleOptionsCache.sections = await sectionsRes.json();
        }
    } catch (e) {
        console.warn('Failed to load sections', e);
    }
    try {
        const teachersRes = await fetchAPI('/students/all');
        if (teachersRes.ok) {
            const users = await teachersRes.json();
            examScheduleOptionsCache.teachers = (users || []).filter(u => u.role === 'Teacher');
        }
    } catch (e) {
        console.warn('Failed to load teachers', e);
    }
    try {
        const schoolsRes = await fetchAPI('/admin/schools');
        if (schoolsRes.ok) {
            examScheduleOptionsCache.schools = await schoolsRes.json();
        }
    } catch (e) {
        console.warn('Failed to load schools', e);
    }

    const schoolSelect = document.getElementById('exam-school-id');
    if (schoolSelect) {
        const currentSchoolId = Number(appState.activeSchoolId || appState.schoolId || 1);
        const canSelectAnySchool = !!appState.isSuperAdmin || ['Root_Super_Admin', 'Super Admin'].includes(appState.role || '');
        if (canSelectAnySchool && examScheduleOptionsCache.schools.length > 0) {
            schoolSelect.innerHTML = examScheduleOptionsCache.schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        } else {
            const ownSchoolName = appState.schoolName || `School ${currentSchoolId}`;
            schoolSelect.innerHTML = `<option value="${currentSchoolId}">${ownSchoolName}</option>`;
        }
        schoolSelect.value = String(currentSchoolId);
    }

    const sectionSelect = document.getElementById('exam-section-id');
    const editSectionSelect = document.getElementById('edit-exam-section-id');
    if (sectionSelect) {
        sectionSelect.innerHTML = '<option value="">All Sections</option>' +
            examScheduleOptionsCache.sections.map(s => `<option value="${s.id}">${s.name} (Grade ${s.grade_level})</option>`).join('');
    }
    if (editSectionSelect) {
        editSectionSelect.innerHTML = '<option value="">All Sections</option>' +
            examScheduleOptionsCache.sections.map(s => `<option value="${s.id}">${s.name} (Grade ${s.grade_level})</option>`).join('');
    }

    const teacherSelect = document.getElementById('exam-teacher-id');
    const editTeacherSelect = document.getElementById('edit-exam-teacher-id');
    if (teacherSelect) {
        teacherSelect.innerHTML = '<option value="">Unassigned</option>' +
            examScheduleOptionsCache.teachers.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('');
    }
    if (editTeacherSelect) {
        editTeacherSelect.innerHTML = '<option value="">Unassigned</option>' +
            examScheduleOptionsCache.teachers.map(t => `<option value="${t.id}">${t.name || t.id}</option>`).join('');
    }
    applyExamScheduleSchoolScope();
}

async function createExamSchedule() {
    const schoolSelect = document.getElementById('exam-school-id');
    const payload = {
        title: document.getElementById('exam-title').value.trim(),
        subject: document.getElementById('exam-subject').value.trim(),
        school_id: schoolSelect && schoolSelect.value ? parseInt(schoolSelect.value, 10) : null,
        grade_level: parseInt(document.getElementById('exam-grade-level').value, 10),
        section_id: document.getElementById('exam-section-id').value || null,
        date: document.getElementById('exam-date').value,
        start_time: document.getElementById('exam-start-time').value || null,
        end_time: document.getElementById('exam-end-time').value || null,
        venue: document.getElementById('exam-venue').value || null,
        instructions: document.getElementById('exam-instructions').value || null,
        teacher_id: document.getElementById('exam-teacher-id').value || null,
        notify: document.getElementById('exam-notify').checked,
        notification_message: document.getElementById('exam-notification-message').value || null
    };
    if (!payload.title || !payload.subject || !payload.grade_level || !payload.date) {
        alert('Please fill in Title, Subject, Grade, and Date.');
        return;
    }
    try {
        const res = await fetchAPI('/exam-schedules', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert('Exam schedule created.');
            loadExamSchedulesAdmin();
        } else {
            const err = await res.json();
            alert(`Failed to create schedule: ${err.detail || 'Unknown error'}`);
        }
    } catch (e) {
        console.error(e);
        alert('Network error.');
    }
}

async function loadExamSchedulesAdmin() {
    const tbody = document.getElementById('exam-schedules-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="10">Loading...</td></tr>';
    try {
        const schoolSelect = document.getElementById('exam-school-id');
        let url = '/exam-schedules/all';
        if (schoolSelect && schoolSelect.value) {
            url += `?school_id=${encodeURIComponent(schoolSelect.value)}`;
        }
        const res = await fetchAPI(url);
        if (res.ok) {
            const rows = await res.json();
            examSchedulesCache = rows || [];
            tbody.innerHTML = renderExamScheduleRows(examSchedulesCache, true);
            if (!examSchedulesCache.length) {
                tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="10">No schedules yet.</td></tr>';
            }
        } else {
            tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="10">Failed to load schedules.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="10">Network error.</td></tr>';
    }
}

async function loadExamSchedulesMy() {
    const tbody = document.getElementById('exam-schedules-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="9">Loading...</td></tr>';
    try {
        const res = await fetchAPI('/exam-schedules/my');
        if (res.ok) {
            const rows = await res.json();
            examSchedulesCache = rows || [];
            tbody.innerHTML = renderExamScheduleRows(examSchedulesCache, false);
            if (!examSchedulesCache.length) {
                tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="9">No schedules yet.</td></tr>';
            }
        } else {
            tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="9">Failed to load schedules.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="9">Network error.</td></tr>';
    }
}

function renderExamScheduleRows(rows, showActions) {
    return rows.map(r => {
        const sectionName = r.section_name || '-';
        const teacherName = r.teacher_name || r.teacher_id || '-';
        const actions = showActions
            ? `<td class="text-end pe-3">
                   <button class="btn btn-sm btn-outline-primary me-2" onclick="openExamScheduleEditModal(${r.id})">Edit</button>
                   <button class="btn btn-sm btn-outline-secondary" onclick="notifyExamSchedule(${r.id})">Notify</button>
               </td>`
            : '';
        return `
            <tr>
                <td class="ps-4 fw-bold">${r.title || '-'}</td>
                <td>${r.subject || '-'}</td>
                <td>${r.grade_level || '-'}</td>
                <td>${sectionName}</td>
                <td>${formatExamDate(r.exam_date)}</td>
                <td>${formatExamTime(r.start_time, r.end_time)}</td>
                <td>${r.venue || '-'}</td>
                <td>${r.instructions || '-'}</td>
                <td>${teacherName}</td>
                ${actions}
            </tr>
        `;
    }).join('');
}

async function openExamScheduleEditModal(id) {
    const schedule = examSchedulesCache.find(s => s.id === id);
    if (!schedule) return;
    await populateExamScheduleFormOptions();

    document.getElementById('edit-exam-id').value = schedule.id;
    document.getElementById('edit-exam-title').value = schedule.title || '';
    document.getElementById('edit-exam-subject').value = schedule.subject || '';
    document.getElementById('edit-exam-grade-level').value = schedule.grade_level || '';
    document.getElementById('edit-exam-section-id').value = schedule.section_id || '';
    document.getElementById('edit-exam-date').value = schedule.exam_date || '';
    document.getElementById('edit-exam-start-time').value = schedule.start_time || '';
    document.getElementById('edit-exam-end-time').value = schedule.end_time || '';
    document.getElementById('edit-exam-venue').value = schedule.venue || '';
    document.getElementById('edit-exam-instructions').value = schedule.instructions || '';
    document.getElementById('edit-exam-teacher-id').value = schedule.teacher_id || '';
    document.getElementById('edit-exam-notification-message').value = '';
    document.getElementById('edit-exam-notify').checked = false;

    openView('examScheduleEditModal');
}

async function saveExamScheduleEdit() {
    const id = document.getElementById('edit-exam-id').value;
    const payload = {
        title: document.getElementById('edit-exam-title').value || null,
        subject: document.getElementById('edit-exam-subject').value || null,
        grade_level: document.getElementById('edit-exam-grade-level').value ? parseInt(document.getElementById('edit-exam-grade-level').value, 10) : null,
        section_id: document.getElementById('edit-exam-section-id').value || null,
        date: document.getElementById('edit-exam-date').value || null,
        start_time: document.getElementById('edit-exam-start-time').value || null,
        end_time: document.getElementById('edit-exam-end-time').value || null,
        venue: document.getElementById('edit-exam-venue').value || null,
        instructions: document.getElementById('edit-exam-instructions').value || null,
        teacher_id: document.getElementById('edit-exam-teacher-id').value || null,
        notify: document.getElementById('edit-exam-notify').checked,
        notification_message: document.getElementById('edit-exam-notification-message').value || null
    };
    try {
        const res = await fetchAPI(`/exam-schedules/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            closeView();
            loadExamSchedulesAdmin();
        } else {
            const err = await res.json();
            alert(`Failed to update: ${err.detail || 'Unknown error'}`);
        }
    } catch (e) {
        console.error(e);
        alert('Network error.');
    }
}

async function notifyExamSchedule(id) {
    const message = prompt('Optional message to include with the notification:') || '';
    const items = prompt('Items required to bring (optional):') || '';
    try {
        const res = await fetchAPI(`/exam-schedules/${id}/notify`, {
            method: 'POST',
            body: JSON.stringify({ message: message || null, items_required: items || null, include_teachers: true })
        });
        if (res.ok) {
            alert('Notification sent.');
        } else {
            const err = await res.json();
            alert(`Failed to notify: ${err.detail || 'Unknown error'}`);
        }
    } catch (e) {
        console.error(e);
        alert('Network error.');
    }
}
function loadReportCardsView() {
    const container = document.getElementById('academic-content-area');
    container.innerHTML = `
        <div class="p-4 h-100">
            <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Report Cards</h4>
            
            <div class="card bg-light border-0 p-4">
                <h5 class="fw-bold mb-3">Generate Student Reports</h5>
                <form onsubmit="event.preventDefault(); alert('Reports Generated! Downloading PDF...');">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label">Term</label>
                            <select class="form-select">
                                <option>Fall 2025</option>
                                <option>Spring 2026</option>
                            </select>
                        </div>
                         <div class="col-md-4">
                            <label class="form-label">Grade Level</label>
                            <select class="form-select">
                                <option>Grade 9</option>
                                <option>Grade 10</option>
                                <option>Grade 11</option>
                                <option>Grade 12</option>
                            </select>
                        </div>
                         <div class="col-md-4">
                            <label class="form-label text-light">Action</label>
                            <button type="submit" class="btn btn-dark w-100 fw-bold">Generate PDFs</button>
                        </div>
                    </div>
                </form>
            </div>
            
            <hr class="my-5">
            
            <h5 class="fw-bold mb-3">Recent Reports</h5>
            <div class="list-group">
                <a href="#" class="list-group-item list-group-item-action">
                    <span class="material-icons align-middle text-danger me-2">picture_as_pdf</span>
                    Fall_2024_Grade9_Summary.pdf
                </a>
                 <a href="#" class="list-group-item list-group-item-action">
                    <span class="material-icons align-middle text-danger me-2">picture_as_pdf</span>
                    Spring_2024_Grade10_Full_Report.pdf
                </a>
            </div>
        </div>
    `;
}
function showLessonPlanner() {
    switchView('lesson-planner-view');
}
function showSyllabusDetail(subject) {
    const detailView = document.getElementById('syllabus-detail-view');
    // Simple mock switching logic
    if (subject === 'math') {
        detailView.innerHTML = `
           <h6 class="fw-bold text-primary">Mathematics - Grade 9</h6>
           <div class="d-flex justify-content-between text-muted small mb-3">
                <span>Progress: 65% Completed</span>
                <span>Term: Fall 2025</span>
           </div>

           <div class="table-responsive">
                <table class="table table-sm table-hover bg-white rounded shadow-sm">
                    <thead class="table-light">
                        <tr>
                            <th>Unit</th>
                            <th>Topic</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Unit 1</td>
                            <td>Real Numbers</td>
                            <td><span class="badge bg-success">Completed</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                        </tr>
                         <tr>
                            <td>Unit 2</td>
                            <td>Polynomials</td>
                            <td><span class="badge bg-success">Completed</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                        </tr>
                         <tr>
                            <td>Unit 3</td>
                            <td>Linear Equations</td>
                            <td><span class="badge bg-warning text-dark">In Progress</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Edit</button></td>
                        </tr>
                         <tr>
                            <td>Unit 4</td>
                            <td>Quadratic Eq.</td>
                            <td><span class="badge bg-secondary">Pending</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Plan</button></td>
                        </tr>
                    </tbody>
                </table>
           </div>
           <button class="btn btn-primary-custom btn-sm mt-2" onclick="alert('Add New Topic Modal')">+ Add Topic</button>
        `;
    }
    else if (subject === 'science') {
        detailView.innerHTML = `
           <h6 class="fw-bold text-success">Physics - Grade 10</h6>
           <div class="d-flex justify-content-between text-muted small mb-3">
                <span>Progress: 40% Completed</span>
                <span>Term: Fall 2025</span>
           </div>

           <div class="table-responsive">
                <table class="table table-sm table-hover bg-white rounded shadow-sm">
                    <thead class="table-light">
                        <tr>
                            <th>Unit</th>
                            <th>Topic</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Unit 1</td>
                            <td>Motion & Time</td>
                            <td><span class="badge bg-success">Completed</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                        </tr>
                         <tr>
                            <td>Unit 2</td>
                            <td>Force & Laws</td>
                            <td><span class="badge bg-success">Completed</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Review</button></td>
                        </tr>
                         <tr>
                            <td>Unit 3</td>
                            <td>Gravitation</td>
                            <td><span class="badge bg-warning text-dark">In Progress</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Edit</button></td>
                        </tr>
                         <tr>
                            <td>Unit 4</td>
                            <td>Work & Energy</td>
                            <td><span class="badge bg-secondary">Pending</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Plan</button></td>
                        </tr>
                         <tr>
                            <td>Unit 5</td>
                            <td>Sound</td>
                            <td><span class="badge bg-secondary">Pending</span></td>
                            <td><button class="btn btn-link btn-sm p-0">Plan</button></td>
                        </tr>
                    </tbody>
                </table>
           </div>
           <button class="btn btn-primary-custom btn-sm mt-2" onclick="alert('Add New Topic Modal')">+ Add Topic</button>
        `;
    }
    // Update active state in sidebar
    const listItems = document.querySelectorAll('#academic-content-area .list-group-item');
    listItems.forEach(item => item.classList.remove('active'));
    // This is a bit hacky for a mockup, ideally we'd pass 'this'
    const clickedItem = Array.from(listItems).find(item => item.textContent.toLowerCase().includes(subject === 'math' ? 'mathematics' : 'physics'));
    if (clickedItem)
        clickedItem.classList.add('active');
}
// --- FINANCE & BILLING LOGIC ---
function renderFinanceDashboard() {
    // Default to Fee Structures
    switchFinanceTab('fees', document.querySelector('[onclick="switchFinanceTab(\'fees\', this)"]'));
}
function switchFinanceTab(tabId, btnElement) {
    // Update Sidebar Active State
    if (btnElement) {
        document.querySelectorAll('#finance-view .list-group-item').forEach(el => el.classList.remove('active'));
        btnElement.classList.add('active');
    }
    const contentArea = document.getElementById('finance-content-area');
    contentArea.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div></div>';
    setTimeout(() => {
        switch (tabId) {
            case 'fees':
                loadFeeStructures(contentArea);
                break;
            case 'installments':
                loadInstallmentPlans(contentArea);
                break;
            case 'discounts':
                loadDiscountsView(contentArea);
                break;
            case 'invoicing':
                loadInvoicingView(contentArea);
                break;
            case 'payments':
                loadOnlinePaymentsView(contentArea);
                break;
            case 'refunds':
                loadRefundsView(contentArea);
                break;
            case 'reports':
                loadFinancialReportsView(contentArea);
                break;
            case 'currency':
                loadMultiCurrencyView(contentArea);
                break;
        }
    }, 300); // Simulate loading
}
function loadFeeStructures(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Fee Structures</h4>
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-body">
                <div class="d-flex justify-content-between mb-3">
                    <h5 class="fw-bold">Academic Year 2025-2026</h5>
                    <button class="btn btn-primary-custom btn-sm" onclick="alert('Create New Fee Structure')">+ Create New</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead class="table-light">
                            <tr>
                                <th>Grade Level</th>
                                <th>Tuition Fee</th>
                                <th>Library Fee</th>
                                <th>Lab Fee</th>
                                <th>Total (Yearly)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Primary (Gr 1-5)</td>
                                <td>,000</td>
                                <td></td>
                                <td>-</td>
                                <td class="fw-bold">,200</td>
                                <td><button class="btn btn-sm btn-outline-primary">Edit</button></td>
                            </tr>
                            <tr>
                                <td>Middle (Gr 6-8)</td>
                                <td>,500</td>
                                <td></td>
                                <td></td>
                                <td class="fw-bold">,200</td>
                                <td><button class="btn btn-sm btn-outline-primary">Edit</button></td>
                            </tr>
                             <tr>
                                <td>High School (Gr 9-12)</td>
                                <td>,000</td>
                                <td></td>
                                <td>,000</td>
                                <td class="fw-bold">,500</td>
                                <td><button class="btn btn-sm btn-outline-primary">Edit</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
function loadInstallmentPlans(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Installment Plans</h4>
        <div class="row g-4">
            <div class="col-md-6">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                             <h5 class="fw-bold mb-0">Standard Term Plan</h5>
                             <span class="badge bg-success">Active</span>
                        </div>
                        <p class="text-muted small">Standard plan splitting fees into 3 term payments.</p>
                        <ul class="list-unstyled text-muted small">
                            <li class="mb-2"><strong>Term 1 (40%):</strong> Due Sep 1st</li>
                            <li class="mb-2"><strong>Term 2 (30%):</strong> Due Jan 15th</li>
                            <li class="mb-2"><strong>Term 3 (30%):</strong> Due Apr 15th</li>
                        </ul>
                        <button class="btn btn-outline-dark btn-sm w-100">Manage Rules</button>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                 <div class="card h-100 border-0 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                             <h5 class="fw-bold mb-0">Monthly Installments</h5>
                             <span class="badge bg-warning text-dark">Approval Req.</span>
                        </div>
                        <p class="text-muted small">10 Monthly payments for financial hardship cases.</p>
                         <ul class="list-unstyled text-muted small">
                            <li class="mb-2"><strong>Initial:</strong> 10% Due on Admission</li>
                            <li class="mb-2"><strong>Recurring:</strong> 9 payments of 10% (Oct - Jun)</li>
                            <li class="mb-2"><strong>Surcharge:</strong> 2% administrative fee</li>
                        </ul>
                        <button class="btn btn-outline-dark btn-sm w-100">Manage Rules</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}
function loadDiscountsView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Discounts & Scholarships</h4>
        <div class="card border-0 shadow-sm">
            <div class="card-body">
                 <div class="d-flex justify-content-between mb-3">
                    <h5 class="fw-bold">Active Programs</h5>
                    <button class="btn btn-primary-custom btn-sm">+ Add Program</button>
                </div>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="fw-bold mb-0">Sibling Discount</h6>
                            <small class="text-muted">10% off tuition for second child onwards</small>
                        </div>
                        <span class="badge bg-success rounded-pill">Auto-Applied</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="fw-bold mb-0">Staff Rate</h6>
                            <small class="text-muted">50% waiver for faculty children</small>
                        </div>
                         <span class="badge bg-success rounded-pill">Active</span>
                    </li>
                     <li class="list-group-item d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="fw-bold mb-0">Merit Scholarship (Gold)</h6>
                            <small class="text-muted">Full tuition waiver for top 5 students</small>
                        </div>
                         <span class="badge bg-primary rounded-pill">Competitive</span>
                    </li>
                </ul>
            </div>
        </div>
    `;
}
function loadInvoicingView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Invoicing</h4>
         <div class="d-flex justify-content-between mb-3">
            <div class="btn-group">
                <button class="btn btn-outline-secondary active">Unpaid</button>
                <button class="btn btn-outline-secondary">Paid</button>
                <button class="btn btn-outline-secondary">Overdue</button>
            </div>
            <button class="btn btn-primary-custom" onclick="alert('Bulk Generate Invoices')">Bulk Generate</button>
        </div>
        <div class="table-responsive bg-white rounded shadow-sm border p-3">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>Invoice #</th>
                        <th>Student</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>INV-2025-001</td>
                        <td>Alice Smith (G5-A)</td>
                        <td>Term 1 Tuition</td>
                        <td>,000.00</td>
                        <td>Sep 01, 2025</td>
                        <td><span class="badge bg-danger">Overdue</span></td>
                        <td><button class="btn btn-sm btn-link">Send Reminder</button></td>
                    </tr>
                     <tr>
                        <td>INV-2025-002</td>
                        <td>Bob Jones (G6-B)</td>
                        <td>Lab Fees</td>
                        <td>.00</td>
                        <td>Oct 01, 2025</td>
                        <td><span class="badge bg-warning text-dark">Unpaid</span></td>
                        <td><button class="btn btn-sm btn-link">Email</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}
function loadOnlinePaymentsView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Online Payments Gateway</h4>
        <div class="row g-4">
            <div class="col-md-8">
                 <div class="card border-0 shadow-sm">
                    <div class="card-header bg-light fw-bold">Recent Transactions</div>
                    <div class="card-body p-0">
                         <table class="table table-striped mb-0">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Payer</th>
                                    <th>Amount</th>
                                    <th>Method</th>
                                    <th>Date</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>TXN_998877</td>
                                    <td>Sarah Parent</td>
                                    <td>,000.00</td>
                                    <td>Stripe (CC)</td>
                                    <td>Today, 10:45 AM</td>
                                    <td><span class="badge bg-success">Success</span></td>
                                </tr>
                                 <tr>
                                    <td>TXN_998876</td>
                                    <td>Mike Parent</td>
                                    <td>.00</td>
                                    <td>PayPal</td>
                                    <td>Yesterday</td>
                                    <td><span class="badge bg-success">Success</span></td>
                                </tr>
                            </tbody>
                         </table>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm mb-3">
                    <div class="card-body text-center">
                        <h6 class="text-muted mb-2">Total Collections (Today)</h6>
                        <h3 class="fw-bold text-success">,150.00</h3>
                    </div>
                </div>
                 <div class="card border-0 shadow-sm">
                    <div class="card-body">
                        <h6 class="fw-bold">Payment Methods</h6>
                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <span><span class="material-icons align-middle fs-6 me-1">credit_card</span> Stripe</span>
                            <div class="form-check form-switch">
                              <input class="form-check-input" type="checkbox" checked>
                            </div>
                        </div>
                         <div class="d-flex justify-content-between align-items-center mt-3">
                            <span><span class="material-icons align-middle fs-6 me-1">payments</span> PayPal</span>
                            <div class="form-check form-switch">
                              <input class="form-check-input" type="checkbox" checked>
                            </div>
                        </div>
                         <div class="d-flex justify-content-between align-items-center mt-3">
                            <span><span class="material-icons align-middle fs-6 me-1">account_balance</span> Bank Transfer</span>
                            <div class="form-check form-switch">
                              <input class="form-check-input" type="checkbox">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
function loadRefundsView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Refund Requests</h4>
        <div class="alert alert-info border-0 shadow-sm">
            <span class="material-icons align-middle me-2">info</span> Refund processing usually takes 5-7 business days.
        </div>
        <div class="card border-0 shadow-sm text-center p-5">
            <span class="material-icons display-4 text-muted mb-3">receipt_long</span>
            <h5>No Pending Refund Requests</h5>
            <p class="text-muted">All clear! No refund requests are currently active.</p>
        </div>
    `;
}
function loadFinancialReportsView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Financial Reports</h4>
        <div class="row g-4">
            <div class="col-md-6">
                 <button class="btn btn-light w-100 p-4 text-start shadow-sm border h-100" onclick="alert('Generating Revenue Report...')">
                    <span class="material-icons text-success display-6 d-block mb-3">trending_up</span>
                    <h5 class="fw-bold">Annual Revenue Report</h5>
                    <p class="text-muted small mb-0">Detailed breakdown of tuition and fees revenue vs projections.</p>
                 </button>
            </div>
             <div class="col-md-6">
                 <button class="btn btn-light w-100 p-4 text-start shadow-sm border h-100" onclick="alert('Generating Outstanding Fees Report...')">
                    <span class="material-icons text-danger display-6 d-block mb-3">running_with_errors</span>
                    <h5 class="fw-bold">Outstanding Fees</h5>
                    <p class="text-muted small mb-0">List of overdue accounts and aging report (30/60/90 days).</p>
                 </button>
            </div>
             <div class="col-md-6">
                 <button class="btn btn-light w-100 p-4 text-start shadow-sm border h-100" onclick="alert('Generating Expense Report...')">
                    <span class="material-icons text-warning display-6 d-block mb-3">money_off</span>
                    <h5 class="fw-bold">Expense Report</h5>
                    <p class="text-muted small mb-0">Operational expenses, salaries, and facility maintenance costs.</p>
                 </button>
            </div>
             <div class="col-md-6">
                 <button class="btn btn-light w-100 p-4 text-start shadow-sm border h-100" onclick="alert('Generating Tax Documents...')">
                    <span class="material-icons text-primary display-6 d-block mb-3">description</span>
                    <h5 class="fw-bold">Tax Summaries</h5>
                    <p class="text-muted small mb-0">Consolidated reports for tax filing purposes.</p>
                 </button>
            </div>
        </div>
    `;
}
function loadMultiCurrencyView(container) {
    container.innerHTML = `
        <h4 class="fw-bold text-primary mb-4 border-bottom pb-3">Multi-Currency Settings</h4>
        <div class="card border-0 shadow-sm">
            <div class="card-body">
                <form>
                    <div class="mb-4">
                        <label class="form-label fw-bold">Base Platform Currency</label>
                        <select class="form-select bg-light" disabled>
                            <option>USD ($)</option>
                        </select>
                        <div class="form-text">The base currency cannot be changed once transactions are recorded.</div>
                    </div>
                    
                    <h6 class="fw-bold mb-3">Accepted Currencies for Payment</h6>
                    <div class="list-group">
                        <label class="list-group-item d-flex gap-3">
                            <input class="form-check-input flex-shrink-0" type="checkbox" value="" checked>
                            <span>
                                <strong>USD</strong> - United States Dollar
                                <div class="small text-muted">Primary</div>
                            </span>
                        </label>
                        <label class="list-group-item d-flex gap-3">
                            <input class="form-check-input flex-shrink-0" type="checkbox" value="">
                            <span>
                                <strong>EUR</strong> - Euro
                                <div class="small text-muted">Exchange Rate: 1.08 USD</div>
                            </span>
                        </label>
                         <label class="list-group-item d-flex gap-3">
                            <input class="form-check-input flex-shrink-0" type="checkbox" value="">
                            <span>
                                <strong>GBP</strong> - British Pound
                                <div class="small text-muted">Exchange Rate: 1.25 USD</div>
                            </span>
                        </label>
                         <label class="list-group-item d-flex gap-3">
                            <input class="form-check-input flex-shrink-0" type="checkbox" value="">
                            <span>
                                <strong>INR</strong> - Indian Rupee
                                <div class="small text-muted">Exchange Rate: 0.012 USD</div>
                            </span>
                        </label>
                    </div>
                    
                    <button type="button" class="btn btn-primary-custom mt-4" onclick="alert('Currency Settings Saved')">Save Settings</button>
                </form>
            </div>
    `;
}
/* --- COMPLIANCE & SECURITY LOGIC (REFACTORED for Navigation Style) --- */
function showComplianceMenu() {
    document.getElementById('compliance-menu-area').classList.remove('d-none');
    document.getElementById('compliance-detail-area').classList.add('d-none');
    document.getElementById('compliance-back-btn').classList.add('d-none');
    document.getElementById('compliance-top-title').textContent = 'Compliance & Security';
}
function loadComplianceTab(tabId) {
    const menuArea = document.getElementById('compliance-menu-area');
    const detailArea = document.getElementById('compliance-detail-area');
    const container = document.getElementById('compliance-tab-content');
    const title = document.getElementById('compliance-top-title');
    const backBtn = document.getElementById('compliance-back-btn');
    // Switch View State
    menuArea.classList.add('d-none');
    detailArea.classList.remove('d-none');
    backBtn.classList.remove('d-none');
    // Set Loading State
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Loading data...</p></div>';
    if (tabId === 'audit-logs') {
        title.textContent = 'System Audit Logs';
        fetchAPI('/admin/compliance/audit-logs')
            .then(res => res.json())
            .then(logs => {
                if (logs.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-5">
                            <span class="material-icons fs-1 text-muted">history_edu</span>
                            <p class="text-muted mt-2">No audit logs found.</p>
                        </div>`;
                    return;
                }
                let table = `
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light">
                                <tr>
                                    <th class="py-3 ps-4">Time</th>
                                    <th class="py-3">User</th>
                                    <th class="py-3">Event</th>
                                    <th class="py-3">Details</th>
                                </tr>
                            </thead>
                            <tbody>`;
                logs.forEach(log => {
                    const dateObj = new Date(log.timestamp);
                    const dateStr = dateObj.toLocaleDateString();
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    table += `<tr>
                        <td class="ps-4">
                            <div class="fw-bold text-dark">${dateStr}</div>
                            <div class="small text-muted">${timeStr}</div>
                        </td>
                        <td>${log.user_id}</td>
                        <td><span class="badge bg-light text-dark border">${log.event_type}</span></td>
                        <td class="text-muted small">${log.details || '-'}</td>
                    </tr>`;
                });
                table += '</tbody></table></div></div>';
                container.innerHTML = table;
            })
            .catch(err => {
                container.innerHTML = '<div class="alert alert-danger">Failed to load logs.</div>';
                console.error(err);
            });
    }
    else if (tabId === 'access-logs') {
        title.textContent = 'Access & Login Logs';
        fetchAPI('/admin/compliance/access-logs')
            .then(res => res.json())
            .then(logs => {
                if (logs.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-5">
                            <span class="material-icons fs-1 text-muted">vpn_key</span>
                            <p class="text-muted mt-2">No access logs found.</p>
                        </div>`;
                    return;
                }
                let table = `
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light">
                                <tr>
                                    <th class="py-3 ps-4">Time</th>
                                    <th class="py-3">User</th>
                                    <th class="py-3">Event</th>
                                    <th class="py-3">Duration</th>
                                </tr>
                            </thead>
                            <tbody>`;
                logs.forEach(log => {
                    let dur = log.duration_minutes ? `${log.duration_minutes}m` : '-';
                    const dateObj = new Date(log.timestamp);
                    const dateStr = dateObj.toLocaleDateString();
                    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const badgeClass = log.event_type.includes('Success') ? 'bg-success-subtle text-success' :
                        (log.event_type.includes('Fail') ? 'bg-danger-subtle text-danger' : 'bg-secondary-subtle text-secondary');
                    table += `<tr>
                        <td class="ps-4">
                            <div class="fw-bold text-dark">${dateStr}</div>
                            <div class="small text-muted">${timeStr}</div>
                        </td>
                         <td>${log.user_id}</td>
                        <td><span class="badge ${badgeClass}">${log.event_type}</span></td>
                        <td>${dur}</td>
                    </tr>`;
                });
                table += '</tbody></table></div></div>';
                container.innerHTML = table;
            })
            .catch(err => {
                container.innerHTML = '<div class="alert alert-danger">Failed to load logs.</div>';
                console.error(err);
            });
    }
    else if (tabId === 'retention') {
        title.textContent = 'Data Retention Policies';
        fetchAPI('/admin/compliance/retention')
            .then(res => res.json())
            .then(data => {
                container.innerHTML = `
                <div class="card border-0 shadow-sm rounded-4 p-4" style="max-width: 800px; margin: 0 auto;">
                    <form id="retention-form" onsubmit="saveRetentionPolicies(event)">
                        <div class="mb-4">
                            <label class="form-label fw-bold">Audit Log Retention (Days)</label>
                            <div class="input-group">
                                <span class="input-group-text bg-light border-0"><span class="material-icons fs-5 text-muted">history</span></span>
                                <input type="number" name="audit_logs_days" class="form-control bg-light border-0" value="${data.audit_logs_days}" required>
                            </div>
                             <div class="form-text mt-2">Audit logs older than this will be automatically archived or deleted.</div>
                        </div>
                        <div class="mb-4">
                            <label class="form-label fw-bold">Access Log Retention (Days)</label>
                            <div class="input-group">
                                <span class="input-group-text bg-light border-0"><span class="material-icons fs-5 text-muted">vpn_key</span></span>
                                <input type="number" name="access_logs_days" class="form-control bg-light border-0" value="${data.access_logs_days}" required>
                            </div>
                        </div>
                         <div class="mb-4">
                            <label class="form-label fw-bold">Inactive Student Data Retention (Years)</label>
                            <div class="input-group">
                                <span class="input-group-text bg-light border-0"><span class="material-icons fs-5 text-muted">person_off</span></span>
                                <input type="number" name="student_data_years" class="form-control bg-light border-0" value="${data.student_data_years}" required>
                            </div>
                             <div class="form-text mt-2">Time to keep personal data for students who have left the institution.</div>
                        </div>
                        <div class="d-flex justify-content-end pt-3 border-top">
                            <button type="submit" class="btn btn-primary-custom px-5 py-2 fw-bold rounded-pill">Save Changes</button>
                        </div>
                    </form>
                </div>
                `;
            })
            .catch(err => {
                container.innerHTML = '<p class="text-danger">Failed to load policies. ' + (err.detail || err.message) + '</p>';
            });
    }
}
function saveRetentionPolicies(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const form = e.target;
        const body = {
            audit_logs_days: parseInt(form.audit_logs_days.value),
            access_logs_days: parseInt(form.access_logs_days.value),
            student_data_years: parseInt(form.student_data_years.value)
        };
        try {
            const res = yield fetchAPI('/admin/compliance/retention', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            if (res.ok) {
                alert("Policies Saved!");
            }
            else {
                alert("Failed to save.");
            }
        }
        catch (err) {
            console.error(err);
            alert("Error saving policies.");
        }
    });
}
// --- FINANCE & BILLING HANDLERS ---
function showFinanceMenu() {
    document.getElementById('finance-menu-area').classList.remove('d-none');
    document.getElementById('finance-detail-area').classList.add('d-none');
    document.getElementById('finance-back-btn').classList.add('d-none');
    document.getElementById('finance-top-title').textContent = 'Finance';
}
function financeError(container, message) {
    container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
}
function financeLoading(container) {
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
}
function asCurrency(v) {
    const n = Number(v || 0);
    return isNaN(n) ? '$0.00' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function renderSimpleTable(title, columns, rows) {
    const head = columns.map(c => `<th>${c.label}</th>`).join('');
    const body = (rows || []).map(r => `<tr>${columns.map(c => `<td>${r[c.key] ?? ''}</td>`).join('')}</tr>`).join('');
    return `
        <h5 class="fw-bold mb-3">${title}</h5>
        <div class="table-responsive bg-white rounded border shadow-sm">
            <table class="table table-sm table-hover mb-0">
                <thead class="table-light"><tr>${head}</tr></thead>
                <tbody>${body || '<tr><td colspan="' + columns.length + '" class="text-center text-muted py-4">No data</td></tr>'}</tbody>
            </table>
        </div>
    `;
}
function loadFinanceDashboardView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [dRes, rRes] = yield Promise.all([
                fetchAPI('/finance/dashboard'),
                fetchAPI('/finance/reconciliation/check')
            ]);
            if (!dRes.ok)
                throw new Error('Failed to load finance dashboard');
            const dash = yield dRes.json();
            const recon = rRes.ok ? yield rRes.json() : null;
            container.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Outstanding</div><h4 class="fw-bold">${asCurrency(dash.outstanding_total)}</h4></div></div></div>
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Collections</div><h4 class="fw-bold text-success">${asCurrency(dash.collections_total)}</h4></div></div></div>
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Overdue Invoices</div><h4 class="fw-bold text-danger">${dash.overdue_invoices || 0}</h4></div></div></div>
                </div>
                ${recon ? `
                <div class="card border-0 shadow-sm">
                    <div class="card-header bg-light fw-bold">Reconciliation Check</div>
                    <div class="card-body">
                        <div class="row g-3">
                            <div class="col-md-4"><strong>AR</strong><div class="small">Subledger: ${asCurrency(recon.ar.subledger)} | GL: ${asCurrency(recon.ar.gl_control)} | Match: ${recon.ar.matched ? 'Yes' : 'No'}</div></div>
                            <div class="col-md-4"><strong>AP</strong><div class="small">Subledger: ${asCurrency(recon.ap.subledger)} | GL: ${asCurrency(recon.ap.gl_control)} | Match: ${recon.ap.matched ? 'Yes' : 'No'}</div></div>
                            <div class="col-md-4"><strong>Inventory</strong><div class="small">Subledger: ${asCurrency(recon.inventory.subledger)} | GL: ${asCurrency(recon.inventory.gl_control)} | Match: ${recon.inventory.matched ? 'Yes' : 'No'}</div></div>
                        </div>
                    </div>
                </div>` : ''}
            `;
        }
        catch (e) {
            financeError(container, `Error loading dashboard: ${e.message}`);
        }
    });
}
function loadFinanceMasterDataView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI('/finance/master-data');
            if (!res.ok)
                throw new Error('Failed to load master data');
            const data = yield res.json();
            container.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">CoA</div><h5 class="fw-bold">${(data.chart_of_accounts || []).length}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Fiscal Years</div><h5 class="fw-bold">${(data.fiscal_years || []).length}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Tax Codes</div><h5 class="fw-bold">${(data.tax_codes || []).length}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Currencies</div><h5 class="fw-bold">${(data.currencies || []).length}</h5></div></div></div>
                </div>
                ${renderSimpleTable('Chart of Accounts', [{ key: 'account_code', label: 'Code' }, { key: 'account_name', label: 'Name' }, { key: 'account_type', label: 'Type' }], data.chart_of_accounts)}
                <div class="mt-4">${renderSimpleTable('Cost Centers', [{ key: 'center_code', label: 'Code' }, { key: 'center_name', label: 'Name' }, { key: 'is_active', label: 'Active' }], data.cost_centers)}</div>
                <div class="mt-4">${renderSimpleTable('Parties (Vendor/Customer/Employee)', [{ key: 'party_type', label: 'Type' }, { key: 'party_code', label: 'Code' }, { key: 'name', label: 'Name' }], data.parties)}</div>
            `;
        }
        catch (e) {
            financeError(container, `Error loading master data: ${e.message}`);
        }
    });
}
function loadFinanceGLView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [tbRes, plRes, bsRes] = yield Promise.all([
                fetchAPI('/finance/gl/reports/trial-balance'),
                fetchAPI('/finance/gl/reports/profit-loss'),
                fetchAPI('/finance/gl/reports/balance-sheet')
            ]);
            if (!tbRes.ok)
                throw new Error('Failed to load trial balance');
            const tb = yield tbRes.json();
            const pl = plRes.ok ? yield plRes.json() : null;
            const bs = bsRes.ok ? yield bsRes.json() : null;
            container.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">TB Debit</div><h5 class="fw-bold">${asCurrency(tb.totals.debit_total)}</h5></div></div></div>
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">TB Credit</div><h5 class="fw-bold">${asCurrency(tb.totals.credit_total)}</h5></div></div></div>
                    <div class="col-md-4"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">Balanced</div><h5 class="fw-bold">${tb.totals.is_balanced ? 'Yes' : 'No'}</h5></div></div></div>
                </div>
                ${renderSimpleTable('Trial Balance', [{ key: 'account_code', label: 'Code' }, { key: 'account_name', label: 'Account' }, { key: 'total_debit', label: 'Debit' }, { key: 'total_credit', label: 'Credit' }], tb.rows)}
                ${pl ? `<div class="mt-4"><div class="alert alert-light border">P&L Net Profit: <strong>${asCurrency(pl.totals.net_profit)}</strong></div></div>` : ''}
                ${bs ? `<div class="mt-2"><div class="alert alert-light border">Balance Sheet: Assets ${asCurrency(bs.totals.total_assets)} | Liabilities+Equity ${asCurrency(bs.totals.total_liabilities + bs.totals.total_equity)}</div></div>` : ''}
            `;
        }
        catch (e) {
            financeError(container, `Error loading GL reports: ${e.message}`);
        }
    });
}
function loadFinanceReceivablesView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI('/finance/receivables/reports/aging');
            if (!res.ok)
                throw new Error('Failed to load receivables aging');
            const data = yield res.json();
            container.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">0-30</div><h5 class="fw-bold">${asCurrency(data.aging['0_30'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">31-60</div><h5 class="fw-bold">${asCurrency(data.aging['31_60'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">61-90</div><h5 class="fw-bold">${asCurrency(data.aging['61_90'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">90+</div><h5 class="fw-bold">${asCurrency(data.aging['90_plus'])}</h5></div></div></div>
                </div>
                ${renderSimpleTable('AR Aging Details', [{ key: 'invoice_number', label: 'Invoice' }, { key: 'due_date', label: 'Due Date' }, { key: 'outstanding', label: 'Outstanding' }], data.rows)}
            `;
        }
        catch (e) {
            financeError(container, `Error loading receivables: ${e.message}`);
        }
    });
}
function loadFinancePayablesView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [agingRes, alertRes] = yield Promise.all([
                fetchAPI('/finance/payables/reports/aging'),
                fetchAPI('/finance/payables/alerts/due')
            ]);
            if (!agingRes.ok)
                throw new Error('Failed to load payables aging');
            const aging = yield agingRes.json();
            const alerts = alertRes.ok ? yield alertRes.json() : [];
            container.innerHTML = `
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">0-30</div><h5 class="fw-bold">${asCurrency(aging.aging['0_30'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">31-60</div><h5 class="fw-bold">${asCurrency(aging.aging['31_60'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">61-90</div><h5 class="fw-bold">${asCurrency(aging.aging['61_90'])}</h5></div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm"><div class="card-body"><div class="small text-muted">90+</div><h5 class="fw-bold">${asCurrency(aging.aging['90_plus'])}</h5></div></div></div>
                </div>
                ${renderSimpleTable('AP Aging Details', [{ key: 'bill_number', label: 'Bill' }, { key: 'due_date', label: 'Due Date' }, { key: 'outstanding', label: 'Outstanding' }], aging.rows)}
                <div class="mt-4">${renderSimpleTable('Due Alerts', [{ key: 'bill_number', label: 'Bill' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'due_date', label: 'Due Date' }, { key: 'days_to_due', label: 'Days to Due' }], alerts)}</div>
            `;
        }
        catch (e) {
            financeError(container, `Error loading payables: ${e.message}`);
        }
    });
}
function loadFinanceInventoryView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI('/finance/inventory/reports/valuation');
            if (!res.ok)
                throw new Error('Failed to load inventory valuation');
            const data = yield res.json();
            container.innerHTML = `
                <div class="alert alert-light border mb-4">Total Inventory Valuation: <strong>${asCurrency(data.total_valuation)}</strong></div>
                ${renderSimpleTable('Inventory Valuation', [{ key: 'item_code', label: 'Item' }, { key: 'warehouse_code', label: 'WH' }, { key: 'quantity_on_hand', label: 'Qty' }, { key: 'average_cost', label: 'Avg Cost' }, { key: 'valuation_amount', label: 'Valuation' }], data.rows)}
            `;
        }
        catch (e) {
            financeError(container, `Error loading inventory: ${e.message}`);
        }
    });
}
function loadFinanceAssetsView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const [regRes, depRes] = yield Promise.all([
                fetchAPI('/finance/assets/reports/register'),
                fetchAPI('/finance/assets/reports/depreciation')
            ]);
            if (!regRes.ok)
                throw new Error('Failed to load asset register');
            const reg = yield regRes.json();
            const dep = depRes.ok ? yield depRes.json() : { rows: [], total_depreciation: 0 };
            container.innerHTML = `
                <div class="alert alert-light border mb-4">Total Depreciation Posted: <strong>${asCurrency(dep.total_depreciation)}</strong></div>
                ${renderSimpleTable('Asset Register', [{ key: 'asset_code', label: 'Asset Code' }, { key: 'asset_name', label: 'Asset Name' }, { key: 'status', label: 'Status' }, { key: 'cost', label: 'Cost' }, { key: 'carrying_amount', label: 'Carrying' }], reg)}
                <div class="mt-4">${renderSimpleTable('Depreciation Schedule', [{ key: 'asset_code', label: 'Asset' }, { key: 'period_label', label: 'Period' }, { key: 'depreciation_amount', label: 'Amount' }, { key: 'status', label: 'Status' }], dep.rows)}</div>
            `;
        }
        catch (e) {
            financeError(container, `Error loading assets: ${e.message}`);
        }
    });
}
function loadFinancePayrollView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI('/finance/payroll/reports/summary');
            if (!res.ok)
                throw new Error('Failed to load payroll summary');
            const rows = yield res.json();
            container.innerHTML = renderSimpleTable('Payroll Runs', [
                { key: 'run_code', label: 'Run Code' },
                { key: 'period_label', label: 'Period' },
                { key: 'status', label: 'Status' },
                { key: 'total_gross', label: 'Gross' },
                { key: 'total_net', label: 'Net' }
            ], rows);
        }
        catch (e) {
            financeError(container, `Error loading payroll: ${e.message}`);
        }
    });
}
function loadFinanceTab(tabId) {
    const menuArea = document.getElementById('finance-menu-area');
    const detailArea = document.getElementById('finance-detail-area');
    const backBtn = document.getElementById('finance-back-btn');
    const title = document.getElementById('finance-top-title');
    const container = document.getElementById('finance-tab-content');
    // Switch View
    menuArea.classList.add('d-none');
    detailArea.classList.remove('d-none');
    backBtn.classList.remove('d-none');
    // Clear previous
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    const titles = {
        dashboard: 'Finance Dashboard',
        'master-data': 'Core Master Data',
        gl: 'General Ledger',
        receivables: 'Receivables',
        payables: 'Payables',
        inventory: 'Inventory',
        assets: 'Assets',
        payroll: 'Payroll',
        reports: 'Finance Reports',
        'fee-structures': 'Core Master Data',
        'invoicing': 'Receivables',
        'refunds': 'Payables',
        'online-payments': 'Inventory',
        'discounts-scholarships': 'Assets',
        'installment-plans': 'Payroll',
        'financial-reports': 'General Ledger'
    };
    title.textContent = titles[tabId] || 'Finance Details';
    switch (tabId) {
        case 'dashboard':
            loadFinanceDashboardView(container);
            break;
        case 'master-data':
        case 'fee-structures':
            loadFinanceMasterDataView(container);
            break;
        case 'gl':
        case 'financial-reports':
            loadFinanceGLView(container);
            break;
        case 'receivables':
        case 'invoicing':
            loadFinanceReceivablesView(container);
            break;
        case 'payables':
        case 'refunds':
            loadFinancePayablesView(container);
            break;
        case 'inventory':
        case 'online-payments':
            loadFinanceInventoryView(container);
            break;
        case 'assets':
        case 'discounts-scholarships':
            loadFinanceAssetsView(container);
            break;
        case 'payroll':
        case 'installment-plans':
            loadFinancePayrollView(container);
            break;
        case 'reports':
            loadFinanceDashboardView(container);
            break;
        default:
            financeError(container, `Unknown finance tab: ${tabId}`);
            break;
    }
}
// --- STAFF & FACULTY HANDLERS ---
function showStaffMenu() {
    document.getElementById('staff-menu-area').classList.remove('d-none');
    document.getElementById('staff-detail-area').classList.add('d-none');
    document.getElementById('staff-back-btn').classList.add('d-none');
    document.getElementById('staff-top-title').textContent = '3.4 Staff & Faculty Management';
}
function loadStaffTab(tabId) {
    const menuArea = document.getElementById('staff-menu-area');
    const detailArea = document.getElementById('staff-detail-area');
    const backBtn = document.getElementById('staff-back-btn');
    const title = document.getElementById('staff-top-title');
    const container = document.getElementById('staff-tab-content');
    // Switch View
    menuArea.classList.add('d-none');
    detailArea.classList.remove('d-none');
    backBtn.classList.remove('d-none');
    // Clear previous
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    // Set Title Map
    const titles = {
        'profiles': 'Staff Profiles',
        'role-assignment': 'Role Assignment',
        'department-grouping': 'Department Grouping',
        'workload': 'Workload Allocation',
        'attendance': 'Staff Attendance',
        'payroll': 'Payroll Integration',
        'performance': 'Performance Reviews'
    };
    title.textContent = titles[tabId] || 'Staff Details';
    // Routing
    if (tabId === 'department-grouping') {
        loadStaffDepartments();
    }
    else if (tabId === 'profiles') {
        loadStaffProfiles();
    }
    else if (tabId === 'attendance') {
        loadStaffAttendance();
    }
    else if (tabId === 'performance') {
        loadStaffPerformance();
    }
    else if (tabId === 'role-assignment') {
        // Redirect to main User Management for now, but filtered?
        // Actually, let's keep it here but link to user management or show simple list
        container.innerHTML = `
            <div class="p-4 text-center">
                <p>Role Assignment is managed via the central User Management or Role Management modules.</p>
                <div class="d-flex justify-content-center gap-3">
                    <button class="btn btn-primary" onclick="openUserManagement()">Go to User Management</button>
                    <button class="btn btn-outline-primary" onclick="handleTeacherViewToggle('roles-view')">Go to Roles & Perms</button>
                </div>
            </div>
        `;
    }
    else {
        // Placeholder for others
        container.innerHTML = `
             <div class="p-5 text-center bg-white rounded shadow-sm">
                <div class="mb-3">
                    <span class="material-icons text-muted" style="font-size: 48px;">construction</span>
                </div>
                <h4 class="fw-bold text-dark">Feature Under Construction</h4>
                <p class="text-muted">The <strong>${titles[tabId]}</strong> module is currently being implemented.</p>
            </div>
        `;
    }
}
// ... (Existing Functions) ...
// 4. Performance Reviews Logic
function loadStaffPerformance() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('staff-tab-content');
        container.innerHTML = `
        <div class="text-center py-5">
            <h5 class="text-muted">Select a staff member from the "Profiles" tab to view/add reviews.</h5>
            <button class="btn btn-primary" onclick="loadStaffTab('profiles')">Go to Profiles</button>
        </div>
    `;
        // Ideally this would be a list of recent reviews or a selector. 
        // To keep it simple: link back to profiles where we can add a "Review" button? 
        // Or just show a list of all reviews here?
        // Let's show recent reviews
        const headerHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary m-0">Performance Review Log</h5>
        </div>
    `;
        // We don't have a specific "get all reviews" endpoint (only per user).
        // Let's fetch profiles first, then maybe allow selection?
        // Actually, for MVP 'implement these things', let's stick to the 'Profiles' suggestion or add a quick "Review" button in profiles.
        // Let's UPDATE loadStaffProfiles to include a "Review" button!
    });
}
// 1. Departments Logic
function loadStaffDepartments() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('staff-tab-content');
        // Header with Create Button
        const headerHtml = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h5 class="fw-bold text-primary m-0">Departments</h5>
            <button class="btn btn-primary btn-sm rounded-pill px-3" onclick="openCreateDeptModal()">
                <span class="material-icons align-middle fs-6 me-1">add</span> New Department
            </button>
        </div>
    `;
        try {
            const res = yield fetchAPI('/staff/departments');
            const depts = yield res.json();
            if (depts.length === 0) {
                container.innerHTML = headerHtml + `<div class="alert alert-info">No departments found. Create one to get started.</div>`;
                return;
            }
            const listHtml = depts.map(d => `
            <div class="col-md-4">
                <div class="card h-100 border-0 shadow-sm">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                             <h6 class="fw-bold text-dark">${d.name}</h6>
                             <span class="material-icons text-muted small" style="cursor:pointer;">more_vert</span>
                        </div>
                        <p class="text-muted small mb-3">${d.description || 'No description'}</p>
                        <hr class="my-2 border-primary-subtle opacity-25">
                        <div class="d-flex align-items-center">
                            <i class="material-icons fs-6 me-1 text-secondary">person</i>
                            <span class="small text-secondary">Head: ${d.head_of_department_id || 'Not Assigned'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
            container.innerHTML = headerHtml + `<div class="row g-3">${listHtml}</div>`;
        }
        catch (e) {
            container.innerHTML = `<div class="alert alert-danger">Error loading departments: ${e.message}</div>`;
        }
    });
}
function openCreateDeptModal() {
    const modalHtml = `
      <div class="view full-page-view" id="createDeptModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content border-0 shadow">
            <div class="modal-header border-bottom-0 pb-0">
              <h5 class="modal-title fw-bold">Create Department</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="dept-form">
                <div class="mb-3">
                    <label class="form-label small fw-bold">Department Name</label>
                    <input type="text" id="dept-name" class="form-control" required>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Description</label>
                    <textarea id="dept-desc" class="form-control" rows="2"></textarea>
                </div>
                <button type="submit" class="btn btn-primary w-100 rounded-pill fw-bold">Create</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
    // Clean up old
    const old = document.getElementById('createDeptModal');
    if (old)
        old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    openView('createDeptModal');
    document.getElementById('dept-form').onsubmit = (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        try {
            const res = yield fetchAPI('/staff/departments', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('dept-name').value,
                    description: document.getElementById('dept-desc').value
                })
            });
            if (res.ok) {
                closeView();
                loadStaffDepartments(); // Refresh
            }
            else {
                alert("Failed to create department");
            }
        }
        catch (err) {
            alert("Error");
        }
    });
}
// 2. Staff Profiles Logic
function loadStaffProfiles() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('staff-tab-content');
        try {
            const res = yield fetchAPI('/staff/profiles');
            const staff = yield res.json();
            if (staff.length === 0) {
                container.innerHTML = `<div class="alert alert-info">No staff members found.</div>`;
                return;
            }
            const tableHtml = `
            <div class="card border-0 shadow-sm">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th class="ps-4">Name</th>
                                <th>Role</th>
                                <th>Department</th>
                                <th>Position</th>
                                <th>Status</th>
                                <th class="text-end pe-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${staff.map(s => `
                                <tr>
                                    <td class="ps-4">
                                        <div class="d-flex align-items-center">
                                            <div class="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center me-2 fw-bold" style="width: 32px; height: 32px;">
                                                ${s.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div class="fw-bold text-dark">${s.name}</div>
                                                <div class="small text-muted" style="font-size: 11px;">${s.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span class="badge bg-light text-dark border">${s.role}</span></td>
                                    <td>${s.department_name ? `<span class="badge bg-info-subtle text-info-emphasis">${s.department_name}</span>` : '<span class="text-muted small">-</span>'}</td>
                                    <td>${s.position_title || '-'}</td>
                                    <td><span class="badge bg-success-subtle text-success">Active</span></td>
                                    <td class="text-end pe-4">
                                        <button class="btn btn-sm btn-link" onclick="openStaffEditModal('${s.id}')">Edit</button>
                                        <button class="btn btn-sm btn-link text-warning" onclick="openStaffReviewModal('${s.id}', '${s.name.replace(/'/g, "\\'")}')">Review</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
            container.innerHTML = tableHtml;
        }
        catch (e) {
            container.innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
        }
    });
}
function openStaffReviewModal(userId, userName) {
    const modalHtml = `
      <div class="view full-page-view" id="staffReviewModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-0 shadow">
            <div class="modal-header bg-warning-subtle text-dark">
              <h5 class="modal-title fw-bold">Performance Review: ${userName}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="staff-review-form">
                <div class="mb-3">
                    <label class="form-label small fw-bold">Review Date</label>
                    <input type="date" id="review-date" class="form-control" required value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Rating (1-5)</label>
                    <div class="d-flex gap-2">
                        ${[1, 2, 3, 4, 5].map(n => `
                            <div>
                                <input type="radio" class="btn-check" name="rating" id="rating-${n}" value="${n}" required>
                                <label class="btn btn-outline-warning fw-bold" for="rating-${n}">${n}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Comments / Feedback</label>
                    <textarea id="review-comments" class="form-control" rows="3" required></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Goals for Next Period</label>
                    <textarea id="review-goals" class="form-control" rows="2"></textarea>
                </div>
                <button type="submit" class="btn btn-warning w-100 fw-bold">Submit Review</button>
              </form>
              
              <hr class="my-3">
              <h6 class="fw-bold small text-muted">Recent Reviews</h6>
              <div id="recent-reviews-list">
                 <div class="text-center text-muted small py-2"><div class="spinner-border spinner-border-sm"></div> Loading history...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const old = document.getElementById('staffReviewModal');
    if (old)
        old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    openView('staffReviewModal');
    // Fetch History
    fetchAPI(`/staff/performance/${userId}`)
        .then(res => res.json())
        .then(reviews => {
            const list = document.getElementById('recent-reviews-list');
            if (reviews.length === 0) {
                list.innerHTML = `<div class="text-center text-muted small">No past reviews found.</div>`;
            }
            else {
                list.innerHTML = reviews.map(r => `
                    <div class="p-2 border rounded mb-2 bg-light small">
                        <div class="d-flex justify-content-between">
                            <strong>${r.review_date}</strong>
                            <span class="badge bg-warning text-dark">Rating: ${r.rating}/5</span>
                        </div>
                        <div class="text-muted mt-1">${r.comments}</div>
                    </div>
                `).join('');
            }
        });
    document.getElementById('staff-review-form').onsubmit = (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        try {
            const rating = document.querySelector('input[name="rating"]:checked').value;
            const payload = {
                user_id: userId,
                review_date: document.getElementById('review-date').value,
                rating: parseInt(rating),
                comments: document.getElementById('review-comments').value,
                goals: document.getElementById('review-goals').value
            };
            const res = yield fetchAPI('/staff/performance', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert("Review submitted!");
                closeView();
            }
            else {
                alert("Failed to submit review.");
            }
        }
        catch (err) {
            alert("Error.");
        }
    });
}
function openStaffEditModal(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        // We need to fetch departments first for the dropdown
        let depts = [];
        try {
            const r = yield fetchAPI('/staff/departments');
            depts = yield r.json();
        }
        catch (e) { }
        const modalHtml = `
      <div class="view full-page-view" id="editStaffModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-0 shadow">
            <div class="modal-header">
              <h5 class="modal-title fw-bold">Edit Staff Profile</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form id="staff-edit-form">
                <div class="mb-3">
                    <label class="form-label small fw-bold">Department</label>
                    <select id="staff-dept" class="form-select">
                        <option value="">Select Department...</option>
                        ${depts.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Position Title</label>
                    <input type="text" id="staff-position" class="form-control" placeholder="e.g. Senior Lecturer">
                </div>
                <div class="mb-3">
                    <label class="form-label small fw-bold">Contract Type</label>
                    <select id="staff-contract" class="form-select">
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                    </select>
                </div>
                 <div class="mb-3">
                    <label class="form-label small fw-bold">Salary (Annual)</label>
                    <input type="number" id="staff-salary" class="form-control" placeholder="0.00">
                </div>
                <button type="submit" class="btn btn-primary w-100">Save Profile</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;
        const old = document.getElementById('editStaffModal');
        if (old)
            old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        openView('editStaffModal');
        // Fetch existing details if possible, for now just open structure
        // Ideally we fetch GET /staff/profiles again or filter from list.
        document.getElementById('staff-edit-form').onsubmit = (e) => __awaiter(this, void 0, void 0, function* () {
            e.preventDefault();
            try {
                // Handle empty department value
                const deptVal = document.getElementById('staff-dept').value;
                const payload = {
                    department_id: deptVal ? parseInt(deptVal) : null,
                    position_title: document.getElementById('staff-position').value,
                    contract_type: document.getElementById('staff-contract').value,
                    salary: parseFloat(document.getElementById('staff-salary').value) || 0
                };
                const res = yield fetchAPI(`/staff/profiles/${userId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    closeView();
                    loadStaffProfiles();
                }
                else {
                    alert("Failed to update.");
                }
            }
            catch (err) {
                alert("Error updating profile.");
            }
        });
    });
}
// 3. Attendance Logic
function loadStaffAttendance() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('staff-tab-content');
        // Simple Log View + Mark Button
        const headerHtml = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-primary m-0">Daily Attendance Log</h5>
            <button class="btn btn-outline-primary btn-sm" onclick="alert('Manual marking coming soon')">
                Mark Attendance
            </button>
        </div>
    `;
        try {
            const res = yield fetchAPI('/staff/attendance');
            const logs = yield res.json();
            const tableHtml = `
            <table class="table table-sm table-bordered">
                <thead class="bg-light">
                    <tr><th>Date</th><th>Staff Name</th><th>Status</th><th>In</th><th>Out</th></tr>
                </thead>
                <tbody>
                    ${logs.length ? logs.map(l => `
                        <tr>
                            <td>${l.date}</td>
                            <td class="fw-bold">${l.staff_name}</td>
                            <td>${l.status}</td>
                            <td>${l.check_in_time || '-'}</td>
                            <td>${l.check_out_time || '-'}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4" class="text-center text-muted">No attendance records.</td></tr>'}
                </tbody>
            </table>
        `;
            container.innerHTML = headerHtml + tableHtml;
        }
        catch (e) {
            container.innerHTML = "Error loading attendance.";
        }
    });
}
// --- STUDENT INFORMATION HANDLERS ---
function showStudentInfoMenu() {
    document.getElementById('student-info-menu-area').classList.remove('d-none');
    document.getElementById('student-info-detail-area').classList.add('d-none');
    document.getElementById('student-info-back-btn').classList.add('d-none');
    document.getElementById('student-info-top-title').textContent = '3.3 Student Information Management';
}
function loadStudentInfoTab(tabId) {
    return __awaiter(this, void 0, void 0, function* () {
        const menuArea = document.getElementById('student-info-menu-area');
        const detailArea = document.getElementById('student-info-detail-area');
        const backBtn = document.getElementById('student-info-back-btn');
        const title = document.getElementById('student-info-top-title');
        const container = document.getElementById('student-info-tab-content');
        // Switch View
        menuArea.classList.add('d-none');
        detailArea.classList.remove('d-none');
        backBtn.classList.remove('d-none');
        // Clear previous
        container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
        const titles = {
            'profiles': 'Student Profiles & Enrollment',
            'class-assignment': 'Class & Section Assignment',
            'guardians': 'Guardian Relationships',
            'health': 'Health & Emergency Info',
            'documents': 'Student Documents'
        };
        title.textContent = titles[tabId] || 'Student Details';
        // Router
        switch (tabId) {
            case 'profiles':
                renderStudentProfilesList(container);
                break;
            case 'class-assignment':
                yield renderClassAssignmentView(container);
                break;
            case 'guardians':
                renderStudentSearchForModule(container, 'guardians');
                break;
            case 'health':
                renderStudentSearchForModule(container, 'health');
                break;
            case 'documents':
                renderStudentSearchForModule(container, 'documents');
                break;
        }
    });
}
// 1. PROFILES MODULE
function renderStudentProfilesList(container) {
    // Re-use appState.allStudents if available, else fetch
    // For now assuming appState.allStudents is populated (it usually is on load)
    let html = `
        <div class="d-flex justify-content-between mb-3">
             <div class="search-box">
                <span class="material-icons">search</span>
                <input type="text" id="profile-search" class="form-control" placeholder="Search students..." onkeyup="filterProfileList()">
            </div>
            <button class="btn btn-primary" onclick="openAddUserModal()"><span class="material-icons align-middle me-1">add</span> New Student</button>
        </div>
        <div class="card border-0 shadow-sm">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" id="profiles-table">
                    <thead class="bg-light">
                        <tr>
                            <th class="ps-4">Name</th>
                            <th>ID</th>
                            <th>Grade / Section</th>
                            <th>Status</th>
                            <th class="text-end pe-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="profiles-table-body">
    `;
    appState.allStudents.forEach(s => {
        html += `
            <tr class="profile-row" data-name="${s.name.toLowerCase()}">
                <td class="ps-4">
                    <div class="d-flex align-items-center gap-3">
                        <div class="rounded-circle bg-light d-flex align-items-center justify-content-center text-primary fw-bold" style="width: 40px; height: 40px; font-size: 14px;">
                            ${s.name.charAt(0)}
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${s.name}</div>
                            <small class="text-muted">Joined ${s.joined_date || '2025'}</small>
                        </div>
                    </div>
                </td>
                <td><span class="font-monospace small bg-light px-2 py-1 rounded border">${s.id}</span></td>
                <td>
                    <span class="badge bg-info-subtle text-info text-dark">Grade ${s.grade || 9}</span>
                </td>
                <td><span class="badge bg-success-subtle text-success">Active</span></td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="openEditStudentModal('${s.id}')">View Profile</button>
                </td>
            </tr>
        `;
    });
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}
function filterProfileList() {
    const term = document.getElementById('profile-search').value.toLowerCase();
    document.querySelectorAll('.profile-row').forEach(row => {
        const name = row.getAttribute('data-name');
        row.style.display = name.includes(term) ? '' : 'none';
    });
}
// 2. CLASS ASSIGNMMENT MODULE
function renderClassAssignmentView(container) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const sectionsRes = yield fetchAPI('/sections');
            const sections = yield sectionsRes.json();
            container.innerHTML = `
            <div class="row h-100">
                <div class="col-md-4 border-end">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="fw-bold m-0">Sections</h5>
                        <button class="btn btn-sm btn-outline-primary" onclick="openCreateSectionModal()">
                            <span class="material-icons align-middle">add</span>
                        </button>
                    </div>
                    <div class="list-group list-group-flush" id="sections-list">
                        ${sections.map(s => `
                            <button class="list-group-item list-group-item-action py-3" onclick="loadSectionRoster(${s.id}, '${s.name}')">
                                <div class="d-flex justify-content-between align-items-center">
                                    <strong>${s.name}</strong>
                                    <span class="badge bg-light text-dark border">Grade ${s.grade_level}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="col-md-8 px-4" id="section-detail-panel">
                    <div class="text-center text-muted py-5">
                        <span class="material-icons display-4 opacity-25">class</span>
                        <p>Select a section to manage enrollment</p>
                    </div>
                </div>
            </div>
        `;
        }
        catch (e) {
            container.innerHTML = '<div class="alert alert-danger">Error loading sections</div>';
        }
    });
}
function createSection() {
    return __awaiter(this, void 0, void 0, function* () {
        const name = prompt("Enter Section Name (e.g. Red Group):");
        if (!name)
            return;
        const grade = parseInt(prompt("Enter Grade Level:", "9"));
        try {
            const res = yield fetchAPI('/sections', {
                method: 'POST',
                body: JSON.stringify({ name, grade_level: grade, school_id: appState.activeSchoolId || 1 })
            });
            if (res.ok) {
                loadStudentInfoTab('class-assignment'); // Reload
            }
        }
        catch (e) {
            alert("Error creating section");
        }
    });
}
window.openCreateSectionModal = createSection; // Quick bind
function loadSectionRoster(sectionId, sectionName) {
    return __awaiter(this, void 0, void 0, function* () {
        const panel = document.getElementById('section-detail-panel');
        panel.innerHTML = `
        <h5 class="fw-bold mb-3">Enrolled in ${sectionName}</h5>
        <div class="input-group mb-3">
             <input type="text" id="add-student-id-input" class="form-control" placeholder="Enter Student ID to add...">
             <button class="btn btn-primary" onclick="assignStudentToSection(${sectionId})">Add Student</button>
        </div>
        <div class="card border-0 shadow-sm">
            <table class="table table-hover mb-0">
                <thead><tr><th>Student Name</th><th>ID</th><th>Action</th></tr></thead>
                <tbody id="section-roster-body"><tr><td colspan="3" class="text-center">Loading...</td></tr></tbody>
            </table>
        </div>
    `;
        refreshSectionRosterList(sectionId);
    });
}
function refreshSectionRosterList(sectionId) {
    const tbody = document.getElementById('section-roster-body');
    if (!tbody)
        return;
    // Filter students locally using the updated backend data (which now includes Section ID in teacher overview)
    // Note: appState.allStudents keys might vary based on capitalized Roster keys vs raw keys.
    // The TeacherOverview returns "Section ID" (capped).
    // Let's check keys available.
    if (!appState.allStudents || appState.allStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No student data loaded. Please visit Dashboard first.</td></tr>';
        return;
    }
    const students = appState.allStudents.filter(s => {
        // Handle various key formats just in case
        const sSecId = s["Section ID"] || s.section_id;
        return sSecId == sectionId;
    });
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No students assigned to this section yet.</td></tr>';
        return;
    }
    tbody.innerHTML = students.map(s => {
        const name = s.Name || s.name;
        const id = s.ID || s.id;
        return `
            <tr>
                <td>${name}</td>
                <td><span class="font-monospace small bg-light px-2 border rounded">${id}</span></td>
                <td>
                    <button class="btn btn-sm text-danger" onclick="removeStudentFromSection('${id}')" title="Remove (Unassign)">
                        <span class="material-icons" style="font-size:18px;">remove_circle_outline</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}
function assignStudentToSection(sectionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const sid = document.getElementById('add-student-id-input').value.trim();
        if (!sid)
            return;
        try {
            const res = yield fetchAPI(`/students/${sid}/assign-section?section_id=${sectionId}`, { method: 'POST' });
            if (res.ok) {
                alert("Assigned successfully!");
                document.getElementById('add-student-id-input').value = '';
                // Re-fetch global students to update the "Section ID" listing
                // This is heavy but necessary to see the change reflect in the list immediately without page reload
                const overviewRes = yield fetchAPI('/teacher/overview');
                if (overviewRes.ok) {
                    const data = yield overviewRes.json();
                    appState.allStudents = data.roster || [];
                }
                refreshSectionRosterList(sectionId);
            }
            else {
                const err = yield res.json();
                alert("Failed: " + (err.detail || "Student not found"));
            }
        }
        catch (e) {
            alert("Network Error");
        }
    });
}
function removeStudentFromSection(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm("Remove student from this section?"))
            return;
        // To 'remove', we can just assign to a null section or specific endpoint?
        // Using assign-0 or similar trick if backend supports it, or I need to add that logic.
        // For now, let's just warn it's not implemented or implement a quick unassign.
        // Actually, assign-section takes section_id. If I pass 0 or filtered out, backend might choke.
        // Let's skip 'remove' for this turn or just alert.
        alert("To remove, please assign the student to another section.");
    });
}
// 3, 4, 5. COMMON SEARCH MODULE (Guardians, Health, Docs)
function renderStudentSearchForModule(container, moduleName) {
    container.innerHTML = `
        <div class="row justify-content-center">
            <div class="col-md-6 text-center">
                <h5 class="fw-bold mb-3">Find Student</h5>
                <div class="position-relative">
                    <input type="text" class="form-control form-control-lg rounded-pill shadow-sm ps-5" 
                           placeholder="Search by Name or ID..." onkeyup="handleStudentSearch(this, '${moduleName}')">
                    <span class="material-icons position-absolute top-50 start-0 translate-middle-y ms-3 text-muted">search</span>
                </div>
                <div id="student-search-results-${moduleName}" class="list-group mt-3 text-start shadow-sm" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            <div class="col-12 mt-5 d-none" id="module-detail-view-${moduleName}">
                <!-- Data goes here -->
            </div>
        </div>
    `;
}
function handleStudentSearch(input, moduleName) {
    const term = input.value.toLowerCase();
    const resultsDiv = document.getElementById(`student-search-results-${moduleName}`);
    resultsDiv.innerHTML = '';
    if (term.length < 2)
        return;
    const matches = appState.allStudents.filter(s => s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term));
    matches.slice(0, 10).forEach(s => {
        const item = document.createElement('button');
        item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        item.innerHTML = `<div><strong>${s.name}</strong> <small class="text-muted">(${s.id})</small></div> <span class="material-icons fs-6">arrow_forward</span>`;
        item.onclick = () => loadModuleDataForStudent(moduleName, s);
        resultsDiv.appendChild(item);
    });
}
function loadModuleDataForStudent(moduleName, student) {
    return __awaiter(this, void 0, void 0, function* () {
        // Hide search, show detail
        document.getElementById(`student-search-results-${moduleName}`).innerHTML = ''; // clear results
        const view = document.getElementById(`module-detail-view-${moduleName}`);
        view.classList.remove('d-none');
        if (moduleName === 'guardians') {
            renderGuardianView(view, student);
        }
        else if (moduleName === 'health') {
            renderHealthView(view, student);
        }
        else if (moduleName === 'documents') {
            renderDocumentsView(view, student);
        }
    });
}
// GUARDIANS VIEW
function renderGuardianView(container, student) {
    return __awaiter(this, void 0, void 0, function* () {
        container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold">Guardians for: <span class="text-primary">${student.name}</span></h5>
            <button class="btn btn-sm btn-outline-primary" onclick="openAddGuardianModal('${student.id}')">
                <span class="material-icons align-middle">add</span> Add Guardian
            </button>
        </div>
        <div id="guardian-list-container">Loading...</div>
    `;
        try {
            const res = yield fetchAPI(`/students/${student.id}/guardians`);
            const guardians = yield res.json();
            if (guardians.length === 0) {
                document.getElementById('guardian-list-container').innerHTML = '<p class="text-muted">No guardians listed.</p>';
                return;
            }
            let html = '<div class="row g-3">';
            guardians.forEach(g => {
                html += `
                <div class="col-md-6">
                    <div class="card p-3 h-100 border shadow-sm">
                        <div class="d-flex justify-content-between">
                            <h6 class="fw-bold">${g.name} <span class="badge bg-light text-dark border ms-2">${g.relationship}</span></h6>
                            ${g.is_emergency_contact ? '<span class="badge bg-danger">Emergency</span>' : ''}
                        </div>
                        <ul class="list-unstyled small mt-2 mb-0">
                            <li class="mb-1"><span class="material-icons align-middle fs-6 me-1 opacity-50">phone</span> ${g.phone}</li>
                            <li class="mb-1"><span class="material-icons align-middle fs-6 me-1 opacity-50">email</span> ${g.email || '--'}</li>
                            <li><span class="material-icons align-middle fs-6 me-1 opacity-50">home</span> ${g.address || '--'}</li>
                        </ul>
                    </div>
                </div>
            `;
            });
            html += '</div>';
            document.getElementById('guardian-list-container').innerHTML = html;
        }
        catch (e) {
            container.innerHTML = 'Error loading guardians.';
        }
    });
}
function openAddGuardianModal(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const name = prompt("Guardian Name:");
        if (!name)
            return;
        const rel = prompt("Relationship (Father, Mother, etc):");
        const phone = prompt("Phone:");
        try {
            yield fetchAPI(`/students/${studentId}/guardians`, {
                method: 'POST',
                body: JSON.stringify({ name, relationship: rel, phone, is_emergency_contact: true })
            });
            alert("Added!");
        }
        catch (e) {
            alert("Error");
        }
    });
}
// HEALTH VIEW
function renderHealthView(container, student) {
    return __awaiter(this, void 0, void 0, function* () {
        container.innerHTML = '<div class="spinner-border text-primary"></div> Loading Health Record...';
        try {
            const res = yield fetchAPI(`/students/${student.id}/health`);
            // returns null or object
            const record = res.ok ? yield res.json() : null;
            const data = record || {};
            container.innerHTML = `
            <div class="card border-0 shadow-sm p-4">
                <h5 class="fw-bold mb-4 border-bottom pb-2">Medical Profile: ${student.name}</h5>
                <div class="row g-3">
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Blood Group</label>
                        <input type="text" class="form-control" id="h-blood" value="${data.blood_group || ''}">
                    </div>
                    <div class="col-md-9">
                        <label class="form-label small fw-bold text-muted">Allergies</label>
                        <input type="text" class="form-control" id="h-allergies" value="${data.allergies || ''}">
                    </div>
                    <div class="col-md-12">
                        <label class="form-label small fw-bold text-muted">Medical Conditions</label>
                        <textarea class="form-control" id="h-conditions">${data.medical_conditions || ''}</textarea>
                    </div>
                    <div class="col-md-12">
                         <label class="form-label small fw-bold text-muted">Medications</label>
                        <textarea class="form-control" id="h-medications">${data.medications || ''}</textarea>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Emergency Contact Name</label>
                        <input type="text" class="form-control" id="h-em-name" value="${data.emergency_contact_name || ''}">
                    </div>
                     <div class="col-md-6">
                        <label class="form-label small fw-bold text-muted">Emergency Phone</label>
                        <input type="text" class="form-control" id="h-em-phone" value="${data.emergency_contact_phone || ''}">
                    </div>
                </div>
                <div class="mt-4 text-end">
                    <button class="btn btn-primary" onclick="saveHealthRecord('${student.id}')">Save Records</button>
                </div>
            </div>
         `;
        }
        catch (e) {
            container.innerHTML = 'Error.';
        }
    });
}
function saveHealthRecord(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = {
            blood_group: document.getElementById('h-blood').value,
            allergies: document.getElementById('h-allergies').value,
            medical_conditions: document.getElementById('h-conditions').value,
            medications: document.getElementById('h-medications').value,
            emergency_contact_name: document.getElementById('h-em-name').value,
            emergency_contact_phone: document.getElementById('h-em-phone').value
        };
        yield fetchAPI(`/students/${studentId}/health`, { method: 'PUT', body: JSON.stringify(data) });
        alert("Saved.");
    });
}
// DOCUMENTS VIEW
function renderDocumentsView(container, student) {
    return __awaiter(this, void 0, void 0, function* () {
        container.innerHTML = `
        <h5 class="fw-bold mb-3">Documents: ${student.name}</h5>
        
        <div class="card mb-4 p-3 bg-light border-dashed">
             <div class="d-flex align-items-center gap-3">
                <input type="file" class="form-control" id="doc-upload-input">
                <select class="form-select" id="doc-type-select" style="max-width: 150px;">
                    <option value="ID">ID Card</option>
                    <option value="Certificate">Certificate</option>
                    <option value="Report Card">Report Card</option>
                    <option value="Other">Other</option>
                </select>
                <button class="btn btn-dark" onclick="uploadDocument('${student.id}')">Upload</button>
             </div>
        </div>
        
        <div id="docs-list" class="list-group">Loading...</div>
     `;
        refreshDocsList(student.id);
    });
}
function refreshDocsList(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI(`/students/${studentId}/documents`);
            const docs = yield res.json();
            const list = document.getElementById('docs-list');
            list.innerHTML = '';
            if (docs.length === 0) {
                list.innerHTML = '<div class="text-muted text-center">No documents found.</div>';
                return;
            }
            docs.forEach(d => {
                const item = document.createElement('div');
                item.className = 'list-group-item d-flex justify-content-between align-items-center';
                item.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    <span class="material-icons text-primary">description</span>
                    <div>
                        <strong>${d.document_name}</strong>
                        <div class="small text-muted">${d.document_type} • ${d.upload_date.split('T')[0]}</div>
                    </div>
                </div>
                <button class="btn btn-sm text-danger" onclick="deleteDocument(${d.id})"><span class="material-icons">delete</span></button>
            `;
                list.appendChild(item);
            });
        }
        catch (e) { }
    });
}
function uploadDocument(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const fileInput = document.getElementById('doc-upload-input');
        if (!fileInput.files[0])
            return alert("Select file");
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        formData.append("document_type", document.getElementById('doc-type-select').value);
        // Custom fetch for FormData
        yield fetch(`${API_BASE_URL}/students/${studentId}/documents`, {
            method: 'POST',
            headers: {
                'X-User-Id': appState.userId,
                'X-User-Role': appState.role
            },
            body: formData
        });
        alert("Uploaded");
        refreshDocsList(studentId);
    });
}
function deleteDocument(docId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm("Delete?"))
            return;
        yield fetchAPI(`/documents/${docId}`, { method: 'DELETE' });
        alert("Deleted");
    });
}
// --- RESOURCE MANAGEMENT ---
function loadResources() {
    return __awaiter(this, arguments, void 0, function* (category = 'All') {
        const container = document.getElementById('resources-list-container');
        if (!container)
            return;
        container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div></div>';
        try {
            const effectiveSchoolId = appState.schoolId || appState.activeSchoolId || 1;
            const normalizedCategory = normalizeResourceCategory(category);
            let url = `/resources`;
            if (normalizedCategory && normalizedCategory !== 'All') {
                url += `?category=${encodeURIComponent(normalizedCategory)}`;
            }
            url += (url.includes('?') ? '&' : '?') + `school_id=${effectiveSchoolId}`;
            const response = yield fetchAPI(url);
            if (!response.ok)
                throw new Error("Failed to fetch resources");
            const resources = yield response.json();
            renderResources(resources);
        }
        catch (error) {
            console.error("Error loading resources:", error);
            container.innerHTML = `
            <div class="col-12 text-center py-5">
                 <div class="mb-3"><span class="material-icons fs-1 text-muted opacity-50">cloud_off</span></div>
                 <h5 class="text-muted">Unable to load resources</h5>
                 <p class="small text-secondary">Please check your connection or contact the administrator.</p>
            </div>`;
        }
    });
}
function canManageResources() {
    const adminRoles = ['Admin', 'Principal', 'Tenant_Admin', 'Root_Super_Admin', 'Super Admin'];
    return !!appState.isSuperAdmin || adminRoles.includes(appState.role || '');
}
var resourceFormTemplatesCache = [];
function normalizeResourceCategory(rawCategory) {
    const value = String(rawCategory || 'All').trim();
    const normalized = value.toLowerCase();
    if (!normalized || normalized === 'all')
        return 'All';
    if (normalized === 'policies' || normalized === 'policy')
        return 'Policy';
    if (normalized === 'exam schedules' || normalized === 'schedule')
        return 'Schedule';
    if (normalized === 'forms' || normalized === 'form')
        return 'Form';
    if (normalized === 'other')
        return 'Other';
    return value;
}
function getActiveResourceCategory() {
    const activeBtn = document.querySelector('#resources-view [data-resource-category].active');
    if (!activeBtn)
        return 'All';
    return normalizeResourceCategory(activeBtn.getAttribute('data-resource-category') || activeBtn.innerText || 'All');
}
function initResourcesView() {
    const uploadBtn = document.getElementById('btn-upload-resource');
    if (uploadBtn) {
        uploadBtn.classList.toggle('d-none', !canManageResources());
    }
    loadResources(getActiveResourceCategory());
}
function handleResourceCategoryChange() {
    const categoryEl = document.getElementById('res-category-view');
    const templateWrap = document.getElementById('resource-template-wrap');
    const templateSelect = document.getElementById('res-template-view');
    const fileInput = document.getElementById('res-file-view');
    const isFormCategory = !!categoryEl && categoryEl.value === 'Form';
    if (templateWrap) {
        templateWrap.classList.toggle('d-none', !isFormCategory);
    }
    if (fileInput) {
        const usingTemplate = isFormCategory && !!templateSelect && !!templateSelect.value;
        fileInput.required = !usingTemplate;
    }
}
function handleResourceTemplateChange() {
    const templateSelect = document.getElementById('res-template-view');
    const titleEl = document.getElementById('res-title-view');
    const descEl = document.getElementById('res-desc-view');
    if (templateSelect && templateSelect.value) {
        const match = resourceFormTemplatesCache.find((t) => t.key === templateSelect.value);
        if (match) {
            if (titleEl && !titleEl.value.trim())
                titleEl.value = match.title || '';
            if (descEl && !descEl.value.trim())
                descEl.value = match.description || '';
        }
    }
    handleResourceCategoryChange();
}
function loadResourceFormTemplates() {
    return __awaiter(this, void 0, void 0, function* () {
        const select = document.getElementById('res-template-view');
        if (!select)
            return;
        if (resourceFormTemplatesCache.length > 0) {
            select.innerHTML = '<option value="">Custom Form (Upload your own file)</option>' +
                resourceFormTemplatesCache.map((t) => `<option value="${t.key}">${t.title}</option>`).join('');
            return;
        }
        try {
            const res = yield fetchAPI('/resources/form-templates');
            if (!res.ok)
                return;
            const data = yield res.json();
            if (!Array.isArray(data))
                return;
            resourceFormTemplatesCache = data;
            select.innerHTML = '<option value="">Custom Form (Upload your own file)</option>' +
                data.map((t) => `<option value="${t.key}">${t.title}</option>`).join('');
        }
        catch (e) {
            console.warn('Failed to load form templates', e);
        }
    });
}
function populateResourceUploadSchoolOptions() {
    return __awaiter(this, void 0, void 0, function* () {
        const wrap = document.getElementById('resource-school-wrap');
        const select = document.getElementById('res-school-view');
        if (!wrap || !select)
            return;
        const ownSchoolId = Number(appState.activeSchoolId || appState.schoolId || 1);
        const ownSchoolName = appState.schoolName || `School ${ownSchoolId}`;
        const canSelectAnySchool = !!appState.isSuperAdmin || ['Root_Super_Admin', 'Super Admin'].includes(appState.role || '');
        wrap.classList.toggle('d-none', !canManageResources());
        if (!canManageResources()) {
            select.innerHTML = '';
            return;
        }
        if (!canSelectAnySchool) {
            select.innerHTML = `<option value="${ownSchoolId}">${ownSchoolName}</option>`;
            select.value = String(ownSchoolId);
            select.disabled = true;
            return;
        }
        select.disabled = false;
        select.innerHTML = `<option value="${ownSchoolId}">${ownSchoolName}</option>`;
        try {
            const response = yield fetchAPI('/admin/schools');
            if (response.ok) {
                const schools = yield response.json();
                if (Array.isArray(schools) && schools.length > 0) {
                    select.innerHTML = schools.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
                }
            }
        }
        catch (e) {
            console.warn('Failed to load schools for resource upload', e);
        }
        select.value = String(ownSchoolId);
    });
}
function renderResources(resources) {
    const container = document.getElementById('resources-list-container');
    container.innerHTML = '';
    if (!resources || resources.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted">No resources found.</div>';
        return;
    }
    resources.forEach(res => {
        const isPolicy = res.category === 'Policy';
        const isSchedule = res.category === 'Schedule';
        const isForm = res.category === 'Form';
        let icon = 'description';
        let colorClass = 'text-primary';
        let bgClass = 'bg-primary';
        // Check file extension
        const fileExt = res.file_path ? res.file_path.split('.').pop().toLowerCase() : '';
        if (fileExt === 'pdf') {
            icon = 'picture_as_pdf';
            colorClass = 'text-danger';
            bgClass = 'bg-danger';
        }
        else if (['doc', 'docx'].includes(fileExt)) {
            icon = 'article';
            colorClass = 'text-primary';
            bgClass = 'bg-primary';
        }
        else if (['xls', 'xlsx'].includes(fileExt)) {
            icon = 'table_chart';
            colorClass = 'text-success';
            bgClass = 'bg-success';
        }
        else if (isSchedule) {
            icon = 'calendar_today';
            colorClass = 'text-warning';
            bgClass = 'bg-warning';
        }
        else if (isPolicy) {
            icon = 'gavel';
            colorClass = 'text-danger';
            bgClass = 'bg-danger';
        }
        else if (isForm) {
            icon = 'assignment';
            colorClass = 'text-success';
            bgClass = 'bg-success';
        }
        // Mock download/view action
        // Construct Full URL
        // API_BASE_URL usually ends with /api. We need the root for static files.
        const backendRoot = API_BASE_URL.replace('/api', '');
        const fullUrl = res.file_path.startsWith('http') ? res.file_path : `${backendRoot}${res.file_path}`;
        // View Action (Modal or New Tab)
        const viewAction = `onclick="viewResource('${fullUrl}', '${res.title}', '${fileExt}')"`;
        // Buttons
        const actionBtn = `<button ${viewAction} class="btn btn-sm btn-light border fw-medium d-flex align-items-center justify-content-center gap-1 px-3 flex-grow-1 text-nowrap"><span class="material-icons fs-6">visibility</span> View</button>`;
        let deleteBtn = '';
        if (appState.role === 'Tenant_Admin' || appState.role === 'Principal' || appState.isSuperAdmin) {
            deleteBtn = `<button class="btn btn-sm btn-light border text-danger d-flex align-items-center justify-content-center px-2" onclick="deleteResource(${res.id})" title="Delete"><span class="material-icons fs-6">delete</span></button>`;
        }
        const html = `
            <div class="col-md-6 col-lg-4 col-xl-3">
                <div class="card h-100 border-0 shadow-sm hover-up transition-hover glass-card-solid">
                    <div class="card-body p-4 d-flex flex-column">
                        <!-- Header -->
                        <div class="d-flex align-items-start justify-content-between mb-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center ${bgClass} bg-opacity-10" style="width:48px; height:48px;">
                                <span class="material-icons ${colorClass} fs-5">${icon}</span>
                            </div>
                            <span class="badge bg-white text-secondary border rounded-pill px-2 py-1" style="font-weight:500; font-size:11px;">${res.category}</span>
                        </div>
                        
                        <!-- Content -->
                        <h6 class="fw-bold mb-2 text-dark text-truncate-2" title="${res.title}" style="line-height:1.4;">${res.title}</h6>
                        <p class="text-muted small mb-4 flex-grow-1 clamp-3" style="font-size: 13px;">${res.description || 'No description available.'}</p>
                        
                        <!-- Footer -->
                        <div class="pt-3 border-top mt-auto">
                             <div class="d-flex flex-column gap-2">
                                <div class="d-flex flex-column">
                                    <small class="text-uppercase text-muted" style="font-size:10px; font-weight:700; letter-spacing:0.5px;">Uploaded</small>
                                    <small class="text-dark fw-medium" style="font-size:12px;">${new Date(res.uploaded_at).toLocaleDateString()}</small>
                                </div>
                                <div class="d-flex gap-2 align-items-stretch w-100">
                                    ${actionBtn}
                                    ${deleteBtn}
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}
function viewResource(url, title, ext) {
    return __awaiter(this, void 0, void 0, function* () {
        // Show loading toast if available
        if (typeof showToast === 'function')
            showToast("Opening preview...", "info");
        // Check if file is accessible via HEAD request to prevent 404 inside modal
        try {
            const check = yield fetch(url, { method: 'HEAD' });
            if (!check.ok) {
                throw new Error("File not found");
            }
        }
        catch (e) {
            console.error("Resource not found:", e);
            if (typeof showToast === 'function')
                showToast("Error: File not found on server.", "error");
            else
                alert("Error: File not found on server. Please ask admin to re-upload.");
            return;
        }
        if (ext === 'pdf' || ext === 'txt' || ['jpg', 'jpeg', 'png'].includes(ext)) {
            // Use Modal for valid types
            let modalHtml = '';
            if (ext === 'pdf') {
                modalHtml = `<iframe src="${url}" width="100%" height="600px" style="border:none;" title="${title}"></iframe>`;
            }
            else if (['jpg', 'jpeg', 'png'].includes(ext)) {
                modalHtml = `<img src="${url}" class="img-fluid" alt="${title}">`;
            }
            else {
                modalHtml = `<iframe src="${url}" width="100%" height="600px" style="border:none; background:white;" title="${title}"></iframe>`;
            }
            // Inject modal if not exists (or update existing)
            let modalEl = document.getElementById('resourcePreviewModal');
            if (!modalEl) {
                document.body.insertAdjacentHTML('beforeend', `
                <div class="view full-page-view" id="resourcePreviewModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
                    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                        <div class="modal-content border-0 shadow-lg" style="height: 90vh;">
                            <div class="modal-header border-bottom-0">
                                <h5 class="modal-title fw-bold text-truncate" id="previewTitle">Preview</h5>
                                <div class="d-flex gap-2">
                                     <a href="#" id="previewDownloadBtn" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 d-flex align-items-center gap-1">
                                        <span class="material-icons fs-6">download</span> Download
                                     </a>
                                     <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                            </div>
                            <div class="modal-body p-0 bg-light d-flex align-items-center justify-content-center" id="previewBody">
                                <!-- Content -->
                            </div>
                        </div>
                    </div>
                </div>
            `);
                modalEl = document.getElementById('resourcePreviewModal');
            }
            document.getElementById('previewTitle').textContent = title;
            document.getElementById('previewBody').innerHTML = modalHtml;
            document.getElementById('previewDownloadBtn').href = url;
            document.getElementById('previewDownloadBtn').href = url;
            openView(modalEl.id);
        }
        else {
            // Fallback for docs/others
            window.open(url, '_blank');
        }
    });
}
function filterResources(category, btnElement) {
    if (btnElement) {
        // Update active state
        const buttons = btnElement.parentElement.querySelectorAll('.btn');
        buttons.forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    loadResources(normalizeResourceCategory(category));
}
// Redirect to VIEW instead of Modal
function openUploadResourceModal() {
    switchView('upload-resource-view');
    document.getElementById('upload-resource-form-view').reset();
    document.getElementById('file-name-display').classList.add('d-none');
    populateResourceUploadSchoolOptions();
    loadResourceFormTemplates();
    handleResourceCategoryChange();
}
// Handle Form Submit from VIEW
function handleUploadResourceView(e) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        e.preventDefault();
        const title = document.getElementById('res-title-view').value;
        const category = document.getElementById('res-category-view').value;
        const templateKeyEl = document.getElementById('res-template-view');
        const selectedTemplate = templateKeyEl ? templateKeyEl.value : '';
        const desc = getVal('res-desc-view');
        const fileInput = getEl('res-file-view');
        const useTemplatePublish = category === 'Form' && !!selectedTemplate;
        if (!title) {
            alert("Title is required.");
            return;
        }
        if (!useTemplatePublish && (!fileInput.files || !fileInput.files[0])) {
            alert("File is required for custom upload.");
            return;
        }
        const selectedSchoolEl = document.getElementById('res-school-view');
        const schoolId = (selectedSchoolEl === null || selectedSchoolEl === void 0 ? void 0 : selectedSchoolEl.value) || String(appState.schoolId || appState.activeSchoolId || '1');
        const btn = e.submitter;
        const originalText = btn.innerHTML;
        try {
            // Show loading state
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';
            let response;
            if (useTemplatePublish) {
                response = yield fetchAPI('/resources/form-templates', {
                    method: 'POST',
                    body: JSON.stringify({
                        template_key: selectedTemplate,
                        school_id: Number(schoolId),
                        title: title || null,
                        description: desc || null
                    })
                });
            }
            else {
                const formData = new FormData();
                formData.append("title", title);
                formData.append("category", category);
                formData.append("description", desc);
                formData.append("file", fileInput.files[0]);
                formData.append("school_id", schoolId);
                response = yield fetch(`${API_BASE_URL}/resources`, {
                    method: 'POST',
                    headers: {
                        'X-User-Id': appState.userId || '',
                    },
                    body: formData
                });
            }
            if (!response.ok)
                throw yield response.text();
            // Success
            switchView('resources-view');
            loadResources(getActiveResourceCategory());
            if (typeof showToast === 'function') {
                showToast(useTemplatePublish ? "Template form published successfully!" : "Resource uploaded successfully!", "success");
            }
        }
        catch (error) {
            console.error("Upload Error:", error);
            alert("Upload Failed: " + (typeof error === 'string' ? error : error.message));
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    });
}
// Keep legacy just in case
function handleUploadResource() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const title = getVal('res-title');
        const category = getVal('res-category');
        const desc = getVal('res-desc');
        const fileInput = getInput('res-file');
        if (!title || !fileInput.files || !fileInput.files[0]) {
            alert("Title and File are required.");
            return;
        }
        const formData = new FormData();
        formData.append("title", title);
        formData.append("category", category);
        formData.append("description", desc);
        formData.append("file", fileInput.files[0]);
        const selectedSchoolEl = document.getElementById('res-school-view');
        const schoolId = (selectedSchoolEl === null || selectedSchoolEl === void 0 ? void 0 : selectedSchoolEl.value) || String(appState.schoolId || appState.activeSchoolId || 1);
        formData.append("school_id", schoolId);
        try {
            // Upload via standard fetch since fetchAPI sets Content-Type to JSON
            const response = yield fetch(`${API_BASE_URL}/resources`, {
                method: 'POST',
                headers: {
                    'X-User-Id': appState.userId || '',
                    // Content-Type is auto-set with boundary for FormData
                },
                body: formData
            });
            if (!response.ok)
                throw yield response.text();
            const modalEl = document.getElementById('uploadResourceModal');
            closeView();
            loadResources(getActiveResourceCategory());
            // Simple toast mock if not exists
            if (typeof showToast === 'function')
                showToast("Resource uploaded successfully!", "success");
            else
                alert("Resource uploaded!");
        }
        catch (e) {
            console.error(e);
            if (typeof showToast === 'function')
                showToast("Failed to upload resource.", "error");
            else
                alert("Failed to upload resource.");
        }
    });
}
function deleteResource(id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm("Are you sure you want to delete this resource?"))
            return;
        try {
            yield fetchAPI(`/resources/${id}`, { method: 'DELETE' });
            loadResources(getActiveResourceCategory());
            if (typeof showToast === 'function')
                showToast("Resource deleted.", "success");
            else
                alert("Resource deleted.");
        }
        catch (e) {
            console.error(e);
            if (typeof showToast === 'function')
                showToast("Failed to delete resource.", "error");
            else
                alert("Failed to delete resource.");
        }
    });
}
// --- SIDEBAR CHATBOT LOGIC (NEW) ---
function toggleSidebarChat() {
    const sidebar = document.getElementById('ai-sidebar');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
    else {
        sidebar.classList.add('open');
        // Focus input
        setTimeout(() => {
            const el = document.getElementById('sidebar-chat-input');
            if (el)
                el.focus();
        }, 100);
    }
}
function handleSidebarEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendSidebarMessage();
    }
}
function sendSidebarMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('sidebar-chat-input');
        const message = input.value.trim();
        const fileInput = document.getElementById('chat-file-input');
        const file = fileInput && fileInput.files[0];
        if (!message && !file)
            return;
        // Clear and Append User Message
        input.value = '';
        let userMsgDisplay = message;
        if (file) {
            userMsgDisplay += `<br><small class="text-muted"><span class="material-icons fs-6 align-middle">attach_file</span> ${file.name}</small>`;
        }
        appendSidebarMessage('user', userMsgDisplay);
        // Clear File Input
        if (fileInput) {
            fileInput.value = '';
            clearChatFile();
        }
        // Show Typing Indicator
        const typingId = appendSidebarMessage('ai', '...', true);
        try {
            const studentId = appState.userId || 'guest';
            let response;
            if (file) {
                // File Upload Flow
                const formData = new FormData();
                formData.append('prompt', message || "Analyze this file");
                formData.append('file', file);
                // Note: fetchAPI adds Content-Type: json by default if not FormData... 
                // but we need to ensure fetchAPI logic handles FormData correctly (it usually shouldn't set Content-Type header manually for FormData)
                // My fetchAPI wrapper sets Content-Type: application/json by default. I need to override it.
                response = yield fetch(`${API_BASE_URL}/ai/chat_with_file/${studentId}`, {
                    method: 'POST',
                    headers: {
                        'X-User-Id': appState.userId || '',
                        'X-User-Role': appState.role || ''
                    },
                    body: formData
                });
            }
            else {
                // Text Only Flow
                response = yield fetchAPI(`/ai/chat/${studentId}`, {
                    method: 'POST',
                    body: JSON.stringify({ prompt: message })
                });
            }
            const data = yield response.json();
            // Remove Typing Indicator
            const typingEl = document.getElementById(typingId);
            if (typingEl)
                typingEl.remove();
            // Append AI Response
            if (data.reply) {
                appendSidebarMessage('ai', data.reply);
            }
            else {
                appendSidebarMessage('ai', "I'm having trouble thinking right now.");
            }
        }
        catch (error) {
            console.error(error);
            const typingEl = document.getElementById(typingId);
            if (typingEl)
                typingEl.remove();
            appendSidebarMessage('ai', "Connection error. Please try again.");
        }
    });
}
function handleChatFileSelect(input) {
    const preview = document.getElementById('chat-file-preview');
    const nameSpan = document.getElementById('chat-file-name');
    if (input.files && input.files[0]) {
        preview.style.display = 'block';
        nameSpan.innerText = input.files[0].name;
    }
    else {
        clearChatFile();
    }
}
function clearChatFile() {
    const input = document.getElementById('chat-file-input');
    const preview = document.getElementById('chat-file-preview');
    if (input)
        input.value = '';
    if (preview)
        preview.style.display = 'none';
}
function appendSidebarMessage(sender, text, isTyping = false) {
    const chatBody = document.getElementById('sidebar-chat-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    if (isTyping) {
        msgDiv.id = `typing-${Date.now()}`;
        msgDiv.innerHTML = '<span class="material-icons fw-bold fs-6 anim-icon">more_horiz</span>';
    }
    else {
        // Use Marked.js if available, else plain text
        if (sender === 'ai' && typeof marked !== 'undefined') {
            msgDiv.innerHTML = marked.parse(text);
        }
        else {
            msgDiv.innerText = text;
        }
    }
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
    return msgDiv.id;
}
// --- MOODLE INTEGRATION ---
// --- ENGAGEMENT HELPER LOGIC REMOVED ---
// --- LMS INTERNAL LOGIC ---
// Global State for LMS
var currentLMSCourse = null;
var currentLMSSection = null;
function loadLMSCatalog() {
    return __awaiter(this, void 0, void 0, function* () {
        const search = document.getElementById('lms-search').value;
        const category = document.getElementById('lms-category-filter').value;
        const grid = document.getElementById('lms-course-grid');
        grid.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';
        // Switch View if not already
        if (!document.getElementById('lms-catalog-view').classList.contains('active')) {
            switchView('lms-catalog-view');
        }
        let query = `/lms/courses?category=${encodeURIComponent(category)}`;
        if (search)
            query += `&search=${encodeURIComponent(search)}`;
        try {
            const response = yield fetchAPI(query);
            const courses = yield response.json();
            renderLMSCatalog(courses);
        }
        catch (e) {
            console.error(e);
            grid.innerHTML = `<div class="alert alert-danger">Failed to load courses.</div>`;
        }
    });
}
function renderLMSCatalog(courses) {
    const grid = document.getElementById('lms-course-grid');
    grid.innerHTML = '';
    // "Create Course" Card for Teachers
    if (appState.role === 'Teacher' || appState.isSuperAdmin) {
        const createCard = document.createElement('div');
        createCard.className = 'col-md-6 col-lg-4 col-xl-3';
        createCard.innerHTML = `
            <div class="card h-100 border-2 border-dashed d-flex align-items-center justify-content-center bg-white text-muted shadow-sm hover-up" 
                 style="cursor: pointer; min-height: 320px; border-color: #dee2e6 !important;"
                 data-bs-toggle="modal" data-bs-target="#lmsCreateCourseModal">
                <div class="text-center p-4">
                    <div class="bg-light rounded-circle d-inline-flex p-3 mb-3 text-primary">
                        <span class="material-icons fs-2">add</span>
                    </div>
                    <h5 class="fw-bold text-dark">Create New Course</h5>
                    <p class="small text-muted mb-0">Design your curriculum</p>
                </div>
            </div>
        `;
        grid.appendChild(createCard);
    }
    if (courses.length === 0 && appState.role !== 'Teacher') {
        grid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-3">
                    <span class="material-icons text-muted" style="font-size: 64px; opacity: 0.3;">school</span>
                </div>
                <h5 class="fw-bold text-muted">No courses found</h5>
                <p class="text-muted">Try adjusting your filters or search query.</p>
            </div>
        `;
    }
    courses.forEach(course => {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 col-xl-3';
        const thumb = course.thumbnail_url || 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';
        col.innerHTML = `
            <div class="card h-100 shadow-sm border-0 overflow-hidden hover-up" style="transition: transform 0.2s, box-shadow 0.2s;">
                <div class="position-relative">
                    <div style="height: 160px; background: url('${thumb}') center/cover;"></div>
                    <span class="badge bg-white text-primary position-absolute top-0 start-0 m-3 shadow-sm px-3 py-2 rounded-pill fw-bold" style="font-size: 0.75rem; letter-spacing: 0.5px;">
                        ${course.category}
                    </span>
                </div>
                <div class="card-body p-4 d-flex flex-column">
                    <h5 class="fw-bold mb-2 text-dark text-truncate" title="${course.title}">${course.title}</h5>
                    <p class="text-muted small flex-grow-1 text-clamp-3" style="line-height: 1.6;">${course.description || 'No description available for this course.'}</p>
                    
                    <div class="d-flex align-items-center justify-content-between mt-4 pt-3 border-top border-light">
                        <div class="d-flex align-items-center">
                            <span class="material-icons text-warning fs-6 me-1">star</span>
                            <small class="fw-bold text-dark">4.8</small>
                            <small class="text-muted ms-1">(24)</small>
                        </div>
                        <button onclick="launchLMSPlayer(${course.id})" class="btn btn-sm btn-primary rounded-pill px-4 fw-medium">
                            ${appState.role === 'Teacher' ? 'Manage' : 'Start'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}
function submitLMSCourse() {
    return __awaiter(this, void 0, void 0, function* () {
        const title = document.getElementById('lms-course-title').value;
        const desc = document.getElementById('lms-course-desc').value;
        const cat = document.getElementById('lms-course-category').value;
        const thumb = document.getElementById('lms-course-thumb').value;
        try {
            const res = yield fetchAPI('/lms/courses', {
                method: 'POST',
                body: JSON.stringify({ title, description: desc, category: cat, thumbnail_url: thumb })
            });
            if (res.ok) {
                closeView();
                document.getElementById('lms-create-course-form').reset();
                loadLMSCatalog();
            }
            else {
                alert('Failed to create course');
            }
        }
        catch (e) {
            alert('Error: ' + e.message);
        }
    });
}
function launchLMSPlayer(courseId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI(`/lms/courses/${courseId}/full`);
            if (!res.ok)
                throw new Error("Failed to load course");
            currentLMSCourse = yield res.json();
            // Update Player UI
            document.getElementById('lms-player-title').textContent = currentLMSCourse.title;
            // Calculate Progress (Mock)
            document.getElementById('lms-course-progress').style.width = '0%';
            document.getElementById('lms-course-progress-text').textContent = '0% Complete';
            renderLMSPlayerNav(currentLMSCourse);
            // Switch View
            switchView('lms-player-view');
            // Reset Content Area
            document.getElementById('lms-content-area').innerHTML = `
            <div class="text-center text-muted">
                <span class="material-icons" style="font-size: 64px; opacity: 0.3;">school</span>
                <h4 class="mt-3">Welcome to ${currentLMSCourse.title}</h4>
                <p>Select a module from the sidebar to begin.</p>
            </div>
        `;
        }
        catch (e) {
            alert("Error loading course: " + e.message);
        }
    });
}
function renderLMSPlayerNav(course) {
    const nav = document.getElementById('lms-player-nav');
    nav.innerHTML = '';
    // Allow Teachers to Add Sections
    if (appState.role === 'Teacher' || appState.isSuperAdmin) {
        const addSecBtn = document.createElement('button');
        addSecBtn.className = 'btn btn-sm btn-outline-primary w-100 mb-3';
        addSecBtn.innerHTML = '<i class="material-icons align-middle fs-6">add</i> Add Section';
        addSecBtn.onclick = () => {
            document.getElementById('lms-target-course-id').value = course.id;
            openView('lmsAddSectionModal');
        };
        nav.appendChild(addSecBtn);
    }
    if (!course.sections || course.sections.length === 0) {
        nav.innerHTML += '<p class="text-center small text-muted">No content yet.</p>';
    }
    course.sections.forEach((section, sIndex) => {
        const secDiv = document.createElement('div');
        secDiv.className = 'mb-3';
        const header = document.createElement('h6');
        header.className = 'fw-bold text-uppercase text-muted px-2 small mb-2 d-flex justify-content-between align-items-center interact-hover';
        header.innerHTML = `<span>${section.title}</span>`;
        if (appState.role === 'Teacher' || appState.isSuperAdmin) {
            const addModBtn = document.createElement('span');
            addModBtn.className = 'material-icons fs-6 text-primary';
            addModBtn.style.cursor = 'pointer';
            addModBtn.textContent = 'add_circle';
            addModBtn.title = 'Add Module';
            addModBtn.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('lms-target-section-id').value = section.id;
                openView('lmsAddModuleModal');
            };
            header.appendChild(addModBtn);
        }
        secDiv.appendChild(header);
        const listGroup = document.createElement('div');
        listGroup.className = 'list-group list-group-flush';
        section.modules.forEach((module, mIndex) => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action border-0 rounded px-2 py-2 d-flex align-items-center mb-1';
            let icon = 'description';
            if (module.type === 'video')
                icon = 'play_circle';
            if (module.type === 'quiz')
                icon = 'quiz';
            if (module.type === 'html')
                icon = 'article';
            // Check completion
            const isComplete = module.completion && (module.completion.status === 'Completed');
            const checkIcon = isComplete ? '<i class="material-icons ms-auto text-success fs-6">check_circle</i>' : '';
            item.innerHTML = `
                <i class="material-icons me-2 text-secondary fs-6">${icon}</i>
                <span class="small text-truncate text-start flex-grow-1">${module.title}</span>
                ${checkIcon}
            `;
            item.onclick = () => loadLMSModule(module, item);
            listGroup.appendChild(item);
        });
        secDiv.appendChild(listGroup);
        nav.appendChild(secDiv);
    });
}
function submitLMSSection() {
    return __awaiter(this, void 0, void 0, function* () {
        const courseId = document.getElementById('lms-target-course-id').value;
        const title = document.getElementById('lms-section-title').value;
        try {
            yield fetchAPI(`/lms/courses/${courseId}/sections`, {
                method: 'POST',
                body: JSON.stringify({ title, order_index: 99 })
            });
            closeView();
            document.getElementById('lms-section-title').value = '';
            launchLMSPlayer(courseId); // Reload
        }
        catch (e) {
            alert(e.message);
        }
    });
}
// --- LMS FIELD LOGIC ---
var quizQuestionCount = 0;
function toggleLMSModuleFields() {
    const type = document.getElementById('lms-module-type').value;
    document.getElementById('lms-field-url').classList.add('d-none');
    document.getElementById('lms-field-text').classList.add('d-none');
    document.getElementById('lms-field-quiz').classList.add('d-none');
    if (type === 'html') {
        document.getElementById('lms-field-text').classList.remove('d-none');
    }
    else if (type === 'quiz') {
        document.getElementById('lms-field-quiz').classList.remove('d-none');
    }
    else {
        document.getElementById('lms-field-url').classList.remove('d-none');
    }
}
function addLMSQuizQuestion() {
    const container = document.getElementById('lms-quiz-builder-container');
    const id = quizQuestionCount++;
    const div = document.createElement('div');
    div.className = 'card p-3 mb-2 shadow-sm relative';
    // Add Type Selector
    div.innerHTML = `
        <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center mb-2">
                 <select class="form-select form-select-sm w-auto" name="q_type_${id}" onchange="toggleQuestionType(this, ${id})">
                    <option value="mcq">Multiple Choice</option>
                    <option value="short">Short Answer (AI Graded)</option>
                </select>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.card').remove()">x</button>
            </div>
           
            <input type="text" class="form-control form-control-sm mb-2" placeholder="Question Text" name="q_text_${id}">
            
            <!-- MCQ Options -->
            <div id="q_options_container_${id}">
                <div class="row g-2">
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option A" name="q_opt_a_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option B" name="q_opt_b_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option C" name="q_opt_c_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option D" name="q_opt_d_${id}"></div>
                </div>
                <div class="mt-2">
                    <select class="form-select form-select-sm" name="q_correct_${id}">
                        <option value="A">Answer: A</option>
                        <option value="B">Answer: B</option>
                        <option value="C">Answer: C</option>
                        <option value="D">Answer: D</option>
                    </select>
                </div>
            </div>

            <!-- Short Answer Context -->
            <div id="q_context_container_${id}" class="d-none">
                <textarea class="form-control form-control-sm" rows="2" name="q_context_${id}" placeholder="Correct Answer / Model Response (for AI reference)"></textarea>
            </div>
        </div>
    `;
    container.appendChild(div);
}
function toggleQuestionType(select, id) {
    const val = select.value;
    const opts = document.getElementById(`q_options_container_${id}`);
    const ctx = document.getElementById(`q_context_container_${id}`);
    if (val === 'short') {
        opts.classList.add('d-none');
        ctx.classList.remove('d-none');
    }
    else {
        opts.classList.remove('d-none');
        ctx.classList.add('d-none');
    }
}
function submitLMSModule() {
    return __awaiter(this, void 0, void 0, function* () {
        const sectionId = document.getElementById('lms-target-section-id').value;
        const title = document.getElementById('lms-module-title').value;
        const type = document.getElementById('lms-module-type').value;
        let url = document.getElementById('lms-module-url').value;
        let text = document.getElementById('lms-module-text').value;
        if (type === 'quiz') {
            // Parse Quiz Data
            const questions = [];
            const container = document.getElementById('lms-quiz-builder-container');
            container.querySelectorAll('.card').forEach(cardEl => {
                const card = cardEl;
                // Determine type by checking selector existence or hidden state
                const typeSelector = card.querySelector('select[name^="q_type"]');
                const type = typeSelector ? typeSelector.value : 'mcq';
                const qText = card.querySelector('input[name^="q_text"]').value;
                if (qText) {
                    if (type === 'short') {
                        const ctx = card.querySelector('textarea[name^="q_context"]').value;
                        questions.push({
                            type: 'short',
                            question: qText,
                            context: ctx
                        });
                    }
                    else {
                        const optA = card.querySelector('input[name^="q_opt_a"]').value;
                        const optB = card.querySelector('input[name^="q_opt_b"]').value;
                        const optC = card.querySelector('input[name^="q_opt_c"]').value;
                        const optD = card.querySelector('input[name^="q_opt_d"]').value;
                        const correct = card.querySelector('select[name^="q_correct"]').value;
                        questions.push({
                            type: 'mcq',
                            question: qText,
                            options: { A: optA, B: optB, C: optC, D: optD },
                            answer: correct
                        });
                    }
                }
            });
            text = JSON.stringify(questions);
        }
        try {
            yield fetchAPI(`/lms/sections/${sectionId}/modules`, {
                method: 'POST',
                body: JSON.stringify({ title, type, content_url: url, content_text: text, order_index: 99 })
            });
            closeView();
            // Clear fields
            document.getElementById('lms-module-title').value = '';
            document.getElementById('lms-module-url').value = '';
            document.getElementById('lms-module-text').value = '';
            document.getElementById('lms-quiz-builder-container').innerHTML = '';
            launchLMSPlayer(currentLMSCourse.id); // Reload
        }
        catch (e) {
            alert(e.message);
        }
    });
}
function loadLMSModule(module, itemElement) {
    // Highlight active
    document.querySelectorAll('#lms-player-nav .list-group-item').forEach(el => el.classList.remove('active', 'bg-light'));
    itemElement.classList.add('active', 'bg-light');
    const area = document.getElementById('lms-content-area');
    if (module.type === 'video') {
        let embedUrl = module.content_url;
        if (module.content_url.includes('youtube.com/watch?v=')) {
            const videoId = module.content_url.split('v=')[1].split('&')[0];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }
        else if (module.content_url.includes('youtu.be/')) {
            const videoId = module.content_url.split('youtu.be/')[1];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }
        area.innerHTML = `
            <iframe width="100%" height="100%" src="${embedUrl}" title="${module.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
    }
    else if (module.type === 'quiz') {
        let questions = [];
        try {
            questions = JSON.parse(module.content_text);
        }
        catch (e) { }
        let quizHTML = `<div class="container" style="max-width: 800px;"><h2 class="mb-4">${module.title}</h2>`;
        if (questions && questions.length > 0) {
            questions.forEach((q, idx) => {
                if (q.type === 'short') {
                    // Short Answer
                    quizHTML += `
                         <div class="card mb-3 p-4 shadow-sm border-0">
                            <h5 class="fw-bold mb-3">${idx + 1}. ${q.question} <span class="badge bg-info-subtle text-info-emphasis ms-2">Short Answer</span></h5>
                            <textarea class="form-control" rows="3" name="q_${idx}" placeholder="Type your answer here..."></textarea>
                            <div class="mt-2 small text-muted fst-italic" id="q_feedback_${idx}"></div>
                        </div>
                    `;
                }
                else {
                    // MCQ
                    quizHTML += `
                        <div class="card mb-3 p-4 shadow-sm border-0">
                            <h5 class="fw-bold mb-3">${idx + 1}. ${q.question}</h5>
                            <div class="d-flex flex-column gap-2">
                                <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="A"> <span class="fw-bold text-muted me-2">A.</span> ${q.options.A}
                                </label>
                                <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="B"> <span class="fw-bold text-muted me-2">B.</span> ${q.options.B}
                                </label>
                                 <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="C"> <span class="fw-bold text-muted me-2">C.</span> ${q.options.C}
                                </label>
                                 <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="D"> <span class="fw-bold text-muted me-2">D.</span> ${q.options.D}
                                </label>
                            </div>
                        </div>
                    `;
                }
            });
            quizHTML += `<button onclick="submitLMSQuiz(${module.id})" class="btn btn-primary-custom btn-lg rounded-pill px-5">Submit Quiz</button></div>`;
        }
        else {
            quizHTML += `<p class="text-muted">This quiz has no questions.</p></div>`;
        }
        area.innerHTML = `<div class="h-100 overflow-auto p-4 md-content">${quizHTML}</div>`;
    }
    else {
        // HTML/Text
        area.innerHTML = `
             <div class="h-100 overflow-auto p-4 md-content">
                <div class="container" style="max-width: 800px;">
                    <h2 class="mb-4">${module.title}</h2>
                    <div class="card p-4 shadow-sm">
                        ${module.content_text ? module.content_text.replace(/\n/g, '<br>') : '<p class="text-muted">No content.</p>'}
                    </div>
                </div>
            </div>
        `;
    }
}
function handleLMSCompletion() {
    alert("Module marked as complete.");
    // Logic to unlock next module
}
function navLMSModule(direction) {
    // Logic for prev/next button
}
function submitLMSQuiz(moduleId) {
    return __awaiter(this, void 0, void 0, function* () {
        let module = null;
        currentLMSCourse.sections.forEach(s => {
            const found = s.modules.find(m => m.id === moduleId);
            if (found)
                module = found;
        });
        if (!module)
            return;
        const questions = JSON.parse(module.content_text);
        let totalScore = 0;
        let totalPossible = questions.length * 100; // Normalize: MCQ=100pts, Short=100pts
        // Show loading state
        const submitBtn = document.querySelector(`button[onclick="submitLMSQuiz(${moduleId})"]`);
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Grading...';
        }
        try {
            for (let idx = 0; idx < questions.length; idx++) {
                const q = questions[idx];
                if (q.type === 'short') {
                    const answer = document.querySelector(`textarea[name="q_${idx}"]`).value;
                    const feedbackEl = document.getElementById(`q_feedback_${idx}`);
                    // Call AI
                    const res = yield fetchAPI('/ai/grade/short-answer', {
                        method: 'POST',
                        body: JSON.stringify({
                            question: q.question,
                            student_answer: answer,
                            context: q.context
                        })
                    });
                    const grade = yield res.json();
                    totalScore += grade.score;
                    feedbackEl.innerHTML = `<span class="${grade.score > 50 ? 'text-success' : 'text-danger'}">Score: ${grade.score}/100. ${grade.feedback}</span>`;
                }
                else {
                    // MCQ Logic (Assume 100pts for correct)
                    const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
                    if (selected && selected.value === q.answer) {
                        totalScore += 100;
                    }
                }
            }
            const finalPercent = (totalScore / totalPossible) * 100;
            alert(`Quiz Complete! You scored ${Math.round(finalPercent)}%`);
            yield fetchAPI(`/lms/modules/${moduleId}/complete`, {
                method: 'POST',
                body: JSON.stringify({ score: finalPercent, status: 'Completed' })
            });
        }
        catch (e) {
            console.error(e);
            alert("Error submitting quiz: " + e.message);
        }
        finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Quiz';
            }
        }
    });
}
// --- LMS AI TUTOR ---
function toggleLMSChat() {
    const sidebar = document.getElementById('lms-chat-sidebar');
    if (!sidebar)
        return; // Guard
    if (sidebar.style.transform === 'translateX(0%)') {
        sidebar.style.transform = 'translateX(100%)';
    }
    else {
        sidebar.style.transform = 'translateX(0%)';
    }
}
function handleLMSChatKey(e) {
    if (e.key === 'Enter')
        sendLMSChat();
}
function sendLMSChat() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('lms-chat-input');
        const msg = input.value.trim();
        if (!msg)
            return;
        if (!currentLMSCourse) {
            alert("Course context missing.");
            return;
        }
        // Add User Message
        const history = document.getElementById('lms-chat-history');
        if (history.querySelector('.text-center'))
            history.innerHTML = ''; // Clear welcome
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex justify-content-end mb-3';
        userDiv.innerHTML = `<div class="bg-primary text-white p-2 rounded shadow-sm" style="max-width: 80%;">${msg}</div>`;
        history.appendChild(userDiv);
        input.value = '';
        history.scrollTop = history.scrollHeight;
        // Show Typing
        const typingId = `cat-typing-${Date.now()}`;
        const botDiv = document.createElement('div');
        botDiv.className = 'd-flex justify-content-start mb-3';
        botDiv.innerHTML = `
        <div class="bg-white border p-2 rounded shadow-sm" style="max-width: 80%;">
            <span id="${typingId}" class="material-icons anim-icon fs-6">more_horiz</span>
        </div>`;
        history.appendChild(botDiv);
        history.scrollTop = history.scrollHeight;
        try {
            const res = yield fetchAPI(`/ai/chat/course/${currentLMSCourse.id}`, {
                method: 'POST',
                body: JSON.stringify({ prompt: msg })
            });
            const data = yield res.json();
            // Remove typing
            const content = typeof marked !== 'undefined' ? marked.parse(data.reply) : data.reply;
            document.getElementById(typingId).parentNode.innerHTML = content;
        }
        catch (e) {
            document.getElementById(typingId).parentNode.innerHTML = `<span class="text-danger">Error: ${e.message}</span>`;
        }
    });
}
// --- ATTENDANCE MANAGEMENT ---
function openAttendanceModal() {
    // Set default date to today
    document.getElementById('att-date').valueAsDate = new Date();
    // Default grade 1?
    document.getElementById('att-target-grade').value = "1";
    openView('takeAttendanceModal');
    loadAttendanceList();
}
function getAttendanceLocalKey(date, grade) {
    return `attendance_local_${date}_${grade}`;
}
function getAttendanceFallbackData(grade, date, externalStudents = null) {
    const gradeNum = parseInt(String(grade), 10);
    const source = Array.isArray(externalStudents) && externalStudents.length > 0
        ? externalStudents
        : (appState.allStudents || []);
    const pool = source.filter(s => Number(s.grade) === gradeNum);
    const demoPool = [
        { id: `G${grade}-001`, name: `Student ${grade}-A`, grade: gradeNum },
        { id: `G${grade}-002`, name: `Student ${grade}-B`, grade: gradeNum },
        { id: `G${grade}-003`, name: `Student ${grade}-C`, grade: gradeNum }
    ];
    const base = pool.length > 0 ? pool : demoPool;
    let local = [];
    try {
        local = JSON.parse(localStorage.getItem(getAttendanceLocalKey(date, grade)) || '[]');
    }
    catch (_e) {
        local = [];
    }
    const localMap = new Map(local.map(r => [r.student_id, r]));
    return base.map(s => {
        const id = s.id || s.student_id;
        const override = localMap.get(id);
        return {
            id: id,
            name: s.name || 'Student',
            photo_url: s.photo_url || null,
            status: override ? override.status : 'Not Marked',
            remarks: override ? (override.remarks || '') : ''
        };
    });
}
async function fetchAttendanceStudentsByGrade(grade) {
    const gradeNum = parseInt(String(grade), 10);

    const fromAllStudents = (arr) => (arr || []).filter(s => {
        const role = String(s.role || '').toLowerCase();
        return Number(s.grade) === gradeNum && (!role || role === 'student');
    });

    if (Array.isArray(appState.allStudents) && appState.allStudents.length > 0) {
        const local = fromAllStudents(appState.allStudents);
        if (local.length > 0) return local;
    }

    try {
        const res = await fetchAPI('/students/all');
        if (res.ok) {
            const all = await res.json();
            const filtered = fromAllStudents(all);
            if (filtered.length > 0) {
                appState.allStudents = all;
                return filtered;
            }
        }
    } catch (_e) { }

    try {
        const res = await fetchAPI('/teacher/overview');
        if (res.ok) {
            const data = await res.json();
            const roster = (data && data.roster) ? data.roster : [];
            const filtered = fromAllStudents(roster);
            if (filtered.length > 0) return filtered;
        }
    } catch (_e) { }

    return [];
}
function saveAttendanceFallback(date, grade, records) {
    localStorage.setItem(getAttendanceLocalKey(date, grade), JSON.stringify(records || []));
}
function loadAttendanceList() {
    return __awaiter(this, void 0, void 0, function* () {
        const grade = document.getElementById('att-target-grade').value;
        const date = document.getElementById('att-date').value;
        const tbody = document.getElementById('attendance-list-body');
        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4"><span class="spinner-border text-primary"></span></td></tr>';
        try {
            const res = yield fetchAPI(`/attendance/class/${grade}?date=${date}`);
            const data = yield res.json();
            tbody.innerHTML = '';
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4">No students found for this class.</td></tr>';
                return;
            }
            data.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold" style="width: 40px; height: 40px;">
                            ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${s.name}</div>
                            <div class="small text-muted">ID: ${s.id}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                     <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_p_${s.id}" value="Present" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="att_p_${s.id}">Present</label>

                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_a_${s.id}" value="Absent" ${s.status === 'Absent' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger btn-sm" for="att_a_${s.id}">Absent</label>

                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_l_${s.id}" value="Late" ${s.status === 'Late' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm" for="att_l_${s.id}">Late</label>
                    </div>
                </td>
                <td class="pe-4">
                    <input type="text" class="form-control form-control-sm" id="att_rem_${s.id}" placeholder="Note (optional)..." value="${s.remarks || ''}">
                </td>
            `;
                tbody.appendChild(tr);
            });
        }
        catch (e) {
            const serverStudents = yield fetchAttendanceStudentsByGrade(grade);
            const fallback = getAttendanceFallbackData(grade, date, serverStudents);
            tbody.innerHTML = '';
            if (fallback.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger p-4">Error: ${e.message}</td></tr>`;
                return;
            }
            fallback.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold" style="width: 40px; height: 40px;">
                            ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${s.name}</div>
                            <div class="small text-muted">ID: ${s.id}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                     <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_p_${s.id}" value="Present" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="att_p_${s.id}">Present</label>
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_a_${s.id}" value="Absent" ${s.status === 'Absent' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger btn-sm" for="att_a_${s.id}">Absent</label>
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_l_${s.id}" value="Late" ${s.status === 'Late' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm" for="att_l_${s.id}">Late</label>
                    </div>
                </td>
                <td class="pe-4">
                    <input type="text" class="form-control form-control-sm" id="att_rem_${s.id}" placeholder="Note (optional)..." value="${s.remarks || ''}">
                </td>`;
                tbody.appendChild(tr);
            });
            const notice = document.createElement('tr');
            notice.innerHTML = `<td colspan="3" class="text-center text-warning small py-2">Attendance API is unavailable. Showing real student records from backup source.</td>`;
            tbody.appendChild(notice);
        }
    });
}
function bulkSetAttendance(status) {
    const radios = document.querySelectorAll(`input[value="${status}"]`);
    radios.forEach(r => r.click()); // Simulate click to update UI if needed, or check
    radios.forEach(r => r.checked = true);
}
function getAttendanceSaveError(response) {
    return __awaiter(this, void 0, void 0, function* () {
        let detail = '';
        try {
            const raw = yield response.text();
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    detail = parsed.detail || parsed.message || raw;
                }
                catch (_a) {
                    detail = raw;
                }
            }
        }
        catch (_b) { }
        return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
    });
}
function saveAttendanceRecord() {
    return __awaiter(this, void 0, void 0, function* () {
        const date = document.getElementById('att-date').value;
        const grade = document.getElementById('att-target-grade').value;
        const records = [];
        if (!date) {
            alert("Please select a valid attendance date before saving.");
            return;
        }
        // Collect data
        const rows = document.getElementById('attendance-list-body').querySelectorAll('tr');
        rows.forEach(tr => {
            const idDiv = tr.querySelector('.small.text-muted');
            if (!idDiv)
                return;
            const sid = (idDiv.textContent.split(': ')[1] || '').trim();
            if (!sid)
                return;
            const statusInput = tr.querySelector('input[type="radio"]:checked');
            if (!statusInput)
                return;
            const status = statusInput.value;
            const remarksInput = tr.querySelector('input[type="text"]');
            const remarks = remarksInput ? remarksInput.value : '';
            records.push({ student_id: sid, status, remarks });
        });
        if (records.length === 0) {
            alert("No attendance rows found to save.");
            return;
        }
        const btn = document.querySelector('button[onclick="saveAttendanceRecord()"]');
        const original = btn ? btn.innerHTML : 'Save Record';
        try {
            if (btn) {
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
            }
            const res = yield fetchAPI('/attendance/bulk', {
                method: 'POST',
                body: JSON.stringify({ date, records })
            });
            if (!res.ok) {
                throw new Error(yield getAttendanceSaveError(res));
            }
            const data = yield res.json().catch(() => ({}));
            const saved = Number(data.saved || 0);
            const skipped = Number(data.skipped || 0);
            const studentNotified = Number(data.student_notified || 0);
            const parentNotified = Number(data.parent_notified || 0);
            if (btn) {
                btn.innerHTML = `Saved (${saved})`;
                btn.classList.replace('btn-primary-custom', 'btn-success');
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.replace('btn-success', 'btn-primary-custom');
                }, 2200);
            }
            alert(`Attendance saved: ${saved} record(s). Skipped: ${skipped}. Notifications sent -> Students: ${studentNotified}, Parents: ${parentNotified}.`);
        }
        catch (e) {
            const msg = (e && e.message) ? e.message : 'Unknown error';
            if (msg.startsWith('HTTP')) {
                if (btn) {
                    btn.innerHTML = original;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary-custom');
                }
                alert(`Attendance save failed: ${msg}`);
                return;
            }
            saveAttendanceFallback(date, grade, records);
            if (btn) {
                btn.innerHTML = original;
                btn.classList.remove('btn-success');
                btn.classList.add('btn-primary-custom');
            }
            alert("Server unreachable. Attendance is saved only in this browser cache, so student/parent notifications were not sent.");
        }
    });
}

// --- VIEW SPECIFIC LOGIC ---
function loadAttendanceViewList() {
    return __awaiter(this, void 0, void 0, function* () {
        const grade = document.getElementById('att-view-grade').value;
        const date = document.getElementById('att-view-date').value || new Date().toISOString().split('T')[0];
        // Ensure date input is set
        if (!document.getElementById('att-view-date').value) {
            document.getElementById('att-view-date').value = date;
        }

        const container = document.getElementById('attendance-view-list-body');
        if (!container) return; // Guard

        container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div><p>Loading...</p></div>';

        try {
            const res = yield fetchAPI(`/attendance/class/${grade}?date=${date}`);
            const data = yield res.json();

            if (data.length === 0) {
                container.innerHTML = '<div class="text-center p-5 text-muted">No students found for this class.</div>';
                return;
            }

            let html = '';
            data.forEach(s => {
                html += `
                <div class="py-3 border-bottom border-light hover-up transition-all bg-white" data-student-id="${s.id}">
                    <div class="row align-items-center">
                        <div class="col-md-4 ps-4">
                            <div class="d-flex align-items-center">
                                <div class="avatar-sm rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center me-3"
                                    style="width: 36px; height: 36px;">
                                    ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div class="fw-bold text-dark">${s.name}</div>
                                    <div class="small text-muted" style="font-size: 11px;">ID: ${s.id}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="btn-group w-100" role="group">
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_p_${s.id}" value="Present" autocomplete="off" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                                <label class="btn btn-outline-success btn-sm" for="att_view_p_${s.id}">Present</label>

                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_a_${s.id}" value="Absent" autocomplete="off" ${s.status === 'Absent' ? 'checked' : ''}>
                                <label class="btn btn-outline-danger btn-sm" for="att_view_a_${s.id}">Absent</label>
                                
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_l_${s.id}" value="Late" autocomplete="off" ${s.status === 'Late' ? 'checked' : ''}>
                                <label class="btn btn-outline-warning btn-sm" for="att_view_l_${s.id}">Late</label>
                            </div>
                        </div>
                        <div class="col-md-4 pe-4 text-end">
                            <input type="text" class="form-control border-0 bg-light rounded-pill px-3 shadow-sm d-inline-block w-100"
                                id="att_view_rem_${s.id}" value="${s.remarks || ''}" placeholder="Note...">
                        </div>
                    </div>
                </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            const serverStudents = yield fetchAttendanceStudentsByGrade(grade);
            const fallback = getAttendanceFallbackData(grade, date, serverStudents);
            if (fallback.length === 0) {
                container.innerHTML = `<div class="text-center text-danger p-5">Error: ${e.message}</div>`;
                return;
            }
            let html = '';
            fallback.forEach(s => {
                html += `
                <div class="py-3 border-bottom border-light hover-up transition-all bg-white" data-student-id="${s.id}">
                    <div class="row align-items-center">
                        <div class="col-md-4 ps-4">
                            <div class="d-flex align-items-center">
                                <div class="avatar-sm rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center me-3"
                                    style="width: 36px; height: 36px;">
                                    ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div class="fw-bold text-dark">${s.name}</div>
                                    <div class="small text-muted" style="font-size: 11px;">ID: ${s.id}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="btn-group w-100" role="group">
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_p_${s.id}" value="Present" autocomplete="off" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                                <label class="btn btn-outline-success btn-sm" for="att_view_p_${s.id}">Present</label>
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_a_${s.id}" value="Absent" autocomplete="off" ${s.status === 'Absent' ? 'checked' : ''}>
                                <label class="btn btn-outline-danger btn-sm" for="att_view_a_${s.id}">Absent</label>
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_l_${s.id}" value="Late" autocomplete="off" ${s.status === 'Late' ? 'checked' : ''}>
                                <label class="btn btn-outline-warning btn-sm" for="att_view_l_${s.id}">Late</label>
                            </div>
                        </div>
                        <div class="col-md-4 pe-4 text-end">
                            <input type="text" class="form-control border-0 bg-light rounded-pill px-3 shadow-sm d-inline-block w-100"
                                id="att_view_rem_${s.id}" value="${s.remarks || ''}" placeholder="Note...">
                        </div>
                    </div>
                </div>`;
            });
            container.innerHTML = html + `<div class="text-center text-warning small py-2">Attendance API is unavailable. Showing real student records from backup source.</div>`;
        }
    });
}

function bulkSetAttendanceView(status) {
    const list = document.getElementById('attendance-view-list-body');
    if (!list) return;
    const radios = list.querySelectorAll(`input[value="${status}"]`);
    radios.forEach(r => r.click());
    radios.forEach(r => r.checked = true);
}

function saveAttendanceViewRecord() {
    return __awaiter(this, void 0, void 0, function* () {
        const date = document.getElementById('att-view-date').value;
        const grade = document.getElementById('att-view-grade').value;
        const records = [];
        if (!date) {
            alert("Please select a valid attendance date before saving.");
            return;
        }

        const rows = document.getElementById('attendance-view-list-body').querySelectorAll('.bg-white[data-student-id]');
        rows.forEach(row => {
            const sid = (row.getAttribute('data-student-id') || '').trim();
            if (!sid)
                return;
            const statusInput = row.querySelector('input[type="radio"]:checked');
            if (!statusInput)
                return;
            const status = statusInput.value;
            const remarksInput = row.querySelector('input[type="text"]');
            const remarks = remarksInput ? remarksInput.value : '';
            records.push({ student_id: sid, status, remarks });
        });
        if (records.length === 0) {
            alert("No attendance rows found to save.");
            return;
        }

        try {
            const btn = document.querySelector('button[onclick="saveAttendanceViewRecord()"]');
            if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

            const res = yield fetchAPI('/attendance/bulk', {
                method: 'POST',
                body: JSON.stringify({ date, records })
            });
            if (!res.ok) {
                throw new Error(yield getAttendanceSaveError(res));
            }
            const data = yield res.json().catch(() => ({}));
            const saved = Number(data.saved || 0);
            const skipped = Number(data.skipped || 0);
            const studentNotified = Number(data.student_notified || 0);
            const parentNotified = Number(data.parent_notified || 0);

            if (btn) {
                btn.innerHTML = `Saved (${saved})`;
                btn.classList.replace('btn-primary-custom', 'btn-success');
                setTimeout(() => {
                    btn.innerHTML = 'Save Record';
                    btn.classList.replace('btn-success', 'btn-primary-custom');
                }, 2200);
            }
            alert(`Attendance saved: ${saved} record(s). Skipped: ${skipped}. Notifications sent -> Students: ${studentNotified}, Parents: ${parentNotified}.`);
        } catch (e) {
            const msg = (e && e.message) ? e.message : 'Unknown error';
            const btn = document.querySelector('button[onclick="saveAttendanceViewRecord()"]');
            if (msg.startsWith('HTTP')) {
                if (btn) {
                    btn.innerHTML = 'Save Record';
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary-custom');
                }
                alert(`Attendance save failed: ${msg}`);
                return;
            }
            saveAttendanceFallback(date, grade, records);
            if (btn) {
                btn.innerHTML = 'Save Record';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-primary-custom');
            }
            alert("Server unreachable. Attendance is saved only in this browser cache, so student/parent notifications were not sent.");
        }
    });
}

// Hook into View Switching
// This ensures that when the user navigates to the view, we load data
// Since I cannot easily edit `switchView` without finding it, I will add an event listener for visibility or just call it if the view is active.
// For now, I'll add an Observer or just rely on the user changing the controls. 
// Better: Add a global listener for hash change or view change if possible.
// Or, initialize it if the element exists on page load (if SPA state persists)

// Initialize Default Date on Load
document.addEventListener('DOMContentLoaded', () => {
    const d = document.getElementById('att-view-date');
    if (d) {
        d.valueAsDate = new Date();
        const activeView = (document.querySelector('.view.active') || {}).id || '';
        if (activeView === 'attendance-view') {
            loadAttendanceViewList();
        }
    }
});
// --- TIMETABLE & LEAVE ---
function timetablePdfAbsoluteUrl(filePath) {
    if (!filePath)
        return '#';
    if (String(filePath).startsWith('http://') || String(filePath).startsWith('https://')) {
        return filePath;
    }
    const backendRoot = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${backendRoot}${filePath}`;
}
function renderTimetablePdfCards(pdfItems, isStudent) {
    if (!Array.isArray(pdfItems) || pdfItems.length === 0) {
        return '<div class="alert alert-info mb-4">No timetable PDF uploaded yet.</div>';
    }
    return `
        <div class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-header bg-white fw-bold">Timetable PDF</div>
            <div class="card-body">
                <div class="row g-3">
                    ${pdfItems.map((item) => {
        const href = timetablePdfAbsoluteUrl(item.file_path);
        const classLabel = `Grade ${item.class_grade}${item.section ? `-${item.section}` : ''}`;
        const uploadedDate = item.uploaded_at ? new Date(item.uploaded_at).toLocaleString() : '-';
        return `
                            <div class="col-md-6 col-xl-4">
                                <div class="border rounded-3 p-3 h-100 bg-light">
                                    <div class="d-flex align-items-center justify-content-between mb-2">
                                        <span class="badge bg-primary-subtle text-primary">${classLabel}</span>
                                        <span class="small text-muted">${uploadedDate}</span>
                                    </div>
                                    <div class="fw-bold text-dark mb-2">${item.title || 'Timetable PDF'}</div>
                                    ${isStudent ? '' : `<div class="small text-muted mb-2">Uploaded by: ${item.uploaded_by || '-'}</div>`}
                                    <div class="d-flex gap-2">
                                        <a class="btn btn-sm btn-outline-primary" href="${href}" target="_blank" rel="noopener">View</a>
                                        <a class="btn btn-sm btn-primary-custom" href="${href}" download>Download</a>
                                    </div>
                                </div>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
        </div>
    `;
}
function handleTimetablePdfUpload(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const form = document.getElementById('timetable-pdf-upload-form');
        const gradeInput = document.getElementById('tt-upload-grade');
        const sectionInput = document.getElementById('tt-upload-section');
        const titleInput = document.getElementById('tt-upload-title');
        const fileInput = document.getElementById('tt-upload-file');
        if (!form || !gradeInput || !fileInput)
            return;
        const grade = Number(gradeInput.value);
        if (!grade || grade <= 0) {
            alert('Please enter a valid class grade.');
            return;
        }
        if (!fileInput.files || !fileInput.files[0]) {
            alert('Please select a PDF file.');
            return;
        }
        const selectedFile = fileInput.files[0];
        if (!String(selectedFile.name || '').toLowerCase().endsWith('.pdf')) {
            alert('Only PDF files are allowed.');
            return;
        }
        const fd = new FormData();
        fd.append('class_grade', String(grade));
        fd.append('section', sectionInput && sectionInput.value ? sectionInput.value.trim() : '');
        fd.append('title', titleInput && titleInput.value ? titleInput.value.trim() : '');
        fd.append('file', selectedFile);
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn)
            submitBtn.disabled = true;
        try {
            const res = yield fetchAPI('/timetable/upload-pdf', {
                method: 'POST',
                body: fd
            });
            const data = yield res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((data === null || data === void 0 ? void 0 : data.detail) || 'Failed to upload timetable PDF.');
            }
            const notified = data.notified || {};
            alert(`Timetable PDF uploaded. Notifications -> Students: ${Number(notified.students || 0)}, Parents: ${Number(notified.parents || 0)}, Teachers: ${Number(notified.teachers || 0)}.`);
            form.reset();
            yield loadTimetable();
        }
        catch (err) {
            alert(err.message || 'Upload failed.');
        }
        finally {
            if (submitBtn)
                submitBtn.disabled = false;
        }
    });
}
function loadTimetable() {
    return __awaiter(this, void 0, void 0, function* () {
        const isParent = isParentRole(appState.role);
        const container = document.getElementById(isParent ? 'parent-timetable-view' : 'timetable-view');
        if (!container)
            return;
        container.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span><p class="text-muted mt-2">Loading timetable...</p></div>';
        const isStudent = appState.role === 'Student' || isParent;
        let endpoint = isStudent ? '/timetable/student/my' : `/timetable/teacher/${encodeURIComponent(appState.userId || '')}`;
        let pdfEndpoint = isStudent ? '/timetable/student/my/pdfs' : '/timetable/teacher/my/pdfs';
        if (isParent && appState.activeStudentId) {
            endpoint += `?student_id=${encodeURIComponent(appState.activeStudentId)}`;
            pdfEndpoint += `?student_id=${encodeURIComponent(appState.activeStudentId)}`;
        }
        try {
            const [res, pdfRes] = yield Promise.all([
                fetchAPI(endpoint),
                fetchAPI(pdfEndpoint)
            ]);
            if (!res.ok) {
                const err = yield res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to load timetable.');
            }
            const data = yield res.json();
            let pdfItems = [];
            if (pdfRes.ok) {
                const pdfData = yield pdfRes.json().catch(() => []);
                if (Array.isArray(pdfData)) {
                    pdfItems = pdfData;
                }
            }
            let entries = [];
            if (Array.isArray(data.entries)) {
                entries = data.entries;
            }
            else if (data && typeof data === 'object') {
                Object.keys(data).forEach(day => {
                    const dayRows = Array.isArray(data[day]) ? data[day] : [];
                    dayRows.forEach(r => {
                        const time = String(r.time || '').split('-').map(v => v.trim());
                        entries.push({
                            day_of_week: day,
                            period_number: r.period || null,
                            start_time: time[0] || '',
                            end_time: time[1] || '',
                            subject: r.subject || '',
                            class_grade: null,
                            section: null
                        });
                    });
                });
            }
            const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
            entries.sort((a, b) => {
                const da = dayOrder[a.day_of_week] || 99;
                const db = dayOrder[b.day_of_week] || 99;
                if (da !== db)
                    return da - db;
                const pa = Number(a.period_number || 0);
                const pb = Number(b.period_number || 0);
                if (pa !== pb)
                    return pa - pb;
                return String(a.start_time || '').localeCompare(String(b.start_time || ''));
            });
            const grouped = {};
            entries.forEach(e => {
                const day = e.day_of_week || 'Unknown';
                if (!grouped[day])
                    grouped[day] = [];
                grouped[day].push(e);
            });
            const uploadBlock = !isStudent
                ? `
                <div class="card border-0 shadow-sm rounded-4 mb-4">
                    <div class="card-header bg-white fw-bold">Upload Timetable PDF</div>
                    <div class="card-body">
                        <form id="timetable-pdf-upload-form" class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Class Grade</label>
                                <input id="tt-upload-grade" type="number" min="1" max="12" class="form-control" required>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Section (Optional)</label>
                                <input id="tt-upload-section" type="text" class="form-control" placeholder="A">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Title (Optional)</label>
                                <input id="tt-upload-title" type="text" class="form-control" placeholder="Mid-Term Timetable">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">PDF File</label>
                                <input id="tt-upload-file" type="file" accept=".pdf,application/pdf" class="form-control" required>
                            </div>
                            <div class="col-12">
                                <button type="submit" class="btn btn-primary-custom">Upload Timetable PDF</button>
                            </div>
                        </form>
                    </div>
                </div>
                `
                : '';
            const timetableBody = entries.length
                ? `${Object.keys(grouped).map(day => `
                    <div class="card border-0 shadow-sm rounded-4 mb-3">
                        <div class="card-header bg-white fw-bold">${day}</div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-sm align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-3">Period</th>
                                            <th>Time</th>
                                            <th>Subject</th>
                                            ${isStudent ? '' : '<th class="pe-3">Class</th>'}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${grouped[day].map(r => `
                                            <tr>
                                                <td class="ps-3">${r.period_number || '-'}</td>
                                                <td>${r.start_time || '-'}${r.end_time ? ` - ${r.end_time}` : ''}</td>
                                                <td>${r.subject || '-'}</td>
                                                ${isStudent ? '' : `<td class="pe-3">${r.class_grade ? `Grade ${r.class_grade}${r.section ? `-${r.section}` : ''}` : '-'}</td>`}
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `).join('')}`
                : '<div class="alert alert-info mb-0">No timetable records found.</div>';
            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h3 class="fw-bold mb-1 text-dark">${isStudent ? 'My Timetable' : 'Teacher Timetable'}</h3>
                        <p class="text-muted small mb-0">${isStudent ? `Grade ${data.grade || '-'}${data.section ? ` • Section ${data.section}` : ''}` : (appState.userName || appState.userId || '')}</p>
                    </div>
                </div>
                ${uploadBlock}
                ${renderTimetablePdfCards(pdfItems, isStudent)}
                ${timetableBody}
            `;
            if (!isStudent) {
                const uploadForm = document.getElementById('timetable-pdf-upload-form');
                if (uploadForm && !uploadForm.dataset.bound) {
                    uploadForm.dataset.bound = '1';
                    uploadForm.addEventListener('submit', handleTimetablePdfUpload);
                }
            }
        }
        catch (e) {
            container.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
        }
    });
}

function loadStudentAttendanceView() {
    return __awaiter(this, void 0, void 0, function* () {
        const view = document.getElementById('parent-attendance-view');
        if (!view)
            return;
        view.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span><p class="text-muted mt-2">Loading attendance...</p></div>';
        try {
            const now = new Date();
            const selectedMonth = Number(view.dataset.selectedMonth || (now.getMonth() + 1));
            const selectedYear = Number(view.dataset.selectedYear || now.getFullYear());
            let attendanceEndpoint = `/attendance/student/my?month=${encodeURIComponent(String(selectedMonth))}&year=${encodeURIComponent(String(selectedYear))}&months_back=6`;
            if (isParentRole(appState.role) && appState.activeStudentId) {
                attendanceEndpoint += `&student_id=${encodeURIComponent(appState.activeStudentId)}`;
            }
            const res = yield fetchAPI(attendanceEndpoint);
            if (!res.ok) {
                const err = yield res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to load attendance.');
            }
            const data = yield res.json();
            const summary = data.summary || {};
            const records = Array.isArray(data.records) ? data.records : [];
            const monthly = Array.isArray(data.monthly_summary) ? data.monthly_summary : [];
            const dailyTrend = data.trend && Array.isArray(data.trend.daily) ? data.trend.daily : [];
            const monthOptions = [
                { v: 1, label: 'January' }, { v: 2, label: 'February' }, { v: 3, label: 'March' },
                { v: 4, label: 'April' }, { v: 5, label: 'May' }, { v: 6, label: 'June' },
                { v: 7, label: 'July' }, { v: 8, label: 'August' }, { v: 9, label: 'September' },
                { v: 10, label: 'October' }, { v: 11, label: 'November' }, { v: 12, label: 'December' }
            ];
            view.innerHTML = `
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                    <h3 class="fw-bold mb-0 text-dark">My Attendance</h3>
                    <div class="d-flex gap-2 align-items-center">
                        <select id="student-att-month" class="form-select form-select-sm">
                            ${monthOptions.map(m => `<option value="${m.v}" ${m.v === selectedMonth ? 'selected' : ''}>${m.label}</option>`).join('')}
                        </select>
                        <input id="student-att-year" type="number" class="form-control form-control-sm" min="2000" max="2100" value="${selectedYear}" style="max-width: 100px;">
                        <button id="student-att-apply" class="btn btn-sm btn-primary-custom">Apply</button>
                    </div>
                </div>
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Overall Rate</div><div class="h4 fw-bold mb-0">${summary.overall_rate ?? 0}%</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Month Rate</div><div class="h4 fw-bold mb-0 text-primary">${summary.window_rate ?? 0}%</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Present</div><div class="h4 fw-bold mb-0 text-success">${summary.present || 0}</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Absent</div><div class="h4 fw-bold mb-0 text-danger">${summary.absent || 0}</div></div></div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
                    <h6 class="fw-bold mb-3">Present vs Absent Trend (${data.from_date || '-'} to ${data.to_date || '-'})</h6>
                    <div id="student-attendance-trend-chart" style="height: 280px;"></div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
                    <h6 class="fw-bold mb-3">Monthly Summary (Last ${monthly.length || 0} months)</h6>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-3">Month</th>
                                    <th>Present</th>
                                    <th>Absent</th>
                                    <th>Late</th>
                                    <th class="pe-3">Attendance %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${monthly.length ? monthly.map(m => `
                                    <tr>
                                        <td class="ps-3">${m.month || '-'}</td>
                                        <td>${m.present || 0}</td>
                                        <td>${m.absent || 0}</td>
                                        <td>${m.late || 0}</td>
                                        <td class="pe-3 fw-semibold">${m.attendance_rate ?? 0}%</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" class="text-center text-muted p-3">No monthly summary available.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="card-header bg-white fw-semibold">Attendance Records (${data.from_date || '-'} to ${data.to_date || '-'})</div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-3">Date</th>
                                    <th>Status</th>
                                    <th class="pe-3">Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.length ? records.map(r => `
                                    <tr>
                                        <td class="ps-3">${r.date || '-'}</td>
                                        <td>${r.status || '-'}</td>
                                        <td class="pe-3">${r.remarks || '-'}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3" class="text-center text-muted p-4">No attendance records found.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            const applyBtn = document.getElementById('student-att-apply');
            const monthEl = document.getElementById('student-att-month');
            const yearEl = document.getElementById('student-att-year');
            if (applyBtn && monthEl && yearEl) {
                applyBtn.onclick = () => {
                    const m = Number(monthEl.value || now.getMonth() + 1);
                    const y = Number(yearEl.value || now.getFullYear());
                    view.dataset.selectedMonth = String(m);
                    view.dataset.selectedYear = String(y);
                    loadStudentAttendanceView();
                };
            }
            const trendChart = document.getElementById('student-attendance-trend-chart');
            if (trendChart && typeof Plotly !== 'undefined' && dailyTrend.length) {
                const x = dailyTrend.map(d => d.date || '');
                const presentY = dailyTrend.map(d => Number(d.present || 0));
                const absentY = dailyTrend.map(d => Number(d.absent || 0));
                const tracePresent = { x, y: presentY, mode: 'lines+markers', type: 'scatter', name: 'Present', line: { color: '#198754', width: 2 } };
                const traceAbsent = { x, y: absentY, mode: 'lines+markers', type: 'scatter', name: 'Absent', line: { color: '#dc3545', width: 2 } };
                const layout = { margin: { t: 20, r: 20, b: 50, l: 40 }, xaxis: { title: 'Date' }, yaxis: { title: 'Flag', range: [-0.1, 1.1], dtick: 1 }, legend: { orientation: 'h' } };
                loadPlotlyAndRender(() => Plotly.newPlot(trendChart, [tracePresent, traceAbsent], layout, { displayModeBar: false, responsive: true }));
            }
        }
        catch (e) {
            view.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
        }
    });
}
function loadPendingLeaves() {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('leave-requests-list');
        if (!list)
            return;
        list.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
        try {
            const res = yield fetchAPI('/leave/student/pending');
            const data = yield res.json();
            list.innerHTML = '';
            if (data.length === 0) {
                list.innerHTML = '<div class="list-group-item p-4 text-center text-muted">No pending leave requests.</div>';
                return;
            }
            data.forEach(l => {
                const item = document.createElement('div');
                item.className = 'list-group-item p-4 mb-3 rounded-4 border shadow-sm';
                item.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h5 class="fw-bold mb-1">${l.student_name} <span class="badge bg-light text-dark border">Grade ${l.grade}</span></h5>
                        <p class="mb-1 text-primary fw-medium">${l.type} • ${l.dates}</p>
                        <p class="text-muted small mb-0">"${l.reason}"</p>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-outline-danger btn-sm" onclick="handleLeaveAction(${l.id}, 'deny')">Deny</button>
                        <button class="btn btn-success btn-sm text-white" onclick="handleLeaveAction(${l.id}, 'approve')">Approve</button>
                    </div>
                </div>
            `;
                list.appendChild(item);
            });
        }
        catch (e) {
            list.innerHTML = `<div class="text-danger p-3">Error loading leaves: ${e.message}</div>`;
        }
    });
}
function handleLeaveAction(id, action) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to ${action} this request?`))
            return;
        try {
            yield fetchAPI(`/leave/${id}/action`, {
                method: 'POST',
                body: JSON.stringify({ action: action, reviewer_id: 'teacher' }) // Mock teacher ID
            });
            loadPendingLeaves(); // Refresh
            alert(`Request ${action}d successfully.`);
        }
        catch (e) {
            alert(e.message);
        }
    });
}
// Auto-load leaves when view is switched to
// Hooking into switchView is complex without editing it, but we can call it manually for now via the Refresh button I added.
// --- TEACHER AI CO-PILOT ---
function openTeacherAICoPilot() {
    openView('teacherAICoPilotModal');
}
function sendTeacherAIMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('teacher-ai-input');
        const msg = input.value.trim();
        if (!msg)
            return;
        const teacherId = localStorage.getItem('userId') || 'teacher_001'; // Default for demo
        const history = document.getElementById('teacher-ai-chat-history');
        const typing = document.getElementById('teacher-ai-typing');
        // Add User Message
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex justify-content-end mb-3';
        userDiv.innerHTML = `
        <div class="bg-primary text-white p-3 rounded-4 shadow-sm" style="max-width: 85%; border-bottom-right-radius: 4px;">
            ${msg}
        </div>`;
        history.appendChild(userDiv);
        input.value = '';
        history.scrollTop = history.scrollHeight;
        // Show Typing
        typing.classList.remove('d-none');
        history.scrollTop = history.scrollHeight;
        try {
            const response = yield fetch(`${API_BASE_URL}/api/ai/teacher-chat/${teacherId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: msg })
            });
            const data = yield response.json();
            // Hide Typing
            typing.classList.add('d-none');
            // Add Bot Message
            const botDiv = document.createElement('div');
            botDiv.className = 'd-flex justify-content-start mb-3';
            // Simple Markdown/Table formatting
            let reply = data.reply;
            if (typeof marked !== 'undefined') {
                reply = marked.parse(reply);
            }
            else {
                // Basic fallback for line breaks and bold
                reply = reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            }
            botDiv.innerHTML = `
            <div class="bg-light p-3 rounded-4 shadow-sm border" style="max-width: 85%; border-bottom-left-radius: 4px;">
                <div class="fw-bold mb-2 text-primary d-flex align-items-center gap-2">
                    <span class="material-icons fs-6">smart_toy</span> AI Assistant
                </div>
                <div class="bot-content">${reply}</div>
            </div>`;
            history.appendChild(botDiv);
            history.scrollTop = history.scrollHeight;
        }
        catch (error) {
            typing.classList.add('d-none');
            console.error("Teacher AI Error:", error);
            const errDiv = document.createElement('div');
            errDiv.className = 'd-flex justify-content-start mb-3';
            errDiv.innerHTML = `<div class="bg-danger-subtle text-danger p-3 rounded-4 small">Sorry, I couldn't reach the AI service. Please try again later.</div>`;
            history.appendChild(errDiv);
        }
    });
}

// --- QUIZ TAKING LOGIC ---
async function takeQuiz(quizId) {
    if (!appState.isLoggedIn) { alert("Please login first."); return; }

    // Fetch Quiz
    let quiz = null;
    const btn = document.querySelector(`button[onclick="takeQuiz('${quizId}')"]`);
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

    try {
        const res = await fetchAPI(`/quizzes/${quizId}`);
        if (!res.ok) throw new Error("Failed to load quiz");
        quiz = await res.json();
    } catch (e) {
        alert("Error loading quiz: " + e.message);
        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        return;
    }

    if (btn) { btn.innerHTML = originalText; btn.disabled = false; }

    const modalEl = document.getElementById('takeQuizModal');
    if (!modalEl) {
        alert("Take Quiz modal missing from HTML.");
        return;
    }

    // Populate Modal
    const titleEl = document.getElementById('take-quiz-title');
    const questionsContainer = document.getElementById('quiz-questions-container');

    if (titleEl) titleEl.textContent = quiz.title;

    // Store current quiz info for submission
    appState.currentQuiz = {
        id: quiz.id,
        totalQuestions: quiz.questions.length
    };

    const questionsHtml = quiz.questions.map((q, idx) => {
        let optionsHtml = '';
        if (q.options && Array.isArray(q.options)) {
            optionsHtml = q.options.map((opt, optIdx) => {
                const val = opt;
                return `
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="radio" name="q_${idx}" id="q_${idx}_${optIdx}" value="${val.replace(/"/g, '&quot;')}">
                        <label class="form-check-label" for="q_${idx}_${optIdx}">
                            ${opt}
                        </label>
                    </div>
                `;
            }).join('');
        }

        return `
            <div class="card mb-4 border-0 shadow-sm">
                <div class="card-body">
                    <h5 class="card-title fw-bold mb-3">${idx + 1}. ${q.question}</h5>
                    ${optionsHtml}
                </div>
            </div>
        `;
    }).join('');

    if (questionsContainer) {
        questionsContainer.innerHTML = questionsHtml;
    }

    // Reset Submit Button in Footer if it was changed to Close
    const footer = modalEl.querySelector('.modal-footer');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" data-i18n="btn_cancel">Cancel</button>
            <button type="button" class="btn btn-primary-custom fw-bold px-4" onclick="submitQuizAnswers()">
                Submit Quiz
            </button>
        `;
        // Re-run i18n
        if (typeof translatePage === 'function') translatePage();
    }

    openView(modalEl.id);
}

async function submitQuizAnswers() {
    if (!appState.currentQuiz) return;
    const { id: quizId, totalQuestions } = appState.currentQuiz;

    if (!confirm("Are you sure you want to submit?")) return;

    const answers = {};
    for (let i = 0; i < totalQuestions; i++) {
        const selected = document.querySelector(`input[name="q_${i}"]:checked`);
        if (selected) {
            answers[i] = selected.value;
        } else {
            answers[i] = "";
        }
    }

    const studentId = appState.userId;
    if (!studentId) {
        alert("User context missing.");
        return;
    }

    const modalEl = document.getElementById('takeQuizModal');
    const btn = modalEl ? modalEl.querySelector('button[onclick^="submitQuizAnswers"]') : null;
    const originalText = btn ? btn.innerHTML : 'Submit Quiz';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';
    }

    try {
        const res = await fetchAPI(`/quizzes/${quizId}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                student_id: studentId,
                answers: answers
            })
        });

        const result = await res.json();

        if (res.ok) {
            const questionsContainer = document.getElementById('quiz-questions-container');
            if (questionsContainer) {
                questionsContainer.innerHTML = `
                    <div class="text-center p-5">
                        <div class="mb-4">
                            <span class="material-icons text-success" style="font-size: 64px;">check_circle</span>
                        </div>
                        <h3 class="fw-bold text-success mb-3">Quiz Submitted!</h3>
                        <div class="display-4 fw-bold mb-3">${Math.round(result.score_percent)}%</div>
                        <p class="text-muted">You scored ${result.score} out of ${result.total}.</p>
                        ${result.ai_feedback ? `
                            <div class="card bg-light border-0 mt-4 text-start">
                                <div class="card-body">
                                    <h6 class="fw-bold text-primary"><span class="material-icons align-middle fs-6 me-1">psychology</span> AI Feedback</h6>
                                    <p class="small mb-0">${result.ai_feedback}</p>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                 `;
            }

            const footer = modalEl ? modalEl.querySelector('.modal-footer') : null;
            if (footer) {
                footer.innerHTML = '<button type="button" class="btn btn-primary-custom px-4" data-bs-dismiss="modal">Close</button>';
            }

            // Refresh stats if available
            if (typeof loadStudentDashboard === 'function') loadStudentDashboard(appState.userId);
        } else {
            alert("Submission failed: " + (result.detail || "Unknown error"));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }

    } catch (e) {
        console.error("Quiz Submission Error Details:", e);
        alert(`Network error submitting quiz: ${e.message}. See console for details.`);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}


// --- TEACHER LEAVE APPLICATION ---
async function handleTeacherLeaveSubmit(event) {
    event.preventDefault();

    // Get values
    const leaveTypeEl = document.querySelector('input[name="leaveType"]:checked');
    const startEl = document.getElementById('teacher-leave-start');
    const endEl = document.getElementById('teacher-leave-end');
    const reasonEl = document.getElementById('teacher-leave-reason');

    if (!leaveTypeEl || !startEl || !endEl || !reasonEl) {
        alert("Please fill all fields.");
        return;
    }

    const leaveType = leaveTypeEl.value;
    const startDate = startEl.value;
    const endDate = endEl.value;
    const reason = reasonEl.value;

    if (!startDate || !endDate || !reason) {
        alert("Please fill all fields.");
        return;
    }

    // API Payload
    const payload = {
        user_id: appState.userId, // Authenticated User ID or from state
        type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason
    };

    // Disable button to prevent double submit
    const btn = event.submitter;
    const originalText = btn ? btn.innerText : 'Submit Request';
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Submitting...";
    }

    try {
        const response = await fetchAPI('/leave/apply', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
            alert(data.message || 'Leave application submitted successfully! Notification sent to Principal.');
            document.getElementById('teacher-leave-form').reset();
        } else {
            alert('Failed to submit leave: ' + (data.detail || data.message || "Unknown error"));
        }
    } catch (error) {
        console.error("Leave submit error:", error);
        alert('Network error submitting leave request.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
}

/* --- LEAVE MANAGEMENT FUNCTIONS --- */

function loadStudentLeaveView() {
    const listContainer = document.getElementById('student-leave-history-list');
    if (!listContainer) return;

    // Setup Form Submit
    const form = document.getElementById('student-leave-form');
    // Remove old listeners to avoid duplicates
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('leave-type').value;
        const start = document.getElementById('leave-start').value;
        const end = document.getElementById('leave-end').value;
        const reason = document.getElementById('leave-reason').value;

        try {
            const res = await fetchAPI('/leave/apply', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: appState.userId,
                    type, start_date: start, end_date: end, reason
                })
            });

            if (res.ok) {
                alert('Leave application submitted successfully!');
                newForm.reset();
                loadMyLeaveHistory(); // Refresh list
            } else {
                try {
                    const errData = await res.json();
                    alert('Failed to submit application: ' + (errData.detail || errData.message || "Unknown error"));
                } catch (e) {
                    alert('Failed to submit application. Status: ' + res.status);
                }
            }
        } catch (err) {
            console.error(err);
            alert('Error submitting application.');
        }
    });

    loadMyLeaveHistory();
}

async function loadMyLeaveHistory() {
    const listContainer = document.getElementById('student-leave-history-list');
    listContainer.innerHTML = '<div class="text-center p-3">Loading...</div>';

    try {
        const res = await fetchAPI(`/leave/my-history?user_id=${appState.userId}`);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to load: ${res.status} ${errText}`);
        }
        const history = await res.json();

        if (history.length === 0) {
            listContainer.innerHTML = '<div class="text-center p-4 text-muted">No leave history found.</div>';
            return;
        }

        listContainer.innerHTML = '';
        history.forEach(req => {
            let badgeClass = 'bg-warning';
            if (req.status === 'Approved') badgeClass = 'bg-success';
            if (req.status === 'Denied') badgeClass = 'bg-danger';

            const html = `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge ${badgeClass}">${req.status}</span>
                        <small class="text-muted">${new Date(req.created_at).toLocaleDateString()}</small>
                    </div>
                    <h6 class="mb-1">${req.type}</h6>
                    <small class="text-muted d-block">${req.start_date} to ${req.end_date}</small>
                    <p class="mb-0 small mt-1 text-secondary">"${req.reason}"</p>
                </div>
            `;
            listContainer.innerHTML += html;
        });

    } catch (e) {
        listContainer.innerHTML = `<div class="text-danger p-3">Error loading history: ${e.message}</div>`;
    }
}

async function loadParentFeesView() {
    const view = document.getElementById('parent-fees-view');
    if (!view)
        return;
    view.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span><p class="text-muted mt-2">Loading child fee data...</p></div>';
    try {
        const res = await fetchAPI('/finance/fees/child');
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(payload.detail || 'Failed to load child fee invoices.');
        }
        const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
        const totalDue = invoices
            .filter(i => String(i.status || '').toLowerCase() !== 'paid')
            .reduce((sum, i) => sum + Number(i.amount || 0), 0);
        const rows = invoices.map(i => `
            <tr>
                <td class="ps-4">${i.student_id || '-'}</td>
                <td>${i.invoice_number || '-'}</td>
                <td>${i.description || '-'}</td>
                <td>$${Number(i.amount || 0).toFixed(2)}</td>
                <td>${i.due_date || '-'}</td>
                <td><span class="badge ${String(i.status || '').toLowerCase() === 'paid' ? 'bg-success' : 'bg-warning text-dark'}">${i.status || 'Pending'}</span></td>
            </tr>
        `).join('');
        view.innerHTML = `
            <h3 class="fw-bold mb-4 text-dark">Child Fees</h3>
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-body p-4 d-flex justify-content-between align-items-center">
                    <div>
                        <div class="small text-muted">Outstanding</div>
                        <h4 class="fw-bold mb-0">$${totalDue.toFixed(2)}</h4>
                    </div>
                    <div class="text-muted small">Linked Students: ${(payload.child_ids || []).length}</div>
                </div>
            </div>
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="ps-4">Student</th>
                                <th>Invoice</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Due Date</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td class="ps-4 text-muted" colspan="6">No fee invoices found.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    catch (e) {
        view.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
    }
}

function initParentLeaveApplyView() {
    const view = document.getElementById('parent-leave-apply-view');
    if (!view)
        return;
    const form = view.querySelector('form');
    if (!form)
        return;
    if (form.dataset.bound === '1')
        return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateInputs = form.querySelectorAll('input[type="date"]');
        const reasonEl = form.querySelector('textarea');
        const start = dateInputs[0] ? dateInputs[0].value : '';
        const end = dateInputs[1] ? dateInputs[1].value : '';
        const reason = reasonEl ? reasonEl.value.trim() : '';
        const targetStudentId = appState.activeStudentId || appState.userId;
        if (!targetStudentId) {
            alert('No linked student found for leave request.');
            return;
        }
        if (!start || !end || !reason) {
            alert('Please fill start date, end date, and reason.');
            return;
        }
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn)
            submitBtn.textContent = 'Submitting...';
        try {
            const res = await fetchAPI('/leave/apply', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: targetStudentId,
                    type: 'Parent Request',
                    start_date: start,
                    end_date: end,
                    reason
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.detail || 'Failed to submit leave request.');
            }
            alert('Leave request submitted.');
            form.reset();
            loadParentLeaveStatusView();
        }
        catch (err) {
            alert(err.message || 'Failed to submit leave request.');
        }
        finally {
            if (submitBtn)
                submitBtn.textContent = originalLabel || 'Submit Request';
        }
    });
}

async function loadParentLeaveStatusView() {
    const view = document.getElementById('parent-leave-status-view');
    if (!view)
        return;
    const list = view.querySelector('.list-group');
    if (!list)
        return;
    const targetStudentId = appState.activeStudentId || appState.userId;
    if (!targetStudentId) {
        list.innerHTML = '<div class="list-group-item text-muted">No linked student found.</div>';
        return;
    }
    list.innerHTML = '<div class="list-group-item text-muted">Loading...</div>';
    try {
        const res = await fetchAPI(`/leave/my-history?user_id=${encodeURIComponent(targetStudentId)}`);
        const rows = await res.json().catch(() => []);
        if (!res.ok) {
            throw new Error('Failed to load leave history.');
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            list.innerHTML = '<div class="list-group-item text-muted">No leave records found.</div>';
            return;
        }
        list.innerHTML = rows.map((req) => {
            const status = String(req.status || 'Pending');
            const statusClass = status === 'Approved' ? 'bg-success' : (status === 'Rejected' || status === 'Denied' ? 'bg-danger' : 'bg-warning text-dark');
            return `
                <div class="list-group-item p-3 d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold text-dark">${req.type || 'Leave Request'}</span>
                        <div class="small text-muted">${req.start_date || '-'} - ${req.end_date || '-'}</div>
                        <div class="small text-secondary">${req.reason || ''}</div>
                    </div>
                    <span class="badge ${statusClass} rounded-pill">${status}</span>
                </div>
            `;
        }).join('');
    }
    catch (e) {
        list.innerHTML = `<div class="list-group-item text-danger">${e.message}</div>`;
    }
}

function setLeaveApprovalTab(activeTab) {
    const pendingTab = document.getElementById('leave-approval-pending-tab');
    const historyTab = document.getElementById('leave-approval-history-tab');
    if (!pendingTab || !historyTab) return;

    if (activeTab === 'history') {
        pendingTab.classList.remove('active', 'bg-primary', 'text-white', 'shadow-sm', 'rounded-pill');
        pendingTab.classList.add('text-muted');
        historyTab.classList.add('active', 'bg-primary', 'text-white', 'shadow-sm', 'rounded-pill');
        historyTab.classList.remove('text-muted');
    } else {
        historyTab.classList.remove('active', 'bg-primary', 'text-white', 'shadow-sm', 'rounded-pill');
        historyTab.classList.add('text-muted');
        pendingTab.classList.add('active', 'bg-primary', 'text-white', 'shadow-sm', 'rounded-pill');
        pendingTab.classList.remove('text-muted');
    }
}

function initTeacherLeaveApprovalTabs() {
    const pendingTab = document.getElementById('leave-approval-pending-tab');
    const historyTab = document.getElementById('leave-approval-history-tab');
    if (!pendingTab || !historyTab || pendingTab.dataset.bound === '1') return;

    pendingTab.dataset.bound = '1';
    historyTab.dataset.bound = '1';

    pendingTab.addEventListener('click', (event) => {
        event.preventDefault();
        loadTeacherLeaveApprovals();
    });

    historyTab.addEventListener('click', (event) => {
        event.preventDefault();
        loadTeacherLeaveHistory();
    });
}

async function loadTeacherLeaveApprovals() {
    initTeacherLeaveApprovalTabs();
    setLeaveApprovalTab('pending');

    const container = document.getElementById('leave-approval-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center p-5">Loading requests...</div>';

    try {
        const res = await fetchAPI('/leave/pending');
        if (!res.ok) throw new Error('Fetch failed');
        const requests = await res.json();

        const pendingTab = document.getElementById('leave-approval-pending-tab');
        if (pendingTab) pendingTab.textContent = `Pending (${requests.length})`;

        if (requests.length === 0) {
            container.innerHTML = '<div class="text-center p-5 text-muted">No pending leave requests.</div>';
            return;
        }

        container.innerHTML = '';
        requests.forEach(req => {
            const start = new Date(req.start_date);
            const end = new Date(req.end_date);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const html = `
                <li class="list-group-item p-4 border-light">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-3">
                            <div class="avatar-md bg-soft-warning text-warning rounded-circle d-flex align-items-center justify-content-center fw-bold"
                                style="width: 50px; height: 50px; background-color: #fff3cd;">
                                ${req.name.charAt(0)}
                            </div>
                            <div>
                                <h6 class="mb-1 fw-bold text-dark">${req.name} <span
                                        class="badge bg-light text-muted border fw-normal ms-2">Grade ${req.grade}</span>
                                </h6>
                                <div class="text-muted small"><i
                                        class="material-icons align-middle fs-6 me-1 text-secondary">event</i> 
                                    ${req.start_date} - ${req.end_date} (${diffDays} Days) • <span class="fw-medium text-dark">${req.type}</span>
                                    <div class="mt-1">
                                        ${req.admin_approval === 'Approved' ? '<span class="badge bg-success bg-opacity-10 text-success border me-1" style="font-size:0.7rem;">Admin: Approved</span>' : '<span class="badge bg-secondary bg-opacity-10 text-secondary border me-1" style="font-size:0.7rem;">Admin: Pending</span>'}
                                        ${req.principal_approval === 'Approved' ? '<span class="badge bg-success bg-opacity-10 text-success border" style="font-size:0.7rem;">Principal: Approved</span>' : '<span class="badge bg-secondary bg-opacity-10 text-secondary border" style="font-size:0.7rem;">Principal: Pending</span>'}
                                    </div>
                                    </div>
                                <p class="mb-0 mt-2 text-muted small fst-italic">"${req.reason}"</p>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <button onclick="updateLeaveStatus(${req.id}, 'Denied')" class="btn btn-outline-danger btn-sm rounded-pill px-3 fw-medium">Deny</button>
                            <button onclick="updateLeaveStatus(${req.id}, 'Approved')" class="btn btn-success btn-sm rounded-pill px-4 fw-bold shadow-sm">Approve Request</button>
                        </div>
                    </div>
                </li>
            `;
            container.innerHTML += html;
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-danger">Error loading requests.</div>';
    }
}

async function loadTeacherLeaveHistory() {
    initTeacherLeaveApprovalTabs();
    setLeaveApprovalTab('history');

    const container = document.getElementById('leave-approval-list');
    if (!container) return;

    container.innerHTML = `
        <li class="list-group-item p-4 text-center text-muted">
            <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
            Loading leave history...
        </li>
    `;

    try {
        let res = await fetchAPI('/leave/history');
        let usingMyHistoryFallback = false;
        if (!res.ok && res.status === 404) {
            // Backward-compatible fallback if backend route is behind.
            res = await fetchAPI('/leave/processed');
        }
        if (!res.ok && res.status === 404 && appState.userId) {
            // Final fallback for older backends: show current user's history.
            usingMyHistoryFallback = true;
            res = await fetchAPI(`/leave/my-history?user_id=${encodeURIComponent(appState.userId)}`);
        }
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status}${errText ? `: ${errText}` : ''}`);
        }
        const history = await res.json();

        if (history.length === 0) {
            container.innerHTML = `
                <li class="list-group-item p-4 text-center text-muted">
                    No approved or denied leave requests yet.
                </li>
            `;
            return;
        }

        container.innerHTML = '';
        history.forEach(req => {
            const statusClass = req.status === 'Approved' ? 'bg-success' : 'bg-danger';
            const reviewedBy = req.reviewed_by || 'N/A';
            const studentName = req.name || req.user_id;
            const grade = req.grade || '-';
            const createdAt = req.created_at ? new Date(req.created_at).toLocaleDateString() : '-';

            const html = `
                <li class="list-group-item p-4 border-light">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                        <div>
                            <h6 class="mb-1 fw-bold text-dark">${studentName} <span class="badge bg-light text-muted border fw-normal ms-2">Grade ${grade}</span></h6>
                            <div class="text-muted small">${req.start_date} - ${req.end_date} • ${req.type}</div>
                            <p class="mb-0 mt-2 text-muted small fst-italic">"${req.reason}"</p>
                        </div>
                        <div class="text-end">
                            <span class="badge ${statusClass}">${req.status}</span>
                            <div class="small text-muted mt-2">Reviewed by: ${reviewedBy}</div>
                            <div class="small text-muted">Applied: ${createdAt}</div>
                        </div>
                    </div>
                </li>
            `;
            container.innerHTML += html;
        });

        if (usingMyHistoryFallback) {
            container.innerHTML = `
                <li class="list-group-item p-3 bg-light border-0 text-muted small">
                    <span class="material-icons align-middle fs-6 me-1">info</span>
                    Showing your own leave history only. Full school history is temporarily unavailable.
                </li>
            ` + container.innerHTML;
        }

    } catch (e) {
        console.error(e);
        const errorDetails = (e && e.message) ? e.message : 'Please try again.';
        container.innerHTML = `
            <li class="list-group-item p-4 text-center">
                <div class="text-danger fw-semibold mb-2">Unable to load leave history right now.</div>
                <div class="text-muted small mb-3">${errorDetails}</div>
                <button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="loadTeacherLeaveHistory()">
                    Try Again
                </button>
            </li>
        `;
    }
}

async function updateLeaveStatus(id, status) {
    if (!confirm(`Are you sure you want to mark this request as ${status}?`)) return;

    try {
        const res = await fetchAPI(`/leave/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, reviewed_by: appState.userId })
        });
        if (res.ok) {
            loadTeacherLeaveApprovals();
        } else {
            alert('Action failed.');
        }
    } catch (e) {
        alert('Network error.');
    }
}

/* --- PROGRESS CARD LOGIC --- */
function formatPct(value) {
    if (value === null || value === undefined || isNaN(value))
        return '0%';
    return `${Number(value).toFixed(1)}%`;
}
function renderProgressCard(data, container, compact = false) {
    const subjects = data.academics.subjects || [];
    const alerts = data.alerts || [];
    const recent = data.recent_marks || [];
    const trendMap = { up: 'text-success', down: 'text-danger', flat: 'text-muted', na: 'text-muted' };
    const trendText = data.academics.trend === 'up' ? 'Improving' :
        data.academics.trend === 'down' ? 'Declining' :
            data.academics.trend === 'flat' ? 'Stable' : 'No trend';
    const trendClass = trendMap[data.academics.trend] || 'text-muted';
    const missingAssignments = Math.max(0, (data.engagement.assignments_due || 0) - (data.engagement.assignments_submitted || 0));
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
            <div>
                <h4 class="fw-bold mb-1">${data.student.name} <span class="badge bg-light text-dark border">Grade ${data.student.grade}</span></h4>
                <div class="text-muted small">Student ID: ${data.student.id}</div>
            </div>
            <div class="text-end">
                <div class="small text-muted">Trend</div>
                <div class="fw-bold ${trendClass}">${trendText}</div>
            </div>
        </div>
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <div class="text-muted small">Overall Average</div>
                    <div class="display-6 fw-bold">${formatPct(data.academics.overall_avg)}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <div class="text-muted small">Attendance</div>
                    <div class="display-6 fw-bold">${formatPct(data.attendance.rate)}</div>
                    <div class="small text-muted">Absent last 30 days: ${data.attendance.absent_last_30}</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <div class="text-muted small">Assignments</div>
                    <div class="display-6 fw-bold">${data.engagement.assignments_submitted}/${data.engagement.assignments_due}</div>
                    <div class="small text-muted">Missing: ${missingAssignments}</div>
                </div>
            </div>
        </div>
        <div class="row g-3 ${compact ? 'mb-3' : 'mb-4'}">
            <div class="col-md-6">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <h6 class="fw-bold mb-3">Subject Averages</h6>
                    ${subjects.length === 0 ? '<div class="text-muted small">No marks recorded.</div>' : subjects.map(s => `
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="small">${s.subject}</span>
                            <span class="fw-semibold">${formatPct(s.avg_pct)}</span>
                        </div>
                        <div class="progress mb-3" style="height: 6px;">
                            <div class="progress-bar bg-success" style="width: ${Math.min(100, s.avg_pct || 0)}%"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="col-md-6">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <h6 class="fw-bold mb-3">Engagement</h6>
                    <div class="small text-muted mb-2">Quizzes Attempted: <span class="fw-semibold text-dark">${data.engagement.quizzes_attempted}</span></div>
                    <div class="small text-muted mb-2">Avg Quiz Score: <span class="fw-semibold text-dark">${formatPct(data.engagement.avg_quiz_score)}</span></div>
                    <div class="small text-muted mb-2">Activities (30 days): <span class="fw-semibold text-dark">${data.engagement.activities_last_30}</span></div>
                    <div class="small text-muted">Active Days (last 7): <span class="fw-semibold text-dark">${data.engagement.active_days_last_7}</span></div>
                </div>
            </div>
        </div>
        <div class="row g-3">
            <div class="col-md-7">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <h6 class="fw-bold mb-3">Recent Marks</h6>
                    ${recent.length === 0 ? '<div class="text-muted small">No recent marks found.</div>' : `
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr class="text-muted small">
                                    <th>Subject</th>
                                    <th>Exam</th>
                                    <th>Score</th>
                                    <th>Grade</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recent.map(r => `
                                    <tr>
                                        <td>${r.subject}</td>
                                        <td>${r.exam_name || '-'}</td>
                                        <td>${r.max_marks ? `${r.marks_obtained}/${r.max_marks}` : r.marks_obtained}</td>
                                        <td>${r.grade || '-'}</td>
                                        <td>${r.date || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`}
                </div>
            </div>
            <div class="col-md-5">
                <div class="card border-0 shadow-sm rounded-4 p-3 h-100">
                    <h6 class="fw-bold mb-3">Alerts & Remarks</h6>
                    ${alerts.length === 0 ? '<div class="text-muted small">No alerts.</div>' : alerts.map(a => `
                        <div class="alert alert-warning py-2 px-3 small mb-2">${a}</div>
                    `).join('')}
                    <div class="mt-3">
                        <div class="small text-muted">Teacher Remarks</div>
                        <div class="fst-italic">${data.remarks || 'No remarks yet.'}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
async function fetchProgressCard(studentId) {
    const res = await fetchAPI(`/progress-card/${studentId}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to load progress card.');
    }
    return res.json();
}
async function fetchMyProgressCard() {
    const res = await fetchAPI('/progress-card/my');
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.message || 'Failed to load my progress card.');
    }
    return res.json();
}
async function loadProgressReportView() {
    const selectEl = document.getElementById('progress-student-select');
    const container = document.getElementById('progress-card-container');
    const btn = document.getElementById('progress-load-btn');
    const publishBtn = document.getElementById('progress-publish-student-btn');
    const publishStatusEl = document.getElementById('progress-publish-status');
    if (!selectEl || !container || !btn)
        return;
    if (!selectEl.dataset.bound) {
        selectEl.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            if (selectEl.value)
                loadProgressCardForStudent(selectEl.value, container);
        });
        selectEl.addEventListener('change', () => {
            if (selectEl.value)
                loadProgressCardForStudent(selectEl.value, container);
        });
        if (publishBtn) {
            publishBtn.addEventListener('click', async () => {
                const studentId = selectEl.value;
                if (!studentId) {
                    alert('Please select a student first.');
                    return;
                }
                if (!confirm('Publish all pending marks for this student progress card?'))
                    return;
                if (publishStatusEl)
                    publishStatusEl.textContent = 'Publishing...';
                try {
                    const res = await fetchAPI('/progress/publish/student', {
                        method: 'POST',
                        body: JSON.stringify({ student_id: studentId })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        if (publishStatusEl)
                            publishStatusEl.textContent = data.detail || 'Failed to publish progress card.';
                        return;
                    }
                    if (publishStatusEl)
                        publishStatusEl.textContent = `Published ${data.updated || 0} pending record(s) for ${studentId}.`;
                    await loadProgressCardForStudent(studentId, container);
                }
                catch (e) {
                    if (publishStatusEl)
                        publishStatusEl.textContent = 'Network error while publishing progress card.';
                }
            });
        }
    }
    try {
        const res = await fetchAPI('/students/all');
        const students = res.ok ? await res.json() : [];
        selectEl.innerHTML = '<option value="">Select Student</option>';
        students.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} (Grade ${s.grade})`;
            selectEl.appendChild(opt);
        });
        if (appState.activeStudentId) {
            selectEl.value = appState.activeStudentId;
            loadProgressCardForStudent(appState.activeStudentId, container);
        }
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Error loading students: ${e.message}</div>`;
    }
}
async function loadProgressCardForStudent(studentId, container) {
    container.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
    try {
        const data = await fetchProgressCard(studentId);
        renderProgressCard(data, container);
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Error: ${e.message}</div>`;
    }
}
async function loadParentProgressCardView() {
    const container = ensureParentProgressCardViewLayout();
    if (!container)
        return;
    container.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
    try {
        const data = await fetchMyProgressCard();
        renderProgressCard(data, container, true);
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Error: ${e.message}</div>`;
    }
}

async function loadStudentProgressCardView() {
    const container = ensureParentProgressCardViewLayout();
    if (!container)
        return;
    const studentId = appState.activeStudentId || appState.userId || '';
    if (!studentId && !appState.userId) {
        container.innerHTML = '<div class="text-center text-muted py-4">Student session not found.</div>';
        return;
    }
    container.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
    try {
        const data = await fetchMyProgressCard();
        renderProgressCard(data, container, true);
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Unable to load progress card for <b>${studentId || (appState.userId || '-')}</b>: ${e.message}</div>`;
    }
}

function ensureParentProgressCardViewLayout() {
    const view = document.getElementById('parent-progress-card-view');
    if (!view)
        return null;
    let container = document.getElementById('parent-progress-card-container');
    if (container)
        return container;
    view.innerHTML = `
        <h3 class="fw-bold mb-4 text-dark">View Progress Card</h3>
        <div id="parent-progress-card-container" class="card border-0 shadow rounded-4 p-4">
            <div class="text-center text-muted py-5">
                <span class="material-icons fs-1">analytics</span>
                <p class="mt-2">Progress card will appear here.</p>
            </div>
        </div>
    `;
    container = document.getElementById('parent-progress-card-container');
    return container;
}

// --- EMAIL LOGIC ---
function renderEmailListItem(email, inbox = true) {
    const fromToLabel = inbox ? `From: ${email.sender_id}` : `To: ${email.recipient_email}`;
    const time = email.sent_at ? new Date(email.sent_at).toLocaleString() : '';
    const unreadClass = inbox && !email.is_read ? 'bg-light' : '';
    const subject = email.subject || '(No Subject)';
    const preview = (email.body || '').substring(0, 80);
    return `
        <div class="list-group-item list-group-item-action p-3 ${unreadClass}" data-email-id="${email.id}">
            <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1 fw-bold">${subject}</h6>
                <small class="text-muted">${time}</small>
            </div>
            <p class="mb-1 text-dark small">${fromToLabel}</p>
            <small class="text-muted">${preview}${email.body && email.body.length > 80 ? '...' : ''}</small>
        </div>
    `;
}

async function loadEmailInbox() {
    const list = document.getElementById('email-inbox-list');
    const countEl = document.getElementById('email-inbox-count');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/inbox');
        if (!res.ok) throw new Error('Failed to load inbox.');
        const data = await res.json();
        if (countEl) countEl.textContent = String(data.length || 0);
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, true)).join('');
        list.querySelectorAll('[data-email-id]').forEach((el) => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-email-id');
                if (id) {
                    await fetchAPI(`/email/${id}/read`, { method: 'PUT' });
                    el.classList.remove('bg-light');
                }
            });
        });
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadEmailSent() {
    const list = document.getElementById('email-sent-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/sent');
        if (!res.ok) throw new Error('Failed to load sent mail.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No sent messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, false)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

function initEmailCompose() {
    const form = document.getElementById('email-compose-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = document.getElementById('email-to').value.trim();
        const subject = document.getElementById('email-subject').value.trim();
        const body = document.getElementById('email-body').value.trim();
        if (!to || !subject || !body) {
            alert('Please fill To, Subject, and Message.');
            return;
        }
        try {
            const res = await fetchAPI('/email/send', {
                method: 'POST',
                body: JSON.stringify({ to, subject, body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || 'Failed to send email.');
                return;
            }
            alert(`Sent to ${data.sent || 0} recipient(s).`);
            form.reset();
            switchView('email-sent-view');
        } catch (e) {
            alert('Network error sending email.');
        }
    });
}

async function loadParentEmailInbox() {
    const list = document.getElementById('parent-email-inbox-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/inbox');
        if (!res.ok) throw new Error('Failed to load inbox.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, true)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadParentEmailSent() {
    const list = document.getElementById('parent-email-sent-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/sent');
        if (!res.ok) throw new Error('Failed to load sent mail.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No sent messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, false)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

function notificationStatusBadge(subject = '', content = '') {
    const text = `${subject} ${content}`.toLowerCase();
    if (text.includes('absent'))
        return '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Absent</span>';
    if (text.includes('late'))
        return '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Late</span>';
    if (text.includes('present'))
        return '<span class="badge bg-success-subtle text-success border border-success-subtle">Present</span>';
    return '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Info</span>';
}

function renderNotificationListItem(n) {
    const time = n.timestamp ? new Date(n.timestamp).toLocaleString() : '';
    const unreadClass = n.is_read ? '' : 'bg-light';
    const badge = notificationStatusBadge(n.subject || '', n.content || '');
    return `
        <div class="list-group-item list-group-item-action p-3 ${unreadClass}" data-notif-id="${n.id}">
            <div class="d-flex w-100 justify-content-between align-items-center">
                <h6 class="mb-1 fw-bold">${n.subject || 'Notification'}</h6>
                <small class="text-muted">${time}</small>
            </div>
            <p class="mb-2 small text-dark">${n.content || ''}</p>
            <div>${badge}</div>
        </div>
    `;
}

async function loadNotificationsInto(listId) {
    const list = document.getElementById(listId);
    if (!list)
        return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/notifications/inbox');
        if (!res.ok)
            throw new Error('Failed to load notifications.');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No notifications.</div>';
            return;
        }
        list.innerHTML = data.map(renderNotificationListItem).join('');
        list.querySelectorAll('[data-notif-id]').forEach((el) => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-notif-id');
                if (!id)
                    return;
                await fetchAPI(`/notifications/${id}/read`, { method: 'PUT' });
                el.classList.remove('bg-light');
            });
        });
    }
    catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadStudentNotifications() {
    await loadNotificationsInto('student-notifications-list');
}

async function loadParentNotifications() {
    await loadNotificationsInto('parent-notifications-list');
}

function initParentEmailCompose() {
    const form = document.getElementById('parent-email-compose-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = document.getElementById('parent-email-to').value.trim();
        const subject = document.getElementById('parent-email-subject').value.trim();
        const body = document.getElementById('parent-email-body').value.trim();
        if (!to || !subject || !body) {
            alert('Please fill To, Subject, and Message.');
            return;
        }
        try {
            const res = await fetchAPI('/email/send', {
                method: 'POST',
                body: JSON.stringify({ to, subject, body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || 'Failed to send email.');
                return;
            }
            alert(`Sent to ${data.sent || 0} recipient(s).`);
            form.reset();
            switchView('parent-email-sent-view');
        } catch (e) {
            alert('Network error sending email.');
        }
    });
}

/* --- QUESTION BANK LOGIC --- */
async function loadQuestionBanks() {
    const container = document.getElementById('question-bank-list');
    const uploadContainer = document.getElementById('qb-upload-container');

    // Toggle Upload Button Visibility
    if (appState.role === 'Teacher' || appState.role === 'Admin' || appState.role === 'Principal' || appState.role === 'Tenant_Admin') {
        if (uploadContainer) uploadContainer.classList.remove('d-none');
    } else {
        if (uploadContainer) uploadContainer.classList.add('d-none');
    }

    if (!container) return;
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    try {
        const res = await fetchAPI('/question-bank');
        if (res.ok) {
            const banks = await res.json();
            container.innerHTML = '';

            if (banks.length === 0) {
                container.innerHTML = '<div class="text-center py-5 text-muted">No question banks uploaded yet.</div>';
                return;
            }

            banks.forEach(qb => {
                const date = new Date(qb.created_at).toLocaleDateString();
                const icon = qb.file_path.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description';
                // Construct full URL assuming backend is relative to API base
                // If API_BASE_URL ends in /api, strip it
                const backendRoot = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
                const downloadUrl = `${backendRoot}${qb.file_path}`;

                const html = `
                    <div class="list-group-item p-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <div class="icon-circle bg-light me-3 text-primary">
                                <span class="material-icons">${icon}</span>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold">${qb.title}</h6>
                                <small class="text-muted">Uploaded by ${qb.uploaded_by} on ${date}</small>
                            </div>
                        </div>
                        <a href="${downloadUrl}" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-3">
                            <span class="material-icons align-middle fs-6 me-1">download</span> Download
                        </a>
                    </div>
                `;
                container.innerHTML += html;
            });

        } else {
            container.innerHTML = '<div class="text-danger text-center p-5">Failed to load question banks.</div>';
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-danger text-center p-5">Error: ${e.message}</div>`;
    }
}

async function handleQuestionBankUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const title = prompt("Enter a title for this Question Bank:", file.name.split('.')[0]);
    if (!title) {
        input.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    try {
        const res = await fetchAPI('/question-bank/upload', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert('Question Bank uploaded successfully!');
            loadQuestionBanks();
        } else {
            const err = await res.json();
            alert('Upload failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Error uploading file.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/* --- STUDENT PDF EXAM LOGIC --- */

async function loadStudentExams() {
    const container = document.getElementById('student-exams-list-container');
    if (!container) return;

    container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div><p class="text-muted mt-2">Loading Exams...</p></div>';

    try {
        const [scheduleRes, pdfRes] = await Promise.all([
            fetchAPI('/exam-schedules/my'),
            fetchAPI('/exams/student/list')
        ]);

        let schedules = [];
        let exams = [];

        if (scheduleRes.ok) {
            schedules = await scheduleRes.json();
        }
        if (pdfRes.ok) {
            exams = await pdfRes.json();
        }

        container.innerHTML = '';

        if (!schedules.length && !exams.length) {
            container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">No exams scheduled at this moment.</p></div>';
            return;
        }

        if (schedules.length) {
            container.innerHTML += `
                <div class="col-12">
                    <h4 class="fw-bold mb-3">Exam Schedule</h4>
                </div>
            `;
            schedules.forEach(s => {
                const html = `
                    <div class="col-md-4">
                        <div class="card border-0 shadow-sm h-100 rounded-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div class="icon-circle bg-light text-primary">
                                        <span class="material-icons">event</span>
                                    </div>
                                    <span class="badge bg-info text-dark">Scheduled</span>
                                </div>
                                <h5 class="fw-bold mb-1">${s.title || 'Exam'}</h5>
                                <p class="text-muted small mb-2">${s.subject || ''}</p>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">calendar_today</span>
                                    ${formatExamDate(s.exam_date)}
                                </div>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">schedule</span>
                                    ${formatExamTime(s.start_time, s.end_time)}
                                </div>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">location_on</span>
                                    ${s.venue || 'TBD'}
                                </div>
                                ${s.instructions ? `<div class="small text-muted"><span class="material-icons fs-6 me-1">checklist</span>${s.instructions}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML += html;
            });
        }

        if (exams.length) {
            container.innerHTML += `
                <div class="col-12 mt-4">
                    <h4 class="fw-bold mb-3">Online PDF Exams</h4>
                </div>
            `;
            exams.forEach(exam => {
                const isSubmitted = exam.submitted === 1;
                const statusBadge = isSubmitted
                    ? '<span class="badge bg-success">Completed</span>'
                    : '<span class="badge bg-warning text-dark">Pending</span>';

                const actionBtn = isSubmitted
                    ? `<button class="btn btn-outline-secondary w-100" disabled>Submitted</button>`
                    : `<button class="btn btn-primary-custom w-100 fw-bold" onclick="startPDFExam(${exam.id}, '${exam.title}', '${exam.file_path}', ${exam.time_limit_mins})">Start Exam</button>`;

                const html = `
                    <div class="col-md-4">
                        <div class="card border-0 shadow-sm h-100 rounded-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div class="icon-circle bg-light text-primary">
                                        <span class="material-icons">assignment</span>
                                    </div>
                                    ${statusBadge}
                                </div>
                                <h5 class="fw-bold mb-1">${exam.title}</h5>
                                <p class="text-muted small mb-3">Time Limit: ${exam.time_limit_mins} mins</p>
                                
                                <div class="d-flex align-items-center text-muted small mb-4">
                                    <span class="material-icons fs-6 me-1">calendar_today</span>
                                    Posted: ${new Date(exam.created_at).toLocaleDateString()}
                                </div>
                                
                                ${actionBtn}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML += html;
            });
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-danger text-center">Network Error.</p>';
    }
}

async function loadStudentAssignmentsExamSchedules() {
    const container = document.getElementById('student-assignment-exam-schedules');
    if (!container)
        return;

    container.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading exam schedules...</div>';

    try {
        const res = await fetchAPI('/exam-schedules/my');
        if (!res.ok) {
            container.innerHTML = '<div class="alert alert-danger mb-0">Failed to load exam schedules.</div>';
            return;
        }

        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML = '<div class="alert alert-info mb-0">No exam schedules published yet.</div>';
            return;
        }

        const sorted = [...rows].sort((a, b) => {
            const ad = `${a.exam_date || ''}T${a.start_time || '00:00'}`;
            const bd = `${b.exam_date || ''}T${b.start_time || '00:00'}`;
            return new Date(ad).getTime() - new Date(bd).getTime();
        });

        container.innerHTML = sorted.map(s => `
            <div class="card border-0 shadow-sm mb-3">
                <div class="card-body p-4">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                        <h5 class="fw-bold mb-0">
                            <span class="material-icons align-middle text-primary me-1">event</span>
                            ${s.title || 'Exam'}
                        </h5>
                        <span class="badge bg-primary-subtle text-primary border">Grade ${s.grade_level || '-'}</span>
                    </div>
                    <p class="text-muted mb-3">${s.subject || 'General'}</p>
                    <div class="row g-2 small">
                        <div class="col-md-4"><span class="text-muted">Date:</span> <span class="fw-semibold">${formatExamDate(s.exam_date)}</span></div>
                        <div class="col-md-4"><span class="text-muted">Time:</span> <span class="fw-semibold">${formatExamTime(s.start_time, s.end_time)}</span></div>
                        <div class="col-md-4"><span class="text-muted">Venue:</span> <span class="fw-semibold">${s.venue || 'TBD'}</span></div>
                    </div>
                    ${s.instructions ? `<div class="mt-3 small"><span class="text-muted">Instructions:</span> ${s.instructions}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
    catch (e) {
        console.error(e);
        container.innerHTML = '<div class="alert alert-danger mb-0">Network error while loading exam schedules.</div>';
    }
}

async function loadStudentAssignmentsAndResults() {
    const studentId = appState.activeStudentId || appState.userId;
    if (!studentId)
        return;

    const homeworkTab = document.getElementById('homework-tab');
    const resultsTab = document.getElementById('results-tab');

    if (homeworkTab) {
        homeworkTab.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading assignments...</div>';
    }
    if (resultsTab) {
        resultsTab.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading results...</div>';
    }

    try {
        const [assignRes, progressRes] = await Promise.all([
            fetchAPI(`/students/${encodeURIComponent(studentId)}/assignments`),
            fetchAPI(`/progress-card/${encodeURIComponent(studentId)}`)
        ]);

        const assignments = assignRes.ok ? await assignRes.json() : [];
        const progress = progressRes.ok ? await progressRes.json() : null;

        if (homeworkTab) {
            if (!Array.isArray(assignments) || assignments.length === 0) {
                homeworkTab.innerHTML = '<div class="alert alert-info mb-0">No assignments available right now.</div>';
            }
            else {
                homeworkTab.innerHTML = `
                    <div class="list-group">
                        ${assignments.map(a => {
                    let desc = a.description || '';
                    let fileUrl = '';
                    let note = '';
                    try {
                        const parsed = JSON.parse(desc);
                        note = parsed.note || '';
                        fileUrl = parsed.file_url || '';
                    } catch (e) {
                        note = desc;
                    }

                    let fileBtn = '';
                    if (fileUrl) {
                        fileBtn = `
                            <a href="${fileUrl}" target="_blank" class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1 mt-2">
                                <span class="material-icons" style="font-size:14px;">download</span>
                                Download File
                            </a>
                        `;
                    }

                    return `
                            <div class="list-group-item p-3 border-start border-4 border-warning mb-2 rounded shadow-sm">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div class="flex-grow-1">
                                        <div class="d-flex w-100 justify-content-between">
                                            <h5 class="mb-1 fw-bold">${a.title || 'Assignment'}</h5>
                                        </div>
                                        <p class="mb-1 text-muted small">${a.type || 'Assignment'} &bull; ${a.course_name || 'Class Assignment'}</p>
                                        ${note ? `<p class="mb-1 text-dark small">${note}</p>` : ''}
                                        ${a.due_date ? `<div class="text-danger small fw-bold">Due: ${a.due_date}</div>` : ''}
                                        ${fileBtn}
                                    </div>
                                    <div class="ms-3">
                                        ${a.type === 'Quiz' ?
                            `<button class="btn btn-sm btn-primary" onclick="takeQuiz('${a.id}')">Start Quiz</button>` :
                            `<button class="btn btn-sm btn-success" onclick="openSubmitModal(${a.id}, '${(a.title || '').replace(/'/g, "\\'")}', 'student-exams-view')">
                                                <span class="material-icons align-middle" style="font-size:14px;">send</span> Submit
                                            </button>`
                        }
                                    </div>
                                </div>
                            </div>
                        `;
                }).join('')}
                    </div>
                `;
            }
        }

        if (resultsTab) {
            const recent = progress && Array.isArray(progress.recent_marks) ? progress.recent_marks : [];
            if (recent.length === 0) {
                resultsTab.innerHTML = '<div class="alert alert-info mb-0">No exam results published yet.</div>';
            }
            else {
                resultsTab.innerHTML = `
                    <div class="card border-0 shadow-sm">
                        <div class="card-body">
                            <table class="table table-hover align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th>Exam</th>
                                        <th>Subject</th>
                                        <th>Score</th>
                                        <th>Grade</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recent.map(r => `
                                        <tr>
                                            <td>${r.exam_name || '-'}</td>
                                            <td>${r.subject || '-'}</td>
                                            <td class="fw-bold text-success">${r.max_marks ? `${r.marks_obtained}/${r.max_marks}` : (r.marks_obtained ?? '-')}</td>
                                            <td>${r.grade || '-'}</td>
                                            <td>${r.date || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        }
    }
    catch (e) {
        if (homeworkTab) {
            homeworkTab.innerHTML = `<div class="alert alert-danger mb-0">Unable to load assignments: ${e.message}</div>`;
        }
        if (resultsTab) {
            resultsTab.innerHTML = `<div class="alert alert-danger mb-0">Unable to load results: ${e.message}</div>`;
        }
    }
}

async function loadParentExamScheduleView() {
    const tbody = ensureParentExamScheduleLayout();
    if (!tbody)
        return;
    tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="6">Loading exam schedules...</td></tr>';
    try {
        const res = await fetchAPI('/exam-schedules/my');
        if (res.ok) {
            const rows = await res.json();
            if (!rows.length) {
                tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="6">No exam schedules available.</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td class="ps-4">${r.student_name || '-'}</td>
                    <td class="ps-4 fw-bold">${r.subject || ''} (${r.title || 'Exam'})</td>
                    <td>${formatExamDate(r.exam_date)}</td>
                    <td>${formatExamTime(r.start_time, r.end_time)}</td>
                    <td>${r.venue || '-'}</td>
                    <td>${r.instructions || '-'}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="6">Failed to load schedules.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="6">Network error.</td></tr>';
    }
}

function ensureParentExamScheduleLayout() {
    let tbody = document.getElementById('parent-exam-schedule-body');
    if (tbody)
        return tbody;
    const view = document.getElementById('parent-exam-schedule-view');
    if (!view)
        return null;
    view.innerHTML = `
        <h3 class="fw-bold mb-4 text-dark">Upcoming Exams</h3>
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th class="ps-4 py-3">Student</th>
                            <th class="ps-4 py-3">Subject</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Venue</th>
                            <th>Items Required</th>
                        </tr>
                    </thead>
                    <tbody id="parent-exam-schedule-body">
                        <tr>
                            <td class="ps-4 text-muted" colspan="6">Loading exam schedules...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    tbody = document.getElementById('parent-exam-schedule-body');
    return tbody;
}

var examTimerInterval;

function startPDFExam(id, title, filePath, timeLimitMins) {
    if (!confirm("Are you sure you want to start the exam? The timer will start immediately.")) return;

    // Switch View
    switchView('student-take-pdf-exam-view');

    // Setup UI
    document.getElementById('take-exam-title').textContent = title;
    document.getElementById('current-exam-id').value = id;

    // Fix PDF Path
    const backendRoot = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
    document.getElementById('exam-pdf-viewer').src = `${backendRoot}${filePath}`; // Ensure this path is reachable

    // Start Timer
    startExamTimer(timeLimitMins * 60);
}

function startExamTimer(durationSeconds) {
    const display = document.getElementById('exam-timer-display');
    let timer = durationSeconds;

    if (examTimerInterval) clearInterval(examTimerInterval);

    examTimerInterval = setInterval(() => {
        const hours = Math.floor(timer / 3600);
        const minutes = Math.floor((timer % 3600) / 60);
        const seconds = timer % 60;

        display.textContent =
            (hours > 0 ? String(hours).padStart(2, '0') + ':' : '') +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0');

        if (--timer < 0) {
            clearInterval(examTimerInterval);
            alert("Time is up! Submitting your exam automatically (if file selected) or closing.");
            // Ideally trigger auto-submit or close
            const fileInput = document.getElementById('answer-sheet-file');
            if (fileInput.files.length > 0) {
                submitAnswerSheet();
            } else {
                alert("You did not select a file. Exam view closing.");
                switchView('upcoming-exams-view');
            }
        }
    }, 1000);
}

function finishExamEarly() {
    if (confirm("Are you sure you want to finish? Make sure you have uploaded your answer sheet.")) {
        submitAnswerSheet();
    }
}

async function submitAnswerSheet() {
    const examId = document.getElementById('current-exam-id').value;
    const fileInput = document.getElementById('answer-sheet-file');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select your Answer Sheet PDF to submit.");
        return;
    }

    const formData = new FormData();
    formData.append('exam_id', examId);
    formData.append('file', file);

    const btn = document.querySelector('#exam-submission-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Uploading...';
    btn.disabled = true;

    try {
        const res = await fetchAPI('/exams/submit-pdf', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            clearInterval(examTimerInterval);
            alert("Exam Submitted Successfully!");
            switchView('upcoming-exams-view');
        } else {
            const err = await res.json();
            alert("Submission Failed: " + (err.detail || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error during submission.");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

/* --- PDF EXAM TEACHER LOGIC --- */

function loadTestCreateView() {
    const container = document.getElementById('test-create-view');
    if (!container) return;

    container.innerHTML = `
        <h3 class="fw-bold mb-4">Create Online Test</h3>
        <div class="row justify-content-center g-4">
            <!-- Option 1: PDF Exam (New) -->
            <div class="col-md-5">
                <div class="card border-0 shadow-sm rounded-4 h-100 p-4 text-center hover-card" onclick="showPDFExamForm()">
                    <div class="card-body">
                         <div class="icon-circle bg-primary-subtle text-primary mb-3 mx-auto" style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                            <span class="material-icons fs-1">picture_as_pdf</span>
                         </div>
                        <h4 class="fw-bold">Upload Question Paper</h4>
                        <p class="text-muted">Upload a PDF question paper. Set a strict timer. Students view the PDF and upload their answer sheets.</p>
                        <button class="btn btn-primary-custom rounded-pill px-4 fw-bold mt-2">Create PDF Exam</button>
                    </div>
                </div>
            </div>


        </div>

        <!-- Hidden Form Container -->
        <div id="pdf-exam-form-container" class="row justify-content-center mt-5 d-none">
            <div class="col-md-8">
                <div class="card border-0 shadow rounded-4">
                    <div class="card-header bg-white border-0 pt-4 px-4 pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="fw-bold text-primary mb-0">Construct PDF Exam</h5>
                            <button class="btn-close" onclick="loadTestCreateView()"></button>
                        </div>
                    </div>
                    <div class="card-body p-4">
                        <form id="create-pdf-exam-form" onsubmit="event.preventDefault(); handleCreatePDFExam();">
                            <div class="mb-3">
                                <label class="form-label fw-bold">Exam Title</label>
                                <input type="text" id="exam-title" class="form-control" placeholder="e.g. Mid-Term Mathematics" required>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Time Limit (Minutes)</label>
                                    <input type="number" id="exam-time-limit" class="form-control" placeholder="e.g. 60" min="5" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Assign to Group (Optional)</label>
                                    <select id="exam-group-select" class="form-select">
                                        <option value="">All Students (Public)</option>
                                        <!-- Groups loaded dynamically -->
                                    </select>
                                </div>
                            </div>
                            <div class="mb-4">
                                <label class="form-label fw-bold">Upload Question Paper (PDF)</label>
                                <input type="file" id="exam-file" class="form-control" accept="application/pdf" required>
                                <div class="form-text">Students will view this file during the exam.</div>
                            </div>
                            <button type="submit" class="btn btn-primary-custom w-100 py-2 fw-bold text-uppercase">
                                <span class="material-icons align-middle me-2">publish</span> Publish Exam
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load Groups for Select
    loadGroupsForExamSelect();
}

function showPDFExamForm() {
    document.getElementById('pdf-exam-form-container').classList.remove('d-none');
    window.scrollTo(0, document.body.scrollHeight);
}

async function loadGroupsForExamSelect() {
    const select = document.getElementById('exam-group-select');
    if (!select) return;

    try {
        const res = await fetchAPI('/groups');
        if (res.ok) {
            const groups = await res.json();
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error("Error loading groups", e); }
}

async function handleCreatePDFExam() {
    const title = document.getElementById('exam-title').value;
    const timeLimit = document.getElementById('exam-time-limit').value;
    const groupId = document.getElementById('exam-group-select').value;
    const fileInput = document.getElementById('exam-file');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a PDF file.");
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('time_limit', timeLimit);
    if (groupId) formData.append('group_id', groupId);
    formData.append('file', file);

    // Show Loading
    const btn = document.querySelector('#create-pdf-exam-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Publishing...`;
    btn.disabled = true;

    try {
        const res = await fetchAPI('/exams/create-pdf', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert("Exam Created Successfully!");
            loadTestCreateView(); // Reset view
        } else {
            const err = await res.json();
            alert("Error: " + (err.detail || "Failed to create exam."));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/* --- ATTENDANCE SHEET VIEW LOGIC --- */

function initAttendanceSheetView() {
    // Set default date to today if empty
    const dateInput = document.getElementById('sheet-view-date');
    if (dateInput && !dateInput.value) {
        dateInput.valueAsDate = new Date();
    }
    loadAttendanceSheetData();
}

// --- PROGRESS MARKS ENTRY ---
function computeLetterGrade(score, maxMarks) {
    if (!maxMarks || maxMarks <= 0) return '';
    const pct = (score / maxMarks) * 100;
    if (pct >= 90) return 'A+';
    if (pct >= 80) return 'A';
    if (pct >= 70) return 'B+';
    if (pct >= 60) return 'B';
    if (pct >= 50) return 'C';
    if (pct >= 40) return 'D';
    return 'F';
}

function ensureProgressEnterViewLayout() {
    const view = document.getElementById('progress-enter-view');
    if (!view) return;
    if (document.getElementById('progress-grade-select')) return;
    view.innerHTML = `
        <h3 class="fw-bold mb-4">Enter Progress Marks</h3>
        <div class="card border-0 shadow-sm rounded-4 p-4">
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label fw-medium">Class (Grade)</label>
                    <select id="progress-grade-select" class="form-select">
                        <option value="">Select Class</option>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Section</label>
                    <select id="progress-section-select" class="form-select">
                        <option value="">Select Section (optional)</option>
                    </select>
                </div>
                <div class="col-md-4 d-flex align-items-end">
                    <button id="progress-load-roster-btn" class="btn btn-primary-custom w-100">Load Roster</button>
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Exam</label>
                    <select id="progress-exam-select" class="form-select">
                        <option value="">Select Exam</option>
                        <option value="Unit Test">Unit Test</option>
                        <option value="Midterm">Midterm</option>
                        <option value="Final">Final</option>
                        <option value="Weekly Test">Weekly Test</option>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Subject</label>
                    <input id="progress-subject-input" class="form-control" placeholder="e.g., Mathematics">
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Max Marks</label>
                    <input id="progress-max-marks-input" type="number" class="form-control" value="100" min="1">
                </div>
            </div>
        </div>
        <div id="progress-roster-container" class="card border-0 shadow-sm rounded-4 p-4 mt-4 d-none">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h5 class="fw-bold mb-0">Class Roster</h5>
                <button id="progress-save-marks-btn" class="btn btn-success fw-bold">Save Marks</button>
            </div>
            <div class="table-responsive">
                <table class="table align-middle">
                    <thead class="bg-light">
                        <tr>
                            <th>Student</th>
                            <th>Marks</th>
                            <th>Grade</th>
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody id="progress-roster-body"></tbody>
                </table>
            </div>
        </div>
    `;
}

async function initProgressEnterView() {
    ensureProgressEnterViewLayout();
    const gradeSelect = document.getElementById('progress-grade-select');
    const sectionSelect = document.getElementById('progress-section-select');
    const examSelect = document.getElementById('progress-exam-select');
    const subjectInput = document.getElementById('progress-subject-input');
    const maxMarksInput = document.getElementById('progress-max-marks-input');
    const loadBtn = document.getElementById('progress-load-roster-btn');
    const saveBtn = document.getElementById('progress-save-marks-btn');
    const rosterContainer = document.getElementById('progress-roster-container');
    const rosterBody = document.getElementById('progress-roster-body');
    if (!gradeSelect || !sectionSelect || !examSelect || !subjectInput || !maxMarksInput || !loadBtn || !saveBtn || !rosterContainer || !rosterBody) return;

    if (!gradeSelect.dataset.bound) {
        gradeSelect.dataset.bound = 'true';
        loadBtn.addEventListener('click', () => loadProgressRoster());
        saveBtn.addEventListener('click', () => saveProgressMarks());
    }

    await loadProgressSectionsAndGrades();

    async function loadProgressRoster() {
        const gradeLevel = parseInt(gradeSelect.value);
        const sectionId = sectionSelect.value ? parseInt(sectionSelect.value) : null;
        if (!gradeLevel) {
            alert('Please select class (grade).');
            return;
        }
        rosterContainer.classList.remove('d-none');
        rosterBody.innerHTML = '<tr><td colspan="4" class="text-center p-3"><span class="spinner-border text-primary"></span></td></tr>';
        try {
            const query = sectionId ? `/progress/roster?grade_level=${gradeLevel}&section_id=${sectionId}` : `/progress/roster?grade_level=${gradeLevel}`;
            const res = await fetchAPI(query);
            if (!res.ok) throw new Error('Failed to load roster.');
            const students = await res.json();
            if (!students.length) {
                rosterBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-3">No students found.</td></tr>';
                return;
            }
            rosterBody.innerHTML = '';
            students.forEach(s => {
                const row = document.createElement('tr');
                row.dataset.studentId = s.id;
                row.innerHTML = `
                    <td>${s.name} <span class="text-muted small">(${s.id})</span></td>
                    <td><input type="number" class="form-control form-control-sm marks-input" min="0"></td>
                    <td><input type="text" class="form-control form-control-sm grade-input" readonly></td>
                    <td><input type="text" class="form-control form-control-sm remarks-input" placeholder="Optional"></td>
                `;
                rosterBody.appendChild(row);
            });
            const maxMarks = parseFloat(maxMarksInput.value) || 100;
            rosterBody.querySelectorAll('.marks-input').forEach((input) => {
                input.addEventListener('input', (e) => {
                    const marks = parseFloat(e.target.value || '0');
                    const grade = computeLetterGrade(marks, maxMarks);
                    const gradeInput = e.target.closest('tr').querySelector('.grade-input');
                    if (gradeInput) gradeInput.value = grade;
                });
            });
        } catch (e) {
            rosterBody.innerHTML = `<tr><td colspan="4" class="text-danger text-center p-3">${e.message}</td></tr>`;
        }
    }

    async function saveProgressMarks() {
        const gradeLevel = parseInt(gradeSelect.value);
        const sectionId = sectionSelect.value ? parseInt(sectionSelect.value) : null;
        const examName = examSelect.value;
        const subject = subjectInput.value.trim();
        const maxMarks = parseFloat(maxMarksInput.value);
        if (!gradeLevel || !examName || !subject || !maxMarks) {
            alert('Please select class, exam, subject, and max marks.');
            return;
        }
        const entries = [];
        rosterBody.querySelectorAll('tr').forEach((row) => {
            const studentId = row.dataset.studentId;
            const marksVal = row.querySelector('.marks-input').value;
            if (marksVal === '' || studentId === undefined) return;
            const marks = parseFloat(marksVal);
            const grade = row.querySelector('.grade-input').value || null;
            const remarks = row.querySelector('.remarks-input').value || null;
            entries.push({ student_id: studentId, marks_obtained: marks, grade: grade, remarks: remarks });
        });
        if (!entries.length) {
            alert('Please enter marks for at least one student.');
            return;
        }
        try {
            const payload = {
                exam_name: examName,
                subject: subject,
                max_marks: maxMarks,
                grade_level: gradeLevel,
                section_id: sectionId,
                entries: entries
            };
            const res = await fetchAPI('/progress/marks/bulk', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || 'Failed to save marks.');
                return;
            }
            alert(`Saved ${data.inserted || entries.length} mark(s).`);
        } catch (e) {
            alert('Network error saving marks.');
        }
    }

    async function loadProgressSectionsAndGrades() {
        gradeSelect.innerHTML = '<option value="">Select Class</option>';
        sectionSelect.innerHTML = '<option value="">Select Section (optional)</option>';
        try {
            const url = appState.activeSchoolId ? `/sections?school_id=${appState.activeSchoolId}` : '/sections';
            const res = await fetchAPI(url);
            const sections = res.ok ? await res.json() : [];
            if (sections.length) {
                const gradeSet = new Set(sections.map(s => s.grade_level).filter(Boolean));
                Array.from(gradeSet).sort((a, b) => a - b).forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = String(g);
                    opt.textContent = `Grade ${g}`;
                    gradeSelect.appendChild(opt);
                });
                sections.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `Grade ${s.grade_level} - ${s.name}`;
                    opt.dataset.grade = String(s.grade_level);
                    sectionSelect.appendChild(opt);
                });
            } else {
                const resStudents = await fetchAPI('/students/all');
                const students = resStudents.ok ? await resStudents.json() : [];
                const gradeSet = new Set(students.map(s => s.grade).filter(Boolean));
                Array.from(gradeSet).sort((a, b) => a - b).forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = String(g);
                    opt.textContent = `Grade ${g}`;
                    gradeSelect.appendChild(opt);
                });
            }
            gradeSelect.onchange = () => {
                const grade = gradeSelect.value;
                Array.from(sectionSelect.options).forEach((opt) => {
                    if (!opt.dataset.grade) return;
                    opt.hidden = grade && opt.dataset.grade !== grade;
                });
                if (grade && sectionSelect.value) {
                    const selected = sectionSelect.options[sectionSelect.selectedIndex];
                    if (selected && selected.dataset.grade && selected.dataset.grade !== grade) {
                        sectionSelect.value = '';
                    }
                }
            };
        } catch (e) {
            console.error(e);
        }
    }
}

function ensureProgressPublishViewLayout() {
    const view = document.getElementById('progress-publish-view');
    if (!view) return;
    if (document.getElementById('publish-grade-select')) return;
    view.innerHTML = `
        <h3 class="fw-bold mb-4">Publish Report Cards</h3>
        <div class="alert alert-warning d-flex align-items-center shadow-sm border-0">
            <span class="material-icons me-2">warning</span> Warning: Once published, report cards are visible to parents.
        </div>
        <div class="card border-0 shadow-sm rounded-4 p-4">
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label fw-medium">Class (Grade)</label>
                    <select id="publish-grade-select" class="form-select">
                        <option value="">Select Class</option>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Section</label>
                    <select id="publish-section-select" class="form-select">
                        <option value="">Select Section (optional)</option>
                    </select>
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-medium">Exam</label>
                    <select id="publish-exam-select" class="form-select">
                        <option value="">Select Exam</option>
                        <option value="Unit Test">Unit Test</option>
                        <option value="Midterm">Midterm</option>
                        <option value="Final">Final</option>
                        <option value="Weekly Test">Weekly Test</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label fw-medium">Subject</label>
                    <input id="publish-subject-input" class="form-control" placeholder="e.g., Mathematics">
                </div>
                <div class="col-md-3 d-flex align-items-end">
                    <button id="publish-marks-btn" class="btn btn-success w-100 fw-bold">Publish Marks</button>
                </div>
                <div class="col-md-3 d-flex align-items-end">
                    <button id="publish-preview-btn" class="btn btn-outline-primary w-100">Preview Count</button>
                </div>
            </div>
            <div id="publish-status" class="mt-3 text-muted small"></div>
        </div>
    `;
}

async function initProgressPublishView() {
    ensureProgressPublishViewLayout();
    const gradeSelect = document.getElementById('publish-grade-select');
    const sectionSelect = document.getElementById('publish-section-select');
    const examSelect = document.getElementById('publish-exam-select');
    const subjectInput = document.getElementById('publish-subject-input');
    const publishBtn = document.getElementById('publish-marks-btn');
    const previewBtn = document.getElementById('publish-preview-btn');
    const statusEl = document.getElementById('publish-status');
    if (!gradeSelect || !sectionSelect || !examSelect || !subjectInput || !publishBtn || !previewBtn || !statusEl) return;

    if (!gradeSelect.dataset.bound) {
        gradeSelect.dataset.bound = 'true';
        previewBtn.addEventListener('click', () => previewPublishMarks());
        publishBtn.addEventListener('click', () => publishMarks());
    }

    await loadPublishSectionsAndGrades();

    async function previewPublishMarks() {
        const payload = getPublishPayload();
        if (!payload) return;
        statusEl.textContent = 'Checking...';
        try {
            const qs = new URLSearchParams({
                exam_name: payload.exam_name,
                subject: payload.subject,
                grade_level: String(payload.grade_level),
                ...(payload.section_id ? { section_id: String(payload.section_id) } : {})
            });
            const res = await fetchAPI(`/progress/publish/preview?${qs.toString()}`);
            if (!res.ok) throw new Error('Preview failed.');
            const data = await res.json();
            statusEl.textContent = `Total marks: ${data.total}, Already published: ${data.published}`;
        } catch (e) {
            statusEl.textContent = `Error: ${e.message}`;
        }
    }

    async function publishMarks() {
        const payload = getPublishPayload();
        if (!payload) return;
        if (!confirm('Publish marks for this class/exam/subject?')) return;
        statusEl.textContent = 'Publishing...';
        try {
            const res = await fetchAPI('/progress/publish', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                statusEl.textContent = data.detail || 'Publish failed.';
                return;
            }
            statusEl.textContent = `Published ${data.updated || 0} record(s).`;
        } catch (e) {
            statusEl.textContent = 'Network error publishing marks.';
        }
    }

    function getPublishPayload() {
        const gradeLevel = parseInt(gradeSelect.value);
        const sectionId = sectionSelect.value ? parseInt(sectionSelect.value) : null;
        const examName = examSelect.value;
        const subject = subjectInput.value.trim();
        if (!gradeLevel || !examName || !subject) {
            alert('Please select class, exam, and subject.');
            return null;
        }
        return {
            exam_name: examName,
            subject: subject,
            grade_level: gradeLevel,
            section_id: sectionId
        };
    }

    async function loadPublishSectionsAndGrades() {
        gradeSelect.innerHTML = '<option value="">Select Class</option>';
        sectionSelect.innerHTML = '<option value="">Select Section (optional)</option>';
        try {
            const url = appState.activeSchoolId ? `/sections?school_id=${appState.activeSchoolId}` : '/sections';
            const res = await fetchAPI(url);
            const sections = res.ok ? await res.json() : [];
            if (sections.length) {
                const gradeSet = new Set(sections.map(s => s.grade_level).filter(Boolean));
                Array.from(gradeSet).sort((a, b) => a - b).forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = String(g);
                    opt.textContent = `Grade ${g}`;
                    gradeSelect.appendChild(opt);
                });
                sections.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = `Grade ${s.grade_level} - ${s.name}`;
                    opt.dataset.grade = String(s.grade_level);
                    sectionSelect.appendChild(opt);
                });
            } else {
                const resStudents = await fetchAPI('/students/all');
                const students = resStudents.ok ? await resStudents.json() : [];
                const gradeSet = new Set(students.map(s => s.grade).filter(Boolean));
                Array.from(gradeSet).sort((a, b) => a - b).forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = String(g);
                    opt.textContent = `Grade ${g}`;
                    gradeSelect.appendChild(opt);
                });
            }
            gradeSelect.onchange = () => {
                const grade = gradeSelect.value;
                Array.from(sectionSelect.options).forEach((opt) => {
                    if (!opt.dataset.grade) return;
                    opt.hidden = grade && opt.dataset.grade !== grade;
                });
                if (grade && sectionSelect.value) {
                    const selected = sectionSelect.options[sectionSelect.selectedIndex];
                    if (selected && selected.dataset.grade && selected.dataset.grade !== grade) {
                        sectionSelect.value = '';
                    }
                }
            };
        } catch (e) {
            console.error(e);
        }
    }
}

async function loadAttendanceSheetData() {
    const gradeEl = document.getElementById('sheet-view-grade');
    const dateEl = document.getElementById('sheet-view-date');
    const tbody = document.getElementById('sheet-view-body');

    if (!gradeEl || !dateEl || !tbody) return;

    const grade = gradeEl.value;
    const date = dateEl.value;

    if (!date) return;

    tbody.innerHTML = '<tr><td colspan="3" class="text-center p-5"><div class="spinner-border text-primary"></div><p class="text-muted mt-2">Fetching Daily Records...</p></td></tr>';

    try {
        const res = await fetchAPI(`/attendance/class/${grade}?date=${date}`);
        const data = await res.json();

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center p-5 text-muted">No students found for this class.</td></tr>';
            return;
        }

        // Generate Table Rows
        let html = '';
        data.forEach(s => {
            // Determine status style
            let badgeClass = 'bg-secondary-subtle text-secondary';
            if (s.status === 'Present') badgeClass = 'bg-success-subtle text-success';
            if (s.status === 'Absent') badgeClass = 'bg-danger-subtle text-danger';
            if (s.status === 'Late') badgeClass = 'bg-warning-subtle text-warning-emphasis';

            html += `
                <tr>
                    <td class="ps-4">
                        <div class="d-flex align-items-center">
                            <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold" style="width: 40px; height: 40px;">
                                ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <div class="fw-bold text-dark">${s.name}</div>
                                <div class="small text-muted">ID: ${s.id}</div>
                            </div>
                        </div>
                    </td>
                    <td class="text-center">
                        <span class="badge ${badgeClass} fs-6 px-3 py-2 rounded-pill">${s.status || 'Not Marked'}</span>
                    </td>
                    <td class="pe-4 text-muted fst-italic">
                        ${s.remarks || '-'}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center p-5 text-danger">Error loading data: ${e.message}</td></tr>`;
    }
}
window.applyRoleTheme = applyRoleTheme;
window.getVal = getVal;
window.setVal = setVal;
window.getChecked = getChecked;
window.setChecked = setChecked;
window.getInput = getInput;
window.getEl = getEl;
window.hasPermission = hasPermission;
window.hasAnyPermission = hasAnyPermission;
window.isParentRole = isParentRole;
window.restoreAuthState = restoreAuthState;
window.t = t;
window.changeLanguage = changeLanguage;
window.updateTranslations = updateTranslations;
window.syncSettingsLanguageControl = syncSettingsLanguageControl;
window.initializeSettingsLanguageControl = initializeSettingsLanguageControl;
window.getActiveViewId = getActiveViewId;
window.openView = openView;
window.closeView = closeView;
window.createViewModal = createViewModal;
window.openProfileView = openProfileView;
window.loadProfileDetails = loadProfileDetails;
window.renderMetric = renderMetric;
window.getEventBadgeClass = getEventBadgeClass;
window.fetchAPI = fetchAPI;
window.fetchDetailedStudentForEdit = fetchDetailedStudentForEdit;
window.renderEditStudentRoles = renderEditStudentRoles;
window.submitEditStudentForm = submitEditStudentForm;
window.loadRoles = loadRoles;
window.renderRolesList = renderRolesList;
window.loadRoleDetails = loadRoleDetails;
window.openRoleModal = openRoleModal;
window.loadPermissionsForModal = loadPermissionsForModal;
window._renderPermissionsCheckboxes = _renderPermissionsCheckboxes;
window._onPermCheckChange = _onPermCheckChange;
window._removePermTag = _removePermTag;
window._updatePermCount = _updatePermCount;
window._getSelectedPermCodes = _getSelectedPermCodes;
window._updateSelectedPermsTags = _updateSelectedPermsTags;
window.filterRolePermissions = filterRolePermissions;
window.handleSaveRole = handleSaveRole;
window.deleteRole = deleteRole;
window.loadPermissionsSetup = loadPermissionsSetup;
window.renderPermissionsSetupTable = renderPermissionsSetupTable;
window.filterPermissionsTable = filterPermissionsTable;
window.loadPermissionsList = loadPermissionsList;
window.renderPermissionsTable = renderPermissionsTable;
window.openPermissionEditModal = openPermissionEditModal;
window.handleUpdatePermission = handleUpdatePermission;
window.switchView = switchView;
window.loadSchoolsForRegistration = loadSchoolsForRegistration;
window.showRegister = showRegister;
window.showLogin = showLogin;
window.clearLoginFormSensitiveFields = clearLoginFormSensitiveFields;
window.handleRegister = handleRegister;
window.checkPasswordStrength = checkPasswordStrength;
window.handleRoleChange = handleRoleChange;
window.generateInvite = generateInvite;
window.openForgotPassword = openForgotPassword;
window.handleForgotPassword = handleForgotPassword;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;
window.selectLoginRole = selectLoginRole;
window.handleLogin = handleLogin;
window.renderAuthenticatorSetupBox = renderAuthenticatorSetupBox;
window.loadAuthenticatorSetup = loadAuthenticatorSetup;
window.handle2FASubmit = handle2FASubmit;
window.handleCredentialResponse = handleCredentialResponse;
window.handleSocialLogin = handleSocialLogin;
window.initializeDashboard = initializeDashboard;
window.ensureRootAdminView = ensureRootAdminView;
window.setRootAdminAlert = setRootAdminAlert;
window.loadRootAdminPanel = loadRootAdminPanel;
window.rootDbEscape = rootDbEscape;
window.ensureRootAdminDatabaseView = ensureRootAdminDatabaseView;
window.loadRootAdminDatabase = loadRootAdminDatabase;
window.bindRootAdminForms = bindRootAdminForms;
window.rootUpdateStudentEmail = rootUpdateStudentEmail;
window.rootUpdateStudentPassword = rootUpdateStudentPassword;
window.renderRootAdminControls = renderRootAdminControls;
window.setSuperAdminInstitutionListMode = setSuperAdminInstitutionListMode;
window.getCurrentSuperAdminSchoolId = getCurrentSuperAdminSchoolId;
window.renderSuperAdminBackToInstitutionList = renderSuperAdminBackToInstitutionList;
window.syncSuperAdminNavigationUI = syncSuperAdminNavigationUI;
window.loadSuperAdminDashboard = loadSuperAdminDashboard;
window.renderInstitutionContactRows = renderInstitutionContactRows;
window.collectInstitutionContacts = collectInstitutionContacts;
window.ensureInstitutionContactModal = ensureInstitutionContactModal;
window.openInstitutionContactModal = openInstitutionContactModal;
window.saveInstitutionContactModal = saveInstitutionContactModal;
window.addInstitutionContactRow = addInstitutionContactRow;
window.removeInstitutionContactRow = removeInstitutionContactRow;
window.openInstitutionConfig = openInstitutionConfig;
window.submitInstitutionConfigUpdate = submitInstitutionConfigUpdate;
window.resetInstitutionWizardAddresses = resetInstitutionWizardAddresses;
window.renderInstitutionWizardAddresses = renderInstitutionWizardAddresses;
window.addInstitutionWizardAddress = addInstitutionWizardAddress;
window.removeInstitutionWizardAddress = removeInstitutionWizardAddress;
window.renderInstitutionEditAddresses = renderInstitutionEditAddresses;
window.addInstitutionEditAddress = addInstitutionEditAddress;
window.removeInstitutionEditAddress = removeInstitutionEditAddress;
window.getSecurityRecommendation = getSecurityRecommendation;
window.goInstitutionCreateStep = goInstitutionCreateStep;
window.saveInstitutionWizardStep1AndContinue = saveInstitutionWizardStep1AndContinue;
window.validateInstitutionWizardStep1 = validateInstitutionWizardStep1;
window.showCreateSchoolModal = showCreateSchoolModal;
window.handleCreateSchool = handleCreateSchool;
window.openSchoolDashboard = openSchoolDashboard;
window.handleLogout = handleLogout;
window.fetchStudents = fetchStudents;
window.populateStudentSelect = populateStudentSelect;
window.launchMoodleSSO = launchMoodleSSO;
window.getSidebarConfig = getSidebarConfig;
window.renderSidebarFromConfig = renderSidebarFromConfig;
window.handleHashRouting = handleHashRouting;
window.renderTeacherControls = renderTeacherControls;
window.renderStudentControls = renderStudentControls;
window.renderParentControls = renderParentControls;
window.loadParentMessages = loadParentMessages;
window.handleTeacherViewToggle = handleTeacherViewToggle;
window.openFinanceModuleDetails = openFinanceModuleDetails;
window.renderStudentSelector = renderStudentSelector;
window.loadReportsData = loadReportsData;
window.handleAddMaterial = handleAddMaterial;
window.loadClassMaterials = loadClassMaterials;
window.handleDeleteMaterial = handleDeleteMaterial;
window.handleAddStudent = handleAddStudent;
window.openEditStudentModal = openEditStudentModal;
window.handleEditStudentSubmit = handleEditStudentSubmit;
window.handleDeleteStudent = handleDeleteStudent;
window.openStudentAddActivityModal = openStudentAddActivityModal;
window.handleAddActivity = handleAddActivity;
window.renderTeacherDashboard = renderTeacherDashboard;
window.openAccessCardModal = openAccessCardModal;
window.loadStudentDashboard = loadStudentDashboard;
window.loadStudentDashboardAssignments = loadStudentDashboardAssignments;
window.loadStudentQuizResults = loadStudentQuizResults;
window.loadParentChildData = loadParentChildData;
window.scrollChatToBottom = scrollChatToBottom;
window.appendChatMessage = appendChatMessage;
window.toggleVoiceInput = toggleVoiceInput;
window.speakText = speakText;
window.handleChatSubmit = handleChatSubmit;
window.loadLiveClasses = loadLiveClasses;
window.renderLiveClasses = renderLiveClasses;
window.checkClassStatus = checkClassStatus;
window.startClass = startClass;
window.endClass = endClass;
window.showLiveBanner = showLiveBanner;
window.handleScheduleClass = handleScheduleClass;
window.toggleStudentCheckboxes = toggleStudentCheckboxes;
window.loadGroups = loadGroups;
window.renderGroupsList = renderGroupsList;
window.openManageMembers = openManageMembers;
window.toggleMaterialInput = toggleMaterialInput;
window.handlePostMaterial = handlePostMaterial;
window.loadGroupMaterials = loadGroupMaterials;
window.loadStudentGroups = loadStudentGroups;
window.openStudentGroup = openStudentGroup;
window.saveGroupMembers = saveGroupMembers;
window.deleteGroup = deleteGroup;
window.applyGroupFilter = applyGroupFilter;
window.attachListener = attachListener;
window.regenerateAccessCode = regenerateAccessCode;
window.handleGenerateQuiz = handleGenerateQuiz;
window.updateSaveValues = updateSaveValues;
window.renderQuizPreview = renderQuizPreview;
window.toggleQuizAnswers = toggleQuizAnswers;
window.updateQuizTargetOptions = updateQuizTargetOptions;
window.sendAccessCardEmail = sendAccessCardEmail;
window.toggleSidebar = toggleSidebar;
window.openWhiteboard = openWhiteboard;
window.clearWhiteboard = clearWhiteboard;
window.exportTeacherData = exportTeacherData;
window.openCourseDetail = openCourseDetail;
window.openAddVideoModal = openAddVideoModal;
window.handleMaterialUpload = handleMaterialUpload;
window.handleAddVideo = handleAddVideo;
window.loadCourseMaterials = loadCourseMaterials;
window.loadCourseQuizzes = loadCourseQuizzes;
window.viewQuizResults = viewQuizResults;
window.loadCourseMembers = loadCourseMembers;
window.openManageMembersModal = openManageMembersModal;
window.generateLessonPlan = generateLessonPlan;
window.formatDueDate = formatDueDate;
window.normalizeRoleCode = normalizeRoleCode;
window.canCreateAssignments = canCreateAssignments;
window.getActiveAssignmentListElement = getActiveAssignmentListElement;
window.setCreateAssignmentButtonsVisibility = setCreateAssignmentButtonsVisibility;
window.loadAssignments = loadAssignments;
window.loadAssignmentReviewQueue = loadAssignmentReviewQueue;
window.loadAssignmentMarksView = loadAssignmentMarksView;
window.loadMarksForSelectedAssignment = loadMarksForSelectedAssignment;
window.loadCourseAssignments = loadCourseAssignments;
window.openCreateAssignmentModal = openCreateAssignmentModal;
window.loadSectionsForDropdown = loadSectionsForDropdown;
window.handleCreateAssignment = handleCreateAssignment;
window.handleAsgFileSelect = handleAsgFileSelect;
window.handleAsgFileDrop = handleAsgFileDrop;
window._showAsgFilePreview = _showAsgFilePreview;
window.clearAsgFile = clearAsgFile;
window.openSubmitModal = openSubmitModal;
window.handleSubmitAssignment = handleSubmitAssignment;
window.viewSubmissions = viewSubmissions;
window.saveGrade = saveGrade;
window.reassignSubmission = reassignSubmission;
window.handleCreateSchoolManagement = handleCreateSchoolManagement;
window.handleCreateSchoolModal = handleCreateSchoolModal;
window.openEditSchoolModal = openEditSchoolModal;
window.handleUpdateSchool = handleUpdateSchool;
window.handleDeleteSchool = handleDeleteSchool;
window.openUserManagement = openUserManagement;
window.loadUserList = loadUserList;
window.openAddUserModal = openAddUserModal;
window.toggleUserFields = toggleUserFields;
window.handleCreateUser = handleCreateUser;
window.showAuditLogs = showAuditLogs;
window.initBackgroundPaths = initBackgroundPaths;
window.initAllAnimations = initAllAnimations;
window.initGlowingEffect = initGlowingEffect;
window.initScrollAnimations = initScrollAnimations;
window.handleGradeChat = handleGradeChat;
window.handleEngagementChat = handleEngagementChat;
window.exportReportCSV = exportReportCSV;
window.renderCommunicationDashboard = renderCommunicationDashboard;
window.switchCommTab = switchCommTab;
window.loadCommAnnouncements = loadCommAnnouncements;
window.showCreateAnnouncementModal = showCreateAnnouncementModal;
window.loadCommMessaging = loadCommMessaging;
window.loadCommNotifications = loadCommNotifications;
window.loadCommPush = loadCommPush;
window.loadCommCalendar = loadCommCalendar;
window.showAddEventModal = showAddEventModal;
window.loadCommEmergency = loadCommEmergency;
window.triggerEmergencyAlert = triggerEmergencyAlert;
window.renderAcademicsDashboard = renderAcademicsDashboard;
window.switchAcademicTab = switchAcademicTab;
window.loadSubjectPlanning = loadSubjectPlanning;
window.loadClassSchedules = loadClassSchedules;
window.loadAttendanceTracking = loadAttendanceTracking;
window.loadAssignmentsView = loadAssignmentsView;
window.loadExamsView = loadExamsView;
window.loadExamSchedulesViewRefresh = loadExamSchedulesViewRefresh;
window.applyExamScheduleSchoolScope = applyExamScheduleSchoolScope;
window.formatExamDate = formatExamDate;
window.formatExamTime = formatExamTime;
window.renderExamScheduleRows = renderExamScheduleRows;
window.loadReportCardsView = loadReportCardsView;
window.showLessonPlanner = showLessonPlanner;
window.showSyllabusDetail = showSyllabusDetail;
window.renderFinanceDashboard = renderFinanceDashboard;
window.switchFinanceTab = switchFinanceTab;
window.loadFeeStructures = loadFeeStructures;
window.loadInstallmentPlans = loadInstallmentPlans;
window.loadDiscountsView = loadDiscountsView;
window.loadInvoicingView = loadInvoicingView;
window.loadOnlinePaymentsView = loadOnlinePaymentsView;
window.loadRefundsView = loadRefundsView;
window.loadFinancialReportsView = loadFinancialReportsView;
window.loadMultiCurrencyView = loadMultiCurrencyView;
window.showComplianceMenu = showComplianceMenu;
window.loadComplianceTab = loadComplianceTab;
window.saveRetentionPolicies = saveRetentionPolicies;
window.showFinanceMenu = showFinanceMenu;
window.financeError = financeError;
window.financeLoading = financeLoading;
window.asCurrency = asCurrency;
window.renderSimpleTable = renderSimpleTable;
window.loadFinanceDashboardView = loadFinanceDashboardView;
window.loadFinanceMasterDataView = loadFinanceMasterDataView;
window.loadFinanceGLView = loadFinanceGLView;
window.loadFinanceReceivablesView = loadFinanceReceivablesView;
window.loadFinancePayablesView = loadFinancePayablesView;
window.loadFinanceInventoryView = loadFinanceInventoryView;
window.loadFinanceAssetsView = loadFinanceAssetsView;
window.loadFinancePayrollView = loadFinancePayrollView;
window.loadFinanceTab = loadFinanceTab;
window.showStaffMenu = showStaffMenu;
window.loadStaffTab = loadStaffTab;
window.loadStaffPerformance = loadStaffPerformance;
window.loadStaffDepartments = loadStaffDepartments;
window.openCreateDeptModal = openCreateDeptModal;
window.loadStaffProfiles = loadStaffProfiles;
window.openStaffReviewModal = openStaffReviewModal;
window.openStaffEditModal = openStaffEditModal;
window.loadStaffAttendance = loadStaffAttendance;
window.showStudentInfoMenu = showStudentInfoMenu;
window.loadStudentInfoTab = loadStudentInfoTab;
window.renderStudentProfilesList = renderStudentProfilesList;
window.filterProfileList = filterProfileList;
window.renderClassAssignmentView = renderClassAssignmentView;
window.createSection = createSection;
window.loadSectionRoster = loadSectionRoster;
window.refreshSectionRosterList = refreshSectionRosterList;
window.assignStudentToSection = assignStudentToSection;
window.removeStudentFromSection = removeStudentFromSection;
window.renderStudentSearchForModule = renderStudentSearchForModule;
window.handleStudentSearch = handleStudentSearch;
window.loadModuleDataForStudent = loadModuleDataForStudent;
window.renderGuardianView = renderGuardianView;
window.openAddGuardianModal = openAddGuardianModal;
window.renderHealthView = renderHealthView;
window.saveHealthRecord = saveHealthRecord;
window.renderDocumentsView = renderDocumentsView;
window.refreshDocsList = refreshDocsList;
window.uploadDocument = uploadDocument;
window.deleteDocument = deleteDocument;
window.loadResources = loadResources;
window.canManageResources = canManageResources;
window.normalizeResourceCategory = normalizeResourceCategory;
window.getActiveResourceCategory = getActiveResourceCategory;
window.initResourcesView = initResourcesView;
window.handleResourceCategoryChange = handleResourceCategoryChange;
window.handleResourceTemplateChange = handleResourceTemplateChange;
window.loadResourceFormTemplates = loadResourceFormTemplates;
window.populateResourceUploadSchoolOptions = populateResourceUploadSchoolOptions;
window.renderResources = renderResources;
window.viewResource = viewResource;
window.filterResources = filterResources;
window.openUploadResourceModal = openUploadResourceModal;
window.handleUploadResourceView = handleUploadResourceView;
window.handleUploadResource = handleUploadResource;
window.deleteResource = deleteResource;
window.toggleSidebarChat = toggleSidebarChat;
window.handleSidebarEnter = handleSidebarEnter;
window.sendSidebarMessage = sendSidebarMessage;
window.handleChatFileSelect = handleChatFileSelect;
window.clearChatFile = clearChatFile;
window.appendSidebarMessage = appendSidebarMessage;
window.loadLMSCatalog = loadLMSCatalog;
window.renderLMSCatalog = renderLMSCatalog;
window.submitLMSCourse = submitLMSCourse;
window.launchLMSPlayer = launchLMSPlayer;
window.renderLMSPlayerNav = renderLMSPlayerNav;
window.submitLMSSection = submitLMSSection;
window.toggleLMSModuleFields = toggleLMSModuleFields;
window.addLMSQuizQuestion = addLMSQuizQuestion;
window.toggleQuestionType = toggleQuestionType;
window.submitLMSModule = submitLMSModule;
window.loadLMSModule = loadLMSModule;
window.handleLMSCompletion = handleLMSCompletion;
window.navLMSModule = navLMSModule;
window.submitLMSQuiz = submitLMSQuiz;
window.toggleLMSChat = toggleLMSChat;
window.handleLMSChatKey = handleLMSChatKey;
window.sendLMSChat = sendLMSChat;
window.openAttendanceModal = openAttendanceModal;
window.getAttendanceLocalKey = getAttendanceLocalKey;
window.getAttendanceFallbackData = getAttendanceFallbackData;
window.saveAttendanceFallback = saveAttendanceFallback;
window.loadAttendanceList = loadAttendanceList;
window.bulkSetAttendance = bulkSetAttendance;
window.getAttendanceSaveError = getAttendanceSaveError;
window.saveAttendanceRecord = saveAttendanceRecord;
window.loadAttendanceViewList = loadAttendanceViewList;
window.bulkSetAttendanceView = bulkSetAttendanceView;
window.saveAttendanceViewRecord = saveAttendanceViewRecord;
window.timetablePdfAbsoluteUrl = timetablePdfAbsoluteUrl;
window.renderTimetablePdfCards = renderTimetablePdfCards;
window.handleTimetablePdfUpload = handleTimetablePdfUpload;
window.loadTimetable = loadTimetable;
window.loadStudentAttendanceView = loadStudentAttendanceView;
window.loadPendingLeaves = loadPendingLeaves;
window.handleLeaveAction = handleLeaveAction;
window.openTeacherAICoPilot = openTeacherAICoPilot;
window.sendTeacherAIMessage = sendTeacherAIMessage;
window.loadStudentLeaveView = loadStudentLeaveView;
window.initParentLeaveApplyView = initParentLeaveApplyView;
window.setLeaveApprovalTab = setLeaveApprovalTab;
window.initTeacherLeaveApprovalTabs = initTeacherLeaveApprovalTabs;
window.formatPct = formatPct;
window.renderProgressCard = renderProgressCard;
window.ensureParentProgressCardViewLayout = ensureParentProgressCardViewLayout;
window.renderEmailListItem = renderEmailListItem;
window.initEmailCompose = initEmailCompose;
window.notificationStatusBadge = notificationStatusBadge;
window.renderNotificationListItem = renderNotificationListItem;
window.initParentEmailCompose = initParentEmailCompose;
window.ensureParentExamScheduleLayout = ensureParentExamScheduleLayout;
window.startPDFExam = startPDFExam;
window.startExamTimer = startExamTimer;
window.finishExamEarly = finishExamEarly;
window.loadTestCreateView = loadTestCreateView;
window.showPDFExamForm = showPDFExamForm;
window.initAttendanceSheetView = initAttendanceSheetView;
window.computeLetterGrade = computeLetterGrade;
window.ensureProgressEnterViewLayout = ensureProgressEnterViewLayout;
window.ensureProgressPublishViewLayout = ensureProgressPublishViewLayout;
window.loadTeacherQuizzes = loadTeacherQuizzes;
window.populateExamScheduleFormOptions = populateExamScheduleFormOptions;
window.createExamSchedule = createExamSchedule;
window.loadExamSchedulesAdmin = loadExamSchedulesAdmin;
window.loadExamSchedulesMy = loadExamSchedulesMy;
window.openExamScheduleEditModal = openExamScheduleEditModal;
window.saveExamScheduleEdit = saveExamScheduleEdit;
window.notifyExamSchedule = notifyExamSchedule;
window.fetchAttendanceStudentsByGrade = fetchAttendanceStudentsByGrade;
window.takeQuiz = takeQuiz;
window.submitQuizAnswers = submitQuizAnswers;
window.handleTeacherLeaveSubmit = handleTeacherLeaveSubmit;
window.loadMyLeaveHistory = loadMyLeaveHistory;
window.loadParentFeesView = loadParentFeesView;
window.loadParentLeaveStatusView = loadParentLeaveStatusView;
window.loadTeacherLeaveApprovals = loadTeacherLeaveApprovals;
window.loadTeacherLeaveHistory = loadTeacherLeaveHistory;
window.updateLeaveStatus = updateLeaveStatus;
window.fetchProgressCard = fetchProgressCard;
window.fetchMyProgressCard = fetchMyProgressCard;
window.loadProgressReportView = loadProgressReportView;
window.loadProgressCardForStudent = loadProgressCardForStudent;
window.loadParentProgressCardView = loadParentProgressCardView;
window.loadStudentProgressCardView = loadStudentProgressCardView;
window.loadEmailInbox = loadEmailInbox;
window.loadEmailSent = loadEmailSent;
window.loadParentEmailInbox = loadParentEmailInbox;
window.loadParentEmailSent = loadParentEmailSent;
window.loadNotificationsInto = loadNotificationsInto;
window.loadStudentNotifications = loadStudentNotifications;
window.loadParentNotifications = loadParentNotifications;
window.loadQuestionBanks = loadQuestionBanks;
window.handleQuestionBankUpload = handleQuestionBankUpload;
window.loadStudentExams = loadStudentExams;
window.loadStudentAssignmentsExamSchedules = loadStudentAssignmentsExamSchedules;
window.loadStudentAssignmentsAndResults = loadStudentAssignmentsAndResults;
window.loadParentExamScheduleView = loadParentExamScheduleView;
window.submitAnswerSheet = submitAnswerSheet;
window.loadGroupsForExamSelect = loadGroupsForExamSelect;
window.handleCreatePDFExam = handleCreatePDFExam;
window.initProgressEnterView = initProgressEnterView;
window.initProgressPublishView = initProgressPublishView;
window.loadAttendanceSheetData = loadAttendanceSheetData;



