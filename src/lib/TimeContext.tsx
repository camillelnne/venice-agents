"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TIME_CONFIG } from './constants';

type TimeContextType = {
  currentTime: Date;
  veniceTime: string; // Formatted time string
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  timeSpeed: number; // How many minutes pass per real second
  setTimeSpeed: (speed: number) => void;
};

const TimeContext = createContext<TimeContextType | undefined>(undefined);

export function TimeProvider({ children }: { children: ReactNode }) {
  // Start at 8:00 AM in 1740 Venice
  const [currentTime, setCurrentTime] = useState(() => {
    const date = new Date(1740, 0, 15, TIME_CONFIG.START_HOUR, TIME_CONFIG.START_MINUTE, 0);
    return date;
  });
  
  const [isRunning, setIsRunning] = useState(true);
  // How many Venice minutes pass per real second.
  const [timeSpeed, setTimeSpeed] = useState<number>(TIME_CONFIG.DEFAULT_SPEED);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = new Date(prev);
        next.setMinutes(prev.getMinutes() + timeSpeed);
        
        // Reset to next day at midnight
        if (next.getHours() === 0 && next.getMinutes() === 0) {
          next.setDate(next.getDate() + 1);
        }
        
        return next;
      });
    }, 1000); // Update every real second

    return () => clearInterval(interval);
  }, [isRunning, timeSpeed]);

  const veniceTime = currentTime.toLocaleTimeString('it-IT', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });

  const getTimeOfDay = (): 'morning' | 'afternoon' | 'evening' | 'night' => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
  };

  return (
    <TimeContext.Provider value={{
      currentTime,
      veniceTime,
      timeOfDay: getTimeOfDay(),
      isRunning,
      setIsRunning,
      timeSpeed,
      setTimeSpeed
    }}>
      {children}
    </TimeContext.Provider>
  );
}

export function useTime() {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error('useTime must be used within TimeProvider');
  }
  return context;
}
