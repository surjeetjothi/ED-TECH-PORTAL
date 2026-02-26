/** messaging.js — Email Inbox/Sent/Compose (Teacher & Parent), Notifications */
function renderEmailListItem(email, inbox = true) {
    const fromToLabel = inbox ? `From: ${email.sender_id}` : `To: ${email.recipient_email}`;
    const time = email.sent_at ? new Date(email.sent_at).toLocaleString() : '';
    const unreadClass = inbox && !email.is_read ? 'bg-light' : '';
    const subject = email.subject || '(No Subject)';
    const preview = (email.body || '').substring(0, 80);
    return `
        <div class="list-group-item list-group-item-action p-3 ${unreadClass}" data-email-id="${email.id}">
            <div class="d-flex w-100 justify-content-between">
                <h6 class="mb-1 fw-bold">${subject}</h6>
                <small class="text-muted">${time}</small>
            </div>
            <p class="mb-1 text-dark small">${fromToLabel}</p>
            <small class="text-muted">${preview}${email.body && email.body.length > 80 ? '...' : ''}</small>
        </div>
    `;
}

async function loadEmailInbox() {
    const list = document.getElementById('email-inbox-list');
    const countEl = document.getElementById('email-inbox-count');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/inbox');
        if (!res.ok) throw new Error('Failed to load inbox.');
        const data = await res.json();
        if (countEl) countEl.textContent = String(data.length || 0);
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, true)).join('');
        list.querySelectorAll('[data-email-id]').forEach((el) => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-email-id');
                if (id) {
                    await fetchAPI(`/email/${id}/read`, { method: 'PUT' });
                    el.classList.remove('bg-light');
                }
            });
        });
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadEmailSent() {
    const list = document.getElementById('email-sent-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/sent');
        if (!res.ok) throw new Error('Failed to load sent mail.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No sent messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, false)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

function initEmailCompose() {
    const form = document.getElementById('email-compose-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = document.getElementById('email-to').value.trim();
        const subject = document.getElementById('email-subject').value.trim();
        const body = document.getElementById('email-body').value.trim();
        if (!to || !subject || !body) {
            alert('Please fill To, Subject, and Message.');
            return;
        }
        try {
            const res = await fetchAPI('/email/send', {
                method: 'POST',
                body: JSON.stringify({ to, subject, body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || 'Failed to send email.');
                return;
            }
            alert(`Sent to ${data.sent || 0} recipient(s).`);
            form.reset();
            switchView('email-sent-view');
        } catch (e) {
            alert('Network error sending email.');
        }
    });
}

async function loadParentEmailInbox() {
    const list = document.getElementById('parent-email-inbox-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/inbox');
        if (!res.ok) throw new Error('Failed to load inbox.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, true)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadParentEmailSent() {
    const list = document.getElementById('parent-email-sent-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/email/sent');
        if (!res.ok) throw new Error('Failed to load sent mail.');
        const data = await res.json();
        if (!data.length) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No sent messages.</div>';
            return;
        }
        list.innerHTML = data.map(e => renderEmailListItem(e, false)).join('');
    } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

function notificationStatusBadge(subject = '', content = '') {
    const text = `${subject} ${content}`.toLowerCase();
    if (text.includes('absent'))
        return '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Absent</span>';
    if (text.includes('late'))
        return '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Late</span>';
    if (text.includes('present'))
        return '<span class="badge bg-success-subtle text-success border border-success-subtle">Present</span>';
    return '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">Info</span>';
}

function renderNotificationListItem(n) {
    const time = n.timestamp ? new Date(n.timestamp).toLocaleString() : '';
    const unreadClass = n.is_read ? '' : 'bg-light';
    const badge = notificationStatusBadge(n.subject || '', n.content || '');
    return `
        <div class="list-group-item list-group-item-action p-3 ${unreadClass}" data-notif-id="${n.id}">
            <div class="d-flex w-100 justify-content-between align-items-center">
                <h6 class="mb-1 fw-bold">${n.subject || 'Notification'}</h6>
                <small class="text-muted">${time}</small>
            </div>
            <p class="mb-2 small text-dark">${n.content || ''}</p>
            <div>${badge}</div>
        </div>
    `;
}

async function loadNotificationsInto(listId) {
    const list = document.getElementById(listId);
    if (!list)
        return;
    list.innerHTML = '<div class="p-4 text-center text-muted">Loading...</div>';
    try {
        const res = await fetchAPI('/notifications/inbox');
        if (!res.ok)
            throw new Error('Failed to load notifications.');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-muted">No notifications.</div>';
            return;
        }
        list.innerHTML = data.map(renderNotificationListItem).join('');
        list.querySelectorAll('[data-notif-id]').forEach((el) => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-notif-id');
                if (!id)
                    return;
                await fetchAPI(`/notifications/${id}/read`, { method: 'PUT' });
                el.classList.remove('bg-light');
            });
        });
    }
    catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-danger">${e.message}</div>`;
    }
}

async function loadStudentNotifications() {
    await loadNotificationsInto('student-notifications-list');
}

async function loadParentNotifications() {
    await loadNotificationsInto('parent-notifications-list');
}

function initParentEmailCompose() {
    const form = document.getElementById('parent-email-compose-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = document.getElementById('parent-email-to').value.trim();
        const subject = document.getElementById('parent-email-subject').value.trim();
        const body = document.getElementById('parent-email-body').value.trim();
        if (!to || !subject || !body) {
            alert('Please fill To, Subject, and Message.');
            return;
        }
        try {
            const res = await fetchAPI('/email/send', {
                method: 'POST',
                body: JSON.stringify({ to, subject, body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.detail || 'Failed to send email.');
                return;
            }
            alert(`Sent to ${data.sent || 0} recipient(s).`);
            form.reset();
            switchView('parent-email-sent-view');
        } catch (e) {
            alert('Network error sending email.');
        }
    });
}

/* --- QUESTION BANK LOGIC --- */

// --- Window bindings for inline HTML onclick handlers ---
window.renderEmailListItem = renderEmailListItem;
window.loadEmailInbox = loadEmailInbox;
window.loadEmailSent = loadEmailSent;
window.initEmailCompose = initEmailCompose;
window.loadParentEmailInbox = loadParentEmailInbox;
window.loadParentEmailSent = loadParentEmailSent;
window.notificationStatusBadge = notificationStatusBadge;
window.renderNotificationListItem = renderNotificationListItem;
window.loadNotificationsInto = loadNotificationsInto;
window.loadStudentNotifications = loadStudentNotifications;
window.loadParentNotifications = loadParentNotifications;
window.initParentEmailCompose = initParentEmailCompose;
