---
description: 디자인 전면 리뉴얼. 디자인 시스템 교체, 팔레트/타이포/컴포넌트 전면 변경, WCAG 접근성 체크 포함
argument-hint: [--analyze|--wcag-only|--no-wcag] [style-keyword] [site] [keyword]
---

# 디자인 리뉴얼

디자인 시스템을 전면 교체합니다. 색상 팔레트, 타이포그래피 페어링, 컴포넌트 스타일, 레이아웃 구조를 포함한 대규모 디자인 변경을 수행합니다.
WCAG 기본 접근성 체크를 포함합니다.

## 옵션

- `--analyze`: 분석만 수행 (코드 변경 없음)
- `--wcag-only`: WCAG 접근성 체크만 수행
- `--no-wcag`: WCAG 체크 생략
- style-keyword: 원하는 스타일 방향 (예: "glassmorphism", "minimal", "dark", "brutalist")
- `$1`: 레퍼런스 사이트 (미지정시 프로젝트 유형에 맞게 자동 선택)
- `$2`: 기능 키워드 (미지정시 전체 디자인 리뉴얼)

## /design-polish와의 차이

| | /design-polish | /design-renewal |
|--|---------------|-----------------|
| 수준 | 다듬기 (CSS 보정) | 전면 리뉴얼 (디자인 시스템 교체) |
| 색상 | 대비 보정 | 팔레트 전체 교체 |
| 레이아웃 | 여백/정렬 수정 | 구조 재배치 |
| 컴포넌트 | hover/focus 보정 | 스타일 전면 변경 |
| 타이포 | 크기/행간 조정 | 폰트 페어링 교체 |
| 위험도 | 낮음 (비파괴적) | 높음 (대규모 변경) |

## 실행

design-renewal 스킬을 호출하여 실행합니다.
