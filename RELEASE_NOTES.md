# Codex Browser Bridge 0.8.1

- Connection recovery: bounded handshake/heartbeat watchdog, retry after temporary browser contention, watchdog alarm on service-worker startup and explicit Reconnect. Invalid-key failures still require user intervention.
- Live diagnostic: MCP 0.8.0 and installed Chromium extension 0.8.0 authenticated and successfully completed a tabs command round trip. The original transient disconnect was not conclusively reproduced.

- Refreshed English/Russian README with clear installer choices, feature/browser comparisons, architecture, privacy and upgrade instructions.
- npm CLI distribution: setup, stdio MCP, extension export, diagnostics, graceful stop/restart and local fixtures. Production runtime/browser assets are allowlisted; dependencies are locked with npm-shrinkwrap.json.
- Python wheel and source distribution: launcher for the bundled Node runtime, version/SHA-256 verification and explicit dependency bootstrap. Node.js >=22 and npm remain prerequisites; Git is not required for either package installation.
- Package state and stable browser exports live outside installed code. Exports detect local edits, and package installs disable Git self-updates and source mutation.
- Manual opt-in registry publishing workflow with separate npm/PyPI environments and trusted publisher support. No registry publication or name ownership is claimed.
- Includes the 0.7 Studio, 38 MCP tools, guarded saved scripts, scoped browser view/User-Agent profiles, fixed external-extension messages and a draggable/hideable launcher.

Validation: 78 independent Node tests and 7 Python tests pass. npm tarball, Python wheel/sdist and browser ZIP builds pass. Packed CLI setup/export, package-mode safeguards, archive contents and bundled integrity pass. The wheel was installed in an isolated target. Clean npm dependency installation is blocked by unavailable registry DNS and an incomplete offline cache. Full npm test and isolated browser runs still hit environment restrictions; see TESTING.md. These are not counted as passing integration tests.

Use docs/PACKAGES.md for installation, migration and first publication. Package commands by registry name become valid only after an authorized release; local .tgz/.whl artifacts can be installed now with dependency access. Reload the exported add-on and restart MCP/bridge after upgrading. The release is non-critical.
