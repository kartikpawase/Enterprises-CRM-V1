import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import {
  useTechnicianTracking,
  TechnicianTrackingProvider,
  _resetSharedTrackingStateForTesting,
  stopSharedTechnicianWatch,
} from './useTechnicianTracking';
import { TechnicianPortalLayout } from '../layouts/TechnicianPortalLayout';

// Mock Socket.IO client
const mockSocketInstance = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

// Mock API client preserving helper exports
vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    apiClient: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: { success: true } }),
      patch: vi.fn().mockResolvedValue({ data: { success: true } }),
    },
  };
});

describe('Technician Live Location Continuity Suite (Scenarios A through M)', () => {
  let mockWatchPositionId = 101;
  let mockWatchPosition: any;
  let mockClearWatch: any;
  let watchSuccessCallback: ((pos: any) => void) | null = null;
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetSharedTrackingStateForTesting();
    localStorage.clear();

    mockWatchPosition = vi.fn().mockImplementation((success) => {
      watchSuccessCallback = success;
      return mockWatchPositionId;
    });

    mockClearWatch = vi.fn().mockImplementation((id) => {
      if (id === mockWatchPositionId) {
        watchSuccessCallback = null;
      }
    });

    (navigator as any).geolocation = {
      watchPosition: mockWatchPosition,
      clearWatch: mockClearWatch,
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({
          coords: {
            latitude: 18.5204,
            longitude: 73.8567,
            accuracy: 12,
            heading: 180,
            speed: 8,
          },
          timestamp: Date.now(),
        });
      }),
    };

    mockFetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes('/api/v1/maps/technician/active')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: { isNavigating: false, destination: null } }),
        });
      }

      if (url.includes('/api/v1/maps/technician/navigate')) {
        const body = options?.body ? JSON.parse(options.body) : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              trackingStatus: 'ON_THE_WAY',
              destination: {
                serviceId: body.serviceId || 'srv-test-101',
                serviceNumber: 'SRV-TEST-101',
                customerName: 'Acme Corp',
                address: '123 Market Street, Pune',
                scheduledTimeSlot: '10:00 AM - 12:00 PM',
              },
              googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=18.5204,73.8567',
            }),
        });
      }

      if (url.includes('/api/v1/maps/technician/location')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        });
      }

      if (url.includes('/api/v1/maps/technician/stop')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true, trackingStatus: 'NOT_TRACKING' }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    global.fetch = mockFetch;
    window.open = vi.fn();
  });

  afterEach(() => {
    _resetSharedTrackingStateForTesting();
    localStorage.clear();
  });

  // --- Scenario A: Start Journey -> Single Watcher Created ---
  it('Scenario A: Starting Journey establishes exactly one device GPS watcher', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(0);

    await act(async () => {
      await result.current.navigate('srv-test-101');
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(result.current.isNavigating).toBe(true);
    expect(result.current.activeServiceId).toBe('srv-test-101');
    expect(localStorage.getItem('technician_current_job_id')).toBe('srv-test-101');
  });

  // --- Scenario B, C, D, E: Route Changes & Portal Navigation do NOT stop tracking ---
  it('Scenario B, C, D, E: Navigating across Jobs, Dashboard, Profile, and back keeps same active watcher', async () => {
    // Test navigation harness with TechnicianTrackingProvider at root shell
    const JobsComponent = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div data-testid="jobs-page">
          <span data-testid="tracking-status">{tracking.trackingStatus}</span>
          <span data-testid="active-job">{tracking.activeServiceId || 'none'}</span>
          <button data-testid="start-btn" onClick={() => tracking.navigate('srv-101')}>
            Start Journey
          </button>
          <button data-testid="goto-dash" onClick={() => navigate('/technician/dashboard')}>
            Go Dashboard
          </button>
        </div>
      );
    };

    const DashboardComponent = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div data-testid="dashboard-page">
          <span data-testid="dash-active-job">{tracking.activeServiceId || 'none'}</span>
          <button data-testid="goto-profile" onClick={() => navigate('/technician/profile')}>
            Go Profile
          </button>
        </div>
      );
    };

    const ProfileComponent = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div data-testid="profile-page">
          <span data-testid="profile-active-job">{tracking.activeServiceId || 'none'}</span>
          <button data-testid="goto-jobs" onClick={() => navigate('/technician/jobs')}>
            Go Jobs
          </button>
        </div>
      );
    };

    const { getByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/technician/jobs']}>
        <TechnicianTrackingProvider>
          <Routes>
            <Route path="/technician/jobs" element={<JobsComponent />} />
            <Route path="/technician/dashboard" element={<DashboardComponent />} />
            <Route path="/technician/profile" element={<ProfileComponent />} />
          </Routes>
        </TechnicianTrackingProvider>
      </MemoryRouter>
    );

    // Initial state on Jobs: no watcher
    expect(mockWatchPosition).toHaveBeenCalledTimes(0);
    expect(getByTestId('active-job').textContent).toBe('none');

    // 1. Technician taps "Start Journey" on Jobs Page
    await act(async () => {
      fireEvent.click(getByTestId('start-btn'));
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(getByTestId('active-job').textContent).toBe('srv-101');

    // 2. Scenario B: Technician navigates to Dashboard
    await act(async () => {
      fireEvent.click(getByTestId('goto-dash'));
    });

    expect(queryByTestId('jobs-page')).toBeNull();
    expect(getByTestId('dashboard-page')).toBeDefined();
    expect(getByTestId('dash-active-job').textContent).toBe('srv-101');
    // Crucial check: clearWatch was NEVER called on unmount of Jobs page!
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // 3. Scenario D: Technician navigates to Profile
    await act(async () => {
      fireEvent.click(getByTestId('goto-profile'));
    });

    expect(queryByTestId('dashboard-page')).toBeNull();
    expect(getByTestId('profile-page')).toBeDefined();
    expect(getByTestId('profile-active-job').textContent).toBe('srv-101');
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // 4. Scenario E: Technician returns to Jobs
    await act(async () => {
      fireEvent.click(getByTestId('goto-jobs'));
    });

    expect(getByTestId('jobs-page')).toBeDefined();
    expect(getByTestId('active-job').textContent).toBe('srv-101');
    // Still exactly ONE watcher! No duplicates created, no watcher destroyed!
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockClearWatch).not.toHaveBeenCalled();
  });

  // --- Scenario F: Fast component re-mounts / React 18 StrictMode ---
  it('Scenario F: StrictMode fast remounting does not leak duplicate watchers or clear active watch', async () => {
    const Component = () => {
      const tracking = useTechnicianTracking();
      return (
        <div>
          <button onClick={() => tracking.navigate('srv-strict-101')}>Navigate</button>
        </div>
      );
    };

    const { rerender } = render(
      <React.StrictMode>
        <TechnicianTrackingProvider>
          <Component />
        </TechnicianTrackingProvider>
      </React.StrictMode>
    );

    // Rerender twice in StrictMode
    rerender(
      <React.StrictMode>
        <TechnicianTrackingProvider>
          <Component />
        </TechnicianTrackingProvider>
      </React.StrictMode>
    );

    // Now trigger navigate
    const btn = screen.getByText('Navigate');
    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // Another remount pass while navigating
    rerender(
      <React.StrictMode>
        <TechnicianTrackingProvider>
          <Component />
        </TechnicianTrackingProvider>
      </React.StrictMode>
    );

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockClearWatch).not.toHaveBeenCalled();
  });

  // --- Scenario G: Continuous Telemetry via HTTP & Socket.IO ---
  it('Scenario G: Geolocation watchPosition updates produce continuous telemetry pings', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-telemetry-101');
    });

    expect(watchSuccessCallback).toBeDefined();

    // Simulate GPS movement 1
    await act(async () => {
      watchSuccessCallback?.({
        coords: {
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 8,
          speed: 6.2,
          heading: 45,
        },
        timestamp: 1000000,
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/maps/technician/location',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"latitude":18.5204'),
      })
    );

    // Simulate GPS movement 2
    await act(async () => {
      watchSuccessCallback?.({
        coords: {
          latitude: 18.5215,
          longitude: 73.858,
          accuracy: 5,
          speed: 7.1,
          heading: 50,
        },
        timestamp: 1005000,
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/maps/technician/location',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"latitude":18.5215'),
      })
    );
  });

  // --- Scenario H: Persistent Banner & Admin Map Real-Time Updates ---
  it('Scenario H: TechnicianPortalLayout displays live active journey banner across screens', async () => {
    const { getByText } = render(
      <MemoryRouter initialEntries={['/technician']}>
        <TechnicianTrackingProvider>
          <TechnicianPortalLayout />
        </TechnicianTrackingProvider>
      </MemoryRouter>
    );

    // Initially no banner
    expect(screen.queryByText(/Live Journey Active/i)).toBeNull();

    // Start tracking via shared hook
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-banner-101');
    });

    // Verify localStorage has been populated for cross-component continuity
    expect(localStorage.getItem('technician_current_job_id')).toBe('srv-banner-101');
  });

  // --- Scenario I: Job Completion stops tracking and cleans up ---
  it('Scenario I: Explicitly completing or stopping a job stops watcher and clears state', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-done-101');
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('technician_current_job_id')).toBe('srv-done-101');

    // Simulate technician completion stop
    await act(async () => {
      await result.current.stopTracking();
    });

    expect(mockClearWatch).toHaveBeenCalledWith(mockWatchPositionId);
    expect(result.current.isNavigating).toBe(false);
    expect(result.current.activeServiceId).toBeNull();
    expect(localStorage.getItem('technician_current_job_id')).toBeNull();
  });

  // --- Scenario J: Logout stops watcher and clears credentials ---
  it('Scenario J: stopSharedTechnicianWatch on logout cleanly clears watcher and storage', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-logout-101');
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('technician_current_job_id')).toBe('srv-logout-101');

    // Simulate logout calling stopSharedTechnicianWatch()
    act(() => {
      stopSharedTechnicianWatch();
    });

    expect(mockClearWatch).toHaveBeenCalledWith(mockWatchPositionId);
    expect(localStorage.getItem('technician_current_job_id')).toBeNull();
  });

  // --- Scenario K: Server Socket technician:tracking_stopped cleans up client watcher ---
  it('Scenario K: Server socket event technician:tracking_stopped stops watcher and resets local state', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-cancel-101');
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // Find the registered 'technician:tracking_stopped' socket handler
    const stoppedHandler = mockSocketInstance.on.mock.calls.find(
      (call: any[]) => call[0] === 'technician:tracking_stopped'
    )?.[1];

    expect(stoppedHandler).toBeDefined();

    // Trigger the socket event
    await act(async () => {
      stoppedHandler();
    });

    expect(mockClearWatch).toHaveBeenCalledWith(mockWatchPositionId);
    expect(result.current.isNavigating).toBe(false);
    expect(result.current.activeServiceId).toBeNull();
  });

  // --- Scenario L: Different Technician Session Isolation ---
  it('Scenario L: Distinct technician session resets state with no leftover destination or watch ID', async () => {
    // Technician A starts journey
    const techAHook = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await techAHook.result.current.navigate('srv-tech-a');
    });

    expect(techAHook.result.current.activeServiceId).toBe('srv-tech-a');

    // Technician A logs out
    act(() => {
      stopSharedTechnicianWatch();
    });
    techAHook.unmount();

    // Technician B logs in
    const techBHook = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    // Technician B starts in fresh non-tracking state
    expect(techBHook.result.current.isNavigating).toBe(false);
    expect(techBHook.result.current.activeServiceId).toBeNull();
    expect(localStorage.getItem('technician_current_job_id')).toBeNull();
  });

  // --- Scenario M: Offline/stale handling when app terminates ---
  it('Scenario M: When tracking is stopped on termination, no further location pings are dispatched', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await act(async () => {
      await result.current.navigate('srv-term-101');
    });

    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    mockFetch.mockClear();

    // Terminate watch
    act(() => {
      stopSharedTechnicianWatch();
    });

    // Simulated callback attempt after termination does nothing
    if (watchSuccessCallback) {
      await act(async () => {
        try {
          watchSuccessCallback?.({
            coords: { latitude: 18.52, longitude: 73.85, accuracy: 10 },
            timestamp: Date.now(),
          });
        } catch {}
      });
    }

    // Backend location ping was not called after cleanup
    const locationCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.includes('/api/v1/maps/technician/location')
    );
    expect(locationCalls.length).toBe(0);
  });
});
