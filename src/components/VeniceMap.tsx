"use client";
import { MapContainer, TileLayer, useMap, useMapEvent } from "react-leaflet";
import L, { LatLngLiteral, DomEvent } from "leaflet";
import { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";

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

  const [start, setStart] = useState<LatLngLiteral | null>(null);
  const [path, setPath] = useState<LatLngLiteral[] | null>(null);
  const [isChatboxVisible, setIsChatboxVisible] = useState(false);

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

      <AgentOnGrid start={start} setStart={setStart} path={path} setIsChatboxVisible={setIsChatboxVisible} />
      
      
      {isChatboxVisible && <Chatbox start={start} setPath={setPath} setStart={setStart} setIsChatboxVisible={setIsChatboxVisible} />}
    </MapContainer>
  );
}
/**
 * Handles map interactions, such as path and agent drawing.
 */
function AgentOnGrid({ start, setStart, path, setIsChatboxVisible }: { 
  start: LatLngLiteral | null, 
  setStart: (ll: LatLngLiteral | null) => void, 
  path: LatLngLiteral[] | null,
  setIsChatboxVisible: (visible: boolean) => void
}) {
  const map = useMap();
  const routeRef = useRef<L.Polyline | null>(null);
  const agentRef = useRef<L.CircleMarker | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // On click, set start point and show the chatbox
  useMapEvent("click", (e) => {
    setStart(e.latlng);
    setIsChatboxVisible(true);
  });

  // Effect to show/update the start marker
  useEffect(() => {
    startMarkerRef.current?.remove();
    if (start) {
      startMarkerRef.current = L.marker(start).addTo(map)
        .bindPopup('Start Point').openPopup();
    }
  }, [start, map]);

  // Effect for drawing and animating the path
  useEffect(() => {
    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);

    if (!path || path.length === 0) {
      routeRef.current?.remove();
      agentRef.current?.remove();
      return;
    }
    
    startMarkerRef.current?.closePopup(); // Close popup when path is drawn

    routeRef.current?.remove();
    routeRef.current = L.polyline(path, { weight: 4, color: "#00bcd4" }).addTo(map);

    agentRef.current?.remove();
    agentRef.current = L.circleMarker(path[0], { radius: 5, color: "red" }).addTo(map);

    let i = 0;
    const speed = 150;
    animationIntervalRef.current = setInterval(() => {
      i = Math.min(i + 1, path.length - 1);
      agentRef.current!.setLatLng(path[i]);
      if (i >= path.length - 1) {
        if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
      }
    }, 1000 / speed);

    return () => {
      if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    };
  }, [path, map]);

  return null;
}

// --- CHATBOX COMPONENT ---
type Message = { sender: "user" | "ai"; text: string };

function Chatbox({ start, setPath, setStart, setIsChatboxVisible }: { 
  start: LatLngLiteral | null, 
  setPath: (path: LatLngLiteral[] | null) => void,
  setStart: (start: LatLngLiteral | null) => void,
  setIsChatboxVisible: (visible: boolean) => void
}) {
  const [messages, setMessages] = useState<Message[]>([]);
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

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return; // Prevents user from sending empty message
    if (!start) {
      setMessages(prev => [...prev, { sender: 'ai', text: "Please click on the map to set a starting point first." }]);
      return;
    }

    const userMessage: Message = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    const goalDescription = input;
    setInput("");
    setIsLoading(true);
    setPath(null); // Clear previous path

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, goalDescription }),
      });

      const data = await response.json();
      console.log("API response:", data);
      if (!response.ok) {
        const aiMessage: Message = { sender: "ai", text: "Sorry there is no possible path from your starting point to the destination." };
        setMessages((prev) => [...prev, aiMessage]);
        return;
        //throw new Error(data.error || "Failed to get a response.");
      }

      // The response should contain the final path
      if (data.path) {
        setPath(data.path);
        const aiMessage: Message = { sender: "ai", text: "Okay, I've found a path for you." };
        setMessages((prev) => [...prev, aiMessage]);
      } else {
        throw new Error("Received an unexpected response from the server.");
      }

    } catch (error: unknown) {
      console.error(error);
      const errorMessage: Message = { sender: "ai", text: (error as Error).message || "Sorry, something went wrong." };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  const handleClose = () => {
    setIsChatboxVisible(false);
    setStart(null);
    setPath(null);
  };

  return (
    <div ref={chatboxRef} style={{ position: 'absolute', bottom: '20px', right: '20px', width: '350px', height: '400px', backgroundColor: 'white', zIndex: 1000, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <style>{`.chat-input::placeholder { color: #999; }`}</style>
      
      {/* Header with Title and Close Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #eee' }}>
        <span style={{ fontWeight: 'bold', color: '#333' }}>Venice Agent</span>
        <button onClick={handleClose} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>
          &times;
        </button>
      </div>
      
      {/* Message Display Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ marginBottom: '10px', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
            <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: '18px', backgroundColor: msg.sender === 'user' ? '#007bff' : '#f1f1f1', color: msg.sender === 'user' ? 'white' : 'black', maxWidth: '80%' }}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && <div style={{ textAlign: 'left', color: '#888' }}>AI is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div style={{ padding: '10px', borderTop: '1px solid #eee' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
          placeholder="Go to Rialto Bridge..."
          disabled={isLoading}
          className="chat-input"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', color: '#333' }}
        />
      </div>
    </div>
  );
}