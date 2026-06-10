# Context Export — Ahsan's Playwright AI App Project
_Paste this at the start of your Antigravity conversation to continue where we left off._

---

## Who I Am
- **Name:** Ahsan Bin Naushad
- **Role:** Test Analyst at Risk Associates (Pvt.) Ltd, Karachi (PCI QSA & cybersecurity firm)
- **Stack:** Flutter, .NET/C#, Java, Python, React.js, React Native, Puppeteer (Java), SQL Server
- **Machine (office):** Lenovo ThinkPad E14 Gen 2 — Intel Core i5-1135G7, 16GB RAM, Windows 11 Business, Azure AD joined, App Control enforced, no admin privileges
- **Subscription:** Google AI Pro

---

## What We're Building
A **Next.js web application** that:
1. Accepts test cases as input
2. Sends them to an LLM (via Ollama) to generate **Playwright test scripts**
3. Displays the generated scripts with syntax highlighting
4. Optionally executes the scripts and returns pass/fail results

---

## Decisions Already Made

| Decision | Choice | Reason |
|---|---|---|
| **IDE** | Antigravity IDE (VS Code fork) | Already installed |
| **Agent** | Antigravity Agent Manager | Already installed |
| **Model (in Antigravity)** | Claude Sonnet 4.6 (Thinking) | Best code gen, covered by Google AI Pro |
| **App Framework** | Next.js | React knowledge + Node.js native = Playwright ecosystem fit |
| **LLM Integration** | Ollama npm package (`npm install ollama`) | Clean, typed JS client for Ollama |
| **LLM Model** | `kimi-k2:cloud` via Ollama | Best agentic/coding model in Ollama setup |
| **Script Type** | Playwright (Node.js) | Target automation framework |

---

## Key Technical Notes
- Ollama **desktop app** (already installed) = the server/runtime at `localhost:11434`
- `ollama` **npm package** = still needs to be installed in the Next.js project — these are separate things
- `:cloud` suffix models in Ollama = cloud-hosted inference, Ollama acts as middleware
- Local models (without `:cloud`) are too slow on the ThinkPad (Intel Iris Xe only, no dedicated GPU)

---

## Ollama Basic Usage (Next.js)
```javascript
import ollama from 'ollama'

const response = await ollama.chat({
  model: 'kimi-k2:cloud',
  messages: [
    {
      role: 'system',
      content: 'You are a Playwright test automation expert. Generate clean, well-structured Playwright scripts.'
    },
    {
      role: 'user',
      content: 'Test case: Verify login with valid credentials on https://example.com'
    }
  ]
})

console.log(response.message.content)
```

---

## Proposed App Flow
```
Test Case Input (React UI)
        ↓
Next.js API Route → Ollama (kimi-k2:cloud)
        ↓
Generated Playwright Script (displayed with syntax highlighting)
        ↓
(Optional) Next.js executes script → returns pass/fail to UI
```

---

## Pending Questions (answer these to start scaffolding)
1. **Test case format** — natural language, Excel/CSV, or Gherkin/BDD?
2. **Target environment** — URL passed as input each time, or fixed/hardcoded?
3. **Execution** — just generate and display scripts for now, or also run them and show pass/fail?

---

## Antigravity Setup Status
- ✅ Antigravity IDE installed (VS Code fork, opens separately)
- ✅ Antigravity Agent Manager installed
- ✅ MCP Error resolved (removed unused `datacloud_alloydb_remote` MCP server)
- ✅ Model set to Claude Sonnet 4.6 (Thinking)
- ⏳ Next.js project not yet scaffolded
