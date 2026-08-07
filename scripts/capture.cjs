#!/usr/bin/env node
// design-polish plugin - capture script with WCAG accessibility checks
//
// Measurement engine:
//   - WCAG (axe-core): desktop + mobile viewport
//   - Console/page errors
//   - Style consistency (rendered-DOM computed-style distribution → styleFit score)
//   - Performance (Navigation/Paint/Resource timing → performance score)
//   - Touch-target audit (mobile viewport, interactive elements < 44x44)
//   - Design Health Score (0-100) with regression + append-only history
//
// 스코어 산출은 브라우저 계측(collect*)과 순수 함수(score*)로 분리되어 있어,
// 순수 함수는 puppeteer 없이 단위 테스트가 가능하다 (tests/scoring.test.cjs).

const fs = require('fs');
const path = require('path');

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
  waitTime: Math.max(0, parseInt(process.env.WAIT_TIME, 10) || 2000),
  timeout: Math.max(1, parseInt(process.env.TIMEOUT, 10) || 30000),
  retries: Math.max(0, parseInt(process.env.RETRIES, 10) || 2),
  fullPage: process.env.FULL_PAGE === 'true' || false,
};

// ============================================
// 순수 스코어러 (브라우저 불필요 — 단위 테스트 대상)
// ============================================

// 일관성 스코어 (styleFit, 0-15).
// 잘 설계된 디자인 시스템은 distinct 값이 제한적이다. 값이 난립할수록 감점.
// 임계값은 휴리스틱이며 조정 가능 (tunable). sampled 부족 시 만점 방지.
function scoreConsistency(m) {
  const detail = {};
  if (!m || !m.sampled || m.sampled < 10) {
    // 측정 표본 부족 — 빈/오류 페이지가 '일관적'으로 만점을 얻는 것을 방지.
    return { score: 7, insufficient: true, sampled: (m && m.sampled) || 0, detail };
  }
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
  const score = Math.max(0, Math.min(15, 15 - penalty));
  return { score: Math.round(score * 100) / 100, insufficient: false, sampled: m.sampled, detail };
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

async function checkServer(url) {
  const http = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      resolve({ ok, status: res.statusCode });
    });
    req.on('error', () => resolve({ ok: false, status: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
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
      const els = Array.from(document.querySelectorAll('body *'));
      const rad = new Set(), fonts = new Set(), colors = new Set(), space = new Set(), shadow = new Set();
      let sampled = 0;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue; // 숨김/미표시 제외
        const cs = getComputedStyle(el);
        sampled++;
        const br = cs.borderTopLeftRadius;
        if (br && br !== '0px') rad.add(br);
        if (cs.fontFamily) fonts.add(cs.fontFamily.split(',')[0].trim().toLowerCase().replace(/["']/g, ''));
        if (cs.color && cs.color !== 'rgba(0, 0, 0, 0)') colors.add(cs.color);
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.add(cs.backgroundColor);
        for (const p of [cs.paddingTop, cs.paddingLeft, cs.marginTop, cs.marginLeft, cs.rowGap, cs.columnGap]) {
          if (p && p !== '0px' && p !== 'normal') space.add(p);
        }
        if (cs.boxShadow && cs.boxShadow !== 'none') shadow.add(cs.boxShadow);
      }
      return {
        sampled,
        borderRadiusCount: rad.size,
        fontFamilyCount: fonts.size,
        colorCount: colors.size,
        spacingCount: space.size,
        shadowCount: shadow.size,
        fontFamilies: Array.from(fonts).slice(0, 20),
        borderRadiusValues: Array.from(rad).slice(0, 20),
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
function readPreviousScore(mode, route) {
  const fp = path.join(process.cwd(), '.design-polish', 'health-history.jsonl');
  try {
    if (!fs.existsSync(fp)) return null;
    const lines = fs.readFileSync(fp, 'utf-8').split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry;
      try { entry = JSON.parse(lines[i]); } catch (_) { continue; }
      if (typeof entry.score !== 'number') continue;
      if (mode != null && entry.mode !== mode) continue;   // 동일 측정 모드만
      if (route != null && entry.route !== route) continue; // 동일 라우트만
      return entry.score;
    }
    return null;
  } catch (_) {
    return null;
  }
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

function saveHealthScore(healthScore, extras = {}, meta = {}) {
  const healthScoreDir = path.join(process.cwd(), '.design-polish');
  ensureDir(healthScoreDir);
  const filepath = path.join(healthScoreDir, 'health-score.json');
  validatePathWithinDir(filepath, healthScoreDir);

  const mode = meta.mode || 'full';
  const route = meta.route || '/';

  // Regression baseline 비교 — 이력 파일에서 동일 mode+route 직전 회차 기준 (append 전에 읽음)
  const previousScore = readPreviousScore(mode, route);
  let regression = null;
  if (previousScore != null) {
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
    };
  }

  const report = {
    ...healthScore,
    ...extras,
    mode,
    route,
    timestamp: new Date().toISOString(),
    regression,
  };

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
  appendHealthHistory(report);

  console.log(`Design Health Score: ${healthScore.score}/100`);
  console.log(`  breakdown: wcagCritical ${report.breakdown.wcagCritical}, wcagSerious ${report.breakdown.wcagSerious}, console ${report.breakdown.consoleErrors}, styleFit ${report.breakdown.styleFit}, performance ${report.breakdown.performance}`);
  if (regression) {
    console.log(`  ${regression.status}: ${regression.previousScore} → ${regression.currentScore} (${regression.diff >= 0 ? '+' : ''}${regression.diff})`);
  }
  return report;
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
  // 서버 상태 확인
  const serverStatus = await checkServer(CONFIG.baseUrl);
  if (!serverStatus.ok) {
    console.error(`Server not running: ${CONFIG.baseUrl}`);
    console.log('\n개발 서버를 먼저 실행해주세요. (예: npm run dev)');
    process.exit(1);
  }

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

    const results = [];
    let wcagReport = null;
    let styleMetrics = null;
    let perfMetrics = null;
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
            if (options.wcag) {
              console.log('Running WCAG accessibility check (desktop)...');
              wcagReport = await runAccessibilityCheck(page, url);
              if (wcagReport) {
                saveAccessibilityReport(wcagReport);
                console.log(`  Violations: ${wcagReport.summary.violations}`);
                console.log(`  Passes: ${wcagReport.summary.passes}`);
              }
            }
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

    // 스코어 환산
    const consistency = scoreConsistency(styleMetrics);
    const perf = scorePerformance(perfMetrics);

    // Design Health Score 산출 + 이력
    // 스코어링 전 중복 제거 — 지속적 에러가 뷰포트/모바일 재방문마다 중복 카운트되는 것 방지
    const scoredConsole = dedupeErrors(consoleErrors, (e) => `${e.type} ${e.text}`);
    const scoredPage = dedupeErrors(pageErrors, (e) => e.message || '');
    const healthScore = calculateDesignHealthScore(
      wcagReport, scoredConsole, scoredPage, consistency.score, perf.score
    );
    const savedReport = saveHealthScore(healthScore, {
      styleMetrics,
      styleScore: consistency,
      perfMetrics,
      perfScore: perf,
      touchTargets,
      wcagMobileViolations: wcagMobile ? wcagMobile.summary.violations : null,
    }, {
      // 측정 모드/라우트를 이력에 태깅 → 재캡처(8단계) 시 동종 baseline만 비교
      mode: options.wcag ? 'full' : 'no-wcag',
      route: primaryRoute,
    });

    return {
      results,
      wcagReport,
      wcagMobile,
      healthScore: savedReport,
      touchTargets,
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
  const serverStatus = await checkServer(CONFIG.baseUrl);
  if (!serverStatus.ok) {
    console.error(`Server not running: ${CONFIG.baseUrl}`);
    console.log('\n개발 서버를 먼저 실행해주세요. (예: npm run dev)');
    process.exit(1);
  }

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

function printJsonResult(type, data) {
  let allSuccess;
  if (type === 'wcag' && data.reports) {
    allSuccess = data.reports.length > 0 && (!data.failures || data.failures.length === 0);
  } else {
    const results = data.results || data.screenshots || [];
    allSuccess = results.length > 0 && results.every(r => r.success !== false);
  }
  const output = {
    success: allSuccess,
    type,
    outputDir: CONFIG.outputDir,
    ...data
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
  scorePerformance,
  calculateDesignHealthScore,
  dedupeErrors,
  classifyRegression,
  sanitizeRouteName,
  validatePathWithinDir,
  readPreviousScore,
};

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
