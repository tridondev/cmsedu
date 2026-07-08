// src/lib/exportToExcel.js
//
// Builds result sheets that match the real Gaskiya High School report card
// layout exactly. The column/merge positions below were extracted directly
// from an actual filled report (not guessed) — see the "Provenance" note at
// the bottom of this file if you ever need to re-derive them from a new
// sample file.
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

const BLOCK_HEIGHT = 60;

const BAND_LETTERS = ["A", "B", "C", "D", "E"]; // behaviour rating bands

/** Utility: set a cell's value, optionally merging a range and applying basic style. */
function cell(sheet, row, col, value, opts = {}) {
  const c = sheet.getRow(row).getCell(col);
  c.value = value;
  if (opts.bold) c.font = { ...(c.font || {}), bold: true };
  if (opts.align) c.alignment = { horizontal: opts.align, vertical: "middle", wrapText: true };
  if (opts.border) {
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  }
  return c;
}

function merge(sheet, r1, c1, r2, c2) {
  try {
    sheet.mergeCells(r1, c1, r2, c2);
  } catch {
    /* already merged from a previous block write at same relative offset — ignore */
  }
}

// -------------------------------------------------------------------------
// SINGLE TERM layout (First / Second Term) — columns A..K (1..11)
// -------------------------------------------------------------------------
function writeSingleTermBlock(sheet, top, school, classInfo, student, subjectScores) {
  const r = (offset) => top + offset; // offset 0 == the block's row 1 (school name)

  merge(sheet, r(0), 1, r(0), 11);
  cell(sheet, r(0), 1, school.name, { bold: true, align: "center" });
  merge(sheet, r(1), 1, r(1), 11);
  cell(sheet, r(1), 1, school.address, { align: "center" });
  merge(sheet, r(2), 1, r(2), 11);
  cell(sheet, r(2), 1, school.ministry, { align: "center" });
  merge(sheet, r(3), 1, r(3), 11);
  cell(sheet, r(3), 1, "JUNIOR SECONDARY SCHOOL TERMLY REPORT", { bold: true, align: "center" });

  cell(sheet, r(5), 1, "Name of Student: ");
  merge(sheet, r(5), 2, r(5), 6);
  cell(sheet, r(5), 2, student.fullName);
  cell(sheet, r(5), 7, "Exam No.:");
  cell(sheet, r(5), 8, student.examNo);
  cell(sheet, r(5), 9, "Class:");
  merge(sheet, r(5), 10, r(5), 11);
  cell(sheet, r(5), 10, classInfo.className);

  cell(sheet, r(6), 1, "State of Origin: ");
  merge(sheet, r(6), 2, r(6), 3);
  cell(sheet, r(6), 2, student.stateOfOrigin);
  cell(sheet, r(6), 4, "LGA:");
  merge(sheet, r(6), 5, r(6), 8);
  cell(sheet, r(6), 5, student.lga);
  cell(sheet, r(6), 9, "Sex:");
  merge(sheet, r(6), 10, r(6), 11);
  cell(sheet, r(6), 10, student.sex);

  cell(sheet, r(7), 1, "Term:");
  cell(sheet, r(7), 2, `${classInfo.term} ${classInfo.session} Session`);
  cell(sheet, r(7), 6, "No. in Class: ");
  cell(sheet, r(7), 8, classInfo.noInClass);
  cell(sheet, r(7), 9, "Position: ");
  merge(sheet, r(7), 10, r(7), 11);
  cell(sheet, r(7), 10, student.overallPosition ?? "");

  cell(sheet, r(8), 1, "Term Ending:");
  cell(sheet, r(8), 2, classInfo.termEndingDate);
  cell(sheet, r(8), 6, "Next Term Begins:");
  cell(sheet, r(8), 8, classInfo.nextTermBegins);

  cell(sheet, r(9), 1, "School Fees Paid: ");
  merge(sheet, r(9), 3, r(9), 5);
  cell(sheet, r(9), 6, "Fees Owed:");
  merge(sheet, r(9), 8, r(9), 11);

  merge(sheet, r(12), 2, r(12), 11);
  cell(sheet, r(12), 2, "ACADEMIC RECORDS", { bold: true, align: "center" });

  merge(sheet, r(13), 2, r(13), 5);
  cell(sheet, r(13), 2, "ASSIGNMENTS/TEST", { bold: true, align: "center" });
  cell(sheet, r(13), 6, "EXAM", { bold: true, align: "center" });
  merge(sheet, r(13), 7, r(14), 7);
  cell(sheet, r(13), 7, "Total", { bold: true, align: "center" });
  merge(sheet, r(13), 8, r(15), 8);
  cell(sheet, r(13), 8, "Class", { bold: true, align: "center" });
  merge(sheet, r(13), 9, r(15), 9);
  cell(sheet, r(13), 9, "Subject", { bold: true, align: "center" });
  merge(sheet, r(13), 11, r(16), 11);
  cell(sheet, r(13), 11, "Remarks", { bold: true, align: "center" });

  merge(sheet, r(14), 2, r(14), 3);
  cell(sheet, r(14), 2, "Assignment", { align: "center" });
  cell(sheet, r(14), 4, "Test", { align: "center" });
  cell(sheet, r(14), 5, "Test", { align: "center" });
  cell(sheet, r(14), 6, "Marks", { align: "center" });

  merge(sheet, r(15), 2, r(16), 2);
  cell(sheet, r(15), 2, 0.1, { align: "center" });
  merge(sheet, r(15), 3, r(16), 3);
  cell(sheet, r(15), 3, 0.1, { align: "center" });
  merge(sheet, r(15), 4, r(16), 4);
  cell(sheet, r(15), 4, 0.2, { align: "center" });
  merge(sheet, r(15), 5, r(16), 5);
  cell(sheet, r(15), 5, 0.2, { align: "center" });
  merge(sheet, r(15), 6, r(16), 6);
  cell(sheet, r(15), 6, 0.4, { align: "center" });
  cell(sheet, r(15), 7, "Scores", { align: "center" });

  cell(sheet, r(16), 1, "CORE SUBJECTS", { bold: true });
  cell(sheet, r(16), 7, 1, { align: "center" });
  cell(sheet, r(16), 8, "Average", { bold: true, align: "center" });
  cell(sheet, r(16), 9, "Position", { bold: true, align: "center" });
  cell(sheet, r(16), 10, "Grade", { bold: true, align: "center" });

  let total = 0;
  classInfo.subjects.forEach((subject, i) => {
    const row = r(17 + i);
    const s = subjectScores?.[subject.id] || {};
    cell(sheet, row, 1, subject.name);
    cell(sheet, row, 2, s.ca1 ?? "", { border: true, align: "center" });
    cell(sheet, row, 3, s.ca2 ?? "", { border: true, align: "center" });
    cell(sheet, row, 4, s.test1 ?? "", { border: true, align: "center" });
    cell(sheet, row, 5, s.test2 ?? "", { border: true, align: "center" });
    cell(sheet, row, 6, s.exam ?? "", { border: true, align: "center" });
    cell(sheet, row, 7, s.total ?? "", { border: true, align: "center", bold: true });
    cell(sheet, row, 8, s.classAvg ?? "", { border: true, align: "center" });
    cell(sheet, row, 9, s.position ?? "", { border: true, align: "center" });
    cell(sheet, row, 10, s.grade ?? "", { border: true, align: "center" });
    cell(sheet, row, 11, s.remark ?? "");
    total += Number(s.total || 0);
  });

  const totalRow = r(37);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL =", { bold: true });
  cell(sheet, totalRow, 2, Math.round(total * 100) / 100, { bold: true });
  merge(sheet, totalRow, 6, r(38), 7);
  cell(sheet, totalRow, 6, "AVERAGE:", { bold: true, align: "center" });
  cell(sheet, totalRow, 11, Math.round(average * 100) / 100, { bold: true, align: "center" });
  cell(sheet, r(38), 8, classInfo.subjects.length, { align: "center" });

  merge(sheet, r(40), 4, r(40), 8);
  cell(sheet, r(40), 4, "Ratings", { bold: true, align: "center" });
  merge(sheet, r(41), 1, r(41), 3);
  cell(sheet, r(41), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true });
  ["A", "B", "C", "D", "E"].forEach((band, i) => cell(sheet, r(41), 4 + i, band, { bold: true, align: "center" }));
  cell(sheet, r(41), 10, "KEY TO RATING", { bold: true });

  const RATING_KEY = ["A = Excellent", "B = V.Good", "C = Good", "D = Pass", "E = Fair", "F = Fail"];
  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(42 + i);
    merge(sheet, row, 1, row, 3);
    cell(sheet, row, 1, criterion);
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    if (bandIdx >= 0) cell(sheet, row, 4 + bandIdx, "\u2713", { align: "center" });
    if (RATING_KEY[i]) cell(sheet, row, 10, RATING_KEY[i]);
  });

  cell(sheet, r(55), 1, "Form Master's Remark: ");
  merge(sheet, r(55), 3, r(55), 10);
  cell(sheet, r(55), 3, student.formMasterRemark || "");
  cell(sheet, r(56), 1, "Signature/Date: ");
  merge(sheet, r(56), 3, r(56), 8);
  cell(sheet, r(56), 3, student.signatureDate || "");

  cell(sheet, r(58), 1, "Principal's Remark: ");
  merge(sheet, r(58), 3, r(58), 10);
  cell(sheet, r(58), 3, student.principalRemark || "");
  cell(sheet, r(59), 1, "Signature/Date: ");
  merge(sheet, r(59), 3, r(59), 8);
  cell(sheet, r(59), 3, student.signatureDate || "");
}

const DEFAULT_BEHAVIOUR_CRITERIA = [
  "Punctuality",
  "Attendance in Class",
  "Attentiveness in Class",
  "Carrying out Assignments",
  "Participation in School Activities",
  "Neatness",
  "Honesty",
  "Self Control",
  "Relationship with Others",
  "Helping Others",
  "Games, Sports",
  "Handling of Tools, Lab & Workshop",
];

// -------------------------------------------------------------------------
// THIRD TERM layout — columns A..N (1..14), adds Previous/Annual columns
// -------------------------------------------------------------------------
function writeThirdTermBlock(sheet, top, school, classInfo, student, subjectScores, cumulative) {
  const r = (offset) => top + offset;

  merge(sheet, r(0), 1, r(0), 14);
  cell(sheet, r(0), 1, school.name, { bold: true, align: "center" });
  merge(sheet, r(1), 1, r(1), 14);
  cell(sheet, r(1), 1, school.address, { align: "center" });
  merge(sheet, r(2), 1, r(2), 14);
  cell(sheet, r(2), 1, school.ministry, { align: "center" });
  merge(sheet, r(3), 1, r(3), 14);
  cell(sheet, r(3), 1, "JUNIOR SECONDARY SCHOOL TERMLY REPORT", { bold: true, align: "center" });

  merge(sheet, r(5), 1, r(5), 2);
  cell(sheet, r(5), 1, "Name of Student: ");
  merge(sheet, r(5), 3, r(5), 8);
  cell(sheet, r(5), 3, student.fullName);
  cell(sheet, r(5), 9, "Exam No.:");
  cell(sheet, r(5), 10, student.examNo);
  merge(sheet, r(5), 11, r(5), 12);
  cell(sheet, r(5), 11, "Class:");
  merge(sheet, r(5), 13, r(5), 14);
  cell(sheet, r(5), 13, classInfo.className);

  merge(sheet, r(6), 1, r(6), 2);
  cell(sheet, r(6), 1, "State of Origin: ");
  merge(sheet, r(6), 3, r(6), 5);
  cell(sheet, r(6), 3, student.stateOfOrigin);
  cell(sheet, r(6), 6, "LGA:");
  merge(sheet, r(6), 7, r(6), 10);
  cell(sheet, r(6), 7, student.lga);
  merge(sheet, r(6), 11, r(6), 12);
  cell(sheet, r(6), 11, "Sex:");
  merge(sheet, r(6), 13, r(6), 14);
  cell(sheet, r(6), 13, student.sex);

  merge(sheet, r(7), 1, r(7), 2);
  cell(sheet, r(7), 1, "Term:");
  merge(sheet, r(7), 3, r(7), 7);
  cell(sheet, r(7), 3, `${classInfo.term} ${classInfo.session} Session`);
  cell(sheet, r(7), 8, "No. in Class: ");
  cell(sheet, r(7), 10, classInfo.noInClass);
  merge(sheet, r(7), 11, r(7), 12);
  cell(sheet, r(7), 11, "Position: ");
  merge(sheet, r(7), 13, r(7), 14);
  cell(sheet, r(7), 13, student.overallPosition ?? "");

  merge(sheet, r(8), 1, r(8), 2);
  cell(sheet, r(8), 1, "Term Ending:");
  merge(sheet, r(8), 3, r(8), 7);
  cell(sheet, r(8), 3, classInfo.termEndingDate);
  cell(sheet, r(8), 8, "Next Term Begins:");
  cell(sheet, r(8), 10, classInfo.nextTermBegins);

  merge(sheet, r(9), 1, r(9), 2);
  cell(sheet, r(9), 1, "School Fees Paid: ");
  merge(sheet, r(9), 5, r(9), 7);
  cell(sheet, r(9), 8, "Fees Owed:");
  merge(sheet, r(9), 10, r(9), 14);

  merge(sheet, r(11), 4, r(11), 14);
  cell(sheet, r(11), 4, "ACADEMIC RECORDS", { bold: true, align: "center" });

  merge(sheet, r(12), 4, r(12), 7);
  cell(sheet, r(12), 4, "ASSIGNMENTS/TEST", { bold: true, align: "center" });
  cell(sheet, r(12), 8, "EXAM", { bold: true, align: "center" });
  merge(sheet, r(12), 9, r(13), 9);
  cell(sheet, r(12), 9, "Total", { bold: true, align: "center" });
  merge(sheet, r(12), 10, r(14), 10);
  cell(sheet, r(12), 10, "Class", { bold: true, align: "center" });
  merge(sheet, r(12), 11, r(14), 11);
  cell(sheet, r(12), 11, "Subject", { bold: true, align: "center" });
  merge(sheet, r(12), 12, r(14), 12);
  cell(sheet, r(12), 12, "Annual", { bold: true, align: "center" });
  merge(sheet, r(12), 14, r(15), 14);
  cell(sheet, r(12), 14, "Remarks", { bold: true, align: "center" });

  merge(sheet, r(13), 4, r(13), 5);
  cell(sheet, r(13), 4, "Assignment", { align: "center" });
  cell(sheet, r(13), 6, "Test", { align: "center" });
  cell(sheet, r(13), 7, "Test", { align: "center" });
  cell(sheet, r(13), 8, "Marks", { align: "center" });

  merge(sheet, r(14), 2, r(14), 3);
  cell(sheet, r(14), 2, "Previous", { align: "center" });
  merge(sheet, r(14), 4, r(15), 4);
  cell(sheet, r(14), 4, 0.1, { align: "center" });
  merge(sheet, r(14), 5, r(15), 5);
  cell(sheet, r(14), 5, 0.1, { align: "center" });
  merge(sheet, r(14), 6, r(15), 6);
  cell(sheet, r(14), 6, 0.2, { align: "center" });
  merge(sheet, r(14), 7, r(15), 7);
  cell(sheet, r(14), 7, 0.2, { align: "center" });
  merge(sheet, r(14), 8, r(15), 8);
  cell(sheet, r(14), 8, 0.4, { align: "center" });
  cell(sheet, r(14), 9, "Scores", { align: "center" });

  cell(sheet, r(15), 1, "CORE SUBJECTS", { bold: true });
  merge(sheet, r(15), 2, r(15), 3);
  cell(sheet, r(15), 2, "Summary", { align: "center" });
  cell(sheet, r(15), 9, 1, { align: "center" });
  cell(sheet, r(15), 10, "Average", { bold: true, align: "center" });
  cell(sheet, r(15), 11, "Position", { bold: true, align: "center" });
  cell(sheet, r(15), 12, "Total", { bold: true, align: "center" });
  cell(sheet, r(15), 13, "Grade", { bold: true, align: "center" });

  let total = 0;
  let annualTotalSum = 0;
  classInfo.subjects.forEach((subject, i) => {
    const row = r(16 + i);
    const s = subjectScores?.[subject.id] || {};
    const prev1 = cumulative?.[subject.id]?.term1 ?? "";
    const prev2 = cumulative?.[subject.id]?.term2 ?? "";
    const annual = [prev1, prev2, s.total].filter((v) => v !== "" && v != null).reduce((a, b) => a + Number(b), 0);
    cell(sheet, row, 1, subject.name);
    cell(sheet, row, 2, prev1, { border: true, align: "center" });
    cell(sheet, row, 3, prev2, { border: true, align: "center" });
    cell(sheet, row, 4, s.ca1 ?? "", { border: true, align: "center" });
    cell(sheet, row, 5, s.ca2 ?? "", { border: true, align: "center" });
    cell(sheet, row, 6, s.test1 ?? "", { border: true, align: "center" });
    cell(sheet, row, 7, s.test2 ?? "", { border: true, align: "center" });
    cell(sheet, row, 8, s.exam ?? "", { border: true, align: "center" });
    cell(sheet, row, 9, s.total ?? "", { border: true, align: "center", bold: true });
    cell(sheet, row, 10, s.classAvg ?? "", { border: true, align: "center" });
    cell(sheet, row, 11, s.position ?? "", { border: true, align: "center" });
    cell(sheet, row, 12, annual, { border: true, align: "center" });
    cell(sheet, row, 13, s.grade ?? "", { border: true, align: "center" });
    cell(sheet, row, 14, s.remark ?? "");
    total += Number(s.total || 0);
    annualTotalSum += annual;
  });

  const totalRow = r(36);
  const average = classInfo.subjects.length ? total / classInfo.subjects.length : 0;
  cell(sheet, totalRow, 1, "TOTAL", { bold: true });
  merge(sheet, totalRow, 8, r(37), 9);
  cell(sheet, totalRow, 8, "AVERAGE:", { bold: true, align: "center" });
  merge(sheet, totalRow, 10, totalRow, 11);
  cell(sheet, totalRow, 10, Math.round(total * 100) / 100, { bold: true, align: "center" });
  merge(sheet, totalRow, 13, r(37), 13);
  cell(sheet, totalRow, 13, "=", { align: "center" });
  merge(sheet, totalRow, 14, r(37), 14);
  cell(sheet, totalRow, 14, Math.round(average * 100) / 100, { bold: true, align: "center" });
  merge(sheet, r(37), 10, r(37), 11);
  cell(sheet, r(37), 10, classInfo.subjects.length, { align: "center" });

  merge(sheet, r(39), 3, r(39), 7);
  cell(sheet, r(39), 3, "Ratings", { bold: true, align: "center" });
  merge(sheet, r(39), 9, r(39), 14);
  cell(sheet, r(39), 9, "ANNUAL SUMMARY", { bold: true, align: "center" });

  merge(sheet, r(40), 1, r(40), 2);
  cell(sheet, r(40), 1, "BEHAVIOUR AND ACTIVITIES", { bold: true });
  ["A", "B", "C", "D", "E"].forEach((band, i) => cell(sheet, r(40), 3 + i, band, { bold: true, align: "center" }));
  merge(sheet, r(40), 9, r(41), 10);
  cell(sheet, r(40), 9, "ANNUAL TOTAL = ", { bold: true });
  merge(sheet, r(40), 11, r(41), 14);
  cell(sheet, r(40), 11, annualTotalSum || student.annualTotal || "", { align: "center", bold: true });

  (student.behaviourCriteria || DEFAULT_BEHAVIOUR_CRITERIA).forEach((criterion, i) => {
    const row = r(41 + i);
    merge(sheet, row, 1, row, 2);
    cell(sheet, row, 1, criterion);
    const band = student.behaviour?.[criterion];
    const bandIdx = BAND_LETTERS.indexOf(band);
    if (bandIdx >= 0) cell(sheet, row, 3 + bandIdx, "\u2713", { align: "center" });
  });

  merge(sheet, r(42), 9, r(44), 10);
  cell(sheet, r(42), 9, "ANNUAL AVERAGE = ", { bold: true });
  merge(sheet, r(42), 11, r(43), 11);
  const annualAverage = classInfo.subjects.length ? annualTotalSum / classInfo.subjects.length : 0;
  cell(sheet, r(42), 11, Math.round(annualAverage * 100) / 100, { align: "center", bold: true });

  merge(sheet, r(45), 9, r(46), 11);
  cell(sheet, r(45), 9, "CUMMULATIVE POSITION:", { bold: true });
  merge(sheet, r(45), 12, r(46), 14);
  cell(sheet, r(45), 12, student.cumulativePosition ?? "", { align: "center", bold: true });

  cell(sheet, r(47), 9, `COMMENT: ${student.promotionComment || ""}`);

  cell(sheet, r(55), 1, "Form Master's Remark: ");
  merge(sheet, r(55), 5, r(55), 13);
  cell(sheet, r(55), 5, student.formMasterRemark || "");
  cell(sheet, r(56), 1, "Signature/Date: ");
  merge(sheet, r(56), 9, r(56), 11);
  cell(sheet, r(56), 9, student.signatureDate || "");

  cell(sheet, r(58), 1, "Principal's Remark: ");
  merge(sheet, r(58), 5, r(58), 13);
  cell(sheet, r(58), 5, student.principalRemark || "");
  cell(sheet, r(59), 1, "Signature/Date: ");
  merge(sheet, r(59), 9, r(59), 11);
  cell(sheet, r(59), 9, student.signatureDate || "");
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * @param {Object} school     { name, address, ministry }
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
      writeThirdTermBlock(sheet, top, school, classInfo, student, student.scores, options.cumulative?.[student.id]);
    } else {
      writeSingleTermBlock(sheet, top, school, classInfo, student, student.scores);
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
// Provenance: the row/column map above was reverse-engineered from a real
// filled report (Gaskiya High School, "third_term.xlsx", First Term + Third
// Term sheets) using ws.merged_cells.ranges and ws.iter_rows() to find the
// exact merge span and column of every label/value. If the school changes
// their template later, re-run that inspection on a fresh sample and update
// the two writeXBlock() functions — nothing else in the app depends on this
// file's internals.
// ---------------------------------------------------------------------------
