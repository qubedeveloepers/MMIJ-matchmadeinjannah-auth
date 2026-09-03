import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument } from './schemas/log.schema';

@Injectable()
export class LoggingService {
  constructor(
    @InjectModel(Log.name) private readonly logModel: Model<LogDocument>,
  ) {}

  async createLog(payload: {
    userId: string;
    role?: string;
    action: string;
    errorLogs?: any[];
  }): Promise<Log> {
    const createdLog = new this.logModel(payload);
    return createdLog.save();
  }
}
