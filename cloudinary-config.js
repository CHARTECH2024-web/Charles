/* Cloudinary public configuration for media uploads.
   Create a free Cloudinary account, then create an UNSIGNED upload preset.
   Put the values below in this file. These values are identifiers, not API secrets.
*/
export const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
export const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
