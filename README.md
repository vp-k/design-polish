# design-polish v2.5

Claude Code plugin for design intelligence-driven polishing.
Combines built-in design knowledge base + visual comparison + WCAG accessibility checks + trend search.

## Features

- **Design Knowledge Base** — 66 styles, 96 color palettes, 57 typography pairings, 13 tech stack guides
- **Service Type Rules** — 20 service type UI reasoning rules with automatic detection
- **Component Checklists** — Do/Don't for Button, Card, Modal, Input, Navigation, Toast
- **UX Rules & Anti-Patterns** — 52+ rules across 6 categories
- **BM25 Search Engine** — Node.js search across all design data (no Python dependency)
- **Screenshot Capture** — Puppeteer-based local project capture
- **Reference Site Search** — Mobbin, Godly, Dribbble, SiteInspire, etc.
- **WCAG Accessibility** — axe-core based automated checks (desktop + mobile viewport)
- **8-Level Priority System** — P1 (CRITICAL) to P8 (LOW) improvements
- **Auto-Apply** — Code improvements with `--apply` flag

### Design contract (v2.5.0)

- **Design contract** — `.design-polish/DESIGN.md` (why) + `.design-polish/design-decisions.json` (what is allowed). Every token value traces back to a decision ID (`DD-NNN`); values with no decision behind them are reported as rule failures. `/design-renewal` now **persists** the design system it derives instead of re-deriving it every run. (If `docs/DESIGN.md` already exists — an auto-complete-loop planning artifact — that document is updated instead of creating a second character contract.)
- **Token drift lint with ratchet** — `DP-T001..005` compare computed styles against the contract. On first contract run the existing violations are frozen into `token-baseline.json`; afterwards only *new* violations are escalated to CRITICAL (-2 each) while baseline residue applies mild pressure (-0.1 each). Brownfield adoption does not deadlock.
- **Korean typography rules** — `DP-K001..003`: serif-fallback stacks that silently render Hangul in Myeongjo, missing `word-break: keep-all` on long paragraphs, excessive negative tracking.
- **Component state contract** — `DP-S001..003`: focus visibility measured by actually focusing the element and diffing computed style (WCAG 2.4.7), opacity-only disabled states, missing `cursor: pointer` on custom clickables.
- **Numbered rule IDs** — every finding cites a stable ID (`knowledge/failure-rules.md`). UX rules and component checklist items are numbered too (`DP-U###`, `DP-C###`), so reports can be diffed run over run instead of re-arguing taste.
- **Scoring-mode tagging** — history entries record `styleMode` (contract/heuristic) and baselines are only compared within the same mode, so adopting a contract never produces a false regression.

### Measurement engine (v2.2.0)

- **Measured Health Score** — `styleFit`/`performance` are now real measurements, not fixed constants. Browser instrumentation (`page.evaluate`) is split from deterministic pure scorers (`scoreConsistency`/`scorePerformance`), so scoring is reproducible and unit-tested (`npm test`, 16 cases).
- **Style consistency** — rendered-DOM computed-style distribution (distinct fonts/radii/colors/spacing/shadows) → `styleFit` score, framework-agnostic.
- **Performance** — navigation/paint/resource timing (FCP, request count, transfer size) → `performance` score.
- **Mobile a11y pass** — second axe-core run at 375×812 + automatic touch-target audit (interactive elements < 44×44px).
- **Close-the-loop verification** — after `--apply`, capture is re-run and the before/after Health Score diff is checked in the same run; regression triggers rollback (renewal auto-creates a `design-renewal-backup` branch first).
- **Append-only history** — `health-history.jsonl` enables regression & stagnation detection across runs.
- **Route auto-discovery** — capture targets are discovered from framework routing (Next/Nuxt/SvelteKit/React Router) instead of hand-listed.

## Directory Structure

```
plugins/design-polish/
├── knowledge/                    # Markdown — direct Read()
│   ├── industry-rules.md         # 20 service type UI reasoning rules
│   ├── component-checklist.md    # 6 component Do/Don't checklists
│   ├── ux-rules.md               # 52 UX rules across 6 categories (DP-U###)
│   └── failure-rules.md          # Rule ID registry (DP-T/K/S/A/U/C)
├── data/                         # JSON — BM25 searchable
│   ├── styles.json               # 66 design styles
│   ├── colors.json               # 96 color palettes (with HEX codes)
│   ├── typography.json           # 57 font pairings (with Google Fonts URLs)
│   └── stacks.json               # 13 tech stack guides
├── scripts/
│   ├── capture.cjs               # Puppeteer screenshot + axe-core
│   ├── design-contract.cjs       # Contract loading + pure lint (token drift / ko typo / state)
│   └── search.cjs                # BM25 search engine (Node.js)
├── skills/
│   ├── design-polish/
│   │   └── SKILL.md              # Polish skill specification
│   └── design-renewal/
│       └── SKILL.md              # Renewal skill specification
├── commands/
│   ├── design-polish.md          # Polish command definition
│   └── design-renewal.md         # Renewal command definition
├── templates/
│   ├── DESIGN.md                 # Design contract template (product character → decisions)
│   └── design-decisions.json     # Machine-checked token contract template
├── tests/                        # 68 unit tests (npm test) — pure scorers & lints
├── package.json
└── README.md
```

## Installation

```bash
# Clone the plugin
git clone https://github.com/<your-org>/design-polish ~/.claude/plugins/marketplaces/design-polish

# Install dependencies (puppeteer + axe-core only, no Python)
cd ~/.claude/plugins/marketplaces/design-polish
npm install
```

## Usage

In Claude Code:

### /design-polish — Non-destructive polishing

```
/design-polish                    # Full polishing + WCAG check
/design-polish --apply            # Polish + apply changes
/design-polish --wcag-only        # WCAG check only
/design-polish --no-wcag          # Skip WCAG check
/design-polish godly hero         # Search Godly for hero section
/design-polish --apply godly hero # Search + apply
```

### /design-renewal — Full design system renewal

```
/design-renewal                          # Full renewal (analyze + apply)
/design-renewal --analyze                # Analysis only (no code changes)
/design-renewal glassmorphism            # Glassmorphism style renewal
/design-renewal dark                     # Dark theme renewal
/design-renewal minimal godly            # Minimal style, Godly reference
/design-renewal --wcag-only              # WCAG check only
/design-renewal brutalist mobbin hero    # Brutalism, Mobbin hero search
```

### Comparison

| | /design-polish | /design-renewal |
|--|---------------|-----------------|
| Scope | Tweaks (CSS fixes) | Full renewal (design system swap) |
| Colors | Contrast fixes | Entire palette replacement |
| Layout | Margin/alignment | Structure reorganization |
| Components | hover/focus fixes | Full style overhaul |
| Typography | Size/line-height | Font pairing replacement |
| Risk | Low (non-destructive) | High (large-scale changes) |

## search.cjs — BM25 Search CLI

Search the design knowledge base from the command line:

```bash
# Style search
node scripts/search.cjs --domain style "glass modern saas"

# Color palette search
node scripts/search.cjs --domain color "healthcare calm"

# Typography search
node scripts/search.cjs --domain typography "luxury elegant"

# Tech stack guide search
node scripts/search.cjs --domain stack --stack react "performance image"

# Auto-detect domain
node scripts/search.cjs "saas dashboard blue"

# Adjust result count
node scripts/search.cjs --domain color --max 5 "fintech"
```

Output is JSON:
```json
{
  "domain": "style",
  "query": "glass modern saas",
  "results": [
    { "score": 8.93, "data": { "name": "Glassmorphism", ... } }
  ]
}
```

## Workflow

```
0. Project analysis + service type detection + route auto-discovery + screenshot
   + style/perf measurement (desktop) + mobile a11y pass (touch targets)
1. WCAG accessibility check (axe-core, desktop + mobile)
1.5. Design knowledge loading (Read + search.cjs)
1.8. Design Health Score (measured styleFit + performance) + regression/stagnation
1.9. Pivot vs Refine strategy decision
2. Reference site selection
3. Trend search + reference capture
4. Gap analysis (visual + knowledge-based)
5. Improvement plan (8-level priority)
6. Result output
7. Code apply (--apply)
8. Close-the-loop verification — re-capture, before/after diff, rollback on regression
```

## Priority System

| Priority | Category | Impact |
|----------|----------|--------|
| P1 | Accessibility (WCAG) | CRITICAL |
| P2 | Touch/Interaction | CRITICAL |
| P3 | Performance | HIGH |
| P4 | Layout/Responsive | HIGH |
| P5 | Typography/Color | MEDIUM |
| P6 | Animation | MEDIUM |
| P7 | Style Fit | MEDIUM |
| P8 | Charts/Data | LOW |

## WCAG Checks

| Check | WCAG Criteria |
|-------|---------------|
| Color contrast | 4.5:1 (AA) |
| Large text contrast | 3:1 (AA) |
| UI component contrast | 3:1 |
| Touch target size | 44x44px |
| Text size | 12px minimum |
| Link distinction | Underline or 3:1 contrast |

## Output

```
.design-polish/
├── health-score.json           # latest score + breakdown + regression + metrics
├── health-history.jsonl        # append-only score history
├── screenshots/
│   ├── current-main.png
│   └── reference-*.png
└── accessibility/
    ├── wcag-report.json         # desktop
    ├── wcag-report-mobile.json  # mobile
    ├── touch-targets.json       # undersized interactive elements
    └── console-errors.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BASE_URL | http://localhost:3000 | Local server URL |
| OUTPUT_DIR | .design-polish/screenshots | Screenshot directory |
| A11Y_DIR | .design-polish/accessibility | Accessibility report directory |
| WAIT_TIME | 2000 | Wait time after page load (ms) |
| TIMEOUT | 30000 | Page load timeout (ms) |
| RETRIES | 2 | Navigation retry count |
| FULL_PAGE | false | Capture full page |

## Data Sources

Design knowledge is adapted from [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT License), converted from CSV/Python to JSON/Node.js for zero-dependency integration.

## License

MIT
