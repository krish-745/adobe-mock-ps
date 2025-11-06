import React, { useState, useRef } from 'react';
import { Upload, Download, X, AlertCircle } from 'lucide-react';

const PRESETS = {
  instagram: { width: 1080, height: 1080, label: 'Instagram' },
  story: { width: 1080, height: 1920, label: 'Story' },
  twitter: { width: 1200, height: 675, label: 'Twitter' }
};

function rgbToHex(r, g, b) {
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function App() {
  const [images, setImages] = useState([]);
  const [quality, setQuality] = useState(80);
  const [selectedPreset, setSelectedPreset] = useState('instagram');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalSaved, setTotalSaved] = useState({ original: 0, compressed: 0 });
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  // Background color state
  const [bgColor, setBgColor] = useState({ r: 255, g: 255, b: 255 });
  const [hexColor, setHexColor] = useState('#f5f5f5');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    handleFiles(files);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = (files) => {
    const newImages = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      originalSize: file.size,
      processed: null,
      processedSize: null,
      metrics: null
    }));
    setImages(prev => [...prev, ...newImages]);
    setError(null);
  };

  const removeImage = (id) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) {
        URL.revokeObjectURL(img.preview);
        if (img.processed) URL.revokeObjectURL(img.processed);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const processImages = async () => {
    if (images.length === 0) return;
    setProcessing(true);
    setProgress(0);
    setError(null);

    const preset = PRESETS[selectedPreset];
    let totalOriginal = 0;
    let totalCompressed = 0;
    const processedImages = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const processed = await processImageViaAPI(
          img.file, preset.width, preset.height, quality / 100
        );
        totalOriginal += img.originalSize;
        totalCompressed += processed.metrics.newSize;
        processedImages.push({
          ...img,
          processed: processed.url,
          processedSize: processed.metrics.newSize,
          blob: processed.blob,
          metrics: processed.metrics
        });
        setProgress(((i + 1) / images.length) * 100);
      } catch (err) {
        console.error('Error processing image:', err);
        setError(`Failed to process ${img.file.name}: ${err.message}`);
        processedImages.push(img);
      }
    }

    setImages(processedImages);
    setTotalSaved({ original: totalOriginal, compressed: totalCompressed });
    setProcessing(false);
  };

  const processImageViaAPI = async (file, width, height, quality) => {
    return new Promise((resolve, reject) => {
      // First, compress the image client-side before sending to API
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        img.onload = async () => {
          try {
            // Calculate dimensions while maintaining aspect ratio
            let targetWidth = img.width;
            let targetHeight = img.height;
            const maxDimension = 2048; // Pre-compress very large images
            
            if (targetWidth > maxDimension || targetHeight > maxDimension) {
              if (targetWidth > targetHeight) {
                targetHeight = (maxDimension / targetWidth) * targetHeight;
                targetWidth = maxDimension;
              } else {
                targetWidth = (maxDimension / targetHeight) * targetWidth;
                targetHeight = maxDimension;
              }
            }
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
            
            // Convert to base64 with moderate quality
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.9);
            
            const res = await fetch('/api/process-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                image: compressedBase64, 
                width, 
                height, 
                quality,
                actualOriginalSize: file.size, // Send the real file size
                background: bgColor // send user-selected color
              })
            });

            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || 'API request failed');
            }

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Processing failed');

            const base64Res = await fetch(data.image);
            const blob = await base64Res.blob();

            resolve({
              url: URL.createObjectURL(blob),
              blob,
              metrics: data.metrics
            });
          } catch (err) {
            reject(err);
          }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const downloadAll = async () => {
    const processed = images.filter(img => img.processed);
    if (processed.length === 0) return;
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    processed.forEach(img => {
      const fileName = img.file.name.replace(/\.[^/.]+$/, '') + '_resized.jpg';
      zip.file(fileName, img.blob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resized_images_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    images.forEach(img => {
      URL.revokeObjectURL(img.preview);
      if (img.processed) URL.revokeObjectURL(img.processed);
    });
    setImages([]);
    setTotalSaved({ original: 0, compressed: 0 });
    setProgress(0);
    setError(null);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const savingsPercent = totalSaved.original > 0
    ? ((totalSaved.original - totalSaved.compressed) / totalSaved.original * 100).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 pt-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Adobe Mock PS</h1>
          <p className="text-gray-600">Batch image resizer/compresser for mobile photographers</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {!processing && images.length > 0 && totalSaved.original > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-green-800 font-medium">Processing Complete</p>
              <p className="text-green-700 text-sm">
                All images have been successfully resized and compressed! Scroll down to download as a ZIP file.
              </p>
            </div>
            <button
              onClick={() => setTotalSaved({ original: 0, compressed: 0 })}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Preset */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preset Dimensions</label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label} ({preset.width}x{preset.height})
                  </option>
                ))}
              </select>
            </div>

            {/* Quality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quality: {quality}%
              </label>
              <input
                type="range"
                min="60"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* Background Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Background Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={hexColor}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setHexColor(hex);
                    setBgColor({
                      r: parseInt(hex.slice(1, 3), 16),
                      g: parseInt(hex.slice(3, 5), 16),
                      b: parseInt(hex.slice(5, 7), 16)
                    });
                  }}
                  className="w-10 h-10 p-0 border rounded"
                />
                <div className="flex gap-2">
                  {['r', 'g', 'b'].map((ch) => (
                    <input
                      key={ch}
                      type="number"
                      min="0"
                      max="255"
                      value={bgColor[ch]}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(255, Number(e.target.value)));
                        const newColor = { ...bgColor, [ch]: val };
                        setBgColor(newColor);
                        setHexColor(rgbToHex(newColor.r, newColor.g, newColor.b));
                      }}
                      className="w-16 px-2 py-1 border rounded"
                      placeholder={ch.toUpperCase()}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={processImages}
              disabled={images.length === 0 || processing}
              className="flex-1 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
            >
              {processing ? 'Processing...' : 'Process Images'}
            </button>
            {images.length > 0 && (
              <button
                onClick={reset}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {processing && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                     style={{ width: `${progress}%` }} />
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">
                Processing images... {Math.round(progress)}%
              </p>
            </div>
          )}
        </div>

        {/* Upload zone */}
        {images.length === 0 && (
          <div
            className={`relative bg-white rounded-xl shadow-lg p-12 text-center border-2 border-dashed transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Drag & Drop Images Here</h3>
            <p className="text-gray-500 mb-4">or</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Choose Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-700">
                  Images ({images.length})
                </h3>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  + Add More
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileInput} className="hidden" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {images.map((img) => (
                  <div key={img.id} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img src={img.processed || img.preview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <div className="mt-2 text-xs text-gray-600">
                      <div>{formatSize(img.originalSize)}</div>
                      {img.processedSize && (
                        <div
                          className={`font-medium ${
                            img.metrics?.reduction?.includes('smaller')
                              ? 'text-green-600'
                              : img.metrics?.reduction?.includes('larger')
                              ? 'text-red-600'
                              : 'text-gray-500'
                          }`}
                        >
                          → {formatSize(img.processedSize)}
                        </div>
                      )}
                      {img.metrics?.reduction && (
                        <div
                          className={`text-xs mt-1 font-medium ${
                            img.metrics.reduction?.includes('smaller')
                              ? 'text-green-600'
                              : img.metrics.reduction?.includes('larger')
                              ? 'text-red-600'
                              : 'text-gray-500'
                          }`}
                        >
                          {img.metrics.reduction}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            {totalSaved.original > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="text-center md:text-left">
                    <p className="text-gray-600 mb-1">Total Size Comparison</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {formatSize(totalSaved.original)} → {formatSize(totalSaved.compressed)}
                    </p>
                    <p
                      className={`font-medium ${
                        totalSaved.compressed < totalSaved.original
                          ? 'text-green-600'
                          : totalSaved.compressed > totalSaved.original
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {totalSaved.compressed < totalSaved.original
                        ? `Saved ${savingsPercent}% (${formatSize(totalSaved.original - totalSaved.compressed)})`
                        : totalSaved.compressed > totalSaved.original
                        ? `Increased by ${Math.abs(savingsPercent)}% (${formatSize(totalSaved.compressed - totalSaved.original)})`
                        : 'Same total size'}
                    </p>
                  </div>
                  <button
                    onClick={downloadAll}
                    className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download all as ZIP
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}