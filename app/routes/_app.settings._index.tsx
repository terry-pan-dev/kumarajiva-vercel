import { useLoaderData, useNavigate } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { GlossaryList } from '../components/GlossaryList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { readGlossariesByIds } from '../services';

export async function loader({ request }: LoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const glossaryIds = searchParams.getAll('glossaryIds') as string[];
  if (!glossaryIds.length) {
    return json({ success: true, glossaries: [] });
  }
  const glossaries = await readGlossariesByIds(glossaryIds);
  return json({ success: true, glossaries: glossaries });
}

export default function SettingsIndex() {
  return (
    <Tabs defaultValue="glossary" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="glossary">Glossary Subscriptions</TabsTrigger>
        <TabsTrigger value="search">Search Config</TabsTrigger>
        <TabsTrigger value="font-settings">Font Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="glossary">
        <ClientOnly>
          {() => {
            return <GlossaryComponent />;
          }}
        </ClientOnly>
      </TabsContent>
      <TabsContent value="search">Change your password here.</TabsContent>
      <TabsContent value="font-settings">Change your password here.</TabsContent>
    </Tabs>
  );
}

function GlossaryComponent() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subscribedGlossaries, _] = useLocalStorage<string[]>('subscribedGlossaries', []);
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  //   const fetcher = useFetcher<{ success: boolean; glossaries: ReadGlossary[] }>();

  useEffect(() => {
    console.log(subscribedGlossaries);
    if (subscribedGlossaries.length) {
      const glossaryIds = subscribedGlossaries.map((id) => `glossaryIds=${id}`).join('&');
      navigate(`/settings?${glossaryIds}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glossaries = useMemo(() => {
    if (loaderData.success) {
      return loaderData.glossaries?.map((glossary) => ({
        ...glossary,
        createdAt: new Date(glossary.createdAt),
        updatedAt: new Date(glossary.updatedAt),
        deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
      }));
    }
    return [];
  }, [loaderData]);

  console.log(glossaries);
  return <GlossaryList glossaries={glossaries} />;
}
