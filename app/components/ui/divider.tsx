import * as React from 'react';

import { cn } from '~/lib/utils';

export const Divider = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center py-3 text-sm text-gray-800 before:me-6 before:flex-1 before:border-t before:border-gray-200 after:ms-6 after:flex-1 after:border-t after:border-gray-200 dark:text-white dark:before:border-neutral-600 dark:after:border-neutral-600',
          className,
        )}
        {...props}
      />
    );
  },
);

Divider.displayName = 'Divider';
