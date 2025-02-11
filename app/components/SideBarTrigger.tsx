import { useScreenSize } from '../lib/hooks/useScreenSizeHook';
import { cn } from '../lib/utils';
import { Icons } from './icons';
import { useSideBarMenuContext } from './SideBarMenuContext';

interface SideBarTriggerProps {
  className?: string;
}

export function SideBarTrigger({ className }: SideBarTriggerProps) {
  const { isOpen, setIsOpen } = useSideBarMenuContext();
  const isSmallScreen = useScreenSize();
  if (isSmallScreen) {
    return null;
  }

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      className={cn('flex h-6 w-6 items-center justify-center text-primary', className)}
    >
      {isOpen ? <Icons.PanelRightOpen className="h-6 w-6" /> : <Icons.PanelLeftOpen className="h-6 w-6" />}
    </button>
  );
}
