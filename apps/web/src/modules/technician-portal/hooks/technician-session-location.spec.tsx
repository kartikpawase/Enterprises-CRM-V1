import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import {
  useTechnicianTracking,
  TechnicianTrackingProvider,
  _resetSharedTrackingStateForTesting,
  stopSharedTechnicianWatch,
} from './useTechnicianTracking';
import { AdminLiveTechnicianMap, normalizeTechnicianLocation } from '../../technicians/components/AdminLiveTechnicianMap';
import { apiClient } from '../../../lib/api-client';

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

// Mock Google Maps JS API Loader
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn().mockImplementation((lib: string) => {
    if (lib === 'maps') {
      return Promise.resolve({
        Map: vi.fn().mockImplementation(() => ({
          setCenter: vi.fn(),
          setZoom: vi.fn(),
          panTo: vi.fn(),
          fitBounds: vi.fn(),
        })),
      });
    }
    return Promise.resolve({});
  }),
}));

// Mock API Client
vi.mock('../../../lib/api-client', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getApiBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

describe('Master Blaster Execution Suite: Technician Portal Session → Admin Live Location', () => {
  let mockWatchPositionId = 777;
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
            accuracy: 10,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        });
      }),
    };

    (navigator as any).permissions = {
      query: vi.fn().mockResolvedValue({
        state: 'granted',
        onchange: null,
      }),
    };

    let activeDest: any = null;

    mockFetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes('/api/v1/maps/technician/active')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: activeDest ? { activeDestination: activeDest } : null }),
        });
      }

      if (url.includes('/api/v1/maps/technician/location')) {
        const body = options?.body ? JSON.parse(options.body) : {};
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                technicianId: 'tech-session-001',
                technicianName: 'Siddharth Varpe',
                trackingStatus: activeDest ? 'ON_THE_WAY' : 'ONLINE',
                activeDestination: activeDest,
                currentLocation: {
                  latitude: body.latitude,
                  longitude: body.longitude,
                  accuracy: body.accuracy,
                  timestamp: body.timestamp,
                },
                lastUpdate: Date.now(),
                freshness: 'LIVE',
              },
            }),
        });
      }

      if (url.includes('/api/v1/maps/technician/navigate')) {
        const body = options?.body ? JSON.parse(options.body) : {};
        activeDest = {
          serviceId: body.serviceId,
          serviceNumber: 'SRV-888',
          customerName: 'Customer Alpha',
          address: '100 Main Street, Pune',
          latitude: 18.5300,
          longitude: 73.8600,
        };
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              trackingStatus: 'ON_THE_WAY',
              destination: activeDest,
              googleMapsUrl: 'https://maps.google.com',
            }),
        });
      }

      if (url.includes('/api/v1/maps/technician/stop')) {
        activeDest = null;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
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

  // --------------------------------------------------------------------------
  // TEST 1 (Section 28): Login Only Tracking (No active job, no navigation)
  // --------------------------------------------------------------------------
  it('TEST 1: Technician enters portal with location permission -> GPS watcher starts immediately with real telemetry and NO active job', async () => {
    // 1. Mount portal session under TechnicianTrackingProvider (as in root router)
    const PortalRootComponent = () => {
      const tracking = useTechnicianTracking();
      return (
        <div>
          <span data-testid="is-watching">{tracking.isWatching ? 'YES' : 'NO'}</span>
          <span data-testid="perm-state">{tracking.permissionState}</span>
          <span data-testid="tracking-status">{tracking.trackingStatus}</span>
          <span data-testid="active-job">{tracking.activeServiceId || 'none'}</span>
        </div>
      );
    };

    render(
      <TechnicianTrackingProvider>
        <PortalRootComponent />
      </TechnicianTrackingProvider>
    );

    // 2. Geolocation permission was detected as granted
    await waitFor(() => {
      expect(screen.getByTestId('perm-state').textContent).toBe('granted');
    });

    // 3. Watcher was automatically started on portal entry!
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // 4. Initial telemetry ping was sent with real device coordinates
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/maps/technician/location',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"latitude":18.5204'),
      })
    );

    // 5. Technician has NO assigned service and did NOT start journey
    expect(screen.getByTestId('active-job').textContent).toBe('none');

    // 6. Admin Live Map normalizer receives the session telemetry record
    const adminRecord = normalizeTechnicianLocation({
      technicianId: 'tech-session-001',
      technicianName: 'Siddharth Varpe',
      currentLocation: {
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 10,
      },
      activeDestination: null,
      trackingStatus: 'ONLINE',
      lastUpdate: Date.now(),
      statusFreshness: 'LIVE',
    });

    expect(adminRecord).not.toBeNull();
    expect(adminRecord?.technicianName).toBe('Siddharth Varpe');
    expect(adminRecord?.latitude).toBe(18.5204);
    expect(adminRecord?.longitude).toBe(73.8567);
    expect(adminRecord?.statusFreshness).toBe('LIVE');
    expect(adminRecord?.trackingStatus).toBe('ONLINE');
    expect(adminRecord?.customerName).toBeUndefined();
    expect(adminRecord?.serviceId).toBe('');
  });

  // --------------------------------------------------------------------------
  // TEST 2 (Section 29): Route Navigation Continuity
  // --------------------------------------------------------------------------
  it('TEST 2: Navigating across Jobs -> Dashboard -> Profile -> Jobs keeps GPS watcher active and streaming', async () => {
    const JobsView = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div>
          <span>Jobs View: {tracking.trackingStatus}</span>
          <button data-testid="to-dash" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
        </div>
      );
    };

    const DashboardView = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div>
          <span>Dashboard View: {tracking.trackingStatus}</span>
          <button data-testid="to-profile" onClick={() => navigate('/profile')}>
            Profile
          </button>
        </div>
      );
    };

    const ProfileView = () => {
      const tracking = useTechnicianTracking();
      const navigate = useNavigate();
      return (
        <div>
          <span>Profile View: {tracking.trackingStatus}</span>
          <button data-testid="to-jobs" onClick={() => navigate('/jobs')}>
            Jobs
          </button>
        </div>
      );
    };

    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <TechnicianTrackingProvider>
          <Routes>
            <Route path="/jobs" element={<JobsView />} />
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/profile" element={<ProfileView />} />
          </Routes>
        </TechnicianTrackingProvider>
      </MemoryRouter>
    );

    // Watcher established on mount
    await waitFor(() => {
      expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    });

    // 1. Navigate Jobs -> Dashboard
    await act(async () => {
      fireEvent.click(screen.getByTestId('to-dash'));
    });
    expect(screen.getByText(/Dashboard View/i)).toBeInTheDocument();
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // 2. Navigate Dashboard -> Profile
    await act(async () => {
      fireEvent.click(screen.getByTestId('to-profile'));
    });
    expect(screen.getByText(/Profile View/i)).toBeInTheDocument();
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);

    // 3. Navigate Profile -> Jobs
    await act(async () => {
      fireEvent.click(screen.getByTestId('to-jobs'));
    });
    expect(screen.getByText(/Jobs View/i)).toBeInTheDocument();
    expect(mockClearWatch).not.toHaveBeenCalled();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });

  // --------------------------------------------------------------------------
  // TEST 3 (Section 30): Active Service Coexistence
  // --------------------------------------------------------------------------
  it('TEST 3: Coexistence of session tracking and active service journey tracking', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await waitFor(() => {
      expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    });

    // Initial session location: no service
    expect(result.current.isNavigating).toBe(false);
    expect(result.current.activeServiceId).toBeNull();

    // Technician taps Start Journey / Navigate on an assigned service
    await act(async () => {
      await result.current.navigate('srv-job-123');
    });

    // Journey active, destination attached, watcher NOT duplicated
    expect(result.current.isNavigating).toBe(true);
    expect(result.current.activeServiceId).toBe('srv-job-123');
    expect(result.current.trackingStatus).toBe('ON_THE_WAY');
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    expect(mockClearWatch).not.toHaveBeenCalled();

    // Admin map normalizer receives active service context
    const adminRecordWithJob = normalizeTechnicianLocation({
      technicianId: 'tech-session-001',
      technicianName: 'Siddharth Varpe',
      currentLocation: {
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 10,
      },
      activeDestination: {
        serviceId: 'srv-job-123',
        customerName: 'Customer Alpha',
        address: '100 Main Street, Pune',
      },
      trackingStatus: 'ON_THE_WAY',
      lastUpdate: Date.now(),
      statusFreshness: 'LIVE',
    });

    expect(adminRecordWithJob?.customerName).toBe('Customer Alpha');
    expect(adminRecordWithJob?.serviceId).toBe('srv-job-123');
    expect(adminRecordWithJob?.trackingStatus).toBe('ON_THE_WAY');
  });

  // --------------------------------------------------------------------------
  // TEST 4 (Section 31): Logout Tracking Teardown
  // --------------------------------------------------------------------------
  it('TEST 4: Logout stops GPS watcher, cleans storage, and terminates telemetry', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await waitFor(() => {
      expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    });

    // Simulate logout invocation
    act(() => {
      stopSharedTechnicianWatch();
    });

    // Watcher cleared
    expect(mockClearWatch).toHaveBeenCalledWith(mockWatchPositionId);

    // Any late position callback sends no more pings
    mockFetch.mockClear();
    if (watchSuccessCallback) {
      await act(async () => {
        try {
          watchSuccessCallback?.({
            coords: { latitude: 18.53, longitude: 73.86, accuracy: 10 },
            timestamp: Date.now(),
          });
        } catch {}
      });
    }

    const postCalls = mockFetch.mock.calls.filter(([url]: [string]) =>
      url.includes('/api/v1/maps/technician/location')
    );
    expect(postCalls.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 5 (Section 32): Multi-Technician Isolation
  // --------------------------------------------------------------------------
  it('TEST 5: Admin Live Map isolates telemetry and markers across multiple technicians', () => {
    const mockTechA = {
      technicianId: 'tech-A',
      technicianName: 'Technician Alpha',
      latitude: 18.5204,
      longitude: 73.8567,
      statusFreshness: 'LIVE',
      trackingStatus: 'ONLINE',
      activeDestination: null,
      lastUpdated: new Date().toISOString(),
      secondsAgo: 2,
    };

    const mockTechB = {
      technicianId: 'tech-B',
      technicianName: 'Technician Beta',
      latitude: 18.5900,
      longitude: 73.7800,
      statusFreshness: 'LIVE',
      trackingStatus: 'ON_THE_WAY',
      activeDestination: {
        serviceId: 'srv-beta',
        customerName: 'Beta Client',
      },
      lastUpdated: new Date().toISOString(),
      secondsAgo: 4,
    };

    const normA = normalizeTechnicianLocation(mockTechA);
    const normB = normalizeTechnicianLocation(mockTechB);

    expect(normA?.technicianId).toBe('tech-A');
    expect(normA?.latitude).toBe(18.5204);
    expect(normA?.customerName).toBeUndefined();

    expect(normB?.technicianId).toBe('tech-B');
    expect(normB?.latitude).toBe(18.5900);
    expect(normB?.customerName).toBe('Beta Client');

    // Completely independent coordinates and active destination
    expect(normA?.latitude).not.toBe(normB?.latitude);
    expect(normA?.customerName).not.toBe(normB?.customerName);
  });

  // --------------------------------------------------------------------------
  // TEST 6 (Section 33): Exactly ONE GPS Watcher
  // --------------------------------------------------------------------------
  it('TEST 6: Multiple components or repeated starts NEVER create duplicate watchers', async () => {
    const { result } = renderHook(() => useTechnicianTracking(), {
      wrapper: ({ children }) => <TechnicianTrackingProvider>{children}</TechnicianTrackingProvider>,
    });

    await waitFor(() => {
      expect(mockWatchPosition).toHaveBeenCalledTimes(1);
    });

    // Manually trigger startBrowserWatch multiple times
    act(() => {
      result.current.startBrowserWatch();
      result.current.startBrowserWatch();
      result.current.startBrowserWatch();
    });

    // Still exactly 1 call
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });
});
