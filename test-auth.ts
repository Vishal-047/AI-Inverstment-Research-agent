import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
  const apiKey = process.env.GOOGLE_API_KEY;
  console.log("Key starts with:", apiKey?.substring(0, 3));
  
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash",
    apiKey: apiKey,
    // Try passing Bearer
    customHeaders: {
      "Authorization": `Bearer ${apiKey}`
    }
  });

  try {
    const res = await llm.invoke("Say hello");
    console.log("Success:", res.content);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

test();
