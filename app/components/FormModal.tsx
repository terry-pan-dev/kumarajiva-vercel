import { zodResolver } from '@hookform/resolvers/zod';
import { useFetcher } from '@remix-run/react';
import React, { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
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
import { ToastAction } from './ui/toast';

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
  const fetcher = useFetcher<{ success: boolean; errors?: string[]; sutraId?: string; message?: string }>({
    key: fetcherKey,
  });

  const disabled = fetcher.state !== 'idle';

  const [open, setOpen] = useState(false);
  const [openToast, setOpenToast] = useState(false);
  const processedSutraIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
      form.reset();
      form.clearErrors();
      setOpenToast(true);
    }
  }, [open, form, defaultValues]);

  const { toast } = useToast();

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      setOpen(false);

      // Show success toast for sutra creation
      if (fetcher.data.sutraId && !processedSutraIds.current.has(fetcher.data.sutraId)) {
        const copyToClipboard = async () => {
          try {
            await navigator.clipboard.writeText(fetcher.data!.sutraId!);
            toast({
              title: 'Copied! ✅',
              description: 'Sutra ID has been copied to your clipboard',
              variant: 'default',
              duration: 3000,
            });
            setOpenToast(false);
          } catch (error) {
            console.error('Failed to copy:', error);
          }
        };

        openToast &&
          toast({
            title: 'Sutra Created Successfully! 🎉',
            description: `New sutra ID: ${fetcher.data.sutraId}`,
            variant: 'default',
            duration: 12000, // 12 seconds to give time to copy
            action: (
              <ToastAction altText="Copy sutra ID" onClick={copyToClipboard}>
                Copy ID
              </ToastAction>
            ),
          });

        // Try automatic copy first, but don't show error toast if it fails
        navigator.clipboard.writeText(fetcher.data.sutraId).catch(() => {
          // Silent fail - user can use the copy button
        });

        // Mark this sutra ID as processed to prevent duplicate toasts
        processedSutraIds.current.add(fetcher.data.sutraId);
      }
    }
    if (fetcher.state === 'idle' && !fetcher.data?.success && fetcher.data?.errors) {
      toast({
        title: 'Oops!',
        description: JSON.stringify(fetcher.data?.errors),
        variant: 'error',
      });
    }
  }, [fetcher.data, fetcher.state, toast, openToast]);

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

      // Filter out empty string values, 'undefined' strings, and actual undefined values
      const cleanedData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => {
          return value !== '' && value !== 'undefined' && value !== undefined && value !== null;
        }),
      );

      if (hasNonPrimitive(cleanedData)) {
        const enhancedData = JSON.stringify(cleanedData);
        const formData = {
          kind: kind || '',
          data: enhancedData,
        };
        fetcher.submit(formData, { method: 'post' });
      } else {
        fetcher.submit({ kind: kind || '', ...cleanedData }, { method: 'post' });
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
          <DialogContent
            aria-describedby="form-modal-description"
            className="max-h-[90vh] overflow-y-auto lg:max-w-4xl"
          >
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
          <Select
            defaultValue={field.value || ''}
            onValueChange={(value) => {
              // Prevent string 'undefined' from being set
              if (value === 'undefined' || value === '') {
                field.onChange(undefined);
              } else {
                field.onChange(value);
              }
            }}
          >
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
