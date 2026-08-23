---
name: design-renewal
description: 디자인 전면 리뉴얼. 디자인 시스템 교체 수준의 대규모 변경. 색상 팔레트/타이포그래피/컴포넌트/레이아웃 전면 교체. 지식 기반 + 시각 비교 + WCAG 접근성 체크 통합. /design-renewal 명령으로 실행.
allowed-tools: Read, Write, Glob, Grep, Bash, WebSearch, Edit
version: "1.4.0"
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
5-7단계: 디자인 계약 영속화 (DESIGN.md + design-decisions.json) [Write]  ★필수
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

### 5-7. 디자인 계약 영속화 (필수)

**여기까지 수립한 디자인 시스템을 파일로 남기지 않으면, 다음 실행은 이 결정들을 전부 다시 추론한다.**
매 회차가 조금씩 다른 값을 뽑아내는 것 — 이 플러그인 스스로가 드리프트의 원인이 된다.
5단계에서 정한 값은 **반드시** 다음 두 파일로 기록한다. (사용자 확인은 6단계에서 받되, 계약 초안 작성은 여기서 한다.)

```
Write(".design-polish/DESIGN.md")            # 왜 이 결정인가 (제품 성격·원칙·결정 목록)
Write(".design-polish/design-decisions.json") # 무엇이 허용되는가 (기계 판정용 토큰 집합)
```

> **`docs/DESIGN.md`가 이미 있으면**(auto-complete-loop로 기획한 프로젝트) 새 파일을 만들지 말고
> **그 문서를 갱신한다.** 성격 계약이 두 벌이 되면 반드시 갈라지고, 어느 쪽이 진짜인지 아무도 모르게 된다.
> `design-decisions.json`은 기계 판정용이라 경로가 `.design-polish/`로 고정이며, 그쪽 결정 ID는
> `docs/DESIGN.md`의 결정 표와 1:1로 맞춘다.

템플릿을 뼈대로 쓴다:

```bash
ls "${CLAUDE_PLUGIN_ROOT}/templates/DESIGN.md" "${CLAUDE_PLUGIN_ROOT}/templates/design-decisions.json"
```

**작성 규칙:**

1. **결정 ID를 부여한다.** 5단계 표의 각 항목 → `DD-NNN`. 팔레트·타이포·토큰의 모든 값은
   자기를 낳은 결정 ID를 갖는다. ID 없는 값은 계약에 넣지 않는다.
2. **근거를 적는다.** "Glassmorphism이라서 radius 16px"이 아니라, 그 스타일을 왜 골랐는지(원칙)와
   그 원칙이 왜 이 radius를 요구하는지를 적는다. **DESIGN.md가 틀리면 결과물은 "일관되게 틀린" 디자인이 된다.**
3. **출처 마커를 붙인다.** `user-fact` / `repo-fact:<path>` / `assumption: <근거>` / `blocker`.
   제품 성격(1절)은 `assumption` 금지 — 추측한 성격은 전 화면에 전파되어 되돌리기가 가장 비싸다.
   모르면 6단계 사용자 확인에서 묻는다.
4. **두 파일을 동기화한다.** `design-decisions.json`의 `tokens[*].decision`은 DESIGN.md에 실재하는 ID여야 한다.
5. **anti-goals를 적는다.** 무엇을 하지 않기로 했는지가 없으면 계약이 아니다.

`design-decisions.json`의 `tokens`에 넣은 값만 UI에 등장할 수 있고, 그 밖의 값은
다음 회차부터 `DP-T00x` 위반으로 잡힌다. 그러니 **실제로 적용할 값만** 넣는다
(예시 팔레트를 그대로 남겨두면 전 화면을 예시값에 맞추라는 지시가 된다).

> 계약 파일은 표기를 자동 정규화한다 — `#FFF`/`rgb(255,255,255)`, `0.5rem`/`8px`은 같은 값으로 본다.
> 편한 표기로 적어도 거짓 위반이 생기지 않는다.

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

### 디자인 계약 (5-7단계 산출)
- `.design-polish/DESIGN.md` — 결정 N건 (DD-001 ~ DD-0NN)
- `.design-polish/design-decisions.json` — 토큰 5범주 동결
- **확인이 필요한 항목** (출처 `blocker` / `assumption`으로 표시된 것):
  | ID | 결정 | 현재 출처 | 확인 요청 |
  |----|------|----------|-----------|
  | DD-001 | 제품 성격 | `blocker` | "이 제품이 주어야 할 인상은 무엇인가요?" |

> 위 계획대로 진행할까요? (Y/n)
```

**제품 성격(DESIGN.md 1절)에 `blocker`가 남아 있으면 여기서 반드시 묻는다.**
추측한 성격으로 전면 적용하면 "일관되게 틀린" 디자인이 전 화면에 퍼지고, 되돌리는 비용이 가장 크다.
사용자 답변을 받아 DESIGN.md를 갱신한 뒤 7단계로 진행한다.

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
# ★적용 후 재캡처(8단계)와 반드시 동일한 플래그·동일 cwd로 실행★ — mode(full/no-wcag)와
#   primaryRoute가 일치해야 readPreviousScore가 같은 baseline을 선택한다.
node scripts/capture.cjs   # design-polish 1.8단계와 동일 호출 (BASE_URL 등 환경변수 동일)
```

- **동일 플래그 원칙**: 서버가 떠 있어 WCAG까지 도는 조건(`full`)으로 baseline을 남겼으면, 8단계 재캡처도 같은 조건으로 돌린다. baseline을 `--no-wcag`로 남기고 적용 후 `full`로 재면 mode 불일치로 비교가 무효가 된다(H1 방지 배선).
- **동일 cwd 원칙**: 이력 파일은 `<cwd>/.design-polish/health-history.jsonl`에 저장되고 `readPreviousScore`도 현재 cwd에서 읽는다. baseline 캡처와 8단계 재캡처를 **같은 작업 디렉토리에서** 실행해야 baseline이 조회된다(다른 폴더에서 돌리면 regression=null).
- baseline 캡처가 실패(서버 미기동 등)하면 **적용을 진행하되**, close-the-loop는 "비교 불가"로 보고하고 롤백 판단을 전적으로 백업 지점에 의존한다는 사실을 사용자에게 고지한다.
- 캡처 산출물(`.design-polish/health-history.jsonl`)이 baseline으로 append되었는지 확인 후 백업 단계로 진행한다.
- **동일 styleMode 원칙 (v2.5.0)**: 이력 baseline은 `mode`+`route`에 더해 `styleMode`(contract/heuristic)까지
  일치해야 선택된다. 5-7단계에서 계약을 **먼저 기록**했으므로 이 baseline 캡처는 이미 `contract` 모드로 돌고,
  적용 후 재캡처도 같은 모드가 된다. **5-7단계를 건너뛰고 계약을 7단계 중간에 만들면** before(heuristic)와
  after(contract)의 산식이 달라져 `regression=null`이 되고 close-the-loop가 무력화된다 — 순서를 바꾸지 말 것.
- **`token-baseline.json`은 이 시점에 자동 생성된다.** 리뉴얼 前 위반값이 동결되므로, 적용 후 재캡처에서
  **리뉴얼이 새로 만들어낸 계약 밖 값만** 신규 위반(CRITICAL)으로 드러난다. 이것이 리뉴얼 품질의 핵심 신호이므로
  **검증 루프가 끝나기 전에는 이 파일을 삭제하지 않는다.**

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
- **미커밋 변경 있음**: 브랜치는 HEAD만 담고 미커밋 원본을 보호하지 못한다. 스냅샷을 **먼저** 남긴다:
  ```bash
  # 추적 중인 미커밋 변경(modified/staged)의 스냅샷 커밋 오브젝트 (브랜치/인덱스 미변경)
  STASH=$(git stash create "design-renewal pre-apply snapshot")
  # STASH가 비어있으면(=추적 변경 없음) 아무것도 안 만들어진다.
  # 생성됐다면 GC로 사라지지 않도록 즉시 참조로 고정하고 사용자에게 롤백 지점으로 고지:
  [ -n "$STASH" ] && git stash store -m "design-renewal pre-apply" "$STASH"
  ```
  > **⚠️ `git stash create`는 추적(tracked) 파일만 담는다** — untracked/ignored 원본은 포함되지 않고, 커밋 오브젝트는 참조가 없으면 GC 대상이다(그래서 위에서 `git stash store`로 고정). 따라서 **변경 예정 파일 중 untracked인 원본이 있으면**, 아래 non-git 절차의 파일 복사 백업(`.design-polish/renewal-backup/<타임스탬프>/`)을 **반드시 병행**한다. 추적 파일만 있고 stash가 정상 생성됐어도, 확실히 하려면 파일 복사 백업을 함께 두는 편이 안전하다.

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
- 미커밋(추적) 원본: `git stash store`로 고정한 스냅샷에서 복원 — `git stash list`로 확인 후 `git checkout <snapshot-hash> -- <경로>`.
- untracked였던 원본: stash에 없으므로 **파일 복사 백업**(`.design-polish/renewal-backup/<타임스탬프>/`)에서만 복원 가능.

### 적용 후 검증 루프 (close-the-loop)

design-polish SKILL의 **8단계(close-the-loop)** 를 그대로 따릅니다: 전면 적용 후 캡처를 **"적용 전 baseline 캡처"와 동일한 플래그로** 재실행하여 `health-score.json`의 regression을 확인하고, `regression`이 하락(diff < 0)이면 백업 지점으로 롤백을 검토합니다. `regression`이 `null`이면 baseline 캡처가 누락됐거나 mode/route/styleMode가 어긋난 것이므로 점수 판정 대신 백업 기반 수동 검토로 전환합니다. before/after 점수를 반드시 함께 보고합니다.

**계약 준수 검증 (v2.5.0)** — 점수와 별개로 재캡처 결과의 `tokenDrift.newViolationCount`를 확인합니다.

| newViolationCount | 의미 | 조치 |
|-------------------|------|------|
| 0 | 리뉴얼이 계약대로 적용됨 | 통과 |
| > 0 | **방금 만든 계약을 방금 한 적용이 어김** | 해당 값을 계약 토큰으로 교체. 계약이 틀렸다면 DESIGN.md를 고치고 사용자 확인 |

점수가 올라도 신규 위반이 있으면 완료로 보고하지 않습니다 — 다음 회차의 드리프트를 심어놓은 것이기 때문입니다.
`ruleFailures[]`의 CRITICAL/HIGH 항목을 규칙 ID와 함께 그대로 보고합니다.

**재기준선(re-baseline)**: 검증 루프를 통과하고 사용자가 결과를 수용한 뒤에만
`.design-polish/token-baseline.json`을 삭제해 다음 회차 기준선을 새로 잡습니다.
남아 있는 위반이 있다면 **몇 건을 부채로 동결하는지 사용자에게 알리고** 삭제합니다
(조용히 지우면 미해결 위반이 통과로 세탁됩니다).

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
