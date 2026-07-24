import { Form, useActionData, useNavigation } from '@remix-run/react';
import { motion } from 'framer-motion';
import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type ZodError } from 'zod';

import { Can } from '~/authorisation';
import ContextMenuWrapper from '~/components/ContextMenu';
import { Icons } from '~/components/icons';
import { Paragraph } from '~/components/Paragraph';
import { Button, Textarea } from '~/components/ui';
import { useToast } from '~/hooks/use-toast';
import { useTextAreaAutoHeight } from '~/lib/hooks/useTextAreaAutoHeight';
import { useTranslation } from '~/lib/hooks/useTranslation';
import { type IParagraphNew } from '~/services/text.service';

import { OpenAIStreamCard } from './OpenAIStreamCard';

// Only the fields the workspace uses — loader data is JSON-serialised, so the
// Date-typed relation arrays (empty until they migrate) are not part of it.
export type WorkspaceParagraph = Pick<IParagraphNew, 'id' | 'origin' | 'target' | 'sectionId' | 'targetId'>;

export const Workspace = ({ paragraph }: { paragraph: WorkspaceParagraph }) => {
  const { id, origin, target, sectionId, targetId } = paragraph;

  const { translation, pasteTranslation, disabledEdit, cleanTranslation } = useTranslation({ originId: id, target });

  const actionData = useActionData<{
    success: boolean;
    message: string;
    kind: 'insert' | 'update';
    errors: ZodError['errors'];
  }>();

  const navigation = useNavigation();

  const isLoading = navigation.state === 'submitting' || navigation.state === 'loading';

  const { toast } = useToast();

  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [editedOrigin, setEditedOrigin] = useState(origin);

  useEffect(() => {
    setEditedOrigin(origin);
    setIsEditingOrigin(false);
  }, [origin]);

  useEffect(() => {
    if (!actionData) return;
    if (actionData.success) {
      toast({
        variant: 'default',
        title: actionData.message,
        position: 'top-right',
        description: actionData.message,
      });
    } else {
      toast({
        variant: 'error',
        title: 'Oops!',
        position: 'top-right',
        description: actionData.errors?.map((error) => error.message).join(', '),
      });
    }
  }, [actionData, toast]);

  const originRef = useTextAreaAutoHeight(editedOrigin);
  const translationRef = useTextAreaAutoHeight(translation);

  return (
    <div className="flex h-full flex-col justify-start gap-4 px-1">
      <motion.div
        className="flex flex-col"
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        exit={{ opacity: 0, x: '100%' }}
        initial={{ opacity: 0, x: '100%' }}
      >
        <ContextMenuWrapper>
          <div className="relative">
            {isEditingOrigin ? (
              <Form method="post" onSubmit={() => setIsEditingOrigin(false)}>
                <input name="kind" type="hidden" value="updateOrigin" />
                <input value={id} type="hidden" name="paragraphId" />
                <Textarea
                  ref={originRef}
                  name="originText"
                  className="text-md"
                  value={editedOrigin}
                  onChange={(e) => setEditedOrigin(e.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <Button size="icon" type="submit" variant="ghost" name="acceptEdit">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    type="button"
                    variant="ghost"
                    name="cancelEdit"
                    onClick={() => {
                      setEditedOrigin(origin); // reset to original
                      setIsEditingOrigin(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </Form>
            ) : (
              <>
                <Paragraph id={id} text={origin} title="Origin" />
                <Can I="Update" this="OriginText">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-0 right-0"
                    onClick={() => setIsEditingOrigin(true)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Can>
              </>
            )}
          </div>
        </ContextMenuWrapper>
        <Form method="post" className="mt-4" onSubmit={() => cleanTranslation()}>
          <div className="mt-auto grid w-full gap-2">
            <input type="hidden" name="paragraphId" value={targetId || id} />
            <input name="kind" type="hidden" value={targetId ? 'update' : 'insert'} />
            <Can I="Read" this="Paragraph">
              <Textarea
                name="translation"
                value={translation}
                ref={translationRef}
                className="text-md h-8"
                disabled={isLoading || disabledEdit}
                onChange={(e) => pasteTranslation(e.target.value)}
                placeholder={
                  disabledEdit
                    ? 'Please select a new paragraph to edit or double click translated paragraph.'
                    : 'Type your translation here.'
                }
              />
              <Button type="submit" disabled={translation === '' || isLoading}>
                {isLoading ? <Icons.Loader className="h-4 w-4 animate-spin" /> : 'Save Translation'}
              </Button>
            </Can>
          </div>
        </Form>
      </motion.div>
      <ContextMenuWrapper>
        <OpenAIStreamCard
          originId={id}
          text={origin}
          sectionId={sectionId}
          title="AI Translation"
          disabled={disabledEdit}
          pasteTranslation={pasteTranslation}
          interrupt={navigation.state === 'submitting'}
        />
      </ContextMenuWrapper>
      <div className="flex-grow"></div>
    </div>
  );
};
