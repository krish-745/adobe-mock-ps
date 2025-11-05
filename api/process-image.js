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
    // Input check
    const { image, width, height, quality } = req.body;
    if (!image || !width || !height || !quality) {
      return res.status(400).json({ 
        error: 'Missing required fields: image, width, height, quality' 
      });
    }

    // Decode base64
    const base64Data = image.replace(/^data:.*;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const originalSize = imageBuffer.length;

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

    // Encode base64
    const base64Image = processedBuffer.toString('base64');

    // Response send
    return res.status(200).json({
      success: true,
      metrics: {
        originalSize,
        newSize,
        reduction: reductionLabel,
        reductionBytes: sizeDiff,
      },
      image: `data:image/jpeg;base64,${base64Image}`
    });

  } catch (error) {
    // Error log
    console.error('Error processing image:', error);
    return res.status(500).json({ 
      error: 'Failed to process image',
      details: error.message 
    });
  }
}
