# Earth Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved orbital Earth animation and compact, readable controls without changing graph data.

**Architecture:** A single pointer-transparent WebGL canvas renders an analytic sphere, atmospheric layers and deterministic stars. CSS composes translucent panels over it; graph interaction stays in the existing GraphCanvas. The renderer owns texture loading, resize, motion preferences and resource cleanup.

**Tech Stack:** Vanilla JavaScript, WebGL 1, CSS, Node.js tests and existing Playwright browser harness. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-earth-workspace-design.md`

## Global Constraints

- Remove the Moon, lunar terrain and lunar shadows entirely.
- Limit decorative rendering to approximately 30 FPS and cap internal resolution/device pixel ratio.
- Stop rendering in hidden tabs.
- Under `prefers-reduced-motion`, render a still scene; provide a pause/resume control for the continuous decorative motion.
- No NASA requests, CDN dependencies or API keys are required when a user opens LSG.
- Target a total compressed image payload below 1 MiB.
- Preserve graph dots, drag/zoom, white outlines, data and live-activity settings.

## Task 1: Compact controls and import layout

**Files:** Create `public/orbital.css`; modify `public/index.html`; create `scripts/browser-orbital.mjs`.

**Interfaces:** Browser script starts an isolated HTTP server using existing LsgStore/LsgService/McpProtocol/createHttpServer interfaces. CSS loads after workspace.css.

- [ ] Write browser checks that catch oversized buttons and overflowing Create controls:
  ```js
  const create = await page.locator('#createProject').boundingBox();
  const input = await page.locator('#newTitle').boundingBox();
  assert.ok(create.height <= 32);
  assert.ok(create.x >= input.x + input.width + 7);
  ```
  Also measure Projects font size >=15 and an import textarea/action gap >=8.
- [ ] Run `node scripts/browser-orbital.mjs` with the installed Playwright module environment variable; confirm failure on current button sizes.
- [ ] Implement scoped CSS, maintaining graph card/Markdown font sizes:
  ```css
  #leftPanel .row { display:flex; gap:8px; }
  #newTitle { flex:1; min-width:0; width:0; }
  #createProject { flex:0 0 auto; white-space:nowrap; }
  #planText { display:block; margin:10px 0; }
  ```
- [ ] Run browser layout checks at 1600px and 1100px; adjust only observed layout issues.

## Task 2: Local Earth texture and resilient live renderer

**Files:** Create `public/orbital.js`, `public/assets/earth/ATTRIBUTION.md`, `public/assets/earth/earth-viirs.jpg`; extend browser-orbital.mjs; update static image MIME mappings in `src/http/server.mjs`.

**Interfaces:** Module auto-initializes `#orbitalBackground`; button `#toggleOrbit` controls motion. Canvas `data-state` exposes loading/running/paused/fallback for accessibility state synchronization and browser verification. Scene consumes only local image assets, viewport size, elapsed time and motion preference.

- [ ] Add browser assertions for a missing live scene, then run and observe failure:
  ```js
  await page.waitForSelector('#orbitalBackground[data-state="running"]');
  const a = await page.locator('#orbitalBackground').screenshot();
  await page.waitForTimeout(1200);
  assert.notDeepEqual(await page.locator('#orbitalBackground').screenshot(), a);
  ```
- [ ] Download the NASA flat-map JPEG identified in the spec into the asset path. Verify size <1MiB and image dimensions; retain NASA credit and original URL.
- [ ] Implement a full-screen triangle shader using sphere intersection normals and equirectangular sampling. Rotate longitude with elapsed seconds. Compose exponential blue atmosphere falloff and static hashed stars. No Moon objects or textures.
  ```glsl
  vec2 uv = vec2(atan(normal.z, normal.x) / 6.2831853 + 0.5 + rotation,
                 asin(clamp(normal.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  ```
- [ ] Cap drawing size and 30FPS scheduling; stop on document hidden and motion pause. Reduced-motion renders once. Handle texture rejection and WebGL loss by selecting fallback and stopping animation; dispose on page teardown.
- [ ] Verify frozen screenshots while paused/reduced-motion, no external runtime requests, supported JPEG MIME, nonblank Earth pixels, fallback usability when texture fetch is blocked, resize and keyboard-accessible pause.

## Task 3: Integration, review and delivery

**Files:** Existing browser-workspace.mjs, docs/WORKSPACE_6_1.md, TEST_REPORT.md, MANIFEST.sha256; installed runtime receives changed production files and image assets only.

**Interfaces:** Keep HTTP/MCP API behavior unchanged; source and installed files must match for modified production assets.

- [ ] Run `npm test`, `npm run smoke`, `npm run verify`, doctor with a temporary DB, browser-workspace and browser-orbital. Screenshot actual Eden without enabling live activity or mutating its nodes.
- [ ] Inspect screenshots for orbital composition, readable panels and preserved graph interaction. Review code for async teardown, pointer interception and any database changes.
- [ ] Update docs and report with measured results, generate manifest, commit and push staging.
- [ ] Re-run release gates on the committed staging revision; fast-forward master to the tested commit and push master. No new tag unless version metadata changes.
- [ ] Compare installed file baselines, preserve database and apply scoped production changes. Restart the identified runtime if needed. Confirm health, new assets, no browser errors and unchanged Eden counts; provide UI link.
