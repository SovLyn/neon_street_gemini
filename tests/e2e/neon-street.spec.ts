import { test, expect, type Page } from '@playwright/test';

async function waitForNeonReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as unknown as { __NEON_APP__?: { isReady: () => boolean } }).__NEON_APP__;
      return Boolean(app && app.isReady());
    },
    { timeout: 30000 }
  );
}

test.describe('Neon Street Block (霓虹街区) E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Fail immediately on uncaught page error or console.error
    page.on('pageerror', (err) => {
      throw new Error(`[PAGE ERROR]: ${err.message}\n${err.stack ?? ''}`);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const locUrl = msg.location()?.url ?? '';
        if (text.includes('favicon.ico') || locUrl.includes('favicon.ico')) {
          return;
        }
        throw new Error(`[CONSOLE ERROR]: ${text} (${locUrl})`);
      }
    });
  });

  test('Test 1: WASM initialization, 3D scene layout & non-blank canvas rendering', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForNeonReady(page);

    // Verify 3D scene layout contracts
    const layout = await page.evaluate(() => window.__NEON_APP__!.getLayout());
    expect(layout.buildings.length).toBeGreaterThanOrEqual(10);

    const orientations = new Set(layout.signs.map((s) => s.orientation));
    expect(orientations.has('horizontal')).toBe(true);
    expect(orientations.has('vertical')).toBe(true);
    expect(orientations.has('rooftop')).toBe(true);

    expect(layout.streetlights.length).toBeGreaterThanOrEqual(6);
    expect(layout.puddles.length).toBeGreaterThanOrEqual(4);

    // Verify non-blank canvas rendering by inspecting pixel data across grid
    const pixelStats = await page.evaluate(async () => {
      // Wait 2 animation frames
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const canvas = document.getElementById('neon-canvas') as HTMLCanvasElement | null;
      if (!canvas) throw new Error('neon-canvas element not found');

      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) {
        return { width, height, nonZeroCount: 0, variance: 0, maxLuma: 0, totalSamples: 0 };
      }

      const dataUrl = canvas.toDataURL('image/png');
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Failed to create 2d rendering context for canvas inspection');
      ctx.drawImage(img, 0, 0);

      const sampleCols = 32;
      const sampleRows = 24;
      const lumas: number[] = [];
      let nonZeroCount = 0;

      for (let r = 0; r < sampleRows; r++) {
        const y = Math.floor((r / sampleRows) * height);
        for (let c = 0; c < sampleCols; c++) {
          const x = Math.floor((c / sampleCols) * width);
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          const luma = 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2];
          lumas.push(luma);
          if (pixel[0] > 10 || pixel[1] > 10 || pixel[2] > 10) {
            nonZeroCount++;
          }
        }
      }

      const total = lumas.length;
      const mean = lumas.reduce((acc, v) => acc + v, 0) / total;
      const variance = lumas.reduce((acc, v) => acc + (v - mean) ** 2, 0) / total;
      const maxLuma = Math.max(...lumas);

      return {
        width,
        height,
        totalSamples: total,
        nonZeroCount,
        variance,
        maxLuma,
      };
    });

    expect(pixelStats.width).toBeGreaterThan(0);
    expect(pixelStats.height).toBeGreaterThan(0);
    // Canvas must not be blank or uniform solid color
    expect(pixelStats.nonZeroCount).toBeGreaterThan(pixelStats.totalSamples * 0.1);
    expect(pixelStats.variance).toBeGreaterThan(5);
    expect(pixelStats.maxLuma).toBeGreaterThan(15);

    // Capture visual preview screenshot
    await page.screenshot({ path: 'test-results/neon-street-preview.png', fullPage: false });
  });

  test('Test 2: Day/Night time slider linked state', async ({ page }) => {
    await page.goto('/');
    await waitForNeonReady(page);

    // Initial night state (default 22.5)
    const nightAtmosphere = await page.evaluate(() => window.__NEON_APP__!.getAtmosphere());
    expect(nightAtmosphere.timeHours).toBeCloseTo(22.5, 1);

    // Move time-slider to 12.0 (noon)
    const timeSlider = page.locator('[data-testid="time-slider"]');
    await timeSlider.fill('12.00');

    // Verify time display shows 12:00
    const timeDisplay = page.locator('[data-testid="time-display"]');
    await expect(timeDisplay).toHaveText('12:00');

    // Verify atmospheric shifts at noon
    const noonAtmosphere = await page.evaluate(() => window.__NEON_APP__!.getAtmosphere());
    expect(noonAtmosphere.daylight).toBeGreaterThan(0.7);
    expect(noonAtmosphere.neonIntensity).toBeLessThan(nightAtmosphere.neonIntensity);
    expect(noonAtmosphere.windowLitRatio).toBeLessThan(nightAtmosphere.windowLitRatio);
  });

  test('Test 3: Color theme switch & scene presets', async ({ page }) => {
    await page.goto('/');
    await waitForNeonReady(page);

    // Switch to Kowloon Noir theme
    await page.locator('[data-testid="theme-btn-hk-noir"]').click();

    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(dataTheme).toBe('hk-noir');

    const themeAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()
    );
    expect(themeAccent).toBe('#00e676');

    const stateTheme = await page.evaluate(() => window.__NEON_APP__!.getState().theme);
    expect(stateTheme).toBe('hk-noir');

    // Apply scene preset "dusk-vapor"
    await page.locator('[data-testid="preset-btn-dusk-vapor"]').click();

    const presetState = await page.evaluate(() => window.__NEON_APP__!.getState());
    expect(presetState.theme).toBe('vapor-dawn');
    expect(presetState.weather).toBe('rain');
    expect(Math.abs(presetState.timeHours - 18.25)).toBeLessThan(0.1);
  });

  test('Test 4: 3 Click interactions on real 3D canvas (Sign glitch, Streetlight toggle, Water ripple)', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForNeonReady(page);

    // Switch to clear weather first so rain does not interfere with ripple counting
    await page.locator('[data-testid="weather-btn-clear"]').click();
    await page.waitForTimeout(300);

    // 1. Sign click -> Glitch trigger
    const signPt = await page.evaluate(() =>
      window.__NEON_APP__!.getScreenPointForInteraction('sign')
    );
    expect(signPt).not.toBeNull();
    if (signPt) {
      await page.mouse.click(signPt.x, signPt.y);
      await page.waitForFunction(
        (id) => {
          const s = window.__NEON_APP__!.getSignState(id);
          return s[1] > 0.05;
        },
        signPt.id,
        { timeout: 4000 }
      );
      const signState = await page.evaluate(
        (id) => window.__NEON_APP__!.getSignState(id),
        signPt.id
      );
      expect(signState[1]).toBeGreaterThan(0.05);
    }

    // 2. Streetlight click -> Toggle on/off state
    const lightPt = await page.evaluate(() =>
      window.__NEON_APP__!.getScreenPointForInteraction('streetlight')
    );
    expect(lightPt).not.toBeNull();
    if (lightPt) {
      const beforeState = await page.evaluate(
        (id) => window.__NEON_APP__!.getStreetlightState(id)[0],
        lightPt.id
      );
      await page.mouse.click(lightPt.x, lightPt.y);
      await page.waitForFunction(
        ({ id, before }) => {
          const after = window.__NEON_APP__!.getStreetlightState(id)[0];
          return after !== before;
        },
        { id: lightPt.id, before: beforeState },
        { timeout: 4000 }
      );
      const afterState = await page.evaluate(
        (id) => window.__NEON_APP__!.getStreetlightState(id)[0],
        lightPt.id
      );
      expect(afterState).not.toBe(beforeState);
    }

    // 3. Water surface click -> Spawn ripples
    const waterPt = await page.evaluate(() =>
      window.__NEON_APP__!.getScreenPointForInteraction('water')
    );
    expect(waterPt).not.toBeNull();
    if (waterPt) {
      const beforeRipples = await page.evaluate(() => window.__NEON_APP__!.getRippleCount());
      await page.mouse.click(waterPt.x, waterPt.y);
      await page.waitForFunction(
        (before) => {
          return window.__NEON_APP__!.getRippleCount() > before;
        },
        beforeRipples,
        { timeout: 4000 }
      );
      const afterRipples = await page.evaluate(() => window.__NEON_APP__!.getRippleCount());
      expect(afterRipples).toBeGreaterThan(beforeRipples);
    }
  });

  test('Test 5: URL state restoration & New Street regeneration', async ({ page }) => {
    // Navigate with custom URL query params
    await page.goto('/?t=6.15&w=snow&f=0&p=vapor-dawn&s=777123&fx=0&txt=NEONTEST');
    await waitForNeonReady(page);

    const restored = await page.evaluate(() => window.__NEON_APP__!.getState());
    expect(Math.abs(restored.timeHours - 6.15)).toBeLessThan(0.05);
    expect(restored.weather).toBe('snow');
    expect(restored.fogEnabled).toBe(false);
    expect(restored.theme).toBe('vapor-dawn');
    expect(restored.seed).toBe(777123);
    expect(restored.postFxExtra).toBe(false);
    expect(restored.customSignText).toBe('NEONTEST');

    await expect(page.locator('[data-testid="seed-display"]')).toHaveText('#777123');

    const htmlTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    );
    expect(htmlTheme).toBe('vapor-dawn');

    // Click "New Street" button
    const prevSeed = restored.seed;
    await page.locator('[data-testid="new-street-btn"]').click();

    await page.waitForFunction(
      (oldSeed) => {
        return window.__NEON_APP__!.getState().seed !== oldSeed;
      },
      prevSeed,
      { timeout: 4000 }
    );

    const newSceneState = await page.evaluate(() => window.__NEON_APP__!.getState());
    const newLayout = await page.evaluate(() => window.__NEON_APP__!.getLayout());
    expect(newSceneState.seed).not.toBe(prevSeed);
    expect(newLayout.seed).toBe(newSceneState.seed);
  });

  test('Test 6: Photo Mode, PNG Export & Easter Eggs', async ({ page }) => {
    await page.goto('/');
    await waitForNeonReady(page);

    // Trigger each easter egg
    for (const kind of ['ufo', 'cat', 'neon_sync'] as const) {
      await page.evaluate((k) => window.__NEON_APP__!.triggerEasterEgg(k), kind);
      const eggState = await page.evaluate(() => window.__NEON_APP__!.getEasterEgg());
      expect(eggState.activeKind).toBe(kind);
    }

    // Enter photo mode
    await page.locator('[data-testid="photo-mode-btn"]').click();

    // Verify photo-overlay visible and HUD panel hidden
    const photoOverlay = page.locator('[data-testid="photo-overlay"]');
    await expect(photoOverlay).toBeVisible();

    // Wait for HUD panel fade-out CSS transition (0.25s) to finish
    await page.waitForFunction(
      () => {
        const hudDock = document.querySelector('[data-testid="hud-panel"]');
        return hudDock && parseFloat(window.getComputedStyle(hudDock).opacity) <= 0.05;
      },
      undefined,
      { timeout: 10000, polling: 100 }
    );

    const photoModeStyles = await page.evaluate(() => {
      const container = document.querySelector('.hud-container');
      const hudDock = document.querySelector('[data-testid="hud-panel"]');
      const overlay = document.querySelector('[data-testid="photo-overlay"]');
      return {
        hasActiveClass: container?.classList.contains('photo-mode-active'),
        dockOpacity: hudDock ? window.getComputedStyle(hudDock).opacity : '',
        overlayOpacity: overlay ? window.getComputedStyle(overlay).opacity : '',
      };
    });

    expect(photoModeStyles.hasActiveClass).toBe(true);
    expect(parseFloat(photoModeStyles.dockOpacity)).toBeLessThanOrEqual(0.05);
    expect(parseFloat(photoModeStyles.overlayOpacity)).toBeGreaterThan(0.9);

    // Click photo export button and verify exported PNG data length > 5000 bytes
    await page.locator('[data-testid="photo-export-btn"]').click();
    const exportLength = await page.evaluate(() =>
      window.__NEON_APP__!.getLastExportDataUrlLength()
    );
    expect(exportLength).toBeGreaterThan(5000);

    // Exit photo mode cleanly
    await page.locator('[data-testid="photo-exit-btn"]').click();

    // Wait for HUD panel fade-in CSS transition (0.25s) to restore visibility
    await page.waitForFunction(
      () => {
        const hudDock = document.querySelector('[data-testid="hud-panel"]');
        return hudDock && parseFloat(window.getComputedStyle(hudDock).opacity) >= 0.8;
      },
      undefined,
      { timeout: 10000, polling: 100 }
    );

    const exitedStyles = await page.evaluate(() => {
      const container = document.querySelector('.hud-container');
      const hudDock = document.querySelector('[data-testid="hud-panel"]');
      return {
        hasActiveClass: container?.classList.contains('photo-mode-active'),
        dockOpacity: hudDock ? window.getComputedStyle(hudDock).opacity : '',
      };
    });

    expect(exitedStyles.hasActiveClass).toBe(false);
    expect(parseFloat(exitedStyles.dockOpacity)).toBeGreaterThan(0.5);
  });
});
