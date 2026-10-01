const MODULE_ID = "end-credits";
const SOCKET_NAME = `module.${MODULE_ID}`;

const DEFAULT_CONFIG = Object.freeze({
  durationSeconds: 120,
  backgroundColor: "#000000",
  backgroundImage: "",
  backgroundOpacity: 0.35,
  textColor: "#f3efe5",
  accentColor: "#d1b06b",
  fontScale: 1,
  showProgress: true,
  allowPlayerSkip: false,
  credits: [
    {
      id: "default-title",
      eyebrow: "",
      main: "THE END",
      detail: ""
    },
    {
      id: "default-gm",
      eyebrow: "GAME MASTER",
      main: "Your Name",
      detail: ""
    },
    {
      id: "default-players",
      eyebrow: "PLAYER",
      main: "Character Name",
      detail: "Played by Player Name"
    },
    {
      id: "default-thanks",
      eyebrow: "",
      main: "THANK YOU FOR PLAYING",
      detail: "Until the next adventure."
    }
  ]
});

let activePlayback = null;
let lastPlaybackId = null;
let creditsManager = null;
let creditsManagerResizeObserver = null;

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function randomId(prefix = "id") {
  const coreId = globalThis.foundry?.utils?.randomID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${coreId}`;
}

function serverTime() {
  return Number(game?.time?.serverTime ?? Date.now());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeHex(value, fallback) {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : fallback;
}

function normalizeCredit(raw = {}) {
  return {
    id: String(raw.id || randomId("credit")),
    eyebrow: String(raw.eyebrow ?? "").slice(0, 160),
    main: String(raw.main ?? "").slice(0, 300),
    detail: String(raw.detail ?? "").slice(0, 500)
  };
}

function normalizeConfig(raw = {}) {
  const defaults = cloneDefaultConfig();
  const credits = Array.isArray(raw.credits) ? raw.credits.map(normalizeCredit) : defaults.credits;

  return {
    durationSeconds: clamp(Number(raw.durationSeconds) || defaults.durationSeconds, 5, 14400),
    backgroundColor: sanitizeHex(raw.backgroundColor, defaults.backgroundColor),
    backgroundImage: String(raw.backgroundImage ?? defaults.backgroundImage).slice(0, 2048),
    backgroundOpacity: clamp(Number.isFinite(Number(raw.backgroundOpacity)) ? Number(raw.backgroundOpacity) : defaults.backgroundOpacity, 0, 1),
    textColor: sanitizeHex(raw.textColor, defaults.textColor),
    accentColor: sanitizeHex(raw.accentColor, defaults.accentColor),
    fontScale: clamp(Number(raw.fontScale) || defaults.fontScale, 0.65, 1.75),
    showProgress: raw.showProgress !== false,
    allowPlayerSkip: Boolean(raw.allowPlayerSkip),
    credits
  };
}

function currentConfig() {
  return normalizeConfig(game.settings.get(MODULE_ID, "creditsConfig") ?? cloneDefaultConfig());
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "creditsConfig", {
    name: "End Credits Configuration",
    scope: "world",
    config: false,
    type: Object,
    default: cloneDefaultConfig()
  });

  game.settings.register(MODULE_ID, "activePlayback", {
    name: "End Credits Active Playback",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, handleSocketMessage);

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      configure: () => openCreditsManager(),
      preview: () => playCredits(currentConfig(), serverTime(), randomId("preview"), { preview: true }),
      play: () => startCreditsForEveryone(),
      stop: () => stopCreditsForEveryone()
    };
  }

  const playback = game.settings.get(MODULE_ID, "activePlayback");
  if (playback?.id && playback?.startTime && playback?.config) {
    const config = normalizeConfig(playback.config);
    const endTime = Number(playback.startTime) + (config.durationSeconds * 1000);
    if (serverTime() < endTime) {
      playCredits(config, Number(playback.startTime), String(playback.id));
    }
  }
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;

  controls[MODULE_ID] = {
    name: MODULE_ID,
    title: "End Credits",
    icon: "fa-solid fa-film",
    order: 95,
    visible: true,
    activeTool: "configure",
    tools: {
      configure: {
        name: "configure",
        title: "Configure End Credits",
        icon: "fa-solid fa-sliders",
        order: 0,
        button: true,
        visible: true,
        onChange: () => {
          try { openCreditsManager(); } catch (error) { reportManagerError(error); }
        }
      },
      preview: {
        name: "preview",
        title: "Preview End Credits Locally",
        icon: "fa-solid fa-eye",
        order: 1,
        button: true,
        visible: true,
        onChange: () => playCredits(currentConfig(), serverTime(), randomId("preview"), { preview: true })
      },
      play: {
        name: "play",
        title: "Play End Credits for Everyone",
        icon: "fa-solid fa-play",
        order: 2,
        button: true,
        visible: true,
        onChange: () => startCreditsForEveryone()
      },
      stop: {
        name: "stop",
        title: "Stop End Credits for Everyone",
        icon: "fa-solid fa-stop",
        order: 3,
        button: true,
        visible: true,
        onChange: () => stopCreditsForEveryone()
      }
    }
  };
});

function reportManagerError(error) {
  console.error(`[${MODULE_ID}] Failed to open or use the End Credits manager.`, error);
  const message = error?.message ? `: ${error.message}` : "";
  ui.notifications?.error(`End Credits configuration could not open${message}`);
}

function openCreditsManager() {
  if (!game.user?.isGM) return;

  try {
    if (creditsManager?.rendered) {
      creditsManager.bringToFront();
      return creditsManager;
    }

    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (!DialogV2) {
      throw new Error("Foundry DialogV2 API is unavailable. Foundry VTT 13 or newer is required.");
    }

    const config = currentConfig();
    const content = buildManagerContent(config);

    const saveFromDialog = async (dialog, { play = false } = {}) => {
      const root = dialog.element?.querySelector?.(".end-credits-manager");
      if (!root) throw new Error("The End Credits editor content could not be found.");
      const normalized = normalizeConfig(collectManagerConfig(root));
      await game.settings.set(MODULE_ID, "creditsConfig", normalized);
      ui.notifications.info("End Credits configuration saved.");
      if (play) await startCreditsForEveryone(normalized);
      return normalized;
    };

    const dialogWidth = Math.min(760, Math.max(420, Math.floor(window.innerWidth * 0.94)));
    const dialogHeight = Math.min(760, Math.max(420, Math.floor(window.innerHeight * 0.88)));

    creditsManager = new DialogV2({
      window: {
        title: "End Credits",
        icon: "fa-solid fa-film",
        resizable: true
      },
      position: {
        width: dialogWidth,
        height: dialogHeight
      },
      content,
      buttons: [
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-xmark"
        },
        {
          action: "save",
          label: "Save",
          icon: "fa-solid fa-floppy-disk",
          callback: async (_event, _button, dialog) => {
            await saveFromDialog(dialog);
            return "save";
          }
        },
        {
          action: "save-play",
          label: "Save & Play",
          icon: "fa-solid fa-play",
          default: true,
          callback: async (_event, _button, dialog) => {
            await saveFromDialog(dialog, { play: true });
            return "save-play";
          }
        }
      ],
      modal: false
    });

    creditsManager.addEventListener("render", () => {
      try { initializeManagerDialog(creditsManager, config); }
      catch (error) { reportManagerError(error); }
    });

    creditsManager.addEventListener("close", () => {
      creditsManagerResizeObserver?.disconnect();
      creditsManagerResizeObserver = null;
      creditsManager = null;
    });

    creditsManager.render({ force: true }).catch(error => {
      creditsManager = null;
      reportManagerError(error);
    });
    return creditsManager;
  } catch (error) {
    creditsManager = null;
    reportManagerError(error);
  }
}

function buildManagerContent(config) {
  // DialogV2 requires an HTMLDivElement passed as content to be a completely
  // plain outer DIV with no classes, ids, data attributes, or other attributes.
  // The actual editor lives one level inside that required wrapper.
  const content = document.createElement("div");

  content.innerHTML = `
    <div class="end-credits-manager">
      <section class="ec-settings-grid">
        <label>
          <span>Total runtime (seconds)</span>
          <input class="ec-duration" type="number" min="5" max="14400" step="1" value="${Number(config.durationSeconds)}">
        </label>
        <label>
          <span>Text scale</span>
          <input class="ec-font-scale" type="number" min="0.65" max="1.75" step="0.05" value="${Number(config.fontScale)}">
        </label>
        <label>
          <span>Base background</span>
          <input class="ec-background" type="color" value="${config.backgroundColor}">
        </label>
        <label>
          <span>Background image opacity <strong class="ec-background-opacity-value">${Math.round(config.backgroundOpacity * 100)}%</strong></span>
          <input class="ec-background-opacity" type="range" min="0" max="100" step="1" value="${Math.round(config.backgroundOpacity * 100)}">
        </label>
        <label class="ec-background-image-field">
          <span>Background image</span>
          <div class="ec-file-row">
            <input class="ec-background-image" type="text" value="">
            <button type="button" class="ec-browse-background" title="Browse Foundry files"><i class="fa-solid fa-folder-open"></i> Browse</button>
            <button type="button" class="ec-clear-background" title="Clear background image"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="ec-background-preview" aria-label="Background image preview"></div>
        </label>
        <label>
          <span>Text</span>
          <input class="ec-text-color" type="color" value="${config.textColor}">
        </label>
        <label>
          <span>Accent</span>
          <input class="ec-accent-color" type="color" value="${config.accentColor}">
        </label>
        <label class="ec-checkbox-label">
          <input class="ec-show-progress" type="checkbox" ${config.showProgress ? "checked" : ""}>
          <span>Show progress bar</span>
        </label>
        <label class="ec-checkbox-label">
          <input class="ec-allow-skip" type="checkbox" ${config.allowPlayerSkip ? "checked" : ""}>
          <span>Let players dismiss credits locally</span>
        </label>
      </section>

      <div class="ec-timing-summary" role="status"></div>

      <div class="ec-editor-toolbar">
        <div>
          <h2>Credit Cards</h2>
          <p>Each card receives an equal share of the total runtime.</p>
        </div>
        <div class="ec-toolbar-actions">
          <button type="button" class="ec-preview-button"><i class="fa-solid fa-eye"></i> Preview</button>
          <button type="button" class="ec-add-player"><i class="fa-solid fa-user-plus"></i> Add Player</button>
          <button type="button" class="ec-add-credit"><i class="fa-solid fa-plus"></i> Add Credit</button>
        </div>
      </div>

      <div class="ec-credit-list"></div>

      <div class="ec-list-actions">
        <button type="button" class="ec-add-player-bottom"><i class="fa-solid fa-user-plus"></i> Add Another Player</button>
        <button type="button" class="ec-add-credit-bottom"><i class="fa-solid fa-plus"></i> Add Another Credit Card</button>
      </div>
    </div>
  `;

  return content;
}

function initializeManagerDialog(dialog, config) {
  const root = dialog.element?.querySelector?.(".end-credits-manager");
  if (!root) throw new Error("The End Credits editor could not initialize.");

  const fitScrollArea = () => {
    const app = dialog.element;
    if (!app?.isConnected) return;

    const headerHeight = app.querySelector(".window-header")?.getBoundingClientRect?.().height ?? 36;
    const footerHeight = app.querySelector("footer")?.getBoundingClientRect?.().height ?? 56;
    const appHeight = app.getBoundingClientRect?.().height ?? window.innerHeight;
    const availableHeight = Math.max(240, Math.floor(appHeight - headerHeight - footerHeight - 36));

    root.style.maxHeight = `${availableHeight}px`;
    root.style.overflowY = "auto";
    root.style.overflowX = "hidden";
  };

  fitScrollArea();
  if (!creditsManagerResizeObserver && globalThis.ResizeObserver) {
    creditsManagerResizeObserver = new ResizeObserver(() => fitScrollArea());
    creditsManagerResizeObserver.observe(dialog.element);
  }

  if (root.dataset.endCreditsInitialized === "true") return;
  root.dataset.endCreditsInitialized = "true";
  root.scrollTop = 0;

  const list = root.querySelector(".ec-credit-list");
  if (!list) throw new Error("The End Credits credit list could not initialize.");

  const backgroundImageInput = root.querySelector(".ec-background-image");
  if (backgroundImageInput) backgroundImageInput.value = config.backgroundImage ?? "";
  refreshBackgroundPreview(root);

  for (const credit of config.credits) list.append(buildCreditRow(credit));

  const addCredit = (credit = { id: randomId("credit"), eyebrow: "", main: "New Credit", detail: "" }) => {
    list.append(buildCreditRow(credit));
    refreshTimingSummary(root);
    const row = list.lastElementChild;
    row?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    row?.querySelector('[data-field="main"]')?.focus();
  };

  const addPlayer = () => addCredit({
    id: randomId("player"),
    eyebrow: "PLAYER",
    main: "Character Name",
    detail: "Played by Player Name"
  });

  root.querySelector(".ec-add-credit")?.addEventListener("click", () => addCredit());
  root.querySelector(".ec-add-credit-bottom")?.addEventListener("click", () => addCredit());
  root.querySelector(".ec-add-player")?.addEventListener("click", addPlayer);
  root.querySelector(".ec-add-player-bottom")?.addEventListener("click", addPlayer);

  root.querySelector(".ec-browse-background")?.addEventListener("click", () => openBackgroundImagePicker(root));
  root.querySelector(".ec-clear-background")?.addEventListener("click", () => {
    if (backgroundImageInput) backgroundImageInput.value = "";
    refreshBackgroundPreview(root);
  });
  backgroundImageInput?.addEventListener("input", () => refreshBackgroundPreview(root));

  const opacityInput = root.querySelector(".ec-background-opacity");
  opacityInput?.addEventListener("input", () => {
    const label = root.querySelector(".ec-background-opacity-value");
    if (label) label.textContent = `${Math.round(Number(opacityInput.value) || 0)}%`;
    refreshBackgroundPreview(root);
  });

  root.querySelector(".ec-preview-button")?.addEventListener("click", () => {
    const previewConfig = collectManagerConfig(root);
    playCredits(previewConfig, serverTime(), randomId("preview"), { preview: true });
  });

  root.querySelector(".ec-duration")?.addEventListener("input", () => refreshTimingSummary(root));
  list.addEventListener("input", () => refreshTimingSummary(root));

  refreshTimingSummary(root);
  requestAnimationFrame(() => { root.scrollTop = 0; });
}

function refreshBackgroundPreview(root) {
  if (!root) return;
  const preview = root.querySelector(".ec-background-preview");
  const input = root.querySelector(".ec-background-image");
  const opacityInput = root.querySelector(".ec-background-opacity");
  if (!preview || !input) return;

  const path = String(input.value ?? "").trim();
  const opacity = clamp((Number(opacityInput?.value) || 0) / 100, 0, 1);
  preview.style.setProperty("--ec-preview-opacity", String(opacity));
  preview.style.setProperty("--ec-preview-image", path ? `url(${JSON.stringify(path)})` : "none");
  preview.classList.toggle("is-empty", !path);
}

function openBackgroundImagePicker(root) {
  const input = root?.querySelector?.(".ec-background-image");
  if (!input) return;

  const FilePicker = globalThis.foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
  if (!FilePicker) {
    ui.notifications?.error("Foundry's File Picker is unavailable.");
    return;
  }

  try {
    const picker = new FilePicker({
      type: "image",
      current: String(input.value ?? ""),
      field: input,
      callback: path => {
        input.value = path ?? "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        refreshBackgroundPreview(root);
      }
    });
    const rendered = picker.render({ force: true });
    if (rendered?.catch) rendered.catch(error => reportManagerError(error));
  } catch (error) {
    reportManagerError(error);
  }
}

function buildCreditRow(credit) {
  const row = document.createElement("article");
  row.className = "ec-credit-row";
  row.dataset.creditId = credit.id || randomId("credit");

  const controls = document.createElement("div");
  controls.className = "ec-credit-row-controls";
  controls.innerHTML = `
    <button type="button" class="ec-move-up" title="Move up" aria-label="Move credit up"><i class="fa-solid fa-chevron-up"></i></button>
    <button type="button" class="ec-move-down" title="Move down" aria-label="Move credit down"><i class="fa-solid fa-chevron-down"></i></button>
    <button type="button" class="ec-remove" title="Remove" aria-label="Remove credit"><i class="fa-solid fa-trash"></i></button>
  `;

  const fields = document.createElement("div");
  fields.className = "ec-credit-fields";

  const makeField = (label, field, value, maxLength) => {
    const wrapper = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = label;
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.field = field;
    input.maxLength = maxLength;
    input.value = value ?? "";
    wrapper.append(title, input);
    return wrapper;
  };

  fields.append(
    makeField("Role / heading", "eyebrow", credit.eyebrow, 160),
    makeField("Main line", "main", credit.main, 300),
    makeField("Detail / subtitle", "detail", credit.detail, 500)
  );

  row.append(controls, fields);

  controls.querySelector(".ec-move-up").addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (prev) row.parentElement.insertBefore(row, prev);
    refreshTimingSummary(row.closest(".end-credits-manager"));
  });

  controls.querySelector(".ec-move-down").addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) row.parentElement.insertBefore(next, row);
    refreshTimingSummary(row.closest(".end-credits-manager"));
  });

  controls.querySelector(".ec-remove").addEventListener("click", () => {
    const manager = row.closest(".end-credits-manager");
    row.remove();
    refreshTimingSummary(manager);
  });

  return row;
}

function collectManagerConfig(root) {
  const credits = [...root.querySelectorAll(".ec-credit-row")].map(row => ({
    id: row.dataset.creditId || randomId("credit"),
    eyebrow: row.querySelector('[data-field="eyebrow"]')?.value ?? "",
    main: row.querySelector('[data-field="main"]')?.value ?? "",
    detail: row.querySelector('[data-field="detail"]')?.value ?? ""
  }));

  return normalizeConfig({
    durationSeconds: Number(root.querySelector(".ec-duration")?.value),
    backgroundColor: root.querySelector(".ec-background")?.value,
    backgroundImage: root.querySelector(".ec-background-image")?.value ?? "",
    backgroundOpacity: clamp((Number(root.querySelector(".ec-background-opacity")?.value) || 0) / 100, 0, 1),
    textColor: root.querySelector(".ec-text-color")?.value,
    accentColor: root.querySelector(".ec-accent-color")?.value,
    fontScale: Number(root.querySelector(".ec-font-scale")?.value),
    showProgress: root.querySelector(".ec-show-progress")?.checked,
    allowPlayerSkip: root.querySelector(".ec-allow-skip")?.checked,
    credits
  });
}

function refreshTimingSummary(root) {
  if (!root) return;
  const duration = clamp(Number(root.querySelector(".ec-duration")?.value) || 0, 0, 14400);
  const count = root.querySelectorAll(".ec-credit-row").length;
  const summary = root.querySelector(".ec-timing-summary");
  if (!summary) return;

  if (!count) {
    summary.textContent = "Add at least one credit card before playback.";
    return;
  }

  const each = duration / count;
  summary.textContent = `${count} credit card${count === 1 ? "" : "s"} • ${duration.toFixed(0)} seconds total • ${each.toFixed(2)} seconds per card`;
}

async function startCreditsForEveryone(configOverride = null) {
  if (!game.user?.isGM) return;

  const config = normalizeConfig(configOverride ?? currentConfig());
  if (!config.credits.length) {
    ui.notifications.warn("End Credits needs at least one credit card.");
    return;
  }

  const id = randomId("playback");
  const startTime = serverTime() + 350;
  const payload = {
    id,
    startTime,
    config,
    startedBy: game.user.id
  };

  await game.settings.set(MODULE_ID, "activePlayback", payload);
  game.socket.emit(SOCKET_NAME, { type: "play", ...payload });
  playCredits(config, startTime, id);
}

async function stopCreditsForEveryone() {
  if (!game.user?.isGM) return;

  await game.settings.set(MODULE_ID, "activePlayback", {});
  game.socket.emit(SOCKET_NAME, {
    type: "stop",
    stoppedBy: game.user.id
  });
  stopLocalCredits();
}

function handleSocketMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "play") {
    const sender = game.users.get(message.startedBy);
    if (!sender?.isGM) return;
    playCredits(normalizeConfig(message.config), Number(message.startTime), String(message.id));
    return;
  }

  if (message.type === "stop") {
    const sender = game.users.get(message.stoppedBy);
    if (!sender?.isGM) return;
    stopLocalCredits();
  }
}

function playCredits(rawConfig, startTime, playbackId, { preview = false } = {}) {
  const config = normalizeConfig(rawConfig);
  if (!config.credits.length) {
    if (game.user?.isGM) ui.notifications.warn("End Credits needs at least one credit card.");
    return;
  }

  if (!preview && lastPlaybackId === playbackId) return;
  if (!preview) lastPlaybackId = playbackId;

  stopLocalCredits();

  const overlay = document.createElement("div");
  overlay.id = "end-credits-overlay";
  overlay.className = "end-credits-overlay";
  overlay.style.setProperty("--ec-bg", config.backgroundColor);
  overlay.style.setProperty("--ec-text", config.textColor);
  overlay.style.setProperty("--ec-accent", config.accentColor);
  overlay.style.setProperty("--ec-scale", String(config.fontScale));

  if (config.backgroundImage) {
    const backgroundImage = document.createElement("div");
    backgroundImage.className = "ec-background-image-layer";
    backgroundImage.style.backgroundImage = `url(${JSON.stringify(config.backgroundImage)})`;
    backgroundImage.style.opacity = String(config.backgroundOpacity);
    overlay.append(backgroundImage);
  }

  const stage = document.createElement("div");
  stage.className = "ec-stage";

  const eyebrow = document.createElement("div");
  eyebrow.className = "ec-display-eyebrow";

  const main = document.createElement("div");
  main.className = "ec-display-main";

  const detail = document.createElement("div");
  detail.className = "ec-display-detail";

  stage.append(eyebrow, main, detail);
  overlay.append(stage);

  let progressFill = null;
  if (config.showProgress) {
    const progress = document.createElement("div");
    progress.className = "ec-progress";
    progressFill = document.createElement("div");
    progressFill.className = "ec-progress-fill";
    progress.append(progressFill);
    overlay.append(progress);
  }

  const controls = document.createElement("div");
  controls.className = "ec-playback-controls";

  if (preview) {
    const close = document.createElement("button");
    close.type = "button";
    close.innerHTML = '<i class="fa-solid fa-xmark"></i> Close Preview';
    close.addEventListener("click", () => stopLocalCredits());
    controls.append(close);
  } else if (game.user?.isGM) {
    const stop = document.createElement("button");
    stop.type = "button";
    stop.innerHTML = '<i class="fa-solid fa-stop"></i> Stop for Everyone';
    stop.addEventListener("click", () => stopCreditsForEveryone());
    controls.append(stop);
  } else if (config.allowPlayerSkip) {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.innerHTML = '<i class="fa-solid fa-forward"></i> Dismiss Credits';
    skip.addEventListener("click", () => stopLocalCredits());
    controls.append(skip);
  }

  if (controls.childElementCount) overlay.append(controls);

  document.body.append(overlay);

  const slotDuration = config.durationSeconds / config.credits.length;
  let shownIndex = -1;
  let animationFrame = 0;

  const renderFrame = () => {
    if (!overlay.isConnected) return;

    const elapsed = Math.max(0, (serverTime() - startTime) / 1000);
    const overall = clamp(elapsed / config.durationSeconds, 0, 1);

    if (progressFill) progressFill.style.transform = `scaleX(${overall})`;

    if (elapsed >= config.durationSeconds) {
      overlay.classList.add("ec-finished");
      window.setTimeout(() => {
        if (overlay.isConnected) stopLocalCredits();
      }, 450);
      return;
    }

    if (elapsed < 0.001 && serverTime() < startTime) {
      stage.style.opacity = "0";
      animationFrame = requestAnimationFrame(renderFrame);
      return;
    }

    const index = clamp(Math.floor(elapsed / slotDuration), 0, config.credits.length - 1);
    const withinSlot = clamp((elapsed - (index * slotDuration)) / slotDuration, 0, 1);

    if (index !== shownIndex) {
      shownIndex = index;
      const credit = config.credits[index];
      eyebrow.textContent = credit.eyebrow;
      main.textContent = credit.main;
      detail.textContent = credit.detail;
      eyebrow.hidden = !credit.eyebrow;
      main.hidden = !credit.main;
      detail.hidden = !credit.detail;
    }

    const fadePortion = 0.16;
    let opacity = 1;
    if (withinSlot < fadePortion) opacity = withinSlot / fadePortion;
    else if (withinSlot > (1 - fadePortion)) opacity = (1 - withinSlot) / fadePortion;

    stage.style.opacity = String(clamp(opacity, 0, 1));
    stage.style.transform = `translateY(${(1 - opacity) * 10}px)`;

    animationFrame = requestAnimationFrame(renderFrame);
  };

  animationFrame = requestAnimationFrame(renderFrame);
  activePlayback = { overlay, animationFrame, playbackId, preview };
}

function stopLocalCredits() {
  if (!activePlayback) {
    document.getElementById("end-credits-overlay")?.remove();
    return;
  }

  if (activePlayback.animationFrame) cancelAnimationFrame(activePlayback.animationFrame);
  activePlayback.overlay?.remove();
  activePlayback = null;
}
