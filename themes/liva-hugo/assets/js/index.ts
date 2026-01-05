import { initTheme, initNewsletter, initCookies, initSidebarSlider } from './ui-utils';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initNewsletter();
    initSidebarSlider();
    // Cookie expiry will be handled by passing the param from Hugo template
    const cookieExpire = parseInt(document.body.getAttribute('data-cookie-expire') || '1');
    initCookies(cookieExpire);
});

// For global variables that need to be accessed by other scripts
(window as any).indexURL = (window as any).indexURL || "";
