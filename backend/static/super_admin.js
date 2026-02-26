/** super_admin.js — Super Admin Dashboard, School Creation & Switching */
function loadSuperAdminDashboard() {
    return __awaiter(this, void 0, void 0, function* () {
        // Build the sidebar first so Super Admin gets all navigation items
        renderTeacherControls();
        switchView('super-admin-view');
        const container = document.getElementById('super-admin-content');
        if (!container)
            return;
        container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary" role="status"></div><p>Loading schools...</p></div>';
        try {
            const response = yield fetchAPI('/admin/schools', {}); // Requires Auth
            if (response.ok) {
                const schools = yield response.json();
                let html = `
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3 class="fw-bold text-primary">Registered Institutions</h3>
                    <button class="btn btn-primary-custom" onclick="showCreateSchoolModal()">
                        <span class="material-icons align-middle fs-5 me-1">add_circle</span> Add Institution
                    </button>
                </div>
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0 align-middle">
                            <thead class="bg-light">
                                <tr>
                                    <th class="py-3 ps-4">ID</th>
                                    <th class="py-3">Name</th>
                                    <th class="py-3">Address</th>
                                    <th class="py-3">Contact</th>
                                    <th class="py-3">Created</th>
                                    <th class="py-3 text-end pe-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
                if (schools.length === 0) {
                    html += `<tr><td colspan="6" class="text-center py-4 text-muted">No schools registered yet.</td></tr>`;
                }
                else {
                    schools.forEach(s => {
                        const safeName = s.name.replace(/"/g, '&quot;');
                        const safeAddr = (s.address || '').replace(/"/g, '&quot;');
                        const safeEmail = (s.contact_email || '').replace(/"/g, '&quot;');
                        html += `<tr>
                        <td class="ps-4 fw-bold">#${s.id}</td>
                        <td>
                            <a href="#" class="text-primary fw-bold text-decoration-none" 
                               onclick="openSchoolDashboard(${s.id}, '${safeName}'); return false;">
                                ${s.name}
                            </a>
                        </td>
                        <td>${s.address}</td>
                        <td>${s.contact_email}</td>
                        <td class="text-muted"><small>${new Date(s.created_at).toLocaleDateString()}</small></td>
                        <td class="text-end pe-4">
                            <div class="d-flex justify-content-end gap-2">
                                <button class="btn btn-sm btn-outline-warning" 
                                    onclick="openEditSchoolModal(${s.id}, '${safeName}', '${safeAddr}', '${safeEmail}')"
                                    title="Edit School">
                                    <span class="material-icons" style="font-size: 16px;">edit</span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" 
                                    onclick="handleDeleteSchool(${s.id}, '${safeName}')"
                                    title="Delete School">
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
                container.innerHTML = '<p class="text-danger">Failed to load schools.</p>';
            }
        }
        catch (e) {
            container.innerHTML = '<p class="text-danger">Error loading schools: ' + e.message + '</p>';
        }
    });
}
function showCreateSchoolModal() {
    // Append to body if not exists
    if (!document.getElementById('createSchoolModal')) {
        const modalHtml = `
          <div class="view full-page-view" id="createSchoolModal" tabindex="-1">
            <div class="modal-dialog">
              <div class="modal-content rounded-4 border-0 shadow">
                <div class="modal-header border-0 pb-0">
                  <h5 class="modal-title fw-bold text-primary">Create New Institution</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4">
                  <form id="create-school-form">
                    <div class="form-floating mb-3">
                        <input type="text" id="new-school-name" class="form-control bg-light border-0" placeholder="Institution Name" required>
                        <label>Institution Name</label>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="text" id="new-school-address" class="form-control bg-light border-0" placeholder="Address" required>
                        <label>Address</label>
                    </div>
                    <div class="form-floating mb-3">
                        <input type="email" id="new-school-email" class="form-control bg-light border-0" placeholder="Email" required>
                        <label>Contact Email</label>
                    </div>
                    <button type="submit" class="btn btn-primary-custom w-100 py-3 rounded-pill fw-bold">Create Institution</button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('create-school-form').addEventListener('submit', handleCreateSchool);
    }
    openView('createSchoolModal');
}
function handleCreateSchool(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const name = document.getElementById('new-school-name').value;
        const address = document.getElementById('new-school-address').value;
        const email = document.getElementById('new-school-email').value;
        try {
            const res = yield fetchAPI('/admin/schools', {
                method: 'POST',
                body: JSON.stringify({ name, address, contact_email: email })
            });
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
        // Toast Feedback
        const msg = document.createElement('div');
        msg.className = 'alert alert-info fixed-top m-3 text-center fw-bold shadow';
        msg.style.zIndex = '9999';
        msg.textContent = `Viewing Dashboard for ${schoolName}`;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    });
}

// --- Window bindings for inline HTML onclick handlers ---
window.loadSuperAdminDashboard = loadSuperAdminDashboard;
window.showCreateSchoolModal = showCreateSchoolModal;
window.handleCreateSchool = handleCreateSchool;
window.openSchoolDashboard = openSchoolDashboard;
