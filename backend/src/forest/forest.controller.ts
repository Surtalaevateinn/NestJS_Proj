import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForestParcel } from './forest.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('forests')
export class ForestController {
    constructor(
        @InjectRepository(ForestParcel)
        private forestRepo: Repository<ForestParcel>,
    ) {}

    @UseGuards(JwtAuthGuard) // Only those with a valid JWT are allowed to enter.
    @Get()
    async getForests() {
        // Returns GeoJSON format [cite: 22]
        const parcels = await this.forestRepo.find();

        return {
            type: 'FeatureCollection',
            features: parcels.map(p => ({
                type: 'Feature',
                geometry: p.geom, // The database stores data in WGS84 format.
                properties: {
                    id: p.id,
                    ign_id: p.ign_id,
                    species: p.speciesName ? p.speciesName.trim() : 'Unknown',
                    // area: p.areaHa,
                    area: Number(p.areaHa),
                }
            }))
        };
    }
}