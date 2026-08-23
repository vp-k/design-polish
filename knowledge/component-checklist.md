# Component Design Checklist

Quick Do/Don't reference for the 6 most common UI components.

각 항목은 고정 ID(`DP-C<컴포넌트><번호>`)를 가진다. **리뷰에서 지적할 때는 ID와 위치(파일:라인 또는 선택자)를 함께 인용한다** — ID 없는 서술형 지적은 다음 회차에 대조할 수 없다. 전체 ID 체계는 [failure-rules.md](./failure-rules.md) 참조. ID는 append-only(재사용 금지).

> DP-C105(disabled)·DP-C109(focus)는 자동 계측 규칙 **DP-S001·DP-S002**로도 검사된다. 자동 판정이 있으면 그쪽을 인용한다.

## Button

### Do
- **DP-C101** — Minimum touch target: 44×44px (WCAG 2.5.5)
- **DP-C102** — Clear visual hierarchy: Primary > Secondary > Tertiary
- **DP-C103** — Visible hover state (background/shadow change, 150-200ms transition)
- **DP-C104** — Active/pressed state (scale 0.95-0.98 or darken)
- **DP-C105** — Disabled state: `opacity: 0.5` + `cursor: not-allowed`
- **DP-C106** — Loading state: spinner + disable to prevent double-submit
- **DP-C107** — Consistent padding: min 12px vertical, 24px horizontal
- **DP-C108** — Icon + text spacing: 8px gap
- **DP-C109** — Focus state: visible focus ring (2-3px outline, offset 2px) for keyboard users

### Don't
- **DP-C110** — Text-only without visible boundaries for primary actions
- **DP-C111** — Multiple primary buttons in same view
- **DP-C112** — Vague labels ("Click here", "Submit") — use action verbs ("Save changes", "Add to cart")
- **DP-C113** — Color-only differentiation (accessibility violation)
- **DP-C114** — Buttons smaller than 44px height (WCAG 2.5.5 minimum touch target)
- **DP-C115** — Animated buttons that distract from content

---

## Card

### Do
- **DP-C201** — Consistent border-radius (8-16px) across all cards
- **DP-C202** — Adequate internal padding (16-24px)
- **DP-C203** — Clear content hierarchy: Image → Title → Description → Action
- **DP-C204** — Hover effect: subtle lift (`translateY(-2px)` + shadow increase) or border highlight
- **DP-C205** — Responsive: stack vertically on mobile, grid on desktop
- **DP-C206** — Aspect ratio consistency for card images
- **DP-C207** — Focus state: visible outline for keyboard navigation on clickable cards
- **DP-C208** — Truncate long text with ellipsis (`line-clamp-2` or `line-clamp-3`)

### Don't
- **DP-C209** — Mix border-radius sizes within same card grid
- **DP-C210** — Overload with too many actions (max 2 CTAs per card)
- **DP-C211** — Cards without any interactive affordance (no hover, no click indication)
- **DP-C212** — Inconsistent card heights in a grid (use equal height or masonry)
- **DP-C213** — Dense text blocks without hierarchy
- **DP-C214** — Shadow too heavy (`blur > 20px` or `opacity > 0.3`)

---

## Modal / Dialog

### Do
- **DP-C301** — Backdrop overlay: semi-transparent dark (`rgba(0,0,0,0.5)`)
- **DP-C302** — Center alignment (vertically + horizontally)
- **DP-C303** — Max width: 480-560px for forms, 640-800px for content
- **DP-C304** — Close button: top-right corner (X icon) + ESC key support
- **DP-C305** — Click-outside-to-close for non-critical modals
- **DP-C306** — Focus trap: keep Tab cycling within modal
- **DP-C307** — Entry animation: fade + scale (200-300ms, ease-out)
- **DP-C308** — Exit animation: fade out (150-200ms, ease-in)
- **DP-C309** — Scroll within modal body if content overflows

### Don't
- **DP-C310** — Nested modals (modal opening another modal)
- **DP-C311** — Full-screen modals on desktop (use dedicated page instead)
- **DP-C312** — No close mechanism (user trapped)
- **DP-C313** — Auto-open modals on page load (except critical auth/cookie consent)
- **DP-C314** — Scrolling the background while modal is open
- **DP-C315** — Modal without `aria-modal="true"` and `role="dialog"`

---

## Input / Form Field

### Do
- **DP-C401** — Visible label above input (never placeholder-only)
- **DP-C402** — Min height: 44px (WCAG 2.5.5 touch target minimum)
- **DP-C403** — Border: 1-2px solid with clear contrast against background
- **DP-C404** — Focus state: colored border (2-3px) + subtle box-shadow
- **DP-C405** — Error state: red border + error message below input + `aria-invalid="true"`
- **DP-C406** — Success state: green border/checkmark for validated fields
- **DP-C407** — Helper text below input in muted color
- **DP-C408** — Input type matching content (`type="email"`, `inputmode="numeric"`, etc.)
- **DP-C409** — Autocomplete attributes for standard fields

### Don't
- **DP-C410** — Placeholder as label (disappears on focus, accessibility issue)
- **DP-C411** — Input without visible border (looks like plain text)
- **DP-C412** — Error messages far from the related field
- **DP-C413** — Red text without icon (color-only indication)
- **DP-C414** — Validate on every keystroke (use onBlur)
- **DP-C415** — Password fields without show/hide toggle
- **DP-C416** — Required fields without visual indicator (asterisk *)

---

## Navigation

### Do
- **DP-C501** — Sticky/fixed nav on scroll (with appropriate body padding)
- **DP-C502** — Active state: highlight current page/section clearly
- **DP-C503** — Mobile: hamburger menu or bottom tab bar (max 5 items)
- **DP-C504** — Desktop: horizontal top bar or left sidebar
- **DP-C505** — Breadcrumbs for sites with 3+ levels of depth
- **DP-C506** — Skip-to-content link for accessibility (first focusable element)
- **DP-C507** — Logo links to home page
- **DP-C508** — Max 7±2 top-level items (Miller's law)

### Don't
- **DP-C509** — Nav overlapping page content (missing padding/offset)
- **DP-C510** — No active state indication on current page
- **DP-C511** — Hamburger menu on desktop (hide navigation unnecessarily)
- **DP-C512** — Dropdown menus requiring pixel-perfect hover (add delay/padding)
- **DP-C513** — Horizontal scroll in navigation
- **DP-C514** — Icon-only nav without tooltips or labels
- **DP-C515** — Deep nesting (more than 2 levels in dropdown)

---

## Toast / Notification

### Do
- **DP-C601** — Position: top-right or bottom-right (consistent placement)
- **DP-C602** — Auto-dismiss: 3-5 seconds for info/success
- **DP-C603** — Manual dismiss: close button (X) on all toasts
- **DP-C604** — Color coding: green=success, red=error, yellow=warning, blue=info
- **DP-C605** — Icon + text for type indication (not color alone)
- **DP-C606** — Max 3 visible toasts stacked
- **DP-C607** — Entry: slide-in from edge (200-300ms)
- **DP-C608** — Exit: fade-out (150ms)
- **DP-C609** — `role="alert"` or `aria-live="polite"` for screen readers

### Don't
- **DP-C610** — Toasts that never auto-dismiss (except errors requiring action)
- **DP-C611** — Cover important UI elements (especially CTAs)
- **DP-C612** — Toasts for critical errors (use inline error or modal instead)
- **DP-C613** — Excessive toasts (debounce rapid-fire notifications)
- **DP-C614** — No icon (rely on color alone for type)
- **DP-C615** — Center-screen toasts blocking content interaction
- **DP-C616** — Toast without close button option
