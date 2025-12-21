import { createInterface } from "readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

while (true) {
  const input = await rl.question("$ ");
  const args = input.split(" ");
  const command = args.splice(0, 1)[0];
  if (command === "exit") {
    break;
  }
  else if (command === "echo") {
    console.log(args.join(" "));
  }
  else {
    console.log(`${command}: command not found`); // process.stdout.write(command + ": command not found\n");
  }
}
rl.close();