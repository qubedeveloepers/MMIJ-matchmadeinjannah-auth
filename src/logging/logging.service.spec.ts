import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggingService } from './logging.service';
import { Log } from './schemas/log.schema';

describe('LoggingService', () => {
  let service: LoggingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingService,
        {
          provide: getModelToken(Log.name),
          useValue: jest.fn(),
        },
      ],
    }).compile();

    service = module.get<LoggingService>(LoggingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
