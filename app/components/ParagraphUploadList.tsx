import { ChevronRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import Markdown from 'react-markdown';

import { Icons } from './icons';
import { Card, CardContent, CardHeader, ScrollArea } from './ui';

interface ParagraphReference {
  sutraName: string;
  content: string;
  order: string;
}

interface ParagraphUploadData {
  originSutra: string;
  targetSutra: string;
  references: ParagraphReference[];
}

interface ParagraphUploadListProps {
  paragraphs: ParagraphUploadData[];
}

export const ParagraphUploadList = React.forwardRef<HTMLDivElement, ParagraphUploadListProps>(({ paragraphs }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const selectedParagraph = useMemo(() => {
    return paragraphs[selectedIndex ?? 0];
  }, [paragraphs, selectedIndex]);

  if (!paragraphs.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 pb-0 lg:flex-row lg:gap-4">
      <div className="order-1 h-[calc(50vh-6rem)] w-full lg:order-2 lg:h-[calc(100vh-12rem)] lg:w-1/2">
        <ScrollArea className="h-full lg:pr-4">
          <div className="h-full rounded-lg bg-gradient-to-r from-blue-600 to-slate-700 p-0.5">
            {selectedParagraph ? (
              <ParagraphUploadDetail paragraph={selectedParagraph} />
            ) : (
              <div>No paragraph selected</div>
            )}
          </div>
        </ScrollArea>
      </div>
      <div className="order-2 h-[calc(50vh-6rem)] w-full lg:order-1 lg:h-[calc(100vh-12rem)] lg:w-1/2">
        <ScrollArea ref={ref} className="h-full lg:pr-4">
          <ul>
            {paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => (
                <li
                  key={`paragraph-${index}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`mb-2 ${selectedIndex === index ? 'rounded-lg bg-gradient-to-r from-blue-600 to-slate-700 p-0.5' : ''}`}
                >
                  <ParagraphUploadItem paragraph={paragraph} />
                </li>
              ))
            ) : (
              <div>No paragraphs found</div>
            )}
          </ul>
        </ScrollArea>
      </div>
    </div>
  );
});

ParagraphUploadList.displayName = 'ParagraphUploadList';

interface ParagraphUploadItemProps {
  paragraph: ParagraphUploadData;
}

export function ParagraphUploadItem({ paragraph }: ParagraphUploadItemProps) {
  return (
    <Card className="w-full cursor-pointer transition-all duration-300 ease-in-out hover:shadow-md">
      <CardContent className="flex items-center space-x-4 p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h3 className="mb-2 line-clamp-2 text-lg font-semibold text-primary sm:text-xl">{paragraph.originSutra}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">{paragraph.targetSutra}</p>
          {paragraph.references.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Icons.Book className="h-3 w-3" />
              <span>
                {paragraph.references.length} reference{paragraph.references.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

interface ParagraphUploadDetailProps {
  paragraph: ParagraphUploadData;
}

export const ParagraphUploadDetail = ({ paragraph }: ParagraphUploadDetailProps) => {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="px-4 py-4">
        <div className="flex items-center gap-2">
          <Icons.FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-primary">Paragraph Preview</h2>
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto px-4 pb-4">
        <div className="space-y-6">
          {/* Chinese Paragraph */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Chinese</h3>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-base leading-relaxed text-slate-900">{paragraph.originSutra}</p>
            </div>
          </div>

          {/* English Paragraph */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">English</h3>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-base leading-relaxed text-slate-900">{paragraph.targetSutra}</p>
            </div>
          </div>

          {/* References */}
          {paragraph.references.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                References ({paragraph.references.length})
              </h3>
              <div className="space-y-3">
                {paragraph.references.map((reference, index) => (
                  <div key={`ref-${index}`} className="border-l-4 border-primary pl-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Icons.Book className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-primary">{reference.sutraName}</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-sm leading-relaxed text-slate-700">
                        <Markdown
                          components={{
                            code(props) {
                              const { node, ...rest } = props;
                              return <span className="rounded bg-yellow-200 px-1" {...rest} />;
                            },
                          }}
                        >
                          {reference.content}
                        </Markdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
