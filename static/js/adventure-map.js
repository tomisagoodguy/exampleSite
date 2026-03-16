/* ═══════════════════════════════════════════════════════════════
   adventure-map.js — 破關地圖互動邏輯 (UI Pro Max Edition)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

var CATEGORY_CONFIG = {
  food:    { color: '#C47B5A', fade: 'rgba(196, 123, 90, 0.3)', label: '美食', placeholder: '/images/placeholders/food.png' },
  scenery: { color: '#81B29A', fade: 'rgba(129, 178, 154, 0.3)', label: '風景', placeholder: '/images/placeholders/scenery.png' },
  oldshop: { color: '#D4A853', fade: 'rgba(212, 168, 83, 0.3)', label: '老店', placeholder: '/images/placeholders/oldshop.png' },
  walk:    { color: '#7B8CDE', fade: 'rgba(123, 140, 222, 0.3)', label: '散步', placeholder: '/images/placeholders/walk.png' },
  cafe:    { color: '#A67B5B', fade: 'rgba(166, 123, 91, 0.3)', label: '咖啡', placeholder: '/images/placeholders/cafe.png' },
  shop:    { color: '#E07A5F', fade: 'rgba(224, 122, 95, 0.3)', label: '購物', placeholder: '/images/placeholders/shop.png' },
  stay:    { color: '#3D5A80', fade: 'rgba(61, 90, 128, 0.3)', label: '住宿', placeholder: '/images/placeholders/stay.png' },
  quest:   { color: '#9B72AA', fade: 'rgba(155, 114, 170, 0.3)', label: '破關任務', placeholder: '/images/placeholders/quest.png' },
};

var map = null;
var clusterGroup = null;
var currentCat = 'all';
var currentSeason = 'all';
var lastFilteredPlaces = [];

/* ─── Init Map ─── */
function initAdventureMap() {
  if (!document.getElementById('adventure-map')) return;

  map = L.map('adventure-map', {
    center: [25.05, 121.55],
    zoom: 12,
    zoomControl: false, // 隱藏預設，我們會放更美的按鈕
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO'
  }).addTo(map);
  
  // 自訂縮放按鈕
  L.control.zoom({ position: 'topleft' }).addTo(map);

  renderMarkers(PLACES_DATA);
  updateStats(PLACES_DATA);
  renderSidebarList(PLACES_DATA);
  setupFilters();

  if (PLACES_DATA.length > 0) {
    var latlngs = PLACES_DATA.map(p => [p.lat, p.lng]);
    map.fitBounds(latlngs, { padding: [50, 50], maxZoom: 13 });
  }
}

/* ─── Helper: Stars ─── */
function getStars(rating) {
  var full = Math.floor(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/* ─── Sidebar & Markers ─── */
function renderMarkers(places) {
  if (clusterGroup) map.removeLayer(clusterGroup);
  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    iconCreateFunction: function(cluster) {
      return L.divIcon({ 
        html: `<div class="adv-cluster"><span>${cluster.getChildCount()}</span></div>`, 
        className: '', 
        iconSize: [40, 40] 
      });
    }
  });

  places.forEach(p => {
    var marker = L.marker([p.lat, p.lng], { icon: createIcon(p) });
    marker.on('click', (e) => { 
      L.DomEvent.stopPropagation(e);
      focusPlace(p.id); 
    });
    clusterGroup.addLayer(marker);
  });
  map.addLayer(clusterGroup);
}

function renderSidebarList(places) {
  var detailEl = document.getElementById('sidebar-detail');
  var defaultEl = document.getElementById('sidebar-default');
  if (!detailEl) return;

  if (places.length === 0) {
    if (defaultEl) defaultEl.style.display = 'flex';
    detailEl.style.display = 'none';
    return;
  }

  if (defaultEl) defaultEl.style.display = 'none';
  detailEl.style.display = 'block';

  var listHTML = places.map(p => {
    var config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.food;
    var photo = (p.photos && p.photos.length > 0) ? p.photos[0] : config.placeholder;
    
    return `
      <div class="adv-list-item" 
           onclick="focusPlace(${p.id})" 
           style="--cat-color: ${config.color}; --cat-color-fade: ${config.fade};">
        <div class="adv-list-img-box">
          <div class="adv-list-img" style="background-image:url('${photo}')"></div>
        </div>
        <div class="adv-list-content">
          <div class="adv-list-tag" style="background:${config.color}">${config.label}</div>
          <div class="adv-list-name">${p.name}</div>
          <div class="adv-list-stars">${getStars(p.rating)}</div>
          <div class="adv-list-meta">
            <span class="adv-list-status ${p.status}">
              ${p.status==='done' ? '✓ 已破關' : '📍 待解鎖'}
            </span>
            <span style="font-size: 0.6rem; opacity: 0.4;">VIEW DETAILS ›</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  detailEl.innerHTML = `
    <div class="adv-list-container">
      <div class="adv-list-header">
        <span>COLLECTION (${places.length})</span>
      </div>
      <div class="adv-list-body">${listHTML}</div>
    </div>
  `;
}

function focusPlace(id) {
  var target = PLACES_DATA.find(p => p.id === id);
  if (target) {
    map.flyTo([target.lat, target.lng], 16, { duration: 1.5 });
    showSidebarDetail(target);
  }
}

function showSidebarDetail(place) {
  var detailEl = document.getElementById('sidebar-detail');
  var config = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.food;
  var photo = (place.photos && place.photos.length > 0) ? place.photos[0] : config.placeholder;
  
  detailEl.innerHTML = `
    <div class="adv-sidebar__detail">
      <div class="sdl-photo-hero" style="background-image: url('${photo}')">
        <div class="sdl-hero-overlay"></div>
        <button class="sdl-close-btn" onclick="renderSidebarList(lastFilteredPlaces || PLACES_DATA)">✕</button>
      </div>
      
      <div class="sdl-header" style="background: linear-gradient(to bottom, ${config.fade}, transparent);">
        <span class="sdl-category-badge" style="background:${config.color}; color:#fff;">${config.label}</span>
        <h3 class="sdl-place-name">${place.name}</h3>
        <div class="sdl-rating">${getStars(place.rating)}</div>
      </div>

      <div class="sdl-body">
        ${place.description ? `
        <div class="sdl-section">
          <div class="sdl-label">關於這裡</div>
          <p class="sdl-description">${place.description}</p>
        </div>
        ` : ''}

        ${place.trivia ? `
        <div class="sdl-section sdl-trivia-box">
          <div class="sdl-label">💡 深度筆記 / 冷知識</div>
          <p class="sdl-trivia-text">${place.trivia}</p>
        </div>
        ` : ''}

        <div class="sdl-info-block">
          <div class="sdl-info-label">地址</div>
          <p class="sdl-info-text">${place.address || '秘密地點，目前保密中。'}</p>
        </div>
        
        <div class="sdl-footer">
          <button class="sdl-nav-btn" onclick="window.open('https://www.google.com/maps?q=${place.lat},${place.lng}')">
             GOOGLE MAPS 導航
          </button>
        </div>
      </div>
    </div>
  `;
}


function createIcon(p) {
  var color = CATEGORY_CONFIG[p.category].color;
  return L.divIcon({
    html: `<div class="adv-marker" style="background:${color}; box-shadow: 0 0 15px ${CATEGORY_CONFIG[p.category].fade};"></div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function updateStats(places) {
  var total = PLACES_DATA.length;
  var done = PLACES_DATA.filter(p => p.status==='done').length;
  var elTotal = document.getElementById('total-count');
  var elDone = document.getElementById('done-count');
  if (elTotal) elTotal.textContent = total;
  if (elDone) elDone.textContent = done;
}

function setupFilters() {
  document.querySelectorAll('.adv-filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.adv-filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentCat = this.dataset.cat;
      applyFilters();
    });
  });
  document.querySelectorAll('.adv-season-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.adv-season-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentSeason = this.dataset.season;
      applyFilters();
    });
  });
}

function applyFilters() {
  var filtered = PLACES_DATA.filter(p => {
    var mc = currentCat === 'all' || p.category === currentCat;
    var ms = currentSeason === 'all' || (p.seasons && p.seasons.includes(currentSeason));
    return mc && ms;
  });
  lastFilteredPlaces = filtered;
  renderMarkers(filtered);
  renderSidebarList(filtered);
}

document.addEventListener('DOMContentLoaded', initAdventureMap);
