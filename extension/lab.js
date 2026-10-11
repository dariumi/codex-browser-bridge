(() => {
  const $ = id => document.getElementById(id);
  const stages = { controlled: 'Controlled input', form: 'Conditional multi-stage form', search: 'Async search', shadow: 'Shadow DOM', htmlDrag: 'HTML drag', pointerDrag: 'Pointer drag', frame: 'Nested frame', media: 'Actual media playback', devices: 'Virtual streams (optional)' };
  const results = Object.fromEntries(Object.keys(stages).map(key => [key, false]));
  const notes = {}; let name = '', searchVersion = 0, currentStream, timer, videoStream;
  const mark = (key, passed, note = '') => {
    results[key] = !!passed; notes[key] = note; $('results').replaceChildren();
    for (const [id, label] of Object.entries(stages)) { const row = document.createElement('li'); row.dataset.pass = String(results[id]); row.textContent = `${results[id] ? '✓' : '○'} ${label}${notes[id] ? ' · ' + notes[id] : ''}`; $('results').append(row); }
    $('score').textContent = `${Object.values(results).filter(Boolean).length}/${Object.keys(results).length}`;
  };
  window.complexFixture = { results, report: () => ({ fixture: 'complex-v1', generatedAt: new Date().toISOString(), results: { ...results }, notes: { ...notes }, optional: ['devices'], capabilities: { mediaDevices: !!navigator.mediaDevices, canvasStream: !!$('lab-canvas').captureStream } }) };
  mark('controlled', false);
  const renderName = () => {
    const label = document.createElement('label'); label.textContent = 'Имя / Name';
    const previous = $('lab-name'), focused = previous && document.activeElement === previous; const position = previous?.selectionStart;
    const input = document.createElement('input'); input.id = 'lab-name'; input.value = name;
    input.addEventListener('input', () => { name = input.value; mark('controlled', name === 'Bridge Test'); renderName(); });
    label.append(input); $('controlled-host').replaceChildren(label); if (focused) { input.focus(); if (position !== null && position !== undefined) input.setSelectionRange(position, position); }
  };
  renderName();
  $('lab-plan').addEventListener('change', () => { $('pro-settings').hidden = $('lab-plan').value !== 'pro'; $('final-step').hidden = true; mark('form', false); });
  $('validate-form').onclick = () => {
    const valid = name === 'Bridge Test' && $('lab-email').value === 'test@example.invalid' && $('lab-email').checkValidity() && $('lab-plan').value === 'pro' && $('lab-agree').checked;
    $('form-status').textContent = valid ? 'Validated' : 'Check name, email, Pro and confirmation'; $('final-step').hidden = !valid; mark('form', false);
  };
  $('finish-form').onclick = () => { const valid = !$('final-step').hidden && $('lab-code').value === 'BRIDGE-OK'; mark('form', valid); $('form-status').textContent = valid ? 'Completed' : 'Incorrect confirmation'; };
  $('lab-search').addEventListener('input', () => {
    const version = ++searchVersion, query = $('lab-search').value; $('search-results').textContent = 'Loading…'; mark('search', false);
    setTimeout(() => { if (version !== searchVersion) return; $('search-results').replaceChildren(); if (query.trim().toLowerCase() !== 'bridge') { $('search-results').textContent = 'No results'; return; }
      const button = document.createElement('button'); button.id = 'lab-search-result'; button.textContent = 'Browser Bridge result'; button.onclick = () => { mark('search', true); $('search-results').textContent = 'Selected: Browser Bridge'; }; $('search-results').append(button);
    }, 350);
  });
  const shadow = $('lab-shadow-host').attachShadow({ mode: 'open' });
  const shadowLabel = document.createElement('label'); shadowLabel.textContent = 'Shadow field'; const shadowInput = document.createElement('input'); shadowInput.id = 'lab-shadow-input';
  shadowInput.addEventListener('input', () => { const valid = shadowInput.value === 'shadow-ok'; mark('shadow', valid); $('shadow-status').textContent = valid ? 'Shadow accepted' : 'Waiting'; }); shadowLabel.append(shadowInput); shadow.append(shadowLabel);
  $('lab-source').addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', 'bridge-card'); });
  $('lab-drop').addEventListener('dragover', event => event.preventDefault());
  $('lab-drop').addEventListener('drop', event => { event.preventDefault(); const valid = event.dataTransfer.getData('text/plain') === 'bridge-card'; mark('htmlDrag', valid); $('drop-status').textContent = valid ? 'Dropped' : 'Wrong payload'; });
  let dragging = false;
  $('lab-handle').addEventListener('pointerdown', event => { dragging = true; if (event.isTrusted) try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} });
  document.addEventListener('pointermove', event => { if (!dragging) return; const track = $('pointer-track').getBoundingClientRect(); const x = Math.max(8, Math.min(track.width - 56, event.clientX - track.left - 24)); $('lab-handle').style.left = `${x}px`; });
  document.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; const a = $('lab-handle').getBoundingClientRect(), b = $('pointer-target').getBoundingClientRect(); const valid = a.right >= b.left; mark('pointerDrag', valid); $('pointer-status').textContent = valid ? 'Moved' : 'Move farther right'; });
  document.addEventListener('pointercancel', () => { dragging = false; });
  window.addEventListener('message', event => { if (event.source === document.querySelector('iframe').contentWindow && event.origin === location.origin && event.data?.type === 'bridge-frame-result') { mark('frame', event.data.passed === true); $('frame-status').textContent = event.data.passed ? 'Frame accepted' : 'Waiting'; } });
  const canvas = $('lab-canvas'), context = canvas.getContext('2d');
  if (canvas.captureStream) {
    const draw = () => { context.fillStyle = '#10131d'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#82e5ce'; context.fillRect((Date.now() / 20) % 420, 100, 40, 40); context.fillStyle = '#edf0ff'; context.font = '18px monospace'; context.fillText(`Real canvas frame ${Date.now()}`, 12, 32); };
    draw(); timer = setInterval(draw, 40); videoStream = canvas.captureStream(25); $('lab-video').srcObject = videoStream;
    $('lab-video').addEventListener('timeupdate', () => { if (!$('lab-video').paused && $('lab-video').currentTime > 0) mark('media', true, 'Video clock advanced'); });
  }
  const sampleRate = 8000, sampleCount = sampleRate; const wav = new ArrayBuffer(44 + sampleCount * 2), view = new DataView(wav);
  const chars = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  chars(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); chars(8, 'WAVE'); chars(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); chars(36, 'data'); view.setUint32(40, sampleCount * 2, true);
  for (let i = 0; i < sampleCount; i++) view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * 440 * i / sampleRate) * 1000, true);
  const audioURL = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); $('lab-audio').src = audioURL; $('lab-audio').loop = true;
  $('start-media').onclick = async () => { const playback = await Promise.allSettled([$('lab-video').play(), $('lab-audio').play()]); $('media-status').textContent = playback.every(item => item.status === 'fulfilled') ? 'Playback started' : 'Autoplay/stream unavailable: click real media controls'; };
  $('request-devices').onclick = async () => {
    try { const devices = await navigator.mediaDevices.enumerateDevices();
      if (!['codex-virtual-audio', 'codex-virtual-video'].every(id => devices.some(device => device.deviceId === id))) throw new Error('Configure extension virtual audio and video first; physical hardware is not requested by this test');
      currentStream?.getTracks().forEach(track => track.stop()); currentStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: 'codex-virtual-audio' } }, video: { deviceId: { exact: 'codex-virtual-video' } } }); $('virtual-preview').srcObject = currentStream; await $('virtual-preview').play(); const tracks = currentStream.getTracks(); const valid = tracks.some(t => t.kind === 'audio' && t.readyState === 'live') && tracks.some(t => t.kind === 'video' && t.readyState === 'live'); mark('devices', valid, 'Tracks received; physical/virtual identity must be verified separately'); $('device-status').textContent = valid ? 'Audio + video streams live' : 'Incomplete tracks'; }
    catch (error) { mark('devices', false, error.name); $('device-status').textContent = error.message; }
  };
  $('stop-devices').onclick = () => { currentStream?.getTracks().forEach(track => track.stop()); currentStream = null; $('virtual-preview').srcObject = null; $('device-status').textContent = 'Stopped'; };
  $('capabilities').textContent = `Secure context: ${isSecureContext}; canvas stream: ${!!canvas.captureStream}; media devices: ${!!navigator.mediaDevices}`;
  $('copy-task').onclick = async () => { try { await navigator.clipboard.writeText('Пройди обязательные этапы Complex Lab: Bridge Test, test@example.invalid, Pro, подтверждение, код BRIDGE-OK; поиск bridge и выбор результата; Shadow DOM shadow-ok; оба перетаскивания; iframe frame-ok; проверь видео и анимацию. После изменений обновляй snapshot. Не подделывай результаты и не вызывай обработчики вместо действий. Виртуальные устройства — отдельный необязательный этап, только после моего включения и разрешения. Сверь реальные результаты страницы и сообщи PASS/FAIL/UNSUPPORTED по каждому этапу.'); $('copy-task').textContent = 'Copied'; } catch { $('copy-task').textContent = 'Clipboard unavailable'; } };
  $('export-report').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(window.complexFixture.report(), null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'bridge-complex-report.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  $('reset').onclick = () => location.reload();
  window.addEventListener('pagehide', () => { clearInterval(timer); videoStream?.getTracks().forEach(track => track.stop()); currentStream?.getTracks().forEach(track => track.stop()); URL.revokeObjectURL(audioURL); }, { once: true });
})();
