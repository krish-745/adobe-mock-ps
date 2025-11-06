import express from 'express';
import sharp from 'sharp';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(cors());

app.post('/api/process-image', async (req, res) => {
  try {
    // Input check
    const { image, width, height, quality, actualOriginalSize } = req.body;
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
    // Use the actual file size if provided, otherwise fall back to buffer length
    const originalSize = actualOriginalSize || imageBuffer.length;

    if (imageBuffer.length < 100) {
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

    // Process image
    const processedBuffer = await sharp(imageBuffer)
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
    const percentChange = ((newSize - originalSize) / originalSize * 100);
    const rounded = Math.abs(percentChange).toFixed(1);

    // Label set
    let reductionLabel;
    if (percentChange < 0) {
      reductionLabel = `${rounded}% smaller`;
    } else if (percentChange > 0) {
      reductionLabel = `${rounded}% larger`;
    } else {
      reductionLabel = 'Same size';
    }

    // console.log('Sizes:', { originalSize, newSize, percentChange, rounded, reductionLabel });

    // Response send
    res.json({
      success: true,
      image: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`,
      metrics: {
        originalSize,
        newSize,
        reduction: reductionLabel,
        reductionBytes: originalSize - newSize, // Positive = saved bytes
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