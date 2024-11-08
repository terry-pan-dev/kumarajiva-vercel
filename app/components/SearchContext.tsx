import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { type UserRole } from '../../drizzle/tables/enums';

interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

interface SearchContextType {
  open: boolean;
  search: string;
  setOpen: (open: boolean) => void;
  setSearch: (search: string) => void;
  allUsers: User[];
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

interface SearchProviderProps extends PropsWithChildren {
  allUsers: User[];
}

export function SearchProvider({ children, allUsers }: SearchProviderProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  return (
    <SearchContext.Provider value={{ open, search, setOpen, setSearch, allUsers }}>{children}</SearchContext.Provider>
  );
}

export function useSearchContext() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearchContext must be used within a SearchProvider');
  }
  return context;
}
