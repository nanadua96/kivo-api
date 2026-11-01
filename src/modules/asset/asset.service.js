import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mime from 'mime-types';
import sharp from 'sharp';
import { s3 } from '../../config/s3.config.js';
import { __DEV__ } from '../../constants/app.constants.js';
// import {
//   ALLOWED_MIME_TYPES,
//   PRESIGN_TIMEOUT_MILLISECONDS,
//   PRESIGN_TIMEOUT_SECONDS,
// } from './asset.constants.js';
import { Asset } from './asset.model.js';
import { createAssetKey } from './asset.utlities.js';

export async function createUploadUrls(files, userId) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      success: false,
      code: 'FILES_REQUIRED',
      error: "'files' must be a non-empty array.",
    };
  }

  try {
    const uploads = [];
    const dbRecords = [];

    for (const file of files) {
      if (!file?.id)
        return {
          success: false,
          code: 'FILE_ID_REQUIRED',
          error: 'Each file must have an id.',
        };

      if (!file?.mimeType)
        return {
          success: false,
          code: 'FILE_MIME_TYPE_REQUIRED',
          error: `Missing mimeType for file "${file.id}".`,
        };

      const extension = mime.extension(file.mimeType);

      if (!extension)
        return {
          success: false,
          code: 'UNSUPPORTED_FILE_TYPE',
          error: `Unsupported file type: ${file.mimeType}.`,
        };

      const key = createAssetKey({ userId, extension });

      const command = new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        ContentType: file.mimeType,
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

      uploads.push({ id: file.id, key, uploadUrl });

      dbRecords.push({
        bucket: process.env.STORAGE_BUCKET,
        key,
        mimeType: file.mimeType,
        user: userId,
        originalName: file.originalName,
      });
    }

    await Asset.create(dbRecords);

    return {
      success: true,
      code: 'UPLOAD_URLS_CREATED',
      data: uploads,
    };
  } catch (error) {
    if (__DEV__) {
      console.error('[createUploadUrls] Failed:', error?.message);
      console.error(error);
    }

    return {
      success: false,
      code: 'UPLOAD_URL_CREATION_FAILED',
      error: 'Failed to create upload URLs.',
    };
  }
}

export async function completeUpload({
  key,
  userId,
  attachedTo,
  docModel,
  purpose,
  allowedFileTypes,
  fileType,
  imageOptions,
  maxSizeBytes,
  session,
}) {
  // ======== HELPER ========
  const validationError = (code, error) => ({
    success: false,
    code,
    error,
    asset: null,
  });

  try {
    if (!maxSizeBytes)
      return validationError(
        'MAX_SIZE_BYTES_REQUIRED',
        'maxSizeBytes is required.',
      );

    // ======== FIND ASSET ========
    let asset;

    const query = { key, user: userId };

    if (session) asset = await Asset.findOne(query).session(session).exec();
    else asset = await Asset.findOne(query).exec();

    if (!asset) return validationError('UPLOAD_NOT_FOUND', 'Upload not found.');

    if (asset.status === 'active')
      return validationError(
        'UPLOAD_ALREADY_COMPLETED',
        'Upload has already been completed.',
      );

    // ======== VALIDATION ========
    // Check if object exists
    const { ContentLength } = await s3.send(
      new HeadObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
    );

    // Validate size
    if (ContentLength > maxSizeBytes)
      return validationError(
        'UPLOAD_FILE_TOO_LARGE',
        'The uploaded file exceeds the maximum allowed size.',
      );

    // Validate extension
    const extension = path.extname(key).slice(1).toLowerCase();

    if (!extension) {
      return validationError(
        'UPLOAD_EXTENSION_MISSING',
        'The uploaded file has no extension.',
      );
    }

    // Download file
    const object = await s3.send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
    );

    const buffer = Buffer.from(await object.Body.transformToByteArray());

    // Metadata
    const metadata = { extension };

    // Validate image
    if (fileType === 'image') {
      const sharpMetadata = await sharp(buffer).metadata();
      // console.log('🌄 Sharp metadata:', sharpMetadata);

      if (
        sharpMetadata.height > imageOptions.maxHeight ||
        sharpMetadata.width > imageOptions.maxWidth
      )
        return validationError(
          'MEDIA_DIMENSION_TOO_LARGE',
          `Image dimensions exceed the maximum allowed size of ${imageOptions.maxWidth}x${imageOptions.maxHeight}px.`,
        );

      if (
        sharpMetadata.height < imageOptions.minHeight ||
        sharpMetadata.width < imageOptions.minWidth
      )
        return validationError(
          'MEDIA_DIMENSION_TOO_SMALL',
          `Image dimensions are below the minimum required size of ${imageOptions.minWidth}x${imageOptions.minHeight}px.`,
        );

      if (!allowedFileTypes.includes(sharpMetadata.format))
        return validationError(
          'MEDIA_FORMAT_NOT_ALLOWED',
          `Image format "${sharpMetadata.format}" is not supported.`,
        );

      metadata.width = sharpMetadata.width;
      metadata.height = sharpMetadata.height;

      // console.log('✅ Metadata:', metadata);
    }

    if (fileType === 'document') {
      // Json etc goes here
    }

    // ======== UPDATE DOCUMENT ========
    asset.size = ContentLength;
    asset.status = 'active';
    asset.metadata = metadata;
    asset.attachedTo = attachedTo;
    asset.docModel = docModel;
    asset.purpose = purpose;

    if (session) await asset.save({ session });
    else await asset.save();

    return {
      success: true,
      code: null,
      error: null,
      asset: {
        id: asset._id,
        key: asset.key,
        bucket: asset.bucket,
        size: asset.size,
        metadata,
      },
    };
  } catch (error) {
    console.error('[completeUpload] Failed to complete upload:', error);

    return {
      success: false,
      error: 'Failed to complete upload.',
      code: 'UPLOAD_COMPLETION_FAILED',
      asset: null,
    };
  }
}
