import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';

import { Button, Input } from '~/components/ui';
import { WORKING_DOCUMENT_FONTS, type WorkingDocumentBlock } from '~/validations/workingDocument.validation';

// Close-enough fonts for the on-screen preview, where the document fonts may
// not be installed.
const PREVIEW_FONT_STACKS: Record<string, string> = {
  'Noto Serif TC': "'Noto Serif TC', 'Songti TC', 'PMingLiU', serif",
  'Noto Sans TC': "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Palatino Linotype': "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Garamond: "Garamond, 'EB Garamond', serif",
};

function BlockRow({
  block,
  name,
  onChange,
}: {
  block: WorkingDocumentBlock;
  name: string;
  onChange: (patch: Partial<WorkingDocumentBlock>) => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      as="li"
      value={block}
      dragListener={false}
      dragControls={dragControls}
      className="bg-background grid gap-1.5 rounded-md border p-2"
      whileDrag={{ boxShadow: '0 8px 20px rgba(0,0,0,0.12)', zIndex: 50, position: 'relative' }}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title="Drag to reorder"
          onPointerDown={(e) => dragControls.start(e)}
          className="text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
        <Input
          placeholder={name}
          value={block.label}
          aria-label={`${name} label`}
          className="h-8 min-w-0 flex-1"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <input
          type="color"
          value={block.color}
          title={`${name} colour`}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border"
        />
        <Button
          size="sm"
          title="Bold"
          type="button"
          aria-pressed={block.bold}
          className="h-8 w-8 shrink-0 p-0 font-bold"
          variant={block.bold ? 'default' : 'outline'}
          onClick={() => onChange({ bold: !block.bold })}
        >
          B
        </Button>
        <Button
          size="sm"
          type="button"
          title="Italic"
          aria-pressed={block.italic}
          className="h-8 w-8 shrink-0 p-0 italic"
          variant={block.italic ? 'default' : 'outline'}
          onClick={() => onChange({ italic: !block.italic })}
        >
          I
        </Button>
      </div>
      <select
        value={block.font}
        aria-label={`${name} font`}
        style={{ fontFamily: PREVIEW_FONT_STACKS[block.font] }}
        className="border-input bg-background ml-6 h-8 rounded-md border px-2 text-sm"
        onChange={(e) => onChange({ font: e.target.value as WorkingDocumentBlock['font'] })}
      >
        {WORKING_DOCUMENT_FONTS.map((font) => (
          <option key={font} value={font} style={{ fontFamily: PREVIEW_FONT_STACKS[font] }}>
            {font}
          </option>
        ))}
      </select>
    </Reorder.Item>
  );
}

// One row per text — the source, the translation and each reference — to set
// its label, colour, emphasis and font, and drag to set the order the texts
// appear in for each paragraph.
export function WorkingDocumentFormatEditor({
  blocks,
  names,
  onChange,
}: {
  blocks: WorkingDocumentBlock[];
  // What each block is (e.g. the reference's document title), keyed by block key.
  names: Record<string, string>;
  onChange: (blocks: WorkingDocumentBlock[]) => void;
}) {
  return (
    <Reorder.Group as="ul" axis="y" values={blocks} onReorder={onChange} className="grid gap-2">
      {blocks.map((block) => (
        <BlockRow
          block={block}
          key={block.key}
          name={names[block.key] ?? block.label}
          onChange={(patch) => onChange(blocks.map((b) => (b.key === block.key ? { ...b, ...patch } : b)))}
        />
      ))}
    </Reorder.Group>
  );
}

// How one paragraph will look in the document, using the start paragraph's
// excerpts. Fonts fall back to similar ones where the document's aren't
// installed.
export function WorkingDocumentPreview({
  number,
  blocks,
  texts,
}: {
  number: string;
  blocks: WorkingDocumentBlock[];
  texts: Record<string, string | null>;
}) {
  const present = blocks.filter((block) => texts[block.key]?.trim());
  return (
    <div className="rounded-md border bg-white p-3 text-sm text-black">
      <div className="text-[10px] text-gray-500">{number}</div>
      {present.map((block, i) => (
        <p
          key={block.key}
          className={`line-clamp-3 ${i > 0 ? 'mt-3' : ''}`}
          style={{
            color: block.color,
            fontFamily: PREVIEW_FONT_STACKS[block.font],
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? 'italic' : 'normal',
          }}
        >
          {block.label && <span className="font-bold">{block.label}: </span>}
          {texts[block.key]}
        </p>
      ))}
    </div>
  );
}
