import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../user.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
    ) {}

    async register(dto: RegisterDto) {
        const existingUser = await this.userRepository.findOne({ where: { email: dto.email } });
        if (existingUser) throw new ConflictException('Email already exists');

        const user = this.userRepository.create(dto);
        await this.userRepository.save(user);

        return this.generateToken(user);
    }

    async login(dto: LoginDto) {
        const user = await this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.email = :email', { email: dto.email })
            .getOne();

        if (!user || !(await bcrypt.compare(dto.password, user.password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return this.generateToken(user);
    }

    async updateUserView(userId: number, view: { lat: number; lng: number; zoom: number }) {
        return await this.userRepository.update(userId, {
            lastLatitude: view.lat,
            lastLongitude: view.lng,
            lastZoom: view.zoom,
        });
    }

    private generateToken(user: User) {
        const payload = { email: user.email, sub: user.id };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                lastView: {
                    lat: user.lastLatitude,
                    lng: user.lastLongitude,
                    zoom: user.lastZoom,
                }
            }
        };
    }
}