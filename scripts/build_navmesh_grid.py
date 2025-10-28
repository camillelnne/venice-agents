import json, math
from pathlib import Path
import geopandas as gpd
import numpy as np
import networkx as nx
from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree
from tqdm import tqdm

SRC = "public/venice_1808_landregister_geometries.geojson"
OUT = Path("public/navmesh_grid.json")
CELL = 1.0       # grid spacing (m)
MAX_POLY = 50_000  # skip absurdly large polygons

# 1. Load polygons
raw = gpd.read_file(SRC)
streets = raw[raw["geometry_type"]=="street"].to_crs(3857).copy()

# Optional heal for tiny cracks
streets["geometry"] = streets.buffer(0.3)
streets = streets.explode(index_parts=False).reset_index(drop=True)

print(f"{len(streets)} street polygons")

# 2. Build uniform grid covering bbox of all streets
xmin, ymin, xmax, ymax = streets.total_bounds
xs = np.arange(xmin, xmax, CELL)
ys = np.arange(ymin, ymax, CELL)

# 3. Spatial index for fast point-in-polygon
# 3) Build grid POINTS and keep only those within street polygons
from shapely.geometry import Point
import geopandas as gpd
import numpy as np

# grid centers
xs = np.arange(xmin, xmax, CELL) + CELL/2
ys = np.arange(ymin, ymax, CELL) + CELL/2
XX, YY = np.meshgrid(xs, ys)             # (ny, nx)
pts_xy = np.column_stack([XX.ravel(), YY.ravel()])

# GeoDataFrame of points in EPSG:3857
pts_gdf = gpd.GeoDataFrame(
    geometry=[Point(x, y) for x, y in pts_xy],
    crs=streets.crs
)

# spatial join: keep only points within any street polygon
# (If your version errors on 'predicate', change to: op='within')
inside = gpd.sjoin(pts_gdf, streets[['geometry']], how='inner', predicate='within')

# final walkable nodes (x,y) array
cells = np.array([(pt.x, pt.y) for pt in inside.geometry], dtype=float)
print(f"walkable nodes: {cells.shape[0]}")


# 4) Build adjacency graph (4-neighbour)
G = nx.Graph()
# put nodes into a hash set for O(1) lookup
cellset = { (float(x), float(y)) for x, y in cells }

for x, y in cells:
    # 4-neighbourhood
    for dx, dy in ((CELL,0),(-CELL,0),(0,CELL),(0,-CELL)):
        nx_, ny_ = x+dx, y+dy
        if (nx_, ny_) in cellset:
            G.add_edge((x,y), (nx_,ny_), weight=CELL)

print(f"{len(cells)} walkable nodes")

# 4. Build adjacency graph (4-neighbour)
# cells is an ndarray of shape (N,2)
cells_list = [(float(x), float(y)) for x, y in cells]
cellset = set(cells_list)  # OK now: tuples are hashable

G = nx.Graph()
# build only 4-neighbour edges; avoid duplicates by ordering
for x, y in cells_list:
    for dx, dy in ((CELL,0), (0,CELL)):  # only right/up; left/down will be covered from neighbors
        nx_, ny_ = x + dx, y + dy
        if (nx_, ny_) in cellset:
            G.add_edge((x, y), (nx_, ny_), weight=CELL)

print(f"Nodes={G.number_of_nodes()}, Edges={G.number_of_edges()}")


# 5. Export
# Lean export: nodes only
out_nodes = [{"x": x, "y": y} for (x, y) in cells_list]
with open(OUT, "w") as f:
    json.dump({"crs": "EPSG:3857", "cell": CELL, "nodes": out_nodes}, f)
print(f"Saved {OUT} (nodes only; edges are implicit)")

