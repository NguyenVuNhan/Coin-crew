import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { Button } from './Button';

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
  const VIEWPORT_SIZE = 220;
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState({ w: VIEWPORT_SIZE, h: VIEWPORT_SIZE });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const baseScale = Math.max(VIEWPORT_SIZE / naturalSize.w, VIEWPORT_SIZE / naturalSize.h);
  const baseWidth = naturalSize.w * baseScale;
  const baseHeight = naturalSize.h * baseScale;

  const clampPan = (x: number, y: number, currentZoom: number) => {
    const maxPanX = Math.max(VIEWPORT_SIZE / 2, (baseWidth * currentZoom - VIEWPORT_SIZE) / 2);
    const maxPanY = Math.max(VIEWPORT_SIZE / 2, (baseHeight * currentZoom - VIEWPORT_SIZE) / 2);
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  };

  // Reset when dialog opens with a new image
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setNaturalSize({ w: VIEWPORT_SIZE, h: VIEWPORT_SIZE });
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
    setPan(
      clampPan(
        dragStartRef.current.startPanX + dx,
        dragStartRef.current.startPanY + dy,
        zoom,
      ),
    );
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
      const exportBaseScale = Math.max(VIEWPORT_SIZE / nw, VIEWPORT_SIZE / nh);
      const dw = nw * exportBaseScale;
      const dh = nh * exportBaseScale;

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
      <div className={cn('fsl-crop', 'flex flex-col items-center gap-4')}>
        <div
          className={cn(
            'fsl-crop__viewport',
            isDragging && 'fsl-crop__viewport--dragging',
            'relative size-[220px] rounded-full overflow-hidden bg-card border-2 border-primary shadow-sm cursor-grab touch-none select-none',
            isDragging && 'cursor-grabbing',
          )}
          data-vaul-no-drag
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt=""
            className={cn(
              'fsl-crop__image',
              'absolute top-1/2 left-1/2 max-w-none pointer-events-none select-none will-change-transform',
            )}
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth;
              const nh = e.currentTarget.naturalHeight;
              if (nw > 0 && nh > 0) {
                setNaturalSize({ w: nw, h: nh });
              }
            }}
            style={{
              width: `${baseWidth}px`,
              height: `${baseHeight}px`,
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
            }}
            draggable={false}
          />
        </div>

        <div className={cn('fsl-crop__controls', 'w-full flex items-center gap-3')}>
          <Label
            htmlFor="fsl-crop-zoom"
            className={cn('fsl-crop__zoom-label', 'shrink-0 text-muted-foreground')}
          >
            {t('account.zoom')}
          </Label>
          <input
            id="fsl-crop-zoom"
            type="range"
            data-vaul-no-drag
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            aria-label={t('account.zoom')}
            className={cn('fsl-crop__zoom', 'flex-1 accent-primary cursor-pointer h-2 bg-muted rounded-lg')}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
        </div>

        <div className={cn('fsl-crop__actions', 'w-full flex flex-col-reverse sm:flex-row justify-end gap-2')}>
          <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} className="w-full sm:w-auto">
            {t('account.savePhoto')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
