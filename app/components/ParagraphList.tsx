import highlightWords from 'highlight-words';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { type ParagraphSearchResult } from '~/services/paragraph.search';

import { Icons } from './icons';
import { useSearchContext } from './SearchContext';
import { Badge } from './ui/badge';
import { Card, CardContent, CardFooter } from './ui/card';
import { Divider } from './ui/divider';
import { Separator } from './ui/separator';

export const ParagraphList = () => {
  return <div>ParagraphList</div>;
};
interface ParagraphItemProps {
  paragraph: ParagraphSearchResult;
}

// Where a paragraph sits, most specific last: work, then document and section.
function Location({ paragraph }: ParagraphItemProps) {
  return (
    <>
      <h3 className="text-primary mb-1 truncate text-lg font-semibold sm:text-xl">{paragraph.work.title}</h3>
      <h4 className="text-secondary-foreground sm:text-md mb-2 truncate font-mono text-sm font-semibold">
        {paragraph.document.title}
        {paragraph.section.title && ` · ${paragraph.section.title}`}
      </h4>
    </>
  );
}

export function ParagraphItem({ paragraph }: ParagraphItemProps) {
  return (
    <Card className="w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md">
      <CardContent className="flex items-center space-x-4 p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <Location paragraph={paragraph} />
          <p className="text-muted-foreground line-clamp-2 text-sm">{paragraph.content}</p>
        </div>
        <ChevronRight className="text-muted-foreground h-5 w-5 flex-shrink-0" />
      </CardContent>
    </Card>
  );
}

export const ParagraphDetail = ({ paragraph }: ParagraphItemProps) => {
  const { search, allUsers } = useSearchContext();

  const updatedBy = useMemo(() => {
    return allUsers.find((user) => user.id === paragraph.updatedBy)?.username || 'unknown';
  }, [allUsers, paragraph.updatedBy]);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex-grow">
        <div className="my-2 flex flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="font-mono text-xs font-medium">
              {`¶ ${paragraph.order}`}
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs font-medium">
              {paragraph.document.language.toUpperCase()}
            </Badge>
          </div>
          <Location paragraph={paragraph} />
        </div>
        <TextWithHighlight search={search} content={paragraph.content} />
        {/* The same passage in the work's other documents. */}
        {paragraph.aligned.map((aligned) => (
          <div key={aligned.id}>
            <Divider>{`${aligned.document.title} · ${aligned.document.language.toUpperCase()}`}</Divider>
            <p className="text-muted-foreground text-sm">{aligned.content}</p>
          </div>
        ))}
      </CardContent>
      <Separator className="px-2" />
      <CardFooter className="text-muted-foreground flex-col items-center justify-between pt-6 text-sm lg:flex-row">
        <div className="flex w-full flex-col justify-between gap-2 md:flex-row">
          <div className="flex items-center gap-2">
            <Icons.User className="h-4 w-4" />
            <span>{updatedBy}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.Clock className="h-4 w-4" />
            {/* Loader data arrives as JSON, so the date can be a string here. */}
            <span>{new Date(paragraph.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

const TextWithHighlight = ({ content, search }: { content: string; search: string }) => {
  const chunks = useMemo(() => {
    return highlightWords({
      text: content,
      query: search,
      matchExactly: true,
    });
  }, [content, search]);

  return (
    <>
      {chunks?.length ? (
        <p className="text-muted-foreground text-sm">
          {chunks.map(({ text, match, key }) =>
            match ? (
              <span key={key} className="rounded-sm bg-yellow-300 box-decoration-clone px-1">
                {text}
              </span>
            ) : (
              <span key={key} className="box-decoration-clone">
                {text}
              </span>
            ),
          )}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{content}</p>
      )}
    </>
  );
};
