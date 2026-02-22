/**
 * Calculator Skill Handler
 * Uses mathjs for precise mathematical computation.
 */
import { evaluate } from 'mathjs';
import type { SkillHandler } from '../registry.js';

const calculate: SkillHandler = async (args) => {
  const expression = args.expression as string;

  try {
    const result = evaluate(expression);
    const resultStr = typeof result === 'object' && result !== null
      ? result.toString()
      : String(result);

    return JSON.stringify({
      expression,
      result: resultStr,
    });
  } catch (err) {
    return JSON.stringify({
      expression,
      error: `Calculation error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

export const handlers: Record<string, SkillHandler> = {
  calculate,
};
