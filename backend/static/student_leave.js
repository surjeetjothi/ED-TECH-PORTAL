/** student_leave.js — Student Leave View & Leave History */
function loadStudentLeaveView() {
    const listContainer = document.getElementById('student-leave-history-list');
    if (!listContainer) return;

    // Setup Form Submit
    const form = document.getElementById('student-leave-form');
    // Remove old listeners to avoid duplicates
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.getElementById('leave-type').value;
        const start = document.getElementById('leave-start').value;
        const end = document.getElementById('leave-end').value;
        const reason = document.getElementById('leave-reason').value;

        try {
            const res = await fetchAPI('/leave/apply', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: appState.userId,
                    type, start_date: start, end_date: end, reason
                })
            });

            if (res.ok) {
                alert('Leave application submitted successfully!');
                newForm.reset();
                loadMyLeaveHistory(); // Refresh list
            } else {
                try {
                    const errData = await res.json();
                    alert('Failed to submit application: ' + (errData.detail || errData.message || "Unknown error"));
                } catch (e) {
                    alert('Failed to submit application. Status: ' + res.status);
                }
            }
        } catch (err) {
            console.error(err);
            alert('Error submitting application.');
        }
    });

    loadMyLeaveHistory();
}

async function loadMyLeaveHistory() {
    const listContainer = document.getElementById('student-leave-history-list');
    listContainer.innerHTML = '<div class="text-center p-3">Loading...</div>';

    try {
        const res = await fetchAPI(`/leave/my-history?user_id=${appState.userId}`);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to load: ${res.status} ${errText}`);
        }
        const history = await res.json();

        if (history.length === 0) {
            listContainer.innerHTML = '<div class="text-center p-4 text-muted">No leave history found.</div>';
            return;
        }

        listContainer.innerHTML = '';
        history.forEach(req => {
            let badgeClass = 'bg-warning';
            if (req.status === 'Approved') badgeClass = 'bg-success';
            if (req.status === 'Denied') badgeClass = 'bg-danger';

            const html = `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge ${badgeClass}">${req.status}</span>
                        <small class="text-muted">${new Date(req.created_at).toLocaleDateString()}</small>
                    </div>
                    <h6 class="mb-1">${req.type}</h6>
                    <small class="text-muted d-block">${req.start_date} to ${req.end_date}</small>
                    <p class="mb-0 small mt-1 text-secondary">"${req.reason}"</p>
                </div>
            `;
            listContainer.innerHTML += html;
        });

    } catch (e) {
        listContainer.innerHTML = `<div class="text-danger p-3">Error loading history: ${e.message}</div>`;
    }
}


// --- Window bindings for inline HTML onclick handlers ---
window.loadStudentLeaveView = loadStudentLeaveView;
window.loadMyLeaveHistory = loadMyLeaveHistory;
