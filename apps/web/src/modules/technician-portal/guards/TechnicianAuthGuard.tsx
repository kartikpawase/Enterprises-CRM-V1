import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TECHNICIAN_AUTH_ROUTE, TECHNICIAN_AUTH_API_PREFIX } from '@crm/shared';
import { apiClient } from '../../../lib/api-client';
import { Loader2 } from 'lucide-react';
import { stopSharedTechnicianWatch } from '../hooks/useTechnicianTracking';

export interface AuthenticatedTechnician {
  id: string;
  technicianId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  role: 'Technician';
  portalEnabled: boolean;
}

interface TechnicianAuthContextValue {
  technician: AuthenticatedTechnician | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const TechnicianAuthContext = createContext<TechnicianAuthContextValue>({
  technician: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
  refreshAuth: async () => {},
});

export const useTechnicianAuth = () => useContext(TechnicianAuthContext);

export interface TechnicianAuthGuardProps {
  children: React.ReactNode;
}

/**
 * Production Authentication Guard for Technician Portal
 * Phase 2: Server-Side Validated Session Guard
 *
 * Rules:
 * 1. Strictly isolated from CRM Admin/Staff sessions.
 * 2. Authenticates against /api/v1/technician-auth/me using HTTP-only cookie.
 * 3. Enforces server-side authentication state; redirects unauthenticated users to /technician/login.
 */
export const TechnicianAuthGuard: React.FC<TechnicianAuthGuardProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [technician, setTechnician] = useState<AuthenticatedTechnician | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkAuth = useCallback(async () => {
    try {
      const response = await apiClient.get<any>(`${TECHNICIAN_AUTH_API_PREFIX}/me`);
      if (response && response.data?.authenticated && response.data?.technician) {
        setTechnician(response.data.technician);
        setIsAuthenticated(true);
      } else {
        setTechnician(null);
        setIsAuthenticated(false);
      }
    } catch {
      setTechnician(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      stopSharedTechnicianWatch();
      try {
        await apiClient.post('/maps/technician/stop', {});
      } catch {}
      await apiClient.post(`${TECHNICIAN_AUTH_API_PREFIX}/logout`, {});
    } finally {
      setTechnician(null);
      setIsAuthenticated(false);
      navigate(TECHNICIAN_AUTH_ROUTE, { replace: true });
    }
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-workspace flex flex-col items-center justify-center text-slate-500 select-none">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <p className="text-xs font-semibold text-slate-600">Verifying technician session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && location.pathname !== TECHNICIAN_AUTH_ROUTE) {
    return <Navigate to={TECHNICIAN_AUTH_ROUTE} state={{ from: location }} replace />;
  }

  return (
    <TechnicianAuthContext.Provider
      value={{
        technician,
        isAuthenticated,
        isLoading,
        logout,
        refreshAuth: checkAuth,
      }}
    >
      {children}
    </TechnicianAuthContext.Provider>
  );
};
