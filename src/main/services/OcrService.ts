export class OcrService {
  async extractTextFromScreenshot(imageBuffer: Buffer): Promise<string> {
    console.warn('OCR service is not implemented yet. Returning empty string.');
    return '';
  }
}
