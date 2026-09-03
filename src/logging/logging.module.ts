import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggingService } from './logging.service';
import { Log, LogSchema } from './schemas/log.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Log.name, schema: LogSchema }])],
  providers: [LoggingService],
  exports: [LoggingService],
})
export class LoggingModule {}
