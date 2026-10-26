import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref, push, set as dbSet, update as dbUpdate, remove as dbRemove, onValue as dbOnValue } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, getIdTokenResult } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHt06CtReHyQRip-QqEGILFjOWH5cI98c",
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
const functions = getFunctions(app, "us-central1");
const authReady = new Promise((resolve, reject) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  }, reject);
});

async function loginWithPin(pin) {
  const loginCall = httpsCallable(functions, "loginWithPin");
  const response = await loginCall({ pin });
  await signInWithCustomToken(auth, response.data.token);
  return getIdTokenResult(auth.currentUser, true);
}
async function getPersonTransactions(personId) {
  const call = httpsCallable(functions, "getPersonTransactions");
  const response = await call({ personId });
  return response.data;
}
async function getPersonTransactions(personId) {
  const call = httpsCallable(functions, "getPersonTransactions");
  const response = await call({ personId });
  return response.data;
}
async function setPersonPin(personId, pin) {
  const call = httpsCallable(functions, "setPersonPin");
  const response = await call({ personId, pin });
  return response.data;
}
async function accessClaims() {
  if (!auth.currentUser) return null;
  return (await getIdTokenResult(auth.currentUser, true)).claims;
}
async function requireAuth() {
  await authReady;
  if (!auth.currentUser) throw new Error("Please sign in with your PIN first.");
}
const set = async (...args) => { await requireAuth(); return dbSet(...args); };
const update = async (...args) => { await requireAuth(); return dbUpdate(...args); };
const remove = async (...args) => { await requireAuth(); return dbRemove(...args); };
const onValue = (databaseRef, callback, errorCallback) => {
  authReady.then(() => {
    if (!auth.currentUser) throw new Error("PIN login required.");
    dbOnValue(databaseRef, callback, errorCallback);
  }).catch((error) => {
    console.error("Firebase database listener could not start:", error);
    if (errorCallback) errorCallback(error);
  });
};

export { db, auth, authReady, ref, push, set, update, remove, onValue, loginWithPin, setPersonPin, getPersonTransactions, accessClaims, signOut };
