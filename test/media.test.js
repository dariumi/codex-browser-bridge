import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaPageCommand } from '../extension/media-page.js';
import { DeviceBridge } from '../extension/native-devices.js';

test('media inspection returns actual playback/captions and missing media never reports a frame', async t => {
  const el = { tagName: 'VIDEO', currentTime: 12, duration: 60, paused: false, ended: false, muted: false, playbackRate: 1, readyState: 3, videoWidth: 640, videoHeight: 360, textTracks: [{language:'en',label:'Captions',mode:'showing',activeCues:[{text:'Actual cue'}]}] };
  globalThis.document = { querySelectorAll: () => [el], getAnimations: () => [{playState:'running',currentTime:240,playbackRate:1}] }; t.after(() => { delete globalThis.document; });
  const inspected = await mediaPageCommand('inspect'); assert.equal(inspected.value.media[0].time, 12); assert.equal(inspected.value.media[0].captions[0].active, 'Actual cue'); assert.equal(inspected.value.animations[0].currentTime, 240);
  assert.match((await mediaPageCommand('seek', {time:1000})).error, /Invalid/); assert.equal(el.currentTime,12);
  assert.match((await mediaPageCommand('record_audio')).error, /unavailable/);
  el.videoWidth=0; assert.match((await mediaPageCommand('frame')).error, /not available/);
});
test('native device consent gates feeds and disconnect rejects pending work', async () => {
  let enabled=false, connected=0, approved=0, disconnected=0; const callbacks={};
  const api={ storage:{local:{get:async()=>({nativeDevicesEnabled:enabled})}}, runtime:{connectNative:()=>{connected++;return {onMessage:{addListener:fn=>callbacks.message=fn},onDisconnect:{addListener:fn=>callbacks.disconnect=fn},postMessage:()=>{},disconnect:()=>{disconnected++;callbacks.disconnect();}};}} };
  const bridge=new DeviceBridge(api,{ensure:async()=>{approved++;}});
  await assert.rejects(bridge.run({action:'audio'}, {url:'https://example.invalid'}), /Enable/); assert.equal(connected,0);
  enabled=true; const pending=bridge.run({action:'audio'}, {url:'https://example.invalid'}); const rejection=assert.rejects(pending,/disconnected/);
  await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(approved,1); bridge.disconnect(); await rejection; assert.equal(disconnected,1);
});
