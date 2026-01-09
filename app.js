/**
 * SaebMC Studio - Hyper-Defensive Core
 */

// 1. Core State & Config
const SUPABASE_URL = 'https://kuqynhfcfucxyqeldcli.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1cXluaGZjZnVjeHlxZWxkY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MzAyNDAsImV4cCI6MjA4MzUwNjI0MH0.OPm7SlyWPcBAowyQdMXDlzLBtqe-GEZEGHlqsQjVcz8';

let currentUser = null;
let chatMode = 'public';
let currentDMTarget = null;
let currentGroup = null;
let chatPollingInterval = null;
let backgroundPollInterval = null;
let lastKnownMessageTime = new Date().toISOString();
let notifications = [];

// Safe DOM Access
const get = (id) => document.getElementById(id);

// Safe Storage Helpers
function safeGet(key, fallback) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
    } catch (e) { return fallback; }
}

function safeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

// 2. Database Engine
async function dbCall(path, method = 'GET', body = null) {
    const config = safeGet('studio_cloud_config', { enabled: true, url: SUPABASE_URL, key: SUPABASE_KEY });
    if (!config.enabled || !navigator.onLine) return null;

    const headers = {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json'
    };
    
    if (method === 'POST') headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    else if (method === 'PATCH' || method === 'DELETE') headers['Prefer'] = 'return=representation';

    try {
        const res = await fetch(`${config.url}/rest/v1/${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

// 3. View Management
function hideAllViews() {
    ['loginPage', 'registerPage', 'dashboard', 'publicPage', 'tfaPage', 'loadingScreen'].forEach(id => {
        const el = get(id);
        if (el) el.classList.add('hidden');
    });
}

function showLogin() {
    if (currentUser) return showDashboard();
    hideAllViews();
    const el = get('loginPage');
    if (el) el.classList.remove('hidden');
    if (location.hash !== '' && location.hash !== '#') history.replaceState(null, null, ' ');
}

function showRegister() {
    hideAllViews();
    const el = get('registerPage');
    if (el) el.classList.remove('hidden');
}

function showDashboard() {
    if (!currentUser) return showLogin();
    hideAllViews();
    const el = get('dashboard');
    if (el) el.classList.remove('hidden');

    // UI Updates
    if (get('displayName')) get('displayName').innerText = currentUser.name || "User";
    if (get('displayUsername')) get('displayUsername').innerText = `@${currentUser.username}`;
    if (get('userAvatar')) get('userAvatar').innerText = (currentUser.name || 'U')[0].toUpperCase();
    if (get('userRoleBadge')) get('userRoleBadge').innerText = currentUser.role || 'user';
    if (get('tfaStatus')) get('tfaStatus').innerText = currentUser.tfaEnabled ? 'Enabled' : 'Disabled';

    const ownerBtn = get('ownerPanelBtn');
    if (ownerBtn) {
        if (['owner', 'admin'].includes(currentUser.role)) ownerBtn.classList.remove('hidden');
        else ownerBtn.classList.add('hidden');
    }

    if (location.hash !== '#dashboard') history.replaceState(null, null, '#dashboard');

    if (!backgroundPollInterval) backgroundPollInterval = setInterval(checkForNewNotifications, 6000);
}

// 4. Authentication Logic
async function login(un, pw) {
    const loader = get('loadingScreen');
    if (loader) loader.classList.remove('hidden');
    if (get('loadingStatusText')) get('loadingStatusText').innerText = "Authenticating Protocol...";

    try {
        const data = await dbCall(`users?username=eq.${un.toLowerCase()}&select=*`);
        const user = data && data[0];

        if (user && user.password === pw) {
            const mapped = {
                username: user.username,
                name: user.name,
                role: user.role,
                tfaEnabled: user.tfa_enabled,
                statusText: user.status_text,
                pageConfig: user.page_config ? JSON.parse(user.page_config) : {}
            };
            
            if (mapped.tfaEnabled) {
                window.tempUser = mapped;
                hideAllViews();
                if (get('tfaPage')) get('tfaPage').classList.remove('hidden');
            } else {
                completeLogin(mapped);
            }
        } else {
            alert("Authorization Denied: Invalid Credentials.");
        }
    } catch (e) {
        alert("System Error during Authentication.");
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

function completeLogin(user) {
    currentUser = user;
    localStorage.setItem('studio_session', user.username);
    lastKnownMessageTime = new Date().toISOString();
    showDashboard();
    showToast(`Welcome back, ${user.name}!`);
}

function logout() {
    localStorage.removeItem('studio_session');
    location.reload();
}

// 5. Public Profile Engine
async function showPublicPage(username) {
    hideAllViews();
    const publicView = get('publicPage');
    if (publicView) publicView.classList.remove('hidden');

    const loader = get('loadingScreen');
    if (loader) loader.classList.remove('hidden');

    try {
        const data = await dbCall(`users?username=eq.${username.toLowerCase()}&select=*`);
        const user = data && data[0];

        if (!user) {
            showToast("Profile Not Found", "Error");
            return showLogin();
        }

        const pc = user.page_config ? JSON.parse(user.page_config) : {};
        const container = get('pageContainer');
        if (container) {
            const primary = pc.primaryColor || '#4ade80';
            container.style.background = `linear-gradient(135deg, ${primary}dd, ${primary})`;
            container.style.borderRadius = (pc.borderRadius || 28) + 'px';
        }
        
        if (get('pageAvatar')) get('pageAvatar').innerText = pc.avatarEmoji || "👋";
        if (get('pageName')) get('pageName').innerText = pc.displayName || user.name;
        if (get('pageUsername')) get('pageUsername').innerText = `@${user.username}`;
        if (get('pageBioDisplay')) get('pageBioDisplay').innerText = pc.bio || "No bio set yet.";

        const area = get('pageSocialsDisplay');
        if (area) {
            area.innerHTML = '';
            if (pc.socials) {
                Object.entries(pc.socials).forEach(([name, url]) => {
                    const btn = document.createElement('a');
                    btn.href = url; btn.target = "_blank";
                    btn.className = "px-6 py-2 bg-white/20 backdrop-blur-md rounded-full text-sm font-bold border border-white/10";
                    btn.innerText = name;
                    area.appendChild(btn);
                });
            }
        }
    } catch (e) {
        showToast("Error loading page", "System");
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

// 6. UI Helpers
function openModal(id) {
    const overlay = get('modalOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    Array.from(overlay.children).forEach(c => {
        if (c.id) c.classList.add('hidden');
    });
    const target = get(id);
    if (target) target.classList.remove('hidden');
}

function closeModal() {
    const overlay = get('modalOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function showToast(text, title = "Studio") {
    const container = get('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'glass p-4 rounded-xl shadow-lg border-l-4 border-emerald-500 transition-all min-w-[280px] z-[10000]';
    toast.innerHTML = `<div class="text-[10px] font-bold text-emerald-500 uppercase">${title}</div><div class="text-sm font-medium">${text}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 4000);
}

// 7. Chat System
async function renderMessages() {
    const area = get('chatMessages');
    const modal = get('chatModal');
    if (!area || !modal || modal.classList.contains('hidden')) return;

    const data = await dbCall('messages?order=created_at.desc&limit=50');
    if (!data) return;

    const filtered = data.filter(m => {
        if (chatMode === 'public') return m.type === 'public' || !m.type;
        return false;
    }).reverse();

    area.innerHTML = filtered.map(m => `
        <div class="flex ${m.from === currentUser.username ? 'justify-end' : 'justify-start'}">
            <div class="max-w-[85%] message-bubble ${m.from === currentUser.username ? 'message-mine rounded-tr-none' : 'message-others rounded-tl-none'}">
                <div class="text-[9px] opacity-70 mb-1 font-bold uppercase">${m.from}</div>
                <div class="text-[13px]">${m.text || ''}</div>
            </div>
        </div>
    `).join('');
    area.scrollTop = area.scrollHeight;
}

async function checkForNewNotifications() {
    if (!currentUser) return;
    const data = await dbCall(`messages?created_at=gt.${lastKnownMessageTime}&order=created_at.asc`);
    if (!data || data.length === 0) return;

    data.forEach(msg => {
        lastKnownMessageTime = msg.created_at;
        if (msg.from !== currentUser.username && msg.text.includes(`@${currentUser.username}`)) {
            showToast(msg.text, `Mention from @${msg.from}`);
            notifications.push({ type: "Mention", text: msg.text, time: Date.now() });
            const badge = get('notifBadge');
            if (badge) badge.classList.remove('hidden');
        }
    });
}

// 8. Event Binding
document.addEventListener('DOMContentLoaded', async () => {
    // Nav & Router
    window.addEventListener('hashchange', () => {
        const h = location.hash;
        if (h.startsWith('#/u/')) showPublicPage(h.split('/u/')[1]);
        else if (h === '#dashboard' || h === '') currentUser ? showDashboard() : showLogin();
    });

    // Forms
    if (get('loginForm')) get('loginForm').onsubmit = (e) => {
        e.preventDefault();
        login(get('loginUsername').value, get('loginPassword').value);
    };

    if (get('registerForm')) get('registerForm').onsubmit = async (e) => {
        e.preventDefault();
        const res = await dbCall('users', 'POST', {
            username: get('regUsername').value.trim().toLowerCase(),
            password: get('regPassword').value,
            name: get('regName').value,
            role: 'user',
            page_config: JSON.stringify({})
        });
        if (res) { alert("Account Created."); showLogin(); }
        else alert("Registration Failed.");
    };

    if (get('chatForm')) get('chatForm').onsubmit = async (e) => {
        e.preventDefault();
        const input = get('chatInput');
        const text = input.value.trim();
        if (!text) return;
        await dbCall('messages', 'POST', {
            from: currentUser.username,
            text,
            type: chatMode,
            created_at: new Date().toISOString()
        });
        input.value = '';
        renderMessages();
    };

    // Auto-Login Session
    const session = localStorage.getItem('studio_session');
    if (session) {
        const data = await dbCall(`users?username=eq.${session}&select=*`);
        if (data && data[0]) {
            const u = data[0];
            currentUser = {
                username: u.username, name: u.name, role: u.role,
                tfaEnabled: u.tfa_enabled, statusText: u.status_text,
                pageConfig: u.page_config ? JSON.parse(u.page_config) : {}
            };
            showDashboard();
        } else showLogin();
    } else if (location.hash.startsWith('#/u/')) {
        showPublicPage(location.hash.split('/u/')[1]);
    } else {
        showLogin();
    }

    if (get('initStatus')) get('initStatus').innerText = "✅ Ready";
});

// Global API
window.showDashboard = showDashboard;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.logout = logout;
window.closeModal = closeModal;
window.openModal = openModal;
window.openChat = () => { openModal('chatModal'); if (!chatPollingInterval) chatPollingInterval = setInterval(renderMessages, 3000); };
window.openNotifications = () => {
    openModal('notificationsModal');
    const list = get('notificationsList');
    if (list) list.innerHTML = notifications.length ? notifications.map(n => `<div class="p-3 bg-white/5 rounded-xl border border-white/10 mb-2"><div class="text-[10px] font-bold text-emerald-500 uppercase">${n.type}</div><div class="text-sm">${n.text}</div></div>`).reverse().join('') : '<p class="text-center text-gray-500">No alerts.</p>';
    if (get('notifBadge')) get('notifBadge').classList.add('hidden');
};
window.toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('studio_theme', isDark ? 'dark' : 'light');
    if (get('themeIcon')) get('themeIcon').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
};
window.goBackFromPublic = () => { hideAllViews(); currentUser ? showDashboard() : showLogin(); };
window.copyProfileLink = () => {
    const url = window.location.href.split('#')[0] + '#/u/' + get('pageUsername').innerText.replace('@','');
    navigator.clipboard.writeText(url).then(() => {
        showToast("Link Copied!");
    });
};
window.openOwnerPanel = async () => {
    openModal('ownerPanelModal');
    const tbody = get('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4">Loading Users...</td></tr>';
    const users = await dbCall('users?select=*');
    if (get('totalUsersCount')) get('totalUsersCount').innerText = users ? users.length : '0';
    if (!users) return;
    tbody.innerHTML = users.map(u => `
        <tr class="border-b border-white/5 text-sm">
            <td class="py-4">@${u.username}</td>
            <td>${u.role}</td>
            <td class="text-right">
                <button onclick="manageUser('${u.username}')" class="px-2 py-1 bg-white/5 rounded">Manage</button>
            </td>
        </tr>
    `).join('');
};
window.manageUser = (un) => {
    window.selectedUser = un;
    openModal('manageUserModal');
};
window.deleteSelectedUser = async () => {
    if (confirm("Delete user?")) {
        await dbCall(`users?username=eq.${window.selectedUser}`, 'DELETE');
        closeModal(); window.openOwnerPanel();
    }
};
