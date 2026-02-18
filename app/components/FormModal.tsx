import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import React, { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Controller, FormProvider, useForm, useFormContext, type Mode } from 'react-hook-form';
import { ClientOnly } from 'remix-utils/client-only';
import { type z, type ZodSchema } from 'zod';

import { useToast } from '~/hooks/use-toast';

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
  fetcherKey?: string;
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
  fetcherKey = 'default',
}: PropsWithChildren<FormModalProps<T>>) => {
  const form = useForm<typeof schema>({
    resolver: zodResolver(schema),
    mode,
    defaultValues,
  });
  const fetcher = useFetcher<{ success: boolean; errors?: string[] }>({ key: fetcherKey });

  const disabled = fetcher.state !== 'idle';

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
      form.reset();
      form.clearErrors();
    }
  }, [open, form, defaultValues]);

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
      function hasNonPrimitive(obj: unknown) {
        const isPrimitive = (value: unknown) => {
          return value === null || (typeof value !== 'object' && typeof value !== 'function');
        };

        function check(obj: unknown) {
          // If it's a primitive, return false immediately
          if (isPrimitive(obj)) {
            return false;
          }

          // If it's an object or array, check all its values
          if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
              if (!isPrimitive(obj[key as keyof typeof obj])) {
                return true; // Return true only if we find a non-primitive value
              }
            }
            return false; // If all values were primitive, return false
          }

          return true; // For functions or other non-primitive types
        }

        return check(obj);
      }

      if (hasNonPrimitive(data)) {
        const enhancedData = JSON.stringify(data);
        const formData = {
          kind: kind || '',
          data: enhancedData,
        };
        fetcher.submit(formData, { method: 'post' });
      } else {
        fetcher.submit({ kind, ...data }, { method: 'post' });
      }
    },
    [fetcher, kind],
  );

  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      {() => (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            asChild
            onClick={(e) => {
              setOpen(true);
              e.stopPropagation();
            }}
          >
            {trigger}
          </DialogTrigger>
          <DialogContent className="lg:max-w-4xl" aria-describedby="form-modal-description">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="hidden">{description || 'form modal'}</DialogDescription>
            </DialogHeader>

            <FormProvider {...form}>
              <fetcher.Form method="post" onSubmit={form.handleSubmit(onSubmit)}>
                <div>{children}</div>
                <div className="h-4" />
                <DialogFooter className="gap-2">
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
  disabled?: boolean;
  options?: {
    label: string;
    value: string;
  }[];
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

interface BaseFormFieldProps extends FormInputProps {
  errors: ReturnType<typeof useFormContext>['formState']['errors'];
}

export function HiddenInput({ name, value }: { name: string; value: string }) {
  const { register } = useFormContext();
  return <input hidden type="hidden" value={value} {...register(name)} />;
}

export function FormInput({
  name,
  label,
  type = 'text',
  required = false,
  description,
  placeholder,
  disabled = false,
  onBlur,
}: FormInputProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} errors={errors} required={required} description={description}>
      <Input id={name} type={type} placeholder={placeholder} {...register(name)} onBlur={onBlur} disabled={disabled} />
    </BaseFormField>
  );
}

export function FormSelect({ name, label, required = false, description, options }: FormInputProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} errors={errors} required={required} description={description}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select defaultValue={field.value} onValueChange={field.onChange}>
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

export function FormTextarea({ name, label, required = false, description, placeholder }: FormInputProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  return (
    <BaseFormField name={name} label={label} errors={errors} required={required} description={description}>
      <Textarea placeholder={placeholder || label} {...register(name)} />
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
      <FormLabel htmlFor={name}>
        {label}
        {required && <span className="text-red-600">*</span>}
      </FormLabel>
      <FormControl>{children}</FormControl>
      {description && <FormDescription>{description}</FormDescription>}
      {errors[name] && <p className="text-sm text-red-500">{errors[name]?.message as string}</p>}
    </FormItem>
  );
}
