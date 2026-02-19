import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import type { Geometry } from 'geojson';

@Entity('cadastre_parcels')
export class CadastreParcel {
    @PrimaryGeneratedColumn()
    id: number;

    // Store cadastral numbers, such as "Section A n°12"
    @Column({ nullable: true })
    label: string;

    // Store administrative region codes for filtering.
    @Column({ nullable: true })
    deptCode: string;

    // Spatial Index Geometry Column
    @Index({ spatial: true })
    @Column({
        type: 'geometry',
        spatialFeatureType: 'Polygon',
        srid: 4326,
        nullable: true,
    })
    geom: Geometry;
}