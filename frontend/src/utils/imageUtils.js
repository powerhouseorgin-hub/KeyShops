export function cleanGoogleImageUrl(url) {
  if (!url) return '';
  try {
    if (url.includes('google.') && url.includes('imgres')) {
      const parsed = new URL(url);
      if (parsed.searchParams.has('imgurl')) {
        return decodeURIComponent(parsed.searchParams.get('imgurl'));
      }
    }
  } catch (e) {
    // ignore
  }
  return url;
}

// Resizes an image File/Blob down to at most maxDim on its longer side and
// re-encodes it as a JPEG Blob at the given quality - used before uploading
// a Machines listing photo or banner ad image (see uploadPromotionImage/
// uploadAdImage), so a full-resolution phone camera photo (often several MB)
// doesn't get uploaded as-is. This is a real upload (multipart to file
// storage), not base64 embedding - see the "why is Used Machines slow"
// investigation for what happens when a raw photo gets base64-encoded
// straight into a database column instead.
export const resizeImageFileToBlob = (file, maxDim = 1200, quality = 0.82) => new Promise((resolve, reject) => {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(objectUrl);
    let { width, height } = img;
    if (width > height) {
      if (width > maxDim) { height *= maxDim / width; width = maxDim; }
    } else {
      if (height > maxDim) { width *= maxDim / height; height = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not process image'));
    }, 'image/jpeg', quality);
  };
  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Could not read image file'));
  };
  img.src = objectUrl;
});
