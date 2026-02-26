/** student_dashboard.js — Student Dashboard Data Loading */
function loadStudentDashboard(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!studentId)
            return;
        appState.activeStudentId = studentId;
        switchView('student-view');
        // Restrict "Log Activity" button to Teachers/Admins only
        const logBtn = document.getElementById('student-log-activity-btn');
        if (logBtn) {
            if (['Teacher', 'Admin', 'Tenant_Admin', 'Principal'].includes(appState.role) || appState.isSuperAdmin) {
                logBtn.classList.remove('d-none');
            }
            else {
                logBtn.classList.add('d-none');
            }
        }
        const student = appState.allStudents.find(s => s.id == studentId) || { name: studentId, grade: '?', attendance_rate: '?' };
        // --- Dynamic Greeting ---
        const greetingEl = document.getElementById('student-greeting-text');
        const nameHeaderEl = document.getElementById('student-name-header');
        if (greetingEl) {
            const hour = new Date().getHours();
            const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
            const greetWord = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
            greetingEl.textContent = `${greetWord} ${greetEmoji}`;
        }
        if (nameHeaderEl) {
            nameHeaderEl.innerHTML = `Welcome back, <span style="color:#28245D;">${student.name}</span> <span class="badge ms-2 align-middle" style="background:#28245D;font-size:0.65rem;vertical-align:middle;">Grade ${student.grade}</span>`;
        }
        const metricsContainer = document.getElementById('student-metrics');
        if (metricsContainer) {
            metricsContainer.innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted small">Loading your dashboard...</p></div>';
        }
        if (elements.recommendationBox)
            elements.recommendationBox.style.display = 'none';
        if (elements.chatMessagesContainer)
            elements.chatMessagesContainer.innerHTML = appState.chatMessages[studentId] || '';
        try {
            console.log(`Fetching data for student: ${studentId}`);
            const response = yield fetchAPI(`/students/${studentId}/data`);
            if (!response.ok) {
                const errData = yield response.json().catch(() => ({}));
                throw new Error(errData.detail || `Failed to load data (${response.status})`);
            }
            const data = yield response.json();
            console.log("Student Data Received:", data);
            const summary = data.summary;
            const history = data.history;
            // --- Render Premium Gradient Stat Cards ---
            if (metricsContainer) {
                metricsContainer.innerHTML = '';
                const cards = [
                    { label: 'Overall Activity Avg', value: `${summary.avg_score || 0}%`, icon: 'trending_up', bg: 'linear-gradient(135deg, #4f8ef7 0%, #3b75e0 100%)', shadow: 'rgba(79,142,247,0.35)' },
                    { label: 'Total Activities', value: summary.total_activities || 0, icon: 'assignment_turned_in', bg: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)', shadow: 'rgba(168,85,247,0.35)' },
                    { label: 'Attendance Rate', value: `${student.attendance_rate || 0}%`, icon: 'event_available', bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', shadow: 'rgba(34,197,94,0.35)' },
                    { label: 'Math Score', value: `${summary.math_score || 0}%`, icon: 'calculate', bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', shadow: 'rgba(245,158,11,0.35)' },
                    { label: 'Science Score', value: `${summary.science_score || 0}%`, icon: 'science', bg: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', shadow: 'rgba(244,63,94,0.35)' },
                    { label: 'English Score', value: `${summary.english_language_score || 0}%`, icon: 'menu_book', bg: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', shadow: 'rgba(239,68,68,0.35)' }
                ];
                cards.forEach(card => {
                    const col = document.createElement('div');
                    col.className = 'col-lg-4 col-md-6 col-6';
                    col.innerHTML = `
                        <div class="rounded-4 p-3 p-md-4 position-relative overflow-hidden"
                            style="background:${card.bg}; box-shadow: 0 6px 20px ${card.shadow}; min-height:120px;">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <div class="text-white fw-bold" style="font-size:1.9rem;line-height:1.1;">${card.value}</div>
                                    <div class="text-white mt-2" style="font-size:0.82rem;opacity:0.9;font-weight:500;">${card.label}</div>
                                </div>
                                <div class="rounded-3 d-flex align-items-center justify-content-center flex-shrink-0"
                                    style="width:48px;height:48px;background:rgba(255,255,255,0.18);">
                                    <span class="material-icons text-white" style="font-size:26px;opacity:0.85;">${card.icon}</span>
                                </div>
                            </div>
                            <div class="position-absolute rounded-circle" style="width:80px;height:80px;background:rgba(255,255,255,0.07);bottom:-20px;right:-20px;"></div>
                        </div>`;
                    metricsContainer.appendChild(col);
                });
            }
            if (summary.recommendation && elements.recommendationBox) {
                elements.recommendationBox.style.display = 'block';
                elements.recommendationBox.innerHTML = `<strong>💡 Recommendation:</strong> ${summary.recommendation}`;
            }
            // GAMIFICATION RENDER
            const xp = student.xp || 0;
            const level = Math.floor(xp / 100) + 1;
            const progress = xp % 100;
            const badges = student.badges || [];
            const levelEl = document.getElementById('student-level');
            const xpEl = document.getElementById('student-xp');
            const barEl = document.getElementById('student-xp-bar');
            const badgesContainer = document.getElementById('student-badges');
            if (levelEl) levelEl.textContent = String(level);
            if (xpEl) xpEl.textContent = xp;
            if (barEl) {
                barEl.style.width = `${progress}%`;
                barEl.setAttribute('aria-valuenow', String(progress));
            }
            if (badgesContainer) {
                badgesContainer.innerHTML = '';
                if (badges.length === 0) {
                    badgesContainer.innerHTML = '<span class="text-white-50 small fst-italic">No badges yet. Keep studying!</span>';
                }
                else {
                    badges.forEach(badge => {
                        let icon = 'military_tech';
                        let color = 'text-warning';
                        if (badge === 'Rookie') { icon = 'star_rate'; color = 'text-light'; }
                        if (badge === 'Scholar') { icon = 'school'; color = 'text-info'; }
                        if (badge === 'High Achiever') { icon = 'emoji_events'; color = 'text-warning'; }
                        const span = document.createElement('span');
                        span.className = 'badge bg-white text-dark shadow-sm d-flex align-items-center gap-1';
                        span.innerHTML = `<span class="material-icons ${color} fs-6">${icon}</span> ${badge}`;
                        badgesContainer.appendChild(span);
                    });
                }
            }
            // History Table
            let historyHTML = '';
            if (history.length > 0) {
                history.forEach(act => {
                    historyHTML += `<tr>
                        <td class="small">${act.date}</td>
                        <td class="small">${act.topic}</td>
                        <td><span class="badge rounded-pill ${act.difficulty === 'Hard' ? 'bg-danger' : act.difficulty === 'Medium' ? 'bg-warning text-dark' : 'bg-success'}">${act.difficulty}</span></td>
                        <td class="fw-bold">${act.score}%</td>
                        <td class="small text-muted">${act.time_spent_min} min</td>
                    </tr>`;
                });
            }
            else {
                historyHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No activity history available.</td></tr>';
            }
            if (elements.historyTable)
                elements.historyTable.innerHTML = historyHTML;
            // Progress Chart (Plotly - improved)
            if (elements.studentProgressChart) {
                const dates = history.map(h => h.date);
                const scores = history.map(h => h.score);
                const trace = {
                    x: dates, y: scores,
                    mode: 'lines+markers', type: 'scatter', name: 'Score',
                    line: { color: '#4f46e5', width: 2.5, shape: 'spline' },
                    marker: { size: 5, color: '#4f46e5' },
                    fill: 'tozeroy', fillcolor: 'rgba(79,70,229,0.07)'
                };
                const layout = {
                    title: 'Activity Score History', height: 300,
                    margin: { t: 40, b: 60, l: 45, r: 15 },
                    xaxis: { title: 'Date', gridcolor: '#f0f0f0' },
                    yaxis: { title: 'Score (%)', range: [0, 100], gridcolor: '#f0f0f0' },
                    plot_bgcolor: '#ffffff', paper_bgcolor: '#ffffff',
                    font: { family: 'Inter, sans-serif', size: 12, color: '#555' }
                };
                try {
                    loadPlotlyAndRender(() => Plotly.newPlot(elements.studentProgressChart, [trace], layout, { responsive: true, displayModeBar: false }));
                }
                catch (e) {
                    console.error("Plotly Error:", e);
                    elements.studentProgressChart.innerHTML = '<p class="text-danger text-center pt-5">Failed to load chart.</p>';
                }
            }
            // LMS: Load Groups & Assignments
            loadStudentGroups();
            loadStudentDashboardAssignments(studentId);
            loadStudentQuizResults(studentId);
        }
        catch (error) {
            console.error("Dashboard Load Error:", error);
            if (metricsContainer) {
                metricsContainer.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger shadow-sm rounded-4">
                        <h4 class="alert-heading"><span class="material-icons align-middle">error</span> Error Loading Dashboard</h4>
                        <p>${error.message}</p><hr>
                        <button class="btn btn-sm btn-outline-danger" onclick="loadStudentDashboard('${studentId}')">Retry</button>
                    </div>
                </div>`;
            }
        }
        scrollChatToBottom();
    });
}

function loadStudentDashboardAssignments(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('student-upcoming-assignments');
        if (!container)
            return;
        container.innerHTML = '<p class="text-muted small">Loading assignments...</p>';
        try {
            const res = yield fetchAPI(`/students/${studentId}/assignments`);
            if (res.ok) {
                const assignments = yield res.json();
                if (assignments.length === 0) {
                    container.innerHTML = '<p class="text-muted small">Hooray! No pending assignments.</p>';
                    return;
                }
                container.innerHTML = assignments.map(a => `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div class="flex-grow-1">
                        <div class="fw-semibold">${a.title}</div>
                        <div class="small text-muted">
                            <span class="badge bg-light text-dark border me-1">${a.course_name || 'Assignment'}</span>
                            ${a.due_date ? `Due: <span class="text-danger fw-bold">${a.due_date}</span>` : ''}
                        </div>
                    </div>
                    <div class="ms-2">
                        ${a.type === 'Quiz' ?
                        `<button class="btn btn-sm btn-primary" onclick="takeQuiz('${a.id}')">Start Quiz</button>` :
                        `<button class="btn btn-sm btn-success" onclick="openSubmitModal(${a.id}, '${(a.title || '').replace(/'/g, "\\'")}', 'student-view')">
                                <span class="material-icons align-middle" style="font-size:14px;">send</span> Submit
                            </button>`
                    }
                    </div>
                </div>
            `).join('');
            }
            else {
                container.innerHTML = '<p class="text-danger small">Failed to load assignments.</p>';
            }
        }
        catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-danger small">Error loading assignments.</p>';
        }
    });

}
function loadStudentQuizResults(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('student-quiz-results-list');
        if (!container)
            return;
        container.innerHTML = '<p class="text-muted small">Loading results...</p>';
        try {
            const res = yield fetchAPI(`/students/${studentId}/quiz-results`);
            if (res.ok) {
                const results = yield res.json();
                if (results.length === 0) {
                    container.innerHTML = '<p class="text-muted small">No quiz results found.</p>';
                    return;
                }
                container.innerHTML = results.map((r, i) => `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold">${r.module_title || 'Untitled Quiz'}</div>
                        <div class="small text-muted">
                            <span class="badge bg-light text-dark border me-1">${r.course_title || 'Course'}</span>
                        </div>
                    </div>
                     <div class="text-end">
                        <span class="d-block fw-bold ${r.score >= 50 ? 'text-success' : 'text-danger'}">${Math.round(r.score)}%</span>
                        <span class="badge bg-secondary-subtle text-secondary border">${r.status}</span>
                    </div>
                </div>
            `).join('');
            }
            else {
                container.innerHTML = '<p class="text-danger small">Failed to load results.</p>';
            }
        }
        catch (e) {
            console.error(e);
            container.innerHTML = '<p class="text-danger small">Error loading results.</p>';
        }
    });
}


// --- Window bindings for inline HTML onclick handlers ---
window.loadStudentDashboard = loadStudentDashboard;
window.loadStudentDashboardAssignments = loadStudentDashboardAssignments;
window.loadStudentQuizResults = loadStudentQuizResults;
