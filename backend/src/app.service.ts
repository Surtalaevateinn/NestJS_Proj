import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class AppService {
  constructor(
      @InjectRepository(User)
      private usersRepository: Repository<User>,
  ) {}

  async createInitialUser() {
    const newUser = this.usersRepository.create({
      email: 'admin@symbiose.com',
      firstName: 'Dongshan',
      lastName: 'ZHU',
      role: 'admin'
    });
    return this.usersRepository.save(newUser);
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }
}