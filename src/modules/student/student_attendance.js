/** student_attendance.js — Student Attendance View */
function loadStudentAttendanceView() {
    return __awaiter(this, void 0, void 0, function* () {
        const view = document.getElementById('parent-attendance-view');
        if (!view)
            return;
        view.innerHTML = CB.ui.spinner('Loading attendance...', 'lg');
        try {
            const now = new Date();
            const selectedMonth = Number(view.dataset.selectedMonth || (now.getMonth() + 1));
            const selectedYear = Number(view.dataset.selectedYear || now.getFullYear());
            let attendanceEndpoint = `/attendance/student/my?month=${encodeURIComponent(String(selectedMonth))}&year=${encodeURIComponent(String(selectedYear))}&months_back=6`;
            if (isParentRole(appState.role) && appState.activeStudentId) {
                attendanceEndpoint += `&student_id=${encodeURIComponent(appState.activeStudentId)}`;
            }
            const res = yield fetchAPI(attendanceEndpoint);
            if (!res.ok) {
                const err = yield res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to load attendance.');
            }
            const data = yield res.json();
            const summary = data.summary || {};
            const records = Array.isArray(data.records) ? data.records : [];
            const monthly = Array.isArray(data.monthly_summary) ? data.monthly_summary : [];
            const dailyTrend = data.trend && Array.isArray(data.trend.daily) ? data.trend.daily : [];
            const monthOptions = [
                { v: 1, label: 'January' }, { v: 2, label: 'February' }, { v: 3, label: 'March' },
                { v: 4, label: 'April' }, { v: 5, label: 'May' }, { v: 6, label: 'June' },
                { v: 7, label: 'July' }, { v: 8, label: 'August' }, { v: 9, label: 'September' },
                { v: 10, label: 'October' }, { v: 11, label: 'November' }, { v: 12, label: 'December' }
            ];
            view.innerHTML = `
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
                    <h3 class="fw-bold mb-0 text-dark">My Attendance</h3>
                    <div class="d-flex gap-2 align-items-center">
                        <select id="student-att-month" class="form-select form-select-sm">
                            ${monthOptions.map(m => `<option value="${m.v}" ${m.v === selectedMonth ? 'selected' : ''}>${m.label}</option>`).join('')}
                        </select>
                        <input id="student-att-year" type="number" class="form-control form-control-sm" min="2000" max="2100" value="${selectedYear}" style="max-width: 100px;">
                        <button id="student-att-apply" class="btn btn-sm btn-primary-custom">Apply</button>
                    </div>
                </div>
                <div class="row g-3 mb-4">
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Overall Rate</div><div class="h4 fw-bold mb-0">${summary.overall_rate ?? 0}%</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Month Rate</div><div class="h4 fw-bold mb-0 text-primary">${summary.window_rate ?? 0}%</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Present</div><div class="h4 fw-bold mb-0 text-success">${summary.present || 0}</div></div></div>
                    <div class="col-md-3"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="small text-muted">Absent</div><div class="h4 fw-bold mb-0 text-danger">${summary.absent || 0}</div></div></div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
                    <h6 class="fw-bold mb-3">Present vs Absent Trend (${data.from_date || '-'} to ${data.to_date || '-'})</h6>
                    <div id="student-attendance-trend-chart" style="height: 280px;"></div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 p-3 mb-4">
                    <h6 class="fw-bold mb-3">Monthly Summary (Last ${monthly.length || 0} months)</h6>
                    <div class="table-responsive">
                        <table class="table table-sm align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-3">Month</th>
                                    <th>Present</th>
                                    <th>Absent</th>
                                    <th>Late</th>
                                    <th class="pe-3">Attendance %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${monthly.length ? monthly.map(m => `
                                    <tr>
                                        <td class="ps-3">${m.month || '-'}</td>
                                        <td>${m.present || 0}</td>
                                        <td>${m.absent || 0}</td>
                                        <td>${m.late || 0}</td>
                                        <td class="pe-3 fw-semibold">${m.attendance_rate ?? 0}%</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="5" class="text-center text-muted p-3">No monthly summary available.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                    <div class="card-header bg-white fw-semibold">Attendance Records (${data.from_date || '-'} to ${data.to_date || '-'})</div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th class="ps-3">Date</th>
                                    <th>Status</th>
                                    <th class="pe-3">Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${records.length ? records.map(r => `
                                    <tr>
                                        <td class="ps-3">${r.date || '-'}</td>
                                        <td>${r.status || '-'}</td>
                                        <td class="pe-3">${r.remarks || '-'}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3" class="text-center text-muted p-4">No attendance records found.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            const applyBtn = document.getElementById('student-att-apply');
            const monthEl = document.getElementById('student-att-month');
            const yearEl = document.getElementById('student-att-year');
            if (applyBtn && monthEl && yearEl) {
                applyBtn.onclick = () => {
                    const m = Number(monthEl.value || now.getMonth() + 1);
                    const y = Number(yearEl.value || now.getFullYear());
                    view.dataset.selectedMonth = String(m);
                    view.dataset.selectedYear = String(y);
                    loadStudentAttendanceView();
                };
            }
            const trendChart = document.getElementById('student-attendance-trend-chart');
            if (trendChart && typeof Plotly !== 'undefined' && dailyTrend.length) {
                const x = dailyTrend.map(d => d.date || '');
                const presentY = dailyTrend.map(d => Number(d.present || 0));
                const absentY = dailyTrend.map(d => Number(d.absent || 0));
                const tracePresent = { x, y: presentY, mode: 'lines+markers', type: 'scatter', name: 'Present', line: { color: '#198754', width: 2 } };
                const traceAbsent = { x, y: absentY, mode: 'lines+markers', type: 'scatter', name: 'Absent', line: { color: '#dc3545', width: 2 } };
                const layout = { margin: { t: 20, r: 20, b: 50, l: 40 }, xaxis: { title: 'Date' }, yaxis: { title: 'Flag', range: [-0.1, 1.1], dtick: 1 }, legend: { orientation: 'h' } };
                loadPlotlyAndRender(() => Plotly.newPlot(trendChart, [tracePresent, traceAbsent], layout, { displayModeBar: false, responsive: true }));
            }
        }
        catch (e) {
            view.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
        }
    });
}

// --- Window bindings for inline HTML onclick handlers ---
window.loadStudentAttendanceView = loadStudentAttendanceView;
