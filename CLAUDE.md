# Mission Timer — Project Context

## What this is
A single-page web app ("Mission Timer") for helicopter flight/mission logging, used by staff on iOS as a Home Screen web app. Captures Start/Lift/Land/End times, fuel readings, a Mission timer with a Hoists/Slings counter, saved leg history (local storage), plain-text export, and Telegram notifications on key events.

## Files in this repo
- `index.html` — the entire app (HTML/CSS/JS, no build step, no framework)
- `sw.js` — service worker for offline caching. **Bump `CACHE_NAME` every time index.html changes**, or iOS will keep serving a stale cached copy.
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
  disabled. Start fuel is deliberately *not* carried — it is a fresh reading.
  Consequence: Start-Stop time accrues to whichever leg finally records the
  shutdown, covering the whole continuous run. Legs without a shutdown show
  Start-Stop as "—", so nothing is double counted.
- **Ground time** (`groundMinutes` on a saved leg) is previous leg's Land →
  this leg's Lift. Null when either is missing or the result is negative. It is
  computed whenever both exist, regardless of whether the engine was shut down
  in between.

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
