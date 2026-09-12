# Earth-from-orbit workspace design

## Approved direction

Update approved 2026-09-13 during implementation: use sharper Earth/cloud imagery than the initial 4K attempt and a more visible star field. Deliver an 8K compressed composite, permitting up to 8 MiB of image payload; this supersedes the original 1 MiB target below. Downsample on devices with smaller GPU texture limits.

Use the user's latest reference: a close curved Earth horizon across the lower portion of the viewport, blue atmospheric glow, clouds and a black star field above. Earth rotates slowly under a fixed camera. Remove the Moon, lunar terrain and lunar shadows entirely. This is a live rendered scene, not a screenshot or video background.

Keep LSG functional and legible: dark translucent interface panels, white card outlines and connections, existing graph dots, draggable cards, project selection, import controls, Markdown plans and progress tools. No graph data or MCP behavior changes are needed.

## Interface refinement

- Desktop buttons: approximately 28–30 px tall, 11–12 px labels, 6–10 px horizontal padding. Retain visible keyboard focus and use larger targets for coarse-pointer devices.
- Secondary toolbar and form text: approximately 11 px, with sufficient contrast. Do not shrink rendered Markdown or all graph content indiscriminately.
- Projects heading: 15 px with less letter spacing, visually stronger than adjacent section headings.
- Project creation row: flexible input with `min-width: 0`, fixed-content Create button, 8 px gap; neither control may overflow the sidebar.
- Import controls: 10 px vertical spacing between file chooser, Markdown input and action row. The text area remains resizable vertically; action buttons never touch its border. Empty import summaries should not reserve a blank dark block.
- Preserve minimizable sidebar, selected-node panel, graph navigation and responsive behavior.

## Rendering architecture

Add one isolated decorative WebGL renderer behind the application, not one renderer per panel or card. It has no pointer interaction, is hidden from accessibility APIs and cannot intercept canvas drag/zoom events. Application controls and graph remain ordinary HTML/CSS.

Use a fixed orbital composition with Earth extending beyond the bottom and side edges. Map an equirectangular NASA Earth texture onto spherical geometry, rotate the texture/sphere with elapsed time, and render layered atmospheric falloff around the curved horizon. Clouds can use the selected composite texture; a separate cloud layer is optional only if it improves the reference match within the asset budget. Use deterministic procedural stars without downloading a star-field backdrop.

The geotagger reference uses custom sphere shading, cloud rotation and multiple atmosphere shells. Reuse these ideas with an implementation suited to LSG's vanilla JavaScript frontend; do not bring in React or the full geotagger application.

One continuous scene is visible through translucent panel surfaces. A dark readability scrim covers the scene. The graph retains its dotted pattern over a sufficiently dark translucent plane; cards and text fields remain more opaque than panel backgrounds. Do not repeat or independently crop the scene in each panel.

## Assets and loading

Download NASA texture assets during development and serve optimized copies locally. No NASA requests, CDN dependencies or API keys are required when a user opens LSG. Record original URLs, credits and compression settings alongside the assets. Start with a 1K–2K texture; target a total compressed image payload below 1 MiB, increasing only if browser inspection shows inadequate quality. Preserve an original-source reference rather than committing unnecessarily large originals.

Sources already inspected:

- NASA Goddard, Blue Marble 2015: https://svs.gsfc.nasa.gov/30763/
- Available flat texture: https://svs.gsfc.nasa.gov/vis/a030000/a030700/a030763/global_vir_2015287_mosaic_sm_print.jpg
- Implementation reference: https://github.com/medenijazbec/geotagger-frontend/blob/main/src/components/RotatingGlobe.tsx

The latest scope does not require downloading Moon textures.

## Performance, accessibility and failure behavior

Limit decorative rendering to approximately 30 FPS and cap internal resolution/device pixel ratio. Stop rendering in hidden tabs. Under `prefers-reduced-motion`, render a still scene; provide a pause/resume control for the continuous decorative motion. Respect preference changes without a reload. Rotation speed is time-based, not frame-count-based.

If WebGL or a texture fails, retain a dark CSS fallback and a fully working LSG UI. Handle context loss without crashing the application or retrying indefinitely. Resize without changing graph positions. Dispose renderer resources and event listeners when appropriate.

## Verification and delivery

Browser checks must verify compact control sizes, Create-button containment, import spacing, enlarged Projects heading, texture loading, changing Earth frames, stationary reduced-motion mode, pause/resume behavior and a usable fallback. Inspect screenshots against the supplied orbital reference at desktop and narrower viewport sizes.

Re-run existing dense-graph tests: non-overlap, free drag, zoom/pan, filter/reload placement persistence, live-activity pulses and semantic counters. The background must not move cards or capture input.

Use the existing release workflow: commit integration work on staging, run the full release suite, promote the exact tested commit to master, install the updated assets/runtime without replacing the database, restart if required, and provide the Eden UI link. Tag only if release version metadata changes. Do not enable live project activity as a side effect of a visual update.

## Out of scope

No Moon scene, scientific orbital simulation, interactive globe navigation, changes to feature priority or numbering, graph regeneration, database migration, or upstream LLM dependency.
