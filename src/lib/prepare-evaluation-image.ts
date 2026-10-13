const MAX_IMAGE_WIDTH = 800;
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

function jpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 JPG로 변환하지 못했습니다."));
    }, "image/jpeg", quality);
  });
}

export async function prepareEvaluationImage(file: File, studentName: string): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 읽지 못했습니다. PNG 또는 JPG 파일을 선택해 주세요."));
      element.src = objectUrl;
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("이미지 크기를 확인하지 못했습니다.");
    }

    let width = Math.min(image.naturalWidth, MAX_IMAGE_WIDTH);
    for (let attempt = 0; attempt < 5; attempt++) {
      const height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("이미지 변환을 시작하지 못했습니다.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.85, 0.72, 0.6]) {
        const blob = await jpegBlob(canvas, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) {
          return new File([blob], `${studentName}.jpg`, { type: "image/jpeg" });
        }
      }
      width = Math.max(1, Math.round(width * 0.75));
    }
    throw new Error("이미지가 너무 커서 업로드할 수 없습니다. 더 작은 이미지를 선택해 주세요.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
