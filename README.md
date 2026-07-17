# Codex Visual Template

**Use this folder as the starting point for every new Codex Power BI visual.**

It bakes in every cert-passing lesson + format-pane pattern from the existing visuals so you don't relearn them. Copy the folder, rename, edit only the per-visual-specific bits, and the result is cert-ready by default.

---

## What's pre-built

### Cert compliance (Policy 1180.2.x — verified across cert-passed visuals)

- **Internal visual title** rendered inside the iframe with full font / alignment / colour controls — the fix for Policy 1180.2.5 right-click context menu dead-zone caused by PBI's auto-rendered title chrome.
- **Single `contextmenu` listener on `options.element`** matching MS sample BarChart — no overlay, no per-element duplicates that double-fire and break `showContextMenu({}, ...)`.
- **`renderEmpty()` landing state** with branded guidance copy. Without this, PBI's auto landing-page chrome sits on top of the iframe and absorbs events. Even at default Padding > 0, this keeps right-click reachable.
- **`overflow: auto` on the root** + `min-height` floor on cards so resizing produces scrollbars instead of overlapping content (Policy 1180.2.2).
- **Supports flags all true:** `supportsHighlight`, `supportsKeyboardFocus`, `supportsLandingPage`, `supportsEmptyDataView`, `supportsMultiVisualSelection`.
- **Tooltips:** `default: true, canvas: true` + tooltipService wiring on hover.
- **Filter pipeline:** `dataViewMappings.categories` uses `for` pattern (filter participation); `select` for measures.
- **`dataReductionAlgorithm` = 30000** (max accepted by PBI cert team).
- **No `innerHTML` / `eval` / external requests** — uses `createElement` + `removeChild` loops, no fetch/XHR, no external scripts.
- **`ISandboxExtendedColorPalette`** for high contrast support.
- **`ILocalizationManager`** with en-US `resources.resjson` for landing-page strings.
- **`destroy()` cleanup** — DOM removal + nulling field references.
- **`prefers-reduced-motion: reduce`** honoured on any animation pseudo-element.

### Format-pane patterns

- **`TitleSettingsCard`** — Show toggle, Title Text, FontControl (family + size + bold + italic + underline), AlignmentGroup (left/center/right), ColorPicker.
- **Helper `alignSlice(name, default)`** — drop-in factory for adding a Left/Center/Right control to any card.
- **Helper `alignSelf(value)`** — maps the alignment slice value to a flex `align-self` keyword.
- **`ConstantOrRule` instanceKind** on every ColorPicker — enables conditional formatting drivers.
- **`FontControl` composite** for any text-displaying field well (label/value/subtitle/etc.) — gives the user one collapsed Font block instead of five separate sliders.

### Sample `.pbix` checklist (do this before submitting cert)

- General → Padding = 0 on all four sides on every visual instance in the sample.
- Add a textbox panel describing field wells + expected behaviour (Policy 1180.2.3.1).
- Save the sample with the latest visual binary loaded (otherwise cert team tests an outdated build).

---

## How to use the template

1. Copy the folder:
   ```bash
   cp -r ~/pbi-visuals/_template-codex ~/pbi-visuals/<visualDirName>
   cd ~/pbi-visuals/<visualDirName>
   ```

2. Edit `pbiviz.json`:
   - `visual.name` (camelCase, no spaces, e.g. `codexCalendarHeatmap`)
   - `visual.displayName` (human-readable, e.g. `Codex Calendar Heatmap`)
   - `visual.guid` (32-char hex — append `<NAME><RANDOM_HEX>` so it's globally unique)
   - `visual.description` (one-line)
   - `visual.version` start at `1.0.0.0`

3. Edit `capabilities.json`:
   - `dataRoles` — define your field wells (replace the placeholder `value` / `category` examples)
   - `dataViewMappings` — wire each role into the categorical mapping
   - `objects` — add visual-specific format objects beside the pre-built `titleSettings`

4. Edit `src/settings.ts`:
   - Add cards alongside `TitleSettingsCard`
   - For any text-displaying field well, instantiate an `alignSlice()` and a `FontControl` (see the headline pattern in KPI Wall)

5. Edit `src/visual.ts`:
   - Replace the `// TODO: render content` block with your actual rendering
   - Tooltip and click handlers are pre-wired — fill in tooltip data items and selection IDs in the per-element loop

6. Edit `style/visual.less`:
   - Add visual-specific styles — root and card scaffolding is already correct

7. Build:
   ```bash
   npm install
   pbiviz package
   ```

8. Before submitting cert, run the checklist in `CHECKLIST.md`.

---

## Files

- `pbiviz.json` — manifest, API version, metadata
- `capabilities.json` — data roles, dataViewMappings, format objects, supports* flags
- `src/visual.ts` — render lifecycle, contextmenu, title, landing
- `src/settings.ts` — formatting model with TitleSettings + helpers
- `style/visual.less` — root/card scaffolding + reduced-motion guard
- `stringResources/en-US/resources.resjson` — localized landing copy
- `assets/icon.png` — placeholder (replace with real 20×20 PNG)
- `CHECKLIST.md` — pre-submit cert verification
- `eslint.config.mjs` — copy from any existing visual after `pbiviz new`-style scaffold
- `package.json` / `tsconfig.json` — copy from any existing visual

> **For the npm/tsconfig/eslint files**: easiest is to scaffold an empty visual via `pbiviz new __scratch` once, copy those three files into your new visual, then delete `__scratch`. The template doesn't carry them because they vary slightly with pbiviz tool version.
