import { createInterface } from "readline/promises";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// TODO: Uncomment the code below to pass the first stage
const command = await rl.question("$ ");
console.log(`${command}: command not found`)
// process.stdout.write(command + ": command not found\n");
rl.close();