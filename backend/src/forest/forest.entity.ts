import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

// Add an index; otherwise, geographic queries will be slow.
@Entity('forest_parcels')
export class ForestParcel {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ nullable: true })
    ign_id: string;

    @Column({ nullable: true })
    speciesCode: string;

    @Column({ nullable: true })
    speciesName: string;

    @Column({ nullable: true })
    vegetationType: string;

    @Column({ type: 'float', nullable: true })
    areaHa: number;

    // --- Core geographic data ---
    // SRID 4326 represents WGS84 (latitude and longitude), which is the standard for Mapbox.
    // spatialFeatureType: 'MultiPolygon' because forest plots are often irregularly shaped and consist of multiple pieces.
    @Index({ spatial: true })
    @Column({
        type: 'geometry',
        spatialFeatureType: 'MultiPolygon',
        srid: 4326,
    })
    geom: import('geojson').MultiPolygon
}