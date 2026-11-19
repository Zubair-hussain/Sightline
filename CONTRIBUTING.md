# Contributing to Sightline

Thanks for helping make website audits better! All code is **TypeScript**.

## Get started

```bash
git clone https://github.com/Zubair-hussain/Sightline.git
cd Sightline
npm install
npm start          # desktop app
npm run web        # website + web app on http://localhost:8080
npm run typecheck
```

## Project layout

| Folder | What lives there |
|---|---|
| `src/engine/` | Audit modules shared by the app, CLI, web server and MCP (SEO, hreflang, links, website, Cloudflare, brand, test cases, Lighthouse scoring) |
| `src/electron/` | Desktop app + browser-driven audits (performance, Lighthouse, coverage, iPhone, memory) |
| `src/server/` | Website, web app and audit API |
| `src/mcp/` | MCP server for AI apps |
| `renderer/` | The UI (HTML/CSS + `renderer/src/*.ts`) |
| `types/` | Shared types |

## Adding an audit check

1. Find the module in `src/engine/` (or `src/electron/audits/` for browser checks).
2. Push a `check(id, title, status, detail, { fix, items, weight })` — always include a plain-language `fix`.
3. If it matters for launch, link it to a test case in `src/engine/testcases.ts`.
4. Test it: `electron . --smoke=https://example.com --out=./smoke` drives the real UI and writes screenshots + reports.

## Translations

UI strings live in `renderer/src/i18n.ts` and `renderer/src/i18n-more.ts`. Native speakers improving a language are very welcome.

## Pull requests

- One topic per PR, with a clear description and screenshots for UI changes.
- `npm run typecheck` must pass.
- Be kind — see the [Code of Conduct](CODE_OF_CONDUCT.md).
