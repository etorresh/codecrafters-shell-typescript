import type { Redirection } from "./constants";
import { isRedirectionKey, Redirections } from "./constants";

export function parse(input: string): [string[], Redirection, string | null] {
  const parsedInput: string[] = [];
  let currentChunk: string[] = [];
  let specialChar: "'" | '"' | null = null;
  let escape = false;
  let redirection: string[] | null = null;
  let writingTo = parsedInput;
  let redirectionType: Redirection = null;
  for (let ch of input) {
    if (escape) {
      if (specialChar === '"' && !['"', "\\", "$", "`"].includes(ch)) {
        currentChunk.push("\\");
      }
      currentChunk.push(ch);
      escape = false;
    } else if (ch === "\\" && specialChar != "'") {
      escape = true;
    } else if (ch === specialChar) {
      specialChar = null;
    } else if ((ch === "'" || ch === '"') && specialChar === null) {
      specialChar = ch;
    } else if (ch === " " && specialChar === null) {
      if (currentChunk.length > 0) {
        const currentChunkString = currentChunk.join("");
        if (isRedirectionKey(currentChunkString)) {
          redirectionType = Redirections[currentChunkString]; // normalize
          redirection = [];
          writingTo = redirection;
        } else {
          writingTo.push(currentChunkString);
        }
        currentChunk = [];
      }
    } else {
      currentChunk.push(ch);
    }
  }
  writingTo.push(currentChunk.join(""));
  const redirectionPath = redirection === null ? null : redirection.join("");
  return [parsedInput, redirectionType, redirectionPath];
}