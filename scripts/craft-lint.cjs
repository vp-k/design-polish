#!/usr/bin/env node
// craft-lint.cjs — 가독성(DP-R)과 AI 상투 패턴(DP-P) 순수 린트 (v2.8.0)
//
// 계측(page.evaluate)은 capture.cjs의 collectCraftMetrics, 판정은 이 파일의 순수 함수다.
// puppeteer 없이 단위 테스트가 가능하고 결정론적이다.
//
// 임계값은 pbakaus/impeccable(Apache-2.0)의 탐지 규칙에서 가져왔다. 코드는 옮기지 않고 새로 썼다.
// 원본은 훨씬 많은 예외 맥락을 다룬다. 여기서는 computed style로 판정 가능한 보수적 부분만 쓴다.
//
// 규칙 severity와 제목은 design-contract.cjs의 RULES가 단일 출처다.
// 전부 MEDIUM/LOW이며 점수에 들어가지 않는 보고 전용 규칙이다.

'use strict';

const { RULES, ruleSeverity } = require('./design-contract.cjs');

// ============================================
// 임계값
// ============================================

const THRESHOLDS = Object.freeze({
  lineMaxChars: 85,            // DP-R001: 한 줄 상한 (80 + 여유 5)
  lineMinTextChars: 80,        // DP-R001: 이보다 짧은 텍스트는 줄 길이를 보지 않는다
  lineMinLongLines: 2,         // DP-R001: 긴 줄이 이만큼 있어야 위반
  leadingMinRatio: 1.3,        // DP-R002
  leadingNormalRatio: 1.2,     // DP-R002: line-height: normal의 근사값
  leadingDisplayPx: 24,        // DP-R002: 이 크기 이상은 디스플레이 활자로 보고 면제
  boldWeight: 600,             // DP-R002: 굵은 두 줄 이하 제목형 텍스트 면제
  justifyMaxChars: 45,         // DP-R003: 이 이하 단을 좁은 단으로 본다
  justifyMinSpaceRatio: 0.03,  // DP-R003: 띄어쓰기 비율이 이보다 낮으면 CJK로 보고 면제
  capsMinChars: 80,            // DP-R004
  capsMinLatin: 40,            // DP-R004: 한글에는 대문자 변환이 적용되지 않는다
  trackingMaxEm: 0.05,         // DP-R005
  trackingMinChars: 20,        // DP-R005·DP-R006: 이 글자 수를 넘어야 본문으로 본다
  trackedLabelMaxChars: 40,    // DP-R005: 이 이하 대문자는 라벨로 보고 면제
  tinyTextPx: 12,              // DP-R006
  scaleMinPx: 8,               // DP-R008
  scaleMaxPx: 200,             // DP-R008
  scaleMinStep: 1.25,          // DP-R008
  scaleMinRoles: 3,            // DP-R008
  nearTieCountRatio: 0.75,     // DP-R008
  weightGap: 200,              // DP-R008: 굵기로 위계를 나누는지 판정
  weightSeparatedShare: 0.8,   // DP-R008
  gradientMinAlpha: 0.15,      // DP-P001
  stripeMinPx: 2,              // DP-P002
  roundedMinPx: 4,             // DP-P002·DP-P003
  stripeMinBoxPx: 20,          // DP-P002
  cardMinWidth: 80,            // DP-P003
  cardMinHeight: 48,           // DP-P003
  pageFrameShare: 0.9,         // DP-P003: 뷰포트 폭의 이 비율 이상인 박스는 페이지 틀
});

// DP-R006에서 보지 않는 태그 — 원래 작게 쓰는 자리
const TINY_SKIP_TAGS = new Set(['sub', 'sup', 'code', 'kbd', 'samp', 'var', 'caption', 'figcaption', 'small']);

// DP-P002에서 보지 않는 태그 — 한쪽 테두리가 관례인 요소. label은 넣지 않는다(카드형 라벨이 대표 사례).
const STRIPE_SAFE_TAGS = new Set(['blockquote', 'nav', 'a', 'input', 'select', 'textarea', 'button', 'hr', 'th', 'td', 'tr', 'table', 'li']);

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildFindings(order, hits, counts = {}) {
  const findings = [];
  for (const id of order) {
    const list = hits[id];
    if (!list || list.length === 0) continue;
    findings.push({
      id,
      severity: ruleSeverity(id),
      title: RULES[id].title,
      count: finite(counts[id]) ? counts[id] : list.length,
      samples: list.slice(0, 5),
    });
  }
  return findings;
}

// ============================================
// 줄 길이 추정
// ============================================

// 렌더된 글자 수를 줄 너비 비율로 각 줄에 나눈다.
// 글자 수를 세는 방식이라 한글(전각)과 라틴(반각)을 따로 다루지 않아도 된다.
// 너비 ÷ 평균 글자 폭(0.5em)으로 추정하면 한글이 두 배로 세어져 거짓 양성이 난다.
function estimateLineChars(chars, lineWidths) {
  if (!finite(chars) || chars <= 0 || !Array.isArray(lineWidths)) return [];
  const widths = lineWidths.filter(w => finite(w) && w > 0);
  const total = widths.reduce((a, w) => a + w, 0);
  if (total <= 0) return [];
  return widths.map(w => (chars * w) / total);
}

// ============================================
// DP-R008 타이포 위계
// ============================================

// entries: [{ role: 'h1'..'h6'|'body', size(px), weight, count }]
// 역할마다 가장 흔한 크기를 대표값으로 쓴다. 대표값이 모호한 역할은 판정에서 뺀다.
function analyzeTypeScale(entries) {
  const T = THRESHOLDS;
  const sizesByRole = new Map();
  const weightsByRole = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e.role !== 'string' || !finite(e.size)) continue;
    const size = Math.round(e.size * 10) / 10;
    if (size < T.scaleMinPx || size > T.scaleMaxPx) continue;
    const count = finite(e.count) && e.count > 0 ? e.count : 1;
    if (!sizesByRole.has(e.role)) sizesByRole.set(e.role, new Map());
    const m = sizesByRole.get(e.role);
    m.set(size, (m.get(size) || 0) + count);
    if (finite(e.weight)) {
      if (!weightsByRole.has(e.role)) weightsByRole.set(e.role, new Map());
      const w = weightsByRole.get(e.role);
      w.set(e.weight, (w.get(e.weight) || 0) + count);
    }
  }

  const roles = {};
  const dropped = [];
  for (const [role, m] of sizesByRole) {
    const ranked = Array.from(m.entries()).sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
    const [first, second] = ranked;
    if (second && second[1] === first[1]) {
      // 동률: h1은 큰 쪽(정렬상 first)을 쓰고, 다른 역할은 대표값을 정할 수 없어 뺀다
      if (role !== 'h1') { dropped.push({ role, reason: 'tie' }); continue; }
    } else if (second && role !== 'h1' && role !== 'body'
      && second[1] >= T.nearTieCountRatio * first[1] && second[0] >= T.scaleMinStep * first[0]) {
      dropped.push({ role, reason: 'near-tie' });
      continue;
    }
    roles[role] = first[0];
  }

  const result = { roles, dropped, steps: [], maxStep: null, flat: false, skipped: null, weightSeparated: false };
  if (finite(roles.h1) && finite(roles.body) && roles.h1 < roles.body) {
    result.skipped = 'h1 smaller than body';
    return result;
  }
  const sizes = Object.values(roles).sort((a, b) => b - a);
  if (sizes.length < T.scaleMinRoles) {
    result.skipped = `fewer than ${T.scaleMinRoles} roles`;
    return result;
  }
  for (let i = 0; i < sizes.length - 1; i++) {
    result.steps.push(round2(sizes[i] / sizes[i + 1]));
  }
  result.maxStep = Math.max(...result.steps);
  result.flat = result.maxStep < T.scaleMinStep;

  // 크기 대신 굵기로 위계를 나누는 디자인인가 — 그렇다면 평탄함은 권고(info)로 낮춘다
  const bodyWeights = weightsByRole.get('body');
  if (bodyWeights && bodyWeights.size > 0) {
    const bodyWeight = Array.from(bodyWeights.entries()).sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))[0][0];
    let headingTotal = 0;
    let heavier = 0;
    for (const [role, w] of weightsByRole) {
      if (!/^h[1-6]$/.test(role)) continue;
      for (const [weight, count] of w) {
        headingTotal += count;
        if (weight >= bodyWeight + T.weightGap) heavier += count;
      }
    }
    result.weightSeparated = headingTotal > 0 && heavier / headingTotal >= T.weightSeparatedShare;
  }
  return result;
}

// ============================================
// 린트 4: 가독성 (DP-R001~R008)
// ============================================

// metrics: {
//   scanned, capped,
//   text: [{ selector, tag, chars, spaces, latin, fontSize, lineHeightPx(null=normal), letterSpacingPx,
//            fontWeight, textTransform, textAlign, hyphens, lineWidths[], heading,
//            codeContext, uiContext, finePrint, monoPre }],
//   headings: [{ level, selector, inFooter }]   // 문서 순서
//   typeScale: [{ role, size, weight, count }]
// }
function lintReadability(metrics) {
  if (!metrics || !Array.isArray(metrics.text)) {
    return { enabled: false, reason: 'no readability measurement' };
  }
  const T = THRESHOLDS;
  const order = ['DP-R001', 'DP-R002', 'DP-R003', 'DP-R004', 'DP-R005', 'DP-R006', 'DP-R007', 'DP-R008'];
  const hits = {};
  for (const id of order) hits[id] = [];
  const info = [];

  for (const t of metrics.text) {
    if (!t || !finite(t.chars) || !finite(t.fontSize) || t.fontSize <= 0) continue;
    const upper = String(t.textTransform || '').toLowerCase() === 'uppercase';
    const lines = Array.isArray(t.lineWidths) ? t.lineWidths.length : 0;
    const perLine = estimateLineChars(t.chars, t.lineWidths);
    const maxPerLine = perLine.length ? Math.max(...perLine) : 0;
    const sel = t.selector || t.tag || '?';
    if (t.codeContext) continue;  // 코드·터미널·목업은 본문 규칙의 대상이 아니다

    // DP-R001 줄 길이
    if (t.chars > T.lineMinTextChars) {
      const longLines = perLine.filter(c => c > T.lineMaxChars).length;
      if (longLines >= T.lineMinLongLines) {
        hits['DP-R001'].push({ selector: sel, detail: `약 ${Math.round(maxPerLine)}자/줄 (${longLines}줄이 ${T.lineMaxChars}자 초과)` });
      }
    }

    // DP-R002 행간 — 여러 줄로 감기는 본문만
    const ratio = finite(t.lineHeightPx) && t.lineHeightPx > 0 ? t.lineHeightPx / t.fontSize : T.leadingNormalRatio;
    const capsLabel = upper && t.chars <= T.trackedLabelMaxChars;
    const boldTitle = finite(t.fontWeight) && t.fontWeight >= T.boldWeight && lines <= 2;
    if (lines >= 2 && !t.heading && t.fontSize < T.leadingDisplayPx && !capsLabel && !boldTitle
      && ratio < T.leadingMinRatio) {
      hits['DP-R002'].push({ selector: sel, detail: `line-height ${round2(ratio)}x (need >=${T.leadingMinRatio})` });
    }

    // DP-R003 좁은 단의 양쪽 정렬
    const spaceRatio = finite(t.spaces) && t.chars > 0 ? t.spaces / t.chars : 0;
    if (String(t.textAlign || '').toLowerCase() === 'justify'
      && String(t.hyphens || '').toLowerCase() !== 'auto'
      && lines >= 2 && maxPerLine > 0 && maxPerLine <= T.justifyMaxChars
      && spaceRatio >= T.justifyMinSpaceRatio) {
      hits['DP-R003'].push({ selector: sel, detail: `약 ${Math.round(maxPerLine)}자/줄, hyphens: ${t.hyphens || 'manual'}` });
    }

    // DP-R004 긴 대문자 본문
    if (upper && !t.heading && t.chars >= T.capsMinChars && finite(t.latin) && t.latin >= T.capsMinLatin) {
      hits['DP-R004'].push({ selector: sel, detail: `${t.chars}자 uppercase` });
    }

    // DP-R005 넓은 자간
    const em = finite(t.letterSpacingPx) ? t.letterSpacingPx / t.fontSize : 0;
    if (t.chars > T.trackingMinChars && em > T.trackingMaxEm && !capsLabel) {
      hits['DP-R005'].push({ selector: sel, detail: `letter-spacing ${round2(em)}em` });
    }

    // DP-R006 작은 글자
    const tag = String(t.tag || '').toLowerCase();
    if (t.chars > T.trackingMinChars && t.fontSize < T.tinyTextPx
      && !TINY_SKIP_TAGS.has(tag) && !t.uiContext && !t.finePrint && !upper && !t.monoPre) {
      hits['DP-R006'].push({ selector: sel, detail: `${round2(t.fontSize)}px` });
    }
  }

  // DP-R007 제목 단계 건너뜀
  let prev = 0;
  for (const h of Array.isArray(metrics.headings) ? metrics.headings : []) {
    if (!h || !finite(h.level)) continue;
    if (prev > 0 && h.level > prev + 1 && !h.inFooter) {
      hits['DP-R007'].push({ selector: h.selector || `h${h.level}`, detail: `h${prev} → h${h.level}` });
    }
    prev = h.level;
  }

  // DP-R008 평탄한 위계 — 페이지 단위 1건
  const scale = analyzeTypeScale(metrics.typeScale);
  if (scale.flat) {
    const sample = {
      selector: 'page',
      detail: Object.entries(scale.roles).sort((a, b) => b[1] - a[1]).map(([r, s]) => `${r} ${s}px`).join(' / ')
        + ` (최대 비율 ${scale.maxStep})`,
    };
    if (scale.weightSeparated) {
      info.push({ id: 'DP-R008', ...sample, reason: '제목이 굵기로 구분됨 — 크기 위계 평탄은 권고로 강등' });
    } else {
      hits['DP-R008'].push(sample);
    }
  }

  return {
    enabled: true,
    scanned: metrics.scanned || 0,
    textSamples: metrics.text.length,
    measurement: metrics.capped ? 'incomplete' : 'complete',
    typeScale: scale,
    findings: buildFindings(order, hits),
    info,
  };
}

// ============================================
// 린트 5: AI 상투 패턴 (DP-P001~P004)
// ============================================

// 그라디언트 색 정지점 중 가장 큰 알파. computed style은 rgb()/rgba()로 정규화되어 온다.
function gradientMaxAlpha(backgroundImage) {
  const s = String(backgroundImage || '');
  if (!/gradient\(/i.test(s)) return null;
  let max = null;
  const re = /rgba?\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    let a = 1;
    if (parts.length >= 4) {
      const raw = parts[3];
      a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
      if (!finite(a)) a = 1;
    }
    max = max == null ? a : Math.max(max, a);
  }
  // 색을 읽지 못한 그라디언트(이름 색 등)는 보이는 것으로 본다
  return max == null ? 1 : max;
}

// cubic-bezier의 y 제어점이 1을 넘으면 목표를 지나쳤다 돌아오는 바운스다.
function isBounceEasing(value) {
  const s = String(value || '');
  const re = /cubic-bezier\(\s*([^)]*)\)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = m[1].split(',').map(x => parseFloat(x));
    if (n.length === 4 && n.every(finite) && (n[1] > 1 || n[3] > 1)) return true;
  }
  return false;
}

const BOUNCE_NAME_RE = /bounce|elastic/i;

// 줄무늬가 닿지 않는 두 모서리. radii 순서: [tl, tr, br, bl], 면 순서: [top, right, bottom, left]
function cornersAwayFrom(side, radii) {
  const r = (i) => (finite(radii[i]) ? radii[i] : 0);
  switch (side) {
    case 0: return [r(3), r(2)];
    case 1: return [r(0), r(3)];
    case 2: return [r(0), r(1)];
    default: return [r(1), r(2)];
  }
}

const SIDE_NAMES = ['top', 'right', 'bottom', 'left'];

function stripeSide(b) {
  const T = THRESHOLDS;
  if (!b || !Array.isArray(b.widths) || b.widths.length !== 4) return -1;
  if (!finite(b.width) || !finite(b.height) || b.width < T.stripeMinBoxPx || b.height < T.stripeMinBoxPx) return -1;
  if (b.stateMarked || STRIPE_SAFE_TAGS.has(String(b.tag || '').toLowerCase())) return -1;
  const visible = Array.isArray(b.colorsVisible) ? b.colorsVisible : [true, true, true, true];
  let side = -1;
  for (let i = 0; i < 4; i++) {
    const w = finite(b.widths[i]) ? b.widths[i] : 0;
    if (w < T.stripeMinPx || !visible[i]) continue;
    const others = b.widths.filter((_, j) => j !== i).map(x => (finite(x) ? x : 0));
    if (others.every(o => o <= w / 2)) { side = i; break; }
  }
  if (side < 0) return -1;
  const [a, c] = cornersAwayFrom(side, Array.isArray(b.radii) ? b.radii : []);
  return a >= T.roundedMinPx && c >= T.roundedMinPx ? side : -1;
}

function isCardBox(b) {
  const T = THRESHOLDS;
  if (!b || b.interactive || b.popup) return false;
  if (!finite(b.width) || !finite(b.height) || b.width < T.cardMinWidth || b.height < T.cardMinHeight) return false;
  const painted = (b.edgeSides || 0) >= 3 || b.fillDiffers || b.shadow;
  const shaped = (finite(b.radius) && b.radius >= T.roundedMinPx) || b.shadow;
  return Boolean(painted && shaped);
}

// metrics: {
//   scanned, capped, viewportWidth,
//   gradientText: [{ selector, backgroundImage }],          // background-clip: text 이고 글자가 있는 요소
//   borders: [{ selector, tag, width, height, widths[4], colorsVisible[4], radii[4], stateMarked }],
//   boxes: [{ selector, tag, ancestor(boxes 인덱스|-1), width, height, edgeSides, shadow, fillDiffers,
//             radius, interactive, popup }],
//   motion: [{ value, count, sample }],                       // transition/animation-timing-function 분포
//   animations: [{ value, count, sample }]                    // animation-name 분포
// }
function lintSlopPatterns(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return { enabled: false, reason: 'no pattern measurement' };
  }
  const T = THRESHOLDS;
  const order = ['DP-P001', 'DP-P002', 'DP-P003', 'DP-P004'];
  const hits = {};
  const counts = {};
  for (const id of order) hits[id] = [];

  for (const g of Array.isArray(metrics.gradientText) ? metrics.gradientText : []) {
    const a = gradientMaxAlpha(g && g.backgroundImage);
    if (a != null && a >= T.gradientMinAlpha) {
      hits['DP-P001'].push({ selector: g.selector, detail: String(g.backgroundImage).slice(0, 80) });
    }
  }

  for (const b of Array.isArray(metrics.borders) ? metrics.borders : []) {
    const side = stripeSide(b);
    if (side >= 0) {
      hits['DP-P002'].push({ selector: b.selector, detail: `border-${SIDE_NAMES[side]}: ${b.widths[side]}px` });
    }
  }

  const boxes = Array.isArray(metrics.boxes) ? metrics.boxes : [];
  const viewport = finite(metrics.viewportWidth) && metrics.viewportWidth > 0 ? metrics.viewportWidth : null;
  const cardIdx = boxes.map(b => isCardBox(b) && !(viewport && b.width >= T.pageFrameShare * viewport));
  boxes.forEach((b, i) => {
    if (!cardIdx[i]) return;
    if (!((b.edgeSides || 0) >= 1 || b.shadow)) return;  // 안쪽 카드는 테두리나 그림자가 보여야 한다
    let a = finite(b.ancestor) ? b.ancestor : -1;
    let guard = 0;
    while (a >= 0 && a < boxes.length && guard++ < boxes.length) {
      if (cardIdx[a]) {
        hits['DP-P003'].push({ selector: b.selector, detail: `inside ${boxes[a].selector}` });
        return;
      }
      a = finite(boxes[a].ancestor) ? boxes[a].ancestor : -1;
    }
  });

  let bounceCount = 0;
  for (const m of Array.isArray(metrics.motion) ? metrics.motion : []) {
    if (m && isBounceEasing(m.value)) {
      hits['DP-P004'].push({ selector: m.sample, detail: m.value });
      bounceCount += finite(m.count) ? m.count : 1;
    }
  }
  for (const m of Array.isArray(metrics.animations) ? metrics.animations : []) {
    if (m && BOUNCE_NAME_RE.test(String(m.value || ''))) {
      hits['DP-P004'].push({ selector: m.sample, detail: `animation-name: ${m.value}` });
      bounceCount += finite(m.count) ? m.count : 1;
    }
  }
  if (bounceCount > 0) counts['DP-P004'] = bounceCount;

  return {
    enabled: true,
    scanned: metrics.scanned || 0,
    measurement: metrics.capped ? 'incomplete' : 'complete',
    findings: buildFindings(order, hits, counts),
  };
}

module.exports = {
  THRESHOLDS,
  estimateLineChars,
  analyzeTypeScale,
  lintReadability,
  gradientMaxAlpha,
  isBounceEasing,
  isCardBox,
  lintSlopPatterns,
};
