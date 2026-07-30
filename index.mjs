// AI Gateway smoke test.
//
// Proves the Gateway route works end to end: the AI SDK reads VERCEL_OIDC_TOKEN
// out of .env.local and calls through Vercel, so no provider API key is needed
// here. Run it with:
//
//   node --env-file=.env.local index.mjs
//
// The model below is Vercel's own example. To route to Claude instead — which
// is what this app's nameplate scanner and manual reader actually use — swap
// the model string for an Anthropic one, e.g. 'anthropic/claude-opus-5'.
// Nothing else in the call changes; that's the point of the Gateway.
import { streamText } from "ai";

const result = streamText({
  model: "openai/gpt-5.5",
  prompt: "Explain quantum computing in simple terms.",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
process.stdout.write("\n");
