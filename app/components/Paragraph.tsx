type ParagraphProps = {
  text: string;
  title?: string;
  isOrigin?: boolean;
  isSelected?: boolean;
  isUpdate?: boolean;
};

export const Paragraph = ({ text, title, isOrigin, isSelected = false, isUpdate = false }: ParagraphProps) => {
  return (
    <div
      className={`mx-auto flex h-full w-full space-x-4 rounded-xl ${
        isSelected
          ? 'bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5 shadow-xl transition'
          : `${isOrigin ? 'bg-card' : 'bg-card-foreground'} px-6 py-4 shadow-lg`
      } ${isUpdate ? 'animate-[pulse_1s_ease-in-out_1]' : ''}`}
    >
      <div
        className={`w-full ${isSelected ? `${isOrigin ? 'bg-card-foreground' : 'bg-card-foreground'} h-full rounded-xl px-6 py-4` : ''}`}
      >
        {title && <div className="text-md font-medium text-black">{title}</div>}
        <p className="text-md text-slate-500">{text}</p>
      </div>
    </div>
  );
};
