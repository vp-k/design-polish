---
name: design-renewal
description: 디자인 전면 리뉴얼. 디자인 시스템 교체 수준의 대규모 변경. 색상 팔레트/타이포그래피/컴포넌트/레이아웃 전면 교체. 지식 기반 + 시각 비교 + WCAG 접근성 체크 통합. /design-renewal 명령으로 실행.
allowed-tools: Read, Write, Glob, Grep, Bash, WebSearch, Edit
version: "1.2.0"
---

# 디자인 리뉴얼 스킬 v1.0

디자인 시스템을 전면 교체하는 대규모 리뉴얼 스킬.
design-polish와 동일한 0~6단계 분석 인프라를 사용하되, 7단계 코드 적용 범위가 디자인 시스템 전체로 확대됩니다.

### 지식 기반 리소스
- **knowledge/**: 서비스 유형별 UI 규칙, 컴포넌트 체크리스트, UX 규칙 (마크다운 직접 Read)
- **data/**: 66개 디자인 스타일, 96개 색상 팔레트, 57개 타이포그래피, 13개 기술 스택 가이드 (JSON + BM25 검색)
- **scripts/search.cjs**: Node.js BM25 검색 엔진

## 인수

- `--analyze`: (옵션) 분석만 수행 (코드 변경 없음)
- `--wcag-only`: (옵션) WCAG 접근성 체크만 수행
- `--no-wcag`: (옵션) WCAG 체크 생략
- style-keyword: (옵션) 원하는 스타일 방향 (예: "glassmorphism", "minimal", "dark")
- $1: (옵션) 레퍼런스 사이트 (미지정시 프로젝트 유형에 맞게 자동 선택)
- $2: (옵션) 기능 키워드 (미지정시 전체 디자인 리뉴얼)

## 사용 예시

```
/design-renewal                          # 전체 디자인 리뉴얼 (분석 + 적용)
/design-renewal --analyze                # 분석만 (코드 변경 없음)
/design-renewal glassmorphism            # 글래스모피즘 스타일로 리뉴얼
/design-renewal dark                     # 다크 테마 중심 리뉴얼
/design-renewal minimal godly            # 미니멀 스타일, Godly 레퍼런스
/design-renewal --wcag-only              # WCAG 접근성 체크만
/design-renewal brutalist mobbin hero    # 브루탈리즘, Mobbin에서 hero 검색
```

---

## 실행 플로우 개요

```
전제조건 확인
    |
0단계: 프로젝트 분석 + 서비스 유형 감지 + 스크린샷 캡처 [Glob, Read, Bash]
    |
1단계: WCAG 접근성 체크 (axe-core) [Bash, Read]
    |
1.5단계: 디자인 지식 로딩 [Read, Bash]
    |
2단계: 레퍼런스 사이트 선택
    |
3단계: 트렌드 검색 + 레퍼런스 캡처 [WebSearch, Bash]
    |
4단계: Gap 분석 (시각 비교 + 지식 기반) [Read]
    |
5단계: 리뉴얼 방향 수립 + 개선안 도출
    |
6단계: 리뉴얼 계획 출력 + 사용자 확인
    |
7단계: 디자인 시스템 전면 적용 [Edit, Bash, Write]
    |
Pre-delivery 체크리스트
```

---

## 0~4단계: design-polish와 동일

0~4단계는 design-polish SKILL.md의 플로우와 동일합니다.
**반드시 design-polish SKILL.md의 0~4단계를 참조하여 실행하세요:**

```
Read("${CLAUDE_PLUGIN_ROOT}/skills/design-polish/SKILL.md")
```

핵심 요약:
- **0단계**: 프로젝트 분석, 서비스 유형 감지, 스크린샷 캡처
- **1단계**: WCAG 접근성 체크 (axe-core)
- **1.5단계**: 디자인 지식 로딩 (knowledge/ Read + search.cjs 검색)
- **2단계**: 레퍼런스 사이트 선택
- **3단계**: 트렌드 검색 + 레퍼런스 캡처
- **4단계**: Gap 분석 (시각 비교 + 지식 기반)

style-keyword가 제공된 경우, 1.5단계에서 해당 키워드를 search.cjs 검색에 우선 반영합니다:

```bash
# style-keyword가 "glassmorphism"인 경우
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain style "glassmorphism"
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain color "glassmorphism"
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain typography "glassmorphism"
```

---

## 5단계: 리뉴얼 방향 수립

design-polish는 8단계 우선순위로 개별 개선안을 도출하지만, design-renewal은 **통합 디자인 시스템**을 수립합니다.

### 수립 항목

| 항목 | 결정 내용 | 근거 |
|------|----------|------|
| 디자인 스타일 | 전체 스타일 방향 (예: Glassmorphism) | style-keyword + search.cjs + 트렌드 |
| 색상 팔레트 | Primary, Secondary, Accent, Background, Surface, Text, Error, Success, Warning | search.cjs color 결과 + 트렌드 |
| 타이포그래피 | Heading 폰트 + Body 폰트 + 크기 스케일 | search.cjs typography 결과 |
| 컴포넌트 토큰 | border-radius, shadow, spacing scale | 스타일 방향에 맞춤 |
| 레이아웃 | 그리드 시스템, 간격 체계, 최대 너비 | 트렌드 + UX 규칙 |
| 다크/라이트 모드 | 양 모드 색상 매핑 | 팔레트 기반 자동 생성 |

### 색상 팔레트 설계

search.cjs 결과와 트렌드를 기반으로 완전한 팔레트를 설계합니다:

```
Primary:    #XXXXXX  — 브랜드 핵심 색상
Secondary:  #XXXXXX  — 보조 색상
Accent:     #XXXXXX  — 강조/CTA 색상
Background: #XXXXXX  — 배경
Surface:    #XXXXXX  — 카드/컨테이너 배경
Text:       #XXXXXX  — 본문 텍스트
TextSecondary: #XXXXXX — 보조 텍스트
Border:     #XXXXXX  — 테두리
Error:      #XXXXXX  — 에러 상태
Success:    #XXXXXX  — 성공 상태
Warning:    #XXXXXX  — 경고 상태
```

### 타이포그래피 페어링 설계

```
Heading:  [Font Family] — Google Fonts URL
Body:     [Font Family] — Google Fonts URL

Scale:
  h1: XX px / line-height / weight
  h2: XX px / line-height / weight
  h3: XX px / line-height / weight
  h4: XX px / line-height / weight
  body: XX px / line-height / weight
  caption: XX px / line-height / weight
```

### 컴포넌트 토큰 설계

```
border-radius:  sm: Xpx, md: Xpx, lg: Xpx, full: 9999px
shadow:         sm: ..., md: ..., lg: ...
spacing:        xs: Xpx, sm: Xpx, md: Xpx, lg: Xpx, xl: Xpx, 2xl: Xpx
transition:     fast: Xms, normal: Xms, slow: Xms
```

---

## 6단계: 리뉴얼 계획 출력 + 사용자 확인

### 출력 형식

```markdown
## 리뉴얼 계획

### 디자인 방향
- 스타일: [스타일명]
- 근거: [search.cjs 결과 + 트렌드 요약]

### 색상 팔레트
| 토큰 | 현재 | 변경 후 | 용도 |
|------|------|---------|------|
| Primary | #현재값 | #새값 | 브랜드 핵심 |
| Secondary | #현재값 | #새값 | 보조 |
| ... | ... | ... | ... |

### 타이포그래피
| 용도 | 현재 | 변경 후 |
|------|------|---------|
| Heading | [현재 폰트] | [새 폰트] |
| Body | [현재 폰트] | [새 폰트] |

### 컴포넌트 토큰
| 토큰 | 현재 | 변경 후 |
|------|------|---------|
| border-radius | ... | ... |
| shadow | ... | ... |
| spacing | ... | ... |

### 변경 예정 파일 목록
| 파일 | 변경 범위 |
|------|----------|
| src/styles/variables.css | CSS 변수 전체 교체 |
| src/styles/global.css | 폰트/색상/간격 |
| src/components/Button.tsx | 스타일 전면 변경 |
| ... | ... |

### WCAG 접근성
- 새 팔레트의 대비율 검증 결과

> 위 계획대로 진행할까요? (Y/n)
```

**--analyze 옵션 시**: 여기서 종료. 코드 적용하지 않음.

**반드시 사용자 확인을 받은 후에만 7단계로 진행합니다.**

---

## 7단계: 디자인 시스템 전면 적용

**사용 도구**: `Edit`, `Bash`, `Write`

### 안전 규칙

전면 교체는 되돌리기 비용이 크므로 **적용 전 백업(롤백 지점)을 반드시 확보**합니다.

0. **적용 전 baseline 캡처 + 백업 지점 생성** (v1.2.0 — 필수, 아래 "적용 전 baseline 캡처"·"적용 전 백업" 절차)
1. **기능 코드(비즈니스 로직)는 절대 변경하지 않음** — 스타일/UI 코드만 변경
2. **적용 전 변경 예정 파일 목록을 사용자에게 확인받음** (6단계에서 완료)
3. **각 파일 수정 전 반드시 Read로 현재 내용 확인**
4. **한 파일씩 순차 적용** — 중간에 문제 발생 시 중단 가능

### 적용 전 baseline 캡처 (7단계 진입 직전 — 백업보다 먼저)

close-the-loop(적용 후 검증)가 성립하려면 **전면 적용 전에 동일 조건 baseline이 이력에 있어야** 합니다. baseline이 없으면 적용 후 `regression=null`("비교 불가")로 떨어져 점수 기반 회귀 판정이 불가능해집니다. 따라서 리뉴얼은 백업 직전에 baseline 캡처를 **반드시 1회 실행**합니다:

```bash
# 리뉴얼 前 현재 디자인의 Health Score를 health-history.jsonl에 남긴다.
# ★적용 후 재캡처(8단계)와 반드시 동일한 플래그로 실행★ — mode(full/no-wcag)와
#   primaryRoute가 일치해야 readPreviousScore가 같은 baseline을 선택한다.
node scripts/capture.cjs   # design-polish 1.8단계와 동일 호출 (BASE_URL 등 환경변수 동일)
```

- **동일 플래그 원칙**: 서버가 떠 있어 WCAG까지 도는 조건(`full`)으로 baseline을 남겼으면, 8단계 재캡처도 같은 조건으로 돌린다. baseline을 `--no-wcag`로 남기고 적용 후 `full`로 재면 mode 불일치로 비교가 무효가 된다(H1 방지 배선).
- baseline 캡처가 실패(서버 미기동 등)하면 **적용을 진행하되**, close-the-loop는 "비교 불가"로 보고하고 롤백 판단을 전적으로 백업 지점에 의존한다는 사실을 사용자에게 고지한다.
- 캡처 산출물(`.design-polish/health-history.jsonl`)이 baseline으로 append되었는지 확인 후 백업 단계로 진행한다.

### 적용 전 백업 (baseline 캡처 직후)

전면 교체는 **커밋되지 않은 원본까지 유실**시킬 수 있으므로, 브랜치 하나만으로는 부족합니다. 다음 순서를 **강제**합니다:

```bash
# 1) git 저장소 여부 확인
git rev-parse --is-inside-work-tree 2>/dev/null
```

**git 저장소인 경우:**

```bash
# 2) 작업트리 상태 확인
git status --porcelain
```

- **깨끗함(출력 없음)**: HEAD가 곧 원본 → 아래 3)에서 브랜치 스냅샷으로 충분.
- **미커밋 변경 있음**: 브랜치는 HEAD만 담고 미커밋 원본을 보호하지 못한다. 파일 스냅샷을 **먼저** 남긴다:
  ```bash
  # 미커밋 변경을 포함한 완전한 스냅샷 (working tree 커밋 오브젝트, 브랜치/인덱스 미변경)
  STASH=$(git stash create "design-renewal pre-apply snapshot")
  # STASH가 비어있지 않으면 그 커밋 해시를 사용자에게 롤백 지점으로 고지
  # (git stash store로 보존하거나, 아래 파일 복사 백업을 병행)
  ```
  스냅샷 커밋 해시를 확보하지 못하면 파일 복사 백업(아래 non-git 절차)을 **병행**한다.

```bash
# 3) 백업 브랜치 — 기존 백업을 파괴하지 않도록 -f 금지. 존재하면 타임스탬프 접미사로 신규 생성
if git show-ref --verify --quiet refs/heads/design-renewal-backup; then
  git branch "design-renewal-backup-$(date +%Y%m%d-%H%M%S)"   # 과거 롤백 지점 보존
else
  git branch design-renewal-backup
fi
```

> **`git branch -f`를 쓰지 않는다**: 이전 리뉴얼의 백업 브랜치를 현재 HEAD로 강제 이동시켜 과거 롤백 지점을 파괴한다(반복 리뉴얼 시 데이터 유실 풋건).

**git 저장소가 아닌 경우:** 변경 예정 파일을 `.design-polish/renewal-backup/<타임스탬프>/`에 복사 백업하고, 그 경로를 사용자에게 고지합니다.

**롤백 방법 고지** (적용 시작 전 사용자에게 명시):
- 커밋 상태였던 파일: `git restore --source=design-renewal-backup -- <경로>`
- 미커밋 상태였던 원본: 위 2)의 stash 스냅샷 커밋에서 복원(`git checkout <snapshot-hash> -- <경로>`) 또는 파일 복사 백업에서 복원.

### 적용 후 검증 루프 (close-the-loop)

design-polish SKILL의 **8단계(close-the-loop)** 를 그대로 따릅니다: 전면 적용 후 캡처를 **"적용 전 baseline 캡처"와 동일한 플래그로** 재실행하여 `health-score.json`의 regression을 확인하고, `regression`이 하락(diff < 0)이면 백업 지점으로 롤백을 검토합니다. `regression`이 `null`이면 baseline 캡처가 누락됐거나 mode/route가 어긋난 것이므로 점수 판정 대신 백업 기반 수동 검토로 전환합니다. before/after 점수를 반드시 함께 보고합니다.

### 적용 범위 (design-polish와의 차이)

| 영역 | design-polish | design-renewal |
|------|--------------|----------------|
| CSS 변수/토큰 | 개별 값 보정 | **전면 교체** |
| 색상 | 대비 보정 | **팔레트 전체 교체** (primary~warning) |
| 타이포그래피 | 크기/행간 조정 | **폰트 페어링 교체** (heading + body) |
| border-radius | 개별 보정 | **통일된 스케일로 교체** |
| shadow | 개별 보정 | **통일된 스케일로 교체** |
| spacing | 여백 보정 | **spacing scale 통일** |
| 레이아웃 | 정렬 수정 | **그리드/간격 재구성** |
| 다크/라이트 모드 | 색상 보정 | **테마 전체 재생성** |
| 컴포넌트 | hover/focus 보정 | **스타일 전면 변경** |

### 적용 순서

#### 7-1. CSS 변수/디자인 토큰 교체

프로젝트의 스타일링 방식에 따라 적용:

**CSS Variables 방식:**
```css
:root {
  --color-primary: #새값;
  --color-secondary: #새값;
  /* ... 5단계에서 설계한 전체 팔레트 */
  --font-heading: '새 폰트', sans-serif;
  --font-body: '새 폰트', sans-serif;
  --radius-sm: Xpx;
  --radius-md: Xpx;
  --radius-lg: Xpx;
  --shadow-sm: ...;
  --shadow-md: ...;
  --spacing-xs: Xpx;
  --spacing-sm: Xpx;
  /* ... */
}
```

**Tailwind 방식:** `tailwind.config.*` 의 theme/extend 수정

**styled-components/emotion 방식:** theme 객체 수정

**Flutter 방식:** ThemeData, ColorScheme, TextTheme 수정

#### 7-2. 색상 팔레트 전면 교체

- 모든 하드코딩된 색상값을 CSS 변수/토큰으로 교체
- 인라인 스타일의 색상값도 변경
- WCAG AA 대비율(4.5:1) 검증

#### 7-3. 타이포그래피 페어링 교체

- 폰트 import/link 변경 (Google Fonts 등)
- heading/body 폰트 교체
- 크기 스케일 통일 (h1~caption)
- 행간(line-height) 조정

#### 7-4. 컴포넌트 스타일 전면 변경

- border-radius 통일
- shadow 스케일 적용
- spacing 스케일 적용
- hover/focus/active 상태 전면 업데이트
- transition 타이밍 통일

#### 7-5. 레이아웃 그리드/간격 재구성

- 컨테이너 최대 너비 조정
- 섹션 간 간격 통일
- 그리드 gap 조정
- 반응형 breakpoint 정리

#### 7-6. 다크/라이트 모드 테마 재생성

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #다크모드값;
    --color-background: #다크모드값;
    --color-surface: #다크모드값;
    --color-text: #다크모드값;
    /* ... */
  }
}
```

### 스택 가이드 참조

코드 적용 전, 감지된 기술 스택의 가이드라인을 참조합니다:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/search.cjs" --domain stack --stack react "theming css-variables"
```

### 적용하지 않는 것

- 비즈니스 로직 (API 호출, 상태 관리, 라우팅 등)
- 데이터 구조 변경
- 새 라이브러리 설치가 필수인 변경 (추천만 제공)
- 테스트 코드

---

## 적용 결과 출력

```markdown
## 리뉴얼 완료

### 디자인 시스템 변경 요약
- 스타일: [이전] -> [이후]
- 색상: [이전 팔레트] -> [이후 팔레트]
- 타이포: [이전 폰트] -> [이후 폰트]

### 변경된 파일

| 파일 | 변경 내용 |
|------|----------|
| src/styles/variables.css | CSS 변수 전면 교체 (색상, 폰트, 토큰) |
| src/styles/global.css | 글로벌 스타일 업데이트 |
| src/components/Button.tsx | 버튼 스타일 전면 변경 |
| ... | ... |

### WCAG 검증
- 새 팔레트 대비율: 모두 4.5:1 이상 통과
- 터치 타겟: 44x44px 충족

### 수동 작업 필요

- [ ] Google Fonts import 추가: `<link href="..." />`
- [ ] 이미지 에셋 교체 (색상 톤 불일치)
- [ ] 아이콘 세트 교체 검토
```

---

## Pre-delivery 체크리스트

design-polish SKILL.md의 Pre-delivery 체크리스트를 모두 포함하며, 추가로 다음을 확인합니다:

### 디자인 시스템 일관성
- [ ] 모든 색상이 CSS 변수/토큰을 사용 (하드코딩 없음)
- [ ] 모든 폰트가 디자인 시스템 폰트를 사용
- [ ] border-radius가 정의된 스케일만 사용
- [ ] shadow가 정의된 스케일만 사용
- [ ] spacing이 정의된 스케일만 사용

### 시각 품질
- [ ] 색상 대비 4.5:1 이상 (WCAG AA)
- [ ] 일관된 border-radius
- [ ] 일관된 spacing scale
- [ ] 폰트 계층 명확 (h1 > h2 > h3 > body > caption)

### 인터랙션
- [ ] 모든 클릭 가능 요소에 `cursor: pointer`
- [ ] 호버 상태 (통일된 transition 타이밍)
- [ ] 포커스 링 (2-3px, 키보드 사용자)
- [ ] 로딩 상태 (스켈레톤 또는 스피너)
- [ ] 에러 상태 (인라인 메시지 + 아이콘)

### 라이트/다크 모드
- [ ] 다크 모드 테마가 새 팔레트 기반으로 재생성됨
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
