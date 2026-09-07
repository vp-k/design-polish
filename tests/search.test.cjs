#!/usr/bin/env node
// search.test.cjs - search.cjs 순수 함수(토크나이저/BM25) 단위 테스트
// 실행: node tests/search.test.cjs   또는   npm test
//
// L5 회귀 방지: 토크나이저가 ASCII 밖 문자를 통째로 버리면 한글 질의와
// data/*.json 안의 한글 설명이 색인에서 사라진다(조용한 검색 품질 저하).

'use strict';

const assert = require('assert');
const S = require('../scripts/search.cjs');

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

// == tokenize ==
test('tokenize: 영문/숫자를 소문자 토큰으로 나눈다', () => {
  assert.deepStrictEqual(S.tokenize('Glass Modern SaaS'), ['glass', 'modern', 'saas']);
});

test('tokenize: 한글이 살아남는다 (L5 핵심)', () => {
  assert.deepStrictEqual(S.tokenize('의료 차분한 신뢰'), ['의료', '차분한', '신뢰']);
});

test('tokenize: 한글+영문 혼합 질의도 양쪽 다 남는다', () => {
  assert.deepStrictEqual(S.tokenize('핀테크 fintech 대시보드'), ['핀테크', 'fintech', '대시보드']);
});

test('tokenize: hex 색상·버전·복합어 문자는 보존한다', () => {
  assert.deepStrictEqual(S.tokenize('#0F172A'), ['#0f172a']);
  assert.deepStrictEqual(S.tokenize('material-3'), ['material-3']);
  assert.deepStrictEqual(S.tokenize('v2.5'), ['v2.5']);
});

test('tokenize: 문장부호는 구분자로 처리하고 1글자 토큰은 버린다', () => {
  assert.deepStrictEqual(S.tokenize('calm, trustworthy; a b medical!'), ['calm', 'trustworthy', 'medical']);
});

test('tokenize: 빈 입력/null 안전', () => {
  assert.deepStrictEqual(S.tokenize(''), []);
  assert.deepStrictEqual(S.tokenize(null), []);
  assert.deepStrictEqual(S.tokenize(undefined), []);
});

test('tokenize: CJK 외 비ASCII(일본어/키릴/악센트)도 보존', () => {
  assert.deepStrictEqual(S.tokenize('café Москва デザイン'), ['café', 'москва', 'デザイン']);
});

// == BM25 ==
const DOCS = [
  { name: 'Glassmorphism', keywords: 'glass blur translucent', mood: '가볍고 투명한' },
  { name: 'Brutalism', keywords: 'raw bold harsh', mood: '거칠고 강한' },
  { name: 'Medical Calm', keywords: 'calm trust clinical', mood: '의료 차분한 신뢰' },
];
const fields = d => [d.name, d.keywords, d.mood];

test('BM25: 영문 질의가 해당 문서를 최상단으로 올린다', () => {
  const hits = new S.BM25(DOCS, fields).search('glass blur', 3);
  assert.ok(hits.length > 0);
  assert.strictEqual(hits[0].data.name, 'Glassmorphism');
});

test('BM25: 한글 질의도 매칭된다 (수정 전에는 0건이었음)', () => {
  const hits = new S.BM25(DOCS, fields).search('의료 차분한', 3);
  assert.ok(hits.length > 0, '한글 질의가 0건 - 토크나이저 회귀');
  assert.strictEqual(hits[0].data.name, 'Medical Calm');
});

test('BM25: 매칭 없으면 빈 배열', () => {
  assert.deepStrictEqual(new S.BM25(DOCS, fields).search('quantum tunneling', 3), []);
  assert.deepStrictEqual(new S.BM25(DOCS, fields).search('', 3), []);
});

test('BM25: 결정론적 - 같은 질의는 같은 순위·같은 점수', () => {
  const a = new S.BM25(DOCS, fields).search('bold raw', 3);
  const b = new S.BM25(DOCS, fields).search('bold raw', 3);
  assert.deepStrictEqual(a, b);
});

test('BM25: max 인자로 결과 수를 자른다', () => {
  const hits = new S.BM25(DOCS, fields).search('glass raw calm', 1);
  assert.strictEqual(hits.length, 1);
});

test('BM25: 빈 코퍼스에서도 죽지 않는다 (avgDL 0 나눗셈 방지)', () => {
  assert.deepStrictEqual(new S.BM25([], fields).search('glass', 3), []);
});

test('BM25 파라미터가 표준값으로 고정되어 있다', () => {
  assert.strictEqual(S.K1, 1.5);
  assert.strictEqual(S.B, 0.75);
});

// == countData (L3: 문서에 박힌 숫자 대신 실측) ==
test('countData: 실제 데이터 건수를 센다', () => {
  for (const f of ['styles.json', 'colors.json', 'typography.json']) {
    const n = S.countData(f);
    assert.strictEqual(typeof n, 'number', `${f} 건수를 세지 못함`);
    assert.ok(n > 0, `${f} 건수가 0`);
  }
});

test('countData: 없는 파일은 던지지 않고 물음표를 돌려준다', () => {
  assert.strictEqual(S.countData('nope.json'), '?');
});

// == CLI 파싱/도메인 감지 ==
test('parseArgs: 플래그와 질의를 분리한다', () => {
  const a = S.parseArgs(['node', 'search.cjs', '--domain', 'color', '--max', '5', 'fintech', 'blue']);
  assert.strictEqual(a.domain, 'color');
  assert.strictEqual(a.max, 5);
  assert.strictEqual(a.query, 'fintech blue');
});

test('detectDomain: 신호어로 도메인을 고르고 기본은 style', () => {
  assert.strictEqual(S.detectDomain('healthcare palette blue'), 'color');
  assert.strictEqual(S.detectDomain('serif heading pairing'), 'typography');
  assert.strictEqual(S.detectDomain('무언가 알 수 없는 질의'), 'style');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
