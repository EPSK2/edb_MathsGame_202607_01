// Cookie and run-state management for the 3-level claw gift game
// This module tracks per-range/per-tolerance attempts and timing, and
// exposes a small API via window.gameCookie.

(function () {
  const LEVELS_PER_RUN = 3;
  const ATTEMPT_COOKIE_NAME = "pb_estimate_attempt";

  // Internal run state for the current range/tolerance combination.
  // totalDropAttempts is the key metric we care about.
  let runState = {
    modeKey: null, // e.g. "1to20_tol1"
    attemptId: null,
    currentLevelIndex: 1,
    levelsCompleted: 0,
    totalElapsedMs: 0,
    currentLevelStartTs: null,
    totalDropAttempts: 0,
    status: "idle", // "running" | "paused" | "complete"
  };

  function buildModeKey(rangeMax, clampTolerance) {
    const max = typeof rangeMax === "number" && rangeMax > 0 ? rangeMax : 10;
    const tol = typeof clampTolerance === "number" && clampTolerance > 0 ? clampTolerance : 1;
    // Example: 1to20_tol1
    return `1to${max}_tol${tol}`;
  }

  function generateAttemptId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function getAttemptCookie() {
    try {
      const name = ATTEMPT_COOKIE_NAME + "=";
      const cookies = document.cookie ? document.cookie.split(";") : [];
      for (let i = 0; i < cookies.length; i++) {
        const raw = cookies[i].trim();
        if (!raw.startsWith(name)) continue;
        const value = raw.substring(name.length);
        if (!value) return null;
        const decoded = decodeURIComponent(value);
        const parsed = JSON.parse(decoded);
        return parsed && typeof parsed === "object" ? parsed : null;
      }
    } catch (e) {
      // Ignore cookie parsing issues
    }
    return null;
  }

  function persistAttemptState(statusOverride) {
    try {
      if (!runState.attemptId || !runState.modeKey) return;
      const payload = {
        attemptId: runState.attemptId,
        modeKey: runState.modeKey,
        currentLevelIndex: runState.currentLevelIndex,
        levelsCompleted: runState.levelsCompleted,
        totalElapsedMs: Math.round(runState.totalElapsedMs || 0),
        totalDropAttempts: Math.round(runState.totalDropAttempts || 0),
        status: statusOverride || runState.status || "idle",
      };
      const encoded = encodeURIComponent(JSON.stringify(payload));
      // 1-day lifetime per attempt record
      document.cookie =
        ATTEMPT_COOKIE_NAME +
        "=" +
        encoded +
        "; path=/; max-age=" +
        60 * 60 * 24;
    } catch (e) {
      // Ignore cookie write failures
    }
  }

  function clearAttemptCookie() {
    try {
      document.cookie =
        ATTEMPT_COOKIE_NAME + "=; path=/; max-age=0";
    } catch (e) {
      // Ignore cookie clearing errors
    }
  }

  function initRunState(rangeMax, clampTolerance) {
    const modeKey = buildModeKey(rangeMax, clampTolerance);
    runState.modeKey = modeKey;

    const cookieData = getAttemptCookie();
    const canResume =
      cookieData &&
      cookieData.modeKey === modeKey &&
      cookieData.status === "active" &&
      typeof cookieData.currentLevelIndex === "number" &&
      cookieData.currentLevelIndex >= 1 &&
      cookieData.currentLevelIndex <= LEVELS_PER_RUN;

    if (canResume) {
      runState.attemptId = cookieData.attemptId || generateAttemptId();
      runState.currentLevelIndex = cookieData.currentLevelIndex || 1;
      runState.levelsCompleted = cookieData.levelsCompleted || 0;
      runState.totalElapsedMs = cookieData.totalElapsedMs || 0;
      runState.totalDropAttempts = cookieData.totalDropAttempts || 0;
      runState.status = "running";
    } else {
      runState.attemptId = generateAttemptId();
      runState.currentLevelIndex = 1;
      runState.levelsCompleted = 0;
      runState.totalElapsedMs = 0;
      runState.totalDropAttempts = 0;
      runState.status = "running";
      // We do not clear old cookies here; we simply do not resume
      // incompatible records.
    }

    startLevelTimer();
  }

  function startLevelTimer() {
    runState.currentLevelStartTs = performance.now();
    runState.status = "running";
    // Persist as an active attempt so that reloads can resume.
    persistAttemptState("active");
  }

  function recordDropAttempt() {
    // Called once per full claw drop cycle (down/hold/up), regardless
    // of success or failure.
    runState.totalDropAttempts = (runState.totalDropAttempts || 0) + 1;
    persistAttemptState("active");
  }

  function handleLevelCompleted() {
    if (!runState || runState.status !== "running") return;

    const now = performance.now();
    if (runState.currentLevelStartTs != null) {
      const deltaMs = Math.max(0, now - runState.currentLevelStartTs);
      runState.totalElapsedMs += deltaMs;
    }
    runState.levelsCompleted = runState.currentLevelIndex;
    runState.currentLevelStartTs = null;

    if (runState.currentLevelIndex >= LEVELS_PER_RUN) {
      runState.status = "complete";
      persistAttemptState("complete");
      tryUpdateBestRecordForCurrentMode();
    } else {
      // Between levels we pause until the next level starts.
      runState.status = "paused";
      runState.currentLevelIndex = runState.levelsCompleted + 1;
      persistAttemptState("active");
    }
  }

  function getTotalSecondsForRun() {
    return Math.round((runState.totalElapsedMs || 0) / 1000);
  }

  function getTotalDropAttemptsForRun() {
    return runState.totalDropAttempts || 0;
  }

  function tryUpdateBestRecordForCurrentMode() {
    const modeKey = runState.modeKey;
    if (!modeKey) return;
    const totalAttempts = getTotalDropAttemptsForRun();
    const storageKey = "pb_best_attempts_" + modeKey;
    try {
      const raw = window.localStorage
        ? window.localStorage.getItem(storageKey)
        : null;
      const prev = raw != null ? parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(prev) || totalAttempts < prev) {
        if (window.localStorage) {
          window.localStorage.setItem(storageKey, String(totalAttempts));
        }
      }
    } catch (e) {
      // Ignore localStorage issues
    }
  }

  function resetRunStateForNewAttempt(rangeMax, clampTolerance) {
    runState.modeKey = buildModeKey(rangeMax, clampTolerance);
    runState.attemptId = generateAttemptId();
    runState.currentLevelIndex = 1;
    runState.levelsCompleted = 0;
    runState.totalElapsedMs = 0;
    runState.totalDropAttempts = 0;
    runState.currentLevelStartTs = null;
    runState.status = "idle";
    clearAttemptCookie();
  }

  // Public API
  window.gameCookie = {
    LEVELS_PER_RUN,
    ATTEMPT_COOKIE_NAME,
    initRunState,
    startLevelTimer,
    recordDropAttempt,
    handleLevelCompleted,
    getTotalSecondsForRun,
    getTotalDropAttemptsForRun,
    resetRunStateForNewAttempt,
    clearAttemptCookie,
    getRunState: function () {
      return Object.assign({}, runState);
    },
  };
})();
