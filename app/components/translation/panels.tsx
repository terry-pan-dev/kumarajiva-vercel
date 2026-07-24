import { type PropsWithChildren } from 'react';

import { ResizablePanel, ResizablePanelGroup } from '~/components/ui';

const PANEL_IDS = { left: 'translation-left', right: 'translation-right' };
const DEFAULT_LAYOUT = { [PANEL_IDS.left]: 50, [PANEL_IDS.right]: 50 };

export const LeftPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={30} defaultSize={50} id={PANEL_IDS.left}>
      <div className="flex h-full items-center justify-center pr-2">{children}</div>
    </ResizablePanel>
  );
};

export const RightPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={40} defaultSize={50} id={PANEL_IDS.right}>
      <div className="flex h-full items-center justify-center pb-2 lg:pl-8">{children}</div>
    </ResizablePanel>
  );
};

export const DragPanel = ({ children, orientation }: PropsWithChildren<{ orientation: 'horizontal' | 'vertical' }>) => {
  return (
    <ResizablePanelGroup orientation={orientation} defaultLayout={DEFAULT_LAYOUT} className="flex w-full rounded-lg">
      {children}
    </ResizablePanelGroup>
  );
};
