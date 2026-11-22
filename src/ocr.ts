import { createWorker } from 'tesseract.js';

// OCR in a Web Worker. Only the language data is downloaded; the photo stays in the browser.
export async function readImage(file: Blob, onProgress: (p: number) => void): Promise<string> {
  const worker = await createWorker(['deu', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return tidy(data.text);
  } finally {
    await worker.terminate();
  }
}

function tidy(t: string): string {
  return t
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
