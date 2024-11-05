import { createContext, useContext, useState, type PropsWithChildren } from 'react';

interface SearchContextType {
  open: boolean;
  search: string;
  setOpen: (open: boolean) => void;
  setSearch: (search: string) => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  return <SearchContext.Provider value={{ open, search, setOpen, setSearch }}>{children}</SearchContext.Provider>;
}

export function useSearchContext() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return context;
}
