import { OutputManager } from "./output-manager";
import { parse } from "./parser";
import { isCommand, Commands } from "./constants";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { delimiter, sep } from "node:path";
import { readdir, constants } from "node:fs/promises";
import { access } from "node:fs/promises";

const execFileAsync = promisify(execFile);

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

// command execution. parses input string into arguments and redirection targets
// sets up the Output manager, and dispatches the request to internal handles or 
// external system processes 
export async function executeCommand(line: string) {
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
  } else if (command === Commands.ECHO) {
    await outputManager.print(args.join(" "));
  } else if (command === Commands.TYPE) {
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
  } else {
    const path = await find_path(command); // I'm reusing find_path but should try to run the file directly as this can cause a data race if I assume there are no changes between checking permissions and executing
    if (path) {
      let stdout;
      let stderr;
      try {
        const result = await execFileAsync(command, args);
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err) {
        const e = err as { stdout: string; stderr: string };
        stdout = e.stdout;
        stderr = e.stderr;
      }
      await outputManager.print(stdout, stderr);
    } else {
      await outputManager.print(`${command}: command not found`);
    }
  }
}

if (!process.stdin.isTTY) {
  const onData = (chunk: any) => {
    executeCommand(String(chunk));
    process.stdin.off('data', onData);
  }
  process.stdin.on('data', onData);
}