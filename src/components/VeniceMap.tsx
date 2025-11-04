"use client";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { useTime } from "@/lib/TimeContext";
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

const VENICE_BOUNDS = L.latLngBounds(
  [45.406, 12.285], // SW
  [45.472, 12.395]  // NE
);

export default function VeniceMap() {
  const [isChatboxVisible, setIsChatboxVisible] = useState(true);
  const { isRunning } = useTime();

  const { agentPath, agentInfo, handleAgentArrival } = useAgentMovement(isRunning);

  return (
    <MapContainer
      center={[45.438, 12.335]}
      zoom={16}
      style={{ height: "100vh", width: "100vw" }}
      preferCanvas                // faster for vectors/markers
      wheelDebounceTime={50}      // coalesce wheel events
      wheelPxPerZoomLevel={100}   // fewer zoom level changes per wheel tick
      zoomAnimationThreshold={8}  // skip heavy animation at high zooms
      zoomSnap={1}                // no fractional zoom levels (prevents "swimmy" tiles)
      maxBounds={VENICE_BOUNDS}
      maxBoundsViscosity={1.0}     // 0..1; 1 = "hard" elastic boundary
      worldCopyJump={false}        // don't jump to wrapped worlds
    >
      <TileLayer
        url="https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>'
        maxZoom={19}
        minZoom={15} // tailored to Venice size
        noWrap // stop
        bounds={VENICE_BOUNDS}
      />

      <TimeDisplay />

      <NetworkRenderer />

      <AutonomousAgent path={agentPath} agentInfo={agentInfo} onArrival={handleAgentArrival} />
      
      {isChatboxVisible && <AgentChatbox agentInfo={agentInfo} setIsChatboxVisible={setIsChatboxVisible} />}
    </MapContainer>
  );
}
