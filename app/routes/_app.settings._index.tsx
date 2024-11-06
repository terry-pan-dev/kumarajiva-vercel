import { useLoaderData, useNavigate } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useMemo } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { GlossaryList } from '../components/GlossaryList';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Slider } from '../components/ui/slider';
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
      <TabsContent value="font-settings">
        <ClientOnly>
          {() => {
            return <FontSizePreference />;
          }}
        </ClientOnly>
      </TabsContent>
    </Tabs>
  );
}

function GlossaryComponent() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subscribedGlossaries, _] = useLocalStorage<string[]>('subscribedGlossaries', []);
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();

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

  return <GlossaryList glossaries={glossaries} />;
}

export function FontSizePreference() {
  const [fontSize, setFontSize] = useLocalStorage<number>('fontSize', 14);

  const handleFontSizeChange = (newValue: number[]) => {
    setFontSize(newValue[0]);
  };

  const handleReset = () => {
    setFontSize(14);
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
  }, [fontSize]);

  return (
    <Card className="mx-auto w-full max-w-md bg-white text-foreground dark:bg-gray-950">
      <CardHeader>
        <CardTitle>Font Size Preferences</CardTitle>
        <CardDescription>Adjust the font size to your liking</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label
            htmlFor="font-size-slider"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Font Size: {fontSize}px
          </label>
          <Slider
            className="w-full"
            id="font-size-slider"
            min={14}
            max={20}
            step={1}
            value={[fontSize]}
            onValueChange={handleFontSizeChange}
          />
        </div>
        <div className="rounded-md border p-4" style={{ fontSize: `${fontSize}px` }}>
          <h3 className="mb-2 font-semibold">Preview</h3>
          <p>This is how your text will look with the selected font size.</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleReset} variant="default" className="w-full">
          Reset to Default
        </Button>
      </CardFooter>
    </Card>
  );
}
