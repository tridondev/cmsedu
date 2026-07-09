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
// -------------------------------------------------------------------------
const FONT = "Tahoma";
const NAVY = "FF002060"; // headings, subject names, key figures
const BLUE = "FF0070C0"; // field labels, behaviour rows
const LIGHT_BLUE = "FF00B0F0"; // sub-headline banner text
const WHITE = "FFFFFFFF"; // text sitting on a navy fill band
const BLACK = "FF000000";

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

/** A cell that also fills its whole merged range with a solid color. */
function bandHeader(sheet, r1, c1, r2, c2, value, opts = {}) {
  merge(sheet, r1, c1, r2, c2);
  return cell(sheet, r1, c1, value, { fill: NAVY, color: WHITE, bold: true, align: "center", ...opts });
}

// -------------------------------------------------------------------------
// Logo embedding
// -------------------------------------------------------------------------
/**
 * Fetches the school logo (if a URL is configured) once per export and
 * returns an ExcelJS image id, or null if unavailable/unset. Failures here
 * never abort the export — the report is still fully usable without a logo.
 */
async function registerLogo(wb, logoUrl) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const extension = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpeg";
    const buffer = await res.arrayBuffer();
    return wb.addImage({ buffer, extension });
  } catch {
    return null; // e.g. CORS-blocked host or network error — skip silently
  }
}

/** Places the logo near the top-left of a block, roughly matching the source template's badge position. */
function placeLogo(sheet, logoImageId, top) {
  if (logoImageId == null) return;
  sheet.addImage(logoImageId, {
    tl: { col: 0.15, row: top - 1 + 0.1 },
    ext: { width: 70, height: 70 },
  });
}

// -------------------------------------------------------------------------
// SINGLE TERM layout (First / Second Term) — columns A..K (1..11)
// -------------------------------------------------------------------------
function writeSingleTermBlock(sheet, top, school, classInfo, student, subjectScores, logoImageId) {
  const r = (offset) => top + offset; // offset 0 == the block's row 1 (school name)

  placeLogo(sheet, logoImageId, r(0));

  merge(sheet, r(0), 1, r(0), 11);
  cell(sheet, r(0), 1, school.name, { bold: true, align: "center", size: 22, color: NAVY });
  merge(sheet, r(1), 1, r(1), 11);
  cell(sheet, r(1), 1, school.address, { align: "center", size: 11, bold: true, color: LIGHT_BLUE });
  merge(sheet, r(2), 1, r(2), 11);
  cell(sheet, r(2), 1, school.ministry, { bold: true, align: "center", size: 15, color: NAVY });
  merge(sheet, r(3), 1, r(3), 11);
  cell(sheet, r(3), 1, "JUNIOR SECONDARY SCHOOL TERMLY REPORT", { bold: true, align: "center", size: 13, color: LIGHT_BLUE });

  const LBL = { bold: true, size: 11, color: BLUE };
  const VAL = { bold: true, size: 11, color: BLACK };

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

  bandHeader(sheet, r(12), 2, r(12), 11, "ACADEMIC RECORDS", { size: 13 });

  const THEAD = { bold: true, align: "center", size: 11, color: NAVY };
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
  cell(sheet, r(15), 2, 0.1, THEAD);
  merge(sheet, r(15), 3, r(16), 3);
  cell(sheet, r(15), 3, 0.1, THEAD);
  merge(sheet, r(15), 4, r(16), 4);
  cell(sheet, r(15), 4, 0.2, THEAD);
  merge(sheet, r(15), 5, r(16), 5);
  cell(sheet, r(15), 5, 0.2, THEAD);
  merge(sheet, r(15), 6, r(16), 6);
  cell(sheet, r(15), 6, 0.4, THEAD);
  cell(sheet, r(15), 7, "Scores", THEAD);

  bandHeader(sheet, r(16), 1, r(16), 1, "CORE SUBJECTS", { align: "left", size: 11 });
  cell(sheet, r(16), 7, 1, THEAD);
  cell(sheet, r(16), 8, "Average", THEAD);
  cell(sheet, r(16), 9, "Position", THEAD);
  cell(sheet, r(16), 10, "Grade", THEAD);

  let total = 0;
  classInfo.subjects.forEach((subject, i) => {
    const row = r(17 + i);
    const s = subjectScores?.[subject.id] || {};
    cell(sheet, row, 1, subject.name, { bold: true, size: 10, color: NAVY });
    cell(sheet, row, 2, s.ca1 ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 3, s.ca2 ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 4, s.test1 ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 5, s.test2 ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 6, s.exam ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 7, s.total ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 8, s.classAvg ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 9, s.position ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 10, s.grade ?? "", { border: true, align: "center", size: 11, bold: true });
    cell(sheet, row, 11, s.remark ?? "", { size: 11, bold: true });
    total += Number(s.total || 0);
  });

  const totalRow = r(37);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL =", { bold: true, size: 13 });
  cell(sheet, totalRow, 2, Math.round(total * 100) / 100, { bold: true, size: 13 });
  merge(sheet, totalRow, 6, r(38), 7);
  cell(sheet, totalRow, 6, "AVERAGE:", { bold: true, align: "center", size: 13 });
  cell(sheet, totalRow, 11, Math.round(average * 100) / 100, { bold: true, align: "center", size: 13 });
  cell(sheet, r(38), 8, classInfo.subjects.length, { align: "center", bold: true, size: 13 });

  bandHeader(sheet, r(40), 4, r(40), 8, "Ratings", { size: 11 });
  merge(sheet, r(41), 1, r(41), 3);
  cell(sheet, r(41), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true, size: 11, color: BLUE });
  BAND_LETTERS.forEach((band, i) => cell(sheet, r(41), 4 + i, band, { bold: true, align: "center", size: 11, color: BLUE }));
  cell(sheet, r(41), 10, "KEY TO RATING", { bold: true, size: 11, color: NAVY });

  const RATING_KEY = ["A = Excellent", "B = V.Good", "C = Good", "D = Pass", "E = Fair", "F = Fail"];
  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(42 + i);
    merge(sheet, row, 1, row, 3);
    cell(sheet, row, 1, criterion, { size: 11, color: BLUE });
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    if (bandIdx >= 0) cell(sheet, row, 4 + bandIdx, "\u00fc", { align: "center", fontName: "Wingdings", size: 18, color: BLUE });
    if (RATING_KEY[i]) cell(sheet, row, 10, RATING_KEY[i], { bold: true, size: 10, color: NAVY });
  });

  cell(sheet, r(55), 1, "Form Master's Remark: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(55), 3, r(55), 10);
  cell(sheet, r(55), 3, student.formMasterRemark || "", { bold: true, size: 11 });
  cell(sheet, r(56), 1, "Signature/Date: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(56), 3, r(56), 8);
  cell(sheet, r(56), 3, student.signatureDate || "", { bold: true, size: 10, color: NAVY, align: "center" });

  cell(sheet, r(58), 1, "Principal's Remark: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(58), 3, r(58), 10);
  cell(sheet, r(58), 3, student.principalRemark || "", { bold: true, size: 11 });
  cell(sheet, r(59), 1, "Signature/Date: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(59), 3, r(59), 8);
  cell(sheet, r(59), 3, student.signatureDate || "", { bold: true, size: 10, color: NAVY, align: "center" });
}

// -------------------------------------------------------------------------
// THIRD TERM layout — columns A..N (1..14), adds Previous/Annual columns
// -------------------------------------------------------------------------
function writeThirdTermBlock(sheet, top, school, classInfo, student, subjectScores, cumulative, logoImageId) {
  const r = (offset) => top + offset;

  placeLogo(sheet, logoImageId, r(0));

  merge(sheet, r(0), 1, r(0), 14);
  cell(sheet, r(0), 1, school.name, { bold: true, align: "center", size: 22, color: NAVY });
  merge(sheet, r(1), 1, r(1), 14);
  cell(sheet, r(1), 1, school.address, { align: "center", size: 10, bold: true, color: LIGHT_BLUE });
  merge(sheet, r(2), 1, r(2), 14);
  cell(sheet, r(2), 1, school.ministry, { bold: true, align: "center", size: 15, color: NAVY });
  merge(sheet, r(3), 1, r(3), 14);
  cell(sheet, r(3), 1, "JUNIOR SECONDARY SCHOOL TERMLY REPORT", { bold: true, align: "center", size: 13, color: LIGHT_BLUE });

  const LBL = { bold: true, size: 11, color: BLUE };
  const VAL = { bold: true, size: 11, color: BLACK };

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

  bandHeader(sheet, r(11), 4, r(11), 14, "ACADEMIC RECORDS", { size: 13 });

  const THEAD = { bold: true, align: "center", size: 11, color: NAVY };
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
  cell(sheet, r(14), 2, "Previous", { fill: NAVY, color: WHITE, bold: true, align: "center", size: 11 });
  merge(sheet, r(14), 4, r(15), 4);
  cell(sheet, r(14), 4, 0.1, THEAD);
  merge(sheet, r(14), 5, r(15), 5);
  cell(sheet, r(14), 5, 0.1, THEAD);
  merge(sheet, r(14), 6, r(15), 6);
  cell(sheet, r(14), 6, 0.2, THEAD);
  merge(sheet, r(14), 7, r(15), 7);
  cell(sheet, r(14), 7, 0.2, THEAD);
  merge(sheet, r(14), 8, r(15), 8);
  cell(sheet, r(14), 8, 0.4, THEAD);
  cell(sheet, r(14), 9, "Scores", THEAD);

  bandHeader(sheet, r(15), 1, r(15), 1, "CORE SUBJECTS", { align: "left", size: 11 });
  merge(sheet, r(15), 2, r(15), 3);
  cell(sheet, r(15), 2, "Summary", { fill: NAVY, color: WHITE, bold: true, align: "center", size: 10 });
  cell(sheet, r(15), 9, 1, THEAD);
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
    cell(sheet, row, 1, subject.name, { bold: true, size: 10, color: NAVY });
    cell(sheet, row, 2, prev1, { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 3, prev2, { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 4, s.ca1 ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 5, s.ca2 ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 6, s.test1 ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 7, s.test2 ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 8, s.exam ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 9, s.total ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 10, s.classAvg ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 11, s.position ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 12, annual, { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 13, s.grade ?? "", { border: true, align: "center", bold: true, size: 11 });
    cell(sheet, row, 14, s.remark ?? "", { bold: true, size: 11 });
    total += Number(s.total || 0);
    annualTotalSum += annual;
  });

  const totalRow = r(36);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL", { bold: true, size: 13 });
  merge(sheet, totalRow, 8, r(37), 9);
  cell(sheet, totalRow, 8, "AVERAGE:", { bold: true, align: "center", size: 13 });
  merge(sheet, totalRow, 10, totalRow, 11);
  cell(sheet, totalRow, 10, Math.round(total * 100) / 100, { bold: true, align: "center", size: 13 });
  merge(sheet, totalRow, 13, r(37), 13);
  cell(sheet, totalRow, 13, "=", { align: "center", size: 13 });
  merge(sheet, totalRow, 14, r(37), 14);
  cell(sheet, totalRow, 14, Math.round(average * 100) / 100, { bold: true, align: "center", size: 13 });
  merge(sheet, r(37), 10, r(37), 11);
  cell(sheet, r(37), 10, classInfo.subjects.length, { align: "center", bold: true, size: 13 });

  bandHeader(sheet, r(39), 3, r(39), 7, "Ratings", { size: 11 });
  bandHeader(sheet, r(39), 9, r(39), 14, "ANNUAL SUMMARY", { size: 12 });

  merge(sheet, r(40), 1, r(40), 2);
  cell(sheet, r(40), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true, size: 10, color: BLUE });
  BAND_LETTERS.forEach((band, i) => cell(sheet, r(40), 3 + i, band, { bold: true, align: "center", size: 11, color: BLUE }));
  merge(sheet, r(40), 9, r(41), 10);
  cell(sheet, r(40), 9, "ANNUAL TOTAL = ", { bold: true, size: 12, color: NAVY });
  merge(sheet, r(40), 11, r(41), 14);
  cell(sheet, r(40), 11, annualTotalSum || student.annualTotal || "", { align: "center", bold: true, size: 16, color: NAVY });

  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(41 + i);
    merge(sheet, row, 1, row, 2);
    cell(sheet, row, 1, criterion, { size: 11, color: BLUE });
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    if (bandIdx >= 0) cell(sheet, row, 3 + bandIdx, "\u00fc", { align: "center", fontName: "Wingdings", size: 18, color: BLUE });
  });

  merge(sheet, r(42), 9, r(44), 10);
  cell(sheet, r(42), 9, "ANNUAL AVERAGE = ", { bold: true, size: 10, color: NAVY });
  merge(sheet, r(42), 11, r(43), 11);
  const annualAverage = classInfo.subjects.length ? annualTotalSum / classInfo.subjects.length : 0;
  cell(sheet, r(42), 11, Math.round(annualAverage * 100) / 100, { align: "center", bold: true, size: 16, color: NAVY });

  merge(sheet, r(45), 9, r(46), 11);
  cell(sheet, r(45), 9, "CUMMULATIVE POSITION:", { bold: true, size: 11, color: NAVY });
  merge(sheet, r(45), 12, r(46), 14);
  cell(sheet, r(45), 12, student.cumulativePosition ?? "", { align: "center", bold: true, size: 13, color: NAVY });

  cell(sheet, r(47), 9, `COMMENT: ${student.promotionComment || ""}`, { bold: true, size: 13, color: NAVY });
  merge(sheet, r(50), 13, r(56), 13);
  cell(sheet, r(50), 13, "KEY TO RATING", { bold: true, fill: NAVY, color: WHITE, align: "center", size: 11 });
  const RATING_KEY = ["A = Excellent", "B = V.Good", "C = Good", "D = Pass", "E = Fair", "F = Fail"];
  RATING_KEY.forEach((line, i) => cell(sheet, r(51 + i), 13, line, { bold: true, size: 10, color: NAVY }));

  cell(sheet, r(55), 1, "Form Master's Remark: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(55), 5, r(55), 13);
  cell(sheet, r(55), 5, student.formMasterRemark || "", { bold: true, size: 11 });
  cell(sheet, r(56), 1, "Signature/Date: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(56), 9, r(56), 11);
  cell(sheet, r(56), 9, student.signatureDate || "", { bold: true, size: 10, color: NAVY, align: "center" });

  cell(sheet, r(58), 1, "Principal's Remark: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(58), 5, r(58), 13);
  cell(sheet, r(58), 5, student.principalRemark || "", { bold: true, size: 11 });
  cell(sheet, r(59), 1, "Signature/Date: ", { bold: true, size: 11, color: BLUE });
  merge(sheet, r(59), 9, r(59), 11);
  cell(sheet, r(59), 9, student.signatureDate || "", { bold: true, size: 10, color: NAVY, align: "center" });
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * @param {Object} school     { name, address, ministry, logoUrl }
 * @param {Object} classInfo  { className, level, stream, session, term, noInClass,
 *                               termEndingDate, nextTermBegins, subjects: [{id,name}] }
 * @param {Array}  students   [{ id, fullName, examNo, sex, stateOfOrigin, lga,
 *                               scores: {subjectId: {ca1,ca2,test1,test2,exam,total,
 *                                                     classAvg,position,grade,remark}},
 *                               overallPosition, overallAverage,
 *                               behaviour: {criterion: 'A'|'B'|'C'|'D'|'E'},
 *                               formMasterRemark, principalRemark, signatureDate,
 *                               // Third Term only:
 *                               cumulativePosition, promotionComment }]
 * @param {Object} options    { isThirdTerm: boolean,
 *                               cumulative: { [studentId]: { [subjectId]: { term1, term2 } } } }
 */
export async function exportClassResults(school, classInfo, students, options = {}) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(classInfo.term || "Result");
  const isThirdTerm = !!options.isThirdTerm;
  const colCount = isThirdTerm ? 14 : 11;
  for (let i = 1; i <= colCount; i++) sheet.getColumn(i).width = 11;
  sheet.getColumn(1).width = 22;

  // Logo is fetched once and re-used (by ExcelJS image id) across every
  // student block, rather than re-downloaded per student.
  const logoImageId = await registerLogo(wb, school.logoUrl);

  // --- Print / page setup: one student block per A4 page ---------------
  // fitToWidth:1 scales each page's columns to fit a single A4 sheet width;
  // fitToHeight:0 leaves height unconstrained (each block is a fixed 60-row
  // height, so it naturally fills close to one page). Manual row breaks
  // after every block guarantee the next student always starts on a fresh
  // page, regardless of Excel's automatic pagination.
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: isThirdTerm ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
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

  let top = 1;
  students.forEach((student, i) => {
    if (isThirdTerm) {
      writeThirdTermBlock(sheet, top, school, classInfo, student, student.scores, options.cumulative?.[student.id], logoImageId);
    } else {
      writeSingleTermBlock(sheet, top, school, classInfo, student, student.scores, logoImageId);
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

// ---------------------------------------------------------------------------
// Provenance: the row/column map AND the visual design (fonts, sizes, colors,
// header fills) above were reverse-engineered from a real filled report
// (Gaskiya High School, "third_term.xlsx" First Term + Third Term sheets, and
// "JSS2_..._first_term_and_second_term.xlsx") using openpyxl to inspect
// ws.merged_cells.ranges, cell fonts/fills, and ws.iter_rows(). Everything
// uses Tahoma; labels are FF0070C0 (mid blue), key figures/headings are
// FF002060 (navy), the sub-headline banners are FF00B0F0 (light blue), and
// section bands ("ACADEMIC RECORDS", "CORE SUBJECTS", "Ratings", "KEY TO
// RATING", "ANNUAL SUMMARY") are white-on-navy fills. If the school changes
// their template later, re-run that inspection on a fresh sample and update
// the two writeXBlock() functions — nothing else in the app depends on this
// file's internals.
// ---------------------------------------------------------------------------
