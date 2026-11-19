/* Front provisoire : données fictives, pas d'appel au backend.
   Le rôle est choisi dans l'en-tête pour tester l'affichage selon les droits.
   À remplacer par une vraie authentification et l'API quand le backend existera. */

// ---------- Données fictives ----------
const ROLES = ["visiteur", "membre", "jury", "admin"];

// Niveaux de visibilité : quels rôles peuvent voir la galerie
const VISIBILITY = {
  public:   ["visiteur", "membre", "jury", "admin"],
  membres:  ["membre", "jury", "admin"],
  concours: ["membre", "jury", "admin"],
  jury:     ["jury", "admin"],
  admin:    ["admin"]
};

const GALLERIES = [
  { id: 1, title: "Paysages d'automne", visibility: "public",   author: "Claire",  photos: 12 },
  { id: 2, title: "Portraits en studio", visibility: "membres", author: "Marc",    photos: 8 },
  { id: 3, title: "Concours : Lumière",  visibility: "concours", author: "Sophie", photos: 20 },
  { id: 4, title: "Notes du jury",       visibility: "jury",    author: "Paul",    photos: 5 },
  { id: 5, title: "Archives admin",      visibility: "admin",   author: "Admin",   photos: 3 }
];

const CONTEST = {
  title: "Concours : Lumière",
  options: { autoNotation: false, notesVisibles: "a_la_fin" },
  juryCount: 2,
  photos: [
    { id: "p1", title: "Matin brumeux", author: "Claire", notes: { membres: [14, 16, 12], jury: [17, 15] } },
    { id: "p2", title: "Contre-jour",   author: "Marc",   notes: { membres: [11, 13, 15], jury: [12, 14] } },
    { id: "p3", title: "Reflets",       author: "Sophie", notes: { membres: [18, 17, 16], jury: [16, 18] } }
  ]
};

// ---------- Rôle courant (démo) ----------
function currentRole() {
  try {
    const r = localStorage.getItem("photo-role");
    return ROLES.includes(r) ? r : "visiteur";
  } catch (e) {
    return "visiteur";
  }
}

function setRole(role) {
  try { localStorage.setItem("photo-role", role); } catch (e) { /* stockage indisponible : on continue */ }
}

function canSee(visibility, role) {
  return (VISIBILITY[visibility] || []).includes(role);
}

function average(list) {
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

// ---------- En-tête : sélecteur de rôle de démo ----------
function initRoleSwitch() {
  const select = document.getElementById("role-select");
  if (!select) return;
  select.innerHTML = ROLES.map(r => `<option value="${r}">${r}</option>`).join("");
  select.value = currentRole();
  select.addEventListener("change", () => {
    setRole(select.value);
    // Recharge la page courante pour réafficher selon le rôle
    location.reload();
  });
}

// ---------- Galeries ----------
function renderGalleries() {
  const list = document.getElementById("gallery-list");
  if (!list) return;
  const role = currentRole();
  const visible = GALLERIES.filter(g => canSee(g.visibility, role));

  if (!visible.length) {
    list.innerHTML = `<p class="muted">Aucune galerie accessible avec le rôle « ${role} ».</p>`;
    return;
  }

  list.innerHTML = visible.map(g => `
    <article class="card">
      <h2>${g.title}</h2>
      <p class="muted">Par ${g.author} · ${g.photos} photos</p>
      <span class="badge">${g.visibility}</span>
    </article>
  `).join("");
}

// ---------- Concours ----------
function renderContest() {
  const box = document.getElementById("contest");
  if (!box) return;
  const role = currentRole();

  if (!canSee("concours", role)) {
    box.innerHTML = `<p class="muted">Ce concours est réservé aux membres invités.</p>`;
    return;
  }

  const canScore = role === "membre" || role === "jury";
  const scoreKind = role === "jury" ? "jury" : "membres";

  const rows = CONTEST.photos.map(p => {
    const avgMembres = average(p.notes.membres);
    const avgJury = average(p.notes.jury);
    const fmt = v => (v === null ? "—" : v.toFixed(1));
    const notesVisibles = CONTEST.options.notesVisibles === "pendant" || role === "admin";
    const cellMembres = notesVisibles ? fmt(avgMembres) : "masqué";
    const cellJury = notesVisibles || role === "jury" ? fmt(avgJury) : "masqué";
    const input = canScore
      ? `<input type="number" min="0" max="20" step="0.5" aria-label="Note de 0 à 20 pour ${p.title}" placeholder="0–20" style="width:90px">`
      : "";
    return `<tr>
      <td>${p.title}<br><small class="muted">${p.author}</small></td>
      <td>${cellMembres}</td>
      <td>${cellJury}</td>
      <td>${input}</td>
    </tr>`;
  }).join("");

  box.innerHTML = `
    <div class="card">
      <h2>${CONTEST.title}</h2>
      <p class="muted">
        Jurés : ${CONTEST.juryCount} ·
        Auto-notation : ${CONTEST.options.autoNotation ? "oui" : "non"} ·
        Notes : ${CONTEST.options.notesVisibles === "pendant" ? "visibles pendant" : "visibles à la fin"}
      </p>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Photo</th><th>Moyenne membres</th><th>Moyenne jury</th><th>${scoreKind === "jury" ? "Ma note (jury)" : canScore ? "Ma note (membre)" : ""}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="margin-top:12px">Note de 0 à 20. L'enregistrement des notes sera branché sur le backend.</p>
    </div>`;
}

// ---------- Connexion (démo) ----------
function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const msg = document.getElementById("login-msg");
    msg.textContent = "Connexion non branchée au backend pour le moment.";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initRoleSwitch();
  renderGalleries();
  renderContest();
  initLogin();
});
