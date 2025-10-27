'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import proj4 from 'proj4';
import 'leaflet/dist/leaflet.css';
import type { GeoJsonObject } from 'geojson';

interface VeniceMapProps {
  streetNetworkData: GeoJsonObject;
  landRegisterData: GeoJsonObject;
}

export default function VeniceMap({ streetNetworkData, landRegisterData }: VeniceMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const landRegisterLayerRef = useRef<L.GeoJSON | null>(null);
  const [showOSM, setShowOSM] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Define EPSG:3004 projection (Monte Mario / Italy zone 2)
    proj4.defs('EPSG:3004', '+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=2520000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs');

    // Initialize map
    const map = L.map(mapRef.current, {
      center: [45.4408, 12.3155],
      zoom: 14,
    });

    // Create OpenStreetMap tile layer

    
    const osmLayer = L.tileLayer("https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png",{
            attribution: '&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>',
            className: "grayscale-map",
            maxZoom: 19,
    });
    osmLayerRef.current = osmLayer;

    // Create land register layer (buildings, water, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const landRegisterLayer = L.geoJSON(landRegisterData as any, {
      style: (feature) => {
        const geometryType = feature?.properties?.geometry_type;
        const opacity = 0.7;
        const fillOpacity = 0.2;
        
        switch (geometryType) {
          case 'water':
            return { fillColor: '#6eb5ff', color: '#3b82f6', weight: 1, opacity, fillOpacity };
          case 'building':
            return { fillColor: '#d4d4d4', color: '#737373', weight: 1, opacity, fillOpacity };
          case 'courtyard':
            return { fillColor: '#a3e635', color: '#65a30d', weight: 1, opacity, fillOpacity };
          case 'street':
            return { fillColor: '#fbbf24', color: '#d97706', weight: 1, opacity, fillOpacity };
          default:
            return { fillColor: '#e5e5e5', color: '#a3a3a3', weight: 1, opacity, fillOpacity };
        }
      },
    });
    landRegisterLayerRef.current = landRegisterLayer;

    // Add street network layer (always on top)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streetNetworkLayer = L.geoJSON(streetNetworkData as any, {
      coordsToLatLng: (coords: number[]) => {
        // Transform from EPSG:3004 to WGS84
        const [lng, lat] = proj4('EPSG:3004', 'EPSG:4326', [coords[0], coords[1]]);
        return L.latLng(lat, lng);
      },
      style: {
        color: '#ef4444',
        weight: 2.5,
        opacity: 0.8,
      },
    });

    streetNetworkLayer.addTo(map);

    // Add initial layer based on state
    if (showOSM) {
      osmLayer.addTo(map);
    } else {
      landRegisterLayer.addTo(map);
    }

    // Fit map to street network bounds
    const layerBounds = streetNetworkLayer.getBounds();
    map.fitBounds(layerBounds);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [streetNetworkData, landRegisterData, showOSM]);

  // Handle layer toggle
  useEffect(() => {
    if (!mapInstanceRef.current || !osmLayerRef.current || !landRegisterLayerRef.current) return;

    const map = mapInstanceRef.current;
    const osmLayer = osmLayerRef.current;
    const landRegisterLayer = landRegisterLayerRef.current;

    if (showOSM) {
      if (!map.hasLayer(osmLayer)) {
        landRegisterLayer.remove();
        osmLayer.addTo(map);
      }
    } else {
      if (!map.hasLayer(landRegisterLayer)) {
        osmLayer.remove();
        landRegisterLayer.addTo(map);
      }
    }
  }, [showOSM]);

  return (
    <div className="relative">
      <div 
        ref={mapRef} 
        style={{ height: '600px', width: '100%' }}
        className="rounded-lg shadow-lg"
      />
      
      {/* Toggle Button */}
      <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg">
        <button
          onClick={() => setShowOSM(!showOSM)}
          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          {showOSM ? '📍 Show 1808 Map' : '🗺️ Show Modern Map'}
        </button>
      </div>
    </div>
  );
}
