# Mission Timer — Project Context

## What this is
A single-page web app ("Mission Timer") for helicopter flight/mission logging, used by staff on iOS as a Home Screen web app. Captures Start/Lift/Land/End times, fuel readings, a Mission timer with a Hoists/Slings counter, saved leg history (local storage), plain-text export, and Telegram notifications on key events.

## Files in this repo
- `index.html` — the entire app (HTML/CSS/JS, no build step, no framework)
- `sw.js` — service worker for offline caching. **Bump `CACHE_NAME` every time index.html changes**, or iOS will keep serving a stale cached copy.
  Three things make the bump actually take effect, all added in v37 — don't
  undo them: `install` fetches with `{cache:'reload'}` (otherwise a new cache
  gets filled with the *old* index.html from the HTTP cache), the page is
  served **network-first** (icons stay cache-first), and `index.html` registers
  with `updateViaCache:'none'` plus a `reg.update()` on `visibilitychange`
  (a Home Screen app is resumed, not reloaded, so it otherwise never re-checks).
  Expect **two relaunches** after a deploy: the first installs the new worker
  while the old one is still serving the page, the second shows it.
  Bump `APP_VERSION` in `index.html` to the same number at the same time — it
  is shown next to the title in the header so the user can confirm which build
  the phone is actually running.
- `manifest.json` — web app manifest (name, icons, standalone display mode)
- `icon-180.png`, `icon-192.png`, `icon-152.png`, `icon-167.png`, `icon-1024.png` — Home Screen icons

## Leg flow rules
- **One live block at a time.** Everything else fades to 50% (`.dimmed`), whether
  already captured or not yet reachable. Stages, driven by `legStage()`:
  nothing captured → Start; Start captured → Lift + Mission + Land (End stays
  faded until landed); Land captured → End; End captured → nothing.
  Faded blocks are still fully usable, and tapping into one restores it.
- **Carry-over start.** If the previous saved leg has no End (`on_blocks`), the
  engine never shut down, so the next leg has no new engine start. Its Start
  time is copied from that leg and its Capture button reads "Carried" and is
  disabled. The previous leg's **Start fuel is carried across too**, since the
  engine has been running since that reading. Both stay editable.
  Clearing a carried Start time **restores it** rather than deleting it — the
  Capture button is disabled while carried, so a clear (easily triggered by
  opening the iOS time picker and dismissing it) would otherwise strand the leg
  with no start and no way to re-capture. Setting a different time still works.
  **The whole Start block is hidden** (`.step.carried{ display:none }`) rather
  than shown collapsed-with-a-value, on explicit request — showing a value
  there looked like something had been captured on this leg when nothing was.
  `current.off_blocks` is still set internally throughout, so the
  Start → Shutdown timer, ground time, and Fuel Used all keep working; only the
  on-screen block disappears. It reappears once a leg finally records a
  shutdown, giving the next leg its own fresh, visible Start.
  This carries into the **saved record** too: each leg stores `startCarried`
  (set from the `.carried` class at the moment of save), and both the history
  card and the plain-text export skip the "Start" line entirely when it's
  true - a leg where Start wasn't captured shouldn't claim one, on the same
  explicit request as hiding the live block. Legs saved before this field
  existed default to showing Start (`undefined` is falsy), which is the
  closest reasonable guess for old data with no way to know which case it was.
  Consequence: Start-Stop time accrues to whichever leg finally records the
  shutdown, covering the whole continuous run. Legs without a shutdown show
  Start-Stop as "—", so nothing is double counted.
  **Each carried leg's `off_blocks` is a frozen copy**, taken from whichever
  leg was last in history *at the moment it was saved* - editing an earlier
  leg's Start after the fact does not retroactively update copies already
  saved on later legs in the same chain. Every place that turns a leg's
  off_blocks into a Start→Shutdown span (the leg card's Total, Total Blades
  Turning, the export, the live top-of-page timer, and `applyCarryOver()`
  itself when starting the next leg) therefore resolves it through
  `blockStartFor(legs, i)` instead of reading `leg.off_blocks` directly - it
  walks back through the carried chain to the leg that actually captured the
  Start and uses *that* leg's current value live, so an edit anywhere in the
  chain is reflected everywhere downstream immediately, not just on the leg
  that was directly edited.
- **Paired fuel readings.** Start/Lift and Land/End each happen minutes apart, so
  one reading covers the pair. Start and End are primary (Fuel Used is Start −
  End): a value in Start hides the Lift box, a value in End hides the Land box.
  Only hidden while the partner box is *empty*, so a reading already taken is
  never hidden or lost. See `FUEL_PARTNER` / `updateFuelVisibility()`.
  **The Lift box is only offered on a hot load.** You fuel at engine start, so
  a normal leg only ever needs the Start box — an empty Lift box beside it just
  invites a second reading for the same moment. It appears only when the Start
  block is hidden (a carried leg, which never had an engine start of its own
  and whose carried Start fuel is stale), or when a Lift value is already
  present, so nothing typed — or saved by an older version — is ever stranded.
  **The saved leg card and export show one reading per pair** via
  `fuelPartsFor(leg)` — Start *or* Lift, Land *or* Shutdown — since only one of
  each is ever really taken. Start wins over Lift and Shutdown over Land,
  matching which box the live app treats as primary, **except on a carried
  leg**, where the Start figure is the stale copied one and Lift wins instead
  (same reasoning as hiding the carried Start *time*). Mission readings aren't
  part of either pair and always show. This is **display only** — every reading
  stays in storage and `periodFuelUsedFor` / `uploadedBetween` still read the
  raw values, so hiding a figure never changes a total.
- **Captured times snap to the minute** (`capture()` zeroes seconds/ms) so a
  button-press timestamp always matches what the HH:MM display shows — the
  same as a manual time-picker edit already did. Without this, a duration
  computed from the exact second could read a minute off from what simple
  subtraction of the two displayed times suggests.
- **Start collapses once captured** (`.step.collapsed`), roughly halving its
  height and hiding the Capture button. Its time and fuel stay editable for
  corrections. Note this also hides the "Carried" button label on carry-over
  legs.
- **Shutdown collapses the whole way**, like Mission — only the name, a summary
  of what was captured, and a chevron. Driven by `updateShutdownRow()`:
  `expanded = shutdownOpen || legStage() === 'postLand'`, so it appears by
  itself the moment Land is captured and is shut for the rest of the leg.
  - The summary (`#shutdownSummary`) and chevron exist **only** in the
    collapsed state — the expanded row has zero spare width at 375px, so they
    must measure 0px when open. Don't give them layout when expanded.
  - Tapping the row toggles it, but the handler ignores taps landing on an
    `input` or `button` so the time picker, fuel box and Capture still work.
  - Forced open while it is the live block, so a tap can't close it then —
    same shape as the Mission toggle, including the
    `!(shutdownOpen || …)` form so the first tap after capture closes it.
  - **Capturing Shutdown sets `shutdownOpen = true`**, so the row stays open
    for the fuel reading rather than shutting the instant you press Capture.
  - `loadLegForEdit()` opens it when the leg has a shutdown, and
    `clearLegFields()` resets it to false.
- **Mission collapses to a single tappable header row** (43px, vs 262px open) —
  the whole `.mission-body` is hidden, not shrunk. Tap `#missionHeader` to
  toggle. Driven by `updateMissionCard()`:
  `expanded = missionOpen || timers.mission.running`.
  - A **running timer forces it open** and a tap can't close it — you must be
    able to see the timer and reach End. The toggle is written as
    `missionOpen = !(missionOpen || running)` so the first tap after stopping
    closes it rather than doing nothing.
  - **Ending a mission sets `missionOpen = true`**, so the card stays open long
    enough to enter the end fuel reading instead of snapping shut.
  - `loadLegForEdit()` opens it when the leg has mission times, since a
    collapsed card would hide the very values being corrected.
  - Collapsed, the header shows a summary (`elapsed · N H/S`) so nothing
    glanceable is lost. `clearLegFields()` resets `missionOpen` to false.
  - Cost of this: starting a mission or logging a hoist from cold is now two
    taps (open, then act) rather than one. Accepted deliberately — the card is
    idle for most of a leg and was the largest thing on screen.
- **"End" is called "Shutdown"** everywhere it denotes engine shutdown (step
  name, `STEP_LABELS`/`FUEL_LABELS`, history card, export). The Mission timer's
  own unrelated End button (ends the hoist/sling timer) keeps its own label —
  do not touch that one.
- **Two top-of-page timers**, `startStopTimer` (Start → Shutdown, i.e. blades
  turning) and `liftLandTimer` (Lift → Land), driven by
  `totalMsBetween(startKey, endKey)`. Each sums the *current engine run's*
  saved legs (`currentRunLegs()` - everything after the most recent leg that
  recorded a Shutdown) plus the live in-progress segment. They reset to zero
  both on Clear all and the instant a fresh, non-carried Start begins after a
  Shutdown - **on-screen only**, an explicit, deliberate scope-down from the
  Totals summary below, which stays cumulative across all history. A
  continuous run's Start→Shutdown time is only ever counted once, on the leg
  that finally records the shutdown, since carried-over legs have no
  `on_blocks` of their own to sum. `updateLiftLandTimer()` /
  `updateStartStopTimer()` must be called wherever the leg or history changes;
  Clear all needs it explicitly when the leg is *not* also reset, since
  `resetLeg()` isn't called in that branch.
  Start → Shutdown sits directly under the Shutdown step, above Reset/Save Leg
  - not at the top with Lift → Land. That placement was a deliberate, explicit
  request (moved there in two steps after an initial placement lower down).
- **Ground time** (`legGroundMinutes(prevLeg, leg)`) is every engine-running-
  but-not-flying span attributable to a leg, so that Flying Time + Ground Time
  always sums to that block's Start→Shutdown (Blades Turning): the carried gap
  from the previous leg's Land to this leg's Lift (hot-load only, same
  condition as the carry-over start — if the previous leg shut down, that gap
  is time parked, not ground time), **plus** this leg's own Start (if not
  carried — a carried Start is stale, not a real taxi-out) to its own first
  Lift, **plus** this leg's own Land to its own Shutdown. Null when none of the
  three apply. **Computed live at render time** from the current leg list (not
  stored on the leg) — like Fuel Uploaded below — so it self-corrects after an
  edit changes which leg is now the neighbor, rather than freezing whatever was
  true at save time. Shown per-leg on the history card and in the export as
  "Ground Time".

## Totals summary (below Saved Legs)
Five rows, each hidden unless at least one saved leg contributes, so the card
never shows a bare zero for something simply never recorded. The whole card
hides when none apply.
- **Total Flying Time** — sum of Lift → Land per leg.
- **Total Blades Turning** — sum of the per-leg Start → Shutdown span
  (`off_blocks` to `on_blocks`), i.e. total engine-running time across every
  completed run.
- **Total Ground Time** — sum of the per-leg `legGroundMinutes`, so it
  inherits that function's rules and matches the leg cards. By construction,
  Total Flying Time + Total Ground Time == Total Blades Turning.
- **Total Fuel Used** — sum of `periodFuelUsedFor(legs, i)` per closing leg
  (one contribution per completed engine run, same "only counted once, on the
  leg that finally records the Shutdown" rule as Blades Turning). Start fuel
  is `legStartFuel()` on the leg that actually began the run, walking back
  through the carried chain the same way `blockStartFor()` does for time so a
  fuel edit anywhere upstream is picked up immediately. End fuel prefers the
  closing leg's own Shutdown reading, falling back to its Land reading if
  that's what got captured instead. Any fuel uploaded partway through the run
  (`uploadedBetween` summed leg-to-leg across the run) is added back in — a
  plain start-minus-end would otherwise net a refuel against consumption and
  understate what was actually burned. Shown per-leg (on the closing leg,
  where the other totals below also land) and in the export as "Fuel Used".
- **Total Fuel Uploaded** — refuelling inferred between legs: more fuel on
  board at the start of a leg than at the end of the previous one.
  `legEndFuel()` is Land, falling back to Shutdown; `legStartFuel()` is Start,
  falling back to Lift. The fallbacks matter because the paired-fuel rule
  routinely leaves one box of each pair empty by design. A **carried** Start is
  never used as a start reading — it's copied from the previous leg's engine
  start and is stale — so a hot-load leg falls through to its Lift reading.
  Computed at render time from adjacent legs (not stored on the leg), so legs
  saved before this existed still get it. Also shown per-leg on the history
  card and in the export as "Fuel uploaded since previous leg".

## Editing or deleting a saved leg
Tapping a leg card opens an `askChoice()` sheet titled with the leg's reg/route
offering **Cancel / Delete Leg / Edit Leg**. Swipe-to-reveal was considered and
deliberately not used: touch gestures can't be verified from the dev
environment, and a stray horizontal drag while scrolling the log is the usual
failure. Delete always asks a second time — it cannot be undone. Deleting has
two edit-state cases that must stay handled:
- deleting **the leg being edited** cancels the edit and clears the fields,
  since saving them would otherwise write into another leg's slot;
- deleting a leg **before** the one being edited decrements `editingIndex`,
  because every later leg shifts down one.

Edit pulls that leg back into the fields with `loadLegForEdit(index)`. `editingIndex` holds its position in
history; Save writes back to that slot instead of appending, so **order and the
original `savedAt` are preserved** (an edited leg keeps its date rather than
jumping to today). Reset Leg doubles as Cancel — the buttons relabel to
"Update Leg" / "Cancel Edit" and the edited card is outlined amber (`.editing`).
- `hasUnsavedLegData()` deliberately ignores a **carried** start, since that was
  filled in automatically — otherwise every hot-load leg would falsely warn.
- **Mission timer is preserved verbatim unless touched.** A saved leg only keeps
  first start / last end / total, not the individual runs, so a multi-run leg
  cannot be rebuilt. It is restored as one segment purely so the times are
  visible, but `editingMission` is written back unchanged unless `missionTouched`
  flips (set by `startTimer`/`endTimer`/`setMissionStart`/`setMissionEnd`).
  Without this, re-saving an untouched multi-run leg would flatten it and
  inflate its total to the whole span. Touching it *does* accept the flattening —
  that's the agreed tradeoff.
- Ground time is always computed live against the leg's actual neighbor in
  history at render time, so an edit that changes leg order or neighbors is
  reflected immediately — there's no stale per-leg value to go out of sync.
- Clear all calls `setEditing(null)`, since indices are meaningless afterwards.

## Settings panel
A gear button in the header opens `#settingsOverlay`, holding the aircraft Reg
and the Notifications controls. **It is an in-page overlay, not a separate
document, and must stay that way**: the leg in progress (`current`, `fuel`,
`timers`, `hoistCount`) lives only in memory until Save Leg, so any real page
navigation would silently destroy a leg mid-sortie. Caching a second page
would be easy; losing the leg is the reason not to.
- **Reg** is edited here but still shown read-only in the header
  (`#regDisplay`), so it's always visible which aircraft is being logged
  against — otherwise a wrong reg is only caught after saving.
- **Notifications on/off** (`NOTIFY_KEY`) gates `sendTelegram()` at the top,
  so events are silenced without clearing the Relay URL — the URL stays put
  and doesn't have to be re-pasted to resume. **Absent means on**, so installs
  from before this existed are unaffected.
- **No Save button.** Every setting commits as you finish it — Reg and Relay
  URL on `change`, the switch on tap — with a toast confirming. Done only
  closes the panel (it still writes the URL silently, since a tap can beat the
  field's own `change` event).
- `.toast` needs its `z-index: 10001`, above the Settings overlay's 9998.
  Without it a toast fired from inside Settings fires *invisibly* behind the
  panel, which is exactly how the old Save button came to look broken.
- **Bingo Fuel** (`BINGO_ENABLED_KEY`) — **absent means off**, the opposite of
  Notifications: this is a brand new block with no prior behavior to preserve,
  and the whole point of the toggle is to keep it off screen until opted in.
  Settings holds Avg Speed / Cruise Fuel Burn / Mission Fuel Burn / Final
  Reserve.

## Bingo Fuel block
Shown on the main page under the Mission card, only when enabled in Settings
(`#bingoBlock`, `updateBingoVisibility()`). Answers "when do I need to leave
station to get back to base with reserve left" from four inputs — Distance
to Base, Speed, Cruise Burn, Mission Burn — plus the Mission Start fuel
reading already captured on the Mission card.
- **Two separate burn rates, not one.** Hover/on-station burn is well above
  cruise, so a single figure would be wrong in whichever direction it wasn't
  set for. **Cruise Burn** feeds the fuel needed to actually fly home
  (`fuelHome = distance/speed * cruiseBurn`); **Mission Burn** feeds how fast
  fuel is dropping right now while still on station (used for both the
  current-fuel estimate and the countdown itself, since that's the rate you're
  burning at until you leave).
- **Speed and both burns pre-fill from Settings** on every fresh leg
  (`applyBingoDefaults()`, called from `clearLegFields()`) but stay editable
  per leg without touching Settings, since the figures can differ day to day.
  **Distance to Base always starts blank** — unlike the others there's no
  stable default for it. None of the four are saved on the leg record; they
  reset the same way whether the leg is fresh or being edited.
- **Bingo Fuel** (static) = fuel needed to fly Distance/Speed at Cruise Burn,
  plus Final Reserve. Recalculates on every keystroke in Distance/Speed/
  either burn (`input` listeners call `updateBingo()` directly, not just the
  1s tick, since these are fields you're actively adjusting under time
  pressure).
- **Time to Bingo** (live) is derived, not re-read: current fuel is estimated
  as Mission Start fuel minus (mission elapsed time × Mission Burn), using
  `timerTotalMs(timers.mission, now)` for elapsed time — the same total the
  Mission timer itself displays, including multiple start/stop runs. This
  assumes a steady burn rate rather than a fresh fuel reading, since you don't
  normally re-enter fuel while still on station. Ticks down every second via
  `tickClock()`. Once it reaches zero, shows "BINGO" and the whole card turns
  red (`.bingo-overdue`) instead of counting into negative time.
- Needs `fuel.mission_start` to compute Time to Bingo — without it, shows a
  prompt instead of a countdown. Bingo Fuel itself only needs Distance/Speed/
  Cruise Burn and displays independently of whether Mission fuel has been
  entered.

## Flight calculator (`#calcOverlay`)
A scratch "can we make it there?" pad, opened by the **÷ button in the header**
next to the gear. Deliberately a header button and *not* buried in Settings:
it's reached mid-flight when something has run long and you need an answer
fast, so it has to be one tap. Same in-page overlay rule as Settings — real
navigation would wipe the leg in progress.
- **Shares nothing with the leg.** It never reads or writes `current`, `fuel`,
  `timers` or history, so a what-if calculation can't corrupt what's being
  logged. Its inputs aren't saved anywhere either; they just live in the DOM
  for the session.
- Inputs: Current Fuel, Distance, Speed, Cruise Burn. Speed and Cruise Burn
  are **seeded from the same Settings values Bingo uses** (`BINGO_SPEED_KEY` /
  `BINGO_CRUISE_BURN_KEY`) — deliberately shared, they're the same aircraft
  figures — but `seedCalcDefaults()` only fills **empty** boxes, so an edit
  made in the calculator survives closing and reopening. Seeding runs on every
  open, not just at init, so a Settings change made this session is picked up.
  Clear wipes all four then re-seeds.
- Outputs: Time (`distance/speed`), Fuel Required (`time × burn`), Fuel
  Remaining (`current − required`). Recomputed on every keystroke.
- **Current Fuel is optional** — Time and Fuel Required stand on their own when
  you're just sizing up a diversion; only Remaining and the reserve check need
  it.
- Checked against Final Reserve (same `BINGO_RESERVE_KEY`): remaining below
  zero reports how far short, remaining below reserve says so, otherwise it
  reports the margin above reserve. Failures turn the value and status red
  (`.calc-warn`). No reserve set means no check, just the bare figures.

## Confirmation dialogs
`window.confirm()` renders as OK/Cancel on iOS Safari with no way to relabel
the buttons, so all prompts use the in-app sheet instead.
`askChoice(message, buttons)` builds its buttons from the list given and
resolves to the chosen `value`; three or more stack vertically so each keeps a
full-width tap target at 375px. `askYesNo(message)` is a thin wrapper over it
returning a boolean. Styles: `confirm-yes` (amber primary), `confirm-danger`
(red, destructive), or none for a plain/cancel button.

## Hosting
GitHub Pages, public repo (required for Pages on the free plan), deployed from `main` branch root. No backend, no build process — files are served as-is.

## Notifications (Telegram, currently working)
- App has a "Notifications" panel; user pastes in a **Relay URL** which is saved to `localStorage`
- On capture/mission events, app POSTs `{text: "..."}` to that Relay URL
- The Relay is a **separate Cloudflare Worker** (not in this repo) — required because Telegram's Bot API doesn't support CORS, so the browser can't call `api.telegram.org` directly
- Worker holds `BOT_TOKEN` and `CHAT_ID` as secrets, forwards to Telegram server-side
- Bot: `@FlightLogs_bot`
- Message format example:
  ```
  ZT-HCT - FACT-SHIP-FACT
  Mission End - 16:45 (Duration: 0h 23m) - Fuel 720kg - Hoists/Slings 3
  ```

## WhatsApp migration — PARKED, revisit only when the user raises it
Telegram works and stays for now. WhatsApp is still on the table but is **not
the active task** — do not start it unless the user explicitly asks.

Constraints found when this was scoped (2026-08-04), to plan around later:
- No free way to auto-send without a human tapping Send — `wa.me` links only
  pre-fill a message, which defeats the point of automatic notifications at
  Lift/Land (exactly the moments the pilot is busiest).
- Real auto-send needs Meta's WhatsApp Business Cloud API: business
  verification, per-message billing, and pre-approved message templates with a
  fixed structure. The current messages are variable-shape (fuel and
  hoists/slings only appear sometimes), so they don't fit a template as-is.
- The Cloud API cannot post into a normal WhatsApp group. Its Groups API only
  works with groups the API itself creates, caps them at 8 participants, and
  requires an Official Business Account.

## Working conventions established so far
- User is non-technical-by-background but capable; give clear step-by-step instructions when something needs doing outside the code (GitHub, Cloudflare dashboard, Telegram/BotFather)
- User tests exclusively on an iPhone via Safari / Home Screen — always consider iOS Safari quirks (native time pickers, `data:` URLs can't be added to Home Screen, `type="number"` inputs can't have cursor position set, etc.)
- Always bump the version after any change to `index.html`, or changes won't show up on the deployed Home Screen app. Two places, same number: `CACHE_NAME` in `sw.js` and `APP_VERSION` in `index.html`.
- User prefers minimal/native-feeling UI — avoid adding extra confirmation dialogs or non-native controls where iOS already provides one
