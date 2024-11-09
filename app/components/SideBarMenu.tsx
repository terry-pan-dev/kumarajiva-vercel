import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Form, Link, NavLink, useFetcher, useLocation, useNavigation } from '@remix-run/react';
import { useDebounce } from '@uidotdev/usehooks';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import { type UserRole } from '~/drizzle/tables/enums';
import { cn } from '~/lib/utils';
import { Book, BookCopy, Cog, Home, LogOut, Search, Sheet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { type ReadGlossary } from '../../drizzle/schema';
import { type ParagraphSearchResult } from '../services/paragraph.service';
import { GlossaryDetail, GlossaryItem } from './GlossaryList';
import { Icons } from './icons';
import { ParagraphDetail, ParagraphItem } from './ParagraphList';
import { useSearchContext } from './SearchContext';

const menuItems = [
  { icon: Home, label: 'Home', href: '/dashboard' },
  { icon: Book, label: 'Translation', href: '/translation' },
  { icon: Sheet, label: 'Glossary', href: '/glossary' },
  { icon: BookCopy, label: 'Reference', href: '/reference' },
  { icon: Cog, label: 'Admin', href: '/admin' },
];

interface SideBarMenuProps {
  userName: string;
  userRole: UserRole;
  userEmail: string;
  avatarSrc?: string | null;
}

export function SideBarMenu({
  userName = 'Unknown',
  userRole = 'reader',
  userEmail = 'unknown@btts-kumarajiva.com',
  avatarSrc = '/avatar.jpg',
}: SideBarMenuProps) {
  const navigation = useNavigation();
  const pathname = useLocation().pathname;
  const avatarFallback = userName.charAt(0).toUpperCase();
  const { setOpen, open } = useSearchContext();
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === 'k') {
        setOpen(true);
      }
    };
    document.addEventListener('keydown', (e) => {
      handleKeyDown(e);
    });
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TooltipProvider>
      <div className="flex min-h-screen w-14 flex-col items-center bg-primary px-2 shadow-md lg:w-64 lg:items-stretch lg:px-4">
        <Link to="/" className="flex items-center justify-center py-4 lg:justify-start" aria-label="Logo">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-600 font-mono text-xl font-bold text-white">
            K
          </div>
          <span className="ml-3 hidden text-2xl font-semibold text-white lg:inline">Kumarajiva</span>
          {navigation.state === 'loading' && <Icons.Loader className="ml-auto h-5 w-5 animate-spin text-white" />}
        </Link>

        <nav className="w-full flex-1 overflow-y-auto border-y border-yellow-600 pt-4 lg:px-0">
          {menuItems
            .filter((item) => {
              if (item.href.includes('admin') && userRole !== 'admin') {
                return false;
              }
              if (item.href.includes('reference') && userRole !== 'admin' && userRole !== 'manager') {
                return false;
              }
              return true;
            })
            .map((item) => (
              <Tooltip key={item.href} delayDuration={500}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.href}
                    className={cn(
                      'mb-1 flex items-center justify-center px-3 py-3 text-md font-medium text-white lg:justify-start lg:px-6',
                      'hover:bg-slate-200/50 hover:text-yellow-600 lg:hover:text-white',
                      pathname.startsWith(item.href)
                        ? 'active rounded-md bg-slate-200 text-yellow-600'
                        : 'bg-transparent hover:rounded-md',
                    )}
                    aria-label={item.label}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn('h-5 w-5 lg:mr-3', isActive && 'text-yellow-600')} />
                        <span className="hidden lg:inline">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="lg:hidden">
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={() => setOpen(true)}
                className="mb-1 flex cursor-pointer items-center justify-center px-3 py-3 text-md font-medium text-white hover:rounded-md hover:bg-slate-200/50 hover:text-yellow-600 lg:justify-start lg:px-6 lg:hover:text-white"
              >
                <Search className="h-5 w-5 lg:mr-3" />
                <span className="hidden lg:inline">Search ⌘+K</span>
              </div>
            </TooltipTrigger>

            <TooltipContent side="right">
              <p>Search</p>
            </TooltipContent>
          </Tooltip>
        </nav>

        <div className="mt-auto pt-2 md:py-2">
          <div className="flex flex-col items-center justify-center gap-2 lg:flex-row lg:justify-between">
            <Link to="/settings" className="flex items-center" aria-label="settings">
              <Avatar className="h-10 w-10">
                <AvatarImage src={avatarSrc || ''} alt="avatar" />
                <AvatarFallback className="bg-yellow-600 text-white">{avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="ml-3 hidden max-w-28 lg:block">
                <p className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-white">
                  {userRole.toUpperCase()}
                </p>
                <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-blue-200">{userEmail}</p>
              </div>
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Form action="/logout" method="post">
                  <button type="submit">
                    <LogOut className="h-5 w-5 text-white" />
                  </button>
                </Form>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Logout</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      <SearchBar open={open} setOpen={setOpen} />
    </TooltipProvider>
  );
}

interface SearchBarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SearchBar = ({ open, setOpen }: SearchBarProps) => {
  const { search, setSearch } = useSearchContext();
  const fetcher = useFetcher<{ search: SearchResultListProps['results']; success: boolean }>({ key: 'search' });
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    if (debouncedSearch.length > 1) {
      fetcher.load(`/search?query=${debouncedSearch}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResults = useMemo(() => {
    return (
      fetcher.data?.search.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
      })) || []
    );
  }, [fetcher.data]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      fetcher.load(`/search?query=${''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ClientOnly fallback={<div className="h-0 w-0">Loading...</div>}>
      {() => (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showClose={false}
            className="top-[10%] max-w-2xl translate-y-0 bg-secondary p-0.5 lg:max-w-4xl"
          >
            <VisuallyHidden>
              <DialogHeader>
                <DialogTitle>Search</DialogTitle>
                <DialogDescription>Search for a term in the glossary, reference, or translation.</DialogDescription>
              </DialogHeader>
            </VisuallyHidden>
            <div className="flex flex-col">
              <div className="flex items-center rounded-md bg-white">
                <Input
                  type="text"
                  placeholder="Type to search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                />
                {(fetcher.state === 'loading' || fetcher.state === 'submitting') && (
                  <Icons.Loader className="ml-auto mr-1 h-5 w-5 animate-spin text-slate-500" />
                )}
              </div>
              {debouncedSearch.length > 0 && filteredResults?.length === 0 && fetcher.data?.success && (
                <div className="h-full bg-secondary">
                  <p className="p-4 text-center text-sm text-gray-500">No results found.</p>
                </div>
              )}

              {debouncedSearch.length > 0 && fetcher.state === 'idle' && filteredResults?.length > 0 && (
                <div className="h-full bg-secondary">
                  <div className="h-2"></div>
                  <SearchResultList results={filteredResults} />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ClientOnly>
  );
};

export interface SearchResultListProps {
  results: ((ReadGlossary & { type: 'Glossary' }) | (ParagraphSearchResult[number] & { type: 'Paragraph' }))[];
}
const SearchResultList = ({ results }: SearchResultListProps) => {
  const [selectedIndex, setSelectedIndex] = useState<[number, 'Glossary' | 'Paragraph']>([0, 'Glossary']);

  useEffect(() => {
    if (results.length > 0) {
      setSelectedIndex([0, results[0].type]);
    }
  }, [results]);

  const selectedGlossary = useMemo(() => {
    return results[selectedIndex[0]] as ReadGlossary;
  }, [selectedIndex, results]);
  const selectedParagraph = useMemo(() => {
    return results[selectedIndex[0]] as ParagraphSearchResult[number];
  }, [selectedIndex, results]);
  return (
    <div className="flex gap-1 lg:gap-4">
      <ScrollArea className="h-[calc(100vh-10rem)] w-1/2 gap-4 pr-4">
        {results.map((result, index) => (
          <div
            key={result.id}
            onClick={() => setSelectedIndex([index, result.type])}
            className={`mb-2 ${selectedIndex[0] === index ? 'rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5' : ''}`}
          >
            {result.type === 'Glossary' ? <GlossaryItem glossary={result} /> : <ParagraphItem paragraph={result} />}
          </div>
        ))}
      </ScrollArea>
      <div className="w-1/2">
        <div className="h-full rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5">
          <ClientOnly fallback={<div>Loading...</div>}>
            {() =>
              selectedIndex[1] === 'Glossary' ? (
                <GlossaryDetail glossary={selectedGlossary} showEdit={false} />
              ) : (
                <ParagraphDetail paragraph={selectedParagraph} />
              )
            }
          </ClientOnly>
        </div>
      </div>
    </div>
  );
};
