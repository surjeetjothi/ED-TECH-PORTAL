/** lms.js — Learning Management System: Catalog, Player, Modules, Quiz, Chat */
function loadLMSCatalog() {
    return __awaiter(this, void 0, void 0, function* () {
        const search = document.getElementById('lms-search').value;
        const category = document.getElementById('lms-category-filter').value;
        const grid = document.getElementById('lms-course-grid');
        grid.innerHTML = CB.ui.spinner('Loading courses...');
        // Switch View if not already
        if (!document.getElementById('lms-catalog-view').classList.contains('active')) {
            switchView('lms-catalog-view');
        }
        let query = `/lms/courses?category=${encodeURIComponent(category)}`;
        if (search)
            query += `&search=${encodeURIComponent(search)}`;
        try {
            const response = yield fetchAPI(query);
            const courses = yield response.json();
            renderLMSCatalog(courses);
        }
        catch (e) {
            console.error(e);
            grid.innerHTML = `<div class="alert alert-danger">Failed to load courses.</div>`;
        }
    });
}
function renderLMSCatalog(courses) {
    const grid = document.getElementById('lms-course-grid');
    grid.innerHTML = '';
    // "Create Course" Card for Teachers
    if (appState.role === 'Teacher' || appState.isSuperAdmin) {
        const createCard = document.createElement('div');
        createCard.className = 'col-md-6 col-lg-4 col-xl-3';
        createCard.innerHTML = `
            <div class="card h-100 border-2 border-dashed d-flex align-items-center justify-content-center bg-white text-muted shadow-sm hover-up" 
                 style="cursor: pointer; min-height: 320px; border-color: #dee2e6 !important;"
                 data-bs-toggle="modal" data-bs-target="#lmsCreateCourseModal">
                <div class="text-center p-4">
                    <div class="bg-light rounded-circle d-inline-flex p-3 mb-3 text-primary">
                        <span class="material-icons fs-2">add</span>
                    </div>
                    <h5 class="fw-bold text-dark">Create New Course</h5>
                    <p class="small text-muted mb-0">Design your curriculum</p>
                </div>
            </div>
        `;
        grid.appendChild(createCard);
    }
    if (courses.length === 0 && appState.role !== 'Teacher') {
        grid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-3">
                    <span class="material-icons text-muted" style="font-size: 64px; opacity: 0.3;">school</span>
                </div>
                <h5 class="fw-bold text-muted">No courses found</h5>
                <p class="text-muted">Try adjusting your filters or search query.</p>
            </div>
        `;
    }
    courses.forEach(course => {
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 col-xl-3';
        const thumb = course.thumbnail_url || 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?ixlib=rb-1.2.1&auto=format&fit=crop&w=500&q=60';
        col.innerHTML = `
            <div class="card h-100 shadow-sm border-0 overflow-hidden hover-up" style="transition: transform 0.2s, box-shadow 0.2s;">
                <div class="position-relative">
                    <div style="height: 160px; background: url('${thumb}') center/cover;"></div>
                    <span class="badge bg-white text-primary position-absolute top-0 start-0 m-3 shadow-sm px-3 py-2 rounded-pill fw-bold" style="font-size: 0.75rem; letter-spacing: 0.5px;">
                        ${course.category}
                    </span>
                </div>
                <div class="card-body p-4 d-flex flex-column">
                    <h5 class="fw-bold mb-2 text-dark text-truncate" title="${course.title}">${course.title}</h5>
                    <p class="text-muted small flex-grow-1 text-clamp-3" style="line-height: 1.6;">${course.description || 'No description available for this course.'}</p>
                    
                    <div class="d-flex align-items-center justify-content-between mt-4 pt-3 border-top border-light">
                        <div class="d-flex align-items-center">
                            <span class="material-icons text-warning fs-6 me-1">star</span>
                            <small class="fw-bold text-dark">4.8</small>
                            <small class="text-muted ms-1">(24)</small>
                        </div>
                        <button onclick="launchLMSPlayer(${course.id})" class="btn btn-sm btn-primary rounded-pill px-4 fw-medium">
                            ${appState.role === 'Teacher' ? 'Manage' : 'Start'}
                        </button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(col);
    });
}
function submitLMSCourse() {
    return __awaiter(this, void 0, void 0, function* () {
        const title = document.getElementById('lms-course-title').value;
        const desc = document.getElementById('lms-course-desc').value;
        const cat = document.getElementById('lms-course-category').value;
        const thumb = document.getElementById('lms-course-thumb').value;
        try {
            const res = yield fetchAPI('/lms/courses', {
                method: 'POST',
                body: JSON.stringify({ title, description: desc, category: cat, thumbnail_url: thumb })
            });
            if (res.ok) {
                closeView();
                document.getElementById('lms-create-course-form').reset();
                loadLMSCatalog();
            }
            else {
                alert('Failed to create course');
            }
        }
        catch (e) {
            alert('Error: ' + e.message);
        }
    });
}
function launchLMSPlayer(courseId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const res = yield fetchAPI(`/lms/courses/${courseId}/full`);
            if (!res.ok)
                throw new Error("Failed to load course");
            currentLMSCourse = yield res.json();
            // Update Player UI
            document.getElementById('lms-player-title').textContent = currentLMSCourse.title;
            // Calculate Progress (Mock)
            document.getElementById('lms-course-progress').style.width = '0%';
            document.getElementById('lms-course-progress-text').textContent = '0% Complete';
            renderLMSPlayerNav(currentLMSCourse);
            // Switch View
            switchView('lms-player-view');
            // Reset Content Area
            document.getElementById('lms-content-area').innerHTML = `
            <div class="text-center text-muted">
                <span class="material-icons" style="font-size: 64px; opacity: 0.3;">school</span>
                <h4 class="mt-3">Welcome to ${currentLMSCourse.title}</h4>
                <p>Select a module from the sidebar to begin.</p>
            </div>
        `;
        }
        catch (e) {
            alert("Error loading course: " + e.message);
        }
    });
}
function renderLMSPlayerNav(course) {
    const nav = document.getElementById('lms-player-nav');
    nav.innerHTML = '';
    // Allow Teachers to Add Sections
    if (appState.role === 'Teacher' || appState.isSuperAdmin) {
        const addSecBtn = document.createElement('button');
        addSecBtn.className = 'btn btn-sm btn-outline-primary w-100 mb-3';
        addSecBtn.innerHTML = '<i class="material-icons align-middle fs-6">add</i> Add Section';
        addSecBtn.onclick = () => {
            document.getElementById('lms-target-course-id').value = course.id;
            openView('lmsAddSectionModal');
        };
        nav.appendChild(addSecBtn);
    }
    if (!course.sections || course.sections.length === 0) {
        nav.innerHTML += '<p class="text-center small text-muted">No content yet.</p>';
    }
    course.sections.forEach((section, sIndex) => {
        const secDiv = document.createElement('div');
        secDiv.className = 'mb-3';
        const header = document.createElement('h6');
        header.className = 'fw-bold text-uppercase text-muted px-2 small mb-2 d-flex justify-content-between align-items-center interact-hover';
        header.innerHTML = `<span>${section.title}</span>`;
        if (appState.role === 'Teacher' || appState.isSuperAdmin) {
            const addModBtn = document.createElement('span');
            addModBtn.className = 'material-icons fs-6 text-primary';
            addModBtn.style.cursor = 'pointer';
            addModBtn.textContent = 'add_circle';
            addModBtn.title = 'Add Module';
            addModBtn.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('lms-target-section-id').value = section.id;
                openView('lmsAddModuleModal');
            };
            header.appendChild(addModBtn);
        }
        secDiv.appendChild(header);
        const listGroup = document.createElement('div');
        listGroup.className = 'list-group list-group-flush';
        section.modules.forEach((module, mIndex) => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action border-0 rounded px-2 py-2 d-flex align-items-center mb-1';
            let icon = 'description';
            if (module.type === 'video')
                icon = 'play_circle';
            if (module.type === 'quiz')
                icon = 'quiz';
            if (module.type === 'html')
                icon = 'article';
            // Check completion
            const isComplete = module.completion && (module.completion.status === 'Completed');
            const checkIcon = isComplete ? '<i class="material-icons ms-auto text-success fs-6">check_circle</i>' : '';
            item.innerHTML = `
                <i class="material-icons me-2 text-secondary fs-6">${icon}</i>
                <span class="small text-truncate text-start flex-grow-1">${module.title}</span>
                ${checkIcon}
            `;
            item.onclick = () => loadLMSModule(module, item);
            listGroup.appendChild(item);
        });
        secDiv.appendChild(listGroup);
        nav.appendChild(secDiv);
    });
}
function submitLMSSection() {
    return __awaiter(this, void 0, void 0, function* () {
        const courseId = document.getElementById('lms-target-course-id').value;
        const title = document.getElementById('lms-section-title').value;
        try {
            yield fetchAPI(`/lms/courses/${courseId}/sections`, {
                method: 'POST',
                body: JSON.stringify({ title, order_index: 99 })
            });
            closeView();
            document.getElementById('lms-section-title').value = '';
            launchLMSPlayer(courseId); // Reload
        }
        catch (e) {
            alert(e.message);
        }
    });
}
// --- LMS FIELD LOGIC ---
var quizQuestionCount = 0; // var: shared with script.js
function toggleLMSModuleFields() {
    const type = document.getElementById('lms-module-type').value;
    document.getElementById('lms-field-url').classList.add('d-none');
    document.getElementById('lms-field-text').classList.add('d-none');
    document.getElementById('lms-field-quiz').classList.add('d-none');
    if (type === 'html') {
        document.getElementById('lms-field-text').classList.remove('d-none');
    }
    else if (type === 'quiz') {
        document.getElementById('lms-field-quiz').classList.remove('d-none');
    }
    else {
        document.getElementById('lms-field-url').classList.remove('d-none');
    }
}
function addLMSQuizQuestion() {
    const container = document.getElementById('lms-quiz-builder-container');
    const id = quizQuestionCount++;
    const div = document.createElement('div');
    div.className = 'card p-3 mb-2 shadow-sm relative';
    // Add Type Selector
    div.innerHTML = `
        <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center mb-2">
                 <select class="form-select form-select-sm w-auto" name="q_type_${id}" onchange="toggleQuestionType(this, ${id})">
                    <option value="mcq">Multiple Choice</option>
                    <option value="short">Short Answer (AI Graded)</option>
                </select>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.card').remove()">x</button>
            </div>
           
            <input type="text" class="form-control form-control-sm mb-2" placeholder="Question Text" name="q_text_${id}">
            
            <!-- MCQ Options -->
            <div id="q_options_container_${id}">
                <div class="row g-2">
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option A" name="q_opt_a_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option B" name="q_opt_b_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option C" name="q_opt_c_${id}"></div>
                    <div class="col-6"><input type="text" class="form-control form-control-sm" placeholder="Option D" name="q_opt_d_${id}"></div>
                </div>
                <div class="mt-2">
                    <select class="form-select form-select-sm" name="q_correct_${id}">
                        <option value="A">Answer: A</option>
                        <option value="B">Answer: B</option>
                        <option value="C">Answer: C</option>
                        <option value="D">Answer: D</option>
                    </select>
                </div>
            </div>

            <!-- Short Answer Context -->
            <div id="q_context_container_${id}" class="d-none">
                <textarea class="form-control form-control-sm" rows="2" name="q_context_${id}" placeholder="Correct Answer / Model Response (for AI reference)"></textarea>
            </div>
        </div>
    `;
    container.appendChild(div);
}
function toggleQuestionType(select, id) {
    const val = select.value;
    const opts = document.getElementById(`q_options_container_${id}`);
    const ctx = document.getElementById(`q_context_container_${id}`);
    if (val === 'short') {
        opts.classList.add('d-none');
        ctx.classList.remove('d-none');
    }
    else {
        opts.classList.remove('d-none');
        ctx.classList.add('d-none');
    }
}
function submitLMSModule() {
    return __awaiter(this, void 0, void 0, function* () {
        const sectionId = document.getElementById('lms-target-section-id').value;
        const title = document.getElementById('lms-module-title').value;
        const type = document.getElementById('lms-module-type').value;
        let url = document.getElementById('lms-module-url').value;
        let text = document.getElementById('lms-module-text').value;
        if (type === 'quiz') {
            // Parse Quiz Data
            const questions = [];
            const container = document.getElementById('lms-quiz-builder-container');
            container.querySelectorAll('.card').forEach(cardEl => {
                const card = cardEl;
                // Determine type by checking selector existence or hidden state
                const typeSelector = card.querySelector('select[name^="q_type"]');
                const type = typeSelector ? typeSelector.value : 'mcq';
                const qText = card.querySelector('input[name^="q_text"]').value;
                if (qText) {
                    if (type === 'short') {
                        const ctx = card.querySelector('textarea[name^="q_context"]').value;
                        questions.push({
                            type: 'short',
                            question: qText,
                            context: ctx
                        });
                    }
                    else {
                        const optA = card.querySelector('input[name^="q_opt_a"]').value;
                        const optB = card.querySelector('input[name^="q_opt_b"]').value;
                        const optC = card.querySelector('input[name^="q_opt_c"]').value;
                        const optD = card.querySelector('input[name^="q_opt_d"]').value;
                        const correct = card.querySelector('select[name^="q_correct"]').value;
                        questions.push({
                            type: 'mcq',
                            question: qText,
                            options: { A: optA, B: optB, C: optC, D: optD },
                            answer: correct
                        });
                    }
                }
            });
            text = JSON.stringify(questions);
        }
        try {
            yield fetchAPI(`/lms/sections/${sectionId}/modules`, {
                method: 'POST',
                body: JSON.stringify({ title, type, content_url: url, content_text: text, order_index: 99 })
            });
            closeView();
            // Clear fields
            document.getElementById('lms-module-title').value = '';
            document.getElementById('lms-module-url').value = '';
            document.getElementById('lms-module-text').value = '';
            document.getElementById('lms-quiz-builder-container').innerHTML = '';
            launchLMSPlayer(currentLMSCourse.id); // Reload
        }
        catch (e) {
            alert(e.message);
        }
    });
}
function loadLMSModule(module, itemElement) {
    // Highlight active
    document.querySelectorAll('#lms-player-nav .list-group-item').forEach(el => el.classList.remove('active', 'bg-light'));
    itemElement.classList.add('active', 'bg-light');
    const area = document.getElementById('lms-content-area');
    if (module.type === 'video') {
        let embedUrl = module.content_url;
        if (module.content_url.includes('youtube.com/watch?v=')) {
            const videoId = module.content_url.split('v=')[1].split('&')[0];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }
        else if (module.content_url.includes('youtu.be/')) {
            const videoId = module.content_url.split('youtu.be/')[1];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        }
        area.innerHTML = `
            <iframe width="100%" height="100%" src="${embedUrl}" title="${module.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
    }
    else if (module.type === 'quiz') {
        let questions = [];
        try {
            questions = JSON.parse(module.content_text);
        }
        catch (e) { }
        let quizHTML = `<div class="container" style="max-width: 800px;"><h2 class="mb-4">${module.title}</h2>`;
        if (questions && questions.length > 0) {
            questions.forEach((q, idx) => {
                if (q.type === 'short') {
                    // Short Answer
                    quizHTML += `
                         <div class="card mb-3 p-4 shadow-sm border-0">
                            <h5 class="fw-bold mb-3">${idx + 1}. ${q.question} <span class="badge bg-info-subtle text-info-emphasis ms-2">Short Answer</span></h5>
                            <textarea class="form-control" rows="3" name="q_${idx}" placeholder="Type your answer here..."></textarea>
                            <div class="mt-2 small text-muted fst-italic" id="q_feedback_${idx}"></div>
                        </div>
                    `;
                }
                else {
                    // MCQ
                    quizHTML += `
                        <div class="card mb-3 p-4 shadow-sm border-0">
                            <h5 class="fw-bold mb-3">${idx + 1}. ${q.question}</h5>
                            <div class="d-flex flex-column gap-2">
                                <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="A"> <span class="fw-bold text-muted me-2">A.</span> ${q.options.A}
                                </label>
                                <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="B"> <span class="fw-bold text-muted me-2">B.</span> ${q.options.B}
                                </label>
                                 <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="C"> <span class="fw-bold text-muted me-2">C.</span> ${q.options.C}
                                </label>
                                 <label class="p-2 border rounded hover-bg-light cursor-pointer">
                                    <input type="radio" name="q_${idx}" value="D"> <span class="fw-bold text-muted me-2">D.</span> ${q.options.D}
                                </label>
                            </div>
                        </div>
                    `;
                }
            });
            quizHTML += `<button onclick="submitLMSQuiz(${module.id})" class="btn btn-primary-custom btn-lg rounded-pill px-5">Submit Quiz</button></div>`;
        }
        else {
            quizHTML += `<p class="text-muted">This quiz has no questions.</p></div>`;
        }
        area.innerHTML = `<div class="h-100 overflow-auto p-4 md-content">${quizHTML}</div>`;
    }
    else {
        // HTML/Text
        area.innerHTML = `
             <div class="h-100 overflow-auto p-4 md-content">
                <div class="container" style="max-width: 800px;">
                    <h2 class="mb-4">${module.title}</h2>
                    <div class="card p-4 shadow-sm">
                        ${module.content_text ? module.content_text.replace(/\n/g, '<br>') : '<p class="text-muted">No content.</p>'}
                    </div>
                </div>
            </div>
        `;
    }
}
function handleLMSCompletion() {
    alert("Module marked as complete.");
    // Logic to unlock next module
}
function navLMSModule(direction) {
    // Logic for prev/next button
}
function submitLMSQuiz(moduleId) {
    return __awaiter(this, void 0, void 0, function* () {
        let module = null;
        currentLMSCourse.sections.forEach(s => {
            const found = s.modules.find(m => m.id === moduleId);
            if (found)
                module = found;
        });
        if (!module)
            return;
        const questions = JSON.parse(module.content_text);
        let totalScore = 0;
        let totalPossible = questions.length * 100; // Normalize: MCQ=100pts, Short=100pts
        // Show loading state
        const submitBtn = document.querySelector(`button[onclick="submitLMSQuiz(${moduleId})"]`);
        if (submitBtn) {
            submitBtn.disabled = true;
            CB.ui.btnLoading(submitBtn, 'Grading...');
        }
        try {
            for (let idx = 0; idx < questions.length; idx++) {
                const q = questions[idx];
                if (q.type === 'short') {
                    const answer = document.querySelector(`textarea[name="q_${idx}"]`).value;
                    const feedbackEl = document.getElementById(`q_feedback_${idx}`);
                    // Call AI
                    const res = yield fetchAPI('/ai/grade/short-answer', {
                        method: 'POST',
                        body: JSON.stringify({
                            question: q.question,
                            student_answer: answer,
                            context: q.context
                        })
                    });
                    const grade = yield res.json();
                    totalScore += grade.score;
                    feedbackEl.innerHTML = `<span class="${grade.score > 50 ? 'text-success' : 'text-danger'}">Score: ${grade.score}/100. ${grade.feedback}</span>`;
                }
                else {
                    // MCQ Logic (Assume 100pts for correct)
                    const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
                    if (selected && selected.value === q.answer) {
                        totalScore += 100;
                    }
                }
            }
            const finalPercent = (totalScore / totalPossible) * 100;
            alert(`Quiz Complete! You scored ${Math.round(finalPercent)}%`);
            yield fetchAPI(`/lms/modules/${moduleId}/complete`, {
                method: 'POST',
                body: JSON.stringify({ score: finalPercent, status: 'Completed' })
            });
        }
        catch (e) {
            console.error(e);
            alert("Error submitting quiz: " + e.message);
        }
        finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Quiz';
            }
        }
    });
}
// --- LMS AI TUTOR ---
function toggleLMSChat() {
    const sidebar = document.getElementById('lms-chat-sidebar');
    if (!sidebar)
        return; // Guard
    if (sidebar.style.transform === 'translateX(0%)') {
        sidebar.style.transform = 'translateX(100%)';
    }
    else {
        sidebar.style.transform = 'translateX(0%)';
    }
}
function handleLMSChatKey(e) {
    if (e.key === 'Enter')
        sendLMSChat();
}
function sendLMSChat() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('lms-chat-input');
        const msg = input.value.trim();
        if (!msg)
            return;
        if (!currentLMSCourse) {
            alert("Course context missing.");
            return;
        }
        // Add User Message
        const history = document.getElementById('lms-chat-history');
        if (history.querySelector('.text-center'))
            history.innerHTML = ''; // Clear welcome
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex justify-content-end mb-3';
        userDiv.innerHTML = `<div class="bg-primary text-white p-2 rounded shadow-sm" style="max-width: 80%;">${msg}</div>`;
        history.appendChild(userDiv);
        input.value = '';
        history.scrollTop = history.scrollHeight;
        // Show Typing
        const typingId = `cat-typing-${Date.now()}`;
        const botDiv = document.createElement('div');
        botDiv.className = 'd-flex justify-content-start mb-3';
        botDiv.innerHTML = `
        <div class="bg-white border p-2 rounded shadow-sm" style="max-width: 80%;">
            <span id="${typingId}" class="material-icons anim-icon fs-6">more_horiz</span>
        </div>`;
        history.appendChild(botDiv);
        history.scrollTop = history.scrollHeight;
        try {
            const res = yield fetchAPI(`/ai/chat/course/${currentLMSCourse.id}`, {
                method: 'POST',
                body: JSON.stringify({ prompt: msg })
            });
            const data = yield res.json();
            // Remove typing
            const content = typeof marked !== 'undefined' ? marked.parse(data.reply) : data.reply;
            document.getElementById(typingId).parentNode.innerHTML = content;
        }
        catch (e) {
            document.getElementById(typingId).parentNode.innerHTML = `<span class="text-danger">Error: ${e.message}</span>`;
        }
    });
}
// --- ATTENDANCE MANAGEMENT ---

// --- Window bindings for inline HTML onclick handlers ---
window.loadLMSCatalog = loadLMSCatalog;
window.renderLMSCatalog = renderLMSCatalog;
window.submitLMSCourse = submitLMSCourse;
window.launchLMSPlayer = launchLMSPlayer;
window.renderLMSPlayerNav = renderLMSPlayerNav;
window.submitLMSSection = submitLMSSection;
window.toggleLMSModuleFields = toggleLMSModuleFields;
window.addLMSQuizQuestion = addLMSQuizQuestion;
window.toggleQuestionType = toggleQuestionType;
window.submitLMSModule = submitLMSModule;
window.loadLMSModule = loadLMSModule;
window.handleLMSCompletion = handleLMSCompletion;
window.navLMSModule = navLMSModule;
window.submitLMSQuiz = submitLMSQuiz;
window.toggleLMSChat = toggleLMSChat;
window.handleLMSChatKey = handleLMSChatKey;
window.sendLMSChat = sendLMSChat;
