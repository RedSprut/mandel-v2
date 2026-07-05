# Mandel v2 Frontend Modules

Vanilla JS implementation for the requested mobile-first Mandel v2 modules:

- JSON-based i18n with runtime language switching.
- Clipboard copy feedback with animated toast and temporary button success state.
- Universal tap/click active states for tactile mobile interaction.
- Normalized global lottery configuration.

## Structure

```text
mandel-v2-frontend-modules/
  index.html
  styles.css
  manifest.webmanifest
  locales/
    en.json
    no.json
    ru.json
    es.json
    de.json
    fr.json
    zh.json
    it.json
    pt.json
    pl.json
  src/
    app.js
    feedback.js
    i18n.js
    lotteries.js
```

## Run Locally

JSON locales are loaded with `fetch()`, so run the folder through a static server:

```bash
cd mandel-v2-frontend-modules
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## i18n JSON Example

`locales/ru.json`:

```json
{
  "app": {
    "kicker": "PWA для анализа лотерей",
    "title": "Mandel v2 модули",
    "subtitle": "Мобильная i18n-система, UX feedback и конфиги лотерей."
  },
  "buttons": {
    "copyRows": "Скопировать ряды",
    "copied": "Скопировано! ✅"
  },
  "notifications": {
    "copySuccess": "Скопировано {count} ряда.",
    "copyError": "Не удалось скопировать. Проверьте разрешения браузера."
  }
}
```

## Integration

```js
import { createI18n } from './src/i18n.js';
import { copyRowsToClipboard } from './src/feedback.js';
import { GLOBAL_LOTTERIES } from './src/lotteries.js';

const i18n = createI18n({ basePath: './locales', defaultLanguage: 'ru' });
await i18n.init({ languageSelect: '#languageSelect' });
```

The button feedback contract is intentionally small:

```js
copyRowsToClipboard({
  button: document.querySelector('#copyRowsButton'),
  rows,
  copiedLabel: i18n.t('buttons.copied'),
  successMessage: i18n.t('notifications.copySuccess', { count: rows.length }),
  errorMessage: i18n.t('notifications.copyError'),
  toText: (rows) => rows.map(formatRow).join('\n')
});
```

## Notes

- Active states are in `styles.css`: `.button`, `.tap-target`, and `button`.
- The tap feedback uses `transform: scale(0.97)`, `filter: brightness(0.9)` and a `0.1s` transition.
- Lotto Max uses the current 2026 matrix: `7/52 + bonus drawn`.
- Vikinglotto uses the current `6/48 + 1/5 Viking number` matrix.
