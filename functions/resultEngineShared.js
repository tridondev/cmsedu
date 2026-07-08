// src/lib/resultEngine.js
//
// Pure functions — no Firestore imports here so this file can be unit-tested
// and reused both client-side (live preview) and inside a Cloud Function
// (authoritative recompute on every score write).

/** Weight splits taken directly from the uploaded templates. */
const WEIGHTS = {
  JSS: { ca1: 0.1, ca2: 0.1, test1: 0.2, test2: 0.2, exam: 0.4 },
  SS: { ca1: 0.05, ca2: 0.05, test1: 0.1, test2: 0.1, exam: 0.7 },
};

/**
 * Raw scores are entered by teachers as "out of" the component's max
 * (e.g. Assignment out of 10, Test out of 20) — same as your template's
 * header row (0.1, 0.1, 0.2, 0.2, 0.4 style caps for JSS, 5/5/10/10/70 for SS).
 * We normalise to a percentage of the component, then apply the weight,
 * so the same function works whatever the component's raw max is.
 */
function computeSubjectTotal(rawScores, gradingScale, componentMax) {
  const w = WEIGHTS[gradingScale];
  const max = componentMax || defaultComponentMax(gradingScale);
  let total = 0;
  for (const key of Object.keys(w)) {
    const raw = Number(rawScores[key] || 0);
    const pct = max[key] ? raw / max[key] : 0;
    total += pct * w[key] * 100;
  }
  return Math.round(total * 100) / 100; // 2dp, matches template precision
}

function defaultComponentMax(gradingScale) {
  return gradingScale === "JSS"
    ? { ca1: 10, ca2: 10, test1: 20, test2: 20, exam: 40 }
    : { ca1: 5, ca2: 5, test1: 10, test2: 10, exam: 70 };
}

/** JSS letter grade bands (editable per school via schools/{id}.gradeBands). */
const JSS_BANDS = [
  { min: 70, grade: "A", remark: "EXCELLENT" },
  { min: 60, grade: "B", remark: "V.GOOD" },
  { min: 50, grade: "C", remark: "GOOD" },
  { min: 45, grade: "D", remark: "PASS" },
  { min: 40, grade: "E", remark: "FAIR" },
  { min: 0, grade: "F", remark: "FAIL" },
];

/** WAEC-style bands used on the SS templates. */
const SS_BANDS = [
  { min: 75, grade: "A1", remark: "EXCELLENT" },
  { min: 70, grade: "B2", remark: "V.GOOD" },
  { min: 65, grade: "B3", remark: "GOOD" },
  { min: 60, grade: "C4", remark: "CREDIT" },
  { min: 55, grade: "C5", remark: "CREDIT" },
  { min: 50, grade: "C6", remark: "CREDIT" },
  { min: 45, grade: "D7", remark: "PASS" },
  { min: 40, grade: "E8", remark: "FAIR" },
  { min: 0, grade: "F9", remark: "FAIL" },
];

function gradeFor(total, gradingScale, customBands) {
  const bands = customBands || (gradingScale === "JSS" ? JSS_BANDS : SS_BANDS);
  const hit = bands.find((b) => total >= b.min);
  return hit ? { grade: hit.grade, remark: hit.remark } : { grade: "-", remark: "-" };
}

/**
 * Ranks students for one subject (or overall) with proper tie handling,
 * producing "1st", "2nd", "2nd", "4th" style strings like the template.
 */
function rankWithTies(values /* [{ studentId, score }] */) {
  const sorted = [...values].sort((a, b) => b.score - a.score);
  const result = {};
  let lastScore = null;
  let lastRank = 0;
  sorted.forEach((entry, idx) => {
    const rank = entry.score === lastScore ? lastRank : idx + 1;
    result[entry.studentId] = ordinal(rank);
    lastScore = entry.score;
    lastRank = rank;
  });
  return result;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Given all score docs for a class+term (already totalled via computeSubjectTotal),
 * returns per-subject positions + overall total/average/position — this is the
 * object stored at results/{key}/meta and consumed directly by the export engine.
 *
 * studentsScores shape:
 * { [studentId]: { [subjectId]: totalScore }, ... }
 */
function computeClassPositions(studentsScores, subjectIds) {
  const subjectPositions = {};
  for (const subjectId of subjectIds) {
    const values = Object.entries(studentsScores)
      .filter(([, subs]) => subs[subjectId] != null)
      .map(([studentId, subs]) => ({ studentId, score: subs[subjectId] }));
    subjectPositions[subjectId] = rankWithTies(values);
  }

  const overallValues = Object.entries(studentsScores).map(([studentId, subs]) => {
    const scores = Object.values(subs);
    const total = scores.reduce((a, b) => a + b, 0);
    const average = scores.length ? total / scores.length : 0;
    return { studentId, score: total, average };
  });
  const overallPositions = rankWithTies(overallValues.map((v) => ({ studentId: v.studentId, score: v.score })));

  const perStudent = {};
  overallValues.forEach((v) => {
    perStudent[v.studentId] = {
      overallTotal: Math.round(v.score * 100) / 100,
      overallAverage: Math.round(v.average * 100) / 100,
      overallPosition: overallPositions[v.studentId],
      subjectPositions: Object.fromEntries(
        subjectIds.map((sid) => [sid, subjectPositions[sid][v.studentId] || "-"])
      ),
    };
  });
  return perStudent;
}

/**
 * Builds the "3rd Term / cumulative" record: per-subject average of the three
 * term totals, plus a fresh cumulative position — exactly what a 3rd-term
 * report needs to show alongside that term's own figures.
 *
 * termDocs = { First: {studentId:{subjectId: total}}, Second: {...}, Third: {...} }
 */
function computeCumulativeTerm(termDocs, subjectIds) {
  const studentIds = new Set();
  Object.values(termDocs).forEach((doc) => Object.keys(doc || {}).forEach((s) => studentIds.add(s)));

  const cumulative = {};
  for (const studentId of studentIds) {
    cumulative[studentId] = {};
    for (const subjectId of subjectIds) {
      const vals = ["First", "Second", "Third"]
        .map((t) => termDocs[t]?.[studentId]?.[subjectId])
        .filter((v) => v != null);
      if (vals.length) {
        cumulative[studentId][subjectId] =
          Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      }
    }
  }
  return computeClassPositions(cumulative, subjectIds);
}

module.exports = { computeSubjectTotal, gradeFor, rankWithTies, computeClassPositions, computeCumulativeTerm, WEIGHTS };
