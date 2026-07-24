// ======================= 2.5D Jungle Canvas =======================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;

// Wooden sign video removed



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
    const maxMoveDuration = 4;
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
    // then clamp into a friendly 0.3–1.2 second window.
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



if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initClawMachine);
} else {
  initClawMachine();
}


function resizeCanvas() {

  if (!canvas) return;
  // Full-screen canvas to match CSS (100% width and height)
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", () => {
  resizeCanvas();
  initTrees();
  initCrates();
  initParticles();
  if (typeof sunshineEffect !== "undefined" && sunshineEffect) {
    sunshineEffect.handleResize();
  }
});



// Image assets
const images = {
  fieldBg: new Image(),
  tree: new Image(),
  leaf: new Image(),
  tallTree: new Image(),
  crate: new Image(),
  cloud: new Image(), // NEW
  pineapple: new Image(),
};

// Use provided assets
images.fieldBg.src = "./stb_treasure_field_1.png";
images.leaf.src = "./leaf.png";





const layers = {

  deepBackground: {
    image: images.fieldBg,
    blur: 0, // subtle depth-of-field on far background
  },
  particles: [],
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

const particleConfigs = {

  numLeavesAmbient: 50, // existing "current" leaves
  numLeavesTreePerSide: 50, // same rate as ambient per side tree
  numLeavesSky: 25, // 50% of ambient rate
  minLeafSize: 20, // ALL leaves: 20px–40px square
  maxLeafSize: 40,
  windFrequency: 0.005,
};


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





const treeSwayConfig = {
  frequency: 0.0006, // very low frequency sway
  amplitude: 10, // pixels
};

function initTrees() {
  // Trees removed; nothing to initialise
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




// Particle configuration for falling leaves

// All leaves use a square size between 20px and 40px and share the same
// wind behaviour, regardless of their spawn source.
const particleConfig = {
  maxActiveLeaves:
    particleConfigs.numLeavesAmbient +
    particleConfigs.numLeavesTreePerSide * 2 +
    particleConfigs.numLeavesSky,
  minSize: particleConfigs.minLeafSize,
  maxSize: particleConfigs.maxLeafSize,
  baseSpeed: 0.8,
  maxExtraSpeed: 1.6,
  windFrequency: particleConfigs.windFrequency,
  windAmplitude: 25,
  spawnChanceTreePerFrame: 0.08, // "current" leaves rate
  spawnChanceSkyPerFrame: 0.04, // 50% less frequent than tree rate
};

// Leaf instances are shared across different spawn sources.
// type: "tree" | "sky"
function createLeaf(sourceType) {
  const zDepth = Math.random(); // 0 (far) -> 1 (near)
  const size =
    particleConfig.minSize +
    Math.random() * (particleConfig.maxSize - particleConfig.minSize);

  let spawnX = Math.random() * canvas.width;
  let spawnY = -size; // default spawn slightly above the top edge

  if (sourceType === "tree") {
    // Simple: spawn from upper third of canvas (no trees)
    spawnX = Math.random() * canvas.width;
    spawnY = Math.random() * (canvas.height * 0.3);
  } else if (sourceType === "sky") {
    // Sky leaves: spawn from slightly above the visible canvas.
    spawnX = Math.random() * canvas.width;
    spawnY = -Math.random() * (canvas.height * 0.2);
  }


    // Rigid-body physics state
  const mass = 0.4 + Math.random() * 0.2; // slightly heavier leaves for stability
  const rho = 1.0; // air density (game units)
  const Cd_base = 1.0 + Math.random() * 0.3; // base drag coefficient


  const initialSpeedDown = 40 + Math.random() * 40; // initial downward speed
  const vx = (Math.random() - 0.5) * 40; // small horizontal component
  const vy = initialSpeedDown;
  const angle = Math.random() * Math.PI * 2; // random orientation
  const angularVel = (Math.random() - 0.5) * 1.0; // initial spin

  return {
    type: sourceType,
    x: spawnX,
    y: spawnY,
    vx,
    vy,
    angle,
    angularVel,
    mass,
    size,
    rho,
    Cd_base,
    zDepth,
  };
}


function initParticles() {
  layers.particles.length = 0;
}

function spawnLeaves(time) {
  // Spawn tree-origin leaves ("current" leaves) at the base rate.
  const activeTreeLeaves = layers.particles.filter(
    (leaf) => leaf.type === "tree"
  );
  if (
    activeTreeLeaves.length <
      particleConfigs.numLeavesAmbient +
        particleConfigs.numLeavesTreePerSide * 2 &&
    Math.random() < particleConfig.spawnChanceTreePerFrame
  ) {
    layers.particles.push(createLeaf("tree"));
  }

  // Spawn sky-origin leaves at 50% of the current leaf rate.
  const activeSkyLeaves = layers.particles.filter(
    (leaf) => leaf.type === "sky"
  );
  if (
    activeSkyLeaves.length < particleConfigs.numLeavesSky &&
    Math.random() < particleConfig.spawnChanceSkyPerFrame
  ) {
    layers.particles.push(createLeaf("sky"));
  }

  // Global cap for safety.
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
  const swayFrequency =
    (options && options.frequency) || treeSwayConfig.frequency;
  const swayAmplitude =
    (options && options.amplitude) || treeSwayConfig.amplitude;

  let drawX = tree.baseX;
  if (sway) {
    drawX += Math.sin(time * swayFrequency + tree.swayPhase) * swayAmplitude;
  }

  const treeWidth = images.tree.width * tree.scale;
  const treeHeight = images.tree.height * tree.scale;
  const x = drawX - treeWidth / 2;
  const y = tree.bottomY - treeHeight;

  ctx.save();
  ctx.filter = blur ? `blur(${blur}px)` : "none";
  ctx.drawImage(images.tree, x, y, treeWidth, treeHeight);

  if (tintColor) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = tintColor;
    ctx.fillRect(x, y, treeWidth, treeHeight);
  }

  ctx.restore();
}

function drawTallSideTrees() {
  if (!ctx || !images.tallTree.complete) return;

  const tallImg = images.tallTree;

  ctx.save();
  ctx.filter = "none";

  ["left", "right"].forEach((side) => {
    const tree = layers.sideTrees[side];
    if (!tree) return;

    ctx.drawImage(tallImg, tree.x, tree.y, tree.width, tree.height);
  });

  ctx.restore();
}

function drawTrees(time) {
  // Trees removed; nothing to draw
}


// Draw a white arrow connecting the centres of the tree stumps and
// indicating ascending/descending direction.
function drawModeArrow() {
  // Mode arrow on stumps removed
}


// DOM overlay arrow drawn directly on top of the stump images.
const SVG_NS = "http://www.w3.org/2000/svg";
let domModeArrowSvg = null;

// SVG layer for drawing "<" comparison symbols between pineapples.
let pineappleCompareSvg = null;

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


function drawAndUpdateParticles(time) {


  if (!ctx || !images.leaf.complete) return;

  const dt = 1 / 60; // fixed timestep for stability
  const GRAVITY = 500; // pixels/s^2 downward
  const FORCE_SCALE = 0.00002; // scales drag/lift forces into sane pixel units
  const VORTEX_SCALE = 5; // smaller chaotic perturbation for visibility

  function normalizeAngle(a) {
    // wrap angle to [-PI, PI]
    return ((a + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  const leaves = layers.particles;

  for (let i = leaves.length - 1; i >= 0; i--) {
    const leaf = leaves[i];

    // Ensure physics state exists (for any legacy leaves)
    if (typeof leaf.vx !== "number") leaf.vx = 0;
    if (typeof leaf.vy !== "number") leaf.vy = 0;
    if (typeof leaf.angle !== "number") leaf.angle = Math.random() * Math.PI * 2;
    if (typeof leaf.angularVel !== "number") leaf.angularVel = 0;
    if (typeof leaf.mass !== "number") leaf.mass = 0.4;
    if (typeof leaf.size !== "number") leaf.size =
      particleConfig.minSize +
      Math.random() * (particleConfig.maxSize - particleConfig.minSize);
    if (typeof leaf.rho !== "number") leaf.rho = 1.0;
    if (typeof leaf.Cd_base !== "number") leaf.Cd_base = 1.0;

    let vx = leaf.vx;
    let vy = leaf.vy;

    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);

    let ax = 0;
    let ay = GRAVITY; // base gravitational acceleration

    let angle = leaf.angle;
    let angularVel = leaf.angularVel;

    if (v > 0.01) {
      // Angle of attack between velocity vector and leaf's local X-axis
      const velAngle = Math.atan2(vy, vx);
      const alpha = normalizeAngle(velAngle - angle);

      // Dynamic drag coefficient
      const sinAlpha = Math.sin(alpha);
      const Cd = leaf.Cd_base * (1 + 2 * sinAlpha * sinAlpha);

      // Projected area depending on orientation
      const A =
        leaf.size * leaf.size * Math.abs(Math.cos(alpha)) +
        leaf.size * 0.15 * Math.abs(Math.sin(alpha));

      const rho = leaf.rho;

      // Drag force magnitude (opposite velocity)
      const dragMag = 0.5 * rho * Cd * A * v2 * FORCE_SCALE;
      const dragFx = (-vx / v) * dragMag;
      const dragFy = (-vy / v) * dragMag;

      // Lift force magnitude (perpendicular to velocity)
      const liftMag = dragMag * 0.25; // tuned factor for stability
      const liftFx = (-vy / v) * liftMag;
      const liftFy = (vx / v) * liftMag;

      // Total aerodynamic force
      let fx = dragFx + liftFx;
      let fy = dragFy + liftFy;

      // Chaotic vortex shedding perturbation
      fx += (Math.random() - 0.5) * VORTEX_SCALE;

      // Linear acceleration from forces
      ax += fx / leaf.mass;
      ay += fy / leaf.mass;

      // Flutter & tumble torque
      const I = (leaf.mass * leaf.size * leaf.size) / 12; // square plate inertia
      const alpha_ang = (0.01 * v2 * Math.sin(2 * alpha)) / I;
      angularVel += alpha_ang * dt;
    }

    // Semi-Implicit Euler integration
    vx += ax * dt;
    vy += ay * dt;

    leaf.x += vx * dt;
    leaf.y += vy * dt;

    leaf.vx = vx;
    leaf.vy = vy;

    leaf.angularVel = angularVel;
    leaf.angle += leaf.angularVel * dt;

    // Draw leaf with rotation and depth blur
    const blur = leaf.zDepth < 0.2 || leaf.zDepth > 0.8 ? 2.5 : 0;

    ctx.save();
    ctx.filter = blur ? `blur(${blur}px)` : "none";
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.angle);
    ctx.drawImage(
      images.leaf,
      -leaf.size / 2,
      -leaf.size / 2,
      leaf.size,
      leaf.size
    );
    ctx.restore();

    // Viewport culling (no respawn)
    if (
      leaf.y > canvas.height + 100 ||
      leaf.x < -100 ||
      leaf.x > canvas.width + 100
    ) {
      leaves.splice(i, 1);
    }
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

    // Layers 2-4: trees
  drawTrees(time);

    // Layer 5: crates placed in the mid-ground (removed visually; crates now act as
  // invisible anchor points for the numbered tile clouds)
  // drawCrates();

  // (Canvas-based mode arrow removed; DOM-based arrow is drawn directly
  // on top of the stump DOM elements via updateDomModeArrow.)

  // Wooden sign video layer (drawn on top of crates, before particles and rays)
  // drawSignVideo();



  // Layer 6: ambient + tree + sky leaf particles
  spawnLeaves(time);
  drawAndUpdateParticles(time);

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
  "leaf",
];

const loadedAssets = new Set();

function onAssetReady(assetKey) {
  if (loadedAssets.has(assetKey)) return;
  loadedAssets.add(assetKey);

    if (loadedAssets.size === requiredAssetKeys.length) {
    initTrees();
    initCrates();
    initParticles();
    sunshineEffect = initSunshineEffect(canvas);
    requestAnimationFrame(gameLoop);
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

        // Configure oval shadow on the top of the tree stump
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
  maxNumber: 10,
  clampTolerance: 1,
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

// 在新流程中，模式及等級會由主選單提供，
// 此函式只保留作後備使用。
function selectMode(mode) {
  gameState.mode = mode;
  if (difficultySelection) {
    difficultySelection.classList.remove("hidden");
  }
}

function startGame(difficulty) {
  // Sorting game removed; only header and visuals remain
  gameState.difficulty = difficulty;

  if (mainMenu) mainMenu.classList.add("hidden");
  if (gameArea) gameArea.classList.remove("hidden");


        // 設置 UI
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
  const rangeMaxParam = params.get("rangeMax");
  const clampTolParam = params.get("clampTolerance");

  if (rangeMaxParam) {
    const parsedMax = parseInt(rangeMaxParam, 10);
    if (!Number.isNaN(parsedMax) && parsedMax > 0) {
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
    const maxNumber = typeof gameState.maxNumber === "number" && gameState.maxNumber > 0 ? gameState.maxNumber : 10;
    rangeInfo.innerHTML = `🔢 範圍：0 至 ${maxNumber}`;
  }

  if (precisionInfo) {
    const clampTolerance = typeof gameState.clampTolerance === "number" && gameState.clampTolerance > 0 ? gameState.clampTolerance : 1;
    precisionInfo.innerHTML = `🧸 夾子：允許 ${clampTolerance} 落差`;
  }
}

// Decide the number line scale (10 or 20) from game state / URL config.
function getNumberLineScaleFromGameState() {
  const max = typeof gameState.maxNumber === "number" ? gameState.maxNumber : null;
  if (max && max > 0) {
    return max;
  }

  const difficulty = gameState.difficulty || "easy";
  // Default mapping: easy -> 10, others -> 20
  return difficulty === "easy" ? 10 : 20;
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

  // Only draw ticks at 0 and at the maximum value (10 or 20)
  for (let i = 0; i <= scale; i += scale) {
    // Guaranteed perfectly even spacing using linear interpolation
    const xPos = startX + (i / scale) * totalWidth;
    appendTickAndLabel(
      ticksGroupBack,
      labelsGroupBack,
      xPos + backOffsetX,
      yCenter + backOffsetY,
      i,
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
      i,
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

// Auto-start header config and render the bottom number line
initGameConfigFromUrl();
initNumberLineFromGameConfig();


// Disable all game SFX audio sources at startup
(function disableGameAudio() {
  const ids = ["sfxPlaceCorrect", "sfxPlaceWrong", "sfxCorrectHappy"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      el.pause && el.pause();
    } catch (_) {}
    el.src = "";
    el.removeAttribute("src");
    try {
      el.load && el.load();
    } catch (_) {}
  });
})();






function ensureCloudTileFloatStyles() {
  // Cloud floating removed
}


// Failsafe helper: animate a numbered cloud when a wrong placement
// happens on a slot. The cloud is pulled to the slot centre, tinted
// with the monochrome filter, shakes left/right for 2 seconds, then
// pops back to its original crate and resumes the subtle floating.
function playCloudErrorOnSlot(sourceTile, slot) {
  // Cloud error animation removed
}




function renderNumbers() {
  // Numbered clouds removed
}


let activePointerId = null;
let pointerOffsetX = 0;
let pointerOffsetY = 0;


function handlePointerDownOnNumber(e) {
  e.preventDefault();
  const target = e.currentTarget;

  gameState.draggedElement = target;
  gameState.draggedValue = target.dataset.value;

  const rect = target.getBoundingClientRect();

  // NOTE:
  // .num tiles use transform: translate(-50%, -100%), so the inline
  // left/top correspond to the *bottom centre* of the cloud tile.
  // If we calculate offsets from the visual centre, the anchor
  // point used when updating left/top won't match and the tile
  // appears to "lag" behind the cursor vertically.
  //
  // Instead, treat the bottom centre as the logical anchor while
  // dragging so the cursor stays glued to the same visual point.
  const anchorX = rect.left + rect.width / 2;
  const anchorY = rect.bottom;

  pointerOffsetX = e.clientX - anchorX;
  pointerOffsetY = e.clientY - anchorY;

  activePointerId = e.pointerId;

  if (target.setPointerCapture) {
    target.setPointerCapture(activePointerId);
  }

  target.classList.add("dragging");
}

function handlePointerMoveOnNumber(e) {
  if (!gameState.draggedElement || e.pointerId !== activePointerId) return;
  e.preventDefault();

  const target = gameState.draggedElement;

  // Reconstruct the anchored bottom-centre position from the
  // current pointer location and the initial offset captured at
  // pointerdown.
  const anchorX = e.clientX - pointerOffsetX;
  const anchorY = e.clientY - pointerOffsetY;

  target.style.left = `${anchorX}px`;
  target.style.top = `${anchorY}px`;

    const slots = document.querySelectorAll(".slot");
  slots.forEach((slot) => {
    const rect = slot.getBoundingClientRect();
    const within =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    const wrapper = slot.closest(".slot-wrapper");

    if (within) {
      if (!slot.classList.contains("highlight")) {
        slot.classList.add("highlight");
      }
      if (wrapper && !wrapper.classList.contains("highlight")) {
        wrapper.classList.add("highlight");
      }
    } else {
      if (slot.classList.contains("highlight")) {
        slot.classList.remove("highlight");
      }
      if (wrapper && wrapper.classList.contains("highlight")) {
        wrapper.classList.remove("highlight");
      }
    }
  });
}



function handlePointerUpOnNumber(e) {
  if (!gameState.draggedElement || e.pointerId !== activePointerId) return;
  e.preventDefault();

  const target = gameState.draggedElement;

  let placed = false;
  let errorAnimationTriggered = false;

    const highlightedSlot = document.querySelector(".slot.highlight");
  if (highlightedSlot && gameState.draggedValue !== null) {
    const slotIndex = parseInt(highlightedSlot.dataset.index, 10);
    const expectedSlotIndex =
      gameState.mode === "ascending"
        ? gameState.nextIndex
        : 4 - gameState.nextIndex;
    if (slotIndex !== expectedSlotIndex) {
            setSpeech("請依序填答案 💪");
      playSlotErrorAnimation(highlightedSlot, 500);


      if (target) {
        playCloudErrorOnSlot(target, highlightedSlot);
        errorAnimationTriggered = true;
      }
    } else if (highlightedSlot.textContent.trim() !== "") {
      setSpeech("這個空格已經有數字啦！");

    } else {
      setSlotValue(
        highlightedSlot,
        gameState.draggedValue,
        gameState.draggedElement
      );
      placed = true;
    }
  }


  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
    const wrapper = slot.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  });


  // If we didn't place the tile into a slot, and no error animation
  // is currently running, snap it back to its home cloud.
  if (!placed && !errorAnimationTriggered) {
    updateNumberTilePositions();
  }

  target.classList.remove("dragging");

  if (target.releasePointerCapture && activePointerId != null) {
    try {
      target.releasePointerCapture(activePointerId);
    } catch (e) {
      // ignore
    }
  }

  gameState.draggedValue = null;
  gameState.draggedElement = null;
  activePointerId = null;
}



function addNumberEventListeners(div) {
  // Dragging removed (no listeners attached)
}



function renderSlots() {
  // Numbered slots removed
}






// 根據模式及下一個應填格仔，更新柵欄狀態
function updateGateOverlays() {
  // Numbered slots removed
}


function addSlotEventListeners(slot) {
  slot.addEventListener("dragover", handleDragOver);
  slot.addEventListener("dragenter", handleDragEnter);
  slot.addEventListener("dragleave", handleDragLeave);
  slot.addEventListener("drop", handleDrop);
}

// Play the "shake" error animation centred on the spinning cube.
function playSlotErrorAnimation(slot, durationMs) {
  // Slot error animation removed
}


function handleDragStart(e) {
  // Dragging removed
}


function handleDragEnd(e) {
  e.target.classList.remove("dragging");
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.classList.remove("highlight");
    const wrapper = slot.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  });
}


function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = "move";
  }
}

function handleDragEnter(e) {
  const target = e.target;
  if (target.classList.contains("slot")) {
    target.classList.add("highlight");
    const wrapper = target.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.add("highlight");
    }
  }
}

function handleDragLeave(e) {
  const target = e.target;
  if (target.classList.contains("slot")) {
    target.classList.remove("highlight");
    const wrapper = target.closest(".slot-wrapper");
    if (wrapper) {
      wrapper.classList.remove("highlight");
    }
  }
}


function handleDrop(e) {
  e.preventDefault();
    const slot = e.target.closest(".slot");
  if (!slot) return;

  slot.classList.remove("highlight");
  const wrapper = slot.closest(".slot-wrapper");
  if (wrapper) {
    wrapper.classList.remove("highlight");
  }


  const slotIndex = parseInt(slot.dataset.index, 10);
  const expectedSlotIndex =
    gameState.mode === "ascending"
      ? gameState.nextIndex
      : 4 - gameState.nextIndex;

    if (slotIndex !== expectedSlotIndex) {
            setSpeech("請依序填答案。目標空格不在這裏喔！ 💪");
      playSlotErrorAnimation(slot, 500);

    
    if (gameState.draggedElement) {
      playCloudErrorOnSlot(gameState.draggedElement, slot);
    }
    return;
  }



  if (slot.textContent.trim() !== "") {
    setSpeech("這個空格已經有數字啦！");
    return;
  }

    if (gameState.draggedValue !== null) {
    setSlotValue(slot, gameState.draggedValue, gameState.draggedElement);

    gameState.draggedValue = null;
    gameState.draggedElement = null;
  }
}

function setSlotValue(slot, value, sourceTile) {
  // Slot value logic removed
}


function checkDigitRealTime(slot, value) {
  // Placement checking removed
}



function completeGame() {
  // Game completion logic removed
}




// 觸摸處理
let touchClone = null;

function handleTouchStart(e) {
  // Touch dragging removed
}


function handleTouchMove(e) {
  // Touch dragging removed
}



function handleTouchEnd(e) {
  // Touch dragging removed
}


function updateTouchClonePosition(touch) {
  if (touchClone) {
    touchClone.style.left = `${touch.clientX - 40}px`;
    touchClone.style.top = `${touch.clientY - 40}px`;
  }
}

function showVictoryModal() {
  if (victoryModal) {
    victoryModal.classList.remove("hidden");
  }
}

function returnToMenu() {
  const targetUrl = new URL("menu.html", window.location.href);

  setTimeout(() => {
    window.location.href = targetUrl.toString(); // 永遠做完整重載
  }, 1200);
}

function closeVictoryModal() {
  const targetUrl = new URL("menu.html", window.location.href);

  setTimeout(() => {
    window.location.href = targetUrl.toString(); // 永遠做完整重載
  }, 1200);
}

function updateBottomModeArrowDirection() {
  const rightArrow = document.getElementById("bottomArrowRight");
  const leftArrow = document.getElementById("bottomArrowLeft");
  if (!rightArrow || !leftArrow) return;

  const mode = (gameState && gameState.mode) || "ascending";
  if (mode === "descending") {
    rightArrow.classList.add("hidden");
    leftArrow.classList.remove("hidden");
  } else {
    leftArrow.classList.add("hidden");
    rightArrow.classList.remove("hidden");
  }
}

function updateBottomModeArrowLayout() {
  // Removed old bottom arrow layout tied to slots
}

