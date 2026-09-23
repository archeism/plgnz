# Personal → plgnz → Hermes composition

This isolated proof used Personal's neutral bundle, the public Hermes adapter,
and Hermes source revision `c0d7294769a38c17ceae51d8f7995e66e1dcae27`.
It used temporary `HOME`, working directory, `HERMES_HOME`, and plgnz state.
No user profile, authentication material, canonical source tree, network, or
model turn was used.

The bundle contained exactly `addy`, `eval-skills`, `karakeep`, `mattpocock`,
`personal`, `toolbox`, `try-skill`, and `vercel`. Public `plgnz add <bundle>
--target hermes --json` installed all eight as `<name>@personal` into a profile
that initially contained only `config.yaml`; the writer created `plugins/`.
Public `list --json` read all eight back with marketplace `personal`, enabled
state true, and their package and companion roots. Public `doctor --target
hermes --json` returned matching source/native byte proofs for all eight and a
working package-rooted Karakeep MCP command. Its only warnings were expected
staleness-unknown results for the non-Git temporary bundle.

The current Hermes `.venv` Python then ran `PluginManager.discover_and_load()`
against the isolated profile. It exited zero with empty stderr. All eight
portable packages and all eight generated companions were enabled with no
loader error. The native registries contained 74 ordinary skills, eight
`*.plgnz-commands.skills` system-prompt sections, the Addy, Matt Pocock, and
Try Skill namespaced prompt commands, and the portable Karakeep MCP command
rooted in the isolated installed package.

Raw outputs are preserved in the temporary acceptance artifact
`/private/tmp/personal-hermes-native-all-OOpW4r`: `add.json`, `doctor.json`,
`list.json`, `loader-focused.json`, and the empty `loader-focused.stderr`.
The focused Personal cutover, host, and public-client tests passed (24 tests),
as did the Hermes deployment, skip, and runtime deployment checks. This proof
does not claim gateway command injection; the verified prompt injection surface
is the interactive Hermes CLI queue recorded separately in
`hermes-native-loader-c0d7294-20260923.json`.
