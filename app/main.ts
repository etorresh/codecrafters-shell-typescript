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
    if (isCommand(args[0])) {
      console.log(`${args[0]} is a shell builtin`);
    } 
    else {
      const paths = process.env.PATH?.split(delimiter) ?? [];
      let foundCommand = false;

      for (const path of paths) {
        if (foundCommand) {
          break;
        }
        try {
          const files = await readdir(path);
          for (const file of files) {
            if (file === args[0]) {
              try {
                const full_path = `${path}${sep}${args[0]}`;
                await access(full_path, constants.X_OK);
                console.log(`${args[0]} is ${full_path}`)
                foundCommand = true;
                break;
              } catch {}
            }
          }
        } catch {}
      }
      if (!foundCommand) {
        console.log(`${args[0]}: not found`)
      }
    }
  }
  else {
    console.log(`${command}: command not found`); // process.stdout.write(command + ": command not found\n");
  }
}
rl.close();