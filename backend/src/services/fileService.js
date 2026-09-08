const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const REQUIRED_ENV = [
  "B2_S3_ENDPOINT",
  "B2_ACCESS_KEY_ID",
  "B2_SECRET_ACCESS_KEY",
  "B2_BUCKET",
  "B2_REGION",
];

let s3Client = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const names = missing.join(", ");
    const err = new Error(
      "Document storage is not configured (missing environment variables)"
    );
    err.code = "STORAGE_NOT_CONFIGURED";
    err.missingEnv = names;
    throw err;
  }
  s3Client = new S3Client({
    endpoint: process.env.B2_S3_ENDPOINT,
    region: process.env.B2_REGION,
    credentials: {
      accessKeyId: process.env.B2_ACCESS_KEY_ID,
      secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
    },
  });
  return s3Client;
}

function getBucket() {
  return process.env.B2_BUCKET;
}

function isNotFoundError(err) {
  if (!err) return false;
  const name = err.name || "";
  return (
    name === "NoSuchKey" ||
    name === "NotFound" ||
    name === "NoSuchBucket" ||
    (err.$metadata && err.$metadata.httpStatusCode === 404)
  );
}

/**
 * Upload file bytes to the private B2 bucket.
 * @param {{ key: string, body: Buffer|string, contentType?: string|null }} params
 */
async function uploadObject({ key, body, contentType = null }) {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ...(contentType ? { ContentType: contentType } : {}),
  });
  return getS3Client().send(command);
}

/**
 * Return a Readable stream of the stored object.
 * @returns {Promise<{ stream: NodeJS.ReadableStream, contentType?: string, contentLength?: number }>}
 */
async function getObject(key) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  const data = await getS3Client().send(command);
  return {
    stream: data.Body,
    contentType: data.ContentType,
    contentLength: data.ContentLength,
  };
}

/**
 * Fetch the stored object fully into memory.
 */
async function getObjectBuffer(key) {
  const { stream } = await getObject(key);
  if (stream && typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Remove an object from the B2 bucket. Best-effort cleanup for
 * uploads that failed to persist in the database.
 */
async function deleteObject(key) {
  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getS3Client().send(command);
}

module.exports = {
  getS3Client,
  getBucket,
  isNotFoundError,
  uploadObject,
  getObject,
  getObjectBuffer,
  deleteObject,
};