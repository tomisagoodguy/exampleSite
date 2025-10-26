document.addEventListener('DOMContentLoaded', function () {

    const themeSwitch = document.getElementById('checkbox');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (currentTheme === 'dark-mode' || (!currentTheme && prefersDark)) {
        body.classList.add('dark-mode');
        if (themeSwitch) {
            themeSwitch.checked = true;
        }
    } else {
        body.classList.remove('dark-mode');
        if (themeSwitch) {
            themeSwitch.checked = false;
        }
    }

    themeSwitch.addEventListener('change', function () {
        if (this.checked) {
            body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark-mode');
        } else {
            body.classList.remove('dark-mode');
            localStorage.removeItem('theme');
        }
    });
});
