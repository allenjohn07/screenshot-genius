# AGENTS.md

Guidance for AI/code agents working in this repository.

## Mission

Maintain and improve screenshot automation with minimal moving parts, high reliability, and test-backed changes.

## Project Facts

- Runtime entry point: `server.js`
- Tests: `test/server.test.js`
- Package manager: `npm`
- Test command: `npm test`

## Mandatory Workflow For Agents

1. Understand the requested change.
2. Implement the smallest reliable update.
3. Update tests when behavior changes.
4. Run tests **before** any commit recommendation:
   - `npm test`
5. Only consider work complete if tests pass or failures are explicitly reported.

## Behavior Constraints

- Do not break the screenshot processing flow.
- Keep compatibility with both screenshot prefixes:
  - `Screenshot`
  - `Screen Shot`
- Keep filename sanitization filesystem-safe.
- Preserve fallback behavior when Ollama or `tag` tooling is unavailable.

## Documentation Constraints

- Update `README.md` when setup, behavior, or commands change.
- Keep instructions runnable as written.

## Quality Bar

Any change touching watcher logic, rename format, filtering rules, or AI summary sanitization must include test coverage in `test/server.test.js`.
