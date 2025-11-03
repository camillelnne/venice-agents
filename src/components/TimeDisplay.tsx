"use client";
import { useTime } from '@/lib/TimeContext';

export default function TimeDisplay() {
  const { veniceTime, timeOfDay, currentTime, isRunning, setIsRunning, timeSpeed, setTimeSpeed } = useTime();

  const getTimeOfDayIcon = () => {
    switch (timeOfDay) {
      case 'morning': return '🌅';
      case 'afternoon': return '☀️';
      case 'evening': return '🌆';
      case 'night': return '🌙';
    }
  };

  const getTimeOfDayLabel = () => {
    switch (timeOfDay) {
      case 'morning': return 'Morning';
      case 'afternoon': return 'Afternoon';
      case 'evening': return 'Evening';
      case 'night': return 'Night';
    }
  };

  const dateStr = currentTime.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      padding: '15px 20px',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: 1000,
      fontFamily: 'sans-serif',
      border: '2px solid #8b4513',
      minWidth: '200px'
    }}>
      <div style={{ 
        fontSize: '11px', 
        color: '#666', 
        marginBottom: '5px',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        Venice Time
      </div>
      <div style={{ 
        fontSize: '32px', 
        fontWeight: 'bold', 
        color: '#8b4513',
        fontFamily: 'monospace',
        marginBottom: '5px'
      }}>
        {veniceTime}
      </div>
      <div style={{ 
        fontSize: '13px', 
        color: '#555',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px'
      }}>
        <span>{getTimeOfDayIcon()}</span>
        <span>{getTimeOfDayLabel()}</span>
      </div>
      <div style={{ 
        fontSize: '12px', 
        color: '#777',
        borderTop: '1px solid #ddd',
        paddingTop: '8px'
      }}>
        {dateStr}
      </div>
      <button
        onClick={() => setIsRunning(!isRunning)}
        style={{
          marginTop: '10px',
          width: '100%',
          padding: '8px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: isRunning ? '#d4a373' : '#8b4513',
          color: 'white',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'background-color 0.2s'
        }}
      >
        {isRunning ? '⏸ Pause' : '▶ Resume'}
      </button>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          onClick={() => setTimeSpeed(10)}
          aria-pressed={timeSpeed === 10}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '6px',
            border: timeSpeed === 10 ? '2px solid #8b4513' : '1px solid #ddd',
            backgroundColor: timeSpeed === 10 ? '#f3e6d8' : '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Slow
        </button>
        <button
          onClick={() => setTimeSpeed(60)}
          aria-pressed={timeSpeed === 60}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '6px',
            border: timeSpeed === 60 ? '2px solid #8b4513' : '1px solid #ddd',
            backgroundColor: timeSpeed === 60 ? '#f3e6d8' : '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Normal
        </button>
        <button
          onClick={() => setTimeSpeed(240)}
          aria-pressed={timeSpeed === 240}
          style={{
            flex: 1,
            padding: '8px',
            borderRadius: '6px',
            border: timeSpeed === 240 ? '2px solid #8b4513' : '1px solid #ddd',
            backgroundColor: timeSpeed === 240 ? '#f3e6d8' : '#fff',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Fast
        </button>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
        Speed: {timeSpeed} min/sec
      </div>
    </div>
  );
}
