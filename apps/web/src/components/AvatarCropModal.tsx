import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { Button } from './Button';
import './AvatarCropModal.css';

export interface AvatarCropModalProps {
  open: boolean;
  imageSrc: string;
  onSave: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export function AvatarCropModal({
  open,
  imageSrc,
  onSave,
  onCancel,
}: AvatarCropModalProps) {
  const t = useT();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Reset when dialog opens with a new image
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open, imageSrc]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.startPanX + dx,
      y: dragStartRef.current.startPanY + dy,
    });
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  const handleSave = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onSave(imageSrc);
        return;
      }

      const img = imageRef.current;
      if (!img || !img.complete || img.naturalWidth === 0) {
        onSave(imageSrc);
        return;
      }

      const VIEWPORT_SIZE = 220;
      const OUTPUT_SIZE = 256;
      const scaleToCanvas = OUTPUT_SIZE / VIEWPORT_SIZE;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      ctx.save();
      ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
      ctx.translate(pan.x * scaleToCanvas, pan.y * scaleToCanvas);
      ctx.scale(zoom * scaleToCanvas, zoom * scaleToCanvas);

      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const baseScale = Math.max(VIEWPORT_SIZE / nw, VIEWPORT_SIZE / nh);
      const dw = nw * baseScale;
      const dh = nh * baseScale;

      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 30) {
        onSave(imageSrc);
      } else {
        onSave(dataUrl);
      }
    } catch {
      onSave(imageSrc);
    }
  };

  return (
    <Modal open={open} onClose={onCancel} title={t('account.cropTitle')}>
      <div className="fsl-crop">
        <div
          className={`fsl-crop__viewport${isDragging ? ' fsl-crop__viewport--dragging' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt=""
            className="fsl-crop__image"
            style={{
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            }}
            draggable={false}
          />
        </div>

        <div className="fsl-crop__controls">
          <label className="fsl-crop__zoom-label" htmlFor="fsl-crop-zoom">
            {t('account.zoom')}
          </label>
          <input
            id="fsl-crop-zoom"
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            aria-label={t('account.zoom')}
            className="fsl-crop__zoom"
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
        </div>

        <div className="fsl-crop__actions">
          <Button variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave}>
            {t('account.savePhoto')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
