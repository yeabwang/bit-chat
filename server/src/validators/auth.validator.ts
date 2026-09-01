import { z } from "zod";

export const userNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(
    /^[a-z0-9._-]+$/,
    "Username may only contain letters, numbers, dot, underscore and hyphen",
  );

// bcrypt silently truncates past 72 bytes
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

// the value ends up in an <img src>
export const avatarSchema = z
  .string()
  .trim()
  .url("Avatar must be a valid URL")
  .refine(
    (value) => /^https?:$/.test(new URL(value).protocol),
    "Avatar must be an http(s) URL",
  );

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(60, "Name must be at most 60 characters"),
  userName: userNameSchema,
  password: passwordSchema,
  avatar: avatarSchema.optional(),
});

export const loginSchema = z.object({
  userName: userNameSchema,
  password: passwordSchema,
});

export type RegisterSchemaType = z.infer<typeof registerSchema>;
export type LoginSchemaType = z.infer<typeof loginSchema>;
