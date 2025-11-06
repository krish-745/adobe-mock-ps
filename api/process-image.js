import sharp from 'sharp';

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Method check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, width, height, quality, actualOriginalSize, background } = req.body;

    if (!image || !width || !height || !quality) {
      return res.status(400).json({ error: 'Missing required fields: image, width, height, quality' });
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
      console.error('Invalid or empty image buffer.');
      return res.status(400).json({ error: 'Invalid image data (too small)' });
    }

    // Verify sharp can read the image and get metadata
    let metadata;
    try {
      metadata = await sharp(imageBuffer).metadata();
    } catch (metaErr) {
      console.error('Sharp metadata read failed:', metaErr.message);
      return res.status(400).json({ error: 'Cannot read image format. Please try a different photo.' });
    }

    // Determine background color (from user input or default white)
    const bg = {
      r: clamp(Number(background?.r) || 255),
      g: clamp(Number(background?.g) || 255),
      b: clamp(Number(background?.b) || 255),
      alpha: 1
    };

    // Process the image
    const processedBuffer = await sharp(imageBuffer)
      .resize(width, height, {
        fit: 'contain',
        background: bg
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

    // Encode base64
    const base64Image = processedBuffer.toString('base64');

    // Response send
    return res.status(200).json({
      success: true,
      metrics: {
        originalSize,
        newSize,
        reduction: reductionLabel,
        reductionBytes: originalSize - newSize, // Positive = saved bytes
      },
      image: `data:image/jpeg;base64,${base64Image}`
    });

  } catch (error) {
    // Error log with more detail
    console.error('Error processing image:', error);
    const errorMsg = error.message.includes('Input buffer')
      ? 'Cannot process this image format'
      : error.message;
    return res.status(500).json({ 
      error: 'Failed to process image',
      details: errorMsg
    });
  }
}

// Helper: clamp RGB between 0–255
function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

// Optional: increase request body limit for large images (Vercel)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  }
};
