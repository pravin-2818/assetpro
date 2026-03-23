/* ═══════════════════════════════════════════════════════════

// ── XSS Protection ────────────────────────────────────────────
// Escape user-supplied content before injecting into HTML
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
   AssetPro v5 — All 7 Fixes Applied
   1. Login page full screen
   2. Edit loads existing values (openModal bug fixed)
   4. New features: stats cards click filter, change password
   5. Logout shows "Logout" text clearly
   7. Font size increased (16px base)
   ═══════════════════════════════════════════════════════════ */

let curPage = 'dashboard';
let prevPage = 'dashboard';
let eqPage = 1, empPage = 1;
let catChart = null, monChart = null;
let searchTm = null;
let isDark = localStorage.getItem('ap_theme') === 'dark';
let CUR_USER = null;

// ── XSS PROTECTION ───────────────────────────────────────────
// Escape all user-provided content before inserting to DOM


// ── BOOT ─────────────────────────────────────────────────────
window.addEventListener('load', () => {
  applyTheme(isDark ? 'dark' : 'light');
  const user = API.getUser();
  const tok  = API.getToken();
  if (user && tok) {
    // Verify token is still valid before showing app
    fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + tok } })
      .then(r => {
        if (r.ok) { CUR_USER = user; showApp(user); }
        else {
          API.removeToken(); API.removeUser();
          showLogin();
          if (r.status === 401) console.log('Session expired — please log in again');
        }
      })
      .catch(() => { CUR_USER = user; showApp(user); }); // network error — try anyway
  } else {
    showLogin();
  }
});

// ── THEME ─────────────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  isDark = t === 'dark';
  localStorage.setItem('ap_theme', t);
  const ico = isDark ? '☀️' : '🌙';
  ['theme-btn','theme-btn2'].forEach(id => { const b = document.getElementById(id); if(b) b.textContent = ico; });
  if (catChart || monChart) setTimeout(loadDash, 80);
}
function toggleTheme() { applyTheme(isDark ? 'light' : 'dark'); }

// ── AUTH ──────────────────────────────────────────────────────
function showLogin() {
  // Close any open modals and clear auth state
  CUR_USER = null;
  API.removeToken();
  API.removeUser();
  closeModal();
  stopDashAutoRefresh();
  const lp = document.getElementById('login-page');
  const ap = document.getElementById('app');
  lp.style.display = 'flex';
  lp.style.pointerEvents = 'auto';
  ap.style.display = 'none';
  // Focus username field after a tick
  setTimeout(() => { const el = document.getElementById('lu'); if (el) el.focus(); }, 100);
}

function showApp(user) {
  CUR_USER = user;
  const lp = document.getElementById('login-page');
  lp.style.display = 'none';
  lp.style.pointerEvents = 'none';
  document.getElementById('app').style.display = 'flex';

  // Set user info in sidebar
  document.getElementById('uname').textContent = user.full_name || user.username;
  document.getElementById('urole').textContent = cap(user.role);
  document.getElementById('uav').textContent = (user.full_name || user.username)[0].toUpperCase();
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // ── ROLE-BASED UI ──────────────────────────────────────────
  applyRoleUI(user.role);

  nav('dashboard');
  startDashRefresh();
  loadNotifs();
}

function applyRoleUI(role) {
  // admin: full access | manager: no delete
  const isManager = role === 'manager';
  const isAdmin   = role === 'admin';

  document.querySelectorAll('.role-admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  document.querySelectorAll('.role-manager-up').forEach(el => {
    el.style.display = (isAdmin || isManager) ? '' : 'none';
  });

  const roleColors = { admin:'#6366f1', manager:'#059669' };
  const roleEl = document.getElementById('urole');
  if (roleEl) roleEl.style.color = roleColors[role] || '#6366f1';
}

async function doLogin() {
  const u = document.getElementById('lu').value.trim();
  const p = document.getElementById('lp').value;
  const err = document.getElementById('lerr');
  const btn = document.getElementById('lbtn');
  if (!u || !p) { showErr(err, 'Please enter username and password.'); return; }
  err.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const res = await API.post('/auth/login', { username: u, password: p });
    API.setToken(res.data.token);
    API.setUser(res.data.user);
    showApp(res.data.user);
  } catch(e) {
    showErr(err, e.message || 'Login failed. Check credentials.');
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}
function showErr(el, msg) { el.textContent = msg; el.style.display = 'block'; }

function doLogout() {
  API.removeToken(); API.removeUser(); CUR_USER = null;
  if (catChart) { catChart.destroy(); catChart = null; }
  if (monChart) { monChart.destroy(); monChart = null; }
  showLogin();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const lp = document.getElementById('login-page');
    if (lp && lp.style.display !== 'none') doLogin();
  }
  if (e.key === 'Escape') closeModal();
});

// ── SIDEBAR ────────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('mob-overlay').classList.add('on');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mob-overlay').classList.remove('on');
}

// ── NAVIGATION ────────────────────────────────────────────────
function navEquipAvailable() {
  nav('equipment');
  // Set status filter to available after page loads
  setTimeout(() => {
    const sel = document.getElementById('eq-status');
    if (sel) { sel.value = 'available'; loadEquip(); }
  }, 100);
}

function nav(page) {
  if (curPage !== page) prevPage = curPage;
  curPage = page;

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  // Show target page
  const pg = document.getElementById('pg-' + page);
  if (pg) pg.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-p]').forEach(n =>
    n.classList.toggle('active', n.dataset.p === page));

  // Update topbar title
  const titles = {
    dashboard:    'Dashboard',
    equipment:    'Equipment',
    employees:    'Employees',
    assignments:  'Assignments',
    history:      'Audit Log',
    depreciation: 'Depreciation Calculator',
    maintenance:  'Maintenance Tracker',
    reports:      'Department Reports',
    search:       'Global Search',
  };
  const titleEl = document.getElementById('ptitle');
  if (titleEl) titleEl.textContent = titles[page] || page;

  // Close sidebar on mobile
  if (window.innerWidth <= 900) closeSidebar();

  // Auto-refresh: start/stop based on page
  if (page === 'dashboard') startDashAutoRefresh();
  else stopDashAutoRefresh();

  // Load page data
  const loaders = {
    dashboard:    loadDash,
    equipment:    () => loadEquip(),
    employees:    () => loadEmp(),
    assignments:  () => loadAsgn(),
    history:      loadHist,
    depreciation: loadDepreciation,
    maintenance:  loadMaintenance,
    reports:      loadReports,
    search:       () => { const el = document.getElementById('global-search-input'); if(el) el.focus(); },
  };
  if (loaders[page]) loaders[page]();
}

// ── SEARCH ─────────────────────────────────────────────────────
function handleSearch(e) {
  clearTimeout(searchTm);
  searchTm = setTimeout(() => {
    const q = e.target.value.trim();
    if (curPage === 'equipment') loadEquip(1, q);
    if (curPage === 'employees') loadEmp(1, q);
    if (curPage === 'assignments') loadAsgn(q);
  }, 320);
}

// Also fix searchGoTo to clear new search inputs


// ═════════════════════════════════════════════════════════════
// ── DASHBOARD ─────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
// ── Real-time auto-refresh ──────────────────────────────────
let _dashRefreshInterval = null;
let _dashLastUpdated = null;

function startDashAutoRefresh() {
  stopDashAutoRefresh();
  _dashRefreshInterval = setInterval(() => {
    if (curPage === 'dashboard') loadDash();
  }, 30000); // 30 seconds
}

function stopDashAutoRefresh() {
  if (_dashRefreshInterval) { clearInterval(_dashRefreshInterval); _dashRefreshInterval = null; }
}

function updateDashTimestamp() {
  _dashLastUpdated = new Date();
  const el = document.getElementById('dash-date');
  if (el) el.textContent = 'Last updated: just now · Auto-refreshes every 30s';
  // Update "X seconds ago" every 10s
  clearInterval(window._dashTsInterval);
  window._dashTsInterval = setInterval(() => {
    if (!_dashLastUpdated) return;
    const el = document.getElementById('dash-date');
    if (!el || curPage !== 'dashboard') return;
    const secs = Math.round((new Date() - _dashLastUpdated) / 1000);
    el.textContent = secs < 60
      ? `Last updated: ${secs}s ago · Auto-refreshes every 30s`
      : `Last updated: ${Math.round(secs/60)}m ago · Auto-refreshes every 30s`;
  }, 10000);
}

async function loadDash() {
  try {
    const r = await API.get('/dashboard/stats');
    const d = r.data;
    // Single source of truth: equipment table status counts
    const eq = d.equipment;
    const assigned    = eq.assigned    || 0;
    const available   = eq.available   || 0;
    const maintenance = eq.maintenance || 0;
    const retired     = eq.retired     || 0;
    // Total = sum of all 4 statuses → always matches Asset Status Overview
    animNum('k-total',    assigned + available + maintenance + retired);
    animNum('k-emp',      d.employees.total);
    animNum('k-asgn-tot', assigned);
    animNum('k-available',available);
    animNum('k-overdue',  d.assignments.overdue || 0);
    animNum('k-in-maint', maintenance);
    animNum('k-retired',  retired);  // equipment.status='retired'
    // Show total asset value
    const kav = document.getElementById('k-asset-value');
    if (kav) {
      const v = d.equipment.total_value || 0;
      kav.textContent = v >= 10000000
        ? '₹' + (v/10000000).toFixed(2) + 'Cr'
        : v >= 100000 ? '₹' + (v/100000).toFixed(1) + 'L'
        : v >= 1000 ? '₹' + (v/1000).toFixed(0) + 'K' : '₹' + v;
    }
    buildCatChart(d.categoryBreakdown);
    buildMonChart(d.monthlyAssignments);
    buildActivity(d.recentActivity);
    buildWarranty(d.warrantyExpiring);
    buildDeptBreakdown(d.departmentBreakdown);
    buildStatusOverview(d.equipment);
    // timestamp updated via dash-date
  } catch(e) { toast('Could not load dashboard', 'err'); }
}

// Department Breakdown widget
function buildDeptBreakdown(list) {
  const el = document.getElementById('dept-breakdown-list');
  if (!el) return;
  if (!list?.length) { el.innerHTML = '<p class="empty-msg" style="padding:16px">No department data.</p>'; return; }
  const max = Math.max(...list.map(d => d.employees));
  el.innerHTML = list.slice(0,7).map(d => {
    const pct = max > 0 ? Math.round((d.employees / max) * 100) : 0;
    const colors = ['#6366f1','#059669','#d97706','#dc2626','#7c3aed','#0284c7','#db2777'];
    const idx = list.indexOf(d) % colors.length;
    return `
      <div style="padding:9px 1.4rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;cursor:pointer" onclick="nav('employees')"
           onmouseover="this.style.background='var(--surf2)'" onmouseout="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:.84rem;font-weight:600;color:var(--txt)">${esc(d.department)}</span>
            <span style="font-size:.76rem;color:var(--muted)">${d.employees} people · ${d.active_assignments} assigned</span>
          </div>
          <div style="height:5px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${colors[idx]};border-radius:4px;transition:width .6s ease"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// Asset Status Overview widget
function buildStatusOverview(eq) {
  const el = document.getElementById('status-overview-list');
  if (!el) return;
  const total = eq.total || 1;
  const items = [
    { label:'Available',    val: eq.available||0,    color:'#059669', icon:'✅' },
    { label:'Assigned',     val: eq.assigned||0,     color:'#6366f1', icon:'🔗' },
    { label:'Maintenance',  val: eq.maintenance||0,  color:'#f59e0b', icon:'🔧' },
    { label:'Retired',      val: eq.retired||0,      color:'#6b7280', icon:'🗄️' },
  ];
  el.innerHTML = items.map(item => {
    const pct = Math.round((item.val / total) * 100);
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <span style="font-size:1.1rem;width:24px;text-align:center">${item.icon}</span>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:.82rem;font-weight:600;color:var(--txt)">${item.label}</span>
            <span style="font-size:.82rem;font-weight:700;color:${item.color}">${item.val} <span style="color:var(--muted);font-weight:400">(${pct}%)</span></span>
          </div>
          <div style="height:7px;background:var(--border);border-radius:6px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${item.color};border-radius:6px;transition:width .7s cubic-bezier(.16,1,.3,1)"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function animNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0; const step = Math.max(1, Math.ceil(target / 20));
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(t);
  }, 28);
}

function buildCatChart(data) {
  if (catChart) { catChart.destroy(); catChart = null; }
  const canvas = document.getElementById('catChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!data || !data.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const mid = { x: canvas.offsetWidth/2, y: 115 };
    ctx.fillStyle = isDark ? '#7a87ac' : '#9ca3af';
    ctx.font = '14px DM Sans'; ctx.textAlign = 'center';
    ctx.fillText('No equipment data yet', mid.x, mid.y);
    return;
  }
  const colors = ['#6366f1','#059669','#d97706','#dc2626','#7c3aed','#0284c7','#db2777','#0d9488','#f59e0b','#10b981'];
  catChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.category),
      datasets: [{ data: data.map(d => d.total),
        backgroundColor: colors.slice(0, data.length),
        borderColor: isDark ? '#111520' : '#fff',
        borderWidth: 3, hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { animateRotate: true, duration: 800 },
      plugins: {
        legend: {
          position: 'right',
          labels: { font:{size:13,family:'DM Sans'}, color: isDark?'#c2cde8':'#374151',
            padding:14, usePointStyle:true, pointStyleWidth:8 }
        },
        tooltip: { backgroundColor: isDark?'#161a28':'#1f2937',
          titleColor:'#fff', bodyColor:'#9ca3af', padding:10, cornerRadius:8 }
      },
      cutout: '65%', layout: { padding: { right:8 } }
    }
  });
}

function buildMonChart(data) {
  if (monChart) { monChart.destroy(); monChart = null; }
  const canvas = document.getElementById('monChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!data || !data.length) data = [{ month: new Date().toISOString().slice(0,7), count: 0 }];
  const gc = isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const tc = isDark ? '#7a87ac' : '#9ca3af';
  monChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => {
        const [y,m] = d.month.split('-');
        return new Date(y, m-1).toLocaleString('default', {month:'short', year:'2-digit'});
      }),
      datasets: [{
        label: 'Assignments', data: data.map(d => d.count),
        backgroundColor: data.map((_,i) => i===data.length-1
          ? '#6366f1' : isDark ? 'rgba(99,102,241,.3)' : 'rgba(79,70,229,.22)'),
        borderColor: '#6366f1', borderWidth: 2,
        borderRadius: 7, borderSkipped: false
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: isDark?'#161a28':'#1f2937',
          titleColor:'#fff', bodyColor:'#9ca3af', padding:10, cornerRadius:8 }
      },
      scales: {
        y: { beginAtZero:true, ticks:{ stepSize:1, color:tc, font:{size:12} },
          grid:{ color:gc }, border:{ dash:[4,4], color:'transparent' } },
        x: { ticks:{ color:tc, font:{size:12} }, grid:{ display:false } }
      },
      layout: { padding:{ top:8 } }
    }
  });
}

function buildActivity(list) {
  const el = document.getElementById('act-list');
  if (!el) return;
  if (!list?.length) { el.innerHTML = '<p class="empty-msg">No recent activity.</p>'; return; }
  const icons = { INSERT:'➕', UPDATE:'✏️', DELETE:'🗑️', LOGIN:'🔐', LOGOUT:'🚪', EXPORT:'📤' };
  el.innerHTML = list.slice(0,8).map(a => `
    <div class="act-item">
      <div class="act-ic ai-${a.action[0]}">${icons[a.action]||'•'}</div>
      <div class="act-body"><strong>${a.user_name||'System'}</strong> — ${cap(a.action.toLowerCase())} on <em>${esc(a.table_name)}</em></div>
      <span class="act-time">${timeAgo(a.created_at)}</span>
    </div>`).join('');
}

function buildWarranty(list) {
  const el = document.getElementById('warr-list');
  if (!el) return;
  if (!list?.length) { el.innerHTML = '<p class="empty-msg">✅ No warranties expiring soon!</p>'; return; }
  el.innerHTML = list.map(i => `
    <div class="warr-item">
      <span style="font-size:1.3rem">🖥️</span>
      <div class="warr-info">
        <div class="wn">${i.brand||''} ${i.model||''} <code class="at">${i.asset_tag||''}</code></div>
        <div class="wd">Expires: ${fmtDate(i.warranty_expiry)}</div>
      </div>
    </div>`).join('');
}

// ═════════════════════════════════════════════════════════════
// ── EQUIPMENT ─────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
async function loadEquip(page=1, search=null) {
  eqPage = page;
  const status = document.getElementById('eq-status')?.value || '';
  const cat    = document.getElementById('eq-cat')?.value || '';
  const q = search !== null ? search : (document.getElementById('eq-search')?.value || '');
  let url = `/equipment?page=${page}&limit=15`;
  if (status) url += '&status=' + status;
  if (cat)    url += '&category=' + encodeURIComponent(cat);
  if (q)      url += '&search=' + encodeURIComponent(q);
  showSkeleton('eq-tbody', 8);
  try {
    const r = await API.get(url);
    renderEquip(r.data);
    document.getElementById('eq-cnt').textContent = `${r.meta.total} equipment`;
    renderPag('eq', r.meta.total, 15, page, p => loadEquip(p));
    // populate category dropdown
    try {
      const cats = await API.get('/equipment/categories');
      const sel = document.getElementById('eq-cat');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All Categories</option>' +
        cats.data.map(c =>
          `<option value="${esc(c.category)}" ${c.category===cur?'selected':''}>${esc(c.category)} (${c.total})</option>`
        ).join('');
    } catch {}
  } catch { toast('Failed to load equipment', 'err'); }
}

function renderEquip(rows) {
  const tb = document.getElementById('eq-tbody');
  const role = CUR_USER?.role || 'admin';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">💻</div><h4>No equipment found</h4><p>Add your first asset</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(eq => {
    const canEdit = role === 'admin' || role === 'manager';
    const canDel  = role === 'admin';
    return `<tr>
      <td><code class="at">${eq.asset_tag||'—'}</code></td>
      <td><span class="dept">${esc(eq.category)}</span></td>
      <td><strong style="color:var(--txt)">${eq.brand||''}</strong> <span style="color:var(--muted)">${eq.model||''}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;color:var(--muted)">${eq.serial_number||'—'}</td>
      <td><span class="badge b-${eq.status}">${eq.status}</span></td>
      <td><span class="cond-${eq.condition}">${cap(eq.condition||'')}</span></td>
      <td>${eq.assigned_to_name
        ? `<strong>${esc(eq.assigned_to_name)}</strong><br><span style="font-size:.75rem;color:var(--muted)">${eq.assigned_to_dept||''}</span>`
        : '<span style="color:var(--light)">—</span>'}</td>
      <td><div class="abtns">
        ${canEdit ? `<button class="btn-tbl" title="Edit" onclick="editEquip(${eq.id})">✏️ Edit</button>` : ''}
        ${canDel  ? `<button class="btn-tbl d" title="Delete" onclick="delEquip(${eq.id},'${eq.status}')">🗑️ Delete</button>` : ''}
        ${!canEdit && !canDel ? '<span style="color:var(--light);font-size:.76rem">View only</span>' : ''}
      </div></td>
    </tr>`;
  }).join('');
}

// FIX: openEditModal — opens modal THEN sets values (no reset after)
function openAddModal(type) {
  // fresh add — reset first, then open
  _resetModal(type);
  if (type === 'assignment') {
    prepareAssignModal();  // load employee + equipment dropdowns
  }
  if (type === 'maintenance') {
    openModal_maintenance(); return;  // handles its own modal open
  }
  _showModal(type);
}

async function editEquip(id) {
  try {
    const r = await API.get('/equipment/' + id);
    const eq = r.data;
    // open modal first (no reset), then fill values
    _showModal('equipment');
    document.getElementById('eq-mtitle').textContent = 'Edit Equipment';
    document.getElementById('eq-id').value = eq.id;
    // fill all fields
    _setField('eq-asset_tag',      eq.asset_tag);
    _setField('eq-category',       eq.category);
    _setField('eq-brand',          eq.brand);
    _setField('eq-model',          eq.model);
    _setField('eq-serial_number',  eq.serial_number);
    _setField('eq-condition',      eq.condition || 'good');
    _setField('eq-status-m',       eq.status || 'available');
    _setField('eq-purchase_price', eq.purchase_price);
    _setField('eq-purchase_date',  eq.purchase_date ? eq.purchase_date.slice(0,10) : '');
    _setField('eq-warranty_expiry',eq.warranty_expiry ? eq.warranty_expiry.slice(0,10) : '');
    _setField('eq-location',       eq.location);
  } catch(e) { toast('Failed to load equipment data', 'err'); }
}

async function saveEquip() {
  const id = document.getElementById('eq-id').value;
  const data = {
    asset_tag:      document.getElementById('eq-asset_tag').value || null,
    category:       document.getElementById('eq-category').value,
    brand:          document.getElementById('eq-brand').value || null,
    model:          document.getElementById('eq-model').value || null,
    serial_number:  document.getElementById('eq-serial_number').value || null,
    condition:      document.getElementById('eq-condition').value,
    status:         document.getElementById('eq-status-m').value,
    purchase_price: parseFloat(document.getElementById('eq-purchase_price').value) || null,
    purchase_date:  document.getElementById('eq-purchase_date').value || null,
    warranty_expiry:document.getElementById('eq-warranty_expiry').value || null,
    location:       document.getElementById('eq-location').value || null,
  };
  if (!data.category) { toast('Category is required', 'warn'); return; }
  try {
    if (id) { await API.put('/equipment/'+id, data); toast('Equipment updated ✓', 'ok'); }
    else    { await API.post('/equipment', data);    toast('Equipment added ✓',   'ok'); }
    closeModal(); loadEquip(eqPage);
    if (curPage === 'dashboard') loadDash();
  } catch(e) {
    if (e.errors && Array.isArray(e.errors)) {
      toast('Validation: ' + e.errors.map(err => err.message).join(', '), 'err');
    } else {
      toast(e.message || 'Save failed', 'err');
    }
  }
}

async function delEquip(id, status) {
  if (status === 'assigned') { toast('Return equipment before deleting', 'warn'); return; }
  if (!confirm('Delete this equipment permanently?')) return;
  try { await API.del('/equipment/'+id); toast('Deleted', 'ok'); loadEquip(eqPage); }
  catch(e) { toast(e.message, 'err'); }
}

// ═════════════════════════════════════════════════════════════
// ── EMPLOYEES ──────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
async function loadEmp(page=1, search=null) {
  empPage = page;
  const dept = document.getElementById('emp-dept')?.value || '';
  const q = search !== null ? search : (document.getElementById('emp-search')?.value || '');
  let url = `/employees?page=${page}&limit=15`;
  if (dept) url += '&department=' + encodeURIComponent(dept);
  if (q)    url += '&search=' + encodeURIComponent(q);
  showSkeleton('emp-tbody', 6);
  try {
    const r = await API.get(url);
    renderEmp(r.data);
    document.getElementById('emp-cnt').textContent = `${r.meta.total} employees`;
    renderPag('emp', r.meta.total, 15, page, p => loadEmp(p));
    try {
      const depts = await API.get('/employees/departments');
      const sel = document.getElementById('emp-dept');
      const cur = sel.value;
      sel.innerHTML = '<option value="">All Departments</option>' +
        depts.data.map(d =>
          `<option value="${esc(d.department)}" ${d.department===cur?'selected':''}>${esc(d.department)} (${d.count})</option>`
        ).join('');
    } catch {}
  } catch { toast('Failed to load employees', 'err'); }
}

function renderEmp(rows) {
  const tb = document.getElementById('emp-tbody');
  const role = CUR_USER?.role || 'admin';
  const canEdit = role === 'admin' || role === 'manager';
  const canDel  = role === 'admin';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty-ico">👥</div><h4>No employees found</h4><p>Add team members</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(e => `
    <tr>
      <td><code class="at">${e.employee_id||'—'}</code></td>
      <td><strong style="color:var(--txt)">${esc(e.name)}</strong></td>
      <td><span class="dept">${e.department||'—'}</span></td>
      <td style="color:var(--muted)">${e.position||'—'}</td>
      <td>${e.email||'—'}</td>
      <td>${e.mobile_phone||'—'}</td>
      <td><span class="badge ${e.active_assignments>0?'b-assigned':''}">${e.active_assignments||0}</span></td>
      <td><div class="abtns">
        ${canEdit ? `<button class="btn-tbl" onclick="editEmp(${e.id})">✏️ Edit</button>` : ''}
        ${canDel  ? `<button class="btn-tbl d" onclick="delEmp(${e.id},${e.active_assignments})">🗑️ Del</button>` : ''}
        ${!canEdit && !canDel ? '<span style="color:var(--light);font-size:.76rem">View only</span>' : ''}
      </div></td>
    </tr>`).join('');
}

async function editEmp(id) {
  try {
    const r = await API.get('/employees/' + id);
    const e = r.data;
    _showModal('employee');
    document.getElementById('emp-mtitle').textContent = 'Edit Employee';
    document.getElementById('emp-id').value = e.id;
    _setField('emp-employee_id',  e.employee_id);
    _setField('emp-name',         e.name);
    _setField('emp-email',        e.email);
    _setField('emp-department',   e.department);
    _setField('emp-position',     e.position);
    _setField('emp-mobile_phone', e.mobile_phone);
    _setField('emp-desk_phone',   e.desk_phone);
    _setField('emp-location',     e.location);
  } catch { toast('Failed to load employee data', 'err'); }
}

async function saveEmp() {
  const id = document.getElementById('emp-id').value;
  const data = {
    employee_id:  document.getElementById('emp-employee_id').value  || null,
    name:         document.getElementById('emp-name').value,
    email:        document.getElementById('emp-email').value         || null,
    department:   document.getElementById('emp-department').value    || null,
    position:     document.getElementById('emp-position').value      || null,
    mobile_phone: document.getElementById('emp-mobile_phone').value  || null,
    desk_phone:   document.getElementById('emp-desk_phone').value    || null,
    location:     document.getElementById('emp-location').value      || null,
  };
  if (!data.name) { toast('Name is required', 'warn'); return; }
  try {
    if (id) { await API.put('/employees/'+id, data); toast('Employee updated ✓', 'ok'); }
    else    { await API.post('/employees', data);    toast('Employee added ✓',   'ok'); }
    closeModal(); loadEmp(empPage);
  } catch(e) {
    if (e.errors && Array.isArray(e.errors)) {
      toast('Validation: ' + e.errors.map(err => err.message).join(', '), 'err');
    } else {
      toast(e.message || 'Save failed', 'err');
    }
  }
}

async function delEmp(id, active) {
  if (active > 0) { toast('Return all assets before deleting employee', 'warn'); return; }
  if (!confirm('Delete this employee?')) return;
  try { await API.del('/employees/'+id); toast('Deleted', 'ok'); loadEmp(empPage); }
  catch(e) { toast(e.message, 'err'); }
}

// ═════════════════════════════════════════════════════════════
// ── ASSIGNMENTS ────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
async function loadAsgn(search=null, page=1) {
  const status = document.getElementById('asgn-status')?.value || '';
  const q = search !== null ? search : (document.getElementById('asgn-search')?.value || '');
  let url = `/assignments?page=${page}&limit=25`;
  if (status) url += '&status=' + status;
  if (q)      url += '&search=' + encodeURIComponent(q);
  showSkeleton('asgn-tbody', 5);
  try {
    const r = await API.get(url);
    renderAsgn(r.data);
    document.getElementById('asgn-cnt').textContent = `${r.meta.total} assignments`;
    renderPag('asgn', r.meta.total, 25, page, p => loadAsgn(null, p));
  } catch { toast('Failed to load assignments', 'err'); }
}

function renderAsgn(rows) {
  const tb = document.getElementById('asgn-tbody');
  const role = CUR_USER?.role || 'admin';
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="empty-ico">🔗</div><h4>No assignments</h4><p>Assign equipment to employees</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(a => {
    const active  = !a.returned_date;
    const overdue = active && a.expected_return && new Date(a.expected_return) < new Date();
    const status  = overdue ? 'overdue' : (active ? 'active' : 'returned');
    const canReturn = (role === 'admin' || role === 'manager') && active;
    return `<tr>
      <td><strong style="color:var(--txt)">${esc(a.employee_name)}</strong><br><span style="font-size:.78rem;color:var(--muted)">${a.department||''}</span></td>
      <td>${a.brand||''} ${a.model||''}</td>
      <td><code class="at">${a.asset_tag||'—'}</code></td>
      <td>${fmtDate(a.assigned_date)}</td>
      <td style="${overdue?'color:var(--bad);font-weight:700':''}">${fmtDate(a.expected_return)||'—'}</td>
      <td><span class="badge b-${status}">${status}</span></td>
      <td><div class="abtns">
        ${(role==='admin'||role==='manager') ? `<button class="btn-tbl" onclick="editAsgn(${a.id})" title="Edit assignment">✏️ Edit</button>` : ''}
        ${canReturn ? `<button class="btn-tbl s" onclick="openRet(${a.id})">↩ Return</button>` : ''}
        ${(role==='admin'||role==='manager') && !active ? '<span style="color:var(--muted);font-size:.76rem">Returned</span>' : ''}
        ${role==='admin' ? `<button class="btn-tbl d" onclick="delAsgn(${a.id})" title="Delete record">🗑️</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
}

async function prepareAssignModal() {
  try {
    const empSel = document.getElementById('asgn-emp');
    const eqSel  = document.getElementById('asgn-eq');
    if (empSel) empSel.innerHTML = '<option value="">Loading employees...</option>';
    if (eqSel)  eqSel.innerHTML  = '<option value="">Loading equipment...</option>';

    const [emps, eqs] = await Promise.all([
      API.get('/employees?limit=500&page=1'),
      API.get('/equipment?status=available&limit=500&page=1')
    ]);

    if (empSel) {
      if (emps.data && emps.data.length > 0) {
        empSel.innerHTML = '<option value="">Select employee...</option>' +
          emps.data.map(e => `<option value="${e.id}">${esc(e.name)} — ${esc(e.department||'')}</option>`).join('');
      } else {
        empSel.innerHTML = '<option value="">No employees found</option>';
      }
    }
    if (eqSel) {
      if (eqs.data && eqs.data.length > 0) {
        eqSel.innerHTML = '<option value="">Select available equipment...</option>' +
          eqs.data.map(e => `<option value="${e.id}">${esc(e.brand||'')} ${esc(e.model||'')} — ${esc(e.asset_tag||'')} (${esc(e.category||'')})</option>`).join('');
      } else {
        eqSel.innerHTML = '<option value="">No available equipment</option>';
      }
    }
  } catch(err) {
    console.error('prepareAssignModal error:', err);
    const empSel = document.getElementById('asgn-emp');
    const eqSel  = document.getElementById('asgn-eq');
    if (empSel) empSel.innerHTML = '<option value="">Error loading — please retry</option>';
    if (eqSel)  eqSel.innerHTML  = '<option value="">Error loading — please retry</option>';
  }
}

async function saveAsgn() {
  const data = {
    employee_id:  parseInt(document.getElementById('asgn-emp').value),
    equipment_id: parseInt(document.getElementById('asgn-eq').value),
    expected_return: document.getElementById('asgn-ret').value || null,
    notes:        document.getElementById('asgn-notes').value || null
  };
  if (!data.employee_id || !data.equipment_id) { toast('Select employee and equipment', 'warn'); return; }
  try {
    await API.post('/assignments', data);
    toast('Equipment assigned ✓', 'ok');
    closeModal(); loadAsgn();
    if (curPage === 'dashboard') loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

async function delAsgn(id) {
  if (!confirm('Delete this assignment record permanently?')) return;
  try {
    await API.del('/assignments/' + id);
    toast('Assignment deleted ✓', 'ok');
    loadAsgn();
  } catch(e) { toast(e.message || 'Delete failed', 'err'); }
}

async function editAsgn(id) {
  try {
    const r = await API.get('/assignments/' + id);
    const a = r.data;
    await prepareAssignModal();
    // Update modal title and hidden id
    document.querySelector('#modal-assignment h3').textContent = 'Edit Assignment';
    document.getElementById('asgn-emp').innerHTML =
      `<option value="${a.employee_id}" selected>${esc(a.employee_name||'')} — ${esc(a.department||'')}</option>`;
    document.getElementById('asgn-eq').innerHTML =
      `<option value="${a.equipment_id}" selected>${esc(a.brand||'')} ${esc(a.model||'')} — ${esc(a.asset_tag||'')}</option>`;
    // Add hidden id field dynamically
    let hiddenId = document.getElementById('asgn-edit-id');
    if (!hiddenId) {
      hiddenId = document.createElement('input');
      hiddenId.type = 'hidden';
      hiddenId.id = 'asgn-edit-id';
      document.getElementById('modal-assignment').querySelector('.mbody').prepend(hiddenId);
    }
    hiddenId.value = id;
    if (a.expected_return) document.getElementById('asgn-ret').value = a.expected_return.slice(0,10);
    if (a.notes) document.getElementById('asgn-notes').value = a.notes;
    // Update save button
    document.querySelector('#modal-assignment .btn-primary').textContent = '✏️ Update';
    document.querySelector('#modal-assignment .btn-primary').setAttribute('onclick','updateAsgn()');
    _showModal('assignment');
  } catch(e) { toast('Failed to load assignment: ' + e.message, 'err'); }
}

async function updateAsgn() {
  const id = document.getElementById('asgn-edit-id')?.value;
  if (!id) { toast('Assignment ID missing', 'err'); return; }
  const data = {
    expected_return: document.getElementById('asgn-ret').value || null,
    notes:           document.getElementById('asgn-notes').value || null
  };
  try {
    await API.put('/assignments/' + id, data);
    toast('Assignment updated ✓', 'ok');
    closeModal();
    // Reset modal title/button for next new assignment
    document.querySelector('#modal-assignment h3').textContent = 'New Assignment';
    document.querySelector('#modal-assignment .btn-primary').textContent = '🔗 Assign';
    document.querySelector('#modal-assignment .btn-primary').setAttribute('onclick','saveAsgn()');
    loadAsgn();
  } catch(e) { toast(e.message || 'Update failed', 'err'); }
}

function openRet(id) {
  _showModal('return');
  document.getElementById('ret-id').value = id;
  _setField('ret-reason', '');
  _setField('ret-notes',  '');
  _setField('ret-cond',   'good');
}

async function confirmReturn() {
  const id = document.getElementById('ret-id').value;
  const data = {
    return_reason:      document.getElementById('ret-reason').value,
    condition_on_return:document.getElementById('ret-cond').value,
    notes:              document.getElementById('ret-notes').value || null
  };
  if (!data.return_reason) { toast('Enter return reason', 'warn'); return; }
  try {
    await API.post('/assignments/'+id+'/return', data);
    toast('Equipment returned ✓', 'ok');
    closeModal(); loadAsgn();
    if (curPage === 'dashboard') loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ═════════════════════════════════════════════════════════════
// ── HISTORY ────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
async function loadHist() {
  const tbl = document.getElementById('hist-tbl')?.value || '';
  const act = document.getElementById('hist-act')?.value || '';
  let url = '/history?limit=100';
  if (tbl) url += '&table=' + tbl;
  if (act) url += '&action=' + act;
  showSkeleton('hist-tbody', 6);
  try {
    const r = await API.get(url);
    const tb = document.getElementById('hist-tbody');
    if (!r.data.length) {
      tb.innerHTML = '<tr><td colspan="6"><p class="empty-msg">No audit logs found.</p></td></tr>';
      return;
    }
    tb.innerHTML = r.data.map(l => `
      <tr>
        <td style="white-space:nowrap;color:var(--muted)">${fmtDT(l.created_at)}</td>
        <td><strong>${l.user_name||'System'}</strong></td>
        <td><span class="badge ba-${esc(l.action)}">${esc(l.action)}</span></td>
        <td><code class="at">${esc(l.table_name)}</code></td>
        <td style="color:var(--muted)">${l.record_id||'—'}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:.76rem;color:var(--light)">${l.ip_address||'—'}</td>
      </tr>`).join('');
  } catch { toast('Failed to load audit log', 'err'); }
}

// ═════════════════════════════════════════════════════════════
// ── NOTIFICATIONS ──────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
let _lastDashData = null; // store for notification detail click

async function loadNotifs() {
  const notifs = [];
  try {
    const d = (await API.get('/dashboard/stats')).data;
    _lastDashData = d;
    if (d.assignments.overdue > 0)
      notifs.push({ t:'d', type:'overdue', title:'⚠️ Overdue Returns', msg:`${d.assignments.overdue} equipment overdue for return.`, action:'showOverdueDetail()' });
    if (d.warrantyExpiring?.length)
      notifs.push({ t:'w', type:'warranty', title:'🔔 Warranty Expiring', msg:`${d.warrantyExpiring.length} asset(s) expire within 30 days.`, action:'showWarrantyDetail()' });
    if (d.equipment.maintenance > 0)
      notifs.push({ t:'i', type:'maint', title:'🔧 In Maintenance', msg:`${d.equipment.maintenance} equipment under maintenance.`, action:'showMaintenanceDetail()' });
    if (d.equipment.retired > 0)
      notifs.push({ t:'r', type:'retired', title:'🗄️ Retired Assets', msg:`${d.equipment.retired} equipment retired.`, action:'showRetiredDetail()' });
  } catch {}
  const badge = document.getElementById('nbadge');
  badge.textContent = notifs.length;
  badge.style.display = notifs.length ? 'flex' : 'none';
  document.getElementById('np-list').innerHTML = notifs.length
    ? notifs.map(n => `
      <div class="np-item" onclick="${n.action};document.getElementById('notif-panel').style.display='none'" style="cursor:pointer">
        <div class="np-dot ${n.t}"></div>
        <div class="np-text">
          <strong>${n.title}</strong>
          <span>${n.msg}</span>
        </div>
        <span style="color:var(--primary);font-size:11px">View →</span>
      </div>`).join('')
    : '<p class="empty-msg">All clear! ✅ No notifications.</p>';
}

function showWarrantyDetail() {
  const list = _lastDashData?.warrantyExpiring || [];
  if (!list.length) { toast('No warranty expiry data', 'info'); return; }
  const now = new Date();

  const rows = list.map(i => {
    const expDate = new Date(i.warranty_expiry);
    const daysLeft = Math.ceil((expDate - now) / 86400000);
    const urgency = daysLeft <= 7 ? '#ef4444' : daysLeft <= 14 ? '#f59e0b' : '#10b981';
    return `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="width:42px;height:42px;border-radius:10px;background:${urgency}20;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🖥️</div>
        <div style="flex:1">
          <div style="font-weight:600;color:var(--txt)">${esc(i.brand||'')} ${esc(i.model||'')} <code class="at" style="font-size:11px">${esc(i.asset_tag||'')}</code></div>
          <div style="font-size:12px;color:var(--c-muted);margin-top:2px">Expires: ${fmtDate(i.warranty_expiry)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:${urgency};font-size:18px">${daysLeft}</div>
          <div style="font-size:11px;color:var(--c-muted)">days left</div>
        </div>
      </div>`;
  }).join('');

  // Create detail panel dynamically
  let modal = document.getElementById('modal-warranty-detail');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-warranty-detail';
    modal.className = 'modal modal-sm';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="mhead">
      <h3 style="display:flex;align-items:center;gap:8px">🔔 <span style="color:var(--primary)">Warranty Expiring Soon</span></h3>
      <button class="mclose" onclick="closeModal()">✕</button>
    </div>
    <div class="mbody">
      <div style="background:var(--primary-light);border:1px solid var(--primary);border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:var(--primary)">
        ⚠️ ${list.length} asset(s) have warranties expiring within 30 days. Consider renewal.
      </div>
      ${rows}
    </div>
    <div class="mfoot">
      <button class="btn btn-outline" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();nav('equipment')">View Equipment →</button>
    </div>`;
  _showModal('warranty-detail');
}

// ── OVERDUE RETURNS DETAIL MODAL ──────────────────────────────
async function showOverdueDetail() {
  let rows = '<p style="color:var(--c-muted);text-align:center;padding:20px 0">Loading...</p>';
  const buildModal = (html) => {
    let modal = document.getElementById('modal-overdue-detail');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-overdue-detail'; modal.className = 'modal modal-sm'; document.body.appendChild(modal); }
    modal.innerHTML = `
      <div class="mhead">
        <h3 style="display:flex;align-items:center;gap:8px">⚠️ <span style="color:#ef4444">Overdue Returns</span></h3>
        <button class="mclose" onclick="closeModal()">✕</button>
      </div>
      <div class="mbody">${html}</div>
      <div class="mfoot">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();nav('assignments')">View Assignments →</button>
      </div>`;
    _showModal('overdue-detail');
  };
  buildModal(rows);
  try {
    const r = await API.get('/assignments?status=active&limit=100');
    const now = new Date();
    const overdue = (r.data || []).filter(a => a.expected_return && new Date(a.expected_return) < now);
    if (!overdue.length) { buildModal('<p style="text-align:center;color:var(--c-muted);padding:20px">No overdue assignments found.</p>'); return; }
    const rowsHtml = overdue.map(a => {
      const days = Math.ceil((now - new Date(a.expected_return)) / 86400000);
      const urgency = days > 30 ? '#ef4444' : days > 7 ? '#f59e0b' : '#ef4444';
      return `<div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="width:42px;height:42px;border-radius:10px;background:#ef444420;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">⚠️</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--txt)">${esc(a.employee_name||'')} <span style="font-size:12px;color:var(--c-muted)">— ${esc(a.department||'')}</span></div>
          <div style="font-size:12px;color:var(--c-muted);margin-top:2px">${esc(a.brand||'')} ${esc(a.model||'')} <code class="at" style="font-size:11px">${esc(a.asset_tag||'')}</code></div>
          <div style="font-size:12px;color:#ef4444;margin-top:2px">Due: ${fmtDate(a.expected_return)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:${urgency};font-size:18px">${days}</div>
          <div style="font-size:11px;color:var(--c-muted)">days late</div>
        </div>
      </div>`;
    }).join('');
    buildModal(`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#ef4444">
      ⚠️ ${overdue.length} assignment(s) are past their expected return date.
    </div>${rowsHtml}`);
  } catch { buildModal('<p style="color:var(--c-muted);text-align:center;padding:20px">Could not load data.</p>'); }
}

// ── MAINTENANCE DETAIL MODAL ──────────────────────────────────
async function showMaintenanceDetail() {
  let rows = '<p style="color:var(--c-muted);text-align:center;padding:20px 0">Loading...</p>';
  const buildModal = (html) => {
    let modal = document.getElementById('modal-maint-detail');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-maint-detail'; modal.className = 'modal modal-sm'; document.body.appendChild(modal); }
    modal.innerHTML = `
      <div class="mhead">
        <h3 style="display:flex;align-items:center;gap:8px">🔧 <span style="color:#f59e0b">In Maintenance</span></h3>
        <button class="mclose" onclick="closeModal()">✕</button>
      </div>
      <div class="mbody">${html}</div>
      <div class="mfoot">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();nav('maintenance')">View Maintenance →</button>
      </div>`;
    _showModal('maint-detail');
  };
  buildModal(rows);
  try {
    const r = await API.get('/equipment?status=maintenance&limit=100');
    const items = r.data || [];
    if (!items.length) { buildModal('<p style="text-align:center;color:var(--c-muted);padding:20px">No equipment in maintenance.</p>'); return; }
    const rowsHtml = items.map(eq => `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="width:42px;height:42px;border-radius:10px;background:#f59e0b20;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🔧</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--txt)">${esc(eq.brand||'')} ${esc(eq.model||'')} <code class="at" style="font-size:11px">${esc(eq.asset_tag||'')}</code></div>
          <div style="font-size:12px;color:var(--c-muted);margin-top:2px">${esc(eq.category||'')}${eq.location ? ' · ' + esc(eq.location) : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span style="font-size:11px;background:#f59e0b20;color:#f59e0b;padding:3px 8px;border-radius:20px;font-weight:600">Maintenance</span>
        </div>
      </div>`).join('');
    buildModal(`<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#92400e">
      🔧 ${items.length} equipment currently under maintenance.
    </div>${rowsHtml}`);
  } catch { buildModal('<p style="color:var(--c-muted);text-align:center;padding:20px">Could not load data.</p>'); }
}

// ── RETIRED ASSETS DETAIL MODAL ───────────────────────────────
async function showRetiredDetail() {
  let rows = '<p style="color:var(--c-muted);text-align:center;padding:20px 0">Loading...</p>';
  const buildModal = (html) => {
    let modal = document.getElementById('modal-retired-detail');
    if (!modal) { modal = document.createElement('div'); modal.id = 'modal-retired-detail'; modal.className = 'modal modal-sm'; document.body.appendChild(modal); }
    modal.innerHTML = `
      <div class="mhead">
        <h3 style="display:flex;align-items:center;gap:8px">🗄️ <span style="color:#6b7280">Retired Assets</span></h3>
        <button class="mclose" onclick="closeModal()">✕</button>
      </div>
      <div class="mbody">${html}</div>
      <div class="mfoot">
        <button class="btn btn-outline" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();nav('equipment')">View Equipment →</button>
      </div>`;
    _showModal('retired-detail');
  };
  buildModal(rows);
  try {
    const r = await API.get('/equipment?status=retired&limit=100');
    const items = r.data || [];
    if (!items.length) { buildModal('<p style="text-align:center;color:var(--c-muted);padding:20px">No retired assets found.</p>'); return; }
    const rowsHtml = items.map(eq => `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="width:42px;height:42px;border-radius:10px;background:#6b728020;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🗄️</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--txt)">${esc(eq.brand||'')} ${esc(eq.model||'')} <code class="at" style="font-size:11px">${esc(eq.asset_tag||'')}</code></div>
          <div style="font-size:12px;color:var(--c-muted);margin-top:2px">${esc(eq.category||'')}${eq.purchase_date ? ' · Purchased: ' + fmtDate(eq.purchase_date) : ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span style="font-size:11px;background:#6b728020;color:#6b7280;padding:3px 8px;border-radius:20px;font-weight:600">Retired</span>
        </div>
      </div>`).join('');
    buildModal(`<div style="background:#f9fafb;border:1px solid #d1d5db;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#6b7280">
      🗄️ ${items.length} asset(s) have been retired from service.
    </div>${rowsHtml}`);
  } catch { buildModal('<p style="color:var(--c-muted);text-align:center;padding:20px">Could not load data.</p>'); }
}

function clearNotifs() {
  document.getElementById('np-list').innerHTML = '<p class="empty-msg">Cleared.</p>';
  document.getElementById('nbadge').style.display = 'none';
  document.getElementById('notif-panel').style.display = 'none';
}
function toggleNotif() {
  const p = document.getElementById('notif-panel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  const p   = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-btn');
  if (p && !p.contains(e.target) && btn && !btn.contains(e.target))
    p.style.display = 'none';
});

// ═════════════════════════════════════════════════════════════
// ── MODAL SYSTEM (FIXED) ───────────────────────────────────────
// openAddModal → reset → show   (for + Add buttons)
// editEquip/editEmp → show → fill (for Edit buttons, NO reset)
// ═════════════════════════════════════════════════════════════

function _showModal(type) {
  document.getElementById('overlay').classList.add('on');
  document.getElementById('modal-' + type).classList.add('on');
}

function _resetModal(type) {
  if (type === 'equipment') {
    document.getElementById('eq-id').value = '';
    document.getElementById('eq-mtitle').textContent = 'Add Equipment';
    ['eq-asset_tag','eq-brand','eq-model','eq-serial_number',
     'eq-purchase_price','eq-purchase_date','eq-warranty_expiry',
     'eq-location'].forEach(id => _setField(id,''));
    _setField('eq-category','');
    _setField('eq-status-m','available');
    _setField('eq-condition','good');
  }
  if (type === 'employee') {
    document.getElementById('emp-id').value = '';
    document.getElementById('emp-mtitle').textContent = 'Add Employee';
    ['emp-employee_id','emp-name','emp-email','emp-position',
     'emp-mobile_phone','emp-desk_phone','emp-location'].forEach(id => _setField(id,''));
    _setField('emp-department','');
  }
  if (type === 'assignment') {
    _setField('asgn-ret',''); _setField('asgn-notes','');
    document.getElementById('asgn-emp').innerHTML = '<option value="">Select employee...</option>';
    document.getElementById('asgn-eq').innerHTML  = '<option value="">Select equipment...</option>';
    prepareAssignModal();
  }
  if (type === 'maintenance') {
    openModal_maintenance(); return 'async'; // handles its own modal open + equipment loading
  }
}

// openModal called by + buttons in HTML
function openModalById(id) {
  document.getElementById(id).classList.add('on');
  document.getElementById('overlay').classList.add('on');
}

function openModal(type) {
  const result = _resetModal(type);
  if (result === 'async') return; // maintenance handles its own show
  _showModal(type);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('on');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('on'));
}

// ── EXPORT ─────────────────────────────────────────────────────
// ── EXPORT: Excel or PDF per page ──────────────────────────
async function exportData(type, fmt) {
  if (!fmt) { fmt = 'excel'; } // default to excel, no browser confirm
  const isExcel = fmt === 'excel';
  toast(`Preparing ${isExcel ? 'Excel' : 'PDF'}...`, 'info');
  try {
    if (isExcel) {
      const urlMap = { equipment:'/export/equipment', employees:'/export/employees', assignments:'/export/assignments' };
      await API.dl(urlMap[type], `${type}.xlsx`);
    } else {
      const urlMap = { equipment:'/export/equipment/pdf', employees:'/export/employees/pdf', assignments:'/export/assignments/pdf' };
      await API.dl(urlMap[type], `${type}.pdf`);
    }
    toast(`Downloaded ${type}.${isExcel?'xlsx':'pdf'} ✓`, 'ok');
  } catch(e) {
    // PDF might not be available — fallback to Excel
    if (!isExcel) {
      toast('PDF export unavailable — downloading Excel instead', 'warn');
      try { await API.dl(`/export/${type}`, `${type}.xlsx`); toast('Downloaded Excel ✓', 'ok'); } catch {}
    } else {
      toast('Export failed: ' + (e.message||'unknown error'), 'err');
    }
  }
}

async function exportAll() {
  // Initialize all rows as selected
  document.querySelectorAll('#export-checkboxes .export-check-row').forEach(row => {
    row.classList.add('selected');
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = true;
  });
  document.getElementById('export-progress').style.display = 'none';
  document.getElementById('export-progress-bar').style.width = '0%';
  _showModal('export-all');
}

function toggleExportRow(el) {
  // Use requestAnimationFrame to read state after browser processes click
  requestAnimationFrame(() => {
    const cb = el.querySelector('input[type="checkbox"]');
    if (!cb) return;
    el.classList.toggle('selected', cb.checked);
  });
}

async function runExportAll(fmt) {
  const selected = Array.from(document.querySelectorAll('#export-checkboxes input[type="checkbox"]'))
    .filter(cb => cb.checked).map(cb => cb.value);
  if (!selected.length) { toast('Select at least one table to export', 'warn'); return; }

  const prog = document.getElementById('export-progress');
  const bar  = document.getElementById('export-progress-bar');
  const lbl  = document.getElementById('export-progress-label');
  prog.style.display = 'block';

  const urlMap = {
    excel: { equipment:'/export/equipment', employees:'/export/employees', assignments:'/export/assignments' },
    pdf:   { equipment:'/export/equipment/pdf', employees:'/export/employees/pdf', assignments:'/export/assignments/pdf' },
  };
  const extMap = { excel: 'xlsx', pdf: 'pdf' };
  const ext = extMap[fmt];

  let done = 0;
  for (const type of selected) {
    lbl.textContent = `Downloading ${type}.${ext}...`;
    bar.style.width = Math.round((done / selected.length) * 100) + '%';
    try {
      if (fmt === 'pdf') {
        await exportPDF(type); // client-side, no server PDF needed
      } else {
        await API.dl(urlMap.excel[type], `${type}.xlsx`);
      }
    } catch(e) {
      if (fmt === 'pdf_skip') {
        try { await API.dl(urlMap.excel[type], `${type}.xlsx`); } catch {}
        toast(`PDF unavailable for ${type} — downloaded Excel`, 'warn');
      } else {
        toast(`Failed to export ${type}: ` + (e.message||''), 'err');
      }
    }
    done++;
    bar.style.width = Math.round((done / selected.length) * 100) + '%';
    await new Promise(r => setTimeout(r, 200));
  }
  lbl.textContent = `✓ All ${done} file(s) downloaded!`;
  bar.style.width = '100%';
  setTimeout(() => { closeModal(); toast(`${done} file(s) exported ✓`, 'ok'); }, 800);
}


// ── PAGINATION ──────────────────────────────────────────────────
function renderPag(prefix, total, limit, cur, cb) {
  const pages = Math.ceil(total / limit);
  const el = document.getElementById(prefix + '-pag');
  if (!el || pages <= 1) { if(el) el.innerHTML=''; return; }
  let h = '';
  for (let i=1; i<=Math.min(pages,8); i++)
    h += `<button class="pbtn ${i===cur?'on':''}" onclick="(${cb.toString()})(${i})">${i}</button>`;
  el.innerHTML = h;
}

// ── SKELETON ────────────────────────────────────────────────────
function showSkeleton(tbodyId, rows) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  const cols = tb.closest('table')?.querySelectorAll('th').length || 6;
  tb.innerHTML = Array.from({length:rows}, (_,ri) =>
    `<tr>${Array.from({length:cols}, (_,ci) =>
      `<td><div class="skel" style="height:16px;border-radius:6px;width:${55+Math.random()*38}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}

// ── TOAST ────────────────────────────────────────────────────────
function toast(msg, type='') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const icons = { ok:'✅', err:'❌', warn:'⚠️', info:'ℹ️' };
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span>${icons[type]||'💬'}</span><span class="toast-msg">${msg}</span><button class="toast-x" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; t.style.transition='all .3s'; }, 3200);
  setTimeout(() => t.remove(), 3600);
}

// ── UTILS ─────────────────────────────────────────────────────
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function _setField(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val === null || val === undefined) ? '' : val;
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDT(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
function timeAgo(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just now';
  if (m < 60) return m+'m ago';
  const h = Math.floor(m/60);
  if (h < 24) return h+'h ago';
  return Math.floor(h/24)+'d ago';
}

// ═══════════════════════════════════════════════════════════
// ── NEW FEATURES v4 ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

// ── PDF EXPORT ─────────────────────────────────────────────
async function exportPDF(type) {
  toast('Generating PDF...', 'info');
  try {
    // Try backend PDF route first (requires pdfkit installed)
    const urlMap = { equipment:'/export/equipment/pdf', employees:'/export/employees/pdf', assignments:'/export/assignments/pdf' };
    await API.dl(urlMap[type], type + '-report.pdf');
    toast('PDF downloaded ✓', 'ok');
  } catch(e) {
    // Fallback: generate PDF client-side without popup
    try {
      let rows = [], title = '', columns = [];
      if (type === 'equipment') {
        const r = await API.get('/equipment?limit=500&page=1');
        rows = r.data || [];
        title = 'Equipment Report';
        columns = ['asset_tag','category','brand','model','serial_number','status','condition','location'];
      } else if (type === 'employees') {
        const r = await API.get('/employees?limit=500&page=1');
        rows = r.data || [];
        title = 'Employees Report';
        columns = ['employee_id','name','department','position','email','mobile_phone'];
      } else if (type === 'assignments') {
        const r = await API.get('/assignments?limit=500&page=1');
        rows = r.data || [];
        title = 'Assignments Report';
        columns = ['employee_name','department','asset_tag','brand','model','assigned_date','expected_return'];
      }
      generateClientPDF(title, columns, rows, type + '-report.pdf');
      toast('PDF downloaded ✓', 'ok');
    } catch(e2) { toast('PDF export failed: ' + e2.message, 'err'); }
  }
}

function generateClientPDF(title, columns, rows, filename) {
  const colLabels = {
    asset_tag:'Asset Tag', category:'Category', brand:'Brand', model:'Model',
    serial_number:'Serial No.', status:'Status', condition:'Condition', location:'Location',
    employee_id:'Emp ID', name:'Name', department:'Department', position:'Position',
    email:'Email', mobile_phone:'Phone', employee_name:'Employee',
    assigned_date:'Assigned Date', expected_return:'Expected Return',
    brand_model:'Brand/Model', active_assignments:'Assets'
  };
  const now = new Date().toLocaleDateString('en-IN', { year:'numeric', month:'long', day:'numeric' });
  const tableRows = rows.map(row =>
    `<tr>${columns.map(c => `<td>${String(row[c]||'—').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>`).join('')}</tr>`
  ).join('');
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 12px; }
    .logo { font-size: 20px; font-weight: bold; color: #6366f1; }
    .logo span { color: #111; }
    .meta { font-size: 10px; color: #666; text-align: right; line-height: 1.6; }
    h2 { font-size: 15px; color: #111; margin-bottom: 6px; }
    .summary { font-size: 10px; color: #555; margin-bottom: 14px; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th { background: #6366f1; color: white; padding: 7px 8px; text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; vertical-align: top; }
    tr:nth-child(even) td { background: #f9fafb; }
    .footer { margin-top: 16px; font-size: 9px; color: #aaa; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    @media print {
      body { padding: 10px; }
      @page { margin: 12mm; size: A4 landscape; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style></head><body>
  <div class="header">
    <div><div class="logo">Asset<span>Pro</span></div><h2>${title}</h2></div>
    <div class="meta">Generated: ${now}<br>Total Records: ${rows.length}<br>AssetPro — IT Asset Management</div>
  </div>
  <table>
    <thead><tr>${columns.map(c => `<th>${colLabels[c]||c}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">AssetPro IT Asset Management System &nbsp;|&nbsp; Confidential</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  <\/script>
  </body></html>`;
  // Download as PDF directly - no popup needed
  const blob = new Blob([html], {type: 'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── IMAGE UPLOAD ────────────────────────────────────────────
async function uploadEquipmentImage(equipmentId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image too large (max 5MB)', 'warn'); return; }
    const formData = new FormData();
    formData.append('image', file);
    toast('Uploading image...', 'info');
    try {
      const res = await fetch(`/api/upload/equipment/${equipmentId}`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + API.getToken() },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        toast('Image uploaded!', 'ok');
        loadEquip();
      } else {
        toast(data.message || 'Upload failed', 'err');
      }
    } catch(e) { toast('Upload error: ' + e.message, 'err'); }
  };
  input.click();
}

// ── DEPRECIATION PAGE ───────────────────────────────────────
async function loadDepreciation() {
  const method = 'straight_line';
  const life = document.getElementById('dep-life')?.value || '5';
  const tbody = document.getElementById('dep-tbody');
  const summary = document.getElementById('dep-summary');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</td></tr>';
  try {
    const r = await API.get(`/depreciation?method=${method}&useful_life=${life}`);
    const items = r.data;
    const s = r.summary;
    if (summary) {
      summary.innerHTML = `
        <div class="kpi-card"><div class="kpi-label">Total Assets</div><div class="kpi-val">${s.total_assets}</div></div>
        <div class="kpi-card"><div class="kpi-label">Original Value</div><div class="kpi-val">₹${fmt(s.total_original_value)}</div></div>
        <div class="kpi-card" style="--kc:#f59e0b"><div class="kpi-label">Current Value</div><div class="kpi-val">₹${fmt(s.total_current_value)}</div></div>
        <div class="kpi-card" style="--kc:#ef4444"><div class="kpi-label">Depreciated</div><div class="kpi-val">₹${fmt(s.total_depreciated)}</div></div>
        <div class="kpi-card" style="--kc:#6366f1"><div class="kpi-label">Overall %</div><div class="kpi-val">${s.overall_percent_depreciated}%</div></div>
      `;
    }
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--c-muted)">No assets with purchase price/date data found.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(i => {
      const pctColor = i.percent_depreciated > 80 ? '#ef4444' : i.percent_depreciated > 50 ? '#f59e0b' : '#10b981';
      return `<tr>
        <td><span class="badge" style="background:#6366f120;color:#6366f1">${esc(i.asset_tag)}</span></td>
        <td><strong>${esc(i.brand || '')} ${esc(i.model || '')}</strong><br><small style="color:var(--c-muted)">${esc(i.category)}</small></td>
        <td>₹${fmt(i.purchase_price)}</td>
        <td style="color:${pctColor};font-weight:600">₹${fmt(i.current_value)}</td>
        <td>₹${fmt(i.total_depreciated)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:8px;background:var(--c-border);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.min(i.percent_depreciated,100)}%;background:${pctColor};border-radius:4px"></div>
            </div>
            <span style="font-size:12px;color:${pctColor};font-weight:600;min-width:36px">${i.percent_depreciated}%</span>
          </div>
        </td>
        <td>${i.age_years}y</td>
        <td><span class="status-badge ${i.is_fully_depreciated ? 'status-retired' : 'status-available'}">${i.is_fully_depreciated ? 'Fully Dep.' : `${i.remaining_life_years.toFixed(1)}y left`}</span></td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#ef4444">Error: ${e.message}</td></tr>`; }
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN');
}

// ── ACTIVITY TIMELINE (per asset) ──────────────────────────
async function showActivityTimeline(equipId, assetTag) {
  const modal = document.getElementById('timeline-modal');
  const body = document.getElementById('timeline-body');
  const title = document.getElementById('timeline-title');
  if (!modal || !body) return;
  if (title) title.textContent = `Activity Timeline — ${assetTag}`;
  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</div>';
  modal.classList.add('on');
  document.getElementById('overlay').classList.add('on');
  try {
    const r = await API.get(`/equipment/${equipId}`);
    const eq = r.data;
    const history = eq.assignment_history || [];
    if (!history.length) {
      body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-muted)">No assignment history for this asset.</div>';
      return;
    }
    body.innerHTML = `
      <div class="timeline">
        ${history.map((h, i) => `
          <div class="timeline-item">
            <div class="timeline-dot ${h.returned_date ? 'returned' : 'active'}"></div>
            <div class="timeline-content">
              <div class="tl-header">
                <strong>${esc(h.employee_name)}</strong>
                <span class="badge ${h.returned_date ? '' : 'badge-green'}">${h.returned_date ? 'Returned' : 'Active'}</span>
              </div>
              <div class="tl-dept">${h.department || ''}</div>
              <div class="tl-dates">
                <span>📅 Assigned: ${fmtDate(h.assigned_date)}</span>
                ${h.returned_date ? `<span>↩️ Returned: ${fmtDate(h.returned_date)}</span>` : ''}
                ${h.expected_return ? `<span>⏰ Expected: ${fmtDate(h.expected_return)}</span>` : ''}
              </div>
              ${h.condition_on_return ? `<div class="tl-condition">Condition on return: <strong>${h.condition_on_return}</strong></div>` : ''}
              ${h.return_reason ? `<div class="tl-reason">Reason: ${esc(h.return_reason)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;
  } catch(e) { body.innerHTML = `<div style="color:#ef4444;padding:16px">Error: ${e.message}</div>`; }
}

// ── BULK IMPORT (CSV) ───────────────────────────────────────
function openBulkImport() {
  const overlay = document.getElementById('overlay');
  const modal = document.getElementById('bulk-modal');
  if (!modal) return;
  document.getElementById('bulk-result')?.innerHTML && (document.getElementById('bulk-result').innerHTML = '');
  modal.classList.add('on');
  overlay.classList.add('on');
}

async function downloadCSVTemplate() {
  await API.dl('/bulk/template', 'equipment-import-template.csv');
  toast('Template downloaded!', 'ok');
}

async function submitBulkImport() {
  const fileInput = document.getElementById('bulk-file');
  const resultDiv = document.getElementById('bulk-result');
  if (!fileInput?.files?.[0]) { toast('Please select a CSV file', 'warn'); return; }
  const file = fileInput.files[0];
  if (!file.name.endsWith('.csv')) { toast('Only CSV files accepted', 'warn'); return; }
  const formData = new FormData();
  formData.append('file', file);
  resultDiv.innerHTML = '<div style="color:var(--c-muted)">Importing...</div>';
  try {
    const res = await fetch('/api/bulk/import/csv', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + API.getToken() },
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      resultDiv.innerHTML = `
        <div style="color:#10b981;font-weight:600">✅ ${data.message}</div>
        ${data.data.errors.length ? `<div style="color:#f59e0b;font-size:13px;margin-top:8px">${data.data.errors.join('<br>')}</div>` : ''}`;
      toast(data.message, 'ok');
      loadEquip();
    } else {
      resultDiv.innerHTML = `<div style="color:#ef4444">❌ ${data.message}</div>`;
      toast(data.message, 'err');
    }
  } catch(e) { toast('Import error: ' + e.message, 'err'); }
}

// ── PASSWORD RESET ──────────────────────────────────────────
async function submitForgotPassword() {
  const email = document.getElementById('forgot-email')?.value?.trim();
  const msgEl = document.getElementById('forgot-msg');
  if (!email) { if (msgEl) msgEl.textContent = 'Please enter your email.'; return; }
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (msgEl) {
      msgEl.style.color = data.success ? '#10b981' : '#ef4444';
      msgEl.textContent = data.message;
    }
    if (data.dev_token) console.log('[DEV] Reset token:', data.dev_token);
  } catch(e) { if (msgEl) msgEl.textContent = 'Error: ' + e.message; }
}


// ═══════════════════════════════════════════════════════════════
// ── SECURITY: Safe HTML helper (DOMPurify wrapper) ────────────
// ═══════════════════════════════════════════════════════════════
function esc(str) {
  if (str == null) return '';
  const s = String(str);
  if (typeof DOMPurify !== 'undefined') return DOMPurify.sanitize(s, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // Fallback: manual escape
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ═══════════════════════════════════════════════════════════════
// ── REAL-TIME DASHBOARD REFRESH ───────────────────────────────
// ═══════════════════════════════════════════════════════════════
let dashRefreshTimer  = null;
let dashLastRefreshed = null;
let dashTickTimer     = null;

function startDashRefresh() {
  stopDashRefresh();
  dashRefreshTimer = setInterval(() => {
    if (curPage === 'dashboard') {
      loadDash();
    }
  }, 30000); // 30 seconds

  dashTickTimer = setInterval(updateRefreshIndicator, 1000);
}

function stopDashRefresh() {
  if (dashRefreshTimer) clearInterval(dashRefreshTimer);
  if (dashTickTimer)    clearInterval(dashTickTimer);
  dashRefreshTimer = null;
  dashTickTimer    = null;
}

function markDashRefreshed() {
  dashLastRefreshed = Date.now();
  updateRefreshIndicator();
}

function updateRefreshIndicator() {
  const ind  = document.getElementById('refresh-ind');
  const text = document.getElementById('ri-text');
  if (!ind || !text || curPage !== 'dashboard') {
    if (ind) ind.style.display = 'none';
    return;
  }
  ind.style.display = 'flex';
  if (!dashLastRefreshed) { text.textContent = 'Loading...'; return; }
  const sec = Math.floor((Date.now() - dashLastRefreshed) / 1000);
  if (sec < 5)  text.textContent = 'Refreshed just now';
  else if (sec < 60) text.textContent = `Refreshed ${sec}s ago`;
  else          text.textContent = `Refreshed ${Math.floor(sec/60)}m ago`;
}

// ═══════════════════════════════════════════════════════════════
// ── GLOBAL SEARCH PAGE ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
let searchDebounce = null;

function handleGlobalSearch(e) {
  // Only used by global search page input
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(doGlobalSearch, 350);
}

async function doGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (!input) return;
  const q = input.value.trim();
  const meta = document.getElementById('search-meta');
  const resultsDiv = document.getElementById('search-results');
  const emptyDiv   = document.getElementById('search-empty');

  if (q.length < 2) {
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (emptyDiv)   emptyDiv.style.display   = 'none';
    if (meta)       meta.textContent = 'Type at least 2 characters to search...';
    return;
  }

  if (meta) meta.textContent = 'Searching...';
  try {
    const r = await API.get(`/search?q=${encodeURIComponent(q)}`);
    // Backend returns { total, data: { employees, equipment, assignments } }
    // Each item has: type, id, code(asset_tag/emp_id), title, subtitle, detail, badge(status)
    const equipment   = (r.data?.equipment   || []);
    const employees   = (r.data?.employees   || []);
    const assignments = (r.data?.assignments || []);
    const total = r.total || (equipment.length + employees.length + assignments.length);

    if (meta) meta.textContent = `Found ${total} result${total !== 1 ? 's' : ''} for "${esc(q)}"`;

    if (total === 0) {
      if (resultsDiv) resultsDiv.style.display = 'none';
      if (emptyDiv)   emptyDiv.style.display = 'block';
      return;
    }

    if (emptyDiv)   emptyDiv.style.display   = 'none';
    if (resultsDiv) resultsDiv.style.display = 'block';

    // Equipment results — backend returns: code=asset_tag, title=brand+model, subtitle=category, detail=serial, badge=status
    const eqCnt = document.getElementById('eq-search-cnt');
    const eqRes = document.getElementById('eq-search-results');
    if (eqCnt) eqCnt.textContent = equipment.length;
    if (eqRes) {
      eqRes.innerHTML = equipment.length === 0
        ? '<p style="padding:16px;color:var(--c-muted);text-align:center">No equipment found</p>'
        : equipment.map(eq => `
          <div onclick="searchGoTo('equipment',${eq.id},'${esc(eq.code||'')}')" style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <strong style="color:var(--txt)">${esc(eq.title||'')}</strong>
                <code class="at" style="margin-left:8px;font-size:11px">${esc(eq.code||'')}</code>
              </div>
              <span class="badge b-${esc(eq.badge||'')}" style="font-size:11px">${esc(eq.badge||'')}</span>
            </div>
            <div style="font-size:12px;color:var(--c-muted);margin-top:3px">
              ${esc(eq.subtitle||'—')} · S/N: ${esc(eq.detail||'—')}
            </div>
          </div>`).join('');
    }

    // Employee results — backend returns: code=employee_id, title=name, subtitle=department, detail=email, badge='EMP'
    const empCnt = document.getElementById('emp-search-cnt');
    const empRes = document.getElementById('emp-search-results');
    if (empCnt) empCnt.textContent = employees.length;
    if (empRes) {
      empRes.innerHTML = employees.length === 0
        ? '<p style="padding:16px;color:var(--c-muted);text-align:center">No employees found</p>'
        : employees.map(e => `
          <div onclick="searchGoTo('employees',${e.id},'${esc(e.title||'')}')" style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <strong style="color:var(--txt)">${esc(e.title||'')}</strong>
                <span style="color:var(--c-muted);font-size:12px;margin-left:6px">${esc(e.code||'')}</span>
              </div>
              <span class="dept" style="font-size:11px">${esc(e.subtitle||'')}</span>
            </div>
            <div style="font-size:12px;color:var(--c-muted);margin-top:3px">${esc(e.detail||'—')}</div>
          </div>`).join('');
    }

    // Assignment results
    const asgnCnt = document.getElementById('asgn-search-cnt');
    const asgnRes = document.getElementById('asgn-search-results');
    if (asgnCnt) asgnCnt.textContent = assignments.length;
    if (asgnRes && assignments.length > 0) {
      asgnRes.innerHTML = assignments.map(a => `
        <div onclick="searchGoTo('assignments',${a.id},'')" style="padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background=''">
          <div style="display:flex;justify-content:space-between">
            <strong style="color:var(--txt);font-size:13px">${esc(a.title||'')}</strong>
            <span class="badge b-${esc(a.badge||'active')}" style="font-size:11px">${esc(a.badge||'active')}</span>
          </div>
          <div style="font-size:12px;color:var(--c-muted)">${esc(a.subtitle||'')} · ${esc(a.code||'')}</div>
        </div>`).join('');
    }
  } catch(err) {
    if (meta) meta.textContent = 'Search failed: ' + err.message;
    console.error('Search error:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Navigate from search result to specific entity page with search pre-filled
function searchGoTo(page, id, searchTerm) {
  nav(page);
  if (page === 'equipment' && searchTerm) {
    const gs = document.getElementById('eq-search');
    if (gs) { gs.value = searchTerm; loadEquip(1, searchTerm); }
  }
  if (page === 'employees' && searchTerm) {
    const gs = document.getElementById('emp-search');
    if (gs) { gs.value = searchTerm; loadEmp(1, searchTerm); }
  }
  if (page === 'assignments') {
    loadAsgn();
  }
}

// ── MAINTENANCE PAGE ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
async function loadMaintenance() {
  const status = document.getElementById('maint-status')?.value || '';
  const type   = document.getElementById('maint-type')?.value   || '';
  const tbody  = document.getElementById('maint-tbody');
  const cnt    = document.getElementById('maint-cnt');
  const kpis   = document.getElementById('maint-kpis');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</td></tr>';

  try {
    // Load stats + due items in parallel
    const [r, dueR, statsR] = await Promise.all([
      API.get(`/maintenance?status=${status}&type=${type}&limit=100`),
      API.get('/maintenance/due'),
      API.get('/maintenance/stats'),
    ]);

    // KPI cards
    if (kpis && statsR.data) {
      const s = statsR.data;
      kpis.innerHTML = `
        <div class="kpi kb" style="cursor:pointer" onclick="setMaintFilter('scheduled')">
          <div class="kpi-ic">📅</div>
          <div><div class="kpi-val">${s.scheduled}</div><div class="kpi-lbl">Scheduled</div></div>
        </div>
        <div class="kpi ky" style="cursor:pointer" onclick="setMaintFilter('in_progress')">
          <div class="kpi-ic">⚙️</div>
          <div><div class="kpi-val">${s.in_progress}</div><div class="kpi-lbl">In Progress</div></div>
        </div>
        <div class="kpi kg" style="cursor:pointer" onclick="setMaintFilter('completed')">
          <div class="kpi-ic">✅</div>
          <div><div class="kpi-val">${s.completed}</div><div class="kpi-lbl">Completed</div></div>
        </div>
        <div class="kpi kr" style="cursor:pointer" onclick="setMaintFilter('overdue')">
          <div class="kpi-ic">🚨</div>
          <div><div class="kpi-val">${s.overdue}</div><div class="kpi-lbl">Overdue</div></div>
        </div>
        <div class="kpi kp" style="cursor:pointer" onclick="setMaintFilter('')">
          <div class="kpi-ic">💰</div>
          <div><div class="kpi-val">₹${fmt(s.total_cost)}</div><div class="kpi-lbl">Total Cost (All)</div></div>
        </div>`;
    }

    // Due/overdue alert
    const dueAlert = document.getElementById('maint-due-alert');
    const dueList  = document.getElementById('maint-due-list');
    if (dueR.data && dueR.data.length > 0) {
      if (dueAlert) dueAlert.style.display = 'block';
      if (dueList) {
        dueList.innerHTML = dueR.data.map(d => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
              <strong>${esc(d.asset_tag)}</strong> — ${esc(d.brand||'')} ${esc(d.model||'')}
              <span class="badge" style="margin-left:6px;background:${d.urgency==='overdue'?'#ef444420':'#f59e0b20'};color:${d.urgency==='overdue'?'#ef4444':'#f59e0b'}">${d.urgency === 'overdue' ? '🚨 OVERDUE' : '⚠️ Due Soon'}</span>
            </div>
            <span style="font-size:12px;color:var(--c-muted)">${esc(d.scheduled_date)}</span>
          </div>`).join('');
      }
    } else {
      if (dueAlert) dueAlert.style.display = 'none';
    }

    // Table
    const rows = r.data;
    if (cnt) cnt.textContent = `${rows.length} records`;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--c-muted)">No maintenance records found.</td></tr>';
      return;
    }

    const statusColors = { scheduled:'#6366f1', in_progress:'#f59e0b', completed:'#10b981', cancelled:'#6b7280' };
    const typeIcons    = { scheduled:'📅', repair:'🔨', inspection:'🔎', upgrade:'⬆️', cleaning:'🧹' };

    tbody.innerHTML = rows.map(m => `<tr>
      <td>
        <span class="badge" style="background:var(--primary-light);color:var(--primary)">${esc(m.asset_tag)}</span><br>
        <small style="color:var(--c-muted)">${esc(m.brand)} ${esc(m.model)}</small>
      </td>
      <td><span>${typeIcons[m.type]||'🔧'} ${esc(m.type)}</span></td>
      <td><strong>${esc(m.title)}</strong>${m.description ? `<br><small style="color:var(--c-muted)">${esc(m.description.substring(0,60))}${m.description.length>60?'...':''}</small>` : ''}</td>
      <td>${m.scheduled_date ? esc(m.scheduled_date) : '<span style="color:var(--c-muted)">—</span>'}</td>
      <td><span class="status-badge" style="background:${statusColors[m.status]||'#6b7280'}20;color:${statusColors[m.status]||'#6b7280'}">${esc(m.status.replace('_',' '))}</span></td>
      <td>${m.cost ? '₹' + fmt(m.cost) : '<span style="color:var(--c-muted)">—</span>'}</td>
      <td>${esc(m.vendor||'—')}</td>
      <td>
        <button class="btn-tbl" onclick="editMaintenance(${m.id})" title="Edit">✏️</button>
        ${m.status !== 'completed' ? `<button class="btn-tbl" style="color:#10b981" onclick="completeMaintenance(${m.id})" title="Mark complete">✅</button>` : ''}
        <button class="btn-tbl d" onclick="deleteMaintenance(${m.id})" title="Delete">🗑️</button>
      </td>
    </tr>`).join('');
  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#ef4444">Error: ${esc(err.message)}</td></tr>`;
  }
}

function setMaintFilter(status) {
  const sel = document.getElementById('maint-status');
  if (sel) sel.value = status;
  loadMaintenance();
}

async function openModal_maintenance() {
  // populate equipment dropdown — always fresh
  const sel = document.getElementById('maint-equipment_id');
  if (sel) {
    sel.innerHTML = '<option value="">Loading equipment...</option>';
    try {
      const r = await API.get('/equipment?limit=500&page=1');
      if (r.data && r.data.length > 0) {
        sel.innerHTML = '<option value="">Select equipment...</option>' +
          r.data.map(eq => `<option value="${eq.id}">${esc(eq.asset_tag||'')} — ${esc(eq.brand||'')} ${esc(eq.model||'')} [${esc(eq.status)}]</option>`).join('');
      } else {
        sel.innerHTML = '<option value="">No equipment found</option>';
      }
    } catch(e) {
      sel.innerHTML = '<option value="">Error loading equipment</option>';
      console.error('Maintenance modal equipment load error:', e);
    }
  }
  document.getElementById('maint-id').value = '';
  document.getElementById('maint-title').value = '';
  document.getElementById('maint-description').value = '';
  document.getElementById('maint-scheduled_date').value = '';
  document.getElementById('maint-completed_date').value = '';
  document.getElementById('maint-cost').value = '';
  document.getElementById('maint-vendor').value = '';
  document.getElementById('maint-notes').value = '';
  document.getElementById('maint-status-m').value = 'scheduled';
  document.getElementById('maint-type-m').value = 'scheduled';
  document.getElementById('maint-mtitle').textContent = 'Schedule Maintenance';
  openModalById('modal-maintenance');
}

async function editMaintenance(id) {
  try {
    const r = await API.get(`/maintenance?status=&type=&limit=500`);
    const rec = r.data.find(m => m.id === id);
    if (!rec) return;
    await openModal_maintenance();
    document.getElementById('maint-id').value       = rec.id;
    document.getElementById('maint-equipment_id').value = rec.equipment_id;
    document.getElementById('maint-type-m').value   = rec.type;
    document.getElementById('maint-title').value    = rec.title;
    document.getElementById('maint-description').value = rec.description || '';
    document.getElementById('maint-scheduled_date').value = rec.scheduled_date || '';
    document.getElementById('maint-completed_date').value = rec.completed_date || '';
    document.getElementById('maint-status-m').value = rec.status;
    document.getElementById('maint-cost').value     = rec.cost || '';
    document.getElementById('maint-vendor').value   = rec.vendor || '';
    document.getElementById('maint-notes').value    = rec.notes || '';
    document.getElementById('maint-mtitle').textContent = 'Edit Maintenance Record';
  } catch(e) { toast('Failed to load record', 'error'); }
}

async function completeMaintenance(id) {
  try {
    const allR = await API.get(`/maintenance?limit=500`);
    const rec = allR.data.find(m => m.id === id);
    if (!rec) { toast('Record not found', 'err'); return; }
    // Joi schema: equipment_id, type, description(min 3) all required
    const desc = rec.description || rec.notes || 'Maintenance completed';
    const body = {
      equipment_id:      rec.equipment_id,
      type:              rec.type || 'service',
      title:             rec.title || 'Maintenance',
      description:       desc.length >= 3 ? desc : desc + ' task',
      vendor:            rec.vendor || null,
      performed_by:      rec.performed_by || null,
      cost:              rec.cost || 0,
      status:            'completed',
      scheduled_date:    rec.scheduled_date || null,
      completed_date:    new Date().toISOString().split('T')[0],
      next_service_date: rec.next_service_date || null,
      notes:             rec.notes || null,
    };
    await API.put(`/maintenance/${id}`, body);
    toast('Marked as completed ✅', 'ok');
    loadMaintenance();
  } catch(e) { toast(e.message || 'Failed to update', 'err'); }
}

async function deleteMaintenance(id) {
  if (!confirm('Delete this maintenance record?')) return;
  try {
    await API.del(`/maintenance/${id}`);
    toast('Deleted ✓', 'ok');
    loadMaintenance();
  } catch(e) { toast(e.message || 'Delete failed', 'err'); }
}

async function saveMaintenance() {
  const id    = document.getElementById('maint-id').value;
  const titleVal = document.getElementById('maint-title')?.value?.trim() || '';
  const descVal  = document.getElementById('maint-description')?.value?.trim() || '';
  const body  = {
    equipment_id:    parseInt(document.getElementById('maint-equipment_id').value),
    type:            document.getElementById('maint-type-m').value || 'service',
    title:           titleVal || 'Maintenance',
    description:     descVal.length >= 3 ? descVal : (titleVal.length >= 3 ? titleVal : 'Maintenance task'),
    vendor:          document.getElementById('maint-vendor')?.value?.trim() || null,
    performed_by:    document.getElementById('maint-vendor')?.value?.trim() || null,
    scheduled_date:  document.getElementById('maint-scheduled_date')?.value || null,
    completed_date:  document.getElementById('maint-completed_date')?.value || null,
    status:          document.getElementById('maint-status-m')?.value || 'scheduled',
    cost:            parseFloat(document.getElementById('maint-cost')?.value) || 0,
    notes:           document.getElementById('maint-notes')?.value?.trim() || null,
    next_service_date: null,
  };
  if (!body.equipment_id || isNaN(body.equipment_id)) { toast('Select equipment', 'warn'); return; }
  if (!titleVal || titleVal.length < 2) { toast('Title is required', 'warn'); return; }
  try {
    if (id) {
      await API.put(`/maintenance/${id}`, body);
      toast('Updated ✅', 'success');
    } else {
      await API.post('/maintenance', body);
      toast('Scheduled ✅', 'success');
    }
    closeModal();
    loadMaintenance();
  } catch(e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════
// ── REPORTS PAGE ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
let deptBarChartInst = null, deptValueChartInst = null, costCatChartInst = null, yearlyChartInst = null;
let currentReportTab = 'dept';

function switchReportTab(tab) {
  currentReportTab = tab;
  const dv = document.getElementById('reports-dept-view');
  const cv = document.getElementById('reports-cost-view');
  const td = document.getElementById('tab-dept');
  const tc = document.getElementById('tab-cost');
  if (tab === 'dept') {
    if (dv) dv.style.display = 'block';
    if (cv) cv.style.display = 'none';
    if (td) td.classList.add('btn-primary'); if (td) td.classList.remove('btn-outline');
    if (tc) tc.classList.remove('btn-primary'); if (tc) tc.classList.add('btn-outline');
  } else {
    if (dv) dv.style.display = 'none';
    if (cv) cv.style.display = 'block';
    if (tc) tc.classList.add('btn-primary'); if (tc) tc.classList.remove('btn-outline');
    if (td) td.classList.remove('btn-primary'); if (td) td.classList.add('btn-outline');
    loadCostReport();
  }
}

async function loadReports() {
  await loadDeptReport();
}

async function loadDeptReport() {
  const tbody = document.getElementById('dept-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</td></tr>';

  try {
    const r = await API.get('/reports/by-department');
    const data = r.data;

    // Charts
    const labels = data.map(d => d.department);
    const asgns  = data.map(d => d.active_assignments || d.assigned_assets || 0);
    const vals   = data.map(d => Math.round((d.total_asset_value || 0) / 1000));
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

    if (deptBarChartInst)   { deptBarChartInst.destroy();   deptBarChartInst   = null; }
    if (deptValueChartInst) { deptValueChartInst.destroy(); deptValueChartInst = null; }
    const c1 = document.getElementById('deptBarChart');
    const c2 = document.getElementById('deptValueChart');
    if (c1) deptBarChartInst = new Chart(c1, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Active Assets', data: asgns, backgroundColor: colors.slice(0, labels.length), borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    if (c2) deptValueChartInst = new Chart(c2, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Value (₹ thousands)', data: vals, backgroundColor: colors.map(c=>c+'90'), borderColor: colors, borderWidth: 1.5, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    // Table
    tbody.innerHTML = data.map(d => {
      const empCount = d.employee_count || d.total_employees || 0;
      const assetVal = d.total_asset_value || 0;
      const assetPer = empCount > 0 ? (assetVal / empCount).toFixed(1) : '0';
      return `<tr>
        <td><strong>${esc(d.department)}</strong></td>
        <td>${empCount}</td>
        <td><span class="badge" style="background:var(--primary-light);color:var(--primary)">${d.active_assignments || d.assigned_assets || 0}</span></td>
        <td>₹${fmt(assetVal)}</td>
        <td>₹${fmt(Math.round(assetVal / Math.max(empCount,1)))}</td>
        <td>${assetPer}</td>
        <td style="font-size:12px;color:var(--c-muted)">${(d.categories||[]).slice(0,3).map(c=>`${esc(c.category)}(${c.count})`).join(', ')}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;padding:32px">Error: ${esc(err.message)}</td></tr>`;
  }
}

async function loadCostReport() {
  const tbody = document.getElementById('cost-tbody');
  if (!tbody) return;
  try {
    const r = await API.get('/reports/cost-analysis');
    if (!r.success) throw new Error(r.message || 'Failed to load');
    const { by_category, yearly_spend, total_spend } = r.data;

    const labels = by_category.map(c => c.category);
    const costs  = by_category.map(c => Math.round(c.total_cost / 1000));
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16','#a3e635','#fb923c'];

    if (costCatChartInst) { costCatChartInst.destroy(); costCatChartInst = null; }
    if (yearlyChartInst)  { yearlyChartInst.destroy();  yearlyChartInst  = null; }
    const c1 = document.getElementById('costCatChart');
    const c2 = document.getElementById('yearlyChart');
    if (c1) costCatChartInst = new Chart(c1, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: costs, backgroundColor: colors.slice(0, labels.length), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
    if (c2 && yearly_spend.length) {
      const yLabels = yearly_spend.map(y => y.year);
      const ySpend  = yearly_spend.map(y => Math.round(y.total_spend / 1000));
      yearlyChartInst = new Chart(c2, {
        type: 'line',
        data: { labels: yLabels.reverse(), datasets: [{ label: '₹ (thousands)', data: ySpend.reverse(), fill: true, backgroundColor: '#6366f120', borderColor: '#6366f1', tension: 0.4, pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }

    tbody.innerHTML = by_category.map(c => `<tr>
      <td><strong>${esc(c.category)}</strong></td>
      <td>${c.total_items}</td>
      <td>₹${fmt(c.total_cost)}</td>
      <td>₹${fmt(Math.round(c.avg_cost))}</td>
      <td>₹${fmt(c.max_cost)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;min-width:80px">
            <div style="height:100%;width:${c.percentage_of_total}%;background:#6366f1;border-radius:4px"></div>
          </div>
          <span style="font-size:12px;font-weight:600;color:#6366f1">${c.percentage_of_total}%</span>
        </div>
      </td>
    </tr>`).join('');
  } catch(err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:#ef4444;text-align:center;padding:32px">Error: ${esc(err.message)}</td></tr>`;
  }
}


// ═══════════════════════════════════════════════════════════════
// ── ASSET LIFECYCLE TIMELINE ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════
const LIFECYCLE_TRANSITIONS = {
  procurement: ['available'],
  available:   ['maintenance','retiring','retired','lost'],
  assigned:    ['maintenance'],
  maintenance: ['available','retiring','retired'],
  retiring:    ['retired'],
  retired:     [],
  lost:        ['available']
};
const LIFECYCLE_STATUS_COLORS = {
  procurement: '#6366f1', available: '#10b981', assigned: '#3b82f6',
  maintenance: '#f59e0b', retiring: '#f97316',  retired: '#6b7280',   lost: '#ef4444'
};
const LIFECYCLE_ICONS = {
  procurement: '📦', available: '✅', assigned: '🔗',
  maintenance: '🔧', retiring: '📉',  retired: '🗄️',   lost: '❌'
};

async function showLifecycleTimeline(equipId, assetTag, currentStatus) {
  const modal  = document.getElementById('lifecycle-modal');
  const title  = document.getElementById('lifecycle-title');
  const body   = document.getElementById('lifecycle-timeline');
  const btns   = document.getElementById('lifecycle-btns');
  if (!modal) return;

  if (title) title.textContent = `Lifecycle — ${assetTag}`;
  if (body)  body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</div>';
  modal.classList.add('on');
  document.getElementById('overlay').classList.add('on');

  // Transition buttons (role-based)
  if (btns && CUR_USER && (CUR_USER.role === 'admin' || CUR_USER.role === 'manager')) {
    const allowed = LIFECYCLE_TRANSITIONS[currentStatus] || [];
    btns.innerHTML = allowed.length === 0
      ? '<span style="color:var(--c-muted);font-size:13px">No further transitions possible from this status.</span>'
      : allowed.map(s => `
          <button class="btn btn-sm" style="background:${LIFECYCLE_STATUS_COLORS[s]}20;color:${LIFECYCLE_STATUS_COLORS[s]};border:1px solid ${LIFECYCLE_STATUS_COLORS[s]}"
            onclick="doLifecycleTransition(${equipId}, '${s}', '${assetTag}')">
            ${LIFECYCLE_ICONS[s]} → ${s}
          </button>`).join('');
  } else if (btns) {
    btns.innerHTML = '<span style="color:var(--c-muted);font-size:13px">View-only mode.</span>';
  }

  try {
    const r = await API.get(`/equipment/${equipId}/lifecycle`);
    const events = r.data;

    if (!events.length) {
      body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-muted)">No lifecycle events recorded yet.</div>';
      return;
    }

    body.innerHTML = `
      <div style="position:relative;padding-left:32px">
        <div style="position:absolute;left:12px;top:0;bottom:0;width:2px;background:var(--border)"></div>
        ${events.map((ev, i) => `
          <div style="position:relative;margin-bottom:20px">
            <div style="position:absolute;left:-26px;top:4px;width:14px;height:14px;border-radius:50%;background:${LIFECYCLE_STATUS_COLORS[ev.to_status]||'#6366f1'};border:2px solid var(--surf);box-shadow:0 0 0 3px ${LIFECYCLE_STATUS_COLORS[ev.to_status]||'#6366f1'}30"></div>
            <div class="card" style="padding:12px 16px;margin-bottom:0">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <span style="font-size:12px;color:var(--c-muted)">${ev.from_status ? esc(ev.from_status) + ' →' : 'Initial:'}</span>
                  <strong style="margin-left:4px;color:${LIFECYCLE_STATUS_COLORS[ev.to_status]||'var(--txt)'}">${LIFECYCLE_ICONS[ev.to_status]||''} ${esc(ev.to_status)}</strong>
                </div>
                <span style="font-size:11px;color:var(--c-muted)">${esc(ev.created_at?.split('T')[0]||ev.created_at||'')}</span>
              </div>
              ${ev.reason ? `<div style="font-size:13px;color:var(--c-muted);margin-top:4px">${esc(ev.reason)}</div>` : ''}
              ${ev.changed_by_name ? `<div style="font-size:11px;color:var(--c-muted);margin-top:2px">By: ${esc(ev.changed_by_name)}</div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
  } catch(err) {
    if (body) body.innerHTML = `<div style="color:#ef4444;text-align:center;padding:32px">Error: ${esc(err.message)}</div>`;
  }
}

async function doLifecycleTransition(equipId, toStatus, assetTag) {
  const reason = prompt(`Reason for changing ${assetTag} → ${toStatus} (optional):`);
  if (reason === null) return; // cancelled
  try {
    await API.post(`/equipment/${equipId}/transition`, { to_status: toStatus, reason: reason || null });
    toast(`Status changed to "${toStatus}" ✅`, 'success');
    closeModal();
    if (curPage === 'equipment') loadEquip();
  } catch(err) {
    toast(err.message, 'error');
  }
}


// ═══════════════════════════════════════════════════════════
// ── FEATURE 6: GLOBAL SEARCH ───────────────────────────────
// ═══════════════════════════════════════════════════════════
let _gSearchTm = null;


function gotoResult(type, id) {
  nav(type);
}

// Close search results when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) {
    const panel = document.getElementById('gsearch-results');
    if (panel) panel.style.display = 'none';
  }
});

// ═══════════════════════════════════════════════════════════
// ── FEATURE 1: MAINTENANCE TRACKER ─────────────────────────
// ═══════════════════════════════════════════════════════════
let _maintTab = 'logs';

function switchMaintTab(tab) {
  _maintTab = tab;
  document.getElementById('mtab-logs').classList.toggle('active', tab === 'logs');
  document.getElementById('mtab-schedules').classList.toggle('active', tab === 'schedules');
  document.getElementById('maint-logs-panel').style.display = tab === 'logs' ? '' : 'none';
  document.getElementById('maint-schedules-panel').style.display = tab === 'schedules' ? '' : 'none';
  if (tab === 'logs') loadMaintLogs();
  else loadMaintSchedules();
}


async function loadMaintDue() {
  try {
    const r = await API.get('/maintenance/due?days=14');
    const strip = document.getElementById('maint-due-strip');
    if (!strip) return;
    if (!r.data.length) { strip.innerHTML = ''; return; }
    strip.innerHTML = `
      <div class="alert-strip alert-warn">
        ⚠️ <strong>${r.data.length} asset(s) due for service within 14 days:</strong>
        ${r.data.map(d =>
          `<span class="badge-tag" style="cursor:pointer">${esc(d.asset_tag)} – ${esc(d.service_type)} (${d.days_until_due >= 0 ? `in ${d.days_until_due}d` : 'OVERDUE'})</span>`
        ).join('')}
      </div>`;
  } catch(e) {}
}

async function loadMaintLogs() {
  const tbody = document.getElementById('maint-log-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</td></tr>';
  try {
    const r = await API.get('/maintenance?limit=100');
    const logs = r.data;
    const cnt = document.getElementById('maint-log-cnt');
    if (cnt) cnt.textContent = `${logs.length} records`;
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty-ico">🔧</div><h4>No maintenance logs yet</h4><p>Log the first service event</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(l => `<tr>
      <td><span class="badge" style="background:#6366f120;color:#6366f1">${esc(l.asset_tag)}</span></td>
      <td><strong>${esc(l.brand || '')} ${esc(l.model || '')}</strong><br><small style="color:var(--c-muted)">${esc(l.category)}</small></td>
      <td>${esc(l.service_type)}</td>
      <td>${esc(l.performed_by || '—')}</td>
      <td>${l.performed_date ? l.performed_date.split('T')[0] : '—'}</td>
      <td>${l.cost ? '₹' + fmt(l.cost) : '—'}</td>
      <td>${l.next_service_date ? `<span style="color:var(--c-primary)">${l.next_service_date.split('T')[0]}</span>` : '—'}</td>
    </tr>`).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center">Error: ${esc(e.message)}</td></tr>`; }
}

async function loadMaintSchedules() {
  const tbody = document.getElementById('maint-sched-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--c-muted)">Loading...</td></tr>';
  try {
    const r = await API.get('/maintenance/schedules');
    const items = r.data;
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty-ico">📅</div><h4>No schedules</h4><p>Create maintenance schedules to track service</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = items.map(s => {
      const isOverdue = s.days_until_due < 0;
      const isDueSoon = s.days_until_due >= 0 && s.days_until_due <= 7;
      const dueColor = isOverdue ? '#ef4444' : isDueSoon ? '#f59e0b' : '#10b981';
      return `<tr>
        <td><span class="badge" style="background:#6366f120;color:#6366f1">${esc(s.asset_tag)}</span></td>
        <td><strong>${esc(s.brand || '')} ${esc(s.model || '')}</strong></td>
        <td>${esc(s.service_type)}</td>
        <td>${s.frequency_days ? `Every ${s.frequency_days}d` : '—'}</td>
        <td>${s.next_service_date ? s.next_service_date.split('T')[0] : '—'}</td>
        <td style="color:${dueColor};font-weight:600">
          ${isOverdue ? '🔴 OVERDUE' : isDueSoon ? `⚠️ In ${s.days_until_due}d` : `✅ In ${s.days_until_due}d`}
        </td>
        <td>
          <button class="btn-tbl" onclick="deleteSchedule(${s.id})">🗑 Remove</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444">Error: ${esc(e.message)}</td></tr>`; }
}

async function saveMaintLog() {
  const payload = {
    equipment_id: parseInt(document.getElementById('ml-equipment_id').value),
    service_type:      document.getElementById('ml-service_type').value.trim(),
    performed_by:      document.getElementById('ml-performed_by').value.trim(),
    performed_date:    document.getElementById('ml-performed_date').value,
    cost:              parseFloat(document.getElementById('ml-cost').value) || null,
    next_service_date: document.getElementById('ml-next_service_date').value || null,
    parts_replaced:    document.getElementById('ml-parts_replaced').value.trim() || null,
    description:       document.getElementById('ml-description').value.trim() || null,
  };
  if (!payload.equipment_id) return toast('Select equipment', 'warn');
  if (!payload.service_type) return toast('Service type required', 'warn');
  if (!payload.performed_date) return toast('Date required', 'warn');
  try {
    await API.post('/maintenance', payload);
    toast('Maintenance logged ✓', 'ok');
    closeModal();
    loadMaintenance();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function saveMainSchedule() {
  const payload = {
    equipment_id:      parseInt(document.getElementById('ms-equipment_id').value),
    service_type:      document.getElementById('ms-service_type').value.trim(),
    frequency_days:    parseInt(document.getElementById('ms-frequency_days').value) || null,
    next_service_date: document.getElementById('ms-next_service_date').value,
    notes:             document.getElementById('ms-notes').value.trim() || null,
  };
  if (!payload.equipment_id) return toast('Select equipment', 'warn');
  if (!payload.service_type) return toast('Service type required', 'warn');
  if (!payload.next_service_date) return toast('Next service date required', 'warn');
  try {
    await API.post('/maintenance/schedules', payload);
    toast('Schedule created ✓', 'ok');
    closeModal();
    loadMaintSchedules();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function deleteSchedule(id) {
  if (!confirm('Remove this maintenance schedule?')) return;
  try {
    await API.delete(`/maintenance/schedules/${id}`);
    toast('Schedule removed', 'ok');
    loadMaintSchedules();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

// Populate maintenance modal equipment dropdowns
async function populateMaintEquipDropdowns() {
  try {
    const r = await API.get('/equipment?limit=200');
    const opts = r.data.map(e => `<option value="${e.id}">${esc(e.asset_tag)} – ${esc(e.brand || '')} ${esc(e.model || '')}</option>`).join('');
    const sel1 = document.getElementById('ml-equipment_id');
    const sel2 = document.getElementById('ms-equipment_id');
    if (sel1) sel1.innerHTML = '<option value="">Select equipment...</option>' + opts;
    if (sel2) sel2.innerHTML = '<option value="">Select equipment...</option>' + opts;
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════
// ── FEATURE 2: DEPARTMENT REPORTS ──────────────────────────
// ═══════════════════════════════════════════════════════════
let _deptBarChart = null, _deptValChart = null;


// ═══════════════════════════════════════════════════════════
// ── FEATURE 3: LIFECYCLE STATUS TRANSITIONS ─────────────────
// ═══════════════════════════════════════════════════════════
async function changeEquipStatus(id, currentStatus, assetTag) {
  const TRANSITIONS = {
    available:   ['maintenance', 'retiring', 'retired', 'lost'],
    maintenance: ['available', 'retiring', 'retired'],
    retiring:    ['retired'],
    retired:     [],
    lost:        ['available'],
    procurement: ['available'],
    assigned:    ['maintenance'],
  };
  const allowed = TRANSITIONS[currentStatus] || [];
  if (!allowed.length) return toast(`No transitions allowed from '${currentStatus}'`, 'warn');

  const choice = await pickStatus(assetTag, currentStatus, allowed);
  if (!choice) return;
  const reason = prompt(`Reason for changing to '${choice.status}' (optional):`);
  if (reason === null) return; // cancelled

  try {
    await API.patch(`/equipment/${id}/status`, { status: choice.status, reason: reason || null });
    toast(`Status changed to '${choice.status}' ✓`, 'ok');
    loadEquip();
  } catch(e) { toast('Error: ' + e.message, 'err'); }
}

async function viewLifecycle(id, assetTag) {
  try {
    const r = await API.get(`/equipment/${id}/lifecycle`);
    const timeline = r.data;
    const modal = document.getElementById('timeline-modal');
    const title = document.getElementById('timeline-title');
    const body = document.getElementById('timeline-body');
    if (!modal) return;
    if (title) title.textContent = `Lifecycle: ${assetTag}`;
    if (!timeline.length) {
      body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--c-muted)">No lifecycle transitions recorded yet.</div>';
    } else {
      body.innerHTML = `<div class="timeline">` +
        timeline.map((t, i) => `
          <div class="tl-item">
            <div class="tl-dot" style="background:${t.to_status==='retired'?'#ef4444':t.to_status==='maintenance'?'#f59e0b':'#6366f1'}"></div>
            <div class="tl-content">
              <div class="tl-head">
                <span class="status-badge status-${t.to_status}">${esc(t.to_status)}</span>
                <span style="color:var(--c-muted);font-size:.8rem">${t.created_at?.split('T')[0]}</span>
              </div>
              ${t.from_status ? `<div style="font-size:.85rem;color:var(--c-muted)">From: ${esc(t.from_status)}</div>` : ''}
              ${t.reason ? `<div style="font-size:.85rem;margin-top:4px">${esc(t.reason)}</div>` : ''}
              ${t.changed_by_name ? `<div style="font-size:.78rem;color:var(--c-muted)">by ${esc(t.changed_by_name)}</div>` : ''}
            </div>
          </div>`).join('') +
        `</div>`;
    }
    modal.classList.add('on');
    document.getElementById('overlay').classList.add('on');
  } catch(e) { toast('Error loading lifecycle: ' + e.message, 'err'); }
}

// Simple status picker - returns {status} or null
function pickStatus(assetTag, current, allowed) {
  return new Promise(resolve => {
    const opts = allowed.map(s => `<button class="btn btn-outline" style="margin:4px" onclick="window._pickResolve('${s}')">${s}</button>`).join('');
    const div = document.createElement('div');
    div.id = 'pick-overlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center';
    div.innerHTML = `<div style="background:var(--surf);border-radius:16px;padding:28px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <h3 style="margin:0 0 8px">Change Status</h3>
      <p style="color:var(--c-muted);font-size:.88rem;margin:0 0 16px">${esc(assetTag)} · Current: <b>${esc(current)}</b></p>
      <div>${opts}</div>
      <div style="margin-top:12px"><button class="btn btn-outline" onclick="window._pickResolve(null)">Cancel</button></div>
    </div>`;
    document.body.appendChild(div);
    window._pickResolve = (val) => {
      document.getElementById('pick-overlay')?.remove();
      delete window._pickResolve;
      resolve(val ? { status: val } : null);
    };
  });
}

// ── Hook into nav to load new pages ────────────────────────
const _origNav = nav;
// Patch nav: extend nav to call new loaders
// (do it inline—no redefinition, just post-navigate hooks)
(function patchNav() {
  const orig = window.nav || nav;
  window.nav = function(page) {
    orig(page);
    if (page === 'maintenance') { loadMaintenance(); populateMaintEquipDropdowns(); }
    if (page === 'reports')     loadReports();
  };
})();

// openModal handles all types including maintenance via _resetModal
