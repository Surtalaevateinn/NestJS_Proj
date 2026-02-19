import rasterio
import numpy as np
import sys
import json
import os
from rasterio.mask import mask
from rasterio.warp import transform_geom
from shapely.geometry import shape, box

def analyze_mnh_from_dir(dir_path, geojson_geometry=None):
    """
    Scans the directory for the correct .tif tile that contains the geometry.
    """
    if not os.path.isdir(dir_path):
        return {"error": f"Directory not found: {dir_path}"}

    tif_files = [f for f in os.listdir(dir_path) if f.lower().endswith('.tif')]

    # If no geometry is provided, we can't decide which tile to use.
    # Defaulting to the first tile for global stats if needed.
    if not geojson_geometry or not geojson_geometry.get('coordinates'):
        return {"error": "No geometry provided to select a tile."}

    # Convert GeoJSON to Shapely object for spatial check
    user_poly = shape(geojson_geometry)
    target_tile = None

    try:
        # Step 1: Find the tile that contains the geometry
        for tif in tif_files:
            file_path = os.path.join(dir_path, tif)
            with rasterio.open(file_path) as src:
                # Convert tile bounds to WGS84 to compare with user_poly
                # (Assuming the TIFF is in Lambert 93, we check the intersection)
                tile_bbox = box(*src.bounds)

                # Transform user_poly to the tile's CRS for accurate intersection
                poly_transformed = shape(transform_geom('EPSG:4326', src.crs, geojson_geometry))

                if tile_bbox.intersects(poly_transformed):
                    target_tile = file_path
                    break

        if not target_tile:
            return {"error": "No LiDAR tile covers the selected area."}

        # Step 2: Perform analysis on the selected tile
        with rasterio.open(target_tile) as src:
            target_geom = transform_geom('EPSG:4326', src.crs, geojson_geometry)
            out_image, out_transform = mask(src, [target_geom], crop=True)
            data = out_image[0]

            nodata = src.nodata
            mask_valid = (data > 0.5)
            if nodata is not None:
                mask_valid = mask_valid & (data != nodata)

            valid_heights = data[mask_valid]

            if valid_heights.size == 0:
                return {
                    "min": 0, "max": 0, "mean": 0,
                    "msg": "Tile found but no canopy detected in mask",
                    "tile": os.path.basename(target_tile)
                }

            return {
                "min": round(float(np.min(valid_heights)), 2),
                "max": round(float(np.max(valid_heights)), 2),
                "mean": round(float(np.mean(valid_heights)), 2),
                "tile": os.path.basename(target_tile),
                "unit": "meters"
            }

    except Exception as e:
        return {"error": f"Spatial search failed: {str(e)}"}

if __name__ == "__main__":
    # args: [script, dir_path, geom_str]
    d_path = sys.argv[1]
    g_str = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] not in ["", "''"] else None

    try:
        geom = json.loads(g_str) if g_str else None
        print(json.dumps(analyze_mnh_from_dir(d_path, geom)))
    except Exception as e:
        print(json.dumps({"error": f"Logic error: {str(e)}"}))