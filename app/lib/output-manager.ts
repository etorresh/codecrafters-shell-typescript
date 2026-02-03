import {  writeFile, exists, mkdir} from "node:fs/promises";

import type { Redirection } from "./constants";
import { Redirections } from "./constants";
import { sep } from "node:path";

type OutputConfig =
  | [outputType: null, redirectionPath: null]
  | [outputType: Redirection, redirectionPath: string];
export class OutputManager {
  outputConfig: OutputConfig;
  constructor(config: OutputConfig) {
    this.outputConfig = config;
  }

  async print(stdout: string, stderr: string = "") {
    if (stdout === undefined || stderr === undefined) {
      console.log("undefined");
    }
    // interesting article on stdio buffering https://www.pixelbeat.org/programming/stdio_buffering/
    if (stdout.length > 0 && !stdout.endsWith("\n")) {
      stdout += "\n";
    }
    if (stderr.length > 0 && !stderr.endsWith("\n")) {
      stderr += "\n";
    }
    const [outputType, redirectionPath] = this.outputConfig;
    if (outputType === null) {
      process.stdout.write(stdout);
    } else {
      if (!(await exists(redirectionPath))) {
        const path = redirectionPath.split(sep);
        const folderPath = path.slice(0, path.length - 1);
        if (folderPath.length > 0) {
          const folderPathString = folderPath.join(sep);
          await mkdir(folderPathString, { recursive: true });
        }
      }
      let toFile = stdout;
      let toConsole = stderr;
      if (
        outputType === Redirections["2>"] ||
        outputType === Redirections["2>>"]
      ) {
        toFile = stderr;
        toConsole = stdout;
      }
      process.stdout.write(toConsole);
      let writeFlag = "w";
      if (
        outputType === Redirections["1>>"] ||
        outputType === Redirections["2>>"]
      ) {
        writeFlag = "a";
      }
      await writeFile(redirectionPath, toFile, { flag: writeFlag });
    }
  }
}