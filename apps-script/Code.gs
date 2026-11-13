/**
 * MRML 录分 — receives one finished game from the website and adds it to All_Games.
 * Deployed as a Web app (Execute as: Me, Who has access: Anyone).
 * After editing: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL stays the same).
 */

const GAMES_TAB = 'All_Games';
const SEASONS_TAB = 'Dim_Seasons';
const PLAYERS_TAB = 'Dim_Players';
const RULES_TAB = 'Dim_Rules';
const FINALS_TAB = 'Final_Games';
const FINAL_HEADERS = ['season_id', 'game_no', 'date', 'p1_name', 'p1_score', 'p1_penalty', 'p2_name', 'p2_score', 'p2_penalty',
  'p3_name', 'p3_score', 'p3_penalty', 'p4_name', 'p4_score', 'p4_penalty', 'entered_at', 'entered_by', 'note'];
const SHEET_ID = '1vcRSRL1m5N8vQ11yca-mJo3MCVBbzCCBS4IUNi5240E';

function doGet() {
  return json_({ ok: true, service: 'MRML score entry', finals: true });
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

  // Final-stage games go to Final_Games (by season id, not by date) and never touch All_Games or Dim_Players.
  if (body.stage === 'final') return saveFinal_(ss, body, iso, players);

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

/** One final-stage game → a new row in Final_Games, numbered within its season. */
function saveFinal_(ss, body, iso, players) {
  const seasonId = Number(body.season_id);
  if (!Number.isFinite(seasonId)) return json_({ ok: false, code: 'no_season' });
  const cfg = finalConfig_(ss, seasonId);
  if (!cfg || !cfg.finalRule) return json_({ ok: false, code: 'no_final' });
  const note = String(body.note || '').trim().slice(0, 300);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cache = CacheService.getScriptCache();
    const sid = String(body.id || '').slice(0, 64);
    if (sid && cache.get('sub:' + sid)) return json_({ ok: true, duplicate: true });
    const sh = ensureFinalsTab_(ss);
    const n = Math.max(sh.getLastRow() - 1, 0);
    const prev = n ? sh.getRange(2, 1, n, 2).getValues() : [];
    const gameNo = prev.filter((r) => Number(r[0]) === seasonId).reduce((m, r) => Math.max(m, Number(r[1]) || 0), 0) + 1;
    const row = [seasonId, gameNo, iso];
    players.forEach((p) => row.push(p.name, p.score, p.penalty ? p.penalty : ''));
    row.push(new Date(), String(body.by || '').trim().slice(0, 40), note);
    const target = sh.getLastRow() + 1;
    sh.getRange(target, 3).setNumberFormat('@');
    sh.getRange(target, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    if (sid) cache.put('sub:' + sid, '1', 21600);
    return json_({ ok: true, row: target, season: seasonId, stage: 'final', game: gameNo });
  } finally {
    lock.releaseLock();
  }
}

function ensureFinalsTab_(ss) {
  let sh = ss.getSheetByName(FINALS_TAB);
  if (!sh) sh = ss.insertSheet(FINALS_TAB);
  if (!String(sh.getRange(1, 1).getValue()).trim()) {
    sh.getRange(1, 1, 1, FINAL_HEADERS.length).setValues([FINAL_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('C:C').setNumberFormat('@');
  }
  return sh;
}

/** Final settings for one season from Dim_Seasons (columns found by header name). */
function finalConfig_(ss, seasonId) {
  const v = ss.getSheetByName(SEASONS_TAB).getDataRange().getValues();
  const h = v[0].map((x) => String(x).trim().toLowerCase().replace(/[\s\-]+/g, '_'));
  const col = (name) => h.indexOf(name);
  for (let i = 1; i < v.length; i++) {
    if (Number(v[i][0]) !== seasonId) continue;
    const get = (name) => (col(name) >= 0 ? v[i][col(name)] : '');
    return { finalRule: String(get('final_rule_id')).trim(), finalists: String(get('finalists')).trim() };
  }
  return null;
}

/**
 * Run ONCE from the editor (choose setupFinals ▸ Run). Safe to run again: it only adds what's missing.
 *  - Dim_Rules: the scoring rules (MRML30, MLEAGUE, RENMEI_A with its 1/2/3-up uma rows).
 *  - Dim_Seasons: adds rule_id, final_rule_id, final_games, final_carryover, final_tie_rule, finalists
 *    and fills them for seasons 3–5 (Season 4 final: 連盟 A 規, 12 games, nothing carried, ties split).
 *  - Final_Games: header, plus the first four Season 4 final games (7 Nov 2026) if Season 4 has none yet.
 */
function setupFinals() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let rules = ss.getSheetByName(RULES_TAB);
  if (!rules) {
    rules = ss.insertSheet(RULES_TAB);
    rules.getRange(1, 1, 6, 11).setValues([
      ['rule_id', 'rule_name', 'start_points', 'return_points', 'float_line', 'floats', 'uma_1', 'uma_2', 'uma_3', 'uma_4', 'note'],
      ['MRML30', 'MRML 常规', 30000, 30000, '', '', 30, 10, -10, -30, ''],
      ['MLEAGUE', 'M规', 25000, 25000, '', '', 45, 5, -15, -35, ''],
      ['RENMEI_A', '连盟 A 规', 30000, 30000, 30000, 1, 12, -1, -3, -8, '无一发·无里宝·无杠宝'],
      ['RENMEI_A', '连盟 A 规', 30000, 30000, 30000, 2, 8, 4, -4, -8, ''],
      ['RENMEI_A', '连盟 A 规', 30000, 30000, 30000, 3, 8, 3, 1, -12, '']
    ]);
    rules.getRange(1, 1, 1, 11).setFontWeight('bold');
    rules.setFrozenRows(1);
  }

  const se = ss.getSheetByName(SEASONS_TAB);
  const wanted = ['rule_id', 'final_rule_id', 'final_games', 'final_carryover', 'final_tie_rule', 'finalists'];
  const norm = (x) => String(x).trim().toLowerCase().replace(/[\s\-]+/g, '_');
  let header = se.getRange(1, 1, 1, se.getLastColumn()).getValues()[0].map(norm);
  wanted.forEach((w) => { if (!header.includes(w)) { se.getRange(1, header.length + 1).setValue(w).setFontWeight('bold'); header.push(w); } });
  const fill = {
    3: { rule_id: 'MRML30' },
    4: { rule_id: 'MRML30', final_rule_id: 'RENMEI_A', final_games: 12, final_carryover: 0, final_tie_rule: 'split', finalists: 'Yuntong,Dustin,Zoe,Pludo' },
    5: { rule_id: 'MLEAGUE' }
  };
  const n = se.getLastRow() - 1;
  const ids = n > 0 ? se.getRange(2, 1, n, 1).getValues() : [];
  ids.forEach((r, i) => {
    const f = fill[Number(r[0])]; if (!f) return;
    Object.keys(f).forEach((k) => {
      const c = se.getRange(i + 2, header.indexOf(k) + 1);
      if (String(c.getValue()).trim() === '') c.setValue(f[k]);
    });
  });

  const fg = ensureFinalsTab_(ss);
  const m = Math.max(fg.getLastRow() - 1, 0);
  const has4 = m && fg.getRange(2, 1, m, 1).getValues().some((r) => Number(r[0]) === 4);
  if (!has4) {
    const g = [[28200, 30000, 8500, 53300], [23500, 46500, 33700, 16300], [22400, 25900, 56400, 15300], [41200, 11000, 38800, 29000]];
    const names = ['Yuntong', 'Dustin', 'Zoe', 'Pludo'];
    const rows = g.map((s, i) => [4, i + 1, '2026-11-07'].concat(...names.map((nm, k) => [nm, s[k], ''])).concat(['', 'setup', '']));
    fg.getRange(fg.getLastRow() + 1, 1, rows.length, FINAL_HEADERS.length).setValues(rows);
  }
  SpreadsheetApp.flush();
  Logger.log('Finals set up: Dim_Rules, Dim_Seasons columns, Final_Games.');
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

