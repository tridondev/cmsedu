// src/lib/resultEngine.js
//
// Pure functions — no Firestore imports here so this file can be unit-tested
// and reused both client-side (live preview) and inside a Cloud Function
// (authoritative recompute on every score write).

/**
 * Weight splits taken directly from the uploaded templates. These are the
 * fallback/default values — a school admin can override them per grading
 * scale from Settings (stored at schools/{id}.weights.{JSS|SS}), and every
 * caller in the app should prefer that stored value over this constant when
 * it's present. Keeping the shape identical ({ca1,ca2,test1,test2,exam},
 * fractions summing to 1) means nothing else needs to change when it's
 * overridden.
 */
export const WEIGHTS = {
  JSS: { ca1: 0.1, ca2: 0.1, test1: 0.2, test2: 0.2, exam: 0.4 },
  SS: { ca1: 0.05, ca2: 0.05, test1: 0.1, test2: 0.1, exam: 0.7 },
};

/** Which grading scale a class level falls under. */
export function gradingScaleFor(level) {
  return level && level.startsWith("SS") ? "SS" : "JSS";
}

/**
 * Returns the effective weights for a scale: the school's custom weights if
 * they've set them in Settings, otherwise the built-in defaults above.
 * `schoolWeights` is the raw `school.weights` field from Firestore, shaped
 * `{ JSS: {ca1,ca2,test1,test2,exam}, SS: {...} }` (either half optional).
 */
export function effectiveWeights(gradingScale, schoolWeights) {
  const custom = schoolWeights?.[gradingScale];
  if (custom && Object.keys(custom).length === 5) return custom;
  return WEIGHTS[gradingScale];
}

/**
 * Raw scores are entered by teachers as "out of" the component's max
 * (e.g. Assignment out of 10, Test out of 20) — same as your template's
 * header row (0.1, 0.1, 0.2, 0.2, 0.4 style caps for JSS, 5/5/10/10/70 for SS).
 * We normalise to a percentage of the component, then apply the weight,
 * so the same function works whatever the component's raw max is.
 *
 * @param {Object} customWeights  Optional override, e.g. from
 *   effectiveWeights() above. Falls back to the built-in WEIGHTS[gradingScale].
 */
export function computeSubjectTotal(rawScores, gradingScale, componentMax, customWeights) {
  const w = customWeights || WEIGHTS[gradingScale];
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

export function gradeFor(total, gradingScale, customBands) {
  const bands = customBands || (gradingScale === "JSS" ? JSS_BANDS : SS_BANDS);
  const hit = bands.find((b) => total >= b.min);
  return hit ? { grade: hit.grade, remark: hit.remark } : { grade: "-", remark: "-" };
}

/** The 12 behaviour/activity rows shown on the report card, in template order. */
export const BEHAVIOUR_CRITERIA = [
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

export const RATING_BANDS = ["A", "B", "C", "D", "E"];

/**
 * Given a student's overall average, auto-drafts a Form Master's and
 * Principal's remark in the same style/tone as the school's real filled
 * reports. Always returned as plain editable text — the admin can tweak
 * the wording before exporting, this just removes the blank-page problem.
 */
const REMARK_TIERS = [
  {
    min: 70,
    tier: "EXCELLENT",
    formMaster: "An excellent result. Keep up the outstanding work.",
    principal: "An excellent performance. Well done, keep it up.",
  },
  {
    min: 60,
    tier: "V.GOOD",
    formMaster: "A very good result, with more effort, you can attain excellence.",
    principal: "A very good performance, you can do better next term.",
  },
  {
    min: 50,
    tier: "GOOD",
    formMaster: "A good result, with more effort, you can do better next term.",
    principal: "A good performance, you can do better next term.",
  },
  {
    min: 45,
    tier: "PASS",
    formMaster: "A fair result — more effort is needed in your studies.",
    principal: "Can do better next term with more effort.",
  },
  {
    min: 40,
    tier: "FAIR",
    formMaster: "A weak result. Serious improvement is required next term.",
    principal: "Needs to work much harder next term.",
  },
  {
    min: 0,
    tier: "FAIL",
    formMaster: "A poor result. Extra effort and commitment are needed urgently.",
    principal: "Must improve significantly next term.",
  },
];

export function autoRemarks(average) {
  const hit = REMARK_TIERS.find((t) => average >= t.min) || REMARK_TIERS[REMARK_TIERS.length - 1];
  return { tier: hit.tier, formMasterRemark: hit.formMaster, principalRemark: hit.principal };
}

/**
 * Ranks students for one subject (or overall) with proper tie handling,
 * producing "1st", "2nd", "2nd", "4th" style strings like the template.
 */
export function rankWithTies(values /* [{ studentId, score }] */) {
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
export function computeClassPositions(studentsScores, subjectIds) {
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
 * Per-subject class average — the "Class Average" column on the report card
 * (same figure repeated for every student in the class, for a given
 * subject: the mean of everyone's total in that subject).
 *
 * studentsScores shape: { [studentId]: { [subjectId]: totalScore } }
 * Returns: { [subjectId]: averageRoundedTo2dp }
 */
export function computeSubjectClassAverages(studentsScores, subjectIds) {
  const averages = {};
  for (const subjectId of subjectIds) {
    const values = Object.values(studentsScores)
      .map((subs) => subs[subjectId])
      .filter((v) => v != null && v !== "");
    averages[subjectId] = values.length
      ? Math.round((values.reduce((a, b) => a + Number(b), 0) / values.length) * 100) / 100
      : "";
  }
  return averages;
}

/**
 * Builds the "3rd Term / cumulative" record: per-subject average of the three
 * term totals, plus a fresh cumulative position — exactly what a 3rd-term
 * report needs to show alongside that term's own figures.
 *
 * termDocs = { First: {studentId:{subjectId: total}}, Second: {...}, Third: {...} }
 */
export function computeCumulativeTerm(termDocs, subjectIds) {
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
