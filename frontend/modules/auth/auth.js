/**
 * auth.js — Authentication Module
 * Provides: loadSchoolsForRegistration, showRegister, showLogin,
 *           handleRegister, checkPasswordStrength, handleRoleChange, generateInvite,
 *           openForgotPassword, handleForgotPassword, handleResetPasswordSubmit,
 *           selectLoginRole, handleLogin, handle2FASubmit,
 *           handleCredentialResponse, handleSocialLogin, handleLogout
 * Note: clearLoginFormSensitiveFields intentionally included
 */
function loadSchoolsForRegistration() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const select = document.getElementById('reg-school');
            if (!select)
                return;
            select.innerHTML = '<option value="">Loading schools...</option>';
            const response = yield fetch(`${API_BASE_URL}/admin/schools`);
            if (response.ok) {
                const schools = yield response.json();
                select.innerHTML = '';
                schools.forEach(school => {
                    const opt = document.createElement('option');
                    opt.value = school.id;
                    opt.textContent = school.name;
                    select.appendChild(opt);
                });
                if (schools.length === 0) {
                    const opt = document.createElement('option');
                    opt.value = '1';
                    opt.textContent = "Independent / Default School";
                    select.appendChild(opt);
                }
            }
            else {
                select.innerHTML = '<option value="1">Default School</option>';
            }
        }
        catch (e) {
            console.error("Error loading schools", e);
            const select = document.getElementById('reg-school');
            if (select)
                select.innerHTML = '<option value="1">Default School</option>';
        }
    });
}
function showRegister(e) {
    if (e && e.preventDefault)
        e.preventDefault();
    switchView('register-view');
    loadSchoolsForRegistration();
}
function showLogin(e) {
    if (e)
        e.preventDefault();
    clearLoginFormSensitiveFields();
    switchView('login-view');
}

function clearLoginFormSensitiveFields() {
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const clearNow = () => {
        if (usernameEl) {
            usernameEl.value = '';
            usernameEl.setAttribute('autocomplete', 'off');
        }
        if (passwordEl) {
            passwordEl.value = '';
            passwordEl.setAttribute('autocomplete', 'new-password');
        }
    };
    clearNow();
    setTimeout(clearNow, 0);
    setTimeout(clearNow, 150);
}
// --- AUTHENTICATION ---
function handleRegister(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const msg = document.getElementById('register-message');
        msg.textContent = 'Creating account...';
        msg.className = 'text-primary fw-bold';
        let inviteInput = document.getElementById('reg-invite').value.trim();
        // Fix: Extract token if user pasted full URL
        if (inviteInput.includes("invite=")) {
            inviteInput = inviteInput.split("invite=")[1].split("&")[0];
        }
        if (!inviteInput) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Invitation Code is required.';
            return;
        }
        const password = document.getElementById('reg-password').value;
        if (!checkPasswordStrength(password)) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Please fix password issues before submitting.';
            return;
        }
        const data = {
            name: document.getElementById('reg-name').value,
            email: document.getElementById('reg-email').value,
            password: password,
            grade: parseInt(document.getElementById('reg-grade').value) || 9,
            preferred_subject: document.getElementById('reg-subject').value || "General",
            role: document.getElementById('reg-role').value, // FR-3
            invitation_token: inviteInput, // FR-4
            school_id: parseInt(document.getElementById('reg-school').value) || 1
        };
        try {
            const response = yield fetchAPI('/auth/register', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            const result = yield response.json();
            if (response.ok) {
                msg.className = 'text-success fw-bold';
                msg.textContent = 'Success! Redirecting to login...';
                setTimeout(() => {
                    showLogin();
                    document.getElementById('register-form').reset();
                    document.getElementById('password-strength-msg').textContent = '';
                    msg.textContent = '';
                    // Pre-fill login
                    document.getElementById('username').value = data.email;
                }, 1500);
            }
            else {
                msg.className = 'text-danger fw-bold';
                msg.textContent = result.detail || 'Registration failed.';
            }
        }
        catch (error) {
            msg.className = 'text-danger fw-bold';
            msg.textContent = 'Network error during registration.';
        }
    });
}
// FR-12: Client-side Password Validation
function checkPasswordStrength(password) {
    const msgEl = document.getElementById('password-strength-msg');
    if (password.length === 0) {
        msgEl.textContent = '';
        return false;
    }
    let isValid = true;
    let feedback = [];
    if (password.length < 8) {
        feedback.push("Min 8 chars");
        isValid = false;
    }
    if (!/\d/.test(password)) {
        feedback.push("1 number");
        isValid = false;
    }
    if (!/[a-zA-Z]/.test(password)) {
        feedback.push("1 letter");
        isValid = false;
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
        feedback.push("1 special char");
        isValid = false;
    }
    if (isValid) {
        msgEl.textContent = "✅ Strong password";
        msgEl.className = "small mb-3 ms-1 fw-bold text-success";
        return true;
    }
    else {
        msgEl.textContent = "⚠️ Weak: " + feedback.join(", ");
        msgEl.className = "small mb-3 ms-1 fw-bold text-danger";
        return false;
    }
}
// FR-3 & FR-4: Role Handling and Invitation Logic
function handleRoleChange() {
    const role = document.getElementById('reg-role').value;
    const studentFields = document.querySelector('#register-form .row'); // Grade/Subject fields
    if (role === 'Student') {
        studentFields.style.display = 'flex';
        document.getElementById('reg-grade').required = true;
    }
    else {
        studentFields.style.display = 'none';
        document.getElementById('reg-grade').required = false;
    }
}
function generateInvite() {
    return __awaiter(this, void 0, void 0, function* () {
        const role = document.getElementById('invite-role').value;
        const resultDiv = document.getElementById('invite-result');
        resultDiv.classList.remove('d-none');
        resultDiv.textContent = 'Generating...';
        try {
            const response = yield fetchAPI('/invitations/generate', {
                method: 'POST',
                body: JSON.stringify({ role: role, expiry_hours: 48 })
            });
            if (response.ok) {
                const data = yield response.json();
                const link = window.location.origin + "/?invite=" + data.token;
                resultDiv.innerHTML = `
                <strong>Token:</strong> ${data.token}<br>
                <div class="input-group input-group-sm mt-1">
                    <input type="text" class="form-control" value="${link}" readonly>
                    <button class="btn btn-outline-secondary" onclick="navigator.clipboard.writeText('${link}')">Copy</button>
                </div>
                <small class="text-danger">Expires: ${new Date(data.expires_at).toLocaleString()}</small>
            `;
            }
            else {
                resultDiv.textContent = 'Error generating invite.';
            }
        }
        catch (e) {
            console.error(e);
            resultDiv.textContent = 'Network error.';
        }
    });
}
// Check for Invite Token in URL
document.getElementById('register-form').addEventListener('submit', handleRegister);
document.getElementById('forgot-password-form').addEventListener('submit', handleForgotPassword);
document.getElementById('reset-password-form').addEventListener('submit', handleResetPasswordSubmit); // New Listener
function openForgotPassword(e) {
    if (e)
        e.preventDefault();
    document.getElementById('forgot-password-form').reset();
    document.getElementById('reset-message').textContent = '';
    elements.forgotPasswordModal.show();
}
function handleForgotPassword(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const msg = document.getElementById('reset-message');
        msg.textContent = 'Sending request...';
        msg.className = 'text-center fw-medium small mb-2 text-primary';
        try {
            const response = yield fetchAPI('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            const data = yield response.json();
            // DEV MODE: Show Link
            if (data.dev_link) {
                msg.innerHTML = `
                <div class="alert alert-success small p-2 mt-2">
                    ${data.message}<br>
                    <a href="${data.dev_link}" class="btn btn-sm btn-success mt-2 fw-bold w-100">
                        <span class="material-icons align-middle" style="font-size: 16px;">email</span> Open Simulated Email
                    </a>
                </div>`;
                msg.className = 'text-center small mb-2';
            }
            else {
                msg.textContent = data.message;
                msg.className = 'text-center fw-medium small mb-2 text-success';
            }
        }
        catch (err) {
            msg.textContent = 'Network error.';
            msg.className = 'text-center fw-medium small mb-2 text-danger';
        }
    });
}
// Reset Password Logic
window.addEventListener('DOMContentLoaded', () => {
    // Check for Invite
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (inviteToken) {
        showRegister(new Event('click'));
        document.getElementById('reg-invite').value = inviteToken;
        const msg = document.getElementById('register-message');
        msg.textContent = "Invitation code applied! Please complete registration.";
        msg.className = "text-primary fw-medium";
    }
    // Check for Reset Token
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        document.getElementById('reset-token').value = resetToken;
        openView('resetPasswordModal');
        // Clean URL visual
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
function handleResetPasswordSubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const token = document.getElementById('reset-token').value;
        const newPass = document.getElementById('new-reset-pass').value;
        const confirmPass = document.getElementById('confirm-reset-pass').value;
        const msg = document.getElementById('new-reset-message');
        if (newPass !== confirmPass) {
            msg.textContent = 'Passwords do not match.';
            msg.className = 'text-danger fw-bold text-center mb-3';
            return;
        }
        if (!checkPasswordStrength(newPass)) {
            msg.textContent = 'Password is too weak.';
            msg.className = 'text-danger fw-bold text-center mb-3';
            return;
        }
        try {
            const response = yield fetchAPI('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token: token, new_password: newPass })
            });
            const data = yield response.json();
            if (response.ok) {
                msg.textContent = "Success! Redirecting to login...";
                msg.className = "text-success fw-bold text-center mb-3";
                setTimeout(() => {
                    closeView();
                    showLogin(null);
                }, 2000);
            }
            else {
                msg.textContent = data.detail || "Reset failed.";
                msg.className = "text-danger fw-bold text-center mb-3";
            }
        }
        catch (e) {
            msg.textContent = "Network error.";
            msg.className = "text-danger fw-bold text-center mb-3";
        }
    });
}
// FR-Role-Selection
function selectLoginRole(role) {
    // 1. Update State
    document.getElementById('selected-role').value = role;
    clearLoginFormSensitiveFields();
    // 2. Update UI (New Elements)
    const roleLabelMap = {
        'Student': 'role_student',
        'Teacher': 'role_teacher',
        'Parent': 'role_parent',
        'Principal': 'role_principal',
        'Admin': 'role_admin',
        'Root_Super_Admin': 'role_root_admin'
    };
    const labelEl = document.getElementById('login-role-label');
    if (labelEl)
        labelEl.textContent = t(roleLabelMap[role] || 'role_student');
    const iconEl = document.getElementById('login-role-icon');
    const iconMap = {
        'Student': 'backpack',
        'Teacher': 'school',
        'Parent': 'home',
        'Admin': 'badge',
        'Principal': 'account_balance',
        'Root_Super_Admin': 'admin_panel_settings'
    };
    if (iconEl && iconMap[role]) {
        iconEl.textContent = iconMap[role];
    }
    // 3. Update Title & Labels
    const titleMap = {
        'Student': 'login_student_login',
        'Teacher': 'login_teacher_portal',
        'Parent': 'login_parent_access',
        'Principal': 'login_principal_login',
        'Admin': 'login_super_admin',
        'Root_Super_Admin': 'login_root_admin_portal'
    };
    const titleEl = document.getElementById('login-title');
    if (titleEl)
        titleEl.textContent = t(titleMap[role] || 'login_generic');
    const lbl = document.querySelector('label[for="username"]');
    const input = document.getElementById('username');
    if (lbl && input) {
        lbl.textContent = t('label_username');
        input.placeholder = t('label_username');
    }
}
function handleLogin(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const msgEl = elements.loginMessage;
        if (!username || !password) {
            msgEl.textContent = t('msg_enter_credentials');
            msgEl.className = 'text-danger fw-bold';
            return;
        }
        msgEl.className = 'text-primary fw-medium';
        // FR-Role-Selection: Capture selected role
        const selectedRole = document.getElementById('selected-role').value;
        try {
            const response = yield fetchAPI('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password, role: selectedRole })
            });
            if (response.ok) {
                const data = yield response.json();
                // CHECK 2FA REQUIREMENT
                if (data.requires_2fa) {
                    appState.tempUserId = data.user_id; // Store ID for 2nd step
                    msgEl.textContent = ""; // Clear message
                    // Show relevant message
                    const demoContainer = document.getElementById('demo-codes-container');
                    const twoFactorMsg = document.getElementById('2fa-message');
                    if (data.email_masked) {
                        twoFactorMsg.textContent = `A verification code has been sent to ${data.email_masked}`;
                        twoFactorMsg.className = 'text-info fw-bold mb-3 d-block';
                        if (demoContainer)
                            demoContainer.classList.add('d-none');
                    }
                    else {
                        if (demoContainer)
                            demoContainer.classList.add('d-none');
                        twoFactorMsg.textContent = "Please check your email for the code.";
                        twoFactorMsg.className = 'text-info fw-bold mb-3 d-block';
                    }
                    switchView('two-factor-view');
                    return;
                }
                // CHECK ROLE MATCH
                // The user MUST have logged in through the correct portal tab.
                // CHECK ROLE MATCH
                const selectedRole = document.getElementById('selected-role').value;
                let allowLogin = false;
                if (data.role === selectedRole || data.role === 'Admin' || data.is_super_admin) {
                    allowLogin = true;
                }
                if (!allowLogin && isParentRole(data.role) && isParentRole(selectedRole)) {
                    allowLogin = true;
                }
                if (!allowLogin) {
                    msgEl.textContent = `Access Denied: This account belongs to the ${data.role} portal.`;
                    msgEl.className = 'text-danger fw-bold';
                    // Reset backend session immediately since we are denying access
                    appState.isLoggedIn = false;
                    console.warn(`Role Mismatch: Selected ${selectedRole}, Actual ${data.role}`);
                    return;
                }
                // SUCCESSFUL LOGIN
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                appState.roles = data.roles || [];
                appState.permissions = data.permissions || [];
                applyRoleTheme();
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                // Persist Session
                localStorage.setItem('classbridge_session', JSON.stringify({
                    user_id: data.user_id,
                    name: data.name,
                    role: data.role,
                    school_id: data.school_id,
                    school_name: data.school_name,
                    is_super_admin: data.is_super_admin,
                    active_student_id: appState.activeStudentId,
                    roles: data.roles || [],
                    permissions: data.permissions || []
                }));
                msgEl.textContent = t('msg_welcome', { user_id: data.user_id });
                if (appState.schoolName && appState.schoolName !== 'Independent') {
                    msgEl.textContent += ` (${appState.schoolName})`;
                }
                msgEl.className = 'text-success fw-bold';
                setTimeout(() => {
                    msgEl.textContent = '';
                    initializeDashboard();
                }, 500);
            }
            else {
                // ERROR HANDLING
                const err = yield response.json().catch(() => ({ detail: t('msg_login_failed') }));
                msgEl.textContent = err.detail || t('msg_login_failed');
                msgEl.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            msgEl.textContent = t('msg_network_error', { error: error.message });
            msgEl.className = 'text-danger fw-bold';
            console.error("Login Error:", error);
        }
    });
}
function handle2FASubmit(e) {
    return __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const code = document.getElementById('2fa-code').value.trim();
        const msgEl = document.getElementById('2fa-message');
        if (!code) {
            msgEl.textContent = "Please enter the code.";
            return;
        }
        msgEl.textContent = "Verifying...";
        msgEl.className = "text-primary fw-medium";
        if (!appState.tempUserId) {
            console.error("Missing tempUserId");
            msgEl.textContent = "Session expired. Please login again.";
            msgEl.className = "text-danger fw-bold";
            return;
        }
        try {
            const payload = {
                user_id: appState.tempUserId,
                code: code
            };
            console.log("Sending 2FA payload:", payload);
            const response = yield fetchAPI('/auth/verify-2fa', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const data = yield response.json();
                // Success!
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id; // confirmed ID
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                localStorage.setItem('classbridge_session', JSON.stringify({
                    user_id: data.user_id,
                    name: data.name,
                    role: data.role,
                    school_id: data.school_id,
                    school_name: data.school_name,
                    is_super_admin: data.is_super_admin,
                    active_student_id: appState.activeStudentId,
                    roles: data.roles || [],
                    permissions: data.permissions || []
                }));
                // Clear temp state
                appState.tempUserId = null;
                document.getElementById('two-factor-form').reset();
                // Switch to Dashboard
                const msgEl2FA = document.getElementById('2fa-message');
                if (msgEl2FA) {
                    msgEl2FA.textContent = `Success! Welcome, ${data.user_id}`;
                    msgEl2FA.className = 'text-success fw-bold';
                }
                initializeDashboard();
            }
            else {
                const rawText = yield response.text();
                console.error("2FA Failed Response:", response.status, rawText);
                let errorDetail = "Verification failed.";
                try {
                    const err = JSON.parse(rawText);
                    errorDetail = err.detail || errorDetail;
                }
                catch (jsonErr) { }
                msgEl.textContent = errorDetail;
                msgEl.className = "text-danger fw-bold";
            }
        }
        catch (e) {
            console.error("2FA Network Error:", e);
            msgEl.textContent = "Network error: " + e.message;
            msgEl.className = "text-danger fw-bold";
        }
    });
}
// --- SOCIAL LOGIN (FR-2 REAL GOOGLE + SIMULATED MICROSOFT) ---
// CALLBACK FOR REAL GOOGLE SIGN-IN
function handleCredentialResponse(response) {
    return __awaiter(this, void 0, void 0, function* () {
        elements.loginMessage.textContent = t('msg_google_verify');
        console.log("Encoded JWT ID token: " + response.credential);
        try {
            // Send JWT to backend for verification
            const apiRes = yield fetch(`${API_BASE_URL}/auth/google-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: response.credential })
            });
            if (apiRes.ok) {
                const data = yield apiRes.json();
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                // Fix for Parent: Use Related Student ID as Active Student
                if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                    appState.activeStudentId = data.related_student_id;
                }
                else if (appState.role === 'Student') {
                    appState.activeStudentId = data.user_id;
                }
                else {
                    appState.activeStudentId = null;
                }
                elements.loginMessage.textContent = t('msg_welcome', { user_id: data.user_id });
                elements.loginMessage.className = 'text-success fw-bold';
                setTimeout(() => {
                    elements.loginMessage.textContent = '';
                    initializeDashboard();
                }, 1000);
            }
            else {
                // SAFE ERROR HANDLING
                const rawText = yield apiRes.text();
                let errorMsg = "Google Login failed.";
                try {
                    const error = JSON.parse(rawText);
                    errorMsg = error.detail || errorMsg;
                }
                catch (e) {
                    if (rawText.trim().length > 0)
                        errorMsg = "Server Error: " + rawText.substring(0, 100);
                }
                console.error("Google Login Failed:", apiRes.status, errorMsg);
                elements.loginMessage.textContent = `Error (${apiRes.status}): ${errorMsg}`;
                elements.loginMessage.className = 'text-danger fw-bold';
            }
        }
        catch (e) {
            console.error(e);
            elements.loginMessage.textContent = "Verification Error.";
            elements.loginMessage.className = 'text-danger fw-bold';
        }
    });
}
function handleSocialLogin(provider) {
    return __awaiter(this, void 0, void 0, function* () {
        if (provider === 'Google') {
            return;
        }
        if (provider === 'Microsoft') {
            // Check if we are in "Simulated Mode" (ID is missing)
            if (msalConfig.auth.clientId === "YOUR_MICROSOFT_CLIENT_ID") {
                console.log("Microsoft Client ID missing. Using SIMULATED Login.");
                console.log("⚠️ Running in SIMULATED MODE: No real Microsoft Client ID provided.");
                // We intentionally fall through to the simulation logic below
            }
            else {
                // REAL Microsoft Login
                try {
                    elements.loginMessage.textContent = t('msg_microsoft_conn');
                    elements.loginMessage.className = 'text-primary fw-bold';
                    const loginRequest = {
                        scopes: ["User.Read"]
                    };
                    const loginResponse = yield msalInstance.loginPopup(loginRequest);
                    elements.loginMessage.textContent = t('msg_microsoft_verify');
                    // Send access token to backend
                    const response = yield fetch(`${API_BASE_URL}/auth/microsoft-login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: loginResponse.accessToken })
                    });
                    if (response.ok) {
                        const data = yield response.json();
                        appState.isLoggedIn = true;
                        document.body.classList.remove('login-mode');
                        appState.role = data.role;
                        appState.userId = data.user_id;
                        appState.schoolId = data.school_id;
                        appState.schoolName = data.school_name;
                        appState.isSuperAdmin = data.is_super_admin;
                        appState.name = data.name || data.user_id;
                        // Fix for Parent: Use Related Student ID as Active Student
                        if ((appState.role === 'Parent' || appState.role === 'Parent_Guardian') && data.related_student_id) {
                            appState.activeStudentId = data.related_student_id;
                        }
                        else if (appState.role === 'Student') {
                            appState.activeStudentId = data.user_id;
                        }
                        else {
                            appState.activeStudentId = null;
                        }
                        elements.loginMessage.textContent = t('msg_welcome', { user_id: data.user_id });
                        if (appState.schoolName && appState.schoolName !== 'Independent') {
                            elements.loginMessage.textContent += ` (${appState.schoolName})`;
                        }
                        elements.loginMessage.className = 'text-success fw-bold';
                        setTimeout(() => {
                            elements.loginMessage.textContent = '';
                            initializeDashboard();
                        }, 1000);
                    }
                    else {
                        const errorData = yield response.json();
                        elements.loginMessage.textContent = errorData.detail || "Microsoft login failed.";
                        elements.loginMessage.className = 'text-danger fw-bold';
                    }
                }
                catch (error) {
                    console.error(error);
                    elements.loginMessage.textContent = "Microsoft Login cancelled or failed.";
                    elements.loginMessage.className = 'text-danger fw-bold';
                }
                return;
            }
        }
        // Fallback for other providers (simulated)
        elements.loginMessage.textContent = `Connecting to ${provider}...`;
        elements.loginMessage.className = 'text-primary fw-bold';
        // Simulating a token from the provider
        const simulatedToken = `token_${provider.toLowerCase()}_${Date.now()}`;
        try {
            const response = yield fetch(`${API_BASE_URL}/auth/social-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: provider, token: simulatedToken })
            });
            if (response.ok) {
                const data = yield response.json();
                appState.isLoggedIn = true;
                document.body.classList.remove('login-mode');
                appState.role = data.role;
                appState.userId = data.user_id;
                appState.schoolId = data.school_id;
                appState.schoolName = data.school_name;
                appState.isSuperAdmin = data.is_super_admin;
                appState.name = data.name || data.user_id;
                appState.activeStudentId = (isParentRole(data.role) || data.role === 'Student') ? data.user_id : null;
                elements.loginMessage.textContent = `Success! Welcome, ${data.user_id}`;
                if (appState.schoolName && appState.schoolName !== 'Independent') {
                    elements.loginMessage.textContent += ` (${appState.schoolName})`;
                }
                elements.loginMessage.className = 'text-success fw-bold';
                setTimeout(() => {
                    elements.loginMessage.textContent = '';
                    initializeDashboard();
                }, 1000);
            }
            else {
                // SAFE ERROR HANDLING
                const rawText = yield response.text();
                let errorMsg = `${provider} login failed.`;
                try {
                    const errorData = JSON.parse(rawText);
                    errorMsg = errorData.detail || errorMsg;
                }
                catch (e) {
                    if (rawText.trim().length > 0)
                        errorMsg = "Server Error: " + rawText.substring(0, 100);
                }
                elements.loginMessage.textContent = errorMsg;
                elements.loginMessage.className = 'text-danger fw-bold';
            }
        }
        catch (error) {
            elements.loginMessage.textContent = `Social Login Network Error: ${error.message}`;
            elements.loginMessage.className = 'text-danger fw-bold';
            console.error(error);
        }
    });
}
