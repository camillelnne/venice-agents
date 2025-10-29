import { LatLngLiteral } from "leaflet";

export type Node = { x: number; y: number };
export type GridNav = { crs: "EPSG:3857"; cell: number; nodes: Node[] };

export type GridHelpers = {
  toXY: (lat: number, lng: number) => [number, number];
  toLL: (x: number, y: number) => LatLngLiteral;
  key: (x: number, y: number) => string;
  nodeSet: Set<string>;
  neighbors4: (n: Node) => Node[];
  nearest: (xy: [number, number]) => Node;
};

/**
 * Create grid helpers for navigation mesh. Includes coordinate conversions and neighbor lookups.
 * @param nav Grid navigation mesh
 * @returns Grid helpers
 */
export function createGridHelpers(nav: GridNav): GridHelpers {
  const R = 6378137; // Earth's radius in meters

  const toXY = (lat: number, lng: number): [number, number] => [
    (lng * Math.PI * R) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R,
  ];

  const toLL = (x: number, y: number): LatLngLiteral => ({
    lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
    lng: (x / R) * (180 / Math.PI),
  });

  const key = (x: number, y: number) => `${x},${y}`;
  const nodeSet = new Set(nav.nodes.map((n) => key(n.x, n.y)));

  const neighbors4 = (n: Node): Node[] => {
    const d = nav.cell;
    const cand = [
      { x: n.x + d, y: n.y },
      { x: n.x - d, y: n.y },
      { x: n.x, y: n.y + d },
      { x: n.x, y: n.y - d },
    ];
    return cand.filter((c) => nodeSet.has(key(c.x, c.y)));
  };

  const nearest = (xy: [number, number]): Node => {
    let best = nav.nodes[0];
    let d2min = Infinity;
    for (const n of nav.nodes) {
      const dx = xy[0] - n.x;
      const dy = xy[1] - n.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < d2min) {
        best = n;
        d2min = d2;
      }
    }
    return best;
  };

  return { toXY, toLL, key, nodeSet, neighbors4, nearest };
}

/**
 * Find a path of keys using BFS. Returns array of keys from startKey to goalKey (inclusive) or null.
 * @param startKey Starting node key. Has form "x,y"
 * @param goalKey Goal node key
 * @param neighborsForKey Function to get neighbors for a given key
 * @returns Array of keys representing the path, or null if no path found
 */
export function findPathBFS(startKey: string, goalKey: string, neighborsForKey: (k: string) => string[] | null) {
  const came = new Map<string, string>();
  const queue = [startKey];
  const seen = new Set<string>([startKey]);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === goalKey) break;
    const nbs = neighborsForKey(cur);
    if (!nbs) continue;
    for (const nbK of nbs) {
      if (!seen.has(nbK)) {
        seen.add(nbK);
        came.set(nbK, cur);
        queue.push(nbK);
      }
    }
  }

  if (!came.has(goalKey) && startKey !== goalKey) return null;
  const path = [goalKey];
  for (let c = goalKey; c !== startKey; c = came.get(c)!) path.unshift(came.get(c)!);
  return path;
}