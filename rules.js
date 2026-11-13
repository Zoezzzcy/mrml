/*
 * MRML scoring rules shared by the website (index.html, mobile.html) and the score entry page.
 *
 * Sheet tabs it reads (all optional — a saved copy below is used when a tab is missing):
 *   Dim_Rules    rule_id | rule_name | start_points | return_points | float_line | floats | uma_1 | uma_2 | uma_3 | uma_4 | note
 *                One row per rule; a rule whose uma depends on how many players finish at or above
 *                float_line (e.g. 連盟 A 規) has one row per count in `floats` (1, 2, 3). Blank floats = fixed uma.
 *   Dim_Seasons  existing columns, plus: rule_id | final_rule_id | final_games | final_carryover | final_tie_rule | finalists
 *   Final_Games  season_id | game_no | date | p1_name | p1_score | p1_penalty | … | p4_penalty | entered_at | entered_by | note
 *
 * Points per game = (score − return_points) ÷ 1000 + uma + oka + penalty,
 * where oka = (return_points − start_points) × 4 ÷ 1000 goes to 1st. Tied players share the uma (and oka)
 * of the places they cover and both keep the higher place.
 */
(function (root) {
  const SHEET = '1vcRSRL1m5N8vQ11yca-mJo3MCVBbzCCBS4IUNi5240E';

  // Saved copy, used until the sheet has the new tabs (and whenever the sheet can't be read).
  const SAVED = {
    rules: [
      { rule_id: 'MRML30', rule_name: 'MRML 常规', start_points: 30000, return_points: 30000, float_line: '', floats: '', uma_1: 30, uma_2: 10, uma_3: -10, uma_4: -30, note: '' },
      { rule_id: 'MLEAGUE', rule_name: 'M规', start_points: 25000, return_points: 25000, float_line: '', floats: '', uma_1: 45, uma_2: 5, uma_3: -15, uma_4: -35, note: '' },
      { rule_id: 'RENMEI_A', rule_name: '连盟 A 规', start_points: 30000, return_points: 30000, float_line: 30000, floats: 1, uma_1: 12, uma_2: -1, uma_3: -3, uma_4: -8, note: '无一发·无里宝·无杠宝' },
      { rule_id: 'RENMEI_A', rule_name: '连盟 A 规', start_points: 30000, return_points: 30000, float_line: 30000, floats: 2, uma_1: 8, uma_2: 4, uma_3: -4, uma_4: -8, note: '' },
      { rule_id: 'RENMEI_A', rule_name: '连盟 A 规', start_points: 30000, return_points: 30000, float_line: 30000, floats: 3, uma_1: 8, uma_2: 3, uma_3: 1, uma_4: -12, note: '' }
    ],
    seasons: [
      { season_id: 3, rule_id: 'MRML30' },
      { season_id: 4, rule_id: 'MRML30', final_rule_id: 'RENMEI_A', final_games: 12, final_carryover: 0, final_tie_rule: 'split', finalists: 'Yuntong,Dustin,Zoe,Pludo' },
      { season_id: 5, rule_id: 'MLEAGUE' }
    ],
    games: [
      { season_id: 4, game_no: 1, date: '2026-11-07', p1_name: 'Yuntong', p1_score: 28200, p1_penalty: 0, p2_name: 'Dustin', p2_score: 30000, p2_penalty: 0, p3_name: 'Zoe', p3_score: 8500, p3_penalty: 0, p4_name: 'Pludo', p4_score: 53300, p4_penalty: 0, note: '' },
      { season_id: 4, game_no: 2, date: '2026-11-07', p1_name: 'Yuntong', p1_score: 23500, p1_penalty: 0, p2_name: 'Dustin', p2_score: 46500, p2_penalty: 0, p3_name: 'Zoe', p3_score: 33700, p3_penalty: 0, p4_name: 'Pludo', p4_score: 16300, p4_penalty: 0, note: '' },
      { season_id: 4, game_no: 3, date: '2026-11-07', p1_name: 'Yuntong', p1_score: 22400, p1_penalty: 0, p2_name: 'Dustin', p2_score: 25900, p2_penalty: 0, p3_name: 'Zoe', p3_score: 56400, p3_penalty: 0, p4_name: 'Pludo', p4_score: 15300, p4_penalty: 0, note: '' },
      { season_id: 4, game_no: 4, date: '2026-11-07', p1_name: 'Yuntong', p1_score: 41200, p1_penalty: 0, p2_name: 'Dustin', p2_score: 11000, p2_penalty: 0, p3_name: 'Zoe', p3_score: 38800, p3_penalty: 0, p4_name: 'Pludo', p4_score: 29000, p4_penalty: 0, note: '' }
    ]
  };

  // ---- CSV ----
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  const key = (h) => String(h || '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
  function objects(text) {
    const rows = parseCsv(text);
    if (!rows.length) return { header: [], rows: [] };
    const header = rows[0].map(key);
    const out = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== '')).map((r) => {
      const o = {}; header.forEach((h, i) => { if (h) o[h] = String(r[i] == null ? '' : r[i]).trim(); }); o.__first = String(r[0] || '').trim(); return o;
    });
    return { header, rows: out };
  }
  const num = (v) => { const s = String(v == null ? '' : v).replace(/[,\s]/g, '').replace('−', '-'); if (s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const isoDate = (v) => {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return '';
  };

  // Reads one tab; returns null if the tab isn't there. (An unknown tab name makes Google send the
  // first tab instead, so the header must contain the columns we expect.)
  async function fetchTab(name, mustHave) {
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(name);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const o = objects(await r.text());
      if (!mustHave.every((h) => o.header.includes(h))) return null;
      return o.rows;
    } catch (e) { return null; }
  }

  // ---- rules ----
  function buildRules(rows) {
    const out = {};
    rows.forEach((r) => {
      const id = String(r.rule_id || '').trim(); if (!id) return;
      const rule = out[id] || (out[id] = {
        id, name: String(r.rule_name || id).trim(), start: num(r.start_points) || 0,
        ret: num(r.return_points) != null ? num(r.return_points) : num(r.start_points) || 0,
        floatLine: num(r.float_line), note: '', uma: {}
      });
      if (r.note && String(r.note).trim()) rule.note = rule.note ? rule.note + '；' + String(r.note).trim() : String(r.note).trim();
      if (rule.floatLine == null && num(r.float_line) != null) rule.floatLine = num(r.float_line);
      const f = num(r.floats);
      rule.uma[f == null ? 'any' : String(f)] = [r.uma_1, r.uma_2, r.uma_3, r.uma_4].map((v) => num(v) || 0);
    });
    Object.values(out).forEach((rule) => { if (Object.keys(rule.uma).every((k) => k === 'any')) rule.floatLine = null; });
    return out;
  }

  // players: [{name, score, penalty}] in seat order → same order, each with place, floats, uma, oka, points.
  function scoreGame(players, rule) {
    const floats = rule.floatLine != null ? players.filter((p) => p.score >= rule.floatLine).length : null;
    const uma = (floats != null ? rule.uma[String(floats)] : null) || rule.uma.any || [0, 0, 0, 0];
    const oka = (rule.ret - rule.start) * 4 / 1000;
    const rows = players.map((p, i) => ({ ...p, seat: i + 1, penalty: Number(p.penalty) || 0 }));
    const order = rows.slice().sort((a, b) => b.score - a.score);
    for (let i = 0; i < 4;) {
      let j = i; while (j + 1 < 4 && order[j + 1].score === order[i].score) j++;
      let u = 0, o = 0;
      for (let p = i; p <= j; p++) { u += uma[p]; if (p === 0) o += oka; }
      const n = j - i + 1;
      for (let p = i; p <= j; p++) { order[p].place = i + 1; order[p].uma = u / n; order[p].oka = o / n; }
      i = j + 1;
    }
    rows.forEach((r) => {
      r.floats = floats;
      r.points = Math.round(((r.score - rule.ret) / 1000 + r.uma + r.oka + r.penalty) * 10) / 10;
    });
    return rows;
  }

  function seasonConfig(rows) {
    const out = {};
    rows.forEach((r) => {
      const id = num(r.season_id != null && r.season_id !== '' ? r.season_id : r.__first);
      if (id == null) return;
      const c = out[id] || (out[id] = { season: id });
      const set = (k, v) => { if (v !== '' && v != null) c[k] = v; };
      set('rule', String(r.rule_id || '').trim());
      set('finalRule', String(r.final_rule_id || '').trim());
      set('finalGames', num(r.final_games));
      set('carryover', num(r.final_carryover));
      set('tie', String(r.final_tie_rule || '').trim());
      const names = String(r.finalists || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      if (names.length) c.finalists = names;
    });
    return out;
  }

  function gameRows(rows) {
    const seen = {};
    return rows.map((r) => {
      const season = num(r.season_id); if (season == null) return null;
      const players = [1, 2, 3, 4].map((k) => ({ name: String(r['p' + k + '_name'] || '').trim(), score: num(r['p' + k + '_score']), penalty: num(r['p' + k + '_penalty']) || 0 }));
      if (players.some((p) => !p.name || p.score == null)) return null;
      seen[season] = (seen[season] || 0) + 1;
      return { season, game: num(r.game_no) || seen[season], date: isoDate(r.date), note: String(r.note || '').trim(), players };
    }).filter(Boolean);
  }

  // Everything the final pages need. source: 'live' when every part came from the sheet.
  async function loadFinals() {
    const [ruleRows, seasonRows, finalRows] = await Promise.all([
      fetchTab('Dim_Rules', ['rule_id', 'uma_1']),
      fetchTab('Dim_Seasons', []),
      fetchTab('Final_Games', ['season_id', 'p1_name', 'p1_score'])
    ]);
    const rules = Object.assign(buildRules(SAVED.rules), ruleRows && ruleRows.length ? buildRules(ruleRows) : {});
    const seasons = seasonConfig(SAVED.seasons);
    const liveSeasons = seasonRows ? seasonConfig(seasonRows) : {};
    Object.values(liveSeasons).forEach((c) => {
      if (!seasons[c.season]) seasons[c.season] = { season: c.season };
      // Only take the final settings from the sheet once its final_rule_id is filled in.
      if (c.finalRule) Object.assign(seasons[c.season], c);
      else if (c.rule) seasons[c.season].rule = c.rule;
    });
    const games = finalRows ? gameRows(finalRows) : gameRows(SAVED.games);
    return { rules, seasons, games, live: { rules: !!ruleRows, seasons: !!seasonRows, games: !!finalRows } };
  }

  root.MRMLRules = { SHEET, SAVED, parseCsv, objects, num, isoDate, fetchTab, buildRules, scoreGame, seasonConfig, gameRows, loadFinals };
})(window);
