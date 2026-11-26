---
name: design-from-screenshot
description: 스크린샷/이미지에서 UI 코드를 생성. Claude 비전으로 디자인 속성을 추출하고, 디자인 지식 DB(BM25)로 매칭하여 프레임워크별 코드 생성. 디자인 계약이 있으면 계약 토큰을 제약으로 사용.
allowed-tools: Read, Write, Glob, Grep, Bash, Edit
version: "2.8.1"
---

# Design from Screenshot

스크린샷 또는 디자인 이미지를 분석하여 프레임워크별 UI 코드를 생성합니다.
Claude의 비전 능력 + design-polish 지식 기반(스타일/색상/타이포그래피 — 건수는 `search.cjs --help`가 실측해 출력)을 결합합니다.

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

### Phase 0.5: 디자인 계약 로드 (있으면 필수)

이 스킬은 원래 "이미지가 곧 정답"이라는 전제로 동작했습니다. 그래서 계약(`.design-polish/`)이
있는 프로젝트에서 실행하면 **이미지에서 추정한 색/간격/모서리를 그대로 코드에 넣어**
DP-T001~T004 신규 위반을 만들어냈습니다 — design-polish가 잡아내고 사람이 되돌리는 낭비입니다.
계약이 있으면 **이미지는 참조, 계약은 제약**입니다.

```bash
ls .design-polish/design-decisions.json .design-polish/DESIGN.md 2>/dev/null
```

**계약이 있으면:**

```
Read(".design-polish/DESIGN.md")               # 왜 그런 디자인인가 (원칙·톤)
Read(".design-polish/design-decisions.json")   # 기계 검사 가능한 허용 토큰 집합
```

- `tokens.color` / `spacing` / `borderRadius` / `fontFamily` / `shadow`의 `allowed` 목록이
  **생성 코드가 쓸 수 있는 값의 전부**입니다.
- Phase 1에서 이미지로부터 추정한 값은 **가장 가까운 허용 토큰으로 스냅**합니다.
  (예: 이미지에서 `#2E63E8`를 읽었고 계약에 `#3B82F6`가 있으면 → `#3B82F6`)
- Phase 2의 지식 DB 매칭 결과도 계약과 충돌하면 **계약이 이깁니다.** DB는 계약에 없는
  카테고리(레이아웃, 컴포넌트 관용구, 반응형 전략)를 채우는 데만 씁니다.
- 스냅한 항목은 Phase 5에서 "이미지 값 → 채택 토큰"으로 **전부 보고**합니다.
  사용자가 "이건 정말 새 값이어야 한다"고 판단할 근거를 남기기 위함입니다.

**계약에 없는 값이 정말 필요하면** (예: 이미지의 핵심 브랜드 색이 계약에 없음):
임의로 코드에 넣지 말고 **결정으로 승격**합니다.

1. 사용자에게 그 값이 필요한 이유를 제시하고 승인을 받는다.
2. `design-decisions.json`의 `decisions[]`에 **다음 번호의 `DD-NNN`**(기존 최대 번호 + 1)으로
   `{id, title, value, rationale, provenance}`를 append하고, 해당 카테고리 `tokens.<cat>.allowed`에 값을 추가한다.
3. `DESIGN.md`의 결정 표에도 같은 줄을 추가한다 (두 파일은 1:1 동기화가 원칙).
4. 그 다음에 코드에 쓴다.

> `token-baseline.json`은 계약 해시로 무효화되므로, 계약을 고치면 다음 캡처에서
> 자동 재동결됩니다. 사람이 손댈 필요 없습니다.

**계약이 없으면:** 기존대로 이미지 + 지식 DB 기반으로 진행합니다. 다만 Phase 5에서
생성한 토큰 목록을 제시하며 "`/design-renewal`로 계약을 세우면 이후 실행이 이 값들을
지킨다"고 1줄 안내합니다.

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
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/craft-floor.md")
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
5. **상투 패턴을 보태지 않는다** (v2.8.0): `craft-floor.md` 2절 거부 목록(DP-F2xx)에 있는 패턴은 이미지에 없으면 넣지 않는다.
   이미지에 있으면 재현이 우선이다. 고치지 말고 Phase 5 출력에 해당 ID를 참고로 적는다.

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

4. **장인 기준선 대조** (`craft-floor.md` 1·2절)
   - 이미지에서 읽히지 않는 상태(hover·focus·disabled·error·empty)를 채웠는가 (DP-F106)
   - 브라우저 기본 표면을 추출한 팔레트로 지정했는가 (DP-F107)
   - 이미지에 없는 거부 목록 패턴을 보태지 않았는가 (DP-F2xx)

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

   계약이 있으면 `Source` 열에 `Contract: DD-NNN`을 쓰고, 이미지 값에서 스냅한 경우
   `Contract: DD-009 (image #2E63E8 → #3B82F6)` 형태로 **원래 추정값을 함께** 남깁니다.

2. **생성된 코드**
   프레임워크별 완전한 코드 블록

3. **접근성 개선 제안** (원본 이미지에 문제가 있는 경우)
   - 색상 대비 부족 → 대안 색상 제안
   - 터치타겟 작음 → 크기 조정 제안

#### --apply 모드

**적용 전 백업이 선행 조건입니다 (fail-closed).** 새 파일만 만드는 것처럼 보여도
동명 컴포넌트/토큰 파일을 덮어쓰면 사용자 코드가 사라집니다.

```
Read ${CLAUDE_PLUGIN_ROOT}/knowledge/backup-procedure.md
```

- `BACKUP_LABEL`은 `design-from-screenshot`을 사용합니다.
- 백업 지점을 하나도 확보하지 못하면 **파일을 쓰지 않고** 코드 블록으로만 제시합니다.

백업 확보 후 파일을 직접 작성:
- 컴포넌트 파일
- 스타일 파일 (별도인 경우)
- 디자인 토큰 파일 (CSS 변수 / Tailwind config / ThemeData) — **계약이 있으면 계약 값과 일치해야 함**

작성 후 계약이 있는 프로젝트라면 검증을 권합니다:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" <생성한 화면의 라우트>
# tokenDrift.newViolationCount 가 0이어야 정상 (신규 위반 = 계약을 어긴 값이 들어감)
```

## 제약사항

- 이 스킬은 **단일 화면/컴포넌트** 변환에 최적화됨
- 전체 앱 변환은 화면별로 반복 실행 권장
- 이미지 품질이 낮으면 추출 정확도 하락 — 고해상도 스크린샷 권장
- 복잡한 인터랙션(애니메이션, 전환)은 이미지에서 추론 불가 — 설명 필요

## 기존 스킬과의 관계

- **design-polish**: 기존 코드를 개선 (코드 → 더 좋은 코드)
- **design-renewal**: 기존 디자인을 전면 교체 (코드 → 새 코드)
- **design-from-screenshot**: 이미지에서 코드 생성 (이미지 → 코드) ← 이 스킬

세 스킬은 **같은 디자인 계약**(`.design-polish/DESIGN.md` + `design-decisions.json`)을 공유합니다.
계약을 세우는 것은 design-renewal(5-7단계), 지키는지 재는 것은 design-polish(토큰 드리프트 린트),
계약 안에서 새 화면을 만드는 것이 이 스킬입니다.
