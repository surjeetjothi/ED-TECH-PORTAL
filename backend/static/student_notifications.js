/** student_notifications.js — Student & Parent Notification Loading */
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
async function loadQuestionBanks() {
    const container = document.getElementById('question-bank-list');
    const uploadContainer = document.getElementById('qb-upload-container');

    // Toggle Upload Button Visibility
    if (appState.role === 'Teacher' || appState.role === 'Admin' || appState.role === 'Principal' || appState.role === 'Tenant_Admin') {
        if (uploadContainer) uploadContainer.classList.remove('d-none');
    } else {
        if (uploadContainer) uploadContainer.classList.add('d-none');
    }

    if (!container) return;
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    try {
        const res = await fetchAPI('/question-bank');
        if (res.ok) {
            const banks = await res.json();
            container.innerHTML = '';

            if (banks.length === 0) {
                container.innerHTML = '<div class="text-center py-5 text-muted">No question banks uploaded yet.</div>';
                return;
            }

            banks.forEach(qb => {
                const date = new Date(qb.created_at).toLocaleDateString();
                const icon = qb.file_path.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'description';
                // Construct full URL assuming backend is relative to API base
                // If API_BASE_URL ends in /api, strip it
                const backendRoot = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
                const downloadUrl = `${backendRoot}${qb.file_path}`;

                const html = `
                    <div class="list-group-item p-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <div class="icon-circle bg-light me-3 text-primary">
                                <span class="material-icons">${icon}</span>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold">${qb.title}</h6>
                                <small class="text-muted">Uploaded by ${qb.uploaded_by} on ${date}</small>
                            </div>
                        </div>
                        <a href="${downloadUrl}" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-3">
                            <span class="material-icons align-middle fs-6 me-1">download</span> Download
                        </a>
                    </div>
                `;
                container.innerHTML += html;
            });

        } else {
            container.innerHTML = '<div class="text-danger text-center p-5">Failed to load question banks.</div>';
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="text-danger text-center p-5">Error: ${e.message}</div>`;
    }
}

async function handleQuestionBankUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const title = prompt("Enter a title for this Question Bank:", file.name.split('.')[0]);
    if (!title) {
        input.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);

    try {
        const res = await fetchAPI('/question-bank/upload', {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            alert('Question Bank uploaded successfully!');
            loadQuestionBanks();
        } else {
            const err = await res.json();
            alert('Upload failed: ' + (err.detail || 'Unknown error'));
        }
    } catch (e) {
        console.error(e);
        alert('Error uploading file.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- Window bindings for inline HTML onclick handlers ---
window.loadStudentNotifications = loadStudentNotifications;
window.loadParentNotifications = loadParentNotifications;
window.initParentEmailCompose = initParentEmailCompose;
window.loadQuestionBanks = loadQuestionBanks;
window.handleQuestionBankUpload = handleQuestionBankUpload;
