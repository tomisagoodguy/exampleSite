import"../assets/modulepreload-polyfill-BnkOoLKg.js";import e from"leaflet";import"leaflet.markercluster";var t={food:{color:`#C47B5A`,fade:`rgba(196, 123, 90, 0.3)`,label:`美食`,placeholder:`/images/placeholders/food.png`},scenery:{color:`#81B29A`,fade:`rgba(129, 178, 154, 0.3)`,label:`風景`,placeholder:`/images/placeholders/scenery.png`},oldshop:{color:`#D4A853`,fade:`rgba(212, 168, 83, 0.3)`,label:`老店`,placeholder:`/images/placeholders/oldshop.png`},walk:{color:`#7B8CDE`,fade:`rgba(123, 140, 222, 0.3)`,label:`散步`,placeholder:`/images/placeholders/walk.png`},cafe:{color:`#A67B5B`,fade:`rgba(166, 123, 91, 0.3)`,label:`咖啡`,placeholder:`/images/placeholders/cafe.png`},shop:{color:`#E07A5F`,fade:`rgba(224, 122, 95, 0.3)`,label:`購物`,placeholder:`/images/placeholders/shop.png`},stay:{color:`#3D5A80`,fade:`rgba(61, 90, 128, 0.3)`,label:`住宿`,placeholder:`/images/placeholders/stay.png`},quest:{color:`#9B72AA`,fade:`rgba(155, 114, 170, 0.3)`,label:`破關任務`,placeholder:`/images/placeholders/quest.png`}};function n(){return window.PLACES_DATA||[]}function r(e,t,n){return e.filter(e=>{let r=t===`all`||e.category===t,i=n===`all`||e.seasons&&e.seasons.includes(n);return r&&i})}function i(e){let t=e.length,n=e.filter(e=>e.status===`done`).length;return{total:t,done:n,percent:t>0?Math.round(n/t*100):0}}var a=class{map;clusterGroup;constructor(t){this.map=e.map(t,{center:[25.05,121.55],zoom:12,zoomControl:!1}),e.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`,{attribution:`&copy; CARTO`}).addTo(this.map),e.control.zoom({position:`topleft`}).addTo(this.map),this.clusterGroup=e.markerClusterGroup({showCoverageOnHover:!1,iconCreateFunction:t=>e.divIcon({html:`<div class="adv-cluster"><span>${t.getChildCount()}</span></div>`,className:``,iconSize:[40,40]})}),this.map.addLayer(this.clusterGroup)}renderMarkers(t,n){this.clusterGroup.clearLayers(),t.forEach(t=>{let r=e.marker([t.lat,t.lng],{icon:this.createIcon(t)});r.on(`click`,r=>{e.DomEvent.stopPropagation(r),n(t)}),this.clusterGroup.addLayer(r)})}createIcon(n){let r=t[n.category]||t.food;return e.divIcon({html:`<div class="adv-marker" style="background:${r.color}; box-shadow: 0 0 15px ${r.fade};"></div>`,className:``,iconSize:[32,32],iconAnchor:[16,16]})}flyTo(e,t,n=16){this.map.flyTo([e,t],n,{duration:1.5})}fitBounds(t){if(t.length===0)return;let n=t.map(e=>[e.lat,e.lng]);this.map.fitBounds(e.latLngBounds(n),{padding:[50,50],maxZoom:13})}};function o(e=0){let t=Math.floor(e);return`★`.repeat(t)+`☆`.repeat(5-t)}function s(e,t){let{total:n,done:r,percent:a}=i(t),o=document.getElementById(`total-count`),s=document.getElementById(`done-count`),c=document.getElementById(`progress-bar`),l=document.getElementById(`progress-label`);o&&(o.textContent=n.toString()),s&&(s.textContent=r.toString()),c&&(c.style.width=`${a}%`),l&&(l.textContent=`${a}% 解鎖`)}function c(e,n){let r=document.getElementById(`sidebar-detail`),i=document.getElementById(`sidebar-default`);if(!r)return;if(e.length===0){i&&(i.style.display=`flex`),r.style.display=`none`;return}i&&(i.style.display=`none`),r.style.display=`block`;let a=e.map(e=>{let n=t[e.category]||t.food,r=e.photos&&e.photos.length>0?e.photos[0]:n.placeholder;return`
      <div class="adv-list-item" 
           data-id="${e.id}"
           style="--cat-color: ${n.color}; --cat-color-fade: ${n.fade};">
        <div class="adv-list-img-box">
          <div class="adv-list-img" style="background-image:url('${r}')"></div>
        </div>
        <div class="adv-list-content">
          <div class="adv-list-tag" style="background:${n.color}">${n.label}</div>
          <div class="adv-list-name">${e.name}</div>
          <div class="adv-list-stars">${o(e.rating)}</div>
          <div class="adv-list-meta">
            <span class="adv-list-status ${e.status}">
              ${e.status===`done`?`✓ 已破關`:`📍 待解鎖`}
            </span>
            <span style="font-size: 0.6rem; opacity: 0.4;">VIEW DETAILS ›</span>
          </div>
        </div>
      </div>
    `}).join(``);r.innerHTML=`
    <div class="adv-list-container">
      <div class="adv-list-header">
        <span>COLLECTION (${e.length})</span>
      </div>
      <div class="adv-list-body">${a}</div>
    </div>
  `,r.querySelectorAll(`.adv-list-item`).forEach(e=>{e.addEventListener(`click`,()=>{n(parseInt(e.getAttribute(`data-id`)||`0`))})})}function l(e,n){let r=document.getElementById(`sidebar-detail`);if(!r)return;let i=t[e.category]||t.food;r.innerHTML=`
    <div class="adv-sidebar__detail">
      <div class="sdl-photo-hero" style="background-image: url('${e.photos&&e.photos.length>0?e.photos[0]:i.placeholder}')">
        <div class="sdl-hero-overlay"></div>
        <button class="sdl-close-btn" id="sdl-close-btn">✕</button>
      </div>
      
      <div class="sdl-header" style="background: linear-gradient(to bottom, ${i.fade}, transparent);">
        <span class="sdl-category-badge" style="background:${i.color}; color:#fff;">${i.label}</span>
        <h3 class="sdl-place-name">${e.name}</h3>
        <div class="sdl-rating">${o(e.rating)}</div>
      </div>

      <div class="sdl-body">
        ${e.description?`
        <div class="sdl-section">
          <div class="sdl-label">關於這裡</div>
          <p class="sdl-description">${e.description}</p>
        </div>
        `:``}

        ${e.trivia?`
        <div class="sdl-section sdl-trivia-box">
          <div class="sdl-label">💡 深度筆記 / 冷知識</div>
          <p class="sdl-trivia-text">${e.trivia}</p>
        </div>
        `:``}

        <div class="sdl-info-block">
          <div class="sdl-info-label">地址</div>
          <p class="sdl-info-text">${e.address||`秘密地點，目前保密中。`}</p>
        </div>
        
        <div class="sdl-footer">
          <button class="sdl-nav-btn" onclick="window.open('https://www.google.com/maps?q=${e.lat},${e.lng}')">
             GOOGLE MAPS 導航
          </button>
        </div>
      </div>
    </div>
  `,document.getElementById(`sdl-close-btn`)?.addEventListener(`click`,n)}var u=class{engine;allPlaces=[];currentCat=`all`;currentSeason=`all`;lastFilteredPlaces=[];constructor(){this.allPlaces=n(),this.engine=new a(`adventure-map`),this.lastFilteredPlaces=this.allPlaces,this.init()}init(){this.engine.renderMarkers(this.allPlaces,e=>this.focusPlace(e.id)),s(this.allPlaces,this.allPlaces),c(this.allPlaces,e=>this.focusPlace(e)),this.setupFilters(),this.allPlaces.length>0&&this.engine.fitBounds(this.allPlaces)}setupFilters(){document.querySelectorAll(`.adv-filter-btn`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget;document.querySelectorAll(`.adv-filter-btn`).forEach(e=>e.classList.remove(`adv-filter-btn--active`)),t.classList.add(`adv-filter-btn--active`),this.currentCat=t.dataset.cat||`all`,this.applyFilters()})}),document.querySelectorAll(`.adv-season-btn`).forEach(e=>{e.addEventListener(`click`,e=>{let t=e.currentTarget;document.querySelectorAll(`.adv-season-btn`).forEach(e=>e.classList.remove(`active`)),t.classList.add(`active`),this.currentSeason=t.dataset.season||`all`,this.applyFilters()})})}applyFilters(){let e=r(this.allPlaces,this.currentCat,this.currentSeason);this.lastFilteredPlaces=e,this.engine.renderMarkers(e,e=>this.focusPlace(e.id)),c(e,e=>this.focusPlace(e))}focusPlace(e){let t=this.allPlaces.find(t=>t.id===e);t&&(this.engine.flyTo(t.lat,t.lng),l(t,()=>c(this.lastFilteredPlaces,e=>this.focusPlace(e))))}};document.getElementById(`adventure-map`)&&new u;