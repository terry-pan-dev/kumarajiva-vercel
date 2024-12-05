import * as React from 'react';

import { cn } from '~/lib/utils';

export interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {}

const Spacer = React.forwardRef<HTMLDivElement, SpacerProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('h-4', className)} {...props} />;
});
Spacer.displayName = 'Spacer';

export { Spacer };
