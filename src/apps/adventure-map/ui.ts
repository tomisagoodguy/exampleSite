import { PlaceEntry } from '../../shared/types';
import { CATEGORY_CONFIG, calculateStats } from './data';

export function getStars(rating: number = 0): string {
  const full = Math.floor(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export function updateStatsUI(places: PlaceEntry[], allPlaces: PlaceEntry[]) {
  const { total, done, percent } = calculateStats(allPlaces);
  
  const elTotal = document.getElementById('total-count');
  const elDone = document.getElementById('done-count');
  const elBar = document.getElementById('progress-bar');
  const elLabel = document.getElementById('progress-label');

  if (elTotal) elTotal.textContent = total.toString();
  if (elDone) elDone.textContent = done.toString();
  if (elBar) elBar.style.width = `${percent}%`;
  if (elLabel) elLabel.textContent = `${percent}% 解鎖`;
}

export function renderSidebarList(
  places: PlaceEntry[], 
  onPlaceClick: (id: number) => void
) {
  const detailEl = document.getElementById('sidebar-detail');
  const defaultEl = document.getElementById('sidebar-default');
  if (!detailEl) return;

  if (places.length === 0) {
    if (defaultEl) defaultEl.style.display = 'flex';
    detailEl.style.display = 'none';
    return;
  }

  if (defaultEl) defaultEl.style.display = 'none';
  detailEl.style.display = 'block';

  const listHTML = places.map(p => {
    const config = CATEGORY_CONFIG[p.category] || CATEGORY_CONFIG.food;
    const photo = (p.photos && p.photos.length > 0) ? p.photos[0] : config.placeholder;
    
    return `
      <div class="adv-list-item" 
           data-id="${p.id}"
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
              ${p.status === 'done' ? '✓ 已破關' : '📍 待解鎖'}
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

  // Add event listeners
  detailEl.querySelectorAll('.adv-list-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = parseInt(item.getAttribute('data-id') || '0');
      onPlaceClick(id);
    });
  });
}

export function showSidebarDetail(
  place: PlaceEntry, 
  onBack: () => void
) {
  const detailEl = document.getElementById('sidebar-detail');
  if (!detailEl) return;

  const config = CATEGORY_CONFIG[place.category] || CATEGORY_CONFIG.food;
  const photo = (place.photos && place.photos.length > 0) ? place.photos[0] : config.placeholder;
  
  detailEl.innerHTML = `
    <div class="adv-sidebar__detail">
      <div class="sdl-photo-hero" style="background-image: url('${photo}')">
        <div class="sdl-hero-overlay"></div>
        <button class="sdl-close-btn" id="sdl-close-btn">✕</button>
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

  document.getElementById('sdl-close-btn')?.addEventListener('click', onBack);
}
