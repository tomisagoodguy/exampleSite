// 旅行介紹頁的「📄 存 PDF／📝 文字檔」：由各旅行的載入頁（static/adventure-map/<slug>/index.html）在行程 HTML 後面引入，
// 所以每趟旅行都會有，不用改資料庫裡的 html。PDF 走瀏覽器列印（文字可選取），文字檔是 Markdown，方便丟給其他 AI
(function () {
  var style = document.createElement('style');
  style.textContent =
    '.trip-export{display:flex;flex-wrap:wrap;gap:8px}' +
    '.trip-export button{font:inherit;font-size:13px;border:1px solid var(--line,#d3dcdf);background:var(--card,#fff);color:var(--ink,#1c2930);padding:4px 12px;border-radius:999px;cursor:pointer}' +
    '.trip-export button:focus-visible{outline:2px solid var(--ink,#1c2930);outline-offset:2px}' +
    '.trip-export--float{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:50}' +
    '@media print{' +
    '.trip-export,.theme-btn,.back,nav.days,.seg,.replay,.btn,.near__more{display:none!important}' +
    'body{background:#fff!important}' +
    '#trip-map .route{animation:none!important;stroke-dashoffset:0!important}' +
    '#trip-map .arrow{animation:none!important;opacity:1!important}' +
    '.stop,.alt,.mapbox,.notice{break-inside:avoid}' +
    'section.day{break-before:page}' +
    'a{text-decoration:none}' +
    '}';
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.className = 'trip-export';
  bar.innerHTML =
    '<button type="button" data-act="pdf">📄 存 PDF</button>' +
    '<button type="button" data-act="md">📝 文字檔</button>';
  var topbar = document.querySelector('.topbar');
  if (topbar) {
    var theme = topbar.querySelector('.theme-btn');
    if (theme) { theme.parentNode.insertBefore(bar, theme); bar.appendChild(theme); } else topbar.appendChild(bar);
  } else {
    bar.classList.add('trip-export--float');
    document.body.appendChild(bar);
  }

  // 列印時改成淺色、地圖切到「全部」，印完還原
  var restore = null;
  window.addEventListener('beforeprint', function () {
    if (restore) return; // 有些瀏覽器會連發兩次，第二次會把「原本的設定」記成淺色
    var root = document.documentElement;
    var prevTheme = root.dataset.theme;
    var pressed = document.querySelector('.seg button[aria-pressed="true"]');
    var all = document.querySelector('.seg button[data-day="0"]');
    root.dataset.theme = 'light';
    if (all && pressed !== all) all.click();
    restore = function () {
      if (prevTheme) root.dataset.theme = prevTheme; else delete root.dataset.theme;
      if (pressed && pressed !== all) pressed.click();
    };
  });
  window.addEventListener('afterprint', function () {
    if (restore) restore();
    restore = null;
  });

  // ---- DOM → Markdown ----
  var SKIP = { SCRIPT: 1, STYLE: 1, SVG: 1, BUTTON: 1, NOSCRIPT: 1, TEMPLATE: 1 };
  var BLOCK = /^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|OL|UL|LI|DL|DT|DD|P|H[1-6]|TABLE|TR|BLOCKQUOTE|FIGURE)$/;

  function clean(s) { return s.replace(/\s+/g, ' ').replace(/\s*↗/g, '').trim(); }
  // 跳到某一天、回破關地圖這類頁內導覽，在文字檔裡沒用
  function skip(el) {
    return SKIP[el.tagName] || el.tagName === 'NAV' || el.hidden || el.tagName === 'svg' ||
      el.classList.contains('trip-export') || el.classList.contains('back');
  }

  function one(c) {
    if (c.nodeType === 3) return c.textContent;
    if (c.nodeType !== 1 || skip(c)) return '';
    if (c.tagName === 'BR') return ' / ';
    var t = inline(c);
    if (c.tagName === 'A' && /^https?:/.test(c.href) && clean(t)) return '[' + clean(t) + '](' + c.href + ')';
    if ((c.tagName === 'B' || c.tagName === 'STRONG') && clean(t)) return '**' + clean(t) + '**';
    if (c.classList.contains('tag')) return ' ' + clean(t) + ' ·';
    return ' ' + t + ' ';
  }
  function inline(node) {
    var out = '';
    node.childNodes.forEach(function (c) { out += one(c); });
    return out;
  }
  function hasBlock(el) {
    for (var i = 0; i < el.children.length; i++) if (BLOCK.test(el.children[i].tagName)) return true;
    return false;
  }

  function block(el, lines, depth) {
    if (skip(el)) return;
    var tag = el.tagName;
    var h = /^H([1-6])$/.exec(tag);
    if (h) { lines.push('', '#'.repeat(Number(h[1])) + ' ' + clean(inline(el)), ''); return; }
    if (tag === 'DT') { lines.push('- **' + clean(inline(el)) + '**：'); return; }
    if (tag === 'DD' && /：$/.test(lines[lines.length - 1] || '')) { lines[lines.length - 1] += clean(inline(el)); return; }
    if (tag === 'LI' && !hasBlock(el)) { lines.push('  '.repeat(depth) + '- ' + clean(inline(el))); return; }
    if (!hasBlock(el)) {
      var text = clean(one(el)).replace(/\s*·$/, '');
      if (!text) return;
      if (el.classList.contains('t')) lines.push('', '**【' + text + '】**');
      else if (el.parentElement && el.parentElement.classList.contains('alt') && (tag === 'B' || tag === 'STRONG')) lines.push('', text);
      else lines.push(text);
      return;
    }
    if (tag === 'LI') lines.push('', '---');
    var next = (tag === 'UL' || tag === 'OL') && el.parentElement && el.parentElement.closest('li') ? depth + 1 : depth;
    // 混在區塊之間的文字（例如 .alt 裡的 <b> 標題）也要留
    el.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { var s = clean(c.textContent); if (s) lines.push(s); return; }
      if (c.nodeType === 1) block(c, lines, next);
    });
  }

  function toMarkdown() {
    var root = document.querySelector('.wrap') || document.body;
    var lines = [];
    block(root, lines, 0);
    var md = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return md + '\n\n> 匯出自 ' + location.href.split('#')[0] + '（' + new Date().toLocaleString('zh-TW') + '）\n';
  }

  function download() {
    var name = (document.title || 'trip').replace(/\//g, '-').replace(/[\\:*?"<>|]/g, '').trim() + '.md';
    var blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'pdf') window.print();
    else download();
  });
})();
