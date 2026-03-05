const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src/modules/roles_permissions/rbac.js');
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
`;

const startIndex = content.indexOf('function loadPermissionsForModal() {');
const endIndex = content.indexOf('function handleSaveRole() {');

if (startIndex !== -1 && endIndex !== -1) {
    const newContent = content.substring(0, startIndex) + replacement + '\n' + content.substring(endIndex);
    fs.writeFileSync(srcPath, newContent);
    console.log("patched rbac.js");
} else {
    console.log("could not patch");
}
