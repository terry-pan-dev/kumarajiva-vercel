import { Form, Link, NavLink, useLocation, useNavigation } from '@remix-run/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui';
import { cn } from '~/lib/utils';
import { Book, BookCopy, Cog, Home, LogOut, Search, Sheet } from 'lucide-react';
import { Icons } from './icons';

const menuItems = [
  { icon: Home, label: 'Home', href: '/dashboard' },
  { icon: Book, label: 'Translation', href: '/translation' },
  { icon: Sheet, label: 'Glossary', href: '/glossary' },
  { icon: BookCopy, label: 'Reference', href: '/reference' },
  { icon: Cog, label: 'Admin', href: '/admin' },
  { icon: Search, label: 'Search', href: '/search' },
];

interface SideBarMenuProps {
  userName: string;
  userRole: string;
  userEmail: string;
  avatarSrc?: string | null;
}

export function SideBarMenu({
  userName = 'Unknown',
  userRole = 'Reader',
  userEmail = 'unknown@btts-kumarajiva.com',
  avatarSrc = '/avatar.jpg',
}: SideBarMenuProps) {
  const navigation = useNavigation();
  const pathname = useLocation().pathname;
  const avatarFallback = userName.charAt(0).toUpperCase();

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
          {menuItems.map((item) => (
            <Tooltip key={item.href} delayDuration={500}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.href}
                  className={cn(
                    'text-md mb-1 flex items-center justify-center px-3 py-3 font-medium text-white lg:justify-start lg:px-6',
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
        </nav>

        <div className="mt-auto py-4">
          <div className="flex flex-col-reverse items-center justify-center lg:flex-row lg:justify-between">
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
    </TooltipProvider>
  );
}
