---
name: design-renewal
description: 디자인 전면 리뉴얼. 서비스 유형 자동 감지 → data/ 지식 기반에서 스타일/팔레트/타이포 자동 선택 → CSS 변수/테마 토큰/색상 팔레트/타이포그래피/컴포넌트 스타일/레이아웃 전면 교체. WCAG 접근성 체크 포함. /design-renewal 명령으로 실행.
allowed-tools: Read, Write, Glob, Grep, Bash, WebSearch, Edit
version: "1.0.0"
---

# 디자인 전면 리뉴얼 스킬 v1.0

디자인 지식 기반(서비스 유형별 규칙, 컴포넌트 체크리스트, UX 규칙) + 실시간 시각 비교(Puppeteer 스크린샷) + WCAG 자동 검사(axe-core) + 트렌드 검색(WebSearch) 통합 전면 리뉴얼.

**design-polish와의 차이:**

| | /design-polish | /design-renewal |
|--|---------------|-----------------|
| 수준 | 다듬기 (CSS 보정) | 전면 리뉴얼 (디자인 시스템 교체) |
| 색상 | 대비 보정 | 팔레트 전체 교체 |
| 레이아웃 | 여백/정렬 수정 | 구조 재배치 |
| 컴포넌트 | hover/focus 보정 | 스타일 전면 변경 |
| 타이포 | 크기/행간 조정 | 폰트 페어링 교체 |
| 위험도 | 낮음 (비파괴적) | 높음 (대규모 변경) |

### 지식 기반 리소스
- **knowledge/**: 서비스 유형별 UI 규칙, 컴포넌트 체크리스트, UX 규칙 (마크다운 직접 Read)
- **data/**: 66개 디자인 스타일, 96개 색상 팔레트, 57개 타이포그래피, 13개 기술 스택 가이드 (JSON + BM25 검색)
- **scripts/search.cjs**: Node.js BM25 검색 엔진

## 인수

- `--analyze`: (옵션) 분석 + 리뉴얼 계획만 출력, 코드 적용하지 않음
- `--wcag-only`: (옵션) WCAG 접근성 체크만 수행
- `--no-wcag`: (옵션) WCAG 체크 생략
- `--style <keyword>`: (옵션) 원하는 스타일 방향 (예: glassmorphism, minimal, dark)
- `--site <name>`: (옵션) 레퍼런스 사이트 (미지정시 프로젝트 유형에 맞게 자동 선택)
- `--keyword <term>`: (옵션) 기능 키워드 (미지정시 전체 리뉴얼)

### 입력 검증

- `--style` 값: 영문자, 숫자, 하이픈만 허용 `/^[a-zA-Z0-9-]+$/`
- `--site`, `--keyword` 값: 영문자, 숫자, 하이픈, 공백만 허용 `/^[a-zA-Z0-9 -]+$/`

검증 실패 시:
> "입력값은 영문자, 숫자, 하이픈만 사용할 수 있습니다. 예: glassmorphism, dark-mode, minimal-clean"

사용자에게 재입력을 요청합니다.

### 상호배타 옵션

`--wcag-only`와 `--no-wcag`는 동시 사용할 수 없습니다. 동시 지정 시:
> "⚠ --wcag-only와 --no-wcag는 동시에 사용할 수 없습니다. 하나만 선택해주세요."

## 사용 예시

```
/design-renewal                                # 서비스 유형 자동 감지 → 자동 스타일 선택 → 전면 리뉴얼
/design-renewal --style glassmorphism          # glassmorphism 스타일로 리뉴얼
/design-renewal --analyze                      # 리뉴얼 계획만 출력
/design-renewal --wcag-only                    # WCAG 접근성 체크만
/design-renewal --no-wcag --style dark         # WCAG 생략, 다크 스타일 리뉴얼
/design-renewal --site godly --keyword hero    # Godly에서 hero 참조하여 리뉴얼
/design-renewal --analyze --style minimal      # minimal 스타일 리뉴얼 계획만
```

---

## 옵션별 플로우 분기

```
[기본 - 인수 없이 실행]
0단계 → 1단계 → 1.5단계 → 2~6단계 → 7단계 (전면 리뉴얼 적용)

[--wcag-only]
0단계 → 1단계 → 결과 출력 (종료)

[--no-wcag]
0단계 → 1.5단계(1단계 건너뜀) → 2~6단계 → 7단계

[--analyze]
0단계 → 1단계 → 1.5단계 → 2~6단계 → 종료 (7단계 건너뜀)
```

---

## 실행 플로우 개요

```
전제조건 확인
    ↓
0단계: 프로젝트 분석 + 서비스 유형 감지 + 스크린샷 캡처 [Glob, Read, Bash]
    ↓
1단계: WCAG 접근성 체크 (axe-core) [Bash, Read]
    ↓
1.5단계: 디자인 지식 로딩 + 스타일 자동 선택 [Read, Bash]
    ↓
2단계: 레퍼런스 사이트 선택
    ↓
3단계: 트렌드 검색 → 레퍼런스 캡처 [WebSearch, Bash]
    ↓
4단계: Gap 분석 (시각 비교 + 지식 기반) [Read]
    ↓
5단계: 리뉴얼 계획 도출 (8단계 우선순위)
    ↓
6단계: 결과 출력
    ↓
7단계: 전면 리뉴얼 코드 적용 [Edit, Bash]
    ↓
Pre-delivery 체크리스트
```

---

## 전제조건 확인

실행 전 다음 조건을 확인합니다:

### 1. 개발 서버 실행 확인

```bash
# Mac/Linux - 서버 상태 확인
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

```powershell
# Windows PowerShell - 서버 상태 확인
try { (Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 5).StatusCode } catch { 0 }
```

**자동 포트 감지** (서버가 3000이 아닐 수 있음):

```bash
# Mac/Linux - 실행 중인 개발 서버 포트 탐지
lsof -i -P | grep LISTEN | grep -E ':(3000|5173|8080|4200)'
```

```powershell
# Windows PowerShell - 실행 중인 개발 서버 포트 탐지
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,5173,8080,4200 }
```

서버가 실행 중이 아니면 사용자에게 안내:
> "개발 서버를 먼저 실행해주세요. (예: npm run dev)"

### 2. 플러그인 의존성 확인

```bash
# 플러그인 디렉토리에서 npm install 실행 여부 확인
ls ~/.claude/plugins/marketplaces/devncat/plugins/design-polish/node_modules/puppeteer
```

없으면 안내:
> "플러그인 의존성을 설치해주세요: cd ~/.claude/plugins/marketplaces/devncat/plugins/design-polish && npm install"

### 3. Node.js 확인

```bash
node --version
```

---

## 0단계: 프로젝트 분석 + 서비스 유형 감지

**사용 도구**: `Glob`, `Read`, `Bash`

### 프로젝트 유형 감지

- 디렉토리 구조: `src/`, `components/`, `pages/`, `app/` 등
- 프레임워크: React, Vue, Flutter, Next.js, Nuxt 등
- 스타일링: CSS, Tailwind, styled-components, CSS Modules, SCSS 등

### 서비스 유형 감지

프로젝트 코드에서 서비스 유형 신호를 자동 감지합니다:

| 감지 신호 | 서비스 유형 |
|----------|------------|
| 결제/장바구니/상품/checkout 코드 | Online Shop |
| 인증+대시보드+subscription | SaaS Platform |
| 의료 용어, HIPAA, patient | Healthcare Service |
| 차트+거래+지갑+crypto | Finance & Trading |
| 학습+퀴즈+진도+course | Education & Learning |
| 포트폴리오+작품+projects | Portfolio |
| .gov, 접근성 중심 | Government Service |
| chat+AI+prompt+stream | AI & Chatbot |
| 메뉴+예약+food | Food & Restaurant |
| booking+destination+travel | Travel & Booking |
| property+listing+map | Real Estate |
| game+score+level+player | Gaming |
| article+news+breaking | News & Media |
| feed+like+share+follow | Social Media |
| workout+fitness+health | Fitness & Gym |
| 럭셔리+프리미엄+브랜드+high-end | Luxury Brand |
| 에이전시+케이스스터디+creative+팀 | Creative Agency |
| 웰니스+명상+마음챙김+calm | Wellness & Health |
| admin+대시보드+analytics+지표 | Admin Dashboard |
| IDE+터미널+코드에디터+syntax+CLI | Developer Tool |

**감지 방법**: `Grep`으로 주요 코드 파일에서 키워드 빈도 분석, 가장 높은 점수의 서비스 유형을 선택합니다.

### 디자인 파일 탐지

| 유형 | 패턴 |
|------|------|
| 컴포넌트 | `**/*.tsx`, `**/*.jsx`, `**/*.js`, `**/*.vue`, `**/*.svelte`, `**/*.dart` |
| 스타일 | `**/*.css`, `**/*.scss`, `**/tailwind.config.*` |
| 레이아웃 | `**/layout.*`, `**/App.*`, `**/page.*`, `**/_app.*` |

### 현재 디자인 스크린샷 캡처

**Bash로 캡처 스크립트 실행:**

```bash
# 캡처 스크립트 실행 (${CLAUDE_PLUGIN_ROOT}는 플러그인 설치 경로로 자동 치환됨)
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" / /about /pricing

# 포트 변경시
BASE_URL=http://localhost:5173 node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" /
```

**저장 위치**: `.design-polish/screenshots/current-*.png`

### 캡처 후 Read로 이미지 분석

```
Read(".design-polish/screenshots/current-main.png")
```

분석 항목:
- 레이아웃 구조
- 색상 팔레트
- 타이포그래피
- 컴포넌트 스타일

---

## 1단계: WCAG 접근성 체크

**사용 도구**: `Bash`, `Read`

### 체크 실행

```bash
# WCAG 체크 포함 캡처
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" --wcag /
```

### 체크 항목 (axe-core 기반)

| 카테고리 | 체크 항목 | WCAG 기준 |
|----------|----------|-----------|
| 색상 대비 | 텍스트-배경 대비 | 4.5:1 (AA) |
| 색상 대비 | 대형 텍스트 대비 | 3:1 (AA) |
| 색상 대비 | UI 컴포넌트 대비 | 3:1 |
| 텍스트 크기 | 최소 텍스트 크기 | 12px 이상 권장 |
| 터치 타겟 | 최소 타겟 크기 | 44x44px (모바일) |
| 링크 | 링크 구분 | 밑줄 또는 3:1 대비 |

### 결과 저장

```
.design-polish/
├── screenshots/
│   └── current-main.png
└── accessibility/
    └── wcag-report.json
```

### 결과 확인

```
Read(".design-polish/accessibility/wcag-report.json")
```

---

## 1.5단계: 디자인 지식 로딩 + 스타일 자동 선택

**사용 도구**: `Read`, `Bash`

0단계에서 감지된 서비스 유형/기술 스택 정보를 기반으로 디자인 지식을 로딩합니다.

### 마크다운 직접 로딩 (필수 — 매 실행시)

```
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/industry-rules.md")
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/component-checklist.md")
Read("${CLAUDE_PLUGIN_ROOT}/knowledge/ux-rules.md")
```

### 스타일 자동 선택 (--style 미지정시)

`--style`이 지정되지 않은 경우, 감지된 서비스 유형과 industry-rules.md의 추천 스타일을 기반으로 자동 선택합니다:

```bash
# 0단계에서 감지된 서비스 유형 키워드를 사용
# 예: SaaS Platform 감지 시
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain style "saas dashboard minimal"

# 예: Online Shop 감지 시
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain color "ecommerce shopping vibrant"

# 예: Healthcare Service 감지 시
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain typography "medical clean accessible"
```

### --style 지정시

사용자가 `--style <keyword>`로 방향을 지정한 경우, 해당 키워드로 검색합니다:

```bash
# 예: --style glassmorphism
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain style "glassmorphism"
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain color "glassmorphism translucent"
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain typography "glassmorphism modern"
```

### 리뉴얼 대상 결정

스타일/색상/타이포 검색 결과를 종합하여 교체할 디자인 토큰을 결정합니다:
- **색상 팔레트**: Primary, Secondary, Accent, Background, Text 색상
- **타이포그래피**: Heading + Body 폰트 페어링
- **스타일 토큰**: border-radius, shadow, spacing scale
- **테마**: 라이트/다크 모드 설정

```bash
# 기술 스택 가이드 (코드 적용 시에만)
# 예: React 프로젝트 감지 시
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain stack --stack react "theming css-variables"
```

### 검색 예시

| 감지된 서비스 유형 | 스타일 검색 | 색상 검색 | 타이포 검색 |
|-------------------|-----------|----------|-----------|
| SaaS Platform | "saas dashboard minimal" | "saas professional trust" | "modern professional clean" |
| Online Shop | "ecommerce vibrant card" | "ecommerce shopping" | "ecommerce clean shopping" |
| Healthcare Service | "healthcare accessible calm" | "healthcare calm" | "medical clean accessible" |
| Finance & Trading | "fintech dark glass" | "fintech crypto" | "financial trust" |
| Education & Learning | "education playful friendly" | "education playful" | "playful friendly" |
| Wellness & Health | "wellness organic biophilic" | "wellness nature calm" | "calming soft rounded" |

---

## 2단계: 레퍼런스 사이트 선택

**사용 도구**: 판단 로직

### --site 미지정시 자동 선택

| 프로젝트 유형 | 판단 기준 | 우선 사이트 | 대체 사이트 |
|--------------|----------|-------------|------------|
| 앱 UI/UX | Flutter, React Native, 모바일 우선 | Mobbin | Page Flows, Refero |
| 모던 웹/SaaS | Next.js, Nuxt, 대시보드 | Godly | Dark Mode Design, Awwwards |
| 감각적/예술적 | 포트폴리오, 갤러리, 아트 키워드 | SiteInspire | Savee, Behance |
| 랜딩페이지 | 단일 페이지, 마케팅 중심 | Lapa Ninja | Httpster |
| UI 디테일 | 컴포넌트 중심, 버튼/카드 등 | Dribbble | - |

---

## 3단계: 트렌드 검색

**사용 도구**: `WebSearch`, `Bash`

### 3-1. WebSearch로 레퍼런스 검색

**기능 단위 검색 (업종별 X)**

```
올바른 검색:
- site:mobbin.com onboarding flow
- site:godly.website hero section
- site:dribbble.com dashboard UI 2024

잘못된 검색:
- "금융 앱 디자인"
- "게임 앱 UI"
```

### 3-2. 검색 결과에서 URL 추출

WebSearch 결과에서 유용한 레퍼런스 URL을 2-3개 선정.

### 3-3. Bash로 레퍼런스 캡처

```bash
# 단일 레퍼런스 캡처
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" ref "https://dribbble.com/shots/..." hero

# 여러 개 캡처 (브라우저 재사용으로 효율적)
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.cjs" ref "https://site1.com" ref1 "https://site2.com" ref2
```

**저장 위치**: `.design-polish/screenshots/reference-*.png`

### 검색 실패시 (자동 처리)

1. **대체 사이트로 재시도**: 위 표의 대체 사이트 순서대로
2. **site: 제거**: 일반 웹 검색으로 전환
3. **키워드 일반화**: 예) "checkout" → "ecommerce flow"

---

## 4단계: Gap 분석 (시각 비교 + 지식 기반)

**사용 도구**: `Read`

### Read로 이미지 비교 분석

```
Read(".design-polish/screenshots/current-main.png")
Read(".design-polish/screenshots/reference-hero.png")
```

### 분석 영역

| 영역 | 분석 항목 | 지식 기반 참조 |
|------|----------|---------------|
| 레이아웃 | 그리드, 여백, 정보 계층, CTA 위치 | ux-rules.md → Layout |
| 타이포그래피 | 폰트, 크기, 행간, 웨이트 | search.cjs typography 검색 결과 |
| 색상 | 팔레트, 대비, 다크모드 지원 | search.cjs color 검색 결과 |
| 인터랙션 | 호버, 전환, 애니메이션, 로딩 | ux-rules.md → Animation |
| 컴포넌트 | 버튼, 카드, 입력, 모달, 토스트 | component-checklist.md |
| 상태 | 로딩/성공/실패/빈 상태 처리 | ux-rules.md → Loading & Error |
| **접근성** | **WCAG 위반 항목, 터치 타겟, 포커스 표시** | ux-rules.md → Accessibility |
| **서비스 유형 적합성** | **industry-rules.md 기준 스타일/색상 일치 여부** | industry-rules.md |
| **스타일 매칭** | **search.cjs 검색 결과와 현재 디자인 비교** | search.cjs style 검색 결과 |

### 리뉴얼 추가 분석

1. **현재 디자인 시스템 파악**: CSS 변수, 테마 토큰, 색상 코드, 폰트 사용 현황
2. **교체 대상 식별**: 현재 값 → 새 값 매핑 테이블 작성
3. **영향 범위 분석**: 변경 시 영향받는 파일 목록

---

## 5단계: 리뉴얼 계획 도출 (8단계 우선순위)

### 우선순위 분류

| 우선순위 | 카테고리 | 영향 | 예시 |
|---------|---------|------|------|
| **P1** | 접근성 (WCAG 위반) | CRITICAL | 대비 부족, 터치 타겟 미달, 포커스 미표시 |
| **P2** | 터치/인터랙션 | CRITICAL | cursor 미지정, 타겟 크기 미달, hover 없음 |
| **P3** | 성능 | HIGH | 이미지 미최적화, reduced-motion 미지원 |
| **P4** | 레이아웃/반응형 | HIGH | CLS, 모바일 깨짐, 뷰포트 이슈 |
| **P5** | 타이포/색상 | MEDIUM | 행간 부족, 서비스 유형 부적합 색상, 폰트 미매칭 |
| **P6** | 애니메이션 | MEDIUM | 트랜지션 누락, 과도한 모션, 타이밍 이슈 |
| **P7** | 스타일 적합성 | MEDIUM | 서비스 유형별 추천 스타일과 불일치 |
| **P8** | 차트/데이터 | LOW | 차트 접근성, 데이터 시각화 개선 |

각 개선안에는 다음 정보를 포함합니다:
- 대상 파일 경로
- 구체적인 변경 내용 (현재 값 → 새 값)
- 참조 근거 (knowledge 파일, search.cjs 결과, WCAG 기준 등)

---

## 6단계: 결과 출력

### 출력 형식

```markdown
## 프로젝트 요약

[프레임워크], [스타일링 방식] 기반 [프로젝트 유형]
감지된 서비스 유형: [서비스 유형명]
선택된 리뉴얼 스타일: [스타일명] (자동 감지 / --style 지정)

## WCAG 접근성 체크

| 항목 | 상태 | 세부사항 |
|------|------|----------|
| 색상 대비 | X 3건 위반 | btn-primary: 3.2:1 (필요: 4.5:1) |
| 터치 타겟 | O 통과 | |
| 텍스트 크기 | ! 1건 주의 | caption: 11px |

## 리뉴얼 디자인 토큰

### 색상 팔레트 교체
| 역할 | 현재 | 새 값 | 근거 |
|------|------|-------|------|
| Primary | #3B82F6 | #6366F1 | [스타일명] 추천 |
| Secondary | #64748B | #8B5CF6 | [스타일명] 추천 |
| Background | #FFFFFF | #0F172A | 다크 모드 기반 |
| Text | #1E293B | #F8FAFC | 다크 모드 기반 |

### 타이포그래피 교체
| 역할 | 현재 | 새 값 |
|------|------|-------|
| Heading | Inter | Space Grotesk |
| Body | Inter | Inter (유지) |

### 스타일 토큰 교체
| 토큰 | 현재 | 새 값 |
|------|------|-------|
| border-radius | 8px | 16px |
| shadow | 0 2px 4px | 0 8px 32px |
| spacing-base | 4px | 4px (유지) |

## 변경 예정 파일 목록

| 파일 | 변경 범위 |
|------|----------|
| src/styles/globals.css | CSS 변수 전면 교체 |
| tailwind.config.ts | 색상/폰트 설정 교체 |
| src/components/*.tsx | 컴포넌트 스타일 교체 |

## 리뉴얼 계획 (8단계 우선순위)

### P1: 접근성 (CRITICAL)
- [ ] [개선안 + 대상 파일]

### P2~P8: [개선안 목록]
```

---

## 7단계: 전면 리뉴얼 코드 적용

**사용 도구**: `Edit`, `Bash`

### 안전장치

1. **변경 예정 파일 목록을 먼저 출력**하고 사용자 확인을 요청합니다
2. **기능 코드(비즈니스 로직)는 절대 변경하지 않음** — 스타일/UI 코드만 변경
3. 변경 전 현재 파일 상태를 Read로 확인

### 스택 가이드 참조

코드 적용 전, 감지된 기술 스택의 가이드라인을 참조합니다:

```bash
# 기술 스택 가이드 검색 (적용할 영역 키워드로)
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain stack --stack react "theming css-variables"
```

### 적용 범위 (design-polish보다 확대)

| 영역 | 적용 내용 |
|------|----------|
| CSS 변수/테마 토큰 | 전면 교체 (--color-primary, --font-heading 등) |
| 색상 팔레트 | Primary, Secondary, Accent, Background, Text 교체 |
| 타이포그래피 | Heading + Body 폰트 페어링 교체 |
| 컴포넌트 스타일 | border-radius, shadow, spacing scale 통일 |
| 레이아웃 | 그리드/간격 재구성 |
| 다크/라이트 모드 | 테마 재생성 |

### 적용 순서

1. **CSS 변수/테마 토큰 교체** (가장 영향 범위 넓음 → 먼저)
2. **Tailwind/스타일 설정 교체** (tailwind.config, theme 등)
3. P1 (접근성 CRITICAL) 적용
4. P2~P4 (CRITICAL/HIGH) 적용
5. P5~P7 (MEDIUM) — 사용자 확인 후 적용
6. 각 수정 후 파일 저장
7. 적용 결과 요약 출력

### 적용하지 않는 것

- 비즈니스 로직 (이벤트 핸들러, API 호출, 상태 관리 등)
- HTML 구조 변경 (DOM 재배치)
- 새 라이브러리 설치 필요한 변경
- 브레이킹 체인지

### 적용 결과 출력

```markdown
## 적용 완료

| 파일 | 변경 내용 |
|------|----------|
| src/styles/globals.css | CSS 변수 전면 교체 (12개 변수) |
| tailwind.config.ts | 색상 팔레트 + 폰트 교체 |
| src/components/Button.tsx | 스타일 토큰 적용 |

## 미적용 (수동 필요)

- [ ] Google Fonts CDN 링크 추가 (layout.tsx의 <head>)
- [ ] 이미지 에셋 교체 (브랜드 색상 변경에 따른)
```

---

## 레퍼런스 사이트 목록

### 실제 서비스 UX 흐름

| 사이트 | URL | 특징 |
|--------|-----|------|
| Mobbin | mobbin.com | 실 서비스 스크린샷, 플로우별 정리 |
| Page Flows | pageflows.com | 영상 기반 플로우, 인터랙션 참고 |
| Refero | refero.design | 실제 서비스 UI 요소 모음 |

### 모던 웹 트렌드 (Tech & SaaS)

| 사이트 | URL | 특징 |
|--------|-----|------|
| Godly | godly.website | 다크 모드, 마이크로 인터랙션 |
| Dark Mode Design | darkmodedesign.com | 다크 모드 UI 큐레이션 |
| Awwwards | awwwards.com | 창의적/기술적 웹사이트 |

### 감각적 & 예술적 영감

| 사이트 | URL | 특징 |
|--------|-----|------|
| SiteInspire | siteinspire.com | 레이아웃, 색감, 분위기 |
| Savee | savee.it | 무드보드용 시각적 자극 |
| Behance | behance.net | 브랜딩, Case Study |

### 랜딩 페이지 & 마케팅

| 사이트 | URL | 특징 |
|--------|-----|------|
| Lapa Ninja | lapa.ninja | 랜딩 페이지 레퍼런스 최다 |
| Httpster | httpster.net | 심플한 타이포그래피 |

### UI 디테일

| 사이트 | URL | 특징 |
|--------|-----|------|
| Dribbble | dribbble.com | 버튼, 카드 등 디테일 |

---

## Pre-delivery 체크리스트

코드 적용 후 또는 최종 결과 보고 전에 다음을 확인합니다:

### 시각 품질
- [ ] 색상 대비 4.5:1 이상 (WCAG AA)
- [ ] 일관된 border-radius (8px/12px/16px 중 택일)
- [ ] 일관된 spacing scale (예: 4/8/12/16/24/32px)
- [ ] 폰트 계층 명확 (h1 > h2 > h3 > body > caption)

### 디자인 시스템 일관성
- [ ] CSS 변수가 모든 컴포넌트에 일관되게 적용됨
- [ ] 하드코딩된 색상/폰트 값이 남아있지 않음
- [ ] 다크/라이트 모드 토큰이 올바르게 설정됨

### 인터랙션
- [ ] 모든 클릭 가능 요소에 `cursor: pointer`
- [ ] 호버 상태 (150-200ms transition)
- [ ] 포커스 링 (2-3px, 키보드 사용자)
- [ ] 로딩 상태 (스켈레톤 또는 스피너)
- [ ] 에러 상태 (인라인 메시지 + 아이콘)

### 라이트/다크 모드
- [ ] 다크 모드 전환시 깨지는 요소 없음
- [ ] 다크 모드 색상 대비 유지

### 레이아웃
- [ ] 모바일 (320px~) 깨지지 않음
- [ ] 태블릿 (768px) 적절한 배치
- [ ] 데스크톱 (1024px+) 최대 너비 제한

### 접근성 최종 점검
- [ ] axe-core 위반 0건 (또는 justified)
- [ ] 키보드 네비게이션 가능
- [ ] 스크린 리더 호환 (ARIA 레이블)
- [ ] `prefers-reduced-motion` 지원
