import { createConnection, Repository } from 'typeorm';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import * as path from 'path';
import * as fs from 'fs';
import { ForestParcel } from '../forest/forest.entity';
import { User } from '../user.entity';

interface IBDForetProperties {
    CODE_ESS: string;
    ESSENCE: string;
    FORMATION: string;
    SUPERFICIE: number;
    ID: string;
}

const LAMBERT_93 = '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS_84 = 'EPSG:4326';

// Helper function to recursively find all FORMATION_VEGETALE.shp files
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

    // Explicitly using encoding to avoid the character mess (ê -> Ãª)
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'iso-8859-1' });
    let fileCount = 0;

    while (true) {
        const result = await source.read();
        if (result.done) break;

        const feature = result.value as GeoJSON.Feature<GeoJSON.Geometry, IBDForetProperties>;
        const props = feature.properties;
        const geometry = feature.geometry;

        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            const coords = JSON.parse(JSON.stringify(geometry.coordinates));

            const transformRing = (ring: any[]) =>
                ring.map((point: [number, number]) => proj4(LAMBERT_93, WGS_84, point));

            const transformedCoords = geometry.type === 'Polygon'
                ? coords.map(transformRing)
                : coords.map((polygon: any[]) => polygon.map(transformRing));

            const parcel = repo.create({
                ign_id: props.ID,
                speciesCode: props.CODE_ESS,
                speciesName: props.ESSENCE,
                vegetationType: props.FORMATION,
                areaHa: props.SUPERFICIE,
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

    // Optional: Clear old data to avoid duplicates if you are re-running everything
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

    console.log(`\n🎉 Final Success: Total ${totalCount} forest parcels imported.`);
    await connection.close();
}

run().catch(console.error);