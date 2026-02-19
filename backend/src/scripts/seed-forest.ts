import { createConnection, Repository, Connection } from 'typeorm';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import * as path from 'path';
import * as fs from 'fs';

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';

import { ForestParcel } from '../forest/forest.entity';
import { User } from '../user.entity';
import { CadastreParcel } from '../forest/cadastre.entity';

interface IBDForetProperties {
    CODE_ESS: string;
    ESSENCE: string;
    TFV: string;
    FORMATION: string;
    SUPERFICIE: number;
    ID: string;
}

const LAMBERT_93 = '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS_84 = 'EPSG:4326';

/**
 * Recursively find all FORMATION_VEGETALE.shp files in the directory tree
 */
function findShpFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findShpFiles(filePath, fileList);
        } else if (file === 'FORMATION_VEGETALE.shp') {
            fileList.push(filePath);
        }
    });
    return fileList;
}

/**
 * Recursively find all *-parcelles.json files in the given directory
 */
function findJsonFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;

    const files = fs.readdirSync(dir);
    files.forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findJsonFiles(filePath, fileList);
        } else if (file.endsWith('-parcelles.json')) {
            fileList.push(filePath);
        }
    });
    return fileList;
}

/**
 * Import forest parcels from Shapefile (Lambert-93 → WGS84 transformation)
 */
async function importForestShapefile(shpPath: string, repo: Repository<ForestParcel>) {
    const dbfPath = shpPath.replace('.shp', '.dbf');
    console.log(`📦 Processing Departmental Data: ${shpPath}`);

    const pathParts = shpPath.split('/');
    const deptFolder = pathParts.find(p => p.includes('_D0'));
    const extractedDept = deptFolder ? deptFolder.split('_D0')[1].substring(0, 2) : undefined;

    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'iso-8859-1' });

    let fileCount = 0;

    while (true) {
        const result = await source.read();
        if (result.done) break;

        const feature = result.value as GeoJSON.Feature<GeoJSON.Geometry, IBDForetProperties>;
        const props = feature.properties;
        const geometry = feature.geometry;

        const deptCode = props.ID ? props.ID.substring(2, 4) : undefined;

        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = JSON.parse(JSON.stringify(geometry.coordinates));

            const transformRing = (ring: any[]) =>
                ring.map((point: [number, number]) => proj4(LAMBERT_93, WGS_84, point));

            const transformedCoords =
                geometry.type === 'Polygon'
                    ? coords.map(transformRing)
                    : coords.map((polygon: any[]) => polygon.map(transformRing));

            const parcel = repo.create({
                ign_id: props.ID,
                deptCode: extractedDept || deptCode,
                speciesCode: props.CODE_ESS || undefined,
                speciesName: props.ESSENCE || undefined,
                vegetationType: props.TFV || props.FORMATION || 'Unknown',
                areaHa: Number(props.SUPERFICIE) || 0,
                geom: {
                    type: 'MultiPolygon',
                    coordinates: geometry.type === 'Polygon' ? [transformedCoords] : transformedCoords,
                },
            });

            await repo.save(parcel);
            fileCount++;
        }
    }

    return fileCount;
}

/**
 * Stream large GeoJSON cadastre files using stream-json to avoid memory explosion
 * Processes features one by one and saves in batches
 */
async function importCadastreJson(jsonPath: string, repo: Repository<CadastreParcel>): Promise<number> {
    console.log(`📦 Streaming Cadastre: ${path.basename(jsonPath)}`);

    const filename = path.basename(jsonPath);
    const deptMatch = filename.match(/cadastre[-_](\d{2,3})/i);
    const deptCode = deptMatch ? deptMatch[1] : '??';

    let parcelsToSave: CadastreParcel[] = [];
    let totalCount = 0;

    // Build streaming pipeline: file → JSON parser → pick features array → stream objects
    const pipeline = chain([
        fs.createReadStream(jsonPath),
        parser(),
        pick({ filter: 'features' }),
        streamArray(),
    ]);

    return new Promise<number>((resolve, reject) => {
        pipeline.on('data', async ({ value: feature }: { value: GeoJSON.Feature }) => {
            if (!feature?.geometry || feature.geometry.type !== 'Polygon') return;

            const props = feature.properties || {};

            const parcel = new CadastreParcel();
            parcel.deptCode = deptCode;
            parcel.label =
                props.idu ||
                props.IDU ||
                props.parcelle ||
                `${props.section || ''} ${props.numero || ''}`.trim() ||
                '??';

            parcel.geom = feature.geometry;

            parcelsToSave.push(parcel);

            // Pause stream and save batch when reaching threshold
            if (parcelsToSave.length >= 1000) {
                pipeline.pause(); // prevent memory buildup

                try {
                    await repo.save(parcelsToSave);
                    totalCount += parcelsToSave.length;
                    console.log(`  → Saved batch of ${parcelsToSave.length} parcels (total: ${totalCount})`);
                } catch (err) {
                    console.error('Batch save failed:', err);
                }

                parcelsToSave = [];
                pipeline.resume(); // continue streaming
            }
        });

        pipeline.on('end', async () => {
            // Save remaining parcels
            if (parcelsToSave.length > 0) {
                try {
                    await repo.save(parcelsToSave);
                    totalCount += parcelsToSave.length;
                    console.log(`  → Saved final batch of ${parcelsToSave.length} parcels`);
                } catch (err) {
                    console.error('Final batch save failed:', err);
                }
            }

            console.log(`✅ Success: Imported ${totalCount} cadastre parcels from ${filename}`);
            resolve(totalCount);
        });

        pipeline.on('error', (err) => {
            console.error(`❌ Stream Error on ${filename}:`, err.message);
            reject(err);
        });
    });
}

/**
 * Run post-processing SQL queries to fix encoding and compute accurate areas
 */
async function postProcessData(connection: Connection) {
    console.log('🛠 Starting Post-Processing SQL fixes...');

    const queries = [
        // 1. Encoding fixes for common garbled characters
        `UPDATE forest_parcels SET "speciesName" = 'Chêne' WHERE "speciesName" LIKE 'ChÃ%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Hêtre' WHERE "speciesName" LIKE 'HÃªtre';`,
        `UPDATE forest_parcels SET "speciesName" = 'Mélèze' WHERE "speciesName" LIKE 'MÃ%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Conifères' WHERE "speciesName" LIKE 'ConifÃ¨res';`,
        `UPDATE forest_parcels SET "speciesName" = 'Sapin, épicéa' WHERE "speciesName" LIKE 'Sapin, %';`,
        `UPDATE forest_parcels SET "speciesName" = 'Pins mélangés' WHERE "speciesName" LIKE 'Pins m%l%';`,
        `UPDATE forest_parcels SET "speciesName" = REPLACE(REPLACE(REPLACE("speciesName", 'Ã©', 'é'), 'Ãª', 'ê'), 'Ã®', 'î');`,
        `UPDATE forest_parcels SET "vegetationType" = REPLACE(REPLACE(REPLACE("vegetationType", 'Ã©', 'é'), 'Ãª', 'ê'), 'Ã®', 'î');`,

        // 2. Species name normalization
        `UPDATE forest_parcels SET "speciesName" = 'Sapin, épicéa' WHERE "speciesName" LIKE 'Sapin%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Pins mélangés' WHERE "speciesName" LIKE 'Pins m%l%';`,
        `UPDATE forest_parcels SET "speciesCode" = 'MIX' WHERE "speciesCode" IS NULL AND "speciesName" LIKE '%Mixte%';`,

        // 3. Department code & display name fixes
        `UPDATE forest_parcels SET "deptCode" = SUBSTRING("ign_id", 3, 2) WHERE "deptCode" = 'RE' OR "deptCode" IS NULL;`,
        `UPDATE forest_parcels SET "communeName" = CONCAT(COALESCE("speciesName", 'Unknown'), ' - ', COALESCE("vegetationType", 'Zone')) WHERE "deptCode" IS NOT NULL;`,

        // 4. Calculate accurate area using PostGIS geography
        `UPDATE forest_parcels SET "areaHa" = ST_Area(geom::geography) / 10000 WHERE "areaHa" IS NULL OR "areaHa" = 0;`,
    ];

    for (const sql of queries) {
        try {
            await connection.query(sql);
        } catch (err) {
            console.error(`Error executing SQL: ${sql.slice(0, 60)}...`, err);
        }
    }

    console.log('✅ Post-Processing complete.');
}

/**
 * Main execution: import forests → import cadastre → post-process
 */
async function run() {
    console.log('🚀 Starting Multi-Department Forest & Cadastre Data Ingestion...');

    const connection = await createConnection({
        type: 'postgres',
        host: process.env.DATABASE_HOST || 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'local',
        entities: [User, ForestParcel, CadastreParcel],
        synchronize: true,
    });

    const forestRepo = connection.getRepository(ForestParcel);
    const cadastreRepo = connection.getRepository(CadastreParcel);

    // ─── Forest Shapefiles ───
    const DATA_BASE_PATH = '/app/data/BDV2';
    const allShpFiles = findShpFiles(DATA_BASE_PATH);
    console.log(`🔍 Found ${allShpFiles.length} forest shapefiles to import.`);

    let totalForestCount = 0;
    for (const shp of allShpFiles) {
        const count = await importForestShapefile(shp, forestRepo);
        totalForestCount += count;
        console.log(`✅ Finished ${shp}: ${count} forest parcels added.`);
    }

    // ─── Cadastre GeoJSON (streaming) ───
    const CADASTRE_BASE_PATH = '/app/data/CPL';
    const jsonFiles = findJsonFiles(CADASTRE_BASE_PATH);
    console.log(`🔍 Found ${jsonFiles.length} cadastre JSON files.`);

    let totalCadastreCount = 0;
    for (const jsonPath of jsonFiles) {
        const count = await importCadastreJson(jsonPath, cadastreRepo);
        totalCadastreCount += count;
    }

    // ─── Post-processing ───
    await postProcessData(connection);

    console.log(
        `\n🎉 Final Success: ${totalForestCount} forest parcels + ${totalCadastreCount} cadastre parcels synchronized and repaired.`
    );

    await connection.close();
}

run().catch(console.error);