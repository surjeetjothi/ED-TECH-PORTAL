/** resources.js — Resource Library, Documents, Viewing, Uploading, Deleting */
function loadResources() {
    return __awaiter(this, arguments, void 0, function* (category = 'All') {
        const container = document.getElementById('resources-list-container');
        if (!container)
            return;
        container.innerHTML = '<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div></div>';
        try {
            const effectiveSchoolId = appState.schoolId || appState.activeSchoolId || 1;
            const normalizedCategory = normalizeResourceCategory(category);
            let url = `/resources`;
            if (normalizedCategory && normalizedCategory !== 'All') {
                url += `?category=${encodeURIComponent(normalizedCategory)}`;
            }
            url += (url.includes('?') ? '&' : '?') + `school_id=${effectiveSchoolId}`;
            const response = yield fetchAPI(url);
            if (!response.ok)
                throw new Error("Failed to fetch resources");
            const resources = yield response.json();
            renderResources(resources);
        }
        catch (error) {
            console.error("Error loading resources:", error);
            container.innerHTML = `
            <div class="col-12 text-center py-5">
                 <div class="mb-3"><span class="material-icons fs-1 text-muted opacity-50">cloud_off</span></div>
                 <h5 class="text-muted">Unable to load resources</h5>
                 <p class="small text-secondary">Please check your connection or contact the administrator.</p>
            </div>`;
        }
    });
}
function canManageResources() {
    const adminRoles = ['Admin', 'Principal', 'Tenant_Admin', 'Root_Super_Admin', 'Super Admin'];
    return !!appState.isSuperAdmin || adminRoles.includes(appState.role || '');
}
var resourceFormTemplatesCache = []; // var: shared with script.js
function normalizeResourceCategory(rawCategory) {
    const value = String(rawCategory || 'All').trim();
    const normalized = value.toLowerCase();
    if (!normalized || normalized === 'all')
        return 'All';
    if (normalized === 'policies' || normalized === 'policy')
        return 'Policy';
    if (normalized === 'exam schedules' || normalized === 'schedule')
        return 'Schedule';
    if (normalized === 'forms' || normalized === 'form')
        return 'Form';
    if (normalized === 'other')
        return 'Other';
    return value;
}
function getActiveResourceCategory() {
    const activeBtn = document.querySelector('#resources-view [data-resource-category].active');
    if (!activeBtn)
        return 'All';
    return normalizeResourceCategory(activeBtn.getAttribute('data-resource-category') || activeBtn.innerText || 'All');
}
function initResourcesView() {
    const uploadBtn = document.getElementById('btn-upload-resource');
    if (uploadBtn) {
        uploadBtn.classList.toggle('d-none', !canManageResources());
    }
    loadResources(getActiveResourceCategory());
}
function handleResourceCategoryChange() {
    const categoryEl = document.getElementById('res-category-view');
    const templateWrap = document.getElementById('resource-template-wrap');
    const templateSelect = document.getElementById('res-template-view');
    const fileInput = document.getElementById('res-file-view');
    const isFormCategory = !!categoryEl && categoryEl.value === 'Form';
    if (templateWrap) {
        templateWrap.classList.toggle('d-none', !isFormCategory);
    }
    if (fileInput) {
        const usingTemplate = isFormCategory && !!templateSelect && !!templateSelect.value;
        fileInput.required = !usingTemplate;
    }
}
function handleResourceTemplateChange() {
    const templateSelect = document.getElementById('res-template-view');
    const titleEl = document.getElementById('res-title-view');
    const descEl = document.getElementById('res-desc-view');
    if (templateSelect && templateSelect.value) {
        const match = resourceFormTemplatesCache.find((t) => t.key === templateSelect.value);
        if (match) {
            if (titleEl && !titleEl.value.trim())
                titleEl.value = match.title || '';
            if (descEl && !descEl.value.trim())
                descEl.value = match.description || '';
        }
    }
    handleResourceCategoryChange();
}
function loadResourceFormTemplates() {
    return __awaiter(this, void 0, void 0, function* () {
        const select = document.getElementById('res-template-view');
        if (!select)
            return;
        if (resourceFormTemplatesCache.length > 0) {
            select.innerHTML = '<option value="">Custom Form (Upload your own file)</option>' +
                resourceFormTemplatesCache.map((t) => `<option value="${t.key}">${t.title}</option>`).join('');
            return;
        }
        try {
            const res = yield fetchAPI('/resources/form-templates');
            if (!res.ok)
                return;
            const data = yield res.json();
            if (!Array.isArray(data))
                return;
            resourceFormTemplatesCache = data;
            select.innerHTML = '<option value="">Custom Form (Upload your own file)</option>' +
                data.map((t) => `<option value="${t.key}">${t.title}</option>`).join('');
        }
        catch (e) {
            console.warn('Failed to load form templates', e);
        }
    });
}
function populateResourceUploadSchoolOptions() {
    return __awaiter(this, void 0, void 0, function* () {
        const wrap = document.getElementById('resource-school-wrap');
        const select = document.getElementById('res-school-view');
        if (!wrap || !select)
            return;
        const ownSchoolId = Number(appState.activeSchoolId || appState.schoolId || 1);
        const ownSchoolName = appState.schoolName || `School ${ownSchoolId}`;
        const canSelectAnySchool = !!appState.isSuperAdmin || ['Root_Super_Admin', 'Super Admin'].includes(appState.role || '');
        wrap.classList.toggle('d-none', !canManageResources());
        if (!canManageResources()) {
            select.innerHTML = '';
            return;
        }
        if (!canSelectAnySchool) {
            select.innerHTML = `<option value="${ownSchoolId}">${ownSchoolName}</option>`;
            select.value = String(ownSchoolId);
            select.disabled = true;
            return;
        }
        select.disabled = false;
        select.innerHTML = `<option value="${ownSchoolId}">${ownSchoolName}</option>`;
        try {
            const response = yield fetchAPI('/admin/schools');
            if (response.ok) {
                const schools = yield response.json();
                if (Array.isArray(schools) && schools.length > 0) {
                    select.innerHTML = schools.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
                }
            }
        }
        catch (e) {
            console.warn('Failed to load schools for resource upload', e);
        }
        select.value = String(ownSchoolId);
    });
}
function renderResources(resources) {
    const container = document.getElementById('resources-list-container');
    container.innerHTML = '';
    if (!resources || resources.length === 0) {
        container.innerHTML = '<div class="col-12 text-center py-5 text-muted">No resources found.</div>';
        return;
    }
    resources.forEach(res => {
        const isPolicy = res.category === 'Policy';
        const isSchedule = res.category === 'Schedule';
        const isForm = res.category === 'Form';
        let icon = 'description';
        let colorClass = 'text-primary';
        let bgClass = 'bg-primary';
        // Check file extension
        const fileExt = res.file_path ? res.file_path.split('.').pop().toLowerCase() : '';
        if (fileExt === 'pdf') {
            icon = 'picture_as_pdf';
            colorClass = 'text-danger';
            bgClass = 'bg-danger';
        }
        else if (['doc', 'docx'].includes(fileExt)) {
            icon = 'article';
            colorClass = 'text-primary';
            bgClass = 'bg-primary';
        }
        else if (['xls', 'xlsx'].includes(fileExt)) {
            icon = 'table_chart';
            colorClass = 'text-success';
            bgClass = 'bg-success';
        }
        else if (isSchedule) {
            icon = 'calendar_today';
            colorClass = 'text-warning';
            bgClass = 'bg-warning';
        }
        else if (isPolicy) {
            icon = 'gavel';
            colorClass = 'text-danger';
            bgClass = 'bg-danger';
        }
        else if (isForm) {
            icon = 'assignment';
            colorClass = 'text-success';
            bgClass = 'bg-success';
        }
        // Mock download/view action
        // Construct Full URL
        // API_BASE_URL usually ends with /api. We need the root for static files.
        const backendRoot = API_BASE_URL.replace('/api', '');
        const fullUrl = res.file_path.startsWith('http') ? res.file_path : `${backendRoot}${res.file_path}`;
        // View Action (Modal or New Tab)
        const viewAction = `onclick="viewResource('${fullUrl}', '${res.title}', '${fileExt}')"`;
        // Buttons
        const actionBtn = `<button ${viewAction} class="btn btn-sm btn-light border fw-medium d-flex align-items-center justify-content-center gap-1 px-3 flex-grow-1 text-nowrap"><span class="material-icons fs-6">visibility</span> View</button>`;
        let deleteBtn = '';
        if (appState.role === 'Tenant_Admin' || appState.role === 'Principal' || appState.isSuperAdmin) {
            deleteBtn = `<button class="btn btn-sm btn-light border text-danger d-flex align-items-center justify-content-center px-2" onclick="deleteResource(${res.id})" title="Delete"><span class="material-icons fs-6">delete</span></button>`;
        }
        const html = `
            <div class="col-md-6 col-lg-4 col-xl-3">
                <div class="card h-100 border-0 shadow-sm hover-up transition-hover glass-card-solid">
                    <div class="card-body p-4 d-flex flex-column">
                        <!-- Header -->
                        <div class="d-flex align-items-start justify-content-between mb-3">
                            <div class="rounded-circle d-flex align-items-center justify-content-center ${bgClass} bg-opacity-10" style="width:48px; height:48px;">
                                <span class="material-icons ${colorClass} fs-5">${icon}</span>
                            </div>
                            <span class="badge bg-white text-secondary border rounded-pill px-2 py-1" style="font-weight:500; font-size:11px;">${res.category}</span>
                        </div>
                        
                        <!-- Content -->
                        <h6 class="fw-bold mb-2 text-dark text-truncate-2" title="${res.title}" style="line-height:1.4;">${res.title}</h6>
                        <p class="text-muted small mb-4 flex-grow-1 clamp-3" style="font-size: 13px;">${res.description || 'No description available.'}</p>
                        
                        <!-- Footer -->
                        <div class="pt-3 border-top mt-auto">
                             <div class="d-flex flex-column gap-2">
                                <div class="d-flex flex-column">
                                    <small class="text-uppercase text-muted" style="font-size:10px; font-weight:700; letter-spacing:0.5px;">Uploaded</small>
                                    <small class="text-dark fw-medium" style="font-size:12px;">${new Date(res.uploaded_at).toLocaleDateString()}</small>
                                </div>
                                <div class="d-flex gap-2 align-items-stretch w-100">
                                    ${actionBtn}
                                    ${deleteBtn}
                                </div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}
function viewResource(url, title, ext) {
    return __awaiter(this, void 0, void 0, function* () {
        // Show loading toast if available
        if (typeof showToast === 'function')
            showToast("Opening preview...", "info");
        // Check if file is accessible via HEAD request to prevent 404 inside modal
        try {
            const check = yield fetch(url, { method: 'HEAD' });
            if (!check.ok) {
                throw new Error("File not found");
            }
        }
        catch (e) {
            console.error("Resource not found:", e);
            if (typeof showToast === 'function')
                showToast("Error: File not found on server.", "error");
            else
                alert("Error: File not found on server. Please ask admin to re-upload.");
            return;
        }
        if (ext === 'pdf' || ext === 'txt' || ['jpg', 'jpeg', 'png'].includes(ext)) {
            // Use Modal for valid types
            let modalHtml = '';
            if (ext === 'pdf') {
                modalHtml = `<iframe src="${url}" width="100%" height="600px" style="border:none;" title="${title}"></iframe>`;
            }
            else if (['jpg', 'jpeg', 'png'].includes(ext)) {
                modalHtml = `<img src="${url}" class="img-fluid" alt="${title}">`;
            }
            else {
                modalHtml = `<iframe src="${url}" width="100%" height="600px" style="border:none; background:white;" title="${title}"></iframe>`;
            }
            // Inject modal if not exists (or update existing)
            let modalEl = document.getElementById('resourcePreviewModal');
            if (!modalEl) {
                document.body.insertAdjacentHTML('beforeend', `
                <div class="view full-page-view" id="resourcePreviewModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
                    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                        <div class="modal-content border-0 shadow-lg" style="height: 90vh;">
                            <div class="modal-header border-bottom-0">
                                <h5 class="modal-title fw-bold text-truncate" id="previewTitle">Preview</h5>
                                <div class="d-flex gap-2">
                                     <a href="#" id="previewDownloadBtn" target="_blank" class="btn btn-sm btn-primary rounded-pill px-3 d-flex align-items-center gap-1">
                                        <span class="material-icons fs-6">download</span> Download
                                     </a>
                                     <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                </div>
                            </div>
                            <div class="modal-body p-0 bg-light d-flex align-items-center justify-content-center" id="previewBody">
                                <!-- Content -->
                            </div>
                        </div>
                    </div>
                </div>
            `);
                modalEl = document.getElementById('resourcePreviewModal');
            }
            document.getElementById('previewTitle').textContent = title;
            document.getElementById('previewBody').innerHTML = modalHtml;
            document.getElementById('previewDownloadBtn').href = url;
            document.getElementById('previewDownloadBtn').href = url;
            openView(modalEl.id);
        }
        else {
            // Fallback for docs/others
            window.open(url, '_blank');
        }
    });
}
function filterResources(category, btnElement) {
    if (btnElement) {
        // Update active state
        const buttons = btnElement.parentElement.querySelectorAll('.btn');
        buttons.forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }
    loadResources(normalizeResourceCategory(category));
}
// Redirect to VIEW instead of Modal
function openUploadResourceModal() {
    switchView('upload-resource-view');
    document.getElementById('upload-resource-form-view').reset();
    document.getElementById('file-name-display').classList.add('d-none');
    populateResourceUploadSchoolOptions();
    loadResourceFormTemplates();
    handleResourceCategoryChange();
}
// Handle Form Submit from VIEW
function handleUploadResourceView(e) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        e.preventDefault();
        const title = document.getElementById('res-title-view').value;
        const category = document.getElementById('res-category-view').value;
        const templateKeyEl = document.getElementById('res-template-view');
        const selectedTemplate = templateKeyEl ? templateKeyEl.value : '';
        const desc = getVal('res-desc-view');
        const fileInput = getEl('res-file-view');
        const useTemplatePublish = category === 'Form' && !!selectedTemplate;
        if (!title) {
            alert("Title is required.");
            return;
        }
        if (!useTemplatePublish && (!fileInput.files || !fileInput.files[0])) {
            alert("File is required for custom upload.");
            return;
        }
        const selectedSchoolEl = document.getElementById('res-school-view');
        const schoolId = (selectedSchoolEl === null || selectedSchoolEl === void 0 ? void 0 : selectedSchoolEl.value) || String(appState.schoolId || appState.activeSchoolId || '1');
        const btn = e.submitter;
        const originalText = btn.innerHTML;
        try {
            // Show loading state
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';
            let response;
            if (useTemplatePublish) {
                response = yield fetchAPI('/resources/form-templates', {
                    method: 'POST',
                    body: JSON.stringify({
                        template_key: selectedTemplate,
                        school_id: Number(schoolId),
                        title: title || null,
                        description: desc || null
                    })
                });
            }
            else {
                const formData = new FormData();
                formData.append("title", title);
                formData.append("category", category);
                formData.append("description", desc);
                formData.append("file", fileInput.files[0]);
                formData.append("school_id", schoolId);
                response = yield fetch(`${API_BASE_URL}/resources`, {
                    method: 'POST',
                    headers: {
                        'X-User-Id': appState.userId || '',
                    },
                    body: formData
                });
            }
            if (!response.ok)
                throw yield response.text();
            // Success
            switchView('resources-view');
            loadResources(getActiveResourceCategory());
            if (typeof showToast === 'function') {
                showToast(useTemplatePublish ? "Template form published successfully!" : "Resource uploaded successfully!", "success");
            }
        }
        catch (error) {
            console.error("Upload Error:", error);
            alert("Upload Failed: " + (typeof error === 'string' ? error : error.message));
        }
        finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    });
}
// Keep legacy just in case
function handleUploadResource() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const title = getVal('res-title');
        const category = getVal('res-category');
        const desc = getVal('res-desc');
        const fileInput = getInput('res-file');
        if (!title || !fileInput.files || !fileInput.files[0]) {
            alert("Title and File are required.");
            return;
        }
        const formData = new FormData();
        formData.append("title", title);
        formData.append("category", category);
        formData.append("description", desc);
        formData.append("file", fileInput.files[0]);
        const selectedSchoolEl = document.getElementById('res-school-view');
        const schoolId = (selectedSchoolEl === null || selectedSchoolEl === void 0 ? void 0 : selectedSchoolEl.value) || String(appState.schoolId || appState.activeSchoolId || 1);
        formData.append("school_id", schoolId);
        try {
            // Upload via standard fetch since fetchAPI sets Content-Type to JSON
            const response = yield fetch(`${API_BASE_URL}/resources`, {
                method: 'POST',
                headers: {
                    'X-User-Id': appState.userId || '',
                    // Content-Type is auto-set with boundary for FormData
                },
                body: formData
            });
            if (!response.ok)
                throw yield response.text();
            const modalEl = document.getElementById('uploadResourceModal');
            closeView();
            loadResources(getActiveResourceCategory());
            // Simple toast mock if not exists
            if (typeof showToast === 'function')
                showToast("Resource uploaded successfully!", "success");
            else
                alert("Resource uploaded!");
        }
        catch (e) {
            console.error(e);
            if (typeof showToast === 'function')
                showToast("Failed to upload resource.", "error");
            else
                alert("Failed to upload resource.");
        }
    });
}
function deleteResource(id) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!confirm("Are you sure you want to delete this resource?"))
            return;
        try {
            yield fetchAPI(`/resources/${id}`, { method: 'DELETE' });
            loadResources(getActiveResourceCategory());
            if (typeof showToast === 'function')
                showToast("Resource deleted.", "success");
            else
                alert("Resource deleted.");
        }
        catch (e) {
            console.error(e);
            if (typeof showToast === 'function')
                showToast("Failed to delete resource.", "error");
            else
                alert("Failed to delete resource.");
        }
    });
}
// --- SIDEBAR CHATBOT LOGIC (NEW) ---

// --- Window bindings for inline HTML onclick handlers ---
window.loadResources = loadResources;
window.canManageResources = canManageResources;
window.normalizeResourceCategory = normalizeResourceCategory;
window.getActiveResourceCategory = getActiveResourceCategory;
window.initResourcesView = initResourcesView;
window.handleResourceCategoryChange = handleResourceCategoryChange;
window.handleResourceTemplateChange = handleResourceTemplateChange;
window.loadResourceFormTemplates = loadResourceFormTemplates;
window.populateResourceUploadSchoolOptions = populateResourceUploadSchoolOptions;
window.renderResources = renderResources;
window.viewResource = viewResource;
window.filterResources = filterResources;
window.openUploadResourceModal = openUploadResourceModal;
window.handleUploadResourceView = handleUploadResourceView;
window.handleUploadResource = handleUploadResource;
window.deleteResource = deleteResource;
