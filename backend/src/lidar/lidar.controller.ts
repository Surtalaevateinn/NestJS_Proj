import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LidarService } from './lidar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('lidar')
@UseGuards(JwtAuthGuard)
export class LidarController {
    constructor(private readonly lidarService: LidarService) {}

    @Post('forest-height')
    async getForestHeight(@Body() geometry: any) {
        // Receive polygon geometry from the front end
        return await this.lidarService.getForestStats(geometry);
    }
}