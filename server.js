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

    // Decode base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const originalSize = imageBuffer.length;

    // Process image
    const processedBuffer = await sharp(imageBuffer)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: Math.round(quality * 100) })
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
    // Error handle
    res.status(500).json({ error: e.message });
  }
});

// Server start
app.listen(3001, () => console.log('API running at http://localhost:3001'));
