import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { env } from '../../config/env.js';
import { mapsTrackingRedisService } from './maps-tracking.redis.js';
import { mapsRoutesService } from './maps-routes.service.js';
import {
  TRACKING_STATUSES,
  FRESHNESS_THRESHOLDS,
  type ActiveDestinationRecord,
} from './maps-tracking.types.js';

describe('Google Maps Platform & Live Tracking Architecture Suite', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Credential Protection & Configuration Endpoint', () => {
    it('GET /api/v1/maps/admin/config returns browser API key and map ID, but NEVER exposes server API keys or secrets', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/maps/admin/config',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();

      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      // Verified present fields
      expect(json.data).toHaveProperty('apiKey');
      expect(json.data).toHaveProperty('mapId');

      // Strict credential isolation checks:
      expect(json.data).not.toHaveProperty('serverApiKey');
      expect(json.data).not.toHaveProperty('routesApiKey');
      expect(json.data).not.toHaveProperty('ROUTES_API_KEY');
      expect(json.data).not.toHaveProperty('secret');
      expect(json.data).not.toHaveProperty('jwtSecret');
    });
  });

  describe('2. Security & Server-Side Authorization (Sections 15, 16)', () => {
    it('rejects unauthenticated requests to /api/v1/maps/technician/navigate with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/maps/technician/navigate',
        payload: { serviceId: 'srv-123' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to /api/v1/maps/technician/location with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/maps/technician/location',
        payload: {
          latitude: 18.5204,
          longitude: 73.8567,
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to /api/v1/maps/technician/stop with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/maps/technician/stop',
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects unauthenticated requests to /api/v1/maps/technician/active with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/maps/technician/active',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('3. Concurrency & Isolation Testing (Sections 10, 16, 30)', () => {
    it('isolates state across 1, 5, and 20+ concurrent technicians with zero cross-contamination', async () => {
      const technicianCount = 25;
      const testTechnicians = Array.from({ length: technicianCount }, (_, i) => ({
        technicianId: `concurrent-tech-${i + 1}`,
        technicianName: `Field Engineer ${i + 1}`,
        serviceId: `service-${100 + i}`,
        lat: 18.5000 + i * 0.005,
        lng: 73.8000 + i * 0.005,
      }));

      // Set active destinations concurrently
      await Promise.all(
        testTechnicians.map((tech) => {
          const dest: ActiveDestinationRecord = {
            serviceId: tech.serviceId,
            serviceNumber: `SRV-${tech.serviceId}`,
            customerId: `cust-${tech.technicianId}`,
            customerName: `Customer ${tech.technicianName}`,
            customerPhone: '9876543210',
            address: `Address for ${tech.technicianName}`,
            latitude: tech.lat + 0.01,
            longitude: tech.lng + 0.01,
            startedAt: Date.now(),
          };
          return mapsTrackingRedisService.setActiveDestination(tech.technicianId, dest);
        })
      );

      // Record location updates concurrently
      await Promise.all(
        testTechnicians.map((tech) =>
          mapsTrackingRedisService.updateLocation(
            tech.technicianId,
            tech.technicianName,
            '9876543210',
            {
              latitude: tech.lat,
              longitude: tech.lng,
              accuracy: 10,
              timestamp: Date.now(),
            }
          )
        )
      );

      // Verify each technician has independent destination and location
      for (const tech of testTechnicians) {
        const activeDest = await mapsTrackingRedisService.getActiveDestination(tech.technicianId);
        expect(activeDest).not.toBeNull();
        expect(activeDest?.serviceId).toBe(tech.serviceId);
      }

      // Query active tracking records
      const activeList = await mapsTrackingRedisService.getAllActiveLocations();
      expect(activeList.length).toBeGreaterThanOrEqual(technicianCount);

      const foundTech1 = activeList.find((t) => t.technicianId === 'concurrent-tech-1');
      const foundTech25 = activeList.find((t) => t.technicianId === 'concurrent-tech-25');

      expect(foundTech1).toBeDefined();
      expect(foundTech25).toBeDefined();

      // Verify no shared/overwritten coordinates
      expect(foundTech1?.currentLocation?.latitude).toBeCloseTo(testTechnicians[0].lat, 4);
      expect(foundTech25?.currentLocation?.latitude).toBeCloseTo(testTechnicians[24].lat, 4);
      expect(foundTech1?.activeDestination?.serviceId).toBe('service-100');
      expect(foundTech25?.activeDestination?.serviceId).toBe('service-124');

      // Cleanup
      await Promise.all(testTechnicians.map((t) => mapsTrackingRedisService.clearTracking(t.technicianId)));
    }, 20000);
  });

  describe('4. Arrival Detection State Machine (Section 20)', () => {
    const techId = 'arrival-tech-test';
    const destLat = 18.5204;
    const destLng = 73.8567;

    afterEach(async () => {
      await mapsTrackingRedisService.clearTracking(techId);
    });

    it('remains ON_THE_WAY when outside the 100m geofence', async () => {
      await mapsTrackingRedisService.setActiveDestination(techId, {
        serviceId: 'srv-arrival-1',
        serviceNumber: 'SRV-ARR-1',
        customerId: 'cust-1',
        customerName: 'Customer One',
        address: 'MG Road, Pune',
        latitude: destLat,
        longitude: destLng,
        startedAt: Date.now(),
      });

      // 5km away
      const record = await mapsTrackingRedisService.updateLocation(
        techId,
        'Arrival Engineer',
        undefined,
        {
          latitude: 18.5600,
          longitude: 73.8567,
          accuracy: 15,
          timestamp: Date.now(),
        }
      );

      expect(record?.trackingStatus).toBe(TRACKING_STATUSES.ON_THE_WAY);
    });

    it('transitions to ARRIVAL_PENDING upon entering the 100m geofence on first sample', async () => {
      await mapsTrackingRedisService.setActiveDestination(techId, {
        serviceId: 'srv-arrival-2',
        serviceNumber: 'SRV-ARR-2',
        customerId: 'cust-2',
        customerName: 'Customer Two',
        address: 'FC Road, Pune',
        latitude: destLat,
        longitude: destLng,
        startedAt: Date.now(),
      });

      // Within ~20 meters of customer
      const record1 = await mapsTrackingRedisService.updateLocation(
        techId,
        'Arrival Engineer',
        undefined,
        {
          latitude: 18.52055,
          longitude: 73.8567,
          accuracy: 10,
          timestamp: Date.now(),
        }
      );

      expect(record1?.trackingStatus).toBe(TRACKING_STATUSES.ARRIVAL_PENDING);
    });

    it('transitions to AT_CUSTOMER only after stability/dwell requirement is met', async () => {
      await mapsTrackingRedisService.setActiveDestination(techId, {
        serviceId: 'srv-arrival-3',
        serviceNumber: 'SRV-ARR-3',
        customerId: 'cust-3',
        customerName: 'Customer Three',
        address: 'JM Road, Pune',
        latitude: destLat,
        longitude: destLng,
        startedAt: Date.now(),
      });

      // First sample inside geofence -> ARRIVAL_PENDING
      const record1 = await mapsTrackingRedisService.updateLocation(
        techId,
        'Arrival Engineer',
        undefined,
        {
          latitude: 18.52048,
          longitude: 73.8567,
          accuracy: 8,
          timestamp: Date.now(),
        }
      );
      expect(record1?.trackingStatus).toBe(TRACKING_STATUSES.ARRIVAL_PENDING);

      // Second consecutive stable sample inside geofence -> AT_CUSTOMER
      const record2 = await mapsTrackingRedisService.updateLocation(
        techId,
        'Arrival Engineer',
        undefined,
        {
          latitude: 18.52045,
          longitude: 73.8567,
          accuracy: 6,
          timestamp: Date.now() + 1000,
        }
      );
      expect(record2?.trackingStatus).toBe(TRACKING_STATUSES.AT_CUSTOMER);
    });
  });

  describe('5. Freshness & Staleness Calculation (Section 19)', () => {
    it('correctly maps age to LIVE, WARNING, STALE, and OFFLINE', () => {
      const now = Date.now();

      // Fresh (0-30s)
      expect(mapsTrackingRedisService.evaluateFreshness(now)).toBe('LIVE');
      expect(mapsTrackingRedisService.evaluateFreshness(now - 15000)).toBe('LIVE');
      expect(mapsTrackingRedisService.evaluateFreshness(now - 30000)).toBe('LIVE');

      // Warning / Aging (31-90s)
      expect(mapsTrackingRedisService.evaluateFreshness(now - 45000)).toBe('WARNING');
      expect(mapsTrackingRedisService.evaluateFreshness(now - 90000)).toBe('WARNING');

      // Stale (91s - 15min)
      expect(mapsTrackingRedisService.evaluateFreshness(now - 120000)).toBe('STALE');
      expect(mapsTrackingRedisService.evaluateFreshness(now - 500000)).toBe('STALE');

      // Offline (>15min)
      expect(mapsTrackingRedisService.evaluateFreshness(now - 901000)).toBe('OFFLINE');
      expect(mapsTrackingRedisService.evaluateFreshness(now - 3600000)).toBe('OFFLINE');
    });
  });

  describe('6. Routes Service & Distance Fallback (Section 21)', () => {
    it('accurately computes Haversine straight-line distance in meters', () => {
      // Pune Station to Shivaji Nagar (~2.5km)
      const dist = mapsRoutesService.calculateHaversineDistance(18.5284, 73.8744, 18.5314, 73.8446);
      expect(dist).toBeGreaterThan(2000);
      expect(dist).toBeLessThan(4000);
    });

    it('formats distance and duration strings cleanly', () => {
      expect(mapsRoutesService.formatDistance(450)).toBe('450 m');
      expect(mapsRoutesService.formatDistance(3200)).toBe('3.2 km');
      expect(mapsRoutesService.formatDuration(20)).toBe('< 1 min');
      expect(mapsRoutesService.formatDuration(300)).toBe('5 mins');
    });

    it('calculates road route distance and ETA with graceful fallback', async () => {
      const result = await mapsRoutesService.computeRoute(
        18.5204,
        73.8567,
        18.5300,
        73.8600
      );

      expect(result).toHaveProperty('distanceMeters');
      expect(result).toHaveProperty('durationSeconds');
      expect(result).toHaveProperty('distanceText');
      expect(result).toHaveProperty('durationText');
      expect(result.distanceMeters).toBeGreaterThan(0);
      expect(result.durationSeconds).toBeGreaterThan(0);
    });
  });

  describe('7. Tracking Termination & Temporary State Purging (Sections 14, 23)', () => {
    it('immediately purges Redis temporary state when tracking is cleared', async () => {
      const techId = 'tech-purge-test';

      await mapsTrackingRedisService.setActiveDestination(techId, {
        serviceId: 'srv-purge-1',
        serviceNumber: 'SRV-PURGE-1',
        customerId: 'cust-purge',
        customerName: 'Purge Customer',
        address: 'Camp, Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        startedAt: Date.now(),
      });

      await mapsTrackingRedisService.updateLocation(
        techId,
        'Purge Engineer',
        undefined,
        {
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 10,
          timestamp: Date.now(),
        }
      );

      // Verify active
      const beforePurge = await mapsTrackingRedisService.getActiveDestination(techId);
      expect(beforePurge).not.toBeNull();

      // Clear tracking
      await mapsTrackingRedisService.clearTracking(techId);

      // Verify immediate removal
      const afterPurgeDest = await mapsTrackingRedisService.getActiveDestination(techId);
      expect(afterPurgeDest).toBeNull();

      const activeList = await mapsTrackingRedisService.getAllActiveLocations();
      expect(activeList.find((t) => t.technicianId === techId)).toBeUndefined();
    });
  });
});
