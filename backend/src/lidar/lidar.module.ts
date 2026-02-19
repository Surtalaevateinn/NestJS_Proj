import { Module } from '@nestjs/common';
import { LidarController } from './lidar.controller';
import { LidarService } from './lidar.service';

@Module({
    controllers: [LidarController],
    providers: [LidarService],
    // exports: [LidarService]
})
export class LidarModule {}