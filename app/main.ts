import { readdir } from "node:fs/promises";
import { delimiter} from "node:path"; // delimiter: between paths (; or :). sep:  within paths (\ or /)
import readline from "node:readline";
import { stdin } from "node:process";
import { executeCommand, executePipeline } from "./lib/executor";
import { parseLine } from "./lib/parser";

import { Trie } from "./lib/trie";

class ShellSession {
  commandsTrie: Trie;
  lastStdoutMessage: string;
  inputBuffer: string[];
  constructor() {
    this.commandsTrie = new Trie();
    this.lastStdoutMessage = "";
    this.inputBuffer = [];
  }

  async init() {
    this.commandsTrie.insert("echo");
    this.commandsTrie.insert("exit");
    for (const path of process.env.PATH?.split(delimiter) ?? []) {
      try {
        const files = await readdir(path);
        for (const file of files) {
          // const full_path = `${path}${sep}${file}`; TO DO: check if it's a dir or executable
          this.commandsTrie.insert(file);
        }
      } catch {}
    }

    this.lastStdoutMessage = "";
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (
      chunk: string | Uint8Array,
      ...args: any[]
    ): boolean => {
      this.lastStdoutMessage = chunk.toString();
      return originalWrite(chunk, ...args);
    };
    this.inputBuffer = [];
    process.stdout.write("$ ");

    readline.emitKeypressEvents(stdin);
    // :O the Dual-command pipeline stage gave me a better understanding, TTY means that it's interactive.
    // this means that it's also how we detect if a terminal is in non-interactive mode for piping/filtering
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("keypress", (str, key) => this.handleKeypress(str, key));
  }

  // real time terminal interaction handler
  async handleKeypress(str: string, key: any) {
    // I originally only had "return" and it was a pain finding that the test runner passes "enter"
    if (key.name === "return" || key.name === "enter") {
      process.stdout.write("\n");

      // TODO: handle a single command vs pipeline in a simpler and shared way
      const commands = parseLine(this.inputBuffer.join(""));
      if (commands.length == 1) {
        await executeCommand(this.inputBuffer.join(""));
      } else {
        await executePipeline(commands);
      }
      
      process.stdout.write("$ ");
      this.inputBuffer = [];
    } else if (key.name === "tab") {
      if (this.lastStdoutMessage === "\x07") {
        // print all available commands if the this is the second  tab in a row
        const availableCommands = this.commandsTrie.getPossibleCompletions(
          this.inputBuffer.join(""),
        );
        if (availableCommands.length > 0) {
          availableCommands.sort();
          process.stdout.write("\n");
          process.stdout.write(availableCommands.join("  "));
          process.stdout.write("\n");
          process.stdout.write(`$ ${this.inputBuffer.join("")}`);
        }
      } else {
        // try to autocomplete if this is the first tab press
        let autocompleteString = null;
        const lineString = this.inputBuffer.join("").split(" ");
        const lastWord = lineString.at(-1);
        if (this.inputBuffer.length > 0 && lastWord != undefined) {
          autocompleteString = this.commandsTrie.getCompletion(lastWord);
        }

        // check for matches
        if (autocompleteString === null) {
          process.stdout.write("\x07");
        } else {
          process.stdout.write(autocompleteString);
          this.inputBuffer.push(...autocompleteString);
        }
      }
    } else if (key.name === "backspace") {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer.pop();
        process.stdout.write("\b \b");
      }
    } else if (key.sequence.length === 1) {
      this.inputBuffer.push(str);
      process.stdout.write(str);
    }
  }
}

const session = new ShellSession();
session.init();