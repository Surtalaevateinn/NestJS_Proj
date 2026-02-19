import { Controller, Get, UseGuards } from '@nestjs/common';
import { LidarService } from './lidar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('lidar')
@UseGuards(JwtAuthGuard)
export class LidarController {
    constructor(private readonly lidarService: LidarService) {}

    @Get('forest-height')
    async getForestHeight() {
        return await this.lidarService.getForestStats();
    }
}