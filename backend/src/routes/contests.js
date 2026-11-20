// Concours : création, invitations, dépôt des photos, notes 0 à 20, deux classements.
// Règles :
//  - le nombre de jurés est fixé à la création ; le concours ne s'ouvre que si ce nombre de jurés est atteint ;
//  - chaque photo reçoit une note de 0 à 20 de chaque juré et de chaque membre invité ;
//  - auto-notation et visibilité des notes sont des options du concours ;
//  - deux classements : par les membres, et par le jury (moyennes).
const router = require('express').Router();
const { query, withTransaction } = require('../db/pool');
const { requireAuth, requirePermission, hasPermission } = require('../middlewares/auth');

const NOTES_VISIBILITY = ['pendant', 'fin'];
const STATUSES = ['brouillon', 'ouvert', 'clos'];

const bad = (res, error) => res.status(400).json({ error });
const idList = value => Array.isArray(value) && value.every(Number.isInteger);

async function loadContest(id) {
  if (!Number.isInteger(id)) return null;
  const { rows } = await query('SELECT * FROM contests WHERE id = $1', [id]);
  return rows[0] || null;
}

async function membershipOf(contestId, userId) {
  const { rows } = await query(
    `SELECT
       EXISTS (SELECT 1 FROM contest_jurors WHERE contest_id = $1 AND user_id = $2) AS juror,
       EXISTS (SELECT 1 FROM contest_members WHERE contest_id = $1 AND user_id = $2) AS member`,
    [contestId, userId]
  );
  return rows[0];
}

// Les notes sont visibles pendant le concours si l'option le prévoit, sinon à la clôture.
function notesVisible(contest, user) {
  return contest.notes_visibility === 'pendant'
    || contest.status === 'clos'
    || hasPermission(user, 'contest:manage');
}

// Photos du concours avec moyennes (uniquement si les notes sont visibles)
async function contestPhotos(contest, user) {
  const { rows } = await query(
    `SELECT p.id, p.title, p.owner_id AS "ownerId", u.display_name AS author,
            p.thumb_path IS NOT NULL AS "hasThumb",
            (SELECT ROUND(AVG(s.value), 1) FROM scores s
              WHERE s.photo_id = p.id AND s.scorer_kind = 'membre')::float AS "memberAvg",
            (SELECT ROUND(AVG(s.value), 1) FROM scores s
              WHERE s.photo_id = p.id AND s.scorer_kind = 'jury')::float AS "juryAvg",
            (SELECT s.value::float FROM scores s
              WHERE s.photo_id = p.id AND s.scorer_id = $2) AS "myScore"
       FROM contest_photos cp
       JOIN photos p ON p.id = cp.photo_id
       JOIN users u ON u.id = p.owner_id
      WHERE cp.contest_id = $1
      ORDER BY p.id`,
    [contest.id, user.id]
  );
  const visible = notesVisible(contest, user);
  return rows.map(p => ({
    id: p.id,
    title: p.title,
    author: p.author,
    ownerId: p.ownerId,
    thumbUrl: p.hasThumb ? `/api/photos/${p.id}/thumb` : null,
    myScore: p.myScore,
    memberAvg: visible ? p.memberAvg : null,
    juryAvg: visible ? p.juryAvg : null,
  }));
}

// GET /api/contests : liste des concours (utilisateurs connectés)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.title, c.status, c.jury_count AS "juryCount",
            EXISTS (SELECT 1 FROM contest_jurors j WHERE j.contest_id = c.id AND j.user_id = $1) AS juror,
            EXISTS (SELECT 1 FROM contest_members m WHERE m.contest_id = c.id AND m.user_id = $1) AS member
       FROM contests c ORDER BY c.id DESC`,
    [req.user.id]
  );
  res.json({ contests: rows });
});

// POST /api/contests  { title, juryCount, autoNotation, notesVisibility, memberIds, jurorIds }
router.post('/', requireAuth, requirePermission('contest:manage'), async (req, res) => {
  const { title, juryCount, autoNotation, notesVisibility, memberIds = [], jurorIds = [] } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) return bad(res, 'titre_invalide');
  if (!Number.isInteger(juryCount) || juryCount < 1 || juryCount > 20) return bad(res, 'nombre_de_jures_invalide');
  if (notesVisibility !== undefined && !NOTES_VISIBILITY.includes(notesVisibility)) return bad(res, 'visibilite_notes_invalide');
  if (autoNotation !== undefined && typeof autoNotation !== 'boolean') return bad(res, 'auto_notation_invalide');
  if (!idList(memberIds) || !idList(jurorIds)) return bad(res, 'participants_invalides');

  try {
    const id = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO contests (title, jury_count, auto_notation, notes_visibility, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [title.trim(), juryCount, autoNotation === true, notesVisibility || 'fin', req.user.id]
      );
      const contestId = rows[0].id;
      for (const userId of memberIds) {
        await client.query(
          'INSERT INTO contest_members (contest_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [contestId, userId]
        );
      }
      for (const userId of jurorIds) {
        await client.query(
          'INSERT INTO contest_jurors (contest_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [contestId, userId]
        );
      }
      return contestId;
    });
    res.status(201).json({ id });
  } catch (err) {
    if (err.code === '23503') return bad(res, 'participant_inconnu');
    throw err;
  }
});

// GET /api/contests/people : utilisateurs actifs, pour composer un concours (contest:manage)
router.get('/people', requireAuth, requirePermission('contest:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.display_name AS "displayName", r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.active ORDER BY u.display_name`
  );
  res.json({ users: rows });
});

// GET /api/contests/:id : détail, photos et notes selon les règles de visibilité
router.get('/:id', requireAuth, async (req, res) => {
  const contest = await loadContest(Number(req.params.id));
  if (!contest) return res.status(404).json({ error: 'introuvable' });

  const me = await membershipOf(contest.id, req.user.id);
  const canManage = hasPermission(req.user, 'contest:manage');
  const canScoreNow = contest.status === 'ouvert' && (
    (me.juror && hasPermission(req.user, 'score:jury')) ||
    (me.member && !me.juror && hasPermission(req.user, 'score:member'))
  );

  const { rows: jurors } = await query(
    `SELECT u.id, u.display_name AS "displayName" FROM contest_jurors j
       JOIN users u ON u.id = j.user_id WHERE j.contest_id = $1 ORDER BY u.display_name`, [contest.id]);
  const { rows: members } = await query(
    `SELECT u.id, u.display_name AS "displayName" FROM contest_members m
       JOIN users u ON u.id = m.user_id WHERE m.contest_id = $1 ORDER BY u.display_name`, [contest.id]);

  res.json({
    contest: {
      id: contest.id,
      title: contest.title,
      status: contest.status,
      juryCount: contest.jury_count,
      autoNotation: contest.auto_notation,
      notesVisibility: contest.notes_visibility,
      notesVisible: notesVisible(contest, req.user),
      jurors: canManage ? jurors : jurors.length,
      members: canManage ? members : members.length,
      me: { juror: me.juror, member: me.member, canScore: canScoreNow },
    },
    photos: await contestPhotos(contest, req.user),
  });
});

// PATCH /api/contests/:id  { title?, status? }  (brouillon -> ouvert -> clos)
router.patch('/:id', requireAuth, requirePermission('contest:manage'), async (req, res) => {
  const contest = await loadContest(Number(req.params.id));
  if (!contest) return res.status(404).json({ error: 'introuvable' });

  const { title, status } = req.body || {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > 120)) {
    return bad(res, 'titre_invalide');
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return bad(res, 'statut_invalide');
    const order = STATUSES.indexOf(contest.status);
    if (STATUSES.indexOf(status) !== order + 1) return bad(res, 'transition_invalide');
    if (status === 'ouvert') {
      const { rows } = await query('SELECT COUNT(*)::int AS n FROM contest_jurors WHERE contest_id = $1', [contest.id]);
      if (rows[0].n !== contest.jury_count) return bad(res, 'jures_incomplets');
    }
  }
  await query(
    'UPDATE contests SET title = COALESCE($1, title), status = COALESCE($2, status) WHERE id = $3',
    [title ? title.trim() : null, status || null, contest.id]
  );
  res.json({ ok: true });
});

// POST /api/contests/:id/photos  { photoIds }  : ajouter ses propres photos
router.post('/:id/photos', requireAuth, requirePermission('contest:join'), async (req, res) => {
  const contest = await loadContest(Number(req.params.id));
  if (!contest) return res.status(404).json({ error: 'introuvable' });
  if (contest.status === 'clos') return bad(res, 'concours_clos');

  const { photoIds } = req.body || {};
  if (!idList(photoIds) || !photoIds.length) return bad(res, 'photos_invalides');

  const me = await membershipOf(contest.id, req.user.id);
  if (!me.member && !hasPermission(req.user, 'contest:manage')) return res.status(403).json({ error: 'acces_refuse' });

  const { rows: owned } = await query(
    'SELECT id FROM photos WHERE id = ANY($1) AND ($2 OR owner_id = $3)',
    [photoIds, hasPermission(req.user, 'contest:manage'), req.user.id]
  );
  if (owned.length !== photoIds.length) return bad(res, 'photo_non_autorisee');

  for (const photoId of photoIds) {
    await query(
      'INSERT INTO contest_photos (contest_id, photo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [contest.id, photoId]
    );
  }
  res.status(201).json({ ok: true });
});

// POST /api/contests/:id/scores  { photoId, value }  : note de 0 à 20
router.post('/:id/scores', requireAuth, async (req, res) => {
  const contest = await loadContest(Number(req.params.id));
  if (!contest) return res.status(404).json({ error: 'introuvable' });
  if (contest.status !== 'ouvert') return bad(res, 'concours_non_ouvert');

  const { photoId, value } = req.body || {};
  if (!Number.isInteger(photoId)) return bad(res, 'photo_invalide');
  const note = Number(value);
  if (!Number.isFinite(note) || note < 0 || note > 20) return bad(res, 'note_invalide');
  const rounded = Math.round(note * 10) / 10;

  const { rows: inContest } = await query(
    `SELECT p.owner_id FROM contest_photos cp JOIN photos p ON p.id = cp.photo_id
      WHERE cp.contest_id = $1 AND cp.photo_id = $2`,
    [contest.id, photoId]
  );
  if (!inContest[0]) return bad(res, 'photo_hors_concours');

  // Le juré note en tant que juré ; sinon le membre invité note en tant que membre
  const me = await membershipOf(contest.id, req.user.id);
  let kind = null;
  if (me.juror && hasPermission(req.user, 'score:jury')) kind = 'jury';
  else if (me.member && hasPermission(req.user, 'score:member')) kind = 'membre';
  if (!kind) return res.status(403).json({ error: 'non_autorise_a_noter' });

  if (!contest.auto_notation && inContest[0].owner_id === req.user.id) {
    return res.status(403).json({ error: 'auto_notation_interdite' });
  }

  await query(
    `INSERT INTO scores (contest_id, photo_id, scorer_id, scorer_kind, value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (contest_id, photo_id, scorer_id)
     DO UPDATE SET value = EXCLUDED.value, scorer_kind = EXCLUDED.scorer_kind`,
    [contest.id, photoId, req.user.id, kind, rounded]
  );
  res.json({ ok: true, kind, value: rounded });
});

// GET /api/contests/:id/ranking : deux classements (membres et jury), moyennes
router.get('/:id/ranking', requireAuth, async (req, res) => {
  const contest = await loadContest(Number(req.params.id));
  if (!contest) return res.status(404).json({ error: 'introuvable' });
  if (!notesVisible(contest, req.user)) return res.status(403).json({ error: 'notes_non_visibles' });

  const photos = await contestPhotos(contest, req.user);
  const rank = (key) => photos
    .slice()
    .sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))
    .map((p, i) => ({ rank: i + 1, photoId: p.id, title: p.title, author: p.author, average: p[key] }));

  res.json({
    byMembers: rank('memberAvg'),
    byJury: rank('juryAvg'),
  });
});

module.exports = router;
