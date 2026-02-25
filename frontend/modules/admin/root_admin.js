/** root_admin.js — Root Admin Panel & Database Explorer */
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
