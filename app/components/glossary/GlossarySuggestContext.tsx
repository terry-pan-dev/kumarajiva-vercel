// Lets anything inside a page open the one "Suggest a term" dialog, with what it knows: the
// translation page provides its document and section, and each paragraph's context menu adds
// the paragraph and the selected text. Outside a provider, useGlossarySuggest() is null and the
// menu offers no suggestion.
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { SuggestTermDialog, type SuggestPassage, type SuggestTermInitial } from './SuggestTermDialog';

type OpenSuggest = (initial?: SuggestTermInitial) => void;

const GlossarySuggestContext = createContext<OpenSuggest | null>(null);

export const useGlossarySuggest = () => useContext(GlossarySuggestContext);

export function GlossarySuggestProvider({ source, children }: PropsWithChildren<{ source?: SuggestPassage }>) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<SuggestTermInitial | undefined>(undefined);

  const openSuggest = useCallback<OpenSuggest>(
    (next) => {
      setInitial({ selection: next?.selection, passage: { ...source, ...next?.passage } });
      setOpen(true);
    },
    [source],
  );

  const value = useMemo(() => openSuggest, [openSuggest]);

  return (
    <GlossarySuggestContext.Provider value={value}>
      {children}
      <SuggestTermDialog open={open} initial={initial} onOpenChange={setOpen} />
    </GlossarySuggestContext.Provider>
  );
}
