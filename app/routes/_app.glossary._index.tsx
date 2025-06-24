import { Form, Link, useLoaderData, useNavigation, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@vercel/remix';
import React, { useMemo, useRef, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { ZodError } from 'zod';

import { readGlossaries, updateGlossarySubscribers, updateGlossaryTranslations } from '~/services';

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { GlossaryList } from '../components/GlossaryList';
import { Button, Input } from '../components/ui';
import {
  Pagination,
  PaginationPrevious,
  PaginationItem,
  PaginationContent,
  PaginationNext,
  PaginationEllipsis,
} from '../components/ui/pagination';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { searchGlossaries } from '../services/edge.only';
import {
  glossaryEditFormSchema,
  glossaryFormSchema,
  glossaryInsertFormSchema,
} from '../validations/glossary.validation';

export const meta: MetaFunction = () => {
  return [{ title: 'Glossary' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const searchTerm = searchParams.get('searchTerm') || '';

    if (searchTerm) {
      console.log('searchTerm', searchTerm);
      const glossaries = await searchGlossaries(searchTerm);
      return json({ success: true, glossaries, page: 1, totalPages: 1 });
    }

    const { glossaries, totalPages } = await readGlossaries({ page });

    return json({ success: true, glossaries, page: glossaries.length ? page : 1, totalPages });
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
  const kind = formData.kind;
  const bookmark = formData.bookmark;
  const glossaryId = formData.glossaryId as string;
  if (bookmark) {
    await updateGlossarySubscribers({
      id: glossaryId,
      subscribers: bookmark === 'true' ? 1 : -1,
    });
    return json({ success: true });
  }

  if (kind === 'edit') {
    const data = JSON.parse(formData.data as string);
    const validatedData = validatePayloadOrThrow({ schema: glossaryEditFormSchema, formData: data });
    const validatedDataWithUpdatedBy = validatedData.translations.map((translation) => ({
      ...translation,
      updatedBy: user.id,
    }));
    const { id, phonetic = null, author = null, cbetaFrequency = null } = validatedData;
    await updateGlossaryTranslations({
      id,
      phonetic,
      author,
      cbetaFrequency,
      updatedBy: phonetic || author || cbetaFrequency ? user.id : null,
      translations: validatedDataWithUpdatedBy,
      discussion: validatedData.discussion ?? null,
    });
    return json({ success: true, kind: 'edit' });
  }

  if (kind === 'insert') {
    const data = validatePayloadOrThrow({ schema: glossaryInsertFormSchema, formData });
    const newGlossary = {
      ...data,
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    };
    await updateGlossaryTranslations({
      id: newGlossary.id,
      translations: [newGlossary],
      isNewInsert: true,
      phonetic: null,
      author: null,
      cbetaFrequency: null,
      updatedBy: null,
      discussion: null,
    });
    return json({ success: true, kind: 'insert' });
  }

  try {
    const data = validatePayloadOrThrow({ schema: glossaryFormSchema, formData });
    const newGlossary = {
      ...data,
      createdBy: user.id,
      updatedBy: user.id,
    };
    console.log(newGlossary);

    // await createGlossary(newGlossary);
  } catch (error) {
    if (error instanceof ZodError) {
      return json({ success: false, errors: error.format() });
    }
    if (error instanceof Error) {
      if ('code' in error) {
        if (error.code === '23505') {
          return json({ success: false, errors: ['Glossary already exists'] });
        }
      }
    }
    return json({ success: false, errors: ['Internal Server Error'] });
  }
  return json({ success: true });
};

export function ErrorBoundary() {
  const error = useRouteError();

  return <ErrorInfo error={error} />;
}

export default function GlossaryIndex() {
  const { glossaries } = useLoaderData<typeof loader>();

  const glossariesState = useMemo(() => {
    return glossaries.map((glossary) => ({
      ...glossary,
      createdAt: new Date(glossary.createdAt),
      updatedAt: new Date(glossary.updatedAt),
      deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
    }));
  }, [glossaries]);

  const [searchTerm, setSearchTerm] = useState<string>('');

  const glossaryListRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <div className="h-4" />
      {glossariesState.length > 0 ? (
        <>
          <GlossaryList ref={glossaryListRef} glossaries={glossariesState} />
          <div className="h-4" role="presentation" />
          <PaginationControls />
        </>
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="text-lg font-bold">No glossary found</div>
        </div>
      )}
    </div>
  );
}

interface SearchBarProps {
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
}
const SearchBar = ({ searchTerm, setSearchTerm }: SearchBarProps) => {
  const navigation = useNavigation();
  const isLoading = navigation.state === 'loading' || navigation.state === 'submitting';
  return (
    <Form method="get" action={`/glossary?index&searchTerm=${searchTerm}`}>
      <div className="flex w-full items-center space-x-2">
        <div className="relative flex-1">
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            </div>
          )}
          <Input
            type="search"
            name="searchTerm"
            value={searchTerm}
            disabled={isLoading}
            placeholder="Glossary Term"
            className={isLoading ? 'pr-10' : ''}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-20" disabled={isLoading}>
          Search
        </Button>
      </div>
    </Form>
  );
};

const PaginationControls = () => {
  const { page, totalPages } = useLoaderData<typeof loader>();
  const currentPage = Number(page);

  const getPages = () => {
    const pages = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    if (currentPage === 1 || currentPage === 2) {
      pages.push(1, 2, 3);
      if (totalPages > 4) pages.push('ellipsis');
      pages.push(totalPages);
    } else if (currentPage === 3) {
      pages.push(1, 2, 3, 4, 'ellipsis', totalPages);
    } else if (currentPage === 4) {
      pages.push(1, 'ellipsis', 3, 4, 5, 'ellipsis', totalPages);
    } else if (currentPage > 4 && currentPage < totalPages - 2) {
      pages.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
    } else {
      // Near the end
      pages.push(1, 'ellipsis');
      for (let i = totalPages - 2; i <= totalPages; i++) pages.push(i);
    }
    return pages;
  };

  const pages = getPages();

  return (
    <ClientOnly fallback={<div className="h-10" />}>
      {() => (
        <Pagination>
          <PaginationContent className="h-10">
            <PaginationItem>
              {currentPage === 1 ? (
                <span className="pointer-events-none select-none opacity-50">
                  <PaginationPrevious to={'#'}>Previous</PaginationPrevious>
                </span>
              ) : (
                <PaginationPrevious to={`?page=${currentPage - 1}`} />
              )}
            </PaginationItem>
            {pages.map((p, idx) => (
              <PaginationItem key={idx}>
                {p === 'ellipsis' ? (
                  <span className="flex items-center justify-center rounded py-1 text-muted-foreground">
                    <PaginationEllipsis />
                  </span>
                ) : p === currentPage ? (
                  <span className="rounded border px-2 py-1 text-muted-foreground">{p}</span>
                ) : (
                  <Link className="mx-1" to={`?page=${p}`}>
                    {p}
                  </Link>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              {currentPage >= totalPages ? (
                <span className="pointer-events-none select-none opacity-50">
                  <PaginationNext to={'#'}>Next</PaginationNext>
                </span>
              ) : (
                <PaginationNext to={`?page=${currentPage + 1}`} />
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </ClientOnly>
  );
};
