# Pre-cert checklist

Run through every item before clicking "Submit" in Partner Center.

## ⚠️ Iterating on an AppSource-submitted visual

**Symptom:** schema changes (new slices, cards, alignment, fonts) don't appear
in your PBI Desktop format pane after rebuild + import.

**Cause:** for visuals registered to your AppSource publisher account, PBI Desktop
loads from the AppSource registration BY DEFAULT and silently ignores any local
.pbiviz import with the same GUID. End users / cert reviewers don't hit this
because they have no AppSource registration for the GUID.

**Fix:** flip the per-visual source toggle in PBI Desktop from AppSource → Local.
Done. NOT a GUID issue, NOT a cache, NOT a code defect.

**Pre-submit hygiene that's still genuinely required:**
- [ ] apiVersion at the version you intend long-term (5.11.0+ for `AlignmentGroup`)
- [ ] capabilities.json: every property has `displayName` (modern format pane silently hides properties without it)
- [ ] Each settings.ts primitive slice has a matching capabilities.json entry (FontControl composites are the only exception)
- [ ] One alignment slice per card max (multiple `align` slices in the same card don't render reliably)

See `feedback_pbi_guid_locks_schema.md` for the misdiagnosis story (4 hours
chasing a GUID-lock theory before finding the source toggle).

## Build hygiene

- [ ] `pbiviz package` runs clean (no eslint errors)
- [ ] `pbiviz package --certification-audit --verbose` reports `0 external requests`
- [ ] `pbiviz.json` has populated `description`, `supportUrl`, `author.name`, `author.email`
- [ ] `version` is bumped from any prior submitted version

## Capabilities

- [ ] `supportsHighlight: true`
- [ ] `supportsKeyboardFocus: true`
- [ ] `supportsLandingPage: true`
- [ ] `supportsEmptyDataView: true`
- [ ] `supportsMultiVisualSelection: true`
- [ ] `tooltips.supportedTypes: { default: true, canvas: true }`
- [ ] `dataViewMappings.categories` uses `for: { in: <role> }` (filter participation)
- [ ] `dataReductionAlgorithm.top.count: 30000`
- [ ] `privileges: []` (no WebAccess unless explicitly required)

## Code patterns

- [ ] Single `contextmenu` listener on `options.element` (no overlay, no per-element duplicates)
- [ ] `selectionManager.showContextMenu({}, { x, y })` for empty-space menu
- [ ] `selectionManager.showContextMenu(dataPoint.selectionId, ...)` for data-point menu (only if data-point context menu is needed; default empty-space is enough for cert)
- [ ] `event.preventDefault()` after `showContextMenu`
- [ ] `renderEmpty()` fills the iframe when no data is bound
- [ ] Internal title rendered inside iframe (not relying on PBI auto-title)
- [ ] `tooltipService.show()` on `mousemove`; `.hide()` on `mouseleave`
- [ ] `selectionManager.select(id, ctrlKey)` on `click` for cross-filter
- [ ] `selectionManager.registerOnSelectCallback(() => {})` for deselect
- [ ] No `innerHTML` (use `removeChild` loop)
- [ ] No `eval` / `Function()` / external `<script>`
- [ ] No `position: fixed`
- [ ] `ISandboxExtendedColorPalette` cast for `isHighContrast`
- [ ] `eventService.renderingStarted` / `Finished` / `Failed` properly wrapped
- [ ] `destroy()` clears DOM and nulls references
- [ ] `prefers-reduced-motion: reduce` disables any animations

## Resize behaviour

- [ ] Drag the visual edge to a tiny size — content stays coherent (no overlap)
- [ ] Scroll bars appear once content exceeds the visual frame
- [ ] Right-click works at all sizes (header strip, body, padding zones)

## Sample `.pbix`

- [ ] **General > Padding = 0** on the visual instance (Format pane > General > Padding > 0/0/0/0). This is the dead-zone fix for Policy 1180.2.5.
- [ ] Sample has at least one textbox panel describing field wells + behaviour (Policy 1180.2.3.1)
- [ ] Sample saved with the latest visual binary loaded
- [ ] Three to five 1366×768 screenshots showing the visual in different states
- [ ] One 300×300 logo PNG

## Format pane testing

- [ ] Every alignment control responds (Left / Center / Right)
- [ ] Every font control responds (family / size / bold / italic / underline)
- [ ] Every colour picker responds (including conditional formatting drivers)
- [ ] Toggles disable/re-enable cleanly without breaking the visual
- [ ] Format pane changes apply immediately (no need to refresh)

## Verified live in Power BI Desktop

- [ ] Empty visual (no fields) shows landing copy, right-click works
- [ ] With fields bound, headline / label / subtitle / change pill render
- [ ] Tooltips show on hover
- [ ] Click cross-filters other visuals on the page
- [ ] Right-click anywhere in the visual shows the basic context menu

## Notes for certification (REQUIRED — 100.14.1)

Microsoft now hard-fails submissions with empty/insufficient Notes for Certification (status "Attention needed"). For **Advanced Certification** the GitHub source repo URL is mandatory.

- [ ] GitHub repository URL included in Notes for Certification field
- [ ] Build instructions (e.g. `npm install && pbiviz package`)
- [ ] API version stated (5.11.0+)
- [ ] License stated (MIT or similar)
- [ ] Verification instructions per policy: how reviewer should test 1180.2.2.2 tooltips, 1180.2.2.3 filter out, 1180.2.5 context menu
- [ ] Sample .pbix description — what data roles are pre-bound, how to exercise each cert-relevant interaction

Master template at `/mnt/plex-media/codex-pbiviz/Notes_For_Certification_Template_2026-05-05.md`.

## Resubmission notes (if a previous submission failed)

- [ ] Drafted "Notes for certification" text explaining root cause + fix
- [ ] Reference Policy ID(s) addressed
- [ ] Mention any soft failures from previous cert that are now resolved
