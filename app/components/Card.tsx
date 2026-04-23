export const TranslationCard = ({
  originTitle,
  originTranslator,
  targetTitle,
  targetTranslator,
  isSelected = false,
}: {
  originTitle: string;
  originTranslator?: string;
  targetTitle?: string | null;
  targetTranslator?: string | null;
  isSelected?: boolean;
}) => {
  return (
    <article className="hover:animate-background rounded-xl bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5 shadow-xl transition hover:bg-[length:400%_400%] hover:shadow-sm hover:[animation-duration:_4s]">
      <div className={`rounded-[10px] p-4 sm:p-6 lg:!pt-10 ${isSelected ? 'bg-yellow-600' : 'bg-white'}`}>
        <div className={`grid gap-4 ${targetTitle ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <div>
            <h3 className="mt-0.5 text-lg font-medium text-gray-900 lg:text-2xl">{originTitle}</h3>
            {originTranslator && <h4 className="mt-1 text-sm font-medium text-gray-900">{originTranslator}</h4>}
          </div>
          {targetTitle && (
            <div className="border-l border-gray-200 pl-4">
              <h3 className="mt-0.5 text-lg font-medium text-gray-900 lg:text-2xl">{targetTitle}</h3>
              {targetTranslator && <h4 className="mt-1 text-sm font-medium text-gray-900">{targetTranslator}</h4>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};
