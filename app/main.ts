import { createInterface } from "readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

while (true) {
  const command = await rl.question("$ ");
  if (command == "exit") {
    break;
  }
  console.log(`${command}: command not found`); // process.stdout.write(command + ": command not found\n");
}
rl.close();