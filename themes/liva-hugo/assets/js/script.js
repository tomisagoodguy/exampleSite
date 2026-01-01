// Preloader js    
$(window).on('load', function () {
  $('.preloader').fadeOut(100);
});

(function ($) {
  'use strict';

  // 在文檔準備好後執行
  $(document).ready(function () {
    //  Search Form Open
    $('#searchOpen').on('click', function () {
      $('.search-wrapper').addClass('open');
    });
    $('#searchClose').on('click', function () {
      $('.search-wrapper').removeClass('open');
    });

    // featured post slider
    const featuredPostSlider = $(".featured-post-slider");
    if (featuredPostSlider.length) {
      featuredPostSlider.slick({
        infinite: true,
        vertical: true,
        verticalSwiping: true,
        arrows: false,
        dots: true,
        autoplay: true,
        autoplaySpeed: 5000,
        responsive: [{
          breakpoint: 600,
          settings: {
            vertical: false,
            verticalSwiping: false,
          }
        }]
      });

      featuredPostSlider.on('wheel', (function (e) {
        e.preventDefault();
        if (e.originalEvent.deltaY > 0) {
          $(this).slick('slickNext');
        } else {
          $(this).slick('slickPrev');
        }
      }));
    }

    // venobox initialize
    if ($.fn.venobox) {
      $('.venobox').venobox();
    }

    // TOC 功能實現 (修改為使用 position: sticky)
    const tocContainer = $('.toc-container');
    if (tocContainer.length) {
      const headings = $('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
      const tocLinks = $('.toc-container a');

      // 初始化 TOC 樣式，使用 position: sticky
      function initToc() {
        // 只在桌面版應用 sticky 定位
        if ($(window).width() > 991) {
          tocContainer.addClass('sticky-toc');

          // 確保 TOC 容器有足夠的高度限制，避免超出視口
          tocContainer.css({
            'max-height': 'calc(100vh - 120px)',
            'overflow-y': 'auto'
          });
        } else {
          // 在移動設備上移除 sticky 定位
          tocContainer.removeClass('sticky-toc');
          tocContainer.css({
            'max-height': '',
            'overflow-y': ''
          });
        }
      }

      // 平滑滾動功能
      tocLinks.on('click', function (e) {
        e.preventDefault();
        const targetId = $(this).attr('href').substring(1);
        const targetElement = $('#' + targetId);

        if (targetElement.length) {
          $('html, body').animate({
            scrollTop: targetElement.offset().top - 80 // 80px 的偏移量，可以根據您的頁面調整
          }, 500);

          // 更新 URL 但不跳轉
          history.pushState(null, null, `#${targetId}`);
        }
      });

      // 滾動時高亮當前章節
      $(window).on('scroll', function () {
        let currentHeading = '';
        const scrollPosition = $(window).scrollTop();

        // 找出當前可見的標題
        headings.each(function () {
          if ($(this).offset().top - 100 <= scrollPosition) {
            currentHeading = $(this).attr('id');
          }
        });

        // 移除所有高亮
        tocLinks.removeClass('active');

        // 為當前章節添加高亮
        if (currentHeading) {
          const activeLink = $(`.toc-container a[href="#${currentHeading}"]`);
          if (activeLink.length) {
            activeLink.addClass('active');
          }
        }
      });

      // 可折疊 TOC 功能
      const tocTitle = $('.toc-title');
      if (tocTitle.length) {
        tocTitle.on('click', function () {
          tocContainer.toggleClass('collapsed');
        });
      }

      // 初始化 TOC
      initToc();

      // 窗口大小改變時重新初始化
      $(window).on('resize', initToc);
    }

    // 確保返回頂部和快速向下按鈕初始時是隱藏的
    $('#return-to-top, #go-to-bottom').hide();

    // 返回頂部和快速向下箭頭功能
    $(window).scroll(function () {
      // 返回頂部按鈕顯示/隱藏邏輯
      if ($(this).scrollTop() >= 50) {
        $('#return-to-top').fadeIn(200);
      } else {
        $('#return-to-top').fadeOut(200);
      }

      // 快速向下按鈕顯示/隱藏邏輯
      const pageHeight = $(document).height();
      const windowHeight = $(window).height();
      const scrollPosition = $(this).scrollTop();

      if (scrollPosition < pageHeight - windowHeight - 200) {
        $('#go-to-bottom').fadeIn(200);
      } else {
        $('#go-to-bottom').fadeOut(200);
      }
    });

    // 返回頂部按鈕點擊事件
    $('#return-to-top').on('click', function (e) {
      e.preventDefault();
      $('html, body').animate({
        scrollTop: 0
      }, 500);
    });

    // 快速向下按鈕點擊事件 - 使用更直接的方法
    $('#go-to-bottom').on('click', function (e) {
      e.preventDefault();

      // 計算文檔總高度和窗口高度
      const docHeight = $(document).height();
      const winHeight = $(window).height();

      // 滾動到文檔底部
      $('html, body').animate({
        scrollTop: docHeight - winHeight
      }, 500);
    });

    // 水平副導覽列下拉菜單功能 - 依據螢幕大小調整行為
    function setupDropdowns() {
      const dropdownItems = $('.sub-nav-list li.dropdown');

      // 移除可能存在的點擊事件處理程序
      dropdownItems.find('> a').off('click.dropdown');
      $(document).off('click.dropdown-close');

      // 桌面版本使用懸停效果 (已在 CSS 中實現)
      // 移動版本使用點擊效果
      if ($(window).width() <= 768) {
        dropdownItems.find('> a').on('click.dropdown', function (e) {
          e.preventDefault();
          const parent = $(this).parent();

          // 關閉其他打開的下拉菜單
          dropdownItems.not(parent).removeClass('show');

          // 切換當前下拉菜單
          parent.toggleClass('show');
        });

        // 點擊其他地方關閉下拉菜單
        $(document).on('click.dropdown-close', function (e) {
          if (!dropdownItems.is(e.target) && dropdownItems.has(e.target).length === 0) {
            dropdownItems.removeClass('show');
          }
        });
      }
    }

    // 初始化下拉菜單功能
    setupDropdowns();

    // 窗口大小變化時重新設置下拉菜單行為
    $(window).on('resize', function () {
      setupDropdowns();
    });

    // 確保移動設備上的下拉菜單可以正確關閉
    $('.sub-nav-list li.dropdown .dropdown-menu a').on('click', function () {
      if ($(window).width() <= 768) {
        $(this).closest('.dropdown').removeClass('show');
      }
    });

    // 修正 FontAwesome 圖標問題 (如果需要)
    if ($('.sub-nav-list li.dropdown > a').length && !$('.sub-nav-list li.dropdown > a').find('i.fa').length) {
      $('.sub-nav-list li.dropdown > a').append(' <i class="fa fa-angle-down"></i>');
    }

    // 添加副導覽列的滾動陰影效果
    $(window).on('scroll', function () {
      const subNav = $('.sub-navigation');
      if (subNav.length) {
        if ($(window).scrollTop() > 50) {
          subNav.addClass('scrolled');
        } else {
          subNav.removeClass('scrolled');
        }
      }
    });
  });

})(jQuery);
