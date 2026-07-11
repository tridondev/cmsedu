// src/lib/exportToExcel.js
//
// Builds result sheets that match the real Gaskiya High School report card
// layout exactly — both the cell/merge positions AND the visual design
// (font, sizes, colors, header bands) extracted directly from an actual
// filled report. See the "Provenance" note at the bottom of this file if
// you ever need to re-derive them from a new sample file.
//
// Two layouts exist because the school's real workbook uses them:
//   - SINGLE_TERM: used for First Term and Second Term reports (11 columns,
//     no "previous term" or "annual" columns since there's nothing to
//     summarize yet).
//   - THIRD_TERM: used for the Third Term / end-of-session report (14
//     columns — adds a "Previous Summary" pair of columns per subject and an
//     "Annual" total column, plus an "ANNUAL SUMMARY" box with cumulative
//     average/position and a promotion comment).
//
// Both layouts repeat in a fixed-height block (60 rows) per student, so a
// class of N students is just N blocks stacked down the same sheet.

import ExcelJS from "exceljs";
import { BEHAVIOUR_CRITERIA as DEFAULT_BEHAVIOUR_CRITERIA } from "./resultEngine";

const BLOCK_HEIGHT = 60;

const BAND_LETTERS = ["A", "B", "C", "D", "E"]; // behaviour rating bands

// -------------------------------------------------------------------------
// Design tokens — colors/fonts lifted directly from the real template.
// These are the DEFAULTS the school's real report card uses. They're kept
// as `let` bindings (rather than `const`) so `applyColorTheme()` can swap
// them out for admin-picked colors right before a block is rendered —
// every helper below (cell, bandHeader, mergeStyled, writeSingleTermBlock,
// writeThirdTermBlock) reads these as free variables, so reassigning them
// here is all that's needed to re-theme the whole export.
// -------------------------------------------------------------------------
const FONT = "Tahoma";
const DEFAULT_NAVY = "FF002060"; // headings, subject names, key figures
const DEFAULT_BLUE = "FF0070C0"; // field labels, behaviour rows
const DEFAULT_LIGHT_BLUE = "FF00B0F0"; // sub-headline banner text
const DEFAULT_WHITE = "FFFFFFFF"; // text sitting on a navy fill band
const DEFAULT_BLACK = "FF000000";

/** Colors an admin can customize, keyed by name, with the template's original values as defaults. */
export const DEFAULT_COLORS = {
  navy: DEFAULT_NAVY,
  blue: DEFAULT_BLUE,
  lightBlue: DEFAULT_LIGHT_BLUE,
  white: DEFAULT_WHITE,
  black: DEFAULT_BLACK,
};

let NAVY = DEFAULT_NAVY;
let BLUE = DEFAULT_BLUE;
let LIGHT_BLUE = DEFAULT_LIGHT_BLUE;
let WHITE = DEFAULT_WHITE;
let BLACK = DEFAULT_BLACK;

/**
 * Normalizes a color into the 8-hex-digit ARGB string ExcelJS expects
 * ("FFRRGGBB"). Accepts what an HTML <input type="color"> gives you
 * ("#rrggbb" or "rrggbb"), or an already-correct ARGB string, so callers
 * don't need to know ExcelJS's format — they just pass whatever the color
 * picker returns.
 */
function toArgb(input, fallback) {
  if (!input || typeof input !== "string") return fallback;
  const hex = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `FF${hex.toUpperCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(hex)) return hex.toUpperCase();
  return fallback;
}

/**
 * Applies an admin-selected color theme before a report is generated.
 * `colors` is a partial object of { navy, blue, lightBlue, white, black }
 * — any key that's missing or invalid falls back to the template's
 * original default for that role, so an admin can override just one
 * color (e.g. only `navy`) and everything else stays as-is.
 */
function applyColorTheme(colors = {}) {
  NAVY = toArgb(colors.navy, DEFAULT_NAVY);
  BLUE = toArgb(colors.blue, DEFAULT_BLUE);
  LIGHT_BLUE = toArgb(colors.lightBlue, DEFAULT_LIGHT_BLUE);
  WHITE = toArgb(colors.white, DEFAULT_WHITE);
  BLACK = toArgb(colors.black, DEFAULT_BLACK);
}

// -------------------------------------------------------------------------
// Row heights & column widths — measured directly from the real template
// files (third_term.xlsx "Third Term"/"First Term" sheets, and the JSS2
// "Second term" sheet), one entry per block-relative row (0..BLOCK_HEIGHT-1)
// so every export reproduces the exact vertical rhythm and column
// proportions of the original Gaskiya report card instead of relying on
// Excel's default ~15pt row height / 8.43-char column width.
// -------------------------------------------------------------------------
const ROW_HEIGHTS_SINGLE = [
  66, 27.75, 46.5, 39, 31.5, 31.5, 31.5, 35.25, 39, 39.75, // 0-9: header block
  21, 21, // 10-11: spacer
  36.75, 31.5, 31.5, 31.5, 31.5, // 12-16: ACADEMIC RECORDS band + table header
  ...Array(19).fill(41.25), // 17-35: subject rows
  31.5, 31.5, 31.5, 31.5, // 36-39: TOTAL/AVERAGE block + spacer
  ...Array(14).fill(33.75), // 40-53: Ratings band + behaviour rows
  54.75, 36.75, 42.75, 31.5, 31.5, 46.5, // 54-59: remarks/signatures
];

const ROW_HEIGHTS_THIRD = [
  66, 27.75, 46.5, 39, 44.25, 44.25, 44.25, 44.25, 44.25, 44.25, // 0-9: header block
  46.5, // 10: spacer
  51.75, 51.75, 51.75, 51.75, 51.75, // 11-15: ACADEMIC RECORDS band + table header
  ...Array(19).fill(41.25), // 16-34: subject rows
  31.5, 37.5, 39, 46.5, 50.25, // 35-39: TOTAL/AVERAGE block + Ratings/Annual Summary band
  ...Array(15).fill(54.75), // 40-54: behaviour rows + annual summary figures
  42.75, 46.5, 35.25, 46.5, 50.25, // 55-59: remarks/signatures
];

const COLUMN_WIDTHS_SINGLE = [46.86, 18.14, 13.71, 19.43, 19.86, 19.29, 28.71, 22.86, 24.29, 16.14, 33.29];
const COLUMN_WIDTHS_THIRD = [60.57, 12.57, 13.29, 18.14, 13.71, 19.43, 19.86, 18.86, 30.57, 24.71, 24.29, 22.14, 16.14, 33.29];

/** Applies the full 60-row height template to one student block, starting at `top`. */
function applyBlockRowHeights(sheet, top, heights) {
  heights.forEach((h, i) => {
    sheet.getRow(top + i).height = h;
  });
}

/** Utility: set a cell's value, optionally merging a range and applying style. */
function cell(sheet, row, col, value, opts = {}) {
  const c = sheet.getRow(row).getCell(col);
  c.value = value;
  c.font = {
    name: opts.fontName || FONT,
    size: opts.size || 11,
    bold: opts.bold ?? false,
    color: { argb: opts.color || BLACK },
  };
  c.alignment = {
    horizontal: opts.align || "left",
    vertical: "middle",
    wrapText: opts.wrap ?? true,
  };
  if (opts.fill) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
  if (opts.border) {
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  }
  if (opts.numFmt) c.numFmt = opts.numFmt;
  return c;
}

function merge(sheet, r1, c1, r2, c2) {
  try {
    sheet.mergeCells(r1, c1, r2, c2);
  } catch {
    /* already merged from a previous block write at same relative offset — ignore */
  }
}

/**
 * Merges a range AND stamps the same alignment/border onto every cell in
 * that range, not just the top-left one. Excel itself only looks at the
 * top-left cell's style for a merged range, but some other viewers (Google
 * Sheets import, LibreOffice, some mobile viewers) render merged-cell text
 * using whichever cell they treat as anchor, so setting it everywhere makes
 * centering/borders robust regardless of viewer.
 */
function mergeStyled(sheet, r1, c1, r2, c2, opts = {}) {
  merge(sheet, r1, c1, r2, c2);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const existing = sheet.getRow(r).getCell(c);
      existing.alignment = {
        horizontal: opts.align || "center",
        vertical: "middle",
        wrapText: opts.wrap ?? true,
      };
      if (opts.border) {
        existing.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      }
    }
  }
}

/** A cell that also fills its whole merged range with a solid color. */
function bandHeader(sheet, r1, c1, r2, c2, value, opts = {}) {
  merge(sheet, r1, c1, r2, c2);
  return cell(sheet, r1, c1, value, { fill: NAVY, color: WHITE, bold: true, align: "center", ...opts });
}

// -------------------------------------------------------------------------
// Logo & signature embedding
// -------------------------------------------------------------------------
/**
 * Fetches an image URL (logo or signature) and registers it with the
 * workbook so it can be placed with sheet.addImage(). Returns the resulting
 * ExcelJS image id, or null if unavailable/unset. Failures here never
 * abort the export — the report is still fully usable without the image.
 */
async function registerImage(wb, url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const extension = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpeg";
    const buffer = await res.arrayBuffer();
    return wb.addImage({ buffer, extension });
  } catch {
    return null; // e.g. CORS-blocked host or network error — skip silently
  }
}

/**
 * Places the Federal Government logo at the top-LEFT of a block, and the
 * school's own logo at the top-RIGHT — matching the position swap the
 * school asked for (govt logo where the school logo used to sit).
 * `colCount` is 11 for single-term layouts and 14 for the third-term one,
 * so the right-hand logo lands correctly on either layout.
 *
 * Both logos render at 200x200px. A flat fractional inset (e.g. "0.1 of a
 * column") does NOT give both logos the same visual margin, because column A
 * and the last column are very different widths — especially on the
 * Third Term layout (A is 60.57 char-units, the last column only 33.29), so
 * the same 0.1 fraction leaves the government logo with much more breathing
 * room than the school logo, making the centered text between them look
 * off-balance even though it IS centered in the underlying grid.
 *
 * Instead, LOGO_EDGE_PIXEL_INSET is a fixed ~15px margin from the true left
 * and right sheet edges, converted to the correct fractional offset for
 * WHICHEVER column each logo actually sits in — so both sides get the same
 * real margin regardless of that column's width.
 */
const LOGO_SIZE = 200;
const LOGO_EDGE_PIXEL_INSET = 15;

/** Excel's default-font column-width-to-pixel approximation (~7px/char-unit + 5px padding). */
function charUnitsToPixels(charUnits) {
  return charUnits * 7 + 5;
}

function pixelInsetToColFraction(colWidthCharUnits, pixelInset) {
  const colWidthPx = charUnitsToPixels(colWidthCharUnits);
  return Math.min(0.9, pixelInset / colWidthPx);
}

function placeLogos(sheet, top, colCount, columnWidths, govLogoImageId, schoolLogoImageId) {
  if (govLogoImageId != null) {
    const inset = pixelInsetToColFraction(columnWidths[0], LOGO_EDGE_PIXEL_INSET);
    sheet.addImage(govLogoImageId, {
      tl: { col: inset, row: top - 1 + 0.05 },
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
    });
  }
  if (schoolLogoImageId != null) {
    const inset = pixelInsetToColFraction(columnWidths[colCount - 1], LOGO_EDGE_PIXEL_INSET);
    sheet.addImage(schoolLogoImageId, {
      tl: { col: colCount - 1 + inset, row: top - 1 + 0.05 },
      ext: { width: LOGO_SIZE, height: LOGO_SIZE },
    });
  }
}

/**
 * Drops a signature image into the narrow gap column that sits between a
 * "Signature/Date:" label and the remark/date text beside it — that gap
 * column is otherwise empty in both layouts, and spans the remark row
 * directly above the signature row too, so there's room for a normal
 * signature-scan aspect ratio without colliding with any text.
 * `anchorRow` should be the block-relative row number of the REMARK row
 * (the row directly above "Signature/Date:"), so the image spans both rows.
 */
function placeSignature(sheet, anchorRow, gapCol, imageId) {
  if (imageId == null) return;
  sheet.addImage(imageId, {
    tl: { col: gapCol - 1 + 0.08, row: anchorRow - 1 + 0.15 },
    ext: { width: 130, height: 65 },
  });
}

/**
 * Derives the "JUNIOR/SENIOR SECONDARY SCHOOL TERMLY REPORT" banner text
 * from the class's actual level, instead of hardcoding one or the other.
 * Checks `classInfo.level` first, falling back to `classInfo.className`
 * (e.g. "JSS2", "SS2 Gold"). JSS is checked before SS because "JSS2"
 * itself contains the substring "SS2", so SS must not be checked first.
 */
function reportTitleFor(classInfo) {
  const source = `${classInfo.level || ""} ${classInfo.className || ""}`.toUpperCase();
  if (source.includes("JSS") || source.includes("JUNIOR")) {
    return "JUNIOR SECONDARY SCHOOL TERMLY REPORT";
  }
  if (source.includes("SS") || source.includes("SENIOR")) {
    return "SENIOR SECONDARY SCHOOL TERMLY REPORT";
  }
  // Neither could be determined — fall back to a level-agnostic title
  // rather than silently mislabeling the report.
  return "SECONDARY SCHOOL TERMLY REPORT";
}

// -------------------------------------------------------------------------
// SINGLE TERM layout (First / Second Term) — columns A..K (1..11)
// -------------------------------------------------------------------------
function writeSingleTermBlock(sheet, top, school, classInfo, student, subjectScores, govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId) {
  const r = (offset) => top + offset; // offset 0 == the block's row 1 (school name)

  placeLogos(sheet, r(0), 11, COLUMN_WIDTHS_SINGLE, govLogoImageId, schoolLogoImageId);

  // Match the real template's row heights for this entire 60-row block so
  // text at the template's actual font sizes isn't clipped or squished.
  applyBlockRowHeights(sheet, top, ROW_HEIGHTS_SINGLE);

  mergeStyled(sheet, r(0), 1, r(0), 11, { align: "center" });
  cell(sheet, r(0), 1, (school.name || "").trim(), { bold: true, align: "center", size: 65, color: NAVY });
  merge(sheet, r(1), 1, r(1), 11);
  cell(sheet, r(1), 1, (school.address || "").trim(), { align: "center", size: 18, bold: true, color: LIGHT_BLUE });
  mergeStyled(sheet, r(2), 1, r(2), 11, { align: "center" });
  cell(sheet, r(2), 1, (school.ministry || "").trim(), { bold: true, align: "center", size: 30, color: NAVY });
  sheet.getRow(r(2)).getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  merge(sheet, r(3), 1, r(3), 11);
  cell(sheet, r(3), 1, reportTitleFor(classInfo), { bold: true, align: "center", size: 36, color: LIGHT_BLUE });

  const LBL = { bold: true, size: 26, color: BLUE, wrap: false };
  const VAL = { bold: true, size: 26, color: BLACK, wrap: false };

  cell(sheet, r(5), 1, "Name of Student: ", LBL);
  merge(sheet, r(5), 2, r(5), 6);
  cell(sheet, r(5), 2, student.fullName, VAL);
  cell(sheet, r(5), 7, "Exam No.:", LBL);
  cell(sheet, r(5), 8, student.examNo, VAL);
  cell(sheet, r(5), 9, "Class:", LBL);
  merge(sheet, r(5), 10, r(5), 11);
  cell(sheet, r(5), 10, classInfo.className, VAL);

  cell(sheet, r(6), 1, "State of Origin: ", LBL);
  merge(sheet, r(6), 2, r(6), 3);
  cell(sheet, r(6), 2, student.stateOfOrigin, VAL);
  cell(sheet, r(6), 4, "LGA:", LBL);
  merge(sheet, r(6), 5, r(6), 8);
  cell(sheet, r(6), 5, student.lga, VAL);
  cell(sheet, r(6), 9, "Sex:", LBL);
  merge(sheet, r(6), 10, r(6), 11);
  cell(sheet, r(6), 10, student.sex, VAL);

  cell(sheet, r(7), 1, "Term:", LBL);
  cell(sheet, r(7), 2, `${classInfo.term} ${classInfo.session} Session`, VAL);
  cell(sheet, r(7), 6, "No. in Class: ", LBL);
  cell(sheet, r(7), 8, classInfo.noInClass, VAL);
  cell(sheet, r(7), 9, "Position: ", LBL);
  merge(sheet, r(7), 10, r(7), 11);
  cell(sheet, r(7), 10, student.overallPosition ?? "", VAL);

  cell(sheet, r(8), 1, "Term Ending:", LBL);
  cell(sheet, r(8), 2, classInfo.termEndingDate, VAL);
  cell(sheet, r(8), 6, "Next Term Begins:", LBL);
  cell(sheet, r(8), 8, classInfo.nextTermBegins, VAL);

  cell(sheet, r(9), 1, "School Fees Paid: ", LBL);
  merge(sheet, r(9), 3, r(9), 5);
  cell(sheet, r(9), 6, "Fees Owed:", LBL);
  merge(sheet, r(9), 8, r(9), 11);

  bandHeader(sheet, r(12), 2, r(12), 11, "ACADEMIC RECORDS", { size: 28, border: true });

  const THEAD = { bold: true, align: "center", size: 24, color: NAVY, border: true };
  const w = classInfo.weights || {};
  merge(sheet, r(13), 2, r(13), 5);
  cell(sheet, r(13), 2, "ASSIGNMENTS/TEST", THEAD);
  cell(sheet, r(13), 6, "EXAM", THEAD);
  merge(sheet, r(13), 7, r(14), 7);
  cell(sheet, r(13), 7, "Total", THEAD);
  merge(sheet, r(13), 8, r(15), 8);
  cell(sheet, r(13), 8, "Class", THEAD);
  merge(sheet, r(13), 9, r(15), 9);
  cell(sheet, r(13), 9, "Subject", THEAD);
  merge(sheet, r(13), 11, r(16), 11);
  cell(sheet, r(13), 11, "Remarks", THEAD);

  merge(sheet, r(14), 2, r(14), 3);
  cell(sheet, r(14), 2, "Assignment", THEAD);
  cell(sheet, r(14), 4, "Test", THEAD);
  cell(sheet, r(14), 5, "Test", THEAD);
  cell(sheet, r(14), 6, "Marks", THEAD);

  merge(sheet, r(15), 2, r(16), 2);
  cell(sheet, r(15), 2, w.ca1 ?? 0.1, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(15), 3, r(16), 3);
  cell(sheet, r(15), 3, w.ca2 ?? 0.1, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(15), 4, r(16), 4);
  cell(sheet, r(15), 4, w.test1 ?? 0.2, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(15), 5, r(16), 5);
  cell(sheet, r(15), 5, w.test2 ?? 0.2, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(15), 6, r(16), 6);
  cell(sheet, r(15), 6, w.exam ?? 0.4, { ...THEAD, numFmt: "0%" });
  cell(sheet, r(15), 7, "Scores", THEAD);

  bandHeader(sheet, r(16), 1, r(16), 1, "CORE SUBJECTS", { align: "left", size: 24, border: true });
  cell(sheet, r(16), 7, 1, { ...THEAD, numFmt: "0%" });
  cell(sheet, r(16), 8, "Average", THEAD);
  cell(sheet, r(16), 9, "Position", THEAD);
  cell(sheet, r(16), 10, "Grade", THEAD);

  let total = 0;
  classInfo.subjects.forEach((subject, i) => {
    const row = r(17 + i);
    const s = subjectScores?.[subject.id] || {};
    cell(sheet, row, 1, subject.name, { bold: true, size: 22, color: NAVY, border: true });
    cell(sheet, row, 2, s.ca1 ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 3, s.ca2 ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 4, s.test1 ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 5, s.test2 ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 6, s.exam ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 7, s.total ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 8, s.classAvg ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 9, s.position ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 10, s.grade ?? "", { border: true, align: "center", size: 26, bold: true });
    cell(sheet, row, 11, s.remark ?? "", { size: 26, bold: true, border: true });
    total += Number(s.total || 0);
  });

  const totalRow = r(37);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL =", { bold: true, size: 28 });
  cell(sheet, totalRow, 2, Math.round(total * 100) / 100, { bold: true, size: 28 });
  merge(sheet, totalRow, 6, r(38), 7);
  cell(sheet, totalRow, 6, "AVERAGE:", { bold: true, align: "center", size: 28 });
  // TOTAL (numerator) over subject COUNT (denominator), fraction-bar line
  // between them, then "=" then the actual average — this must read as a
  // real equation (total ÷ count = average), not average sitting over count.
  cell(sheet, totalRow, 8, Math.round(total * 100) / 100, { bold: true, align: "center", size: 24 });
  cell(sheet, r(38), 8, classInfo.subjects.length, { align: "center", bold: true, size: 24 });
  sheet.getRow(totalRow).getCell(8).border = { bottom: { style: "medium" } };
  sheet.getRow(r(38)).getCell(8).border = { top: { style: "medium" } };
  merge(sheet, totalRow, 9, r(38), 9);
  cell(sheet, totalRow, 9, "=", { align: "center", size: 28 });
  merge(sheet, totalRow, 10, r(38), 11);
  cell(sheet, totalRow, 10, Math.round(average * 100) / 100, { bold: true, align: "center", size: 28 });

  bandHeader(sheet, r(40), 4, r(40), 8, "Ratings", { size: 20, border: true });
  merge(sheet, r(41), 1, r(41), 3);
  cell(sheet, r(41), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true, size: 22, color: BLUE, border: true });
  BAND_LETTERS.forEach((band, i) => cell(sheet, r(41), 4 + i, band, { bold: true, align: "center", size: 20, color: BLUE, border: true }));
  bandHeader(sheet, r(41), 9, r(41), 11, "KEY TO RATING", { size: 20, border: true });

  const RATING_KEY = ["A = Excellent", "B = V.Good", "C = Good", "D = Pass", "E = Fair", "F = Fail"];
  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(42 + i);
    merge(sheet, row, 1, row, 3);
    cell(sheet, row, 1, criterion, { size: 22, color: BLUE, border: true });
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    BAND_LETTERS.forEach((_, bi) => cell(sheet, row, 4 + bi, bi === bandIdx ? "\u00fc" : "", { align: "center", fontName: "Wingdings", size: 36, color: BLUE, border: true }));
    if (RATING_KEY[i]) {
      merge(sheet, row, 9, row, 11);
      cell(sheet, row, 9, RATING_KEY[i], { bold: true, size: 18, color: NAVY, border: true, align: "left" });
    }
  });

  cell(sheet, r(55), 1, "Form Master's Remark: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(55), 3, r(55), 10);
  cell(sheet, r(55), 3, student.formMasterRemark || "", { bold: true, size: 24, align: "left", wrap: false });
  cell(sheet, r(56), 1, "Signature/Date: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(56), 3, r(56), 8);
  cell(sheet, r(56), 3, student.signatureDate || "", { bold: true, size: 18, color: NAVY, align: "center", wrap: false });
  placeSignature(sheet, r(55), 2, formMasterSigImageId);

  cell(sheet, r(58), 1, "Principal's Remark: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(58), 3, r(58), 10);
  cell(sheet, r(58), 3, student.principalRemark || "", { bold: true, size: 24, align: "left", wrap: false });
  cell(sheet, r(59), 1, "Signature/Date: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(59), 3, r(59), 8);
  cell(sheet, r(59), 3, student.signatureDate || "", { bold: true, size: 18, color: NAVY, align: "center", wrap: false });
  placeSignature(sheet, r(58), 2, principalSigImageId);
}

// -------------------------------------------------------------------------
// THIRD TERM layout — columns A..N (1..14), adds Previous/Annual columns
// -------------------------------------------------------------------------
function writeThirdTermBlock(sheet, top, school, classInfo, student, subjectScores, cumulative, govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId) {
  const r = (offset) => top + offset;

  placeLogos(sheet, r(0), 14, COLUMN_WIDTHS_THIRD, govLogoImageId, schoolLogoImageId);

  // Match the real template's row heights for this entire 60-row block so
  // text at the template's actual font sizes isn't clipped or squished.
  applyBlockRowHeights(sheet, top, ROW_HEIGHTS_THIRD);

  mergeStyled(sheet, r(0), 1, r(0), 14, { align: "center" });
  cell(sheet, r(0), 1, (school.name || "").trim(), { bold: true, align: "center", size: 65, color: NAVY });
  merge(sheet, r(1), 1, r(1), 14);
  cell(sheet, r(1), 1, (school.address || "").trim(), { align: "center", size: 20, bold: true, color: LIGHT_BLUE });
  mergeStyled(sheet, r(2), 1, r(2), 14, { align: "center" });
  cell(sheet, r(2), 1, (school.ministry || "").trim(), { bold: true, align: "center", size: 30, color: NAVY });
  sheet.getRow(r(2)).getCell(1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  merge(sheet, r(3), 1, r(3), 14);
  cell(sheet, r(3), 1, reportTitleFor(classInfo), { bold: true, align: "center", size: 36, color: LIGHT_BLUE });

  const LBL = { bold: true, size: 26, color: BLUE, wrap: false };
  const VAL = { bold: true, size: 26, color: BLACK, wrap: false };

  merge(sheet, r(5), 1, r(5), 2);
  cell(sheet, r(5), 1, "Name of Student: ", LBL);
  merge(sheet, r(5), 3, r(5), 8);
  cell(sheet, r(5), 3, student.fullName, VAL);
  cell(sheet, r(5), 9, "Exam No.:", LBL);
  cell(sheet, r(5), 10, student.examNo, VAL);
  merge(sheet, r(5), 11, r(5), 12);
  cell(sheet, r(5), 11, "Class:", LBL);
  merge(sheet, r(5), 13, r(5), 14);
  cell(sheet, r(5), 13, classInfo.className, VAL);

  merge(sheet, r(6), 1, r(6), 2);
  cell(sheet, r(6), 1, "State of Origin: ", LBL);
  merge(sheet, r(6), 3, r(6), 5);
  cell(sheet, r(6), 3, student.stateOfOrigin, VAL);
  cell(sheet, r(6), 6, "LGA:", LBL);
  merge(sheet, r(6), 7, r(6), 10);
  cell(sheet, r(6), 7, student.lga, VAL);
  merge(sheet, r(6), 11, r(6), 12);
  cell(sheet, r(6), 11, "Sex:", LBL);
  merge(sheet, r(6), 13, r(6), 14);
  cell(sheet, r(6), 13, student.sex, VAL);

  merge(sheet, r(7), 1, r(7), 2);
  cell(sheet, r(7), 1, "Term:", LBL);
  merge(sheet, r(7), 3, r(7), 7);
  cell(sheet, r(7), 3, `${classInfo.term} ${classInfo.session} Session`, VAL);
  cell(sheet, r(7), 8, "No. in Class: ", LBL);
  cell(sheet, r(7), 10, classInfo.noInClass, VAL);
  merge(sheet, r(7), 11, r(7), 12);
  cell(sheet, r(7), 11, "Position: ", LBL);
  merge(sheet, r(7), 13, r(7), 14);
  cell(sheet, r(7), 13, student.overallPosition ?? "", VAL);

  merge(sheet, r(8), 1, r(8), 2);
  cell(sheet, r(8), 1, "Term Ending:", LBL);
  merge(sheet, r(8), 3, r(8), 7);
  cell(sheet, r(8), 3, classInfo.termEndingDate, VAL);
  cell(sheet, r(8), 8, "Next Term Begins:", LBL);
  cell(sheet, r(8), 10, classInfo.nextTermBegins, VAL);

  merge(sheet, r(9), 1, r(9), 2);
  cell(sheet, r(9), 1, "School Fees Paid: ", LBL);
  merge(sheet, r(9), 5, r(9), 7);
  cell(sheet, r(9), 8, "Fees Owed:", LBL);
  merge(sheet, r(9), 10, r(9), 14);

  bandHeader(sheet, r(11), 4, r(11), 14, "ACADEMIC RECORDS", { size: 28, border: true });

  const THEAD = { bold: true, align: "center", size: 24, color: NAVY, border: true };
  const w = classInfo.weights || {};
  merge(sheet, r(12), 4, r(12), 7);
  cell(sheet, r(12), 4, "ASSIGNMENTS/TEST", THEAD);
  cell(sheet, r(12), 8, "EXAM", THEAD);
  merge(sheet, r(12), 9, r(13), 9);
  cell(sheet, r(12), 9, "Total", THEAD);
  merge(sheet, r(12), 10, r(14), 10);
  cell(sheet, r(12), 10, "Class", THEAD);
  merge(sheet, r(12), 11, r(14), 11);
  cell(sheet, r(12), 11, "Subject", THEAD);
  merge(sheet, r(12), 12, r(14), 12);
  cell(sheet, r(12), 12, "Annual", THEAD);
  merge(sheet, r(12), 14, r(15), 14);
  cell(sheet, r(12), 14, "Remarks", THEAD);

  merge(sheet, r(13), 4, r(13), 5);
  cell(sheet, r(13), 4, "Assignment", THEAD);
  cell(sheet, r(13), 6, "Test", THEAD);
  cell(sheet, r(13), 7, "Test", THEAD);
  cell(sheet, r(13), 8, "Marks", THEAD);

  merge(sheet, r(14), 2, r(14), 3);
  cell(sheet, r(14), 2, "Previous", { fill: NAVY, color: WHITE, bold: true, align: "center", size: 24, border: true });
  merge(sheet, r(14), 4, r(15), 4);
  cell(sheet, r(14), 4, w.ca1 ?? 0.1, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(14), 5, r(15), 5);
  cell(sheet, r(14), 5, w.ca2 ?? 0.1, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(14), 6, r(15), 6);
  cell(sheet, r(14), 6, w.test1 ?? 0.2, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(14), 7, r(15), 7);
  cell(sheet, r(14), 7, w.test2 ?? 0.2, { ...THEAD, numFmt: "0%" });
  merge(sheet, r(14), 8, r(15), 8);
  cell(sheet, r(14), 8, w.exam ?? 0.4, { ...THEAD, numFmt: "0%" });
  cell(sheet, r(14), 9, "Scores", THEAD);

  bandHeader(sheet, r(15), 1, r(15), 1, "CORE SUBJECTS", { align: "left", size: 24, border: true });
  merge(sheet, r(15), 2, r(15), 3);
  cell(sheet, r(15), 2, "Summary", { fill: NAVY, color: WHITE, bold: true, align: "center", size: 22, border: true });
  cell(sheet, r(15), 9, 1, { ...THEAD, numFmt: "0%" });
  cell(sheet, r(15), 10, "Average", THEAD);
  cell(sheet, r(15), 11, "Position", THEAD);
  cell(sheet, r(15), 12, "Total", THEAD);
  cell(sheet, r(15), 13, "Grade", THEAD);

  let total = 0;
  let annualTotalSum = 0;
  classInfo.subjects.forEach((subject, i) => {
    const row = r(16 + i);
    const s = subjectScores?.[subject.id] || {};
    const prev1 = cumulative?.[subject.id]?.term1 ?? "";
    const prev2 = cumulative?.[subject.id]?.term2 ?? "";
    const annual = [prev1, prev2, s.total].filter((v) => v !== "" && v != null).reduce((a, b) => a + Number(b), 0);
    cell(sheet, row, 1, subject.name, { bold: true, size: 22, color: NAVY, border: true });
    cell(sheet, row, 2, prev1, { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 3, prev2, { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 4, s.ca1 ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 5, s.ca2 ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 6, s.test1 ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 7, s.test2 ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 8, s.exam ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 9, s.total ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 10, s.classAvg ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 11, s.position ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 12, annual, { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 13, s.grade ?? "", { border: true, align: "center", bold: true, size: 26 });
    cell(sheet, row, 14, s.remark ?? "", { bold: true, size: 26, border: true });
    total += Number(s.total || 0);
    annualTotalSum += annual;
  });

  const totalRow = r(36);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL =", { bold: true, size: 28 });
  cell(sheet, totalRow, 2, Math.round(total * 100) / 100, { bold: true, size: 28 });
  merge(sheet, totalRow, 8, r(37), 9);
  cell(sheet, totalRow, 8, "AVERAGE:", { bold: true, align: "center", size: 28 });
  merge(sheet, totalRow, 10, totalRow, 11);
  cell(sheet, totalRow, 10, Math.round(total * 100) / 100, { bold: true, align: "center", size: 28 });
  merge(sheet, totalRow, 13, r(37), 13);
  cell(sheet, totalRow, 13, "=", { align: "center", size: 28 });
  merge(sheet, totalRow, 14, r(37), 14);
  cell(sheet, totalRow, 14, Math.round(average * 100) / 100, { bold: true, align: "center", size: 28 });
  merge(sheet, r(37), 10, r(37), 11);
  cell(sheet, r(37), 10, classInfo.subjects.length, { align: "center", bold: true, size: 28 });
  // Fraction bar: a line separating the AVERAGE's numerator (total, row
  // above) from its denominator (subject count, row below) so it reads as
  // an actual stacked fraction rather than two numbers floating with
  // nothing between them. Set on both the numerator's bottom and the
  // denominator's top (not just one) since Excel resolves a merged range's
  // border from whichever side each contributing cell defines.
  [10, 11].forEach((c) => {
    sheet.getRow(totalRow).getCell(c).border = { bottom: { style: "medium" } };
    sheet.getRow(r(37)).getCell(c).border = { top: { style: "medium" } };
  });

  bandHeader(sheet, r(39), 3, r(39), 7, "Ratings", { size: 24, border: true });
  bandHeader(sheet, r(39), 9, r(39), 14, "ANNUAL SUMMARY", { size: 26, border: true });

  merge(sheet, r(40), 1, r(40), 2);
  cell(sheet, r(40), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true, size: 20, color: BLUE, border: true });
  BAND_LETTERS.forEach((band, i) => cell(sheet, r(40), 3 + i, band, { bold: true, align: "center", size: 20, color: BLUE, border: true }));
  merge(sheet, r(40), 9, r(41), 10);
  cell(sheet, r(40), 9, "ANNUAL TOTAL = ", { bold: true, size: 26, color: NAVY, border: true });
  merge(sheet, r(40), 11, r(41), 14);
  cell(sheet, r(40), 11, annualTotalSum || student.annualTotal || "", { align: "center", bold: true, size: 36, color: NAVY, border: true });

  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(41 + i);
    merge(sheet, row, 1, row, 2);
    cell(sheet, row, 1, criterion, { size: 22, color: BLUE, border: true });
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    BAND_LETTERS.forEach((_, bi) => cell(sheet, row, 3 + bi, bi === bandIdx ? "\u00fc" : "", { align: "center", fontName: "Wingdings", size: 36, color: BLUE, border: true }));
  });

  merge(sheet, r(42), 9, r(44), 10);
  cell(sheet, r(42), 9, "ANNUAL AVERAGE = ", { bold: true, size: 22, color: NAVY, border: true });
  // Shown as an actual fraction — annual total over (subjects × 3 terms),
  // then "=" then the result — matching how the school's real template
  // displays it. This also fixes the underlying math: annualTotalSum is
  // each subject's First+Second+Third total added up across the whole
  // class, so it's ~3x a single term's total; dividing by subjects.length
  // alone (the old code) overstated the average roughly 3-fold. Dividing by
  // subjects × terms-per-session brings it back to a normal 0–100 scale.
  const TERMS_PER_SESSION = 3;
  const annualAverageDenominator = classInfo.subjects.length * TERMS_PER_SESSION;
  const annualAverage = annualAverageDenominator ? annualTotalSum / annualAverageDenominator : 0;
  cell(sheet, r(42), 11, annualTotalSum, { align: "center", bold: true, size: 24, color: NAVY, border: true });
  cell(sheet, r(44), 11, annualAverageDenominator, { align: "center", bold: true, size: 24, color: NAVY, border: true });
  merge(sheet, r(42), 12, r(44), 12);
  cell(sheet, r(42), 12, "=", { align: "center", size: 26, color: NAVY, border: true });
  merge(sheet, r(42), 13, r(44), 14);
  cell(sheet, r(42), 13, Math.round(annualAverage * 100) / 100, { align: "center", bold: true, size: 36, color: NAVY, border: true });

  merge(sheet, r(45), 9, r(46), 11);
  cell(sheet, r(45), 9, "CUMMULATIVE POSITION:", { bold: true, size: 26, color: NAVY, border: true });
  merge(sheet, r(45), 12, r(46), 14);
  cell(sheet, r(45), 12, student.cumulativePosition ?? "", { align: "center", bold: true, size: 28, color: NAVY, border: true });

  // Comment box sits in the left ~2/3 of the row (cols 9-12), KEY TO RATING
  // takes the right column pair (13-14) beside it — same footprint as the
  // reference layout, and critically the two no longer share column 13, so
  // nothing here collides with the signature block below.
  merge(sheet, r(47), 9, r(47), 10);
  cell(sheet, r(47), 9, "COMMENT:", { bold: true, size: 22, color: NAVY, border: true });
  merge(sheet, r(47), 11, r(47), 12);
  cell(sheet, r(47), 11, student.promotionComment || "", { bold: true, size: 24, color: NAVY, align: "left", border: true });

  bandHeader(sheet, r(47), 13, r(47), 14, "KEY TO RATING", { size: 18, border: true });
  const RATING_KEY = ["A = Excellent", "B = V.Good", "C = Good", "D = Pass", "E = Fair", "F = Fail"];
  RATING_KEY.forEach((line, i) => {
    const row = r(48 + i);
    merge(sheet, row, 13, row, 14);
    cell(sheet, row, 13, line, { bold: true, size: 16, color: NAVY, border: true });
  });

  merge(sheet, r(55), 1, r(55), 2);
  cell(sheet, r(55), 1, "Form Master's Remark: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(55), 5, r(55), 13);
  cell(sheet, r(55), 5, student.formMasterRemark || "", { bold: true, size: 24, align: "left", wrap: false });
  merge(sheet, r(56), 1, r(56), 2);
  cell(sheet, r(56), 1, "Signature/Date: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(56), 9, r(56), 11);
  cell(sheet, r(56), 9, student.signatureDate || "", { bold: true, size: 18, color: NAVY, align: "center", wrap: false });
  placeSignature(sheet, r(55), 3, formMasterSigImageId);

  merge(sheet, r(58), 1, r(58), 2);
  cell(sheet, r(58), 1, "Principal's Remark: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(58), 5, r(58), 13);
  cell(sheet, r(58), 5, student.principalRemark || "", { bold: true, size: 24, align: "left", wrap: false });
  merge(sheet, r(59), 1, r(59), 2);
  cell(sheet, r(59), 1, "Signature/Date: ", { bold: true, size: 24, color: BLUE, wrap: false });
  merge(sheet, r(59), 9, r(59), 11);
  cell(sheet, r(59), 9, student.signatureDate || "", { bold: true, size: 18, color: NAVY, align: "center", wrap: false });
  placeSignature(sheet, r(58), 3, principalSigImageId);
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * @param {Object} school     { name, address, ministry, logoUrl, govLogoUrl,
 *                               formMasterSigUrl, principalSigUrl }
 * @param {Object} classInfo  { className, level, stream, session, term, noInClass,
 *                               termEndingDate, nextTermBegins, subjects: [{id,name}],
 *                               weights: {ca1,ca2,test1,test2,exam} }
 * @param {Array}  students   [{ id, fullName, examNo, sex, stateOfOrigin, lga,
 *                               scores: {subjectId: {ca1,ca2,test1,test2,exam,total,
 *                                                     classAvg,position,grade,remark}},
 *                               overallPosition, overallAverage,
 *                               behaviour: {criterion: 'A'|'B'|'C'|'D'|'E'},
 *                               formMasterRemark, principalRemark, signatureDate,
 *                               // Third Term only:
 *                               cumulativePosition, promotionComment }]
 * @param {Object} options    { isThirdTerm: boolean,
 *                               cumulative: { [studentId]: { [subjectId]: { term1, term2 } } },
 *                               colors: { navy, blue, lightBlue, white, black } — optional,
 *                                 partial overrides for the report's color scheme. Each value
 *                                 can be a "#rrggbb" string (what an HTML color input gives you)
 *                                 or an ARGB string. Any color left out keeps the template's
 *                                 original default — see DEFAULT_COLORS. }
 */
export async function exportClassResults(school, classInfo, students, options = {}) {
  // Re-theme the module's color tokens for this export. Must happen before
  // any writeXBlock() call below, since those (and the cell/bandHeader
  // helpers they use) read NAVY/BLUE/LIGHT_BLUE/WHITE/BLACK as free
  // variables rather than taking colors as an argument.
  applyColorTheme(options.colors);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(classInfo.term || "Result");
  const isThirdTerm = !!options.isThirdTerm;
  const colCount = isThirdTerm ? 14 : 11;
  // Fixed widths lifted straight from the real template — NOT autosized —
  // so every export lines up with the printed report regardless of how
  // long any particular student's data happens to be.
  const columnWidths = isThirdTerm ? COLUMN_WIDTHS_THIRD : COLUMN_WIDTHS_SINGLE;
  for (let i = 1; i <= colCount; i++) sheet.getColumn(i).width = columnWidths[i - 1];

  // Both logos, plus the Principal's and Form Master's signature images, are
  // fetched once and re-used (by ExcelJS image id) across every student
  // block, rather than re-downloaded per student. Previously only the logos
  // were wired up here — the signature URLs were saved by the Settings page
  // but never fetched or embedded, which is why the "Signature/Date:" line
  // showed the date text but no actual signature image.
  const [govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId] = await Promise.all([
    registerImage(wb, school.govLogoUrl),
    registerImage(wb, school.logoUrl),
    registerImage(wb, school.formMasterSigUrl),
    registerImage(wb, school.principalSigUrl),
  ]);

  // --- Print / page setup: one student block per A4 page ---------------
  // fitToWidth:1 scales columns to fit a single A4 sheet width. Each
  // student's 60-row block (with the template's real row heights applied)
  // is taller than one printable page at 100% scale, so fitToHeight must be
  // set to the actual page count (one per student) rather than left
  // unconstrained (0) — otherwise Excel auto-breaks each block across two
  // physical pages, orphaning the remarks/signature rows onto their own
  // page. Manual row breaks after every block still guarantee each student
  // starts on a fresh page.
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: isThirdTerm ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: students.length,
    horizontalCentered: true,
    margins: {
      left: 0.35,
      right: 0.35,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
    printArea: `A1:${sheet.getColumn(colCount).letter}${BLOCK_HEIGHT * students.length}`,
  };

  // --- Order pages by class position: 1st position -> first page --------
  // `overallPosition` may come in as a plain number (1, 2, 3...) or a
  // formatted string ("1st", "2nd", "3rd"...), so pull the leading digits
  // out rather than assuming a type. Students with a missing/unparseable
  // position are pushed to the end instead of sorting to the top (which is
  // what would happen with a naive numeric sort, since NaN comparisons are
  // unreliable and 0/undefined would otherwise look like "first").
  const positionOf = (student) => {
    const raw = student.overallPosition;
    if (raw === null || raw === undefined) return Infinity;
    const match = String(raw).match(/\d+/);
    return match ? parseInt(match[0], 10) : Infinity;
  };
  const orderedStudents = [...students].sort((a, b) => positionOf(a) - positionOf(b));

  let top = 1;
  orderedStudents.forEach((student, i) => {
    if (isThirdTerm) {
      writeThirdTermBlock(sheet, top, school, classInfo, student, student.scores, options.cumulative?.[student.id], govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId);
    } else {
      writeSingleTermBlock(sheet, top, school, classInfo, student, student.scores, govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId);
    }
    const isLastStudent = i === students.length - 1;
    if (!isLastStudent) {
      // Force a page break after this student's block so the next one
      // always starts at the top of a new A4 page when printed/exported.
      sheet.getRow(top + BLOCK_HEIGHT - 1).addPageBreak();
    }
    top += BLOCK_HEIGHT;
  });

  return wb.xlsx.writeBuffer();
}

/** Convenience: trigger a browser download from the ArrayBuffer returned above. */
export function downloadWorkbook(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Same report card layout as exportClassResults, but for combining several
 * streams of one level (e.g. SS1 Science + SS1 Art + SS1 Commercial) into a
 * single downloaded workbook, with ONE shared position ranking across all of
 * them — for schools that want a whole-level compilation rather than each
 * stream ranked only against itself.
 *
 * Each group keeps its OWN subjects/className when its students' blocks are
 * written (since streams take different subjects, comparing subject-by-
 * subject across streams wouldn't make sense) — only the caller-supplied
 * `overallPosition`/`overallAverage` on each student is expected to already
 * reflect the combined, whole-level ranking (compute that with
 * resultEngine's rankWithTies over every student's own average, pooled
 * across all groups, before calling this).
 *
 * @param {Object} school   same shape as exportClassResults
 * @param {Array}  groups   [{ classInfo, students }, ...] — one entry per
 *                            stream, each classInfo carrying that stream's
 *                            own subjects/className/stream label
 * @param {Object} options  { isThirdTerm, cumulative, colors, sheetTitle }
 *                            `cumulative` is keyed by studentId same as
 *                            exportClassResults, pooled across all groups.
 */
export async function exportCombinedResults(school, groups, options = {}) {
  applyColorTheme(options.colors);

  const wb = new ExcelJS.Workbook();
  const isThirdTerm = !!options.isThirdTerm;
  const colCount = isThirdTerm ? 14 : 11;
  const columnWidths = isThirdTerm ? COLUMN_WIDTHS_THIRD : COLUMN_WIDTHS_SINGLE;
  const sheet = wb.addWorksheet(options.sheetTitle || groups[0]?.classInfo?.term || "Result");
  for (let i = 1; i <= colCount; i++) sheet.getColumn(i).width = columnWidths[i - 1];

  const [govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId] = await Promise.all([
    registerImage(wb, school.govLogoUrl),
    registerImage(wb, school.logoUrl),
    registerImage(wb, school.formMasterSigUrl),
    registerImage(wb, school.principalSigUrl),
  ]);

  const totalStudents = groups.reduce((n, g) => n + g.students.length, 0);
  sheet.pageSetup = {
    paperSize: 9,
    orientation: isThirdTerm ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: totalStudents,
    horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printArea: `A1:${sheet.getColumn(colCount).letter}${BLOCK_HEIGHT * totalStudents}`,
  };

  const positionOf = (student) => {
    const raw = student.overallPosition;
    if (raw === null || raw === undefined) return Infinity;
    const match = String(raw).match(/\d+/);
    return match ? parseInt(match[0], 10) : Infinity;
  };
  // Flatten every group's students, tagging each with the classInfo (own
  // subjects/className/stream) its block should be written with, then sort
  // the WHOLE combined set by position so pages read 1st -> last regardless
  // of which stream each student happens to be in.
  const flattened = groups.flatMap((g) => g.students.map((s) => ({ ...s, __classInfo: g.classInfo })));
  const ordered = [...flattened].sort((a, b) => positionOf(a) - positionOf(b));

  let top = 1;
  ordered.forEach((student, i) => {
    const classInfo = student.__classInfo;
    if (isThirdTerm) {
      writeThirdTermBlock(sheet, top, school, classInfo, student, student.scores, options.cumulative?.[student.id], govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId);
    } else {
      writeSingleTermBlock(sheet, top, school, classInfo, student, student.scores, govLogoImageId, schoolLogoImageId, formMasterSigImageId, principalSigImageId);
    }
    if (i !== ordered.length - 1) {
      sheet.getRow(top + BLOCK_HEIGHT - 1).addPageBreak();
    }
    top += BLOCK_HEIGHT;
  });

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------
// Provenance: the row/column map, the visual design (fonts, sizes, colors,
// header fills), AND the row heights / column widths above were measured
// directly from a real filled report (Gaskiya High School, "third_term.xlsx"
// First Term + Third Term sheets, and "JSS2_..._first_term_and_second_term.xlsx")
// using openpyxl to inspect ws.merged_cells.ranges, cell fonts/fills,
// ws.row_dimensions, ws.column_dimensions, and ws.iter_rows(). Everything
// uses Tahoma; labels/values run 18-26pt, table headers 20-28pt, subject
// data cells 26pt, and the school name/ministry banners 45-65pt — these are
// intentionally huge because the template itself uses them, and the
// ROW_HEIGHTS_SINGLE / ROW_HEIGHTS_THIRD arrays exist specifically so those
// large fonts have room to render without clipping. Labels are FF0070C0
// (mid blue), key figures/headings are FF002060 (navy), the sub-headline
// banners are FF00B0F0 (light blue), and section bands ("ACADEMIC RECORDS",
// "CORE SUBJECTS", "Ratings", "KEY TO RATING", "ANNUAL SUMMARY") are
// white-on-navy fills. Column widths are fixed (COLUMN_WIDTHS_SINGLE /
// COLUMN_WIDTHS_THIRD) rather than autosized, so exports always line up
// with the printed template regardless of how long any given student's data
// is. If the school changes their template later, re-run that inspection on
// a fresh sample (row_dimensions/column_dimensions + per-cell font sizes)
// and update the two writeXBlock() functions and the four lookup tables at
// the top of this file — nothing else in the app depends on this file's
// internals.
// ---------------------------------------------------------------------------