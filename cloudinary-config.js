/* Cloudinary public configuration for media uploads.
   The cloud name and unsigned upload preset are public identifiers.
   Never put an API secret in this browser-side file.
*/
export const CLOUDINARY_CLOUD_NAME = "e4eozlh7";
export const CLOUDINARY_UPLOAD_PRESET = "engineer_charles_upload";
export const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
