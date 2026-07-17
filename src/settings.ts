"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

import { BackgroundSettings } from "./shared/backgroundSettings";
import { BorderSettings } from "./shared/borderSettings";
import { CardSignatureSettings } from "./shared/cardSignatureSettings";

/**
 * Returns a Left/Center/Right alignment slice.
 * Use for any text-displaying field well so users can position labels.
 */
export function alignSlice(name: string, defaultValue: string = "left") {
    return new formattingSettings.AlignmentGroup({
        name,
        displayName: "Alignment",
        mode: powerbi.visuals.AlignmentGroupMode.Horizonal,
        value: defaultValue,
    });
}

/**
 * Maps an alignment slice value ("left" / "center" / "right")
 * to a flex `align-self` keyword for the rendered element.
 */
export function alignSelfFor(v: string | undefined): string {
    return v === "center" ? "center" : v === "right" ? "flex-end" : "flex-start";
}

/**
 * Maps an alignment slice value to a CSS `text-align` keyword.
 * Use when the element is full-width and you want text alignment within it.
 */
export function textAlignFor(v: string | undefined): string {
    return v === "center" || v === "right" ? v : "left";
}

// ─── Visual Title ──────────────────────────────────────────────
// Renders inside the iframe (1180.2.5 fix — the PBI auto-title
// strip above the visual is host chrome and absorbs right-clicks).
//
// Toggle is OFF by default so existing reports render unchanged when
// they upgrade. Users opt in by flipping Show Title.

class TitleSettingsCard extends FormattingSettingsCard {
    showTitle = new formattingSettings.ToggleSwitch({ name: "showTitle", displayName: "Show Title", value: false });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title Text", placeholder: "Visual title", value: "" });

    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font Size", value: 14 });
    titleBold = new formattingSettings.ToggleSwitch({ name: "titleBold", displayName: "Bold", value: true });
    titleItalic = new formattingSettings.ToggleSwitch({ name: "titleItalic", displayName: "Italic", value: false });
    titleUnderline = new formattingSettings.ToggleSwitch({ name: "titleUnderline", displayName: "Underline", value: false });

    titleFont = new formattingSettings.FontControl({
        name: "titleFont", displayName: "Font",
        fontFamily: this.titleFontFamily, fontSize: this.titleFontSize,
        bold: this.titleBold, italic: this.titleItalic, underline: this.titleUnderline,
    });

    titleAlign = alignSlice("titleAlign", "left");

    titleColor = new formattingSettings.ColorPicker({
        name: "titleColor", displayName: "Font Color",
        value: { value: "#1a1a2e" }, instanceKind: ConstantOrRule,
    });

    name = "titleSettings"; displayName = "Visual Title";
    slices: FormattingSettingsSlice[] = [
        this.showTitle, this.titleText, this.titleFont, this.titleAlign, this.titleColor,
    ];
}

// ─── Value (headline / primary text) ───────────────────────────
// Template card for the visual's primary text-displaying field.
// Duplicate this pattern for each text-displaying field well
// (label, subtitle, change pill, etc.).

class ValueStyleCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", description: "0 = automatic (mode-proportional)", value: 0 });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: true });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false });
    underline = new formattingSettings.ToggleSwitch({ name: "underline", displayName: "Underline", value: false });

    font = new formattingSettings.FontControl({
        name: "valueFont", displayName: "Font",
        fontFamily: this.fontFamily, fontSize: this.fontSize,
        bold: this.bold, italic: this.italic, underline: this.underline,
    });

    color = new formattingSettings.ColorPicker({
        name: "color", displayName: "Color",
        description: "Leave default to adapt to the background theme",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });

    align = alignSlice("align", "center");

    name = "valueStyle"; displayName = "Value";
    slices: FormattingSettingsSlice[] = [this.font, this.color, this.align];
}

// ─── Label (secondary text) ────────────────────────────────────

class LabelStyleCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", description: "0 = automatic", value: 0 });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false });

    font = new formattingSettings.FontControl({
        name: "labelFont", displayName: "Font",
        fontFamily: this.fontFamily, fontSize: this.fontSize,
        bold: this.bold, italic: this.italic,
    });

    color = new formattingSettings.ColorPicker({
        name: "color", displayName: "Color",
        description: "Leave default to adapt to the background theme",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });

    align = alignSlice("align", "center");

    name = "labelStyle"; displayName = "Label";
    slices: FormattingSettingsSlice[] = [this.font, this.color, this.align];
}

// ─── Icon Gauge (the visual's own card) ────────────────────────
// v1 = the board's four modes behind one Display mode dropdown; per-mode
// options surface only for their mode (visibility flipped in visual.ts).

export class IconGaugeCard extends FormattingSettingsCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode",
        displayName: "Display mode",
        items: [
            { displayName: "Fill Vessel", value: "fillVessel" },
            { displayName: "Icon Row", value: "iconRow" },
            { displayName: "Traffic Light", value: "trafficLight" },
            { displayName: "State Morph", value: "stateMorph" },
        ],
        value: { displayName: "Fill Vessel", value: "fillVessel" },
    });
    vessel = new formattingSettings.ItemDropdown({
        name: "vessel",
        displayName: "Vessel",
        items: [
            { displayName: "Bolt", value: "bolt" },
            { displayName: "Battery", value: "battery" },
            { displayName: "Droplet", value: "droplet" },
            { displayName: "Heart", value: "heart" },
            { displayName: "Person", value: "person" },
            { displayName: "Thumb", value: "thumb" },
        ],
        value: { displayName: "Bolt", value: "bolt" },
    });
    showGlyph = new formattingSettings.ToggleSwitch({
        name: "showGlyph",
        displayName: "Status glyph",
        description: "Colour-blind-safe tick / bang / cross on the lit lamp",
        value: true,
    });
    morphStyle = new formattingSettings.ItemDropdown({
        name: "morphStyle",
        displayName: "Morph style",
        items: [
            { displayName: "Faces", value: "faces" },
            { displayName: "Thumbs", value: "thumbs" },
            { displayName: "Tick / Cross", value: "tickCross" },
        ],
        value: { displayName: "Faces", value: "faces" },
    });
    showValue = new formattingSettings.ToggleSwitch({
        name: "showValue", displayName: "Show value", value: true,
    });
    showSub = new formattingSettings.ToggleSwitch({
        name: "showSub", displayName: "Show status line", value: true,
    });

    name = "iconGauge"; displayName = "Icon Gauge";
    slices: FormattingSettingsSlice[] = [
        this.mode, this.vessel, this.showGlyph, this.morphStyle,
        this.showValue, this.showSub,
    ];
}

// ─── Model ─────────────────────────────────────────────────────

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    iconGauge = new IconGaugeCard();
    titleSettings = new TitleSettingsCard();
    valueStyle = new ValueStyleCard();
    labelStyle = new LabelStyleCard();
    background = new BackgroundSettings();
    cardSignature = new CardSignatureSettings();
    visualBorder = new BorderSettings();

    cards = [this.iconGauge, this.titleSettings, this.valueStyle, this.labelStyle, this.background, this.cardSignature, this.visualBorder];
}
