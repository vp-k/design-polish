# UX Rules & Anti-Patterns

Common UX rules organized by category. Each rule includes severity (HIGH/MEDIUM/LOW).

각 행은 고정 ID(`DP-U<섹션><번호>`)를 가진다. **리포트/리뷰에서 문제를 지적할 때는 반드시 이 ID를 인용한다**
— "버튼이 좀 애매하다"가 아니라 "DP-U609 위반: focus ring 제거됨". ID 체계 전체는 [failure-rules.md](./failure-rules.md) 참조.
ID는 append-only다 — 규칙을 폐기해도 번호를 재사용하지 않는다(과거 리포트의 참조가 깨지므로).

## 1. Navigation

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U101 | Smooth Scroll | `scroll-behavior: smooth` on html | Jump directly without transition | HIGH |
| DP-U102 | Sticky Nav | Add `padding-top` to body = nav height | Let nav overlap first section | MEDIUM |
| DP-U103 | Active State | Highlight active nav item (color/underline) | No visual feedback on current location | MEDIUM |
| DP-U104 | Back Button | Preserve navigation history (`pushState`) | Break browser back with `location.replace()` | HIGH |
| DP-U105 | Deep Linking | Update URL on state/view changes | Static URLs for dynamic content | MEDIUM |
| DP-U106 | Breadcrumbs | Use for sites with 3+ levels of depth | Use for flat single-level sites | LOW |

## 2. Animation & Motion

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U201 | Motion Budget | Animate 1-2 key elements per view max | Animate everything that moves | HIGH |
| DP-U202 | Duration | 150-300ms for micro-interactions | Animations longer than 500ms for UI | MEDIUM |
| DP-U203 | Reduced Motion | Check `prefers-reduced-motion` media query | Ignore accessibility motion settings | HIGH |
| DP-U204 | Loading States | Skeleton screens or spinners | Leave UI frozen with no feedback | HIGH |
| DP-U205 | Hover vs Tap | Use click/tap for primary interactions | Rely only on hover for important actions | HIGH |
| DP-U206 | Continuous Anim | Use only for loading indicators | Use for decorative elements | MEDIUM |
| DP-U207 | Performance | Use `transform` and `opacity` only | Animate width/height/top/left | MEDIUM |
| DP-U208 | Easing | `ease-out` for entering, `ease-in` for exiting | `linear` for UI transitions | LOW |

## 3. Forms & Input

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U301 | Input Labels | Always show visible label above/beside input | Placeholder as only label | HIGH |
| DP-U302 | Error Placement | Show error below related input field | All errors at top of form | MEDIUM |
| DP-U303 | Inline Validation | Validate on blur for most fields | Validate only on submit | MEDIUM |
| DP-U304 | Input Types | Use `email`, `tel`, `number`, `url` types | `type="text"` for everything | MEDIUM |
| DP-U305 | Autofill | Use `autocomplete` attribute properly | `autocomplete="off"` everywhere | MEDIUM |
| DP-U306 | Required Fields | Use asterisk (*) or "(required)" text | No indication of required fields | MEDIUM |
| DP-U307 | Password | Toggle show/hide password button | Password always hidden | MEDIUM |
| DP-U308 | Submit Feedback | Show loading → success/error state | No feedback after submit | HIGH |
| DP-U309 | Mobile Keyboard | Use `inputmode` attribute | Default keyboard for all inputs | MEDIUM |

## 4. Loading & Error States

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U401 | Loading Indicator | Show spinner/skeleton for ops > 300ms | No feedback during loading (frozen UI) | HIGH |
| DP-U402 | Empty States | Show helpful message + action CTA | Blank empty screens | MEDIUM |
| DP-U403 | Error Recovery | Provide clear next steps (retry + help) | Error message without recovery path | MEDIUM |
| DP-U404 | Progress | Step indicators or progress bar for multi-step | No indication of progress (step X of Y) | MEDIUM |
| DP-U405 | Toast Duration | Auto-dismiss after 3-5 seconds | Toasts that never disappear | MEDIUM |
| DP-U406 | Confirmation | Brief success message after action | Silent success (no confirmation) | MEDIUM |

## 5. Layout & Responsive

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U501 | Z-Index Scale | Define scale system (10, 20, 30, 50) | Arbitrary `z-index: 9999` | HIGH |
| DP-U502 | Content Jump | Reserve space for async content (`aspect-ratio`) | Let images push layout around (CLS — Cumulative Layout Shift) | HIGH |
| DP-U503 | Viewport Units | Use `dvh` or account for mobile browser chrome | `100vh` for full-screen mobile layouts | MEDIUM |
| DP-U504 | Container Width | Limit text to 65-75 characters per line (`max-w-prose`) | Full viewport width paragraphs | MEDIUM |
| DP-U505 | Touch Targets | Minimum 44×44px touch targets | Tiny clickable areas (below 44×44px WCAG minimum) | HIGH |
| DP-U506 | Touch Spacing | Minimum 8px gap between touch targets | Tightly packed clickable elements | MEDIUM |
| DP-U507 | Mobile First | Start mobile styles, then add breakpoints (`md:`, `lg:`) | Desktop-first causing mobile issues | MEDIUM |
| DP-U508 | Font Size | Minimum 16px body text on mobile | Tiny text on mobile (`text-xs` for body) | HIGH |
| DP-U509 | Viewport Meta | `width=device-width, initial-scale=1` | Missing viewport meta tag | HIGH |
| DP-U510 | Horizontal Scroll | Ensure content fits viewport width | Content wider than viewport on mobile | HIGH |
| DP-U511 | Image Scaling | `max-width: 100%` on images | Fixed width images overflow | MEDIUM |

## 6. Accessibility & Performance

| ID | Rule | Do | Don't | Severity |
|----|------|-----|-------|----------|
| DP-U601 | Color Contrast | Minimum 4.5:1 ratio for normal text | Low contrast text (#999 on white = 2.8:1) | HIGH |
| DP-U602 | Color-Only Info | Use icons + text in addition to color | Red/green only for error/success | HIGH |
| DP-U603 | Alt Text | Descriptive alt text for meaningful images | Empty or missing alt attributes | HIGH |
| DP-U604 | Heading Hierarchy | Sequential heading levels (h1→h2→h3) | Skip heading levels (h1→h4) | MEDIUM |
| DP-U605 | ARIA Labels | `aria-label` for icon-only buttons | Icon buttons without labels | HIGH |
| DP-U606 | Keyboard Nav | Tab order matches visual order | Keyboard traps or illogical tab order | HIGH |
| DP-U607 | Form Labels | `<label>` with `for` attribute or wrapping input | Placeholder-only inputs | HIGH |
| DP-U608 | Skip Links | Provide "skip to main content" link | 100 tabs to reach content | MEDIUM |
| DP-U609 | Focus States | Visible focus rings on interactive elements | Remove outline without replacement | HIGH |
| DP-U610 | Image Optimization | Use WebP format + `srcset` with multiple sizes | Unoptimized full-size images | HIGH |
| DP-U611 | Lazy Loading | `loading="lazy"` for below-fold images | Load everything upfront | MEDIUM |
| DP-U612 | Font Loading | `font-display: swap` or `optional` | Invisible text during font load (FOIT) | MEDIUM |

## Quick Severity Reference

- **HIGH**: Causes usability failures, accessibility violations, or conversion loss
- **MEDIUM**: Degrades experience but doesn't block usage
- **LOW**: Polish items, nice-to-have improvements
