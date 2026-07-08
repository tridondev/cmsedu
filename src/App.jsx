import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
