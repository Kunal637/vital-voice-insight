import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/integrations/firebase/auth-context";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Consultation from "./pages/Consultation";
import XRayAnalysis from "./pages/XRayAnalysis";
import TestResultDetail from "./pages/TestResultDetail";
import Admin from "./pages/Admin";
import PatientDashboard from "./pages/PatientDashboard";
import LabsDashboard from "./pages/LabsDashboard";
import Leaflet from "./pages/Leaflet";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// ── Protected Route ────────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their correct portal instead of showing a 403
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

// ── Routes ─────────────────────────────────────────────────────────────────────
const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/auth" element={<Auth />} />

    {/* Doctor / Admin routes */}
    <Route path="/dashboard" element={
      <ProtectedRoute allowedRoles={['doctor', 'admin']}>
        <Dashboard />
      </ProtectedRoute>
    } />
    <Route path="/dashboard/consultation" element={
      <ProtectedRoute allowedRoles={['doctor', 'admin']}>
        <Consultation />
      </ProtectedRoute>
    } />
    {/* Legacy redirect — old /consultation links still work */}
    <Route path="/consultation" element={<Navigate to="/dashboard/consultation" replace />} />
    <Route path="/xray-analysis" element={
      <ProtectedRoute allowedRoles={['doctor', 'admin']}>
        <XRayAnalysis />
      </ProtectedRoute>
    } />
    <Route path="/test-result/:id" element={
      <ProtectedRoute allowedRoles={['doctor', 'admin']}>
        <TestResultDetail />
      </ProtectedRoute>
    } />
    <Route path="/admin" element={
      <ProtectedRoute allowedRoles={['admin']}>
        <Admin />
      </ProtectedRoute>
    } />

    {/* Patient route */}
    <Route path="/patient-dashboard" element={
      <ProtectedRoute allowedRoles={['patient']}>
        <PatientDashboard />
      </ProtectedRoute>
    } />

    {/* Labs route */}
    <Route path="/labs-dashboard" element={
      <ProtectedRoute allowedRoles={['labs']}>
        <LabsDashboard />
      </ProtectedRoute>
    } />

    <Route path="/leaflet" element={<Leaflet />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
