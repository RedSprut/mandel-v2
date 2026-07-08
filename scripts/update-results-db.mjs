#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_OUT = path.join(ROOT, 'results.json');
const TODAY = new Date();
const CURRENT_YEAR = TODAY.getUTCFullYear();
const HTTP_TIMEOUT_MS = 12000;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

const ITALIAN_MONTHS = {
  gen: 1, gennaio: 1,
  feb: 2, febbraio: 2,
  mar: 3, marzo: 3,
  apr: 4, aprile: 4,
  mag: 5, maggio: 5,
  giu: 6, giugno: 6,
  lug: 7, luglio: 7,
  ago: 8, agosto: 8,
  set: 9, settembre: 9,
  ott: 10, ottobre: 10,
  nov: 11, novembre: 11,
  dic: 12, dicembre: 12
};

const GAME_ORDER = [
  'lotto',
  'vikinglotto',
  'eurojackpot',
  'powerball',
  'megaMillions',
  'euroMillions',
  'superEnalotto',
  'lottoMax',
  'powerballAustralia'
];

const RULES = {
  lotto: {
    mainCount: 7, mainMax: 34, bonusCount: 1, bonusMax: 34,
    currentFrom: '2017-01-01',
    source: 'Norsk Tipping',
    sourceUrl: 'https://www.norsk-tipping.no/lotteri/lotto/resultater'
  },
  vikinglotto: {
    mainCount: 6, mainMax: 48, bonusCount: 1, bonusMax: 5,
    archiveFrom: '2017-05-24',
    currentFrom: '2022-01-05',
    source: 'Viking-Lotto.net / Norsk Tipping',
    sourceUrl: 'https://viking-lotto.net/en/results'
  },
  eurojackpot: {
    mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12,
    currentFrom: '2012-03-23',
    source: 'Euro-Jackpot.net',
    sourceUrl: 'https://www.euro-jackpot.net/results-archive-2012'
  },
  powerball: {
    mainCount: 5, mainMax: 69, bonusCount: 1, bonusMax: 26,
    currentFrom: '2015-10-07',
    source: 'NY Open Data / Powerball',
    sourceUrl: 'https://data.ny.gov/resource/d6yy-54nr.json'
  },
  megaMillions: {
    mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 24,
    currentFrom: '2025-04-08',
    source: 'NY Open Data / Mega Millions',
    sourceUrl: 'https://data.ny.gov/resource/5xaw-6ayf.json'
  },
  euroMillions: {
    mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12,
    currentFrom: '2016-09-27',
    source: 'Euro-Millions.com',
    sourceUrl: 'https://www.euro-millions.com/results-history-2026'
  },
  superEnalotto: {
    mainCount: 6, mainMax: 90, bonusCount: 1, bonusMax: 90,
    currentFrom: '1997-01-01',
    source: 'National-Lottery.com / Lottologia',
    sourceUrl: 'https://lottologia.com/superenalotto/estrazioni'
  },
  lottoMax: {
    mainCount: 7, mainMax: 52, bonusCount: 1, bonusMax: 52,
    currentFrom: '2026-04-14',
    source: 'WCLC',
    sourceUrl: 'https://www.wclc.com/winning-numbers/lotto-max-extra.htm'
  },
  powerballAustralia: {
    mainCount: 7, mainMax: 35, bonusCount: 1, bonusMax: 20,
    currentFrom: '2018-04-19',
    source: 'Australia National Lottery / The Lott',
    sourceUrl: 'https://australia.national-lottery.com/powerball/results-archive-2026'
  }
};

const cli = parseArgs(process.argv.slice(2));
const selectedGames = cli.games || GAME_ORDER;
const currentRulesOnly = !cli.includeOldRules;
const dryRun = Boolean(cli.dryRun);
const outFile = path.resolve(cli.out || DEFAULT_OUT);

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

async function main() {
  const previous = await readExisting(outFile);
  const games = {};
  const diagnostics = {};

  for (const game of GAME_ORDER) {
    if (!selectedGames.includes(game)) {
      games[game] = previous.games?.[game] || [];
      diagnostics[game] = { skipped: true, kept: games[game].length };
      continue;
    }

    console.error(`fetch ${game}...`);
    let fetched;
    try {
      fetched = await fetchGame(game);
    } catch (err) {
      const existing = previous.games?.[game] || [];
      console.error(`warn ${game}: ${err.message}; keeping ${existing.length} existing rows`);
      games[game] = existing;
      diagnostics[game] = {
        fetchError: err.message,
        keptExisting: true,
        merged: existing.length,
        currentRulesOnly,
        currentFrom: RULES[game].currentFrom,
        source: RULES[game].source,
        sourceUrl: RULES[game].sourceUrl
      };
      continue;
    }
    const { kept, rejected } = normalizeAndValidate(game, fetched, currentRulesOnly);
    const merged = mergeByDate(previous.games?.[game] || [], kept);
    games[game] = merged;
    diagnostics[game] = {
      fetched: fetched.length,
      kept: kept.length,
      merged: merged.length,
      rejected: summarizeRejected(rejected),
      currentRulesOnly,
      currentFrom: RULES[game].currentFrom,
      source: RULES[game].source,
      sourceUrl: RULES[game].sourceUrl
    };
  }

  const output = {
    schemaVersion: 2,
    updatedAt: ymd(TODAY),
    generatedBy: 'scripts/update-results-db.mjs',
    rulesMode: currentRulesOnly ? 'current-rules-only' : 'include-old-rules',
    games,
    diagnostics
  };

  for (const game of GAME_ORDER) {
    const rows = output.games[game] || [];
    const dates = rows.map((r) => r.date).filter(Boolean);
    console.log(`${game}\t${rows.length}\t${dates.at(-1) || ''}\t${dates[0] || ''}`);
  }

  if (dryRun) return;
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(output, null, 2) + '\n');
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--include-old-rules') out.includeOldRules = true;
    else if (arg === '--out') out.out = args[++i];
    else if (arg.startsWith('--out=')) out.out = arg.slice(6);
    else if (arg === '--games') out.games = parseGames(args[++i]);
    else if (arg.startsWith('--games=')) out.games = parseGames(arg.slice(8));
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/update-results-db.mjs [--games a,b] [--out results.json] [--dry-run] [--include-old-rules]

Default writes current-rule-compatible draws to results.json.
Use --include-old-rules only for offline research, not for the live app models.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function parseGames(value) {
  if (!value || value === 'all') return GAME_ORDER;
  const aliases = {
    viking: 'vikinglotto',
    euro: 'eurojackpot',
    mega: 'megaMillions',
    euromillions: 'euroMillions',
    superenalotto: 'superEnalotto',
    lottomax: 'lottoMax',
    powerballau: 'powerballAustralia'
  };
  return value.split(',').map((x) => aliases[x.trim()] || x.trim()).filter(Boolean);
}

async function readExisting(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return { games: {} };
  }
}

async function fetchGame(game) {
  if (game === 'lotto') return fetchNorskGame('lotto', RULES.lotto.sourceUrl, 2017);
  if (game === 'vikinglotto') return fetchVikinglotto();
  if (game === 'eurojackpot') return fetchEurojackpot();
  if (game === 'powerball') return fetchSocrataPowerball();
  if (game === 'megaMillions') return fetchSocrataMegaMillions();
  if (game === 'euroMillions') return fetchEuroMillions();
  if (game === 'superEnalotto') return fetchSuperEnalotto();
  if (game === 'lottoMax') return fetchLottoMax();
  if (game === 'powerballAustralia') return fetchPowerballAustralia();
  throw new Error(`No fetcher for ${game}`);
}

async function fetchNorskGame(officialGame, sourceUrl, startYear) {
  const out = [];
  const start = new Date(Date.UTC(startYear, 0, 1));
  const end = new Date(TODAY);
  end.setUTCDate(end.getUTCDate() + 1);

  for (let from = start; from < end;) {
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 90);
    if (to > end) to.setTime(end.getTime());
    const url = `https://api.norsk-tipping.no/LotteryGameInfo/v2/api/results/${encodeURIComponent(officialGame)}?fromDate=${ymd(from)}&toDate=${ymd(to)}`;
    const data = await fetchJson(url);
    for (const raw of data.gameResult || []) {
      out.push(normalizeNorsk(raw, officialGame === 'lotto' ? 'lotto' : 'vikinglotto', sourceUrl));
    }
    from = new Date(to);
  }
  return out;
}

async function fetchVikinglotto() {
  const out = [];
  for (let year = 2017; year <= CURRENT_YEAR; year++) {
    let html;
    try {
      html = await fetchText(`https://viking-lotto.net/en/results/${year}`, { attempts: 1, timeoutMs: 6000 });
    } catch (err) {
      console.error(`warn vikinglotto archive ${year}: ${err.message}`);
      continue;
    }
    const rows = extractRows(html);
    for (const row of rows) {
      const main = numbersByClass(row, 'ball', (cls) => !/\bviking-ball\b/.test(cls));
      const bonus = numbersByClass(row, 'viking-ball');
      const dateHtml = firstMatch(row, /<div class="date">([\s\S]*?)<\/div>/i);
      const drawId = numberFromText(stripTags(firstMatch(row, /<td>([\s\S]*?)<\/td>/i)));
      const date = parseEnglishDate(dateHtml, year);
      if (date && main.length === 6 && bonus.length === 1) {
        out.push(draw(date, main, bonus, 'vikinglotto', RULES.vikinglotto.source, RULES.vikinglotto.sourceUrl, drawId));
      }
    }
  }

  // Norsk Tipping is authoritative for recent Norwegian prize data. Merge it over the archive by date.
  const recent = await fetchNorskGame('vikinglotto', 'https://www.norsk-tipping.no/lotteri/vikinglotto/resultater', 2022)
    .catch(() => []);
  return mergeByDate(out, recent);
}

async function fetchEurojackpot() {
  const out = [];
  for (let year = 2012; year <= CURRENT_YEAR; year++) {
    let html;
    try {
      html = await fetchText(`https://www.euro-jackpot.net/results-archive-${year}`);
    } catch (err) {
      console.error(`warn eurojackpot archive ${year}: ${err.message}`);
      continue;
    }
    for (const row of extractRows(html)) {
      const main = numbersByClass(row, 'ball', (cls) => !/\beuro\b/.test(cls));
      const bonus = numbersByClass(row, 'euro');
      const dateHtml = firstMatch(row, /<td>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/td>/i)
        || firstMatch(row, /<div class="date">([\s\S]*?)<\/div>/i)
        || stripTags(row).slice(0, 80);
      const date = parseEnglishDate(dateHtml, year);
      if (date && main.length === 5 && bonus.length === 2) {
        out.push(draw(date, main, bonus, 'eurojackpot', RULES.eurojackpot.source, RULES.eurojackpot.sourceUrl));
      }
    }
  }
  return out;
}

async function fetchSocrataPowerball() {
  const rows = await fetchJson('https://data.ny.gov/resource/d6yy-54nr.json?$limit=5000&$order=draw_date%20DESC');
  return rows.map((raw) => {
    const nums = parseNumberList(raw.winning_numbers);
    return draw(
      String(raw.draw_date || '').slice(0, 10),
      nums.slice(0, 5),
      nums.slice(5, 6),
      'powerball',
      RULES.powerball.source,
      'https://www.powerball.com/previous-results',
      raw.draw_date || null
    );
  });
}

async function fetchSocrataMegaMillions() {
  const rows = await fetchJson('https://data.ny.gov/resource/5xaw-6ayf.json?$limit=5000&$order=draw_date%20DESC');
  return rows.map((raw) => draw(
    String(raw.draw_date || '').slice(0, 10),
    parseNumberList(raw.winning_numbers),
    parseNumberList(raw.mega_ball),
    'megaMillions',
    RULES.megaMillions.source,
    'https://www.megamillions.com/winning-numbers/previous-drawings',
    raw.draw_date || null
  ));
}

async function fetchEuroMillions() {
  const out = [];
  for (let year = 2016; year <= CURRENT_YEAR; year++) {
    let html;
    try {
      html = await fetchText(`https://www.euro-millions.com/results-history-${year}`);
    } catch (err) {
      console.error(`warn euroMillions archive ${year}: ${err.message}`);
      continue;
    }
    for (const row of extractRows(html)) {
      const all = numbersByClass(row, 'resultBall');
      if (all.length < 7) continue;
      const dateHtml = firstMatch(row, /<td class="date[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
      const date = parseEnglishDate(dateHtml, year);
      if (date) {
        out.push(draw(date, all.slice(0, 5), all.slice(5, 7), 'euroMillions', RULES.euroMillions.source, RULES.euroMillions.sourceUrl));
      }
    }
  }
  return out;
}

async function fetchSuperEnalotto() {
  const out = [];
  let archiveFailures = 0;
  for (let year = 1997; year <= CURRENT_YEAR; year++) {
    const sourceUrl = `https://www.national-lottery.com/superenalotto/results/${year}-archive`;
    try {
      const html = await fetchText(sourceUrl, { attempts: 1, timeoutMs: 6000 });
      archiveFailures = 0;
      for (const row of extractRows(html)) {
        const main = numbersByClass(row, 'ball', (cls) => !/\bjolly\b/.test(cls) && !/\bsuperstar\b/.test(cls));
        const bonus = numbersByClass(row, 'jolly');
        const title = firstMatch(row, /title="View SuperEnalotto draw details for\s+([^"]+)"/i);
        const date = parseEnglishDate(title, year) || parseEnglishDate(stripTags(row), year);
        if (date) {
          out.push(draw(date, main, bonus, 'superEnalotto', 'National-Lottery.com / SuperEnalotto', sourceUrl));
        }
      }
      await sleep(150);
    } catch (err) {
      archiveFailures += 1;
      console.error(`warn superEnalotto ${year}: ${err.message}`);
      if (archiveFailures >= 3) {
        console.error('warn superEnalotto archive: skipped remaining archive years after 3 consecutive failures');
        break;
      }
    }
  }

  const lottologia = await fetchSuperEnalottoLottologia().catch((err) => {
    console.error(`warn superEnalotto lottologia: ${err.message}`);
    return [];
  });

  return mergeByDate(out, lottologia);
}

async function fetchSuperEnalottoLottologia() {
  const urls = [
    'https://lottologia.com/superenalotto/estrazioni',
    'https://lottologia.com/superenalotto/estrazioni-anno-precedente'
  ];
  const out = [];
  for (const url of urls) {
    const html = await fetchText(url);
    for (const row of extractLottologiaRows(html)) {
      const date = parseItalianDate(firstMatch(row, /class=["']?dt-row-date["']?>([^<]+)/i));
      const nums = [...row.matchAll(/data-num=["']?(\d+)["']?/gi)].map((m) => Number(m[1]));
      if (date && nums.length >= 7) {
        out.push(draw(date, nums.slice(0, 6), nums.slice(6, 7), 'superEnalotto', 'Lottologia', url));
      }
    }
  }
  return out;
}

async function fetchLottoMax() {
  const html = await fetchText('https://www.wclc.com/winning-numbers/lotto-max-extra.htm?channel=print');
  const out = [];
  const blocks = [...html.matchAll(/<div class="pastWinNumGroup">([\s\S]*?)(?=<div class="pastWinNumSecondaryGroup">|<div class="pastWinNumGroup">|<\/div>\s*<!--\/ pastWinNum|$)/gi)]
    .map((m) => m[1]);
  for (const block of blocks) {
    const date = parseEnglishDate(firstMatch(block, /<strong>([\s\S]*?)<\/strong>/i));
    const nums = [...block.matchAll(/<li class="pastWinNumber(?:Bonus)?">([\s\S]*?)<\/li>/gi)]
      .map((m) => numberFromText(stripTags(m[1])))
      .filter(Number.isInteger);
    if (date && nums.length >= 8) {
      out.push(draw(date, nums.slice(0, 7), nums.slice(7, 8), 'lottoMax', RULES.lottoMax.source, RULES.lottoMax.sourceUrl));
    }
  }
  return out;
}

async function fetchPowerballAustralia() {
  const out = [];
  let archiveFailures = 0;
  for (let year = 2018; year <= CURRENT_YEAR; year++) {
    let html;
    try {
      html = await fetchText(`https://australia.national-lottery.com/powerball/results-archive-${year}`, { attempts: 1, timeoutMs: 6000 });
      archiveFailures = 0;
    } catch (err) {
      archiveFailures += 1;
      console.error(`warn powerballAustralia archive ${year}: ${err.message}`);
      if (archiveFailures >= 3) {
        console.error('warn powerballAustralia archive: skipped remaining archive years after 3 consecutive failures');
        break;
      }
      continue;
    }
    for (const row of extractRows(html)) {
      const main = numbersByClass(row, 'ball', (cls) => !/\bpowerball\b/.test(cls));
      const bonus = numbersByClass(row, 'powerball');
      const title = firstMatch(row, /title="Powerball Draw\s+([^"]+)"/i);
      const drawId = numberFromText(title);
      const date = parseEnglishDate(title, year) || parseEnglishDate(stripTags(row), year);
      if (date && main.length === 7 && bonus.length === 1) {
        out.push(draw(date, main, bonus, 'powerballAustralia', RULES.powerballAustralia.source, RULES.powerballAustralia.sourceUrl, drawId));
      }
    }
  }
  return out;
}

function normalizeNorsk(raw, lotteryId, sourceUrl) {
  const nums = Array.isArray(raw.winnerNumber) ? raw.winnerNumber : [];
  const main = nums.filter((n) => Number(n.type) === 1).map((n) => Number(n.number));
  const bonus = nums.filter((n) => Number(n.type) === 2).map((n) => Number(n.number));
  const firstPrize = Array.isArray(raw.prize) ? raw.prize[0] || {} : {};
  const jackpotAmount = Number(firstPrize.jackpotAmount || firstPrize.value || 0);
  return {
    ...draw(String(raw.drawDate || '').slice(0, 10), main, bonus, lotteryId, 'Norsk Tipping', sourceUrl, raw.drawId ?? null),
    jackpot: jackpotAmount ? Math.round(jackpotAmount / 100000) / 10 : null,
    drawName: raw.drawName || ''
  };
}

function draw(date, main, bonus, lotteryId, source, sourceUrl, drawId = null) {
  return {
    date,
    main: uniqSorted(main),
    bonus: uniqSorted(bonus),
    jackpot: null,
    lotteryId,
    source,
    sourceUrl,
    drawId
  };
}

function normalizeAndValidate(game, rows, currentOnly) {
  const rule = RULES[game];
  const kept = [];
  const rejected = [];
  const minDate = currentOnly ? rule.currentFrom : (rule.archiveFrom || rule.currentFrom);

  for (const row of rows) {
    const d = {
      ...row,
      main: uniqSorted(row.main || []),
      bonus: uniqSorted(row.bonus || [])
    };
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) errors.push('date');
    if (minDate && d.date < minDate) errors.push('old-rule-date');
    if (d.main.length !== rule.mainCount) errors.push(`main-count-${d.main.length}`);
    if (d.bonus.length !== rule.bonusCount) errors.push(`bonus-count-${d.bonus.length}`);
    if (d.main.some((n) => !Number.isInteger(n) || n < 1 || n > rule.mainMax)) errors.push('main-range');
    if (d.bonus.some((n) => !Number.isInteger(n) || n < 1 || n > rule.bonusMax)) errors.push('bonus-range');
    if (errors.length) rejected.push({ date: d.date, errors });
    else kept.push(d);
  }

  return { kept: mergeByDate([], kept), rejected };
}

function mergeByDate(oldRows, newRows) {
  const byDate = new Map();
  for (const row of oldRows || []) if (row?.date) byDate.set(row.date, row);
  for (const row of newRows || []) if (row?.date) byDate.set(row.date, { ...byDate.get(row.date), ...row });
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function summarizeRejected(rejected) {
  const out = { total: rejected.length };
  for (const item of rejected) {
    for (const err of item.errors) out[err] = (out[err] || 0) + 1;
  }
  return out;
}

async function fetchText(url, options = {}) {
  const res = await fetchResponse(url, {
    headers: {
      'user-agent': 'MandelWorldResultsBot/1.0 (+https://github.com/RedSprut/mandel-v2)'
    }
  }, options);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url, options = {}) {
  const res = await fetchResponse(url, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'MandelWorldResultsBot/1.0 (+https://github.com/RedSprut/mandel-v2)'
    }
  }, options);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function fetchResponse(url, requestOptions, retryOptions = {}) {
  const attempts = retryOptions.attempts ?? 2;
  const timeoutMs = retryOptions.timeoutMs ?? HTTP_TIMEOUT_MS;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, requestOptions, timeoutMs);
      if (res.ok || !isRetryableStatus(res.status) || attempt === attempts) return res;
      lastError = new Error(`${url} HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    await sleep(400 * attempt);
  }

  throw lastError || new Error(`${url} failed`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${url} timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function extractRows(html) {
  return [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => m[0]);
}

function extractLottologiaRows(html) {
  const rowStart = '<div class=(?:"dt-row"|\\\'dt-row\\\'|dt-row)(?=[\\s>])';
  const footerStart = '<div class=(?:"dt-footer"|\\\'dt-footer\\\'|dt-footer)(?=[\\s>])';
  const re = new RegExp(`${rowStart}[\\s\\S]*?(?=${rowStart}|${footerStart}|$)`, 'gi');
  return [...String(html || '').matchAll(re)]
    .map((m) => m[0]);
}

function numbersByClass(html, classPart, classPredicate = null) {
  const out = [];
  const re = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    const cls = firstMatch(attrs, /class=["']([^"']*)["']/i);
    if (!cls || !cls.split(/\s+/).some((c) => c === classPart || c.includes(classPart))) continue;
    if (classPredicate && !classPredicate(cls)) continue;
    const n = numberFromText(stripTags(match[2]));
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

function allLiNumbers(html) {
  return [...String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => numberFromText(stripTags(m[1])))
    .filter(Number.isInteger);
}

function parseEnglishDate(input, defaultYear = null) {
  const text = stripTags(input || '')
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  let m = text.match(/\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (m) return buildDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));

  m = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (m) return buildDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));

  m = text.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/);
  if (m && defaultYear) return buildDate(defaultYear, MONTHS[m[1].toLowerCase()], Number(m[2]));

  m = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\b/);
  if (m && defaultYear) return buildDate(defaultYear, MONTHS[m[2].toLowerCase()], Number(m[1]));

  return '';
}

function parseItalianDate(input) {
  const text = stripTags(input || '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const m = text.match(/\b(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})\b/i);
  if (!m) return '';
  return buildDate(Number(m[3]), ITALIAN_MONTHS[m[2]], Number(m[1]));
}

function buildDate(year, month, day) {
  if (!year || !month || !day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&euro;/g, 'EUR')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseNumberList(value) {
  return String(value || '').match(/\d+/g)?.map(Number).filter(Number.isInteger) || [];
}

function numberFromText(value) {
  const m = String(value || '').replace(/,/g, '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

function uniqSorted(values) {
  return [...new Set((values || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function firstMatch(value, re) {
  const m = String(value || '').match(re);
  return m ? m[1] : '';
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
