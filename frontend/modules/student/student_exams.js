/** student_exams.js — Student Exams, Quiz Taking, Assignment Exam Schedules, PDF Exam Player */
async function takeQuiz(quizId) {
    if (!appState.isLoggedIn) { alert("Please login first."); return; }

    // Fetch Quiz
    let quiz = null;
    const btn = document.querySelector(`button[onclick="takeQuiz('${quizId}')"]`);
    const originalText = btn ? btn.innerHTML : '';
    if (btn) { btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

    try {
        const res = await fetchAPI(`/quizzes/${quizId}`);
        if (!res.ok) throw new Error("Failed to load quiz");
        quiz = await res.json();
    } catch (e) {
        alert("Error loading quiz: " + e.message);
        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
        return;
    }

    if (btn) { btn.innerHTML = originalText; btn.disabled = false; }

    const modalEl = document.getElementById('takeQuizModal');
    if (!modalEl) {
        alert("Take Quiz modal missing from HTML.");
        return;
    }

    // Populate Modal
    const titleEl = document.getElementById('take-quiz-title');
    const questionsContainer = document.getElementById('quiz-questions-container');

    if (titleEl) titleEl.textContent = quiz.title;

    // Store current quiz info for submission
    appState.currentQuiz = {
        id: quiz.id,
        totalQuestions: quiz.questions.length
    };

    const questionsHtml = quiz.questions.map((q, idx) => {
        let optionsHtml = '';
        if (q.options && Array.isArray(q.options)) {
            optionsHtml = q.options.map((opt, optIdx) => {
                const val = opt;
                return `
                    <div class="form-check mb-2">
                        <input class="form-check-input" type="radio" name="q_${idx}" id="q_${idx}_${optIdx}" value="${val.replace(/"/g, '&quot;')}">
                        <label class="form-check-label" for="q_${idx}_${optIdx}">
                            ${opt}
                        </label>
                    </div>
                `;
            }).join('');
        }

        return `
            <div class="card mb-4 border-0 shadow-sm">
                <div class="card-body">
                    <h5 class="card-title fw-bold mb-3">${idx + 1}. ${q.question}</h5>
                    ${optionsHtml}
                </div>
            </div>
        `;
    }).join('');

    if (questionsContainer) {
        questionsContainer.innerHTML = questionsHtml;
    }

    // Reset Submit Button in Footer if it was changed to Close
    const footer = modalEl.querySelector('.modal-footer');
    if (footer) {
        footer.innerHTML = `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" data-i18n="btn_cancel">Cancel</button>
            <button type="button" class="btn btn-primary-custom fw-bold px-4" onclick="submitQuizAnswers()">
                Submit Quiz
            </button>
        `;
        // Re-run i18n
        if (typeof translatePage === 'function') translatePage();
    }

    openView(modalEl.id);
}

async function submitQuizAnswers() {
    if (!appState.currentQuiz) return;
    const { id: quizId, totalQuestions } = appState.currentQuiz;

    if (!confirm("Are you sure you want to submit?")) return;

    const answers = {};
    for (let i = 0; i < totalQuestions; i++) {
        const selected = document.querySelector(`input[name="q_${i}"]:checked`);
        if (selected) {
            answers[i] = selected.value;
        } else {
            answers[i] = "";
        }
    }

    const studentId = appState.userId;
    if (!studentId) {
        alert("User context missing.");
        return;
    }

    const modalEl = document.getElementById('takeQuizModal');
    const btn = modalEl ? modalEl.querySelector('button[onclick^="submitQuizAnswers"]') : null;
    const originalText = btn ? btn.innerHTML : 'Submit Quiz';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Submitting...';
    }

    try {
        const res = await fetchAPI(`/quizzes/${quizId}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                student_id: studentId,
                answers: answers
            })
        });

        const result = await res.json();

        if (res.ok) {
            const questionsContainer = document.getElementById('quiz-questions-container');
            if (questionsContainer) {
                questionsContainer.innerHTML = `
                    <div class="text-center p-5">
                        <div class="mb-4">
                            <span class="material-icons text-success" style="font-size: 64px;">check_circle</span>
                        </div>
                        <h3 class="fw-bold text-success mb-3">Quiz Submitted!</h3>
                        <div class="display-4 fw-bold mb-3">${Math.round(result.score_percent)}%</div>
                        <p class="text-muted">You scored ${result.score} out of ${result.total}.</p>
                        ${result.ai_feedback ? `
                            <div class="card bg-light border-0 mt-4 text-start">
                                <div class="card-body">
                                    <h6 class="fw-bold text-primary"><span class="material-icons align-middle fs-6 me-1">psychology</span> AI Feedback</h6>
                                    <p class="small mb-0">${result.ai_feedback}</p>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                 `;
            }

            const footer = modalEl ? modalEl.querySelector('.modal-footer') : null;
            if (footer) {
                footer.innerHTML = '<button type="button" class="btn btn-primary-custom px-4" data-bs-dismiss="modal">Close</button>';
            }

            // Refresh stats if available
            if (typeof loadStudentDashboard === 'function') loadStudentDashboard(appState.userId);
        } else {
            alert("Submission failed: " + (result.detail || "Unknown error"));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }

    } catch (e) {
        console.error("Quiz Submission Error Details:", e);
        alert(`Network error submitting quiz: ${e.message}. See console for details.`);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}


async function loadStudentExams() {
    const container = document.getElementById('student-exams-list-container');
    if (!container) return;

    container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div><p class="text-muted mt-2">Loading Exams...</p></div>';

    try {
        const [scheduleRes, pdfRes] = await Promise.all([
            fetchAPI('/exam-schedules/my'),
            fetchAPI('/exams/student/list')
        ]);

        let schedules = [];
        let exams = [];

        if (scheduleRes.ok) {
            schedules = await scheduleRes.json();
        }
        if (pdfRes.ok) {
            exams = await pdfRes.json();
        }

        container.innerHTML = '';

        if (!schedules.length && !exams.length) {
            container.innerHTML = '<div class="col-12 text-center py-5"><p class="text-muted">No exams scheduled at this moment.</p></div>';
            return;
        }

        if (schedules.length) {
            container.innerHTML += `
                <div class="col-12">
                    <h4 class="fw-bold mb-3">Exam Schedule</h4>
                </div>
            `;
            schedules.forEach(s => {
                const html = `
                    <div class="col-md-4">
                        <div class="card border-0 shadow-sm h-100 rounded-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div class="icon-circle bg-light text-primary">
                                        <span class="material-icons">event</span>
                                    </div>
                                    <span class="badge bg-info text-dark">Scheduled</span>
                                </div>
                                <h5 class="fw-bold mb-1">${s.title || 'Exam'}</h5>
                                <p class="text-muted small mb-2">${s.subject || ''}</p>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">calendar_today</span>
                                    ${formatExamDate(s.exam_date)}
                                </div>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">schedule</span>
                                    ${formatExamTime(s.start_time, s.end_time)}
                                </div>
                                <div class="small text-muted mb-1">
                                    <span class="material-icons fs-6 me-1">location_on</span>
                                    ${s.venue || 'TBD'}
                                </div>
                                ${s.instructions ? `<div class="small text-muted"><span class="material-icons fs-6 me-1">checklist</span>${s.instructions}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML += html;
            });
        }

        if (exams.length) {
            container.innerHTML += `
                <div class="col-12 mt-4">
                    <h4 class="fw-bold mb-3">Online PDF Exams</h4>
                </div>
            `;
            exams.forEach(exam => {
                const isSubmitted = exam.submitted === 1;
                const statusBadge = isSubmitted
                    ? '<span class="badge bg-success">Completed</span>'
                    : '<span class="badge bg-warning text-dark">Pending</span>';

                const actionBtn = isSubmitted
                    ? `<button class="btn btn-outline-secondary w-100" disabled>Submitted</button>`
                    : `<button class="btn btn-primary-custom w-100 fw-bold" onclick="startPDFExam(${exam.id}, '${exam.title}', '${exam.file_path}', ${exam.time_limit_mins})">Start Exam</button>`;

                const html = `
                    <div class="col-md-4">
                        <div class="card border-0 shadow-sm h-100 rounded-4">
                            <div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-start mb-3">
                                    <div class="icon-circle bg-light text-primary">
                                        <span class="material-icons">assignment</span>
                                    </div>
                                    ${statusBadge}
                                </div>
                                <h5 class="fw-bold mb-1">${exam.title}</h5>
                                <p class="text-muted small mb-3">Time Limit: ${exam.time_limit_mins} mins</p>
                                
                                <div class="d-flex align-items-center text-muted small mb-4">
                                    <span class="material-icons fs-6 me-1">calendar_today</span>
                                    Posted: ${new Date(exam.created_at).toLocaleDateString()}
                                </div>
                                
                                ${actionBtn}
                            </div>
                        </div>
                    </div>
                `;
                container.innerHTML += html;
            });
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-danger text-center">Network Error.</p>';
    }
}

async function loadStudentAssignmentsExamSchedules() {
    const container = document.getElementById('student-assignment-exam-schedules');
    if (!container)
        return;

    container.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading exam schedules...</div>';

    try {
        const res = await fetchAPI('/exam-schedules/my');
        if (!res.ok) {
            container.innerHTML = '<div class="alert alert-danger mb-0">Failed to load exam schedules.</div>';
            return;
        }

        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            container.innerHTML = '<div class="alert alert-info mb-0">No exam schedules published yet.</div>';
            return;
        }

        const sorted = [...rows].sort((a, b) => {
            const ad = `${a.exam_date || ''}T${a.start_time || '00:00'}`;
            const bd = `${b.exam_date || ''}T${b.start_time || '00:00'}`;
            return new Date(ad).getTime() - new Date(bd).getTime();
        });

        container.innerHTML = sorted.map(s => `
            <div class="card border-0 shadow-sm mb-3">
                <div class="card-body p-4">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                        <h5 class="fw-bold mb-0">
                            <span class="material-icons align-middle text-primary me-1">event</span>
                            ${s.title || 'Exam'}
                        </h5>
                        <span class="badge bg-primary-subtle text-primary border">Grade ${s.grade_level || '-'}</span>
                    </div>
                    <p class="text-muted mb-3">${s.subject || 'General'}</p>
                    <div class="row g-2 small">
                        <div class="col-md-4"><span class="text-muted">Date:</span> <span class="fw-semibold">${formatExamDate(s.exam_date)}</span></div>
                        <div class="col-md-4"><span class="text-muted">Time:</span> <span class="fw-semibold">${formatExamTime(s.start_time, s.end_time)}</span></div>
                        <div class="col-md-4"><span class="text-muted">Venue:</span> <span class="fw-semibold">${s.venue || 'TBD'}</span></div>
                    </div>
                    ${s.instructions ? `<div class="mt-3 small"><span class="text-muted">Instructions:</span> ${s.instructions}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
    catch (e) {
        console.error(e);
        container.innerHTML = '<div class="alert alert-danger mb-0">Network error while loading exam schedules.</div>';
    }
}

async function loadStudentAssignmentsAndResults() {
    const studentId = appState.activeStudentId || appState.userId;
    if (!studentId)
        return;

    const homeworkTab = document.getElementById('homework-tab');
    const resultsTab = document.getElementById('results-tab');

    if (homeworkTab) {
        homeworkTab.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading assignments...</div>';
    }
    if (resultsTab) {
        resultsTab.innerHTML = '<div class="alert alert-light border text-muted mb-0">Loading results...</div>';
    }

    try {
        const [assignRes, progressRes] = await Promise.all([
            fetchAPI(`/students/${encodeURIComponent(studentId)}/assignments`),
            fetchAPI(`/progress-card/${encodeURIComponent(studentId)}`)
        ]);

        const assignments = assignRes.ok ? await assignRes.json() : [];
        const progress = progressRes.ok ? await progressRes.json() : null;

        if (homeworkTab) {
            if (!Array.isArray(assignments) || assignments.length === 0) {
                homeworkTab.innerHTML = '<div class="alert alert-info mb-0">No assignments available right now.</div>';
            }
            else {
                homeworkTab.innerHTML = `
                    <div class="list-group">
                        ${assignments.map(a => `
                            <div class="list-group-item p-3 border-start border-4 border-warning mb-2 rounded d-flex justify-content-between align-items-center">
                                <div>
                                    <div class="d-flex w-100 justify-content-between">
                                        <h5 class="mb-1 fw-bold">${a.title || 'Assignment'}</h5>
                                    </div>
                                    <p class="mb-1 text-muted small">${a.type || 'Assignment'} &bull; ${a.course_name || 'Class Assignment'}</p>
                                    ${a.due_date ? `<small class="text-danger fw-bold">Due: ${a.due_date}</small>` : ''}
                                </div>
                                <div class="ms-3">
                                    ${a.type === 'Quiz' ?
                        `<button class="btn btn-sm btn-primary" onclick="takeQuiz('${a.id}')">Start Quiz</button>` :
                        `<button class="btn btn-sm btn-success" onclick="openSubmitModal(${a.id}, '${(a.title || '').replace(/'/g, "\\'")}', 'student-exams-view')">
                                            <span class="material-icons align-middle" style="font-size:14px;">send</span> Submit
                                        </button>`
                    }
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        if (resultsTab) {
            const recent = progress && Array.isArray(progress.recent_marks) ? progress.recent_marks : [];
            if (recent.length === 0) {
                resultsTab.innerHTML = '<div class="alert alert-info mb-0">No exam results published yet.</div>';
            }
            else {
                resultsTab.innerHTML = `
                    <div class="card border-0 shadow-sm">
                        <div class="card-body">
                            <table class="table table-hover align-middle mb-0">
                                <thead>
                                    <tr>
                                        <th>Exam</th>
                                        <th>Subject</th>
                                        <th>Score</th>
                                        <th>Grade</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${recent.map(r => `
                                        <tr>
                                            <td>${r.exam_name || '-'}</td>
                                            <td>${r.subject || '-'}</td>
                                            <td class="fw-bold text-success">${r.max_marks ? `${r.marks_obtained}/${r.max_marks}` : (r.marks_obtained ?? '-')}</td>
                                            <td>${r.grade || '-'}</td>
                                            <td>${r.date || '-'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }
        }
    }
    catch (e) {
        if (homeworkTab) {
            homeworkTab.innerHTML = `<div class="alert alert-danger mb-0">Unable to load assignments: ${e.message}</div>`;
        }
        if (resultsTab) {
            resultsTab.innerHTML = `<div class="alert alert-danger mb-0">Unable to load results: ${e.message}</div>`;
        }
    }
}

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

/* --- PDF EXAM TEACHER LOGIC --- */

function loadTestCreateView() {
    const container = document.getElementById('test-create-view');
    if (!container) return;

    container.innerHTML = `
        <h3 class="fw-bold mb-4">Create Online Test</h3>
        <div class="row justify-content-center g-4">
            <!-- Option 1: PDF Exam (New) -->
            <div class="col-md-5">
                <div class="card border-0 shadow-sm rounded-4 h-100 p-4 text-center hover-card" onclick="showPDFExamForm()">
                    <div class="card-body">
                         <div class="icon-circle bg-primary-subtle text-primary mb-3 mx-auto" style="width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                            <span class="material-icons fs-1">picture_as_pdf</span>
                         </div>
                        <h4 class="fw-bold">Upload Question Paper</h4>
                        <p class="text-muted">Upload a PDF question paper. Set a strict timer. Students view the PDF and upload their answer sheets.</p>
                        <button class="btn btn-primary-custom rounded-pill px-4 fw-bold mt-2">Create PDF Exam</button>
                    </div>
                </div>
            </div>


        </div>

        <!-- Hidden Form Container -->
        <div id="pdf-exam-form-container" class="row justify-content-center mt-5 d-none">
            <div class="col-md-8">
                <div class="card border-0 shadow rounded-4">
                    <div class="card-header bg-white border-0 pt-4 px-4 pb-0">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="fw-bold text-primary mb-0">Construct PDF Exam</h5>
                            <button class="btn-close" onclick="loadTestCreateView()"></button>
                        </div>
                    </div>
                    <div class="card-body p-4">
                        <form id="create-pdf-exam-form" onsubmit="event.preventDefault(); handleCreatePDFExam();">
                            <div class="mb-3">
                                <label class="form-label fw-bold">Exam Title</label>
                                <input type="text" id="exam-title" class="form-control" placeholder="e.g. Mid-Term Mathematics" required>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Time Limit (Minutes)</label>
                                    <input type="number" id="exam-time-limit" class="form-control" placeholder="e.g. 60" min="5" required>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label fw-bold">Assign to Group (Optional)</label>
                                    <select id="exam-group-select" class="form-select">
                                        <option value="">All Students (Public)</option>
                                        <!-- Groups loaded dynamically -->
                                    </select>
                                </div>
                            </div>
                            <div class="mb-4">
                                <label class="form-label fw-bold">Upload Question Paper (PDF)</label>
                                <input type="file" id="exam-file" class="form-control" accept="application/pdf" required>
                                <div class="form-text">Students will view this file during the exam.</div>
                            </div>
                            <button type="submit" class="btn btn-primary-custom w-100 py-2 fw-bold text-uppercase">
                                <span class="material-icons align-middle me-2">publish</span> Publish Exam
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load Groups for Select
    loadGroupsForExamSelect();
}

function showPDFExamForm() {
    document.getElementById('pdf-exam-form-container').classList.remove('d-none');
    window.scrollTo(0, document.body.scrollHeight);
}

async function loadGroupsForExamSelect() {
    const select = document.getElementById('exam-group-select');
    if (!select) return;

    try {
        const res = await fetchAPI('/groups');
        if (res.ok) {
            const groups = await res.json();
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                select.appendChild(opt);
            });
        }
    } catch (e) { console.error("Error loading groups", e); }
}

async function handleCreatePDFExam() {
    const title = document.getElementById('exam-title').value;
    const timeLimit = document.getElementById('exam-time-limit').value;
    const groupId = document.getElementById('exam-group-select').value;
    const fileInput = document.getElementById('exam-file');
    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a PDF file.");
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('time_limit', timeLimit);
    if (groupId) formData.append('group_id', groupId);
    formData.append('file', file);

    // Show Loading
    const btn = document.querySelector('#create-pdf-exam-form button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> Publishing...`;
    btn.disabled = true;

    try {
        const res = await fetchAPI('/exams/create-pdf', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert("Exam Created Successfully!");
            loadTestCreateView(); // Reset view
        } else {
            const err = await res.json();
            alert("Error: " + (err.detail || "Failed to create exam."));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
