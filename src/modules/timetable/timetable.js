/** timetable.js — Timetable Viewing (Teacher & Student), PDF Cards & Upload */
function timetablePdfAbsoluteUrl(filePath) {
    if (!filePath)
        return '#';
    if (String(filePath).startsWith('http://') || String(filePath).startsWith('https://')) {
        return filePath;
    }
    const backendRoot = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${backendRoot}${filePath}`;
}
function renderTimetablePdfCards(pdfItems, isStudent) {
    if (!Array.isArray(pdfItems) || pdfItems.length === 0) {
        return '<div class="alert alert-info mb-4">No timetable PDF uploaded yet.</div>';
    }
    return `
        <div class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-header bg-white fw-bold">Timetable PDF</div>
            <div class="card-body">
                <div class="row g-3">
                    ${pdfItems.map((item) => {
        const href = timetablePdfAbsoluteUrl(item.file_path);
        const classLabel = `Grade ${item.class_grade}${item.section ? `-${item.section}` : ''}`;
        const uploadedDate = item.uploaded_at ? new Date(item.uploaded_at).toLocaleString() : '-';
        return `
                            <div class="col-md-6 col-xl-4">
                                <div class="border rounded-3 p-3 h-100 bg-light">
                                    <div class="d-flex align-items-center justify-content-between mb-2">
                                        <span class="badge bg-primary-subtle text-primary">${classLabel}</span>
                                        <span class="small text-muted">${uploadedDate}</span>
                                    </div>
                                    <div class="fw-bold text-dark mb-2">${item.title || 'Timetable PDF'}</div>
                                    ${isStudent ? '' : `<div class="small text-muted mb-2">Uploaded by: ${item.uploaded_by || '-'}</div>`}
                                    <div class="d-flex gap-2">
                                        <a class="btn btn-sm btn-outline-primary" href="${href}" target="_blank" rel="noopener">View</a>
                                        <a class="btn btn-sm btn-primary-custom" href="${href}" download>Download</a>
                                    </div>
                                </div>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>
        </div>
    `;
}
function handleTimetablePdfUpload(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const form = document.getElementById('timetable-pdf-upload-form');
        const gradeInput = document.getElementById('tt-upload-grade');
        const sectionInput = document.getElementById('tt-upload-section');
        const titleInput = document.getElementById('tt-upload-title');
        const fileInput = document.getElementById('tt-upload-file');
        if (!form || !gradeInput || !fileInput)
            return;
        const grade = Number(gradeInput.value);
        if (!grade || grade <= 0) {
            alert('Please enter a valid class grade.');
            return;
        }
        if (!fileInput.files || !fileInput.files[0]) {
            alert('Please select a PDF file.');
            return;
        }
        const selectedFile = fileInput.files[0];
        if (!String(selectedFile.name || '').toLowerCase().endsWith('.pdf')) {
            alert('Only PDF files are allowed.');
            return;
        }
        const fd = new FormData();
        fd.append('class_grade', String(grade));
        fd.append('section', sectionInput && sectionInput.value ? sectionInput.value.trim() : '');
        fd.append('title', titleInput && titleInput.value ? titleInput.value.trim() : '');
        fd.append('file', selectedFile);
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn)
            submitBtn.disabled = true;
        try {
            const res = yield fetchAPI('/timetable/upload-pdf', {
                method: 'POST',
                body: fd
            });
            const data = yield res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((data === null || data === void 0 ? void 0 : data.detail) || 'Failed to upload timetable PDF.');
            }
            const notified = data.notified || {};
            alert(`Timetable PDF uploaded. Notifications -> Students: ${Number(notified.students || 0)}, Parents: ${Number(notified.parents || 0)}, Teachers: ${Number(notified.teachers || 0)}.`);
            form.reset();
            yield loadTimetable();
        }
        catch (err) {
            alert(err.message || 'Upload failed.');
        }
        finally {
            if (submitBtn)
                submitBtn.disabled = false;
        }
    });
}
function loadTimetable() {
    return __awaiter(this, void 0, void 0, function* () {
        const isParent = isParentRole(appState.role);
        const container = document.getElementById(isParent ? 'parent-timetable-view' : 'timetable-view');
        if (!container)
            return;
        container.innerHTML = CB.ui.spinner('Loading timetable...', 'lg');
        const isStudent = appState.role === 'Student' || isParent;
        let endpoint = isStudent ? '/timetable/student/my' : `/timetable/teacher/${encodeURIComponent(appState.userId || '')}`;
        let pdfEndpoint = isStudent ? '/timetable/student/my/pdfs' : '/timetable/teacher/my/pdfs';
        if (isParent && appState.activeStudentId) {
            endpoint += `?student_id=${encodeURIComponent(appState.activeStudentId)}`;
            pdfEndpoint += `?student_id=${encodeURIComponent(appState.activeStudentId)}`;
        }
        try {
            const [res, pdfRes] = yield Promise.all([
                fetchAPI(endpoint),
                fetchAPI(pdfEndpoint)
            ]);
            if (!res.ok) {
                const err = yield res.json().catch(() => ({}));
                throw new Error(err.detail || 'Failed to load timetable.');
            }
            const data = yield res.json();
            let pdfItems = [];
            if (pdfRes.ok) {
                const pdfData = yield pdfRes.json().catch(() => []);
                if (Array.isArray(pdfData)) {
                    pdfItems = pdfData;
                }
            }
            let entries = [];
            if (Array.isArray(data.entries)) {
                entries = data.entries;
            }
            else if (data && typeof data === 'object') {
                Object.keys(data).forEach(day => {
                    const dayRows = Array.isArray(data[day]) ? data[day] : [];
                    dayRows.forEach(r => {
                        const time = String(r.time || '').split('-').map(v => v.trim());
                        entries.push({
                            day_of_week: day,
                            period_number: r.period || null,
                            start_time: time[0] || '',
                            end_time: time[1] || '',
                            subject: r.subject || '',
                            class_grade: null,
                            section: null
                        });
                    });
                });
            }
            const dayOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
            entries.sort((a, b) => {
                const da = dayOrder[a.day_of_week] || 99;
                const db = dayOrder[b.day_of_week] || 99;
                if (da !== db)
                    return da - db;
                const pa = Number(a.period_number || 0);
                const pb = Number(b.period_number || 0);
                if (pa !== pb)
                    return pa - pb;
                return String(a.start_time || '').localeCompare(String(b.start_time || ''));
            });
            const grouped = {};
            entries.forEach(e => {
                const day = e.day_of_week || 'Unknown';
                if (!grouped[day])
                    grouped[day] = [];
                grouped[day].push(e);
            });
            const uploadBlock = !isStudent
                ? `
                <div class="card border-0 shadow-sm rounded-4 mb-4">
                    <div class="card-header bg-white fw-bold">Upload Timetable PDF</div>
                    <div class="card-body">
                        <form id="timetable-pdf-upload-form" class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Class Grade</label>
                                <input id="tt-upload-grade" type="number" min="1" max="12" class="form-control" required>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Section (Optional)</label>
                                <input id="tt-upload-section" type="text" class="form-control" placeholder="A">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">Title (Optional)</label>
                                <input id="tt-upload-title" type="text" class="form-control" placeholder="Mid-Term Timetable">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold text-muted text-uppercase">PDF File</label>
                                <input id="tt-upload-file" type="file" accept=".pdf,application/pdf" class="form-control" required>
                            </div>
                            <div class="col-12">
                                <button type="submit" class="btn btn-primary-custom">Upload Timetable PDF</button>
                            </div>
                        </form>
                    </div>
                </div>
                `
                : '';
            const timetableBody = entries.length
                ? `${Object.keys(grouped).map(day => `
                    <div class="card border-0 shadow-sm rounded-4 mb-3">
                        <div class="card-header bg-white fw-bold">${day}</div>
                        <div class="card-body p-0">
                            <div class="table-responsive">
                                <table class="table table-sm align-middle mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th class="ps-3">Period</th>
                                            <th>Time</th>
                                            <th>Subject</th>
                                            ${isStudent ? '' : '<th class="pe-3">Class</th>'}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${grouped[day].map(r => `
                                            <tr>
                                                <td class="ps-3">${r.period_number || '-'}</td>
                                                <td>${r.start_time || '-'}${r.end_time ? ` - ${r.end_time}` : ''}</td>
                                                <td>${r.subject || '-'}</td>
                                                ${isStudent ? '' : `<td class="pe-3">${r.class_grade ? `Grade ${r.class_grade}${r.section ? `-${r.section}` : ''}` : '-'}</td>`}
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `).join('')}`
                : '<div class="alert alert-info mb-0">No timetable records found.</div>';
            container.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h3 class="fw-bold mb-1 text-dark">${isStudent ? 'My Timetable' : 'Teacher Timetable'}</h3>
                        <p class="text-muted small mb-0">${isStudent ? `Grade ${data.grade || '-'}${data.section ? ` • Section ${data.section}` : ''}` : (appState.userName || appState.userId || '')}</p>
                    </div>
                </div>
                ${uploadBlock}
                ${renderTimetablePdfCards(pdfItems, isStudent)}
                ${timetableBody}
            `;
            if (!isStudent) {
                const uploadForm = document.getElementById('timetable-pdf-upload-form');
                if (uploadForm && !uploadForm.dataset.bound) {
                    uploadForm.dataset.bound = '1';
                    uploadForm.addEventListener('submit', handleTimetablePdfUpload);
                }
            }
        }
        catch (e) {
            container.innerHTML = `<div class="alert alert-danger mb-0">${e.message}</div>`;
        }
    });
}


// --- Window bindings for inline HTML onclick handlers ---
window.timetablePdfAbsoluteUrl = timetablePdfAbsoluteUrl;
window.renderTimetablePdfCards = renderTimetablePdfCards;
window.handleTimetablePdfUpload = handleTimetablePdfUpload;
window.loadTimetable = loadTimetable;
