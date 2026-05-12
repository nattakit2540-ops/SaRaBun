import { firebaseConfig, hasFirebaseConfig } from "./firebase-config.js";

const DEMO_USER = { uid: "demo-admin", displayName: "ผู้ดูแลระบบ", mode: "demo" };
const AUTH_KEY = "esaraban.auth";

let firebaseAuth = null;
let firebaseFns = null;

async function loadFirebaseAuth() {
  if (!hasFirebaseConfig()) return null;
  if (firebaseAuth && firebaseFns) return { auth: firebaseAuth, fns: firebaseFns };

  const [{ initializeApp, getApps }, authFns] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
  ]);

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  firebaseAuth = authFns.getAuth(app);
  firebaseFns = authFns;
  return { auth: firebaseAuth, fns: firebaseFns };
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY));
  } catch {
    return null;
  }
}

export async function login(username, password) {
  if (username === "admin" && password === "1234") {
    localStorage.setItem(AUTH_KEY, JSON.stringify(DEMO_USER));
    return DEMO_USER;
  }

  const firebase = await loadFirebaseAuth();
  if (!firebase) throw new Error("ยังไม่ได้ตั้งค่า Firebase หรือใช้ Demo Mode ด้วย admin / 1234");

  const credential = await firebase.fns.signInWithEmailAndPassword(firebase.auth, username, password);
  const user = {
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: credential.user.displayName || credential.user.email,
    mode: "firebase"
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export async function logout() {
  const firebase = await loadFirebaseAuth().catch(() => null);
  if (firebase) await firebase.fns.signOut(firebase.auth).catch(() => undefined);
  localStorage.removeItem(AUTH_KEY);
}

export function isDemoUser(user) {
  return !user || user.mode === "demo";
}
