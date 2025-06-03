import * as React from 'react';

import { cn } from '~/lib/utils';

export const Divider = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="separator"
        className={cn(
          'flex items-center py-3 text-sm font-semibold text-primary before:me-6 before:flex-1 before:border-t before:border-primary after:ms-6 after:flex-1 after:border-t after:border-primary dark:text-white dark:before:border-neutral-600 dark:after:border-neutral-600',
          className,
        )}
        {...props}
      />
    );
  },
);

Divider.displayName = 'Divider';
