/// <reference types="@types/google.maps" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { io, Socket } from 'socket.io-client';
import {
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Clock,
  Compass,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Users,
  Activity,
  Filter,
  Eye,
  Radio,
  X,
  ChevronRight,
} from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { getApiBaseUrl } from '../../../lib/api-client';
import { cn } from '../../../lib/utils';

export interface ActiveTechnicianLocation {
  technicianId: string;
  technicianName: string;
  technicianPhone?: string;
  serviceId: string;
  jobCardId?: string;
  trackingStatus: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  customerName?: string;
  customerAddress?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  scheduledTime?: string;
  distanceKm?: number;
  etaMinutes?: number;
  lastUpdated: string;
  statusFreshness: 'LIVE' | 'WARNING' | 'STALE' | 'OFFLINE';
  secondsAgo: number;
}

export interface AdminMapsConfig {
  apiKey: string;
  mapId: string | null;
  stalenessThresholds: {
    liveSeconds: number;
    warningSeconds: number;
    staleSeconds: number;
    offlineSeconds: number;
  };
}

export interface AdminLiveTechnicianMapProps {
  onViewJobCard?: (jobCardId: string) => void;
  className?: string;
}

export function normalizeTechnicianLocation(record: any): ActiveTechnicianLocation | null {
  if (!record || typeof record !== 'object') return null;

  const lat = typeof record.latitude === 'number'
    ? record.latitude
    : (typeof record.currentLocation?.latitude === 'number' ? record.currentLocation.latitude : null);

  const lng = typeof record.longitude === 'number'
    ? record.longitude
    : (typeof record.currentLocation?.longitude === 'number' ? record.currentLocation.longitude : null);

  if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) {
    return null;
  }

  const lastUpdateMs = typeof record.lastUpdate === 'number'
    ? record.lastUpdate
    : (record.lastUpdated ? new Date(record.lastUpdated).getTime() : Date.now());

  const secondsAgo = typeof record.secondsAgo === 'number'
    ? record.secondsAgo
    : Math.max(0, Math.floor((Date.now() - lastUpdateMs) / 1000));

  const freshness = (record.statusFreshness || record.freshness || 'LIVE') as 'LIVE' | 'WARNING' | 'STALE' | 'OFFLINE';
  const dest = record.activeDestination;

  return {
    technicianId: String(record.technicianId || ''),
    technicianName: String(record.technicianName || 'Technician'),
    technicianPhone: record.technicianPhone,
    serviceId: record.serviceId || dest?.serviceId || '',
    jobCardId: record.jobCardId || dest?.jobCardId || undefined,
    trackingStatus: record.trackingStatus || (dest || record.serviceId ? 'ON_THE_WAY' : 'ONLINE'),
    latitude: lat,
    longitude: lng,
    accuracy: record.accuracy ?? record.currentLocation?.accuracy,
    heading: record.heading ?? record.currentLocation?.heading,
    speed: record.speed ?? record.currentLocation?.speed,
    customerName: record.customerName || dest?.customerName,
    customerAddress: record.customerAddress || dest?.address,
    customerLatitude: record.customerLatitude ?? dest?.latitude,
    customerLongitude: record.customerLongitude ?? dest?.longitude,
    scheduledTime: record.scheduledTime || dest?.scheduledTimeSlot,
    distanceKm: record.distanceKm ?? (record.distanceMeters ? Math.round((record.distanceMeters / 1000) * 10) / 10 : undefined),
    etaMinutes: record.etaMinutes ?? (record.etaSeconds ? Math.ceil(record.etaSeconds / 60) : undefined),
    lastUpdated: record.lastUpdated || new Date(lastUpdateMs).toISOString(),
    statusFreshness: freshness,
    secondsAgo,
  };
}

export const AdminLiveTechnicianMap: React.FC<AdminLiveTechnicianMapProps> = ({
  onViewJobCard,
  className,
}) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  const [config, setConfig] = useState<AdminMapsConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [technicians, setTechnicians] = useState<ActiveTechnicianLocation[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // 1. Fetch Maps Config from backend
  useEffect(() => {
    let isMounted = true;
    async function fetchConfig() {
      try {
        setConfigLoading(true);
        setConfigError(null);
        const res = await apiClient.get<AdminMapsConfig>('/maps/admin/config');
        if (isMounted) {
          if (res && res.data) {
            setConfig(res.data);
          } else {
            setConfigError('Invalid configuration response from server.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setConfigError(
            err?.message || 'Failed to load Google Maps configuration. Please check server settings.'
          );
        }
      } finally {
        if (isMounted) setConfigLoading(false);
      }
    }
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch Active Technicians
  const fetchLiveTechnicians = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const res = await apiClient.get<ActiveTechnicianLocation[]>('/maps/admin/live-technicians');
      if (res && res.data) {
        const rawList = Array.isArray(res.data) ? res.data : [];
        const normalized = rawList.map(normalizeTechnicianLocation).filter(Boolean) as ActiveTechnicianLocation[];
        setTechnicians(normalized);
      }
    } catch (err) {
      console.error('[AdminLiveMap] Failed to fetch live technicians', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveTechnicians();
    // Fallback polling interval every 15s to guarantee fresh view
    const pollTimer = setInterval(fetchLiveTechnicians, 15000);
    return () => clearInterval(pollTimer);
  }, [fetchLiveTechnicians]);

  // 3. Socket.IO connection for real-time live map updates
  useEffect(() => {
    const rawBaseUrl = getApiBaseUrl();
    const socketUrl = rawBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('crm_session_token') : null;

    try {
      const socket = io(`${socketUrl}/maps`, {
        transports: ['websocket', 'polling'],
        auth: { token },
        query: { subscribe: 'admin-map', role: 'admin' },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setIsSocketConnected(true);
      });

      socket.on('disconnect', () => {
        setIsSocketConnected(false);
      });

      const handleSnapshot = (data: any[]) => {
        if (Array.isArray(data)) {
          const normalized = data.map(normalizeTechnicianLocation).filter(Boolean) as ActiveTechnicianLocation[];
          setTechnicians(normalized);
        }
      };

      const handleUpdate = (updatedRaw: any) => {
        const updatedTech = normalizeTechnicianLocation(updatedRaw);
        if (!updatedTech) return;
        setTechnicians((prev) => {
          const index = prev.findIndex((t) => t.technicianId === updatedTech.technicianId);
          if (index >= 0) {
            const next = [...prev];
            next[index] = updatedTech;
            return next;
          }
          return [...prev, updatedTech];
        });
      };

      const handleStopped = ({ technicianId }: { technicianId: string }) => {
        if (!technicianId) return;
        setTechnicians((prev) => prev.filter((t) => t.technicianId !== technicianId));
        // Remove marker
        const existingMarker = markersRef.current.get(technicianId);
        if (existingMarker) {
          if (typeof existingMarker.setMap === 'function') {
            existingMarker.setMap(null);
          } else if ('map' in existingMarker) {
            existingMarker.map = null;
          }
          markersRef.current.delete(technicianId);
        }
      };

      socket.on('admin:live_technicians_snapshot', handleSnapshot);
      socket.on('technicians:initial', handleSnapshot);

      socket.on('admin:technician_location_update', handleUpdate);
      socket.on('technician:location:update', handleUpdate);

      socket.on('admin:technician_tracking_stopped', handleStopped);
      socket.on('technician:tracking:stopped', handleStopped);

      return () => {
        socket.disconnect();
        socketRef.current = null;
      };
    } catch (e) {
      console.error('[AdminLiveMap] Socket connection error', e);
    }
  }, []);

  // 4. Initialize Google Maps JavaScript API
  useEffect(() => {
    if (!config?.apiKey || !mapContainerRef.current) return;

    let isCancelled = false;

    async function initMap() {
      try {
        setOptions({
          key: config!.apiKey,
          v: 'weekly',
          mapIds: config!.mapId ? [config!.mapId] : undefined,
        });

        const { Map } = (await importLibrary('maps')) as google.maps.MapsLibrary;
        if (isCancelled || !mapContainerRef.current) return;

        // Default center: Pune/Maharashtra regional center
        const defaultCenter = { lat: 18.5204, lng: 73.8567 };

        const mapOptions: google.maps.MapOptions = {
          center: defaultCenter,
          zoom: 12,
          mapId: config!.mapId || undefined,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        };

        const map = new Map(mapContainerRef.current, mapOptions);
        mapInstanceRef.current = map;
      } catch (err: any) {
        console.error('[AdminLiveMap] Failed to load Google Maps script', err);
        setConfigError(
          'Google Maps JavaScript API could not be loaded. Please verify API key configuration and network connectivity.'
        );
      }
    }

    initMap();

    return () => {
      isCancelled = true;
    };
  }, [config]);

  // 5. Synchronize Markers with active technicians
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !(window as any).google?.maps) return;

    const currentTechIds = new Set(technicians.map((t) => t.technicianId));

    // Remove obsolete markers
    markersRef.current.forEach((marker, techId) => {
      if (!currentTechIds.has(techId)) {
        if (typeof marker.setMap === 'function') {
          marker.setMap(null);
        } else if ('map' in marker) {
          marker.map = null;
        }
        markersRef.current.delete(techId);
      }
    });

    const google = (window as any).google;
    const hasAdvancedMarker = Boolean(
      google.maps.marker &&
      google.maps.marker.AdvancedMarkerElement &&
      config?.mapId
    );

    technicians.forEach((tech) => {
      const position = { lat: tech.latitude, lng: tech.longitude };
      let marker = markersRef.current.get(tech.technicianId);

      // Status color mapping
      const statusColor =
        tech.statusFreshness === 'LIVE'
          ? '#10b981' // Green
          : tech.statusFreshness === 'WARNING'
          ? '#f59e0b' // Amber
          : tech.statusFreshness === 'STALE'
          ? '#64748b' // Slate
          : '#94a3b8'; // Muted

      if (hasAdvancedMarker) {
        if (!marker) {
          // Create DOM Pin content
          const pinDiv = document.createElement('div');
          pinDiv.className = 'custom-tech-pin group cursor-pointer transform -translate-x-1/2 -translate-y-full transition-transform hover:scale-110';
          pinDiv.innerHTML = `
            <div style="background-color: ${statusColor};" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-md border-2 border-white">
              <span class="w-2 h-2 rounded-full bg-white ${tech.statusFreshness === 'LIVE' ? 'animate-pulse' : ''}"></span>
              <span>${escapeHtml(tech.technicianName)}</span>
            </div>
            <div class="w-2 h-2 bg-slate-800 rotate-45 mx-auto -mt-1 shadow-xs"></div>
          `;

          pinDiv.addEventListener('click', () => {
            setSelectedTechId(tech.technicianId);
          });

          marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position,
            title: `${tech.technicianName} (${tech.trackingStatus})`,
            content: pinDiv,
          });

          markersRef.current.set(tech.technicianId, marker);
        } else {
          // Update position
          marker.position = position;
          // Update pin content color if needed
          if (marker.content) {
            const innerBadge = marker.content.querySelector('div');
            if (innerBadge) {
              innerBadge.style.backgroundColor = statusColor;
            }
          }
        }
      } else {
        // Fallback to standard google.maps.Marker
        if (!marker) {
          marker = new google.maps.Marker({
            map,
            position,
            title: `${tech.technicianName} (${tech.trackingStatus})`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: statusColor,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });

          marker.addListener('click', () => {
            setSelectedTechId(tech.technicianId);
          });

          markersRef.current.set(tech.technicianId, marker);
        } else {
          marker.setPosition(position);
        }
      }
    });

    // Auto-fit bounds if technicians are present and map is fresh
    if (technicians.length > 0 && mapInstanceRef.current) {
      const bounds = new google.maps.LatLngBounds();
      technicians.forEach((t) => bounds.extend({ lat: t.latitude, lng: t.longitude }));
      // Only fit bounds if multiple technicians or first load
      if (technicians.length > 1) {
        mapInstanceRef.current.fitBounds(bounds, 80);
      }
    }
  }, [technicians, config]);

  // Center map on selected technician
  const handleSelectTech = (tech: ActiveTechnicianLocation) => {
    setSelectedTechId(tech.technicianId);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: tech.latitude, lng: tech.longitude });
      mapInstanceRef.current.setZoom(15);
    }
  };

  const selectedTech = technicians.find((t) => t.technicianId === selectedTechId) || null;

  // Filtered technicians list
  const filteredTechnicians = technicians.filter((tech) => {
    const matchesSearch =
      searchTerm === '' ||
      tech.technicianName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tech.customerName && tech.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (tech.serviceId && tech.serviceId.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      tech.trackingStatus === statusFilter ||
      tech.statusFreshness === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const liveCount = technicians.filter((t) => t.statusFreshness === 'LIVE').length;
  const warningCount = technicians.filter((t) => t.statusFreshness === 'WARNING').length;
  const staleCount = technicians.filter((t) => t.statusFreshness === 'STALE').length;

  return (
    <div className={cn('flex flex-col h-[750px] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs relative', className)}>
      {/* Top Map Operational Control Bar */}
      <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600/30 text-primary-400 flex items-center justify-center border border-primary-500/30">
            <Navigation className="w-4 h-4 text-primary-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Admin Live Technician Map</span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                  isSocketConnected
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950/80 text-amber-400 border-amber-800'
                )}
              >
                <Radio className={cn('w-2.5 h-2.5', isSocketConnected && 'animate-pulse text-emerald-400')} />
                {isSocketConnected ? 'Real-Time Connected' : 'Polling Sync'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Live operational GPS telemetry and destination tracking for field workforce
            </p>
          </div>
        </div>

        {/* Status Metrics Counters */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/80">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-300">Active:</span>
            <span className="font-bold text-white">{technicians.length}</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live:</span>
            <span className="font-bold">{liveCount}</span>
          </div>

          {warningCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/60 border border-amber-800/60 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Aging:</span>
              <span className="font-bold">{warningCount}</span>
            </div>
          )}

          {staleCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/80 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              <span>Stale:</span>
              <span className="font-bold">{staleCount}</span>
            </div>
          )}

          <button
            type="button"
            onClick={fetchLiveTechnicians}
            disabled={isRefreshing}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors ml-1"
            title="Refresh Live Telemetry"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors text-xs font-medium flex items-center gap-1"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{sidebarOpen ? 'Hide List' : 'Show List'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Google Maps Container */}
        <div className="flex-1 h-full w-full relative">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Config Loading State */}
          {configLoading && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-20">
              <div className="bg-white p-5 rounded-xl shadow-xl flex items-center gap-3">
                <RefreshCw className="w-5 h-5 animate-spin text-primary-600" />
                <span className="text-sm font-medium text-slate-700">
                  Initializing Google Maps Platform telemetry...
                </span>
              </div>
            </div>
          )}

          {/* Config Error Banner */}
          {configError && (
            <div className="absolute top-4 left-4 right-4 bg-rose-50 border border-rose-200 p-4 rounded-xl shadow-lg z-20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-rose-900 mb-0.5">Google Maps Initialization Error</h4>
                <p className="text-rose-700">{configError}</p>
              </div>
            </div>
          )}

          {/* Empty State Banner if no active technicians */}
          {!configLoading && !configError && technicians.length === 0 && (
            <div className="absolute top-4 left-4 z-10 bg-white/95 backdrop-blur-xs border border-slate-200/90 p-3.5 rounded-xl shadow-md max-w-sm">
              <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs mb-1">
                <Activity className="w-4 h-4 text-slate-500" />
                <span>No Active Navigating Technicians</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                When a field engineer taps <span className="font-semibold text-slate-700">"Navigate"</span> on an assigned service in the Technician Portal, their live device location and route telemetry will appear on this map.
              </p>
            </div>
          )}

          {/* Selected Technician Detail Card Floating Overlay */}
          {selectedTech && (
            <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-96 z-10 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      selectedTech.statusFreshness === 'LIVE'
                        ? 'bg-emerald-400 animate-pulse'
                        : selectedTech.statusFreshness === 'WARNING'
                        ? 'bg-amber-400'
                        : 'bg-slate-400'
                    )}
                  />
                  <span className="font-bold text-xs truncate max-w-[200px]">
                    {selectedTech.technicianName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full',
                      selectedTech.statusFreshness === 'LIVE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : selectedTech.statusFreshness === 'WARNING'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                    )}
                  >
                    {selectedTech.statusFreshness}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTechId(null)}
                    className="text-slate-400 hover:text-white p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3.5 space-y-3 text-xs">
                {/* Status & Timing */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-slate-500">Tracking Status:</span>
                  <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                    {selectedTech.trackingStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Customer Context / Active Service */}
                {selectedTech.customerName ? (
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                      Destination Customer
                    </span>
                    <p className="font-bold text-slate-900 text-xs">{selectedTech.customerName}</p>
                    {selectedTech.customerAddress && (
                      <p className="text-[11px] text-slate-500 flex items-start gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{selectedTech.customerAddress}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                      Active Service
                    </span>
                    <p className="text-[11px] text-slate-500 italic">No active service</p>
                  </div>
                )}

                {/* Distance & ETA from Routes API (only when navigating to destination) */}
                {selectedTech.customerName && (
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Road Distance</span>
                      <span className="text-xs font-bold text-slate-800">
                        {selectedTech.distanceKm !== undefined ? `${selectedTech.distanceKm} km` : 'Calculating...'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Estimated ETA</span>
                      <span className="text-xs font-bold text-slate-800">
                        {selectedTech.etaMinutes !== undefined ? `~${selectedTech.etaMinutes} mins` : 'Calculating...'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Accuracy & Telemetry Details */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>GPS Accuracy:</span>
                  <span className="font-medium text-slate-700">
                    {selectedTech.accuracy ? `±${Math.round(selectedTech.accuracy)}m` : 'Standard'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Last Update:</span>
                  <span className="font-medium text-slate-700">
                    {selectedTech.secondsAgo < 5
                      ? 'Just now'
                      : `${selectedTech.secondsAgo}s ago`}
                  </span>
                </div>

                {/* Action: View Job Card */}
                {selectedTech.jobCardId && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onViewJobCard) {
                          onViewJobCard(selectedTech.jobCardId!);
                        } else {
                          navigate(`/job-cards/${selectedTech.jobCardId}`);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs shadow-xs transition-colors"
                    >
                      <span>View Job Card</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Technicians List Sidebar */}
        {sidebarOpen && (
          <div className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 z-10">
            {/* Search & Filter */}
            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search technician or customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                {['ALL', 'LIVE', 'WARNING', 'STALE'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      'px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors',
                      statusFilter === st
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredTechnicians.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No active technicians match filter.
                </div>
              ) : (
                filteredTechnicians.map((tech) => {
                  const isSelected = tech.technicianId === selectedTechId;
                  return (
                    <div
                      key={tech.technicianId}
                      onClick={() => handleSelectTech(tech)}
                      className={cn(
                        'p-3 hover:bg-slate-50 cursor-pointer transition-colors text-xs',
                        isSelected && 'bg-primary-50/60 border-l-2 border-primary-600'
                      )}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-bold text-slate-900 truncate">
                          {tech.technicianName}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0',
                            tech.statusFreshness === 'LIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tech.statusFreshness === 'WARNING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {tech.statusFreshness}
                        </span>
                      </div>

                      {tech.customerName ? (
                        <p className="text-[11px] text-slate-600 font-medium truncate mb-1">
                          → {tech.customerName}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic truncate mb-1">
                          No active service
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{tech.trackingStatus.replace(/_/g, ' ')}</span>
                        <span>{tech.secondsAgo < 5 ? 'Just now' : `${tech.secondsAgo}s ago`}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
