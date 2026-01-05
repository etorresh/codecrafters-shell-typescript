import { createInterface } from "node:readline/promises";
import { access, constants, readdir, writeFile, exists, mkdir } from "node:fs/promises";
import { delimiter, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { error } from "node:console";

const execFileAsync = promisify(execFile);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

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

function parse(input: string): [string[], number, string | null] {
  const parsedInput: string[] = [];
  let currentChunk: string[] = [];
  let specialChar: "'" | '"' | null = null;
  let escape = false
  let redirection: string[] | null = null;
  let writingTo = parsedInput;
  let outputType = 0;
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
        writingTo.push(currentChunk.join(""));
        currentChunk = [];
      }
    }
    else if (ch === ">" && specialChar === null) {
      if (currentChunk.length === 0) {
        outputType = 1;
      } else if (currentChunk.length === 1 && ["1", "2"].includes(currentChunk[0])) {
        outputType = parseInt(currentChunk[0]); 
      } else if (currentChunk.length > 0) {
        writingTo.push(currentChunk.join(""));
      }
      currentChunk = [];
      redirection = [];
      writingTo = redirection;
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
  | { outputType: 0; redirectionPath: null}
  | { outputType: 1 | 2; redirectionPath: string};
class OutputManager {
  outputConfig: OutputConfig;
  constructor(outputType: number, redirectionPath: string | null) {
    if (outputType === 0 && redirectionPath === null) {
      this.outputConfig = {outputType, redirectionPath};
    } else if ((outputType === 1 || outputType === 2) && redirectionPath != null) {
      this.outputConfig = {outputType, redirectionPath};
    } else {
      throw new Error("outputType must be 0, 1, or 2. redirectionPath can not be null when outputType === (1 | 2)");
    }
  }

  async print(stdout: string, stderr: string = "") {
    if (stdout.length > 0 && !stdout.endsWith("\n")) {
      stdout += "\n";
    }
    if (stderr.length > 0 && !stderr.endsWith("\n")) {
      stderr += "\n";
    }

    if (this.outputConfig.outputType === 0) {
      process.stdout.write(stdout);
    } else {
      if (!(await exists(this.outputConfig.redirectionPath))) {
        const path = this.outputConfig.redirectionPath.split(sep);
        const folderPath = path.slice(0, path.length - 1);
        if (folderPath.length > 0) {
          const folderPathString = folderPath.join(sep);
          await mkdir(folderPathString, {recursive: true});
        }
      }
      if (this.outputConfig.outputType === 1) {
        await writeFile(this.outputConfig.redirectionPath, stdout);
        process.stdout.write(stderr);
      } else if (this.outputConfig.outputType === 2) {
        await writeFile(this.outputConfig.redirectionPath, stderr);
        process.stdout.write(stdout);
      }
    }
  }
}

while (true) {
  const input = await rl.question("$ ");
  const [parsedInput, outputType, redirectionPath] = parse(input);
  const command = parsedInput[0];
  const args = parsedInput.slice(1, parsedInput.length);
  const outputManager = new OutputManager(outputType, redirectionPath);

  if (command === Commands.EXIT) {
    break;
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
      await outputManager.print(stdout, stderr); // to do: create a function to normalize stdout/stderr for line  buffering as if it doesn't have \n then it doesn't print. Interesting article on it https://www.pixelbeat.org/programming/stdio_buffering/
    } else {
      await outputManager.print(`${command}: command not found`);
    }
  }
}
rl.close();