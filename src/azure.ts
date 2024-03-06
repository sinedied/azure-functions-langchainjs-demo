import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { YoutubeLoader } from "langchain/document_loaders/web/youtube";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatPromptTemplate } from "@langchain/core/prompts";

import { AzureChatOpenAI } from "@langchain/azure-openai";
import { AzureOpenAIEmbeddings } from "@langchain/azure-openai";
import {
  AzureAISearchVectorStore,
  AzureAISearchQueryType,
} from "@langchain/community/vectorstores/azure_aisearch";

const YOUTUBE_VIDEO_URL = "https://www.youtube.com/watch?v=FZhbJZEgKQ4";
const QUESTION = "What are the news about GPT-4 models?";

export async function* askYoutube(question?: string) {

  console.log("--- Using Azure version ---");

  // Load documents ------------------------------------------------------------

  console.log("Loading documents...");

  const loader = YoutubeLoader.createFromUrl(YOUTUBE_VIDEO_URL, {
    language: "en",
    addVideoInfo: true,
  });
  const rawDocuments = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2000,
    chunkOverlap: 400,
  });
  const documents = await splitter.splitDocuments(rawDocuments);

  // Init models and DB --------------------------------------------------------

  console.log("Initializing models and DB...");

  const embeddings = new AzureOpenAIEmbeddings();
  const model = new AzureChatOpenAI();
  const vectorStore = new AzureAISearchVectorStore(embeddings, {
    search: { type: AzureAISearchQueryType.SimilarityHybrid },
  });

  // Search if documents already exist for the source video
  const videoId = YOUTUBE_VIDEO_URL.split("v=")[1];
  const indexedDocuments = await vectorStore.similaritySearch("*", 1, {
    filterExpression: `metadata/source eq '${videoId}'`,
  });

  if (indexedDocuments.length === 0) {
    console.log("Embedding documents...");
    await vectorStore.addDocuments(documents);
  }

  // Run the chain -------------------------------------------------------------

  console.log("Running the chain...");

  const questionAnsweringPrompt = ChatPromptTemplate.fromMessages([
    ["system", "Answer the user's question using only the sources below:\n\n{context}"],
    ["human", "{input}"],
  ]);
  const combineDocsChain = await createStuffDocumentsChain({
    prompt: questionAnsweringPrompt,
    llm: model,
  });
  const chain = await createRetrievalChain({
    retriever: vectorStore.asRetriever(),
    combineDocsChain,
  });
  const ask = question ?? QUESTION
  const stream = await chain.stream({ input: ask });

  // Print the result ----------------------------------------------------------

  console.log(`Answer for the question "${ask}":\n`);
  for await (const chunk of stream) {
    process.stdout.write(chunk.answer ?? "");
    if (chunk.answer !== undefined)
      yield chunk.answer;
  }
  console.log();
}
