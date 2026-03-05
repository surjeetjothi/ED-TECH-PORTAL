/** sidebar.js — Sidebar Config, Rendering & Hash Routing */
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
                label: 'sidebar_profile', icon: 'account_circle', id: 'cat-profile',
                children: [
                    { label: 'sidebar_view_profile', onClick: () => openProfileView(), route: '/student/profile' },
                    { label: 'sidebar_settings', onClick: () => alert('Settings Coming Soon'), route: '/student/settings' }
                ]
            },
            { label: 'sidebar_apply_leave', icon: 'timer_off', view: 'student-leave-view', onClick: () => { switchView('student-leave-view'); loadStudentLeaveView(); } },
            { label: 'sidebar_communication', icon: 'forum', view: 'student-communication-view' },
            { label: 'header_notifications', icon: 'notifications', view: 'student-notifications-view', route: '/student/notifications' },
            {
                label: 'Finance', icon: 'account_balance_wallet', id: 'cat-finance-student',
                permission: () => hasAnyPermission(['finance_fees_self_read']) || appState.role === 'Student',
                children: [
                    {
                        label: 'Fee Invoices & Receipts',
                        view: 'parent-fees-view',
                        route: '/student/finance/fees',
                        permission: () => hasPermission('finance_fees_self_read') || appState.role === 'Student'
                    }
                ]
            },
            { label: 'sidebar_question_bank', icon: 'collections_bookmark', view: 'test-question-bank-view', route: '/student/question-bank' }
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
                    { label: 'sidebar_monthly_report', view: 'attendance-report-view', route: '/teacher/attendance/report' },
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
                permission: () => hasAnyPermission(['finance_payroll_self_read', 'finance_payroll']) || appState.role === 'Teacher',
                children: [
                    {
                        label: 'Salary Slips',
                        view: 'payroll-view-view',
                        route: '/teacher/finance/payroll-self',
                        permission: () => hasAnyPermission(['finance_payroll_self_read', 'finance_payroll']) || appState.role === 'Teacher'
                    },
                    {
                        label: 'Tax Statements',
                        view: 'payroll-print-view',
                        route: '/teacher/finance/tax-statements',
                        permission: () => hasAnyPermission(['finance_payroll_self_read', 'finance_payroll']) || appState.role === 'Teacher'
                    }
                ]
            },
            // 7. Messages & Notifications
            {
                label: 'header_messages', icon: 'chat', id: 'cat-messages',
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
                    { label: 'sidebar_monthly_report', view: 'parent-attendance-report-view', route: '/parent/attendance/report' }
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
                permission: () => hasAnyPermission(['finance_fees_child_read', 'finance_invoices']) || appState.role === 'Parent' || appState.role === 'Parent_Guardian',
                children: [
                    {
                        label: 'Child Fees & Payments',
                        view: 'parent-fees-view',
                        route: '/parent/finance/fees',
                        permission: () => hasAnyPermission(['finance_fees_child_read', 'finance_invoices']) || appState.role === 'Parent' || appState.role === 'Parent_Guardian'
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
    const hideLegacySuperAdminSections = appState.isSuperAdmin || ['Root_Super_Admin', 'Super_Admin', 'Super Admin'].includes(appState.role || '');
    const items = [
        { label: 'sidebar_dashboard', icon: 'dashboard', view: 'teacher-view', onClick: () => handleTeacherViewToggle('teacher-view') },
        ...(!hideLegacySuperAdminSections ? [{
            label: 'Classes', icon: 'class', id: 'cat-classes',
            children: [
                { label: 'Create Class', view: 'create-class-view', route: '/teacher/classes/create' },
                { label: 'Manage Classes', view: 'teacher-class-management-view', route: '/teacher/classes/manage', onClick: () => handleTeacherViewToggle('teacher-class-management-view') },
            ]
        }] : []),
        ...(!hideLegacySuperAdminSections ? [{
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
        }] : []),
        {
            label: 'sidebar_reports', icon: 'bar_chart', id: 'cat-reports',
            children: [
                { label: 'sidebar_attendance_report', view: 'attendance-report-view', route: '/teacher/reports/attendance' },
                { label: 'sidebar_performance_report', view: 'performance-report-view', route: '/teacher/reports/performance' }
            ]
        },
        ...(!hideLegacySuperAdminSections ? [{
            label: 'sidebar_approve_leave', icon: 'fact_check', id: 'cat-approvals',
            view: 'attendance-leave-approval-view', route: '/admin/approvals',
            onClick: () => {
                switchView('attendance-leave-approval-view');
                if (typeof loadTeacherLeaveApprovals === 'function') loadTeacherLeaveApprovals();
            }
        }] : [])
    ];
    const isFinanceAdmin = ['Finance_Officer', 'Root_Super_Admin', 'finance_admin', 'accountant', 'payroll_officer'].includes(appState.role);
    const isFinancePrincipal = appState.role === 'Principal';
    if (isFinanceAdmin || isFinancePrincipal) {
        items.push({
            label: 'Finance',
            icon: 'account_balance_wallet',
            id: 'cat-finance-admin',
            permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission([
                'finance_view',
                'finance_dashboard_read',
                'finance_reports_read'
            ]),
            children: [
                {
                    label: 'Dashboard',
                    route: '/admin/finance/dashboard',
                    onClick: () => openFinanceModuleDetails('dashboard'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance_dashboard_read', 'finance_view'])
                },
                {
                    label: 'Master Data',
                    route: '/admin/finance/master-data',
                    onClick: () => openFinanceModuleDetails('master-data'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance_masterdata_read', 'finance_masterdata_manage'])
                },
                {
                    label: 'General Ledger',
                    route: '/admin/finance/gl',
                    onClick: () => openFinanceModuleDetails('gl'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_gl_manage', 'finance_manage'])
                },
                {
                    label: 'Receivables',
                    route: '/admin/finance/receivables',
                    onClick: () => openFinanceModuleDetails('receivables'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_receivables_manage', 'finance_invoices'])
                },
                {
                    label: 'Payables',
                    route: '/admin/finance/payables',
                    onClick: () => openFinanceModuleDetails('payables'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_payables_manage', 'finance_payables_approve'])
                },
                {
                    label: 'Inventory',
                    route: '/admin/finance/inventory',
                    onClick: () => openFinanceModuleDetails('inventory'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_inventory_manage'])
                },
                {
                    label: 'Assets',
                    route: '/admin/finance/assets',
                    onClick: () => openFinanceModuleDetails('assets'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_assets_manage'])
                },
                {
                    label: 'Payroll',
                    route: '/admin/finance/payroll',
                    onClick: () => openFinanceModuleDetails('payroll'),
                    permission: () => isFinanceAdmin || hasAnyPermission(['finance_payroll'])
                },
                {
                    label: 'Reports',
                    route: '/admin/finance/reports',
                    onClick: () => openFinanceModuleDetails('reports'),
                    permission: () => isFinanceAdmin || isFinancePrincipal || hasAnyPermission(['finance_reports_read', 'finance_view'])
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
        items.push({ label: 'sidebar_system_settings', icon: 'settings', view: 'settings-view', onClick: () => handleTeacherViewToggle('settings-view') });
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
// Listen for PopState (Back/Forward)
window.addEventListener('popstate', handleHashRouting);
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

        container.innerHTML = CB.ui.spinner('Loading messages...');

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
