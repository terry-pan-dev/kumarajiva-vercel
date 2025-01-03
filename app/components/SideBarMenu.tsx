import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Form, Link, NavLink, useFetcher, useLocation, useNavigation } from '@remix-run/react';
import { useDebounce } from '@uidotdev/usehooks';
import { Book, BookCopy, Cog, Home, LogOut, Search, Sheet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { match } from 'ts-pattern';

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
  Label,
  RadioGroupItem,
  RadioGroup,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import { type UserRole } from '~/drizzle/tables/enums';
import favicon from '~/images/favicon-32x32.png';
import { cn } from '~/lib/utils';

import { type ReadGlossary } from '../../drizzle/schema';
import { type ParagraphSearchResult } from '../services/paragraph.service';
import { GlossaryDetail, GlossaryItem } from './GlossaryList';
import { Icons } from './icons';
import { ParagraphDetail, ParagraphItem } from './ParagraphList';
import { useSearchContext } from './SearchContext';
import { useSideBarMenuContext } from './SideBarMenuContext';

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
  const { isOpen } = useSideBarMenuContext();
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
      <div
        className={cn(
          'flex min-h-screen flex-col bg-primary shadow-md transition-all duration-300',
          isOpen ? 'w-64 items-stretch px-4' : 'w-14 items-center px-2',
        )}
      >
        <div className="relative flex w-full py-2">
          <Link
            to="/"
            aria-label="Logo"
            className={cn('flex items-center', isOpen ? 'w-full justify-start' : 'w-full justify-center')}
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-yellow-600 font-mono text-xl font-bold text-white">
              <img src={favicon} sizes="32x32" alt="home favicon" />
              {navigation.state === 'loading' && !isOpen && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-yellow-600/80">
                  <Icons.Loader className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            {isOpen && <span className="ml-3 text-xl font-semibold text-white">Kumarajiva</span>}
            {navigation.state === 'loading' && isOpen && (
              <Icons.Loader className="ml-auto h-5 w-5 animate-spin text-white" />
            )}
          </Link>
        </div>

        <nav className="flex w-full flex-1 flex-col gap-1 border-y border-yellow-600 py-4">
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
                    aria-label={item.label}
                    className={cn(
                      'flex items-center py-3 text-md font-medium text-white',
                      isOpen ? 'justify-start px-6' : 'justify-center px-3',
                      'hover:bg-slate-200/50 hover:text-yellow-600',
                      pathname.startsWith(item.href)
                        ? 'active rounded-md bg-slate-200 text-yellow-600'
                        : 'bg-transparent hover:rounded-md',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn('h-5 w-5', isOpen && 'mr-3', isActive && 'text-yellow-600')} />
                        {isOpen && <span>{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className={cn(isOpen && 'hidden')}>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                onClick={() => setOpen(true)}
                className={cn(
                  'flex cursor-pointer items-center py-3 text-md font-medium text-white',
                  isOpen ? 'justify-start px-6' : 'justify-center px-3',
                  'hover:rounded-md hover:bg-slate-200/50 hover:text-yellow-600',
                )}
              >
                <Search className={cn('h-5 w-5', isOpen && 'mr-3')} />
                {isOpen && <span>Search ⌘+K</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className={cn(isOpen && 'hidden')}>
              <p>Search</p>
            </TooltipContent>
          </Tooltip>
        </nav>

        <div className="py-2">
          <div
            className={cn('flex items-center gap-2', isOpen ? 'flex-row justify-between' : 'flex-col justify-center')}
          >
            <Link to="/settings" aria-label="settings" className="flex items-center">
              <Avatar className="h-10 w-10 rounded-md">
                <AvatarImage alt="avatar" src={avatarSrc || ''} />
                <AvatarFallback className="bg-yellow-600 text-white">{avatarFallback}</AvatarFallback>
              </Avatar>
              {isOpen && (
                <div className="ml-3 max-w-28">
                  <p className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-white">
                    {userRole.toUpperCase()}
                  </p>
                  <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-blue-200">{userEmail}</p>
                </div>
              )}
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <Form method="post" action="/logout">
                  <button type="submit">
                    <LogOut className="h-5 w-5 text-white hover:text-yellow-600" />
                  </button>
                </Form>
              </TooltipTrigger>
              <TooltipContent side="right" className={cn(isOpen && 'hidden')}>
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
  const lastQuery = useRef<string>('');
  const [filter, setFilter] = useState<'Glossary' | 'Paragraph' | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<[number, 'Glossary' | 'Paragraph' | null]>([0, null]);

  const filteredResults = useMemo(() => {
    const result =
      fetcher.data?.search.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
      })) || [];
    if (filter) {
      setSelectedIndex([0, null]);
      const filtered = result.filter((item) => item.type === filter);
      return filtered;
    }
    return result;
  }, [fetcher.data, filter]);

  useEffect(() => {
    if (debouncedSearch.length > 1) {
      const query = filter ? `/search?query=${debouncedSearch}&type=${filter}` : `/search?query=${debouncedSearch}`;
      if (query !== lastQuery.current) {
        fetcher.load(query);
        lastQuery.current = query;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filter, filteredResults]);

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

  useEffect(() => {
    if (!open) {
      setSearch('');
      setFilter(null);
      fetcher.load(`/search?query=${''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <ClientOnly fallback={<div className="h-0 w-0">Loading...</div>}>
      {() => (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent showClose={false} className="top-[5%] max-w-2xl translate-y-0 bg-secondary p-0.5 lg:max-w-4xl">
            <VisuallyHidden>
              <DialogHeader>
                <DialogTitle>Search</DialogTitle>
                <DialogDescription>Search for a term in the glossary, reference, or translation.</DialogDescription>
              </DialogHeader>
            </VisuallyHidden>
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center rounded-md bg-white">
                <InputWithRightSegments
                  autoFocus
                  type="text"
                  value={search}
                  setValue={setSearch}
                  onFilterClick={setFilter}
                  placeholder="Type to search...(max 50 characters)"
                  isLoading={fetcher.state === 'loading' || fetcher.state === 'submitting'}
                  className="w-full rounded-xl border-none text-md focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              {debouncedSearch.length > 0 && filteredResults?.length === 0 && fetcher.data?.success && (
                <div className="h-full bg-secondary">
                  <p className="p-4 text-center text-sm text-gray-500">No results found.</p>
                </div>
              )}

              {debouncedSearch.length > 0 && fetcher.state === 'idle' && filteredResults?.length > 0 && (
                <div className="h-full bg-secondary">
                  <div className="h-2"></div>
                  <SearchResultList
                    results={filteredResults}
                    selectedIndex={selectedIndex}
                    setSelectedIndex={setSelectedIndex}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ClientOnly>
  );
};

interface InputWithIconsProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onFilterClick: (filter: 'Paragraph' | 'Glossary' | null) => void;
  value: string;
  setValue: (value: string) => void;
  isLoading?: boolean;
}
const InputWithRightSegments = ({ onFilterClick, isLoading, setValue, value, ...props }: InputWithIconsProps) => {
  const handleFilterClick = (filter: 'Paragraph' | 'Glossary' | 'Both') => {
    console.log('filter', { filter });
    if (filter === 'Both') {
      onFilterClick(null);
    } else {
      onFilterClick(filter);
    }
  };

  return (
    <div className="relative w-full">
      <RadioGroup
        defaultValue="Both"
        className="flex flex-wrap justify-start gap-4 p-1"
        onValueChange={(value) => handleFilterClick(value as 'Paragraph' | 'Glossary' | 'Both')}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem id="glossary" value="Glossary" />
          <Label htmlFor="glossary" className="cursor-pointer text-sm font-medium">
            Glossary
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem id="sutra" value="Paragraph" />
          <Label htmlFor="sutra" className="cursor-pointer text-sm font-medium">
            Sutra
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem id="both" value={'Both'} />
          <Label htmlFor="both" className="cursor-pointer text-sm font-medium">
            Both
          </Label>
        </div>
      </RadioGroup>
      <div>
        <Input {...props} value={value} type="search" maxLength={50} onChange={(e) => setValue(e.target.value)} />
        <div className="absolute inset-y-0 right-0 flex items-center">
          {isLoading && (
            <div className="flex aspect-square h-full items-center justify-center">
              <Icons.Loader className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface SearchResultListProps {
  setSelectedIndex: (index: [number, 'Glossary' | 'Paragraph' | null]) => void;
  selectedIndex: [number, 'Glossary' | 'Paragraph' | null];
  results: ((ReadGlossary & { type: 'Glossary' }) | (ParagraphSearchResult[number] & { type: 'Paragraph' }))[];
}
const SearchResultList = ({ results, setSelectedIndex, selectedIndex }: SearchResultListProps) => {
  const selectedResult = useMemo(() => {
    console.log({ selectedIndex, results });
    if (results.length > 0) {
      if (selectedIndex[1]) {
        return results[selectedIndex[0]] as ParagraphSearchResult[number] | ReadGlossary;
      } else {
        return results[0] as ParagraphSearchResult[number] | ReadGlossary;
      }
    }
    return [];
  }, [selectedIndex, results]);
  return (
    <div className="flex h-[calc(100vh-10rem)] gap-1 lg:gap-4">
      <ScrollArea className="w-1/2 gap-4 pr-4">
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
      <ScrollArea className="w-1/2 gap-4 pr-4">
        <div className="h-full rounded-lg bg-gradient-to-r from-yellow-600 to-slate-700 p-0.5">
          <ClientOnly fallback={<div>Loading...</div>}>
            {() =>
              match(selectedIndex[1])
                .with('Glossary', () => <GlossaryDetail showEdit={false} glossary={selectedResult as ReadGlossary} />)
                .with('Paragraph', () => (
                  <ParagraphDetail paragraph={selectedResult as ParagraphSearchResult[number]} />
                ))
                .otherwise(() =>
                  match(results[0])
                    .with({ type: 'Glossary' }, (glossary) => <GlossaryDetail showEdit={false} glossary={glossary} />)
                    .with({ type: 'Paragraph' }, (paragraph) => <ParagraphDetail paragraph={paragraph} />)
                    .otherwise(() => null),
                )
            }
          </ClientOnly>
        </div>
      </ScrollArea>
    </div>
  );
};
