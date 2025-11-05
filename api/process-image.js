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
      return res.status(400).json({ error: 'Missing required fields: image, width, height, quality' });
    }

    // Decode base64 safely
    let base64Data = image;
    if (base64Data.startsWith('data:')) {
      const commaIndex = base64Data.indexOf(',');
      if (commaIndex !== -1) base64Data = base64Data.slice(commaIndex + 1);
    }

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const originalSize = imageBuffer.length;

    // Debug info
    console.log('Received image length:', originalSize);
    if (originalSize < 100) {
      console.error('Invalid or empty image buffer.');
      return res.status(400).json({ error: 'Invalid image data received' });
    }

    // Metadata check
    try {
      await sharp(imageBuffer).metadata();
    } catch (metaErr) {
      console.error('Sharp metadata read failed:', metaErr.message);
      return res.status(400).json({ error: 'Invalid image format (cannot read metadata)' });
    }

    // Process image
    let processedBuffer;
    try {
      // Try normal decode
      processedBuffer = await sharp(imageBuffer)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: Math.round(quality * 100) })
        .toBuffer();
    } catch (err) {
      console.warn('Sharp failed on normal decode, retrying as HEIC/Web-compatible JPEG:', err.message);

      // Retry using failOnError:false and re-encode
      processedBuffer = await sharp(imageBuffer, { failOnError: false })
        .toFormat('jpeg')
        .resize(width, height, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: Math.round(quality * 100) })
        .toBuffer();
    }

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
