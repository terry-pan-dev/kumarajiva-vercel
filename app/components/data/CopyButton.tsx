import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useToast } from '~/hooks/use-toast';

// Copies an id from the raw-data inspectors. Stops propagation so it can sit
// inside a clickable row without toggling it.
export function CopyButton({ value }: { value: string }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  return (
    <button
      type="button"
      title={t('actions.copy')}
      className="text-muted-foreground hover:text-foreground shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value);
        toast({ variant: 'default', title: t('toast.copied'), position: 'top-right' });
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}
