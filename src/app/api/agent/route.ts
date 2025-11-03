import { NextRequest, NextResponse } from "next/server";
import {
  buildNetworkFromGeoJSON,
  findPath,
  StreetNetwork,
} from "@/lib/network";
import path from "path";
import fs from "fs/promises";
import { LatLngLiteral } from "leaflet";

// --- Navigation Data Loading ---
let network: StreetNetwork | null = null;

async function getStreetNetwork(): Promise<StreetNetwork> {
  if (network) return network;
  
  const filePath = path.join(
    process.cwd(),
    "public",
    "1808_street_traghetto_route.geojson"
  );
  const fileContent = await fs.readFile(filePath, "utf-8");
  const geojson = JSON.parse(fileContent);
  
  network = buildNetworkFromGeoJSON(geojson);
  console.log(`Loaded street network: ${network.nodes.size} nodes, ${network.edges.length} edges`);
  
  return network;
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
        return NextResponse.json(
          { error: "Could not connect to coordinate service. Please try again." },
          { status: 503 }
        );
      }

      const data = await coordResponse.json();
      if (data.error || !data.goal) {
        return NextResponse.json(
          { error: `Could not find "${goalDescription}". Try a landmark like "Rialto Bridge" or "St. Mark's Square".` },
          { status: 404 }
        );
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

    const streetNetwork = await getStreetNetwork();
    const path = findPath(streetNetwork, start, finalGoal);

    if (!path) {
      return NextResponse.json(
        { error: "No path found between these locations. They may not be connected by the street network." },
        { status: 404 }
      );
    }

    return NextResponse.json({ path });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}