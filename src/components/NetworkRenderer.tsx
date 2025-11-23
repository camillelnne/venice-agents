"use client";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { useNetwork } from "@/lib/NetworkContext";
import { NETWORK_CONFIG } from "@/lib/constants";

/**
 * Renders the entire street network on the map
 */
export default function NetworkRenderer() {
  const map = useMap();
  const networkLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const { network } = useNetwork();

  // Render the network on the map
  useEffect(() => {
    if (!network) return;

    // Create a layer group if it doesn't exist
    if (!networkLayerGroupRef.current) {
      networkLayerGroupRef.current = L.layerGroup().addTo(map);
    }

    // Clear existing layers
    networkLayerGroupRef.current.clearLayers();

    // Render all edges as polylines
    network.edges.forEach((edge) => {
      const latLngs = edge.coords.map(([lng, lat]) => L.latLng(lat, lng));
      const polyline = L.polyline(latLngs, {
        color: NETWORK_CONFIG.EDGE_COLOR,
        weight: NETWORK_CONFIG.EDGE_WEIGHT,
        opacity: NETWORK_CONFIG.EDGE_OPACITY
      });
      networkLayerGroupRef.current?.addLayer(polyline);
    });

    console.log(`Rendered ${network.edges.length} network edges`);

    return () => {
      networkLayerGroupRef.current?.clearLayers();
    };
  }, [network, map]);

  return null;
}
