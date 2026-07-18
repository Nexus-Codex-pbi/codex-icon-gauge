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

import { toRgba } from "./shared/colorHelpers";
import { Theme, accentToken } from "./shared/bandEngine";
import { surfaceTokens } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { applyBorder } from "./shared/borderSettings";
import {
    IconGaugeCtx, bandFor, renderFillVessel, renderIconRow,
    renderTrafficLight, renderStateMorph, morphLabel, trafficLabel,
} from "./iconModes";

/** Luminance theme pick off the shared Background card (suite idiom). */
function themeFor(hex: string): Theme {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "light";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? "dark" : "light";
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
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private isHighContrast = false;
    private hcForeground = "";
    private hcBackground = "";
    private cornerSignature: CardSignatureHandle | null = null;

    constructor(options: VisualConstructorOptions) {
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
        this.target.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

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
        this.events.renderingStarted(options);
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
            while (this.rootDiv.firstChild) this.rootDiv.removeChild(this.rootDiv.firstChild);

            // ── Theme + suite chrome (Background paints the ROOT so one
            // background fills the tile; Border is CSS on the tile; corner
            // overlay refreshes to the theme accent) ──
            const background = this.formattingSettings.background;
            const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyPct = background.transparency.value ?? 100;
            const theme: Theme = themeFor(bgHex);

            // Title — render first so it's at the top of the iframe and captures
            // right-clicks where PBI's auto-title chrome would otherwise sit.
            this.renderTitle(theme);
            this.target.style.background = this.isHighContrast
                ? this.hcBackground : toRgba(bgHex, bgTransparencyPct);
            applyBorder(this.target, this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                palette: this.host.colorPalette,
                metadataObjects: undefined,
            });
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: accentToken(theme),
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                mirror: true,
                glowMix: this.isHighContrast ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            // Per-mode pane options surface only for their mode
            const ig = this.formattingSettings.iconGauge;
            const mode = String(ig.mode.value?.value || "fillVessel");
            ig.vessel.visible = mode === "fillVessel";
            ig.showGlyph.visible = mode === "trafficLight";
            ig.morphStyle.visible = mode === "stateMorph";

            const reading = dv ? this.parseReading(dv) : null;
            if (reading === null) {
                this.renderEmpty();
                this.events.renderingFinished(options);
                return;
            }

            this.renderGauge(reading, mode, theme, options.viewport.width, options.viewport.height);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    // ─── Title ─────────────────────────────────────────────────

    private renderTitle(theme: Theme): void {
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
        // Untouched default ink flips to the dark-theme text token (suite
        // idiom, same sentinel as Zone Gauge); a user-set colour is honoured.
        const set = t.titleColor?.value?.value;
        const c = set === "#1a1a2e" && theme === "dark" ? surfaceTokens("dark").text : set;
        if (c) el.style.color = this.isHighContrast ? this.hcForeground : c;
        this.rootDiv.appendChild(el);
    }

    // ─── Landing state ─────────────────────────────────────────
    // Without this, PBI's auto landing-page chrome sits over the iframe
    // and absorbs events. Even with a title shown, fill the body so
    // right-click reaches our DOM regardless of which region the cert
    // reviewer hits.

    private renderEmpty(): void {
        const wrap = document.createElement("div");
        wrap.className = "codex-visual-empty";
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
        if (!cat || !cat.categories || cat.categories.length === 0) return [];
        const labels = cat.categories[0];
        const valuesArr = cat.values || [];
        const findCol = (role: string) => valuesArr.find(v => v.source.roles && v.source.roles[role]);
        const valueCol = findCol("value");
        const tooltipCols = valuesArr.filter(v => v.source.roles && v.source.roles["tooltips"]);

        if (!valueCol) return [];

        const rows: RowData[] = [];
        const n = labels.values?.length ?? 0;
        for (let i = 0; i < n; i++) {
            const category = String(labels.values[i] ?? "");
            const raw = valueCol.values?.[i];
            const value = (typeof raw === "number") ? raw : (raw == null ? null : Number(raw));

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(labels, i)
                .createSelectionId();

            const tooltipItems: VisualTooltipDataItem[] = [
                { displayName: "Category", value: category },
            ];
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
        const target = (typeof rawT === "number") ? rawT : (rawT == null ? null : Number(rawT));
        return {
            value: rows[0].value,
            target: (target != null && isFinite(target)) ? target : null,
            targetFormat: targetCol?.source.format ?? null,
            row: rows[0],
        };
    }

    // ─── Render ────────────────────────────────────────────────

    private renderGauge(reading: Reading, mode: string, theme: Theme, width: number, height: number): void {
        const ig = this.formattingSettings.iconGauge;
        const vs = this.formattingSettings.valueStyle;
        const ls = this.formattingSettings.labelStyle;
        const hc = this.isHighContrast;

        const pct = (reading.target != null && reading.target !== 0)
            ? (reading.value / reading.target) * 100
            : reading.value;
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
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", String(Math.max(10, height - titleHeight)));
        svg.style.display = "block";
        const defs = document.createElementNS(svgNS, "defs") as SVGDefsElement;
        const group = document.createElementNS(svgNS, "g") as SVGGElement;
        svg.appendChild(defs);
        svg.appendChild(group);
        this.rootDiv.appendChild(svg);

        const surf = surfaceTokens(theme);
        const ctx: IconGaugeCtx = {
            group, defs,
            width, height: height - titleHeight, titleHeight: 0,
            theme, hc, hcFg: this.hcForeground, hcBg: this.hcBackground,
            pct, band,
            valText: `${Math.round(pct)}%`,
            subText,
            showValue: !!ig.showValue.value,
            showSub: !!ig.showSub.value,
            valueColor: vs.color.value.value || null,
            unitColor: ls.color.value.value || null,
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
        };
        void surf; // theme tokens flow through iconTokens inside the renderers

        switch (mode) {
            case "iconRow": renderIconRow(ctx); break;
            case "trafficLight": renderTrafficLight(ctx); break;
            case "stateMorph": renderStateMorph(ctx); break;
            default: renderFillVessel(ctx); break;
        }

        // Interactions: tooltip + click-to-filter on the whole gauge
        const row = reading.row;
        svg.addEventListener("mousemove", (e: MouseEvent) => {
            this.tooltipService.show({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: row.tooltipItems,
                identities: row.selectionId ? [row.selectionId] : [],
            });
        });
        svg.addEventListener("mouseleave", () => {
            this.tooltipService.hide({ isTouchEvent: false, immediately: false });
        });
        svg.addEventListener("click", (e: MouseEvent) => {
            if (row.selectionId) this.selectionManager.select(row.selectionId, e.ctrlKey || e.metaKey);
            e.stopPropagation();
        });
    }

    // ─── Number formatting (PBI format-string aware) ──────────

    private formatValue(n: number, format: string | null): string {
        if (n == null || !isFinite(n)) return String(n ?? "");
        if (!format) return n.toLocaleString(undefined);
        if (format.indexOf("%") >= 0) {
            const m = format.match(/0\.(0+)%/);
            const dec = m ? m[1].length : 0;
            return `${(n * 100).toFixed(dec)}%`;
        }
        const cm = format.match(/^([^#0]*)(#[,#]*0(?:\.0+)?)/);
        if (cm && cm[1] && /[\$£€¥]/.test(cm[1])) {
            const sym = cm[1].trim();
            const dm = format.match(/\.([0]+)/);
            const dec = dm ? dm[1].length : 0;
            return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
        }
        const dm = format.match(/\.([0#]+)/);
        const dec = dm ? dm[1].replace(/#/g, "").length : 0;
        return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    // ─── Lifecycle ─────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        while (this.rootDiv && this.rootDiv.firstChild) this.rootDiv.removeChild(this.rootDiv.firstChild);
        this.rootDiv = null;
        this.target = null;
    }
}
