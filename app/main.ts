import { createInterface } from "node:readline/promises";
import { access, constants, readdir } from "node:fs/promises";
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

function parse_args(args_raw: string): string[] {
  let args: string[] = [];
  let arg: string[] = [];
  let specialChar: "'" | '"' | null = null;
  for (let ch of args_raw) {
    if (ch === specialChar) {
      specialChar = null;
    }
    else if ((ch === "'" || ch === '"') && specialChar === null) {
      specialChar = ch;
    }
    else if (ch === " " && specialChar === null) {
      if (arg.length > 0) {
        args.push(arg.join(""));
        arg = [];
      }
    }
    else {
      arg.push(ch);
    }
  }
  args.push(arg.join(""));
  return args;
}

while (true) {
  const input = await rl.question("$ ");
  const first_space = input.indexOf(" ");
  const command = first_space === -1 ? input : input.slice(0, first_space);
  const args_raw = first_space === -1 ? "" : input.slice(first_space + 1);
  const args = parse_args(args_raw);

  if (command === Commands.EXIT) {
    break;
  }
  else if (command === Commands.ECHO) {
    console.log(args.join(" "));
  }
  else if(command === Commands.TYPE) {
    if (isCommand(args[0])) {
      console.log(`${args[0]} is a shell builtin`);
    } else {
      const path = await find_path(args[0]); 
      if (path) {
        console.log(`${args[0]} is ${path}`);
      } else {
        console.log(`${args[0]}: not found`);
      }
    }
  }
  else {
    const path = await find_path(command); // I'm reusing find_path but should try to run the file directly as this can cause a data race if I assume there are no changes between checking permissions and executing
    if (path) {
      const { stdout, stderr} = await execFileAsync(command, args);
      process.stdout.write(stdout);
    } else {
      console.log(`${command}: command not found`);
    }
  }
}
rl.close();