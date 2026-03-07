import { z } from "zod";

export const ConfigTypeSchema = z.enum(["string", "number", "boolean", "secret", "json"]);

export const PostConfigSchema = z.object({
  key: z.string().min(1, "Key is required").regex(/^[A-Z0-9_]+$/, "Key must be UPPERCASE_SNAKE_CASE"),
  value: z.any(),
  type: ConfigTypeSchema,
  category: z.string().default("general"),
  description: z.string().optional(),
  // Secret Store specific flags
  isSecretStoreManaged: z.boolean().default(false),
  secretName: z.string().optional(),
}).superRefine((data, ctx) => {
  // 1. If it's a secret managed by Cloudflare, we must have a secretName
  if (data.isSecretStoreManaged && !data.secretName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "secretName is required when isSecretStoreManaged is true",
      path: ["secretName"],
    });
  }

  // 2. Type-specific value validation
  if (data.type === "number" && typeof data.value !== "number") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Value must be a number",
      path: ["value"],
    });
  }

  if (data.type === "boolean" && typeof data.value !== "boolean") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Value must be a boolean",
      path: ["value"],
    });
  }

  // 3. Secret validation: If creating a new secret, ensure value (the secret text) is present
  if (data.type === "secret" && !data.value) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A secret value or ID is required",
      path: ["value"],
    });
  }
});

export type PostConfigInput = z.infer<typeof PostConfigSchema>;
