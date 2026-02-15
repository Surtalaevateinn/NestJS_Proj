import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('users')
  getUsers() {
    return this.appService.findAll();
  }

  @Post('init-user')
  initUser() {
    return this.appService.createInitialUser();
  }
}