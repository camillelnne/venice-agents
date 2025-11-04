"use client";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L, { LatLngLiteral, DomEvent } from "leaflet";
import { useEffect, useState, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { useTime } from "@/lib/TimeContext";
import TimeDisplay from "./TimeDisplay";
import { buildNetworkFromGeoJSON, type StreetNetwork } from "@/lib/network";

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

  const [agentPath, setAgentPath] = useState<LatLngLiteral[] | null>(null);
  const [agentDestination, setAgentDestination] = useState<{lat: number, lng: number} | null>(null);
  const [isChatboxVisible, setIsChatboxVisible] = useState(true);
  const [agentInfo, setAgentInfo] = useState<{name: string, role: string, activity: string} | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { isRunning } = useTime();

  // Fetch agent info on mount and when refreshTrigger changes
  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/agent/state");
        if (response.ok) {
          const data = await response.json();
          setAgentInfo({
            name: data.name,
            role: data.role,
            activity: data.current_activity
          });
        }
      } catch (error) {
        console.error("Failed to fetch agent info:", error);
      }
    };
    
    fetchAgentInfo();
  }, [refreshTrigger]);

  // Use ref to track if movement is in progress to avoid loops
  const isMovingRef = useRef(false);
  const nextMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const moveAgent = useCallback(async () => {
    if (isMovingRef.current || !isRunning) return; // Don't move if already moving or paused
    
    isMovingRef.current = true;
    try {
      const response = await fetch("/api/agent/autonomous");
      if (response.ok) {
        const data = await response.json();
        setAgentPath(data.path);
        setAgentDestination(data.destination);
        console.log("Agent movement:", data.reason);
      } else {
        isMovingRef.current = false;
      }
    } catch (error) {
      console.error("Failed to move agent:", error);
      isMovingRef.current = false;
    }
  }, [isRunning]);

  // Callback when agent animation completes
  const handleAgentArrival = useCallback(async () => {
    if (!agentDestination) return;
    
    try {
      // Update backend location
      await fetch("http://127.0.0.1:8000/agent/update-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          lat: agentDestination.lat, 
          lng: agentDestination.lng 
        }),
      });
      
      // Refresh agent info to show updated activity
      setRefreshTrigger(prev => prev + 1);
      
      // Schedule next movement after a cooldown (60 seconds) - only if time is running
      isMovingRef.current = false;
      if (isRunning) {
        nextMoveTimeoutRef.current = setTimeout(() => {
          moveAgent();
        }, 60000); // 60 seconds cooldown between movements
      }
    } catch (error) {
      console.error("Failed to update agent location:", error);
      isMovingRef.current = false;
    }
  }, [agentDestination, isRunning, moveAgent]);

  // Initial movement on mount only
  useEffect(() => {
    moveAgent();
    
    return () => {
      // Cleanup: cancel pending movements and reset state
      if (nextMoveTimeoutRef.current) {
        clearTimeout(nextMoveTimeoutRef.current);
      }
      isMovingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

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

      <TimeDisplay />

      <NetworkRenderer />

      <AutonomousAgent path={agentPath} agentInfo={agentInfo} onArrival={handleAgentArrival} />
      
      {isChatboxVisible && <AgentChatbox agentInfo={agentInfo} setIsChatboxVisible={setIsChatboxVisible} />}
    </MapContainer>
  );
}

/**
 * Renders the entire street network on the map
 */
function NetworkRenderer() {
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

/**
 * Renders and animates an autonomous agent moving through Venice
 */
function AutonomousAgent({ path, agentInfo, onArrival }: { 
  path: LatLngLiteral[] | null,
  agentInfo: {name: string, role: string, activity: string} | null,
  onArrival?: () => void
}) {
  const map = useMap();
  const routeRef = useRef<L.Polyline | null>(null);
  const agentRef = useRef<L.CircleMarker | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { timeSpeed, isRunning } = useTime();
  const currentIndexRef = useRef(0);

  // Effect for drawing and animating the path
  useEffect(() => {
    if (!path || path.length === 0) {
      routeRef.current?.remove();
      agentRef.current?.remove();
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
      return;
    }

    // Draw route if not already drawn
    if (!routeRef.current) {
      routeRef.current = L.polyline(path, { weight: 4, color: "#00bcd4" }).addTo(map);
    }

    // Create agent marker if not exists
    if (!agentRef.current) {
      agentRef.current = L.circleMarker(path[0], { 
        radius: 8, 
        color: "#ff4444",
        fillColor: "#ff4444",
        fillOpacity: 0.8
      }).addTo(map);

      // Add popup with agent info
      if (agentInfo) {
        agentRef.current.bindPopup(`
          <strong>${agentInfo.name}</strong><br/>
          <em>${agentInfo.role}</em><br/>
          ${agentInfo.activity}
        `).openPopup();
      }
      currentIndexRef.current = 0;
    }

    // Clear existing interval
    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);

    // Only animate if time is running
    if (!isRunning) return;

    // Base speed (points per second) when timeSpeed === 60 (legacy behavior)
    const baseSpeed = 100;
    const scaledSpeed = baseSpeed * (timeSpeed / 60);
    const intervalMs = Math.max(16, 1000 / Math.max(0.01, scaledSpeed));

    animationIntervalRef.current = setInterval(() => {
      if (!agentRef.current || !path) return;
      
      currentIndexRef.current = Math.min(currentIndexRef.current + 1, path.length - 1);
      agentRef.current.setLatLng(path[currentIndexRef.current]);

      // Pan map to follow agent
      map.panTo(path[currentIndexRef.current], { animate: true, duration: 0.5 });

      // Check if reached destination
      if (currentIndexRef.current >= path.length - 1) {
        if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
        // Call onArrival callback when animation completes
        if (onArrival) {
          onArrival();
        }
      }
    }, intervalMs);

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    };
  }, [path, map, agentInfo, timeSpeed, onArrival, isRunning]);

  // Clear everything when path changes
  useEffect(() => {
    return () => {
      routeRef.current?.remove();
      routeRef.current = null;
      agentRef.current?.remove();
      agentRef.current = null;
      currentIndexRef.current = 0;
    };
  }, [path]);

  return null;
}

// --- AGENT CHATBOX COMPONENT ---
type Message = { sender: "user" | "agent"; text: string };

function AgentChatbox({ agentInfo, setIsChatboxVisible }: { 
  agentInfo: {name: string, role: string, activity: string} | null,
  setIsChatboxVisible: (visible: boolean) => void
}) {
  const { veniceTime, timeOfDay } = useTime();
  const [messages, setMessages] = useState<Message[]>([
    { 
      sender: "agent", 
      text: agentInfo 
        ? `Buongiorno! I am ${agentInfo.name}, a ${agentInfo.role} in Venice. How may I assist you today?` 
        : "Buongiorno! Welcome to Venice in 1808." 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatboxRef = useRef<HTMLDivElement | null>(null);

  // Stop click events from propagating to the map
  useEffect(() => {
    if (chatboxRef.current) {
      DomEvent.disableClickPropagation(chatboxRef.current);
    }
  }, []);

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) 
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: input,
          current_time: veniceTime,
          time_of_day: timeOfDay
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage: Message = { 
          sender: "agent", 
          text: data.error || "Mi scusi, I could not understand that." 
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      const agentMessage: Message = { 
        sender: "agent", 
        text: data.response 
      };
      setMessages((prev) => [...prev, agentMessage]);

    } catch (error: unknown) {
      console.error(error);
      const errorMessage: Message = { 
        sender: "agent", 
        text: "Mi scusi, something went wrong. Please try again." 
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsChatboxVisible(false);
  };

  return (
    <div ref={chatboxRef} style={{ 
      position: 'absolute', 
      top: '20px', 
      right: '20px', 
      width: '400px', 
      height: '500px', 
      backgroundColor: 'white', 
      zIndex: 1000, 
      borderRadius: '12px', 
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)', 
      display: 'flex', 
      flexDirection: 'column', 
      fontFamily: 'sans-serif',
      border: '2px solid #8b4513'
    }}>
      <style>{`
        .chat-input::placeholder { color: #999; }
        .agent-header { 
          background: linear-gradient(135deg, #8b4513 0%, #a0522d 100%);
        }
      `}</style>
      
      {/* Header with Agent Info */}
      <div className="agent-header" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '15px', 
        borderRadius: '10px 10px 0 0',
        color: 'white'
      }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            {agentInfo?.name || "Venice Agent"}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            {agentInfo?.role || "Citizen of Venice"} • 1808
          </div>
        </div>
        <button onClick={handleClose} style={{ 
          border: 'none', 
          background: 'none', 
          fontSize: '24px', 
          cursor: 'pointer', 
          color: 'white',
          fontWeight: 'bold'
        }}>
          ×
        </button>
      </div>
      
      {/* Message Display Area */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '15px',
        backgroundColor: '#fef9f3'
      }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ 
            marginBottom: '12px', 
            textAlign: msg.sender === 'user' ? 'right' : 'left' 
          }}>
            <div style={{ 
              display: 'inline-block', 
              padding: '10px 14px', 
              borderRadius: '16px', 
              backgroundColor: msg.sender === 'user' ? '#8b4513' : '#e8dcc4', 
              color: msg.sender === 'user' ? 'white' : '#333', 
              maxWidth: '80%',
              textAlign: 'left',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              lineHeight: '1.4'
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ textAlign: 'left', color: '#888', fontStyle: 'italic' }}>
            {agentInfo?.name || "Agent"} is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div style={{ 
        padding: '15px', 
        borderTop: '1px solid #ddd',
        backgroundColor: 'white',
        borderRadius: '0 0 10px 10px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask me about Venice..."
            disabled={isLoading}
            className="chat-input"
            style={{ 
              flex: 1,
              padding: '10px', 
              borderRadius: '8px', 
              border: '1px solid #ccc', 
              color: '#333',
              fontSize: '14px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#8b4513',
              color: 'white',
              cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: isLoading || !input.trim() ? 0.5 : 1,
              fontWeight: 'bold'
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}