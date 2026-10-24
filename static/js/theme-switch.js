// 全站改為日系繪本風、只用淺色（2026-10-24）：夜間開關已藏起來，
// 這裡清掉舊的 dark-mode 狀態，避免之前選過夜間的人看到半套深色。
document.addEventListener('DOMContentLoaded', function () {
  document.body.classList.remove('dark-mode');
  try {
    localStorage.removeItem('theme');
  } catch (e) {
    console.warn('無法清除 theme 設定', e);
  }
});

// === Code Block Copy Functionality ===
document.addEventListener('DOMContentLoaded', function () {
  // Select all code blocks (pre elements that usually contain code)
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
      const textToCopy = code ? code.innerText : pre.innerText;

      // Copy using Clipboard API
      navigator.clipboard.writeText(textToCopy).then(function () {
        button.innerText = 'Copied!';
        setTimeout(function () {
          button.innerText = 'Copy';
        }, 2000);
      }).catch(function (err) {
        console.error('Failed to copy class: ', err);
        button.innerText = 'Error';
      });
    });
  });
});