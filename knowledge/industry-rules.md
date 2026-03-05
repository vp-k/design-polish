# Service Type UI Design Rules

Quick-reference for matching design decisions to service type requirements.

## How to Use
- Detect the project's service type from code signals (see detection table below)
- Apply the recommended patterns, colors, and effects
- Check anti-patterns to avoid common mistakes

## Service Type Detection Signals

| Signal in Code | Service Type |
|---|---|
| payment/cart/product/checkout | Online Shop |
| auth+dashboard+subscription | SaaS Platform |
| medical terms, HIPAA, patient | Healthcare Service |
| chart+trade+wallet+crypto | Finance & Trading |
| course+quiz+progress+learn | Education & Learning |
| portfolio+works+projects | Portfolio |
| .gov, accessibility-first | Government Service |
| chat+AI+prompt+stream | AI & Chatbot |
| menu+reservation+food | Food & Restaurant |
| booking+destination+travel | Travel & Booking |
| property+listing+map | Real Estate |
| game+score+level+player | Gaming |
| article+news+breaking | News & Media |
| feed+like+share+follow | Social Media |
| workout+fitness+health | Fitness & Gym |
| luxury+premium+brand+high-end | Luxury Brand |
| agency+case-study+creative+team | Creative Agency |
| wellness+meditation+mindfulness+calm | Wellness & Health |
| admin+dashboard+analytics+metrics | Admin Dashboard |
| IDE+terminal+code-editor+syntax+CLI | Developer Tool |

---

## Service Type Rules

### 1. SaaS Platform
- **Recommended Style**: Glassmorphism + Flat Design
- **Color Mood**: Trust blue (#2563EB) + Accent contrast
- **Typography**: Professional + Hierarchy
- **Key Effects**: Subtle hover (200-250ms), Smooth transitions
- **Decision Rules**:
  - If UX-focused → prioritize minimalism
  - If data-heavy → add glassmorphism
- **Anti-patterns**: ❌ Excessive animation, ❌ Dark mode by default
- **Severity**: HIGH

### 2. Online Shop
- **Recommended Style**: Vibrant & Block-based
- **Color Mood**: Brand primary + Success green
- **Typography**: Engaging + Clear hierarchy
- **Key Effects**: Card hover lift (200ms), Scale effect
- **Decision Rules**:
  - If luxury → switch to liquid glass
  - If conversion-focused → add urgency colors
- **Anti-patterns**: ❌ Flat design without depth, ❌ Text-heavy pages
- **Severity**: HIGH

### 3. Luxury Brand
- **Recommended Style**: Liquid Glass + Glassmorphism
- **Color Mood**: Premium colors + Minimal accent
- **Typography**: Elegant + Refined typography
- **Key Effects**: Chromatic aberration, Fluid animations (400-600ms — 럭셔리 예외: 일반 기준 150-300ms보다 느린 애니메이션으로 프리미엄 느낌)
- **Decision Rules**:
  - If checkout → emphasize trust
  - If hero needed → use 3D hyperrealism
- **Anti-patterns**: ❌ Vibrant & Block-based, ❌ Playful colors
- **Severity**: HIGH

### 4. Healthcare Service
- **Recommended Style**: Neumorphism + Accessible & Ethical
- **Color Mood**: Calm blue + Health green
- **Typography**: Readable + Large type (16px+)
- **Key Effects**: Soft box-shadow, Smooth press (150ms)
- **Decision Rules**:
  - Must have WCAG AAA compliance
  - If medication → red alert colors
- **Anti-patterns**: ❌ Bright neon, ❌ Motion-heavy, ❌ AI purple/pink gradients
- **Severity**: HIGH

### 5. Finance & Trading
- **Recommended Style**: Glassmorphism + Dark Mode (OLED)
- **Color Mood**: Dark tech colors + Vibrant accents
- **Typography**: Modern + Confident typography
- **Key Effects**: Real-time chart animations, Alert pulse/glow
- **Decision Rules**:
  - Must have security badges
  - If real-time → add streaming data
- **Anti-patterns**: ❌ Light backgrounds, ❌ No security indicators
- **Severity**: HIGH

### 6. Education & Learning
- **Recommended Style**: Claymorphism + Micro-interactions
- **Color Mood**: Playful colors + Clear hierarchy
- **Typography**: Friendly + Engaging typography
- **Key Effects**: Soft press (200ms), Fluffy elements
- **Decision Rules**:
  - If gamification → add progress animation
  - If children → increase playfulness
- **Anti-patterns**: ❌ Dark modes, ❌ Complex jargon
- **Severity**: MEDIUM

### 7. Portfolio
- **Recommended Style**: Motion-Driven + Minimalism & Swiss Style
- **Color Mood**: Brand primary + Artistic
- **Typography**: Expressive + Variable typography
- **Key Effects**: Parallax (3-5 layers), Scroll-triggered reveals
- **Decision Rules**:
  - If creative field → add brutalism
  - If minimal portfolio → reduce motion
- **Anti-patterns**: ❌ Corporate templates, ❌ Generic layouts
- **Severity**: MEDIUM

### 8. Government Service
- **Recommended Style**: Accessible & Ethical + Minimalism & Swiss Style
- **Color Mood**: Professional blue + High contrast
- **Typography**: Clear + Large typography
- **Key Effects**: Clear focus rings (3-4px), Skip links
- **Decision Rules**:
  - Must have WCAG AAA + keyboard navigation
- **Anti-patterns**: ❌ Ornate design, ❌ Low contrast, ❌ Motion effects
- **Severity**: HIGH

### 9. AI & Chatbot
- **Recommended Style**: AI-Native UI + Minimalism & Swiss Style
- **Color Mood**: Neutral + AI Purple (#6366F1)
- **Typography**: Modern + Clear typography
- **Key Effects**: Streaming text, Typing indicators, Fade-in
- **Decision Rules**:
  - Must have conversational UI + context awareness
- **Anti-patterns**: ❌ Heavy chrome, ❌ Slow response feedback
- **Severity**: HIGH

### 10. Food & Restaurant
- **Recommended Style**: Vibrant & Block-based + Motion-Driven
- **Color Mood**: Warm colors (Orange, Red, Brown)
- **Typography**: Appetizing + Clear typography
- **Key Effects**: Food image reveal, Menu hover effects
- **Decision Rules**:
  - Must have high-quality images
  - If delivery → emphasize speed
- **Anti-patterns**: ❌ Low-quality imagery, ❌ Outdated hours
- **Severity**: HIGH

### 11. Travel & Booking
- **Recommended Style**: Aurora UI + Motion-Driven
- **Color Mood**: Vibrant destination + Sky Blue
- **Typography**: Inspirational + Engaging
- **Key Effects**: Destination parallax, Itinerary animations
- **Decision Rules**:
  - If experience-focused → use storytelling
  - Must have mobile booking
- **Anti-patterns**: ❌ Generic photos, ❌ Complex booking
- **Severity**: HIGH

### 12. Real Estate
- **Recommended Style**: Glassmorphism + Minimalism & Swiss Style
- **Color Mood**: Trust Blue + Gold + White
- **Typography**: Professional + Confident
- **Key Effects**: 3D property tour zoom, Map hover
- **Decision Rules**:
  - If luxury → add 3D models
  - Must have map integration
- **Anti-patterns**: ❌ Poor photos, ❌ No virtual tours
- **Severity**: HIGH

### 13. Gaming
- **Recommended Style**: 3D & Hyperrealism + Retro-Futurism
- **Color Mood**: Vibrant + Neon + Immersive
- **Typography**: Bold + Impactful typography
- **Key Effects**: WebGL 3D rendering, Glitch effects
- **Decision Rules**:
  - If competitive → add real-time stats
  - If casual → increase playfulness
- **Anti-patterns**: ❌ Minimalist design, ❌ Static assets
- **Severity**: HIGH

### 14. Creative Agency
- **Recommended Style**: Brutalism + Motion-Driven
- **Color Mood**: Bold primaries + Artistic freedom
- **Typography**: Bold + Expressive typography
- **Key Effects**: CRT scanlines, Neon glow, Glitch effects
- **Decision Rules**:
  - Must have case studies
  - If boutique → increase artistic freedom
- **Anti-patterns**: ❌ Corporate minimalism, ❌ Hidden portfolio
- **Severity**: HIGH

### 15. Wellness & Health
- **Recommended Style**: Organic Biophilic + Soft UI Evolution
- **Color Mood**: Sage green + Warm sand + Lavender
- **Typography**: Calming + Readable typography
- **Key Effects**: Soft press, Breathing animations, Nature-inspired transitions
- **Decision Rules**:
  - Must have privacy-first approach
  - If meditation → add breathing animation
- **Anti-patterns**: ❌ Bright neon, ❌ Motion overload
- **Severity**: HIGH

### 16. Social Media
- **Recommended Style**: Vibrant & Block-based + Motion-Driven
- **Color Mood**: Vibrant + Engagement colors
- **Typography**: Modern + Bold typography
- **Key Effects**: Large scroll animations, Icon animations
- **Decision Rules**:
  - If engagement-metric → add motion
  - If content-focused → minimize chrome
- **Anti-patterns**: ❌ Heavy skeuomorphism, ❌ Accessibility ignored
- **Severity**: MEDIUM

### 17. Fitness & Gym
- **Recommended Style**: Vibrant & Block-based + Dark Mode (OLED)
- **Color Mood**: Energetic Orange (#FF6B35) + Dark background
- **Typography**: Bold + Motivational typography
- **Key Effects**: Progress ring animations, Achievement unlocks
- **Decision Rules**:
  - Must have progress tracking + workout plans
- **Anti-patterns**: ❌ Static design, ❌ No gamification
- **Severity**: HIGH

### 18. News & Media
- **Recommended Style**: Minimalism & Swiss Style + Flat Design
- **Color Mood**: Brand colors + High contrast
- **Typography**: Clear + Readable typography
- **Key Effects**: Breaking news badge, Article reveal animations
- **Decision Rules**:
  - Must have mobile-first reading + category navigation
- **Anti-patterns**: ❌ Cluttered layout, ❌ Slow loading
- **Severity**: HIGH

### 19. Admin Dashboard
- **Recommended Style**: Data-Dense Dashboard + Heat Map & Heatmap Style
- **Color Mood**: Cool-to-Hot gradients + Neutral grey
- **Typography**: Clear + Readable typography
- **Key Effects**: Hover tooltips, Chart zoom, Real-time pulse
- **Decision Rules**:
  - Must have real-time updates
  - If large dataset → prioritize performance
- **Anti-patterns**: ❌ Ornate design, ❌ Slow rendering
- **Severity**: HIGH

### 20. Developer Tool
- **Recommended Style**: Dark Mode (OLED) + Minimalism & Swiss Style
- **Color Mood**: Dark syntax theme + Blue focus
- **Typography**: Monospace + Functional typography
- **Key Effects**: Syntax highlighting, Command palette
- **Decision Rules**:
  - Must have keyboard shortcuts + documentation
- **Anti-patterns**: ❌ Light mode default, ❌ Slow performance
- **Severity**: HIGH
