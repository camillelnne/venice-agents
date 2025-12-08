import geopandas as gpd
import pandas as pd
from pathlib import Path

RAW_PATH = Path("../public/data_raw/1740_Catastici_2025-09-24.geojson")
OUT_PATH = Path("../public/data/POI_dataset.geojson")

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



# Load file
df = gpd.read_file(RAW_PATH)


df = df[df["PP_Function_TOP"].isin(["CASA", "INVIAMENTO"]) == False]
# remove the shops which don't have a function
df = df[(df["PP_Function_TOP"] != 'BOTTEGA') | (df["PP_Bottega_STD"].notna())] 
df = df[(~df["PP_Function_MID"].str.contains('BOTTEGA|MAGAZZINO', na=False)) | (df["PP_Bottega_STD"].notna())] 


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

# Optional: if you still want to remove parcels whose *top* function
# is purely administrative/vacant and which we might have kept only for
# weird reasons, you can add additional filters here.
#
# For example, if PP_Function_TOP exists and you want to be safe:
#
# if "PP_Function_TOP" in df.columns:
#     df = df[df["PP_Function_TOP"] != "INVIAMENTO"]  # vacant
#     # (Don't drop CASA here; mixed CASA,BOTTEGA etc. are already handled by tokens)

# Save to GeoJSON
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
df.to_file(OUT_PATH, driver="GeoJSON")
print(f"[DONE] Saved {len(df)} POI features to {OUT_PATH}")
