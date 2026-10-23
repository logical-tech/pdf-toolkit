// Browser only. PDF export accepts PNG and JPEG only, so every picked image is re-encoded here, downscaled to keep files small.
export async function imageToPng(file: Blob, maxWidth: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale) });
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}
