import { createConnection, Repository, Connection } from 'typeorm';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import * as path from 'path';
import * as fs from 'fs';
import { ForestParcel } from '../forest/forest.entity';
import { User } from '../user.entity';

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

async function importFile(shpPath: string, repo: Repository<ForestParcel>) {
    const dbfPath = shpPath.replace('.shp', '.dbf');
    console.log(`📦 Processing Departmental Data: ${shpPath}`);
    const pathParts = shpPath.split('/');
    const deptFolder = pathParts.find(p => p.includes('_D0'));
    const extractedDept = deptFolder ? deptFolder.split('_D0')[1].substring(0, 2) : undefined;

    // Still using iso-8859-1 for initial read, SQL post-processing will fix any leftovers
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'iso-8859-1' });
    let fileCount = 0;

    while (true) {
        const result = await source.read();
        if (result.done) break;

        const feature = result.value as GeoJSON.Feature<GeoJSON.Geometry, IBDForetProperties>;
        const props = feature.properties;
        const geometry = feature.geometry;
        // Automatically parse province codes (extracted from ID, e.g., D075 -> 75)
        const deptCode = props.ID ? props.ID.substring(2, 4) : undefined;

        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = JSON.parse(JSON.stringify(geometry.coordinates));

            const transformRing = (ring: any[]) =>
                ring.map((point: [number, number]) => proj4(LAMBERT_93, WGS_84, point));

            const transformedCoords = geometry.type === 'Polygon'
                ? coords.map(transformRing)
                : coords.map((polygon: any[]) => polygon.map(transformRing));

            const parcel = repo.create({
                ign_id: props.ID,
                deptCode: extractedDept || (props.ID ? props.ID.substring(2, 4) : undefined),
                speciesCode: props.CODE_ESS || undefined,
                speciesName: props.ESSENCE || undefined,
                vegetationType: props.TFV || props.FORMATION || 'Unknown',
                areaHa: Number(props.SUPERFICIE) || 0, // This might be null or 0 in some datasets
                geom: {
                    type: 'MultiPolygon',
                    coordinates: geometry.type === 'Polygon' ? [transformedCoords] : transformedCoords
                }
            });

            await repo.save(parcel);
            fileCount++;
        }
    }
    return fileCount;
}

/**
 * Executes Post-Processing SQL to fix encoding issues and calculate missing areas
 */
async function postProcessData(connection: Connection) {
    console.log('🛠 Starting Post-Processing SQL fixes...');

    const queries = [
        // === 1. Basic Encoding Fixes===
        // Restoration of specific tree species such as Chêne, Hêtre, and Mélèze
        `UPDATE forest_parcels SET "speciesName" = 'Chêne' WHERE "speciesName" LIKE 'ChÃ%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Hêtre' WHERE "speciesName" LIKE 'HÃªtre';`,
        `UPDATE forest_parcels SET "speciesName" = 'Mélèze' WHERE "speciesName" LIKE 'MÃ%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Conifères' WHERE "speciesName" LIKE 'ConifÃ¨res';`,
        `UPDATE forest_parcels SET "speciesName" = 'Sapin, épicéa' WHERE "speciesName" LIKE 'Sapin, %';`,
        `UPDATE forest_parcels SET "speciesName" = 'Pins mélangés' WHERE "speciesName" LIKE 'Pins m%l%';`,

        // Fix common garbled character variations (é, ê, î)
        `UPDATE forest_parcels SET "speciesName" = REPLACE(REPLACE(REPLACE("speciesName", 'Ã©', 'é'), 'Ãª', 'ê'), 'Ã®', 'î');`,
        `UPDATE forest_parcels SET "vegetationType" = REPLACE(REPLACE(REPLACE("vegetationType", 'Ã©', 'é'), 'Ãª', 'ê'), 'Ã®', 'î');`,

        // === 2. Species Normalization ===
        `UPDATE forest_parcels SET "speciesName" = 'Sapin, épicéa' WHERE "speciesName" LIKE 'Sapin%';`,
        `UPDATE forest_parcels SET "speciesName" = 'Pins mélangés' WHERE "speciesName" LIKE 'Pins m%l%';`,
        `UPDATE forest_parcels SET "speciesCode" = 'MIX' WHERE "speciesCode" IS NULL AND "speciesName" LIKE '%Mixte%';`,

        // === 3. Hierarchy & Admin Fixes ===
        // Ensure the deptCode is accurate (truncate from ign_id: D075 -> 75).
        `UPDATE forest_parcels SET "deptCode" = SUBSTRING("ign_id", 3, 2) WHERE "deptCode" = 'RE' OR "deptCode" IS NULL;`,

        // Generate the final communeName for display in the front-end dropdown list.
        // [Tree species name] - [Vegetation composition type], for example, "Chêne - Forêt fermée de feuillus purs"
        `UPDATE forest_parcels
         SET "communeName" = CONCAT(COALESCE("speciesName", 'Unknown'), ' - ', COALESCE("vegetationType", 'Zone'))
         WHERE "deptCode" IS NOT NULL;`,

        // === 4. Spatial Data Completion ===
        // Calculate the actual area (square meters -> hectares) using PostGIS.
        `UPDATE forest_parcels
         SET "areaHa" = ST_Area(geom::geography) / 10000
         WHERE "areaHa" IS NULL OR "areaHa" = 0;`
    ];

    for (const sql of queries) {
        try {
            await connection.query(sql);
        } catch (err) {
            console.error(`Error executing SQL: ${sql}`, err);
        }
    }
    console.log('✅ Post-Processing complete.');
}

async function run() {
    console.log('🚀 Starting Multi-Department Forest Data Ingestion...');

    const connection = await createConnection({
        type: 'postgres',
        host: process.env.DATABASE_HOST || 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'postgres',
        database: 'local',
        entities: [User, ForestParcel],
        synchronize: true,
    });

    const forestRepo = connection.getRepository(ForestParcel);

    // Optional: Clear old data
    // await forestRepo.clear();

    const DATA_BASE_PATH = '/app/data/BDV2';
    const allShpFiles = findShpFiles(DATA_BASE_PATH);

    console.log(`🔍 Found ${allShpFiles.length} shapefiles to import.`);

    let totalCount = 0;
    for (const shp of allShpFiles) {
        const count = await importFile(shp, forestRepo);
        totalCount += count;
        console.log(`✅ Finished ${shp}: ${count} parcels added.`);
    }

    // --- EXECUTE FIXES BEFORE CLOSING ---
    await postProcessData(connection);

    console.log(`\n🎉 Final Success: Total ${totalCount} forest parcels synchronized and repaired.`);
    await connection.close();
}

run().catch(console.error);