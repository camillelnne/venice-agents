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
      <Chatbox />
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

// --- CHATBOX COMPONENT ---
type Message = {
  sender: "user" | "ai";
  text: string;
};

function Chatbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { sender: "user", text: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: input, history }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response from agent");
      }

      const data = await response.json();
      const aiMessage: Message = { sender: "ai", text: data.answer };
      
      setMessages((prev) => [...prev, aiMessage]);
      setHistory(data.history);

    } catch (error) {
      console.error(error);
      const errorMessage: Message = { sender: "ai", text: "Sorry, I couldn't connect to the agent." };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      width: '350px',
      height: '400px',
      backgroundColor: 'white',
      zIndex: 1000,
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ padding: '10px', borderBottom: '1px solid #eee', fontWeight: 'bold', color:'#333' }}>
        Venice Agent
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{
            marginBottom: '10px',
            textAlign: msg.sender === 'user' ? 'right' : 'left'
          }}>
            <div style={{
              display: 'inline-block',
              padding: '8px 12px',
              borderRadius: '18px',
              backgroundColor: msg.sender === 'user' ? '#007bff' : '#f1f1f1',
              color: msg.sender === 'user' ? 'white' : 'black',
              maxWidth: '80%'
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && <div style={{textAlign: 'left', color: '#888'}}>AI is thinking...</div>}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding: '10px', borderTop: '1px solid #eee' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()}
          placeholder="Ask the agent..."
          disabled={isLoading}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', color:'#333' }}
        />
      </div>
    </div>
  );
}