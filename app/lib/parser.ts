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
      if (child.stdin) {
        process.stdin.pipe(child.stdin);
      }
      
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

// returns a list of commands (pipeline) to run
export function parseLine(input: string, commands: [string[], Redirection, string | null][] = []): [string[], Redirection, string | null][] {
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
      if (currentChunk.length > 0) {
        writingTo.push(currentChunk.join(""));
      }
      const redirectionPath = redirection === null ? null : redirection.join("");
      commands.push([parsedInput, redirectionType, redirectionPath]);
      return parseLine(input.slice(index + 1), commands);
    } else {
      currentChunk.push(ch);
    }
  }
  writingTo.push(currentChunk.join(""));
  const redirectionPath = redirection === null ? null : redirection.join("");
  commands.push([parsedInput, redirectionType, redirectionPath]);
  return commands;
}

export async function executePipeline(line: string[]) {
  const [parsedInput, outputType, redirectionPath] = parse(line);
  const command = parsedInput[0];
  const args = parsedInput.slice(1, parsedInput.length);
  let outputManager;
  if (outputType !== null && redirectionPath !== null) {
    outputManager = new OutputManager([outputType, redirectionPath]);
  } else {
    outputManager = new OutputManager([null, null]);
  }

  if (command === Commands.EXIT) {
    process.exit();
  } else if (command === Commands.ECHO) {
    await outputManager.print(args.join(" "));
  } else if (command === Commands.TYPE) {
    if (isCommand(args[0])) {
      await outputManager.print(`${args[0]} is a shell builtin`);
    } else {
      const path = await find_path(args[0]);
      if (path) {
        await outputManager.print(`${args[0]} is ${path}`);
      } else {
        await outputManager.print(`${args[0]}: not found`);
      }
    }
  } else {
    const path = await find_path(command); // I'm reusing find_path but should try to run the file directly as this can cause a data race if I assume there are no changes between checking permissions and executing
    if (path) {
      let stdout;
      let stderr;
      try {
        const result = await execFileAsync(command, args);
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err) {
        const e = err as { stdout: string; stderr: string };
        stdout = e.stdout;
        stderr = e.stderr;
      }
      await outputManager.print(stdout, stderr);
    } else {
      await outputManager.print(`${command}: command not found`);
    }
  }
}
