import chalk from "chalk";
import { AtlassianApiError } from "../core/types.js";

export function handleError(err: unknown): never {
  if (err instanceof AtlassianApiError) {
    console.error(chalk.red(`✗ API error ${err.statusCode}: ${err.message}`));
    if (err.data) console.error(chalk.dim(JSON.stringify(err.data, null, 2)));
  } else if (err instanceof Error) {
    console.error(chalk.red(`✗ ${err.message}`));
  }
  process.exit(1);
}

export async function confirm(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}
