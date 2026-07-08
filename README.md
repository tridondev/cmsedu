# CMSEDU — Multi-Tenant School Result Management System

A single React + Firebase application that hosts **many schools** under one deployment.
Each school gets an access route like:

```
https://cmsedu.app/educms/gaskiya          → school login
https://cmsedu.app/educms/gaskiya/admin    → school admin dashboard
https://cmsedu.app/educms/gaskiya/teacher  → teacher score entry
https://cmsedu.app/educms/admin            → SUPER ADMIN (you) — onboards schools
```

---
## 1. Roles

| Role | Scope | Can do |
|---|---|---|
| **Super Admin** (you / EduCMS owner) | Global | Create/suspend schools, issue school access codes, view all schools, billing |
| **School Admin** | One school (`schoolId`) | Add classes/streams, add students, invite/manage teachers, set term dates, enter signatures/remarks, lock & export results |
| **Teacher** | One school, assigned subjects/classes | Enter CA/Test/Exam scores only for their assigned subject(s) & class(es) |
| **(Optional) Parent/Student portal** | Read-only | View own result once published |

A school is created by Super Admin with a **unique slug** (`gaskiya`) and an **access code**
(random 8-char string, e.g. `GSK-7F3K2Q`). The School Admin logs in with
`slug + access code + phone/email` the first time, then sets a normal email/password.
Teachers are invited by the School Admin (email + auto-generated temp password or Firebase
email-link sign-in) and are scoped only to subjects assigned to them.

---
## 2. Firestore Data Model

```
schools/{schoolId}
  name, slug, address, logoUrl, accessCode, status: active|suspended
  levels: ["JSS1","JSS2","JSS3","SS1","SS2","SS3"]
  streamsForSS: ["Science","Art","Commercial"]
  currentSession: "2025/2026"
  currentTerm: "First" | "Second" | "Third"
  gradingScale: "JSS" | "SS"      // determines weight split + grade bands
  signatures: { principalName, principalSigUrl, formMasterDefaultName }

schools/{schoolId}/users/{userId}
  role: "admin" | "teacher"
  name, email, assignedSubjects: [{classId, subjectId}]  // teachers only

schools/{schoolId}/classes/{classId}
  name: "JSS 3" | "SS 2 Science" | "SS 2 Commercial" ...
  level: "JSS3" | "SS2"
  stream: null | "Science" | "Art" | "Commercial"
  subjects: [{ id, name, category: "core"|"trade" }]
  formMaster: userId

schools/{schoolId}/classes/{classId}/students/{studentId}
  fullName, examNo, sex, stateOfOrigin, lga, admissionNo
  session, // running record, class changes each session are new subcollection entries or a `history[]`

schools/{schoolId}/results/{session}_{term}_{classId}/scores/{studentId}_{subjectId}
  ca1, ca2, test1, test2, exam        // raw component scores
  weightedTotal                       // computed: engine applies weight scale
  enteredBy: teacherUserId
  updatedAt

schools/{schoolId}/results/{session}_{term}_{classId}/meta
  locked: boolean          // admin locks entry after deadline
  classAverage: {subjectId: number}
  positions: {studentId: {subjectPositions:{subjectId:pos}, overallPosition, overallTotal, overallAverage}}
  behaviourRatings: {studentId: {...}}
  remarks: {studentId: {formMaster, principal}}

schools/{schoolId}/results/{session}_annual_{classId}
  // auto-rolled cumulative record built from First+Second+Third term docs
  // used to generate the "3rd Term" sheet that shows all 3 terms + cumulative average
```

**Why this shape:** scores live in a flat subcollection keyed by `studentId_subjectId` so a
Cloud Function (or client-side transaction) can recompute class averages & positions with a
single query per class/term — this is what lets "position for 1st/2nd term" and the
"3rd term cumulative" sheet both fall out of the same source data instead of being re-typed.

---
## 3. Result computation engine (`src/lib/resultEngine.js`)

- `computeSubjectTotal(scores, gradingScale)` → applies weight split
  - JSS: `0.1*ca1 + 0.1*ca2 + 0.2*test1 + 0.2*test2 + 0.4*exam`
  - SS:  `0.05*ca1 + 0.05*ca2 + 0.1*test1 + 0.1*test2 + 0.7*exam`
- `gradeFor(total, gradingScale)`
  - JSS bands: A 70-100, B 60-69, C 50-59, D 45-49, E 40-44, F <40 (editable per school)
  - SS/WAEC bands: A1 75-100 … F9 <40
- `computeClassPositions(allStudentScoresForClass)` → per-subject position (handles ties: "1st", "2nd=", etc.) + overall position by total score
- `computeCumulativeTerm(firstTermDoc, secondTermDoc, thirdTermDoc)` → per-subject average across terms + cumulative position, feeds the annual/3rd-term export

All of this runs as **Firestore-triggered Cloud Functions** (`onWrite` on a score doc →
recompute that class/term's `meta` doc) so admins/teachers never manually total anything,
and results shown in the UI are always consistent with what gets exported.

---
## 4. Export engine (`src/lib/exportToExcel.js`)

Uses `exceljs` (works client-side in the browser or in a Cloud Function). It:

1. Loads a **template workbook per level+stream** (`JSS_template.xlsx`,
   `SS_Science_template.xlsx`, `SS_Art_template.xlsx`, `SS_Commercial_template.xlsx`) —
   exact clones of your 4 uploaded files with the printed layout, merges, borders,
   "✓" rating cells and grade key already in place.
2. Clones the **student block** (the repeating ~45-row template) once per student, the same
   way your original file repeats it, and fills in the merged cells by exact address
   (`Name of Student`, `Exam No.`, `Class`, each subject row, `TOTAL =`, `AVERAGE:`, position,
   behaviour ✓ marks, form master/principal remarks + signature image).
3. Three export modes, selectable by the School Admin:
   - **Single term** (e.g. only Second Term) → one sheet, one workbook per class or per student
   - **Single student, all 3 terms** → 3 stacked blocks + a summary block
   - **Whole class, all 3 terms ("Third Term" cumulative pack)** → per student: First Term
     block, Second Term block, Third Term block, plus a cumulative average/position row —
     mirroring exactly how your existing template repeats per-student blocks down the sheet.
4. Inserts the school's uploaded principal/form-master **signature image** and typed remark
   text into the merged signature cells before export, exactly where your template has
   "Signature/Date:".
5. Returns a downloadable `.xlsx` (client trigger) or emails/stores it in
   `schools/{schoolId}/exports/` (Cloud Storage) for the admin to retrieve later.

Because export re-reads the same `meta` doc the UI displays, exported figures always match
what admins previewed on-screen — no drift between the app and the printed sheet.

---
## 5. Routing (React Router)

```
/                          marketing/login chooser
/educms/admin              Super Admin login → dashboard (create schools, issue codes)
/educms/:schoolSlug        School login (admin or teacher, role detected after auth)
/educms/:schoolSlug/admin/*     School Admin app (classes, students, teachers, term setup,
                                 signatures, review results, lock term, export)
/educms/:schoolSlug/teacher/*   Teacher app (assigned classes → subject → score grid)
```

`schoolSlug` resolves to `schoolId` via a `slugs/{slug} → schoolId` lookup doc, checked in a
route guard before anything else loads — this is what makes `educms/gaskiya` a clean tenant
boundary while Firestore security rules independently enforce that a signed-in user can only
read/write documents under their own `schools/{schoolId}`.

---
## 6. Firestore security rules (see `firebase/firestore.rules`)

- Every read/write under `schools/{schoolId}/**` requires the caller's custom claim
  `schoolId == resource schoolId`, set via a Cloud Function when Super Admin creates the
  school-admin account or the admin invites a teacher.
- Teachers can only write to `scores/{studentId}_{subjectId}` docs where
  `subjectId` is in their own `assignedSubjects`, and only while `meta.locked == false`.
- Only `role == "admin"` can toggle `locked`, edit signatures, or trigger export.
- Super Admin uses a separate top-level `platformAdmins/{uid}` allow-list, independent of any
  school, so a compromised school account can never read another school's data.

---
## 7. Suggested build order (MVP → v1)

1. Firebase project + Auth (email/password) + Firestore + Storage + Hosting.
2. Super Admin: create school (name, slug, access code, level config, grading scale).
3. School Admin: classes & subjects setup, add students (bulk CSV import using the same
   columns as your existing sheets), invite teachers.
4. Teacher score entry grid (spreadsheet-like, one row per student, inline validation ≤100).
5. Cloud Function: recompute totals/grades/positions on every score write.
6. Admin results review screen (matches template layout on-screen) + lock term.
7. Export engine (single term → whole-class 3-term pack) using the 4 templates as source.
8. Signatures/remarks module + logo upload.
9. Polish: dashboards/analytics (pass rate, top students, subject performance charts).

---
This repo contains a working scaffold for steps 1–4 plus the full result engine and export
engine logic (steps 5–7) so you can see and extend the real computation/export code, not just
a plan.
