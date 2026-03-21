import { state, toggleSeason } from './state';
import { initMap, setCoord } from './map';
import { doSearch, locateMe } from './geocoder';
import { updateRateUI } from './ui';
import { tryRestoreHandles } from './persist';
import { addPhotos, removePhoto } from './photo';
import { pickFile, pickImgDir, generateAndWrite, deletePlace } from './file-store';
import {
  switchMode, loadPlacesForMgmt, renderMgmtList, loadForEdit,
  addVisitToCurrent, delVisit,
} from './mgmt';

document.addEventListener('DOMContentLoaded', () => {
  initMap('picker-map', (lat, lng) => {
    setCoord(lat, lng, false);
  });

  setupEventListeners();
  tryRestoreHandles();

  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const addedInput = document.getElementById('f-added') as HTMLInputElement;
  if (addedInput) addedInput.value = `${d.getFullYear()}-${m}`;
});

function setupEventListeners(): void {
  document.querySelectorAll('.rate-btn').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', (e) => {
      const el = e.currentTarget as HTMLElement;
      state.selRate = parseInt(el.getAttribute('data-v') || '0');
      updateRateUI(state.selRate);
    });
  });

  document.querySelectorAll('.season-btn').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', (e) => {
      const s = (e.currentTarget as HTMLElement).getAttribute('data-v');
      if (s) toggleSeason(s);
    });
  });

  document.querySelectorAll('.cat-btn').forEach((b) => {
    (b as HTMLElement).addEventListener('click', (e) => {
      document.querySelectorAll('.cat-btn').forEach((x) => (x as HTMLElement).classList.remove('on'));
      const el = e.currentTarget as HTMLElement;
      el.classList.add('on');
      state.selCat = el.getAttribute('data-c') || 'food';
    });
  });

  document.querySelectorAll('.st-btn').forEach((b) => {
    (b as HTMLElement).addEventListener('click', (e) => {
      document.querySelectorAll('.st-btn').forEach((x) => (x as HTMLElement).classList.remove('on'));
      const el = e.currentTarget as HTMLElement;
      el.classList.add('on');
      state.selSt = (el.getAttribute('data-s') as 'pending' | 'done') || 'pending';
      document.getElementById('done-extra')?.classList.toggle('show', state.selSt === 'done');
    });
  });

  document.getElementById('s-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
  });

  bindWindowGlobals();
}

// (window as any) is intentional — inline HTML onclick handlers require global binding; no native TS DOM type for FS API
/* eslint-disable @typescript-eslint/no-explicit-any */
function bindWindowGlobals(): void {
  const w = window as any;
  w.locateMe = locateMe;       w.doSearch = doSearch;
  w.pickFile = pickFile;       w.pickImgDir = pickImgDir;
  w.addPhotos = addPhotos;     w.generateAndWrite = generateAndWrite;
  w.switchMode = switchMode;   w.loadPlacesForMgmt = loadPlacesForMgmt;
  w.renderMgmtList = renderMgmtList; w.loadForEdit = loadForEdit;
  w.deletePlace = deletePlace; w.addVisitToCurrent = addVisitToCurrent;
  w.delVisit = delVisit;       w.removePhoto = removePhoto;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
