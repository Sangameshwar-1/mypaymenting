import { auth, authReady, loginWithEmail, accessClaims, signOut } from "./firebase.js";

const form = document.getElementById("emailLoginForm");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const button = document.getElementById("emailLoginButton");
const error = document.getElementById("emailLoginError");

function ensureLogoutButton() {
  if (document.getElementById("logoutBtn")) return;
  const header = document.querySelector(".header-inner");
  if (!header) return;
  const logout = document.createElement("button");
  logout.id = "logoutBtn";
  logout.type = "button";
  logout.className = "logout-btn";
  logout.textContent = "Log out";
  logout.addEventListener("click", async () => { await signOut(auth); location.replace("index.html"); });
  header.appendChild(logout);
}
function showAdmin() {
  ensureLogoutButton();
  document.body.classList.add("authenticated");
  document.getElementById("loginGate")?.setAttribute("hidden", "");
  window.dispatchEvent(new Event("mypayments-authenticated"));
  if (location.pathname.endsWith("person.html") && !new URLSearchParams(location.search).get("id")) location.replace("index.html");
}
async function resumeSession(user) {
  if (!user) return;
  try {
    const claims = await accessClaims();
    if (claims?.admin) showAdmin();
    else if (claims?.personId) {
      if (!location.pathname.endsWith("person.html")) location.replace("person.html");
      else {
        ensureLogoutButton();
        document.body.classList.add("authenticated");
        document.getElementById("loginGate")?.setAttribute("hidden", "");
        window.dispatchEvent(new CustomEvent("mypayments-person-authenticated", { detail: { personId: claims.personId } }));
      }
    } else await signOut(auth);
  } catch (e) { console.error("Could not restore session", e); }
}
authReady.then(resumeSession).catch(console.error);

form?.addEventListener("submit", async event => {
  event.preventDefault();
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Signing in…";
  try {
    const { claims } = await loginWithEmail(emailInput.value, passwordInput.value);
    passwordInput.value = "";
    if (claims.admin) showAdmin();
    else if (claims.personId) {
      if (!location.pathname.endsWith("person.html")) location.replace("person.html");
      else {
        ensureLogoutButton();
        document.body.classList.add("authenticated");
        document.getElementById("loginGate")?.setAttribute("hidden", "");
        window.dispatchEvent(new CustomEvent("mypayments-person-authenticated", { detail: { personId: claims.personId } }));
      }
    }
  } catch (e) {
    console.error("Sign-in failed:", e);
    error.textContent = e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found"
      ? "Email or password is incorrect."
      : e.message || "Sign-in failed. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});
