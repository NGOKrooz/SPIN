/**
 * Helper function to check if auto-rotation is enabled
 * Defaults to true unless explicitly set to 'false'
 * Works with both string 'true' and boolean true values
 * Compatible with Render, Vercel, and other deployment platforms
 */
function isAutoRotationEnabled() {
  const value = process.env.AUTO_ROTATION;
  if (value === undefined || value === null) return true; // Default to enabled
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    return lowerValue !== 'false' && lowerValue !== '0' && lowerValue !== '';
  }
  return value !== false && value !== 0;
}

module.exports = { isAutoRotationEnabled };

