---
description: 디자인 전면 리뉴얼. 서비스 유형 자동 감지 → 스타일/팔레트/타이포 자동 선택 → 디자인 시스템 전면 교체
argument-hint: [--analyze|--wcag-only|--no-wcag] [--style <keyword>] [--site <name>] [--keyword <term>]
---

# 디자인 전면 리뉴얼

서비스 유형을 자동 감지하고, data/ 지식 기반에서 스타일/팔레트/타이포를 자동 선택하여 디자인 시스템을 전면 교체합니다.
WCAG 접근성 체크를 포함합니다.

## 기본 동작 (인수 없이 실행)

서비스 유형 자동 감지 → data/ 지식 기반에서 스타일/팔레트/타이포 자동 선택 → 전면 리뉴얼

## 옵션

- `--analyze`: 분석 + 리뉴얼 계획만 출력, 코드 적용하지 않음
- `--wcag-only`: WCAG 접근성 체크만 수행
- `--no-wcag`: WCAG 체크 생략
- `--style <keyword>`: 원하는 스타일 방향 (예: glassmorphism, minimal, dark)
- `--site <name>`: 레퍼런스 사이트 (미지정시 프로젝트 유형에 맞게 자동 선택)
- `--keyword <term>`: 기능 키워드 (미지정시 전체 리뉴얼)

## 실행

design-renewal 스킬을 호출하여 실행합니다.
