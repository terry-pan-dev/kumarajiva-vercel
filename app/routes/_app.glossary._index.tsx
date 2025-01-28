import { useFetcher, useLoaderData, useRouteError } from '@remix-run/react';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from '@vercel/remix';
import React, { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ZodError } from 'zod';

import { type ReadGlossary } from '~/drizzle/schema';
import { readGlossaries, updateGlossarySubscribers, updateGlossaryTranslations } from '~/services';

import { assertAuthUser } from '../auth.server';
import { ErrorInfo } from '../components/ErrorInfo';
import { GlossaryList } from '../components/GlossaryList';
import { Button, Input } from '../components/ui';
import { validatePayloadOrThrow } from '../lib/payload.validation';
import { searchGlossaries } from '../services/edge.only';
import { glossaryEditFormSchema, glossaryFormSchema } from '../validations/glossary.validation';

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
      return json({ success: true, glossaries, page: -1 });
    }

    if (page === -1) {
      return json({ success: true, glossaries: [], page: -1 });
    }

    const glossaries = await readGlossaries({ page });

    return json({ success: true, glossaries, page: glossaries.length ? page : -1 });
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
    await updateGlossaryTranslations({
      id: validatedData.id,
      translations: validatedDataWithUpdatedBy,
    });
    return json({ success: true, kind: 'edit' });
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
  const { glossaries, page } = useLoaderData<typeof loader>();
  const [glossariesState, setGlossariesState] = useState<ReadGlossary[]>(
    glossaries.map((glossary) => ({
      ...glossary,
      createdAt: new Date(glossary.createdAt),
      updatedAt: new Date(glossary.updatedAt),
      deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
    })),
  );

  const fetcher = useFetcher<{ glossaries: ReadGlossary[]; page: number }>();
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    if (fetcher.state === 'loading' || fetcher.state === 'submitting') {
      return;
    }
    if (fetcher.data?.glossaries.length) {
      const newGlossaries =
        fetcher.data?.glossaries?.map((glossary) => ({
          ...glossary,
          createdAt: new Date(glossary.createdAt),
          updatedAt: new Date(glossary.updatedAt),
          deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
        })) || [];
      if (searchTerm && fetcher.data?.page === -1) {
        setGlossariesState((prevItems) => {
          const uniqueMap = new Map([...newGlossaries].map((item) => [item.id, item]));
          return Array.from(uniqueMap.values());
        });
      }
      if (!searchTerm && fetcher.data?.page !== -1) {
        if (fetcher.data?.page === 1) {
          setGlossariesState(newGlossaries);
        } else {
          setGlossariesState((prevItems) => {
            const uniqueMap = new Map([...prevItems, ...newGlossaries].map((item) => [item.id, item]));
            return Array.from(uniqueMap.values());
          });
        }
      }
    } else if (fetcher.data?.glossaries.length === 0 && searchTerm) {
      setGlossariesState([]);
    }
  }, [fetcher.data, fetcher.state, searchTerm, fetcher.data?.page, page, glossaries]);

  const loadNext = useCallback(() => {
    const currentPage = fetcher.data?.page || page;
    if (currentPage !== -1) {
      fetcher.load(`/glossary?index&page=${currentPage + 1}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data?.page]);

  const glossaryListRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <SearchBar fetcher={fetcher} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      <div className="h-4" />
      {glossariesState.length > 0 ? (
        <InfiniteScroller
          loadNext={loadNext}
          ref={glossaryListRef}
          loading={fetcher.state === 'loading' || fetcher.state === 'submitting'}
        >
          <GlossaryList ref={glossaryListRef} glossaries={glossariesState} />
        </InfiniteScroller>
      ) : (
        <div className="flex h-full items-center justify-center">
          <div className="text-lg font-bold">No glossary found</div>
        </div>
      )}
    </div>
  );
}

interface SearchBarProps {
  fetcher: ReturnType<typeof useFetcher>;
  searchTerm: string;
  setSearchTerm: (searchTerm: string) => void;
}
const SearchBar = ({ fetcher, searchTerm, setSearchTerm }: SearchBarProps) => {
  return (
    <fetcher.Form method="get" action={`/glossary?index&searchTerm=${searchTerm}`}>
      <div className="flex w-full items-center space-x-2">
        <div className="relative flex-1">
          {(fetcher.state === 'loading' || fetcher.state === 'submitting') && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            </div>
          )}
          <Input
            type="text"
            name="searchTerm"
            value={searchTerm}
            placeholder="Glossary Term"
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={fetcher.state === 'loading' || fetcher.state === 'submitting'}
            className={fetcher.state === 'loading' || fetcher.state === 'submitting' ? 'pr-10' : ''}
          />
        </div>
        <Button type="submit" className="w-20">
          Search
        </Button>
      </div>
    </fetcher.Form>
  );
};

interface InfiniteScrollerProps extends PropsWithChildren {
  loading: boolean;
  loadNext: () => void;
}
const InfiniteScroller = React.forwardRef<HTMLDivElement, InfiniteScrollerProps>((props, ref) => {
  const { children, loading, loadNext } = props;
  const scrollListener = useRef(loadNext);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    scrollListener.current = loadNext;
  }, [loadNext]);

  const onScrollHappen = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const documentHeight = document.documentElement.scrollHeight;
      const scrollDifference = Math.floor(window.innerHeight + window.scrollY);
      const scrollEnded = documentHeight == scrollDifference;

      if (scrollEnded && !loading) {
        scrollListener.current();
      }
    }, 500); // Adjust this delay as needed (in milliseconds)
  };

  useEffect(() => {
    if (!ref || !('current' in ref && ref.current)) {
      return;
    }

    const currentRef = ref.current;
    currentRef.addEventListener('scroll', onScrollHappen);

    return () => {
      if (currentRef) {
        currentRef.removeEventListener('scroll', onScrollHappen);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);

  return <>{children}</>;
});
InfiniteScroller.displayName = 'InfiniteScroller';
