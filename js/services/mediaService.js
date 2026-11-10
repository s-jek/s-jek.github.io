import { firebaseConfig } from "../config/firebase-config.js";

const MAX_SOURCE_SIZE = 12 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 1.5 * 1024 * 1024;

export async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Pilih file gambar.");
  if (file.size > MAX_SOURCE_SIZE) throw new Error("Ukuran gambar sumber maksimal 12 MB.");
  let image;
  try {
    image = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Browser tidak mendukung kompresi gambar.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
    if (blob?.type !== "image/webp") throw new Error("Browser tidak dapat mengompres foto ke WebP.");
    while (blob.size > MAX_OUTPUT_SIZE && quality > 0.45) {
      quality -= 0.1;
      blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (blob?.type !== "image/webp") throw new Error("Browser tidak dapat mengompres foto ke WebP.");
    }
    if (!blob) throw new Error("Gambar tidak dapat dikompresi.");
    if (blob.size > MAX_OUTPUT_SIZE) throw new Error("Gambar tetap terlalu besar setelah dikompresi.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Gambar tidak dapat dibaca untuk dikompresi.");
  } finally {
    image?.close();
  }
}

export class MediaService {
  static async uploadPublicImage(file, folder = "sjek/menu") {
    const image = await compressImage(file);
    if (!firebaseConfig.cloudinaryCloudName || !firebaseConfig.cloudinaryUploadPreset) {
      throw new Error("Konfigurasi upload foto Cloudinary belum lengkap.");
    }
    const data = new FormData();
    data.append("file", image);
    data.append("upload_preset", firebaseConfig.cloudinaryUploadPreset);
    data.append("folder", folder);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${firebaseConfig.cloudinaryCloudName}/image/upload`, {
      method: "POST",
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Upload foto ke Cloudinary gagal.");
    if (result.format?.toLowerCase() !== "webp" || !result.secure_url?.toLowerCase().endsWith(".webp")) {
      throw new Error("Cloudinary tidak menyimpan foto dalam format WebP. Foto tidak dapat digunakan.");
    }
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes
    };
  }
}
