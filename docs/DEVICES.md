# Virtual media devices

## Extension-only mode (default)

No native host or system driver is required. Enable **Virtual devices on this page** in extension settings, approve the target website and its separate JavaScript/CDP access, then call `browser_devices` with `backend: "virtual"` (the default), a target tab, `action: "audio"`, `"video"` or `"screen"`, and `seconds: 1–300`.

The extension uses Web Audio and canvas MediaStreams in the current page. An audio fixture or generated tone appears as **Codex Virtual Microphone**; an image/video fixture or generated test card appears as **Codex Virtual Camera**. Screen mode supplies a synthetic test stream to this document's `getDisplayMedia`; it does not capture your real desktop. Fixtures are optional, base64, under 500 KiB. Configure streams before the website requests media; existing recordings must be restarted. A real click in the page may be needed to resume audio: status reports `requiresPageGesture`.

These devices exist in this page's media APIs, not the operating system or browser's physical-device picker. The website can distinguish them from real hardware. Explicit real-device selections still use native browser permissions. Mixed real and virtual tracks in one request are rejected; configure every requested virtual track. Streams are stopped on expiry, page unload, task finish, disconnect, policy changes or disabling this setting. Stop restores the original APIs without overwriting subsequent page changes. Cross-origin frames require their own approved target and are not implicitly modified.

Implementation uses [canvas captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream) and [AudioContext media destinations](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination).

## Optional OS devices (Linux)


The optional native host creates actual OS media feeds. It is separate from page JavaScript, and must be installed on the same computer as the browser. Supported: Linux with ffmpeg and PulseAudio or PipeWire's PulseAudio compatibility. Camera feeds additionally need an existing writable v4l2loopback device. Windows/macOS device drivers are not implemented.

1. Install `ffmpeg` and `pactl` using your distribution package manager. For camera tests, configure v4l2loopback yourself and note the virtual `/dev/videoN`. Do not point the helper at a physical camera or another process's video device.
2. Load the extension. Find its Chromium extension ID in the browser extension page. From this checkout run:

   ```sh
   node scripts/native-setup.js YOUR_CHROMIUM_EXTENSION_ID
   ```

   This only generates manifests and a launcher under ignored `.local/native/`. For Firefox-only use, any 32 letters from `a` to `p` is acceptable for the unused Chromium manifest; Firefox uses the fixed add-on ID.
3. Copy `.local/native/chromium.json` as `com.codex.browser_bridge.devices.json` into your browser's `NativeMessagingHosts` directory, for example `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/` or `~/.config/google-chrome/NativeMessagingHosts/`. For Firefox copy `firefox.json` under `~/.mozilla/native-messaging-hosts/` with the same filename. Keep the generated launcher at its recorded absolute path. Browser packaging/profile locations can differ.
4. Reload the extension and enable **Virtual devices on this computer** in settings. `browser_devices` with `backend: "native"` and `action: "status"` reports prerequisites. Audio/video feeding additionally requires the extension's separate JavaScript/CDP approval; content scripts cannot enable it.
5. Supply a small base64 audio/video fixture (under 500 KiB), an explicit target tab and a duration of 1–300 seconds. For audio select **Codex_Bridge_Microphone** as the page's microphone in its own permission/device picker. For camera choose the configured v4l2loopback device. The helper does not change the system's default input/output. Decoding or device errors are reported.

`browser_devices stop`, disconnecting browser control, finishing a task, changing site rules or disabling device support closes the native host and stops its feeds. Streams also expire at the specified duration; private temporary fixture files and the helper's own audio module are cleaned up. The host accepts bounded supplied data and allowlisted operations only, never arbitrary commands, network URLs or file paths. Only `/dev/videoN` is an accepted camera destination.

In native mode, screen sharing uses the website's existing screen picker and user gesture. The helper does not bypass this picker or automatically select a screen. Virtual input is a test media source, not physical hardware identity or a way around website consent. Installing drivers/native host and real microphone/camera/screen picker flows have not been validated in this restricted development session.

The microphone uses a null sink and its monitor remapped as an input source, supported by the [PipeWire PulseAudio module interface](https://docs.pipewire.org/page_pulse_module_remap_source.html). Browser screen picking follows the [Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
