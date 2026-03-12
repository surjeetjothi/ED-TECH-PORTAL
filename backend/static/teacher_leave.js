/** teacher_leave.js — Teacher Leave: Application, Approval Tabs, History */
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
            alert(data.message || 'Leave application submitted successfully! Notification sent to Tenant Admin.');
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
                                        ${req.principal_approval === 'Approved' ? '<span class="badge bg-success bg-opacity-10 text-success border" style="font-size:0.7rem;">Tenant Admin: Approved</span>' : '<span class="badge bg-secondary bg-opacity-10 text-secondary border" style="font-size:0.7rem;">Tenant Admin: Pending</span>'}
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

// --- Window bindings for inline HTML onclick handlers ---
window.loadPendingLeaves = loadPendingLeaves;
window.handleLeaveAction = handleLeaveAction;
window.handleTeacherLeaveSubmit = handleTeacherLeaveSubmit;
window.loadStudentLeaveView = loadStudentLeaveView;
window.loadMyLeaveHistory = loadMyLeaveHistory;
window.loadParentFeesView = loadParentFeesView;
window.initParentLeaveApplyView = initParentLeaveApplyView;
window.loadParentLeaveStatusView = loadParentLeaveStatusView;
window.setLeaveApprovalTab = setLeaveApprovalTab;
window.initTeacherLeaveApprovalTabs = initTeacherLeaveApprovalTabs;
window.loadTeacherLeaveApprovals = loadTeacherLeaveApprovals;
window.loadTeacherLeaveHistory = loadTeacherLeaveHistory;
window.updateLeaveStatus = updateLeaveStatus;
