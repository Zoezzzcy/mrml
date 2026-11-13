# MRML League

Riichi mahjong league dashboard. `index.html` (desktop) and `mobile.html` read the latest games from the MRML Google Sheet on each visit and fall back to a saved copy.

## Finals
- `rules.js` — scoring rules shared by the site and `entry.html`: reads the `Dim_Rules`, `Dim_Seasons` and `Final_Games` tabs (saved copy built in) and scores a game, including uma that depends on how many players finish at or above the float line (連盟 A 規).
- `finals.js` — the 决赛 / Final tab on both pages. Final games never enter the regular-season numbers.
- Each new season: add its rule to `Dim_Rules` if it's new, then fill `final_rule_id`, `final_games`, `final_carryover`, `final_tie_rule`, `finalists` in `Dim_Seasons`.
- `apps-script/Code.gs` — run `setupFinals` once to create the tabs; entry-page games marked 决赛 go to `Final_Games`.
