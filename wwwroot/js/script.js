// MediTrack script.js — ASP.NET Core Edition
// Clean single-pass script — no duplicate handlers

/* ── API HELPER ─────────────────────────────────────────────── */
async function api(method, url, body) {
    try {
        const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: true, status: res.status, data, error: null };
        }
        const errBody = await res.text().catch(() => '');
        let errMsg = 'HTTP ' + res.status + ': ' + res.statusText;
        try { const j = JSON.parse(errBody); errMsg = j.message || j.title || errMsg; } catch(e) {}
        return { ok: false, status: res.status, data: null, error: { message: errMsg } };
    } catch (networkErr) {
        return { ok: false, status: 0, data: null, error: { message: 'Network error: ' + networkErr.message } };
    }
}

/* ── DOM REFS ────────────────────────────────────────────────── */
const loginPage          = document.getElementById('login-page');
const dashboardPage      = document.getElementById('dashboard-page');
const loginForm          = document.getElementById('login-form');
const logoutBtn          = document.getElementById('logout-btn');
const emailInput         = document.getElementById('email');
const passwordInput      = document.getElementById('password');
const emailError         = document.getElementById('email-error');
const passError          = document.getElementById('pass-error');
const navItems           = document.querySelectorAll('.nav-item');
const pageSections       = document.querySelectorAll('.page-section');
const addMedForm         = document.getElementById('add-med-form');
const inventoryList      = document.getElementById('inventory-list');
const searchBar          = document.getElementById('search-bar');
const totalCountEl       = document.getElementById('total-count');
const expiringCountEl    = document.getElementById('expiring-count');
const lowStockCountEl    = document.getElementById('low-stock-count');
const emptyState         = document.getElementById('empty-state');
const searchCount        = document.getElementById('search-count');
const fileInput          = document.getElementById('med-image');
const imagePreview       = document.getElementById('image-preview');
const fileUploadContent  = document.getElementById('file-upload-content');
const profilePage        = document.getElementById('profile-page');

/* ── STATE ───────────────────────────────────────────────────── */
let currentUserEmail = '', currentProfile = null, medicines = [];
let activeCatFilter = 'all', activeStatus = '', activeSupplier = '', activeSortKey = 'default';
let alertDismissed = false;

/* ── UTILS ───────────────────────────────────────────────────── */
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    t.classList.remove('hide');
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.classList.remove('show','hide'), 220); }, 3000);
}
function setHeaderDate() {
    const el = document.getElementById('header-date');
    if (el) el.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function greetUser() {
    const h = new Date().getHours();
    const el = document.getElementById('ov-greeting');
    if (el) el.textContent = h < 12 ? 'Good morning 👋' : h < 17 ? 'Good afternoon 👋' : 'Good evening 👋';
}

/* Live clock */
function startClock() {
    const el = document.getElementById('ov-clock'); if (!el) return;
    function tick() {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    }
    tick();
    setInterval(tick, 1000);
}

/* Stock health bars */
function updateHealthBars() {
    if (!medicines.length) {
        ['safe','90','60','30','exp'].forEach(k => {
            const f = document.getElementById('hb-' + k); if (f) f.style.width = '0%';
            const v = document.getElementById('hv-' + k); if (v) v.textContent = '0';
        });
        return;
    }
    let safe = 0, d90 = 0, d60 = 0, d30 = 0, exp = 0;
    medicines.forEach(m => {
        const d = daysDiff(m.expiry);
        if (d <= 0)        exp++;
        else if (d <= 30)  d30++;
        else if (d <= 60)  d60++;
        else if (d <= 90)  d90++;
        else               safe++;
    });
    const total = medicines.length;
    const bars = { safe, '90': d90, '60': d60, '30': d30, exp };
    Object.entries(bars).forEach(([k, v]) => {
        const f = document.getElementById('hb-' + k);
        const vEl = document.getElementById('hv-' + k);
        if (f) setTimeout(() => { f.style.width = Math.round((v / total) * 100) + '%'; }, 120);
        if (vEl) vEl.textContent = v;
    });
}
function daysDiff(expiry) { return Math.ceil((new Date(expiry) - new Date()) / 86400000); }

function validateEmail(e) {
    if (/[A-Z]/.test(e)) return 'Email must not contain capital letters.';
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}$/.test(e)) return 'Please enter a valid email address.';
    return null;
}
function validatePassword(p) {
    if (p.length < 8)                               return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(p))                           return 'Must have uppercase letter.';
    if (!/[a-z]/.test(p))                           return 'Must have lowercase letter.';
    if (!/[0-9]/.test(p))                           return 'Must have a number.';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p)) return 'Must have a special character.';
    return null;
}
function setFieldError(inp, err, msg) {
    if (msg) { err.textContent = msg; err.style.display = 'block'; inp.classList.add('input-error'); return false; }
    else      { err.style.display = 'none'; inp.classList.remove('input-error'); return true; }
}
function getPasswordStrength(p) {
    let s = 0;
    if (p.length >= 8)  s++; if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++; if (/[a-z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++; if (/[!@#$%^&*]/.test(p)) s++;
    return s <= 2 ? { label:'Weak',   cls:'strength-weak',   width:'25%' }
         : s <= 4 ? { label:'Medium', cls:'strength-medium', width:'60%' }
                  : { label:'Strong', cls:'strength-strong', width:'100%' };
}

/* ── DARK MODE ───────────────────────────────────────────────── */
(function() {
    if (localStorage.getItem('meditrack_dark') === '1') document.body.classList.add('dark-mode');
    updateDarkIcon();
})();
function updateDarkIcon() {
    const btn = document.getElementById('dark-toggle');
    const dark = document.body.classList.contains('dark-mode');
    btn.innerHTML = dark
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span>Light Mode</span>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>Dark Mode</span>`;
}
document.getElementById('dark-toggle').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('meditrack_dark', document.body.classList.contains('dark-mode') ? '1' : '0');
    updateDarkIcon();
});

/* ── AUTH STATE ──────────────────────────────────────────────── */
async function checkAuthState() {
    const { ok, data } = await api('GET', '/api/auth/me');
    if (ok && data?.authenticated) {
        currentUserEmail = data.email;
        const pr = await api('GET', '/api/profile');
        if (pr.ok) { currentProfile = pr.data; await enterDashboard(data.email); }
        else if (pr.status === 404) { loginPage.classList.add('hidden'); dashboardPage.classList.add('hidden'); profilePage.classList.remove('hidden'); }
        else { await enterDashboard(data.email); }
    } else { showLoginPage(); }
}
function showLoginPage() {
    currentUserEmail = ''; currentProfile = null; medicines = [];
    inventoryList.innerHTML = '';
    dashboardPage.classList.add('hidden');
    profilePage.classList.add('hidden');
    loginPage.classList.remove('hidden');
    // Restart entrance animations every time login page is shown
    loginPage.classList.remove('anim-ready');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            loginPage.classList.add('anim-ready');
        });
    });
}
checkAuthState();

/* ── TAB SWITCH ──────────────────────────────────────────────── */
window.switchTab = function(tab) {
    const lw = document.getElementById('login-form-wrap'), rw = document.getElementById('register-form-wrap');
    const tl = document.getElementById('tab-login'), tr = document.getElementById('tab-register');
    if (tab === 'login') {
        lw.classList.remove('hidden'); rw.classList.add('hidden');
        tl.classList.add('active'); tr.classList.remove('active');
        // replay entrance animation
        lw.style.animation = 'none';
        requestAnimationFrame(() => { lw.style.animation = ''; });
    } else {
        lw.classList.add('hidden'); rw.classList.remove('hidden');
        tl.classList.remove('active'); tr.classList.add('active');
        // replay entrance animation
        rw.style.animation = 'none';
        requestAnimationFrame(() => { rw.style.animation = ''; });
    }
};

/* ── ENTER DASHBOARD ─────────────────────────────────────────── */
async function enterDashboard(email) {
    currentUserEmail = email;
    const avatarEl = document.getElementById('user-avatar');
    const shopEl   = document.getElementById('user-shop-display');
    const emailEl  = document.getElementById('user-email-display');
    if (currentProfile) {
        avatarEl.textContent = currentProfile.name ? currentProfile.name.charAt(0).toUpperCase() : email.charAt(0).toUpperCase();
        if (shopEl) shopEl.textContent = currentProfile.shopName || '';
        if (emailEl) emailEl.textContent = email;
        renderProfileView();
    } else {
        avatarEl.textContent = email.charAt(0).toUpperCase();
        if (shopEl) shopEl.textContent = '';
        if (emailEl) emailEl.textContent = email;
    }
    loginPage.classList.add('hidden');
    profilePage.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    greetUser(); setHeaderDate(); startClock();
    alertDismissed = false;
    await loadMedicines();
    initParticles();
    if (Notification.permission === 'granted') {
        document.getElementById('notify-btn').classList.add('notify-active');
        fireExpiryNotifications();
    }
}

/* ── LOGIN ───────────────────────────────────────────────────── */
loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const ev = emailInput.value.trim(), pv = passwordInput.value;
    const eo = setFieldError(emailInput, emailError, validateEmail(ev));
    const po = setFieldError(passwordInput, passError, pv.length < 1 ? 'Please enter your password.' : null);
    if (!eo || !po) return;
    const { ok, error } = await api('POST', '/api/auth/login', { email: ev.toLowerCase(), password: pv });
    if (ok) { loginForm.reset(); clearStrengthBar('login-strength'); await checkAuthState(); }
    else showToast(error?.message || 'Login failed. Please try again.');
});
emailInput.addEventListener('input', () => {
    const v = emailInput.value.trim();
    if (v) setFieldError(emailInput, emailError, validateEmail(v));
    else { emailError.style.display = 'none'; emailInput.classList.remove('input-error'); }
});
passwordInput.addEventListener('input', () => {
    passError.style.display = 'none'; passwordInput.classList.remove('input-error');
});

/* ── REGISTER ────────────────────────────────────────────────── */
document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ev = document.getElementById('reg-email').value.trim();
    const pv = document.getElementById('reg-password').value;
    const cv = document.getElementById('reg-confirm').value;
    const ee = document.getElementById('reg-email-error');
    const pe = document.getElementById('reg-pass-error');
    const ce = document.getElementById('reg-confirm-error');
    const eo = setFieldError(document.getElementById('reg-email'), ee, validateEmail(ev));
    const po = setFieldError(document.getElementById('reg-password'), pe, validatePassword(pv));
    const co = setFieldError(document.getElementById('reg-confirm'), ce, pv !== cv ? 'Passwords do not match.' : null);
    if (!eo || !po || !co) return;
    const { ok, error } = await api('POST', '/api/auth/register', { email: ev.toLowerCase(), password: pv, confirmPassword: cv });
    if (ok) { document.getElementById('register-form').reset(); clearStrengthBar('reg-strength'); showToast('Account created! Welcome 🎉'); await checkAuthState(); }
    else showToast(error?.message || 'Registration failed.');
});
document.getElementById('reg-email').addEventListener('input', () => {
    const v = document.getElementById('reg-email').value.trim();
    if (v) setFieldError(document.getElementById('reg-email'), document.getElementById('reg-email-error'), validateEmail(v));
    else { document.getElementById('reg-email-error').style.display = 'none'; document.getElementById('reg-email').classList.remove('input-error'); }
});
document.getElementById('reg-password').addEventListener('input', () => {
    const v = document.getElementById('reg-password').value;
    updateStrengthBar('reg-strength', v);
    if (v) setFieldError(document.getElementById('reg-password'), document.getElementById('reg-pass-error'), validatePassword(v));
    else { document.getElementById('reg-pass-error').style.display = 'none'; document.getElementById('reg-password').classList.remove('input-error'); }
});
document.getElementById('reg-confirm').addEventListener('input', () => {
    const p = document.getElementById('reg-password').value, c = document.getElementById('reg-confirm').value;
    if (c) setFieldError(document.getElementById('reg-confirm'), document.getElementById('reg-confirm-error'), p !== c ? 'Passwords do not match.' : null);
    else { document.getElementById('reg-confirm-error').style.display = 'none'; document.getElementById('reg-confirm').classList.remove('input-error'); }
});
function updateStrengthBar(id, pw) {
    const b = document.getElementById(id); if (!b) return;
    if (!pw) { b.style.display = 'none'; return; }
    const s = getPasswordStrength(pw);
    b.style.display = 'block';
    b.querySelector('.strength-fill').className = 'strength-fill ' + s.cls;
    b.querySelector('.strength-fill').style.width = s.width;
    b.querySelector('.strength-label').textContent = s.label;
}
function clearStrengthBar(id) { const b = document.getElementById(id); if (b) b.style.display = 'none'; }

/* ── LOGOUT ──────────────────────────────────────────────────── */
logoutBtn.addEventListener('click', async () => {
    await api('POST', '/api/auth/logout');
    currentProfile = null; medicines = [];
    document.querySelector('[data-target="page-overview"]').click();
    showLoginPage();
});

/* ── NAVIGATION ──────────────────────────────────────────────── */
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        pageSections.forEach(p => p.classList.remove('active-page'));
        item.classList.add('active');
        document.getElementById(item.getAttribute('data-target')).classList.add('active-page');
        if (item.getAttribute('data-target') === 'page-analytics') setTimeout(renderCharts, 80);
    });
});

/* ── LOAD MEDICINES ──────────────────────────────────────────── */
async function loadMedicines() {
    const { ok, data } = await api('GET', '/api/medicines');
    if (ok) { medicines = data || []; renderMedicines(); updateExpirySummary(); updateSupplierFilter(); }
    else { showToast('Could not load medicines.'); medicines = []; renderMedicines(); }
}

/* ── EXPIRY HELPERS ──────────────────────────────────────────── */
function getExpiryBadge(d) {
    if (d <= 0)  return { cls: 'status-expired', label: 'Expired' };
    if (d <= 30) return { cls: 'status-warn',    label: d + 'd' };
    if (d <= 60) return { cls: 'status-warn60',  label: d + 'd' };
    if (d <= 90) return { cls: 'status-warn90',  label: d + 'd' };
    return { cls: 'status-ok', label: 'Safe' };
}
function getExpiryPillClass(d) {
    if (d <= 0)  return 'med-expiry-pill expiry-expired';
    if (d <= 30) return 'med-expiry-pill expiring-soon';
    if (d <= 60) return 'med-expiry-pill expiring-60';
    if (d <= 90) return 'med-expiry-pill expiring-90';
    return 'med-expiry-pill expiry-ok';
}
function getDaysLeftCls(d) {
    if (d <= 0)  return 'dl-expired';
    if (d <= 30) return 'dl-danger';
    if (d <= 90) return 'dl-warn';
    return 'dl-safe';
}
function getDaysLeftTxt(d) {
    if (d <= 0)  return 'Expired';
    if (d === 1) return '1 day left';
    return d + 'd left';
}

const CAT_CLASSES = {
    Antibiotic:'cat-antibiotic', Painkiller:'cat-painkiller', Vitamin:'cat-vitamin',
    Antidiabetic:'cat-antidiabetic', Cardiac:'cat-cardiac', Antacid:'cat-antacid',
    Antihistamine:'cat-antihistamine', Other:'cat-other'
};

/* ── FILTER + SORT ───────────────────────────────────────────── */
function getSortedFiltered(ft) {
    let list = medicines.filter(med => {
        const nm  = !ft || med.name.toLowerCase().includes(ft.toLowerCase());
        const cm  = activeCatFilter === 'all' || med.category === activeCatFilter;
        const sm  = !activeSupplier || (med.supplier || '') === activeSupplier;
        const d   = daysDiff(med.expiry);
        let stm = true;
        if      (activeStatus === 'expired') stm = d <= 0;
        else if (activeStatus === '30')      stm = d > 0 && d <= 30;
        else if (activeStatus === '60')      stm = d > 0 && d <= 60;
        else if (activeStatus === '90')      stm = d > 0 && d <= 90;
        else if (activeStatus === 'safe')    stm = d > 90;
        return nm && cm && sm && stm;
    });
    if      (activeSortKey === 'name-asc')    list.sort((a,b) => a.name.localeCompare(b.name));
    else if (activeSortKey === 'name-desc')   list.sort((a,b) => b.name.localeCompare(a.name));
    else if (activeSortKey === 'expiry-asc')  list.sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
    else if (activeSortKey === 'expiry-desc') list.sort((a,b) => new Date(b.expiry) - new Date(a.expiry));
    else if (activeSortKey === 'qty-asc')     list.sort((a,b) => a.qty - b.qty);
    else if (activeSortKey === 'qty-desc')    list.sort((a,b) => b.qty - a.qty);
    return list;
}

/* ── RENDER MEDICINES ────────────────────────────────────────── */
function renderMedicines(ft = '') {
    inventoryList.innerHTML = '';
    let e30 = 0, e60 = 0, e90 = 0, ls = 0;
    medicines.forEach(m => {
        const d = daysDiff(m.expiry);
        if (d > 0 && d <= 30)        e30++;
        if (d > 30 && d <= 60)       e60++;   // exclusive: 31–60 only
        if (d > 60 && d <= 90)       e90++;   // exclusive: 61–90 only
        if (m.qty < 10) ls++;
    });
    totalCountEl.textContent    = medicines.length;
    expiringCountEl.textContent = e30;
    lowStockCountEl.textContent = ls;
    const el60 = document.getElementById('expiring60-count');
    const el90 = document.getElementById('expiring90-count');
    if (el60) el60.textContent = e60;
    if (el90) el90.textContent = e90;

    const filtered = getSortedFiltered(ft);
    filtered.forEach((med, i) => {
        const d        = daysDiff(med.expiry);
        const badge    = getExpiryBadge(d);
        const pillCls  = getExpiryPillClass(d);
        const isLow    = med.qty < 10;
        const catClass = CAT_CLASSES[med.category] || 'cat-other';
        const catLabel = med.category || 'Other';
        const safeId   = med.id;
        const safeName = med.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        inventoryList.insertAdjacentHTML('beforeend', `
            <div class="med-card" style="animation-delay:${i * 0.04}s">
                <div class="med-status-badge ${badge.cls}">${badge.label}</div>
                <div class="med-image-wrap">
                    <img src="${med.image || 'https://images.unsplash.com/photo-1584308666744-24d5e4a8389c?w=400&q=80'}"
                         alt="${med.name}" class="med-image">
                </div>
                <div class="med-details">
                    <div class="med-category-tag ${catClass}">${catLabel}</div>
                    <div class="med-title" title="${med.name}">${med.name}</div>
                    <div class="med-batch">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                            <line x1="7" y1="7" x2="7.01" y2="7"/>
                        </svg>
                        ${med.batch}${med.supplier ? ' &bull; <span style="color:var(--primary)">' + med.supplier + '</span>' : ''}
                    </div>
                    <div class="med-meta-row">
                        <div class="${isLow ? 'med-qty-pill low-qty' : 'med-qty-pill'}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                            </svg>Qty: ${med.qty}
                        </div>
                        <div class="${pillCls}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>${med.expiry}
                        </div>
                        <div class="days-left-pill ${getDaysLeftCls(d)}">${getDaysLeftTxt(d)}</div>
                    </div>
                    <div class="card-actions">
                        <button class="edit-btn" onclick="openEditModal('${safeId}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>Edit
                        </button>
                        <button class="delete-btn" onclick="confirmDelete('${safeId}','${safeName}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"/>
                                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
                            </svg>Remove
                        </button>
                    </div>
                </div>
                <div class="list-actions">
                    <button class="edit-btn" onclick="openEditModal('${safeId}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>Edit
                    </button>
                    <button class="delete-btn" onclick="confirmDelete('${safeId}','${safeName}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
                        </svg>Remove
                    </button>
                </div>
            </div>`);
    });

    emptyState.classList.toggle('hidden', filtered.length > 0);
    searchCount.textContent = ft ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : '';
    updateExpirySummary();
    updateAlertBanner();
    ['total-count','expiring-count','low-stock-count','expiring60-count','expiring90-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el) animateCounter(el, el.textContent, 700);
    });
}

/* ── EXPIRY SUMMARY PANEL ────────────────────────────────────── */
function updateExpirySummary() {
    const c = document.getElementById('expiry-summary'); if (!c) return;
    const badge = document.getElementById('ov-expiry-count');
    if (!medicines.length) {
        c.innerHTML = '<div class="empty-panel-msg">No medicines added yet.</div>';
        if (badge) badge.textContent = '0 items';
        updateHealthBars();
        return;
    }
    const sorted = [...medicines].sort((a,b) => new Date(a.expiry) - new Date(b.expiry)).slice(0, 6);
    if (badge) badge.textContent = medicines.length + ' items';
    c.innerHTML = sorted.map(med => {
        const d = daysDiff(med.expiry);
        const cls = d <= 0 ? 'expiry-badge badge-expired' : d <= 30 ? 'expiry-badge badge-warn' : 'expiry-badge badge-ok';
        const lbl = d <= 0 ? 'Expired' : d <= 30 ? d + 'd left' : 'Safe';
        return `<div class="expiry-row">
            <div>
                <div class="expiry-row-name">${med.name}</div>
                <div class="expiry-row-date">${med.expiry}</div>
            </div>
            <span class="${cls}">${lbl}</span>
        </div>`;
    }).join('');
    updateHealthBars();
}

/* ── ALERT BANNER ────────────────────────────────────────────── */
function updateAlertBanner() {
    if (alertDismissed) return;
    const alerts = medicines.filter(m => { const d = daysDiff(m.expiry); return m.qty < 10 || d <= 7; });
    const banner = document.getElementById('alert-banner'), items = document.getElementById('alert-items');
    if (!banner || !items) return;
    if (!alerts.length) { banner.classList.add('hidden'); return; }
    banner.classList.remove('hidden');
    items.innerHTML = alerts.map(m => {
        const d = daysDiff(m.expiry), isEx = d <= 7;
        const cls = isEx ? 'alert-med-chip chip-expired' : 'alert-med-chip';
        const lbl = (m.qty < 10 && isEx) ? `${m.name} (Low & Expiring)` : m.qty < 10 ? `${m.name} (Only ${m.qty} left)` : `${m.name} (Expires in ${d}d)`;
        return `<span class="${cls}">${lbl}</span>`;
    }).join('');
}
document.getElementById('alert-dismiss').addEventListener('click', () => {
    alertDismissed = true; document.getElementById('alert-banner').classList.add('hidden');
});

/* ── SUPPLIER / STATUS / SORT FILTERS ───────────────────────── */
function updateSupplierFilter() {
    const sel = document.getElementById('filter-supplier'); if (!sel) return;
    const s = [...new Set(medicines.map(m => m.supplier).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All Suppliers</option>' + s.map(x => `<option value="${x}">${x}</option>`).join('');
    sel.value = activeSupplier;
}
document.getElementById('filter-supplier').addEventListener('change', e => { activeSupplier = e.target.value; renderMedicines(searchBar.value); });
document.getElementById('filter-status').addEventListener('change', e => { activeStatus = e.target.value; renderMedicines(searchBar.value); });
document.getElementById('sort-select').addEventListener('change', e => { activeSortKey = e.target.value; renderMedicines(searchBar.value); });
document.querySelectorAll('.cat-filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.cat-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeCatFilter = pill.getAttribute('data-cat');
        renderMedicines(searchBar.value);
    });
});

/* ── VIEW TOGGLE (grid / list) ───────────────────────────────── */
(function setupViewToggle() {
    const toolbar = document.querySelector('.inv-toolbar');
    if (!toolbar) return;

    const wrap = document.createElement('div');
    wrap.className = 'view-toggle-wrap';
    wrap.style.marginLeft = '8px';
    wrap.innerHTML = `
        <button id="view-grid-btn" class="view-toggle-btn active-view" title="Grid view (G)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
        </button>
        <button id="view-list-btn" class="view-toggle-btn" title="List view (L)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <circle cx="3" cy="6" r="1.2" fill="currentColor"/>
                <circle cx="3" cy="12" r="1.2" fill="currentColor"/>
                <circle cx="3" cy="18" r="1.2" fill="currentColor"/>
            </svg>
        </button>`;
    toolbar.appendChild(wrap);

    const invList = document.getElementById('inventory-list');
    const gridBtn = document.getElementById('view-grid-btn');
    const listBtn = document.getElementById('view-list-btn');

    function setView(isList) {
        if (!invList || !gridBtn || !listBtn) return;
        invList.classList.toggle('list-view', isList);
        listBtn.classList.toggle('active-view', isList);
        gridBtn.classList.toggle('active-view', !isList);
        try { localStorage.setItem('mt_view', isList ? 'list' : 'grid'); } catch(e) {}
    }

    gridBtn.addEventListener('click', () => setView(false));
    listBtn.addEventListener('click', () => setView(true));
    try { if (localStorage.getItem('mt_view') === 'list') setView(true); } catch(e) {}

    // Keyboard: G = grid, L = list
    document.addEventListener('keydown', e => {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.key === 'g' || e.key === 'G') setView(false);
        if (e.key === 'l' || e.key === 'L') setView(true);
    });
})();

/* ── SEARCH ──────────────────────────────────────────────────── */
searchBar.addEventListener('input', e => renderMedicines(e.target.value));

/* ── ADD MEDICINE ────────────────────────────────────────────── */
fileInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        imagePreview.src = ev.target.result;
        imagePreview.classList.remove('hidden');
        fileUploadContent.classList.add('hidden');
    };
    r.readAsDataURL(f);
});

addMedForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = document.getElementById('med-name').value.trim();
    const batch    = document.getElementById('med-batch').value.trim();
    const qty      = parseInt(document.getElementById('med-qty').value);
    const expiry   = document.getElementById('med-expiry').value;
    const category = document.getElementById('med-category').value;
    const supplier = (document.getElementById('med-supplier')?.value || '').trim();
    const imgFile  = fileInput.files[0];

    if (!name || !batch || !qty || !expiry || !category) { showToast('Please fill in all required fields.'); return; }
    showToast('Saving medicine...');

    const savePayload = async (image) => {
        const { ok, error } = await api('POST', '/api/medicines', { name, batch, qty, expiry, category, supplier, image });
        if (ok) {
            await loadMedicines();
            addMedForm.reset();
            document.getElementById('med-category').value = '';
            imagePreview.classList.add('hidden'); imagePreview.src = '';
            fileUploadContent.classList.remove('hidden');
            showToast(`"${name}" added to inventory!`);
            setTimeout(() => document.querySelector('[data-target="page-inventory"]').click(), 600);
        } else showToast(error?.message || 'Could not save medicine.');
    };

    if (imgFile) {
        const r = new FileReader();
        r.onload = ev => savePayload(ev.target.result);
        r.readAsDataURL(imgFile);
    } else {
        await savePayload(null);
    }
});

/* ── DELETE ──────────────────────────────────────────────────── */
let pendingDeleteId = null, pendingDeleteName = '';
window.confirmDelete = function(id, name) {
    pendingDeleteId = id; pendingDeleteName = name;
    document.getElementById('delete-med-name').textContent = '"' + name + '"';
    document.getElementById('delete-modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('delete-modal').classList.add('modal-in'), 10);
};
function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('modal-in');
    setTimeout(() => document.getElementById('delete-modal-overlay').classList.add('hidden'), 220);
    pendingDeleteId = null;
}
document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
document.getElementById('delete-modal-close').addEventListener('click', closeDeleteModal);
document.getElementById('delete-modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('delete-modal-overlay')) closeDeleteModal(); });
document.getElementById('delete-confirm-btn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const { ok, error } = await api('DELETE', `/api/medicines/${pendingDeleteId}`);
    if (ok) { await loadMedicines(); showToast(`"${pendingDeleteName}" removed.`); closeDeleteModal(); }
    else showToast(error?.message || 'Could not delete medicine.');
});

/* ── EDIT ────────────────────────────────────────────────────── */
window.openEditModal = function(id) {
    const med = medicines.find(m => m.id === id); if (!med) return;
    document.getElementById('edit-index').value  = id;
    document.getElementById('edit-name').value   = med.name;
    document.getElementById('edit-batch').value  = med.batch;
    document.getElementById('edit-qty').value    = med.qty;
    document.getElementById('edit-expiry').value = med.expiry;
    document.getElementById('edit-modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('edit-modal').classList.add('modal-in'), 10);
};
function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('modal-in');
    setTimeout(() => document.getElementById('edit-modal-overlay').classList.add('hidden'), 220);
}
document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('edit-modal-overlay')) closeEditModal(); });
document.getElementById('edit-med-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id     = document.getElementById('edit-index').value;
    const name   = document.getElementById('edit-name').value.trim();
    const batch  = document.getElementById('edit-batch').value.trim();
    const qty    = parseInt(document.getElementById('edit-qty').value);
    const expiry = document.getElementById('edit-expiry').value;
    const med    = medicines.find(m => m.id === id);
    const { ok, error } = await api('PUT', `/api/medicines/${id}`, { name, batch, qty, expiry, category: med?.category || 'Other', supplier: med?.supplier || '' });
    if (ok) { await loadMedicines(); showToast(`"${name}" updated!`); closeEditModal(); }
    else showToast(error?.message || 'Could not update.');
});

/* ── NOTIFICATIONS ───────────────────────────────────────────── */
document.getElementById('notify-btn').addEventListener('click', async () => {
    if (!('Notification' in window)) { showToast('Notifications not supported.'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') { showToast('Notifications enabled! ✅'); document.getElementById('notify-btn').classList.add('notify-active'); fireExpiryNotifications(); }
    else showToast('Permission denied.');
});
function fireExpiryNotifications() {
    if (Notification.permission !== 'granted') return;
    const a = medicines.filter(m => { const d = daysDiff(m.expiry); return d <= 30 && d > 0; });
    if (!a.length) { new Notification('MediTrack ✅', { body: 'All medicines are safe!' }); return; }
    a.slice(0, 5).forEach(m => { const d = daysDiff(m.expiry); new Notification(`⚠️ ${m.name}`, { body: `Expires in ${d} day${d !== 1 ? 's' : ''} — Batch: ${m.batch}` }); });
}

/* ── CHARTS ──────────────────────────────────────────────────── */
let chartStock = null, chartExpiry = null, chartHealth = null;
function renderCharts() {
    const has = medicines.length > 0;
    ['chart-stock-empty','chart-expiry-empty','chart-health-empty'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', has); });
    ['chart-stock','chart-expiry','chart-stock-health'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = has ? 'block' : 'none'; });
    if (!has) return;

    const sc = document.getElementById('chart-stock');
    if (sc) {
        if (chartStock) chartStock.destroy();
        const t = [...medicines].sort((a,b) => b.qty - a.qty).slice(0, 10);
        chartStock = new Chart(sc, { type:'bar', data: { labels: t.map(m => m.name.length > 14 ? m.name.slice(0,14) + '…' : m.name), datasets: [{ label:'Quantity', data: t.map(m => m.qty), backgroundColor: t.map(m => m.qty < 10 ? 'rgba(251,140,0,0.85)' : 'rgba(22,104,245,0.8)'), borderRadius: 6, borderSkipped: false }] }, options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ display:false } }, y:{ grid:{ color:'rgba(0,0,0,0.05)' }, beginAtZero:true } } } });
    }
    const ec = document.getElementById('chart-expiry');
    if (ec) {
        if (chartExpiry) chartExpiry.destroy();
        let exp = 0, sn = 0, v = 0;
        medicines.forEach(m => { const d = daysDiff(m.expiry); if (d <= 0) exp++; else if (d <= 30) sn++; else v++; });
        chartExpiry = new Chart(ec, { type:'doughnut', data: { labels:['Safe','Expiring Soon','Expired'], datasets:[{ data:[v,sn,exp], backgroundColor:['rgba(46,213,115,0.85)','rgba(251,140,0,0.85)','rgba(245,54,92,0.85)'], borderWidth:0, hoverOffset:6 }] }, options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom' } } } });
    }
    const hc = document.getElementById('chart-stock-health');
    if (hc) {
        if (chartHealth) chartHealth.destroy();
        const lw = medicines.filter(m => m.qty < 10).length;
        chartHealth = new Chart(hc, { type:'doughnut', data: { labels:['Normal Stock','Low Stock'], datasets:[{ data:[medicines.length - lw, lw], backgroundColor:['rgba(22,104,245,0.85)','rgba(251,140,0,0.85)'], borderWidth:0, hoverOffset:6 }] }, options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom' } } } });
    }
}

/* ── EXPORT PDF ──────────────────────────────────────────────── */
// Overview page export shortcut
const ovExportBtn = document.getElementById('ov-export-btn');
if (ovExportBtn) ovExportBtn.addEventListener('click', () => document.getElementById('export-pdf-btn').click());

document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (!medicines.length) { showToast('No medicines to export.'); return; }
    const { jsPDF } = window.jspdf, doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(22, 104, 245);
    doc.text('MediTrack — Inventory Report', 14, 18);
    doc.setFontSize(10); doc.setTextColor(107, 114, 128);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 26);
    doc.text(`Total: ${medicines.length}`, 14, 32);
    doc.autoTable({ startY:38, head:[['#','Name','Batch','Category','Supplier','Qty','Expiry','Status']], body: medicines.map((m,i) => { const d = daysDiff(m.expiry); return [i+1, m.name, m.batch, m.category||'—', m.supplier||'—', m.qty, m.expiry, d<=0?'Expired':d<=30?'Expiring(30d)':d<=60?'Expiring(60d)':d<=90?'Expiring(90d)':'Safe']; }), styles:{ fontSize:8 }, headStyles:{ fillColor:[22,104,245], textColor:255 } });
    doc.save('meditrack-inventory.pdf');
    showToast('PDF exported!');
});

/* ── EXPORT EXCEL ────────────────────────────────────────────── */
document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (!medicines.length) { showToast('No medicines to export.'); return; }
    const data = medicines.map((m,i) => { const d = daysDiff(m.expiry); return { '#':i+1, 'Medicine Name':m.name, 'Batch':m.batch, 'Category':m.category||'—', 'Supplier':m.supplier||'—', 'Quantity':m.qty, 'Expiry':m.expiry, 'Status':d<=0?'Expired':d<=30?'Expiring Soon':'Safe' }; });
    const ws = XLSX.utils.json_to_sheet(data), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, 'meditrack-inventory.xlsx');
    showToast('Excel exported!');
});

/* ── EXPORT CSV ──────────────────────────────────────────────── */
document.getElementById('export-csv-btn').addEventListener('click', () => {
    if (!medicines.length) { showToast('No medicines to export.'); return; }
    const h = ['#','Name','Batch','Category','Supplier','Qty','Expiry','Status'];
    const rows = medicines.map((m,i) => { const d = daysDiff(m.expiry), st = d<=0?'Expired':d<=30?'Expiring Soon':'Safe'; return [i+1,`"${m.name}"`,m.batch,m.category,`"${m.supplier||''}"`,m.qty,m.expiry,st].join(','); });
    const csv = [h.join(','), ...rows].join('\n'), blob = new Blob([csv], { type:'text/csv' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'meditrack-inventory.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported!');
});

/* ── INVOICE ─────────────────────────────────────────────────── */
function buildInvoiceHTML() {
    const dt = new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });
    const e30 = medicines.filter(m => { const d = daysDiff(m.expiry); return d > 0 && d <= 30; }).length;
    const lc  = medicines.filter(m => m.qty < 10).length;
    const rows = medicines.map((m,i) => {
        const d = daysDiff(m.expiry);
        const sc = d<=0?'invoice-status-exp':d<=30?'invoice-status-warn':'invoice-status-ok';
        const st = d<=0?'Expired':d<=30?'Expiring Soon':'Safe';
        return `<tr><td>${i+1}</td><td>${m.name}</td><td>${m.batch}</td><td>${m.category||'—'}</td><td>${m.supplier||'—'}</td><td>${m.qty}</td><td>${m.expiry}</td><td class="${sc}">${st}</td></tr>`;
    }).join('');
    return `<div class="invoice-header">
        <div class="invoice-brand"><div class="invoice-brand-icon"><svg width="20" height="20" viewBox="0 0 32 32" fill="none"><rect x="13" y="2" width="6" height="28" rx="3" fill="white"/><rect x="2" y="13" width="28" height="6" rx="3" fill="white"/></svg></div>
        <div><h2>MediTrack</h2><p>Pharmacy Inventory Manager</p></div></div>
        <div class="invoice-meta"><strong>Inventory Invoice</strong>Date: ${dt}<br>User: ${currentUserEmail}</div></div>
        <div class="invoice-summary-row">
            <div class="invoice-summary-box"><div class="isb-val">${medicines.length}</div><div class="isb-label">Total Medicines</div></div>
            <div class="invoice-summary-box"><div class="isb-val" style="color:var(--warning)">${e30}</div><div class="isb-label">Expiring &lt;30d</div></div>
            <div class="invoice-summary-box"><div class="isb-val" style="color:var(--danger)">${lc}</div><div class="isb-label">Low Stock</div></div>
        </div>
        <table class="invoice-table"><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Category</th><th>Supplier</th><th>Qty</th><th>Expiry</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <div class="invoice-footer"><span>Generated by MediTrack (.NET)</span><span>${dt}</span></div>`;
}
document.getElementById('export-invoice-btn').addEventListener('click', () => {
    if (!medicines.length) { showToast('No medicines.'); return; }
    document.getElementById('invoice-preview').innerHTML = buildInvoiceHTML();
    document.getElementById('invoice-modal-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('invoice-modal').classList.add('modal-in'), 10);
});
function closeInvoiceModal() {
    document.getElementById('invoice-modal').classList.remove('modal-in');
    setTimeout(() => document.getElementById('invoice-modal-overlay').classList.add('hidden'), 220);
}
document.getElementById('invoice-modal-close').addEventListener('click', closeInvoiceModal);
document.getElementById('invoice-cancel-btn').addEventListener('click', closeInvoiceModal);
document.getElementById('invoice-modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('invoice-modal-overlay')) closeInvoiceModal(); });
document.getElementById('invoice-print-btn').addEventListener('click', () => {
    const pw = window.open('', '_blank', 'width=950,height=750');
    pw.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;padding:2rem;color:#111}.invoice-header{display:flex;justify-content:space-between;padding-bottom:1rem;border-bottom:2px solid #1668f5;margin-bottom:1.25rem}.invoice-brand{display:flex;align-items:center;gap:.6rem}.invoice-brand-icon{width:36px;height:36px;background:#1668f5;border-radius:8px;display:flex;align-items:center;justify-content:center}.invoice-brand h2{font-size:1.3rem;font-weight:800;color:#1668f5}.invoice-meta{text-align:right;font-size:.8rem;color:#6b7280}.invoice-summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1.25rem}.invoice-summary-box{border:1px solid #e5e7eb;border-radius:10px;padding:.75rem;text-align:center;background:#f9fafb}.isb-val{font-size:1.5rem;font-weight:800;color:#1668f5}.isb-label{font-size:.7rem;color:#9ca3af}table{width:100%;border-collapse:collapse;font-size:.78rem}th{background:#1668f5;color:#fff;padding:.45rem .6rem;text-align:left}td{padding:.4rem .6rem;border-bottom:1px solid #f3f4f6}tr:nth-child(even) td{background:#f9fafb}.invoice-status-ok{color:#15803d;font-weight:600}.invoice-status-warn{color:#fb8c00;font-weight:600}.invoice-status-exp{color:#f5365c;font-weight:600}.invoice-footer{display:flex;justify-content:space-between;padding-top:.75rem;border-top:1px solid #e5e7eb;margin-top:1rem;font-size:.72rem;color:#9ca3af}</style></head><body>${buildInvoiceHTML()}<script>window.onload=()=>window.print()<\/script></body></html>`);
    pw.document.close();
    showToast('Invoice sent to printer!');
});

/* ── AI LOOKUP ───────────────────────────────────────────────── */
window.triggerAISearch = function(name) { document.getElementById('ai-medicine-input').value = name; runAILookup(name); };
document.getElementById('ai-search-btn').addEventListener('click', () => { const n = document.getElementById('ai-medicine-input').value.trim(); if (!n) { showToast('Please enter a medicine name.'); return; } runAILookup(n); });
document.getElementById('ai-medicine-input').addEventListener('keydown', e => { if (e.key === 'Enter') { const n = e.target.value.trim(); if (n) runAILookup(n); } });

async function runAILookup(mn) {
    const pl = document.getElementById('ai-placeholder');
    const ld = document.getElementById('ai-loading');
    const ct = document.getElementById('ai-result-content');
    pl.classList.add('hidden'); ld.classList.remove('hidden'); ct.classList.add('hidden');
    try {
        const enc = encodeURIComponent(mn); let drug = null;
        for (const url of [
            `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${enc}"&limit=1`,
            `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${enc}"&limit=1`,
            `https://api.fda.gov/drug/label.json?search="${enc}"&limit=1`
        ]) {
            const r = await fetch(url), d = await r.json();
            if (d.results?.length) { drug = d.results[0]; break; }
        }
        if (!drug) throw new Error('NOT_FOUND');
        const o = drug.openfda || {};
        const name = o.brand_name?.[0] || o.generic_name?.[0] || mn;
        const gen  = o.generic_name?.[0] || '';
        const mfr  = o.manufacturer_name?.[0] || 'N/A';
        const cat  = o.pharm_class_epc?.[0] || o.product_type?.[0] || 'Drug';
        const route = o.route?.[0] || 'See label';
        const ex = f => f ? (Array.isArray(f) ? f[0] : f).replace(/\s+/g,' ').trim() : null;
        const el = (f, n=4) => { if (!f) return null; const t = Array.isArray(f) ? f[0] : f; return t.split(/[\n•]|\d+\.\s+/).map(l => l.replace(/\s+/g,' ').trim()).filter(l => l.length > 15).slice(0, n); };
        const sh = (t, m=220) => !t ? 'See package insert.' : t.length > m ? t.slice(0, m) + '…' : t;
        const uses   = el(drug.indications_and_usage) || el(drug.purpose) || ['Refer to prescribing information'];
        const sides  = el(drug.adverse_reactions) || ['Refer to package insert'];
        const warns  = el(drug.warnings) || ['Refer to package insert'];
        const si     = sh(ex(drug.storage_and_handling));
        const dosage = sh(ex(drug.dosage_and_administration) || 'Refer to prescribing information');
        ct.innerHTML = `
            <div class="ai-result-name">
                <span class="ai-result-badge">${cat}</span>
                <h2>${name}</h2>
                ${gen && gen.toLowerCase() !== name.toLowerCase() ? `<p style="color:var(--text-muted);font-size:13px;margin-top:4px;">Generic: ${gen}</p>` : ''}
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
                <span style="font-size:12px;background:var(--primary-glow);color:var(--primary);padding:4px 10px;border-radius:20px;">🧪 ${route}</span>
                <span style="font-size:12px;background:var(--primary-glow);color:var(--primary);padding:4px 10px;border-radius:20px;">🏭 ${mfr}</span>
            </div>
            <div class="ai-info-grid">
                <div class="ai-info-block"><div class="ai-info-label">Uses</div><ul>${uses.map(u => `<li>${u}</li>`).join('')}</ul></div>
                <div class="ai-info-block"><div class="ai-info-label">Dosage</div><p>${dosage}</p></div>
                <div class="ai-info-block ai-info-warn"><div class="ai-info-label">Adverse Reactions</div><ul>${sides.map(s => `<li>${s}</li>`).join('')}</ul></div>
                <div class="ai-info-block ai-info-danger"><div class="ai-info-label">Warnings</div><ul>${warns.map(w => `<li>${w}</li>`).join('')}</ul></div>
                <div class="ai-info-block ai-info-storage"><div class="ai-info-label">Storage</div><p>${si}</p></div>
            </div>
            <p class="ai-disclaimer">📋 Data from US FDA OpenFDA. Always verify with official prescribing information.</p>`;
        ld.classList.add('hidden'); ct.classList.remove('hidden');
    } catch(err) {
        ld.classList.add('hidden');
        ct.innerHTML = err.message === 'NOT_FOUND'
            ? `<div class="ai-error"><p><strong>"${mn}" not found in FDA database.</strong></p><p style="margin-top:6px;font-size:13px;">Try the generic name, e.g. "acetaminophen" instead of "Crocin".</p></div>`
            : `<div class="ai-error"><p>Could not fetch medicine info. Check your internet connection.</p></div>`;
        ct.classList.remove('hidden');
    }
}

/* ── PROFILE SETUP ───────────────────────────────────────────── */
document.getElementById('profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('profile-name').value.trim();
    const shop    = document.getElementById('profile-shop').value.trim();
    const phone   = document.getElementById('profile-phone').value.trim();
    const type    = document.getElementById('profile-type').value;
    const address = document.getElementById('profile-address').value.trim();
    const gst     = document.getElementById('profile-gst').value.trim();
    let ok2 = true;
    if (!name)  { document.getElementById('profile-name-error').style.display  = 'block'; ok2 = false; } else document.getElementById('profile-name-error').style.display  = 'none';
    if (!shop)  { document.getElementById('profile-shop-error').style.display  = 'block'; ok2 = false; } else document.getElementById('profile-shop-error').style.display  = 'none';
    if (!phone || !/^\d{10}$/.test(phone)) { document.getElementById('profile-phone-error').style.display = 'block'; ok2 = false; } else document.getElementById('profile-phone-error').style.display = 'none';
    if (!type)  { document.getElementById('profile-type-error').style.display  = 'block'; ok2 = false; } else document.getElementById('profile-type-error').style.display  = 'none';
    if (!ok2) return;
    const { ok, error } = await api('POST', '/api/profile', { name, shopName:shop, phone, shopType:type, address, gst });
    if (ok) { currentProfile = { name, shopName:shop, phone, shopType:type, address, gst }; showToast('Profile saved! Welcome 🎉'); await enterDashboard(currentUserEmail); }
    else showToast(error?.message || 'Could not save profile.');
});

/* ── PROFILE VIEW ────────────────────────────────────────────── */
function renderProfileView() {
    if (!currentProfile) return;
    const p = currentProfile;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '—'; };
    set('profile-view-name', p.name); set('profile-view-shop', p.shopName); set('profile-view-phone', p.phone);
    set('profile-view-email', currentUserEmail); set('profile-view-address', p.address); set('profile-view-gst', p.gst);
    const te = document.getElementById('profile-view-type');
    if (te) { te.textContent = p.shopType || ''; te.style.display = p.shopType ? 'inline-flex' : 'none'; }
    const ae = document.getElementById('profile-hero-avatar');
    if (ae) ae.textContent = p.name ? p.name.charAt(0).toUpperCase() : '?';
}
document.getElementById('edit-profile-btn').addEventListener('click', () => {
    if (!currentProfile) return;
    const p = currentProfile;
    document.getElementById('edit-profile-name').value    = p.name || '';
    document.getElementById('edit-profile-shop').value    = p.shopName || '';
    document.getElementById('edit-profile-phone').value   = p.phone || '';
    document.getElementById('edit-profile-type').value    = p.shopType || '';
    document.getElementById('edit-profile-address').value = p.address || '';
    document.getElementById('edit-profile-gst').value     = p.gst || '';
    document.getElementById('profile-view-mode').classList.add('hidden');
    document.getElementById('profile-edit-mode').classList.remove('hidden');
    document.getElementById('edit-profile-btn').classList.add('hidden');
});
document.getElementById('cancel-edit-profile-btn').addEventListener('click', () => {
    document.getElementById('profile-edit-mode').classList.add('hidden');
    document.getElementById('profile-view-mode').classList.remove('hidden');
    document.getElementById('edit-profile-btn').classList.remove('hidden');
});
document.getElementById('profile-edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name    = document.getElementById('edit-profile-name').value.trim();
    const shop    = document.getElementById('edit-profile-shop').value.trim();
    const phone   = document.getElementById('edit-profile-phone').value.trim();
    const type    = document.getElementById('edit-profile-type').value;
    const address = document.getElementById('edit-profile-address').value.trim();
    const gst     = document.getElementById('edit-profile-gst').value.trim();
    if (!name || !shop || !phone || !type) { showToast('Please fill all required fields.'); return; }
    if (!/^\d{10}$/.test(phone)) { showToast('Please enter a valid 10-digit phone number.'); return; }
    const { ok, error } = await api('PUT', '/api/profile', { name, shopName:shop, phone, shopType:type, address, gst });
    if (ok) {
        currentProfile = { ...currentProfile, name, shopName:shop, phone, shopType:type, address, gst };
        document.getElementById('user-avatar').textContent = name.charAt(0).toUpperCase();
        const se = document.getElementById('user-shop-display'); if (se) se.textContent = shop;
        renderProfileView();
        document.getElementById('profile-edit-mode').classList.add('hidden');
        document.getElementById('profile-view-mode').classList.remove('hidden');
        document.getElementById('edit-profile-btn').classList.remove('hidden');
        showToast('Profile updated! ✅');
    } else showToast(error?.message || 'Could not update profile.');
});

/* ── ANIMATIONS & POLISH ─────────────────────────────────────── */
function animateCounter(el, target, dur = 800) {
    if (!el) return;
    const start = performance.now(), ev = parseInt(target) || 0;
    if (!ev) { el.textContent = '0'; return; }
    function tick(now) {
        const prog = Math.min((now - start) / dur, 1), ease = 1 - Math.pow(1 - prog, 3);
        el.textContent = Math.round(ev * ease);
        if (prog < 1) requestAnimationFrame(tick); else el.textContent = ev;
    }
    requestAnimationFrame(tick);
}

function initParticles() {
    const c = document.getElementById('dashboard-particles'); if (!c) return;
    c.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const dp = document.createElement('div');
        dp.className = 'dp';
        const sz = 60 + Math.random() * 140;
        dp.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${8+Math.random()*10}s;animation-delay:${Math.random()*6}s;`;
        c.appendChild(dp);
    }
}

// Nav ripple effect
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
        const r = document.createElement('span');
        r.className = 'ripple';
        const rect = item.getBoundingClientRect(), sz = Math.max(rect.width, rect.height);
        r.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-rect.left-sz/2}px;top:${e.clientY-rect.top-sz/2}px;position:absolute;`;
        item.appendChild(r);
        setTimeout(() => r.remove(), 600);
    });
});

// Drag-over on file upload
const ua = document.querySelector('.file-upload-area');
if (ua) {
    ua.addEventListener('dragover', e => { e.preventDefault(); ua.classList.add('drag-over'); });
    ['dragleave','drop'].forEach(ev => ua.addEventListener(ev, () => ua.classList.remove('drag-over')));
}

// Keyboard shortcuts: Ctrl+K = search, Esc = close modals
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const s = document.getElementById('search-bar');
        if (s) { s.focus(); s.select(); }
    }
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
            const btn = m.querySelector('.modal-close,[id$="-modal-close"]');
            if (btn) btn.click();
        });
    }
});
