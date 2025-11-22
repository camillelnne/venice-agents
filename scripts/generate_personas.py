#!/usr/bin/env python3
"""
Generate agent personas and daily routines from merchants_dataset.csv
using OpenAI's gpt-5 with JSON mode.

Usage:
  python generate_personas.py \
      --input data/merchants_dataset.csv \
      --output public/data/personas.json \
      --limit 20 \
      --resume
"""

import argparse
import csv
import json
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from openai import OpenAI

# ============================================================
# Configuration
# ============================================================

MODEL = "gpt-5"
JSON_FORMAT = {"type": "json_object"}

SYSTEM_PROMPT = """
You are an expert historian of Venice circa 1740 and a simulation designer.

Your task:
- Given basic Catastici information about a Venetian shopkeeper,
  generate a historically plausible personality and full daily routine.
- Follow the JSON schema EXACTLY (no comments, no extra fields).
- The JSON will be parsed by a computer, so strict structure matters.

RULES:
- Personality: 1–2 sentences, historically plausible.
- Routine: Use 05:00–22:00 as main day range.
- Time granularity: 30–60 minutes.
- Activity types (MUST match EXACTLY):
    "HOME"
    "SHOP"
    "FREE_TIME"
    "TRAVEL_TO_SHOP"
    "TRAVEL_HOME"
- The routine must cover the entire active day without overlaps.
- TRAVEL_TO_SHOP and TRAVEL_HOME might not be needed in case the shop and house are in the same location.

OUTPUT:
Return ONLY valid JSON with this schema:

{
  "personality": "string",
  "dailyRoutine": [
    {
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "type": "HOME" | "SHOP" | "FREE_TIME" | "TRAVEL_TO_SHOP" | "TRAVEL_HOME"
    }
  ]
}
"""

# ============================================================
# Data Structures
# ============================================================

@dataclass
class DailyActivity:
    startTime: str
    endTime: str
    type: str


@dataclass
class AgentPersona:
    name: str
    shopType: str
    shopCategory: str
    home: Dict[str, float]
    shop: Dict[str, float]
    personality: str
    dailyRoutine: List[DailyActivity]


# ============================================================
# Utilities
# ============================================================

def load_existing(path: Path) -> Dict[str, AgentPersona]:
    """Load existing personas.json, keyed by name."""
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        arr = json.load(f)
    result: Dict[str, AgentPersona] = {}
    for obj in arr:
        persona = AgentPersona(
            name=obj["name"],
            shopType=obj["shopType"],
            shopCategory=obj["shopCategory"],
            home=obj["home"],
            shop=obj["shop"],
            personality=obj["personality"],
            dailyRoutine=[DailyActivity(**a) for a in obj["dailyRoutine"]],
        )
        result[persona.name] = persona
    return result


def save_personas(path: Path, personas: Dict[str, AgentPersona]):
    """Save personas dict to JSON (list of objects)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = []
    for p in personas.values():
        o = asdict(p)
        o["dailyRoutine"] = [asdict(a) for a in p.dailyRoutine]
        arr.append(o)
    with path.open("w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False, indent=2)


# ============================================================
# LLM Call
# ============================================================

def generate_persona(client: OpenAI, row: Dict[str, str]) -> Optional[AgentPersona]:
    """Call OpenAI to generate personality + routine for a single merchant, then merge with CSV data."""

    person = row["person"].strip()
    shop_type_it = row["shop_type"]
    shop_type_en = row["shop_type_eng"]
    shop_category = row["shop_category"]

    shop_lat = float(row["shop_lat"])
    shop_lng = float(row["shop_lng"])
    house_lat = float(row["house_lat"])
    house_lng = float(row["house_lng"])

    # Decide which shopType string you prefer; here I take English if available, else Italian
    shop_type = shop_type_en or shop_type_it

    user_prompt = f"""
    Person: {person}
    Shop type (Italian): {shop_type_it}
    Shop type (English): {shop_type_en}
    Shop category: {shop_category}
    House coordinates: [{house_lat}, {house_lng}]
    Shop coordinates: [{shop_lat}, {shop_lng}]

    Generate a historically plausible personality + daily routine.
    """

    # attempt to generate persona up to 3 times
    for attempt in range(1, 4):
        try:
            completion = client.chat.completions.create(
                model=MODEL,
                response_format=JSON_FORMAT,  # {"type": "json_object"}
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
            )

            content = completion.choices[0].message.content
            data = json.loads(content)

            # Expect only personality + dailyRoutine from the model
            personality = data["personality"]
            routine = [DailyActivity(**x) for x in data["dailyRoutine"]]

            # Merge routines bits that are in the same location back to back
            for i in range(len(routine) - 1, 0, -1):
                curr = routine[i]
                prev = routine[i - 1]
                if curr.type == prev.type:
                    # Merge
                    prev.endTime = curr.endTime
                    routine.pop(i)

            persona = AgentPersona(
                name=person,
                shopType=shop_type,
                shopCategory=shop_category,
                home={"lat": house_lat, "lng": house_lng},
                shop={"lat": shop_lat, "lng": shop_lng},
                personality=personality,
                dailyRoutine=routine,
            )
            return persona

        except Exception as e:
            print(f"[WARN] Error generating '{person}' attempt {attempt}: {e}")
            time.sleep(0.5 * attempt)

    print(f"[FAIL] Could not generate persona for: {person}")
    return None


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    input_path = Path("../" + args.input)
    output_path = Path("../" + args.output)

    # Load env (.env or .env.local)
    load_dotenv()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment")

    client = OpenAI(api_key=api_key)

    personas = load_existing(output_path) if args.resume else {}

    with input_path.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if args.limit:
        rows = rows[: args.limit]

    print(f"[INFO] Generating personas for {len(rows)} merchants.")

    for i, row in enumerate(rows, start=1):
        person_name = row["person"].strip()

        if args.resume and person_name in personas:
            print(f"[SKIP] {i}/{len(rows)} {person_name} (already generated)")
            continue

        print(f"[GEN ] {i}/{len(rows)} {person_name}")
        persona = generate_persona(client, row)

        if persona:
            # ✅ Actually store it in the dict
            personas[persona.name] = persona
            save_personas(output_path, personas)
            print(f"[OK  ] Saved '{persona.name}'")

    print(f"[DONE] Total personas: {len(personas)} → {output_path}")


if __name__ == "__main__":
    main()
