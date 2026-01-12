import { createInterface, Readline } from "node:readline/promises";
import { access, constants, readdir, writeFile, exists, mkdir } from "node:fs/promises";
import { delimiter, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import readline from 'node:readline';
import { stdin } from "node:process";

const execFileAsync = promisify(execFile);

const Commands = {
  EXIT: "exit",
  ECHO: "echo",
  TYPE: "type",
} as const;
type Command = (typeof Commands)[keyof typeof Commands];
const CommandsValues = new Set(Object.values(Commands));

function isCommand(value: string): value is Command {
  return CommandsValues.has(value as any);
}

async function find_path(target: string): Promise<string | null> {
  const paths = process.env.PATH?.split(delimiter) ?? [];
  for (const path of paths) {
    try {
      const files = await readdir(path);
      for (const file of files) {
        if (file === target) {
          try {
            const full_path = `${path}${sep}${target}`;
            await access(full_path, constants.X_OK);
            return `${full_path}`;
          } catch {}
        }
      }
    } catch {}
  }
  return null;
}


const Outputs = {
  ">": "1>",
  "1>": "1>",
  "2>": "2>",
  ">>": "1>>",
  "1>>": "1>>",
  "2>>": "2>>"
} as const;

type OutputKey = keyof typeof Outputs;
type Output = typeof Outputs[OutputKey] | null;
const OutputKeys = new Set<OutputKey>(Object.keys(Outputs) as OutputKey[]);

function isOutputKey(value: string): value is OutputKey {
  return OutputKeys.has(value as any);
}

function parse(input: string): [string[], Output, string | null] {
  const parsedInput: string[] = [];
  let currentChunk: string[] = [];
  let specialChar: "'" | '"' | null = null;
  let escape = false
  let redirection: string[] | null = null;
  let writingTo = parsedInput;
  let outputType: Output = null;
  for (let ch of input) {
    if (escape) {
      if (specialChar === '"' && !(['"', "\\", "$", "`"].includes(ch))) {
        currentChunk.push("\\");
      }
      currentChunk.push(ch);
      escape = false;
    }
    else if (ch === "\\" && specialChar != "'" ) {
      escape = true;
    }
    else if (ch === specialChar) {
      specialChar = null;
    }
    else if ((ch === "'" || ch === '"') && specialChar === null) {
      specialChar = ch;
    }
    else if (ch === " " && specialChar === null) {
      if (currentChunk.length > 0) {
        const currentChunkString = currentChunk.join("");
        if (isOutputKey(currentChunkString)) {
          outputType = Outputs[currentChunkString];
          redirection = [];
          writingTo = redirection;
        } else {
          writingTo.push(currentChunkString);
        }
        currentChunk = [];
      }
    }
    else {
      currentChunk.push(ch);
    }
  }
  writingTo.push(currentChunk.join(""));
  const redirectionPath = redirection === null ? null: redirection.join("");
  return [parsedInput, outputType, redirectionPath];
}

type OutputConfig =
  | [ outputType: null, redirectionPath: null]
  | [ outputType: Output, redirectionPath: string];
class OutputManager {
  outputConfig: OutputConfig;
  constructor(config: OutputConfig) {
    this.outputConfig = config;
  }

  async print(stdout: string, stderr: string = "") {
    if (stdout === undefined || stderr === undefined) {
      console.log("undefined");
    }
    // interesting article on stdio buffering https://www.pixelbeat.org/programming/stdio_buffering/
    if (stdout.length > 0 && !stdout.endsWith("\n")) {
      stdout += "\n";
    }
    if (stderr.length > 0 && !stderr.endsWith("\n")) {
      stderr += "\n";
    }
    const [outputType, redirectionPath] = this.outputConfig;
    if (outputType === null) {
      process.stdout.write(stdout);
    } else {
      if (!(await exists(redirectionPath))) {
        const path = redirectionPath.split(sep);
        const folderPath = path.slice(0, path.length - 1);
        if (folderPath.length > 0) {
          const folderPathString = folderPath.join(sep);
          await mkdir(folderPathString, {recursive: true});
        }
      }
      let toFile = stdout;
      let toConsole = stderr;
      if (outputType === Outputs["2>"] || outputType === Outputs["2>>"]) {
        toFile = stderr;
        toConsole = stdout;
      }
      process.stdout.write(toConsole);
      let writeFlag = "w";
      if (outputType === Outputs["1>>"] || outputType === Outputs["2>>"]) {
          writeFlag = "a";
        }
      await writeFile(redirectionPath, toFile, {flag: writeFlag});
      }
  }
}

class Trie {
  children: {[key: string]: Trie};
  isWord: boolean;
  constructor() {
    this.children = {};
    this.isWord = false;
  }

}

const commandsTrie= new Trie();
for (let command of ["echo", "exit"]) {
  let node = commandsTrie;
  for (let ch of command) {
    if (!(ch in node.children)) {
      node.children[ch] = new Trie(); 
    }
    node = node.children[ch];
  }
  node.isWord = true;
}

function autocomplete(line: string[]): string | null {
  if (line.length === 0) {
    return null;
  }
  const lineString = line.join("").split(" ");
  const lastWord = lineString.at(-1);
  if (lastWord === undefined) {
    return null;
  }

  let node = commandsTrie;
  for (let ch of lastWord) {
    if (ch in node.children) {
      node = node.children[ch]
    } else {
      return null;
    }
  }
  let autocompleteBuilder: string[] = [];
  while(true) {
    let noChildrenLeft = true;
    for (const key in node.children) {
      noChildrenLeft = false;
      autocompleteBuilder.push(key);
      node = node.children[key];
      break;
    }
    if (noChildrenLeft) {
      break;
    }
  }
  autocompleteBuilder.push(" ");
  return autocompleteBuilder.join(""); 

}

let line: string[] = [];
process.stdout.write("$ ");
async function handleKeypress(str: string, key: any) {
  if(key.name === "return" || key.name === "enter") { // I originally only had "return" and it was a pain finding that the test runner passes "enter"
    process.stdout.write("\n");
    await processLine(line.join(""));
    process.stdout.write("$ ");
    line = [];
  } else if (key.name === "tab") {
    const autocompleteString = autocomplete(line);
    if (autocompleteString !== null)  {
      process.stdout.write(autocompleteString);
      line.push(...autocompleteString);
    }
  } else if (key.name === "backspace") {
    if (line.length > 0) {
      line.pop();
      process.stdout.write("\b \b");
    }
  } else if(key.sequence.length === 1) {
    line.push(str);
    process.stdout.write(str);
  }
}

readline.emitKeypressEvents(stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
} else {
  console.log("NO TTY");
}
process.stdin.on("keypress", handleKeypress);

async function processLine(line: string) {
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
  }
  else if (command === Commands.ECHO) {
    await outputManager.print(args.join(" "));
  }
  else if(command === Commands.TYPE) {
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
  }
  else {
    const path = await find_path(command); // I'm reusing find_path but should try to run the file directly as this can cause a data race if I assume there are no changes between checking permissions and executing
    if (path) {
      let stdout;
      let stderr;
      try {
        const result = await execFileAsync(command, args);
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err) {
        const e = err as {stdout: string, stderr: string};
        stdout = e.stdout;
        stderr = e.stderr;
      }
      await outputManager.print(stdout, stderr);
    } else {
      await outputManager.print(`${command}: command not found`);
    }
  }
}