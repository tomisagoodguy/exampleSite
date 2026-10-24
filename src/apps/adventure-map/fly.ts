/**
 * 地點換階段時的移動動畫：卡片從原位置沿弧線飛到新位置，讓人看得出它往前（或往回）走了一步。
 * 新卡片看得到就飛過去；收在沒展開的區域、在手機另一個分頁，或流程條不在畫面上時，
 * 改飛進那一階段的分頁按鈕／流程條；兩者都看不到就只讓數字跳一下。
 */

export type Stage = 'idea' | 'proposed' | 'itinerary';

export interface CardSnapshot {
  rect: DOMRect;
  ghost: HTMLElement;
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 在資料更新、重畫之前呼叫：記下卡片位置並複製一份當作飛行中的替身 */
export function captureCard(placeId: number): CardSnapshot | null {
  const el = document.querySelector<HTMLElement>(`[data-place="${placeId}"]`);
  if (!el || !el.getClientRects().length || reduceMotion()) return null;
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('data-place');
  ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  return { rect: el.getBoundingClientRect(), ghost };
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** 新卡片在捲動容器（清單、右欄）外面就把那個容器捲過去，不動整頁；最後回報是否在畫面上 */
function revealCard(el: HTMLElement): boolean {
  if (!el.getClientRects().length) return false;
  const box = scrollParent(el);
  if (box) {
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - 12;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

function stageTarget(stage: Stage): HTMLElement | null {
  const selectors = [
    `.adv-tab[data-tab-target="${stage}"] .adv-tab__icon`,
    `.adv-flow__step[data-flow-step="${stage}"] .adv-flow__dot`,
  ];
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

function bump(stage: Stage) {
  document.querySelectorAll<HTMLElement>(`.adv-section-count[data-section="${stage}"]`).forEach((el) => {
    el.classList.remove('adv-bump');
    void el.offsetWidth;
    el.classList.add('adv-bump');
  });
}

/** 標記已去過時在卡片蓋一個「去過！」印章，停一下再淡掉 */
function stampCard(el: HTMLElement) {
  const stamp = document.createElement('span');
  stamp.className = 'adv-stamp';
  stamp.textContent = '去過！';
  el.appendChild(stamp);
  window.setTimeout(() => stamp.remove(), reduceMotion() ? 1200 : 1800);
}

/** 在重畫之後呼叫：從 captureCard 記下的位置飛到新卡片（或該階段的分頁按鈕） */
export function flyCard(from: CardSnapshot | null, placeId: number, stage: Stage, stamp = false) {
  const card = document.querySelector<HTMLElement>(`[data-place="${placeId}"]`);
  const landed = card && revealCard(card) ? card : null;
  const target = landed ?? stageTarget(stage);

  if (!from || !target) {
    bump(stage);
    if (landed && stamp) stampCard(landed);
    return;
  }

  const to = target.getBoundingClientRect();
  const { rect, ghost } = from;
  ghost.classList.add('adv-ghost');
  Object.assign(ghost.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  // 掛在 #adv-app-root 底下才吃得到破關地圖的字型與 token
  (document.getElementById('adv-app-root') ?? document.body).appendChild(ghost);
  if (landed) landed.style.visibility = 'hidden';

  const dx = to.left + to.width / 2 - (rect.left + rect.width / 2);
  const dy = to.top + to.height / 2 - (rect.top + rect.height / 2);
  const scale = landed ? Math.min(to.width / rect.width, 1.1) : 0.18;
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) rotate(-5deg) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0) scale(${scale})`, opacity: landed ? 0.85 : 0.2 },
    ],
    { duration: 700, easing: 'cubic-bezier(.45, 0, .25, 1)' }
  );

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    ghost.remove();
    if (landed) {
      landed.style.visibility = '';
      landed.classList.remove('adv-land');
      void landed.offsetWidth;
      landed.classList.add('adv-land');
      if (stamp) stampCard(landed);
    }
    bump(stage);
  };
  anim.onfinish = finish;
  anim.oncancel = finish;
}
