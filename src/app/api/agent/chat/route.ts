import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message } = body;

    const pythonApiUrl = process.env.PYTHON_API_URL || "http://127.0.0.1:8000";
    
    const response = await fetch(`${pythonApiUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Could not get response from agent" },
        { status: 503 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
