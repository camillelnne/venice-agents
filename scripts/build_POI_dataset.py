import geopandas as gpd
import pandas as pd
from pathlib import Path
import json
import math

from pyproj import Transformer

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_PATH = BASE_DIR / "public/data_raw/1740_Catastici_2025-09-24.geojson"
OUT_GEOJSON = BASE_DIR / "public/data/POI_dataset.geojson"
OUT_POIS = BASE_DIR / "public/data/pois.json"
NETWORK_PATH = BASE_DIR / "public/data/1808_street_traghetto_route.geojson"

REQUIRED_COLUMNS = ["geometry", "PP_Function_MID", "PP_Bottega_STD", "function"]


# Tokens from PP_Function_MID we consider as "interesting" POI functions.
KEEP_TOKENS = {
    "LOCANDA",
    "OSTERIA",
    "ALBERGO",
    "CANEVA",
    "TEATRO",
    "CASINO",
    "CHIESA",
    "SCUOLA",
    "GIARDINO",
    "CORTE",
    "ORTO",
    "TRAGHETTO",
    "FONDACO",
    "BANCO",
    "POSTA",
    "OSPIZIO",
    "BOTTEGA",
    "FORNO",
    "PISTORIA",
}



# Coordinate transformer UTM->WGS84 (matches generate_personas)
utm_to_wgs84 = Transformer.from_crs("EPSG:32633", "EPSG:4326", always_xy=True)


def main():
    # Load file
    df = gpd.read_file(RAW_PATH)

    # Drop non-interesting top-level functions
    df = df[df["PP_Function_TOP"].isin(["CASA", "INVIAMENTO"]) == False]
    # remove the shops which don't have a function
    df = df[(df["PP_Function_TOP"] != "BOTTEGA") | (df["PP_Bottega_STD"].notna())]
    df = df[(~df["PP_Function_MID"].str.contains("BOTTEGA|MAGAZZINO", na=False)) | (df["PP_Bottega_STD"].notna())]

    existing_keep_cols = [c for c in REQUIRED_COLUMNS if c in df.columns]
    df = df[existing_keep_cols].copy()

    print("Columns retained:", existing_keep_cols)

    if "PP_Function_MID" not in df.columns:
        raise RuntimeError("Expected column 'PP_Function_MID' not found in dataset")
    if "PP_Bottega_STD" not in df.columns:
        raise RuntimeError("Expected column 'PP_Bottega_STD' not found in dataset")

    def split_tokens(val) -> set[str]:
        if pd.isna(val):
            return set()
        return {token.strip().upper() for token in str(val).split(",") if token.strip()}

    # Precompute tokens for each row
    df["_tokens"] = df["PP_Function_MID"].apply(split_tokens)

    # Helper: decide if a row is a POI we keep
    def is_poi(row) -> bool:
        tokens: set[str] = row["_tokens"]
        has_special_shop = pd.notna(row["PP_Bottega_STD"]) and str(row["PP_Bottega_STD"]).strip() != ""

        # If we have a specialized shop type, we always keep it
        if has_special_shop:
            return True

        # If any of the function tokens are in our keep list, keep the feature
        if tokens & KEEP_TOKENS:
            return True

        # Otherwise it's not an interesting POI for the sim
        return False

    # Apply filtering
    before_count = len(df)
    df = df[df.apply(is_poi, axis=1)].copy()
    after_count = len(df)
    print(f"Filtered POIs: {before_count} → {after_count} kept")

    df = df.drop(columns=["_tokens"])

    # Convert geometry to WGS84 lat/lng
    df = df.to_crs("EPSG:4326")
    df["lat"] = df.geometry.y
    df["lng"] = df.geometry.x

    # Helper to derive type/label
    def normalize_type(row) -> str:
        # Prioritize PP_Bottega_STD if available (specialized shop type)
        primary = str(row.get("PP_Bottega_STD") or "").strip()
        if primary:
            return primary.upper()
        
        # Fall back to PP_Function_MID, preferring tokens in KEEP_TOKENS
        fallback = str(row.get("PP_Function_MID") or "").strip()
        if not fallback:
            return "UNKNOWN"
        
        # Split by comma and prefer tokens that are in KEEP_TOKENS
        tokens = [t.strip().upper() for t in fallback.split(",") if t.strip()]
        for token in tokens:
            if token in KEEP_TOKENS:
                return token
        
        # If no tokens are in KEEP_TOKENS, return the first one
        return tokens[0] if tokens else "UNKNOWN"

    def build_label(row) -> str:
        if pd.notna(row.get("function")) and str(row["function"]).strip():
            return str(row["function"]).strip()
        if pd.notna(row.get("PP_Bottega_STD")) and str(row["PP_Bottega_STD"]).strip():
            return str(row["PP_Bottega_STD"]).strip()
        if pd.notna(row.get("PP_Function_MID")) and str(row["PP_Function_MID"]).strip():
            return str(row["PP_Function_MID"]).strip()
        return "Point of interest"

    # Build POI list with WGS84 lat/lng (to match personas.json schema)
    pois = []
    for idx, row in df.iterrows():
        lat = float(row["lat"])
        lng = float(row["lng"])
        poi_type = normalize_type(row)
        label = build_label(row)
        pois.append(
            {
                "id": f"poi_{len(pois)+1:04d}",
                "lat": lat,
                "lng": lng,
                "type": poi_type,
                "label": label,
            }
        )

    # Save GeoJSON (original filtered geometries)
    OUT_GEOJSON.parent.mkdir(parents=True, exist_ok=True)
    df.to_file(OUT_GEOJSON, driver="GeoJSON")
    print(f"[DONE] Saved {len(df)} POI features to {OUT_GEOJSON}")

    # Save normalized POI list with lat/lng for easier matching to personas
    OUT_POIS.parent.mkdir(parents=True, exist_ok=True)
    with OUT_POIS.open("w", encoding="utf-8") as f:
        json.dump(pois, f, ensure_ascii=False, indent=2)
    print(f"[DONE] Saved {len(pois)} POIs with lat/lng to {OUT_POIS}")


if __name__ == "__main__":
    main()
