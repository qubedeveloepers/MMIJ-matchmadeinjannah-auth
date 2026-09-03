import { Request } from '@nestjs/common';

export const fileNameEditor = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) => {
  const fileName = file.originalname.replace(/\s/g, '-').toLowerCase();
  const newFileName = 'whatever' + file.originalname;

  cb(null, newFileName);
};

export const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif)$/)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};
