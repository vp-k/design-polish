# Component Design Checklist

Quick Do/Don't reference for the 6 most common UI components.

## Button

### Do
- Minimum touch target: 44×44px (WCAG 2.5.5)
- Clear visual hierarchy: Primary > Secondary > Tertiary
- Visible hover state (background/shadow change, 150-200ms transition)
- Active/pressed state (scale 0.95-0.98 or darken)
- Disabled state: `opacity: 0.5` + `cursor: not-allowed`
- Loading state: spinner + disable to prevent double-submit
- Consistent padding: min 12px vertical, 24px horizontal
- Icon + text spacing: 8px gap
- Focus state: visible focus ring (2-3px outline, offset 2px) for keyboard users

### Don't
- Text-only without visible boundaries for primary actions
- Multiple primary buttons in same view
- Vague labels ("Click here", "Submit") — use action verbs ("Save changes", "Add to cart")
- Color-only differentiation (accessibility violation)
- Buttons smaller than 44px height (WCAG 2.5.5 minimum touch target)
- Animated buttons that distract from content

---

## Card

### Do
- Consistent border-radius (8-16px) across all cards
- Adequate internal padding (16-24px)
- Clear content hierarchy: Image → Title → Description → Action
- Hover effect: subtle lift (`translateY(-2px)` + shadow increase) or border highlight
- Responsive: stack vertically on mobile, grid on desktop
- Aspect ratio consistency for card images
- Focus state: visible outline for keyboard navigation on clickable cards
- Truncate long text with ellipsis (`line-clamp-2` or `line-clamp-3`)

### Don't
- Mix border-radius sizes within same card grid
- Overload with too many actions (max 2 CTAs per card)
- Cards without any interactive affordance (no hover, no click indication)
- Inconsistent card heights in a grid (use equal height or masonry)
- Dense text blocks without hierarchy
- Shadow too heavy (`blur > 20px` or `opacity > 0.3`)

---

## Modal / Dialog

### Do
- Backdrop overlay: semi-transparent dark (`rgba(0,0,0,0.5)`)
- Center alignment (vertically + horizontally)
- Max width: 480-560px for forms, 640-800px for content
- Close button: top-right corner (X icon) + ESC key support
- Click-outside-to-close for non-critical modals
- Focus trap: keep Tab cycling within modal
- Entry animation: fade + scale (200-300ms, ease-out)
- Exit animation: fade out (150-200ms, ease-in)
- Scroll within modal body if content overflows

### Don't
- Nested modals (modal opening another modal)
- Full-screen modals on desktop (use dedicated page instead)
- No close mechanism (user trapped)
- Auto-open modals on page load (except critical auth/cookie consent)
- Scrolling the background while modal is open
- Modal without `aria-modal="true"` and `role="dialog"`

---

## Input / Form Field

### Do
- Visible label above input (never placeholder-only)
- Min height: 44px (WCAG 2.5.5 touch target minimum)
- Border: 1-2px solid with clear contrast against background
- Focus state: colored border (2-3px) + subtle box-shadow
- Error state: red border + error message below input + `aria-invalid="true"`
- Success state: green border/checkmark for validated fields
- Helper text below input in muted color
- Input type matching content (`type="email"`, `inputmode="numeric"`, etc.)
- Autocomplete attributes for standard fields

### Don't
- Placeholder as label (disappears on focus, accessibility issue)
- Input without visible border (looks like plain text)
- Error messages far from the related field
- Red text without icon (color-only indication)
- Validate on every keystroke (use onBlur)
- Password fields without show/hide toggle
- Required fields without visual indicator (asterisk *)

---

## Navigation

### Do
- Sticky/fixed nav on scroll (with appropriate body padding)
- Active state: highlight current page/section clearly
- Mobile: hamburger menu or bottom tab bar (max 5 items)
- Desktop: horizontal top bar or left sidebar
- Breadcrumbs for sites with 3+ levels of depth
- Skip-to-content link for accessibility (first focusable element)
- Logo links to home page
- Max 7±2 top-level items (Miller's law)

### Don't
- Nav overlapping page content (missing padding/offset)
- No active state indication on current page
- Hamburger menu on desktop (hide navigation unnecessarily)
- Dropdown menus requiring pixel-perfect hover (add delay/padding)
- Horizontal scroll in navigation
- Icon-only nav without tooltips or labels
- Deep nesting (more than 2 levels in dropdown)

---

## Toast / Notification

### Do
- Position: top-right or bottom-right (consistent placement)
- Auto-dismiss: 3-5 seconds for info/success
- Manual dismiss: close button (X) on all toasts
- Color coding: green=success, red=error, yellow=warning, blue=info
- Icon + text for type indication (not color alone)
- Max 3 visible toasts stacked
- Entry: slide-in from edge (200-300ms)
- Exit: fade-out (150ms)
- `role="alert"` or `aria-live="polite"` for screen readers

### Don't
- Toasts that never auto-dismiss (except errors requiring action)
- Cover important UI elements (especially CTAs)
- Toasts for critical errors (use inline error or modal instead)
- Excessive toasts (debounce rapid-fire notifications)
- No icon (rely on color alone for type)
- Center-screen toasts blocking content interaction
- Toast without close button option
