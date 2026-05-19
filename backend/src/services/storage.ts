import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// SeaweedFS Storage Service (S3-compatible)
// =====================================================

interface UploadResult {
  key: string;
  url: string;
  size: number;
}

interface PresignedUrl {
  url: string;
  expiresAt: Date;
}

// S3 Client configuration for SeaweedFS
const s3Client = new S3Client({
  endpoint: `http://${process.env.SEAWEEDFS_ENDPOINT || 'localhost'}:${process.env.SEAWEEDFS_PORT || '8333'}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.SEAWEEDFS_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.SEAWEEDFS_SECRET_KEY || 'minioadmin123',
  },
  forcePathStyle: true,
});

const BUCKET_NAME = process.env.SEAWEEDFS_BUCKET || 'onboarding-hub';
const PUBLIC_URL = process.env.SEAWEEDFS_PUBLIC_URL || 'http://localhost:9006';

// =====================================================
// Upload Functions
// =====================================================

export async function uploadBuffer(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<UploadResult> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const url = `${PUBLIC_URL}/${BUCKET_NAME}/${key}`;
    console.log(`Upload successful: ${key} (${buffer.length} bytes)`);

    return {
      key,
      url,
      size: buffer.length,
    };
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

export async function uploadFile(
  filePath: string,
  folder: string = 'uploads'
): Promise<UploadResult> {
  const fileExtension = path.extname(filePath);
  const key = `${folder}/${uuidv4()}${fileExtension}`;

  try {
    const stat = fs.statSync(filePath);
    const fileContent = fs.readFileSync(filePath);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: getContentType(fileExtension),
      })
    );

    const url = `${PUBLIC_URL}/${BUCKET_NAME}/${key}`;
    console.log(`Upload successful: ${key} (${stat.size} bytes)`);

    return {
      key,
      url,
      size: stat.size,
    };
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

export async function uploadVideo(
  buffer: Buffer,
  orgId: string,
  filename: string
): Promise<UploadResult> {
  const extension = path.extname(filename) || '.webm';
  const key = `videos/${orgId}/${uuidv4()}${extension}`;
  return uploadBuffer(buffer, key, `video/${extension.replace('.', '')}`);
}

export async function uploadVideoFromFile(
  filePath: string,
  orgId: string
): Promise<UploadResult> {
  const extension = path.extname(filePath);
  const key = `videos/${orgId}/${uuidv4()}${extension}`;
  return uploadFile(filePath, `videos/${orgId}`);
}

export async function uploadThumbnail(
  buffer: Buffer,
  orgId: string
): Promise<UploadResult> {
  const key = `thumbnails/${orgId}/${uuidv4()}.jpg`;
  return uploadBuffer(buffer, key, 'image/jpeg');
}

export async function uploadSubtitles(
  content: string,
  videoId: string
): Promise<UploadResult> {
  const key = `subtitles/${videoId}.srt`;
  const buffer = Buffer.from(content, 'utf-8');
  return uploadBuffer(buffer, key, 'text/plain');
}

// =====================================================
// Download Functions
// =====================================================

export async function downloadFile(key: string, localPath: string): Promise<void> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    const fileBuffer = Buffer.concat(chunks);
    fs.writeFileSync(localPath, fileBuffer);

    console.log(`Download successful: ${key} -> ${localPath}`);
  } catch (error: any) {
    console.error('Download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

export async function getFileBuffer(key: string): Promise<Buffer> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  } catch (error: any) {
    console.error('Get file buffer error:', error);
    throw new Error(`Failed to get file: ${error.message}`);
  }
}

export async function getFileStream(key: string): Promise<GetObjectCommandOutput> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return response;
  } catch (error: any) {
    console.error('Get file stream error:', error);
    throw new Error(`Failed to get file stream: ${error.message}`);
  }
}

// =====================================================
// Delete Functions
// =====================================================

export async function deleteFile(key: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    console.log(`Deleted: ${key}`);
  } catch (error: any) {
    console.error('Delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export async function deleteFiles(keys: string[]): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
        },
      })
    );
    console.log(`Deleted ${keys.length} files`);
  } catch (error: any) {
    console.error('Delete multiple error:', error);
    throw new Error(`Failed to delete files: ${error.message}`);
  }
}

// =====================================================
// Utility Functions
// =====================================================

export async function listFiles(prefix: string, maxKeys: number = 100): Promise<string[]> {
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: maxKeys,
      })
    );

    return (response.Contents || []).map((obj: any) => obj.Key || '').filter(Boolean);
  } catch (error: any) {
    console.error('List files error:', error);
    return [];
  }
}

export async function getFileInfo(key: string): Promise<{
  size: number;
  lastModified: Date;
  contentType: string;
}> {
  try {
    const response = await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return {
      size: response.ContentLength || 0,
      lastModified: response.LastModified || new Date(),
      contentType: response.ContentType || 'application/octet-stream',
    };
  } catch (error: any) {
    throw new Error(`File not found: ${key}`);
  }
}

export async function fileExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getPublicUrl(key: string): string {
  return `${PUBLIC_URL}/${BUCKET_NAME}/${key}`;
}

export async function getPresignedUrl(key: string, expiry: number = 3600): Promise<PresignedUrl> {
  const url = `${PUBLIC_URL}/${BUCKET_NAME}/${key}`;
  const expiresAt = new Date(Date.now() + expiry * 1000);
  
  console.log(`Presigned URL generated (valid for ${expiry}s): ${key}`);
  
  return { url, expiresAt };
}

function getContentType(extension: string): string {
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.srt': 'text/plain',
    '.vtt': 'text/vtt',
  };
  return types[extension.toLowerCase()] || 'application/octet-stream';
}

export { s3Client, BUCKET_NAME, PUBLIC_URL };
