import { useOutletContext, useFetcher } from '@remix-run/react';
import { useMemo, useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { ClientOnly } from 'remix-utils/client-only';

import type { ReadComment } from '../../drizzle/tables/comment';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, Switch, Divider, SheetDescription } from './ui';

// Define a more flexible type for comments to handle both string and Date for timestamps
type FlexibleComment = Omit<ReadComment, 'updatedAt' | 'deletedAt' | 'createdAt'> & {
  updatedAt: Date | string;
  deletedAt: Date | string | null;
  createdAt: Date | string;
};

type ParagraphProps = {
  id: string;
  text: string;
  title?: string;
  isOrigin?: boolean;
  isSelected?: boolean;
  isUpdate?: boolean;
  comments?: FlexibleComment[];
};

// Helper function to get user initials
const getUserInitials = (username: string) => {
  // Check if username contains space (indicating first and last name)
  if (username.includes(' ')) {
    const nameParts = username.split(' ');
    // Get first letter of first name and first letter of last name
    return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
  }
  // If no space, use first two letters
  return username.slice(0, 2).toUpperCase();
};

const CommentAvatar = ({
  comment,
  users,
}: {
  comment: FlexibleComment;
  users: { id: string; username: string; email: string }[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const userName = useMemo(() => {
    const userId = comment.messages?.[0]?.userId;
    if (!userId) return 'UN';

    const user = users.find((u) => u.id === userId);
    if (!user) return 'UN';

    // Get initials with improved logic
    return getUserInitials(user.username);
  }, [comment, users]);

  const { user: currentUser } = useOutletContext<{ user: { id: string; username: string; email: string } }>();

  const numOfNewMessages = useMemo(() => {
    let count = 0;
    if (!comment.messages) return 0;

    for (const msg of [...comment.messages].reverse()) {
      if (msg.userId === currentUser?.id) break;
      count++;
    }
    return count;
  }, [comment, currentUser]);

  return (
    <ClientOnly
      fallback={
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white bg-primary text-xs font-medium text-primary-foreground shadow-sm">
          {userName}
        </div>
      }
    >
      {() => (
        <>
          <div className="relative">
            <CommentWorkspace
              users={users}
              isOpen={isOpen}
              comment={comment}
              userName={userName}
              setIsOpen={setIsOpen}
            />
            {isOpen && (
              <div className="absolute -left-1 -top-1 h-3 w-3 rounded-full border border-white bg-amber-500"></div>
            )}
            {numOfNewMessages > 0 && (
              <div className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-xs text-white">
                {numOfNewMessages}
              </div>
            )}
          </div>
        </>
      )}
    </ClientOnly>
  );
};

export const CommentWorkspace = ({
  userName,
  comment,
  users,
  isOpen,
  setIsOpen,
}: {
  userName: string;
  comment: FlexibleComment;
  users: { id: string; username: string; email: string }[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const { user: currentUser } = useOutletContext<{ user: { id: string; username: string; email: string } }>();
  const [message, setMessage] = useState('');
  const [isResolved, setIsResolved] = useState(0);
  const maxLength = 150;
  const formRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher();

  const scrollToBottom = () => {
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    }, 100);
  };

  // Scroll to bottom when messages change or when sheet opens
  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, comment.messages]);

  // Scroll on first render
  useEffect(() => {
    scrollToBottom();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter, but allow Shift+Enter for line breaks
    if (e.key === 'Enter' && !e.shiftKey && message.trim()) {
      e.preventDefault();
      fetcher.submit(
        {
          commentId: comment.id,
          kind: 'updateComment',
          message,
          resolved: '0',
        },
        {
          method: 'post',
          action: window.location.pathname,
        },
      );
      setMessage('');
      // Force scroll after sending
      scrollToBottom();
    }
  };

  const handleResolvedChange = (checked: boolean) => {
    if (checked) {
      // Set state for UI
      setIsResolved(1);

      // Submit using fetcher
      fetcher.submit(
        {
          commentId: comment.id,
          kind: 'updateComment',
          message,
          resolved: '1',
        },
        {
          method: 'post',
          action: window.location.pathname,
        },
      );

      // Close the sheet
      setIsOpen(false);
      setMessage('');
    } else {
      setIsResolved(0);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white bg-primary text-xs font-medium text-primary-foreground shadow-sm">
          {userName}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-full max-w-md flex-col border-r-2 border-yellow-600">
        <SheetHeader>
          <SheetTitle>Comment Thread</SheetTitle>
          <SheetDescription className="hidden">Comments</SheetDescription>
        </SheetHeader>

        <div ref={messagesContainerRef} className="my-4 flex h-full flex-1 flex-col gap-3 overflow-y-auto pr-2">
          <Markdown
            components={{ code: ({ node, ...props }) => <code {...props} className="rounded-sm bg-yellow-300" /> }}
          >
            {comment.selectedText}
          </Markdown>
          <Divider className="my-2">Messages</Divider>
          <div className="flex min-h-min flex-col gap-3">
            {comment.messages &&
              comment.messages.map((message, index) => {
                // Find the user by userId
                const user = users.find((u) => u.id === message.userId);
                const userInitials = user ? getUserInitials(user.username) : message.userId.slice(0, 2).toUpperCase();

                const isCurrentUser = message.userId === currentUser?.id;

                return (
                  <div key={index} className={`flex flex-col ${isCurrentUser ? 'items-start' : 'items-end'}`}>
                    <div className={`mb-1 flex items-center gap-2 ${isCurrentUser ? '' : 'flex-row-reverse'}`}>
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 bg-primary text-xs font-medium text-primary-foreground">
                        {userInitials}
                      </div>
                      <span className="text-xs text-gray-500">
                        {user?.username || 'Unknown'} • {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-1 ${
                        isCurrentUser ? 'ml-8 bg-slate-100' : 'mr-8 bg-primary text-primary-foreground'
                      }`}
                    >
                      {message.text}
                    </div>
                  </div>
                );
              })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <fetcher.Form ref={formRef} method="post" className="mt-auto border-t pt-4">
          <div className="relative">
            <textarea
              name="message"
              value={message}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Press Enter to send)"
              onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
              className="min-h-[90px] w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-md"
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-3 text-gray-600">
              <div className="relative">
                <Switch
                  id="resolved-switch"
                  checked={Boolean(isResolved)}
                  onCheckedChange={handleResolvedChange}
                  className="bg-slate-200 data-[state=checked]:bg-primary"
                />
              </div>
              <span className="text-sm font-medium">Mark as resolved</span>
            </label>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
};

export const Paragraph = ({
  id,
  text,
  title,
  isOrigin,
  isSelected = false,
  isUpdate = false,
  comments = [],
}: ParagraphProps) => {
  const { users, user } = useOutletContext<{
    users: { id: string; username: string; email: string }[];
    user: { id: string; username: string; email: string; role: string };
  }>();

  return (
    <div
      data-id={id}
      className={`relative h-full w-full rounded-xl ${
        isSelected
          ? 'bg-gradient-to-r from-yellow-600 to-slate-700 p-2 shadow-xl'
          : `${isOrigin ? 'bg-card' : 'bg-card-foreground'} px-6 py-4 shadow-lg`
      } ${isUpdate ? 'animate-[pulse_1s_ease-in-out_1]' : ''}`}
    >
      {user.role !== 'reader' && comments.length > 0 && (
        <div className="absolute right-0 top-2 z-10 flex translate-x-4 flex-col gap-1">
          {comments.map((comment) => (
            <CommentAvatar users={users} key={comment.id} comment={comment} />
          ))}
        </div>
      )}
      <div
        className={`w-full ${isSelected ? `${isOrigin ? 'bg-card-foreground' : 'bg-card-foreground'} h-full rounded-xl px-6 py-4` : ''}`}
      >
        {title && <div className="text-md font-medium text-black">{title}</div>}
        <p className="text-md text-slate-500">{text}</p>
      </div>
    </div>
  );
};
