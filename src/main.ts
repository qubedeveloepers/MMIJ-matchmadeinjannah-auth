import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((err) => {
          return {
            field: err.property,
            errors: Object.values(err.constraints || {}),
          };
        });

        return new BadRequestException({
          errorCode: 'mmij-19',
          message: 'Validation failed',
          errors: formattedErrors,
        });
      },
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:4000',
      'https://test.matchmadeinjannah.com',
      'https://admin.matchmadeinjannah.com',
      'https://matchmadeinjannah.com',
      'https://www.matchmadeinjannah.com',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Accept',
      'X-Requested-With',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods',
      'Access-Control-Allow-Credentials',
    ],
    exposedHeaders: ['Content-Disposition', 'Authorization'],
    credentials: true,
  });

  await app.listen(3000);
}
bootstrap();
