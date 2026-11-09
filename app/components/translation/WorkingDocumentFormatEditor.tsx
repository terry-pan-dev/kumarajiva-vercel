import { Reorder, useDragControls } from 'framer-motion';
import { CornerDownLeft, Eye, EyeOff, GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button, Input } from '~/components/ui';
import {
  DEFAULT_WORKING_DOCUMENT_FONT_SIZE,
  WORKING_DOCUMENT_FONT_SIZES,
  WORKING_DOCUMENT_FONTS,
  workingDocumentBlockPrefix,
  type WorkingDocumentBlock,
} from '~/validations/workingDocument.validation';

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

const selectClass = 'border-input bg-background h-8 rounded-md border px-2 text-sm';

function BlockRow({
  block,
  name,
  canRemove,
  onChange,
  onRemove,
}: {
  block: WorkingDocumentBlock;
  // What the entry prints, e.g. "Translation — The Lotus Sutra".
  name: string;
  // Only an extra entry for a text can go; the last one can just be hidden.
  canRemove: boolean;
  onChange: (patch: Partial<WorkingDocumentBlock>) => void;
  onRemove: () => void;
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
        <span
          title={name}
          className={`min-w-0 flex-1 truncate text-xs font-medium ${block.visible ? '' : 'text-muted-foreground line-through'}`}
        >
          {name}
        </span>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          aria-pressed={block.visible}
          className="h-7 w-7 shrink-0 p-0"
          onClick={() => onChange({ visible: !block.visible })}
          title={block.visible ? 'Shown in the document — click to hide' : 'Hidden from the document — click to show'}
        >
          {block.visible ? <Eye size={15} /> : <EyeOff size={15} className="text-muted-foreground" />}
        </Button>
        {canRemove && (
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={onRemove}
            title="Remove this entry"
            className="h-7 w-7 shrink-0 p-0"
          >
            <X size={15} />
          </Button>
        )}
      </div>
      <div className={`ml-6 grid gap-1.5 ${block.visible ? '' : 'opacity-50'}`}>
        <div className="flex items-center gap-1.5">
          <Input
            value={block.label}
            placeholder="No label"
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
          <Button
            size="sm"
            type="button"
            aria-pressed={block.labelBreak}
            className="h-8 w-8 shrink-0 p-0"
            variant={block.labelBreak ? 'default' : 'outline'}
            title="Start the text on a new line after the label"
            onClick={() => onChange({ labelBreak: !block.labelBreak })}
          >
            <CornerDownLeft size={15} />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={block.font}
            aria-label={`${name} font`}
            className={`${selectClass} min-w-0 flex-1`}
            style={{ fontFamily: PREVIEW_FONT_STACKS[block.font] }}
            onChange={(e) => onChange({ font: e.target.value as WorkingDocumentBlock['font'] })}
          >
            {WORKING_DOCUMENT_FONTS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: PREVIEW_FONT_STACKS[font] }}>
                {font}
              </option>
            ))}
          </select>
          <select
            value={block.size}
            title={`${name} font size`}
            aria-label={`${name} font size`}
            className={`${selectClass} w-20 shrink-0`}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          >
            {/* A size saved outside the list still shows. */}
            {[...new Set([...WORKING_DOCUMENT_FONT_SIZES, block.size])]
              .sort((x, y) => x - y)
              .map((size) => (
                <option key={size} value={size}>
                  {size} pt
                </option>
              ))}
          </select>
        </div>
      </div>
    </Reorder.Item>
  );
}

// One row per entry in each paragraph — by default one for each text: the
// source, the translation and each reference. Each row names the text it
// prints (the label is free to change) and sets its label, colour, emphasis,
// font and size, and whether it is shown; drag to set the order. A text can be
// added again, e.g. to print it twice in different styles.
export function WorkingDocumentFormatEditor({
  blocks,
  names,
  onChange,
}: {
  blocks: WorkingDocumentBlock[];
  // Every text that can be printed and what it is (e.g. the reference's
  // document title), keyed by block key.
  names: Record<string, string>;
  onChange: (blocks: WorkingDocumentBlock[]) => void;
}) {
  const keys = Object.keys(names);
  const [addKey, setAddKey] = useState(keys[0] ?? '');

  // A new entry starts as a copy of the text's first entry, shown.
  const add = () => {
    const like = blocks.find((b) => b.key === addKey);
    if (!like) return;
    onChange([...blocks, { ...like, id: `${addKey}#${crypto.randomUUID().slice(0, 8)}`, visible: true }]);
  };

  return (
    <div className="grid gap-2">
      <Reorder.Group as="ul" axis="y" values={blocks} onReorder={onChange} className="grid gap-2">
        {blocks.map((block) => (
          <BlockRow
            block={block}
            key={block.id}
            name={names[block.key] ?? block.label}
            onRemove={() => onChange(blocks.filter((b) => b.id !== block.id))}
            canRemove={blocks.some((b) => b.key === block.key && b.id !== block.id)}
            onChange={(patch) => onChange(blocks.map((b) => (b.id === block.id ? { ...b, ...patch } : b)))}
          />
        ))}
      </Reorder.Group>
      <div className="flex items-center gap-1.5">
        <select
          value={addKey}
          aria-label="Text to add"
          className={`${selectClass} min-w-0 flex-1`}
          onChange={(e) => setAddKey(e.target.value)}
        >
          {keys.map((key) => (
            <option key={key} value={key}>
              {names[key]}
            </option>
          ))}
        </select>
        <Button size="sm" type="button" onClick={add} variant="outline" className="h-8 shrink-0">
          <Plus size={15} className="mr-1" />
          Add entry
        </Button>
      </div>
    </div>
  );
}

// How one paragraph will look in the document, using the start paragraph's
// excerpts. Fonts fall back to similar ones where the document's aren't
// installed.
export function WorkingDocumentPreview({
  number,
  blocks,
  texts,
  pages,
  showPages,
}: {
  // null when paragraph numbers are switched off.
  number: string | null;
  blocks: WorkingDocumentBlock[];
  texts: Record<string, string | null>;
  pages: Record<string, string | null>;
  showPages: boolean;
}) {
  const present = blocks.filter((block) => block.visible && texts[block.key]?.trim());
  return (
    <div className="rounded-md border bg-white p-3 text-sm text-black">
      {number && <div className="text-xs text-gray-500">{number}</div>}
      {present.map((block, i) => {
        const inline = workingDocumentBlockPrefix(block.label, pages[block.key], showPages);
        const prefix = block.labelBreak ? inline.trimEnd() : inline;
        return (
          <p
            key={block.id}
            className={`line-clamp-3 ${i > 0 ? 'mt-3' : ''}`}
            style={{
              color: block.color,
              fontFamily: PREVIEW_FONT_STACKS[block.font],
              fontWeight: block.bold ? 700 : 400,
              fontStyle: block.italic ? 'italic' : 'normal',
              // Relative to the panel's text, so the default size reads as usual.
              fontSize: `${block.size / DEFAULT_WORKING_DOCUMENT_FONT_SIZE}em`,
            }}
          >
            {prefix && <span className={`font-bold ${block.labelBreak ? 'block' : ''}`}>{prefix}</span>}
            {texts[block.key]}
          </p>
        );
      })}
    </div>
  );
}
