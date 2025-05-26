import { useEffect, useState, type PropsWithChildren } from 'react';

import { Can } from '../authorisation/can';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '../components/ui/context-menu';
import { useCommentContext } from './CommentContext';
import { Icons } from './icons';
import { useSearchContext } from './SearchContext';

export default function ContextMenuWrapper({ children }: PropsWithChildren) {
  const [selectedText, setSelectedText] = useState('');
  const { setOpen, setSearch } = useSearchContext(); // Add this line
  const { setOpenModal } = useCommentContext();

  const handleSearch = () => {
    if (selectedText) {
      setOpen(true);
      setSearch(selectedText.slice(0, 50));
    }
  };

  const handleAddComment = () => {
    setOpenModal(true);
  };

  // Handle text selection
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection();
      if (selection && selection.toString().length > 0 && selection.anchorNode) {
        const selectedText = selection.toString().trim();
        setSelectedText(selectedText);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);

    // Cleanup event listener on component unmount
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedText('');
    }
  };

  return (
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger className="block h-full w-full">{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuItem
          disabled={!selectedText}
          onClick={() => handleSearch()}
          className="flex cursor-pointer items-center"
        >
          <Icons.Search className="mr-2 h-4 w-4" />
          Search Glossary
          <ContextMenuShortcut>⌘K</ContextMenuShortcut>
        </ContextMenuItem>
        <Can I="Create" this="Comment">
          <ContextMenuItem
            disabled={!selectedText}
            onClick={handleAddComment}
            className="flex cursor-pointer items-center"
          >
            <Icons.CommentAdd className="mr-2 h-4 w-4" />
            Add Comments
          </ContextMenuItem>
        </Can>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => window.history.back()}>
          Back
          <ContextMenuShortcut>⌘[</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => window.history.forward()}>
          Forward
          <ContextMenuShortcut>⌘]</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => window.location.reload()}>
          Reload
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
