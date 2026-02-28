/**
 * app_loader.js — ClassBridge Phase-2 Dynamic Module Loader
 *
 * Called after successful login. Dynamically injects only the JS modules
 * the logged-in user's role needs. Prevents loading private dashboard code
 * before authentication, and prevents loading irrelevant persona modules.
 *
 * Usage (in auth.js after login):
 *   await window.loadDashboardModules(role);
 */

(function () {
    'use strict';

    // Track which scripts have already been injected (handles page-refresh re-entry)
    window.__cbLoadedModules = window.__cbLoadedModules || new Set();

    /**
     * Injects a single <script> tag and returns a Promise that resolves
     * when the script has loaded and executed, or rejects on error.
     * If the script was already injected, resolves immediately.
     */
    function loadScript(path) {
        const src = path.startsWith('http') ? path : `/static/${path}`;
        if (window.__cbLoadedModules.has(src)) {
            return Promise.resolve(); // already loaded
        }
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.defer = true;
            s.onload = () => {
                window.__cbLoadedModules.add(src);
                resolve();
            };
            s.onerror = () => {
                console.warn(`[CB Loader] Failed to load: ${src}`);
                resolve(); // resolve anyway — don't block the dashboard for one failed module
            };
            document.body.appendChild(s);
        });
    }

    /**
     * Loads a list of scripts sequentially (order matters for dependencies).
     */
    async function loadSequential(paths) {
        for (const path of paths) {
            await loadScript(path);
        }
    }

    /**
     * Main entry point called after login.
     * @param {string} role - The logged-in user's role string
     */
    window.loadDashboardModules = async function (role) {
        if (window.__cbDashboardModulesLoading || window.__cbDashboardModulesLoaded) {
            // Already loading or loaded — don't double-inject
            return;
        }
        window.__cbDashboardModulesLoading = true;

        console.log(`[CB Loader] Starting Phase-2 module load for role: ${role}`);

        try {
            // ── Phase 2a: Shared infrastructure (every logged-in role needs these) ──
            await loadSequential([
                'sidebar.js',
                'ai_chat.js',
                'rbac.js',
            ]);

            // ── Phase 2b: Role-specific modules ──
            const isTeacherLike = ['Teacher', 'Admin', 'Tenant_Admin', 'Principal',
                'Academic_Admin', 'HR_Admin', 'Finance_Admin'].includes(role);
            const isAdminLike = ['Admin', 'Tenant_Admin', 'Root_Super_Admin',
                'Super Admin', 'SuperAdmin'].includes(role) || window.appState?.isSuperAdmin;
            const isStudent = role === 'Student';
            const isParent = ['Parent', 'Parent_Guardian'].includes(role);

            if (isAdminLike) {
                // Root / Super admins get everything
                await loadSequential([
                    'root_admin.js',
                    'super_admin.js',
                    'teacher_reports.js',
                    'teacher_dashboard.js',
                    'teacher_students.js',
                    'teacher_quiz.js',
                    'teacher_assignments.js',
                    'teacher_attendance.js',
                    'teacher_leave.js',
                    'teacher_progress.js',
                    'monthly_report.js',
                    'student_dashboard.js',
                    'student_exams.js',
                    'student_leave.js',
                    'student_attendance.js',
                    'student_notifications.js',
                    'parent_dashboard.js',
                    'parent_exams.js',
                    'parent_leave.js',
                    'parent_fees.js',
                    'parent_progress.js',
                    'messaging.js',
                    'lms.js',
                    'timetable.js',
                    'resources.js',
                ]);
            } else if (isTeacherLike) {
                await loadSequential([
                    'teacher_reports.js',
                    'teacher_dashboard.js',
                    'teacher_students.js',
                    'teacher_quiz.js',
                    'teacher_assignments.js',
                    'teacher_attendance.js',
                    'teacher_leave.js',
                    'teacher_progress.js',
                    'monthly_report.js',
                    'messaging.js',
                    'lms.js',
                    'timetable.js',
                    'resources.js',
                ]);
            } else if (isStudent) {
                await loadSequential([
                    'student_dashboard.js',
                    'student_exams.js',
                    'student_leave.js',
                    'student_attendance.js',
                    'student_notifications.js',
                    'messaging.js',
                    'timetable.js',
                    'resources.js',
                ]);
            } else if (isParent) {
                await loadSequential([
                    'parent_dashboard.js',
                    'parent_exams.js',
                    'parent_leave.js',
                    'parent_fees.js',
                    'parent_progress.js',
                    'messaging.js',
                ]);
            } else {
                // Unknown role — load everything to be safe
                console.warn(`[CB Loader] Unknown role "${role}" — loading all modules as fallback`);
                await loadSequential([
                    'root_admin.js', 'super_admin.js',
                    'teacher_reports.js', 'teacher_dashboard.js', 'teacher_students.js',
                    'teacher_quiz.js', 'teacher_assignments.js', 'teacher_attendance.js',
                    'teacher_leave.js', 'teacher_progress.js', 'monthly_report.js',
                    'student_dashboard.js', 'student_exams.js', 'student_leave.js',
                    'student_attendance.js', 'student_notifications.js',
                    'parent_dashboard.js', 'parent_exams.js', 'parent_leave.js',
                    'parent_fees.js', 'parent_progress.js',
                    'messaging.js', 'lms.js', 'timetable.js', 'resources.js',
                ]);
            }

            window.__cbDashboardModulesLoaded = true;
            window.__cbDashboardModulesLoading = false;
            console.log(`[CB Loader] Phase-2 complete. Dashboard ready for: ${role}`);

        } catch (err) {
            window.__cbDashboardModulesLoading = false;
            console.error('[CB Loader] Phase-2 loading failed:', err);
        }
    };

    console.log('[CB Loader] app_loader.js ready (Phase-2 standby)');
})();
