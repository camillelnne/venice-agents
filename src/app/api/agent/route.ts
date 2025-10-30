import { NextRequest, NextResponse } from "next/server";
import {
  createGridHelpers,
  findPathBFS,
  GridNav,
  GridHelpers,
} from "@/lib/grid";
import path from "path";
import fs from "fs/promises";
import { LatLngLiteral } from "leaflet";

// --- Navigation Data Loading ---
let nav: GridNav;
let H: GridHelpers;

async function getNavHelpers() {
  if (H) return H;
  const filePath = path.join(process.cwd(), "public", "navmesh_grid.json");
  const fileContent = await fs.readFile(filePath, "utf-8");
  nav = JSON.parse(fileContent);
  H = createGridHelpers(nav);
  return H;
}

// --- Pathfinding Function ---
async function findPath(
  start: LatLngLiteral,
  goal: LatLngLiteral
): Promise<LatLngLiteral[] | null> {
  const H = await getNavHelpers();

  const sXY = H.toXY(start.lat, start.lng);
  const gXY = H.toXY(goal.lat, goal.lng);
  const s = H.nearest(sXY);
  const g = H.nearest(gXY);
  const sK = H.key(s.x, s.y);
  const gK = H.key(g.x, g.y);

  const neighborsForKey = (k: string) => {
    const [x, y] = k.split(",").map(Number);
    const nbs = H.neighbors4({ x, y });
    return nbs.map((n) => H.key(n.x, n.y));
  };

  const pathKeys = findPathBFS(sK, gK, neighborsForKey);
  if (!pathKeys) return null;

  const pathLatLng: LatLngLiteral[] = pathKeys.map((k) => {
    const [x, y] = k.split(",").map(Number);
    return H.toLL(x, y);
  });

  return pathLatLng;
}

// --- API Handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { start, goal, goalDescription } = body;

    let finalGoal: LatLngLiteral | null = goal;

    // If a natural language goal is provided, ask the Python agent for coordinates
    if (goalDescription) {
      const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
      
      const coordResponse = await fetch(`${pythonApiUrl}/get-coordinates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: goalDescription }),
      });

      if (!coordResponse.ok) {
        throw new Error("Coordinate service failed");
      }

      const data = await coordResponse.json();
      if (data.error || !data.goal) {
        return NextResponse.json({ error: data.error || "Could not find coordinates for destination" }, { status: 404 });
      }
      finalGoal = data.goal;
    }

    // --- Pathfinding Logic ---
    if (!start || !finalGoal) {
      return NextResponse.json(
        { error: "A start point and a valid goal are required." },
        { status: 400 }
      );
    }

    const path = await findPath(start, finalGoal);

    if (!path) {
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }

    return NextResponse.json({ path });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}