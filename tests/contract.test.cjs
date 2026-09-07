#!/usr/bin/env node
// contract.test.cjs — design-contract.cjs 순수 린트 단위 테스트 (puppeteer 불필요)
// 실행: node tests/contract.test.cjs   또는   npm test
//
// 원칙: 계측(page.evaluate)은 브라우저, 판정(lint*)은 순수 함수 → 여기서 결정론적으로 검증한다.

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const C = require('../scripts/design-contract.cjs');
const { scoreConsistency } = require('../scripts/capture.cjs');

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

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dp-contract-'));
}

// 계측값 헬퍼 — collectStyleMetrics의 values 필드 형태
const v = (value, count = 1, sample = '.x') => ({ value, count, sample });

// ── 정규화 ──
test('normalizeColorValue: hex/rgb/rgba가 하나의 표기로 수렴', () => {
  assert.strictEqual(C.normalizeColorValue('#FFF'), '255,255,255');
  assert.strictEqual(C.normalizeColorValue('#ffffff'), '255,255,255');
  assert.strictEqual(C.normalizeColorValue('rgb(255, 255, 255)'), '255,255,255');
  assert.strictEqual(C.normalizeColorValue('rgba(255,255,255,1)'), '255,255,255');
});

test('normalizeColorValue: 알파가 있는 값은 알파까지 구분', () => {
  const a = C.normalizeColorValue('rgba(15, 23, 42, 0.5)');
  assert.strictEqual(a, '15,23,42,0.5');
  assert.notStrictEqual(a, C.normalizeColorValue('rgb(15,23,42)'));
});

test('normalizeLengthValue: rem/em은 rootPx 기준 px로 환산', () => {
  assert.strictEqual(C.normalizeLengthValue('1rem'), '16px');
  assert.strictEqual(C.normalizeLengthValue('0.5rem'), '8px');
  assert.strictEqual(C.normalizeLengthValue('1rem', 10), '10px');
  assert.strictEqual(C.normalizeLengthValue('12px'), '12px');
});

test('normalizeLengthValue: %는 px로 바꿀 수 없으므로 그대로 보존', () => {
  assert.strictEqual(C.normalizeLengthValue('50%'), '50%');
});

test('normalizeFontValue: 첫 패밀리만, 따옴표/대소문자 무시', () => {
  assert.strictEqual(C.normalizeFontValue('"Pretendard Variable", Pretendard, sans-serif'), 'pretendard variable');
  assert.strictEqual(C.normalizeFontValue('Inter'), 'inter');
});

// ── 계약 파싱 ──
test('parseDesignContract: tokens 섹션이 없으면 비활성', () => {
  assert.strictEqual(C.parseDesignContract({ version: 1 }).enabled, false);
  assert.strictEqual(C.parseDesignContract(null).enabled, false);
});

test('parseDesignContract: allowed 배열 축약형과 {decision, allowed} 완전형 모두 수용', () => {
  const p = C.parseDesignContract({
    version: 1,
    decisions: [{ id: 'DD-001' }, { id: 'DD-014' }],
    tokens: {
      borderRadius: ['8px', '1rem'],
      color: { decision: 'DD-009', allowed: ['#FFFFFF'] },
    },
  });
  assert.strictEqual(p.enabled, true);
  assert.strictEqual(p.decisionCount, 2);
  assert.strictEqual(p.tokens.borderRadius.decision, null);
  assert.strictEqual(p.tokens.color.decision, 'DD-009');
  // 1rem은 16px로 정규화되어 저장 → 계측값 '16px'과 매칭된다
  assert.ok(p.tokens.borderRadius.allowed.has('16px'));
});

test('parseDesignContract: 사용 가능한 카테고리가 하나도 없으면 비활성', () => {
  assert.strictEqual(C.parseDesignContract({ tokens: { color: [] } }).enabled, false);
});

// ── 토큰 드리프트 ──
const CONTRACT = C.parseDesignContract({
  version: 1,
  tokens: {
    borderRadius: { decision: 'DD-014', allowed: ['8px', '12px'] },
    color: { decision: 'DD-009', allowed: ['#FFFFFF', '#0F172A'] },
  },
});

test('lintTokenDrift: 계약이 없으면 비활성 (기존 heuristic 경로 유지)', () => {
  const r = C.lintTokenDrift({ borderRadius: [v('3px')] }, { enabled: false }, null);
  assert.strictEqual(r.enabled, false);
});

test('lintTokenDrift: 계약 안의 값은 위반이 아니다 (표기 달라도 동일 판정)', () => {
  const r = C.lintTokenDrift({
    borderRadius: [v('8px', 40), v('0.75rem', 10)],   // 0.75rem = 12px
    color: [v('rgb(255,255,255)', 50)],
  }, CONTRACT, null);
  assert.strictEqual(r.enabled, true);
  assert.strictEqual(r.totalViolations, 0);
});

test('lintTokenDrift: 계약 밖 값은 위반으로 잡히고 decision ID가 귀속된다', () => {
  const r = C.lintTokenDrift({ borderRadius: [v('3px', 5, '.card')] }, CONTRACT, null);
  assert.strictEqual(r.totalViolations, 1);
  assert.strictEqual(r.categories.borderRadius.rule, 'DP-T001');
  assert.strictEqual(r.categories.borderRadius.decision, 'DD-014');
  assert.strictEqual(r.findings[0].samples[0].selector, '.card');
});

test('ratchet: baseline이 없는 최초 실행은 신규 위반 0 (브라운필드 교착 방지)', () => {
  const r = C.lintTokenDrift({ borderRadius: [v('3px'), v('5px')] }, CONTRACT, null);
  assert.strictEqual(r.hasBaseline, false);
  assert.strictEqual(r.totalViolations, 2);
  assert.strictEqual(r.newViolationCount, 0);
});

test('ratchet: baseline에 있는 기존 위반은 신규로 세지 않는다', () => {
  const baseline = { values: { borderRadius: new Set(['3px', '5px']) } };
  const r = C.lintTokenDrift({ borderRadius: [v('3px'), v('5px')] }, CONTRACT, baseline);
  assert.strictEqual(r.hasBaseline, true);
  assert.strictEqual(r.totalViolations, 2);
  assert.strictEqual(r.newViolationCount, 0);
});

test('ratchet: baseline 이후 새로 생긴 위반만 신규로 집계 + CRITICAL 승격', () => {
  const baseline = { values: { borderRadius: new Set(['3px']) } };
  const r = C.lintTokenDrift({ borderRadius: [v('3px'), v('7px', 2, '.new')] }, CONTRACT, baseline);
  assert.strictEqual(r.totalViolations, 2);
  assert.strictEqual(r.newViolationCount, 1);
  assert.strictEqual(r.categories.borderRadius.newViolations[0].value, '7px');
  // 신규 위반이 있으면 finding severity가 CRITICAL로 승격되어 리포트 최상단에 온다
  assert.strictEqual(r.findings[0].severity, 'CRITICAL');
});

test('baseline 파일 왕복: write → read로 동일 집합이 복원된다', () => {
  const dir = tmpdir();
  try {
    const drift = C.lintTokenDrift({ borderRadius: [v('3px'), v('7px')] }, CONTRACT, null);
    const fp = C.writeTokenBaseline(drift, dir);
    assert.ok(fs.existsSync(fp));
    const b = C.readTokenBaseline(dir);
    assert.ok(b.values.borderRadius.has('3px'));
    assert.ok(b.values.borderRadius.has('7px'));
    // 복원한 baseline으로 다시 린트하면 신규 위반 0
    const again = C.lintTokenDrift({ borderRadius: [v('3px'), v('7px')] }, CONTRACT, b);
    assert.strictEqual(again.newViolationCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ratchet: 위반이 30건을 넘어도 baseline이 전부 동결한다 (브라운필드 데드락 방지)', () => {
  const dir = tmpdir();
  try {
    // 리포트용 violations는 30건으로 잘리지만 baseline은 전체를 담아야 한다.
    const many = Array.from({ length: 45 }, (_, i) => v(`${i + 1}.5px`));
    const first = C.lintTokenDrift({ borderRadius: many }, CONTRACT, null);
    assert.strictEqual(first.totalViolations, 45);
    assert.strictEqual(first.categories.borderRadius.violations.length, 30); // 리포트는 절삭
    C.writeTokenBaseline(first, dir);
    const b = C.readTokenBaseline(dir);
    assert.strictEqual(b.values.borderRadius.size, 45);
    // 두 번째 실행: 코드가 하나도 안 바뀌었으면 신규 위반은 0이어야 한다
    const second = C.lintTokenDrift({ borderRadius: many }, CONTRACT, b);
    assert.strictEqual(second.newViolationCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('capped: 수집 상한에 걸린 범주는 신규 판정을 포기한다 (fail-open)', () => {
  const baseline = { values: { borderRadius: new Set(['3px']) } };
  const measured = { borderRadius: [v('3px'), v('7px')] };
  // 상한 미도달이면 평소대로 신규 1건
  assert.strictEqual(C.lintTokenDrift(measured, CONTRACT, baseline).newViolationCount, 1);
  // 상한 도달이면 baseline 목록 자체가 불완전할 수 있으므로 신규 0 (거짓 차단 방지)
  const capped = C.lintTokenDrift(measured, CONTRACT, baseline, { borderRadius: true });
  assert.strictEqual(capped.newViolationCount, 0);
  assert.strictEqual(capped.totalViolations, 2); // 총량은 그대로 보고한다
  assert.deepStrictEqual(capped.capped, ['borderRadius']);
});

test('readTokenBaseline: 파일 없음/손상은 null (계약 첫 실행과 동일 취급)', () => {
  const dir = tmpdir();
  try {
    assert.strictEqual(C.readTokenBaseline(dir), null);
    fs.mkdirSync(path.join(dir, '.design-polish'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.design-polish', 'token-baseline.json'), '{ broken');
    assert.strictEqual(C.readTokenBaseline(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── contract 모드 scoreConsistency ──
test('scoreConsistency: drift 미제공 시 기존 heuristic 산식 유지(하위호환)', () => {
  const r = scoreConsistency({ sampled: 200, fontFamilyCount: 2, borderRadiusCount: 3, colorCount: 12, spacingCount: 8, shadowCount: 3 });
  assert.strictEqual(r.mode, 'heuristic');
  assert.strictEqual(r.score, 15);
});

test('scoreConsistency: 계약 준수(위반 0)는 contract 모드 만점', () => {
  const drift = C.lintTokenDrift({ borderRadius: [v('8px', 30)] }, CONTRACT, null);
  const r = scoreConsistency({ sampled: 200, fontFamilyCount: 9, borderRadiusCount: 9 }, drift);
  assert.strictEqual(r.mode, 'contract');
  // 휴리스틱이라면 폰트 9종으로 감점됐겠지만, 계약이 있으면 계약만이 기준이다
  assert.strictEqual(r.score, 15);
});

test('scoreConsistency: 신규 위반은 -2, baseline 잔여는 -0.1로 차등 처벌', () => {
  const baseline = { values: { borderRadius: new Set(['3px', '5px', '7px']) } };
  const drift = C.lintTokenDrift({
    borderRadius: [v('3px'), v('5px'), v('7px'), v('9px')],  // 기존 3 + 신규 1
  }, CONTRACT, baseline);
  const r = scoreConsistency({ sampled: 200 }, drift);
  // 신규 1건 × 2 + 기존 3건 × 0.1 = 2.3 감점
  assert.strictEqual(r.score, 12.7);
  assert.strictEqual(r.detail.borderRadius.newViolations, 1);
});

test('scoreConsistency: 신규 위반 감점은 -12에서 멈춘다 (상한 분리)', () => {
  const baseline = { values: { borderRadius: new Set() } };
  const many = Array.from({ length: 20 }, (_, i) => v(`${i + 100}px`));
  const drift = C.lintTokenDrift({ borderRadius: many }, CONTRACT, baseline);
  const r = scoreConsistency({ sampled: 200 }, drift);
  // 신규 20건 × 2 = 40이지만 신규 상한 12로 잘린다 → 15 - 12 = 3
  assert.strictEqual(r.score, 3);
  assert.strictEqual(r.penalty.newCapped, true);
  assert.strictEqual(r.penalty.newPenalty, 12);
});

test('scoreConsistency: 기존 부채만 많으면 잔여 상한(-3)만 적용된다', () => {
  // 브라운필드 래칫의 핵심 — 신규 0건인데 기존 부채 150건으로 styleFit이 0이 되면
  // "고칠 것을 안 만들었는데도 점수가 바닥"이라 래칫이 무의미해진다.
  const values = Array.from({ length: 150 }, (_, i) => `${i + 100}px`);
  const drift = C.lintTokenDrift(
    { borderRadius: values.map(x => v(x)) },
    CONTRACT,
    { values: { borderRadius: new Set(values) } }   // 전부 baseline에 동결됨
  );
  assert.strictEqual(drift.newViolationCount, 0);
  const r = scoreConsistency({ sampled: 200 }, drift);
  assert.strictEqual(r.penalty.newPenalty, 0);
  assert.strictEqual(r.penalty.baselinePenalty, 3);   // 150 × 0.1 = 15 → 상한 3
  assert.strictEqual(r.penalty.baselineCapped, true);
  assert.strictEqual(r.score, 12);
});

test('scoreConsistency: 신규 + 잔여 상한을 동시에 쳐도 0 아래로 내려가지 않는다', () => {
  const base = Array.from({ length: 100 }, (_, i) => `${i + 500}px`);
  const fresh = Array.from({ length: 30 }, (_, i) => `${i + 900}px`);
  const drift = C.lintTokenDrift(
    { borderRadius: [...base, ...fresh].map(x => v(x)) },
    CONTRACT,
    { values: { borderRadius: new Set(base) } }
  );
  const r = scoreConsistency({ sampled: 200 }, drift);
  assert.strictEqual(r.score, 0);   // 12 + 3 = 15 감점
  assert.ok(r.score >= 0);
});

test('scoreConsistency: 표본 부족은 계약 유무와 무관하게 insufficient', () => {
  const drift = C.lintTokenDrift({ borderRadius: [v('3px')] }, CONTRACT, null);
  const r = scoreConsistency({ sampled: 4 }, drift);
  assert.strictEqual(r.insufficient, true);
  assert.strictEqual(r.mode, 'insufficient');
});

// ── 한국어 타이포그래피 ──
test('isSerifFallbackStack: Inter, serif는 한글이 명조로 떨어지는 스택', () => {
  assert.strictEqual(C.isSerifFallbackStack('Inter, serif'), true);
});

test('isSerifFallbackStack: sans-serif는 serif가 아니다 (오탐 방지)', () => {
  assert.strictEqual(C.isSerifFallbackStack('Inter, sans-serif'), false);
});

test('isSerifFallbackStack: 한국어 폰트가 스택에 있으면 serif로 떨어지지 않는다', () => {
  assert.strictEqual(C.isSerifFallbackStack('Inter, Pretendard, serif'), false);
  assert.strictEqual(C.isSerifFallbackStack('"Noto Sans KR", serif'), false);
});

test('isSerifFallbackStack: Latin 전용 serif 패밀리만 지정도 동일 결과', () => {
  assert.strictEqual(C.isSerifFallbackStack('Georgia, "Times New Roman"'), true);
});

test('lintKoreanTypography: 계측 없으면 비활성', () => {
  assert.strictEqual(C.lintKoreanTypography(null).enabled, false);
});

test('DP-K001: 한글 요소의 serif fallback을 잡는다', () => {
  const r = C.lintKoreanTypography({
    scanned: 2,
    samples: [
      { selector: '.a', fontFamily: 'Inter, serif', chars: 10, wordBreak: 'keep-all', block: true },
      { selector: '.b', fontFamily: 'Pretendard, sans-serif', chars: 10, wordBreak: 'keep-all', block: true },
    ],
  });
  const f = r.findings.find(x => x.id === 'DP-K001');
  assert.strictEqual(f.count, 1);
  assert.strictEqual(f.samples[0].selector, '.a');
});

test('DP-K002: 긴 한글 문단(30자+)의 keep-all 미설정만 잡는다', () => {
  const r = C.lintKoreanTypography({
    samples: [
      { selector: '.long', fontFamily: 'Pretendard', chars: 80, wordBreak: 'normal', overflowWrap: 'normal', block: true },
      { selector: '.short', fontFamily: 'Pretendard', chars: 5, wordBreak: 'normal', overflowWrap: 'normal', block: true },   // 짧음 → 제외
      { selector: '.inline', fontFamily: 'Pretendard', chars: 80, wordBreak: 'normal', overflowWrap: 'normal', block: false }, // 인라인 → 제외
      { selector: '.ok', fontFamily: 'Pretendard', chars: 80, wordBreak: 'keep-all', overflowWrap: 'normal', block: true },
      { selector: '.wrap', fontFamily: 'Pretendard', chars: 80, wordBreak: 'normal', overflowWrap: 'break-word', block: true }, // 대안 허용
    ],
  });
  const f = r.findings.find(x => x.id === 'DP-K002');
  assert.strictEqual(f.count, 1);
  assert.strictEqual(f.samples[0].selector, '.long');
});

test('DP-K003: 자간 -2% 이하만 잡는다 (경계 포함)', () => {
  const r = C.lintKoreanTypography({
    samples: [
      { selector: '.tight', fontFamily: 'Pretendard', chars: 10, letterSpacing: -0.32, fontSize: 16, block: false }, // -2%
      { selector: '.mild', fontFamily: 'Pretendard', chars: 10, letterSpacing: -0.16, fontSize: 16, block: false },  // -1%
      { selector: '.none', fontFamily: 'Pretendard', chars: 10, letterSpacing: 0, fontSize: 16, block: false },
    ],
  });
  const f = r.findings.find(x => x.id === 'DP-K003');
  assert.strictEqual(f.count, 1);
  assert.strictEqual(f.samples[0].selector, '.tight');
});

test('lintKoreanTypography: 한글 요소가 없으면 findings 없이 통과', () => {
  const r = C.lintKoreanTypography({ scanned: 0, samples: [] });
  assert.strictEqual(r.enabled, true);
  assert.strictEqual(r.findings.length, 0);
});

// ── 컴포넌트 상태 계약 ──
test('lintStateContract: 계측 없으면 비활성', () => {
  assert.strictEqual(C.lintStateContract(null).enabled, false);
});

test('DP-S001: disabled가 opacity만으로 표현되면(커서 미변경) 잡는다', () => {
  const r = C.lintStateContract({
    disabled: [
      { selector: 'button.a', cursor: 'pointer', opacity: '0.5' },
      { selector: 'button.b', cursor: 'not-allowed', opacity: '0.5' },
    ],
  });
  const f = r.findings.find(x => x.id === 'DP-S001');
  assert.strictEqual(f.count, 1);
  assert.strictEqual(f.samples[0].selector, 'button.a');
});

test('DP-S002: 실제 키보드 포커스로 잰 변화 없음은 CRITICAL로 최상단', () => {
  const r = C.lintStateContract({
    focusMethod: 'keyboard-tab',
    focusable: [
      { selector: 'a.x', focusChanged: false },
      { selector: 'a.y', focusChanged: true },
      { selector: 'a.z', focusChanged: null },   // 측정 실패 → 판정 보류(fail-open 아님, 미집계)
    ],
  });
  assert.strictEqual(r.findings[0].id, 'DP-S002');
  assert.strictEqual(r.findings[0].severity, 'CRITICAL');
  assert.strictEqual(r.findings[0].count, 1);
});

test('DP-S003: 커스텀 클릭 요소의 cursor: pointer 누락을 잡는다', () => {
  const r = C.lintStateContract({
    clickable: [
      { selector: 'div[role=button].a', tag: 'div', cursor: 'default' },
      { selector: 'div[role=button].b', tag: 'div', cursor: 'pointer' },
    ],
  });
  const f = r.findings.find(x => x.id === 'DP-S003');
  assert.strictEqual(f.count, 1);
});

test('lintStateContract: 위반 없으면 findings 비어 있음', () => {
  const r = C.lintStateContract({ disabled: [], focusable: [], clickable: [] });
  assert.strictEqual(r.enabled, true);
  assert.strictEqual(r.findings.length, 0);
});

// ── 집계 ──
test('summarizeRuleFailures: 심각도 순 정렬 + 비활성 린트는 무시', () => {
  const korean = C.lintKoreanTypography({
    samples: [
      { selector: '.a', fontFamily: 'Inter, serif', chars: 80, wordBreak: 'normal', overflowWrap: 'normal', block: true },
    ],
  });
  const state = C.lintStateContract({
    focusMethod: 'keyboard-tab',
    focusable: [{ selector: 'a.x', focusChanged: false }],
  });
  const out = C.summarizeRuleFailures({ enabled: false }, korean, state, null);
  assert.strictEqual(out[0].id, 'DP-S002');        // CRITICAL
  assert.strictEqual(out[1].id, 'DP-K001');        // HIGH
  assert.strictEqual(out[2].id, 'DP-K002');        // MEDIUM
  assert.ok(out.every(f => f.title && f.title.length > 0), '모든 항목에 규칙 제목이 채워진다');
});

test('summarizeRuleFailures: 신규 토큰 위반은 CRITICAL로 최우선', () => {
  const baseline = { values: { borderRadius: new Set() } };
  const drift = C.lintTokenDrift({ borderRadius: [v('3px', 9)] }, CONTRACT, baseline);
  const state = C.lintStateContract({ clickable: [{ selector: '.c', tag: 'div', cursor: 'default' }] });
  const out = C.summarizeRuleFailures(drift, state);
  assert.strictEqual(out[0].id, 'DP-T001');
  assert.strictEqual(out[0].newCount, 1);
});

test('RULES 레지스트리: 린트가 내는 모든 ID가 등록되어 있다', () => {
  const ids = new Set(Object.keys(C.RULES));
  for (const id of Object.values(C.TOKEN_RULE)) {
    assert.ok(ids.has(id), `${id} 미등록`);
  }
  for (const id of ['DP-K001', 'DP-K002', 'DP-K003', 'DP-S001', 'DP-S002', 'DP-S003']) {
    assert.ok(ids.has(id), `${id} 미등록`);
  }
});

// == hashContract / resolveTokenBaseline (H2: 계약이 바뀌면 baseline은 무효다) ==
const CONTRACT_B = C.parseDesignContract({
  version: 1,
  tokens: {
    borderRadius: { decision: 'DD-014', allowed: ['8px', '12px', '16px'] },   // 16px 추가
    color: { decision: 'DD-009', allowed: ['#FFFFFF', '#0F172A'] },
  },
});

test('hashContract: 허용 토큰 순서가 달라도 같은 계약이면 같은 해시', () => {
  const a = C.parseDesignContract({ version: 1, tokens: { borderRadius: { allowed: ['8px', '12px'] } } });
  const b = C.parseDesignContract({ version: 1, tokens: { borderRadius: { allowed: ['12px', '8px'] } } });
  assert.strictEqual(C.hashContract(a), C.hashContract(b));
});

test('hashContract: 허용 토큰이 하나라도 바뀌면 해시가 달라진다', () => {
  assert.notStrictEqual(C.hashContract(CONTRACT), C.hashContract(CONTRACT_B));
});

test('hashContract: 계약이 없으면 null', () => {
  assert.strictEqual(C.hashContract({ enabled: false }), null);
  assert.strictEqual(C.hashContract(null), null);
});

test('resolveTokenBaseline: baseline 파일이 없으면 fresh', () => {
  const r = C.resolveTokenBaseline(null, CONTRACT);
  assert.strictEqual(r.status, 'fresh');
  assert.strictEqual(r.stale, false);
  assert.strictEqual(r.contractHash, C.hashContract(CONTRACT));
});

test('resolveTokenBaseline: 계약이 그대로면 reused (래칫 유지)', () => {
  const baseline = { contractHash: C.hashContract(CONTRACT), values: {} };
  const r = C.resolveTokenBaseline(baseline, CONTRACT);
  assert.strictEqual(r.status, 'reused');
  assert.strictEqual(r.stale, false);
  assert.strictEqual(r.baseline, baseline);
});

test('resolveTokenBaseline: 계약이 바뀌면 refrozen — 낡은 동결을 버린다', () => {
  const baseline = { contractHash: C.hashContract(CONTRACT), values: { borderRadius: ['3px'] } };
  const r = C.resolveTokenBaseline(baseline, CONTRACT_B);
  assert.strictEqual(r.status, 'refrozen(contract changed)');
  assert.strictEqual(r.stale, true);
  assert.strictEqual(r.baseline, null);   // 이전 동결값을 물려주지 않는다
  assert.ok(r.reason.includes('contract hash'));
});

test('resolveTokenBaseline: contractHash 없는 구(舊) baseline은 버리지 않고 채택(reused + needsRewrite)', () => {
  // 재동결하면 업그레이드 시점까지 쌓인 신규 부채가 baseline에 흡수된다 — 동결값을 물려받아야 한다.
  const legacy = { values: { borderRadius: ['3px'] } };
  const r = C.resolveTokenBaseline(legacy, CONTRACT);
  assert.strictEqual(r.status, 'reused');
  assert.strictEqual(r.stale, false);
  assert.strictEqual(r.baseline, legacy);
  assert.strictEqual(r.needsRewrite, true);
  assert.strictEqual(r.contractHash, C.hashContract(CONTRACT));
});

test('rewriteTokenBaselineMeta: 동결값은 그대로 두고 contractHash·routes만 붙여 다시 쓴다', () => {
  const dir = tmpdir();
  try {
    fs.mkdirSync(path.join(dir, '.design-polish'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.design-polish', 'token-baseline.json'), JSON.stringify({
      createdAt: '2026-01-01T00:00:00.000Z',
      values: { borderRadius: ['3px', '7px'] },
    }));
    const legacy = C.readTokenBaseline(dir);
    assert.strictEqual(legacy.contractHash, null);
    const fp = C.rewriteTokenBaselineMeta(legacy, dir, { contractHash: 'abc123', routes: ['/'] });
    const saved = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.strictEqual(saved.contractHash, 'abc123');
    assert.deepStrictEqual(saved.routes, ['/']);
    assert.deepStrictEqual(saved.values.borderRadius.sort(), ['3px', '7px']);
    assert.strictEqual(saved.createdAt, '2026-01-01T00:00:00.000Z');   // 원 동결 시각 보존
    assert.ok(saved.adoptedAt);
    // 다시 읽으면 reused(needsRewrite 없음) — 1회성 채택이 끝난다
    const again = C.resolveTokenBaseline(C.readTokenBaseline(dir), { allowed: {} });
    assert.strictEqual(again.baseline.contractHash, 'abc123');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeTokenBaseline: contractHash와 routes를 함께 기록한다', () => {
  const dir = tmpdir();
  try {
    const drift = C.lintTokenDrift({ borderRadius: [v('3px')] }, CONTRACT, null);
    const fp = C.writeTokenBaseline(drift, dir, { contractHash: 'abc123', routes: ['/', '/pricing'] });
    const saved = JSON.parse(fs.readFileSync(fp, 'utf8'));
    assert.strictEqual(saved.contractHash, 'abc123');
    assert.deepStrictEqual(saved.routes, ['/', '/pricing']);
    assert.ok(saved.values.borderRadius.includes('3px'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// == summarizeSeverity (M2: Pivot 판정 근거를 스크립트가 만든다) ==
test('summarizeSeverity: 심각도별 규칙 수/위반 수와 차단 합계를 낸다', () => {
  const out = C.summarizeSeverity([
    { rule: 'DP-T004', severity: 'CRITICAL', count: 3 },
    { rule: 'DP-K001', severity: 'HIGH', count: 2 },
    { rule: 'DP-T001', severity: 'MEDIUM', count: 7 },
    { rule: 'DP-T005', severity: 'LOW', count: 1 },
  ]);
  assert.strictEqual(out.totalRules, 4);
  assert.strictEqual(out.totalViolations, 13);
  assert.strictEqual(out.blockingRules, 2);
  assert.strictEqual(out.blockingViolations, 5);
  assert.strictEqual(out.rules.MEDIUM, 1);
  assert.strictEqual(out.violations.LOW, 1);
});

test('summarizeSeverity: 빈 입력/null도 0으로 채운 동일 형태를 낸다', () => {
  for (const input of [[], null, undefined]) {
    const out = C.summarizeSeverity(input);
    assert.strictEqual(out.totalRules, 0);
    assert.strictEqual(out.blockingViolations, 0);
    assert.deepStrictEqual(Object.keys(out.rules), C.SEVERITY_LEVELS);
  }
});

test('summarizeSeverity: 알 수 없는 severity는 LOW로 떨어뜨린다(집계 누락 방지)', () => {
  const out = C.summarizeSeverity([{ rule: 'X', severity: 'MAJOR', count: 4 }]);
  assert.strictEqual(out.violations.LOW, 4);
  assert.strictEqual(out.blockingViolations, 0);
});

test('SEVERITY_LEVELS: 4단계이고 순서가 CRITICAL > HIGH > MEDIUM > LOW', () => {
  assert.deepStrictEqual(C.SEVERITY_LEVELS, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  assert.ok(C.SEVERITY_ORDER.CRITICAL < C.SEVERITY_ORDER.HIGH);
  assert.ok(C.SEVERITY_ORDER.HIGH < C.SEVERITY_ORDER.MEDIUM);
  assert.ok(C.SEVERITY_ORDER.MEDIUM < C.SEVERITY_ORDER.LOW);
});

// == DP-S002 오탐 차단 (H1) ==
test('DP-S002: focus-visible 규칙이 있는 페이지면 INFO로 강등한다(오탐 차단)', () => {
  const r = C.lintStateContract({
    focusMethod: 'keyboard-tab',
    hasFocusVisibleRule: true,
    focusable: [{ selector: 'button.a', focusChanged: false }],
  });
  assert.strictEqual(r.findings.length, 0);
  assert.strictEqual(r.info.length, 1);
  assert.strictEqual(r.info[0].id, 'DP-S002');
});

test('DP-S002: 키보드 순회로 재지 못했으면(el.focus 등) INFO로 강등', () => {
  const r = C.lintStateContract({
    focusMethod: 'element-focus',
    focusable: [{ selector: 'button.a', focusChanged: false }],
  });
  assert.strictEqual(r.findings.length, 0);
  assert.strictEqual(r.info.length, 1);
});

test('DP-S002: 계측 메타(순회 상한/시간초과)를 결과에 남긴다', () => {
  const r = C.lintStateContract({
    focusMethod: 'keyboard-tab',
    focusTraversalCapped: true,
    focusTimedOut: false,
    focusable: [{ selector: 'button.a', focusChanged: true }],
  });
  assert.strictEqual(r.focusMethod, 'keyboard-tab');
  assert.strictEqual(r.focusTraversalCapped, true);
  assert.strictEqual(r.focusTimedOut, false);
});

// == 측정 불완전 표시 (L2) ==
test('lintTokenDrift: 값 상한에 걸리지 않으면 measurement=complete', () => {
  const r = C.lintTokenDrift({ borderRadius: [v('3px')] }, CONTRACT, null);
  assert.strictEqual(r.measurement, 'complete');
  assert.deepStrictEqual(r.capped, []);
});

test('lintTokenDrift: 값 상한(200종) 도달은 incomplete로 표시하되 신규 카운트는 유지', () => {
  const many = Array.from({ length: 200 }, (_, i) => v(`${i + 100}px`));
  // 계측 쪽에서 상한 도달을 알려준다 (capture.cjs styleMetrics.capped)
  const r = C.lintTokenDrift({ borderRadius: many }, CONTRACT, null, { borderRadius: true });
  assert.strictEqual(r.measurement, 'incomplete');
  assert.ok(r.capped.includes('borderRadius'));
  assert.strictEqual(typeof r.newViolationCount, 'number');   // 게이트 소비 필드는 그대로
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
