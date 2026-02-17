import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();//Enable CORS (essential for front-end connections)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Automatically filter out undefined properties in DTOs
    transform: true, // Automatic type conversion
  }));

  // Configure Swagger documentation
  const config = new DocumentBuilder()
      .setTitle('Forest BD Viewer API')
      .setDescription('Symbiose Fullstack Technical Test')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
