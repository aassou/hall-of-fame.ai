import { StreamingTextResponse, LangChainStream } from "ai";
import { auth, currentUser } from "@clerk/nextjs";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import { Replicate } from "@langchain/community/llms/replicate";
import { NextResponse } from "next/server";

import { MemoryManager } from "@/lib/memory";

import { rateLimit } from "@/lib/rate-limit";
import prismadb from "@/lib/prismadb";

export async function POST(
  request: Request,
  { params }: { params: { chatId: string } }
) {
  try {
    const { prompt } = await request.json();
    const user = await currentUser();

    if (!user || !user.firstName || !user.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const identifier = request.url + "_" + user.id;
    const { success } = await rateLimit(identifier);

    if (!success) {
      return new NextResponse("Rate limit exceeded", { status: 429 });
    }

    const companion = await prismadb.companion.update({
      where: {
        id: params.chatId,
      },
      data: {
        messages: {
          create: {
            content: prompt,
            role: "user",
            userId: user.id,
          }
        }
      }
    });

    if (!companion) {
      return new NextResponse("Companion not found", { status: 404 });
    }

    const name = companion.id;
    const companionFileName = name + '.txt';
    const companionKey = {
      companionName: name,
      userId: user.id,
      modelName: "llama2-7b"
    }

    const memoryManager = await MemoryManager.getInstance();
    const records = await memoryManager.readLatestHistory(companionKey);

    if (records.length === 0) {
      await memoryManager.seedChatHistory(
        companion.seed, 
        "\n\n", 
        companionKey
      );
    }

    await memoryManager.writeToHistory("User: " + prompt + "\n", companionKey);
    const recentChatHistory = await memoryManager.readLatestHistory(companionKey);
    const similarDocs = await memoryManager.vectorSearch(
      recentChatHistory,
      companionFileName
    );

    let relevantHistory = "";

    if (!!similarDocs && similarDocs.length !== 0) {
      relevantHistory = similarDocs.map(
        (doc) => doc.pageContent
      ).join("\n");
    }

    const { handlers } = LangChainStream();
    const model = new Replicate({
      model: "meta/llama7b-v2-chat:4f0a4744c7295c024a1de15e1a63c880d3da035fa1f49bfd344fe076074c8eea",
      input: {
        max_length: 2048,
      },
      apiKey: process.env.REPLICATE_API_TOKEN,
      callbackManager: CallbackManager.fromHandlers(handlers),
    });

    model.verbose = true;

    const resp = String(
      await model
        .invoke(
          `
        ONLY generate plain sentences without prefix of who is speaking. DO NOT use ${companion.name}: prefix. 

        ${companion.instructions}

        Below are relevant details about ${companion.name}'s past and the conversation you are in.
        ${relevantHistory}


        ${recentChatHistory}\n${companion.name}:`
        )
        .catch(console.error)
    );

    const cleaned = resp.replaceAll(",", "");
    const chunks = cleaned.split("\n");
    const response = chunks[0];

    await memoryManager.writeToHistory("" + response.trim(), companionKey);
    var Readable = require("stream").Readable;

    let s = new Readable();
    s.push(response);
    s.push(null);

    if (response !== undefined && response.length > 1) {
      memoryManager.writeToHistory("" + response.trim(), companionKey);

      await prismadb.companion.update({
        where: {
          id: params.chatId,
        },
        data: {
          messages: {
            create: {
              content: response.trim(),
              role: "system",
              userId: user.id
            }
          }
        }
      });
    }

    return new StreamingTextResponse(s);
  } catch (error) {
    console.log("[CHAT_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}