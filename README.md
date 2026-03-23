# AssetPro v5 — IT Asset Management System

**TechNova Solutions Pvt. Ltd., Chennai** — Professional IT Asset Tracker

---

## 🚀 Quick Start

```bash
cd backend
npm install
npm run seed      # Fix passwords (DB has 85 employees + 90 assets)
npm start         # Open http://localhost:3000
```

---

## 🔐 Login Credentials

| Username   | Password     | Role    |
|------------|--------------|---------|
| admin      | admin123     | Admin   |
| manager    | manager123   | Manager |
| viewer     | viewer123    | Viewer  |

---

## ✨ Features (v5)

### Core
| Feature | Description |
|---------|-------------|
| **Dashboard** | Live KPIs, charts, warranty alerts, maintenance due widget, auto-refresh every 30s |
| **Equipment** | CRUD, filters, pagination, lifecycle status transitions, Excel/PDF export |
| **Employees** | CRUD, department filters, 85 South Indian demo employees |
| **Assignments** | Assign/return flow, overdue tracking, email notifications |
| **Audit Log** | Full activity trail with IP, user, action filters |
| **Depreciation** | Straight-line, Double-Declining, Sum-of-Years methods |

### New in v5
| Feature | Description |
|---------|-------------|
| **🔧 Maintenance Tracker** | Log service events, create schedules, "due in 14 days" alerts |
| **📊 Department Reports** | Bar charts by dept, cost breakdown, utilization rate |
| **🔄 Lifecycle Tracking** | `available → maintenance → retiring → retired` with transition rules |
| **🔍 Global Search** | Real-time search across equipment + employees + assignments in one box |
| **⏱ Auto-refresh** | Dashboard auto-refreshes every 30s with "last updated X ago" |

### Security & Quality
- JWT auth, bcrypt(10), Helmet, rate limiting, RBAC (admin/manager/viewer)
- **XSS protection** — all user data escaped via `esc()` before innerHTML
- **try/catch on every route** — no unhandled crashes
- **Joi validation** on all POST/PUT endpoints

---

## 🧪 Testing

```bash
cd backend
npm test                    # All tests (unit + integration)
npm run test:unit           # Unit tests only (app.test.js)
npm run test:integration    # Integration tests (supertest)
npm test -- --coverage      # With coverage report
```

**Test suites:** 21 describe blocks, 80+ tests covering:
- Authentication (login, token, wrong password, roles)
- Equipment CRUD (200, 201, 400, 401, 403, 404, 409)
- Employees CRUD
- Assignments create/return/conflict
- Dashboard stats (admin vs viewer)
- Audit log filtering
- Global search
- Maintenance tracker
- Department reports
- Role-based access control

---

## 📡 API Endpoints

```
POST /api/auth/login
GET  /api/equipment         GET /api/equipment/:id
POST /api/equipment         PUT /api/equipment/:id
PATCH /api/equipment/:id/status    (lifecycle transition)
GET  /api/equipment/:id/lifecycle
GET  /api/employees         POST /api/employees
GET  /api/assignments       POST /api/assignments
POST /api/assignments/:id/return
GET  /api/dashboard/stats
GET  /api/history
GET  /api/depreciation
GET  /api/maintenance       POST /api/maintenance
GET  /api/maintenance/due   GET /api/maintenance/schedules
POST /api/maintenance/schedules
GET  /api/reports/by-department
GET  /api/reports/summary
GET  /api/search?q=...
GET  /api/export/equipment  (Excel/PDF)
GET  /api/qrcode/:id
```

---

## 🗂 Project Structure

```
assetpro-v5/
├── backend/
│   ├── data/asset_management.db   ← Pre-seeded SQLite
│   ├── middleware/ auth, validation, errorHandler, ipLogger
│   ├── routes/
│   │   ├── auth.js          assignments.js   equipment.js
│   │   ├── employees.js     dashboard.js     history.js
│   │   ├── depreciation.js  export.js        qrcode.js
│   │   ├── maintenance.js   ← NEW: Maintenance Tracker
│   │   ├── reports.js       ← NEW: Department Reports
│   │   └── search.js        ← NEW: Global Search
│   ├── services/ auditService, emailService, pdfService
│   ├── tests/
│   │   ├── app.test.js          ← Unit tests (11 suites)
│   │   └── integration.test.js  ← Integration tests (10 suites, 45 tests)
│   └── utils/ database.js, seed.js
└── frontend/
    ├── css/style.css
    ├── js/api.js  app.js
    └── index.html
```

---

## 💡 Optional Features Setup

```bash
npm install pdfkit      # PDF export
npm install nodemailer  # Email notifications  
npm install multer      # Image upload
```
