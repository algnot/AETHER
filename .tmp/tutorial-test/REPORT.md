# Tutorial playtest report — Aether Duel

**Date:** 2026-09-25  
**Base URL:** http://localhost:5173  
**Script:** `.tmp/tutorial-play.mjs`  
**Result:** **Completed** (win → result screen) in ~52s  
**Console errors:** none  
**Screenshots:** `.tmp/tutorial-test/*.png` (20 shots)

## Worktree note

`/worktree` could not create a git worktree: this folder has **no `.git`**. Testing ran in the main workspace `/Users/algnot/Documents/coding/tk/card-game`.

## Completion

| Item | Status |
|------|--------|
| Open menu → สอนเล่น | OK |
| Coach beats 1–7 (intro → spell) | OK |
| Trap hold (8) | Flashed/skipped by next click |
| Battle / end turn (9–10) | OK (phase button briefly disabled after spell cast) |
| Bot turn + trap (11→14) | OK (beats 12–13 auto-skipped) |
| Turn 2 summon + battle + kill (16–19) | OK |
| Coach victory beat (20 «เรียบร้อย») | **Never shown** — Result screen takes over |
| Result «คุณชนะ!» / จบบทฝึก | OK |

## Step-by-step (beats seen)

1. **ลองดวลกันหน่อย** — intro, ถัดไป  
2. **หัวใจตรงนี้** — HP spotlight  
3. **เพชรฟ้า = พลังงาน** — energy  
4. **การ์ดมี 3 แบบ** — hand types  
5. **ลงมอนสเตอร์ธรรมดา** — force S0009 → zone  
6. **มอนสเตอร์มีเอฟเฟค** — force S0024 → zone  
7. **เวทย์ — ใช้แล้วจบ** — force S0021 → ST strip  
8. **กับดัก — ยังไม่กด** — not stably observed (advanced immediately)  
9. **ไป Battle** — phase button was `disabled` briefly (cast FX), then OK  
10. **เทิร์นแรกตีไม่ได้** — Main2 → จบเทิร์น  
11. **ตาบอทแล้ว** — wait  
12–13. **บอทลงมอนสเตอร์ / บอทจะตี** — auto-advanced into trap  
14. **ใช้กับดัก!** — modal «ใช้ระเบิดความตาย»  
15. **เห็นมั้ย** — wait for player turn  
16. **ตาคุณอีกครั้ง** — mock hand  
17. **ลงกัปตันโล่** — S0011 → zone  
18. **เข้า Battle**  
19. **ตีให้จบ** — fight opp monster, then direct ×2 → win  
20. **เรียบร้อย** (coach) — skipped; Result screen instead  

## Prioritized adjustments

### High
1. **Victory coach beat never appears** — on win, `screen: 'result'` unmounts the duel/coach. Beat `victory` / CTA «กลับเมนู» is dead code path. Either keep coach on result, or drop beat 20 and rely on Result copy (already good: «จบบทฝึก — พร้อมดวลจริงแล้ว»).
2. **Kill step spotlight is the whole `zones-you` rail** — hard to see *which* monster to click; tip dock bottom-left can sit over left field zones and steal real mouse clicks (`pointer-events: auto` on `.coach-tip`). Prefer spotlight on first attackable `.zone .card-shell`, or auto-dock tip away from field during `kill`.
3. **«ไป Battle» after spell** — coach unlocks while `phase-next` is still disabled during cast FX (~1.4s). Player can feel stuck. Gate the beat on `!castFx` / enabled button, or show «รอเวทย์ทำงาน…».

### Medium
4. **Beats 12–13 auto-skip** via `done()` — players barely see «บอทลงมอนสเตอร์». Consider requiring ถัดไป, or longer dwell before auto-advance.
5. **Trap hold (8)** is easy to miss if the player (or auto-done from spell) advances quickly; reinforce «อย่ากดกับดักตอนนี้» more strongly.
6. **Trap modal + coach CTA duplicate** — modal and disabled coach button both say «ใช้ระเบิดความตาย»; fine, but double-prompt is noisy. Script also double-fired modal click harmlessly.
7. **Kill copy** assumes an opp monster («คลิกมอนสเตอร์บอท») — after killing it, body updates to direct; OK, but first-time players may not notice the «โจมตีตรง!» button.

### Low
8. Coach progress jumps (11→14, skip 8/12/13/20) look like a bug even when intentional.
9. Auto-advance delay 550ms after `done()` feels snappy on summon/spell — OK for power users, slightly fast for reading.

## Console

No `console.error` / page errors during the successful run.
