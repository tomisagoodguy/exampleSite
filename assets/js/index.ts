// 覆寫 themes/liva-hugo/assets/js/index.ts。
// 主題的 initTheme 會在系統深色時加上舊的 dark-mode class（配的是玻璃風深色樣式，半套）；
// 現在深淺色改由 custom.css 的 --pb-* token 跟著 prefers-color-scheme 切換。
// initTheme 裡還有導覽列捲動、scroll reveal 等邏輯，所以照樣呼叫，只是先把 theme 固定成 light。
import { initTheme, initNewsletter, initCookies, initSidebarSlider } from './ui-utils';

document.addEventListener('DOMContentLoaded', () => {
    try {
        localStorage.setItem('theme', 'light');
    } catch (e) {
        console.warn('無法寫入 theme 設定', e);
    }
    initTheme();
    document.body.classList.remove('dark-mode');

    initNewsletter();
    initSidebarSlider();
    // Cookie expiry will be handled by passing the param from Hugo template
    const cookieExpire = parseInt(document.body.getAttribute('data-cookie-expire') || '1');
    initCookies(cookieExpire);
});

// For global variables that need to be accessed by other scripts
(window as any).indexURL = (window as any).indexURL || "";
