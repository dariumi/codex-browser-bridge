# Проверка версии 0.1.0

Дата: 2026-10-09. Среда: Linux, Node.js 24.12.0, пользовательский профиль Brave.

- `npm run check`: синтаксис JavaScript и файлы manifest проверены.
- `npm test`: 15 автоматических тестов прошли.
- `npm run test:browser`: все 13 групп проверок прошли через настоящий stdio MCP,
  локальный мост и установленное расширение в Brave.
- Viewport и full-page PNG просмотрены встроенным просмотрщиком: значения полей,
  результаты HTML5/pointer drag и конец полной страницы отображаются корректно.
- Тестовая вкладка после проверки закрыта; MCP-соединение сохранилось.

Проверены вкладки, snapshot refs, заполнение, доверенные клики и ввод,
Unicode, клавиатурные сокращения, checkbox/select, открытый Shadow DOM,
HTML5 drag-and-drop, pointer drag, загрузка файла, confirm,
консоль и сеть, ожидание, прокрутка, два вида скриншотов, CDP,
навигация назад/вперёд и перезагрузка.

Исходные отчёт и скриншоты сохраняются в `.local/` и не публикуются.
Подключение, таймауты и обработка ошибок покрыты автоматическими тестами;
перезапуск фонового worker проверен с mock Chrome API.
Переподключение после перезапуска всего браузера, iframe, сайты с закрытым
Shadow DOM и другие браузеры в этой сессии не проверялись.

Воспроизведение: выполните установку из README и запустите
`npm run check`, `npm test`, `npm run test:browser`.

## Доработка 0.2.0

Дата: 2026-10-10. Установленное расширение Brave сообщает версию 0.2.0.

- `npm run check` проходит, включая ресурсы side panel, content script и иконки.
- `npm test`: все 26 автоматических тестов проходят.
- `npm run test:browser`: все 14 групп проверок проходят в установленном расширении.
- `npm run test:handoff`: настоящий Codex app-server через MCP заполнил форму,
  отправил её, включил checkbox, выбрал второй вариант, проверил результат и
  завершил цель. Итоговый ответ сохранён в истории задач; тестовая вкладка закрыта.
- Новые тесты проверяют группировку и восстановление вкладок, ограничение команд
  расширения, запрет задач от content scripts, RPC handshake/таймауты,
  продолжение цели, остановку/ошибки, checkpoint/rollback и устаревшую validation.
- Новые браузерные проверки: `npm run test:browser` для группы и extension commands,
  `npm run test:handoff` для автономного задания настоящему Codex.

- Клик по плавающей кнопке открыл настоящую боковую панель. Снимок окна проверен
  встроенным просмотрщиком: аватар, подключение, целевая вкладка, выбор режима,
  передача управления, поле задачи и история отображаются корректно.
- При проверке исправлены зависание группировки при открытом модальном диалоге
  и настройка разрешений MCP в отдельном автономном потоке Codex.

Отправка задачи именно через поле боковой панели и изменение исходников живым
агентом в режиме доработки пока не проверены. Запуск задания через локальный мост
проверен полностью; checkpoint, validation, apply/rollback покрыты тестами.


## Доработка 0.3.0

Дата: 2026-10-10. Node.js 24.12.0, Brave пользовательского профиля,
Firefox 157.0 в отдельном временном headless-профиле.

- `npm run check`: оба manifest и JavaScript проверены.
- `npm test`: 32 теста прошли. Добавлены проверки окон лимитов, отсутствующих
  данных, удаления личных идентификаторов, событий аккаунта, модели/rerouting,
  Firefox workspace и WebSocket origin.
- `npm run test:browser`: все 14 групп проверок в Chromium прошли.
- `npm run test:firefox`: все 7 групп прошли через настоящий stdio MCP, отдельный
  локальный мост и временное дополнение в настоящем Firefox: authentication,
  capabilities, refs, Unicode, fill/type/keyboard, checkbox/select, Shadow DOM,
  HTML5/pointer drag, wait/scroll, PNG, ошибки недоступных команд, навигация и release.
- `npm run package`: отдельные Chromium и Firefox ZIP и распакованная папка Firefox.
- `npm run lint:firefox`: 0 errors, 1 warning (`DANGEROUS_EVAL`). Это существующая
  способность `browser_evaluate`, выполненная в MAIN world страницы; код самого
  расширения из MCP не исполняется. Подпись/проверка магазина Mozilla не проводились.
- Настоящий Codex app-server вернул модель, тариф и остатки окон 300/10080 минут.
  Проверены потоковые изменения лимитов и фактическая модель задачи.
- Новый чат проверен Playwright в отдельном браузере, в локальном preview с адаптером
  runtime, который передаёт задачи настоящему мосту. Из формы отправлена задача,
  Codex заполнил поле `UI bridge works`, нажал submit, проверил результат и завершил
  цель. Отображались модель задачи, активность, сообщения и итог; анимация остановилась.
- PNG idle/running/completed просмотрены встроенным просмотрщиком; на ширине 420px
  нет горизонтального overflow. Проверена ширина 320px и `prefers-reduced-motion`.

Полный цикл через native Firefox sidebar, подпись XPI и постоянная установка
ещё не проверялись. Firefox DOM-события не являются trusted; ограничения и установка
описаны в README. Скриншоты и отчёты находятся в `.local/` и не публикуются.

Mozilla `web-ext` — только dev-зависимость. В установленной версии есть audit advisory
для транзитивного `node-forge` через Android adbkit (для Firefox Desktop не используется);
исправленной версии node-forge в npm на момент проверки нет. `shell-quote` обновлён
override до исправленной версии. Runtime-зависимости проверяются отдельно.

## Update 0.4.0

Date: 2026-10-10. Node.js 24.12.0; real Chromium/Brave and Firefox in isolated temporary profiles, plus the installed Brave extension.

- `npm run check`: JavaScript and both manifests pass.
- `npm test`: 44 tests pass, including host matching, subdomains/IDN, scoped/expiring consent, refusal, advanced consent, frame and named-API checks, queue-time rechecks, missing network guard, staggered expiry alarms, permission pause/resume, fast approval races, group preservation and temporary-only cleanup.
- `npm run test:isolated`: 14 existing Chromium automation groups and four access/workspace checks pass through real stdio MCP and a temporary extension. Consent is simulated only on loopback fixtures using the production permission-card UI. Protected HTTP redirects are blocked before the test server receives a request.
- `npm run test:firefox`: seven existing Firefox automation groups and the same four access/workspace checks pass through real stdio MCP and a temporary add-on.
- The installed bridge and Brave extension were reloaded to 0.4.0. The network guard, default rules, local form fill/click/snapshot and temporary-tab cleanup were checked without granting advanced or sensitive-site access.
- The permission card and paused state were previewed at 420px with Playwright and inspected using the built-in image viewer; the deny button removes the card. This visual preview uses mock task/account state; real site consent was tested separately in both isolated browsers.
- `npm run package`: both browser archives build. `npm run lint:firefox`: zero errors and the existing `DANGEROUS_EVAL` warning for explicitly approved page JavaScript.

No public sensitive site was opened for testing. The new guard is not a complete security sandbox; its boundaries and the project responsibility notice are documented in both README versions and DISCLAIMER.md. Live Codex handoff with a real user's sensitive-site decision has not been run; pause/resume and interruption races are covered by TaskManager tests.

## Update 0.5.0

Date: 2026-10-10. Node.js 24.12.0; real Brave/Chromium and Firefox in isolated temporary profiles, plus the installed Brave bridge.

- `npm run check`, `npm test` (52 passing tests), `npm run package` and `npm run lint:firefox` pass. Firefox lint reports zero errors and the existing `DANGEROUS_EVAL` warning for separately approved page JavaScript.
- `npm run test:isolated`: 18 Chromium automation/access/workspace groups pass. `npm run test:firefox`: 12 groups pass, including submitting a chat task from the actual `about:debugging` tab and receiving the actionable HTTP(S)-target message instead of a URL-constructor exception. Test grants exist only in isolated extensions.
- Update tests cover the canonical source, release metadata, user policies, active/sleeping task deferral, dirty-checkout rejection, staging failures and safe rollback. A real temporary Git upstream/checkout test validates a release in a detached worktree, fast-forwards it and preserves ignored private configuration. Staged updates also run Firefox lint before installation.
- Long-task tests cover persisted sleep/deadlines, automatic wake, saved-thread restoration, active-runtime accounting, cancellation and access reapproval. A real Codex app-server accepted automatic goal pause/reactivation. A live managed task slept, woke and completed form actions; its final verification stopped because the test incorrectly requested a hidden select value through an accessibility snapshot. The corrected full test could not run because the app-server account usage limit was reached. Full corrected live end-to-end completion is therefore not claimed.
- `npm run doctor -- --json` reports a healthy installed bridge: matching 0.5.0 browser/server versions, authenticated connection, configured Codex registration, 33 tools discovered through real stdio MCP, and an active network guard. The doctor does not print connection secrets or account identifiers.
- The long-task controls, sleeping countdown, early wake button and update banner were previewed at 420px with mock state and inspected with the built-in image viewer. This preview does not substitute for live task validation.

Firefox store signing/permanent installation remains outside this test run. Sleeping requires an available computer, bridge and target page; waking always checks actual page progress and site permissions. Private screenshots, connection files and task history remain ignored and are not published.
