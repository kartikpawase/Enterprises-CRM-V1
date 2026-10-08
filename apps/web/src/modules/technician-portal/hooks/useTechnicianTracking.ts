import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveApiUrl, getApiBaseUrl } from '../../../lib/api-client';

export type TrackingStatus =
  | 'NOT_TRACKING'
  | 'LOCATION_PERMISSION'
  | 'TRACKING_READY'
  | 'NAVIGATION_SELECTED'
  | 'ON_THE_WAY'
  | 'ARRIVAL_PENDING'
  | 'AT_CUSTOMER'
  | 'STALE'
  | 'OFFLINE'
  | 'STOPPED_ON_WAY';

export type GeolocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface ActiveDestination {
  serviceId: string;
  serviceNumber: string;
  jobCardId?: string | null;
  jobCardNumber?: string | null;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledDate?: string | null;
  scheduledTimeSlot?: string | null;
}

export interface TechnicianTrackingState {
  isNavigating: boolean;
  activeServiceId: string | null;
  trackingStatus: TrackingStatus;
  destination: ActiveDestination | null;
  distanceText: string | null;
  etaText: string | null;
  lastUpdate: number | null;
  error: string | null;
  permissionState: GeolocationPermissionState;
  isWatching: boolean;
}

export interface ConflictModalState {
  isOpen: boolean;
  activeServiceId: string;
  activeServiceNumber: string;
  pendingServiceId: string;
}

export interface TechnicianTrackingContextValue {
  state: TechnicianTrackingState;
  isNavigating: boolean;
  activeServiceId: string | null;
  trackingStatus: TrackingStatus;
  destination: ActiveDestination | null;
  distanceText: string | null;
  etaText: string | null;
  lastUpdate: number | null;
  error: string | null;
  permissionState: GeolocationPermissionState;
  isWatching: boolean;
  conflictModal: ConflictModalState | null;
  dismissConflictModal: () => void;
  confirmSwitchDestination: () => void;
  navigate: (serviceId: string) => Promise<{ success?: boolean; conflict?: boolean; error?: string; googleMapsUrl?: string }>;
  stopTracking: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  startBrowserWatch: (serviceId?: string) => void;
  isThisServiceActive?: boolean;
}

let sharedWatchId: number | null = null;
let sharedSocket: Socket | null = null;

export function _resetSharedTrackingStateForTesting() {
  if (sharedWatchId !== null && typeof navigator !== 'undefined' && typeof navigator.geolocation?.clearWatch === 'function') {
    try {
      navigator.geolocation.clearWatch(sharedWatchId);
    } catch {}
  }
  sharedWatchId = null;
  if (sharedSocket) {
    try {
      sharedSocket.disconnect();
    } catch {}
  }
  sharedSocket = null;
}

export function stopSharedTechnicianWatch() {
  if (sharedWatchId !== null && typeof navigator !== 'undefined' && typeof navigator.geolocation?.clearWatch === 'function') {
    try {
      navigator.geolocation.clearWatch(sharedWatchId);
    } catch {}
    sharedWatchId = null;
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('technician_current_job_id');
    localStorage.removeItem('technician_current_job_data');
  }
}

const TechnicianTrackingContext = createContext<TechnicianTrackingContextValue | null>(null);

function useTrackingInternal(currentServiceId?: string, isProvider = false): TechnicianTrackingContextValue {
  const [state, setState] = useState<TechnicianTrackingState>({
    isNavigating: false,
    activeServiceId: null,
    trackingStatus: 'NOT_TRACKING',
    destination: null,
    distanceText: null,
    etaText: null,
    lastUpdate: null,
    error: null,
    permissionState: 'prompt',
    isWatching: false,
  });

  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  // Initialize Socket.IO connection once
  useEffect(() => {
    if (!sharedSocket && typeof window !== 'undefined') {
      try {
        const rawBaseUrl = getApiBaseUrl();
        const socketUrl = rawBaseUrl || window.location.origin;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('crm_session_token') : null;
        sharedSocket = io(`${socketUrl}/maps`, {
          withCredentials: true,
          transports: ['websocket', 'polling'],
          auth: { token },
          autoConnect: true,
        });

        sharedSocket.on('technician:tracking_stopped', () => {
          if (sharedWatchId !== null && typeof navigator !== 'undefined' && typeof navigator.geolocation?.clearWatch === 'function') {
            try {
              navigator.geolocation.clearWatch(sharedWatchId);
            } catch {}
            sharedWatchId = null;
          }
          if (typeof window !== 'undefined') {
            localStorage.removeItem('technician_current_job_id');
            localStorage.removeItem('technician_current_job_data');
          }
          setState((prev) => ({
            ...prev,
            isNavigating: false,
            activeServiceId: null,
            trackingStatus: 'NOT_TRACKING',
            destination: null,
            distanceText: null,
            etaText: null,
            lastUpdate: null,
            isWatching: false,
          }));
        });
      } catch (err) {
        console.warn('[TechnicianTracking] Socket init notice:', err);
      }
    }
  }, []);

  // Send GPS location ping to server
  const sendLocationPing = useCallback(async (position: GeolocationPosition) => {
    const payload = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp || Date.now(),
    };

    // Try Socket.IO first
    if (sharedSocket && sharedSocket.connected) {
      sharedSocket.emit('technician:location_ping', payload, (res: any) => {
        if (res && res.record) {
          setState((prev) => ({
            ...prev,
            trackingStatus: res.record.trackingStatus || prev.trackingStatus,
            distanceText: res.record.distanceText ?? prev.distanceText,
            etaText: res.record.etaText ?? prev.etaText,
            lastUpdate: res.record.lastUpdate ?? Date.now(),
          }));
        }
      });
    } else {
      // Fallback to REST API
      try {
        const res = await fetch(resolveApiUrl('/maps/technician/location'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          if (sharedWatchId !== null && typeof navigator !== 'undefined' && typeof navigator.geolocation?.clearWatch === 'function') {
            try {
              navigator.geolocation.clearWatch(sharedWatchId);
            } catch {}
            sharedWatchId = null;
          }
          setState((prev) => ({
            ...prev,
            isWatching: false,
            trackingStatus: 'OFFLINE',
          }));
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setState((prev) => ({
              ...prev,
              trackingStatus: json.data.trackingStatus || prev.trackingStatus,
              distanceText: json.data.distanceText ?? prev.distanceText,
              etaText: json.data.etaText ?? prev.etaText,
              lastUpdate: json.data.lastUpdate ?? Date.now(),
            }));
          }
        }
      } catch {}
    }
  }, []);

  // Continuous geolocation watch using navigator.geolocation.watchPosition
  const startBrowserWatch = useCallback((_serviceId?: string) => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        permissionState: 'unsupported',
        error: 'Geolocation is not supported by your browser',
      }));
      return;
    }

    // Immediately acquire and transmit initial location fix if available
    if (typeof navigator.geolocation.getCurrentPosition === 'function') {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            sendLocationPing(pos);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
        );
      } catch {}
    }

    // Section 9: Exactly ONE active watcher per authenticated technician session
    if (sharedWatchId !== null) {
      return;
    }

    try {
      sharedWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          setState((prev) => ({
            ...prev,
            permissionState: 'granted',
            isWatching: true,
            error: null,
            trackingStatus: prev.trackingStatus === 'NOT_TRACKING' ? 'TRACKING_READY' : prev.trackingStatus,
          }));
          sendLocationPing(pos);
        },
        (err) => {
          if (err.code === 1) {
            // PERMISSION_DENIED
            setState((prev) => ({
              ...prev,
              permissionState: 'denied',
              isWatching: false,
              error: 'Location permission was denied. Please allow location access in your browser settings.',
            }));
            if (sharedWatchId !== null) {
              navigator.geolocation.clearWatch(sharedWatchId);
              sharedWatchId = null;
            }
          } else if (err.code === 2) {
            // POSITION_UNAVAILABLE
            setState((prev) => ({
              ...prev,
              error: 'Device GPS location is currently unavailable. Please verify GPS is enabled.',
            }));
          } else if (err.code === 3) {
            // TIMEOUT
            console.warn('[Geolocation] watchPosition timeout notice');
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 20000,
        }
      );

      setState((prev) => ({ ...prev, isWatching: true, permissionState: 'granted' }));
    } catch (err: any) {
      console.warn('[Geolocation] Failed to establish watchPosition:', err?.message);
    }
  }, [sendLocationPing]);

  // Request browser geolocation permission and acquire initial location fix
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        permissionState: 'unsupported',
        error: 'Geolocation is not supported by your browser',
      }));
      return false;
    }

    if (typeof navigator.geolocation.getCurrentPosition !== 'function') {
      startBrowserWatch();
      return true;
    }

    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setState((prev) => ({
            ...prev,
            permissionState: 'granted',
            error: null,
            trackingStatus: prev.trackingStatus === 'NOT_TRACKING' ? 'TRACKING_READY' : prev.trackingStatus,
          }));
          await sendLocationPing(pos);
          startBrowserWatch();
          resolve(true);
        },
        (err) => {
          if (err.code === 1) {
            setState((prev) => ({
              ...prev,
              permissionState: 'denied',
              isWatching: false,
              error: 'Location permission was denied. Please allow location access in your browser settings.',
            }));
          } else if (err.code === 2) {
            setState((prev) => ({
              ...prev,
              error: 'Device GPS position is currently unavailable. Please verify GPS is enabled.',
            }));
          } else if (err.code === 3) {
            setState((prev) => ({
              ...prev,
              error: 'GPS acquisition timed out. Retrying...',
            }));
          }
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 15000,
        }
      );
    });
  }, [sendLocationPing, startBrowserWatch]);

  // Poll server-side active tracking status on initialization and sync
  const checkActiveTracking = useCallback(async () => {
    try {
      const res = await fetch(resolveApiUrl('/maps/technician/active'), {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.activeDestination) {
          const dest = json.data.activeDestination;
          setState((prev) => ({
            ...prev,
            isNavigating: true,
            activeServiceId: dest.serviceId,
            trackingStatus: json.data.trackingStatus || 'ON_THE_WAY',
            destination: dest,
            distanceText: json.data.distanceText || null,
            etaText: json.data.etaText || null,
            lastUpdate: json.data.lastUpdate || Date.now(),
            error: null,
          }));

          if (typeof window !== 'undefined') {
            localStorage.setItem('technician_current_job_id', dest.serviceId);
            localStorage.setItem(
              'technician_current_job_data',
              JSON.stringify({
                id: dest.serviceId,
                serviceId: dest.serviceId,
                serviceNumber: dest.serviceNumber,
                customerName: dest.customerName,
                customerPhone: dest.customerPhone,
                serviceAddress: dest.address,
                status: 'ON_THE_WAY',
                scheduledTimeSlot: dest.scheduledTimeSlot,
              })
            );
          }

          // If tracking was active and no watcher is running, restart watchPosition
          if (sharedWatchId === null && typeof navigator !== 'undefined' && navigator.geolocation) {
            startBrowserWatch(dest.serviceId);
          }
        }
      }
    } catch {}
  }, [startBrowserWatch]);

  // Sections 6 & 7: Check location capability on portal entry without prompting
  useEffect(() => {
    let isMounted = true;

    async function initLocationCapability() {
      if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
        if (isMounted) {
          setState((prev) => ({ ...prev, permissionState: 'unsupported' }));
        }
        return;
      }

      // Check current permission state if navigator.permissions is supported
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const permStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          if (!isMounted) return;

          if (permStatus.state === 'granted') {
            setState((prev) => ({ ...prev, permissionState: 'granted', error: null }));
            startBrowserWatch();
          } else if (permStatus.state === 'prompt') {
            setState((prev) => ({ ...prev, permissionState: 'prompt' }));
            requestPermission();
          } else if (permStatus.state === 'denied') {
            setState((prev) => ({
              ...prev,
              permissionState: 'denied',
              error: 'Location permission was denied. Please allow location access in your browser settings.',
            }));
          }

          permStatus.onchange = () => {
            if (!isMounted) return;
            if (permStatus.state === 'granted') {
              setState((prev) => ({ ...prev, permissionState: 'granted', error: null }));
              startBrowserWatch();
            } else if (permStatus.state === 'denied') {
              setState((prev) => ({
                ...prev,
                permissionState: 'denied',
                isWatching: false,
                error: 'Location permission was denied. Please allow location access in your browser settings.',
              }));
              if (sharedWatchId !== null && typeof navigator.geolocation?.clearWatch === 'function') {
                try {
                  navigator.geolocation.clearWatch(sharedWatchId);
                } catch {}
                sharedWatchId = null;
              }
            }
          };
          return;
        } catch {}
      }

      // If navigator.permissions is not available (e.g. mobile browsers / webviews)
      requestPermission();
    }

    if (isProvider) {
      initLocationCapability();
    }
    checkActiveTracking();

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkActiveTracking();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    const periodicSync = setInterval(checkActiveTracking, 30000);

    return () => {
      isMounted = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      clearInterval(periodicSync);
      // NEVER clear sharedWatchId when child pages or non-provider components unmount!
    };
  }, [isProvider, checkActiveTracking]);

  // Navigate trigger action
  const handleNavigate = useCallback(
    async (targetServiceId: string, confirmSwitch = false) => {
      setState((prev) => ({ ...prev, error: null }));

      // Step 5: Check/request location permission if needed before initiating navigation
      let hasPermission = state.permissionState === 'granted';
      if (!hasPermission) {
        hasPermission = await requestPermission();
        if (!hasPermission) {
          return { success: false, error: 'Location permission is required to start live journey tracking.' };
        }
      }

      try {
        const res = await fetch(resolveApiUrl('/maps/technician/navigate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            serviceId: targetServiceId,
            confirmSwitch,
          }),
        });

        const json = await res.json();

        // 409 Conflict: Already navigating another destination
        if (res.status === 409 || json.conflict) {
          setConflictModal({
            isOpen: true,
            activeServiceId: json.activeServiceId,
            activeServiceNumber: json.activeServiceNumber || 'Previous Service',
            pendingServiceId: targetServiceId,
          });
          return { conflict: true };
        }

        if (!res.ok) {
          const errorMsg = json.error?.message || 'Failed to start navigation';
          setState((prev) => ({ ...prev, error: errorMsg }));
          return { success: false, error: errorMsg };
        }

        // Navigation initiated successfully
        const dest = json.destination;
        setState((prev) => ({
          ...prev,
          isNavigating: true,
          activeServiceId: targetServiceId,
          trackingStatus: json.trackingStatus || 'ON_THE_WAY',
          destination: dest,
          distanceText: null,
          etaText: null,
          lastUpdate: Date.now(),
          error: null,
        }));

        // Synchronize localStorage for portal pages (Dashboard, Services, Detail)
        if (typeof window !== 'undefined') {
          localStorage.setItem('technician_current_job_id', targetServiceId);
          if (dest) {
            localStorage.setItem(
              'technician_current_job_data',
              JSON.stringify({
                id: dest.serviceId,
                serviceId: dest.serviceId,
                serviceNumber: dest.serviceNumber,
                customerName: dest.customerName,
                customerPhone: dest.customerPhone,
                serviceAddress: dest.address,
                status: 'ON_THE_WAY',
                scheduledTimeSlot: dest.scheduledTimeSlot,
              })
            );
          }
        }

        // Continue/ensure existing browser watch is active (does not duplicate)
        startBrowserWatch(targetServiceId);

        // Open Google Maps external navigation URL
        if (json.googleMapsUrl) {
          window.open(json.googleMapsUrl, '_blank', 'noopener,noreferrer');
        }

        return { success: true, googleMapsUrl: json.googleMapsUrl };
      } catch (err: any) {
        const msg = err?.message || 'Network error while initiating navigation';
        setState((prev) => ({ ...prev, error: msg }));
        return { success: false, error: msg };
      }
    },
    [state.permissionState, requestPermission, startBrowserWatch]
  );

  // Stop tracking action
  const handleStopTracking = useCallback(async () => {
    if (sharedWatchId !== null && typeof navigator !== 'undefined' && typeof navigator.geolocation?.clearWatch === 'function') {
      try {
        navigator.geolocation.clearWatch(sharedWatchId);
      } catch {}
      sharedWatchId = null;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('technician_current_job_id');
      localStorage.removeItem('technician_current_job_data');
    }

    try {
      await fetch(resolveApiUrl('/maps/technician/stop'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}

    if (sharedSocket && sharedSocket.connected) {
      sharedSocket.emit('technician:stop_tracking', {});
    }

    setState((prev) => ({
      ...prev,
      isNavigating: false,
      activeServiceId: null,
      trackingStatus: 'NOT_TRACKING',
      destination: null,
      distanceText: null,
      etaText: null,
      lastUpdate: null,
      error: null,
      isWatching: false,
    }));
  }, []);

  return {
    state,
    ...state,
    isThisServiceActive: Boolean(
      currentServiceId && state.isNavigating && state.activeServiceId === currentServiceId
    ),
    conflictModal,
    dismissConflictModal: () => setConflictModal(null),
    confirmSwitchDestination: () => {
      if (conflictModal) {
        const nextId = conflictModal.pendingServiceId;
        setConflictModal(null);
        handleNavigate(nextId, true);
      }
    },
    navigate: (serviceId: string) => handleNavigate(serviceId, false),
    stopTracking: handleStopTracking,
    requestPermission,
    startBrowserWatch,
  };
}

const TechnicianTrackingRootProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useTrackingInternal(undefined, true);
  return React.createElement(TechnicianTrackingContext.Provider, { value }, children);
};

/**
 * Technician Tracking Provider: Mounted at Technician Portal root
 * Ensures exactly ONE controlled active watcher for the technician portal lifecycle
 */
export const TechnicianTrackingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const existingContext = useContext(TechnicianTrackingContext);
  if (existingContext) {
    return React.createElement(React.Fragment, null, children);
  }
  return React.createElement(TechnicianTrackingRootProvider, null, children);
};

export function useTechnicianTrackingContext(): TechnicianTrackingContextValue {
  const context = useContext(TechnicianTrackingContext);
  if (!context) {
    throw new Error('useTechnicianTrackingContext must be used within a TechnicianTrackingProvider');
  }
  return context;
}

/**
 * useTechnicianTracking: Hook for technician portal components
 * Reuses the TechnicianTrackingContext when present, or creates standalone instance if rendered independently.
 */
export function useTechnicianTracking(currentServiceId?: string) {
  const context = useContext(TechnicianTrackingContext);

  if (context) {
    return {
      ...context,
      ...context.state,
      isThisServiceActive: Boolean(
        currentServiceId && context.state.isNavigating && context.state.activeServiceId === currentServiceId
      ),
      navigate: (serviceId: string) => context.navigate(serviceId),
      stopTracking: context.stopTracking,
      requestPermission: context.requestPermission,
      startBrowserWatch: context.startBrowserWatch,
      dismissConflictModal: context.dismissConflictModal,
      confirmSwitchDestination: context.confirmSwitchDestination,
    };
  }

  // Fallback for tests or components rendered outside provider
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useTrackingInternal(currentServiceId);
}

