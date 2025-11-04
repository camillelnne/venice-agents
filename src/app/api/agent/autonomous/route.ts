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
  const startTime = Date.now();
  try {
    const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
    
    console.log("[Autonomous] Getting next destination from Python API...");
    // Get agent's next destination with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const destResponse = await fetch(`${pythonApiUrl}/agent/next-destination`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!destResponse.ok) {
      console.error(`[Autonomous] Python API returned ${destResponse.status}`);
      return NextResponse.json(
        { error: "Could not get next destination" },
        { status: 503 }
      );
    }

    const destData = await destResponse.json();
    const { start, destination, reason } = destData;
    console.log(`[Autonomous] Destination: ${destination.name || 'unknown'} (${Date.now() - startTime}ms)`);

    // Find path
    console.log("[Autonomous] Finding path...");
    const pathStartTime = Date.now();
    const streetNetwork = await getStreetNetwork();
    const path = findPath(streetNetwork, start, destination);
    console.log(`[Autonomous] Pathfinding took ${Date.now() - pathStartTime}ms`);

    if (!path) {
      console.error("[Autonomous] No path found between start and destination");
      return NextResponse.json(
        { error: "No path found" },
        { status: 404 }
      );
    }

    console.log(`[Autonomous] Total request time: ${Date.now() - startTime}ms`);
    // Don't update location here - let frontend update after animation completes
    // Return destination so frontend can update backend when animation finishes
    return NextResponse.json({ path, reason, destination });

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Autonomous] Request timed out after ${Date.now() - startTime}ms`);
      return NextResponse.json(
        { error: "Request timed out" },
        { status: 408 }
      );
    }
    console.error("[Autonomous] Unexpected error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
