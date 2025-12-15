"use client";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMemo, useState, useEffect } from "react";
import { useTime } from "@/lib/TimeContext";
import { useNetwork } from "@/lib/NetworkContext";
import { useAgents } from "@/hooks/useAgents";
import { VENICE_BOUNDS_COORDS, VENICE_CENTER, MAP_CONFIG } from "@/lib/constants";
import TimeDisplay from "@/components/TimeDisplay";
import NetworkRenderer from "@/components/NetworkRenderer";
import AgentRenderer from "@/components/AgentRenderer";
import type { AgentInfo } from "@/hooks/useAgents";
import type { Persona } from "@/types/persona";

// --- to see marker icons ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina.src,
  iconUrl: icon.src,
  shadowUrl: iconShadow.src,
});

// Create Leaflet bounds from coordinates (client-side)
const VENICE_BOUNDS = L.latLngBounds(
  [VENICE_BOUNDS_COORDS.south, VENICE_BOUNDS_COORDS.west],
  [VENICE_BOUNDS_COORDS.north, VENICE_BOUNDS_COORDS.east]
);

export default function VeniceMap() {
  const { currentTime, isRunning, timeSpeed } = useTime();
  const { network } = useNetwork();
  const [personas, setPersonas] = useState<Persona[]>([]);
  
  // Read number of agents from environment variable
  const numAgents = useMemo(() => {
    const envNum = process.env.NEXT_PUBLIC_NUM_AGENTS;
    const parsed = envNum ? parseInt(envNum, 10) : 3;
    return isNaN(parsed) || parsed < 1 ? 3 : parsed;
  }, []);

  // Load personas from JSON
  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const response = await fetch("/data/personas.json");
        if (!response.ok) {
          throw new Error(`Failed to load personas: ${response.status}`);
        }
        const data = await response.json();
        //setPersonas(Array.isArray(data) ? data : []);

        // Shuffle the personas array randomly
        const shuffled = Array.isArray(data) 
          ? data.sort(() => Math.random() - 0.5)
          : [];
        
        setPersonas(shuffled);
      } catch (err) {
        console.error("Error loading personas:", err);
        setPersonas([]);
      }
    };
    loadPersonas();
  }, []);

  // Create agent info array from personas
  const agentInfos = useMemo<AgentInfo[]>(() => {
    if (personas.length === 0) return [];
    
    // Take the first N personas for our agents
    return personas.slice(0, numAgents).map((persona, index) => ({
      id: `agent_${index + 1}`,
      persona
    }));
  }, [personas, numAgents]);

  // Use the multi-agent hook
  const { agents } = useAgents(agentInfos, network, currentTime, isRunning, timeSpeed);

  return (
    <MapContainer
      center={VENICE_CENTER}
      zoom={MAP_CONFIG.DEFAULT_ZOOM}
      style={{ height: "100vh", width: "100vw" }}
      preferCanvas                // faster for vectors/markers
      wheelDebounceTime={MAP_CONFIG.WHEEL_DEBOUNCE_TIME}
      wheelPxPerZoomLevel={MAP_CONFIG.WHEEL_PX_PER_ZOOM_LEVEL}
      zoomAnimationThreshold={MAP_CONFIG.ZOOM_ANIMATION_THRESHOLD}
      zoomSnap={MAP_CONFIG.ZOOM_SNAP}
      maxBounds={VENICE_BOUNDS}
      maxBoundsViscosity={MAP_CONFIG.MAX_BOUNDS_VISCOSITY}
      worldCopyJump={false}        // don't jump to wrapped worlds
      minZoom={MAP_CONFIG.MIN_ZOOM}
      maxZoom={MAP_CONFIG.MAX_ZOOM}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
        minZoom={MAP_CONFIG.MIN_ZOOM}
      />
      <TileLayer
        url="https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>'
        maxZoom={MAP_CONFIG.MAX_ZOOM}
        minZoom={MAP_CONFIG.MIN_ZOOM}
        noWrap
        bounds={VENICE_BOUNDS}
      />

      <TimeDisplay />

      <NetworkRenderer />

      <AgentRenderer agents={agents} />
      
    </MapContainer>
  );
}
