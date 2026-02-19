FROM node:22-alpine

# Install Python and handle the system-level dependency (GDAL) required for GeoTIFF.
RUN apk add --no-cache \
    python3 \
    py3-pip \
    gdal-dev \
    g++ \
    make \
    python3-dev

# Create a virtual environment and install rasterio
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir rasterio numpy

WORKDIR /app

# Node.js
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm i

COPY . .
RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start:dev"]