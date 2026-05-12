import { firebaseConfig, hasFirebaseConfig } from "./firebase-config.js";
import {
  createKeywords,
  formatMemoNumber,
  formatOrderNumber,
  formatOutgoingNumber,
  getNextLocalNumber,
  buddhistYear,
  workGroups
} from "./numbering.js";

const STORE_KEY = "esaraban.documents";
let firebaseServices = null;
let forceLocalRepository = false;

export function configureRepository({ forceLocal = false } = {}) {
  forceLocalRepository = forceLocal;
}

function nowIso() {
  return new Date().toISOString();
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocal(items) {
  localStorage.setItem(STORE_KEY, JSON.stringify(items));
}

async function loadFirebase() {
  if (forceLocalRepository) return null;
  if (!hasFirebaseConfig()) return null;
  if (firebaseServices) return firebaseServices;

  const [appFns, firestoreFns, storageFns] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js")
  ]);

  const app = appFns.getApps().length ? appFns.getApps()[0] : appFns.initializeApp(firebaseConfig);
  firebaseServices = {
    db: firestoreFns.getFirestore(app),
    storage: storageFns.getStorage(app),
    firestore: firestoreFns,
    storageFns
  };
  return firebaseServices;
}

async function uploadAttachment(file, path) {
  if (!file || !file.name) return null;
  const services = await loadFirebase().catch(() => null);
  if (!services) {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      demoOnly: true
    };
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-\u0E00-\u0E7F]/g, "_")}`;
  const fileRef = services.storageFns.ref(services.storage, `${path}/${safeName}`);
  await services.storageFns.uploadBytes(fileRef, file);
  const url = await services.storageFns.getDownloadURL(fileRef);
  return { name: file.name, size: file.size, type: file.type, url, storagePath: fileRef.fullPath };
}

async function nextFirestoreNumber(type, dateValue, scope = "general") {
  const services = await loadFirebase();
  if (!services) return getNextLocalNumber(type, dateValue, scope);

  const year = buddhistYear(dateValue);
  const docId = `${type}_${year}_${scope}`;
  const counterRef = services.firestore.doc(services.db, "counters", docId);
  const running = await services.firestore.runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const nextValue = (snapshot.exists() ? snapshot.data().running : 0) + 1;
    transaction.set(counterRef, { type, year, scope, running: nextValue, updatedAt: nowIso() }, { merge: true });
    return nextValue;
  });
  return { year, running };
}

async function saveDocument(document) {
  const services = await loadFirebase().catch(() => null);
  if (!services) {
    const documents = readLocal();
    documents.unshift(document);
    writeLocal(documents);
    return document;
  }

  await services.firestore.setDoc(services.firestore.doc(services.db, "documents", document.id), document);
  return document;
}

export async function listDocuments() {
  const services = await loadFirebase().catch(() => null);
  if (!services) return readLocal();

  const querySnapshot = await services.firestore.getDocs(
    services.firestore.query(
      services.firestore.collection(services.db, "documents"),
      services.firestore.orderBy("createdAt", "desc")
    )
  );
  return querySnapshot.docs.map((doc) => doc.data());
}

export async function createOrder(form, user) {
  const issuedDate = form.get("issuedDate");
  const { year, running } = await nextFirestoreNumber("order", issuedDate);
  const attachment = await uploadAttachment(form.get("attachment"), "orders");
  const docNumber = formatOrderNumber(year, running);
  const subject = form.get("subject").trim();
  const signer = form.get("signer").trim();
  const document = {
    id: crypto.randomUUID(),
    module: "orders",
    typeLabel: "คำสั่งโรงเรียน",
    number: docNumber,
    year,
    running,
    subject,
    issuedDate,
    category: form.get("category"),
    detail: form.get("detail").trim(),
    signer,
    status: "approved",
    draft: buildOrderDraft({ docNumber, subject, issuedDate, category: form.get("category"), detail: form.get("detail"), signer }),
    metadata: {
      documentType: "school_order",
      numberingRule: "คส.ปีพ.ศ./ลำดับ",
      sarabanReference: "ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม"
    },
    keywords: createKeywords(docNumber, subject, signer, form.get("category"), form.get("detail")),
    attachment,
    auditLog: [{ action: "created", by: user.displayName || user.uid, at: nowIso(), status: "approved" }],
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  return saveDocument(document);
}

export async function createMemo(form, user) {
  const memoDate = form.get("memoDate");
  const groupKey = form.get("workGroup");
  const fiscalYear = form.get("fiscalYear").trim();
  const { year, running } = await nextFirestoreNumber("memo", memoDate, groupKey);
  const docNumber = formatMemoNumber(groupKey, year, running, fiscalYear);
  const group = workGroups[groupKey] || workGroups.bot;
  const subject = form.get("subject").trim();
  const document = {
    id: crypto.randomUUID(),
    module: "memos",
    typeLabel: "บันทึกข้อความ",
    number: docNumber,
    year,
    running,
    subject,
    memoDate,
    workGroup: groupKey,
    workGroupLabel: group.name,
    proposer: form.get("proposer").trim(),
    approver: form.get("approver").trim(),
    objective: form.get("objective"),
    content: form.get("content").trim(),
    fiscalYearCode: group.fiscal ? fiscalYear : "",
    status: "pending",
    draft: buildMemoDraft({ docNumber, subject, memoDate, group, proposer: form.get("proposer"), approver: form.get("approver"), objective: form.get("objective"), content: form.get("content") }),
    metadata: { documentType: "memo", workGroupCode: group.code, calendarYear: year },
    keywords: createKeywords(docNumber, subject, group.name, form.get("proposer"), form.get("approver"), form.get("content")),
    attachment: null,
    auditLog: [{ action: "created", by: user.displayName || user.uid, at: nowIso(), status: "pending" }],
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  return saveDocument(document);
}

export async function createOutgoing(form, user) {
  const sentDate = new Date();
  const { year, running } = await nextFirestoreNumber("outgoing", sentDate);
  const attachment = await uploadAttachment(form.get("attachment"), "outgoing");
  const docNumber = formatOutgoingNumber(running);
  const subject = form.get("subject").trim();
  const document = {
    id: crypto.randomUUID(),
    module: "outgoing",
    typeLabel: "หนังสือส่ง",
    number: docNumber,
    year,
    running,
    recipientOrg: form.get("recipientOrg").trim(),
    subject,
    reference: form.get("reference").trim(),
    enclosure: form.get("enclosure").trim(),
    body: form.get("body").trim(),
    signer: form.get("signer").trim(),
    channel: form.get("channel"),
    checklist: form.getAll("checklist"),
    receipt: null,
    status: "sent",
    draft: buildOutgoingDraft({
      docNumber,
      recipientOrg: form.get("recipientOrg"),
      subject,
      reference: form.get("reference"),
      enclosure: form.get("enclosure"),
      body: form.get("body"),
      signer: form.get("signer")
    }),
    metadata: { documentType: "outgoing_letter", prefix: docNumber.split("/")[0], calendarYear: year },
    keywords: createKeywords(docNumber, subject, form.get("recipientOrg"), form.get("reference"), form.get("body"), form.get("signer")),
    attachment,
    auditLog: [{ action: "created", by: user.displayName || user.uid, at: nowIso(), status: "sent" }],
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  return saveDocument(document);
}

export async function updateStatus(id, status, user, note = "") {
  const documents = await listDocuments();
  const current = documents.find((item) => item.id === id);
  if (!current) throw new Error("ไม่พบเอกสาร");
  current.status = status;
  current.updatedAt = nowIso();
  current.auditLog = current.auditLog || [];
  current.auditLog.unshift({ action: "status_changed", by: user.displayName || user.uid, at: nowIso(), status, note });

  const services = await loadFirebase().catch(() => null);
  if (!services) {
    writeLocal(documents.map((item) => (item.id === id ? current : item)));
    return current;
  }
  await services.firestore.setDoc(services.firestore.doc(services.db, "documents", id), current, { merge: true });
  return current;
}

export async function confirmReceipt(id, receipt, user) {
  const documents = await listDocuments();
  const current = documents.find((item) => item.id === id);
  if (!current) throw new Error("ไม่พบหนังสือส่ง");
  current.status = "delivered";
  current.receipt = receipt;
  current.updatedAt = nowIso();
  current.auditLog = current.auditLog || [];
  current.auditLog.unshift({ action: "receipt_confirmed", by: user.displayName || user.uid, at: nowIso(), status: "delivered", receipt });

  const services = await loadFirebase().catch(() => null);
  if (!services) {
    writeLocal(documents.map((item) => (item.id === id ? current : item)));
    return current;
  }
  await services.firestore.setDoc(services.firestore.doc(services.db, "documents", id), current, { merge: true });
  return current;
}

export function searchDocuments(documents, keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return documents;
  return documents.filter((doc) => {
    const haystack = [
      doc.number,
      doc.subject,
      doc.typeLabel,
      doc.status,
      doc.recipientOrg,
      doc.workGroupLabel,
      ...(doc.keywords || [])
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function buildOrderDraft(data) {
  return `คำสั่งโรงเรียน\n${data.docNumber}\nเรื่อง ${data.subject}\n\nด้วยโรงเรียนมีความจำเป็นต้องดำเนินการเกี่ยวกับ ${data.category} ดังรายละเอียดต่อไปนี้\n${data.detail}\n\nทั้งนี้ ตั้งแต่วันที่ ${data.issuedDate} เป็นต้นไป\n\nสั่ง ณ วันที่ ${data.issuedDate}\n\nลงชื่อ ${data.signer}`;
}

export function buildMemoDraft(data) {
  return `บันทึกข้อความ\nส่วนราชการ ${data.group.name}\nที่ ${data.docNumber}    วันที่ ${data.memoDate}\nเรื่อง ${data.subject}\n\nเรียน ${data.approver}\n\n${data.content}\n\nวัตถุประสงค์: ${data.objective}\n\nลงชื่อ ${data.proposer}\nผู้เสนอ`;
}

export function buildOutgoingDraft(data) {
  return `${data.docNumber}\n\nเรื่อง ${data.subject}\nเรียน ${data.recipientOrg}\nอ้างถึง ${data.reference || "-"}\nสิ่งที่ส่งมาด้วย ${data.enclosure || "-"}\n\n${data.body}\n\nขอแสดงความนับถือ\n\n${data.signer}`;
}
