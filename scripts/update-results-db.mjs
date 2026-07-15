#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_OUT = path.join(ROOT, 'results.json');
const TODAY = new Date();
const CURRENT_YEAR = TODAY.getUTCFullYear();
const HTTP_TIMEOUT_MS = 12000;
const DEFAULT_USER_AGENT = 'LotoSimulatorResultsBot/2.0 (+https://github.com/RedSprut/mandel-v2)';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const LOTTO_MAX_ARCHIVE_MIN_ROWS = 1200;

/* WCLC's otherwise complete since-inception PDF currently contains three
   visibly malformed primary rows. Keep corrections narrow, dated and
   auditable instead of silently discarding valid historical draws. */
const LOTTO_MAX_PDF_CORRECTIONS = Object.freeze({
  '2022-01-25': {
    main: [11, 13, 18, 20, 23, 30, 40], bonus: [37],
    reason: 'WCLC PDF joins Bonus 37 with footnote marker 4 as 374.',
    referenceUrl: 'https://www.lotto.net/canada-lotto-max/numbers/january-25-2022'
  },
  '2024-11-26': {
    main: [20, 24, 31, 33, 36, 41, 49], bonus: [50],
    reason: 'WCLC PDF page break omits the tail of this dated row.',
    referenceUrl: 'https://www.lottery.net/lotto-max/lotto-max/numbers/11-26-2024'
  },
  '2026-03-03': {
    main: [1, 3, 4, 18, 20, 23, 31], bonus: [2],
    reason: 'WCLC PDF prints the final main number 31 as out-of-range 61.',
    referenceUrl: 'https://www.wclc.com/lotto-max-extra.htm?back=4'
  }
});

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
    archiveFrom: '2012-01-07',
    currentFrom: '2015-03-21',
    source: 'Norsk Tipping',
    sourceUrl: 'https://www.norsk-tipping.no/lotteri/lotto/resultater'
  },
  vikinglotto: {
    mainCount: 6, mainMax: 48, bonusCount: 1, bonusMax: 5,
    archiveFrom: '2012-02-22',
    /* 2 June 2021 was the last 1–8 Viking-number draw; next draw was 9 June. */
    currentFrom: '2021-06-09',
    source: 'Viking-Lotto.net / Norsk Tipping',
    sourceUrl: 'https://viking-lotto.net/en/results'
  },
  eurojackpot: {
    mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12,
    archiveFrom: '2012-03-23',
    currentFrom: '2022-03-25',
    source: 'Euro-Jackpot.net',
    sourceUrl: 'https://www.euro-jackpot.net/results-archive-2012'
  },
  powerball: {
    mainCount: 5, mainMax: 69, bonusCount: 1, bonusMax: 26,
    archiveFrom: '2010-02-03',
    currentFrom: '2015-10-07',
    source: 'NY Open Data / Powerball',
    sourceUrl: 'https://data.ny.gov/resource/d6yy-54nr.json'
  },
  megaMillions: {
    mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 24,
    archiveFrom: '2002-05-17',
    currentFrom: '2025-04-08',
    source: 'NY Open Data / Mega Millions',
    sourceUrl: 'https://data.ny.gov/resource/5xaw-6ayf.json'
  },
  euroMillions: {
    mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12,
    archiveFrom: '2004-02-13',
    currentFrom: '2016-09-27',
    source: 'Euro-Millions.com',
    sourceUrl: 'https://www.euro-millions.com/results-history-2026'
  },
  superEnalotto: {
    mainCount: 6, mainMax: 90, bonusCount: 1, bonusMax: 90,
    archiveFrom: '1997-12-03',
    currentFrom: '1997-01-01',
    source: 'National-Lottery.com / Lottologia',
    sourceUrl: 'https://www.national-lottery.com/superenalotto/results/2026-archive'
  },
  lottoMax: {
    mainCount: 7, mainMax: 52, bonusCount: 1, bonusMax: 52,
    archiveFrom: '2009-09-25',
    currentFrom: '2026-04-14',
    source: 'WCLC',
    sourceUrl: 'https://www.wclc.com/winning-numbers/lotto-max-extra.htm',
    officialArchiveUrl: 'https://www.wclc.com/display-on/display-on-downloads/lotto-max-since-inception.htm'
  },
  powerballAustralia: {
    mainCount: 7, mainMax: 35, bonusCount: 1, bonusMax: 20,
    archiveFrom: '1996-05-23',
    currentFrom: '2018-04-19',
    source: 'Australia National Lottery / The Lott',
    sourceUrl: 'https://australia.national-lottery.com/powerball/results-archive-2026'
  }
};

/* Исторические матрицы нужны для двух разных задач:
   - results.json содержит только тиражи, совместимые с текущей игрой и моделями;
   - results-archive.json хранит максимальную доступную глубину и точную версию
     правил каждого тиража. Несовместимые эпохи никогда не смешиваются молча. */
const RULE_ERAS = {
  lotto: [
    { id: 'lotto-7-34-3', from: '2012-01-07', to: '2015-03-14', mainCount: 7, mainMax: 34, bonusCount: 3, bonusMax: 34, label: '7 из 34 + 3 дополнительных' },
    { id: 'lotto-7-34-1', from: '2015-03-21', current: true, mainCount: 7, mainMax: 34, bonusCount: 1, bonusMax: 34, label: '7 из 34 + 1 дополнительный' }
  ],
  vikinglotto: [
    { id: 'viking-lucky', from: '2012-02-22', to: '2017-05-17', mainCount: 6, mainMax: 48, bonusCount: 3, bonusMax: 48, label: '6 из 48 + 2 дополнительных + Lucky Number' },
    { id: 'viking-1-8', from: '2017-05-24', to: '2021-06-02', mainCount: 6, mainMax: 48, bonusCount: 1, bonusMax: 8, label: '6 из 48 + Viking 1 из 8' },
    { id: 'viking-1-5', from: '2021-06-09', current: true, mainCount: 6, mainMax: 48, bonusCount: 1, bonusMax: 5, label: '6 из 48 + Viking 1 из 5' }
  ],
  eurojackpot: [
    { id: 'eurojackpot-2-8', from: '2012-03-23', to: '2014-10-03', mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 8, label: '5 из 50 + 2 Euro числа из 8' },
    { id: 'eurojackpot-2-10', from: '2014-10-10', to: '2022-03-18', mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 10, label: '5 из 50 + 2 Euro числа из 10' },
    { id: 'eurojackpot-2-12', from: '2022-03-25', current: true, mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12, label: '5 из 50 + 2 Euro числа из 12' }
  ],
  powerball: [
    { id: 'powerball-59-39', from: '2010-02-03', to: '2012-01-14', mainCount: 5, mainMax: 59, bonusCount: 1, bonusMax: 39, label: '5 из 59 + Powerball 1 из 39' },
    { id: 'powerball-59-35', from: '2012-01-18', to: '2015-10-03', mainCount: 5, mainMax: 59, bonusCount: 1, bonusMax: 35, label: '5 из 59 + Powerball 1 из 35' },
    { id: 'powerball-69-26', from: '2015-10-07', current: true, mainCount: 5, mainMax: 69, bonusCount: 1, bonusMax: 26, label: '5 из 69 + Powerball 1 из 26' }
  ],
  megaMillions: [
    { id: 'mega-52-52', from: '2002-05-17', to: '2005-06-21', mainCount: 5, mainMax: 52, bonusCount: 1, bonusMax: 52, label: '5 из 52 + Mega Ball 1 из 52' },
    { id: 'mega-56-46', from: '2005-06-24', to: '2013-10-18', mainCount: 5, mainMax: 56, bonusCount: 1, bonusMax: 46, label: '5 из 56 + Mega Ball 1 из 46' },
    { id: 'mega-75-15', from: '2013-10-22', to: '2017-10-27', mainCount: 5, mainMax: 75, bonusCount: 1, bonusMax: 15, label: '5 из 75 + Mega Ball 1 из 15' },
    { id: 'mega-70-25', from: '2017-10-31', to: '2025-04-04', mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 25, label: '5 из 70 + Mega Ball 1 из 25' },
    { id: 'mega-70-24', from: '2025-04-08', current: true, mainCount: 5, mainMax: 70, bonusCount: 1, bonusMax: 24, label: '5 из 70 + Mega Ball 1 из 24' }
  ],
  euroMillions: [
    { id: 'euromillions-2-9', from: '2004-02-13', to: '2011-05-06', mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 9, label: '5 из 50 + 2 Lucky Stars из 9' },
    { id: 'euromillions-2-11', from: '2011-05-10', to: '2016-09-23', mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 11, label: '5 из 50 + 2 Lucky Stars из 11' },
    { id: 'euromillions-2-12', from: '2016-09-27', current: true, mainCount: 5, mainMax: 50, bonusCount: 2, bonusMax: 12, label: '5 из 50 + 2 Lucky Stars из 12' }
  ],
  superEnalotto: [
    { id: 'superenalotto-6-90', from: '1997-12-03', current: true, mainCount: 6, mainMax: 90, bonusCount: 1, bonusMax: 90, label: '6 из 90 + Jolly' }
  ],
  lottoMax: [
    { id: 'lottomax-7-49', from: '2009-09-25', to: '2019-05-10', mainCount: 7, mainMax: 49, bonusCount: 1, bonusMax: 49, label: '7 из 49 + Bonus' },
    { id: 'lottomax-7-50', from: '2019-05-14', to: '2026-04-10', mainCount: 7, mainMax: 50, bonusCount: 1, bonusMax: 50, label: '7 из 50 + Bonus' },
    { id: 'lottomax-7-52', from: '2026-04-14', current: true, mainCount: 7, mainMax: 52, bonusCount: 1, bonusMax: 52, label: '7 из 52 + Bonus' }
  ],
  powerballAustralia: [
    { id: 'powerballau-5-45', from: '1996-05-23', to: '2013-02-28', mainCount: 5, mainMax: 45, bonusCount: 1, bonusMax: 45, label: '5 из 45 + Powerball 1 из 45' },
    { id: 'powerballau-6-40', from: '2013-03-07', to: '2018-04-12', mainCount: 6, mainMax: 40, bonusCount: 1, bonusMax: 20, label: '6 из 40 + Powerball 1 из 20' },
    { id: 'powerballau-7-35', from: '2018-04-19', current: true, mainCount: 7, mainMax: 35, bonusCount: 1, bonusMax: 20, label: '7 из 35 + Powerball 1 из 20' }
  ]
};

function publicRuleVersions() {
  return Object.fromEntries(GAME_ORDER.map((game) => [
    game,
    (RULE_ERAS[game] || []).map((era) => ({ ...era }))
  ]));
}

function ruleEraFor(game, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  return (RULE_ERAS[game] || []).find((era) => date >= era.from && (!era.to || date <= era.to)) || null;
}

const cli = parseArgs(process.argv.slice(2));
const selectedGames = cli.games || GAME_ORDER;
const currentRulesOnly = !cli.includeOldRules;
const dryRun = Boolean(cli.dryRun);
const outFile = path.resolve(cli.out || DEFAULT_OUT);
const archiveFile = cli.archiveOut ? path.resolve(cli.archiveOut) : null;
const fetchDiagnostics = {};

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});

async function main() {
  const previous = await readExisting(outFile);
  const previousArchive = archiveFile ? await readExisting(archiveFile) : { games: {} };
  const games = {};
  const archiveGames = {};
  const diagnostics = {};
  const archiveDiagnostics = {};

  for (const game of GAME_ORDER) {
    if (!selectedGames.includes(game)) {
      games[game] = previous.games?.[game] || [];
      if (archiveFile) archiveGames[game] = previousArchive.games?.[game] || [];
      diagnostics[game] = previous.diagnostics?.[game] || { skipped: true, kept: games[game].length };
      if (archiveFile) archiveDiagnostics[game] = previousArchive.diagnostics?.[game] || { skipped: true, kept: archiveGames[game].length };
      continue;
    }

    console.error(`fetch ${game}...`);
    let fetched;
    try {
      fetched = await fetchGame(game);
    } catch (err) {
      const existing = previous.games?.[game] || [];
      const { kept: existingKept, rejected: rejectedExisting } = normalizeAndValidate(game, existing, currentRulesOnly);
      console.error(`warn ${game}: ${err.message}; keeping ${existing.length} existing rows`);
      games[game] = existingKept;
      if (archiveFile) archiveGames[game] = previousArchive.games?.[game] || [];
      diagnostics[game] = {
        fetchError: err.message,
        keptExisting: true,
        merged: existingKept.length,
        rejectedExisting: summarizeRejected(rejectedExisting),
        currentRulesOnly,
        currentFrom: RULES[game].currentFrom,
        source: RULES[game].source,
        sourceUrl: RULES[game].sourceUrl
      };
      if (archiveFile) archiveDiagnostics[game] = {
        fetchError: err.message,
        keptExisting: true,
        merged: archiveGames[game].length,
        coverage: analyzeCoverage(game, archiveGames[game]),
        source: RULES[game].source,
        sourceUrl: RULES[game].officialArchiveUrl || RULES[game].sourceUrl
      };
      continue;
    }
    const { kept, rejected } = normalizeAndValidate(game, fetched, currentRulesOnly);
    const mergedRaw = mergeByDate(previous.games?.[game] || [], kept);
    const { kept: merged, rejected: rejectedExisting } = normalizeAndValidate(game, mergedRaw, currentRulesOnly);
    games[game] = merged;
    diagnostics[game] = {
      fetched: fetched.length,
      kept: kept.length,
      merged: merged.length,
      rejected: summarizeRejected(rejected),
      rejectedExisting: summarizeRejected(rejectedExisting),
      currentRulesOnly,
      currentFrom: RULES[game].currentFrom,
      coverage: analyzeCoverage(game, merged),
      source: RULES[game].source,
      sourceUrl: RULES[game].sourceUrl,
      ...(fetchDiagnostics[game] || {})
    };
    if (archiveFile) {
      const { kept: archiveKept, rejected: archiveRejected } = normalizeArchiveRows(game, fetched);
      const archiveMergedRaw = mergeByDate(previousArchive.games?.[game] || [], archiveKept);
      const { kept: archiveMerged, rejected: archiveRejectedExisting } = normalizeArchiveRows(game, archiveMergedRaw);
      archiveGames[game] = archiveMerged;
      archiveDiagnostics[game] = {
        fetched: fetched.length,
        kept: archiveKept.length,
        merged: archiveMerged.length,
        legacyRows: archiveMerged.filter((row) => row.ruleEra === 'legacy').length,
        currentRows: archiveMerged.filter((row) => row.ruleEra === 'current').length,
        rejected: summarizeRejected(archiveRejected),
        rejectedExisting: summarizeRejected(archiveRejectedExisting),
        coverage: analyzeCoverage(game, archiveMerged),
        source: RULES[game].source,
        sourceUrl: RULES[game].officialArchiveUrl || RULES[game].sourceUrl,
        ...(fetchDiagnostics[game] || {})
      };
    }
  }

  const output = {
    schemaVersion: 2,
    updatedAt: ymd(TODAY),
    generatedBy: 'scripts/update-results-db.mjs',
    rulesMode: currentRulesOnly ? 'current-rules-only' : 'include-old-rules',
    ruleVersions: publicRuleVersions(),
    games,
    diagnostics
  };

  const archiveOutput = archiveFile ? {
    schemaVersion: 1,
    updatedAt: ymd(TODAY),
    generatedBy: 'scripts/update-results-db.mjs --archive-out',
    purpose: 'historical-display-and-research',
    warning: 'Содержит тиражи разных исторических правил. Интерфейс показывает их по эпохам; модели текущего формата используют только results.json.',
    ruleVersions: publicRuleVersions(),
    games: archiveGames,
    diagnostics: archiveDiagnostics
  } : null;

  console.log('game\trows\toldest\tlatest');
  for (const game of GAME_ORDER) {
    const rows = output.games[game] || [];
    const dates = rows.map((r) => r.date).filter(Boolean);
    console.log(`${game}\t${rows.length}\t${dates.at(-1) || ''}\t${dates[0] || ''}`);
  }

  if (archiveOutput) {
    console.log('\nresearch archive (mixed rule eras)');
    console.log('game\trows\tlegacy\toldest\tlatest');
    for (const game of GAME_ORDER) {
      const rows = archiveOutput.games[game] || [], dates = rows.map((r) => r.date).filter(Boolean);
      console.log(`${game}\t${rows.length}\t${rows.filter((r) => r.ruleEra === 'legacy').length}\t${dates.at(-1) || ''}\t${dates[0] || ''}`);
    }
  }

  if (dryRun) return;
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(output, null, 2) + '\n');
  if (archiveOutput) {
    await mkdir(path.dirname(archiveFile), { recursive: true });
    await writeFile(archiveFile, JSON.stringify(archiveOutput, null, 2) + '\n');
  }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--include-old-rules') out.includeOldRules = true;
    else if (arg === '--archive-out') out.archiveOut = args[++i];
    else if (arg.startsWith('--archive-out=')) out.archiveOut = arg.slice(14);
    else if (arg === '--lotto-max-pdf') out.lottoMaxPdf = args[++i];
    else if (arg.startsWith('--lotto-max-pdf=')) out.lottoMaxPdf = arg.slice(16);
    else if (arg === '--out') out.out = args[++i];
    else if (arg.startsWith('--out=')) out.out = arg.slice(6);
    else if (arg === '--games') out.games = parseGames(args[++i]);
    else if (arg.startsWith('--games=')) out.games = parseGames(arg.slice(8));
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/update-results-db.mjs [--games a,b] [--out results.json] [--archive-out results-archive.json] [--lotto-max-pdf file.pdf] [--dry-run] [--include-old-rules]

Default writes current-rule-compatible draws to results.json.
--archive-out additionally writes every structurally valid fetched draw, marks legacy/current eras, and supplies the labelled historical UI.
--lotto-max-pdf reads a local WCLC archive PDF instead of downloading it (useful for reproducible tests).
Legacy --include-old-rules keeps its old mixed-output behaviour; prefer --archive-out so the live database remains safe.`);
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
  if (game === 'lotto') return fetchNorskGame('lotto', RULES.lotto.sourceUrl, 2012);
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
  for (let year = 2012; year <= CURRENT_YEAR; year++) {
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
      const viking = numbersByClass(row, 'viking-ball');
      const additions = numbersByClass(row, 'tillægstal');
      const lucky = numbersByClass(row, 'supertal');
      const bonus = viking.length ? viking : [...additions, ...lucky];
      const dateHtml = firstMatch(row, /<div class="date">([\s\S]*?)<\/div>/i);
      const drawId = numberFromText(stripTags(firstMatch(row, /<td>([\s\S]*?)<\/td>/i)));
      const date = parseEnglishDate(dateHtml, year);
      if (date && main.length === 6 && bonus.length) {
        const record = draw(date, main, bonus, 'vikinglotto', RULES.vikinglotto.source, RULES.vikinglotto.sourceUrl, drawId);
        if (!viking.length) record.extraGroups = [
          { label: 'Дополнительные', numbers: additions },
          { label: 'Lucky Number', numbers: lucky }
        ];
        out.push(record);
      }
    }
  }

  // Norsk Tipping is authoritative for recent Norwegian prize data. Merge it over the archive by date.
  const recent = await fetchNorskGame('vikinglotto', 'https://www.norsk-tipping.no/lotteri/vikinglotto/resultater', 2021)
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
  const rows = await fetchSocrataAll('d6yy-54nr');
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
  const rows = await fetchSocrataAll('5xaw-6ayf');
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

async function fetchSocrataAll(datasetId) {
  /* Pagination prevents silent truncation when the official archive grows past one API page. */
  const pageSize = 50000, out = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `https://data.ny.gov/resource/${datasetId}.json?$limit=${pageSize}&$offset=${offset}&$order=draw_date%20DESC`;
    const page = await fetchJson(url);
    if (!Array.isArray(page)) throw new Error(`${datasetId}: Socrata response is not an array`);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

async function fetchEuroMillions() {
  const out = [];
  for (let year = 2004; year <= CURRENT_YEAR; year++) {
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
      const html = await fetchText(sourceUrl, {
        attempts: 2,
        timeoutMs: 4000,
        headers: { 'user-agent': BROWSER_USER_AGENT }
      });
      out.push(...parseNationalSuperEnalottoRows(html, sourceUrl));
      archiveFailures = 0;
      await sleep(1200);
    } catch (err) {
      archiveFailures += 1;
      console.error(`warn superEnalotto ${year}: ${err.message}`);
      const fallbackRows = await fetchSuperEnalottoNetYear(year).catch((fallbackErr) => {
        console.error(`warn superEnalotto ${year} fallback: ${fallbackErr.message}`);
        return [];
      });
      if (fallbackRows.length) {
        out.push(...fallbackRows);
        archiveFailures = 0;
      } else if (archiveFailures >= 3) {
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

function parseNationalSuperEnalottoRows(html, sourceUrl) {
  const out = [];
  for (const row of extractRows(html)) {
    const main = numbersByClass(row, 'ball', (cls) => !/\bjolly\b/.test(cls) && !/\bsuperstar\b/.test(cls));
    const bonus = numbersByClass(row, 'jolly');
    const title = firstMatch(row, /title="View SuperEnalotto draw details for\s+([^"]+)"/i);
    const date = parseEnglishDate(title) || parseEnglishDate(stripTags(row));
    if (date && main.length === 6 && bonus.length === 1) {
      out.push(draw(date, main, bonus, 'superEnalotto', 'National-Lottery.com / SuperEnalotto', sourceUrl));
    }
  }
  return out;
}

async function fetchSuperEnalottoNetYear(year) {
  const sourceUrl = `https://www.superenalotto.net/en/results/${year}`;
  const html = await fetchText(sourceUrl, {
    attempts: 1,
    timeoutMs: 4000,
    headers: { 'user-agent': BROWSER_USER_AGENT }
  });
  return parseSuperEnalottoNetRows(html, year, sourceUrl);
}

function parseSuperEnalottoNetRows(html, year, sourceUrl) {
  const out = [];
  for (const row of extractRows(html).filter((r) => /drawNumber/.test(r) && /ballCell/.test(r))) {
    const groups = [...row.matchAll(/<td class="ballCell">([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (groups.length < 2) continue;
    const main = allLiNumbers(groups[0]);
    const bonus = allLiNumbers(groups[1]);
    const dateHtml = firstMatch(row, /<td class="date[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const drawId = stripTags(firstMatch(row, /<span class="drawNumber"[^>]*>([\s\S]*?)<\/span>/i)) || null;
    const date = parseEnglishDate(dateHtml, year);
    if (date && main.length === 6 && bonus.length === 1) {
      out.push(draw(date, main, bonus, 'superEnalotto', 'SuperEnalotto.net', sourceUrl, drawId));
    }
  }
  return out;
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
  const archive = await fetchLottoMaxArchivePdf().catch((err) => {
    fetchDiagnostics.lottoMax = { pdfArchive: { error: err.message } };
    console.error(`warn lottoMax official PDF archive: ${err.message}`);
    return [];
  });
  const recent = await fetchLottoMaxRecent();
  if (!archive.length && !recent.length) throw new Error('WCLC PDF archive and recent-results pages returned no Lotto Max draws');
  return mergeByDate(archive, recent);
}

async function fetchLottoMaxRecent() {
  const out = [];
  for (let back = 0; back <= 12; back++) {
    const sourceUrl = `https://www.wclc.com/lotto-max-extra.htm?back=${back}`;
    let html;
    try {
      html = await fetchText(sourceUrl, { attempts: 1, timeoutMs: 8000 });
    } catch (err) {
      console.error(`warn lottoMax back ${back}: ${err.message}`);
      continue;
    }
    const blocks = [...html.matchAll(/<div class="pastWinNum">([\s\S]*?)(?=<div class="pastWinNum">|<div class="pastWinNumNav"|$)/gi)]
      .map((m) => m[1]);
    for (const block of blocks) {
      const mainBlock = firstMatch(block, /<div class="pastWinNumGroup">([\s\S]*?)(?=<div class="pastWinNumSecondaryGroup">|<div class="pastWinNumMaxmillions|<div class="pastWinNumSidebar"|$)/i);
      const date = parseEnglishDate(firstMatch(block, /<div class="pastWinNumDate">([\s\S]*?)<\/div>/i));
      const nums = [...mainBlock.matchAll(/<li class="pastWinNumber(?:Bonus)?">([\s\S]*?)<\/li>/gi)]
        .map((m) => numberFromText(stripTags(m[1])))
        .filter(Number.isInteger);
      if (date && nums.length >= 8) {
        out.push(draw(date, nums.slice(0, 7), nums.slice(7, 8), 'lottoMax', RULES.lottoMax.source, sourceUrl));
      }
    }
  }
  return out;
}

async function fetchLottoMaxArchivePdf() {
  const sourceUrl = RULES.lottoMax.officialArchiveUrl;
  const bytes = cli.lottoMaxPdf
    ? Uint8Array.from(await readFile(path.resolve(cli.lottoMaxPdf)))
    : await fetchBinary(sourceUrl, { attempts: 3, timeoutMs: 30000 });
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('WCLC archive response is not a PDF');

  const lines = await extractPdfLines(bytes);
  const { rows, rejected, corrections } = parseLottoMaxArchiveLines(lines, sourceUrl);
  fetchDiagnostics.lottoMax = {
    pdfArchive: {
      url: sourceUrl,
      pages: lines.at(-1)?.page || 0,
      parsedRows: rows.length,
      rejectedRows: rejected.length,
      rejected: rejected.map(({ page, date, reason }) => ({ page, date, reason })),
      appliedCorrections: corrections
    }
  };
  if (rows.length < LOTTO_MAX_ARCHIVE_MIN_ROWS) {
    throw new Error(`only ${rows.length} complete draws parsed; expected at least ${LOTTO_MAX_ARCHIVE_MIN_ROWS}`);
  }
  if (rejected.length) {
    const sample = rejected.slice(0, 3).map((item) => `p.${item.page} ${item.date || 'unknown'} (${item.reason})`).join('; ');
    console.error(`warn lottoMax PDF: skipped ${rejected.length} incomplete/invalid dated rows: ${sample}`);
  }
  if (corrections.length) {
    console.error(`lottoMax PDF: applied ${corrections.length} documented WCLC layout corrections (${corrections.map((item) => item.date).join(', ')})`);
  }
  console.error(`lottoMax PDF: ${rows.length} complete draws from ${lines.at(-1)?.page || 0} pages`);
  return rows;
}

async function extractPdfLines(bytes) {
  let getDocument;
  try {
    ({ getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs'));
  } catch (err) {
    throw new Error(`PDF parser is unavailable; run npm install (${err.message})`);
  }

  const loadingTask = getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const groups = [];
      for (const item of content.items || []) {
        const text = String(item.str || '').trim();
        if (!text) continue;
        const x = Number(item.transform?.[4] || 0), y = Number(item.transform?.[5] || 0);
        let group = groups.find((candidate) => Math.abs(candidate.y - y) < 0.7);
        if (!group) {
          group = { y, items: [] };
          groups.push(group);
        }
        group.items.push({ x, text });
      }
      groups.sort((a, b) => b.y - a.y).forEach((group) => {
        const text = group.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
        if (text) lines.push({ page: pageNumber, text });
      });
      page.cleanup();
    }
    return lines;
  } finally {
    if (pdf) await pdf.destroy();
    else await loadingTask.destroy().catch(() => {});
  }
}

function parseLottoMaxArchiveLines(lines, sourceUrl) {
  const dateLine = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s+(.+)$/i;
  const rows = [], rejected = [], corrections = [];
  for (const line of lines || []) {
    const match = line.text.match(dateLine);
    if (!match) continue; // Excludes headings, Maxmillions and EXTRA-only rows.
    const date = buildDate(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
    const values = parseNumberList(match[4]);
    const main = values.slice(0, 7), bonus = values.slice(7, 8);
    let reason = '';
    if (main.length !== 7) reason = `main-count-${main.length}`;
    else if (bonus.length !== 1) reason = 'missing-bonus';
    else if (new Set(main).size !== 7) reason = 'duplicate-main';
    else if (main.some((n) => n < 1 || n > 52) || bonus.some((n) => n < 1 || n > 52)) reason = 'number-range';
    else if (main.includes(bonus[0])) reason = 'bonus-overlap';
    if (reason) {
      const correction = LOTTO_MAX_PDF_CORRECTIONS[date];
      if (correction) {
        rows.push({
          ...draw(date, correction.main, correction.bonus, 'lottoMax', 'WCLC Lotto Max official archive (documented PDF correction)', sourceUrl),
          sourceNote: correction.reason,
          correctionReferenceUrl: correction.referenceUrl
        });
        corrections.push({ page: line.page, date, originalReason: reason, note: correction.reason, referenceUrl: correction.referenceUrl });
        continue;
      }
      rejected.push({ page: line.page, date, reason, text: line.text });
      continue;
    }
    rows.push(draw(date, main, bonus, 'lottoMax', 'WCLC Lotto Max official archive', sourceUrl));
  }
  return { rows: mergeByDate([], rows), rejected, corrections };
}

async function fetchPowerballAustralia() {
  const out = [];
  let archiveFailures = 0;
  for (let year = 1996; year <= CURRENT_YEAR; year++) {
    let html;
    try {
      html = await fetchText(`https://australia.national-lottery.com/powerball/results-archive-${year}`, {
        attempts: 3,
        timeoutMs: 8000,
        retryOn403: true,
        retryDelayMs: 1800,
        headers: { 'user-agent': BROWSER_USER_AGENT }
      });
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
      const hrefDate = firstMatch(row, /href=["'][^"']*\/powerball\/results\/(\d{2}-\d{2}-\d{4})["']/i);
      const date = parseDmyDate(hrefDate) || parseEnglishDate(title, year) || parseEnglishDate(stripTags(row), year);
      if (date && main.length >= 5 && main.length <= 7 && bonus.length === 1) {
        out.push(draw(date, main, bonus, 'powerballAustralia', RULES.powerballAustralia.source, RULES.powerballAustralia.sourceUrl, drawId));
      }
    }
    await sleep(350);
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
    ...draw(parseNorskDrawDate(raw) || String(raw.drawDate || '').slice(0, 10), main, bonus, lotteryId, 'Norsk Tipping', sourceUrl, raw.drawId ?? null),
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

  for (const row of rows) {
    const d = {
      ...row,
      main: uniqSorted(row.main || []),
      bonus: uniqSorted(row.bonus || [])
    };
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) errors.push('date');
    if (d.date > ymd(TODAY)) errors.push('future-date');
    const era = ruleEraFor(game, d.date);
    if (!era) errors.push('unknown-rule-era');
    if (currentOnly && era && !era.current) errors.push('old-rule-date');
    const expected = era || rule;
    if (d.main.length !== expected.mainCount) errors.push(`main-count-${d.main.length}`);
    if (d.bonus.length !== expected.bonusCount) errors.push(`bonus-count-${d.bonus.length}`);
    if (d.main.some((n) => !Number.isInteger(n) || n < 1 || n > expected.mainMax)) errors.push('main-range');
    if (d.bonus.some((n) => !Number.isInteger(n) || n < 1 || n > expected.bonusMax)) errors.push('bonus-range');
    if (era) {
      d.ruleVersion = era.id;
      d.ruleEra = era.current ? 'current' : 'legacy';
    }
    if (errors.length) rejected.push({ date: d.date, errors });
    else kept.push(d);
  }

  return { kept: mergeByDate([], kept), rejected };
}

function normalizeArchiveRows(game, rows) {
  const kept = [], rejected = [];
  for (const row of rows || []) {
    const era = ruleEraFor(game, row.date);
    const d = {
      ...row,
      main: uniqSorted(row.main || []),
      bonus: uniqSorted(row.bonus || []),
      ruleVersion: era?.id || 'unknown',
      ruleEra: era?.current ? 'current' : 'legacy'
    };
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) errors.push('date');
    if (d.date > ymd(TODAY)) errors.push('future-date');
    if (!era) errors.push('unknown-rule-era');
    if (era && d.main.length !== era.mainCount) errors.push(`main-count-${d.main.length}`);
    const validationBonus = Array.isArray(d.extraGroups) && d.extraGroups.length
      ? d.extraGroups.flatMap((group) => group.numbers || [])
      : d.bonus;
    if (era && validationBonus.length !== era.bonusCount) errors.push(`bonus-count-${validationBonus.length}`);
    if (era && d.main.some((n) => !Number.isInteger(n) || n < 1 || n > era.mainMax)) errors.push('main-range');
    if (era && validationBonus.some((n) => !Number.isInteger(n) || n < 1 || n > era.bonusMax)) errors.push('bonus-range');
    if (errors.length) rejected.push({ date: d.date, errors });
    else kept.push(d);
  }
  return { kept: mergeByDate([], kept), rejected };
}

function analyzeCoverage(game, rows) {
  const ordered = [...(rows || [])].filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ordered.length) return { rows: 0, oldest: null, latest: null, maxGapDays: null, suspiciousGaps: [] };
  const gapLimit = ['eurojackpot', 'megaMillions', 'euroMillions', 'lottoMax'].includes(game) ? 10
    : ['powerball', 'superEnalotto'].includes(game) ? 8 : 15;
  let maxGapDays = 0;
  const gaps = [];
  for (let i = 1; i < ordered.length; i++) {
    const days = Math.round((Date.parse(ordered[i].date + 'T00:00:00Z') - Date.parse(ordered[i - 1].date + 'T00:00:00Z')) / 86400000);
    if (days > maxGapDays) maxGapDays = days;
    if (days > gapLimit) gaps.push({ after: ordered[i - 1].date, before: ordered[i].date, days });
  }
  return {
    rows: ordered.length,
    oldest: ordered[0].date,
    latest: ordered.at(-1).date,
    maxGapDays,
    suspiciousGaps: gaps.slice(-25),
    suspiciousGapCount: gaps.length
  };
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
  const headers = { 'user-agent': DEFAULT_USER_AGENT, ...(options.headers || {}) };
  const res = await fetchResponse(url, {
    headers
  }, options);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url, options = {}) {
  const headers = {
    'accept': 'application/json',
    'user-agent': DEFAULT_USER_AGENT,
    ...(options.headers || {})
  };
  const res = await fetchResponse(url, {
    headers
  }, options);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function fetchBinary(url, options = {}) {
  const headers = {
    'accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.2',
    'user-agent': DEFAULT_USER_AGENT,
    ...(options.headers || {})
  };
  const res = await fetchResponse(url, { headers }, options);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchResponse(url, requestOptions, retryOptions = {}) {
  const attempts = retryOptions.attempts ?? 2;
  const timeoutMs = retryOptions.timeoutMs ?? HTTP_TIMEOUT_MS;
  const retryDelayMs = retryOptions.retryDelayMs ?? 400;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, requestOptions, timeoutMs);
      const retryable = isRetryableStatus(res.status) || (retryOptions.retryOn403 && res.status === 403);
      if (res.ok || !retryable || attempt === attempts) return res;
      lastError = new Error(`${url} HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    await sleep(retryDelayMs * attempt);
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

function parseDmyDate(input) {
  const match = String(input || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? buildDate(Number(match[3]), Number(match[2]), Number(match[1])) : '';
}

function parseNorskDrawDate(raw) {
  const match = String(raw?.drawName || '').match(/-(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/);
  return match ? buildDate(Number(match[3]), Number(match[2]), Number(match[1])) : '';
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
