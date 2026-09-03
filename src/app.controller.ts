import {
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/constants';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FILE_UPLOAD_DIR } from './constants';
import { fileNameEditor, imageFileFilter } from './file.util';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('/health')
  @Public()
  getHealth(): string {
    return 'OK:' + Date.now();
  }

  @Get('/ready')
  @Public()
  getReady(): string {
    return 'OK:' + Date.now();
  }

  @Post('/upload')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
      },
      storage: diskStorage({
        filename: (req, file, cb) => {
          const fileName = file.originalname.replace(/\s/g, '-').toLowerCase();
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const newFileName = `${fileName}-${uniqueSuffix}`;
          cb(null, fileName);
        },
        destination: FILE_UPLOAD_DIR,
      }),
      fileFilter: imageFileFilter,
    }),
  )
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return {
      message: 'File uploaded successfully',
      fileName: file.filename,
      filePath: `${FILE_UPLOAD_DIR}/${file.filename}`,
    };
  }
}
