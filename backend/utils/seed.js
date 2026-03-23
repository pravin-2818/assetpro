/**
 * AssetPro v5 — Full Seed Script
 * 85 South Indian employees, 95 equipment, 80+ assignments
 * Run: npm run seed
 */
const { initDatabase, getDb } = require('./database');
const bcrypt = require('bcryptjs');

async function seed() {
  await initDatabase();
  const db = getDb();

  // Ensure extra tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      performed_by TEXT,
      cost REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      scheduled_date TEXT,
      completed_date TEXT,
      next_service_date TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_maint_equip ON maintenance_records(equipment_id);
  `);

  // Migration: add missing columns safely
  const maintCols = db.prepare("PRAGMA table_info(maintenance_records)").all().map(c => c.name);
  const addCol = (col, def) => {
    if (!maintCols.includes(col)) db.exec(`ALTER TABLE maintenance_records ADD COLUMN ${col} ${def}`);
  };
  addCol('next_service_date','TEXT'); addCol('completed_date','TEXT'); addCol('scheduled_date','TEXT');
  addCol('performed_by','TEXT'); addCol('cost','REAL DEFAULT 0'); addCol('notes','TEXT');
  addCol('created_by','INTEGER'); addCol('updated_at',"TEXT DEFAULT (datetime('now'))");

  // ── USERS ────────────────────────────────────────────────────
  console.log('\n🔐 Seeding users...');
  const accounts = [
    { username:'admin',    password:'admin123',   role:'admin',   full_name:'System Administrator',  email:'admin@technova.in' },
    { username:'manager',  password:'manager123', role:'manager', full_name:'Priya Ramaswamy',        email:'priya.rm@technova.in' },
    { username:'it_admin', password:'itadmin123', role:'admin',   full_name:'Venkatesh Iyer',         email:'venkatesh.i@technova.in' },
  ];
  for (const acc of accounts) {
    const hash = bcrypt.hashSync(acc.password, 10);
    const ex = db.prepare('SELECT id FROM users WHERE username=?').get(acc.username);
    if (ex) {
      db.prepare("UPDATE users SET password=?,full_name=?,email=?,is_active=1,updated_at=datetime('now') WHERE username=?")
        .run(hash, acc.full_name, acc.email, acc.username);
      console.log(`  ✅ Updated: ${acc.username} (${acc.role})`);
    } else {
      db.prepare('INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)')
        .run(acc.username, hash, acc.role, acc.full_name, acc.email);
      console.log(`  ✅ Created: ${acc.username} (${acc.role})`);
    }
  }

  // ── EMPLOYEES ────────────────────────────────────────────────
  console.log('\n👥 Seeding employees...');
  const employees = [
    // Engineering (15)
    ['EMP001','Karthik Subramanian','karthik.s@technova.in','Engineering','Senior Software Engineer','9876543201','044-23456701','Chennai HQ'],
    ['EMP002','Deepa Venkataraman','deepa.v@technova.in','Engineering','Full Stack Developer','9876543202','044-23456702','Chennai HQ'],
    ['EMP003','Rajesh Chandrasekhar','rajesh.c@technova.in','Engineering','Backend Developer','9876543203','044-23456703','Chennai HQ'],
    ['EMP004','Priyanka Narayanan','priyanka.n@technova.in','Engineering','Frontend Developer','9876543204','044-23456704','Chennai HQ'],
    ['EMP005','Suresh Balakrishnan','suresh.b@technova.in','Engineering','DevOps Engineer','9876543205','044-23456705','Chennai HQ'],
    ['EMP006','Meena Thiruvenkatam','meena.t@technova.in','Engineering','Software Engineer','9876543206','044-23456706','Chennai HQ'],
    ['EMP007','Vikram Annamalai','vikram.a@technova.in','Engineering','Senior Engineer','9876543207','044-23456707','Chennai HQ'],
    ['EMP008','Kavitha Murugesan','kavitha.m@technova.in','Engineering','Java Developer','9876543208','044-23456708','Chennai HQ'],
    ['EMP009','Arun Pandian','arun.p@technova.in','Engineering','Python Developer','9876543209','044-23456709','Bangalore Office'],
    ['EMP010','Saranya Rajan','saranya.r@technova.in','Engineering','React Developer','9876543210','044-23456710','Bangalore Office'],
    ['EMP011','Muthukumar Selvam','muthu.s@technova.in','Engineering','Cloud Engineer','9876543211','044-23456711','Chennai HQ'],
    ['EMP012','Vaishnavi Krishnaswamy','vaishnavi.k@technova.in','Engineering','QA Engineer','9876543212','044-23456712','Chennai HQ'],
    ['EMP013','Ganesh Ramasamy','ganesh.r@technova.in','Engineering','Systems Architect','9876543213','044-23456713','Hyderabad Branch'],
    ['EMP014','Lavanya Shanmugam','lavanya.s@technova.in','Engineering','Mobile Developer','9876543214','044-23456714','Chennai HQ'],
    ['EMP015','Senthil Kumar','senthil.k@technova.in','Engineering','Tech Lead','9876543215','044-23456715','Chennai HQ'],
    // DevOps (8)
    ['EMP016','Balaji Natarajan','balaji.n@technova.in','DevOps','DevOps Lead','9876543216','044-23456716','Chennai HQ'],
    ['EMP017','Divya Periyasamy','divya.p@technova.in','DevOps','Cloud Architect','9876543217','044-23456717','Chennai HQ'],
    ['EMP018','Ramesh Gopalakrishnan','ramesh.g@technova.in','DevOps','SRE Engineer','9876543218','044-23456718','Bangalore Office'],
    ['EMP019','Suganya Venkatesan','suganya.v@technova.in','DevOps','Infrastructure Engineer','9876543219','044-23456719','Chennai HQ'],
    ['EMP020','Dinesh Rajagopal','dinesh.r@technova.in','DevOps','CI/CD Engineer','9876543220','044-23456720','Chennai HQ'],
    ['EMP021','Mythili Subramaniam','mythili.s@technova.in','DevOps','DevOps Engineer','9876543221','044-23456721','Chennai HQ'],
    ['EMP022','Kiran Velayutham','kiran.v@technova.in','DevOps','Platform Engineer','9876543222','044-23456722','Hyderabad Branch'],
    ['EMP023','Sangeetha Palaniswamy','sangeetha.p@technova.in','DevOps','DevOps Engineer','9876543223','044-23456723','Chennai HQ'],
    // QA (7)
    ['EMP024','Usha Mahadevan','usha.m@technova.in','QA','QA Lead','9876543224','044-23456724','Chennai HQ'],
    ['EMP025','Arumugam Pillai','arumugam.p@technova.in','QA','Senior QA Engineer','9876543225','044-23456725','Chennai HQ'],
    ['EMP026','Padma Sundarajan','padma.s@technova.in','QA','Automation Engineer','9876543226','044-23456726','Chennai HQ'],
    ['EMP027','Selvam Arunachalam','selvam.a@technova.in','QA','Manual Tester','9876543227','044-23456727','Bangalore Office'],
    ['EMP028','Radha Parthasarathy','radha.p@technova.in','QA','Performance Tester','9876543228','044-23456728','Chennai HQ'],
    ['EMP029','Murugan Chidambaram','murugan.c@technova.in','QA','QA Engineer','9876543229','044-23456729','Chennai HQ'],
    ['EMP030','Janaki Ramachandran','janaki.r@technova.in','QA','Test Lead','9876543230','044-23456730','Chennai HQ'],
    // Product (6)
    ['EMP031','Vijayalakshmi Iyer','vijaya.i@technova.in','Product','Product Manager','9876543231','044-23456731','Chennai HQ'],
    ['EMP032','Harish Venkataraman','harish.v@technova.in','Product','Product Owner','9876543232','044-23456732','Chennai HQ'],
    ['EMP033','Nalini Sundaram','nalini.s@technova.in','Product','Business Analyst','9876543233','044-23456733','Bangalore Office'],
    ['EMP034','Balasubramanian T','bala.t@technova.in','Product','Product Analyst','9876543234','044-23456734','Chennai HQ'],
    ['EMP035','Hemalatha Nair','hema.n@technova.in','Product','UX Researcher','9876543235','044-23456735','Chennai HQ'],
    ['EMP036','Prasanna Venkat','prasanna.v@technova.in','Product','Product Designer','9876543236','044-23456736','Chennai HQ'],
    // Design (5)
    ['EMP037','Nithya Krishnamurthy','nithya.k@technova.in','Design','UI/UX Lead','9876543237','044-23456737','Chennai HQ'],
    ['EMP038','Soundarya Manikandan','soundarya.m@technova.in','Design','Senior Designer','9876543238','044-23456738','Chennai HQ'],
    ['EMP039','Kathiravan Durai','kathir.d@technova.in','Design','Graphic Designer','9876543239','044-23456739','Chennai HQ'],
    ['EMP040','Revathi Subramanian','revathi.s@technova.in','Design','Motion Designer','9876543240','044-23456740','Bangalore Office'],
    ['EMP041','Thiruvengadam K','thiru.k@technova.in','Design','Visual Designer','9876543241','044-23456741','Chennai HQ'],
    // Sales (8)
    ['EMP042','Shankar Pillai','shankar.p@technova.in','Sales','Sales Director','9876543242','044-23456742','Chennai HQ'],
    ['EMP043','Ambika Krishnan','ambika.k@technova.in','Sales','Senior Sales Manager','9876543243','044-23456743','Chennai HQ'],
    ['EMP044','Saravanan Murugan','saravanan.m@technova.in','Sales','Account Executive','9876543244','044-23456744','Coimbatore Branch'],
    ['EMP045','Vijaya Raghunathan','vijaya.r@technova.in','Sales','Sales Representative','9876543245','044-23456745','Chennai HQ'],
    ['EMP046','Thenmozhi Arumugam','thenmo.a@technova.in','Sales','Sales Manager','9876543246','044-23456746','Madurai Branch'],
    ['EMP047','Gopinath Sundaresan','gopi.s@technova.in','Sales','Business Dev Manager','9876543247','044-23456747','Chennai HQ'],
    ['EMP048','Chitra Venkateswaran','chitra.v@technova.in','Sales','Sales Analyst','9876543248','044-23456748','Chennai HQ'],
    ['EMP049','Manickam Rajan','manik.r@technova.in','Sales','Territory Manager','9876543249','044-23456749','Trichy Branch'],
    // HR (6)
    ['EMP050','Kamala Sivakumar','kamala.s@technova.in','HR','HR Manager','9876543250','044-23456750','Chennai HQ'],
    ['EMP051','Anand Natarajan','anand.n@technova.in','HR','HR Business Partner','9876543251','044-23456751','Chennai HQ'],
    ['EMP052','Malathi Venkatraman','malathi.v@technova.in','HR','Talent Acquisition Lead','9876543252','044-23456752','Chennai HQ'],
    ['EMP053','Sugumar Palanivel','sugum.p@technova.in','HR','HR Executive','9876543253','044-23456753','Bangalore Office'],
    ['EMP054','Jayanthi Alagarsamy','jayanthi.a@technova.in','HR','L&D Manager','9876543254','044-23456754','Chennai HQ'],
    ['EMP055','Ezhilarasan M','ezhil.m@technova.in','HR','HR Analyst','9876543255','044-23456755','Chennai HQ'],
    // Finance (6)
    ['EMP056','Ranjani Krishnamoorthy','ranjani.k@technova.in','Finance','Finance Manager','9876543256','044-23456756','Chennai HQ'],
    ['EMP057','Annamalai Rajan','annamalai.r@technova.in','Finance','Senior Accountant','9876543257','044-23456757','Chennai HQ'],
    ['EMP058','Shanthi Baskaran','shanthi.b@technova.in','Finance','Financial Analyst','9876543258','044-23456758','Chennai HQ'],
    ['EMP059','Venkataraman S','venkatar.s@technova.in','Finance','Tax Consultant','9876543259','044-23456759','Chennai HQ'],
    ['EMP060','Kalavathi Palanisamy','kala.p@technova.in','Finance','Accounts Executive','9876543260','044-23456760','Bangalore Office'],
    ['EMP061','Ilayaraja Muthu','ilaya.m@technova.in','Finance','Finance Executive','9876543261','044-23456761','Chennai HQ'],
    // IT Support (6)
    ['EMP062','Sivakumar Anand','sivak.a@technova.in','IT Support','IT Support Lead','9876543262','044-23456762','Chennai HQ'],
    ['EMP063','Kokila Devi','kokila.d@technova.in','IT Support','Systems Administrator','9876543263','044-23456763','Chennai HQ'],
    ['EMP064','Rajendran Pillai','rajend.p@technova.in','IT Support','Network Engineer','9876543264','044-23456764','Chennai HQ'],
    ['EMP065','Nirmala Venkatesan','nirmal.v@technova.in','IT Support','Help Desk Engineer','9876543265','044-23456765','Bangalore Office'],
    ['EMP066','Paramasivam K','param.k@technova.in','IT Support','IT Technician','9876543266','044-23456766','Chennai HQ'],
    ['EMP067','Sangili Murugesan','sangi.m@technova.in','IT Support','IT Executive','9876543267','044-23456767','Chennai HQ'],
    // Management (5)
    ['EMP068','Narayanan Swaminathan','narayan.s@technova.in','Management','CEO','9876543268','044-23456768','Chennai HQ'],
    ['EMP069','Sudha Raghavendra','sudha.r@technova.in','Management','CTO','9876543269','044-23456769','Chennai HQ'],
    ['EMP070','Krishnaswamy Iyer','krishna.i@technova.in','Management','COO','9876543270','044-23456770','Chennai HQ'],
    ['EMP071','Meenakshi Sundaram','meenakshi.s@technova.in','Management','VP Engineering','9876543271','044-23456771','Chennai HQ'],
    ['EMP072','Bagyalakshmi Rajan','bagya.r@technova.in','Management','Chief of Staff','9876543272','044-23456772','Chennai HQ'],
    // Customer Success (5)
    ['EMP073','Thilagavathi N','thilaga.n@technova.in','Customer Success','CS Manager','9876543273','044-23456773','Chennai HQ'],
    ['EMP074','Loganathan Vel','logan.v@technova.in','Customer Success','CS Engineer','9876543274','044-23456774','Chennai HQ'],
    ['EMP075','Ponmani Suresh','ponmani.s@technova.in','Customer Success','CS Lead','9876543275','044-23456775','Bangalore Office'],
    ['EMP076','Sakunthala Ravi','sakunth.r@technova.in','Customer Success','Support Specialist','9876543276','044-23456776','Chennai HQ'],
    ['EMP077','Vignesh Palani','vignesh.p@technova.in','Customer Success','Onboarding Specialist','9876543277','044-23456777','Chennai HQ'],
    // Operations (4)
    ['EMP078','Alamelu Rani','alamelu.r@technova.in','Operations','Operations Manager','9876543278','044-23456778','Chennai HQ'],
    ['EMP079','Periasamy Gounder','peria.g@technova.in','Operations','Operations Analyst','9876543279','044-23456779','Chennai HQ'],
    ['EMP080','Kumudha Venkatesh','kumudha.v@technova.in','Operations','Procurement Executive','9876543280','044-23456780','Chennai HQ'],
    ['EMP081','Deivanai Murugesan','deivanai.m@technova.in','Operations','Office Manager','9876543281','044-23456781','Chennai HQ'],
    // Marketing (4)
    ['EMP082','Subashini Krishnan','subash.k@technova.in','Marketing','Marketing Manager','9876543282','044-23456782','Chennai HQ'],
    ['EMP083','Elumalai Raj','eluma.r@technova.in','Marketing','Digital Marketing Lead','9876543283','044-23456783','Chennai HQ'],
    ['EMP084','Sumathi Palaniappan','sumathi.p@technova.in','Marketing','Content Strategist','9876543284','044-23456784','Bangalore Office'],
    ['EMP085','Arockiasamy Joseph','arocki.j@technova.in','Marketing','SEO Specialist','9876543285','044-23456785','Chennai HQ'],
    // Legal (1)
    ['EMP086','Geetha Rajamanickam','geetha.r@technova.in','Legal','Legal Counsel','9876543286','044-23456786','Chennai HQ'],
  ];

  let empCreated = 0, empSkipped = 0;
  for (const [eid, name, email, dept, pos, mob, desk, loc] of employees) {
    const ex = db.prepare('SELECT id FROM employees WHERE employee_id=? OR email=?').get(eid, email);
    if (!ex) {
      db.prepare('INSERT INTO employees (employee_id,name,email,department,position,mobile_phone,desk_phone,location) VALUES (?,?,?,?,?,?,?,?)')
        .run(eid, name, email, dept, pos, mob, desk, loc);
      empCreated++;
    } else { empSkipped++; }
  }
  console.log(`  ✅ Employees: ${empCreated} created, ${empSkipped} already existed`);

  // ── EQUIPMENT (95 items) ──────────────────────────────────────
  console.log('\n💻 Seeding equipment...');
  const equipment = [
    // MacBooks (10)
    ['AST-0001','Laptop','Apple','MacBook Pro 14"','MBP-2023-001','available','excellent','2023-01-15',145000,'2026-01-15','Chennai HQ'],
    ['AST-0002','Laptop','Apple','MacBook Pro 16"','MBP-2023-002','available','excellent','2023-02-10',185000,'2026-02-10','Chennai HQ'],
    ['AST-0003','Laptop','Apple','MacBook Air M2','MBA-2023-001','available','excellent','2023-03-05',110000,'2026-03-05','Bangalore Office'],
    ['AST-0004','Laptop','Apple','MacBook Pro 14"','MBP-2023-003','available','good','2022-11-20',145000,'2025-11-20','Chennai HQ'],
    ['AST-0005','Laptop','Apple','MacBook Air M1','MBA-2022-001','available','good','2022-06-10',95000,'2025-06-10','Chennai HQ'],
    ['AST-0006','Laptop','Apple','MacBook Pro 13"','MBP-2022-001','available','good','2022-08-15',125000,'2025-08-15','Chennai HQ'],
    ['AST-0007','Laptop','Apple','MacBook Pro 16"','MBP-2023-004','available','excellent','2023-07-20',185000,'2026-07-20','Bangalore Office'],
    ['AST-0008','Laptop','Apple','MacBook Air M2','MBA-2023-002','available','excellent','2023-09-01',110000,'2026-09-01','Chennai HQ'],
    ['AST-0009','Laptop','Apple','MacBook Pro 14"','MBP-2024-001','available','excellent','2024-01-10',155000,'2027-01-10','Chennai HQ'],
    ['AST-0010','Laptop','Apple','MacBook Air M3','MBA-2024-001','available','excellent','2024-03-15',125000,'2027-03-15','Hyderabad Branch'],
    // Dell Laptops (10)
    ['AST-0011','Laptop','Dell','XPS 15','DLL-XPS-001','available','excellent','2023-02-20',105000,'2026-02-20','Chennai HQ'],
    ['AST-0012','Laptop','Dell','XPS 13','DLL-XPS-002','available','excellent','2023-04-15',85000,'2026-04-15','Chennai HQ'],
    ['AST-0013','Laptop','Dell','Latitude 5540','DLL-LAT-001','available','good','2022-09-10',75000,'2025-09-10','Chennai HQ'],
    ['AST-0014','Laptop','Dell','Latitude 7440','DLL-LAT-002','available','excellent','2023-11-20',95000,'2026-11-20','Bangalore Office'],
    ['AST-0015','Laptop','Dell','Precision 5570','DLL-PRE-001','available','excellent','2023-08-05',135000,'2026-08-05','Chennai HQ'],
    ['AST-0016','Laptop','Dell','XPS 15','DLL-XPS-003','available','good','2022-12-10',105000,'2025-12-10','Chennai HQ'],
    ['AST-0017','Laptop','Dell','Inspiron 15','DLL-INS-001','available','good','2022-07-25',55000,'2025-07-25','Coimbatore Branch'],
    ['AST-0018','Laptop','Dell','Latitude 5440','DLL-LAT-003','available','good','2023-05-18',72000,'2026-05-18','Chennai HQ'],
    ['AST-0019','Laptop','Dell','XPS 13','DLL-XPS-004','available','excellent','2024-02-10',88000,'2027-02-10','Chennai HQ'],
    ['AST-0020','Laptop','Dell','Precision 7680','DLL-PRE-002','available','excellent','2024-01-20',175000,'2027-01-20','Chennai HQ'],
    // Lenovo Laptops (8)
    ['AST-0021','Laptop','Lenovo','ThinkPad X1 Carbon','LNV-X1C-001','available','excellent','2023-03-10',115000,'2026-03-10','Chennai HQ'],
    ['AST-0022','Laptop','Lenovo','ThinkPad T14s','LNV-T14-001','available','good','2022-10-15',78000,'2025-10-15','Chennai HQ'],
    ['AST-0023','Laptop','Lenovo','IdeaPad 5','LNV-IDP-001','available','good','2022-05-20',52000,'2025-05-20','Chennai HQ'],
    ['AST-0024','Laptop','Lenovo','ThinkPad E15','LNV-E15-001','available','good','2023-06-15',65000,'2026-06-15','Bangalore Office'],
    ['AST-0025','Laptop','Lenovo','ThinkBook 16','LNV-TB16-001','available','excellent','2023-10-20',82000,'2026-10-20','Chennai HQ'],
    ['AST-0026','Laptop','Lenovo','ThinkPad X1 Carbon','LNV-X1C-002','available','excellent','2024-01-05',118000,'2027-01-05','Chennai HQ'],
    ['AST-0027','Laptop','Lenovo','ThinkPad T16','LNV-T16-001','available','excellent','2023-12-15',88000,'2026-12-15','Hyderabad Branch'],
    ['AST-0028','Laptop','Lenovo','Legion 5 Pro','LNV-LGN-001','available','excellent','2023-07-10',95000,'2026-07-10','Chennai HQ'],
    // HP Laptops (7)
    ['AST-0029','Laptop','HP','EliteBook 840 G10','HP-EBK-001','available','excellent','2023-09-15',95000,'2026-09-15','Chennai HQ'],
    ['AST-0030','Laptop','HP','ProBook 450 G10','HP-PBK-001','available','good','2023-04-20',68000,'2026-04-20','Chennai HQ'],
    ['AST-0031','Laptop','HP','ZBook Studio G10','HP-ZBK-001','available','excellent','2023-11-10',145000,'2026-11-10','Chennai HQ'],
    ['AST-0032','Laptop','HP','EliteBook 1040 G10','HP-EBK-002','available','excellent','2024-02-20',125000,'2027-02-20','Bangalore Office'],
    ['AST-0033','Laptop','HP','ProBook 650 G9','HP-PBK-002','available','good','2022-08-20',72000,'2025-08-20','Chennai HQ'],
    ['AST-0034','Laptop','HP','EliteBook 840 G9','HP-EBK-003','available','good','2022-06-15',88000,'2025-06-15','Chennai HQ'],
    ['AST-0035','Laptop','HP','Omen 16','HP-OMN-001','available','excellent','2023-05-25',85000,'2026-05-25','Chennai HQ'],
    // Monitors (15)
    ['AST-0036','Monitor','LG','27UK850 4K','LG-27-001','available','excellent','2023-01-20',32000,'2026-01-20','Chennai HQ'],
    ['AST-0037','Monitor','LG','34WP85C UltraWide','LG-34-001','available','excellent','2023-03-15',55000,'2026-03-15','Chennai HQ'],
    ['AST-0038','Monitor','Dell','U2723D 4K','DL-MON-001','available','excellent','2023-02-10',35000,'2026-02-10','Chennai HQ'],
    ['AST-0039','Monitor','Dell','U3422WE UltraWide','DL-MON-002','available','excellent','2023-05-20',58000,'2026-05-20','Bangalore Office'],
    ['AST-0040','Monitor','Samsung','27" S27A700NWU','SAM-MON-001','available','good','2022-09-10',25000,'2025-09-10','Chennai HQ'],
    ['AST-0041','Monitor','Samsung','32" M70B Smart','SAM-MON-002','available','excellent','2023-08-15',38000,'2026-08-15','Chennai HQ'],
    ['AST-0042','Monitor','BenQ','27" GW2780','BNQ-MON-001','available','good','2022-07-10',18000,'2025-07-10','Chennai HQ'],
    ['AST-0043','Monitor','HP','27" Z27k G3 4K','HP-MON-001','available','excellent','2023-10-20',42000,'2026-10-20','Chennai HQ'],
    ['AST-0044','Monitor','LG','24" 24MK430H','LG-24-001','available','good','2022-11-10',14000,'2025-11-10','Coimbatore Branch'],
    ['AST-0045','Monitor','Dell','24" P2422H','DL-MON-003','available','good','2022-08-25',16000,'2025-08-25','Chennai HQ'],
    ['AST-0046','Monitor','ASUS','27" ProArt PA278QV','ASU-MON-001','available','excellent','2023-09-10',45000,'2026-09-10','Chennai HQ'],
    ['AST-0047','Monitor','ViewSonic','32" VX3267U-4K','VS-MON-001','available','good','2023-04-15',28000,'2026-04-15','Chennai HQ'],
    ['AST-0048','Monitor','AOC','27" Q27P3CV','AOC-MON-001','available','excellent','2023-11-20',24000,'2026-11-20','Bangalore Office'],
    ['AST-0049','Monitor','Dell','27" S2722D','DL-MON-004','available','good','2022-12-10',22000,'2025-12-10','Chennai HQ'],
    ['AST-0050','Monitor','LG','27" 27QN880-B','LG-27-002','available','excellent','2024-01-15',36000,'2027-01-15','Chennai HQ'],
    // Mobile Phones (10)
    ['AST-0051','Mobile Phone','Apple','iPhone 15 Pro','APL-IPH-001','available','excellent','2023-10-15',125000,'2026-10-15','Chennai HQ'],
    ['AST-0052','Mobile Phone','Apple','iPhone 14 Pro','APL-IPH-002','available','good','2022-10-20',98000,'2025-10-20','Chennai HQ'],
    ['AST-0053','Mobile Phone','Samsung','Galaxy S23 Ultra','SAM-PHN-001','available','excellent','2023-03-10',95000,'2026-03-10','Chennai HQ'],
    ['AST-0054','Mobile Phone','Samsung','Galaxy S23','SAM-PHN-002','available','good','2023-04-15',65000,'2026-04-15','Bangalore Office'],
    ['AST-0055','Mobile Phone','Apple','iPhone 15','APL-IPH-003','available','excellent','2023-11-10',78000,'2026-11-10','Chennai HQ'],
    ['AST-0056','Mobile Phone','OnePlus','11 5G','OPL-PHN-001','available','good','2023-02-20',55000,'2026-02-20','Chennai HQ'],
    ['AST-0057','Mobile Phone','Google','Pixel 8','GGL-PHN-001','available','excellent','2023-10-25',72000,'2026-10-25','Chennai HQ'],
    ['AST-0058','Mobile Phone','Samsung','Galaxy A54','SAM-PHN-003','available','good','2023-05-15',35000,'2026-05-15','Coimbatore Branch'],
    ['AST-0059','Mobile Phone','Apple','iPhone 14','APL-IPH-004','available','good','2022-09-25',72000,'2025-09-25','Chennai HQ'],
    ['AST-0060','Mobile Phone','Samsung','Galaxy S24','SAM-PHN-004','available','excellent','2024-02-10',88000,'2027-02-10','Chennai HQ'],
    // Tablets (5)
    ['AST-0061','Tablet','Apple','iPad Pro 12.9"','APL-TAB-001','available','excellent','2023-06-10',95000,'2026-06-10','Chennai HQ'],
    ['AST-0062','Tablet','Apple','iPad Air 5','APL-TAB-002','available','good','2022-08-15',58000,'2025-08-15','Chennai HQ'],
    ['AST-0063','Tablet','Samsung','Galaxy Tab S9','SAM-TAB-001','available','excellent','2023-09-20',72000,'2026-09-20','Bangalore Office'],
    ['AST-0064','Tablet','Apple','iPad Pro 11"','APL-TAB-003','available','excellent','2024-01-20',82000,'2027-01-20','Chennai HQ'],
    ['AST-0065','Tablet','Microsoft','Surface Pro 9','MSF-TAB-001','available','excellent','2023-11-15',105000,'2026-11-15','Chennai HQ'],
    // Keyboards & Mice (8)
    ['AST-0066','Keyboard','Logitech','MX Keys','LGT-KBD-001','available','excellent','2023-02-15',8500,'2026-02-15','Chennai HQ'],
    ['AST-0067','Keyboard','Apple','Magic Keyboard','APL-KBD-001','available','excellent','2023-05-10',9500,'2026-05-10','Chennai HQ'],
    ['AST-0068','Keyboard','Keychron','K2 Mechanical','KCN-KBD-001','available','excellent','2023-07-20',7500,'2026-07-20','Chennai HQ'],
    ['AST-0069','Mouse','Logitech','MX Master 3S','LGT-MSE-001','available','excellent','2023-03-10',7500,'2026-03-10','Chennai HQ'],
    ['AST-0070','Mouse','Apple','Magic Mouse 3','APL-MSE-001','available','excellent','2023-06-15',5500,'2026-06-15','Chennai HQ'],
    ['AST-0071','Mouse','Logitech','MX Anywhere 3','LGT-MSE-002','available','good','2022-10-20',4500,'2025-10-20','Chennai HQ'],
    ['AST-0072','Keyboard','Logitech','K380 Bluetooth','LGT-KBD-002','available','good','2022-09-15',3500,'2025-09-15','Bangalore Office'],
    ['AST-0073','Mouse','Razer','Pro Click','RZR-MSE-001','available','excellent','2023-08-10',6500,'2026-08-10','Chennai HQ'],
    // Headsets (5)
    ['AST-0074','Headset','Jabra','Evolve2 85','JBR-HST-001','available','excellent','2023-04-20',18000,'2026-04-20','Chennai HQ'],
    ['AST-0075','Headset','Sony','WH-1000XM5','SNY-HST-001','available','excellent','2023-08-25',28000,'2026-08-25','Chennai HQ'],
    ['AST-0076','Headset','Bose','QuietComfort 45','BSE-HST-001','available','good','2022-11-15',25000,'2025-11-15','Chennai HQ'],
    ['AST-0077','Headset','Jabra','Evolve2 55','JBR-HST-002','available','excellent','2023-10-10',22000,'2026-10-10','Bangalore Office'],
    ['AST-0078','Headset','Apple','AirPods Pro 2','APL-HST-001','available','excellent','2023-09-20',24000,'2026-09-20','Chennai HQ'],
    // Servers & Network (10)
    ['AST-0079','Server','Dell','PowerEdge R750','DL-SRV-001','available','excellent','2023-01-10',485000,'2026-01-10','Chennai HQ Data Center'],
    ['AST-0080','Server','HP','ProLiant DL380 Gen11','HP-SRV-001','available','excellent','2023-03-20',525000,'2026-03-20','Chennai HQ Data Center'],
    ['AST-0081','Server','Dell','PowerEdge R650','DL-SRV-002','available','excellent','2023-06-15',385000,'2026-06-15','Bangalore Office'],
    ['AST-0082','Network Device','Cisco','Catalyst 9300','CSC-SW-001','available','excellent','2022-12-10',185000,'2025-12-10','Chennai HQ'],
    ['AST-0083','Network Device','Cisco','ASA 5506-X Firewall','CSC-FW-001','available','excellent','2022-08-15',125000,'2025-08-15','Chennai HQ'],
    ['AST-0084','Network Device','Cisco','Aironet 3800','CSC-WAP-001','available','excellent','2023-02-20',35000,'2026-02-20','Chennai HQ'],
    ['AST-0085','Network Device','Cisco','Aironet 3800','CSC-WAP-002','available','excellent','2023-02-20',35000,'2026-02-20','Bangalore Office'],
    ['AST-0086','UPS','APC','Smart-UPS 1500VA','APC-UPS-001','available','good','2022-06-10',28000,'2025-06-10','Chennai HQ Data Center'],
    ['AST-0087','UPS','APC','Back-UPS 1500G','APC-UPS-002','available','good','2022-09-15',18000,'2025-09-15','Bangalore Office'],
    ['AST-0088','Printer','HP','LaserJet Pro M428fdn','HP-PRT-001','available','good','2022-07-20',32000,'2025-07-20','Chennai HQ'],
    // NAS & Misc (7)
    ['AST-0089','Storage','Synology','DiskStation DS923+','SYN-NAS-001','available','excellent','2023-05-10',55000,'2026-05-10','Chennai HQ Data Center'],
    ['AST-0090','Storage','QNAP','TS-464 NAS','QNP-NAS-001','available','excellent','2023-08-20',48000,'2026-08-20','Bangalore Office'],
    ['AST-0091','Printer','Canon','imageRUNNER 2625i','CAN-PRT-001','available','good','2022-10-15',65000,'2025-10-15','Chennai HQ'],
    ['AST-0092','Webcam','Logitech','BRIO 4K','LGT-CAM-001','available','excellent','2023-04-10',12000,'2026-04-10','Chennai HQ'],
    ['AST-0093','Webcam','Logitech','C930e','LGT-CAM-002','available','good','2022-11-20',8500,'2025-11-20','Bangalore Office'],
    ['AST-0094','Laptop','Asus','ZenBook 14','ASU-LPT-001','available','excellent','2023-09-25',75000,'2026-09-25','Chennai HQ'],
    ['AST-0095','Laptop','Microsoft','Surface Laptop 5','MSF-LPT-001','available','excellent','2023-11-10',115000,'2026-11-10','Chennai HQ'],
    // Additional equipment for maintenance tracking (AST-0096 to AST-0107)
    ['AST-0096','Laptop','HP','EliteBook 840 G10','HP-EBK-001','available','excellent','2023-04-15',95000,'2026-04-15','Chennai HQ'],
    ['AST-0097','Laptop','Lenovo','ThinkPad X1 Carbon','LN-X1C-001','available','excellent','2022-11-20',120000,'2025-11-20','Chennai HQ'],
    ['AST-0098','Monitor','LG','27UK850-W 4K','LG-MON-003','available','excellent','2023-02-10',35000,'2026-02-10','Bangalore Office'],
    ['AST-0099','Desktop','HP','EliteDesk 800 G9','HP-DSK-001','available','good','2022-08-05',65000,'2025-08-05','Chennai HQ'],
    ['AST-0100','Desktop','Dell','OptiPlex 7010','DL-DSK-001','available','good','2022-06-15',55000,'2025-06-15','Chennai HQ'],
    ['AST-0101','Laptop','Dell','Latitude 5540','DL-LT5-001','available','excellent','2023-07-20',88000,'2026-07-20','Hyderabad Branch'],
    ['AST-0102','Printer','Brother','HL-L8360CDW','BR-PRT-001','available','good','2022-09-10',28000,'2025-09-10','Chennai HQ'],
    ['AST-0103','Mobile Phone','Apple','iPhone 15 Pro','APL-IPH-005','available','excellent','2024-01-15',145000,'2027-01-15','Chennai HQ'],
    ['AST-0104','Tablet','Samsung','Galaxy Tab S9 Ultra','SAM-TAB-002','available','excellent','2023-12-10',95000,'2026-12-10','Bangalore Office'],
    ['AST-0105','Network Device','Cisco','Meraki MX68','CSC-MRK-001','available','excellent','2023-05-20',75000,'2026-05-20','Chennai HQ'],
    ['AST-0106','UPS','APC','Smart-UPS 3000VA','APC-UPS-003','available','good','2022-07-15',45000,'2025-07-15','Chennai HQ Data Center'],
    ['AST-0107','Storage','Synology','DiskStation DS1621+','SYN-NAS-002','available','excellent','2023-08-25',85000,'2026-08-25','Chennai HQ Data Center'],
  ];

  let eqCreated = 0, eqSkipped = 0;
  for (const [tag, cat, brand, model, serial, status, cond, pdate, price, warranty, loc] of equipment) {
    const ex = db.prepare('SELECT id FROM equipment WHERE asset_tag=? OR serial_number=?').get(tag, serial);
    if (!ex) {
      db.prepare(`INSERT INTO equipment (asset_tag,category,brand,model,serial_number,status,condition,purchase_date,purchase_price,warranty_expiry,location)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(tag, cat, brand, model, serial, status, cond, pdate, price, warranty, loc);
      eqCreated++;
    } else { eqSkipped++; }
  }
  console.log(`  ✅ Equipment: ${eqCreated} created, ${eqSkipped} already existed`);

  // ── ASSIGNMENTS (94 total) ─────────────────────────────────
  console.log('\n📋 Seeding assignments...');
  const allEmps = db.prepare('SELECT id FROM employees WHERE is_active=1 ORDER BY id').all();
  const allEq   = db.prepare("SELECT id FROM equipment WHERE is_active=1 AND status='available' ORDER BY id").all();
  const adminId = db.prepare("SELECT id FROM users WHERE username='admin'").get()?.id || 1;

  let asgnCreated = 0;
  // Assign 80 equipment to employees, keep 14 available (107-3 retired - 14 available = 90 assigned)
  // Skip servers, network devices, printers (keep as available/shared)
  const sharedCategories = ['Server','Network Device','UPS','Printer','Storage'];
  const assignableEq = allEq.filter(eq => {
    const r = db.prepare('SELECT category FROM equipment WHERE id=?').get(eq.id);
    return r && !sharedCategories.includes(r.category);
  });
  const toAssign = assignableEq.slice(0, 80); // assign exactly 80, keep 14 available

  for (let i = 0; i < toAssign.length; i++) {
    const empId = allEmps[i % allEmps.length].id;
    const eqId  = toAssign[i].id;
    const alreadyAssigned = db.prepare('SELECT id FROM assignments WHERE equipment_id=? AND returned_date IS NULL').get(eqId);
    if (!alreadyAssigned) {
      const days = Math.floor(Math.random() * 300) + 30;
      const assignDate = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
      // Add expected_return: ~24 overdue, some future, rest null
      let expectedReturn = null;
      const rnd = Math.random();
      if (rnd < 0.30) {
        // 30% overdue: expected return was in the past (~24 out of 80)
        const overdueDays = Math.floor(Math.random() * 120) + 5;
        expectedReturn = new Date(Date.now() - overdueDays * 86400000).toISOString().slice(0,10);
      } else if (rnd < 0.65) {
        // 35% have future expected return
        const futureDays = Math.floor(Math.random() * 180) + 30;
        expectedReturn = new Date(Date.now() + futureDays * 86400000).toISOString().slice(0,10);
      }
      // remaining 35% have no expected return (permanent assignment)
      db.prepare('INSERT INTO assignments (employee_id,equipment_id,assigned_by,assigned_date,expected_return,notes) VALUES (?,?,?,?,?,?)')
        .run(empId, eqId, adminId, assignDate, expectedReturn, 'Seeded assignment');
      db.prepare("UPDATE equipment SET status='assigned' WHERE id=?").run(eqId);
      asgnCreated++;
    }
  }
  console.log(`  ✅ Assignments: ${asgnCreated} created (14 equipment left available)`);

  // ── MAINTENANCE RECORDS ──────────────────────────────────────
  console.log('\n🔧 Seeding maintenance records...');
  const maintExist = db.prepare('SELECT COUNT(*) as c FROM maintenance_records').get().c;
  if (maintExist === 0) {
    // Get some laptop and equipment IDs for maintenance
    const laptopIds = db.prepare("SELECT id, asset_tag FROM equipment WHERE category='Laptop' AND is_active=1 ORDER BY id LIMIT 8").all();
    const serverIds = db.prepare("SELECT id FROM equipment WHERE category IN ('Server','Network Device','UPS') LIMIT 5").all();
    
    // Update 8 laptops to 'maintenance' status
    for (let i = 0; i < Math.min(8, laptopIds.length); i++) {
      db.prepare("UPDATE equipment SET status='maintenance' WHERE id=?").run(laptopIds[i].id);
    }
    
    const maintRecords = [
      // Maintenance for the 8 laptops in maintenance status
      ...(laptopIds[0] ? [[laptopIds[0].id, 'repair', 'Screen Replacement', 'Screen replacement - cracked display', 'LG Service Center', 4500, 'in_progress', '2025-08-10', null, '2026-08-10', adminId]] : []),
      ...(laptopIds[1] ? [[laptopIds[1].id, 'service', 'Keyboard Cleaning', 'Deep cleaning and keyboard replacement', 'IT Support Team', 1800, 'in_progress', '2025-10-05', null, '2026-04-05', adminId]] : []),
      ...(laptopIds[2] ? [[laptopIds[2].id, 'repair', 'Battery Replacement', 'Battery replacement - not holding charge', 'Apple Service', 5200, 'in_progress', '2025-09-20', null, '2026-09-20', adminId]] : []),
      ...(laptopIds[3] ? [[laptopIds[3].id, 'upgrade', 'SSD Upgrade', 'SSD upgrade from 512GB to 1TB', 'IT Support Team', 6500, 'in_progress', '2025-10-12', null, '2026-04-12', adminId]] : []),
      ...(laptopIds[4] ? [[laptopIds[4].id, 'inspection', 'Thermal Paste Reapply', 'Thermal paste reapplication and dust cleaning', 'Dell Service Center', 1200, 'in_progress', '2025-10-08', null, '2026-10-08', adminId]] : []),
      ...(laptopIds[5] ? [[laptopIds[5].id, 'repair', 'Display Port Repair', 'HDMI/Display port repair and testing', 'Electronics Workshop', 2800, 'scheduled', '2025-10-15', null, '2026-04-15', adminId]] : []),
      ...(laptopIds[6] ? [[laptopIds[6].id, 'service', 'Annual Maintenance', 'Annual service and preventive maintenance', 'HP Service Center', 3500, 'scheduled', '2025-10-18', null, '2026-10-18', adminId]] : []),
      ...(laptopIds[7] ? [[laptopIds[7].id, 'cleaning', 'Deep Cleaning', 'Complete internal cleaning and optimization', 'IT Support Team', 1500, 'in_progress', '2025-10-10', null, '2026-10-10', adminId]] : []),
      // Server maintenance
      [serverIds[0]?.id||79, 'service', 'Annual Hardware Service', 'Annual hardware service and cleaning', 'IT Support Team', 2500, 'completed', '2024-10-01', '2024-10-01', '2025-10-01', adminId],
      [serverIds[1]?.id||80, 'inspection', 'Quarterly Health Check', 'Quarterly server health check', 'Venkatesh Iyer', 0, 'completed', '2025-01-10', '2025-01-10', '2025-04-10', adminId],
      [serverIds[2]?.id||81, 'repair', 'RAM Upgrade & Fan Replacement', 'RAM upgrade and fan replacement', 'Dell Service Center', 8500, 'completed', '2024-12-15', '2024-12-20', '2025-12-15', adminId],
      [serverIds[0]?.id||79, 'service', 'Scheduled Maintenance Q2', 'Scheduled maintenance - Q2', 'IT Support Team', 2500, 'scheduled', '2025-04-15', null, '2025-10-15', adminId],
      [serverIds[3]?.id||82, 'upgrade', 'Firmware Upgrade Cisco 9300', 'Firmware upgrade - Cisco 9300', 'Network Team', 0, 'completed', '2025-02-01', '2025-02-01', '2026-02-01', adminId],
    ];
    for (const [eqid, type, title, desc, by, cost, status, sdate, cdate, ndate, cby] of maintRecords) {
      if (eqid) {
        db.prepare(`INSERT INTO maintenance_records (equipment_id,type,title,description,vendor,performed_by,cost,status,scheduled_date,completed_date,next_service_date,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(eqid, type, title, desc, by, by, cost, status, sdate, cdate, ndate, cby);
      }
    }
    console.log('  ✅ Maintenance records: 13 created (8 laptops in maintenance, 5 servers)');
  } else {
    console.log(`  ⏭️  Maintenance records: ${maintExist} already exist, skipped`);
  }

  // ── RETIRED / LOST EQUIPMENT ─────────────────────────────────
  console.log('\n🗄️  Seeding retired/lost equipment...');
  const retiredCount = db.prepare("SELECT COUNT(*) as c FROM equipment WHERE status IN ('retired','lost')").get().c;
  if (retiredCount === 0) {
    // Get some available equipment to retire/mark as lost
    const availForRetire = db.prepare("SELECT id FROM equipment WHERE status='available' AND is_active=1 ORDER BY purchase_date ASC LIMIT 6").all();
    if (availForRetire.length >= 4) {
      db.prepare("UPDATE equipment SET status='retired' WHERE id=?").run(availForRetire[0].id);
      db.prepare("UPDATE equipment SET status='retired' WHERE id=?").run(availForRetire[1].id);
      db.prepare("UPDATE equipment SET status='retired' WHERE id=?").run(availForRetire[2].id);
      db.prepare("UPDATE equipment SET status='lost'    WHERE id=?").run(availForRetire[3].id);
      console.log('  ✅ Retired: 3 equipment, Lost: 1 equipment');
    }
  } else {
    console.log(`  ⏭️  Retired/Lost: ${retiredCount} already exist, skipped`);
  }

  // ── RETURNED ASSIGNMENTS ─────────────────────────────────────
  console.log('\n↩️  Seeding 14 returned assignments...');
  const returnedCount = db.prepare("SELECT COUNT(*) as c FROM assignments WHERE returned_date IS NOT NULL").get().c;
  if (returnedCount === 0) {
    // Get the extra equipment that are available but NOT assigned as active assignments
    const extraEq = db.prepare("SELECT id FROM equipment WHERE status='available' AND is_active=1 AND id NOT IN (SELECT equipment_id FROM assignments WHERE returned_date IS NULL) LIMIT 14").all();
    
    for (let i = 0; i < Math.min(14, extraEq.length); i++) {
      const empId = allEmps[i % allEmps.length].id;
      const eqId = extraEq[i].id;
      const days = Math.floor(Math.random() * 200) + 30;
      const assignDate = new Date(Date.now() - days * 86400000).toISOString().slice(0,10);
      const returnDate = new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString().slice(0,10);
      
      db.prepare('INSERT INTO assignments (employee_id,equipment_id,assigned_by,assigned_date,returned_date,return_reason,condition_on_return,notes) VALUES (?,?,?,?,?,?,?,?)')
        .run(empId, eqId, adminId, assignDate, returnDate, 'Project completed', 'good', 'Returned assignment - seeded');
    }
    console.log(`  ✅ Returned: 14 assignments created (equipment stay available)`);
  } else {
    console.log(`  ⏭️  Returned assignments: ${returnedCount} already exist, skipped`);
  }

  // ── EXTRA MAINTENANCE RECORDS ────────────────────────────────
  console.log('\n🔧 Seeding extra maintenance records...');
  const maintExist2 = db.prepare('SELECT COUNT(*) as c FROM maintenance_records').get().c;
  if (maintExist2 < 20) {
    const laptopIds  = db.prepare("SELECT id FROM equipment WHERE category='Laptop' AND is_active=1 LIMIT 5").all();
    const monitorIds = db.prepare("SELECT id FROM equipment WHERE category='Monitor' AND is_active=1 LIMIT 3").all();
    // Get the new equipment AST-0096 to AST-0107 by tag
    const getEq = (tag) => db.prepare("SELECT id FROM equipment WHERE asset_tag=?").get(tag);
    const eq96  = getEq('AST-0096'); const eq97  = getEq('AST-0097'); const eq98  = getEq('AST-0098');
    const eq99  = getEq('AST-0099'); const eq100 = getEq('AST-0100'); const eq101 = getEq('AST-0101');
    const eq102 = getEq('AST-0102'); const eq103 = getEq('AST-0103'); const eq104 = getEq('AST-0104');
    const eq105 = getEq('AST-0105'); const eq106 = getEq('AST-0106'); const eq107 = getEq('AST-0107');
    const extraRecords = [
      // Original 6 records
      ...(laptopIds[0] ? [[laptopIds[0].id, 'repair',     'Screen Replacement',          'Screen replacement - cracked display',    'LG Service Center',    4500, 'completed',  '2025-08-10', '2025-08-12', '2026-08-10', adminId]] : []),
      ...(laptopIds[1] ? [[laptopIds[1].id, 'service',    'Annual Laptop Service',        'Annual laptop servicing and cleaning',     'IT Support Team',      1500, 'scheduled',  '2026-03-20', null,         '2026-09-20', adminId]] : []),
      ...(laptopIds[2] ? [[laptopIds[2].id, 'inspection', 'Battery Health Check',         'Battery health check and diagnostics',    'IT Support Team',         0, 'in_progress','2026-03-11', null,         '2026-06-11', adminId]] : []),
      ...(laptopIds[3] ? [[laptopIds[3].id, 'upgrade',    'RAM Upgrade 8GB to 16GB',      'RAM upgrade from 8GB to 16GB',            'Dell Service',         3200, 'completed',  '2025-11-15', '2025-11-16', '2026-11-15', adminId]] : []),
      ...(monitorIds[0]? [[monitorIds[0].id,'repair',     'HDMI Port Repair',             'HDMI port repair and testing',            'Electronics Workshop',  800, 'completed',  '2025-09-05', '2025-09-06', '2026-09-05', adminId]] : []),
      ...(monitorIds[1]? [[monitorIds[1].id,'cleaning',   'Deep Cleaning & Calibration',  'Deep cleaning and calibration',           'IT Support Team',         0, 'scheduled',  '2026-03-25', null,         '2026-06-25', adminId]] : []),
      // 12 new records for new equipment AST-0096 to AST-0107
      ...(eq96  ? [[eq96.id,  'service',    'Annual Service - HP EliteBook',       'Annual service and cleaning for HP EliteBook',      'HP Service Center',    1800, 'completed',  '2025-07-10', '2025-07-11', '2026-07-10', adminId]] : []),
      ...(eq97  ? [[eq97.id,  'inspection', 'Pre-deployment Check',               'Full hardware inspection before deployment',         'IT Support Team',         0, 'completed',  '2025-06-05', '2025-06-05', '2026-06-05', adminId]] : []),
      ...(eq98  ? [[eq98.id,  'repair',     'Backlight Repair',                   'Monitor backlight dimming issue repair',             'LG Service Center',   2200, 'completed',  '2025-10-12', '2025-10-14', '2026-10-12', adminId]] : []),
      ...(eq99  ? [[eq99.id,  'upgrade',    'SSD Upgrade 256GB to 512GB',         'SSD capacity upgrade for better performance',        'IT Support Team',      4500, 'completed',  '2025-08-20', '2025-08-21', '2026-08-20', adminId]] : []),
      ...(eq100 ? [[eq100.id, 'cleaning',   'Desktop Deep Clean',                 'Full internal cleaning and thermal paste reapply',  'IT Support Team',         0, 'scheduled',  '2026-04-01', null,         '2026-10-01', adminId]] : []),
      ...(eq101 ? [[eq101.id, 'service',    'Warranty Service - Latitude 5540',   'Under-warranty service at Dell service center',     'Dell Service Center',     0, 'in_progress','2026-03-10', null,         '2026-09-10', adminId]] : []),
      ...(eq102 ? [[eq102.id, 'repair',     'Printer Drum Replacement',           'Drum unit and toner cartridge replacement',         'Brother Service',      3500, 'completed',  '2025-12-01', '2025-12-02', '2026-12-01', adminId]] : []),
      ...(eq103 ? [[eq103.id, 'inspection', 'iPhone Battery Check',               'Battery health and performance check',              'Apple Service',           0, 'completed',  '2025-11-20', '2025-11-20', '2026-11-20', adminId]] : []),
      ...(eq104 ? [[eq104.id, 'service',    'Tablet Annual Service',              'Samsung tablet annual service and update',          'Samsung Service',      1200, 'scheduled',  '2026-04-15', null,         '2026-10-15', adminId]] : []),
      ...(eq105 ? [[eq105.id, 'upgrade',    'Firmware Update - Meraki MX68',      'Cisco Meraki firmware upgrade to latest version',   'Network Team',            0, 'completed',  '2026-01-15', '2026-01-15', '2027-01-15', adminId]] : []),
      ...(eq106 ? [[eq106.id, 'inspection', 'UPS Battery Health Test',            'APC UPS battery capacity and health test',          'APC Service',           500, 'completed',  '2025-09-25', '2025-09-25', '2026-09-25', adminId]] : []),
      ...(eq107 ? [[eq107.id, 'service',    'NAS Drive Health Check',             'Synology NAS drive health and RAID check',          'IT Support Team',         0, 'in_progress','2026-03-05', null,         '2026-09-05', adminId]] : []),
    ];
    for (const [eqid, type, title, desc, by, cost, status, sdate, cdate, ndate, cby] of extraRecords) {
      db.prepare(`INSERT INTO maintenance_records (equipment_id,type,title,description,vendor,performed_by,cost,status,scheduled_date,completed_date,next_service_date,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(eqid, type, title, desc, by, by, cost, status, sdate, cdate, ndate, cby);
    }
    console.log(`  ✅ Extra maintenance records: ${extraRecords.length} created`);
  } else {
    console.log(`  ⏭️  Extra maintenance: ${maintExist2} already exist, skipped`);
  }

  // ── AUDIT LOGS ───────────────────────────────────────────────
  const auditCount = db.prepare('SELECT COUNT(*) as c FROM audit_logs').get().c;
  if (auditCount < 5) {
    db.prepare("INSERT INTO audit_logs (table_name,record_id,action,old_values,new_values,user_id,ip_address,created_at) VALUES (?,?,?,?,?,?,?,datetime('now','-7 days'))")
      .run('equipment', 1, 'INSERT', null, '{"action":"initial_seed"}', adminId, '127.0.0.1');
    db.prepare("INSERT INTO audit_logs (table_name,record_id,action,old_values,new_values,user_id,ip_address,created_at) VALUES (?,?,?,?,?,?,?,datetime('now','-3 days'))")
      .run('employees', 1, 'INSERT', null, '{"action":"initial_seed"}', adminId, '127.0.0.1');
  }

  // ── SUMMARY ─────────────────────────────────────────────────
  const empCount  = db.prepare('SELECT COUNT(*) as c FROM employees WHERE is_active=1').get().c;
  const eqCount   = db.prepare('SELECT COUNT(*) as c FROM equipment WHERE is_active=1').get().c;
  const asgCount  = db.prepare('SELECT COUNT(*) as c FROM assignments WHERE returned_date IS NULL').get().c;
  const availCount= db.prepare("SELECT COUNT(*) as c FROM equipment WHERE status='available'").get().c;

  console.log(`
╔══════════════════════════════════════════════════╗
║     AssetPro v5 — Ready to Use ✅                ║
╠══════════════════════════════════════════════════╣
║  👥 Employees   : ${String(empCount).padEnd(4)} across 14 departments    ║
║  💻 Equipment   : ${String(eqCount).padEnd(4)} items (${String(asgCount).padEnd(4)}assigned, ${String(availCount).padEnd(4)}free) ║
║  📋 Active Asgn : ${String(asgCount).padEnd(36)} ║
╠══════════════════════════════════════════════════╣
║  Login Credentials:                              ║
║  🔵 admin    / admin123    (Full access)         ║
║  🟢 manager  / manager123  (Add/Edit only)       ║
║  🔵 it_admin / itadmin123  (Full access)         ║
╠══════════════════════════════════════════════════╣
║  🚀 Start server: npm start                      ║
║  🌐 Open: http://localhost:3000                  ║
╚══════════════════════════════════════════════════╝`);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
