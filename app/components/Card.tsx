export const TranslationCard = ({
  title,
  subtitle,
  translator,
  isSelected = false,
}: {
  title: string;
  subtitle: string | null;
  translator?: string;
  isSelected?: boolean;
}) => {
  return (
    <article className="hover:animate-background rounded-xl bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5 shadow-xl transition hover:bg-[length:400%_400%] hover:shadow-sm hover:[animation-duration:_4s]">
      <div className={`rounded-[10px] p-4 sm:p-6 lg:!pt-10 ${isSelected ? 'bg-yellow-600' : 'bg-white'}`}>
        <h3 className="mt-0.5 text-lg font-medium text-gray-900 lg:text-2xl">{title}</h3>
        <h4 className="mt-1 text-sm font-medium text-gray-900">{translator}</h4>
        <div className="mt-4 flex flex-wrap gap-1">
          <span className="whitespace-wrap rounded-full bg-purple-100 px-2.5 py-0.5 text-xs text-primary">
            {subtitle}
          </span>
        </div>
      </div>
    </article>
  );
};
