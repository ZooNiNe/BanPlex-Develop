import { _compressImage } from '../utils/helpers.js';
import { toast } from '../ui/toast.js';

export async function _uploadFileToCloudinary(file) {
  const CLOUDINARY_CLOUD_NAME = "dcjp0fxvb";
  const CLOUDINARY_UPLOAD_PRESET = "BanFlex.Co-Upload";
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  try {
      const compressedFile = await _compressImage(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      toast('syncing', `Mengupload ${file.name}...`, 999999);
      const response = await fetch(url, {
          method: 'POST',
          body: formData
      });
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error.message);
      }
      const data = await response.json();
      toast('success', `${file.name} berhasil diupload!`);
      return data.secure_url;
  } catch (error) {
      console.error(`Cloudinary upload error:`, error);
      toast('error', `Upload ${file.name} gagal.`);
      return null;
  }
}