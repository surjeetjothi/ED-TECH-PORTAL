/** teacher_quiz.js — Teacher Quiz Management, AI Quiz Generator, Question Banks */
// --- REGENERATE & EMAIL CODE LOGIC ---
function regenerateAccessCode() {
    return __awaiter(this, void 0, void 0, function* () {
        const studentId = document.getElementById('card-student-id').textContent;
        if (!confirm("Regenerate code for " + studentId + "? Old codes will stop working."))
            return;
        try {
            const response = yield fetchAPI(`/students/${studentId}/regenerate-code`, { method: 'POST' });
            const data = yield response.json();
            if (response.ok) {
                // Refresh codes in modal
                const codesDiv = document.getElementById('card-codes-list');
                codesDiv.innerHTML = '';
                data.codes.forEach(code => {
                    codesDiv.innerHTML += `<span class="badge bg-dark fs-5 p-2 tracking-wider font-monospace">${code}</span>`;
                });
                alert("New code generated!");
            }
            else {
                alert(data.detail || "Failed to regenerate.");
            }
        }
        catch (error) {
            console.error(error);
            alert("Failed to regenerate code.");
        }
    });
}
// 8. AI GENERATION & QUIZZES
function handleGenerateQuiz(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const btn = e.target;
        // const originalText = btn.innerHTML; // Avoid losing icon complexity
        const topic = document.getElementById('quiz-topic').value;
        const fileInput = document.getElementById('quiz-pdf');
        if (!topic) {
            alert("Please enter a topic first.");
            return;
        }
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generating...';
        btn.disabled = true;
        const resultContainer = document.getElementById('quiz-result-container');
        resultContainer.classList.add('d-none');
        // Get count, clamp between 1 and 20
        let count = parseInt(document.getElementById('quiz-count').value) || 5;
        if (count < 1)
            count = 1;
        if (count > 20)
            count = 20;
        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('difficulty', document.getElementById('quiz-difficulty').value);
            formData.append('type', document.getElementById('quiz-type').value);
            formData.append('question_count', String(count));
            formData.append('description', document.getElementById('quiz-description').value);
            if (fileInput && fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }
            // Explicitly requesting a long timeout for AI? Standard fetch has no timeout but browsers do.
            const response = yield fetch(`${API_BASE_URL}/ai/generate-quiz`, {
                method: 'POST',
                body: formData
            });
            const data = yield response.json();
            if (response.ok) {
                let quizContent = data.content;
                // Clean up if wrapped in strings or markdown
                if (typeof quizContent === 'string') {
                    // If backend didn't clean it enough
                    try {
                        quizContent = JSON.parse(quizContent);
                    }
                    catch (e) {
                        console.error("Failed to parse", quizContent);
                        throw new Error("AI returned invalid JSON format.");
                    }
                }
                window.generatedQuizData = {
                    title: topic,
                    questions: quizContent
                };
                // Render Preview
                renderQuizPreview(quizContent, true);
                resultContainer.classList.remove('d-none');
                // Populate dropdwon if needed
                // Populate options
                if (typeof updateQuizTargetOptions === 'function') {
                    updateQuizTargetOptions();
                } else {
                    console.warn("updateQuizTargetOptions not found");
                }
            }
            else {
                alert("Error: " + (data.detail || "Failed to generate quiz."));
            }
        }
        catch (error) {
            console.error(error);
            alert("Failed to generate quiz: " + error.message);
        }
        finally {
            btn.innerHTML = '✨ Generate Quiz';
            btn.disabled = false;
        }
    });
}
function updateSaveValues() {
    return __awaiter(this, void 0, void 0, function* () {
        // Populate Groups Helper
        const select = document.getElementById('save-quiz-group-select');
        if (!select)
            return;
        // Try to ensure we have groups
        if (!appState.groups || appState.groups.length === 0) {
            try {
                const endpoint = appState.role === 'Student' ? `/students/${appState.activeStudentId}/groups` : '/groups';
                const res = yield fetchAPI(endpoint);
                if (res.ok) {
                    appState.groups = yield res.json();
                }
            }
            catch (e) {
                console.error("Failed to fetch groups for dropdown", e);
            }
        }
        select.innerHTML = '';
        if (appState.groups && appState.groups.length > 0) {
            appState.groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                if (appState.currentCourseId && g.id == appState.currentCourseId)
                    opt.selected = true;
                select.appendChild(opt);
            });
        }
        else {
            const opt = document.createElement('option');
            opt.textContent = "No courses found";
            select.appendChild(opt);
        }
    });
}
function renderQuizPreview(questions, showAnswers) {
    const container = document.getElementById('quiz-preview-content');
    if (!container)
        return;
    container.innerHTML = questions.map((q, i) => `
        <div class="mb-3 border-bottom pb-2">
            <strong class="d-block mb-1">Q${i + 1}: ${q.question}</strong>
            <ul class="list-unstyled ps-3 mb-1">
                ${q.options.map(opt => {
        // Logic: If showAnswers is true, highlight specific one. Else normal.
        const isCorrect = opt === q.correct_answer;
        const styleClass = (showAnswers && isCorrect) ? 'text-success fw-bold' : '';
        const icon = (showAnswers && isCorrect) ? '<span class="material-icons align-middle fs-6">check</span>' : '';
        return `<li class="${styleClass}">${icon} ${opt}</li>`;
    }).join('')}
            </ul>
        </div>
    `).join('');
}
function toggleQuizAnswers() {
    const isChecked = document.getElementById('toggle-quiz-answers').checked;
    if (window.generatedQuizData && window.generatedQuizData.questions) {
        renderQuizPreview(window.generatedQuizData.questions, isChecked);
    }
}

// Logic to handle AI Quiz Allocation
function updateQuizTargetOptions() {
    const type = document.getElementById('quiz-target-type').value;
    const select = document.getElementById('save-quiz-target-select');
    select.innerHTML = '<option>Loading...</option>';

    if (type === 'group') {
        updateSaveValues().then(() => {
            // updateSaveValues populates save-quiz-group-select (legacy), we need to copy or reuse.
            // But let's just repopulate here for clarity
            select.innerHTML = '';
            if (appState.groups && appState.groups.length > 0) {
                appState.groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    select.appendChild(opt);
                });
            } else {
                select.innerHTML = '<option value="">No Groups Found</option>';
            }
        });
    } else if (type === 'grade') {
        // Hardcoded Grades for now, or fetch from system settings if available
        select.innerHTML = '';
        [9, 10, 11, 12].forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = `Grade ${g}`;
            select.appendChild(opt);
        });
    } else if (type === 'section') {
        select.innerHTML = '<option>Loading Sections...</option>';
        fetchAPI('/sections')
            .then(res => res.json())
            .then(sections => {
                select.innerHTML = '';
                if (Array.isArray(sections) && sections.length > 0) {
                    // Sort helper
                    sections.sort((a, b) => (a.grade_level - b.grade_level) || a.name.localeCompare(b.name));

                    sections.forEach(sec => {
                        const opt = document.createElement('option');
                        opt.value = sec.id;
                        opt.textContent = `Grade ${sec.grade_level} - Section ${sec.name}`;
                        select.appendChild(opt);
                    });
                } else {
                    select.innerHTML = '<option value="">No Sections Found</option>';
                }
            })
            .catch(err => {
                console.error("Failed to load sections", err);
                select.innerHTML = '<option value="">Error loading sections</option>';
            });

    } else if (type === 'student') {
        // Use appState.allStudents (Teacher View)
        select.innerHTML = '';
        if (appState.allStudents && appState.allStudents.length > 0) {
            appState.allStudents.forEach(s => {
                const sSafe = s || {};
                // Handle inconsistent backend key casing/naming
                const id = sSafe.id || sSafe.ID || sSafe.student_id || sSafe.Id;
                const name = sSafe.name || sSafe.Name || sSafe.student_name || "Unknown";

                if (id) {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = `${name} (${id})`;
                    select.appendChild(opt);
                }
            });
        } else {
            select.innerHTML = '<option value="">No Students Loaded</option>';
        }
    }
}

// Global function to save the quiz
window.saveGeneratedQuiz = function () {
    return __awaiter(this, void 0, void 0, function* () {
        const targetType = document.getElementById('quiz-target-type').value;
        const targetId = document.getElementById('save-quiz-target-select').value;
        const timeLimit = document.getElementById('quiz-time-limit').value;

        console.log("Saving Quiz...", { targetType, targetId, hasData: !!window.generatedQuizData });

        if (!targetId) {
            alert("Please select a target (Course, Grade, or Student).");
            return;
        }

        // Validate Acknowledgment
        const ackCb = document.getElementById('quiz-acknowledge-cb');
        if (ackCb && !ackCb.checked) {
            alert("Please acknowledge that you have reviewed the questions and alignment with the curriculum.");
            return;
        }

        if (!window.generatedQuizData) {
            alert("No quiz data found to save. Please regenerate the quiz.");
            return;
        }

        const btn = document.querySelector('#quiz-save-area button');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = 'Saving...';

        // If Type is 'group', we treat it as legacy group_id for backward compatibility in backend logic if needed,
        // but ideally we send everything as new fields.

        try {
            const payload = {
                title: window.generatedQuizData.title,
                questions: window.generatedQuizData.questions,
                target_type: targetType,
                target_id: targetId,
                time_limit: parseInt(timeLimit) || 0,
                acknowledged: true
            };

            // If target is group, we also map to group_id for legacy 'quizzes' table structure if we haven't fully migrated
            if (targetType === 'group') {
                payload.group_id = parseInt(targetId);
            } else {
                // For student/grade, group_id might be null or specific placeholder
                payload.group_id = null;
            }

            const res = yield fetchAPI('/quizzes/create', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert("Quiz Assigned Successfully!");
                // Reset
                document.getElementById('quiz-result-container').classList.add('d-none');

                // Refresh views if applicable
                if (targetType === 'group' && appState.currentCourseId == targetId && typeof loadCourseQuizzes === 'function') {
                    loadCourseQuizzes(targetId);
                }
            }
            else {
                const err = yield res.json();
                alert("Failed to save: " + (err.detail || "Unknown error"));
            }
        }
        catch (e) {
            alert("Error saving: " + e.message);
        }
        finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });
};

function sendAccessCardEmail() {
    return __awaiter(this, void 0, void 0, function* () {
        const studentId = document.getElementById('card-student-id').textContent;
        const btn = document.getElementById('btn-email-card');
        // Check if ID looks like an email
        if (!studentId.includes('@')) {
            alert("Email feature only works for users registered with an Email ID (e.g. Google Login).");
            return;
        }
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending...';
        btn.disabled = true;
        try {
            const response = yield fetchAPI(`/students/${studentId}/email-code`, { method: 'POST' });
            const data = yield response.json();
            if (response.ok) {
                alert(data.message);
            }
            else {
                alert("Error: " + data.detail);
            }
        }
        catch (e) {
            alert("Network error sending email.");
        }
        finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}
// --- MOBILE UI LOGIC ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    // Toggle class on sidebar
    if (sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
        if (overlay)
            overlay.classList.remove('active');
    }
    else {
        sidebar.classList.add('mobile-open');
        if (overlay)
            overlay.classList.add('active');
    }
}
// --- WHITEBOARD LOGIC ---
var whiteboardManager = { // var: shared with script.js
    socket: null,
    canvas: null,
    ctx: null,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    color: '#000000',
    width: 2,
    init: function () {
        this.canvas = document.getElementById('whiteboard-canvas');
        if (!this.canvas)
            return; // Guard
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        // Events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousedown", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        }, false);
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent("mousemove", {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        }, false);
        // Controls
        const colorInput = document.getElementById('wb-color');
        if (colorInput)
            colorInput.addEventListener('input', (e) => this.color = e.target.value);
        const widthInput = document.getElementById('wb-width');
        if (widthInput)
            widthInput.addEventListener('input', (e) => this.width = e.target.value);
        // Window resize
        window.addEventListener('resize', () => this.resize());
    },
    connect: function () {
        if (this.socket)
            return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Handle both localhost and production socket URLs
        let wsUrl = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
            ? 'ws://127.0.0.1:8000/ws/whiteboard'
            : `${protocol}//${window.location.host}/ws/whiteboard`;
        // Explicit override based on API_BASE_URL (Render/WebSocket)
        if (API_BASE_URL.includes('onrender')) {
            const backendRoot = API_BASE_URL.replace('/api', '');
            wsUrl = backendRoot.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws/whiteboard';
        }
        this.socket = new WebSocket(wsUrl);
        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'draw') {
                this.drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.width, false);
            }
            else if (data.type === 'clear') {
                this.clearCanvas(false);
            }
        };
        this.socket.onopen = () => console.log("Whiteboard Connected");
        this.socket.onclose = () => {
            console.log("Whiteboard Disconnected");
            this.socket = null;
        };
    },
    resize: function () {
        if (!this.canvas)
            return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },
    startDrawing: function (e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
    },
    draw: function (e) {
        if (!this.isDrawing)
            return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.drawLine(this.lastX, this.lastY, x, y, this.color, this.width, true);
        [this.lastX, this.lastY] = [x, y];
    },
    stopDrawing: function () {
        this.isDrawing = false;
    },
    drawLine: function (x0, y0, x1, y1, color, width, emit) {
        this.ctx.beginPath();
        this.ctx.moveTo(x0, y0);
        this.ctx.lineTo(x1, y1);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
        if (emit && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'draw',
                x0: x0, y0: y0, x1: x1, y1: y1,
                color: color,
                width: width
            }));
        }
    },
    clearCanvas: function (emit) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (emit && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'clear' }));
        }
    }
};
function openWhiteboard() {
    // Show Modal
    openView('whiteboardModal');
    setTimeout(() => {
        whiteboardManager.init();
        whiteboardManager.connect();
    }, 50);
}
function clearWhiteboard() {
    whiteboardManager.clearCanvas(true);
}
// --- EXPORT FUNCTIONALITY ---
function exportTeacherData() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.isLoggedIn || (appState.role !== 'Teacher' && appState.role !== 'Admin')) {
            alert("Unauthorized access.");
            return;
        }
        try {
            const response = yield fetch(`${API_BASE_URL}/teacher/export-grades-csv`, {
                method: 'GET',
                headers: {
                    'X-User-Role': appState.role,
                    'X-User-Id': appState.userId
                }
            });
            if (!response.ok) {
                const errorText = yield response.text();
                throw new Error(`Export failed: ${response.status} - ${errorText}`);
            }
            const blob = yield response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Use a generic name or formatted date
            const date = new Date().toISOString().split('T')[0];
            a.download = `noble_nexus_grades_${date}.csv`;
            document.body.appendChild(a);
            a.click();
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
        catch (error) {
            console.error("Export error:", error);
            alert(`Failed to export grades. ${error.message}`);
        }
    });
}
// --- LMS COURSE LOGIC (Phase 1 & 2) ---
function openCourseDetail(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Opening course:", groupId);
        try {
            if (!groupId)
                throw new Error("Invalid Course ID");
            appState.currentCourseId = groupId;
            // 1. Force Switch View
            // Use simpler logic to avoid any potential switchView issues
            document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
            const detailView = document.getElementById('course-detail-view');
            if (detailView)
                detailView.classList.add('active');
            else
                throw new Error("Course Detail View Element Missing");
            // 2. Fetch/Find Metadata Safe Mode
            let course = null;
            if (Array.isArray(appState.groups)) {
                course = appState.groups.find(g => g && g.id == groupId);
            }
            if (!course) {
                console.log("Course not in cache, fetching...");
                try {
                    const endpoint = appState.role === 'Student' ? `/students/${appState.activeStudentId}/groups` : '/groups';
                    const res = yield fetchAPI(endpoint);
                    const groups = yield res.json();
                    if (Array.isArray(groups)) {
                        course = groups.find(g => g && g.id == groupId);
                    }
                }
                catch (e) {
                    console.error("Error fetching course details:", e);
                    // Don't crash, just show what we have (or dont have)
                }
            }
            if (course) {
                const titleEl = document.getElementById('course-title');
                const descEl = document.getElementById('course-desc');
                const badgeEl = document.getElementById('course-subject-badge');
                if (titleEl)
                    titleEl.textContent = course.name || 'Untitled Course';
                if (descEl)
                    descEl.textContent = course.description || 'No description provided.';
                if (badgeEl)
                    badgeEl.textContent = course.subject || 'General';
            }
            else {
                console.warn("Course metadata not found for ID:", groupId);
                // Optional: Alert user? Or just let them see empty state?
            }
            // 3. UI Controls for Teachers
            const isTeacher = appState.role === 'Teacher' || appState.role === 'Admin';
            const uploadBtn = document.getElementById('upload-material-btn');
            const manageBtn = document.getElementById('manage-members-btn');
            if (uploadBtn) {
                if (isTeacher)
                    uploadBtn.classList.remove('d-none');
                else
                    uploadBtn.classList.add('d-none');
            }
            if (manageBtn) {
                if (isTeacher)
                    manageBtn.classList.remove('d-none');
                else
                    manageBtn.classList.add('d-none');
            }
            const createAsgBtn = document.getElementById('create-assignment-btn');
            if (createAsgBtn) {
                if (isTeacher)
                    createAsgBtn.classList.remove('d-none');
                else
                    createAsgBtn.classList.add('d-none');
            }
            const addVideoBtn = document.getElementById('add-video-btn');
            if (addVideoBtn) {
                if (isTeacher)
                    addVideoBtn.classList.remove('d-none');
                else
                    addVideoBtn.classList.add('d-none');
            }
            // 4. Load Content safetly
            if (typeof loadCourseMaterials === 'function')
                loadCourseMaterials(groupId).catch(e => console.error(e));
            if (typeof loadCourseQuizzes === 'function')
                loadCourseQuizzes(groupId).catch(e => console.error(e));
            if (typeof loadCourseMembers === 'function')
                loadCourseMembers(groupId).catch(e => console.error(e));
            if (typeof loadCourseAssignments === 'function')
                loadCourseAssignments(groupId).catch(e => console.error(e));
        }
        catch (err) {
            console.error("Critical error in openCourseDetail:", err);
            alert("Unable to open course: " + err.message);
        }
    });
}
// 1. MATERIALS (With Uploads)
// 1. MATERIALS (With Uploads)
// VIDEO LOGIC
function openAddVideoModal() {
    document.getElementById('add-video-form').reset();
    openView('addVideoModal');
}
// GENERIC FILE UPLOAD
function handleMaterialUpload(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.currentCourseId)
            return;
        const file = input.files[0];
        if (!file)
            return;
        if (!confirm(`Upload "${file.name}" to this course?`)) {
            input.value = '';
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        // Use filename as default title
        formData.append('title', file.name);
        try {
            // Note: fetchAPI wrapper might not handle FormData correctly if it forces JSON headers.
            // We'll use raw fetch for upload if needed, or adjust headers.
            // Let's try raw fetch to be safe with FormData boundary.
            const token = localStorage.getItem('access_token'); // If you use tokens
            // Construct URL manually since we need special headers (or lack thereof for boundary)
            const res = yield fetch(`${API_BASE_URL}/groups/${appState.currentCourseId}/upload?title=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                headers: {
                    'X-User-Role': appState.role || '',
                    'X-User-Id': appState.userId || ''
                },
                body: formData
            });
            if (res.ok) {
                alert("File uploaded successfully!");
                loadCourseMaterials(appState.currentCourseId);
            }
            else {
                const err = yield res.json();
                alert("Upload failed: " + (err.detail || 'Unknown error'));
            }
        }
        catch (e) {
            console.error(e);
            alert("Error uploading file.");
        }
        finally {
            input.value = ''; // Reset input
        }
    });
}
function handleAddVideo() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!appState.currentCourseId)
            return;
        const title = document.getElementById('video-title').value;
        const url = document.getElementById('video-url').value;
        if (!title || !url) {
            alert("Please enter both title and URL.");
            return;
        }
        try {
            const res = yield fetchAPI(`/groups/${appState.currentCourseId}/materials`, {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    type: 'Video',
                    content: url
                })
            });
            if (res.ok) {
                alert("Video added successfully!");
                closeView();
                loadCourseMaterials(appState.currentCourseId);
            }
            else {
                alert("Failed to add video.");
            }
        }
        catch (e) {
            console.error(e);
            alert("Error adding video.");
        }
    });
}
function loadCourseMaterials(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('materials-list');
        if (!list) {
            console.warn("materials-list element missing");
            return;
        }
        list.innerHTML = '<p class="text-muted">Loading...</p>';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/materials`);
            if (!res.ok) {
                list.innerHTML = '<p class="text-danger small">Failed to load materials.</p>';
                return;
            }
            const materials = yield res.json();
            if (!Array.isArray(materials)) {
                // Handle edge case where backend returns object
                console.error("Expected array for materials, got:", materials);
                list.innerHTML = '<p class="text-danger small">Invalid data received.</p>';
                return;
            }
            if (materials.length === 0) {
                list.innerHTML = '<p class="text-muted small">No materials uploaded yet.</p>';
                return;
            }
            list.innerHTML = materials.map(m => {
                let icon = 'description';
                let color = 'bg-light text-dark';
                // Safe content check
                const contentUrl = m.content || '';
                const type = m.type || 'Note';
                if (type === 'PDF') {
                    icon = 'picture_as_pdf';
                    color = 'bg-danger text-white';
                }
                if (type === 'Video') {
                    icon = 'play_circle';
                    color = 'bg-primary text-white';
                }
                if (type === 'Image') {
                    icon = 'image';
                    color = 'bg-success text-white';
                }
                let downloadLink = '';
                if (contentUrl.startsWith('/') || contentUrl.startsWith('http')) {
                    // Formatting URL safely
                    const fullUrl = contentUrl.startsWith('http') ? contentUrl : `${API_BASE_URL.replace('/api', '')}${contentUrl}`;
                    const btnText = type === 'Video' ? 'Watch' : 'Open';
                    downloadLink = `<a href="${fullUrl}" target="_blank" class="btn btn-sm btn-outline-primary">${btnText}</a>`;
                }
                return `
                <div class="col-md-6">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body d-flex align-items-center gap-3">
                            <div class="rounded p-2 ${color}"><span class="material-icons">${icon}</span></div>
                            <div class="flex-grow-1">
                                <h6 class="mb-0 fw-bold text-truncate">${m.title || 'Untitled'}</h6>
                                <small class="text-muted">${m.date || ''}</small>
                            </div>
                            ${downloadLink}
                        </div>
                    </div>
                </div>
            `;
            }).join('');
        }
        catch (e) {
            console.error(e);
            if (list)
                list.innerHTML = '<p class="text-danger small">Error loading materials</p>';
        }
    });
}
// 2. QUIZZES (Persistent)
function loadCourseQuizzes(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('quizzes-list');
        if (!list)
            return;
        list.innerHTML = '<p class="text-muted">Loading...</p>';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/quizzes`);
            if (!res.ok)
                throw new Error("API Failure");
            const quizzes = yield res.json();
            if (!Array.isArray(quizzes)) {
                list.innerHTML = '<p class="text-muted small">No quizzes.</p>';
                return;
            }
            if (quizzes.length === 0) {
                list.innerHTML = '<p class="text-muted small">No quizzes assigned.</p>';
                return;
            }
            list.innerHTML = quizzes.map(q => {
                let viewResultsBtn = '';
                if (['Teacher', 'Admin', 'Super Admin', 'Principal', 'Tenant_Admin'].includes(appState.role)) {
                    viewResultsBtn = `
                        <button class="btn btn-outline-info btn-sm fw-bold ms-2" onclick="viewQuizResults('${q.id}', '${q.title}')">
                            <span class="material-icons align-middle fs-6" style="font-size: 16px;">analytics</span> View Results
                        </button>`;
                }

                return `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="mb-1 fw-bold">${q.title}</h6>
                        <small class="text-muted">${q.question_count} Questions • Created ${new Date(q.created_at).toLocaleDateString()}</small>
                    </div>
                    <div>
                        ${viewResultsBtn}
                        <button class="btn btn-primary btn-sm fw-bold ms-2" onclick="takeQuiz('${q.id}')">
                            ${appState.role === 'Student' ? 'Start Quiz' : 'Preview Quiz'}
                        </button>
                    </div>
                </div>
            `;
            }).join('');
        }
        catch (e) {
            list.innerHTML = '<p class="text-danger small">Error loading quizzes</p>';
        }
    });
}

async function loadTeacherQuizzes() {
    const list = document.getElementById('teacher-quiz-list');
    if (!list) return;

    list.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="text-muted mt-2">Loading Quizzes...</p></div>';

    try {
        const res = await fetchAPI('/teacher/quizzes');
        if (res.ok) {
            const quizzes = await res.json();
            if (quizzes.length === 0) {
                list.innerHTML = '<div class="text-center py-5 text-muted">No quizzes assignments found.</div>';
                return;
            }

            list.innerHTML = quizzes.map(q => `
                <div class="list-group-item d-flex justify-content-between align-items-center p-3">
                    <div>
                        <h6 class="mb-1 fw-bold text-dark">${q.title}</h6>
                        <small class="text-muted">
                            <span class="badge bg-light text-dark border me-2">${q.target_type === 'grade' ? 'Grade ' + q.target_id : (q.target_type === 'group' ? 'Course ID: ' + q.group_id : 'Student: ' + q.target_id)}</span>
                            Questions: ${q.question_count} &bull; Created: ${new Date(q.created_at).toLocaleDateString()}
                        </small>
                    </div>
                    <button class="btn btn-sm btn-primary-custom" onclick="viewQuizResults('${q.id}', '${q.title}')">
                        View Results
                    </button>
                </div>
            `).join('');
        } else {
            list.innerHTML = '<div class="text-center py-5 text-danger">Failed to load quizzes.</div>';
        }
    } catch (e) {
        console.error(e);
        list.innerHTML = `<div class="text-center py-5 text-danger">Network Error: ${e.message}</div>`;
    }
}

function viewQuizResults(quizId, title) {
    if (!quizId) return;
    let modalEl = document.getElementById('teacherQuizResultsModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'teacherQuizResultsModal';
        modalEl.className = 'view full-page-view';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
        <style>
            #teacherQuizResultsModal .tqr-shell { background: #f4f6fb; }
            #teacherQuizResultsModal .tqr-header { background: linear-gradient(135deg, #f9fbff 0%, #eef3ff 100%); }
            #teacherQuizResultsModal .tqr-dialog {
                max-width: 1240px;
                margin: 1.25rem auto;
                width: calc(100% - 1.5rem);
            }
            #teacherQuizResultsModal .tqr-body {
                max-height: calc(100vh - 180px);
                overflow: auto;
            }
            #teacherQuizResultsModal .tqr-stats-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 14px;
            }
            #teacherQuizResultsModal .tqr-stat-card {
                border: 1px solid rgba(13, 110, 253, 0.12);
                border-radius: 16px;
                background: #fff;
                box-shadow: 0 8px 18px rgba(26, 35, 126, 0.06);
            }
            #teacherQuizResultsModal .tqr-stat-value { font-size: 2rem; line-height: 1; }
            #teacherQuizResultsModal .tqr-table-wrap {
                background: #fff;
                border-radius: 16px;
                border: 1px solid rgba(15, 23, 42, 0.08);
                overflow: hidden;
            }
            #teacherQuizResultsModal .tqr-table thead th {
                background: #f8fafc;
                font-weight: 700;
                color: #334155;
                border-bottom: 1px solid #e2e8f0;
            }
            #teacherQuizResultsModal .tqr-table tbody tr:hover { background: #f8fbff; }
            #teacherQuizResultsModal .tqr-score-pill {
                min-width: 64px;
                border-radius: 999px;
                padding: 0.4rem 0.75rem;
                font-weight: 700;
                display: inline-block;
                text-align: center;
            }
            #teacherQuizResultsModal .tqr-feedback {
                max-width: 360px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            @media (max-width: 768px) {
                #teacherQuizResultsModal .tqr-dialog {
                    width: calc(100% - 1rem);
                    margin: 0.5rem auto;
                }
                #teacherQuizResultsModal .tqr-stats-grid { grid-template-columns: 1fr; }
                #teacherQuizResultsModal .tqr-stat-value { font-size: 1.5rem; }
                #teacherQuizResultsModal .tqr-feedback { max-width: 180px; }
            }
        </style>
        <div class="modal-dialog modal-dialog-scrollable tqr-dialog">
            <div class="modal-content border-0 shadow-lg rounded-4 tqr-shell">
                <div class="modal-header tqr-header border-bottom">
                    <h5 class="modal-title fw-bold text-dark">
                        <span class="material-icons align-middle me-2">analytics</span>
                        Quiz Results: <span id="tqr-title"></span>
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body p-4 tqr-body">
                    <div id="tqr-content">Loading...</div>
                </div>
                <div class="modal-footer border-top-0">
                     <button type="button" class="btn btn-outline-secondary rounded-pill px-4" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modalEl);
    }

    document.getElementById('tqr-title').textContent = title || 'Untitled Quiz';
    const contentDiv = document.getElementById('tqr-content');
    contentDiv.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary"></div>
            <p class="text-muted mt-3 mb-0">Fetching grades...</p>
        </div>
    `;
    openView(modalEl.id);

    fetchAPI(`/quizzes/${quizId}/results`)
        .then(res => res.json())
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                contentDiv.innerHTML = `
                    <div class="text-center py-5">
                        <span class="material-icons fs-1 text-muted">assignment_late</span>
                        <p class="text-muted mt-2">No students have taken this quiz yet.</p>
                    </div>
                `;
                return;
            }

            const safe = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[ch]));

            const normalizedRows = data.map(row => ({
                student_name: row.student_name || 'Unknown Student',
                student_id: row.student_id || '-',
                score: Number(row.score) || 0,
                submitted_at: row.submitted_at,
                ai_feedback: row.ai_feedback || ''
            }));
            normalizedRows.sort((a, b) => b.score - a.score);

            // Calculate Stats
            const scores = normalizedRows.map(d => d.score);
            const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
            const max = Math.max(...scores);
            const passed = normalizedRows.filter(r => r.score >= 50).length;

            let html = `
                <div class="tqr-stats-grid mb-4">
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Average Score</div>
                        <div class="tqr-stat-value fw-bold text-primary mt-2">${avg}%</div>
                    </div>
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Highest Score</div>
                        <div class="tqr-stat-value fw-bold text-success mt-2">${max}%</div>
                    </div>
                    <div class="tqr-stat-card p-3 text-center h-100">
                        <div class="text-muted small text-uppercase fw-semibold">Pass Rate</div>
                        <div class="tqr-stat-value fw-bold text-dark mt-2">${Math.round((passed / normalizedRows.length) * 100)}%</div>
                        <div class="small text-muted mt-1">${normalizedRows.length} attempts</div>
                    </div>
                </div>

                <div class="tqr-table-wrap">
                    <div class="table-responsive">
                        <table class="table tqr-table align-middle mb-0">
                            <thead>
                            <tr>
                                <th>#</th>
                                <th>Student</th>
                                <th>Score</th>
                                <th>Submitted At</th>
                                <th>Feedback</th>
                            </tr>
                            </thead>
                        <tbody>
            `;

            normalizedRows.forEach((row, idx) => {
                let scoreClass = 'bg-danger-subtle text-danger';
                if (row.score >= 80) scoreClass = 'bg-success-subtle text-success';
                else if (row.score >= 50) scoreClass = 'bg-warning-subtle text-warning-emphasis';

                html += `
                    <tr>
                        <td class="text-muted fw-semibold">${idx + 1}</td>
                        <td>
                            <div class="fw-semibold text-dark">${safe(row.student_name)}</div>
                            <small class="text-muted">${safe(row.student_id)}</small>
                        </td>
                        <td><span class="tqr-score-pill ${scoreClass}">${row.score}%</span></td>
                        <td class="text-nowrap">${row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '-'}</td>
                        <td>
                            <small class="text-muted tqr-feedback d-inline-block" title="${safe(row.ai_feedback || 'No feedback')}">
                                ${safe(row.ai_feedback || 'No feedback')}
                            </small>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table></div></div>`;
            contentDiv.innerHTML = html;
        })
        .catch(err => {
            console.error(err);
            contentDiv.innerHTML = '<div class="alert alert-danger mb-0">Failed to load results.</div>';
        });
}
// 4. MEMBERS
function loadCourseMembers(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const list = document.getElementById('course-members-list');
        if (!list)
            return;
        list.innerHTML = 'Loading...';
        try {
            const res = yield fetchAPI(`/groups/${groupId}/members`);
            if (!res.ok)
                throw new Error("API Failure");
            const data = yield res.json();
            // Safety check for members array
            const memberIds = Array.isArray(data.members) ? data.members : [];
            const members = appState.allStudents.filter(s => memberIds.includes(s.id));
            if (members.length === 0)
                list.innerHTML = '<p class="text-muted small">No students enrolled.</p>';
            else {
                list.innerHTML = members.map(m => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${m.name}</span>

                </li>
            `).join('');
            }
        }
        catch (e) {
            list.innerHTML = 'Error loading members.';
        }
    });
}
// Ensure Manage Members Modal works from new view
function openManageMembersModal() {
    // Current course ID is set globally
    const course = appState.groups.find(g => g.id == appState.currentCourseId);
    if (!course)
        return;
    openManageMembers(course.id, course.name);
}
// --- AI LESSON PLANNER ---
function generateLessonPlan() {
    return __awaiter(this, void 0, void 0, function* () {
        const topic = document.getElementById('lp-topic').value;
        const grade = document.getElementById('lp-grade').value;
        const subject = document.getElementById('lp-subject').value;
        const duration = document.getElementById('lp-duration').value;
        const desc = document.getElementById('lp-description').value;
        const fileInput = document.getElementById('lp-pdf');
        if (!topic || !grade) {
            alert("Please enter a topic and grade.");
            return;
        }
        const loading = document.getElementById('lp-loading');
        const result = document.getElementById('lp-result');
        loading.classList.remove('d-none');
        result.classList.add('d-none');
        result.innerHTML = '';
        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('grade', grade);
            formData.append('subject', subject);
            formData.append('duration_mins', duration);
            formData.append('description', desc);
            if (fileInput && fileInput.files[0]) {
                formData.append('file', fileInput.files[0]);
            }
            const headers = {};
            if (appState.isLoggedIn && appState.role) {
                headers['X-User-Role'] = appState.role;
            }
            const response = yield fetch(`${API_BASE_URL}/ai/lesson-plan`, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            const data = yield response.json();
            loading.classList.add('d-none');
            result.classList.remove('d-none');
            if (response.ok) {
                // Simple markdown parsing
                let html = data.content
                    .replace(/### (.*)/g, '<h5 class="fw-bold mt-3 text-info">$1</h5>')
                    .replace(/## (.*)/g, '<h4 class="fw-bold mt-4 text-primary-custom border-bottom pb-2">$1</h4>')
                    .replace(/\*\* (.*?) \*\*/g, '<strong>$1</strong>')
                    .replace(/\* (.*)/g, '<li>$1</li>');
                result.innerHTML = html;
            }
            else {
                result.innerHTML = `<span class="text-danger fw-bold">Error: ${data.detail || 'Failed to generate plan.'}</span>`;
            }
        }
        catch (error) {
            loading.classList.add('d-none');
            result.classList.remove('d-none');
            result.innerHTML = `<span class="text-danger">Network Error: ${error.message}</span>`;
        }
    });
}
// --- ASSIGNMENTS LOGIC ---
