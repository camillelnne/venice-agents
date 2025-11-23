import pandas as pd
import numpy as np
import geopandas as gpd

"""
Build a CSV (for easier file visualization) and a parquet file (easier usage) where each feature is a person with:
 - person (original name)
 - shop_count (number of shops)
 - shop_type (type of shop) (list)
 - shop_type_eng (original translation) (list)
 - shop_category (original metacategory) (list)
 - shop_lat/lng (float) shop place (list)
 - house_lat/lng  (float) house place 
 """

landregister_1740 = gpd.read_file("../public/data_raw/1740_Catastici_2025-09-24.geojson")
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

    # collect all shops for this person (may be multiple)
    shop_rows = g[g["PP_Bottega_STD"].notna()].copy()
    shop_types = []
    shop_types_eng = []
    shop_categories = []
    shop_lats = []
    shop_lngs = []

    for _, s in shop_rows.iterrows():
        shop_types.append(s.get("PP_Bottega_STD"))
        shop_types_eng.append(s.get("PP_Bottega_TRAD"))
        shop_categories.append(s.get("PP_Bottega_METACATEGORY"))
        geom = s.geometry
        if geom is None or geom.is_empty:
            shop_lats.append(pd.NA)
            shop_lngs.append(pd.NA)
        else:
            shop_lats.append(float(geom.y))
            shop_lngs.append(float(geom.x))

    def geom_to_latlng(geom):
        if geom is None:
            return (pd.NA, pd.NA)
        return (float(geom.y), float(geom.x))  # (lat, lng)

    home_lat, home_lng = geom_to_latlng(home_geom)

    persons.append({
        "person": home_row.get("ten_name"),
        "shop_count": len(shop_types),
        "shop_type": shop_types, 
        "shop_type_eng": shop_types_eng, 
        "shop_category": shop_categories, 
        "shop_lat": shop_lats, 
        "shop_lng": shop_lngs,
        "house_lat": home_lat,
        "house_lng": home_lng
    })


persons_df = pd.DataFrame(persons)

out_fp = "../public/data/merchants_dataset.csv"
out_parquet = "../public/data/merchants_dataset.parquet"

persons_df.to_csv(out_fp, index=False)
persons_df.to_parquet(out_parquet, index=False)


print(f"Saved {len(persons_df)} persons in csv -> {out_fp}")
print(f"Saved {len(persons_df)} persons in parquet -> {out_parquet}")