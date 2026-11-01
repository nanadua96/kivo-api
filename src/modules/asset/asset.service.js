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
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';
import mime from 'mime-types';
import sharp from 'sharp';
import { s3 } from '../../config/s3.config.js';
import { __DEV__ } from '../../constants/app.constants.js';
import {
  ALLOWED_MIME_TYPES,
  PRESIGN_TIMEOUT_MILLISECONDS,
  PRESIGN_TIMEOUT_SECONDS,
} from './asset.constants.js';
import { Asset } from './asset.model.js';
import { createAssetKey } from './asset.utlities.js';

ffmpeg.setFfprobePath(ffprobeStatic.path);

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

      const uploadUrl = await getSignedUrl(s3, command, {
        expiresIn: PRESIGN_TIMEOUT_SECONDS,
      });

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
      console.error('[createUploadUrls] Failed:', {
        message: error?.message,
        stack: error?.stack,
      });
    }

    return {
      success: false,
      code: 'UPLOAD_URL_CREATION_FAILED',
      error: 'Failed to create upload URLs.',
    };
  }
}
