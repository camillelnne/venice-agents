"use client";
import { MapContainer, TileLayer, useMap, useMapEvent } from "react-leaflet";
import L, { LatLngLiteral } from "leaflet";
import { useEffect, useState, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Node = { x: number; y: number };
type GridNav = { crs: "EPSG:3857"; cell: number; nodes: Node[] };

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
    <MapContainer center={[45.438, 12.335]} zoom={16} style={{ height: "100vh", width: "100vw" }}>
      <TileLayer
        url="https://geo-timemachine.epfl.ch/geoserver/www/tilesets/venice/sommarioni/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://timeatlas.eu/">Time Atlas@EPFL</a>'
        maxZoom={19}
        className="grayscale-map"
      />
      {nav && <AgentOnGrid nav={nav} />}
    </MapContainer>
  );
}

/**
 * Component to place an agent on the grid and navigate from start to goal.
 */
function AgentOnGrid({ nav }: { nav: GridNav }) {
  const map = useMap();
  const [start, setStart] = useState<LatLngLiteral | null>(null);
  const [goal, setGoal] = useState<LatLngLiteral | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const agentRef = useRef<L.CircleMarker | null>(null);

  const H = useMemo(() => {
    const R = 6378137; // Earth's radius in meters

    // ---- Coordinate conversions ----
    const toXY = (lat: number, lng: number): [number, number] => [
      (lng * Math.PI * R) / 180,
      Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R,
    ];
    const toLL = (x: number, y: number): LatLngLiteral => ({
      lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI),
      lng: (x / R) * (180 / Math.PI),
    });

    // ---- Graph helpers ----
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
      // simple nearest neighbor (O(N)) — fine for small area grids
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
  }, [nav]);

  // ---- Click handlers ----
  useMapEvent("click", (e) => setStart(e.latlng));

  useMapEvent("contextmenu", (e) => setGoal(e.latlng));

  useEffect(() => {
    if (!start || !goal) return;

    const sXY = H.toXY(start.lat, start.lng);
    const gXY = H.toXY(goal.lat, goal.lng);
    const s = H.nearest(sXY);
    const g = H.nearest(gXY);
    const sK = H.key(s.x, s.y);
    const gK = H.key(g.x, g.y);

    // ---- BFS ----
    const came = new Map<string, string>();
    const queue = [sK];
    const seen = new Set<string>([sK]);

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === gK) break;

      const [cx, cy] = cur.split(",").map(Number);
      const curNode = { x: cx, y: cy };
      for (const nb of H.neighbors4(curNode)) {
        const nbK = H.key(nb.x, nb.y);
        if (!seen.has(nbK)) {
          seen.add(nbK);
          came.set(nbK, cur);
          queue.push(nbK);
        }
      }
    }

    if (!came.has(gK) && sK !== gK) return;

    // ---- Reconstruct path ----
    const pathKeys = [gK];
    for (let c = gK; c !== sK; c = came.get(c)!) {
      pathKeys.unshift(came.get(c)!);
    }

    const pathLatLng: LatLngLiteral[] = pathKeys.map((k) => {
      const [x, y] = k.split(",").map(Number);
      return H.toLL(x, y);
    });

    // ---- Draw route ----
    routeRef.current?.remove();
    routeRef.current = L.polyline(pathLatLng, { weight: 4, color: "#00bcd4" }).addTo(map);

    agentRef.current?.remove();
    agentRef.current = L.circleMarker(pathLatLng[0], { radius: 5, color: "red" }).addTo(map);

    // ---- Animate agent ----
    let i = 0;
    const speed = 150; // steps per second
    const h = setInterval(() => {
      i = Math.min(i + 1, pathLatLng.length - 1);
      agentRef.current!.setLatLng(pathLatLng[i]);
      if (i >= pathLatLng.length - 1) clearInterval(h);
    }, 1000 / speed);

    return () => clearInterval(h);
  }, [start, goal, H, map]);

  return null;
}
