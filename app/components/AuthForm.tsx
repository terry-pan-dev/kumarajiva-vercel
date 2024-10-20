import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import { useEffect, type PropsWithChildren } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { type z, type ZodSchema } from 'zod';

interface AuthFormProps {
  schema: ZodSchema;
  defaultValues: Record<string, any>;
}

export default function AuthForm({ children, schema, defaultValues }: PropsWithChildren<AuthFormProps>) {
  const fetcher = useFetcher<{ success: boolean; errors?: { password: string } }>();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    fetcher.submit(data, { method: 'post' });
  };

  useEffect(() => {
    if (!fetcher.data?.success && fetcher.data?.errors) {
      form.setError('password', { message: fetcher.data.errors.password });
    }
  }, [fetcher.data, form]);
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>{children}</form>
    </FormProvider>
  );
}
