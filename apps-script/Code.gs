/**
 * MRML 录分 — receives one finished game from the website and adds it to All_Games.
 * Deployed as a Web app (Execute as: Me, Who has access: Anyone).
 * After editing: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL stays the same).
 */

const LEAGUE_PIN = '改成你的口令';      // ← change me
const GAMES_TAB = 'All_Games';
const SEASONS_TAB = 'Dim_Seasons';
const SHEET_ID = '1vcRSRL1m5N8vQ11yca-mJo3MCVBbzCCBS4IUNi5240E';

function doGet() {
  return json_({ ok: true, service: 'MRML score entry' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, code: 'bad_request' }); }

  if (String(body.pin || '').trim() !== LEAGUE_PIN) return json_({ ok: false, code: 'bad_pin' });

  // Date: YYYY-MM-DD from the page.
  const m = String(body.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return json_({ ok: false, code: 'bad_date' });
  const y = +m[1], mo = +m[2], d = +m[3];
  const iso = m[0];

  // Players.
  const ps = Array.isArray(body.players) ? body.players : [];
  if (ps.length !== 4) return json_({ ok: false, code: 'need_four' });
  const players = ps.map((p) => ({
    name: String(p.name || '').trim().slice(0, 40),
    score: Number(p.score),
    penalty: p.penalty === '' || p.penalty == null ? 0 : Number(p.penalty)
  }));
  if (players.some((p) => !p.name)) return json_({ ok: false, code: 'missing_name' });
  if (new Set(players.map((p) => p.name.toLowerCase())).size !== 4) return json_({ ok: false, code: 'duplicate_name' });
  if (players.some((p) => !Number.isFinite(p.score) || p.score % 100 !== 0)) return json_({ ok: false, code: 'bad_score' });
  if (players.some((p) => !Number.isFinite(p.penalty))) return json_({ ok: false, code: 'bad_penalty' });

  const ss = SpreadsheetApp.openById(SHEET_ID);

  const season = findSeason_(ss, iso);
  if (!season) return json_({ ok: false, code: 'no_season' });
  // Scores that don't balance (foul, sticks left…) are accepted; the dashboard lists them under score checks.
  const note = String(body.note || '').trim().slice(0, 300);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Same submission sent twice (double tap, retry) → only keep the first.
    const cache = CacheService.getScriptCache();
    const sid = String(body.id || '').slice(0, 64);
    if (sid && cache.get('sub:' + sid)) return json_({ ok: true, duplicate: true });

    const sh = ss.getSheetByName(GAMES_TAB);
    const last = sh.getLastRow();
    const prevDate = last >= 2 ? sh.getRange(last, 1).getValue() : null;
    // Match how dates are already kept in the sheet (real dates, or text like 7/11/2026).
    const dateCell = prevDate instanceof Date ? new Date(y, mo - 1, d) : `${d}/${mo}/${y}`;

    const row = [dateCell];
    players.forEach((p) => row.push(p.name, p.score, p.penalty ? p.penalty : ''));
    const target = last + 1;
    if (last >= 2) sh.getRange(last, 1, 1, 13).copyTo(sh.getRange(target, 1, 1, 13), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    if (!(prevDate instanceof Date)) sh.getRange(target, 1).setNumberFormat('@');
    sh.getRange(target, 1, 1, 13).setValues([row]);
    // When, who entered it, and the note — kept to the right of the game columns (N, O, P).
    sh.getRange(target, 14, 1, 3).setValues([[new Date(), String(body.by || '').trim().slice(0, 40), note]]);
    SpreadsheetApp.flush();

    if (sid) cache.put('sub:' + sid, '1', 21600);
    return json_({ ok: true, row: target, season: season.id });
  } finally {
    lock.releaseLock();
  }
}

function findSeason_(ss, iso) {
  const sh = ss.getSheetByName(SEASONS_TAB);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const start = toIso_(r[2]), end = toIso_(r[3]);
    if (start && end && start <= iso && iso <= end) return { id: r[0], startPoints: Number(r[4]) };
  }
  return null;
}

function toIso_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
