import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from 'cloudinary';
import { Readable } from 'stream';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

export type CloudinaryUploadResult = {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  resourceType: string;
  bytes: number;
};

@Injectable()
export class CloudinaryService {
  constructor(
    @InjectPinoLogger(CloudinaryService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Upload an image to Cloudinary with authenticated access (private)
   * Images uploaded this way require signed URLs to access directly.
   * Stores the original resolution; size/format optimization is applied at delivery.
   */
  async uploadImage(
    buffer: Buffer,
    folder: string,
    userId: string,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `mmij/${folder}/${userId}`,
          type: 'authenticated', // Makes the asset private - requires signed URL
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            this.logger.error(
              { error, folder, userId },
              'Cloudinary upload error',
            );
            reject(
              new InternalServerErrorException(
                `Failed to upload image: ${error.message}`,
              ),
            );
          } else if (result) {
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              format: result.format,
              resourceType: result.resource_type,
              bytes: result.bytes,
            });
          }
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Upload a profile picture. Stores the original at full resolution;
   * size variants (thumbnail, card, detail) are produced at delivery via
   * getProfilePictureAsBase64 / getAssetThumbnailAsBase64.
   */
  async uploadProfilePicture(
    buffer: Buffer,
    userId: string,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `mmij/profile_pictures/${userId}`,
          type: 'authenticated',
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            this.logger.error(
              { error, userId },
              'Cloudinary profile picture upload error',
            );
            reject(
              new InternalServerErrorException(
                `Failed to upload profile picture: ${error.message}`,
              ),
            );
          } else if (result) {
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              format: result.format,
              resourceType: result.resource_type,
              bytes: result.bytes,
            });
          }
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Upload a gallery image. Stores the original at full resolution;
   * size variants are produced at delivery via getGalleryImageAsBase64.
   */
  async uploadGalleryImage(
    buffer: Buffer,
    userId: string,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `mmij/gallery/${userId}`,
          type: 'authenticated',
          resource_type: 'image',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            this.logger.error(
              { error, userId },
              'Cloudinary gallery upload error',
            );
            reject(
              new InternalServerErrorException(
                `Failed to upload gallery image: ${error.message}`,
              ),
            );
          } else if (result) {
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              format: result.format,
              resourceType: result.resource_type,
              bytes: result.bytes,
            });
          }
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Upload a video to Cloudinary with authenticated access
   */
  async uploadVideo(
    buffer: Buffer,
    userId: string,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `mmij/videos/${userId}`,
          type: 'authenticated',
          resource_type: 'video',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            this.logger.error(
              { error, userId },
              'Cloudinary video upload error',
            );
            reject(
              new InternalServerErrorException(
                `Failed to upload video: ${error.message}`,
              ),
            );
          } else if (result) {
            resolve({
              publicId: result.public_id,
              url: result.url,
              secureUrl: result.secure_url,
              format: result.format,
              resourceType: result.resource_type,
              bytes: result.bytes,
            });
          }
        },
      );

      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }

  /**
   * Delete an asset from Cloudinary by public_id
   */
  async deleteAsset(
    publicId: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<{ success: boolean }> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        type: 'authenticated',
        resource_type: resourceType,
      });

      return { success: result.result === 'ok' };
    } catch (error) {
      this.logger.error(
        { error, publicId, resourceType },
        'Cloudinary delete error',
      );
      throw new InternalServerErrorException(
        `Failed to delete asset: ${error.message}`,
      );
    }
  }

  /**
   * Get an authenticated asset as base64 string
   * This is the key method for privacy - fetches from Cloudinary and returns base64
   * so the Cloudinary URL is never exposed to the client
   */
  async getAssetAsBase64(
    publicId: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<string> {
    try {
      // Generate a signed URL for authenticated access
      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        resource_type: resourceType,
        sign_url: true,
        secure: true,
      });

      // Fetch the image from Cloudinary
      const response = await fetch(signedUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.statusText}`);
      }

      // Convert to base64
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      return base64;
    } catch (error) {
      this.logger.error(
        { error, publicId, resourceType },
        'Cloudinary fetch error',
      );
      throw new InternalServerErrorException(
        `Failed to fetch asset: ${error.message}`,
      );
    }
  }

  /**
   * Fetch a 60×60 thumbnail of an authenticated image as base64.
   * Used for list-view avatars to avoid N full-size Cloudinary calls.
   */
  async getAssetThumbnailAsBase64(publicId: string): Promise<string> {
    try {
      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        resource_type: 'image',
        sign_url: true,
        secure: true,
        transformation: [
          { width: 60, height: 60, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good', fetch_format: 'auto' },
        ],
      });

      const response = await fetch(signedUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
      this.logger.error({ error, publicId }, 'Cloudinary thumbnail fetch error');
      throw new InternalServerErrorException(
        `Failed to fetch thumbnail: ${error.message}`,
      );
    }
  }

  /**
   * Fetch a profile picture variant as base64.
   *  - 'card':   200×200, face-cropped, square — for member list / card views
   *  - 'detail': up to 1200×1200, aspect-preserving — for detail views
   */
  async getProfilePictureAsBase64(
    publicId: string,
    size: 'card' | 'detail' = 'detail',
  ): Promise<string> {
    const transformation =
      size === 'card'
        ? [
            { width: 200, height: 200, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ]
        : [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ];

    return this.fetchTransformedAsBase64(publicId, 'image', transformation);
  }

  /**
   * Fetch a gallery image variant as base64.
   *  - 'thumb':  400×400 square — list/grid views
   *  - 'detail': up to 1600×1600, aspect-preserving — full view
   */
  async getGalleryImageAsBase64(
    publicId: string,
    size: 'thumb' | 'detail' = 'detail',
  ): Promise<string> {
    const transformation =
      size === 'thumb'
        ? [
            { width: 400, height: 400, crop: 'fill' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ]
        : [
            { width: 1600, height: 1600, crop: 'limit' },
            { quality: 'auto:good', fetch_format: 'auto' },
          ];

    return this.fetchTransformedAsBase64(publicId, 'image', transformation);
  }

  /**
   * Fetch multiple gallery images as base64 with the given size variant.
   * Skips assets that fail to load (logs a warning).
   */
  async getMultipleGalleryImagesAsBase64(
    publicIds: string[],
    size: 'thumb' | 'detail' = 'detail',
  ): Promise<Array<{ publicId: string; base64: string }>> {
    const results = await Promise.all(
      publicIds.map(async (publicId) => {
        try {
          const base64 = await this.getGalleryImageAsBase64(publicId, size);
          return { publicId, base64 };
        } catch (error) {
          this.logger.warn({ error, publicId }, 'Failed to fetch gallery image');
          return null;
        }
      }),
    );

    return results.filter((r) => r !== null);
  }

  private async fetchTransformedAsBase64(
    publicId: string,
    resourceType: 'image' | 'video',
    transformation: Record<string, unknown>[],
  ): Promise<string> {
    try {
      const signedUrl = cloudinary.url(publicId, {
        type: 'authenticated',
        resource_type: resourceType,
        sign_url: true,
        secure: true,
        transformation,
      });

      const response = await fetch(signedUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch asset: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('base64');
    } catch (error) {
      this.logger.error(
        { error, publicId, resourceType },
        'Cloudinary transformed fetch error',
      );
      throw new InternalServerErrorException(
        `Failed to fetch asset: ${error.message}`,
      );
    }
  }

  /**
   * Generate a signed URL for an authenticated Cloudinary asset.
   * Returns the URL string without fetching the content — suitable for
   * streaming large resources like video directly in the browser.
   */
  getSignedUrl(
    publicId: string,
    resourceType: 'image' | 'video' = 'video',
  ): string {
    return cloudinary.url(publicId, {
      type: 'authenticated',
      resource_type: resourceType,
      sign_url: true,
      secure: true,
    });
  }

  /**
   * Get multiple assets as base64 (for gallery)
   * Returns array of { publicId, base64 } objects
   */
  async getMultipleAssetsAsBase64(
    publicIds: string[],
  ): Promise<Array<{ publicId: string; base64: string }>> {
    const results = await Promise.all(
      publicIds.map(async (publicId) => {
        try {
          const base64 = await this.getAssetAsBase64(publicId, 'image');
          return { publicId, base64 };
        } catch (error) {
          this.logger.warn({ error, publicId }, 'Failed to fetch asset');
          return null;
        }
      }),
    );

    return results.filter((r) => r !== null);
  }

  /**
   * Check if an asset exists in Cloudinary
   */
  async assetExists(
    publicId: string,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<boolean> {
    try {
      await cloudinary.api.resource(publicId, {
        type: 'authenticated',
        resource_type: resourceType,
      });
      return true;
    } catch (error) {
      if (error.error?.http_code === 404) {
        return false;
      }
      throw error;
    }
  }
}
