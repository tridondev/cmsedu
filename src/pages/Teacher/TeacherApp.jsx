import { Routes, Route, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import AppShell from "../../components/AppShell";
import CircularProgress from "../../components/CircularProgress";
import ScoreEntryGrid from "./ScoreEntryGrid";
import SharedSubjectEntry from "./SharedSubjectEntry";

/** Must match resultKeyFor() in SchoolAdmin/Results.jsx and Teacher/ScoreEntryGrid.jsx. */
function resultKeyFor(session, term, classId) {
  const s = (session || "session").replace(/[^a-zA-Z0-9]+/g, "-");
  return `${s}_${term}_${classId}`;
}

/** Matches the level values used in Classes.jsx — anything else sorts last, so a typo'd level doesn't crash sorting. */
const LEVEL_ORDER = ["JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
function levelRank(level) {
  const idx = LEVEL_ORDER.indexOf(level);
  return idx === -1 ? LEVEL_ORDER.length : idx;
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function TeacherHome({ schoolId }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState({}); // classId -> class data
  const [term, setTerm] = useState("First");
  const [session, setSession] = useState("");
  const [studentCounts, setStudentCounts] = useState({}); // classId -> count
  const [scoreCounts, setScoreCounts] = useState({}); // "classId:subjectId" -> done count
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");

  // Live: this teacher's own assignment list — updates the moment the admin
  // (re)assigns classes/subjects, no refresh needed.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "schools", schoolId, "users", user.uid), (snap) => {
      setAssignments(snap.exists() ? snap.data().assignedSubjects || [] : []);
      setLoading(false);
    });
    return unsub;
  }, [schoolId, user]);

  // Live: current term/session, so score entry always targets the right period.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "schools", schoolId), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setTerm(data.currentTerm || "First");
      setSession(data.currentSession || "");
    });
    return unsub;
  }, [schoolId]);

  // Live: every class this teacher is assigned to — picks up admin edits to
  // the class name, level, or subject list (e.g. a newly added subject)
  // immediately.
  useEffect(() => {
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    if (classIds.length === 0) {
      setClasses({});
      return;
    }
    const unsubs = classIds.map((classId) =>
      onSnapshot(doc(db, "schools", schoolId, "classes", classId), (snap) => {
        setClasses((prev) => ({ ...prev, [classId]: snap.exists() ? snap.data() : null }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [schoolId, assignments]);

  // Live: roster size per class, for the "done/total" ring.
  useEffect(() => {
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    if (classIds.length === 0) {
      setStudentCounts({});
      return;
    }
    const unsubs = classIds.map((classId) =>
      onSnapshot(collection(db, "schools", schoolId, "classes", classId, "students"), (snap) => {
        setStudentCounts((prev) => ({ ...prev, [classId]: snap.size }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [schoolId, assignments]);

  // Live: saved score counts per class/subject, for the completion ring.
  useEffect(() => {
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    if (classIds.length === 0) {
      setScoreCounts({});
      return;
    }
    const unsubs = classIds.map((classId) => {
      const resultKey = resultKeyFor(session, term, classId);
      return onSnapshot(collection(db, "schools", schoolId, "results", resultKey, "scores"), (snap) => {
        const perSubject = {};
        snap.forEach((d) => {
          const subjectId = d.id.split("_")[1];
          perSubject[subjectId] = (perSubject[subjectId] || 0) + 1;
        });
        setScoreCounts((prev) => {
          const next = { ...prev };
          assignments
            .filter((a) => a.classId === classId)
            .forEach((a) => {
              next[`${a.classId}:${a.subjectId}`] = perSubject[a.subjectId] || 0;
            });
          return next;
        });
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [schoolId, assignments, session, term]);

  // ── Shared subject state ─────────────────────────────────────────────────
  // When a teacher clicks "Enter all [subject] together", we render
  // SharedSubjectEntry in-place instead of navigating to a URL route.
  const [sharedEntry, setSharedEntry] = useState(null);
  // { subjectId, subjectName, classIds[] }

  // ── Detect cross-class (shared) subjects ─────────────────────────────────
  // A subject is "shared" when the same subjectId appears in assignments for
  // more than one class at the same SS level.  The teacher sees a combined
  // "Enter together →" badge on those cards.
  const sharedSubjectGroups = useMemo(() => {
    // Map subjectId -> [{ classId, className, level }]
    const bySubject = {};
    assignments.forEach((a) => {
      const cls = classes[a.classId];
      if (!cls) return;
      if (!bySubject[a.subjectId]) bySubject[a.subjectId] = [];
      bySubject[a.subjectId].push({ classId: a.classId, className: cls.name, level: cls.level });
    });
    // Only keep subjects that appear in ≥ 2 classes AND the classes share the same level
    const groups = {};
    Object.entries(bySubject).forEach(([subjectId, entries]) => {
      if (entries.length < 2) return;
      // Group by level
      const byLevel = {};
      entries.forEach((e) => {
        if (!byLevel[e.level]) byLevel[e.level] = [];
        byLevel[e.level].push(e);
      });
      Object.entries(byLevel).forEach(([level, levelEntries]) => {
        if (levelEntries.length < 2) return;
        const key = `${subjectId}__${level}`;
        groups[key] = {
          subjectId,
          level,
          classIds: levelEntries.map((e) => e.classId),
          classNames: levelEntries.map((e) => e.className),
        };
      });
    });
    return groups; // { [key]: { subjectId, level, classIds, classNames } }
  }, [assignments, classes]);

  // Reverse lookup: given a classId+subjectId, find its shared group key (if any)
  const sharedKeyFor = (classId, subjectId) => {
    const cls = classes[classId];
    if (!cls) return null;
    const key = `${subjectId}__${cls.level}`;
    return sharedSubjectGroups[key] ? key : null;
  };

  const classOptions = useMemo(() => {
    const seen = new Map();
    assignments.forEach((a) => {
      if (!seen.has(a.classId)) seen.set(a.classId, classes[a.classId]?.name || a.classId);
    });
    return [...seen.entries()].sort(([idA], [idB]) => {
      const rankDiff = levelRank(classes[idA]?.level) - levelRank(classes[idB]?.level);
      if (rankDiff !== 0) return rankDiff;
      return (classes[idA]?.name || "").localeCompare(classes[idB]?.name || "");
    });
  }, [assignments, classes]);

  const visibleAssignments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments
      .filter((a) => {
        if (classFilter && a.classId !== classFilter) return false;
        if (!term) return true;
        const cls = classes[a.classId];
        const subject = cls?.subjects?.find((s) => s.id === a.subjectId);
        const haystack = `${cls?.name || ""} ${subject?.name || ""}`.toLowerCase();
        return haystack.includes(term);
      })
      .sort((a, b) => {
        const clsA = classes[a.classId];
        const clsB = classes[b.classId];
        const rankDiff = levelRank(clsA?.level) - levelRank(clsB?.level);
        if (rankDiff !== 0) return rankDiff;
        const nameDiff = (clsA?.name || "").localeCompare(clsB?.name || "");
        if (nameDiff !== 0) return nameDiff;
        const subjA = clsA?.subjects?.find((s) => s.id === a.subjectId)?.name || "";
        const subjB = clsB?.subjects?.find((s) => s.id === b.subjectId)?.name || "";
        return subjA.localeCompare(subjB);
      });
  }, [assignments, classes, classFilter, search]);

  // Shared-subject banners, filtered the same way as the class grid below —
  // previously these always showed in full no matter what was typed in
  // search, so they sat above the actual matching results and didn't
  // reflect the search at all. Now a banner only shows if it matches the
  // current search text / class filter, same as everything else on screen.
  const visibleSharedGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return Object.entries(sharedSubjectGroups).filter(([, group]) => {
      if (classFilter && !group.classIds.includes(classFilter)) return false;
      if (!term) return true;
      const anyClass = classes[group.classIds[0]];
      const subjectName = anyClass?.subjects?.find((s) => s.id === group.subjectId)?.name || group.subjectId;
      const haystack = `${subjectName} ${group.classNames.join(" ")}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [sharedSubjectGroups, classes, search, classFilter]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-pad h-16 animate-pulse bg-slate-100" />
        ))}
      </div>
    );
  }

  // ── If a shared entry is active, render it full-screen ──────────────────
  if (sharedEntry) {
    return (
      <SharedSubjectEntry
        schoolId={schoolId}
        subjectId={sharedEntry.subjectId}
        subjectName={sharedEntry.subjectName}
        classIds={sharedEntry.classIds}
        onBack={() => setSharedEntry(null)}
      />
    );
  }

  return (
    <div>
      <h2 className="page-title">Your classes</h2>
      <p className="page-subtitle mb-6">
        Tap a class/subject to enter scores. The ring shows how much of the roster you've completed.
      </p>

      {assignments.length === 0 ? (
        <div className="card-pad text-center text-slate-400 text-sm">No subjects assigned yet — ask your school admin.</div>
      ) : (
        <>
          {/* Search + class filter — up top, above everything else, so it's
              the first thing a teacher sees and always usable regardless of
              how many shared-subject banners are showing below it. */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <SearchIcon className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Search your classes or subjects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input sm:w-56" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {classOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          {/* Shared subject banners — shown just below the search bar, filtered to match the current search/class filter */}
          {visibleSharedGroups.length > 0 && (
            <div className="flex flex-col gap-2 mb-5">
              {visibleSharedGroups.map(([key, group]) => {
                // Get subject name from any of the classes
                const anyClassId = group.classIds[0];
                const anyClass = classes[anyClassId];
                const subjectName =
                  anyClass?.subjects?.find((s) => s.id === group.subjectId)?.name ||
                  group.subjectId;

                // Combined progress across all classes in the group
                const totalStudents = group.classIds.reduce(
                  (n, cId) => n + (studentCounts[cId] || 0), 0
                );
                const totalDone = group.classIds.reduce(
                  (n, cId) => n + (scoreCounts[`${cId}:${group.subjectId}`] || 0), 0
                );
                const pct = totalStudents ? (totalDone / totalStudents) * 100 : 0;

                return (
                  <div
                    key={key}
                    className="card-pad border-brand-200 bg-brand-50/40 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 uppercase tracking-wide">
                          Shared · {group.level}
                        </span>
                        <p className="font-semibold text-slate-900 text-sm">{subjectName}</p>
                      </div>
                      <p className="text-slate-500 text-xs">
                        {group.classNames.join(" + ")} — {totalDone}/{totalStudents} students entered
                      </p>
                    </div>
                    <button
                      className="btn-primary btn-sm whitespace-nowrap"
                      onClick={() =>
                        setSharedEntry({
                          subjectId: group.subjectId,
                          subjectName,
                          classIds: group.classIds,
                        })
                      }
                    >
                      Enter all together →
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {visibleAssignments.length === 0 && (
            <div className="card-pad text-center text-slate-400 text-sm">No classes match your search.</div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {visibleAssignments.map((a) => {
              const cls = classes[a.classId];
              const subject = cls?.subjects?.find((s) => s.id === a.subjectId);
              const done  = scoreCounts[`${a.classId}:${a.subjectId}`] || 0;
              const total = studentCounts[a.classId] || 0;
              const pct   = total ? (done / total) * 100 : 0;
              const groupKey = sharedKeyFor(a.classId, a.subjectId);
              const group    = groupKey ? sharedSubjectGroups[groupKey] : null;

              return (
                <div key={`${a.classId}:${a.subjectId}`} className="relative">
                  <Link
                    to={`entry/${a.classId}/${a.subjectId}`}
                    className="card-pad hover:shadow-lifted hover:-translate-y-0.5 transition flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{cls?.name || a.classId}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{subject?.name || a.subjectId}</p>
                      <p className="text-slate-400 text-[11px] mt-1">{done}/{total} students entered</p>
                      {/* Badge shown when this subject is part of a shared group */}
                      {group && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 uppercase tracking-wide mt-1.5">
                          Shared with {group.classNames.filter((n) => n !== (cls?.name || a.classId)).join(", ")}
                        </span>
                      )}
                    </div>
                    <CircularProgress percent={pct} label={`${Math.round(pct)}% complete`} />
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const TABS = [{ to: "", label: "My classes", end: true }];

export default function TeacherApp({ schoolId }) {
  const { logout } = useAuth();
  return (
    <AppShell eyebrow="Teacher" title="Score Entry" subtitle="CMSEDU" navItems={TABS} onLogout={logout}>
      <Routes>
        <Route index element={<TeacherHome schoolId={schoolId} />} />
        <Route path="entry/:classId/:subjectId" element={<ScoreEntryGrid schoolId={schoolId} />} />
      </Routes>
    </AppShell>
  );
}
