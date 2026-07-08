import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

import SuperAdminLogin from "../pages/Auth/SuperAdminLogin";
import SuperAdminDashboard from "../pages/SuperAdmin/Dashboard";
import SchoolLogin from "../pages/Auth/SchoolLogin";
import SchoolAdminApp from "../pages/SchoolAdmin/SchoolAdminApp";
import TeacherApp from "../pages/Teacher/TeacherApp";
import Landing from "../pages/Landing";

/** Resolves /educms/:schoolSlug -> schoolId before anything else renders. */
function TenantGate({ children }) {
  const { schoolSlug } = useParams();
  const [state, setState] = useState({ loading: true, schoolId: null, error: null });

  useEffect(() => {
    let active = true;
    getDoc(doc(db, "slugs", schoolSlug)).then((snap) => {
      if (!active) return;
      if (snap.exists()) setState({ loading: false, schoolId: snap.data().schoolId, error: null });
      else setState({ loading: false, schoolId: null, error: "not_found" });
    });
    return () => (active = false);
  }, [schoolSlug]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-sm">Loading school…</p>
        </div>
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="card-pad max-w-sm w-full text-center">
          <h2 className="text-lg font-bold text-slate-900 mb-1">School not found</h2>
          <p className="text-sm text-slate-500">
            No school is registered at <span className="font-mono text-slate-700">/educms/{schoolSlug}</span>.
            Double-check the link your school administrator gave you.
          </p>
        </div>
      </div>
    );
  }
  return children(state.schoolId);
}

function RequireRole({ role, schoolId, children }) {
  const { schoolSlug } = useParams();
  const { user, claims, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500">Checking access…</div>;
  if (!user || !claims) return <Navigate to={`/educms/${schoolSlug}`} replace />;
  if (claims.schoolId !== schoolId || claims.role !== role) return <Navigate to={`/educms/${schoolSlug}`} replace />;
  return children;
}

function RequirePlatformAdmin({ children }) {
  const { user, claims, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-sm">Checking access…</p>
        </div>
      </div>
    );
  }
  if (!user || !claims?.platformAdmin) return <Navigate to="/educms/admin" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />

        {/* Super Admin (you) */}
        <Route path="/educms/admin" element={<SuperAdminLogin />} />
        <Route
          path="/educms/admin/dashboard/*"
          element={
            <RequirePlatformAdmin>
              <SuperAdminDashboard />
            </RequirePlatformAdmin>
          }
        />

        {/* Per-school tenant routes */}
        <Route
          path="/educms/:schoolSlug"
          element={<TenantGate>{(schoolId) => <SchoolLogin schoolId={schoolId} />}</TenantGate>}
        />
        <Route
          path="/educms/:schoolSlug/admin/*"
          element={
            <TenantGate>
              {(schoolId) => (
                <RequireRole role="admin" schoolId={schoolId}>
                  <SchoolAdminApp schoolId={schoolId} />
                </RequireRole>
              )}
            </TenantGate>
          }
        />
        <Route
          path="/educms/:schoolSlug/teacher/*"
          element={
            <TenantGate>
              {(schoolId) => (
                <RequireRole role="teacher" schoolId={schoolId}>
                  <TeacherApp schoolId={schoolId} />
                </RequireRole>
              )}
            </TenantGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
