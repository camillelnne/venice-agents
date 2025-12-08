import geopandas as gpd
df = gpd.read_file("../public/data_raw/1740_Catastici_2025-09-24.geojson")

df = df.drop(columns=["uid", "author","parish_std", "sestiere", "ten_name", "owner_name", "owner_code","PP_Bottega_COUNT", "PP_Bottega_TRAD", "PP_Bottega_METACATEGORY","owner_count","place","PP_OwnerCode","PP_OwnerCode_SIMPL","an_rendi","id_napo","quantity_income","quality_income","PP_Function_PROPERTY", "PP_Function_GEOMETRY","PP_Owner_Title","PP_Owner_Entity","PP_Owner_FirstName","PP_Owner_LastName","PP_Owner_Notes", "tif_path_img", "path_img"])
# remove houses (not POI)
df = df[df["PP_Function_TOP"] != 'CASA'] 
# remove the shops which don't have a function
df = df[(df["PP_Function_TOP"] != 'BOTTEGA') | (df["PP_Bottega_STD"].notna())] 
df = df[(~df["PP_Function_MID"].str.contains('BOTTEGA|MAGAZZINO', na=False)) | (df["PP_Bottega_STD"].notna())] 
# remove vacant parcels
df = df[df["PP_Function_TOP"] != "INVIAMENTO"]
df = df.drop(columns=["PP_Function_TOP"])

# Save to GeoJSON
df.to_file("../public/data/POI_dataset.geojson", driver='GeoJSON')
print(f"Saved {len(df)} POI to ../public/data/POI_dataset.geojson")