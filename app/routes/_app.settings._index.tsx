import { useFetcher } from '@remix-run/react';
import { useLocalStorage } from '@uidotdev/usehooks';
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect, useMemo, useRef, useState } from 'react';
import AvatarEditor from 'react-avatar-editor';
import { ClientOnly } from 'remix-utils/client-only';

import { type ReadGlossary } from '../../drizzle/schema';
import { assertAuthUser } from '../auth.server';
import { GlossaryList } from '../components/GlossaryList';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Slider } from '../components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { readGlossariesByIds, updateUser } from '../services';

export async function loader({ request }: LoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const glossaryIds = searchParams.getAll('glossaryIds') as string[];
  if (!glossaryIds.length) {
    return json({ success: true, glossaries: [] });
  }
  const glossaries = await readGlossariesByIds(glossaryIds);
  return json({ success: true, glossaries: glossaries });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const formData = await request.formData();
  const image = formData.get('image') as string;
  if (!image) {
    return json({ success: false, error: 'No image provided' }, { status: 400 });
  }

  await updateUser({ avatar: image, id: user.id });

  return json({ success: true });
}

export default function SettingsIndex() {
  return (
    <Tabs className="w-full" defaultValue="glossary">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="glossary">Glossary Subscriptions</TabsTrigger>
        <TabsTrigger value="font-settings">Font Settings</TabsTrigger>
        <TabsTrigger value="user-settings">User Settings</TabsTrigger>
        <TabsTrigger value="search">Search Config</TabsTrigger>
      </TabsList>
      <TabsContent value="glossary">
        <ClientOnly>
          {() => {
            return <GlossaryComponent />;
          }}
        </ClientOnly>
      </TabsContent>
      <TabsContent value="font-settings">
        <ClientOnly>
          {() => {
            return <FontSizePreference />;
          }}
        </ClientOnly>
      </TabsContent>
      <TabsContent value="user-settings">
        <ClientOnly>
          {() => {
            return <AvatarEditPage />;
          }}
        </ClientOnly>
      </TabsContent>
      <TabsContent value="search">To be implemented</TabsContent>
    </Tabs>
  );
}

function AvatarEditPage() {
  const [image, setImage] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const editorRef = useRef<AvatarEditor | null>(null);
  const fetcher = useFetcher<{ success: boolean }>();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImage(URL.createObjectURL(file));
    }
  };

  const handleScaleChange = (value: number[]) => {
    setScale(value[0]);
  };

  const handleSave = () => {
    if (editorRef.current) {
      const canvas = editorRef.current.getImageScaledToCanvas();
      const dataUrl = canvas.toDataURL();
      console.log('Edited image:', dataUrl);
      fetcher.submit({ image: dataUrl }, { method: 'post' });
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md text-foreground">
      <CardHeader>
        <CardTitle>Edit Your Avatar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          {image ? (
            <AvatarEditor
              rotate={0}
              width={250}
              border={50}
              height={250}
              image={image}
              scale={scale}
              ref={editorRef}
              borderRadius={125}
              color={[255, 255, 255, 0.6]} // RGBA
            />
          ) : (
            <div className="flex h-[250px] w-[250px] items-center justify-center rounded-full bg-gray-200 text-gray-400">
              <img alt="avatar" src="https://www.signivis.com/img/custom/avatars/member-avatar-01.png" />
              <p className="absolute text-lg">No image uploaded</p>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="image-upload">Upload Image</Label>
          <Input
            type="file"
            accept="image/*"
            id="image-upload"
            className="cursor-pointer"
            onChange={handleImageChange}
          />
        </div>
        {image && (
          <div>
            <Label htmlFor="zoom-slider">Zoom</Label>
            <Slider min={1} max={3} step={0.01} value={[scale]} id="zoom-slider" onValueChange={handleScaleChange} />
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="default" className="w-full" onClick={handleSave} disabled={!image || fetcher.state !== 'idle'}>
          Save Avatar
        </Button>
      </CardFooter>
    </Card>
  );
}

function GlossaryComponent() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [subscribedGlossaries, _] = useLocalStorage<string[]>('subscribedGlossaries', []);
  const fetcher = useFetcher<{ glossaries: ReadGlossary[]; success: boolean }>();

  useEffect(() => {
    if (subscribedGlossaries.length) {
      const glossaryIds = subscribedGlossaries.map((id) => `glossaryIds=${id}`).join('&');
      fetcher.load(`/settings?index&${glossaryIds}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glossaries = useMemo(() => {
    if (fetcher.data?.success) {
      return fetcher.data.glossaries.map((glossary) => ({
        ...glossary,
        createdAt: new Date(glossary.createdAt),
        updatedAt: new Date(glossary.updatedAt),
        deletedAt: glossary.deletedAt ? new Date(glossary.deletedAt) : null,
      }));
    }
    return [];
  }, [fetcher.data]);

  const glossaryStates = glossaries.filter((glossary) => subscribedGlossaries.includes(glossary.id));

  if (!glossaries.length) {
    return <div className="mx-auto w-full max-w-md">You have not subscribed to any glossaries yet.</div>;
  }

  return <GlossaryList glossaries={glossaryStates} />;
}

export function FontSizePreference() {
  const [fontSize, setFontSize] = useLocalStorage<number>('fontPreference', 14);

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
            min={14}
            max={20}
            step={1}
            className="w-full"
            value={[fontSize]}
            id="font-size-slider"
            onValueChange={handleFontSizeChange}
          />
        </div>
        <div className="rounded-md border p-4" style={{ fontSize: `${fontSize}px` }}>
          <h3 className="mb-2 font-semibold">Preview</h3>
          <p>This is how your text will look with the selected font size.</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button variant="default" className="w-full" onClick={handleReset}>
          Reset to Default
        </Button>
      </CardFooter>
    </Card>
  );
}
