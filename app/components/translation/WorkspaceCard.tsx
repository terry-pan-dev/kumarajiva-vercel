import { type ReactNode } from 'react';
import Markdown from 'react-markdown';

interface WorkspaceCardProps {
  title: string;
  text: string;
  buttons?: ReactNode | undefined;
}

export const WorkspaceCard = ({ title, text, buttons }: WorkspaceCardProps) => {
  return (
    <div className="bg-card-foreground mt-4 flex flex-col justify-start rounded-xl p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-md font-medium">{title}</div>
        <div className="flex items-center">{buttons}</div>
      </div>
      <Markdown
        components={{
          h3(props) {
            return <h3 className="text-md font-semibold" {...props} />;
          },
          p(props) {
            return <p className="text-md text-slate-500" {...props} />;
          },
          code(props) {
            return <span className="rounded bg-yellow-200 px-1" {...props} />;
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
};
