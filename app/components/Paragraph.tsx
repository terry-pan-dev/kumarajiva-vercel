type ParagraphProps = {
  text: string;
  title?: string;
  isOrigin?: boolean;
};

export const Paragraph = ({ text, title, isOrigin }: ParagraphProps) => {
  return (
    <div
      className={`mx-auto flex h-full w-full space-x-4 rounded-xl p-4 shadow-lg ${isOrigin ? 'bg-card' : 'bg-card-foreground'}`}
    >
      <div className="w-full">
        {title && <div className="text-md font-medium text-black">{title}</div>}
        <p className="text-md text-slate-500">{text}</p>
      </div>
    </div>
  );
};
