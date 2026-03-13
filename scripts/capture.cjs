#!/usr/bin/env node
// design-polish plugin - capture script with WCAG accessibility checks

const fs = require('fs');
const path = require('path');
const os = require('os');

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
  waitTime: Math.max(0, parseInt(process.env.WAIT_TIME, 10) || 2000),
  timeout: Math.max(1, parseInt(process.env.TIMEOUT, 10) || 30000),
  retries: Math.max(0, parseInt(process.env.RETRIES, 10) || 2),
  fullPage: process.env.FULL_PAGE === 'true' || false,
};

// ============================================
// 의존성 로드
// ============================================

let puppeteer;
let AxePuppeteer;

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
// Design Health Score 산출
// ============================================

function calculateDesignHealthScore(wcagReport, consoleErrors, pageErrors) {
  let score = 100;
  const breakdown = {};

  // WCAG Critical: 30% weight
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

  // Console errors: 20% weight
  const errorCount = (consoleErrors || []).filter(e => e.type === 'error').length + (pageErrors || []).length;
  breakdown.consoleErrors = Math.max(0, 20 - (errorCount * 5));

  // Style fit placeholder: 15%
  breakdown.styleFit = 15;

  // Performance placeholder: 15%
  breakdown.performance = 15;

  score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { score: Math.max(0, Math.min(100, score)), breakdown };
}

function saveHealthScore(healthScore) {
  const healthScoreDir = path.join(process.cwd(), '.design-polish');
  ensureDir(healthScoreDir);
  const filepath = path.join(healthScoreDir, 'health-score.json');
  validatePathWithinDir(filepath, healthScoreDir);

  // Regression baseline 비교
  let regression = null;
  const resolvedPath = path.resolve(filepath);
  if (fs.existsSync(resolvedPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
      const diff = healthScore.score - (prev.score || 0);
      regression = {
        previousScore: prev.score || 0,
        currentScore: healthScore.score,
        diff,
        status: diff < 0 ? 'regression' : diff > 0 ? 'improved' : 'unchanged',
      };
    } catch (_) { /* ignore parse errors */ }
  }

  const report = {
    ...healthScore,
    timestamp: new Date().toISOString(),
    regression,
  };

  fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2));
  console.log(`Design Health Score: ${healthScore.score}/100`);
  if (regression) {
    console.log(`  ${regression.status}: ${regression.previousScore} → ${regression.currentScore} (${regression.diff >= 0 ? '+' : ''}${regression.diff})`);
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

          // WCAG 체크 (desktop 뷰포트, 첫 번째 라우트에서만)
          if (options.wcag && route === routes[0] && vp.name === 'desktop') {
            console.log('Running WCAG accessibility check...');
            wcagReport = await runAccessibilityCheck(page, url);
            if (wcagReport) {
              saveAccessibilityReport(wcagReport);
              console.log(`  Violations: ${wcagReport.summary.violations}`);
              console.log(`  Passes: ${wcagReport.summary.passes}`);
            }
          }

          results.push({ route, viewport: vp.name, filename, success: true });

        } catch (error) {
          console.error(`Failed: ${url} - ${error.message}`);
          results.push({ route, viewport: vp.name, filename, success: false, error: error.message });
        }
      }
    }

    // Console error 저장
    saveConsoleErrors(consoleErrors, pageErrors);

    // Design Health Score 산출
    const healthScore = calculateDesignHealthScore(wcagReport, consoleErrors, pageErrors);
    saveHealthScore(healthScore);

    return { results, wcagReport, healthScore, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length };
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
      // Verify resolved path stays within outputDir
      if (!path.resolve(filepath).startsWith(path.resolve(CONFIG.outputDir))) {
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
  --no-wcag      Skip WCAG check
  --responsive   Capture mobile (375x812), tablet (768x1024), desktop (1280x720)
  --help, -h     Show this help

Commands:
  (default)     Capture local project pages
  ref           Capture external reference URLs

Examples:
  # Local project with WCAG
  node capture.cjs /                     # Main page + WCAG
  node capture.cjs / /about /pricing     # Multiple pages

  # WCAG only
  node capture.cjs --wcag-only /

  # No WCAG
  node capture.cjs --no-wcag /

  # References
  node capture.cjs ref "https://dribbble.com/..." hero

Environment Variables:
  BASE_URL     Local server URL (default: http://localhost:3000)
  OUTPUT_DIR   Screenshot directory (default: .design-polish/screenshots)
  A11Y_DIR     Accessibility report directory (default: .design-polish/accessibility)
  WAIT_TIME    Wait time after page load in ms (default: 2000)
  TIMEOUT      Page load timeout in ms (default: 30000)
  FULL_PAGE    Capture full page (default: false)

Output:
  .design-polish/
  ├── screenshots/
  │   ├── current-main.png
  │   └── reference-*.png
  └── accessibility/
      └── wcag-report.json
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

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
