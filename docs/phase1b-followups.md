# Phase 1b follow-ups

Deferred minor findings and controller rulings from the Phase 1b reviews (2026-10-18).

- Ruling: T1–T3 pure ports (sonnet, golden-gated); T4 mod (sonnet); T5 docs (haiku).
- Ruling: test glob → tests/*/*.spec.ts tests/*/*/*.spec.ts accepted — fixes deferred Phase-1 minor — cost: depth >2 needs another pattern.
- Ruling: golden 5b without selection accepted — generator identity bug, golden is ground truth — cost: none.
- Tasks 1-3: minor (deferred): Row.err not populated by buildRows (failed shows "exit 1"); glob depth limit 3; fitNoPad unit test.
- Ruling: graph footer Buttons get hotkeys p/n/d (+h/l pan), autoFocus on details; hint "p/n select   d details   t/g view   esc close" — engine can't bind arrows; hint must be truthful — cost: deviates from spec ←→↑↓ graph keys.
- Ruling: chrome-row height budget + header/toggle width bound ruled into fix round — overflow visible at common widths — cost: small.
- Ruling: latestRoom module-variable write in ui.render accepted — it is a render-derived cache (viewport size), not $.state; no redraw, no loop; ui.focus has no viewport — cost: stale by one frame after resize.
- Task 4: minor (deferred): no engine test pressing p/n/d/h/l; 80-col toggle test checks decision not width; graph-pane.ts:91 long line; tree header not clipped at narrow widths.
- Final fix wave: tree toggle Buttons stay first in focus order (engine has no focus priority); t/g hint hidden below 54 columns; ui.focus mode fallback untested at engine level (kit limitation); long lines >110 remain.
