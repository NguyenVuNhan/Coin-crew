/** The pure-JS QR encoder inside `qrcode` (no canvas, no Node streams), so it runs in the Worker. */
declare module 'qrcode/lib/core/qrcode.js' {
  interface QRCodeCore {
    create(
      text: string,
      options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' },
    ): { modules: { size: number; get(row: number, col: number): number | boolean } };
  }
  const core: QRCodeCore;
  export default core;
}
