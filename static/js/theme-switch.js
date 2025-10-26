/**
 * 修正版的 theme-switch.js
 *
 * 修正了「換頁時無法記住使用者選擇」的邏輯錯誤。
 *
 * 正確邏輯：
 * 1. 頁面載入時，優先檢查 localStorage 中是否有 'theme' 紀錄。
 * 2. 如果有，使用 localStorage 中的設定 (使用者的選擇)。
 * 3. 如果沒有，才檢查系統偏好 (prefers-color-scheme)。
 */
document.addEventListener('DOMContentLoaded', function() {
  
  const themeToggle = document.getElementById('checkbox');
  const body = document.body;
  const themeClass = 'dark-mode'; // ⚠️ 注意：請確認您的 CSS 是用這個 class 名稱
  
  /**
   * 套用主題並同步開關狀態
   * @param {string} theme - 'dark' 或 'light'
   */
  function applyTheme(theme) {
    if (theme === 'dark') {
      body.classList.add(themeClass);
      if (themeToggle) {
        themeToggle.checked = true;
      }
      localStorage.setItem('theme', 'dark'); // 記住使用者的選擇
    } else {
      body.classList.remove(themeClass);
      if (themeToggle) {
        themeToggle.checked = false;
      }
      localStorage.setItem('theme', 'light'); // 記住使用者的選擇
    }
  }

  /**
   * 檢查並套用初始主題
   */
  function checkInitialTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Handle old value from previous script
    if (savedTheme === 'dark-mode') {
        applyTheme('dark');
        return;
    }

    if (savedTheme) {
      // 優先使用 localStorage 中儲存的設定
      applyTheme(savedTheme);
    } else if (prefersDark) {
      // 其次，使用系統偏好
      applyTheme('dark');
    } else {
      // 預設為淺色
      applyTheme('light');
    }
  }

  // 1. 頁面載入時，立即檢查並套用主題
  checkInitialTheme();

  // 2. 監聽開關的點擊事件
  if (themeToggle) {
    themeToggle.addEventListener('change', function(e) {
      if (e.target.checked) {
        applyTheme('dark');
      } else {
        applyTheme('light');
      }
    });
  }
});