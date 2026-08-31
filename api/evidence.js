import { v2 as cloudinary } from 'cloudinary';

export const config = {
  api: {
    bodyParser: false,
  },
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const configured = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].every(
  (key) => Boolean(process.env[key]),
);

const uploadBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'civicalert/evidence', resource_type: 'image' },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  if (!configured) {
    return response.status(503).json({ error: 'Cloudinary server configuration is missing.' });
  }

  try {
    const formData = await request.formData();
    const photoFiles = formData.getAll('photos').filter(Boolean);

    if (!photoFiles.length) {
      return response.status(400).json({ error: 'At least one image is required.' });
    }

    const results = await Promise.all(
      photoFiles.map(async (file) => {
        if (!(file instanceof File)) {
          throw new Error('Uploaded evidence must be a valid image file.');
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        return uploadBuffer(buffer);
      }),
    );

    return response.status(200).json({
      evidence: results.map((result) => ({
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes,
      })),
    });
  } catch (error) {
    return response.status(502).json({
      error: error.message || 'Cloudinary upload failed.',
    });
  }
}
