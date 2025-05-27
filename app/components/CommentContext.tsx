import { createContext, useContext, useState, type PropsWithChildren } from 'react';

interface CommentContextType {
  openModal: boolean;
  selectedText: string;
  setOpenModal: (open: boolean) => void;
  setSelectedText: (text: string) => void;
}

const CommentContext = createContext<CommentContextType | undefined>(undefined);

export function CommentProvider({ children }: PropsWithChildren) {
  const [openModal, setOpenModal] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  return (
    <CommentContext.Provider value={{ openModal, selectedText, setOpenModal, setSelectedText }}>
      {children}
    </CommentContext.Provider>
  );
}

export function useCommentContext() {
  const context = useContext(CommentContext);
  if (context === undefined) {
    throw new Error('useCommentContext must be used within a CommentProvider');
  }
  return context;
}
