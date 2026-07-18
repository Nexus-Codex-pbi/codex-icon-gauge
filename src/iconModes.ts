"use strict";

/* ─── Codex Icon Gauge — the four display modes ─────────────────────────────
 * Geometry, tokens, gradients and state logic ported VERBATIM from the
 * normative board: docs/design-session-2026-07-09/Codex Icon Gauge.dc.html
 * (vessel path dict, star path, traffic-light housing, morph variants, and
 * the dk/lt CSS custom-property blocks). The board is the spec
 * (feedback_pbi_design_board_is_look_source).
 */

import { select, Selection } from "d3-selection";
import { Theme } from "./shared/bandEngine";

export type Band = "succ" | "warn" | "dang";

export interface FontOpts {
    family: string | null;
    size: number | null;   // null/0 = board-proportional
    bold: boolean;
    italic: boolean;
    underline: boolean;
}

export interface IconGaugeCtx {
    group: SVGGElement;
    defs: SVGDefsElement;
    width: number;
    height: number;
    titleHeight: number;
    theme: Theme;
    hc: boolean;
    hcFg: string;
    hcBg: string;
    pct: number;            // value as % of target (or raw value if no target)
    band: Band;             // succ ≥ target · warn ≥ 0.9×target · dang below
    valText: string;
    subText: string;        // real data line (never placeholder copy)
    showValue: boolean;
    showSub: boolean;
    valueColor: string | null;  // null = theme token
    unitColor: string | null;
    valueFont: FontOpts;
    unitFont: FontOpts;
    vessel: string;         // fill-vessel shape key
    showGlyph: boolean;     // traffic light colour-blind glyph
    morphStyle: string;     // faces | thumbs | tickCross
}

/* ─── Board token maps (.dk / .lt) ────────────────────────────────────────── */
export interface IconTokens {
    val: string; unit: string; accent: string;
    sg: string; sa: string; sm: string;
    vtrack: string; vedge: string;
    house: string; housebd: string; facefeat: string;
    lampdim: string; socket: string; glyph: string;
    glow: boolean;
}

export function iconTokens(theme: Theme): IconTokens {
    return theme === "dark" ? {
        val: "#e8e6ff", unit: "#8f8ab8", accent: "#00d9ff",
        sg: "#8aff2b", sa: "#ffb020", sm: "#ff3b52",
        vtrack: "#1b1b38", vedge: "rgba(255,255,255,0.28)",
        house: "#12122a", housebd: "rgba(124,58,237,0.4)", facefeat: "#07071a",
        lampdim: "#181830", socket: "#05050f", glyph: "#0a0a12",
        glow: true,
    } : {
        val: "#14141f", unit: "#5b5b74", accent: "#0384a3",
        sg: "#1f8a3b", sa: "#a85f00", sm: "#c81d6b",
        vtrack: "#e2e4ef", vedge: "rgba(0,0,0,0.24)",
        house: "#15152e", housebd: "rgba(0,0,0,0.25)", facefeat: "#ffffff",
        lampdim: "#181830", socket: "#05050f", glyph: "#0a0a12",
        glow: false,
    };
}

export function bandFor(value: number, target: number | null): Band {
    if (target == null || target === 0) return value >= 100 ? "succ" : value >= 90 ? "warn" : "dang";
    return value >= target ? "succ" : value >= 0.9 * target ? "warn" : "dang";
}

export function stateColor(t: IconTokens, band: Band): string {
    return band === "succ" ? t.sg : band === "warn" ? t.sa : t.sm;
}

/* ─── Board vessel path dict (verbatim) ───────────────────────────────────── */
const VESSELS: Record<string, string> = {
    bolt: "M62 0 L18 72 L46 72 L34 130 L86 52 L56 52 Z",
    battery: "M18 20 H82 A8 8 0 0 1 90 28 V122 A8 8 0 0 1 82 130 H18 A8 8 0 0 1 10 122 V28 A8 8 0 0 1 18 20 Z M40 8 H60 V20 H40 Z",
    droplet: "M50 2 C70 38 88 64 88 92 A38 38 0 1 1 12 92 C12 64 30 38 50 2 Z",
    heart: "M70 130 C58 116 20 88 8 62 C0 48 0 26 12 12 C24 0 46 2 56 14 C62 21 68 28 70 38 C72 28 78 21 84 14 C94 2 116 0 128 12 C140 26 140 48 132 62 C120 88 82 116 70 130 Z",
    person: "M30 26 A20 20 0 1 1 70 26 A20 20 0 1 1 30 26 Z M50 54 C26 54 12 72 12 100 L12 118 C12 125 17 130 24 130 L76 130 C83 130 88 125 88 118 L88 100 C88 72 74 54 50 54 Z",
    thumb: "M10 62 H28 V124 H10 Z M34 124 V64 C42 58 50 44 52 28 C53 18 66 16 68 26 C69 34 64 46 60 56 L88 56 C94 56 98 61 98 68 L94 116 C93 121 89 124 84 124 Z",
};
const STAR = "M17 1 L22 12 L34 13 L25 21 L28 33 L17 27 L6 33 L9 21 L0 13 L12 12 Z";

/* ─── Defs: traffic-light lamp gradients + glow filters (board verbatim) ──── */
export function ensureIconDefs(defs: SVGDefsElement): void {
    const d = select(defs);
    if (!d.select("#igTlRed").empty()) return;
    const lamp = (id: string, stops: [string, string][]) => {
        const g = d.append("radialGradient").attr("id", id).attr("cx", "38%").attr("cy", "32%").attr("r", "72%");
        stops.forEach(([off, col]) => g.append("stop").attr("offset", off).attr("stop-color", col));
    };
    lamp("igTlRed", [["0", "#ffd9de"], ["0.5", "#ff3b52"], ["1", "#a5081f"]]);
    lamp("igTlAmber", [["0", "#fff0cf"], ["0.5", "#ffb020"], ["1", "#b56a00"]]);
    lamp("igTlGreen", [["0", "#eaffce"], ["0.5", "#8aff2b"], ["1", "#3aa300"]]);
    const glow = (id: string, colour: string) => {
        d.append("filter").attr("id", id)
            .attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%")
            .append("feDropShadow").attr("dx", 0).attr("dy", 0).attr("stdDeviation", 5)
            .attr("flood-color", colour).attr("flood-opacity", 0.9);
    };
    glow("igGlowRed", "#ff3b52");
    glow("igGlowAmber", "#ffb020");
    glow("igGlowGreen", "#8aff2b");
}

/* ─── Shared plumbing ─────────────────────────────────────────────────────── */
const SEGOE = "Segoe UI, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";


function applyFont(sel: any, f: FontOpts, boardPx: number, fallbackWeight: string): void {
    sel.style("font-family", f.family || SEGOE)
        .style("font-size", `${(f.size && f.size > 0) ? f.size : boardPx}px`)
        .style("font-weight", f.bold ? "700" : fallbackWeight)
        .style("font-style", f.italic ? "italic" : "normal")
        .style("text-decoration", f.underline ? "underline" : "none");
}

function fitGroup(ctx: IconGaugeCtx, designW: number, designH: number): Selection<SVGGElement, unknown, null, undefined> {
    const sel = select(ctx.group);
    sel.selectAll("*").remove();
    const availH = Math.max(10, ctx.height - ctx.titleHeight);
    const m = Math.max(12, Math.min(ctx.width, availH) * 0.07);
    const iw = Math.max(10, ctx.width - 2 * m);
    const ih = Math.max(10, availH - 2 * m);
    const s = Math.min(iw / designW, ih / designH);
    const tx = (ctx.width - designW * s) / 2;
    const ty = ctx.titleHeight + (availH - designH * s) / 2;
    return sel.append("g").attr("transform", `translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
}


function valueLine(g: any, ctx: IconGaugeCtx, t: IconTokens, x: number, yVal: number, ySub: number, boardValPx: number): void {
    if (!ctx.showValue) return;
    const vt = g.append("text").attr("x", x).attr("y", yVal).attr("text-anchor", "middle")
        .attr("fill", ctx.hc ? ctx.hcFg : (ctx.valueColor || t.val))
        .style("font-feature-settings", '"tnum"')
        .text(ctx.valText);
    applyFont(vt, ctx.valueFont, boardValPx, "700");
    if (ctx.showSub && ctx.subText) {
        const ut = g.append("text").attr("x", x).attr("y", ySub).attr("text-anchor", "middle")
            .attr("fill", ctx.hc ? ctx.hcFg : (ctx.unitColor || t.unit))
            .style("letter-spacing", "0.06em")
            .text(ctx.subText);
        applyFont(ut, ctx.unitFont, 12, "600");
    }
}

/* ─── Mode 1: Fill Vessel (board viewBox 200×222) ─────────────────────────── */
export function renderFillVessel(ctx: IconGaugeCtx): void {
    const t = iconTokens(ctx.theme);
    const g = fitGroup(ctx, 200, 222);
    const hc = ctx.hc, fg = ctx.hcFg;
    const vessel = VESSELS[ctx.vessel] ? ctx.vessel : "bolt";
    const vesselD = VESSELS[vessel];
    const vesselT = vessel === "heart" ? "translate(30,26)" : "translate(50,26)";
    const fillFrac = Math.max(0, Math.min(ctx.pct / 100, 1));
    const fillH = +(fillFrac * 130).toFixed(2);
    const fillTop = +(156 - fillH).toFixed(2);
    const clr = hc ? fg : stateColor(t, ctx.band);

    // Clip the fill to the vessel silhouette
    const clipId = `igClip${Math.round(fillFrac * 1000)}${vessel}`;
    const defs = select(ctx.defs);
    defs.select(`#${clipId}`).remove();
    defs.append("clipPath").attr("id", clipId)
        .append("path").attr("d", vesselD).attr("transform", vesselT);

    const clipped = g.append("g").attr("clip-path", `url(#${clipId})`);
    clipped.append("rect").attr("x", 50).attr("y", 26).attr("width", 100).attr("height", 130)
        .attr("fill", hc ? "none" : t.vtrack);

    const liquid = vessel === "heart" || vessel === "droplet";
    if (vessel === "battery") {
        // 5 discrete cells (board segH 16.4, gap 4, local x68 w64)
        const lit = Math.round(fillFrac * 5), segH = 16.4, gap = 4;
        for (let i = 0; i < lit; i++) {
            const yLocal = 124 - (i + 1) * segH - i * gap;
            clipped.append("rect").attr("x", 68).attr("y", +(26 + yLocal).toFixed(2))
                .attr("width", 64).attr("height", segH).attr("rx", 2).attr("fill", clr);
        }
    } else if (liquid && fillFrac > 0.03 && fillFrac < 0.98) {
        const y = +(fillTop + 5).toFixed(2);
        clipped.append("path")
            .attr("d", `M30 ${y} C52 ${y - 7} 74 ${y + 5} 100 ${y} C126 ${y - 5} 148 ${y + 7} 170 ${y} L170 ${y + 9} L30 ${y + 9} Z`)
            .attr("fill", clr);
        clipped.append("rect").attr("x", 30).attr("y", y + 8).attr("width", 140)
            .attr("height", Math.max(fillH - 13, 0)).attr("rx", 2).attr("fill", clr);
    } else if (fillH > 0) {
        clipped.append("rect").attr("x", 30).attr("y", fillTop).attr("width", 140)
            .attr("height", fillH).attr("rx", 2).attr("fill", clr);
    }

    g.append("path").attr("d", vesselD).attr("transform", vesselT)
        .attr("fill", "none").attr("stroke", hc ? fg : t.vedge)
        .attr("stroke-width", 2.5).attr("stroke-linejoin", "round");
    const hlD = vessel === "heart" ? "M20 44 C19 28 28 14 42 10"
        : vessel === "droplet" ? "M24 96 C22 82 28 64 38 48" : "";
    if (hlD && !hc) {
        g.append("path").attr("d", hlD).attr("transform", vesselT)
            .attr("fill", "none").attr("stroke", "rgba(255,255,255,0.7)")
            .attr("stroke-width", 5).attr("stroke-linecap", "round");
    }
    valueLine(g, ctx, t, 100, 188, 206, 30);
}

/* ─── Mode 2: Icon Row (board viewBox 200×150, 5 stars) ───────────────────── */
export function renderIconRow(ctx: IconGaugeCtx): void {
    const t = iconTokens(ctx.theme);
    const g = fitGroup(ctx, 200, 150);
    const hc = ctx.hc, fg = ctx.hcFg;
    const rating = Math.max(0, Math.min(ctx.pct / 100, 1)) * 5;
    // Whole stars advance by the 38px pitch; the partial star fills its actual
    // 34px glyph width (board's rating/5*180 left the 5th star tip unfilled at 5.0).
    const whole = Math.floor(rating);
    const rowFillW = +(whole * 38 + (rating - whole) * 34).toFixed(2);
    const clr = hc ? fg : stateColor(t, ctx.band);

    const track = g.append("g").attr("transform", "translate(10,40)");
    for (let i = 0; i < 5; i++) {
        track.append("path").attr("d", STAR).attr("transform", `translate(${i * 38},0)`)
            .attr("fill", hc ? "none" : t.vtrack)
            .attr("stroke", hc ? fg : "none").attr("stroke-width", hc ? 1.5 : 0);
    }
    const clipId = `igRowClip${Math.round(rowFillW)}`;
    const defs = select(ctx.defs);
    defs.select(`#${clipId}`).remove();
    defs.append("clipPath").attr("id", clipId)
        .append("rect").attr("x", 10).attr("y", 38).attr("width", rowFillW).attr("height", 44);
    // Clip on an UNTRANSLATED wrapper: a group's own transform moves its clip-path
    // with it, which shoved the board's y38 clip window below the y1-33 stars and
    // clipped the whole fill layer away (the all-track-colour bug).
    const fill = g.append("g").attr("clip-path", `url(#${clipId})`)
        .append("g").attr("transform", "translate(10,40)");
    for (let i = 0; i < 5; i++) {
        fill.append("path").attr("d", STAR).attr("transform", `translate(${i * 38},0)`).attr("fill", clr);
    }
    // Board texts at y116/134 with rating readout
    if (ctx.showValue) {
        const vt = g.append("text").attr("x", 100).attr("y", 116).attr("text-anchor", "middle")
            .attr("fill", hc ? fg : (ctx.valueColor || t.val))
            .style("font-feature-settings", '"tnum"')
            .text(`${rating.toFixed(1)} / 5.0`);
        applyFont(vt, ctx.valueFont, 26, "700");
        if (ctx.showSub && ctx.subText) {
            const ut = g.append("text").attr("x", 100).attr("y", 134).attr("text-anchor", "middle")
                .attr("fill", hc ? fg : (ctx.unitColor || t.unit))
                .style("letter-spacing", "0.06em")
                .text(ctx.subText);
            applyFont(ut, ctx.unitFont, 12, "600");
        }
    }
}

/* ─── Mode 3: Traffic Light (board viewBox 200×218) ───────────────────────── */
export function renderTrafficLight(ctx: IconGaugeCtx): void {
    ensureIconDefs(ctx.defs);
    const t = iconTokens(ctx.theme);
    const g = fitGroup(ctx, 200, 218);
    const hc = ctx.hc, fg = ctx.hcFg, bg = ctx.hcBg;
    const band = ctx.band;

    g.append("rect").attr("class", "stub").attr("x", 93).attr("y", 6).attr("width", 14).attr("height", 12).attr("rx", 3)
        .attr("fill", hc ? bg : t.house).attr("stroke", hc ? fg : t.housebd).attr("stroke-width", 2);
    g.append("rect").attr("x", 93).attr("y", 164).attr("width", 14).attr("height", 14).attr("rx", 3)
        .attr("fill", hc ? bg : t.house).attr("stroke", hc ? fg : t.housebd).attr("stroke-width", 2);
    g.append("path")
        .attr("d", "M74 34 L54 34 L74 58 Z M126 34 L146 34 L126 58 Z M74 76 L54 76 L74 100 Z M126 76 L146 76 L126 100 Z M74 118 L54 118 L74 142 Z M126 118 L146 118 L126 142 Z")
        .attr("fill", hc ? bg : t.house).attr("stroke", hc ? fg : t.housebd)
        .attr("stroke-width", 2).attr("stroke-linejoin", "round");
    g.append("rect").attr("x", 74).attr("y", 14).attr("width", 52).attr("height", 154).attr("rx", 12)
        .attr("fill", hc ? bg : t.house).attr("stroke", hc ? fg : t.housebd).attr("stroke-width", 2);

    const lamps: [number, Band, string, string][] = [
        [48, "dang", "url(#igTlRed)", "url(#igGlowRed)"],
        [90, "warn", "url(#igTlAmber)", "url(#igGlowAmber)"],
        [132, "succ", "url(#igTlGreen)", "url(#igGlowGreen)"],
    ];
    for (const [cy, b, grad, glow] of lamps) {
        g.append("circle").attr("cx", 100).attr("cy", cy).attr("r", 21).attr("fill", hc ? bg : t.socket)
            .attr("stroke", hc ? fg : "none").attr("stroke-width", hc ? 1.5 : 0);
        const lit = b === band;
        g.append("circle").attr("cx", 100).attr("cy", cy).attr("r", 18)
            .attr("fill", hc ? (lit ? fg : bg) : (lit ? grad : t.lampdim))
            .attr("filter", (lit && !hc && t.glow) ? glow : null);
    }
    if (ctx.showGlyph) {
        const litCy = band === "dang" ? 48 : band === "warn" ? 90 : 132;
        const glyphD = band === "succ"
            ? `M91 ${litCy} L98 ${litCy + 7} L112 ${litCy - 7}`
            : band === "warn"
                ? `M100 ${litCy - 9} L100 ${litCy + 2} M100 ${litCy + 7} L100 ${litCy + 8}`
                : `M92 ${litCy - 9} L108 ${litCy + 9} M108 ${litCy - 9} L92 ${litCy + 9}`;
        g.append("path").attr("d", glyphD)
            .attr("fill", "none").attr("stroke", hc ? bg : t.glyph)
            .attr("stroke-width", 4.2).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
    }
    valueLine(g, ctx, t, 100, 196, 214, 20);
}

/* ─── Mode 4: State Morph (board viewBox 200×218) ─────────────────────────── */
export function renderStateMorph(ctx: IconGaugeCtx): void {
    const t = iconTokens(ctx.theme);
    const g = fitGroup(ctx, 200, 218);
    const hc = ctx.hc, fg = ctx.hcFg, bg = ctx.hcBg;
    const band = ctx.band;
    const clr = hc ? fg : stateColor(t, band);
    const style = ctx.morphStyle;

    if (style === "thumbs") {
        g.append("path").attr("d", VESSELS.thumb)
            .attr("transform", band === "succ" ? "translate(47,20)" : "translate(47,20) rotate(180 53 66)")
            .attr("fill", clr);
    } else if (style === "tickCross") {
        g.append("circle").attr("cx", 100).attr("cy", 86).attr("r", 54).attr("fill", clr);
        g.append("path")
            .attr("d", band === "succ" ? "M78 88 L94 104 L124 70" : "M82 68 L118 104 M118 68 L82 104")
            .attr("fill", "none").attr("stroke", hc ? bg : t.facefeat)
            .attr("stroke-width", 6).attr("stroke-linecap", "round").attr("stroke-linejoin", "round");
    } else {
        // Faces (default)
        g.append("circle").attr("cx", 100).attr("cy", 86).attr("r", 54).attr("fill", clr);
        g.append("circle").attr("cx", 82).attr("cy", 72).attr("r", 6).attr("fill", hc ? bg : t.facefeat);
        g.append("circle").attr("cx", 118).attr("cy", 72).attr("r", 6).attr("fill", hc ? bg : t.facefeat);
        const mouth = band === "succ" ? "M78 100 Q100 122 122 100"
            : band === "warn" ? "M80 106 L120 106" : "M78 112 Q100 92 122 112";
        g.append("path").attr("d", mouth)
            .attr("fill", "none").attr("stroke", hc ? bg : t.facefeat)
            .attr("stroke-width", 6).attr("stroke-linecap", "round");
    }
    valueLine(g, ctx, t, 100, 180, 200, 24);
}

export function morphLabel(style: string, band: Band): string {
    if (style === "thumbs") return band === "succ" ? "Thumbs up" : "Thumbs down";
    if (style === "tickCross") return band === "succ" ? "Pass" : band === "warn" ? "At risk" : "Fail";
    return band === "succ" ? "Happy" : band === "warn" ? "Neutral" : "Unhappy";
}

export function trafficLabel(band: Band): string {
    return band === "succ" ? "On track" : band === "warn" ? "At risk" : "Off track";
}
