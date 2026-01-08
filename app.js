// Sound presets
const soundPresets = [
    { name: 'Ding', url: 'https://www.soundjay.com/buttons/beep-01a.mp3' },
    { name: 'Success', url: 'https://www.soundjay.com/buttons/beep-07.mp3' },
    { name: 'Click', url: 'https://www.soundjay.com/buttons/button-09.mp3' },
    { name: 'Pop', url: 'https://www.soundjay.com/buttons/button-16.mp3' },
    { name: 'Whoosh', url: 'https://www.soundjay.com/mechanical/sounds/whoosh-01.mp3' }
];

// Social platforms
const socialPlatforms = [
    { name: 'Twitter/X', icon: '𝕏', color: '#000000' },
    { name: 'Instagram', icon: '📸', color: '#E4405F' },
    { name: 'YouTube', icon: '▶️', color: '#FF0000' },
    { name: 'TikTok', icon: '🎵', color: '#000000' },
    { name: 'Discord', icon: '💬', color: '#5865F2' },
    { name: 'GitHub', icon: '🐙', color: '#333333' },
    { name: 'LinkedIn', icon: '💼', color: '#0A66C2' },
    { name: 'Twitch', icon: '📺', color: '#9146FF' },
    { name: 'Spotify', icon: '🎧', color: '#1DB954' },
    { name: 'Website', icon: '🌐', color: '#667eea' }
];

// Initialize data
let users = [];
let currentUser = null;
let pendingLoginUser = null;
let editingUserUsername = null;
let transferTargetUsername = null;
let tempPageConfig = { buttons: [], sounds: [], socialLinks: [], images: [], embeds: [], textSections: [], stats: [] };
let tempSecret = null;

// ==========================================
// CLOUD SYNC (SUPABASE) - OPTIONAL
// ==========================================

const CLOUD_STORAGE_KEY = 'cloudSyncConfig';
// Built-in Cloud Sync defaults (demo)
// NOTE: This will be visible to anyone who can view your deployed site source.
// For a real production app, do NOT ship service keys in client-side code.
let cloudConfig = {
    enabled: true,
    supabaseUrl: 'https://fqcirrbqbyglbnvappba.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxY2lycmJxYnlnbGJudmFwcGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MjM5MTQsImV4cCI6MjA4MzM5OTkxNH0.3etfbAJBOp4efvyME-Dom_nrcjrVa6_E2sPDhiX6suY'
};

function loadCloudConfig() {
    try {
        const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
        if (raw) {
            cloudConfig = { ...cloudConfig, ...JSON.parse(raw) };
        } else {
            // First-time visitors: persist built-in defaults so Cloud Sync is ready immediately
            saveCloudConfig();
        }
    } catch (e) {
        console.warn('Could not load cloud config:', e);
    }
}

function saveCloudConfig() {
    try {
        localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(cloudConfig));
    } catch (e) {
        console.warn('Could not save cloud config:', e);
    }
}

function isCloudEnabled() {
    return !!(cloudConfig.enabled && cloudConfig.supabaseUrl && cloudConfig.supabaseAnonKey);
}

function parseCloudConfigFromUrl() {
    // We support both hash and query param, but hash is easiest to share.
    // Format: #cloud=BASE64(JSON)
    try {
        const hash = location.hash || '';
        const m = hash.match(/cloud=([^&]+)/);
        const q = new URLSearchParams(location.search);
        const encoded = m?.[1] || q.get('cloud');
        if (!encoded) return;

        const json = atob(decodeURIComponent(encoded));
        const cfg = JSON.parse(json);
        if (cfg && typeof cfg === 'object') {
            cloudConfig.enabled = !!cfg.enabled;
            cloudConfig.supabaseUrl = cfg.supabaseUrl || '';
            cloudConfig.supabaseAnonKey = cfg.supabaseAnonKey || '';
            saveCloudConfig();

            // Clean the URL (optional) - keep it simple for GitHub Pages
            // location.hash = '';
        }
    } catch (e) {
        console.warn('Could not parse cloud config from URL:', e);
    }
}

function supabaseRestUrl(path) {
    return cloudConfig.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path.replace(/^\//, '');
}

async function supabaseFetch(path, opts = {}) {
    const headers = {
        apikey: cloudConfig.supabaseAnonKey,
        Authorization: `Bearer ${cloudConfig.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(opts.headers || {})
    };

    const res = await fetch(supabaseRestUrl(path), {
        ...opts,
        headers
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase REST error (${res.status}): ${txt}`);
    }

    // Some responses can be empty
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}

async function cloudLoadUsers() {
    // Table: users
    // Return all users
    const rows = await supabaseFetch('users?select=*');
    if (!Array.isArray(rows)) return [];
    
    // Map Supabase lowercase columns to our camelCase format
    return rows.map(row => ({
        name: row.name,
        username: row.username,
        password: row.password,
        role: row.role,
        twoFactorEnabled: !!row.twofactorenabled,
        twoFactorSecret: row.twofactorsecret,
        pageConfig: typeof row.pageconfig === 'string' ? JSON.parse(row.pageconfig) : (row.pageconfig || null)
    }));
}

async function cloudUpsertUser(user) {
    // First check if user exists
    const existing = await supabaseFetch(`users?username=eq.${encodeURIComponent(user.username)}&select=id`);
    
    const payload = {
        name: user.name,
        username: user.username,
        password: user.password,
        role: user.role,
        twofactorenabled: !!user.twoFactorEnabled,
        twofactorsecret: user.twoFactorSecret || null,
        pageconfig: user.pageConfig ? JSON.stringify(user.pageConfig) : null
    };

    if (existing && existing.length > 0) {
        // Update existing user
        const rows = await supabaseFetch(`users?username=eq.${encodeURIComponent(user.username)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        return rows?.[0] || null;
    } else {
        // Insert new user
        const rows = await supabaseFetch('users', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return rows?.[0] || null;
    }
}

async function cloudDeleteUserByUsername(username) {
    await supabaseFetch(`users?username=eq.${encodeURIComponent(username)}`, {
        method: 'DELETE'
    });
}

// Load users (Local or Cloud)
async function loadUsers() {
    // Always load local cache first for snappy UI
    try {
        const stored = localStorage.getItem('users');
        users = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(users)) users = [];
    } catch (e) {
        console.error('Error loading users:', e);
        users = [];
    }

    // If cloud is enabled, try to pull the shared user list
    if (isCloudEnabled()) {
        try {
            const cloudUsers = await cloudLoadUsers();
            users = Array.isArray(cloudUsers) ? cloudUsers : [];
        } catch (e) {
            console.warn('Cloud users fetch failed. Falling back to local users.', e);
        }
    }

    normalizeAndEnsureSystemUsers();

    // Save into local cache (works for both modes as a mirror)
    saveUsers();
}

function normalizeAndEnsureSystemUsers() {
    // SECURITY: Remove any fake owners (only 'gamerking' username can be owner)
    users.forEach((user, index) => {
        if (user.role === 'owner' && user.username !== 'gamerking') {
            console.warn('Security: Removed fake owner role from', user.username);
            users[index].role = 'user';
        }
    });

    // Ensure owner exists with correct role
    const ownerIndex = users.findIndex(u => u.username === 'gamerking');
    if (ownerIndex === -1) {
        users.push({
            name: 'GamerKing',
            username: 'gamerking',
            password: 'ripmadhav123',
            role: 'owner',
            twoFactorEnabled: false,
            twoFactorSecret: null,
            pageConfig: {
                title: "GamerKing's Page",
                bgColor: '#dc2626',
                bgColor2: '#991b1b',
                bio: "Welcome to the GamerKing's page! 👑",
                buttons: [],
                sounds: [],
                socialLinks: [],
                images: [],
                embeds: [],
                textSections: [],
                stats: []
            }
        });
    } else {
        users[ownerIndex].role = 'owner';
    }

    // Ensure admin exists
    const adminIndex = users.findIndex(u => u.username === 'admin');
    if (adminIndex === -1) {
        users.push({
            name: 'Admin',
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            twoFactorEnabled: false,
            twoFactorSecret: null,
            pageConfig: {
                title: "Admin's Page",
                bgColor: '#667eea',
                bgColor2: '#764ba2',
                bio: 'Welcome to my page!',
                buttons: [],
                sounds: [],
                socialLinks: [],
                images: [],
                embeds: [],
                textSections: [],
                stats: []
            }
        });
    }
}

// Save users to localStorage (always cache)
function saveUsers() {
    try {
        localStorage.setItem('users', JSON.stringify(users));
    } catch (e) {
        console.error('Error saving users:', e);
    }
}

async function saveUsersCloudMirror() {
    if (!isCloudEnabled()) return;
    // Upsert system users + any changed users
    for (const u of users) {
        try {
            await cloudUpsertUser(u);
        } catch (e) {
            console.warn('Cloud upsert failed for', u?.username, e);
        }
    }
}

// Load current user from localStorage
function loadCurrentUser() {
    try {
        const stored = localStorage.getItem('currentUser');
        currentUser = stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.error('Error loading current user:', e);
        currentUser = null;
    }
}

// Save current user to localStorage
function saveCurrentUser() {
    try {
        if (currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('currentUser');
        }
    } catch (e) {
        console.error('Error saving current user:', e);
    }
}

// Initialize on page load
async function initApp() {
    // Load cloud config and allow one-click setup via share link
    loadCloudConfig();
    parseCloudConfigFromUrl();

    await loadUsers();
    loadCurrentUser();

    // If cloud is enabled, ensure system users exist in cloud (best-effort)
    if (isCloudEnabled()) {
        // Mirror local normalized list to cloud
        saveUsersCloudMirror().catch(() => {});
    }

    if (currentUser) {
        const freshUser = users.find(u => u.username === currentUser.username);
        if (freshUser) {
            currentUser = freshUser;
            saveCurrentUser();
            showDashboard();
        } else {
            currentUser = null;
            saveCurrentUser();
            showLogin();
        }
    } else {
        showLogin();
    }
}

window.onload = () => { initApp(); };

// ==========================================
// NAVIGATION FUNCTIONS
// ==========================================

function showLogin() {
    hideAll();
    document.getElementById('loginForm').classList.remove('hidden');
    clearErrors();
}

function showRegister() {
    hideAll();
    document.getElementById('registerForm').classList.remove('hidden');
    clearErrors();
}

function showDashboard() {
    hideAll();
    document.getElementById('dashboard').classList.remove('hidden');
    updateDashboard();
}

async function showAdminPanel() {
    hideAll();
    document.getElementById('adminPanel').classList.remove('hidden');

    // Refresh users list from cloud if enabled
    await refreshUsersForPanel();
    renderUsersList();
    updateOwnerPanelBadges();
}

async function refreshUsersForPanel() {
    // Ensure latest list
    await loadUsers();
}

function updateOwnerPanelBadges() {
    const badge = document.getElementById('storageModeBadge');
    const notice = document.getElementById('storageNotice');

    if (badge) {
        badge.textContent = isCloudEnabled() ? 'Storage: Cloud' : 'Storage: Local';
        badge.className = isCloudEnabled()
            ? 'text-xs bg-emerald-500/20 px-2 py-1 rounded-full font-semibold'
            : 'text-xs bg-white/20 px-2 py-1 rounded-full font-semibold';
    }

    if (notice) {
        if (!isCloudEnabled()) {
            notice.innerHTML = `⚠️ <b>Local-only mode:</b> accounts are saved per-device in <span class="font-mono">localStorage</span>. Your friend’s account won’t appear here unless you enable <b>Cloud Sync</b> (Supabase).`;
            notice.classList.remove('hidden');
        } else {
            notice.classList.add('hidden');
        }
    }
}

function hideAll() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('twoFactorForm').classList.add('hidden');
}

function updateDashboard() {
    const user = users.find(u => u.username === currentUser.username) || currentUser;
    // If Owner Panel exists, keep its storage badge in sync
    updateOwnerPanelBadges();
    document.getElementById('userName').textContent = user.name;
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileUsername').textContent = user.username;
    document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
    document.getElementById('totalUsers').textContent = users.length;
    
    const roleText = user.role === 'owner' ? 'Owner' : (user.role === 'admin' ? 'Admin' : 'User');
    document.getElementById('userRole').textContent = roleText;
    document.getElementById('twoFAStatus').textContent = user.twoFactorEnabled ? 'Enabled' : 'Disabled';
    document.getElementById('twoFABtnText').textContent = user.twoFactorEnabled ? 'Manage 2FA' : 'Setup 2FA';
    document.getElementById('lastLogin').textContent = new Date().toLocaleTimeString();
    
    const roleBadge = document.getElementById('roleBadge');
    if (user.role === 'admin' || user.role === 'owner') {
        roleBadge.classList.remove('hidden');
        roleBadge.textContent = user.role === 'owner' ? 'OWNER' : 'ADMIN';
        roleBadge.className = user.role === 'owner' 
            ? 'owner-badge text-xs px-2 py-1 rounded-full font-bold text-white'
            : 'admin-badge text-xs px-2 py-1 rounded-full font-bold text-white';
        document.getElementById('adminPanelBtn').classList.remove('hidden');
    } else {
        roleBadge.classList.add('hidden');
        document.getElementById('adminPanelBtn').classList.add('hidden');
    }
}

function clearErrors() {
    document.querySelectorAll('[id$="Error"], [id$="Success"]').forEach(el => el.classList.add('hidden'));
}

// ==========================================
// AUTHENTICATION FUNCTIONS
// ==========================================

function login() {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    
    if (!username || !password) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const user = users.find(u => u.username.toLowerCase() === username && u.password === password);
    
    if (user) {
        if (user.twoFactorEnabled) {
            pendingLoginUser = user;
            hideAll();
            document.getElementById('twoFactorForm').classList.remove('hidden');
            document.getElementById('twoFactorCode').value = '';
            document.getElementById('twoFactorCode').focus();
        } else {
            currentUser = user;
            saveCurrentUser();
            showDashboard();
        }
    } else {
        errorDiv.textContent = 'Invalid username or password';
        errorDiv.classList.remove('hidden');
    }
}

function verify2FA() {
    const code = document.getElementById('twoFactorCode').value.trim();
    const errorDiv = document.getElementById('twoFactorError');
    
    if (!code || code.length !== 6) {
        errorDiv.textContent = 'Please enter a 6-digit code';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(pendingLoginUser.twoFactorSecret),
        digits: 6,
        period: 30
    });
    
    const isValid = totp.validate({ token: code, window: 1 }) !== null;
    
    if (isValid) {
        currentUser = pendingLoginUser;
        saveCurrentUser();
        pendingLoginUser = null;
        showDashboard();
    } else {
        errorDiv.textContent = 'Invalid code. Please try again.';
        errorDiv.classList.remove('hidden');
    }
}

function cancel2FA() {
    pendingLoginUser = null;
    showLogin();
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

function register() {
    const name = document.getElementById('registerName').value.trim();
    const username = document.getElementById('registerUsername').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');
    
    clearErrors();
    
    if (!name || !username || !password || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (!isValidUsername(username)) {
        errorDiv.textContent = 'Username must be 3-20 characters (letters, numbers, underscore only)';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        errorDiv.textContent = 'Username already taken';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const newUser = {
        name,
        username: username.toLowerCase(),
        password,
        role: 'user',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        pageConfig: {
            title: `${name}'s Page`,
            bgColor: '#667eea',
            bgColor2: '#764ba2',
            bio: 'Welcome to my page!',
            buttons: [],
            sounds: [],
            socialLinks: [],
            images: [],
            embeds: [],
            textSections: [],
            stats: []
        }
    };
    
    users.push(newUser);
    saveUsers();

    // Cloud mirror
    if (isCloudEnabled()) {
        cloudUpsertUser(newUser).catch(err => console.warn('Cloud register upsert failed:', err));
    }
    
    successDiv.textContent = 'Account created! Redirecting...';
    successDiv.classList.remove('hidden');
    
    setTimeout(() => {
        showLogin();
        document.getElementById('loginUsername').value = username;
    }, 1500);
}

function logout() {
    currentUser = null;
    saveCurrentUser();
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    showLogin();
}

// ==========================================
// 2FA SETUP FUNCTIONS
// ==========================================

function openTwoFactorSetup() {
    const user = users.find(u => u.username === currentUser.username);
    document.getElementById('twoFactorModal').classList.remove('hidden');
    
    if (user.twoFactorEnabled) {
        document.getElementById('twoFactorSetupContent').classList.add('hidden');
        document.getElementById('twoFactorDisableContent').classList.remove('hidden');
    } else {
        document.getElementById('twoFactorSetupContent').classList.remove('hidden');
        document.getElementById('twoFactorDisableContent').classList.add('hidden');
        generateQRCode();
    }
}

function generateQRCode() {
    const secret = new OTPAuth.Secret({ size: 20 });
    tempSecret = secret.base32;
    
    const totp = new OTPAuth.TOTP({
        issuer: 'LoginSystemPro',
        label: currentUser.username,
        secret: secret,
        digits: 6,
        period: 30
    });
    
    const uri = totp.toString();
    
    document.getElementById('secretKey').textContent = tempSecret;
    document.getElementById('qrCode').innerHTML = '';
    
    QRCode.toCanvas(document.createElement('canvas'), uri, { width: 200 }, function(error, canvas) {
        if (!error) {
            document.getElementById('qrCode').appendChild(canvas);
        }
    });
}

function enable2FA() {
    const code = document.getElementById('verify2FACode').value.trim();
    const errorDiv = document.getElementById('setup2FAError');
    
    if (!code || code.length !== 6) {
        errorDiv.textContent = 'Please enter a 6-digit code';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(tempSecret),
        digits: 6,
        period: 30
    });
    
    const isValid = totp.validate({ token: code, window: 1 }) !== null;
    
    if (isValid) {
        const userIndex = users.findIndex(u => u.username === currentUser.username);
        users[userIndex].twoFactorEnabled = true;
        users[userIndex].twoFactorSecret = tempSecret;
        saveUsers();
        if (isCloudEnabled()) cloudUpsertUser(users[userIndex]).catch(()=>{});
        
        currentUser = users[userIndex];
        saveCurrentUser();
        
        closeTwoFactorSetup();
        updateDashboard();
        alert('2FA enabled successfully!');
    } else {
        errorDiv.textContent = 'Invalid code. Please try again.';
        errorDiv.classList.remove('hidden');
    }
}

function disable2FA() {
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    users[userIndex].twoFactorEnabled = false;
    users[userIndex].twoFactorSecret = null;
    saveUsers();
    if (isCloudEnabled()) cloudUpsertUser(users[userIndex]).catch(()=>{});
    
    currentUser = users[userIndex];
    saveCurrentUser();
    
    closeTwoFactorSetup();
    updateDashboard();
}

function closeTwoFactorSetup() {
    document.getElementById('twoFactorModal').classList.add('hidden');
    document.getElementById('verify2FACode').value = '';
    tempSecret = null;
}

// ==========================================
// PROFILE EDIT FUNCTIONS
// ==========================================

function openEditProfile() {
    document.getElementById('editProfileModal').classList.remove('hidden');
    document.getElementById('editName').value = currentUser.name;
    document.getElementById('editUsername').value = currentUser.username;
    document.getElementById('editAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    clearEditFields();
}

function closeEditProfile() {
    document.getElementById('editProfileModal').classList.add('hidden');
}

function clearEditFields() {
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    clearErrors();
}

function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    const username = document.getElementById('editUsername').value.trim().toLowerCase();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const errorDiv = document.getElementById('editError');
    const successDiv = document.getElementById('editSuccess');
    
    clearErrors();
    
    if (!name || !username) {
        errorDiv.textContent = 'Name and username are required';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (!isValidUsername(username)) {
        errorDiv.textContent = 'Username must be 3-20 characters (letters, numbers, underscore only)';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase() && u.username !== currentUser.username)) {
        errorDiv.textContent = 'Username already taken';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (newPassword || confirmNewPassword || currentPassword) {
        if (!currentPassword || currentPassword !== currentUser.password) {
            errorDiv.textContent = 'Current password is incorrect';
            errorDiv.classList.remove('hidden');
            return;
        }
        if (newPassword.length < 6) {
            errorDiv.textContent = 'New password must be at least 6 characters';
            errorDiv.classList.remove('hidden');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            errorDiv.textContent = 'New passwords do not match';
            errorDiv.classList.remove('hidden');
            return;
        }
    }
    
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    users[userIndex].name = name;
    users[userIndex].username = username;
    if (newPassword) users[userIndex].password = newPassword;
    saveUsers();
    if (isCloudEnabled()) cloudUpsertUser(users[userIndex]).catch(()=>{});
    
    currentUser = users[userIndex];
    saveCurrentUser();
    
    updateDashboard();
    successDiv.textContent = 'Profile updated!';
    successDiv.classList.remove('hidden');
    
    setTimeout(closeEditProfile, 1500);
}

function confirmDeleteAccount() {
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}

function deleteAccount() {
    const deletedUsername = currentUser.username;
    users = users.filter(u => u.username !== deletedUsername);
    saveUsers();
    if (isCloudEnabled()) cloudDeleteUserByUsername(deletedUsername).catch(()=>{});
    currentUser = null;
    saveCurrentUser();
    closeDeleteModal();
    closeEditProfile();
    showLogin();
}

// ==========================================
// ADMIN PANEL FUNCTIONS
// ==========================================

function renderUsersList() {
    // NOTE: caller should await refreshUsersForPanel()/loadUsers() before rendering
    const container = document.getElementById('usersList');
    const isOwner = currentUser.role === 'owner';
    
    container.innerHTML = users.map(user => {
        const avatarGradient = user.role === 'owner' 
            ? 'from-red-500 to-rose-600' 
            : (user.role === 'admin' ? 'from-amber-500 to-orange-600' : 'from-indigo-500 to-purple-600');
        
        const roleBadge = user.role === 'owner' 
            ? '<span class="owner-badge text-xs px-2 py-1 rounded-full text-white font-bold">OWNER</span>'
            : (user.role === 'admin' ? '<span class="admin-badge text-xs px-2 py-1 rounded-full text-white font-bold">ADMIN</span>' : '');
        
        let roleButton = '';
        let transferButton = '';
        
        if (user.role === 'owner') {
            roleButton = '<span class="bg-gradient-to-r from-red-500 to-rose-600 text-white px-3 py-2 rounded-lg text-sm cursor-not-allowed shadow-lg font-bold animate-pulse">👑 UNTOUCHABLE</span>';
        } else if (isOwner) {
            roleButton = `<button onclick="toggleRole('${user.username}')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm transition font-medium">
                ${user.role === 'admin' ? '⬇ Demote to User' : '⬆ Make Admin'}
            </button>`;
            transferButton = `<button onclick="openTransferModal('${user.username}', '${user.name}')" class="bg-gradient-to-r from-red-500 to-rose-600 hover:opacity-90 text-white px-3 py-2 rounded-lg text-sm transition font-medium shadow-lg">
                👑 Transfer Ownership
            </button>`;
        } else if (currentUser.role === 'admin' && user.role !== 'admin' && user.role !== 'owner') {
            roleButton = `<button onclick="toggleRole('${user.username}')" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm transition font-medium">
                ⬆ Make Admin
            </button>`;
        } else if (currentUser.role === 'admin' && user.role === 'admin' && user.username !== currentUser.username) {
            roleButton = '<span class="bg-gray-300 text-gray-500 px-3 py-2 rounded-lg text-sm cursor-not-allowed">Equal Rank</span>';
        }
        
        return `
        <div class="flex items-center justify-between bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition flex-wrap gap-3">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-gradient-to-r ${avatarGradient} rounded-full flex items-center justify-center text-white font-bold text-xl">
                    ${user.pageConfig?.avatar || user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-semibold text-gray-800">${user.name}</p>
                    <p class="text-sm text-gray-500">@${user.username}</p>
                </div>
                ${roleBadge}
                ${user.twoFactorEnabled ? '<span class="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-bold">2FA</span>' : ''}
            </div>
            <div class="flex gap-2 flex-wrap">
                <button onclick="viewUserPage('${user.username}')" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    View
                </button>
                <button onclick="openPageEditor('${user.username}')" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    Edit Page
                </button>
                ${roleButton}
                ${transferButton}
            </div>
        </div>
    `}).join('');
}

// ==========================================
// OWNERSHIP TRANSFER FUNCTIONS
// ==========================================

function openTransferModal(username, name) {
    transferTargetUsername = username;
    document.getElementById('transferTargetName').textContent = name + ' (@' + username + ')';
    document.getElementById('transferConfirmInput').value = '';
    document.getElementById('transferOwnerModal').classList.remove('hidden');
}

function closeTransferModal() {
    document.getElementById('transferOwnerModal').classList.add('hidden');
    transferTargetUsername = null;
}

function confirmTransferOwnership() {
    const confirmText = document.getElementById('transferConfirmInput').value.trim();
    
    if (confirmText !== 'TRANSFER') {
        alert('Please type "TRANSFER" to confirm');
        return;
    }
    
    if (!transferTargetUsername) {
        alert('Error: No target user selected');
        return;
    }
    
    const currentOwnerIndex = users.findIndex(u => u.username === currentUser.username);
    const newOwnerIndex = users.findIndex(u => u.username === transferTargetUsername);
    
    if (currentOwnerIndex === -1 || newOwnerIndex === -1) {
        alert('Error: User not found');
        return;
    }
    
    users[currentOwnerIndex].role = 'admin';
    users[newOwnerIndex].role = 'owner';
    
    saveUsers();
    if (isCloudEnabled()) {
        cloudUpsertUser(users[currentOwnerIndex]).catch(()=>{});
        cloudUpsertUser(users[newOwnerIndex]).catch(()=>{});
    }
    
    currentUser = users[currentOwnerIndex];
    saveCurrentUser();
    
    closeTransferModal();
    alert(`👑 Ownership transferred successfully! You are now an Admin.`);
    
    renderUsersList();
    updateDashboard();
}

function toggleRole(username) {
    const userIndex = users.findIndex(u => u.username === username);
    const targetUser = users[userIndex];
    
    if (targetUser.role === 'owner') {
        alert('🚫 IMPOSSIBLE! The Owner cannot be demoted.');
        return;
    }
    
    if (targetUser.username === 'gamerking') {
        alert('🚫 This is the Owner account. It cannot be modified!');
        return;
    }
    
    if (targetUser.role === 'admin' && currentUser.role !== 'owner') {
        alert('Only the Owner can demote admins!');
        return;
    }
    
    let newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    
    if (newRole === 'owner' || (newRole !== 'user' && newRole !== 'admin')) {
        alert('🚫 ERROR: Invalid role assignment blocked!');
        return;
    }
    
    users[userIndex].role = newRole;
    saveUsers();
    if (isCloudEnabled()) cloudUpsertUser(users[userIndex]).catch(()=>{});
    
    if (username === currentUser.username) {
        currentUser.role = users[userIndex].role;
        saveCurrentUser();
    }
    
    renderUsersList();
}

// ==========================================
// PAGE EDITOR FUNCTIONS
// ==========================================

function openPageEditor(username) {
    const user = users.find(u => u.username === username);
    editingUserUsername = username;
    
    const defaultConfig = {
        title: '', bgColor: '#667eea', bgColor2: '#764ba2', textColor: '#ffffff', cardColor: '#ffffff',
        bio: '', avatar: '', bgPattern: 'none', glowEffect: false,
        buttons: [], sounds: [], socialLinks: [], images: [], embeds: [], textSections: [], stats: []
    };
    
    tempPageConfig = JSON.parse(JSON.stringify(user.pageConfig || defaultConfig));
    
    tempPageConfig.buttons = tempPageConfig.buttons || [];
    tempPageConfig.sounds = tempPageConfig.sounds || [];
    tempPageConfig.socialLinks = tempPageConfig.socialLinks || [];
    tempPageConfig.images = tempPageConfig.images || [];
    tempPageConfig.embeds = tempPageConfig.embeds || [];
    tempPageConfig.textSections = tempPageConfig.textSections || [];
    tempPageConfig.stats = tempPageConfig.stats || [];
    
    document.getElementById('editingUserName').textContent = user.name + ' (@' + user.username + ')';
    document.getElementById('pageTitle').value = tempPageConfig.title || '';
    document.getElementById('pageBgColor').value = tempPageConfig.bgColor || '#667eea';
    document.getElementById('pageBgColor2').value = tempPageConfig.bgColor2 || '#764ba2';
    document.getElementById('pageTextColor').value = tempPageConfig.textColor || '#ffffff';
    document.getElementById('pageCardColor').value = tempPageConfig.cardColor || '#ffffff';
    document.getElementById('pageBio').value = tempPageConfig.bio || '';
    document.getElementById('pageAvatar').value = tempPageConfig.avatar || '';
    document.getElementById('pageBgPattern').value = tempPageConfig.bgPattern || 'none';
    document.getElementById('pageGlowEffect').checked = tempPageConfig.glowEffect || false;
    
    document.getElementById('pageEditorModal').classList.remove('hidden');
    renderAllEditorSections();
    updatePreview();
}

function renderAllEditorSections() {
    renderButtons();
    renderSounds();
    renderSocialLinks();
    renderImages();
    renderEmbeds();
    renderTextSections();
    renderStats();
}

function closePageEditor() {
    document.getElementById('pageEditorModal').classList.add('hidden');
    editingUserUsername = null;
}

// Buttons
function addButton() {
    tempPageConfig.buttons.push({ id: Date.now(), label: 'New Button', color: '#6366f1', action: 'alert', message: 'Button clicked!', icon: '' });
    renderButtons();
    updatePreview();
}

function removeButton(id) {
    tempPageConfig.buttons = tempPageConfig.buttons.filter(b => b.id !== id);
    renderButtons();
    updatePreview();
}

function renderButtons() {
    const container = document.getElementById('buttonsList');
    if (tempPageConfig.buttons.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No buttons added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.buttons.map(btn => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg flex-wrap">
            <input type="text" value="${btn.icon || ''}" onchange="updateButton(${btn.id}, 'icon', this.value)" class="w-10 px-2 py-1 border rounded text-sm text-center" placeholder="🔥" maxlength="2">
            <input type="text" value="${btn.label}" onchange="updateButton(${btn.id}, 'label', this.value)" class="flex-1 min-w-20 px-2 py-1 border rounded text-sm" placeholder="Label">
            <input type="color" value="${btn.color}" onchange="updateButton(${btn.id}, 'color', this.value)" class="w-8 h-8 rounded cursor-pointer">
            <select onchange="updateButton(${btn.id}, 'action', this.value)" class="px-2 py-1 border rounded text-sm">
                <option value="alert" ${btn.action === 'alert' ? 'selected' : ''}>Alert</option>
                <option value="sound" ${btn.action === 'sound' ? 'selected' : ''}>Sound</option>
                <option value="link" ${btn.action === 'link' ? 'selected' : ''}>Link</option>
                <option value="confetti" ${btn.action === 'confetti' ? 'selected' : ''}>Confetti</option>
            </select>
            <input type="text" value="${btn.message || ''}" onchange="updateButton(${btn.id}, 'message', this.value)" class="w-20 px-2 py-1 border rounded text-sm" placeholder="Value">
            <button onclick="removeButton(${btn.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateButton(id, field, value) {
    const btn = tempPageConfig.buttons.find(b => b.id === id);
    if (btn) btn[field] = value;
    updatePreview();
}

// Sounds
function addSound() {
    tempPageConfig.sounds.push({ id: Date.now(), name: 'New Sound', url: soundPresets[0].url, icon: '🔊' });
    renderSounds();
    updatePreview();
}

function removeSound(id) {
    tempPageConfig.sounds = tempPageConfig.sounds.filter(s => s.id !== id);
    renderSounds();
    updatePreview();
}

function renderSounds() {
    const container = document.getElementById('soundsList');
    if (tempPageConfig.sounds.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No sounds added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.sounds.map(snd => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg">
            <input type="text" value="${snd.name}" onchange="updateSound(${snd.id}, 'name', this.value)" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="Name">
            <select onchange="updateSound(${snd.id}, 'url', this.value)" class="px-2 py-1 border rounded text-sm">
                ${soundPresets.map(p => `<option value="${p.url}" ${snd.url === p.url ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            <button onclick="playPreviewSound('${snd.url}')" class="bg-purple-500 text-white px-2 py-1 rounded text-sm">▶</button>
            <button onclick="removeSound(${snd.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateSound(id, field, value) {
    const snd = tempPageConfig.sounds.find(s => s.id === id);
    if (snd) snd[field] = value;
    updatePreview();
}

function playPreviewSound(url) {
    new Audio(url).play();
}

// Social Links
function addSocialLink() {
    tempPageConfig.socialLinks.push({ id: Date.now(), platform: 'Twitter/X', url: 'https://', icon: '𝕏' });
    renderSocialLinks();
    updatePreview();
}

function removeSocialLink(id) {
    tempPageConfig.socialLinks = tempPageConfig.socialLinks.filter(s => s.id !== id);
    renderSocialLinks();
    updatePreview();
}

function renderSocialLinks() {
    const container = document.getElementById('socialLinksList');
    if (tempPageConfig.socialLinks.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No social links added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.socialLinks.map(link => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg">
            <select onchange="updateSocialLink(${link.id}, 'platform', this.value)" class="px-2 py-1 border rounded text-sm">
                ${socialPlatforms.map(p => `<option value="${p.name}" ${link.platform === p.name ? 'selected' : ''}>${p.icon} ${p.name}</option>`).join('')}
            </select>
            <input type="url" value="${link.url}" onchange="updateSocialLink(${link.id}, 'url', this.value)" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="https://...">
            <button onclick="removeSocialLink(${link.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateSocialLink(id, field, value) {
    const link = tempPageConfig.socialLinks.find(s => s.id === id);
    if (link) {
        link[field] = value;
        if (field === 'platform') {
            const platform = socialPlatforms.find(p => p.name === value);
            if (platform) link.icon = platform.icon;
        }
    }
    updatePreview();
}

// Images
function addImage() {
    tempPageConfig.images.push({ id: Date.now(), url: 'https://picsum.photos/400/300', caption: '', rounded: true });
    renderImages();
    updatePreview();
}

function removeImage(id) {
    tempPageConfig.images = tempPageConfig.images.filter(i => i.id !== id);
    renderImages();
    updatePreview();
}

function renderImages() {
    const container = document.getElementById('imagesList');
    if (tempPageConfig.images.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No images added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.images.map(img => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg">
            <input type="url" value="${img.url}" onchange="updateImage(${img.id}, 'url', this.value)" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="Image URL">
            <input type="text" value="${img.caption || ''}" onchange="updateImage(${img.id}, 'caption', this.value)" class="w-24 px-2 py-1 border rounded text-sm" placeholder="Caption">
            <button onclick="removeImage(${img.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateImage(id, field, value) {
    const img = tempPageConfig.images.find(i => i.id === id);
    if (img) img[field] = value;
    updatePreview();
}

// Embeds
function addEmbed() {
    tempPageConfig.embeds.push({ id: Date.now(), type: 'youtube', url: '' });
    renderEmbeds();
    updatePreview();
}

function removeEmbed(id) {
    tempPageConfig.embeds = tempPageConfig.embeds.filter(e => e.id !== id);
    renderEmbeds();
    updatePreview();
}

function renderEmbeds() {
    const container = document.getElementById('embedsList');
    if (tempPageConfig.embeds.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No embeds added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.embeds.map(embed => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg">
            <select onchange="updateEmbed(${embed.id}, 'type', this.value)" class="px-2 py-1 border rounded text-sm">
                <option value="youtube" ${embed.type === 'youtube' ? 'selected' : ''}>▶️ YouTube</option>
                <option value="spotify" ${embed.type === 'spotify' ? 'selected' : ''}>🎧 Spotify</option>
            </select>
            <input type="url" value="${embed.url}" onchange="updateEmbed(${embed.id}, 'url', this.value)" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="Video/Track URL">
            <button onclick="removeEmbed(${embed.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateEmbed(id, field, value) {
    const embed = tempPageConfig.embeds.find(e => e.id === id);
    if (embed) embed[field] = value;
    updatePreview();
}

// Text Sections
function addTextSection() {
    tempPageConfig.textSections.push({ id: Date.now(), title: 'Section Title', content: 'Your content here...', style: 'normal' });
    renderTextSections();
    updatePreview();
}

function removeTextSection(id) {
    tempPageConfig.textSections = tempPageConfig.textSections.filter(t => t.id !== id);
    renderTextSections();
    updatePreview();
}

function renderTextSections() {
    const container = document.getElementById('textSectionsList');
    if (tempPageConfig.textSections.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No text sections added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.textSections.map(section => `
        <div class="bg-white p-2 rounded-lg space-y-2">
            <div class="flex items-center gap-2">
                <input type="text" value="${section.title}" onchange="updateTextSection(${section.id}, 'title', this.value)" class="flex-1 px-2 py-1 border rounded text-sm font-semibold" placeholder="Title">
                <select onchange="updateTextSection(${section.id}, 'style', this.value)" class="px-2 py-1 border rounded text-sm">
                    <option value="normal" ${section.style === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="quote" ${section.style === 'quote' ? 'selected' : ''}>Quote</option>
                    <option value="highlight" ${section.style === 'highlight' ? 'selected' : ''}>Highlight</option>
                </select>
                <button onclick="removeTextSection(${section.id})" class="text-red-500 hover:text-red-700">✕</button>
            </div>
            <textarea onchange="updateTextSection(${section.id}, 'content', this.value)" class="w-full px-2 py-1 border rounded text-sm" rows="2" placeholder="Content...">${section.content}</textarea>
        </div>
    `).join('');
}

function updateTextSection(id, field, value) {
    const section = tempPageConfig.textSections.find(t => t.id === id);
    if (section) section[field] = value;
    updatePreview();
}

// Stats
function addStat() {
    tempPageConfig.stats.push({ id: Date.now(), label: 'Followers', value: '1.2K', icon: '👥' });
    renderStats();
    updatePreview();
}

function removeStat(id) {
    tempPageConfig.stats = tempPageConfig.stats.filter(s => s.id !== id);
    renderStats();
    updatePreview();
}

function renderStats() {
    const container = document.getElementById('statsList');
    if (tempPageConfig.stats.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">No stats added yet</p>';
        return;
    }
    container.innerHTML = tempPageConfig.stats.map(stat => `
        <div class="flex items-center gap-2 bg-white p-2 rounded-lg">
            <input type="text" value="${stat.icon}" onchange="updateStat(${stat.id}, 'icon', this.value)" class="w-10 px-2 py-1 border rounded text-sm text-center" placeholder="📊" maxlength="2">
            <input type="text" value="${stat.label}" onchange="updateStat(${stat.id}, 'label', this.value)" class="flex-1 px-2 py-1 border rounded text-sm" placeholder="Label">
            <input type="text" value="${stat.value}" onchange="updateStat(${stat.id}, 'value', this.value)" class="w-20 px-2 py-1 border rounded text-sm" placeholder="Value">
            <button onclick="removeStat(${stat.id})" class="text-red-500 hover:text-red-700">✕</button>
        </div>
    `).join('');
}

function updateStat(id, field, value) {
    const stat = tempPageConfig.stats.find(s => s.id === id);
    if (stat) stat[field] = value;
    updatePreview();
}

// Get pattern CSS
function getPatternCSS(pattern, opacity = 0.1) {
    switch(pattern) {
        case 'dots':
            return `background-image: radial-gradient(circle, rgba(255,255,255,${opacity}) 1px, transparent 1px); background-size: 20px 20px;`;
        case 'grid':
            return `background-image: linear-gradient(rgba(255,255,255,${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${opacity}) 1px, transparent 1px); background-size: 30px 30px;`;
        case 'waves':
            return `background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='rgba(255,255,255,0.1)' d='M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,112C672,96,768,96,864,112C960,128,1056,160,1152,160C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z'%3E%3C/path%3E%3C/svg%3E"); background-repeat: repeat-y; background-size: 100% 200px;`;
        case 'stars':
            return `background-image: radial-gradient(2px 2px at 20px 30px, white, transparent), radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 90px 40px, white, transparent), radial-gradient(2px 2px at 130px 80px, rgba(255,255,255,0.6), transparent); background-size: 150px 100px;`;
        default:
            return '';
    }
}

function updatePreview() {
    const title = document.getElementById('pageTitle').value;
    const bgColor = document.getElementById('pageBgColor').value;
    const bgColor2 = document.getElementById('pageBgColor2').value;
    const textColor = document.getElementById('pageTextColor').value;
    const cardColor = document.getElementById('pageCardColor').value;
    const bio = document.getElementById('pageBio').value;
    const avatar = document.getElementById('pageAvatar').value;
    const bgPattern = document.getElementById('pageBgPattern').value;
    const glowEffect = document.getElementById('pageGlowEffect').checked;
    const user = users.find(u => u.username === editingUserUsername);
    
    const patternCSS = getPatternCSS(bgPattern);
    const glowCSS = glowEffect ? 'box-shadow: 0 0 30px rgba(255,255,255,0.3);' : '';
    
    document.getElementById('pagePreview').innerHTML = `
        <div class="min-h-[500px] p-6 text-center" style="background: linear-gradient(135deg, ${bgColor} 0%, ${bgColor2} 100%); ${patternCSS}">
            <div class="w-24 h-24 bg-white/20 rounded-full mx-auto flex items-center justify-center text-4xl font-bold mb-4 backdrop-blur-sm" style="color: ${textColor}; ${glowCSS}">
                ${avatar || user.name.charAt(0).toUpperCase()}
            </div>
            <h2 class="text-2xl font-bold mb-1" style="color: ${textColor}">${title || user.name + "'s Page"}</h2>
            <p class="text-sm opacity-70 mb-2" style="color: ${textColor}">@${user.username}</p>
            <p class="mb-4 opacity-80" style="color: ${textColor}">${bio || 'Welcome!'}</p>
            
            ${tempPageConfig.stats.length > 0 ? `
                <div class="flex justify-center gap-4 mb-6 flex-wrap">
                    ${tempPageConfig.stats.map(stat => `
                        <div class="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                            <div class="text-xl">${stat.icon}</div>
                            <div class="font-bold" style="color: ${textColor}">${stat.value}</div>
                            <div class="text-xs opacity-70" style="color: ${textColor}">${stat.label}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            ${tempPageConfig.socialLinks.length > 0 ? `
                <div class="flex justify-center gap-3 mb-6 flex-wrap">
                    ${tempPageConfig.socialLinks.map(link => {
                        const platform = socialPlatforms.find(p => p.name === link.platform);
                        return `<a href="#" class="w-10 h-10 rounded-full flex items-center justify-center text-lg transition hover:scale-110" style="background-color: ${platform?.color || '#667eea'}; color: white;" title="${link.platform}">${platform?.icon || '🔗'}</a>`;
                    }).join('')}
                </div>
            ` : ''}
            
            <div class="space-y-3 mb-6">
                ${tempPageConfig.buttons.map(btn => `
                    <button class="w-full max-w-xs mx-auto block py-3 px-6 rounded-lg font-semibold text-white transition hover:opacity-90 hover:scale-105" style="background-color: ${btn.color}; ${glowEffect ? 'box-shadow: 0 4px 15px ' + btn.color + '80;' : ''}">
                        ${btn.icon ? btn.icon + ' ' : ''}${btn.label}
                    </button>
                `).join('')}
            </div>
            
            ${tempPageConfig.sounds.length > 0 ? `
                <div class="flex justify-center gap-3 mb-6 flex-wrap">
                    ${tempPageConfig.sounds.map(snd => `
                        <button class="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full transition backdrop-blur-sm" style="color: ${textColor}">
                            🔊 ${snd.name}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            
            ${tempPageConfig.textSections.map(section => `
                <div class="max-w-md mx-auto mb-4 p-4 rounded-lg text-left ${section.style === 'quote' ? 'border-l-4 border-white/50 italic' : ''}" style="background-color: ${section.style === 'highlight' ? cardColor + '20' : 'transparent'}">
                    <h3 class="font-bold mb-1" style="color: ${textColor}">${section.title}</h3>
                    <p class="text-sm opacity-80" style="color: ${textColor}">${section.content}</p>
                </div>
            `).join('')}
            
            ${tempPageConfig.images.length > 0 ? `
                <div class="grid grid-cols-2 gap-3 max-w-md mx-auto mb-6">
                    ${tempPageConfig.images.map(img => `
                        <div class="relative">
                            <img src="${img.url}" alt="${img.caption}" class="w-full h-32 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/400x300?text=Image'">
                            ${img.caption ? `<p class="text-xs mt-1 opacity-70" style="color: ${textColor}">${img.caption}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            ${tempPageConfig.embeds.map(embed => `
                <div class="max-w-md mx-auto mb-4 rounded-lg overflow-hidden bg-black/20 p-2">
                    <p class="text-sm opacity-70 mb-2" style="color: ${textColor}">${embed.type === 'youtube' ? '▶️ YouTube Video' : '🎧 Spotify Track'}</p>
                    <div class="bg-black/30 h-20 rounded flex items-center justify-center">
                        <span class="text-2xl">${embed.type === 'youtube' ? '▶️' : '🎧'}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function savePageConfig() {
    const userIndex = users.findIndex(u => u.username === editingUserUsername);
    users[userIndex].pageConfig = {
        title: document.getElementById('pageTitle').value,
        bgColor: document.getElementById('pageBgColor').value,
        bgColor2: document.getElementById('pageBgColor2').value,
        textColor: document.getElementById('pageTextColor').value,
        cardColor: document.getElementById('pageCardColor').value,
        bio: document.getElementById('pageBio').value,
        avatar: document.getElementById('pageAvatar').value,
        bgPattern: document.getElementById('pageBgPattern').value,
        glowEffect: document.getElementById('pageGlowEffect').checked,
        buttons: tempPageConfig.buttons,
        sounds: tempPageConfig.sounds,
        socialLinks: tempPageConfig.socialLinks,
        images: tempPageConfig.images,
        embeds: tempPageConfig.embeds,
        textSections: tempPageConfig.textSections,
        stats: tempPageConfig.stats
    };
    saveUsers();
    if (isCloudEnabled()) cloudUpsertUser(users[userIndex]).catch(()=>{});
    
    if (editingUserUsername === currentUser.username) {
        currentUser.pageConfig = users[userIndex].pageConfig;
        saveCurrentUser();
    }
    
    alert('Page configuration saved!');
    closePageEditor();
}

// ==========================================
// USER PAGE VIEW FUNCTIONS
// ==========================================

function viewUserPage(username) {
    const user = users.find(u => u.username === username);
    const config = user.pageConfig || {};
    
    const bgColor = config.bgColor || '#667eea';
    const bgColor2 = config.bgColor2 || '#764ba2';
    const textColor = config.textColor || '#ffffff';
    const patternCSS = getPatternCSS(config.bgPattern || 'none');
    const glowEffect = config.glowEffect || false;
    const glowCSS = glowEffect ? 'box-shadow: 0 0 40px rgba(255,255,255,0.3);' : '';
    
    document.getElementById('userPageContent').innerHTML = `
        <div class="min-h-screen flex items-center justify-center py-12" style="background: linear-gradient(135deg, ${bgColor} 0%, ${bgColor2} 100%); ${patternCSS}">
            <div class="text-center max-w-lg mx-auto px-4">
                <div class="w-28 h-28 bg-white/20 rounded-full mx-auto flex items-center justify-center text-5xl font-bold mb-6 backdrop-blur-sm" style="color: ${textColor}; ${glowCSS}">
                    ${config.avatar || user.name.charAt(0).toUpperCase()}
                </div>
                <h1 class="text-4xl font-bold mb-2" style="color: ${textColor}">${config.title || user.name + "'s Page"}</h1>
                <p class="text-lg opacity-70 mb-3" style="color: ${textColor}">@${user.username}</p>
                <p class="mb-6 text-lg opacity-80" style="color: ${textColor}">${config.bio || 'Welcome to my page!'}</p>
                
                ${(config.stats || []).length > 0 ? `
                    <div class="flex justify-center gap-6 mb-8 flex-wrap">
                        ${(config.stats || []).map(stat => `
                            <div class="bg-white/10 backdrop-blur-sm px-6 py-3 rounded-xl">
                                <div class="text-2xl">${stat.icon}</div>
                                <div class="text-xl font-bold" style="color: ${textColor}">${stat.value}</div>
                                <div class="text-sm opacity-70" style="color: ${textColor}">${stat.label}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${(config.socialLinks || []).length > 0 ? `
                    <div class="flex justify-center gap-4 mb-8 flex-wrap">
                        ${(config.socialLinks || []).map(link => {
                            const platform = socialPlatforms.find(p => p.name === link.platform);
                            return `<a href="${link.url}" target="_blank" class="w-12 h-12 rounded-full flex items-center justify-center text-xl transition hover:scale-125 shadow-lg" style="background-color: ${platform?.color || '#667eea'}; color: white;" title="${link.platform}">${platform?.icon || '🔗'}</a>`;
                        }).join('')}
                    </div>
                ` : ''}
                
                <div class="space-y-4 mb-8">
                    ${(config.buttons || []).map(btn => `
                        <button onclick="executeButtonAction('${btn.action}', '${(btn.message || '').replace(/'/g, "\\'")}')" class="w-full py-4 px-8 rounded-xl font-semibold text-white transition hover:opacity-90 hover:scale-105 transform text-lg" style="background-color: ${btn.color}; ${glowEffect ? 'box-shadow: 0 4px 20px ' + btn.color + '80;' : ''}">
                            ${btn.icon ? btn.icon + ' ' : ''}${btn.label}
                        </button>
                    `).join('')}
                </div>
                
                ${(config.sounds || []).length > 0 ? `
                    <div class="flex justify-center gap-4 mb-8 flex-wrap">
                        ${(config.sounds || []).map(snd => `
                            <button onclick="playPreviewSound('${snd.url}')" class="bg-white/20 hover:bg-white/30 px-5 py-3 rounded-full transition backdrop-blur-sm hover:scale-110" style="color: ${textColor}">
                                🔊 ${snd.name}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${(config.textSections || []).map(section => `
                    <div class="max-w-md mx-auto mb-6 p-5 rounded-xl text-left ${section.style === 'quote' ? 'border-l-4 border-white/50 italic' : ''}" style="background-color: ${section.style === 'highlight' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}; backdrop-filter: blur(10px);">
                        <h3 class="font-bold text-lg mb-2" style="color: ${textColor}">${section.title}</h3>
                        <p class="opacity-80" style="color: ${textColor}">${section.content}</p>
                    </div>
                `).join('')}
                
                ${(config.images || []).length > 0 ? `
                    <div class="grid ${(config.images || []).length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4 max-w-md mx-auto mb-8">
                        ${(config.images || []).map(img => `
                            <div class="relative group">
                                <img src="${img.url}" alt="${img.caption || ''}" class="w-full h-48 object-cover rounded-xl shadow-lg transition group-hover:scale-105" onerror="this.src='https://via.placeholder.com/400x300?text=Image'">
                                ${img.caption ? `<p class="text-sm mt-2 opacity-70" style="color: ${textColor}">${img.caption}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
                ${(config.embeds || []).map(embed => {
                    let embedHtml = '';
                    if (embed.type === 'youtube' && embed.url) {
                        const videoId = extractYouTubeId(embed.url);
                        if (videoId) {
                            embedHtml = `<iframe width="100%" height="250" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="rounded-xl"></iframe>`;
                        }
                    } else if (embed.type === 'spotify' && embed.url) {
                        const spotifyId = extractSpotifyId(embed.url);
                        if (spotifyId) {
                            embedHtml = `<iframe src="https://open.spotify.com/embed/track/${spotifyId}" width="100%" height="152" frameborder="0" allow="encrypted-media" class="rounded-xl"></iframe>`;
                        }
                    }
                    return embedHtml ? `<div class="max-w-md mx-auto mb-6">${embedHtml}</div>` : '';
                }).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('userPageView').classList.remove('hidden');
}

function extractYouTubeId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function extractSpotifyId(url) {
    const regex = /spotify\.com\/track\/([a-zA-Z0-9]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function viewMyPage() {
    viewUserPage(currentUser.username);
}

function closeUserPage() {
    document.getElementById('userPageView').classList.add('hidden');
}

function executeButtonAction(action, value) {
    switch(action) {
        case 'alert':
            alert(value);
            break;
        case 'sound':
            playPreviewSound(value || soundPresets[0].url);
            break;
        case 'link':
            if (value) window.open(value, '_blank');
            break;
        case 'confetti':
            launchConfetti();
            break;
    }
}

function launchConfetti() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff'];
    const confettiCount = 150;
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            width: ${Math.random() * 10 + 5}px;
            height: ${Math.random() * 10 + 5}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            left: ${Math.random() * 100}vw;
            top: -20px;
            border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
            pointer-events: none;
            z-index: 9999;
            animation: confettiFall ${Math.random() * 3 + 2}s linear forwards;
        `;
        document.body.appendChild(confetti);
        
        setTimeout(() => confetti.remove(), 5000);
    }
    
    if (!document.getElementById('confettiStyle')) {
        const style = document.createElement('style');
        style.id = 'confettiStyle';
        style.textContent = `
            @keyframes confettiFall {
                to {
                    transform: translateY(100vh) rotate(${Math.random() * 720}deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        if (!document.getElementById('loginForm').classList.contains('hidden')) login();
        else if (!document.getElementById('registerForm').classList.contains('hidden')) register();
        else if (!document.getElementById('twoFactorForm').classList.contains('hidden')) verify2FA();
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeEditProfile();
        closeDeleteModal();
        closeTwoFactorSetup();
        closePageEditor();
        closeUserPage();
        closeTransferModal();
        closeSiteEditor();
        closeAIAssistant();
        closePublishModal();
        closeCloudSync();
        closeChat();
    }
});

document.addEventListener('DOMContentLoaded', function() {
    ['editProfileModal', 'deleteModal', 'twoFactorModal', 'pageEditorModal', 'transferOwnerModal', 'siteEditorModal', 'aiAssistantModal', 'publishModal', 'cloudSyncModal', 'chatModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', function(e) {
                if (e.target === this) this.classList.add('hidden');
            });
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    const previewInputs = ['pageTitle', 'pageBgColor', 'pageBgColor2', 'pageTextColor', 'pageCardColor', 'pageBio', 'pageAvatar', 'pageBgPattern', 'pageGlowEffect'];
    previewInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updatePreview);
            el.addEventListener('change', updatePreview);
        }
    });
    
    // Site editor live preview listeners
    const siteInputs = ['siteName', 'siteLogo', 'siteWelcome', 'siteBg1', 'siteBg2', 'sitePrimary', 'siteSecondary', 'siteFont', 'siteBgPattern', 'siteParticles', 'siteGlow', 'siteFloating', 'siteCardStyle', 'siteBorderRadius', 'siteCustomCSS'];
    siteInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateSitePreview);
            el.addEventListener('change', updateSitePreview);
        }
    });
    
    // Load and apply site settings on page load
    loadAndApplySiteSettings();
});

// ==========================================
// SITE EDITOR FUNCTIONS (OWNER ONLY)
// ==========================================

let siteSettings = {
    siteName: 'Login System Pro',
    siteLogo: '🚀',
    siteWelcome: 'Welcome Back',
    siteBg1: '#667eea',
    siteBg2: '#764ba2',
    sitePrimary: '#6366f1',
    siteSecondary: '#8b5cf6',
    siteFont: 'Inter, system-ui, sans-serif',
    siteBgPattern: 'none',
    siteParticles: false,
    siteGlow: false,
    siteFloating: false,
    siteCardStyle: 'solid',
    siteBorderRadius: 16,
    siteCustomCSS: ''
};

function loadSiteSettings() {
    try {
        const stored = localStorage.getItem('siteSettings');
        if (stored) {
            siteSettings = { ...siteSettings, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error('Error loading site settings:', e);
    }
}

function saveSiteSettingsToStorage() {
    try {
        localStorage.setItem('siteSettings', JSON.stringify(siteSettings));
    } catch (e) {
        console.error('Error saving site settings:', e);
    }
}

function loadAndApplySiteSettings() {
    loadSiteSettings();
    applySiteSettings();
}

function applySiteSettings() {
    const root = document.documentElement;
    
    // Apply CSS variables
    root.style.setProperty('--site-bg1', siteSettings.siteBg1);
    root.style.setProperty('--site-bg2', siteSettings.siteBg2);
    root.style.setProperty('--primary-color', siteSettings.sitePrimary);
    root.style.setProperty('--secondary-color', siteSettings.siteSecondary);
    root.style.setProperty('--site-font', siteSettings.siteFont);
    root.style.setProperty('--border-radius', siteSettings.siteBorderRadius + 'px');
    
    // Apply font
    document.body.style.fontFamily = siteSettings.siteFont;
    
    // Apply background
    document.body.style.background = `linear-gradient(135deg, ${siteSettings.siteBg1} 0%, ${siteSettings.siteBg2} 100%)`;
    document.body.style.backgroundAttachment = 'fixed';
    
    // Apply pattern
    applyBackgroundPattern(siteSettings.siteBgPattern);
    
    // Apply particles
    const particlesContainer = document.getElementById('particlesContainer');
    if (siteSettings.siteParticles) {
        particlesContainer.classList.remove('hidden');
        createParticles();
    } else {
        particlesContainer.classList.add('hidden');
        particlesContainer.innerHTML = '';
    }
    
    // Apply card styles
    applyCardStyles();
    
    // Apply custom CSS
    applyCustomCSS();
    
    // Update title
    document.title = siteSettings.siteName;
    
    // Update welcome message if on login page
    const welcomeEl = document.querySelector('#loginForm h1');
    if (welcomeEl && siteSettings.siteWelcome) {
        welcomeEl.textContent = siteSettings.siteWelcome;
    }
}

function applyBackgroundPattern(pattern) {
    const body = document.body;
    body.classList.remove('pattern-dots', 'pattern-grid', 'pattern-waves', 'pattern-stars');
    
    let patternCSS = '';
    switch(pattern) {
        case 'dots':
            patternCSS = 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)';
            body.style.backgroundSize = '20px 20px, 100% 100%';
            break;
        case 'grid':
            patternCSS = 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)';
            body.style.backgroundSize = '30px 30px, 30px 30px, 100% 100%';
            break;
        case 'stars':
            patternCSS = 'radial-gradient(2px 2px at 20px 30px, white, transparent), radial-gradient(2px 2px at 40px 70px, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 90px 40px, white, transparent)';
            body.style.backgroundSize = '150px 100px, 150px 100px, 150px 100px, 100% 100%';
            break;
        default:
            body.style.backgroundImage = `linear-gradient(135deg, ${siteSettings.siteBg1} 0%, ${siteSettings.siteBg2} 100%)`;
            body.style.backgroundSize = '100% 100%';
            return;
    }
    
    body.style.backgroundImage = `${patternCSS}, linear-gradient(135deg, ${siteSettings.siteBg1} 0%, ${siteSettings.siteBg2} 100%)`;
}

function createParticles() {
    const container = document.getElementById('particlesContainer');
    container.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        particle.style.width = (Math.random() * 8 + 4) + 'px';
        particle.style.height = particle.style.width;
        particle.style.opacity = Math.random() * 0.5 + 0.2;
        container.appendChild(particle);
    }
}

function applyCardStyles() {
    const cards = document.querySelectorAll('.card-shadow');
    const radius = siteSettings.siteBorderRadius + 'px';
    
    cards.forEach(card => {
        card.style.borderRadius = radius;
        
        // Remove previous styles
        card.classList.remove('glass', 'neon-glow', 'floating');
        card.style.background = '';
        card.style.color = '';
        
        switch(siteSettings.siteCardStyle) {
            case 'glass':
                card.classList.add('glass');
                card.style.background = 'rgba(255, 255, 255, 0.15)';
                card.style.backdropFilter = 'blur(10px)';
                break;
            case 'dark':
                card.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
                card.style.color = 'white';
                break;
            case 'gradient':
                card.style.background = `linear-gradient(135deg, ${siteSettings.sitePrimary}20 0%, ${siteSettings.siteSecondary}20 100%)`;
                break;
            default:
                card.style.background = 'white';
        }
        
        if (siteSettings.siteGlow) {
            card.classList.add('neon-glow');
        }
        
        if (siteSettings.siteFloating) {
            card.classList.add('floating');
        }
    });
}

function applyCustomCSS() {
    let styleEl = document.getElementById('customSiteCSS');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'customSiteCSS';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = siteSettings.siteCustomCSS;
}

function openSiteEditor() {
    if (currentUser.role !== 'owner') {
        alert('Only the Owner can edit the site!');
        return;
    }
    
    loadSiteSettings();
    
    // Populate form fields
    document.getElementById('siteName').value = siteSettings.siteName;
    document.getElementById('siteLogo').value = siteSettings.siteLogo;
    document.getElementById('siteWelcome').value = siteSettings.siteWelcome;
    document.getElementById('siteBg1').value = siteSettings.siteBg1;
    document.getElementById('siteBg2').value = siteSettings.siteBg2;
    document.getElementById('sitePrimary').value = siteSettings.sitePrimary;
    document.getElementById('siteSecondary').value = siteSettings.siteSecondary;
    document.getElementById('siteFont').value = siteSettings.siteFont;
    document.getElementById('siteBgPattern').value = siteSettings.siteBgPattern;
    document.getElementById('siteParticles').checked = siteSettings.siteParticles;
    document.getElementById('siteGlow').checked = siteSettings.siteGlow;
    document.getElementById('siteFloating').checked = siteSettings.siteFloating;
    document.getElementById('siteCardStyle').value = siteSettings.siteCardStyle;
    document.getElementById('siteBorderRadius').value = siteSettings.siteBorderRadius;
    document.getElementById('siteCustomCSS').value = siteSettings.siteCustomCSS;
    
    document.getElementById('siteEditorModal').classList.remove('hidden');
    updateSitePreview();
}

function closeSiteEditor() {
    document.getElementById('siteEditorModal').classList.add('hidden');
}

function updateSitePreview() {
    const preview = document.getElementById('sitePreview');
    
    const bg1 = document.getElementById('siteBg1').value;
    const bg2 = document.getElementById('siteBg2').value;
    const primary = document.getElementById('sitePrimary').value;
    const font = document.getElementById('siteFont').value;
    const cardStyle = document.getElementById('siteCardStyle').value;
    const borderRadius = document.getElementById('siteBorderRadius').value;
    const glow = document.getElementById('siteGlow').checked;
    const floating = document.getElementById('siteFloating').checked;
    const siteName = document.getElementById('siteName').value || 'Login System Pro';
    const siteLogo = document.getElementById('siteLogo').value || '🚀';
    const siteWelcome = document.getElementById('siteWelcome').value || 'Welcome Back';
    
    let cardBg = 'background: white;';
    let cardText = 'color: #1f2937;';
    
    switch(cardStyle) {
        case 'glass':
            cardBg = 'background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);';
            cardText = 'color: white;';
            break;
        case 'dark':
            cardBg = 'background: linear-gradient(135deg, #1a1a2e, #16213e);';
            cardText = 'color: white;';
            break;
        case 'gradient':
            cardBg = `background: linear-gradient(135deg, ${primary}30, ${bg2}30);`;
            break;
    }
    
    const glowStyle = glow ? `box-shadow: 0 0 30px ${primary}80;` : '';
    const floatAnim = floating ? 'animation: float 3s ease-in-out infinite;' : '';
    
    preview.innerHTML = `
        <div class="min-h-[500px] p-6 flex items-center justify-center" style="background: linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%); font-family: ${font};">
            <div class="w-full max-w-sm p-6 text-center" style="${cardBg} ${cardText} border-radius: ${borderRadius}px; ${glowStyle} ${floatAnim}">
                <div class="text-5xl mb-4">${siteLogo}</div>
                <h2 class="text-2xl font-bold mb-2">${siteName}</h2>
                <p class="opacity-70 mb-6">${siteWelcome}</p>
                <div class="space-y-3">
                    <input type="text" placeholder="Username" class="w-full px-4 py-2 rounded-lg border" style="border-radius: ${borderRadius/2}px;">
                    <input type="password" placeholder="Password" class="w-full px-4 py-2 rounded-lg border" style="border-radius: ${borderRadius/2}px;">
                    <button class="w-full py-2 text-white font-semibold rounded-lg" style="background: linear-gradient(135deg, ${primary}, ${bg2}); border-radius: ${borderRadius/2}px;">
                        Sign In
                    </button>
                </div>
            </div>
        </div>
    `;
}

function saveSiteSettings() {
    siteSettings = {
        siteName: document.getElementById('siteName').value || 'Login System Pro',
        siteLogo: document.getElementById('siteLogo').value || '🚀',
        siteWelcome: document.getElementById('siteWelcome').value || 'Welcome Back',
        siteBg1: document.getElementById('siteBg1').value,
        siteBg2: document.getElementById('siteBg2').value,
        sitePrimary: document.getElementById('sitePrimary').value,
        siteSecondary: document.getElementById('siteSecondary').value,
        siteFont: document.getElementById('siteFont').value,
        siteBgPattern: document.getElementById('siteBgPattern').value,
        siteParticles: document.getElementById('siteParticles').checked,
        siteGlow: document.getElementById('siteGlow').checked,
        siteFloating: document.getElementById('siteFloating').checked,
        siteCardStyle: document.getElementById('siteCardStyle').value,
        siteBorderRadius: parseInt(document.getElementById('siteBorderRadius').value),
        siteCustomCSS: document.getElementById('siteCustomCSS').value
    };
    
    saveSiteSettingsToStorage();
    applySiteSettings();
    
    alert('🎨 Site settings saved successfully!');
    closeSiteEditor();
}

function resetSiteSettings() {
    if (!confirm('Are you sure you want to reset all site settings to default?')) return;
    
    siteSettings = {
        siteName: 'Login System Pro',
        siteLogo: '🚀',
        siteWelcome: 'Welcome Back',
        siteBg1: '#667eea',
        siteBg2: '#764ba2',
        sitePrimary: '#6366f1',
        siteSecondary: '#8b5cf6',
        siteFont: 'Inter, system-ui, sans-serif',
        siteBgPattern: 'none',
        siteParticles: false,
        siteGlow: false,
        siteFloating: false,
        siteCardStyle: 'solid',
        siteBorderRadius: 16,
        siteCustomCSS: ''
    };
    
    saveSiteSettingsToStorage();
    applySiteSettings();
    
    // Update form fields
    openSiteEditor();
    
    alert('🔄 Site settings reset to default!');
}

// ==========================================
// CLOUD SYNC UI (SUPABASE)
// ==========================================

function getCloudSQL() {
    return [
        '-- DEMO ONLY SQL (Supabase) — run in SQL editor',
        '-- Creates shared tables for: users + chat messages.',
        '-- This is intentionally permissive for a demo. DO NOT use as-is in production.',
        '',
        '-- (Optional) start fresh:',
        '-- drop table if exists public.messages;',
        '-- drop table if exists public.users;',
        '',
        'create table if not exists public.users (',
        '  id bigint generated by default as identity primary key,',
        '  name text,',
        '  username text unique not null,',
        '  password text,',
        '  role text default \'user\',',
        '  twofactorenabled boolean default false,',
        '  twofactorsecret text,',
        '  pageconfig text,',
        '  created_at timestamp with time zone default now()',
        ');',
        '',
        'create table if not exists public.messages (',
        '  id bigint generated by default as identity primary key,',
        '  username text not null,',
        '  message text not null,',
        '  created_at timestamp with time zone default now()',
        ');',
        '',
        '-- DEMO: Disable RLS so anon key can read/write without policies',
        'alter table public.users disable row level security;',
        'alter table public.messages disable row level security;',
        '',
        '-- Grants',
        'grant all on public.users to anon;',
        'grant all on public.messages to anon;',
        'grant usage on schema public to anon;',
        ''
    ].join('\n');
}

function setCloudSyncMsg(text, kind = 'info') {
    const el = document.getElementById('cloudSyncMsg');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.className = kind === 'error'
        ? 'bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm'
        : (kind === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm'
            : 'bg-indigo-50 border border-indigo-200 text-indigo-800 px-4 py-3 rounded-lg text-sm');
}

function updateCloudModalUI() {
    const enabledEl = document.getElementById('cloudEnabled');
    const urlEl = document.getElementById('cloudSupabaseUrl');
    const keyEl = document.getElementById('cloudSupabaseAnonKey');
    const statusEl = document.getElementById('cloudStatus');
    const shareEl = document.getElementById('cloudShareLink');
    const sqlEl = document.getElementById('cloudSql');

    if (sqlEl) sqlEl.value = getCloudSQL();

    if (enabledEl) enabledEl.checked = !!cloudConfig.enabled;
    if (urlEl) urlEl.value = cloudConfig.supabaseUrl || '';
    if (keyEl) keyEl.value = cloudConfig.supabaseAnonKey || '';

    if (statusEl) {
        statusEl.textContent = isCloudEnabled() ? 'Configured' : 'Not configured';
        statusEl.className = isCloudEnabled()
            ? 'text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full'
            : 'text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full';
    }

    if (shareEl) {
        shareEl.value = buildCloudShareLink();
    }
}

function buildCloudShareLink() {
    const cfg = {
        enabled: true,
        supabaseUrl: (cloudConfig.supabaseUrl || '').trim(),
        supabaseAnonKey: (cloudConfig.supabaseAnonKey || '').trim()
    };

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return '';

    const encoded = encodeURIComponent(btoa(JSON.stringify(cfg)));
    // Use hash so GitHub pages doesn't strip query.
    const base = location.origin + location.pathname;
    return `${base}#cloud=${encoded}`;
}

function openCloudSync() {
    if (!currentUser || currentUser.role !== 'owner') {
        alert('Only the Owner can configure Cloud Sync.');
        return;
    }

    loadCloudConfig();
    updateCloudModalUI();

    const modal = document.getElementById('cloudSyncModal');
    if (modal) modal.classList.remove('hidden');

    const msg = document.getElementById('cloudSyncMsg');
    if (msg) msg.classList.add('hidden');
}

function closeCloudSync() {
    const modal = document.getElementById('cloudSyncModal');
    if (modal) modal.classList.add('hidden');
}

function saveCloudSync() {
    const enabledEl = document.getElementById('cloudEnabled');
    const urlEl = document.getElementById('cloudSupabaseUrl');
    const keyEl = document.getElementById('cloudSupabaseAnonKey');

    cloudConfig.enabled = !!enabledEl?.checked;
    cloudConfig.supabaseUrl = (urlEl?.value || '').trim();
    cloudConfig.supabaseAnonKey = (keyEl?.value || '').trim();

    saveCloudConfig();
    updateCloudModalUI();

    setCloudSyncMsg('Saved Cloud Sync settings. Click “Test Connection”, then refresh the Owner Panel.', 'success');
}

function disableCloudSync() {
    cloudConfig.enabled = false;
    saveCloudConfig();
    updateCloudModalUI();
    setCloudSyncMsg('Cloud Sync disabled. The app is now in Local-only mode.', 'success');
    updateOwnerPanelBadges();
}

async function testCloudSync() {
    try {
        const enabledEl = document.getElementById('cloudEnabled');
        const urlEl = document.getElementById('cloudSupabaseUrl');
        const keyEl = document.getElementById('cloudSupabaseAnonKey');

        cloudConfig.enabled = !!enabledEl?.checked;
        cloudConfig.supabaseUrl = (urlEl?.value || '').trim();
        cloudConfig.supabaseAnonKey = (keyEl?.value || '').trim();

        if (!isCloudEnabled()) {
            setCloudSyncMsg('Please enable Cloud Sync and fill Supabase URL + Anon key first.', 'error');
            return;
        }

        // Try a simple select
        const rows = await cloudLoadUsers();
        setCloudSyncMsg(`Connection OK. Found ${rows.length} users in the cloud database.`, 'success');

        // Mirror local normalized users to cloud (ensures owner/admin are there)
        await saveUsersCloudMirror();

        updateCloudModalUI();
        updateOwnerPanelBadges();
    } catch (e) {
        console.error(e);
        setCloudSyncMsg(e?.message || String(e), 'error');
    }
}

async function copyCloudShareLink() {
    const link = document.getElementById('cloudShareLink')?.value || '';
    if (!link) {
        setCloudSyncMsg('No share link yet. Fill Supabase URL + Anon key first.', 'error');
        return;
    }

    try {
        await navigator.clipboard.writeText(link);
        setCloudSyncMsg('Share link copied! Send it to your friend and have them open it once.', 'success');
    } catch {
        setCloudSyncMsg('Could not copy automatically. Select and copy the link manually.', 'error');
    }
}

async function copyCloudSQL() {
    const sql = getCloudSQL();
    try {
        await navigator.clipboard.writeText(sql);
        setCloudSyncMsg('SQL copied. Paste into Supabase SQL Editor and run it.', 'success');
    } catch {
        const ta = document.getElementById('cloudSql');
        if (ta) {
            ta.focus();
            ta.select();
        }
        setCloudSyncMsg('Could not auto-copy. The SQL is selected—copy it manually.', 'error');
    }
}

// ==========================================
// CHAT SYSTEM
// ==========================================

let chatMessages = [];
let chatPollingInterval = null;

function loadLocalMessages() {
    try {
        const stored = localStorage.getItem('chatMessages');
        chatMessages = stored ? JSON.parse(stored) : [];
    } catch (e) {
        chatMessages = [];
    }
}

function saveLocalMessages() {
    try {
        localStorage.setItem('chatMessages', JSON.stringify(chatMessages.slice(-100))); // Keep last 100
    } catch (e) {
        console.warn('Could not save messages:', e);
    }
}

let chatCloudOk = null; // null = unknown, true/false after first attempt
let chatCloudLastError = '';

function setChatCloudWarn(text) {
    const el = document.getElementById('chatCloudWarn');
    if (!el) return;
    if (!text) {
        el.classList.add('hidden');
        el.textContent = '';
        return;
    }
    el.textContent = text;
    el.classList.remove('hidden');
}

async function cloudLoadMessages() {
    if (!isCloudEnabled()) return [];
    try {
        const rows = await supabaseFetch('messages?select=*&order=created_at.asc&limit=100');
        chatCloudOk = true;
        chatCloudLastError = '';
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        chatCloudOk = false;
        chatCloudLastError = e?.message || String(e);
        console.warn('Cloud messages fetch failed:', e);
        return null; // null means cloud failed
    }
}

async function cloudSendMessage(username, message) {
    if (!isCloudEnabled()) return null;
    try {
        const rows = await supabaseFetch('messages', {
            method: 'POST',
            body: JSON.stringify({ username, message })
        });
        chatCloudOk = true;
        chatCloudLastError = '';
        return rows?.[0] || null;
    } catch (e) {
        chatCloudOk = false;
        chatCloudLastError = e?.message || String(e);
        console.warn('Cloud send message failed:', e);
        return null;
    }
}

function openChat() {
    document.getElementById('chatModal').classList.remove('hidden');
    setChatCloudWarn('');
    loadAndRenderMessages();
    
    // Start polling for new messages
    if (chatPollingInterval) clearInterval(chatPollingInterval);
    chatPollingInterval = setInterval(loadAndRenderMessages, 3000);
}

function closeChat() {
    document.getElementById('chatModal').classList.add('hidden');
    if (chatPollingInterval) {
        clearInterval(chatPollingInterval);
        chatPollingInterval = null;
    }
}

async function loadAndRenderMessages() {
    // Prefer cloud if enabled, but fall back to local if cloud chat isn't configured.
    if (isCloudEnabled()) {
        const cloudMsgs = await cloudLoadMessages();
        if (cloudMsgs === null) {
            // Cloud chat failed (missing table / RLS / wrong SQL). Use local chat.
            loadLocalMessages();
            const detail = chatCloudLastError ? ` Error: ${chatCloudLastError}` : '';
            setChatCloudWarn('Cloud chat not available (falling back to local). Run Cloud Sync SQL to create the messages table. ' + detail);
        } else {
            chatMessages = cloudMsgs;
            setChatCloudWarn('');
        }
    } else {
        loadLocalMessages();
        setChatCloudWarn('');
    }

    renderMessages();
    updateOnlineCount();
}

function renderMessages() {
    const container = document.getElementById('chatMessages');
    
    if (chatMessages.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 text-sm py-8">
                <span class="text-3xl block mb-2">💬</span>
                No messages yet. Be the first to say hi!
            </div>
        `;
        return;
    }
    
    container.innerHTML = chatMessages.map(msg => {
        const isMe = msg.username === currentUser?.username;
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isOwner = msg.username === 'gamerking';
        const user = users.find(u => u.username === msg.username);
        const isAdmin = user?.role === 'admin';
        
        let badge = '';
        if (isOwner) badge = '<span class="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full ml-1">👑</span>';
        else if (isAdmin) badge = '<span class="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full ml-1">⭐</span>';
        
        return `
            <div class="flex ${isMe ? 'justify-end' : 'justify-start'}">
                <div class="max-w-[75%] ${isMe ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-800'} rounded-2xl px-4 py-2 shadow-sm">
                    <div class="flex items-center gap-1 mb-1">
                        <span class="font-semibold text-sm ${isMe ? 'text-white/90' : 'text-indigo-600'}">@${msg.username}</span>
                        ${badge}
                        <span class="text-xs ${isMe ? 'text-white/60' : 'text-gray-400'} ml-auto">${time}</span>
                    </div>
                    <p class="text-sm break-words">${escapeHtml(msg.message)}</p>
                </div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateOnlineCount() {
    const el = document.getElementById('chatOnlineCount');
    if (!el) return;

    if (!isCloudEnabled()) {
        el.textContent = `Local mode • ${chatMessages.length} messages`;
        return;
    }

    if (chatCloudOk === false) {
        el.textContent = `Cloud enabled • Chat offline (local fallback)`;
        return;
    }

    el.textContent = `${users.length} users • Cloud Sync ✓`;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || !currentUser) return;

    const newMsg = {
        username: currentUser.username,
        message: message,
        created_at: new Date().toISOString()
    };

    if (isCloudEnabled()) {
        const saved = await cloudSendMessage(currentUser.username, message);
        if (!saved) {
            // Cloud failed -> local fallback
            chatMessages.push(newMsg);
            saveLocalMessages();
            const detail = chatCloudLastError ? ` Error: ${chatCloudLastError}` : '';
            setChatCloudWarn('Could not send via cloud (local fallback). Run Cloud Sync SQL to create the messages table. ' + detail);
        } else {
            setChatCloudWarn('');
        }
    } else {
        chatMessages.push(newMsg);
        saveLocalMessages();
    }

    input.value = '';
    await loadAndRenderMessages();
}

// ==========================================
// PUBLISH / DEPLOY HELPERS
// ==========================================

function openPublishModal() {
    // Owner-only button exists in Owner Panel, but keep this safe.
    if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'admin')) {
        alert('You must be logged in as Owner/Admin to view deployment info.');
        return;
    }

    const modal = document.getElementById('publishModal');
    if (modal) modal.classList.remove('hidden');
}

function closePublishModal() {
    const modal = document.getElementById('publishModal');
    if (modal) modal.classList.add('hidden');
}

async function copyDeployChecklist() {
    const text = [
        'DEPLOY CHECKLIST',
        '',
        '1) Pick a host: GitHub Pages / Netlify / Vercel / Cloudflare Pages',
        '2) Upload files: index.html, styles.css, app.js',
        '3) Deploy and test the generated URL',
        '',
        'CUSTOM DOMAIN (www.yourdomain.com)',
        '4) Buy the domain (Namecheap/GoDaddy/Cloudflare)',
        '5) Add domain in your hosting dashboard',
        '6) DNS:',
        '   - www -> CNAME (value provided by host)',
        '   - root/apex -> A/ALIAS/ANAME (depends on host/provider)',
        '7) Enable HTTPS (Let\'s Encrypt, usually automatic)',
        '',
        'IMPORTANT:',
        '- This demo stores users in localStorage (per browser).',
        '- For real accounts across devices, you need a backend + database.'
    ].join('\n');

    try {
        await navigator.clipboard.writeText(text);
        alert('Checklist copied to clipboard!');
    } catch {
        // Fallback
        const ta = document.getElementById('deployChecklist');
        if (ta) {
            ta.classList.remove('hidden');
            ta.value = text;
            ta.focus();
            ta.select();
        }
        alert('Could not auto-copy. The checklist was placed in a text box—copy it manually.');
    }
}

// ==========================================
// AI ASSISTANT (OFFLINE + OPTIONAL REAL API)
// ==========================================

const AI_STORAGE_KEY = 'aiAssistantSettings';

function loadAISettings() {
    try {
        const raw = localStorage.getItem(AI_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveAISettings(next) {
    try {
        localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
        console.warn('Could not save AI settings:', e);
    }
}

function clearAIKey() {
    const settings = loadAISettings();
    delete settings.apiKey;
    saveAISettings(settings);
    const keyEl = document.getElementById('aiApiKey');
    if (keyEl) keyEl.value = '';
    const res = document.getElementById('aiResult');
    if (res) {
        res.textContent = 'Saved key cleared.';
        res.classList.remove('hidden');
    }
}

function updateAIModeBadge() {
    const useReal = document.getElementById('aiUseReal')?.checked;
    const badge = document.getElementById('aiModeBadge');
    if (badge) {
        badge.textContent = useReal ? 'Real AI (API)' : 'Offline helper';
        badge.className = useReal
            ? 'text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full'
            : 'text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full';
    }

    const footer = document.getElementById('aiFooterNote');
    const provider = document.getElementById('aiProvider')?.value || 'openrouter';
    if (footer) {
        footer.textContent = useReal
            ? `Real AI mode enabled (${provider}). Tip: OpenRouter usually works in-browser. Some providers (like OpenAI direct) may require a backend proxy due to CORS.`
            : 'Tip: Open the Site Editor first, then use this assistant. (Offline mode works without any API key.)';
    }
}

function openAIAssistant() {
    if (!currentUser || currentUser.role !== 'owner') {
        alert('Only the Owner can use the AI Assistant!');
        return;
    }

    // Ensure the Site Editor is open so the assistant can apply settings.
    const siteEditor = document.getElementById('siteEditorModal');
    if (siteEditor.classList.contains('hidden')) {
        openSiteEditor();
    }

    // Load persisted AI settings
    const settings = loadAISettings();
    const useRealEl = document.getElementById('aiUseReal');
    const providerEl = document.getElementById('aiProvider');
    const modelEl = document.getElementById('aiModel');
    const keyEl = document.getElementById('aiApiKey');
    const rememberEl = document.getElementById('aiRememberKey');

    if (useRealEl) useRealEl.checked = !!settings.useReal;
    if (providerEl) providerEl.value = settings.provider || 'openrouter';
    if (modelEl) modelEl.value = settings.model || 'openai/gpt-4o-mini';
    if (rememberEl) rememberEl.checked = !!settings.rememberKey;
    if (keyEl) keyEl.value = (settings.rememberKey && settings.apiKey) ? settings.apiKey : '';

    updateAIModeBadge();

    // Wire change handlers once
    if (useRealEl && !useRealEl.dataset.bound) {
        useRealEl.dataset.bound = '1';
        useRealEl.addEventListener('change', () => {
            const s = loadAISettings();
            s.useReal = useRealEl.checked;
            saveAISettings(s);
            updateAIModeBadge();
        });
    }

    if (providerEl && !providerEl.dataset.bound) {
        providerEl.dataset.bound = '1';
        providerEl.addEventListener('change', () => {
            const s = loadAISettings();
            s.provider = providerEl.value;
            saveAISettings(s);
            updateAIModeBadge();
        });
    }

    if (modelEl && !modelEl.dataset.bound) {
        modelEl.dataset.bound = '1';
        modelEl.addEventListener('input', () => {
            const s = loadAISettings();
            s.model = modelEl.value;
            saveAISettings(s);
        });
    }

    if (rememberEl && !rememberEl.dataset.bound) {
        rememberEl.dataset.bound = '1';
        rememberEl.addEventListener('change', () => {
            const s = loadAISettings();
            s.rememberKey = rememberEl.checked;
            if (!rememberEl.checked) delete s.apiKey;
            saveAISettings(s);
        });
    }

    if (keyEl && !keyEl.dataset.bound) {
        keyEl.dataset.bound = '1';
        keyEl.addEventListener('input', () => {
            const remember = document.getElementById('aiRememberKey')?.checked;
            if (!remember) return;
            const s = loadAISettings();
            s.apiKey = keyEl.value;
            saveAISettings(s);
        });
    }

    // Show modal
    document.getElementById('aiAssistantModal').classList.remove('hidden');

    const promptEl = document.getElementById('aiPrompt');
    if (promptEl && !promptEl.value) {
        promptEl.value = 'Make it dark with glass cards, neon glow, and particles.';
    }
    promptEl?.focus();

    const resultEl = document.getElementById('aiResult');
    if (resultEl) resultEl.classList.add('hidden');
}

function closeAIAssistant() {
    const modal = document.getElementById('aiAssistantModal');
    if (modal) modal.classList.add('hidden');
}

function setAIPrompt(text) {
    const promptEl = document.getElementById('aiPrompt');
    if (promptEl) {
        promptEl.value = text;
        promptEl.focus();
    }
}

function setAIApplyLoading(isLoading, label = 'Apply to Site Editor') {
    const btn = document.getElementById('aiApplyBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Thinking…' : label;
    btn.classList.toggle('opacity-60', isLoading);
    btn.classList.toggle('cursor-not-allowed', isLoading);
}

function applySiteSettingsPatch(patch) {
    // Helpers
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined && value !== null) el.value = value;
    };
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el && typeof value === 'boolean') el.checked = value;
    };

    // Colors / branding
    setVal('siteName', patch.siteName);
    setVal('siteLogo', patch.siteLogo);
    setVal('siteWelcome', patch.siteWelcome);

    setVal('siteBg1', patch.siteBg1);
    setVal('siteBg2', patch.siteBg2);
    setVal('sitePrimary', patch.sitePrimary);
    setVal('siteSecondary', patch.siteSecondary);

    // Typography
    setVal('siteFont', patch.siteFont);

    // Pattern/effects
    setVal('siteBgPattern', patch.siteBgPattern);
    setChecked('siteParticles', patch.siteParticles);
    setChecked('siteGlow', patch.siteGlow);
    setChecked('siteFloating', patch.siteFloating);

    // Cards
    setVal('siteCardStyle', patch.siteCardStyle);
    if (typeof patch.siteBorderRadius === 'number') setVal('siteBorderRadius', patch.siteBorderRadius);

    // Custom CSS
    if (typeof patch.siteCustomCSS === 'string') setVal('siteCustomCSS', patch.siteCustomCSS);

    // Update preview
    updateSitePreview();
}

function offlineAIPrompt(promptRaw) {
    const prompt = (promptRaw || '').toLowerCase();

    // Helpers
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    };

    const applied = [];

    const wantsDark = prompt.includes('dark') || prompt.includes('midnight');
    const wantsLight = prompt.includes('light') || prompt.includes('minimal') || prompt.includes('clean');

    if (prompt.includes('sunset')) {
        setVal('siteBg1', '#ff7e5f');
        setVal('siteBg2', '#feb47b');
        setVal('sitePrimary', '#f97316');
        setVal('siteSecondary', '#ec4899');
        applied.push('Sunset colors');
    }

    if (prompt.includes('ocean') || prompt.includes('sea')) {
        setVal('siteBg1', '#0ea5e9');
        setVal('siteBg2', '#1e3a8a');
        setVal('sitePrimary', '#22c55e');
        setVal('siteSecondary', '#06b6d4');
        applied.push('Ocean colors');
    }

    if (prompt.includes('forest') || prompt.includes('nature')) {
        setVal('siteBg1', '#064e3b');
        setVal('siteBg2', '#14532d');
        setVal('sitePrimary', '#22c55e');
        setVal('siteSecondary', '#84cc16');
        applied.push('Forest colors');
    }

    if (prompt.includes('cyberpunk') || (wantsDark && (prompt.includes('neon') || prompt.includes('glow')))) {
        setVal('siteBg1', '#0b1020');
        setVal('siteBg2', '#2b124c');
        setVal('sitePrimary', '#22d3ee');
        setVal('siteSecondary', '#a78bfa');
        applied.push('Cyberpunk palette');
    }

    if (wantsDark && !prompt.includes('sunset') && !prompt.includes('ocean') && !prompt.includes('forest') && !prompt.includes('cyberpunk')) {
        setVal('siteBg1', '#0b1020');
        setVal('siteBg2', '#111827');
        setVal('sitePrimary', '#6366f1');
        setVal('siteSecondary', '#8b5cf6');
        applied.push('Dark background');
    }

    if (wantsLight && !wantsDark) {
        setVal('siteBg1', '#eef2ff');
        setVal('siteBg2', '#ffffff');
        setVal('sitePrimary', '#4f46e5');
        setVal('siteSecondary', '#7c3aed');
        applied.push('Light/minimal background');
    }

    if (prompt.includes('glass')) {
        setVal('siteCardStyle', 'glass');
        applied.push('Glass cards');
    } else if (prompt.includes('gradient cards') || (prompt.includes('gradient') && prompt.includes('cards'))) {
        setVal('siteCardStyle', 'gradient');
        applied.push('Gradient cards');
    } else if (wantsDark && prompt.includes('dark mode')) {
        setVal('siteCardStyle', 'dark');
        applied.push('Dark cards');
    } else if (wantsLight) {
        setVal('siteCardStyle', 'solid');
        applied.push('Solid cards');
    }

    if (prompt.includes('neon') || prompt.includes('glow')) {
        setChecked('siteGlow', true);
        applied.push('Neon glow');
    }

    if (prompt.includes('no glow') || prompt.includes('disable glow')) {
        setChecked('siteGlow', false);
        applied.push('Glow disabled');
    }

    if (prompt.includes('particles')) {
        setChecked('siteParticles', true);
        applied.push('Particles enabled');
    }

    if (prompt.includes('no particles') || prompt.includes('disable particles')) {
        setChecked('siteParticles', false);
        applied.push('Particles disabled');
    }

    if (prompt.includes('floating')) {
        setChecked('siteFloating', true);
        applied.push('Floating cards');
    }

    if (prompt.includes('no floating') || prompt.includes('disable floating')) {
        setChecked('siteFloating', false);
        applied.push('Floating disabled');
    }

    const patterns = ['dots', 'grid', 'waves', 'stars', 'none'];
    const picked = patterns.find(p => prompt.includes(p));
    if (picked) {
        setVal('siteBgPattern', picked);
        applied.push(`Pattern: ${picked}`);
    }

    if (prompt.includes('poppins')) {
        setVal('siteFont', "'Poppins', sans-serif");
        applied.push('Font: Poppins');
    } else if (prompt.includes('roboto')) {
        setVal('siteFont', "'Roboto', sans-serif");
        applied.push('Font: Roboto');
    } else if (prompt.includes('montserrat')) {
        setVal('siteFont', "'Montserrat', sans-serif");
        applied.push('Font: Montserrat');
    } else if (prompt.includes('playfair')) {
        setVal('siteFont', "'Playfair Display', serif");
        applied.push('Font: Playfair Display');
    } else if (prompt.includes('space grotesk') || prompt.includes('grotesk')) {
        setVal('siteFont', "'Space Grotesk', sans-serif");
        applied.push('Font: Space Grotesk');
    } else if (prompt.includes('jetbrains') || prompt.includes('mono')) {
        setVal('siteFont', "'JetBrains Mono', monospace");
        applied.push('Font: JetBrains Mono');
    } else if (prompt.includes('comic')) {
        setVal('siteFont', "'Comic Sans MS', cursive");
        applied.push('Font: Comic Sans');
    }

    if (prompt.includes('rounded')) {
        setVal('siteBorderRadius', 22);
        applied.push('More rounded corners');
    }
    if (prompt.includes('square')) {
        setVal('siteBorderRadius', 8);
        applied.push('Sharper corners');
    }

    if (prompt.includes('no effects')) {
        setChecked('siteGlow', false);
        setChecked('siteParticles', false);
        setChecked('siteFloating', false);
        setVal('siteBgPattern', 'none');
        applied.push('Effects disabled');
    }

    updateSitePreview();

    return applied;
}

function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function stripJsonFromText(text) {
    // Try to locate the first { ... } JSON object in a potentially chatty response.
    if (!text) return '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return text.trim();
    return text.slice(start, end + 1).trim();
}

async function callRealAI(promptRaw) {
    const provider = document.getElementById('aiProvider')?.value || 'openrouter';
    const model = document.getElementById('aiModel')?.value || 'openai/gpt-4o-mini';
    const apiKey = document.getElementById('aiApiKey')?.value || '';

    if (!apiKey) {
        throw new Error('Missing API key. Paste your key or turn off “Use real AI”.');
    }

    if (provider === 'openrouter') {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                // Optional but recommended by OpenRouter
                'HTTP-Referer': location.origin,
                'X-Title': 'Login System Pro - Site Editor'
            },
            body: JSON.stringify({
                model,
                temperature: 0.4,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'You are a UI theme assistant. Return ONLY JSON.',
                            'The JSON schema is:',
                            '{',
                            '  "siteName": string (optional),',
                            '  "siteLogo": string emoji (optional),',
                            '  "siteWelcome": string (optional),',
                            '  "siteBg1": "#RRGGBB" (optional),',
                            '  "siteBg2": "#RRGGBB" (optional),',
                            '  "sitePrimary": "#RRGGBB" (optional),',
                            '  "siteSecondary": "#RRGGBB" (optional),',
                            '  "siteFont": one of ["Inter, system-ui, sans-serif","\'Poppins\', sans-serif","\'Roboto\', sans-serif","\'Montserrat\', sans-serif","\'Playfair Display\', serif","\'Space Grotesk\', sans-serif","\'JetBrains Mono\', monospace","\'Comic Sans MS\', cursive"] (optional),',
                            '  "siteBgPattern": one of ["none","dots","grid","waves","stars","particles"] (optional),',
                            '  "siteParticles": boolean (optional),',
                            '  "siteGlow": boolean (optional),',
                            '  "siteFloating": boolean (optional),',
                            '  "siteCardStyle": one of ["solid","glass","dark","gradient"] (optional),',
                            '  "siteBorderRadius": number 0-30 (optional),',
                            '  "siteCustomCSS": string (optional)',
                            '}',
                            'Do not include markdown fences. Do not include any explanation.'
                        ].join('\n')
                    },
                    {
                        role: 'user',
                        content: `User request: ${promptRaw}`
                    }
                ]
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenRouter error (${res.status}): ${text}`);
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        return content;
    }

    // OpenAI direct: may fail due to browser CORS.
    if (provider === 'openai') {
        const url = 'https://api.openai.com/v1/chat/completions';
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model.includes('/') ? model.split('/').pop() : model,
                temperature: 0.4,
                messages: [
                    {
                        role: 'system',
                        content: 'Return ONLY JSON for site theme settings. No markdown, no explanation.'
                    },
                    {
                        role: 'user',
                        content: `Return JSON with keys like siteBg1, siteBg2, sitePrimary, siteSecondary, siteCardStyle, siteGlow, siteParticles, siteFloating, siteBgPattern, siteBorderRadius, siteFont. Request: ${promptRaw}`
                    }
                ]
            })
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenAI error (${res.status}): ${text}`);
        }

        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content || '';
        return content;
    }

    throw new Error('Unknown AI provider');
}

async function applyAIPrompt() {
    const promptRaw = document.getElementById('aiPrompt')?.value || '';
    const useReal = document.getElementById('aiUseReal')?.checked;
    const resultEl = document.getElementById('aiResult');

    if (!promptRaw.trim()) {
        if (resultEl) {
            resultEl.textContent = 'Type a prompt first.';
            resultEl.classList.remove('hidden');
        }
        return;
    }

    // Persist settings
    const settings = loadAISettings();
    settings.useReal = !!useReal;
    settings.provider = document.getElementById('aiProvider')?.value || settings.provider || 'openrouter';
    settings.model = document.getElementById('aiModel')?.value || settings.model || 'openai/gpt-4o-mini';
    settings.rememberKey = document.getElementById('aiRememberKey')?.checked || false;
    if (settings.rememberKey) {
        settings.apiKey = document.getElementById('aiApiKey')?.value || settings.apiKey;
    }
    saveAISettings(settings);

    setAIApplyLoading(true);

    try {
        if (useReal) {
            const raw = await callRealAI(promptRaw);
            const jsonText = stripJsonFromText(raw);
            const patch = safeJsonParse(jsonText);
            if (!patch || typeof patch !== 'object') {
                throw new Error('AI did not return valid JSON. Try again or switch to Offline mode.');
            }

            applySiteSettingsPatch(patch);

            if (resultEl) {
                resultEl.textContent = 'Applied settings from real AI. Review in the Site Editor, then click “Save Site Settings”.';
                resultEl.classList.remove('hidden');
            }
        } else {
            const applied = offlineAIPrompt(promptRaw);
            if (resultEl) {
                const summary = applied.length ? applied.join(' • ') : 'No recognizable keywords found. Try: dark, glass, neon, particles, dots, stars, poppins, rounded.';
                resultEl.textContent = 'Applied (offline): ' + summary;
                resultEl.classList.remove('hidden');
            }
        }
    } catch (err) {
        console.error(err);
        // Fallback to offline
        const applied = offlineAIPrompt(promptRaw);
        if (resultEl) {
            resultEl.textContent = `Real AI failed: ${err?.message || err}. Applied offline fallback instead (${applied.length ? applied.join(' • ') : 'no matches'}).`;
            resultEl.classList.remove('hidden');
        }
    } finally {
        setAIApplyLoading(false);
        updateAIModeBadge();
    }
}
