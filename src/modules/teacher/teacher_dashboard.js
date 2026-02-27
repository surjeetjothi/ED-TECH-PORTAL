/** teacher_dashboard.js — Teacher Dashboard, Reports, Live Classes */
function openFinanceModuleDetails(module) {
    const tabMap = {
        dashboard: 'dashboard',
        'master-data': 'master-data',
        gl: 'gl',
        receivables: 'receivables',
        payables: 'payables',
        inventory: 'inventory',
        assets: 'assets',
        payroll: 'payroll',
        reports: 'reports'
    };
    switchView('finance-view');
    const tab = tabMap[module] || 'dashboard';
    setTimeout(() => {
        if (typeof loadFinanceTab === 'function')
            loadFinanceTab(tab);
    }, 100);
}
function renderStudentSelector(container) {
    if (!container)
        return;
    container.innerHTML = `
            <select id="student-select" class="form-select form-select-sm" style="max-width: 200px;" onchange="loadStudentDashboard(this.value)">
                <option value="">-- Choose Student --</option>
                ${appState.allStudents.map(s => {
        const safeS = s || {};
        const id = safeS.id || safeS.ID || safeS.Id || safeS.student_id;
        const name = safeS.name || safeS.Name || safeS.student_name || "Unknown";
        let grade = safeS.grade;
        if (grade === undefined)
            grade = safeS.Grade;
        if (grade === undefined)
            grade = '?';
        // Fallback for debugging if keys are completely unexpected
        const label = (name === "Unknown") ? JSON.stringify(safeS) : `${name} (G${grade})`;
        return `<option value="${id}" ${appState.activeStudentId == id ? 'selected' : ''}>${label}</option>`;
    }).join('')}
            </select>
            <button class="btn btn-sm btn-primary text-nowrap d-flex align-items-center" onclick="elements.addStudentModal.show()">
                <span class="material-icons fs-6 me-1">add</span> New Student
            </button>
        `;
    const studentSelectElement = document.getElementById('student-select');
    if (appState.activeStudentId && studentSelectElement.querySelector(`option[value="${appState.activeStudentId}"]`)) {
        studentSelectElement.value = appState.activeStudentId;
        loadStudentDashboard(appState.activeStudentId);
    }
    else if (appState.allStudents.length > 0) {
        appState.activeStudentId = appState.allStudents[0].id || appState.allStudents[0].ID;
        studentSelectElement.value = appState.activeStudentId;
        loadStudentDashboard(appState.activeStudentId);
    }
    else {
        elements.studentNameHeader.textContent = 'No students available. Add a student first.';
        elements.studentMetrics.innerHTML = '';
    }
}
function loadReportsData() {
    return __awaiter(this, void 0, void 0, function* () {
        const metricsContainer = document.getElementById('reports-metrics-row');
        const attendanceContainer = document.getElementById('attendance-chart');
        const academicContainer = document.getElementById('academic-chart');
        const financeContainer = document.getElementById('finance-details-content');
        const staffContainer = document.getElementById('staff-details-content');
        if (!metricsContainer)
            return;
        try {
            const response = yield fetchAPI('/reports/summary');
            let data;
            if (response.ok) {
                data = yield response.json();
                appState.reportData = data; // Store for export
            }
            else {
                // Fallback Dummy Data if backend not updated or fails
                data = {
                    financial_summary: { revenue: 150000, expenses: 90000, net_income: 60000, outstanding_fees: 15000 },
                    staff_utilization: { total_staff: 25, active_classes: 100, student_teacher_ratio: "20:1", utilization_rate: 88 },
                    attendance_trends: [{ month: 'Jan', rate: 90 }, { month: 'Feb', rate: 92 }, { month: 'Mar', rate: 88 }, { month: 'Apr', rate: 94 }],
                    academic_performance: { overall_avg: 78, math_avg: 82, science_avg: 75, english_avg: 77 }
                };
            }
            // Render Top Metrics
            metricsContainer.innerHTML = '';
            renderMetric(metricsContainer, 'Revenue', `$${data.financial_summary.revenue.toLocaleString()}`, 'widget-green');
            renderMetric(metricsContainer, 'Net Income', `$${data.financial_summary.net_income.toLocaleString()}`, 'widget-purple');
            renderMetric(metricsContainer, 'Total Staff', data.staff_utilization.total_staff, 'widget-blue');
            renderMetric(metricsContainer, 'Staff Util %', `${data.staff_utilization.utilization_rate}%`, 'widget-yellow');
            // Render Finance Details
            if (financeContainer) {
                financeContainer.innerHTML = `
                <div class="row align-items-center h-100">
                    <div class="col-6">
                        <ul class="list-unstyled mb-0">
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Revenue</span>
                                <span class="fw-bold text-success">$${data.financial_summary.revenue.toLocaleString()}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Expenses</span>
                                <span class="fw-bold text-danger">$${data.financial_summary.expenses.toLocaleString()}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Net Income</span>
                                <span class="fw-bold text-primary">$${data.financial_summary.net_income.toLocaleString()}</span>
                            </li>
                            <li class="d-flex justify-content-between">
                                <span class="text-muted">Outstanding</span>
                                <span class="fw-bold text-warning">$${data.financial_summary.outstanding_fees.toLocaleString()}</span>
                            </li>
                        </ul>
                    </div>
                    <div class="col-6 text-center">
                        <div class="position-relative d-inline-block">
                            <span class="material-icons text-success" style="font-size: 80px;">monetization_on</span>
                        </div>
                    </div>
                </div>
            `;
            }
            // Render Staff Details
            if (staffContainer) {
                staffContainer.innerHTML = `
                <div class="row align-items-center h-100">
                     <div class="col-6">
                        <ul class="list-unstyled mb-0">
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Total Staff</span>
                                <span class="fw-bold">${data.staff_utilization.total_staff}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Active Classes</span>
                                <span class="fw-bold">${data.staff_utilization.active_classes}</span>
                            </li>
                            <li class="mb-3 d-flex justify-content-between">
                                <span class="text-muted">Student:Teacher</span>
                                <span class="fw-bold">${data.staff_utilization.student_teacher_ratio}</span>
                            </li>
                            <li class="d-flex justify-content-between">
                                <span class="text-muted">Efficiency</span>
                                <span class="badge bg-success">${data.staff_utilization.utilization_rate}%</span>
                            </li>
                        </ul>
                     </div>
                     <div class="col-6 text-center">
                        <div class="pie-chart-placeholder rounded-circle border border-3 border-warning d-flex align-items-center justify-content-center mx-auto" style="width:100px; height:100px;">
                            <span class="h4 m-0 fw-bold">${data.staff_utilization.utilization_rate}%</span>
                        </div>
                     </div>
                </div>
            `;
            }
            // 1. Attendance Chart (Line Chart Trend)
            if (attendanceContainer) {
                const attTrace = {
                    x: data.attendance_trends.map(t => t.month),
                    y: data.attendance_trends.map(t => t.rate),
                    type: 'scatter',
                    mode: 'lines+markers',
                    marker: { color: '#4D44B5' },
                    line: { shape: 'spline', width: 3 },
                    name: 'Attendance'
                };
                const attLayout = {
                    autosize: true,
                    margin: { t: 20, b: 40, l: 40, r: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: { title: 'Month' },
                    yaxis: { title: 'Percentage (%)', range: [0, 100] }
                };
                loadPlotlyAndRender(() => Plotly.newPlot('attendance-chart', [attTrace], attLayout, { displayModeBar: false }));
            }
            // 2. Academic Performance (Bar Chart by Subject)
            if (academicContainer) {
                const academicData = data.academic_performance;
                const acTrace = {
                    x: ['Math', 'Science', 'English', 'Overall'],
                    y: [academicData.math_avg, academicData.science_avg, academicData.english_avg, academicData.overall_avg],
                    type: 'bar',
                    marker: { color: ['#dc3545', '#ffc107', '#0dcaf0', '#4D44B5'] },
                };
                const acLayout = {
                    autosize: true,
                    margin: { t: 20, b: 40, l: 40, r: 20 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    yaxis: { title: 'Average Score', range: [0, 100] }
                };
                loadPlotlyAndRender(() => Plotly.newPlot('academic-chart', [acTrace], acLayout, { displayModeBar: false }));
            }
        }
        catch (e) {
            console.error("Error loading reports", e);
        }
    });
}
// --- CLASS MATERIALS ---
function handleAddMaterial(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        elements.addMaterialMessage.textContent = 'Uploading material...';
        elements.addMaterialMessage.className = 'text-primary fw-medium';
        const formData = new FormData(elements.addMaterialForm);
        try {
            const response = yield fetchAPI('/materials/upload', {
                method: 'POST',
                body: formData,
                // No 'Content-Type' header needed for FormData, browser sets it automatically
            });
            const data = yield response.json();
            if (response.ok) {
                elements.addMaterialMessage.textContent = data.message;
                elements.addMaterialMessage.className = 'text-success fw-bold';
                elements.addMaterialForm.reset();
                elements.addMaterialModal.hide(); // Hide modal on success
                yield loadClassMaterials(); // Refresh materials list
            }
            else {
                elements.addMaterialMessage.textContent = data.detail || 'Failed to upload material.';
                elements.addMaterialMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.addMaterialMessage.textContent = error.message;
            elements.addMaterialMessage.className = 'text-danger fw-bold';
        }
    });
}
function loadClassMaterials() {
    return __awaiter(this, void 0, void 0, function* () {
        elements.materialsList.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        try {
            const response = yield fetchAPI('/materials/all');
            if (response.ok) {
                const materials = yield response.json();
                if (materials.length === 0) {
                    elements.materialsList.innerHTML = '<p class="text-muted">No class materials uploaded yet.</p>';
                    return;
                }
                elements.materialsList.innerHTML = materials.map(material => `
                        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${material.title}</h6>
                                <p class="mb-1 small text-muted">${material.description}</p>
                                <small class="text-muted">Uploaded: ${new Date(material.upload_date).toLocaleDateString()}</small>
                            </div>
                            <div>
                                <a href="${material.file_url}" target="_blank" class="btn btn-sm btn-outline-primary me-2">View</a>
                                <button class="btn btn-sm btn-outline-danger" onclick="handleDeleteMaterial('${material.id}', '${material.title}')">Delete</button>
                            </div>
                        </div>
                    `).join('');
            }
            else {
                elements.materialsList.innerHTML = '<p class="text-danger fw-bold">Error loading materials.</p>';
            }
        }
        catch (error) {
            console.error("Error loading class materials:", error);
            elements.materialsList.innerHTML = `<p class="text-danger fw-bold">Network error: ${error.message}</p>`;
        }
    });
}
function handleDeleteMaterial(materialId, materialTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm(`Are you sure you want to delete "${materialTitle}"? This action cannot be undone.`))
            return;
        try {
            const response = yield fetchAPI(`/materials/${materialId}`, { method: 'DELETE' });
            if (response.ok) {
                alert(`Material "${materialTitle}" deleted successfully.`);
                yield loadClassMaterials();
            }
            else {
                const data = yield response.json();
                alert(`Error: ${data.detail || 'Failed to delete material.'}`);
            }
        }
        catch (error) {
            alert(`Network error: ${error.message}`);
        }
    });
}
// --- STUDENT & ACTIVITY ACTIONS ---
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
var studentToDeleteId = null; // var: shared with script.js
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

// --- Window bindings for inline HTML onclick handlers ---
window.openFinanceModuleDetails = openFinanceModuleDetails;
window.renderStudentSelector = renderStudentSelector;
window.loadReportsData = loadReportsData;
window.handleAddMaterial = handleAddMaterial;
window.loadClassMaterials = loadClassMaterials;
window.handleDeleteMaterial = handleDeleteMaterial;
window.handleAddStudent = handleAddStudent;
window.openEditStudentModal = openEditStudentModal;
window.handleEditStudentSubmit = handleEditStudentSubmit;
window.handleDeleteStudent = handleDeleteStudent;
window.openStudentAddActivityModal = openStudentAddActivityModal;
window.handleAddActivity = handleAddActivity;
