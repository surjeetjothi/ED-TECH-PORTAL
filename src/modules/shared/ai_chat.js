/** ai_chat.js — AI Sidebar Chat & Teacher AI Co-Pilot */
function toggleSidebarChat() {
    const sidebar = document.getElementById('ai-sidebar');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
    else {
        sidebar.classList.add('open');
        // Focus input
        setTimeout(() => {
            const el = document.getElementById('sidebar-chat-input');
            if (el)
                el.focus();
        }, 100);
    }
}
function handleSidebarEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendSidebarMessage();
    }
}
function sendSidebarMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('sidebar-chat-input');
        const message = input.value.trim();
        const fileInput = document.getElementById('chat-file-input');
        const file = fileInput && fileInput.files[0];
        if (!message && !file)
            return;
        // Clear and Append User Message
        input.value = '';
        let userMsgDisplay = message;
        if (file) {
            userMsgDisplay += `<br><small class="text-muted"><span class="material-icons fs-6 align-middle">attach_file</span> ${file.name}</small>`;
        }
        appendSidebarMessage('user', userMsgDisplay);
        // Clear File Input
        if (fileInput) {
            fileInput.value = '';
            clearChatFile();
        }
        // Show Typing Indicator
        const typingId = appendSidebarMessage('ai', '...', true);
        try {
            const studentId = appState.userId || 'guest';
            let response;
            if (file) {
                // File Upload Flow
                const formData = new FormData();
                formData.append('prompt', message || "Analyze this file");
                formData.append('file', file);
                // Note: fetchAPI adds Content-Type: json by default if not FormData... 
                // but we need to ensure fetchAPI logic handles FormData correctly (it usually shouldn't set Content-Type header manually for FormData)
                // My fetchAPI wrapper sets Content-Type: application/json by default. I need to override it.
                response = yield fetch(`${API_BASE_URL}/ai/chat_with_file/${studentId}`, {
                    method: 'POST',
                    headers: {
                        'X-User-Id': appState.userId || '',
                        'X-User-Role': appState.role || ''
                    },
                    body: formData
                });
            }
            else {
                // Text Only Flow
                response = yield fetchAPI(`/ai/chat/${studentId}`, {
                    method: 'POST',
                    body: JSON.stringify({ prompt: message })
                });
            }
            const data = yield response.json();
            // Remove Typing Indicator
            const typingEl = document.getElementById(typingId);
            if (typingEl)
                typingEl.remove();
            // Append AI Response
            if (data.reply) {
                appendSidebarMessage('ai', data.reply);
            }
            else {
                appendSidebarMessage('ai', "I'm having trouble thinking right now.");
            }
        }
        catch (error) {
            console.error(error);
            const typingEl = document.getElementById(typingId);
            if (typingEl)
                typingEl.remove();
            appendSidebarMessage('ai', "Connection error. Please try again.");
        }
    });
}
function handleChatFileSelect(input) {
    const preview = document.getElementById('chat-file-preview');
    const nameSpan = document.getElementById('chat-file-name');
    if (input.files && input.files[0]) {
        preview.style.display = 'block';
        nameSpan.innerText = input.files[0].name;
    }
    else {
        clearChatFile();
    }
}
function clearChatFile() {
    const input = document.getElementById('chat-file-input');
    const preview = document.getElementById('chat-file-preview');
    if (input)
        input.value = '';
    if (preview)
        preview.style.display = 'none';
}
function appendSidebarMessage(sender, text, isTyping = false) {
    const chatBody = document.getElementById('sidebar-chat-body');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    if (isTyping) {
        msgDiv.id = `typing-${Date.now()}`;
        msgDiv.innerHTML = '<span class="material-icons fw-bold fs-6 anim-icon">more_horiz</span>';
    }
    else {
        // Use Marked.js if available, else plain text
        if (sender === 'ai' && typeof marked !== 'undefined') {
            msgDiv.innerHTML = marked.parse(text);
        }
        else {
            msgDiv.innerText = text;
        }
    }
    chatBody.appendChild(msgDiv);
    chatBody.scrollTop = chatBody.scrollHeight;
    return msgDiv.id;
}
// --- MOODLE INTEGRATION ---
// --- ENGAGEMENT HELPER LOGIC REMOVED ---
// --- TEACHER AI CO-PILOT ---
function openTeacherAICoPilot() {
    openView('teacherAICoPilotModal');
}
function sendTeacherAIMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        const input = document.getElementById('teacher-ai-input');
        const msg = input.value.trim();
        if (!msg)
            return;
        const teacherId = localStorage.getItem('userId') || 'teacher_001'; // Default for demo
        const history = document.getElementById('teacher-ai-chat-history');
        const typing = document.getElementById('teacher-ai-typing');
        // Add User Message
        const userDiv = document.createElement('div');
        userDiv.className = 'd-flex justify-content-end mb-3';
        userDiv.innerHTML = `
        <div class="bg-primary text-white p-3 rounded-4 shadow-sm" style="max-width: 85%; border-bottom-right-radius: 4px;">
            ${msg}
        </div>`;
        history.appendChild(userDiv);
        input.value = '';
        history.scrollTop = history.scrollHeight;
        // Show Typing
        typing.classList.remove('d-none');
        history.scrollTop = history.scrollHeight;
        try {
            const response = yield fetch(`${API_BASE_URL}/api/ai/teacher-chat/${teacherId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: msg })
            });
            const data = yield response.json();
            // Hide Typing
            typing.classList.add('d-none');
            // Add Bot Message
            const botDiv = document.createElement('div');
            botDiv.className = 'd-flex justify-content-start mb-3';
            // Simple Markdown/Table formatting
            let reply = data.reply;
            if (typeof marked !== 'undefined') {
                reply = marked.parse(reply);
            }
            else {
                // Basic fallback for line breaks and bold
                reply = reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            }
            botDiv.innerHTML = `
            <div class="bg-light p-3 rounded-4 shadow-sm border" style="max-width: 85%; border-bottom-left-radius: 4px;">
                <div class="fw-bold mb-2 text-primary d-flex align-items-center gap-2">
                    <span class="material-icons fs-6">smart_toy</span> AI Assistant
                </div>
                <div class="bot-content">${reply}</div>
            </div>`;
            history.appendChild(botDiv);
            history.scrollTop = history.scrollHeight;
        }
        catch (error) {
            typing.classList.add('d-none');
            console.error("Teacher AI Error:", error);
            const errDiv = document.createElement('div');
            errDiv.className = 'd-flex justify-content-start mb-3';
            errDiv.innerHTML = `<div class="bg-danger-subtle text-danger p-3 rounded-4 small">Sorry, I couldn't reach the AI service. Please try again later.</div>`;
            history.appendChild(errDiv);
        }
    });
}

// --- QUIZ TAKING LOGIC ---

// --- Window bindings for inline HTML onclick handlers ---
window.toggleSidebarChat = toggleSidebarChat;
window.handleSidebarEnter = handleSidebarEnter;
window.sendSidebarMessage = sendSidebarMessage;
window.handleChatFileSelect = handleChatFileSelect;
window.clearChatFile = clearChatFile;
window.appendSidebarMessage = appendSidebarMessage;
window.openTeacherAICoPilot = openTeacherAICoPilot;
window.sendTeacherAIMessage = sendTeacherAIMessage;
