import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref, push, set as dbSet, update as dbUpdate, remove as dbRemove, onValue as dbOnValue, query, orderByChild, equalTo, get } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, getIdTokenResult } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHt06CtReHyQRip-QqEGILFjOWH5cI98",
  authDomain: "blood-7b054.firebaseapp.com",
  databaseURL: "https://blood-7b054-default-rtdb.firebaseio.com",
  projectId: "blood-7b054",
  storageBucket: "blood-7b054.firebasestorage.app",
  messagingSenderId: "926378767902",
  appId: "1:926378767902:web:21591c4e5d77c90c9ca00f",
  measurementId: "G-HTGC1SJYH6"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const authReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(auth, user => { unsubscribe(); resolve(user); }, reject);
});

async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const claims = await accessClaims();
  if (!claims || (!claims.admin && !claims.personId)) {
    await signOut(auth);
    throw new Error("This account has not been assigned My Payments access. Ask the administrator to finish setup.");
  }
  return { user: credential.user, claims };
}
async function accessClaims() {
  if (!auth.currentUser) return null;
  const snap = await get(ref(db, "security/access/" + auth.currentUser.uid));
  return snap.exists() ? snap.val() : null;
}
async function requireAuth() {
  await authReady;
  if (!auth.currentUser) throw new Error("Please sign in first.");
}
const set = async (...args) => { await requireAuth(); return dbSet(...args); };
const update = async (...args) => { await requireAuth(); return dbUpdate(...args); };
const remove = async (...args) => { await requireAuth(); return dbRemove(...args); };
const onValue = (databaseRef, callback, errorCallback) => {
  authReady.then(() => {
    if (!auth.currentUser) throw new Error("Sign-in required.");
    dbOnValue(databaseRef, callback, errorCallback);
  }).catch(error => {
    console.error("Firebase database listener could not start:", error);
    if (errorCallback) errorCallback(error);
  });
};
async function getPersonTransactions(personId) {
  await requireAuth();
  const claims = await accessClaims();
  if (!claims?.admin && claims?.personId !== personId) throw new Error("You cannot view this ledger.");
  const target = claims.admin
    ? ref(db, "mypayments/transactions")
    : query(ref(db, "mypayments/transactions"), orderByChild("personId"), equalTo(claims.personId));
  const snapshot = await get(target);
  return { transactions: snapshot.val() || {} };
}
export { db, auth, authReady, ref, push, set, update, remove, onValue, loginWithEmail, getPersonTransactions, accessClaims, signOut };
