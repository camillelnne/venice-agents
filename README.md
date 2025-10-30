# Venice Agents

A small, interactive Next.js app that visualizes agent navigation across historic Venice (1808). The app uses GeoJSON source layers and a precomputed navmesh to drive pathfinding and render agent movement on a map.

Key pieces

- Public GeoJSON: `public/venice_1808_landregister_geometries.geojson`
- Navmesh/grid: `public/navmesh_grid.json` (generated with `scripts/build_navmesh_grid.py`)
- UI components: `src/components/GridMap.tsx`

## Getting Started

1. Install dependencies
   
   1.1 NPM

   ```bash
   npm install
   ```
   1.2 FastAPI

   ```bash
   pip install "fastapi[standard]"
   ```
2. Run the Python backend (FastAPI)

   ```bash
   fastapi dev python_api/agent.py
      ```

3. In another terminal, run the dev server

   ```bash
   npm run dev
   # open http://localhost:3000
   ```

Build & production

```bash
npm run build
npm run start
```

## Creating the Navmesh Grid
To create or update the navmesh grid, run the following script:

```bash
python scripts/build_navmesh_grid.py
```