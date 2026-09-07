import { Globe, latLngToVec3 } from '../src/globe.js';
import { loadCountries } from '../src/geo.js';
const status = document.querySelector('#status');
const globe = new Globe(document.querySelector('#globe'));
await globe.init(await loadCountries('/data/countries-50m.geojson'));
globe.setAutoRotate(false); globe.setGameplayActive(true); globe.setRealisticLighting(false);
globe.camera.position.copy(latLngToVec3(46.6, 9.5, 1.7));
globe.camera.lookAt(0, 0, 0); globe._targetD = 1.7;
let zoomTimer;
let lastMesh = null, gestureUpdates = 0;
document.querySelector('#near').onclick = () => {
  clearInterval(zoomTimer);
  globe.tileDetail.gestureStart();
  zoomTimer = setInterval(() => {
    globe._zoomAltBy(0.9);
    if (globe._targetD <= globe.controls.minDistance + 0.0001) {
      clearInterval(zoomTimer); globe.tileDetail.gestureEnd();
    }
  }, 180);
};
document.querySelector('#far').onclick = () => {
  clearInterval(zoomTimer); globe.tileDetail.gestureEnd(); globe._setTargetD(1.7);
};
document.querySelector('#cancel').onclick = () => globe.tileDetail.cancel();
document.querySelectorAll('button').forEach((button) => { button.disabled = false; });
setInterval(() => {
  const detail = globe.tileDetail;
  if (detail.mesh !== lastMesh) {
    if (detail.gestureActive && detail.mesh) gestureUpdates++;
    lastMesh = detail.mesh;
  }
  status.textContent = JSON.stringify({distance:+globe.camera.position.length().toFixed(3),
    enabled:detail.enabled, gesture:detail.gestureActive, building:detail.building,
    gestureUpdates,
    patches:detail.meshCount(), patchWidth:detail.debugInfo().patchWidth,
    canvases:detail.canvasPool.filter((item) => item.owned).length,
    timings:detail.timings, failure:detail.lastFailure}, null, 2);
}, 500);
