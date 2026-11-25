#!/usr/bin/env node
// craft.test.cjs — 가독성(DP-R)·AI 상투 패턴(DP-P) 순수 린트 + 규칙 예외(ruleWaivers) 단위 테스트
// 실행: node tests/craft.test.cjs   또는   npm test
//
// 계측(page.evaluate)은 브라우저, 판정(lint*)은 순수 함수다. 여기서는 판정만 결정론적으로 검증한다.
// 규칙마다 "걸리는 입력"과 "아슬아슬하게 통과하는 입력"을 함께 둔다.

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const C = require('../scripts/design-contract.cjs');
const K = require('../scripts/craft-lint.cjs');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}

const ids = (lint) => lint.findings.map(f => f.id);
const has = (lint, id) => ids(lint).includes(id);

// 텍스트 샘플 기본값 — 평범한 본문 문단 한 개
function textSample(over = {}) {
  return {
    selector: 'p.body',
    tag: 'p',
    chars: 200,
    spaces: 34,
    latin: 160,
    fontSize: 16,
    lineHeightPx: 24,
    letterSpacingPx: 0,
    fontWeight: 400,
    textTransform: 'none',
    textAlign: 'start',
    hyphens: 'manual',
    lineWidths: [640, 640, 400],
    heading: false,
    codeContext: false,
    uiContext: false,
    finePrint: false,
    monoPre: false,
    ...over,
  };
}

function readability(text = [], extra = {}) {
  return K.lintReadability({ scanned: text.length, capped: false, text, headings: [], typeScale: [], ...extra });
}

// ============================================
// 레지스트리
// ============================================

const NEW_IDS = [
  'DP-R001', 'DP-R002', 'DP-R003', 'DP-R004', 'DP-R005', 'DP-R006', 'DP-R007', 'DP-R008',
  'DP-P001', 'DP-P002', 'DP-P003', 'DP-P004',
];

test('RULES: DP-R/DP-P 12개가 등록되어 있다', () => {
  for (const id of NEW_IDS) assert.ok(C.RULES[id], `${id} 미등록`);
});

test('RULES: DP-R/DP-P는 MEDIUM 또는 LOW뿐이다 (Pivot 기준을 흔들지 않는다)', () => {
  for (const id of NEW_IDS) {
    assert.ok(['MEDIUM', 'LOW'].includes(C.RULES[id].severity), `${id}: ${C.RULES[id].severity}`);
  }
});

test('summarizeSeverity: DP-R/DP-P 위반만 있으면 blockingNewViolations는 0이다', () => {
  const list = NEW_IDS.map(id => ({ id, severity: C.RULES[id].severity, count: 50 }));
  const s = C.summarizeSeverity(list);
  assert.strictEqual(s.blockingNewViolations, 0);
  assert.strictEqual(s.blockingViolations, 0);
  assert.strictEqual(s.totalViolations, 600);
});

test('failure-rules.md: DP-R/DP-P 규칙 ID가 모두 문서화되어 있다', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'failure-rules.md'), 'utf-8');
  for (const id of NEW_IDS) assert.ok(doc.includes(`| ${id} |`), `${id} 문서 누락`);
});

test('린트가 내는 모든 ID가 RULES에 등록되어 있다', () => {
  const r = readability([
    textSample({ chars: 600, lineWidths: [1048, 1048, 1048, 1048, 608] }),
  ]);
  for (const f of r.findings) assert.ok(C.RULES[f.id], f.id);
});

// ============================================
// 측정 없음 / 빈 측정
// ============================================

test('lintReadability: 측정이 없으면 enabled=false', () => {
  assert.strictEqual(K.lintReadability(null).enabled, false);
  assert.strictEqual(K.lintSlopPatterns(undefined).enabled, false);
});

test('lintReadability: 상한 도달이면 measurement=incomplete', () => {
  const r = K.lintReadability({ scanned: 3000, capped: true, text: [], headings: [], typeScale: [] });
  assert.strictEqual(r.enabled, true);
  assert.strictEqual(r.measurement, 'incomplete');
  const ok = K.lintReadability({ scanned: 10, capped: false, text: [], headings: [], typeScale: [] });
  assert.strictEqual(ok.measurement, 'complete');
});

// ============================================
// DP-R001 줄 길이
// ============================================

test('estimateLineChars: 렌더된 글자 수를 줄 너비 비율로 나눈다', () => {
  assert.deepStrictEqual(K.estimateLineChars(300, [100, 100, 100]), [100, 100, 100]);
  assert.deepStrictEqual(K.estimateLineChars(10, []), []);
  assert.deepStrictEqual(K.estimateLineChars(10, [0, 0]), []);
});

test('DP-R001: 라틴 본문 한 줄 131자가 2줄 이상이면 걸린다', () => {
  // 16px 라틴 평균 0.5em → 1048px 한 줄 ≈ 131자
  const r = readability([textSample({ chars: 600, lineWidths: [1048, 1048, 1048, 1048, 608] })]);
  assert.ok(has(r, 'DP-R001'));
});

test('DP-R001: 한 줄 80자는 통과한다 (85자 이하)', () => {
  const r = readability([textSample({ chars: 400, lineWidths: [640, 640, 640, 640, 640] })]);
  assert.ok(!has(r, 'DP-R001'));
});

test('DP-R001: 85자를 넘는 줄이 1줄뿐이면 통과한다', () => {
  // 첫 줄만 길고 나머지는 짧다
  const r = readability([textSample({ chars: 200, lineWidths: [900, 300, 300] })]);
  // 900/1500*200 = 120자 1줄, 40자 2줄
  assert.ok(!has(r, 'DP-R001'));
});

test('DP-R001: 한글 문단은 글자 수로 센다 — 1048px@16px(약 65자)는 통과', () => {
  // 한글 300자, 16px 전각 → 1048px 한 줄 ≈ 65자. 너비/0.5em(131자)로 추정하면 거짓 양성이 난다.
  const sample = textSample({ chars: 300, spaces: 70, latin: 0, lineWidths: [1048, 1048, 1048, 1048, 600] });
  const r = readability([sample]);
  assert.ok(!has(r, 'DP-R001'), JSON.stringify(r.findings));
  assert.ok(1048 / (16 * 0.5) > 85, '라틴 폭 추정이었다면 걸렸을 입력인지 전제 확인');
});

test('DP-R001: 한글 문단도 1590px@16px(약 99자)는 걸린다', () => {
  const r = readability([textSample({ chars: 400, spaces: 90, latin: 0, lineWidths: [1590, 1590, 1590, 1590, 50] })]);
  assert.ok(has(r, 'DP-R001'));
});

test('DP-R001: 80자 이하 텍스트와 코드 맥락은 보지 않는다', () => {
  const short = readability([textSample({ chars: 80, lineWidths: [2000, 2000] })]);
  assert.ok(!has(short, 'DP-R001'));
  const code = readability([textSample({ chars: 600, codeContext: true, lineWidths: [1048, 1048, 1048, 1048, 608] })]);
  assert.ok(!has(code, 'DP-R001'));
});

// ============================================
// DP-R002 행간
// ============================================

test('DP-R002: 여러 줄 본문의 line-height 1.2배는 걸린다', () => {
  const r = readability([textSample({ lineHeightPx: 19.2 })]);
  assert.ok(has(r, 'DP-R002'));
});

test('DP-R002: line-height normal(null)은 1.2배로 보고 걸린다', () => {
  const r = readability([textSample({ lineHeightPx: null })]);
  assert.ok(has(r, 'DP-R002'));
});

test('DP-R002: 1.3배는 통과한다', () => {
  const r = readability([textSample({ lineHeightPx: 20.8 })]);
  assert.ok(!has(r, 'DP-R002'));
});

test('DP-R002: 한 줄 텍스트·제목·24px 이상·짧은 대문자 라벨은 면제된다', () => {
  const tight = { lineHeightPx: 17 };
  assert.ok(!has(readability([textSample({ ...tight, lineWidths: [500] })]), 'DP-R002'));
  assert.ok(!has(readability([textSample({ ...tight, heading: true, tag: 'h2' })]), 'DP-R002'));
  assert.ok(!has(readability([textSample({ fontSize: 24, lineHeightPx: 26 })]), 'DP-R002'));
  assert.ok(!has(readability([textSample({ ...tight, chars: 30, textTransform: 'uppercase' })]), 'DP-R002'));
});

test('DP-R002: 대문자라도 긴 문단이면 걸린다', () => {
  const r = readability([textSample({ lineHeightPx: 17, chars: 200, textTransform: 'uppercase' })]);
  assert.ok(has(r, 'DP-R002'));
});

// ============================================
// DP-R003 양쪽 정렬
// ============================================

test('DP-R003: 좁은 단(45자 이하)의 하이픈 없는 justify는 걸린다', () => {
  const r = readability([textSample({ textAlign: 'justify', chars: 120, lineWidths: [320, 320, 320] })]);
  assert.ok(has(r, 'DP-R003'));
});

test('DP-R003: hyphens: auto면 통과한다', () => {
  const r = readability([textSample({ textAlign: 'justify', hyphens: 'auto', chars: 120, lineWidths: [320, 320, 320] })]);
  assert.ok(!has(r, 'DP-R003'));
});

test('DP-R003: 넓은 단(45자 초과)은 통과한다', () => {
  const r = readability([textSample({ textAlign: 'justify', chars: 180, lineWidths: [480, 480, 480] })]);
  assert.ok(!has(r, 'DP-R003'));
});

test('DP-R003: 띄어쓰기가 없는 CJK 텍스트는 면제된다', () => {
  const r = readability([textSample({ textAlign: 'justify', chars: 120, spaces: 0, latin: 0, lineWidths: [320, 320, 320] })]);
  assert.ok(!has(r, 'DP-R003'));
});

// ============================================
// DP-R004 긴 대문자
// ============================================

test('DP-R004: 대문자 변환된 라틴 본문 80자 이상은 걸린다', () => {
  const r = readability([textSample({ textTransform: 'uppercase', chars: 80, latin: 70 })]);
  assert.ok(has(r, 'DP-R004'));
});

test('DP-R004: 79자는 통과하고, 제목과 한글 텍스트는 면제된다', () => {
  assert.ok(!has(readability([textSample({ textTransform: 'uppercase', chars: 79, latin: 70 })]), 'DP-R004'));
  assert.ok(!has(readability([textSample({ textTransform: 'uppercase', chars: 120, latin: 100, heading: true })]), 'DP-R004'));
  assert.ok(!has(readability([textSample({ textTransform: 'uppercase', chars: 120, latin: 4 })]), 'DP-R004'));
});

// ============================================
// DP-R005 자간
// ============================================

test('DP-R005: 20자 초과 텍스트의 자간 0.06em은 걸린다', () => {
  const r = readability([textSample({ letterSpacingPx: 0.96 })]);
  assert.ok(has(r, 'DP-R005'));
});

test('DP-R005: 0.05em은 통과하고, 40자 이하 대문자 라벨은 면제된다', () => {
  assert.ok(!has(readability([textSample({ letterSpacingPx: 0.8 })]), 'DP-R005'));
  assert.ok(!has(readability([textSample({ letterSpacingPx: 2, chars: 40, textTransform: 'uppercase' })]), 'DP-R005'));
  assert.ok(!has(readability([textSample({ letterSpacingPx: 2, chars: 20 })]), 'DP-R005'));
});

test('DP-R005: 41자 이상 대문자는 면제되지 않는다', () => {
  const r = readability([textSample({ letterSpacingPx: 2, chars: 41, textTransform: 'uppercase' })]);
  assert.ok(has(r, 'DP-R005'));
});

// ============================================
// DP-R006 작은 글자
// ============================================

test('DP-R006: 20자 초과 본문의 11px는 걸린다', () => {
  const r = readability([textSample({ fontSize: 11, lineHeightPx: 16 })]);
  assert.ok(has(r, 'DP-R006'));
});

test('DP-R006: 12px는 통과한다', () => {
  const r = readability([textSample({ fontSize: 12, lineHeightPx: 18 })]);
  assert.ok(!has(r, 'DP-R006'));
});

test('DP-R006: UI 맥락·코드·깨알 고지·대문자·제외 태그는 면제된다', () => {
  const tiny = { fontSize: 10, lineHeightPx: 15 };
  for (const over of [
    { uiContext: true },
    { codeContext: true },
    { finePrint: true },
    { textTransform: 'uppercase' },
    { monoPre: true },
    { tag: 'figcaption' },
    { tag: 'sup' },
    { chars: 20 },
  ]) {
    const r = readability([textSample({ ...tiny, ...over })]);
    assert.ok(!has(r, 'DP-R006'), JSON.stringify(over));
  }
});

// ============================================
// DP-R007 제목 단계 건너뜀
// ============================================

test('DP-R007: h2 다음 h4는 걸린다', () => {
  const r = readability([], { headings: [{ level: 1 }, { level: 2 }, { level: 4, selector: 'h4.x' }] });
  assert.ok(has(r, 'DP-R007'));
  assert.strictEqual(r.findings.find(f => f.id === 'DP-R007').count, 1);
});

test('DP-R007: 한 단계씩 내려가거나 다시 올라가는 것은 통과한다', () => {
  const r = readability([], { headings: [{ level: 1 }, { level: 2 }, { level: 3 }, { level: 2 }, { level: 3 }] });
  assert.ok(!has(r, 'DP-R007'));
});

test('DP-R007: 첫 제목이 h3이어도 이전 단계가 없으면 통과하고, 푸터로의 점프는 면제된다', () => {
  assert.ok(!has(readability([], { headings: [{ level: 3 }, { level: 4 }] }), 'DP-R007'));
  assert.ok(!has(readability([], { headings: [{ level: 1 }, { level: 4, inFooter: true }] }), 'DP-R007'));
});

// ============================================
// DP-R008 평탄한 타이포 위계
// ============================================

const scale = (rows) => rows.map(([role, size, count = 1, weight = 400]) => ({ role, size, count, weight }));

test('analyzeTypeScale: 인접 단계 비율이 모두 1.25 미만이면 flat', () => {
  const a = K.analyzeTypeScale(scale([['h1', 20], ['h2', 18], ['body', 16, 10]]));
  assert.strictEqual(a.flat, true);
  assert.ok(a.maxStep < 1.25);
});

test('analyzeTypeScale: 한 단계라도 1.25 이상이면 flat이 아니다', () => {
  const a = K.analyzeTypeScale(scale([['h1', 32], ['h2', 20], ['body', 16, 10]]));
  assert.strictEqual(a.flat, false);
});

test('analyzeTypeScale: 역할이 3개 미만이면 판정하지 않는다', () => {
  const a = K.analyzeTypeScale(scale([['h1', 17], ['body', 16, 10]]));
  assert.strictEqual(a.flat, false);
  assert.ok(a.skipped);
});

test('analyzeTypeScale: h1이 본문보다 작으면 판정하지 않는다', () => {
  const a = K.analyzeTypeScale(scale([['h1', 14], ['h2', 15], ['body', 16, 10]]));
  assert.strictEqual(a.flat, false);
  assert.ok(a.skipped);
});

test('analyzeTypeScale: 동률이면 h1은 큰 값을 쓰고 다른 역할은 빠진다', () => {
  const a = K.analyzeTypeScale(scale([
    ['h1', 20, 1], ['h1', 40, 1],
    ['h2', 18, 1], ['h2', 22, 1],
    ['h3', 17], ['body', 16, 10],
  ]));
  assert.strictEqual(a.roles.h1, 40);
  assert.ok(!('h2' in a.roles));
});

test('analyzeTypeScale: 근접 동률(75% 이상·1.25배 이상)인 역할은 빠진다', () => {
  const a = K.analyzeTypeScale(scale([['h2', 18, 4], ['h2', 24, 3], ['h1', 20], ['h3', 17], ['body', 16, 10]]));
  assert.ok(!('h2' in a.roles));
});

test('analyzeTypeScale: 8px 미만·200px 초과 크기는 버린다', () => {
  const a = K.analyzeTypeScale(scale([['h1', 300], ['h1', 20], ['h2', 18], ['body', 16, 10], ['body', 4, 50]]));
  assert.strictEqual(a.roles.h1, 20);
  assert.strictEqual(a.roles.body, 16);
});

test('DP-R008: 평탄한 위계는 MEDIUM으로 걸린다', () => {
  const r = readability([], { typeScale: scale([['h1', 20], ['h2', 18], ['body', 16, 10]]) });
  const f = r.findings.find(x => x.id === 'DP-R008');
  assert.ok(f);
  assert.strictEqual(f.severity, 'MEDIUM');
  assert.strictEqual(f.count, 1);
});

test('DP-R008: 제목 80% 이상이 본문보다 200 이상 굵으면 info로 강등된다', () => {
  const r = readability([], {
    typeScale: scale([['h1', 20, 1, 700], ['h2', 18, 4, 700], ['body', 16, 10, 400]]),
  });
  assert.ok(!has(r, 'DP-R008'));
  assert.ok(r.info.some(i => i.id === 'DP-R008'));
});

// ============================================
// DP-P001 그라디언트 텍스트
// ============================================

function patterns(extra = {}) {
  return K.lintSlopPatterns({
    scanned: 10, capped: false, viewportWidth: 1280,
    gradientText: [], borders: [], boxes: [], motion: [], animations: [], ...extra,
  });
}

test('DP-P001: background-clip:text + 보이는 그라디언트는 걸린다', () => {
  const r = patterns({ gradientText: [{ selector: 'h1', backgroundImage: 'linear-gradient(90deg, rgb(124, 58, 237), rgb(219, 39, 119))' }] });
  assert.ok(has(r, 'DP-P001'));
});

test('DP-P001: 모든 색 정지점의 알파가 0.15 미만이면 통과, 그라디언트가 아니면 통과', () => {
  const faint = patterns({ gradientText: [{ selector: 'h1', backgroundImage: 'linear-gradient(90deg, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.05))' }] });
  assert.ok(!has(faint, 'DP-P001'));
  const image = patterns({ gradientText: [{ selector: 'h1', backgroundImage: 'url("a.png")' }] });
  assert.ok(!has(image, 'DP-P001'));
});

test('gradientMaxAlpha: rgb는 1, rgba는 알파, 정지점이 없으면 null', () => {
  assert.strictEqual(K.gradientMaxAlpha('linear-gradient(rgb(1, 2, 3), rgba(0, 0, 0, 0.2))'), 1);
  assert.strictEqual(K.gradientMaxAlpha('linear-gradient(rgba(1, 2, 3, 0.1), rgba(0, 0, 0, 0.2))'), 0.2);
  assert.strictEqual(K.gradientMaxAlpha('none'), null);
});

// ============================================
// DP-P002 둥근 박스 한쪽 면의 강조 줄무늬
// ============================================

function border(over = {}) {
  return {
    selector: '.card', tag: 'div', width: 300, height: 100,
    widths: [0, 0, 0, 4], colorsVisible: [false, false, false, true],
    radii: [12, 12, 12, 12], stateMarked: false, ...over,
  };
}

test('DP-P002: 둥근 카드의 왼쪽 4px 줄무늬는 걸린다', () => {
  assert.ok(has(patterns({ borders: [border()] }), 'DP-P002'));
});

test('DP-P002: 다른 면에 1px 테두리가 있어도 한쪽이 지배적이면 걸린다', () => {
  assert.ok(has(patterns({ borders: [border({ widths: [1, 1, 1, 4], colorsVisible: [true, true, true, true] })] }), 'DP-P002'));
});

test('DP-P002: 줄무늬가 닿지 않는 두 모서리가 4px 미만이면 통과한다', () => {
  // 왼쪽 줄무늬 → 판정 모서리는 오른쪽 위·아래 (radii 순서: tl, tr, br, bl)
  assert.ok(!has(patterns({ borders: [border({ radii: [0, 0, 0, 0] })] }), 'DP-P002'));
  assert.ok(!has(patterns({ borders: [border({ radii: [12, 3, 3, 12] })] }), 'DP-P002'));
});

test('DP-P002: 줄무늬 쪽만 둥글린 박스는 각진 박스로 본다', () => {
  assert.ok(!has(patterns({ borders: [border({ radii: [8, 0, 0, 8] })] }), 'DP-P002'));
});

test('DP-P002: 위쪽 띠도 반대편이 둥글면 걸린다', () => {
  const b = border({ widths: [4, 0, 0, 0], colorsVisible: [true, false, false, false], radii: [0, 0, 12, 12] });
  assert.ok(has(patterns({ borders: [b] }), 'DP-P002'));
});

test('DP-P002: 네 면 테두리 균일·작은 요소·안전 태그·활성 상태는 통과한다', () => {
  for (const over of [
    { widths: [2, 2, 2, 2], colorsVisible: [true, true, true, true] },
    { widths: [0, 0, 0, 1] },
    { width: 19 },
    { tag: 'blockquote' },
    { tag: 'a' },
    { stateMarked: true },
    { colorsVisible: [false, false, false, false] },
  ]) {
    assert.ok(!has(patterns({ borders: [border(over)] }), 'DP-P002'), JSON.stringify(over));
  }
});

test('DP-P002: label은 안전 태그가 아니다 (카드형 라벨은 대표 사례)', () => {
  assert.ok(has(patterns({ borders: [border({ tag: 'label' })] }), 'DP-P002'));
});

// ============================================
// DP-P003 카드 안의 카드
// ============================================

function box(over = {}) {
  return {
    selector: '.card', ancestor: -1, tag: 'div', width: 400, height: 240,
    edgeSides: 4, shadow: false, fillDiffers: false, radius: 12,
    interactive: false, popup: false, ...over,
  };
}

test('DP-P003: 테두리 카드 안의 테두리 카드는 걸린다', () => {
  const r = patterns({ boxes: [box(), box({ selector: '.inner', ancestor: 0, width: 300, height: 120 })] });
  assert.ok(has(r, 'DP-P003'));
  assert.strictEqual(r.findings.find(f => f.id === 'DP-P003').count, 1);
});

test('DP-P003: 중간에 카드 아닌 박스가 끼어 있어도 조상 카드를 찾는다', () => {
  const r = patterns({ boxes: [
    box(),
    box({ selector: '.wrap', ancestor: 0, edgeSides: 0, radius: 0 }),
    box({ selector: '.inner', ancestor: 1, width: 300, height: 120 }),
  ] });
  assert.ok(has(r, 'DP-P003'));
});

test('DP-P003: 안쪽이 배경색만 다르면(테두리·그림자 없음) 통과한다', () => {
  const r = patterns({ boxes: [box(), box({ ancestor: 0, edgeSides: 0, fillDiffers: true, width: 300, height: 120 })] });
  assert.ok(!has(r, 'DP-P003'));
});

test('DP-P003: 바깥이 페이지 틀(뷰포트 폭 90% 이상)이면 통과한다', () => {
  const r = patterns({ boxes: [box({ width: 1200 }), box({ ancestor: 0, width: 300, height: 120 })] });
  assert.ok(!has(r, 'DP-P003'));
});

test('DP-P003: 인터랙티브·팝업·작은 안쪽 박스·각지고 그림자 없는 박스는 통과한다', () => {
  for (const over of [
    { interactive: true },
    { popup: true },
    { width: 60, height: 30 },
    { radius: 0, shadow: false },
  ]) {
    const r = patterns({ boxes: [box(), box({ ancestor: 0, width: 300, height: 120, ...over })] });
    assert.ok(!has(r, 'DP-P003'), JSON.stringify(over));
  }
});

test('DP-P003: 각진 박스도 그림자가 있으면 카드다', () => {
  const r = patterns({ boxes: [box(), box({ ancestor: 0, width: 300, height: 120, radius: 0, shadow: true, edgeSides: 0 })] });
  assert.ok(has(r, 'DP-P003'));
});

// ============================================
// DP-P004 바운스·탄성 이징
// ============================================

test('isBounceEasing: y 제어점이 1을 넘으면 바운스다', () => {
  assert.strictEqual(K.isBounceEasing('cubic-bezier(0.34, 1.3, 0.64, 1)'), true);
  assert.strictEqual(K.isBounceEasing('cubic-bezier(0.68, -0.55, 0.27, 1.55)'), true);
  assert.strictEqual(K.isBounceEasing('cubic-bezier(0.4, 0, 0.2, 1)'), false);
  assert.strictEqual(K.isBounceEasing('ease-out'), false);
  assert.strictEqual(K.isBounceEasing('ease, cubic-bezier(0.2, 1.4, 0.4, 1)'), true);
});

test('DP-P004: 바운스 이징과 bounce/elastic 애니메이션 이름은 걸린다', () => {
  const a = patterns({ motion: [{ value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', count: 3, sample: '.btn' }] });
  assert.ok(has(a, 'DP-P004'));
  assert.strictEqual(a.findings.find(f => f.id === 'DP-P004').count, 3);
  const b = patterns({ animations: [{ value: 'bounceIn', count: 1, sample: '.toast' }] });
  assert.ok(has(b, 'DP-P004'));
});

test('DP-P004: 표준 이징과 평범한 애니메이션 이름은 통과한다', () => {
  const r = patterns({
    motion: [{ value: 'cubic-bezier(0.4, 0, 0.2, 1)', count: 9, sample: '.a' }, { value: 'ease', count: 2, sample: '.b' }],
    animations: [{ value: 'fadeIn', count: 1, sample: '.c' }, { value: 'none', count: 40, sample: '.d' }],
  });
  assert.ok(!has(r, 'DP-P004'));
});

// ============================================
// 규칙 예외(ruleWaivers) — 계약이 이긴다
// ============================================

function rawContract(extra = {}) {
  return {
    version: 1,
    rootFontSizePx: 16,
    decisions: [{ id: 'DD-009', title: '팔레트' }, { id: 'DD-030', title: '브랜드 그라디언트 헤드라인' }],
    tokens: { color: { decision: 'DD-009', allowed: ['#0F172A', '#FFFFFF'] } },
    ...extra,
  };
}

const goodWaiver = { rule: 'DP-P001', decision: 'DD-030', reason: '브랜드 헤드라인은 그라디언트 텍스트로 결정했다' };

test('parseRuleWaivers: 유효한 예외를 받아들인다', () => {
  const w = C.parseRuleWaivers(rawContract({ ruleWaivers: [goodWaiver] }));
  assert.strictEqual(w.waivers.length, 1);
  assert.strictEqual(w.waivers[0].rule, 'DP-P001');
  assert.strictEqual(w.invalid.length, 0);
});

test('parseRuleWaivers: 잘못된 예외는 사유와 함께 invalid로 분리한다', () => {
  const w = C.parseRuleWaivers(rawContract({ ruleWaivers: [
    { rule: 'DP-X999', decision: 'DD-030', reason: '존재하지 않는 규칙을 면제하려 한다' },
    { rule: 'DP-S002', decision: 'DD-030', reason: '포커스 표시는 면제 대상이 아니다' },
    { rule: 'DP-R005', reason: '결정 ID 없이 면제하려 한다' },
    { rule: 'DP-R005', decision: 'DD-999', reason: '선언되지 않은 결정을 인용한다' },
    { rule: 'DP-R005', decision: 'DD-030', reason: '짧음' },
    goodWaiver,
    { ...goodWaiver },
  ] }));
  assert.strictEqual(w.waivers.length, 1);
  assert.strictEqual(w.invalid.length, 6);
  const reasons = w.invalid.map(i => i.reason);
  for (const key of ['unknown rule', 'not waivable', 'missing decision', 'undeclared decision', 'reason too short', 'duplicate']) {
    assert.ok(reasons.some(r => r.includes(key)), `${key} 사유 누락: ${reasons.join(' | ')}`);
  }
});

test('parseRuleWaivers: 섹션이 없거나 배열이 아니면 빈 결과', () => {
  assert.deepStrictEqual(C.parseRuleWaivers(rawContract()), { waivers: [], invalid: [] });
  const w = C.parseRuleWaivers(rawContract({ ruleWaivers: { rule: 'DP-P001' } }));
  assert.strictEqual(w.waivers.length, 0);
  assert.strictEqual(w.invalid.length, 1);
});

test('parseDesignContract: ruleWaivers를 함께 싣는다', () => {
  const c = C.parseDesignContract(rawContract({ ruleWaivers: [goodWaiver] }));
  assert.strictEqual(c.enabled, true);
  assert.strictEqual(c.ruleWaivers.waivers.length, 1);
});

test('parseDesignContract: tokens가 없어도 ruleWaivers는 읽는다', () => {
  const raw = rawContract({ ruleWaivers: [goodWaiver] });
  delete raw.tokens;
  const c = C.parseDesignContract(raw);
  assert.strictEqual(c.enabled, false);
  assert.strictEqual(c.ruleWaivers.waivers.length, 1);
});

test('hashContract: ruleWaivers를 추가해도 해시가 바뀌지 않는다 (baseline 재동결 없음)', () => {
  const a = C.hashContract(C.parseDesignContract(rawContract()));
  const b = C.hashContract(C.parseDesignContract(rawContract({ ruleWaivers: [goodWaiver] })));
  assert.ok(a);
  assert.strictEqual(a, b);
});

test('applyRuleWaivers: 면제된 규칙은 findings에서 waived로 옮긴다', () => {
  const lint = patterns({ gradientText: [{ selector: 'h1', backgroundImage: 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))' }],
    motion: [{ value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', count: 1, sample: '.btn' }] });
  const waivers = C.parseRuleWaivers(rawContract({ ruleWaivers: [goodWaiver] }));
  const out = C.applyRuleWaivers(lint, waivers);
  assert.ok(!has(out, 'DP-P001'));
  assert.ok(has(out, 'DP-P004'));
  assert.strictEqual(out.waived.length, 1);
  assert.strictEqual(out.waived[0].id, 'DP-P001');
  assert.strictEqual(out.waived[0].decision, 'DD-030');
  const summary = C.summarizeRuleFailures(out);
  assert.ok(!summary.some(f => f.id === 'DP-P001'));
  assert.ok(has(lint, 'DP-P001'), '원본 lint는 변경하지 않는다');
});

test('applyRuleWaivers: 예외가 없거나 lint가 꺼져 있으면 그대로 돌려준다', () => {
  const lint = patterns({});
  assert.deepStrictEqual(C.applyRuleWaivers(lint, null).findings, lint.findings);
  const off = { enabled: false, reason: 'x' };
  assert.strictEqual(C.applyRuleWaivers(off, C.parseRuleWaivers(rawContract({ ruleWaivers: [goodWaiver] }))), off);
});

// ============================================
// craft-floor.md 문서 정합성 (DP-F)
// ============================================

const KNOWLEDGE = path.join(__dirname, '..', 'knowledge');

test('craft-floor.md: DP-F 행 ID는 형식이 맞고 중복이 없으며 failure-rules.md에 네임스페이스가 등록되어 있다', () => {
  const floor = fs.readFileSync(path.join(KNOWLEDGE, 'craft-floor.md'), 'utf-8');
  const rowIds = [...floor.matchAll(/^\|\s*(DP-F\d{3})\s*\|/gm)].map(m => m[1]);
  assert.ok(rowIds.length >= 30, `DP-F 행이 너무 적다: ${rowIds.length}`);
  assert.strictEqual(new Set(rowIds).size, rowIds.length, '중복된 DP-F 행 ID');
  for (const id of rowIds) assert.match(id, /^DP-F[1-3]\d{2}$/, `섹션 번호가 1~3이 아님: ${id}`);
  const registry = fs.readFileSync(path.join(KNOWLEDGE, 'failure-rules.md'), 'utf-8');
  assert.ok(/\|\s*`DP-F###`\s*\|.*craft-floor\.md/.test(registry), 'failure-rules.md 네임스페이스 표에 DP-F가 없다');
});

test('craft-floor.md: 렌더 점검·거부 목록 행은 마지막 열에 기본 심각도를 가진다 (모델이 지어내지 않게)', () => {
  const floor = fs.readFileSync(path.join(KNOWLEDGE, 'craft-floor.md'), 'utf-8');
  const rows = [...floor.matchAll(/^\|\s*(DP-F[12]\d{2})\s*\|(.*)\|\s*$/gm)];
  assert.ok(rows.length >= 20, `행이 너무 적다: ${rows.length}`);
  for (const [, id, rest] of rows) {
    const last = rest.split('|').pop().trim();
    assert.ok(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(last), `${id}: 마지막 열이 심각도가 아님 (${last})`);
    if (id.startsWith('DP-F2')) assert.strictEqual(last, 'LOW', `${id}: 거부 목록은 자동 계측 형제(DP-P)와 같은 LOW여야 한다`);
  }
});

test('craft-floor.md: 인용한 자동 규칙 ID는 모두 RULES에 등록되어 있다', () => {
  const floor = fs.readFileSync(path.join(KNOWLEDGE, 'craft-floor.md'), 'utf-8');
  const cited = new Set([...floor.matchAll(/DP-[TKSRP]\d{3}/g)].map(m => m[0]));
  assert.ok(cited.size > 0);
  for (const id of cited) assert.ok(C.RULES[id], `등록되지 않은 자동 규칙 인용: ${id}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
