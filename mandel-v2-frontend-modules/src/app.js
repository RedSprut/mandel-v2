import { createI18n } from './i18n.js';
import { copyRowsToClipboard } from './feedback.js';
import { GLOBAL_LOTTERIES } from './lotteries.js';

const sampleRows = [
  { main: [4, 12, 19, 33, 47], bonus: [3, 8] },
  { main: [7, 14, 22, 36, 49], bonus: [2, 11] },
  { main: [1, 18, 27, 41, 50], bonus: [5, 10] }
];

const i18n = createI18n({
  basePath: './locales',
  defaultLanguage: 'ru'
});

const rowsList = document.getElementById('rowsList');
const lotteryGrid = document.getElementById('lotteryGrid');
const copyRowsButton = document.getElementById('copyRowsButton');

await i18n.init({ languageSelect: '#languageSelect' });
renderRows();
renderLotteries();

window.addEventListener('i18n:change', () => {
  copyRowsButton.dataset.defaultLabel = i18n.t('buttons.copyRows');
  renderRows();
  renderLotteries();
});

copyRowsButton.addEventListener('click', () => {
  copyRowsToClipboard({
    button: copyRowsButton,
    rows: sampleRows,
    copiedLabel: i18n.t('buttons.copied'),
    successMessage: i18n.t('notifications.copySuccess', { count: sampleRows.length }),
    errorMessage: i18n.t('notifications.copyError'),
    toText: formatRowsForClipboard
  });
});

function renderRows() {
  const fragment = document.createDocumentFragment();

  sampleRows.forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'ticket-row';

    const label = document.createElement('strong');
    label.textContent = i18n.t('rows.rowLabel', { number: index + 1 });

    const numbers = document.createElement('div');
    numbers.className = 'number-group';

    row.main.forEach((number) => numbers.append(createBall(number)));
    row.bonus.forEach((number) => numbers.append(createBall(number, true)));

    item.append(label, numbers);
    fragment.append(item);
  });

  rowsList.replaceChildren(fragment);
}

function renderLotteries() {
  const fragment = document.createDocumentFragment();

  GLOBAL_LOTTERIES.forEach((lottery) => {
    const card = document.createElement('article');
    card.className = 'lottery-card';

    const top = document.createElement('div');
    top.className = 'lottery-top';

    const titleBlock = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'lottery-name';
    name.textContent = lottery.name;

    const region = document.createElement('div');
    region.className = 'lottery-region';
    region.textContent = lottery.region;

    const icon = document.createElement('div');
    icon.className = 'lottery-icon';
    icon.textContent = lottery.icon;
    icon.setAttribute('aria-hidden', 'true');

    titleBlock.append(name, region);
    top.append(titleBlock, icon);

    const formula = document.createElement('div');
    formula.className = 'formula-pill';
    formula.textContent = lottery.formulaText;

    const meta = document.createElement('p');
    meta.className = 'lottery-meta';
    meta.textContent = describeFormula(lottery);

    card.append(top, formula, meta);
    fragment.append(card);
  });

  lotteryGrid.replaceChildren(fragment);
}

function createBall(number, isBonus = false) {
  const ball = document.createElement('span');
  ball.className = `ball${isBonus ? ' bonus' : ''}`;
  ball.textContent = String(number).padStart(2, '0');
  return ball;
}

function formatRowsForClipboard(rows) {
  const date = new Intl.DateTimeFormat(i18n.language).format(new Date());
  const lines = [i18n.t('copy.header', { date })];

  rows.forEach((row, index) => {
    lines.push(i18n.t('copy.row', {
      number: index + 1,
      main: row.main.join(', '),
      bonus: row.bonus.join(', ')
    }));
  });

  return lines.join('\n');
}

function describeFormula(lottery) {
  const { main, bonus } = lottery.formula;
  const mainText = i18n.t('lotteries.mainFormula', {
    pick: main.pick,
    min: main.min,
    max: main.max
  });

  if (!bonus) return mainText;

  const bonusText = bonus.playerSelected
    ? i18n.t('lotteries.playerBonus', { pick: bonus.pick, min: bonus.min, max: bonus.max, label: bonus.label })
    : i18n.t('lotteries.drawnBonus', { label: bonus.label });

  return `${mainText}. ${bonusText}.`;
}
