export const GLOBAL_LOTTERIES = [
  {
    id: 'powerball-us',
    name: 'Powerball',
    region: 'USA',
    icon: '🇺🇸',
    formulaText: '5/69 + 1/26 Powerball',
    formula: {
      main: { pick: 5, min: 1, max: 69, label: 'White balls' },
      bonus: { pick: 1, min: 1, max: 26, label: 'Powerball', playerSelected: true }
    }
  },
  {
    id: 'mega-millions-us',
    name: 'Mega Millions',
    region: 'USA',
    icon: '🇺🇸',
    formulaText: '5/70 + 1/24 Mega Ball',
    formula: {
      main: { pick: 5, min: 1, max: 70, label: 'White balls' },
      bonus: { pick: 1, min: 1, max: 24, label: 'Mega Ball', playerSelected: true }
    }
  },
  {
    id: 'euromillions-eu',
    name: 'EuroMillions',
    region: 'Europe',
    icon: '🇪🇺',
    formulaText: '5/50 + 2/12 Lucky Stars',
    formula: {
      main: { pick: 5, min: 1, max: 50, label: 'Main numbers' },
      bonus: { pick: 2, min: 1, max: 12, label: 'Lucky Stars', playerSelected: true }
    }
  },
  {
    id: 'eurojackpot-eu',
    name: 'Eurojackpot',
    region: 'Europe',
    icon: '🌍',
    formulaText: '5/50 + 2/12 Euro numbers',
    formula: {
      main: { pick: 5, min: 1, max: 50, label: 'Main numbers' },
      bonus: { pick: 2, min: 1, max: 12, label: 'Euro numbers', playerSelected: true }
    }
  },
  {
    id: 'superenalotto-it',
    name: 'SuperEnalotto',
    region: 'Italy',
    icon: '🇮🇹',
    formulaText: '6/90 + Jolly drawn + optional SuperStar',
    formula: {
      main: { pick: 6, min: 1, max: 90, label: 'Main numbers' },
      bonus: { pick: 1, min: 1, max: 90, label: 'Jolly', playerSelected: false },
      options: [{ pick: 1, min: 1, max: 90, label: 'SuperStar', playerSelected: true }]
    }
  },
  {
    id: 'vikinglotto-nordic',
    name: 'Vikinglotto',
    region: 'Nordic and Baltic Europe',
    icon: '🏔️',
    formulaText: '6/48 + 1/5 Viking number',
    formula: {
      main: { pick: 6, min: 1, max: 48, label: 'Main numbers' },
      bonus: { pick: 1, min: 1, max: 5, label: 'Viking number', playerSelected: true }
    }
  },
  {
    id: 'lotto-max-ca',
    name: 'Lotto Max',
    region: 'Canada',
    icon: '🇨🇦',
    formulaText: '7/52 + bonus drawn',
    formula: {
      main: { pick: 7, min: 1, max: 52, label: 'Main numbers' },
      bonus: { pick: 1, min: 1, max: 52, label: 'Bonus number', playerSelected: false }
    }
  },
  {
    id: 'powerball-au',
    name: 'Powerball Australia',
    region: 'Australia',
    icon: '🇦🇺',
    formulaText: '7/35 + 1/20 Powerball',
    formula: {
      main: { pick: 7, min: 1, max: 35, label: 'Main numbers' },
      bonus: { pick: 1, min: 1, max: 20, label: 'Powerball', playerSelected: true }
    }
  }
];

export function getLotteryById(id) {
  return GLOBAL_LOTTERIES.find((lottery) => lottery.id === id);
}
