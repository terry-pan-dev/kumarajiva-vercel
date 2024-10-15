import { type z, type ZodSchema } from 'zod';

export const validatePayload = <T extends ZodSchema = ZodSchema>({
  schema,
  formData,
}: {
  schema: T;
  formData: ReturnType<typeof Object.fromEntries>;
}): z.infer<T> => {
  const { success, data, error } = schema.safeParse(formData);
  if (!success) {
    throw error;
  }
  return data;
};
