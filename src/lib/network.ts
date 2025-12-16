import { LatLngLiteral } from "leaflet";
import type { Poi } from "@/types/poi";

// --- Types ---
export type NetworkNode = {
  id: string;
  lat: number;
  lng: number;
};

export type NetworkEdge = {
  from: string;
  to: string;
  coords: [number, number][]; // Full line coordinates for smooth rendering
};

export type StreetNetwork = {
  nodes: Map<string, NetworkNode>;
  edges: NetworkEdge[];
  adjacency: Map<string, string[]>; // nodeId -> list of connected nodeIds
};

// --- GeoJSON Types ---
type LineStringFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lng, lat] pairs
  };
};

type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: LineStringFeature[];
};

// --- Helper Functions ---

/**
 * Create a unique key for a coordinate pair (for deduplication)
 */
function coordKey(lng: number, lat: number, precision = 7): string {
  return `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
}

/**
 * Calculate Haversine distance between two lat/lng points in meters
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Build a street network graph from a GeoJSON FeatureCollection of LineStrings
 */
export function buildNetworkFromGeoJSON(
  geojson: GeoJSONFeatureCollection
): StreetNetwork {
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const adjacency = new Map<string, string[]>();

  // Process each LineString feature
  for (const feature of geojson.features) {
    if (feature.geometry.type !== "LineString") continue;

    const coords = feature.geometry.coordinates; // [lng, lat][]
    if (coords.length < 2) continue;
    // Create nodes for each coordinate along the LineString and
    // connect consecutive coordinates with edges. This lets water
    // (traghetto) lines and street lines join the graph where they
    // share coordinates.
    let prevKey: string | null = null;
    for (let idx = 0; idx < coords.length; idx++) {
      const [lng, lat] = coords[idx];
      const key = coordKey(lng, lat);

      if (!nodes.has(key)) {
        nodes.set(key, { id: key, lat, lng });
      }

      if (prevKey) {
        // Add edge between prevKey and key
        edges.push({ from: prevKey, to: key, coords: [coords[idx - 1], coords[idx]] });

        if (!adjacency.has(prevKey)) adjacency.set(prevKey, []);
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(prevKey)!.push(key);
        adjacency.get(key)!.push(prevKey);
      }

      prevKey = key;
    }
  }

  return { nodes, edges, adjacency };
}

/**
 * Find the nearest node in the network to a given lat/lng point
 */
export function findNearestNode(
  network: StreetNetwork,
  lat: number,
  lng: number
): NetworkNode | null {
  let nearest: NetworkNode | null = null;
  let minDist = Infinity;

  for (const node of network.nodes.values()) {
    const dist = haversineDistance(lat, lng, node.lat, node.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }

  return nearest;
}

/**
 * Find path using BFS on the network graph
 */
export function findPathBFS(
  network: StreetNetwork,
  startNodeId: string,
  goalNodeId: string
): string[] | null {
  if (startNodeId === goalNodeId) return [startNodeId];

  const came = new Map<string, string>();
  const queue = [startNodeId];
  const seen = new Set<string>([startNodeId]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === goalNodeId) break;

    const neighbors = network.adjacency.get(cur) || [];
    for (const nbId of neighbors) {
      if (!seen.has(nbId)) {
        seen.add(nbId);
        came.set(nbId, cur);
        queue.push(nbId);
      }
    }
  }

  if (!came.has(goalNodeId)) return null;

  // Reconstruct path
  const path = [goalNodeId];
  let current = goalNodeId;
  while (current !== startNodeId) {
    current = came.get(current)!;
    path.unshift(current);
  }

  return path;
}

/**
 * Convert a path of node IDs to a smooth path of lat/lng coordinates
 * Includes intermediate points from edges for smooth rendering
 */
export function pathToCoordinates(
  network: StreetNetwork,
  nodePath: string[]
): LatLngLiteral[] {
  if (nodePath.length === 0) return [];
  if (nodePath.length === 1) {
    const node = network.nodes.get(nodePath[0]);
    return node ? [{ lat: node.lat, lng: node.lng }] : [];
  }

  const result: LatLngLiteral[] = [];

  for (let i = 0; i < nodePath.length - 1; i++) {
    const fromId = nodePath[i];
    const toId = nodePath[i + 1];

    // Find the edge connecting these nodes
    const edge = network.edges.find(
      (e) =>
        (e.from === fromId && e.to === toId) ||
        (e.from === toId && e.to === fromId)
    );

    if (edge) {
      // Determine direction
      const coords =
        edge.from === fromId ? edge.coords : [...edge.coords].reverse();

      // Add all coordinates from this edge (except the last one to avoid duplicates)
      for (let j = 0; j < coords.length - 1; j++) {
        const [lng, lat] = coords[j];
        result.push({ lat, lng });
      }
    } else {
      // If no edge found, just add the from node
      const fromNode = network.nodes.get(fromId);
      if (fromNode) {
        result.push({ lat: fromNode.lat, lng: fromNode.lng });
      }
    }
  }

  // Add the final node
  const lastNode = network.nodes.get(nodePath[nodePath.length - 1]);
  if (lastNode) {
    result.push({ lat: lastNode.lat, lng: lastNode.lng });
  }

  return result;
}

/**
 * High-level pathfinding function: finds path between two lat/lng points
 */
export function findPath(
  network: StreetNetwork,
  start: LatLngLiteral,
  goal: LatLngLiteral
): LatLngLiteral[] | null {
  const startNode = findNearestNode(network, start.lat, start.lng);
  const goalNode = findNearestNode(network, goal.lat, goal.lng);

  if (!startNode || !goalNode) return null;

  const nodePath = findPathBFS(network, startNode.id, goalNode.id);
  if (!nodePath) return null;

  return pathToCoordinates(network, nodePath);
}

// --- POI utilities ---

const WALKING_SPEED_M_PER_S = 1.4; // average walking speed

function getReachableNodeDistances(
  network: StreetNetwork,
  startNodeId: string,
  maxDistanceMinutes: number
): Map<string, number> {
  if (!network.nodes.has(startNodeId)) return new Map();

  const maxDistanceMeters = maxDistanceMinutes * 60 * WALKING_SPEED_M_PER_S;

  const distances = new Map<string, number>();
  distances.set(startNodeId, 0);

  const visited = new Set<string>();

  // Simple dijkstra with array priority queue (graph size is modest)
  const queue: { id: string; dist: number }[] = [{ id: startNodeId, dist: 0 }];

  while (queue.length > 0) {
    // extract min
    queue.sort((a, b) => a.dist - b.dist);
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const neighbors = network.adjacency.get(current.id) || [];
    const currentNode = network.nodes.get(current.id);
    if (!currentNode) continue;

    for (const nbId of neighbors) {
      const neighborNode = network.nodes.get(nbId);
      if (!neighborNode) continue;

      const edgeMeters = haversineDistance(
        currentNode.lat,
        currentNode.lng,
        neighborNode.lat,
        neighborNode.lng
      );
      const newDist = current.dist + edgeMeters;

      if (newDist > maxDistanceMeters) continue;

      const prev = distances.get(nbId);
      if (prev === undefined || newDist < prev) {
        distances.set(nbId, newDist);
        queue.push({ id: nbId, dist: newDist });
      }
    }
  }

  return distances;
}

export function getNearbyPoisWithDistance(
  network: StreetNetwork,
  pois: Poi[],
  currentNodeId: string,
  maxDistanceMinutes: number
): { poi: Poi; reachableMinutes: number; offsetMeters: number }[] {
  const reachable = getReachableNodeDistances(
    network,
    currentNodeId,
    maxDistanceMinutes
  );
  if (reachable.size === 0) return [];

  const MIN_DISTANCE_METERS = 200; // Minimum distance to show visible movement
  const nearestCache = new Map<string, { nodeId: string; offsetMeters: number }>();

  const filtered = pois
    .map((poi) => {
      const cached = nearestCache.get(poi.id);
      let nearest = cached;
      if (!nearest) {
        const found = findNearestNode(network, poi.lat, poi.lng);
        if (!found) return null;
        const offset = haversineDistance(poi.lat, poi.lng, found.lat, found.lng);
        nearest = { nodeId: found.id, offsetMeters: offset };
        nearestCache.set(poi.id, nearest);
      }
      if (!nearest) return null;
      const reachableDist = reachable.get(nearest.nodeId);
      if (reachableDist === undefined) return null;
      
      // Filter out POIs that are too close
      const totalDistance = reachableDist + nearest.offsetMeters;
      if (totalDistance < MIN_DISTANCE_METERS) return null;
      
      return {
        poi,
        reachableMinutes: reachableDist / (WALKING_SPEED_M_PER_S * 60),
        offsetMeters: nearest.offsetMeters,
      };
    })
    .filter(
      (item): item is { poi: Poi; reachableMinutes: number; offsetMeters: number } => !!item
    );

  const sorted = filtered.sort((a, b) => a.reachableMinutes - b.reachableMinutes);
  return sorted.slice(0, 4);
}


export function shortestPathDistanceMeters(
  network: StreetNetwork,
  startNodeId: string,
  goalNodeId: string
): number | null {
  if (startNodeId === goalNodeId) return 0;
  if (!network.nodes.has(startNodeId) || !network.nodes.has(goalNodeId)) return null;

  const distances = new Map<string, number>();
  const visited = new Set<string>();
  const queue: { id: string; dist: number }[] = [{ id: startNodeId, dist: 0 }];
  distances.set(startNodeId, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.dist - b.dist);
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.id === goalNodeId) return current.dist;

    const neighbors = network.adjacency.get(current.id) || [];
    const currentNode = network.nodes.get(current.id);
    if (!currentNode) continue;

    for (const nbId of neighbors) {
      const neighborNode = network.nodes.get(nbId);
      if (!neighborNode) continue;
      const edgeMeters = haversineDistance(
        currentNode.lat,
        currentNode.lng,
        neighborNode.lat,
        neighborNode.lng
      );
      const newDist = current.dist + edgeMeters;
      const prev = distances.get(nbId);
      if (prev === undefined || newDist < prev) {
        distances.set(nbId, newDist);
        queue.push({ id: nbId, dist: newDist });
      }
    }
  }

  return null;
}
