import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher, useLoaderData, useOutletContext, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { type ReadReference } from '~/drizzle/tables/reference';
import { type ReadUser } from '~/drizzle/tables/user';
import { motion } from 'framer-motion';
import { ChevronsDownUp, ChevronsUpDown, Copy } from 'lucide-react';
import React, { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';
import { z, ZodError } from 'zod';
import { assertAuthUser } from '../auth.server';
import ContextMenuWrapper from '../components/ContextMenu';
import { ErrorInfo } from '../components/ErrorInfo';
import { Paragraph } from '../components/Paragraph';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
  RadioGroup,
  RadioGroupItem,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Textarea,
} from '../components/ui';
import { useToast } from '../hooks/use-toast';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { readParagraphsByRollId, upsertParagraph, type IParagraph } from '../services/paragraph.service';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const { rollId } = params;
  const paragraphs = await readParagraphsByRollId({ rollId: rollId as string, user });

  return json({ success: true, paragraphs: paragraphs ?? [] });
}

const paragraphActionSchema = z.object({
  paragraphId: z
    .string({
      required_error: 'Please contact support, this error should not happen',
    })
    .uuid(),
  translation: z.string().min(1, { message: 'Translation is required' }),
});

export async function action({ request, params }: ActionFunctionArgs) {
  const { rollId } = params;
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = Object.fromEntries(await request.formData());

  try {
    const result = validatePayloadOrThrow({ schema: paragraphActionSchema, formData });
    await upsertParagraph({
      content: result.translation,
      rollId: rollId as string,
      parentId: result.paragraphId,
      createdBy: user.id,
      updatedBy: user.id,
      language: user.targetLang,
    });
  } catch (error) {
    console.log({ error });
    if (error instanceof ZodError) {
      return json({ success: false, errors: error.message }, { status: 400 });
    }
    throw new Error('Failed to create paragraph');
  }
  return json({ success: true, paragraphs: [] });
}

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}
export default function TranslationRoll() {
  const { paragraphs } = useLoaderData<typeof loader>();

  const labelRef = useRef<HTMLLabelElement>(null);

  const [selectedParagraph, setSelectedParagraph] = useState<string | null>(null);

  useEffect(() => {
    if (selectedParagraph && labelRef.current) {
      labelRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedParagraph]);

  const Paragraphs = paragraphs.map((paragraph) => (
    <div key={paragraph.id} className="flex items-center gap-4 px-2">
      {paragraph?.target ? (
        <div className={`${selectedParagraph ? 'flex flex-col' : 'grid grid-cols-2'} gap-4`}>
          <ContextMenuWrapper>
            <Paragraph text={paragraph.origin} isOrigin />
          </ContextMenuWrapper>
          <Label
            onDoubleClick={() => setSelectedParagraph(paragraph.id)}
            className="text-md flex h-auto font-normal"
            ref={selectedParagraph === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <Paragraph text={paragraph.target} />
            </ContextMenuWrapper>
          </Label>
        </div>
      ) : (
        <motion.div
          className="flex w-full items-center gap-2"
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.3 }}
        >
          <RadioGroupItem
            value={paragraph.id}
            id={paragraph.id}
            className={`${selectedParagraph === paragraph.id ? 'bg-primary' : ''}`}
          />
          <Label
            htmlFor={paragraph.id}
            className="text-md w-full font-normal"
            ref={selectedParagraph === paragraph.id ? labelRef : undefined}
          >
            <ContextMenuWrapper>
              <Paragraph text={paragraph.origin} />
            </ContextMenuWrapper>
          </Label>
        </motion.div>
      )}
    </div>
  ));

  if (selectedParagraph) {
    return (
      <DragPanel>
        <LeftPanel>
          <ScrollArea className="h-full pr-4">
            <RadioGroup className="gap-4" onValueChange={setSelectedParagraph}>
              {Paragraphs}
            </RadioGroup>
          </ScrollArea>
        </LeftPanel>
        <ResizableHandle withHandle className="bg-yellow-600" />
        <RightPanel>
          <ScrollArea className="h-full pr-4">
            {/* TODO: make sure type safe, the problem is createdAt is date and string */}
            <Workspace paragraph={paragraphs.find((p) => p.id === selectedParagraph) as unknown as IParagraph} />
          </ScrollArea>
        </RightPanel>
      </DragPanel>
    );
  }

  return (
    <ScrollArea className="h-full px-2 lg:px-8">
      <RadioGroup className="gap-4" onValueChange={setSelectedParagraph}>
        {paragraphs.length ? (
          Paragraphs
        ) : (
          <div className="text-center text-lg">We are preparing paragraphs for you...</div>
        )}
      </RadioGroup>
    </ScrollArea>
  );
}

const Workspace = ({ paragraph }: { paragraph: IParagraph }) => {
  const { id, origin, target, references, rollId } = paragraph;
  const fetcher = useFetcher<{ success: boolean }>();

  const form = useForm<z.infer<typeof paragraphActionSchema>>({
    resolver: zodResolver(paragraphActionSchema),
    mode: 'onSubmit',
    defaultValues: {
      translation: target || '',
      paragraphId: id,
    },
  });

  const {
    register,
    formState: { errors, isDirty },
    handleSubmit,
    watch,
  } = form;

  const { toast } = useToast();

  useEffect(() => {
    if (errors.translation || errors.paragraphId) {
      toast({
        variant: errors.translation?.message ? 'warning' : errors.paragraphId?.message ? 'error' : 'default',
        title: 'Oops!',
        position: 'top-right',
        description: errors.translation?.message || errors.paragraphId?.message,
      });
    }
  }, [errors, toast]);

  const [disabledEdit, setDisabledEdit] = useState(false);

  useEffect(() => {
    if (form.getValues('paragraphId')) {
      setDisabledEdit(false);
    }
    form.setValue('paragraphId', id);
    if (fetcher.data?.success && form.getValues('translation')) {
      form.reset({
        paragraphId: '',
        translation: '',
      });
      setDisabledEdit(true);
    }
  }, [fetcher, form, id, rollId]);

  const onSubmit = (data: z.infer<typeof paragraphActionSchema>) => {
    fetcher.submit(data, { method: 'post' });
  };

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const translation = watch('translation');

  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.style.height = '0px';
      const scrollHeight = textAreaRef.current.scrollHeight + 10;

      textAreaRef.current.style.height = scrollHeight + 'px';
    }
  }, [textAreaRef, translation]);

  return (
    <FormProvider {...form}>
      <div className="flex h-full flex-col justify-start gap-4 px-1">
        <motion.div
          className="flex flex-col"
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '100%' }}
          transition={{ duration: 0.3 }}
        >
          <ContextMenuWrapper>
            <Paragraph text={origin} title="Origin" />
          </ContextMenuWrapper>
          <ContextMenuWrapper>
            <OpenAIStreamCard text={origin} title="OpenAI" />
          </ContextMenuWrapper>
        </motion.div>
        <References references={references} />
        <fetcher.Form method="post" className="mt-auto" onSubmit={handleSubmit(onSubmit)}>
          <div className="mt-auto grid w-full gap-2">
            <input type="hidden" {...register('paragraphId')} />
            <Textarea
              disabled={disabledEdit}
              placeholder={disabledEdit ? 'Please select a new paragraph to edit.' : 'Type your translation here.'}
              className="h-8"
              {...register('translation')}
              ref={(e) => {
                register('translation').ref(e);
                textAreaRef.current = e;
              }}
            />
            <Button disabled={!isDirty} type="submit">
              Save Translation
            </Button>
          </div>
        </fetcher.Form>
      </div>
    </FormProvider>
  );
};

const References = ({ references }: { references: ReadReference[] }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full gap-2">
      <div className="flex items-center justify-between space-x-4 px-4">
        <h3 className="text-md font-semibold">References</h3>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {isOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      {references.length ? <WorkspaceCard title={references[0].sutraName} text={references[0].content} /> : null}
      <CollapsibleContent className="gap-2">
        {references.length > 1
          ? references
              .slice(1)
              .map((reference) => (
                <WorkspaceCard key={reference.id} title={reference.sutraName} text={reference.content} />
              ))
          : null}
      </CollapsibleContent>
    </Collapsible>
  );
};

const LeftPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={30} defaultSize={50}>
      <div className="flex h-full items-center justify-center pr-2">{children}</div>
    </ResizablePanel>
  );
};

const RightPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanel minSize={40} defaultSize={50}>
      <div className="flex h-full items-center justify-center pb-2 pl-8">{children}</div>
    </ResizablePanel>
  );
};

const DragPanel = ({ children }: PropsWithChildren) => {
  return (
    <ResizablePanelGroup direction="horizontal" className="w-full rounded-lg">
      {children}
    </ResizablePanelGroup>
  );
};

interface StreamCardProps {
  text: string;
  title: string;
}

const OpenAIStreamCard = React.memo(({ text, title }: StreamCardProps) => {
  const context = useOutletContext<{ user: ReadUser }>();
  const [translationResult, setTranslationResult] = useState<string>('');
  const textRef = useRef<string>('');

  useEffect(() => {
    setTranslationResult('');
    textRef.current = '';
    const condition = true;
    const fetchStream = async () => {
      const response = await fetch(
        `/chat?origin=${text}&sourceLang=${context.user.originLang}&targetLang=${context.user.targetLang}`,
      );
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (condition) {
        if (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          setTranslationResult((prev) => prev + chunk);
          textRef.current += chunk;
        }
      }
    };

    fetchStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <WorkspaceCard title={title} text={translationResult} />;
});

interface WorkspaceCardProps {
  title: string;
  text: string;
}

const WorkspaceCard = ({ title, text }: WorkspaceCardProps) => {
  const formContext = useFormContext();
  return (
    <div className="mt-4 flex flex-col justify-start rounded-xl bg-card-foreground p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-md font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => formContext.setValue('translation', text, { shouldDirty: true })}
            className="transition-transform duration-300 hover:scale-110"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-md text-slate-500">{text}</p>
    </div>
  );
};
