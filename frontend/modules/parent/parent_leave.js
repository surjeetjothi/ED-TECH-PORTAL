/** parent_leave.js — Parent Leave Application & Status View */
function initParentLeaveApplyView() {
    const view = document.getElementById('parent-leave-apply-view');
    if (!view)
        return;
    const form = view.querySelector('form');
    if (!form)
        return;
    if (form.dataset.bound === '1')
        return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dateInputs = form.querySelectorAll('input[type="date"]');
        const reasonEl = form.querySelector('textarea');
        const start = dateInputs[0] ? dateInputs[0].value : '';
        const end = dateInputs[1] ? dateInputs[1].value : '';
        const reason = reasonEl ? reasonEl.value.trim() : '';
        const targetStudentId = appState.activeStudentId || appState.userId;
        if (!targetStudentId) {
            alert('No linked student found for leave request.');
            return;
        }
        if (!start || !end || !reason) {
            alert('Please fill start date, end date, and reason.');
            return;
        }
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalLabel = submitBtn ? submitBtn.textContent : '';
        if (submitBtn)
            submitBtn.textContent = 'Submitting...';
        try {
            const res = await fetchAPI('/leave/apply', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: targetStudentId,
                    type: 'Parent Request',
                    start_date: start,
                    end_date: end,
                    reason
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.detail || 'Failed to submit leave request.');
            }
            alert('Leave request submitted.');
            form.reset();
            loadParentLeaveStatusView();
        }
        catch (err) {
            alert(err.message || 'Failed to submit leave request.');
        }
        finally {
            if (submitBtn)
                submitBtn.textContent = originalLabel || 'Submit Request';
        }
    });
}

async function loadParentLeaveStatusView() {
    const view = document.getElementById('parent-leave-status-view');
    if (!view)
        return;
    const list = view.querySelector('.list-group');
    if (!list)
        return;
    const targetStudentId = appState.activeStudentId || appState.userId;
    if (!targetStudentId) {
        list.innerHTML = '<div class="list-group-item text-muted">No linked student found.</div>';
        return;
    }
    list.innerHTML = '<div class="list-group-item text-muted">Loading...</div>';
    try {
        const res = await fetchAPI(`/leave/my-history?user_id=${encodeURIComponent(targetStudentId)}`);
        const rows = await res.json().catch(() => []);
        if (!res.ok) {
            throw new Error('Failed to load leave history.');
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            list.innerHTML = '<div class="list-group-item text-muted">No leave records found.</div>';
            return;
        }
        list.innerHTML = rows.map((req) => {
            const status = String(req.status || 'Pending');
            const statusClass = status === 'Approved' ? 'bg-success' : (status === 'Rejected' || status === 'Denied' ? 'bg-danger' : 'bg-warning text-dark');
            return `
                <div class="list-group-item p-3 d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold text-dark">${req.type || 'Leave Request'}</span>
                        <div class="small text-muted">${req.start_date || '-'} - ${req.end_date || '-'}</div>
                        <div class="small text-secondary">${req.reason || ''}</div>
                    </div>
                    <span class="badge ${statusClass} rounded-pill">${status}</span>
                </div>
            `;
        }).join('');
    }
    catch (e) {
        list.innerHTML = `<div class="list-group-item text-danger">${e.message}</div>`;
    }
}

