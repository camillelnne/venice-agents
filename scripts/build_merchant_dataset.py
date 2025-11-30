import pandas as pd
import numpy as np
import geopandas as gpd
import networkx as nx
from geopy.distance import geodesic

"""
Build a CSV (for easier file visualization) and a parquet file (easier usage) where each feature is a person with:
 - person (original name)
 - shop_count (number of shops)
 - shop_type (type of shop) (list)
 - shop_type_eng (original translation) (list)
 - shop_category (original metacategory) (list)
 - shop_lat/lng (float) shop place (list)
 - house_lat/lng  (float) house place 

 Uses a graph and connected components thresholding to cluster the entries, according to a custom scoring function
 """

landregister_1740 = gpd.read_file("../public/data_raw/1740_Catastici_2025-09-24.geojson")
print("length of langregister ",len(landregister_1740))

df = landregister_1740.drop(columns=["author","owner_code","owner_count","place","PP_OwnerCode","PP_OwnerCode_SIMPL","an_rendi","id_napo","quantity_income","quality_income","PP_Function_MID","PP_Function_PROPERTY", "PP_Function_GEOMETRY","PP_Owner_Title","PP_Owner_Entity","PP_Owner_FirstName","PP_Owner_LastName","PP_Owner_Notes", "tif_path_img", "path_img"])

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

for tenant_name, group_df in kept_groups.items():
    if group_df.crs != 'EPSG:4326':
        kept_groups[tenant_name] = group_df.to_crs('EPSG:4326')

def create_tenant_graph(kept_groups):
    """
    Create a graph where:
    - Each row is a node
    - Edges connect properties of the same tenant
    - Edge weights are based on a custom scoring function
    """
    G = nx.Graph()
    
    # Add all rows as nodes
    node_id = 0
    node_to_row = {}  # mapping from node_id to original row data
    
    for tenant_name, group_df in kept_groups.items():
        for idx, row in group_df.iterrows():
            # Add node with attributes
            G.add_node(node_id, 
                      tenant_name=tenant_name,
                      original_index=idx,
                      **row.to_dict())  # include all row data as node attributes
            node_to_row[node_id] = row
            node_id += 1
    
    # Add edges between properties of the same tenant
    for tenant_name, group_df in kept_groups.items():
        tenant_nodes = [n for n in G.nodes() if G.nodes[n]['ten_name_norm'] == tenant_name]
        # Create edges between all pairs within this tenant group
        for i in range(len(tenant_nodes)):
            for j in range(i + 1, len(tenant_nodes)):
                node1, node2 = tenant_nodes[i], tenant_nodes[j]
                
                # Calculate edge weight using scoring function
                
                weight = score_function(node_to_row[node1], node_to_row[node2])
                
                G.add_edge(node1, node2, weight=weight)
    
    return G, node_to_row

def score_function(row1, row2):
    """
    Scoring function based on several factors: 
        - Parish
        - Sestiere
        - Distance
        - Parcel type (house, shop)
        - Type of shops if shops
    """
    score = 1.0
    # Distance
    lat1, lon1 = row1.geometry.y, row1.geometry.x
    lat2, lon2 = row2.geometry.y, row2.geometry.x
    distance = geodesic((lat1, lon1), (lat2, lon2)).meters
    # Inverse distance score (closer = higher weight)
    if distance != 0:
        score /= (1.0 + distance/500)  # normalize by 500m
    # Parish
    if row1["parish_std"] != row2["parish_std"]:
        score *= 0.8
    # Sestiere
    if row1["sestiere"] != row2["sestiere"]:
        score *= 0.5
    # Parcel type (we only consider the types shop and casa, the others are too complicated to generalize so we don't touch them)
    type1, type2 = row1["PP_Function_TOP"], row2["PP_Function_TOP"]
    if type1 == "CASA" and type2 =="CASA": 
        score = 0 # we consider that 1 merchant has only 1 house
    elif type1 == "SHOP" and type2 == "SHOP":
        cat1, cat2 = row1["PP_Bottega_METACATEGORY"], row2["PP_Bottega_METACATEGORY"]
        bot1, bot2 = row1["PP_Bottega_STD"], row2["PP_Bottega_STD"]
        if bot1 != bot2 and cat1 == cat2:
            score *= 0.8
        if bot1 != bot2 and cat1 != cat2:
            score *= 0.5
    return score

# Create the graph
G, node_to_row = create_tenant_graph(kept_groups)

print(f"Graph created with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
print(f"Number of connected components: {nx.number_connected_components(G)}")

# get components with thresholding
def get_filtered_components(G, weight_threshold):
    """Get connected components after removing edges below threshold"""
    G_filtered = G.copy()
    
    # Remove edges below threshold
    edges_to_remove = [(u, v) for u, v, d in G_filtered.edges(data=True) 
                       if d.get('weight', 0) < weight_threshold]
    G_filtered.remove_edges_from(edges_to_remove)
    
    return list(nx.connected_components(G_filtered))

components = get_filtered_components(G, 0.5)
print(f"{len(components)} components after thresholding")
def components_to_dataframe(G, node_to_row, components):
    """Convert connected components back to merchant DataFrame format"""
    persons = []
    
    for component in components:
        # Get all rows in this component
        component_rows = []
        for node_id in component:
            row = node_to_row[node_id]
            component_rows.append(row)
        
        # Convert to GeoDataFrame for easier processing
        g = gpd.GeoDataFrame(component_rows).copy()
        if g.crs is None:
            g = g.set_crs('EPSG:4326') 
        
        # Transform back to original CRS 
        g = g.to_crs(df.crs)
        # Get tenant name (should be same for all nodes in component)
        
        home_candidates = g[g["PP_Function_TOP"] == "CASA"]
        home_row = home_candidates.iloc[0] if not home_candidates.empty else g.iloc[0]
        home_geom = home_row.geometry

        # Collect all shops for this person (may be multiple)
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
        if len(shop_types) == 0: # don't consider the ones which don't have shops (probably not merchants)
            continue
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
    
    return pd.DataFrame(persons)

persons_df = components_to_dataframe(G, node_to_row, components)

out_fp = "../public/data/merchants_dataset.csv"
out_parquet = "../public/data/merchants_dataset.parquet"

persons_df.to_csv(out_fp, index=False)
persons_df.to_parquet(out_parquet, index=False)


print(f"Saved {len(persons_df)} persons in csv -> {out_fp}")
print(f"Saved {len(persons_df)} persons in parquet -> {out_parquet}")