/** parent_progress.js — Parent & Student Progress Card Views */
async function loadParentProgressCardView() {
    const container = ensureParentProgressCardViewLayout();
    if (!container)
        return;
    container.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
    try {
        const data = await fetchMyProgressCard();
        renderProgressCard(data, container, true);
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Error: ${e.message}</div>`;
    }
}

async function loadStudentProgressCardView() {
    const container = ensureParentProgressCardViewLayout();
    if (!container)
        return;
    const studentId = appState.activeStudentId || appState.userId || '';
    if (!studentId && !appState.userId) {
        container.innerHTML = '<div class="text-center text-muted py-4">Student session not found.</div>';
        return;
    }
    container.innerHTML = '<div class="text-center p-4"><span class="spinner-border text-primary"></span></div>';
    try {
        const data = await fetchMyProgressCard();
        renderProgressCard(data, container, true);
    }
    catch (e) {
        container.innerHTML = `<div class="text-danger p-3">Unable to load progress card for <b>${studentId || (appState.userId || '-')}</b>: ${e.message}</div>`;
    }
}

function ensureParentProgressCardViewLayout() {
    const view = document.getElementById('parent-progress-card-view');
    if (!view)
        return null;
    let container = document.getElementById('parent-progress-card-container');
    if (container)
        return container;
    view.innerHTML = `
        <h3 class="fw-bold mb-4 text-dark">View Progress Card</h3>
        <div id="parent-progress-card-container" class="card border-0 shadow rounded-4 p-4">
            <div class="text-center text-muted py-5">
                <span class="material-icons fs-1">analytics</span>
                <p class="mt-2">Progress card will appear here.</p>
            </div>
        </div>
    `;
    container = document.getElementById('parent-progress-card-container');
    return container;
}

// --- EMAIL LOGIC ---

// --- Window bindings for inline HTML onclick handlers ---
window.loadParentProgressCardView = loadParentProgressCardView;
window.loadStudentProgressCardView = loadStudentProgressCardView;
window.ensureParentProgressCardViewLayout = ensureParentProgressCardViewLayout;
