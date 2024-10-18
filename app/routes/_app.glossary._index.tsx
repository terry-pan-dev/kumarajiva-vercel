import { useLoaderData, useNavigate, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@vercel/remix';
import { type ReadGlossary } from '~/drizzle/tables';
import { createGlossary, readGlossaries, searchGlossaries } from '~/services';
import { useMemo, useState } from 'react';
import { z, ZodError } from 'zod';
import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { FormInput, FormModal, FormTextarea } from '../components/FormModal';
import { Icons } from '../components/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui';
import { validatePayloadOrThrow } from '../lib/payload.validation';

export const meta: MetaFunction = () => {
  return [{ title: 'Glossary' }];
};

const formSchema = z.object({
  origin: z.string().min(1, {
    message: 'Origin must be at least 1 characters.',
  }),
  target: z.string().min(1, {
    message: 'Target must be at least 1 characters.',
  }),
  origin_sutra_text: z.string().optional(),
  target_sutra_text: z.string().optional(),
  sutra_name: z.string().optional(),
  volume: z.string().optional(),
  cbeta_frequency: z.string().optional(),
  glossary_author: z.string().optional(),
  translation_date: z.string().optional(),
  discussion: z.string().optional(),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { searchParams } = new URL(request.url);
    const skip = parseInt(searchParams.get('skip') || '0', 10);
    const take = parseInt(searchParams.get('take') || '25', 10);

    const searchTerm = searchParams.get('searchTerm') || '';

    if (searchTerm) {
      console.log(searchTerm);
      const glossaries = await searchGlossaries(searchTerm);
      return json({ success: true, data: glossaries });
    }

    const glossaries = await readGlossaries({ skip, take });
    return json({ success: true, data: glossaries });
  } catch (error) {
    console.error(error);
    throw new Error('Internal Server Error');
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = Object.fromEntries(await request.formData());

  try {
    const data = validatePayloadOrThrow({ schema: formSchema, formData });
    const newGlossary = {
      ...data,
      createdBy: user.id,
      updatedBy: user.id,
    };

    await createGlossary(newGlossary);
  } catch (error) {
    console.error('Error creating glossary', error);
    if (error instanceof ZodError) {
      return json({ success: false, errors: error.format() });
    }
    return json({ success: false, errors: 'Internal Server Error' });
  }
  return json({ success: true });
};

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}
export default function GlossaryIndex() {
  const { data } = useLoaderData<typeof loader>();

  const glossaries = useMemo(() => {
    return data.map((glossary) => ({
      ...glossary,
      createdAt: new Date(glossary.createdAt),
      updatedAt: new Date(glossary.updatedAt),
      deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
    }));
  }, [data]);

  return (
    <div>
      <SearchBar />
      <div className="h-4" />
      <GlossaryList glossaries={glossaries} />

      <GlossaryCreateModal />
    </div>
  );
}

const SearchBar = () => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = () => {
    if (searchTerm) {
      navigate({
        pathname: '/glossary',
        search: `?searchTerm=${searchTerm}`,
      });
      setSearchTerm('');
    } else {
      navigate('/glossary');
    }
  };

  return (
    <div className="flex w-full items-center space-x-2">
      <Input
        name="searchTerm"
        type="text"
        placeholder="Glossary Term"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <Button onClick={handleSubmit}>Search</Button>
    </div>
  );
};

type Colors = {
  origin: string;
  target: string;
};
const GlossaryList = ({ glossaries }: { glossaries: ReadGlossary[] }) => {
  const colors = useMemo<Colors>(() => {
    return {
      origin: 'bg-green-200',
      target: 'bg-cyan-200',
    };
  }, []);

  if (glossaries.length) {
    return (
      <div>
        {glossaries.map((glossary) => (
          <Accordion type="single" collapsible key={glossary.id} className="group">
            <AccordionItem value="item-1">
              <AccordionTrigger className="px-4 py-2 text-gray-700 group-odd:bg-card">
                <GlossaryItemHeader glossary={glossary} colors={colors} />
              </AccordionTrigger>
              <AccordionContent>
                <GlossaryItemContent glossary={glossary} colors={colors} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ))}
      </div>
    );
  }
  return null;
};

const GlossaryItemHeader = ({ glossary, colors }: { glossary: ReadGlossary; colors: Colors }) => {
  return (
    <div className="flex justify-start gap-2">
      <Badge className={`${colors.origin} hover:${colors.origin} rounded-sm text-sm text-black`}>
        {glossary.origin}
      </Badge>
      <Badge className={`${colors.target} hover:${colors.target} rounded-sm text-sm text-black`}>
        {glossary.target}
      </Badge>
    </div>
  );
};

const GlossaryItemContent = ({ glossary, colors }: { glossary: ReadGlossary; colors: Colors }) => {
  return (
    <Table className="bg-primary-foreground">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">Name</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Origin Term</TableCell>
          <TableCell className={colors.origin}>{glossary.origin}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Target Term</TableCell>
          <TableCell className={colors.target}>{glossary.target}</TableCell>
        </TableRow>
        {glossary.originSutraText && (
          <TableRow>
            <TableCell className="font-medium">Origin Sutra Text</TableCell>
            <TableCell>{glossary.originSutraText}</TableCell>
          </TableRow>
        )}
        {glossary.targetSutraText && (
          <TableRow>
            <TableCell className="font-medium">Target Sutra Text</TableCell>
            <TableCell>{glossary.targetSutraText}</TableCell>
          </TableRow>
        )}
        {glossary.sutraName && (
          <TableRow>
            <TableCell className="font-medium">Sutra Name</TableCell>
            <TableCell>{glossary.sutraName}</TableCell>
          </TableRow>
        )}
        {glossary.volume && (
          <TableRow>
            <TableCell className="font-medium">Volume</TableCell>
            <TableCell>{glossary.volume}</TableCell>
          </TableRow>
        )}
        {glossary.translationDate && (
          <TableRow>
            <TableCell className="font-medium">Translation Date</TableCell>
            <TableCell>{glossary.translationDate}</TableCell>
          </TableRow>
        )}
        {glossary.discussion && (
          <TableRow>
            <TableCell className="font-medium">Discussion</TableCell>
            <TableCell>{glossary.discussion}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

const GlossaryCreateModal = () => {
  return (
    <FormModal
      title="Create Glossary"
      trigger={
        <Button variant="outline" size="icon" className="fixed bottom-10 right-10 rounded-full">
          <Icons.Add className="h-4 w-4" />
        </Button>
      }
      schema={formSchema}
    >
      <GlossaryCreateForm />
    </FormModal>
  );
};

const GlossaryCreateForm = () => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormInput name="origin" label="Origin" required description="The original term in the source language." />
      <FormInput name="target" label="Target" required description="The translated term in the target language." />
      <FormTextarea name="origin_sutra_text" label="Origin Sutra Text" description="The original text of the sutra." />
      <FormTextarea
        name="target_sutra_text"
        label="Target Sutra Text"
        description="The translated text of the sutra."
      />
      <FormTextarea name="sutra_name" label="Sutra Name" description="The name of the sutra." />
      <FormTextarea name="volume" label="Volume" description="The volume of the sutra." />
      <FormTextarea name="cbeta_frequency" label="CBETA Frequency" description="The frequency of the sutra in CBETA." />
      <FormTextarea name="glossary_author" label="Glossary Author" description="The author of the glossary." />
      <FormTextarea name="translation_date" label="Translation Date" description="The date of the translation." />
      <FormTextarea name="discussion" label="Discussion" description="Any additional discussion about the glossary." />
    </div>
  );
};
