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

// ============================================
// 규칙 레지스트리 — knowledge/failure-rules.md와 1:1 대응
// ============================================

const RULES = {
  'DP-T001': { severity: 'MAJOR', title: 'border-radius가 디자인 계약 토큰 밖의 값' },
  'DP-T002': { severity: 'MAJOR', title: '색상이 디자인 계약 팔레트 밖의 값' },
  'DP-T003': { severity: 'MAJOR', title: 'spacing이 디자인 계약 스케일 밖의 값' },
  'DP-T004': { severity: 'HIGH', title: '폰트가 디자인 계약 타이포 밖의 값' },
  'DP-T005': { severity: 'MINOR', title: 'box-shadow가 디자인 계약 스케일 밖의 값' },
  'DP-K001': { severity: 'HIGH', title: '한글 텍스트에 serif fallback 폰트 스택' },
  'DP-K002': { severity: 'MEDIUM', title: '한글 문단에 word-break: keep-all 미설정' },
  'DP-K003': { severity: 'LOW', title: '한글 텍스트 자간(letter-spacing) 과다 축소' },
  'DP-S001': { severity: 'HIGH', title: 'disabled 요소가 opacity만으로 표현 (cursor: not-allowed 없음)' },
  'DP-S002': { severity: 'CRITICAL', title: '인터랙티브 요소에 포커스 표시 없음 (WCAG 2.4.7)' },
  'DP-S003': { severity: 'MEDIUM', title: '클릭 가능 요소에 cursor: pointer 미설정' },
};

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
    return { createdAt: raw.createdAt || null, values: out };
  } catch (_) {
    return null;
  }
}

function writeTokenBaseline(drift, cwd = process.cwd()) {
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
    note: '계약 도입 시점의 기존 위반값 — 이후 실행은 신규 위반만 차단한다. 재-baseline하려면 이 파일을 삭제.',
    values,
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
      severity: newViolations.length > 0 ? 'CRITICAL' : RULES[TOKEN_RULE[cat]].severity,
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
    capped: Object.keys(categories).filter(c => categories[c].capped),
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
      severity: RULES[id].severity,
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
//   scannedInteractive, focusMeasured,
//   disabled:  [{ selector, cursor, opacity }],
//   focusable: [{ selector, focusChanged }],
//   clickable: [{ selector, tag, cursor }]
// }
function lintStateContract(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return { enabled: false, reason: 'no state contract measurement' };
  }

  const hits = { 'DP-S001': [], 'DP-S002': [], 'DP-S003': [] };

  for (const d of (metrics.disabled || [])) {
    if (!d) continue;
    if (String(d.cursor || '').toLowerCase() !== 'not-allowed') {
      hits['DP-S001'].push({ selector: d.selector, detail: `cursor: ${d.cursor}, opacity: ${d.opacity}` });
    }
  }

  for (const f of (metrics.focusable || [])) {
    if (!f) continue;
    if (f.focusChanged === false) {
      hits['DP-S002'].push({ selector: f.selector, detail: 'focus 시 outline/box-shadow/border 변화 없음' });
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
      severity: RULES[id].severity,
      title: RULES[id].title,
      count: hits[id].length,
      samples: hits[id].slice(0, 5),
    });
  }

  return {
    enabled: true,
    scannedInteractive: metrics.scannedInteractive || 0,
    focusMeasured: metrics.focusMeasured || 0,
    findings,
  };
}

// ============================================
// 집계 — 규칙 ID 단위 평면 리스트 (리포트/게이트 소비용)
// ============================================

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MAJOR: 2, MEDIUM: 3, MINOR: 4, LOW: 5 };

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
    const sa = SEVERITY_ORDER[a.severity] != null ? SEVERITY_ORDER[a.severity] : 9;
    const sb = SEVERITY_ORDER[b.severity] != null ? SEVERITY_ORDER[b.severity] : 9;
    if (sa !== sb) return sa - sb;
    return (b.count || 0) - (a.count || 0);
  });
  return out;
}

module.exports = {
  RULES,
  TOKEN_RULE,
  TOKEN_CATEGORIES,
  normalizeColorValue,
  normalizeLengthValue,
  normalizeFontValue,
  normalizeShadowValue,
  normalizeTokenValue,
  parseDesignContract,
  readDesignContract,
  readTokenBaseline,
  writeTokenBaseline,
  lintTokenDrift,
  isSerifFallbackStack,
  lintKoreanTypography,
  lintStateContract,
  summarizeRuleFailures,
};
