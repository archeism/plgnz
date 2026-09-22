# plgnz consolidation issue index

GitHub is the canonical status tracker: [milestone #1](https://github.com/archeism/plgnz/milestone/1). This file indexes its published issues and does not duplicate their checklists.

| Key | Issue | Dependencies |
| --- | --- | --- |
| `prior-art` | [#3](https://github.com/archeism/plgnz/issues/3) bounded prior-art decisions | — |
| `contract` | [#4](https://github.com/archeism/plgnz/issues/4) public outcome and ownership contract | #3 |
| `source-cli` | [#5](https://github.com/archeism/plgnz/issues/5) source resolution and diagnostics | #3, #4 |
| `conversion-codex` | [#6](https://github.com/archeism/plgnz/issues/6) Addy/Codex conversion | #3, #4, #5 |
| `lifecycle-codex` | [#7](https://github.com/archeism/plgnz/issues/7) Codex lifecycle persistence | #4, #6 |
| `native-proof-codex` | [#8](https://github.com/archeism/plgnz/issues/8) native Codex proof | #7 |
| `personal-client` | [#9](https://github.com/archeism/plgnz/issues/9) pinned Personal client | #8 |
| `codex-cutover-cleanup` | [#10](https://github.com/archeism/plgnz/issues/10) Codex cutover and cleanup | #9 |
| `harness-claude-code` | [#11](https://github.com/archeism/plgnz/issues/11) Claude Code | #3, #7, #9 |
| `harness-cursor` | [#12](https://github.com/archeism/plgnz/issues/12) Cursor | #3, #7, #9 |
| `harness-omp` | [#13](https://github.com/archeism/plgnz/issues/13) OMP | #3, #7, #9 |
| `harness-dcode` | [#14](https://github.com/archeism/plgnz/issues/14) dcode | #3, #7, #9 |
| `harness-hermes` | [#15](https://github.com/archeism/plgnz/issues/15) Hermes | #3, #7, #9 |
| `harness-openclaw` | [#16](https://github.com/archeism/plgnz/issues/16) OpenClaw | #3, #7, #9 |
| `harness-grok` | [#17](https://github.com/archeism/plgnz/issues/17) Grok Build | #3, #7, #9 |
| `harness-kimi` | [#18](https://github.com/archeism/plgnz/issues/18) Kimi | #3, #7, #9 |
| `harness-zcode-cli` | [#19](https://github.com/archeism/plgnz/issues/19) ZCode CLI | #3, #7, #9 |
| `harness-zcode-desktop` | [#20](https://github.com/archeism/plgnz/issues/20) ZCode Desktop | #3, #7, #9 |
| `harness-gemini-cli` | [#23](https://github.com/archeism/plgnz/issues/23) Gemini CLI native extension (unverified) | #3, #7, #9 |
| `final-parity` | [#26](https://github.com/archeism/plgnz/issues/26) consolidation acceptance | #10–#20, #23 |

OpenCode, Pi, Factory, and Grok Bot are excluded standalone-skill/command routes. They have no migration task; Pi/OpenCode reader/remover support remains only for safe cleanup of prior plgnz-owned installs. Gemini CLI stays listed because a native extension surface is possible but unverified.
