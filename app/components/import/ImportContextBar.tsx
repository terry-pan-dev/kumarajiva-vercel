type Props = {
  originSutraName: string;
  targetSutraName: string;
  originRollName: string;
  targetRollName: string;
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

export function ImportContextBar({
  originSutraName,
  targetSutraName,
  originRollName,
  targetRollName,
  originalLanguage,
  translationLanguage,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <ContextTile label="Origin Sutra" value={originSutraName} />
      <ContextTile label="Origin Roll" value={originRollName} />
      <ContextTile label="Origin Language" value={originalLanguage} />
      <ContextTile label="Target Sutra" value={targetSutraName} />
      <ContextTile label="Target Roll" value={targetRollName} />
      <ContextTile value={translationLanguage} label="Translation Language" />
    </div>
  );
}
