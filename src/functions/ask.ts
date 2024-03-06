import { Readable } from "node:stream";
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import "dotenv/config";
import { askYoutube as askYoutubeLocal } from "../local.js";
import { askYoutube as askYoutubeAzure } from "../azure.js";

export async function ask(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  const body = (await request.json()) as any;

  // Use local or Azure implementation
  const useAzure = process.env.USE_AZURE === "true";
  const askYoutube = useAzure ? askYoutubeAzure : askYoutubeLocal;

  const chunks = await askYoutube(body?.question);

  // Create a new stream buffer
  const buffer = new Readable();
  // We must implement the _read method, but we don't need to do anything
  buffer._read = () => {};

  // Do not await otherwise the streaming won't work
  streamData(chunks, buffer);

  return {
    body: buffer,
    headers: {
      "Content-Type": "application/x-ndjson",
    },
  };
}

async function streamData(chunks: AsyncIterable<any>, buffer: Readable) {
  for await (const chunk of chunks) {
    // Send JSON chunks, separated by newlines
    buffer.push(JSON.stringify(chunk) + "\n");
  }

  // Signal end of stream
  buffer.push(null);
}

app.setup({ enableHttpStream: true });

app.http("ask", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: ask,
});
