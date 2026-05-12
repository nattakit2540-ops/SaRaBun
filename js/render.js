import { workGroups } from "./numbering.js";
import { exportCsv, openPrintPreview } from "./export.js";

const titles = {
  dashboard: "Dashboard",
  orders: "คำสั่งโรงเรียน",
  memos: "บันทึกข้อความ",
  outgoing: "หนังสือส่ง",
  search: "ค้นหาย้อนหลัง"
};

const statusLabels = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  returned: "ส่งคืนแก้ไข",
  cancelled: "ยกเลิก",
  sent: "ส่งแล้ว",
  delivered: "รับหนังสือแล้ว"
};

export function setTitle(route) {
  document.getElementById("pageTitle").textContent = titles[route] || titles.dashboard;
}

export function setAlert(message, type = "success") {
  const alert = document.getElementById("alert");
  alert.textContent = message;
  alert.className = `alert ${type}`;
  window.setTimeout(() => alert.classList.add("hidden"), 3200);
}

function emptyState(text) {
  return `<div class="empty-state">${text}</div>`;
}

function documentCard(doc, options = {}) {
  return `<article class="doc-card">
    <div>
      <span class="doc-type">${doc.typeLabel}</span>
      <h4>${doc.subject || "-"}</h4>
      <p>${doc.number || "-"}</p>
    </div>
    <div class="doc-meta">
      <span class="status-pill status-${doc.status}">${statusLabels[doc.status] || doc.status}</span>
      <button class="small-btn" data-action="preview" data-id="${doc.id}" type="button">ดูร่าง</button>
      ${options.status ? `<select class="status-select" data-action="status" data-id="${doc.id}">
        <option value="">เปลี่ยนสถานะ</option>
        <option value="pending">รออนุมัติ</option>
        <option value="approved">อนุมัติแล้ว</option>
        <option value="returned">ส่งคืนแก้ไข</option>
        <option value="cancelled">ยกเลิก</option>
      </select>` : ""}
      ${options.receipt && doc.status !== "delivered" ? `<button class="small-btn" data-action="receipt" data-id="${doc.id}" type="button">ยืนยันรับ</button>` : ""}
    </div>
  </article>`;
}

export function renderDashboard(documents) {
  const template = document.getElementById("dashboardTemplate").content.cloneNode(true);
  const counts = {
    orders: documents.filter((doc) => doc.module === "orders").length,
    memos: documents.filter((doc) => doc.module === "memos").length,
    outgoing: documents.filter((doc) => doc.module === "outgoing").length,
    attachments: documents.filter((doc) => doc.attachment).length
  };
  Object.entries(counts).forEach(([key, value]) => {
    template.querySelector(`[data-stat="${key}"]`).textContent = value;
  });
  document.getElementById("content").replaceChildren(template);

  const statusSummary = document.getElementById("statusSummary");
  const statuses = ["pending", "approved", "sent", "delivered"];
  statusSummary.innerHTML = statuses
    .map((status) => `<div class="status-box"><span>${statusLabels[status]}</span><strong>${documents.filter((doc) => doc.status === status).length}</strong></div>`)
    .join("");

  const recent = documents.slice(0, 6);
  document.getElementById("recentDocuments").innerHTML = recent.length
    ? recent.map((doc) => documentCard(doc)).join("")
    : emptyState("ยังไม่มีเอกสารในระบบ");
}

export function renderOrders(documents) {
  const orders = documents.filter((doc) => doc.module === "orders");
  document.getElementById("content").innerHTML = `<section class="form-grid">
    <form id="orderForm" class="panel form-panel">
      <div class="panel-head"><h3>สร้างคำสั่งโรงเรียน</h3><button class="ghost-btn" data-export="orders" type="button">Export CSV</button></div>
      <label>เรื่อง<input name="subject" required></label>
      <div class="two-col">
        <label>วันที่ออก<input name="issuedDate" type="date" required></label>
        <label>ประเภท<select name="category" required><option>แต่งตั้ง</option><option>มอบหมายงาน</option><option>เวรปฏิบัติราชการ</option><option>กิจกรรมโรงเรียน</option></select></label>
      </div>
      <label>รายละเอียด<textarea name="detail" rows="5" required></textarea></label>
      <div class="two-col">
        <label>ผู้ลงนาม<input name="signer" required></label>
        <label>ไฟล์แนบ<input name="attachment" type="file"></label>
      </div>
      <button class="primary-btn" type="submit">บันทึกคำสั่ง</button>
    </form>
    <section class="panel">
      <div class="panel-head"><h3>ทะเบียนคำสั่ง</h3></div>
      <div class="doc-list">${orders.length ? orders.map((doc) => documentCard(doc)).join("") : emptyState("ยังไม่มีคำสั่งโรงเรียน")}</div>
    </section>
  </section>`;
}

export function renderMemos(documents) {
  const memos = documents.filter((doc) => doc.module === "memos");
  const groupOptions = Object.entries(workGroups).map(([key, group]) => `<option value="${key}" data-fiscal="${group.fiscal ? "1" : "0"}">${group.code} - ${group.name}</option>`).join("");
  document.getElementById("content").innerHTML = `<section class="form-grid">
    <form id="memoForm" class="panel form-panel">
      <div class="panel-head"><h3>สร้างบันทึกข้อความ</h3><button class="ghost-btn" data-export="memos" type="button">Export CSV</button></div>
      <label>เรื่อง<input name="subject" required></label>
      <div class="two-col">
        <label>กลุ่มงาน<select id="workGroupSelect" name="workGroup" required>${groupOptions}</select></label>
        <label>วันที่<input name="memoDate" type="date" required></label>
      </div>
      <div class="two-col">
        <label>ผู้เสนอ<input name="proposer" required></label>
        <label>ผู้อนุมัติ<input name="approver" required></label>
      </div>
      <div class="two-col">
        <label>วัตถุประสงค์<select name="objective" required><option>เพื่อโปรดทราบ</option><option>เพื่อพิจารณา</option><option>เพื่ออนุมัติ</option><option>เพื่อดำเนินการ</option></select></label>
        <label id="fiscalField" class="hidden">รหัสปีงบ<input name="fiscalYear" placeholder="2568"></label>
      </div>
      <label>เนื้อหา<textarea name="content" rows="6" required></textarea></label>
      <button class="primary-btn" type="submit">บันทึกข้อความ</button>
    </form>
    <section class="panel">
      <div class="panel-head"><h3>ทะเบียนบันทึกข้อความ</h3></div>
      <div class="doc-list">${memos.length ? memos.map((doc) => documentCard(doc, { status: true })).join("") : emptyState("ยังไม่มีบันทึกข้อความ")}</div>
    </section>
  </section>`;
}

export function renderOutgoing(documents) {
  const outgoing = documents.filter((doc) => doc.module === "outgoing");
  document.getElementById("content").innerHTML = `<section class="form-grid">
    <form id="outgoingForm" class="panel form-panel">
      <div class="panel-head"><h3>สร้างหนังสือส่ง</h3><button class="ghost-btn" data-export="outgoing" type="button">Export CSV</button></div>
      <label>ถึงหน่วยงาน<input name="recipientOrg" required></label>
      <label>เรื่อง<input name="subject" required></label>
      <div class="two-col">
        <label>อ้างถึง<input name="reference"></label>
        <label>สิ่งที่ส่งมาด้วย<input name="enclosure"></label>
      </div>
      <label>สาระหนังสือ<textarea name="body" rows="6" required></textarea></label>
      <div class="two-col">
        <label>ผู้ลงนาม<input name="signer" required></label>
        <label>ช่องทางส่ง<select name="channel" required><option>ระบบอิเล็กทรอนิกส์</option><option>ไปรษณีย์</option><option>นำส่งด้วยตนเอง</option><option>อีเมล</option></select></label>
      </div>
      <label>ไฟล์แนบ<input name="attachment" type="file"></label>
      <fieldset class="checklist">
        <legend>Checklist ก่อนส่ง</legend>
        <label><input name="checklist" value="ตรวจเลขที่หนังสือ" type="checkbox" required> ตรวจเลขที่หนังสือ</label>
        <label><input name="checklist" value="ตรวจผู้รับและเรื่อง" type="checkbox" required> ตรวจผู้รับและเรื่อง</label>
        <label><input name="checklist" value="ตรวจไฟล์แนบ" type="checkbox" required> ตรวจไฟล์แนบ</label>
      </fieldset>
      <button class="primary-btn" type="submit">บันทึกหนังสือส่ง</button>
    </form>
    <section class="panel">
      <div class="panel-head"><h3>ทะเบียนหนังสือส่ง</h3></div>
      <div class="doc-list">${outgoing.length ? outgoing.map((doc) => documentCard(doc, { receipt: true })).join("") : emptyState("ยังไม่มีหนังสือส่ง")}</div>
    </section>
  </section>`;
}

export function renderSearch(documents, keyword = "") {
  document.getElementById("content").innerHTML = `<section class="panel">
    <div class="panel-head"><h3>ค้นหาย้อนหลัง</h3></div>
    <form id="searchForm" class="search-row">
      <input name="keyword" value="${keyword}" placeholder="ค้นด้วยเลขที่ เรื่อง สถานะ กลุ่มงาน หรือหน่วยงาน">
      <button class="primary-btn" type="submit">ค้นหา</button>
    </form>
    <div class="doc-list">${documents.length ? documents.map((doc) => documentCard(doc, { status: doc.module === "memos", receipt: doc.module === "outgoing" })).join("") : emptyState("ไม่พบเอกสาร")}</div>
  </section>`;
}

export function bindSharedActions(root, documents, handlers) {
  root.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => exportCsv(button.dataset.export, documents));
  });
  root.querySelectorAll('[data-action="preview"]').forEach((button) => {
    button.addEventListener("click", () => {
      const doc = documents.find((item) => item.id === button.dataset.id);
      if (doc) openPrintPreview(doc);
    });
  });
  root.querySelectorAll('[data-action="status"]').forEach((select) => {
    select.addEventListener("change", () => {
      if (select.value) handlers.status(select.dataset.id, select.value);
    });
  });
  root.querySelectorAll('[data-action="receipt"]').forEach((button) => {
    button.addEventListener("click", () => handlers.receipt(button.dataset.id));
  });
}
