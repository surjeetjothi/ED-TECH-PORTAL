/**
 * cb_view_registry.js — ClassBridge View Loader Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Load this BEFORE script.js.
 *
 * Provides:
 *   VIEW_LOADERS         — declarative map: viewId → { roles, loader, alwaysReload }
 *   window._cbViewLoaded — session cache tracking which views have fetched data
 *   window.cbRefreshView(viewId) — force-refresh a view's data (clears cache)
 *
 * Role constants (also used by script.js switchView dispatcher):
 *   TEACHER_ROLES | PARENT_ROLES | STUDENT_ROLES | COMMS_ROLES
 *
 * Dashboard wrapper functions (called by VIEW_LOADERS loaders):
 *   loadTeacherDashboardData()
 *   loadStudentDashboardData()
 *   loadParentDashboardData()
 *   loadStudentExamsAndAssignments()
 *   loadProgressCardForRole()
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Session cache ─────────────────────────────────────────────────────────────
// Tracks which views have already loaded their data this session.
// Reset to {} on logout / re-login (done inside initializeDashboard).

window._cbViewLoaded = {};

/**
 * Force-reload a view: clear its cache entry, then re-trigger the loader
 * if the view is currently active.
 * Call this after any action that mutates data displayed in that view.
 *
 * @param {string} viewId — e.g. 'student-exams-view'
 *
 * @example
 *   cbRefreshView('student-exams-view');   // after submitting an assignment
 *   cbRefreshView('assignment-review-view'); // after teacher grades a submission
 */
window.cbRefreshView = function (viewId) {
    delete window._cbViewLoaded[viewId];
    const el = document.getElementById(viewId);
    if (el && el.classList.contains('active')) {
        if (typeof switchView === 'function') switchView(viewId, false);
    }
};


// ── Role Constants ────────────────────────────────────────────────────────────

const TEACHER_ROLES = ['Teacher', 'Admin', 'Principal', 'Tenant_Admin'];
const PARENT_ROLES = ['Parent', 'Parent_Guardian'];
const STUDENT_ROLES = ['Student'];
const COMMS_ROLES = [...TEACHER_ROLES, ...PARENT_ROLES, ...STUDENT_ROLES];


// ── Dashboard Wrapper Functions ───────────────────────────────────────────────
// These bridge between the VIEW_LOADERS registry and the actual loader functions
// defined later in script.js. Using typeof guards prevents errors if a function
// is not yet defined (e.g., during incremental loading).

/** Teacher dashboard: fetch student roster → render dashboard + live classes. */
function loadTeacherDashboardData() {
    if (typeof fetchStudents === 'function') {
        fetchStudents().then(() => {
            if (typeof renderTeacherDashboard === 'function') renderTeacherDashboard();
            if (typeof loadLiveClasses === 'function') loadLiveClasses();
            if (typeof checkClassStatus === 'function') checkClassStatus();
        });
    }
}

/** Student dashboard: load the logged-in student's own data. */
function loadStudentDashboardData() {
    const id = (typeof appState !== 'undefined') ? appState.activeStudentId : null;
    if (id && typeof loadStudentDashboard === 'function') loadStudentDashboard(id);
}

/** Parent dashboard: fetch linked child, then load child data. */
function loadParentDashboardData() {
    if (typeof fetchStudents === 'function') {
        fetchStudents().then(() => {
            // If activeStudentId not yet set, pick the first result from allStudents
            // (the backend already filters /api/students/all for parents to return only their children)
            if (!appState.activeStudentId && Array.isArray(appState.allStudents) && appState.allStudents.length > 0) {
                const firstChild = appState.allStudents[0];
                appState.activeStudentId = firstChild.id || firstChild.ID || firstChild.student_id || null;
                // Save to session
                try {
                    const session = JSON.parse(localStorage.getItem('classbridge_session') || '{}');
                    session.active_student_id = appState.activeStudentId;
                    localStorage.setItem('classbridge_session', JSON.stringify(session));
                } catch (e) { }
            }
            if (appState.activeStudentId) {
                const el = document.getElementById('parent-child-id');
                if (el) el.value = appState.activeStudentId;
                if (typeof loadParentChildData === 'function') loadParentChildData();
            }
        });
    }
}

/** Student exams view: loads both exam schedules and assignment results. */
function loadStudentExamsAndAssignments() {
    if (typeof loadStudentAssignmentsExamSchedules === 'function')
        loadStudentAssignmentsExamSchedules();
    if (typeof loadStudentAssignmentsAndResults === 'function')
        loadStudentAssignmentsAndResults();
    // Wire tab-switch refresh once per session
    const btn = document.getElementById('exams-tab-btn');
    if (btn && !btn.dataset.boundLoad) {
        btn.dataset.boundLoad = '1';
        btn.addEventListener('shown.bs.tab', () => {
            if (typeof loadStudentAssignmentsExamSchedules === 'function')
                loadStudentAssignmentsExamSchedules();
        });
    }
}

/** Progress card: role-specific — student vs. parent view. */
function loadProgressCardForRole() {
    if ((typeof appState !== 'undefined') && appState.role === 'Student') {
        if (typeof loadStudentProgressCardView === 'function') loadStudentProgressCardView();
    } else {
        if (typeof loadParentProgressCardView === 'function') loadParentProgressCardView();
    }
}


// ── Master VIEW_LOADERS Registry ─────────────────────────────────────────────
// Each entry: { roles: string[], loader: Function, alwaysReload?: boolean }
//   roles        — which roles are allowed to trigger this loader
//   loader       — function to call when the view is first visited
//   alwaysReload — if true, bypass cache and reload every visit (e.g. inbox)

const VIEW_LOADERS = {

    // ── Dashboard home views ─────────────────────────────────────────────────
    'teacher-view': { roles: TEACHER_ROLES, loader: loadTeacherDashboardData },
    'student-view': { roles: STUDENT_ROLES, loader: loadStudentDashboardData },
    'parent-dashboard-view': { roles: PARENT_ROLES, loader: loadParentDashboardData },

    // ── Quizzes / Tests ──────────────────────────────────────────────────────
    'test-results-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadTeacherQuizzes === 'function') loadTeacherQuizzes(); } },
    'test-question-bank-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadQuestionBanks === 'function') loadQuestionBanks(); } },
    'test-create-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadTestCreateView === 'function') loadTestCreateView(); } },

    // ── Student: Exams & Assignments ─────────────────────────────────────────
    'upcoming-exams-view': { roles: STUDENT_ROLES, loader: () => { if (typeof loadStudentExams === 'function') loadStudentExams(); } },
    'student-exams-view': { roles: STUDENT_ROLES, loader: loadStudentExamsAndAssignments },

    // ── Timetable ────────────────────────────────────────────────────────────
    'timetable-view': { roles: [...TEACHER_ROLES, ...STUDENT_ROLES], loader: () => { if (typeof loadTimetable === 'function') loadTimetable(); } },
    'parent-timetable-view': { roles: PARENT_ROLES, loader: () => { if (typeof loadTimetable === 'function') loadTimetable(); } },

    // ── Attendance ───────────────────────────────────────────────────────────
    'parent-attendance-view': { roles: [...STUDENT_ROLES, ...PARENT_ROLES], loader: () => { if (typeof loadStudentAttendanceView === 'function') loadStudentAttendanceView(); } },
    'attendance-sheet-view': { roles: TEACHER_ROLES, loader: () => { if (typeof initAttendanceSheetView === 'function') initAttendanceSheetView(); } },

    // ── Fees / Finance ───────────────────────────────────────────────────────
    'parent-fees-view': { roles: [...PARENT_ROLES, ...STUDENT_ROLES], loader: () => { if (typeof loadParentFeesView === 'function') loadParentFeesView(); } },

    // ── Leave ────────────────────────────────────────────────────────────────
    'parent-leave-apply-view': { roles: PARENT_ROLES, loader: () => { if (typeof initParentLeaveApplyView === 'function') initParentLeaveApplyView(); } },
    'parent-leave-status-view': { roles: PARENT_ROLES, loader: () => { if (typeof loadParentLeaveStatusView === 'function') loadParentLeaveStatusView(); } },

    // ── Progress ─────────────────────────────────────────────────────────────
    'progress-enter-view': { roles: TEACHER_ROLES, loader: () => { if (typeof initProgressEnterView === 'function') initProgressEnterView(); } },
    'progress-publish-view': { roles: TEACHER_ROLES, loader: () => { if (typeof initProgressPublishView === 'function') initProgressPublishView(); } },
    'progress-report-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadProgressReportView === 'function') loadProgressReportView(); } },
    'parent-progress-card-view': { roles: [...STUDENT_ROLES, ...PARENT_ROLES], loader: loadProgressCardForRole },

    // ── Exams ────────────────────────────────────────────────────────────────
    'parent-exam-schedule-view': { roles: PARENT_ROLES, loader: () => { if (typeof loadParentExamScheduleView === 'function') loadParentExamScheduleView(); } },

    // ── Assignments ──────────────────────────────────────────────────────────
    'assignment-view-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadAssignments === 'function') loadAssignments(); } },
    'assignment-review-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadAssignmentReviewQueue === 'function') loadAssignmentReviewQueue(); } },
    'assignment-marks-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadAssignmentMarksView === 'function') loadAssignmentMarksView(); } },

    // ── Messaging (always reload — inbox must be fresh) ──────────────────────
    'email-inbox-view': { roles: TEACHER_ROLES, alwaysReload: true, loader: () => { if (typeof loadEmailInbox === 'function') loadEmailInbox(); } },
    'email-sent-view': { roles: TEACHER_ROLES, alwaysReload: true, loader: () => { if (typeof loadEmailSent === 'function') loadEmailSent(); } },
    'email-compose-view': { roles: TEACHER_ROLES, loader: () => { if (typeof initEmailCompose === 'function') initEmailCompose(); } },
    'parent-email-inbox-view': { roles: PARENT_ROLES, alwaysReload: true, loader: () => { if (typeof loadParentEmailInbox === 'function') loadParentEmailInbox(); } },
    'parent-email-sent-view': { roles: PARENT_ROLES, alwaysReload: true, loader: () => { if (typeof loadParentEmailSent === 'function') loadParentEmailSent(); } },
    'parent-email-compose-view': { roles: PARENT_ROLES, loader: () => { if (typeof initParentEmailCompose === 'function') initParentEmailCompose(); } },

    // ── Notifications (always reload — must be fresh) ────────────────────────
    'student-notifications-view': { roles: STUDENT_ROLES, alwaysReload: true, loader: () => { if (typeof loadStudentNotifications === 'function') loadStudentNotifications(); } },
    'parent-notifications-view': { roles: PARENT_ROLES, alwaysReload: true, loader: () => { if (typeof loadParentNotifications === 'function') loadParentNotifications(); } },

    // ── Resources ────────────────────────────────────────────────────────────
    'resources-view': { roles: COMMS_ROLES, loader: () => { if (typeof initResourcesView === 'function') initResourcesView(); } },

    // ── Admin/Teacher: Role & Permission Management ──────────────────────────
    // These views are ONLY for Admin/Principal/Tenant_Admin — block Student/Parent via URL hash
    'role-management-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadRoles === 'function') loadRoles(); } },
    'roles-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadRoles === 'function') loadRoles(); } },
    'role-form-view': { roles: TEACHER_ROLES, loader: () => { } },
    'permissions-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadPermissionsSetup === 'function') loadPermissionsSetup(); } },

    // ── Admin: Staff, Compliance, Settings ──────────────────────────────────
    'staff-view': { roles: TEACHER_ROLES, loader: () => { } },
    'settings-view': { roles: COMMS_ROLES, loader: () => { } },   // all roles can access settings
    'compliance-view': { roles: TEACHER_ROLES, loader: () => { } },
    'reports-view': { roles: TEACHER_ROLES, loader: () => { } },
    'performance-report-view': { roles: TEACHER_ROLES, loader: () => { } },
    'finance-view': { roles: TEACHER_ROLES, loader: () => { } },
    'root-admin-view': { roles: TEACHER_ROLES, superAdminOnly: true, loader: () => { } },  // Super Admin ONLY

    // ── Teacher: Attendance ──────────────────────────────────────────────────
    'attendance-take-view': { roles: TEACHER_ROLES, loader: () => { } },
    'attendance-report-view': { roles: TEACHER_ROLES, loader: () => { } },
    'attendance-leave-approval-view': { roles: TEACHER_ROLES, loader: () => { if (typeof loadTeacherLeaveApprovals === 'function') loadTeacherLeaveApprovals(); } },
    'teacher-leave-apply-view': { roles: TEACHER_ROLES, loader: () => { } },

    // ── Teacher: Quick-access sub-views ─────────────────────────────────────
    'student-info-view': { roles: TEACHER_ROLES, loader: () => { } },
    'groups-view': { roles: TEACHER_ROLES, loader: () => { } },
    'create-class-view': { roles: TEACHER_ROLES, loader: () => { } },
    'teacher-class-management-view': { roles: TEACHER_ROLES, loader: () => { } },
    'add-user-view': { roles: TEACHER_ROLES, loader: () => { } },
    'grade-helper-view': { roles: TEACHER_ROLES, loader: () => { } },
    'engagement-helper-view': { roles: TEACHER_ROLES, loader: () => { } },
    'communication-view': { roles: TEACHER_ROLES, loader: () => { } },
    'messages-view-view': { roles: TEACHER_ROLES, loader: () => { } },
    'notifications-view': { roles: TEACHER_ROLES, loader: () => { } },
    'payroll-view-view': { roles: TEACHER_ROLES, loader: () => { } },
    'payroll-print-view': { roles: TEACHER_ROLES, loader: () => { } },

    // ── Student-specific ────────────────────────────────────────────────────
    'student-leave-view': { roles: STUDENT_ROLES, loader: () => { if (typeof loadStudentLeaveView === 'function') loadStudentLeaveView(); } },
    'student-communication-view': { roles: STUDENT_ROLES, loader: () => { } },
    'student-academics-view': { roles: STUDENT_ROLES, loader: () => { } },

    // ── Parent-specific ─────────────────────────────────────────────────────
    'parent-assignment-view': { roles: PARENT_ROLES, loader: () => { } },
    'parent-assignment-scores-view': { roles: PARENT_ROLES, loader: () => { } },
    'parent-attendance-report-view': { roles: PARENT_ROLES, loader: () => { } },
    'parent-online-test-view': { roles: PARENT_ROLES, loader: () => { } },
    'parent-feedback-view': { roles: PARENT_ROLES, loader: () => { } },

    // ── Profile — accessible to all logged-in users ──────────────────────────
    'profile-password-view': { roles: COMMS_ROLES, loader: () => { } },
};
