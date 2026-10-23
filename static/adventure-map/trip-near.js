// 旅行介紹頁的「附近還有什麼吃的」：行程頁每一站放 <div class="near" data-near="地點id,…"> 或 data-near-latlng="lat,lng"，
// 這支程式用破關地圖記住的密碼讀 dating_map_places，把附近存過的吃＋咖啡甜點填進去（新存的店、誰按了想去都會即時反映）
(function () {
  var SUPABASE_URL = 'https://zvomerdcsxvuymnpuvxk.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xAprCS1COLD7ePcF08buGw_LHfh6d9q';
  var PASSPHRASE_KEY = 'dating_map_passphrase'; // 與破關地圖 supabase.ts 共用
  var EAT = { food: '🍜', cafe: '☕' };
  var RADIUS = 500; // 走路可到的範圍
  var FALLBACK = 3000; // 範圍內沒有時，告訴你最近的一家（再遠就不提）
  var PREVIEW = 5;

  var slots = Array.prototype.slice.call(document.querySelectorAll('.near[data-near], .near[data-near-latlng]'));
  if (!slots.length) return;

  var pw = null;
  try { pw = localStorage.getItem(PASSPHRASE_KEY); } catch (e) { /* 無痕模式讀不到就不顯示 */ }
  if (!pw) return;

  var style = document.createElement('style');
  style.textContent =
    '.stop .near{order:9;margin-top:6px;padding:8px 10px;border-radius:8px;background:var(--chip);display:grid;gap:6px}' +
    '.stop .near:empty{display:none}' +
    '.near__head{font-size:12px;font-weight:700;color:var(--muted)}' +
    '.near__list{display:flex;flex-wrap:wrap;gap:6px}' +
    '.near__item{display:inline-flex;align-items:baseline;gap:4px;font-size:13px;padding:3px 9px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none}' +
    '.near__item:hover{border-color:var(--c)}' +
    '.near__item small{color:var(--muted);font-size:11px}' +
    '.near__item.is-liked{border-color:var(--c)}' +
    '.near__more{font:inherit;font-size:12px;border:0;background:none;color:var(--c);cursor:pointer;padding:0;justify-self:start}' +
    '.near__err{font-size:12px;color:var(--muted)}';
  document.head.appendChild(style);

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function meters(a, b) {
    var rad = Math.PI / 180;
    var h = Math.pow(Math.sin((b.lat - a.lat) * rad / 2), 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.pow(Math.sin((b.lng - a.lng) * rad / 2), 2);
    return 6371000 * 2 * Math.asin(Math.sqrt(h));
  }
  function distText(m) {
    return m < 1000 ? Math.max(10, Math.round(m / 10) * 10) + ' 公尺' : (m / 1000).toFixed(1).replace(/\.0$/, '') + ' 公里';
  }
  function itemHTML(x) {
    var p = x.place;
    var likes = p.liked_by || [];
    var q = encodeURIComponent(p.name + ' ' + (p.address || ''));
    return '<a class="near__item' + (likes.length ? ' is-liked' : '') + '" target="_blank" rel="noopener"' +
      ' href="https://www.google.com/maps/search/?api=1&query=' + q + '"' + (p.note ? ' title="' + esc(p.note) + '"' : '') + '>' +
      EAT[p.category] + ' ' + esc(p.name) + ' <small>' + distText(x.m) + (likes.length ? ' · ❤️ ' + esc(likes.join('、')) : '') + '</small></a>';
  }

  var url = SUPABASE_URL + '/rest/v1/dating_map_places?select=id,name,category,lat,lng,address,note,liked_by&lat=not.is.null&lng=not.is.null';
  fetch(url, { headers: { apikey: SUPABASE_KEY, 'x-dating-map-pass': pw } })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (places) {
      var byId = {};
      places.forEach(function (p) { byId[p.id] = p; });
      // 頁面上已經是行程站的店不用再推薦
      var onPage = {};
      slots.forEach(function (el) {
        (el.dataset.near || '').split(',').forEach(function (id) { if (id) onPage[id] = true; });
      });
      var eats = places.filter(function (p) { return EAT[p.category] && !onPage[p.id]; });

      slots.forEach(function (el) {
        var anchors = [];
        if (el.dataset.nearLatlng) {
          var ll = el.dataset.nearLatlng.split(',');
          anchors.push({ lat: Number(ll[0]), lng: Number(ll[1]) });
        }
        (el.dataset.near || '').split(',').forEach(function (id) {
          var p = byId[id];
          if (p) anchors.push({ lat: p.lat, lng: p.lng });
        });
        if (!anchors.length) return;

        var ranked = eats.map(function (p) {
          var best = Infinity;
          anchors.forEach(function (a) { best = Math.min(best, meters(a, p)); });
          return { place: p, m: best };
        }).sort(function (a, b) { return a.m - b.m; });
        var near = ranked.filter(function (x) { return x.m <= RADIUS; });

        if (!near.length) {
          var closest = ranked[0];
          el.innerHTML = closest && closest.m <= FALLBACK
            ? '<div class="near__head">🍴 附近 ' + RADIUS + ' 公尺內沒有存過的吃的，最近的是</div><div class="near__list">' + itemHTML(closest) + '</div>'
            : '<div class="near__head">🍴 附近沒有存過的吃的</div>';
          return;
        }
        var render = function (all) {
          var shown = all ? near : near.slice(0, PREVIEW);
          el.innerHTML = '<div class="near__head">🍴 附近 ' + RADIUS + ' 公尺內還有 ' + near.length + ' 家吃的</div>' +
            '<div class="near__list">' + shown.map(itemHTML).join('') + '</div>' +
            (near.length > shown.length ? '<button type="button" class="near__more">再看 ' + (near.length - shown.length) + ' 家 ▾</button>' : '');
          var more = el.querySelector('.near__more');
          if (more) more.addEventListener('click', function () { render(true); });
        };
        render(false);
      });
    })
    .catch(function (e) {
      slots.forEach(function (el) {
        el.innerHTML = '<div class="near__err">附近美食讀取失敗（' + esc(e.message) + '），重新整理再試一次</div>';
      });
    });
})();
