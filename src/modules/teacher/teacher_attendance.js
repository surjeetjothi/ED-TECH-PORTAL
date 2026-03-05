/** teacher_attendance.js — Attendance Management (Take, Save, View Sheet) */
function openAttendanceModal() {
    // Set default date to today
    document.getElementById('att-date').valueAsDate = new Date();
    // Default grade 1?
    document.getElementById('att-target-grade').value = "1";
    openView('takeAttendanceModal');
    loadAttendanceList();
}
function getAttendanceLocalKey(date, grade) {
    return `attendance_local_${date}_${grade}`;
}
function getAttendanceFallbackData(grade, date, externalStudents = null) {
    const gradeNum = parseInt(String(grade), 10);
    const source = Array.isArray(externalStudents) && externalStudents.length > 0
        ? externalStudents
        : (appState.allStudents || []);
    const pool = source.filter(s => Number(s.grade) === gradeNum);
    const demoPool = [
        { id: `G${grade}-001`, name: `Student ${grade}-A`, grade: gradeNum },
        { id: `G${grade}-002`, name: `Student ${grade}-B`, grade: gradeNum },
        { id: `G${grade}-003`, name: `Student ${grade}-C`, grade: gradeNum }
    ];
    const base = pool.length > 0 ? pool : demoPool;
    let local = [];
    try {
        local = JSON.parse(localStorage.getItem(getAttendanceLocalKey(date, grade)) || '[]');
    }
    catch (_e) {
        local = [];
    }
    const localMap = new Map(local.map(r => [r.student_id, r]));
    return base.map(s => {
        const id = s.id || s.student_id;
        const override = localMap.get(id);
        return {
            id: id,
            name: s.name || 'Student',
            photo_url: s.photo_url || null,
            status: override ? override.status : 'Not Marked',
            remarks: override ? (override.remarks || '') : ''
        };
    });
}
async function fetchAttendanceStudentsByGrade(grade) {
    const gradeNum = parseInt(String(grade), 10);

    const fromAllStudents = (arr) => (arr || []).filter(s => {
        const role = String(s.role || '').toLowerCase();
        return Number(s.grade) === gradeNum && (!role || role === 'student');
    });

    if (Array.isArray(appState.allStudents) && appState.allStudents.length > 0) {
        const local = fromAllStudents(appState.allStudents);
        if (local.length > 0) return local;
    }

    try {
        const res = await fetchAPI('/students/all');
        if (res.ok) {
            const all = await res.json();
            const filtered = fromAllStudents(all);
            if (filtered.length > 0) {
                appState.allStudents = all;
                return filtered;
            }
        }
    } catch (_e) { }

    try {
        const res = await fetchAPI('/teacher/overview');
        if (res.ok) {
            const data = await res.json();
            const roster = (data && data.roster) ? data.roster : [];
            const filtered = fromAllStudents(roster);
            if (filtered.length > 0) return filtered;
        }
    } catch (_e) { }

    return [];
}
function saveAttendanceFallback(date, grade, records) {
    localStorage.setItem(getAttendanceLocalKey(date, grade), JSON.stringify(records || []));
}
function loadAttendanceList() {
    return __awaiter(this, void 0, void 0, function* () {
        const grade = document.getElementById('att-target-grade').value;
        const date = document.getElementById('att-date').value;
        const tbody = document.getElementById('attendance-list-body');
        tbody.innerHTML = CB.ui.tableSpinner(3);
        try {
            const res = yield fetchAPI(`/attendance/class/${grade}?date=${date}`);
            const data = yield res.json();
            tbody.innerHTML = '';
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4">No students found for this class.</td></tr>';
                return;
            }
            data.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold" style="width: 40px; height: 40px;">
                            ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${s.name}</div>
                            <div class="small text-muted">ID: ${s.id}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                     <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_p_${s.id}" value="Present" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="att_p_${s.id}">Present</label>

                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_a_${s.id}" value="Absent" ${s.status === 'Absent' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger btn-sm" for="att_a_${s.id}">Absent</label>

                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_l_${s.id}" value="Late" ${s.status === 'Late' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm" for="att_l_${s.id}">Late</label>
                    </div>
                </td>
                <td class="pe-4">
                    <input type="text" class="form-control form-control-sm" id="att_rem_${s.id}" placeholder="Note (optional)..." value="${s.remarks || ''}">
                </td>
            `;
                tbody.appendChild(tr);
            });
        }
        catch (e) {
            const serverStudents = yield fetchAttendanceStudentsByGrade(grade);
            const fallback = getAttendanceFallbackData(grade, date, serverStudents);
            tbody.innerHTML = '';
            if (fallback.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger p-4">Error: ${e.message}</td></tr>`;
                return;
            }
            fallback.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold" style="width: 40px; height: 40px;">
                            ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div class="fw-bold text-dark">${s.name}</div>
                            <div class="small text-muted">ID: ${s.id}</div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                     <div class="btn-group" role="group">
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_p_${s.id}" value="Present" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                        <label class="btn btn-outline-success btn-sm" for="att_p_${s.id}">Present</label>
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_a_${s.id}" value="Absent" ${s.status === 'Absent' ? 'checked' : ''}>
                        <label class="btn btn-outline-danger btn-sm" for="att_a_${s.id}">Absent</label>
                        <input type="radio" class="btn-check" name="att_status_${s.id}" id="att_l_${s.id}" value="Late" ${s.status === 'Late' ? 'checked' : ''}>
                        <label class="btn btn-outline-warning btn-sm" for="att_l_${s.id}">Late</label>
                    </div>
                </td>
                <td class="pe-4">
                    <input type="text" class="form-control form-control-sm" id="att_rem_${s.id}" placeholder="Note (optional)..." value="${s.remarks || ''}">
                </td>`;
                tbody.appendChild(tr);
            });
            const notice = document.createElement('tr');
            notice.innerHTML = `<td colspan="3" class="text-center text-warning small py-2">Attendance API is unavailable. Showing real student records from backup source.</td>`;
            tbody.appendChild(notice);
        }
    });
}
function bulkSetAttendance(status) {
    const radios = document.querySelectorAll(`input[value="${status}"]`);
    radios.forEach(r => r.click()); // Simulate click to update UI if needed, or check
    radios.forEach(r => r.checked = true);
}
function getAttendanceSaveError(response) {
    return __awaiter(this, void 0, void 0, function* () {
        let detail = '';
        try {
            const raw = yield response.text();
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    detail = parsed.detail || parsed.message || raw;
                }
                catch (_a) {
                    detail = raw;
                }
            }
        }
        catch (_b) { }
        return `HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
    });
}
function saveAttendanceRecord() {
    return __awaiter(this, void 0, void 0, function* () {
        const date = document.getElementById('att-date').value;
        const grade = document.getElementById('att-target-grade').value;
        const records = [];
        if (!date) {
            alert("Please select a valid attendance date before saving.");
            return;
        }
        // Collect data
        const rows = document.getElementById('attendance-list-body').querySelectorAll('tr');
        rows.forEach(tr => {
            const idDiv = tr.querySelector('.small.text-muted');
            if (!idDiv)
                return;
            const sid = (idDiv.textContent.split(': ')[1] || '').trim();
            if (!sid)
                return;
            const statusInput = tr.querySelector('input[type="radio"]:checked');
            if (!statusInput)
                return;
            const status = statusInput.value;
            const remarksInput = tr.querySelector('input[type="text"]');
            const remarks = remarksInput ? remarksInput.value : '';
            records.push({ student_id: sid, status, remarks });
        });
        if (records.length === 0) {
            alert("No attendance rows found to save.");
            return;
        }
        const btn = document.querySelector('button[onclick="saveAttendanceRecord()"]');
        const original = btn ? btn.innerHTML : 'Save Record';
        try {
            if (btn) {
                CB.ui.btnLoading(btn, 'Saving...');
            }
            const res = yield fetchAPI('/attendance/bulk', {
                method: 'POST',
                body: JSON.stringify({ date, records })
            });
            if (!res.ok) {
                throw new Error(yield getAttendanceSaveError(res));
            }
            const data = yield res.json().catch(() => ({}));
            const saved = Number(data.saved || 0);
            const skipped = Number(data.skipped || 0);
            const studentNotified = Number(data.student_notified || 0);
            const parentNotified = Number(data.parent_notified || 0);
            if (btn) {
                btn.innerHTML = `Saved (${saved})`;
                btn.classList.replace('btn-primary-custom', 'btn-success');
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.replace('btn-success', 'btn-primary-custom');
                }, 2200);
            }
            alert(`Attendance saved: ${saved} record(s). Skipped: ${skipped}. Notifications sent -> Students: ${studentNotified}, Parents: ${parentNotified}.`);
        }
        catch (e) {
            const msg = (e && e.message) ? e.message : 'Unknown error';
            if (msg.startsWith('HTTP')) {
                if (btn) {
                    btn.innerHTML = original;
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary-custom');
                }
                alert(`Attendance save failed: ${msg}`);
                return;
            }
            saveAttendanceFallback(date, grade, records);
            if (btn) {
                btn.innerHTML = original;
                btn.classList.remove('btn-success');
                btn.classList.add('btn-primary-custom');
            }
            alert("Server unreachable. Attendance is saved only in this browser cache, so student/parent notifications were not sent.");
        }
    });
}

// --- VIEW SPECIFIC LOGIC ---
function loadAttendanceViewList() {
    return __awaiter(this, void 0, void 0, function* () {
        const grade = document.getElementById('att-view-grade').value;
        const date = document.getElementById('att-view-date').value || new Date().toISOString().split('T')[0];
        // Ensure date input is set
        if (!document.getElementById('att-view-date').value) {
            document.getElementById('att-view-date').value = date;
        }

        const container = document.getElementById('attendance-view-list-body');
        if (!container) return; // Guard

        container.innerHTML = CB.ui.spinner('Loading...', 'lg');

        try {
            const res = yield fetchAPI(`/attendance/class/${grade}?date=${date}`);
            const data = yield res.json();

            if (data.length === 0) {
                container.innerHTML = '<div class="text-center p-5 text-muted">No students found for this class.</div>';
                return;
            }

            let html = '';
            data.forEach(s => {
                html += `
                <div class="py-3 border-bottom border-light hover-up transition-all bg-white" data-student-id="${s.id}">
                    <div class="row align-items-center">
                        <div class="col-md-4 ps-4">
                            <div class="d-flex align-items-center">
                                <div class="avatar-sm rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center me-3"
                                    style="width: 36px; height: 36px;">
                                    ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div class="fw-bold text-dark">${s.name}</div>
                                    <div class="small text-muted" style="font-size: 11px;">ID: ${s.id}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="btn-group w-100" role="group">
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_p_${s.id}" value="Present" autocomplete="off" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                                <label class="btn btn-outline-success btn-sm" for="att_view_p_${s.id}">Present</label>

                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_a_${s.id}" value="Absent" autocomplete="off" ${s.status === 'Absent' ? 'checked' : ''}>
                                <label class="btn btn-outline-danger btn-sm" for="att_view_a_${s.id}">Absent</label>
                                
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_l_${s.id}" value="Late" autocomplete="off" ${s.status === 'Late' ? 'checked' : ''}>
                                <label class="btn btn-outline-warning btn-sm" for="att_view_l_${s.id}">Late</label>
                            </div>
                        </div>
                        <div class="col-md-4 pe-4 text-end">
                            <input type="text" class="form-control border-0 bg-light rounded-pill px-3 shadow-sm d-inline-block w-100"
                                id="att_view_rem_${s.id}" value="${s.remarks || ''}" placeholder="Note...">
                        </div>
                    </div>
                </div>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            const serverStudents = yield fetchAttendanceStudentsByGrade(grade);
            const fallback = getAttendanceFallbackData(grade, date, serverStudents);
            if (fallback.length === 0) {
                container.innerHTML = `<div class="text-center text-danger p-5">Error: ${e.message}</div>`;
                return;
            }
            let html = '';
            fallback.forEach(s => {
                html += `
                <div class="py-3 border-bottom border-light hover-up transition-all bg-white" data-student-id="${s.id}">
                    <div class="row align-items-center">
                        <div class="col-md-4 ps-4">
                            <div class="d-flex align-items-center">
                                <div class="avatar-sm rounded-circle bg-primary-subtle text-primary fw-bold d-flex align-items-center justify-content-center me-3"
                                    style="width: 36px; height: 36px;">
                                    ${s.photo_url ? `<img src="${s.photo_url}" class="rounded-circle w-100 h-100 object-fit-cover">` : s.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div class="fw-bold text-dark">${s.name}</div>
                                    <div class="small text-muted" style="font-size: 11px;">ID: ${s.id}</div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4 text-center">
                            <div class="btn-group w-100" role="group">
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_p_${s.id}" value="Present" autocomplete="off" ${s.status === 'Present' || s.status === 'Not Marked' ? 'checked' : ''}>
                                <label class="btn btn-outline-success btn-sm" for="att_view_p_${s.id}">Present</label>
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_a_${s.id}" value="Absent" autocomplete="off" ${s.status === 'Absent' ? 'checked' : ''}>
                                <label class="btn btn-outline-danger btn-sm" for="att_view_a_${s.id}">Absent</label>
                                <input type="radio" class="btn-check" name="att_view_${s.id}" id="att_view_l_${s.id}" value="Late" autocomplete="off" ${s.status === 'Late' ? 'checked' : ''}>
                                <label class="btn btn-outline-warning btn-sm" for="att_view_l_${s.id}">Late</label>
                            </div>
                        </div>
                        <div class="col-md-4 pe-4 text-end">
                            <input type="text" class="form-control border-0 bg-light rounded-pill px-3 shadow-sm d-inline-block w-100"
                                id="att_view_rem_${s.id}" value="${s.remarks || ''}" placeholder="Note...">
                        </div>
                    </div>
                </div>`;
            });
            container.innerHTML = html + `<div class="text-center text-warning small py-2">Attendance API is unavailable. Showing real student records from backup source.</div>`;
        }
    });
}

function bulkSetAttendanceView(status) {
    const list = document.getElementById('attendance-view-list-body');
    if (!list) return;
    const radios = list.querySelectorAll(`input[value="${status}"]`);
    radios.forEach(r => r.click());
    radios.forEach(r => r.checked = true);
}

function saveAttendanceViewRecord() {
    return __awaiter(this, void 0, void 0, function* () {
        const date = document.getElementById('att-view-date').value;
        const grade = document.getElementById('att-view-grade').value;
        const records = [];
        if (!date) {
            alert("Please select a valid attendance date before saving.");
            return;
        }

        const rows = document.getElementById('attendance-view-list-body').querySelectorAll('.bg-white[data-student-id]');
        rows.forEach(row => {
            const sid = (row.getAttribute('data-student-id') || '').trim();
            if (!sid)
                return;
            const statusInput = row.querySelector('input[type="radio"]:checked');
            if (!statusInput)
                return;
            const status = statusInput.value;
            const remarksInput = row.querySelector('input[type="text"]');
            const remarks = remarksInput ? remarksInput.value : '';
            records.push({ student_id: sid, status, remarks });
        });
        if (records.length === 0) {
            alert("No attendance rows found to save.");
            return;
        }

        try {
            const btn = document.querySelector('button[onclick="saveAttendanceViewRecord()"]');
            if (btn) CB.ui.btnLoading(btn, 'Saving...');

            const res = yield fetchAPI('/attendance/bulk', {
                method: 'POST',
                body: JSON.stringify({ date, records })
            });
            if (!res.ok) {
                throw new Error(yield getAttendanceSaveError(res));
            }
            const data = yield res.json().catch(() => ({}));
            const saved = Number(data.saved || 0);
            const skipped = Number(data.skipped || 0);
            const studentNotified = Number(data.student_notified || 0);
            const parentNotified = Number(data.parent_notified || 0);

            if (btn) {
                btn.innerHTML = `Saved (${saved})`;
                btn.classList.replace('btn-primary-custom', 'btn-success');
                setTimeout(() => {
                    btn.innerHTML = 'Save Record';
                    btn.classList.replace('btn-success', 'btn-primary-custom');
                }, 2200);
            }
            alert(`Attendance saved: ${saved} record(s). Skipped: ${skipped}. Notifications sent -> Students: ${studentNotified}, Parents: ${parentNotified}.`);
        } catch (e) {
            const msg = (e && e.message) ? e.message : 'Unknown error';
            const btn = document.querySelector('button[onclick="saveAttendanceViewRecord()"]');
            if (msg.startsWith('HTTP')) {
                if (btn) {
                    btn.innerHTML = 'Save Record';
                    btn.classList.remove('btn-success');
                    btn.classList.add('btn-primary-custom');
                }
                alert(`Attendance save failed: ${msg}`);
                return;
            }
            saveAttendanceFallback(date, grade, records);
            if (btn) {
                btn.innerHTML = 'Save Record';
                btn.classList.remove('btn-success');
                btn.classList.add('btn-primary-custom');
            }
            alert("Server unreachable. Attendance is saved only in this browser cache, so student/parent notifications were not sent.");
        }
    });
}

// Hook into View Switching
// This ensures that when the user navigates to the view, we load data
// Since I cannot easily edit `switchView` without finding it, I will add an event listener for visibility or just call it if the view is active.
// For now, I'll add an Observer or just rely on the user changing the controls. 
// Better: Add a global listener for hash change or view change if possible.
// Or, initialize it if the element exists on page load (if SPA state persists)

// Note: initialization is handled by the VIEW_LOADERS registry in cb_view_registry.js
// when the user navigates to 'attendance-take-view'.
// --- TIMETABLE & LEAVE ---

// --- Window bindings for inline HTML onclick handlers ---
window.openAttendanceModal = openAttendanceModal;
window.getAttendanceLocalKey = getAttendanceLocalKey;
window.getAttendanceFallbackData = getAttendanceFallbackData;
window.fetchAttendanceStudentsByGrade = fetchAttendanceStudentsByGrade;
window.saveAttendanceFallback = saveAttendanceFallback;
window.loadAttendanceList = loadAttendanceList;
window.bulkSetAttendance = bulkSetAttendance;
window.getAttendanceSaveError = getAttendanceSaveError;
window.saveAttendanceRecord = saveAttendanceRecord;
window.loadAttendanceViewList = loadAttendanceViewList;
window.bulkSetAttendanceView = bulkSetAttendanceView;
window.saveAttendanceViewRecord = saveAttendanceViewRecord;
