export function initTheme(): void {
    const themeToggle = document.getElementById('checkbox') as HTMLInputElement | null;
    const body = document.body;
    const themeClass = 'dark-mode';

    function applyTheme(theme: 'dark' | 'light'): void {
        if (theme === 'dark') {
            body.classList.add(themeClass);
            if (themeToggle) themeToggle.checked = true;
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove(themeClass);
            if (themeToggle) themeToggle.checked = false;
            localStorage.setItem('theme', 'light');
        }
    }

    // Initial check
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || savedTheme === 'dark-mode') {
        applyTheme('dark');
    } else if (!savedTheme && prefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }

    // Event listener
    if (themeToggle) {
        themeToggle.addEventListener('change', function (this: HTMLInputElement) {
            if (this.checked) {
                applyTheme('dark');
            } else {
                applyTheme('light');
            }
        });
    }

    // === Navbar Scroll Logic ===
    window.addEventListener('scroll', function () {
        if (window.scrollY > 30) {
            document.body.classList.add('scrolled');
        } else {
            document.body.classList.remove('scrolled');
        }
    });

    // === Scroll Reveal Logic (Intersection Observer) ===
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                (entry.target as HTMLElement).style.opacity = "1";
                entry.target.classList.add('reveal-active');
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    // === Code Block Copy Functionality ===
    const codeBlocks = document.querySelectorAll('pre');
    codeBlocks.forEach(function (pre) {
        // Create copy button
        const button = document.createElement('button');
        button.className = 'copy-button';
        button.innerText = 'Copy';

        // Position button (handled by CSS, but we append it to the pre)
        pre.appendChild(button);

        button.addEventListener('click', function () {
            // Find the code element inside
            const code = pre.querySelector('code');
            const textToCopy = code ? code.innerText : (pre as HTMLElement).innerText;

            // Copy using Clipboard API
            navigator.clipboard.writeText(textToCopy).then(function () {
                button.innerText = 'Copied!';
                setTimeout(function () {
                    button.innerText = 'Copy';
                }, 2000);
            }).catch(function (err) {
                console.error('Failed to copy: ', err);
                button.innerText = 'Error';
            });
        });
    });
}

export function initNewsletter(): void {
    const form = document.getElementById('newsletter-form') as HTMLFormElement | null;
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const response = document.getElementById('newsletter-response');
            const emailInput = this.querySelector('input[name="email"]') as HTMLInputElement;
            const email = emailInput.value;

            if (response) {
                response.innerHTML = '<p class="text-success">感謝您的訂閱！</p>';
            }
            this.reset();
        });
    }
}

declare var Cookies: any;

export function initCookies(expireDays: number): void {
    const cookieBox = document.getElementById('js-cookie-box');
    const cookieButton = document.getElementById('js-cookie-button');

    function checkCookies(): void {
        if (typeof Cookies === 'undefined') {
            setTimeout(checkCookies, 1000);
            return;
        }

        if (cookieBox && !Cookies.get('cookie-box')) {
            cookieBox.classList.remove('cookie-box-hide');
            if (cookieButton) {
                cookieButton.onclick = function () {
                    Cookies.set('cookie-box', true, {
                        expires: expireDays
                    });
                    localStorage.setItem('cookie-consent', 'true');
                    cookieBox.classList.add('cookie-box-hide');
                };
            }
        }
    }
    checkCookies();
}

declare var $: any;

export function initSidebarSlider(): void {
    const sidebarSlider = $('.sidebar-post-slider');
    if (sidebarSlider.length && ($.fn as any).slick) {
        sidebarSlider.slick({
            autoplay: true,
            autoplaySpeed: 2000,
            dots: false,
            arrows: false,
            infinite: true,
            speed: 500,
            slidesToShow: 5,
            slidesToScroll: 1,
            vertical: true,
            verticalSwiping: true
        });
    }
}
