import { LatLngLiteral } from "leaflet";

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
