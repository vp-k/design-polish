#!/usr/bin/env node
// design-contract.cjs — 디자인 계약(DESIGN.md / design-decisions.json) 로딩 + 순수 린트 로직
//
// 설계 원칙 (capture.cjs와 동일):
//   계측(page.evaluate) = 브라우저,  판정(lint*) = 이 파일의 순수 함수.
// 순수 함수만 두므로 puppeteer 없이 단위 테스트가 가능하고 결정론적이다.
//
// 계약이 없으면 모든 lint는 { enabled: false }를 반환하고 기존 휴리스틱 경로가 유지된다.
// (브라운필드에서 계약을 도입해도 첫 실행이 수백 건 위반으로 터지지 않도록 ratchet 사용)

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// 규칙 레지스트리 — knowledge/failure-rules.md와 1:1 대응
// ============================================

// severity는 CRITICAL > HIGH > MEDIUM > LOW 4단계뿐이다.
// (v2.6.0 이전에는 MAJOR/MINOR가 더 있었고 MAJOR가 HIGH보다 낮게 정렬되어
//  이름과 정렬 순서가 어긋났다. 이름이 곧 순서가 되도록 축소했다.)
const SEVERITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEVERITY_ORDER = SEVERITY_LEVELS.reduce((acc, s, i) => { acc[s] = i; return acc; }, {});

// 이 레지스트리가 규칙 severity의 단일 출처다. lint/집계/리포트는 여기서만 읽는다.
const RULES = {
  'DP-T001': { severity: 'MEDIUM', title: 'border-radius가 디자인 계약 토큰 밖의 값' },
  'DP-T002': { severity: 'MEDIUM', title: '색상이 디자인 계약 팔레트 밖의 값' },
  'DP-T003': { severity: 'MEDIUM', title: 'spacing이 디자인 계약 스케일 밖의 값' },
  'DP-T004': { severity: 'HIGH', title: '폰트가 디자인 계약 타이포 밖의 값' },
  'DP-T005': { severity: 'LOW', title: 'box-shadow가 디자인 계약 스케일 밖의 값' },
  'DP-K001': { severity: 'HIGH', title: '한글 텍스트에 serif fallback 폰트 스택' },
  'DP-K002': { severity: 'MEDIUM', title: '한글 문단에 word-break: keep-all 미설정' },
  'DP-K003': { severity: 'LOW', title: '한글 텍스트 자간(letter-spacing) 과다 축소' },
  'DP-S001': { severity: 'HIGH', title: 'disabled 요소가 opacity만으로 표현 (cursor: not-allowed 없음)' },
  'DP-S002': { severity: 'CRITICAL', title: '인터랙티브 요소에 포커스 표시 없음 (WCAG 2.4.7)' },
  'DP-S003': { severity: 'MEDIUM', title: '클릭 가능 요소에 cursor: pointer 미설정' },
};

// 레지스트리 무결성 — 등록되지 않은 severity 문자열이 섞이면 정렬이 조용히 망가진다.
for (const [id, r] of Object.entries(RULES)) {
  if (SEVERITY_ORDER[r.severity] == null) {
    throw new Error(`RULES[${id}]: unknown severity ${r.severity}`);
  }
}

function ruleSeverity(id, fallback = 'MEDIUM') {
  return (RULES[id] && RULES[id].severity) || fallback;
}

// 토큰 카테고리 → 규칙 ID
const TOKEN_RULE = {
  borderRadius: 'DP-T001',
  color: 'DP-T002',
  spacing: 'DP-T003',
  fontFamily: 'DP-T004',
  shadow: 'DP-T005',
};

const TOKEN_CATEGORIES = Object.keys(TOKEN_RULE);

// ============================================
// 값 정규화 — 계약(작성자 표기)과 computed style(브라우저 표기)을 같은 공간으로
// ============================================

// #RGB / #RRGGBB / #RRGGBBAA / rgb() / rgba() → 'r,g,b' 또는 'r,g,b,a'
// 파싱 불가한 값(named color 등)은 소문자 트림 문자열을 그대로 사용한다.
function normalizeColorValue(v) {
  if (v == null) return '';
  const s = String(v).trim().toLowerCase();
  if (!s) return '';

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return s;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) {
      const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 1000) / 1000;
      return a === 1 ? `${r},${g},${b}` : `${r},${g},${b},${a}`;
    }
    return `${r},${g},${b}`;
  }

  const rgb = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return s;
    const num = (x) => {
      const t = String(x).trim();
      if (t.endsWith('%')) return Math.round((parseFloat(t) / 100) * 255);
      return Math.round(parseFloat(t));
    };
    const r = num(parts[0]), g = num(parts[1]), b = num(parts[2]);
    if (![r, g, b].every(Number.isFinite)) return s;
    if (parts.length >= 4) {
      let a = parseFloat(parts[3]);
      if (String(parts[3]).trim().endsWith('%')) a = a / 100;
      if (!Number.isFinite(a)) return `${r},${g},${b}`;
      a = Math.round(a * 1000) / 1000;
      return a === 1 ? `${r},${g},${b}` : `${r},${g},${b},${a}`;
    }
    return `${r},${g},${b}`;
  }

  return s;
}

// px/rem/em → px 문자열. computed style은 항상 px이므로 계약 쪽 rem 표기를 흡수하기 위함.
// 0은 단위와 무관하게 '0px'로 통일. 비수치 값(예: 9999px 대신 'full')은 소문자 문자열 유지.
function normalizeLengthValue(v, rootPx = 16) {
  if (v == null) return '';
  const s = String(v).trim().toLowerCase();
  if (!s) return '';
  const m = s.match(/^(-?[0-9]*\.?[0-9]+)(px|rem|em|%)?$/);
  if (!m) return s.replace(/\s+/g, ' ');
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return s;
  const unit = m[2] || 'px';
  if (unit === '%') return `${round2(n)}%`;
  const px = (unit === 'rem' || unit === 'em') ? n * rootPx : n;
  return `${round2(px)}px`;
}

// 폰트 스택의 첫 패밀리만 비교 대상 (computed style도 스택 전체를 돌려주므로 동일 규칙 적용)
function normalizeFontValue(v) {
  if (v == null) return '';
  return String(v).split(',')[0].trim().toLowerCase().replace(/["']/g, '');
}

// box-shadow — 색상 표기 차이를 흡수하고 공백을 정규화
function normalizeShadowValue(v) {
  if (v == null) return '';
  let s = String(v).trim().toLowerCase().replace(/\s+/g, ' ');
  s = s.replace(/rgba?\([^)]+\)/g, (m) => `rgb(${normalizeColorValue(m)})`);
  s = s.replace(/#[0-9a-f]{3,8}\b/g, (m) => `rgb(${normalizeColorValue(m)})`);
  return s;
}

function normalizeTokenValue(category, value, rootPx = 16) {
  switch (category) {
    case 'color': return normalizeColorValue(value);
    case 'borderRadius':
    case 'spacing': return normalizeLengthValue(value, rootPx);
    case 'fontFamily': return normalizeFontValue(value);
    case 'shadow': return normalizeShadowValue(value);
    default: return String(value == null ? '' : value).trim().toLowerCase();
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ============================================
// 계약 로딩
// ============================================

// design-decisions.json 스키마(v1):
// {
//   "version": 1,
//   "decisions": [{ "id": "DD-001", "title": "...", "value": "...", "provenance": "user-fact", "rationale": "..." }],
//   "tokens": {
//     "borderRadius": { "decision": "DD-014", "allowed": ["8px", "12px", "9999px"] },
//     "color":        { "decision": "DD-009", "allowed": ["#0F172A", "rgb(255,255,255)"] },
//     ...
//   }
// }
function parseDesignContract(raw) {
  if (!raw || typeof raw !== 'object') return { enabled: false, reason: 'not an object' };
  const tokens = raw.tokens && typeof raw.tokens === 'object' ? raw.tokens : null;
  if (!tokens) return { enabled: false, reason: 'no tokens section' };

  const rootPx = Number.isFinite(raw.rootFontSizePx) ? raw.rootFontSizePx : 16;
  const normalized = {};
  let categoryCount = 0;

  for (const cat of TOKEN_CATEGORIES) {
    const entry = tokens[cat];
    if (!entry) continue;
    const allowed = Array.isArray(entry) ? entry : (Array.isArray(entry.allowed) ? entry.allowed : null);
    if (!allowed || allowed.length === 0) continue;
    const set = new Set();
    for (const v of allowed) {
      const nv = normalizeTokenValue(cat, v, rootPx);
      if (nv) set.add(nv);
    }
    if (set.size === 0) continue;
    normalized[cat] = {
      decision: (entry && entry.decision) || null,
      allowed: set,
      raw: allowed.slice(0, 40),
    };
    categoryCount++;
  }

  if (categoryCount === 0) return { enabled: false, reason: 'no usable token category' };

  const decisions = Array.isArray(raw.decisions) ? raw.decisions : [];
  return {
    enabled: true,
    version: raw.version || 1,
    rootPx,
    tokens: normalized,
    decisionCount: decisions.length,
    decisionIds: decisions.map(d => d && d.id).filter(Boolean),
  };
}

function readDesignContract(cwd = process.cwd()) {
  const fp = path.join(cwd, '.design-polish', 'design-decisions.json');
  try {
    if (!fs.existsSync(fp)) return { enabled: false, reason: 'no contract file', path: fp };
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const parsed = parseDesignContract(raw);
    parsed.path = fp;
    return parsed;
  } catch (e) {
    return { enabled: false, reason: `contract parse failed: ${e.message}`, path: fp };
  }
}

// ── ratchet baseline ──
// 계약 도입 시점에 이미 존재하던 위반값 집합. 이후 실행은 "신규 위반"만 차단 대상으로 본다.
// 파일을 지우면 다음 실행에서 현재 상태로 재-baseline 된다.
// 계약의 "의미" 해시 — 파싱/정규화 후의 허용 토큰 집합만 본다.
// 주석·들여쓰기·키 순서·표기(#FFF vs rgb(255,255,255))가 바뀌어도 해시는 그대로고,
// 실제 허용값·rootPx가 바뀌면 해시가 달라진다. baseline 무효화 판정의 단일 기준.
function hashContract(contract) {
  if (!contract || !contract.enabled) return null;
  const shape = {
    rootPx: contract.rootPx,
    tokens: {},
  };
  for (const cat of TOKEN_CATEGORIES) {
    const spec = contract.tokens && contract.tokens[cat];
    if (!spec) continue;
    shape.tokens[cat] = {
      decision: spec.decision || null,
      allowed: Array.from(spec.allowed).sort(),
    };
  }
  return crypto.createHash('sha256').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}

function readTokenBaseline(cwd = process.cwd()) {
  const fp = path.join(cwd, '.design-polish', 'token-baseline.json');
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!raw || typeof raw.values !== 'object' || raw.values == null) return null;
    const out = {};
    for (const cat of TOKEN_CATEGORIES) {
      out[cat] = new Set(Array.isArray(raw.values[cat]) ? raw.values[cat] : []);
    }
    return {
      createdAt: raw.createdAt || null,
      contractHash: typeof raw.contractHash === 'string' ? raw.contractHash : null,
      routes: Array.isArray(raw.routes) ? raw.routes.slice() : null,
      values: out,
    };
  } catch (_) {
    return null;
  }
}

// baseline이 "지금 이 계약"에 대해 아직 유효한지 판정한다. 분기는 셋뿐이다:
//
//   fresh                        — baseline 파일이 없다(최초 실행). 호출자가 지금 상태를 동결한다.
//   reused                       — 기존 동결을 그대로 쓴다. 두 경로가 있다:
//                                    (a) 계약 해시 일치 — 정상 재사용.
//                                    (b) legacy-adopt: 해시가 없는 v2.5 이하 파일. 어떤 계약으로
//                                        동결했는지 증명할 수 없지만, 버리고 재동결하면 업그레이드
//                                        시점까지 쌓인 신규 부채가 baseline에 흡수된다(래칫 무력화).
//                                        그래서 동결값은 **채택**하고 needsRewrite: true로 표시해
//                                        호출자가 contractHash만 덧붙여 파일을 다시 쓰게 한다.
//   refrozen(contract changed)   — 해시가 있고 불일치. 옛 동결은 다른 계약 기준이라 신규 판정의
//                                  근거가 될 수 없으므로 버리고(baseline: null) 현재 위반을 재동결한다.
//
// 반환: { status, stale, baseline, contractHash, reason, needsRewrite? }
//       baseline은 재사용 가능할 때만 non-null. stale은 refrozen에서만 true.
function resolveTokenBaseline(baseline, contract) {
  const hash = hashContract(contract);
  if (!baseline) {
    return { status: 'fresh', stale: false, baseline: null, contractHash: hash, reason: 'no baseline file' };
  }
  if (!baseline.contractHash) {
    // v2.5 이하 파일 — 어떤 계약으로 동결했는지 증명할 수 없지만, 그렇다고 버리고 현재 위반으로
    // 재동결하면 업그레이드 시점까지 쌓인 신규 부채가 baseline으로 흡수된다(래칫 무력화).
    // 동결값은 그대로 채택(reused)하고 호출자가 contractHash를 붙여 파일을 다시 쓰게 한다(needsRewrite).
    // 계약이 실제로 바뀌었는지 의심되면 사람이 token-baseline.json을 삭제해 재동결한다.
    return {
      status: 'reused', stale: false, baseline, contractHash: hash, needsRewrite: true,
      reason: 'legacy baseline adopted, contractHash recorded',
    };
  }
  if (hash && baseline.contractHash !== hash) {
    return {
      status: 'refrozen(contract changed)', stale: true, baseline: null, contractHash: hash,
      reason: `contract hash ${baseline.contractHash} -> ${hash}`,
    };
  }
  return { status: 'reused', stale: false, baseline, contractHash: hash, reason: 'contract unchanged' };
}

function writeTokenBaseline(drift, cwd = process.cwd(), meta = {}) {
  if (!drift || !drift.enabled) return null;
  const dir = path.join(cwd, '.design-polish');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'token-baseline.json');
  const values = {};
  for (const cat of TOKEN_CATEGORIES) {
    const c = drift.categories[cat];
    // allValues는 잘리지 않은 전체 위반값 목록이다. 리포트용 violations는 30건으로 잘려 있으므로
    // 여기서 쓰면 31번째 이후의 기존 위반이 다음 실행에 '신규'로 잡혀 래칫이 무력화된다.
    values[cat] = c ? (Array.isArray(c.allValues) ? c.allValues : c.violations.map(v => v.value)) : [];
  }
  const payload = {
    createdAt: new Date().toISOString(),
    note: '계약 도입 시점의 기존 위반값 — 이후 실행은 신규 위반만 차단한다. 계약(design-decisions.json)의 허용 토큰이 바뀌면 contractHash 불일치로 자동 재동결된다. 수동 재-baseline은 이 파일 삭제.',
    // 어떤 계약을 기준으로 동결했는지. 이게 없거나 달라지면 이 동결은 무효다.
    contractHash: meta.contractHash != null ? meta.contractHash : null,
    // 어떤 라우트를 훑어 얻은 동결인지. 라우트가 늘면 새 값이 '신규'로 보일 수 있음을 사람이 판단할 근거.
    routes: Array.isArray(meta.routes) ? meta.routes.slice() : [],
    values,
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2));
  return fp;
}

// 이미 읽은 baseline(readTokenBaseline 결과)의 동결값을 그대로 두고 메타만 갱신해 다시 쓴다.
// writeTokenBaseline은 '현재 drift'로 값을 만들지만, 이 함수는 값을 바꾸지 않는다 — 구버전 파일 채택 전용.
function rewriteTokenBaselineMeta(baseline, cwd = process.cwd(), meta = {}) {
  if (!baseline || !baseline.values) return null;
  const dir = path.join(cwd, '.design-polish');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'token-baseline.json');
  const values = {};
  for (const cat of TOKEN_CATEGORIES) {
    const v = baseline.values[cat];
    values[cat] = v instanceof Set ? Array.from(v) : (Array.isArray(v) ? v.slice() : []);
  }
  const payload = {
    createdAt: baseline.createdAt || new Date().toISOString(),
    note: '계약 도입 시점의 기존 위반값 — 이후 실행은 신규 위반만 차단한다. 계약(design-decisions.json)의 허용 토큰이 바뀌면 contractHash 불일치로 자동 재동결된다. 수동 재-baseline은 이 파일 삭제.',
    contractHash: meta.contractHash != null ? meta.contractHash : null,
    routes: Array.isArray(meta.routes) ? meta.routes.slice() : (Array.isArray(baseline.routes) ? baseline.routes.slice() : []),
    values,
    adoptedAt: new Date().toISOString(),
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2));
  return fp;
}

// ============================================
// 린트 1: 토큰 드리프트 (계약 있을 때만)
// ============================================

// styleValues 형태 (collectStyleMetrics의 values 필드):
//   { borderRadius: [{ value, count, sample }], color: [...], ... }
// baseline: readTokenBaseline() 결과 또는 null
// capped: collectStyleMetrics의 capped 필드 — { color: true, ... }.
//   해당 범주가 수집 상한(200종)에 걸려 값 목록이 불완전하다는 뜻이다. 이 경우 baseline이
//   전체를 담지 못했을 수 있으므로 '신규 위반' 판정을 포기한다(fail-open). 불완전한 목록으로
//   신규를 세면 기존 위반이 신규로 둔갑해 게이트가 거짓 차단된다.
function lintTokenDrift(styleValues, contract, baseline, capped) {
  if (!contract || !contract.enabled) {
    return { enabled: false, reason: (contract && contract.reason) || 'no contract' };
  }
  if (!styleValues || typeof styleValues !== 'object') {
    return { enabled: false, reason: 'no style values measured' };
  }

  const categories = {};
  let totalViolations = 0;
  let newViolationCount = 0;
  const findings = [];
  // 계약이 검사하는 범주 중 수집 상한(200종)에 걸린 것들 — 위반이 0건이어도 기록한다.
  // "위반이 없다"와 "다 못 봤다"는 다른 사실이고, 후자를 점수로 환산하면 안 된다.
  const cappedCategories = TOKEN_CATEGORIES.filter(
    cat => contract.tokens[cat] && capped && capped[cat]
  );

  for (const cat of TOKEN_CATEGORIES) {
    const spec = contract.tokens[cat];
    if (!spec) continue;
    const measured = Array.isArray(styleValues[cat]) ? styleValues[cat] : [];
    const violations = [];
    const newViolations = [];
    const isCapped = !!(capped && capped[cat]);
    const baselineSet = (!isCapped && baseline && baseline.values[cat]) ? baseline.values[cat] : null;

    for (const item of measured) {
      const nv = normalizeTokenValue(cat, item && item.value, contract.rootPx);
      if (!nv) continue;
      if (spec.allowed.has(nv)) continue;
      const v = {
        value: nv,
        raw: item.value,
        count: item.count || 1,
        sample: item.sample || null,
        decision: spec.decision,
      };
      violations.push(v);
      // baseline이 없으면(=최초 실행) 전부 baseline 후보로 보고 신규로 세지 않는다.
      if (baselineSet && !baselineSet.has(nv)) newViolations.push(v);
    }

    if (violations.length === 0) continue;
    categories[cat] = {
      rule: TOKEN_RULE[cat],
      decision: spec.decision,
      allowedCount: spec.allowed.size,
      capped: isCapped,
      // 리포트용은 30건으로 자르되, 래칫 baseline이 쓸 전체 목록은 따로 보존한다.
      allValues: violations.map(v => v.value),
      violations: violations.slice(0, 30),
      violationCount: violations.length,
      newViolations: newViolations.slice(0, 30),
      newViolationCount: newViolations.length,
    };
    totalViolations += violations.length;
    newViolationCount += newViolations.length;

    findings.push({
      id: TOKEN_RULE[cat],
      severity: newViolations.length > 0 ? 'CRITICAL' : ruleSeverity(TOKEN_RULE[cat]),
      category: cat,
      count: violations.length,
      newCount: newViolations.length,
      decision: spec.decision,
      samples: (newViolations.length > 0 ? newViolations : violations).slice(0, 5)
        .map(v => ({ value: v.raw, selector: v.sample })),
    });
  }

  return {
    enabled: true,
    hasBaseline: !!baseline,
    capped: cappedCategories,
    // 계측 완전성. incomplete면 totalViolations/newViolationCount는 하한값일 뿐이므로
    // 점수(styleFit)로 환산하지 않고 상태로만 보고한다. (게이트가 읽는 두 카운트 필드는 유지)
    measurement: cappedCategories.length > 0 ? 'incomplete' : 'complete',
    totalViolations,
    newViolationCount,
    categories,
    findings,
  };
}

// ============================================
// 린트 2: 한국어 타이포그래피 (계약 없이도 동작)
// ============================================

// 스택 마지막 fallback이 serif면 한글은 시스템 명조/Times로 떨어진다.
// (예: font-family: Inter, serif → 한글만 serif로 렌더 — 대표적 실패)
const KOREAN_FONT_HINTS = [
  'pretendard', 'noto sans kr', 'notosanskr', 'noto sans korean', 'nanum', 'nanumgothic',
  'spoqa', 'apple sd gothic', 'applesdgothicneo', 'malgun', '맑은 고딕', 'gothic a1',
  'gmarket', 'ibm plex sans kr', 'source han sans', 'suit', 'wanted sans', 'paperlogy',
  'spoqa han sans', 'nanumsquare', '나눔', '프리텐다드', 'sandoll', 'kopub',
];

const SERIF_FAMILY_HINTS = [
  'times', 'times new roman', 'georgia', 'garamond', 'palatino', 'book antiqua',
  'batang', '바탕', 'gungsuh', '궁서', 'myeongjo', '명조', 'nanummyeongjo', 'noto serif',
];

function isSerifFallbackStack(stack) {
  if (!stack) return false;
  const families = String(stack).split(',').map(f => f.trim().toLowerCase().replace(/["']/g, ''));
  if (families.length === 0) return false;
  // 한국어 전용 폰트가 스택에 있으면 한글이 serif로 떨어지지 않는다.
  if (families.some(f => KOREAN_FONT_HINTS.some(k => f.includes(k)))) return false;
  // generic serif가 스택에 포함(단, sans-serif는 제외) → 한글 fallback이 serif
  if (families.some(f => f === 'serif')) return true;
  // Latin 전용 serif 패밀리만 지정된 경우도 동일 결과
  if (families.some(f => SERIF_FAMILY_HINTS.some(s => f.includes(s)))) return true;
  return false;
}

// samples: [{ selector, fontFamily, chars, wordBreak, overflowWrap, letterSpacing, fontSize, block }]
// letterSpacing/fontSize는 px 수치(브라우저 computed) 또는 null
function lintKoreanTypography(metrics) {
  if (!metrics || !Array.isArray(metrics.samples)) {
    return { enabled: false, reason: 'no korean typography measurement' };
  }
  const samples = metrics.samples;
  if (samples.length === 0) {
    return { enabled: true, scanned: metrics.scanned || 0, hangulElements: 0, findings: [] };
  }

  const hits = { 'DP-K001': [], 'DP-K002': [], 'DP-K003': [] };

  for (const s of samples) {
    if (!s) continue;

    if (isSerifFallbackStack(s.fontFamily)) {
      hits['DP-K001'].push({ selector: s.selector, detail: s.fontFamily });
    }

    // 긴 한글 문단(30자 이상)에서 word-break/overflow-wrap 미설정 → 어절 중간 줄바꿈
    if (s.block && (s.chars || 0) >= 30) {
      const wb = String(s.wordBreak || 'normal').toLowerCase();
      const ow = String(s.overflowWrap || 'normal').toLowerCase();
      if (wb !== 'keep-all' && ow !== 'break-word' && ow !== 'anywhere') {
        hits['DP-K002'].push({ selector: s.selector, detail: `word-break: ${wb}` });
      }
    }

    // 한글은 라틴 대비 자간 축소에 취약 — -2% 미만이면 가독성 저하
    if (Number.isFinite(s.letterSpacing) && Number.isFinite(s.fontSize) && s.fontSize > 0) {
      const em = s.letterSpacing / s.fontSize;
      if (em <= -0.02) {
        hits['DP-K003'].push({ selector: s.selector, detail: `${round2(em * 100)}%` });
      }
    }
  }

  const findings = [];
  for (const id of ['DP-K001', 'DP-K002', 'DP-K003']) {
    if (hits[id].length === 0) continue;
    findings.push({
      id,
      severity: ruleSeverity(id),
      title: RULES[id].title,
      count: hits[id].length,
      samples: hits[id].slice(0, 5),
    });
  }

  return {
    enabled: true,
    scanned: metrics.scanned || 0,
    hangulElements: samples.length,
    findings,
  };
}

// ============================================
// 린트 3: 컴포넌트 상태 계약 (계약 없이도 동작)
// ============================================

// metrics: {
//   scannedInteractive, focusMeasured, focusMethod, hasFocusVisibleRule,
//   focusTraversalCapped, focusTimedOut, stylesheetsUnreadable,
//   disabled:  [{ selector, cursor, opacity }],
//   focusable: [{ selector, focusChanged }],
//   clickable: [{ selector, tag, cursor }]
// }
//
// DP-S002(포커스 표시 없음)의 판정 근거는 **실제 키보드 포커스**다(focusMethod: 'keyboard-tab').
// el.focus()로는 :focus-visible이 적용되지 않아, :focus-visible만 스타일링한 정상 코드가
// 통째로 위반으로 잡혔다(거짓 양성). Tab 순회로 진짜 키보드 포커스를 준 뒤 비교한다.
//
// 그럼에도 변화가 안 잡히는 경우가 남는다 — 포커스 표시가 ::after/::before 의사요소,
// SVG filter, 상위 요소 스타일로 구현되면 대상 요소의 computed style은 그대로다.
// 그래서 강등(INFO)을 두되, **그 근거를 요소 단위로 좁힌다**(v2.7.0):
//   페이지 어딘가에 :focus-visible 규칙이 하나만 있어도 전 요소를 강등하던 예전 규칙은
//   DP-S002를 사실상 도달 불가로 만들었다(규칙 하나 = 전 페이지 면죄부).
//   이제는 그 요소에 **매칭되는** :focus-visible 규칙이 있을 때만 강등한다.
//
// 강등 조건(순서대로, 먼저 걸리는 사유를 기록):
//   1) 실제 키보드 포커스로 재지 못함(focusMethod !== 'keyboard-tab')
//   2) 읽지 못한 교차 출처 스타일시트가 있음(stylesheetsUnreadable) — 규칙 부재를 증명할 수 없다
//   3) 그 요소에 매칭되는 :focus-visible 규칙이 있음(focusVisibleRule)
//   4) 요소별 매칭을 계측하지 못했는데(focusRuleMeasured !== true) 페이지에 규칙은 있음
//      — 구(舊) 계측 형식 하위호환. 이때만 예전의 전역 fail-open을 유지한다.
function unreadableStylesheetCount(metrics) {
  if (!metrics) return 0;
  const v = metrics.stylesheetsUnreadable;
  if (v === true) return 1;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

// 순수 판정부 — 강등하면 { reason }, 아니면 null.
function focusDemotion(metrics, f) {
  const m = metrics || {};
  const focusMethod = m.focusMethod || 'unknown';
  if (focusMethod !== 'keyboard-tab') {
    return { reason: `키보드 포커스 계측 실패(focusMethod: ${focusMethod}) — 단정 불가` };
  }
  const unreadable = unreadableStylesheetCount(m);
  if (unreadable > 0) {
    return { reason: `교차 출처 스타일시트 ${unreadable}건을 읽지 못함 — :focus-visible 규칙 존재 여부 확인 불가` };
  }
  if (f && f.focusVisibleRule === true) {
    return { reason: '이 요소에 매칭되는 :focus-visible 규칙 존재 — 의사요소/상위 요소 구현 가능성' };
  }
  if (m.focusRuleMeasured !== true && m.hasFocusVisibleRule === true) {
    return { reason: '요소별 :focus-visible 매칭 미계측 + 페이지에 규칙 존재 — 단정 불가' };
  }
  return null;
}

function lintStateContract(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return { enabled: false, reason: 'no state contract measurement' };
  }

  const hits = { 'DP-S001': [], 'DP-S002': [], 'DP-S003': [] };
  const info = [];
  const focusMethod = metrics.focusMethod || 'unknown';

  for (const d of (metrics.disabled || [])) {
    if (!d) continue;
    if (String(d.cursor || '').toLowerCase() !== 'not-allowed') {
      hits['DP-S001'].push({ selector: d.selector, detail: `cursor: ${d.cursor}, opacity: ${d.opacity}` });
    }
  }

  for (const f of (metrics.focusable || [])) {
    if (!f) continue;
    if (f.focusChanged !== false) continue;
    const detail = 'Tab 포커스 시 outline/box-shadow/border/background 변화 없음';
    const demoted = focusDemotion(metrics, f);
    if (demoted) {
      info.push({
        id: 'DP-S002',
        selector: f.selector,
        detail,
        reason: demoted.reason,
      });
    } else {
      hits['DP-S002'].push({ selector: f.selector, detail });
    }
  }

  for (const c of (metrics.clickable || [])) {
    if (!c) continue;
    const cur = String(c.cursor || '').toLowerCase();
    if (cur !== 'pointer') {
      hits['DP-S003'].push({ selector: c.selector, detail: `cursor: ${cur || 'unset'}` });
    }
  }

  const findings = [];
  for (const id of ['DP-S002', 'DP-S001', 'DP-S003']) {
    if (hits[id].length === 0) continue;
    findings.push({
      id,
      severity: ruleSeverity(id),
      title: RULES[id].title,
      count: hits[id].length,
      samples: hits[id].slice(0, 5),
    });
  }

  return {
    enabled: true,
    scannedInteractive: metrics.scannedInteractive || 0,
    focusMeasured: metrics.focusMeasured || 0,
    focusMethod,
    hasFocusVisibleRule: metrics.hasFocusVisibleRule === true,
    focusRuleMeasured: metrics.focusRuleMeasured === true,
    stylesheetsUnreadable: unreadableStylesheetCount(metrics),
    focusTraversalCapped: metrics.focusTraversalCapped === true,
    focusTimedOut: metrics.focusTimedOut === true,
    // 위반으로 세지 않되 사람이 볼 수 있게 남기는 관측치 (점수·게이트에 영향 없음)
    info,
    findings,
  };
}

// ============================================
// 집계 — 규칙 ID 단위 평면 리스트 (리포트/게이트 소비용)
// ============================================

function summarizeRuleFailures(...lints) {
  const out = [];
  for (const l of lints) {
    if (!l || !l.enabled || !Array.isArray(l.findings)) continue;
    for (const f of l.findings) {
      out.push({
        id: f.id,
        severity: f.severity,
        title: f.title || (RULES[f.id] && RULES[f.id].title) || '',
        count: f.count,
        newCount: f.newCount || 0,
        samples: f.samples || [],
      });
    }
  }
  out.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] != null ? SEVERITY_ORDER[a.severity] : SEVERITY_LEVELS.length;
    const sb = SEVERITY_ORDER[b.severity] != null ? SEVERITY_ORDER[b.severity] : SEVERITY_LEVELS.length;
    if (sa !== sb) return sa - sb;
    return (b.count || 0) - (a.count || 0);
  });
  return out;
}

// 토큰 드리프트 규칙(DP-T*)인가 — 이 규칙들만 baseline 동결(래칫) 개념을 가진다.
const RATCHETED_RULE_IDS = new Set(Object.values(TOKEN_RULE));

// 그 규칙에서 **지금 조치해야 하는** 위반 수.
//   토큰 규칙   → newCount (baseline 동결분은 래칫이 이미 "지금은 아님"으로 처리했다)
//   나머지 규칙 → count    (baseline 개념이 없으므로 전부 조치 대상)
function actionableCount(f) {
  if (!f) return 0;
  if (RATCHETED_RULE_IDS.has(f.id)) return Number.isFinite(f.newCount) ? Math.max(0, f.newCount) : 0;
  return Number.isFinite(f.count) ? Math.max(0, f.count) : 0;
}

// summarizeRuleFailures 결과 → severity별 집계.
// Pivot 판정처럼 "모델이 세던 산수"를 스크립트가 결정론적으로 내놓기 위한 순수 함수다.
//   rules                 : severity별 실패한 규칙 수(중복 없는 규칙 ID 기준)
//   violations            : severity별 위반 인스턴스 합계(총량 — baseline 동결분 포함, 보고용)
//   actionable            : severity별 **조치 대상** 위반 수 (토큰 규칙은 newCount만)
//   blockingViolations    : CRITICAL + HIGH 총량 (보고용, 의미 불변)
//   blockingNewViolations : CRITICAL + HIGH **조치 대상** 합계 — **Pivot 기준값**
//
// 왜 나눴나 (v2.7.0): 토큰 규칙의 count는 baseline 동결분을 포함한 총 위반이다.
// blockingViolations(총량)을 Pivot 임계(>= 5)에 걸면, 계약을 막 도입한 브라운필드가
// 신규 위반 1건뿐인데도 도입 시점에 동결한 옛 부채 때문에 곧바로 "전면 리뉴얼 권고"를 받는다.
// 래칫("기존 부채는 동결, 신규만 차단")의 취지가 Pivot 경로에서만 무너지고 있었다.
function summarizeSeverity(ruleFailures) {
  const rules = {};
  const violations = {};
  const actionable = {};
  for (const lv of SEVERITY_LEVELS) { rules[lv] = 0; violations[lv] = 0; actionable[lv] = 0; }
  const list = Array.isArray(ruleFailures) ? ruleFailures : [];
  for (const f of list) {
    const lv = SEVERITY_ORDER[f && f.severity] != null ? f.severity : 'LOW';
    rules[lv] += 1;
    violations[lv] += Number.isFinite(f && f.count) ? f.count : 0;
    actionable[lv] += actionableCount(f);
  }
  return {
    rules,
    violations,
    actionable,
    totalRules: list.length,
    totalViolations: SEVERITY_LEVELS.reduce((a, lv) => a + violations[lv], 0),
    totalActionableViolations: SEVERITY_LEVELS.reduce((a, lv) => a + actionable[lv], 0),
    blockingRules: rules.CRITICAL + rules.HIGH,
    blockingViolations: violations.CRITICAL + violations.HIGH,
    blockingNewViolations: actionable.CRITICAL + actionable.HIGH,
  };
}

module.exports = {
  RULES,
  SEVERITY_LEVELS,
  SEVERITY_ORDER,
  ruleSeverity,
  TOKEN_RULE,
  TOKEN_CATEGORIES,
  normalizeColorValue,
  normalizeLengthValue,
  normalizeFontValue,
  normalizeShadowValue,
  normalizeTokenValue,
  parseDesignContract,
  readDesignContract,
  hashContract,
  readTokenBaseline,
  resolveTokenBaseline,
  writeTokenBaseline,
  rewriteTokenBaselineMeta,
  lintTokenDrift,
  isSerifFallbackStack,
  lintKoreanTypography,
  lintStateContract,
  focusDemotion,
  unreadableStylesheetCount,
  summarizeRuleFailures,
  summarizeSeverity,
  actionableCount,
  RATCHETED_RULE_IDS,
};
