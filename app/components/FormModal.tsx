import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import React, { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Controller, FormProvider, useForm, useFormContext, type Mode } from 'react-hook-form';
import { ClientOnly } from 'remix-utils/client-only';
import { type z, type ZodSchema } from 'zod';
import { useToast } from '../hooks/use-toast';
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from './ui';
import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

interface FormModalProps<TFormValues extends ZodSchema = ZodSchema> {
  title: string;
  description?: string;
  defaultValues?: z.infer<TFormValues>;
  schema: TFormValues;
  trigger: React.ReactNode;
  mode?: Mode;
  // hidden input field, the indicate the kind of form
  kind?: string;
}

export const FormModal = <T extends ZodSchema = ZodSchema>({
  children,
  title,
  description,
  trigger,
  schema,
  defaultValues,
  kind,
  mode = 'onSubmit',
}: PropsWithChildren<FormModalProps<T>>) => {
  const form = useForm<typeof schema>({
    resolver: zodResolver(schema),
    mode,
    defaultValues,
  });
  const fetcher = useFetcher<{ success: boolean; errors?: string[] }>();

  const disabled = fetcher.state !== 'idle';

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      form.reset();
      form.clearErrors();
    }
  }, [open, form]);

  const { toast } = useToast();

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      setOpen(false);
    }
    if (fetcher.state === 'idle' && !fetcher.data?.success && fetcher.data?.errors) {
      toast({
        title: 'Oops!',
        description: JSON.stringify(fetcher.data?.errors),
        variant: 'error',
      });
    }
  }, [fetcher.data, fetcher.state, toast]);

  const onSubmit = useCallback(
    (data: z.infer<typeof schema>) => {
      const kindData = {
        ...data,
        kind,
      };
      fetcher.submit(kindData, { method: 'post' });
    },
    [fetcher, kind],
  );

  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => (
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger
            asChild
            onClick={(e) => {
              setOpen(true);
              e.stopPropagation();
            }}
          >
            {trigger}
          </DialogTrigger>
          <DialogContent className="max-w-2xl lg:max-w-4xl" aria-describedby="form-modal-description">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="hidden">{description || 'form modal'}</DialogDescription>
            </DialogHeader>

            <FormProvider {...form}>
              <fetcher.Form method="post" onSubmit={form.handleSubmit(onSubmit)}>
                <div>{children}</div>
                <div className="h-4" />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary" disabled={disabled} onClick={() => setOpen(false)}>
                      Close
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={disabled}>
                    Save
                  </Button>
                </DialogFooter>
              </fetcher.Form>
            </FormProvider>
          </DialogContent>
        </Dialog>
      )}
    </ClientOnly>
  );
};

interface FormInputProps {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  options?: {
    label: string;
    value: string;
  }[];
}

interface BaseFormFieldProps extends FormInputProps {
  errors: ReturnType<typeof useFormContext>['formState']['errors'];
}

export function HiddenInput({ name, value }: { name: string; value: string }) {
  const { register } = useFormContext();
  return <input type="hidden" value={value} hidden {...register(name)} />;
}

export function FormInput({ name, label, type = 'text', required = false, description, placeholder }: FormInputProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} required={required} description={description} errors={errors}>
      <Input id={name} type={type} placeholder={placeholder} {...register(name)} />
    </BaseFormField>
  );
}

export function FormSelect({ name, label, required = false, description, options }: FormInputProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} required={required} description={description} errors={errors}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <SelectTrigger id={name}>
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </BaseFormField>
  );
}

export function FormTextarea({ name, label, required = false, description }: FormInputProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} required={required} description={description} errors={errors}>
      <Textarea placeholder={label} {...register(name)} />
    </BaseFormField>
  );
}

function BaseFormField({
  errors,
  name,
  label,
  required = false,
  description,
  children,
}: PropsWithChildren<BaseFormFieldProps>) {
  return (
    <FormItem>
      <FormLabel>
        {label}
        {required && <span className="text-red-600">*</span>}
      </FormLabel>
      <FormControl>{children}</FormControl>
      {description && <FormDescription>{description}</FormDescription>}
      {errors[name] && <p className="text-sm text-red-500">{errors[name]?.message as string}</p>}
    </FormItem>
  );
}
