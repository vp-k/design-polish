#!/usr/bin/env node
/**
 * BM25 search engine for design-polish knowledge base.
 * Searches styles, colors, typography, and stack guides.
 *
 * Usage:
 *   node search.cjs --domain style "glass modern saas"
 *   node search.cjs --domain color "healthcare calm"
 *   node search.cjs --domain typography "luxury elegant"
 *   node search.cjs --domain stack --stack react "performance image"
 *   node search.cjs "saas dashboard blue"       # auto-detect domain
 *   node search.cjs --domain color --max 5 "fintech"
 *
 * Output: JSON to stdout
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── Data directory ──
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── BM25 parameters ──
const K1 = 1.5;
const B = 0.75;

// ── Tokenizer ──
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().replace(/[^a-z0-9.\s#-]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

// ── BM25 Search ──
class BM25 {
  constructor(docs, getTextFields) {
    this.docs = docs;
    this.getTextFields = getTextFields;

    // Tokenize all documents
    this.docTokens = docs.map(doc => {
      const fields = getTextFields(doc);
      return tokenize(fields.join(' '));
    });

    // Compute average document length
    const totalLen = this.docTokens.reduce((sum, t) => sum + t.length, 0);
    this.avgDL = totalLen / (this.docs.length || 1);

    // Build inverted index: term -> Set of doc indices
    this.index = new Map();
    this.docTokens.forEach((tokens, docIdx) => {
      const seen = new Set(tokens);
      for (const token of seen) {
        if (!this.index.has(token)) this.index.set(token, new Set());
        this.index.get(token).add(docIdx);
      }
    });

    this.N = this.docs.length;
  }

  search(query, maxResults = 3) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = new Array(this.N).fill(0);

    for (const term of queryTokens) {
      const docSet = this.index.get(term);
      if (!docSet) continue;

      const df = docSet.size;
      // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((this.N - df + 0.5) / (df + 0.5) + 1);

      for (const docIdx of docSet) {
        const tokens = this.docTokens[docIdx];
        const dl = tokens.length;
        // Term frequency in this doc
        let tf = 0;
        for (const t of tokens) { if (t === term) tf++; }
        // BM25 score component
        const numerator = tf * (K1 + 1);
        const denominator = tf + K1 * (1 - B + B * (dl / this.avgDL));
        scores[docIdx] += idf * (numerator / denominator);
      }
    }

    // Collect and sort results
    const results = [];
    for (let i = 0; i < this.N; i++) {
      if (scores[i] > 0) {
        results.push({ score: Math.round(scores[i] * 100) / 100, data: this.docs[i] });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }
}

// ── Domain handlers ──
function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`Error: ${filepath} not found`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`Error: Failed to parse ${filepath}: ${e.message}`);
    process.exit(1);
  }
}

function searchStyles(query, max) {
  const data = loadJSON('styles.json');
  const engine = new BM25(data, doc => [
    doc.name, doc.keywords, doc.colors, doc.effects,
    (doc.bestFor || []).join(' '), doc.cssHints, doc.aiPrompt
  ]);
  return engine.search(query, max);
}

function searchColors(query, max) {
  const data = loadJSON('colors.json');
  const engine = new BM25(data, doc => [
    doc.name, doc.keywords, doc.industry, doc.mood,
    doc.primary, doc.secondary, doc.cta
  ]);
  return engine.search(query, max);
}

function searchTypography(query, max) {
  const data = loadJSON('typography.json');
  const engine = new BM25(data, doc => [
    doc.name, doc.keywords, doc.category, doc.heading,
    doc.body, doc.mood, (doc.bestFor || []).join(' ')
  ]);
  return engine.search(query, max);
}

function searchStack(query, stackName, max) {
  const data = loadJSON('stacks.json');
  if (!stackName) {
    console.error('Error: --stack <name> required for stack domain');
    console.error('Available stacks:', Object.keys(data).join(', '));
    process.exit(1);
  }
  const stackData = data[stackName];
  if (!stackData) {
    console.error(`Error: stack "${stackName}" not found`);
    console.error('Available stacks:', Object.keys(data).join(', '));
    process.exit(1);
  }
  const engine = new BM25(stackData, doc => [
    doc.category, doc.guideline, doc.description, doc.do, doc.dont
  ]);
  return engine.search(query, max);
}

// ── Auto-detect domain from query ──
function detectDomain(query) {
  const q = query.toLowerCase();
  const colorSignals = ['color', 'palette', 'hex', '#', 'blue', 'red', 'green', 'orange',
    'purple', 'pink', 'yellow', 'dark', 'light', 'warm', 'cool', 'neon', 'pastel',
    'monochrome', 'vibrant', 'gradient'];
  const typoSignals = ['font', 'typography', 'heading', 'body', 'serif', 'sans',
    'mono', 'pairing', 'typeface', 'letter', 'text'];
  const stackSignals = ['react', 'vue', 'svelte', 'flutter', 'next', 'nuxt', 'swift',
    'component', 'hook', 'state', 'route', 'widget'];
  const styleSignals = ['glass', 'morphism', 'minimal', 'brutal', 'retro', 'modern',
    'flat', 'neumorphism', 'clay', 'aurora', 'bento', 'style', 'design'];

  let colorScore = 0, typoScore = 0, stackScore = 0, styleScore = 0;
  const tokens = q.split(/\s+/);
  for (const t of tokens) {
    if (colorSignals.some(s => t.includes(s))) colorScore++;
    if (typoSignals.some(s => t.includes(s))) typoScore++;
    if (stackSignals.some(s => t.includes(s))) stackScore++;
    if (styleSignals.some(s => t.includes(s))) styleScore++;
  }

  const max = Math.max(colorScore, typoScore, stackScore, styleScore);
  if (max === 0) return 'style'; // default
  if (styleScore === max) return 'style';
  if (colorScore === max) return 'color';
  if (typoScore === max) return 'typography';
  // Stack requires --stack flag; fall back to style in auto-detect mode
  if (stackScore === max) return 'style';
}

// ── CLI parsing ──
function parseArgs(argv) {
  const args = { domain: null, stack: null, max: 3, query: '' };
  const raw = argv.slice(2);
  const queryParts = [];

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i];
    if (arg === '--domain' && raw[i + 1]) {
      args.domain = raw[++i];
    } else if (arg === '--stack' && raw[i + 1]) {
      args.stack = raw[++i];
    } else if (arg === '--max' && raw[i + 1]) {
      args.max = parseInt(raw[++i], 10) || 3;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      queryParts.push(arg);
    }
  }

  args.query = queryParts.join(' ');
  return args;
}

function printUsage() {
  console.log(`
design-polish search - BM25 search engine for design knowledge base

Usage:
  node search.cjs --domain <domain> [options] "<query>"
  node search.cjs "<query>"                    # auto-detect domain

Domains:
  style       Search 67 design styles
  color       Search 96 color palettes
  typography  Search 57 typography pairings
  stack       Search tech stack guides (requires --stack)
  all         Search style + color + typography simultaneously

Options:
  --domain <name>   Specify search domain
  --stack <name>    Stack name for stack domain (react, flutter, vue, etc.)
  --max <n>         Max results (default: 3)
  -h, --help        Show this help

Examples:
  node search.cjs --domain style "glass modern saas"
  node search.cjs --domain color "healthcare calm"
  node search.cjs --domain typography "luxury elegant"
  node search.cjs --domain stack --stack react "performance image"
  node search.cjs "saas dashboard blue"
  node search.cjs --domain color --max 5 "fintech"
`);
}

// ── Main ──
function main() {
  const args = parseArgs(process.argv);

  if (!args.query) {
    printUsage();
    process.exit(1);
  }

  // Auto-detect domain if not specified
  if (!args.domain) {
    args.domain = detectDomain(args.query);
  }

  let results;
  switch (args.domain) {
    case 'style':
      results = searchStyles(args.query, args.max);
      break;
    case 'color':
      results = searchColors(args.query, args.max);
      break;
    case 'typography':
      results = searchTypography(args.query, args.max);
      break;
    case 'stack':
      results = searchStack(args.query, args.stack, args.max);
      break;
    case 'all':
      results = {
        style: searchStyles(args.query, args.max),
        color: searchColors(args.query, args.max),
        typography: searchTypography(args.query, args.max)
      };
      break;
    default:
      console.error(`Unknown domain: ${args.domain}`);
      process.exit(1);
  }

  const output = {
    domain: args.domain,
    query: args.query,
    results
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
