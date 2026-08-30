import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { v2 as cloudinary } from 'cloudinary'

const app = express()
app.use(express.json({ limit: '1mb' }))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith('image/'))
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
})

const configured = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].every(key => process.env[key])

const mailConfigured = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].every(key => process.env[key])
const mailTransport = mailConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT || 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : null

const uploadBuffer = buffer => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ folder: 'civicalert/evidence', resource_type: 'image' }, (error, result) => error ? reject(error) : resolve(result))
  stream.end(buffer)
})

app.post('/api/evidence', upload.array('photos', 8), async (request, response) => {
  if (!configured) return response.status(503).json({ error: 'Cloudinary server configuration is missing.' })
  if (!request.files?.length) return response.status(400).json({ error: 'At least one image is required.' })
  try {
    const results = await Promise.all(request.files.map(file => uploadBuffer(file.buffer)))
    response.json({ evidence: results.map(result => ({ url: result.secure_url, publicId: result.public_id, format: result.format, bytes: result.bytes })) })
  } catch (error) {
    response.status(502).json({ error: error.message || 'Cloudinary upload failed.' })
  }
})

app.post('/api/report-email', async (request, response) => {
  const { to, subject, text, html } = request.body || {}
  if (!to || !subject || !text) {
    return response.status(400).json({ error: 'Missing report email details.' })
  }
  if (!mailTransport) {
    return response.status(503).json({ error: 'SMTP email configuration is missing.' })
  }

  try {
    await mailTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    })
    response.json({ sent: true })
  } catch (error) {
    response.status(502).json({ error: error.message || 'Failed to send authority email.' })
  }
})

app.listen(8787, () => console.log('CivicAlert API listening on http://localhost:8787'))