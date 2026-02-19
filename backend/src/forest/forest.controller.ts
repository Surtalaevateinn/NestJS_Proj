import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Param,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForestParcel } from './forest.entity';
import { CadastreParcel } from './cadastre.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('forests')
export class ForestController {
    constructor(
        @InjectRepository(ForestParcel)
        private forestRepo: Repository<ForestParcel>,

        @InjectRepository(CadastreParcel)
        private cadastreRepo: Repository<CadastreParcel>,
    ) {}

    /**
     * Retrieve distinct commune/zone names for a given department
     * (Used to populate frontend dropdown or filter options)
     */
    @UseGuards(JwtAuthGuard)
    @Get('communes/:deptCode')
    async getCommunes(@Param('deptCode') deptCode: string) {
        const results = await this.forestRepo
            .createQueryBuilder('forest')
            .select('DISTINCT forest.communeName', 'name')
            .where('forest.deptCode = :deptCode', { deptCode })
            .andWhere('forest.communeName IS NOT NULL')
            .orderBy('name', 'ASC')
            .getRawMany();

        return results;
    }

    /**
     * Analyze user-drawn polygon:
     * - Calculate forest species distribution (area in hectares + percentage)
     * - Find intersecting cadastre parcels
     * - Find intersecting administrative zones (communeName)  ← Fixed / Added
     */
    @UseGuards(JwtAuthGuard)
    @Post('analyze')
    async analyzePolygon(@Body() geometry: any) {
        // Convert the incoming GeoJSON geometry (usually Polygon/MultiPolygon) to string
        const inputGeoJson = JSON.stringify(geometry);

        // ───────────────────────────────────────────────
        // 1. Forest species analysis – area per species
        // ───────────────────────────────────────────────
        const forestQuery = this.forestRepo.query(
            `
      SELECT 
        "speciesName" AS name,
        SUM(ST_Area(ST_Intersection(geom, ST_GeomFromGeoJSON($1)::geometry)::geography)) / 10000 AS area_ha
      FROM forest_parcels
      WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1)::geometry)
      GROUP BY "speciesName"
      ORDER BY area_ha DESC
      `,
            [inputGeoJson],
        );

        // ───────────────────────────────────────────────
        // 2. Cadastre parcels intersecting the drawn polygon
        // ───────────────────────────────────────────────
        const cadastreQuery = this.cadastreRepo.query(
            `
      SELECT DISTINCT label
      FROM cadastre_parcels
      WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1)::geometry)
      ORDER BY label
      LIMIT 30
      `,
            [inputGeoJson],
        );

        // ───────────────────────────────────────────────
        // 3. Distinct commune/zone names intersecting the polygon
        //    (Administrative zones / fixed part)
        // ───────────────────────────────────────────────
        const communeQuery = this.forestRepo.query(
            `
      SELECT DISTINCT "communeName"
      FROM forest_parcels
      WHERE ST_Intersects(geom, ST_GeomFromGeoJSON($1)::geometry)
        AND "communeName" IS NOT NULL
      ORDER BY "communeName"
      LIMIT 5
      `,
            [inputGeoJson],
        );

        // Run all three queries concurrently
        const [forestResults, cadastreResults, communeResults] = await Promise.all([
            forestQuery,
            cadastreQuery,
            communeQuery,
        ]);

        // Calculate total analyzed area (based on forest parcels – most reliable)
        const totalAreaHa =
            forestResults.reduce((sum: number, row: any) => sum + parseFloat(row.area_ha || 0), 0) || 0;

        // Format species data with percentage
        const speciesDistribution = forestResults.map((row: any) => {
            const area = parseFloat(row.area_ha) || 0;
            return {
                name: row.name || 'Unknown',
                area: Math.round(area * 100) / 100, // 2 decimal places
                percentage: totalAreaHa > 0 ? Math.round((area / totalAreaHa) * 1000) / 10 : 0, // 1 decimal place
            };
        });

        // Clean cadastre parcel labels
        const parcels = cadastreResults
            .map((r: any) => r.label?.trim() || 'Unknown Parcel')
            .filter(Boolean);

        // Clean commune/zone names
        const communes = communeResults
            .map((c: any) => c.communeName?.trim())
            .filter(Boolean);

        // Final response object
        return {
            totalAnalysisArea: Math.round(totalAreaHa * 100) / 100,
            species: speciesDistribution,
            parcels,      // list of intersecting cadastral parcel identifiers
            communes,     // list of intersecting administrative zones / commune names
        };
    }

    /**
     * Get the centroid of all parcels matching a specific communeName + department
     * (Used to center the map when user selects a zone from dropdown)
     */
    @UseGuards(JwtAuthGuard)
    @Get('commune-location')
    async getCommuneLocation(
        @Query('name') name: string,
        @Query('dept') dept: string,
    ) {
        const result = await this.forestRepo
            .createQueryBuilder('forest')
            .select('ST_AsGeoJSON(ST_Centroid(ST_Collect(forest.geom)))', 'center')
            .where('forest.communeName = :name', { name })
            .andWhere('forest.deptCode = :dept', { dept })
            .getRawOne();

        if (result?.center) {
            const center = JSON.parse(result.center);
            return {
                lng: center.coordinates[0],
                lat: center.coordinates[1],
            };
        }

        return null;
    }

    /**
     * Retrieve forest parcels inside the current map viewport (bounding box)
     * (Used for dynamic loading when panning/zooming)
     */
    @UseGuards(JwtAuthGuard)
    @Get()
    async getForests(
        @Query('minLng') minLng?: string,
        @Query('minLat') minLat?: string,
        @Query('maxLng') maxLng?: string,
        @Query('maxLat') maxLat?: string,
    ) {
        let queryBuilder = this.forestRepo.createQueryBuilder('forest');

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
            features: parcels.map((p) => ({
                type: 'Feature',
                geometry: p.geom,
                properties: {
                    id: p.id,
                    ign_id: p.ign_id,
                    species: p.speciesName ? p.speciesName.trim() : 'Unknown',
                    area: Number(p.areaHa),
                },
            })),
        };
    }
}