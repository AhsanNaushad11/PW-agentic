# PW Agentic — Playwright AI Script Generator

A Next.js developer tool that converts **natural language test cases** into working **Playwright TypeScript scripts** using an LLM (Ollama), auto-executes them, and auto-fixes failures in a retry loop.

---

## What This App Does

```
[Natural Language Test Case + URL]
        ↓
POST /api/generate → Ollama (kimi-k2:cloud) → Playwright TypeScript script
        ↓
POST /api/execute → npx playwright test → pass ✅ / fail ❌
        ↓
If fail → send error back to Ollama → regenerate → retry (up to 3x)
        ↓
Final passing script shown in Monaco editor (editable)
```

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router) | TypeScript, Tailwind |
| LLM Client | `ollama` npm package | Typed JS client |
| LLM Model | `kimi-k2:cloud` via Ollama | Cloud-hosted, best for code gen |
| Script Target | Playwright (`@playwright/test`) | Headless Chromium |
| Code Editor | `@monaco-editor/react` | VS Code editor in browser |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Main UI: input form + Monaco editor + console
│   ├── layout.tsx                # Root layout (dark mode)
│   ├── globals.css               # Design tokens
│   └── api/
│       ├── generate/route.ts     # POST /api/generate → calls Ollama
│       └── execute/route.ts      # POST /api/execute → runs script via child_process
└── lib/
    ├── ollama.ts                 # Ollama client wrapper + system prompt + fix-mode
    └── executor.ts               # Writes temp .spec.ts file, runs via npx playwright test
playwright.config.ts              # Headless Chromium config
.env.local                        # Ollama config (gitignored — copy from .env.example)
.env.example                      # Safe template
```

---

## Key Design Decisions

- **Retry loop is client-side** (in `page.tsx`) so state is visible in the UI during each attempt
- **Scripts are written to `os.tmpdir()`** (cross-platform: Linux = `/tmp`, Windows = `AppData\Local\Temp`) and cleaned up after execution
- **`serverExternalPackages`** in `next.config.ts` prevents Next.js from bundling `ollama` and `playwright` (Node-only packages)
- **Model**: `kimi-k2:cloud` — cloud-hosted via Ollama (no GPU needed). Local models are too slow on this machine (Intel Iris Xe only)
- **Test case format**: Plain English natural language only (no Gherkin, no CSV)
- **URL**: User enters it each time as part of the input
- **Max retries**: 3 (set in `page.tsx` as `MAX_RETRIES` and in `.env.local`)

---

## Current Status

> **Phase: MVP functional build complete. UI is a developer tool — not yet polished for end users.**

**Done:**
- ✅ Next.js scaffold with all dependencies
- ✅ Ollama integration (`lib/ollama.ts`) with system prompt and fix-mode
- ✅ Playwright execution engine (`lib/executor.ts`)
- ✅ API routes: `POST /api/generate`, `POST /api/execute`
- ✅ Auto-fix retry loop (client-side, up to 3 attempts)
- ✅ Developer UI: split panel (input left, Monaco editor + console right)
- ✅ `git init` — 3 commits on `master`

**Not yet done (next steps):**
- ⏳ Playwright browser install on Linux (run `npm run pw:install` once)
- ⏳ Test the full generate → execute → fix loop end-to-end
- ⏳ Polish the UI for end users (later phase)
- ⏳ Possible: save/export scripts, script history, multiple test cases

---

## Setup & Running

### Prerequisites
- **Ollama desktop** running at `http://localhost:11434`
- `kimi-k2:cloud` model available in Ollama

### First time setup
```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser binaries (Chromium only)
npm run pw:install

# 3. Copy env config
cp .env.example .env.local
# Edit .env.local if your Ollama runs on a different host/port

# 4. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Available Scripts
```bash
npm run dev          # Start Next.js dev server
npm run pw:install   # Install Playwright browser binaries
npm run pw:test      # Run Playwright tests manually
npm run build        # Production build
npm run lint         # ESLint
```

---

## Environment Variables

See `.env.example` for all variables. Copy to `.env.local`:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=kimi-k2:cloud
MAX_RETRIES=3
```

---

## Agent Context (for AI assistants continuing this work)

> If you are an AI agent reading this: the owner (Ahsan) is a Test Analyst building this as a personal productivity tool. The codebase is functional but untested end-to-end. The priority is **functional correctness over UI polish**. All source files are well-commented. Start by running `npm run dev` and testing the generate → execute loop with a simple test case like:
>
> - **URL**: `https://example.com`
> - **Test case**: `Verify the page title contains "Example Domain"`

---

## Owner

**Ahsan Bin Naushad** — Test Analyst, Risk Associates (Pvt.) Ltd, Karachi
