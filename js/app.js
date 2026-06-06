(function () {
  "use strict";

  const config = window.EsarabanConfig || {};
  const firebaseConfig = config.firebaseConfig || {};
  const appSettings = config.appSettings || {
    outgoingPrefix: "ศธ 04122.014",
    fiscalYearCodePrefix: "งป"
  };

  const storeKey = "esaraban.documents";
  const counterKey = "esaraban.counters";
  const authKey = "esaraban.auth";
  const settingsKey = "esaraban.settings";
  const demoUser = { uid: "demo-admin", displayName: "ผู้ดูแลระบบ", mode: "demo" };
  const localAdminCredentials = { username: "stamp45240", password: "Punbnk48" };

  const workGroups = {
    bot: { code: "บท", name: "บริหารทั่วไป" },
    academic: { code: "วช", name: "วิชาการ" },
    budget: { code: "งบ", name: "งบประมาณ/การเงิน", fiscal: true },
    supply: { code: "พส", name: "พัสดุ", fiscal: true },
    hr: { code: "บค", name: "บุคคล" },
    student: { code: "กน", name: "กิจการนักเรียน" }
  };

  const statusLabels = {
    pending: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    returned: "ส่งคืนแก้ไข",
    cancelled: "ยกเลิก",
    sent: "ส่งแล้ว",
    delivered: "รับหนังสือแล้ว"
  };

  let currentUser = getStoredUser();
  let currentRoute = "dashboard";
  let documents = [];
  let firebaseServices = null;
  let memoGroupFilter = "all";

  const loginView = document.getElementById("loginView");
  const appView = document.getElementById("appView");
  const content = document.getElementById("content");

  function hasFirebaseConfig() {
    return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
  }

  function isDemoUser(user) {
    return !user || user.mode === "demo";
  }

  function createPublicUser() {
    return {
      uid: "public-local",
      displayName: "ผู้ใช้งานทั่วไป",
      mode: hasFirebaseConfig() ? "firebase" : "local",
      loginType: "public",
      role: "public"
    };
  }

  function canEditDocuments() {
    const role = (currentUser && currentUser.role) || "public";
    return ["admin", "officer"].includes(role);
  }

  function canApproveDocuments() {
    return ["admin", "approver"].includes((currentUser && currentUser.role) || "admin");
  }

  function syncAccessControls() {
    const isAdmin = canEditDocuments();
    document.querySelectorAll(".admin-only").forEach((element) => {
      element.classList.toggle("hidden", !isAdmin);
      element.setAttribute("aria-hidden", String(!isAdmin));
    });

    const adminLoginButton = document.getElementById("adminLoginBtn");
    if (adminLoginButton) adminLoginButton.classList.toggle("hidden", isAdmin);

    const logoutButton = document.getElementById("logoutBtn");
    if (logoutButton) logoutButton.textContent = isAdmin ? "ออกจากระบบ Admin" : "กลับหน้าแรก";
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function today() {
    return nowIso().slice(0, 10);
  }

  function buddhistYear(dateValue) {
    const date = dateValue ? new Date(dateValue) : new Date();
    return date.getFullYear() + 543;
  }

  function padRunning(value) {
    return String(value).padStart(3, "0");
  }

  function safeJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function getSettings() {
    return Object.assign(
      {
        schoolName: "โรงเรียนชุมชนบ้านหนองผึ้ง (ประพันธ์คุรุราษฎร์อุทิศ)",
        shortSchoolName: "โรงเรียนชุมชนบ้านหนองผึ้ง",
        schoolCode: "04122.014",
        outgoingPrefix: "ศธ 04122.014",
        fiscalYear: String(buddhistYear(new Date())),
        fiscalYearCodePrefix: "งป",
        defaultUserRole: "officer",
        teacherPasscode: "2468"
      },
      appSettings,
      safeJson(settingsKey, {})
    );
  }

  function saveSettings(values) {
    const nextSettings = Object.assign(getSettings(), values);
    localStorage.setItem(settingsKey, JSON.stringify(nextSettings));
    Object.assign(appSettings, nextSettings);
    applyBranding();
    return nextSettings;
  }

  function applyBranding() {
    const settings = getSettings();
    document.getElementById("loginSchoolName").textContent = settings.schoolName;
    document.getElementById("sidebarSchoolName").textContent = settings.shortSchoolName || settings.schoolName;
    document.getElementById("topbarSchoolName").textContent = settings.schoolName;
  }

  function getStoredUser() {
    return safeJson(authKey, null);
  }

  function writeLocal(items) {
    localStorage.setItem(storeKey, JSON.stringify(items));
  }

  function readLocal() {
    return safeJson(storeKey, []);
  }

  function getNextLocalNumber(type, dateValue, scope) {
    const year = buddhistYear(dateValue);
    const counters = safeJson(counterKey, {});
    const key = `${type}:${year}:${scope || "general"}`;
    counters[key] = (counters[key] || 0) + 1;
    localStorage.setItem(counterKey, JSON.stringify(counters));
    return { year, running: counters[key] };
  }

  function syncLocalCounter(type, year, running, scope) {
    if (!year || !running) return;
    const counters = safeJson(counterKey, {});
    const key = `${type}:${year}:${scope || "general"}`;
    counters[key] = Math.max(counters[key] || 0, running);
    localStorage.setItem(counterKey, JSON.stringify(counters));
  }

  function parseManualNumber(type, value, dateValue) {
    const text = String(value || "").trim();
    if (!text) return null;
    const fallbackYear = buddhistYear(dateValue);
    const slashMatch = text.match(/(\d{1,4})\s*\/\s*(\d{4})/);
    const tailMatch = text.match(/\/\s*(\d{1,4})\s*$/);

    if ((type === "memo" || type === "order") && slashMatch) {
      return { number: text, running: Number(slashMatch[1]), year: Number(slashMatch[2]) };
    }

    if (tailMatch) {
      const yearMatch = text.match(/(\d{4})\s*\//);
      return { number: text, running: Number(tailMatch[1]), year: yearMatch ? Number(yearMatch[1]) : fallbackYear };
    }

    const digits = text.match(/(\d{1,4})/);
    return digits ? { number: text, running: Number(digits[1]), year: fallbackYear } : { number: text, running: 0, year: fallbackYear };
  }

  function formatOrderNumber(year, running) {
    return `คส.${padRunning(running)}/${year}`;
  }

  function formatMemoNumber(groupKey, year, running, fiscalYearCode) {
    const group = workGroups[groupKey] || workGroups.bot;
    const base = `${group.code} ${padRunning(running)}/${year}`;
    return group.fiscal && fiscalYearCode ? `${base} · ${getSettings().fiscalYearCodePrefix}${fiscalYearCode}` : base;
  }

  function formatOutgoingNumber(running) {
    return `ที่ ${getSettings().outgoingPrefix}/${padRunning(running)}`;
  }

  function createKeywords() {
    return Array.from(arguments)
      .join(" ")
      .toLowerCase()
      .split(/[\s,./·:;()]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, arr) => arr.indexOf(item) === index);
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function loadFirebase(force) {
    if (!force && isDemoUser(currentUser)) return null;
    if (!hasFirebaseConfig()) return null;
    if (firebaseServices) return firebaseServices;

    const appFns = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authFns = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firestoreFns = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    const storageFns = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js");
    const app = appFns.getApps().length ? appFns.getApps()[0] : appFns.initializeApp(firebaseConfig);
    firebaseServices = {
      auth: authFns.getAuth(app),
      authFns,
      db: firestoreFns.getFirestore(app),
      storage: storageFns.getStorage(app),
      firestore: firestoreFns,
      storageFns
    };
    if (currentUser && currentUser.loginType === "public" && !firebaseServices.auth.currentUser) {
      const credential = await authFns.signInAnonymously(firebaseServices.auth);
      currentUser.uid = credential.user.uid;
      currentUser.mode = "firebase";
      currentUser.role = "public";
      localStorage.setItem(authKey, JSON.stringify(currentUser));
    }
    return firebaseServices;
  }

  async function login(username, password) {
    if (
      (username === localAdminCredentials.username && password === localAdminCredentials.password) ||
      (username === "admin" && password === "1234")
    ) {
      const user = Object.assign({}, demoUser, { displayName: "ผู้ดูแลระบบ", role: "admin" });
      localStorage.setItem(authKey, JSON.stringify(user));
      return user;
    }

    const services = await loadFirebase(true);
    if (!services) throw new Error("ยังไม่ได้ตั้งค่า Firebase หรือกรุณาใช้ปุ่มใช้งานทั่วไป");

    const settings = getSettings();
    if (!username.includes("@")) {
      if (password !== settings.teacherPasscode) {
        throw new Error("รหัสครูทั่วไปไม่ถูกต้อง");
      }
      const credential = await services.authFns.signInAnonymously(services.auth);
      const user = {
        uid: credential.user.uid,
        displayName: "ครูทั่วไป",
        mode: "firebase",
        loginType: "anonymous",
        role: "officer"
      };
      localStorage.setItem(authKey, JSON.stringify(user));
      return user;
    }

    const credential = await services.authFns.signInWithEmailAndPassword(services.auth, username, password);
    const tokenResult = await credential.user.getIdTokenResult();
    const isAdmin = tokenResult.claims.admin === true;
    const user = {
      uid: credential.user.uid,
      email: credential.user.email,
      displayName: credential.user.displayName || credential.user.email,
      mode: "firebase",
      role: isAdmin ? "admin" : (getSettings().defaultUserRole || "officer")
    };
    localStorage.setItem(authKey, JSON.stringify(user));
    return user;
  }

  async function listDocuments() {
    const services = await loadFirebase().catch(() => null);
    if (!services) return readLocal();

    try {
      const snapshot = await services.firestore.getDocs(
        services.firestore.query(
          services.firestore.collection(services.db, "documents"),
          services.firestore.orderBy("createdAt", "desc")
        )
      );
      return snapshot.docs.map((doc) => doc.data());
    } catch (error) {
      console.error("Failed to list documents from Firebase, falling back to local storage:", error);
      return readLocal();
    }
  }

  async function saveDocument(documentItem) {
    const services = await loadFirebase().catch(() => null);
    if (!services) {
      const items = readLocal();
      items.unshift(documentItem);
      writeLocal(items);
      return documentItem;
    }

    try {
      await services.firestore.setDoc(services.firestore.doc(services.db, "documents", documentItem.id), documentItem);
      return documentItem;
    } catch (error) {
      console.error("Failed to save document to Firebase, saving locally:", error);
      const items = readLocal();
      items.unshift(documentItem);
      writeLocal(items);
      throw error;
    }
  }

  async function nextNumber(type, dateValue, scope) {
    const services = await loadFirebase().catch(() => null);
    if (!services) return getNextLocalNumber(type, dateValue, scope);

    const year = buddhistYear(dateValue);
    const id = `${type}_${year}_${scope || "general"}`;
    const ref = services.firestore.doc(services.db, "counters", id);
    try {
      const running = await services.firestore.runTransaction(services.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const nextValue = (snapshot.exists() ? snapshot.data().running : 0) + 1;
        transaction.set(ref, { type, year, scope: scope || "general", running: nextValue, updatedAt: nowIso() }, { merge: true });
        return nextValue;
      });
      return { year, running };
    } catch (error) {
      console.error("Failed to run Firebase counter transaction, falling back to local counter:", error);
      return getNextLocalNumber(type, dateValue, scope);
    }
  }

  async function syncCounter(type, year, running, scope) {
    if (!year || !running) return;
    const services = await loadFirebase().catch(() => null);
    if (!services) {
      syncLocalCounter(type, year, running, scope);
      return;
    }

    const id = `${type}_${year}_${scope || "general"}`;
    const ref = services.firestore.doc(services.db, "counters", id);
    try {
      await services.firestore.runTransaction(services.db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists() ? snapshot.data().running || 0 : 0;
        transaction.set(ref, { type, year, scope: scope || "general", running: Math.max(current, running), updatedAt: nowIso() }, { merge: true });
      });
    } catch (error) {
      console.error("Failed to sync Firebase counter, syncing locally:", error);
      syncLocalCounter(type, year, running, scope);
    }
  }

  async function uploadAttachment(file, path) {
    if (!file || !file.name) return null;
    const services = await loadFirebase().catch(() => null);
    if (!services) return { name: file.name, size: file.size, type: file.type, demoOnly: true };

    const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-\u0E00-\u0E7F]/g, "_")}`;
    const ref = services.storageFns.ref(services.storage, `${path}/${safeName}`);
    await services.storageFns.uploadBytes(ref, file);
    const url = await services.storageFns.getDownloadURL(ref);
    return { name: file.name, size: file.size, type: file.type, url, storagePath: ref.fullPath };
  }

  function buildOrderDraft(data) {
    return `คำสั่งโรงเรียน\n${data.number}\nเรื่อง ${data.subject}\nหน่วยงานรับผิดชอบ ${data.responsibleUnit || "-"}\n\nด้วยโรงเรียนมีความจำเป็นต้องดำเนินการเกี่ยวกับ ${data.category} ดังรายละเอียดต่อไปนี้\n${data.detail}\n\nผู้ประสานงาน ${data.coordinator || "-"}\n\nทั้งนี้ ตั้งแต่วันที่ ${data.effectiveDate || data.issuedDate} เป็นต้นไป\n\nสั่ง ณ วันที่ ${data.issuedDate}\n\nลงชื่อ ${data.signer}`;
  }

  function buildMemoDraft(data) {
    return `บันทึกข้อความ\nส่วนราชการ ${data.department || data.group.name}\nที่ ${data.number}    วันที่ ${data.memoDate}\nเรื่อง ${data.subject}\n\nเรียน ผู้อำนวยการโรงเรียน\n\n${data.content}\n\nวัตถุประสงค์: ${data.objective}\nเอกสารแนบ/หมายเหตุ: ${data.attachmentNote || "-"}\n\nลงชื่อ ${data.proposer}\nผู้เสนอ`;
  }

  function buildOutgoingDraft(data) {
    return `${data.number}\nวันที่ ${data.letterDate || today()}\nชั้นความเร็ว ${data.urgency || "ปกติ"}    ชั้นความลับ ${data.confidentiality || "ปกติ"}\n\nเรื่อง ${data.subject}\nเรียน ${data.recipientOrg}\nอ้างถึง ${data.reference || "-"}\nสิ่งที่ส่งมาด้วย ${data.enclosure || "-"}\n\n${data.body}\n\nผู้ประสานงาน ${data.contactPerson || "-"} โทร. ${data.contactPhone || "-"}\nกำหนดติดตามผล ${data.followUpDate || "-"}\n\nขอแสดงความนับถือ\n\n${data.signer}`;
  }

  async function createOrder(form) {
    const issuedDate = form.get("issuedDate");
    const manual = parseManualNumber("order", form.get("manualNumber"), issuedDate);
    const next = manual || await nextNumber("order", issuedDate);
    const number = formatOrderNumber(next.year, next.running);
    if (manual) await syncCounter("order", next.year, next.running);
    const subject = form.get("subject").trim();
    const signer = form.get("signer").trim();
    const detail = form.get("detail").trim();
    const category = form.get("category");
    const responsibleUnit = form.get("responsibleUnit").trim() || getSettings().schoolName;
    const effectiveDate = form.get("effectiveDate");
    const coordinator = form.get("coordinator").trim();
    const attachment = await uploadAttachment(form.get("attachment"), "orders");
    return saveDocument({
      id: makeId(),
      module: "orders",
      typeLabel: "คำสั่งโรงเรียน",
      number,
      year: next.year,
      running: next.running,
      subject,
      issuedDate,
      category,
      detail,
      responsibleUnit,
      effectiveDate,
      coordinator,
      signer,
      status: "approved",
      draft: buildOrderDraft({ number, subject, issuedDate, category, detail, signer, responsibleUnit, effectiveDate, coordinator }),
      metadata: { documentType: "school_order", numberingRule: "คส.ลำดับ/ปีพ.ศ.", responsibleUnit },
      keywords: createKeywords(number, subject, signer, category, detail, responsibleUnit, coordinator),
      attachment,
      auditLog: [{ action: "created", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: "approved" }],
      createdBy: currentUser.uid,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  async function createMemo(form) {
    const memoDate = form.get("memoDate");
    const groupKey = form.get("workGroup");
    const group = workGroups[groupKey] || workGroups.bot;
    const fiscalYear = form.get("fiscalYear").trim();
    const manual = parseManualNumber("memo", form.get("manualNumber"), memoDate);
    const next = manual || await nextNumber("memo", memoDate, groupKey);
    const number = formatMemoNumber(groupKey, next.year, next.running, fiscalYear);
    if (manual) await syncCounter("memo", next.year, next.running, groupKey);
    const subject = form.get("subject").trim();
    const proposer = form.get("proposer").trim();
    const contentText = form.get("content").trim();
    const objective = form.get("objective");
    const department = form.get("department").trim();
    const attachmentNote = form.get("attachmentNote").trim();
    return saveDocument({
      id: makeId(),
      module: "memos",
      typeLabel: "บันทึกข้อความ",
      number,
      year: next.year,
      running: next.running,
      subject,
      memoDate,
      workGroup: groupKey,
      workGroupLabel: group.name,
      proposer,
      objective,
      content: contentText,
      department,
      attachmentNote,
      fiscalYearCode: group.fiscal ? fiscalYear : "",
      status: "pending",
      draft: buildMemoDraft({ number, subject, memoDate, group, proposer, objective, content: contentText, department, attachmentNote }),
      metadata: { documentType: "memo", workGroupCode: group.code, calendarYear: next.year },
      keywords: createKeywords(number, subject, group.name, proposer, contentText, department),
      attachment: null,
      auditLog: [{ action: "created", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: "pending" }],
      createdBy: currentUser.uid,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  async function createOutgoing(form) {
    const nextDate = new Date();
    const manual = parseManualNumber("outgoing", form.get("manualNumber"), nextDate);
    const next = manual || await nextNumber("outgoing", nextDate);
    const number = manual ? manual.number : formatOutgoingNumber(next.running);
    if (manual) await syncCounter("outgoing", next.year, next.running);
    const subject = form.get("subject").trim();
    const recipientOrg = form.get("recipientOrg").trim();
    const reference = form.get("reference").trim();
    const enclosure = form.get("enclosure").trim();
    const body = form.get("body").trim();
    const signer = form.get("signer").trim();
    const letterDate = form.get("letterDate") || today();
    const urgency = form.get("urgency");
    const confidentiality = form.get("confidentiality");
    const contactPerson = form.get("contactPerson").trim();
    const contactPhone = form.get("contactPhone").trim();
    const followUpDate = form.get("followUpDate");
    const note = form.get("note").trim();
    const attachment = await uploadAttachment(form.get("attachment"), "outgoing");
    return saveDocument({
      id: makeId(),
      module: "outgoing",
      typeLabel: "หนังสือส่ง",
      number,
      year: next.year,
      running: next.running,
      recipientOrg,
      subject,
      reference,
      enclosure,
      body,
      signer,
      letterDate,
      urgency,
      confidentiality,
      contactPerson,
      contactPhone,
      followUpDate,
      note,
      channel: form.get("channel"),
      checklist: form.getAll("checklist"),
      receipt: null,
      status: "sent",
      draft: buildOutgoingDraft({ number, recipientOrg, subject, reference, enclosure, body, signer, letterDate, urgency, confidentiality, contactPerson, contactPhone, followUpDate }),
      metadata: { documentType: "outgoing_letter", calendarYear: next.year, urgency, confidentiality, followUpDate },
      keywords: createKeywords(number, subject, recipientOrg, reference, body, signer, contactPerson),
      attachment,
      auditLog: [{ action: "created", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: "sent" }],
      createdBy: currentUser.uid,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  async function persistUpdatedDocument(updated) {
    const services = await loadFirebase().catch(() => null);
    if (!services) {
      writeLocal(readLocal().map((item) => (item.id === updated.id ? updated : item)));
      return;
    }
    try {
      await services.firestore.setDoc(services.firestore.doc(services.db, "documents", updated.id), updated, { merge: true });
    } catch (error) {
      console.error("Failed to persist updated document to Firebase, updating locally:", error);
      writeLocal(readLocal().map((item) => (item.id === updated.id ? updated : item)));
      throw error;
    }
  }

  async function deleteDocument(id) {
    if (!canEditDocuments()) {
      setAlert("บทบาทนี้ไม่มีสิทธิ์ลบเอกสาร", "error");
      return;
    }
    const item = documents.find((doc) => doc.id === id);
    if (!item || !window.confirm(`ลบเอกสาร ${item.number || ""} ใช่หรือไม่`)) return;
    
    try {
      const services = await loadFirebase().catch(() => null);
      if (!services) {
        writeLocal(readLocal().filter((doc) => doc.id !== id));
      } else {
        await services.firestore.deleteDoc(services.firestore.doc(services.db, "documents", id));
      }
      setAlert("ลบเอกสารเรียบร้อย");
      await loadAndRender();
    } catch (error) {
      console.error(error);
      setAlert(error.message || "เกิดข้อผิดพลาดในการลบเอกสาร", "error");
    }
  }

  async function editDocument(id) {
    if (!canEditDocuments()) {
      setAlert("บทบาทนี้ไม่มีสิทธิ์แก้ไขเอกสาร", "error");
      return;
    }
    const item = documents.find((doc) => doc.id === id);
    if (!item) return;
    const subject = window.prompt("เรื่อง", item.subject || "");
    if (subject === null) return;
    item.subject = subject.trim() || item.subject;

    if (item.module === "orders") {
      item.issuedDate = window.prompt("วันที่ออก", item.issuedDate || today()) || item.issuedDate;
      item.category = window.prompt("ประเภท", item.category || "") || item.category;
      item.detail = window.prompt("รายละเอียด", item.detail || "") || item.detail;
      item.signer = window.prompt("ผู้ลงนาม", item.signer || "") || item.signer;
      item.draft = buildOrderDraft(item);
    }

    if (item.module === "memos") {
      item.memoDate = window.prompt("วันที่", item.memoDate || today()) || item.memoDate;
      item.proposer = window.prompt("ผู้เสนอ", item.proposer || "") || item.proposer;
      item.content = window.prompt("เนื้อหา", item.content || "") || item.content;
      item.objective = window.prompt("วัตถุประสงค์", item.objective || "") || item.objective;
      const group = workGroups[item.workGroup] || workGroups.bot;
      item.draft = buildMemoDraft(Object.assign({}, item, { group }));
    }

    if (item.module === "outgoing") {
      item.recipientOrg = window.prompt("ถึงหน่วยงาน", item.recipientOrg || "") || item.recipientOrg;
      item.reference = window.prompt("อ้างถึง", item.reference || "") || item.reference;
      item.enclosure = window.prompt("สิ่งที่ส่งมาด้วย", item.enclosure || "") || item.enclosure;
      item.body = window.prompt("สาระหนังสือ", item.body || "") || item.body;
      item.signer = window.prompt("ผู้ลงนาม", item.signer || "") || item.signer;
      item.channel = window.prompt("ช่องทางส่ง", item.channel || "") || item.channel;
      item.draft = buildOutgoingDraft(item);
    }

    item.updatedAt = nowIso();
    item.keywords = createKeywords(item.number, item.subject, item.recipientOrg, item.workGroupLabel, item.signer, item.content, item.body);
    item.auditLog = item.auditLog || [];
    item.auditLog.unshift({ action: "edited", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: item.status, note: "แก้ไขข้อมูลเอกสาร" });
    
    try {
      await persistUpdatedDocument(item);
      setAlert("แก้ไขเอกสารและบันทึก audit log แล้ว");
      await loadAndRender();
    } catch (error) {
      console.error(error);
      setAlert(error.message || "เกิดข้อผิดพลาดในการแก้ไขเอกสาร", "error");
    }
  }

  async function changeStatus(id, status) {
    const item = documents.find((doc) => doc.id === id);
    if (!item) return;
    item.status = status;
    item.updatedAt = nowIso();
    item.auditLog = item.auditLog || [];
    item.auditLog.unshift({ action: "status_changed", by: currentUser.displayName || currentUser.uid, at: nowIso(), status });
    
    try {
      await persistUpdatedDocument(item);
      setAlert("อัปเดตสถานะและบันทึก audit log แล้ว");
      await loadAndRender();
    } catch (error) {
      console.error(error);
      setAlert(error.message || "เกิดข้อผิดพลาดในการเปลี่ยนสถานะ", "error");
    }
  }

  async function confirmReceipt(id) {
    const item = documents.find((doc) => doc.id === id);
    if (!item) return;
    const receiver = window.prompt("ผู้รับ/หน่วยงาน");
    if (!receiver) return;
    const method = window.prompt("วิธีการรับ", "ระบบอิเล็กทรอนิกส์") || "ระบบอิเล็กทรอนิกส์";
    const now = new Date();
    item.status = "delivered";
    item.receipt = {
      receiver,
      receivedDate: now.toISOString().slice(0, 10),
      receivedTime: now.toTimeString().slice(0, 5),
      method,
      note: ""
    };
    item.updatedAt = nowIso();
    item.auditLog = item.auditLog || [];
    item.auditLog.unshift({ action: "receipt_confirmed", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: "delivered", receipt: item.receipt });
    
    try {
      await persistUpdatedDocument(item);
      setAlert("ยืนยันการรับหนังสือและบันทึก audit log แล้ว");
      await loadAndRender();
    } catch (error) {
      console.error(error);
      setAlert(error.message || "เกิดข้อผิดพลาดในการยืนยันการรับ", "error");
    }
  }

  function searchDocuments(filters) {
    const query = String(filters.keyword || "").trim().toLowerCase();
    return documents.filter((doc) => {
      const dateValue = doc.issuedDate || doc.memoDate || doc.createdAt || "";
      const yearValue = doc.year || (dateValue ? buddhistYear(dateValue) : "");
      const haystack = [doc.number, doc.subject, doc.typeLabel, doc.status, doc.recipientOrg, doc.workGroupLabel, ...(doc.keywords || [])].join(" ").toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (filters.module && doc.module !== filters.module) return false;
      if (filters.status && doc.status !== filters.status) return false;
      if (filters.workGroup && doc.workGroup !== filters.workGroup) return false;
      if (filters.year && String(yearValue) !== String(filters.year)) return false;
      if (filters.dateFrom && dateValue.slice(0, 10) < filters.dateFrom) return false;
      if (filters.dateTo && dateValue.slice(0, 10) > filters.dateTo) return false;
      return true;
    });
  }

  function parseCsv(text) {
    const rows = [];
    let cell = "";
    let row = [];
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        if (row.some((item) => item.trim())) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((item) => item.trim())) rows.push(row);
    return rows;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.XLSX) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function readImportRows(file) {
    if (/\.xlsx?$/i.test(file.name)) {
      try {
        await loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
        const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      } catch (error) {
        throw new Error("อ่านไฟล์ Excel ไม่สำเร็จ หากเปิดแบบ offline ให้บันทึก Excel เป็น CSV แล้วนำเข้าอีกครั้ง");
      }
    }
    return parseCsv(await file.text());
  }

  async function importCsvFile(file) {
    if (!file) return;
    const rows = await readImportRows(file);
    if (rows.length < 2) {
      setAlert("ไม่พบข้อมูลสำหรับนำเข้า", "error");
      return;
    }
    const headers = rows[0].map((item) => item.trim());
    let imported = 0;
    for (const row of rows.slice(1)) {
      const data = {};
      headers.forEach((header, index) => {
        data[header] = (row[index] || "").trim();
      });
      let moduleName = data.module || data.type || "orders";
      if (moduleName === "order") moduleName = "orders";
      if (moduleName === "memo") moduleName = "memos";
      if (moduleName === "letter") moduleName = "outgoing";
      const dateValue = data.date || data.issuedDate || data.memoDate || today();
      const number = data.number || "";
      const parsed = parseManualNumber(moduleName === "memos" ? "memo" : moduleName === "outgoing" ? "outgoing" : "order", number, dateValue);
      const year = parsed ? parsed.year : buddhistYear(dateValue);
      const running = parsed ? parsed.running : 0;
      const doc = {
        id: makeId(),
        module: moduleName,
        typeLabel: moduleName === "memos" ? "บันทึกข้อความ" : moduleName === "outgoing" ? "หนังสือส่ง" : "คำสั่งโรงเรียน",
        number,
        year,
        running,
        subject: data.subject || data.topic || "-",
        issuedDate: moduleName === "orders" ? dateValue : "",
        memoDate: moduleName === "memos" ? dateValue : "",
        workGroup: data.workGroup || "",
        workGroupLabel: data.workGroupLabel || "",
        recipientOrg: data.recipientOrg || data.recipient || "",
        signer: data.signer || "",
        status: data.status || (moduleName === "memos" ? "pending" : moduleName === "outgoing" ? "sent" : "approved"),
        draft: data.draft || data.content || data.body || "",
        keywords: createKeywords(number, data.subject, data.recipientOrg, data.workGroupLabel),
        attachment: null,
        auditLog: [{ action: "imported", by: currentUser.displayName || currentUser.uid, at: nowIso(), status: data.status || "imported" }],
        createdBy: currentUser.uid,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      await saveDocument(doc);
      if (parsed) await syncCounter(moduleName === "memos" ? "memo" : moduleName === "outgoing" ? "outgoing" : "order", year, running, data.workGroup || "general");
      imported += 1;
    }
    setAlert(`นำเข้าข้อมูล ${imported} รายการเรียบร้อย`);
    await loadAndRender();
  }

  function setAlert(message, type) {
    const alert = document.getElementById("alert");
    alert.textContent = message;
    alert.className = `alert ${type || "success"}`;
    window.setTimeout(() => alert.classList.add("hidden"), 3200);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
  }

  function emptyState(text) {
    return `<div class="empty-state">${text} ✨</div>`;
  }

  function docCard(doc, options) {
    options = options || {};
    return `<article class="doc-card">
      <div>
        <span class="doc-type">${doc.typeLabel}</span>
        <h4>${escapeHtml(doc.subject || "-")}</h4>
        <p>${escapeHtml(doc.number || "-")}</p>
      </div>
      <div class="doc-meta">
        <span class="status-pill status-${doc.status}">${statusLabels[doc.status] || doc.status}</span>
        <button class="small-btn" data-preview="${doc.id}" type="button">ดูร่าง</button>
        ${canEditDocuments() ? `<button class="small-btn" data-edit="${doc.id}" type="button">แก้ไข</button><button class="small-btn danger-btn" data-delete="${doc.id}" type="button">ลบ</button>` : ""}
        ${options.status && canApproveDocuments() ? `<select class="status-select" data-status="${doc.id}"><option value="">เปลี่ยนสถานะ</option><option value="pending">รออนุมัติ</option><option value="approved">อนุมัติแล้ว</option><option value="returned">ส่งคืนแก้ไข</option><option value="cancelled">ยกเลิก</option></select>` : ""}
        ${options.receipt && doc.status !== "delivered" ? `<button class="small-btn" data-receipt="${doc.id}" type="button">ยืนยันรับ</button>` : ""}
      </div>
    </article>`;
  }

  function renderDashboard() {
    const template = document.getElementById("dashboardTemplate").content.cloneNode(true);
    const counts = {
      orders: documents.filter((doc) => doc.module === "orders").length,
      memos: documents.filter((doc) => doc.module === "memos").length,
      outgoing: documents.filter((doc) => doc.module === "outgoing").length,
      attachments: documents.filter((doc) => doc.attachment).length
    };
    Object.keys(counts).forEach((key) => {
      template.querySelector(`[data-stat="${key}"]`).textContent = counts[key];
    });
    content.replaceChildren(template);
    document.getElementById("statusSummary").innerHTML = ["pending", "approved", "sent", "delivered"].map((status) => `<div class="status-box"><span>${statusLabels[status]}</span><strong>${documents.filter((doc) => doc.status === status).length}</strong></div>`).join("");
    document.getElementById("recentDocuments").innerHTML = documents.length ? documents.slice(0, 6).map((doc) => docCard(doc)).join("") : emptyState("ยังไม่มีเอกสารล่าสุด");
  }

  function renderOrders() {
    const orders = documents.filter((doc) => doc.module === "orders");
    const settings = getSettings();
    content.innerHTML = `<section class="form-grid">
      <form id="orderForm" class="panel form-panel">
        <div class="panel-head"><h3>สร้างคำสั่งโรงเรียน</h3><button class="ghost-btn" data-export="orders" type="button">Export CSV</button></div>
        <label>เรื่อง<input name="subject" required></label>
        <label>เลขคำสั่งย้อนหลัง/กำหนดเอง <span class="field-hint">กรอกเฉพาะเลข เช่น 001/2569 ระบบจะเติม คส. ให้อัตโนมัติ หรือเว้นว่างเพื่อรันเลขต่อ</span><input name="manualNumber" placeholder="001/2569"></label>
        <div class="two-col"><label>วันที่ออก<input name="issuedDate" type="date" required></label><label>วันที่มีผล<input name="effectiveDate" type="date"></label></div>
        <label>ประเภท<select name="category" required><option>แต่งตั้ง</option><option>มอบหมายงาน</option><option>เวรปฏิบัติราชการ</option><option>กิจกรรมโรงเรียน</option><option>จัดซื้อจัดจ้าง</option><option>อื่น ๆ</option></select></label>
        <label>หน่วยงานรับผิดชอบ<input name="responsibleUnit" value="${escapeHtml(settings.schoolName)}" placeholder="${escapeHtml(settings.schoolName)}"></label>
        <label>รายละเอียด<textarea name="detail" rows="5" required></textarea></label>
        <label>ผู้ประสานงาน<input name="coordinator"></label>
        <div class="two-col"><label>ผู้ลงนาม<input name="signer" required></label><label>ไฟล์แนบ<input name="attachment" type="file"></label></div>
        <button class="primary-btn" type="submit">บันทึกคำสั่ง</button>
      </form>
      <section class="panel"><div class="panel-head"><h3>ทะเบียนคำสั่ง</h3></div><div class="doc-list">${orders.length ? orders.map((doc) => docCard(doc)).join("") : emptyState("ยังไม่มีคำสั่งโรงเรียน")}</div></section>
    </section>`;
  }

  function renderMemos() {
    const memos = documents.filter((doc) => doc.module === "memos");
    const visibleMemos = memoGroupFilter === "all" ? memos : memos.filter((doc) => doc.workGroup === memoGroupFilter);
    const options = Object.keys(workGroups).map((key) => `<option value="${key}">${workGroups[key].code} - ${workGroups[key].name}</option>`).join("");
    const filterOptions = `<option value="all">ทุกกลุ่มงาน</option>${Object.keys(workGroups).map((key) => `<option value="${key}" ${memoGroupFilter === key ? "selected" : ""}>${workGroups[key].code} - ${workGroups[key].name}</option>`).join("")}`;
    content.innerHTML = `<section class="form-grid">
      <form id="memoForm" class="panel form-panel">
        <div class="panel-head"><h3>สร้างบันทึกข้อความ</h3><button class="ghost-btn" data-export="memos" type="button">Export CSV</button></div>
        <label>เรื่อง<input name="subject" required></label>
        <label>เลขบันทึกย้อนหลัง/กำหนดเอง <span class="field-hint">เลือกกลุ่มงานแล้วกรอกเฉพาะเลข เช่น 024/2568 ระบบจะเติมตัวย่อให้อัตโนมัติ หรือเว้นว่างเพื่อรันเลขต่อ</span><input name="manualNumber" placeholder="024/2568"></label>
        <div class="two-col"><label>กลุ่มงาน<select id="workGroupSelect" name="workGroup" required>${options}</select></label><label>วันที่<input name="memoDate" type="date" required></label></div>
        <label>ส่วนราชการ/หน่วยงาน<input name="department" placeholder="โรงเรียน/กลุ่มงาน"></label>
        <label>ผู้เสนอ<input name="proposer" required></label>
        <label>วัตถุประสงค์<select name="objective" required><option>เพื่อโปรดทราบ</option><option>เพื่อพิจารณา</option><option>เพื่ออนุมัติ</option><option>เพื่อดำเนินการ</option></select></label>
        <div class="two-col"><label id="fiscalField" class="hidden">รหัสปีงบ<input name="fiscalYear" placeholder="2568"></label><label>เอกสารแนบ/หมายเหตุ<input name="attachmentNote"></label></div>
        <label>เนื้อหา<textarea name="content" rows="6" required></textarea></label>
        <button class="primary-btn" type="submit">บันทึกข้อความ</button>
      </form>
      <section class="panel"><div class="panel-head"><h3>ทะเบียนบันทึกข้อความ</h3><select id="memoGroupFilter" class="compact-select">${filterOptions}</select></div><div class="doc-list">${visibleMemos.length ? visibleMemos.map((doc) => docCard(doc, { status: true })).join("") : emptyState("ยังไม่มีบันทึกข้อความในกลุ่มงานนี้")}</div></section>
    </section>`;
  }

  function renderOutgoing() {
    const outgoing = documents.filter((doc) => doc.module === "outgoing");
    content.innerHTML = `<section class="form-grid">
      <form id="outgoingForm" class="panel form-panel">
        <div class="panel-head"><h3>สร้างหนังสือส่ง</h3><button class="ghost-btn" data-export="outgoing" type="button">Export CSV</button></div>
        <label>ถึงหน่วยงาน<input name="recipientOrg" required></label><label>เรื่อง<input name="subject" required></label>
        <label>เลขหนังสือย้อนหลัง/กำหนดเอง <span class="field-hint">เว้นว่างเพื่อให้ระบบรันเลขถัดไป เช่น ที่ ศธ 04122.014/024</span><input name="manualNumber" placeholder="ที่ ศธ 04122.014/024"></label>
        <div class="two-col"><label>วันที่หนังสือ<input name="letterDate" type="date"></label><label>ชั้นความเร็ว<select name="urgency"><option>ปกติ</option><option>ด่วน</option><option>ด่วนมาก</option><option>ด่วนที่สุด</option></select></label></div>
        <label>ชั้นความลับ<select name="confidentiality"><option>ปกติ</option><option>ลับ</option><option>ลับมาก</option><option>ลับที่สุด</option></select></label>
        <div class="two-col"><label>อ้างถึง<input name="reference"></label><label>สิ่งที่ส่งมาด้วย<input name="enclosure"></label></div>
        <label>สาระหนังสือ<textarea name="body" rows="6" required></textarea></label>
        <div class="two-col"><label>ผู้ลงนาม<input name="signer" required></label><label>ช่องทางส่ง<select name="channel" required><option>ระบบอิเล็กทรอนิกส์</option><option>ไปรษณีย์</option><option>นำส่งด้วยตนเอง</option><option>อีเมล</option></select></label></div>
        <div class="two-col"><label>ผู้ประสานงาน<input name="contactPerson"></label><label>โทรศัพท์ผู้ประสานงาน<input name="contactPhone"></label></div>
        <div class="two-col"><label>กำหนดติดตามผล<input name="followUpDate" type="date"></label><label>หมายเหตุ<input name="note"></label></div>
        <label>ไฟล์แนบ<input name="attachment" type="file"></label>
        <fieldset class="checklist"><legend>Checklist ก่อนส่ง</legend><label><input name="checklist" value="ตรวจเลขที่หนังสือ" type="checkbox" required> ตรวจเลขที่หนังสือ</label><label><input name="checklist" value="ตรวจผู้รับและเรื่อง" type="checkbox" required> ตรวจผู้รับและเรื่อง</label><label><input name="checklist" value="ตรวจไฟล์แนบ" type="checkbox" required> ตรวจไฟล์แนบ</label></fieldset>
        <button class="primary-btn" type="submit">บันทึกหนังสือส่ง</button>
      </form>
      <section class="panel"><div class="panel-head"><h3>ทะเบียนหนังสือส่ง</h3></div><div class="doc-list">${outgoing.length ? outgoing.map((doc) => docCard(doc, { receipt: true })).join("") : emptyState("ยังไม่มีหนังสือส่ง")}</div></section>
    </section>`;
  }

  function renderSearch(filters) {
    filters = filters || {};
    const groupOptions = Object.keys(workGroups).map((key) => `<option value="${key}" ${filters.workGroup === key ? "selected" : ""}>${workGroups[key].code} - ${workGroups[key].name}</option>`).join("");
    const results = searchDocuments(filters);
    content.innerHTML = `<section class="panel">
      <div class="panel-head"><h3>ค้นหาย้อนหลัง</h3></div>
      <form id="searchForm" class="filter-grid">
        <label>คำค้น<input name="keyword" value="${escapeHtml(filters.keyword || "")}" placeholder="เลขที่ เรื่อง สถานะ กลุ่มงาน หรือหน่วยงาน"></label>
        <label>ประเภท<select name="module"><option value="">ทั้งหมด</option><option value="orders" ${filters.module === "orders" ? "selected" : ""}>คำสั่ง</option><option value="memos" ${filters.module === "memos" ? "selected" : ""}>บันทึกข้อความ</option><option value="outgoing" ${filters.module === "outgoing" ? "selected" : ""}>หนังสือส่ง</option></select></label>
        <label>สถานะ<select name="status"><option value="">ทั้งหมด</option>${Object.keys(statusLabels).map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}</select></label>
        <label>ปี พ.ศ.<input name="year" value="${escapeHtml(filters.year || "")}" placeholder="2569"></label>
        <label>ตั้งแต่วันที่<input name="dateFrom" type="date" value="${escapeHtml(filters.dateFrom || "")}"></label>
        <label>ถึงวันที่<input name="dateTo" type="date" value="${escapeHtml(filters.dateTo || "")}"></label>
        <label>กลุ่มงาน<select name="workGroup"><option value="">ทั้งหมด</option>${groupOptions}</select></label>
        <button class="primary-btn filter-submit" type="submit">ค้นหา</button>
      </form>
      <div class="doc-list">${results.length ? results.map((doc) => docCard(doc, { status: doc.module === "memos", receipt: doc.module === "outgoing" })).join("") : emptyState("ไม่พบเอกสาร")}</div>
    </section>`;
  }

  function renderAudit() {
    const items = documents.flatMap((doc) => (doc.auditLog || []).map((log) => ({ doc, log })));
    content.innerHTML = `<section class="panel">
      <div class="panel-head"><h3>ประวัติการใช้งาน</h3></div>
      <div class="audit-list">${items.length ? items.map(({ doc, log }) => `<article class="audit-item">
        <strong>${escapeHtml(doc.number || "-")} · ${escapeHtml(doc.subject || "-")}</strong>
        <span>${escapeHtml(log.action || "-")} โดย ${escapeHtml(log.by || "-")} · ${new Date(log.at || doc.updatedAt || Date.now()).toLocaleString("th-TH")}</span>
        <span class="status-pill status-${log.status || doc.status}">${statusLabels[log.status] || log.status || statusLabels[doc.status] || doc.status}</span>
      </article>`).join("") : emptyState("ยังไม่มีประวัติ")}</div>
    </section>`;
  }

  function renderSettings() {
    const settings = getSettings();
    content.innerHTML = `<section class="form-grid">
      <form id="settingsForm" class="panel form-panel">
        <div class="panel-head"><h3>ตั้งค่าระบบ</h3></div>
        <label>ชื่อโรงเรียน<input name="schoolName" value="${escapeHtml(settings.schoolName)}" required></label>
        <label>ชื่อย่อในเมนู<input name="shortSchoolName" value="${escapeHtml(settings.shortSchoolName || "")}"></label>
        <div class="two-col">
          <label>รหัสโรงเรียน<input name="schoolCode" value="${escapeHtml(settings.schoolCode || "")}"></label>
          <label>Prefix หนังสือส่ง<input name="outgoingPrefix" value="${escapeHtml(settings.outgoingPrefix || "")}" required></label>
        </div>
        <div class="two-col">
          <label>ปีงบประมาณปัจจุบัน<input name="fiscalYear" value="${escapeHtml(settings.fiscalYear || "")}" placeholder="2569"></label>
          <label>คำนำหน้ารหัสปีงบ<input name="fiscalYearCodePrefix" value="${escapeHtml(settings.fiscalYearCodePrefix || "งป")}"></label>
        </div>
        <label>รหัสครูทั่วไปสำหรับ Anonymous Login<input name="teacherPasscode" value="${escapeHtml(settings.teacherPasscode || "2468")}"></label>
        <label>บทบาทเริ่มต้นของผู้ใช้ Firebase<select name="defaultUserRole"><option value="admin" ${settings.defaultUserRole === "admin" ? "selected" : ""}>admin</option><option value="officer" ${settings.defaultUserRole === "officer" ? "selected" : ""}>officer</option><option value="approver" ${settings.defaultUserRole === "approver" ? "selected" : ""}>approver</option></select></label>
        <button class="primary-btn" type="submit">บันทึกตั้งค่า</button>
      </form>
      <form id="importForm" class="panel form-panel">
        <div class="panel-head"><h3>Import ข้อมูลย้อนหลัง</h3></div>
        <p class="muted">รองรับ CSV และ Excel .xlsx โดยใช้หัวคอลัมน์ เช่น module, number, subject, date, workGroup, recipientOrg, signer, status</p>
        <label>ไฟล์ CSV / Excel<input name="importFile" type="file" accept=".csv,.xlsx,.xls"></label>
        <button class="primary-btn" type="submit">นำเข้าข้อมูล</button>
      </form>
    </section>`;
  }

  function exportCsv(moduleName) {
    const headersByModule = {
      orders: ["number", "subject", "issuedDate", "category", "signer", "status", "createdAt"],
      memos: ["number", "subject", "memoDate", "workGroupLabel", "proposer", "status", "createdAt"],
      outgoing: ["number", "subject", "recipientOrg", "channel", "status", "createdAt"]
    };
    const headers = headersByModule[moduleName];
    const rows = documents.filter((doc) => doc.module === moduleName).map((doc) => headers.map((key) => `"${String(doc[key] || "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([`\uFEFF${[headers.join(","), ...rows].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${moduleName}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openPrintPreview(doc) {
    const win = window.open("", "_blank", "width=900,height=720");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(doc.number)}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Itim&display=swap"><style>body{font-family:Itim,'TH Sarabun New',serif;font-size:22px;line-height:1.6;padding:48px;white-space:pre-wrap;color:#172033}</style></head><body>${escapeHtml(doc.draft || "")}</body></html>`);
    win.document.close();
  }

  function bindPage() {
    content.querySelectorAll('input[type="date"]').forEach((input) => {
      if (!input.value) input.value = today();
    });

    const workGroup = document.getElementById("workGroupSelect");
    const fiscalField = document.getElementById("fiscalField");
    if (workGroup && fiscalField) {
      const syncFiscal = () => {
        const group = workGroups[workGroup.value] || {};
        fiscalField.classList.toggle("hidden", !group.fiscal);
        fiscalField.querySelector("input").required = Boolean(group.fiscal);
      };
      workGroup.addEventListener("change", syncFiscal);
      syncFiscal();
    }

    const memoFilter = document.getElementById("memoGroupFilter");
    if (memoFilter) memoFilter.addEventListener("change", () => {
      memoGroupFilter = memoFilter.value;
      renderRoute("memos");
    });

    const orderForm = document.getElementById("orderForm");
    if (orderForm) orderForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = orderForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await createOrder(new FormData(orderForm));
        setAlert("บันทึกคำสั่งโรงเรียนเรียบร้อย");
        await loadAndRender();
      } catch (error) {
        console.error(error);
        setAlert(error.message || "เกิดข้อผิดพลาดในการบันทึกคำสั่ง", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    const memoForm = document.getElementById("memoForm");
    if (memoForm) memoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = memoForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await createMemo(new FormData(memoForm));
        setAlert("บันทึกข้อความเรียบร้อย");
        await loadAndRender();
      } catch (error) {
        console.error(error);
        setAlert(error.message || "เกิดข้อผิดพลาดในการบันทึกข้อความ", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    const outgoingForm = document.getElementById("outgoingForm");
    if (outgoingForm) outgoingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = outgoingForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await createOutgoing(new FormData(outgoingForm));
        setAlert("บันทึกหนังสือส่งเรียบร้อย");
        await loadAndRender();
      } catch (error) {
        console.error(error);
        setAlert(error.message || "เกิดข้อผิดพลาดในการบันทึกหนังสือส่ง", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    const searchForm = document.getElementById("searchForm");
    if (searchForm) searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(searchForm);
      renderRoute("search", Object.fromEntries(formData.entries()));
    });

    const settingsForm = document.getElementById("settingsForm");
    if (settingsForm) settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveSettings(Object.fromEntries(new FormData(settingsForm).entries()));
      setAlert("บันทึกตั้งค่าระบบเรียบร้อย");
      renderRoute("settings");
    });

    const importForm = document.getElementById("importForm");
    if (importForm) importForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await importCsvFile(importForm.elements.importFile.files[0]);
      } catch (error) {
        setAlert(error.message || "นำเข้าไม่สำเร็จ", "error");
      }
    });

    content.querySelectorAll("[data-preview]").forEach((button) => button.addEventListener("click", () => {
      const doc = documents.find((item) => item.id === button.dataset.preview);
      if (doc) openPrintPreview(doc);
    }));
    content.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editDocument(button.dataset.edit)));
    content.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteDocument(button.dataset.delete)));
    content.querySelectorAll("[data-status]").forEach((select) => select.addEventListener("change", () => {
      if (select.value) changeStatus(select.dataset.status, select.value);
    }));
    content.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => confirmReceipt(button.dataset.receipt)));
    content.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportCsv(button.dataset.export)));
  }

  function renderRoute(route, keyword) {
    currentRoute = route;
    document.getElementById("pageTitle").textContent = {
      dashboard: "Dashboard",
      orders: "คำสั่งโรงเรียน",
      memos: "บันทึกข้อความ",
      outgoing: "หนังสือส่ง",
      search: "ค้นหาย้อนหลัง",
      audit: "ประวัติ",
      settings: "ตั้งค่าระบบ"
    }[route] || "Dashboard";
    syncAccessControls();
    document.querySelectorAll(".nav-list button").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
    if (route === "settings" && !canEditDocuments()) {
      setAlert("เฉพาะ Admin เท่านั้นที่เข้าตั้งค่าระบบได้", "error");
      route = "dashboard";
      currentRoute = "dashboard";
      document.getElementById("pageTitle").textContent = "Dashboard";
    }
    if (route === "dashboard") renderDashboard();
    if (route === "orders") renderOrders();
    if (route === "memos") renderMemos();
    if (route === "outgoing") renderOutgoing();
    if (route === "search") renderSearch(keyword || {});
    if (route === "audit") renderAudit();
    if (route === "settings") renderSettings();
    bindPage();
  }

  function showDemoWarningIfNeeded() {
    const existing = document.getElementById("demoWarningBanner");
    if (existing) existing.remove();

    if (isDemoUser(currentUser) && hasFirebaseConfig()) {
      const banner = document.createElement("div");
      banner.id = "demoWarningBanner";
      banner.className = "alert error";
      banner.style.marginBottom = "16px";
      banner.style.borderRadius = "18px";
      banner.innerHTML = `⚠️ <strong>คุณกำลังใช้งานในโหมด Local Admin (Demo Mode)</strong><br>
        ข้อมูลที่แก้ไขหรือลบจะส่งผลเฉพาะในเครื่องนี้เท่านั้น และจะไม่บันทึกลง Firebase ตัวจริง (ทำให้ผู้ใช้ทั่วไปยังเห็นข้อมูลเดิมอยู่)<br>
        หากต้องการจัดการข้อมูลในระบบจริง กรุณาออกจากระบบแล้วเข้าสู่ระบบด้วย <strong>Firebase Email + Password ของ Admin</strong>`;
      
      const workspace = document.querySelector(".workspace");
      const content = document.getElementById("content");
      if (workspace && content) {
        workspace.insertBefore(banner, content);
      }
    }
  }

  async function loadAndRender() {
    applyBranding();
    if (!currentUser) {
      appView.classList.add("hidden");
      loginView.classList.remove("hidden");
      if (document.getElementById("loginForm").classList.contains("hidden")) {
        document.getElementById("loginChoice").classList.remove("hidden");
      }
      return;
    }
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    currentUser.role = currentUser.role || getSettings().defaultUserRole || "officer";
    document.getElementById("modeBadge").textContent = `${currentUser.loginType === "public" ? "Public" : isDemoUser(currentUser) ? "Demo Mode" : "Firebase Mode"} · ${currentUser.role}`;
    syncAccessControls();
    showDemoWarningIfNeeded();
    documents = await listDocuments();
    renderRoute(currentRoute);
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.getElementById("loginMessage");
    try {
      currentUser = await login(form.elements.username.value.trim(), form.elements.password.value);
      message.textContent = "";
      await loadAndRender();
    } catch (error) {
      message.textContent = error.message;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    localStorage.removeItem(authKey);
    currentUser = null;
    currentRoute = "dashboard";
    document.getElementById("loginChoice").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
    await loadAndRender();
  });

  document.getElementById("adminLoginBtn").addEventListener("click", () => {
    appView.classList.add("hidden");
    loginView.classList.remove("hidden");
    document.getElementById("loginChoice").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    document.getElementById("loginMessage").textContent = "";
  });

  document.getElementById("showAdminLoginBtn").addEventListener("click", () => {
    document.getElementById("loginChoice").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("username").focus();
  });

  document.getElementById("publicAccessBtn").addEventListener("click", async () => {
    currentUser = createPublicUser();
    localStorage.setItem(authKey, JSON.stringify(currentUser));
    await loadAndRender();
  });

  document.getElementById("refreshBtn").addEventListener("click", loadAndRender);
  document.querySelectorAll(".nav-list button").forEach((button) => button.addEventListener("click", () => renderRoute(button.dataset.route)));
  window.addEventListener("error", (event) => setAlert(event.message || "เกิดข้อผิดพลาด", "error"));
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    setAlert(event.reason?.message || event.reason || "เกิดข้อผิดพลาดในการประมวลผล", "error");
  });

  loadAndRender();
})();
