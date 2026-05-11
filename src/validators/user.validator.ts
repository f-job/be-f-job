import { z } from "zod";

export const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(99),
    email: z.string().email().max(99),
    password: z.string().min(8).max(100),
    role: z.enum(["ADMIN", "USER"]).optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(99).optional(),
    email: z.string().email().max(99).optional(),
    role: z.enum(["ADMIN", "USER"]).optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
});
