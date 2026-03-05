# UX Rules & Anti-Patterns

Common UX rules organized by category. Each rule includes severity (HIGH/MEDIUM/LOW).

## 1. Navigation

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Smooth Scroll | `scroll-behavior: smooth` on html | Jump directly without transition | HIGH |
| Sticky Nav | Add `padding-top` to body = nav height | Let nav overlap first section | MEDIUM |
| Active State | Highlight active nav item (color/underline) | No visual feedback on current location | MEDIUM |
| Back Button | Preserve navigation history (`pushState`) | Break browser back with `location.replace()` | HIGH |
| Deep Linking | Update URL on state/view changes | Static URLs for dynamic content | MEDIUM |
| Breadcrumbs | Use for sites with 3+ levels of depth | Use for flat single-level sites | LOW |

## 2. Animation & Motion

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Motion Budget | Animate 1-2 key elements per view max | Animate everything that moves | HIGH |
| Duration | 150-300ms for micro-interactions | Animations longer than 500ms for UI | MEDIUM |
| Reduced Motion | Check `prefers-reduced-motion` media query | Ignore accessibility motion settings | HIGH |
| Loading States | Skeleton screens or spinners | Leave UI frozen with no feedback | HIGH |
| Hover vs Tap | Use click/tap for primary interactions | Rely only on hover for important actions | HIGH |
| Continuous Anim | Use only for loading indicators | Use for decorative elements | MEDIUM |
| Performance | Use `transform` and `opacity` only | Animate width/height/top/left | MEDIUM |
| Easing | `ease-out` for entering, `ease-in` for exiting | `linear` for UI transitions | LOW |

## 3. Forms & Input

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Input Labels | Always show visible label above/beside input | Placeholder as only label | HIGH |
| Error Placement | Show error below related input field | All errors at top of form | MEDIUM |
| Inline Validation | Validate on blur for most fields | Validate only on submit | MEDIUM |
| Input Types | Use `email`, `tel`, `number`, `url` types | `type="text"` for everything | MEDIUM |
| Autofill | Use `autocomplete` attribute properly | `autocomplete="off"` everywhere | MEDIUM |
| Required Fields | Use asterisk (*) or "(required)" text | No indication of required fields | MEDIUM |
| Password | Toggle show/hide password button | Password always hidden | MEDIUM |
| Submit Feedback | Show loading → success/error state | No feedback after submit | HIGH |
| Mobile Keyboard | Use `inputmode` attribute | Default keyboard for all inputs | MEDIUM |

## 4. Loading & Error States

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Loading Indicator | Show spinner/skeleton for ops > 300ms | No feedback during loading (frozen UI) | HIGH |
| Empty States | Show helpful message + action CTA | Blank empty screens | MEDIUM |
| Error Recovery | Provide clear next steps (retry + help) | Error message without recovery path | MEDIUM |
| Progress | Step indicators or progress bar for multi-step | No indication of progress (step X of Y) | MEDIUM |
| Toast Duration | Auto-dismiss after 3-5 seconds | Toasts that never disappear | MEDIUM |
| Confirmation | Brief success message after action | Silent success (no confirmation) | MEDIUM |

## 5. Layout & Responsive

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Z-Index Scale | Define scale system (10, 20, 30, 50) | Arbitrary `z-index: 9999` | HIGH |
| Content Jump | Reserve space for async content (`aspect-ratio`) | Let images push layout around (CLS — Cumulative Layout Shift) | HIGH |
| Viewport Units | Use `dvh` or account for mobile browser chrome | `100vh` for full-screen mobile layouts | MEDIUM |
| Container Width | Limit text to 65-75 characters per line (`max-w-prose`) | Full viewport width paragraphs | MEDIUM |
| Touch Targets | Minimum 44×44px touch targets | Tiny clickable areas (below 44×44px WCAG minimum) | HIGH |
| Touch Spacing | Minimum 8px gap between touch targets | Tightly packed clickable elements | MEDIUM |
| Mobile First | Start mobile styles, then add breakpoints (`md:`, `lg:`) | Desktop-first causing mobile issues | MEDIUM |
| Font Size | Minimum 16px body text on mobile | Tiny text on mobile (`text-xs` for body) | HIGH |
| Viewport Meta | `width=device-width, initial-scale=1` | Missing viewport meta tag | HIGH |
| Horizontal Scroll | Ensure content fits viewport width | Content wider than viewport on mobile | HIGH |
| Image Scaling | `max-width: 100%` on images | Fixed width images overflow | MEDIUM |

## 6. Accessibility & Performance

| Rule | Do | Don't | Severity |
|------|-----|-------|----------|
| Color Contrast | Minimum 4.5:1 ratio for normal text | Low contrast text (#999 on white = 2.8:1) | HIGH |
| Color-Only Info | Use icons + text in addition to color | Red/green only for error/success | HIGH |
| Alt Text | Descriptive alt text for meaningful images | Empty or missing alt attributes | HIGH |
| Heading Hierarchy | Sequential heading levels (h1→h2→h3) | Skip heading levels (h1→h4) | MEDIUM |
| ARIA Labels | `aria-label` for icon-only buttons | Icon buttons without labels | HIGH |
| Keyboard Nav | Tab order matches visual order | Keyboard traps or illogical tab order | HIGH |
| Form Labels | `<label>` with `for` attribute or wrapping input | Placeholder-only inputs | HIGH |
| Skip Links | Provide "skip to main content" link | 100 tabs to reach content | MEDIUM |
| Focus States | Visible focus rings on interactive elements | Remove outline without replacement | HIGH |
| Image Optimization | Use WebP format + `srcset` with multiple sizes | Unoptimized full-size images | HIGH |
| Lazy Loading | `loading="lazy"` for below-fold images | Load everything upfront | MEDIUM |
| Font Loading | `font-display: swap` or `optional` | Invisible text during font load (FOIT) | MEDIUM |

## Quick Severity Reference

- **HIGH**: Causes usability failures, accessibility violations, or conversion loss
- **MEDIUM**: Degrades experience but doesn't block usage
- **LOW**: Polish items, nice-to-have improvements
