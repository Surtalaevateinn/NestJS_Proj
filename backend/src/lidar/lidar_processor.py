import rasterio
import numpy as np
import sys
import json
import os

def analyze_mnh(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File not found at path: {file_path}"}

    try:
        with rasterio.open(file_path) as src:
            # Read the first band (altitude data).
            data = src.read(1)

            # Retrieve the NoData value from the metadata (usually -99999.0).
            nodata = src.nodata

            # Filter out NoData and abnormally negative values, and only retain the true vegetation height.
            mask = (data > 0)
            if nodata is not None:
                mask = mask & (data != nodata)

            valid_heights = data[mask]

            if valid_heights.size == 0:
                return {"min": 0, "max": 0, "mean": 0, "count": 0, "msg": "No vegetation data in this area"}

            return {
                "min": round(float(np.min(valid_heights)), 2),
                "max": round(float(np.max(valid_heights)), 2),
                "mean": round(float(np.mean(valid_heights)), 2),
                "count": int(valid_heights.size),
                "unit": "meters",
                "file": os.path.basename(file_path)
            }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing file path argument"}))
    else:
        print(json.dumps(analyze_mnh(sys.argv[1])))