import { NextResponse } from "next/server";
import {
  buildNetworkFromGeoJSON,
  findPath,
  StreetNetwork,
} from "@/lib/network";
import path from "path";
import fs from "fs/promises";

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

export async function GET() {
  try {
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
    
    // Get agent's next destination
    const destResponse = await fetch(`${pythonApiUrl}/agent/next-destination`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!destResponse.ok) {
      return NextResponse.json(
        { error: "Could not get next destination" },
        { status: 503 }
      );
    }

    const destData = await destResponse.json();
    const { start, destination, reason } = destData;

    // Find path
    const streetNetwork = await getStreetNetwork();
    const path = findPath(streetNetwork, start, destination);

    if (!path) {
      return NextResponse.json(
        { error: "No path found" },
        { status: 404 }
      );
    }

    // Don't update location here - let frontend update after animation completes
    // Return destination so frontend can update backend when animation finishes
    return NextResponse.json({ path, reason, destination });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
