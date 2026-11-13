import { useState, type ReactNode } from 'react';
import { Button } from '@cc/web-ui/components/Button';
import { Sheet } from '@cc/web-ui/components/Sheet';

/** Full-width "What this covers" opening what makes up the amount in a sheet: the request page and the group pay page. */
export function CoversButton({
  label,
  title,
  testId,
  children,
}: {
  label: string;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" block className="fsl-request__covers" onClick={() => setOpen(true)} data-testid={testId}>
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {children}
      </Sheet>
    </>
  );
}
