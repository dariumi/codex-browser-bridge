# Diagnostics and Complex Lab

The chat settings and extension options link to **Diagnostics and test page**. This page checks whether control is enabled, the extension is connected, bridge/extension versions match, the site-access network guard exists and the sidebar API is available. These are connection/capability checks, not proof that browser actions work or that a Codex account has quota.

For a local bridge, **Open test page** opens `http://127.0.0.1:<bridge-port>/complex`, served by the running bridge. The lab uses synthetic inputs and no external services. Site restrictions still apply; the UI cannot approve access automatically. Stop a current task before opening this test. The extension records this new tab as temporary. The chat's **Close** button hides the sidebar (or closes its standalone chat tab) without cancelling a task or closing its target.

For a remote bridge, start the fixture on the **browser computer**, then set the test URL to `http://127.0.0.1:17864/complex`:

```sh
npm run fixture
```

The TLS gateway does not publish these HTTP test assets. Only dedicated localhost/127.0.0.1 lab URLs are accepted by the diagnostics launcher. A shared remote filesystem does not make server-side loopback accessible to the user's browser.

## Ask Codex to run the lab

1. Open the lab through Diagnostics.
2. Press **Copy task**, open its floating Codex chat button, paste and submit. Choose the test page as target if necessary.
3. Make site/advanced permission decisions in the ordinary extension UI. Virtual devices are a separate optional setting and permission. Do not activate real hardware just to obtain a green test result.
4. Review the page's checklist and the agent's PASS / FAIL / UNSUPPORTED report. A page flag records a browser result, not proof that the agent interpreted video/audio. Agent observation requires snapshots, actual frames or supported captured audio.
5. Download the lab's JSON report if needed. It contains stage booleans, capability notes and a timestamp; no chat history or entered field values. Results stay in page memory until reload, unless you explicitly download them.

Required scenarios: a controlled input replacing DOM nodes, a conditional multi-stage form, delayed search with stale-response rejection, open Shadow DOM, HTML drop payloads, pointer dragging, nested-frame isolation, animation/media inspection. The lab also supports manual frame input and optional audio/video stream requests.

Higher-level input tools currently lack an explicit iframe target. Chromium can use scoped CDP frame operations; the new automated suite does not exercise that route. Firefox frame input is reported unsupported rather than faked by calling page handlers. Clipboard, autoplay, audio capture and virtual stream support can be restricted by the browser. Synthetic events in Firefox are not trusted input. Report these limits explicitly; do not edit the checklist or weaken site rules to make tests pass.

## Repository regression suites

```sh
npm run check
npm test
npm run package
npm run lint:firefox
npm run test:isolated
npm run test:firefox
```

The last two commands launch separate temporary browser profiles, use isolated fixture-only consent and run existing baseline/access-policy checks plus Complex Lab regressions. No grants are seeded in the installed extension. They exercise actual input/drag/media tools and compare observed page results through snapshots, without requiring page eval under the lab's strict CSP. Both print frame/device stages that were unsupported or not run. Browsers, local socket permissions and dependencies must be available. Do not count a suite as passed if it failed to start.

## Русская памятка

В чате откройте **Настройки → Диагностика и тестовая страница**. Нажмите **Открыть тестовую страницу**, скопируйте задачу со страницы и отправьте её в чат этой вкладки. Разрешения на сайт и JavaScript/CDP выдаются обычным способом. Страница сама отмечает фактические результаты: форма, поиск, Shadow DOM, перетаскивание, iframe и медиа. Ограниченные действия агент должен обозначить как UNSUPPORTED. Виртуальные устройства — отдельный необязательный этап.

При удалённом мосте выполните `npm run fixture` на компьютере с браузером и укажите `http://127.0.0.1:17864/complex`. Отчёт скачивается кнопкой на странице; история чата в него не включается. Крестик самого чата закрывает интерфейс, сохраняя рабочую страницу и выполняемую задачу.

Sidebar closing uses the [Chromium Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) when `close` is available, and the [Firefox sidebar close API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction/close) directly from the click handler. Older Chromium versions without the close API show guidance to use the browser’s native close button.
