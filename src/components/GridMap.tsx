"use client";
import { MapContainer, TileLayer, useMap, useMapEvent } from "react-leaflet";
import L, { LatLngLiteral } from "leaflet";
import { useEffect, useState, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {GridNav, createGridHelpers} from "@/lib/grid";

const VENICE_BOUNDS = L.latLngBounds(
  [45.406, 12.285], // SW
  [45.472, 12.395]  // NE
);



type Node = { x: number; y: number };



function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    fetch(url).then((r) => r.json()).then(setData);
  }, [url]);
  return data;
}

export default function GridMap() {
  const nav = useFetch<GridNav>("/navmesh_grid.json");

  return (
    <MapContainer
        center={[45.438, 12.335]}
        zoom={16}
        style={{ height: "100vh", width: "100vw" }}
        preferCanvas                // faster for vectors/markers
        wheelDebounceTime={50}      // coalesce wheel events
        wheelPxPerZoomLevel={100}   // fewer zoom level changes per wheel tick
        zoomAnimationThreshold={8}  // skip heavy animation at high zooms
        zoomSnap={1}                // no fractional zoom levels (prevents “swimmy” tiles)
        maxBounds={VENICE_BOUNDS}
        maxBoundsViscosity={1.0}     // 0..1; 1 = “hard” elastic boundary
        worldCopyJump={false}        // don’t jump to wrapped worlds
      >

      <TileLayer
        url="https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>'
        maxZoom={19}
        minZoom={15} // tailored to Venice size
        noWrap // stop
        bounds={VENICE_BOUNDS}
      />

      {nav && <AgentOnGrid nav={nav} />}
    </MapContainer>
  );
}

/**
 * Component to place an agent on the grid and navigate from start to goal.
 * Left click to set start, right click to set goal.
 * @param nav Grid navigation mesh
 * @returns Null
 */
function AgentOnGrid({ nav }: { nav: GridNav }) {
  const map = useMap();
  const [start, setStart] = useState<LatLngLiteral | null>(null);
  const [goal, setGoal] = useState<LatLngLiteral | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const agentRef = useRef<L.CircleMarker | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Click handlers ----
  useMapEvent("click", (e) => setStart(e.latlng));

  useMapEvent("contextmenu", (e) => {
    e.originalEvent.preventDefault(); // Prevent context menu
    setGoal(e.latlng);
  });

  useEffect(() => {
    if (!start || !goal) return;

    // Clear previous animation
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
    }

    const fetchPath = async () => {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, goal }),
      });

      if (!response.ok) {
        console.error("Failed to fetch path");
        return;
      }

      const data = await response.json();
      const pathLatLng: LatLngLiteral[] = data.path;

      if (!pathLatLng || pathLatLng.length === 0) return;

      // ---- Draw route ----
      routeRef.current?.remove();
      routeRef.current = L.polyline(pathLatLng, { weight: 4, color: "#00bcd4" }).addTo(map);

      agentRef.current?.remove();
      agentRef.current = L.circleMarker(pathLatLng[0], { radius: 5, color: "red" }).addTo(map);

      // ---- Animate agent ----
      let i = 0;
      const speed = 150; // steps per second
      animationIntervalRef.current = setInterval(() => {
        i = Math.min(i + 1, pathLatLng.length - 1);
        agentRef.current!.setLatLng(pathLatLng[i]);
        if (i >= pathLatLng.length - 1) {
          if (animationIntervalRef.current) {
            clearInterval(animationIntervalRef.current);
          }
        }
      }, 1000 / speed);
    };

    fetchPath();

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
      }
    };
  }, [start, goal, map]);

  return null;
}
