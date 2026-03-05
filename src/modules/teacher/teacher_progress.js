/** teacher_progress.js — Progress Cards: Enter, Publish, Report, Student & Parent views */
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
    container.innerHTML = CB.ui.spinner('Loading progress card...');
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
    container.innerHTML = CB.ui.spinner('Loading progress card...');
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
    container.innerHTML = CB.ui.spinner('Loading progress card...');
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

// --- Window bindings for inline HTML onclick handlers ---
window.formatPct = formatPct;
window.renderProgressCard = renderProgressCard;
window.fetchProgressCard = fetchProgressCard;
window.fetchMyProgressCard = fetchMyProgressCard;
window.loadProgressReportView = loadProgressReportView;
window.loadProgressCardForStudent = loadProgressCardForStudent;
window.loadParentProgressCardView = loadParentProgressCardView;
window.loadStudentProgressCardView = loadStudentProgressCardView;
window.ensureParentProgressCardViewLayout = ensureParentProgressCardViewLayout;
