---
name: design-from-screenshot
description: 스크린샷/이미지에서 UI 코드를 생성. Claude 비전으로 디자인 속성을 추출하고, 디자인 지식 DB(BM25)로 매칭하여 프레임워크별 코드 생성
---

# Design from Screenshot

스크린샷 또는 디자인 이미지를 분석하여 프레임워크별 UI 코드를 생성합니다.
Claude의 비전 능력 + design-polish 지식 기반(67 styles, 96 colors, 57 typography)을 결합합니다.

## 인자

- `$1` (필수): 이미지 파일 경로 (PNG, JPG, WebP)
- `--framework <name>`: 타겟 프레임워크 (미지정시 프로젝트에서 자동 감지)
  - `react` | `next` | `vue` | `nuxt` | `svelte` | `flutter` | `html`
- `--style-hint "<keyword>"`: 스타일 힌트 (예: "glassmorphism", "minimal dark")
- `--apply`: 생성된 코드를 파일로 작성

## 워크플로우 (6 Phases)

### Phase 0: Input Validation

1. 이미지 파일 존재 확인
   ```bash
   [[ -f "$IMAGE_PATH" ]] || echo "ERROR: Image not found"
   ```
2. 프레임워크 감지 (--framework 미지정 시):
   - `pubspec.yaml` 존재 → `flutter`
   - `package.json`에 `next` → `next`
   - `package.json`에 `nuxt` → `nuxt`
   - `package.json`에 `vue` → `vue`
   - `package.json`에 `svelte` → `svelte`
   - `package.json`에 `react` → `react`
   - 그 외 → `html`
3. 스타일링 방식 감지:
   - `tailwind.config.*` → Tailwind CSS
   - `styled-components` in package.json → styled-components
   - `*.module.css` 파일 존재 → CSS Modules
   - `*.scss` 파일 존재 → SCSS
   - 그 외 → 일반 CSS

### Phase 1: Visual Analysis (Claude Vision)

이미지를 Read하여 구조화된 디자인 속성을 추출합니다.

```
Read("$IMAGE_PATH")
```

**추출 항목:**

| 카테고리 | 추출 대상 |
|----------|----------|
| **Layout** | Grid/Flex 구조, 섹션 배치, 정렬, 콘텐츠 영역 비율 |
| **Colors** | 배경색, 텍스트색, 액센트색, CTA 색상 (Hex 추정) |
| **Typography** | 헤딩 크기/무게, 본문 크기, 폰트 패밀리 추정 |
| **Components** | 버튼, 카드, 네비게이션, 폼, 모달, 이미지 영역 |
| **Spacing** | 패딩/마진 패턴, 갭 크기 추정 |
| **Effects** | 그림자, 보더, 라운딩, 그라디언트, 블러, 오버레이 |

**출력 포맷** (내부 사용):
```markdown
## Visual Analysis Result

### Layout
- Structure: [grid/flex/mixed]
- Sections: [식별된 섹션 목록]
- Alignment: [center/left/right]

### Colors (estimated hex)
- Background: #XXXXXX
- Text Primary: #XXXXXX
- Text Secondary: #XXXXXX
- Accent/CTA: #XXXXXX
- Border: #XXXXXX

### Typography
- Heading: [estimated font, size, weight]
- Body: [estimated font, size, weight]

### Components
- [component_type]: [설명]

### Effects
- [effect_type]: [설명]
```

### Phase 2: Knowledge Base Matching

Phase 1에서 추출한 키워드로 디자인 지식 DB를 검색합니다.

**통합 검색 (권장):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain all "<Phase 1에서 추출한 스타일 키워드>"
```

**또는 개별 검색:**
```bash
# 스타일 매칭 (layout + effects 키워드 기반)
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain style "<style keywords>"

# 컬러 매칭 (추출된 색상 분위기 기반)
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain color "<color mood keywords>"

# 타이포그래피 매칭 (추출된 폰트 특성 기반)
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain typography "<typography keywords>"
```

**--style-hint가 제공된 경우:**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain all "<style-hint>"
```

**지식 파일 로드:**
```
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/component-checklist.md")
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/ux-rules.md")
```

**프레임워크별 가이드 (해당 시):**
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain stack --stack <framework> "component layout best practice"
```

### Phase 3: Code Generation

Phase 1(시각 분석) + Phase 2(지식 매칭) 결과를 결합하여 코드를 생성합니다.

#### 생성 원칙

1. **정확한 시각적 재현**: 이미지와 최대한 동일하게
2. **지식 DB 기반 보강**: 이미지에서 명확하지 않은 부분은 매칭된 스타일/색상/타이포로 보완
3. **프레임워크 관용구 준수**: 각 프레임워크의 Best Practice 따름
4. **접근성 기본 내장**: component-checklist.md 기준 준수 (터치타겟 44px, 포커스링, ARIA 등)

#### 프레임워크별 출력 포맷

| Framework | 파일 구조 | 스타일링 |
|-----------|----------|---------|
| **React/Next.js** | `ComponentName.tsx` | Tailwind / CSS Modules (감지된 스타일링 방식) |
| **Vue/Nuxt** | `ComponentName.vue` (SFC) | `<style scoped>` |
| **Svelte** | `ComponentName.svelte` | `<style>` |
| **Flutter** | `component_name.dart` | `ThemeData` + 인라인 스타일 |
| **HTML/CSS** | `index.html` + `style.css` | 시맨틱 HTML + BEM CSS |

#### 반응형 고려

매칭된 스타일의 `cssHints`와 프레임워크 가이드를 참조하여 반응형 브레이크포인트 포함:
- Mobile: 375px
- Tablet: 768px
- Desktop: 1280px

### Phase 4: Quality Check

생성된 코드의 품질을 검증합니다.

1. **Component Checklist 대조**
   `knowledge/component-checklist.md`의 Do/Don't 목록과 비교:
   - 버튼: 최소 44x44px 터치타겟, hover/focus/active 상태
   - 카드: hover 효과, 적절한 패딩
   - 입력: placeholder, 에러/성공 상태, 포커스 링
   - 네비게이션: 키보드 접근성, 현재 페이지 표시

2. **UX Rules 대조**
   `knowledge/ux-rules.md` 검증:
   - 애니메이션 duration: 150-300ms
   - 색상 대비: 4.5:1 이상 (WCAG AA)
   - 폰트 크기: 모바일 16px 이상

3. **접근성 기본 검증**
   - 시맨틱 HTML 태그 사용 (header, main, nav, section)
   - ARIA label 필요한 곳에 추가
   - 이미지에 alt 텍스트
   - 색상만으로 정보 전달하지 않음

### Phase 5: Output

#### 기본 출력 (코드 제시)

1. **디자인 토큰 요약**
   ```markdown
   ## Design Tokens
   | Token | Value | Source |
   |-------|-------|--------|
   | --color-primary | #2563EB | Image analysis |
   | --color-background | #F8FAFC | DB match: SaaS palette |
   | --font-heading | Poppins | DB match: Modern Professional |
   | --font-body | Inter | DB match: Modern Professional |
   | --radius-md | 8px | Image analysis |
   | --shadow-md | 0 4px 6px rgba(0,0,0,0.1) | DB match: Flat Design |
   ```

2. **생성된 코드**
   프레임워크별 완전한 코드 블록

3. **접근성 개선 제안** (원본 이미지에 문제가 있는 경우)
   - 색상 대비 부족 → 대안 색상 제안
   - 터치타겟 작음 → 크기 조정 제안

#### --apply 모드

파일을 직접 작성:
- 컴포넌트 파일
- 스타일 파일 (별도인 경우)
- 디자인 토큰 파일 (CSS 변수 / Tailwind config / ThemeData)

## 제약사항

- 이 스킬은 **단일 화면/컴포넌트** 변환에 최적화됨
- 전체 앱 변환은 화면별로 반복 실행 권장
- 이미지 품질이 낮으면 추출 정확도 하락 — 고해상도 스크린샷 권장
- 복잡한 인터랙션(애니메이션, 전환)은 이미지에서 추론 불가 — 설명 필요

## 기존 스킬과의 관계

- **design-polish**: 기존 코드를 개선 (코드 → 더 좋은 코드)
- **design-renewal**: 기존 디자인을 전면 교체 (코드 → 새 코드)
- **design-from-screenshot**: 이미지에서 코드 생성 (이미지 → 코드) ← 이 스킬
