/** teacher_reports.js — Teacher Reports, Analytics Charts, Class Materials */
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

// --- Window bindings for inline HTML onclick handlers ---
window.loadReportsData = loadReportsData;
window.handleAddMaterial = handleAddMaterial;
window.loadClassMaterials = loadClassMaterials;
window.handleDeleteMaterial = handleDeleteMaterial;
