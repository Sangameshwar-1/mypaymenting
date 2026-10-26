import { auth, authReady, loginWithPin, accessClaims, signOut } from "./firebase.js";

const form = document.getElementById("pinLoginForm");
const input = document.getElementById("pinInput");
const button = document.getElementById("pinLoginButton");
const error = document.getElementById("pinLoginError");

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
  if (location.pathname.endsWith("person.html") && !new URLSearchParams(location.search).get("id")) {
    location.replace("index.html");
  }
}
async function resumeSession(user) {
  if (!user) return;
  const claims = await accessClaims();
  if (claims?.admin) {
    showAdmin();
  } else if (claims?.personId) {
    if (!location.pathname.endsWith("person.html")) {
      location.replace("person.html");
    } else {
      ensureLogoutButton();
      document.body.classList.add("authenticated");
      document.getElementById("loginGate")?.setAttribute("hidden", "");
      window.dispatchEvent(new CustomEvent("mypayments-person-authenticated", { detail: { personId: claims.personId } }));
    }
  } else {
    await signOut(auth);
  }
}
authReady.then(resumeSession).catch((e) => console.error("Could not restore session", e));

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Checking…";
  try {
    const result = await loginWithPin(input.value);
    input.value = "";
    if (result.claims.admin) {
      showAdmin();
    } else if (result.claims.personId) {
      if (!location.pathname.endsWith("person.html")) {
        location.replace("person.html");
      } else {
        ensureLogoutButton();
        document.body.classList.add("authenticated");
        document.getElementById("loginGate")?.setAttribute("hidden", "");
        window.dispatchEvent(new CustomEvent("mypayments-person-authenticated", { detail: { personId: result.claims.personId } }));
      }
    } else {
      throw new Error("This PIN is not assigned to a role.");
    }
  } catch (e) {
    error.textContent = e.code === "functions/resource-exhausted"
      ? "Too many attempts. Please wait 10 minutes."
      : e.code === "functions/unauthenticated" ? "Incorrect PIN." : "Login failed. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Continue";
  }
});
