// Preloader js    
$(window).on('load', function () {
  $('.preloader').fadeOut(100);
});

(function ($) {
  'use strict';

  //  Search Form Open
  $('#searchOpen').on('click', function () {
    $('.search-wrapper').addClass('open');
  });
  $('#searchClose').on('click', function () {
    $('.search-wrapper').removeClass('open');
  });

  // featured post slider
  const featuredPostSlider = $(".featured-post-slider");
  featuredPostSlider.slick({
    infinite: true,
    vertical: true,
    verticalSwiping: true,
    arrows: false,
    dots: true,
    responsive: [{
      breakpoint: 600,
      settings: {
        vertical: false,
        verticalSwiping: false,
      }
    }]
  });

  featuredPostSlider.on('wheel', (function(e) {
    e.preventDefault();
    if (e.originalEvent.deltaY > 0) {
      $(this).slick('slickNext');
    } else {
      $(this).slick('slickPrev');
    }
  }));

  // venobox initialize
  $('.venobox').venobox();

  // TOC 功能實現 (修改為使用 position: sticky)
  $(document).ready(function() {
    // 檢查頁面上是否有 TOC 元素
    const tocContainer = $('.toc-container');
    if (tocContainer.length === 0) return;

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
    tocLinks.on('click', function(e) {
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
    $(window).on('scroll', function() {
      let currentHeading = '';
      const scrollPosition = $(window).scrollTop();
      
      // 找出當前可見的標題
      headings.each(function() {
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
      tocTitle.on('click', function() {
        tocContainer.toggleClass('collapsed');
      });
    }
    
    // 初始化 TOC
    initToc();
    
    // 窗口大小改變時重新初始化
    $(window).on('resize', initToc);
  });

  // 返回頂部箭頭功能
  $(window).scroll(function() {
    if ($(this).scrollTop() >= 200) {        // 當滾動距離超過 200px 時
      $('#return-to-top').fadeIn(200);    // 淡入顯示箭頭
    } else {
      $('#return-to-top').fadeOut(200);   // 淡出隱藏箭頭
    }
  });

  $('#return-to-top').click(function() {      // 當點擊箭頭時
    $('body,html').animate({
      scrollTop : 0                       // 返回頁面頂部
    }, 500);
  });

})(jQuery);
