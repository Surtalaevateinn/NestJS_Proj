🌌 Symbiose OS: High-Fidelity GIS Ecosystem
Symbiose OS is a professional-grade, containerized full-stack ecosystem designed for high-precision geospatial visualization and secure data management. Engineered with a NestJS backbone and a Next.js neural interface, this system transforms raw forest inventory data into an interactive, encrypted intelligence terminal.

🛠 Advanced Tech Stack
Frontend: Next.js 15 (App Router, TypeScript, Tailwind CSS)

Backend: NestJS (Modular Architecture, TypeORM, Passport JWT)

Spatial Database: PostgreSQL 15 + PostGIS (Geospatial Persistence)

Mapping Engine: Mapbox GL JS (High-performance vector rendering)

DevOps: Docker Compose (Multi-stage builds, Container Orchestration)

🏗 System Architecture
The project utilizes a decoupled Monorepo structure, synchronized through a secure Docker bridge network.

Persistence Layer: PostgreSQL/PostGIS handles complex geometry types, utilizing MultiPolygon schemas for land parcels.

Service Layer: A modular NestJS API providing strict DTO validation, JWT-based "Gatekeeper" authentication, and spatial data streaming.

Presentation Layer: A "Symbiose OS" themed Next.js interface featuring real-time state persistence (Lat/Lng/Zoom) and dynamic Mapbox layers.

🧪 Key Features & Accomplishments
🔒 Secure Access Control
Implemented a robust JWT (JSON Web Token) strategy for stateless authentication.

Integrated Bcrypt password hashing with zero-knowledge storage in the database.

🗺 Spatial Data Engineering
ETL Pipeline: Developed a recursive ingestion script to process .shp and .dbf files for multiple departments (D075, D092, etc.).

Coordinate Transformation: Automated the high-precision translation from Lambert-93 (EPSG:2154) to WGS-84 (EPSG:4326) for global compatibility.

🧠 Real-Time State Persistence
The system monitors user interaction through moveend listeners, persisting the map viewpoint to the PostgreSQL user profile in real-time.

Users return to their exact "Observer Coordinate" upon re-authentication.

🎨 Visual Identity: "The Observer"
The dashboard is designed with a "Cold & Minimalist" aesthetic, reflecting a high-dimensional control terminal:

Primary Palette: Slate-950 (Deep Void Background), Cyan-500 (Neural Accents).

Interface: Glassmorphism effects with backdrop-blur-xl and animated "Grid & Glow" backgrounds.

Visualizations: Custom forest layers using Match expressions to color-code species (Oak, Beech, Pine) dynamically.

🚀 Quick Start (Dockerized)
Ensure you have Docker Desktop and Mapbox Access Token ready.

Clone & Configure

Bash
git clone https://github.com/Surtalaevateinn/NestJS_Proj.git
cd NestJS_Proj
Add your NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to docker-compose.yml.

Infrastructure Initialization

Bash
docker-compose up --build -d
Data Ingestion

Bash
docker exec -it nest_backend npx ts-node src/scripts/seed-forest.ts
Access Terminal

Frontend: http://localhost:3001

Backend API: http://localhost:3000

📈 Roadmap
[x] Full-Stack Containerization

[x] PostGIS Spatial Integration

[x] JWT Authentication & Authorization

[x] Real-time Map State Persistence

[ ] Advanced Spatial Queries (Bounding Box Filtering)

[ ] Internationalization (i18n) for Global Markets

[ ] Swagger API Documentation Integration