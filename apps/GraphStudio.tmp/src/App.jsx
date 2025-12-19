import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { NexusProvider } from './context/NexusContext';
import Shell from './components/Shell';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PricingPage from './pages/PricingPage';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center bg-[#0a0a0c] text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" />;

  return children;
};

/**
 * App - Root component of GraphStudio IDE
 * 
 * The app uses a Shell pattern where the Shell component
 * manages the overall layout and coordinates between panels.
 */
function App() {
  // Get workspace-kernel URL from environment variable
  const workspaceKernelUrl = import.meta.env.VITE_WORKSPACE_KERNEL_URL || 'http://localhost:8000';

  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <NexusProvider baseUrl={workspaceKernelUrl}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Shell /></ProtectedRoute>} />
            </Routes>
          </NexusProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;