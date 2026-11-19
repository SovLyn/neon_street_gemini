import './styles.css';
import { SCENE_PRESETS, type ScenePreset } from '../config/presets';
import { THEME_LIST, type ThemeDefinition } from '../config/themes';
import type {
  AtmosphereState,
  EasterEggState,
  ThemeId,
  UrlSceneState,
  WeatherKind,
} from '../types/sim';

export interface UIActions {
  onTimeChange: (hours: number) => void;
  onAutoCycleToggle: (enabled: boolean) => void;
  onWeatherChange: (weather: WeatherKind) => void;
  onFogToggle: (enabled: boolean) => void;
  onThemeChange: (theme: ThemeId) => void;
  onPresetApply: (preset: ScenePreset) => void;
  onNewStreet: () => void;
  onShareUrl: () => Promise<string> | string;
  onPostFxExtraToggle: (enabled: boolean) => void;
  onAutoOrbitToggle: (enabled: boolean) => void;
  onCustomSignTextChange: (text: string) => void;
  onPauseToggle: (paused: boolean) => void;
  onPhotoModeChange: (active: boolean) => void;
  onExportPng: () => void;
  onTriggerEasterEgg?: (kind: 'ufo' | 'cat' | 'neon_sync') => void;
}

function formatTime(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.floor((norm - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getTimeDescription(hours: number): string {
  const h = ((hours % 24) + 24) % 24;
  if (h >= 5 && h < 7) return '黎明';
  if (h >= 7 && h < 11) return '清晨';
  if (h >= 11 && h < 14) return '正午';
  if (h >= 14 && h < 17) return '午后';
  if (h >= 17 && h < 19) return '黄昏';
  if (h >= 19 && h < 23) return '夜间';
  return '子夜';
}

function getWeatherDescription(weather: WeatherKind): string {
  switch (weather) {
    case 'clear':
      return '晴朗';
    case 'rain':
      return '微雨';
    case 'heavy_rain':
      return '暴雨';
    case 'snow':
      return '飘雪';
  }
}

export class UIController {
  private readonly root: HTMLElement;
  private readonly actions: UIActions;
  private currentState: UrlSceneState;

  private photoMode = false;
  private paused = false;
  private isDockCollapsed = false;
  private lastEasterEggCount = 0;
  private toastTimeout: number | null = null;

  // DOM Elements
  private readonly container: HTMLDivElement;
  private readonly timeDisplay: HTMLSpanElement;
  private readonly seedDisplay: HTMLSpanElement;
  private readonly telemetryBadge: HTMLSpanElement;

  private readonly hudDock: HTMLElement;
  private readonly collapseBtn: HTMLButtonElement;

  private readonly presetButtons = new Map<string, HTMLButtonElement>();
  private readonly timeSlider: HTMLInputElement;
  private readonly timeSliderDisplay: HTMLSpanElement;
  private readonly autoCycleToggle: HTMLButtonElement;

  private readonly weatherButtons = new Map<WeatherKind, HTMLButtonElement>();
  private readonly fogToggle: HTMLButtonElement;

  private readonly themeButtons = new Map<ThemeId, HTMLButtonElement>();

  private readonly newStreetBtn: HTMLButtonElement;
  private readonly shareUrlBtn: HTMLButtonElement;
  private readonly customSignInput: HTMLInputElement;

  private readonly postFxToggle: HTMLButtonElement;
  private readonly autoOrbitToggle: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly photoModeBtn: HTMLButtonElement;

  private readonly photoOverlay: HTMLDivElement;
  private readonly photoPauseBtn: HTMLButtonElement;
  private readonly photoExportBtn: HTMLButtonElement;
  private readonly photoExitBtn: HTMLButtonElement;

  private readonly toastEl: HTMLDivElement;

  constructor(
    root: HTMLElement,
    initialState: UrlSceneState,
    actions: UIActions
  ) {
    this.root = root;
    this.actions = actions;
    this.currentState = { ...initialState };

    // Master container
    this.container = document.createElement('div');
    this.container.className = 'hud-container';

    // ------------------------------------------------------------------------
    // Top-Left Header Badge
    // ------------------------------------------------------------------------
    const header = document.createElement('div');
    header.className = 'hud-header';

    const headerTitleRow = document.createElement('div');
    headerTitleRow.className = 'hud-header-title-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'hud-title';
    titleEl.textContent = '霓虹街区 // NEON BLOCK';

    this.timeDisplay = document.createElement('span');
    this.timeDisplay.className = 'hud-time-display';
    this.timeDisplay.dataset.testid = 'time-display';
    this.timeDisplay.textContent = formatTime(initialState.timeHours);

    headerTitleRow.appendChild(titleEl);
    headerTitleRow.appendChild(this.timeDisplay);

    const headerStatusRow = document.createElement('div');
    headerStatusRow.className = 'hud-header-status-row';

    this.seedDisplay = document.createElement('span');
    this.seedDisplay.className = 'hud-seed-display';
    this.seedDisplay.dataset.testid = 'seed-display';
    this.seedDisplay.textContent = `#${initialState.seed}`;

    this.telemetryBadge = document.createElement('span');
    this.telemetryBadge.className = 'hud-telemetry-badge';
    this.telemetryBadge.textContent = '实时仿真环境就绪';

    headerStatusRow.appendChild(this.seedDisplay);
    headerStatusRow.appendChild(this.telemetryBadge);

    const hintEl = document.createElement('div');
    hintEl.className = 'hud-hint';
    hintEl.textContent = '点击招牌闪烁 · 点击路灯开关 · 点击水面涟漪';

    header.appendChild(headerTitleRow);
    header.appendChild(headerStatusRow);
    header.appendChild(hintEl);
    this.container.appendChild(header);

    // ------------------------------------------------------------------------
    // Right Floating Collapsible Control Dock
    // ------------------------------------------------------------------------
    this.hudDock = document.createElement('aside');
    this.hudDock.className = 'hud-dock';
    this.hudDock.dataset.testid = 'hud-panel';

    // Dock Header
    const dockHeader = document.createElement('div');
    dockHeader.className = 'hud-dock-header';

    const dockTitle = document.createElement('span');
    dockTitle.className = 'hud-dock-title';
    dockTitle.textContent = '控制终端 // CONTROL';

    this.collapseBtn = document.createElement('button');
    this.collapseBtn.className = 'hud-collapse-btn';
    this.collapseBtn.dataset.testid = 'hud-collapse-btn';
    this.collapseBtn.title = '收起/展开控制板';
    this.collapseBtn.textContent = '❯';

    dockHeader.appendChild(dockTitle);
    dockHeader.appendChild(this.collapseBtn);
    this.hudDock.appendChild(dockHeader);

    // Dock Scrollable Content
    const dockContent = document.createElement('div');
    dockContent.className = 'hud-dock-content';

    // Section 1: Presets
    const presetSection = document.createElement('section');
    presetSection.className = 'hud-section';

    const presetHeader = document.createElement('div');
    presetHeader.className = 'hud-section-header';
    presetHeader.textContent = '场景预设 // PRESETS';
    presetSection.appendChild(presetHeader);

    const presetGrid = document.createElement('div');
    presetGrid.className = 'hud-preset-grid';

    for (const preset of SCENE_PRESETS) {
      const btn = document.createElement('button');
      btn.className = 'hud-preset-card';
      btn.dataset.testid = `preset-btn-${preset.id}`;

      const title = document.createElement('span');
      title.className = 'hud-preset-title';
      title.textContent = preset.name;

      const desc = document.createElement('span');
      desc.className = 'hud-preset-desc';
      desc.textContent = preset.description;

      btn.appendChild(title);
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        this.actions.onPresetApply(preset);
        this.showToast(`应用预设: ${preset.name}`);
      });

      this.presetButtons.set(preset.id, btn);
      presetGrid.appendChild(btn);
    }
    presetSection.appendChild(presetGrid);
    dockContent.appendChild(presetSection);

    // Section 2: Time of Day
    const timeSection = document.createElement('section');
    timeSection.className = 'hud-section';

    const timeHeader = document.createElement('div');
    timeHeader.className = 'hud-section-header';
    const timeHeaderTitle = document.createElement('span');
    timeHeaderTitle.textContent = '昼夜时间 // TIME';
    this.timeSliderDisplay = document.createElement('span');
    this.timeSliderDisplay.className = 'hud-readout';
    this.timeSliderDisplay.textContent = formatTime(initialState.timeHours);

    timeHeader.appendChild(timeHeaderTitle);
    timeHeader.appendChild(this.timeSliderDisplay);
    timeSection.appendChild(timeHeader);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'hud-slider-row';

    this.timeSlider = document.createElement('input');
    this.timeSlider.type = 'range';
    this.timeSlider.min = '0';
    this.timeSlider.max = '24';
    this.timeSlider.step = '0.05';
    this.timeSlider.value = initialState.timeHours.toFixed(2);
    this.timeSlider.className = 'hud-slider';
    this.timeSlider.dataset.testid = 'time-slider';

    this.timeSlider.addEventListener('input', () => {
      const hours = parseFloat(this.timeSlider.value);
      this.currentState.timeHours = hours;
      const formatted = formatTime(hours);
      this.timeSliderDisplay.textContent = formatted;
      this.timeDisplay.textContent = formatted;
      this.actions.onTimeChange(hours);
    });

    sliderRow.appendChild(this.timeSlider);
    timeSection.appendChild(sliderRow);

    this.autoCycleToggle = document.createElement('button');
    this.autoCycleToggle.className = 'hud-toggle-btn';
    this.autoCycleToggle.dataset.testid = 'auto-cycle-toggle';
    this.autoCycleToggle.setAttribute(
      'aria-pressed',
      initialState.autoCycle ? 'true' : 'false'
    );
    if (initialState.autoCycle) {
      this.autoCycleToggle.classList.add('active');
    }

    const autoCycleLabel = document.createElement('span');
    autoCycleLabel.className = 'hud-toggle-label';
    autoCycleLabel.textContent = initialState.autoCycle
      ? '昼夜流转 (运行中)'
      : '昼夜流转 (已停止)';

    const autoCycleInd = document.createElement('span');
    autoCycleInd.className = 'hud-toggle-indicator';

    this.autoCycleToggle.appendChild(autoCycleLabel);
    this.autoCycleToggle.appendChild(autoCycleInd);

    this.autoCycleToggle.addEventListener('click', () => {
      const next = !this.currentState.autoCycle;
      this.currentState.autoCycle = next;
      this.autoCycleToggle.classList.toggle('active', next);
      this.autoCycleToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      autoCycleLabel.textContent = next
        ? '昼夜流转 (运行中)'
        : '昼夜流转 (已停止)';
      this.actions.onAutoCycleToggle(next);
    });

    timeSection.appendChild(this.autoCycleToggle);
    dockContent.appendChild(timeSection);

    // Section 3: Weather & Mood
    const weatherSection = document.createElement('section');
    weatherSection.className = 'hud-section';

    const weatherHeader = document.createElement('div');
    weatherHeader.className = 'hud-section-header';
    weatherHeader.textContent = '天气与氛围 // WEATHER';
    weatherSection.appendChild(weatherHeader);

    const weatherGroup = document.createElement('div');
    weatherGroup.className = 'hud-segmented-group';

    const weatherKinds: Array<{ kind: WeatherKind; label: string }> = [
      { kind: 'clear', label: '晴' },
      { kind: 'rain', label: '微雨' },
      { kind: 'heavy_rain', label: '暴雨' },
      { kind: 'snow', label: '飘雪' },
    ];

    for (const { kind, label } of weatherKinds) {
      const btn = document.createElement('button');
      btn.className = 'hud-segment-btn';
      btn.dataset.testid = `weather-btn-${kind}`;
      btn.textContent = label;
      if (initialState.weather === kind) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        this.currentState.weather = kind;
        for (const [k, b] of this.weatherButtons) {
          b.classList.toggle('active', k === kind);
        }
        this.actions.onWeatherChange(kind);
      });

      this.weatherButtons.set(kind, btn);
      weatherGroup.appendChild(btn);
    }
    weatherSection.appendChild(weatherGroup);

    this.fogToggle = document.createElement('button');
    this.fogToggle.className = 'hud-toggle-btn';
    this.fogToggle.dataset.testid = 'fog-toggle';
    this.fogToggle.setAttribute(
      'aria-pressed',
      initialState.fogEnabled ? 'true' : 'false'
    );
    if (initialState.fogEnabled) {
      this.fogToggle.classList.add('active');
    }

    const fogLabel = document.createElement('span');
    fogLabel.className = 'hud-toggle-label';
    fogLabel.textContent = '街区迷雾';

    const fogInd = document.createElement('span');
    fogInd.className = 'hud-toggle-indicator';

    this.fogToggle.appendChild(fogLabel);
    this.fogToggle.appendChild(fogInd);

    this.fogToggle.addEventListener('click', () => {
      const next = !this.currentState.fogEnabled;
      this.currentState.fogEnabled = next;
      this.fogToggle.classList.toggle('active', next);
      this.fogToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      this.actions.onFogToggle(next);
    });

    weatherSection.appendChild(this.fogToggle);
    dockContent.appendChild(weatherSection);

    // Section 4: Color Themes
    const themeSection = document.createElement('section');
    themeSection.className = 'hud-section';

    const themeHeader = document.createElement('div');
    themeHeader.className = 'hud-section-header';
    themeHeader.textContent = '配色主题 // THEMES';
    themeSection.appendChild(themeHeader);

    const themeList = document.createElement('div');
    themeList.className = 'hud-theme-list';

    for (const theme of THEME_LIST) {
      const btn = document.createElement('button');
      btn.className = 'hud-theme-btn';
      btn.dataset.testid = `theme-btn-${theme.id}`;
      if (initialState.theme === theme.id) {
        btn.classList.add('active');
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'hud-theme-name';
      nameEl.textContent = theme.name;

      const swatchesEl = document.createElement('span');
      swatchesEl.className = 'hud-swatches';

      for (const color of theme.swatches) {
        const dot = document.createElement('span');
        dot.className = 'hud-swatch-dot';
        dot.style.backgroundColor = color;
        dot.style.color = color;
        swatchesEl.appendChild(dot);
      }

      btn.appendChild(nameEl);
      btn.appendChild(swatchesEl);

      btn.addEventListener('click', () => {
        this.currentState.theme = theme.id;
        for (const [tid, b] of this.themeButtons) {
          b.classList.toggle('active', tid === theme.id);
        }
        this.actions.onThemeChange(theme.id);
      });

      this.themeButtons.set(theme.id, btn);
      themeList.appendChild(btn);
    }
    themeSection.appendChild(themeList);
    dockContent.appendChild(themeSection);

    // Section 5: Street & Sign
    const streetSection = document.createElement('section');
    streetSection.className = 'hud-section';

    const streetHeader = document.createElement('div');
    streetHeader.className = 'hud-section-header';
    streetHeader.textContent = '街区与招牌 // STREET & SIGN';
    streetSection.appendChild(streetHeader);

    const btnRow = document.createElement('div');
    btnRow.className = 'hud-btn-row';

    this.newStreetBtn = document.createElement('button');
    this.newStreetBtn.className = 'hud-action-btn';
    this.newStreetBtn.dataset.testid = 'new-street-btn';
    this.newStreetBtn.textContent = '换一条街 🎲';

    this.newStreetBtn.addEventListener('click', () => {
      this.actions.onNewStreet();
      this.showToast('正在生成全新街区...');
    });

    this.shareUrlBtn = document.createElement('button');
    this.shareUrlBtn.className = 'hud-action-btn';
    this.shareUrlBtn.dataset.testid = 'share-url-btn';
    this.shareUrlBtn.textContent = '复制分享链接 🔗';

    this.shareUrlBtn.addEventListener('click', async () => {
      try {
        const result = this.actions.onShareUrl();
        const url = result instanceof Promise ? await result : result;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
          this.showToast('已复制场景分享链接 🔗');
        } else {
          this.showToast('场景链接已生成');
        }
      } catch {
        this.showToast('场景链接已生成');
      }
    });

    btnRow.appendChild(this.newStreetBtn);
    btnRow.appendChild(this.shareUrlBtn);
    streetSection.appendChild(btnRow);

    this.customSignInput = document.createElement('input');
    this.customSignInput.type = 'text';
    this.customSignInput.maxLength = 24;
    this.customSignInput.placeholder = '自定义主招牌文字...';
    this.customSignInput.className = 'hud-input';
    this.customSignInput.dataset.testid = 'custom-sign-input';
    this.customSignInput.value = initialState.customSignText;

    this.customSignInput.addEventListener('input', () => {
      const text = this.customSignInput.value.slice(0, 24);
      this.currentState.customSignText = text;
      this.actions.onCustomSignTextChange(text);
    });

    streetSection.appendChild(this.customSignInput);
    dockContent.appendChild(streetSection);

    // Section 6: Camera, Visuals & Photo Mode
    const visualSection = document.createElement('section');
    visualSection.className = 'hud-section';

    const visualHeader = document.createElement('div');
    visualHeader.className = 'hud-section-header';
    visualHeader.textContent = '画面与镜头 // CAMERA & FX';
    visualSection.appendChild(visualHeader);

    // Post-fx toggle
    this.postFxToggle = document.createElement('button');
    this.postFxToggle.className = 'hud-toggle-btn';
    this.postFxToggle.dataset.testid = 'postfx-toggle';
    this.postFxToggle.setAttribute(
      'aria-pressed',
      initialState.postFxExtra ? 'true' : 'false'
    );
    if (initialState.postFxExtra) {
      this.postFxToggle.classList.add('active');
    }

    const postFxLabel = document.createElement('span');
    postFxLabel.className = 'hud-toggle-label';
    postFxLabel.textContent = '色差与胶片噪点';

    const postFxInd = document.createElement('span');
    postFxInd.className = 'hud-toggle-indicator';

    this.postFxToggle.appendChild(postFxLabel);
    this.postFxToggle.appendChild(postFxInd);

    this.postFxToggle.addEventListener('click', () => {
      const next = !this.currentState.postFxExtra;
      this.currentState.postFxExtra = next;
      this.postFxToggle.classList.toggle('active', next);
      this.postFxToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      this.actions.onPostFxExtraToggle(next);
    });
    visualSection.appendChild(this.postFxToggle);

    // Auto orbit toggle
    this.autoOrbitToggle = document.createElement('button');
    this.autoOrbitToggle.className = 'hud-toggle-btn';
    this.autoOrbitToggle.dataset.testid = 'auto-orbit-toggle';
    this.autoOrbitToggle.setAttribute(
      'aria-pressed',
      initialState.autoOrbit ? 'true' : 'false'
    );
    if (initialState.autoOrbit) {
      this.autoOrbitToggle.classList.add('active');
    }

    const autoOrbitLabel = document.createElement('span');
    autoOrbitLabel.className = 'hud-toggle-label';
    autoOrbitLabel.textContent = '自动缓动运镜';

    const autoOrbitInd = document.createElement('span');
    autoOrbitInd.className = 'hud-toggle-indicator';

    this.autoOrbitToggle.appendChild(autoOrbitLabel);
    this.autoOrbitToggle.appendChild(autoOrbitInd);

    this.autoOrbitToggle.addEventListener('click', () => {
      const next = !this.currentState.autoOrbit;
      this.currentState.autoOrbit = next;
      this.autoOrbitToggle.classList.toggle('active', next);
      this.autoOrbitToggle.setAttribute('aria-pressed', next ? 'true' : 'false');
      this.actions.onAutoOrbitToggle(next);
    });
    visualSection.appendChild(this.autoOrbitToggle);

    // Simulation pause button
    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'hud-toggle-btn';
    this.pauseBtn.dataset.testid = 'pause-btn';
    this.pauseBtn.setAttribute('aria-pressed', 'false');

    const pauseLabel = document.createElement('span');
    pauseLabel.className = 'hud-toggle-label';
    pauseLabel.textContent = '暂停模拟';

    const pauseInd = document.createElement('span');
    pauseInd.className = 'hud-toggle-indicator';

    this.pauseBtn.appendChild(pauseLabel);
    this.pauseBtn.appendChild(pauseInd);

    this.pauseBtn.addEventListener('click', () => {
      const next = !this.paused;
      this.setPaused(next);
      this.actions.onPauseToggle(next);
    });
    visualSection.appendChild(this.pauseBtn);

    // Photo Mode prominent button
    this.photoModeBtn = document.createElement('button');
    this.photoModeBtn.className = 'hud-primary-btn';
    this.photoModeBtn.dataset.testid = 'photo-mode-btn';
    this.photoModeBtn.textContent = '📷 进入摄影模式';

    this.photoModeBtn.addEventListener('click', () => {
      this.setPhotoMode(true);
    });
    visualSection.appendChild(this.photoModeBtn);

    dockContent.appendChild(visualSection);

    // Section 7: Easter Egg Trigger Chips (if supported)
    if (this.actions.onTriggerEasterEgg) {
      const eggSection = document.createElement('section');
      eggSection.className = 'hud-section';

      const eggHeader = document.createElement('div');
      eggHeader.className = 'hud-section-header';
      eggHeader.textContent = '隐藏彩蛋 // EASTER EGGS';
      eggSection.appendChild(eggHeader);

      const eggRow = document.createElement('div');
      eggRow.className = 'hud-egg-row';

      const ufoBtn = document.createElement('button');
      ufoBtn.className = 'hud-egg-chip';
      ufoBtn.textContent = '🛸 飞碟掠过';
      ufoBtn.addEventListener('click', () => {
        this.actions.onTriggerEasterEgg?.('ufo');
        this.showToast('召唤奇异光盘 🛸');
      });

      const catBtn = document.createElement('button');
      catBtn.className = 'hud-egg-chip';
      catBtn.textContent = '🐈 街角黑猫';
      catBtn.addEventListener('click', () => {
        this.actions.onTriggerEasterEgg?.('cat');
        this.showToast('黑猫窜过街角 🐈');
      });

      const syncBtn = document.createElement('button');
      syncBtn.className = 'hud-egg-chip';
      syncBtn.textContent = '⚡ 霓虹脉冲';
      syncBtn.addEventListener('click', () => {
        this.actions.onTriggerEasterEgg?.('neon_sync');
        this.showToast('霓虹电压脉冲 ⚡');
      });

      eggRow.appendChild(ufoBtn);
      eggRow.appendChild(catBtn);
      eggRow.appendChild(syncBtn);
      eggSection.appendChild(eggRow);
      dockContent.appendChild(eggSection);
    }

    this.hudDock.appendChild(dockContent);
    this.container.appendChild(this.hudDock);

    // Dock collapse toggle handler
    this.collapseBtn.addEventListener('click', () => {
      this.isDockCollapsed = !this.isDockCollapsed;
      this.hudDock.classList.toggle('collapsed', this.isDockCollapsed);
      this.collapseBtn.textContent = this.isDockCollapsed ? '❮' : '❯';
      this.collapseBtn.title = this.isDockCollapsed ? '展开控制板' : '收起控制板';
    });

    // ------------------------------------------------------------------------
    // Photo Mode Overlay (Floating Minimal Bottom Bar)
    // ------------------------------------------------------------------------
    this.photoOverlay = document.createElement('div');
    this.photoOverlay.className = 'hud-photo-overlay';
    this.photoOverlay.dataset.testid = 'photo-overlay';

    const photoBar = document.createElement('div');
    photoBar.className = 'hud-photo-bar';

    this.photoPauseBtn = document.createElement('button');
    this.photoPauseBtn.className = 'hud-photo-btn-item';
    this.photoPauseBtn.dataset.testid = 'photo-pause-btn';
    this.photoPauseBtn.textContent = '⏸ 暂停';
    this.photoPauseBtn.addEventListener('click', () => {
      const next = !this.paused;
      this.setPaused(next);
      this.actions.onPauseToggle(next);
    });

    this.photoExportBtn = document.createElement('button');
    this.photoExportBtn.className = 'hud-photo-btn-item hud-photo-export';
    this.photoExportBtn.dataset.testid = 'photo-export-btn';
    this.photoExportBtn.textContent = '📸 导出 PNG';
    this.photoExportBtn.addEventListener('click', () => {
      this.actions.onExportPng();
      this.showToast('正在导出高分辨率画面 📸');
    });

    this.photoExitBtn = document.createElement('button');
    this.photoExitBtn.className = 'hud-photo-btn-item';
    this.photoExitBtn.dataset.testid = 'photo-exit-btn';
    this.photoExitBtn.textContent = '✕ 退出摄影';
    this.photoExitBtn.addEventListener('click', () => {
      this.setPhotoMode(false);
    });

    photoBar.appendChild(this.photoPauseBtn);
    photoBar.appendChild(this.photoExportBtn);
    photoBar.appendChild(this.photoExitBtn);

    const photoHint = document.createElement('div');
    photoHint.className = 'hud-photo-hint';
    photoHint.textContent = 'Space 暂停 · P 导出 PNG · H / Esc 退出';

    this.photoOverlay.appendChild(photoBar);
    this.photoOverlay.appendChild(photoHint);
    this.container.appendChild(this.photoOverlay);

    // ------------------------------------------------------------------------
    // Toast Notification
    // ------------------------------------------------------------------------
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'hud-toast';
    this.toastEl.dataset.testid = 'toast';
    this.container.appendChild(this.toastEl);

    // Attach to root DOM
    this.root.appendChild(this.container);

    // Keyboard Shortcuts
    window.addEventListener('keydown', this.handleKeyDown);

    // Initial state sync
    this.updateState(initialState);
  }

  updateState(state: UrlSceneState): void {
    this.currentState = { ...state };

    // Update time slider and readouts
    this.timeSlider.value = state.timeHours.toFixed(2);
    const formattedTime = formatTime(state.timeHours);
    this.timeSliderDisplay.textContent = formattedTime;
    this.timeDisplay.textContent = formattedTime;

    // Auto cycle
    this.autoCycleToggle.classList.toggle('active', state.autoCycle);
    this.autoCycleToggle.setAttribute(
      'aria-pressed',
      state.autoCycle ? 'true' : 'false'
    );
    const autoCycleLabel = this.autoCycleToggle.querySelector(
      '.hud-toggle-label'
    );
    if (autoCycleLabel) {
      autoCycleLabel.textContent = state.autoCycle
        ? '昼夜流转 (运行中)'
        : '昼夜流转 (已停止)';
    }

    // Weather buttons
    for (const [kind, btn] of this.weatherButtons) {
      btn.classList.toggle('active', state.weather === kind);
    }

    // Fog toggle
    this.fogToggle.classList.toggle('active', state.fogEnabled);
    this.fogToggle.setAttribute(
      'aria-pressed',
      state.fogEnabled ? 'true' : 'false'
    );

    // Theme buttons
    for (const [themeId, btn] of this.themeButtons) {
      btn.classList.toggle('active', state.theme === themeId);
    }

    // Preset buttons matching
    for (const [presetId, btn] of this.presetButtons) {
      const preset = SCENE_PRESETS.find((p) => p.id === presetId);
      const isMatch =
        preset !== undefined &&
        preset.theme === state.theme &&
        preset.weather === state.weather &&
        preset.fogEnabled === state.fogEnabled &&
        Math.abs(preset.timeHours - state.timeHours) < 0.25;
      btn.classList.toggle('active', isMatch);
    }

    // Seed display
    this.seedDisplay.textContent = `#${state.seed}`;

    // Custom sign text input (preserve focus)
    if (document.activeElement !== this.customSignInput) {
      this.customSignInput.value = state.customSignText;
    }

    // Post-fx toggle
    this.postFxToggle.classList.toggle('active', state.postFxExtra);
    this.postFxToggle.setAttribute(
      'aria-pressed',
      state.postFxExtra ? 'true' : 'false'
    );

    // Auto orbit toggle
    this.autoOrbitToggle.classList.toggle('active', state.autoOrbit);
    this.autoOrbitToggle.setAttribute(
      'aria-pressed',
      state.autoOrbit ? 'true' : 'false'
    );
  }

  updateLiveStatus(
    atmosphere: AtmosphereState,
    easterEgg: EasterEggState,
    paused: boolean
  ): void {
    const formattedTime = formatTime(atmosphere.timeHours);
    this.timeDisplay.textContent = formattedTime;

    if (atmosphere.autoCycle) {
      this.currentState.timeHours = atmosphere.timeHours;
      this.timeSlider.value = atmosphere.timeHours.toFixed(2);
      this.timeSliderDisplay.textContent = formattedTime;
    }

    // Update telemetry badge
    const timeDesc = getTimeDescription(atmosphere.timeHours);
    const neonPercent = Math.round(atmosphere.neonIntensity * 100);
    const weatherDesc = getWeatherDescription(atmosphere.weather);
    this.telemetryBadge.textContent = `${timeDesc} · ${weatherDesc} · 霓虹 ${neonPercent}%`;

    // Easter egg announcement
    if (easterEgg.triggeredCount > this.lastEasterEggCount) {
      this.lastEasterEggCount = easterEgg.triggeredCount;
      let msg = '✨ 街区隐藏彩蛋触发';
      if (easterEgg.activeKind === 'ufo') {
        msg = '🛸 奇异光盘掠过夜空';
      } else if (easterEgg.activeKind === 'cat') {
        msg = '🐈 霓虹黑猫窜过街角';
      } else if (easterEgg.activeKind === 'neon_sync') {
        msg = '⚡ 整街霓虹电压波动';
      }
      this.showToast(msg, 3500);
    }

    // Pause state sync
    if (this.paused !== paused) {
      this.setPaused(paused);
    }
  }

  setPhotoMode(active: boolean): void {
    if (this.photoMode === active) {
      return;
    }
    this.photoMode = active;
    this.container.classList.toggle('photo-mode-active', active);
    this.actions.onPhotoModeChange(active);
    if (active) {
      this.showToast('摄影模式已开启 · 按 H 或 Esc 退出');
    }
  }

  isPhotoMode(): boolean {
    return this.photoMode;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseBtn.classList.toggle('active', paused);
    this.pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    const label = this.pauseBtn.querySelector('.hud-toggle-label');
    if (label) {
      label.textContent = paused ? '继续模拟' : '暂停模拟';
    }

    this.photoPauseBtn.textContent = paused ? '▶ 继续' : '⏸ 暂停';
    this.photoPauseBtn.classList.toggle('active', paused);
  }

  showToast(message: string, durationMs = 2500): void {
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');

    this.toastTimeout = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this.toastTimeout = null;
    }, durationMs);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.container.remove();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    const key = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (this.photoMode) {
        this.setPhotoMode(false);
      }
    } else if (key === 'h') {
      this.setPhotoMode(!this.photoMode);
    } else if (e.code === 'Space' || key === ' ') {
      e.preventDefault();
      const nextPaused = !this.paused;
      this.setPaused(nextPaused);
      this.actions.onPauseToggle(nextPaused);
    } else if (key === 'p') {
      this.actions.onExportPng();
      this.showToast('正在导出高分辨率画面 📸');
    } else if (key === 'r') {
      this.actions.onNewStreet();
    }
  };
}
