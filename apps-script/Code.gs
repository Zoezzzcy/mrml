/**
 * MRML 录分 — receives one finished game from the website and adds it to All_Games.
 * Deployed as a Web app (Execute as: Me, Who has access: Anyone).
 * After editing: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL stays the same).
 */

const GAMES_TAB = 'All_Games';
const SEASONS_TAB = 'Dim_Seasons';
const PLAYERS_TAB = 'Dim_Players';
const SHEET_ID = '1vcRSRL1m5N8vQ11yca-mJo3MCVBbzCCBS4IUNi5240E';

function doGet() {
  return json_({ ok: true, service: 'MRML score entry' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, code: 'bad_request' }); }


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
    // Match how dates are already kept in the sheet. A real date is made at midnight in the
    // SHEET's time zone, so it shows as the same day whatever time zone the script runs in.
    const dateCell = prevDate instanceof Date
      ? Utilities.parseDate(iso, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
      : `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`;

    const row = [dateCell];
    players.forEach((p) => row.push(p.name, p.score, p.penalty ? p.penalty : ''));
    const target = last + 1;
    if (last >= 2) sh.getRange(last, 1, 1, 13).copyTo(sh.getRange(target, 1, 1, 13), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    if (!(prevDate instanceof Date)) sh.getRange(target, 1).setNumberFormat('@');
    sh.getRange(target, 1, 1, 13).setValues([row]);
    // Column N is the sheet's own "Total Point Check": carry its formula down like the rows above.
    const prevN = last >= 2 ? sh.getRange(last, 14) : null;
    if (prevN && prevN.getFormula()) prevN.copyTo(sh.getRange(target, 14));
    else sh.getRange(target, 14).setValue(players.reduce((t, p) => t + p.score, 0));
    // When, who entered it, and the note — in O, P, Q.
    ensureHeaders_(sh);
    sh.getRange(target, 15, 1, 3).setValues([[new Date(), String(body.by || '').trim().slice(0, 40), note]]);
    // Mark the four players Active for this season in Dim_Players (new names get a new Player ID).
    // (Never let this stop the game from being saved.)
    try { markActive_(ss, season.id, players.map((p) => p.name)); } catch (err) { console.error('markActive_ failed: ' + err); }
    SpreadsheetApp.flush();

    if (sid) cache.put('sub:' + sid, '1', 21600);
    return json_({ ok: true, row: target, season: season.id });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Dim_Players: column A Player ID, B Player Name, then one column per season headed "Season N".
 * Sets "Active" in the game's season column for each name; adds the season column if it's missing,
 * and adds a row (next Player ID) for a name that isn't listed yet. Names match ignoring case and spaces.
 */
function markActive_(ss, seasonId, names) {
  const sh = ss.getSheetByName(PLAYERS_TAB);
  if (!sh) return;
  const norm = (n) => String(n || '').toLowerCase().replace(/\s+/g, '');
  const lastCol = Math.max(sh.getLastColumn(), 2);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h).trim());
  let col = header.findIndex((h) => norm(h) === norm('Season ' + seasonId)) + 1;
  if (!col) { col = lastCol + 1; sh.getRange(1, col).setValue('Season ' + seasonId); }
  const n = Math.max(sh.getLastRow() - 1, 0);
  const rows = n ? sh.getRange(2, 1, n, 2).getValues() : [];
  let nextId = rows.reduce((m, r) => Math.max(m, Number(String(r[0]).trim()) || 0), 0) + 1;
  const marks = n ? sh.getRange(2, col, n, 1).getValues() : [];
  let changed = false;
  const added = [];
  names.forEach((name) => {
    const i = rows.findIndex((r) => norm(r[1]) === norm(name));
    if (i >= 0) {
      if (i < n && String(marks[i][0]).trim() !== 'Active') { marks[i][0] = 'Active'; changed = true; }
    } else {
      added.push([nextId, name]);
      rows.push([nextId, name]);
      nextId++;
    }
  });
  if (changed) sh.getRange(2, col, n, 1).setValues(marks);
  if (added.length) {
    const r = sh.getLastRow() + 1;
    sh.getRange(r, 1, added.length, 2).setValues(added);
    sh.getRange(r, col, added.length, 1).setValues(added.map(() => ['Active']));
  }
}

/** One-off: mark Active for everyone who already has a game in each season (run once from the editor). */
function backfillActive() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const seasons = ss.getSheetByName(SEASONS_TAB).getDataRange().getValues().slice(1)
    .map((r) => ({ id: String(r[0]).trim(), start: toIso_(r[2], tz), end: toIso_(r[3], tz) })).filter((x) => x.id && x.start && x.end);
  const games = ss.getSheetByName(GAMES_TAB).getDataRange().getValues().slice(1);
  const bySeason = {};
  games.forEach((g) => {
    const iso = toIso_(g[0], tz); if (!iso) return;
    const se = seasons.find((x) => x.start <= iso && iso <= x.end); if (!se) return;
    (bySeason[se.id] = bySeason[se.id] || new Set());
    [1, 4, 7, 10].forEach((c) => { const nm = String(g[c] || '').trim(); if (nm && !/^test/i.test(nm)) bySeason[se.id].add(nm); });
  });
  Object.keys(bySeason).forEach((id) => markActive_(ss, id, [...bySeason[id]]));
  Logger.log(Object.keys(bySeason).map((id) => 'Season ' + id + ': ' + [...bySeason[id]].join(', ')).join('\n'));
}

function ensureHeaders_(sh) {
  const h = sh.getRange(1, 15, 1, 3);
  const v = h.getValues()[0];
  if (!v[0] && !v[1] && !v[2]) h.setValues([['Entered_At', 'Entered_By', 'Note']]);
}

function findSeason_(ss, iso) {
  const tz = ss.getSpreadsheetTimeZone();
  const sh = ss.getSheetByName(SEASONS_TAB);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const start = toIso_(r[2], tz), end = toIso_(r[3], tz);
    if (start && end && start <= iso && iso <= end) return { id: r[0], startPoints: Number(r[4]) };
  }
  return null;
}

function toIso_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
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

