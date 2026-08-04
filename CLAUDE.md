# Mission Timer — Project Context

## What this is
A single-page web app ("Mission Timer") for helicopter flight/mission logging, used by staff on iOS as a Home Screen web app. Captures Start/Lift/Land/End times, fuel readings, a Mission timer with a Hoists/Slings counter, saved leg history (local storage), plain-text export, and Telegram notifications on key events.

## Files in this repo
- `index.html` — the entire app (HTML/CSS/JS, no build step, no framework)
- `sw.js` — service worker for offline caching. **Bump `CACHE_NAME` every time index.html changes**, or iOS will keep serving a stale cached copy.
- `manifest.json` — web app manifest (name, icons, standalone display mode)
- `icon-180.png`, `icon-192.png`, `icon-152.png`, `icon-167.png`, `icon-1024.png` — Home Screen icons

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

## Next task: migrate notifications from Telegram to WhatsApp
Key constraint discovered during Telegram build: **WhatsApp has no simple free way to auto-send without a human tapping Send** — only `wa.me` links that pre-fill a message. True automatic sending requires Meta's WhatsApp Business Cloud API, which needs business verification and a backend to hold access tokens (the existing Cloudflare Worker could likely be extended for this). Need to decide: accept manual-tap links, or build out the Business API path.

## Working conventions established so far
- User is non-technical-by-background but capable; give clear step-by-step instructions when something needs doing outside the code (GitHub, Cloudflare dashboard, Telegram/BotFather)
- User tests exclusively on an iPhone via Safari / Home Screen — always consider iOS Safari quirks (native time pickers, `data:` URLs can't be added to Home Screen, `type="number"` inputs can't have cursor position set, etc.)
- Always bump `sw.js` cache version after any change to `index.html`, or changes won't show up on the deployed Home Screen app
- User prefers minimal/native-feeling UI — avoid adding extra confirmation dialogs or non-native controls where iOS already provides one
