import pandas as pd
import numpy as np
import geopandas as gpd

landregister_1740 = gpd.read_file("../public/1740_Catastici_2025-09-24.geojson")
print("length of langregister ",len(landregister_1740))

df = landregister_1740.drop(columns=["author","owner_code","owner_count","place","PP_OwnerCode","PP_OwnerCode_SIMPL","an_rendi","id_napo","quantity_income","quality_income","parish_std","sestiere","PP_Function_TOP","PP_Function_MID","PP_Function_PROPERTY", "PP_Function_GEOMETRY","PP_Owner_Title","PP_Owner_Entity","PP_Owner_FirstName","PP_Owner_LastName","PP_Owner_Notes", "tif_path_img", "path_img"])

# create dataframe with duplicated tenants 
ten = df["ten_name"]

ten_norm = (
    ten.where(ten.notna())    # keep NaN as NaN so they are not counted
    .str.strip()
    .str.lower()
    .replace("", pd.NA)       # treat empty strings as NaN
)

# names that occur more than once (excluding NaN)
counts = ten_norm.dropna().value_counts()
dup_names = counts[counts > 1].index.tolist()

# dataframe only with duplicated tenants, and add normalized name column
df = df[ten_norm.isin(dup_names)].copy()
df["ten_name_norm"] = ten_norm.loc[df.index]

# group by normalized tenant name and keep only the groups where the person has a shop
grouped = df.groupby("ten_name_norm")

def keep_group(g: pd.DataFrame) -> bool:
    has_bottega = g["PP_Bottega_STD"].notna().any()
    return has_bottega 

kept_groups = {name: grp for name, grp in grouped if keep_group(grp)}

print(f"Total number of duplicated-tenant groups kept: {len(kept_groups)}")

# Build a single CSV where each feature is a person with:
#  - person (original name)
#  - shop_type
#  - shop_type_eng (original translation)
#  - shop_category (original metacategory)
#  - shop_lat/lng (float) shop place
#  - house_lat/lng  (float) house place
persons = []
for name_norm, grp in kept_groups.items():
    g = gpd.GeoDataFrame(grp).copy()
    # ensure proper geometry column
    if g.geometry.name not in g.columns:
        raise RuntimeError(f"group {name_norm} has no geometry")
    # pick home: prefer a row whose 'function' contains "casa"
    home_candidates = g[g["function"].fillna("").astype(str).str.contains("casa", case=False, na=False)]
    home_row = home_candidates.iloc[0] if not home_candidates.empty else g.iloc[0]
    home_geom = home_row.geometry

    shop_rows = g[g["PP_Bottega_STD"].notna()].copy()
    shop_row = shop_rows.iloc[0]
    shop_type = shop_row["PP_Bottega_STD"]
    shop_geom = shop_row.geometry

    def geom_to_latlng(geom):
        if geom is None:
            return (pd.NA, pd.NA)
        return (float(geom.y), float(geom.x))  # (lat, lng)

    home_lat, home_lng = geom_to_latlng(home_geom)
    shop_lat, shop_lng = geom_to_latlng(shop_geom)


    persons.append({
        "person": home_row.get("ten_name"),
        "shop_type": shop_type,
        "shop_type_eng": shop_row.get("PP_Bottega_TRAD"),
        "shop_category": shop_row.get("PP_Bottega_METACATEGORY"),
        "shop_lat": shop_lat,
        "shop_lng": shop_lng,
        "house_lat": home_lat,
        "house_lng": home_lng
    })


persons_df = pd.DataFrame(persons)

out_fp = "../public/merchants_dataset.csv"

persons_df.to_csv(out_fp, index=False)

print(f"Saved {len(persons_df)} persons -> {out_fp}")
persons_df.head()