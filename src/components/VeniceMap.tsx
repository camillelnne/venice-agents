"use client";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { useTime } from "@/lib/TimeContext";
import { VENICE_BOUNDS_COORDS, VENICE_CENTER, MAP_CONFIG } from "@/lib/constants";
import TimeDisplay from "./TimeDisplay";
import NetworkRenderer from "./NetworkRenderer";
import AutonomousAgent from "./AutonomousAgent";
import AgentChatbox from "./AgentChatbox";
import { useAgentMovement } from "@/hooks/useAgentMovement";

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
  const [isChatboxVisible, setIsChatboxVisible] = useState(true);
  const { isRunning } = useTime();

  const { agentPath, agentInfo, handleAgentArrival } = useAgentMovement(isRunning);

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
        url="https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>'
        maxZoom={MAP_CONFIG.MAX_ZOOM}
        minZoom={MAP_CONFIG.MIN_ZOOM}
        noWrap
        bounds={VENICE_BOUNDS}
      />

      <TimeDisplay />

      <NetworkRenderer />

      <AutonomousAgent path={agentPath} agentInfo={agentInfo} onArrival={handleAgentArrival} />
      
      {isChatboxVisible && <AgentChatbox agentInfo={agentInfo} setIsChatboxVisible={setIsChatboxVisible} />}
    </MapContainer>
  );
}
