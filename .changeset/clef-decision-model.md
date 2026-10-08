---
"@luca/engine": patch
"@luca/board": patch
---

Shadow mode now asks Cloudflare's Clef instead of Jev (#534). Jev never answered in a board-started run, because its key had no place to live (#522).

The engine reads Clef's credentials from Luca's own env file, `~/.config/luca/.env` (or `$XDG_CONFIG_HOME/luca/.env`), the same for runs the board starts and runs started in a terminal. It never reads a repo's `.env`. To turn it on, put this in that file:

```
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-workers-ai-token
```

- With no credentials, the decision model is off for the run: one line and one `decision_model_off` record at the start, and no asks (no more flood of `jev_failed`).
- If Cloudflare turns the token down, that ask is journaled as `rejected`, the decision model turns off, and the run asks nothing more.
- `luca doctor` has a new "Decision model" check: OK when Clef is set up, else a warning naming the file and the keys to add. It never shows the token.
- `decision_model.model` in `.luca/config.json` picks `@cf/cloudflare/clef` (the default) or `@cf/cloudflare/clef-flash`.
- The journal keeps the `jev_asked`, `jev_answered`, and `jev_failed` kinds, now with the model's name, so old journals still read. The board shows `decision_model_off` as one quiet line.
