---
description: 디자인 레퍼런스 기반 폴리싱. 트렌드 검색, Gap 분석, WCAG 접근성 체크 후 코드에 직접 적용
argument-hint: [--analyze|--wcag-only|--no-wcag] [--site <name>] [--keyword <term>]
---

# 디자인 폴리싱

디자인 레퍼런스 사이트에서 트렌드를 검색하고, 현재 프로젝트와 비교하여 개선안을 도출하고 코드에 직접 적용합니다.
WCAG 기본 접근성 체크를 포함합니다.

## 옵션

- `--analyze`: 분석 결과만 출력하고 코드 적용하지 않음 (기본: 분석 + 적용)
- `--wcag-only`: WCAG 접근성 체크만 수행
- `--no-wcag`: WCAG 체크 생략
- `--site <name>`: 레퍼런스 사이트 (미지정시 프로젝트 유형에 맞게 자동 선택)
- `--keyword <term>`: 기능 키워드 (미지정시 전체 디자인 폴리싱)

## 실행

design-polish 스킬을 호출하여 실행합니다.
