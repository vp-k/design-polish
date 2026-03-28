---
description: "스크린샷/이미지에서 UI 코드 생성. Claude 비전 + 디자인 지식 DB로 정확한 코드 변환"
argument-hint: <image-path> [--framework react|flutter|vue|svelte|html] [--style-hint "keyword"] [--apply]
---

# 디자인 → 코드 변환

스크린샷이나 디자인 이미지를 분석하여 프레임워크별 UI 코드를 생성합니다.
Claude 비전으로 디자인 속성(레이아웃, 색상, 타이포, 컴포넌트)을 추출하고,
디자인 지식 DB(67개 스타일, 96개 팔레트, 57개 타이포그래피)로 보강하여 정확한 코드를 생성합니다.

## 옵션

- `$1` (필수): 이미지 파일 경로 (PNG, JPG, WebP)
- `--framework <name>`: 타겟 프레임워크 (미지정시 프로젝트에서 자동 감지)
  - react, next, vue, nuxt, svelte, flutter, html
- `--style-hint "<keyword>"`: 스타일 힌트 (예: "glassmorphism", "minimal dark", "brutalist")
- `--apply`: 생성된 코드를 파일로 직접 작성

## 사용 예시

```
/design-from-screenshot screenshot.png
/design-from-screenshot hero.png --framework react
/design-from-screenshot mockup.png --framework flutter --style-hint "minimal saas"
/design-from-screenshot landing.png --apply
```

## 실행

design-from-screenshot 스킬을 호출하여 실행합니다.
