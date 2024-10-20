import { cn } from '~/lib/utils';
import * as React from 'react';

export interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {}

const Spacer = React.forwardRef<HTMLDivElement, SpacerProps>(({ className, ...props }, ref) => {
  return <div className={cn('h-4', className)} ref={ref} {...props} />;
});
Spacer.displayName = 'Spacer';

export { Spacer };
