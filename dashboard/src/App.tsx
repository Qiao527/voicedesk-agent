import { lazy, type ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import { BusinessProvider } from "./lib/business";

// Route-level code splitting keeps the first load small; recharts only
// downloads when the overview is opened.
const Overview = lazy(() => import("./pages/Overview"));
const Calls = lazy(() => import("./pages/Calls"));
const Messages = lazy(() => import("./pages/Messages"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Settings = lazy(() => import("./pages/Settings"));
const Login = lazy(() => import("./pages/Login"));

function FullScreenSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="border-brand-200 border-t-brand-600 size-6 animate-spin rounded-full border-2" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <BusinessProvider>{children}</BusinessProvider>;
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-brand-600 text-sm font-semibold">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="text-brand-600 hover:text-brand-700 mt-6 inline-block text-sm font-medium">
        Back to overview
      </Link>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Overview />} />
        <Route path="calls" element={<Calls />} />
        <Route path="messages" element={<Messages />} />
        <Route path="appointments" element={<Appointments />} />
        <Route path="settings" element={<Settings />} />
        <Route path="analytics" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
