import { getRedisClient } from '../../redis/client';
import {
  TRACKING_STATUSES,
  FRESHNESS_THRESHOLDS,
  type TrackingStatus,
  type StatusFreshness,
  type TechnicianLocationPing,
  type ActiveDestinationRecord,
  type TechnicianTrackingRecord,
} from './maps-tracking.types';
import { mapsRoutesService } from './maps-routes.service';

/**
 * Isolated Redis Temporary Location & Tracking State Manager
 *
 * Rules:
 * - NO permanent PostgreSQL GPS tables.
 * - Temporary Redis state with TTL 7200 seconds (2 hours maximum retention).
 * - Immediate cleanup upon tracking stop or job completion.
 * - Isolated keys per technician: NO global state.
 * - ONE active destination per technician.
 */
export class MapsTrackingRedisService {
  private keyPrefixLocation = 'tech_location:';
  private keyPrefixDestination = 'tech_active_dest:';
  private keyActiveSet = 'tech_active_tracking_set';
  private stateTtlSeconds = 7200; // 2 hours auto-expire

  /**
   * Determine staleness classification for a given timestamp
   */
  public evaluateFreshness(lastUpdate: number): StatusFreshness {
    const ageSeconds = Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000));
    if (ageSeconds <= FRESHNESS_THRESHOLDS.LIVE_MAX_AGE_SEC) {
      return 'LIVE';
    }
    if (ageSeconds <= FRESHNESS_THRESHOLDS.WARNING_MAX_AGE_SEC) {
      return 'WARNING';
    }
    if (ageSeconds >= FRESHNESS_THRESHOLDS.OFFLINE_MIN_AGE_SEC) {
      return 'OFFLINE';
    }
    return 'STALE';
  }

  /**
   * Set the active navigation destination for an authenticated technician.
   * Enforces: ONE technician = ONE active destination.
   */
  public async setActiveDestination(
    technicianId: string,
    destination: ActiveDestinationRecord
  ): Promise<void> {
    const redis = getRedisClient();
    const destKey = `${this.keyPrefixDestination}${technicianId}`;
    const locKey = `${this.keyPrefixLocation}${technicianId}`;

    // Read previous location if exists to maintain current ping
    let currentRecord: Partial<TechnicianTrackingRecord> | null = null;
    try {
      const raw = await redis.get(locKey);
      if (raw) currentRecord = JSON.parse(raw);
    } catch {}

    const updatedRecord: TechnicianTrackingRecord = {
      technicianId,
      technicianName: destination.customerName ? currentRecord?.technicianName || 'Technician' : 'Technician',
      technicianPhone: currentRecord?.technicianPhone,
      trackingStatus: TRACKING_STATUSES.ON_THE_WAY,
      activeDestination: destination,
      currentLocation: currentRecord?.currentLocation || null,
      distanceMeters: currentRecord?.distanceMeters || null,
      distanceText: currentRecord?.distanceText || null,
      etaSeconds: currentRecord?.etaSeconds || null,
      etaText: currentRecord?.etaText || null,
      arrivalPendingSince: null,
      arrivalPendingSamples: 0,
      lastUpdate: Date.now(),
      freshness: 'LIVE',
    };

    // Store in Redis with TTL
    await redis.set(destKey, JSON.stringify(destination), 'EX', this.stateTtlSeconds);
    await redis.set(locKey, JSON.stringify(updatedRecord), 'EX', this.stateTtlSeconds);
    await redis.sadd(this.keyActiveSet, technicianId);
  }

  /**
   * Get active destination for an authenticated technician
   */
  public async getActiveDestination(
    technicianId: string
  ): Promise<ActiveDestinationRecord | null> {
    const redis = getRedisClient();
    const destKey = `${this.keyPrefixDestination}${technicianId}`;
    try {
      const raw = await redis.get(destKey);
      return raw ? (JSON.parse(raw) as ActiveDestinationRecord) : null;
    } catch {
      return null;
    }
  }

  /**
   * Process and save a live GPS location ping for a technician.
   * Performs arrival detection and distance/ETA recalculation.
   */
  public async updateLocation(
    technicianId: string,
    technicianName: string,
    technicianPhone: string | undefined,
    ping: TechnicianLocationPing
  ): Promise<TechnicianTrackingRecord> {
    const redis = getRedisClient();
    const locKey = `${this.keyPrefixLocation}${technicianId}`;
    const destKey = `${this.keyPrefixDestination}${technicianId}`;

    // Retrieve active destination
    const destination = await this.getActiveDestination(technicianId);

    // Retrieve existing location state
    let prevRecord: TechnicianTrackingRecord | null = null;
    try {
      const raw = await redis.get(locKey);
      if (raw) prevRecord = JSON.parse(raw);
    } catch {}

    let trackingStatus: TrackingStatus = destination
      ? (prevRecord?.trackingStatus || TRACKING_STATUSES.ON_THE_WAY)
      : TRACKING_STATUSES.ONLINE;
    let distanceMeters: number | null = destination ? (prevRecord?.distanceMeters ?? null) : null;
    let distanceText: string | null = destination ? (prevRecord?.distanceText ?? null) : null;
    let etaSeconds: number | null = destination ? (prevRecord?.etaSeconds ?? null) : null;
    let etaText: string | null = destination ? (prevRecord?.etaText ?? null) : null;
    let arrivalPendingSince = destination ? (prevRecord?.arrivalPendingSince ?? null) : null;
    let arrivalPendingSamples = destination ? (prevRecord?.arrivalPendingSamples ?? 0) : 0;

    // Perform distance and arrival calculations if destination has valid coordinates
    if (destination && destination.latitude && destination.longitude) {
      const straightLineDist = mapsRoutesService.calculateHaversineDistance(
        ping.latitude,
        ping.longitude,
        destination.latitude,
        destination.longitude
      );

      // Arrival detection logic: Geofence ~ 100 meters
      const GEOFENCE_RADIUS_METERS = 100;

      if (straightLineDist <= GEOFENCE_RADIUS_METERS) {
        if (trackingStatus === TRACKING_STATUSES.ON_THE_WAY) {
          // Transition to ARRIVAL_PENDING on first proximity detection
          trackingStatus = TRACKING_STATUSES.ARRIVAL_PENDING;
          arrivalPendingSince = Date.now();
          arrivalPendingSamples = 1;
        } else if (trackingStatus === TRACKING_STATUSES.ARRIVAL_PENDING) {
          arrivalPendingSamples += 1;
          const dwellDurationSec = arrivalPendingSince
            ? Math.floor((Date.now() - arrivalPendingSince) / 1000)
            : 0;

          // Transition to AT_CUSTOMER only after dwell/stability check (e.g. >= 2 samples or >= 8 seconds)
          if (arrivalPendingSamples >= 2 || dwellDurationSec >= 8) {
            trackingStatus = TRACKING_STATUSES.AT_CUSTOMER;
          }
        }
      } else {
        // Technician is outside the geofence
        if (trackingStatus === TRACKING_STATUSES.ARRIVAL_PENDING && straightLineDist > 150) {
          // Revert back to ON_THE_WAY if technician moved away
          trackingStatus = TRACKING_STATUSES.ON_THE_WAY;
          arrivalPendingSince = null;
          arrivalPendingSamples = 0;
        }
      }

      // Recompute road distance & ETA (throttled inside mapsRoutesService)
      try {
        const route = await mapsRoutesService.computeRoute(
          ping.latitude,
          ping.longitude,
          destination.latitude,
          destination.longitude
        );
        distanceMeters = route.distanceMeters;
        distanceText = route.distanceText;
        etaSeconds = route.durationSeconds;
        etaText = route.durationText;
      } catch {
        distanceMeters = straightLineDist;
        distanceText = mapsRoutesService.formatDistance(straightLineDist);
      }
    }

    const record: TechnicianTrackingRecord = {
      technicianId,
      technicianName: technicianName || prevRecord?.technicianName || 'Technician',
      technicianPhone: technicianPhone || prevRecord?.technicianPhone,
      trackingStatus,
      activeDestination: destination,
      currentLocation: ping,
      distanceMeters,
      distanceText,
      etaSeconds,
      etaText,
      arrivalPendingSince,
      arrivalPendingSamples,
      lastUpdate: Date.now(),
      freshness: 'LIVE',
    };

    // Save with 2-hour TTL fallback
    await redis.set(locKey, JSON.stringify(record), 'EX', this.stateTtlSeconds);
    await redis.sadd(this.keyActiveSet, technicianId);

    return record;
  }

  /**
   * Get location record for a single technician
   */
  public async getLocation(technicianId: string): Promise<TechnicianTrackingRecord | null> {
    const redis = getRedisClient();
    const locKey = `${this.keyPrefixLocation}${technicianId}`;
    try {
      const raw = await redis.get(locKey);
      if (!raw) return null;
      const record = JSON.parse(raw) as TechnicianTrackingRecord;
      record.freshness = this.evaluateFreshness(record.lastUpdate);
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve all currently active tracked technicians for the Admin Live Map.
   */
  public async getAllActiveLocations(): Promise<TechnicianTrackingRecord[]> {
    const redis = getRedisClient();
    try {
      const techIds = await redis.smembers(this.keyActiveSet);
      if (!techIds || techIds.length === 0) {
        return [];
      }

      const records: TechnicianTrackingRecord[] = [];
      const staleOrMissing: string[] = [];

      for (const id of techIds) {
        const locKey = `${this.keyPrefixLocation}${id}`;
        const raw = await redis.get(locKey);
        if (!raw) {
          staleOrMissing.push(id);
          continue;
        }
        const record = JSON.parse(raw) as TechnicianTrackingRecord;
        record.freshness = this.evaluateFreshness(record.lastUpdate);
        records.push(record);
      }

      // Clean up dead IDs from the active set
      if (staleOrMissing.length > 0) {
        await redis.srem(this.keyActiveSet, ...staleOrMissing);
      }

      return records;
    } catch {
      return [];
    }
  }

  /**
   * Immediately clear active tracking and destination state when tracking terminates normally.
   */
  public async clearTracking(technicianId: string): Promise<void> {
    const redis = getRedisClient();
    const locKey = `${this.keyPrefixLocation}${technicianId}`;
    const destKey = `${this.keyPrefixDestination}${technicianId}`;

    try {
      await redis.del(locKey, destKey);
      await redis.srem(this.keyActiveSet, technicianId);
    } catch (err) {
      console.warn(`[MapsTrackingRedisService] Error clearing tracking state for ${technicianId}:`, err);
    }
  }
}

export const mapsTrackingRedisService = new MapsTrackingRedisService();
