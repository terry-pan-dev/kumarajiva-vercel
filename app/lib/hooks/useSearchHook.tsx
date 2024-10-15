import { useState } from 'react';

export const useSearchHook = (delay: number) => {
  const [searchTerm, setSearchTerm] = useState('');

  const debounce = (fn: (term: string) => void, delay: number) => {
    let timeout: NodeJS.Timeout;
    return (term: string) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(term), delay);
    };
  };

  return { searchTerm, setSearchTerm: debounce(setSearchTerm, delay) };
};
