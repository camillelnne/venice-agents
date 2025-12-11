import { useEffect, useState } from "react";
import type { Poi } from "@/types/poi";

interface UsePoisResult {
  pois: Poi[];
  isLoading: boolean;
  error: string | null;
}

export function usePois(): UsePoisResult {
  const [pois, setPois] = useState<Poi[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPois = async () => {
      try {
        const response = await fetch("/data/pois.json");
        if (!response.ok) {
          throw new Error(`Failed to load POIs: ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          const normalized = data.map((poi: Poi) => ({
            id: String(poi.id),
            lat: Number(poi.lat),
            lng: Number(poi.lng),
            type: String(poi.type || "").toUpperCase(),
            label: String(poi.label || "").trim(),
          }));
          setPois(normalized);
        } else {
          throw new Error("Unexpected POI response shape");
        }
      } catch (err) {
        console.error("Error loading POIs:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPois();
  }, []);

  return { pois, isLoading, error };
}
