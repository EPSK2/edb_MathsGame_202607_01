// ======================= 2.5D Jungle Canvas =======================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Show the preparation/loading overlay while game assets are loading.
if (typeof window.showPrepOverlay === "function") {
  window.showPrepOverlay("Tangerine");
}

// Gift box / claw catch shared state
let activeGiftBox = null;

let activeGiftValue = null;
let pendingCatchGift = false;
let hasCaughtGift = false;
let caughtGiftEl = null;

// Track guesses for the current round (used by the SEN smart wrong-option logic).
// Each entry is { target, guess, isHit } for the active gift.
let currentRoundGuesses = [];

// Wooden sign video removed


// Gift control panel / monitor state
let giftPanelState = {
  phase: "hidden", // "hidden" | "prompt" | "typing" | "moving" | "error" | "success"
  inputValue: "",
  keyboardEnabled: false,
  maxValue: null,
};

let giftControlPanel = null;
let giftMonitor = null;
let giftMonitorMessage = null;
let giftMonitorInput = null;
let giftDigitButtons = [];
let giftResetButton = null;
let giftMoveButton = null;
let giftZeroButton = null;
let giftButtonsInitialised = false;
let giftKeySequenceTimers = [];
let giftInputRestoreTimer = null;
let giftButtonsLocked = false;

// URL sanitisation and safe HTMLMediaElement playback helpers.
// These are shared across game_2 and menu_2 to prevent corrupt URLs
// (e.g. containing %00) and to centralise play() promise handling.
(function () {
  var CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/g;
  function sanitizeMediaUrl(raw) {
    if (typeof raw !== "string") return null;

    var cleaned = raw.replace(CONTROL_CHARS_REGEX, "").trim();
    if (!cleaned) return null;

    var urlObj;
    try {
      // Resolve relative path against current page location
      var baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
      urlObj = new URL(cleaned, baseDir);
    } catch (e) {
      return null;
    }

    // ✅ ADDED "file:" HERE so it works locally on your PC!
    var protocol = urlObj.protocol;
    if (
      protocol !== "http:" &&
      protocol !== "https:" &&
      protocol !== "file:" &&
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
      // Older browsers: no promise; we still respect races by checking
      // requestId when callers chain on the returned value.
      return Promise.resolve();
    }

    return playPromise
      .then(function () {
        if (state.requestId !== requestId) {
          // A newer request has superseded this one; stop this playback.
          try {
            mediaEl.pause();
          } catch (_) {}
          return;
        }
      })
      .catch(function (err) {
        if (state.requestId !== requestId) {
          // Error from an outdated request; ignore.
          return;
        }
        console.error("[media] play() promise rejected", err);
      });
  }

  // Expose helpers globally so menu_2 and other scripts can share them.
  if (!window.sanitizeMediaUrl) {
    window.sanitizeMediaUrl = sanitizeMediaUrl;
  }
  if (!window.safePlayMedia) {
    window.safePlayMedia = safePlayMedia;
  }
})();


// ======================= Claw Machine (Zdog) =======================


function initClawMachine() {
    const clawCanvas = document.getElementById("clawCanvas");
  if (!clawCanvas || typeof Zdog === "undefined") {
    return;
  }

  // Match the claw canvas width to the viewport so that positions
  // along the bottom number line (0 to max) can always be mapped
  // directly to visible clamp positions.
  clawCanvas.width = window.innerWidth;
  clawCanvas.height = 600;

  const clawZoom = 2;
  const illo = new Zdog.Illustration({
    element: clawCanvas,
    dragRotate: false,
    zoom: clawZoom,
  });



  const colors = {

    pureBlack: "#000000",
    deepCharcoal: "#0a0a0a",
    matteBlack: "#111111",
    darkGrey: "#1a1a1a",
    highlightGrey: "#222222",
  };

    const thicknessScale = 0.2;
  const modelScale = 0.25;
  // Rod length controls:
  // - Increase upperRodLength to make the top hanging segment longer.
  // - Increase lowerRodLength to make the bottom hanging segment longer.
  // Keep the same values in the anchor translate/path definitions below.
  const upperRodLength = 17.5;
  const lowerRodLength = 30;

    const clawRoot = new Zdog.Anchor({
      addTo: illo,
    });

    // Upper rod anchor: attaches at the steel bar centre and swings
    // with a limited angle (no more than ±10° from vertical).
    const upperRodAnchor = new Zdog.Anchor({
      addTo: clawRoot,
    });

    // Lower rod anchor: hinged at the end of the upper rod and swings
    // relative to the upper rod for a two-segment pendulum effect.
    const lowerRodAnchor = new Zdog.Anchor({
      addTo: upperRodAnchor,
      // Controls where the lower rod starts; match this to upperRodLength.
      translate: { y: upperRodLength },
    });

    // Main anchor to hold the entire assembly (scaled and offset from the lower rod hinge).
    const clawAssembly = new Zdog.Anchor({
      addTo: lowerRodAnchor,
      // Scale the claw geometry down to 25% (size reduced by 75%)
      scale: modelScale,
      // Offset so the top of the drop cable sits exactly at the lower rod hinge.
      translate: { y: 150 * modelScale },
    });

    const baseTranslateY = 150 * modelScale;

    let targetRootX = 0;
    let currentRootX = 0;
    let rootVelX = 0;

    // Two-segment pendulum state: upper and lower rods.
    let upperRodAngle = 0;
    let upperRodVel = 0;
    let lowerRodAngle = 0;
    let lowerRodVel = 0;

    // Upper rod angle limit: ±10° from vertical.
    const maxUpperAngle = Math.PI / 18; // 10 degrees

    let lastAnimTime = null;

    // Eased horizontal movement state for the claw when it is instructed to move.
    let isMoving = false;
    let moveStartX = 0;
    let moveEndX = 0;
    let moveStartTime = 0;
    let moveDuration = 0;

    // Clamp movement duration so very short moves still feel smooth,
    // and longer moves do not take too long. Speed is in Zdog units / second.
    const minMoveDuration = 0.3;
    const maxMoveDuration = 2;
    const maxMoveSpeed = 10;


        function controlClawPosition(value) {
    const svg = document.getElementById("numberLineSVG");
    if (!svg || !clawCanvas || !clawRoot || !illo) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const maxScale = getNumberLineScaleFromGameState();
    const maxValue = maxScale && maxScale > 0 ? maxScale : 10;

    let v = typeof value === "number" ? value : 0;
    if (v < 0) v = 0;
    if (v > maxValue) v = maxValue;

    // Map 0 to the left tick at x=50, and maxValue to the right tick at x=4950
    const startX = 50;
    const endX = 4950;
    const totalWidth = endX - startX;
    const xSvg = startX + (v / maxValue) * totalWidth;

    // Convert SVG coordinate to screen coordinate using rect and the known viewBox
    const viewBoxWidth = 5000;
    const ratioX = xSvg / viewBoxWidth;
    const desiredScreenX = rect.left + ratioX * rect.width;

    // Translate the desired bottom number-line position into Zdog units.
    const clawRect = clawCanvas.getBoundingClientRect();
    const clawCenterX = clawRect.left + clawRect.width / 2;
    const deltaScreenX = desiredScreenX - clawCenterX;
    const unitsX = deltaScreenX / clawZoom;

    const newTarget = unitsX;

    // Set up an eased movement from the current position to the new target.
    const distance = Math.abs(newTarget - currentRootX);
    targetRootX = newTarget;


    if (distance < 0.001) {
      // No meaningful move required.
      isMoving = false;
      moveDuration = 0;
      moveStartX = currentRootX;
      moveEndX = currentRootX;
      rootVelX = 0;
      return;
    }

    moveStartX = currentRootX;
    moveEndX = newTarget;
    moveStartTime = performance.now();

    // Compute an ideal duration based on distance and the maximum speed,
    const idealDuration = distance / maxMoveSpeed;
    moveDuration = Math.min(maxMoveDuration, Math.max(minMoveDuration, idealDuration));
    isMoving = true;
  }



  window.controlClawPosition = controlClawPosition;



    // Upper rod: first half of the drop cable attached at the steel bar.
  new Zdog.Shape({
    addTo: upperRodAnchor,
    // Change upperRodLength to adjust the visible length of the upper rod.
    path: [{ y: 2.5 }, { y: 20 }],
    stroke: 12 * thicknessScale,
    color: colors.darkGrey,
  });

  // Lower rod: second half of the drop cable hinged at the end of the upper rod.
  new Zdog.Shape({
    addTo: lowerRodAnchor,
    // Change lowerRodLength to adjust the visible length of the lower rod.
    path: [{ y: 0 }, { y: 30 }],
    stroke: 12 * thicknessScale,
    color: colors.darkGrey,
  });



  // Main Cylinder Housing
  new Zdog.Cylinder({
    addTo: clawAssembly,
    diameter: 50,
    length: 60,
    stroke: false,
    color: colors.matteBlack,
    backface: colors.pureBlack,
    rotate: { x: Zdog.TAU / 4 },
    translate: { y: -60 },
  });

  // Top Housing Cap
  new Zdog.Cylinder({
    addTo: clawAssembly,
    diameter: 54,
    length: 10,
    stroke: false,
    color: colors.pureBlack,
    rotate: { x: Zdog.TAU / 4 },
    translate: { y: -90 },
  });

  // Bottom Housing Cap (Anchor point for arms)
  new Zdog.Cylinder({
    addTo: clawAssembly,
    diameter: 54,
    length: 15,
    stroke: false,
    color: colors.pureBlack,
    rotate: { x: Zdog.TAU / 4 },
    translate: { y: -30 },
  });

  // Central Actuator Shaft
  new Zdog.Cylinder({
    addTo: clawAssembly,
    diameter: 16,
    length: 40,
    stroke: false,
    color: "#3f9b0b",
    rotate: { x: Zdog.TAU / 4 },
    translate: { y: -5 },
  });

    // Sliding Actuator Hub
  new Zdog.Polygon({
    addTo: clawAssembly,
    radius: 20 * thicknessScale,
    sides: 6,
    stroke: 10 * thicknessScale,
    color: "#3f9b0b",
    rotate: { x: Zdog.TAU / 4 },
    translate: { y: 15 },
  });


  // --- THE CLAW PRONGS (3-Way Rotational Symmetry) ---

  for (let i = 0; i < 3; i++) {
    // Create an anchor for each arm, rotated evenly around the Y axis
    const armAnchor = new Zdog.Anchor({
      addTo: clawAssembly,
      rotate: { y: (Zdog.TAU / 3) * i },
    });

        // 1. Upper Diagonal Strut (Connects housing to knuckle)
    new Zdog.Shape({
      addTo: armAnchor,
      path: [
        { y: -30, z: 27 }, // Attach to bottom housing cap
        { y: 15, z: 80 }, // Knuckle joint
      ],
      stroke: 14 * thicknessScale, // THICK
      color: "#3f9b0b",
    });


        // 2. Horizontal Actuator Linkage (Connects sliding hub to knuckle)
    new Zdog.Shape({
      addTo: armAnchor,
      path: [
        { y: 15, z: 20 }, // Attach to actuator hub
        { y: 15, z: 80 }, // Knuckle joint
      ],
      stroke: 12 * thicknessScale,
      color: "#e42100",
    });


        // 3. Knuckle Joint Bolt (Detail)
    new Zdog.Shape({
      addTo: armAnchor,
      stroke: 18 * thicknessScale,
      color: "#fcd2df",
      translate: { y: 15, z: 80 },
    });


        // 4. The Curved Claw Grabber
    new Zdog.Shape({
      addTo: armAnchor,
      path: [
        { y: 15, z: 80 }, // Start at knuckle
        {
          bezier: [
            { y: 60, z: 110 }, // Control point 1 (bows outward)
            { y: 130, z: 90 }, // Control point 2 (curves down)
            { y: 160, z: 10 }, // Tip of the claw (curves inward)
          ],
        },
      ],
      closed: false,
      stroke: 22 * thicknessScale, // EXTRA THICK
      color: "#e42100",
    });


        // 5. Claw Tip (Slight taper/point)
    new Zdog.Cone({
      addTo: armAnchor,
      diameter: 22 * thicknessScale,
      length: 25 * thicknessScale,
      stroke: false,
      color: "#fcd2df",
      translate: { y: 160, z: 10 },
      // Rotate the cone to point inward along the trajectory of the bezier curve
      rotate: { x: Zdog.TAU / 4.5 },
    });

  }

                // --- ANIMATION LOOP ---
  function animateClaw() {
    const now = performance.now();
    const dt = lastAnimTime ? (now - lastAnimTime) / 1000 : 0;
    lastAnimTime = now;

    // Horizontal eased movement (ease-in / ease-out when instructed to move).
    const prevRootX = currentRootX;

    if (isMoving && moveDuration > 0 && dt > 0) {
      const elapsedSeconds = (now - moveStartTime) / 1000;
      const tNorm = Math.max(0, Math.min(elapsedSeconds / moveDuration, 1));

      // Ease-in-out (quadratic) for smoother start/stop.
      const eased =
        tNorm < 0.5
          ? 2 * tNorm * tNorm
          : -1 + (4 - 2 * tNorm) * tNorm;

      currentRootX = moveStartX + (moveEndX - moveStartX) * eased;

      if (tNorm >= 1) {
        currentRootX = moveEndX;
        isMoving = false;
        moveDuration = 0;
      }
    }

    // Derive a velocity from position change so the swing physics
    // can respond to clamp movement.
    if (dt > 0) {
      rootVelX = (currentRootX - prevRootX) / dt;

      // Impose a maximum horizontal speed to keep motion controlled.
      const maxSpeed = maxMoveSpeed;
      if (rootVelX > maxSpeed) rootVelX = maxSpeed;
      else if (rootVelX < -maxSpeed) rootVelX = -maxSpeed;
    }

        const horizontalVel = rootVelX;
        clawRoot.translate.x = currentRootX;

        // Two-segment pendulum: upper rod (limited to ±10°) and lower rod.
        const kUpper = 2.5;
        const cUpper = 1.8;
        const couplingUpper = 0.04; // how much horizontal motion drives the upper rod

        const kLower = 3.2;
        const cLower = 2.1;
        const couplingLowerVel = 0.03;  // lower rod response to horizontal motion
        const couplingLowerAngle = 0.015; // lower rod response to upper rod angle

        // Upper rod dynamics
        upperRodVel +=
          (-kUpper * upperRodAngle -
            cUpper * upperRodVel +
            couplingUpper * horizontalVel) * dt;

        upperRodAngle += upperRodVel * dt;

        // Enforce upper rod angle limit (±10° from vertical).
        if (upperRodAngle > maxUpperAngle) {
          upperRodAngle = maxUpperAngle;
          if (upperRodVel > 0) upperRodVel = -upperRodVel * 0.4;
        } else if (upperRodAngle < -maxUpperAngle) {
          upperRodAngle = -maxUpperAngle;
          if (upperRodVel < 0) upperRodVel = -upperRodVel * 0.4;
        }

        // Lower rod dynamics: responds to both upper rod and horizontal motion.
        lowerRodVel +=
          (-kLower * lowerRodAngle -
            cLower * lowerRodVel +
            couplingLowerVel * horizontalVel +
            couplingLowerAngle * upperRodAngle) * dt;

        lowerRodAngle += lowerRodVel * dt;

        const t = now * 0.001;

        // When the clamp is idle (no commanded movement), make the
        // bobbing and tilting 100% more vigorous (double amplitude).
        const idleFactor = isMoving ? 1.0 : 2.0;

        const idleTiltX = Math.sin(t * 0.9) * 0.10 * idleFactor;
        const idleTiltY = Math.cos(t * 0.7) * 0.10 * idleFactor;
        const idleBobY = Math.sin(t * 0.5) * 6 * modelScale * idleFactor;
        const idleDepth = Math.cos(t * 0.8) * 8 * modelScale * idleFactor;

        // Apply the two-segment swing rotations.
        upperRodAnchor.rotate.z = upperRodAngle;
        lowerRodAnchor.rotate.z = lowerRodAngle;

        clawAssembly.rotate.x = idleTiltX;
        clawAssembly.rotate.y = idleTiltY;

        clawAssembly.translate.y = baseTranslateY + idleBobY;
        clawAssembly.translate.z = idleDepth;

        illo.updateRenderGraph();
        requestAnimationFrame(animateClaw);
  }




  animateClaw();
}






function initClawMachinePNG() {
  const clawCanvas = document.getElementById("clawCanvas");
  if (!clawCanvas) {
    return;
  }

  const clawCtx = clawCanvas.getContext("2d");
  if (!clawCtx) {
    return;
  }

  // Match the claw canvas width to the viewport so that positions
  // along the bottom number line (0 to max) can always be mapped
  // directly to visible clamp positions.
  clawCanvas.width = window.innerWidth;
  clawCanvas.height = 600;

  const clawImage = new Image();
  clawImage.src = "./trendy-grab-machine-vector.png";

  let imageLoaded = false;
  clawImage.addEventListener("load", () => {
    imageLoaded = true;
  });
  clawImage.addEventListener("error", () => {
    // If the image fails to load, we still run the animation loop to
    // avoid breaking controlClawPosition callers.
    imageLoaded = false;
  });

  // Horizontal movement state (canvas-pixel coordinates relative to
  // the canvas centre).
  let targetRootX = 0;
  let currentRootX = 0;
  let rootVelX = 0;

  // Single pendulum state: swing angle around the steel bar and its
  // angular velocity.
  let swingAngle = 0;
  let swingVel = 0;

  // Swing angle limit:  b110 b0 from vertical.
  const maxSwingAngle = Math.PI / 18; // 10 degrees

  // Eased horizontal movement state for the claw when it is instructed to move.
  let isMoving = false;
  let moveStartX = 0;
  let moveEndX = 0;
  let moveStartTime = 0;
  let moveDuration = 0;

  // Clamp movement duration so very short moves still feel smooth,
  // and longer moves do not take too long. Speed is in pixels / second.
  const minMoveDuration = 0.3;
  const maxMoveDuration = 4;
  const maxMoveSpeed = 200; // horizontal movement speed (slower than before)


  let lastAnimTime = null;

  function controlClawPosition(value) {
    const svg = document.getElementById("numberLineSVG");
    if (!svg || !clawCanvas) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const maxScale = getNumberLineScaleFromGameState();
    const maxValue = maxScale && maxScale > 0 ? maxScale : 10;

    let v = typeof value === "number" ? value : 0;
    if (v < 0) v = 0;
    if (v > maxValue) v = maxValue;

    // Map 0 to the left tick at x=50, and maxValue to the right tick at x=4950
    const startX = 50;
    const endX = 4950;
    const totalWidth = endX - startX;
    const xSvg = startX + (v / maxValue) * totalWidth;

    // Convert SVG coordinate to screen coordinate using rect and the known viewBox
    const viewBoxWidth = 5000;
    const ratioX = xSvg / viewBoxWidth;
    const desiredScreenX = rect.left + ratioX * rect.width;

    const clawRect = clawCanvas.getBoundingClientRect();
    const clawCenterX = clawRect.left + clawRect.width / 2;
    const deltaScreenX = desiredScreenX - clawCenterX;

    // Use screen-pixel units directly for the claw's horizontal motion.
    const newTarget = deltaScreenX;

    const distance = Math.abs(newTarget - currentRootX);
    targetRootX = newTarget;

    if (distance < 0.001) {
      // No meaningful move required.
      isMoving = false;
      moveDuration = 0;
      moveStartX = currentRootX;
      moveEndX = currentRootX;
      rootVelX = 0;
      return;
    }

    moveStartX = currentRootX;
    moveEndX = newTarget;
    moveStartTime = performance.now();

    // Compute an ideal duration based on distance and the maximum speed,
    // then clamp into a friendly 0.3 e20 e24 second window.
    const idealDuration = distance / maxMoveSpeed;
    moveDuration = Math.min(maxMoveDuration, Math.max(minMoveDuration, idealDuration));
    isMoving = true;
  }

  window.controlClawPosition = controlClawPosition;

  function animateClaw() {
    const now = performance.now();
    const dt = lastAnimTime ? (now - lastAnimTime) / 1000 : 0;
    lastAnimTime = now;

    const prevRootX = currentRootX;

    if (isMoving && moveDuration > 0 && dt > 0) {
      const elapsedSeconds = (now - moveStartTime) / 1000;
      const tNorm = Math.max(0, Math.min(elapsedSeconds / moveDuration, 1));

      // Ease-in-out (quadratic) for smoother start/stop.
      const eased =
        tNorm < 0.5
          ? 2 * tNorm * tNorm
          : -1 + (4 - 2 * tNorm) * tNorm;

      currentRootX = moveStartX + (moveEndX - moveStartX) * eased;

      if (tNorm >= 1) {
        currentRootX = moveEndX;
        isMoving = false;
        moveDuration = 0;
      }
    }

    if (dt > 0) {
      rootVelX = (currentRootX - prevRootX) / dt;

      // Impose a maximum horizontal speed to keep motion controlled.
      const maxSpeed = maxMoveSpeed;
      if (rootVelX > maxSpeed) rootVelX = maxSpeed;
      else if (rootVelX < -maxSpeed) rootVelX = -maxSpeed;
    }

    const horizontalVel = rootVelX;

    // Single pendulum dynamics: damped spring driven by horizontal velocity.
    const kSwing = 2.5;
    const cSwing = 1.8;
    const couplingSwing = 0.04;

    swingVel +=
      (-kSwing * swingAngle -
        cSwing * swingVel +
        couplingSwing * horizontalVel) * dt;

    swingAngle += swingVel * dt;

    // Enforce swing angle limit ( b110 b0 from vertical).
    if (swingAngle > maxSwingAngle) {
      swingAngle = maxSwingAngle;
      if (swingVel > 0) swingVel = -swingVel * 0.4;
    } else if (swingAngle < -maxSwingAngle) {
      swingAngle = -maxSwingAngle;
      if (swingVel < 0) swingVel = -swingVel * 0.4;
    }

    const t = now * 0.001;

    // When the clamp is idle (no commanded movement), make the
    // bobbing a bit more vigorous (double amplitude).
    const idleFactor = isMoving ? 1.0 : 2.0;
    const idleBobY = Math.sin(t * 0.5) * 6 * idleFactor;

    clawCtx.clearRect(0, 0, clawCanvas.width, clawCanvas.height);

    if (!imageLoaded || !clawImage.width || !clawImage.height) {
      requestAnimationFrame(animateClaw);
      return;
    }

    const basePivotY = clawCanvas.height / 2;
    const pivotY = basePivotY + idleBobY;
    const pivotX = clawCanvas.width / 2 + currentRootX;

    const imgWidth = clawImage.width;
    const imgHeight = clawImage.height;

    clawCtx.save();
    clawCtx.translate(pivotX, pivotY);
    clawCtx.rotate(swingAngle);
    // Draw the image so that its top centre is at the pivot.
    clawCtx.drawImage(
      clawImage,
      -imgWidth / 2,
      0,
      imgWidth,
      imgHeight
    );
    clawCtx.restore();

    requestAnimationFrame(animateClaw);
  }

  // Keep the claw canvas responsive to viewport width.
  window.addEventListener("resize", () => {
    clawCanvas.width = window.innerWidth;
    clawCanvas.height = 600;
  });

  animateClaw();
}



// Legacy Zdog claw machine kept for reference but no longer used.
// All interactive claw motion now drives a DOM <img> element instead.

function initClawMachinePNG() {
  const img = document.getElementById("clawMachineImage");
  if (!img) {
    return;
  }

  const clawSrcClosed = "./trendy-grab-machine-vector_closed.png";
  const clawSrcOpen = "./trendy-grab-machine-vector_open.png";

    // Track how close the last failed attempt was (for human fail voices).
  let lastAttemptNearMiss = false;
  // Store the numeric difference between gift position and claw for the last failed attempt.
  let lastAttemptDiff = null;


  // Ensure the clamp image starts in the open state.
  try {
    img.src = clawSrcOpen;
  } catch (_) {}

  // Ensure the clamp swings around the top centre (steel bar).
  img.style.transformOrigin = "50% 0%";



  // Horizontal movement state (pixels relative to viewport centre).
  let targetRootX = 0;
  let currentRootX = 0;
  let rootVelX = 0;

    // Conceptual number-line position for the claw; home is slightly left of 0
  // in terms of the number line, but its physical home position is aligned
  // horizontally with the rightmost edge of the helper bear image.
  const clawHomeValue = -2;
  let clawCurrentValue = clawHomeValue;

  function getClawHomeRootX() {
    // Try to align the claw centre with the rightmost point of the bear image.
    const bear = document.getElementById("pineappleBearImage");
    if (bear) {
      const rect = bear.getBoundingClientRect();
      const bearRight = rect.right;
      const viewportCenterX = window.innerWidth / 2;
      // currentRootX is interpreted as a delta from the viewport centre.
      // Choosing (bearRight - viewportCenterX) makes the claw centre sit
      // exactly at the bear's rightmost X coordinate when it is at home.
      return bearRight - viewportCenterX;
    }

    // Fallback: if the bear image is unavailable, keep the previous
    // behaviour of placing home slightly left of 0 on the number line.
    const fallbackX = getRootXForNumberLineValue(clawHomeValue);
    return typeof fallbackX === "number" ? fallbackX : 0;
  }

  // Initialise the claw so it starts at its home position aligned to the bear.
  const initialHomeX = getClawHomeRootX();
  currentRootX = initialHomeX;
  targetRootX = initialHomeX;



  // Single pendulum state: swing angle around the steel bar and its
  // angular velocity.
  let swingAngle = 0;
  let swingVel = 0;

  // Swing angle limit: ±10° from vertical.
  const maxSwingAngle = Math.PI / 18; // 10 degrees

  // Eased horizontal movement state for the claw when it is instructed to move.
  let isMoving = false;
  let moveStartX = 0;
  let moveEndX = 0;
  let moveStartTime = 0;
  let moveDuration = 0;

  // Clamp movement duration so very short moves still feel smooth,
  // and longer moves do not take too long. Speed is in pixels / second.
  const minMoveDuration = 0.3;
  const maxMoveDuration = 3;
  const maxMoveSpeed = 20; // horizontal movement speed (100% faster)


  let lastAnimTime = null;

    // Vertical debug-motion state for "Down" button.
  let verticalPhase = "idle"; // "idle" | "down" | "hold" | "up"
  let verticalStartTime = 0;
  
  let verticalMaxOffset = 0; // pixels the claw can travel down from the bar (updated dynamically)
  const verticalDownDuration = 1.25; // seconds to move fully down (100% faster)
  const verticalHoldDuration = 1.5; // seconds to stay at bottom
  const verticalUpDuration = 1.25; // seconds to move back up (100% faster)
  let pendingDropAfterMove = false;


  let currentOffsetY = 0;
  let rodLineEl = null;
  let roundOutcomePending = false;



        function getRootXForNumberLineValue(rawValue) {
    const svg = document.getElementById("numberLineSVG");
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    const maxScale = getNumberLineScaleFromGameState();
    const maxValue = maxScale && maxScale > 0 ? maxScale : 10;

    const startX = 50;
    const endX = 4950;
    const totalWidth = endX - startX;

    const v = typeof rawValue === "number" ? rawValue : 0;
    const xSvg = startX + (v / maxValue) * totalWidth;

    const viewBoxWidth = 5000;
    const ratioX = xSvg / viewBoxWidth;
    const desiredScreenX = rect.left + ratioX * rect.width;

    const viewportCenterX = window.innerWidth / 2;
    const deltaScreenX = desiredScreenX - viewportCenterX;

    return deltaScreenX;
  }

    function controlClawPosition(value) {
    const maxScale = getNumberLineScaleFromGameState();
    const maxValue = maxScale && maxScale > 0 ? maxScale : 10;

    let v = typeof value === "number" ? value : 0;
    if (v < 0) v = 0;
    if (v > maxValue) v = maxValue;

    const newTarget = getRootXForNumberLineValue(v);
    if (newTarget == null) {
      return;
    }

    const distance = Math.abs(newTarget - currentRootX);
    targetRootX = newTarget;
    clawCurrentValue = v;

    if (distance < 0.001) {
      // No meaningful move required.
      isMoving = false;
      moveDuration = 0;
      moveStartX = currentRootX;
      moveEndX = currentRootX;
      rootVelX = 0;
      return;
    }

    moveStartX = currentRootX;
    moveEndX = newTarget;
    moveStartTime = performance.now();

    // Compute an ideal duration based on distance and the maximum speed,
    // then clamp into a friendly 0.3–4 second window.
    const idealDuration = distance / maxMoveSpeed;
    moveDuration = Math.min(
      maxMoveDuration,
      Math.max(minMoveDuration, idealDuration)
    );
    isMoving = true;
  }

        function moveClawToHome() {
    // Home position: centre of the claw aligned with the bear's right edge.
    const homeX = getClawHomeRootX();

    const distance = Math.abs(homeX - currentRootX);
    targetRootX = homeX;
    clawCurrentValue = clawHomeValue;

    if (distance < 0.001) {
      isMoving = false;
      moveDuration = 0;
      moveStartX = currentRootX;
      moveEndX = currentRootX;
      rootVelX = 0;
      return;
    }

    moveStartX = currentRootX;
    moveEndX = homeX;
    moveStartTime = performance.now();

    const idealDuration = distance / maxMoveSpeed;
    moveDuration = Math.min(
      maxMoveDuration,
      Math.max(minMoveDuration, idealDuration)
    );
    isMoving = true;
  }


  window.controlClawPosition = controlClawPosition;
                function startClawDropCycle() {
      // Compute a vertical offset that aligns the claw so that its top
      // stops 50px above the gift box's top edge.
      const barEl = document.getElementById("clawBar");
      if (barEl) {
        const barRect = barEl.getBoundingClientRect();
        const barBottomY = barRect.bottom;
        const giftEl = document.querySelector(".gift-box img") || document.querySelector(".gift-box");

        if (giftEl) {
          const giftRect = giftEl.getBoundingClientRect();
          const giftTopY = giftRect.top;
          // Clamp maximum downward travel so the claw's top is always
          // 50px above the gift box's top coordinate.
          verticalMaxOffset = Math.max(0, giftTopY - barBottomY - giftRect.height);
        } else {
          // Fallback: use the original target height when no gift is found.
          const targetGiftY = window.innerHeight * 0.675;
          verticalMaxOffset = Math.max(0, targetGiftY - barBottomY);
        }
      } else {
        verticalMaxOffset = Math.max(0, window.innerHeight * 0.675);
      }




      // Count every full drop cycle (down/hold/up) as an attempt, regardless
      // of whether the claw successfully catches the gift.
      if (window.gameCookie && typeof window.gameCookie.recordDropAttempt === "function") {
        window.gameCookie.recordDropAttempt();
      }


      // Determine if the current claw position is close enough to the gift
      // (within ±clampTolerance on the number line) to allow catching,
      // and whether a failed attempt should be treated as a "near miss".
            pendingCatchGift = false;
      hasCaughtGift = false;
      caughtGiftEl = null;
      lastAttemptNearMiss = false;
      lastAttemptDiff = null;

            if (
        activeGiftBox &&
        typeof activeGiftValue === "number" &&
        typeof clawCurrentValue === "number"
      ) {
        const tolerance =
          typeof gameState.clampTolerance === "number" &&
          gameState.clampTolerance > 0
            ? gameState.clampTolerance
            : 1;
        const diff = Math.abs(activeGiftValue - clawCurrentValue);
        if (diff <= tolerance) {
          // Will be a success if the claw catches the gift.
          pendingCatchGift = true;
          lastAttemptNearMiss = false;
          lastAttemptDiff = null;
        } else {
          // Missed; store difference and mark as "near miss" if within ±3 on the number line.
          pendingCatchGift = false;
          lastAttemptDiff = diff;
          lastAttemptNearMiss = diff <= 3;
        }

        // Record this attempt for the SEN estimation profile (local + historical).
        const { rangeMin, rangeMax } = getCurrentRangeAndTolerance();
        saveAttemptToHistory(activeGiftValue, clawCurrentValue, rangeMin, rangeMax);
      } else {
        lastAttemptNearMiss = false;
        lastAttemptDiff = null;
      }



            verticalPhase = "down";
      verticalStartTime = performance.now();


      // Play running gear sound for the downward motion (final 3 seconds of the clip).
      if (typeof window.playRunningGearSegment === "function") {
        window.playRunningGearSegment();
      }

      // Mark that a round outcome should be resolved once the claw
      // has completed its down/hold/up motion and returned home.
      if (giftPanelState && giftPanelState.phase === "moving") {
        roundOutcomePending = true;
      }

  }


        function debugClawDown() {
    if (verticalPhase === "idle") {
      if (isMoving) {
        pendingDropAfterMove = true;
        return;
      }

      startClawDropCycle();
    }
  }



  window.debugClawDown = debugClawDown;

    function handleRoundOutcome() {
      if (hasCaughtGift && caughtGiftEl) {
        // Correct estimation / successful catch: clear current round log so
        // future MC questions only analyse fresh misses.
        resetCurrentRoundGuesses();

        if (typeof showGiftSuccessMessage === "function") {
          showGiftSuccessMessage();
        }


        // Use the cookie/run-state module to advance multi-level progress
        // and decide whether this is a middle-level success or the final
        // overall victory.
        let isFinalLevel = false;
        let completedLevelIndex = 1;
        let totalLevels = 5;
        let totalAttempts = null;

        if (window.gameCookie) {
          const api = window.gameCookie;

          if (typeof api.handleLevelCompleted === "function") {
            api.handleLevelCompleted();
          }

          const state = typeof api.getRunState === "function" ? api.getRunState() : null;
          if (state) {
            completedLevelIndex = typeof state.levelsCompleted === "number" && state.levelsCompleted > 0
              ? state.levelsCompleted
              : (typeof state.currentLevelIndex === "number" ? state.currentLevelIndex : 1);
            totalLevels = typeof api.LEVELS_PER_RUN === "number" ? api.LEVELS_PER_RUN : 5;
            isFinalLevel = state.status === "complete" || completedLevelIndex >= totalLevels;
          }

          if (typeof api.getTotalDropAttemptsForRun === "function") {
            totalAttempts = api.getTotalDropAttemptsForRun();
          }
        }

        if (isFinalLevel) {
          // Final victory for the whole run
          if (typeof window.playTotalVictory === "function") {
            window.playTotalVictory();
          }
          setTimeout(() => {
            showVictoryModal(true, completedLevelIndex, totalLevels, totalAttempts);
            createConfetti();
          }, 2600);
        } else {
          // Middle-level success (not yet the last gift)
          if (typeof window.playMiddleLevelSuccessSfx === "function") {
            window.playMiddleLevelSuccessSfx();
          }
          setTimeout(() => {
            showVictoryModal(false, completedLevelIndex, totalLevels, totalAttempts);
          }, 2600);
        }
      } else {
        if (typeof showGiftErrorMessage === "function") {
          showGiftErrorMessage();
        }
        handleWrongAttemptForHints();
      }

    }


  function animateClaw() {
    const now = performance.now();
    const dt = lastAnimTime ? (now - lastAnimTime) / 1000 : 0;
    lastAnimTime = now;

    const prevRootX = currentRootX;

    if (isMoving && moveDuration > 0 && dt > 0) {
      const elapsedSeconds = (now - moveStartTime) / 1000;
      const tNorm = Math.max(0, Math.min(elapsedSeconds / moveDuration, 1));

      // Ease-in-out (quadratic) for smoother start/stop.
      const eased =
        tNorm < 0.5
          ? 2 * tNorm * tNorm
          : -1 + (4 - 2 * tNorm) * tNorm;

      currentRootX = moveStartX + (moveEndX - moveStartX) * eased;

      if (tNorm >= 1) {
        currentRootX = moveEndX;
        isMoving = false;
        moveDuration = 0;
      }
    }

    if (dt > 0) {
      rootVelX = (currentRootX - prevRootX) / dt;

      // Impose a maximum horizontal speed to keep motion controlled.
      const maxSpeed = maxMoveSpeed;
      if (rootVelX > maxSpeed) rootVelX = maxSpeed;
      else if (rootVelX < -maxSpeed) rootVelX = -maxSpeed;
    }

    if (pendingDropAfterMove && verticalPhase === "idle" && !isMoving) {
      pendingDropAfterMove = false;
      startClawDropCycle();
    }

    const horizontalVel = rootVelX;

    // Single pendulum dynamics: damped spring driven by horizontal velocity.
    const kSwing = 2.5;
    const cSwing = 1.8;
    const couplingSwing = 0.04;

    swingVel +=
      (-kSwing * swingAngle -
        cSwing * swingVel +
        couplingSwing * horizontalVel) * dt;

    swingAngle += swingVel * dt;

    // Enforce swing angle limit (±10° from vertical).
    if (swingAngle > maxSwingAngle) {
      swingAngle = maxSwingAngle;
      if (swingVel > 0) swingVel = -swingVel * 0.4;
    } else if (swingAngle < -maxSwingAngle) {
      swingAngle = -maxSwingAngle;
      if (swingVel < 0) swingVel = -swingVel * 0.4;
    }

        const t = now * 0.001;

    // Update vertical offset based on current debug phase.
        if (verticalPhase === "down") {
      const elapsedDown = (now - verticalStartTime) / 1000;
      const normDown = Math.max(
        0,
        Math.min(elapsedDown / verticalDownDuration, 1)
      );
      currentOffsetY = verticalMaxOffset * normDown;
      if (normDown >= 1) {
        currentOffsetY = verticalMaxOffset;
        verticalPhase = "hold";
        verticalStartTime = now;

        // At the lowest point, attach the gift if we decided it was
        // close enough horizontally.
        if (pendingCatchGift && activeGiftBox) {
          hasCaughtGift = true;
          caughtGiftEl = activeGiftBox;

                    const imgRect = img.getBoundingClientRect();
          const imgCenterX = imgRect.left + imgRect.width / 2;
          const imgBottomY = imgRect.bottom;

          // Center of the gift should coincide with the bottom center
          // of the claw image.
          const giftCenterY = imgBottomY;

          activeGiftBox.style.left = `${imgCenterX}px`;
          activeGiftBox.style.top = `${giftCenterY}px`;

        }
      }
                                } else if (verticalPhase === "hold") {
      const elapsedHold = (now - verticalStartTime) / 1000;
      currentOffsetY = verticalMaxOffset;
      if (elapsedHold >= verticalHoldDuration) {
        verticalPhase = "up";
        verticalStartTime = now;

        // Play running gear sound for the upward motion (final 3 seconds of the clip).
                if (typeof window.playRunningGearSegment === "function") {
          window.playRunningGearSegment();
        }

        if (typeof window.playClawAttemptSuccess === "function" && hasCaughtGift) {
          window.playClawAttemptSuccess();
                } else if (!hasCaughtGift) {
          // Failed attempt: play mechanical fail, then human fail voice
          // chosen based on how close the guess was (±3 => hopeful fail).
          if (typeof window.playClawAttemptFail === "function") {
            window.playClawAttemptFail();
          }
          if (typeof window.playVoiceRoboticFail === "function") {
            window.playVoiceRoboticFail(lastAttemptDiff);
          }
        }


      }


        } else if (verticalPhase === "up") {

      const elapsedUp = (now - verticalStartTime) / 1000;
      const normUp = Math.max(
        0,
        Math.min(elapsedUp / verticalUpDuration, 1)
      );
      currentOffsetY = verticalMaxOffset * (1 - normUp);
      if (normUp >= 1) {
        currentOffsetY = 0;
        verticalPhase = "idle";
        // After finishing the upward motion, always return the claw
        // horizontally to its home (-2) position.
        moveClawToHome();
      }
    } else {
      currentOffsetY = 0;
    }

        // When a full down/hold/up cycle has finished and the claw has
    // returned horizontally to its home (-2) position, resolve the round
    // outcome once per attempt.
    if (verticalPhase === "idle" && roundOutcomePending && !isMoving) {
      roundOutcomePending = false;
      handleRoundOutcome();
    }



                // Switch claw image between open/closed based on vertical motion.

    // Open when idle or moving down; closed once it reaches the lowest
    // point and while carrying the gift back up.
        if (hasCaughtGift || verticalPhase === "hold" || verticalPhase === "up") {
      // Once a gift is successfully caught, keep the claw closed.
      if (img.src !== clawSrcClosed) {
        try {
          img.src = clawSrcClosed;
        } catch (_) {}
      }
    } else {
      if (img.src !== clawSrcOpen) {
        try {
          img.src = clawSrcOpen;
        } catch (_) {}
      }
    }



    // Apply transform including vertical offset.
    img.style.transform =
      `translateX(-50%) ` +
      `translateX(${currentRootX}px) ` +
      `translateY(${currentOffsetY}px) ` +
      `rotate(${swingAngle}rad) ` +
      `scale(0.1)`;

    // Update or create the vertical rod line that connects the steel bar

    // to the top of the claw image while it is hanging below the bar.
    if (!rodLineEl) {
      rodLineEl = document.createElement("div");
      rodLineEl.id = "clawRodLine";
      rodLineEl.style.position = "fixed";
      rodLineEl.style.left = "50%";
      rodLineEl.style.transform = "translateX(-50%)";
      rodLineEl.style.width = "0.8vw";
      rodLineEl.style.pointerEvents = "none";
      rodLineEl.style.zIndex = "1150";
      rodLineEl.style.background =
        "linear-gradient(to bottom, #000000 0%, #222222 40%, #111111 100%)";
      rodLineEl.style.boxShadow =
        "0 0.3vh 0.8vh rgba(0, 0, 0, 0.9), " +
        "0 -0.1vh 0.4vh rgba(255, 255, 255, 0.18), " +
        "inset 0 0.1vh 0.2vh rgba(255, 255, 255, 0.2), " +
        "inset 0 -0.1vh 0.2vh rgba(0, 0, 0, 0.7)";
      document.body.appendChild(rodLineEl);
    }

        const barEl = document.getElementById("clawBar");
    if (barEl && rodLineEl) {
      const barRect = barEl.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const barBottomY = barRect.bottom;
      const imgTopY = imgRect.top;

      const rodLength = Math.max(0, imgTopY - barBottomY);
      if (rodLength > 0.5) {
                const imgCenterX = imgRect.left + imgRect.width / 2;
        rodLineEl.style.left = `${imgCenterX}px`;
        rodLineEl.style.transform = "translate(-50%, 0)";
        rodLineEl.style.top = `${barBottomY}px`;
        rodLineEl.style.height = `${rodLength}px`;
        rodLineEl.style.display = "block";
      } else {
        rodLineEl.style.height = "0px";
        rodLineEl.style.display = "none";
      }
    }

    // If a gift has been caught, keep it aligned with the claw while it
    // travels back up.
        if (hasCaughtGift && caughtGiftEl) {
      const imgRect = img.getBoundingClientRect();
      const imgCenterX = imgRect.left + imgRect.width / 2;
      const imgBottomY = imgRect.bottom;

      // Keep the gift centered exactly at the bottom center
      // of the claw while it travels back up.
      const giftCenterY = imgBottomY;

      caughtGiftEl.style.left = `${imgCenterX}px`;
      caughtGiftEl.style.top = `${giftCenterY}px`;
    }



    requestAnimationFrame(animateClaw);
  }



  // Keep the horizontal mapping responsive when the viewport resizes.
  window.addEventListener("resize", () => {
    // No immediate re-layout needed; future controlClawPosition calls
    // will read the updated viewport and SVG geometry.
  });

  animateClaw();
}


if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClawMachinePNG);
} else {
  initClawMachinePNG();
}





function resizeCanvas() {

  if (!canvas) return;
  // Full-screen canvas to match CSS (100% width and height)
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

const birdPalette = ["#f32c6d", "#fe9500", "#fbe318", "#6c1dbd",
  "#fb8318", "#095fee"]; // "#65d30c"
const MAX_BIRDS_IN_SCENE = 0;
const birdPaths = {
  backWing: new Path2D(
    "M 110 182 C 145 140, 190 70, 240 40 C 255 30, 265 38, 260 55 C 245 100, 230 145, 215 185 C 180 180, 145 180, 110 182 Z"
  ),
  body: new Path2D(
    "M 10 225 L 32 218 C 52 195, 72 185, 96 182 C 140 185, 180 190, 224 195 C 276 205, 328 210, 380 206 C 384 205, 388 209, 386 215 C 370 220, 355 225, 345 235 C 360 250, 375 265, 384 282 C 386 288, 382 292, 376 290 C 320 275, 260 280, 200 285 C 140 285, 90 270, 50 250 C 40 240, 35 235, 32 232 Z"
  ),
  frontWing: new Path2D(
    "M 96 182 C 142 165, 202 95, 264 55 C 280 40, 290 48, 288 64 C 272 125, 248 165, 224 195 C 180 190, 140 185, 96 182 Z"
  ),
};
const birds = [];

function lightenHexColor(hexColor, amount) {
  const normalized = hexColor.replace("#", "");
  const channels = [0, 2, 4].map((index) =>
    parseInt(normalized.slice(index, index + 2), 16)
  );

  const lighterChannels = channels.map((channel) =>
    Math.round(channel + (255 - channel) * amount)
  );

  return `rgb(${lighterChannels[0]}, ${lighterChannels[1]}, ${lighterChannels[2]})`;
}

function getBirdVerticalBand() {
  if (!canvas) {
    return { minY: 0, maxY: 0 };
  }

  return {
    minY: canvas.height * 0.2,
    maxY: canvas.height * 0.5,
  };
}

function createBird(spawnX) {
  const { minY, maxY } = getBirdVerticalBand();
  const scale = 0.08 + Math.random() * 0.1;
  const wobbleAmplitude = Math.random() * 14;
  const safeMinY = minY + wobbleAmplitude;
  const safeMaxY = Math.max(safeMinY, maxY - wobbleAmplitude);
  const bodyColor = birdPalette[Math.floor(Math.random() * birdPalette.length)];

  return {
    x: typeof spawnX === "number" ? spawnX : Math.random() * canvas.width,
    baseY: safeMinY + Math.random() * Math.max(1, safeMaxY - safeMinY),
    scale,
    speedX: -(900 + Math.random() * 1350) * scale,
    flapSpeed: Math.random() * 0.01,
    flapPhase: Math.random() * Math.PI * 2,
    bodyPitchAmount: 0.03 + Math.random() * 0.02,
    wobbleSpeed: 0 + Math.random() * 0.01,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleAmplitude,
    bodyColor,
    backWingColor: lightenHexColor(bodyColor, 0.5),
  };
}

function resetBird(bird, spawnX) {
  const replacement = createBird(
    typeof spawnX === "number" ? spawnX : canvas.width + 120 + Math.random() * 240
  );
  Object.assign(bird, replacement);
}

function initBirdFlock() {
  if (!canvas) return;

  const targetBirdCount = Math.min(
    MAX_BIRDS_IN_SCENE,
    Math.max(6, Math.round(window.innerWidth / 220))
  );

  birds.length = 0;
  for (let index = 0; index < targetBirdCount; index += 1) {
    birds.push(createBird((index / targetBirdCount) * (canvas.width + 220)));
  }
}

function updateAndDrawBirds(time, dt) {
  if (!ctx || !canvas || birds.length === 0) return;

  const { minY, maxY } = getBirdVerticalBand();
  birds.sort((leftBird, rightBird) => leftBird.scale - rightBird.scale);

  birds.forEach((bird) => {
    bird.x += bird.speedX * dt;

    const visualYOffset =
      Math.sin(time * bird.wobbleSpeed + bird.wobblePhase) * bird.wobbleAmplitude;
    const drawY = Math.min(maxY, Math.max(minY, bird.baseY + visualYOffset));

    if (bird.x < -120) {
      resetBird(bird);
    }

    const flapCycle = Math.cos(time * bird.flapSpeed + bird.flapPhase);
    const wingRotation = -flapCycle * 0.22;
    const wingScaleY = Math.max(0.2, Math.abs(flapCycle));
    const bodyPitch = flapCycle * bird.bodyPitchAmount;

    ctx.save();
    ctx.translate(bird.x, drawY);
    ctx.scale(bird.scale, bird.scale);
    ctx.rotate(bodyPitch);
    ctx.translate(-200, -175);

    ctx.save();
    ctx.translate(110, 250);
    ctx.rotate(wingRotation);
    ctx.scale(1, wingScaleY);
    ctx.translate(-110, -182);
    ctx.fillStyle = bird.backWingColor;
    ctx.fill(birdPaths.backWing);
    ctx.restore();

    ctx.fillStyle = bird.bodyColor;
    ctx.fill(birdPaths.body);

    ctx.save();
    ctx.translate(96, 250);
    ctx.rotate(wingRotation);
    ctx.scale(1, wingScaleY);
    ctx.translate(-96, -182);
    ctx.fillStyle = bird.bodyColor;
    ctx.fill(birdPaths.frontWing);
    ctx.restore();

    ctx.restore();
  });
}

resizeCanvas();
initBirdFlock();
window.addEventListener("resize", () => {
  resizeCanvas();
  initBirdFlock();
  initCrates();
  if (typeof sunshineEffect !== "undefined" && sunshineEffect) {
    sunshineEffect.handleResize();
  }
  // Keep the gift panel triangle aligned when the viewport changes.
  updateGiftPanelTriangle();
});




// Image assets
const images = {
  fieldBg: new Image(),
  crate: new Image(),
  cloud: new Image(), // NEW
  pineapple: new Image(),
};

// Use provided assets
images.fieldBg.src = "./cm_01.png";





const layers = {

  deepBackground: {
    image: images.fieldBg,
    blur: 0, // subtle depth-of-field on far background
  },
};


const crateConfig = {
  count: 5,
  scale: 0.2,
  minXRatio: 0.55,
  maxXRatio: 0.95,
  minYRatio: 0.2,
  maxYRatio: 0.75,
  minGap: 5,
};


let crates = [];


// ======================= Animation Manager =======================

// All visual effect animations live here, rendered on top of the scene.
const animations = [];





// Pineapple overlay removed (no success fruits)



// Track timing so we can move things in pixels/second
let lastFrameTime = 0;

/**
 * Triggered when a number is correctly placed.
 * Spawns:
 *  - Smoke cloud (cloud.png)
 *  - Pineapple hop with the number inside
 *  - Persistent green checkmark
 *
 * @param {number} x - Canvas X coordinate (relative to gameCanvas)
 * @param {number} y - Canvas Y coordinate (relative to gameCanvas)
 * @param {number} number - The numeric value placed
 */
function playSuccessEffect(x, y, number, restOffset, checkX, checkY) {
  // Success effect removed (no game scoring)
}





/**
 * Update and draw all active animations.
 * Must be called from gameLoop AFTER all other rendering.
 *
 * @param {number} timeMs - current timestamp from requestAnimationFrame
 * @param {number} dtSeconds - delta time in seconds since last frame
 */
function updateAndDrawAnimations(timeMs, dtSeconds) {
  if (!ctx) return;



  for (let i = animations.length - 1; i >= 0; i--) {
    const anim = animations[i];


                    if (anim.type === "checkmark") {
      // --- Green checkmark with 3s fade-in ---
      const elapsed = anim.startTime ? timeMs - anim.startTime : 0;
      let alpha = 1;
      if (anim.duration) {
        const t = Math.max(0, Math.min(elapsed / anim.duration, 1));
        alpha = t; // fade in from 0 to 1
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#22c55e"; // green
      ctx.shadowColor = "black";
      ctx.shadowBlur = 4;
      ctx.fillText("✅", anim.x, anim.y);
      ctx.restore();
    }
  }
}





function initCrates() {
  // Crates / numbered clouds removed
}



function drawCrates() {
  // Crates removed
}


// Arrow path connecting stump centres (canvas coordinates)
let stumpCenters = [];

function updateNumberTilePositions() {

  if (!crates.length) return;

  const tiles = document.querySelectorAll('.num[data-role="pool"]');
  if (!tiles.length) return;

  tiles.forEach((tile, index) => {
    // Lock each tile to its original "home" crate index the first time we
    // lay it out, so its home position never changes after initialisation.
    let crateIndex;
    if (tile.dataset.homeCrateIndex != null) {
      crateIndex = parseInt(tile.dataset.homeCrateIndex, 10);
      if (Number.isNaN(crateIndex)) {
        crateIndex = index % crates.length;
        tile.dataset.homeCrateIndex = String(crateIndex);
      }
    } else {
      crateIndex = index % crates.length;
      tile.dataset.homeCrateIndex = String(crateIndex);
    }

    const crate = crates[crateIndex];
    if (!crate) return;

        // Treat each crate's logical point as the centre of the numbered tile cloud.
    // Ensure tiles sit above other overlays and remain draggable.
    tile.style.position = tile.style.position || "absolute";
    tile.style.zIndex = tile.style.zIndex || "500";

    // With base .num transform set to translate(-50%, -100%), the inline
    // left/top represent the visual centre (X) and bottom (Y). We anchor
    // the tile's centre on the crate centre.
    const centerX = crate.cx;
    const centerY = crate.cy;

    tile.style.left = `${centerX}px`;
    tile.style.top = `${centerY}px`;

  });
}




function drawDeepBackground() {
  if (!ctx || !images.fieldBg.complete) return;
  ctx.save();
  ctx.filter = `blur(${layers.deepBackground.blur}px)`;
  ctx.drawImage(images.fieldBg, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}


// Draw a white arrow connecting the centres of the layout anchors and
// indicating ascending/descending direction.
function drawModeArrow() {
  // Mode arrow on stumps removed
}


// DOM overlay arrow drawn directly on top of the stump images.
const SVG_NS = "http://www.w3.org/2000/svg";
let domModeArrowSvg = null;

// SVG layer for drawing "<" comparison symbols between pineapples.
let pineappleCompareSvg = null;

// SVG layer for the triangular extension attached to the bottom-right
// corner of the gift control panel.
let giftPanelTriangleSvg = null;


function ensurePineappleCompareSvg() {
  if (pineappleCompareSvg) return pineappleCompareSvg;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "pineapple-compare-layer";
  svg.style.position = "fixed";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  // Above stumps/cubes and mode arrow, but below victory modal.
  svg.style.zIndex = "450";
  document.body.appendChild(svg);
  pineappleCompareSvg = svg;
  return svg;
}

function computeAveragePineappleY() {
  if (!pineapplePositions || pineapplePositions.length === 0) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < pineapplePositions.length; i++) {
    sum += pineapplePositions[i].y;
  }
  return sum / pineapplePositions.length;
}

// Draw one "<" symbol (with border lines to each pineapple) for a
// specific neighbouring pair of pineapples. The symbol is drawn over
// 2 seconds using a stroke-dashoffset animation.
function drawPineappleComparisonSymbol(leftPos, rightPos, avgYCanvas) {
  if (!canvas) return;
  const svg = ensurePineappleCompareSvg();
  const canvasRect = canvas.getBoundingClientRect();

  const leftScreenX = canvasRect.left + leftPos.x;
  const leftScreenY = canvasRect.top + leftPos.y;
  const rightScreenX = canvasRect.left + rightPos.x;
  const rightScreenY = canvasRect.top + rightPos.y;

  // Centre of the symbol in canvas and screen coordinates.
  const centerXCanvas = (leftPos.x + rightPos.x) / 2;
  const centerScreenX = canvasRect.left + centerXCanvas;
  const centerScreenY = canvasRect.top + avgYCanvas;

  // Symbol size proportional to the horizontal gap between pineapples,
  // but clamped to a sensible range.
  const horizontalGap = Math.abs(rightPos.x - leftPos.x);
  const baseSize = Math.max(32, Math.min(72, horizontalGap * 0.25));
  const halfWidth = baseSize / 2;
  const halfHeight = baseSize / 2;

  const path = document.createElementNS(SVG_NS, "path");
  const d = [
    "M",
    centerScreenX + halfWidth,
    centerScreenY - halfHeight,
    "L",
    centerScreenX - halfWidth,
    centerScreenY,
    "L",
    centerScreenX + halfWidth,
    centerScreenY + halfHeight,
  ].join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "white"); // warm yellow
  path.setAttribute("stroke-width", "4");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

    // Helper to initialise a 2-second stroke-draw animation.
  // Uses a JavaScript-driven requestAnimationFrame loop instead of
  // relying on CSS transitions so that the "<" symbols are always
  // drawn stroke-by-stroke, even on browsers that sometimes skip
  // dashoffset transitions.
  function animateStroke(el) {
    let length = 0;
    if (typeof el.getTotalLength === "function") {
      try {
        length = el.getTotalLength();
      } catch (e) {
        length = 0;
      }
    } else {
      // Fallback for <line> elements when getTotalLength is unavailable.
      const x1 = parseFloat(el.getAttribute("x1") || "0");
      const y1 = parseFloat(el.getAttribute("y1") || "0");
      const x2 = parseFloat(el.getAttribute("x2") || "0");
      const y2 = parseFloat(el.getAttribute("y2") || "0");
      length = Math.hypot(x2 - x1, y2 - y1);
    }

    // Robust fallback length to ensure we always get a visible animation.
    if (!length || !isFinite(length)) {
      length = 100;
    }

    el.style.strokeDasharray = String(length);
    el.style.strokeDashoffset = String(length);

    const durationMs = 2000; // 2 seconds
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.max(0, Math.min(elapsed / durationMs, 1)); // 0 → 1
      const currentOffset = length * (1 - t);
      el.style.strokeDashoffset = String(currentOffset);

      if (t < 1) {
        requestAnimationFrame(step);
      }
    }

    // Start animation on the next frame to ensure the initial
    // dashoffset state has been applied.
    requestAnimationFrame(step);
  }
  animateStroke(path);
}

// Schedule drawing of "<" symbols between neighbouring pineapples at
// end-game. Each symbol takes 2 seconds to draw with a 1 second pause
// before the next one starts.
function schedulePineappleComparisonDrawing() {
  if (!canvas) return;
  if (!pineapplePositions || pineapplePositions.length < 2) return;

  const svg = ensurePineappleCompareSvg();

  // Clear any previous symbols.
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Clone and sort pineapples by X so we know left-to-right order.
  const positions = pineapplePositions
    .map((pos) => ({ x: pos.x, y: pos.y }))
    .sort((a, b) => a.x - b.x);

  const avgY = computeAveragePineappleY();
  if (avgY == null) return;

  const pairs = [];
  for (let i = 0; i < positions.length - 1; i++) {
    pairs.push({ left: positions[i], right: positions[i + 1] });
  }

  if (!pairs.length) return;

  const mode = gameState.mode || "ascending";
  const orderedPairs =
    mode === "ascending" ? pairs : pairs.slice().reverse();

  // Each symbol: 2s draw + 1s pause => 3s per step.
  const stepDurationMs = 3000;

  orderedPairs.forEach((pair, index) => {
    const delay = index * stepDurationMs;
    setTimeout(() => {
      drawPineappleComparisonSymbol(pair.left, pair.right, avgY - 50);
    }, delay);
  });
}


function ensureDomModeArrowSvg() {
  if (domModeArrowSvg) return domModeArrowSvg;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "dom-mode-arrow";
  svg.style.position = "fixed";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  svg.style.zIndex = "400"; // above stumps/cubes
  document.body.appendChild(svg);
  domModeArrowSvg = svg;
  return svg;
}

function updateDomModeArrow() {
  const stumps = document.querySelectorAll(".slot-stump-image");
  if (!stumps.length || !canvas) return;

  const svg = ensureDomModeArrowSvg();

  // Clear previous arrow
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Build polyline through stump tops in screen coordinates
  const points = [];
  for (let i = 0; i < stumps.length; i++) {
    const rect = stumps[i].getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height * 0.5; // near top of stump
    points.push(`${x},${y}`);
  }

  if (points.length < 2) return;

  const polyline = document.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#ffffff");
  polyline.setAttribute("stroke-width", "5");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  svg.appendChild(polyline);

  // Arrowhead based on mode
  const mode = gameState.mode || "ascending";
  let headFromIndex;
  let headToIndex;
  if (mode === "ascending") {
    headFromIndex = stumps.length - 2;
    headToIndex = stumps.length - 1;
  } else {
    headFromIndex = 1;
    headToIndex = 0;
  }

  if (
    headFromIndex != null &&
    headToIndex != null &&
    headFromIndex >= 0 &&
    headToIndex >= 0 &&
    headFromIndex < stumps.length &&
    headToIndex < stumps.length
  ) {
    const fromRect = stumps[headFromIndex].getBoundingClientRect();
    const toRect = stumps[headToIndex].getBoundingClientRect();
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height * 0.5;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height * 0.5;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const arrowLen = 24;

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", toX);
    line.setAttribute("y1", toY);
    line.setAttribute(
      "x2",
      toX - arrowLen * Math.cos(angle - Math.PI / 6)
    );
    line.setAttribute(
      "y2",
      toY - arrowLen * Math.sin(angle - Math.PI / 6)
    );
    line.setAttribute("stroke", "#ffffff");
    line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    const line2 = document.createElementNS(SVG_NS, "line");
    line2.setAttribute("x1", toX);
    line2.setAttribute("y1", toY);
    line2.setAttribute(
      "x2",
      toX - arrowLen * Math.cos(angle + Math.PI / 6)
    );
    line2.setAttribute(
      "y2",
      toY - arrowLen * Math.sin(angle + Math.PI / 6)
    );
    line2.setAttribute("stroke", "#ffffff");
    line2.setAttribute("stroke-width", "5");
    line2.setAttribute("stroke-linecap", "round");
    svg.appendChild(line2);
  }
}


// Sunshine ray (god-rays / crepuscular rays) effect overlay
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
    // Multiple ray layers with different speeds to create a 2.5D parallax effect.
    this.layers = [
      {
        radiusScale: 1.2,
        beamCount: 40,
        baseAlpha: 0.18 + 0.16,
        noiseScale: 0.0008,
        speed: 0.00004,
      },
      {
        radiusScale: 1.4,
        beamCount: 30,
        baseAlpha: 0.12 + 0.16,
        noiseScale: 0.0012,
        speed: 0.00007,
      },
      {
        radiusScale: 1.6,
        beamCount: 20,
        baseAlpha: 0.08 + 0.16,
        noiseScale: 0.0016,
        speed: 0.0001,
      },
    ];
  }

  handleResize() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Off-screen / off-centre light source (80% X, -10% Y of viewport).
    this.lightSource.x = w * 0.8;
    this.lightSource.y = -h * 0.1;
    this.maxRadius = Math.sqrt(w * w + h * h) * 1.2;
  }

  // Smooth pseudo-noise using overlapping sine/cosine waves.
  noise2D(x, y, time) {
    const n1 =
      Math.sin(x * 0.0007 + time * 0.0013) *
      Math.cos(y * 0.0004 + time * 0.0011);
    const n2 =
      Math.sin(x * 0.0003 + time * 0.0009) *
      Math.cos(y * 0.0006 + time * 0.0017);
    return 0.5 + 0.5 * (0.6 * n1 + 0.4 * n2);
  }

  // 1D smooth noise used for global flicker.
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
    // Use "screen" blending so rays brighten the existing scene
    // without washing it out.
    ctx.globalCompositeOperation = "screen";

    const flicker = 0.7 + 0.3 * this.noise1D(this.noiseTime * 0.8);

    this.layers.forEach((layer, index) => {
      const radius = this.maxRadius * layer.radiusScale;
      const beamCount = layer.beamCount;
      const baseAlpha = layer.baseAlpha;

      for (let i = 0; i < beamCount; i++) {
        const angle =
          (i / beamCount) * Math.PI +
          this.noiseTime * layer.speed +
          index * 0.12;

        const startX = this.lightSource.x;
        const startY = this.lightSource.y;
        const endX = startX + Math.cos(angle) * radius;
        const endY = startY + Math.sin(angle) * radius;

        // march along the beam in small segments to create
        // volumetric, feathered light patches.
        const segments = 12;
        for (let s = 0; s < segments; s++) {
          const t = s / segments;
          const px = startX + (endX - startX) * t;
          const py = startY + (endY - startY) * t;

          // fade toward the far end of the beam
          const fade = 1 - t;
          const localNoise = this.noise2D(
            px + index * 50,
            py - index * 80,
            this.noiseTime * (1 + index * 0.25)
          );

          const alpha = baseAlpha * fade * localNoise * flicker;
          if (alpha <= 0.001) continue;

          const thickness =
            60 * (1 - t) * (0.5 + localNoise) * (1 + index * 0.2);

          const grad = ctx.createRadialGradient(
            px,
            py,
            0,
            px,
            py,
            thickness
          );
          grad.addColorStop(0, `rgba(142, 90, 35, ${alpha})`);
          grad.addColorStop(1, "rgba(142, 90, 35, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          // Elongated elliptical patch oriented along the beam direction.
          ctx.ellipse(
            px,
            py,
            thickness,
            thickness * 0.35,
            angle,
            0,
            Math.PI * 2
          );
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
  const effect = new SunshineEffect(canvasElement);
  return effect;
}

function gameLoop(timestamp) {
  if (!ctx || !canvas) return;
  const time = timestamp || performance.now();

  const dt = lastFrameTime ? (time - lastFrameTime) / 1000 : 0;
  lastFrameTime = time;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Layer 1: deep background
  drawDeepBackground();

  // Layer 1.5: decorative birds in the upper sky band.
  updateAndDrawBirds(time, dt);

    // Layer 5: crates placed in the mid-ground (removed visually; crates now act as
  // invisible anchor points for the numbered tile clouds)
  // drawCrates();

  // (Canvas-based mode arrow removed; DOM-based arrow is drawn directly
  // on top of the stump DOM elements via updateDomModeArrow.)

  // Wooden sign video layer (drawn on top of crates, before particles and rays)
  // drawSignVideo();



  // Layer 7: global sunshine rays overlay
  if (sunshineEffect) {
    sunshineEffect.render(time);
  }

  // Layer 8: top-level animations (smoke, pineapple hop, checkmarks)
  updateAndDrawAnimations(time, dt);

  requestAnimationFrame(gameLoop);
}



const requiredAssetKeys = [
  "fieldBg",
];

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
    initCrates();
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



function updateStumpsLayout() {
  if (!canvas) return;

  const stumps = document.querySelectorAll(".slot-stump-image");
  const cubes = document.querySelectorAll(".slot-cube");
  if (!stumps.length || stumps.length !== cubes.length) return;

    const N = stumps.length;

  // Reset stump centres and rebuild them from current layout
  stumpCenters = [];

  for (let i = 0; i < N; i++) {

    //const targetBottom = canvas.height * (0.875 + Math.sqrt(i) * 0.06); // 5% from bottom of viewport
    const targetBottom = canvas.height * 0.95;
    const stump = stumps[i];
    const cube = cubes[i];

    // Reset transforms to a neutral state before measuring.
    stump.style.transformOrigin = "50% 100%";
    stump.style.transform = "translate(-50%, 0) scale(1)";
    cube.style.transformOrigin = "50% 50%";
    cube.style.transform = "translate(0px, 0px) scale(1)";

    const stumpRect = stump.getBoundingClientRect();

    // Evenly distribute stump centers across viewport width

            const targetCenterX =
              ((i + 0.5) / N) * canvas.width * 0.85 + canvas.width * 0.12;
    const currentCenterX = stumpRect.left + stumpRect.width / 2;
    const deltaStumpX = targetCenterX - currentCenterX;

    // Align stump bottom at 5% from bottom of viewport
    const currentBottom = stumpRect.bottom;
    const deltaStumpY = targetBottom - currentBottom;

    // Apply stump transform: base center + translations
    stump.style.transform = `translate(-50%, 0) translate(${deltaStumpX}px, ${deltaStumpY}px) scale(3)`;

    // --- MATHEMATICAL PREDICTION (No second layout read!) ---
    const scaledStumpHeight = stumpRect.height * 3;
    
    // Since scale anchor is bottom-center, target bottom dictates the new top position
    const stumpTopCenterX = targetCenterX;
    const stumpTopCenterY = targetBottom - scaledStumpHeight;

        // Record stump centre in canvas coordinates for the mode arrow.
    // Convert from page coords (client) to canvas coords.
    const canvasRect = canvas.getBoundingClientRect();

    // Lift the arrow slightly above the visual top of each stump so
    // the white path appears clearly above the stumps instead of
    // intersecting their tops.
    const arrowYOffset = scaledStumpHeight * 0.15; // 15% of stump height

    stumpCenters.push({
      // Extend arrow 5% longer at tail and head by mapping the logical
      // stump center into an expanded parametric 0.05–0.95 domain.
      x:
        canvas.width * 0.05 +
        (stumpTopCenterX / canvas.width) * canvas.width * 0.9,
      y: stumpTopCenterY + stumpRect.height / 2,
    });

    // Ensure arrow layer is above stumps by tracking a higher z-like value
    // that drawModeArrow can respect (logical layering only).
    stumpCenters[stumpCenters.length - 1].layer = 1; // stumps are layer 1


    const cubeRect = cube.getBoundingClientRect();

    const cubeBottomCenterX = cubeRect.left + cubeRect.width / 2;
    const cubeBottomCenterY = cubeRect.bottom;

    const deltaCubeX = stumpTopCenterX - cubeBottomCenterX;
    const deltaCubeY = stumpTopCenterY - cubeBottomCenterY;

        // Configure the oval shadow above the cube base
    const wrapper = cube.closest(".slot-wrapper");
    if (wrapper) {
      const shadow = wrapper.querySelector(".slot-shadow");
      if (shadow) {
        const wrapperRect = wrapper.getBoundingClientRect();

                // Shadow center: 10% of stump image height from top, horizontally aligned with stump
        const currentStumpRect = stump.getBoundingClientRect();
        const currentStumpHeight = currentStumpRect.height;
        const shadowCenterX = currentStumpRect.left + currentStumpRect.width / 2;
        const shadowCenterY = currentStumpRect.top + currentStumpHeight * 0.2;


        // Shadow size follows cube size so larger cubes cast larger shadows
        const cubeSide = cubeRect.width; // cube is square
        const majorAxis = cubeSide * 0.7; // longer axis
        const minorAxis = cubeSide * 0.4; // shorter axis

        shadow.style.width = `${majorAxis}px`;
        shadow.style.height = `${minorAxis}px`;

        // Position shadow relative to wrapper using predicted math coordinates
        const left = shadowCenterX - wrapperRect.left - majorAxis / 2;
        const top = shadowCenterY - wrapperRect.top - minorAxis / 2;

        shadow.style.left = `${left}px`;
        shadow.style.top = `${top}px`;
        shadow.style.transform = "none";
        // Darker shadow (75% darker appearance)
        shadow.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
      }
    }


    // Store translation components so progression logic can scale separately
    cube.dataset.tx = String(deltaCubeX);
    cube.dataset.ty = String(deltaCubeY);

    // Initial positioning at base scale
    cube.style.transform = `translate(${deltaCubeX}px, ${deltaCubeY}px) scale(1)`;
  }


        // Update DOM-based mode arrow drawn on top of stumps.
  updateDomModeArrow();
}






// ======================= Sorting Game Logic =======================


// 遊戲狀態
let gameState = {
  numbers: [],
  mode: "ascending",
  difficulty: "easy",
  // Logical playable range for gifts/inputs
  rangeMin: 0,
  rangeMax: 20,
  // Legacy field kept for compatibility; usually equals rangeMax
  maxNumber: 20,
  clampTolerance: 1,
  // Hint-related state
  wrongAttemptsForHints: 0,
  shownHints: {},
  hintRound1Played: false,
  hintRound2Played: false,
  selectedNumbers: [],
  nextIndex: 0,
  draggedValue: null,
  draggedElement: null,
};



function validatePlacement(index, numberValue) {
  let sorted = [...gameState.numbers];
  if (gameState.mode === "ascending") {
    sorted.sort((a, b) => a - b);
  } else {
    sorted.sort((a, b) => b - a);
  }

  const logicalIndex =
    gameState.mode === "ascending"
      ? index
      : sorted.length - 1 - index;

  const expectedValue = sorted[logicalIndex];
  return numberValue === expectedValue;
}

function updateCubeFacesWithValue(slot, value) {
  const cube = slot.closest(".slot-cube");
  if (!cube) return;

  const faces = cube.querySelectorAll(".slot-cube-face");
  faces.forEach((face) => {
    face.textContent = String(value);
    face.style.color = "white";
    face.style.fontWeight = "bold";
    face.style.fontSize = "24px";
  });
}

function updateCubesProgression() {
  if (!slotsBox) return;

  const cubes = document.querySelectorAll(".slot-cube");
  const slots = slotsBox.querySelectorAll(".slot");
  if (!cubes.length || cubes.length !== slots.length) return;

  const N = cubes.length;
  let filledCount = 0;
  const emptyIndices = [];

  for (let i = 0; i < N; i++) {
    const slot = slots[i];
    const isFilled = slot.textContent.trim() !== "";
    if (isFilled) {
      filledCount++;
    } else {
      emptyIndices.push(i);
    }
  }

    let activeIndex = null;
  if (emptyIndices.length > 0) {
    if (gameState.mode === "ascending") {
      // leftmost available empty space
      activeIndex = emptyIndices[0];
    } else {
      // rightmost available empty space
      activeIndex = emptyIndices[emptyIndices.length - 1];
    }
  }

  for (let i = 0; i < N; i++) {
    const cube = cubes[i];
    const slot = slots[i];
    const isFilled = slot.textContent.trim() !== "";

    const tx = parseFloat(cube.dataset.tx || "0");
    const ty = parseFloat(cube.dataset.ty || "0");

    let scale = 1;

    if (isFilled) {
      // Filled: remain at base size and light blue
      scale = 1;
    } else if (activeIndex !== null && i === activeIndex) {
      // Active empty space: scaled up and animated between blue and milk-white
      scale = 2.5;
    } else {
      // Non-active, empty spaces stay small and grey
      scale = 1;
    }


    cube.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

    const faces = cube.querySelectorAll(".slot-cube-face");
    faces.forEach((face) => {
      face.style.animation = "";
      if (isFilled) {
        // Light blue for filled cubes
        face.style.backgroundColor = "#3b82f6";
      } else if (activeIndex !== null && i === activeIndex) {
        // Animate color between blue and milk-white
        face.style.backgroundColor = "#1d4ed8";
        face.style.animation = "cube-active-color 2s ease-in-out infinite";
      } else {
        // Grey for non-active, empty cubes
        face.style.backgroundColor = "#808080";
      }
    });

        // Shadow on stump when cube is floating (large)
    const wrapper = cube.closest(".slot-wrapper");
    if (wrapper) {
      const shadow = wrapper.querySelector(".slot-shadow");
      const stumpImg = wrapper.querySelector(".slot-stump-image");
      if (shadow && stumpImg) {
        const stumpRect = stumpImg.getBoundingClientRect();
                const stumpHeight = stumpRect.height;
        const stumpCenterX = stumpRect.left + stumpRect.width / 2;

        // Shadow center: 10% of stump image height from top, horizontally aligned with stump
        const shadowCenterX = stumpCenterX;
        const shadowCenterY = stumpRect.top + stumpHeight * 0.2;

        // Shadow size follows cube size so larger cubes cast larger shadows
        const cubeRect = cube.getBoundingClientRect();
        const cubeSide = cubeRect.width; // cube is square and scaled via transform
        const majorAxis = cubeSide * 0.7;
        const minorAxis = cubeSide * 0.4;


        shadow.style.width = `${majorAxis}px`;
        shadow.style.height = `${minorAxis}px`;

        const wrapperRect = wrapper.getBoundingClientRect();
        const left = shadowCenterX - wrapperRect.left - majorAxis / 2;
        const top = shadowCenterY - wrapperRect.top - minorAxis / 2;

        shadow.style.left = `${left}px`;
        shadow.style.top = `${top}px`;
        shadow.style.transform = "none";

        // Darker shadow (75% darker appearance)
        shadow.style.backgroundColor = "rgba(0, 0, 0, 0.75)";
        shadow.style.opacity = scale > 1 ? "0.8" : "0.6";
      }
    }

  }
}





// 外套選項（目前未使用，但保留作擴充用）
const outfits = [];


// DOM 元素
const mainMenu = document.getElementById("mainMenu");
const gameArea = document.getElementById("gameArea");
const difficultySelection = document.getElementById("difficultySelection");
const numbersBox = null;
const slotsBox = null;

const speech = document.getElementById("speech");
const yellowBubbleText = document.getElementById("yellowBubbleText");
const result = document.getElementById("result");
const treasure = document.getElementById("treasure");
const chest = document.getElementById("chest");
const outfitLayer = document.getElementById("outfitLayer");
const victoryModal = document.getElementById("victoryModal");
const orderInfo = document.getElementById("orderInfo");
const difficultyInfo = document.getElementById("difficultyInfo");
const rangeInfo = document.getElementById("rangeInfo");
const precisionInfo = document.getElementById("precisionInfo");
const victoryHeadline = document.getElementById("victoryHeadline");
const victorySubheadline = document.getElementById("victorySubheadline");
const victoryStarsContainer = document.getElementById("victoryStarsContainer");
const victoryExtraText = document.getElementById("victoryExtraText");


// Gift control panel DOM references (assigned lazily in initGiftControlPanel)
// These are kept as vars so the panel can be reconfigured if needed.




let speechTypewriterTimer = null;
let lastSpeechText = "";


function setSpeech(text) {
  const nextText = typeof text === "string" ? text : String(text ?? "");

  if (speechTypewriterTimer) {
    window.clearInterval(speechTypewriterTimer);
    speechTypewriterTimer = null;
  }

  // Only animate when the speech text changes.
  if (nextText === lastSpeechText) {
    if (speech) speech.textContent = nextText;
    if (yellowBubbleText) yellowBubbleText.textContent = nextText;
    return;
  }

  lastSpeechText = nextText;

  if (speech) speech.textContent = "";
  if (yellowBubbleText) yellowBubbleText.textContent = "";

  let index = 0;
  const stepMs = 24;

  speechTypewriterTimer = window.setInterval(() => {
    index += 1;
    const partial = nextText.slice(0, index);

    if (speech) speech.textContent = partial;
    if (yellowBubbleText) yellowBubbleText.textContent = partial;

    if (index >= nextText.length) {
      window.clearInterval(speechTypewriterTimer);
      speechTypewriterTimer = null;
    }
  }, stepMs);
}

function createConfetti() {
  const colors = ["#ffd54f", "#ff7043", "#66bb6a", "#42a5f5", "#ab47bc"];
  for (let i = 0; i < 50; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.cssText = `
      left: ${Math.random() * 100}%;
      top: -10px;
      width: ${Math.random() * 10 + 5}px;
      height: ${Math.random() * 10 + 5}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? "50%" : "0"};
      animation: fall ${Math.random() * 3 + 2}s linear forwards;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 5000);
  }

  if (!document.getElementById("confetti-style")) {
    const style = document.createElement("style");
    style.id = "confetti-style";
    style.textContent = `
      @keyframes fall {
        to {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

function getGiftPanelMaxValue() {
  const max = typeof gameState.rangeMax === "number" && gameState.rangeMax > 0
    ? gameState.rangeMax
    : 20;
  return max;
}


function stopAllGame2Audio() {
  // Prefer project-level audio stop hooks when available.
  const stopFns = [
    window.stopAllAudio,
    window.stopAllGameAudio,
    window.stopAllSfx,
    window.stopAllVoice,
  ];

  stopFns.forEach((fn) => {
    if (typeof fn === "function") {
      try {
        fn();
      } catch (_) {}
    }
  });

  // Fallback: stop all HTMLMediaElement instances currently in the DOM.
  try {
    document.querySelectorAll("audio, video").forEach((media) => {
      try {
        media.pause();
        media.currentTime = 0;
      } catch (_) {}
    });
  } catch (_) {}
}

function initGiftControlPanel() {
  giftControlPanel = document.getElementById("giftControlPanel");
  giftMonitor = document.getElementById("giftMonitor");
  giftMonitorMessage = document.getElementById("giftMonitorMessage");
  giftMonitorInput = document.getElementById("giftMonitorInput");

  giftDigitButtons = Array.from(
    document.querySelectorAll(".gift-key-digit")
  );
  giftResetButton = document.getElementById("giftKeyReset");
  giftMoveButton = document.getElementById("giftKeyMove");
  giftZeroButton = document.getElementById("giftKey0");

  if (!giftControlPanel || !giftMonitor || !giftMonitorMessage || !giftMonitorInput) {
    return;
  }

  // Initialise keyboard labels once and hide all labels so they can be
  // revealed sequentially by the flicker animation.
  if (!giftButtonsInitialised) {
    giftDigitButtons.forEach((btn) => {
      const label = btn.textContent.trim();
      if (label) {
        btn.dataset.label = label;
      }
      const labelSpan = ensureGiftButtonLabelSpan(btn);
      if (labelSpan) {
        labelSpan.classList.add("gift-key-digit-hidden");
      }
    });

    if (giftResetButton) {
      const label = (giftResetButton.textContent || "").trim() || "🔄";
      giftResetButton.dataset.label = label;
      const labelSpan = ensureGiftButtonLabelSpan(giftResetButton);
      if (labelSpan) {
        labelSpan.classList.add("gift-key-digit-hidden");
      }
    }

    if (giftMoveButton) {
      const label = (giftMoveButton.textContent || "").trim() || "✅";
      giftMoveButton.dataset.label = label;
      giftMoveButton.textContent = label;
      const labelSpan = ensureGiftButtonLabelSpan(giftMoveButton);
      if (labelSpan) {
        labelSpan.classList.add("gift-key-digit-hidden");
      }
    }

    giftButtonsInitialised = true;
  }

    giftPanelState.maxValue = getGiftPanelMaxValue();
  giftPanelState.phase = "hidden";
  giftPanelState.inputValue = "";
  giftPanelState.keyboardEnabled = false;

  if (giftControlPanel) {
    giftControlPanel.classList.remove("gift-panel-prompt");
  }


  if (giftZeroButton) {
    giftZeroButton.disabled = false;
  }

        giftDigitButtons.forEach((btn) => {
    const key = btn.dataset.key;
    if (!key) return;
    btn.addEventListener("click", () => {
      if (giftButtonsLocked) {
        return;
      }
      if (typeof window.playPanelButtonClick === "function") {
        window.playPanelButtonClick();
      }
      const digit = parseInt(key, 10);
      if (!Number.isNaN(digit)) {
        handleGiftDigitClick(digit);
      }
    });
  });

  if (giftResetButton) {
    giftResetButton.addEventListener("click", () => {
      if (giftButtonsLocked) {
        return;
      }
      stopAllGame2Audio();
      if (typeof window.playPanelButtonClick === "function") {
        window.playPanelButtonClick();
      }
      handleGiftResetClick();
    });
  }
    if (giftMoveButton) {
    giftMoveButton.addEventListener("click", () => {
      if (giftButtonsLocked) {
        return;
      }
      if (typeof window.playPanelButtonClick === "function") {
        window.playPanelButtonClick();
      }
      handleGiftMoveClick();
    });
  }


  // Draw or update the triangle attached to the bottom-right corner
  // of the gift control panel.
  updateGiftPanelTriangle();
}

function ensureGiftPanelTriangleSvg() {
  if (giftPanelTriangleSvg) return giftPanelTriangleSvg;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = "gift-panel-triangle";
  svg.style.position = "fixed";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.pointerEvents = "none";
  // Slightly above the panel background so the triangle is visible.
  svg.style.zIndex = "1390";
  document.body.appendChild(svg);
  giftPanelTriangleSvg = svg;
  return svg;
}

function updateGiftPanelTriangle() {
  const panel = document.getElementById("giftControlPanel");
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  const svg = ensureGiftPanelTriangleSvg();

  // Clear any previous triangle.
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  // Vertical side along the panel's right wall between 80% and 95% of panel height.
  const xRight = rect.left;
  const yTop = rect.top + rect.height * 0.8;
  const yBottom = rect.top + rect.height * 1;

  // Third vertex at viewport coordinates: x = 45vw, y = 97.5vh.
  const xThird = window.innerWidth * 0.45;
  const yThird = window.innerHeight * 0.925;

  const triangle = document.createElementNS(SVG_NS, "polygon");
  const points = [
    `${xRight},${yTop}`,
    `${xRight},${yBottom}`,
    `${xThird},${yThird}`,
  ].join(" ");
  triangle.setAttribute("points", points);
  triangle.setAttribute("fill", "rgba(255, 255, 255, 0.75)");
  triangle.setAttribute("stroke", "none");

  svg.appendChild(triangle);
}


function setGiftKeyboardEnabled(enabled, hideDigits) {

  giftPanelState.keyboardEnabled = !!enabled;

  giftDigitButtons.forEach((btn) => {
    const labelSpan = ensureGiftButtonLabelSpan(btn);
    if (!labelSpan) return;

    if (hideDigits) {
      labelSpan.classList.add("gift-key-digit-hidden");
    } else {
      labelSpan.classList.remove("gift-key-digit-hidden");
    }
  });
}

function setGiftKeyLabelsHidden(hidden) {
  const buttons = [];
  if (giftDigitButtons && giftDigitButtons.length) {
    buttons.push(...giftDigitButtons);
  }
  if (giftResetButton) buttons.push(giftResetButton);
  if (giftMoveButton) buttons.push(giftMoveButton);

  buttons.forEach((btn) => {
    const labelSpan = ensureGiftButtonLabelSpan(btn);
    if (!labelSpan) return;

    if (hidden) {
      labelSpan.classList.add("gift-key-digit-hidden");
    } else {
      labelSpan.classList.remove("gift-key-digit-hidden");
    }
  });
}

function setGiftPanelButtonsLocked(locked) {
  giftButtonsLocked = !!locked;

  const buttons = [];
  if (giftDigitButtons && giftDigitButtons.length) {
    buttons.push(...giftDigitButtons);
  }
  if (giftResetButton) buttons.push(giftResetButton);
  if (giftMoveButton) buttons.push(giftMoveButton);

  buttons.forEach((btn) => {
    const labelSpan = ensureGiftButtonLabelSpan(btn);
    if (!labelSpan) return;

    if (giftButtonsLocked) {
      labelSpan.classList.add("gift-key-digit-hidden");
    } else {
      labelSpan.classList.remove("gift-key-digit-hidden");
    }
  });
}



function setGiftMonitorMessage(message, type) {

  if (!giftMonitorMessage) return;

  giftMonitorMessage.textContent = message;

  const messageText = String(message ?? "").trim();
  const isAllDigits = /^\d+$/.test(messageText);
  const isSingleGiftEmoji = messageText === "🎁";

  if (isAllDigits || isSingleGiftEmoji) {
    giftMonitorMessage.style.fontSize = "4rem";
  } else if (/[^\d]/.test(messageText)) {
    giftMonitorMessage.style.fontSize = "1.5rem";
  }

  giftMonitorMessage.classList.remove(
    "gift-monitor-message-cyan",
    "gift-monitor-message-error",
    "gift-monitor-message-lime"
  );

  let colorClass = "gift-monitor-message-cyan";
  let animName = "gift-neon-cyan";

  if (type === "error" || type === "warning") {
    colorClass = "gift-monitor-message-error";
    animName = "gift-neon-pink";
  } else if (type === "success") {
    colorClass = "gift-monitor-message-lime";
    animName = "gift-neon-lime";
  } else {
    colorClass = "gift-monitor-message-cyan";
    animName = "gift-neon-cyan";
  }

  giftMonitorMessage.classList.add(colorClass);

  // Restart neon animation
  giftMonitorMessage.style.animation = "none";
  // Force reflow
  void giftMonitorMessage.offsetWidth;
  giftMonitorMessage.style.animation = `${animName} 1s ease-out`;
}

function ensureGiftButtonLabelSpan(btn) {
  if (!btn) return null;

  let span = btn.querySelector(".gift-key-label");
  const label = btn.dataset.label || (btn.textContent || "").trim();

  if (!span) {
    span = document.createElement("span");
    span.className = "gift-key-label";
    btn.textContent = "";
    btn.appendChild(span);
  }

  if (label) {
    btn.dataset.label = label;
    span.textContent = label;
  }

  return span;
}

function clearGiftKeySequenceTimers() {
  giftKeySequenceTimers.forEach((id) => {
    window.clearTimeout(id);
  });
  giftKeySequenceTimers = [];
}

function clearGiftInputRestoreTimer() {
  if (giftInputRestoreTimer !== null) {
    window.clearTimeout(giftInputRestoreTimer);
    giftInputRestoreTimer = null;
  }
}

function runGiftKeySequenceAnimation() {
  if (!giftDigitButtons || giftDigitButtons.length === 0) return;

  const buttons = [];
  const digits = giftDigitButtons
    .slice()
    .sort((a, b) => {
      const ak = parseInt(a.dataset.key || "0", 10);
      const bk = parseInt(b.dataset.key || "0", 10);
      return ak - bk;
    });

  digits.forEach((btn) => buttons.push(btn));
  if (giftResetButton) buttons.push(giftResetButton);
  if (giftMoveButton) buttons.push(giftMoveButton);

  const stepMs = 110;

  clearGiftKeySequenceTimers();

  buttons.forEach((btn, index) => {
    const labelSpan = ensureGiftButtonLabelSpan(btn);
    if (!labelSpan) return;

    // Ensure each key starts hidden and restarts its flicker cleanly.
    labelSpan.classList.add("gift-key-digit-hidden");
    labelSpan.classList.remove("gift-key-flickering");
    labelSpan.style.animation = "none";
    void labelSpan.offsetWidth;

    const delay = stepMs * index;
    const timerId = window.setTimeout(() => {
      const label = btn.dataset.label;
      if (label && labelSpan.textContent.trim() !== label) {
        labelSpan.textContent = label;
      }
      labelSpan.classList.remove("gift-key-digit-hidden");
      // This is the place where key-label animation gets applied.
      // Keep it one-shot so all number-button spans don't stay animated.
      labelSpan.style.animation = "gift-key-flicker 0.45s ease 1";

      const clearAnimTimerId = window.setTimeout(() => {
        labelSpan.style.animation = "none";
      }, 500);
      giftKeySequenceTimers.push(clearAnimTimerId);
    }, delay);

    giftKeySequenceTimers.push(timerId);
  });
}

function playGiftPromptVoice() {
  // If the fairy has just appeared for this round, skip all human input/hint
  // voices once; the fairy audio will guide the child instead.
  if (skipHintVoiceThisRound) {
    skipHintVoiceThisRound = false;
    return;
  }

  // Count how many numeric hint labels are currently visible on the number line.
  const hintCount =
    gameState.shownHints && typeof gameState.shownHints === "object"
      ? Object.keys(gameState.shownHints).length
      : 0;

  if (hintCount > 0) {
    // First human hint voice: only play once per round when at least one
    // hint label exists.
    if (!gameState.hintRound1Played && typeof window.playHintVoiceRound1 === "function") {
      window.playHintVoiceRound1();
      gameState.hintRound1Played = true;
      return;
    }

    // Second human hint voice: only available when more than one hint label
    // exists (Level 3) so that Level 1/2 never jump straight to hint 2.
    if (
      hintCount > 1 &&
      !gameState.hintRound2Played &&
      typeof window.playHintVoiceRound2 === "function"
    ) {
      window.playHintVoiceRound2();
      gameState.hintRound2Played = true;
      return;
    }
  }

    // Fallback: no applicable human hint voice; currently no extra
  // input guidance is played here.
}







function showGiftInputPromptForGift() {
  if (!giftControlPanel || !giftMonitor || !giftMonitorMessage || !giftMonitorInput) {
    return;
  }

    giftPanelState.maxValue = getGiftPanelMaxValue();
  giftPanelState.phase = "prompt";
  giftPanelState.inputValue = "";
  giftPanelState.keyboardEnabled = true;

    giftControlPanel.classList.remove("hidden");
  giftControlPanel.setAttribute("aria-hidden", "false");
  giftControlPanel.classList.add("gift-panel-prompt");


        giftMonitorInput.textContent = "";
  giftMonitor.classList.remove("has-input");
    setGiftKeyboardEnabled(true, false);
  setGiftPanelButtonsLocked(false);
    // Prompt phase indicator: user has not typed anything yet.
  setGiftMonitorMessage("•ᴗ•", "normal");

  playGiftPromptVoice();

  runGiftKeySequenceAnimation();

  // Once the panel is visible and laid out, update the triangle so
  // its vertical edge sticks to the panel's right wall.
  updateGiftPanelTriangle();
}






function handleGiftDigitClick(digit) {
  // Only allow digit input during the explicit number input phases
  // ("prompt" or "typing"); clicks are still visually acknowledged
  // via the panel button SFX in the event handler.
  const phase = giftPanelState && giftPanelState.phase;
  if (phase !== "prompt" && phase !== "typing") return;

  if (!giftPanelState.keyboardEnabled) return;
  if (typeof digit !== "number" || !Number.isFinite(digit)) return;

  const previous = giftPanelState.inputValue || "";
  const nextRaw = previous + String(digit);
  const max = getGiftPanelMaxValue();
  const parsed = parseInt(nextRaw, 10);

    // Overflow / out-of-range error indicator: show ＞ᨓ＜, then
    // restore the stored number (or prompt face) after the error audio.
    // The overflow detection algorithm itself is unchanged.
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
      clearGiftInputRestoreTimer();
      setGiftMonitorMessage("＞ᨓ＜", "error");

      // Range-specific human overflow guidance.
      playHumanOverflowVoiceForCurrentRange();


    giftInputRestoreTimer = window.setTimeout(() => {
      giftInputRestoreTimer = null;
      if (previous) {
        setGiftMonitorMessage(previous, "normal");
        if (giftMonitor) {
          giftMonitor.classList.add("has-input");
        }
        giftPanelState.phase = "typing";
      } else {
        setGiftMonitorMessage("•ᴗ•", "normal");
        giftPanelState.phase = "prompt";
      }
    }, 2400);
    return;
  }


  const next = String(parsed);

  giftPanelState.inputValue = next;

  if (giftMonitorInput) {
    giftMonitorInput.textContent = next;
  }

  // Show the entered number directly in the centred text row.
  setGiftMonitorMessage(next, "normal");

  if (giftMonitor) {
    giftMonitor.classList.add("has-input");
  }

  if (giftPanelState.phase === "prompt") {
    giftPanelState.phase = "typing";
  }
}



function handleGiftResetClick() {
  if (!giftControlPanel || !giftMonitor || !giftMonitorMessage || !giftMonitorInput) {
    return;
  }

  // Only function in number input phases ("prompt" or "typing");
  // in other phases the button remains clickable but has no effect.
  const phase = giftPanelState && giftPanelState.phase;
  if (phase !== "prompt" && phase !== "typing") {
    return;
  }

  // 勝利後不再允許重設。
  if (giftPanelState.phase === "success") {
    return;
  }

  giftPanelState.inputValue = "";

  giftPanelState.phase = "prompt";

  // Cancel any pending callbacks that could restore stale digits.
  clearGiftInputRestoreTimer();

  giftMonitorInput.textContent = "";
  giftMonitor.classList.remove("has-input");
  if (giftControlPanel) {
    giftControlPanel.classList.add("gift-panel-prompt");
  }

  if (giftZeroButton) {
    giftZeroButton.disabled = false;
  }

  clearGiftKeySequenceTimers();
  setGiftKeyLabelsHidden(false);
  setGiftKeyboardEnabled(true, false);
  // Back to prompt phase: no digits typed yet.
  setGiftMonitorMessage("•ᴗ•", "normal");

  // When the child manually presses the retry button during a turn
  // where hints may already be visible, always play the normal
  // input guidance track instead of progressing to a later hint
  // voice.
  if (typeof window.playVoiceRoboticInput === "function") {
    window.playVoiceRoboticInput();
  }
}






function handleGiftMoveClick() {
  // Only function when actually in a number-input phase ("prompt" or "typing");
  // in other phases the button remains clickable but does nothing.
  const phase = giftPanelState && giftPanelState.phase;
  if (phase !== "prompt" && phase !== "typing") {
    return;
  }

  // 不在輸入階段或正在移動／已完成勝利時，按鈕不作任何反應。
  if (giftPanelState.phase === "moving" || giftPanelState.phase === "success") {
    return;
  }

  // 沒有數字輸入時不作任何反應。
  if (!giftPanelState.inputValue) {
    return;
  }

  const max = getGiftPanelMaxValue();
  const value = parseInt(giftPanelState.inputValue, 10);

    // Invalid value error: show ＞ᨓ＜, then restore the stored number
    // (or prompt face) after the error audio. The overflow algorithm
    // remains unchanged; this branch simply adds voice feedback.
    if (!Number.isFinite(value) || value < 0 || value > max) {
      const stored = giftPanelState.inputValue || "";
      clearGiftInputRestoreTimer();
      setGiftMonitorMessage("＞ᨓ＜", "error");

      // Range-specific human overflow guidance.
      playHumanOverflowVoiceForCurrentRange();


    giftInputRestoreTimer = window.setTimeout(() => {
      giftInputRestoreTimer = null;
      if (stored) {
        setGiftMonitorMessage(stored, "normal");
        if (giftMonitor) {
          giftMonitor.classList.add("has-input");
        }
        giftPanelState.phase = "typing";
      } else {
        setGiftMonitorMessage("•ᴗ•", "normal");
        giftPanelState.phase = "prompt";
      }
    }, 2400);
    return;
  }


    // Mark the panel as moving before starting the claw motion so that
  // debugClawDown can correctly flag a pending round outcome.
  giftPanelState.phase = "moving";
  if (giftControlPanel) {
    giftControlPanel.classList.remove("gift-panel-prompt");
  }

    // Lock all panel buttons and hide all panel labels while the claw is moving.
  setGiftPanelButtonsLocked(true);

  // Keep the entered number visible in the centred text while the claw moves;
  // digits remain hidden and the keyboard is disabled.
  setGiftKeyboardEnabled(false, true);



  if (typeof window.controlClawPosition === "function") {
    window.controlClawPosition(value);
  }
  if (typeof window.debugClawDown === "function") {
    window.debugClawDown();
  }
}


function showGiftErrorMessage() {
  if (!giftControlPanel || !giftMonitor || !giftMonitorMessage || !giftMonitorInput) {
    return;
  }

        giftPanelState.phase = "error";
  if (giftControlPanel) {
    giftControlPanel.classList.remove("gift-panel-prompt");
  }
  // Catch failed / attempt error indicator.
  setGiftMonitorMessage("＞ᨓ＜", "error");

  // Disable keyboard and hide digits while the error message is showing.
  setGiftKeyboardEnabled(false, true);

  // Helper to restore the panel back to the input prompt phase.
  function restorePromptFromError() {
    if (!giftControlPanel || !giftMonitor || !giftMonitorMessage || !giftMonitorInput) {
      return;
    }

    giftPanelState.inputValue = "";
    giftPanelState.phase = "prompt";

    giftMonitorInput.textContent = "";
    giftMonitor.classList.remove("has-input");
    if (giftControlPanel) {
      giftControlPanel.classList.add("gift-panel-prompt");
    }


    if (giftZeroButton) {
      giftZeroButton.disabled = false;
    }

                                setGiftKeyboardEnabled(true, false);
    setGiftPanelButtonsLocked(false);
    // Back to prompt phase indicator after an error.
    setGiftMonitorMessage("•ᴗ•", "normal");
                                playGiftPromptVoice();
    runGiftKeySequenceAnimation();

  }

    // Prefer to wait until the fail voice clip has finished before
  // restoring the prompt; fall back to a timeout if the audio is
  // unavailable or cannot play.
  let restored = false;
  function restoreOnce() {
    if (restored) return;
    restored = true;
    restorePromptFromError();
  }

  // No dedicated fail element is used here; keep the previous
  // fixed-delay behaviour.
  window.setTimeout(restoreOnce, 2400);
}





function showGiftSuccessMessage() {
  if (!giftControlPanel || !giftMonitor || !giftMonitorMessage) {
    return;
  }

    giftPanelState.phase = "success";
  if (giftControlPanel) {
    giftControlPanel.classList.remove("gift-panel-prompt");
  }
  // Success indicator: gift caught.
  setGiftMonitorMessage("🎁", "success");

  // Victory modal, multi-level progression, and celebratory sounds are
  // handled separately inside handleRoundOutcome() once the claw has
  // returned home with the gift.
}




// 在新流程中，模式及等級會由主選單提供，
// 此函式只保留作後備使用。
function selectMode(mode) {
  gameState.mode = mode;
  if (difficultySelection) {
    difficultySelection.classList.remove("hidden");
  }
}

// 後備難度及等級選擇邏輯：更新標題列的排序方向及等級顯示。
// 此函式目前不在新流程中自動呼叫，但可供主菜單或未來擴充使用。
function startGame(difficulty) {
  gameState.difficulty = difficulty;

  if (mainMenu) mainMenu.classList.add("hidden");
  if (gameArea) gameArea.classList.remove("hidden");

  if (orderInfo) {
    if (gameState.mode === "ascending") {
      orderInfo.innerHTML = "👉 由 <b>小 → 大</b> 排列 (左邊最小)";
    } else {
      orderInfo.innerHTML = "👈 由 <b>大 → 小</b> 排列 (右邊最大)";
    }
  }

  if (difficultyInfo) {
    difficultyInfo.innerHTML =
      difficulty === "easy" ? "⭐ 等級一 (1-10)" : "⭐⭐ 等級二 (1-20)";
  }
}


// Read URL parameters from game.html and initialise game state + header bar.
function initGameConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
  const rangeMinParam = params.get("rangeMin");
  const rangeMaxParam = params.get("rangeMax");
  const clampTolParam = params.get("clampTolerance");

  if (rangeMinParam) {
    const parsedMin = parseInt(rangeMinParam, 10);
    if (!Number.isNaN(parsedMin) && parsedMin >= 0) {
      gameState.rangeMin = parsedMin;
    }
  }

  if (rangeMaxParam) {
    const parsedMax = parseInt(rangeMaxParam, 10);
    if (!Number.isNaN(parsedMax) && parsedMax > 0) {
      gameState.rangeMax = parsedMax;
      gameState.maxNumber = parsedMax;
    }
  }


  if (clampTolParam) {
    const parsedTol = parseInt(clampTolParam, 10);
    if (!Number.isNaN(parsedTol) && parsedTol > 0) {
      gameState.clampTolerance = parsedTol;
    }
  }

    // Header bar: show a friendly summary of range and clamp settings, with emojis.
  if (rangeInfo) {
    const minNumber = typeof gameState.rangeMin === "number" ? gameState.rangeMin : 0;
    const maxNumber = typeof gameState.rangeMax === "number" && gameState.rangeMax > 0 ? gameState.rangeMax : 20;
    rangeInfo.innerHTML = `🔢 範圍：${minNumber} 至 ${maxNumber}`;
  }


  if (precisionInfo) {
    const clampTolerance = typeof gameState.clampTolerance === "number" && gameState.clampTolerance > 0 ? gameState.clampTolerance : 1;
    precisionInfo.innerHTML = `🧸 夾子：允許 ${clampTolerance} 落差`;
  }
}

// Decide the number line scale for rendering.
// The visual number line is always 0–20, regardless of the playable range.
function getNumberLineScaleFromGameState() {
  return 20;
}

// Map current playable range to a logical hint level (1/2/3).
function getHintLevelFromRange() {
  const min = typeof gameState.rangeMin === "number" ? gameState.rangeMin : 0;
  const max = typeof gameState.rangeMax === "number" ? gameState.rangeMax : 20;
  if (min === 0 && max === 10) return 1;
  if (min === 11 && max === 20) return 2;
  if (min === 0 && max === 20) return 3;
  return null;
}

function ensureHintLabelsGroup() {
  const svg = document.getElementById("numberLineSVG");
  if (!svg) return null;
  let group = document.getElementById("labelsGroupHints");
  if (!group) {
    // Ensure a glow filter for hint labels exists.
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    let glow = svg.querySelector("#hintGlowFilter");
    if (!glow) {
      glow = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      glow.id = "hintGlowFilter";
      glow.setAttribute("x", "-50%");
      glow.setAttribute("y", "-50%");
      glow.setAttribute("width", "200%");
      glow.setAttribute("height", "200%");

      const blur = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      blur.setAttribute("in", "SourceGraphic");
      blur.setAttribute("stdDeviation", "24"); // ~8px glow
      blur.setAttribute("result", "blur");

      const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
      const mergeNodeBlur = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
      mergeNodeBlur.setAttribute("in", "blur");
      const mergeNodeSource = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
      mergeNodeSource.setAttribute("in", "SourceGraphic");
      merge.appendChild(mergeNodeBlur);
      merge.appendChild(mergeNodeSource);

      glow.appendChild(blur);
      glow.appendChild(merge);
      defs.appendChild(glow);
    }

    group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.id = "labelsGroupHints";
    // Apply glow filter to entire hint group
    group.setAttribute("filter", "url(#hintGlowFilter)");
    svg.appendChild(group);
  }
  return group;
}

// Fade in an orange hint label at the given numeric value on the 0–20 number line.
function showHintLabelAt(value) {
  const group = ensureHintLabelsGroup();
  if (!group) return;

  // Avoid duplicate labels for the same value.
  if (!gameState.shownHints) {
    gameState.shownHints = {};
  }
  if (gameState.shownHints[value]) {
    return;
  }

  const startX = 50;
  const endX = 4950;
  const totalWidth = endX - startX;
  const fixedMax = 20;
  const yCenter = 80;

  const xPos = startX + (value / fixedMax) * totalWidth;
  const labelY = yCenter - 200;

  // Orange hint tick at the same position.
  const hintTickHeight = 120;
  const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
  tick.setAttribute("x1", xPos);
  tick.setAttribute("y1", yCenter - hintTickHeight);
  tick.setAttribute("x2", xPos);
  tick.setAttribute("y2", yCenter);
  tick.setAttribute("stroke", "#ff9800");
  tick.setAttribute("stroke-width", "18");
  tick.style.opacity = "0";
  tick.style.transition = "opacity 0.8s ease-out";

  const hint = document.createElementNS("http://www.w3.org/2000/svg", "text");
  hint.setAttribute("x", xPos);
  hint.setAttribute("y", labelY);
  hint.setAttribute("text-anchor", "middle");
  hint.setAttribute("fill", "#ff9800"); // orange
  hint.setAttribute("font-family", "Impact, Arial, sans-serif");
  // Normal tick labels use font-size "240"; hints are 1.25x that.
  hint.setAttribute("font-size", "300");
  hint.style.opacity = "0";
  hint.style.transition = "opacity 0.8s ease-out";
  hint.textContent = String(value);

  group.appendChild(tick);
  group.appendChild(hint);

  // Mark as shown in state and fade in.
  gameState.shownHints[value] = true;
  requestAnimationFrame(function () {
    hint.style.opacity = "1";
    tick.style.opacity = "1";
  });
}


// Reset all hint-related state and remove any existing hint labels.
function resetHintState() {
  gameState.wrongAttemptsForHints = 0;
  gameState.shownHints = {};
  gameState.hintRound1Played = false;
  gameState.hintRound2Played = false;
  const group = document.getElementById("labelsGroupHints");
  if (group) {
    group.innerHTML = "";
  }
  // Reset fairy/hint voice coupling so each level/run starts clean.
  skipHintVoiceThisRound = false;
  // Also reset any fairy guidance overlay so each level/run starts clean.
  clearFairyState();
}


// Fairy guidance video/audio and panel fade helpers
let fairyVideoEl = null;
let fairyAudio = null;
let fairyGreetingAudio = null;
let fairyUltFailAudio = null;
let fairyVideoSrc = null;
let fairyHasAppeared = false;

// When the fairy appears for a particular round, skip human input/hint voices
// for the next input prompt so they do not overlap with the fairy guidance.
let skipHintVoiceThisRound = false;
// DOM container and state for fairy round multiple-choice options.
let fairyOptionsContainer = null;
let fairyOptionButtons = [];
let fairyRoundResolved = false;

function initFairyMedia() {
  if (fairyVideoEl && fairyAudio && fairyGreetingAudio) {
    return;
  }

  const videoCandidates = [
    { path: "./bear_fairy.webm", mime: "video/webm" },
    { path: "./bear_fairy.mp4", mime: "video/mp4" },
  ];
  const videoProbe = document.createElement("video");
  let videoUrl = null;
  for (let i = 0; i < videoCandidates.length; i++) {
    const candidate = videoCandidates[i];
    const sanitizedCandidateUrl =
      typeof window.sanitizeMediaUrl === "function"
        ? window.sanitizeMediaUrl(candidate.path)
        : candidate.path;
    if (!sanitizedCandidateUrl) continue;

    if (
      typeof videoProbe.canPlayType === "function" &&
      candidate.mime &&
      videoProbe.canPlayType(candidate.mime) === ""
    ) {
      continue;
    }

    videoUrl = sanitizedCandidateUrl;
    break;
  }

    const greetingUrl =
    typeof window.sanitizeMediaUrl === "function"
      ? window.sanitizeMediaUrl("./bear_fairy_greeting.mp3")
      : "./bear_fairy_greeting.mp3";

  const audioUrl =
    typeof window.sanitizeMediaUrl === "function"
      ? window.sanitizeMediaUrl("./bear_fairy_input.mp3")
      : "./bear_fairy_input.mp3";

  const ultFailUrl =
    typeof window.sanitizeMediaUrl === "function"
      ? window.sanitizeMediaUrl("./bear_fairy_ultfail.mp3")
      : "./bear_fairy_ultfail.mp3";



  fairyVideoEl = document.createElement("video");
  fairyVideoEl.id = "bearFairyVideo";
  fairyVideoEl.style.position = "fixed";
  fairyVideoEl.style.left = "7.5vw";
  fairyVideoEl.style.top = "50vh";
  fairyVideoEl.style.height = "auto";
  // Make the fairy video 3.5x larger than before.
  fairyVideoEl.style.width = "20vw";

  fairyVideoEl.style.transform = "translate(-50%, -50%)";
  fairyVideoEl.style.zIndex = "1400";
  fairyVideoEl.style.opacity = "0";
  fairyVideoEl.style.pointerEvents = "none";
  fairyVideoEl.loop = true;
  fairyVideoEl.autoplay = true;
  fairyVideoEl.playsInline = true;
  // Video is visual-only; guidance audio is provided by separate mp3 tracks.
  fairyVideoEl.muted = true;

  if (videoUrl) {
    fairyVideoSrc = videoUrl;
    fairyVideoEl.src = videoUrl;
    try {
      fairyVideoEl.load();
    } catch (_) {}
  } else {
    fairyVideoSrc = null;
  }

  document.body.appendChild(fairyVideoEl);

  fairyGreetingAudio = new Audio();
  if (greetingUrl) {
    fairyGreetingAudio.src = greetingUrl;
    fairyGreetingAudio.preload = "auto";
    try {
      fairyGreetingAudio.load();
    } catch (_) {}
  }

    fairyAudio = new Audio();
  if (audioUrl) {
    fairyAudio.src = audioUrl;
    fairyAudio.preload = "auto";
    try {
      fairyAudio.load();
    } catch (_) {}
  }

  fairyUltFailAudio = new Audio();
  if (ultFailUrl) {
    fairyUltFailAudio.src = ultFailUrl;
    fairyUltFailAudio.preload = "auto";
    try {
      fairyUltFailAudio.load();
    } catch (_) {}
  }
}



function clearFairyState() {
  fairyHasAppeared = false;
  fairyRoundResolved = false;
  if (fairyVideoEl) {
    try {
      fairyVideoEl.pause();
    } catch (_) {}
    fairyVideoEl.style.opacity = "0";
  }
    if (fairyGreetingAudio) {
    try {
      fairyGreetingAudio.pause();
      fairyGreetingAudio.currentTime = 0;
    } catch (_) {}
  }
  if (fairyAudio) {
    try {
      fairyAudio.pause();
      fairyAudio.currentTime = 0;
    } catch (_) {}
  }
  if (fairyUltFailAudio) {
    try {
      fairyUltFailAudio.pause();
      fairyUltFailAudio.currentTime = 0;
    } catch (_) {}
  }

  if (giftControlPanel) {
    giftControlPanel.style.transition = "";
    giftControlPanel.style.opacity = "";
    giftControlPanel.style.pointerEvents = "";
  }
  if (giftPanelTriangleSvg) {
    giftPanelTriangleSvg.style.transition = "";
    giftPanelTriangleSvg.style.opacity = "";
  }
  if (fairyOptionsContainer) {
    fairyOptionsContainer.style.display = "none";
    fairyOptionsContainer.innerHTML = "";
  }
  fairyOptionButtons = [];
}

function ensureFairyOptionsContainer() {
  if (fairyOptionsContainer) return fairyOptionsContainer;
  const container = document.createElement("div");
  container.id = "fairyOptionsContainer";
    container.style.position = "fixed";
  container.style.left = "0";
  // Position the container so that the option centres sit at ~85vh.
  container.style.top = "70vh";
  container.style.width = "100%";
  container.style.display = "flex";

  container.style.justifyContent = "space-evenly";
  container.style.alignItems = "center";
  container.style.zIndex = "1450";
  container.style.pointerEvents = "auto";
  document.body.appendChild(container);
  fairyOptionsContainer = container;
  return container;
}

function getFairyRange() {
  const rangeMin =
    typeof gameState.rangeMin === "number" && gameState.rangeMin >= 0
      ? gameState.rangeMin
      : 0;
  const rangeMax =
    typeof gameState.rangeMax === "number" && gameState.rangeMax >= rangeMin
      ? gameState.rangeMax
      : 20;
  return { rangeMin, rangeMax };
}

function generateAlternativeAnswer(correct) {
  // Wrapper kept for backward compatibility: delegate to the SEN-aware
  // smart wrong-option generator.
  const { rangeMin, rangeMax } = getFairyRange();
  return getSmartWrongOption(correct, currentRoundGuesses, rangeMin, rangeMax);
}


function showFairyOptionsForCurrentGift() {
  if (fairyRoundResolved) return;
  if (typeof activeGiftValue !== "number") return;

  const correctValue = activeGiftValue;
  const alternativeValue = generateAlternativeAnswer(correctValue);

  const container = ensureFairyOptionsContainer();
  container.style.display = "flex";
  container.innerHTML = "";

  fairyOptionButtons = [];

  const values = Math.random() < 0.5
    ? [correctValue, alternativeValue]
    : [alternativeValue, correctValue];

  values.forEach((value) => {
        const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(value);

    // Base option size: 20vh high/wide, font-size 80% of height.
    btn.style.height = "20vh";
    btn.style.width = "20vh";
    btn.style.borderRadius = "50%";
    btn.style.backgroundColor = "#ffffff";
    btn.style.color = "#000000";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.fontFamily = "Nightgazer16, system-ui, sans-serif";
    btn.style.fontSize = "16vh";
    btn.style.border = "0.4vh solid #dddddd";
    btn.style.boxShadow = "0 0.5vh 1vh rgba(0,0,0,0.25)";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 0.6s ease";
    btn.style.transform = "scale(1)";

    btn.dataset.value = String(value);
    btn.dataset.correct = value === correctValue ? "true" : "false";

    btn.addEventListener("click", () => {
      handleFairyOptionClick(btn);
    });

    fairyOptionButtons.push(btn);

    // Base plate behind each circular option to give a 3D button feel.
    const plate = document.createElement("div");
    plate.className = "fairy-option-plate";
    plate.style.display = "flex";
    plate.style.alignItems = "center";
    plate.style.justifyContent = "center";
    plate.style.padding = "1.5vh";
    plate.style.borderRadius = "2vh";
    plate.style.background = "rgba(0, 0, 0, 0.12)";
    plate.style.border = "0.5vh solid #000000";
    plate.style.boxShadow =
      "0 1vh 2vh rgba(0,0,0,0.35), " +
      "0 -0.3vh 0.6vh rgba(255,255,255,0.3)";
    plate.style.transition = "all 0.6s ease";
    // Fix the plate height so that the option centre stays put even
    // when the circular button grows or shrinks.
    plate.style.height = "28vh";
    plate.style.width = "28vh";
    plate.style.boxSizing = "border-box";
    plate.style.overflow = "visible";


    plate.appendChild(btn);
    container.appendChild(plate);

  });
}


function handleFairyOptionClick(btn) {
  if (fairyRoundResolved) return;
  fairyRoundResolved = true;

  const isCorrect = btn.dataset.correct === "true";

    if (isCorrect) {
    // Correct choice: grow to 25vh and turn green over 2 seconds.
    btn.style.backgroundColor = "#bbf7d0"; // light green
    btn.style.color = "#166534"; // dark green
    btn.style.height = "25vh";
    btn.style.width = "25vh";
    btn.style.fontSize = "20vh"; // 80% of height
    btn.style.transform = "scale(1)";

    if (typeof window.playClawAttemptSuccess === "function") {
      window.playClawAttemptSuccess();
    }

    // After the animation, treat this as a success for the current question.
    setTimeout(() => {
      handleFairyRoundSuccess();
    }, 3000);
    } else {
    // Wrong choice: shrink to 10vh and turn red over 2 seconds.
    btn.style.backgroundColor = "#fecaca"; // light red
    btn.style.color = "#991b1b"; // dark red
    btn.style.height = "10vh";
    btn.style.width = "10vh";
    btn.style.fontSize = "8vh"; // 80% of height
    btn.style.transform = "scale(1)";

        if (typeof window.playClawAttemptFail === "function") {
      window.playClawAttemptFail();
    }

    // Immediately after the mechanical claw fail sound, play the
    // ultimate fairy fail voice.
    if (fairyUltFailAudio) {
      try {
        fairyUltFailAudio.currentTime = 0;
        fairyUltFailAudio.play();
      } catch (_) {}
    }

    // After 2 seconds, highlight the correct option (expanded size).

    setTimeout(() => {
      const correctBtn = fairyOptionButtons.find(
        (b) => b.dataset.correct === "true"
      );
      if (correctBtn) {
        correctBtn.style.backgroundColor = "#bbf7d0";
        correctBtn.style.color = "#166534";
        correctBtn.style.height = "25vh";
        correctBtn.style.width = "25vh";
        correctBtn.style.fontSize = "20vh";
        correctBtn.style.transform = "scale(1)";
      }
    }, 2000);

    // 4 seconds after that, treat this as a success for the current question.
    setTimeout(() => {
      handleFairyRoundSuccess();
    }, 5000);
  }

}


function handleFairyRoundSuccess() {
  // MC question answered; clear the current round's attempt log so the next
  // gift starts with a fresh local profile.
  resetCurrentRoundGuesses();

  // Use the same run-state progression logic as a normal successful catch,
  // but without driving the claw machine.
  let isFinalLevel = false;
  let completedLevelIndex = 1;
  let totalLevels = 5;
  let totalAttempts = null;


  if (window.gameCookie) {
    const api = window.gameCookie;

    if (typeof api.handleLevelCompleted === "function") {
      api.handleLevelCompleted();
    }

    const state = typeof api.getRunState === "function" ? api.getRunState() : null;
    if (state) {
      completedLevelIndex =
        typeof state.levelsCompleted === "number" && state.levelsCompleted > 0
          ? state.levelsCompleted
          : (typeof state.currentLevelIndex === "number"
              ? state.currentLevelIndex
              : 1);
      totalLevels = typeof api.LEVELS_PER_RUN === "number"
        ? api.LEVELS_PER_RUN
        : 5;
      isFinalLevel = state.status === "complete" || completedLevelIndex >= totalLevels;
    }

    if (typeof api.getTotalDropAttemptsForRun === "function") {
      totalAttempts = api.getTotalDropAttemptsForRun();
    }
  }

  // Hide fairy options UI once the round is resolved.
  if (fairyOptionsContainer) {
    fairyOptionsContainer.style.display = "none";
  }

  if (isFinalLevel) {
    if (typeof window.playTotalVictory === "function") {
      window.playTotalVictory();
    }
    setTimeout(() => {
      showVictoryModal(true, completedLevelIndex, totalLevels, totalAttempts);
      createConfetti();
    }, 2000);
  } else {
    if (typeof window.playMiddleLevelSuccessSfx === "function") {
      window.playMiddleLevelSuccessSfx();
    }
    setTimeout(() => {
      showVictoryModal(false, completedLevelIndex, totalLevels, totalAttempts);
    }, 2000);
  }
}

function showFairyGuidance() {
  if (fairyHasAppeared) return;

  if (!fairyVideoEl || !fairyAudio || !fairyGreetingAudio) {
    initFairyMedia();
  }

  fairyHasAppeared = true;
  // Skip human input/hint voices for the next prompt so they don’t overlap with the fairy.
  skipHintVoiceThisRound = true;

  // Fade out the input panel over 2 seconds and disable interaction.
  if (giftControlPanel) {
    giftControlPanel.style.transition = "opacity 2s ease-out";
    giftControlPanel.style.opacity = "0";
    giftControlPanel.style.pointerEvents = "none";
    setGiftKeyboardEnabled(false, true);
    setGiftPanelButtonsLocked(true);
  }

  // Hide the triangle that attaches to the bottom-right of the panel.
  if (giftPanelTriangleSvg) {
    giftPanelTriangleSvg.style.transition = "opacity 2s ease-out";
    giftPanelTriangleSvg.style.opacity = "0";
  }

  // Fade in the fairy video over 2 seconds and start playback immediately (looping).
  if (fairyVideoEl) {
    fairyVideoEl.style.transition = "opacity 2s ease-in";
    fairyVideoEl.style.opacity = "1";

    if (fairyVideoSrc) {
      if (typeof window.safePlayMedia === "function") {
        window.safePlayMedia(fairyVideoEl, fairyVideoSrc);
      } else {
        try {
          fairyVideoEl.play();
        } catch (_) {}
      }
    }
  }

  // Play greeting first; once it finishes, play the input guidance and
  // show the multiple-choice buttons.
  if (fairyGreetingAudio) {
    try {
      fairyGreetingAudio.currentTime = 0;
      fairyGreetingAudio.onended = function () {
        fairyGreetingAudio.onended = null;
        if (fairyAudio) {
          try {
            fairyAudio.currentTime = 0;
            fairyAudio.play();
          } catch (_) {}
        }
        showFairyOptionsForCurrentGift();
      };
      fairyGreetingAudio.play();
    } catch (_) {
      // Fallback: if greeting cannot play, go straight to input + options.
      try {
        if (fairyAudio) {
          fairyAudio.currentTime = 0;
          fairyAudio.play();
        }
      } catch (_) {}
      showFairyOptionsForCurrentGift();
    }
  } else {
    // No greeting audio: just play the input guidance and show options.
    try {
      if (fairyAudio) {
        fairyAudio.currentTime = 0;
        fairyAudio.play();
      }
    } catch (_) {}
    showFairyOptionsForCurrentGift();
  }
}



// Track wrong attempts and show hints according to level / thresholds.
function handleWrongAttemptForHints() {
  if (typeof gameState.wrongAttemptsForHints !== "number") {
    gameState.wrongAttemptsForHints = 0;
  }
  gameState.wrongAttemptsForHints += 1;

  const level = getHintLevelFromRange();
  if (!level) return;

  const attempts = gameState.wrongAttemptsForHints;

  if (level === 1) {
    // Level 1: after 2 wrong attempts, fade in mark 5.
    if (attempts >= 2) {
      showHintLabelAt(5);
    }
    // After 3 wrong attempts, summon the fairy guidance.
    if (attempts >= 3) {
      showFairyGuidance();
    }
  } else if (level === 2) {
    // Level 2: after 2 wrong attempts, fade in 15.
    if (attempts >= 2) {
      showHintLabelAt(15);
    }
    // After 3 wrong attempts, summon the fairy guidance.
    if (attempts >= 3) {
      showFairyGuidance();
    }
  } else if (level === 3) {
    // Level 3: after 2 wrong attempts, fade in 10.
    if (attempts >= 2) {
      showHintLabelAt(10);
    }
    // After 3 wrong attempts, fade in 5 and 15.
    if (attempts >= 3) {
      showHintLabelAt(5);
      showHintLabelAt(15);
    }
    // After 4 wrong attempts, summon the fairy guidance.
    if (attempts >= 4) {
      showFairyGuidance();
    }
  }
}



// Render the bottom number line ticks and labels.
// Visuals are matched exactly to scale.txt: only 0 and the max value,
// white ticks, Impact-style font, and the same spacing.
function renderNumberLine(scale) {

  const ticksGroupBack = document.getElementById("ticksGroupBack");
  const labelsGroupBack = document.getElementById("labelsGroupBack");
  const ticksGroup = document.getElementById("ticksGroup");
  const labelsGroup = document.getElementById("labelsGroup");

  if (!ticksGroupBack || !labelsGroupBack || !ticksGroup || !labelsGroup) {
    return;
  }

  // Clear previous elements to avoid overlapping when re-rendering
  ticksGroupBack.innerHTML = "";
  labelsGroupBack.innerHTML = "";
  ticksGroup.innerHTML = "";
  labelsGroup.innerHTML = "";

  // Canvas layout parameters in the 5000-unit SVG coordinate space.
  // Keep a 10% margin on each side so ticks align with the visible axis.
  const startX = 50;
  const endX = 4950;
  const yCenter = 80;
  const tickHalfHeight = 150; // 5x original: symmetrical height above/below the line
  const totalWidth = endX - startX;
  const backOffsetX = 4;
  const backOffsetY = 4;
  function appendTickAndLabel(groupTicks, groupLabels, xPos, yPos, value, strokeColor, fillColor, opacity, fontSize, markerWidth) {
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", xPos);
    tick.setAttribute("y1", yPos - tickHalfHeight);
    tick.setAttribute("x2", xPos);
    tick.setAttribute("y2", yPos); // + tickHalfHeight);
    tick.setAttribute("stroke", strokeColor);
    tick.setAttribute("stroke-width", markerWidth);
    tick.setAttribute("opacity", opacity);
    groupTicks.appendChild(tick);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", xPos);
    label.setAttribute("y", yPos - 200); // + tickHalfHeight
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", fillColor);
    label.setAttribute("font-family", "Impact, Arial, sans-serif");
    label.setAttribute("font-size", fontSize);
    label.setAttribute("opacity", opacity);
    label.textContent = String(value);
    groupLabels.appendChild(label);
  }

    // Always draw ticks at 0 and at 20 on the visual number line.
  const fixedMin = 0;
  const fixedMax = 20;
  const values = [fixedMin, fixedMax];
  values.forEach((value) => {
    const xPos = startX + (value / fixedMax) * totalWidth;
    appendTickAndLabel(
      ticksGroupBack,
      labelsGroupBack,
      xPos + backOffsetX,
      yCenter + backOffsetY,
      value,
      "rgba(150,150,150,0.75)",
      "rgba(150,150,150,0.8)",
      "0.8",
      "240",
      "24"
    );
    appendTickAndLabel(
      ticksGroup,
      labelsGroup,
      xPos,
      yCenter,
      value,
      "white",
      "white",
      "1",
      "240",
      "18"
    );
  });

  // If the playable range is a proper subset of [0, 20], add an extra tick at 10.
  const minNumber = typeof gameState.rangeMin === "number" ? gameState.rangeMin : fixedMin;
  const maxNumber = typeof gameState.rangeMax === "number" ? gameState.rangeMax : fixedMax;
  if (minNumber !== fixedMin || maxNumber !== fixedMax) {
    const midValue = 10;
    const xPosMid = startX + (midValue / fixedMax) * totalWidth;
    appendTickAndLabel(
      ticksGroupBack,
      labelsGroupBack,
      xPosMid + backOffsetX,
      yCenter + backOffsetY,
      midValue,
      "rgba(150,150,150,0.75)",
      "rgba(150,150,150,0.8)",
      "0.8",
      "240",
      "24"
    );
    appendTickAndLabel(
      ticksGroup,
      labelsGroup,
      xPosMid,
      yCenter,
      midValue,
      "white",
      "white",
      "1",
      "240",
      "18"
    );
  }

}

// Initialise the number line after URL/game config has been read.
function initNumberLineFromGameConfig() {
  const svg = document.getElementById("numberLineSVG");
  const ticksGroupBack = document.getElementById("ticksGroupBack");
  const labelsGroupBack = document.getElementById("labelsGroupBack");
  const ticksGroup = document.getElementById("ticksGroup");
  const labelsGroup = document.getElementById("labelsGroup");

  if (!svg || !ticksGroupBack || !labelsGroupBack || !ticksGroup || !labelsGroup) {
    return;
  }

  const scale = getNumberLineScaleFromGameState();
  renderNumberLine(scale);
}

function spawnRandomGiftBox() {
  const svg = document.getElementById("numberLineSVG");
  if (!svg) return;

    const rect = svg.getBoundingClientRect();

  // Gifts should spawn within the logical playable range.
  const minNumber = typeof gameState.rangeMin === "number" ? gameState.rangeMin : 0;
  const maxNumber = typeof gameState.rangeMax === "number" && gameState.rangeMax > minNumber
    ? gameState.rangeMax
    : 20;

  // Random integer in [rangeMin, rangeMax]
  const v = Math.floor(Math.random() * (maxNumber - minNumber + 1)) + minNumber;

  const startX = 50;
  const endX = 4950;
  const totalWidth = endX - startX;
  const fullScaleMax = 20;
  const xSvg = startX + (v / fullScaleMax) * totalWidth;


  const viewBoxWidth = 5000;
  const ratioX = xSvg / viewBoxWidth;
  const screenX = rect.left + ratioX * rect.width;

  // Remove any previous debug gift box.
  if (activeGiftBox && activeGiftBox.parentNode) {
    activeGiftBox.parentNode.removeChild(activeGiftBox);
  }

    // Reset gift-related state.
  activeGiftBox = null;
  activeGiftValue = null;
  pendingCatchGift = false;
  hasCaughtGift = false;
  caughtGiftEl = null;

  // Reset the current round attempt log whenever a new gift appears.
  resetCurrentRoundGuesses();

  // Create a new gift box overlay centred at the chosen number-line position.

    const box = document.createElement("div");
  box.className = "gift-box";
  box.style.left = `${screenX}px`;
  const targetGiftY = window.innerHeight * 0.675;
  box.style.top = `${targetGiftY}px`;
  box.style.zIndex = "1300";

  // Use an image as the gift marker.
  const icon = document.createElement("img");
  icon.src = "./golden_key.png";
  icon.alt = "Gift";
  icon.style.pointerEvents = "none";
  box.appendChild(icon);


  document.body.appendChild(box);

  activeGiftBox = box;
  activeGiftValue = v;

  // Bring up the input panel for the child to enter the gift position.
  if (typeof showGiftInputPromptForGift === "function") {
    showGiftInputPromptForGift();
  }
}

function computeStarCount(totalAttempts, levelNo) {
  const starThresholdMatrix = [
    [7, 10],
    [10, 15],
    [10, 15],
  ];

  const thresholds = starThresholdMatrix[Math.max(0, (levelNo || 1) - 1)] || starThresholdMatrix[0];
  if (totalAttempts <= thresholds[0]) return 3;
  if (totalAttempts <= thresholds[1]) return 2;
  return 1;
}

function spawnStarSparkles(starEl) {
  if (!starEl) return;
  const sparklesToCreate = 6;
  for (let i = 0; i < sparklesToCreate; i++) {
    const sparkle = document.createElement("div");
    sparkle.className = "star-sparkle";
    const angle = Math.random() * Math.PI * 2;
    const distance = (starEl.offsetHeight || 0) * (0.4 + Math.random() * 0.4);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    sparkle.style.setProperty("--sparkleX", `${dx}px`);
    sparkle.style.setProperty("--sparkleY", `${dy}px`);
    starEl.appendChild(sparkle);
    setTimeout(() => {
      sparkle.remove();
    }, 1000);
  }
}

function animateFinalVictoryStars(starCount, onComplete) {
  if (!victoryStarsContainer) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  victoryStarsContainer.innerHTML = "";

  if (starCount <= 0) {
    if (typeof onComplete === "function") onComplete();
    return;
  }

  for (let i = 0; i < starCount; i++) {
    const starWrapper = document.createElement("div");
    starWrapper.className = "victory-star";
    const img = document.createElement("img");
    img.src = "./award_star.png";
    img.alt = "Star";
    img.className = "victory-star-image";
    starWrapper.appendChild(img);
    victoryStarsContainer.appendChild(starWrapper);
  }

  const stars = victoryStarsContainer.querySelectorAll(".victory-star");
  stars.forEach((starEl, index) => {
    const delayMs = index * 1000;
    setTimeout(() => {
      starEl.classList.add("victory-star-pop");
      spawnStarSparkles(starEl);
      if (typeof window.playClawAttemptSuccess === "function") {
        window.playClawAttemptSuccess();
      }
      if (index === stars.length - 1 && typeof onComplete === "function") {
        setTimeout(onComplete, 200);
      }
    }, delayMs);
  });
}

function showVictoryModal(isFinalLevel, completedLevelIndex, totalLevels, totalAttempts) {
  if (!victoryModal) return;

  const messageEl = document.getElementById("victoryMessage");
  const primaryBtn = document.getElementById("victoryPrimaryButton");
  const secondaryBtn = document.getElementById("victorySecondaryButton");

  // Stop any previous success voice before starting a new one.
  if (typeof window.stopVictorySuccessVoice === "function") {
    window.stopVictorySuccessVoice();
  }

  // Reset text and star visibility.
  if (messageEl) {
    messageEl.style.display = "";
    messageEl.textContent = "";
  }
  if (victoryHeadline) {
    victoryHeadline.classList.add("hidden");
  }
  if (victorySubheadline) {
    victorySubheadline.classList.add("hidden");
  }
  if (victoryStarsContainer) {
    victoryStarsContainer.classList.add("hidden");
    victoryStarsContainer.innerHTML = "";
  }
  if (victoryExtraText) {
    victoryExtraText.classList.add("hidden");
    victoryExtraText.textContent = "";
  }

  if (isFinalLevel) {
    const stars = computeStarCount(totalAttempts, totalLevels);

    if (victoryHeadline) {
      victoryHeadline.textContent = "🎉 你成功尋回全部鎖匙！";
      victoryHeadline.classList.remove("hidden");
      victoryHeadline.style.color = "#16a34a";
    }
    if (victorySubheadline) {
      victorySubheadline.textContent = "你獲得了";
      victorySubheadline.classList.remove("hidden");
      victorySubheadline.style.color = "#16a34a";
    }

    if (victoryStarsContainer) {
      victoryStarsContainer.classList.remove("hidden");
    }

    const hasFullStars = stars >= 3;
    if (!hasFullStars && victoryExtraText) {
      victoryExtraText.textContent = "下次估算得準確一些就可以得到多些星星了！";
      victoryExtraText.classList.remove("hidden");
    }

    if (primaryBtn) {
      primaryBtn.textContent = "再次由第一關開始挑戰";
      primaryBtn.onclick = handleRestartRunClick;
      primaryBtn.className = "victory-button victory-button-primary-restart";
    }

    if (secondaryBtn) {
      secondaryBtn.textContent = "🏠 返回菜單";
      secondaryBtn.onclick = handleReturnToMenuClick;
      secondaryBtn.className = "victory-button victory-button-secondary-menu";
      secondaryBtn.classList.remove("hidden");
    }

    victoryModal.classList.remove("hidden");

    // For final-level victory, first show the stars, then play the appropriate voice.
    animateFinalVictoryStars(stars, function () {
      const hasFullStarsAfter = stars >= 3;
      if (!hasFullStarsAfter) {
        if (typeof window.playMoreStarVoice === "function") {
          window.playMoreStarVoice();
        }
      } else {
        if (typeof window.playVictorySuccessVoice === "function") {
          window.playVictorySuccessVoice();
        }
      }
    });
  } else {
    // Middle-level success: keep original text-based message.
    if (messageEl) {
      messageEl.textContent =
        `👍 做得好！已完成第 ${completedLevelIndex} / ${totalLevels} 關\n前往下一關吧 🚀`;
      messageEl.style.color = "#16a34a";
      messageEl.style.display = "";
    }

    if (primaryBtn) {
      primaryBtn.textContent = "去下一關";
      primaryBtn.onclick = handleNextLevelClick;
      primaryBtn.className = "victory-button victory-button-primary-next";
    }

    if (secondaryBtn) {
      secondaryBtn.classList.add("hidden");
    }

    victoryModal.classList.remove("hidden");

    // Play a random success voice variant when the victory modal appears.
    if (typeof window.playVictorySuccessVoice === "function") {
      window.playVictorySuccessVoice();
    }
  }
}


function hideVictoryModal() {

  if (victoryModal) {
    victoryModal.classList.add("hidden");
  }
}

function handleNextLevelClick() {
  if (typeof window.stopVictorySuccessVoice === "function") {
    window.stopVictorySuccessVoice();
  }

  hideVictoryModal();

  if (window.gameCookie && typeof window.gameCookie.startLevelTimer === "function") {
    window.gameCookie.startLevelTimer();
  }

  // Clear any existing hint ticks/labels so the next level starts fresh.
  resetHintState();

  spawnRandomGiftBox();
}



function getCurrentRangeAndTolerance() {
  const rangeMin =
    typeof gameState.rangeMin === "number" && gameState.rangeMin >= 0
      ? gameState.rangeMin
      : 0;
  const rangeMax =
    typeof gameState.rangeMax === "number" && gameState.rangeMax > rangeMin
      ? gameState.rangeMax
      : 20;
  const clampTolerance =
    typeof gameState.clampTolerance === "number" && gameState.clampTolerance > 0
      ? gameState.clampTolerance
      : 1;

  return { rangeMin, rangeMax, clampTolerance };
}

// Play range-specific human overflow guidance when the input number
// exceeds the current playable range. The overflow detection logic
// itself is unchanged; this helper is only an additional voice track.
let humanOverflowAudio = null;

function playHumanOverflowVoiceForCurrentRange() {
  const { rangeMin, rangeMax } = getCurrentRangeAndTolerance();
  const fileName = `./voice_human_overflow_${rangeMin}_${rangeMax}.mp3`;

  const url =
    typeof window.sanitizeMediaUrl === "function"
      ? window.sanitizeMediaUrl(fileName)
      : fileName;

  if (!url) {
    return;
  }

  if (!humanOverflowAudio) {
    humanOverflowAudio = new Audio();
    humanOverflowAudio.preload = "auto";
  }

  try {
    humanOverflowAudio.src = url;
    humanOverflowAudio.currentTime = 0;
    humanOverflowAudio.play();
  } catch (_) {
    // If playback fails (missing file, browser restriction, etc.),
    // silently ignore so the core overflow behaviour remains intact.
  }
}


// ======================= SEN Estimation Profile (Smart Wrong Option) =======================

const SEN_PROFILE_STORAGE_KEY = "sen_claw_game_data";

function loadProfileData() {
  let root = {};

  try {
    const raw = window.localStorage ? window.localStorage.getItem(SEN_PROFILE_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        root = parsed;
      }
    }
  } catch (_) {
    // localStorage may be unavailable; fall back to an in-memory profile.
  }

  // New structure: biasProfile.ranges["min-max"] = { zones: {low/mid/high}, successStreak }
  if (!root.biasProfile || typeof root.biasProfile !== "object") {
    root.biasProfile = { ranges: {} };
  } else if (!root.biasProfile.ranges && root.biasProfile.zones) {
    // Migrate legacy single-range structure into a "legacy" range key so we
    // don't discard existing data.
    const oldZones = root.biasProfile.zones;
    const oldSuccess =
      typeof root.biasProfile.successStreak === "number"
        ? root.biasProfile.successStreak
        : 0;
    root.biasProfile = {
      ranges: {
        legacy: {
          zones: oldZones,
          successStreak: oldSuccess,
        },
      },
    };
  } else if (!root.biasProfile.ranges) {
    root.biasProfile.ranges = {};
  }

  return root.biasProfile;
}

function getProfileRangeKey(rangeMin, rangeMax) {
  const min = Number.isFinite(rangeMin) ? rangeMin : 0;
  const max = Number.isFinite(rangeMax) ? rangeMax : 20;
  return `${min}-${max}`;
}

function ensureRangeProfile(biasProfile, rangeMin, rangeMax) {
  if (!biasProfile || typeof biasProfile !== "object") {
    biasProfile = { ranges: {} };
  }
  if (!biasProfile.ranges || typeof biasProfile.ranges !== "object") {
    biasProfile.ranges = {};
  }

  const key = getProfileRangeKey(rangeMin, rangeMax);
  let rangeProfile = biasProfile.ranges[key];

  if (!rangeProfile || typeof rangeProfile !== "object") {
    rangeProfile = {
      zones: {
        low: {
          under: 0,
          over: 0,
          missTotal: 0,
          under2: 0,
          under3: 0,
          over2: 0,
          over3: 0,
        },
        mid: {
          under: 0,
          over: 0,
          missTotal: 0,
          under2: 0,
          under3: 0,
          over2: 0,
          over3: 0,
        },
        high: {
          under: 0,
          over: 0,
          missTotal: 0,
          under2: 0,
          under3: 0,
          over2: 0,
          over3: 0,
        },
      },
      successStreak: 0,
    };
    biasProfile.ranges[key] = rangeProfile;
  } else {
    const zones = rangeProfile.zones || (rangeProfile.zones = {});
    ["low", "mid", "high"].forEach((name) => {
      const z = zones[name] || (zones[name] = {});
      if (typeof z.under !== "number") z.under = 0;
      if (typeof z.over !== "number") z.over = 0;
      if (typeof z.missTotal !== "number") z.missTotal = 0;
      if (typeof z.under2 !== "number") z.under2 = 0;
      if (typeof z.under3 !== "number") z.under3 = 0;
      if (typeof z.over2 !== "number") z.over2 = 0;
      if (typeof z.over3 !== "number") z.over3 = 0;
    });
    if (typeof rangeProfile.successStreak !== "number") {
      rangeProfile.successStreak = 0;
    }
  }

  return rangeProfile;
}



function saveProfileData(profile) {
  try {
    if (!window.localStorage) return;
    const raw = window.localStorage.getItem(SEN_PROFILE_STORAGE_KEY);
    let root = {};
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        root = parsed;
      }
    }

    // Preserve any existing fields (e.g. best_record) and attach the bias
    // profile alongside them.
    root.biasProfile = profile;
    window.localStorage.setItem(SEN_PROFILE_STORAGE_KEY, JSON.stringify(root));
  } catch (_) {
    // Swallow storage errors; the game should remain playable without
    // persistent profiling.
  }
}

function getRangeZoneForTarget(target, rangeMin, rangeMax) {
  if (!Number.isFinite(target)) return "mid";
  const span = rangeMax - rangeMin;
  if (!Number.isFinite(span) || span <= 0) return "mid";

  const normalized = (target - rangeMin) / span; // 0 → 1
  if (normalized <= 1 / 3) return "low";
  if (normalized >= 2 / 3) return "high";
  return "mid";
}

function resetCurrentRoundGuesses() {
  currentRoundGuesses = [];
}

function saveAttemptToHistory(target, guess, rangeMin, rangeMax) {
  if (!Number.isFinite(target) || !Number.isFinite(guess)) {
    return;
  }

  // Record in current-round log so Layer 1 can analyse the most recent
  // 3–4 misses for the active gift.
  const error = guess - target;
  const isHit = Math.abs(error) <= 1; // SEN rule: ±1 is treated as a hit

  currentRoundGuesses.push({ target, guess, isHit });

    // Update persistent bias profile (Layer 2), scoped to the current range
  // (so 0–10, 11–20, 0–20 each retain their own statistics).
  const biasProfile = loadProfileData();
  const rangeProfile = ensureRangeProfile(biasProfile, rangeMin, rangeMax);
  const zoneName = getRangeZoneForTarget(target, rangeMin, rangeMax);
  const zone = rangeProfile.zones[zoneName];

  if (isHit) {
    // Successful estimation: increase success streak and decay historical
    // bias slightly so recent improvement is recognised. Only the current
    // range's zones are decayed.
    rangeProfile.successStreak = (rangeProfile.successStreak || 0) + 1;

    Object.keys(rangeProfile.zones).forEach((key) => {
      const z = rangeProfile.zones[key];
      z.under = Math.floor(z.under * 0.8);
      z.over = Math.floor(z.over * 0.8);
      z.missTotal = Math.floor(z.missTotal * 0.8);
      z.under2 = Math.floor((typeof z.under2 === "number" ? z.under2 : 0) * 0.8);
      z.under3 = Math.floor((typeof z.under3 === "number" ? z.under3 : 0) * 0.8);
      z.over2 = Math.floor((typeof z.over2 === "number" ? z.over2 : 0) * 0.8);
      z.over3 = Math.floor((typeof z.over3 === "number" ? z.over3 : 0) * 0.8);
    });

    // After 5 consecutive successful attempts *within this range*, clear
    // stale bias for this range only.
    if (rangeProfile.successStreak >= 5) {
      Object.keys(rangeProfile.zones).forEach((key) => {
        const z = rangeProfile.zones[key];
        z.under = 0;
        z.over = 0;
        z.missTotal = 0;
        z.under2 = 0;
        z.under3 = 0;
        z.over2 = 0;
        z.over3 = 0;
      });
      rangeProfile.successStreak = 0;
    }
  } else {
    // Miss: reset success streak (for this range only) and accumulate
    // under/over bias and magnitude buckets.
    rangeProfile.successStreak = 0;
    zone.missTotal += 1;
    if (error < 0) {
      zone.under += 1;
      if (error === -2) zone.under2 += 1;
      else if (error === -3) zone.under3 += 1;
    } else if (error > 0) {
      zone.over += 1;
      if (error === 2) zone.over2 += 1;
      else if (error === 3) zone.over3 += 1;
    }
  }

  const contributionType = isHit
    ? "hit"
    : error < 0
      ? "underestimation"
      : error > 0
        ? "overestimation"
        : "exact";

  console.log(
    "[SEN] saveAttemptToHistory: target=%d, guess=%d, error=%d, isHit=%s, range=%s, zone=%s, contribution=%s, zoneStats={under:%d, over:%d, missTotal:%d, under2:%d, under3:%d, over2:%d, over3:%d}, successStreak(range)=%d",
    target,
    guess,
    error,
    isHit,
    getProfileRangeKey(rangeMin, rangeMax),
    zoneName,
    contributionType,
    zone.under,
    zone.over,
    zone.missTotal,
    zone.under2,
    zone.under3,
    zone.over2,
    zone.over3,
    rangeProfile.successStreak
  );

  saveProfileData(biasProfile);
}



function getSmartWrongOption(target, currentRoundGuessesParam, rangeMin, rangeMax) {
  if (!Number.isFinite(target)) {
    return target;
  }

  const candidateOffsetsAll = [-3, -2, 2, 3];
  let direction = null; // "under", "over", or null when inconclusive
  let biasSource = "fallback"; // "layer1", "layer2", "fallback"

  // ----- Layer 1: Local session analysis (current round) -----
  const roundGuesses = Array.isArray(currentRoundGuessesParam)
    ? currentRoundGuessesParam
    : currentRoundGuesses;

    const relevantMisses = roundGuesses.filter((attempt) => {
    return (
      attempt &&
      attempt.target === target &&
      !attempt.isHit &&
      Number.isFinite(attempt.guess)
    );
  });

  const recentMisses = relevantMisses.slice(-4);
  const missCount = recentMisses.length;

  let localUnderRatio = 0;
  let localOverRatio = 0;
  let localUnder2Count = 0;
  let localUnder3Count = 0;
  let localOver2Count = 0;
  let localOver3Count = 0;

  if (missCount >= 3) {
    let under = 0;
    let over = 0;
    recentMisses.forEach((attempt) => {
      const err = attempt.guess - target;
      if (err < 0) {
        under += 1;
        if (err === -2) localUnder2Count += 1;
        else if (err === -3) localUnder3Count += 1;
      } else if (err > 0) {
        over += 1;
        if (err === 2) localOver2Count += 1;
        else if (err === 3) localOver3Count += 1;
      }
    });

    localUnderRatio = under / missCount;
    localOverRatio = over / missCount;

    if (localUnderRatio >= 0.6) {
      direction = "under";
      biasSource = "layer1";
    } else if (localOverRatio >= 0.6) {
      direction = "over";
      biasSource = "layer1";
    }

    console.log(
      "[SEN] Layer1 (current round) for target=%d: missCount=%d, under=%d (%.2f), over=%d (%.2f), localBuckets={under2:%d, under3:%d, over2:%d, over3:%d}, direction=%s",
      target,
      missCount,
      under,
      localUnderRatio,
      over,
      localOverRatio,
      localUnder2Count,
      localUnder3Count,
      localOver2Count,
      localOver3Count,
      direction
    );
  } else {
    console.log(
      "[SEN] Layer1 (current round) for target=%d: insufficient misses (missCount=%d) for a clear tendency",
      target,
      missCount
    );
  }

  // ----- Layer 2: Persistent profile analysis (historical context) -----
  let histUnderRatio = 0;
  let histOverRatio = 0;
  let histUnder2 = 0;
  let histUnder3 = 0;
  let histOver2 = 0;
  let histOver3 = 0;
  let zoneNameForLog = null;
  let zoneForLog = null;


    if (!direction) {
    const biasProfile = loadProfileData();
    const rangeProfile = ensureRangeProfile(biasProfile, rangeMin, rangeMax);
    const zoneName = getRangeZoneForTarget(target, rangeMin, rangeMax);
    const zone = rangeProfile.zones[zoneName];
    zoneNameForLog = zoneName;
    zoneForLog = zone;

    if (zone && zone.missTotal >= 3) {
      histUnderRatio = zone.under / zone.missTotal;
      histOverRatio = zone.over / zone.missTotal;
      histUnder2 = typeof zone.under2 === "number" ? zone.under2 : 0;
      histUnder3 = typeof zone.under3 === "number" ? zone.under3 : 0;
      histOver2 = typeof zone.over2 === "number" ? zone.over2 : 0;
      histOver3 = typeof zone.over3 === "number" ? zone.over3 : 0;

      if (histUnderRatio >= 0.6) {
        direction = "under";
        biasSource = "layer2";
      } else if (histOverRatio >= 0.6) {
        direction = "over";
        biasSource = "layer2";
      }

      if (biasSource === "layer2") {
        // Highlight that Layer 2 has actively influenced the bias decision
        // using a styled console message.
        console.log(
          "%c[SEN] Layer2 BIAS ACTIVE%c target=%d, range=%s, zone=%s, direction=%s",
          "color:#10b981;font-weight:bold;",
          "color:inherit;",
          target,
          getProfileRangeKey(rangeMin, rangeMax),
          zoneName,
          direction
        );
      }
    }

    console.log(
      "[SEN] Layer2 (historical) for target=%d, range=%s, zone=%s: missTotal=%d, under=%d (%.2f), over=%d (%.2f), buckets={under2:%d, under3:%d, over2:%d, over3:%d}, direction=%s",
      target,
      getProfileRangeKey(rangeMin, rangeMax),
      zoneName,
      zone ? zone.missTotal : 0,
      zone ? zone.under : 0,
      histUnderRatio,
      zone ? zone.over : 0,
      histOverRatio,
      histUnder2,
      histUnder3,
      histOver2,
      histOver3,
      direction
    );
  }




  if (!direction) {
    console.log(
      "[SEN] Bias direction fallback for target=%d: no clear tendency in Layer1 or Layer2",
      target
    );
  }

  // If both layers are inconclusive, fall back to a neutral random direction.
  let offsetPool;
  if (direction === "under") {
    offsetPool = [-3, -2];
  } else if (direction === "over") {
    offsetPool = [2, 3];
  } else {
    offsetPool = candidateOffsetsAll.slice();
  }

  function buildCandidates(offsets) {
    const vals = [];
    offsets.forEach((off) => {
      const val = target + off;
      if (val >= rangeMin && val <= rangeMax && val !== target) {
        vals.push(val);
      }
    });
    return vals;
  }

  // Prefer offsets that match the inferred bias direction.
  let candidates = buildCandidates(offsetPool);

  // Boundary clipping: if the preferred direction yields no valid options,
  // fall back to the full set of ±2/±3 offsets.
  if (!candidates.length) {
    console.log(
      "[SEN] Boundary clipping for target=%d: offsetPool=%j yielded no candidates within [%d,%d]; falling back to full offsets",
      target,
      offsetPool,
      rangeMin,
      rangeMax
    );
    candidates = buildCandidates(candidateOffsetsAll);
  }

    if (!candidates.length) {
    // Extreme edge case (very tiny range): choose the nearest boundary that
    // is not equal to the target.
    const fallback = [];
    if (rangeMin !== target) fallback.push(rangeMin);
    if (rangeMax !== target && rangeMax !== rangeMin) fallback.push(rangeMax);
    if (fallback.length) {
      const chosenBoundary = fallback[Math.floor(Math.random() * fallback.length)];
      console.log(
        "[SEN] Extreme range fallback for target=%d: candidates empty, choosing boundary %d within [%d,%d]",
        target,
        chosenBoundary,
        rangeMin,
        rangeMax
      );
      return chosenBoundary;
    }

    // As a last resort, clamp target ±2 into the valid range.
    let val = target + 2;
    if (val < rangeMin) val = rangeMin;
    if (val > rangeMax) val = rangeMax;
    console.log(
      "[SEN] Final clamp fallback for target=%d: returning %d within [%d,%d]",
      target,
      val,
      rangeMin,
      rangeMax
    );
    return val;
  }

  // Use weighted selection when we have a clear direction and bucket data,
  // otherwise fall back to uniform random choice.
  const weights = [];
  let totalWeight = 0;

  candidates.forEach((val) => {
    const off = val - target;
    let w = 1; // base weight

    if (direction === "under") {
      if (off === -2) {
        w += localUnder2Count + histUnder2;
      } else if (off === -3) {
        w += localUnder3Count + histUnder3;
      }
    } else if (direction === "over") {
      if (off === 2) {
        w += localOver2Count + histOver2;
      } else if (off === 3) {
        w += localOver3Count + histOver3;
      }
    }

    weights.push({ value: val, weight: w, offset: off });
    totalWeight += w;
  });

  let chosen = null;

  if (totalWeight > 0) {
    const r = Math.random() * totalWeight;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i].weight;
      if (r <= acc) {
        chosen = weights[i].value;
        break;
      }
    }
  }

  if (chosen == null) {
    chosen = candidates[Math.floor(Math.random() * candidates.length)];
  }

  console.log(
    "[SEN] getSmartWrongOption result: target=%d, range=[%d,%d], biasSource=%s, direction=%s, offsetPool=%j, candidates=%j, weights=%j, chosen=%d",
    target,
    rangeMin,
    rangeMax,
    biasSource,
    direction,
    offsetPool,
    candidates,
    weights,
    chosen
  );

  // Randomly pick one smart wrong option from the candidate list.
  return chosen;
}





function handleRestartRunClick() {
  if (typeof window.stopVictorySuccessVoice === "function") {
    window.stopVictorySuccessVoice();
  }

  hideVictoryModal();

  const { rangeMin, rangeMax, clampTolerance } = getCurrentRangeAndTolerance();

  if (window.gameCookie) {
    if (typeof window.gameCookie.resetRunStateForNewAttempt === "function") {
      window.gameCookie.resetRunStateForNewAttempt(rangeMax, clampTolerance, rangeMin);
    }
    if (typeof window.gameCookie.initRunState === "function") {
      window.gameCookie.initRunState(rangeMax, clampTolerance, rangeMin);
    }
  }

  resetHintState();
  spawnRandomGiftBox();
}


function handleReturnToMenuClick() {
  if (typeof window.stopVictorySuccessVoice === "function") {
    window.stopVictorySuccessVoice();
  }

  // Clear hint ticks/labels when returning to the menu.
  resetHintState();

  returnToMenu();
}


function returnToMenu() {

  const targetUrl = new URL("menu_2.html", window.location.href);

  setTimeout(() => {
    window.location.href = targetUrl.toString();
  }, 1200);
}

// Bootstraps game-2 after all media and visual assets are ready.
// This restores level-setting handling (range/tolerance), number-line
// setup, run-state timer, and the first gift box.

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
      // continue after a timeout so the game can still start.
      setTimeout(handleReady, timeoutMs);
    });
  });

  return Promise.all(perElementPromises);
}

function waitForGameAssetsReady(timeoutMs = 8000) {
  // Wait for both the canvas visuals (background image) and any
  // document-level audio/video elements to be ready.
  return Promise.all([
    visualAssetsReadyPromise,
    waitForDocumentMediaReady(timeoutMs),
  ]).catch(() => {
    // If anything fails to load, continue anyway so the game remains playable.
  });
}

async function bootstrapGame2() {
  await waitForGameAssetsReady();

    initGameConfigFromUrl();
  initNumberLineFromGameConfig();
  initGiftControlPanel();

  // Preload fairy video/audio so guidance can appear without delay.
  initFairyMedia();

  const { rangeMin, rangeMax, clampTolerance } = getCurrentRangeAndTolerance();
  if (window.gameCookie && typeof window.gameCookie.initRunState === "function") {
    window.gameCookie.initRunState(rangeMax, clampTolerance, rangeMin);
  }

  resetHintState();
  spawnRandomGiftBox();


  // Once the game has finished bootstrapping, hide the preparation overlay.
  if (typeof window.hidePrepOverlay === "function") {
    // When the overlay has completely disappeared, start looping background music.
    window.onPrepOverlayHidden = function () {
      if (typeof window.playPrepBgMusicLoop === "function") {
        window.playPrepBgMusicLoop();
      }
    };
    window.hidePrepOverlay();
  }
}




if (document.readyState === "complete") {
  // If the page has already finished loading, start the game bootstrap immediately.
  bootstrapGame2();
} else {
  window.addEventListener("load", () => {
    bootstrapGame2();
  });
}