import { createInterface } from "readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const Commands = {
  EXIT: "exit",
  ECHO: "echo",
  TYPE: "type",
} as const;
const CommandsValues = new Set(Object.values(Commands));

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
    if (CommandsValues.has(command)) {
      console.log(`${args[0]} is a shell builtin`);
    } else {[
      console.log(`${args[0]}: command not found`)
    ]}
  }
  else {
    console.log(`${command}: command not found`); // process.stdout.write(command + ": command not found\n");
  }
}
rl.close();