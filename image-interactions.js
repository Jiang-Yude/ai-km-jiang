(function () {
  'use strict';

  var DEFAULTS = {
    // 2026-08-31 改為「明確開才有」（江江拍板）。原本是 opt-out：
    //   '.hero-figure img, .inline-figure img, img.interactive-image, img[data-interactive-image]'
    // 那樣預設全站每張圖都能被讀者拖走、拉四角縮放，版面會被玩壞。
    // 2026-08-19 只拿掉 .hero-figure img（commit 0a56363），但那次沒上線，
    // 而且留著的 img.interactive-image 開關在 8/30 被課程頁 hero 誤用，同一個雷炸第二次。
    // 現在唯一入口＝在那張 <img> 上明寫 data-interactive-image，沒寫的一律不可拖。
    // 想開某張圖：<img src="..." data-interactive-image>
    // 這條 selector 有機械保底：scripts/check-image-drag.mjs，preflight 會擋下放寬。
    selector: 'img[data-interactive-image]',
    dragThresholdPx: 4,
    touchDragThresholdPx: 6,
    viewportMarginPx: 8,
    minVisiblePx: 32,
    minWidthPx: 96,
    minOriginalScale: 0.2,
    maxOriginalScale: 2.5,
    maxViewportWidthRatio: 0.95,
    maxViewportHeightRatio: 0.95,
    keyboardMovePx: 10,
    keyboardFineMovePx: 1,
    keyboardResizeStep: 0.1
  };

  var selected = null;
  var active = null;
  var lastGestureEndedAt = 0;
  var stylesReady = false;
  var guardReady = false;

  // 全站原生拖曳護欄（2026-08-31 立）：瀏覽器預設 <img draggable=true>，
  // 讀者可以把圖直接拖出頁面拖到桌面／別的視窗，看起來就是「圖被拖走了」。
  // 這一段不管圖有沒有開互動功能，一律關掉原生拖曳。
  // 這支 js 全站 146 頁都有載，所以放這裡等於一次覆蓋全站。
  function injectDragGuard() {
    if (guardReady || document.getElementById('image-drag-guard-style')) return;
    guardReady = true;
    var style = document.createElement('style');
    style.id = 'image-drag-guard-style';
    style.textContent = 'img{-webkit-user-drag:none;user-drag:none}';
    (document.head || document.documentElement).appendChild(style);
    document.addEventListener('dragstart', function (event) {
      if (event.target && event.target.tagName === 'IMG') event.preventDefault();
    });
  }

  function injectStyles() {
    if (stylesReady || document.getElementById('image-interactions-style')) return;
    stylesReady = true;
    var style = document.createElement('style');
    style.id = 'image-interactions-style';
    style.textContent = [
      '.image-interaction-box{position:relative;display:inline-block;max-width:none;vertical-align:middle;touch-action:auto;transform:translate3d(var(--ii-x,0px),var(--ii-y,0px),0);z-index:1}',
      '.image-interaction-box>img{display:block;width:100%;max-width:none;height:auto;cursor:grab;user-select:none;-webkit-user-drag:none}',
      '.image-interaction-box.is-selected{outline:1px solid #3b82f6;outline-offset:4px;z-index:20}',
      '.image-interaction-box.is-focused{box-shadow:0 0 0 4px rgba(59,130,246,.18)}',
      '.image-interaction-box.is-dragging>img{cursor:grabbing}',
      '.image-resize-handle{position:absolute;width:24px;height:24px;display:none;z-index:3;touch-action:none}',
      '.image-resize-handle::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;border:2px solid #fff;border-radius:999px;background:#3b82f6;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:translate(-50%,-50%)}',
      '.image-interaction-box.is-selected .image-resize-handle{display:block}',
      '.image-resize-handle[data-corner="nw"]{left:-12px;top:-12px;cursor:nwse-resize}',
      '.image-resize-handle[data-corner="ne"]{right:-12px;top:-12px;cursor:nesw-resize}',
      '.image-resize-handle[data-corner="sw"]{left:-12px;bottom:-12px;cursor:nesw-resize}',
      '.image-resize-handle[data-corner="se"]{right:-12px;bottom:-12px;cursor:nwse-resize}',
      '@media(pointer:coarse){.image-resize-handle{width:32px;height:32px}.image-resize-handle[data-corner="nw"]{left:-16px;top:-16px}.image-resize-handle[data-corner="ne"]{right:-16px;top:-16px}.image-resize-handle[data-corner="sw"]{left:-16px;bottom:-16px}.image-resize-handle[data-corner="se"]{right:-16px;bottom:-16px}}',
      '@media(max-width:480px){.image-interaction-box:not([data-mobile-resize="true"]) .image-resize-handle{display:none!important}}',
      '@media(prefers-reduced-motion:no-preference){.image-interaction-box{transition:outline-color .08s ease,box-shadow .08s ease}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function closestOptOut(el) {
    return el.closest('[data-no-image-interaction], .nav-brand-img, .nav-brand, .site-logo, .card-thumbnail');
  }

  function originalBox(img) {
    var rect = img.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  function isReadyImage(img) {
    return img && img.tagName === 'IMG' && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0;
  }

  function enhanceImage(img) {
    if (!isReadyImage(img) || img.dataset.imageInteractionReady === 'true' || closestOptOut(img)) return;
    injectStyles();

    var box = document.createElement('span');
    box.className = 'image-interaction-box';
    box.tabIndex = 0;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', img.alt ? 'Interactive image: ' + img.alt : 'Interactive image: drag or resize');

    var original = originalBox(img);
    var state = {
      box: box,
      img: img,
      originalWidth: original.width,
      originalHeight: original.height,
      ratio: original.width / original.height,
      x: 0,
      y: 0,
      width: original.width,
      suppressNextClick: false,
      preOp: null
    };

    img.dataset.imageInteractionReady = 'true';
    img.draggable = false;
    img.parentNode.insertBefore(box, img);
    box.appendChild(img);
    box.style.width = original.width + 'px';
    box.__imageInteraction = state;

    ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
      var handle = document.createElement('span');
      handle.className = 'image-resize-handle';
      handle.dataset.corner = corner;
      handle.setAttribute('aria-hidden', 'true');
      box.appendChild(handle);
    });

    box.addEventListener('pointerdown', onPointerDown);
    box.addEventListener('dblclick', function (event) {
      event.preventDefault();
      event.stopPropagation();
      resetState(state);
    });
    box.addEventListener('keydown', onKeyDown);
    box.addEventListener('focus', function () { box.classList.add('is-focused'); select(state); });
    box.addEventListener('blur', function () { box.classList.remove('is-focused'); });
    img.addEventListener('dragstart', function (event) { event.preventDefault(); });
    img.addEventListener('click', function (event) {
      if (state.suppressNextClick || Date.now() - lastGestureEndedAt < 120) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.suppressNextClick = false;
      }
    }, true);
  }

  function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
  }

  function limits(state) {
    var minW = Math.max(DEFAULTS.minWidthPx, state.originalWidth * DEFAULTS.minOriginalScale);
    var maxW = Math.min(window.innerWidth * DEFAULTS.maxViewportWidthRatio, state.originalWidth * DEFAULTS.maxOriginalScale);
    var maxH = window.innerHeight * DEFAULTS.maxViewportHeightRatio;
    if (state.originalHeight > maxH) maxH = state.originalHeight;
    maxW = Math.min(maxW, maxH * state.ratio);
    return { minWidth: Math.min(minW, maxW), maxWidth: Math.max(minW, maxW) };
  }

  function clampPosition(state, x, y, width) {
    var height = width / state.ratio;
    var base = state.box.getBoundingClientRect();
    var left = base.left - state.x;
    var top = base.top - state.y;
    var margin = DEFAULTS.viewportMarginPx;
    var minVisible = DEFAULTS.minVisiblePx;
    var minX = Math.min(window.innerWidth - margin - minVisible - left, margin - left);
    var maxX = Math.max(window.innerWidth - margin - minVisible - left, window.innerWidth - margin - left - width);
    var minY = Math.min(window.innerHeight - margin - minVisible - top, margin - top);
    var maxY = Math.max(window.innerHeight - margin - minVisible - top, window.innerHeight - margin - top - height);
    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  }

  function applyState(state, opts) {
    opts = opts || {};
    var lim = limits(state);
    if (opts.width != null) state.width = clamp(opts.width, lim.minWidth, lim.maxWidth);
    if (opts.x != null) state.x = opts.x;
    if (opts.y != null) state.y = opts.y;
    var pos = clampPosition(state, state.x, state.y, state.width);
    state.x = pos.x;
    state.y = pos.y;
    state.box.style.width = state.width + 'px';
    state.box.style.setProperty('--ii-x', state.x + 'px');
    state.box.style.setProperty('--ii-y', state.y + 'px');
  }

  function resetState(state) {
    state.x = 0;
    state.y = 0;
    state.width = state.originalWidth;
    applyState(state);
  }

  function select(state) {
    if (selected && selected !== state) selected.box.classList.remove('is-selected');
    selected = state;
    state.box.classList.add('is-selected');
  }

  function deselect() {
    if (selected) selected.box.classList.remove('is-selected');
    selected = null;
  }

  function onPointerDown(event) {
    var state = this.__imageInteraction;
    if (!state || event.button > 0) return;
    select(state);
    var handle = event.target.closest('.image-resize-handle');
    var threshold = event.pointerType === 'touch' ? DEFAULTS.touchDragThresholdPx : DEFAULTS.dragThresholdPx;
    active = {
      state: state,
      mode: handle ? 'resize' : 'pending-drag',
      corner: handle ? handle.dataset.corner : null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      preOp: { x: state.x, y: state.y, width: state.width }
    };
    state.preOp = active.preOp;
    if (handle) {
      event.preventDefault();
      this.setPointerCapture(event.pointerId);
      this.classList.add('is-dragging');
    }

    function move(moveEvent) {
      if (!active || moveEvent.pointerId !== active.pointerId) return;
      var dx = moveEvent.clientX - active.startX;
      var dy = moveEvent.clientY - active.startY;
      if (!active.moved && Math.hypot(dx, dy) >= threshold) {
        active.moved = true;
        if (active.mode === 'pending-drag') active.mode = 'drag';
        state.box.setPointerCapture(moveEvent.pointerId);
        state.box.classList.add('is-dragging');
      }
      if (!active.moved) return;
      moveEvent.preventDefault();
      if (active.mode === 'drag') {
        applyState(state, { x: active.preOp.x + dx, y: active.preOp.y + dy });
      } else if (active.mode === 'resize') {
        resizeFromPointer(state, active, dx, dy);
      }
    }

    function end(endEvent) {
      if (active && endEvent.pointerId === active.pointerId) finishActive(active.moved);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    }

    function cancel(cancelEvent) {
      if (active && cancelEvent.pointerId === active.pointerId) cancelActive();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
  }

  function resizeFromPointer(state, op, dx, dy) {
    var signX = op.corner.indexOf('w') >= 0 ? -1 : 1;
    var width = op.preOp.width + dx * signX;
    var lim = limits(state);
    width = clamp(width, lim.minWidth, lim.maxWidth);
    var deltaW = width - op.preOp.width;
    var deltaH = deltaW / state.ratio;
    var x = op.preOp.x;
    var y = op.preOp.y;
    if (op.corner.indexOf('w') >= 0) x -= deltaW;
    if (op.corner.indexOf('n') >= 0) y -= deltaH;
    applyState(state, { x: x, y: y, width: width });
  }

  function finishActive(moved) {
    if (!active) return;
    active.state.box.classList.remove('is-dragging');
    if (moved) {
      active.state.suppressNextClick = true;
      lastGestureEndedAt = Date.now();
    }
    active.state.preOp = null;
    active = null;
  }

  function cancelActive() {
    if (!active) return;
    active.state.box.classList.remove('is-dragging');
    applyState(active.state, active.preOp);
    active.state.preOp = null;
    active = null;
  }

  function onKeyDown(event) {
    var state = this.__imageInteraction;
    if (!state) return;
    var handled = true;
    var move = event.shiftKey ? DEFAULTS.keyboardFineMovePx : DEFAULTS.keyboardMovePx;
    if (event.key === 'Escape') {
      if (active) cancelActive(); else deselect();
    } else if (event.key === 'r' || event.key === 'R') {
      resetState(state);
    } else if (event.key === 'ArrowLeft') {
      applyState(state, { x: state.x - move });
    } else if (event.key === 'ArrowRight') {
      applyState(state, { x: state.x + move });
    } else if (event.key === 'ArrowUp') {
      applyState(state, { y: state.y - move });
    } else if (event.key === 'ArrowDown') {
      applyState(state, { y: state.y + move });
    } else if (event.key === '+' || event.key === '=') {
      applyState(state, { width: state.width * (1 + DEFAULTS.keyboardResizeStep) });
    } else if (event.key === '-' || event.key === '_') {
      applyState(state, { width: state.width * (1 - DEFAULTS.keyboardResizeStep) });
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
      select(state);
    }
  }

  function init() {
    injectDragGuard();
    Array.prototype.forEach.call(document.querySelectorAll(DEFAULTS.selector), function (img) {
      if (isReadyImage(img)) enhanceImage(img);
      else if (img && img.tagName === 'IMG' && !closestOptOut(img)) img.addEventListener('load', function () { enhanceImage(img); }, { once: true });
    });
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('.image-interaction-box')) return;
    deselect();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && active) cancelActive();
  });
  window.addEventListener('blur', cancelActive);
  window.addEventListener('resize', function () {
    document.querySelectorAll('.image-interaction-box').forEach(function (box) {
      if (box.__imageInteraction) applyState(box.__imageInteraction);
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
