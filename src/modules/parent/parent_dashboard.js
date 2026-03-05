/** parent_dashboard.js — Parent Portal: Child Data & Messages */
// --- PARENT PORTAL LOGIC ---
function loadParentChildData() {
    return __awaiter(this, void 0, void 0, function* () {
        const childIdInput = document.getElementById('parent-child-id');
        const childId = (childIdInput && childIdInput.value ? childIdInput.value.trim() : '') || (appState.activeStudentId || '').trim();
        if (!childId) {
            alert("No linked child found. Please login again or enter a Student ID.");
            return;
        }
        // UI Elements
        const contentDiv = document.getElementById('parent-dashboard-content');
        const nameSpan = document.getElementById('parent-child-name');
        const metricsDiv = document.getElementById('parent-metrics');
        const feedbackP = document.getElementById('parent-feedback');
        const attendanceEl = document.getElementById('parent-attendance');
        const chartDiv = document.getElementById('parent-progress-chart');
        if (!contentDiv || !nameSpan || !metricsDiv || !feedbackP || !attendanceEl) {
            console.error('Parent dashboard elements missing in DOM.');
            alert('Parent dashboard UI is incomplete on this page. Open the app via http://127.0.0.1:8000/ for full view.');
            return;
        }
        appState.activeStudentId = childId;
        contentDiv.classList.remove('d-none');
        nameSpan.textContent = "Loading...";
        metricsDiv.innerHTML = CB.ui.spinner('Loading...');
        try {
            // Reuse the student data endpoint (Observer pattern)
            const response = yield fetchAPI(`/students/${childId}/data`);
            if (!response.ok)
                throw new Error("Student not found or access denied.");
            const data = yield response.json();
            const summary = data.summary;
            const student = appState.allStudents.find(s => s.id === childId) || { name: childId, attendance_rate: '?' };
            // Populate Data
            nameSpan.textContent = student.name || childId;
            attendanceEl.textContent = `${student.attendance_rate}%`;
            feedbackP.textContent = summary.recommendation || "No specific feedback generated yet.";
            feedbackP.className = summary.recommendation ? "text-dark" : "small fst-italic text-muted mb-0";
            // Metrics
            metricsDiv.innerHTML = '';
            renderMetric(metricsDiv, "Avg Score", `${summary.avg_score}%`, 'border-primary');
            renderMetric(metricsDiv, "Activities", summary.total_activities, 'border-info');
            renderMetric(metricsDiv, "Math", `${summary.math_score}%`);
            renderMetric(metricsDiv, "Science", `${summary.science_score}%`);
            // Graph
            if (chartDiv) {
                const history = data.history;
                const dates = history.map(h => h.date);
                const scores = history.map(h => h.score);
                const trace = {
                    x: dates,
                    y: scores,
                    mode: 'lines+markers',
                    type: 'scatter',
                    name: 'Score',
                    line: { color: '#198754', width: 2 } // Green for parents
                };
                loadPlotlyAndRender(() => Plotly.newPlot(chartDiv, [trace], {
                    title: 'Child\'s Academic Progress',
                    height: 300,
                    margin: { t: 40, b: 30, l: 40, r: 10 },
                    xaxis: { title: 'Date' },
                    yaxis: { title: 'Score (%)', range: [0, 100] }
                }, { responsive: true }));
            }
        }
        catch (e) {
            alert(e.message);
            contentDiv.classList.add('d-none');
        }
    });
}
// --- CHAT LOGIC ---
function scrollChatToBottom() {
    elements.chatMessagesContainer.scrollTop = elements.chatMessagesContainer.scrollHeight;
}
function appendChatMessage(sender, message) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'assistant-message'}`;
    msgDiv.textContent = message;
    elements.chatMessagesContainer.appendChild(msgDiv);
    if (appState.activeStudentId) {
        if (!appState.chatMessages[appState.activeStudentId])
            appState.chatMessages[appState.activeStudentId] = '';
        appState.chatMessages[appState.activeStudentId] = elements.chatMessagesContainer.innerHTML;
    }
    scrollChatToBottom();
}
// Voice Recognition Setup
var recognition; // var: shared with script.js
var isListening = false; // var: shared with script.js
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('chat-input').value = transcript;
        toggleVoiceInput(); // Stop listening UI
        // Auto-send after speaking (optional, but feels smoother)
        handleChatSubmit(null);
    };
    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        toggleVoiceInput();
    };
}
function toggleVoiceInput() {
    const btn = document.getElementById('mic-btn');
    if (!recognition) {
        alert("Your browser does not support voice input. Try Chrome.");
        return;
    }
    if (isListening) {
        recognition.stop();
        isListening = false;
        btn.classList.remove('btn-danger', 'animate-pulse');
        btn.classList.add('btn-outline-secondary');
        btn.innerHTML = '<span class="material-icons">mic</span>';
    }
    else {
        recognition.start();
        isListening = true;
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-danger'); // Red to indicate recording
        btn.innerHTML = '<span class="material-icons">mic_off</span>';
        document.getElementById('chat-input').placeholder = "Listening...";
    }
}
function speakText(text) {
    // Basic text-to-speech
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}
function handleChatSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        if (e)
            e.preventDefault();
        const inputEl = document.getElementById('chat-input'); // Direct access
        const prompt = inputEl.value.trim();
        const studentId = appState.activeStudentId;
        if (!prompt || !studentId)
            return;
        appendChatMessage('user', prompt);
        inputEl.value = '';
        try {
            const response = yield fetchAPI(`/ai/chat/${studentId}`, {
                method: 'POST',
                body: JSON.stringify({ prompt: prompt })
            });
            const data = yield response.json();
            if (response.ok) {
                appendChatMessage('assistant', data.reply);
                speakText(data.reply); // Read answer aloud
            }
            else
                appendChatMessage('assistant', `Error: ${data.detail || 'Service error'}`);
        }
        catch (error) {
            appendChatMessage('assistant', 'Network Error');
        }
    });
}

// --- Window bindings for inline HTML onclick handlers ---
window.loadParentChildData = loadParentChildData;
window.scrollChatToBottom = scrollChatToBottom;
window.appendChatMessage = appendChatMessage;
window.toggleVoiceInput = toggleVoiceInput;
window.speakText = speakText;
window.handleChatSubmit = handleChatSubmit;
