# Codex Browser Bridge

Read [docs/AGENT_SETUP.md](docs/AGENT_SETUP.md) for installation, connection, scoped approvals, long-running tasks and official updates. User instructions and existing authorization take precedence.

- Do not expose `.local/connection.json`, connection tokens, account identifiers or private task history. `.local/`, `dist/` and browser artifacts remain ignored.
- Respect site access rules; never weaken or bypass them through another API, code edits or direct requests.
- Keep Chromium and Firefox manifests/package versions aligned. `update.json` must match the release version; critical classification is a maintainer decision.
- Preserve original user tabs. Cleanup is limited to recorded agent-created temporary tabs.
- Use built-in `view_image` first to inspect screenshots.
- Validate changes with `npm run check`, `npm test`, `npm run package`, and `npm run lint:firefox`. Browser changes should use `test:isolated` / `test:firefox` when available; never seed test grants in the user's installed extension.
- Source updates validate in a separate worktree and never discard pre-existing user edits. Do not publish secrets or change repository visibility without user authorization.
