/** super_admin.js — Super Admin Dashboard & School Management */

/* ── Styles (injected once) ─────────────────────────────── */
function _ensureSAStyles() {
    if (document.getElementById('sa-style')) return;
    const s = document.createElement('style');
    s.id = 'sa-style';
    s.textContent = `
    #super-admin-view { background: #f0f4ff; min-height: 100vh; }
    .sa-topbar { background: linear-gradient(135deg, #1a237e 0%, #283593 60%, #3949ab 100%);
                 color: #fff; padding: 28px 32px 24px; border-radius: 0 0 28px 28px; margin-bottom: 28px; }
    .sa-topbar h1 { font-size: 1.7rem; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.3px; }
    .sa-topbar p  { opacity: 0.82; margin: 0; font-size: 0.93rem; }
    .sa-topbar .sa-btn-add { background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.45);
                              color: #fff; font-weight: 700; border-radius: 10px; padding: 9px 20px;
                              display:flex; align-items:center; gap:6px; cursor:pointer; transition:background .2s; }
    .sa-topbar .sa-btn-add:hover { background: rgba(255,255,255,0.28); }
    .sa-stat-row { display:grid; grid-template-columns: repeat(4,1fr); gap:16px; margin: 0 28px 24px; }
    @media(max-width:900px){ .sa-stat-row{ grid-template-columns: repeat(2,1fr); } }
    @media(max-width:540px){ .sa-stat-row{ grid-template-columns: 1fr; } }
    .sa-stat-card { background:#fff; border-radius:16px; padding:20px 22px;
                    box-shadow:0 2px 12px rgba(30,50,120,0.07); display:flex; align-items:center; gap:14px; }
    .sa-stat-icon { width:48px; height:48px; border-radius:14px;
                    display:flex; align-items:center; justify-content:center;
                    font-size:1.5rem; flex-shrink:0; }
    .sa-stat-val  { font-size:1.65rem; font-weight:800; color:#1a237e; line-height:1; }
    .sa-stat-lbl  { font-size:0.8rem; color:#7786a0; font-weight:600; margin-top:3px; }
    .sa-stat-sub  { font-size:0.75rem; color:#aab4c8; margin-top:2px; }
    .sa-section   { margin: 0 28px 28px; }
    .sa-section-hdr { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
    .sa-section-hdr h3 { font-size:1.1rem; font-weight:800; color:#1a237e; margin:0; }
    .sa-school-grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(330px,1fr)); gap:16px; }
    .sa-school-card { background:#fff; border-radius:18px; padding:22px;
                      box-shadow:0 2px 14px rgba(30,50,120,0.08);
                      border:1.5px solid #e8eeff; transition:box-shadow .2s, transform .2s; }
    .sa-school-card:hover { box-shadow:0 8px 28px rgba(30,50,120,0.14); transform:translateY(-2px); }
    .sa-school-card .sc-name { font-size:1.08rem; font-weight:800; color:#1a237e; margin-bottom:2px; }
    .sa-school-card .sc-email { font-size:0.8rem; color:#7786a0; margin-bottom:14px; }
    .sa-school-card .sc-metrics { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
    .sa-metric-pill { background:#f0f4ff; border-radius:8px; padding:6px 12px; text-align:center; flex:1; min-width:70px; }
    .sa-metric-pill .mp-val { font-size:1rem; font-weight:800; color:#283593; }
    .sa-metric-pill .mp-lbl { font-size:0.68rem; color:#7786a0; font-weight:600; }
    .sa-school-card .sc-actions { display:flex; gap:8px; }
    .sa-btn { border-radius:9px; font-weight:700; font-size:0.82rem; padding:7px 14px;
               cursor:pointer; border:none; display:flex; align-items:center; gap:5px; transition:filter .18s; }
    .sa-btn:hover { filter:brightness(0.93); }
    .sa-btn-primary { background:#1a237e; color:#fff; }
    .sa-btn-outline { background:#f0f4ff; color:#1a237e; border:1.5px solid #c5cee0; }
    .sa-btn-danger  { background:#fff0f0; color:#c62828; border:1.5px solid #ffd0d0; }
    .sa-badge-active   { background:#e8f5e9; color:#2e7d32; border-radius:20px;
                          padding:3px 10px; font-size:0.73rem; font-weight:700; }
    .sa-badge-inactive { background:#fff3e0; color:#e65100; border-radius:20px;
                          padding:3px 10px; font-size:0.73rem; font-weight:700; }
    .sa-badge-id { background:#e8eeff; color:#283593; border-radius:6px;
                   padding:2px 8px; font-size:0.72rem; font-weight:700; }
    .sa-empty { text-align:center; padding:60px 20px; color:#aab4c8; }
    .sa-empty .material-icons { font-size:3rem; display:block; margin-bottom:12px; }
    .sa-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45);
                         z-index:2000; display:flex; align-items:center; justify-content:center; }
    .sa-modal { background:#fff; border-radius:20px; padding:32px; width:100%; max-width:480px;
                box-shadow:0 20px 60px rgba(0,0,0,0.2); }
    .sa-modal h4 { font-size:1.2rem; font-weight:800; color:#1a237e; margin-bottom:20px; }
    .sa-input { width:100%; border:1.5px solid #d8e0f0; border-radius:10px; padding:10px 14px;
                font-size:0.93rem; outline:none; transition:border-color .2s; margin-bottom:12px; }
    .sa-input:focus { border-color:#3949ab; }
    .sa-modal-actions { display:flex; gap:10px; margin-top:8px; }
    .sa-spinner { display:inline-block; width:18px; height:18px; border:2.5px solid #c5cee0;
                   border-top-color:#1a237e; border-radius:50%; animation:sa-spin .7s linear infinite; }
    @keyframes sa-spin { to { transform:rotate(360deg); } }
    .sa-alert { border-radius:10px; padding:10px 16px; font-size:0.88rem; font-weight:600;
                margin-bottom:14px; display:none; }
    .sa-alert-success { background:#e8f5e9; color:#2e7d32; }
    .sa-alert-error   { background:#ffebee; color:#c62828; }
    .sa-sidebar-nav { padding:8px 0; }
    .sa-nav-item { display:flex; align-items:center; gap:12px; padding:11px 20px; cursor:pointer;
                   border-radius:12px; font-weight:600; font-size:0.92rem; color:#3a4a6b;
                   transition:background .18s, color .18s; margin:2px 10px; }
    .sa-nav-item:hover, .sa-nav-item.active { background:#e8eeff; color:#1a237e; }
    .sa-nav-item .material-icons { font-size:1.2rem; }
    `;
    document.head.appendChild(s);
}

/* ── Sidebar for Super Admin ─────────────────────────────── */
function renderSuperAdminSidebar() {
    const ctrl = elements.userControls;
    if (!ctrl) return;
    ctrl.innerHTML = '';
    const nav = document.createElement('div');
    nav.className = 'sa-sidebar-nav';
    const items = [
        { icon: 'dashboard', label: 'Dashboard', action: () => loadSuperAdminDashboard() },
        { icon: 'school', label: 'Schools', action: () => loadSuperAdminDashboard() },
        {
            icon: 'admin_panel_settings', label: 'Root Admin Panel', action: () => {
                if (typeof loadRootAdminPanel === 'function') {
                    ensureRootAdminView();
                    switchView('root-admin-view');
                    loadRootAdminPanel();
                }
            }
        },
        {
            icon: 'storage', label: 'Database Explorer', action: () => {
                if (typeof loadRootAdminDatabase === 'function') {
                    ensureRootAdminDatabaseView();
                    switchView('root-admin-db-view');
                    loadRootAdminDatabase();
                }
            }
        },
        {
            icon: 'security', label: 'Roles & Permissions', action: () => {
                switchView('rbac-view');
                if (typeof loadRBACView === 'function') loadRBACView();
            }
        },
    ];
    items.forEach((item, idx) => {
        const el = document.createElement('div');
        el.className = 'sa-nav-item' + (idx === 0 ? ' active' : '');
        el.innerHTML = `<span class="material-icons">${item.icon}</span><span>${item.label}</span>`;
        el.onclick = () => {
            nav.querySelectorAll('.sa-nav-item').forEach(n => n.classList.remove('active'));
            el.classList.add('active');
            item.action();
        };
        nav.appendChild(el);
    });
    ctrl.appendChild(nav);
}

/* ── Main Dashboard Loader ───────────────────────────────── */
function loadSuperAdminDashboard() {
    return __awaiter(this, void 0, void 0, function* () {
        _ensureSAStyles();
        renderSuperAdminSidebar();
        switchView('super-admin-view');

        const container = document.getElementById('super-admin-content');
        if (!container) return;

        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px;">
            <div class="sa-spinner" style="width:36px;height:36px;border-width:4px;"></div>
        </div>`;

        try {
            /* Fetch schools */
            const schoolRes = yield fetchAPI('/admin/schools', {});
            const schools = schoolRes.ok ? (yield schoolRes.json()) : [];

            /* Fetch platform-wide user stats */
            let platformStats = { total_users: 0, teachers: 0, students: 0, parents: 0 };
            try {
                const statsRes = yield fetchAPI('/admin/stats', {});
                if (statsRes.ok) platformStats = Object.assign(platformStats, yield statsRes.json());
            } catch (e) { /* endpoint may not exist — use defaults */ }

            /* Per-school user counts (best-effort) */
            const schoolStats = {};
            yield Promise.all(schools.map((s) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const r = yield fetchAPI(`/admin/schools/${s.id}/stats`, {});
                    if (r.ok) schoolStats[s.id] = yield r.json();
                } catch (e) { }
            })));

            const totalStudents = schools.reduce((a, s) => a + (schoolStats[s.id]?.students || 0), 0) || platformStats.students;
            const totalTeachers = schools.reduce((a, s) => a + (schoolStats[s.id]?.teachers || 0), 0) || platformStats.teachers;
            const totalActive = schools.filter(s => s.is_active !== false).length;

            const now = new Date();
            const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
            const adminName = appState.name || appState.userId || 'Admin';

            container.innerHTML = `
            <!-- TOP BAR -->
            <div class="sa-topbar">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                    <div>
                        <h1>🏛 ${greeting}, ${adminName}</h1>
                        <p>Platform overview · ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;">
                        <button class="sa-btn-add" onclick="showCreateSchoolModal()">
                            <span class="material-icons" style="font-size:1.1rem;">add_circle</span> Add Institution
                        </button>
                        <button class="sa-btn-add" onclick="loadSuperAdminDashboard()" title="Refresh">
                            <span class="material-icons" style="font-size:1.1rem;">refresh</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- STAT ROW -->
            <div class="sa-stat-row">
                <div class="sa-stat-card">
                    <div class="sa-stat-icon" style="background:#e8eeff;">🏫</div>
                    <div>
                        <div class="sa-stat-val">${schools.length}</div>
                        <div class="sa-stat-lbl">Total Institutions</div>
                        <div class="sa-stat-sub">${totalActive} active</div>
                    </div>
                </div>
                <div class="sa-stat-card">
                    <div class="sa-stat-icon" style="background:#e8f5e9;">👩‍🎓</div>
                    <div>
                        <div class="sa-stat-val">${totalStudents.toLocaleString()}</div>
                        <div class="sa-stat-lbl">Total Students</div>
                        <div class="sa-stat-sub">Across all schools</div>
                    </div>
                </div>
                <div class="sa-stat-card">
                    <div class="sa-stat-icon" style="background:#fff3e0;">👨‍🏫</div>
                    <div>
                        <div class="sa-stat-val">${totalTeachers.toLocaleString()}</div>
                        <div class="sa-stat-lbl">Total Teaching Staff</div>
                        <div class="sa-stat-sub">Across all schools</div>
                    </div>
                </div>
                <div class="sa-stat-card">
                    <div class="sa-stat-icon" style="background:#fce4ec;">⚡</div>
                    <div>
                        <div class="sa-stat-val">${totalActive}/${schools.length}</div>
                        <div class="sa-stat-lbl">Active Schools</div>
                        <div class="sa-stat-sub">${schools.length - totalActive} inactive</div>
                    </div>
                </div>
            </div>

            <!-- SCHOOLS SECTION -->
            <div class="sa-section">
                <div class="sa-section-hdr">
                    <h3>🏫 Registered Institutions</h3>
                    <span style="color:#7786a0;font-size:0.85rem;">${schools.length} institution${schools.length !== 1 ? 's' : ''}</span>
                </div>
                <div id="sa-school-grid" class="sa-school-grid">
                    ${schools.length === 0
                    ? `<div class="sa-empty"><span class="material-icons">school</span>No institutions registered yet.<br>
                           <button class="sa-btn sa-btn-primary" style="margin-top:16px;" onclick="showCreateSchoolModal()">
                               + Add First Institution</button></div>`
                    : schools.map(s => _renderSchoolCard(s, schoolStats[s.id])).join('')
                }
                </div>
            </div>`;

        } catch (e) {
            container.innerHTML = `<div style="padding:40px;color:#c62828;font-weight:600;">
                Error loading dashboard: ${e.message}</div>`;
        }
    });
}

/* ── School Card Renderer ────────────────────────────────── */
function _renderSchoolCard(school, stats) {
    const students = stats?.students ?? '—';
    const teachers = stats?.teachers ?? '—';
    const classes = stats?.classes ?? '—';
    const isActive = school.is_active !== false;
    const created = school.created_at ? new Date(school.created_at).toLocaleDateString() : 'N/A';
    const safeName = (school.name || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const safeAddr = (school.address || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const safeEmail = (school.contact_email || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    return `
    <div class="sa-school-card" id="sa-school-card-${school.id}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
            <div>
                <div class="sc-name">${school.name || 'Unnamed School'}</div>
                <div class="sc-email">${school.contact_email || school.address || 'No contact info'}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span class="sa-badge-id">ID: ${school.id}</span>
                <span class="${isActive ? 'sa-badge-active' : 'sa-badge-inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
            </div>
        </div>
        <div class="sc-metrics">
            <div class="sa-metric-pill">
                <div class="mp-val">${students}</div>
                <div class="mp-lbl">Students</div>
            </div>
            <div class="sa-metric-pill">
                <div class="mp-val">${teachers}</div>
                <div class="mp-lbl">Teachers</div>
            </div>
            <div class="sa-metric-pill">
                <div class="mp-val">${classes}</div>
                <div class="mp-lbl">Classes</div>
            </div>
            <div class="sa-metric-pill">
                <div class="mp-val" style="font-size:0.75rem;">${created}</div>
                <div class="mp-lbl">Registered</div>
            </div>
        </div>
        ${school.address ? `<div style="font-size:0.78rem;color:#9ea8be;margin-bottom:12px;">
            <span class="material-icons" style="font-size:0.85rem;vertical-align:-2px;">place</span>
            ${school.address}</div>` : ''}
        <div class="sc-actions">
            <button class="sa-btn sa-btn-primary" onclick="openSchoolDashboard(${school.id},'${safeName}')" title="View this school's teacher dashboard">
                <span class="material-icons" style="font-size:1rem;">open_in_new</span> View
            </button>
            <button class="sa-btn sa-btn-outline" onclick="openEditSchoolModal(${school.id},'${safeName}','${safeAddr}','${safeEmail}')" title="Edit school info">
                <span class="material-icons" style="font-size:1rem;">edit</span> Edit
            </button>
            <button class="sa-btn sa-btn-danger" onclick="handleDeleteSchool(${school.id},'${safeName}')" title="Delete this school">
                <span class="material-icons" style="font-size:1rem;">delete</span>
            </button>
        </div>
    </div>`;
}

/* ── Premium Modal Styles ────────────────────────────────── */
function _ensurePremiumModalStyles() {
    if (document.getElementById('premium-modal-style')) return;
    const style = document.createElement('style');
    style.id = 'premium-modal-style';
    style.innerHTML = `
    .fade-in { animation: fadeIn 0.3s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(4px); } }
    .sa-modal-overlay { backdrop-filter: blur(4px); background: rgba(15, 23, 42, 0.6) !important; }
    .premium-modal { 
        background: #ffffff !important; 
        border-radius: 24px !important; 
        padding: 0 !important; 
        width: 100%; 
        max-width: 520px !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
        overflow: hidden;
        transform: translateY(20px);
        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes slideUp { to { transform: translateY(0); } }
    .modal-header-custom {
        display: flex;
        align-items: center;
        padding: 24px 32px 20px;
        border-bottom: 1px solid #f1f5f9;
        position: relative;
    }
    .modal-header-custom h4 {
        color: #0f172a;
        font-size: 1.35rem;
        font-weight: 800;
        margin: 0 0 4px;
        letter-spacing: -0.4px;
    }
    .icon-box {
        width: 48px;
        height: 48px;
        background: #eff6ff;
        color: #2962ff;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 18px;
    }
    .icon-box .material-icons { font-size: 1.6rem; }
    .close-btn {
        position: absolute;
        top: 24px;
        right: 24px;
        background: #f8fafc;
        border: none;
        color: #64748b;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
    }
    .close-btn:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
    .modal-body-custom { padding: 0 32px; }
    .modal-footer-custom { padding: 20px 32px 24px; background: #fafafb; border-bottom-left-radius: 24px; border-bottom-right-radius: 24px; }
    .premium-input {
        border: 2px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px 16px;
        height: 60px;
        font-size: 1rem;
        color: #334155;
        transition: all 0.2s;
        box-shadow: none !important;
    }
    .custom-floating > label {
        padding: 18px 16px;
        color: #64748b;
        font-weight: 500;
        transition: all 0.2s;
    }
    .premium-input:focus {
        border-color: #2962ff;
        background-color: #fff;
    }
    .premium-input:focus ~ label, .premium-input:not(:placeholder-shown) ~ label {
        transform: scale(0.85) translateY(-0.8rem) translateX(0.15rem);
        color: #2962ff;
        font-weight: 600;
    }
    .btn.sa-hover-fx:hover { filter: brightness(1.1); transform: translateY(-1px); }
    `;
    document.head.appendChild(style);
}

/* ── Create School Modal ─────────────────────────────────── */
function showCreateSchoolModal() {
    _removeSAModal();
    _ensurePremiumModalStyles();
    const overlay = document.createElement('div');
    overlay.className = 'sa-modal-overlay fade-in';
    overlay.id = 'sa-modal-overlay';
    
    overlay.innerHTML = `
    <div class="sa-modal premium-modal" onclick="event.stopPropagation()">
        <div class="modal-header-custom">
            <div class="icon-box">
                <span class="material-icons">domain_add</span>
            </div>
            <div>
                <h4>Create New Institution</h4>
                <p class="text-muted small mb-0">Set up a new educational organization profile</p>
            </div>
            <button class="close-btn" onclick="_removeSAModal()"><span class="material-icons">close</span></button>
        </div>
        
        <div class="modal-body-custom mt-4">
            <div id="sa-modal-alert" class="sa-alert"></div>
            
            <div class="form-floating mb-3 custom-floating">
                <input type="text" id="sa-school-name" class="form-control premium-input" placeholder="Institution Name *" required autocomplete="off">
                <label for="sa-school-name">Institution Name <span class="text-danger">*</span></label>
            </div>
            
            <div class="form-floating mb-3 custom-floating">
                <input type="email" id="sa-school-email" class="form-control premium-input" placeholder="Contact Email *" required autocomplete="off">
                <label for="sa-school-email">Contact Email <span class="text-danger">*</span></label>
            </div>
            
            <div class="form-floating mb-4 custom-floating">
                <input type="text" id="sa-school-addr" class="form-control premium-input" placeholder="Address (optional)" autocomplete="off">
                <label for="sa-school-addr">Physical Address (Optional)</label>
            </div>
        </div>

        <div class="modal-footer-custom d-flex justify-content-end gap-2 border-top pt-3">
            <button class="btn btn-light fw-bold px-4 py-2 rounded-3 sa-hover-fx" onclick="_removeSAModal()" style="color:#64748b; background:#f1f5f9; border:none; transition:all 0.2s;">
                Cancel
            </button>
            <button class="btn btn-primary fw-bold px-4 py-2 rounded-3 d-flex align-items-center gap-2 sa-hover-fx" id="sa-create-btn" onclick="_handleCreateSchool()" style="background:linear-gradient(135deg, #2962ff, #1e88e5); border:none; box-shadow:0 4px 12px rgba(41,98,255,0.3); transition:all 0.2s;">
                <span class="material-icons" style="font-size:1.1rem;">add_circle</span> Create Institution
            </button>
        </div>
    </div>`;
    
    overlay.onclick = (e) => {
        if (e.target.id === 'sa-modal-overlay') _removeSAModal();
    };
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('sa-school-name')?.focus(), 200);
}

function _removeSAModal() {
    const el = document.getElementById('sa-modal-overlay');
    if (el) el.remove();
}

function _handleCreateSchool() {
    return __awaiter(this, void 0, void 0, function* () {
        const name = (document.getElementById('sa-school-name')?.value || '').trim();
        const email = (document.getElementById('sa-school-email')?.value || '').trim();
        const addr = (document.getElementById('sa-school-addr')?.value || '').trim();
        const alertEl = document.getElementById('sa-modal-alert');
        const btn = document.getElementById('sa-create-btn');

        if (!name || !email) {
            if (alertEl) { alertEl.textContent = 'Name and Email are required.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
            return;
        }
        if (btn) btn.innerHTML = '<span class="sa-spinner" style="border-top-color:#fff;"></span> <span class="ms-2">Creating…</span>';

        try {
            const res = yield fetchAPI('/admin/schools', { method: 'POST', body: JSON.stringify({ name, contact_email: email, address: addr }) });
            const data = yield res.json().catch(() => ({}));
            if (res.ok) {
                _removeSAModal();
                _showSAToast('Institution created successfully!', 'success');
                loadSuperAdminDashboard();
            } else {
                if (alertEl) { alertEl.textContent = data.detail || 'Failed to create institution.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
                if (btn) btn.innerHTML = '<span class="material-icons" style="font-size:1.1rem;">add_circle</span> Create Institution';
            }
        } catch (e) {
            if (alertEl) { alertEl.textContent = 'Network error.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
            if (btn) btn.innerHTML = '<span class="material-icons" style="font-size:1.1rem;">add_circle</span> Create Institution';
        }
    });
}

/* ── Edit School Modal ───────────────────────────────────── */
function openEditSchoolModal(id, name, address, email) {
    _removeSAModal();
    _ensurePremiumModalStyles();
    const overlay = document.createElement('div');
    overlay.className = 'sa-modal-overlay fade-in';
    overlay.id = 'sa-modal-overlay';
    
    overlay.innerHTML = `
    <div class="sa-modal premium-modal" onclick="event.stopPropagation()">
        <div class="modal-header-custom">
            <div class="icon-box" style="background: #fdf4ff; color: #c026d3;">
                <span class="material-icons">edit_note</span>
            </div>
            <div>
                <h4>Edit Institution</h4>
                <p class="text-muted small mb-0">Update information for this organization</p>
            </div>
            <button class="close-btn" onclick="_removeSAModal()"><span class="material-icons">close</span></button>
        </div>
        
        <div class="modal-body-custom mt-4">
            <div id="sa-modal-alert" class="sa-alert"></div>
            
            <div class="form-floating mb-3 custom-floating">
                <input type="text" id="sa-edit-name" class="form-control premium-input" placeholder="Institution Name *" value="${name}" required autocomplete="off">
                <label for="sa-edit-name">Institution Name <span class="text-danger">*</span></label>
            </div>
            
            <div class="form-floating mb-3 custom-floating">
                <input type="email" id="sa-edit-email" class="form-control premium-input" placeholder="Contact Email *" value="${email}" required autocomplete="off">
                <label for="sa-edit-email">Contact Email <span class="text-danger">*</span></label>
            </div>
            
            <div class="form-floating mb-4 custom-floating">
                <input type="text" id="sa-edit-addr" class="form-control premium-input" placeholder="Address" value="${address}" autocomplete="off">
                <label for="sa-edit-addr">Physical Address</label>
            </div>
        </div>

        <div class="modal-footer-custom d-flex justify-content-end gap-2 border-top pt-3">
            <button class="btn btn-light fw-bold px-4 py-2 rounded-3 sa-hover-fx" onclick="_removeSAModal()" style="color:#64748b; background:#f1f5f9; border:none; transition:all 0.2s;">
                Cancel
            </button>
            <button class="btn fw-bold px-4 py-2 rounded-3 d-flex align-items-center gap-2 text-white sa-hover-fx" id="sa-edit-btn" onclick="_handleEditSchool(${id})" style="background:linear-gradient(135deg, #c026d3, #db2777); border:none; box-shadow:0 4px 12px rgba(192,38,211,0.3); transition:all 0.2s;">
                <span class="material-icons" style="font-size:1.1rem;">save</span> Save Changes
            </button>
        </div>
    </div>`;
    
    overlay.onclick = (e) => {
        if (e.target.id === 'sa-modal-overlay') _removeSAModal();
    };
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('sa-edit-name')?.focus(), 200);
}

function _handleEditSchool(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const name = (document.getElementById('sa-edit-name')?.value || '').trim();
        const email = (document.getElementById('sa-edit-email')?.value || '').trim();
        const addr = (document.getElementById('sa-edit-addr')?.value || '').trim();
        const alertEl = document.getElementById('sa-modal-alert');
        const btn = document.getElementById('sa-edit-btn');

        if (!name || !email) {
            if (alertEl) { alertEl.textContent = 'Name and Email are required.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
            return;
        }
        if (btn) btn.innerHTML = '<span class="sa-spinner" style="border-top-color:#fff;"></span> <span class="ms-2">Saving…</span>';

        try {
            const res = yield fetchAPI(`/admin/schools/${id}`, { method: 'PUT', body: JSON.stringify({ name, contact_email: email, address: addr }) });
            const data = yield res.json().catch(() => ({}));
            if (res.ok) {
                _removeSAModal();
                _showSAToast('Institution updated!', 'success');
                loadSuperAdminDashboard();
            } else {
                if (alertEl) { alertEl.textContent = data.detail || 'Update failed.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
                if (btn) btn.innerHTML = '<span class="material-icons" style="font-size:1.1rem;">save</span> Save Changes';
            }
        } catch (e) {
            if (alertEl) { alertEl.textContent = 'Network error.'; alertEl.className = 'sa-alert sa-alert-error'; alertEl.style.display = 'block'; }
            if (btn) btn.innerHTML = '<span class="material-icons" style="font-size:1.1rem;">save</span> Save Changes';
        }
    });
}

/* ── Delete School ───────────────────────────────────────── */
function handleDeleteSchool(id, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Delete "${name}"?\n\nThis action cannot be undone and will remove all associated data.`)) return;
        try {
            const res = yield fetchAPI(`/admin/schools/${id}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                _showSAToast(`"${name}" deleted.`, 'success');
                loadSuperAdminDashboard();
            } else {
                const data = yield res.json().catch(() => ({}));
                _showSAToast(data.detail || 'Delete failed.', 'error');
            }
        } catch (e) {
            _showSAToast('Network error during delete.', 'error');
        }
    });
}

/* ── School context switch (view that school's dashboard) ── */
function openSchoolDashboard(schoolId, schoolName) {
    return __awaiter(this, void 0, void 0, function* () {
        appState.activeSchoolId = schoolId;
        appState.schoolName = schoolName;
        if (elements.authStatus) {
            elements.authStatus.innerHTML =
                `<strong>Role:</strong> ${appState.role} <span class="mx-2">|</span> ` +
                `<strong>User:</strong> ${appState.userId} <span class="mx-2">|</span> ` +
                `<strong>School:</strong> ${schoolName} ` +
                `<button onclick="loadSuperAdminDashboard()" class="btn btn-outline-secondary btn-sm ms-2" style="font-size:0.72rem;padding:2px 8px;">
                    ← Back to Platform
                </button>`;
        }
        renderTeacherControls();
        yield fetchStudents();
        switchView('teacher-view');
        renderTeacherDashboard();
        _showSAToast(`Viewing: ${schoolName}`, 'info');
    });
}

/* ── Toast Helper ────────────────────────────────────────── */
function _showSAToast(msg, type = 'success') {
    const colors = { success: '#2e7d32', error: '#c62828', info: '#1565c0' };
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;
        border-radius:12px;background:${colors[type] || colors.success};color:#fff;
        font-weight:700;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.2);
        animation:sa-spin 0s;opacity:1;transition:opacity .4s;max-width:340px;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 2800);
}

/* ── Ensure the super-admin-view div exists in HTML ─────── */
function _ensureSuperAdminView() {
    if (document.getElementById('super-admin-view')) return;
    const teacherView = document.getElementById('teacher-view');
    if (!teacherView?.parentElement) return;
    const div = document.createElement('div');
    div.id = 'super-admin-view';
    div.className = 'view';
    div.innerHTML = '<div id="super-admin-content"></div>';
    teacherView.parentElement.appendChild(div);
}
// Run on load so the view exists before login
_ensureSuperAdminView();

/* ── Window bindings ─────────────────────────────────────── */
window.loadSuperAdminDashboard = loadSuperAdminDashboard;
window.showCreateSchoolModal = showCreateSchoolModal;
window.openEditSchoolModal = openEditSchoolModal;
window.handleDeleteSchool = handleDeleteSchool;
window.openSchoolDashboard = openSchoolDashboard;
window._handleCreateSchool = _handleCreateSchool;
window._handleEditSchool = _handleEditSchool;
window._removeSAModal = _removeSAModal;
