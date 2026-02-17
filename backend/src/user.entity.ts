import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column({ select: false }) // Password is not returned by default.
    password: string;

    @Column({ nullable: true })
    firstName: string;

    @Column({ nullable: true })
    lastName: string;

    @Column({ default: 'user' }) // 'admin' | 'user'
    role: string;

    // --- GIS Status Memory Core Fields ---

    @Column({ type: 'float', default: 48.8566 }) // Default Paris latitude
    lastLatitude: number;

    @Column({ type: 'float', default: 2.3522 }) // Default Paris longitude
    lastLongitude: number;

    @Column({ type: 'float', default: 10 }) // Default scaling level
    lastZoom: number;

    // Storing complex filtering conditions
    @Column({ type: 'jsonb', nullable: true })
    lastFilters: Record<string, any>;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}