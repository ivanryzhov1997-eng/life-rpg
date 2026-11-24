# Telegram daily assistant

## Behavior

- A signed-in RPG-LIFE user requests a one-time link code in Settings.
- The user sends `/link CODE` to the existing Telegram bot.
- Ordinary text is summarized by Groq into up to five proposed activities.
- The bot displays the proposal and waits for explicit confirmation.
- Only confirmation writes entries into `life_rpg_saves.data.activityLog`.
- Rejected, expired, duplicate, or replayed updates do not write activity.
- This first version deliberately awards **0 XP**. The current game's rewards are quest-based; inventing XP for free-form actions would change game balance. Confirmed actions appear in the existing Activity Log. XP integration should be a separate, balanced change.

## Required Supabase secrets

Configure only after review and deployment:

- `TELEGRAM_BOT_TOKEN`: token of the existing bot.
- `TELEGRAM_WEBHOOK_SECRET`: random secret used by Telegram's webhook header.
- `GROQ_API_KEY`: already used by the existing Qroq-proxy.
- Supabase server-side service-role / secret key, available in the Edge Function environment.

Never commit secrets or send them in chat.

## Deploy checklist (not performed)

1. Apply the migration to a staging project first.
2. Deploy Edge Function `telegram-assistant` with `verify_jwt = false`. The function validates Telegram's webhook secret and manually verifies Supabase JWTs for `create_link`.
3. Configure required secrets.
4. Set Telegram webhook to `https://PROJECT_REF.supabase.co/functions/v1/telegram-assistant` with `secret_token=TELEGRAM_WEBHOOK_SECRET`.
5. Test linking, proposal, confirm, reject, duplicate update, expired proposal, and unlink using a test Telegram account.
6. Only then consider deploying to production.

## App setup

The Settings screen has a Connect Telegram action. It requires a signed-in RPG-LIFE account. The generated code expires after 10 minutes and is displayed once; send it to the bot as `/link CODE`.

## Commands

- `/start` — help
- `/link CODE` — link Telegram to the signed-in RPG-LIFE account
- `/today` — Telegram activity entries from the last 24 hours
- `/report` — Telegram activity entries from the last 7 days
- `/cancel` — reject the newest pending proposal
- `/unlink` — unlink this Telegram account

## Tests

Run from repository root: `node --test tests/telegram-utils.test.mjs`.
