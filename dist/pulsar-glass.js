/*!
 * Pulsar Glass — Liquid Segmented Slider
 * Created by Mustafa Tıraş.
 *
 * Physics:
 *  · Apple Quintic Ease-Out : ease(p) = 1 - (1-p)^3.6 × (1 - 0.15p)
 *  · Dynamic flight duration : clamp(340, 310 + |Δx|×0.35, 440) ms
 *  · Rubber-band overdrag    : overshoot = M × (1 - e^(-d/R)), M=44 R=110
 *  · Hermite Smoothstep width morphing between buttons
 *  · Spring magnetic snap    : cubic-bezier(0.19, 1.35, 0.32, 1)
 *  · 6-layer optical glass with chromatic-aberration SVG filter
 *  · Underwater water-refraction SVG filter on labels during slide
 *
 * @version 1.0.0
 * @license MIT
 */
(function (root, factory) {
  /* UMD — supports CommonJS (Node / bundlers), AMD (RequireJS), and plain browser globals. */
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PulsarGlass = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** ID of the chromatic-aberration SVG filter applied to the glass lens. */
  var FILTER_LENS_ID  = 'pulsar-glass-refract';

  /** ID of the underwater / water-refraction SVG filter applied to labels. */
  var FILTER_WATER_ID = 'pulsar-glass-water';

  // ---------------------------------------------------------------------------
  // SVG Filter Injection (singleton)
  // ---------------------------------------------------------------------------

  /**
   * Injects both SVG filters into document.body exactly once.
   * Subsequent calls are no-ops (singleton guard via data attribute).
   *
   * Filter 1 — #pulsar-glass-refract  : chromatic aberration
   *   Splits SourceGraphic into R / G / B channels,
   *   shifts the R channel −2.5 px left and the B channel +2.5 px right,
   *   then screen-blends all three layers to reconstruct the image.
   *
   * Filter 2 — #pulsar-glass-water    : turbulent displacement
   *   feTurbulence fractalNoise → feDisplacementMap (scale 3.5).
   *   Applied to button labels while the slider is in flight to create the
   *   "glass underwater" distortion effect.
   */
  function ensureSvgFilters() {
    if (document.getElementById(FILTER_LENS_ID)) return; // already injected

    var NS   = 'http://www.w3.org/2000/svg';
    var svg  = document.createElementNS(NS, 'svg');

    // Keep the SVG out of the layout; it only serves as a filter host.
    svg.setAttribute('xmlns',   NS);
    svg.setAttribute('version', '1.1');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    svg.setAttribute('aria-hidden', 'true');

    // ── Filter 1 : Chromatic Aberration ──────────────────────────────────────
    var fLens = document.createElementNS(NS, 'filter');
    fLens.setAttribute('id',            FILTER_LENS_ID);
    fLens.setAttribute('x',             '-10%');
    fLens.setAttribute('y',             '-10%');
    fLens.setAttribute('width',         '120%');
    fLens.setAttribute('height',        '120%');
    fLens.setAttribute('color-interpolation-filters', 'sRGB');

    // --- Extract R channel ---
    var rMatrix = document.createElementNS(NS, 'feColorMatrix');
    rMatrix.setAttribute('in',     'SourceGraphic');
    rMatrix.setAttribute('type',   'matrix');
    // Keep R, zero out G and B, preserve A
    rMatrix.setAttribute('values', '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0');
    rMatrix.setAttribute('result', 'r-channel');

    var rOffset = document.createElementNS(NS, 'feOffset');
    rOffset.setAttribute('in',     'r-channel');
    rOffset.setAttribute('dx',     '-2.5');
    rOffset.setAttribute('dy',     '0');
    rOffset.setAttribute('result', 'r-shifted');

    // --- Extract G channel ---
    var gMatrix = document.createElementNS(NS, 'feColorMatrix');
    gMatrix.setAttribute('in',     'SourceGraphic');
    gMatrix.setAttribute('type',   'matrix');
    gMatrix.setAttribute('values', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0');
    gMatrix.setAttribute('result', 'g-channel');

    // G is unshifted — acts as the anchor plane

    // --- Extract B channel ---
    var bMatrix = document.createElementNS(NS, 'feColorMatrix');
    bMatrix.setAttribute('in',     'SourceGraphic');
    bMatrix.setAttribute('type',   'matrix');
    bMatrix.setAttribute('values', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0');
    bMatrix.setAttribute('result', 'b-channel');

    var bOffset = document.createElementNS(NS, 'feOffset');
    bOffset.setAttribute('in',     'b-channel');
    bOffset.setAttribute('dx',     '2.5');
    bOffset.setAttribute('dy',     '0');
    bOffset.setAttribute('result', 'b-shifted');

    // --- Screen-blend R + G ---
    var blendRG = document.createElementNS(NS, 'feBlend');
    blendRG.setAttribute('in',     'r-shifted');
    blendRG.setAttribute('in2',    'g-channel');
    blendRG.setAttribute('mode',   'screen');
    blendRG.setAttribute('result', 'rg-blend');

    // --- Screen-blend (R+G) + B ---
    var blendRGB = document.createElementNS(NS, 'feBlend');
    blendRGB.setAttribute('in',  'rg-blend');
    blendRGB.setAttribute('in2', 'b-shifted');
    blendRGB.setAttribute('mode', 'screen');

    fLens.appendChild(rMatrix);
    fLens.appendChild(rOffset);
    fLens.appendChild(gMatrix);
    fLens.appendChild(bMatrix);
    fLens.appendChild(bOffset);
    fLens.appendChild(blendRG);
    fLens.appendChild(blendRGB);

    // ── Filter 2 : Underwater Water Refraction ───────────────────────────────
    var fWater = document.createElementNS(NS, 'filter');
    fWater.setAttribute('id',      FILTER_WATER_ID);
    fWater.setAttribute('x',       '-5%');
    fWater.setAttribute('y',       '-5%');
    fWater.setAttribute('width',   '110%');
    fWater.setAttribute('height',  '110%');

    var turb = document.createElementNS(NS, 'feTurbulence');
    turb.setAttribute('type',          'fractalNoise');
    turb.setAttribute('baseFrequency', '0.035 0.05');
    turb.setAttribute('numOctaves',    '1');
    turb.setAttribute('seed',          '7');
    turb.setAttribute('result',        'noise');

    var disp = document.createElementNS(NS, 'feDisplacementMap');
    disp.setAttribute('in',            'SourceGraphic');
    disp.setAttribute('in2',           'noise');
    disp.setAttribute('scale',         '3.5');
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');

    fWater.appendChild(turb);
    fWater.appendChild(disp);

    svg.appendChild(fLens);
    svg.appendChild(fWater);

    // Prepend so it's available before any slider renders.
    document.body.insertBefore(svg, document.body.firstChild);
  }

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  /** Clamp a value between min and max. */
  function clamp(min, val, max) {
    return Math.min(max, Math.max(min, val));
  }

  /**
   * Apple Quintic Ease-Out.
   * A slightly softened quintic that settles with very gentle deceleration.
   * @param  {number} p  progress in [0, 1]
   * @return {number}    eased value in [0, 1]
   */
  function appleEase(p) {
    return 1 - Math.pow(1 - p, 3.6) * (1 - 0.15 * p);
  }

  /**
   * Hermite Smoothstep — smooth interpolation between two values.
   * @param  {number} edge0  lower edge
   * @param  {number} edge1  upper edge
   * @param  {number} x      input
   * @return {number}        smoothly interpolated result
   */
  function smoothstep(edge0, edge1, x) {
    var t = clamp(0, (x - edge0) / (edge1 - edge0), 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Read the current translateX of an element from its computed transform
   * matrix without forcing a layout reflow on any tracked metric.
   */
  function getTranslateX(el) {
    if (!el) return 0;
    var st = window.getComputedStyle(el);
    var tr = st.transform || st.webkitTransform || 'none';
    if (!tr || tr === 'none') return 0;
    if (typeof DOMMatrix !== 'undefined' || typeof WebKitCSSMatrix !== 'undefined') {
      try {
        var MatrixClass = window.DOMMatrix || window.WebKitCSSMatrix;
        var mat = new MatrixClass(tr);
        if (typeof mat.m41 === 'number' && !isNaN(mat.m41) && isFinite(mat.m41)) return mat.m41;
        if (typeof mat.e === 'number' && !isNaN(mat.e) && isFinite(mat.e)) return mat.e;
      } catch (err) {}
    }
    var m3d = tr.match(/matrix3d\(([^)]+)\)/);
    if (m3d) {
      var v3d = parseFloat(m3d[1].split(',')[12]);
      if (!isNaN(v3d) && isFinite(v3d)) return v3d;
    }
    var m = tr.match(/matrix\(([^)]+)\)/);
    if (m) {
      var v2d = parseFloat(m[1].split(',')[4]);
      if (!isNaN(v2d) && isFinite(v2d)) return v2d;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // PulsarGlassSlider
  // ---------------------------------------------------------------------------

  /**
   * @class PulsarGlassSlider
   *
   * The main class. Attach to any container that already has the required
   * DOM structure:
   *
   *   <div class="pg-track">
   *     <div class="pg-slider"><!-- the liquid glass pill --></div>
   *     <button class="pg-btn active"><span class="pg-label">Tab A</span></button>
   *     <button class="pg-btn"><span class="pg-label">Tab B</span></button>
   *   </div>
   *
   * @param {Element|string} containerElementOrSelector
   * @param {object}         options
   */
  function PulsarGlassSlider(containerElementOrSelector, options) {
    // Resolve container
    if (typeof containerElementOrSelector === 'string') {
      this.container = document.querySelector(containerElementOrSelector);
    } else {
      this.container = containerElementOrSelector;
    }

    if (!this.container) {
      console.warn('[PulsarGlass] Container element not found: ' + containerElementOrSelector);
      return;
    }

    // Merge user options with defaults
    this.opts = Object.assign({
      trackSelector:         '.pg-track',
      sliderSelector:        '.pg-slider',
      buttonSelector:        '.pg-btn',
      labelSelector:         '.pg-label',
      activeClass:           'active',
      maxOvershoot:          44,
      pullResistance:        110,
      flightDurationBase:    310,
      flightDurationScale:   0.35,
      flightDurationMin:     340,
      flightDurationMax:     440,
      enableRefraction:      true,
      enableWaterRefraction: true,
      onSelect:              null,
      onChange:              null,
    }, options || {});

    // Internal state
    this._metrics         = [];          // cached button geometry
    this._animId          = null;        // current rAF id
    this._dragRafId       = null;        // drag rAF id
    this._isAnimating     = false;
    this._isDragging      = false;
    this._hasDragged      = false;
    this._debounceTimer   = null;
    this._resizeObserver  = null;
    this._currentScale    = 1;
    this._pointerStartX   = 0;
    this._pointerLastX    = 0;
    this._pointerLastTime = 0;
    this._velocityX       = 0;
    this._dragNeedsRaf    = false;
    this._currentSliderX  = 0;          // live X during drag

    // Bind handlers so we can remove them later
    this._onPointerDown   = this._pointerDown.bind(this);
    this._onPointerMove   = this._pointerMove.bind(this);
    this._onPointerUp     = this._pointerUp.bind(this);
    this._onPointerCancel = this._pointerUp.bind(this);
    this._onResize        = this._handleResize.bind(this);

    this._init();
  }

  // ── Prototype ──────────────────────────────────────────────────────────────

  PulsarGlassSlider.prototype = {

    constructor: PulsarGlassSlider,

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    _init: function () {
      var o = this.opts;

      // Resolve sub-elements
      this.track   = this.container.querySelector(o.trackSelector)  || this.container;
      this.slider  = this.container.querySelector(o.sliderSelector);
      this.buttons = Array.prototype.slice.call(
        this.container.querySelectorAll(o.buttonSelector)
      );

      if (!this.slider || this.buttons.length === 0) {
        console.warn('[PulsarGlass] No slider or buttons found. Check your selectors.');
        return;
      }

      // Inject SVG filters once
      if (o.enableRefraction || o.enableWaterRefraction) {
        ensureSvgFilters();
      }

      // Measure button geometry (cached — zero reflow during animation)
      this._measureMetrics();

      // Attach button click listeners
      var self = this;
      this.buttons.forEach(function (btn) {
        btn.__pgClickHandler = function (e) {
          // Skip synthetic tap events if a drag just ended or pointerUp already handled the tap
          if (self._hasDragged || self._tapHandled) return;
          self._handleButtonClick(btn, false);
        };
        btn.addEventListener('click', btn.__pgClickHandler);
      });

      // Pointer events on the slider pill itself for drag
      this.slider.addEventListener('pointerdown', this._onPointerDown);
      // Also handle clicks on the track (for buttons behind the pill)
      this.track.addEventListener('pointerdown', this._onPointerDown);

      // ResizeObserver for layout changes
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(this._onResize);
        this._resizeObserver.observe(this.track);
      } else {
        window.addEventListener('resize', this._onResize);
      }

      // Snap slider to active button with multi-frame settling
      var self = this;
      function settle() {
        self._measureMetrics();
        var active = self._getActiveButton();
        if (active) self._moveSliderToButton(active, false);
      }
      requestAnimationFrame(settle);
      setTimeout(settle, 40);
      setTimeout(settle, 120);
      setTimeout(settle, 300);
    },

    // ── Geometry Cache ─────────────────────────────────────────────────────────

    /**
     * Measure and cache `{btn, label, left, width, right, center}` for every
     * button relative to the track's left edge. Must be called once at init
     * and again after any resize. During animation we read only from this cache
     * — zero layout reflows.
     */
    _measureMetrics: function () {
      var trackRect  = this.track.getBoundingClientRect();
      var clientLeft = this.track.clientLeft || 0;
      var o          = this.opts;

      this._metrics = this.buttons.map(function (btn) {
        var r     = btn.getBoundingClientRect();
        var left  = r.left - (trackRect.left + clientLeft);
        var width = r.width;
        var label = btn.querySelector(o.labelSelector) || null;
        return {
          btn:    btn,
          label:  label,
          left:   left,
          width:  width,
          right:  left + width,
          center: left + width / 2,
        };
      });

      // Cache slider height for transform calculations
      this._sliderH = this.slider.getBoundingClientRect().height || 36;
    },

    // ── Refraction Helpers ─────────────────────────────────────────────────────

    /** Apply the lens (chromatic aberration) filter to the slider pill. */
    _enableRefract: function () {
      if (!this.opts.enableRefraction) return;
      this.slider.classList.add('pg-has-refract');
    },

    /** Remove all refraction / illumination state. */
    _disableRefract: function () {
      this.slider.classList.remove('pg-has-refract');
      this._metrics.forEach(function (m) {
        if (m.label) m.label.classList.remove('pg-refracting');
        m.btn.classList.remove('pg-illuminated');
      });
    },

    /**
     * Overlap-based per-frame refraction update.
     * A label gets `pg-refracting` when the slider overlaps it by >8 px.
     * A button gets `pg-illuminated` when the slider covers >35% of its width.
     *
     * @param {number} sliderLeft   current left edge of slider (track coords)
     * @param {number} sliderRight  current right edge of slider (track coords)
     */
    _updateRefraction: function (sliderLeft, sliderRight) {
      var o = this.opts;
      this._metrics.forEach(function (m) {
        var overlapLeft  = Math.max(sliderLeft,  m.left);
        var overlapRight = Math.min(sliderRight, m.right);
        var overlap      = Math.max(0, overlapRight - overlapLeft);

        // Water refraction on label
        if (m.label && o.enableWaterRefraction) {
          if (overlap > 8) {
            m.label.classList.add('pg-refracting');
          } else {
            m.label.classList.remove('pg-refracting');
          }
        }

        // Illumination on button
        var dominance = m.width > 0 ? overlap / m.width : 0;
        if (dominance > 0.35) {
          m.btn.classList.add('pg-illuminated');
        } else {
          m.btn.classList.remove('pg-illuminated');
        }
      });
    },

    // ── Active Button ──────────────────────────────────────────────────────────

    /** Returns the button with `activeClass`, or the first button as fallback. */
    _getActiveButton: function () {
      var o = this.opts;
      for (var i = 0; i < this.buttons.length; i++) {
        if (this.buttons[i].classList.contains(o.activeClass)) {
          return this.buttons[i];
        }
      }
      return this.buttons[0] || null;
    },

    // ── Flight Animation ───────────────────────────────────────────────────────

    /**
     * Animate the slider pill from its current position to `targetBtn` using
     * the Apple Quintic Ease-Out curve with volume expansion, stretch, and skew.
     *
     * @param {Element}  targetBtn
     * @param {Function} [onComplete]
     */
    _animateSliderFlight: function (targetBtn, onComplete) {
      var self    = this;
      var o       = self.opts;
      var slider  = self.slider;

      // Cancel any existing flight
      if (self._animId) {
        cancelAnimationFrame(self._animId);
        self._animId = null;
      }

      // Snapshot start position from live transform (no layout read for metrics)
      var startLeft  = getTranslateX(slider);

      // Find target metrics
      var targetM = null;
      for (var i = 0; i < self._metrics.length; i++) {
        if (self._metrics[i].btn === targetBtn) {
          targetM = self._metrics[i];
          break;
        }
      }
      if (!targetM) { if (onComplete) onComplete(); return; }

      var targetLeft  = targetM.left;
      var targetWidth = targetM.width;
      var startWidth  = parseFloat(slider.style.width) || targetWidth;
      var distance    = targetLeft - startLeft;
      var dir         = distance >= 0 ? 1 : -1;
      var absDist     = Math.abs(distance);

      // Ensure slider is visible
      slider.style.opacity = '1';

      // Dynamic flight duration — shorter for small hops, capped for long jumps
      var duration = clamp(
        o.flightDurationMin,
        o.flightDurationBase + absDist * o.flightDurationScale,
        o.flightDurationMax
      );

      self._isAnimating = true;
      slider.classList.add('pg-in-flight');
      self._enableRefract();

      // Remove any spring transition that may be lingering from a previous snap
      slider.style.transition = 'none';

      var startTime = null;

      function frame(ts) {
        if (!startTime) startTime = ts;
        var elapsed = ts - startTime;
        var p       = clamp(0, elapsed / duration, 1);

        // Apple Quintic Ease-Out
        var ease = appleEase(p);

        // Sinusoidal arc drives the mid-flight expansion
        var arc  = Math.sin(p * Math.PI);

        // Volume expansion: pill grows 16% at the apex of the arc
        var scale   = 1 + arc * 0.16;
        // Additional horizontal stretch / vertical squash for speed feel
        var stretch = 1 + arc * 0.10;
        var scaleX  = scale * stretch;
        var scaleY  = scale / stretch;

        // Aerodynamic skew — leans forward in the direction of travel
        var skewDeg = -dir * arc * 2.8;

        // Interpolate position and width
        var curX = startLeft + distance * ease;
        var curW = startWidth + (targetWidth - startWidth) * ease;
        self._currentSliderX = curX;

        // Apply transform (translateX + scaleX/Y + skewX)
        slider.style.transform =
          'translateX(' + curX + 'px) scaleX(' + scaleX + ') scaleY(' + scaleY + ') skewX(' + skewDeg + 'deg)';
        slider.style.width = curW + 'px';

        // Per-frame refraction overlap
        var halfExtraW = (curW * scaleX - curW) / 2;
        self._updateRefraction(curX - halfExtraW, curX + curW + halfExtraW);

        if (p < 1) {
          self._animId = requestAnimationFrame(frame);
        } else {
          // ── Flight complete — apply spring magnetic snap ──────────────────
          self._animId   = null;
          self._isAnimating = false;

          // Spring overshoot settle: cubic-bezier(0.19, 1.35, 0.32, 1)
          slider.style.transition =
            'transform 0.44s cubic-bezier(0.19, 1.35, 0.32, 1), width 0.44s cubic-bezier(0.19, 1.35, 0.32, 1)';

          slider.classList.add('pg-releasing');
          slider.classList.remove('pg-pressed', 'pg-in-flight');

          // Settle cleanly at target
          slider.style.transform = 'translateX(' + targetLeft + 'px) scaleX(1) scaleY(1) skewX(0deg)';
          slider.style.width     = targetWidth + 'px';
          self._currentSliderX   = targetLeft;

          // After spring settles (~440 ms) clean up cosmetic state
          setTimeout(function () {
            slider.classList.remove('pg-releasing', 'pg-overshooting');
            self._disableRefract();

            if (typeof onComplete === 'function') onComplete();
          }, 460);
        }
      }

      self._animId = requestAnimationFrame(frame);
    },

    // ── Instant / Animated Move ────────────────────────────────────────────────

    /**
     * Move the slider pill to `btn`, with or without animation.
     * @param {Element} btn
     * @param {boolean} animate
     */
    _moveSliderToButton: function (btn, animate) {
      var m = null;
      for (var i = 0; i < this._metrics.length; i++) {
        if (this._metrics[i].btn === btn) { m = this._metrics[i]; break; }
      }
      if (!m) return;

      if (animate) {
        this._animateSliderFlight(btn);
      } else {
        // Instant snap — kill any running animation first
        if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
        var targetLeft  = m.left;
        var targetWidth = m.width;

        this.slider.style.transition = 'none';
        this.slider.style.transformOrigin = 'center center';
        this.slider.style.borderRadius = '';
        this.slider.style.transform  = 'translateX(' + targetLeft.toFixed(1) + 'px) scale(1) skewX(0deg)';
        this.slider.style.width      = targetWidth.toFixed(1) + 'px';
        this.slider.style.opacity    = '1';
        this._currentSliderX         = targetLeft;
        this._disableRefract();
        this.slider.classList.remove('pg-in-flight', 'pg-releasing', 'pg-pressed', 'pg-overshooting');
      }
    },

    // ── Button Click Handler ───────────────────────────────────────────────────

    /**
     * Handles selecting a button — either via a real click or a synthetic one
     * fired by the drag-release logic.
     *
     * Micro-rebound on same-button tap: scale 0.96 → 1.0 via 120ms → 360ms.
     * Debounce: 150 ms guard to prevent double-fire on rapid taps.
     *
     * @param {Element} btn
     * @param {boolean} triggerNative  — if true the click came from pointer logic
     */
    _handleButtonClick: function (btn, triggerNative) {
      if (!btn) return;
      var self = this;
      var o    = self.opts;

      // 150 ms debounce for rapid clicks (skip debounce on drag release)
      if (!triggerNative) {
        if (self._debounceTimer) return;
        self._debounceTimer = setTimeout(function () { self._debounceTimer = null; }, 150);
      }

      var isSameButton = btn.classList.contains(o.activeClass);

      // Update active class
      self.buttons.forEach(function (b) { b.classList.remove(o.activeClass); });
      btn.classList.add(o.activeClass);

      var idx   = self.buttons.indexOf(btn);
      var value = (btn.dataset && btn.dataset.value !== undefined)
        ? btn.dataset.value
        : (btn.getAttribute('data-value') !== null ? btn.getAttribute('data-value') : idx);

      // Fire onSelect immediately upon selection (both tap and drag release)
      if (typeof o.onSelect === 'function') {
        o.onSelect(idx, value, btn);
      }

      // If triggered by drag release: smoothly magnetic-snap from current dragged position to button
      if (triggerNative) {
        var targetM = null;
        for (var i = 0; i < self._metrics.length; i++) {
          if (self._metrics[i].btn === btn) { targetM = self._metrics[i]; break; }
        }
        if (!targetM) return;

        var targetLeft  = targetM.left;
        var targetWidth = targetM.width;

        self.slider.style.transition =
          'transform 0.38s cubic-bezier(0.19, 1.35, 0.32, 1), width 0.38s cubic-bezier(0.19, 1.35, 0.32, 1)';
        self.slider.classList.add('pg-releasing');
        self.slider.classList.remove('pg-pressed', 'pg-in-flight', 'pg-overshooting');

        self.slider.style.transform = 'translateX(' + targetLeft.toFixed(1) + 'px) scaleX(1) scaleY(1) skewX(0deg)';
        self.slider.style.width     = targetWidth.toFixed(1) + 'px';
        self._currentSliderX        = targetLeft;
        self._updateRefraction(targetLeft, targetLeft + targetWidth);

        setTimeout(function () {
          self.slider.classList.remove('pg-releasing');
          self._disableRefract();

          if (typeof o.onChange === 'function') {
            o.onChange(idx, value, btn);
          }
          if (o.dotNetHelper && typeof o.dotNetHelper.invokeMethodAsync === 'function') {
            o.dotNetHelper.invokeMethodAsync('OnJsSelectionChanged', idx, String(value));
          }
        }, 380);
        return;
      }

      if (isSameButton && !self._isAnimating) {
        // Micro-rebound: momentary press squish on same button
        self.slider.classList.add('pg-pressed');
        self.slider.style.transition = 'transform 0.12s ease-in';
        var m = null;
        for (var j = 0; j < self._metrics.length; j++) {
          if (self._metrics[j].btn === btn) { m = self._metrics[j]; break; }
        }
        if (m) {
          self.slider.style.transform = 'translateX(' + m.left + 'px) scaleX(0.96) scaleY(0.96)';
          setTimeout(function () {
            self.slider.style.transition = 'transform 0.36s cubic-bezier(0.19, 1.35, 0.32, 1)';
            self.slider.style.transform  = 'translateX(' + m.left + 'px) scaleX(1) scaleY(1)';
            setTimeout(function () { self.slider.classList.remove('pg-pressed'); }, 380);
          }, 130);
        }
        return; // no need to fly anywhere
      }

      // Full animated flight to the new button (for tap gestures)
      self._animateSliderFlight(btn, function () {
        // Fire onChange after the spring settles
        if (typeof o.onChange === 'function') {
          o.onChange(idx, value, btn);
        }
        if (o.dotNetHelper && typeof o.dotNetHelper.invokeMethodAsync === 'function') {
          o.dotNetHelper.invokeMethodAsync('OnJsSelectionChanged', idx, String(value));
        }
      });
    },

    // ── Drag Physics ───────────────────────────────────────────────────────────

    /**
     * rAF-throttled drag update called from _pointerMove.
     * Applies rubber-band resistance on overdrag, Hermite width morphing,
     * and live refraction / illumination.
     */
    _processDragUpdate: function () {
      var self   = this;
      self._dragNeedsRaf = false;

      if (!self._isDragging) return;

      var o           = self.opts;
      var rawX        = self._currentSliderX;   // desired slider left (track coords)
      var metrics     = self._metrics;
      var firstM      = metrics[0];
      var lastM       = metrics[metrics.length - 1];

      // Track limits
      var minLeft = firstM.left;
      var maxLeft = lastM.left;

      // Compute over-pull distance and apply exponential rubber-banding
      var pullDist = 0;
      var clampedX = rawX;

      if (rawX < minLeft) {
        pullDist = minLeft - rawX;
        clampedX = minLeft - o.maxOvershoot * (1 - Math.exp(-pullDist / o.pullResistance));
      } else if (rawX > maxLeft) {
        pullDist = rawX - maxLeft;
        clampedX = maxLeft + o.maxOvershoot * (1 - Math.exp(-pullDist / o.pullResistance));
      }

      var tensionRatio = clamp(0, Math.abs(clampedX - clamp(minLeft, rawX, maxLeft)) / o.maxOvershoot, 1);

      // Scale eases toward 1.16 while dragging
      self._currentScale += (1.16 - self._currentScale) * 0.28;

      // Squish from velocity (capped at 12% squish)
      var speed  = Math.abs(self._velocityX);
      var squish = Math.min(speed * 0.01, 0.12);

      // Rubber-band stretch / squash
      var stretchX = 1 + tensionRatio * 0.20;
      var squashY  = 1 - tensionRatio * 0.10;
      var scaleX   = self._currentScale * (1 - squish) * stretchX;
      var scaleY   = self._currentScale * squashY;

      // Skew leans in the direction of the overshoot
      var overshootDir = rawX < minLeft ? -1 : 1;
      var skewDeg      = tensionRatio > 0.01 ? overshootDir * tensionRatio * 3.5 : 0;

      // ── Smoothstep width morphing between adjacent buttons ─────────────────
      // Find the two buttons whose ranges bracket clampedX
      var curW = null;
      var mx   = clampedX;

      for (var i = 0; i < metrics.length - 1; i++) {
        var m1 = metrics[i];
        var m2 = metrics[i + 1];
        if (mx >= m1.left && mx <= m2.left) {
          var mu     = (mx - m1.left) / (m2.left - m1.left);
          var smooth = smoothstep(0, 1, mu);
          curW = m1.width + (m2.width - m1.width) * smooth;
          break;
        }
      }
      // Clamp to edge buttons
      if (curW === null) {
        if (mx <= firstM.left) curW = firstM.width;
        else curW = lastM.width;
      }

      // Apply transform — no style.left, only translateX (zero layout thrashing)
      self.slider.style.transform =
        'translateX(' + clampedX + 'px) scaleX(' + scaleX + ') scaleY(' + scaleY + ') skewX(' + skewDeg + 'deg)';
      self.slider.style.width = curW + 'px';

      // Overshooting class
      if (tensionRatio > 0.05) {
        self.slider.classList.add('pg-overshooting');
      } else {
        self.slider.classList.remove('pg-overshooting');
      }

      // Live overlap refraction
      var halfExtraW = (curW * scaleX - curW) / 2;
      self._updateRefraction(clampedX - halfExtraW, clampedX + curW + halfExtraW);
    },

    // ── Pointer Handlers ───────────────────────────────────────────────────────

    _pointerDown: function (e) {
      // Only handle primary pointer (left mouse / first touch)
      if (e.button !== undefined && e.button !== 0) return;
      if (e.stopPropagation) e.stopPropagation();

      this._isDragging      = false;
      this._hasDragged      = false;
      this._pointerStartX   = e.clientX;
      this._pointerLastX    = e.clientX;
      this._pointerLastTime = e.timeStamp;
      this._velocityX       = 0;
      this._currentScale    = 1;

      // Ensure metrics are ready
      if (!this._metrics || this._metrics.length === 0) {
        this._measureMetrics();
      }

      // Check current active button metric
      var activeBtn = this._getActiveButton();
      var activeM = null;
      if (this._metrics) {
        for (var k = 0; k < this._metrics.length; k++) {
          if (this._metrics[k].btn === activeBtn) { activeM = this._metrics[k]; break; }
        }
      }

      // Check if user tapped directly on a specific button to start drag
      var targetBtn = e.target ? e.target.closest(this.opts.buttonSelector) : null;
      var targetM = null;
      if (targetBtn && this._metrics) {
        for (var j = 0; j < this._metrics.length; j++) {
          if (this._metrics[j].btn === targetBtn) { targetM = this._metrics[j]; break; }
        }
      }

      // Read current slider position
      var domX = getTranslateX(this.slider);
      var currentStoredX = (typeof this._currentSliderX === 'number' && !isNaN(this._currentSliderX) && isFinite(this._currentSliderX)) ? this._currentSliderX : null;
      var activeLeft = activeM ? activeM.left : 0;

      // If user tapped directly on a different button, anchor drag to that button
      if (targetM && targetBtn !== activeBtn) {
        this._dragOriginX = targetM.left;
      } else if (typeof domX === 'number' && !isNaN(domX) && isFinite(domX) && domX > 0) {
        this._dragOriginX = domX;
      } else if (currentStoredX !== null && currentStoredX > 0) {
        this._dragOriginX = currentStoredX;
      } else {
        this._dragOriginX = activeLeft;
      }
      this._currentSliderX  = this._dragOriginX;

      // Kill any in-progress animation so drag takes over
      if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
      this.slider.style.transition = 'none';
      this.slider.classList.add('pg-pressed');

      // Listen for move / up on the document to catch events outside the element
      document.addEventListener('pointermove',   this._onPointerMove);
      document.addEventListener('pointerup',     this._onPointerUp);
      document.addEventListener('pointercancel', this._onPointerCancel);
    },

    _pointerMove: function (e) {
      var dx = e.clientX - this._pointerStartX;

      // 4 px dead-zone separates tap from intentional drag
      if (!this._isDragging && Math.abs(dx) < 4) return;

      if (!this._isDragging) {
        // First threshold crossing — start drag
        this._isDragging = true;
        this._hasDragged = true;

        // Pointer capture on track
        try { this.track.setPointerCapture(e.pointerId); } catch (_) {}

        this._isAnimating = false;
        this._enableRefract();
        this.slider.classList.add('pg-in-flight');
        this.slider.classList.remove('pg-releasing');
      }

      // Velocity tracking (px/frame ≈ px per 16 ms)
      var dt           = Math.max(1, e.timeStamp - this._pointerLastTime);
      this._velocityX  = ((e.clientX - this._pointerLastX) / dt) * 16;
      this._pointerLastX    = e.clientX;
      this._pointerLastTime = e.timeStamp;

      // Cleanly derive current slider X from drag origin + pointer delta
      this._currentSliderX = this._dragOriginX + dx;

      // Schedule rAF-throttled physics update
      if (!this._dragNeedsRaf) {
        this._dragNeedsRaf = true;
        var self = this;
        this._dragRafId = requestAnimationFrame(function () { self._processDragUpdate(); });
      }
    },

    _pointerUp: function (e) {
      document.removeEventListener('pointermove',   this._onPointerMove);
      document.removeEventListener('pointerup',     this._onPointerUp);
      document.removeEventListener('pointercancel', this._onPointerCancel);

      // Release pointer capture
      try { this.track.releasePointerCapture(e.pointerId); } catch (_) {}
      this.slider.classList.remove('pg-pressed', 'pg-in-flight', 'pg-overshooting');

      if (!this._isDragging) {
        // It was a tap — find which button was tapped
        var tapX       = e.clientX;
        var trackR     = this.track.getBoundingClientRect();
        var clientLeft = this.track.clientLeft || 0;
        var localX     = tapX - (trackR.left + clientLeft);
        var closest    = this._findNearestButtonToX(localX);

        if (closest) {
          var self = this;
          self._tapHandled = true;
          setTimeout(function () { self._tapHandled = false; }, 120);
          this._handleButtonClick(closest, false);
        }
        return;
      }

      this._isDragging = false;

      // Find nearest button by center distance to current slider position
      var currentX  = this._currentSliderX;
      var sliderW   = this.slider.offsetWidth || parseFloat(this.slider.style.width) || (this._metrics && this._metrics[0] ? this._metrics[0].width : 0);
      var targetBtn = this._findNearestButtonToX(currentX + sliderW / 2);

      var self = this;
      if (targetBtn) {
        this._handleButtonClick(targetBtn, true);
      } else {
        var active = this._getActiveButton();
        if (active) this._moveSliderToButton(active, true);
      }

      // Clear hasDragged after a brief grace period to avoid click-skip
      setTimeout(function () { self._hasDragged = false; }, 200);
    },

    /**
     * Find the button whose center is closest to `x` (track-relative).
     * @param  {number} x
     * @return {Element}
     */
    _findNearestButtonToX: function (x) {
      if (!this._metrics || this._metrics.length === 0) return null;
      var best   = null;
      var bestD  = Infinity;
      for (var i = 0; i < this._metrics.length; i++) {
        var d = Math.abs(this._metrics[i].center - x);
        if (d < bestD) { bestD = d; best = this._metrics[i].btn; }
      }
      return best;
    },

    // ── Resize ─────────────────────────────────────────────────────────────────

    _handleResize: function () {
      if (this._isDragging) return;
      // Re-measure geometry and re-snap (no animation) to stay correct
      this._measureMetrics();
      var active = this._getActiveButton();
      this._moveSliderToButton(active, false);
    },

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Programmatically select a tab by zero-based index.
     * @param {number}  index
     * @param {boolean} [animate=true]
     */
    selectIndex: function (index, animate) {
      var btn = this.buttons[index];
      if (!btn) return;
      this.buttons.forEach(function (b) { b.classList.remove(this.opts.activeClass); }, this);
      btn.classList.add(this.opts.activeClass);
      this._moveSliderToButton(btn, animate !== false);
    },

    /**
     * Programmatically select a tab by its `data-value` attribute.
     * @param {string}  value
     * @param {boolean} [animate=true]
     */
    selectByValue: function (value, animate) {
      for (var i = 0; i < this.buttons.length; i++) {
        var btn = this.buttons[i];
        var v   = btn.dataset ? btn.dataset.value : btn.getAttribute('data-value');
        if (String(v) === String(value)) {
          this.selectIndex(i, animate);
          return;
        }
      }
      console.warn('[PulsarGlass] No button found with data-value="' + value + '"');
    },

    /**
     * Re-measure geometry and reposition the slider.
     * Call after dynamically adding / removing buttons or resizing the container.
     */
    refresh: function () {
      this._measureMetrics();
      if (this._isDragging) return;
      var active = this._getActiveButton();
      this._moveSliderToButton(active, false);
    },

    /**
     * Tear down all event listeners and cancel any running animation.
     * Does not remove DOM elements — the host application is responsible for
     * cleaning up the container.
     */
    destroy: function () {
      // Cancel rAF loops
      if (this._animId)    { cancelAnimationFrame(this._animId);    this._animId    = null; }
      if (this._dragRafId) { cancelAnimationFrame(this._dragRafId); this._dragRafId = null; }

      // Remove button listeners
      this.buttons.forEach(function (btn) {
        if (btn.__pgClickHandler) {
          btn.removeEventListener('click', btn.__pgClickHandler);
          delete btn.__pgClickHandler;
        }
      });

      // Remove pointer listeners
      this.slider.removeEventListener('pointerdown', this._onPointerDown);
      this.track.removeEventListener('pointerdown',  this._onPointerDown);
      document.removeEventListener('pointermove',    this._onPointerMove);
      document.removeEventListener('pointerup',      this._onPointerUp);
      document.removeEventListener('pointercancel',  this._onPointerCancel);

      // Remove resize listener
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      } else {
        window.removeEventListener('resize', this._onResize);
      }

      // Reset slider style to avoid phantom transforms
      this.slider.style.transition = '';
      this.slider.style.transform  = '';
      this.slider.style.width      = '';
      this._disableRefract();
    },
  };

  // ---------------------------------------------------------------------------
  // Module Exports
  // ---------------------------------------------------------------------------

  /**
   * Module API surface:
   *   PulsarGlass.create(selector, options) — factory shorthand
   *   PulsarGlass.PulsarGlassSlider         — class for subclassing / instanceof
   *   PulsarGlass.ensureSvgFilters          — inject filters without a slider
   *   PulsarGlass.FILTER_LENS_ID            — constant
   *   PulsarGlass.FILTER_WATER_ID           — constant
   */
  return {
    /**
     * Convenience factory — equivalent to `new PulsarGlassSlider(selector, opts)`.
     * @param  {Element|string} selector
     * @param  {object}         [options]
     * @return {PulsarGlassSlider}
     */
    create: function (selector, options) {
      var inst = new PulsarGlassSlider(selector, options);
      return inst.container ? inst : null;
    },

    PulsarGlassSlider: PulsarGlassSlider,
    ensureSvgFilters:  ensureSvgFilters,
    FILTER_LENS_ID:    FILTER_LENS_ID,
    FILTER_WATER_ID:   FILTER_WATER_ID,
  };
}));
