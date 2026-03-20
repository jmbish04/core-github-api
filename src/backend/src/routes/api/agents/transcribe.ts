import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const transcribeApi = new OpenAPIHono<{ Bindings: Env }>()

// Define the route for OpenAPI
const transcribeRoute = createRoute({
  method: 'post',
  path: '/',
  summary: 'Transcribes audio to text',
  description: 'Uses Cloudflare Workers AI Whisper model to transcribe an audio file into text.',
  tags: ['AI Agents'],
  request: {
    body: {
      content: {
        'application/octet-stream': {
          schema: {
            type: 'string',
            format: 'binary',
            description: 'The raw audio data to transcribe (e.g. webm, mp3, wav)',
          },
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Successful transcription',
      content: {
        'application/json': {
          schema: z.object({
            text: z.string().describe('The transcribed text from the audio'),
          }),
        },
      },
    },
    400: {
      description: 'Bad Request - No audio data provided',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
    500: {
      description: 'Internal Server Error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
          }),
        },
      },
    },
  },
})

transcribeApi.openapi(transcribeRoute, async (c) => {
  try {
    const arrayBuffer = await c.req.arrayBuffer()
    
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return c.json({ error: 'No audio data provided' }, 400)
    }

    // Workers AI Whisper requires the audio payload as an array of numbers
    const audioArray = [...new Uint8Array(arrayBuffer)]

    // Execute the whisper model via the native AI binding
    const response = await c.env.AI.run('@cf/openai/whisper', {
      audio: audioArray,
    })

    return c.json({ text: response.text }, 200)
  } catch (error: any) {
    console.error('Transcription error:', error)
    return c.json({ error: error.message || 'Failed to transcribe audio' }, 500)
  }
})

export default transcribeApi
