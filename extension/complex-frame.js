document.getElementById('lab-frame-input').addEventListener('input', event => {
  const passed = event.target.value === 'frame-ok'; document.getElementById('frame-result').textContent = passed ? 'Frame accepted' : 'Waiting';
  parent.postMessage({ type: 'bridge-frame-result', passed }, location.origin);
});
