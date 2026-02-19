import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execPromise = promisify(exec);

@Injectable()
export class LidarService {
    private readonly logger = new Logger(LidarService.name);

    async getForestStats(geometry?: any) {
        // Use process.cwd() to target the /app directory inside the container
        const lidarDataDir = path.join(process.cwd(), 'data/lidar');
        const scriptPath = path.join(process.cwd(), 'src/lidar/lidar_processor.py');

        try {
            if (!fs.existsSync(lidarDataDir)) {
                return { error: `Directory not found: ${lidarDataDir}` };
            }

            // Get all .tif files in the directory
            const allFiles = fs.readdirSync(lidarDataDir)
                .filter(f => f.toLowerCase().endsWith('.tif'));

            if (allFiles.length === 0) {
                return { error: 'No LiDAR .tif files found in /app/data/lidar' };
            }

            // Convert geometry to string to pass to Python
            const geomArg = geometry ? `'${JSON.stringify(geometry)}'` : "''";

            /**
             * STRATEGY:
             * Instead of hardcoding one file, we pass the directory path to Python.
             * The Python script will use spatial indexing to find the correct tile.
             */
            const { stdout } = await execPromise(`python3 "${scriptPath}" "${lidarDataDir}" ${geomArg}`);

            const result = JSON.parse(stdout);
            return result;
        } catch (error) {
            this.logger.error(`LiDAR Analysis Error: ${error.message}`);
            return { error: 'Failed to process LiDAR multi-tile data', details: error.message };
        }
    }
}