# Automation Studio (0.7)

Open **Studio** from the extension popup, or **Automation Studio** in chat settings. Select the target HTTP(S) tab explicitly. The studio, site rules, connection settings and diagnostics are separate pages; private configuration is never included in extension archives.

## View and User-Agent

`browser_view` supports `inspect`, `set`, `reset`. Chromium supports CDP viewport dimensions, pixel ratio, mobile/touch, preferred color scheme, timezone, locale, zoom and User-Agent. Firefox supports document CSS zoom (leaving native per-origin zoom untouched) and a tab/origin-scoped HTTP User-Agent rule plus a current-document `navigator.userAgent` override. Firefox viewport/theme/timezone emulation is rejected rather than simulated by CSS scaling. Studio disables those controls in Firefox.

```json
{"action":"set","tabId":123,"width":390,"height":844,"mobile":true,"touch":true,"zoom":1,"colorScheme":"dark","userAgent":"My-Test-Browser/1.0"}
```

Use `reset` to restore Chromium native zoom/settings or Firefox document styles. Changes require existing site and advanced approval. Cleanup restores only bridge-owned settings without granting new page access. Profiles are removed on control disconnect, site-policy changes and navigation to another origin. Session cleanup also restores saved profiles after a background restart. Changing User-Agent requires reloading to affect new requests. Firefox re-applies its document override after same-origin load; early scripts, workers and UA Client Hints can still see the native identity. This is not a full physical-device fingerprint or browser replacement. The real browser's UI and other tabs are not resized. Chromium zoom explicitly uses per-tab scope. Firefox does not support changing zoom scope through tabs.setZoomSettings, so this implementation uses document CSS zoom instead; it does not emulate viewport media queries. See [zoom scope](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/ZoomSettingsScope) and [compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/tabs.json).

Implementation references: [CDP Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/), [Firefox header modification](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/ModifyHeaderInfo).

## Saved action scripts

Scripts are declarative JSON action sequences, not arbitrary JavaScript or shell programs. Create/edit in Studio, import/export JSON, or create with `browser_scripts` → `save`. A script must declare exact allowed HTTP(S) origins. Those origins do **not** grant site permission; each step still uses the normal guard and checks its current target.

```json
{
  "id": "page-review",
  "name": "Page review",
  "origins": ["https://example.com"],
  "steps": [
    {"action":"snapshot","args":{}},
    {"action":"scroll","args":{"deltaY":500}},
    {"action":"wait","args":{"delayMs":300}},
    {"action":"snapshot","args":{}}
  ]
}
```

Supported steps: click, fill, type, press_key, hover, scroll, select, bounded wait, navigate, snapshot and bounded media operations. Element selectors/refs use the same browser tools; refresh refs after DOM changes. Scripts target one fixed tab. New/close tab, raw CDP/eval, device feeds, extension calls and permission changes are not script steps. A sequence has at most 50 steps and a ten-minute active run budget, checked between actions. Waits remain bounded by the normal tool limits. A cancellation prevents the next action; an in-flight action can finish and its outcome must be inspected.

`run`/`resume` returns immediately with a job. Inspect `status` or watch progress in Studio. An access request pauses at its current step; the user must approve in the ordinary extension UI and explicitly resume. Failures and timed-out/uncertain actions are not retried automatically. Stop a managed Codex task before starting an independent Studio script, and stop an independent script before submitting a chat task. A running managed agent may itself run a saved script and inspect its job before continuing; finishing its task cancels an unfinished script. Control must be enabled and connected; disconnect cancels the job. Background/browser restarts do not replay in-flight scripts.

The library is stored in browser session storage by default. Only the user's **Persist scripts on disk** setting changes that to local storage; switching back removes the local copy. Scripts can contain entered values: keep passwords/tokens out of stored/imported examples. Job results do not store snapshots, form values or a chat transcript; only progress and errors remain in memory. Export is an explicit download; source updates never publish the user's library.

## Cooperating extensions

`browser_extensions` lists configured templates or invokes one by ID. The user configures each exact message in Studio:

```json
[
  {
    "id":"ping-helper",
    "extensionId":"REPLACE_WITH_THE_TARGET_EXTENSION_ID",
    "origins":["https://example.com"],
    "message":{"type":"ping"}
  }
]
```

Use the actual Chromium ID or Firefox add-on ID. The target must implement external messaging (`runtime.onMessageExternal`) and permit this bridge. Nothing can make an arbitrary extension accept commands, expose its private pages or bypass its permissions. The bridge does not enumerate installed extensions or request management permission. It does not expose an inbound command API to external extensions.

The agent cannot add integrations or supply arbitrary message payloads. It can invoke only the user's fixed template, on a configured and approved origin, with advanced consent. HTTP(S) URLs referenced by that message also go through the site guard. No connection token, task history, profile or page content is appended automatically. Responses are untrusted and bounded to 16 KiB; a timeout has an unknown outcome and must not trigger an automatic retry. A cooperating extension has its own privileges; review exact messages and never configure unrestricted proxies, eval or operations that work around site restrictions.

[External messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [externally_connectable](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable).

## Floating launcher

The launcher defaults to compact mode. Drag the **⠿** handle, or focus it and use the arrow keys. Position is clamped to the viewport and saved in local browser settings, without site URLs. The **×** control hides it globally. Restore it from **Restore launcher** in the popup or Studio → **Page launcher**; reset position or expand the label there. Changes propagate to open pages. The normal browser toolbar remains usable while the page launcher is hidden. Browser internal pages and restricted stores can prohibit injection.

## Русская памятка

В popup или настройках чата откройте **Студию автоматизации**, выберите рабочую вкладку. Здесь доступны JSON-сценарии, представление и User-Agent, шаблоны сообщений другим расширениям и настройки плавающей кнопки.

Сценарии не обходят доступ к сайтам: разрешение выдаётся в обычном интерфейсе, затем нажмите **Продолжить после разрешения**. Хранение по умолчанию — только сессия; запись на диск включается пользователем отдельно. Произвольный JavaScript и команды ОС не исполняются.

В Chromium доступны viewport/mobile/touch, тема и User-Agent; в Firefox — масштаб и ограниченная подмена User-Agent. Она не меняет весь отпечаток браузера. **Сбросить представление** возвращает исходный масштаб и штатные параметры.

Другие расширения должны поддерживать внешний API. Пользователь заранее задаёт точное сообщение и разрешённые origin; агент выбирает только готовый шаблон.

Плавающая кнопка перемещается за **⠿**, скрывается через **×** и возвращается из popup кнопкой **Вернуть кнопку**. Положение и компактный режим можно сбросить в студии.
