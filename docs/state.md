# state.json — open-plugin's install ledger

Written by `add` (later phase), read by `doctor` check (3). Path:
`$OPEN_PLUGIN_HOME/state.json` when that var is set (tests), else
`~/.open-plugin/state.json` (never a bare file in `$HOME`). See
`src/paths.ts stateFile()` and `src/state.ts`.

```json
{
  "version": 1,
  "installs": [
    {
      "host": "claude-code",
      "id": "omakase@oh-my-ai-sdk",
      "source": "/Users/chaz/.claude/plugins/marketplaces/oh-my-ai-sdk",
      "sourceSha": "4f6f7f0a414e944c50091dd0d2e987a6b5ec806b",
      "installedAt": "2026-09-16T14:08:23.259Z"
    }
  ]
}
```

- `host`/`id` — exactly the `HostReader.id` and `InstalledPlugin.id` the
  reader reports, so the ledger joins 1:1 onto `listInstalled()`.
- `source` — a local git checkout (marketplace clone or repo) whose HEAD is
  the freshness yardstick. Remote URLs are recorded but v0 cannot resolve
  their head; doctor then reports `! cannot determine head`.
- `sourceSha` — full or host-short sha; comparison is prefix-tolerant
  (claude-code records 12 chars).

Doctor semantics: no record for an install → `! staleness unknown — no record
in state.json (installed by another tool?)`. A missing record is never
treated as fresh and never as the zero sha.
