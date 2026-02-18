import { Controller, Get, Post, Body, Query, UseGuards, Param } from '@nestjs/common';
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


    @UseGuards(JwtAuthGuard)
    @Get('communes/:deptCode')
    async getCommunes(@Param('deptCode') deptCode: string) {
        // Fetch distinct communeName instead of vegetationType for better UX
        const results = await this.forestRepo
            .createQueryBuilder('forest')
            .select('DISTINCT forest.communeName', 'name')
            .where('forest.deptCode = :deptCode', { deptCode })
            .andWhere('forest.communeName IS NOT NULL')
            .orderBy('name', 'ASC')
            .getRawMany();

        // Ensure we return the raw many results which is already [{name: '...'}, ...]
        return results;
    }

    @UseGuards(JwtAuthGuard)
    @Post('analyze')
    async analyzePolygon(@Body() geometry: any) {
        // Convert input GeoJSON to a PostGIS geometry string
        const inputGeoJson = JSON.stringify(geometry);

        // 1. Calculate Total Area of the drawn polygon (in Hectares)
        // We cast to geography to get accurate meters, then divide by 10,000
        const totalSizeQuery = `
            SELECT ST_Area(ST_GeomFromGeoJSON($1)::geography) / 10000 as "totalHa"
        `;
        const sizeResult = await this.forestRepo.query(totalSizeQuery, [inputGeoJson]);
        const totalUserArea = sizeResult[0].totalHa;

        // 2. Intersect with Forests to get Species Distribution
        // This is the magic: ST_Intersection calculates the exact overlap shape
        const speciesStats = await this.forestRepo.query(`
            SELECT 
                "speciesName",
                SUM(ST_Area(ST_Intersection(geom, ST_GeomFromGeoJSON($1))::geography)) / 10000 as "areaHa"
            FROM forest_parcels
            WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
            GROUP BY "speciesName"
            ORDER BY "areaHa" DESC
        `, [inputGeoJson]);

        // 3. Get intersecting Commune/Zone names
        const communes = await this.forestRepo.query(`
            SELECT DISTINCT "communeName"
            FROM forest_parcels
            WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1))
            LIMIT 5
        `, [inputGeoJson]);

        return {
            totalAnalysisArea: totalUserArea,
            species: speciesStats.map((s: any) => ({
                name: s.speciesName,
                area: parseFloat(s.areaHa)
            })),
            communes: communes.map((c: any) => c.communeName)
        };
    }

    @UseGuards(JwtAuthGuard)
    @Get('commune-location')
    async getCommuneLocation(@Query('name') name: string, @Query('dept') dept: string) {
        const result = await this.forestRepo
            .createQueryBuilder('forest')
            .select('ST_AsGeoJSON(ST_Centroid(ST_Collect(forest.geom)))', 'center')
            .where('forest.communeName = :name', { name })
            .andWhere('forest.deptCode = :dept', { dept })
            .getRawOne();

        if (result && result.center) {
            const center = JSON.parse(result.center);
            return {
                lng: center.coordinates[0],
                lat: center.coordinates[1]
            };
        }
        return null;
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async getForests(
        @Query('minLng') minLng?: string,
        @Query('minLat') minLat?: string,
        @Query('maxLng') maxLng?: string,
        @Query('maxLat') maxLat?: string,
    ) {
        let queryBuilder = this.forestRepo.createQueryBuilder('forest');

        // Apply spatial filtering if boundary parameters are present [cite: 17, 22]
        if (minLng && minLat && maxLng && maxLat) {
            queryBuilder = queryBuilder.where(
                `ST_Within(forest.geom, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326))`,
                {
                    minLng: parseFloat(minLng),
                    minLat: parseFloat(minLat),
                    maxLng: parseFloat(maxLng),
                    maxLat: parseFloat(maxLat),
                },
            );
        }

        const parcels = await queryBuilder.getMany();

        return {
            type: 'FeatureCollection',
            features: parcels.map(p => ({
                type: 'Feature',
                geometry: p.geom,
                properties: {
                    id: p.id,
                    ign_id: p.ign_id,
                    species: p.speciesName ? p.speciesName.trim() : 'Unknown',
                    area: Number(p.areaHa),
                }
            }))
        };
    }
}