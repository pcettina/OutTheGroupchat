'use client';

/**
 * @module components/heatmap/HeatmapMap
 * @description V1 Phase 4 — pure map renderer.
 *
 * Renders cells (Crew density) as a circle layer scaled by `count`, and
 * venue markers as a symbol layer that only paints when zoom >= 15 per R22.
 * The wrapping `HeatmapView` owns state (tab, tier, polling) and re-renders
 * on every poll per R25 — this component just reflects whatever data it gets.
 *
 * `maplibre-gl` is browser-only; this component is client-only and the
 * library is imported dynamically inside `useEffect` so the bundle splits
 * correctly for SSR.
 */

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { HeatmapCell, HeatmapVenueMarker } from '@/types/heatmap';

interface HeatmapMapProps {
  cells: HeatmapCell[];
  venueMarkers: HeatmapVenueMarker[];
  /** Initial map center + zoom. Defaults to NYC. */
  initialCenter?: [number, number];
  initialZoom?: number;
}

const VENUE_MARKER_MIN_ZOOM = 15;
const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function HeatmapMap({
  cells,
  venueMarkers,
  initialCenter = [-73.9857, 40.7484],
  initialZoom = 12,
}: HeatmapMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Use unknown to avoid pulling maplibre-gl type defs into the SSR bundle —
  // we only ever touch the instance inside browser-only effects.
  const mapRef = useRef<unknown>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let onZoomEnd: (() => void) | null = null;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: TILE_STYLE,
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: { compact: true },
      });

      mapRef.current = map;

      map.on('load', () => {
        map.addSource('cells', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('venues', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'cells-layer',
          type: 'circle',
          source: 'cells',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'count'],
              1, 12,
              5, 24,
              20, 40,
            ],
            'circle-color': '#FFD400',
            'circle-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'count'],
              1, 0.30,
              5, 0.55,
              20, 0.75,
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#FFD400',
            'circle-stroke-opacity': 0.6,
          },
        });

        map.addLayer({
          id: 'venues-layer',
          type: 'circle',
          source: 'venues',
          minzoom: VENUE_MARKER_MIN_ZOOM,
          paint: {
            'circle-radius': 6,
            'circle-color': '#1B9E8C',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });

        readyRef.current = true;
        renderData(map, cells, venueMarkers);
      });

      onZoomEnd = () => {
        // R22 — venue markers only paint above the threshold zoom. The layer's
        // `minzoom` already handles paint visibility; this hook reserved for
        // future v1.5 dynamic threshold tuning.
      };
      map.on('zoomend', onZoomEnd);
    })();

    return () => {
      cancelled = true;
      const map = mapRef.current;
      if (map && typeof (map as { remove?: () => void }).remove === 'function') {
        try {
          (map as { remove: () => void }).remove();
        } catch {
          // ignore cleanup errors
        }
      }
      mapRef.current = null;
      readyRef.current = false;
    };
    // initialCenter / initialZoom are read once on mount; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    renderData(map, cells, venueMarkers);
  }, [cells, venueMarkers]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[480px] rounded-lg overflow-hidden"
      style={{ background: '#0E1418' }}
      aria-label="Heatmap map"
      role="region"
    />
  );
}

interface MapInstance {
  getSource: (id: string) => {
    setData: (data: unknown) => void;
  } | undefined;
}

function renderData(
  mapUnknown: unknown,
  cells: HeatmapCell[],
  venueMarkers: HeatmapVenueMarker[],
) {
  const map = mapUnknown as MapInstance;
  const cellsSource = map.getSource('cells');
  const venuesSource = map.getSource('venues');

  if (cellsSource) {
    cellsSource.setData({
      type: 'FeatureCollection',
      features: cells.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: { count: c.count, anchorSummary: c.anchorSummary ?? null },
      })),
    });
  }

  if (venuesSource) {
    venuesSource.setData({
      type: 'FeatureCollection',
      features: venueMarkers.map((v) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
        properties: { venueId: v.venueId, count: v.count, name: v.venueName ?? '' },
      })),
    });
  }
}
