type Props = {
  sutraName: string;
  rollName: string;
  originalLanguage: string;
  translationLanguage: string;
};

function ContextTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function ImportContextBar({ sutraName, rollName, originalLanguage, translationLanguage }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <ContextTile label="Sutra" value={sutraName} />
      <ContextTile label="Roll" value={rollName} />
      <ContextTile label="Origin Language" value={originalLanguage} />
      <ContextTile value={translationLanguage} label="Translation Language" />
    </div>
  );
}
