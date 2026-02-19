import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execPromise = promisify(exec);

@Injectable()
export class LidarService {
    private readonly logger = new Logger(LidarService.name);

    async getForestStats() {
        const fileName = 'LHD_FXX_0651_6863_MNH_O_0M50_LAMB93_IGN69.tif';
        const filePath = path.join(process.cwd(), 'data/lidar', fileName);
        // const scriptPath = path.join(__dirname, 'lidar_processor.py');
        const scriptPath = path.join(process.cwd(), 'src/lidar/lidar_processor.py');

        try {
            const { stdout } = await execPromise(`python3 ${scriptPath} ${filePath}`);
            return JSON.parse(stdout);
        } catch (error) {
            this.logger.error(`LiDAR Python Execution Error: ${error.message}`);
            throw new Error('Failed to analyze LiDAR TIFF');
        }
    }
}