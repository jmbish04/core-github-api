/**
 * @file src/utils/hono.ts
 * @description This file contains Hono-related helper functions and types.
 * @owner AI-Builder
 */

import { OpenAPIHono } from '@hono/zod-openapi'


import { v4 as uuidv4 } from 'uuid'
import { ChatSession } from '@custom-types'

// Re-export Env as Bindings for compatibility
export type Bindings = Env

// Create a new OpenAPIHono app with the defined Bindings
export const app = new OpenAPIHono<{ Bindings: Env }>()

/**
 * @extension_point
 * This is a good place to add custom Hono middleware or helper functions.
 */
