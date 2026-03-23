/**
 * AssetPro — Professional Email Service
 * Sends real emails via Gmail SMTP (nodemailer)
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[EmailService] ⚠️  Email config missing in .env — emails will be skipped.');
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  return _transporter;
}

async function sendMail(to, subject, html) {
  const t = getTransporter();
  if (!t) return false;
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || `AssetPro <${process.env.EMAIL_USER}>`,
      to, subject, html,
    });
    console.log(`[EmailService] ✅ Sent → ${to} | ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EmailService] ❌ Failed → ${to}: ${err.message}`);
    return false;
  }
}

function wrapEmail(headerColor, headerIcon, headerTitle, bodyHtml) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${headerTitle}</title></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:${headerColor};border-radius:12px 12px 0 0;padding:28px 36px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><div style="color:#fff;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;opacity:.75;margin-bottom:4px;">AssetPro</div>
    <div style="color:#fff;font-size:22px;font-weight:700;">${headerIcon}&nbsp;${headerTitle}</div></td>
    <td align="right" style="color:rgba(255,255,255,.2);font-size:50px;">${headerIcon}</td>
  </tr></table>
</td></tr>
<tr><td style="background:#fff;padding:32px 36px;">${bodyHtml}</td></tr>
<tr><td style="background:#f8f9fa;border-radius:0 0 12px 12px;padding:18px 36px;border-top:1px solid #e9ecef;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="color:#868e96;font-size:12px;">Automated message from <strong>AssetPro</strong>. Do not reply.</td>
    <td align="right" style="color:#868e96;font-size:12px;">${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td>
  </tr></table>
</td></tr>
</table></td></tr></table></body></html>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#495057;background:#f8f9fa;border:1px solid #e9ecef;width:38%;">${label}</td>
    <td style="padding:10px 14px;font-size:13px;color:#212529;background:#fff;border:1px solid #e9ecef;">${value}</td>
  </tr>`;
}

// ── 1. ASSIGNMENT EMAIL ────────────────────────────────────────
exports.sendAssignmentEmail = async (data) => {
  const { employeeName, employeeEmail, assetTag, brand, model, category, assignedDate, expectedReturn, assignedByName } = data;
  if (!employeeEmail) return;

  const fDate = d => d ? new Date(d).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'Not specified';

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">A new equipment has been assigned to you. Please review the details and confirm receipt.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${infoRow('Asset Tag', `<strong>${assetTag||'N/A'}</strong>`)}
      ${infoRow('Category', category||'N/A')}
      ${infoRow('Brand & Model', `${brand||''} ${model||''}`.trim()||'N/A')}
      ${infoRow('Assigned Date', fDate(assignedDate))}
      ${infoRow('Expected Return', `<span style="color:#e03131;font-weight:600;">${fDate(expectedReturn)}</span>`)}
      ${infoRow('Assigned By', assignedByName||'Admin')}
    </table>
    <div style="background:#e8f4fd;border-left:4px solid #1971c2;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#1864ab;line-height:1.6;">📋 <strong>Your responsibility:</strong> Take care of this equipment and return it by the due date. Report any issues through the AssetPro portal immediately.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `✅ Equipment Assigned to You — ${brand||''} ${model||''} (${assetTag||'N/A'})`,
    wrapEmail('#1971c2','💻','Equipment Assigned to You', body));
};

// ── 2. RETURN EMAIL ───────────────────────────────────────────
exports.sendReturnEmail = async (data) => {
  const { employeeName, employeeEmail, assetTag, brand, model, returnDate, condition } = data;
  if (!employeeEmail) return;

  const condColor = {excellent:'#2f9e44',good:'#2f9e44',fair:'#e67700',poor:'#e03131'}[condition]||'#495057';
  const fDate = d => d ? new Date(d).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'Today';

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">Your equipment return has been successfully recorded. Thank you!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${infoRow('Asset Tag', `<strong>${assetTag||'N/A'}</strong>`)}
      ${infoRow('Equipment', `${brand||''} ${model||''}`.trim()||'N/A')}
      ${infoRow('Return Date', fDate(returnDate))}
      ${infoRow('Condition', `<span style="color:${condColor};font-weight:600;text-transform:capitalize;">${condition||'Good'}</span>`)}
    </table>
    <div style="background:#ebfbee;border-left:4px solid #2f9e44;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#2b8a3e;">✅ <strong>Return confirmed.</strong> This equipment is now back in inventory.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `📦 Equipment Return Confirmed — ${assetTag||'N/A'}`,
    wrapEmail('#2f9e44','📦','Equipment Returned Successfully', body));
};

// ── 3. RETURN REMINDER EMAIL ──────────────────────────────────
exports.sendReturnReminderEmail = async (data) => {
  const { employeeEmail, employeeName, assetTag, brand, model, expectedReturnDate, daysLeft } = data;
  if (!employeeEmail) return;

  const days = daysLeft || 7;
  const urgColor = days <= 2 ? '#e03131' : days <= 5 ? '#e67700' : '#1971c2';
  const fDate = d => d ? new Date(d).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'Upcoming';

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">This is a friendly reminder — your equipment is due for return soon.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:${urgColor};color:#fff;font-size:26px;font-weight:700;padding:16px 36px;border-radius:12px;">⏰ ${days} Day${days!==1?'s':''} Remaining</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${infoRow('Asset Tag', `<strong>${assetTag||'N/A'}</strong>`)}
      ${infoRow('Equipment', `${brand||''} ${model||''}`.trim()||'N/A')}
      ${infoRow('Return Due Date', `<span style="color:${urgColor};font-weight:700;">${fDate(expectedReturnDate)}</span>`)}
    </table>
    <div style="background:#fff9db;border-left:4px solid #f59f00;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#7c5e00;line-height:1.6;">⚠️ <strong>Action required:</strong> Return this equipment to the IT/Admin department on or before the due date.<br><br>📝 Need more time? Log in to <strong>AssetPro</strong> and submit an extension request with your reason.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `⏰ Return Reminder: ${brand||''} ${model||''} (${assetTag}) — Due in ${days} day${days!==1?'s':''}`,
    wrapEmail(urgColor,'⏰','Equipment Return Reminder', body));
};

// ── 4. WARRANTY EXPIRY EMAIL (to assigned employee) ───────────
exports.sendWarrantyExpiryEmail = async (data) => {
  const { employeeEmail, employeeName, assetTag, brand, model, warrantyExpiry, daysLeft } = data;
  if (!employeeEmail) return;

  const days = daysLeft || 30;
  const fDate = d => d ? new Date(d).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'Upcoming';

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">The warranty for equipment assigned to you is expiring soon. Please take action before it expires.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#e67700;color:#fff;font-size:26px;font-weight:700;padding:16px 36px;border-radius:12px;">🛡️ Expires in ${days} Day${days!==1?'s':''}</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${infoRow('Asset Tag', `<strong>${assetTag||'N/A'}</strong>`)}
      ${infoRow('Equipment', `${brand||''} ${model||''}`.trim()||'N/A')}
      ${infoRow('Warranty Expiry', `<span style="color:#e03131;font-weight:700;">${fDate(warrantyExpiry)}</span>`)}
    </table>
    <div style="background:#fff4e6;border-left:4px solid #e67700;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#a04800;line-height:1.6;">🛡️ <strong>Important:</strong> Report any hardware issues <strong>before the warranty expires</strong>. After expiry, repairs won't be covered.<br><br>📞 Contact IT or raise an issue in <strong>AssetPro</strong> immediately if you notice any problems.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `🛡️ Warranty Expiry Alert: ${brand||''} ${model||''} (${assetTag}) — ${days} days left`,
    wrapEmail('#e67700','🛡️','Warranty Expiring Soon', body));
};

// ── 5. WARRANTY ALERT (batch — to admin) ──────────────────────
exports.sendWarrantyAlertEmail = async (data) => {
  const { recipientEmail, recipientName, items } = data;
  if (!recipientEmail || !items || items.length === 0) return;

  const rowsHtml = items.map(item => `
    <tr>
      <td style="padding:10px 14px;font-size:13px;border:1px solid #e9ecef;">${item.asset_tag||'N/A'}</td>
      <td style="padding:10px 14px;font-size:13px;border:1px solid #e9ecef;">${item.brand||''} ${item.model||''}</td>
      <td style="padding:10px 14px;font-size:13px;color:#e03131;font-weight:600;border:1px solid #e9ecef;">${item.warranty_expiry}</td>
    </tr>`).join('');

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${recipientName||'Administrator'}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;"><strong>${items.length} asset(s)</strong> have warranties expiring within 30 days.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      <tr style="background:#f8f9fa;">
        <th style="padding:10px 14px;font-size:12px;color:#868e96;text-transform:uppercase;border:1px solid #e9ecef;text-align:left;">Asset Tag</th>
        <th style="padding:10px 14px;font-size:12px;color:#868e96;text-transform:uppercase;border:1px solid #e9ecef;text-align:left;">Equipment</th>
        <th style="padding:10px 14px;font-size:12px;color:#868e96;text-transform:uppercase;border:1px solid #e9ecef;text-align:left;">Expiry Date</th>
      </tr>
      ${rowsHtml}
    </table>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(recipientEmail,
    `🛡️ Warranty Alert: ${items.length} Asset(s) Expiring Soon`,
    wrapEmail('#e67700','🛡️',`Warranty Alert — ${items.length} Asset(s)`, body));
};

// ── 6. EXPECTED RETURN DATE UPDATED EMAIL ────────────────────
exports.sendExpectedReturnUpdatedEmail = async (data) => {
  const { employeeName, employeeEmail, assetTag, brand, model, oldReturnDate, newReturnDate, updatedByName } = data;
  if (!employeeEmail) return;

  const fDate = d => d ? new Date(d).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : 'Not specified';
  const hasNewDate = newReturnDate && newReturnDate !== 'null';

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">The <strong>expected return date</strong> for your assigned equipment has been updated. Please take note of the new deadline.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${infoRow('Asset Tag', `<strong>${assetTag||'N/A'}</strong>`)}
      ${infoRow('Equipment', `${brand||''} ${model||''}`.trim()||'N/A')}
      ${infoRow('Previous Return Date', `<span style="color:#868e96;text-decoration:line-through;">${fDate(oldReturnDate)}</span>`)}
      ${infoRow('New Return Date', `<span style="color:#e03131;font-weight:700;">${hasNewDate ? fDate(newReturnDate) : 'Not specified'}</span>`)}
      ${infoRow('Updated By', updatedByName||'Admin')}
    </table>
    <div style="background:#fff9db;border-left:4px solid #f59f00;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#7c5e00;line-height:1.6;">📅 <strong>Please update your schedule accordingly.</strong> Make sure to return the equipment on or before the new due date.<br><br>If you have questions, contact IT/Admin through the AssetPro portal.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `📅 Return Date Updated — ${brand||''} ${model||''} (${assetTag||'N/A'})`,
    wrapEmail('#e67700','📅','Equipment Return Date Updated', body));
};

// ── 7. WELCOME NEW EMPLOYEE EMAIL ────────────────────────────
exports.sendWelcomeEmail = async (data) => {
  const { employeeName, employeeEmail, employeeId, department, position, addedByName } = data;
  if (!employeeEmail) return;

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Dear <strong>${employeeName}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 20px;line-height:1.6;">Welcome aboard! Your profile has been successfully created in <strong>AssetPro</strong> — our Equipment & Asset Management System. You are now registered and can be assigned company equipment.</p>
    <div style="background:linear-gradient(135deg,#1971c2 0%,#1864ab 100%);border-radius:10px;padding:24px;margin:0 0 24px;text-align:center;">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">Your Employee Profile</div>
      <div style="color:#fff;font-size:24px;font-weight:700;margin-bottom:4px;">${employeeName}</div>
      ${employeeId ? `<div style="color:rgba(255,255,255,0.85);font-size:14px;background:rgba(255,255,255,0.15);display:inline-block;padding:4px 14px;border-radius:20px;margin-top:6px;">ID: ${employeeId}</div>` : ''}
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      ${employeeId ? infoRow('Employee ID', `<strong>${employeeId}</strong>`) : ''}
      ${department ? infoRow('Department', department) : ''}
      ${position ? infoRow('Position / Role', position) : ''}
      ${infoRow('Added By', addedByName||'Admin')}
      ${infoRow('Profile Status', '<span style="color:#2f9e44;font-weight:600;">✅ Active</span>')}
    </table>
    <div style="background:#ebfbee;border-left:4px solid #2f9e44;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#2b8a3e;line-height:1.7;">🎉 <strong>What happens next?</strong><br>
      • IT/Admin will assign you the necessary equipment shortly.<br>
      • You will receive a separate email when equipment is assigned to you.<br>
      • Please ensure you keep all assigned equipment safe and in good condition.<br>
      • For any queries, reach out to the IT/Admin team directly.</p>
    </div>
    <p style="font-size:14px;color:#495057;margin:0;">We are happy to have you on the team!<br><br>Best regards,<br><strong>AssetPro Team</strong></p>`;

  await sendMail(employeeEmail,
    `🎉 Welcome to AssetPro — Your Profile is Ready, ${employeeName}!`,
    wrapEmail('#1971c2','🎉',`Welcome, ${employeeName}!`, body));
};

// ── 8. PASSWORD RESET EMAIL ───────────────────────────────────
exports.sendPasswordResetEmail = async (data) => {
  const { email, username, resetToken, appUrl } = data;
  if (!email || !resetToken) return;

  const link = `${appUrl||'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const body = `
    <p style="font-size:16px;color:#212529;margin:0 0 20px;">Hello <strong>${username||'User'}</strong>,</p>
    <p style="font-size:14px;color:#495057;margin:0 0 24px;line-height:1.6;">We received a request to reset your AssetPro password.</p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:#1971c2;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;">🔐 Reset My Password</a>
    </div>
    <p style="font-size:12px;color:#868e96;margin:0 0 8px;">Or copy this link:</p>
    <div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:6px;padding:10px 14px;word-break:break-all;font-size:12px;color:#495057;margin-bottom:20px;">${link}</div>
    <div style="background:#fff5f5;border-left:4px solid #e03131;border-radius:0 8px 8px 0;padding:12px 16px;">
      <p style="margin:0;font-size:13px;color:#c92a2a;">⚠️ This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>
    </div>`;

  await sendMail(email, '🔐 Password Reset Request — AssetPro',
    wrapEmail('#1971c2','🔐','Password Reset Request', body));
};
