export const Commands = {
  EXIT: "exit",
  ECHO: "echo",
  TYPE: "type",
} as const;
type Command = (typeof Commands)[keyof typeof Commands];
const CommandsValues = new Set(Object.values(Commands));

export function isCommand(value: string): value is Command {
  return CommandsValues.has(value as any);
}


export const Redirections = {
  ">": "1>",
  "1>": "1>",
  "2>": "2>",
  ">>": "1>>",
  "1>>": "1>>",
  "2>>": "2>>",
} as const;

// valid redirection operators
type RedirectionKey = keyof typeof Redirections;
// valid redirection values (normalized)
export type Redirection = (typeof Redirections)[RedirectionKey] | null;

export function isRedirectionKey(value: string): value is RedirectionKey {
  return value in Redirections;
}