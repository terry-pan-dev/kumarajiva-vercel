import { createContext, useContext, useState, useEffect } from 'react';

import { useScreenSize } from '../lib/hooks';

interface SideBarMenuContextType {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const SideBarMenuContext = createContext<SideBarMenuContextType | undefined>(undefined);

export function SideBarMenuContextProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const isSmallScreen = useScreenSize();

  // Automatically close sidebar on small screens
  useEffect(() => {
    setIsOpen(!isSmallScreen);
  }, [isSmallScreen]);

  return <SideBarMenuContext.Provider value={{ isOpen, setIsOpen }}>{children}</SideBarMenuContext.Provider>;
}

export function useSideBarMenuContext() {
  const context = useContext(SideBarMenuContext);
  if (context === undefined) {
    throw new Error('useSideBarMenuContext must be used within a SideBarMenuContextProvider');
  }
  return context;
}
