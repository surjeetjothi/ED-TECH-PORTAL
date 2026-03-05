/** teacher_assignments.js — Assignment Creation, Review Queue, Marks Entry */
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
        list.innerHTML = CB.ui.spinner('Loading assignments...');
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
            if (!assignments || assignments.length === 0) {
                list.innerHTML = `<p class="text-muted text-center py-4">${t('msg_no_assignments')}</p>`;
                return;
            }
            list.innerHTML = assignments.map(a => {
                const due = formatDueDate(a.due_date);
                const sectionLabel = a.section_name ? `Section: ${a.section_name}` : (a.grade_level ? `Grade ${a.grade_level}` : 'All Grades');
                const submissions = typeof a.submission_count === 'number' ? `${a.submission_count} Submission${a.submission_count === 1 ? '' : 's'}` : '';
                const actionBtn = canCreateAssignments()
                    ? `<button class="btn btn-sm btn-outline-dark rounded-pill" onclick="viewSubmissions(${a.id})">${t('btn_view_submissions')}</button>`
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
                            <p class="text-muted small mb-2">${a.description || 'No description provided.'}</p>
                            <div class="d-flex flex-wrap gap-3 text-muted small mb-3">
                                <span>Due: ${due}</span>
                                <span>Points: ${a.points || 0}</span>
                                ${submissions ? `<span>${submissions}</span>` : ''}
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
        list.innerHTML = CB.ui.spinner('Loading...');
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
                    list.innerHTML = CB.ui.empty('No assignments yet.', 'assignment');
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
            list.innerHTML = CB.ui.error('Failed to load assignments.');
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
        const data = {
            title: document.getElementById('asg-title').value.trim(),
            description: document.getElementById('asg-desc').value.trim(),
            points: parseInt(document.getElementById('asg-points').value),
            due_date: document.getElementById('asg-date').value,
            grade_level: gradeEl ? parseInt(gradeEl.value) : null,
            section_id: sectionEl && sectionEl.value ? parseInt(sectionEl.value) : null
        };
        if (!data.grade_level && data.section_id && sectionEl) {
            const opt = sectionEl.options[sectionEl.selectedIndex];
            if (opt && opt.dataset && opt.dataset.grade) {
                data.grade_level = parseInt(opt.dataset.grade);
            }
        }
        if (!data.title || !data.due_date || !data.grade_level) {
            if (messageEl) {
                messageEl.textContent = t('msg_fill_assignment_fields');
                messageEl.classList.remove('d-none');
            }
            else {
                alert(t('msg_fill_assignment_fields'));
            }
            return;
        }
        if (!Number.isFinite(data.points) || data.points <= 0) {
            data.points = 100;
        }
        try {
            const res = yield fetchAPI(`/assignments`, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (res.ok) {
                // Navigate back to the assignments list and reload
                switchView('assignment-view-view');
                loadAssignments();
            }
            else {
                let msg = t('msg_create_assignment_failed');
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const payload = yield res.json().catch(() => ({}));
                    msg = payload.detail || msg;
                }
                else {
                    const text = yield res.text().catch(() => '');
                    if (text)
                        msg = text;
                }
                if (messageEl) {
                    messageEl.textContent = msg;
                    messageEl.classList.remove('d-none');
                }
                else {
                    alert(msg);
                }
            }
        }
        catch (e) {
            console.error(e);
            if (messageEl) {
                messageEl.textContent = t('msg_create_assignment_network_error');
                messageEl.classList.remove('d-none');
            }
            else {
                alert(t('msg_create_assignment_network_error'));
            }
        }
    });
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
                CB.ui.toast('Assignment submitted successfully!', 'success');
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

// --- Window bindings for inline HTML onclick handlers ---
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
window.openSubmitModal = openSubmitModal;
window.handleSubmitAssignment = handleSubmitAssignment;
window.viewSubmissions = viewSubmissions;
window.saveGrade = saveGrade;
window.reassignSubmission = reassignSubmission;
