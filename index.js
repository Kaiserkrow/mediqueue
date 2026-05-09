// ══════════════════════════════════════════════════════════════════
//  🔧 FIREBASE CONFIGURATION
// ══════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBBF_XBWvosN6BUqVO4xOgTgcO4Gsg7414",
  authDomain: "mediqueue-f28b3.firebaseapp.com",
  projectId: "mediqueue-f28b3",
  storageBucket: "mediqueue-f28b3.firebasestorage.app",
  messagingSenderId: "568865683920",
  appId: "1:568865683920:web:a31847ee5690b566d9e1d5",
  databaseURL:
    "https://mediqueue-f28b3-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// ══════════════════════════════════════════════════════════════════
//  DEMO MODE
// ══════════════════════════════════════════════════════════════════
window._demoMode = false;
window._demoQueue = {};
window._demoCounter = 0;
window._demoListeners = {};

window.enableDemoMode = function () {
  window._demoMode = true;
  document.getElementById("firebase-warning").style.display = "none";
  showToast("Demo mode enabled — data is in-memory only", "info");
};

// ══════════════════════════════════════════════════════════════════
//  FIREBASE INIT
// ══════════════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  update,
  off,
  serverTimestamp,
  query,
  orderByChild,
  equalTo,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let db = null;
let firestoreDb = null;
let firebaseOk = false;

try {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getDatabase(app);
  firestoreDb = getFirestore(app);
  firebaseOk = true;
} catch (e) {
  console.warn("Firebase init failed:", e.message);
}

window._fb = {
  db,
  firestoreDb,
  ref,
  push,
  set,
  onValue,
  update,
  off,
  serverTimestamp,
  query,
  orderByChild,
  equalTo,
  doc,
  getDoc,
  setDoc,
  firebaseOk,
};

// ══════════════════════════════════════════════════════════════════
//  HIDE LOADER
// ══════════════════════════════════════════════════════════════════
document.getElementById("loading-overlay").style.display = "none";

if (!firebaseOk) {
  document.getElementById("firebase-warning").style.display = "block";
}

// ══════════════════════════════════════════════════════════════════
//  APP STATE
// ══════════════════════════════════════════════════════════════════
window._state = {
  role: null,
  studentId: null,
  studentData: null,
  unsubscribers: [],
};

// ══════════════════════════════════════════════════════════════════
//  PAGE NAVIGATION
// ══════════════════════════════════════════════════════════════════
window.showPage = function (id) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
};

// ══════════════════════════════════════════════════════════════════
//  DB HELPERS
// ══════════════════════════════════════════════════════════════════
function dbSet(path, val) {
  if (window._demoMode) {
    window._demoQueue[path] = val;
    _triggerDemoListeners();
    return Promise.resolve();
  }
  const { db, ref, set } = window._fb;
  return set(ref(db, path), val);
}

function dbPush(path, val) {
  if (window._demoMode) {
    const key = "demo_" + ++window._demoCounter;
    window._demoQueue[key] = { ...val, _key: key };
    _triggerDemoListeners();
    return Promise.resolve({ key });
  }
  const { db, ref, push } = window._fb;
  return push(ref(db, path), val);
}

function dbUpdate(path, val) {
  if (window._demoMode) {
    if (!window._demoQueue[path]) window._demoQueue[path] = {};
    Object.assign(window._demoQueue[path], val);
    _triggerDemoListeners();
    return Promise.resolve();
  }
  const { db, ref, update } = window._fb;
  return update(ref(db, path), val);
}

function dbListen(path, cb) {
  if (window._demoMode) {
    window._demoListeners[path] = cb;
    cb({ val: () => Object.values(window._demoQueue).filter((x) => x) });
    return () => delete window._demoListeners[path];
  }
  const { db, ref, onValue, off } = window._fb;
  const r = ref(db, path);
  onValue(r, cb);
  return () => off(r, "value", cb);
}

function _triggerDemoListeners() {
  for (const [path, cb] of Object.entries(window._demoListeners)) {
    if (path === "queue") {
      cb({
        val: () => {
          const obj = {};
          for (const [k, v] of Object.entries(window._demoQueue)) {
            if (v && typeof v === "object") obj[k] = v;
          }
          return Object.keys(obj).length ? obj : null;
        },
      });
    }
  }
}

function dbListenQueue(cb) {
  if (window._demoMode) {
    window._demoListeners["queue"] = cb;
    _triggerDemoListeners();
    return () => delete window._demoListeners["queue"];
  }
  const { db, ref, onValue } = window._fb;
  const r = ref(db, "queue");
  onValue(r, cb);
  return () => window._fb.off(r);
}

// ══════════════════════════════════════════════════════════════════
//  QUEUE NUMBER COUNTER
// ══════════════════════════════════════════════════════════════════
let _queueCounter = 1;
async function getNextQueueNum() {
  if (window._demoMode) return _queueCounter++;
  return new Promise((resolve) => {
    const { db, ref, onValue } = window._fb;
    const r = ref(db, "meta/counter");
    onValue(
      r,
      (snap) => {
        window._fb.off(r);
        const cur = (snap.val() || 0) + 1;
        window._fb.set(ref(db, "meta/counter"), cur);
        resolve(cur);
      },
      { onlyOnce: true },
    );
  });
}

// ══════════════════════════════════════════════════════════════════
//  SESSION PERSISTENCE
//  Uses localStorage so it survives tab close + reopen.
//  sessionStorage would be wiped when the tab is closed entirely.
// ══════════════════════════════════════════════════════════════════
function saveSession() {
  if (window._state.studentId) {
    localStorage.setItem(
      "mq_session",
      JSON.stringify({
        studentId: window._state.studentId,
        studentData: window._state.studentData,
      }),
    );
  }
}

function clearSession() {
  localStorage.removeItem("mq_session");
}

function restoreSession() {
  try {
    const raw = localStorage.getItem("mq_session");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.studentId || !parsed.studentData) return false;

    window._state.studentId = parsed.studentId;
    window._state.studentData = parsed.studentData;
    window._state.role = "student";

    const nameEl = document.getElementById("student-nav-name");
    if (nameEl) nameEl.textContent = parsed.studentData.name;

    showPage("page-student");
    subscribeStudentQueue();
    registerExitListeners();
    return true;
  } catch (e) {
    console.warn("Session restore failed:", e);
    clearSession();
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════
//  EXIT LISTENERS — only save session, never auto-cancel
// ══════════════════════════════════════════════════════════════════
function registerExitListeners() {
  unregisterExitListeners();
  window._exitHandler = function () {
    saveSession();
  };
  window.addEventListener("beforeunload", window._exitHandler);
}

function unregisterExitListeners() {
  if (window._exitHandler) {
    window.removeEventListener("beforeunload", window._exitHandler);
    window._exitHandler = null;
  }
}

// ══════════════════════════════════════════════════════════════════
//  STUDENT CHECK-IN
// ══════════════════════════════════════════════════════════════════
window.studentCheckIn = async function () {
  const name = document.getElementById("s-name").value.trim();
  const sid = document.getElementById("s-sid").value.trim();
  const visit = document.getElementById("s-visit").value;
  const symptoms = document.getElementById("s-symptoms").value.trim();

  if (!name || !sid) {
    showToast("Please fill in your name and student ID", "error");
    return;
  }

  const btn = document.querySelector("#page-student-login .btn-teal");
  btn.disabled = true;
  btn.textContent = "Joining queue…";

  try {
    const qNum = await getNextQueueNum();
    const record = {
      name,
      studentId: sid,
      visitType: visit,
      symptoms,
      priority: "regular",
      status: "waiting",
      queueNumber: qNum,
      timestamp: Date.now(),
    };
    const res = await dbPush("queue", record);
    record._fbKey = res.key;
    window._state.studentId = res.key;
    window._state.studentData = record;
    window._state.role = "student";

    saveSession(); // persist immediately after joining

    document.getElementById("student-nav-name").textContent = name;
    showPage("page-student");
    subscribeStudentQueue();
    registerExitListeners();
    showToast(`You joined the queue as #${qNum}!`, "success");
  } catch (e) {
    console.error(e);
    showToast("Failed to join queue. Check your connection.", "error");
    btn.disabled = false;
    btn.textContent = "Join Queue";
  }
};

// ══════════════════════════════════════════════════════════════════
//  STUDENT QUEUE SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════
function subscribeStudentQueue() {
  const unsub = dbListenQueue((snap) => {
    const data = snap.val();
    if (!data) {
      renderPublicQueue([]);
      return;
    }

    const all = Object.entries(data).map(([k, v]) => ({ ...v, _fbKey: k }));

    // Keep studentData status in sync
    const me = all.find((x) => x._fbKey === window._state.studentId);
    if (me && window._state.studentData) {
      window._state.studentData.status = me.status;
      saveSession(); // keep localStorage current
    }

    renderPublicQueue(all);
    updateStudentTicket(all);
  });
  window._state.unsubscribers.push(unsub);
}

function renderPublicQueue(all) {
  const waiting = sortQueue(all.filter((x) => x.status === "waiting"));
  const list = document.getElementById("public-queue-list");
  if (!waiting.length) {
    list.innerHTML =
      '<div class="empty-state"><i class="bi bi-clock"></i><div>Queue is empty</div></div>';
    return;
  }
  list.innerHTML = waiting
    .map((p, i) => {
      const isMe = p._fbKey === window._state.studentId;
      const emerg = p.priority === "emergency";
      const displayPos = i + 1;
      return `<div class="queue-item${emerg ? " emergency-row" : ""}" style="${isMe ? "background:var(--teal-xlight);" : ""}">
      <div class="queue-num-badge" style="${isMe ? "background:var(--teal);color:white;" : ""}">${displayPos}</div>
      <div class="queue-info">
        <div class="queue-name">${isMe ? "<strong>You</strong>" : "Patient #" + (i + 1)}</div>
        <div class="queue-meta">
          ${emerg ? '<span class="badge-emergency">⚡ Emergency</span>' : ""}
          <span>${p.visitType || "consultation"}</span>
          <span>·</span>
          <span>${timeAgo(p.timestamp)}</span>
        </div>
      </div>
      <div style="font-size:.8rem;color:var(--slate-light);">Position ${i + 1}</div>
    </div>`;
    })
    .join("");
}

function updateStudentTicket(all) {
  const me = all.find((x) => x._fbKey === window._state.studentId);
  if (!me) return;

  const waiting = sortQueue(all.filter((x) => x.status === "waiting"));
  const myPos = waiting.findIndex((x) => x._fbKey === window._state.studentId);
  const pos = myPos + 1;

  document.getElementById("student-q-num").textContent = myPos >= 0 ? pos : "—";

  const pill = document.getElementById("student-status-pill");
  const alert = document.getElementById("called-alert");

  if (me.status === "called") {
    pill.className = "status-pill status-called";
    pill.innerHTML = '<i class="bi bi-megaphone-fill"></i> Called!';
    alert.style.display = "flex";
    if (!window._lastStatus || window._lastStatus !== "called") {
      showToast(
        `🎉 You've been called! Please go to the clinic now.`,
        "success",
      );
      tryBrowserNotify(
        "MediQueue",
        "You've been called! Please proceed to the clinic.",
      );
    }
  } else if (me.status === "completed") {
    pill.className = "status-pill status-completed";
    pill.innerHTML = '<i class="bi bi-check-circle-fill"></i> Completed';
    alert.style.display = "none";
  } else if (me.status === "cancelled") {
    pill.className = "status-pill status-cancelled";
    pill.innerHTML = '<i class="bi bi-x-circle-fill"></i> Cancelled';
    alert.style.display = "none";
  } else {
    pill.className = "status-pill status-waiting";
    pill.innerHTML = '<span class="pulse-dot"></span> Waiting';
    alert.style.display = "none";
  }
  window._lastStatus = me.status;

  const total = waiting.length;
  document.getElementById("student-position").textContent = pos > 0 ? pos : "—";
  document.getElementById("student-ahead").textContent =
    pos > 1 ? pos - 1 : "0";
  document.getElementById("student-total").textContent = total;
  const pct = pos > 0 && total > 0 ? ((total - pos + 1) / total) * 100 : 0;
  document.getElementById("student-prog").style.width = pct + "%";
}

// ══════════════════════════════════════════════════════════════════
//  STUDENT LOGOUT
// ══════════════════════════════════════════════════════════════════
window.studentLogout = function (removeFromQueue = false) {
  unregisterExitListeners();
  clearSession(); // wipe saved session so next load goes to login

  if (removeFromQueue && window._state.studentId) {
    const status = window._state.studentData?.status;
    if (status === "waiting" || status === "called") {
      dbUpdate("queue/" + window._state.studentId, {
        status: "cancelled",
        cancelledAt: Date.now(),
      });
    }
  }

  window._state.unsubscribers.forEach((fn) => fn());
  window._state = {
    role: null,
    studentId: null,
    studentData: null,
    unsubscribers: [],
  };
  window._lastStatus = null;
  ["s-name", "s-sid", "s-symptoms"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  showPage("page-student-login");
};

// ══════════════════════════════════════════════════════════════════
//  PASSWORD HASHING  (SHA-256 + salt via Web Crypto)
// ══════════════════════════════════════════════════════════════════
function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ══════════════════════════════════════════════════════════════════
//  ADMIN LOGIN  — Firestore-backed, salted SHA-256
// ══════════════════════════════════════════════════════════════════
window.adminLogin = async function () {
  const username = document.getElementById("a-user").value.trim().toLowerCase();
  const password = document.getElementById("a-pass").value;

  if (!username || !password) {
    showToast("Please enter username and password", "error");
    return;
  }

  const btn = document.querySelector("#page-admin-login .btn-teal");
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> Signing in…';

  try {
    const { firestoreDb, doc, getDoc } = window._fb;
    if (!firestoreDb) throw new Error("Firestore not available");

    const adminRef = doc(firestoreDb, "admins", username);
    const adminSnap = await getDoc(adminRef);

    if (!adminSnap.exists()) {
      showToast("Invalid username or password", "error");
      return;
    }

    const { salt, hash } = adminSnap.data();
    const inputHash = await hashPassword(password, salt);

    if (inputHash !== hash) {
      showToast("Invalid username or password", "error");
      return;
    }

    window._state.role = "admin";
    window._state.adminUser = username;
    showPage("page-admin");
    subscribeAdminQueue();
    requestNotifyPermission();
    showToast(`Welcome back, ${username}!`, "success");
  } catch (e) {
    console.error("Login error:", e);
    showToast("Login failed — check connection", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-shield-check-fill me-1"></i> Sign In';
  }
};

window.adminLogout = function () {
  window._state.unsubscribers.forEach((fn) => fn());
  window._state = {
    role: null,
    studentId: null,
    studentData: null,
    unsubscribers: [],
  };
  document.getElementById("a-pass").value = "";
  showPage("page-admin-login");
};

// ══════════════════════════════════════════════════════════════════
//  SEED ADMIN  — run once in browser console:
//  await seedAdmin("admin", "your_password_here")
// ══════════════════════════════════════════════════════════════════
window.seedAdmin = async function (username, password) {
  const { firestoreDb, doc, setDoc } = window._fb;
  if (!firestoreDb) {
    console.error("Firestore not available");
    return;
  }
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  const adminRef = doc(firestoreDb, "admins", username.toLowerCase());
  await setDoc(adminRef, { salt, hash, createdAt: Date.now() });
  console.log(`✅ Admin "${username}" saved to Firestore. You can now log in.`);
};

// ══════════════════════════════════════════════════════════════════
//  ADMIN QUEUE SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════
function subscribeAdminQueue() {
  const unsub = dbListenQueue((snap) => {
    const data = snap.val();
    const all = data
      ? Object.entries(data).map(([k, v]) => ({ ...v, _fbKey: k }))
      : [];
    renderAdminQueues(all);
    updateAdminStats(all);
  });
  window._state.unsubscribers.push(unsub);
}

function renderAdminQueues(all) {
  const waiting = sortQueue(all.filter((x) => x.status === "waiting"));
  const called = all.filter((x) => x.status === "called");
  const history = all
    .filter((x) => x.status === "completed" || x.status === "cancelled")
    .sort((a, b) => b.timestamp - a.timestamp);

  renderAdminList(waiting, "admin-waiting-list", ["call", "cancel"]);
  renderAdminList(called, "admin-called-list", ["done", "cancel"]);
  renderAdminList(history, "admin-history-list", []);
}

function renderAdminList(patients, elId, actions) {
  const el = document.getElementById(elId);
  if (!patients.length) {
    el.innerHTML =
      '<div class="empty-state"><i class="bi bi-inbox"></i><div>Empty</div></div>';
    return;
  }
  el.innerHTML = patients
    .map((p, i) => {
      const emerg = p.priority === "emergency";
      const displayNum = i + 1;
      const btns = actions
        .map((a) => {
          if (a === "call")
            return `<button class="btn-action btn-call" onclick="callPatient('${p._fbKey}')"><i class="bi bi-megaphone-fill"></i> Call</button>`;
          if (a === "done")
            return `<button class="btn-action btn-done" onclick="completePatient('${p._fbKey}')"><i class="bi bi-check2"></i> Done</button>`;
          if (a === "cancel")
            return `<button class="btn-action btn-cancel" onclick="cancelPatient('${p._fbKey}')"><i class="bi bi-x"></i></button>`;
          return "";
        })
        .join("");
      const statusBadge = {
        waiting: "badge-waiting",
        called: "badge-called",
        completed: "badge-completed",
        cancelled: "badge-cancelled",
      };
      return `<div class="queue-item${emerg ? " emergency-row" : ""}">
      <div class="queue-num-badge">${displayNum}</div>
      <div class="queue-info" style="cursor:pointer" onclick="showPatientDetail('${p._fbKey}')">
        <div class="queue-name">${p.name} ${emerg ? '<span class="badge-emergency">⚡ Emergency</span>' : ""}</div>
        <div class="queue-meta">
          <span class="${statusBadge[p.status] || "badge-waiting"}">${p.status}</span>
          <span>${p.visitType || ""}</span>
          <span>·</span>
          <span>${p.studentId || ""}</span>
          <span>·</span>
          <span>${timeAgo(p.timestamp)}</span>
        </div>
      </div>
      <div class="queue-actions">${btns}</div>
    </div>`;
    })
    .join("");
}

// ══════════════════════════════════════════════════════════════════
//  ADMIN ACTIONS
// ══════════════════════════════════════════════════════════════════
window.callNextPatient = async function () {
  return new Promise((resolve) => {
    const unsub = dbListenQueue((snap) => {
      unsub();
      const data = snap.val();
      if (!data) {
        showToast("Queue is empty", "error");
        resolve();
        return;
      }
      const all = Object.entries(data).map(([k, v]) => ({ ...v, _fbKey: k }));
      const next = sortQueue(all.filter((x) => x.status === "waiting"))[0];
      if (!next) {
        showToast("No patients waiting", "error");
        resolve();
        return;
      }
      dbUpdate("queue/" + next._fbKey, {
        status: "called",
        calledAt: Date.now(),
      }).then(() => {
        showToast(`Called #${next.queueNumber} — ${next.name}`, "success");
        resolve();
      });
    });
  });
};

window.callPatient = async function (key) {
  await dbUpdate("queue/" + key, { status: "called", calledAt: Date.now() });
  showToast("Patient called!", "success");
};

window.completePatient = async function (key) {
  await dbUpdate("queue/" + key, {
    status: "completed",
    completedAt: Date.now(),
  });
  showToast("Marked as completed", "success");
};

window.cancelPatient = async function (key) {
  await dbUpdate("queue/" + key, {
    status: "cancelled",
    cancelledAt: Date.now(),
  });
  showToast("Patient cancelled", "info");
};

// ══════════════════════════════════════════════════════════════════
//  ADMIN STATS
// ══════════════════════════════════════════════════════════════════
function updateAdminStats(all) {
  document.getElementById("a-stat-waiting").textContent = all.filter(
    (x) => x.status === "waiting",
  ).length;
  document.getElementById("a-stat-called").textContent = all.filter(
    (x) => x.status === "called",
  ).length;
  document.getElementById("a-stat-done").textContent = all.filter(
    (x) => x.status === "completed",
  ).length;
  document.getElementById("a-stat-emergency").textContent = all.filter(
    (x) => x.priority === "emergency",
  ).length;
}

// ══════════════════════════════════════════════════════════════════
//  QUICK ENTRY
// ══════════════════════════════════════════════════════════════════
window.openQuickEntry = function () {
  document.getElementById("modal-quick-entry").classList.add("open");
};

window.quickEntrySubmit = async function () {
  const name = document.getElementById("qe-name").value.trim();
  const sid = document.getElementById("qe-sid").value.trim();
  const visit = document.getElementById("qe-visit").value;
  const symptoms = document.getElementById("qe-symptoms").value.trim();
  if (!name) {
    showToast("Patient name required", "error");
    return;
  }
  const qNum = await getNextQueueNum();
  await dbPush("queue", {
    name,
    studentId: sid || "Walk-in",
    visitType: visit,
    symptoms,
    priority: "emergency",
    status: "waiting",
    queueNumber: qNum,
    timestamp: Date.now(),
  });
  closeModal("modal-quick-entry");
  ["qe-name", "qe-sid", "qe-symptoms"].forEach(
    (id) => (document.getElementById(id).value = ""),
  );
  showToast(`⚡ Emergency #${qNum} added — ${name}`, "emergency");
};

// ══════════════════════════════════════════════════════════════════
//  PATIENT DETAIL MODAL
// ══════════════════════════════════════════════════════════════════
window.showPatientDetail = function (key) {
  return new Promise((resolve) => {
    const unsub = dbListenQueue((snap) => {
      unsub();
      const data = snap.val();
      if (!data || !data[key]) return;
      const p = data[key];
      document.getElementById("modal-detail-body").innerHTML = `
        <div class="section-title">Patient Info</div>
        <table class="w-100" style="font-size:.9rem;border-collapse:separate;border-spacing:0 .4rem;">
          <tr><td style="color:var(--slate-light);width:110px;">Queue #</td><td><strong>${p.queueNumber}</strong></td></tr>
          <tr><td style="color:var(--slate-light);">Name</td><td>${p.name}</td></tr>
          <tr><td style="color:var(--slate-light);">Student ID</td><td>${p.studentId || "—"}</td></tr>
          <tr><td style="color:var(--slate-light);">Visit Type</td><td>${p.visitType || "—"}</td></tr>
          <tr><td style="color:var(--slate-light);">Priority</td><td>${p.priority === "emergency" ? '<span class="badge-emergency">⚡ Emergency</span>' : '<span class="badge-regular">Regular</span>'}</td></tr>
          <tr><td style="color:var(--slate-light);">Status</td><td>${p.status}</td></tr>
          <tr><td style="color:var(--slate-light);">Time</td><td>${new Date(p.timestamp).toLocaleTimeString()}</td></tr>
        </table>
        <div class="section-title">Symptoms / Notes</div>
        <div class="symptoms-text">${p.symptoms || '<em style="color:var(--slate-light);">None provided</em>'}</div>
      `;
      document.getElementById("modal-detail").classList.add("open");
      resolve();
    });
  });
};

// ══════════════════════════════════════════════════════════════════
//  MODAL + TAB HELPERS
// ══════════════════════════════════════════════════════════════════
window.closeModal = function (id) {
  document.getElementById(id).classList.remove("open");
};
document.querySelectorAll(".modal-overlay").forEach((m) => {
  m.addEventListener("click", (e) => {
    if (e.target === m) m.classList.remove("open");
  });
});

window.switchTab = function (btn, tabId) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => (t.style.display = "none"));
  btn.classList.add("active");
  document.getElementById(tabId).style.display = "block";
};

// ══════════════════════════════════════════════════════════════════
//  QUEUE SORT — Emergency first, then FCFS
// ══════════════════════════════════════════════════════════════════
function sortQueue(arr) {
  return arr.sort((a, b) => {
    if (a.priority === "emergency" && b.priority !== "emergency") return -1;
    if (b.priority === "emergency" && a.priority !== "emergency") return 1;
    return a.timestamp - b.timestamp;
  });
}

// ══════════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════
window.showToast = function (msg, type = "info") {
  const icons = {
    success: "check-circle-fill",
    error: "x-circle-fill",
    info: "info-circle-fill",
    emergency: "exclamation-triangle-fill",
  };
  const colors = {
    success: "var(--green)",
    error: "var(--red)",
    info: "var(--teal)",
    emergency: "var(--red)",
  };
  const el = document.createElement("div");
  el.className = `toast-item${type === "emergency" ? " toast-emergency" : type === "success" ? " toast-success" : ""}`;
  el.innerHTML = `<i class="bi bi-${icons[type] || "info-circle-fill"}" style="color:${colors[type] || "var(--teal)"};font-size:1.1rem;flex-shrink:0;"></i>
    <span>${msg}</span>
    <button class="toast-close" onclick="this.parentElement.remove()"><i class="bi bi-x"></i></button>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 5000);
};

// ══════════════════════════════════════════════════════════════════
//  BROWSER NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════
function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function tryBrowserNotify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "" });
  }
}

// ══════════════════════════════════════════════════════════════════
//  TIME HELPER
// ══════════════════════════════════════════════════════════════════
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  return Math.floor(diff / 3600) + "h ago";
}

// ══════════════════════════════════════════════════════════════════
//  RESTORE SESSION
//  Must be the very last thing — all functions above must exist first.
// ══════════════════════════════════════════════════════════════════
restoreSession();
