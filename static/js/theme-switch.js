const themeSwitch = document.getElementById('checkbox');
const body = document.body;

const theme = localStorage.getItem('theme');
if (theme) {
    body.classList.add(theme);
    if (theme === 'dark-mode') {
        themeSwitch.checked = true;
    }
}

themeSwitch.addEventListener('change', function() {
    if (this.checked) {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark-mode');
    } else {
        body.classList.remove('dark-mode');
        localStorage.removeItem('theme');
    }
});