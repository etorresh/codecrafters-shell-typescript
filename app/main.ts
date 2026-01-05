import { createInterface } from "node:readline/promises";
import { access, constants, readdir, writeFile, exists, mkdir } from "node:fs/promises";
import { delimiter, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

function parse(input: string): [string[], string | null] {
  const parsedInput: string[] = [];
  let currentChunk: string[] = [];
  let specialChar: "'" | '"' | null = null;
  let escape = false
  let redirection: string[] | null = null;
  let writingTo = parsedInput;
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
      if (currentChunk.length > 0 && !(currentChunk.length === 1 && currentChunk[currentChunk.length - 1] === "1")) {
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
  return [parsedInput, redirectionPath];
}

class OutputManager {
  redirectionPath: string | null;
  constructor(redirectionPath: string | null) {
    this.redirectionPath = redirectionPath;
  }

  async print(output: string) {
    if (this.redirectionPath === null) {
      if (!output.endsWith("\n")) {
        output += "\n";
      }
      process.stdout.write(output);
    } else {
      if (!(await exists(this.redirectionPath))) {
        const path = this.redirectionPath.split(sep);
        const folderPath = path.slice(0, path.length - 1);
        if (folderPath.length > 0) {
          const folderPathString = folderPath.join(sep);
          await mkdir(folderPathString, {recursive: true});
        }
      }
      await writeFile(this.redirectionPath, output);
    }
  }
}

while (true) {
  const input = await rl.question("$ ");
  const [parsedInput, redirectionPath] = parse(input);
  const command = parsedInput[0];
  const args = parsedInput.slice(1, parsedInput.length);
  const outputManager = new OutputManager(redirectionPath);


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
      const { stdout, stderr} = await execFileAsync(command, args);
      if (stderr.length == 0) {
        await outputManager.print(stdout);
      } else {
        console.log(stderr);
      }
    } else {
      await outputManager.print(`${command}: command not found`);
    }
  }
}
rl.close();