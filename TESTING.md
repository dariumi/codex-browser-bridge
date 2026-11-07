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

## Working update 0.6.0 (not published)

Date: 2026-10-11. Development session has a read-only original Git directory, restricted networking and restricted local socket creation.

- JavaScript/manifest checks, Chromium/Firefox packaging and Firefox lint pass. Lint retains the existing single `DANGEROUS_EVAL` warning; no errors.
- 55 tests pass when the independent non-network test files are run separately: account normalization, browser gestures, extension sender boundaries, access policy, task/sleep lifecycle, updates/real temporary Git staging, workspace preservation, and seven new privacy/model/context/media/native-consent checks. New privacy tests confirm session-only disk records, ephemeral threads, opt-in persistence, rejection of active-task deletion, saved owned-thread deletion and catalog validation. Media/device tests check actual metadata, missing capture support and explicit native opt-in/disconnect. Six additional launcher/virtual-stream tests cover gesture ordering, extension-only fallback reuse, DOM removal/reinjection, visible launch errors, audio/camera/synthetic-screen routing, native-device selection, mixed-track rejection, expiry, API restoration and origin-scoped cleanup.
- Full `npm test` was attempted. Broker and real MCP tests cannot bind loopback (`listen EPERM`); the real app-server JSONL fixture child exits before handshake in this environment, including with unchanged 0.5.0 sources. These failures are not treated as successful validation or skipped in the project's test command.
- `test:isolated` and `test:firefox` were both attempted and stopped at loopback server creation (`EPERM`). Browser gesture changes, live video/audio capture, real native devices and direct TLS cloud connection still need their real browser/system integration runs.
- A separate Git validation checkout/worktree was created under `/tmp`, with current source copied in and existing unchanged dependencies linked for checks. No original Git metadata or user files were overwritten.
- Playwright UI smoke code was prepared under ignored `.local/` with synthetic account/task data. CLI launch/control could not complete reliably because the package registry, default cache writes and daemon socket access are restricted. New UI screenshots are not claimed as inspected. The installed user's extension and bridge remain on 0.5.0; no test grants were added.
- GitHub description/homepage/topic changes were attempted through `gh` and rejected by unavailable network access. `npm run github:configure` contains the prepared official repository settings. No commit/push or GitHub configuration change is claimed.

Extension-only virtual streams require explicit opt-in and advanced approval; they exist in the current document and do not imitate OS hardware identity or capture the real desktop. Actual browser MediaRecorder/WebRTC integration remains unverified. Optional native devices are Linux-only, require explicit extension opt-in and separate advanced consent, and need browser-local ffmpeg/PulseAudio/PipeWire or a user-configured virtual camera. Screen picker consent is never bypassed. Audio resources do not imply transcription or model audio support. Account profile names remain unavailable when app-server does not provide them. Context and five-hour allowance display unavailable instead of fabricated estimates.


## Working update 0.6.1

Date: 2026-10-11. Compact conversation UI: scrollable messages with a bottom composer, inline model/effort selectors, thin usage meters (unavailable data hidden), slash-only command suggestions and dismissible settings. Both sidebar settings and the separate options page have explicit close buttons. Sidebar Escape/backdrop dismissal and keyboard focus containment are implemented.

- Source validation ran in the separate `/tmp` worktree. Syntax/manifests, packaging and Firefox lint pass; the existing one `DANGEROUS_EVAL` warning remains.
- Two new command tests validate prefix filtering, keyboard/click selection without executing tasks, Escape/submission dismissal and leaving ordinary text alone. All 57 independent tests pass.
- Full `npm test` still fails in app-server, broker and MCP integration files under the environment restrictions previously recorded. Both browser suites were attempted and fail at loopback creation (`listen EPERM`). Live layout, scrolling, keyboard focus and browser settings-page closing are not claimed as verified.
- Versions agree at 0.6.1 across both manifests, package/lockfile, update metadata and bridge clients. Update classification remains non-critical. Prepared archives are under ignored `dist/`; no private configuration or history is included.


## Working update 0.6.2

Date: 2026-10-11. Chat close button, extension diagnostics and local Complex Lab. The lab is served by the loopback bridge or `npm run fixture`; the remote TLS gateway is unchanged. The dedicated launcher still uses the production site guard and records only its new test tab as temporary.

- Checks, packaging and Firefox lint pass in the separate validation worktree; one existing `DANGEROUS_EVAL` warning remains. Both archives are prepared under ignored `dist/`.
- 63 independent tests pass. Six new checks cover Firefox click-stack closing, Chromium global/tab panel closing, dedicated loopback targets, allowlisted static assets, conditional form/stale-search validation, report privacy and refusal to request physical hardware in the optional virtual-stream test. A broker integration test additionally checks public synthetic assets without weakening command authentication, origin rejection or private-file isolation; its execution is blocked by socket restrictions here.
- Isolated Chromium/Firefox suites include the new complex scenarios: controlled DOM replacement, conditional multi-stage form, stale async search, open Shadow DOM, HTML drag payload, pointer drag, frame boundary and actual video-frame/animation metadata. Result assertions use snapshots rather than eval under the strict fixture CSP. Higher-level iframe input remains unsupported in Firefox; Chromium CDP frame input and opt-in virtual streams are recorded as not run, not counted as passing actions.
- Full `npm test` and both browser suites were attempted. The same three app-server/broker/MCP integration files fail under environment restrictions; browser suites stop at loopback creation (`listen EPERM`). No new real-browser passes, screenshots, installed-extension update or GitHub push are claimed. Closing panel APIs and layout still require the live browser run.

## Working update 0.7.0 (not published)

Date: 2026-11-05. Source is validated in a fresh local clone and separate detached worktree under `/tmp`, based on the user's published 0.6.2 commit. Original Git metadata and user browser grants are untouched.

- The Studio adds `browser_view`, `browser_scripts` and `browser_extensions` (38 schemas, all serializable). Seven new independent tests cover script bounds/origins, permission pause and explicit resume, cancellation, retention migration, fixed integration messages/URL guards, Firefox scoped UA and document CSS zoom, Chromium CDP emulation/per-tab zoom and cleanup. The launcher test additionally covers drag coordinates, global hide/restore and listener cleanup after reinjection.
- 70 independent tests pass. Syntax/release consistency checks, both package archives and Firefox lint pass; lint keeps the existing single `DANGEROUS_EVAL` warning. Native per-origin zoom is never modified in Firefox; its presentation zoom uses current-document CSS. UA/profile reapplication checks permission again after navigation.
- Isolated Chromium and Firefox regression suites now include saved-script execution and actual User-Agent observed by a local HTTP fixture, followed by reset. Their execution here stops at loopback creation (`listen EPERM`). The full `npm test` still fails in the same app-server/broker/MCP integration files under the recorded environment restrictions. These failures are not skipped or counted as passing.
- A Playwright CLI launch with the cached tool, isolated session directory and Brave configuration was attempted; its daemon exits before browser control. No new UI screenshots or live browser passes are claimed. Real browser profiles, Studio UI, viewport/UA behavior and interoperability with a cooperating external extension still need those integration runs.
- GitHub access was retried through `gh` and fails to connect to api.github.com. No push, tag or GitHub release has been published from this session. RELEASE_NOTES.md and ignored dist archives are prepared for review/publication.

## Working update 0.8.0 (packages prepared, not published)

Date: 2026-11-05. Preserves the existing uncommitted 0.7 work and adds installer/distribution support. A fresh clone and separate detached worktree under `/tmp` are used for validation; original Git metadata and installed browser grants are untouched.

- 73 independent Node tests and 7 Python tests pass. New distribution tests check Firefox export/manifests, idempotent upgrades, preservation of edited exports, refusal to force-replace unrelated directories and idle-only graceful stop. Python tests cover help/version without runtime bootstrap, payload integrity, explicit first setup, version/hash cache isolation, minimum Node version and failed-install cleanup.
- `npm run check`, `npm run package` and `npm run lint:firefox` pass; lint retains one existing DANGEROUS_EVAL warning. Versions agree across npm/Python/bridge/browser/update metadata. All 38 MCP schemas serialize.
- npm .tgz, Python wheel and sdist build successfully. Artifact checks scan paths/private files, verify shrinkwrap and bundled SHA-256/version, run the unpacked CLI and `setup --no-codex --no-start`, prepare both add-ons in isolated user state and verify package-managed update/source-edit restrictions. The wheel was additionally installed with pip into a temporary target and its CLI version/integrity checked.
- A fresh npm install was attempted with an isolated prefix: writing the default shared cache was denied, then a writable cache was populated only from this project's public dependency entries. Offline install misses content-disposition 2.0.1; an online retry fails registry.npmjs.org DNS (ENOTFOUND). Clean runtime dependency installation and the packaged MCP handshake are therefore not claimed as passed here. `scripts/test-packages.py --install` performs that real online install/handshake in CI.
- Full `npm test` still fails in the same app-server, broker and MCP integration files under environment restrictions; both browser suites stop at loopback `listen EPERM`. No live browser or graceful daemon restart pass is claimed. Python/macOS/Windows native integration remains unverified outside the tested Linux environment.
- Package builds do not register Codex, load an add-on or publish registry packages. README explicitly labels registry-name commands as post-publication instructions. No npm/PyPI/GitHub publication, credentials or ownership verification is claimed. The manual publishing workflow requires the maintainer's registry configuration and explicit dispatch.

## Update 0.8.1 — connection recovery and GitHub source publication

Date: 2026-11-07. A live MCP status initially showed no extension; the user then reported recovery. MCP/bridge 0.8.0 and Chromium extension 0.8.0 authenticated, and browser_tabs completed a real command round trip. The exact original transient cause was not reproduced. Creating a temporary local test tab was rejected by the tool approval policy, so no form/drag test or test tab creation is claimed for this session.

- Added a 15-second handshake watchdog, 65-second heartbeat timeout, stale closing/closed socket recovery and watchdog alarm initialization on background startup. Delayed events from a replaced socket are ignored. A temporarily occupied bridge retries after ten seconds; other 1008 failures, including invalid keys, remain blocked until corrected or explicitly retried by the user.
- Added the extension settings Reconnect button. It uses the existing user-only UI boundary and preserves the configured URL/key; normal cleanup/permission behavior remains intact.
- Four connection-decision tests plus one mocked-background integration test cover suspension/timeout decisions, stalled handshakes, stale event isolation, contention retries, invalid-key blocking and explicit reconnect. Independent checks total 78 Node tests plus 7 Python tests. Mocked background behavior does not substitute for a live post-sleep browser test.
- Required full tests/browser suites were attempted in a separate worktree. The same app-server/broker/MCP integration files and browser localhost binds remain restricted by the environment. Packaging/syntax/Firefox lint and artifact checks are recorded separately; no blocked suite is treated as passed.
- Terminal gh cannot reach api.github.com, but the connected GitHub app can access this repository with push permission. The remote baseline is verified against local HEAD before preparing a single atomic source commit; publication/readback is reported in the task result. No npm/PyPI publication is involved, and private state/browser data are excluded.
