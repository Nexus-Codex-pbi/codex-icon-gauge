"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel, textAlignFor } from "./settings";

import { toRgba, compositeOver, contrastInk, contrastRatio, mutedInk } from "./shared/colorHelpers";
import { Theme, accentToken } from "./shared/bandEngine";
import { surfaceTokens } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { resolveCodexTheme, neonColorFor, ResolvedCodexTheme, flareHexFor } from "./shared/codexThemeSettings";
import { applyBorder } from "./shared/borderSettings";
import {
    IconGaugeCtx, bandFor, iconTokens, renderFillVessel, renderIconRow,
    renderTrafficLight, renderStateMorph, morphLabel, trafficLabel, fitGaugeContents,
} from "./iconModes";
import { LicenseGate } from "./shared/licensing";
import { formatModelNumber } from "./shared/numberFormat";

/** A reading is a number only when it is present AND finite. Blank strings,
 *  non-numeric text, Infinity and NaN are GAPS, not zeros: `Number("")` is 0
 *  and `Number("Infinity")` is finite-looking to a null check, which rendered
 *  `NaN%` and a success-coloured `Infinity%` (NEXUS cycle-06 §7). */
function finiteOrNull(raw: unknown): number | null {
    if (raw == null) return null;
    if (typeof raw === "number") return isFinite(raw) ? raw : null;
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number(raw);
    return isFinite(n) ? n : null;
}

interface RowData {
    category: string;
    value: number | null;
    valueFormat: string | null;
    selectionId: ISelectionId | null;
    tooltipItems: VisualTooltipDataItem[];
}

interface Reading {
    value: number;
    pct: number;
    target: number | null;
    targetFormat: string | null;
    row: RowData;
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private target: HTMLElement;
    private rootDiv: HTMLDivElement;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;
    private localizationManager: ILocalizationManager;
    private formattingSettings = new VisualFormattingSettingsModel();
    private formattingSettingsService: FormattingSettingsService;
    private isHighContrast = false;
    private hcForeground = "";
    private hcBackground = "";
    private cornerSignature: CardSignatureHandle | null = null;
    private gaugeElement: SVGSVGElement | null = null;
    private gaugeRow: RowData | null = null;
    private gaugeListeners: AbortController | null = null;
    private destroyed = false;
    private readonly contextMenuHandler = (e: MouseEvent): void => {
        const identity = this.gaugeElement?.contains(e.target as Node) ? this.gaugeRow?.selectionId : null;
        this.selectionManager.showContextMenu(identity || {}, { x: e.clientX, y: e.clientY });
        e.preventDefault();
    };

    private licenseGate: LicenseGate;

    private lastUpdateOptions: VisualUpdateOptions | null = null;


    constructor(options: VisualConstructorOptions) {

        // NO FREE TIER — an unlicensed user gets the whole visual blocked.

        // The check is async, so re-run the last update once it resolves.

        this.licenseGate = new LicenseGate(options.host, () => {

            if (this.lastUpdateOptions) this.update(this.lastUpdateOptions);

        });
        this.host = options.host;
        this.target = options.element;
        this.target.style.margin = "0";
        this.target.style.padding = "0";
        this.target.style.overflow = "hidden";
        this.events = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.localizationManager = this.host.createLocalizationManager();
        this.formattingSettingsService = new FormattingSettingsService();

        // ── Single contextmenu listener on options.element ──
        // Policy 1180.2.5: matches MS sample BarChart pattern.
        // No overlay, no per-element duplicates (those double-fire and
        // break showContextMenu rendering).
        this.target.addEventListener("contextmenu", this.contextMenuHandler);

        // Root carries the suite chrome (fill-tile background, Border card,
        // corner accents): border stays inside the tile and anchors the
        // absolutely-positioned corner overlay.
        this.target.style.boxSizing = "border-box";
        this.target.style.position = "relative";

        // ── Root container ──
        this.rootDiv = document.createElement("div");
        this.rootDiv.className = "codex-visual-root";
        this.target.appendChild(this.rootDiv);

        // Corner-bracket card signature (suite kit) — overlays the tile,
        // pointer-events:none, refreshed per render.
        this.cornerSignature = makeCornerBrackets(
            this.target,
            accentToken("dark"),
            { variant: "cornerBracket", mirror: true }
        );

        // Allow deselection (no-op callback registers the manager properly).
        this.selectionManager.registerOnSelectCallback(() => { /* noop */ });
    }

    public update(options: VisualUpdateOptions): void {
        if (this.destroyed) return;
        this.events.renderingStarted(options);
        this.lastUpdateOptions = options;

        if (this.licenseGate.blockedThisFrame()) {
            this.target.style.display = "none";
            this.events.renderingFinished(options);
            return;
        }
        this.target.style.display = "";
        try {
            // High contrast detection (cast required for ISandboxExtendedColorPalette).
            const colorPalette = this.host.colorPalette as ISandboxExtendedColorPalette;
            this.isHighContrast = !!colorPalette.isHighContrast;
            if (this.isHighContrast) {
                this.hcForeground = colorPalette.foreground.value;
                this.hcBackground = colorPalette.background.value;
            }

            const dv: DataView | undefined = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

            // Clear root.
            this.gaugeListeners?.abort();
            this.gaugeListeners = null;
            this.gaugeElement = null;
            this.gaugeRow = null;
            while (this.rootDiv.firstChild) this.rootDiv.removeChild(this.rootDiv.firstChild);

            // ── Theme + suite chrome (Background paints the ROOT so one
            // background fills the tile; Border is CSS on the tile; corner
            // overlay refreshes to the theme accent) ──
            const background = this.formattingSettings.background;
            const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyPct = background.transparency.value ?? 100;
            // Adaptive ink must be judged against the surface a viewer actually
            // sees, not the raw Background swatch: the fill is painted WITH its
            // transparency, so a white tile at 100% transparency over a dark page
            // is a dark surface and needs light ink (NEXUS cycle-06 §2, class 1).
            // What sits behind is the host theme's background; this visual paints
            // nothing else beneath its own tile.
            const behindHex = colorPalette.background?.value || "#ffffff";
            let visibleSurface = this.isHighContrast
                ? this.hcBackground
                : compositeOver(bgHex, bgTransparencyPct, behindHex);
            // The ink is then MEASURED against that surface rather than bucketed
            // by luminance. A Rec.601 tone bucket re-inked opaque mid-grey tiles
            // sitting near its threshold and misread saturated hues (#01bfe3
            // buckets "dark" yet carries the dark ink at 8.3:1 against the light
            // ink's 1.8:1). contrastInk() returns whichever of the two ink tokens
            // the theme already provides wins on WCAG contrast; the theme then
            // follows its own ink so chrome and text stay one palette.
            const lightSurfaceInk = iconTokens("light").val;   // #14141f
            const darkSurfaceInk = iconTokens("dark").val;     // #e8e6ff
            const autoInk = contrastInk(visibleSurface, lightSurfaceInk, darkSurfaceInk);
            const autoTheme: Theme = autoInk === lightSurfaceInk ? "light" : "dark";
            // ── Nexus Codex Theme (#819): ONE switch above the automatic pick ──
            // Auto returns exactly the values derived above (the shipped render).
            // Dark/Light/Neon paint the Codex card surface at the card's own
            // Surface Transparency and force the token set; the resolver has
            // already collapsed to Auto under high contrast, so there is no HC
            // branch here. Resolved ONCE and routed through the renderers.
            const codex = resolveCodexTheme(this.formattingSettings.codexTheme, {
                hcActive: this.isHighContrast,
                autoTheme,
                autoBgHex: bgHex,
                autoTransparencyPct: bgTransparencyPct,
                behindHex,
            });
            const theme: Theme = codex.theme;
            // A forced mode OWNS the text inks: a pane ink chosen for a white
            // tile is not a choice about the Codex dark surface. The helpers do
            // not change — contrastInk/mutedInk simply judge against the Codex
            // surface instead of the user's. Band, accent and fx colours stay
            // the user's.
            const inkOverride = codex.mode !== "auto";
            if (inkOverride) visibleSurface = codex.surfaceHex;
            const tokenInk = inkOverride
                ? contrastInk(visibleSurface, lightSurfaceInk, darkSurfaceInk)
                : autoInk;
            // Both brand inks can miss small-text contrast on mid-grey.
            const headlineInk = contrastRatio(tokenInk, visibleSurface) >= 4.5
                ? tokenInk : contrastInk(visibleSurface, "#000000", "#ffffff");
            // The status line is de-emphasised, not faint: the fixed muted token
            // sat at 1.2-1.9:1 on a mid-grey tile whichever theme was picked,
            // because both muted tokens are themselves mid-greys. Derive it from
            // the ink we just chose instead — mixed toward the surface for the
            // de-emphasis, backed off until it clears 4.5:1 (NEXUS cycle-06 §2,
            // round 2). HC still overrides with the system foreground.
            const statusInk = mutedInk(headlineInk, visibleSurface);

            // Title — render first so it's at the top of the iframe and captures
            // right-clicks where PBI's auto-title chrome would otherwise sit.
            this.renderTitle(headlineInk, inkOverride);
            this.target.style.background = this.isHighContrast
                ? this.hcBackground : toRgba(codex.bgHex, codex.transparencyPct);
            applyBorder(this.target, this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                palette: this.host.colorPalette,
                metadataObjects: undefined,
            });
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: neonColorFor(accentToken(theme), codex),
                flareHex: flareHexFor(codex),
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                mirror: true,
                glowMix: this.isHighContrast ? 0
                    : codex.neon ? codex.glow : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            // Per-mode pane options surface only for their mode
            const ig = this.formattingSettings.iconGauge;
            const mode = String(ig.mode.value?.value || "fillVessel");
            ig.vessel.visible = mode === "fillVessel";
            ig.showGlyph.visible = mode === "trafficLight";
            ig.morphStyle.visible = mode === "stateMorph";

            const reading = dv ? this.parseReading(dv) : null;
            const readingKey = reading?.row.selectionId?.getKey();
            const selectedIds = this.selectionManager.getSelectionIds() as ISelectionId[];
            if (selectedIds.some(id => id.getKey() !== readingKey)) {
                this.selectionManager.clear();
            }
            if (reading === null) {
                this.renderEmpty(statusInk);
                this.events.renderingFinished(options);
                return;
            }

            this.renderGauge(reading, mode, theme, headlineInk, statusInk, codex, inkOverride,
                options.viewport.width, options.viewport.height);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    // ─── Title ─────────────────────────────────────────────────

    private renderTitle(headlineInk: string, inkOverride: boolean): void {
        const t = this.formattingSettings.titleSettings;
        if (!t?.showTitle?.value || !t?.titleText?.value) return;
        const el = document.createElement("div");
        el.className = "codex-visual-title";
        el.textContent = t.titleText.value;
        if (t.titleFontFamily?.value) el.style.fontFamily = t.titleFontFamily.value;
        if (t.titleFontSize?.value) el.style.fontSize = `${t.titleFontSize.value}px`;
        el.style.fontWeight = t.titleBold?.value ? "700" : "400";
        el.style.fontStyle = t.titleItalic?.value ? "italic" : "normal";
        el.style.textDecoration = t.titleUnderline?.value ? "underline" : "none";
        el.style.textAlign = textAlignFor(t.titleAlign?.value as string);
        // Default title ink follows the measured surface; custom ink is retained
        // EXCEPT under a forced Codex mode, which owns the ink for its surface.
        const set = t.titleColor?.value?.value;
        const c = inkOverride || !set || set === "#1a1a2e" ? headlineInk : set;
        if (c) el.style.color = this.isHighContrast ? this.hcForeground : c;
        this.rootDiv.appendChild(el);
    }

    // ─── Landing state ─────────────────────────────────────────
    // Without this, PBI's auto landing-page chrome sits over the iframe
    // and absorbs events. Even with a title shown, fill the body so
    // right-click reaches our DOM regardless of which region the cert
    // reviewer hits.

    private renderEmpty(ink: string): void {
        const wrap = document.createElement("div");
        wrap.className = "codex-visual-empty";
        wrap.style.color = this.isHighContrast ? this.hcForeground : ink;
        const h = document.createElement("div");
        h.className = "codex-visual-empty-title";
        h.textContent = this.localizationManager.getDisplayName("Visual_Short_Description") || "Codex Visual";
        const p = document.createElement("div");
        p.className = "codex-visual-empty-body";
        p.textContent = this.localizationManager.getDisplayName("Visual_Landing_Message")
            || "Bind data to begin.";
        wrap.appendChild(h);
        wrap.appendChild(p);
        this.rootDiv.appendChild(wrap);
    }

    // ─── Data parsing ──────────────────────────────────────────

    private parseRows(dv: DataView): RowData[] {
        const cat = dv.categorical;
        if (!cat) return [];
        const labels = cat.categories?.[0];
        const valuesArr = cat.values || [];
        const findCol = (role: string) => valuesArr.find(v => v.source.roles && v.source.roles[role]);
        const valueCol = findCol("value");
        const tooltipCols = valuesArr.filter(v => v.source.roles && v.source.roles["tooltips"]);

        if (!valueCol) return [];

        const rows: RowData[] = [];
        const n = labels ? labels.values?.length ?? 0 : Math.min(1, valueCol.values?.length ?? 0);
        for (let i = 0; i < n; i++) {
            const category = String(labels?.values[i] ?? "");
            const raw = valueCol.values?.[i];
            const value = finiteOrNull(raw);

            const selectionId = labels ? this.host.createSelectionIdBuilder()
                .withCategory(labels, i)
                .createSelectionId() : null;

            const tooltipItems: VisualTooltipDataItem[] = labels ? [
                { displayName: "Category", value: category },
            ] : [];
            if (value != null) {
                tooltipItems.push({
                    displayName: valueCol.source.displayName,
                    value: this.formatValue(value, valueCol.source.format),
                });
            }
            for (const tc of tooltipCols) {
                const v = tc.values?.[i];
                if (v != null) {
                    tooltipItems.push({
                        displayName: tc.source.displayName,
                        value: this.formatValue(v as number, tc.source.format),
                    });
                }
            }

            rows.push({
                category,
                value,
                valueFormat: valueCol.source.format ?? null,
                selectionId,
                tooltipItems,
            });
        }
        return rows;
    }

    // ─── Reading (single value + target) ───────────────────────

    private parseReading(dv: DataView): Reading | null {
        const rows = this.parseRows(dv);
        if (rows.length === 0 || rows[0].value == null) return null;
        const valuesArr = dv.categorical?.values || [];
        const targetCol = valuesArr.find(v => v.source.roles && v.source.roles["target"]);
        const rawT = targetCol?.values?.[0];
        const target = finiteOrNull(rawT);
        const value = rows[0].value;
        const pct = target != null && target !== 0 ? (value / target) * 100 : value;
        if (!Number.isFinite(pct)) return null;
        return {
            value,
            pct,
            target,
            targetFormat: targetCol?.source.format ?? null,
            row: rows[0],
        };
    }

    // ─── Render ────────────────────────────────────────────────

    private renderGauge(reading: Reading, mode: string, theme: Theme, headlineInk: string, statusInk: string,
        codex: ResolvedCodexTheme, inkOverride: boolean, width: number, height: number): void {
        const ig = this.formattingSettings.iconGauge;
        const vs = this.formattingSettings.valueStyle;
        const ls = this.formattingSettings.labelStyle;
        const hc = this.isHighContrast;

        const pct = reading.pct;
        const band = bandFor(reading.value, reading.target);
        const style = String(ig.morphStyle.value?.value || "faces");

        // Real-data status line per mode (no placeholder copy)
        const fmtV = this.formatValue(reading.value, reading.row.valueFormat);
        const fmtT = reading.target != null ? this.formatValue(reading.target, reading.targetFormat) : "";
        let subText: string;
        if (mode === "trafficLight") subText = trafficLabel(band);
        else if (mode === "stateMorph") subText = morphLabel(style, band);
        else if (reading.target != null) {
            subText = pct > 100
                ? `${fmtV} · ${Math.round(pct - 100)}% over ${fmtT} target`
                : `${fmtV} of ${fmtT} target`;
        } else subText = reading.row.category || "";

        // SVG host below the title
        const titleEl = this.rootDiv.querySelector(".codex-visual-title") as HTMLElement | null;
        const titleHeight = titleEl ? (titleEl.offsetHeight || 0) : 0;
        const bodyHeight = Math.max(0, this.rootDiv.clientHeight - titleHeight);
        const bodyWidth = Math.max(0, this.rootDiv.clientWidth);
        const textFits = bodyHeight >= 64 && bodyWidth >= 64;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", String(bodyHeight));
        svg.setAttribute("class", "codex-gauge");
        svg.setAttribute("role", reading.row.selectionId ? "button" : "img");
        svg.setAttribute("aria-label", [reading.row.category, `${Math.round(pct)}%`, subText].filter(Boolean).join(", "));
        if (reading.row.selectionId) svg.setAttribute("tabindex", "0");
        svg.style.color = hc ? this.hcForeground : headlineInk;
        svg.style.display = "block";
        svg.style.flexShrink = "0";
        const defs = document.createElementNS(svgNS, "defs") as SVGDefsElement;
        const group = document.createElementNS(svgNS, "g") as SVGGElement;
        svg.appendChild(defs);
        svg.appendChild(group);
        this.rootDiv.appendChild(svg);

        const surf = surfaceTokens(theme);
        const ctx: IconGaugeCtx = {
            group, defs,
            width: bodyWidth, height: bodyHeight, titleHeight: 0,
            theme, hc, hcFg: this.hcForeground, hcBg: this.hcBackground,
            pct, band,
            valText: `${Math.round(pct)}%`,
            subText,
            showValue: textFits && !!ig.showValue.value,
            showSub: textFits && !!ig.showSub.value,
            // A forced Codex mode owns these two inks: null routes the headline
            // through headlineInk and the status line through statusInk, both
            // measured against the Codex surface (contrastInk / mutedInk).
            valueColor: inkOverride ? null : (vs.color.value.value || null),
            unitColor: inkOverride ? null : (ls.color.value.value || null),
            valueAlign: String(vs.align.value),
            unitAlign: String(ls.align.value),
            statusInk,
            headlineInk,
            valueFont: {
                family: vs.fontFamily.value || null,
                size: vs.fontSize.value || null,
                bold: !!vs.bold.value, italic: !!vs.italic.value, underline: !!vs.underline.value,
            },
            unitFont: {
                family: ls.fontFamily.value || null,
                size: ls.fontSize.value || null,
                bold: !!ls.bold.value, italic: !!ls.italic.value, underline: false,
            },
            vessel: String(ig.vessel.value?.value || "bolt"),
            showGlyph: !!ig.showGlyph.value,
            morphStyle: style,
            codex,
        };
        void surf; // theme tokens flow through iconTokens inside the renderers

        switch (mode) {
            case "iconRow": renderIconRow(ctx); break;
            case "trafficLight": renderTrafficLight(ctx); break;
            case "stateMorph": renderStateMorph(ctx); break;
            default: renderFillVessel(ctx); break;
        }
        fitGaugeContents(ctx);

        // Interactions: tooltip + click-to-filter on the whole gauge
        const row = reading.row;
        this.gaugeElement = svg;
        this.gaugeRow = row;
        this.gaugeListeners = new AbortController();
        const listenerOptions = { signal: this.gaugeListeners.signal };
        svg.addEventListener("mousemove", (e: MouseEvent) => {
            this.tooltipService.show({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: row.tooltipItems,
                identities: row.selectionId ? [row.selectionId] : [],
            });
        }, listenerOptions);
        svg.addEventListener("mouseleave", () => {
            this.tooltipService.hide({ isTouchEvent: false, immediately: false });
        }, listenerOptions);
        svg.addEventListener("click", (e: MouseEvent) => {
            if (row.selectionId) this.selectionManager.select(row.selectionId, e.ctrlKey || e.metaKey);
            e.stopPropagation();
        }, listenerOptions);
        svg.addEventListener("keydown", (e: KeyboardEvent) => {
            if (row.selectionId && (e.key === "Enter" || e.key === " ")) {
                this.selectionManager.select(row.selectionId, e.ctrlKey || e.metaKey);
                e.preventDefault();
                e.stopPropagation();
            }
        }, listenerOptions);
    }

    // ─── Number formatting (PBI format-string aware) ──────────

    private formatValue(n: number, format: string | null): string {
        if (n == null || !isFinite(n)) return String(n ?? "");
        // Optional `#` digits are honoured: a single derived count used as both
        // min and max rendered `0.##` 12.34 as "12" (NEXUS cycle-02 F3).
        return formatModelNumber(n, format);
    }

    // ─── Lifecycle ─────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        this.formattingSettings.codexTheme.reveal();
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        // Drop the in-flight licence check FIRST: its redraw callback replays
        // update() against a torn-down target otherwise (NEXUS lifecycle finding).
        this.licenseGate.dispose();
        if (this.destroyed) return;
        this.destroyed = true;
        this.lastUpdateOptions = null;
        this.gaugeListeners?.abort();
        this.gaugeListeners = null;
        this.gaugeElement = null;
        this.gaugeRow = null;
        this.target.removeEventListener("contextmenu", this.contextMenuHandler);
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        this.rootDiv.replaceChildren();
        this.rootDiv.remove();
        this.rootDiv = null;
        this.target = null;
    }
}
