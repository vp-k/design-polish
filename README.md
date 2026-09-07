# design-polish v2.6

Claude Code plugin for design intelligence-driven polishing.
Combines built-in design knowledge base + visual comparison + WCAG accessibility checks + trend search.

## Features

- **Design Knowledge Base** — design styles, color palettes, typography pairings, tech stack guides (run `node scripts/search.cjs --help` for the exact counts, which are read from `data/` at runtime)
- **Service Type Rules** — 20 service type UI reasoning rules with automatic detection
- **Component Checklists** — Do/Don't for Button, Card, Modal, Input, Navigation, Toast
- **UX Rules & Anti-Patterns** — 52+ rules across 6 categories
- **BM25 Search Engine** — Node.js search across all design data (no Python dependency)
- **Screenshot Capture** — Puppeteer-based local project capture
- **Reference Site Search** — Mobbin, Godly, Dribbble, SiteInspire, etc.
- **WCAG Accessibility** — axe-core based automated checks (desktop + mobile viewport)
- **9-Level Priority System** — P0 (new contract violations) to P8 (LOW) improvements
- **Auto-Apply** — Code improvements with `--apply`, gated behind a mandatory backup (fail-closed)
- **Screenshot to Code** — `/design-from-screenshot` turns an image into framework code, constrained by the design contract when one exists

### Measurement honesty (v2.6.0)

- **Focus is audited with the keyboard** — `DP-S002` walks the page with `Tab` and diffs `document.activeElement`,
  instead of calling `el.focus()`, which never triggers `:focus-visible`. Pages that did the accessible thing were
  being flagged CRITICAL. When keyboard focus cannot be measured, or the page ships any `:focus-visible` rule,
  a "no visible change" observation is demoted to INFO rather than dropped.
- **Baselines expire with the contract** — `token-baseline.json` stores the `contractHash` it was frozen against.
  Changing the allowed tokens invalidates the freeze and re-freezes automatically
  (`baseline.status`: `fresh` / `reused` / `refrozen(contract changed)`). A baseline no longer outlives its contract.
  A pre-2.6 baseline (no hash) is **adopted, not re-frozen** — its frozen values are kept and the hash is
  recorded on the next run, so debt accumulated before the upgrade is not silently absorbed.
- **Separate penalty caps** — new violations cap at -12, baseline residue at -3 (total -15). Pre-existing debt can
  no longer zero out `styleFit` on its own and make the ratchet pointless.
- **Arithmetic moved out of the model** — `stagnation` (last 3 same-tag runs) and `ruleFailureSummary`
  (severity rollup) are computed by the script and shipped inside `health-score.json`; the skill only quotes them.
  Pivot no longer keys off "P1+P2 >= 5", which required the very analysis it was deciding whether to run.
- **4 severity levels** — `CRITICAL > HIGH > MEDIUM > LOW`, single-sourced from the `RULES` registry in
  `scripts/design-contract.cjs`. The old 6-level scale ranked `MAJOR` *below* `HIGH`. Relative order is unchanged.
- **Wider style measurement** — all four `padding`/`margin` sides plus row/column gap, and all four
  `border-*-color` sides where the border actually has width. Right and bottom drift used to be invisible.
- **Partial-capture honesty** — hitting the 200-distinct-value cap now sets `tokenDrift.measurement: "incomplete"`
  and names the capped categories, instead of scoring as if everything had been seen.
- **Route probing instead of a total abort** — a 404 on one route is recorded as skipped and the run continues;
  only a refused connection aborts, with a structured reason.
- **Unicode-aware search** — the BM25 tokenizer keeps Unicode letters and numbers, so Korean queries and Korean
  text inside `data/*.json` are actually indexed. They previously tokenized to nothing.

### Design contract (v2.5.0)

- **Design contract** — `.design-polish/DESIGN.md` (why) + `.design-polish/design-decisions.json` (what is allowed). Every token value traces back to a decision ID (`DD-NNN`); values with no decision behind them are reported as rule failures. `/design-renewal` now **persists** the design system it derives instead of re-deriving it every run. (If `docs/DESIGN.md` already exists — an auto-complete-loop planning artifact — that document is updated instead of creating a second character contract.)
- **Token drift lint with ratchet** — `DP-T001..005` compare computed styles against the contract. On first contract run the existing violations are frozen into `token-baseline.json`; afterwards only *new* violations are escalated to CRITICAL (-2 each) while baseline residue applies mild pressure (-0.1 each). Brownfield adoption does not deadlock.
- **Korean typography rules** — `DP-K001..003`: serif-fallback stacks that silently render Hangul in Myeongjo, missing `word-break: keep-all` on long paragraphs, excessive negative tracking.
- **Component state contract** — `DP-S001..003`: focus visibility measured by real keyboard traversal and computed-style diffing (WCAG 2.4.7 — see v2.6.0 above), opacity-only disabled states, missing `cursor: pointer` on custom clickables.
- **Numbered rule IDs** — every finding cites a stable ID (`knowledge/failure-rules.md`). UX rules and component checklist items are numbered too (`DP-U###`, `DP-C###`), so reports can be diffed run over run instead of re-arguing taste.
- **Scoring-mode tagging** — history entries record `mode`, `route`, `styleMode` (contract/heuristic) and `viewports`; a baseline is only compared within the same tag, so adopting a contract — or adding a viewport — never produces a false regression.
- **Regression dead-band (+/-3)** — `regression.status` is `improved` / `unchanged` / `regression`, decided by the
  pure `classifyRegression`. Paint and transfer timings jitter by a point or two between runs, so `|diff| <= 3` is
  absorbed as `unchanged`. Consumers must read `status`, never `diff < 0` — otherwise jitter rolls back good
  changes. Stagnation detection uses the same band across the last 3 same-tag runs.

### Measurement engine (v2.2.0)

- **Measured Health Score** — `styleFit`/`performance` are now real measurements, not fixed constants. Browser instrumentation (`page.evaluate`) is split from deterministic pure scorers (`scoreConsistency`/`scorePerformance`), so scoring is reproducible and unit-tested (`npm test`, browser not required).
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
│   ├── failure-rules.md          # Rule ID registry (DP-T/K/S/A/U/C) + severity scale
│   └── backup-procedure.md       # Shared pre-apply backup procedure (fail-closed)
├── data/                         # JSON — BM25 searchable
│   ├── styles.json               # design styles
│   ├── colors.json               # color palettes (with HEX codes)
│   ├── typography.json           # font pairings (with Google Fonts URLs)
│   └── stacks.json               # tech stack guides
├── scripts/
│   ├── capture.cjs               # Puppeteer screenshot + axe-core
│   ├── design-contract.cjs       # Contract loading + pure lint (token drift / ko typo / state)
│   └── search.cjs                # BM25 search engine (Node.js)
├── skills/
│   ├── design-polish/
│   │   └── SKILL.md              # Polish skill specification
│   ├── design-renewal/
│   │   └── SKILL.md              # Renewal skill specification
│   └── design-from-screenshot/
│       └── SKILL.md              # Image to code skill specification
├── commands/
│   ├── design-polish.md          # Polish command definition
│   ├── design-renewal.md         # Renewal command definition
│   └── design-from-screenshot.md # Image to code command definition
├── templates/
│   ├── DESIGN.md                 # Design contract template (product character → decisions)
│   └── design-decisions.json     # Machine-checked token contract template
├── tests/                        # unit tests (npm test) — pure scorers, lints, search
│   ├── scoring.test.cjs          # health score, regression, stagnation, history selection
│   ├── contract.test.cjs         # token drift, ratchet, ko typography, state contract
│   └── search.test.cjs           # tokenizer (incl. Korean) + BM25 determinism
├── package.json
└── README.md
```

## Installation

Install through the Claude Code marketplace, then install the plugin's own dependencies from wherever it landed.
Inside Claude Code the plugin root is available as `${CLAUDE_PLUGIN_ROOT}`:

```bash
cd "${CLAUDE_PLUGIN_ROOT}" && npm install
```

Working on a checkout directly:

```bash
cd plugins/design-polish
npm install    # puppeteer + axe-core only, no Python
npm test       # pure-function tests, no browser needed
```

Do not hard-code an install path — the plugin can live under any marketplace name or a local clone.

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

### /design-from-screenshot — Image to code

```
/design-from-screenshot screenshot.png
/design-from-screenshot hero.png --framework react
/design-from-screenshot mockup.png --framework flutter --style-hint "minimal saas"
/design-from-screenshot landing.png --apply
```

If `.design-polish/design-decisions.json` exists, the image is treated as a *reference* and the contract as a
*constraint*: values estimated from pixels snap to the nearest allowed token, and a genuinely new value must be
recorded as a `DD-NNN` decision (with your approval) before it can appear in code. Without a contract the skill
falls back to the knowledge base as before.

### Comparison

| | /design-polish | /design-renewal | /design-from-screenshot |
|--|---------------|-----------------|-------------------------|
| Input | Existing code | Existing code | An image |
| Scope | Tweaks (CSS fixes) | Full renewal (design system swap) | One screen or component |
| Colors | Contrast fixes | Entire palette replacement | Extracted, snapped to contract |
| Layout | Margin/alignment | Structure reorganization | Reproduced from the image |
| Components | hover/focus fixes | Full style overhaul | Generated |
| Typography | Size/line-height | Font pairing replacement | Estimated, snapped to contract |
| Contract role | Measures compliance | **Writes** the contract | Consumes it as a constraint |
| Risk | Low (non-destructive) | High (large-scale changes) | Medium (new files) |

All three share one backup procedure (`knowledge/backup-procedure.md`); `--apply` aborts when no rollback point
could be created.

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
5. Improvement plan (P0-P8 priority)
6. Result output
7. Backup (fail-closed) then code apply (--apply)
8. Close-the-loop verification — re-capture, before/after diff, rollback when
   regression.status == "regression" (dead-band aware)
```

## Priority System

Severity is a 4-level scale — `CRITICAL > HIGH > MEDIUM > LOW` — single-sourced from the `RULES` registry in
`scripts/design-contract.cjs`.

| Priority | Category | Impact | Typical rule IDs |
|----------|----------|--------|------------------|
| **P0** | **Contract violation (new)** | CRITICAL | `DP-T001..005` with `newCount > 0` |
| P1 | Accessibility (WCAG) | CRITICAL | axe rule ids, `DP-S002` |
| P2 | Touch/Interaction | CRITICAL | `DP-S001`, `DP-S003`, touch targets |
| P3 | Performance | HIGH | FCP, request count, transfer size |
| P4 | Layout/Responsive | HIGH | CLS, viewport breakage |
| P5 | Typography/Color | MEDIUM | `DP-K001..003`, `DP-T002`, `DP-T004` |
| P6 | Animation | MEDIUM | `DP-U6xx` |
| P7 | Style Fit | MEDIUM | `DP-T001`, `DP-T003`, `DP-T005` |
| P8 | Charts/Data | LOW | `DP-C` checklist items |

P0 sits above accessibility because a *new* contract violation is the one class of finding that is both certainly
regressive and cheap to revert — it was introduced by the change under review. Pre-existing violations stay frozen
in the baseline and never reach P0.

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
├── DESIGN.md                   # design contract — why (product character to decisions)
├── design-decisions.json       # design contract — machine-checked allowed tokens
├── token-baseline.json         # ratchet freeze (carries the contractHash it was taken against)
├── health-score.json           # score + breakdown + regression + stagnation + ruleFailureSummary + metrics
├── health-history.jsonl        # append-only history (mode / route / styleMode / viewports tagged)
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
| UNSAFE_NO_SANDBOX | false | Disable the Chromium sandbox (containers/CI only) |
| FULL_PAGE | false | Capture full page |

## Data Sources

Design knowledge is adapted from [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT License), converted from CSV/Python to JSON/Node.js for zero-dependency integration.

## License

MIT
