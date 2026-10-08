/**
 * Maps & Technician Live Tracking Types
 * Isolated operational tracking state definition per Master Implementation Prompt.
 * Note: Tracking state is temporary operational state and strictly separate from job card execution state.
 */

export const TRACKING_STATUSES = {
  NOT_TRACKING: 'NOT_TRACKING',
  ONLINE: 'ONLINE',
  TRACKING_READY: 'TRACKING_READY',
  NAVIGATION_SELECTED: 'NAVIGATION_SELECTED',
  ON_THE_WAY: 'ON_THE_WAY',
  ARRIVAL_PENDING: 'ARRIVAL_PENDING',
  AT_CUSTOMER: 'AT_CUSTOMER',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
  STOPPED_ON_WAY: 'STOPPED_ON_WAY',
} as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[keyof typeof TRACKING_STATUSES];

export const FRESHNESS_THRESHOLDS = {
  LIVE_MAX_AGE_SEC: 30,
  WARNING_MAX_AGE_SEC: 90,
  OFFLINE_MIN_AGE_SEC: 900, // 15 minutes
} as const;

export type StatusFreshness = 'LIVE' | 'WARNING' | 'STALE' | 'OFFLINE';

export interface TechnicianLocationPing {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface ActiveDestinationRecord {
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
  scheduledDate?: string | Date | null;
  scheduledTimeSlot?: string | null;
  startedAt: number;
}

export interface TechnicianTrackingRecord {
  technicianId: string;
  technicianName: string;
  technicianPhone?: string;
  trackingStatus: TrackingStatus;
  activeDestination: ActiveDestinationRecord | null;
  currentLocation: TechnicianLocationPing | null;
  distanceMeters?: number | null;
  distanceText?: string | null;
  etaSeconds?: number | null;
  etaText?: string | null;
  arrivalPendingSince?: number | null;
  arrivalPendingSamples?: number;
  lastUpdate: number;
  freshness: StatusFreshness;
}

export interface RoutesCalculationResult {
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
  source: 'GOOGLE_ROUTES_API' | 'HAVERSINE_ESTIMATE';
}
