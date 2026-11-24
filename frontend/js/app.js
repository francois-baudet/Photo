/* Front du club photo, branché sur l'API.
   Session par cookie HttpOnly : rien n'est stocké dans le navigateur.
   Chaque page appelle sa fonction selon l'attribut data-page du <body>. */

const API = '/api';
const VISIBILITIES = ['public', 'membres', 'concours', 'jury', 'admin'];
const UPLOAD_ACCESS_LABELS = {
  proprietaire: 'Propriétaire et gestionnaires seulement',
  membres: 'Tous les membres autorisés à déposer',
};
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
  sens_invalide: 'Sens de rotation invalide.',
  pas_d_apercu: 'Cette photo n’a pas d’aperçu à faire pivoter.',
  changement_mot_de_passe_requis: 'Vous devez d’abord changer votre mot de passe.',
  mot_de_passe_identique: 'Le nouveau mot de passe doit être différent de l’ancien.',
  mot_de_passe_actuel_incorrect: 'Le mot de passe actuel est incorrect.',
  email_invalide: 'Adresse e-mail invalide.',
  email_deja_utilise: 'Cette adresse e-mail est déjà utilisée.',
  deja_note:'Vous avez déjà noté cette photo : la note est définitive.',
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
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: { username: field(form, 'user').value.trim(), password: field(form, 'pwd').value },
      });
      // Mot de passe provisoire : changement obligatoire avant d'aller plus loin
      location.href = user.mustChangePassword ? '/pages/mot-de-passe.html' : '/index.html';
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
          email: field(form, 'email').value.trim(),
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
  $('#g-upload').innerHTML = Object.entries(UPLOAD_ACCESS_LABELS)
    .map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/galleries', {
        method: 'POST',
        body: {
          title: field(form, 'title').value,
          visibility: field(form, 'visibility').value,
          uploadAccess: field(form, 'uploadAccess').value,
        },
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
    ? photos.map((p, i) => `
        <figure class="photo">
          <button class="thumb-btn" data-lb="${i}" aria-label="Agrandir ${esc(p.title)}">
            <div class="thumb" style="${p.thumbUrl ? `background-image:url('${p.thumbUrl}');background-size:cover;background-position:center` : ''}"></div>
          </button>
          <figcaption class="info">
            ${esc(p.title)}
            ${p.canRotate || p.canDelete || p.rawUrl ? `<button class="tool-btn" data-tools="${i}" title="Outils de la photo" aria-label="Outils de la photo">🔧</button>` : ''}
          </figcaption>
        </figure>`).join('')
    : '<p class="muted">Aucune photo pour le moment.</p>';

  registerLightbox(photos);

  document.querySelectorAll('[data-tools]').forEach(btn => btn.addEventListener('click', () => openToolsModal(photos[Number(btn.dataset.tools)])));

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
    // Le dépôt se règle sur les galeries classiques ; une galerie de concours suit les règles du concours
    const uploadField = field(edit, 'uploadAccess');
    uploadField.closest('.field').hidden = gallery.kind !== 'classique';
    uploadField.innerHTML = Object.entries(UPLOAD_ACCESS_LABELS)
      .map(([v, label]) => `<option value="${v}"${v === gallery.uploadAccess ? ' selected' : ''}>${esc(label)}</option>`).join('');
    edit.addEventListener('submit', async e => {
      e.preventDefault();
      const body = { visibility: field(edit, 'visibility').value };
      if (gallery.kind === 'classique') body.uploadAccess = uploadField.value;
      try {
        await api(`/galleries/${id}`, { method: 'PATCH', body });
        say($('#visibility-msg'), 'Réglages enregistrés.', true);
      } catch (err) {
        say($('#visibility-msg'), err.message);
      }
    });
  }

  if (gallery.canDownload && photos.length) setupDownload(id, photos);

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

// ---------- Téléchargement : liste cochable des fichiers RAW, archive ZIP ----------
function setupDownload(galleryId, photos) {
  $('#btn-download').hidden = false;
  const list = $('#download-list');
  list.innerHTML = photos.map(p => `
    <label class="check"><input type="checkbox" name="dl" value="${p.id}"> ${esc(p.title || '(sans titre)')}${p.rawExt ? ` <span class="muted">${esc(p.rawExt)}</span>` : ''}</label>`).join('');
  const boxes = () => [...list.querySelectorAll('input[name="dl"]')];
  $('#dl-all').addEventListener('click', () => boxes().forEach(b => { b.checked = true; }));
  $('#dl-none').addEventListener('click', () => boxes().forEach(b => { b.checked = false; }));
  $('#dl-go').addEventListener('click', () => {
    const ids = boxes().filter(b => b.checked).map(b => b.value);
    if (!ids.length) return say($('#download-msg'), 'Aucun fichier sélectionné.');
    // Le serveur contrôle la permission et la visibilité ; la réponse est une pièce jointe ZIP
    location.href = `${API}/galleries/${galleryId}/download?ids=${ids.join(',')}`;
    say($('#download-msg'), `Téléchargement de ${ids.length} fichier(s) lancé.`, true);
  });
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
      if (!confirm(next === 'ouvert'
        ? 'Ouvrir le concours ? Les membres invités pourront alors noter.'
        : 'Clôturer le concours ? Plus aucune note ne pourra être donnée ni modifiée, et toutes les notes seront visibles.')) return;
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
  await renderContestActions(contest, id);
  renderPhotos(contest, photos);
  // Moyennes et classements : seulement quand les notes sont visibles (réglage du concours)
  if (contest.notesVisible) {
    $('#ranking-block').hidden = false;
    await renderRanking(id);
  } else {
    $('#ranking-block').hidden = true;
    view.insertAdjacentHTML('beforeend',
      '<p class="muted">Les moyennes et les classements seront publiés à la clôture du concours.</p>');
  }
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

// Filtre et tri de la liste des photos selon MES notes. Choix conservés pendant la session de page.
let PHOTO_FILTER = 'toutes'; // toutes | notees | non_notees
let PHOTO_SORT = 'ordre';    // ordre | desc | asc  (photos non notées toujours en fin de liste)

function hasMyScore(p) {
  return p.myScore !== null && p.myScore !== undefined;
}

function filterAndSortPhotos(photos) {
  let list = photos.filter(p => {
    if (PHOTO_FILTER === 'notees') return hasMyScore(p);
    if (PHOTO_FILTER === 'non_notees') return !hasMyScore(p);
    return true;
  });
  if (PHOTO_SORT !== 'ordre') {
    const dir = PHOTO_SORT === 'desc' ? -1 : 1;
    list = list.slice().sort((a, b) => {
      if (!hasMyScore(a) || !hasMyScore(b)) return hasMyScore(a) === hasMyScore(b) ? 0 : (hasMyScore(a) ? -1 : 1);
      return dir * (a.myScore - b.myScore);
    });
  }
  return list;
}

function renderPhotos(contest, photos) {
  // Filtre et tri utiles à qui note (membre ou juré)
  const canFilter = (contest.me.member || contest.me.juror) && photos.length > 0;
  $('#contest-photos').innerHTML = photos.length
    ? `${canFilter ? `
         <div class="inline photo-tools">
           <label>Afficher <select id="photo-filter">
             <option value="toutes">toutes les photos</option>
             <option value="notees">notées par moi</option>
             <option value="non_notees">non notées par moi</option>
           </select></label>
           <label>Trier par <select id="photo-sort">
             <option value="ordre">ordre d’inscription</option>
             <option value="desc">ma note, décroissante</option>
             <option value="asc">ma note, croissante</option>
           </select></label>
         </div>` : ''}
       <div id="photo-table"></div>
       <p id="score-msg" class="muted" role="status"></p>`
    : '<p class="muted">Aucune photo inscrite pour le moment.</p>';
  if (!photos.length) return;

  if (canFilter) {
    $('#photo-filter').value = PHOTO_FILTER;
    $('#photo-sort').value = PHOTO_SORT;
    $('#photo-filter').addEventListener('change', e => { PHOTO_FILTER = e.target.value; drawPhotoTable(contest, photos); });
    $('#photo-sort').addEventListener('change', e => { PHOTO_SORT = e.target.value; drawPhotoTable(contest, photos); });
  }

  // Délégation : le tableau est redessiné à chaque filtre ou tri
  $('#photo-table').addEventListener('click', async e => {
    const btn = e.target.closest('[data-score]');
    if (!btn) return;
    const photoId = Number(btn.dataset.score);
    const value = $(`#photo-table [data-photo="${photoId}"]`).value;
    try {
      await api(`/contests/${contest.id}/scores`, { method: 'POST', body: { photoId, value: Number(value) } });
      say($('#score-msg'), 'Note enregistrée.', true);
      // Moyennes et classements recalculés après chaque vote
      await pageContest();
    } catch (err) {
      say($('#score-msg'), err.message);
    }
  });

  drawPhotoTable(contest, photos);
}

function drawPhotoTable(contest, photos) {
  const canScore = contest.me.canScore;
  const list = filterAndSortPhotos(photos);
  // Les vignettes ouvrent la visionneuse dans l'ordre affiché
  registerLightbox(list);

  // Une note par personne et par photo : une fois notée, la note reste affichée sans modification possible
  const rows = list.map((p, i) => {
    const ownPhoto = p.ownerId === ME.id && !contest.autoNotation;
    const hasScore = hasMyScore(p);
    let scoreCell = hasScore ? p.myScore : '—';
    if (canScore && !ownPhoto) {
      scoreCell = `<input type="number" min="0" max="20" step="0.5" value="${hasScore ? p.myScore : ''}" data-photo="${p.id}" style="width:80px"> <button data-score="${p.id}">${hasScore ? 'Modifier' : 'Noter'}</button>`;
    }
    const thumb = p.thumbUrl
      ? `<button class="thumb-btn" data-lb="${i}" aria-label="Agrandir ${esc(p.title)}"><div class="thumb mini" style="background-image:url('${p.thumbUrl}');background-size:cover"></div></button>`
      : '<div class="thumb mini"></div>';
    return `
      <tr>
        <td>${thumb}</td>
        <td>${esc(p.title)}<br><small class="muted">${esc(p.author)}</small></td>
        ${contest.notesVisible ? `<td>${p.memberAvg ?? '—'}</td><td>${p.juryAvg ?? '—'}</td>` : ''}
        <td>${scoreCell}</td>
      </tr>`;
  }).join('');

  // Les colonnes de moyennes n'existent que lorsque les notes sont visibles
  $('#photo-table').innerHTML = list.length
    ? `<div style="overflow-x:auto"><table>
         <thead><tr><th></th><th>Photo</th>${contest.notesVisible ? '<th>Moyenne membres</th><th>Moyenne jury</th>' : ''}<th>Ma note (0–20)</th></tr></thead>
         <tbody>${rows}</tbody></table></div>`
    : '<p class="muted">Aucune photo ne correspond à ce filtre.</p>';
}

async function renderRanking(contestId) {
  SCORES_CACHE = null; // les notes sont rechargées à chaque affichage des classements
  const ranking = await api(`/contests/${contestId}/ranking`).catch(() => null);
  if (!ranking) return;
  const table = (rows, kind) => rows.length
    ? `<table><thead><tr><th>Rang</th><th>Photo</th><th>Moyenne</th></tr></thead><tbody>${
        rows.map(r => `<tr><td>${r.rank}</td><td>${esc(r.title)} <small class="muted">${esc(r.author)}</small></td><td class="hoverable" data-score-photo="${r.photoId}" data-score-kind="${kind}" data-contest="${contestId}">${r.average ?? '—'}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="muted">Aucun résultat.</p>';
  $('#ranking').innerHTML = `
    <div class="card"><h2>Classement par les membres</h2>${table(ranking.byMembers, 'membre')}</div>
    <div class="card"><h2>Classement par le jury</h2>${table(ranking.byJury, 'jury')}</div>`;
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

// Carte de modification d'un utilisateur : tous les champs, plus la réinitialisation du mot de passe
function userEditCard(u, roles) {
  return `
    <section class="card" id="edit-user-${u.id}" hidden>
      <h3>Modifier ${esc(u.username)}</h3>
      <div class="field"><label>Identifiant</label><input name="username" value="${esc(u.username)}" required></div>
      <div class="field"><label>Nom affiché</label><input name="displayName" value="${esc(u.displayName)}" required></div>
      <div class="field"><label>E-mail (optionnel)</label><input name="email" type="email" value="${esc(u.email || '')}"></div>
      <div class="field"><label>Rôle</label><select name="roleId">${roleOptions(roles, u.roleId)}</select></div>
      <label class="check"><input type="checkbox" name="active"${u.active ? ' checked' : ''}> Compte actif</label>
      <p class="inline">
        <button data-save-user="${u.id}">Enregistrer</button>
        <button class="secondary" data-reset-user="${u.id}">Réinitialiser le mot de passe</button>
      </p>
    </section>`;
}

TAB_LOADERS.users = async () => {
  const [{ users }, roles] = await Promise.all([api('/admin/users'), loadRoles()]);
  const panel = document.querySelector('[data-panel="users"]');
  panel.innerHTML = `
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Identifiant</th><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Actif</th><th>Mot de passe</th><th></th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td>${esc(u.username)}</td>
          <td>${esc(u.displayName)}</td>
          <td>${esc(u.email || '—')}</td>
          <td>${esc(u.role)}</td>
          <td>${u.active ? 'oui' : 'non'}</td>
          <td>${u.mustChangePassword ? '<span class="badge">à changer</span>' : ''}</td>
          <td><button class="secondary" data-toggle="edit-user-${u.id}">Modifier</button></td>
        </tr>`).join('')}</tbody>
    </table></div>
    ${users.map(u => userEditCard(u, roles)).join('')}
    <p id="users-msg" class="muted" role="status"></p>
    <button class="toggle" data-toggle="box-user">+ Nouvel utilisateur</button>
    <section class="card" id="box-user" hidden>
    <form id="new-user">
      <div class="field"><label>Identifiant</label><input name="username" required></div>
      <div class="field"><label>Nom affiché</label><input name="displayName"></div>
      <div class="field"><label>E-mail (optionnel)</label><input name="email" type="email"></div>
      <div class="field"><label>Mot de passe (optionnel : sinon un mot de passe provisoire est généré)</label><input name="password" type="password" minlength="8"></div>
      <div class="field"><label>Rôle</label><select name="roleId">${roleOptions(roles)}</select></div>
      <button type="submit">Créer</button>
    </form>
    </section>`;

  panel.querySelectorAll('[data-save-user]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.saveUser;
    const card = panel.querySelector(`#edit-user-${id}`);
    const body = {
      username: field(card, 'username').value.trim(),
      displayName: field(card, 'displayName').value.trim(),
      email: field(card, 'email').value.trim(),
      roleId: Number(field(card, 'roleId').value),
      active: field(card, 'active').checked,
    };
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
      TAB_LOADERS.users();
      say($('#users-msg'), 'Utilisateur enregistré.', true);
    } catch (err) { say($('#users-msg'), err.message); }
  }));

  panel.querySelectorAll('[data-reset-user]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm("Réinitialiser le mot de passe de cet utilisateur ? Un mot de passe provisoire sera généré, à changer à sa prochaine connexion.")) return;
    try {
      const { temporaryPassword } = await api(`/admin/users/${btn.dataset.resetUser}/reset-password`, { method: 'POST' });
      alert(`Mot de passe provisoire (à transmettre, affiché une seule fois) : ${temporaryPassword}`);
      TAB_LOADERS.users();
    } catch (err) { say($('#users-msg'), err.message); }
  }));

  $('#new-user').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const result = await api('/admin/users', {
        method: 'POST',
        body: {
          username: field(f, 'username').value.trim(),
          displayName: field(f, 'displayName').value.trim(),
          email: field(f, 'email').value.trim(),
          password: field(f, 'password').value,
          roleId: Number(field(f, 'roleId').value),
        },
      });
      alert(`Compte créé. Mot de passe provisoire (à transmettre, affiché une seule fois) : ${result.temporaryPassword}`);
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
    if (!confirm('Supprimer cette invitation ?')) return;
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
    if (!confirm('Supprimer ce rôle ?')) return;
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
    if (!confirm('Supprimer ce billet ?')) return;
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

// ---------- Visionneuse plein écran ----------
// Les vignettes cliquables (data-lb="index") ouvrent l'aperçu dans la liste enregistrée par registerLightbox.
let LB_ITEMS = [];

function registerLightbox(items) {
  LB_ITEMS = items.map(p => ({ id: p.id, title: p.title, previewUrl: p.previewUrl || null }));
}

function openMetadata(photoId, parent) {
  const modal = document.createElement('div');
  modal.className = 'meta-modal';
  modal.innerHTML = `<div class="meta-box" role="dialog" aria-label="Métadonnées">
      <div class="inline" style="justify-content:space-between"><strong>Métadonnées</strong>
        <button class="secondary" data-meta-close>Fermer</button></div>
      <div id="meta-body"><p class="muted">Chargement…</p></div>
    </div>`;
  parent.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-meta-close]')) close(); });

  api(`/photos/${photoId}/info`).then(({ metadata }) => {
    const rows = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== '');
    $('#meta-body').innerHTML = rows.length
      ? `<table>${rows.map(([k, v]) => `<tr><td class="muted">${esc(METADATA_LABELS[k] || k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
      : '<p class="muted">Aucune métadonnée affichée. Réglages dans le dashboard admin.</p>';
  }).catch(err => {
    $('#meta-body').innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  });
}

function openLightbox(startIndex) {
  if (!LB_ITEMS.length) return;
  let current = startIndex;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="lb-bar">
      <span class="lb-title"></span>
      <span class="lb-actions">
        <button class="lb-small" data-lb-info title="Métadonnées">ⓘ</button>
        <button class="lb-close" data-lb-close aria-label="Fermer">✕</button>
      </span>
    </div>
    <div class="lb-stage">
      <button class="lb-nav" data-lb-prev aria-label="Photo précédente">‹</button>
      <img alt="">
      <button class="lb-nav" data-lb-next aria-label="Photo suivante">›</button>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const img = overlay.querySelector('img');
  const show = () => {
    const item = LB_ITEMS[current];
    overlay.querySelector('.lb-title').textContent = item.title;
    img.alt = item.title;
    img.src = item.previewUrl || '';
    img.style.visibility = item.previewUrl ? 'visible' : 'hidden';
    overlay.querySelector('[data-lb-prev]').hidden = LB_ITEMS.length < 2;
    overlay.querySelector('[data-lb-next]').hidden = LB_ITEMS.length < 2;
  };
  const step = d => { current = (current + d + LB_ITEMS.length) % LB_ITEMS.length; show(); };
  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  };

  overlay.addEventListener('click', e => {
    if (e.target.closest('[data-lb-close]')) return close();
    if (e.target.closest('[data-lb-prev]')) return step(-1);
    if (e.target.closest('[data-lb-next]')) return step(1);
    if (e.target.closest('[data-lb-info]')) return openMetadata(LB_ITEMS[current].id, overlay);
    if (e.target.classList.contains('lb-stage')) close();
  });
  document.addEventListener('keydown', onKey);
  show();
}

document.addEventListener('click', e => {
  const thumb = e.target.closest('[data-lb]');
  if (thumb) openLightbox(Number(thumb.dataset.lb));
});

// ---------- Outils d'une photo : rotation, RAW, suppression ----------
function openToolsModal(p) {
  const modal = document.createElement('div');
  modal.className = 'meta-modal';
  const actions = [];
  if (p.canRotate) {
    actions.push('<button class="secondary" data-act="ccw">⟲ Rotation à gauche</button>');
    actions.push('<button class="secondary" data-act="cw">⟳ Rotation à droite</button>');
  }
  if (p.rawUrl) actions.push(`<a class="btn" href="${p.rawUrl}">Télécharger le RAW</a>`);
  if (p.canDelete) actions.push('<button class="secondary" data-act="delete">Supprimer la photo</button>');
  modal.innerHTML = `<div class="meta-box" role="dialog" aria-label="Outils de la photo">
      <div class="inline" style="justify-content:space-between"><strong>${esc(p.title)}</strong>
        <button class="secondary" data-act="close">Fermer</button></div>
      ${p.canRename ? `<form id="rename-form" class="inline" style="margin-top:12px">
        <input name="title" value="${esc(p.title)}" maxlength="120" required aria-label="Nouveau titre">
        <button type="submit">Renommer</button>
      </form>` : ''}
      <div class="tools-list">${actions.join('') || (p.canRename ? '' : '<p class="muted">Aucune action disponible.</p>')}</div>
      <p id="tools-msg" class="muted" role="status"></p>
    </div>`;
  document.body.appendChild(modal);

  const renameForm = modal.querySelector('#rename-form');
  if (renameForm) {
    renameForm.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await api(`/photos/${p.id}`, { method: 'PATCH', body: { title: field(renameForm, 'title').value.trim() } });
        location.reload();
      } catch (err) {
        say($('#tools-msg'), err.message);
      }
    });
  }

  const close = () => modal.remove();
  modal.addEventListener('click', async e => {
    if (e.target === modal) return close();
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') return close();
    if (act === 'cw' || act === 'ccw') {
      btn.disabled = true;
      try {
        await api(`/photos/${p.id}/rotate`, { method: 'POST', body: { direction: act } });
        location.reload();
      } catch (err) {
        btn.disabled = false;
        say($('#tools-msg'), err.message);
      }
    }
    if (act === 'delete') {
      if (!confirm('Supprimer cette photo définitivement ?')) return;
      try {
        await api(`/photos/${p.id}`, { method: 'DELETE' });
        location.reload();
      } catch (err) {
        say($('#tools-msg'), err.message);
      }
    }
  });
}

// ---------- Survol des moyennes : détail des notes ----------
let SCORES_CACHE = null;

async function scoresFor(contestId, photoId) {
  if (!SCORES_CACHE) {
    const { scores } = await api(`/contests/${contestId}/scores`).catch(() => ({ scores: [] }));
    SCORES_CACHE = scores;
  }
  return SCORES_CACHE.filter(s => s.photoId === photoId);
}

function hidePopover() {
  const pop = document.getElementById('score-pop');
  if (pop) pop.hidden = true;
}

async function showPopover(cell) {
  let pop = document.getElementById('score-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'score-pop';
    pop.className = 'score-pop';
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
  }
  const kind = cell.dataset.scoreKind;
  const list = (await scoresFor(Number(cell.dataset.contest), Number(cell.dataset.scorePhoto)))
    .filter(s => s.kind === kind);
  if (!list.length) {
    pop.hidden = true;
    return;
  }
  pop.innerHTML = list.map(s => `<div class="score-val">${s.value}</div>`).join('');
  const r = cell.getBoundingClientRect();
  const maxLeft = window.scrollX + document.documentElement.clientWidth - 280;
  pop.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, maxLeft))}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  pop.hidden = false;
}

document.addEventListener('mouseover', e => {
  const cell = e.target.closest('[data-score-photo]');
  if (cell) showPopover(cell);
});
document.addEventListener('mouseout', e => {
  if (e.target.closest('[data-score-photo]')) hidePopover();
});
document.addEventListener('click', e => {
  const cell = e.target.closest('[data-score-photo]');
  if (cell) showPopover(cell);
  else if (!e.target.closest('#score-pop')) hidePopover();
});

// ---------- Actions de gestion d'un concours : conversion et suppression ----------
async function renderContestActions(contest, id) {
  if (!can(ME, 'contest:manage')) return;
  let html = '<div class="inline" style="margin-top:12px">';
  if (contest.status === 'clos') {
    html += '<button class="secondary" id="convert-contest">Transformer en galerie standard</button>';
  }
  html += '<button class="secondary" id="delete-contest">Supprimer le concours</button>';
  html += '<span id="contest-danger-msg" class="muted" role="status"></span></div>';
  $('#contest-view').insertAdjacentHTML('beforeend', html);

  const convert = $('#convert-contest');
  if (convert) {
    convert.addEventListener('click', async () => {
      if (!confirm("Transformer ce concours en galerie standard ? Les photos restent dans la galerie. Le concours et ses notes ne seront plus affichés dans l'onglet Concours.")) return;
      try {
        const result = await api(`/contests/${id}/convert`, { method: 'POST' });
        location.href = `/pages/galerie.html?id=${result.galleryId}`;
      } catch (err) {
        say($('#contest-danger-msg'), err.message);
      }
    });
  }

  $('#delete-contest').addEventListener('click', async () => {
    if (!confirm('Supprimer ce concours définitivement ? Toutes les notes seront perdues. Si le concours est encore de type concours, sa galerie et ses photos seront supprimées aussi.')) return;
    try {
      await api(`/contests/${id}`, { method: 'DELETE' });
      location.href = '/pages/concours.html';
    } catch (err) {
      say($('#contest-danger-msg'), err.message);
    }
  });
}

// ---------- Boutons qui affichent un formulaire ----------
// <button data-toggle="ID"> bascule l'affichage de l'élément #ID
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const box = document.getElementById(btn.dataset.toggle);
  if (box) box.hidden = !box.hidden;
});

// ---------- Changement de mot de passe ----------
function pagePassword() {
  const form = $('#password-form');
  if (!ME) {
    say($('#password-msg'), 'Connectez-vous pour changer votre mot de passe.');
    form.hidden = true;
    return;
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const current = field(form, 'current').value;
    const next = field(form, 'next').value;
    const confirmValue = field(form, 'confirm').value;
    if (next !== confirmValue) return say($('#password-msg'), 'Les deux mots de passe ne correspondent pas.');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      location.href = '/index.html';
    } catch (err) {
      say($('#password-msg'), err.message);
    }
  });
}

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
  password: pagePassword,
};

document.addEventListener('DOMContentLoaded', async () => {
  renderHeader();
  await loadMe();
  renderHeader();
  if (ME && ME.mustChangePassword && location.pathname !== '/pages/mot-de-passe.html') {
    location.href = '/pages/mot-de-passe.html';
    return;
  }
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
