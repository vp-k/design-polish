#!/usr/bin/env node
// design-polish plugin - capture script with WCAG accessibility checks
//
// Measurement engine:
//   - WCAG (axe-core): desktop + mobile viewport
//   - Console/page errors
//   - Style consistency (rendered-DOM computed-style distribution → styleFit score)
//   - Performance (Navigation/Paint/Resource timing → performance score)
//   - Touch-target audit (mobile viewport, interactive elements < 44x44)
//   - Token drift vs design contract (.design-polish/design-decisions.json, ratcheted)
//   - Korean typography rules (serif fallback / keep-all / tracking)
//   - Component state contract (disabled / focus visibility / pointer)
//   - Design Health Score (0-100) with regression + append-only history
//
// 스코어 산출은 브라우저 계측(collect*)과 순수 함수(score*)로 분리되어 있어,
// 순수 함수는 puppeteer 없이 단위 테스트가 가능하다 (tests/scoring.test.cjs).

const fs = require('fs');
const path = require('path');
const contractLib = require('./design-contract.cjs');
const craftLib = require('./craft-lint.cjs');

// ============================================
// 유틸리티
// ============================================

// 라우트 경로를 안전한 파일명으로 변환 (path traversal 방지)
function sanitizeRouteName(route) {
  const name = route === '/' ? 'main' : route.slice(1);
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// 파일 저장 전 경로 이탈 방지 검증
function validatePathWithinDir(filepath, baseDir) {
  const resolved = path.resolve(filepath);
  const base = path.resolve(baseDir) + path.sep;
  if (!resolved.startsWith(base) && resolved !== path.resolve(baseDir)) {
    throw new Error(`Path escapes base directory: ${filepath}`);
  }
}

// ============================================
// 설정
// ============================================

// 환경변수 정수 파싱 — 0을 기본값으로 되돌리지 않는다.
function intEnv(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const CONFIG = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  outputDir: process.env.OUTPUT_DIR || path.join(process.cwd(), '.design-polish', 'screenshots'),
  accessibilityDir: process.env.A11Y_DIR || path.join(process.cwd(), '.design-polish', 'accessibility'),
  viewport: { width: 1280, height: 720 },
  // Responsive viewport 설정
  viewports: [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 720 },
  ],
  mobileViewport: { width: 375, height: 812 },
  // `||`를 쓰면 WAIT_TIME=0 / RETRIES=0 같은 정당한 0이 falsy로 걸러져 기본값으로 되돌아간다.
  // 숫자로 파싱된 값이 있으면 그 값을 쓰고, 파싱 실패(NaN)일 때만 기본값을 쓴다.
  waitTime: Math.max(0, intEnv(process.env.WAIT_TIME, 2000)),
  timeout: Math.max(1, intEnv(process.env.TIMEOUT, 30000)),
  retries: Math.max(0, intEnv(process.env.RETRIES, 2)),
  fullPage: process.env.FULL_PAGE === 'true',
};

// ============================================
// 순수 스코어러 (브라우저 불필요 — 단위 테스트 대상)
// ============================================

// 일관성 스코어 (styleFit, 0-15).
//
// 두 가지 모드로 동작한다:
//   - contract: `.design-polish/design-decisions.json`이 있으면 **허용 토큰 집합 밖의 값**을
//     감점한다. "근거 없는 값"이 취향 차이가 아니라 계약 위반으로 판정된다.
//     브라운필드 데드락을 막기 위해 ratchet 적용 — 계약 도입 시점의 기존 위반(baseline)은
//     소폭 감점, 그 이후 새로 생긴 값(newViolations)만 강하게 감점한다.
//   - heuristic: 계약이 없으면 distinct 값 난립 개수로 감점(기존 동작, 하위호환).
//
// styleFit 만점.
const STYLE_FIT_MAX = 15;

// 계약 감점 정책 — 신규 위반과 baseline 잔여를 **각각** 상한으로 묶는다.
//   기존에는 총합만 15로 잘려서, 신규 위반이 0건이어도 기존 부채 150건이면
//   150*0.1 = 15점이 통째로 날아가 래칫(기존 부채는 동결) 취지가 무력화됐다.
//   잔여는 최대 -3(부채가 아무리 많아도 "약간의 상수 압력"), 신규는 최대 -12.
const CONTRACT_PENALTY = {
  perNewViolation: 2,
  perBaselineViolation: 0.1,
  maxNew: 12,
  maxBaseline: 3,
};

// 순수 함수 — drift.categories만 받아 감점을 계산한다(브라우저·파일 IO 없음).
function scoreTokenDriftPenalty(categories, policy = CONTRACT_PENALTY) {
  const detail = {};
  let rawNew = 0;
  let rawBaseline = 0;
  for (const [cat, r] of Object.entries(categories || {})) {
    const total = Math.max(0, r.violationCount || 0);
    const nv = Math.max(0, r.newViolationCount || 0);
    const baselineCount = Math.max(0, total - nv);
    const np = nv * policy.perNewViolation;
    const bp = baselineCount * policy.perBaselineViolation;
    detail[cat] = {
      rule: r.rule,
      decision: r.decision,
      violations: total,
      newViolations: nv,
      baselineViolations: baselineCount,
      newPenalty: Math.round(np * 100) / 100,
      baselinePenalty: Math.round(bp * 100) / 100,
      penalty: Math.round((np + bp) * 100) / 100,
    };
    rawNew += np;
    rawBaseline += bp;
  }
  const newPenalty = Math.min(policy.maxNew, rawNew);
  const baselinePenalty = Math.min(policy.maxBaseline, rawBaseline);
  const round = v => Math.round(v * 100) / 100;
  return {
    detail,
    newPenalty: round(newPenalty),
    baselinePenalty: round(baselinePenalty),
    rawNewPenalty: round(rawNew),
    rawBaselinePenalty: round(rawBaseline),
    newCapped: rawNew > policy.maxNew,
    baselineCapped: rawBaseline > policy.maxBaseline,
    penalty: round(Math.min(STYLE_FIT_MAX, newPenalty + baselinePenalty)),
  };
}

// 임계값은 휴리스틱이며 조정 가능 (tunable). sampled 부족 시 만점 방지.
function scoreConsistency(m, drift) {
  const detail = {};
  if (!m || !m.sampled || m.sampled < 10) {
    // 측정 표본 부족 — 빈/오류 페이지가 '일관적'으로 만점을 얻는 것을 방지.
    return { score: 7, insufficient: true, sampled: (m && m.sampled) || 0, mode: 'insufficient', detail };
  }

  // ── contract 모드 ──
  if (drift && drift.enabled) {
    const pen = scoreTokenDriftPenalty(drift.categories);
    const cScore = Math.max(0, Math.min(STYLE_FIT_MAX, STYLE_FIT_MAX - pen.penalty));
    return {
      score: Math.round(cScore * 100) / 100,
      insufficient: false,
      sampled: m.sampled,
      mode: 'contract',
      hasBaseline: !!drift.hasBaseline,
      totalViolations: drift.totalViolations || 0,
      newViolationCount: drift.newViolationCount || 0,
      // 계측이 값 상한(200종)에 걸렸으면 위반 수는 하한값일 뿐이다 — 점수를 완전 계측인 양 읽지 않도록 표시.
      measurement: drift.measurement || 'complete',
      penalty: pen,
      detail: pen.detail,
    };
  }

  // ── heuristic 모드 (계약 없음) ──
  let penalty = 0;
  const add = (name, count, healthy, weight) => {
    const over = Math.max(0, count - healthy);
    const p = over * weight;
    detail[name] = { count, healthy, penalty: Math.round(p * 100) / 100 };
    penalty += p;
  };
  add('fontFamily', m.fontFamilyCount || 0, 3, 1.5);
  add('borderRadius', m.borderRadiusCount || 0, 5, 0.5);
  add('color', m.colorCount || 0, 24, 0.2);
  add('spacing', m.spacingCount || 0, 12, 0.3);
  add('shadow', m.shadowCount || 0, 6, 0.5);
  const score = Math.max(0, Math.min(STYLE_FIT_MAX, STYLE_FIT_MAX - penalty));
  return { score: Math.round(score * 100) / 100, insufficient: false, sampled: m.sampled, mode: 'heuristic', detail };
}

// 성능 스코어 (0-15). Puppeteer navigation/paint/resource timing 기반.
function scorePerformance(p) {
  if (!p) return { score: 7, insufficient: true, detail: {} };
  const detail = {};
  let penalty = 0;

  // FCP: <=1800ms 양호, ~3000ms 보통, >3000ms 나쁨 (최대 -8)
  if (p.fcp == null) {
    penalty += 5; // 측정 실패 — 만점 방지
    detail.fcp = { value: null, penalty: 5 };
  } else {
    let fp = 0;
    if (p.fcp > 1800) fp = p.fcp <= 3000 ? ((p.fcp - 1800) / 1200) * 4 : 4 + Math.min(4, ((p.fcp - 3000) / 2000) * 4);
    detail.fcp = { value: p.fcp, penalty: Math.round(fp * 100) / 100 };
    penalty += fp;
  }

  // 요청 수: >50개부터 감점 (최대 -4)
  const rc = p.requestCount || 0;
  const rp = Math.min(4, Math.max(0, rc - 50) * 0.05);
  detail.requestCount = { value: rc, penalty: Math.round(rp * 100) / 100 };
  penalty += rp;

  // 전송량: >1.5MB부터 감점 (최대 -4). localhost/캐시로 0이면 감점 없음.
  const mb = (p.transferBytes || 0) / (1024 * 1024);
  const bp = Math.min(4, Math.max(0, mb - 1.5) * 1.5);
  detail.transferBytes = { value: p.transferBytes || 0, penalty: Math.round(bp * 100) / 100 };
  penalty += bp;

  const score = Math.max(0, Math.min(15, 15 - penalty));
  return { score: Math.round(score * 100) / 100, insufficient: false, detail };
}

// Design Health Score (가중 0-100).
// styleScore/perfScore는 collect* 계측을 score*로 환산한 값 (0-15). 미제공 시 측정 미수행으로 간주.
function calculateDesignHealthScore(wcagReport, consoleErrors, pageErrors, styleScore, perfScore) {
  const breakdown = {};

  // WCAG Critical: 30% / Serious: 20%
  if (wcagReport) {
    const criticalViolations = wcagReport.violations.filter(v => v.impact === 'critical').length;
    const seriousViolations = wcagReport.violations.filter(v => v.impact === 'serious').length;
    breakdown.wcagCritical = Math.max(0, 30 - (criticalViolations * 10));
    breakdown.wcagSerious = Math.max(0, 20 - (seriousViolations * 5));
  } else {
    // WCAG 데이터 없음 — 검사 미수행이므로 0점 (만점 부여 방지)
    breakdown.wcagCritical = 0;
    breakdown.wcagSerious = 0;
  }

  // Console errors: 20%
  const errorCount = (consoleErrors || []).filter(e => e.type === 'error').length + (pageErrors || []).length;
  breakdown.consoleErrors = Math.max(0, 20 - (errorCount * 5));

  // Style fit: 15% — 실측 일관성 스코어 (미제공/NaN 시 미측정 → 0)
  breakdown.styleFit = Number.isFinite(styleScore) ? Math.max(0, Math.min(15, styleScore)) : 0;

  // Performance: 15% — 실측 성능 스코어 (미제공/NaN 시 미측정 → 0)
  breakdown.performance = Number.isFinite(perfScore) ? Math.max(0, Math.min(15, perfScore)) : 0;

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}

// ============================================
// 의존성 로드
// ============================================

let puppeteer;
let AxePuppeteer;

function loadDeps() {
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    console.error('Puppeteer not found. Run: npm install');
    process.exit(1);
  }

  try {
    AxePuppeteer = require('@axe-core/puppeteer').AxePuppeteer;
  } catch (e) {
    console.warn('axe-core/puppeteer not found. WCAG checks will be skipped.');
    AxePuppeteer = null;
  }
}

// ============================================
// 유틸리티 함수
// ============================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, retries = CONFIG.retries) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries) throw error;
      console.log(`Retry ${i + 1}/${retries}...`);
      await sleep(1000);
    }
  }
}

// 프로브 타임아웃 — 캡처 타임아웃(CONFIG.timeout)에서 파생한다.
// 5s 고정이면 느리게 뜨는 개발 서버(TIMEOUT=60000으로 올려 둔 프로젝트)가 "죽었다"로 오판되고,
// 반대로 CONFIG.timeout을 그대로 쓰면 프로브 한 바퀴가 캡처보다 오래 걸린다. 상한을 둔다.
const PROBE_TIMEOUT_MAX = 15000;

function probeTimeout() {
  return Math.max(1, Math.min(CONFIG.timeout, PROBE_TIMEOUT_MAX));
}

// 서버/라우트 도달성 프로브.
// 반환: { ok, status, error }  error는 'ECONNREFUSED' | 'TIMEOUT' | 'NETWORK' | null
async function checkServer(url, timeoutMs = probeTimeout()) {
  const http = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume(); // 소켓 반환 (본문은 필요 없음)
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      resolve({ ok, status: res.statusCode, error: null });
    });
    req.on('error', (e) => {
      const code = (e && e.code) || 'NETWORK';
      resolve({ ok: false, status: 0, error: code });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'TIMEOUT' });
    });
  });
}

// 프로브 결과 → 서버/라우트 판정. **순수 함수**(네트워크·시계 없음)라 단위 테스트가 된다.
//
// status:
//   reachable            — 하나 이상이 실제로 응답했다. 서버는 살아 있다.
//   down                 — 응답이 0건이고 ECONNREFUSED가 하나라도 있다 → 서버 미기동.
//                          **이때만** 즉시 중단한다.
//   unreachable(timeout) — 응답이 0건인데 전부 TIMEOUT이다. 연결이 거부된 적이 없으므로
//                          "서버가 없다"는 증거가 아니다(느린 기동·방화벽·프록시). 중단하지 않고
//                          캡처를 시도해 라우트별 실패로 정직하게 남긴다.
//                          (예전에는 `probes.every(p => p.error !== null)`이라 전부 TIMEOUT도
//                           SERVER_DOWN으로 단정하고 exit 1 했다.)
//   unreachable          — 응답 0건 + 그 밖의 연결 오류(ENOTFOUND 등)가 섞여 있다.
//
// 라우트 분류:
//   reachable[] — 2xx/3xx. 캡처 대상.
//   attempt[]   — 프로브가 답을 못 받았지만 서버가 죽었다고 단정할 수 없는 라우트(TIMEOUT 등).
//                 캡처를 시도한다(puppeteer는 CONFIG.timeout으로 더 오래 기다린다).
//   skipped[]   — 서버가 4xx/5xx로 답했거나 연결이 거부된 라우트. 시도하지 않는다.
function classifyProbes(probes) {
  const list = (Array.isArray(probes) ? probes : []).filter(Boolean);
  const responded = list.filter(p => !p.error);
  const refused = list.filter(p => p.error === 'ECONNREFUSED');
  const timedOut = list.filter(p => p.error === 'TIMEOUT');

  let status = 'unknown';
  let downReason = null;
  if (list.length === 0) {
    status = 'unknown';
  } else if (responded.length > 0) {
    status = 'reachable';
  } else if (refused.length > 0) {
    status = 'down';
    downReason = 'ECONNREFUSED';
  } else if (timedOut.length === list.length) {
    status = 'unreachable(timeout)';
  } else {
    status = 'unreachable';
  }

  const reachable = [];
  const attempt = [];
  const skipped = [];
  for (const p of list) {
    if (!p.error) {
      if (p.ok) reachable.push(p.route);
      else skipped.push({ route: p.route, reason: `HTTP ${p.status}`, status: p.status });
      continue;
    }
    if (p.error === 'ECONNREFUSED') {
      skipped.push({ route: p.route, reason: 'connection ECONNREFUSED', status: 0 });
      continue;
    }
    attempt.push({ route: p.route, reason: `connection ${p.error}` });
  }

  return {
    status,
    down: status === 'down',
    downReason,
    probes: list,
    reachable,
    attempt,
    skipped,
  };
}

// 대상 라우트를 전부 프로브해 "서버가 안 떠 있다"와 "그 라우트가 404다"를 구분한다.
// 루트(/)가 404인 SPA/서브패스 앱에서 전체 캡처가 통째로 중단되던 문제(총체적 abort)를 없앤다.
// 판정은 classifyProbes(순수 함수)가 한다 — 여기서는 IO만 한다.
async function probeTargets(baseUrl, routes) {
  const list = (Array.isArray(routes) && routes.length > 0) ? routes : ['/'];
  const probes = [];
  for (const route of list) {
    const r = await checkServer(baseUrl + route);
    probes.push({ route, status: r.status, ok: r.ok, error: r.error });
    // 연결 거부는 라우트가 아니라 서버의 상태다. **아직 아무 라우트도 응답하지 않은 상태에서**
    // 연결이 거부되면 나머지 라우트도 같은 소켓에 같은 답을 받을 뿐이므로 즉시 단락한다.
    // (이미 응답한 라우트가 있으면 서버는 살아 있는 것이므로 나머지도 끝까지 프로브한다.)
    if (r.error === 'ECONNREFUSED' && probes.every(p => p.error === 'ECONNREFUSED')) break;
  }
  return classifyProbes(probes);
}

// ============================================
// WCAG 접근성 체크
// ============================================

async function runAccessibilityCheck(page, url) {
  if (!AxePuppeteer) {
    return null;
  }

  try {
    const results = await new AxePuppeteer(page)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    return {
      timestamp: new Date().toISOString(),
      url,
      summary: {
        violations: results.violations.length,
        passes: results.passes.length,
        incomplete: results.incomplete.length
      },
      violations: results.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map(n => ({
          target: n.target,
          html: n.html.substring(0, 200),
          failureSummary: n.failureSummary
        }))
      })),
      incomplete: results.incomplete.map(i => ({
        id: i.id,
        impact: i.impact,
        description: i.description
      }))
    };
  } catch (error) {
    console.error(`WCAG check failed: ${error.message}`);
    return null;
  }
}

function saveAccessibilityReport(report, filename = 'wcag-report.json') {
  if (!report) return;

  ensureDir(CONFIG.accessibilityDir);
  const filepath = path.join(CONFIG.accessibilityDir, filename);
  validatePathWithinDir(filepath, CONFIG.accessibilityDir);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`WCAG report saved: ${filename}`);
}

// ============================================
// 브라우저 계측 (collect*) — page.evaluate 기반
// ============================================

// 렌더된 DOM의 computed-style 분포를 수집 → 일관성 원자료.
// 프레임워크 무관 (Tailwind/CSS Modules/styled-components 모두 렌더 결과는 동일).
async function collectStyleMetrics(page) {
  try {
    return await page.evaluate(() => {
      // 값 → { count, sample } 누적. 계약 위반을 코드에서 찾을 수 있도록 셀렉터 표본을 함께 남긴다.
      const cssPath = (el) => {
        if (!el || !el.tagName) return '';
        const parts = [];
        let node = el;
        let depth = 0;
        while (node && node.nodeType === 1 && depth < 4) {
          let seg = node.tagName.toLowerCase();
          if (node.id) { parts.unshift(`${seg}#${node.id}`); break; }
          const cls = (typeof node.className === 'string' ? node.className : '')
            .trim().split(/\s+/).filter(Boolean).slice(0, 2);
          if (cls.length) seg += '.' + cls.join('.');
          parts.unshift(seg);
          node = node.parentElement;
          depth++;
        }
        return parts.join(' > ').slice(0, 120);
      };

      const buckets = {
        borderRadius: new Map(), fontFamily: new Map(), color: new Map(),
        spacing: new Map(), shadow: new Map(),
      };
      const capped = {};
      const bump = (cat, value, el) => {
        const m = buckets[cat];
        const cur = m.get(value);
        if (cur) { cur.count++; return; }
        if (m.size >= 200) { capped[cat] = true; return; } // 폭주 방지 캡 (도달 사실을 린트에 전달)
        m.set(value, { count: 1, sample: cssPath(el) });
      };

      const els = Array.from(document.querySelectorAll('body *'));
      let sampled = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // 숨김/미표시 제외
        const cs = getComputedStyle(el);
        sampled++;
        // border-radius: 네 모서리가 다를 수 있으나 실무상 top-left가 대표값이다(성능 대비 정보량).
        const br = cs.borderTopLeftRadius;
        if (br && br !== '0px') bump('borderRadius', br, el);
        if (cs.fontFamily) bump('fontFamily', cs.fontFamily.split(',')[0].trim().toLowerCase().replace(/["']/g, ''), el);
        // 색: 전경 / 배경 / 테두리. DP-T002가 'color/background/border'를 규정하므로 border-color도 실측한다.
        // (테두리 폭이 0이면 border-color는 화면에 나타나지 않으므로 세지 않는다 — 거짓 위반 방지)
        if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') bump('color', cs.color, el);
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump('color', cs.backgroundColor, el);
        const borderSides = [
          [cs.borderTopWidth, cs.borderTopColor],
          [cs.borderRightWidth, cs.borderRightColor],
          [cs.borderBottomWidth, cs.borderBottomColor],
          [cs.borderLeftWidth, cs.borderLeftColor],
        ];
        for (const [w, c] of borderSides) {
          if (!w || w === '0px' || !c || c === 'rgba(0, 0, 0, 0)') continue;
          bump('color', c, el);
        }
        // spacing: 네 방향 전부. right/bottom을 빼면 비대칭 여백(예: padding-right: 13px)이 통과했다.
        // 값은 Map으로 dedupe되므로 200종 캡에 대한 압력은 '방향 수'가 아니라 '서로 다른 값의 수'에 비례한다.
        for (const p of [
          cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft,
          cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft,
          cs.rowGap, cs.columnGap,
        ]) {
          if (p && p !== '0px' && p !== 'normal' && p !== 'auto') bump('spacing', p, el);
        }
        if (cs.boxShadow && cs.boxShadow !== 'none') bump('shadow', cs.boxShadow, el);
      }

      const values = {};
      for (const [cat, m] of Object.entries(buckets)) {
        values[cat] = Array.from(m.entries())
          .map(([value, v]) => ({ value, count: v.count, sample: v.sample }))
          .sort((a, b) => b.count - a.count);
      }

      return {
        sampled,
        borderRadiusCount: buckets.borderRadius.size,
        fontFamilyCount: buckets.fontFamily.size,
        colorCount: buckets.color.size,
        spacingCount: buckets.spacing.size,
        shadowCount: buckets.shadow.size,
        fontFamilies: values.fontFamily.slice(0, 20).map(v => v.value),
        borderRadiusValues: values.borderRadius.slice(0, 20).map(v => v.value),
        values,
        capped,
      };
    });
  } catch (error) {
    console.error(`Style metrics failed: ${error.message}`);
    return null;
  }
}

// Navigation/Paint/Resource timing 수집 → 성능 원자료.
async function collectPerfMetrics(page) {
  try {
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint') || [];
      const fcpEntry = paints.find(p => p.name === 'first-contentful-paint');
      const res = performance.getEntriesByType('resource') || [];
      let bytes = 0;
      for (const r of res) bytes += (r.transferSize || 0);
      return {
        fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
        domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
        load: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        requestCount: res.length,
        transferBytes: bytes,
      };
    });
  } catch (error) {
    console.error(`Perf metrics failed: ${error.message}`);
    return null;
  }
}

// 모바일 뷰포트 터치 타겟 감사 (WCAG 2.5.5 / 2.1 AA 44x44px).
async function collectTouchTargets(page) {
  try {
    return await page.evaluate(() => {
      const sel = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex="-1"])';
      const els = Array.from(document.querySelectorAll(sel));
      const small = [];
      let visible = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        visible++;
        if (r.width < 44 || r.height < 44) {
          small.push({
            tag: el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            text: (el.textContent || '').trim().slice(0, 40),
          });
        }
      }
      return { totalInteractive: visible, undersized: small.length, samples: small.slice(0, 15) };
    });
  } catch (error) {
    console.error(`Touch target audit failed: ${error.message}`);
    return null;
  }
}

// 한글 텍스트를 직접 담은 요소의 타이포 원자료 수집.
// 판정(serif fallback / keep-all / 자간)은 design-contract.cjs의 순수 함수가 담당한다.
async function collectKoreanTypography(page) {
  try {
    return await page.evaluate(() => {
      const cssPath = (el) => {
        if (!el || !el.tagName) return '';
        const parts = [];
        let node = el, depth = 0;
        while (node && node.nodeType === 1 && depth < 4) {
          let seg = node.tagName.toLowerCase();
          if (node.id) { parts.unshift(`${seg}#${node.id}`); break; }
          const cls = (typeof node.className === 'string' ? node.className : '')
            .trim().split(/\s+/).filter(Boolean).slice(0, 2);
          if (cls.length) seg += '.' + cls.join('.');
          parts.unshift(seg);
          node = node.parentElement;
          depth++;
        }
        return parts.join(' > ').slice(0, 120);
      };
      const HANGUL = /[가-힣]/;
      const px = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };

      const els = Array.from(document.querySelectorAll('body *'));
      const samples = [];
      let scanned = 0;

      for (const el of els) {
        if (samples.length >= 120) break;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // 자식 요소가 아닌 '직접 텍스트 노드'의 한글만 계상 (부모로 중복 집계 방지)
        let text = '';
        for (const n of el.childNodes) {
          if (n.nodeType === 3) text += n.nodeValue;
        }
        text = text.trim();
        if (!text || !HANGUL.test(text)) continue;
        scanned++;

        const cs = getComputedStyle(el);
        const hangulChars = (text.match(/[가-힣]/g) || []).length;
        const display = cs.display;
        samples.push({
          selector: cssPath(el),
          fontFamily: cs.fontFamily || '',
          chars: hangulChars,
          wordBreak: cs.wordBreak || 'normal',
          overflowWrap: cs.overflowWrap || cs.wordWrap || 'normal',
          letterSpacing: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing),
          fontSize: px(cs.fontSize),
          block: display === 'block' || display === 'flex' || display === 'grid' || display === 'list-item',
        });
      }

      return { scanned, samples };
    });
  } catch (error) {
    console.error(`Korean typography audit failed: ${error.message}`);
    return null;
  }
}

// 가독성(DP-R)·AI 상투 패턴(DP-P) 원자료 수집 — 읽기 전용 DOM 순회 1회 (v2.8.0).
// 판정은 craft-lint.cjs의 순수 함수가 담당한다. DOM·스크롤·포커스를 바꾸지 않는다.
// 상한에 닿으면 capped=true → 린트가 measurement: "incomplete"로 정직하게 표기한다.
const CRAFT_CAPS = Object.freeze({
  elements: 8000,  // 순회할 요소 수
  text: 1500,      // 텍스트 블록 샘플
  boxes: 400,      // 카드 후보 박스 (DP-P003)
  borders: 400,    // 한쪽 테두리 후보 (DP-P002)
  gradients: 100,  // 그라디언트 텍스트 후보 (DP-P001)
  headings: 300,
  distinct: 200,   // 이징·애니메이션 이름 고유값
});

async function collectCraftMetrics(page, caps = CRAFT_CAPS) {
  try {
    return await page.evaluate((caps) => {
      const cssPath = (el) => {
        if (!el || !el.tagName) return '';
        const parts = [];
        let node = el, depth = 0;
        while (node && node.nodeType === 1 && depth < 4) {
          let seg = node.tagName.toLowerCase();
          if (node.id) { parts.unshift(`${seg}#${node.id}`); break; }
          const cls = (typeof node.className === 'string' ? node.className : '')
            .trim().split(/\s+/).filter(Boolean).slice(0, 2);
          if (cls.length) seg += '.' + cls.join('.');
          parts.unshift(seg);
          node = node.parentElement;
          depth++;
        }
        return parts.join(' > ').slice(0, 120);
      };
      const px = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      };
      const alphaOf = (color) => {
        const s = String(color || '');
        if (s === 'transparent') return 0;
        const m = /rgba?\(([^)]*)\)/i.exec(s);
        if (!m) return 1;
        const parts = m[1].split(/[\s,/]+/).filter(Boolean);
        if (parts.length < 4) return 1;
        const a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
        return Number.isFinite(a) ? a : 1;
      };
      const classChain = (node, depth) => {
        let s = '';
        for (let i = 0; node && node.nodeType === 1 && i < depth; i++, node = node.parentElement) {
          s += ' ' + (typeof node.className === 'string' ? node.className : '');
        }
        return s;
      };

      // 텍스트 블록 경계 — inline/contents가 아닌 요소는 자기 블록을 이룬다
      const INLINE = new Set(['inline', 'contents']);
      // 내부 텍스트를 본문으로 보지 않는 요소
      const OPAQUE = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'TEXTAREA', 'SELECT',
        'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'OBJECT']);
      const UI_SEL = 'button, a, label, summary, select, option, nav, footer, [role="button"], [role="link"], '
        + '[role="tab"], [role="menuitem"], [role="navigation"], [role="status"], [role="tooltip"], [aria-hidden="true"]';
      const UI_CLASS = /(^|[\s_-])(badges?|chips?|pills?|tags?|labels?|meta|eyebrow|kicker|breadcrumbs?)($|[\s_-])/i;
      const FINE_CLASS = /legal|copyright|disclaimer|footnote|fine-?print/i;
      const STATE_CLASS = /(^|[\s_-])(active|selected|current|checked)($|[\s_-])/i;
      const MONO = /monospace|\bmono\b|consolas|courier|menlo|monaco/i;
      const INTERACTIVE = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="link"], '
        + '[role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';
      const POPUP = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [popover]';

      const styles = new Map();
      const styleOf = (el) => {
        let cs = styles.get(el);
        if (!cs) { cs = getComputedStyle(el); styles.set(el, cs); }
        return cs;
      };
      const bgCache = new Map();
      const effectiveBg = (node) => {
        const chain = [];
        let found = 'rgb(255, 255, 255)';
        for (let n = node; n && n.nodeType === 1; n = n.parentElement) {
          if (bgCache.has(n)) { found = bgCache.get(n); break; }
          chain.push(n);
          const c = styleOf(n).backgroundColor;
          if (alphaOf(c) > 0.05) { found = c; break; }
        }
        for (const n of chain) bgCache.set(n, found);
        return found;
      };

      // 블록에 속한 텍스트 노드 — 하위 블록(자기 블록을 이루는 요소)의 텍스트는 그 블록 몫이다
      const textNodesOf = (block) => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
            if (OPAQUE.has(n.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
            const d = styleOf(n).display;
            if (d === 'none' || !INLINE.has(d)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_SKIP;
          },
        });
        const out = [];
        let n;
        while ((n = walker.nextNode())) out.push(n);
        return out;
      };

      // 텍스트 조각 사각형을 줄 단위로 합친다 — 세로로 절반 이상 겹치면 같은 줄
      const mergeLines = (rects) => {
        rects.sort((a, b) => (a.top - b.top) || (a.left - b.left));
        const lines = [];
        for (const r of rects) {
          const last = lines[lines.length - 1];
          if (last) {
            const overlap = Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top);
            if (overlap > 0.5 * Math.min(last.bottom - last.top, r.bottom - r.top)) {
              last.left = Math.min(last.left, r.left);
              last.right = Math.max(last.right, r.right);
              last.top = Math.min(last.top, r.top);
              last.bottom = Math.max(last.bottom, r.bottom);
              continue;
            }
          }
          lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
        }
        return lines.map(l => Math.round(l.right - l.left));
      };

      const all = Array.from(document.querySelectorAll('body *'));
      const capped = { elements: all.length > caps.elements, text: false, boxes: false, borders: false, gradients: false };
      const els = all.slice(0, caps.elements);

      const text = [];
      const scaleMap = new Map();
      const gradientText = [];
      const borders = [];
      const boxes = [];
      const boxIndex = new Map();
      const motionMap = new Map();
      const animMap = new Map();
      const addDist = (map, value, el) => {
        if (!value) return;
        const cur = map.get(value);
        if (cur) { cur.count++; return; }
        if (map.size >= caps.distinct) return;
        map.set(value, { count: 1, sample: cssPath(el) });
      };
      let scanned = 0;

      for (const el of els) {
        const tagU = el.tagName.toUpperCase();
        if (OPAQUE.has(tagU)) continue;
        const cs = styleOf(el);
        const display = cs.display;
        if (display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        scanned++;
        const block = !INLINE.has(display);

        // ── 텍스트 블록 (DP-R001~R006, R008)
        // 화면 낭독기 전용 텍스트(1px 클립)는 줄 배치가 의미 없으므로 뺀다
        const srOnly = rect.width < 8 || rect.height < 8 || (cs.clip && cs.clip !== 'auto')
          || /inset\(50%\)/.test(cs.clipPath || '');
        if (block && !srOnly) {
          if (text.length >= caps.text) {
            capped.text = true;
          } else {
            let chars = 0, spaces = 0, latin = 0;
            const bySource = new Map();
            const rects = [];
            for (const tn of textNodesOf(el)) {
              const t = (tn.nodeValue || '').replace(/\s+/g, ' ').trim();
              if (!t) continue;
              chars += t.length;
              spaces += (t.match(/ /g) || []).length;
              latin += (t.match(/[A-Za-z]/g) || []).length;
              const src = tn.parentElement || el;
              bySource.set(src, (bySource.get(src) || 0) + t.length);
              const range = document.createRange();
              range.selectNodeContents(tn);
              for (const r of range.getClientRects()) {
                if (r.width > 0 && r.height > 0) rects.push(r);
              }
            }
            if (chars > 0) {
              // 글자 수가 가장 많은 요소의 스타일을 이 블록의 대표 스타일로 쓴다
              let src = el, best = -1;
              for (const [s, n] of bySource) if (n > best) { best = n; src = s; }
              const scs = styleOf(src);
              const fontSize = px(scs.fontSize);
              const fontWeight = parseInt(scs.fontWeight, 10) || 400;
              const monoPre = MONO.test(scs.fontFamily || '') && /^(pre|break-spaces)/.test(scs.whiteSpace || '');
              const codeContext = monoPre || !!src.closest('pre, code, kbd, samp');
              const hEl = src.closest('h1, h2, h3, h4, h5, h6, [role="heading"]');
              let role = 'body';
              if (hEl) {
                const m = /^H([1-6])$/.exec(hEl.tagName.toUpperCase());
                const lvl = m ? Number(m[1]) : (parseInt(hEl.getAttribute('aria-level'), 10) || 2);
                role = 'h' + Math.min(6, Math.max(1, lvl));
              }
              const uiContext = !!src.closest(UI_SEL) || UI_CLASS.test(classChain(src, 3));
              const finePrint = !!src.closest('[role="contentinfo"]') || FINE_CLASS.test(classChain(src, 4));
              const skipAncestor = src.closest('sub, sup, code, kbd, samp, var, caption, figcaption, small');
              text.push({
                selector: cssPath(el),
                tag: (skipAncestor || src).tagName.toLowerCase(),
                chars, spaces, latin,
                fontSize,
                lineHeightPx: scs.lineHeight === 'normal' ? null : px(scs.lineHeight),
                letterSpacingPx: scs.letterSpacing === 'normal' ? 0 : (px(scs.letterSpacing) || 0),
                fontWeight,
                textTransform: scs.textTransform || 'none',
                textAlign: cs.textAlign || 'start',
                hyphens: scs.hyphens || scs.getPropertyValue('-webkit-hyphens') || 'manual',
                lineWidths: mergeLines(rects),
                heading: !!hEl,
                codeContext, uiContext, finePrint, monoPre,
              });
              // 위계 표본 — 제목은 전부, 본문은 UI·코드·고지를 뺀 20자 이상 블록만
              if (fontSize && !codeContext && (hEl || (!uiContext && !finePrint && chars >= 20))) {
                const key = `${role}|${Math.round(fontSize * 10) / 10}|${fontWeight}`;
                scaleMap.set(key, (scaleMap.get(key) || 0) + 1);
              }
            }
          }
        }

        // ── 그라디언트 텍스트 (DP-P001)
        const clipText = cs.backgroundClip === 'text' || cs.getPropertyValue('-webkit-background-clip') === 'text';
        if (clipText && /gradient\(/i.test(cs.backgroundImage || '') && (el.textContent || '').trim()) {
          if (gradientText.length < caps.gradients) {
            gradientText.push({ selector: cssPath(el), backgroundImage: String(cs.backgroundImage).slice(0, 300) });
          } else {
            capped.gradients = true;
          }
        }

        // ── 테두리 (DP-P002·DP-P003 공용 원자료)
        const sides = ['Top', 'Right', 'Bottom', 'Left'];
        const widths = sides.map(s => {
          const st = cs[`border${s}Style`];
          return st === 'none' || st === 'hidden' ? 0 : (px(cs[`border${s}Width`]) || 0);
        });
        const colorsVisible = sides.map(s => alphaOf(cs[`border${s}Color`]) > 0.1);
        const radiusOf = (v) => {
          const first = String(v || '').split(/\s+/)[0];
          if (first.endsWith('%')) return (parseFloat(first) / 100) * Math.min(rect.width, rect.height);
          return px(first) || 0;
        };
        const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
          .map(radiusOf);
        const maxW = Math.max(...widths);
        // 한 면만 두드러지는 테두리만 후보로 남긴다 — 균일한 테두리가 상한을 먹지 않게
        if (maxW >= 2 && widths.filter(w => w > maxW / 2).length === 1) {
          if (borders.length < caps.borders) {
            const cls = typeof el.className === 'string' ? el.className : '';
            const ariaCurrent = el.getAttribute('aria-current');
            borders.push({
              selector: cssPath(el),
              tag: el.tagName.toLowerCase(),
              width: Math.round(rect.width), height: Math.round(rect.height),
              widths, colorsVisible, radii,
              stateMarked: STATE_CLASS.test(cls) || (!!ariaCurrent && ariaCurrent !== 'false')
                || el.getAttribute('aria-selected') === 'true',
            });
          } else {
            capped.borders = true;
          }
        }

        // ── 카드 후보 박스 (DP-P003) — 칠해진(테두리·그림자·배경 구분) 블록만
        if (block && rect.width >= 80 && rect.height >= 48) {
          const edgeSides = widths.filter((w, i) => w >= 1 && colorsVisible[i]).length;
          const shadow = !!cs.boxShadow && cs.boxShadow !== 'none';
          const fillDiffers = alphaOf(cs.backgroundColor) > 0.05 && cs.backgroundColor !== effectiveBg(el.parentElement);
          if (edgeSides > 0 || shadow || fillDiffers) {
            if (boxes.length < caps.boxes) {
              let p = el.parentElement;
              while (p && !boxIndex.has(p)) p = p.parentElement;
              boxIndex.set(el, boxes.length);
              boxes.push({
                selector: cssPath(el),
                tag: el.tagName.toLowerCase(),
                ancestor: p ? boxIndex.get(p) : -1,
                width: Math.round(rect.width), height: Math.round(rect.height),
                edgeSides, shadow, fillDiffers,
                radius: Math.max(...radii),
                interactive: el.matches(INTERACTIVE),
                popup: !!el.closest(POPUP),
              });
            } else {
              capped.boxes = true;
            }
          }
        }

        // ── 모션 (DP-P004) — 실제로 전환·애니메이션이 걸린 요소의 이징만
        if (String(cs.transitionDuration || '0s').split(',').some(v => parseFloat(v) > 0)) {
          addDist(motionMap, cs.transitionTimingFunction, el);
        }
        if (cs.animationName && cs.animationName !== 'none') {
          addDist(motionMap, cs.animationTimingFunction, el);
          addDist(animMap, cs.animationName, el);
        }
      }

      // 제목 순서 — 화면 낭독기 전용 제목도 구조에 포함된다(1px 클립이어도 센다)
      const headings = [];
      for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')) {
        if (headings.length >= caps.headings) break;
        const r = h.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (styleOf(h).visibility === 'hidden') continue;
        const m = /^H([1-6])$/.exec(h.tagName.toUpperCase());
        const level = m ? Number(m[1]) : (parseInt(h.getAttribute('aria-level'), 10) || 2);
        headings.push({ level, selector: cssPath(h), inFooter: !!h.closest('footer, [role="contentinfo"]') });
      }

      const dist = (map) => Array.from(map.entries()).map(([value, v]) => ({ value, count: v.count, sample: v.sample }));
      return {
        readability: {
          scanned,
          capped: capped.elements || capped.text,
          text,
          headings,
          typeScale: Array.from(scaleMap.entries()).map(([k, count]) => {
            const [role, size, weight] = k.split('|');
            return { role, size: Number(size), weight: Number(weight), count };
          }),
        },
        patterns: {
          scanned,
          capped: capped.elements || capped.boxes || capped.borders || capped.gradients,
          viewportWidth: window.innerWidth,
          gradientText, borders, boxes,
          motion: dist(motionMap),
          animations: dist(animMap),
        },
      };
    }, caps);
  } catch (error) {
    console.error(`Craft audit failed: ${error.message}`);
    return null;
  }
}

// 포커스 가시성 계측 예산 — Tab 순회는 페이지 상태를 건드리므로 상한을 둔다.
const FOCUS_TRAVERSAL_MAX = 30;   // 최대 Tab 횟수
const FOCUS_TRAVERSAL_MS = 5000;  // 페이지당 시간 상한

// page.evaluate 안에서 재사용하는 헬퍼(문자열로 주입 — evaluate는 Node 스코프를 못 본다).
const FOCUS_HELPERS = `
  const __sig = (cs) => [
    cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset,
    cs.boxShadow, cs.borderColor, cs.borderWidth, cs.backgroundColor,
    cs.color, cs.textDecorationLine, cs.filter,
  ].join('|');
  const __cssPath = (el) => {
    if (!el || !el.tagName) return '';
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let seg = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(seg + '#' + node.id); break; }
      const cls = (typeof node.className === 'string' ? node.className : '')
        .trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) seg += '.' + cls.join('.');
      parts.unshift(seg);
      node = node.parentElement;
      depth++;
    }
    return parts.join(' > ').slice(0, 120);
  };
  // 페이지 CSS에서 ':focus-visible'을 포함한 규칙의 **기저 셀렉터**를 모은다.
  // 요소별 강등 판정에 쓴다 — "페이지 어딘가에 규칙이 하나라도 있으면 전 요소 강등"은
  // DP-S002를 사실상 도달 불가로 만든다. 이 요소를 겨냥한 규칙이 있을 때만 강등해야 한다.
  // 기저 셀렉터 = ':focus-visible'과 의사요소/동적 의사클래스를 제거한 것
  // (el.matches(':focus-visible')은 포커스 시점에만 참이라 사후 비교에는 쓸 수 없다).
  const __focusVisibleSelectors = () => {
    const out = [];
    let unreadable = 0;
    const push = (selectorText) => {
      for (const part of String(selectorText).split(',')) {
        if (part.indexOf(':focus-visible') === -1) continue;
        const base = part
          .replace(/::[a-z-]+/g, '')
          .replace(/:focus-visible/g, '')
          .replace(/:(?:hover|active|focus|focus-within|visited|target)\b/g, '')
          .trim();
        out.push(base || '*');   // ':focus-visible { }' 단독 규칙 → 모든 요소 대상
      }
    };
    const walk = (list) => {
      for (const r of Array.from(list || [])) {
        if (out.length >= 300) return;
        if (typeof r.selectorText === 'string' && r.selectorText.indexOf(':focus-visible') !== -1) push(r.selectorText);
        if (r.cssRules) walk(r.cssRules);   // @media / @supports 중첩
      }
    };
    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (_) { unreadable++; continue; }
      if (!rules) { unreadable++; continue; }
      walk(rules);
    }
    return { selectors: out, unreadable };
  };
`;

// 컴포넌트 상태 계약 원자료 수집 (disabled 표현 / 포커스 가시성 / 클릭 어포던스).
//
// 포커스 가시성은 **실제 키보드 포커스**로 잰다. el.focus()로는 :focus-visible이 켜지지 않아
// (브라우저는 스크립트 포커스를 "키보드 사용자"로 보지 않는다) :focus-visible만 스타일링한
// 정상 코드가 통째로 DP-S002 위반으로 잡히는 거짓 양성이 났다. page.keyboard.press('Tab')
// 순회로 진짜 키보드 포커스를 만들고 document.activeElement의 computed style을 비교한다.
async function collectStateContract(page) {
  try {
    const base = await page.evaluate(new Function(`
      ${FOCUS_HELPERS}
      const INTERACTIVE = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex="-1"])';
      const all = Array.from(document.querySelectorAll(INTERACTIVE))
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });

      const disabled = [];
      const clickable = [];
      for (const el of all) {
        const cs = getComputedStyle(el);
        const isDisabled = el.disabled === true || el.getAttribute('aria-disabled') === 'true';
        if (isDisabled) {
          if (disabled.length < 30) {
            disabled.push({ selector: __cssPath(el), cursor: cs.cursor, opacity: cs.opacity });
          }
          continue; // disabled 요소는 포커스/커서 검사 대상에서 제외
        }
        const tag = el.tagName.toLowerCase();
        const isNative = tag === 'a' || tag === 'button' || tag === 'select' || tag === 'input' || tag === 'textarea';
        if (!isNative && clickable.length < 30) {
          clickable.push({ selector: __cssPath(el), tag, cursor: cs.cursor });
        }
      }

      // 페이지 CSS에 :focus-visible 규칙이 있는지 — 개별 '변화 없음'을 INFO로 강등할 근거.
      // 교차 출처 스타일시트는 cssRules 접근이 막히므로 읽지 못한 사실을 따로 남긴다.
      let hasFocusVisibleRule = false;
      let stylesheetsUnreadable = 0;
      const walk = (list) => {
        for (const r of Array.from(list || [])) {
          if (hasFocusVisibleRule) return;
          if (typeof r.selectorText === 'string' && r.selectorText.indexOf(':focus-visible') !== -1) {
            hasFocusVisibleRule = true; return;
          }
          if (r.cssRules) walk(r.cssRules); // @media / @supports 중첩
        }
      };
      for (const sheet of Array.from(document.styleSheets || [])) {
        let rules = null;
        try { rules = sheet.cssRules; } catch (_) { stylesheetsUnreadable++; continue; }
        if (!rules) { stylesheetsUnreadable++; continue; }
        walk(rules);
        if (hasFocusVisibleRule) break;
      }

      return { scannedInteractive: all.length, disabled, clickable, hasFocusVisibleRule, stylesheetsUnreadable };
    `));

    const focus = await collectFocusVisibility(page);
    return { ...base, ...focus };
  } catch (error) {
    console.error(`State contract audit failed: ${error.message}`);
    return null;
  }
}

// Tab 순회로 실제 키보드 포커스를 만들며 포커스 표시 변화를 측정한다.
//   1) body에 임시 tabindex를 주고 포커스 → 순회 시작점 고정
//   2) Tab을 누를 때마다 document.activeElement에 표식(data-dp-focus-probe=i)을 달고
//      포커스 상태 시그니처를 읽는다. 이미 표식이 있으면 한 바퀴 돈 것이므로 종료.
//   3) 순회 후 blur하고 표식이 달린 요소의 비포커스 시그니처를 읽어 비교, 표식을 모두 제거.
// 상한: Tab 최대 FOCUS_TRAVERSAL_MAX회, 페이지당 FOCUS_TRAVERSAL_MS 예산.
async function collectFocusVisibility(page, max = FOCUS_TRAVERSAL_MAX, budgetMs = FOCUS_TRAVERSAL_MS) {
  const deadline = Date.now() + budgetMs;
  const unavailable = {
    focusable: [], focusMeasured: 0, focusMethod: 'unavailable',
    focusRuleMeasured: false, focusVisibleSelectorCount: 0, focusRuleUnreadableStylesheets: 0,
    focusTraversalCapped: false, focusTimedOut: false,
  };

  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-dp-focus-probe]').forEach(el => el.removeAttribute('data-dp-focus-probe'));
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) { /* noop */ }
      if (document.body) {
        document.body.setAttribute('data-dp-focus-origin', '1');
        document.body.setAttribute('tabindex', '-1');
        try { document.body.focus({ preventScroll: true }); } catch (_) { /* noop */ }
      }
    });
  } catch (_) {
    return unavailable;
  }

  const focused = [];   // [{ index, selector, sig }]
  let capped = false;
  let timedOut = false;

  for (let i = 0; i < max; i++) {
    if (Date.now() > deadline) { timedOut = true; break; }
    try {
      await page.keyboard.press('Tab');
    } catch (_) {
      break;
    }
    let step;
    try {
      step = await page.evaluate(new Function('idx', `
        ${FOCUS_HELPERS}
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return { stop: true };
        if (el.hasAttribute('data-dp-focus-probe')) return { stop: true, wrapped: true };
        el.setAttribute('data-dp-focus-probe', String(idx));
        return { stop: false, index: idx, selector: __cssPath(el), sig: __sig(getComputedStyle(el)) };
      `), i);
    } catch (_) {
      break;
    }
    if (!step || step.stop) break;
    focused.push(step);
  }
  if (focused.length >= max) capped = true;

  // 포커스 해제 후 비포커스 시그니처를 읽어 비교하고, 표식/임시 tabindex를 원복한다.
  let measured = null;
  let restored = false;
  try {
    measured = await page.evaluate(new Function('entries', `
      ${FOCUS_HELPERS}
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
      const fv = __focusVisibleSelectors();
      const matchesFocusVisible = (el) => {
        for (const sel of fv.selectors) {
          try { if (el.matches(sel)) return true; } catch (_) { /* 파싱 불가 셀렉터는 건너뜀 */ }
        }
        return false;
      };
      const out = [];
      for (const entry of entries) {
        const el = document.querySelector('[data-dp-focus-probe="' + entry.index + '"]');
        if (!el) continue;
        out.push({
          selector: entry.selector,
          focusChanged: __sig(getComputedStyle(el)) !== entry.sig,
          // 이 요소를 겨냥한 :focus-visible 규칙이 있는가 (강등 근거)
          focusVisibleRule: matchesFocusVisible(el),
        });
      }
      document.querySelectorAll('[data-dp-focus-probe]').forEach(el => el.removeAttribute('data-dp-focus-probe'));
      const origin = document.querySelector('[data-dp-focus-origin]');
      if (origin) { origin.removeAttribute('tabindex'); origin.removeAttribute('data-dp-focus-origin'); }
      return { items: out, focusVisibleSelectorCount: fv.selectors.length, unreadableStylesheets: fv.unreadable };
    `), focused);
    restored = true;
  } catch (_) {
    measured = null;
  }
  const focusable = (measured && Array.isArray(measured.items)) ? measured.items : [];

  // Tab이 한 요소도 잡지 못했으면 "포커스 가능한 요소가 없다"와 "키보드 포커스를 못 걸었다"를
  // 구분할 수 없다. 단정하지 않도록 focusMethod를 unavailable로 남겨 린트가 강등하게 한다.
  if (!restored || focused.length === 0) {
    return { ...unavailable, focusTraversalCapped: capped, focusTimedOut: timedOut };
  }

  return {
    focusable,
    focusMeasured: focusable.length,
    focusMethod: 'keyboard-tab',
    // 요소별 :focus-visible 매칭을 실제로 쟀다는 표식 — 린트가 "페이지 전역 규칙 하나로
    // 전 요소 강등"이라는 옛 fail-open으로 되돌아가지 않게 하는 근거.
    focusRuleMeasured: true,
    focusVisibleSelectorCount: measured.focusVisibleSelectorCount || 0,
    focusRuleUnreadableStylesheets: measured.unreadableStylesheets || 0,
    focusTraversalCapped: capped,
    focusTimedOut: timedOut,
  };
}

// ============================================
// Console Error 캡처
// ============================================

function setupConsoleCapture(page) {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack ? error.stack.substring(0, 500) : null,
      timestamp: new Date().toISOString(),
    });
  });

  return { consoleErrors, pageErrors };
}

// 신원(타임스탬프 제외) 기준 중복 제거.
// console 리스너는 페이지 인스턴스에 1회 부착돼 모든 page.goto에 걸쳐 누적되므로,
// 반응형 다중 뷰포트 캡처나 모바일 재방문(primaryRoute 2회 로드) 시 "지속적 에러 1건"이
// 여러 번 push된다. 스코어링에 그대로 쓰면 errorCount가 부풀려져 consoleErrors 항목이
// 실제보다 낮게(심하면 0으로) 왜곡된다 → 스코어링 직전에만 신원 기준으로 압축한다.
// (원본 배열은 saveConsoleErrors가 진단용으로 그대로 보존)
function dedupeErrors(errors, keyFn) {
  const seen = new Set();
  const out = [];
  for (const e of (errors || [])) {
    const key = keyFn(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function saveConsoleErrors(consoleErrors, pageErrors) {
  if (consoleErrors.length === 0 && pageErrors.length === 0) return;

  ensureDir(CONFIG.accessibilityDir);
  const report = {
    timestamp: new Date().toISOString(),
    consoleErrors,
    pageErrors,
    summary: {
      totalErrors: consoleErrors.filter(e => e.type === 'error').length + pageErrors.length,
      totalWarnings: consoleErrors.filter(e => e.type === 'warning').length,
    },
  };

  const filepath = path.join(CONFIG.accessibilityDir, 'console-errors.json');
  validatePathWithinDir(filepath, CONFIG.accessibilityDir);
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  console.log(`Console errors saved: console-errors.json (${report.summary.totalErrors} errors, ${report.summary.totalWarnings} warnings)`);
}

// ============================================
// Design Health Score 저장 + 이력
// ============================================

// 이전 회차와 비교할 baseline은 health-history.jsonl에서 읽는다
// (health-score.json은 매 실행 덮어써지므로, 이번 실행 직전 상태를 반영하지 못함).
// mode/route가 주어지면 동종 라인만 baseline으로 선택한다 — 측정 모드(full vs no-wcag)나
// 라우트가 다르면 점수 상한이 달라 diff가 무의미하고, 크로스 모드 오판(거짓 improved/regression)을
// 낸다. 뒤에서부터 순회하며 첫 유효·동종 라인을 채택(손상된 마지막 줄 내성).
// styleMode(contract/heuristic)도 동종 조건에 포함한다 — 디자인 계약을 도입하는 순간
// styleFit 산식 자체가 바뀌므로, 계약 이전(heuristic) 점수와 비교하면 코드가 하나도
// 안 바뀌었는데 거짓 regression/improved가 뜬다. 이력에 styleMode가 없는 구(舊) 라인은
// 'heuristic'으로 간주(하위호환).
// 뷰포트 집합 태그 — 정렬된 이름 목록을 ','로 이어 붙인 문자열.
// 뷰포트 수가 달라지면 콘솔 에러 수집량·모바일 a11y 패스 유무가 달라져 점수 상한이
// 흔들린다. 다른 뷰포트 집합의 회차를 baseline으로 잡으면 거짓 회귀가 난다.
function viewportTag(viewports) {
  if (!Array.isArray(viewports) || viewports.length === 0) return null;
  const names = viewports
    .map(v => (typeof v === 'string' ? v : (v && v.name)))
    .filter(Boolean)
    .map(String);
  if (names.length === 0) return null;
  return Array.from(new Set(names)).sort().join(',');
}

// 이력에서 동종(mode/route/styleMode/viewports) 라인만 최신순으로 최대 limit개 읽는다.
// 손상된 라인은 건너뛴다. viewports 필드가 없는 구(舊) 라인은 태그 불일치로 버리지 않는다
// — v2.5 이하 이력이 통째로 무효화되면 도입 직후 회귀 판정이 사라지기 때문(하위호환).
function readHealthHistory(tag = {}, limit = 1) {
  const fp = path.join(process.cwd(), '.design-polish', 'health-history.jsonl');
  const out = [];
  try {
    if (!fs.existsSync(fp)) return out;
    const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch (_) { continue; }
      if (typeof entry.score !== 'number') continue;
      if (tag.mode != null && entry.mode !== tag.mode) continue;   // 동일 측정 모드만
      if (tag.route != null && entry.route !== tag.route) continue; // 동일 라우트만
      if (tag.styleMode != null && (entry.styleMode || 'heuristic') !== tag.styleMode) continue; // 동일 스코어링 산식만
      if (tag.viewports != null && entry.viewports != null && entry.viewports !== tag.viewports) continue; // 동일 뷰포트 집합만
      out.push(entry);
    }
  } catch (_) {
    return out;
  }
  return out;
}

function readPreviousScore(mode, route, styleMode, viewports) {
  const rows = readHealthHistory({ mode, route, styleMode, viewports }, 1);
  return rows.length > 0 ? rows[0].score : null;
}

// ── 정체(stagnation) 판정 ──
// "최근 N회를 눈으로 비교해 정체면 접근을 바꿔라"는 지시는 모델에게 산수를 시킨다.
// 스크립트가 결정론적으로 계산하고 SKILL은 값만 인용한다.
//   scores: 최신순 점수 배열. spread(최댓값-최솟값)가 tolerance 이내면 정체.
//   delta : 최신 - 가장 오래된 (방향). 점수가 내려왔으면 음수다.
//
// 반환 필드의 의미를 분리한다 (v2.7.0):
//   runs     — 판정에 넘어온 **실제 동일 태그 회차 수**(현재 회차 포함). 항상 같은 뜻.
//   window   — 판정에 실제로 사용한 최근 회차 수(= 창 크기).
//   required — 판정에 필요한 최소 회차 수.
// 예전에는 `runs`가 insufficient일 때만 실제 회차 수였고 그 외에는 창 크기(3)라서
// 같은 필드가 두 가지를 뜻했다(리포트 문구가 "최근 3회"인지 "3회 모였다"인지 구분 불가).
const STAGNATION_RUNS = 3;

function classifyStagnation(scores, runs = STAGNATION_RUNS, tolerance = REGRESSION_TOLERANCE) {
  const list = (Array.isArray(scores) ? scores : []).filter(Number.isFinite);
  if (list.length < runs) {
    return {
      status: 'insufficient', delta: null, spread: null,
      runs: list.length, window: 0, required: runs, tolerance, scores: list,
    };
  }
  const window = list.slice(0, runs);          // 최신순
  const newest = window[0];
  const oldest = window[window.length - 1];
  const round = v => Math.round(v * 100) / 100;
  const spread = round(Math.max(...window) - Math.min(...window));
  return {
    status: spread <= tolerance ? 'stagnant' : 'none',
    delta: round(newest - oldest),
    spread,
    runs: list.length,
    window: window.length,
    required: runs,
    tolerance,
    scores: window,
  };
}

function appendHealthHistory(report) {
  const dir = path.join(process.cwd(), '.design-polish');
  ensureDir(dir);
  const fp = path.join(dir, 'health-history.jsonl');
  validatePathWithinDir(fp, dir);
  const line = JSON.stringify({
    timestamp: report.timestamp,
    score: report.score,
    breakdown: report.breakdown,
    mode: report.mode,
    route: report.route,
    styleMode: report.styleMode || 'heuristic',
    viewports: report.viewports || null,
  }) + '\n';
  fs.appendFileSync(fp, line);
}

// 회귀 판정 dead-band — perf 계측(FCP/transferBytes)은 캐시/네트워크 지터로
// 실행마다 1~2점 흔들릴 수 있다. 무변경인데 지터로 diff<0가 나면 거짓 regression →
// 좋은 변경을 롤백하는 오판이 생긴다. 정체(stagnation) 판단과 동일한 ±3 밴드를 적용해
// |diff| ≤ REGRESSION_TOLERANCE는 'unchanged'로 흡수한다. (판정=스크립트, 결정론적)
const REGRESSION_TOLERANCE = 3;

function classifyRegression(diff, tolerance = REGRESSION_TOLERANCE) {
  if (!Number.isFinite(diff)) return 'unchanged';
  if (diff > tolerance) return 'improved';
  if (diff < -tolerance) return 'regression';
  return 'unchanged';
}

// health-score.json의 최종 형태를 만드는 **순수 함수**. 파일 IO·시계·이력 읽기를 하지 않는다.
// (계약 테스트가 게이트 소비 필드를 고정하려면 IO 없이 형태를 재현할 수 있어야 한다.)
//
// 하위 호환 계약 — auto-complete-loop/scripts/gates/design.sh가 읽는 필드:
//   .score, .styleMode,
//   .regression.diff, .regression.status,
//   .tokenDrift.enabled, .tokenDrift.totalViolations, .tokenDrift.newViolationCount
// 이름과 의미를 바꾸지 않는다. 추가만 한다.
function buildHealthScore(healthScore, extras = {}, meta = {}, context = {}) {
  const mode = meta.mode || 'full';
  const route = meta.route || '/';
  const styleMode = meta.styleMode || 'heuristic';
  const viewports = meta.viewports || null;

  const previousScore = context.previousScore != null ? context.previousScore : null;
  let regression = null;
  if (previousScore != null && Number.isFinite(healthScore.score)) {
    const diff = healthScore.score - previousScore;
    regression = {
      previousScore,
      currentScore: healthScore.score,
      diff,
      // dead-band(±3) 적용 — 지터성 미세 하락을 거짓 regression으로 오판하지 않음
      status: classifyRegression(diff),
      tolerance: REGRESSION_TOLERANCE,
      mode,
      route,
      styleMode,
      viewports,
    };
  }

  // 정체 판정 — 이번 회차를 포함한 최신순 점수 목록으로 스크립트가 계산한다.
  const recent = Array.isArray(context.recentScores) ? context.recentScores : [];
  const stagnation = classifyStagnation(
    [healthScore.score, ...recent].filter(Number.isFinite)
  );

  // severity 집계 — Pivot 판정이 5단계에서만 존재하던 값을 참조하던 순환을 끊는다.
  const ruleFailureSummary = contractLib.summarizeSeverity(extras.ruleFailures);

  // 래칫 baseline 상태 — fresh | reused | refrozen(contract changed)
  const baseline = context.baseline || { status: 'n/a', reason: 'no contract' };

  return {
    ...healthScore,
    ...extras,
    mode,
    route,
    styleMode,
    viewports,
    timestamp: context.timestamp || new Date().toISOString(),
    regression,
    stagnation,
    ruleFailureSummary,
    baseline,
  };
}

function saveHealthScore(healthScore, extras = {}, meta = {}) {
  const healthScoreDir = path.join(process.cwd(), '.design-polish');
  ensureDir(healthScoreDir);
  const filepath = path.join(healthScoreDir, 'health-score.json');
  validatePathWithinDir(filepath, healthScoreDir);

  const mode = meta.mode || 'full';
  const route = meta.route || '/';
  const styleMode = meta.styleMode || 'heuristic';
  const viewports = meta.viewports || null;

  // 이력에서 동일 mode+route+styleMode+viewports 회차만 읽는다 (append 전에 읽음).
  const tag = { mode, route, styleMode, viewports };
  const history = readHealthHistory(tag, STAGNATION_RUNS);
  const previousScore = history.length > 0 ? history[0].score : null;

  const report = buildHealthScore(healthScore, extras, { ...meta, viewports }, {
    previousScore,
    recentScores: history.map(h => h.score),
    baseline: meta.baseline,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  appendHealthHistory(report);

  console.log(`Design Health Score: ${healthScore.score}/100`);
  console.log(`  breakdown: wcagCritical ${report.breakdown.wcagCritical}, wcagSerious ${report.breakdown.wcagSerious}, console ${report.breakdown.consoleErrors}, styleFit ${report.breakdown.styleFit}, performance ${report.breakdown.performance}`);
  if (report.regression) {
    const r = report.regression;
    console.log(`  ${r.status}: ${r.previousScore} → ${r.currentScore} (${r.diff >= 0 ? '+' : ''}${r.diff})`);
  }
  if (report.stagnation) {
    const st = report.stagnation;
    console.log(st.status === 'insufficient'
      ? `  stagnation: insufficient (${st.runs}/${st.required} runs)`
      : `  stagnation: ${st.status} (last ${st.window} of ${st.runs} runs, delta ${st.delta >= 0 ? '+' : ''}${st.delta}, spread ${st.spread})`);
  }
  if (report.baseline && report.baseline.status && report.baseline.status !== 'n/a') {
    console.log(`  token baseline: ${report.baseline.status}${report.baseline.reason ? ` (${report.baseline.reason})` : ''}`);
  }
  return report;
}

// 면제 요약 — 적용된 면제는 한 줄씩, 무효 면제는 사유와 함께 경고한다(조용히 버리지 않는다).
function printRuleWaivers(waivers) {
  if (!waivers) return;
  for (const w of waivers.applied || []) {
    console.log(`  Waived: ${w.id} (x${w.count || 0}) by ${w.decision}`);
  }
  for (const bad of waivers.invalid || []) {
    const rule = bad.entry && typeof bad.entry === 'object' && bad.entry.rule ? `${bad.entry.rule}: ` : '';
    console.log(`  Invalid waiver ignored: ${rule}${bad.reason}`);
  }
}

// 룰 위반 요약 출력 — 스킬(SKILL.md)이 이 목록을 그대로 우선순위 큐로 사용한다.
// 심각도 순으로 이미 정렬된 summarizeRuleFailures 결과를 상위 12건만 보여준다.
function printRuleFailures(ruleFailures, drift, waivers) {
  if (drift && drift.enabled) {
    console.log(`  Token drift: ${drift.totalViolations} violation(s), ${drift.newViolationCount} new (baseline ${drift.hasBaseline ? 'on' : 'off'})`);
    if (drift.measurement === 'incomplete') {
      // 값 상한(200종)에 걸린 범주가 있다 — 위 수치는 하한값이다.
      console.log(`    measurement: incomplete — 값 상한 도달: ${(drift.capped || []).join(', ')} (styleFit은 이 범주를 완전히 반영하지 못함)`);
    }
  } else {
    // 계약 파일이 있어도 tokens가 없으면(면제만 둔 계약 등) 여기로 온다 — 실제 사유를 보여준다.
    const why = (drift && drift.reason) || 'no contract';
    console.log(`  Token drift: skipped (${why} — .design-polish/design-decisions.json)`);
  }
  printRuleWaivers(waivers);
  if (!ruleFailures || ruleFailures.length === 0) {
    console.log('  Rule failures: none');
    return;
  }
  console.log(`  Rule failures: ${ruleFailures.length}`);
  for (const f of ruleFailures.slice(0, 12)) {
    const newTag = f.newCount > 0 ? `, ${f.newCount} new` : '';
    console.log(`    [${f.severity}] ${f.id} ${f.title} (x${f.count || 0}${newTag})`);
    const s = (f.samples || [])[0];
    if (s) console.log(`        e.g. ${s.selector || '?'}${s.detail ? ` — ${s.detail}` : ''}${s.value ? ` — ${s.value}` : ''}`);
  }
  if (ruleFailures.length > 12) {
    console.log(`    ... +${ruleFailures.length - 12} more (see .design-polish/health-score.json)`);
  }
}

// ============================================
// 캡처 함수
// ============================================

async function createBrowser() {
  const args = [];
  // 샌드박스는 기본 활성화. 컨테이너/CI 등 불가피한 환경에서만 UNSAFE_NO_SANDBOX=true로 비활성화
  if (process.env.UNSAFE_NO_SANDBOX === 'true') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return await puppeteer.launch({
    headless: 'new',
    args,
  });
}

// 현재 프로젝트 캡처
async function captureLocal(routes, options = { wcag: true, responsive: false }) {
  // 도달성 프로브 — 대상 라우트를 전부 두드린다.
  // 서버가 안 떠 있을 때만(연결 실패) 중단하고, 개별 라우트의 404는 그 라우트만 건너뛴다.
  const probe = await probeTargets(CONFIG.baseUrl, routes);
  if (probe.down) {
    console.error(JSON.stringify({
      error: 'SERVER_DOWN', reason: probe.downReason, baseUrl: CONFIG.baseUrl, probes: probe.probes,
    }, null, 2));
    console.error(`Server not running: ${CONFIG.baseUrl} (${probe.downReason})`);
    console.error('개발 서버를 먼저 실행해주세요. (예: npm run dev)');
    process.exit(1);
  }
  for (const sk of probe.skipped) {
    console.warn(`Skipping route ${sk.route}: ${sk.reason}`);
  }
  for (const at of (probe.attempt || [])) {
    // 프로브는 답을 못 받았지만 서버가 죽었다는 증거는 없다 — 캡처를 시도하고 실패하면 그때 남긴다.
    console.warn(`Probe inconclusive for ${at.route}: ${at.reason} — attempting capture anyway`);
  }
  const targetRoutes = probe.reachable.concat((probe.attempt || []).map(a => a.route));
  if (targetRoutes.length === 0) {
    console.error(JSON.stringify({
      error: 'NO_REACHABLE_ROUTE', baseUrl: CONFIG.baseUrl, skipped: probe.skipped,
    }, null, 2));
    console.error('서버는 응답하지만 지정한 라우트가 모두 4xx/5xx이거나 연결이 거부되었습니다. BASE_URL 또는 --routes를 확인하세요.');
    process.exit(2);
  }
  routes = targetRoutes;

  ensureDir(CONFIG.outputDir);
  console.log(`\nCapturing local project: ${CONFIG.baseUrl}`);

  const browser = await createBrowser();
  try {
    const page = await browser.newPage();

    // Console error 캡처 설정
    const { consoleErrors, pageErrors } = setupConsoleCapture(page);

    // 사용할 뷰포트 결정
    const viewportsToUse = options.responsive
      ? CONFIG.viewports
      : [{ name: 'desktop', ...CONFIG.viewport }];

    const results = probe.skipped.map(sk => ({
      route: sk.route, viewport: null, filename: null, success: false,
      skipped: { reason: sk.reason, status: sk.status },
    }));
    let wcagReport = null;
    let styleMetrics = null;
    let perfMetrics = null;
    let koreanMetrics = null;
    let craftMetrics = null;
    let stateMetrics = null;
    const primaryRoute = routes[0];

    for (const vp of viewportsToUse) {
      await page.setViewport({ width: vp.width, height: vp.height });
      const vpLabel = options.responsive ? `-${vp.name}` : '';

      for (const route of routes) {
        const url = CONFIG.baseUrl + route;
        const filename = `current${vpLabel}-${sanitizeRouteName(route)}.png`;
        const filepath = path.join(CONFIG.outputDir, filename);
        validatePathWithinDir(filepath, CONFIG.outputDir);

        try {
          console.log(`Capturing: ${url} (${vp.name}: ${vp.width}x${vp.height})`);

          await withRetry(async () => {
            await page.goto(url, {
              waitUntil: 'networkidle0',
              timeout: CONFIG.timeout,
            });
          });

          await sleep(CONFIG.waitTime);
          await page.screenshot({ path: filepath, fullPage: CONFIG.fullPage });
          console.log(`Saved: ${filename}`);

          // 데스크톱 + 기본 라우트에서 WCAG / 스타일 / 성능 계측
          if (route === primaryRoute && vp.name === 'desktop') {
            styleMetrics = await collectStyleMetrics(page);
            perfMetrics = await collectPerfMetrics(page);
            koreanMetrics = await collectKoreanTypography(page);
            craftMetrics = await collectCraftMetrics(page);
            if (options.wcag) {
              console.log('Running WCAG accessibility check (desktop)...');
              wcagReport = await runAccessibilityCheck(page, url);
              if (wcagReport) {
                saveAccessibilityReport(wcagReport);
                console.log(`  Violations: ${wcagReport.summary.violations}`);
                console.log(`  Passes: ${wcagReport.summary.passes}`);
              }
            }
            // 상태 계약은 마지막에 — focus()가 DOM/앱 상태를 건드리므로 axe·스크린샷보다 뒤에 둔다.
            stateMetrics = await collectStateContract(page);
          }

          results.push({ route, viewport: vp.name, filename, success: true });

        } catch (error) {
          console.error(`Failed: ${url} - ${error.message}`);
          results.push({ route, viewport: vp.name, filename, success: false, error: error.message });
        }
      }
    }

    // 모바일 접근성 패스 — 터치 타겟 감사 + 모바일 axe (기본 라우트)
    let touchTargets = null;
    let wcagMobile = null;
    if (options.wcag) {
      try {
        await page.setViewport({ ...CONFIG.mobileViewport, isMobile: true, hasTouch: true });
        const mUrl = CONFIG.baseUrl + primaryRoute;
        console.log(`Mobile a11y pass: ${mUrl} (375x812)`);
        await withRetry(async () => {
          await page.goto(mUrl, { waitUntil: 'networkidle0', timeout: CONFIG.timeout });
        });
        await sleep(CONFIG.waitTime);
        touchTargets = await collectTouchTargets(page);
        if (touchTargets) {
          console.log(`  Touch targets: ${touchTargets.undersized}/${touchTargets.totalInteractive} undersized (<44px)`);
        }
        wcagMobile = await runAccessibilityCheck(page, mUrl);
        if (wcagMobile) {
          saveAccessibilityReport(wcagMobile, 'wcag-report-mobile.json');
          console.log(`  Mobile violations: ${wcagMobile.summary.violations}`);
        }
        if (touchTargets) {
          ensureDir(CONFIG.accessibilityDir);
          const tfp = path.join(CONFIG.accessibilityDir, 'touch-targets.json');
          validatePathWithinDir(tfp, CONFIG.accessibilityDir);
          fs.writeFileSync(tfp, JSON.stringify({ timestamp: new Date().toISOString(), ...touchTargets }, null, 2));
        }
      } catch (error) {
        console.error(`Mobile a11y pass failed: ${error.message}`);
      }
    }

    // Console error 저장
    saveConsoleErrors(consoleErrors, pageErrors);

    // ── 디자인 계약(.design-polish/design-decisions.json) 로드 + 룰 린트
    // 계약이 없으면 drift.enabled=false → styleFit은 기존 heuristic 산식 그대로 (하위호환).
    const contract = contractLib.readDesignContract(process.cwd());
    const storedBaseline = contractLib.readTokenBaseline(process.cwd());
    // 계약이 바뀌면 옛 동결은 다른 기준의 유물이다 — contractHash로 무효화(stale) 판정한다.
    // 그대로 두면 "허용 토큰을 바꿨는데 아무 위반도 안 잡히는" 영구 동결이 된다.
    const baselineState = contractLib.resolveTokenBaseline(storedBaseline, contract);
    let baseline = baselineState.baseline;
    const styleCapped = (styleMetrics && styleMetrics.capped) || {};
    let drift = contractLib.lintTokenDrift(
      styleMetrics && styleMetrics.values, contract, baseline, styleCapped
    );

    // 래칫 — 계약 도입 첫 회차(또는 계약 변경 직후)에는 현재 위반을 baseline으로 (재)동결한다.
    // (브라운필드에서 첫 실행부터 수백 건 위반으로 점수가 0이 되어 아무도 못 쓰는 교착 방지.
    //  이후 회차는 '새로 생긴 위반'만 -2로 강하게 처벌하고 baseline 잔여는 -0.1로 완만히 압박.
    //  수동 재기준선이 필요하면 token-baseline.json을 삭제하면 된다.)
    if (drift.enabled && !baseline) {
      contractLib.writeTokenBaseline(drift, process.cwd(), {
        contractHash: baselineState.contractHash,
        routes,
      });
      baseline = contractLib.readTokenBaseline(process.cwd());
      drift = contractLib.lintTokenDrift(styleMetrics && styleMetrics.values, contract, baseline, styleCapped);
      console.log(`  Token baseline ${baselineState.status === 'fresh' ? 'created' : 're-frozen'}: ${drift.totalViolations} violation(s) frozen (${baselineState.reason})`);
    } else if (drift.enabled && baselineState.needsRewrite) {
      // v2.5 baseline(contractHash 없음)을 채택했다 — 동결값은 그대로 두고 메타(해시·라우트)만 붙여 다시 쓴다.
      // 여기서 현재 위반으로 재동결하면 업그레이드 시점에 쌓인 신규 부채가 조용히 baseline에 흡수된다.
      contractLib.rewriteTokenBaselineMeta(baseline, process.cwd(), {
        contractHash: baselineState.contractHash,
        routes: (baseline.routes && baseline.routes.length > 0) ? baseline.routes : routes,
      });
      console.log(`  Token baseline adopted: legacy file kept, contractHash recorded (${baselineState.reason})`);
    }
    const baselineReport = drift.enabled
      ? {
          status: baselineState.status,
          reason: baselineState.reason,
          contractHash: baselineState.contractHash,
          createdAt: baseline ? baseline.createdAt : null,
          routes: baseline ? baseline.routes : null,
        }
      : { status: 'n/a', reason: (contract && contract.reason) || 'no contract' };

    const koreanLint = contractLib.lintKoreanTypography(koreanMetrics);
    const stateLint = contractLib.lintStateContract(stateMetrics);
    // 가독성·상투 패턴은 계약 없이 돈다. 계약의 ruleWaivers가 있으면 그 규칙만 면제로 옮긴다.
    // 계약 파일이 없거나 깨지면 readDesignContract가 ruleWaivers를 싣지 않으므로 빈 면제로 본다.
    const ruleWaivers = (contract && contract.ruleWaivers) || { waivers: [], invalid: [] };
    const readabilityLint = contractLib.applyRuleWaivers(
      craftLib.lintReadability(craftMetrics && craftMetrics.readability), ruleWaivers
    );
    const patternLint = contractLib.applyRuleWaivers(
      craftLib.lintSlopPatterns(craftMetrics && craftMetrics.patterns), ruleWaivers
    );
    const ruleFailures = contractLib.summarizeRuleFailures(drift, koreanLint, stateLint, readabilityLint, patternLint);
    const waiverReport = {
      active: ruleWaivers.waivers,
      invalid: ruleWaivers.invalid,
      applied: [...(readabilityLint.waived || []), ...(patternLint.waived || [])],
    };

    // 스코어 환산
    const consistency = scoreConsistency(styleMetrics, drift);
    const perf = scorePerformance(perfMetrics);

    // Design Health Score 산출 + 이력
    // 스코어링 전 중복 제거 — 지속적 에러가 뷰포트/모바일 재방문마다 중복 카운트되는 것 방지
    const scoredConsole = dedupeErrors(consoleErrors, (e) => `${e.type} ${e.text}`);
    const scoredPage = dedupeErrors(pageErrors, (e) => e.message || '');
    const healthScore = calculateDesignHealthScore(
      wcagReport, scoredConsole, scoredPage, consistency.score, perf.score
    );
    // styleMetrics.values는 값별 출현 목록(최대 200종×5범주)이라 리포트에 그대로 넣으면
    // health-score.json이 비대해진다. 위반 내역은 tokenDrift에 이미 담기므로 집계만 남긴다.
    const { values: _rawStyleValues, ...styleMetricsSummary } = styleMetrics || {};

    const savedReport = saveHealthScore(healthScore, {
      styleMetrics: styleMetrics ? styleMetricsSummary : null,
      styleScore: consistency,
      perfMetrics,
      perfScore: perf,
      touchTargets,
      wcagMobileViolations: wcagMobile ? wcagMobile.summary.violations : null,
      tokenDrift: drift,
      koreanTypography: koreanLint,
      stateContract: stateLint,
      readability: readabilityLint,
      slopPatterns: patternLint,
      ruleWaivers: waiverReport,
      ruleFailures,
    }, {
      // 측정 모드/라우트를 이력에 태깅 → 재캡처(8단계) 시 동종 baseline만 비교
      mode: options.wcag ? 'full' : 'no-wcag',
      route: primaryRoute,
      // 계약 유무로 styleFit 산식이 달라지므로 이력에 함께 태깅 (크로스 산식 비교 차단)
      styleMode: drift.enabled ? 'contract' : 'heuristic',
      // 뷰포트 집합이 다르면 콘솔 에러 수집량·모바일 패스 유무가 달라 점수 상한이 다르다
      viewports: viewportTag(viewportsToUse),
      baseline: baselineReport,
    });

    printRuleFailures(ruleFailures, drift, waiverReport);

    return {
      results,
      wcagReport,
      wcagMobile,
      healthScore: savedReport,
      touchTargets,
      tokenDrift: drift,
      ruleFailures,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
    };
  } finally {
    await browser.close();
  }
}

// 레퍼런스 URL 캡처 (여러 개 지원, 브라우저 재사용)
async function captureReferences(refs) {
  ensureDir(CONFIG.outputDir);
  console.log(`\nCapturing ${refs.length} reference(s)`);

  const browser = await createBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(CONFIG.viewport);

    const results = [];

    for (const { url, name } of refs) {
      // URL 검증: scheme + 내부 IP 차단 (SSRF 방지)
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          console.error(`Skipping reference: unsupported protocol "${parsed.protocol}" (only http/https allowed)`);
          continue;
        }
        const host = parsed.hostname.toLowerCase();
        const blockedHosts = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'];
        const blockedPrefixes = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];
        if (blockedHosts.includes(host) || blockedPrefixes.some(p => host.startsWith(p))) {
          console.error(`Skipping reference: internal/private address "${host}" blocked`);
          continue;
        }
      } catch {
        console.error(`Skipping reference: invalid URL "${url}"`);
        continue;
      }
      // Sanitize name to prevent path traversal
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `reference-${safeName}.png`;
      const filepath = path.join(CONFIG.outputDir, filename);
      // Verify resolved path stays within outputDir (validatePathWithinDir로 통일 — 형제 디렉토리 prefix 오탐 방지)
      try {
        validatePathWithinDir(filepath, CONFIG.outputDir);
      } catch (_) {
        console.error(`Skipping reference: resolved path escapes output directory`);
        continue;
      }

      try {
        console.log(`Capturing reference: ${url}`);

        await withRetry(async () => {
          await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.timeout,
          });
        });

        await sleep(CONFIG.waitTime);
        await page.screenshot({ path: filepath, fullPage: CONFIG.fullPage });
        console.log(`Saved: ${filename}`);
        results.push({ url, name, filename, success: true });

      } catch (error) {
        console.error(`Failed: ${url} - ${error.message}`);
        results.push({ url, name, filename, success: false, error: error.message });
      }
    }

    return { results };
  } finally {
    await browser.close();
  }
}

// WCAG 체크만 수행
async function wcagOnly(routes) {
  const probe = await probeTargets(CONFIG.baseUrl, routes);
  if (probe.down) {
    console.error(JSON.stringify({
      error: 'SERVER_DOWN', reason: probe.downReason, baseUrl: CONFIG.baseUrl, probes: probe.probes,
    }, null, 2));
    console.error(`Server not running: ${CONFIG.baseUrl} (${probe.downReason})`);
    console.error('개발 서버를 먼저 실행해주세요. (예: npm run dev)');
    process.exit(1);
  }
  for (const sk of probe.skipped) {
    console.warn(`Skipping route ${sk.route}: ${sk.reason}`);
  }
  for (const at of (probe.attempt || [])) {
    console.warn(`Probe inconclusive for ${at.route}: ${at.reason} — attempting capture anyway`);
  }
  const wcagRoutes = probe.reachable.concat((probe.attempt || []).map(a => a.route));
  if (wcagRoutes.length === 0) {
    console.error(JSON.stringify({
      error: 'NO_REACHABLE_ROUTE', baseUrl: CONFIG.baseUrl, skipped: probe.skipped,
    }, null, 2));
    process.exit(2);
  }
  routes = wcagRoutes;

  if (!AxePuppeteer) {
    console.error('axe-core/puppeteer not installed. Run: npm install @axe-core/puppeteer');
    process.exit(1);
  }

  console.log(`\nRunning WCAG check on: ${CONFIG.baseUrl}`);

  const browser = await createBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(CONFIG.viewport);

    const reports = [];
    const failures = [];

    for (const route of routes) {
      const url = CONFIG.baseUrl + route;

      try {
        console.log(`Checking: ${url}`);

        await withRetry(async () => {
          await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: CONFIG.timeout,
          });
        });

        await sleep(CONFIG.waitTime);

        const report = await runAccessibilityCheck(page, url);
        if (report) {
          const filename = `wcag-report-${sanitizeRouteName(route)}.json`;
          saveAccessibilityReport(report, filename);
          reports.push(report);

          console.log(`  Violations: ${report.summary.violations}`);
          console.log(`  Passes: ${report.summary.passes}`);
        }

      } catch (error) {
        console.error(`Failed: ${url} - ${error.message}`);
        failures.push({ route, error: error.message });
      }
    }

    return { reports, failures };
  } finally {
    await browser.close();
  }
}

// ============================================
// CLI
// ============================================

function printHelp() {
  console.log(`
Design Polish Capture Script

Usage:
  node capture.cjs [options] [routes...]
  node capture.cjs ref <url> <name> [<url> <name> ...]

Options:
  --wcag         Include WCAG accessibility check (default)
  --wcag-only    Run only WCAG check, no screenshots
  --no-wcag      Skip WCAG check (also skips mobile a11y + touch audit)
  --responsive   Capture mobile (375x812), tablet (768x1024), desktop (1280x720)
  --help, -h     Show this help

Commands:
  (default)     Capture local project pages
  ref           Capture external reference URLs

Measurement (default local run):
  - Screenshot (desktop, or all viewports with --responsive)
  - WCAG axe-core: desktop + mobile viewport
  - Style consistency (rendered computed-style distribution) → styleFit score
  - Performance (navigation/paint/resource timing) → performance score
  - Touch-target audit (mobile, interactive elements < 44x44px)
  - Design Health Score (0-100) + regression vs previous run + append history

Examples:
  # Local project with full measurement
  node capture.cjs /                     # Main page
  node capture.cjs / /about /pricing     # Multiple pages

  # WCAG only
  node capture.cjs --wcag-only /

  # No WCAG (screenshot + style + perf only)
  node capture.cjs --no-wcag /

  # References
  node capture.cjs ref "https://dribbble.com/..." hero

Environment Variables:
  BASE_URL     Local server URL (default: http://localhost:3000)
  OUTPUT_DIR   Screenshot directory (default: .design-polish/screenshots)
  A11Y_DIR     Accessibility report directory (default: .design-polish/accessibility)
  WAIT_TIME    Wait time after page load in ms (default: 2000)
  TIMEOUT      Page load timeout in ms (default: 30000)
  RETRIES      Navigation retry count (default: 2)
  FULL_PAGE    Capture full page (default: false)

Output:
  (health-score.json / health-history.jsonl are always written to <cwd>/.design-polish,
   regardless of OUTPUT_DIR / A11Y_DIR — those only relocate screenshots / a11y reports.)
  .design-polish/
  ├── health-score.json          # latest score + breakdown + regression + metrics
  ├── health-history.jsonl       # append-only score history (mode/route tagged; stagnation detection)
  ├── screenshots/
  │   ├── current-main.png
  │   └── reference-*.png
  └── accessibility/
      ├── wcag-report.json        # desktop
      ├── wcag-report-mobile.json # mobile
      ├── touch-targets.json      # undersized interactive elements
      └── console-errors.json
`);
}

// 캡처 결과 → 성공 판정. **순수 함수**(테스트 대상).
//
// 프로브에서 걸러진 라우트(`skipped`)는 **시도하지 않은 것**이지 실패한 것이 아니다.
// 예전에는 이 항목들이 `success: false`로 결과 배열에 들어가 `every(r => r.success !== false)`를
// 무너뜨렸고, 404 라우트 하나가 나머지 라우트를 전부 정상 캡처한 실행을 exit 1로 만들었다
// (프로브가 "총체적 abort"를 없애려고 도입됐는데 종료 코드에서 되살아난 셈).
function summarizeCaptureResults(results) {
  const list = (Array.isArray(results) ? results : []).filter(Boolean);
  const skipped = list.filter(r => r.skipped);
  const attempted = list.filter(r => !r.skipped);
  const failed = attempted.filter(r => r.success === false);
  return {
    total: list.length,
    attempted: attempted.length,
    skipped: skipped.length,
    failed: failed.length,
    success: attempted.length > 0 && failed.length === 0,
  };
}

function printJsonResult(type, data) {
  let allSuccess;
  let summary = null;
  if (type === 'wcag' && data.reports) {
    allSuccess = data.reports.length > 0 && (!data.failures || data.failures.length === 0);
  } else {
    summary = summarizeCaptureResults(data.results || data.screenshots || []);
    allSuccess = summary.success;
  }
  const output = {
    success: allSuccess,
    type,
    outputDir: CONFIG.outputDir,
    ...data,
    ...(summary ? { resultSummary: summary } : {}),
  };
  console.log('\n--- JSON_RESULT_START ---');
  console.log(JSON.stringify(output, null, 2));
  console.log('--- JSON_RESULT_END ---');
  return allSuccess;
}

async function main() {
  loadDeps();
  const args = process.argv.slice(2);

  // 옵션 파싱
  let wcagMode = 'include'; // 'include', 'only', 'skip'
  let responsive = false;
  const filteredArgs = [];

  for (const arg of args) {
    if (arg === '--wcag') {
      wcagMode = 'include';
    } else if (arg === '--wcag-only') {
      wcagMode = 'only';
    } else if (arg === '--no-wcag') {
      wcagMode = 'skip';
    } else if (arg === '--responsive') {
      responsive = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else {
      filteredArgs.push(arg);
    }
  }

  if (filteredArgs.length === 0) {
    // 기본: 메인 페이지 캡처
    if (wcagMode === 'only') {
      const data = await wcagOnly(['/']);
      if (!printJsonResult('wcag', data)) process.exitCode = 1;
    } else {
      const data = await captureLocal(['/'], { wcag: wcagMode !== 'skip', responsive });
      if (!printJsonResult('local', data)) process.exitCode = 1;
    }
    return;
  }

  if (filteredArgs[0] === 'ref') {
    // 레퍼런스 캡처
    const refs = [];
    for (let i = 1; i < filteredArgs.length; i += 2) {
      if (filteredArgs[i] && filteredArgs[i + 1]) {
        refs.push({ url: filteredArgs[i], name: filteredArgs[i + 1] });
      }
    }

    if (refs.length === 0) {
      console.error('Usage: ref <url> <name> [<url> <name> ...]');
      process.exit(1);
    }

    const data = await captureReferences(refs);
    if (!printJsonResult('reference', data)) process.exitCode = 1;
    return;
  }

  // 로컬 라우트 캡처
  if (wcagMode === 'only') {
    const data = await wcagOnly(filteredArgs);
    if (!printJsonResult('wcag', data)) process.exitCode = 1;
  } else {
    const data = await captureLocal(filteredArgs, { wcag: wcagMode !== 'skip', responsive });
    if (!printJsonResult('local', data)) process.exitCode = 1;
  }
}

// 순수 함수는 puppeteer 없이 테스트 가능하도록 export.
// main()은 직접 실행(require.main)일 때만 구동.
module.exports = {
  scoreConsistency,
  scoreTokenDriftPenalty,
  summarizeCaptureResults,
  classifyProbes,
  probeTargets,
  checkServer,
  probeTimeout,
  PROBE_TIMEOUT_MAX,
  collectFocusVisibility,
  collectCraftMetrics,
  CRAFT_CAPS,
  CONTRACT_PENALTY,
  STYLE_FIT_MAX,
  scorePerformance,
  calculateDesignHealthScore,
  dedupeErrors,
  classifyRegression,
  REGRESSION_TOLERANCE,
  classifyStagnation,
  STAGNATION_RUNS,
  buildHealthScore,
  viewportTag,
  readHealthHistory,
  sanitizeRouteName,
  validatePathWithinDir,
  readPreviousScore,
  printRuleFailures,
  printJsonResult,
  // 계약 린트는 design-contract.cjs의 순수 함수를 재노출 (테스트/게이트 소비 편의)
  contract: contractLib,
  craft: craftLib,
};

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
