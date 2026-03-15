/* ═══════════════════════════════════════════════════════════════
   adventure-map.js — 破關地圖互動邏輯
   依賴: Leaflet 1.9.4（由 list.html template 載入）
         PLACES_DATA（由 Hugo data template 注入）
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Category Config ─── */
var CATEGORY_CONFIG = {
  food:    { color: '#C47B5A', label: '美食',    textColor: '#fff' },
  scenery: { color: '#81B29A', label: '風景',    textColor: '#fff' },
  oldshop: { color: '#D4A853', label: '老店',    textColor: '#fff' },
  walk:    { color: '#7B8CDE', label: '散步',    textColor: '#fff' },
  cafe:    { color: '#A67B5B', label: '咖啡',    textColor: '#fff' },
  shop:    { color: '#E07A5F', label: '購物',    textColor: '#fff' },
  stay:    { color: '#3D5A80', label: '住宿',    textColor: '#fff' },
  quest:   { color: '#9B72AA', label: '破關任務', textColor: '#fff' },
};

/* ─── State ─── */
var map = null;
var allMarkers = [];   // [{ marker: L.Marker, place: Object }]
var activeMarkerEl = null;
var clusterGroup = null;  // L.markerClusterGroup

/* ─── SVG Icons ─── */
var SVG_CHECK = [
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"',
  ' stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">',
  '<polyline points="20 6 9 17 4 12"></polyline></svg>'
].join('');

var SVG_LOCK = [
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"',
  ' stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
  '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>',
  '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
].join('');

var SVG_NAV = [
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"',
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
  '<polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>'
].join('');

var SVG_CLOSE = [
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none"',
  ' stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
  '<line x1="18" y1="6" x2="6" y2="18"></line>',
  '<line x1="6" y1="6" x2="18" y2="18"></line></svg>'
].join('');

/* ─── Create Leaflet DivIcon ─── */
function createIcon(place) {
  var config = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.food;
  var isDone = (place.status === 'done');
  var pulseRing = isDone
    ? '<div class="adv-marker--done" style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ' + config.color + ';animation:marker-pulse 2.5s ease-out infinite;pointer-events:none;"></div>'
    : '';

  var html = [
    '<div class="adv-marker ' + (isDone ? 'adv-marker--done' : 'adv-marker--pending') + '"',
    ' style="background-color:' + config.color + ';position:relative;">',
    isDone ? SVG_CHECK : SVG_LOCK,
    pulseRing,
    '</div>'
  ].join('');

  return L.divIcon({
    html: html,
    className: '',
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
  });
}

/* ─── Render Markers ─── */
function renderMarkers(places) {
  // 移除舊 cluster
  if (clusterGroup) map.removeLayer(clusterGroup);
  allMarkers = [];
  activeMarkerEl = null;

  // 建立新的 cluster group
  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    maxClusterRadius: 48,
    iconCreateFunction: function(cluster) {
      var count = cluster.getChildCount();
      return L.divIcon({
        html: '<div class="adv-cluster"><span>' + count + '</span></div>',
        className: '',
        iconSize: [42, 42],
      });
    }
  });

  places.forEach(function(place) {
    var marker = L.marker([place.lat, place.lng], {
      icon: createIcon(place),
      riseOnHover: true,
    });

    marker.on('click', function(e) {
      if (activeMarkerEl) {
        activeMarkerEl.classList.remove('adv-marker--active');
      }
      var el = e.target.getElement();
      if (el) {
        var inner = el.querySelector('.adv-marker');
        if (inner) {
          inner.classList.add('adv-marker--active');
          activeMarkerEl = inner;
        }
      }
      showSidebar(place);
      // 更新 URL （不重載頁面）
      history.replaceState(null, '', '?place=' + place.id);
    });

    clusterGroup.addLayer(marker);
    allMarkers.push({ marker: marker, place: place });
  });

  map.addLayer(clusterGroup);
}

/* ─── Show Sidebar Detail ─── */
function showSidebar(place) {
  var config = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.food;
  var isDone = (place.status === 'done');
  var defaultEl = document.getElementById('sidebar-default');
  var detailEl  = document.getElementById('sidebar-detail');

  if (defaultEl) defaultEl.style.display = 'none';
  if (!detailEl)  return;

  detailEl.style.display = 'block';

  /* Build done note block */
  var doneNoteHTML = '';
  if (isDone && place.done_note) {
    doneNoteHTML = [
      '<div class="sdl-done-note">',
      '  <div class="sdl-info-label">破關紀錄' + (place.done_date ? ' · ' + place.done_date : '') + '</div>',
      '  <p class="sdl-info-text">' + place.done_note + '</p>',
      '</div>'
    ].join('');
  }

  /* Build best_time block */
  var timeHTML = '';
  if (place.best_time) {
    timeHTML = [
      '<div class="sdl-info-block">',
      '  <div class="sdl-info-label">最佳時機</div>',
      '  <p class="sdl-info-text">' + place.best_time + '</p>',
      '</div>'
    ].join('');
  }

  /* Build photos block */
  var photosHTML = '';
  if (place.photos && place.photos.length > 0) {
    var thumbs = place.photos.map(function(src, i) {
      return '<img class="sdl-photo-thumb" src="/' + src + '" '
        + 'onclick="openLightbox(this.src)" '
        + 'onerror="this.style.display=\'none\'" '
        + 'loading="lazy" alt="照片 ' + (i+1) + '">';
    }).join('');
    photosHTML = '<div class="sdl-photos"><div class="sdl-photos-strip">' + thumbs + '</div></div>';
  }

  detailEl.innerHTML = [
    /* Header */
    '<div class="sdl-header" style="border-left: 4px solid ' + config.color + '; padding-left: 20px;">',
    '  <button class="sdl-close-btn" onclick="closeSidebar()" title="關閉">' + SVG_CLOSE + '</button>',
    '  <span class="sdl-category-badge" style="background:' + config.color + '22; color:' + config.color + '">',
    '    ' + config.label,
    '  </span>',
    '  <h3 class="sdl-place-name">' + place.name + '</h3>',
    '  <span class="sdl-status ' + (isDone ? 'sdl-status--done' : 'sdl-status--pending') + '">',
    '    ' + (isDone ? SVG_CHECK + ' 已破關' : SVG_LOCK + ' 待解鎖'),
    '  </span>',
    '</div>',

    /* Photos */
    photosHTML,

    /* Body */
    '<div class="sdl-body">',
    place.description ? '  <p class="sdl-description">' + place.description + '</p>' : '',
    place.why ? ['  <div class="sdl-info-block">',
    '    <div class="sdl-info-label">為什麼值得去</div>',
    '    <p class="sdl-info-text">' + place.why + '</p>',
    '  </div>'].join('') : '',
    timeHTML,
    doneNoteHTML,
    '</div>',

    /* Footer */
    '<div class="sdl-footer">',
    '  <button class="sdl-nav-btn" onclick="openInMaps(' + place.lat + ',' + place.lng + ')">',
    '    ' + SVG_NAV + ' Google Maps 導航',
    '  </button>',
    '  <button class="sdl-nav-btn sdl-share-btn" onclick="sharePlace(' + place.id + ')" title="複製分享連結">',
    '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    '    分享',
    '  </button>',
    '</div>',
  ].join('');
}

/* ─── Close Sidebar ─── */
function closeSidebar() {
  var defaultEl = document.getElementById('sidebar-default');
  var detailEl  = document.getElementById('sidebar-detail');
  if (defaultEl) defaultEl.style.display = '';
  if (detailEl)  detailEl.style.display  = 'none';
  if (activeMarkerEl) {
    activeMarkerEl.classList.remove('adv-marker--active');
    activeMarkerEl = null;
  }
}

/* ─── Open in Google Maps ─── */
function openInMaps(lat, lng) {
  window.open('https://www.google.com/maps?q=' + lat + ',' + lng, '_blank', 'noopener');
}

/* ─── Lightbox ─── */
function openLightbox(src) {
  var lb = document.getElementById('adv-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'adv-lightbox';
    lb.innerHTML = '<div class="lb-backdrop" onclick="closeLightbox()"></div>'
      + '<img class="lb-img" alt="">'
      + '<button class="lb-close" onclick="closeLightbox()">&#10005;</button>';
    document.body.appendChild(lb);
  }
  lb.querySelector('.lb-img').src = src;
  lb.classList.add('show');
  document.addEventListener('keydown', _lbKey);
}

function closeLightbox() {
  var lb = document.getElementById('adv-lightbox');
  if (lb) lb.classList.remove('show');
  document.removeEventListener('keydown', _lbKey);
}

function _lbKey(e) { if (e.key === 'Escape') closeLightbox(); }

/* ─── Update Stats + Progress Bar ─── */
function updateStats(places) {
  var total = PLACES_DATA.length;            // 總數永遠顯示全量
  var done  = PLACES_DATA.filter(function(p) { return p.status === 'done'; }).length;
  var pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  var totalEl    = document.getElementById('total-count');
  var doneEl     = document.getElementById('done-count');
  var barEl      = document.getElementById('progress-bar');
  var labelEl    = document.getElementById('progress-label');

  if (totalEl) totalEl.textContent = total;
  if (doneEl)  doneEl.textContent  = done;
  if (labelEl) labelEl.textContent = pct + '% 解鎖';

  if (barEl) {
    // Delay for entrance animation
    setTimeout(function() { barEl.style.width = pct + '%'; }, 300);
  }
}

/* ─── Filter Buttons ─── */
function setupFilters() {
  var btns = document.querySelectorAll('.adv-filter-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      btns.forEach(function(b) { b.classList.remove('active', 'adv-filter-btn--active'); });
      btn.classList.add('active');

      var cat = btn.getAttribute('data-cat');
      var filtered = (cat === 'all')
        ? PLACES_DATA
        : PLACES_DATA.filter(function(p) { return p.category === cat; });

      renderMarkers(filtered);

      // Auto-fit map to filtered markers
      if (filtered.length > 0) {
        var latlngs = filtered.map(function(p) { return [p.lat, p.lng]; });
        map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 14 });
      }

      closeSidebar();
    });
  });
}

/* ─── Init Map ─── */
function initAdventureMap() {
  if (!document.getElementById('adventure-map')) return;
  if (typeof PLACES_DATA === 'undefined' || !Array.isArray(PLACES_DATA)) return;

  /* Detect dark mode for tile style */
  var isDark = document.body.classList.contains('dark-mode');

  map = L.map('adventure-map', {
    center:          [25.05, 121.55],
    zoom:            12,
    zoomControl:     true,
    scrollWheelZoom: true,
    minZoom:         9,
    maxZoom:         18,
  });

  /* CartoDB Voyager — warm, readable, diary-like */
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains:  'abcd',
      maxZoom:     19,
    }
  ).addTo(map);

  renderMarkers(PLACES_DATA);
  updateStats(PLACES_DATA);
  setupFilters();

  /* Fit all markers on load */
  if (PLACES_DATA.length > 0) {
    var latlngs = PLACES_DATA.map(function(p) { return [p.lat, p.lng]; });
    map.fitBounds(latlngs, { padding: [40, 60], maxZoom: 13 });
  }

  /* 螣魚 URL ?place=id 自動開側邊欄 */
  var params   = new URLSearchParams(window.location.search);
  var placeId  = params.get('place');
  if (placeId) {
    var target = PLACES_DATA.find(function(p) { return String(p.id) === placeId; });
    if (target) {
      setTimeout(function() {
        map.setView([target.lat, target.lng], 15);
        showSidebar(target);
      }, 400);
    }
  }
}

/* ─── Boot ─── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdventureMap);
} else {
  initAdventureMap();
}

/* ─── Share Place ─── */
function sharePlace(id) {
  var url = window.location.origin + window.location.pathname + '?place=' + id;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(function() {
      /* 暫時更改按鈕文字 */
      var btns = document.querySelectorAll('.sdl-share-btn');
      btns.forEach(function(b) { b.textContent = '✓ 已複製！'; });
      setTimeout(function() {
        btns.forEach(function(b) { b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> 分享'; });
      }, 2000);
    });
  } else {
    prompt('複製此連結：', url);
  }
}
