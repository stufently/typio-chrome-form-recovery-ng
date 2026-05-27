# Store Listing Copy

Source-of-truth copy for Chrome Web Store, Mozilla AMO, Microsoft Edge Add-ons, and Opera Add-ons. Update here first, then paste into each store dashboard.

## Summary line (≤ 132 chars, Chrome Web Store summary)

**EN:** Auto-save and recover lost text from web forms. Privacy-first — no servers, no telemetry, your drafts stay in your browser.

**RU:** Автосохранение и восстановление текста из веб-форм. Приватно — без серверов и аналитики, всё хранится в вашем браузере.

## Detailed description

### EN

**Lost a long comment to a page reload? Tab crash ate your form? Typio Chrome Form Recovery NG has your back.**

Typio NG silently auto-saves text you type into web forms and lets you recover it after a reload, crash, or accidental navigation. It is a privacy-first, modern Manifest V3 successor to the original Typio Form Recovery extension which was removed from the Chrome Web Store in 2025 when Manifest V2 was deprecated.

**What is saved**

- Plain `<input>` fields (text, email, url, search, tel, number)
- `<textarea>` fields
- Saved drafts are scoped to the hostname and the field you typed in
- A few seconds of typing inactivity triggers a save — you don't have to think about it

**What is NEVER saved**

- Password fields, credit card fields, OTP / 2FA codes — refused at the input level
- Hidden / submit / checkbox / file inputs
- Anything you type on `/login`, `/checkout`, `/payment`, `/billing`, `/auth`, `/2fa` pages
- Pages on hosts you've added to the blocklist in Options
- Incognito / private browsing — extension is disabled there by default
- Browser-internal pages (`chrome://`, the Web Store itself, the PDF viewer)

**How to recover**

- Click the toolbar icon to see drafts for the current page
- Press **Alt+Shift+Z** for the in-page recovery dialog with search
- Right-click any text field → "Recover text in this field"

**Privacy promise (no asterisks)**

- All data lives in your browser's IndexedDB
- No telemetry. No analytics. No servers. No accounts.
- Source code is MIT-licensed on GitHub: https://github.com/stufently/typio-chrome-form-recovery-ng

**Settings**

- Adjust retention from 1 to 365 days
- Maintain a hostname blocklist (with `.subdomain.com` wildcards)
- Export your data as JSON; import it with a dry-run preview before applying

**Permissions explained** (full rationale in the repo)

- `storage` — small extension settings (drafts live in IndexedDB)
- `alarms` — daily cleanup of expired drafts
- `contextMenus` — the "Recover text in this field" right-click entry
- `activeTab` — opens the recovery dialog on the page you have open
- `<all_urls>` content script — autosave runs on the sites you visit

This extension shares no source code with the original Typio. The original is licensed under CC BY-NC-ND 4.0; this is a clean-room implementation under the MIT license.

---

### RU

**Потеряли длинный комментарий из-за перезагрузки? Браузер крашнулся прямо посреди формы? Typio Chrome Form Recovery NG спасёт.**

Typio NG молча автосохраняет текст, который вы вводите в веб-формы, и позволяет восстановить его после перезагрузки, краша или случайного перехода. Это приватный современный Manifest V3-преемник оригинального Typio Form Recovery, который был удалён из Chrome Web Store в 2025 году вместе с поддержкой Manifest V2.

**Что сохраняется**

- Обычные `<input>`-поля (text, email, url, search, tel, number)
- `<textarea>`
- Черновики привязаны к домену и конкретному полю
- Сохранение срабатывает через пару секунд после паузы в наборе — думать об этом не нужно

**Что НИКОГДА не сохраняется**

- Поля с паролем, картой, OTP / 2FA — отклоняются на уровне поля
- Hidden / submit / checkbox / file
- Всё, что вы вводите на `/login`, `/checkout`, `/payment`, `/billing`, `/auth`, `/2fa`
- Хосты из вашего чёрного списка
- Incognito / приватный просмотр — расширение там выключено по умолчанию
- Внутренние страницы браузера (`chrome://`, сам Web Store, PDF-viewer)

**Как восстановить**

- Клик по иконке расширения — список черновиков для текущей страницы
- **Alt+Shift+Z** — диалог восстановления с поиском прямо на странице
- Правый клик на любом текстовом поле → «Восстановить текст в это поле»

**Обещание по приватности (без звёздочек)**

- Все данные живут в IndexedDB вашего браузера
- Никакой аналитики, никаких серверов, никаких аккаунтов
- Исходный код под MIT-лицензией: https://github.com/stufently/typio-chrome-form-recovery-ng

**Настройки**

- Срок хранения от 1 до 365 дней
- Чёрный список хостов (с wildcards `.subdomain.com`)
- Экспорт JSON; импорт с предварительным сухим прогоном

**Объяснение разрешений** (полное обоснование в репозитории)

- `storage` — небольшие настройки (сами черновики — в IndexedDB)
- `alarms` — ежедневная очистка истёкших черновиков
- `contextMenus` — пункт «Восстановить текст в это поле»
- `activeTab` — открыть диалог на текущей вкладке
- `<all_urls>` content script — автосохранение работает на посещаемых сайтах

Это расширение не содержит ни строки кода из оригинального Typio. Оригинал под CC BY-NC-ND 4.0; это полностью независимая реализация под MIT.

## Categories / tags

- **Primary category (Chrome / Edge):** Productivity
- **Secondary category (AMO):** Web Development
- **Suggested tags:** form, autosave, recovery, draft, privacy

## Screenshots requirements

| Store            | Sizes                           | Count              |
| ---------------- | ------------------------------- | ------------------ |
| Chrome Web Store | 1280×800 or 640×400             | 1 minimum, up to 5 |
| Firefox AMO      | 2400×1800 max, 1280×800 typical | up to 10           |
| Edge Add-ons     | 1280×800 or 1366×768            | up to 10           |

Auto-captured by `tests/e2e/screenshots.spec.ts` after a chrome build.

## Support links

- Repository: https://github.com/stufently/typio-chrome-form-recovery-ng
- Issues: https://github.com/stufently/typio-chrome-form-recovery-ng/issues
- Privacy policy: link to the raw PRIVACY.md file in the repo, or host the same content on a project page.
