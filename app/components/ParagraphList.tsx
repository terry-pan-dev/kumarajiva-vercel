import highlightWords from 'highlight-words';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { type ParagraphSearchResult } from '../services/paragraph.service';
import { Icons } from './icons';
import { useSearchContext } from './SearchContext';
import { Card, CardContent, CardFooter } from './ui/card';
import { Divider } from './ui/divider';
import { Separator } from './ui/separator';

export const ParagraphList = () => {
  return <div>ParagraphList</div>;
};
interface ParagraphItemProps {
  paragraph: ParagraphSearchResult[number];
}
export function ParagraphItem({ paragraph }: ParagraphItemProps) {
  return (
    <Card className="w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md">
      <CardContent className="flex items-center space-x-4 p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          {/* <div className="mb-1 flex items-center">
              <Badge variant="default" className="mr-2 font-mono text-xs font-medium">
                {glossary.sutraName}
              </Badge>
            </div> */}
          <h3 className="mb-1 truncate text-lg font-semibold text-primary sm:text-xl">{paragraph.sutra?.title}</h3>
          <h4 className="mb-2 truncate font-mono text-sm font-semibold text-secondary-foreground sm:text-md">
            {paragraph.roll?.title}
          </h4>
          <p className="line-clamp-2 text-sm text-muted-foreground">{paragraph.content}</p>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
export const ParagraphDetail = ({ paragraph }: { paragraph: ParagraphSearchResult[number] }) => {
  const { search, allUsers } = useSearchContext();

  const updatedBy = useMemo(() => {
    return allUsers.find((user) => user.id === paragraph.updatedBy)?.username || 'unknown';
  }, [allUsers, paragraph.updatedBy]);

  return (
    <Card className="flex h-full flex-col">
      {/* <CardHeader className="flex-row items-center justify-between pb-0">
        <fetcher.Form method="post" action="/glossary?index">
          <input type="hidden" name="glossaryId" value={glossary.id} />
          <button type="submit" name="bookmark" value={isBookmarked ? 'false' : 'true'}>
            <Icons.BookMark className={`h-6 w-6 ${isBookmarked ? 'fill-red-500 text-red-500' : 'text-slate-800'}`} />
          </button>
        </fetcher.Form>
        {showEdit && (
          <div>
            <Icons.SquarePen className="h-6 w-6 text-slate-800" />
          </div>
        )}
      </CardHeader> */}
      <CardContent className="flex-grow">
        <div className="my-2 flex flex-col items-start gap-2">
          <h3 className="text-xl font-semibold tracking-tight text-primary">{paragraph.sutra?.title}</h3>
          <h4 className="font-mono text-md font-semibold text-secondary-foreground">{paragraph.roll?.title}</h4>
        </div>
        <TextWithHighlight content={paragraph.content} search={search} />
        {paragraph.children && <Divider>{paragraph.children?.language.toUpperCase()}</Divider>}
        {paragraph.children && <p className="text-sm text-muted-foreground">{paragraph.children.content}</p>}
      </CardContent>
      <Separator className="px-2" />
      <CardFooter className="flex-col items-center justify-between pt-6 text-sm text-muted-foreground lg:flex-row">
        <div className="flex w-full flex-col justify-between gap-2 md:flex-row">
          <div className="flex items-center gap-2">
            <Icons.User className="h-4 w-4" />
            <span>{updatedBy}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.Clock className="h-4 w-4" />
            <span>{paragraph.updatedAt.toLocaleDateString()}</span>
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
        <p className="text-sm text-muted-foreground">
          {chunks.map(({ text, match, key }) =>
            match ? (
              <span className="rounded-sm bg-yellow-300 box-decoration-clone px-1" key={key}>
                {text}
              </span>
            ) : (
              <span className="box-decoration-clone" key={key}>
                {text}
              </span>
            ),
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{content}</p>
      )}
    </>
  );
};
