import { ChevronRight } from 'lucide-react';
import { type ParagraphSearchResult } from '../services/paragraph.service';
import { Icons } from './icons';
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
          <h4 className="sm:text-md mb-2 truncate text-sm font-semibold text-secondary">{paragraph.roll?.title}</h4>
          <p className="line-clamp-2 text-sm text-muted-foreground">{paragraph.content}</p>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
export const ParagraphDetail = ({ paragraph }: { paragraph: ParagraphSearchResult[number] }) => {
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
          <h4 className="text-md font-semibold text-secondary">{paragraph.roll?.title}</h4>
        </div>
        <p className="text-sm text-muted-foreground">{paragraph.content}</p>
        {paragraph.children && <Divider>{paragraph.children?.language.toUpperCase()}</Divider>}
        {paragraph.children && <p className="text-sm text-muted-foreground">{paragraph.children.content}</p>}
      </CardContent>
      <Separator className="px-2" />
      <CardFooter className="flex-col items-center justify-between pt-6 text-sm text-muted-foreground lg:flex-row">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="flex items-center gap-2">
            <Icons.User className="h-4 w-4" />
            <span>{paragraph.updatedBy}</span>
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
