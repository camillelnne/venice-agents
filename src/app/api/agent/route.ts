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

// --- Pathfinding Tool ---
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
    const { start, goal } = body;

    if (!start || !goal) {
      return NextResponse.json(
        { error: "Start and goal are required" },
        { status: 400 }
      );
    }

    // For now, we directly call the pathfinding tool.
    // In the future, a LangGraph agent would decide to call this tool.
    const path = await findPath(start, goal);

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