"use client";
import { DomEvent } from "leaflet";
import { useEffect, useState, useRef } from "react";
import { useTime } from "@/lib/TimeContext";
import type { AgentInfo } from "@/types/agent";

type Message = {
  sender: "user" | "agent";
  text: string;
};

type AgentChatboxProps = {
  agentInfo: AgentInfo | null;
  setIsChatboxVisible: (visible: boolean) => void;
};

export default function AgentChatbox({ agentInfo, setIsChatboxVisible }: AgentChatboxProps) {
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
