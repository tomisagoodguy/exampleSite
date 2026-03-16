export function toast(msg: string) {
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    // @ts-ignore
    clearTimeout(toast._t);
    // @ts-ignore
    toast._t = setTimeout(() => { el.classList.remove('show'); }, 3200);
  }
}

export function esc(s: string | number) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function updateRateUI(rate: number) {
  document.querySelectorAll('.rate-btn').forEach((b) => {
    const v = parseInt(b.getAttribute('data-v') || '0');
    b.classList.toggle('on', v <= rate);
  });
}

export function setStatus(msg: string, cls?: string) {
  const sStatus = document.getElementById('s-status');
  if (sStatus) {
    sStatus.textContent = msg;
    sStatus.className = 'search-status' + (cls ? ' ' + cls : '');
  }
}
