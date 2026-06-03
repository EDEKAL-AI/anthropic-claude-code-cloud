# CLAUDE.md

This file provides guidance for AI assistants (including Claude Code) working in this repository.

## Repository Overview

**Repository:** `EDEKAL-AI/anthropic-claude-code-cloud`
**Purpose:** This is the codebase for the Anthropic Claude Code Cloud project maintained by EDEKAL-AI.
**Default branch:** `main`

## Project Structure

Electron + React + TypeScript desktop app for WhatsApp marketing automation via Baileys.
See `README.md` for the full architecture and the ban-risk/ToS disclaimer.

```text
/
├── CLAUDE.md                 # AI assistant guidance (this file)
├── README.md                 # architecture, setup, milestone status
├── electron.vite.config.ts   # main / preload / renderer / worker build
├── electron-builder.yml      # packaging (asarUnpack worker + better-sqlite3)
├── docker/                   # primary-device (emulator/ADB) runbook
└── src/
    ├── shared/               # types, IPC contract, worker protocol, pure logic (+ tests)
    ├── main/                 # db (migrations/repositories), accounts (supervisor +
    │                         #   worker bridge), scheduler, autoreply, emulator, security, ipc
    ├── preload/              # contextBridge bridge (allowlisted channels)
    ├── renderer/             # React UI (Accounts/Contacts/Templates/Campaigns/Inbox)
    └── worker/               # Baileys session — one per account, runs in utilityProcess
```

Key commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev` (run
`pnpm rebuild:electron` before `pnpm dev`; see README for the native-module ABI note).

## Development Workflow

### Branch Naming

- Feature branches: `feature/<description>` or `claude/<description>`
- Bug fixes: `fix/<description>`
- Documentation: `docs/<description>`

### Commits

- Write clear, descriptive commit messages focused on the "why" rather than the "what"
- Keep commits atomic — one logical change per commit
- Do not amend published commits; create new commits instead

### Pull Requests

- PRs should target `main`
- Include a summary and test plan in the PR description
- Do not merge without review unless explicitly authorized

## Coding Conventions

As the project evolves, document language-specific conventions here:

- Follow existing code style and patterns when modifying files
- Do not introduce new dependencies without justification
- Prefer simple, readable code over clever abstractions
- Avoid premature optimization

## Testing

- Run the full test suite before pushing changes
- Add tests for new functionality
- Do not skip or disable existing tests without justification

## Security

- Never commit secrets, API keys, credentials, or `.env` files
- Do not introduce known vulnerabilities (OWASP Top 10)
- Validate all external input at system boundaries

## AI Assistant Guidelines

When working in this repository as an AI assistant:

1. **Read before editing** — Always read a file before modifying it. Understand the context.
2. **Minimal changes** — Only change what is necessary to accomplish the task. Do not refactor surrounding code or add unsolicited improvements.
3. **No speculation** — Do not add features, error handling, or abstractions for hypothetical future needs.
4. **Respect existing patterns** — Follow the conventions already established in the codebase.
5. **Test your changes** — Run tests after making changes to verify correctness.
6. **Commit carefully** — Only commit when explicitly asked. Use descriptive messages.
7. **Ask when uncertain** — If a task is ambiguous, ask for clarification rather than guessing.

## Keeping This File Updated

Update this file when:
- New directories or major modules are added
- Build/test/deploy workflows change
- New coding conventions are established
- Dependencies or tooling changes affect the development process
