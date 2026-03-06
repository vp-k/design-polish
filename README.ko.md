# design-polish v2.1

[English](README.md)

디자인 지식 기반 폴리싱 + 전면 리뉴얼을 위한 Claude Code 플러그인.
디자인 지식 기반 + 시각 비교 + WCAG 접근성 체크 + 트렌드 검색 통합.

## 명령어

| 명령어 | 설명 | 범위 |
|--------|------|------|
| `/design-polish` | CSS 보정, 여백 수정, hover/focus 개선 | 낮은 위험도 (비파괴적) |
| `/design-renewal` | 디자인 시스템 전면 교체 — 팔레트, 타이포, 토큰 | 높은 위험도 (대규모 변경) |

## 주요 기능

- **디자인 지식 기반** — 66개 스타일, 96개 색상 팔레트, 57개 타이포그래피 페어링, 13개 기술 스택 가이드
- **서비스 유형 규칙** — 20개 서비스 유형별 UI 추론 규칙 (자동 감지)
- **컴포넌트 체크리스트** — Button, Card, Modal, Input, Navigation, Toast의 Do/Don't
- **UX 규칙 & 안티패턴** — 6개 카테고리 52+ 규칙
- **BM25 검색 엔진** — 전체 디자인 데이터 Node.js 검색 (Python 의존성 없음)
- **스크린샷 캡처** — Puppeteer 기반 로컬 프로젝트 캡처
- **레퍼런스 사이트 검색** — Mobbin, Godly, Dribbble, SiteInspire 등
- **WCAG 접근성** — axe-core 기반 자동 검사
- **8단계 우선순위** — P1 (CRITICAL) ~ P8 (LOW) 개선안
- **자동 적용** — 코드 개선 기본 적용 (분석만 원하면 `--analyze` 사용)

## 디렉토리 구조

```
design-polish/
├── .claude-plugin/
│   └── plugin.json               # 플러그인 메타데이터
├── knowledge/                    # 마크다운 — 직접 Read()
│   ├── industry-rules.md         # 20개 서비스 유형 UI 추론 규칙
│   ├── component-checklist.md    # 6개 컴포넌트 Do/Don't 체크리스트
│   └── ux-rules.md               # 6개 카테고리 52+ UX 규칙
├── data/                         # JSON — BM25 검색 가능
│   ├── styles.json               # 66개 디자인 스타일
│   ├── colors.json               # 96개 색상 팔레트 (HEX 코드 포함)
│   ├── typography.json           # 57개 폰트 페어링 (Google Fonts URL 포함)
│   └── stacks.json               # 13개 기술 스택 가이드
├── scripts/
│   ├── capture.cjs               # Puppeteer 스크린샷 + axe-core
│   └── search.cjs                # BM25 검색 엔진 (Node.js)
├── skills/
│   ├── design-polish/SKILL.md    # 폴리싱 스킬 사양
│   └── design-renewal/SKILL.md   # 리뉴얼 스킬 사양
├── commands/
│   ├── design-polish.md          # 폴리싱 명령어
│   └── design-renewal.md         # 리뉴얼 명령어
├── package.json
├── README.md                     # 영어
└── README.ko.md                  # 한국어
```

## 설치

이 플러그인은 [devncat](https://github.com/vp-k/devncat) 마켓플레이스의 일부입니다.

```bash
# 마켓플레이스 클론 (모든 플러그인 포함)
git clone --recurse-submodules https://github.com/vp-k/devncat ~/.claude/plugins/marketplaces/devncat

# design-polish 의존성 설치 (puppeteer + axe-core만, Python 불필요)
cd ~/.claude/plugins/marketplaces/devncat/plugins/design-polish
npm install
```

## 사용법

### /design-polish — 폴리싱 (비파괴적)

```
/design-polish                                         # 전체 폴리싱 + WCAG + 적용 (기본)
/design-polish --analyze                               # 분석만, 코드 변경 없음
/design-polish --wcag-only                             # WCAG 체크만
/design-polish --no-wcag                               # WCAG 생략
/design-polish --site mobbin                           # Mobbin에서 검색 + 적용
/design-polish --site godly --keyword hero             # Godly에서 hero 검색 + 적용
/design-polish --analyze --site godly --keyword hero   # 검색 + 분석만
```

### /design-renewal — 전면 리뉴얼 (디자인 시스템 교체)

```
/design-renewal                                        # 자동 감지 → 자동 스타일 → 계획 + 확인 → 전면 리뉴얼
/design-renewal --style glassmorphism                  # glassmorphism 스타일로 리뉴얼
/design-renewal --analyze                              # 리뉴얼 계획만, 코드 변경 없음
/design-renewal --wcag-only                            # WCAG 체크만
/design-renewal --no-wcag --style dark                 # WCAG 생략, 다크 스타일 리뉴얼
/design-renewal --site godly --keyword hero            # Godly hero 참조하여 리뉴얼
/design-renewal --analyze --style minimal              # minimal 스타일 리뉴얼 계획만
```

## search.cjs — BM25 검색 CLI

커맨드라인에서 디자인 지식 기반을 검색합니다:

```bash
# 스타일 검색
node scripts/search.cjs --domain style "glass modern saas"

# 색상 팔레트 검색
node scripts/search.cjs --domain color "healthcare calm"

# 타이포그래피 검색
node scripts/search.cjs --domain typography "luxury elegant"

# 기술 스택 가이드 검색
node scripts/search.cjs --domain stack --stack react "performance image"

# 도메인 자동 감지
node scripts/search.cjs "saas dashboard blue"

# 결과 수 조정
node scripts/search.cjs --domain color --max 5 "fintech"
```

출력은 JSON:
```json
{
  "domain": "style",
  "query": "glass modern saas",
  "results": [
    { "score": 8.93, "data": { "name": "Glassmorphism", "..." : "..." } }
  ]
}
```

## 워크플로우

### /design-polish

```
0. 프로젝트 분석 + 서비스 유형 감지 + 스크린샷
1. WCAG 접근성 체크 (axe-core)
1.5. 디자인 지식 로딩 (Read + search.cjs)
2. 레퍼런스 사이트 선택
3. 트렌드 검색 + 레퍼런스 캡처
4. Gap 분석 (시각 + 지식 기반)
5. 개선안 도출 (8단계 우선순위)
6. 결과 출력
7. 코드 적용 (기본, --analyze 시 생략)
```

### /design-renewal

```
0. 프로젝트 분석 + 서비스 유형 감지 + 스크린샷
1. WCAG 접근성 체크 (axe-core)
1.5. 디자인 지식 로딩 + 스타일 자동 선택
2. 레퍼런스 사이트 선택
3. 트렌드 검색 + 레퍼런스 캡처
4. Gap 분석 + 리뉴얼 대상 식별
5. 리뉴얼 계획 도출 (8단계 우선순위)
6. 결과 출력 (토큰 변경 테이블 포함)
7. 전면 리뉴얼 코드 적용 (CSS 변수, 팔레트, 타이포, 토큰)
```

#### 옵션별 플로우 분기

| 옵션 | 플로우 |
|------|--------|
| (기본) | 0단계 → 1단계 → 1.5단계 → 2~6단계 → 7단계 |
| `--wcag-only` | 0단계 → 1단계 → 결과 출력 (종료) |
| `--no-wcag` | 0단계 → 1.5단계 (1단계 건너뜀) → 2~6단계 → 7단계 |
| `--analyze` | 0단계 → 1단계 → 1.5단계 → 2~6단계 → 종료 (7단계 건너뜀) |

## 우선순위 시스템

| 우선순위 | 카테고리 | 영향 |
|---------|---------|------|
| P1 | 접근성 (WCAG) | CRITICAL |
| P2 | 터치/인터랙션 | CRITICAL |
| P3 | 성능 | HIGH |
| P4 | 레이아웃/반응형 | HIGH |
| P5 | 타이포/색상 | MEDIUM |
| P6 | 애니메이션 | MEDIUM |
| P7 | 스타일 적합성 | MEDIUM |
| P8 | 차트/데이터 | LOW |

## WCAG 체크

| 체크 항목 | WCAG 기준 |
|----------|-----------|
| 색상 대비 | 4.5:1 (AA) |
| 대형 텍스트 대비 | 3:1 (AA) |
| UI 컴포넌트 대비 | 3:1 |
| 터치 타겟 크기 | 44x44px |
| 텍스트 크기 | 최소 12px |
| 링크 구분 | 밑줄 또는 3:1 대비 |

## 출력

```
.design-polish/
├── screenshots/
│   ├── current-main.png
│   └── reference-*.png
└── accessibility/
    └── wcag-report.json
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| BASE_URL | http://localhost:3000 | 로컬 서버 URL |
| OUTPUT_DIR | .design-polish/screenshots | 스크린샷 디렉토리 |
| A11Y_DIR | .design-polish/accessibility | 접근성 보고서 디렉토리 |
| WAIT_TIME | 2000 | 페이지 로드 후 대기 시간 (ms) |
| TIMEOUT | 30000 | 페이지 로드 타임아웃 (ms) |
| FULL_PAGE | false | 전체 페이지 캡처 |

## 데이터 소스

디자인 지식은 [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT License)에서 적응, CSV/Python에서 JSON/Node.js로 변환하여 무의존성 통합.

## 라이선스

MIT
