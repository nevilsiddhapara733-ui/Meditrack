// MediTrack script.js — ASP.NET Core Edition
// Firebase completely replaced with fetch() calls to .NET API controllers

async function api(method, url, body) {
    try {
        const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(url, opts);
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return { ok: true, status: res.status, data, error: null };
        } else {
            // Try to parse JSON error from server, fallback to status text
            const errBody = await res.text().catch(() => '');
            let errMsg = 'HTTP ' + res.status + ': ' + res.statusText;
            try { const j = JSON.parse(errBody); errMsg = j.message || j.title || errMsg; } catch(e) {}
            return { ok: false, status: res.status, data: null, error: { message: errMsg } };
        }
    } catch (networkErr) {
        return { ok: false, status: 0, data: null, error: { message: 'Network error: ' + networkErr.message } };
    }
}

const loginPage=document.getElementById('login-page'),dashboardPage=document.getElementById('dashboard-page'),
loginForm=document.getElementById('login-form'),logoutBtn=document.getElementById('logout-btn'),
emailInput=document.getElementById('email'),passwordInput=document.getElementById('password'),
emailError=document.getElementById('email-error'),passError=document.getElementById('pass-error'),
navItems=document.querySelectorAll('.nav-item'),pageSections=document.querySelectorAll('.page-section'),
addMedForm=document.getElementById('add-med-form'),inventoryList=document.getElementById('inventory-list'),
searchBar=document.getElementById('search-bar'),totalCountEl=document.getElementById('total-count'),
expiringCountEl=document.getElementById('expiring-count'),lowStockCountEl=document.getElementById('low-stock-count'),
emptyState=document.getElementById('empty-state'),searchCount=document.getElementById('search-count'),
fileInput=document.getElementById('med-image'),imagePreview=document.getElementById('image-preview'),
fileUploadContent=document.getElementById('file-upload-content'),profilePage=document.getElementById('profile-page');

let currentUserEmail='',currentProfile=null,medicines=[],activeCatFilter='all',
    activeStatus='',activeSupplier='',activeSortKey='default',alertDismissed=false;

function showToast(msg){const t=document.getElementById('toast');document.getElementById('toast-msg').textContent=msg;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3000);}
function setHeaderDate(){const el=document.getElementById('header-date');if(el)el.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});}
function greetUser(){const h=new Date().getHours(),el=document.querySelector('#page-overview .page-header h1');if(el)el.textContent=h<12?'Good morning 👋':h<17?'Good afternoon 👋':'Good evening 👋';}
function daysDiff(expiry){return Math.ceil((new Date(expiry)-new Date())/86400000);}

function validateEmail(e){if(/[A-Z]/.test(e))return 'Email must not contain capital letters.';if(!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,10}$/.test(e))return 'Please enter a valid email address.';return null;}
function validatePassword(p){if(p.length<8)return 'Password must be at least 8 characters.';if(!/[A-Z]/.test(p))return 'Must have uppercase letter.';if(!/[a-z]/.test(p))return 'Must have lowercase letter.';if(!/[0-9]/.test(p))return 'Must have a number.';if(!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p))return 'Must have a special character.';return null;}
function setFieldError(inp,err,msg){if(msg){err.textContent=msg;err.style.display='block';inp.classList.add('input-error');return false;}else{err.style.display='none';inp.classList.remove('input-error');return true;}}
function getPasswordStrength(p){let s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[A-Z]/.test(p))s++;if(/[a-z]/.test(p))s++;if(/[0-9]/.test(p))s++;if(/[!@#$%^&*]/.test(p))s++;return s<=2?{label:'Weak',cls:'strength-weak',width:'25%'}:s<=4?{label:'Medium',cls:'strength-medium',width:'60%'}:{label:'Strong',cls:'strength-strong',width:'100%'};}

(function(){if(localStorage.getItem('meditrack_dark')==='1')document.body.classList.add('dark-mode');updateDarkIcon();})();
function updateDarkIcon(){const btn=document.getElementById('dark-toggle'),dark=document.body.classList.contains('dark-mode');btn.innerHTML=dark?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg><span>Light Mode</span>`:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>Dark Mode</span>`;}
document.getElementById('dark-toggle').addEventListener('click',()=>{document.body.classList.toggle('dark-mode');localStorage.setItem('meditrack_dark',document.body.classList.contains('dark-mode')?'1':'0');updateDarkIcon();});

// AUTH STATE — replaces firebase.auth().onAuthStateChanged()
async function checkAuthState(){
    const{ok,data}=await api('GET','/api/auth/me');
    if(ok&&data?.authenticated){
        currentUserEmail=data.email;
        const pr=await api('GET','/api/profile');
        if(pr.ok){currentProfile=pr.data;await enterDashboard(data.email);}
        else if(pr.status===404){loginPage.classList.add('hidden');dashboardPage.classList.add('hidden');profilePage.classList.remove('hidden');}
        else{await enterDashboard(data.email);}
    }else{showLoginPage();}
}
function showLoginPage(){currentUserEmail='';currentProfile=null;medicines=[];inventoryList.innerHTML='';dashboardPage.classList.add('hidden');profilePage.classList.add('hidden');loginPage.classList.remove('hidden');}
checkAuthState();

window.switchTab=function(tab){const lw=document.getElementById('login-form-wrap'),rw=document.getElementById('register-form-wrap'),tl=document.getElementById('tab-login'),tr=document.getElementById('tab-register');if(tab==='login'){lw.classList.remove('hidden');rw.classList.add('hidden');tl.classList.add('active');tr.classList.remove('active');}else{lw.classList.add('hidden');rw.classList.remove('hidden');tl.classList.remove('active');tr.classList.add('active');}};

async function enterDashboard(email){
    currentUserEmail=email;
    const avatarEl=document.getElementById('user-avatar'),shopEl=document.getElementById('user-shop-display'),emailEl=document.getElementById('user-email-display');
    if(currentProfile){avatarEl.textContent=currentProfile.name?currentProfile.name.charAt(0).toUpperCase():email.charAt(0).toUpperCase();if(shopEl)shopEl.textContent=currentProfile.shopName||'';if(emailEl)emailEl.textContent=email;renderProfileView();}
    else{avatarEl.textContent=email.charAt(0).toUpperCase();if(shopEl)shopEl.textContent='';if(emailEl)emailEl.textContent=email;}
    loginPage.classList.add('hidden');profilePage.classList.add('hidden');dashboardPage.classList.remove('hidden');
    greetUser();setHeaderDate();alertDismissed=false;
    await loadMedicines();initParticles();
    if(Notification.permission==='granted'){document.getElementById('notify-btn').classList.add('notify-active');fireExpiryNotifications();}
}

// LOGIN
loginForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const ev=emailInput.value.trim(),pv=passwordInput.value;
    const eo=setFieldError(emailInput,emailError,validateEmail(ev)),po=setFieldError(passwordInput,passError,pv.length<1?'Please enter your password.':null);
    if(!eo||!po)return;
    const{ok,error}=await api('POST','/api/auth/login',{email:ev.toLowerCase(),password:pv});
    if(ok){loginForm.reset();clearStrengthBar('login-strength');await checkAuthState();}
    else showToast(error?.message||'Login failed. Please try again.');
});
emailInput.addEventListener('input',()=>{const v=emailInput.value.trim();if(v)setFieldError(emailInput,emailError,validateEmail(v));else{emailError.style.display='none';emailInput.classList.remove('input-error');}});
passwordInput.addEventListener('input',()=>{passError.style.display='none';passwordInput.classList.remove('input-error');});

// REGISTER
document.getElementById('register-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const ev=document.getElementById('reg-email').value.trim(),pv=document.getElementById('reg-password').value,cv=document.getElementById('reg-confirm').value;
    const ee=document.getElementById('reg-email-error'),pe=document.getElementById('reg-pass-error'),ce=document.getElementById('reg-confirm-error');
    const eo=setFieldError(document.getElementById('reg-email'),ee,validateEmail(ev)),po=setFieldError(document.getElementById('reg-password'),pe,validatePassword(pv)),co=setFieldError(document.getElementById('reg-confirm'),ce,pv!==cv?'Passwords do not match.':null);
    if(!eo||!po||!co)return;
    const{ok,error}=await api('POST','/api/auth/register',{email:ev.toLowerCase(),password:pv,confirmPassword:cv});
    if(ok){document.getElementById('register-form').reset();clearStrengthBar('reg-strength');showToast('Account created! Welcome 🎉');await checkAuthState();}
    else showToast(error?.message||'Registration failed.');
});
document.getElementById('reg-email').addEventListener('input',()=>{const v=document.getElementById('reg-email').value.trim();if(v)setFieldError(document.getElementById('reg-email'),document.getElementById('reg-email-error'),validateEmail(v));else{document.getElementById('reg-email-error').style.display='none';document.getElementById('reg-email').classList.remove('input-error');}});
document.getElementById('reg-password').addEventListener('input',()=>{const v=document.getElementById('reg-password').value;updateStrengthBar('reg-strength',v);if(v)setFieldError(document.getElementById('reg-password'),document.getElementById('reg-pass-error'),validatePassword(v));else{document.getElementById('reg-pass-error').style.display='none';document.getElementById('reg-password').classList.remove('input-error');}});
document.getElementById('reg-confirm').addEventListener('input',()=>{const p=document.getElementById('reg-password').value,c=document.getElementById('reg-confirm').value;if(c)setFieldError(document.getElementById('reg-confirm'),document.getElementById('reg-confirm-error'),p!==c?'Passwords do not match.':null);else{document.getElementById('reg-confirm-error').style.display='none';document.getElementById('reg-confirm').classList.remove('input-error');}});
function updateStrengthBar(id,pw){const b=document.getElementById(id);if(!b)return;if(!pw){b.style.display='none';return;}const s=getPasswordStrength(pw);b.style.display='block';b.querySelector('.strength-fill').className='strength-fill '+s.cls;b.querySelector('.strength-fill').style.width=s.width;b.querySelector('.strength-label').textContent=s.label;}
function clearStrengthBar(id){const b=document.getElementById(id);if(b)b.style.display='none';}

// LOGOUT
logoutBtn.addEventListener('click',async()=>{await api('POST','/api/auth/logout');currentProfile=null;medicines=[];document.querySelector('[data-target="page-overview"]').click();showLoginPage();});

// NAVIGATION
navItems.forEach(item=>{item.addEventListener('click',()=>{navItems.forEach(n=>n.classList.remove('active'));pageSections.forEach(p=>p.classList.remove('active-page'));item.classList.add('active');document.getElementById(item.getAttribute('data-target')).classList.add('active-page');if(item.getAttribute('data-target')==='page-analytics')setTimeout(renderCharts,80);});});

// LOAD MEDICINES
async function loadMedicines(){
    const{ok,data}=await api('GET','/api/medicines');
    if(ok){medicines=data||[];renderMedicines();updateExpirySummary();updateSupplierFilter();}
    else{showToast('Could not load medicines.');medicines=[];renderMedicines();}
}

function getExpiryBadge(d){if(d<=0)return{cls:'status-expired',label:'Expired'};if(d<=30)return{cls:'status-warn',label:d+'d'};if(d<=60)return{cls:'status-warn60',label:d+'d'};if(d<=90)return{cls:'status-warn90',label:d+'d'};return{cls:'status-ok',label:'Safe'};}
function getExpiryPillClass(d){if(d<=0)return'med-expiry-pill expiry-expired';if(d<=30)return'med-expiry-pill expiring-soon';if(d<=60)return'med-expiry-pill expiring-60';if(d<=90)return'med-expiry-pill expiring-90';return'med-expiry-pill expiry-ok';}
const CAT_CLASSES={Antibiotic:'cat-antibiotic',Painkiller:'cat-painkiller',Vitamin:'cat-vitamin',Antidiabetic:'cat-antidiabetic',Cardiac:'cat-cardiac',Antacid:'cat-antacid',Antihistamine:'cat-antihistamine',Other:'cat-other'};

function getSortedFiltered(ft){
    let list=medicines.filter(med=>{
        const nm=!ft||med.name.toLowerCase().includes(ft.toLowerCase()),
              cm=activeCatFilter==='all'||med.category===activeCatFilter,
              sm=!activeSupplier||(med.supplier||'')===activeSupplier,d=daysDiff(med.expiry);
        let stm=true;
        if(activeStatus==='expired')stm=d<=0;else if(activeStatus==='30')stm=d>0&&d<=30;else if(activeStatus==='60')stm=d>0&&d<=60;else if(activeStatus==='90')stm=d>0&&d<=90;else if(activeStatus==='safe')stm=d>90;
        return nm&&cm&&sm&&stm;
    });
    if(activeSortKey==='name-asc')list.sort((a,b)=>a.name.localeCompare(b.name));else if(activeSortKey==='name-desc')list.sort((a,b)=>b.name.localeCompare(a.name));else if(activeSortKey==='expiry-asc')list.sort((a,b)=>new Date(a.expiry)-new Date(b.expiry));else if(activeSortKey==='expiry-desc')list.sort((a,b)=>new Date(b.expiry)-new Date(a.expiry));else if(activeSortKey==='qty-asc')list.sort((a,b)=>a.qty-b.qty);else if(activeSortKey==='qty-desc')list.sort((a,b)=>b.qty-a.qty);
    return list;
}

function renderMedicines(ft=''){
    inventoryList.innerHTML='';
    let e30=0,e60=0,e90=0,ls=0;
    medicines.forEach(m=>{const d=daysDiff(m.expiry);if(d>0&&d<=30)e30++;if(d>0&&d<=60)e60++;if(d>0&&d<=90)e90++;if(m.qty<10)ls++;});
    totalCountEl.textContent=medicines.length;expiringCountEl.textContent=e30;lowStockCountEl.textContent=ls;
    const el60=document.getElementById('expiring60-count'),el90=document.getElementById('expiring90-count');
    if(el60)el60.textContent=e60;if(el90)el90.textContent=e90;
    const filtered=getSortedFiltered(ft);
    filtered.forEach((med,i)=>{
        const d=daysDiff(med.expiry),badge=getExpiryBadge(d),pillCls=getExpiryPillClass(d),isLow=med.qty<10,
              catClass=CAT_CLASSES[med.category]||'cat-other',catLabel=med.category||'Other',
              safeId=med.id,safeName=med.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        inventoryList.insertAdjacentHTML('beforeend',`
            <div class="med-card" style="animation-delay:${i*0.04}s">
                <div class="med-image-wrap">
                    <img src="${med.image||'https://images.unsplash.com/photo-1584308666744-24d5e4a8389c?w=400&q=80'}" alt="${med.name}" class="med-image">
                    <div class="med-status-badge ${badge.cls}">${badge.label}</div>
                </div>
                <div class="med-details">
                    <div class="med-category-tag ${catClass}">${catLabel}</div>
                    <div class="med-title" title="${med.name}">${med.name}</div>
                    <div class="med-batch"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>${med.batch}${med.supplier?' &bull; <span style="color:var(--primary)">'+med.supplier+'</span>':''}</div>
                    <div class="med-meta-row">
                        <div class="${isLow?'med-qty-pill low-qty':'med-qty-pill'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>Qty: ${med.qty}</div>
                        <div class="${pillCls}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${med.expiry}</div>
                    </div>
                    <div class="card-actions">
                        <button class="edit-btn" onclick="openEditModal('${safeId}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
                        <button class="delete-btn" onclick="confirmDelete('${safeId}','${safeName}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/></svg>Remove</button>
                    </div>
                </div>
            </div>`);
    });
    emptyState.classList.toggle('hidden',filtered.length>0);
    searchCount.textContent=ft?`${filtered.length} result${filtered.length!==1?'s':''}`:'';
    updateExpirySummary();updateAlertBanner();
    ['total-count','expiring-count','low-stock-count','expiring60-count','expiring90-count'].forEach(id=>{const el=document.getElementById(id);if(el)animateCounter(el,el.textContent,700);});
}

function updateExpirySummary(){const c=document.getElementById('expiry-summary');if(!c)return;if(!medicines.length){c.innerHTML='<div class="empty-panel-msg">No medicines added yet.</div>';return;}const s=[...medicines].sort((a,b)=>new Date(a.expiry)-new Date(b.expiry)).slice(0,5);c.innerHTML=s.map(med=>{const d=daysDiff(med.expiry);return`<div class="expiry-row"><div><div class="expiry-row-name">${med.name}</div><div class="expiry-row-date">${med.expiry}</div></div><span class="${d<=30?'expiry-badge badge-warn':'expiry-badge badge-ok'}">${d<=0?'Expired':d<=30?d+'d left':'Safe'}</span></div>`;}).join('');}

function updateAlertBanner(){if(alertDismissed)return;const alerts=medicines.filter(m=>{const d=daysDiff(m.expiry);return m.qty<10||d<=7;});const banner=document.getElementById('alert-banner'),items=document.getElementById('alert-items');if(!banner||!items)return;if(!alerts.length){banner.classList.add('hidden');return;}banner.classList.remove('hidden');items.innerHTML=alerts.map(m=>{const d=daysDiff(m.expiry),isEx=d<=7,cls=isEx?'alert-med-chip chip-expired':'alert-med-chip',lbl=(m.qty<10&&isEx)?`${m.name} (Low & Expiring)`:m.qty<10?`${m.name} (Only ${m.qty} left)`:`${m.name} (Expires in ${d}d)`;return`<span class="${cls}">${lbl}</span>`;}).join('');}
document.getElementById('alert-dismiss').addEventListener('click',()=>{alertDismissed=true;document.getElementById('alert-banner').classList.add('hidden');});

function updateSupplierFilter(){const sel=document.getElementById('filter-supplier');if(!sel)return;const s=[...new Set(medicines.map(m=>m.supplier).filter(Boolean))].sort();sel.innerHTML='<option value="">All Suppliers</option>'+s.map(x=>`<option value="${x}">${x}</option>`).join('');sel.value=activeSupplier;}
document.getElementById('filter-supplier').addEventListener('change',e=>{activeSupplier=e.target.value;renderMedicines(searchBar.value);});
document.getElementById('filter-status').addEventListener('change',e=>{activeStatus=e.target.value;renderMedicines(searchBar.value);});
document.getElementById('sort-select').addEventListener('change',e=>{activeSortKey=e.target.value;renderMedicines(searchBar.value);});
document.querySelectorAll('.cat-filter-pill').forEach(pill=>{pill.addEventListener('click',()=>{document.querySelectorAll('.cat-filter-pill').forEach(p=>p.classList.remove('active'));pill.classList.add('active');activeCatFilter=pill.getAttribute('data-cat');renderMedicines(searchBar.value);});});

// ADD MEDICINE
fileInput.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{imagePreview.src=ev.target.result;imagePreview.classList.remove('hidden');fileUploadContent.classList.add('hidden');};r.readAsDataURL(f);});
addMedForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const name=document.getElementById('med-name').value.trim(),batch=document.getElementById('med-batch').value.trim(),
          qty=parseInt(document.getElementById('med-qty').value),expiry=document.getElementById('med-expiry').value,
          category=document.getElementById('med-category').value,supplier=(document.getElementById('med-supplier')?.value||'').trim(),imgFile=fileInput.files[0];
    if(!name||!batch||!qty||!expiry||!category){showToast('Please fill in all required fields.');return;}
    showToast('Saving medicine...');
    // Image is optional — if provided, convert to base64; if not, save without image
    if(imgFile){
        const r2=new FileReader();
        r2.onload=async ev=>{
            const{ok,error}=await api('POST','/api/medicines',{name,batch,qty,expiry,category,supplier,image:ev.target.result});
            if(ok){await loadMedicines();addMedForm.reset();document.getElementById('med-category').value='';imagePreview.classList.add('hidden');imagePreview.src='';fileUploadContent.classList.remove('hidden');showToast(`"${name}" added to inventory!`);setTimeout(()=>document.querySelector('[data-target="page-inventory"]').click(),600);}
            else showToast(error?.message||'Could not save medicine.');
        };
        r2.readAsDataURL(imgFile);
    } else {
        const{ok,error}=await api('POST','/api/medicines',{name,batch,qty,expiry,category,supplier,image:null});
        if(ok){await loadMedicines();addMedForm.reset();document.getElementById('med-category').value='';showToast(`"${name}" added to inventory!`);setTimeout(()=>document.querySelector('[data-target="page-inventory"]').click(),600);}
        else showToast(error?.message||'Could not save medicine.');
    }
});

searchBar.addEventListener('input',e=>renderMedicines(e.target.value));

// DELETE
let pendingDeleteId=null,pendingDeleteName='';
window.confirmDelete=function(id,name){pendingDeleteId=id;pendingDeleteName=name;document.getElementById('delete-med-name').textContent='"'+name+'"';document.getElementById('delete-modal-overlay').classList.remove('hidden');setTimeout(()=>document.getElementById('delete-modal').classList.add('modal-in'),10);};
function closeDeleteModal(){document.getElementById('delete-modal').classList.remove('modal-in');setTimeout(()=>document.getElementById('delete-modal-overlay').classList.add('hidden'),220);pendingDeleteId=null;}
document.getElementById('delete-cancel-btn').addEventListener('click',closeDeleteModal);
document.getElementById('delete-modal-close').addEventListener('click',closeDeleteModal);
document.getElementById('delete-modal-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('delete-modal-overlay'))closeDeleteModal();});
document.getElementById('delete-confirm-btn').addEventListener('click',async()=>{if(!pendingDeleteId)return;const{ok,error}=await api('DELETE',`/api/medicines/${pendingDeleteId}`);if(ok){await loadMedicines();showToast(`"${pendingDeleteName}" removed.`);closeDeleteModal();}else showToast(error?.message||'Could not delete medicine.');});

// EDIT
window.openEditModal=function(id){const med=medicines.find(m=>m.id===id);if(!med)return;document.getElementById('edit-index').value=id;document.getElementById('edit-name').value=med.name;document.getElementById('edit-batch').value=med.batch;document.getElementById('edit-qty').value=med.qty;document.getElementById('edit-expiry').value=med.expiry;document.getElementById('edit-modal-overlay').classList.remove('hidden');setTimeout(()=>document.getElementById('edit-modal').classList.add('modal-in'),10);};
function closeEditModal(){document.getElementById('edit-modal').classList.remove('modal-in');setTimeout(()=>document.getElementById('edit-modal-overlay').classList.add('hidden'),220);}
document.getElementById('edit-modal-close').addEventListener('click',closeEditModal);
document.getElementById('edit-cancel-btn').addEventListener('click',closeEditModal);
document.getElementById('edit-modal-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('edit-modal-overlay'))closeEditModal();});
document.getElementById('edit-med-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const id=document.getElementById('edit-index').value,name=document.getElementById('edit-name').value.trim(),
          batch=document.getElementById('edit-batch').value.trim(),qty=parseInt(document.getElementById('edit-qty').value),
          expiry=document.getElementById('edit-expiry').value,med=medicines.find(m=>m.id===id);
    const{ok,error}=await api('PUT',`/api/medicines/${id}`,{name,batch,qty,expiry,category:med?.category||'Other',supplier:med?.supplier||''});
    if(ok){await loadMedicines();showToast(`"${name}" updated!`);closeEditModal();}else showToast(error?.message||'Could not update.');
});

// NOTIFICATIONS
document.getElementById('notify-btn').addEventListener('click',async()=>{if(!('Notification'in window)){showToast('Notifications not supported.');return;}const p=await Notification.requestPermission();if(p==='granted'){showToast('Notifications enabled! ✅');document.getElementById('notify-btn').classList.add('notify-active');fireExpiryNotifications();}else showToast('Permission denied.');});
function fireExpiryNotifications(){if(Notification.permission!=='granted')return;const a=medicines.filter(m=>{const d=daysDiff(m.expiry);return d<=30&&d>0;});if(!a.length){new Notification('MediTrack ✅',{body:'All medicines are safe!'});return;}a.slice(0,5).forEach(m=>{const d=daysDiff(m.expiry);new Notification(`⚠️ ${m.name}`,{body:`Expires in ${d} day${d!==1?'s':''} — Batch: ${m.batch}`});});}

// CHARTS
let chartStock=null,chartExpiry=null,chartHealth=null;
function renderCharts(){
    const has=medicines.length>0;
    ['chart-stock-empty','chart-expiry-empty','chart-health-empty'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('hidden',has);});
    ['chart-stock','chart-expiry','chart-stock-health'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=has?'block':'none';});
    if(!has)return;
    const sc=document.getElementById('chart-stock');
    if(sc){if(chartStock)chartStock.destroy();const t=[...medicines].sort((a,b)=>b.qty-a.qty).slice(0,10);chartStock=new Chart(sc,{type:'bar',data:{labels:t.map(m=>m.name.length>14?m.name.slice(0,14)+'…':m.name),datasets:[{label:'Quantity',data:t.map(m=>m.qty),backgroundColor:t.map(m=>m.qty<10?'rgba(255,159,67,0.85)':'rgba(15,111,255,0.8)'),borderRadius:6,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(0,0,0,0.05)'},beginAtZero:true}}}});}
    const ec=document.getElementById('chart-expiry');
    if(ec){if(chartExpiry)chartExpiry.destroy();let exp=0,sn=0,v=0;medicines.forEach(m=>{const d=daysDiff(m.expiry);if(d<=0)exp++;else if(d<=30)sn++;else v++;});chartExpiry=new Chart(ec,{type:'doughnut',data:{labels:['Safe','Expiring Soon','Expired'],datasets:[{data:[v,sn,exp],backgroundColor:['rgba(46,213,115,0.85)','rgba(255,159,67,0.85)','rgba(255,71,87,0.85)'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom'}}}});}
    const hc=document.getElementById('chart-stock-health');
    if(hc){if(chartHealth)chartHealth.destroy();const lw=medicines.filter(m=>m.qty<10).length;chartHealth=new Chart(hc,{type:'doughnut',data:{labels:['Normal Stock','Low Stock'],datasets:[{data:[medicines.length-lw,lw],backgroundColor:['rgba(15,111,255,0.85)','rgba(255,159,67,0.85)'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom'}}}});}
}

// EXPORT PDF
document.getElementById('export-pdf-btn').addEventListener('click',()=>{if(!medicines.length){showToast('No medicines to export.');return;}const{jsPDF}=window.jspdf,doc=new jsPDF();doc.setFontSize(18);doc.setTextColor(15,111,255);doc.text('MediTrack — Inventory Report',14,18);doc.setFontSize(10);doc.setTextColor(107,114,128);doc.text(`Generated: ${new Date().toLocaleDateString()}`,14,26);doc.text(`Total: ${medicines.length}`,14,32);doc.autoTable({startY:38,head:[['#','Name','Batch','Category','Supplier','Qty','Expiry','Status']],body:medicines.map((m,i)=>{const d=daysDiff(m.expiry);return[i+1,m.name,m.batch,m.category||'—',m.supplier||'—',m.qty,m.expiry,d<=0?'Expired':d<=30?'Expiring(30d)':d<=60?'Expiring(60d)':d<=90?'Expiring(90d)':'Safe'];}),styles:{fontSize:8},headStyles:{fillColor:[15,111,255],textColor:255}});doc.save('meditrack-inventory.pdf');showToast('PDF exported!');});

// EXPORT EXCEL
document.getElementById('export-excel-btn').addEventListener('click',()=>{if(!medicines.length){showToast('No medicines to export.');return;}const data=medicines.map((m,i)=>{const d=daysDiff(m.expiry);return{'#':i+1,'Medicine Name':m.name,'Batch':m.batch,'Category':m.category||'—','Supplier':m.supplier||'—','Quantity':m.qty,'Expiry':m.expiry,'Status':d<=0?'Expired':d<=30?'Expiring Soon':'Safe'};});const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Inventory');XLSX.writeFile(wb,'meditrack-inventory.xlsx');showToast('Excel exported!');});

// EXPORT CSV
document.getElementById('export-csv-btn').addEventListener('click',()=>{if(!medicines.length){showToast('No medicines to export.');return;}const h=['#','Name','Batch','Category','Supplier','Qty','Expiry','Status'];const rows=medicines.map((m,i)=>{const d=daysDiff(m.expiry),st=d<=0?'Expired':d<=30?'Expiring Soon':'Safe';return[i+1,`"${m.name}"`,m.batch,m.category,`"${m.supplier||''}"`,m.qty,m.expiry,st].join(',');});const csv=[h.join(','),...rows].join('\n'),blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='meditrack-inventory.csv';a.click();URL.revokeObjectURL(url);showToast('CSV exported!');});

// INVOICE
function buildInvoiceHTML(){const dt=new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'}),e30=medicines.filter(m=>{const d=daysDiff(m.expiry);return d>0&&d<=30;}).length,lc=medicines.filter(m=>m.qty<10).length,rows=medicines.map((m,i)=>{const d=daysDiff(m.expiry),sc=d<=0?'invoice-status-exp':d<=30?'invoice-status-warn':'invoice-status-ok',st=d<=0?'Expired':d<=30?'Expiring Soon':'Safe';return`<tr><td>${i+1}</td><td>${m.name}</td><td>${m.batch}</td><td>${m.category||'—'}</td><td>${m.supplier||'—'}</td><td>${m.qty}</td><td>${m.expiry}</td><td class="${sc}">${st}</td></tr>`;}).join('');return`<div class="invoice-header"><div class="invoice-brand"><div class="invoice-brand-icon"><svg width="20" height="20" viewBox="0 0 32 32" fill="none"><rect x="13" y="2" width="6" height="28" rx="3" fill="white"/><rect x="2" y="13" width="28" height="6" rx="3" fill="white"/></svg></div><div><h2>MediTrack</h2><p>Pharmacy Inventory Manager</p></div></div><div class="invoice-meta"><strong>Inventory Invoice</strong>Date: ${dt}<br>User: ${currentUserEmail}</div></div><div class="invoice-summary-row"><div class="invoice-summary-box"><div class="isb-val">${medicines.length}</div><div class="isb-label">Total Medicines</div></div><div class="invoice-summary-box"><div class="isb-val" style="color:var(--warning)">${e30}</div><div class="isb-label">Expiring &lt;30d</div></div><div class="invoice-summary-box"><div class="isb-val" style="color:var(--danger)">${lc}</div><div class="isb-label">Low Stock</div></div></div><table class="invoice-table"><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Category</th><th>Supplier</th><th>Qty</th><th>Expiry</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><div class="invoice-footer"><span>Generated by MediTrack (.NET)</span><span>${dt}</span></div>`;}
document.getElementById('export-invoice-btn').addEventListener('click',()=>{if(!medicines.length){showToast('No medicines.');return;}document.getElementById('invoice-preview').innerHTML=buildInvoiceHTML();document.getElementById('invoice-modal-overlay').classList.remove('hidden');setTimeout(()=>document.getElementById('invoice-modal').classList.add('modal-in'),10);});
function closeInvoiceModal(){document.getElementById('invoice-modal').classList.remove('modal-in');setTimeout(()=>document.getElementById('invoice-modal-overlay').classList.add('hidden'),220);}
document.getElementById('invoice-modal-close').addEventListener('click',closeInvoiceModal);
document.getElementById('invoice-cancel-btn').addEventListener('click',closeInvoiceModal);
document.getElementById('invoice-modal-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('invoice-modal-overlay'))closeInvoiceModal();});
document.getElementById('invoice-print-btn').addEventListener('click',()=>{const pw=window.open('','_blank','width=950,height=750');pw.document.write(`<!DOCTYPE html><html><head><title>Invoice</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;padding:2rem;color:#111}.invoice-header{display:flex;justify-content:space-between;padding-bottom:1rem;border-bottom:2px solid #0f6fff;margin-bottom:1.25rem}.invoice-brand{display:flex;align-items:center;gap:.6rem}.invoice-brand-icon{width:36px;height:36px;background:#0f6fff;border-radius:8px;display:flex;align-items:center;justify-content:center}.invoice-brand h2{font-size:1.3rem;font-weight:800;color:#0f6fff}.invoice-meta{text-align:right;font-size:.8rem;color:#6b7280}.invoice-summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1.25rem}.invoice-summary-box{border:1px solid #e5e7eb;border-radius:10px;padding:.75rem;text-align:center;background:#f9fafb}.isb-val{font-size:1.5rem;font-weight:800;color:#0f6fff}.isb-label{font-size:.7rem;color:#9ca3af}table{width:100%;border-collapse:collapse;font-size:.78rem}th{background:#0f6fff;color:#fff;padding:.45rem .6rem;text-align:left}td{padding:.4rem .6rem;border-bottom:1px solid #f3f4f6}tr:nth-child(even) td{background:#f9fafb}.invoice-status-ok{color:#15803d;font-weight:600}.invoice-status-warn{color:#ff9f43;font-weight:600}.invoice-status-exp{color:#ff4757;font-weight:600}.invoice-footer{display:flex;justify-content:space-between;padding-top:.75rem;border-top:1px solid #e5e7eb;margin-top:1rem;font-size:.72rem;color:#9ca3af}</style></head><body>${buildInvoiceHTML()}<script>window.onload=()=>window.print()<\/script></body></html>`);pw.document.close();showToast('Invoice sent to printer!');});

// AI LOOKUP
window.triggerAISearch=function(name){document.getElementById('ai-medicine-input').value=name;runAILookup(name);};
document.getElementById('ai-search-btn').addEventListener('click',()=>{const n=document.getElementById('ai-medicine-input').value.trim();if(!n){showToast('Please enter a medicine name.');return;}runAILookup(n);});
document.getElementById('ai-medicine-input').addEventListener('keydown',e=>{if(e.key==='Enter'){const n=e.target.value.trim();if(n)runAILookup(n);}});
async function runAILookup(mn){
    const pl=document.getElementById('ai-placeholder'),ld=document.getElementById('ai-loading'),ct=document.getElementById('ai-result-content');
    pl.classList.add('hidden');ld.classList.remove('hidden');ct.classList.add('hidden');
    try{
        const enc=encodeURIComponent(mn);let drug=null;
        for(const url of[`https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${enc}"&limit=1`,`https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${enc}"&limit=1`,`https://api.fda.gov/drug/label.json?search="${enc}"&limit=1`]){
            const r=await fetch(url),d=await r.json();if(d.results?.length){drug=d.results[0];break;}
        }
        if(!drug)throw new Error('NOT_FOUND');
        const o=drug.openfda||{},name=o.brand_name?.[0]||o.generic_name?.[0]||mn,gen=o.generic_name?.[0]||'',mfr=o.manufacturer_name?.[0]||'N/A',cat=o.pharm_class_epc?.[0]||o.product_type?.[0]||'Drug',route=o.route?.[0]||'See label';
        const ex=f=>f?(Array.isArray(f)?f[0]:f).replace(/\s+/g,' ').trim():null;
        const el=(f,n=4)=>{if(!f)return null;const t=Array.isArray(f)?f[0]:f;return t.split(/[\n•]|\d+\.\s+/).map(l=>l.replace(/\s+/g,' ').trim()).filter(l=>l.length>15).slice(0,n);};
        const sh=(t,m=220)=>!t?'See package insert.':t.length>m?t.slice(0,m)+'…':t;
        const uses=el(drug.indications_and_usage)||el(drug.purpose)||['Refer to prescribing information'],sides=el(drug.adverse_reactions)||['Refer to package insert'],warns=el(drug.warnings)||['Refer to package insert'];
        const si=sh(ex(drug.storage_and_handling)),dosage=sh(ex(drug.dosage_and_administration)||'Refer to prescribing information');
        ct.innerHTML=`<div class="ai-result-name"><span class="ai-result-badge">${cat}</span><h2>${name}</h2>${gen&&gen.toLowerCase()!==name.toLowerCase()?`<p style="color:var(--text-muted);font-size:13px;margin-top:4px;">Generic: ${gen}</p>`:''}</div><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;"><span style="font-size:12px;background:#f0f4ff;color:#3b5bdb;padding:4px 10px;border-radius:20px;">🧪 ${route}</span><span style="font-size:12px;background:#f0f4ff;color:#3b5bdb;padding:4px 10px;border-radius:20px;">🏭 ${mfr}</span></div><div class="ai-info-grid"><div class="ai-info-block"><div class="ai-info-label">Uses</div><ul>${uses.map(u=>`<li>${u}</li>`).join('')}</ul></div><div class="ai-info-block"><div class="ai-info-label">Dosage</div><p>${dosage}</p></div><div class="ai-info-block ai-info-warn"><div class="ai-info-label">Adverse Reactions</div><ul>${sides.map(s=>`<li>${s}</li>`).join('')}</ul></div><div class="ai-info-block ai-info-danger"><div class="ai-info-label">Warnings</div><ul>${warns.map(w=>`<li>${w}</li>`).join('')}</ul></div><div class="ai-info-block ai-info-storage"><div class="ai-info-label">Storage</div><p>${si}</p></div></div><p class="ai-disclaimer">📋 Data from US FDA OpenFDA. Always verify with official prescribing information.</p>`;
        ld.classList.add('hidden');ct.classList.remove('hidden');
    }catch(err){ld.classList.add('hidden');ct.innerHTML=err.message==='NOT_FOUND'?`<div class="ai-error"><p><strong>"${mn}" not found in FDA database.</strong></p><p style="margin-top:6px;font-size:13px;">Try the generic name, e.g. "acetaminophen" instead of "Crocin".</p></div>`:`<div class="ai-error"><p>Could not fetch medicine info. Check your internet connection.</p></div>`;ct.classList.remove('hidden');}
}

// PROFILE
document.getElementById('profile-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=document.getElementById('profile-name').value.trim(),shop=document.getElementById('profile-shop').value.trim(),phone=document.getElementById('profile-phone').value.trim(),type=document.getElementById('profile-type').value,address=document.getElementById('profile-address').value.trim(),gst=document.getElementById('profile-gst').value.trim();
    let ok2=true;
    if(!name){document.getElementById('profile-name-error').style.display='block';ok2=false;}else document.getElementById('profile-name-error').style.display='none';
    if(!shop){document.getElementById('profile-shop-error').style.display='block';ok2=false;}else document.getElementById('profile-shop-error').style.display='none';
    if(!phone||!/^\d{10}$/.test(phone)){document.getElementById('profile-phone-error').style.display='block';ok2=false;}else document.getElementById('profile-phone-error').style.display='none';
    if(!type){document.getElementById('profile-type-error').style.display='block';ok2=false;}else document.getElementById('profile-type-error').style.display='none';
    if(!ok2)return;
    const{ok,error}=await api('POST','/api/profile',{name,shopName:shop,phone,shopType:type,address,gst});
    if(ok){currentProfile={name,shopName:shop,phone,shopType:type,address,gst};showToast('Profile saved! Welcome 🎉');await enterDashboard(currentUserEmail);}
    else showToast(error?.message||'Could not save profile.');
});
function renderProfileView(){if(!currentProfile)return;const p=currentProfile,set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v||'—';};set('profile-view-name',p.name);set('profile-view-shop',p.shopName);set('profile-view-phone',p.phone);set('profile-view-email',currentUserEmail);set('profile-view-address',p.address);set('profile-view-gst',p.gst);const te=document.getElementById('profile-view-type');if(te){te.textContent=p.shopType||'';te.style.display=p.shopType?'inline-flex':'none';}const ae=document.getElementById('profile-hero-avatar');if(ae)ae.textContent=p.name?p.name.charAt(0).toUpperCase():'?';}
document.getElementById('edit-profile-btn').addEventListener('click',()=>{if(!currentProfile)return;const p=currentProfile;document.getElementById('edit-profile-name').value=p.name||'';document.getElementById('edit-profile-shop').value=p.shopName||'';document.getElementById('edit-profile-phone').value=p.phone||'';document.getElementById('edit-profile-type').value=p.shopType||'';document.getElementById('edit-profile-address').value=p.address||'';document.getElementById('edit-profile-gst').value=p.gst||'';document.getElementById('profile-view-mode').classList.add('hidden');document.getElementById('profile-edit-mode').classList.remove('hidden');document.getElementById('edit-profile-btn').classList.add('hidden');});
document.getElementById('cancel-edit-profile-btn').addEventListener('click',()=>{document.getElementById('profile-edit-mode').classList.add('hidden');document.getElementById('profile-view-mode').classList.remove('hidden');document.getElementById('edit-profile-btn').classList.remove('hidden');});
document.getElementById('profile-edit-form').addEventListener('submit',async e=>{e.preventDefault();const name=document.getElementById('edit-profile-name').value.trim(),shop=document.getElementById('edit-profile-shop').value.trim(),phone=document.getElementById('edit-profile-phone').value.trim(),type=document.getElementById('edit-profile-type').value,address=document.getElementById('edit-profile-address').value.trim(),gst=document.getElementById('edit-profile-gst').value.trim();if(!name||!shop||!phone||!type){showToast('Please fill all required fields.');return;}if(!/^\d{10}$/.test(phone)){showToast('Please enter a valid 10-digit phone number.');return;}const{ok,error}=await api('PUT','/api/profile',{name,shopName:shop,phone,shopType:type,address,gst});if(ok){currentProfile={...currentProfile,name,shopName:shop,phone,shopType:type,address,gst};document.getElementById('user-avatar').textContent=name.charAt(0).toUpperCase();const se=document.getElementById('user-shop-display');if(se)se.textContent=shop;renderProfileView();document.getElementById('profile-edit-mode').classList.add('hidden');document.getElementById('profile-view-mode').classList.remove('hidden');document.getElementById('edit-profile-btn').classList.remove('hidden');showToast('Profile updated! ✅');}else showToast(error?.message||'Could not update profile.');});

// ANIMATIONS
function animateCounter(el,target,dur=800){if(!el)return;const start=performance.now(),ev=parseInt(target)||0;if(!ev){el.textContent='0';return;}function tick(now){const prog=Math.min((now-start)/dur,1),ease=1-Math.pow(1-prog,3);el.textContent=Math.round(ev*ease);if(prog<1)requestAnimationFrame(tick);else el.textContent=ev;}requestAnimationFrame(tick);}
function initParticles(){const c=document.getElementById('dashboard-particles');if(!c)return;c.innerHTML='';for(let i=0;i<8;i++){const dp=document.createElement('div');dp.className='dp';const sz=60+Math.random()*140;dp.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${8+Math.random()*10}s;animation-delay:${Math.random()*6}s;`;c.appendChild(dp);}}
document.querySelectorAll('.nav-item').forEach(item=>{item.addEventListener('click',function(e){const r=document.createElement('span');r.className='ripple';const rect=item.getBoundingClientRect(),sz=Math.max(rect.width,rect.height);r.style.cssText=`width:${sz}px;height:${sz}px;left:${e.clientX-rect.left-sz/2}px;top:${e.clientY-rect.top-sz/2}px;`;item.appendChild(r);setTimeout(()=>r.remove(),600);});});
const ua=document.querySelector('.file-upload-area');if(ua){ua.addEventListener('dragover',e=>{e.preventDefault();ua.classList.add('drag-over');});['dragleave','drop'].forEach(ev=>ua.addEventListener(ev,()=>ua.classList.remove('drag-over')));}
document.querySelectorAll('.btn-submit,.btn-add-quick,.btn-login,.btn-modal-save,.btn-modal-danger').forEach(btn=>{btn.addEventListener('mousedown',()=>{btn.style.transform='scale(0.97)';});btn.addEventListener('mouseup',()=>{btn.style.transform='';});btn.addEventListener('mouseleave',()=>{btn.style.transform='';});});
document.addEventListener('click',function(e){const card=e.target.closest('.stat-card');if(card){card.style.transform='scale(0.97)';setTimeout(()=>{card.style.transform='';},150);}});

/* ── SAFE ADDITIONS ONLY (no animation, no observers, no timers) ── */

// Grid / List view toggle
(function() {
    const toolbar = document.querySelector('.inv-toolbar');
    if (!toolbar) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:4px;align-items:center;';
    wrap.innerHTML = `
        <button id="view-grid-btn" title="Grid view" style="width:30px;height:30px;border-radius:7px;border:1.5px solid var(--border);background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
        <button id="view-list-btn" title="List view" style="width:30px;height:30px;border-radius:7px;border:1.5px solid var(--border);background:var(--surface);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>
        </button>`;
    toolbar.appendChild(wrap);

    let list = false;
    document.getElementById('view-grid-btn').onclick = () => {
        list = false;
        document.getElementById('inventory-list').style.cssText = '';
        document.getElementById('view-grid-btn').style.background = 'var(--primary)';
        document.getElementById('view-grid-btn').style.color = '#fff';
        document.getElementById('view-list-btn').style.background = 'var(--surface)';
        document.getElementById('view-list-btn').style.color = 'var(--text-muted)';
    };
    document.getElementById('view-list-btn').onclick = () => {
        list = true;
        document.getElementById('inventory-list').style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        document.getElementById('view-list-btn').style.background = 'var(--primary)';
        document.getElementById('view-list-btn').style.color = '#fff';
        document.getElementById('view-grid-btn').style.background = 'var(--surface)';
        document.getElementById('view-grid-btn').style.color = 'var(--text-muted)';
    };
})();

// Keyboard shortcuts
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






/* ================================================================
   MEDICINE PACKET IMAGE SEARCH
   Calls /api/imagesearch (server-side proxy — no CORS issues)
   ================================================================ */

(function injectImageSearch() {

    const FALLBACKS = [
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Amoxicillin_Capsules.jpg/320px-Amoxicillin_Capsules.jpg', name:'Amoxicillin Capsules' },
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Paracetamol500.jpg/320px-Paracetamol500.jpg', name:'Paracetamol 500mg' },
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Ibuprofen_400mg.jpg/320px-Ibuprofen_400mg.jpg', name:'Ibuprofen 400mg' },
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Aspirin_Canada.jpg/320px-Aspirin_Canada.jpg', name:'Aspirin' },
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Metformin_500mg.jpg/320px-Metformin_500mg.jpg', name:'Metformin 500mg' },
        { thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GI_bleeding_-_tablet_vs_capsule.jpg/320px-GI_bleeding_-_tablet_vs_capsule.jpg', name:'Tablet vs Capsule' },
    ].map(f => ({ ...f, full: f.thumb, brand: '', source: 'fallback', label: '📦 Sample' }));

    function waitFor(sel, cb) {
        const el = document.querySelector(sel);
        if (el) { cb(el); return; }
        setTimeout(() => waitFor(sel, cb), 400);
    }

    /* ── INJECT BUTTON ── */
    waitFor('.file-upload-area', uploadArea => {
        const orDiv = document.createElement('div');
        orDiv.style.cssText = `display:flex;align-items:center;gap:10px;
            margin:10px 0 0;color:var(--text-muted);font-size:12px;`;
        orDiv.innerHTML = `
            <div style="flex:1;height:1px;background:var(--border)"></div>
            <span>or</span>
            <div style="flex:1;height:1px;background:var(--border)"></div>`;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Search Medicine Packet Image`;
        btn.style.cssText = `
            display:flex;align-items:center;justify-content:center;gap:7px;
            width:100%;margin-top:8px;padding:10px 14px;
            background:transparent;border:1.5px dashed var(--primary);
            border-radius:10px;color:var(--primary);font-size:13.5px;
            font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;
            transition:background 0.15s;`;
        btn.onmouseenter = () => btn.style.background = 'var(--primary-glow)';
        btn.onmouseleave = () => btn.style.background = 'transparent';
        btn.onclick = openModal;
        uploadArea.parentNode.insertBefore(orDiv, uploadArea.nextSibling);
        uploadArea.parentNode.insertBefore(btn,   orDiv.nextSibling);
    });

    /* ── MODAL ── */
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:2000;
        background:rgba(8,12,24,0.75);
        display:flex;align-items:center;justify-content:center;
        padding:1.5rem;opacity:0;pointer-events:none;
        transition:opacity 0.2s ease;`;

    overlay.innerHTML = `
      <div id="isc" style="
          background:var(--surface);border-radius:18px;
          box-shadow:0 24px 64px rgba(0,0,0,0.3);
          width:100%;max-width:720px;max-height:90vh;
          display:flex;flex-direction:column;
          border:1px solid var(--border);overflow:hidden;
          transform:scale(0.93) translateY(18px);
          transition:transform 0.28s cubic-bezier(0.34,1.4,0.64,1);">

        <!-- Header -->
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;gap:12px;flex-shrink:0;">
          <div style="width:40px;height:40px;border-radius:11px;
                      background:var(--primary-glow);color:var(--primary);
                      display:flex;align-items:center;justify-content:center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:700;color:var(--text);">
              Medicine Packet Image Search</div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:1px;">
              Open Drug Facts · NIH RxImage · Wikimedia</div>
          </div>
          <button id="isc-close" style="
              width:30px;height:30px;border-radius:8px;
              border:1px solid var(--border);background:var(--surface-2);
              color:var(--text-muted);cursor:pointer;font-size:16px;
              display:flex;align-items:center;justify-content:center;">✕</button>
        </div>

        <!-- Search -->
        <div style="padding:14px 20px 12px;border-bottom:1px solid var(--border);flex-shrink:0;">
          <div style="display:flex;gap:8px;margin-bottom:10px;">
            <div style="flex:1;position:relative;">
              <svg style="position:absolute;left:11px;top:50%;
                          transform:translateY(-50%);color:var(--text-muted);
                          pointer-events:none;"
                   width="14" height="14" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input id="isc-input" type="text"
                placeholder="e.g. aspirin, paracetamol, amoxicillin…"
                style="width:100%;padding:9px 12px 9px 34px;
                       border:1.5px solid var(--border);border-radius:9px;
                       font-size:13.5px;font-family:'DM Sans',sans-serif;
                       color:var(--text);background:var(--surface-2);outline:none;"
                onfocus="this.style.borderColor='var(--primary)'"
                onblur="this.style.borderColor='var(--border)'"/>
            </div>
            <button id="isc-btn" style="
                padding:9px 22px;background:var(--primary);color:#fff;
                border:none;border-radius:9px;font-size:13.5px;font-weight:600;
                font-family:'DM Sans',sans-serif;cursor:pointer;">Search</button>
          </div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${['aspirin','paracetamol','amoxicillin','ibuprofen','metformin',
               'cetirizine','azithromycin','omeprazole','vitamin c','antacid']
              .map(t=>`<span onclick="iscQuick('${t}')" style="
                  padding:3px 10px;border-radius:20px;font-size:11.5px;
                  font-weight:600;background:var(--surface-2);
                  border:1px solid var(--border);
                  color:var(--text-secondary);cursor:pointer;"
                onmouseenter="this.style.background='var(--primary-glow)';this.style.color='var(--primary)';this.style.borderColor='var(--primary)'"
                onmouseleave="this.style.background='var(--surface-2)';this.style.color='var(--text-secondary)';this.style.borderColor='var(--border)'"
              >${t}</span>`).join('')}
          </div>
        </div>

        <!-- Grid -->
        <div id="isc-grid" style="
            flex:1;overflow-y:auto;padding:14px 20px 16px;
            display:grid;grid-template-columns:repeat(3,1fr);
            gap:12px;align-content:start;min-height:240px;">
          <div style="grid-column:1/-1;text-align:center;
                      padding:4rem 1rem;color:var(--text-muted);">
            <div style="font-size:40px;margin-bottom:12px;">💊</div>
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">
              Search any medicine name</div>
            <div style="font-size:12px;">Real packet &amp; box photos</div>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding:9px 20px;border-top:1px solid var(--border);
                    font-size:11px;color:var(--text-muted);flex-shrink:0;
                    display:flex;justify-content:space-between;align-items:center;">
          <span>Images from open medicine databases</span>
          <span id="isc-count" style="color:var(--primary);font-weight:700;"></span>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    /* ── OPEN / CLOSE ── */
    function openModal() {
        const n = document.getElementById('med-name');
        if (n && n.value.trim())
            document.getElementById('isc-input').value = n.value.trim();
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
        document.getElementById('isc').style.transform = 'scale(1) translateY(0)';
        document.getElementById('isc-input').focus();
        if (document.getElementById('isc-input').value.trim()) doSearch();
    }
    function closeModal() {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        document.getElementById('isc').style.transform = 'scale(0.93) translateY(18px)';
    }
    document.getElementById('isc-close').onclick = closeModal;
    overlay.onclick = e => { if (e.target === overlay) closeModal(); };
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.style.opacity === '1') closeModal();
        if (e.key === 'Enter'  && overlay.style.opacity === '1') doSearch();
    });
    window.iscQuick = q => {
        document.getElementById('isc-input').value = q;
        doSearch();
    };
    document.getElementById('isc-btn').onclick = doSearch;

    /* ── SEARCH — calls own server (no CORS) ── */
    async function doSearch() {
        const q = document.getElementById('isc-input').value.trim();
        if (!q) return;
        const grid  = document.getElementById('isc-grid');
        const count = document.getElementById('isc-count');

        grid.innerHTML = `
          <div style="grid-column:1/-1;display:flex;flex-direction:column;
                      align-items:center;justify-content:center;
                      padding:3.5rem;gap:14px;color:var(--text-muted);">
            <div style="width:32px;height:32px;border:3px solid var(--border);
                        border-top-color:var(--primary);border-radius:50%;
                        animation:spin 0.7s linear infinite;"></div>
            <div style="font-size:13px;">Searching medicine databases…</div>
          </div>`;
        count.textContent = '';

        try {
            const res  = await fetch(`/api/imagesearch?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            let imgs = data.images || [];

            if (imgs.length === 0) imgs = FALLBACKS;

            count.textContent = imgs === FALLBACKS
                ? 'Showing sample images'
                : `${imgs.length} images found`;

            renderGrid(grid, imgs);
        } catch(e) {
            renderGrid(grid, FALLBACKS);
            count.textContent = 'Showing sample images';
        }
    }

    /* ── RENDER ── */
    function renderGrid(grid, imgs) {
        grid.innerHTML = '';
        imgs.forEach(img => {
            const card = document.createElement('div');
            card.style.cssText = `
                border-radius:10px;overflow:hidden;cursor:pointer;
                border:2px solid transparent;background:var(--surface-2);
                position:relative;
                transition:border-color 0.15s,transform 0.15s,box-shadow 0.15s;`;

            const imgEl = document.createElement('img');
            imgEl.src     = img.thumb;
            imgEl.alt     = img.name;
            imgEl.loading = 'lazy';
            imgEl.style.cssText = `
                width:100%;height:155px;
                object-fit:contain;display:block;
                background:#f8f9fb;padding:8px;`;
            imgEl.onerror = () => { card.style.display = 'none'; };

            const srcLabel = document.createElement('div');
            srcLabel.textContent = img.label || '📦';
            srcLabel.style.cssText = `
                position:absolute;top:6px;left:6px;font-size:10px;font-weight:700;
                background:rgba(0,0,0,0.55);color:#fff;
                padding:2px 7px;border-radius:20px;`;

            const nameEl = document.createElement('div');
            nameEl.style.cssText = `
                padding:6px 8px 8px;font-size:11.5px;font-weight:600;
                color:var(--text);white-space:nowrap;overflow:hidden;
                text-overflow:ellipsis;border-top:1px solid var(--border);`;
            nameEl.textContent = img.name?.length > 28
                ? img.name.slice(0, 28) + '…' : (img.name || 'Medicine');

            const useBtn = document.createElement('div');
            useBtn.textContent = '✓ Use this';
            useBtn.style.cssText = `
                position:absolute;bottom:34px;left:50%;transform:translateX(-50%);
                background:var(--primary);color:#fff;border-radius:20px;
                padding:5px 14px;font-size:12px;font-weight:700;
                opacity:0;transition:opacity 0.15s;
                white-space:nowrap;pointer-events:none;`;

            card.onmouseenter = () => {
                card.style.borderColor = 'var(--primary)';
                card.style.transform   = 'translateY(-2px)';
                card.style.boxShadow   = '0 8px 20px rgba(15,111,255,0.15)';
                useBtn.style.opacity   = '1';
            };
            card.onmouseleave = () => {
                card.style.borderColor = 'transparent';
                card.style.transform   = '';
                card.style.boxShadow   = '';
                useBtn.style.opacity   = '0';
            };
            card.onclick = () => selectImage(img.full || img.thumb, img.name, card);
            card.append(imgEl, srcLabel, nameEl, useBtn);
            grid.appendChild(card);
        });
    }

    /* ── SELECT ── */
    function selectImage(url, name, card) {
        card.style.borderColor = '#10b981';
        card.style.boxShadow   = '0 0 0 3px rgba(16,185,129,0.25)';
        const preview    = document.getElementById('image-preview');
        const uploadText = document.getElementById('file-upload-content');
        if (preview)    { preview.src = url; preview.classList.remove('hidden'); }
        if (uploadText) { uploadText.classList.add('hidden'); }
        let hidden = document.getElementById('med-online-img');
        if (!hidden) {
            hidden = document.createElement('input');
            hidden.type = 'hidden'; hidden.id = 'med-online-img'; hidden.name = 'onlineImageUrl';
            document.getElementById('add-med-form')?.appendChild(hidden);
        }
        hidden.value = url;
        setTimeout(() => { closeModal(); showToast(`Image selected ✓`); }, 280);
    }

    /* ── PATCH FETCH ── */
    const _fetch = window.fetch;
    window.fetch = function(url, opts) {
        if (typeof url === 'string' && url.includes('/api/medicines') && opts?.body) {
            try {
                const b = JSON.parse(opts.body);
                const h = document.getElementById('med-online-img');
                if (b && !b.image && h && h.value) {
                    b.image = h.value;
                    opts = { ...opts, body: JSON.stringify(b) };
                    setTimeout(() => { h.value = ''; }, 300);
                }
            } catch(e) {}
        }
        return _fetch.call(this, url, opts);
    };

})();
