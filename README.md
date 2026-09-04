# OSRS GE Analyzer

Local-first OSRS Grand Exchange opportunity analyzer — an Electron desktop app that
ranks the **Top 10 daily opportunities** by momentum, spread, liquidity, risk, and
confidence. No account, no backend, no trading automation.

See `architecture.md`, `implementation-guide.md`, and `sprint-roadmap.md` for the
full design. See `agents.md` for the sprint worklog.

## Prerequisites

- Node.js 22+ (`node --version`)
- npm (`npm --version`)

## Commands

```bash
npm install        # install dependencies
npm run dev        # Vite dev server (browser mode, no IPC bridge)
npm run dev:electron  # full desktop shell (Vite + Electron + IPC)
npm test           # Vitest suite (required green before every commit)
npm run typecheck  # strict typecheck (required clean before every commit)
npm run build      # typecheck + production renderer build
```

## Project structure

```text
electron/        # main process: lifecycle, IPC handlers, services (scheduler stub)
shared/          # IPC channel constants + bridge types (single source of truth)
src/             # React renderer: layout, pages, styles (no analytics here)
core/            # market analytics + ranking (Sprints 5–6; pure, testable, UI-free)
storage/         # history persistence behind repository interfaces (Sprint 4)
tests/           # ipc / app / ui suites run with Vitest + jsdom
```

## Sprint workflow

Every sprint: `Implement → Test → Verify → Document (agents.md) → Commit → Push`.
A sprint is done only when `npm test`, `npm run typecheck`, and `npm run build`
are all green.
