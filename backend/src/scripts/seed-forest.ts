import { createConnection } from 'typeorm';
import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import * as path from 'path';
import { ForestParcel } from '../forest/forest.entity';
import { User } from '../user.entity';

// IGN interface
interface IBDForetProperties {
    CODE_ESS: string;
    ESSENCE: string;
    FORMATION: string;
    SUPERFICIE: number;
    ID: string;
}

const LAMBERT_93 = '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS_84 = 'EPSG:4326';

async function run() {
    console.log('🚀 Starting Forest Data Ingestion...');

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

    const DATA_BASE_PATH = '/app/data/BDV2';

    const shpPath = path.join(
        DATA_BASE_PATH,
        'BDFORET_2-0__SHP_LAMB93_D075_2018-01-15/BDFORET/1_DONNEES_LIVRAISON/BDF_2-0_SHP_LAMB93_D075/FORMATION_VEGETALE.shp'
    );
    const dbfPath = path.join(
        DATA_BASE_PATH,
        'BDFORET_2-0__SHP_LAMB93_D075_2018-01-15/BDFORET/1_DONNEES_LIVRAISON/BDF_2-0_SHP_LAMB93_D075/FORMATION_VEGETALE.dbf'
    );

    console.log(`Checking path: ${shpPath}`);
    const source = await shapefile.open(shpPath, dbfPath);
    let count = 0;

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

            const parcel = forestRepo.create({
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

            await forestRepo.save(parcel);
            count++;
            if (count % 100 === 0) console.log(`Injected: ${count} parcels`);
        }
    }

    console.log(`✅ Success: ${count} forest parcels imported.`);
    await connection.close();
}

run().catch(console.error);