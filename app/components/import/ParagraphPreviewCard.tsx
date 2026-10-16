import { useTranslation } from 'react-i18next';

type Reference = { id?: string; sutraName?: string; content?: string };

type Props = {
  order: string | number;
  origin: string;
  target?: string | null;
  references?: Reference[];
  variant?: 'existing' | 'incoming';
};

export function ParagraphPreviewCard({ order, origin, target, references, variant = 'existing' }: Props) {
  const isIncoming = variant === 'incoming';
  const { t } = useTranslation('data');
  const cardClass = isIncoming ? 'rounded-lg border border-secondary bg-secondary/20 p-3' : 'rounded-lg border p-3';
  const badgeClass = isIncoming
    ? 'rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground'
    : 'rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground';
  const dividerClass = isIncoming ? 'mt-2 border-t border-secondary/40 pt-2' : 'mt-2 border-t pt-2';

  return (
    <div className={cardClass}>
      <div className="mb-1">
        <span className={badgeClass}>#{order}</span>
      </div>
      <p className="text-muted-foreground mb-0.5 text-xs font-medium">{t('projects.import.preview.original')}</p>
      <p className="text-foreground text-sm">{origin}</p>
      <div className={dividerClass}>
        <p className="text-muted-foreground mb-0.5 text-xs font-medium">{t('projects.import.preview.translation')}</p>
        {target ? (
          <p className="text-foreground text-sm">{target}</p>
        ) : (
          <p className="text-muted-foreground text-sm italic">{t('projects.import.preview.noTranslation')}</p>
        )}
      </div>
      {!!references?.length && (
        <div className={dividerClass}>
          {references.map((ref, idx) => (
            <p key={ref.id ?? idx} className="text-muted-foreground text-xs">
              <span className="text-muted-foreground font-medium">{ref.sutraName}:</span> {ref.content}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
