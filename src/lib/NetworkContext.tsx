"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { buildNetworkFromGeoJSON, type StreetNetwork } from "./network";

interface NetworkContextType {
  network: StreetNetwork | null;
  isLoading: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<StreetNetwork | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadNetwork = async () => {
      try {
        const response = await fetch("/data/1808_street_traghetto_route.geojson");
        const geoJSONData = await response.json();

        const builtNetwork = buildNetworkFromGeoJSON(geoJSONData);
        setNetwork(builtNetwork);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load network:", error);
        setIsLoading(false);
      }
    };

    loadNetwork();
  }, []);

  return (
    <NetworkContext.Provider value={{ network, isLoading }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
}
