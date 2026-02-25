/** parent_exams.js — Parent Exam Schedule, PDF Exam Player & Timer */
async function loadParentExamScheduleView() {
    const tbody = ensureParentExamScheduleLayout();
    if (!tbody)
        return;
    tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="6">Loading exam schedules...</td></tr>';
    try {
        const res = await fetchAPI('/exam-schedules/my');
        if (res.ok) {
            const rows = await res.json();
            if (!rows.length) {
                tbody.innerHTML = '<tr><td class="ps-4 text-muted" colspan="6">No exam schedules available.</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td class="ps-4">${r.student_name || '-'}</td>
                    <td class="ps-4 fw-bold">${r.subject || ''} (${r.title || 'Exam'})</td>
                    <td>${formatExamDate(r.exam_date)}</td>
                    <td>${formatExamTime(r.start_time, r.end_time)}</td>
                    <td>${r.venue || '-'}</td>
                    <td>${r.instructions || '-'}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="6">Failed to load schedules.</td></tr>';
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td class="ps-4 text-danger" colspan="6">Network error.</td></tr>';
    }
}

function ensureParentExamScheduleLayout() {
    let tbody = document.getElementById('parent-exam-schedule-body');
    if (tbody)
        return tbody;
    const view = document.getElementById('parent-exam-schedule-view');
    if (!view)
        return null;
    view.innerHTML = `
        <h3 class="fw-bold mb-4 text-dark">Upcoming Exams</h3>
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th class="ps-4 py-3">Student</th>
                            <th class="ps-4 py-3">Subject</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Venue</th>
                            <th>Items Required</th>
                        </tr>
                    </thead>
                    <tbody id="parent-exam-schedule-body">
                        <tr>
                            <td class="ps-4 text-muted" colspan="6">Loading exam schedules...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    tbody = document.getElementById('parent-exam-schedule-body');
    return tbody;
}

var examTimerInterval; // var: shared with script.js

function startPDFExam(id, title, filePath, timeLimitMins) {
    if (!confirm("Are you sure you want to start the exam? The timer will start immediately.")) return;

    // Switch View
    switchView('student-take-pdf-exam-view');

    // Setup UI
    document.getElementById('take-exam-title').textContent = title;
    document.getElementById('current-exam-id').value = id;

    // Fix PDF Path
    const backendRoot = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
    document.getElementById('exam-pdf-viewer').src = `${backendRoot}${filePath}`; // Ensure this path is reachable

    // Start Timer
    startExamTimer(timeLimitMins * 60);
}

function startExamTimer(durationSeconds) {
    const display = document.getElementById('exam-timer-display');
    let timer = durationSeconds;

    if (examTimerInterval) clearInterval(examTimerInterval);

    examTimerInterval = setInterval(() => {
        const hours = Math.floor(timer / 3600);
        const minutes = Math.floor((timer % 3600) / 60);
        const seconds = timer % 60;

        display.textContent =
            (hours > 0 ? String(hours).padStart(2, '0') + ':' : '') +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0');

        if (--timer < 0) {
            clearInterval(examTimerInterval);
            alert("Time is up! Submitting your exam automatically (if file selected) or closing.");
            // Ideally trigger auto-submit or close
            const fileInput = document.getElementById('answer-sheet-file');
            if (fileInput.files.length > 0) {
                submitAnswerSheet();
            } else {
                alert("You did not select a file. Exam view closing.");
                switchView('upcoming-exams-view');
            }
        }
    }, 1000);
}

function finishExamEarly() {
    if (confirm("Are you sure you want to finish? Make sure you have uploaded your answer sheet.")) {
        submitAnswerSheet();
    }
}

async function submitAnswerSheet() {
    const examId = document.getElementById('current-exam-id').value;
    const fileInput = document.getElementById('answer-sheet-file');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select your Answer Sheet PDF to submit.");
        return;
    }

    const formData = new FormData();
    formData.append('exam_id', examId);
    formData.append('file', file);

    const btn = document.querySelector('#exam-submission-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Uploading...';
    btn.disabled = true;

    try {
        const res = await fetchAPI('/exams/submit-pdf', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            clearInterval(examTimerInterval);
            alert("Exam Submitted Successfully!");
            switchView('upcoming-exams-view');
        } else {
            const err = await res.json();
            alert("Submission Failed: " + (err.detail || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error during submission.");
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}
