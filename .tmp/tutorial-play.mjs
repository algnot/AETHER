/**
 * Play through Aether Duel tutorial via playwright-core.
 * Usage: node .tmp/tutorial-play.mjs [baseUrl]
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = join(process.cwd(), '.tmp/tutorial-test')
const TOTAL_TIMEOUT_MS = 4.5 * 60 * 1000
mkdirSync(OUT, { recursive: true })

const friction = []
const steps = []
const consoleErrors = []
let shotIdx = 0
let completed = false
let lastBeat = ''

function note(msg, level = 'info') {
  const row = { t: Date.now(), level, msg }
  steps.push(row)
  console.log(`[${level}] ${msg}`)
}

function frictionNote(msg, severity = 'medium') {
  friction.push({ severity, msg, atBeat: lastBeat })
  note(`FRICTION (${severity}): ${msg}`, 'warn')
}

async function shot(page, label) {
  shotIdx += 1
  const name = `${String(shotIdx).padStart(2, '0')}-${label}.png`
  const path = join(OUT, name)
  await page.screenshot({ path, fullPage: false })
  note(`screenshot ${name}`)
  return path
}

async function readCoach(page) {
  return page.evaluate(() => {
    const tip = document.querySelector('.coach-tip')
    if (!tip) return null
    const title = tip.querySelector('h3')?.textContent?.trim() || ''
    const body = tip.querySelector('p')?.textContent?.trim() || ''
    const progress = tip.querySelector('.coach-progress')?.textContent?.trim() || ''
    const primary = tip.querySelector('.coach-btn.primary')
    const primaryText = primary?.textContent?.trim() || ''
    const primaryDisabled = !!primary?.disabled
    const waiting = tip.classList.contains('waiting')
    const tipRect = tip.getBoundingClientRect()
    const spot = document.querySelector('.coach-spotlight')
    const spotRect = spot?.getBoundingClientRect() || null
    const aim = document.querySelector('.coach-aim')
    const aimInfo = aim
      ? {
          tag: aim.tagName,
          className: aim.className,
          coach: aim.getAttribute('data-coach'),
          coachCard: aim.getAttribute('data-coach-card'),
          text: (aim.textContent || '').slice(0, 80).trim(),
          rect: aim.getBoundingClientRect().toJSON(),
        }
      : null
    let tipOverlapsAim = false
    if (aim && tipRect) {
      const a = aim.getBoundingClientRect()
      tipOverlapsAim = !(
        tipRect.right < a.left ||
        tipRect.left > a.right ||
        tipRect.bottom < a.top ||
        tipRect.top > a.bottom
      )
    }
    return {
      title,
      body,
      progress,
      primaryText,
      primaryDisabled,
      waiting,
      tipOverlapsAim,
      tipSide: tip.className,
      spot: spotRect
        ? { x: spotRect.x, y: spotRect.y, w: spotRect.width, h: spotRect.height }
        : null,
      aim: aimInfo,
      trapModal: !!document.querySelector('.trap-modal'),
      resultScreen: !!document.querySelector('.result-root, .result, [class*="Result"]'),
      winnerText:
        document.querySelector('.result h2, .result-title, .result-root h2')
          ?.textContent || null,
    }
  })
}

async function gameSnapshot(page) {
  return page.evaluate(() => {
    // Prefer zustand store if exposed; else scrape UI
    const store =
      window.__ZUSTAND__ ||
      null
    void store
    const phase =
      document.querySelector('.phase-label, .phase-pill, [class*="phase"]')
        ?.textContent || ''
    const handCards = [...document.querySelectorAll('.you-hand [data-coach-card]')].map(
      (el) => ({
        id: el.getAttribute('data-coach-card'),
        force: el.classList.contains('coach-force'),
        dim: el.classList.contains('coach-dim'),
      }),
    )
    const emptyZones = document.querySelectorAll(
      '[data-coach="summon-zones"] .zone.empty, [data-coach="summon-zones"] .monster-zone:not(.filled), .zone-slot.empty, .mzone.empty',
    ).length
    const phaseBtn = document.querySelector('[data-coach="phase-next"]')
    return {
      phaseText: phase.slice(0, 120),
      handCards,
      emptyZones,
      phaseBtnText: phaseBtn?.textContent?.trim()?.slice(0, 40) || null,
      phaseBtnDisabled: phaseBtn ? phaseBtn.disabled : null,
      trapModal: !!document.querySelector('.trap-modal'),
      directAtk: !!document.querySelector('[data-coach="direct-atk"]'),
      menuVisible: !!document.querySelector('button') &&
        [...document.querySelectorAll('button')].some((b) =>
          (b.textContent || '').includes('สอนเล่น'),
        ),
    }
  })
}

async function clickPrimaryIfEnabled(page) {
  const coach = await readCoach(page)
  if (!coach) return false
  if (coach.primaryDisabled) return false
  if (coach.primaryText === 'กลับเมนู') {
    await page.click('.coach-btn.primary')
    note('clicked กลับเมนู')
    return true
  }
  if (coach.primaryText === 'ถัดไป' || !coach.waiting) {
    await page.click('.coach-btn.primary:not([disabled])')
    note(`clicked primary: ${coach.primaryText}`)
    return true
  }
  return false
}

async function tryClickForcedCard(page) {
  const ok = await page.evaluate(() => {
    const force =
      document.querySelector('.hand-wrap.coach-force .card-shell') ||
      document.querySelector('.coach-aim[data-coach-card] .card-shell') ||
      document.querySelector('.hand-wrap.coach-force') ||
      document.querySelector('.coach-aim[data-coach-card]')
    if (!force) return false
    force.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    )
    return true
  })
  if (ok) note('clicked forced hand card (evaluate)')
  return ok
}

async function tryClickSummonZone(page) {
  // Highlighted empty zones get .summon-target when a card is selected
  const targets = page.locator(
    '[data-coach="summon-zones"] .zone.summon-target, .zone.summon-target, [data-coach="summon-zones"] .zone.drop-ready',
  )
  const n = await targets.count()
  if (n > 0) {
    await targets.first().click({ force: true, timeout: 3000 }).catch(() => null)
    note('clicked .zone.summon-target')
    return true
  }
  // Any empty zone under summon-zones (no child card)
  const clicked = await page.evaluate(() => {
    const root = document.querySelector('[data-coach="summon-zones"]')
    if (!root) return false
    const zones = [...root.querySelectorAll('.zone')]
    for (const z of zones) {
      const hasCard = z.querySelector('.card-shell, img, [class*="monster"]')
      if (!hasCard || z.classList.contains('summon-target')) {
        z.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        return true
      }
    }
    // fallback: click first zone
    if (zones[0]) {
      zones[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      return true
    }
    return false
  })
  if (clicked) {
    note('clicked empty zone via evaluate')
    return true
  }
  return false
}

async function tryClickSpellStrip(page) {
  const sels = [
    '.coach-aim[data-coach="st-you"]',
    '[data-coach="st-you"] .st-strip',
    '[data-coach="st-you"]',
    '.st-strip.coach-aim',
    '.st-strip',
  ]
  for (const sel of sels) {
    const loc = page.locator(sel).first()
    if (await loc.count()) {
      await loc.click({ force: true, timeout: 2000 }).catch(() => null)
      note(`clicked spell strip via ${sel}`)
      return true
    }
  }
  return false
}

async function tryClickPhaseNext(page) {
  // Wait out cast/battle busy briefly
  for (let i = 0; i < 20; i++) {
    const state = await page.evaluate(() => {
      const btn = document.querySelector('[data-coach="phase-next"]')
      if (!btn) return { exists: false }
      return {
        exists: true,
        disabled: btn.disabled,
        busy: btn.classList.contains('busy'),
        text: (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      }
    })
    if (!state.exists) return false
    if (!state.disabled && !state.busy) {
      await page.locator('[data-coach="phase-next"]').click({ force: true })
      note(`clicked phase-next (${state.text})`)
      return true
    }
    if (i === 0) note(`phase-next waiting disabled=${state.disabled} busy=${state.busy}`)
    await page.waitForTimeout(200)
  }
  note('phase-next still disabled/busy')
  return false
}

async function tryTrap(page) {
  const modal = page.locator('.trap-modal')
  if (!(await modal.count())) return false
  // Prefer trap that mentions ระเบิด or force highlight
  const useBtns = modal.locator('button')
  const n = await useBtns.count()
  for (let i = 0; i < n; i++) {
    const t = ((await useBtns.nth(i).textContent()) || '').trim()
    if (/ใช้|ระเบิด|กับดัก|confirm|yes/i.test(t) && !/ข้าม|ไม่ใช้|ยกเลิก|skip/i.test(t)) {
      await useBtns.nth(i).click({ force: true })
      note(`clicked trap modal button: ${t}`)
      return true
    }
  }
  // Click forced trap card in modal or hand
  const force = page.locator('.trap-modal [data-coach-card="S0029"], .hand-wrap.coach-force, .trap-modal .card-shell').first()
  if (await force.count()) {
    await force.click({ force: true }).catch(() => null)
    note('clicked trap card in modal/hand')
    return true
  }
  if (n > 0) {
    await useBtns.first().click({ force: true }).catch(() => null)
    note('clicked first trap modal button')
    return true
  }
  return false
}

async function waitBattleClear(page) {
  // battleFx blocks clicks for ~1100ms
  for (let i = 0; i < 20; i++) {
    const busy = await page.evaluate(
      () =>
        !!document.querySelector('.zone.impact, .card-shell.fx-lunge, .card-shell.fx-hit, .phase-next.busy'),
    )
    if (!busy) return
    await page.waitForTimeout(200)
  }
}

async function tryAttack(page) {
  await waitBattleClear(page)

  const selectInfo = await page.evaluate(() => {
    const tip = document.querySelector('.coach-tip')
    const tipRect = tip?.getBoundingClientRect()
    const overlaps = (el) => {
      if (!tipRect) return false
      const r = el.getBoundingClientRect()
      return !(
        tipRect.right < r.left ||
        tipRect.left > r.right ||
        tipRect.bottom < r.top ||
        tipRect.top > r.bottom
      )
    }
    const clickEl = (el) => {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      )
    }
    const ourCards = [
      ...document.querySelectorAll('[data-coach="zones-you"] .zone .card-shell'),
    ]
    const attackable = ourCards.filter(
      (c) =>
        !c.classList.contains('dimmed') && !c.classList.contains('exhausted'),
    )
    const pool = attackable.length ? attackable : ourCards
    const preferred =
      pool.find((c) => !overlaps(c)) || pool[pool.length - 1] || pool[0]
    if (!preferred) return { ok: false, reason: 'no-attacker' }

    // If already selecting an attacker, skip re-select
    const already =
      !!document.querySelector('.zone.attacking') ||
      !!document.querySelector('[data-coach="direct-atk"]')
    if (!already) clickEl(preferred)

    return {
      ok: true,
      tipOverlappedAttacker: overlaps(preferred),
      attackable: attackable.length,
      total: ourCards.length,
      already,
    }
  })

  if (!selectInfo?.ok) {
    note(`attack select failed: ${selectInfo?.reason || 'unknown'}`)
    return false
  }
  if (selectInfo.tipOverlappedAttacker) {
    frictionNote(
      'Coach tip overlaps an attackable monster (may block real mouse clicks)',
      'high',
    )
  }
  note(
    `selected attacker already=${selectInfo.already} attackable=${selectInfo.attackable}/${selectInfo.total}`,
  )

  // Wait for React to enter attack interaction
  for (let i = 0; i < 15; i++) {
    const ready = await page.evaluate(
      () =>
        !!document.querySelector('[data-coach="direct-atk"]') ||
        !!document.querySelector('.zone.attacking') ||
        !![...document.querySelectorAll('.hint-banner')].some((h) =>
          /เป้า|โจมตี/.test(h.textContent || ''),
        ),
    )
    if (ready) break
    await page.waitForTimeout(100)
  }

  const finish = await page.evaluate(() => {
    const clickEl = (el) => {
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
      )
    }
    const oppCards = [
      ...document.querySelectorAll('[data-coach="zones-opp"] .zone .card-shell'),
    ]
    if (oppCards.length) {
      clickEl(oppCards[0])
      return 'monster'
    }
    const direct = document.querySelector('[data-coach="direct-atk"]')
    if (direct) {
      clickEl(direct)
      return 'direct'
    }
    return null
  })

  if (!finish) {
    note('attack: no target after select')
    return false
  }
  note(`attack finish mode=${finish}`)
  await page.waitForTimeout(1400) // FX_MS + buffer
  await waitBattleClear(page)
  return true
}

async function dumpDomHints(page) {
  return page.evaluate(() => {
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].slice(0, 8).map((el) => ({
        sel,
        tag: el.tagName,
        class: (el.className || '').toString().slice(0, 80),
        coach: el.getAttribute('data-coach'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      }))
    return {
      summon: pick('[data-coach="summon-zones"] *'),
      st: pick('[data-coach="st-you"] *'),
      phase: pick('[data-coach="phase-next"]'),
      hand: pick('[data-coach-card]'),
      trap: pick('.trap-modal *'),
      coachAim: pick('.coach-aim'),
      buttons: pick('button').filter((b) => /Battle|ถัดไป|ใช้|โจมตี|สอน|จบ|Main/i.test(b.text)),
    }
  })
}

async function launchBrowser() {
  const browserRoot =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    '/var/folders/75/m2hmjvp51pj4p04ypgn_qq900000gn/T/cursor-sandbox-cache/c30bb90e0e5a11130b544e843b04ba54/playwright'
  const headlessShell = `${browserRoot}/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`
  const cft = `${browserRoot}/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
  const args = ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage']
  const attempts = [
    { name: 'headless-shell', opts: { executablePath: headlessShell, headless: true, args } },
    { name: 'chrome-for-testing', opts: { executablePath: cft, headless: true, args } },
    { name: 'chromium-bundled', opts: { headless: true, args } },
    {
      name: 'chrome-path',
      opts: {
        executablePath:
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args,
      },
    },
  ]
  for (const a of attempts) {
    try {
      note(`trying browser: ${a.name}`)
      const browser = await Promise.race([
        chromium.launch(a.opts),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error('launch timeout 25s')), 25000),
        ),
      ])
      note(`launched ${a.name}`)
      return browser
    } catch (e) {
      note(`launch failed ${a.name}: ${e.message}`, 'warn')
    }
  }
  throw new Error('Could not launch any browser')
}

async function main() {
  const started = Date.now()
  note(`BASE=${BASE}`)
  const browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'th-TH',
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      consoleErrors.push(text)
      note(`console.error: ${text.slice(0, 200)}`, 'error')
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err))
    note(`pageerror: ${err}`, 'error')
  })

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(800)
  await shot(page, 'menu')

  const tutorialBtn = page.getByRole('button', { name: /สอนเล่น/ })
  if (!(await tutorialBtn.count())) {
    frictionNote('Cannot find สอนเล่น button on menu', 'high')
    await shot(page, 'no-tutorial-btn')
  } else {
    await tutorialBtn.click()
    note('clicked สอนเล่น')
  }

  await page.waitForSelector('.coach-tip, .coach-root', { timeout: 15000 }).catch(() => {
    frictionNote('Coach tip did not appear after starting tutorial', 'high')
  })
  await page.waitForTimeout(600)
  await shot(page, 'tutorial-start')

  let idleLoops = 0
  let prevSignature = ''
  let stuckAt = null
  let sameBeatCount = 0

  while (Date.now() - started < TOTAL_TIMEOUT_MS) {
    const coach = await readCoach(page)
    const snap = await gameSnapshot(page)

    // Victory / result detection
    const onMenu = await page.getByRole('button', { name: /สอนเล่น/ }).count()
    if (onMenu && completed) {
      note('Back on menu after tutorial')
      break
    }

    if (!coach) {
      // Maybe result screen
      const resultish = await page.locator('text=/ชนะ|แพ้|เรียบร้อย|ดวล|ผล/').count()
      await shot(page, 'no-coach')
      if (resultish || snap.menuVisible) {
        note('No coach — checking result/menu')
        const back = page.getByRole('button', { name: /กลับ|เมนู|เล่นอีก|สอน/ })
        if (await back.count()) {
          completed = true
          await shot(page, 'result-or-menu')
          break
        }
      }
      idleLoops++
      if (idleLoops > 15) {
        frictionNote('Lost coach UI and could not recover', 'high')
        break
      }
      await page.waitForTimeout(500)
      continue
    }

    idleLoops = 0
    if (coach.title !== lastBeat) {
      note(`BEAT: ${coach.progress} «${coach.title}» — ${coach.body.slice(0, 100)}`)
      if (coach.tipOverlapsAim) {
        frictionNote(
          `Tip overlaps aim target on beat «${coach.title}»`,
          'medium',
        )
      }
      await shot(
        page,
        `beat-${(coach.progress || 'x').replace('/', '-of-')}-${coach.title.slice(0, 20)}`,
      )
      sameBeatCount = 0
    } else {
      sameBeatCount++
    }
    lastBeat = coach.title

    if (coach.title === 'เรียบร้อย' || /victory|เรียบร้อย/i.test(coach.title)) {
      completed = true
      await shot(page, 'victory')
      await clickPrimaryIfEnabled(page)
      await page.waitForTimeout(800)
      await shot(page, 'after-victory')
      break
    }

    const sig = `${coach.title}|${coach.primaryText}|${coach.waiting}|${coach.trapModal}|${JSON.stringify(coach.aim?.coachCard)}|${snap.phaseBtnText}`
    if (sig === prevSignature) {
      // still same
    } else {
      prevSignature = sig
      stuckAt = null
    }

    // Action priority
    let acted = false

    if (coach.trapModal || snap.trapModal) {
      acted = await tryTrap(page)
      if (acted) {
        await page.waitForTimeout(700)
        continue
      }
    }

    // If primary enabled (ถัดไป), prefer advancing when not in forced-action waiting
    // But for skippable beats, click ถัดไป
    if (!coach.primaryDisabled && coach.primaryText === 'ถัดไป') {
      acted = await clickPrimaryIfEnabled(page)
      if (acted) {
        await page.waitForTimeout(450)
        continue
      }
    }

    // Forced actions based on CTA / title
    const cta = coach.primaryText || ''
    const title = coach.title || ''

    if (/ลง|ทหาร|หน่วย|กัปตัน|ชาร์จ|ใช้ชาร์จ|กับดัก|ระเบิด/i.test(cta + title) || coach.waiting) {
      // Card play flow
      if (coach.aim?.coachCard || (await page.locator('.coach-force').count())) {
        acted = await tryClickForcedCard(page)
        await page.waitForTimeout(350)
      }
      // After selecting card, place
      const after = await readCoach(page)
      if (after && (/ช่อง|สนาม|แถบ|เวทย์/i.test(after.body) || after.aim?.coach === 'summon-zones' || after.aim?.coach === 'st-you')) {
        if (/เวทย์|แถบ|st-you|spell/i.test(after.body + (after.aim?.coach || ''))) {
          acted = (await tryClickSpellStrip(page)) || acted
        } else {
          acted = (await tryClickSummonZone(page)) || acted
        }
        await page.waitForTimeout(500)
        continue
      }
      if (acted) {
        // try zone anyway
        await tryClickSummonZone(page)
        await tryClickSpellStrip(page)
        await page.waitForTimeout(500)
        continue
      }
    }

    if (/Battle|จบเทิร์น|ไป Battle|phase/i.test(cta + title + (coach.aim?.coach || ''))) {
      acted = await tryClickPhaseNext(page)
      if (acted) {
        await page.waitForTimeout(700)
        continue
      }
    }

    if (/ตี|โจมตี|kill|จบ/i.test(cta + title) || coach.aim?.coach === 'zones-you' || coach.aim?.coach === 'direct-atk') {
      acted = await tryAttack(page)
      if (acted) {
        await page.waitForTimeout(900)
        continue
      }
    }

    // Waiting for bot
    if (/รอ|บอท/i.test(cta + coach.body)) {
      note('waiting for bot…')
      await page.waitForTimeout(1200)
      // auto-advance may kick in via done()
      if (!coach.primaryDisabled && coach.primaryText === 'ถัดไป') {
        await clickPrimaryIfEnabled(page)
      }
      if (sameBeatCount > 12) {
        frictionNote(`Stuck waiting on «${title}» for too long (bot idle?)`, 'high')
        const hints = await dumpDomHints(page)
        writeFileSync(join(OUT, 'stuck-hints.json'), JSON.stringify(hints, null, 2))
        await shot(page, 'stuck-bot')
        // try phase button anyway
        await tryClickPhaseNext(page)
      }
      continue
    }

    // Generic fallbacks
    if (!acted) {
      acted =
        (await tryClickForcedCard(page)) ||
        (await tryClickPhaseNext(page)) ||
        (await tryClickSummonZone(page)) ||
        (await tryClickSpellStrip(page)) ||
        (await tryAttack(page)) ||
        (await clickPrimaryIfEnabled(page))
    }

    if (!acted) {
      if (!stuckAt) stuckAt = Date.now()
      if (Date.now() - stuckAt > 8000) {
        frictionNote(
          `No actionable click on «${title}» (cta=${cta}, aim=${coach.aim?.coach || coach.aim?.coachCard || 'none'})`,
          'high',
        )
        const hints = await dumpDomHints(page)
        writeFileSync(
          join(OUT, `stuck-${shotIdx}-${title.slice(0, 12)}.json`),
          JSON.stringify({ coach, snap, hints }, null, 2),
        )
        await shot(page, `stuck-${title.slice(0, 16)}`)
        stuckAt = Date.now() // reset to avoid spam every loop
        // last resort: click anything with coach-aim
        const aim = page.locator('.coach-aim').first()
        if (await aim.count()) {
          await aim.click({ force: true }).catch(() => null)
          note('last-resort click .coach-aim')
        }
      }
      await page.waitForTimeout(600)
    } else {
      await page.waitForTimeout(400)
    }

    if (sameBeatCount > 40) {
      frictionNote(`Same beat «${title}» for ${sameBeatCount} loops — aborting`, 'high')
      await shot(page, 'abort-same-beat')
      break
    }
  }

  if (Date.now() - started >= TOTAL_TIMEOUT_MS) {
    frictionNote('Hit total timeout before finishing tutorial', 'high')
    await shot(page, 'timeout')
  }

  const report = {
    completed,
    lastBeat,
    durationMs: Date.now() - started,
    base: BASE,
    friction,
    steps: steps.map((s) => ({ level: s.level, msg: s.msg })),
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    screenshots: shotIdx,
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  note(`DONE completed=${completed} friction=${friction.length} shots=${shotIdx}`)
  console.log('\n=== REPORT JSON written to .tmp/tutorial-test/report.json ===\n')
  await browser.close()
  process.exit(completed ? 0 : 2)
}

main().catch(async (e) => {
  console.error(e)
  writeFileSync(
    join(OUT, 'fatal.json'),
    JSON.stringify({ error: String(e), stack: e.stack }, null, 2),
  )
  process.exit(1)
})
