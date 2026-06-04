# Screenshot Genius

`screenshot-genius` is a local automation tool for macOS that watches your Screenshots folder, asks a local vision model (Ollama + `llava:7b`) for a short context-aware summary, then renames and tags each screenshot automatically.

## What This Project Does

- Watches `~/Desktop/Screenshots` for newly created screenshot files.
- Filters only macOS screenshot name patterns:
  - `Screenshot ...`
  - `Screen Shot ...`
- Captures active app/window context using AppleScript.
- Calls local Ollama (`http://localhost:11434`) with screenshot + context.
- Renames image to:
  - `<app-name>-<git-branch>-<ai-summary>.<ext>`
- Adds Spotlight tags using the `tag` CLI.

## Why This Is Useful

- Makes screenshot history searchable by intent, not just timestamp.
- Preserves local-first workflow (no cloud dependency for image analysis).
- Adds lightweight metadata for Spotlight and Finder filtering.
- Keeps naming deterministic and filesystem-safe.

## Architecture (Current)

- `server.js` - runtime entry point and watcher logic.
  - `startWatcher()` starts Screenshots folder file watch.
  - `processScreenshot(filePath)` handles filtering, analysis, rename, tagging.
  - `analyzeImageWithOllama(filePath, appContext)` performs local vision inference.
  - helper exports for testability: naming and sanitization utilities.
- `test/server.test.js` - Node built-in test suite for naming/sanitization rules.
- `scripts/health-check.js` - validates local runtime prerequisites.

## Requirements

- macOS (AppleScript is used for active window context).
- Node.js 18+ (tested with modern Node versions).
- Ollama installed and running locally.
- Ollama model available: `llava:7b`.
- Optional but recommended: `tag` CLI for Spotlight tag injection.

## Configuration

Copy `.env.example` to `.env` and adjust values if needed:

```bash
cp .env.example .env
```

Supported environment variables:

- `SCREENSHOT_DIR` (default: `~/Desktop/Screenshots`)
- `OLLAMA_URL` (default: `http://localhost:11434/api/generate`)
- `OLLAMA_MODEL` (default: `llava:7b`)
- `WATCH_SETTLE_MS` (default: `1200`)
- `DEDUPE_WINDOW_MS` (default: `5000`)

## Setup

```bash
npm install
ollama serve
ollama pull llava:7b
npm run health
npm run dev
```

## How To Verify End-to-End

1. Start Ollama (`ollama serve`) in one terminal.
2. Start app (`npm run dev`) in project root.
3. Take a screenshot (saved to your Screenshots folder).
4. Confirm terminal logs:
   - `New Screenshot Detected`
   - `Sending to Ollama`
   - `Renamed to: ...`
5. Confirm the screenshot filename changed to the generated format.

## Test Commands

```bash
npm test
```

This project uses Node's built-in test runner (`node --test`), so no extra test framework is required.

## Useful Commands

```bash
npm run dev
npm run health
npm test
```

## Failure Modes and Behavior

- Ollama unavailable:
  - file still renames with fallback summary (`analyzed-image`).
- `tag` command unavailable:
  - rename still succeeds, tagging logs an error.
- Temporary watch issues:
  - watcher logs error and can be restarted with `npm run dev`.
- Duplicate file events:
  - dedupe window suppresses repeated processing for the same file path.

## AI Review Checklist

This repository is considered healthy if:

- `npm test` passes.
- Running `npm run dev` starts watcher without immediate crash.
- A new screenshot in the watched folder gets processed once (no duplicate processing loop).
- Output filename is sanitized and stable.
- Core behavior is documented and reproducible from this README.
