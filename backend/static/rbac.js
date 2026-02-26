/**
 * rbac.js — Roles & Permissions Management Module
 * Provides: loadRoles, renderRolesList, loadRoleDetails, openRoleModal,
 *           handleSaveRole, deleteRole, loadPermissionsList, renderPermissionsTable,
 *           openPermissionEditModal, handleUpdatePermission
 */
// --- ROLE & PERMISSION MANAGEMENT ---
function loadRoles() {
    return __awaiter(this, void 0, void 0, function* () {
        const listContainer = document.getElementById('rbac-roles-list');
        if (!listContainer)
            return;
        listContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary" role="status"></div></div>';
        try {
            const response = yield fetchAPI('/admin/roles');
            if (response.ok) {
                const roles = yield response.json();
                renderRolesList(roles);
            }
            else {
                listContainer.innerHTML = '<div class="text-center text-danger p-3">Failed to load roles.</div>';
            }
        }
        catch (e) {
            console.error(e);
            listContainer.innerHTML = '<div class="text-center text-danger p-3">Network Error</div>';
        }
    });
}
function renderRolesList(roles) {
    const listContainer = document.getElementById('rbac-roles-list');
    listContainer.innerHTML = '';
    roles.forEach(role => {
        // Filter Root_Super_Admin logic
        if (role.name === 'Super Admin' && !appState.isSuperAdmin)
            return;
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'list-group-item list-group-item-action p-3 d-flex justify-content-between align-items-center role-item';
        a.dataset.id = role.id; // Mark for active state
        a.onclick = (e) => {
            e.preventDefault();
            // Highlight active
            document.querySelectorAll('.role-item').forEach(el => el.classList.remove('active'));
            a.classList.add('active');
            loadRoleDetails(role.id);
        };
        a.innerHTML = `
            <div>
                <div class="fw-bold text-dark">${role.name}</div>
                <small class="text-muted">${role.description || 'No description'}</small>
            </div>
            <span class="badge ${role.status === 'Active' ? 'bg-success' : 'bg-secondary'} rounded-pill">${role.status}</span>
        `;
        listContainer.appendChild(a);
    });
}
function loadRoleDetails(roleId) {
    return __awaiter(this, void 0, void 0, function* () {
        const titleEl = document.getElementById('rbac-role-detail-title');
        const bodyEl = document.getElementById('rbac-role-detail-body');
        titleEl.textContent = 'Loading...';
        bodyEl.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-secondary"></div></div>';
        try {
            const response = yield fetchAPI(`/admin/roles/${roleId}`);
            if (response.ok) {
                const role = yield response.json();
                titleEl.textContent = role.name;
                // Generate Permissions Badges/List
                let permsHtml = '';
                if (role.permissions && role.permissions.length > 0) {
                    // Group by prefix if possible? Or just list.
                    permsHtml = '<div class="d-flex flex-wrap gap-2 mb-4">';
                    role.permissions.forEach(p => {
                        permsHtml += `<span class="badge bg-light text-dark border" title="${p.description}">${p.code}</span>`;
                    });
                    permsHtml += '</div>';
                }
                else {
                    permsHtml = '<p class="text-muted fst-italic">No permissions assigned.</p>';
                }
                // Edit Actions
                let actionsHtml = '';
                if (hasPermission('role_management') && !role.is_system) {
                    actionsHtml = `
                    <div class="border-top pt-3 mt-4 d-flex gap-2">
                        <button class="btn btn-primary-custom px-4 rounded-pill" onclick="openRoleModal(${role.id})">
                            <span class="material-icons align-middle small me-1">edit</span> Edit Role
                        </button>
                        <button class="btn btn-outline-danger px-4 rounded-pill" onclick="deleteRole(${role.id}, '${role.name}')">
                            <span class="material-icons align-middle small me-1">delete</span> Delete
                        </button>
                    </div>
                `;
                }
                else if (role.is_system) {
                    actionsHtml = `<div class="alert alert-warning small mt-4"><span class="material-icons align-middle small me-1">lock</span> System roles cannot be modified.</div>`;
                }
                bodyEl.innerHTML = `
                <h6 class="fw-bold text-uppercase text-muted small mb-3">Role Details</h6>
                <div class="mb-3">
                    <span class="fw-bold">Status:</span> 
                    <span class="badge ${role.status === 'Active' ? 'bg-success' : 'bg-secondary'} ms-2">${role.status}</span>
                </div>
                <div class="mb-4">
                    <span class="fw-bold">Description:</span>
                    <p class="text-muted">${role.description}</p>
                </div>
                
                <h6 class="fw-bold text-uppercase text-muted small mb-3">Permissions (${role.permissions.length})</h6>
                ${permsHtml}

                ${actionsHtml}
            `;
            }
            else {
                bodyEl.innerHTML = '<p class="text-danger">Failed to load details.</p>';
            }
        }
        catch (e) {
            bodyEl.innerHTML = '<p class="text-danger">Network Error</p>';
        }
    });
}
function openRoleModal(roleId = null) {
    const modalTitle = document.getElementById('role-form-title');
    const form = document.getElementById('role-form');
    // Clear Form
    form.reset();
    document.getElementById('role-id').value = '';
    document.getElementById('role-perms-container').innerHTML = '<div class="spinner-border spinner-border-sm"></div> Loading permissions...';
    if (roleId) {
        modalTitle.textContent = 'Edit Role';
        document.getElementById('role-id').value = roleId;
        // Fetch details
        fetchAPI(`/admin/roles/${roleId}`).then(res => res.json()).then(data => {
            document.getElementById('role-name').value = data.name;
            document.getElementById('role-desc').value = data.description;
            // Status radio
            if (document.querySelector(`input[name="roleStatus"][value="${data.status}"]`)) {
                document.querySelector(`input[name="roleStatus"][value="${data.status}"]`).checked = true;
            }
            loadPermissionsForModal(data.permissions.map(p => p.code));
        });
    }
    else {
        modalTitle.textContent = 'Create Role';
        loadPermissionsForModal([]);
    }
    switchView('role-form-view');
}
function loadPermissionsForModal() {
    return __awaiter(this, arguments, void 0, function* (selectedCodes = []) {
        const container = document.getElementById('role-perms-container');
        try {
            const response = yield fetchAPI('/admin/permissions');
            const groupedPerms = yield response.json();
            container.innerHTML = '';
            for (const [group, perms] of Object.entries(groupedPerms)) {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'mb-3';
                groupDiv.innerHTML = `<h6 class="fw-bold small text-uppercase text-muted border-bottom pb-1 mb-2">${group}</h6>`;
                const row = document.createElement('div');
                row.className = 'row g-2';
                perms.forEach(p => {
                    const isChecked = selectedCodes.includes(p.code);
                    const col = document.createElement('div');
                    col.className = 'col-md-6';
                    col.innerHTML = `
                    <div class="form-check">
                        <input class="form-check-input perm-check" type="checkbox" value="${p.code}" id="perm-${p.id}" ${isChecked ? 'checked' : ''}>
                        <label class="form-check-label small" for="perm-${p.id}" title="${p.description}">
                            ${p.description} <span class="text-muted" style="font-size: 10px;">(${p.code})</span>
                        </label>
                    </div>
                `;
                    row.appendChild(col);
                });
                groupDiv.appendChild(row);
                container.appendChild(groupDiv);
            }
        }
        catch (e) {
            container.textContent = "Error loading permissions.";
        }
    });
}
function handleSaveRole() {
    return __awaiter(this, void 0, void 0, function* () {
        const roleId = document.getElementById('role-id').value;
        const name = document.getElementById('role-name').value;
        const desc = document.getElementById('role-desc').value;
        const status = document.querySelector('input[name="roleStatus"]:checked').value;
        // Get checked perms
        const selectedPerms = Array.from(document.querySelectorAll('.perm-check:checked')).map(el => el.value);
        const endpoint = roleId ? `/admin/roles/${roleId}` : '/admin/roles';
        const method = roleId ? 'PUT' : 'POST';
        try {
            const response = yield fetchAPI(endpoint, {
                method: method,
                body: JSON.stringify({
                    name: name,
                    description: desc,
                    status: status,
                    permissions: selectedPerms
                })
            });
            if (response.ok) {
                switchView('role-management-view');
                loadRoles();
            }
            else {
                alert("Failed to save role.");
            }
        }
        catch (e) {
            alert("Network error.");
        }
    });
}
function deleteRole(id, name) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to delete role: ${name}?`))
            return;
        try {
            const response = yield fetchAPI(`/admin/roles/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadRoles();
            }
            else {
                const d = yield response.json();
                alert(d.detail || "Failed to delete.");
            }
        }
        catch (e) {
            alert("Network error.");
        }
    });
}
// --- PERMISSION MANAGEMENT ---
function loadPermissionsList() {
    return __awaiter(this, void 0, void 0, function* () {
        const tableBody = document.getElementById('perms-table-body');
        if (!tableBody)
            return;
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">Loading...</td></tr>';
        try {
            const response = yield fetchAPI('/admin/permissions/list');
            if (response.ok) {
                const perms = yield response.json();
                renderPermissionsTable(perms);
            }
            else {
                tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Failed to load permissions.</td></tr>';
            }
        }
        catch (e) {
            console.error(e);
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Network Error</td></tr>';
        }
    });
}
function renderPermissionsTable(perms) {
    const tableBody = document.getElementById('perms-table-body');
    tableBody.innerHTML = '';
    perms.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge bg-light text-dark border">${p.display_code}</span></td>
            <td class="fw-medium font-monospace text-primary small">${p.code}</td>
            <td class="small text-muted">${p.description}</td>
            <td>
                ${(hasPermission('permission_management')) ?
                `<button class="btn btn-sm btn-link text-primary p-0" onclick="openPermissionEditModal(${p.id}, '${p.code}', '${p.description.replace(/'/g, "\\'")}')">
                        <span class="material-icons" style="font-size: 18px;">edit</span>
                    </button>` : ''}
            </td>
        `;
        tableBody.appendChild(tr);
    });
}
function openPermissionEditModal(id, code, desc) {
    document.getElementById('perm-edit-id').value = id;
    document.getElementById('perm-edit-code').value = `P-${String(id).padStart(4, '0')}`;
    document.getElementById('perm-edit-title').value = code;
    document.getElementById('perm-edit-desc').value = desc;
    openView('permEditModal');
}
function handleUpdatePermission() {
    return __awaiter(this, void 0, void 0, function* () {
        const id = document.getElementById('perm-edit-id').value;
        const desc = document.getElementById('perm-edit-desc').value;
        try {
            const response = yield fetchAPI(`/admin/permissions/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ description: desc })
            });
            if (response.ok) {
                closeView();
                loadPermissionsList();
            }
            else {
                alert("Failed to update permission.");
            }
        }
        catch (e) {
            alert("Network error.");
        }
    });
}

// --- Window bindings for inline HTML onclick handlers ---
window.loadRoles = loadRoles;
window.renderRolesList = renderRolesList;
window.loadRoleDetails = loadRoleDetails;
window.openRoleModal = openRoleModal;
window.loadPermissionsForModal = loadPermissionsForModal;
window.handleSaveRole = handleSaveRole;
window.deleteRole = deleteRole;
window.loadPermissionsList = loadPermissionsList;
window.renderPermissionsTable = renderPermissionsTable;
window.openPermissionEditModal = openPermissionEditModal;
window.handleUpdatePermission = handleUpdatePermission;
