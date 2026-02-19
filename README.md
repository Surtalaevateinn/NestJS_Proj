# Symbiose Forest BD Viewer 🌲

<p align="center">
  <img src="./public/docs/symbiose-os-terminal.png" width="950"/>
</p>

<p align="center">
  <em>Fig 1. The main geospatial intelligence terminal visualizing BD Forêt bio-data.</em>
</p>

A production-ready, full-stack **geospatial intelligence terminal** designed to visualize and analyze French forest data (**BD Forêt**) and **LiDAR canopy heights (CHM)**. Built for the **Symbiose Technical Challenge**.

---

## ✨ Features

- **Authentication**: Secure JWT-based registration, login, and session management.
- **Interactive Geospatial Mapping**: Mapbox GL JS integration with a custom *glassmorphism* UI.
- **Macro → Micro Navigation**: Seamless `FlyTo` navigation **Region → Department → Commune**.
- **Vector Layers**
  - **BD Forêt (Bio-Data)**: Tree species visualization filtered dynamically via **PostGIS bounding-box** queries.

    <p align="center">
      <img src="./public/docs/bounding-box-query-logic.png" width="900"/>
    </p>
    <p align="center">
      <em>Diagram — Bounding box query logic with viewport guard + debounce.</em>
    </p>

  - **Cadastre**: Official **Etalab** vector tiles (TileJSON), loaded at `minzoom: 13`.
- **State Persistence**: Debounced saving of user map view (**latitude / longitude / zoom**).
- **Bonus A — Polygon Spatial Analysis**: Real-time intersections to compute vegetation composition and exact area inside a user-drawn polygon.
- **Bonus B — LiDAR CHM Integration**: Python-based spatial indexing + masking engine to extract localized CHM stats (**min / max / avg heights**) directly from IGN GeoTIFFs.

  <p align="center">
    <img src="./public/docs/lidar-chm-masking.png" width="900"/>
  </p>
  <p align="center">
    <em>Diagram — Dynamic CHM masking pipeline (Node ↔ Python ↔ GeoTIFF) and statistics extraction.</em>
  </p>

---

## 🖼️ Screenshots

### Micro-Detail & Cadastre

<p align="center">
  <img src="./public/docs/micro-detail-cadastre.png" width="950"/>
</p>

<p align="center">
  <em>Fig 2. Micro-level navigation with official Etalab Cadastre vector tiles and hover states.</em>
</p>

### Sector Intelligence (Polygon + LiDAR)

<p align="center">
  <img src="./public/docs/sector-intelligence.png" width="950"/>
</p>

<p align="center">
  <em>Fig 3. Real-time geometric intersection and LiDAR Canopy Height Model (CHM) spatial masking.</em>
</p>

---

## 🛠 Technology Stack

- **Frontend**: Next.js 15 (App Router), React, Mapbox GL JS, Tailwind CSS  
- **Backend**: NestJS, TypeORM, PostGIS (PostgreSQL 15)  
- **Data Engineering**: Python 3, Rasterio, Shapely, NumPy, GDAL  
- **DevOps**: Docker, Docker Compose, Monorepo structure  

<p align="center">
  <img src="./public/docs/architecture-flow.png" width="950"/>
</p>

<p align="center">
  <em>Diagram — The Architecture Flow (full-stack data flow & component collaboration).</em>
</p>

---

## 📂 Project Structure

```text
Symbiose-Forest-Viewer/
├── backend/
│   ├── src/
│   │   ├── auth/              # JWT Authentication & Guards
│   │   ├── forest/            # PostGIS Entities & Spatial Controllers
│   │   ├── lidar/             # Python ↔ Node.js bridge for raster analysis
│   │   ├── scripts/           # ETL pipelines (seed-forest.ts)
│   │   └── main.ts            # NestJS entry point & Swagger config
│   ├── Dockerfile             # Node (Alpine) + Python/GDAL environment
│   └── package.json
├── frontend/
│   ├── app/                   # Next.js routes & layouts
│   ├── components/            # React UI components & Mapbox logic
│   ├── lib/                   # API interceptors & auth utils
│   ├── Dockerfile             # Multi-stage Next.js build
│   └── package.json
├── data/                      # ⚠️ Ignored in git; must be created manually
│   ├── BDV2/                  # BD Forêt Shapefiles (.shp, .dbf, .prj)
│   └── lidar/                 # IGN LiDAR HD GeoTIFFs (.tif)
├── public/
│   └── docs/                  # ✅ README images & diagrams (tracked in git)
├── docker-compose.yml         # Container orchestration
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- **Docker** and **Docker Compose**
- A valid **Mapbox access token**

---

### 1) Data Preparation

Due to the large size of the datasets, they are not included in the repository.

1. Create a `data/` directory at the root of the project.
2. **BD Forêt (Core)**  
   Download the shapefiles and place them in:
   - `./data/BDV2/`
3. **LiDAR (Bonus B)**  
   Download **MNH GeoTIFF** files from **IGN LiDAR HD** and place them in:
   - `./data/lidar/`

---

### 2) Environment Setup

Create a `.env` file in `./frontend` (or export the variable in your shell):

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
```

---

### 3) Build & Run

Start the full stack (PostGIS, NestJS + Python engine, Next.js) using Docker Compose:

```bash
docker-compose up --build -d
```

---

### 4) Database Seeding (ETL)

Once containers are healthy, run the ingestion script to:

- parse shapefiles
- convert coordinates **EPSG:2154 → EPSG:4326**
- seed the PostGIS database

```bash
docker exec -it nest_backend pnpm run seed:forest
```

---

### 5) Access the Platform

- **Frontend Web App**: `http://localhost:3001`  
- **Backend Swagger API Docs**: `http://localhost:3000/api`

---

## 📖 API Notes

The application exposes **RESTful APIs** documented via **Swagger** at:

- `http://localhost:3000/api`

This includes endpoints for:

- user authentication
- bounding-box forest queries
- LiDAR spatial triggers

**Note:** REST was chosen over GraphQL to optimize streaming of **binary / GeoJSON** payloads between Mapbox and PostGIS.

---

## 🧠 Assumptions & Simplifications

To keep performance strong and respect hardware limits:

- **Viewport Guard**: Forest polygons are requested only when `zoom >= 10.5` to avoid browser rendering bottlenecks and heavy DB loads.
- **LiDAR Lazy Evaluation**: Rather than ingesting `50GB+` of GeoTIFFs into PostGIS, the Python Rasterio engine performs **on-the-fly masking** on raw files mounted as a Docker volume. It scans the directory and selects the intersecting tile based on user polygons.
- **Demo Scope**: ETL is configured for departments **75, 77, 78, 91, 92**.

---

## ⏱️ Time Estimate

- **Core** (Auth, Map, API, DevOps): ~16 hours  
- **Bonus** (Polygon Analysis, LiDAR Data Engineering): ~9 hours  
- **Total**: ~25 hours
