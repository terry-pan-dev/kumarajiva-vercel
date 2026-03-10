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
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">Original:</p>
      <p className="text-sm text-foreground">{origin}</p>
      <div className={dividerClass}>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">Translation:</p>
        {target ? (
          <p className="text-sm text-foreground">{target}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No translation</p>
        )}
      </div>
      {!!references?.length && (
        <div className={dividerClass}>
          {references.map((ref, idx) => (
            <p key={ref.id ?? idx} className="text-xs text-muted-foreground">
              <span className="font-medium text-muted-foreground">{ref.sutraName}:</span> {ref.content}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
