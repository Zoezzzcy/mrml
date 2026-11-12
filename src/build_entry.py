"""Build entry.html from the template and add the 录入成绩 link to index.html / mobile.html.
Usage: python3 src/build_entry.py [ENDPOINT_URL]"""
import json, sys, re, collections
ROOT = '/home/claude/mrml'
DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyiVM-gNfKxTksri9zIE-fk1dIp0H54gi7VhrA2zp1VFEoUb8zs3txNgi8h9MKAkTbp/exec'
endpoint = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ENDPOINT
seasons = json.load(open('/home/claude/mrml_seasons.json'))
games = json.load(open('/home/claude/mrml_games_snapshot.json'))
games = games['rows'] if isinstance(games, dict) else games
cur = max(s['season_id'] for s in seasons)
cur_s = [s for s in seasons if s['season_id'] == cur][0]
cnt = collections.Counter(); last = {}
for g in games:
    for k in range(1, 5):
        n = g[f'p{k}_name'].strip()
        if not n: continue
        if cur_s['start'] <= g['date'] <= cur_s['end']: cnt[n] += 1
        last[n] = max(last.get(n, ''), g['date'])
names = sorted(last, key=lambda n: (-cnt[n], -int(last[n].replace('-', '')), n.lower()))
logo = open('/home/claude/logo/tile_datauri.txt').read().strip()
t = open(f'{ROOT}/src/entry.template.html', encoding='utf-8').read()
t = (t.replace('__LOGO__', logo).replace('__ENDPOINT__', endpoint)
      .replace('__SEASONS__', json.dumps(seasons, ensure_ascii=False)).replace('__NAMES__', json.dumps(names, ensure_ascii=False)))
open(f'{ROOT}/entry.html', 'w', encoding='utf-8').write(t)
print('entry.html', len(t), 'names', len(names), names[:8])

CSS = ('  .mr-enter { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 999px; background: #CD0000; color: #fff !important;'
       ' font-weight: 700; font-size: 14px; text-decoration: none; white-space: nowrap; }\n  .mr-enter:hover { background: #A80000; }\n')
LINK = ('<a class="mr-enter" href="entry.html"><span class="t-zh" lang="zh">＋ 录入成绩</span>'
        '<span class="t-ja" lang="ja">＋ 成績入力</span><span class="t-en" lang="en">+ Enter a game</span></a>\n      ')
for f in ['index.html', 'mobile.html']:
    p = f'{ROOT}/{f}'; s = open(p, encoding='utf-8').read()
    if 'class="mr-enter"' not in s:
        s = s.replace('</style>', CSS + '</style>', 1)
        anchor = '<div class="mr-navright">\n      '
        assert anchor in s, f
        s = s.replace(anchor, anchor + LINK, 1)
    open(p, 'w', encoding='utf-8').write(s); print(f, 'link ok')
