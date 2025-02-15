import { Outlet, useLoaderData } from '@remix-run/react';
import { json, type LoaderFunctionArgs, type MetaFunction } from '@vercel/remix';

import { assertAuthUser } from '../auth.server';
import { Can } from '../authorisation';
import { FormInput, FormModal, FormTextarea } from '../components/FormModal';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { Toaster } from '../components/ui/toaster';
import { readUsers } from '../services/user.service';
import { glossaryFormSchema } from '../validations/glossary.validation';

export const meta: MetaFunction = () => {
  return [{ title: 'Glossary' }];
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  const users = await readUsers();
  return json({ user, users: users.map((user) => ({ id: user.id, username: user.username, email: user.email })) });
};

export default function GlossaryLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-2 lg:px-4">
      <div className="flex items-center justify-between">
        <div className="my-2 flex h-10 w-full items-center justify-between gap-2 text-xl font-semibold">
          <div className="flex items-center gap-2">
            <SideBarTrigger />
            Glossary
          </div>
          <Can I="Read" this="Glossary">
            <GlossaryCreateModal />
          </Can>
        </div>
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}

const GlossaryCreateModal = () => {
  return (
    <FormModal
      schema={glossaryFormSchema}
      title="Create Glossary For Chinese"
      trigger={
        <Button className="w-20" variant="default">
          New
        </Button>
      }
    >
      <GlossaryCreateForm />
    </FormModal>
  );
};

const GlossaryCreateForm = () => {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormInput required name="sutraName" label="Sutra Name" description="The name of the sutra." />
      <FormInput required name="glossary" label="Glossary" description="The Chinese glossary term." />
      <FormTextarea name="sutraText" label="Sutra Text" description="The text of the sutra." />
      <FormTextarea name="volume" label="Volume" description="The volume of the sutra." />
      <FormTextarea name="cbetaFrequency" label="CBETA Frequency" description="The frequency of the sutra in CBETA." />
      <FormTextarea name="author" label="Author" description="The author of the glossary." />
      <FormTextarea name="discussion" label="Discussion" description="Any additional discussion about the glossary." />
    </div>
  );
};
