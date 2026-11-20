/* Front du club photo, branché sur l'API.
   Session par cookie HttpOnly : rien n'est stocké dans le navigateur.
   Chaque page appelle sa fonction selon l'attribut data-page du <body>. */

const API = '/api';
const VISIBILITIES = ['public', 'membres', 'concours', 'jury', 'admin'];
const METADATA_LABELS = {
  camera: 'Boîtier', lens: 'Objectif', iso: 'ISO', aperture: 'Ouverture',
  shutter: 'Vitesse', focal_length: 'Focale', date: 'Date',
};
const PERMISSIONS_ADMIN_TABS = {
  users: 'user:manage', invites: 'invite:create', roles: 'role:manage',
  visibility: 'role:manage', posts: 'post:manage', settings: 'settings:manage',
};
const ERRORS = {
  titre_invalide: 'Titre invalide.',
  visibilite_invalide: 'Visibilité invalide.',
  identifiants_invalides: 'Identifiant ou mot de passe incorrect.',
  identifiant_ou_mot_de_passe_manquant: 'Renseignez l’identifiant et le mot de passe.',
  invitation_invalide: 'Invitation invalide ou expirée.',
  identifiant_deja_pris: 'Cet identifiant est déjà utilisé.',
  identifiant_invalide: 'Identifiant invalide (3 à 32 caractères : lettres, chiffres, _ . -).',
  mot_de_passe_trop_court: 'Mot de passe trop court (8 caractères minimum).',
  champs_manquants: 'Champs manquants.',
  role_invalide: 'Rôle invalide.',
  acces_refuse: 'Accès refusé.',
  non_connecte: 'Connectez-vous pour continuer.',
  session_invalide: 'Session expirée, reconnectez-vous.',
  utilisateur_inactif: 'Compte désactivé.',
  fichier_trop_volumineux: 'Fichier trop volumineux.',
  trop_de_fichiers: 'Trop de fichiers à la fois.',
  aucun_fichier: 'Aucun fichier sélectionné.',
  nombre_de_jures_invalide: 'Nombre de jurés invalide (0 à 20).',
  concours_ouvert_reglages_figes: 'Le concours est ouvert : seuls les membres et la visibilité des notes sont modifiables.',
  jures_incomplets: 'Le nombre de jurés n’est pas encore atteint.',
  transition_invalide: 'Changement de statut impossible.',
  concours_non_ouvert: 'Le concours n’est pas ouvert à la notation.',
  concours_clos: 'Le concours est clos.',
  non_autorise_a_noter: 'Vous ne pouvez pas noter ce concours.',
  auto_notation_interdite: 'L’auto-notation est désactivée pour ce concours.',
  note_invalide: 'Note invalide (0 à 20).',
  photo_hors_concours: 'Cette photo n’est pas dans le concours.',
  photo_non_autorisee: 'Vous ne pouvez inscrire que vos propres photos.',
  photos_invalides: 'Sélectionnez au moins une photo.',
  notes_non_visibles: 'Les notes ne sont pas encore visibles.',
  role_utilise: 'Ce rôle est encore attribué à des utilisateurs.',
  role_protege: 'Ce rôle ne peut pas être supprimé.',
  role_admin_protege: 'Les droits du rôle admin ne peuvent pas être modifiés.',
  role_existant: 'Ce rôle existe déjà.',
  nom_invalide: 'Nom de rôle invalide (minuscules, chiffres, - et _).',
  libelle_manquant: 'Libellé manquant.',
  valeur_invalide: 'Valeur invalide.',
  visibilite_notes_invalide: 'Option de visibilité des notes invalide.',
  auto_notation_invalide: 'Option d’auto-notation invalide.',
  participants_invalides: 'Liste de participants invalide.',
  participant_inconnu: 'Un participant n’existe pas.',
  statut_invalide: 'Statut invalide.',
  titre_manquant: 'Titre manquant.',
  contenu_manquant: 'Contenu manquant.',
  publication_invalide: 'Option de publication invalide.',
  erreur_serveur: 'Erreur du serveur. Réessayez.',
};

const $ = (sel, root = document) => root.querySelector(sel);
const qs = name => new URLSearchParams(location.search).get(name);
const msg = code => ERRORS[code] || code || 'Erreur.';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const field = (form, name) => form.querySelector(`[name="${name}"]`);
const can = (user, code) => !!(user && user.permissions && user.permissions.includes(code));
const fmtDate = d => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

function say(el, text, ok = false) {
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? 'var(--accent)' : '';
}

// ---------- Client API ----------
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
  if (opts.form) {
    init.body = opts.form;
  } else if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, init);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(msg(data && data.error));
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }
  return data;
}

// ---------- Session et en-tête ----------
let ME = null;

async function loadMe() {
  try {
    ME = (await api('/auth/me')).user;
  } catch {
    ME = null;
  }
  return ME;
}

// Pages de détail rattachées à une rubrique du menu
const SECTION_OF = {
  '/pages/galerie.html': '/pages/galeries.html',
  '/pages/register.html': '/pages/login.html',
};

// En-tête commun à toutes les pages. Appelé une fois immédiatement (liens visibles
// sans attendre la session), puis après le chargement de la session.
function renderHeader() {
  const nav = $('#nav');
  if (!nav) return;
  const path = location.pathname === '/' ? '/index.html' : location.pathname;
  const here = SECTION_OF[path] || path;

  const links = [
    ['/index.html', 'Accueil'],
    ['/pages/galeries.html', 'Galeries'],
    ['/pages/concours.html', 'Concours'],
  ];
  const adminCodes = Object.values(PERMISSIONS_ADMIN_TABS);
  if (ME && adminCodes.some(code => can(ME, code))) links.push(['/pages/admin.html', 'Administration']);

  nav.innerHTML = links
    .map(([href, label]) => `<a href="${href}"${here === href ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');

  const status = $('#user-status');
  if (!status) return;
  status.innerHTML = ME
    ? `<span class="who">${esc(ME.displayName)}</span> <span class="badge">${esc(ME.role)}</span> · <a href="#" id="logout">Déconnexion</a>`
    : '<a href="/pages/login.html">Connexion</a>';

  const logout = $('#logout');
  if (logout) {
    logout.addEventListener('click', async e => {
      e.preventDefault();
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/index.html';
    });
  }
}

function requireLogin() {
  if (ME) return true;
  const main = $('#main');
  if (main) main.innerHTML = '<p class="muted">Connectez-vous pour accéder à cette page. <a href="/pages/login.html">Connexion</a></p>';
  return false;
}

// ---------- Accueil ----------
async function pageHome() {
  const site = await api('/site').catch(() => ({ clubName: 'Club photo' }));
  document.title = site.clubName;
  $('#club-name').textContent = site.clubName;

  const { posts } = await api('/posts').catch(() => ({ posts: [] }));
  $('#posts').innerHTML = posts.length
    ? posts.map(p => `
        <article class="card">
          <h3>${esc(p.title)}</h3>
          <div style="white-space:pre-line">${esc(p.body)}</div>
          <p class="muted">${esc(p.author)}${p.publishedAt ? ' · ' + fmtDate(p.publishedAt) : ''}</p>
        </article>`).join('')
    : '<p class="muted">Pas encore de billet.</p>';
}

// ---------- Connexion et inscription ----------
function pageLogin() {
  const form = $('#login-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    say($('#login-msg'), 'Connexion…');
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { username: field(form, 'user').value.trim(), password: field(form, 'pwd').value },
      });
      location.href = '/index.html';
    } catch (err) {
      say($('#login-msg'), err.message);
    }
  });
}

function pageRegister() {
  const token = qs('token');
  const form = $('#register-form');
  if (!token) {
    form.hidden = true;
    say($('#register-msg'), 'Lien d’invitation incomplet.');
    return;
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    say($('#register-msg'), 'Création du compte…');
    try {
      await api('/auth/register', {
        method: 'POST',
        body: {
          token,
          username: field(form, 'user').value.trim(),
          displayName: field(form, 'displayName').value.trim(),
          password: field(form, 'pwd').value,
        },
      });
      location.href = '/pages/login.html';
    } catch (err) {
      say($('#register-msg'), err.message);
    }
  });
}

// ---------- Galeries ----------
async function refreshGalleries() {
  const { galleries } = await api('/galleries');
  $('#gallery-list').innerHTML = galleries.length
    ? galleries.map(g => {
        const href = g.kind === 'concours' && g.contestId
          ? `/pages/concours.html?id=${g.contestId}`
          : `/pages/galerie.html?id=${g.id}`;
        return `
        <a class="card gallery-link" href="${href}">
          <h2>${esc(g.title)}</h2>
          <p class="muted">Par ${esc(g.author)} · ${g.photoCount} photo(s)</p>
          <span class="badge">${esc(g.visibility)}</span>
          ${g.kind === 'concours' ? '<span class="badge">concours</span>' : ''}
        </a>`;
      }).join('')
    : '<p class="muted">Aucune galerie accessible.</p>';
}

async function pageGalleries() {
  await refreshGalleries();
  if (!can(ME, 'gallery:create')) return;

  const form = $('#gallery-form');
  $('#btn-new-gallery').hidden = false;
  $('#g-visibility').innerHTML = VISIBILITIES.map(v => `<option value="${v}">${v}</option>`).join('');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/galleries', {
        method: 'POST',
        body: { title: field(form, 'title').value, visibility: field(form, 'visibility').value },
      });
      form.reset();
      say($('#gallery-msg'), 'Galerie créée.', true);
      await refreshGalleries();
    } catch (err) {
      say($('#gallery-msg'), err.message);
    }
  });
}

const metaLines = meta => Object.entries(meta || {})
  .filter(([, v]) => v !== null && v !== undefined && v !== '')
  .map(([k, v]) => `${esc(METADATA_LABELS[k] || k)} : ${esc(v)}`)
  .join('<br>');

async function pageGallery() {
  const id = Number(qs('id'));
  const view = $('#gallery-view');
  if (!id) {
    view.textContent = 'Galerie introuvable.';
    return;
  }

  let data;
  try {
    data = await api(`/galleries/${id}`);
  } catch (err) {
    view.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    return;
  }
  const { gallery, photos } = data;
  $('#gallery-title').textContent = gallery.title;

  $('#photo-grid').innerHTML = photos.length
    ? photos.map(p => `
        <figure class="photo">
          <a href="${p.previewUrl || '#'}" target="_blank" rel="noopener">
            <div class="thumb" style="${p.thumbUrl ? `background-image:url('${p.thumbUrl}');background-size:cover;background-position:center` : ''}"></div>
          </a>
          <figcaption class="info">
            ${esc(p.title)}
            <small>${metaLines(p.metadata) || 'Pas de métadonnées'}</small>
            ${p.rawUrl ? `<small><a href="${p.rawUrl}">Télécharger le RAW</a></small>` : ''}
            ${p.canDelete ? `<button class="secondary" data-del-photo="${p.id}">Supprimer</button>` : ''}
          </figcaption>
        </figure>`).join('')
    : '<p class="muted">Aucune photo pour le moment.</p>';

  document.querySelectorAll('[data-del-photo]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Supprimer cette photo définitivement ?')) return;
    try {
      await api(`/photos/${btn.dataset.delPhoto}`, { method: 'DELETE' });
      location.reload();
    } catch (err) {
      alert(err.message);
    }
  }));

  if (gallery.canEdit) {
    const del = $('#btn-delete-gallery');
    del.hidden = false;
    del.addEventListener('click', async () => {
      if (!confirm('Supprimer la galerie et toutes ses photos définitivement ?')) return;
      try {
        await api(`/galleries/${id}`, { method: 'DELETE' });
        location.href = '/pages/galeries.html';
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (gallery.canEdit) {
    $('#btn-visibility').hidden = false;
    const edit = $('#visibility-form');
    field(edit, 'visibility').innerHTML = VISIBILITIES
      .map(v => `<option value="${v}"${v === gallery.visibility ? ' selected' : ''}>${v}</option>`).join('');
    edit.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api(`/galleries/${id}`, { method: 'PATCH', body: { visibility: field(edit, 'visibility').value } });
        say($('#visibility-msg'), 'Visibilité enregistrée.', true);
      } catch (err) {
        say($('#visibility-msg'), err.message);
      }
    });
  }

  if (gallery.contestId) {
    view.insertAdjacentHTML('afterbegin',
      `<p><a href="/pages/concours.html?id=${gallery.contestId}">Galerie de concours : voir le concours et les notes →</a></p>`);
  }

  if (gallery.canUpload) {
    $('#btn-upload').hidden = false;
    const form = $('#upload-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const files = field(form, 'files').files;
      if (!files.length) return say($('#upload-msg'), 'Aucun fichier sélectionné.');
      const body = new FormData();
      for (const file of files) body.append('files', file);
      say($('#upload-msg'), `Envoi de ${files.length} fichier(s)…`);
      try {
        const result = await api(`/galleries/${id}/photos`, { method: 'POST', form: body });
        const rejected = result.rejected.map(r => `${r.name} : ${msg(r.error)}`).join(' · ');
        say($('#upload-msg'), `${result.imported.length} photo(s) importée(s).${rejected ? ' Refusées : ' + rejected : ''}`, !rejected);
        if (result.imported.length) setTimeout(() => location.reload(), 1200);
      } catch (err) {
        say($('#upload-msg'), err.message);
      }
    });
  }
}

// ---------- Concours ----------
async function pageContests() {
  const { contests } = await api('/contests');
  $('#contest-list').innerHTML = contests.length
    ? contests.map(c => `
        <a class="card gallery-link" href="/pages/concours.html?id=${c.id}">
          <h2>${esc(c.title)}</h2>
          <p class="muted">${esc(c.status)} · ${c.juryCount} juré(s)
            ${c.juror ? ' · vous êtes juré' : ''}${c.member ? ' · vous êtes membre' : ''}</p>
        </a>`).join('')
    : '<p class="muted">Aucun concours.</p>';

  if (!can(ME, 'contest:manage')) return;
  $('#btn-new-contest').hidden = false;

  const { users } = await api('/contests/people');
  const boxes = (name) => users.map(u => `
    <label class="check"><input type="checkbox" name="${name}" value="${u.id}"> ${esc(u.displayName)} <span class="muted">(${esc(u.role)})</span></label>`).join('');
  const form = $('#contest-form');
  $('#members-box').innerHTML = boxes('members');
  $('#jurors-box').innerHTML = boxes('jurors');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const pick = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => Number(i.value));
    try {
      const { id } = await api('/contests', {
        method: 'POST',
        body: {
          title: field(form, 'title').value,
          juryCount: Number(field(form, 'juryCount').value),
          autoNotation: field(form, 'autoNotation').checked,
          notesVisibility: field(form, 'notesVisibility').value,
          memberIds: pick('members'),
          jurorIds: pick('jurors'),
        },
      });
      location.href = `/pages/concours.html?id=${id}`;
    } catch (err) {
      say($('#contest-msg'), err.message);
    }
  });
}

async function pageContest() {
  const id = Number(qs('id'));
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  const view = $('#contest-view');
  let data;
  try {
    data = await api(`/contests/${id}`);
  } catch (err) {
    view.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    return;
  }
  const { contest, photos } = data;
  $('#contest-title').textContent = contest.title;

  const options = [
    `${contest.juryCount} juré(s)`,
    contest.autoNotation ? 'auto-notation autorisée' : 'auto-notation interdite',
    contest.notesVisibility === 'pendant' ? 'notes visibles pendant' : 'notes visibles à la fin',
  ];
  view.innerHTML = `
    <p class="muted">Statut : <span class="badge">${esc(contest.status)}</span> · ${options.join(' · ')}</p>
    ${contest.jurors && Array.isArray(contest.jurors) ? `<p class="muted">Jurés : ${contest.jurors.map(j => esc(j.displayName)).join(', ') || '—'}</p>` : ''}
    ${contest.members && Array.isArray(contest.members) ? `<p class="muted">Membres invités : ${contest.members.map(m => esc(m.displayName)).join(', ') || '—'}</p>` : ''}
    <div id="contest-actions"></div>`;

  if (can(ME, 'contest:manage') && contest.status !== 'clos') {
    const next = contest.status === 'brouillon' ? 'ouvert' : 'clos';
    const label = next === 'ouvert' ? 'Ouvrir le concours' : 'Clôturer le concours';
    $('#contest-actions').innerHTML = `<button id="advance">${label}</button> <span id="advance-msg" class="muted"></span>`;
    $('#advance').addEventListener('click', async () => {
      try {
        await api(`/contests/${id}`, { method: 'PATCH', body: { status: next } });
        location.reload();
      } catch (err) {
        say($('#advance-msg'), err.message);
      }
    });
  }

  if (contest.me.canUpload) {
    view.insertAdjacentHTML('beforeend',
      `<p><a class="btn" href="/pages/galerie.html?id=${contest.galleryId}">Déposer mes photos dans la galerie du concours</a></p>`);
  }

  await renderContestEditor(contest, id);
  renderPhotos(contest, photos);
  if (contest.notesVisible) await renderRanking(id);
}

// Formulaire de modification d'un concours (gestionnaire des concours).
// Brouillon : tous les réglages. Ouvert : membres et visibilité des notes seulement.
async function renderContestEditor(contest, id) {
  if (!can(ME, 'contest:manage') || contest.status === 'clos') return;
  const { users } = await api('/contests/people');
  const memberIds = (Array.isArray(contest.members) ? contest.members : []).map(m => m.id);
  const jurorIds = (Array.isArray(contest.jurors) ? contest.jurors : []).map(j => j.id);
  const draft = contest.status === 'brouillon';
  const boxes = (name, selected, disabled) => users.map(u => `
    <label class="check"><input type="checkbox" name="${name}" value="${u.id}"${selected.includes(u.id) ? ' checked' : ''}${disabled ? ' disabled' : ''}> ${esc(u.displayName)} <span class="muted">(${esc(u.role)})</span></label>`).join('');

  $('#contest-view').insertAdjacentHTML('beforeend', `
    <button class="toggle" data-toggle="contest-edit">Modifier le concours</button>
    <section class="card" id="contest-edit" hidden>
      <h2>Modifier le concours</h2>
      ${draft ? '' : '<p class="muted">Le concours est ouvert : seuls les membres invités et la visibilité des notes peuvent être modifiés.</p>'}
      <form id="contest-edit-form">
        <div class="field"><label>Titre</label><input name="title" value="${esc(contest.title)}" required></div>
        <div class="field"><label>Nombre de jurés (0 à 20 ; 0 = seuls les membres notent)</label>
          <input name="juryCount" type="number" min="0" max="20" value="${contest.juryCount}"${draft ? '' : ' disabled'}></div>
        <label class="check"><input type="checkbox" name="autoNotation"${contest.autoNotation ? ' checked' : ''}${draft ? '' : ' disabled'}> Autoriser l’auto-notation</label>
        <div class="field"><label>Visibilité des notes</label>
          <select name="notesVisibility">
            <option value="fin"${contest.notesVisibility === 'fin' ? ' selected' : ''}>À la fin du concours</option>
            <option value="pendant"${contest.notesVisibility === 'pendant' ? ' selected' : ''}>Pendant le concours</option>
          </select></div>
        <h3>Membres invités</h3>
        <div class="checks">${boxes('members', memberIds, false)}</div>
        <h3>Jurés</h3>
        <div class="checks">${boxes('jurors', jurorIds, !draft)}</div>
        <p><button type="submit">Enregistrer</button> <span id="contest-edit-msg" class="muted" role="status"></span></p>
      </form>
    </section>`);

  $('#contest-edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const pick = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => Number(i.value));
    const body = {
      title: field(form, 'title').value,
      notesVisibility: field(form, 'notesVisibility').value,
      memberIds: pick('members'),
    };
    if (draft) {
      body.juryCount = Number(field(form, 'juryCount').value);
      body.autoNotation = field(form, 'autoNotation').checked;
      body.jurorIds = pick('jurors');
    }
    try {
      await api(`/contests/${id}`, { method: 'PATCH', body });
      say($('#contest-edit-msg'), 'Concours enregistré.', true);
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      say($('#contest-edit-msg'), err.message);
    }
  });
}

function renderPhotos(contest, photos) {
  const canScore = contest.me.canScore;
  const rows = photos.map(p => {
    const ownPhoto = p.ownerId === ME.id && !contest.autoNotation;
    const cell = (v) => contest.notesVisible ? (v ?? '—') : 'masqué';
    const scoreCell = canScore && !ownPhoto
      ? `<input type="number" min="0" max="20" step="0.5" value="${p.myScore ?? ''}" data-photo="${p.id}" style="width:80px"> <button data-score="${p.id}">Noter</button>`
      : (p.myScore ?? '—');
    return `
      <tr>
        <td><div class="thumb mini" style="${p.thumbUrl ? `background-image:url('${p.thumbUrl}');background-size:cover` : ''}"></div></td>
        <td>${esc(p.title)}<br><small class="muted">${esc(p.author)}</small></td>
        <td>${cell(p.memberAvg)}</td>
        <td>${cell(p.juryAvg)}</td>
        <td>${scoreCell}</td>
      </tr>`;
  }).join('');

  $('#contest-photos').innerHTML = photos.length
    ? `<div style="overflow-x:auto"><table>
         <thead><tr><th></th><th>Photo</th><th>Moyenne membres</th><th>Moyenne jury</th><th>Ma note (0–20)</th></tr></thead>
         <tbody>${rows}</tbody></table></div>
         <p id="score-msg" class="muted" role="status"></p>`
    : '<p class="muted">Aucune photo inscrite pour le moment.</p>';

  document.querySelectorAll('[data-score]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const photoId = Number(btn.dataset.score);
      const value = document.querySelector(`[data-photo="${photoId}"]`).value;
      try {
        await api(`/contests/${contest.id}/scores`, { method: 'POST', body: { photoId, value: Number(value) } });
        say($('#score-msg'), 'Note enregistrée.', true);
      } catch (err) {
        say($('#score-msg'), err.message);
      }
    });
  });
}

async function renderRanking(contestId) {
  const ranking = await api(`/contests/${contestId}/ranking`).catch(() => null);
  if (!ranking) return;
  const table = (rows) => rows.length
    ? `<table><thead><tr><th>Rang</th><th>Photo</th><th>Moyenne</th></tr></thead><tbody>${
        rows.map(r => `<tr><td>${r.rank}</td><td>${esc(r.title)} <small class="muted">${esc(r.author)}</small></td><td>${r.average ?? '—'}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="muted">Aucun résultat.</p>';
  $('#ranking').innerHTML = `
    <div class="card"><h2>Classement par les membres</h2>${table(ranking.byMembers)}</div>
    <div class="card"><h2>Classement par le jury</h2>${table(ranking.byJury)}</div>`;
}

// ---------- Administration ----------
function adminTabs() {
  const allowed = Object.entries(PERMISSIONS_ADMIN_TABS).filter(([, code]) => can(ME, code)).map(([tab]) => tab);
  if (!allowed.length) {
    $('#main').innerHTML = '<p class="muted">Accès refusé.</p>';
    return null;
  }
  const bar = $('#tabs');
  bar.innerHTML = allowed.map(t => `<button class="secondary" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('');
  bar.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
  return allowed[0];
}

const TAB_LABELS = {
  users: 'Utilisateurs', invites: 'Invitations', roles: 'Rôles et droits',
  visibility: 'Visibilité', posts: 'Billets', settings: 'Réglages',
};
const TAB_LOADERS = {};

function openTab(tab) {
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('secondary', b.dataset.tab !== tab));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
  if (TAB_LOADERS[tab]) TAB_LOADERS[tab]().catch(err => {
    const panel = document.querySelector(`[data-panel="${tab}"]`);
    panel.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  });
}

const roleOptions = (roles, selectedId) => roles
  .map(r => `<option value="${r.id}"${r.id === selectedId ? ' selected' : ''}>${esc(r.label)}</option>`).join('');

async function loadRoles() {
  const { roles } = await api('/admin/roles');
  return roles;
}

TAB_LOADERS.users = async () => {
  const [{ users }, roles] = await Promise.all([api('/admin/users'), loadRoles()]);
  const panel = document.querySelector('[data-panel="users"]');
  panel.innerHTML = `
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>Actif</th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td>${esc(u.username)}</td>
          <td>${esc(u.displayName)}</td>
          <td><select data-role-user="${u.id}">${roleOptions(roles, u.roleId)}</select></td>
          <td><input type="checkbox" data-active-user="${u.id}"${u.active ? ' checked' : ''}></td>
        </tr>`).join('')}</tbody>
    </table></div>
    <p id="users-msg" class="muted" role="status"></p>
    <button class="toggle" data-toggle="box-user">+ Nouvel utilisateur</button>
    <section class="card" id="box-user" hidden>
    <form id="new-user">
      <div class="field"><label>Identifiant</label><input name="username" required></div>
      <div class="field"><label>Nom affiché</label><input name="displayName"></div>
      <div class="field"><label>Mot de passe (8 caractères minimum)</label><input name="password" type="password" required minlength="8"></div>
      <div class="field"><label>Rôle</label><select name="roleId">${roleOptions(roles)}</select></div>
      <button type="submit">Créer</button>
    </form>
    </section>`;

  panel.querySelectorAll('[data-role-user]').forEach(sel => sel.addEventListener('change', async () => {
    try {
      await api(`/admin/users/${sel.dataset.roleUser}`, { method: 'PATCH', body: { roleId: Number(sel.value) } });
      say($('#users-msg'), 'Rôle mis à jour.', true);
    } catch (err) { say($('#users-msg'), err.message); }
  }));
  panel.querySelectorAll('[data-active-user]').forEach(box => box.addEventListener('change', async () => {
    try {
      await api(`/admin/users/${box.dataset.activeUser}`, { method: 'PATCH', body: { active: box.checked } });
      say($('#users-msg'), 'Compte mis à jour.', true);
    } catch (err) { say($('#users-msg'), err.message); }
  }));
  $('#new-user').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/admin/users', {
        method: 'POST',
        body: { username: field(f, 'username').value, displayName: field(f, 'displayName').value, password: field(f, 'password').value, roleId: Number(field(f, 'roleId').value) },
      });
      say($('#users-msg'), 'Utilisateur créé.', true);
      TAB_LOADERS.users();
    } catch (err) { say($('#users-msg'), err.message); }
  });
};

TAB_LOADERS.invites = async () => {
  const [{ invitations }, roles] = await Promise.all([api('/admin/invitations'), loadRoles()]);
  const panel = document.querySelector('[data-panel="invites"]');
  panel.innerHTML = `
    <button class="toggle" data-toggle="box-invite">+ Nouvelle invitation</button>
    <section class="card" id="box-invite" hidden>
    <form id="new-invite" class="inline">
      <select name="roleId">${roleOptions(roles)}</select>
      <button type="submit">Créer une invitation</button>
    </form>
    </section>
    <p id="invite-msg" class="muted" role="status"></p>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Rôle</th><th>Expire le</th><th>Statut</th><th></th></tr></thead>
      <tbody>${invitations.map(i => {
        const status = i.usedAt ? 'utilisée' : (new Date(i.expiresAt) < new Date() ? 'expirée' : 'en attente');
        return `<tr><td>${esc(i.role)}</td><td>${fmtDate(i.expiresAt)}</td><td>${status}</td>
          <td>${i.usedAt ? '' : `<button class="secondary" data-del-invite="${i.id}">Supprimer</button>`}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;

  $('#new-invite').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const { path } = await api('/admin/invitations', { method: 'POST', body: { roleId: Number(field(e.target, 'roleId').value) } });
      const link = location.origin + path;
      say($('#invite-msg'), `Lien à transmettre : ${link}`, true);
      TAB_LOADERS.invites();
    } catch (err) { say($('#invite-msg'), err.message); }
  });
  panel.querySelectorAll('[data-del-invite]').forEach(btn => btn.addEventListener('click', async () => {
    await api(`/admin/invitations/${btn.dataset.delInvite}`, { method: 'DELETE' }).catch(() => {});
    TAB_LOADERS.invites();
  }));
};

TAB_LOADERS.roles = async () => {
  const [{ roles }, { permissions }] = await Promise.all([
    api('/admin/roles'),
    api('/admin/permissions'),
  ]);
  const panel = document.querySelector('[data-panel="roles"]');
  panel.innerHTML = `
    <p id="roles-msg" class="muted" role="status"></p>
    ${roles.map(r => {
      const isAdmin = r.name === 'admin';
      return `
      <section class="card" data-role="${r.id}">
        <h2>${esc(r.label)} <small class="muted">(${esc(r.name)})</small></h2>
        <div class="field"><label>Libellé</label><input name="label" value="${esc(r.label)}"></div>
        <div class="checks">${permissions.map(p => `
          <label class="check"><input type="checkbox" name="perm" value="${p.code}"${r.permissions.includes(p.code) ? ' checked' : ''}${isAdmin ? ' disabled' : ''}> ${esc(p.label)}</label>`).join('')}
        </div>
        <p class="inline">
          ${isAdmin ? '<span class="muted">Le rôle admin garde tous ses droits.</span>' : '<button data-save-role="' + r.id + '">Enregistrer</button> <button class="secondary" data-del-role="' + r.id + '">Supprimer</button>'}
        </p>
      </section>`;
    }).join('')}
    <button class="toggle" data-toggle="box-role">+ Nouveau rôle</button>
    <section class="card" id="box-role" hidden>
    <form id="new-role" class="inline">
      <input name="name" placeholder="identifiant (ex. photographe)" required>
      <input name="label" placeholder="libellé affiché" required>
      <button type="submit">Créer</button>
    </form>
    </section>`;

  panel.querySelectorAll('[data-save-role]').forEach(btn => btn.addEventListener('click', async () => {
    const card = panel.querySelector(`[data-role="${btn.dataset.saveRole}"]`);
    const body = {
      label: card.querySelector('[name="label"]').value,
      permissions: [...card.querySelectorAll('[name="perm"]:checked')].map(i => i.value),
    };
    try {
      await api(`/admin/roles/${btn.dataset.saveRole}`, { method: 'PATCH', body });
      say($('#roles-msg'), 'Rôle enregistré.', true);
    } catch (err) { say($('#roles-msg'), err.message); }
  }));
  panel.querySelectorAll('[data-del-role]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await api(`/admin/roles/${btn.dataset.delRole}`, { method: 'DELETE' });
      TAB_LOADERS.roles();
    } catch (err) { say($('#roles-msg'), err.message); }
  }));
  $('#new-role').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    try {
      await api('/admin/roles', { method: 'POST', body: { name: f.namedItem('name').value, label: f.namedItem('label').value } });
      TAB_LOADERS.roles();
    } catch (err) { say($('#roles-msg'), err.message); }
  });
};

TAB_LOADERS.visibility = async () => {
  const [{ levels }, roles] = await Promise.all([api('/admin/visibility'), loadRoles()]);
  const panel = document.querySelector('[data-panel="visibility"]');
  panel.innerHTML = `
    <p class="muted">Pour chaque niveau de visibilité, cochez les rôles qui voient les galeries concernées.</p>
    <p id="vis-msg" class="muted" role="status"></p>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Niveau</th>${roles.map(r => `<th>${esc(r.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${levels.map(l => `
        <tr data-level="${l.visibility}">
          <td>${esc(l.visibility)}</td>
          ${roles.map(r => `<td><input type="checkbox" name="role" value="${r.id}"${l.roleIds.includes(r.id) ? ' checked' : ''}></td>`).join('')}
          <td><button class="secondary" data-save-level="${l.visibility}">Enregistrer</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`;

  panel.querySelectorAll('[data-save-level]').forEach(btn => btn.addEventListener('click', async () => {
    const row = panel.querySelector(`[data-level="${btn.dataset.saveLevel}"]`);
    const roleIds = [...row.querySelectorAll('[name="role"]:checked')].map(i => Number(i.value));
    try {
      await api(`/admin/visibility/${btn.dataset.saveLevel}`, { method: 'PUT', body: { roleIds } });
      say($('#vis-msg'), `Niveau « ${btn.dataset.saveLevel} » enregistré.`, true);
    } catch (err) { say($('#vis-msg'), err.message); }
  }));
};

TAB_LOADERS.posts = async () => {
  const { posts } = await api('/posts/manage');
  const panel = document.querySelector('[data-panel="posts"]');
  const card = p => `
    <section class="card" data-post="${p.id}">
      <div class="field"><label>Titre</label><input name="title" value="${esc(p.title)}"></div>
      <div class="field"><label>Texte</label><textarea name="body" rows="5">${esc(p.body)}</textarea></div>
      <label class="check"><input type="checkbox" name="published"${p.published ? ' checked' : ''}> Publié</label>
      <p class="inline">
        <button data-save-post="${p.id}">Enregistrer</button>
        <button class="secondary" data-del-post="${p.id}">Supprimer</button>
      </p>
    </section>`;
  panel.innerHTML = `
    <p id="posts-msg" class="muted" role="status"></p>
    <button class="toggle" data-toggle="box-post">+ Nouveau billet</button>
    <section class="card" id="box-post" hidden>
    <form id="new-post">
      <div class="field"><label>Titre</label><input name="title" required></div>
      <div class="field"><label>Texte</label><textarea name="body" rows="5"></textarea></div>
      <label class="check"><input type="checkbox" name="published"> Publier</label>
      <p><button type="submit">Créer</button></p>
    </form>
    </section>
    ${posts.map(card).join('')}`;

  $('#new-post').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/posts', { method: 'POST', body: { title: field(f, 'title').value, body: field(f, 'body').value, published: field(f, 'published').checked } });
      TAB_LOADERS.posts();
    } catch (err) { say($('#posts-msg'), err.message); }
  });
  panel.querySelectorAll('[data-save-post]').forEach(btn => btn.addEventListener('click', async () => {
    const card = panel.querySelector(`[data-post="${btn.dataset.savePost}"]`);
    try {
      await api(`/posts/${btn.dataset.savePost}`, {
        method: 'PATCH',
        body: {
          title: card.querySelector('[name="title"]').value,
          body: card.querySelector('[name="body"]').value,
          published: card.querySelector('[name="published"]').checked,
        },
      });
      say($('#posts-msg'), 'Billet enregistré.', true);
    } catch (err) { say($('#posts-msg'), err.message); }
  }));
  panel.querySelectorAll('[data-del-post]').forEach(btn => btn.addEventListener('click', async () => {
    await api(`/posts/${btn.dataset.delPost}`, { method: 'DELETE' }).catch(() => {});
    TAB_LOADERS.posts();
  }));
};

TAB_LOADERS.settings = async () => {
  const { settings } = await api('/admin/settings');
  const panel = document.querySelector('[data-panel="settings"]');
  const shown = settings.metadata_fields || [];
  panel.innerHTML = `
    <form id="settings-form">
      <div class="field"><label>Nom du club</label><input name="club_name" value="${esc(settings.club_name || '')}" required></div>
      <h2>Métadonnées affichées dans les galeries</h2>
      <div class="checks">${Object.entries(METADATA_LABELS).map(([key, label]) => `
        <label class="check"><input type="checkbox" name="field" value="${key}"${shown.includes(key) ? ' checked' : ''}> ${esc(label)}</label>`).join('')}
      </div>
      <p><button type="submit">Enregistrer</button> <span id="settings-msg" class="muted" role="status"></span></p>
    </form>`;

  $('#settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const fields = [...f.querySelectorAll('[name="field"]:checked')].map(i => i.value);
    try {
      await api('/admin/settings/club_name', { method: 'PUT', body: { value: field(f, 'club_name').value.trim() } });
      await api('/admin/settings/metadata_fields', { method: 'PUT', body: { value: fields } });
      say($('#settings-msg'), 'Réglages enregistrés.', true);
    } catch (err) { say($('#settings-msg'), err.message); }
  });
};

async function pageAdmin() {
  if (!requireLogin()) return;
  const first = adminTabs();
  if (first) openTab(first);
}

// ---------- Boutons qui affichent un formulaire ----------
// <button data-toggle="ID"> bascule l'affichage de l'élément #ID
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const box = document.getElementById(btn.dataset.toggle);
  if (box) box.hidden = !box.hidden;
});

// ---------- Démarrage ----------
const PAGES = {
  home: pageHome,
  login: pageLogin,
  register: pageRegister,
  galleries: async () => { if (requireLogin()) await pageGalleries(); },
  gallery: async () => { if (requireLogin()) await pageGallery(); },
  contests: async () => {
    if (!requireLogin()) return;
    if (qs('id')) await pageContest();
    else await pageContests();
  },
  admin: pageAdmin,
};

document.addEventListener('DOMContentLoaded', async () => {
  renderHeader();
  await loadMe();
  renderHeader();
  const run = PAGES[document.body.dataset.page];
  if (!run) return;
  try {
    await run();
  } catch (err) {
    console.error(err);
    const main = $('#main');
    if (main) main.insertAdjacentHTML('afterbegin', `<p class="muted">${esc(err.message)}</p>`);
  }
});
