"use client";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTime } from "@/lib/TimeContext";
import { useNetwork } from "@/lib/NetworkContext";
import { useAgent } from "@/hooks/useAgent";
import { VENICE_BOUNDS_COORDS, VENICE_CENTER, MAP_CONFIG } from "@/lib/constants";
import { parseLocationFromAction, getLocationCoordinates, parseActionType, getRandomLandmark } from "@/lib/landmarks";
import TimeDisplay from "@/components/TimeDisplay";
import NetworkRenderer from "@/components/NetworkRenderer";
import AgentRenderer from "@/components/AgentRenderer";

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
  
  // Use the new agent hook
  const { agent, overrideDestination } = useAgent(network, currentTime, isRunning, timeSpeed);

  // Handle spontaneous actions from LLM
  const handleSpontaneousAction = (action: string, thought: string) => {
    console.log('🎯 Agent spontaneous action:', { action, thought });
    
    // Parse the action to determine what to do
    const actionType = parseActionType(action);
    
    switch (actionType) {
      case "navigate": {
        // Try to extract location from action
        const locationName = parseLocationFromAction(action);
        
        if (locationName) {
          const coordinates = getLocationCoordinates(locationName);
          if (coordinates) {
            console.log(`🗺️  Navigating to ${locationName}:`, coordinates);
            overrideDestination(coordinates, `Visiting ${locationName}`);
          } else {
            console.warn(`Location "${locationName}" not found`);
          }
        } else {
          // No specific location found, go to a random landmark
          console.log("No specific location in action, choosing random landmark");
          const randomLandmark = getRandomLandmark();
          console.log(`🎲 Navigating to random location: ${randomLandmark.name}`);
          overrideDestination(randomLandmark.coordinates, `Visiting ${randomLandmark.name}`);
        }
        break;
      }
      
      case "rest":
        console.log("😴 Agent wants to rest - staying at current location");
        // For "rest", we could pause movement temporarily
        // For now, this is just logged
        // Future: implement a pause mechanism
        break;
      
      case "socialize":
        console.log("💬 Agent wants to socialize");
        // Future: find nearby agents or social locations -> hard code location of a tavern? find one in data?
        break;
      
      case "wander":
        console.log("🚶 Agent wants to wander");
        // Pick a random nearby location
        const randomLandmark = getRandomLandmark();
        console.log(`🎲 Wandering to: ${randomLandmark.name}`);
        overrideDestination(randomLandmark.coordinates, `Wandering to ${randomLandmark.name}`);
        break;
      
      default:
        console.log("❓ Unknown action type, doing nothing");
    }
  };

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

      <AgentRenderer agent={agent} onSpontaneousAction={handleSpontaneousAction} />
      
    </MapContainer>
  );
}
