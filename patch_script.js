const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src/script.js');
let content = fs.readFileSync(srcPath, 'utf-8');

const replacement = `
let _allRolePermissions = {};

function loadPermissionsForModal() {
    return __awaiter(this, arguments, void 0, function* (selectedCodes = []) {
        const container = document.getElementById('role-perms-container');
        if (!container) return;

        // Reset selected tags area
        _updateSelectedPermsTags(selectedCodes);

        container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div><br><span class="text-muted small">Loading permissions...</span></div>';

        try {
            const response = yield fetchAPI('/admin/permissions');
            if (!response.ok) throw new Error("Failed to load perms");
            
            const groupedPerms = yield response.json();
            _allRolePermissions = groupedPerms;
            _renderPermissionsCheckboxes(groupedPerms, selectedCodes);
        } catch (e) {
            console.error('loadPermissionsForModal error:', e);
            if (container) container.innerHTML = '<p class="text-danger small">Error loading permissions.</p>';
        }
    });
}

function _renderPermissionsCheckboxes(groupedPerms, selectedCodes) {
    const container = document.getElementById('role-perms-container');
    if (!container) return;

    const currentSelected = _getSelectedPermCodes();
    const checkedSet = new Set(currentSelected.length ? currentSelected : (selectedCodes || []));

    container.innerHTML = '';
    let totalVisible = 0;

    for (const [group, perms] of Object.entries(groupedPerms)) {
        if (!perms || perms.length === 0) continue;
        totalVisible += perms.length;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-4 perm-group-block';
        groupDiv.innerHTML = \`
            <div class="d-flex align-items-center gap-2 mb-2">
                <span class="fw-bold text-uppercase" style="font-size:0.67rem;letter-spacing:0.07em;color:#6366f1;">\${group}</span>
                <div class="flex-grow-1" style="height:1px;background:#e0e7ff;"></div>
            </div>\`;

        const listDiv = document.createElement('div');
        listDiv.className = 'd-flex flex-column gap-2';

        perms.forEach(p => {
            const isChecked = checkedSet.has(p.code);
            const itemDiv = document.createElement('div');
            itemDiv.className = 'perm-item p-2 rounded-2 d-flex justify-content-between align-items-center border';
            itemDiv.dataset.code = p.code;
            itemDiv.dataset.desc = (p.description || '').toLowerCase();
            if (isChecked) itemDiv.style.opacity = '0.5';
            
            itemDiv.innerHTML = \`
                <div>
                    <span class="d-block fw-semibold" style="color:#1e1b4b;font-size:0.78rem;">\${p.description || p.code}</span>
                    <span class="font-monospace" style="font-size:0.65rem;color:#8b5cf6;">\${p.code}</span>
                </div>
                <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 rounded-pill" 
                    \${isChecked ? 'disabled' : ''}
                    onclick="_moveToSelected('\${p.code}', '\${p.description ? p.description.replace(/'/g, "\\\\'") : p.code}')">Add</button>
            \`;
            listDiv.appendChild(itemDiv);
        });

        groupDiv.appendChild(listDiv);
        container.appendChild(groupDiv);
    }

    if (totalVisible === 0) {
        container.innerHTML = '<p class="text-muted small text-center py-3">No permissions match your search.</p>';
    }
}

function _moveToSelected(code, label) {
    const isAlreadySelected = _getSelectedPermCodes().includes(code);
    if(isAlreadySelected) return;

    const selectedList = document.getElementById('selected-perms-list');
    const hint = document.getElementById('no-perms-hint');
    
    if (hint) hint.style.display = 'none';

    const item = document.createElement('div');
    item.className = 'p-2 rounded-2 d-flex justify-content-between align-items-center bg-white border perm-tag';
    item.dataset.code = code;
    item.dataset.label = label;
    item.innerHTML = \`
        <div>
            <span class="d-block fw-semibold" style="color:#1e1b4b;font-size:0.78rem;">\${label}</span>
            <span class="font-monospace" style="font-size:0.65rem;color:#8b5cf6;">\${code}</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="_removePermTag('\${code}')">
            <span class="material-icons" style="font-size:16px;">close</span>
        </button>
    \`;
    
    if (selectedList) selectedList.appendChild(item);

    // Disable in available
    const availableBtn = document.querySelector(\`.perm-item[data-code="\${code}"] button\`);
    if(availableBtn) {
        availableBtn.disabled = true;
        availableBtn.closest('.perm-item').style.opacity = '0.5';
    }

    _updatePermCount();
}

function _removePermTag(code) {
    const tag = document.querySelector(\`.perm-tag[data-code="\${code}"]\`);
    if (tag) tag.remove();

    // Re-enable in available list
    const availableBtn = document.querySelector(\`.perm-item[data-code="\${code}"] button\`);
    if(availableBtn) {
        availableBtn.disabled = false;
        availableBtn.closest('.perm-item').style.opacity = '1';
    }

    const tags = document.querySelectorAll('.perm-tag');
    const hint = document.getElementById('no-perms-hint');
    if (hint) hint.style.display = tags.length === 0 ? '' : 'none';

    _updatePermCount();
}

function clearAllPermissions() {
    _getSelectedPermCodes().forEach(code => _removePermTag(code));
}

function _updatePermCount() {
    const count = document.querySelectorAll('.perm-tag').length;
    const el = document.getElementById('selected-perms-count');
    if (el) el.textContent = \`\${count} selected\`;
}

function _getSelectedPermCodes() {
    return Array.from(document.querySelectorAll('.perm-tag')).map(t => t.dataset.code);
}

function _updateSelectedPermsTags(selectedCodes) {
    const selectedList = document.getElementById('selected-perms-list');
    const hint = document.getElementById('no-perms-hint');
    if (!selectedList) return;

    document.querySelectorAll('.perm-tag').forEach(t => t.remove());

    if (!selectedCodes || selectedCodes.length === 0) {
        if (hint) hint.style.display = '';
    } else {
        if (hint) hint.style.display = 'none';
        
        selectedCodes.forEach(code => {
            // we might not have the description handy here immediately, so we'll just use the code as label fallback
            let label = code;
            
            // fetch from _allRolePermissions if populated
            if(_allRolePermissions) {
                for (const group of Object.values(_allRolePermissions)) {
                    const p = group.find(x => x.code === code);
                    if(p) { label = p.description || code; break; }
                }
            }

            const item = document.createElement('div');
            item.className = 'p-2 rounded-2 d-flex justify-content-between align-items-center bg-white border perm-tag';
            item.dataset.code = code;
            item.innerHTML = \`
                <div>
                    <span class="d-block fw-semibold" style="color:#1e1b4b;font-size:0.78rem;">\${label}</span>
                    <span class="font-monospace" style="font-size:0.65rem;color:#8b5cf6;">\${code}</span>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="_removePermTag('\${code}')">
                    <span class="material-icons" style="font-size:16px;">close</span>
                </button>
            \`;
            selectedList.appendChild(item);
        });
    }
    _updatePermCount();
}

function filterRolePermissions(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        document.querySelectorAll('.perm-group-block').forEach(g => g.style.display = '');
        document.querySelectorAll('.perm-item').forEach(i => i.style.display = '');
        return;
    }
    document.querySelectorAll('.perm-group-block').forEach(group => {
        let anyVisible = false;
        group.querySelectorAll('.perm-item').forEach(item => {
            const code = (item.dataset.code || '').toLowerCase();
            const desc = (item.dataset.desc || '').toLowerCase();
            const match = code.includes(q) || desc.includes(q);
            item.style.display = match ? '' : 'none';
            if (match) anyVisible = true;
        });
        group.style.display = anyVisible ? '' : 'none';
    });
}
`;

const startIndex = content.indexOf('let _allRolePermissions = {};');
const endIndex = content.indexOf('function handleSaveRole() {');

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + replacement + '\n' + content.substring(endIndex);
    fs.writeFileSync(srcPath, newContent);
    console.log("Successfully patched src/script.js");
} else {
    console.log("Could not find boundaries");
}
