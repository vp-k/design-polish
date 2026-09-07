#!/usr/bin/env node
// scoring.test.cjs — capture.cjs 순수 스코어러 단위 테스트 (puppeteer 불필요)
// 실행: node tests/scoring.test.cjs   또는   npm test

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  scoreConsistency,
  scorePerformance,
  calculateDesignHealthScore,
  dedupeErrors,
  classifyRegression,
  classifyStagnation,
  buildHealthScore,
  viewportTag,
  readHealthHistory,
  sanitizeRouteName,
  readPreviousScore,
} = require('../scripts/capture.cjs');

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

// ── scoreConsistency ──
test('consistency: 표본 부족(<10)은 만점을 주지 않고 insufficient=true', () => {
  const r = scoreConsistency({ sampled: 3, fontFamilyCount: 1, borderRadiusCount: 1, colorCount: 2, spacingCount: 2, shadowCount: 0 });
  assert.strictEqual(r.insufficient, true);
  assert.strictEqual(r.score, 7);
});

test('consistency: null 입력도 안전하게 처리', () => {
  const r = scoreConsistency(null);
  assert.strictEqual(r.insufficient, true);
  assert.strictEqual(r.score, 7);
});

test('consistency: 정돈된 시스템은 만점(15)', () => {
  const r = scoreConsistency({ sampled: 200, fontFamilyCount: 2, borderRadiusCount: 3, colorCount: 12, spacingCount: 8, shadowCount: 3 });
  assert.strictEqual(r.insufficient, false);
  assert.strictEqual(r.score, 15);
});

test('consistency: 폰트 난립(8종)은 감점된다', () => {
  const tidy = scoreConsistency({ sampled: 200, fontFamilyCount: 2, borderRadiusCount: 3, colorCount: 12, spacingCount: 8, shadowCount: 3 });
  const messy = scoreConsistency({ sampled: 200, fontFamilyCount: 8, borderRadiusCount: 3, colorCount: 12, spacingCount: 8, shadowCount: 3 });
  assert.ok(messy.score < tidy.score, `messy(${messy.score}) < tidy(${tidy.score})`);
  // (8-3)*1.5 = 7.5 감점 → 15-7.5 = 7.5
  assert.strictEqual(messy.score, 7.5);
});

test('consistency: 극단적 난립은 0으로 클램프', () => {
  const r = scoreConsistency({ sampled: 500, fontFamilyCount: 40, borderRadiusCount: 40, colorCount: 300, spacingCount: 80, shadowCount: 40 });
  assert.strictEqual(r.score, 0);
});

// ── scorePerformance ──
test('perf: null 입력은 insufficient=true, 만점 아님', () => {
  const r = scorePerformance(null);
  assert.strictEqual(r.insufficient, true);
  assert.strictEqual(r.score, 7);
});

test('perf: 빠른 페이지는 만점(15)', () => {
  const r = scorePerformance({ fcp: 900, requestCount: 20, transferBytes: 500 * 1024 });
  assert.strictEqual(r.score, 15);
});

test('perf: FCP 측정 실패(null)는 감점', () => {
  const r = scorePerformance({ fcp: null, requestCount: 20, transferBytes: 0 });
  assert.strictEqual(r.score, 10); // -5
});

test('perf: 느린 FCP(4000ms)는 감점', () => {
  const fast = scorePerformance({ fcp: 900, requestCount: 10, transferBytes: 0 });
  const slow = scorePerformance({ fcp: 4000, requestCount: 10, transferBytes: 0 });
  assert.ok(slow.score < fast.score);
});

test('perf: 과도한 요청/전송량 감점, 하한 0', () => {
  const r = scorePerformance({ fcp: 8000, requestCount: 300, transferBytes: 20 * 1024 * 1024 });
  assert.ok(r.score >= 0 && r.score < 5);
});

// ── calculateDesignHealthScore ──
test('health: WCAG 미수행 시 wcag 항목 0 (만점 방지)', () => {
  const r = calculateDesignHealthScore(null, [], [], 15, 15);
  assert.strictEqual(r.breakdown.wcagCritical, 0);
  assert.strictEqual(r.breakdown.wcagSerious, 0);
  assert.strictEqual(r.score, 50); // 0+0+20+15+15
});

test('health: styleScore/perfScore 미제공 시 0 처리(고정 상수 제거 확인)', () => {
  const wcag = { violations: [] };
  const r = calculateDesignHealthScore(wcag, [], [], undefined, undefined);
  assert.strictEqual(r.breakdown.styleFit, 0);
  assert.strictEqual(r.breakdown.performance, 0);
});

test('health: 완벽한 입력은 100', () => {
  const wcag = { violations: [] };
  const r = calculateDesignHealthScore(wcag, [], [], 15, 15);
  assert.strictEqual(r.score, 100);
});

test('health: critical 위반과 콘솔 에러 감점 반영', () => {
  const wcag = { violations: [{ impact: 'critical' }, { impact: 'serious' }] };
  const r = calculateDesignHealthScore(wcag, [{ type: 'error' }], [], 15, 15);
  // wcagCritical 30-10=20, wcagSerious 20-5=15, console 20-5=15, style15, perf15 = 80
  assert.strictEqual(r.score, 80);
});

test('health: score는 0~100로 클램프', () => {
  const wcag = { violations: Array(10).fill({ impact: 'critical' }) };
  const r = calculateDesignHealthScore(wcag, Array(10).fill({ type: 'error' }), [], 0, 0);
  assert.ok(r.score >= 0 && r.score <= 100);
});

test('health: NaN styleScore/perfScore는 0으로 처리(L1 — NaN 전파 차단)', () => {
  const wcag = { violations: [] };
  const r = calculateDesignHealthScore(wcag, [], [], NaN, NaN);
  assert.strictEqual(r.breakdown.styleFit, 0);
  assert.strictEqual(r.breakdown.performance, 0);
  assert.ok(Number.isFinite(r.score));
});

// ── dedupeErrors (H1 — 다중 네비게이션 누적 중복 카운트 방지) ──
test('dedupeErrors: 동일 (type,text)는 1건으로 압축(타임스탬프 무관)', () => {
  const errs = [
    { type: 'error', text: 'boom', timestamp: 't1' },
    { type: 'error', text: 'boom', timestamp: 't2' }, // 모바일 재방문 중복
    { type: 'error', text: 'other', timestamp: 't3' },
    { type: 'warning', text: 'boom', timestamp: 't4' }, // type 다름 → 별개
  ];
  const out = dedupeErrors(errs, (e) => `${e.type} ${e.text}`);
  assert.strictEqual(out.length, 3);
});

test('dedupeErrors: 중복 압축이 consoleErrors 점수 왜곡을 막는다', () => {
  const wcag = { violations: [] };
  // 지속적 에러 1건이 desktop+mobile 2회 로드로 2번 기록된 상황
  const raw = [
    { type: 'error', text: 'failed fetch', timestamp: 't1' },
    { type: 'error', text: 'failed fetch', timestamp: 't2' },
  ];
  const deduped = dedupeErrors(raw, (e) => `${e.type} ${e.text}`);
  const naive = calculateDesignHealthScore(wcag, raw, [], 15, 15);
  const fixed = calculateDesignHealthScore(wcag, deduped, [], 15, 15);
  // 중복 카운트: consoleErrors 20-2*5=10 / 압축 후: 20-1*5=15
  assert.strictEqual(naive.breakdown.consoleErrors, 10);
  assert.strictEqual(fixed.breakdown.consoleErrors, 15);
});

test('dedupeErrors: null/빈 입력 안전', () => {
  assert.deepStrictEqual(dedupeErrors(null, (e) => e), []);
  assert.deepStrictEqual(dedupeErrors([], (e) => e), []);
});

// ── readPreviousScore (baseline 선택 — H1/M1 회귀 방지) ──
function withHistory(lines, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-hist-'));
  const dir = path.join(tmp, '.design-polish');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'health-history.jsonl'), lines.join('\n') + '\n');
  const cwd = process.cwd();
  process.chdir(tmp);
  try { fn(); }
  finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('readPreviousScore: 동일 mode+route 라인만 baseline으로 선택', () => {
  withHistory([
    JSON.stringify({ score: 80, mode: 'full', route: '/' }),
    JSON.stringify({ score: 40, mode: 'no-wcag', route: '/' }),
    JSON.stringify({ score: 75, mode: 'full', route: '/pricing' }),
  ], () => {
    assert.strictEqual(readPreviousScore('full', '/'), 80);
    assert.strictEqual(readPreviousScore('no-wcag', '/'), 40);
    assert.strictEqual(readPreviousScore('full', '/pricing'), 75);
    // 동종 라인 없음 → null (크로스 모드/라우트 오판 방지)
    assert.strictEqual(readPreviousScore('full', '/nonexistent'), null);
    assert.strictEqual(readPreviousScore('no-wcag', '/pricing'), null);
  });
});

test('readPreviousScore: 손상된 마지막 줄은 건너뛰고 이전 유효 줄 채택', () => {
  withHistory([
    JSON.stringify({ score: 60, mode: 'full', route: '/' }),
    '{ broken json not parseable',
  ], () => {
    assert.strictEqual(readPreviousScore('full', '/'), 60);
  });
});

test('readPreviousScore: styleMode가 다르면 baseline으로 쓰지 않는다 (계약 도입 시 거짓 회귀 차단)', () => {
  withHistory([
    JSON.stringify({ score: 90, mode: 'full', route: '/', styleMode: 'heuristic' }),
    JSON.stringify({ score: 70, mode: 'full', route: '/', styleMode: 'contract' }),
  ], () => {
    assert.strictEqual(readPreviousScore('full', '/', 'contract'), 70);
    assert.strictEqual(readPreviousScore('full', '/', 'heuristic'), 90);
  });
});

test('readPreviousScore: styleMode 없는 구 이력은 heuristic으로 간주(하위호환)', () => {
  withHistory([
    JSON.stringify({ score: 88, mode: 'full', route: '/' }),   // v2.4 이하 라인
  ], () => {
    assert.strictEqual(readPreviousScore('full', '/', 'heuristic'), 88);
    // 계약 도입 첫 회차는 비교 대상이 없다 → null (거짓 regression 방지)
    assert.strictEqual(readPreviousScore('full', '/', 'contract'), null);
    // styleMode 미지정 호출은 기존 동작 유지
    assert.strictEqual(readPreviousScore('full', '/'), 88);
  });
});

test('readPreviousScore: 이력 없으면 null', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-empty-'));
  const cwd = process.cwd();
  process.chdir(tmp);
  try { assert.strictEqual(readPreviousScore('full', '/'), null); }
  finally { process.chdir(cwd); fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ── classifyRegression (M1 — dead-band으로 지터성 오판 방지) ──
test('classifyRegression: ±3 이내는 unchanged로 흡수', () => {
  assert.strictEqual(classifyRegression(0), 'unchanged');
  assert.strictEqual(classifyRegression(-2), 'unchanged'); // 지터성 미세 하락
  assert.strictEqual(classifyRegression(3), 'unchanged');
  assert.strictEqual(classifyRegression(-3), 'unchanged');
});

test('classifyRegression: 밴드 초과만 improved/regression', () => {
  assert.strictEqual(classifyRegression(4), 'improved');
  assert.strictEqual(classifyRegression(-4), 'regression');
  assert.strictEqual(classifyRegression(20), 'improved');
});

test('classifyRegression: NaN/비유한(Infinity)은 안전하게 unchanged', () => {
  assert.strictEqual(classifyRegression(NaN), 'unchanged');
  assert.strictEqual(classifyRegression(Infinity), 'unchanged'); // Number.isFinite=false → 판정 보류
});

// ── sanitizeRouteName ──
test('sanitize: 루트는 main, 특수문자는 치환', () => {
  assert.strictEqual(sanitizeRouteName('/'), 'main');
  assert.strictEqual(sanitizeRouteName('/about'), 'about');
  assert.strictEqual(sanitizeRouteName('/blog/../etc'), 'blog----etc');
});

// == viewportTag / readHealthHistory (M11: 뷰포트 집합이 다른 회차를 baseline으로 잡지 않는다) ==
test('viewportTag: 이름 집합을 정렬·중복 제거해 하나의 문자열로 만든다', () => {
  assert.strictEqual(viewportTag([{ name: 'mobile' }, { name: 'desktop' }]), 'desktop,mobile');
  assert.strictEqual(viewportTag([{ name: 'desktop' }, { name: 'mobile' }]), 'desktop,mobile');
  assert.strictEqual(viewportTag(['desktop']), 'desktop');
  assert.strictEqual(viewportTag([]), null);
  assert.strictEqual(viewportTag(null), null);
});

test('readHealthHistory: 뷰포트 집합이 다른 회차는 baseline에서 제외', () => {
  withHistory([
    JSON.stringify({ score: 90, mode: 'full', route: '/', styleMode: 'contract', viewports: 'desktop' }),
    JSON.stringify({ score: 60, mode: 'full', route: '/', styleMode: 'contract', viewports: 'desktop,mobile' }),
  ], () => {
    const rows = readHealthHistory({ mode: 'full', route: '/', styleMode: 'contract', viewports: 'desktop' }, 3);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].score, 90);
  });
});

test('readHealthHistory: viewports가 없는 구(舊) 라인은 하위호환으로 살린다', () => {
  withHistory([
    JSON.stringify({ score: 71, mode: 'full', route: '/', styleMode: 'contract' }),
  ], () => {
    const rows = readHealthHistory({ mode: 'full', route: '/', styleMode: 'contract', viewports: 'desktop,mobile' }, 3);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].score, 71);
  });
});

test('readHealthHistory: 최신순으로 최대 limit개만 반환하고 손상 라인은 건너뛴다', () => {
  withHistory([
    JSON.stringify({ score: 50, mode: 'full', route: '/' }),
    '{ broken line',
    JSON.stringify({ score: 60, mode: 'full', route: '/' }),
    JSON.stringify({ score: 70, mode: 'full', route: '/' }),
  ], () => {
    const rows = readHealthHistory({ mode: 'full', route: '/' }, 2);
    assert.deepStrictEqual(rows.map(r => r.score), [70, 60]);
  });
});

// == classifyStagnation (M1: 정체 판정은 스크립트가 한다) ==
test('classifyStagnation: 3회 미만이면 insufficient (모델이 추측하지 않게)', () => {
  const r = classifyStagnation([70, 71]);
  assert.strictEqual(r.status, 'insufficient');
  assert.strictEqual(r.runs, 2);
  assert.strictEqual(r.required, 3);
  assert.strictEqual(r.delta, null);
});

test('classifyStagnation: dead-band(3점) 안에서 맴돌면 stagnant', () => {
  const r = classifyStagnation([72, 70, 71]);
  assert.strictEqual(r.status, 'stagnant');
  assert.strictEqual(r.spread, 2);
  assert.strictEqual(r.delta, 1);
});

test('classifyStagnation: 밴드를 벗어나 움직이면 none', () => {
  assert.strictEqual(classifyStagnation([85, 70, 68]).status, 'none');
  assert.strictEqual(classifyStagnation([60, 70, 75]).status, 'none');
});

test('classifyStagnation: 최신 3회만 보고 그 이전 회차는 무시', () => {
  const r = classifyStagnation([70, 71, 72, 10, 5]);
  assert.strictEqual(r.status, 'stagnant');
  assert.deepStrictEqual(r.scores, [70, 71, 72]);
});

test('classifyStagnation: 비수치(NaN/null)는 걸러낸다', () => {
  const r = classifyStagnation([70, null, NaN, 71]);
  assert.strictEqual(r.status, 'insufficient');
  assert.strictEqual(r.runs, 2);
});

// == buildHealthScore (M9: 게이트가 읽는 필드 계약을 고정한다) ==
// auto-complete-loop/scripts/gates/design.sh가 읽는 필드 이름·의미가 바뀌면 조용히
// 게이트가 무력화된다. 이 테스트가 그 계약의 유일한 자동 감시자다.
const HS = { score: 74, breakdown: { wcagCritical: 30, wcagSerious: 20, consoleErrors: 20, styleFit: 12, performance: 12 } };

test('buildHealthScore: design.sh가 읽는 필드가 모두 존재하고 타입이 맞다', () => {
  const r = buildHealthScore(
    HS,
    { tokenDrift: { enabled: true, totalViolations: 9, newViolationCount: 2 }, ruleFailures: [] },
    { mode: 'full', route: '/', styleMode: 'contract', viewports: 'desktop,mobile' },
    { previousScore: 80, recentScores: [80, 79], timestamp: 'T' }
  );
  assert.strictEqual(typeof r.score, 'number');
  assert.strictEqual(r.styleMode, 'contract');
  assert.strictEqual(typeof r.regression.diff, 'number');
  assert.strictEqual(r.regression.diff, -6);
  assert.strictEqual(r.regression.status, 'regression');
  assert.strictEqual(r.tokenDrift.enabled, true);
  assert.strictEqual(r.tokenDrift.totalViolations, 9);
  assert.strictEqual(r.tokenDrift.newViolationCount, 2);
});

test('buildHealthScore: baseline 없으면 regression은 null (게이트가 skip 판정)', () => {
  const r = buildHealthScore(HS, {}, { mode: 'full', route: '/' }, { previousScore: null, timestamp: 'T' });
  assert.strictEqual(r.regression, null);
  assert.strictEqual(r.styleMode, 'heuristic');
});

test('buildHealthScore: dead-band 안의 하락은 unchanged로 흡수', () => {
  const r = buildHealthScore(HS, {}, {}, { previousScore: 76, timestamp: 'T' });
  assert.strictEqual(r.regression.diff, -2);
  assert.strictEqual(r.regression.status, 'unchanged');
  assert.strictEqual(r.regression.tolerance, 3);
});

test('buildHealthScore: stagnation/ruleFailureSummary/baseline을 스크립트가 계산해 싣는다', () => {
  const r = buildHealthScore(
    HS,
    { ruleFailures: [
      { rule: 'DP-T004', severity: 'CRITICAL', count: 3 },
      { rule: 'DP-T001', severity: 'MEDIUM', count: 5 },
    ] },
    { mode: 'full', route: '/' },
    { previousScore: 74, recentScores: [74, 73], baseline: { status: 'reused' }, timestamp: 'T' }
  );
  assert.strictEqual(r.stagnation.status, 'stagnant');
  assert.strictEqual(r.stagnation.runs, 3);
  assert.strictEqual(r.ruleFailureSummary.blockingRules, 1);
  assert.strictEqual(r.ruleFailureSummary.blockingViolations, 3);
  assert.strictEqual(r.ruleFailureSummary.totalViolations, 8);
  assert.strictEqual(r.baseline.status, 'reused');
});

test('buildHealthScore: 순수 함수 - 같은 입력이면 같은 출력(시계 주입)', () => {
  const args = [HS, {}, { mode: 'full' }, { previousScore: 70, timestamp: 'T' }];
  assert.deepStrictEqual(buildHealthScore(...args), buildHealthScore(...args));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
