/*
 * The Final view (#view-final) for index.html and mobile.html.
 * Reads Final_Games / Dim_Rules / Dim_Seasons through rules.js and draws the final of the season
 * picked in the header. Regular-season standings never see these games.
 */
(function () {
  const R = window.MRMLRules;
  let F = null; // { rules, seasons, games, live }
  const COLORS = ['#126724', '#CD0000', '#17A2B8', '#B86E14'];

  // Start with the saved copy, then swap in the sheet.
  F = { rules: R.buildRules(R.SAVED.rules), seasons: R.seasonConfig(R.SAVED.seasons), games: R.gameRows(R.SAVED.games), live: {} };
  R.loadFinals().then((d) => { F = d; dash.setParams({}); }).catch(() => {});

  const mr = () => window.mr;
  const t = (zh, ja, en) => mr().t(zh, ja, en);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  const pts = (v) => mr().fmtPts(v);
  const placeBadge = (p) => { const b = el('span', 'mr-rk' + (p === 1 ? ' mr-rk1' : p === 4 ? ' mr-rk4' : ''), String(p)); return b; };

  // Everything about one season's final, worked out from the rules.
  function finalFor(season) {
    if (!F) return null;
    const cfg = F.seasons[season];
    if (!cfg || !cfg.finalRule) return null;
    const rule = F.rules[cfg.finalRule];
    if (!rule) return { cfg, rule: null };
    const games = F.games.filter((g) => g.season === season).sort((a, b) => a.game - b.game)
      .map((g) => ({ ...g, rows: R.scoreGame(g.players, rule) }));
    const names = (cfg.finalists && cfg.finalists.length ? cfg.finalists.slice() : []);
    games.forEach((g) => g.rows.forEach((r) => { if (!names.includes(r.name)) names.push(r.name); }));
    // Regular-season points carried in (0 = start from zero).
    const ratio = Number(cfg.carryover) || 0;
    const st = dash.data('standings');
    const carry = {};
    names.forEach((n) => {
      const row = ratio && st.status === 'ok' && Array.isArray(st.data) ? st.data.find((r) => r.season === season && r.player === n) : null;
      carry[n] = row ? Math.round(row.points * ratio * 10) / 10 : 0;
    });
    const players = names.map((n) => {
      const mine = games.map((g) => g.rows.find((r) => r.name === n)).filter(Boolean);
      const sum = mine.reduce((a, r) => a + r.points, 0);
      const places = [1, 2, 3, 4].map((p) => mine.filter((r) => r.place === p).length);
      return {
        name: n, carry: carry[n], games: mine.length, places,
        avg: mine.length ? mine.reduce((a, r) => a + r.place, 0) / mine.length : null,
        total: Math.round((carry[n] + sum) * 10) / 10
      };
    });
    players.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    players.forEach((p, i) => { p.rank = i && p.total === players[i - 1].total ? players[i - 1].rank : i + 1; p.gap = Math.round((players[0].total - p.total) * 10) / 10; });
    // Running totals after each game, for the chart.
    const line = names.map((n) => {
      let s = carry[n]; const pts0 = [{ game: 0, total: s }];
      games.forEach((g) => { const r = g.rows.find((x) => x.name === n); if (r) s = Math.round((s + r.points) * 10) / 10; pts0.push({ game: g.game, total: s }); });
      return { name: n, points: pts0 };
    });
    const planned = cfg.finalGames || games.length;
    return { cfg, rule, games, players, line, planned, left: Math.max(planned - games.length, 0) };
  }

  dash.draw('final-view', (box) => {
    box.replaceChildren();
    const season = mr().currentSeason();
    const sum = dash.data('season_summary');
    const srow = sum.status === 'ok' && Array.isArray(sum.data) ? sum.data.find((r) => r.season === season) : null;
    const sname = srow ? srow.season_name.replace(/\s*-.*/, '') : 'Season ' + season;
    const fin = finalFor(season);

    if (!fin || !fin.rule) {
      const c = el('section', 'mr-card');
      c.append(el('h2', null, t('决赛', '決勝', 'Final') + ' · ' + sname));
      c.append(el('p', 'mr-empty', !fin
        ? t('这个赛季还没有设置决赛。在表格 Dim_Seasons 的 final_rule_id 填上规则编号后就会显示在这里。', 'このシーズンの決勝はまだ設定されていません。Dim_Seasons の final_rule_id にルールIDを入れると表示されます。', 'No final is set up for this season yet. Fill in final_rule_id in the Dim_Seasons tab and it will show here.')
        : t('找不到规则「' + fin.cfg.finalRule + '」：请在 Dim_Rules 里添加。', 'ルール「' + fin.cfg.finalRule + '」が Dim_Rules にありません。', 'Rule “' + fin.cfg.finalRule + '” isn’t in the Dim_Rules tab.')));
      box.append(c); return;
    }
    const { rule, games, players, planned, left } = fin;

    // ---- headline + standings
    const head = el('section', 'mr-card');
    const h = el('h2', null, sname + ' ' + t('决赛', '決勝', 'Final'));
    head.append(h);
    const done = games.length >= planned && planned > 0;
    const lead = players[0];
    let say;
    if (!games.length) say = t('决赛还没开始，共 ' + planned + ' 场。', '決勝はまだ始まっていません（全' + planned + '戦）。', 'The final hasn’t started yet — ' + planned + ' games.');
    else if (done) say = t('决赛结束，冠军是 ' + lead.name + '（' + pts(lead.total) + '）。', '決勝終了。優勝は ' + lead.name + '（' + pts(lead.total) + '）。', 'The final is over — ' + lead.name + ' wins with ' + pts(lead.total) + '.');
    else {
      const second = players[1];
      say = t(`已打 ${games.length} / ${planned} 场，还剩 ${left} 场。${lead.name} 暂列第一（${pts(lead.total)}）` + (second ? `，领先 ${second.name} ${Math.abs(second.gap).toFixed(1)}pt。` : '。'),
        `${planned}戦中${games.length}戦終了、残り${left}戦。${lead.name}が首位（${pts(lead.total)}）` + (second ? `、${second.name}に${Math.abs(second.gap).toFixed(1)}pt差。` : '。'),
        `${games.length} of ${planned} games played, ${left} to go. ${lead.name} leads on ${pts(lead.total)}` + (second ? `, ${Math.abs(second.gap).toFixed(1)}pt ahead of ${second.name}.` : '.'));
    }
    head.append(el('p', 'mr-take', say));

    const pod = el('div', 'mr-podium');
    players.forEach((p, i) => {
      const card = el('div', 'mr-pod');
      card.style.setProperty('--mr-accent', i === 0 ? '#CD0000' : '#126724');
      const top = el('div', 'mr-pod-top');
      top.append(el('span', 'mr-pod-rank', String(p.rank)));
      const nm = el('div', 'mr-pod-name');
      const btn = el('button', 'mr-link', p.name); btn.type = 'button'; btn.onclick = () => mr().openPlayer && mr().openPlayer(p.name);
      nm.append(btn); top.append(nm); card.append(top);
      card.append(el('div', 'mr-pod-pts' + (p.total < 0 ? ' mr-neg' : ''), pts(p.total)));
      const meta = el('div', 'mr-pod-meta');
      meta.textContent = (i === 0 ? t('领跑', '首位', 'Leading') : t('距第 1 ', '首位まで ', 'Behind 1st ') + p.gap.toFixed(1) + 'pt')
        + ' · ' + t('一位 ', 'トップ ', 'Wins ') + p.places[0];
      card.append(meta);
      pod.append(card);
    });
    head.append(pod);

    // table
    const sc = el('div', 'mr-scroll'); sc.style.marginTop = '14px';
    const tb = el('table', 'mr-table');
    const showCarry = (Number(fin.cfg.carryover) || 0) > 0;
    const cols = [['', ''], [t('选手', '選手', 'Player'), ''], [t('积分', 'pt', 'Points'), 'num']]
      .concat(showCarry ? [[t('带入', '持ち越し', 'Carried'), 'num']] : [])
      .concat([[t('距第 1', '首位差', 'Behind 1st'), 'num'], [t('场数', '対局', 'Games'), 'num'], ['1' + t('位', '位', 'st'), 'num'], ['2' + t('位', '位', 'nd'), 'num'], ['3' + t('位', '位', 'rd'), 'num'], ['4' + t('位', '位', 'th'), 'num'], [t('平均顺位', '平均順位', 'Avg place'), 'num']]);
    const thead = el('thead'); const trh = el('tr');
    cols.forEach(([c, k]) => trh.append(el('th', k, c))); thead.append(trh); tb.append(thead);
    const tbody = el('tbody');
    players.forEach((p) => {
      const tr = el('tr');
      const r0 = el('td'); r0.append(placeBadge(Math.min(p.rank, 4))); tr.append(r0);
      tr.append(el('td', null, p.name));
      tr.append(el('td', 'num' + (p.total < 0 ? ' mr-neg' : ''), pts(p.total)));
      if (showCarry) tr.append(el('td', 'num', pts(p.carry)));
      tr.append(el('td', 'num', p.gap ? '−' + p.gap.toFixed(1) : '—'));
      tr.append(el('td', 'num', String(p.games)));
      p.places.forEach((n) => tr.append(el('td', 'num', String(n))));
      tr.append(el('td', 'num', p.avg == null ? '—' : p.avg.toFixed(2)));
      tbody.append(tr);
    });
    tb.append(tbody); sc.append(tb); head.append(sc);
    box.append(head);

    // ---- running total chart
    if (games.length) {
      const cc = el('section', 'mr-card');
      cc.append(el('h2', null, t('积分走势', 'pt推移', 'Points after each game')));
      cc.append(el('p', 'mr-sub', t('横轴是决赛第几场，虚线以后是还没打的场次。', '横軸は決勝の何戦目か。点線の右はまだ未対局。', 'Across: final game number. Games to the right of the dashed line are still to play.')));
      const leg = el('div', 'mr-legend');
      fin.line.forEach((s, i) => { const it = el('span'); const sw = el('i'); sw.style.background = COLORS[i % 4]; it.append(sw, document.createTextNode(s.name)); leg.append(it); });
      cc.append(leg);
      const chart = el('div', 'mr-wchart'); cc.append(chart); box.append(cc);
      requestAnimationFrame(() => drawLine(chart, fin));
    }

    // ---- rules
    const rc = el('section', 'mr-card mr-rules');
    rc.append(el('h2', null, t('决赛规则', '決勝ルール', 'Final rules') + ' · ' + rule.name));
    const grid = el('div', 'mr-rulegrid');
    const ruleItem = (lbl, val) => { const d = el('div', 'mr-rule'); d.append(el('span', 'mr-rule-lbl', lbl), el('b', null, val)); grid.append(d); };
    ruleItem(t('起始点', '持ち点', 'Start'), mr().fmtInt(rule.start));
    ruleItem(t('返点', '返し', 'Return'), mr().fmtInt(rule.ret));
    ruleItem(t('场数', '対局数', 'Games'), String(planned));
    ruleItem(t('常规赛积分', 'リーグpt', 'Regular-season points'), showCarry ? t('带入 ', '持ち越し ', 'carry ') + Math.round(fin.cfg.carryover * 100) + '%' : t('不带入，从 0 开始', '持ち越しなし（0から）', 'not carried — everyone starts at 0'));
    ruleItem(t('同分', '同点', 'Ties'), t('平分马点', 'ウマを等分', 'share the uma'));
    rc.append(grid);
    const ut = el('table', 'mr-table'); ut.style.marginTop = '10px'; ut.style.width = 'auto';
    const uh = el('tr'); [rule.floatLine != null ? t('浮的人数', '浮き人数', 'Players at/above ' + mr().fmtInt(rule.floatLine)) : t('马点', 'ウマ', 'Uma'), '1' + t('位', '位', 'st'), '2' + t('位', '位', 'nd'), '3' + t('位', '位', 'rd'), '4' + t('位', '位', 'th')].forEach((c, i) => uh.append(el('th', i ? 'num' : null, c)));
    const uth = el('thead'); uth.append(uh); ut.append(uth);
    const ub = el('tbody');
    Object.keys(rule.uma).sort().forEach((k) => {
      const tr = el('tr');
      tr.append(el('td', null, k === 'any' ? t('固定', '固定', 'Fixed') : t(k + ' 人浮', k + '人浮き', k + ' up')));
      rule.uma[k].forEach((v) => tr.append(el('td', 'num' + (v < 0 ? ' mr-neg' : ''), sign(v))));
      ub.append(tr);
    });
    ut.append(ub);
    const us = el('div', 'mr-scroll'); us.append(ut); rc.append(us);
    const formula = rule.ret !== rule.start
      ? t('每场积分 =（终局点 − 返点）÷ 1000 + 马点 + 罚分；第 1 名另得 oka ', '各対局pt =（終局点 − 返し）÷ 1000 + ウマ + ペナルティ、トップにオカ ', 'Points = (score − return) ÷ 1,000 + uma + penalties; 1st also gets oka ') + sign((rule.ret - rule.start) * 4 / 1000) + 'pt'
      : t('每场积分 =（终局点 − 返点）÷ 1000 + 马点 + 罚分', '各対局pt =（終局点 − 返し）÷ 1000 + ウマ + ペナルティ', 'Points = (score − return) ÷ 1,000 + uma + penalties');
    rc.append(el('p', 'mr-sub', formula + (rule.floatLine != null ? t('。正好 ' + mr().fmtInt(rule.floatLine) + ' 也算浮。', '。ちょうど' + mr().fmtInt(rule.floatLine) + 'も浮きに数えます。', '. Exactly ' + mr().fmtInt(rule.floatLine) + ' counts as up.') : '')));
    if (rule.note) rc.append(el('p', 'mr-sub', rule.note));
    box.append(rc);

    // ---- games
    const gc = el('section', 'mr-card');
    gc.append(el('h2', null, t('每场结果', '対局結果', 'Games')));
    if (!games.length) gc.append(el('p', 'mr-empty', t('还没有决赛对局。', '決勝の対局はまだありません。', 'No final games yet.')));
    const wrap = el('div', 'mr-games');
    games.slice().reverse().forEach((g) => {
      const card = el('div', 'mr-gcard');
      const fl = g.rows[0].floats;
      card.append(el('div', 'mr-ghead', t('第 ' + g.game + ' 场', '第' + g.game + '戦', 'Game ' + g.game) + (g.date ? ' · ' + mr().showDate(g.date) : '') + (fl != null ? ' · ' + t(fl + ' 人浮', fl + '人浮き', fl + ' up') : '')));
      g.rows.slice().sort((a, b) => a.place - b.place || b.score - a.score).forEach((r) => {
        const row = el('div', 'mr-grow' + (r.place === 1 ? ' mr-p1' : ''));
        const rk = el('span', 'mr-grank'); rk.append(placeBadge(r.place));
        row.append(rk, el('span', 'mr-gname', r.name), el('span', 'mr-gscore', mr().fmtInt(r.score)), el('span', 'mr-gpt' + (r.points < 0 ? ' mr-neg' : ''), pts(r.points)));
        card.append(row);
      });
      if (g.note) card.append(el('div', 'mr-ghead', g.note));
      wrap.append(card);
    });
    gc.append(wrap);
    box.append(gc);
  });

  function drawLine(box, fin) {
    box.replaceChildren();
    const W = Math.max(box.clientWidth || 600, 280), H = 260, m = { t: 12, r: W < 500 ? 58 : 70, b: 28, l: 36 };
    const all = fin.line.flatMap((s) => s.points.map((p) => p.total));
    const y = d3.scaleLinear().domain(d3.extent(all.concat([0]))).nice().range([H - m.b, m.t]);
    const x = d3.scaleLinear().domain([0, Math.max(fin.planned, 1)]).range([m.l, W - m.r]);
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('role', 'img')
      .attr('aria-label', fin.players.map((p) => p.name + ' ' + pts(p.total)).join(', '));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.min(fin.planned, 12)).tickFormat(d3.format('d')).tickSizeOuter(0));
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - m.l - m.r))).call((g) => g.select('.domain').remove());
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-reference)');
    const playedTo = fin.games.length ? fin.games[fin.games.length - 1].game : 0;
    if (playedTo < fin.planned) svg.append('line').attr('x1', x(playedTo)).attr('x2', x(playedTo)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-dasharray', '3 3');
    const ln = d3.line().x((d) => x(d.game)).y((d) => y(d.total));
    const ends = [];
    fin.line.forEach((s, i) => {
      const c = COLORS[i % 4];
      svg.append('path').attr('d', ln(s.points)).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2.5);
      svg.selectAll(null).data(s.points.slice(1)).enter().append('circle').attr('cx', (d) => x(d.game)).attr('cy', (d) => y(d.total)).attr('r', 3).attr('fill', c);
      const last = s.points[s.points.length - 1];
      ends.push({ name: s.name, c, x: x(last.game) + 6, y: y(last.total), v: last.total });
    });
    // Spread end labels so they don't overlap.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach((e) => svg.append('text').attr('x', e.x).attr('y', e.y + 4).attr('class', 'mr-strong').style('fill', e.c).style('font-weight', 700).text(e.name));
  }

  // Opening the Final tab without picking a season shows the latest season that has a final.
  dash.onData(() => {
    const p = dash.params();
    if (p.view !== 'view-final' || p.season != null || !mr() || !mr().currentSeason) return;
    const cur = mr().currentSeason();
    if (cur == null) return;
    const fin = finalFor(cur);
    if (fin && fin.rule) return;
    const withFinal = Object.values(F.seasons).filter((c) => c.finalRule && F.rules[c.finalRule]).map((c) => c.season).sort((a, b) => b - a);
    if (withFinal.length) setTimeout(() => dash.setParams({ season: withFinal[0] }), 0);
  });

  // On the standings page, the "final four" card links to the final once it has one.
  dash.onData(() => {
    const season = mr() && mr().currentSeason ? mr().currentSeason() : null;
    const fin = season != null ? finalFor(season) : null;
    document.querySelectorAll('#final4').forEach((sec) => {
      let a = sec.querySelector('.mr-finlink');
      if (!fin || !fin.rule) { if (a) a.remove(); return; }
      if (!a) { a = el('button', 'mr-bmore mr-finlink'); a.type = 'button'; a.style.marginTop = '12px'; a.onclick = () => window.mrOpenView('view-final'); sec.append(a); }
      a.textContent = t('看决赛 →', '決勝を見る →', 'See the final →') + (fin.games.length ? ' (' + fin.games.length + '/' + fin.planned + ')' : '');
    });
  });
})();
