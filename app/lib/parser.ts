import { fork } from "node:child_process";
import type { Redirection } from "./constants";
import { isRedirectionKey, Redirections } from "./constants";
import path from "node:path";

export function parse(input: string): [string[], Redirection, string | null] {
  const parsedInput: string[] = [];
  let currentChunk: string[] = [];
  let specialChar: "'" | '"' | null = null;
  let escape = false;
  let redirection: string[] | null = null;
  let writingTo = parsedInput;
  let redirectionType: Redirection = null;
  for (const [index, ch] of [...input].entries()) {
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
    } else if (ch === "|") {
      const child = fork(path.join(__dirname, "./executor.ts"), [], {
        // stdin, stdout, stderr
        stdio: ['pipe','inherit', 'ignore', "ipc"]
      });
      child.stdin?.write(input.slice(index + 1));
      // TODO: the last command on a pipeline is the one that goes to the terminal, this means I need collect all commands, and then middle commands get stdout pipe, and the last one gets inherit.
      break;
    } else {
      currentChunk.push(ch);
    }
  }
  writingTo.push(currentChunk.join(""));
  const redirectionPath = redirection === null ? null : redirection.join("");
  return [parsedInput, redirectionType, redirectionPath];
}