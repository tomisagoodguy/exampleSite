// 覆寫 themes/liva-hugo/assets/js/index.ts。
// 主題的 initTheme 會在系統深色時加上舊的 dark-mode class（配的是玻璃風深色樣式，半套）；
// 現在深淺色改由 custom.css 的 --pb-* token 切換：預設跟 prefers-color-scheme，
// 導覽列開關選過就寫進 <html data-theme> 與 localStorage 'pb-theme'（head.html 開頭會先套用）。
// initTheme 裡還有導覽列捲動、scroll reveal 等邏輯，所以照樣呼叫，只是先把 theme 固定成 light。
import { initTheme, initNewsletter, initCookies, initSidebarSlider } from './ui-utils';

const THEME_KEY = 'pb-theme';

function isNight(): boolean {
    const chosen = document.documentElement.getAttribute('data-theme');
    if (chosen === 'dark') return true;
    if (chosen === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function initDayNightSwitch(): void {
    const old = document.getElementById('checkbox') as HTMLInputElement | null;
    if (!old) return;
    // 換成複本，拿掉主題 initTheme 綁的 change（它會加 dark-mode class）
    const toggle = old.cloneNode(true) as HTMLInputElement;
    old.replaceWith(toggle);
    toggle.setAttribute('aria-label', '切換白天／夜晚');
    toggle.checked = isNight();

    toggle.addEventListener('change', () => {
        const theme = toggle.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {
            console.warn('無法記住日夜選擇', e);
        }
    });

    // 沒手動選過時，系統切換深淺色也跟著更新開關
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        toggle.checked = isNight();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        localStorage.setItem('theme', 'light');
    } catch (e) {
        console.warn('無法寫入 theme 設定', e);
    }
    initTheme();
    document.body.classList.remove('dark-mode');
    initDayNightSwitch();

    initNewsletter();
    initSidebarSlider();
    // Cookie expiry will be handled by passing the param from Hugo template
    const cookieExpire = parseInt(document.body.getAttribute('data-cookie-expire') || '1');
    initCookies(cookieExpire);
});

// For global variables that need to be accessed by other scripts
(window as any).indexURL = (window as any).indexURL || "";
