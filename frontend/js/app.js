/* Front branché sur l'API.
   - Connexion par identifiant et mot de passe, token JWT conservé dans le navigateur.
   - Galeries : liste selon le rôle, création pour les membres et admins.
   - Concours et billets : pas encore branchés au backend. */

const API = "/api";
const TOKEN_KEY = "photo-token";
const VISIBILITIES = ["public", "membres", "concours", "jury", "admin"];

// ---------- Stockage du token (préférence de navigateur, pas une donnée métier) ----------
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* stockage indisponible : la session ne persiste pas */ }
}

// ---------- Client API ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch (e) { /* réponse sans JSON */ }

  if (res.status === 401) setToken(null); // token expiré ou invalide
  if (!res.ok) {
    const error = new Error((data && data.error) || `Erreur ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// ---------- En-tête : état de connexion ----------
async function renderUserStatus() {
  const box = document.getElementById("user-status");
  if (!box) return null;

  if (!getToken()) {
    box.innerHTML = `<a href="${rootPath()}pages/login.html">Connexion</a>`;
    return null;
  }
  try {
    const { user } = await api("/auth/me");
    box.innerHTML = `${user.displayName} <span class="badge">${user.role}</span> · <a href="#" id="logout">Déconnexion</a>`;
    document.getElementById("logout").addEventListener("click", e => {
      e.preventDefault();
      setToken(null);
      location.href = rootPath() + "index.html";
    });
    return user;
  } catch (e) {
    box.innerHTML = `<a href="${rootPath()}pages/login.html">Connexion</a>`;
    return null;
  }
}

// Chemin relatif vers la racine du site, selon la profondeur de la page
function rootPath() {
  return location.pathname.includes("/pages/") ? "../" : "";
}

// ---------- Connexion ----------
function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;
  const msg = document.getElementById("login-msg");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.textContent = "Connexion…";
    const username = form.user.value.trim();
    const password = form.pwd.value;
    try {
      const { token } = await api("/auth/login", { method: "POST", body: { username, password } });
      setToken(token);
      location.href = "../index.html";
    } catch (err) {
      msg.textContent = err.status === 401
        ? "Identifiant ou mot de passe incorrect."
        : `Connexion impossible : ${err.message}`;
    }
  });
}

// ---------- Galeries ----------
function renderGalleryList(galleries) {
  const list = document.getElementById("gallery-list");
  if (!galleries.length) {
    list.innerHTML = `<p class="muted">Aucune galerie accessible pour le moment.</p>`;
    return;
  }
  list.innerHTML = galleries.map(g => `
    <article class="card">
      <h2>${escapeHtml(g.title)}</h2>
      <p class="muted">Par ${escapeHtml(g.author)} · ${g.photoCount} photo(s)</p>
      <span class="badge">${g.visibility}</span>
    </article>
  `).join("");
}

async function loadGalleries() {
  const list = document.getElementById("gallery-list");
  if (!list) return;
  try {
    const { galleries } = await api("/galleries");
    renderGalleryList(galleries);
  } catch (e) {
    list.innerHTML = `<p class="muted">Impossible de charger les galeries : ${escapeHtml(e.message)}</p>`;
  }
}

function initGalleryForm(user) {
  const section = document.getElementById("new-gallery");
  const form = document.getElementById("gallery-form");
  if (!section || !form) return;

  // Seuls les membres et admins peuvent créer une galerie
  if (!user || !["admin", "membre"].includes(user.role)) return;
  section.hidden = false;

  const select = form.visibility;
  select.innerHTML = VISIBILITIES.map(v => `<option value="${v}">${v}</option>`).join("");

  const msg = document.getElementById("gallery-msg");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.textContent = "Création…";
    try {
      await api("/galleries", {
        method: "POST",
        body: { title: form.title.value, visibility: form.visibility.value },
      });
      form.reset();
      msg.textContent = "Galerie créée.";
      loadGalleries();
    } catch (err) {
      msg.textContent = `Erreur : ${err.message}`;
    }
  });
}

// ---------- Utilitaires ----------
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ---------- Démarrage ----------
document.addEventListener("DOMContentLoaded", async () => {
  initLogin();
  const user = await renderUserStatus();
  await loadGalleries();
  initGalleryForm(user);

  const contest = document.getElementById("contest");
  if (contest) {
    contest.innerHTML = `<p class="muted">Les concours ne sont pas encore branchés au backend.</p>`;
  }
});
