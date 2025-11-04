"use client";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useRef } from "react";
import { buildNetworkFromGeoJSON, type StreetNetwork } from "@/lib/network";

/**
 * Renders the entire street network on the map
 */
export default function NetworkRenderer() {
  const map = useMap();
  const networkLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [network, setNetwork] = useState<StreetNetwork | null>(null);

  // Load and build the network from GeoJSON files
  useEffect(() => {
    const loadNetwork = async () => {
      try {
        // Load both street and traghetto route files
        const [streetsRes, traghettoRes] = await Promise.all([
          fetch("/1808_street_cleaned.geojson"),
          fetch("/1808_street_traghetto_route.geojson")
        ]);

        const [streetsData, traghettoData] = await Promise.all([
          streetsRes.json(),
          traghettoRes.json()
        ]);

        // Combine features from both files
        const combinedGeoJSON = {
          type: "FeatureCollection" as const,
          features: [...streetsData.features, ...traghettoData.features]
        };

        const builtNetwork = buildNetworkFromGeoJSON(combinedGeoJSON);
        setNetwork(builtNetwork);
      } catch (error) {
        console.error("Failed to load network:", error);
      }
    };

    loadNetwork();
  }, []);

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
        color: "#666666",
        weight: 2,
        opacity: 0.4
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
