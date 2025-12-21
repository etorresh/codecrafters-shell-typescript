import { createInterface } from "node:readline/promises";
import { access, constants, readdir } from "node:fs/promises";
import { delimiter, sep } from "node:path";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const Commands = {
  EXIT: "exit",
  ECHO: "echo",
  TYPE: "type",
} as const;
type Command = typeof Commands[keyof typeof Commands];
const CommandsValues = new Set(Object.values(Commands));

function isCommand(value: string): value is Command {
  return CommandsValues.has(value as Command);
}

async function type(args: string[]): Promise<string> {
  if (isCommand(args[0])) {
    return `${args[0]} is a shell builtin`;
  } 
  else {
    const paths = process.env.PATH?.split(delimiter) ?? [];
    for (const path of paths) {
      try {
        const files = await readdir(path);
        for (const file of files) {
          if (file === args[0]) {
            try {
              const full_path = `${path}${sep}${args[0]}`;
              await access(full_path, constants.X_OK);
              return `${args[0]} is ${full_path}`;
            } catch {}
          }
        }
      } catch {}
    }
    return `${args[0]}: not found`;
  }
}

while (true) {
  const input = await rl.question("$ ");
  const args = input.split(" ");
  const command = args.splice(0, 1)[0];
  if (command === Commands.EXIT) {
    break;
  }
  else if (command === Commands.ECHO) {
    console.log(args.join(" "));
  }
  else if(command === Commands.TYPE) {
    console.log(await type(args));
  }
  else {
    console.log(`${command}: command not found`); // process.stdout.write(command + ": command not found\n");
  }
}
rl.close();