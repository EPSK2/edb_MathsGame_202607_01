// ======================= 2.5D Jungle Canvas =======================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Dialog speech bubble tied to helper bear sprite
const dialogSpeechBubbleEl = document.getElementById("dialogSpeechBubble");

// Shared URL sanitisation and safe HTMLMediaElement playback helpers.
// These mirror the helpers used on the game page so both menu and game
// sanitise URLs (e.g. strip %00) and guard play() promises.
(function () {
  var CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;

  function sanitizeMediaUrl(raw) {
    if (typeof raw !== "string") {
      console.warn("[media] non-string URL", raw);
      return null;
    }

    var cleaned = raw.replace(CONTROL_CHARS_REGEX, "").trim();
    if (!cleaned) {
      console.warn("[media] cleaned URL is empty", { raw: raw });
      return null;
    }

    var urlObj;
    try {
      urlObj = new URL(cleaned, window.location.origin);
    } catch (e) {
      console.warn("[media] invalid URL format", { cleaned: cleaned, error: e });
      return null;
    }

    var protocol = urlObj.protocol;
    if (
      protocol !== "http:" &&
      protocol !== "https:" &&
      protocol !== "blob:" &&
      protocol !== "data:"
    ) {
      console.warn("[media] disallowed protocol", { url: urlObj.toString() });
      return null;
    }

    return urlObj.toString();
  }

  var mediaPlayState = new WeakMap();

  function safePlayMedia(mediaEl, rawUrl) {
    if (!mediaEl) {
      return Promise.reject(new Error("safePlayMedia: missing media element"));
    }

    var state = mediaPlayState.get(mediaEl);
    if (!state) {
      state = { requestId: 0 };
      mediaPlayState.set(mediaEl, state);
    }
    state.requestId += 1;
    var requestId = state.requestId;

    if (rawUrl != null) {
      var url = sanitizeMediaUrl(rawUrl);
      if (!url) {
        return Promise.reject(new Error("safePlayMedia: invalid media URL"));
      }
      try {
        mediaEl.src = url;
        if (typeof mediaEl.load === "function") {
          mediaEl.load();
        }
      } catch (e) {
        console.error("[media] failed to set src on element", e);
        return Promise.reject(e);
      }
    }

    var playPromise;
    try {
      playPromise = mediaEl.play();
    } catch (syncErr) {
      console.error("[media] synchronous play() error", syncErr);
      return Promise.reject(syncErr);
    }

    if (!playPromise || typeof playPromise.then !== "function") {
      return Promise.resolve();
    }

    return playPromise
      .then(function () {
        if (state.requestId !== requestId) {
          try {
            mediaEl.pause();
          } catch (_) {}
        }
      })
      .catch(function (err) {
        if (state.requestId !== requestId) {
          return;
        }
        console.error("[media] play() promise rejected", err);
      });
  }

  if (!window.sanitizeMediaUrl) {
    window.sanitizeMediaUrl = sanitizeMediaUrl;
  }
  if (!window.safePlayMedia) {
    window.safePlayMedia = safePlayMedia;
  }
})();


function positionDialogSpeechBubble() {
  if (!dialogSpeechBubbleEl) return;
  const helperBear = document.getElementById("helperBearSprite");
  if (!helperBear) return;

  const bearRect = helperBear.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || bearRect.height;
  const bubbleHeightPx = viewportHeight * 0.05; // 5vh
  const bubbleWidthPx = bearRect.width * 0.9;

  dialogSpeechBubbleEl.style.height = `${bubbleHeightPx}px`;
  dialogSpeechBubbleEl.style.width = `${bubbleWidthPx}px`;

  // Align bottom of bubble to top of bear; center horizontally over bear's head
  const bubbleTop = bearRect.top - bubbleHeightPx;
  const bubbleLeft = bearRect.left + (bearRect.width - bubbleWidthPx) / 2;

  dialogSpeechBubbleEl.style.top = `${bubbleTop}px`;
  dialogSpeechBubbleEl.style.left = `${bubbleLeft}px`;
}

function showDialogSpeechBubble() {
  if (!dialogSpeechBubbleEl) return;
  // Restore dot animation for standard dialog bubble
  dialogSpeechBubbleEl.style.animation = "dialogSpeechBubbleDots 1s linear infinite";
  // Let CSS keyframes drive the background images
  dialogSpeechBubbleEl.style.backgroundImage = "";
  positionDialogSpeechBubble();
  dialogSpeechBubbleEl.style.opacity = "1";
}

function showExclamSpeechBubble() {
  if (!dialogSpeechBubbleEl) return;
  // Use a static exclamation speech bubble, same size and position
  dialogSpeechBubbleEl.style.animation = "none";
  positionDialogSpeechBubble();
  dialogSpeechBubbleEl.style.backgroundImage = 'url("./speech_bubble_exclam.png")';
  dialogSpeechBubbleEl.style.opacity = "1";
}

function hideDialogSpeechBubble() {
  if (!dialogSpeechBubbleEl) return;
  dialogSpeechBubbleEl.style.opacity = "0";
}


// Show the preparation/loading overlay while menu assets are loading.
if (typeof window.showPrepOverlay === "function") {
  window.showPrepOverlay("Strawberry");
}



function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  //initTrees();
  //initParticles();
  if (typeof sunshineEffect !== "undefined" && sunshineEffect) {
    sunshineEffect.handleResize();
  }
  positionDialogSpeechBubble();
});


// Image assets
const images = {
  fieldBg: new Image(),
  tree: new Image(),
  leaf: new Image(),
};

// Preload the helper bear image used for the final zoom animation
// so that it is already cached by the time we need to display it.
const bearZoomImage = new Image();
bearZoomImage.src = "./bear_trans_blue.png";

// Use provided assets
images.fieldBg.src = "./cmbg_01.png";
images.tree.src = "./tree.png";
images.leaf.src = "./leaf.png";



const layers = {
  deepBackground: { image: images.fieldBg, blur: 0.5 },
  distantTrees: [],
  mainPlayAreaTrees: [],
  foregroundTrees: [],
  particles: [],
};


const particleConfigs = {
  numLeavesAmbient: 50,
  numLeavesTreePerSide: 50,
  numLeavesSky: 25,
  minLeafSize: 20,
  maxLeafSize: 40,
  windFrequency: 0.005,
};

const treeSwayConfig = {
  frequency: 0.0006, 
  amplitude: 10,
};

function initTrees() {
  if (!canvas) return;
  layers.distantTrees.length = 0;
  layers.mainPlayAreaTrees.length = 0;
  layers.foregroundTrees.length = 0;

  const groundY = canvas.height * 0.95;
  const treeHeight = images.tree.height || 300;

  function createTree(x, scale, layer) {
    const height = treeHeight * scale;
    return { baseX: x, bottomY: groundY, scale, layer, swayPhase: Math.random() * Math.PI * 2 };
  }
  /*
  // Layer 2: Distant swaying trees
  const distantCount = 8;
  for (let i = 0; i < distantCount; i++) {
    const x = ((i + 1) / (distantCount + 1)) * canvas.width;
    const scale = 0.4 + Math.random() * 0.2; 
    layers.distantTrees.push(createTree(x, scale, 2));
  }

  // Layer 3: Main trees
  const mainCount = 5;
  for (let i = 0; i < mainCount; i++) {
    const x = ((i + 1) / (mainCount + 1)) * canvas.width;
    const jitter = (Math.random() - 0.5) * 40;
    layers.mainPlayAreaTrees.push(createTree(x + jitter, 1, 3));
  }

  // Layer 4: Close foreground trees
  layers.foregroundTrees.push(
    createTree(canvas.width * 0.08, 1.5, 4),
    createTree(canvas.width * 0.92, 1.6, 4)
  );
  */
  
}

const particleConfig = {
  maxActiveLeaves: particleConfigs.numLeavesAmbient + particleConfigs.numLeavesTreePerSide * 2 + particleConfigs.numLeavesSky,
  minSize: particleConfigs.minLeafSize,
  maxSize: particleConfigs.maxLeafSize,
  baseSpeed: 0.8,
  maxExtraSpeed: 1.6,
  windFrequency: particleConfigs.windFrequency,
  windAmplitude: 25,
  spawnChanceTreePerFrame: 0.08, 
  spawnChanceSkyPerFrame: 0.04, 
};

function createLeaf(sourceType) {
  const zDepth = Math.random(); 
  const size = particleConfig.minSize + Math.random() * (particleConfig.maxSize - particleConfig.minSize);
  let spawnX = Math.random() * canvas.width;
  let spawnY = -size; 

    if (sourceType === "tree") {
    if (layers.mainPlayAreaTrees.length > 0 && images.tree.complete) {
      const tree = layers.mainPlayAreaTrees[Math.floor(Math.random() * layers.mainPlayAreaTrees.length)];
      const treeWidth = images.tree.width * tree.scale;
      const treeHeight = images.tree.height * tree.scale;
      const xLeft = tree.baseX - treeWidth / 2;
      const yTop = tree.bottomY - treeHeight;
      const canopyStart = yTop;
      const canopyEnd = yTop + treeHeight * 0.3;
      spawnX = xLeft + Math.random() * treeWidth;
      spawnY = canopyStart + Math.random() * (canopyEnd - canopyStart);
    } else {
      spawnX = Math.random() * canvas.width;
      spawnY = Math.random() * (canvas.height * 0.3);
    }
  } else if (sourceType === "sky") {

    spawnX = Math.random() * canvas.width;
    spawnY = -Math.random() * (canvas.height * 0.2);
  }

  const mass = 0.4 + Math.random() * 0.2; 
  const rho = 1.0; 
  const Cd_base = 1.0 + Math.random() * 0.3; 
  const initialSpeedDown = 40 + Math.random() * 40; 
  const vx = (Math.random() - 0.5) * 40; 
  const vy = initialSpeedDown;
  const angle = Math.random() * Math.PI * 2; 
  const angularVel = (Math.random() - 0.5) * 1.0; 

  return { type: sourceType, x: spawnX, y: spawnY, vx, vy, angle, angularVel, mass, size, rho, Cd_base, zDepth };
}

function initParticles() { layers.particles.length = 0; }

function spawnLeaves(time) {
  const activeTreeLeaves = layers.particles.filter(leaf => leaf.type === "tree");
  if (activeTreeLeaves.length < particleConfigs.numLeavesAmbient + particleConfigs.numLeavesTreePerSide * 2 && Math.random() < particleConfig.spawnChanceTreePerFrame) {
    layers.particles.push(createLeaf("tree"));
  }
  const activeSkyLeaves = layers.particles.filter(leaf => leaf.type === "sky");
  if (activeSkyLeaves.length < particleConfigs.numLeavesSky && Math.random() < particleConfig.spawnChanceSkyPerFrame) {
    layers.particles.push(createLeaf("sky"));
  }
  if (layers.particles.length > particleConfig.maxActiveLeaves) {
    layers.particles.length = particleConfig.maxActiveLeaves;
  }
}

function drawDeepBackground() {
  if (!ctx || !images.fieldBg.complete) return;
  ctx.save();
  ctx.filter = `blur(${layers.deepBackground.blur}px)`;
  ctx.drawImage(images.fieldBg, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawTree(tree, options, time) {
  if (!ctx || !images.tree.complete) return;

  const blur = options && options.blur ? options.blur : 0;
  const tintColor = options && options.tintColor ? options.tintColor : null;
  const sway = options && options.sway;
  const swayFrequency = (options && options.frequency) || treeSwayConfig.frequency;
  const swayAmplitude = (options && options.amplitude) || treeSwayConfig.amplitude;

  let drawX = tree.baseX;
  if (sway) {
    drawX += Math.sin(time * swayFrequency + tree.swayPhase) * swayAmplitude;
  }

  const treeWidth = images.tree.width * tree.scale;
  const treeHeight = images.tree.height * tree.scale;
  const x = drawX - treeWidth / 2;
  const y = tree.bottomY - treeHeight;

  ctx.save();
  let filterStr = options.blur ? `blur(${options.blur}px)` : `blur(${1}px)`;
  
  // Apply both blur (if applicable) and the new brightness filter
  if (options.sway) { // This identifies the distant trees layer
    filterStr += " brightness(65%)";
  }else{
    filterStr += " brightness(80%)";
  }
  ctx.filter = filterStr || "none";
  
  ctx.drawImage(images.tree, x, y, treeWidth, treeHeight);
  ctx.restore();
}

function drawTrees(time) {
  layers.distantTrees.forEach((tree) => { drawTree(tree, { blur: 1.5, tintColor: "rgba(40, 80, 120, 0.5)", sway: true, frequency: 0.0004, amplitude: 6 }, time); });
  layers.mainPlayAreaTrees.forEach((tree) => { drawTree(tree, { blur: 0, tintColor: null, sway: false }, time); });
  layers.foregroundTrees.forEach((tree) => { drawTree(tree, { blur: 3.5, tintColor: null, sway: false }, time); });
}


function drawAndUpdateParticles(time) {
  if (!ctx || !images.leaf.complete) return;

  const dt = 1 / 60; 
  const GRAVITY = 500; 
  const FORCE_SCALE = 0.00002; 
  const VORTEX_SCALE = 5; 

  function normalizeAngle(a) { return ((a + Math.PI) % (Math.PI * 2)) - Math.PI; }
  const leaves = layers.particles;

  for (let i = leaves.length - 1; i >= 0; i--) {
    const leaf = leaves[i];

    let vx = leaf.vx || 0;
    let vy = leaf.vy || 0;
    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);

    let ax = 0;
    let ay = GRAVITY; 
    let angle = leaf.angle || 0;
    let angularVel = leaf.angularVel || 0;

    if (v > 0.01) {
      const velAngle = Math.atan2(vy, vx);
      const alpha = normalizeAngle(velAngle - angle);
      const sinAlpha = Math.sin(alpha);
      const Cd = leaf.Cd_base * (1 + 2 * sinAlpha * sinAlpha);
      const A = leaf.size * leaf.size * Math.abs(Math.cos(alpha)) + leaf.size * 0.15 * Math.abs(Math.sin(alpha));
      const rho = leaf.rho || 1.0;

      const dragMag = 0.5 * rho * Cd * A * v2 * FORCE_SCALE;
      const dragFx = (-vx / v) * dragMag;
      const dragFy = (-vy / v) * dragMag;

      const liftMag = dragMag * 0.25; 
      const liftFx = (-vy / v) * liftMag;
      const liftFy = (vx / v) * liftMag;

      let fx = dragFx + liftFx;
      let fy = dragFy + liftFy;
      fx += (Math.random() - 0.5) * VORTEX_SCALE;

      ax += fx / leaf.mass;
      ay += fy / leaf.mass;

      const I = (leaf.mass * leaf.size * leaf.size) / 12; 
      const alpha_ang = (0.01 * v2 * Math.sin(2 * alpha)) / I;
      angularVel += alpha_ang * dt;
    }

    vx += ax * dt;
    vy += ay * dt;
    leaf.x += vx * dt;
    leaf.y += vy * dt;
    leaf.vx = vx;
    leaf.vy = vy;
    leaf.angularVel = angularVel;
    leaf.angle += leaf.angularVel * dt;

    const blur = leaf.zDepth < 0.2 || leaf.zDepth > 0.8 ? 2.5 : 0;
    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : "none";
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle);
    ctx.drawImage(images.leaf, -leaf.size / 2, -leaf.size / 2, leaf.size, leaf.size);
    ctx.restore();

    if (leaf.y > canvas.height + 100 || leaf.x < -100 || leaf.x > canvas.width + 100) {
      leaves.splice(i, 1);
    }
  }
}

// Sunshine ray effect overlay
class SunshineEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lightSource = { x: 0, y: 0 };
    this.layers = [];
    this.noiseTime = 0;
    this.lastTimestamp = 0;
    this._initLayers();
    this.handleResize();
  }

  _initLayers() {
    this.layers = [
      { radiusScale: 1.2, beamCount: 40, baseAlpha: 0.18, noiseScale: 0.0008, speed: 0.00004 },
      { radiusScale: 1.4, beamCount: 30, baseAlpha: 0.12, noiseScale: 0.0012, speed: 0.00007 },
      { radiusScale: 1.6, beamCount: 20, baseAlpha: 0.08, noiseScale: 0.0016, speed: 0.0001 },
    ];
  }

  handleResize() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.lightSource.x = w * 0.8;
    this.lightSource.y = -h * 0.1;
    this.maxRadius = Math.sqrt(w * w + h * h) * 1.2;
  }

  noise2D(x, y, time) {
    const n1 = Math.sin(x * 0.0007 + time * 0.0013) * Math.cos(y * 0.0004 + time * 0.0011);
    const n2 = Math.sin(x * 0.0003 + time * 0.0009) * Math.cos(y * 0.0006 + time * 0.0017);
    return 0.5 + 0.5 * (0.6 * n1 + 0.4 * n2);
  }

  noise1D(t) {
    return 0.5 + 0.5 * Math.sin(t) * Math.cos(t * 0.7);
  }

  render(time) {
    if (!this.ctx) return;

    if (!this.lastTimestamp) {
      this.lastTimestamp = time;
    }
    const dt = time - this.lastTimestamp;
    this.lastTimestamp = time;
    this.noiseTime += dt * 0.0005;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const flicker = 0.7 + 0.3 * this.noise1D(this.noiseTime * 0.8);

    this.layers.forEach((layer, index) => {
      const radius = this.maxRadius * layer.radiusScale;
      const beamCount = layer.beamCount;
      const baseAlpha = layer.baseAlpha;

      for (let i = 0; i < beamCount; i++) {
        const angle = (i / beamCount) * Math.PI + this.noiseTime * layer.speed + index * 0.12;
        const startX = this.lightSource.x;
        const startY = this.lightSource.y;
        const endX = startX + Math.cos(angle) * radius;
        const endY = startY + Math.sin(angle) * radius;

        const segments = 12;
        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const px = startX + (endX - startX) * t;
          const py = startY + (endY - startY) * t;

          const fade = 1 - t;
          const localNoise = this.noise2D(
            px + index * 50,
            py - index * 80,
            this.noiseTime * (1 + index * 0.25)
          );

          const alpha = baseAlpha * fade * localNoise * flicker;
          if (alpha <= 0.001) continue;

          const thickness = 60 * (1 - t) * (0.5 + localNoise) * (1 + index * 0.2);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, thickness);
          grad.addColorStop(0, `rgba(255, 255, 220, ${alpha})`);
          grad.addColorStop(1, "rgba(255, 255, 220, 0)");

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(px, py, thickness, thickness * 0.35, angle, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    ctx.restore();
  }
}

let sunshineEffect = null;
function initSunshineEffect(canvasElement) {
  if (!canvasElement) return null;
  return new SunshineEffect(canvasElement);
}

function gameLoop(timestamp) {
  if (!ctx || !canvas) return;
  const time = timestamp || performance.now();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawDeepBackground();
  drawTrees(time);
  spawnLeaves(time);
  drawAndUpdateParticles(time);
  
  if (sunshineEffect) {
    sunshineEffect.render(time);
  }
  requestAnimationFrame(gameLoop);
}

const requiredAssetKeys = ["fieldBg", "tree", "leaf"];

const loadedAssets = new Set();

// Promise that resolves once all visual assets used by the canvas
// background have finished loading (or errored).
let visualAssetsReadyResolve = null;
const visualAssetsReadyPromise = new Promise((resolve) => {
  visualAssetsReadyResolve = resolve;
});

function onAssetReady(assetKey) {
  if (loadedAssets.has(assetKey)) return;
  loadedAssets.add(assetKey);

  if (loadedAssets.size === requiredAssetKeys.length) {
    initTrees();
    initParticles();
    sunshineEffect = initSunshineEffect(canvas);
    requestAnimationFrame(gameLoop);

    if (typeof visualAssetsReadyResolve === "function") {
      visualAssetsReadyResolve();
    }
  }
}


function registerAssetLoad(assetKey) {
  const img = images[assetKey];
  if (!img) {
    onAssetReady(assetKey);
    return;
  }

  // Handle cached images that may have finished loading before listener registration.
  if (img.complete && img.naturalWidth > 0) {
    onAssetReady(assetKey);
    return;
  }

  img.addEventListener("load", () => onAssetReady(assetKey), { once: true });
  img.addEventListener("error", () => onAssetReady(assetKey), { once: true });
}

requiredAssetKeys.forEach(registerAssetLoad);

// ======================= Menu Interaction Logic =======================

const speech = document.getElementById("speech");
const difficultySelection = document.getElementById("difficultySelection");
let menuConfig = {
  mode: null,
  level: null,
  rangeLabel: null,
  rangeMax: null,
  clampLabel: null,
  clampTolerance: null,
};

// Toggle whether the menu should remember the last-used game settings
// (mode, level, range, clamp tolerance) across page reloads.
const REMEMBER_LAST_SETTINGS_ENABLED = false;

function saveLastMenuSettingsIfEnabled() {
  if (!REMEMBER_LAST_SETTINGS_ENABLED) return;
  try {
    const payload = {
      mode: menuConfig.mode,
      level: menuConfig.level,
      rangeLabel: menuConfig.rangeLabel,
      rangeMax: menuConfig.rangeMax,
      clampLabel: menuConfig.clampLabel,
      clampTolerance: menuConfig.clampTolerance,
    };
    window.localStorage.setItem("stbLastMenuSettings", JSON.stringify(payload));
  } catch (_) {
    // ignore storage errors (e.g. private mode)
  }
}

function loadLastMenuSettingsIfEnabled() {
  if (!REMEMBER_LAST_SETTINGS_ENABLED) return;
  try {
    const raw = window.localStorage.getItem("stbLastMenuSettings");
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return;
    menuConfig = {
      mode: payload.mode || menuConfig.mode,
      level: payload.level || menuConfig.level,
      rangeLabel: payload.rangeLabel || menuConfig.rangeLabel,
      rangeMax: payload.rangeMax || menuConfig.rangeMax,
      clampLabel: payload.clampLabel || menuConfig.clampLabel,
      clampTolerance: payload.clampTolerance || menuConfig.clampTolerance,
    };
  } catch (_) {
    // ignore JSON / storage errors
  }
}


function setSpeech(text) {
  if (speech) {
    speech.innerHTML = text;
  }
}

function selectMode(mode) {
  menuConfig.mode = mode;
  
  // 顯示難度選單
  if (difficultySelection) {
    difficultySelection.classList.remove("hidden");
  }

  // 根據選擇更新對話
  if (mode === "ascending") {
    setSpeech("👉 由 <b>小 → 大</b> 排列！<br/>而家請選擇難度啦！");
  } else {
    setSpeech("👈 由 <b>大 → 小</b> 排列！<br/>而家請選擇難度啦！");
  }
}

// 替換整個 startGame 函數為以下版本（強制重載 game.html）
function startGame(difficulty) {
  menuConfig.level = difficulty;

  const params = new URLSearchParams();
  if (typeof menuConfig.rangeMax === "number") {
    params.set("rangeMax", String(menuConfig.rangeMax));
  }
  if (typeof menuConfig.clampTolerance === "number") {
    params.set("clampTolerance", String(menuConfig.clampTolerance));
  }

  // 永遠用完整 URL，確保在 /sandbox/ 下正常工作

  const targetUrl = new URL("./game_2.html", window.location.href);
  targetUrl.search = params.toString();

  // 如不再需要，可刪除這行
  window.selectedGameConfig = { ...menuConfig };

  // Optionally remember settings for next visit
  saveLastMenuSettingsIfEnabled();

  const currentUrlBeforeRedirect = window.location.href;

  const redirectDelayMs =
    typeof window.__menuRedirectDelayMs === "number"
      ? window.__menuRedirectDelayMs
      : 1200;

  setTimeout(() => {
    const targetUrlString = targetUrl.toString();
    window.location.href = targetUrlString; // 永遠做完整重載

    // Retry once only if the browser did not start navigation.
    setTimeout(() => {
      if (window.location.href === currentUrlBeforeRedirect) {
        window.location.href = targetUrlString;
      }
    }, 250);
  }, redirectDelayMs);
}



// ======================= Dialog System =======================

// Simple sound helpers for dialog and managed dialogue-track playback
const MENU_DIALOG_TRACK_COUNT = 4; // number of dialog nodes in the intro script
let nextPageAudio = null;
let selectAudio = null;
let dialogTrackAudios = [];
let currentDialogAudio = null;
let dialogLastAudioEndedAt = null; // timestamp when the final dialog audio finished
let pendingDialogAutoAdvance = null; // helper to track audio-driven auto-advances

function getDialogTrackSrc(index) {
  // Files are expected to be named dialogue_0_0.mp3, dialogue_0_1.mp3, ...
  return `dialogue_0${index+1}.mp3`;
}

function stopCurrentDialogAudio() {
  if (!currentDialogAudio) return;
  try {
    currentDialogAudio.pause();
    currentDialogAudio.currentTime = 0;
  } catch (_) {}
  currentDialogAudio = null;
}

function handleDialogAudioEnded(index) {
  if (!dialogManager || !dialogManager.isActive) return;
  // If the dialog has already advanced to another node, ignore this end event.
  if (dialogManager.currentIndex !== index) return;

  const node = dialogManager.script && dialogManager.script[index];
  if (!node) return;

  // NORMAL TEXT: auto-advance if the user did not click (i.e. still on the same node).
  if (node.type === "Text") {
    if (!dialogManager.isTransitioning) {
      dialogManager.next();
    }
  } else if (node.type === "TextFinal") {
    // Final dialogue: record end time and complete the sequence.
    dialogLastAudioEndedAt = performance.now();
    if (!dialogManager.isTransitioning) {
      dialogManager.stop();
      document.dispatchEvent(new CustomEvent("dialogSequenceCompleted"));
    }
  }
}

function playDialogAudioForIndex(index) {
  if (index == null || index < 0) return;
  stopCurrentDialogAudio();
  if (!Array.isArray(dialogTrackAudios) || !dialogTrackAudios.length) return;
  const audioEl = dialogTrackAudios[index];
  if (!audioEl) return;

  // Clear previous handlers to avoid multiple onended callbacks.
  audioEl.onended = null;
  audioEl.addEventListener("ended", () => handleDialogAudioEnded(index), { once: true });

  currentDialogAudio = audioEl;
  try {
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {});
  } catch (e) {
    console.error("Failed to play dialog track", index, e);
  }
}


function playNextPageSound() {
  try {
    // Any dialog/effect sound should interrupt the current dialog voice track.
    stopCurrentDialogAudio();
    if (!nextPageAudio) {
      var url = window.sanitizeMediaUrl
        ? window.sanitizeMediaUrl("next_page_sound.mp3")
        : "next_page_sound.mp3";
      if (!url) {
        return;
      }
      nextPageAudio = new Audio(url);
    }
    nextPageAudio.currentTime = 0;
    // Use safePlayMedia when available to guard play() promises.
    if (window.safePlayMedia) {
      window.safePlayMedia(nextPageAudio).catch(function () {});
    } else {
      nextPageAudio.play().catch(function () {});
    }
  } catch (e) {
    console.error("Failed to play next page sound", e);
  }
}

function playSelectSound() {
  try {
    // Any dialog/effect sound should interrupt the current dialog voice track.
    stopCurrentDialogAudio();
    if (!selectAudio) {
      var url = window.sanitizeMediaUrl
        ? window.sanitizeMediaUrl("select_sound.mp3")
        : "select_sound.mp3";
      if (!url) {
        return;
      }
      selectAudio = new Audio(url);
    }
    selectAudio.currentTime = 0;
    if (window.safePlayMedia) {
      window.safePlayMedia(selectAudio).catch(function () {});
    } else {
      selectAudio.play().catch(function () {});
    }
  } catch (e) {
    console.error("Failed to play select sound", e);
  }
}



// ======================= Tutorial Overlay & Window =======================
let isTutorialOpen = false;

let tutorialOverlay = null;
let tutorialWindow = null;
let tutorialContent = null;
let tutorialPrevButton = null;
let tutorialNextButton = null;
let tutorialFinishButton = null;
let tutorialPageIndicator = null;
let tutorialCloseButton = null;
let currentTutorialPage = 0;

// Developers: put tutorial page HTML content here.
// Each entry is injected as innerHTML into the main tutorial content area.
const tutorialPages = [
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
      <img style="width: 700px; height: auto;" src="ins01.png">
      <div class="text-4xl leading-tight text-gray-700 whitespace-pre-line">
        遊戲場地內有 <b>5</b> 朵雲，印著不同的數字。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <img style="width: 700px; height: auto;" src="ins02.png">
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">
        如果箭頭指向 <span class="text-6xl">右 ➡➡➡</span>，
        就需要把數字從 <span class="text-3xl">小</span> 到 <span class="text-6xl">大</span> 排列。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <img style="width: 700px; height: auto;" src="ins03.png">
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">
        如果箭頭指向 <span class="text-6xl">左 ⬅⬅⬅</span>，
        就需要把數字從 <span class="text-6xl">大</span> 到 <span class="text-3xl">小</span> 排列。
      </div>
    </div>
  `,
  `
    <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1rem;">
      <video src="ins04.webm" muted loop autoplay style="width: 50%;"></video>
      <div class="text-4xl leading-relaxed text-gray-700 whitespace-pre-line">用手指/滑鼠按住雲朵，拉動，再放到正確位置上！</div>
    </div>
  `,
];

function initTutorialUI() {
  tutorialOverlay = document.getElementById("tutorialOverlay");
  tutorialWindow = document.getElementById("tutorialWindow");
  tutorialContent = document.getElementById("tutorialContent");
  tutorialPrevButton = document.getElementById("tutorialPrevButton");
  tutorialNextButton = document.getElementById("tutorialNextButton");
  tutorialFinishButton = document.getElementById("tutorialFinishButton");
  tutorialPageIndicator = document.getElementById("tutorialPageIndicator");
  tutorialCloseButton = document.getElementById("tutorialCloseButton");

  if (
    !tutorialOverlay ||
    !tutorialWindow ||
    !tutorialContent ||
    !tutorialPrevButton ||
    !tutorialNextButton ||
    !tutorialFinishButton ||
    !tutorialPageIndicator ||
    !tutorialCloseButton
  ) {
    return;
  }

  // 阻止點擊遮罩穿透到底層
  tutorialOverlay.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
  });

  const handleClose = (event) => {
    event.stopPropagation();
    event.preventDefault();
    closeTutorial();
  };

  tutorialCloseButton.addEventListener("click", handleClose);
  tutorialFinishButton.addEventListener("click", handleClose);

  tutorialPrevButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (currentTutorialPage > 0) {
      currentTutorialPage -= 1;
      renderTutorialPage();
    }
  });

  tutorialNextButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (currentTutorialPage < tutorialPages.length - 1) {
      currentTutorialPage += 1;
      renderTutorialPage();
    }
  });
}

function openTutorial(startPage = 0) {
  if (
    !tutorialOverlay ||
    !tutorialWindow ||
    !tutorialContent ||
    !tutorialPageIndicator
  ) {
    return;
  }

  isTutorialOpen = true;
  // Always start from first page (do not remember last visit)
  currentTutorialPage = 0;

  tutorialOverlay.classList.remove("hidden");
  tutorialWindow.classList.remove("hidden");

  // While the tutorial is open, ensure the dialog/info box does not
  // respond to "press anywhere" clicks.
  const infoBoxEl = document.getElementById("infoBox");
  if (infoBoxEl) {
    infoBoxEl.classList.add("pointer-events-none");
    infoBoxEl.classList.remove("pointer-events-auto");
  }

  renderTutorialPage();
}

function closeTutorial() {
  isTutorialOpen = false;
  if (tutorialOverlay) {
    tutorialOverlay.classList.add("hidden");
  }
  if (tutorialWindow) {
    tutorialWindow.classList.add("hidden");
  }

  // Restore dialog/info box interactivity once tutorial is closed.
  const infoBoxEl = document.getElementById("infoBox");
  if (infoBoxEl) {
    infoBoxEl.classList.remove("pointer-events-none");
    infoBoxEl.classList.add("pointer-events-auto");
  }

  // If we paused the dialog on the "任務內容" Choice page, resume
  // the dialog flow now that the tutorial has been closed.
  if (dialogManager && dialogManager.isActive && !dialogManager.isTransitioning) {
    const node = dialogManager.script && dialogManager.script[dialogManager.currentIndex];
    if (
      node &&
      node.type === "Choice" &&
      typeof node.Question === "string" &&
      node.Question.includes("任務內容")
    ) {
      dialogManager.next();
    }
  }
}



function renderTutorialPage() {
  if (!tutorialContent || !tutorialPageIndicator) return;

  const total = tutorialPages.length || 1;
  if (currentTutorialPage < 0) currentTutorialPage = 0;
  if (currentTutorialPage > total - 1) currentTutorialPage = total - 1;

  tutorialContent.innerHTML = tutorialPages[currentTutorialPage] || "";

  tutorialPageIndicator.textContent = `第 ${currentTutorialPage + 1}/${total} 頁`;

  if (tutorialPrevButton) {
    if (currentTutorialPage === 0) {
      tutorialPrevButton.disabled = true;
      tutorialPrevButton.classList.add("opacity-50", "pointer-events-none");
    } else {
      tutorialPrevButton.disabled = false;
      tutorialPrevButton.classList.remove("opacity-50", "pointer-events-none");
    }
  }

  if (tutorialNextButton && tutorialFinishButton) {
    if (currentTutorialPage === total - 1) {
      tutorialNextButton.classList.add("hidden");
      tutorialFinishButton.classList.remove("hidden");
    } else {
      tutorialNextButton.classList.remove("hidden");
      tutorialFinishButton.classList.add("hidden");
    }
  }
}

class DialogManager {

  constructor(options) {
    this.infoBox = options.infoBox;
    this.speakerLabelContainer = options.speakerLabelContainer || null;
    this.speakerLabel = options.speakerLabel || null;
    this.dialogContent = options.dialogContent;
    this.choicePane = options.choicePane || null;
    this.choicePaneContent = options.choicePaneContent || null;
    this.script = [];
    this.currentIndex = -1;
    this.isActive = false;
    this.isTransitioning = false;
    this.globalClickHandler = this.handleGlobalClick.bind(this);
  }


  loadScript(scriptArray) {
    this.script = Array.isArray(scriptArray) ? scriptArray : [];
    this.currentIndex = -1;
  }

        start() {
    if (!this.infoBox || !this.dialogContent || !this.script.length) return;
    this.isActive = true;
    this.isTransitioning = false;
    // ensure dialogContent starts visible but we control opacity
    this.dialogContent.style.opacity = "0";
    if (this.choicePaneContent) {
      this.choicePaneContent.style.opacity = "0";
    }
    window.addEventListener("click", this.globalClickHandler);
    this.next(true); // first node, fade-in only
  }


                stop() {
    this.isActive = false;
    window.removeEventListener("click", this.globalClickHandler);
    hideDialogSpeechBubble();
    this.hideChoicePane();
    if (typeof stopCurrentDialogAudio === "function") {
      stopCurrentDialogAudio();
    }
  }




    handleGlobalClick(event) {
    if (!this.isActive || this.isTransitioning) return;

    // 如果教學視窗正在顯示，阻止對話框響應點擊
    if (typeof isTutorialOpen !== "undefined" && isTutorialOpen) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    const node = this.script[this.currentIndex];

    if (!node) return;

    if (node.type === "TextFinal") return;

    if (node.type === "Choice") {
      // While waiting for a choice, block other interactions but do not advance
      const isChoiceButton =
        event.target &&
        event.target.closest &&
        event.target.closest(".dialog-choice-button");
      if (!isChoiceButton) {
        event.stopPropagation();
        event.preventDefault();
      }
      return;
        }

    // Text node: any click advances
    if (node.type === "Text" && node.Event && typeof window[node.Event] === "function") {
      try {
        window[node.Event](node);
      } catch (err) {
        console.error("Error running dialog event handler on leave", node.Event, err);
      }
    }

    event.stopPropagation();
    event.preventDefault();
    this.next();
  }

        next(isFirst = false) {
    if (this.isTransitioning) return;

    const currentNode = this.script[this.currentIndex];
    const nextIndex = this.currentIndex + 1;
    const nextNode =
      nextIndex >= 0 && nextIndex < this.script.length
        ? this.script[nextIndex]
        : null;

    const proceedToNext = () => {
      this.currentIndex += 1;
      if (this.currentIndex >= this.script.length) {
        this.stop();
        document.dispatchEvent(new CustomEvent("dialogSequenceCompleted"));
        return;
      }
            const node = this.script[this.currentIndex];
      this.renderNode(node);


      // Play per-dialogue voice track as soon as the node becomes active.
      if (typeof playDialogAudioForIndex === "function") {
        playDialogAudioForIndex(this.currentIndex);
      }

      // fade in
      requestAnimationFrame(() => {

        this.dialogContent.style.opacity = "1";
        if (node && node.type === "Choice" && this.choicePaneContent) {
          this.choicePaneContent.style.opacity = "1";
        }
        setTimeout(() => {
          this.isTransitioning = false;
        }, 250);
      });
    };

    this.isTransitioning = true;

    if (isFirst) {
      // first node: no fade-out, only fade-in
      proceedToNext();
      return;
    }

    // fade out then change content
    this.dialogContent.style.opacity = "0";
    if (currentNode && currentNode.type === "Choice" && this.choicePaneContent) {
      this.choicePaneContent.style.opacity = "0";
    }

    // If we're leaving a Choice node and the upcoming node is NOT another Choice,
    // slide the bamboo choice pane out as part of the dialog transition.
    if (currentNode && currentNode.type === "Choice" && (!nextNode || nextNode.type !== "Choice")) {
      this.hideChoicePane();
    }

    setTimeout(proceedToNext, 250);
  }


  clearContent() {
    if (!this.dialogContent) return;
    while (this.dialogContent.firstChild) {
      this.dialogContent.removeChild(this.dialogContent.firstChild);
    }
  }

    setSpeaker(name) {
    if (!this.speakerLabelContainer || !this.speakerLabel) return;
    if (!name) {
      this.speakerLabelContainer.style.display = "none";
    } else {
      this.speakerLabelContainer.style.display = "";
      this.speakerLabel.textContent = name;
    }
  }

        hideChoicePane() {
    if (!this.choicePane) return;
    this.choicePane.classList.remove("choice-pane-visible");
    if (this.infoBox) {
      this.infoBox.classList.remove("dialog-box-narrow");
    }
  }

  clearChoicePaneContent() {
    if (!this.choicePaneContent) return;
    while (this.choicePaneContent.firstChild) {
      this.choicePaneContent.removeChild(this.choicePaneContent.firstChild);
    }
  }

  showChoicePane() {
    if (!this.choicePane) return;
    this.choicePane.classList.add("choice-pane-visible");
    if (this.infoBox) {
      this.infoBox.classList.add("dialog-box-narrow");
    }
  }



        renderNode(node) {
    if (!node) return;
    this.clearContent();

    // Default: hide bubble; show only for regular Text nodes
    hideDialogSpeechBubble();

    if (node.type === "Text" || node.type === "TextFinal") {
      this.setSpeaker(node.Speaker || "");
      const textEl = document.createElement("div");
      textEl.className = "dialog-standard-text";
      textEl.textContent = node.Content || "";
      this.dialogContent.appendChild(textEl);
      // When a regular dialogue is shown, display the animated speech bubble
      showDialogSpeechBubble();
      this.hideChoicePane();
      /*if (node.type === "Text") {
        const continueHintEl = document.createElement("div");
        continueHintEl.className = "dialog-continue-hint";
        continueHintEl.textContent = "（點擊任何地方繼續）";
        this.dialogContent.appendChild(continueHintEl);

      }*/
    } else if (node.type === "Choice") {
      this.setSpeaker("");


      const questionEl = document.createElement("div");
      questionEl.className = "dialog-standard-text";
      questionEl.textContent = node.Question || "";
      this.dialogContent.appendChild(questionEl);

      // Populate the sliding bamboo choice pane with options
      if (this.choicePane && this.choicePaneContent) {
        this.showChoicePane();
        this.clearChoicePaneContent();
        this.choicePaneContent.style.opacity = "0";

        const answers = Array.isArray(node.AnswerArr) ? node.AnswerArr : [];
        const expectedCount =
          typeof node.AnswerNo === "number" ? node.AnswerNo : answers.length;
        const count = Math.min(expectedCount, answers.length);

        for (let i = 0; i < count; i++) {
          const answerText = answers[i];
          const row = document.createElement("div");
          row.className = "choice-pane-row";

          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "dialog-choice-button pushable-button";

          const frontSpan = document.createElement("span");
          frontSpan.className = "front";
          frontSpan.textContent = answerText;
          btn.appendChild(frontSpan);

                    btn.addEventListener("click", (event) => {
            event.stopPropagation();
            event.preventDefault();

            // Visually mark selection immediately (change background color only)
            frontSpan.style.backgroundColor = "#d6cdb7";

            // Play select sound effect on choice at the moment of click
            if (typeof playSelectSound === "function") {
              playSelectSound();
            }

            // Do not hide the choice pane immediately; keep it visible
            // until the dialog transitions to the next node.

            const detail = {
              node,
              answerIndex: i,
              answerText,
            };
            document.dispatchEvent(
              new CustomEvent("dialogChoiceSelected", { detail })
            );

            // Decide whether this Choice should auto-advance the dialog.
            const shouldAutoAdvance = dialogChoiceShouldAutoAdvance !== false;
            if (!shouldAutoAdvance) {
              // Reset flag for subsequent choices and keep dialog on this node
              // until some other code explicitly advances it (e.g. tutorial close).
              dialogChoiceShouldAutoAdvance = true;
              this.isTransitioning = false;
              return;
            }

            // Default behaviour: wait 1 second before advancing to the next dialog node
            this.isTransitioning = true; // block other clicks while we wait
            setTimeout(() => {
              // allow next() to proceed, it will manage isTransitioning for fade
              this.isTransitioning = false;
              this.next();
            }, 1000);
          });

          row.appendChild(btn);
          this.choicePaneContent.appendChild(row);
        }
      }
    }
  }

}


let dialogManager = null;
let dialogChoiceShouldAutoAdvance = true; // controls auto-advance from Choice nodes

function startMenuDialogSystem() {

  const infoBox = document.getElementById("infoBox");
  const speakerLabelContainer = document.getElementById("speakerLabelContainer");
  const speakerLabel = document.getElementById("speakerLabel");
  const dialogContent = document.getElementById("dialogContent");
  const choicePane = document.getElementById("choicePane");
  const choicePaneContent = document.getElementById("choicePaneContent");

  if (!infoBox || !dialogContent) return;

  dialogManager = new DialogManager({
    infoBox,
    speakerLabelContainer,
    speakerLabel,
    dialogContent,
    choicePane,
    choicePaneContent,
  });


  // Example dialog script; you can replace this with your own JSON array
  const introDialogScript = [
    {
      type: "Text",
      Speaker: "香橙熊",
      Content: "點擊任何地方跳過對話\n\n⏩⏩⏩",
      Event: "playNextPageSound",
    },
    /*{
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "聽村長說，你主動來幫忙趕走數字魔王，真的感謝你！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "容許我講講背景：\n\n我們島下一周就會舉辦菠蘿節，\n農夫伯伯會分享香甜菠蘿給大家吃！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "但魔王把我們的菠蘿全變成了硬硬的箱子，\n還説如果不能把他們排好順序，就不能品嘗美味的菠蘿了！",
      Event: "playNextPageSound",
    },
    {
      type: "Text",
      Speaker: "菠蘿島-啊波",
      Content: "我們導游又不懂數學，小兄弟你能試一試嗎？",
      Event: "playNextPageSound",
    },*/
    {
      type: "Choice",
      Question: "想知道任務內容嗎？",
      AnswerNo: 2,
      AnswerArr: ["好", "不用了，謝謝"],
    },
    {
      type: "Choice",
      Question: "你想在哪一個範圍夾鑰匙？",
      AnswerNo: 3,
      AnswerArr: ["Level 1\n0 至 10", "Level 2\n11 至 20", "Level 3\n0 至 20"], /*"0至10 場地"*/
    },
    /*{
      type: "Choice",
      Question: "你想用哪一個夾子？",
      AnswerNo: 1,
      AnswerArr: ["正常夾子(允許1落差)"], //, "放大版夾子(允許2落差)"
    },*/
    {
      type: "TextFinal",
      Speaker: "香橙熊",
      Content: "水果熊，準備好了嗎？挑戰要開始啦！",
      Event: "playNextPageSound",
    },
  ];

  dialogManager.loadScript(introDialogScript);
  dialogManager.start();
}

// Example: handle dialog choices and map to mode/difficulty
// You can modify or remove this listener if you want to process choices elsewhere

document.addEventListener("dialogChoiceSelected", (event) => {
  const detail = event.detail;
  if (!detail || !detail.node) return;

  const { node, answerIndex, answerText } = detail;

    if (node.type === "Choice" && typeof node.Question === "string") {
        if (node.Question.includes("任務內容")) {
      // Tutorial: user wants to hear about the task instructions
      if (answerIndex === 0 && typeof openTutorial === "function") {
        // Stay on this dialog page until the tutorial window is closed.
        dialogChoiceShouldAutoAdvance = false;
        openTutorial();
      } else {
        // For "不用了，謝謝" or other answers, allow normal auto-advance.
        dialogChoiceShouldAutoAdvance = true;
      }
    } else if (node.Question.includes("範圍")) {

      // Range selection (currently only one option: 0 至 20)
      menuConfig.rangeLabel = answerText;
      menuConfig.rangeMax = answerIndex === 0 ? 20 : null;

      // If there is no clamp-choice step in the dialog script,
      // apply a default clamp tolerance and start directly.
      const hasClampChoiceStep =
        dialogManager &&
        Array.isArray(dialogManager.script) &&
        dialogManager.script.some(
          (scriptNode) =>
            scriptNode &&
            scriptNode.type === "Choice" &&
            typeof scriptNode.Question === "string" &&
            scriptNode.Question.includes("夾子")
        );

            if (!hasClampChoiceStep) {
        menuConfig.clampTolerance = 1;
        menuConfig.clampLabel = "正常夾子(允許1落差)";

        // Mark that we intend to start the game after the final dialogue audio.
        window.__menuPendingStartDifficulty = "easy";
      }
    } else if (node.Question.includes("夾子")) {
      // Clamp / tolerance selection
      const tolerance = 1;
      //const tolerance = answerIndex + 1;
      menuConfig.clampTolerance = tolerance;
      menuConfig.clampLabel = answerText;

      // Mark that we intend to start the game after the final dialogue audio.
      window.__menuPendingStartDifficulty = "easy";
      
    }
  }
});

// When the dialog sequence has completed (after the final TextFinal node
// and its audio), show a zooming helper bear image, then redirect to the
// game page once the enlargement animation has completed.
document.addEventListener("dialogSequenceCompleted", () => {
  // Avoid running twice in case of accidental duplicate events.
  if (window.__finalBearAnimationStarted) return;
  window.__finalBearAnimationStarted = true;

  // Use any pending difficulty decided by the dialog choices, or fall back
  // to the current menuConfig.level, or "easy" as a default.
  const difficulty =
    window.__menuPendingStartDifficulty || menuConfig.level || "easy";

    const viewportContainer =
    document.getElementById("viewport-container") || document.body;

  // Ensure no stale bear image from a previous visit.
  let bear = document.getElementById("finalBearZoom");
  if (bear && bear.parentNode) {
    bear.parentNode.removeChild(bear);
  }

  // Create the helper bear image in the center of the screen.
  bear = document.createElement("img");
  bear.id = "finalBearZoom";
  bear.src = "./bear_trans_blue.png";
  bear.alt = "水果熊助手";

  // Centered, over everything else.
  bear.style.position = "fixed";
  bear.style.left = "50%";
  bear.style.top = "51%";
  // Start very small so that scaling to 1 is effectively (10/0.05)x enlargement.
  bear.style.transform = "translate(-50%, -50%) scale(0.05)";
  bear.style.transformOrigin = "center center";
  bear.style.zIndex = "2500";
  bear.style.pointerEvents = "none";

  // 3s enlargement with ease-in only.
  bear.style.transition = "transform 2000ms ease-in";

  viewportContainer.appendChild(bear);

  // Kick off the enlargement animation on the next frame.
  requestAnimationFrame(() => {
    bear.style.transform = "translate(-50%, -50%) scale(70)";
  });

  const handleTransitionEnd = (event) => {
    if (event.propertyName !== "transform") return;

    bear.removeEventListener("transitionend", handleTransitionEnd);

    // Clean up the bear image before redirecting.
    if (bear && bear.parentNode) {
      bear.parentNode.removeChild(bear);
    }

    // Make the redirect immediate within startGame, and clear our flags.
    window.__menuRedirectDelayMs = 0;
    window.__menuPendingStartDifficulty = null;

    // Use the existing startGame logic to perform the redirect
    // after the zoom animation has finished.
    startGame(difficulty);
  };

  bear.addEventListener("transitionend", handleTransitionEnd);
});





// ======================= Title Animation =======================


//document.addEventListener("DOMContentLoaded", () => {
// 

function waitForDocumentMediaReady(timeoutMs = 8000) {
  const mediaElements = Array.from(document.querySelectorAll("audio, video"));
  if (!mediaElements.length) {
    return Promise.resolve();
  }

  const perElementPromises = mediaElements.map((el) => {
    return new Promise((resolve) => {
      let done = false;
      const handleReady = () => {
        if (done) return;
        done = true;
        el.removeEventListener("canplaythrough", handleReady);
        el.removeEventListener("loadeddata", handleReady);
        resolve();
      };
      el.addEventListener("canplaythrough", handleReady, { once: true });
      el.addEventListener("loadeddata", handleReady, { once: true });

      // Safety net: if a particular media element never reports ready,
      // continue after a timeout so the menu can still appear.
      setTimeout(handleReady, timeoutMs);
    });
  });

  return Promise.all(perElementPromises);
}

function preloadDialogAudio(timeoutMs = 8000) {
  const audioPromises = [];

    // Ensure the dialog sound effects are created.
  if (!nextPageAudio) {
    var nextUrl = window.sanitizeMediaUrl
      ? window.sanitizeMediaUrl("next_page_sound.mp3")
      : "next_page_sound.mp3";
    if (nextUrl) {
      nextPageAudio = new Audio(nextUrl);
    }
  }
  if (!selectAudio) {
    var selectUrl = window.sanitizeMediaUrl
      ? window.sanitizeMediaUrl("select_sound.mp3")
      : "select_sound.mp3";
    if (selectUrl) {
      selectAudio = new Audio(selectUrl);
    }
  }

  // Ensure the per-dialogue voice tracks are created.
  if (!Array.isArray(dialogTrackAudios) || dialogTrackAudios.length < MENU_DIALOG_TRACK_COUNT) {
    dialogTrackAudios = [];
    for (let i = 0; i < MENU_DIALOG_TRACK_COUNT; i++) {
      var rawTrackSrc = getDialogTrackSrc(i);
      var trackUrl = window.sanitizeMediaUrl
        ? window.sanitizeMediaUrl(rawTrackSrc)
        : rawTrackSrc;
      if (!trackUrl) {
        continue;
      }
      const audioEl = new Audio(trackUrl);
      dialogTrackAudios.push(audioEl);
    }
  }


  const allAudios = [...dialogTrackAudios, nextPageAudio, selectAudio];

  allAudios.forEach((audioEl) => {
    audioEl.preload = "auto";
    audioEl.load();

    audioPromises.push(
      new Promise((resolve) => {
        let done = false;
        const handleReady = () => {
          if (done) return;
          done = true;
          audioEl.removeEventListener("canplaythrough", handleReady);
          audioEl.removeEventListener("loadeddata", handleReady);
          resolve();
        };
        audioEl.addEventListener("canplaythrough", handleReady, { once: true });
        audioEl.addEventListener("loadeddata", handleReady, { once: true });

        // Safety net timeout.
        setTimeout(handleReady, timeoutMs);
      })
    );
  });

  return Promise.all(audioPromises);
}


function waitForMenuAssetsReady(timeoutMs = 8000) {
  // Wait for canvas visuals, document-level media, and dialog audio
  // to be ready before revealing interactive UI elements.
  return Promise.all([
    visualAssetsReadyPromise,
    waitForDocumentMediaReady(timeoutMs),
    preloadDialogAudio(timeoutMs),
  ]).catch(() => {
    // If anything fails to load, continue anyway so the menu remains usable.
  });
}

// Bear walking intro animation
const BEAR_IMAGE_SOURCES = [
  "./bear_side.png",
  "./bear_walk_side.png",
  "./bear_walk_left_ground.png",
  "./bear_walk_right_ground.png",
  "./bear_back.png",
  "./bear_front.png",
];

function preloadBearImages(timeoutMs = 8000) {
  const uniqueSrcs = Array.from(new Set(BEAR_IMAGE_SOURCES));
  const preloadPromises = uniqueSrcs.map((src) => {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        img.removeEventListener("load", finish);
        img.removeEventListener("error", finish);
        resolve();
      };
      img.addEventListener("load", finish, { once: true });
      img.addEventListener("error", finish, { once: true });
      img.src = src;
      setTimeout(finish, timeoutMs);
    });
  });
  return Promise.all(preloadPromises);
}

function runBearWalkSequence() {
  return new Promise((resolve) => {
    const walkingBear = document.getElementById("walkingBearSprite");
    if (!walkingBear) {
      resolve();
      return;
    }

    function getElementWidthVw(element) {
      if (!element) return 0;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
      const rect = element.getBoundingClientRect();
      if (rect && rect.width > 0) {
        return (rect.width / viewportWidth) * 100;
      }

      const computedWidthPx = parseFloat(window.getComputedStyle(element).width || "0");
      if (!Number.isNaN(computedWidthPx) && computedWidthPx > 0) {
        return (computedWidthPx / viewportWidth) * 100;
      }

      return 0;
    }

    function getMovingBearWidthVw() {
      return getElementWidthVw(walkingBear);
    }

    function getBearLeftForRightEdgeVw(rightEdgeVw) {
      return rightEdgeVw - getMovingBearWidthVw()/2;
    }

    // Ensure starting position and size
    walkingBear.style.left = "-5vw";
    walkingBear.style.top = "25vh";

    const WALK_X_FRAMES = ["./bear_side.png", "./bear_walk_side.png"];
    const WALK_Y_FRAMES = ["./bear_walk_left_ground.png", "./bear_walk_right_ground.png"];

    const frameIntervalMs = 100; // 0.1s per frame

    function animateSegment(options) {
      const { fromLeft, fromTop, toLeft, toTop, durationMs, direction } = options;

      return new Promise((segmentResolve) => {
                const startTime = performance.now();
        let lastFrameSwitch = startTime;
        let frameIndex = 0;
        let frames;

        // Choose frames based on movement direction
        if (direction === "y+") {
          frames = WALK_Y_FRAMES;
        } else if (direction === "y-") {
          // Final upward movement uses a static back-facing sprite
          frames = ["./bear_back.png"];
        } else {
          frames = WALK_X_FRAMES;
        }

        // Set horizontal flip based on direction
        if (direction === "x-") {
          // Walking to the left: flip horizontally
          walkingBear.style.transform = "scaleX(-1)";
        } else if (direction === "x+") {
          // Walking to the right: normal orientation
          walkingBear.style.transform = "scaleX(1)";
        }
        // For "y+" and "y-" we leave the current transform as-is


        function step(now) {
          const elapsed = now - startTime;
          const t = Math.min(elapsed / durationMs, 1);

          const currentLeft = fromLeft + (toLeft - fromLeft) * t;
          const currentTop = fromTop + (toTop - fromTop) * t;

          walkingBear.style.left = `${currentLeft}vw`;
          walkingBear.style.top = `${currentTop}vh`;

          // Toggle sprite frame
          if (now - lastFrameSwitch >= frameIntervalMs) {
            frameIndex = (frameIndex + 1) % frames.length;
            walkingBear.src = frames[frameIndex];
            lastFrameSwitch = now;
          }

          if (t < 1) {
            requestAnimationFrame(step);
          } else {
            // Snap to final position and reset to first frame for this direction
            walkingBear.style.left = `${toLeft}vw`;
            walkingBear.style.top = `${toTop}vh`;
            walkingBear.src = frames[0];
            segmentResolve();
          }
        }

        // Set initial frame
        walkingBear.src = frames[0];
        requestAnimationFrame(step);
      });
    }

    (async () => {
      await animateSegment({
        fromLeft: -5,
        fromTop: 20,
        toLeft: 22.5,
        toTop: 20,
        durationMs: 1250,
        direction: "x+",
      });

      await animateSegment({
        fromLeft: 22.5,
        fromTop: 20,
        toLeft: 22.5,
        toTop: 40,
        durationMs: 500,
        direction: "y+",
      });

      await animateSegment({
        fromLeft: 22.5,
        fromTop: 40,
        toLeft: 15,
        toTop: 40,
        durationMs: 500,
        direction: "x-",
      });

      await animateSegment({
        fromLeft: 15,
        fromTop: 40,
        toLeft: 15,
        toTop: 80,
        durationMs: 1500,
        direction: "y+",
      });

          const rightEdgeTargetVw = 45;
          const finalBearLeftVw = getBearLeftForRightEdgeVw(rightEdgeTargetVw);

            // 3) Walk in +x direction: (15vw,80vh) -> (45vw,80vh) where bear right edge ends at 45vw
      await animateSegment({
        fromLeft: 15,
        fromTop: 80,
            toLeft: finalBearLeftVw,
        toTop: 80,
        durationMs: 1500,
        direction: "x+",
      });

      // 2. After this segment completes, turn the static bear to face front
      //    and show an exclamation speech bubble for 2 seconds.
      const helperBear = document.getElementById("helperBearSprite");
      if (helperBear) {
        helperBear.src = "./bear_front.png";
        // Front-facing bear: no horizontal flip
        helperBear.style.transform = "scaleX(1)";
      }

            if (typeof showExclamSpeechBubble === "function") {
              var rawSrc = "npc_bear_noticed.mp3";
              var noticeUrl = window.sanitizeMediaUrl
                ? window.sanitizeMediaUrl(rawSrc)
                : rawSrc;
              if (noticeUrl) {
                var noticeAudio = new Audio(noticeUrl);
                noticeAudio.preload = "auto";
                noticeAudio.load();
                if (typeof stopCurrentDialogAudio === "function") {
                  stopCurrentDialogAudio();
                }
                if (window.safePlayMedia) {
                  window.safePlayMedia(noticeAudio).catch(function () {});
                } else {
                  noticeAudio.play().catch(function () {});
                }
              }
              showExclamSpeechBubble();
            }



      await new Promise((sleepResolve) => setTimeout(sleepResolve, 2000));

      // 3. Then turn the static bear to side view (flipped),
      //    hide the speech bubble, and have the walking bear use bear_back.png
      //    for one final upward movement.
      if (helperBear) {
        helperBear.src = "./bear_side.png";
        // Side-view helper bear should face left (horizontal flip)
        helperBear.style.transform = "scaleX(-1)";
      }
      hideDialogSpeechBubble();

      walkingBear.src = "./bear_back.png";

      await animateSegment({
        fromLeft: finalBearLeftVw,
        fromTop: 80,
        toLeft: finalBearLeftVw,
        toTop: 67.5,
        durationMs: 1500,
        direction: "y-",
      });

      // After all movement is complete, show the moving bear in side view.
      walkingBear.src = "./bear_side.png";

      resolve();
    })();
  });
}




window.onload = async function() {


  // Ensure video and audio assets are ready before we reveal and animate the menu UI.
  try {
    await waitForMenuAssetsReady();
  } catch (_) {}

  // Optionally restore last-used settings into menuConfig
  loadLastMenuSettingsIfEnabled();


  /*if(!window.location.hash) {
      window.location = window.location + '#loaded';
      window.location.reload(true);
  }*/

  const title = document.getElementById("gameTitle");
  const menuContainer = document.getElementById("menu");
  const menuButtons = menuContainer
    ? Array.from(menuContainer.querySelectorAll(".menu-arrow"))
    : [];
  const infoBox = document.getElementById("infoBox");
  const gameHeader = document.querySelector(".game-header");

  // 初始化教學視窗 DOM 與事件
  initTutorialUI();

  if (title) {
    // 初始狀態：隱藏並放在畫面上方
    title.style.opacity = "0";
    title.style.transform = "translateY(-100%)";
  }

  let titleIntroStarted = false;

  const startTitleIntro = () => {
    if (!title || titleIntroStarted) return;
    titleIntroStarted = true;

    // 確保標題顯示
    title.style.display = "";

    // 使用原來的飛入動畫
    requestAnimationFrame(() => {
      title.classList.add("fly-in-title");
    });

    // 當飛入動畫結束後，啟動飛出與菜單顯示流程
    const handleFlyInEnd = (event) => {
      if (event.animationName === "flyInFromTop") {
        title.removeEventListener("animationend", handleFlyInEnd);
        startTitleExitAndMenu();
      }
    };
    title.addEventListener("animationend", handleFlyInEnd);
  };

  const startTitleExitAndMenu = () => {
    if (!title) return;

    // 標題向下飛出畫面
    title.classList.add("fly-out-title");

    // 當標題飛出動畫完成後，讓 header 滑入
    const handleFlyOutEnd = (event) => {
      if (event.animationName !== "flyOutToBottom") return;

      title.removeEventListener("animationend", handleFlyOutEnd);

      // 讓頂部 header 從左邊滑入
      if (gameHeader) {
        gameHeader.classList.add("header-roll-out");
      }

      // 2 秒後（標題飛出完成後的既有流程），隱藏標題並顯示左側菜單標籤
      setTimeout(() => {
        title.style.display = "none";

        if (menuContainer) {
          menuContainer.classList.add("menu-visible");

          menuButtons.forEach((button, index) => {
            button.style.transitionDelay = `${index * 0.15}s`;
            button.classList.add("menu-arrow-visible");
          });

          if (infoBox && menuButtons.length > 0) {
            const lastDelayMs = (menuButtons.length - 1) * 150;
            const slideDurationMs = 1000;
            setTimeout(() => {
              infoBox.classList.remove("opacity-0", "pointer-events-none");
              infoBox.classList.add("opacity-100", "pointer-events-auto");

              // 中央透明提示框出現後，再啟動對話系統
              startMenuDialogSystem();
            }, lastDelayMs + slideDurationMs);
          }
        }
      }, 2000);
    };

    // 監聽標題飛出動畫結束
    title.addEventListener("animationend", handleFlyOutEnd);
  };

    // 確保頁面載入時，左側菜單處於隱藏狀態
    if (menuContainer) {
      menuContainer.classList.remove("menu-visible");
    }

        // 定義主選單開場流程：先預載入熊角色圖片，再行走熊，後標題與菜單動畫
    async function startMenuIntroSequence() {
      try {
        // Preload all bear_* images using JavaScript before any animation runs.
        await preloadBearImages();
      } catch (_) {}

      try {
        await runBearWalkSequence();
      } catch (_) {}

      startTitleIntro();
    }

    // 只有當準備覆蓋層完全消失後，才開始行走熊與標題動畫
    if (typeof window.hidePrepOverlay === "function") {
      window.onPrepOverlayHidden = async function () {
        if (typeof window.playPrepBgMusicLoop === "function") {
          window.playPrepBgMusicLoop();
        }

        await startMenuIntroSequence();
      };

      window.hidePrepOverlay();
    } else {
      // 如果沒有覆蓋層，直接開始主選單開場流程
      startMenuIntroSequence();
    }
}
//});