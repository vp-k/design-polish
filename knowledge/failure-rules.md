# Failure Rules — 규칙 ID 레지스트리

design-polish가 지적하는 모든 디자인 실패는 **번호를 가진다.**
리포트·리뷰·커밋 메시지는 "여백이 좀 답답하다" 같은 서술 대신 `DP-T003 위반 (DD-011)` 처럼 ID를 인용한다.

왜 번호인가:
- **재현 가능** — 같은 문제를 매번 같은 이름으로 부른다. 이번 회차와 다음 회차의 리포트를 diff할 수 있다.
- **추적 가능** — 각 위반이 어떤 디자인 결정(`DD-NNN`)을 어겼는지 되짚을 수 있다.
- **논쟁 종료** — 취향 다툼이 아니라 계약 위반 여부의 문제가 된다.

ID는 **append-only**다. 규칙을 폐기해도 번호를 재사용하지 않는다(과거 리포트의 참조가 깨진다).

## 네임스페이스

| 접두 | 대상 | 판정 주체 | 근거 파일 |
|------|------|-----------|-----------|
| `DP-T###` | 토큰 드리프트 — 디자인 계약 밖의 값 | **자동 계측** (capture.cjs) | `.design-polish/design-decisions.json` |
| `DP-K###` | 한국어 타이포그래피 | **자동 계측** | (계약 불필요) |
| `DP-S###` | 컴포넌트 상태 계약 | **자동 계측** | (계약 불필요) |
| `DP-R###` | 가독성 — 줄 길이·행간·작은 글자·제목 위계 (v2.8.0) | **자동 계측** (craft-lint.cjs) | (계약 불필요, `ruleWaivers`로 면제 가능) |
| `DP-P###` | AI 상투 패턴 — 그라디언트 텍스트·한쪽 줄무늬·중첩 카드·바운스 (v2.8.0) | **자동 계측** (craft-lint.cjs) | (계약 불필요, `ruleWaivers`로 면제 가능) |
| `DP-A###` | WCAG 접근성 | **자동 계측** (axe-core) | axe rule id를 그대로 사용 |
| `DP-U###` | UX 규칙 | **모델 판단** (리뷰 시) | [ux-rules.md](./ux-rules.md) |
| `DP-C###` | 컴포넌트 체크리스트 | **모델 판단** | [component-checklist.md](./component-checklist.md) |
| `DP-F###` | 장인 기준선 — 렌더 점검·거부 목록·인지 부하 (v2.8.0) | **모델 판단** | [craft-floor.md](./craft-floor.md) |

`DP-T/K/S/R/P`는 스크립트가 결정론적으로 판정해 `.design-polish/health-score.json`의 `ruleFailures[]`에 넣는다.
모델이 임의로 통과/불통과를 뒤집을 수 없다. `DP-U/C/F`는 모델이 판단하되 반드시 위 문서의 행 ID를 인용해야 한다.

## 심각도 (4단계, v2.6.0)

```
CRITICAL > HIGH > MEDIUM > LOW
```

**단일 출처는 `scripts/design-contract.cjs`의 `RULES` 레지스트리다.** 이 문서의 표는 그 사본이고,
불일치하면 코드가 옳다. 스크립트는 기동 시 모든 `RULES[id].severity`가 위 4값 안에 있는지 검증하며,
`summarizeSeverity`가 심각도별 집계(`ruleFailureSummary`)를 만들어 Pivot 판정에 쓰인다.

> **왜 4단계인가**: v2.5.0까지는 CRITICAL / HIGH / MAJOR / MEDIUM / MINOR / LOW 6단계였는데
> `MAJOR`가 `HIGH`보다 **아래**에 있었다. 이름만 보면 반대로 읽히므로 리포트를 읽는 사람도
> 심각도를 재해석하는 모델도 순서를 틀렸다. 업계 통용 4단계로 접으면서 **상대 순서는 그대로**
> 두었다(`MAJOR`→`MEDIUM`, `MINOR`→`LOW`). 심각도가 올라간 규칙은 하나도 없다.

---

## DP-T — 토큰 드리프트 (디자인 계약 필요)

계약(`design-decisions.json`)이 없으면 이 그룹은 **전부 비활성**이고 styleFit은 기존 휴리스틱으로 채점된다.
계약이 있으면 휴리스틱은 꺼지고 오직 계약 준수 여부만 본다 — "값이 몇 종이냐"가 아니라 "결정에 없는 값을 썼느냐".

| ID | 규칙 | 기본 심각도 | 계측 |
|----|------|-------------|------|
| DP-T001 | `border-radius`가 계약 토큰 밖의 값 | MEDIUM | computed style |
| DP-T002 | 색상이 계약 팔레트 밖의 값 | MEDIUM | computed style — `color`, `background-color`, 그리고 **네 변의 `border-*-color`**(해당 변의 두께가 0이 아닐 때만) |
| DP-T003 | spacing이 계약 스케일 밖의 값 | MEDIUM | computed style — `padding`/`margin` **top·right·bottom·left 네 방향 전부** + `row-gap`/`column-gap` |
| DP-T004 | 폰트가 계약 타이포 밖의 값 | HIGH | computed style |
| DP-T005 | `box-shadow`가 계약 스케일 밖의 값 | LOW | computed style |

> **계측 범위 (v2.6.0)**: 예전에는 색상이 `border-color`(축약형 1개)만, spacing이 `padding-top`/`padding-left`/
> `margin-top`/`margin-left`만 수집됐다. 그래서 오른쪽·아래쪽만 어긋난 값과 변마다 다른 테두리 색은
> **위반이 아니라 아예 보이지 않았다** — "계약을 지킨다"는 보고가 실제로는 "왼쪽 위만 지킨다"였다.
> 이제 네 방향·네 변을 모두 잰다. 두께 0인 변의 색은 화면에 나타나지 않으므로 세지 않는다(오탐 방지).
> 도입 회차에 총 위반 수가 늘어 보일 수 있는데, 새 위반이 생긴 게 아니라 **원래 있던 것이 보이게 된 것**이다.
> 래칫 baseline이 그 회차에 동결하므로 신규 위반(CRITICAL)으로 승격되지는 않는다.

**래칫(ratchet).** 계약 도입 첫 실행에서 현재 위반값 전체가 `.design-polish/token-baseline.json`에 동결된다.
이후 실행은 **baseline 이후 새로 생긴 위반만** CRITICAL로 승격하고 강하게 감점(-2/건)하며,
baseline 잔여는 완만히(-0.1/건) 압박한다. 브라운필드에 계약을 붙이자마자 점수가 0이 되어
아무도 쓰지 않게 되는 교착을 막기 위한 장치다. 전면 리뉴얼 후에는 `token-baseline.json`을 삭제해 재기준선을 잡는다.

**수집 상한 시 fail-open.** 한 범주에서 distinct 값이 200종을 넘으면 계측 목록이 잘리고,
이때는 baseline이 전체를 담지 못했을 수 있으므로 **그 범주의 "신규 위반" 판정을 포기한다**
(총 위반 수는 그대로 보고). 불완전한 목록으로 신규를 세면 기존 위반이 신규로 둔갑해
게이트가 거짓 차단하기 때문이다.

**다만 그 사실을 감추지는 않는다 (v2.6.0).** 상한에 걸린 범주는 `tokenDrift.capped[]`에 실리고
`tokenDrift.measurement`가 `"incomplete"`가 된다. "위반이 없다"와 "다 못 봤다"는 다른 사실이며,
후자를 만점으로 환산하면 조용한 fail-open이 된다. 리포트는 이 값을 반드시 함께 인용한다.
게이트가 읽는 `newViolationCount`는 그대로 유지되므로 하위 호환은 깨지지 않는다.

**정규화.** 계약과 계측은 같은 표기 공간에서 비교된다 — `#FFF`/`#ffffff`/`rgb(255,255,255)`는 한 값,
`0.5rem`은 rootFontSize 기준 `8px`로 환산. 표기 차이로 인한 거짓 위반이 생기지 않는다.

---

## DP-K — 한국어 타이포그래피 (계약 불필요)

영문 기준 디자인 지식만으로는 한글에서 반복적으로 깨지는 지점들. 계약 없이도 항상 검사한다.

| ID | 규칙 | 심각도 | 판정 |
|----|------|--------|------|
| DP-K001 | 한글 텍스트에 serif fallback 폰트 스택 | HIGH | 스택에 한국어 폰트가 없고 generic `serif` 또는 Latin serif 패밀리가 있음 |
| DP-K002 | 긴 한글 문단(30자+)에 `word-break: keep-all` 미설정 | MEDIUM | 블록 요소 + `overflow-wrap`도 `break-word`/`anywhere`가 아님 |
| DP-K003 | 한글 자간 과다 축소 | LOW | `letter-spacing / font-size ≤ -2%` |

- **DP-K001**: `font-family: Inter, serif`는 라틴은 Inter, **한글만 시스템 명조**로 떨어진다. 가장 흔한 실패.
  스택에 Pretendard·Noto Sans KR 등 한국어 폰트가 있으면 위반이 아니다(오탐 방지).
- **DP-K002**: 한글은 공백 기준 줄바꿈이 어절을 끊는다. `keep-all`이 기본값이어야 한다.
- **DP-K003**: 라틴 대비 한글은 자간 축소에 취약하다. -2% 미만은 가독성 저하.

---

## DP-S — 컴포넌트 상태 계약 (계약 불필요)

"컴포넌트는 default 하나가 아니라 상태의 집합"이라는 원칙의 자동 검사 부분.
정적 분석으로는 포커스 스타일 적용 여부를 알 수 없으므로 **실제 키보드 포커스를 주고 전/후 computed style을 비교**한다.

**계측 방식 (v2.6.0 — `el.focus()` → `Tab` 순회)**: `page.keyboard.press('Tab')`으로 문서를 순회하며
매 스텝의 `document.activeElement` 스타일을 이전 상태와 비교한다. 예전에는 `el.focus()`를 스크립트로
호출했는데, 그 경로는 `:focus`만 켜고 **`:focus-visible`은 켜지 않는다**(브라우저가 "키보드로 온
포커스"로 보지 않기 때문). 그래서 `:focus-visible`로만 포커스 링을 그린 — 즉 **접근성 모범 사례를
따른** — 페이지가 DP-S002 CRITICAL을 맞았다. 오탐이 CRITICAL로 나오면 사람은 규칙 전체를 신뢰하지 않게 된다.

- 순회는 최대 30개 요소 / 5초에서 멈춘다(`focusTraversalCapped`·`focusTimedOut`으로 보고).
- 키보드 순회로 재지 못한 경우(`focusMethod !== "keyboard-tab"`) 또는 페이지 스타일시트에
  `:focus-visible` 규칙이 하나라도 있는 경우, "변화 없음"은 **위반이 아니라 INFO로 강등**된다
  (`result.info[]`). 의사요소·상위 요소·`:has()` 조합으로 링을 그렸을 수 있어 computed style
  비교만으로는 단정할 수 없기 때문이다. 관찰 사실은 버리지 않고 사람이 볼 수 있게 남긴다.

| ID | 규칙 | 심각도 | 판정 |
|----|------|--------|------|
| DP-S002 | 인터랙티브 요소에 포커스 표시 없음 (WCAG 2.4.7) | CRITICAL | focus 전/후 outline·box-shadow·border·background 전부 무변화 |
| DP-S001 | disabled가 opacity만으로 표현됨 | HIGH | `disabled`/`aria-disabled`인데 `cursor !== not-allowed` |
| DP-S003 | 커스텀 클릭 요소에 `cursor: pointer` 미설정 | MEDIUM | `role=button`/`tabindex` 요소인데 커서가 pointer 아님 |

- 네이티브 `<a>`/`<button>`은 UA 기본 커서가 있으므로 DP-S003 대상에서 제외한다(오탐 방지).
- 포커스 측정에 실패한 요소(`focusChanged: null`)는 **집계하지 않는다** — 측정 실패를 통과로도 위반으로도 치지 않는다.
- 상위 30개 요소 / 5초까지만 측정한다(포커스 이동 부작용·비용 제한). 전수 검사는 수동 리뷰(DP-C) 몫.
- 순회 후 원래 스크롤·포커스 상태로 복귀시킨다. 이후 캡처(스크린샷·성능)가 오염되지 않아야 한다.

---

## DP-R — 가독성 (계약 불필요, v2.8.0)

렌더된 DOM의 텍스트 요소를 한 번 훑어 computed style과 실제 줄 배치(`Range.getClientRects`)를 잰다.
판정은 `scripts/craft-lint.cjs`의 순수 함수다.

**전부 MEDIUM/LOW이고 점수에 들어가지 않는다.** Pivot 기준(`blockingNewViolations` = CRITICAL+HIGH)도 흔들지 않는다.
처음 도입하는 사이트에서 기존 문제가 한꺼번에 보이는 것은 정상이다. 리포트에서 우선순위를 낮게 다룬다.

| ID | 규칙 | 심각도 | 판정 |
|----|------|--------|------|
| DP-R001 | 본문 한 줄이 너무 길다 | MEDIUM | 80자 초과 텍스트에서 **85자 넘는 줄이 2줄 이상** |
| DP-R002 | 여러 줄 본문의 행간이 좁다 | MEDIUM | 2줄 이상 본문에서 `line-height ÷ font-size < 1.3` (`normal`=1.2) |
| DP-R003 | 좁은 단에 하이픈 없는 양쪽 정렬 | LOW | `text-align: justify` + `hyphens ≠ auto` + 줄당 45자 이하 + 2줄 이상 |
| DP-R004 | 긴 본문 전체를 대문자로 변환 | LOW | `text-transform: uppercase` + 제목 아님 + 80자 이상(라틴 40자 이상) |
| DP-R005 | 본문 자간이 넓다 | LOW | 20자 초과 텍스트에서 `letter-spacing > 0.05em` |
| DP-R006 | 본문 글자가 12px 미만 | MEDIUM | 20자 초과 텍스트에서 `font-size < 12px` |
| DP-R007 | 제목 단계를 건너뜀 | MEDIUM | 문서 순서상 직전 제목보다 2단계 이상 깊다 (h2→h4) |
| DP-R008 | 타이포 위계가 평탄하다 | MEDIUM | h1~h6·본문 대표 크기의 인접 비율이 전부 1.25 미만 (페이지당 1건) |

**줄 길이는 글자 수로 센다.** 한 줄 너비를 평균 글자 폭(0.5em)으로 나누면 한글은 전각이라 두 배로 세어진다.
그래서 요소의 렌더된 글자 수를 줄 너비 비율대로 각 줄에 나눈다. 16px 한글은 1048px 한 줄이 약 65자다.

면제 맥락 — 오탐을 줄이는 쪽으로 보수적으로 둔다:

- **공통**: 코드·터미널·목업 안의 텍스트(`pre`·`code`·`kbd` 조상, 모노스페이스 + `white-space: pre*`).
- **DP-R002**: 제목, 24px 이상 디스플레이 활자, 40자 이하 대문자 라벨, 굵기 600 이상이면서 2줄 이하인 제목형 텍스트, 한 줄 텍스트.
- **DP-R003**: 띄어쓰기 비율 3% 미만 — 띄어쓰기 없는 CJK 조판은 양쪽 정렬이 관례다.
- **DP-R004**: 라틴 글자 40자 미만 — 한글에는 대문자 변환이 적용되지 않는다.
- **DP-R005**: 40자 이하 대문자 라벨 — 대문자 라벨의 자간 확대는 정석이다.
- **DP-R006**: `sub`·`sup`·`code`·`kbd`·`samp`·`var`·`caption`·`figcaption`·`small`, UI 맥락(버튼·링크·라벨·nav·footer·`aria-hidden`·badge/chip/tag 계열 클래스), 깨알 고지(legal·copyright·disclaimer·footnote), 대문자 라벨.
- **DP-R007**: 푸터 안으로의 점프. 첫 제목은 직전이 없으므로 h3로 시작해도 위반이 아니다.
- **DP-R008**: 역할이 3개 미만이거나 h1이 본문보다 작으면 판정하지 않는다. 대표 크기가 동률이면 h1은 큰 값을 쓰고 다른 역할은 뺀다. 제목의 80% 이상이 본문보다 200 이상 굵으면 **굵기로 위계를 나눈 디자인**으로 보고 `info[]`로 강등한다.

계측 상한(텍스트 1500개·박스 400개)에 닿으면 `measurement: "incomplete"`로 정직하게 표기한다.

---

## DP-P — AI 상투 패턴 (계약 불필요, v2.8.0)

생성형 도구가 기본값처럼 내놓아 "AI가 만든 티"가 나는 패턴이다. 결함이라기보다 **기본값을 의심하라는 신호**다.
의도적으로 쓰기로 결정했다면 계약의 `ruleWaivers`로 면제한다(아래). 계약이 이 규칙보다 우선한다.

| ID | 규칙 | 심각도 | 판정 |
|----|------|--------|------|
| DP-P001 | 그라디언트 텍스트 | LOW | `background-clip: text` + 그라디언트, 색 정지점 최대 알파 ≥ 0.15 |
| DP-P002 | 둥근 박스 한쪽 면의 강조 줄무늬 | LOW | 한 면만 2px 이상 보이는 테두리(다른 면 ≤ 절반) + **줄무늬가 닿지 않는 두 모서리 ≥ 4px** + 20×20 이상 |
| DP-P003 | 카드 안에 카드 | LOW | 카드(테두리 3면+·배경 구분·그림자 중 하나 + 둥근 모서리 4px+ 또는 그림자, 80×48 이상) 안에 테두리나 그림자가 보이는 카드 |
| DP-P004 | 바운스·탄성 이징 | LOW | `cubic-bezier`의 y 제어점 > 1, 또는 animation-name에 `bounce`·`elastic` |

- **DP-P002**: `blockquote`·`nav`·`a`·폼 컨트롤·표 셀·`li`와 활성 상태 클래스(`active`·`selected`·`current`·`aria-current`)는 면제. 각진 박스의 한쪽 테두리는 인용·탭 표식의 관례라 보지 않는다.
- **DP-P003**: 뷰포트 폭 90% 이상인 바깥 박스는 카드가 아니라 페이지 틀이다. 버튼·링크·입력 같은 인터랙티브 요소와 팝업(`dialog`·`menu`·`listbox`·`tooltip`)은 카드로 보지 않는다. 안쪽이 배경색만 다르면 통과한다.

---

## 규칙 면제 (`ruleWaivers`, v2.8.0)

DP-R·DP-P는 취향이 개입하는 영역이다. 브랜드가 의도적으로 그라디언트 헤드라인을 쓴다면 매 회차 LOW가 쌓이는 것은 잡음이다.
계약 파일 `.design-polish/design-decisions.json`에 면제를 적는다:

```json
"ruleWaivers": [
  { "rule": "DP-P001", "decision": "DD-030", "reason": "브랜드 헤드라인은 그라디언트 텍스트로 결정했다" }
]
```

| 조건 | 어기면 |
|------|--------|
| `rule`이 등록된 규칙 ID | `invalid[]` — `unknown rule` |
| 면제 가능한 접두(`DP-R`·`DP-P`)만 | `invalid[]` — `not waivable` |
| `decision`이 `decisions[].id`에 선언된 결정 | `invalid[]` — `missing decision` / `undeclared decision` |
| `reason`이 공백 제외 10자 이상 | `invalid[]` — `reason too short` |
| 같은 규칙은 한 번만 | `invalid[]` — `duplicate waiver` |

- 면제된 finding은 `ruleFailures[]`에서 빠지고 각 린트 결과의 `waived[]`로 옮겨진다. 사실은 버리지 않는다.
- 잘못된 면제는 무시되고 `health-score.json`의 `ruleWaivers.invalid[]`와 콘솔에 남는다. 조용히 통과시키지 않는다.
- **토큰(DP-T)·한국어(DP-K)·상태(DP-S)는 면제할 수 없다.** 토큰은 허용 목록 자체가 계약이고, 나머지는 결정으로 덮을 대상이 아니다.
- `ruleWaivers`는 계약 해시(`contractHash`)에 들어가지 않는다. 면제를 추가해도 토큰 baseline이 재동결되지 않는다.

---

## DP-A — 접근성

axe-core가 내는 rule id를 그대로 인용한다(`color-contrast`, `button-name`, `image-alt` …).
별도 번호를 붙이지 않는다 — 이미 안정적인 전역 ID 체계가 있고, 재명명은 추적성을 떨어뜨린다.
Health Score에서 critical 30점 / serious 20점 배점으로 반영된다.

---

## DP-U / DP-C / DP-F — 모델 판단 규칙

- `DP-U<섹션><번호>` — [ux-rules.md](./ux-rules.md)의 각 행. 예: `DP-U609` = Focus States.
- `DP-C<섹션><번호>` — [component-checklist.md](./component-checklist.md)의 각 항목.
- `DP-F<섹션><번호>` — [craft-floor.md](./craft-floor.md)의 각 행. 예: `DP-F107` = 브라우저 기본 표면. 같은 항목을 자동 규칙(DP-R/P/S)이 계측하면 그쪽을 인용한다.

리뷰에서 이 규칙들을 지적할 때는 **행 ID + 위반 위치(선택자/파일:라인)** 를 함께 적는다.
심각도는 `DP-U`면 ux-rules.md의 Severity 열, `DP-F`면 craft-floor.md의 "기본 심각도" 열을 그대로 쓴다.
`DP-F3xx`(인지 부하)는 열이 없다. craft-floor.md 7절의 등급 규칙을 따른다.
ID 없이 서술만 있는 지적은 리포트에 넣지 않는다 — 다음 회차에 같은 항목인지 대조할 수 없기 때문.

---

## 리포트 인용 형식

```
[CRITICAL] DP-T002 색상이 디자인 계약 팔레트 밖의 값 (x3, 2 new) — DD-009
    e.g. main > section.hero > button.cta — #3B82F6
[HIGH]     DP-K001 한글 텍스트에 serif fallback 폰트 스택 (x12)
    e.g. article > p — Inter, serif
[MEDIUM]   DP-U302 Error Placement — 폼 에러가 상단에 몰려 있음 (components/SignupForm.tsx:88)
```

- 자동 규칙(DP-T/K/S/R/P)은 `health-score.json`의 `ruleFailures[]`를 **그대로** 옮긴다. 심각도를 재해석하지 않는다.
- `ruleWaivers`로 면제된 규칙은 `ruleFailures[]`에 없다. 리포트에는 "면제됨 (DD-xxx)"로 한 줄만 적는다.
- 신규 토큰 위반(`newCount > 0`)은 심각도가 CRITICAL로 승격되어 항상 최상단에 온다.
