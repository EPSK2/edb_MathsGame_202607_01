(function () {
  const OVERLAY_ID = "prepOverlay";

  const FRUIT_ORDER = [
    "Grape",
    "WhitePeach",
    "Watermelon",
    "Orange",
    "Pineapple",
    "Strawberry",
  ];

  const FRUIT_EMOJI = {
    Grape: "🍇",
    WhitePeach: "🍑",
    Watermelon: "🍉",
    Orange: "🍊",
    Pineapple: "🍍",
    Strawberry: "🍓",
  };

  let marqueeState = null;
  let waitAudio = null;
  let bgMusicAudio = null;

    function playWaitVoiceOnce() {
    try {
      if (!waitAudio) {
        waitAudio = new Audio("voice_human_wait.mp3");
        waitAudio.preload = "auto";
      }
      waitAudio.currentTime = 0;
      waitAudio.play().catch(function () {});
    } catch (_) {}
  }

  function stopWaitVoice() {
    try {
      if (waitAudio) {
        waitAudio.pause();
        waitAudio.currentTime = 0;
      }
    } catch (_) {}
  }

  function playPrepBgMusicLoop() {
    try {
      if (!bgMusicAudio) {
        bgMusicAudio = new Audio("happinessinmusic-playground-352381.mp3");
        bgMusicAudio.loop = true;
        bgMusicAudio.preload = "auto";
        bgMusicAudio.volume = 0.15;
      }
      bgMusicAudio.currentTime = 0;
      bgMusicAudio.play().catch(function () {});
    } catch (_) {}
  }


  function stopPrepBgMusicLoop() {
    try {
      if (bgMusicAudio) {
        bgMusicAudio.pause();
        bgMusicAudio.currentTime = 0;
      }
    } catch (_) {}
  }

  function normalizeDirection(directionValue) {
    if (directionValue === 1 || directionValue === "right") return "right";
    if (directionValue === -1 || directionValue === "left") return "left";
    return "left";
  }

  function getSelectedFruitName(fruitName) {
    const normalizedName =
      typeof fruitName === "string" && fruitName.length ? fruitName.trim() : "";

    if (!normalizedName) {
      return "";
    }

    const found = FRUIT_ORDER.find(function (name) {
      return name.toLowerCase() === normalizedName.toLowerCase();
    });

    return found || "";
  }

  function ensureOverlay(message) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      overlay.className = "prep-overlay";

      const main = document.createElement("div");
      main.className = "prep-overlay-main";
      overlay.appendChild(main);

      const msg = document.createElement("div");
      msg.className = "prep-overlay-message";
      main.appendChild(msg);

      const strip = document.createElement("div");
      strip.className = "prep-fruit-strip";
      overlay.appendChild(strip);

      document.body.appendChild(overlay);
    }

    const msgEl = overlay.querySelector(".prep-overlay-message");
    if (msgEl) {
      msgEl.textContent =
        typeof message === "string" && message.length > 0
          ? message
          : "遊戲載入中，請稍後...";
    }

    return overlay;
  }

  function createMarqueeRow(selectedFruitName) {
    const row = document.createElement("div");
    row.className = "prep-fruit-marquee-row";

    for (const name of FRUIT_ORDER) {
      const span = document.createElement("span");
      span.className = "prep-fruit";
      if (selectedFruitName && name === selectedFruitName) {
        span.classList.add("is-selected");
      }
      span.dataset.fruitName = name;
      span.textContent = FRUIT_EMOJI[name] || name;
      row.appendChild(span);
    }

    return row;
  }

  function stopMarqueeLoop() {
    if (!marqueeState) return;
    if (marqueeState.rafId) {
      window.cancelAnimationFrame(marqueeState.rafId);
    }
    marqueeState = null;
  }

  function appendMarqueeChunk(track, selectedFruitName) {
    const chunk = createMarqueeRow(selectedFruitName);
    track.appendChild(chunk);
    return chunk;
  }

  function prependMarqueeChunk(track, selectedFruitName) {
    const chunk = createMarqueeRow(selectedFruitName);
    track.insertBefore(chunk, track.firstChild);
    return chunk;
  }

  function setupMarqueeEffect(strip, selectedFruitName, options) {
    stopMarqueeLoop();
    strip.innerHTML = "";
    strip.classList.add("is-marquee");

    const directionValue =
      options && Object.prototype.hasOwnProperty.call(options, "direction")
        ? options.direction
        : window.prepOverlayDirection;
    const direction = normalizeDirection(directionValue);

    const speedPxPerSecond =
      options && typeof options.speedPxPerSecond === "number"
        ? options.speedPxPerSecond
        : 240;

    const track = document.createElement("div");
    track.className = "prep-fruit-marquee-track";
    strip.appendChild(track);

    while (track.scrollWidth < strip.clientWidth * 1.5) {
      appendMarqueeChunk(track, selectedFruitName);
    }

    const state = {
      strip: strip,
      track: track,
      direction: direction,
      selectedFruitName: selectedFruitName,
      speedPxPerSecond: speedPxPerSecond,
      offsetX: 0,
      lastTimestamp: 0,
      rafId: 0,
    };

    marqueeState = state;

    function step(timestamp) {
      if (!marqueeState || marqueeState !== state) {
        return;
      }

      if (!state.lastTimestamp) {
        state.lastTimestamp = timestamp;
      }
      const dt = (timestamp - state.lastTimestamp) / 1000;
      state.lastTimestamp = timestamp;

      if (state.direction === "right") {
        state.offsetX += state.speedPxPerSecond * dt;
      } else {
        state.offsetX -= state.speedPxPerSecond * dt;
      }

      state.track.style.transform = "translateX(" + state.offsetX + "px)";

      const stripRect = state.strip.getBoundingClientRect();
      const trackRect = state.track.getBoundingClientRect();

      if (state.direction === "left") {
        // If the moving string's right side reaches the strip right side,
        // immediately append new fruits so there is never an empty right area.
        if (trackRect.right <= stripRect.right + 1) {
          appendMarqueeChunk(state.track, state.selectedFruitName);
        }

        while (state.track.children.length > 3) {
          const first = state.track.firstElementChild;
          if (!first) break;
          const firstRect = first.getBoundingClientRect();
          if (firstRect.right >= stripRect.left - 2) break;

          const firstWidth = first.offsetWidth;
          state.track.removeChild(first);
          state.offsetX += firstWidth;
          state.track.style.transform = "translateX(" + state.offsetX + "px)";
        }
      } else {
        if (trackRect.left >= stripRect.left - 1) {
          const prepended = prependMarqueeChunk(state.track, state.selectedFruitName);
          state.offsetX -= prepended.offsetWidth;
          state.track.style.transform = "translateX(" + state.offsetX + "px)";
        }

        while (state.track.children.length > 3) {
          const last = state.track.lastElementChild;
          if (!last) break;
          const lastRect = last.getBoundingClientRect();
          if (lastRect.left <= stripRect.right + 2) break;
          state.track.removeChild(last);
        }
      }

      state.rafId = window.requestAnimationFrame(step);
    }

    state.rafId = window.requestAnimationFrame(step);
  }

  function setupPulseEffect(strip, selectedFruitName) {
    stopMarqueeLoop();
    strip.innerHTML = "";
    strip.classList.remove("is-marquee");

    const fruitName = selectedFruitName || "Strawberry";
    const emoji = FRUIT_EMOJI[fruitName] || "🍓";

    const loader = document.createElement("div");
    loader.className = "prep-pulse-loader";

    const fruit = document.createElement("span");
    fruit.className = "prep-pulse-fruit";
    fruit.textContent = emoji;

    const dots = document.createElement("span");
    dots.className = "prep-pulse-dots";
    dots.textContent = "...";

    loader.appendChild(fruit);
    loader.appendChild(dots);
    strip.appendChild(loader);
  }

  /**
   * Show the preparation/loading overlay.
   *
   * @param {string} [fruitName]
   * @param {{
   *   direction?: "left"|"right"|number,
   *   effect?: "marquee"|"pulse",
   *   durationSeconds?: number,
   *   message?: string
   * }} [options]
   */
  function showPrepOverlay(fruitName, options) {
    const message =
      options && typeof options.message === "string" ? options.message : "";

    const overlay = ensureOverlay(message);
    const strip = overlay.querySelector(".prep-fruit-strip");
    const selectedFruitName = getSelectedFruitName(fruitName);

    const effectValue =
      options && typeof options.effect === "string"
        ? options.effect
        : window.prepOverlayEffect;
    const effect = effectValue === "pulse" ? "pulse" : "marquee";

    if (strip) {
      if (effect === "pulse") {
        setupPulseEffect(strip, selectedFruitName);
      } else {
        setupMarqueeEffect(strip, selectedFruitName, options || {});
      }
    }

    overlay.classList.remove("prep-overlay-hidden");
    void overlay.offsetWidth;

    playWaitVoiceOnce();
  }

  /**
   * Hide/remove the overlay.
   *
   * @param {{ instant?: boolean }} [options]
   */
  function hidePrepOverlay(options) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const instant = options && options.instant;

        const performFadeOut = function () {
      overlay.classList.add("prep-overlay-hidden");

      // Stop the wait announcement slightly before the overlay fully disappears
      // from view (0.5s lead vs. the CSS fade duration of 0.6s).
      const OVERLAY_FADE_MS = 600;
      const WAIT_STOP_LEAD_MS = 500;
      const stopDelayMs = Math.max(0, OVERLAY_FADE_MS - WAIT_STOP_LEAD_MS);
      setTimeout(stopWaitVoice, stopDelayMs);

      const removeAfterTransition = function () {
        overlay.removeEventListener("transitionend", removeAfterTransition);
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }

        stopMarqueeLoop();

        if (typeof window.onPrepOverlayHidden === "function") {
          try {
            window.onPrepOverlayHidden();
          } catch (_) {}
        }
      };

      overlay.addEventListener("transitionend", removeAfterTransition);
      setTimeout(removeAfterTransition, 800);
    };

    if (instant) {
      performFadeOut();
      return;
    }

    performFadeOut();
  }

  window.showPrepOverlay = showPrepOverlay;
  window.hidePrepOverlay = hidePrepOverlay;
  window.playPrepBgMusicLoop = playPrepBgMusicLoop;
  window.stopPrepBgMusicLoop = stopPrepBgMusicLoop;
})();
