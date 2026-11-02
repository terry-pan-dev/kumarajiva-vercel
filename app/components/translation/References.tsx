import { ChevronsDownUp, ChevronsUpDown, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui';
import { type ParagraphReference } from '~/services/text.service';

import { WorkspaceCard } from './WorkspaceCard';

// e.g. "Thomas Cleary · The Flower Ornament Scripture (p. 14)": who made it
// first, since that is what tells references of the same work apart.
const referenceTitle = ({ contributors, title, metadata }: ParagraphReference) => {
  const label = [contributors.join(', '), title].filter(Boolean).join(' · ');
  return metadata?.page ? `${label} (p. ${metadata.page})` : label;
};

// The project's reference texts for one paragraph. The first stays visible;
// the rest fold away so they don't push the AI translation off screen.
export const References = ({
  references,
  pasteTranslation,
}: {
  references: ParagraphReference[];
  pasteTranslation: (text: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);

  // A reference document may not cover every passage yet.
  const available = references.filter(
    (reference): reference is ParagraphReference & { content: string } => reference.content !== null,
  );
  if (!available.length) return null;

  const toCard = (reference: ParagraphReference & { content: string }) => (
    <WorkspaceCard
      text={reference.content}
      key={reference.documentId}
      title={referenceTitle(reference)}
      buttons={
        <Button
          size="icon"
          variant="ghost"
          onClick={() => pasteTranslation(reference.content)}
          className="transition-transform duration-300 hover:scale-110"
        >
          <Copy className="h-4 w-4" />
        </Button>
      }
    />
  );

  const [first, ...rest] = available;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full gap-2">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h3 className="text-md font-semibold">References</h3>
        {rest.length ? (
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="ghost">
              {isOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              <span className="sr-only">Toggle</span>
            </Button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {toCard(first)}
      <CollapsibleContent className="gap-2">{rest.map(toCard)}</CollapsibleContent>
    </Collapsible>
  );
};
