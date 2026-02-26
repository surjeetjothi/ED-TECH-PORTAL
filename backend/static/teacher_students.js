/** teacher_students.js — Student Management (Add/Edit/Delete), Activity, Access Card */
function handleAddStudent(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addStudentMessage.textContent = 'Adding student...';
        elements.addStudentMessage.className = 'text-primary fw-medium';
        const studentData = {
            id: document.getElementById('new-id').value,
            name: document.getElementById('new-name').value,
            password: document.getElementById('new-password').value,
            grade: parseInt(document.getElementById('new-grade').value),
            preferred_subject: document.getElementById('new-subject').value,
            home_language: document.getElementById('new-lang').value,
            attendance_rate: parseFloat(document.getElementById('new-attendance').value),
            math_score: parseFloat(document.getElementById('new-math-score').value),
            science_score: parseFloat(document.getElementById('new-science-score').value),
            english_language_score: parseFloat(document.getElementById('new-english-score').value),
        };
        try {
            const response = yield fetchAPI('/students/add', {
                method: 'POST',
                body: JSON.stringify(studentData)
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addStudentMessage.textContent = 'Student added successfully!';
                elements.addStudentMessage.className = 'text-success fw-bold';
                elements.addStudentForm.reset();
                // Close modal after a short delay
                setTimeout(() => {
                    elements.addStudentModal.hide();
                    elements.addStudentMessage.textContent = '';
                    // Refresh data and select new student
                    fetchStudents().then(() => {
                        appState.activeStudentId = studentData.id;
                        // Update Selector UI
                        const selectorDiv = document.getElementById('teacher-student-selector');
                        if (selectorDiv) {
                            renderStudentSelector(selectorDiv);
                            selectorDiv.style.display = 'block';
                        }
                        // Switch to Student View and Load Data
                        handleTeacherViewToggle('student-view'); // Ensures view is active
                        loadStudentDashboard(appState.activeStudentId);
                    });
                }, 1000);
            }
            else {
                elements.addStudentMessage.textContent = data.detail || 'Failed to add student.';
                elements.addStudentMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.addStudentMessage.textContent = error.message;
            elements.addStudentMessage.className = 'text-danger fw-bold';
        }
    });
}
// --- EDIT STUDENT LOGIC ---
function openEditStudentModal(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const modal = elements.editStudentModal;
        const form = elements.editStudentForm;
        // Clear previous
        form.reset();
        document.getElementById('edit-student-message').classList.add('d-none');
        document.getElementById('edit-id-display').textContent = 'Loading...';
        modal.show();
        try {
            // Fetch fresh data
            const response = yield fetchAPI(`/students/${studentId}/data`);
            if (!response.ok)
                throw new Error("Failed to fetch student data");
            const data = yield response.json();
            const student = appState.allStudents.find(s => s.id == studentId) || {};
            // Merge detail data with roster data if needed, but roster usually has basics
            // Actually, let's use the roster data for basics + summary for scores if available
            // Or better, fetch the raw student object if we had an endpoint. 
            // We will stick to updating what we have in the UI + scores.
            document.getElementById('edit-id').value = student.id;
            document.getElementById('edit-id-display').textContent = student.id;
            document.getElementById('edit-name').value = student.name;
            document.getElementById('edit-grade').value = student.grade;
            document.getElementById('edit-subject').value = student.preferred_subject;
            document.getElementById('edit-attendance').value = student.attendance_rate;
            document.getElementById('edit-lang').value = student.home_language || ''; // Check if home_language is in roster?
            // If home_language missing in roster object, we might need a dedicated GET /students/{id} 
            // But for now, let's assume it's in the object or we default to empty.
            // Scores - derived from summary or roster? Roster has them.
            const math = student.math_score || 0;
            const sci = student.science_score || 0;
            const eng = student.english_language_score || 0;
            document.getElementById('edit-math-score').value = math;
            document.getElementById('rng-math').value = math;
            document.getElementById('lbl-math').textContent = math + '%';
            document.getElementById('edit-science-score').value = sci;
            document.getElementById('rng-science').value = sci;
            document.getElementById('lbl-science').textContent = sci + '%';
            document.getElementById('edit-english-score').value = eng;
            document.getElementById('rng-english').value = eng;
            document.getElementById('lbl-english').textContent = eng + '%';
        }
        catch (e) {
            console.error(e);
            alert("Error loading student details: " + e.message);
            modal.hide();
        }
    });
}
// Global helper for the manual button onclick in HTML
window.submitEditStudentForm = function () {
    return __awaiter(this, void 0, void 0, function* () {
        // Trigger the submit event on the form so the listener catches it
        elements.editStudentForm.dispatchEvent(new Event('submit'));
    });
};
function handleEditStudentSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const msg = document.getElementById('edit-student-message');
        msg.classList.remove('d-none', 'text-danger', 'text-success');
        msg.textContent = 'Saving changes...';
        msg.className = 'text-center fw-medium p-2 mb-0 bg-light border-bottom text-primary';
        msg.classList.remove('d-none');
        const studentId = document.getElementById('edit-id').value;
        const updatedData = {
            name: document.getElementById('edit-name').value,
            grade: parseInt(document.getElementById('edit-grade').value),
            preferred_subject: document.getElementById('edit-subject').value,
            attendance_rate: parseFloat(document.getElementById('edit-attendance').value),
            home_language: document.getElementById('edit-lang').value,
            math_score: parseFloat(document.getElementById('edit-math-score').value),
            science_score: parseFloat(document.getElementById('edit-science-score').value),
            english_language_score: parseFloat(document.getElementById('edit-english-score').value),
            password: document.getElementById('edit-password').value || null
        };
        try {
            const response = yield fetchAPI(`/students/${studentId}`, {
                method: 'PUT', // Assuming PUT is the update method
                body: JSON.stringify(updatedData)
            });
            if (response.ok) {
                msg.textContent = 'Saved Successfully!';
                msg.classList.add('text-success');
                // Refresh Dashboard
                setTimeout(() => {
                    elements.editStudentModal.hide();
                    msg.classList.add('d-none');
                    initializeDashboard(); // Reload all lists
                }, 1000);
            }
            else {
                const data = yield response.json();
                msg.textContent = 'Error: ' + (data.detail || 'Update failed');
                msg.classList.add('text-danger');
            }
        }
        catch (error) {
            msg.textContent = 'Network Error: ' + error.message;
            msg.classList.add('text-danger');
        }
    });
}
var studentToDeleteId = null; // var: allows redecl if script.js also defines it
function handleDeleteStudent(studentId, studentName) {
    studentToDeleteId = studentId;
    document.getElementById('delete-modal-text').textContent = `Are you sure you want to delete ${studentName} (${studentId})?`;
    document.getElementById('delete-error-msg').textContent = '';
    elements.deleteConfirmationModal.show();
}
document.getElementById('confirm-delete-btn').onclick = () => __awaiter(this, void 0, void 0, function* () {
    if (!studentToDeleteId)
        return;
    const btn = document.getElementById('confirm-delete-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Deleting...";
    document.getElementById('delete-error-msg').textContent = '';
    try {
        const response = yield fetchAPI(`/students/${studentToDeleteId}`, { method: 'DELETE' });
        if (response.ok) {
            elements.deleteConfirmationModal.hide();
            initializeDashboard(); // Refresh list
            // Show small toast or alert
            const toast = document.createElement('div');
            toast.className = 'position-fixed bottom-0 end-0 p-3';
            toast.style.zIndex = '1100';
            toast.innerHTML = `
                        <div class="toast show align-items-center text-white bg-success border-0" role="alert">
                            <div class="d-flex">
                                <div class="toast-body">Student deleted successfully.</div>
                                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                            </div>
                        </div>`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        else {
            const data = yield response.json();
            let errorMsg = data.detail || 'Server error.';
            if (typeof errorMsg === 'object') {
                errorMsg = JSON.stringify(errorMsg);
            }
            document.getElementById('delete-error-msg').textContent = `Error: ${errorMsg}`;
        }
    }
    catch (error) {
        document.getElementById('delete-error-msg').textContent = `Network error: ${error.message}`;
    }
    finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});
function openStudentAddActivityModal() {
    // Security check
    if (!['Teacher', 'Admin', 'Tenant_Admin', 'Principal'].includes(appState.role) && !appState.isSuperAdmin) {
        alert("Only Teachers can log activities.");
        return;
    }
    const select = document.getElementById('activity-student-select');
    // Clear existing
    select.innerHTML = '';
    if (appState.role === 'Teacher' || appState.role === 'Admin') {
        // Enable for Teachers/Admins
        select.disabled = false;
        // Populate with all students
        if (appState.allStudents && appState.allStudents.length > 0) {
            appState.allStudents.forEach(s => {
                const option = document.createElement('option');
                // Handle different ID keys
                const id = s.id || s.ID || s.student_id;
                option.value = id;
                // Handle different Name/Grade keys and fallbacks
                const name = s.name || s.Name || s.student_name || "Unknown";
                let grade = s.grade;
                if (grade === undefined)
                    grade = s.Grade;
                if (grade === undefined)
                    grade = '?';
                option.textContent = `${name} (G${grade})`;
                // Compare with loose equality to match string vs number IDs
                if (id == appState.activeStudentId) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        }
        else {
            // Fallback if list empty
            const option = document.createElement('option');
            option.value = appState.activeStudentId;
            option.textContent = appState.activeStudentId; // Better than nothing
            option.selected = true;
            select.appendChild(option);
        }
    }
    else {
        // Disable for Students (Self-logging)
        select.disabled = true;
        const option = document.createElement('option');
        option.value = appState.activeStudentId;
        // Try to get name, fallback to ID
        option.textContent = appState.userName || appState.userId || 'Me';
        option.selected = true;
        select.appendChild(option);
    }
    // Set Date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('activity-date').value = today;
    // Reset other fields
    document.getElementById('activity-topic').value = '';
    document.getElementById('activity-score').value = '85.0';
    document.getElementById('activity-time').value = '30';
    document.getElementById('add-activity-message').textContent = '';
    // Show Modal
    elements.addActivityModal.show();
}
function handleAddActivity(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addActivityMessage.textContent = 'Logging activity...';
        elements.addActivityMessage.className = 'text-primary';
        const activityData = {
            student_id: elements.activityStudentSelect.value,
            date: document.getElementById('activity-date').value,
            topic: document.getElementById('activity-topic').value,
            difficulty: document.getElementById('activity-difficulty').value,
            score: parseFloat(document.getElementById('activity-score').value),
            time_spent_min: parseInt(document.getElementById('activity-time').value),
        };
        try {
            const response = yield fetchAPI('/activities/add', {
                method: 'POST',
                body: JSON.stringify(activityData)
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addActivityMessage.textContent = data.message;
                elements.addActivityMessage.className = 'text-success fw-bold';
                elements.addActivityForm.reset();
                if (appState.activeStudentId === activityData.student_id) {
                    yield loadStudentDashboard(appState.activeStudentId);
                }
                if (appState.role === 'Teacher' && document.getElementById('view-select').value === 'teacher-view') {
                    yield renderTeacherDashboard();
                }
            }
            else {
                elements.addActivityMessage.textContent = data.detail || 'Failed to log activity.';
                elements.addActivityMessage.className = 'text-danger';
            }
        }
        catch (error) {
            elements.addActivityMessage.className = 'text-danger';
            elements.addActivityMessage.textContent = error.message;
        }
    });
}
// --- DASHBOARD RENDERING ---
function renderTeacherDashboard() {
    return __awaiter(this, void 0, void 0, function* () {
        switchView('teacher-view');
        elements.teacherMetrics.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        elements.rosterTable.innerHTML = '';
        if (window.Plotly) Plotly.purge(elements.classPerformanceChart);
        try {
            const response = yield fetchAPI('/teacher/overview');
            if (!response.ok) {
                elements.teacherMetrics.innerHTML = '<p class="text-danger fw-bold">Error fetching data.</p>';
                return;
            }
            const data = yield response.json();
            // Populate global state for student selector
            appState.allStudents = data.roster || [];
            // Metrics
            // Metrics
            elements.teacherMetrics.innerHTML = '';
            renderMetric(elements.teacherMetrics, "dashboard_students", data.total_students, 'widget-purple');
            renderMetric(elements.teacherMetrics, "dashboard_teachers", data.total_teachers || 0, 'widget-yellow');
            renderMetric(elements.teacherMetrics, "dashboard_staff", "29,300", 'widget-blue');
            renderMetric(elements.teacherMetrics, "dashboard_awards", "95,800", 'widget-green');
            // Roster Table
            let tableHTML = '';
            data.roster.forEach(student => {
                tableHTML += `
                    <tr>
                        <td><span class="badge bg-light text-dark border">${student.ID}</span></td>
                        <td class="fw-bold text-primary-custom">${student.Name}</td>
                        <td>${student.Grade}</td>
                        <td>
                            <div class="progress" style="height: 6px; width: 60px;">
                                <div class="progress-bar bg-success" style="width: ${student['Attendance %']}%"></div>
                            </div>
                            <small>${student['Attendance %']}%</small>
                        </td>
                        <td>${student['Initial Score']}%</td>
                        <td><span class="badge ${student['Avg Activity Score'] >= 80 ? 'bg-success' : 'bg-secondary'}">${student['Avg Activity Score']}%</span></td>
                        <td>${student.Subject}</td>
                        <td>
                            <div class="d-flex gap-2 justify-content-start">
                                <button class="btn btn-sm btn-outline-primary" onclick="loadStudentDashboard('${student.ID}'); (document.getElementById('view-select') as HTMLInputElement).value='student-view'; document.getElementById('teacher-student-selector').style.display='block'; (document.getElementById('student-select') as HTMLInputElement).value='${student.ID}';" title="View Dashboard">
                                    <span class="material-icons" style="font-size: 18px;">visibility</span>
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="openEditStudentModal('${student.ID}')" title="Edit Profile">
                                    <span class="material-icons" style="font-size: 18px;">edit</span>
                                </button>
                                <button class="btn btn-sm btn-outline-dark" onclick="openAccessCardModal('${student.ID}')" title="Print Access Card">
                                    <span class="material-icons" style="font-size: 18px;">badge</span>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="handleDeleteStudent('${student.ID}', '${student.Name}')" title="Delete Student">
                                    <span class="material-icons" style="font-size: 18px;">delete</span>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            elements.rosterTable.innerHTML = tableHTML;
            document.getElementById('roster-header').innerHTML = '<th>ID</th><th>Name</th><th>Grade</th><th>Attendance</th><th>Initial Score</th><th>Avg Score</th><th>Subject</th><th>Actions</th>';
            // ... (Chart logic remains the same) ...
            const chartData = data.roster.map(s => ({
                x: s.Name,
                y: s['Avg Activity Score'],
                attendance: s['Attendance %']
            }));
            const plotData = [{
                x: chartData.map(d => d.x),
                y: chartData.map(d => d.y),
                marker: {
                    color: chartData.map(d => d.attendance),
                    colorscale: 'RdBu',
                    reversescale: true,
                    showscale: true,
                    colorbar: { title: 'Attendance %' }
                },
                type: 'bar',
                name: 'Average Activity Score'
            }];
            loadPlotlyAndRender(() => Plotly.newPlot(elements.classPerformanceChart, plotData, {
                title: 'Class Average Activity Score',
                height: 350,
                margin: { t: 40, b: 60, l: 40, r: 10 },
                xaxis: { title: 'Student Name' },
                yaxis: { title: 'Score (%)', range: [0, 100] }
            }));
        }
        catch (error) {
            console.error(error);
        }
    });
}
// --- ACCESS CARD LOGIC ---
function openAccessCardModal(studentId) {
    return __awaiter(this, void 0, void 0, function* () {
        openView('accessCardModal');
        const nameEl = document.getElementById('card-student-name');
        const idEl = document.getElementById('card-student-id');
        const listEl = document.getElementById('card-codes-list');
        nameEl.textContent = "Loading...";
        idEl.textContent = studentId;
        listEl.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div>';
        try {
            const response = yield fetchAPI(`/teacher/students/${studentId}/codes`);
            if (response.ok) {
                const data = yield response.json();
                nameEl.textContent = data.name;
                listEl.innerHTML = '';
                if (data.codes.length === 0) {
                    listEl.innerHTML = '<span class="text-danger">No active codes.</span>';
                }
                else {
                    data.codes.forEach(code => {
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-light text-dark border p-2 fs-5 font-monospace';
                        badge.textContent = code;
                        listEl.appendChild(badge);
                    });
                }
            }
            else {
                listEl.innerHTML = '<span class="text-danger">Failed to load codes.</span>';
            }
        }
        catch (e) {
            console.error(e);
            listEl.innerHTML = '<span class="text-danger">Network error.</span>';
        }
    });
}

// --- Window bindings for inline HTML onclick handlers ---
window.handleAddStudent = handleAddStudent;
window.openEditStudentModal = openEditStudentModal;
window.handleEditStudentSubmit = handleEditStudentSubmit;
window.handleDeleteStudent = handleDeleteStudent;
window.openStudentAddActivityModal = openStudentAddActivityModal;
window.handleAddActivity = handleAddActivity;
window.renderTeacherDashboard = renderTeacherDashboard;
window.openAccessCardModal = openAccessCardModal;
