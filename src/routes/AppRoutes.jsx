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

  if (state.loading) return <div className="p-8 text-center">Loading school…</div>;
  if (state.error) return <div className="p-8 text-center">No school found at /educms/{schoolSlug}</div>;
  return children(state.schoolId);
}

function RequireRole({ role, schoolId, children }) {
  const { user, claims, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Checking access…</div>;
  if (!user || !claims) return <Navigate to=".." replace />;
  if (claims.schoolId !== schoolId || claims.role !== role) return <Navigate to=".." replace />;
  return children;
}

function RequirePlatformAdmin({ children }) {
  const { user, claims, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Checking access…</div>;
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
