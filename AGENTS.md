# AGENTS.md

This repository is a real-world baseline implementation of the **Feature-Agent-Spec** architectural pattern. Future agents working on this codebase must adhere to the isolation, flagging, and zero-remnant guidelines.

## Setup Commands
- Install dependencies: `npm install` (installs JSDOM for node-based testing)
- Run local test server: `python3 -m http.server 8000` (or any static server)

## Testing Instructions
- Run full test suite: `npm test`
- Run remnant scan only: `npm run test:remnants` (verifies zero inactive feature leaks)
- Run boot matrix runner only: `npm run test:matrix` (verifies the app initializes cleanly under different flag configurations)

## Code & Architectural Rules
- **No Core Imports**: Files under `core/` must never import from or reference `features/`.
- **Zero Cross-Talk**: Files under `features/feature_a/` must never import from `features/feature_b/`. Communicate via custom events or core registry state.
- **Strict Flagging**: Every feature must be toggleable via `config.js` and its scripts/stylesheets loaded dynamically at runtime in `index.html`.
- **Zero-Remnant Removability**: Deleting a feature's folder and toggling its flag to `false` must leave the application fully functional with all tests passing.
