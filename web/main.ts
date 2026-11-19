import {
  applyThemeToDocument,
  THEMES,
} from './config/themes';
import {
  buildShareUrl,
  generateRandomSeed,
  parseUrlState,
  syncUrlState,
} from './config/urlState';
import { createNeonWorldBridge } from './wasm/bridge';
import { NeonScene, type SceneCallbacks } from './scene/NeonScene';
import { UIController, type UIActions } from './ui/UIController';
import type {
  AtmosphereState,
  BlockLayout,
  EasterEggState,
  UrlSceneState,
} from './types/sim';

export interface NeonAppApi {
  isReady: () => boolean;
  getState: () => UrlSceneState;
  getAtmosphere: () => AtmosphereState;
  getLayout: () => BlockLayout;
  getEasterEgg: () => EasterEggState;
  getSignState: (signId: number) => [number, number, number];
  getStreetlightState: (lightId: number) => [number, number];
  getRippleCount: () => number;
  getScreenPointForInteraction: (
    target: 'sign' | 'streetlight' | 'water'
  ) => { x: number; y: number; id: number } | null;
  triggerEasterEgg: (kind: 'ufo' | 'cat' | 'neon_sync') => void;
  getLastExportDataUrlLength: () => number;
}

declare global {
  interface Window {
    __NEON_APP__?: NeonAppApi;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function bootstrap(): Promise<void> {
  // 1. Parse initial URL state and apply theme colors immediately
  const state: UrlSceneState = parseUrlState(window.location.search);
  const initialTheme = THEMES[state.theme] ?? THEMES['cyber-tokyo'];
  applyThemeToDocument(initialTheme);

  // 2. Initialize simulation bridge
  const bridge = createNeonWorldBridge();
  await bridge.init(state.seed);

  // Apply parsed URL states to bridge
  bridge.setTimeHours(state.timeHours);
  bridge.setAutoCycle(state.autoCycle);
  bridge.setWeather(state.weather);
  bridge.setFogEnabled(state.fogEnabled);

  // 3. Resolve DOM mount points
  const canvas = document.getElementById('neon-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root') as HTMLElement | null;

  if (!canvas) {
    throw new Error('Canvas element #neon-canvas not found in document.');
  }
  if (!uiRoot) {
    throw new Error('UI root element #ui-root not found in document.');
  }

  // Runtime flags
  let isPaused = false;
  let lastExportLength = 0;
  let syncUrlTimer: number | null = null;

  const debouncedSyncUrl = (): void => {
    if (syncUrlTimer !== null) {
      window.clearTimeout(syncUrlTimer);
    }
    syncUrlTimer = window.setTimeout(() => {
      syncUrlState(state);
      syncUrlTimer = null;
    }, 250);
  };

  // 4. Wire Scene Callbacks
  const sceneCallbacks: SceneCallbacks = {
    onSignClick: (signId: number) => {
      bridge.triggerSignGlitch(signId);
      ui.showToast(`招牌 #${signId} 霓虹电路瞬时脉冲 ⚡`, 1800);
    },
    onStreetlightClick: (lightId: number) => {
      const isOn = bridge.toggleStreetlight(lightId);
      ui.showToast(
        `路灯 #${lightId} 已${isOn ? '点亮 💡' : '熄灭 🌑'}`,
        1800
      );
    },
    onWaterClick: (x: number, z: number) => {
      bridge.spawnWaterRipple(x, z, 1.25);
      ui.showToast('激起泛光水面涟漪 💧', 1600);
    },
    onUserCameraInteract: () => {
      if (state.autoOrbit) {
        state.autoOrbit = false;
        scene.setAutoOrbit(false);
        ui.updateState(state);
        debouncedSyncUrl();
      }
    },
  };

  // 5. Initialize NeonScene
  const scene = new NeonScene(
    canvas,
    bridge.getBlockLayout(),
    initialTheme,
    sceneCallbacks,
    {
      postFxExtra: state.postFxExtra,
      autoOrbit: state.autoOrbit,
      customSignText: state.customSignText,
    }
  );

  // 6. Wire UI Controller Actions
  const uiActions: UIActions = {
    onTimeChange: (hours: number) => {
      state.timeHours = hours;
      bridge.setTimeHours(hours);
      debouncedSyncUrl();
    },
    onAutoCycleToggle: (enabled: boolean) => {
      state.autoCycle = enabled;
      bridge.setAutoCycle(enabled);
      debouncedSyncUrl();
    },
    onWeatherChange: (weather) => {
      state.weather = weather;
      bridge.setWeather(weather);
      debouncedSyncUrl();
    },
    onFogToggle: (enabled: boolean) => {
      state.fogEnabled = enabled;
      bridge.setFogEnabled(enabled);
      debouncedSyncUrl();
    },
    onThemeChange: (themeId) => {
      state.theme = themeId;
      const themeDef = THEMES[themeId];
      if (themeDef) {
        applyThemeToDocument(themeDef);
        scene.setTheme(themeDef);
      }
      ui.updateState(state);
      debouncedSyncUrl();
    },
    onPresetApply: (preset) => {
      state.theme = preset.theme;
      state.timeHours = preset.timeHours;
      state.autoCycle = preset.autoCycle ?? false;
      state.weather = preset.weather;
      state.fogEnabled = preset.fogEnabled;
      state.postFxExtra = preset.postFxExtra;
      state.autoOrbit = preset.autoOrbit ?? false;

      const themeDef = THEMES[preset.theme];
      if (themeDef) {
        applyThemeToDocument(themeDef);
        scene.setTheme(themeDef);
      }

      scene.setPostFxExtra(state.postFxExtra);
      scene.setAutoOrbit(state.autoOrbit);

      bridge.setTimeHours(state.timeHours);
      bridge.setAutoCycle(state.autoCycle);
      bridge.setWeather(state.weather);
      bridge.setFogEnabled(state.fogEnabled);

      ui.updateState(state);
      ui.showToast(`已应用场景预设：${preset.name}`, 2200);
      debouncedSyncUrl();
    },
    onNewStreet: () => {
      const nextSeed = generateRandomSeed();
      state.seed = nextSeed;
      const newLayout = bridge.regenerate(nextSeed);
      scene.rebuildBlock(newLayout, state.customSignText);
      ui.updateState(state);
      ui.showToast(`已生成全新程序化街区 #${nextSeed}`, 2500);
      debouncedSyncUrl();
    },
    onShareUrl: () => {
      const url = buildShareUrl(state);
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      ui.showToast('街区分享链接已复制到剪贴板 🔗', 2600);
      return url;
    },
    onPostFxExtraToggle: (enabled: boolean) => {
      state.postFxExtra = enabled;
      scene.setPostFxExtra(enabled);
      debouncedSyncUrl();
    },
    onAutoOrbitToggle: (enabled: boolean) => {
      state.autoOrbit = enabled;
      scene.setAutoOrbit(enabled);
      debouncedSyncUrl();
    },
    onCustomSignTextChange: (text: string) => {
      state.customSignText = text;
      scene.setCustomSignText(text);
      debouncedSyncUrl();
    },
    onPauseToggle: (paused: boolean) => {
      isPaused = paused;
    },
    onPhotoModeChange: (active: boolean) => {
      if (active) {
        ui.showToast('摄影模式已开启 (按 H 键恢复界面)', 2500);
      }
    },
    onExportPng: () => {
      const dataUrl = scene.exportPng(state.seed);
      lastExportLength = dataUrl.length;
      ui.showToast('已导出高分辨率街景截图 📸', 2500);
    },
    onTriggerEasterEgg: (kind) => {
      bridge.triggerEasterEgg(kind);
    },
  };

  const ui = new UIController(uiRoot, state, uiActions);

  // 7. Expose Window Test / Automation Hook
  const neonAppApi: NeonAppApi = {
    isReady: () => bridge.isReady(),
    getState: () => ({ ...state }),
    getAtmosphere: () => bridge.getAtmosphere(),
    getLayout: () => bridge.getBlockLayout(),
    getEasterEgg: () => bridge.getEasterEgg(),
    getSignState: (signId: number) => {
      const layout = bridge.getBlockLayout();
      const idx = layout.signs.findIndex((s) => s.id === signId);
      const buf = bridge.getSignStatesBuffer();
      if (idx >= 0 && (idx + 1) * 3 <= buf.length) {
        const off = idx * 3;
        return [buf[off], buf[off + 1], buf[off + 2]];
      }
      return [1.0, 0.0, 0.0];
    },
    getStreetlightState: (lightId: number) => {
      const layout = bridge.getBlockLayout();
      const idx = layout.streetlights.findIndex((l) => l.id === lightId);
      const buf = bridge.getStreetlightStatesBuffer();
      if (idx >= 0 && (idx + 1) * 2 <= buf.length) {
        const off = idx * 2;
        return [buf[off], buf[off + 1]];
      }
      return [1.0, 1.0];
    },
    getRippleCount: () => {
      const buf = bridge.getRipplesBuffer();
      let activeCount = 0;
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 0.01) {
          activeCount++;
        }
      }
      return activeCount;
    },
    getScreenPointForInteraction: (target) => {
      return scene.getScreenPointForInteraction(target);
    },
    triggerEasterEgg: (kind) => {
      bridge.triggerEasterEgg(kind);
    },
    getLastExportDataUrlLength: () => lastExportLength,
  };

  window.__NEON_APP__ = neonAppApi;

  // 8. Main Render & Simulation Loop
  let lastTime = performance.now();
  let lastUiUpdateTime = 0;

  function frame(now: number): void {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);

    if (!isPaused) {
      bridge.step(dt);
    }

    const { atmosphere, easterEgg } = scene.updateFrame(bridge, dt);

    if (state.autoCycle) {
      state.timeHours = atmosphere.timeHours;
    }

    // Throttle UI live updates to ~10Hz
    if (now - lastUiUpdateTime >= 100) {
      lastUiUpdateTime = now;
      ui.updateLiveStatus(atmosphere, easterEgg, isPaused);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Global bootstrap with fallback error display
bootstrap().catch((err: unknown) => {
  console.error('[NeonStreetBlock] Failed to bootstrap application:', err);
  const root = document.getElementById('app') || document.body;
  const message = err instanceof Error ? err.message : String(err);

  const errorOverlay = document.createElement('div');
  errorOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #080b12;
    color: #ff3366;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
    text-align: center;
    z-index: 99999;
  `;

  errorOverlay.innerHTML = `
    <h2 style="font-size:22px;margin-bottom:12px;color:#f3f6fc;font-weight:600;letter-spacing:1px;">
      霓虹街区 启动失败 // INITIALIZATION ERROR
    </h2>
    <p style="font-size:14px;color:#8fa2b8;max-width:540px;line-height:1.6;margin-bottom:20px;">
      未能初始化 3D 渲染器或 WebAssembly 街区模拟核心。请确认浏览器已开启 WebGL 2 与 WebAssembly 支持。
    </p>
    <pre style="background:#101522;padding:12px 18px;border-radius:6px;border:1px solid rgba(255,51,102,0.3);color:#ff708f;font-size:13px;max-width:620px;overflow-x:auto;text-align:left;">${escapeHtml(
      message
    )}</pre>
  `;

  root.appendChild(errorOverlay);
});
