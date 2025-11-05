import express from 'express';
import sharp from 'sharp';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cors());

app.post('/api/process-image', async (req, res) => {
  try {
    // Input check
    const { image, width, height, quality } = req.body;
    if (!image || !width || !height || !quality) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Decode base64 with validation
    let base64Data = image;
    if (base64Data.startsWith('data:')) {
      const commaIndex = base64Data.indexOf(',');
      if (commaIndex !== -1) base64Data = base64Data.slice(commaIndex + 1);
    }

    // Validate base64 format
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return res.status(400).json({ error: 'Invalid base64 format' });
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const originalSize = imageBuffer.length;

    if (originalSize < 100) {
      return res.status(400).json({ error: 'Invalid image data (too small)' });
    }

    // Verify sharp can read the image and get metadata
    let metadata;
    try {
      metadata = await sharp(imageBuffer).metadata();
    } catch (metaErr) {
      console.error('Sharp metadata error:', metaErr.message);
      return res.status(400).json({ 
        error: 'Cannot read image format. Please try a different photo.' 
      });
    }

    // Process image with EXIF orientation handling
    const processedBuffer = await sharp(imageBuffer)
      .rotate() // Auto-rotate based on EXIF orientation
      .resize(width, height, { 
        fit: 'inside', 
        withoutEnlargement: true,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .jpeg({ 
        quality: Math.round(quality * 100),
        mozjpeg: true
      })
      .toBuffer();

    // Metrics calc
    const newSize = processedBuffer.length;
    const sizeDiff = newSize - originalSize;
    const percentDiff = ((sizeDiff / originalSize) * 100).toFixed(1);

    // Label set
    let reductionLabel;
    if (sizeDiff < 0) {
      reductionLabel = `${Math.abs(percentDiff)}% smaller`;
    } else if (sizeDiff > 0) {
      reductionLabel = `${percentDiff}% larger`;
    } else {
      reductionLabel = 'Same size';
    }

    // Response send
    res.json({
      success: true,
      image: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`,
      metrics: {
        originalSize,
        newSize,
        reduction: reductionLabel,
        reductionBytes: sizeDiff,
      }
    });
  } catch (e) {
    // Error handle with more detail
    console.error('Processing failed:', e);
    const errorMsg = e.message.includes('Input buffer')
      ? 'Cannot process this image format'
      : e.message;
    res.status(500).json({ error: errorMsg });
  }
});

// Server start
app.listen(3001, () => console.log('API running at http://localhost:3001'));
